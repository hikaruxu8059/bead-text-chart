const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
function setup(){
 const target=()=>({events:{},addEventListener(name,fn){this.events[name]=fn;}});
 const palette=target();palette.contains=row=>row.connected;
 const c={S:{iso:-1,palette:[{},{}]},el:{palette},document:target(),window:target(),renderCanvas(){}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('  function clearPaletteHighlight'),source.indexOf('  function renderPalette')),c);c.bindPaletteHighlight();
 c.move=(row,options={})=>c.document.events.pointermove({target:{closest:()=>row},buttons:0,pointerType:'mouse',...options});
 return c;
}
test('色卡定位只响应移动，离开或在调整参数时不会残留单色高亮',()=>{
 const c=setup(),row={dataset:{i:'1'},connected:true};
 c.move(row);assert.equal(c.S.iso,1);
 c.document.events.pointerdown();assert.equal(c.S.iso,-1);
 c.move(row,{buttons:1});assert.equal(c.S.iso,-1);
 c.move(row);c.move(null);assert.equal(c.S.iso,-1);
 c.move(row);c.el.palette.events.pointerleave();assert.equal(c.S.iso,-1);
});
test('色卡重建后不使用已移除行或过期索引，失焦清除高亮',()=>{
 const c=setup(),row={dataset:{i:'1'},connected:true};
 c.move(row);row.connected=false;c.move(row);assert.equal(c.S.iso,-1);
 c.move({dataset:{i:'9'},connected:true});assert.equal(c.S.iso,-1);
 row.connected=true;c.move(row);c.window.events.blur();assert.equal(c.S.iso,-1);
 c.move(row,{pointerType:'touch'});assert.equal(c.S.iso,-1);
});
test('图纸识别所有合并强度的格子索引与颜色用量保持完整',()=>{
 const c={window:{}};vm.createContext(c);
 for(const name of ['color','palette','mard-palettes','color-library'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+name+'.js'),'utf8'),c);
 const raw=[];
 for(let i=0;i<768;i++)raw.push([(i*37)%256,(i*17)%256,(i*71)%256]);
 for(let strength=3;strength<=45;strength++){
   const base=c.window.Palette.build(raw,{mode:'thresh',thresh:strength,minCount:1});
   for(const library of [null,c.window.ColorLibrary.builtins.mard221,c.window.ColorLibrary.builtins.mard291]){
     const model=library?c.window.ColorLibrary.match(base,library.colors):base;
     assert.equal(model.cells.length,raw.length);
     const counts=new Array(model.palette.length).fill(0);
     for(const index of model.cells){assert.ok(index>=0&&index<counts.length,`strength ${strength}`);counts[index]++;}
     model.palette.forEach((p,i)=>{assert.equal(p.count,counts[i]);assert.match(p.hex,/^#[0-9a-f]{6}$/i);assert.ok(p.rgb.every(Number.isFinite));});
   }
 }
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
function setup(libraryId='mard221'){
 const c=vm.createContext({window:{},toast(){},ditherEditor:{cancel(){}},revealPaletteCell(){}});
 for(const name of ['color','palette','mard-palettes','color-library'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+name+'.js'),'utf8'),c);
 Object.assign(c,{Color:c.window.Color,Palette:c.window.Palette,ColorLibrary:c.window.ColorLibrary});
 const library=libraryId?c.ColorLibrary.builtins[libraryId]:null;
 c.currentLibrary=()=>library;
 c.S={custom:{merges:[],names:[],paletteHistory:[]},cellEdits:new Map(),selected:new Set(),editUndo:[],editRedo:[]};
 vm.runInContext(app.slice(app.indexOf('  function applyDisplayedMerges'),app.indexOf('  /** 合并 / 改名')),c);
 vm.runInContext(app.slice(app.indexOf('  function applyCellEdits'),app.indexOf('  /* ============================ 渲染')),c);
 const undoBody=app.match(/el\.undoMergeBtn\.addEventListener\('click', function \(\) \{([\s\S]*?)\n    \}\);/)[1];
 c.undo=()=>vm.runInContext('(function(){'+undoBody+'})()',c);
 c.color=key=>library?library.colors.find(p=>p.code===key):{rgb:key.slice(),lab:c.Color.rgbToLab(key),hex:c.Color.hex(key),name:''};
 c.load=(keys,indices)=>{
  c.base={palette:keys.map(key=>({...c.color(key),count:indices.filter(i=>i===keys.indexOf(key)).length})),cells:Int16Array.from(indices)};c.render();
 };
 c.render=c.applyCustomAndRender=()=>{
  const out=c.applyDisplayedMerges(c.base,c.S.custom,library);
  c.S.palette=out.palette.map(p=>({...p}));c.S.cells=out.cells.slice();c.applyCellEdits();c.S.selected.clear();
 };
 c.result=()=>Array.from(c.S.cells,i=>c.S.palette[i].code||c.S.palette[i].hex);
 c.recolor=(positions,key)=>{
  const color=c.color(key);c.S.custom.paletteHistory.push({type:'recolor',sourceCell:positions[0],edits:positions.map(pos=>[pos,c.S.cellEdits.get(pos)||null])});
  positions.forEach(pos=>c.S.cellEdits.set(pos,{code:color.code,lab:color.lab.slice(),rgb:color.rgb.slice()}));c.render();
 };
 c.merge=keys=>{
  c.S.palette.forEach((p,i)=>{if(keys.includes(p.code||p.hex))c.S.selected.add(i);});const result=c.mergeCurrentPalette();c.render();return result;
 };
 return c;
}
for(const id of ['mard221','mard291'])test(id+'：部分格子先换成新色再合并，不被旧改色覆盖，也不影响未选中的原色',()=>{
 const c=setup(id);c.load(['H16','H19','G20'],[0,0,1,2]);
 const original=c.result();c.recolor([0],'C12');const before=c.result();
 const result=c.merge(['C12','H19']);assert.equal(result.count,2);
 const after=c.result();assert.equal(after[0],after[2]);assert.equal(after[1],before[1]);assert.equal(after[3],before[3]);
 assert.equal(c.S.palette.reduce((n,p)=>n+p.count,0),4);
 c.undo();assert.deepEqual(c.result(),before);c.undo();assert.deepEqual(c.result(),original);
});
test('换成已有色后按显示用量混色，连续合并与撤销逐步恢复',()=>{
 const c=setup();c.load(['H16','H19','G20'],[0,0,1,2]);
 const original=c.result();c.recolor([0],'G20');const recolored=c.result();
 c.merge(['G20','H19']);const first=c.result();assert.equal(first[0],first[2]);assert.equal(first[0],first[3]);
 const target=c.S.palette[c.S.cells[0]],rgb=target.rgb.slice();
 const expectedRgb=c.color('G20').rgb.map((v,i)=>Math.round((2*v+c.color('H19').rgb[i])/3));
 const expected=c.ColorLibrary.match({palette:[{lab:c.Color.rgbToLab(expectedRgb)}],cells:new Int16Array([0])},c.currentLibrary().colors).palette[0];
 assert.deepEqual(Array.from(rgb),Array.from(expected.rgb));
 c.merge([...new Set(first)]);assert.equal(new Set(c.result()).size,1);
 c.undo();assert.deepEqual(c.result(),first);c.undo();assert.deepEqual(c.result(),recolored);c.undo();assert.deepEqual(c.result(),original);
});
test('自由配色保留新混合色的精确RGB，连续合并和改色可撤销',()=>{
 const c=setup(null);c.load([[255,0,0],[0,0,255],[0,255,0]],[0,1,2]);
 const original=c.result();c.merge(['#ff0000','#0000ff']);assert.deepEqual(c.result(),['#800080','#800080','#00ff00']);
 c.recolor([2],[128,0,128]);assert.deepEqual(c.result(),['#800080','#800080','#800080']);
 c.undo();assert.deepEqual(c.result(),['#800080','#800080','#00ff00']);
 c.merge(['#800080','#00ff00']);assert.deepEqual(c.result(),['#555555','#555555','#555555']);
 c.undo();assert.deepEqual(c.result(),['#800080','#800080','#00ff00']);c.undo();assert.deepEqual(c.result(),original);
});
test('仅选一个颜色不会写入合并记录',()=>{
 const c=setup();c.load(['H16','H19'],[0,1]);const before=c.result();c.merge(['H16']);
 assert.deepEqual(c.result(),before);assert.equal(c.S.custom.paletteHistory.length,0);
});
test('手动特殊色可以参与合并，合并结果只自动匹配普通色，撤销恢复特殊色',()=>{
 const c=setup('mard291');c.load(['H16','H19','G20'],[0,1,2]);
 c.recolor([0],'P1');c.recolor([2],'Q1');const before=c.result();
 c.merge(['P1','H19']);const after=c.result();
 assert.equal(after[0],after[1]);assert.match(after[0],/^[A-HM]\d+$/);assert.equal(after[2],'Q1');
 c.undo();assert.deepEqual(c.result(),before);
});

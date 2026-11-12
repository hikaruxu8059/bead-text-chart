const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({window:{}});
for(const name of ['color','mard-palettes','color-library','palette','pixel'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+name+'.js'),'utf8'),c);
const {ColorLibrary:L,Color:C,Pixel}=c.window,allowed=p=>/^[A-HM]\d+$/.test(p.code);
const all=L.builtins.mard291.colors,special=all.filter(p=>!allowed(p));
function model(colors){return {palette:colors.map(p=>({...p,count:1})),cells:Int16Array.from(colors.map((_,i)=>i))};}
test('MARD保留完整291色，自动候选恰好221色，特殊系列70色仅供手动选择',()=>{
 assert.equal(all.length,291);assert.equal(all.filter(p=>p.autoMatch).length,221);assert.equal(special.length,70);
 assert.deepEqual([...new Set(special.map(p=>p.code.replace(/\d+$/,'')))].sort(),['P','Q','R','T','Y','ZG']);
 assert.ok(special.every(p=>p.autoMatch===false));assert.ok(L.builtins.mard221.colors.every(p=>p.autoMatch===true));
});
test('即使输入精确等于特殊色RGB，普通和保彩度自动匹配也只输出A-H、M系列',()=>{
 for(const options of [undefined,{preserveChroma:true}]){
  const out=L.match(model(special),all,options);assert.ok(out.palette.every(allowed));assert.equal(out.cells.length,70);
  assert.equal(out.palette.reduce((n,p)=>n+p.count,0),70);
  const regular=all.filter(allowed);
  assert.equal(JSON.stringify(out),JSON.stringify(L.match(model(special),regular,options)));
 }
});
test('量化与像素图聚类的所有路径都排除特殊系列',()=>{
 const raw=special.map(p=>p.rgb.slice()),regular=all.filter(allowed);
 assert.equal(JSON.stringify(L.quantize(raw,all)),JSON.stringify(L.quantize(raw,regular)));
 for(const opts of [{mode:'k',k:24,minCount:1},{mode:'thresh',thresh:3,minCount:1},{cluster:false}]){
  const out=Pixel.build(raw,opts,all);assert.ok(out.palette.every(allowed));assert.equal(out.cells.length,raw.length);
 }
});
test('图纸重匹配及旧合并重放不会重新引入特殊系列',()=>{
 Object.assign(c,{ColorLibrary:L,Palette:c.window.Palette});const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
 vm.runInContext(app.slice(app.indexOf('  function applyDisplayedMerges'),app.indexOf('  /** 合并 / 改名')),c);
 const base=model(special),initial=L.match(base,all);
 const custom={merges:[{keys:initial.palette.slice(0,2).map(p=>p.code)}],names:[]};
 assert.ok(c.applyDisplayedMerges(base,custom,L.builtins.mard291).palette.every(allowed));
});
test('手动指定特殊色仍准确保留色号，不受自动过滤影响',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');Object.assign(c,{Color:C,currentLibrary:()=>L.builtins.mard291});
 const out=L.match(model(special),all);
 c.S={palette:out.palette,cells:out.cells,cellEdits:new Map(special.map((p,i)=>[i,{code:p.code,lab:p.lab.slice()}]))};
 vm.runInContext(app.slice(app.indexOf('  function applyCellEdits'),app.indexOf('  /* ============================ 渲染')),c);c.applyCellEdits();
 assert.deepEqual(Array.from(c.S.cells,i=>c.S.palette[i].code),Array.from(special,p=>p.code));
});
test('普通自定义色库中的P色号不被误当作MARD特殊色',()=>{
 const lib=L.parse(JSON.stringify({name:'自定义',colors:[{code:'P1',hex:'#ff0000'}]}));
 assert.equal(L.match(model(lib.colors),lib.colors).palette[0].code,'P1');
 assert.throws(()=>L.match(model(special),special),/没有可自动匹配/);
});

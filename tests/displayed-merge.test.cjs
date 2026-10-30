const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){
 const c={window:{}};vm.createContext(c);
 for(const f of ['color','palette','mard-palettes','color-library'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+f+'.js'),'utf8'),c);
 Object.assign(c,{Palette:c.window.Palette,ColorLibrary:c.window.ColorLibrary});
 const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
 vm.runInContext(app.slice(app.indexOf('  function applyDisplayedMerges'),app.indexOf('  /** 合并 / 改名')),c);
 return c;
}
test('按显示色号合并所有基础色，连续合并与撤销正确',()=>{
 const c=setup(),C=c.window.Color,library=c.ColorLibrary.builtins.mard221;
 const colors=[[242,238,229],[243,239,230],[27,18,19],[28,19,20],[224,103,122]];
 const base={palette:colors.map(rgb=>({rgb,hex:C.hex(rgb),lab:C.rgbToLab(rgb),count:1,name:''})),cells:new Int16Array([0,1,2,3,4])};
 const initial=c.ColorLibrary.match(base,library.colors);assert.equal(initial.palette.length,3);
 const custom={merges:[{keys:['H19','H16']}],names:[]};
 const merged=c.applyDisplayedMerges(base,custom,library);
 assert.ok(merged.palette.length<initial.palette.length);
 assert.equal(new Set(Array.from(merged.cells).slice(0,4)).size,1);
 custom.merges.push({keys:merged.palette.map(p=>p.code)});
 assert.equal(c.applyDisplayedMerges(base,custom,library).palette.length,1);
 custom.merges.pop();assert.deepEqual(Array.from(c.applyDisplayedMerges(base,custom,library).cells),Array.from(merged.cells));
 custom.merges.pop();assert.deepEqual(Array.from(c.applyDisplayedMerges(base,custom,library).cells),Array.from(initial.cells));
});
test('自由配色按实际颜色合并，不误并未选颜色',()=>{
 const c=setup(),C=c.window.Color;
 const base={palette:[[200,0,0],[210,0,0],[0,0,200]].map(rgb=>({rgb,hex:C.hex(rgb),lab:C.rgbToLab(rgb),count:1,name:''})),cells:new Int16Array([0,1,2])};
 const result=c.applyDisplayedMerges(base,{merges:[{keys:['#c80000','#0000c8']}],names:[]},null);
 assert.equal(result.palette.length,2);assert.equal(result.cells[0],result.cells[2]);assert.notEqual(result.cells[0],result.cells[1]);
});

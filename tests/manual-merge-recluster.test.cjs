const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
function setup(){
 const c={window:{},toast(){c.notified=true;}};vm.createContext(c);
 for(const file of ['color','palette'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+file+'.js'),'utf8'),c);
 const color=(v,count)=>({rgb:[v,v,v],lab:c.window.Color.rgbToLab([v,v,v]),hex:c.window.Color.hex([v,v,v]),count,name:''});
 const before={palette:[color(240,80),color(20,20),color(100,1)],cells:Int16Array.from([...Array(80).fill(0),...Array(20).fill(1),2])};
 const after={palette:[color(240,80),color(20,21)],cells:Int16Array.from([...Array(80).fill(0),...Array(21).fill(1)])};
 c.S={base:before,custom:{merges:[{labs:[before.palette[0].lab,before.palette[2].lab]}],names:[{lab:before.palette[0].lab,name:'底色'}]},showMergeResult:true};
 vm.runInContext(app.slice(app.indexOf('  function replaceAnalysisBase'),app.indexOf('  /** 合并 / 改名')),c);
 return {c,before,after};
}
test('灰色消失后旧合并会错并黑白；重算清除旧记录，黑白保持分离',()=>{
 const {c,after}=setup();
 const broken=c.window.Palette.applyCustom(after.palette,after.cells,c.S.custom);
 assert.equal(broken.palette.length,1);
 c.replaceAnalysisBase(after);
 const fixed=c.window.Palette.applyCustom(after.palette,after.cells,c.S.custom);
 assert.equal(fixed.palette.length,2);assert.equal(c.S.custom.merges.length,0);
 assert.equal(c.S.custom.names[0].name,'底色');assert.equal(c.S.showMergeResult,false);assert.equal(c.notified,true);
 assert.equal(fixed.cells[0],0);assert.equal(fixed.cells[100],1);
});
test('基础色卡未变时保留手动合并，微小中心变化也不能重用旧匹配',()=>{
 const {c,before}=setup();c.replaceAnalysisBase(before);assert.equal(c.S.custom.merges.length,1);assert.equal(c.notified,undefined);
 const next={palette:before.palette.map(p=>({...p,rgb:p.rgb.slice()})),cells:before.cells};
 next.palette[0].rgb[0]--;c.replaceAnalysisBase(next);assert.equal(c.S.custom.merges.length,0);
});

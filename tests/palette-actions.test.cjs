const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
test('合并与撤销互斥展示，重新选色后恢复合并状态',()=>{
 const c=vm.createContext({S:{selected:new Set(),custom:{merges:[],paletteHistory:[]}},el:{mergeBtn:{},undoMergeBtn:{}}});
 vm.runInContext(src.slice(src.indexOf('  function updatePaletteActions'),src.indexOf('  function renderPalette')),c);
 c.updatePaletteActions();assert.equal(c.el.mergeBtn.hidden,false);assert.equal(c.el.mergeBtn.disabled,true);assert.equal(c.el.undoMergeBtn.hidden,true);
 c.S.selected.add(0);c.updatePaletteActions();assert.equal(c.el.mergeBtn.disabled,true);
 c.S.selected.add(1);c.updatePaletteActions();assert.equal(c.el.mergeBtn.disabled,false);
 c.S.selected.clear();c.S.custom.merges.push({});c.S.custom.paletteHistory.push({type:'merge'});c.updatePaletteActions();assert.equal(c.el.mergeBtn.hidden,true);assert.equal(c.el.undoMergeBtn.hidden,false);assert.equal(c.el.undoMergeBtn.disabled,false);
 c.S.selected.add(0);c.updatePaletteActions();assert.equal(c.el.mergeBtn.hidden,false);assert.equal(c.el.mergeBtn.disabled,true);assert.equal(c.el.undoMergeBtn.hidden,true);
 c.S.selected.clear();c.S.custom.merges=[];c.S.custom.paletteHistory=[];c.updatePaletteActions();assert.equal(c.el.mergeBtn.hidden,false);assert.equal(c.el.mergeBtn.disabled,true);
});

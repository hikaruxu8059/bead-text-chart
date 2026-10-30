const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
test('改色撤销重做与新操作分支',()=>{
 const c={S:{editSession:new Map(),editUndo:[],editRedo:[],cellEdits:new Map()},ditherEditor:{cancel(){}},setColorPicking(){},applyCustomAndRender(){}};vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('  function restoreCellEdit'),source.indexOf('  /* ============================ 视图切换')),c);
 c.rememberCellEdit();c.S.cellEdits.set(1,'red');c.restoreCellEdit(false);assert.equal(c.S.cellEdits.size,0);assert.equal(c.S.editRedo.length,1);
 c.restoreCellEdit(true);assert.equal(c.S.cellEdits.get(1),'red');assert.equal(c.S.editRedo.length,0);
 c.restoreCellEdit(false);c.rememberCellEdit();c.S.cellEdits.set(2,'blue');assert.equal(c.S.editRedo.length,0);c.restoreCellEdit(true);assert.equal(c.S.cellEdits.get(2),'blue');
});

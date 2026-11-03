const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
const body=src.match(/el\.undoMergeBtn\.addEventListener\('click', function \(\) \{([\s\S]*?)\n    \}\);/)[1];
test('色卡改色和合并按逆序撤回，恢复原有逐格颜色',()=>{
 const previous={code:'A',lab:[1,2,3]}, S={custom:{merges:[{}],paletteHistory:[{type:'recolor',edits:[[0,previous],[1,null]]},{type:'merge'}]},cellEdits:new Map([[0,{code:'B'}],[1,{code:'B'}]]),editUndo:[],editRedo:[]};
 let renders=0;
 const c=vm.createContext({S,ditherEditor:{cancel(){}},applyCustomAndRender(){renders++},toast(){}});
 vm.runInContext('(function(){'+body+'})()',c);
 assert.equal(S.custom.merges.length,0);assert.equal(S.cellEdits.get(0).code,'B');
 vm.runInContext('(function(){'+body+'})()',c);
 assert.equal(S.cellEdits.get(0),previous);assert.equal(S.cellEdits.has(1),false);assert.equal(renders,2);
 vm.runInContext('(function(){'+body+'})()',c);assert.equal(renders,2);
});

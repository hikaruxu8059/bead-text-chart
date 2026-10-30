const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
function setup(){
 const calls=[];const c={el:{cellEditDialog:{open:true},undoCellEditBtn:{click(){calls.push('undo');}},clearCellSelectionBtn:{click(){calls.push('clear');}},editZoom:{value:'8'},editViewport:{clientWidth:400,clientHeight:200,getBoundingClientRect(){return {left:10,top:20};}}},zoomEditAt(...args){calls.push(args);}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('  function handleEditShortcut'),source.indexOf('  // Keep the image point')),c);
 return {c,calls,key(key,more={}){const e={key,target:{closest:()=>false},preventDefault(){this.prevented=true;},...more};c.handleEditShortcut(e);return e;}};
}
test('Ctrl与Cmd撤销和取消全选，+/-以画布中心缩放',()=>{
 const t=setup();for(const modifier of ['ctrlKey','metaKey']){assert.ok(t.key('z',{[modifier]:true}).prevented);assert.ok(t.key('d',{[modifier]:true}).prevented);}
 t.key('+');t.key('-');assert.deepEqual(t.calls,['undo','clear','undo','clear',[9,210,120],[7,210,120]]);
});
test('输入、组合输入、关闭弹窗和其他组合键不被拦截',()=>{
 const t=setup();for(const more of [{target:{closest:()=>true}},{isComposing:true},{altKey:true},{ctrlKey:true,shiftKey:true}])assert.equal(t.key('z',more).prevented,undefined);
 t.c.el.cellEditDialog.open=false;t.key('+');assert.equal(t.calls.length,0);
});

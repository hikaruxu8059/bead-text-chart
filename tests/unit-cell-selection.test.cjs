const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/app.js'), 'utf8');
function setup(width = 1000, height = 500) {
  const node = () => ({style:{}, classList:{add(){},remove(){}}, handlers:{},
    addEventListener(type, fn){this.handlers[type]=fn;}, setAttribute(){},
    setPointerCapture(){}, releasePointerCapture(){}, hasPointerCapture(){return false;}});
  const el = Object.fromEntries(['unitCellSpan','unitCellSize','rawWrap','rawImg','unitCellBox','selectUnitCellBtn','unitCellHint','cols','rows','keepRatio'].map(k=>[k,node()]));
  el.rawImg.clientWidth=width; el.rawImg.clientHeight=height;
  el.rawImg.getBoundingClientRect=()=>({left:20,top:30,width,height});
  el.keepRatio.checked=true;
  const context={el,S:{img:{naturalWidth:2000,naturalHeight:1000},mode:'chart',scale:1},document:node(),
    debounceTimers:{},clearTimeout(){},setView(){},resetAlign(){},toast(){},analyze(){context.applied=true;}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  var unitCellSelection'), source.indexOf('  function bindPreviewGestures')),context);
  context.bindUnitCellSelection();
  context.drag=(x1,y1,x2,y2)=>{
    el.selectUnitCellBtn.handlers.click();
    const event=(x,y)=>({pointerId:1,button:0,clientX:20+x*width,clientY:30+y*height,preventDefault(){},stopPropagation(){}});
    el.rawWrap.handlers.pointerdown(event(x1,y1));
    el.rawWrap.handlers.pointermove(event(x2,y2));
    context.selectionStyle = {...el.unitCellBox.style};
    el.rawWrap.handlers.pointerup(event(x2,y2));
  };
  return context;
}
test('单位格按原图比例计算，缩放与反向框选不改变行列数',()=>{
  for(const scale of [1,2]) {
    const c=setup(1000*scale,500*scale);
    c.drag(.3,.4,.28,.36);
    assert.equal(c.el.cols.value,50); assert.equal(c.el.rows.value,25);
    assert.equal(c.el.keepRatio.checked,false); assert.equal(c.applied,true);
    assert.equal(c.unitCellSelection,false); assert.equal(c.S.detectedGeom.cellW,40);
  }
});
test('点击或极小选区不修改网格，可继续框选',()=>{
  const c=setup(); c.drag(.2,.2,.201,.201);
  assert.equal(c.applied,undefined); assert.equal(c.unitCellSelection,true);
});
test('Esc 取消框选且不应用',()=>{
  const c=setup();c.el.selectUnitCellBtn.handlers.click();
  c.document.handlers.keydown({key:'Escape',preventDefault(){}} );
  assert.equal(c.unitCellSelection,false);assert.equal(c.applied,undefined);
});

test('非对角拖动与单轴拖动始终生成正方形，四个方向均适用',()=>{
  for(const scale of [1,2]) for(const sx of [-1,1]) for(const sy of [-1,1]) {
    const c=setup(1000*scale,500*scale);
    c.drag(.5,.5,.5+sx*.02,.5+sy*.01);
    assert.ok(Math.abs(parseFloat(c.selectionStyle.width)*1000-parseFloat(c.selectionStyle.height)*500)<1e-8);
    assert.equal(c.el.cols.value,50);assert.equal(c.el.rows.value,25);
  }
  const c=setup();c.drag(.5,.5,.52,.5);
  assert.equal(c.el.cols.value,50);assert.equal(c.el.rows.value,25);
});
test('靠近图像边缘时同时收缩两边，不越界且保持正方形',()=>{
  const c=setup();c.drag(.99,.5,1,.7);
  const box=c.selectionStyle;
  assert.ok(Math.abs(parseFloat(box.width)*1000-parseFloat(box.height)*500)<1e-8);
  assert.ok(parseFloat(box.left)+parseFloat(box.width)<=100+1e-8);
  assert.equal(c.el.cols.value,100);assert.equal(c.el.rows.value,50);
});

test('边长微调保留一位小数，同样行列数下仍更新实际格距',()=>{
  const c=setup();c.drag(.3,.4,.28,.36);
  c.el.unitCellSize.value='40.1';c.el.unitCellSize.handlers.change();
  assert.equal(c.el.unitCellSize.value,'40.1');
  assert.equal(c.el.cols.value,50);assert.equal(c.el.rows.value,25);
  assert.equal(c.S.detectedGeom.cellW,40.1);assert.equal(c.S.detectedGeom.cellH,40.1);
  c.S.scale=.5;c.el.unitCellSize.value='40.25';c.el.unitCellSize.handlers.change();
  assert.equal(c.el.unitCellSize.value,'40.3');assert.equal(c.S.detectedGeom.cellW,20.15);
});
test('边长为空或无效时不替换有效格距',()=>{
  const c=setup();c.drag(.3,.4,.28,.36);
  for(const value of ['', '0', '-1', '0.1', '1001']) {
    c.el.unitCellSize.value=value;c.el.unitCellSize.handlers.change();
    assert.equal(c.S.detectedGeom.cellW,40);
  }
});

test('5×5 和 10×10 校准按格数均分，支持反向与缩放',()=>{
  for(const span of [5,10]) for(const scale of [1,2]) {
    const c=setup(1000*scale,500*scale);c.el.unitCellSpan.value=String(span);
    c.drag(.6,.9,.6-.02*span,.9-.04*span);
    assert.equal(c.el.unitCellSize.value,'40.0');
    assert.equal(c.el.cols.value,50);assert.equal(c.el.rows.value,25);
  }
});
test('多格校准降低相同拖动误差对单位格边长的影响',()=>{
  const one=setup();one.drag(.1,.1,.121,.14);
  const ten=setup();ten.el.unitCellSpan.value='10';ten.drag(.1,.1,.301,.5);
  assert.equal(one.el.unitCellSize.value,'42.0');
  assert.equal(ten.el.unitCellSize.value,'40.2');
});

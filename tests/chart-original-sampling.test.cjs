const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
function setup(){
  const c={window:{},el:{chartSampling:{value:'dominant'}},S:{img:{naturalWidth:4800,naturalHeight:5},src:{width:2400,height:3},geom:{cols:2,rows:1,originX:1,originY:0,cellW:1,cellH:3}}};
  let draws=0;
  const data=new Uint8ClampedArray(4800*5*4);
  for(let y=0;y<5;y++) for(let x=0;x<4800;x++) data.set(x<4?[255,0,0,255]:[0,0,255,255],(y*4800+x)*4);
  c.document={createElement(){
    return {width:0,height:0,getContext(){
      return {
        drawImage(img,...args){assert.deepEqual(args,[0,0]);draws++;},
        getImageData(x,y,w,h){assert.equal(w,4800);assert.equal(h,5);return {width:w,height:h,data};}
      };
    }};
  }};
  vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/grid.js'),'utf8'),c);c.Grid=c.window.Grid;
  vm.runInContext(app.slice(app.indexOf('  function sampleOriginalChart'),app.indexOf('  function resetAlign')),c);
  return {c,draws:()=>draws};
}
test('缩略图网格映射到原图，中心颜色不经过缩放混合，读取结果缓存',()=>{
  const {c,draws}=setup();
  const result=c.sampleOriginalChart();
  assert.deepEqual(JSON.parse(JSON.stringify(result)),[[255,0,0],[0,0,255]]);
  c.sampleOriginalChart();assert.equal(draws(),1);
  c.S.originalImgData=null;c.sampleOriginalChart();assert.equal(draws(),2);
});
test('宽高分别映射，保留原点偏移与非整数格距',()=>{
  const {c}=setup();let actual;
  c.Grid={sample(data,w,h,g){actual={w,h,g};return [];}};
  c.S.geom={cols:10,rows:2,originX:2.5,originY:.6,cellW:3.25,cellH:1.2};
  c.sampleOriginalChart();
  assert.equal(actual.g.originX,5);assert.equal(actual.g.originY,1);
  assert.equal(actual.g.cellW,6.5);assert.equal(actual.g.cellH,2);
  assert.equal(actual.w,4800);assert.equal(actual.h,5);
});

test('中心取色也使用原图，并传递所选方法',()=>{
  const {c}=setup();c.el.chartSampling.value='center';
  assert.deepEqual(JSON.parse(JSON.stringify(c.sampleOriginalChart())),[[255,0,0],[0,0,255]]);
  let method;c.Grid={sample(data,w,h,g,inset,m){method=m;return [];}};
  c.sampleOriginalChart();assert.equal(method,'center');
});

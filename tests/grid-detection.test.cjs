const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/grid.js'),'utf8'),c);const Grid=c.window.Grid;
function art(cols,rows,sx,sy){
 const w=Math.round(cols*sx),h=Math.round(rows*sy),data=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const col=Math.floor(x/sx),row=Math.floor(y/sy),v=(col*79+row*173+col*row*13)%256;
  data.set([v,(v*7)%256,(v*3)%256,255],(y*w+x)*4);
 }
 return {data,w,h};
}
test('缩放像素画识别小于5px的基础格距，避免误判成两倍',()=>{
 for(const [cols,rows,sx,sy] of [[120,70,3.27,3.26],[128,64,2.875,2.875],[100,60,4,4]]){
  const a=art(cols,rows,sx,sy),g=Grid.detect(a.data,a.w,a.h);assert.ok(g);
  assert.ok(Math.abs(g.cellW-sx)<.035,JSON.stringify(g));assert.ok(Math.abs(g.cellH-sy)<.035,JSON.stringify(g));
  assert.ok(Math.abs(g.cols-cols)<=1);assert.ok(Math.abs(g.rows-rows)<=1);
 }
});
test('有格线的8px图纸不会被谐波误切成小格',()=>{
 const w=320,h=240,d=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const v=x%8===0||y%8===0?0:240;d.set([v,v,v,255],(y*w+x)*4);
 }
 const g=Grid.detect(d,w,h);assert.ok(g);assert.ok(Math.abs(g.cellW-8)<.15,JSON.stringify(g));
});
test('纯色图像不虚构像素网格',()=>{
 const d=new Uint8ClampedArray(100*100*4).fill(255);assert.equal(Grid.detect(d,100,100),null);
});

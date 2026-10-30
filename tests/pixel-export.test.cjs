const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({window:{},Blob});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/pixel-export.js'),'utf8'),context);
const {dimensions,shareSize}=context.window.PixelExport;
test('分享图按整数格放大，保持比例，标准高清均在导出上限内',()=>{
 for(const [cols,rows] of [[52,104],[104,52],[52,52],[600,600],[1,600]])for(const target of [2400,4800]){
  const s=shareSize(cols,rows,target);
  assert.equal(s.width/cols,s.height/rows);assert.ok(Number.isInteger(s.width/cols));
  assert.ok(Math.abs(Math.max(s.width,s.height)-target)<=Math.max(cols,rows)/2);
  assert.ok(s.width<=8192&&s.height<=8192&&s.width*s.height<=32000000);
 }
});
test('打印按格子毫米大小和300DPI换算',()=>{
 const s=dimensions(52,104,2.6,300);assert.equal(s.width,1597);assert.equal(s.height,3194);
 const half=dimensions(52,104,1.3,300);assert.equal(half.width,798);assert.equal(half.height,1597);
});
test('分享画布包含编号与色卡，完整尺寸受上限约束',()=>{
 const {shareLayout}=context.window.PixelExport;
 for(const [cols,rows,count] of [[52,104,12],[104,104,46],[600,600,221]]) for(const target of [2400,4800]) {
  const l=shareLayout(cols,rows,target,count);
  assert.ok(l.width<=8192&&l.height<=8192&&l.width*l.height<=32000000);
  assert.ok(l.width>=l.patternWidth+2*l.y);
  assert.ok(l.height>l.patternHeight+2*l.y);
  assert.equal(l.patternWidth/cols,l.scale);assert.equal(l.patternHeight/rows,l.scale);
 }
 const l=shareLayout(52,104,2400,0);assert.equal(l.height,l.patternHeight+2*l.y);
});

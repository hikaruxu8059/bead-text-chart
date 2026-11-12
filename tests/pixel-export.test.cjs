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
test('A4/A3按纸张和页边距分张，完整覆盖所有格子且不改变格子实际尺寸',()=>{
 const {printPlan}=context.window.PixelExport;
 for(const paper of ['a4','a3'])for(const orientation of ['portrait','landscape','auto'])for(const margin of [0,5,12.5]) {
  const cols=127,rows=113,mm=4.1,p=printPlan(cols,rows,mm,{paper,orientation,margin});assert.ok(p);
  const paperSize=paper==='a4'?[210,297]:[297,420];
  assert.equal(p.widthMm,paperSize[p.orientation==='portrait'?0:1]);
  assert.equal(p.heightMm,paperSize[p.orientation==='portrait'?1:0]);
  if(orientation!=='auto')assert.equal(p.orientation,orientation);
  const covered=new Uint8Array(cols*rows);let count=0;
  for(let row=0;row<rows;row+=p.rows)for(let col=0;col<cols;col+=p.cols){
   const width=Math.min(p.cols,cols-col),height=Math.min(p.rows,rows-row),s=dimensions(width,height,mm,300);
   assert.ok(width*mm<=p.widthMm-2*margin+1e-8);assert.ok(height*mm<=p.heightMm-2*margin+1e-8);
   const paperPixels=dimensions(p.widthMm,p.heightMm,1,300);
   assert.ok(s.width<=paperPixels.width&&s.height<=paperPixels.height);
   assert.ok(s.width<=8192&&s.height<=8192&&s.width*s.height<=32000000);
   assert.ok(Math.abs(s.width/300*25.4-width*mm)<=25.4/600+1e-8);
   for(let y=row;y<row+height;y++)for(let x=col;x<col+width;x++)covered[y*cols+x]++;
   count++;
  }
  assert.equal(count,p.count);assert.ok(covered.every(n=>n===1));
 }
 assert.equal(printPlan(52,104,2.6).count,1);
 assert.equal(printPlan(600,600,0),null);assert.equal(printPlan(2,2,1000),null);
 assert.equal(printPlan(1,1,2,{paper:'a5'}),null);assert.equal(printPlan(1,1,2,{margin:105}),null);
 assert.equal(printPlan(1,1,2,{margin:-1}),null);
});
test('自动方向使用张数较少的纸张方向，精确边界不多切一张',()=>{
 const {printPlan}=context.window.PixelExport;
 assert.equal(printPlan(100,50,2.6,{paper:'a4',orientation:'auto'}).orientation,'landscape');
 assert.equal(printPlan(100,50,2.6,{paper:'a4',orientation:'auto'}).count,1);
 for(const paper of ['a4','a3'])for(const [cols,rows,mm] of [[600,600,2.6],[1,600,2.6],[600,1,2.6],[104,185,10]]){
  const auto=printPlan(cols,rows,mm,{paper}),portrait=printPlan(cols,rows,mm,{paper,orientation:'portrait'}),landscape=printPlan(cols,rows,mm,{paper,orientation:'landscape'});
  assert.equal(auto.count,Math.min(portrait.count,landscape.count));
 }
 const exact=printPlan(80,112,2.5,{paper:'a4',orientation:'portrait',margin:5});assert.equal(exact.count,1);assert.equal(exact.cols,80);
 assert.equal(printPlan(81,112,2.5,{paper:'a4',orientation:'portrait',margin:5}).count,2);
});

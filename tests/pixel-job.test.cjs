const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){const workers=[];class Worker{constructor(url){this.url=url;workers.push(this);}postMessage(message,transfer){this.message=structuredClone(message,{transfer});this.transfer=transfer;}terminate(){this.terminated=true;}}const ctx=vm.createContext({window:{},Worker});vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/pixel-job.js'),'utf8'),ctx);return {job:ctx.window.PixelJob,workers};}
test('新计算取消旧计算，迟到结果不覆盖新结果，完成后释放线程',async()=>{const {job,workers}=setup(),data=new Uint8ClampedArray([1,2,3,4]);const old=job.run({data}),rejected=assert.rejects(old,{name:'AbortError'});const current=job.run({data});await rejected;assert.equal(workers[0].terminated,true);workers[0].onmessage({data:{result:'stale'}});workers[1].onmessage({data:{result:'current'}});assert.equal(await current,'current');assert.equal(workers[1].terminated,true);assert.notEqual(workers[1].transfer[0],data.buffer);assert.deepEqual(Array.from(workers[1].message.data),Array.from(data));assert.equal(data.byteLength,4);job.cancel();});
test('取消与线程错误正常结束承诺，下一次任务仍可启动',async()=>{const {job,workers}=setup();const p=job.run({data:new Uint8ClampedArray(4)}),rejection=assert.rejects(p,{name:'AbortError'});job.cancel();await rejection;const failed=job.run({data:new Uint8ClampedArray(4)}),failedCheck=assert.rejects(failed,/bad image/);workers[1].onmessage({data:{error:'bad image'}});await failedCheck;assert.equal(workers[1].terminated,true);const next=job.run({data:new Uint8ClampedArray(4)});workers[2].onmessage({data:{result:42}});assert.equal(await next,42);});

test('离线包与源模块同步，避免本地打开时使用旧算法',()=>{
  const {bundle}=require('../scripts/build-pixel-worker.cjs');
  assert.equal(fs.readFileSync(path.join(__dirname,'../js/pixel-worker-bundle.js'),'utf8'),bundle());
});

function offlineSetup(){
  const workers=[],scripts=[],revoked=[];
  class Worker{constructor(url){this.url=url;workers.push(this);}postMessage(message,transfer){this.message=structuredClone(message,{transfer});}terminate(){this.terminated=true;}}
  const window={location:{protocol:'file:'}};
  const ctx=vm.createContext({window,Worker,Blob,URL:{createObjectURL:()=> 'blob:offline',revokeObjectURL:url=>revoked.push(url)},document:{createElement:()=>({remove(){}}),head:{appendChild:script=>scripts.push(script)}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/pixel-job.js'),'utf8'),ctx);
  return {window,job:window.PixelJob,workers,scripts,revoked};
}
test('file 页面只加载一次离线包，加载期间取消旧任务，完成后释放 Blob',async()=>{
  const {window,job,workers,scripts,revoked}=offlineSetup(),data=new Uint8ClampedArray([1,2,3,255]);
  const first=job.run({data}),cancelled=assert.rejects(first,{name:'AbortError'});
  const second=job.run({data});await cancelled;
  assert.equal(scripts.length,1);assert.equal(workers.length,0);
  window.PixelWorkerSource='self.onmessage=function(){};';scripts[0].onload();await Promise.resolve();
  assert.equal(workers.length,1);assert.equal(workers[0].url,'blob:offline');
  workers[0].onmessage({data:{result:123}});assert.equal(await second,123);
  assert.deepEqual(revoked,['blob:offline']);assert.equal(data.byteLength,4);
});
test('离线包加载失败可重试，主动取消仍释放 Blob',async()=>{
  const {window,job,workers,scripts,revoked}=offlineSetup();
  const first=job.run({data:new Uint8ClampedArray(4)}),failed=assert.rejects(first,/加载失败/);
  scripts[0].onerror();await failed;
  const second=job.run({data:new Uint8ClampedArray(4)}),cancelled=assert.rejects(second,{name:'AbortError'});
  assert.equal(scripts.length,2);window.PixelWorkerSource='source';scripts[1].onload();await Promise.resolve();
  job.cancel();await cancelled;assert.equal(workers[0].terminated,true);assert.deepEqual(revoked,['blob:offline']);
});

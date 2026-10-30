const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const ctx=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/dither.js'),'utf8'),ctx);const mix=ctx.window.BeadDither.mix;
test('半透明中间色形成规则棋盘格',()=>{for(let y=0;y<8;y++)for(let x=0;x<8;x++)assert.equal(mix([128,128,128],[0,0,0],[255,255,255],0,x,y),(x+y)%2===0);});
test('双色比例随浓度和调整值增加，端点为纯色',()=>{
 const count=(rgb,bias=0)=>Array.from({length:16},(_,i)=>mix([rgb,rgb,rgb],[0,0,0],[255,255,255],bias,i%4,Math.floor(i/4))).filter(Boolean).length;
 assert.equal(count(0),0);assert.equal(count(255),16);assert.equal(count(64),4);assert.equal(count(128),8);assert.equal(count(192),12);assert.equal(count(128,-25),4);assert.equal(count(128,25),12);
});
test('明暗反向和彩色混合均按两色比例排列',()=>{
 assert.equal(mix([128,128,128],[255,255,255],[0,0,0],0,0,0),true);
 assert.equal(mix([200,125,100],[250,200,150],[150,50,50],0,1,0),false);
 assert.equal(mix([20,20,20],[20,20,20],[20,20,20],0,0,0),false);
});

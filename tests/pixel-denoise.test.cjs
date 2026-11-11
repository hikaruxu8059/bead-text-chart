const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const context = vm.createContext({ window: {} });
for (const name of ['color', 'pixel', 'pixel-denoise']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8'), context);
const { Pixel } = context.window;
const plain = x => JSON.parse(JSON.stringify(x));

test('去杂色保留原版对不同底色交界的连续笔画选择，不修改原图', () => {
  const data=new Uint8ClampedArray(64*64*4);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const boundary=y>=20&&y<32?19:26;
    const stroke=Math.abs(x-boundary)<=1 || ((y===20||y===31)&&x>=19&&x<=27);
    const rgb=stroke?[25,20,20]:x<boundary?[245,230,210]:[220,160,100];
    data.set([...rgb,255],(y*64+x)*4);
  }
  const raw=Pixel.sample(data,64,64,8,8,'lines');
  const copy=data.slice(),saved=plain(raw);
  const cleaned=context.window.PixelDenoise.clean(raw,data,64,64,8,8);
  for(let i=0;i<raw.length;i++)if(raw.lineMask[i])assert.deepEqual(plain(cleaned[i]),plain(raw[i]));
  assert.deepEqual(plain(raw),saved);
  assert.deepEqual(data,copy);
});

test('开启去杂色后实心主体的纸张碎点不把内部切成孔洞', () => {
  const data=new Uint8ClampedArray(96*96*4);
  for(let y=0;y<96;y++)for(let x=0;x<96;x++){
    const inside=((x-48)/30)**2+((y-48)/35)**2<1;
    const speck=x>=32&&x<64&&y>=32&&y<64&&x%8>=4&&x%8<=5&&y%8>=4&&y%8<=5;
    const v=inside&&!speck?25:235;
    data.set([v,v,v,255],(y*96+x)*4);
  }
  const copy=data.slice(),raw=Pixel.sample(data,96,96,12,12,'lines');
  const out=context.window.PixelDenoise.clean(raw,data,96,96,12,12);
  for(let y=4;y<8;y++)for(let x=4;x<8;x++)assert.ok(out[y*12+x][0]<60,'主体内部不能由碎点生成空洞 '+x+','+y);
  assert.deepEqual(data,copy);
});

test('可选去杂色压缩均匀底色的近似色，同时保留连续深色线与高反差圆点',()=>{
  const data=new Uint8ClampedArray(64*64*4);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const ink=x===25||Math.hypot(x-51,y-35)<3;
    const noise=((x*13+y*7)%9)-4;
    data.set(ink?[20,20,20,255]:[120+noise*2,150+noise*2,170+noise*2,255],(y*64+x)*4);
  }
  const raw=Pixel.sample(data,64,64,8,8,'lines'),saved=plain(raw),clean=context.window.PixelDenoise.clean(raw,data,64,64,8,8);
  for(let i=0;i<raw.length;i++)if(raw[i][0]<50)assert.deepEqual(plain(clean[i]),plain(raw[i]));
  const colors=a=>new Set(a.filter(c=>c[0]>50).map(c=>c.join(','))).size;
  assert.ok(colors(clean)<colors(raw));
  assert.deepEqual(plain(raw),saved);
});

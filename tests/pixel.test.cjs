const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ window: {} });
for (const file of ['color', 'mard-palettes', 'color-library', 'pixel', 'palette', 'textchart']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + file + '.js'), 'utf8'), context);
}
const { Pixel, Palette, TextChart, ColorLibrary } = context.window;
const rgba = (...pixels) => new Uint8ClampedArray(pixels.flat());
const plain = value => JSON.parse(JSON.stringify(value));

test('缩小图片时整格取平均，保留边缘而非只采中心', () => {
  const raw = Pixel.sample(rgba([255, 0, 0, 255], [0, 0, 255, 255]), 2, 1, 1, 1);
  assert.deepEqual(plain(raw), [[127.5, 0, 127.5]]);
});

test('非整数边界按覆盖面积混色，放大时不丢格', () => {
  const data = rgba([255, 0, 0, 255], [0, 0, 255, 255]);
  const raw = Pixel.sample(data, 2, 1, 3, 1);
  const expected = [[255, 0, 0], [127.5, 0, 127.5], [0, 0, 255]];
  raw.forEach((rgb, i) => rgb.forEach((v, j) => assert.ok(Math.abs(v - expected[i][j]) < 1e-9)));
});

test('透明与半透明像素合成白底', () => {
  const raw = Pixel.sample(rgba([0, 0, 0, 0], [255, 0, 0, 128]), 2, 1, 2, 1);
  assert.deepEqual(plain(raw), [[255, 255, 255], [255, 127, 127]]);
});

test('主体色取样避免清晰黑白斜边生成灰色过渡格', () => {
  const pixels = [];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const v = x + y < 31 ? 0 : 255;
    pixels.push([v,v,v,255]);
  }
  const data = rgba(...pixels), original = data.slice();
  const average = Pixel.sample(data,32,32,8,8,'average');
  const dominant = Pixel.sample(data,32,32,8,8,'dominant');
  assert.ok(average.some(rgb=>rgb[0]>0&&rgb[0]<255));
  assert.ok(dominant.every(rgb=>rgb.every(v=>v===0)||rgb.every(v=>v===255)));
  const opts={mode:'thresh',thresh:3,minCount:1};
  assert.ok(Pixel.build(average,opts,null).palette.length>2);
  assert.equal(Pixel.build(dominant,opts,null).palette.length,2);
  assert.deepEqual(data,original);
});

test('主体色按实际覆盖面积投票，非整数格子边界不按像素个数误选', () => {
  const data=rgba([255,0,0,255],[255,0,0,255],[0,0,255,255]);
  assert.deepEqual(plain(Pixel.sample(data,3,1,2,1,'dominant')),[[255,0,0],[0,0,255]]);
});

test('主体色归桶处理轻微色差，代表色来自原始像素而非两色平均', () => {
  const raw=[[240,0,0,255],[241,0,0,255],[0,0,255,255]];
  const rgb=Pixel.sample(rgba(...raw),3,1,1,1,'dominant')[0];
  assert.deepEqual(plain(rgb),[241,0,0]);
  assert.ok(raw.some(p=>p.slice(0,3).every((v,k)=>v===rgb[k])));
});

test('主体色在透明底与放大网格中仍可取样，不引入黑底或混合色', () => {
  const data=rgba([0,0,0,0],[255,0,0,255]);
  const raw=Pixel.sample(data,2,1,7,3,'dominant');
  assert.equal(raw.length,21);
  assert.ok(raw.every(rgb=>rgb[0]===255 && ((rgb[1]===255&&rgb[2]===255)||(rgb[1]===0&&rgb[2]===0))));
});

function lineFixture(predicate, background=[240,110,170], stroke=[45,80,200]) {
  const pixels=[];
  for(let y=0;y<32;y++) for(let x=0;x<32;x++) pixels.push([...(predicate(x,y)?stroke:background),255]);
  return rgba(...pixels);
}

test('细线保留找回仅占格子1/8的连续彩色线，聚类后仍可保留', () => {
  const data=lineFixture(x=>x===10), snapshot=data.slice();
  const dominant=Pixel.sample(data,32,32,4,4,'dominant');
  const lines=Pixel.sample(data,32,32,4,4,'lines');
  assert.equal(dominant.filter(rgb=>rgb[2]>rgb[0]).length,0);
  assert.equal(lines.filter(rgb=>rgb[2]>rgb[0]).length,4);
  assert.equal(lines.retainedLineCells,4);
  const out=Pixel.build(lines,{mode:'thresh',thresh:12,minCount:3},ColorLibrary.builtins.mard221.colors);
  assert.equal(out.palette.length,2);
  assert.equal(out.retainedLineCells,4);
  assert.deepEqual(data,snapshot);
});

test('跨格边界的同一细线抑制重复选取，不扩成两列', () => {
  const data=lineFixture(x=>x===7||x===8);
  const out=Pixel.sample(data,32,32,4,4,'lines');
  for(let r=0;r<4;r++) assert.equal(out.slice(r*4,r*4+4).filter(rgb=>rgb[2]>rgb[0]).length,1);
});

test('孤立噪点和大色块边界不被当成细线，纯色不变暗', () => {
  for(const predicate of [(x,y)=>x===10&&y===10,(x)=>x<10,()=>false]) {
    const data=lineFixture(predicate);
    const dominant=Pixel.sample(data,32,32,4,4,'dominant');
    const lines=Pixel.sample(data,32,32,4,4,'lines');
    assert.deepEqual(plain(lines),plain(dominant));
    assert.equal(lines.retainedLineCells,0);
  }
});

test('细线保留不依赖深浅，也能保留亮色线条', () => {
  const out=Pixel.sample(lineFixture(x=>x===10,[30,50,130],[255,220,40]),32,32,4,4,'lines');
  assert.equal(out.filter(rgb=>rgb[0]===255&&rgb[1]===220).length,4);
  assert.ok(out.every(rgb=>rgb.every((v,k)=>v===[30,50,130][k])||rgb.every((v,k)=>v===[255,220,40][k])));
});

test('斜向细线至少形成贯通输出列的相邻像素链', () => {
  const out=Pixel.sample(lineFixture((x,y)=>Math.abs(y-(x*.5+4))<1),32,32,4,4,'lines');
  const selected=Array.from(out,(rgb,i)=>rgb[2]>rgb[0]?i:-1).filter(i=>i>=0);
  for(let c=0;c<4;c++) assert.ok(selected.some(i=>i%4===c),'missing column '+c);
  const seen=new Set([selected[0]]), pending=[selected[0]];
  while(pending.length){const i=pending.pop();for(const j of selected){if(!seen.has(j)&&Math.abs(i%4-j%4)<=1&&Math.abs(Math.floor(i/4)-Math.floor(j/4))<=1){seen.add(j);pending.push(j);}}}
  assert.equal(seen.size,selected.length);
});

test('像素图可继续生成色卡、用量与串珠顺序', () => {
  const data = rgba([255, 0, 0, 255], [0, 0, 255, 255], [255, 0, 0, 255], [0, 0, 255, 255]);
  const raw = Pixel.sample(data, 2, 2, 2, 2);
  const model = { cols: 2, rows: 2, ...Palette.build(raw, { mode: 'k', k: 2, minCount: 1 }) };
  assert.equal(model.palette.length, 2);
  assert.equal(model.palette.reduce((sum, p) => sum + p.count, 0), 4);
  model.palette.forEach((p, i) => { p.name = '颜色' + i; });
  const text = TextChart.build(model, { colDir: 'ltr', rowDir: 'btt', perCol: true });
  assert.match(text, /\*\*第1列\*\*：2个颜色/);
  assert.match(text, /合计 \*\*4\*\* 颗/);
});

test('色库匹配输出精确库内 RGB，合并相同色号并保持总用量', () => {
  const library = ColorLibrary.parse(JSON.stringify({name: '测试色库', colors: [
    {code: 'A01', name: '红', hex: '#ff0000'}, {code: 'A02', name: '蓝', hex: '#0000ff'}
  ]}));
  const base = Palette.build([[250, 0, 0], [225, 10, 5], [0, 0, 250]], {mode: 'thresh', thresh: 3, minCount: 1});
  const result = ColorLibrary.match(base, library.colors);
  assert.equal(result.palette.length, 2);
  result.palette.forEach(p => assert.deepEqual(plain(p.rgb), plain(library.colors.find(c => c.code === p.code).rgb)));
  assert.equal(result.palette.reduce((n, p) => n + p.count, 0), 3);
  const text = TextChart.build({cols: 3, rows: 1, ...result}, {colDir: 'ltr', rowDir: 'btt'});
  assert.match(text, /1个A01/);
  assert.match(TextChart.toCSV({cols: 3, rows: 1, ...result}), /A02/);
});

test('色库导入拒绝重复色号、非法 HEX 和空色库', () => {
  assert.throws(() => ColorLibrary.parse('{'), /JSON/);
  assert.throws(() => ColorLibrary.parse(JSON.stringify({name: '测试', colors: []})), /1–512/);
  assert.throws(() => ColorLibrary.parse(JSON.stringify({name: '测试', colors: [{code: 'A', hex: '#fff'}]})), /RRGGBB/);
  assert.throws(() => ColorLibrary.parse(JSON.stringify({name: '测试', colors: [{code: 'A', hex: '#ffffff'}, {code: 'A', hex: '#000000'}]})), /重复/);
});

test('相近原色先合并，避免跨色卡匹配边界时被放大为杂色', () => {
  const library = ColorLibrary.parse(JSON.stringify({name:'黑白',colors:[{code:'B',hex:'#000000'},{code:'W',hex:'#ffffff'}]})).colors;
  const raw = [[110,110,110],[130,130,130]], snapshot = JSON.stringify(raw);
  assert.equal(new Set(ColorLibrary.quantize(raw, library).map(p=>p.join(','))).size,2);
  const model = Pixel.build(raw,{mode:'thresh',thresh:12,minCount:1},library);
  assert.equal(model.palette.length,1);
  assert.equal(model.cells[0],model.cells[1]);
  assert.equal(model.palette.reduce((n,p)=>n+p.count,0),2);
  assert.equal(JSON.stringify(raw),snapshot);
  assert.ok(model.palette.every(p=>library.some(c=>c.code===p.code&&c.hex===p.hex)));
});

test('自由配色无聚类时可量化到有限色板，固定色数时保持用量和上限', () => {
  const raw = [[120,131,140],[254,2,30],[120,131,140]];
  const quantized = ColorLibrary.quantize(raw,null);
  quantized.forEach(rgb=>rgb.forEach(v=>assert.equal(v%17,0)));
  assert.deepEqual(plain(quantized[0]),[119,136,136]);
  const result = Pixel.build(raw,{mode:'k',k:2,minCount:1},null);
  assert.ok(result.palette.length<=2);
  assert.equal(result.cells.length,3);
  assert.equal(result.palette.reduce((n,p)=>n+p.count,0),3);
});

test('MARD 按固定色数聚类后匹配，保留库内 RGB 与正确用量', () => {
  const library = ColorLibrary.builtins.mard221.colors;
  const raw = library.filter(p=>['A5','B8','C8','F15','H1','H7'].includes(p.code)).map(p=>p.rgb.slice());
  const result = Pixel.build(raw,{mode:'k',k:2,minCount:1},library);

  assert.equal(result.palette.length,2);
  const final = ColorLibrary.match(result,library);
  assert.ok(final.palette.length<=2);
  assert.equal(final.palette.reduce((n,p)=>n+p.count,0),6);
  final.palette.forEach(p=>assert.ok(library.some(c=>c.code===p.code&&c.hex===p.hex)));
});

test('MARD 两版本色号完整、唯一，白黑锚点正确且保留来源版本差异', () => {
  for (const [id, count] of [['mard221', 221], ['mard291', 291]]) {
    const colors = ColorLibrary.builtins[id].colors;
    assert.equal(colors.length, count);
    assert.equal(new Set(colors.map(p => p.code)).size, count);
    assert.equal(colors.find(p => p.code === (id === 'mard221' ? 'H1' : 'H2')).hex, '#ffffff');
    assert.equal(colors.find(p => p.code === 'H7').hex, '#010101');
    colors.forEach(p => assert.ok(p.rgb.every(v => v >= 0 && v <= 255)));
  }
  assert.notEqual(ColorLibrary.builtins.mard221.colors.find(p => p.code === 'A5').hex,
    ColorLibrary.builtins.mard291.colors.find(p => p.code === 'A5').hex);
});





test('平衡模式以平均为底，仅在线条格按强度插值，不影响其他过渡', () => {
  const data=lineFixture(x=>x===10), original=data.slice();
  const average=Pixel.sample(data,32,32,4,4,'average');
  const soft=Pixel.sample(data,32,32,4,4,'balanced',0);
  const mid=Pixel.sample(data,32,32,4,4,'balanced',65);
  const full=Pixel.sample(data,32,32,4,4,'balanced',100);
  assert.deepEqual(plain(soft),plain(average));
  assert.equal(soft.retainedLineCells,0);
  assert.equal(mid.retainedLineCells,4);
  for(let i=0;i<16;i++) for(let k=0;k<3;k++) {
    assert.ok(Math.abs(mid[i][k]-(average[i][k]+(full[i][k]-average[i][k])*.65))<1e-9);
    if(i%4!==1) assert.equal(mid[i][k],average[i][k]);
    else assert.equal(full[i][k],[45,80,200][k]);
  }
  const out=Pixel.build(mid,{mode:'thresh',thresh:12,minCount:3},ColorLibrary.builtins.mard221.colors);
  assert.equal(out.palette.length,2);
  assert.equal(out.palette.reduce((n,p)=>n+p.count,0),16);
  assert.equal(out.retainedLineCells,4);
  assert.deepEqual(data,original);
});

test('平衡模式保留普通边界的平均过渡，支持亮线及强度边界', () => {
  const edge=lineFixture(x=>x<10);
  assert.deepEqual(plain(Pixel.sample(edge,32,32,4,4,'balanced')),plain(Pixel.sample(edge,32,32,4,4,'average')));
  const bright=lineFixture(x=>x===10,[30,50,130],[255,220,40]);
  const full=Pixel.sample(bright,32,32,4,4,'balanced',100);
  const mid=Pixel.sample(bright,32,32,4,4,'balanced');
  assert.equal(full.filter(rgb=>rgb[0]===255).length,4);
  assert.deepEqual(plain(mid),plain(Pixel.sample(bright,32,32,4,4,'balanced',65)));
  assert.deepEqual(plain(full),plain(Pixel.sample(bright,32,32,4,4,'balanced',200)));
  assert.deepEqual(plain(Pixel.sample(bright,32,32,4,4,'balanced',-1)),plain(Pixel.sample(bright,32,32,4,4,'average')));
});

test('色库没有原色时仍为每格选择 Lab 最近色，极大色差也不留空', () => {
  const library=ColorLibrary.builtins.gray.colors;
  const raw=[[255,0,255],[0,255,0],[10,110,245],[250,30,0]];
  const out=ColorLibrary.match(Pixel.build(raw,{cluster:false},library),library);
  raw.forEach((rgb,i)=>{
    const lab=context.window.Color.rgbToLab(rgb);
    const nearest=library.reduce((a,b)=>context.window.Color.deltaE(lab,a.lab)<=context.window.Color.deltaE(lab,b.lab)?a:b);
    assert.equal(out.palette[out.cells[i]].code,nearest.code);
  });
  assert.equal(out.palette.reduce((n,p)=>n+p.count,0),raw.length);
  assert.ok(Array.from(out.cells).every(i=>out.palette[i]));
});


test('旧保护设置不再补回颜色，固定色数及用量在两版 MARD 和自由配色下正确', () => {
  const raw = Array.from({length:160}, (_,i)=>[(i*47)%256,(i*83)%256,(i*131)%256]);
  raw.lineMask = new Uint8Array(raw.length).fill(1);
  for(const library of [null,ColorLibrary.builtins.mard221.colors,ColorLibrary.builtins.mard291.colors]) {
    for(const k of [2,19]) {
      const options={mode:'k',k,minCount:1};
      const out=Pixel.build(raw,options,library);
      assert.deepEqual(plain(Pixel.build(raw,{...options,protectDetails:true},library)),plain(out));
      assert.ok(out.palette.length<=k);
      assert.equal(out.cells.length,raw.length);
      assert.equal(out.palette.reduce((sum,p)=>sum+p.count,0),raw.length);
      assert.ok(Array.from(out.cells).every(i=>i>=0&&i<out.palette.length));
      if(library) assert.ok(out.palette.every(p=>library.some(c=>c.hex===p.hex)));
    }
  }
});

function slopedLine(slope,shift,blankColumn=-1,bright=false) {
  const data=new Uint8ClampedArray(64*64*4);
  for(let y=0;y<64;y++) for(let x=0;x<64;x++) {
    const on=Math.abs(y-(x*slope+shift))<.55 && Math.floor(x/8)!==blankColumn;
    const v=on!==bright?30:240;
    data.set([v,v,v,255],(y*64+x)*4);
  }
  return data;
}

test('跨格短斜线由两侧支持后连续，亮暗线均有效，聚类后仍连通', () => {
  for(const bright of [false,true]) for(const method of ['balanced','lines']) {
    const data=slopedLine(.3,0,-1,bright),copy=data.slice();
    const raw=Pixel.sample(data,64,64,8,8,method,65);
    for(let c=0;c<8;c++) assert.ok(Array.from(raw.lineMask).some((v,i)=>v&&i%8===c),'missing column '+c);
    assert.equal(raw.retainedLineCells,8);
    const model=Pixel.build(raw,{mode:'thresh',thresh:12,minCount:1},ColorLibrary.builtins.mard221.colors);
    const points=Array.from(model.cells,(v,i)=>raw.lineMask[i]?i:-1).filter(i=>i>=0);
    for(let i=1;i<points.length;i++) {
      assert.ok(Math.abs(points[i]%8-points[i-1]%8)<=1);
      assert.ok(Math.abs(Math.floor(points[i]/8)-Math.floor(points[i-1]/8))<=1);
    }
    const lineIndex=model.cells[points[0]];
    assert.ok(points.every(i=>model.cells[i]===lineIndex));
    assert.notEqual(model.cells[63],lineIndex);
    assert.deepEqual(data,copy);
  }
});

test('不跨原图空白补线，也不把已经连通的斜线加粗', () => {
  for(const method of ['balanced','lines']) {
    const gap=Pixel.sample(slopedLine(.3,0,6),64,64,8,8,method,65);
    for(let r=0;r<8;r++) assert.equal(gap.lineMask[r*8+6],0);
    const diagonal=Pixel.sample(slopedLine(1,3),64,64,8,8,method,65);
    assert.equal(diagonal.retainedLineCells,8);
  }
});

test('候选色溢出时保留低频远色，不让高频近似色占满色板', () => {
  const raw=[];
  for(let r=0;r<=100;r+=25) for(let g=50;g<=250;g+=40) for(let b=50;b<=250;b+=40) {
    for(let n=0;n<5;n++) raw.push([r,g,b]);
  }
  raw.push([255,0,0]);
  const options={mode:'thresh',thresh:3,minCount:1};
  const old=Palette.build(raw,options),out=Pixel.build(raw,options,null);
  const red=context.window.Color.rgbToLab([255,0,0]);
  const error=model=>context.window.Color.deltaE(red,model.palette[model.cells[raw.length-1]].lab);
  assert.ok(error(out)<error(old),`${error(out)} vs ${error(old)}`);
  assert.ok(out.palette.length<=64);
  assert.equal(out.palette.reduce((n,p)=>n+p.count,0),raw.length);
  assert.ok(Array.from(out.cells).every(i=>i>=0&&i<out.palette.length));
  assert.equal(options.coverAllColors,undefined);
});

test('未触及色数上限时像素聚类保持原结果', () => {
  const raw=[[240,20,20],[240,20,20],[15,40,220],[240,240,230]];
  const opts={mode:'thresh',thresh:12,minCount:1};
  const out=Pixel.build(raw,opts,null),base=Palette.build(raw,opts);
  assert.deepEqual(plain(out.palette),plain(base.palette));
  assert.deepEqual(plain(out.cells),plain(base.cells));
});

test('弯曲细线保留短弧段，亮暗笔画均有原图支持', () => {
  for(const bright of [false,true]) {
    const data=new Uint8ClampedArray(64*64*4);
    for(let y=0;y<64;y++) for(let x=0;x<64;x++) {
      const on=Math.abs(Math.hypot(x-34,y-34)-22)<.6;
      const v=on!==bright?30:240;
      data.set([v,v,v,255],(y*64+x)*4);
    }
    const copy=data.slice();
    for(const method of ['balanced','lines']) {
      const raw=Pixel.sample(data,64,64,8,8,method,65);
      assert.equal(raw.lineMask[21],1);
      assert.equal(raw.lineMask[42],1);
      for(let i=0;i<64;i++) if(raw.lineMask[i]) {
        let evidence=false;
        for(let y=Math.floor(i/8)*8;y<Math.floor(i/8)*8+8;y++) for(let x=i%8*8;x<i%8*8+8;x++) {
          if(data[(y*64+x)*4]===(bright?240:30)) evidence=true;
        }
        assert.ok(evidence,'原图没有笔画的格子不补线');
      }
      assert.ok(raw.retainedLineCells<=18,'不把圆弧扩成双排');
    }
    assert.deepEqual(data,copy);
  }
});

test('斜线占据半格时不反向增强背景，亮暗线对称', () => {
  for(const bright of [false,true]) {
    const data=new Uint8ClampedArray(64*64*4),counts=new Uint16Array(64);
    for(let y=0;y<64;y++) for(let x=0;x<64;x++) {
      const on=Math.abs(y-(40-x*.5))<2.5;
      if(on)counts[Math.floor(y/8)*8+Math.floor(x/8)]++;
      const v=on!==bright?20:240;data.set([v,v,v,255],(y*64+x)*4);
    }
    const raw=Pixel.sample(data,64,64,8,8,'lines');
    counts.forEach((n,i)=>{
      if(n>=32)assert.equal(raw[i][0],bright?240:20,'主体笔画不能被背景替换 '+i);
      if(n===0)assert.equal(raw[i][0],bright?20:240,'空白格不能增加笔画 '+i);
    });
  }
});

test('线条鲜明将跨桶的近色共同计票，底色不被少量异色抢占', () => {
  const pixels=[];
  for(let y=0;y<10;y++)for(let x=0;x<10;x++){
    const v=(x+y)%2?159:161;
    pixels.push(x===4&&y>=3&&y<=6?[20,30,40,255]:[v,v,v,255]);
  }
  const out=Pixel.sample(rgba(...pixels),10,10,1,1,'lines');
  assert.ok(out[0][0]>=159);
});

test('线条鲜明保持粗直线等宽，不因跨格边缘而向邻格扩张', () => {
  for(const invert of [false,true]){
    const pixels=[];
    for(let y=0;y<48;y++)for(let x=0;x<48;x++){
      let v=x>=17&&x<23?20:240;if(invert)v=260-v;
      pixels.push([v,v,v,255]);
    }
    const out=Pixel.sample(rgba(...pixels),48,48,8,8,'lines');
    for(let y=0;y<8;y++){
      const occupied=out.slice(y*8,y*8+8).map((rgb,x)=>(invert?rgb[0]>130:rgb[0]<130)?x:-1).filter(x=>x>=0);
      assert.deepEqual(plain(occupied),[3]);
    }
  }
});

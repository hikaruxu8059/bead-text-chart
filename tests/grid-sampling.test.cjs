const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/grid.js'),'utf8'),context);
const Grid=context.window.Grid;
const plain=x=>JSON.parse(JSON.stringify(x));
test('中心取色保留中心像素；格内主色抑制少量中心文字与边缘格线',()=>{
  const data=new Uint8ClampedArray(100*4);
  for(let y=0;y<10;y++)for(let x=0;x<10;x++){
    const edge=x<3||x>6||y<3||y>6;
    data.set(edge?[0,0,0,255]:[224,64,32,255],(y*10+x)*4);
  }
  data.set([0,0,0,255],(5*10+5)*4);
  const g={cols:1,rows:1,cellW:10,cellH:10,originX:0,originY:0};
  assert.deepEqual(plain(Grid.sample(data,10,10,g,.3,'center')),[[0,0,0]]);
  assert.deepEqual(plain(Grid.sample(data,10,10,g,.3,'dominant')),[[224,64,32]]);
  assert.deepEqual(plain(Grid.sample(data,10,10,g,.3)),[[224,64,32]]);
});
test('中心取色处理小数格距和边缘偏移，不越界或混色',()=>{
  const data=new Uint8ClampedArray([255,0,0,255,0,255,0,255,0,0,255,255]);
  const g={cols:3,rows:1,cellW:1.5,cellH:1,originX:-1,originY:0};
  assert.deepEqual(plain(Grid.sample(data,3,1,g,.3,'center')),[[255,0,0],[0,255,0],[0,0,255]]);
});

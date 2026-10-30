const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
function placement(state,cs,center){const c={S:state};vm.createContext(c);vm.runInContext(source.slice(source.indexOf('  function editReferencePlacement'),source.indexOf('  var referenceFrame')),c);return c.editReferencePlacement(180,cs,center);}
test('原图每格显示大小与编辑画布相同，缩放后仍一致',()=>{
 const s={cols:200,rows:100,src:{width:1000,height:500},geom:{originX:0,originY:0,cellW:5,cellH:5}};
 for(const cs of [2,8,24]){
  const p=placement(s,cs,{x:.5,y:.5});
  assert.equal(p.width/200,cs);assert.equal(p.height/100,cs);
  assert.equal(p.x+p.width*.5,90);assert.equal(p.y+p.height*.5,90);
 }
});
test('图纸偏移与横纵不同格距映射到参考窗口中心，边缘不另行钳制',()=>{
 const s={cols:225,rows:126,src:{width:736,height:411},geom:{originX:-.6,originY:.1,cellW:3.276,cellH:3.262}};
 for(const center of [{x:.15,y:.8},{x:0,y:0}]){
  const p=placement(s,8,center),g=s.geom;
  const sourceX=g.originX+center.x*s.cols*g.cellW,sourceY=g.originY+center.y*s.rows*g.cellH;
  assert.ok(Math.abs(p.x+sourceX/s.src.width*p.width-90)<1e-8);
  assert.ok(Math.abs(p.y+sourceY/s.src.height*p.height-90)<1e-8);
  assert.ok(Math.abs(g.cellW/s.src.width*p.width-8)<1e-8);
  assert.ok(Math.abs(g.cellH/s.src.height*p.height-8)<1e-8);
 }
});

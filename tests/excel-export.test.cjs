const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({window:{},Blob,TextEncoder});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/excel-export.js'),'utf8'),context);
const build=context.window.ExcelExport.build;
async function entries(blob){const b=Buffer.from(await blob.arrayBuffer()),files={};let n=0;while(b.readUInt32LE(n)===0x04034b50){const len=b.readUInt32LE(n+18),size=b.readUInt16LE(n+26),extra=b.readUInt16LE(n+28),start=n+30+size+extra;files[b.subarray(n+30,n+30+size).toString()]=b.subarray(start,start+len).toString();n=start+len;}return files;}
const palette=[{hex:'#010101',code:'H7',count:999},{hex:'#ffffff',name:'=SUM(A1)&"<白>',count:999}];
test('Excel 导出实际颜色、色号、自由名称和用量，名称始终为文本',async()=>{
const files=await entries(build({cols:2,rows:2,cells:[0,1,1,0],palette}));
assert.equal(Object.keys(files).length,7);
assert.match(files['xl/worksheets/sheet1.xml'],/r="B2" s="2" t="inlineStr"/);
assert.match(files['xl/worksheets/sheet1.xml'],/=SUM\(A1\)&amp;&quot;&lt;白&gt;/);
assert.doesNotMatch(files['xl/worksheets/sheet1.xml'],/<f>/);
assert.match(files['xl/styles.xml'],/FF010101/);
assert.match(files['xl/styles.xml'],/FFFFFFFF/);
assert.match(files['xl/worksheets/sheet2.xml'],/r="D2" s="1"><v>2<\/v>/);
assert.match(files['xl/worksheets/sheet2.xml'],/r="D4" s="1"><v>4<\/v>/);
assert.match(files['xl/worksheets/sheet1.xml'],/state="frozen"/);
});
test('Excel 支持超过 Z 的列并拒绝损坏的格子索引',async()=>{
const files=await entries(build({cols:28,rows:1,cells:Array(28).fill(0),palette}));
assert.match(files['xl/worksheets/sheet1.xml'],/r="AC2"/);
assert.throws(()=>build({cols:1,rows:1,cells:[8],palette}),/颜色无效/);
assert.throws(()=>build({cols:2,rows:1,cells:[0],palette}),/尺寸无效/);
});

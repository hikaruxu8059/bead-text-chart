const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({window:{},Blob,TextEncoder});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/zip-store.js'),'utf8'),c);
test('PNG压缩包保留二进制、UTF-8行列文件名、CRC和目录偏移',async()=>{
 const files=[{name:'图纸-行1-2-列1-3.png',data:new Uint8Array([0,255,128,13,10,0])},{name:'图纸-行3-4-列1-3.png',data:new Uint8Array([137,80,78,71])}];
 const blob=c.window.ZipStore.build(files);assert.equal(blob.type,'application/zip');
 const data=new Uint8Array(await blob.arrayBuffer()),view=new DataView(data.buffer),decoder=new TextDecoder();
 let offset=0;const starts=[];
 for(const file of files){
  starts.push(offset);assert.equal(view.getUint32(offset,true),0x04034b50);assert.equal(view.getUint16(offset+6,true),0x800);
  const len=view.getUint16(offset+26,true),size=view.getUint32(offset+18,true);
  assert.equal(decoder.decode(data.slice(offset+30,offset+30+len)),file.name);
  assert.deepEqual(data.slice(offset+30+len,offset+30+len+size),file.data);
  let crc=0xffffffff;for(const b of file.data){crc^=b;for(let i=0;i<8;i++)crc=crc>>>1^(crc&1?0xedb88320:0);}
  assert.equal(view.getUint32(offset+14,true),(crc^0xffffffff)>>>0);offset+=30+len+size;
 }
 const centralOffset=offset;
 for(const start of starts){assert.equal(view.getUint32(offset,true),0x02014b50);assert.equal(view.getUint32(offset+42,true),start);offset+=46+view.getUint16(offset+28,true);}
 assert.equal(view.getUint32(offset,true),0x06054b50);assert.equal(view.getUint32(offset+16,true),centralOffset);assert.equal(view.getUint16(offset+10,true),files.length);
});

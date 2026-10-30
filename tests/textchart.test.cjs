const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ctx=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/textchart.js'),'utf8'),ctx);
const model={cols:3,rows:2,cells:[0,1,2,3,4,5],palette:['A','B','C','D','E','F'].map(name=>({name}))};
test('色库图纸及 CSV 只使用色号，自由配色使用自定义名称',()=>{
 const opts={axis:'row',colDir:'ltr',rowDir:'ttb',perCol:true};
 const coded={cols:2,rows:1,cells:[0,1],palette:[{code:'A14',name:'红'},{code:'H16',name:'黑'}]};
 const text=ctx.window.TextChart.build(coded,opts);
 assert.ok(text.includes('1个A14，1个H16'));
 assert.ok(!text.includes('红')&&!text.includes('黑'));
 assert.equal(ctx.window.TextChart.toCSV(coded),'\ufeffA14,H16');
 const free={...coded,palette:[{name:'腮红'},{name:'轮廓'}]};
 assert.ok(ctx.window.TextChart.build(free,opts).includes('1个腮红，1个轮廓'));
 assert.equal(ctx.window.TextChart.toCSV(free),'\ufeff腮红,轮廓');
});
for(const [axis,colDir,rowDir,lines] of [
 ['row','ltr','ttb',['ABC','DEF']],['row','rtl','ttb',['CBA','FED']],
 ['row','ltr','btt',['DEF','ABC']],['row','rtl','btt',['FED','CBA']],
 ['column','ltr','ttb',['AD','BE','CF']],['column','rtl','ttb',['CF','BE','AD']],
 ['column','ltr','btt',['DA','EB','FC']],['column','rtl','btt',['FC','EB','DA']]
]) test(`${axis} ${colDir} ${rowDir} 顺序、编号、统计与强制粗体`,()=>{
 const text=ctx.window.TextChart.build(model,{axis,colDir,rowDir,perCol:true,bold:false});
 const unit=axis==='row'?'行':'列';
 lines.forEach((line,i)=>assert.ok(text.includes(`**第${i+1}${unit}**：`+[...line].map(c=>'1个'+c).join('，'))));
 assert.ok(text.includes(`每${unit}各色用量`));
 assert.ok(text.includes('合计 **6** 颗'));
 for(const c of 'ABCDEF')assert.ok(text.includes(`- ${c}：**1** 个`));
});
test('按行连续同色合并且可关闭分行用量',()=>{
 const text=ctx.window.TextChart.build({...model,cells:[0,0,1,1,1,1]},{axis:'row',colDir:'ltr',rowDir:'ttb',perCol:false});
 assert.ok(text.includes('**第1行**：2个A，1个B'));
 assert.ok(text.includes('**第2行**：3个B'));
 assert.ok(!text.includes('每行各色用量'));
 assert.ok(text.includes('- B：**4** 个'));
});

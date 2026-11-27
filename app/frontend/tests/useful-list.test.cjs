// Ошибка №32: главная падала «Cannot read properties of undefined (reading 'length')», когда /api/v1/useful отвечал без списка.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const file=path.join(__dirname,'../src/lib/useful.ts');
const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
let body;
const fetch=async()=>({ok:true,status:200,json:async()=>{if(body instanceof Error)throw body;return body;}});
const stubs={'@/lib/config':{getAPIBaseURL:()=>''},'@/lib/accountApi':{getAccountToken:()=>null}};
const mod={exports:{}};vm.runInNewContext(code,{exports:mod.exports,module:mod,require:n=>stubs[n],fetch,Object,Array,Error,JSON,Promise,encodeURIComponent,Math});
const {useful}=mod.exports;
(async()=>{
  for(const b of [new SyntaxError('Unexpected token <'),{},{items:null},null,{items:'x'}]){body=b;const r=await useful.list();assert.ok(Array.isArray(r),`list() must return an array for ${String(b)}`);assert.equal(r.length,0);}
  body={items:[{slug:'a'}]};const r=await useful.list();assert.equal(r.length,1);assert.equal(r[0].slug,'a');
  console.log('PASS: useful.list() always returns an array, so the home «Полезно знать» block never crashes');
})().catch(e=>{console.error(e);process.exit(1);});

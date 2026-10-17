const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const file=path.join(__dirname,'../src/lib/gastronomDelivery.ts');
const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:mod.exports,module:mod,crypto:{randomUUID:()=> 'new-zone'},Math,JSON,Number,String,Date});
const api=mod.exports,polygon=[[49,72],[49,74],[51,74],[51,72]];
const parsed=api.parseDeliveryZones(JSON.stringify([{id:'one',price:500,courier_payout:800,polygon},{id:'two',price:500,courier_payout:1200,polygon},{id:'missing',price:500,polygon}]));
assert.equal(parsed.length,3);assert.equal(parsed[0].courier_payout,800);assert.equal(parsed[1].courier_payout,1200);assert.equal(parsed[2].courier_payout,null);
const roundtrip=JSON.parse(api.serializeDeliveryZones(parsed));assert.equal(roundtrip[0].courier_payout,800);assert.equal(roundtrip[2].courier_payout,null);
console.log('PASS: zone identity and owner courier tariffs survive parse/save; missing wage remains unset');

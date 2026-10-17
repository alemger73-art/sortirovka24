const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
const source=fs.readFileSync(__dirname+'/../src/pages/Cabinet.tsx','utf8');
const start=source.indexOf("    if (activeTab !== 'orders') return;");
const end=source.indexOf('\n  }, [activeTab]);',start);assert(start>0&&end>start);
const body=ts.transpile(source.slice(start,end),{target:ts.ScriptTarget.ES2020});
const setup=new Function('activeTab','document','window','getAccountToken','accountApi','setCabinet',body);
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
(async()=>{
  let complete,calls=0,interval,cleared=false;
  const events={},visibility={};
  const draft={name:'Unsaved name'},addresses=['Unsaved address'];
  let state={profile:draft,addresses,orders:[{id:'food_30'}]};
  const doc={hidden:false,addEventListener:(k,f)=>visibility[k]=f,removeEventListener:k=>delete visibility[k]};
  const win={setInterval:(f,ms)=>{assert.equal(ms,10000);interval=f;return 1},clearInterval:()=>cleared=true,
    addEventListener:(k,f)=>events[k]=f,removeEventListener:k=>delete events[k]};
  const cleanup=setup('orders',doc,win,()=> 'synthetic-account-token',
    {cabinet:()=>{calls++;return new Promise(resolve=>complete=resolve)}},fn=>state=fn(state));
  assert.equal(calls,1);events.focus();assert.equal(calls,1,'overlapping refresh suppressed');
  complete({orders:[{id:'food_36'},{id:'food_30'}],profile:{name:'Server name'},addresses:[]});await flush();
  assert.equal(state.orders[0].id,'food_36');assert.equal(state.profile,draft);assert.equal(state.addresses,addresses);
  doc.hidden=true;interval();assert.equal(calls,1,'hidden tabs do not poll');
  doc.hidden=false;visibility.visibilitychange();assert.equal(calls,2,'returning to the tab refreshes history');
  cleanup();complete({orders:[]});await flush();assert.equal(state.orders.length,2,'late response after cleanup ignored');
  assert(cleared);assert.equal(Object.keys(events).length,0);assert.equal(Object.keys(visibility).length,0);
  const before=calls;setup('profile',doc,win,()=> 'token',{cabinet:()=>calls++},()=>{});assert.equal(calls,before);
  console.log('PASS: new orders refresh; unsaved profile preserved; overlap, visibility and cleanup guards');
})().catch(e=>{console.error(e);process.exitCode=1});

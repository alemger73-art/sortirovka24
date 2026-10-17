const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const root=path.join(__dirname,'..');
const courier=JSON.parse(fs.readFileSync(path.join(root,'public/courier.webmanifest'),'utf8'));
const portal=JSON.parse(fs.readFileSync(path.join(root,'public/manifest.json'),'utf8'));
const operator=JSON.parse(fs.readFileSync(path.join(root,'public/operator.webmanifest'),'utf8'));
assert.equal(courier.name,'DAM ALEM Курьер');assert.equal(courier.id,'/food/courier');assert.equal(courier.start_url,'/food/courier');assert.equal(courier.display,'standalone');assert.notEqual(courier.id,operator.id);assert.notEqual(courier.id,portal.id);
for(const icon of courier.icons)assert.ok(fs.existsSync(path.join(root,'public',icon.src)));
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=html.match(/<script>\s*(if \(\['\/food\/courier'[\s\S]*?)<\/script>/)[1];
for(const pathname of ['/food/courier','/food/courier/','/dam-alem/courier','/food','/partner/dam-alem/operator']) {
 const elements={};const document={querySelector:selector=>elements[selector]||=(selector.includes('link')?{href:'/manifest.json'}:{content:'Sortirovka 24'})};
 vm.runInNewContext(script,{document,location:{pathname}});
 assert.equal(document.querySelector('link[rel="manifest"]').href,pathname.includes('courier')?'/courier.webmanifest':'/manifest.json');
}
console.log('PASS: distinct courier PWA identity, icons, start URL and first-load manifest selection');

const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/gastronomDelivery.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports:api});
const check = api.deliveryZoneGeometryError;
const square = [[49.85,73.07],[49.85,73.09],[49.835,73.09],[49.835,73.07]];
assert.equal(check(square), null);
assert.equal(check([...square].reverse()), null);
assert.equal(check([...square, square[0]]), null);
assert.equal(check([[0,0],[0,4],[2,2],[4,4],[4,0]]), null); // Valid concave boundary.
assert.match(check([[0,0],[2,2],[0,2],[2,0]]), /пересекает/);
assert.match(check([[0,0],[0,3],[3,3],[0,1],[3,0]]), /пересекает/); // Touching a nonadjacent edge.
assert.match(check([[0,0],[0,0],[1,1]]), /повторяющиеся/);
assert.match(check([[0,0],[1,1],[2,2]]), /одной линии/);
assert.match(check([[0,0],[1,1]]), /3 точки/);
assert.match(check([[NaN,0],[1,1],[2,0]]), /координаты/);
assert.match(check([[91,0],[1,1],[2,0]]), /координаты/);
const zone = {id:'one',name:'Zone 1',price:200,courier_payout:800,polygon:square};
const saved = JSON.parse(api.serializeDeliveryZones([zone]))[0];
assert.equal(saved.price, 200); assert.equal(saved.courier_payout, 800);
assert.throws(()=>api.serializeDeliveryZones([{...zone, polygon:[[0,0],[2,2],[0,2],[2,0]]}]), /Zone 1:.*пересекает/);
console.log('13 delivery geometry scenarios PASS; tariffs preserved.');

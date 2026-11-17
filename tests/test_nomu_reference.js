const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Jef=require('../source/core/jef');
const Nomu=require('../source/stitch/nomu');

const sample=fs.readFileSync(path.join(__dirname,'../source/core/sample-jef.js'),'utf8');
const bytes=Uint8Array.from(Buffer.from(sample.match(/"([^"]+)"/)[1],'base64'));
const source=Jef.parse(bytes.buffer);
const runs=Nomu.read(source.events);
const origin={x:0,y:0,sx:1,sy:1};
const needleEvents=paths=>paths.flatMap(run=>run.map(({x,y},i)=>({x,y,type:i?'stitch':'jump'})));
const stitched=events=>events.filter(e=>e.type==='stitch');
assert.equal(runs.figure.length-1,329);
assert.equal(runs.oval.length-1,651);
const parts=Object.values(runs);
const native=parts.map(run=>Nomu.plan(run,origin));
assert.ok(native.every(result=>result.splits===0));
const roundTrip=Jef.write(needleEvents(native.map(result=>result.path)),{palette:source.palette}).parsed;
assert.deepEqual(stitched(roundTrip.events),stitched(source.events),'native export preserves every authored needle position in order');
assert.equal(roundTrip.width,33.6);
assert.equal(roundTrip.height,41);
const clean=Nomu.plan(runs.figure,origin,{cleanEntry:true});
assert.ok(Math.hypot(runs.figure[1].x-runs.figure[0].x,runs.figure[1].y-runs.figure[0].y)>5,'source contains a long entry into the head');
assert.deepEqual([...clean.path],runs.figure.slice(1),'clean installed logo starts at the first authored penetration');
const cleanedJef=Jef.write(needleEvents([clean.path,native[1].path]),{palette:source.palette}).parsed;
assert.equal(stitched(cleanedJef.events).length,979);
assert.equal(Jef.threadHex(1),'#f0f0f0');
assert.equal(Jef.threadHex(2),'#000000');
for(const scale of [.5,2,4]){
 const frame={x:0,y:0,sx:scale,sy:scale};
 const scaled=parts.map(run=>Nomu.plan(run,frame,{max:6.5}));
 if(scale>1){
  assert.ok(scaled.every(result=>result.splits>0),'wide spans gain subdivisions');
  assert.ok(scaled.every((result,i)=>result.path.length>parts[i].length),'scale adds real needle points');
 }
 for(const {path} of scaled){
  for(let i=1;i<path.length;i++)assert.ok(Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y)<6.5);
 }
 const readback=Jef.write(needleEvents(scaled.map(result=>result.path)),{palette:source.palette}).parsed;
 assert.equal(readback.width,Math.round(33.6*scale*10)/10,'emblem retains horizontal dimensions');
 assert.equal(readback.height,41*scale,'emblem retains vertical dimensions');
}
console.log('Baby-Last: exact 980 native needle points; scaled JEF preserves size and caps satin spans.');

const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const engine=fs.readFileSync(path.join(__dirname,'../source/stitch/engine.js'),'utf8');
const Jef=require('../source/core/jef.js'),Satin=require('../source/stitch/satin.js');
const Patterns=require('../source/stitch/patterns.js');
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function grab(name){
 const start=engine.indexOf('function '+name+'(');
 assert.ok(start>=0,name);
 let depth=0,i=engine.indexOf('){',start)+1;
 for(;i<engine.length;i++){
  if(engine[i]==='{')depth++;
  if(engine[i]==='}'&&--depth===0)break;
 }
 return engine.slice(start,i+1);
}
const geometry=['simplifyPath','traceRings','fvInside','fvNearestOnRings','fvRingLen','fvTravelClear','fvReversePath','fvEdgeTravel','fvConnect','fvAppendTravel','fvBounds','fvArea','fvTie','fvResample','fvBandRails','fvTurningSatin','fvSatinTravel','fvBuildPaths','sewRegion','transformPoint','makePathsToEvents'];
const api=new Function('window','stitchPatterns','dist','getSettings','fvTatami','satinColumns','satinSplits','sequenceStats',
 geometry.map(grab).join('\n')+'\nreturn {'+geometry.join(',')+'};')
 ({FervorSatin:Satin,FervorPatterns:Patterns},Patterns,distance,()=>({satinLimit:6.5,spacing:.45,pullComp:.18}),()=>{throw Error('Explicit Satin must never fall back to tatami');},0,0,{joined:0,routeLength:0});
const rectangle=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]].map(([x,y])=>({x,y}));
const widest=paths=>Math.max(0,...paths.flatMap(p=>p.slice(1).map((v,i)=>distance(v,p[i]))));
const spec={angle:0,satinDirection:'angle',satinLimit:6.5,satinStep:.45,spacing:.45,stitch:4,run:2,pull:.18,underlay:false,style:'satin',chain:true};
const block=[rectangle(0,0,28,16)],box=Satin.plan(block,{angle:0,direction:'angle',max:6.5});
assert.ok(box.columns>=5&&box.splitSections===1,'a 28 mm span is divided into narrow columns');
assert.ok(widest(box.top)<=6.5);
assert.ok(box.top.some(p=>p.slice(2,7).every((v,i,a)=>!i||Math.sign(v.x-a[i-1].x)!==Math.sign(a[i-1].x-p[p.indexOf(v)-2].x))), 'top thread alternates between rails');
const vertical=[rectangle(0,0,3,24)],auto=Satin.plan(vertical,{angle:90,max:6.5});
assert.equal(auto.angle,0,'auto direction crosses the narrow stroke');
assert.equal(auto.columns,1);
assert.ok(api.sewRegion([rectangle(0,0,.23,.65)],spec).length,'small visible geometry still yields satin');
const ring=[rectangle(0,0,24,21),rectangle(5,5,14,11)];
const retained=api.sewRegion(ring,spec);
assert.ok(retained.length&&widest(retained)<=6.5,`closed ring stitches stay under the cap: ${retained.length} runs, widest ${widest(retained)} mm`);
for(const p of retained)for(let i=1;i<p.length;i++){
 for(const f of [.25,.5,.75]){
  const point={x:p[i-1].x+(p[i].x-p[i-1].x)*f,y:p[i-1].y+(p[i].y-p[i-1].y)*f};
  assert.ok(api.fvInside(ring,point)||api.fvNearestOnRings(ring,point).d<=.20,'no embroidery crosses the open hole');
 }
}
function roundTrip(paths,max){
 const events=[];
 api.makePathsToEvents(paths,{angle:0,offsetX:0,offsetY:0},1,1,events);
 const {parsed}=Jef.write(events,{palette:[1]});
 for(let i=1;i<parsed.events.length;i++)if(parsed.events[i].type==='stitch'){
  assert.ok(distance(parsed.events[i-1],parsed.events[i])<=max+1e-8,'machine-coordinate span stays within cap');
 }
 return parsed.events.filter(e=>e.type==='stitch').length;
}
assert.ok(roundTrip(api.sewRegion(block,{...spec,satinLimit:3}),3)>300,'the cap also applies after JEF rounding');
// Two adjacent bands share an overlap without changing the outer rails.
const bands=[rectangle(0,0,9,3)];
const noOverlap=Satin.plan(bands,{angle:0,direction:'angle',max:6.5,overlap:0});
const withOverlap=Satin.plan(bands,{angle:0,direction:'angle',max:6.5,overlap:.25});
assert.equal(withOverlap.columns,2);
const seamGap=plan=>plan.top[0][0].x-plan.top[1][1].x;
assert.ok(Math.abs(seamGap(noOverlap))<1e-6);
assert.ok(Math.abs(seamGap(withOverlap)-.25)<1e-6,'both sides extend across the satin seam');
assert.equal(Math.min(...withOverlap.top.flat().map(p=>p.x)),0);
assert.equal(Math.max(...withOverlap.top.flat().map(p=>p.x)),9);
assert.ok(roundTrip(api.sewRegion(block,{...spec,satinLimit:3,satinOverlap:.5}),3)>300);

const ev=(type,x,extra={})=>({type,x,y:0,ownerId:1,...extra});
const disconnected=[ev('jump',0),ev('stitch',1),ev('jump',2.5,{jumpNeedsTrim:true}),ev('jump',5),
 ev('stitch',6),ev('jump',6.5,{jumpNeedsTrim:true}),ev('stitch',7),ev('color',0),
 ev('jump',12,{jumpNeedsTrim:true}),ev('stitch',13),ev('jump',13,{trimFromSource:true}),ev('jump',15),ev('stitch',16)];
const trimOptions={autoTrimBetweenParts:true,autoTrimExposedJumps:true,trimMinDistanceMm:3};
assert.deepEqual(Jef.planTrims(disconnected,trimOptions),[2,10],'same-shape trip gets one mark before its first jump, and authored trims survive');
assert.deepEqual(Jef.planTrims(disconnected,{trimMinDistanceMm:3}),[10],'disabled planning preserves authored markers');
const output=Jef.write(disconnected,{...trimOptions,palette:[1,1]});
assert.equal(output.parsed.events.filter(e=>e.trimFromSource).length,2);
assert.equal(Jef.jumpRuns(output.parsed.events).filter(e=>e.distance>=3&&!e.marked).length,0);
const legacy=[ev('stitch',1),ev('jump',6,{ownerId:2}),ev('stitch',7,{ownerId:2})];
assert.deepEqual(Jef.planTrims(legacy,{autoTrimBetweenParts:true,trimMinDistanceMm:3}),[1]);
const reference=fs.readFileSync(path.join(__dirname,'../source/core/sample-jef.js'),'utf8');
const original=Jef.parse(Buffer.from(reference.match(/"([A-Za-z0-9+/=]+)"/)[1],'base64'));
assert.equal(original.events.filter(e=>e.type==='stitch').length,980);
const w=217,h=267,scale=6,offsetX=108,offsetY=133,mask=new Uint8Array(w*h);
let last=null;
for(const e of original.events){
 if(e.type==='stitch'&&last){
  const n=Math.max(1,Math.ceil(distance(e,last)*scale*2));
  for(let j=0;j<=n;j++){
   const x=Math.round((last.x+(e.x-last.x)*j/n)*scale+offsetX),y=Math.round((last.y+(e.y-last.y)*j/n)*scale+offsetY);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)mask[(y+dy)*w+x+dx]=1;
  }
 }
 last=e;
}
const stencil=api.traceRings((x,y)=>x>=0&&x<w&&y>=0&&y<h&&mask[y*w+x],0,0,w-1,h-1,
 (x,y)=>({x:(x-offsetX)/scale,y:(y-offsetY)/scale}),.16);
assert.ok(stencil.length>=3,'stencil includes the Baby-Last figure, border and open space');
const biggest=ring=>Math.abs(api.fvArea([ring]));
const sorted=stencil.slice().sort((a,b)=>biggest(b)-biggest(a));
const groups=[];
sorted.forEach((ring,i)=>{
 const parents=sorted.slice(0,i).filter(r=>api.fvInside([r],ring[0]));
 if(parents.length%2===0)groups.push([ring]);
 else groups.find(g=>g[0]===parents.at(-1)).push(ring);
});
assert.equal(groups.length,2,'Baby-Last figure and border digitize independently');
const pathsByPart=groups.map(group=>api.sewRegion(group,{...spec,satinDirection:'auto',underlay:'auto'}));
assert.ok(pathsByPart.every(p=>p.length>0),'both parts generate stitches');
const remade=pathsByPart.flat(),count=roundTrip(remade,6.5);
assert.ok(count>500);
console.log(`Split-satin geometry and JEF width checks passed. Baby-Last stencil: ${stencil.length} contours, ${remade.length} paths, ${count} stitches.`);

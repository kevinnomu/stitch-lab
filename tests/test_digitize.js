// Digitizer regression checks: outline tracing and continuous, inside-the-shape fill routing.
// Run: node tests/test_digitize.js
const fs=require('fs'),path=require('path'),assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'../source/stitch/engine.js'),'utf8');
const grab=name=>{const i=src.indexOf('function '+name+'(');assert(i>=0,'missing '+name);let d=0,j=src.indexOf('){',i)+1;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&--d===0)break;}return src.slice(i,j+1);};
const names=['simplifyPath','traceRings','ringArea','fvResample','fvInside','fvNearestOnRings','fvRingLen','fvEdgeTravel','fvTravelClear','fvReversePath','fvConnect','fvAppendTravel','fvChain','fvSatinTravel','fvBounds','fvTatami','fvRowLengths','fvSatinAngle'];
const api=new Function('sequenceStats',names.map(grab).join('\n')+'\nreturn {'+names.join(',')+'};')({joined:0,routeLength:0});

// 1. A pixel N: verticals joined by a diagonal of corner-touching pixels is one outline, not loops.
const n=new Set();for(let i=0;i<10;i++){n.add(i+','+i);n.add('0,'+i);n.add('9,'+i);}
const nRings=api.traceRings((x,y)=>n.has(x+','+y),0,0,9,9,(x,y)=>({x,y}),.3);
assert.strictEqual(nRings.length,1,'diagonal strokes must trace as one outline');
// 2. A square ring traces as an outline plus a hole.
const ring=api.traceRings((x,y)=>x>=0&&y>=0&&x<20&&y<20&&!(x>=6&&x<14&&y>=6&&y<14),0,0,19,19,(x,y)=>({x,y}),.1);
assert.deepStrictEqual(ring.map(r=>Math.sign(api.ringArea(r))),[1,-1],'outline and hole');
// 3. Running stitches keep corners that are more than 0.3 mm apart.
const zig=[{x:0,y:0},{x:.6,y:.6},{x:1.2,y:0},{x:1.8,y:.6},{x:2.4,y:0}];
assert.ok(api.fvResample(zig,2.5).length>=5,'small corners survive resampling');
// 4. An F sews as a continuous fill with no stitch crossing the empty notch between its arms.
const F=[{x:0,y:0},{x:12,y:0},{x:12,y:3},{x:3,y:3},{x:3,y:7},{x:9,y:7},{x:9,y:10},{x:3,y:10},{x:3,y:18},{x:0,y:18},{x:0,y:0}];
const fill=api.fvTatami([F],0,.45,4,0,true,.2,{maxLink:14});
assert.ok(fill.length<=2,`F fill should be continuous, got ${fill.length} paths`);
for(const p of fill)for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i],m={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
 assert.ok(api.fvInside([F],m)||api.fvNearestOnRings([F],m).d<=.6,`stitch leaves the shape at ${m.x.toFixed(1)},${m.y.toFixed(1)}`);
 assert.ok(Math.hypot(b.x-a.x,b.y-a.y)<=4*1.36,'fill stitch within stitch length');}
// 5. Satin direction crosses the stroke: a vertical bar gets horizontal rows.
const bar=[{x:0,y:0},{x:2,y:0},{x:2,y:20},{x:0,y:20},{x:0,y:0}];
assert.strictEqual(api.fvSatinAngle([bar],6.5),0,'satin rows run across a vertical bar');
console.log('Digitizer: tracing, corner keeping, continuous inside-shape fill and satin direction PASS');

// The torso regression was a running diagonal whose segments were short, but
// the connected route crossed the finished top stitching. Underlay may use it.
const body=[[{x:0,y:0},{x:35,y:0},{x:35,y:26},{x:0,y:26},{x:0,y:0}]];
const a={x:6,y:20},b={x:24,y:5};
assert.strictEqual(api.fvConnect(a,b,body,1.2,30),null,'interior diagonal must not sew as a top connector');
const under=api.fvConnect(a,b,body,1.2,30,true);
assert.strictEqual(under.role,'covered');
assert.ok(under.points.length>10);
assert.strictEqual(api.fvConnect(a,b,body,1.2,14,true),null,'underlay must respect the total travel limit');
const near=api.fvConnect({x:0,y:10},{x:0,y:18},body,1.2,14);
assert.strictEqual(near.role,'edge','safe edge travel still connects');

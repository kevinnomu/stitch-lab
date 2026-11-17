const assert=require('node:assert/strict');
const letters=require('../source/stitch/lettering.js');
const crop=require('../source/vector/crop-engine.js');

const settings={font:'micro-block',content:'NOMU\n2026',height:4,tracking:.35,lineGap:2};
const original=letters.layout(settings);
assert.equal(original.mmH,10);
assert.ok(original.paths.length>=8);
assert.ok(letters.layout({...settings,font:'micro-narrow'}).mmW<original.mmW);
assert.ok(letters.layout({...settings,font:'micro-round'}).paths.flat().length>original.paths.flat().length);
assert.equal(letters.layout({...settings,content:'NÖMU'}),null);
assert.equal(letters.layout({...settings,content:'NOMU',width:125}).mmH,4);
assert.ok(letters.layout({...settings,content:'NOMU',width:125}).mmW>letters.layout({...settings,content:'NOMU'}).mmW);
const left=letters.layout({...settings,content:'NNNN\nN',align:'left'});
const right=letters.layout({...settings,content:'NNNN\nN',align:'right'});
assert.ok(right.paths.at(-1)[0].x>left.paths.at(-1)[0].x);
for(const p of original.paths){
 const stitches=letters.sample(p,1.3);
 for(let i=1;i<stitches.length;i++){
  const d=Math.hypot(stitches[i].x-stitches[i-1].x,stitches[i].y-stitches[i-1].y);
  assert.ok(d>=.12-1e-8&&d<=1.3+1e-8);
 }
}
assert.equal(letters.fields({content:'A\nB\nC\nD\nE',height:-4}).content,'A\nB\nC\nD');
assert.equal(letters.fields({height:-4}).height,3);

function fixture(width,height,edge){
 const data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const offset=(y*width+x)*4,b=y>=edge(x)?235:10;
  data.set([b,b,b,255],offset);
 }
 return {width,height,data};
}
const map=crop.edgeMap(fixture(100,80,x=>Math.round(27-12*Math.sin(Math.PI*(x-10)/80))));
const a={x:10,y:27},b={x:90,y:27};
const route=crop.segment(map,a,b,.85,27);
assert.deepEqual(crop.segment(map,a,b,0),[a,b]);
assert.ok(route.some(p=>p.y<18),'strong magnetic routing follows a curved boundary');
assert.ok(route.length>2);
assert.deepEqual([route[0],route.at(-1)],[a,b]);
const snapped=crop.snap(map,{x:50,y:20},10,.65);
assert.ok(snapped.y<=16,'a click near the edge snaps to the local gradient');
const plain=crop.edgeMap(fixture(100,80,()=>0));
assert.deepEqual(crop.segment(plain,a,b,.9,27),[a,b]);
assert.deepEqual(crop.snap(plain,a,9,.85),a);
assert.equal(crop.nearest([route,[b,{x:91,y:45}]],{x:92,y:40}).index,1);
const saved=crop.clean({anchors:[a,b,{x:Infinity,y:12}],closed:true,strength:40,magnet:false},{x:0,y:0,w:100,h:80});
assert.equal(saved.closed,false);
assert.equal(saved.magnet,false);
assert.equal(saved.strength,40);
console.log('Lettering layout, short running stitches, edge snapping, curved routing, straight fallback and crop state validation passed.');

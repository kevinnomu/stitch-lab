const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Patterns=require('../source/stitch/patterns.js');
const Satin=require('../source/stitch/satin.js');
const Jef=require('../source/core/jef.js');
const Lettering=require('../source/stitch/lettering.js');

const source=fs.readFileSync(path.join(__dirname,'../source/stitch/engine.js'),'utf8');
const names=['reinforceRun','fvSatinColumn','fvBounds','fvInside','fvRingLen','fvNearestOnRings','fvArea','fvBandRails','fvTurningSatin',
 'fvInsetRun','fvTie','fvSatinTravel','fvRunRings','fvResample','fvRotateRing','fvTravelClear','fvConnect',
 'optimizationImproves','fvReversePath','fvAppendTravel','fvChain','fvEdgeTravel','fvTatami','fvBuildPaths','transformPoint','makePathsToEvents','reorderStitchEvents','nomuLayerScale','fvRegenerateLayer','layerBounding','layerBasePt','transformLayerPoint','editableVectorLayers','vectorDesignBounds','resizeVectorDesign','appendJefOverlayEvents'];
function readFn(name){
 const start=source.indexOf('function '+name+'(');
 let i=source.indexOf('){',start)+1,depth=0;
 for(;i<source.length;i++){
  if(source[i]==='{')depth++;
  if(source[i]==='}'&&--depth===0)return source.slice(start,i+1);
 }
 throw Error('Missing function '+name);
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const settings={width:50,satinLimit:6.5,satinOverlap:.25,spacing:.45,pullComp:0};
const api=new Function('window','stitchPatterns','getSettings','dist','mode','originalBounds','sequenceStats','document',
 'let stitchOrderKeys=[], stitchOrderItems=[], stitchAutoKeys=[], exportPalette=[1], exportThreadHexes=[], palette=[1], jefLayers=[], annotations=[];'+
 'const stitchOrderLabel=key=>key;const captureLayerUndo=()=>{};const refreshLayerList=()=>{};const queueRebuild=()=>{};const alertMessage=message=>{throw Error(message)};'+names.map(readFn).join('\n')+'\nreturn {'+names.join(',')+',get palette(){return exportPalette;},get layers(){return jefLayers;},restoreLayers(data){jefLayers=data;}};'
)({FervorPatterns:Patterns,FervorSatin:Satin},Patterns,()=>settings,distance,'jef',{width:50},{joined:0,routeLength:0},{getElementById:()=>null});
const ring=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1},{x:x0,y:y0}];
const donut=[ring(-14,-12,14,12),ring(-4,-4,4,4)];
const shape={kind:'fill',rings:donut};
function sew(type,pattern){
 return api.fvBuildPaths(shape,{type,patterns:{[type]:pattern},angle:17,direction:'angle',spacing:.45,stitch:3,run:2,
  satinMax:6.5,satinSpacing:.4,ties:false,underlay:false,chain:false});
}
const steps=paths=>paths.flatMap(p=>p.slice(1).map((b,i)=>distance(p[i],b)));
for(const type of Object.keys(Patterns.types))assert.ok(sew(type).length>0,type);
for(const [type,choices] of Object.entries(Patterns.choices)){
 const results=Object.keys(choices).map(p=>JSON.stringify(sew(type,p)));
 assert.equal(new Set(results).size,results.length,type+' patterns produce distinct needle paths');
}
assert.ok(steps(sew('raised-satin')).length>steps(sew('satin')).length,'raised satin adds a buildup pass');
assert.equal(Patterns.decorative([ring(-6,-6,6,6)],'stipple',{run:2}).length,1,'stipple keeps a continuous route on an unbroken rectangle');
for(const type of ['motif','ripple','contour','cross-stitch','stipple']){
 const paths=sew(type);
 assert.ok(steps(paths).every(d=>d<=2+1e-8),type+' respects run length');
 for(const p of paths)for(let i=1;i<p.length;i++){
  for(const f of [.15,.5,.85]){
   const x=p[i-1].x+(p[i].x-p[i-1].x)*f,y=p[i-1].y+(p[i].y-p[i-1].y)*f;
   assert.ok(Math.abs(x)>=4-1e-7||Math.abs(y)>=4-1e-7,type+' does not sew into the hole');
  }
 }
}
const embossed=Object.keys(Patterns.choices.embossed).map(pattern=>sew('embossed',pattern));
function needlePath(paths){
 const events=paths.flatMap(p=>p.map((q,i)=>({type:i?'stitch':'jump',x:q.x,y:q.y})));
 return Jef.write(events,{palette:[1]}).parsed.events.filter(e=>e.type==='stitch');
}
assert.equal(new Set(embossed.map(paths=>JSON.stringify(needlePath(paths)))).size,Object.keys(Patterns.choices.embossed).length,
 'all emboss patterns stay distinct in JEF machine coordinates');
for(const paths of embossed){
 const relief=paths.filter(p=>p.role==='emboss-relief');
 assert.ok(relief.length>0,'emboss sews an additional pass over the base fill');
 assert.ok(steps(relief).every(d=>d<=1.8+1e-8));
 for(const p of relief)for(let i=1;i<p.length;i++){
  const x=(p[i].x+p[i-1].x)/2,y=(p[i].y+p[i-1].y)/2;
  assert.ok(Math.abs(x)>=4-1e-7||Math.abs(y)>=4-1e-7,'emboss keeps holes open');
 }
}
assert.equal(Patterns.choices.embossed.nomu,'NOMU figure');
assert.equal(Patterns.reliefOptions.nomu,'NOMU figure');
assert.equal(Patterns.sizeFor('embossed',3,'nomu'),8);
const figure=Patterns.decorative([ring(0,0,9,9)],'embossed',{pattern:'nomu',size:9,passes:1,run:1.8});
assert.equal(figure.length,2,'a single embroidered figure has an independent outline and head opening');
assert.ok(figure.every(path=>distance(path[0],path.at(-1))<1e-8),'both contours are closed');
const larger=Patterns.decorative([ring(0,0,18,18)],'embossed',{pattern:'nomu',size:9,passes:1});
assert.equal(larger.length,8,'NOMU figure repeats on the piece');
const motifHeight=height=>Patterns.decorative([ring(0,0,12,12)],'embossed',{pattern:'nomu',size:12,passes:1,nomuHeight:height});
const rangeY=path=>Math.max(...path.map(p=>p.y))-Math.min(...path.map(p=>p.y));
assert.ok(Math.abs(rangeY(motifHeight(8)[0])-8)<.3,'emboss figure height follows its millimeter setting');
assert.ok(rangeY(motifHeight(8)[0])-rangeY(motifHeight(4.5)[0])>3,'figure height changes while pitch remains fixed');
const baseAudit={uncut:4,long:7,tooLong:0,maxStitch:7,cutCount:3,short:30,total:52,sewLength:8};
assert.ok(api.optimizationImproves(baseAudit,{...baseAudit,short:20}));
assert.ok(!api.optimizationImproves(baseAudit,{...baseAudit,short:20,long:8}));
assert.ok(!api.optimizationImproves(baseAudit,{...baseAudit,short:20,uncut:5}));
const repeat=embossSize=>api.fvBuildPaths(shape,{type:'embossed',patterns:{embossed:'diamond',embossSize},
 spacing:.45,pull:0,underlay:false,chain:false,ties:false}).filter(p=>p.role==='emboss-relief');
assert.ok(repeat(3).length>repeat(8).length,'repeat size changes the physical texture');
const tile=Patterns.decorative([ring(0,0,20,20)],'directional-tatami',{pattern:'basket',spacing:.45});
const spans=tile.flatMap(p=>p.slice(1).map((b,i)=>[b.x-p[i].x,b.y-p[i].y]));
assert.ok(spans.some(([x,y])=>Math.abs(x)>1&&Math.abs(y)<1e-8));
assert.ok(spans.some(([x,y])=>Math.abs(y)>1&&Math.abs(x)<1e-8));
const textured=Patterns.satinTexture([[{x:0,y:0},{x:0,y:4}]],'ribbed')[0];
assert.ok(textured.some((p,i)=>i&&p.y<textured[i-1].y),'satin texture actually sews back over a partial span');
for(const [type,choices] of Object.entries(Patterns.choices)){
 const results=Object.keys(choices).map(pattern=>JSON.stringify(needlePath(sew(type,pattern))));
 assert.equal(new Set(results).size,results.length,type+' variants remain distinct after JEF quantization');
}
for(const type of Object.keys(Patterns.types)){
 const base={type,spacing:.45,stitch:3,run:2,pull:0,underlay:false,ties:false,chain:false};
 const overlay=overrides=>api.fvBuildPaths(shape,{...base,patterns:{relief:'honeycomb',reliefSize:5,...overrides}});
 const plain=api.fvBuildPaths(shape,base);
 assert.ok(steps(overlay({})).length>steps(plain).length,type+' sews the optional relief');
 assert.notDeepEqual(needlePath(overlay({})),needlePath(overlay({reliefAngle:38,reliefPasses:3})));
}
const anchor={x:13,y:11};
const startRecipe={type:'fill',patterns:{fill:'basket'},spacing:.46,stitch:3,run:2,
 underlay:false,chain:false,ties:false,pull:0};
const defaultStart=api.fvBuildPaths(shape,startRecipe)[0][0];
const manualStart=api.fvBuildPaths(shape,{...startRecipe,startPoint:anchor})[0][0];
assert.ok(distance(manualStart,anchor)<2.5);
assert.ok(distance(manualStart,anchor)<distance(defaultStart,anchor),'entry chooses a nearby tile when there is no underlay');

const applique=sew('applique','blanket');
assert.deepEqual([...new Set(applique.map(p=>p.role))],['applique-placement','applique-tackdown','applique-finish']);
const surviving=JSON.parse(JSON.stringify(applique));
assert.equal(surviving[0][0].role,'applique-placement');
const out=[];
api.makePathsToEvents(applique,{angle:0,offsetX:0,offsetY:0},1,1,out);
for(const e of out)e.orderKey='shape:1';
const reordered=api.reorderStitchEvents(out);
assert.deepEqual(api.palette,[1,1,1]);
const sewn=Jef.write(reordered,{palette:api.palette}).parsed;
assert.equal(sewn.colorChanges,2);
assert.equal(sewn.colors,3);
assert.deepEqual(sewn.palette,[1,1,1]);
const blocks=[0];
for(const event of sewn.events){
 if(event.type==='color')blocks.push(0);
 if(event.type==='stitch')blocks[blocks.length-1]++;
}
assert.ok(blocks.every(n=>n>0),'every fabric stage includes actual needle points');

const center={x:0,y:0},oval={rx:16.8,ry:20.5,width:4.3,center};
const logo={center,scaleX:1,scaleY:1,fvSource:{kind:'fill',physical:true,oval,rings:Patterns.ovalRings(oval.rx,oval.ry,oval.width,center)},
 fvRecipe:{type:'satin',ovalWidth:4.3,satinMax:6.5,satinSpacing:.4,pull:.12,underlay:false,ties:true}};
assert.ok(api.fvRegenerateLayer(logo));
assert.equal(logo.paths.length,1);
const originalPoints=logo.paths[0].length;
logo.scaleX=3;logo.scaleY=2;
assert.ok(api.fvRegenerateLayer(logo));
assert.equal(logo.fvSource.oval.width,4.3);
assert.ok(logo.paths[0].length>originalPoints*2,'longer perimeter adds stitches rather than stretching the original');
logo.fvRecipe.ovalWidth=8;
logo.fvRecipe.satinMax=3.5;
logo.fvRecipe.patterns={satin:'wave'};
settings.width=55;
assert.ok(api.fvRegenerateLayer(logo));
assert.ok(logo.paths.length>2);
assert.ok(Math.abs(logo.fvSource.oval.width*1.1-8)<1e-8);
const events=logo.paths.flatMap(p=>p.map((q,i)=>({type:i?'stitch':'jump',x:q.x*1.1,y:q.y*1.1,jumpNeedsTrim:i===0})));
const {parsed}=Jef.write(events,{palette:[1],autoTrimBetweenParts:true,autoTrimExposedJumps:true,trimMinDistanceMm:3});
const exportedStitches=parsed.events.filter(e=>e.type==='stitch');
assert.ok(exportedStitches.length>3000);
assert.ok(parsed.events.every((e,i)=>!i||e.type!=='stitch'||distance(e,parsed.events[i-1])<=3.5+1e-8));
settings.width=50;
let previousColumns=0,previousNeedles=0;
for(const scale of [.5,1,2,4]){
 const figure={center,scaleX:scale,scaleY:scale,
  fvSource:{kind:'fill',physical:true,nomuFigure:true,rings:Patterns.nomuSymbolRings.map(r=>r.map(([x,y])=>({x:(x-118)*.154,y:(y-139)*.154})))},
  fvRecipe:{type:'satin',direction:'angle',angle:0,satinMax:6.5,satinSpacing:.4,pull:.12,underlay:'auto',ties:true}};
 assert.ok(api.fvRegenerateLayer(figure));
 const {columns}=figure.fvSatinStats;
 assert.ok(columns>previousColumns,'scaling increases the generated satin columns at '+scale);
 previousColumns=columns;
 const stitches=needlePath(figure.paths);
 assert.ok(stitches.length>previousNeedles);
 previousNeedles=stitches.length;
 assert.ok(steps(figure.paths).every(d=>d<=6.5+1e-8),'figure satin respects its span cap at '+scale);
}
let previousLanes=0;
for(const scale of [.5,1,2,4]){
 const scaled={center,scaleX:scale,scaleY:scale,
  fvSource:{kind:'fill',physical:true,oval:{rx:16.8,ry:20.5,width:4.3,center},rings:Patterns.ovalRings(16.8,20.5,4.3,center)},
  fvRecipe:{type:'satin',ovalMode:'scale',satinMax:6.5,satinSpacing:.4,pull:.12,underlay:false,ties:true}};
 assert.ok(api.fvRegenerateLayer(scaled));
 assert.ok(Math.abs(scaled.fvSource.oval.width-4.3*scale)<1e-8);
 if(scale>1)assert.ok(scaled.fvSatinStats.columns>previousLanes);
 assert.ok(steps(scaled.paths).every(d=>d<=6.5+1e-8),'turning oval respects its stitch limit at '+scale);
 previousLanes=scaled.fvSatinStats.columns;
}
const text=Lettering.layout({font:'micro-narrow',content:'I\nO M',height:4.5,align:'right'});
assert.equal(text.letters.map(l=>l.content).join(''),'IOM');
assert.ok(text.letters[0].y<text.letters[1].y&&text.letters[1].x<text.letters[2].x);
console.log('All pattern families, JEF geometry, relief, appliqué stops and entry routing PASS');


// Editable Vector handoff layers use physical units. Saving/reopening must
// retain source contours and recipes, then exporting must use the new plan.
const handedOff=[];
const recipe={type:'fill',angle:0,spacing:.45,stitch:3,underlay:false,pull:0,ties:false};
for(let row=0;row<4;row++)for(let column=0;column<6;column++){
 const x=-50+column*17,y=-16.3+row*8.6,w=15,h=6.8;
 const src={kind:'fill',rings:[ring(x,y,x+w,y+h)]};
 handedOff.push({id:handedOff.length+1,name:'Vector shape',center:{x:x+w/2,y:y+h/2},threadCode:1,
  fervorVector:{hex:'#000000'},fvSource:src,fvRecipe:{...recipe},paths:api.fvBuildPaths(src,recipe)});
}
function restoreLayers(layers){api.restoreLayers(JSON.parse(JSON.stringify(layers)));}
function exportVector(){
 const events=[];
 api.appendJefOverlayEvents(events,{angle:0,offsetX:0,offsetY:0});
 const bytes=Jef.write(events,{palette:api.palette}).buffer;
 const read=Jef.parse(bytes);
 const sewn=read.events.filter(event=>event.type==='stitch');
 const bounds=api.layerBounding([sewn]);
 return {w:bounds.maxx-bounds.minx,h:bounds.maxy-bounds.miny,stitches:sewn.length};
}
restoreLayers(handedOff);
const beforeVector=exportVector();
const original=api.vectorDesignBounds(api.editableVectorLayers());
assert.equal(original.maxx-original.minx,100);
assert.ok(Math.abs(beforeVector.w-100)<.6,'100 mm handoff writes full-width needle coordinates');
assert.equal(api.resizeVectorDesign(90),true);
restoreLayers(api.layers);
const resized=api.vectorDesignBounds(api.editableVectorLayers());
assert.ok(Math.abs(resized.maxx-resized.minx-90)<.0001);
const afterVector=exportVector();
assert.ok(Math.abs(afterVector.w-90)<.6,'90 mm resize survives save/reopen and JEF export');
assert.ok(Math.abs(afterVector.h-beforeVector.h*.9)<.8,JSON.stringify({beforeVector,afterVector}));
assert.ok(afterVector.stitches<beforeVector.stitches);
console.log('24 editable Vector parts: '+beforeVector.w.toFixed(1)+' × '+beforeVector.h.toFixed(1)+' mm / '+beforeVector.stitches+' stitches → '+afterVector.w.toFixed(1)+' × '+afterVector.h.toFixed(1)+' mm / '+afterVector.stitches+' stitches decoded from JEF.');

(()=>{
'use strict';
const $=id=>document.getElementById(id);
const canvas=$('design-canvas'),ctx=canvas.getContext('2d'), maskCanvas=document.createElement('canvas');
const maskCtx=maskCanvas.getContext('2d',{willReadFrequently:true});
const stitchPatterns=window.FervorPatterns;
const UI={width:$('size-mm'),sizeNumber:$('size-number'),threshold:$('threshold'),spacing:$('spacing'),length:$('length'),angle:$('rotation'),fillAngle:$('fill-angle'),offsetX:$('offset-x'),offsetY:$('offset-y'),brushSize:$('brush-size'),style:$('stitch-style'),hoop:$('hoop-select'),showJumps:$('show-jumps'),showArt:$('show-art'),showHoop:$('show-hoop'),showSequence:$('show-sequence-overlay')};
// 500E LE physical embroidery areas from the machine's Instruction Book, page 16.
// Stitch Lab shortcuts apply only while Stitch Lab is the visible workspace.
window.FervorStitchKeys=()=>{const c=document.body.classList;return !window.FervorFileBrowser?.active&& !(c.contains('fervor-home-open')||c.contains('fv-vector-active')||c.contains('fv-compose-active')||c.contains('fv-radar-active'));};
const PHYSICAL_HOOPS={SQ14b:[140,140],RE20b:[140,200],SQ20b:[200,200],RE28b:[200,280]};
let selectedMachineHoop='RE20b';
let readiness={ok:false,hard:[],advisory:[],bounds:null,stats:null};
function machineAssessment(evts){
 let h=PHYSICAL_HOOPS[selectedMachineHoop]||PHYSICAL_HOOPS.RE20b;
 const hard=[],advisory=[],b=calcBounds(evts),trips=JefCore.jumpRuns(evts),trimThreshold=num('seq-trim');
 const jumpsOver3=trips.filter(j=>j.distance>=3).length;
 const jumpsAboveTrim=trimThreshold>0?trips.filter(j=>j.distance>=trimThreshold).length:0;
 const jumpLength=trips.reduce((total,j)=>total+j.distance,0);
 const internalJumps=trips.filter(j=>j.from.orderKey&&j.from.orderKey===j.next.orderKey).length,externalJumps=trips.length-internalJumps;
 let prev=null,maxStitch=0,longStitches=0,shortStitches=0;
 for(const e of evts){
  if(e.type==='color'){prev=null;continue;}
  if(e.type==='stitch'&&prev){
   const d=dist(e,prev);
   maxStitch=Math.max(maxStitch,d);
   if(d>9)longStitches++;
   if(d<.25)shortStitches++;
  }
  prev=e;
 }
 // Bounds must be contained in the selected centered hoop, not merely the right total width/height.
 if(b.minx<-h[0]/2-.01||b.maxx>h[0]/2+.01||b.miny<-h[1]/2-.01||b.maxy>h[1]/2+.01)
    hard.push(`Stitch path goes outside ${selectedMachineHoop} (${h[0]} × ${h[1]} mm). Resize, rotate or reposition it, or select the larger hoop you will actually use.`);
 if(!evts.some(e=>e.type==='stitch'))hard.push('No sewing stitches present.');
 if(longStitches)advisory.push(`${longStitches} segments exceed 9 mm; inspect long stitches before a trial sew.`);
 if(shortStitches>20)advisory.push(`${shortStitches} very short stitch movements (<0.25 mm); inspect density and possible thread buildup.`);
 if(jumpsAboveTrim)advisory.push(`${jumpsAboveTrim} jump(s) meet the assumed ${trimThreshold} mm auto-trim threshold. Change the machine's trim settings separately if needed.`);
 if(garment==='cap')advisory.push('The manual does not document assembled-cap hooping. Verify your particular cap attachment and actual safe area.');
 for(const t of textLayers)if(t.content&&t.height<5)advisory.push(`Text "${t.content.slice(0,12)}" is ${t.height} mm tall; stitch legibility needs testing.`);
 let summary={maxStitch,maxJump3:jumpsOver3,shortStitches,longStitches,jumpsAboveTrim,jumpLength,internalJumps,externalJumps};
 return {ok:hard.length===0,hard,advisory,bounds:b,stats:summary,hoop:selectedMachineHoop,dimensions:h};
}
// Janome 500E LE facts used by the Ready to Sew card (Instruction Book pp.13, 16-17, 26-30, 51-53).
const MACHINE_ADVICE={
 'structured-cap':{stabilizer:'Tear-away cap backing (firm, stable fabric).',needle:'Universal #14 or red-tip needle (heavy weight).'},
 woven:{stabilizer:'Tear-away (stable woven fabric).',needle:'Blue-tip needle for fine/medium wovens; #14 or red tip for canvas.'},
 knit:{stabilizer:'Cut-away or iron-on (knits and unstable fabrics).',needle:'Blue-tip needle.'},
 fleece:{stabilizer:'Cut-away backing plus water-soluble topping on the face, so the nap does not swallow stitches.',needle:'Universal #14 or red-tip needle.'}};
let densityGrid=null,showDensityMap=false;
// Thread coverage per 1 mm cell, in thread layers (0.4 mm thread). Above ~3 layers fabric puckers and needles deflect.
function coverageGrid(evts){const b=calcBounds(evts),cell=1,cols=Math.max(1,Math.ceil(b.w/cell)+2),rows=Math.max(1,Math.ceil(b.h/cell)+2);if(cols*rows>400000)return null;const g=new Float32Array(cols*rows);let prev=null;
 for(const e of evts){if(e.type==='color'){prev=null;continue;}if(e.type==='stitch'&&prev){const len=Math.hypot(e.x-prev.x,e.y-prev.y),n=Math.max(1,Math.ceil(len/.5)),inc=len/n*.4;for(let k=0;k<n;k++){const t=(k+.5)/n,x=Math.floor((prev.x+(e.x-prev.x)*t-b.minx)/cell)+1,y=Math.floor((prev.y+(e.y-prev.y)*t-b.miny)/cell)+1;g[y*cols+x]+=inc;}}prev=e;}
 let heavy=0,over=0,max=0;for(const v of g){if(v>max)max=v;if(v>3.5)over++;else if(v>2.6)heavy++;}return {g,cols,rows,minx:b.minx-cell,miny:b.miny-cell,cell,heavy,over,max};}
function drawDensityMap(xy,scale){if(!showDensityMap||!densityGrid)return;const d=densityGrid,px=d.cell*scale;ctx.save();
 for(let y=0;y<d.rows;y++)for(let x=0;x<d.cols;x++){const v=d.g[y*d.cols+x];if(v<=2.6)continue;const p=xy(d.minx+x*d.cell,d.miny+y*d.cell);ctx.fillStyle=v>3.5?'rgba(220,38,38,.55)':'rgba(245,158,11,.45)';ctx.fillRect(p.x,p.y,px+.5,px+.5);}
 ctx.font='bold 12px Calibri, Arial, sans-serif';const lx=canvas.width-262;ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(lx,14,248,26);ctx.fillStyle='#fff';ctx.fillText('Density: amber >2.6 · red >3.5 thread layers',lx+8,32);ctx.restore();}
function readyToSewHTML(){const esc=v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const stitches=[],trimAt=num('seq-trim')||3;let block=0,count=0,trims=0,prev=null,travel=0;
 for(const e of events){if(e.type==='color'){stitches.push(count);count=0;block++;prev=null;continue;}if(e.type==='stitch'){if(travel>=trimAt)trims++;travel=0;count++;}else if(e.type==='jump'&&prev)travel+=Math.hypot(e.x-prev.x,e.y-prev.y);prev=e;}stitches.push(count);
 const total=stitches.reduce((a,b)=>a+b,0),spm=+$('sim-machine-speed')?.value||600,secs=typeof simTimes!=='undefined'&&simTimes?.length?simTimes[simTimes.length-1]:total/spm*60,b=readiness.bounds||calcBounds(events),h=readiness.dimensions||[140,200];
 const state=!readiness.ok?'blocked':readiness.advisory.length?'review':'passed',label={blocked:'Blocked',review:'Needs review',passed:'Passed'}[state],action={blocked:readiness.hard[0]||'Fix the issue above before exporting.',review:'Export is allowed. Check the notes below, then do a test sew-out.',passed:'Ready to export. Still test on scrap fabric first.'}[state];
 const swatch=i=>embroideryThread(i);
 const colors=stitches.map((n,i)=>`<li><span class="fv-rts-swatch" style="background:${esc(swatch(i))}"></span>${i+1}. JEF ${esc(exportPalette[i]??1)}<span>${n.toLocaleString()} ST</span></li>`).join('');
 const advice=MACHINE_ADVICE[$('fabric-type')?.value]||MACHINE_ADVICE.woven,dense=densityGrid&&(densityGrid.over>0||densityGrid.heavy>40);
 const allowance=b.minx-5<-h[0]/2||b.maxx+5>h[0]/2||b.miny-5<-h[1]/2||b.maxy+5>h[1]/2;
 const mins=Math.max(1,Math.round(secs/60));
 return `<div class="fv-rts-head"><span class="fv-rts-badge ${state}">${label}</span><span>${esc(action)}</span></div>
 <dl class="fv-rts-grid"><div><dt>Hoop</dt><dd>${esc(readiness.hoop)} · ${h.join('×')} mm</dd></div><div><dt>Design</dt><dd>${b.w.toFixed(1)} × ${b.h.toFixed(1)} mm</dd></div><div><dt>Speed</dt><dd>${spm} spm</dd></div><div><dt>Colours</dt><dd>${stitches.length}</dd></div><div><dt>Stitches</dt><dd>${total.toLocaleString()}</dd></div><div><dt>Sew time</dt><dd>≈ ${mins} min</dd></div><div><dt>Trims</dt><dd>${trims} (jumps ≥ ${trimAt} mm)</dd></div><div><dt>Max layers</dt><dd>${densityGrid?densityGrid.max.toFixed(1):'—'}</dd></div></dl>
 <ol class="fv-rts-colors">${colors}</ol>
 <ul class="fv-rts-advice"><li><b>Stabilizer:</b> ${esc(advice.stabilizer)}${dense?' This design is dense, so add a second layer of stabilizer or use a thicker one.':''}</li><li><b>Needle:</b> ${esc(advice.needle)} Use Janome embroidery bobbin thread, or fit the high-tension bobbin holder for other bobbin threads.</li><li><b>On the machine:</b> set the maximum speed to ${spm} spm (400–860; 600 is the machine default). Thread Cutting <i>Easy</i> trims jumps of 3 mm or more and at colour changes. To use FERVOR's cut markers, turn on <i>Advanced → Cutting Command</i>.</li><li><b>Positioning:</b> the machine's fine adjustment only allows ±5 mm and ±5°, so place the design here. Run <i>Trace</i> before sewing${allowance?'. The design is within 5 mm of the hoop edge, so the machine will reduce its basting allowance':''}.</li></ul>
 <button type="button" class="btn soft" id="fv-density-toggle" aria-pressed="${showDensityMap}">${showDensityMap?'Hide':'Show'} density map</button>`;}
function updateMachinePanel(){
 readiness=machineAssessment(events);densityGrid=coverageGrid(events);
 if(densityGrid?.over)readiness.advisory.push(`${densityGrid.over} mm² carry more than 3.5 thread layers. Expect puckering or needle deflection; reduce density or overlap, or add stabilizer.`);
 let panel=$('machine-check');let st=readiness.ok?'Within selected hoop':'Outside selected hoop';
 panel.className='readiness '+(readiness.ok?'good':'bad');
 panel.innerHTML='<strong>'+st+' · '+readiness.hoop+' · '+readiness.dimensions.join(' × ')+' mm</strong>'+
 '<span>Extent: '+readiness.bounds.w.toFixed(1)+' × '+readiness.bounds.h.toFixed(1)+' mm · max stitch '+readiness.stats.maxStitch.toFixed(1)+' mm</span>'+
 (readiness.hard.length?'<ul>'+readiness.hard.map(v=>'<li>'+v+'</li>').join('')+'</ul>':'')+
 (readiness.advisory.length?'<ul>'+readiness.advisory.map(v=>'<li>'+v+'</li>').join('')+'</ul>':'');
 let card=$('fv-ready-to-sew');if(!card&&panel){card=document.createElement('section');card.id='fv-ready-to-sew';card.className='fv-ready-to-sew';card.setAttribute('aria-label','Ready to sew summary');panel.before(card);}
 if(card){card.innerHTML=readyToSewHTML();card.querySelector('#fv-density-toggle')?.addEventListener('click',()=>{showDensityMap=!showDensityMap;updateMachinePanel();render();});}
 const fvFit=$('fervor-fit-summary');if(fvFit){fvFit.textContent=(!readiness.ok?'Blocked':readiness.advisory.length?'Needs review':'Passed')+(readiness.ok?` · ${selectedMachineHoop} · ${readiness.bounds.w.toFixed(1)} × ${readiness.bounds.h.toFixed(1)} mm`:` · check the ${selectedMachineHoop} hoop`);fvFit.classList.toggle('fv-fit-error',!readiness.ok);}
 const hoopChip=$('hoop-fit-status');
 const hasStitches=events.some(e=>e.type==='stitch');
 if(hoopChip){hoopChip.textContent=!hasStitches?selectedMachineHoop+' · EMPTY':readiness.ok?'✓ WITHIN '+selectedMachineHoop+' HOOP':'! CHECK '+selectedMachineHoop+' HOOP';hoopChip.classList.toggle('fit-pass',hasStitches&&readiness.ok);hoopChip.classList.toggle('fit-alert',hasStitches&&!readiness.ok);}
 $('export-jef').disabled=!readiness.ok;
 $('export-jef-bottom').disabled=!readiness.ok;
}
const DEFAULTS={width:100,threshold:165,spacing:.45,length:4,angle:0,fillAngle:0,offsetX:0,offsetY:0,brushSize:6,style:'auto',hoop:'auto',underlayType:'auto',fabricType:'structured-cap',pullComp:.2,satinOverlap:.25,satinDirection:'auto',showJumps:false,showArt:true,showHoop:true,showSequence:false,crossEnabled:false,crossSpacing:1.0,crossAngle:90,crossMode:'overlay',seqConnect:true,seqMaxLink:14,seqOrder:'nearest',seqTrim:3};
let sourceImage=null,sourceDataUrl=null,sourceName='GALLOP',mode='image',originalJef=null,imported=[],palette=[1],originalBounds={width:100,height:30,center:{x:0,y:0}},events=[],manual=[],activeStroke=null,selectedNode=null;
let tool='select',lastStats=null,undoStack=[],redoStack=[],generationTimer=null,paintInProgress=false,dragNode=false,display={scale:1,cx:canvas.width/2,cy:canvas.height/2};
let maskData=null,maskVersion=0,computedVersion=-1;
const DEFAULT_PREVIEW_MODE='thread';
const STITCH_PREVIEW_LABELS={
 thread:'Realistic thread on the drafting grid',
 realistic:'Thread and fabric simulation',
 stitches:'Stitch geometry · actual needle paths',
 artwork:'Original artwork for cleanup'
};
let previewMode=DEFAULT_PREVIEW_MODE,stitchPreview=true,viewZoom=1.0;
let fitOnNextRebuild=false;
let viewPan={x:0,y:0},panGesture=null,spaceHeld=false,snapEnabled=true;
let previewFabric='linen',previewThread='auto',previewThickness=.38,previewOriginal=false;
const FABRIC_SWATCHES={linen:[233,226,211],navy:[36,49,67],black:[33,35,37],forest:[42,65,53],sand:[192,166,130],gray:[179,182,177]};
const THREAD_SWATCHES={charcoal:'#222321',cream:'#e8dcc3',white:'#f4f5ed',gold:'#c89b46',red:'#b7523b',green:'#315f3b',blue:'#3269a5'};
let fabricCache={key:null,canvas:null};let cleanCapture=false;
// Indexed mask objects support individual stitch strategy and selective removal.
let objects=[], componentMap=null, selectedObject=-1,objectVersion=-1, objectOverrides={},smallArea=.18, garment='cap';
// LAYER EDITOR: sources remain immutable; transforms alter only the exported stitch plan.
function layerBounding(points){let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity;for(const path of points)for(const p of path){if(p.x<minx)minx=p.x;if(p.x>maxx)maxx=p.x;if(p.y<miny)miny=p.y;if(p.y>maxy)maxy=p.y;}return {minx,maxx,miny,maxy};}
function makeJefLayer(paths,colorIndex,name){const b=layerBounding(paths);return {id:nextJefLayerId++,name:name||`Stitch part ${nextJefLayerId-1}`,paths,colorIndex,hidden:false,dx:0,dy:0,scaleX:1,scaleY:1,rotation:0,center:{x:(b.minx+b.maxx)/2,y:(b.miny+b.maxy)/2}};}
async function addJefOverlay(buffer,name){try{
 let j=JefCore.parse(buffer);let newLayers=splitJefIntoLayers(j.events,j.center);
 if(mode==='jef'){ // place independently in the same JEF edit surface, keeping dimensions in millimeters
  const factor=originalBounds.width/Math.max(.1,getSettings().width);for(const L of newLayers){for(const path of L.paths)for(const p of path){p.x*=factor;p.y*=factor;}L.center.x*=factor;L.center.y*=factor;}
 }
 for(const L of newLayers){L.name=name.replace(/\.jef$/i,'')+' / '+L.name;L.threadCode=j.palette[L.colorIndex]??1;}
 captureLayerUndo();jefLayers.push(...newLayers);selectJefLayer(newLayers[0]?.id??null);queueRebuild();switchTab('layers');alertMessage(`Added ${newLayers.length} editable JEF ${newLayers.length===1?'part':'parts'} over the current design. Select, drag, resize, hide, or delete individual parts.`);
 }catch(e){alertMessage('Could not place this JEF: '+e.message,true);}}
function splitJefIntoLayers(source,center){let layers=[],paths=[],run=[],last={x:0,y:0},color=0,seen=false,trim=false,individual=source.filter(e=>e.type==='jump').length<=64;
 function flush(){if(run.length>=2)paths.push(run);run=[];}
 function finish(){flush();if(paths.length){if(individual){for(const path of paths)layers.push(makeJefLayer([path],color,`Part ${layers.length+1}`));}else layers.push(makeJefLayer(paths,color,`Part ${layers.length+1} · ${paths.length} runs`));paths=[];}}
 for(const e of source){if(e.type==='color'){finish();color++;seen=false;trim=false;continue;}
  const p={x:e.x-center.x,y:e.y-center.y};
  if(e.type==='jump'){flush();trim||=!!e.trimFromSource;run=[trim?{...p,trimFromSource:true}:p];seen=true;}
  else if(e.type==='stitch'){if(!run.length)run=[seen?last:{x:0-center.x,y:0-center.y}];run.push(p);seen=true;trim=false;}
  last=p;
 }
 finish();return layers;
}
function layerBasePt(p,L){let ax=L.center?.x||0,ay=L.center?.y||0,a=(L.rotation||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),xx=(p.x-ax)*(L.scaleX??1),yy=(p.y-ay)*(L.scaleY??1);return {x:ax+xx*c-yy*s+(L.dx||0),y:ay+xx*s+yy*c+(L.dy||0)};}
function transformLayerPoint(p,L){return layerBasePt(p,L);}
function layerPointWorld(p,L){let s=getSettings(),q=layerBasePt(p,L);return transformPoint(q,0,0,s,mode==='jef');}
function layerWorldBounds(L){let pts=[];for(const path of L.paths)for(const p of path)pts.push(layerPointWorld(p,L));return layerBounding([pts]);}

/* Group-aware selection. Object keys stay stable across list repaint and JEF edits. */
let selectedParts=new Set(),multiSelectionMode=false,layerClipboard=null,rangeAnchor=null,groupDragCapture=null;
const partKey=(kind,id)=>`${kind}:${id}`;
function selectedPartRecords(){return [...selectedParts].map(key=>{let [kind,id]=key.split(':');id=+id;let L=kind==='jef'?jefLayers.find(x=>x.id===id):objects[id-1];return L?{kind,id,L,key}:null;}).filter(Boolean);}
function selectionSync(){const ps=selectedPartRecords();selectedParts=new Set(ps.map(p=>p.key));const last=ps.at(-1);
 selectedJefLayerId=last?.kind==='jef'?last.id:null;selectedObject=last?.kind==='raster'?last.id:-1;
 if($('shape-select'))$('shape-select').value=String(selectedObject);
 if(typeof syncObjectControls==='function')syncObjectControls();if(typeof syncBorderControls==='function')syncBorderControls();
 if($('multi-selection-count'))$('multi-selection-count').textContent=`${ps.length} selected`;
 if($('layer-copy'))$('layer-copy').disabled=!ps.length;
 if($('layer-outline-only'))$('layer-outline-only').disabled=!ps.length;
 if($('layer-delete'))$('layer-delete').disabled=!ps.length;
 if($('layer-hide'))$('layer-hide').disabled=!ps.length;
 if($('layer-duplicate'))$('layer-duplicate').disabled=!ps.length;
}
function selectPart(kind,id,event=null){const key=partKey(kind,id),add=!!(event&&(event.shiftKey||event.metaKey||event.ctrlKey))||multiSelectionMode;
 if(event?.shiftKey&&event?.target?.closest('.layer-item')){
  const keys=[...document.querySelectorAll('.layer-list .layer-item')].map(x=>x.dataset.key);
  const a=keys.indexOf(rangeAnchor),b=keys.indexOf(key);if(a>=0&&b>=0){if(!event.metaKey&&!event.ctrlKey&&!multiSelectionMode)selectedParts.clear();for(let i=Math.min(a,b);i<=Math.max(a,b);i++)selectedParts.add(keys[i]);}
  else selectedParts.add(key);
 }else if(add){if(selectedParts.has(key))selectedParts.delete(key);else selectedParts.add(key);}
 else{selectedParts.clear();selectedParts.add(key);}
 rangeAnchor=key;selectedText=-1;focusedOrderPart=null;selectionSync();refreshLayerList();render();}
function selectAllParts(){selectedParts=new Set([...jefLayers.map(x=>partKey('jef',x.id)),...(mode==='image'?objects.map(x=>partKey('raster',x.id)):[])]);selectionSync();refreshLayerList();render();}
function clearPartSelection(){focusedOrderPart=null;selectedParts.clear();selectedJefLayerId=null;selectedObject=-1;selectionSync();refreshLayerList();render();}
function selectionBounds(){let ps=selectedPartRecords();if(!ps.length)return null;const bb=ps.map(p=>partBounds(p));return{minx:Math.min(...bb.map(x=>x.minx)),miny:Math.min(...bb.map(x=>x.miny)),maxx:Math.max(...bb.map(x=>x.maxx)),maxy:Math.max(...bb.map(x=>x.maxy))};}
function partBounds(p){if(p.kind==='jef')return layerWorldBounds(p.L);const o=p.L,s=getSettings(),w=s.width,h=w*maskCanvas.height/maskCanvas.width,sc=(o.scale||100)/100,sx=sc*(o.stretchX||1),sy=sc*(o.stretchY||1),midx=(o.cx/maskCanvas.width-.5)*w,midy=(o.cy/maskCanvas.height-.5)*h;
 let pts=[];for(let x of [o.bb[0],o.bb[2]+1])for(let y of [o.bb[1],o.bb[3]+1])pts.push(transformPoint({x:midx+((x/maskCanvas.width-.5)*w-midx)*sx+(o.dx||0),y:midy+((y/maskCanvas.height-.5)*h-midy)*sy+(o.dy||0)},w,h,s));return layerBounding([pts]);}
function snapshotLayerState(){return JSON.stringify({jefLayers,vectorHandoff,raster:objects.map(o=>({id:o.id,enabled:o.enabled,style:o.style,patterns:o.patterns,startPoint:o.startPoint||null,dx:o.dx,dy:o.dy,scale:o.scale,stretchX:o.stretchX,stretchY:o.stretchY,borderEnabled:o.borderEnabled,borderOnly:o.borderOnly,borderWidth:o.borderWidth,borderStep:o.borderStep,borderPatterns:o.borderPatterns,borderPosition:o.borderPosition,borderUnderlay:o.borderUnderlay,fvNodeRings:o.fvNodeRings||null})),selection:[...selectedParts],textLayers,selectedText,stitchOrderKeys,annotations});}
function restoreLayerState(str){let state=JSON.parse(str);jefLayers=Array.isArray(state)?state:state.jefLayers;if(!Array.isArray(state))vectorHandoff=!!state.vectorHandoff;for(const item of (state.raster||[])){let o=objects.find(o=>o.id===item.id);if(o)Object.assign(o,item);}restoreNotes(state.annotations);selectedParts=new Set(state.selection||[]);if(Array.isArray(state.textLayers)){textLayers=state.textLayers;selectedText=state.selectedText??-1;if(state.stitchOrderKeys)stitchOrderKeys=state.stitchOrderKeys;refreshTextPicker();if(selectedText>=0)setTextFields(textLayers[selectedText]);}selectionSync();syncMode();queueRebuild();}
function partMoveCapture(start){return{kind:'group',start:fromWorld(start.x,start.y,getSettings()),items:selectedPartRecords().map(p=>({kind:p.kind,id:p.id,dx:p.L.dx||0,dy:p.L.dy||0})),anchor:selectionBounds()};}
function partResizeCapture(start){let c=partMoveCapture(start);c.kind='group-resize';c.startWorld={...start};c.items=c.items.map(p=>{let obj=p.kind==='jef'?jefLayers.find(x=>x.id===p.id):objects[p.id-1];let b=partBounds({kind:p.kind,L:obj});return {...p,scaleX:obj.scaleX||1,scaleY:obj.scaleY||1,scale:obj.scale||100,stretchX:obj.stretchX||1,stretchY:obj.stretchY||1,centerWorld:{x:(b.minx+b.maxx)/2,y:(b.miny+b.maxy)/2}};});return c;}
function copySelectedParts(){let parts=selectedPartRecords();if(!parts.length)return alertMessage('Select one or more parts first.',true);
 const settings=getSettings(),w=settings.width,h=w*maskCanvas.height/Math.max(1,maskCanvas.width);let shapes=parts.some(p=>p.kind==='raster')?smartPaths(settings,w,h):[];
 let entries=[];for(const p of parts){if(p.kind==='jef'){entries.push({kind:'jef',layer:structuredClone(p.L)});continue;}
 let paths=shapes.filter(path=>path.ownerId===p.id).map(path=>path.map(a=>({x:a.x,y:a.y})));if(paths.length)entries.push({kind:'raster',layer:{paths,name:'Shape '+p.id,colorIndex:0,threadCode:palette[0]??1,dx:0,dy:0,scaleX:1,scaleY:1,rotation:0}});
 }if(!entries.length)return alertMessage('The selected parts have no stitches to copy.',true);
 layerClipboard={entries,mode,sourceWidth:getSettings().width,sourceName};$('layer-paste').disabled=false;alertMessage(`Copied ${entries.length} part(s). Paste with ⌘/Ctrl+V or the Paste button.`);}
function pasteCopiedParts(){if(!layerClipboard?.entries?.length)return alertMessage('Copy a part first.',true);
 if(layerClipboard.sourceName!==sourceName||layerClipboard.mode!==mode)return alertMessage('This clipboard belongs to another design. Save its parts as JEF, then use Add JEF file to import them.',true);
 captureLayerUndo();const emblemCopies=new Map();let newIds=[];for(const item of layerClipboard.entries){let old=item.layer,cp;
 if(item.kind==='jef'){cp=structuredClone(old);cp.id=nextJefLayerId++;cp.name=old.name+' copy';
  if(cp.nomuEmblem){
   if(!emblemCopies.has(cp.nomuEmblem))emblemCopies.set(cp.nomuEmblem,createEditorId());
   cp.nomuEmblem=emblemCopies.get(cp.nomuEmblem);
  }
  cp.dx=(cp.dx||0)+4;cp.dy=(cp.dy||0)+4;}
 else{cp=makeJefLayer(structuredClone(old.paths),0,old.name+' copy');cp.threadCode=old.threadCode;cp.dx=4;cp.dy=4;}
 cp.hidden=false;jefLayers.push(cp);newIds.push(cp.id);
 }selectedParts=new Set(newIds.map(id=>partKey('jef',id)));rangeAnchor=[...selectedParts][0];selectionSync();refreshLayerList();queueRebuild();alertMessage(`Pasted ${newIds.length} editable stitch part(s), offset 4 mm to make them visible.`);}
/* Outline of imported stitches. Rasterize their actual stitched thread coverage,
   trace its outer boundary and, optionally, generate satin zigzag around it. */
function stitchLayerContour(L){let pp=L.paths.filter(path=>path.length>1);if(!pp.length)return [];
 const bounds=layerBounding(pp),margin=1.2,spanX=bounds.maxx-bounds.minx,spanY=bounds.maxy-bounds.miny,cell=Math.max(.22,Math.max(spanX,spanY)/900),W=Math.max(3,Math.ceil((spanX+2*margin)/cell)),H=Math.max(3,Math.ceil((spanY+2*margin)/cell));
 if(W*H>1600000)throw new Error('Imported shape too large for precise outline conversion');
 let off=document.createElement('canvas');off.width=W;off.height=H;let c=off.getContext('2d',{willReadFrequently:true});c.strokeStyle='#000';c.lineWidth=Math.max(1.8,.70/cell);c.lineJoin='round';c.lineCap='round';
 const X=x=>(x-bounds.minx+margin)/cell,Y=y=>(y-bounds.miny+margin)/cell;
 for(const path of pp){c.beginPath();c.moveTo(X(path[0].x),Y(path[0].y));for(const p of path.slice(1))c.lineTo(X(p.x),Y(p.y));c.stroke();}
 const alpha=c.getImageData(0,0,W,H).data;const ink=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&alpha[(y*W+x)*4+3]>80;
 const edges=new Map(),key=(x,y)=>`${x},${y}`;function add(x,y,a,b){const k=key(x,y),v=edges.get(k)||[];v.push([a,b]);edges.set(k,v);}
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(!ink(x,y))continue;if(!ink(x,y-1))add(x,y,x+1,y);if(!ink(x+1,y))add(x+1,y,x+1,y+1);if(!ink(x,y+1))add(x+1,y+1,x,y+1);if(!ink(x-1,y))add(x,y+1,x,y);}
 let contours=[];for(const k of [...edges.keys()]){while((edges.get(k)||[]).length){let [sx,sy]=k.split(',').map(Number),x=sx,y=sy,pts=[],n=0;
  do{pts.push({x:bounds.minx-margin+x*cell,y:bounds.miny-margin+y*cell});let choices=edges.get(key(x,y));if(!choices?.length)break;[x,y]=choices.pop();n++;}while((x!==sx||y!==sy)&&n<4*W*H);
  if(pts.length<6)continue;pts.push({...pts[0]});let simple=simplifyPath(pts,.20);if(simple.length<5)continue;
  let perimeter=0;for(let i=1;i<simple.length;i++)perimeter+=dist(simple[i-1],simple[i]);if(perimeter<2)continue;
  contours.push(simple);
 }}return contours.slice(0,500);
}
function satinFromContour(contour,width){const points=sampleClosedContour(contour,.44),output=[];if(points.length<4)return output;
 for(let i=0;i<points.length;i++){let a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length],vx=c.x-a.x,vy=c.y-a.y,l=Math.hypot(vx,vy)||1,nx=-vy/l,ny=vx/l;output.push({x:b.x+(i%2?1:-1)*nx*width/2,y:b.y+(i%2?1:-1)*ny*width/2});}
 output.push({...output[0]});return output;}
function applyOutlineToSelected(){const parts=selectedPartRecords();if(!parts.length)return alertMessage('Select at least one shape.',true);
 const method=$('layer-outline-method').value,width=Math.min(5,Math.max(.6,+$('layer-outline-width').value||1.2));captureLayerUndo();let changed=0,failed=0;
 for(const p of parts){if(p.kind==='raster'){let o=p.L;o.enabled=true;o.borderEnabled=method==='satin';o.borderOnly=method==='satin';o.style=method==='triple'?'triple':'outline';if(method==='satin'){o.borderWidth=width;o.borderStep=.42;o.borderPosition='center';o.borderUnderlay=false;}changed++;continue;}
  try{const contours=stitchLayerContour(p.L),paths=[];for(const boundary of contours){if(method==='satin'){let satin=satinFromContour(boundary,width);if(satin.length>3)paths.push(satin);}else{let linear=[boundary[0]];for(let i=1;i<boundary.length;i++)linear.push(...interpolated(boundary[i-1],boundary[i],2.5));paths.push(method==='triple'?reinforceRun(linear):linear);}}
   if(paths.length){p.L.paths=paths;p.L.center=(()=>{let b=layerBounding(paths);return{x:(b.minx+b.maxx)/2,y:(b.miny+b.maxy)/2};})();changed++;}else failed++;
  }catch(e){failed++;}
 }selectionSync();refreshLayerList();queueRebuild();alertMessage(`Outline Only applied to ${changed} part(s).${failed?' '+failed+' part(s) could not be traced.':''} JEF-derived outlines are approximations and require a stitch-out check.`,!!failed);}
function toggleSelectedVisibility(){let ps=selectedPartRecords();if(!ps.length)return;captureLayerUndo();const allHidden=ps.every(p=>p.kind==='jef'?p.L.hidden:!p.L.enabled);for(const p of ps){if(p.kind==='jef')p.L.hidden=!allHidden;else p.L.enabled=allHidden;}selectionSync();refreshLayerList();queueRebuild();}
function deleteSelectedParts(){let ps=selectedPartRecords();if(!ps.length)return;captureLayerUndo();let ids=new Set(ps.filter(x=>x.kind==='jef').map(x=>x.id));jefLayers=jefLayers.filter(x=>!ids.has(x.id));for(const p of ps)if(p.kind==='raster')p.L.enabled=false;clearPartSelection();queueRebuild();}
function duplicateSelectedParts(){copySelectedParts();pasteCopiedParts();}
function multiDragStart(wp,e,resizing=false){captureLayerUndo();dragLayer=resizing?partResizeCapture(wp):partMoveCapture(wp);canvas.setPointerCapture(e.pointerId);}

function selectedLayer(){return selectedJefLayerId!==null?jefLayers.find(x=>x.id===selectedJefLayerId):mode==='image'?objects[selectedObject-1]:null;}
function selectedLayerMetrics(){if(selectedParts.size>1)return selectionBounds();let o=selectedLayer();if(!o)return null;if(selectedJefLayerId!==null)return layerWorldBounds(o);let s=getSettings(),w=s.width,h=w*maskCanvas.height/maskCanvas.width,sc=(o.scale||100)/100,sx=sc*(o.stretchX||1),sy=sc*(o.stretchY||1);let midx=(o.cx/maskCanvas.width-.5)*w,midy=(o.cy/maskCanvas.height-.5)*h;let bounds={minx:(o.bb[0]/maskCanvas.width-.5)*w,maxx:((o.bb[2]+1)/maskCanvas.width-.5)*w,miny:(o.bb[1]/maskCanvas.height-.5)*h,maxy:((o.bb[3]+1)/maskCanvas.height-.5)*h};let pp=[];for(const [x,y] of [[bounds.minx,bounds.miny],[bounds.minx,bounds.maxy],[bounds.maxx,bounds.miny],[bounds.maxx,bounds.maxy]])pp.push(transformPoint({x:midx+(x-midx)*sx+(o.dx||0),y:midy+(y-midy)*sy+(o.dy||0)},w,h,s));return layerBounding([pp]);}
// ⌘Z follows the most recent kind of edit: brush/erase pixels or layer changes.
let undoKinds=[],redoKinds=[];
function noteUndoKind(kind){undoKinds.push(kind);if(undoKinds.length>60)undoKinds.shift();redoKinds=[];}
function captureLayerUndo(){layerHistory.push(snapshotLayerState());if(layerHistory.length>30)layerHistory.shift();futureLayerHistory=[];noteUndoKind('layer');}
function undoLayers(redo=false){let from=redo?futureLayerHistory:layerHistory,to=redo?layerHistory:futureLayerHistory;if(!from.length)return;to.push(snapshotLayerState());restoreLayerState(from.pop());}
function selectJefLayer(id){focusedOrderPart=null;selectedParts=id===null?new Set():new Set([partKey('jef',id)]);selectedJefLayerId=jefLayers.find(o=>o.id===id)?id:null;selectedObject=-1;selectedText=-1;selectionSync();refreshLayerList();render();}
function refreshLayerList(){let root=$('layer-list');if(!root)return;root.replaceChildren();
 const list=[...jefLayers.map(L=>({kind:'jef',L,id:L.id,name:L.name,hidden:L.hidden,selected:selectedParts.has(partKey('jef',L.id))})),...(mode==='image'?objects.map((L,i)=>({kind:'raster',L,id:i+1,name:`Shape ${i+1}`,hidden:!L.enabled,selected:selectedParts.has(partKey('raster',i+1))})):[])];
 $('layer-count').textContent=`${list.length+textLayers.length} editable ${list.length+textLayers.length===1?'part':'parts'}`;if($('multi-selection-count'))$('multi-selection-count').textContent=`${selectedParts.size} selected`;
 for(const q of list){const {kind,L,id,name,hidden,selected}=q,item=document.createElement('div');item.className='layer-item'+(selected?' current':'');item.dataset.key=partKey(kind,id);
 const eye=document.createElement('button');eye.className='layer-eye';eye.type='button';eye.title=hidden?'Show layer':'Hide layer';eye.textContent=hidden?'○':'●';eye.onclick=()=>{captureLayerUndo();if(kind==='jef')L.hidden=!L.hidden;else L.enabled=!L.enabled;refreshLayerList();queueRebuild();};
 const label=document.createElement('button');label.className='layer-label';label.type='button';label.textContent=name;label.onclick=e=>selectPart(kind,id,e);
 const count=document.createElement('small');count.textContent=kind==='jef'?`${L.paths.reduce((a,p)=>a+p.length-1,0).toLocaleString()} sts`:(hidden?'Hidden':'Shape');item.append(eye,label,count);root.append(item);
 }
 for(const [i,t] of textLayers.entries()){
  const item=document.createElement('div');item.className='layer-item'+(selectedText===i?' current':'');
  const button=document.createElement('button');button.type='button';button.className='layer-label';
  button.textContent=t.content.replace(/\n/g,' / ')||'Empty lettering';
  button.addEventListener('click',()=>{selectText(i);switchTab('create');$('text-content').focus({preventScroll:true});});
  const label=document.createElement('small');label.textContent='Lettering';
  item.append(button,label);root.append(item);
 }
 selectionSync();fvSyncSewTray();if(typeof syncPartReview==='function')syncPartReview();const L=selectedLayer(),active=selectedParts.size>0,stitchSelected=active&&selectedParts.size===1&&selectedJefLayerId!==null;
 for(const id of ['layer-x','layer-y','layer-w','layer-h','layer-rotation','layer-hide','layer-delete','layer-duplicate','layer-split-runs','layer-split-box','layer-rename'])$(id).disabled=!active||(!stitchSelected&&['layer-split-runs','layer-split-box','layer-duplicate','layer-rename','layer-rotation'].includes(id));
 $('layer-current').textContent=selectedParts.size>1?`${selectedParts.size} selected parts`:(active?(stitchSelected?L.name:`Shape ${selectedObject}`):'Select a part in the list or canvas');
 if(!active)return;
 if(selectedParts.size>1){for(const id of ['layer-x','layer-y','layer-w','layer-h','layer-rotation','layer-rename','layer-split-runs','layer-split-box'])$(id).disabled=true; $('layer-hint').textContent='Drag the selection together, or use the corner handle to scale it. Copy, paste, delete, and outline affect all selected parts.';return;}
 const b=selectedLayerMetrics(),w=Math.max(.1,b.maxx-b.minx),h=Math.max(.1,b.maxy-b.miny);
 $('layer-x').value=(L.dx||0).toFixed(1);$('layer-y').value=(L.dy||0).toFixed(1);$('layer-w').value=w.toFixed(1);$('layer-h').value=h.toFixed(1);$('layer-rotation').value=stitchSelected?L.rotation||0:0;
 $('layer-hide').textContent=(stitchSelected?L.hidden:!L.enabled)?'Show':'Hide';$('layer-hint').textContent=stitchSelected?(L.fvSource?'Vector object: stitches are recalculated from its shape when you resize it or change how it sews.':'Imported stitches: resizing stretches the existing needle points (no source shape to recalculate from). Keep size changes small.'):'Position offsets are relative to the original silhouette; W/H are final displayed dimensions.';
}

function hitRasterWorld(wp){
 let s=getSettings(),p=fromWorld(wp.x,wp.y,s),w=s.width,h=w*maskCanvas.height/Math.max(1,maskCanvas.width);
 const order=[...objects];order.sort((a,b)=>a.id===selectedObject?-1:b.id===selectedObject?1:0);
 for(const o of order){if(!o.enabled)continue;let cx=(o.cx/maskCanvas.width-.5)*w,cy=(o.cy/maskCanvas.height-.5)*h,sc=(o.scale||100)/100;
 let x=cx+(p.x-cx-(o.dx||0))/(sc*(o.stretchX||1)),y=cy+(p.y-cy-(o.dy||0))/(sc*(o.stretchY||1));
 let ix=Math.floor((x/w+.5)*maskCanvas.width),iy=Math.floor((y/h+.5)*maskCanvas.height);
 if(objectAt(ix,iy)===o.id)return o.id;}
 return -1;
}
function layerDragStart(wp){if(selectedJefLayerId!==null)return {kind:'jef',id:selectedJefLayerId,start:fromWorld(wp.x,wp.y,getSettings()),dx:selectedLayer().dx||0,dy:selectedLayer().dy||0};return {kind:'shape',id:selectedObject,start:fromWorld(wp.x,wp.y,getSettings()),dx:selectedLayer().dx||0,dy:selectedLayer().dy||0,scale:selectedLayer().scale||100};}
function hitLayer(wp){let result=null,threshold=Math.max(1.45,8/Math.max(display.scale,0.1));
 for(let i=jefLayers.length-1;i>=0;i--){let L=jefLayers[i];if(L.hidden)continue;const b=layerWorldBounds(L);if(wp.x<b.minx-threshold||wp.x>b.maxx+threshold||wp.y<b.miny-threshold||wp.y>b.maxy+threshold)continue;
  let min=Infinity;for(let path of L.paths){for(let j=1;j<path.length;j++){let a=layerPointWorld(path[j-1],L),c=layerPointWorld(path[j],L),vx=c.x-a.x,vy=c.y-a.y,q=Math.max(0,Math.min(1,((wp.x-a.x)*vx+(wp.y-a.y)*vy)/Math.max(1e-9,vx*vx+vy*vy)));let d=Math.hypot(wp.x-a.x-q*vx,wp.y-a.y-q*vy);if(d<min)min=d;}}
  if(min<threshold&&(result===null||min<result.dist))result={id:L.id,dist:min};
 }
 return result?.id??null;
}
function startImportedDrag(wp,e){if(tool!=='select')return false;
 if(globalMove){dragLayer={kind:'all',start:wp,x:+UI.offsetX.value,y:+UI.offsetY.value};canvas.setPointerCapture(e.pointerId);return true;}
 const selected=selectedJefLayerId!==null?selectedLayer():null,b=selectedLayerMetrics();
 if(selectedParts.size>1&&b){let sz=Math.max(1,9/display.scale);if(Math.hypot(wp.x-b.maxx,wp.y-b.maxy)<sz*2.2){multiDragStart(wp,e,true);return true;}}
 if(b){let sz=Math.max(1,9/display.scale);if(Math.hypot(wp.x-b.maxx,wp.y-b.maxy)<sz*1.8){captureLayerUndo();dragLayer={...layerDragStart(wp),kind:'jef-resize',w:b.maxx-b.minx,h:b.maxy-b.miny,sx:selected.scaleX,sy:selected.scaleY};canvas.setPointerCapture(e.pointerId);return true;}}
 const id=hitLayer(wp);if(id===null)return false;
 if(e.shiftKey||e.metaKey||e.ctrlKey||multiSelectionMode){selectPart('jef',id,e);return true;}
 if(selectedParts.size>1&&selectedParts.has(partKey('jef',id))){multiDragStart(wp,e,false);return true;}
 selectPart('jef',id);captureLayerUndo();dragLayer=layerDragStart(wp);canvas.setPointerCapture(e.pointerId);return true;
}
function updateLayerDrag(wp){const d=dragLayer;if(!d)return;
 if(d.kind==='all'){UI.offsetX.value=(d.x+wp.x-d.start.x).toFixed(1);UI.offsetY.value=(d.y+wp.y-d.start.y).toFixed(1);rebuild();return;}
 if(d.kind==='group'||d.kind==='group-resize'){
  const p=fromWorld(wp.x,wp.y,getSettings()),dx=p.x-d.start.x,dy=p.y-d.start.y;
  if(d.kind==='group')for(const item of d.items){let obj=item.kind==='jef'?jefLayers.find(x=>x.id===item.id):objects[item.id-1];if(obj){obj.dx=+(item.dx+dx).toFixed(2);obj.dy=+(item.dy+dy).toFixed(2);}}
  else{let width=Math.max(1,d.anchor.maxx-d.anchor.minx),height=Math.max(1,d.anchor.maxy-d.anchor.miny),local0=fromWorld(d.anchor.minx,d.anchor.miny,getSettings()),local1=fromWorld(d.anchor.maxx,d.anchor.maxy,getSettings());
   let fx=Math.max(.2,Math.min(5,1+(wp.x-d.startWorld.x)/(width))),fy=Math.max(.2,Math.min(5,1+(wp.y-d.startWorld.y)/(height)));
   for(const item of d.items){let obj=item.kind==='jef'?jefLayers.find(x=>x.id===item.id):objects[item.id-1];if(!obj)continue;
    let center=fromWorld(item.centerWorld.x,item.centerWorld.y,getSettings());let x=local0.x+(center.x-local0.x)*fx,y=local0.y+(center.y-local0.y)*fy;
    obj.dx=+(item.dx+x-center.x).toFixed(2);obj.dy=+(item.dy+y-center.y).toFixed(2);
    if(item.kind==='jef'){obj.scaleX=item.scaleX*fx;obj.scaleY=item.scaleY*fy;}else {obj.stretchX=(item.stretchX||1)*fx;obj.stretchY=(item.stretchY||1)*fy;}
   }
  }queueRebuild();refreshLayerList();return;
 }
 const L=d.kind.startsWith('jef')?jefLayers.find(x=>x.id===d.id):objects[d.id-1];if(!L)return;
 let p=fromWorld(wp.x,wp.y,getSettings()),dx=p.x-d.start.x,dy=p.y-d.start.y;
 if(d.kind==='jef-resize'){const k=mode==='jef'?getSettings().width/Math.max(.01,originalBounds.width):1;L.scaleX=Math.max(.15,Math.min(4,d.sx*(1+dx*k/Math.max(.5,d.w))));L.scaleY=Math.max(.15,Math.min(4,d.sy*(1+dy*k/Math.max(.5,d.h))));}
 else {L.dx=+(d.dx+dx).toFixed(2);L.dy=+(d.dy+dy).toFixed(2);}
 queueRebuild();refreshLayerList();
}
function deleteSelectedLayer(){let L=selectedLayer();if(!L)return;if(selectedJefLayerId!==null){captureLayerUndo();jefLayers=jefLayers.filter(x=>x.id!==L.id);selectedJefLayerId=jefLayers[0]?.id??null;}else{L.enabled=false;selectedObject=-1;}refreshLayerList();queueRebuild();}
function duplicateJefLayer(){let L=selectedLayer();if(selectedJefLayerId===null||!L)return;captureLayerUndo();const cp=structuredClone(L);cp.id=nextJefLayerId++;cp.name=L.name+' copy';cp.dx=(L.dx||0)+5;cp.dy=(L.dy||0)+5;let i=jefLayers.indexOf(L);jefLayers.splice(i+1,0,cp);selectJefLayer(cp.id);queueRebuild();}
function splitRuns(){let L=selectedLayer();if(selectedJefLayerId===null||!L||L.paths.length<2)return alertMessage('This layer contains one continuous run. Use Box split to isolate a smaller section.',true);captureLayerUndo();const idx=jefLayers.indexOf(L),ls=L.paths.map((p,i)=>makeJefLayer([p],L.colorIndex,L.name+' / run '+(i+1)));for(let N of ls){N.threadCode=L.threadCode;N.dx=L.dx;N.dy=L.dy;N.scaleX=L.scaleX;N.scaleY=L.scaleY;N.rotation=L.rotation;}jefLayers.splice(idx,1,...ls);selectJefLayer(ls[0].id);queueRebuild();}
function finishBoxSplit(){let rect=splitBox;splitBox=null;setTool('select');if(!rect)return;let L=selectedLayer();if(selectedJefLayerId===null||!L)return;
 const a=fromWorld(rect.start.x,rect.start.y,getSettings()),b=fromWorld(rect.end.x,rect.end.y,getSettings());const k=mode==='jef'?getSettings().width/Math.max(.01,originalBounds.width):1;
 const r={minx:Math.min(a.x,b.x)/k,maxx:Math.max(a.x,b.x)/k,miny:Math.min(a.y,b.y)/k,maxy:Math.max(a.y,b.y)/k};
 if(r.maxx-r.minx<.3||r.maxy-r.miny<.3)return alertMessage('Drag a larger box across the stitches to separate.',true);
 const inside=[],outside=[];let cut=0;
 for(const path of L.paths){let prev=null,current=[],cat=null;
  for(let i=1;i<path.length;i++){
   let p0=layerBasePt(path[i-1],L),p1=layerBasePt(path[i],L),mid={x:(p0.x+p1.x)/2,y:(p0.y+p1.y)/2},on=mid.x>=r.minx&&mid.x<=r.maxx&&mid.y>=r.miny&&mid.y<=r.maxy;
   if(cat!==on){if(current.length>1)(cat?inside:outside).push(current);current=[p0];cat=on;}else if(!current.length){current=[p0];}current.push(p1);if(on)cut++;
  }
  if(current.length>1)(cat?inside:outside).push(current);
 }
 if(!inside.length||!outside.length)return alertMessage('The box did not isolate a separate stitched section. Drag across only part of the selected layer.',true);
 captureLayerUndo();let at=jefLayers.indexOf(L),aL=makeJefLayer(outside,L.colorIndex,L.name+' / remainder'),bL=makeJefLayer(inside,L.colorIndex,L.name+' / cutout');aL.threadCode=L.threadCode;bL.threadCode=L.threadCode;jefLayers.splice(at,1,aL,bL);selectJefLayer(bL.id);queueRebuild();alertMessage(`Separated ${cut} stitch segments. Both parts can be moved or deleted independently. Inspect the new boundary for overlaps or gaps before sewing.`);
}

// Six resize nodes: four diagonal corners plus upper/lower height handles.
// Resize uses the current layer geometry and is independent from canvas zoom.
let resizer=null;
function resizeHandles(bounds){const b=bounds,cx=(b.minx+b.maxx)/2;return [
 {id:'nw',x:b.minx,y:b.miny},{id:'n',x:cx,y:b.miny},{id:'ne',x:b.maxx,y:b.miny},
 {id:'sw',x:b.minx,y:b.maxy},{id:'s',x:cx,y:b.maxy},{id:'se',x:b.maxx,y:b.maxy}
];}
function hitResizeHandle(wp){if(!selectedParts.size||tool!=='select')return null;const b=selectedLayerMetrics();if(!b)return null;let dmax=Math.max(.6,11/Math.max(display.scale,.01));for(const h of resizeHandles(b))if(Math.hypot(wp.x-h.x,wp.y-h.y)<dmax)return {h,b};return null;}
function startResize(e,wp){const hit=hitResizeHandle(wp);if(!hit)return false;
 captureLayerUndo();const bb=hit.b,center={x:(bb.minx+bb.maxx)/2,y:(bb.miny+bb.maxy)/2};
 const items=selectedPartRecords().map(p=>{const bb=partBounds(p),obj=p.L;return {kind:p.kind,id:p.id,dx:obj.dx||0,dy:obj.dy||0,scaleX:obj.scaleX||1,scaleY:obj.scaleY||1,scale:obj.scale||100,stretchX:obj.stretchX||1,stretchY:obj.stretchY||1,centerWorld:{x:(bb.minx+bb.maxx)/2,y:(bb.miny+bb.maxy)/2}};});
 resizer={handle:hit.h.id,center,width:Math.max(1,bb.maxx-bb.minx),height:Math.max(1,bb.maxy-bb.miny),items};canvas.setPointerCapture(e.pointerId);canvas.style.cursor=hit.h.id==='n'||hit.h.id==='s'?'ns-resize':hit.h.id==='nw'||hit.h.id==='se'?'nwse-resize':'nesw-resize';return true;}
function moveResize(wp,e){const d=resizer;if(!d)return false;const h=d.handle;
 let fx=1,fy=1;
 if(h.includes('w')||h.includes('e'))fx=Math.max(.08,Math.min(8,Math.abs(wp.x-d.center.x)/(d.width/2)));
 if(h.includes('n')||h.includes('s'))fy=Math.max(.08,Math.min(8,Math.abs(wp.y-d.center.y)/(d.height/2)));
 if(e.shiftKey&&(h.length===2)){const k=Math.min(fx,fy);fx=k;fy=k;}
 const s=getSettings();
 for(const item of d.items){const L=item.kind==='jef'?jefLayers.find(x=>x.id===item.id):objects[item.id-1];if(!L)continue;
  const desiredWorld={x:d.center.x+(item.centerWorld.x-d.center.x)*fx,y:d.center.y+(item.centerWorld.y-d.center.y)*fy};
  const a=fromWorld(item.centerWorld.x,item.centerWorld.y,s),b=fromWorld(desiredWorld.x,desiredWorld.y,s);
  L.dx=+(item.dx+b.x-a.x).toFixed(3);L.dy=+(item.dy+b.y-a.y).toFixed(3);
  if(item.kind==='jef'){L.scaleX=Math.max(.05,Math.min(20,item.scaleX*fx));L.scaleY=Math.max(.05,Math.min(20,item.scaleY*fy));}
  else{L.stretchX=Math.max(.05,Math.min(20,item.stretchX*fx));L.stretchY=Math.max(.05,Math.min(20,item.stretchY*fy));}
 }
 queueRebuild();render();return true;
}
function endResize(){if(!resizer)return false;resizer=null;canvas.style.cursor='default';refreshLayerList();queueRebuild();return true;}

// Selection marks use the interface ink (black, or white on a dark canvas or dark fabric), not a hue.
function selectionInk(){const fabric=$('preview-fabric')?.value,darkFabric=['navy','black','forest'].includes(fabric);return previewMode==='realistic'?(darkFabric?'#ffffff':'#111111'):(document.body.classList.contains('fv-theme-dark')?'#ffffff':'#111111');}
function drawLayerSelection(xy,scale){const b=selectedLayerMetrics();if(!b&&!splitBox&&!marquee)return;ctx.save();const ink=selectionInk(),paper=ink==='#ffffff'?'#111111':'#ffffff';
 if(b){const min=xy(b.minx,b.miny),max=xy(b.maxx,b.maxy);ctx.strokeStyle=ink;ctx.lineWidth=1.4;ctx.setLineDash([]);ctx.strokeRect(min.x,min.y,max.x-min.x,max.y-min.y);ctx.fillStyle=paper;ctx.strokeStyle=ink;ctx.lineWidth=1.4;for(const item of resizeHandles(b)){const p=xy(item.x,item.y);ctx.beginPath();ctx.arc(p.x,p.y,4.5,0,Math.PI*2);ctx.fill();ctx.stroke();}const text=selectedParts.size>1?`${selectedParts.size} objects`:selectedJefLayerId!==null?selectedLayer()?.name:`Shape ${selectedObject}`;ctx.font='600 12px "Courier New", monospace';ctx.fillStyle=ink;ctx.fillText(text||'Selected',min.x,min.y-10);}
 if(selectedParts.size>1){ctx.setLineDash([4,5]);ctx.strokeStyle=ink;ctx.globalAlpha=.55;ctx.lineWidth=1.2;for(const p of selectedPartRecords()){const c=partBounds(p),a=xy(c.minx,c.miny),v=xy(c.maxx,c.maxy);ctx.strokeRect(a.x,a.y,v.x-a.x,v.y-a.y);}ctx.globalAlpha=1;}
 if(marquee){const a=xy(marquee.start.x,marquee.start.y),d=xy(marquee.end.x,marquee.end.y);const left=Math.min(a.x,d.x),top=Math.min(a.y,d.y),w=Math.abs(d.x-a.x),h=Math.abs(d.y-a.y);ctx.fillStyle=ink==='#ffffff'?'rgba(255,255,255,.08)':'rgba(0,0,0,.05)';ctx.strokeStyle=ink;ctx.lineWidth=1.2;ctx.setLineDash([5,4]);ctx.fillRect(left,top,w,h);ctx.strokeRect(left,top,w,h);ctx.setLineDash([]);}
 if(splitBox){let a=xy(splitBox.start.x,splitBox.start.y),d=xy(splitBox.end.x,splitBox.end.y);ctx.fillStyle='rgba(0,169,151,.12)';ctx.strokeStyle='#05a697';ctx.setLineDash([7,4]);ctx.fillRect(a.x,a.y,d.x-a.x,d.y-a.y);ctx.strokeRect(a.x,a.y,d.x-a.x,d.y-a.y);}
 ctx.restore();
}

// Pattern swatches and order thumbnails are only drawn once they are visible.
const stitchThumbnailJobs=new WeakMap();
const stitchThumbnailObserver=new IntersectionObserver(entries=>{
 for(const {target,isIntersecting} of entries){
  if(!isIntersecting)continue;
  stitchThumbnailObserver.unobserve(target);
  const draw=stitchThumbnailJobs.get(target);
  stitchThumbnailJobs.delete(target);
  draw?.();
 }
});
function drawStitchThumbnailWhenVisible(element,draw){
 stitchThumbnailJobs.set(element,draw);
 stitchThumbnailObserver.observe(element);
}
function detachStitchThumbnails(container){
 for(const element of container.querySelectorAll('img,canvas')){
  stitchThumbnailObserver.unobserve(element);
  stitchThumbnailJobs.delete(element);
 }
}
const stitchSwatches=new Map();
const stitchTypeGroups={
 Standard:['fill','satin','raised-satin'],
 Texture:['motif','embossed','ripple','contour','cross-stitch','stipple'],
 'Fabric and borders':['applique','outline','triple']
};
const stitchTypeNotes={
 auto:'Auto chooses by shape. The sample shows the Tatami option used for wider areas.',
 fill:'Solid coverage. Directional patterns change thread sheen and programmed splits change where the needle lands.',
 satin:'Stitches cross between rails. Long spans still respect the maximum-length setting.',
 'raised-satin':'A sparse satin layer adds body below the top stitches.',
 motif:'Open running-stitch motifs leave fabric visible.',
 embossed:'Raised motifs are stitched over a solid Tatami base.',
 ripple:'Open lines radiate outward or spiral around the center.',
 contour:'Running stitches follow inset edges.',
 'cross-stitch':'Small crossing stitches form an open grid.',
 stipple:'A running stitch winds back and forth through the shape.',
 applique:'Placement → stop to add fabric → tack-down → stop to trim if needed → finish. Keep the 3 color sections separate on the machine.',
 outline:'Running stitches follow the boundary.',
 triple:'Each run is reinforced before travelling forward.'
};
function stitchPreviewRecipe(id,type){
 const st=getSettings(),satin=stitchPatterns.family(type)==='satin';
 const recipe={angle:st.fillAngle,direction:st.satinDirection,spacing:st.spacing,stitch:st.length,
  satinSpacing:st.satinStep,satinMax:st.satinLimit,satinOverlap:st.satinOverlap,pull:st.pullComp};
 if(id==='shape-style'){
  const o=objects[selectedObject-1];
  return {...recipe,angle:o?.style==='auto'?st.fillAngle:o?.angle??st.fillAngle,spacing:o?.spacing||st.spacing};
 }
 if(id==='fv-sew-type'){
  const L=fvSewParts().at(-1),r=L?.fvRecipe;
  return r?{...recipe,angle:r.angle||0,direction:r.direction||(r.auto==='rows'?'angle':'auto'),
   spacing:r.spacing||st.spacing,stitch:r.stitch||4,satinSpacing:r.satinSpacing||Math.min(r.spacing||st.spacing,.42),
   satinMax:r.satinMax||st.satinLimit,satinOverlap:r.satinOverlap??st.satinOverlap,pull:r.pull??st.pullComp,
   lineWidth:L.fvSource.kind==='fill'?null:r.width,ovalWidth:L.fvSource.oval?.width*nomuLayerScale()||null,
   nomu:L.fvSource.nomuFigure||false,reference:usesNomuReference(L)?nomuReferenceFrame(L.fvSource,nomuLayerScale()):null,
   referencePart:L.fvSource.nomuProfile}:recipe;
 }
 if(id==='text-style'){
  const t=readTextFields();
  return {...recipe,spacing:t.spacing,satinSpacing:t.spacing,angle:(satin?t.satinAxis+90:st.fillAngle)+t.rotation,
   direction:satin?'angle':st.satinDirection};
 }
 if(id==='border-stitch-style'){
  const o=objects[selectedObject-1];
  return {...recipe,satinSpacing:o?.borderStep||.45,spacing:o?.borderStep||.45,lineWidth:o?.borderWidth||1.8};
 }
 if(id==='line-style')return {...recipe,lineWidth:st.lineWidth};
 return recipe;
}
function stitchSwatch(type,patterns={},lineStyle=null,recipe={}){
 const key=JSON.stringify([type,patterns,lineStyle,recipe]);
 if(stitchSwatches.has(key))return stitchSwatches.get(key);
 const canvas=document.createElement('canvas');canvas.width=336;canvas.height=168;
 const ctx=canvas.getContext('2d');
 const makeRing=type==='applique'||type==='outline'||type==='triple'
  ?[[-10,-5],[8,-5],[11,-2],[11,3],[8,5],[-10,5],[-11,0],[-10,-5]]
  :[[-11,-5.5],[11,-5.5],[11,5.5],[-11,5.5],[-11,-5.5]];
 const rings=[makeRing.map(([x,y])=>({x,y}))];
 const sampleLine=[[-12,2],[-7,-2],[-2,0],[3,2],[11,-2]].map(([x,y])=>({x,y}));
 const oval=recipe.ovalWidth?{rx:10,ry:6,width:Math.min(7,recipe.ovalWidth),center:{x:0,y:0}}:null;
 const figure=recipe.nomu?stitchPatterns.nomuSymbolRings.map(r=>r.map(([x,y])=>({x:(x-118)*.108,y:(y-139)*.086}))):null;
 const source=oval?{kind:'fill',rings,oval}:figure?{kind:'fill',rings:figure}:recipe.lineWidth&&!lineStyle&&type!=='outline'
  ?{kind:'stroke',rings:[sampleLine],widthMm:recipe.lineWidth}:{kind:'fill',rings};
 const reference=recipe.reference&&window.FervorNomu.plan(window.FervorNomu.original()[recipe.referencePart],recipe.reference,
  {max:recipe.satinMax,cleanEntry:recipe.referencePart==='figure'});
 const paths=reference?[reference.path]:lineStyle?[stitchManualPath(sampleLine,lineStyle,recipe.stitch||3,recipe.lineWidth||2.35,patterns)]:fvBuildPaths(source,{type,patterns,angle:0,direction:'angle',
  spacing:.60,satinSpacing:.52,satinMax:6.5,stitch:3.2,pull:0,...recipe,underlay:false,ties:false,chain:false});
 ctx.fillStyle='#182123';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.translate(168,84);
 if(reference){
  const b=layerBounding(paths),fit=Math.min(294/(b.maxx-b.minx),144/(b.maxy-b.miny));
  ctx.scale(fit,fit);ctx.translate(-(b.maxx+b.minx)/2,-(b.maxy+b.miny)/2);
 }else ctx.scale(12,12);
 ctx.lineCap='round';
 const pen=(a,b,ink,width)=>{
  ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
  ctx.strokeStyle=ink;ctx.lineWidth=width;ctx.stroke();
 };
 for(const path of paths){
  const raised=path.role==='emboss-relief';
  const colors=path.role==='applique-placement'?['#efd0a3','#bd824e']:path.role==='applique-tackdown'?['#d37a58','#c05e45']:
   raised?['#e3fff2','#bceee1']:['#9dece0','#5d9c97'];
  for(let i=1;i<path.length;i++){
   const a=path[i-1],b=path[i],length=dist(a,b);
   if(!length)continue;
   const slope=Math.abs(b.x-a.x)/length;
   pen(a,b,'#12292b',raised?.39:.32);
   pen(a,b,colors[slope>.55?0:1],raised?.26:.16);
   ctx.fillStyle=raised?'#609e93':'#254748';
   ctx.beginPath();ctx.arc(b.x,b.y,raised?.065:.082,0,Math.PI*2);ctx.fill();
  }
 }
 const image=canvas.toDataURL();
 if(stitchSwatches.size>=150)stitchSwatches.clear();
 stitchSwatches.set(key,image);
 return image;
}
function readPatterns(id){return {...$(id)?.fervorPatterns};}
function groupStitchOptions(select){
 const options=[...select.options],fallback=options.filter(o=>o.value==='auto');
 const groups=Object.entries(stitchTypeGroups).map(([label,types])=>({label,items:options.filter(o=>types.includes(o.value))}));
 const extras=options.filter(o=>!fallback.includes(o)&&!groups.some(g=>g.items.includes(o)));
 select.replaceChildren(...fallback);
 for(const {label,items} of [...groups,{label:'Mixed stitches',items:extras}]){
  if(!items.length)continue;
  const group=document.createElement('optgroup');group.label=label;group.append(...items);select.append(group);
 }
}
function stitchTile(name,type,patterns,lineStyle=null){
 const button=document.createElement('button'),image=new Image(),label=document.createElement('span');
 button.type='button';button.className='fv-stitch-sample';
 image.alt='';label.textContent=name;button.append(image,label);
 drawStitchThumbnailWhenVisible(image,()=>{image.src=stitchSwatch(type,patterns,lineStyle);});
 return button;
}
function mountStitchPicker(id){
 const select=$(id),wrap=document.createElement('div');
 groupStitchOptions(select);
 select.fervorPatterns={};
 select.after(wrap);wrap.className='fv-stitch-picker';select.fervorPicker=wrap;
 wrap.innerHTML=`<details class="sl-advanced fv-stitch-gallery"><summary>Compare stitch types</summary><div class="fv-stitch-grid"></div></details>
  <figure class="fv-selected-swatch"><img alt=""><figcaption></figcaption></figure>
  <fieldset class="fv-pattern-choices"><legend>Pattern</legend><div class="fv-pattern-grid"></div></fieldset>
  <div class="sl-field fv-repeat-size"><label for="${id}-repeat-size">Repeat size (mm)</label><input type="number" id="${id}-repeat-size" data-setting="size"></div>
  <div class="sl-field fv-nomu-height" hidden><label for="${id}-nomu-height">NOMU figure height (mm)</label><input type="number" id="${id}-nomu-height" data-setting="nomuHeight" min="4" step=".25"></div>
  <div class="sl-field fv-emboss-depth"><label for="${id}-emboss-passes">Emboss buildup</label><select id="${id}-emboss-passes" data-setting="embossPasses"><option value="1">Light · 1 line</option><option value="2">Medium · 2 lines</option><option value="3">High · 3 lines</option></select></div>
  <details class="sl-advanced fv-relief"><summary>Emboss overlay</summary>
   <div class="fv-relief-fields">
    <div class="sl-field"><label for="${id}-relief">Overlay pattern</label><select id="${id}-relief" data-setting="relief"></select></div>
    <div class="fv-relief-adjust" hidden>
     <div class="sl-field"><label for="${id}-relief-size">Overlay repeat (mm)</label><input type="number" id="${id}-relief-size" data-setting="reliefSize" min="3" max="18" step=".5"></div>
     <div class="sl-field fv-relief-nomu-height" hidden><label for="${id}-relief-nomu-height">Overlay figure height (mm)</label><input type="number" id="${id}-relief-nomu-height" data-setting="reliefNomuHeight" min="4" step=".25"></div>
     <div class="sl-field"><label for="${id}-relief-angle">Overlay angle offset (°)</label><input type="number" id="${id}-relief-angle" data-setting="reliefAngle" min="-180" max="180" step="5"></div>
     <div class="sl-field"><label for="${id}-relief-passes">Overlay buildup</label><select id="${id}-relief-passes" data-setting="reliefPasses"><option value="1">Light · 1 line</option><option value="2">Medium · 2 lines</option><option value="3">High · 3 lines</option></select></div>
    </div>
   </div>
  </details>`;
 const emit=()=>select.dispatchEvent(new Event('input',{bubbles:true}));
 const relief=wrap.querySelector('[data-setting="relief"]');
 for(const [value,name] of Object.entries(stitchPatterns.reliefOptions))relief.append(new Option(name,value));
 const pendingNumbers=new WeakMap();
 wrap.addEventListener('focusin',event=>{
  const input=event.target;
  if(input.type==='number')pendingNumbers.set(input,input.value);
 });
 const commit=(control)=>{
  const setting=control.dataset.setting;
  if(!setting)return;
  if(pendingNumbers.has(control)&&pendingNumbers.get(control)===control.value)return;
  if(pendingNumbers.has(control))pendingNumbers.set(control,control.value);
  const family=select.fervorPatternFamily;
  const patterns=select.fervorPatterns;
  if(setting==='size')patterns[family+'Size']=stitchPatterns.sizeFor(family,control.value||undefined,control.closest('.fv-stitch-picker').dataset.activePattern);
  else if(setting==='reliefSize')patterns.reliefSize=stitchPatterns.sizeFor('embossed',control.value||undefined,patterns.relief);
  else if(setting==='nomuHeight'||setting==='reliefNomuHeight'){
   if(Number.isFinite(control.valueAsNumber))patterns[setting]=control.valueAsNumber;
   else delete patterns[setting];
  }
  else if(setting==='relief')patterns.relief=control.value;
  else if(setting==='reliefAngle')patterns.reliefAngle=Math.max(-180,Math.min(180,+control.value||0));
  else patterns[setting]=Number(control.value);
  syncStitchPicker(id);emit();
  if(pendingNumbers.has(control))pendingNumbers.set(control,control.value);
 };
 wrap.addEventListener('change',event=>commit(event.target));
 wrap.addEventListener('focusout',event=>{
  if(!pendingNumbers.has(event.target))return;
  commit(event.target);pendingNumbers.delete(event.target);
 });
 wrap.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&event.target.type==='number'){event.preventDefault();commit(event.target);}
 });
 const browse=wrap.querySelector('.fv-stitch-gallery'),gallery=browse.querySelector('.fv-stitch-grid');
 browse.addEventListener('toggle',()=>{
  if(!browse.open||gallery.childElementCount)return;
  for(const [type,name] of Object.entries(stitchPatterns.types)){
   if(![...select.options].some(o=>o.value===type))continue;
   const button=stitchTile(name,type);button.dataset.stitchType=type;gallery.append(button);
   button.addEventListener('click',()=>{
    select.value=type;syncStitchPicker(id);emit();browse.open=false;select.focus({preventScroll:true});
   });
  }
  syncStitchPicker(id);
 });
 wrap.querySelector('.fv-pattern-grid').addEventListener('click',event=>{
  const option=event.target.closest('[data-stitch-pattern]');
  if(!option)return;
  select.fervorPatterns[select.fervorPatternFamily]=option.dataset.stitchPattern;
  syncStitchPicker(id);emit();
 });
}
function syncStitchPicker(id,values){
 const select=$(id),wrap=select?.fervorPicker;if(!wrap)return;
 if(values)select.fervorPatterns={...values};
 const type=select.value,st=getSettings(),object=id==='shape-style'?objects[selectedObject-1]:null;
 const effective=object&&type==='auto'?st.style:type;
 const family=stitchPatterns.family(effective),choices=stitchPatterns.choices[family];
 const patterns=object?{...st.patterns,...select.fervorPatterns}:select.fervorPatterns;
 const hasPattern=choices&&Object.hasOwn(choices,patterns[family]),pattern=hasPattern?patterns[family]:stitchPatterns.defaultPattern(family);
 select.fervorPatternFamily=family;wrap.dataset.activePattern=pattern;
 const specimen=stitchPatterns.types[effective]?effective:stitchPatterns.family(effective);
 const lineStyle=id==='line-style'?type:null;
 wrap.querySelector('.fv-stitch-gallery').hidden=!!lineStyle||id==='border-stitch-style';
 const shown=!select.disabled&&!!stitchPatterns.types[specimen];
 wrap.hidden=!shown;
 if(!shown)return;
 const size=wrap.querySelector('[data-setting="size"]'),limits=stitchPatterns.sizes(family,pattern);
 const repeat=stitchPatterns.sizeFor(family,patterns[family+'Size']??(family==='embossed'?patterns.embossSize:undefined),pattern);
 Object.assign(size,limits,{value:repeat});
 const fixed=['single','smooth','adaptive','lattice','grain'].includes(pattern)&&['outline','triple','satin'].includes(family);
 const usesSize=family==='fill'
  ?stitchPatterns.directionalPatterns.has(pattern)||['moire','brocade','dimples'].includes(pattern)
  :family==='applique'?!['bean','raw'].includes(pattern):!fixed;
 const sizeRow=size.closest('.sl-field');
 sizeRow.hidden=!usesSize;
 sizeRow.querySelector('label').textContent=family==='applique'?'Edge width (mm)':'Repeat size (mm)';
 wrap.querySelector('.fv-emboss-depth').hidden=family!=='embossed';
 const overlay=patterns.relief||'none',closedArea=id!=='line-style'&&id!=='border-stitch-style'&&
  (id!=='fv-sew-type'||fvSewParts().at(-1)?.fvSource.kind==='fill');
 wrap.querySelector('option[value="nomu"]').disabled=!closedArea;
 wrap.querySelector('.fv-relief-adjust').hidden=overlay==='none'||(!closedArea&&overlay==='nomu');
 Object.assign(wrap.querySelector('[data-setting="reliefSize"]'),stitchPatterns.sizes('embossed',overlay));
 const reliefSize=stitchPatterns.sizeFor('embossed',patterns.reliefSize,overlay);
 const syncHeight=(setting,chosen,pitch)=>{
  const input=wrap.querySelector(`[data-setting="${setting}"]`);
  input.closest('.sl-field').hidden=!chosen;
  input.max=pitch-.75;input.value=stitchPatterns.nomuHeightFor(patterns[setting],pitch);
 };
 syncHeight('nomuHeight',pattern==='nomu',repeat);
 syncHeight('reliefNomuHeight',overlay==='nomu',reliefSize);
 const valuesByKey={embossPasses:patterns.embossPasses??2,relief:overlay,reliefSize,
  reliefAngle:patterns.reliefAngle??0,reliefPasses:patterns.reliefPasses??2};
 for(const [key,value] of Object.entries(valuesByKey))wrap.querySelector(`[data-setting="${key}"]`).value=value;
 const preview=wrap.querySelector('.fv-selected-swatch');
 const recipe=stitchPreviewRecipe(id,effective),satin=family==='satin';
 preview.querySelector('img').src=stitchSwatch(specimen,{...patterns,[family]:pattern},lineStyle,recipe);
 const spacing=satin?recipe.satinSpacing:recipe.spacing;
 const caption=[choices?.[pattern],!lineStyle&&['fill','satin','embossed'].includes(family)?spacing.toFixed(2)+' mm spacing':'',
  stitchTypeNotes[effective]||stitchTypeNotes[specimen]].filter(Boolean).join(' · ');
 preview.querySelector('figcaption').textContent=caption;
 const fieldset=wrap.querySelector('.fv-pattern-choices'),grid=fieldset.querySelector('.fv-pattern-grid');
 fieldset.hidden=!choices;
 if(choices){
  const tileSize=patterns[family+'Size']??(family==='embossed'?patterns.embossSize:undefined);
  const key=JSON.stringify([specimen,tileSize,lineStyle]);
  const changedFamily=grid.dataset.family!==family;
  if(grid.dataset.patternSet!==key){
   const scrollTop=changedFamily?0:grid.scrollTop;
   const focused=document.activeElement?.dataset.stitchPattern;
   detachStitchThumbnails(grid);
   grid.dataset.patternSet=key;grid.dataset.family=family;
   grid.replaceChildren(...Object.entries(choices).map(([value,name])=>{
    const button=stitchTile(name,specimen,{[family]:value,[family+'Size']:stitchPatterns.sizeFor(family,tileSize,value)},lineStyle);
    button.dataset.stitchPattern=value;return button;
   }));
   grid.scrollTop=scrollTop;
   if(focused)grid.querySelector(`[data-stitch-pattern="${focused}"]`)?.focus({preventScroll:true});
  }
  for(const button of grid.children)button.setAttribute('aria-pressed',String(button.dataset.stitchPattern===pattern));
  if(changedFamily){
   const active=grid.querySelector('[aria-pressed="true"]');
   if(active&&grid.clientHeight&&active.offsetTop+active.offsetHeight>grid.clientHeight)
    grid.scrollTop=active.offsetTop;
  }
 }
 wrap.querySelectorAll('[data-stitch-type]').forEach(b=>{
  b.setAttribute('aria-pressed',String(b.dataset.stitchType===type));
  b.disabled=!![...select.options].find(o=>o.value===b.dataset.stitchType)?.disabled;
 });
}

/* "How should this sew?" — per-object stitch recipe for parametric (Vector) parts. */
function fvSewParts(){return selectedPartRecords().filter(p=>p.kind==='jef'&&p.L.fvSource).map(p=>p.L);}
function nomuEmblemParts(layer){
 return layer?.nomuEmblem?jefLayers.filter(L=>L.nomuEmblem===layer.nomuEmblem):[];
}
function nomuEmblemBounds(parts){
 const b=parts.map(layerWorldBounds);
 return {minx:Math.min(...b.map(p=>p.minx)),maxx:Math.max(...b.map(p=>p.maxx)),
  miny:Math.min(...b.map(p=>p.miny)),maxy:Math.max(...b.map(p=>p.maxy))};
}
function resizeNomuEmblem(layer,width){
 const parts=nomuEmblemParts(layer);
 if(parts.length!==2||!Number.isFinite(width))return;
 const b=nomuEmblemBounds(parts),ratio=Math.max(.08,Math.min(8,width/Math.max(.1,b.maxx-b.minx)));
 if(Math.abs(width-(b.maxx-b.minx))<.06)return;
 captureLayerUndo();
 const s=getSettings(),pivot=fromWorld((b.minx+b.maxx)/2,(b.miny+b.maxy)/2,s),units=nomuLayerScale();
 for(const L of parts){
  const center=layerBasePt(L.center,L);
  L.dx+=(center.x-pivot.x/units)*(ratio-1);
  L.dy+=(center.y-pivot.y/units)*(ratio-1);
  L.scaleX*=ratio;L.scaleY*=ratio;fvRegenerateLayer(L);
 }
 refreshLayerList();queueRebuild();
}
function fvBuildSewTray(){if($('fv-sew-tray'))return;const hint=$('layer-hint');if(!hint)return;const t=document.createElement('section');t.id='fv-sew-tray';t.className='fv-sew-tray';t.hidden=true;t.setAttribute('aria-label','How should this sew');
 t.innerHTML=`<strong class="fv-sew-title">How should this sew?</strong>
 <div class="sl-field"><label for="fv-sew-type">Stitch type</label><select id="fv-sew-type">${Object.entries(stitchPatterns.types).map(([type,name])=>`<option value="${type}">${name}</option>`).join('')}</select></div>
 <p class="tiny" id="fv-sew-explain"></p>
 <div class="fv-sew-row" data-for="emblem-width"><label for="fv-emblem-width">Whole emblem width (mm)</label><input type="number" id="fv-emblem-width" min="3" max="200" step="0.1"></div>
 <div class="fv-sew-row" data-for="nomu"><label for="fv-nomu-profile">Satin layout</label><select id="fv-nomu-profile"><option value="reference">Baby-Last original</option><option value="editable">Editable columns</option></select></div>
 <div class="fv-sew-row" data-for="angle"><label for="fv-sew-angle">Stitch angle</label><input type="range" id="fv-sew-angle" min="0" max="175" step="5" value="0"><output id="fv-sew-angle-out">0°</output></div>
 <div class="fv-sew-row" data-for="spacing"><label for="fv-sew-spacing">Row spacing</label><input type="range" id="fv-sew-spacing" min="0.3" max="1" step="0.05" value="0.45"><output id="fv-sew-spacing-out">0.45 mm</output></div>
 <div class="fv-sew-row" data-for="width"><label for="fv-sew-width">Satin width</label><input type="range" id="fv-sew-width" min="0.8" max="7" step="0.1" value="2"><output id="fv-sew-width-out">2.0 mm</output></div>
 <div class="fv-sew-row" data-for="pull"><label for="fv-sew-pull">Pull compensation</label><input type="range" id="fv-sew-pull" min="0" max="0.6" step="0.05" value="0.2"><output id="fv-sew-pull-out">0.20 mm</output></div>
 <div class="fv-sew-row" data-for="oval-mode"><label for="fv-oval-mode">Oval band sizing</label><select id="fv-oval-mode"><option value="scale">Scale with oval</option><option value="fixed">Fixed millimeters</option></select></div>
 <div class="fv-sew-row" data-for="oval"><label for="fv-oval-width">Oval band (mm)</label><input type="number" id="fv-oval-width" min="0.8" max="40" step="0.1" value="4"></div>
 <div class="fv-sew-row" data-for="limit"><label for="fv-sew-limit">Max satin (mm)</label><input type="number" id="fv-sew-limit" min="3" max="8" step="0.1" value="6.5"></div>
 <div class="fv-sew-row" data-for="underlay"><label for="fv-sew-underlay">Underlay</label><select id="fv-sew-underlay"><option value="auto">Adaptive</option><option value="edge">Edge run</option><option value="off">Off</option></select></div>
 <div class="fv-sew-checks" data-for="ties"><label><input type="checkbox" id="fv-sew-ties" checked> Lock stitches</label></div> <p class="sl-hint" id="fv-satin-plan" hidden></p>`;
 hint.after(t);mountStitchPicker("fv-sew-type");
 let undoTaken=false;const begin=()=>{if(!undoTaken){captureLayerUndo();undoTaken=true;}};
 const apply=patch=>{
  const parts=fvSewParts();if(!parts.length)return;begin();
  for(const L of parts){
   const next={...L.fvRecipe,...patch};
   if(patch.nomuReference===true&&L.fvSource.nomuProfile){
    next.type='satin';next.patterns={...next.patterns,satin:'smooth',relief:'none'};
    next.startPoint=null;
    if(L.fvSource.oval)next.ovalMode='scale';
   }
   if(patch.angle!==undefined&&!L.fvSource.oval){next.direction='angle';next.auto='rows';}
   if(patch.type&&patch.type!==L.fvRecipe.type&&stitchPatterns.family(patch.type)==='satin'&&!L.fvSource.nomuFigure){next.direction='auto';delete next.auto;}
   if(L.fvSource.kind!=='fill'&&!['satin','raised-satin','outline','triple'].includes(next.type))continue;
   L.fvRecipe=next;fvRegenerateLayer(L);
  }
  fvSyncSewTray();refreshLayerList();queueRebuild();
 };
 $('fv-sew-type').addEventListener('input',e=>{undoTaken=false;apply({type:e.target.value,patterns:readPatterns('fv-sew-type')});undoTaken=false;});
 for(const [id,key] of [['fv-oval-width','ovalWidth'],['fv-sew-limit','satinMax']]){
  $(id).addEventListener('change',e=>{if(!Number.isFinite(e.target.valueAsNumber))return;undoTaken=false;apply({[key]:e.target.valueAsNumber});undoTaken=false;});
 }
 for(const [id,key,fmt] of [['fv-sew-angle','angle',v=>v+'°'],['fv-sew-spacing','spacing',v=>(+v).toFixed(2)+' mm'],['fv-sew-width','width',v=>(+v).toFixed(1)+' mm'],['fv-sew-pull','pull',v=>(+v).toFixed(2)+' mm']]){const el=$(id);
  el.addEventListener('input',()=>{$(id+'-out').textContent=fmt(el.value);apply({[key]:+el.value,...(key==='spacing'?{satinSpacing:+el.value}:{})});});el.addEventListener('change',()=>{undoTaken=false;});}
  const emblemWidth=$('fv-emblem-width');
 const resize=()=>{if(emblemWidth.checkValidity())resizeNomuEmblem(fvSewParts().at(-1),emblemWidth.valueAsNumber);};
 emblemWidth.addEventListener('change',resize);
 emblemWidth.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();resize();}});
 $('fv-nomu-profile').addEventListener('change',e=>{undoTaken=false;apply({nomuReference:e.target.value==='reference'});undoTaken=false;});
 $('fv-oval-mode').addEventListener('change',e=>{
  const L=fvSewParts().at(-1),width=L.fvSource.oval.width*nomuLayerScale();
  undoTaken=false;apply({ovalMode:e.target.value,ovalWidth:width});undoTaken=false;
 });
 $('fv-sew-underlay').addEventListener('change',e=>{undoTaken=false;apply({underlay:e.target.value==='off'?false:e.target.value});undoTaken=false;});
 $('fv-sew-ties').addEventListener('change',e=>{undoTaken=false;apply({ties:e.target.checked});undoTaken=false;});
}
function fvSyncSewTray(){const t=$('fv-sew-tray');if(!t)return;const parts=fvSewParts(),L=parts.at(-1);t.hidden=!L;if(!L)return;const r=L.fvRecipe,src=L.fvSource;
 const picker=$('fv-sew-type'),fill=src.kind==='fill',satin=stitchPatterns.family(r.type)==='satin',reference=usesNomuReference(L);
 picker.value=r.type;
 for(const o of picker.options)o.disabled=!fill&&!['satin','raised-satin','outline','triple'].includes(o.value);
 syncStitchPicker('fv-sew-type',r.patterns||{});
 const show=(k,on)=>{const row=t.querySelector(`[data-for="${k}"]`);if(row)row.hidden=!on;};
 show('angle',!reference&&fill&&!src.oval&&!['outline','triple'].includes(r.type));show('spacing',!reference&&fill&&!['outline','triple'].includes(r.type));
 const emblem=parts.length===1?nomuEmblemParts(L):[];
 show('emblem-width',emblem.length===2);
 if(emblem.length===2){const b=nomuEmblemBounds(emblem);$('fv-emblem-width').value=(b.maxx-b.minx).toFixed(1);}
 show('nomu',satin&&!!src.nomuProfile);$('fv-nomu-profile').value=reference?'reference':'editable';
 show('underlay',!reference);show('ties',!reference);
 $('fv-sew-spacing').labels[0].textContent=satin?'Satin spacing':'Row spacing';
 show('width',satin&&!fill);show('pull',!reference&&(r.type==='fill'||r.type==='embossed'||satin));
 show('oval',!reference&&!!src.oval&&parts.length===1);show('oval-mode',!reference&&!!src.oval&&parts.length===1);show('limit',satin);
 const partStats=L.fvSatinStats,stats=$('fv-satin-plan');stats.hidden=!satin||!partStats;
 if(partStats)stats.textContent=partStats.reference
  ?(partStats.splits?partStats.splits.toLocaleString()+' satin span subdivisions · ':'')+(r.satinMax||8)+' mm stitch limit'
  :partStats.columns+' satin columns · '+partStats.splitSections+' split sections · '+(r.satinMax||6.5)+' mm stitch limit';
 const set=(id,v,fmt)=>{$(id).value=v;$(id+'-out').textContent=fmt(v);};
 set('fv-sew-angle',r.angle||0,v=>v+'°');
 set('fv-sew-spacing',(satin?r.satinSpacing:r.spacing)||getSettings().spacing||.45,v=>(+v).toFixed(2)+' mm');
 set('fv-sew-width',r.width||src.widthMm||2,v=>(+v).toFixed(1)+' mm');
 set('fv-sew-pull',r.pull??.2,v=>(+v).toFixed(2)+' mm');
 $('fv-oval-width').value=src.oval?(src.oval.width*nomuLayerScale()).toFixed(1):4;
 $('fv-sew-limit').value=r.satinMax||6.5;
 $('fv-oval-mode').value=r.ovalMode==='scale'?'scale':'fixed';$('fv-oval-width').disabled=r.ovalMode==='scale';
 $('fv-sew-underlay').value=r.underlay===false||r.underlay==='none'?'off':r.underlay==='edge'?'edge':'auto';$('fv-sew-ties').checked=r.ties!==false;
 $('fv-sew-explain').textContent=reference?'The original Baby-Last needle path scales with the logo. Long satin spans subdivide as needed.':src.oval?'Satin follows the oval. Wide bands split into lanes as you resize.':
  src.nomuFigure?'Satin follows the figure’s original horizontal direction, with more columns as the design grows.':
  'Resize this part to recalculate its stitches. '+(parts.length>1?`Changes apply to ${parts.length} selected parts.`:'');
}
function bindLayerControls(){
 fvBuildSewTray();
 $('layer-hide').onclick=toggleSelectedVisibility;
 $('layer-delete').onclick=deleteSelectedParts;$('layer-duplicate').onclick=duplicateSelectedParts;$('layer-split-runs').onclick=splitRuns;
 $('layer-split-box').onclick=()=>{if(selectedJefLayerId===null||!selectedLayer())return;setTool('split');switchTab('layers');alertMessage('Drag a box around the stitches to separate. The selected portion becomes a new movable layer.');};
 $('layer-undo').onclick=()=>undoLayers(false);$('layer-redo').onclick=()=>undoLayers(true);
 $('layer-rename').onclick=()=>{let L=selectedLayer();if(!L||selectedJefLayerId===null)return;let name=prompt('Name this stitch part',L.name);if(name?.trim()){captureLayerUndo();L.name=name.trim().slice(0,60);refreshLayerList();}};
 $('layer-move-all').onclick=()=>{globalMove=!globalMove;$('layer-move-all').setAttribute('aria-pressed',String(globalMove));$('layer-move-all').textContent=globalMove?'Moving whole design: ON':'Move whole design';setTool('select');};
 const commitPartField=k=>{let L=selectedLayer();if(!L)return;captureLayerUndo();
  let b=selectedLayerMetrics(),w=b?b.maxx-b.minx:1,h=b?b.maxy-b.miny:1;
  if(k==='layer-x')L.dx=Number($('layer-x').value)||0;
  if(k==='layer-y')L.dy=Number($('layer-y').value)||0;
  if(k==='layer-rotation'&&selectedJefLayerId!==null)L.rotation=Math.max(-180,Math.min(180,Number($('layer-rotation').value)||0));
  if(k==='layer-w'||k==='layer-h'){
   const measured=k==='layer-w'?w:h,target=Math.max(1,Number($(k).value)||measured);
   const factor=Math.max(.1,Math.min(5,target/Math.max(.1,measured)));
   if(selectedJefLayerId!==null){
    const locked=(L.fvSource?.nomuFigure||L.fvSource?.oval)&&L.fvKeepRatio!==false;
    if(locked||k==='layer-w')L.scaleX=(L.scaleX||1)*factor;
    if(locked||k==='layer-h')L.scaleY=(L.scaleY||1)*factor;
   }else L.scale=Math.max(10,Math.min(500,L.scale*factor));
  }
  refreshLayerList();queueRebuild();
 };
 for(const id of ['layer-x','layer-y','layer-w','layer-h','layer-rotation']){
  const input=$(id);let before=null;
  input.addEventListener('focus',()=>{before=input.value;});
  const commit=()=>{if(before===input.value)return;commitPartField(id);before=input.value;};
  input.addEventListener('change',commit);
  input.addEventListener('blur',()=>{if(before!==null)commit();before=null;});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commit();}});
 }
 $('layer-load-jef').onclick=()=>addJefOverlay(Uint8Array.from(atob(window.NOMU_JEF_SAMPLE),c=>c.charCodeAt(0)).buffer,'B_L SAT.JEF');
 $('layer-add-jef').onclick=()=>$('layer-overlay-input').click();
 $('layer-overlay-input').onchange=async e=>{const f=e.target.files?.[0];if(f)await addJefOverlay(await f.arrayBuffer(),f.name);e.target.value='';};
 $('layer-multi-mode').addEventListener('change',e=>{multiSelectionMode=e.target.checked;alertMessage(multiSelectionMode?'Multi-select enabled. Click parts to add or remove them.':'Single-select mode. Shift/⌘/Ctrl-click still supports multiple selection.');});
 $('layer-select-all').onclick=selectAllParts;$('layer-clear-selection').onclick=clearPartSelection;
 $('layer-copy').onclick=copySelectedParts;$('layer-paste').onclick=pasteCopiedParts;$('layer-paste').disabled=true;
 $('layer-outline-only').onclick=applyOutlineToSelected;
} 

let textLayers=[],selectedText=-1,dragText=null;
let vectorHandoff=false;
let jefLayers=[],selectedJefLayerId=null,nextJefLayerId=1,dragLayer=null,splitBox=null,marquee=null,layerHistory=[],futureLayerHistory=[],globalMove=false,exportPalette=[],exportThreadHexes=[];
// Preview colour for thread block i: the vector colour when known, otherwise null.
function threadPreviewHex(i,dark){const hex=exportThreadHexes[i];if(!hex)return null;const [r,g,b]=hexToRgb(hex),lum=(.299*r+.587*g+.114*b)/255;if(dark&&lum<.22)return '#d6d6d6';if(!dark&&lum>.9)return '#b9bdb8';return hex;}

let satinColumns=0, satinSplits=0;
let sequenceStats={joined:0,routeLength:0,perShapeJumps:0,crossObjectJumps:0};

const num=(id)=>+($(id).value||0);
function getSettings(){return {width:num('size-mm'),threshold:num('threshold'),spacing:num('spacing'),length:num('length'),angle:num('rotation'),fillAngle:num('fill-angle'),offsetX:num('offset-x'),offsetY:num('offset-y'),brushSize:num('brush-size'),style:UI.style.value,patterns:readPatterns('stitch-style'),hoop:UI.hoop.value,underlayType:$('underlay-type').value,fabricType:$('fabric-type').value,pullComp:num('pull-comp'),satinDirection:$('satin-direction').value,showJumps:UI.showJumps.checked,showArt:UI.showArt.checked,showHoop:UI.showHoop.checked,showSequence:UI.showSequence.checked,satinStep:num('satin-step'),satinLimit:num('satin-limit'),satinOverlap:num('satin-overlap'),lineStyle:$('line-style').value,linePatterns:readPatterns('line-style'),lineWidth:num('line-width'),crossEnabled:$('cross-enabled').checked,crossSpacing:num('cross-spacing'),crossAngle:num('cross-angle'),crossMode:$('cross-mode').value,seqConnect:$('seq-connect').checked,seqMaxLink:num('seq-max-link'),seqOrder:$('seq-order').value,seqTrim:num('seq-trim')};}
function setSettings(s){for(let [k,v] of Object.entries(s)){let el=({width:UI.width,threshold:UI.threshold,spacing:UI.spacing,length:UI.length,angle:UI.angle,fillAngle:UI.fillAngle,offsetX:UI.offsetX,offsetY:UI.offsetY,brushSize:UI.brushSize,style:UI.style,hoop:UI.hoop,underlayType:$('underlay-type'),fabricType:$('fabric-type'),pullComp:$('pull-comp'),satinDirection:$('satin-direction'),showJumps:UI.showJumps,showArt:UI.showArt,showHoop:UI.showHoop,showSequence:UI.showSequence,satinStep:$('satin-step'),satinLimit:$('satin-limit'),satinOverlap:$('satin-overlap'),lineStyle:$('line-style'),lineWidth:$('line-width'),crossEnabled:$('cross-enabled'),crossSpacing:$('cross-spacing'),crossAngle:$('cross-angle'),crossMode:$('cross-mode'),seqConnect:$('seq-connect'),seqMaxLink:$('seq-max-link'),seqOrder:$('seq-order'),seqTrim:$('seq-trim')})[k];if(!el)continue;if(el.type==='checkbox')el.checked=!!v;else el.value=v;}syncStitchPicker('stitch-style',s.patterns||{});syncStitchPicker('line-style',s.linePatterns||{});UI.sizeNumber.value=UI.width.value; updateNumbers();}
function updateNumbers(){for(let name of ['threshold','spacing','length','rotation','fill-angle','brush-size','satin-step','satin-limit','satin-overlap','line-width','pull-comp','cross-spacing','cross-angle','seq-max-link']){let el=$(name),span=$(name+'-out');if(span)span.textContent=el.value+(name==='spacing'||name==='length'||name==='satin-step'||name==='satin-limit'||name==='satin-overlap'||name==='line-width'||name==='pull-comp'||name==='cross-spacing'||name==='seq-max-link'?' mm':name==='rotation'||name==='fill-angle'||name==='cross-angle'?'°':'');} $('size-out').textContent=UI.width.value+' mm';}
function setStatus(message,kind='neutral'){$('status-label').textContent=message;$('status-dot').className='status-dot '+(kind==='error'?'error':kind==='success'?'success':'');}
function alertMessage(message,error=false){$('notice-text').textContent=message;$('notice').hidden=false;$('notice').className='notice '+(error?'warning':'');}
function dismissMessage(){$('notice').hidden=true;}
function readAsDataUrl(file){return new Promise((resolve,reject)=>{let r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
function imageFrom(src){return new Promise((resolve,reject)=>{let im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src;});}
function download(bytes,name,mime){let blob=bytes instanceof Blob?bytes:new Blob([bytes],{type:mime});let url=URL.createObjectURL(blob);let a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function filename(ext){return (sourceName||'NOMU_DESIGN').toUpperCase().replace(/[^A-Z0-9_-]+/g,'_').slice(0,35)+'_STITCH_LAB.'+ext;}
function editableVectorLayers(){
 return jefLayers.filter(layer=>layer.fervorVector&&layer.fvSource?.rings?.length&&layer.fvRecipe);
}
function vectorDesignBounds(layers){
 return layerBounding(layers.flatMap(layer=>layer.fvSource.rings.map(ring=>ring.map(point=>layerBasePt(point,layer)))));
}
function vectorSizeSummary(){
 const layers=vectorHandoff?editableVectorLayers():[];
 const editing=layers.length>0;
 $('raster-width-controls').hidden=editing;
 $('vector-width-controls').hidden=!editing;
 $('garment-preset-scope').hidden=!editing;
 $('preset-crisp').disabled=editing;
 $('preset-fast').disabled=editing;
 $('quick-cap-width').textContent=editing?'Set cap vector width to 90 mm':'Set cap artwork to 90 mm';
 if(!editing){
  $('source-width-label').textContent=mode==='image'?'Artwork width':'Imported design width';
  $('source-width-label').htmlFor='size-mm';
  $('source-width-note').textContent=mode==='image'
   ?'Sets the width of the source artwork, including unstitched space. The sewn area measures needle penetrations.'
   :'Scales the imported design. The sewn area includes visible parts and lettering.';
  $('size-out').textContent=UI.width.value+' mm';
  return;
 }
 const bounds=vectorDesignBounds(layers);
 const width=Number((bounds.maxx-bounds.minx).toFixed(1));
 const input=$('vector-design-width');
 if(document.activeElement!==input)input.value=width;
 $('size-out').textContent=width+' mm';
 $('source-width-label').textContent='Vector design width';
 $('source-width-label').htmlFor=input.id;
 $('source-width-note').textContent='Width of editable Vector paths, including hidden Vector parts, before overall rotation. The sewn area measures needle penetrations across visible parts.';
}
function resizeVectorDesign(requested){
 const layers=editableVectorLayers();
 const bounds=vectorDesignBounds(layers);
 const width=bounds.maxx-bounds.minx;
 if(!Number.isFinite(requested)||requested<10||requested>250||!(width>0))return false;
 if(Math.abs(requested-width)<.001)return true;
 const ratio=requested/width;
 const center={x:(bounds.minx+bounds.maxx)/2,y:(bounds.miny+bounds.maxy)/2};
 const savedNotes=structuredClone(annotations);
 const resized=new Map();
 try{
  for(const layer of layers){
   const next=structuredClone(layer);
   const x=next.center.x+(next.dx||0),y=next.center.y+(next.dy||0);
   next.dx=center.x+(x-center.x)*ratio-next.center.x;
   next.dy=center.y+(y-center.y)*ratio-next.center.y;
   next.scaleX=(next.scaleX??1)*ratio;
   next.scaleY=(next.scaleY??1)*ratio;
   // The old entry was derived from the previous geometry. Keep explicit start points.
   delete next.fvRecipe.entry;
   if(next.fvSource.kind==='outline'&&next.fvRecipe.width>0)next.fvRecipe.width*=ratio;
   if(!fvRegenerateLayer(next))throw new Error('An editable Vector part has no sewable paths at that size.');
   resized.set(next.id,next);
  }
 }catch(error){annotations=savedNotes;alertMessage(error.message,true);return false;}
 const resizedNotes=annotations;
 annotations=savedNotes;
 captureLayerUndo();
 annotations=resizedNotes;
 jefLayers=jefLayers.map(layer=>resized.get(layer.id)||layer);
 refreshLayerList();
 queueRebuild();
 return true;
}
function syncMode(){let img=mode==='image';document.querySelectorAll('.image-only').forEach(n=>n.classList.toggle('disabled-panel',!img));$('source-info').textContent=img?'Dark areas of the artwork become stitches. Click one to edit it.':'Stitch file: each run is a part you can move, hide or delete.';vectorSizeSummary();$('btn-digitize').textContent=img?'Regenerate stitches':'Refresh stitch preview';if($('layer-guide'))$('layer-guide').textContent=img?'Click a silhouette to select it; drag to position. Delete hides it from the embroidery.':'Click any stitched section; drag to move. JEF/PES stitches are divided at jump commands and color changes; use Box split for finer sections.'; refreshLayerList();}

async function loadImage(src,name='Artwork',restoreMask=null){
 clearTimeout(recentSaveTimer);recentSaveTimer=null;currentProjectId=null;openedVersion=null;
 try{
  optimizeActive=false;optimizePrevious=null;$('fv26-revert-plan').hidden=true;$('fv26-fix-report').hidden=true;
  let im=await imageFrom(src);focusedOrderPart=checkedPart=null;restoreNotes();sourceDataUrl=src;sourceImage=im;sourceName=name;mode='image';vectorHandoff=false;originalJef=null;imported=[];palette=[1];manual=[];textLayers=[];selectedText=-1;refreshTextPicker();activeStroke=null;selectedNode=null;undoStack=[];redoStack=[];
  maskCanvas.width=im.naturalWidth;maskCanvas.height=im.naturalHeight;objectVersion=-1;objects=[];componentMap=null;selectedObject=-1;jefLayers=[];selectedJefLayerId=null;selectedParts.clear();layerHistory=[];futureLayerHistory=[];
  if(restoreMask){const pre=await imageFrom(restoreMask);maskCanvas.width=pre.naturalWidth;maskCanvas.height=pre.naturalHeight;maskCtx.drawImage(pre,0,0);maskVersion++;maskData=null;objectVersion=-1;}else thresholdSource(true);
  const ratio=maskCanvas.height/maskCanvas.width;
  if(ratio>.8)UI.width.value=75;else if(ratio<.25)UI.width.value=96;else UI.width.value=garment==='cap'?96:155;
  UI.sizeNumber.value=UI.width.value;updateNumbers();$('seq-scrub').value=1000;$('seq-scrub-out').textContent='100%';syncMode();setStatus('Artwork loaded','success');document.querySelector('#stitch-lab [data-view="thread"]')?.click();fitOnNextRebuild=true;queueRebuild();
  return true;
 }catch(e){alertMessage('Could not load artwork: '+e.message,true);return false;}
}

// Add an independent raster artwork as a digitized stitch layer without replacing the canvas.
// Source file remains external; saved projects retain the generated editable stitch paths.
async function addImageLayer(file){
 const name=file?.name||'Untitled';
 if(/\.jef$/i.test(name))return addJefOverlay(await file.arrayBuffer(),name);
 if(/\.(pes|pec)$/i.test(name)){
  try{const j=window.NOMU_PES.parse(await file.arrayBuffer());const ls=splitJefIntoLayers(j.events,j.center);
   for(const L of ls){L.name=name.replace(/\.[^.]+$/,'')+' / '+L.name;L.threadCode=j.palette[L.colorIndex]??1;}
   captureLayerUndo();jefLayers.push(...ls);selectJefLayer(ls[0]?.id??null);queueRebuild();switchTab('layers');return;
  }catch(e){alertMessage('PES layer could not be added: '+e.message,true);return;}
 }
 if(!/\.(png|jpg|jpeg|webp|bmp|gif)$/i.test(name))return alertMessage('Add a PNG, JPG, WEBP, GIF, BMP, JEF or PES.',true);
 try{
  const data=await readAsDataUrl(file),im=await imageFrom(data),width=Math.min(620,im.naturalWidth),height=Math.max(1,Math.round(im.naturalHeight*width/im.naturalWidth));
  const c=document.createElement('canvas');c.width=width;c.height=height;
  const g=c.getContext('2d',{willReadFrequently:true});g.fillStyle='#fff';g.fillRect(0,0,width,height);g.drawImage(im,0,0,width,height);
  const d=g.getImageData(0,0,width,height).data,ink=new Uint8Array(width*height);
  let minx=width,miny=height,maxx=-1,maxy=-1,count=0;const threshold=+UI.threshold.value||165;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x,k=i*4,lum=.299*d[k]+.587*d[k+1]+.114*d[k+2],on=lum<threshold;
   if(on){ink[i]=1;count++;minx=Math.min(minx,x);miny=Math.min(miny,y);maxx=Math.max(maxx,x);maxy=Math.max(maxy,y);}}
  if(!count)throw new Error('No dark artwork detected. Use a high-contrast PNG or lower the threshold.');
  const cropW=maxx-minx+1,cropH=maxy-miny+1;
  const mmWidth=Math.max(8,Math.min(70,Math.round(cropW/width*70))),mmHeight=mmWidth*cropH/cropW;
  const cell=.34,cols=Math.max(1,Math.ceil(mmWidth/cell)),rows=Math.max(1,Math.ceil(mmHeight/cell));
  const painted=(x,y)=>{const px=minx+Math.floor(x*cropW/cols),py=miny+Math.floor(y*cropH/rows);return !!ink[Math.min(height-1,py)*width+Math.min(width-1,px)];};
  const paths=[],spacing=Math.max(.4,+UI.spacing.value||.55),stride=Math.max(1,Math.round(spacing*rows/mmHeight));let rowCount=0;
  for(let y=0;y<rows;y+=stride){let x=0;while(x<cols){while(x<cols&&!painted(x,y))x++;if(x>=cols)break;let start=x;while(x<cols&&painted(x,y))x++;const end=x;
    if(end-start<2)continue;
    const ty=(y+.5)/rows*mmHeight-mmHeight/2;
    const x1=(start+.2)/cols*mmWidth-mmWidth/2,x2=(end-.2)/cols*mmWidth-mmWidth/2;
    let points=[{x:x1,y:ty},...interpolated({x:x1,y:ty},{x:x2,y:ty},2.7)];
    if(rowCount%2)points.reverse();rowCount++;paths.push(points);
  }}
  // Vector outline on the raster's boundary, to preserve silhouette contours.
  const edges=new Map();const add=(x,y,X,Y)=>{const key=x+','+y;if(!edges.has(key))edges.set(key,[]);edges.get(key).push([X,Y]);};
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(painted(x,y)){
   if(y===0||!painted(x,y-1))add(x,y,x+1,y);
   if(x===cols-1||!painted(x+1,y))add(x+1,y,x+1,y+1);
   if(y===rows-1||!painted(x,y+1))add(x+1,y+1,x,y+1);
   if(x===0||!painted(x-1,y))add(x,y+1,x,y);
  }
  for(const key of [...edges.keys()]){let lines=0;while((edges.get(key)||[]).length&&lines++<300){let [sx,sy]=key.split(',').map(Number),x=sx,y=sy,points=[],budget=0;
   do{points.push({x:x/cols*mmWidth-mmWidth/2,y:y/rows*mmHeight-mmHeight/2});const next=edges.get(x+','+y)?.pop();if(!next)break;[x,y]=next;}while((x!==sx||y!==sy)&&++budget<20000);
   if(points.length<5)continue;points.push(points[0]);const simp=simplifyPath(points,.26),run=[simp[0]];
   for(let i=1;i<simp.length;i++)run.push(...interpolated(simp[i-1],simp[i],1.75));paths.push(run);
  }}
  if(!paths.length)throw new Error('The image contains no usable stitched paths.');
  const factor=mode==='jef'?originalBounds.width/Math.max(.1,getSettings().width):1;
  if(factor!==1)for(const p of paths.flat()) {p.x*=factor;p.y*=factor;}
  captureLayerUndo();const L=makeJefLayer(paths,0,name.replace(/\.[^.]+$/,''));L.threadCode=palette[0]??1;
  // Place new image near, rather than over, existing artwork. Prefer positions within the selected hoop.
  // Include previously imported layers even when the stitch rebuild is still queued.
  const prior=jefLayers.filter(v=>!v.hidden).map(v=>layerWorldBounds(v));
  const base=events.some(e=>e.type==='stitch')?calcBounds(events):null;
  const bounds=[...(base?[base]:[]),...prior];
  const existing=bounds.length?{
   minx:Math.min(...bounds.map(v=>v.minx)),maxx:Math.max(...bounds.map(v=>v.maxx)),
   miny:Math.min(...bounds.map(v=>v.miny)),maxy:Math.max(...bounds.map(v=>v.maxy))
  }:null;
  if(existing){
   const hoop=PHYSICAL_HOOPS[selectedMachineHoop]||PHYSICAL_HOOPS.RE20b;
   const candidates=[
    {x:existing.maxx+mmWidth/2+5,y:0},
    {x:0,y:existing.maxy+mmHeight/2+5},
    {x:existing.minx-mmWidth/2-5,y:0},
    {x:0,y:existing.miny-mmHeight/2-5}
   ];
   const over=(v,max)=>Math.max(0,Math.abs(v)-max/2);
   candidates.sort((a,b)=>{const cost=p=>over(p.x,hoop[0]-mmWidth)*30+over(p.y,hoop[1]-mmHeight)*30;
    return cost(a)-cost(b);});
   L.dx=candidates[0].x*factor;L.dy=candidates[0].y*factor;
  } else {L.dx=0;L.dy=0;}
  L.sourceKind='raster-to-stitches';
  jefLayers.push(L);selectJefLayer(L.id);queueRebuild();switchTab('layers');
  alertMessage('Added '+name+' as a movable, resizable stitched image layer. Imported artwork was digitized approximately; inspect density, jumps and hoop fit before sewing.');
 }catch(e){alertMessage('Could not add image: '+e.message,true);}
}

function thresholdSource(autoCrop=false){
 if(!sourceImage)return;
 const work=document.createElement('canvas'); let xw=sourceImage.naturalWidth,yh=sourceImage.naturalHeight;let factor=Math.min(1,1000/Math.max(xw,yh));work.width=Math.max(1,Math.round(xw*factor));work.height=Math.max(1,Math.round(yh*factor));
 const wctx=work.getContext('2d',{willReadFrequently:true});wctx.fillStyle='#fff';wctx.fillRect(0,0,work.width,work.height);wctx.drawImage(sourceImage,0,0,work.width,work.height);
 const im=wctx.getImageData(0,0,work.width,work.height),d=im.data,t=num('threshold');
 let minx=work.width,miny=work.height,maxx=0,maxy=0;
 for(let y=0;y<work.height;y++)for(let x=0;x<work.width;x++){
  let i=(y*work.width+x)*4;let gray=.299*d[i]+.587*d[i+1]+.114*d[i+2];let ink=($('fv23-invert')?.checked?gray>=t:gray<t)&&d[i+3]>15;
  d[i]=d[i+1]=d[i+2]=ink?0:255;d[i+3]=255;
  if(ink){minx=Math.min(minx,x);miny=Math.min(miny,y);maxx=Math.max(maxx,x);maxy=Math.max(maxy,y);}
 }
 wctx.putImageData(im,0,0);
 if(autoCrop&&minx<maxx){let m=12;const xx=Math.max(0,minx-m),yy=Math.max(0,miny-m);maskCanvas.width=Math.min(work.width-xx,maxx-minx+2*m+1);maskCanvas.height=Math.min(work.height-yy,maxy-miny+2*m+1);maskCtx.drawImage(work,xx,yy,maskCanvas.width,maskCanvas.height,0,0,maskCanvas.width,maskCanvas.height);}
 else {maskCanvas.width=work.width;maskCanvas.height=work.height;maskCtx.drawImage(work,0,0);}
 maskVersion++;maskData=null;objectVersion=-1;
}
function getMask(){if(maskData&&computedVersion===maskVersion)return maskData;maskData=maskCtx.getImageData(0,0,maskCanvas.width,maskCanvas.height);computedVersion=maskVersion;return maskData;}

function objectAt(x,y){
 if(!componentMap||x<0||y<0||x>=maskCanvas.width||y>=maskCanvas.height)return -1;
 return componentMap[Math.floor(y)*maskCanvas.width+Math.floor(x)]||-1;
}
function componentForPoint(xmm,ymm,w,h){
 const px=Math.floor((xmm/w+.5)*maskCanvas.width),py=Math.floor((ymm/h+.5)*maskCanvas.height);
 return objectAt(px,py);
}
function updateObjects(force=false){
 if(mode!=='image'||!maskCanvas.width)return;
 if(!force&&objectVersion===maskVersion)return;
 const W=maskCanvas.width,H=maskCanvas.height,m=getMask().data;
 let seen=new Uint8Array(W*H),components=[],map=new Int32Array(W*H);
 const minCount=3; // extremely small disconnected noise only
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let start=y*W+x;
  if(seen[start]||m[start*4]>127)continue;
  seen[start]=1;let q=[start],head=0,bb=[x,y,x,y],area=0,cx=0,cy=0;
  while(head<q.length){const a=q[head++],xx=a%W,yy=Math.floor(a/W);area++;cx+=xx;cy+=yy;
   if(xx<bb[0])bb[0]=xx;if(xx>bb[2])bb[2]=xx;if(yy<bb[1])bb[1]=yy;if(yy>bb[3])bb[3]=yy;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(dx===0&&dy===0)continue;let nx=xx+dx,ny=yy+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;
    let k=ny*W+nx;if(!seen[k]&&m[k*4]<128){seen[k]=1;q.push(k);}
   }
  }
  if(area<minCount)continue;
  const id=components.length+1;
  for(let idx of q)map[idx]=id;
  const old=objects.find(o=>Math.hypot(o.cx-cx/area,o.cy-cy/area)<Math.max(8,Math.min(W,H)*.018));
  components.push({id,count:area,cx:cx/area,cy:cy/area,bb,enabled:old?.enabled??true,style:old?.style??'auto',patterns:old?.patterns,startPoint:old?.startPoint||null,angle:old?.angle??0,spacing:old?.spacing??0,dx:old?.dx??0,dy:old?.dy??0,scale:old?.scale??100,borderEnabled:old?.borderEnabled??false,borderWidth:old?.borderWidth??1.8,borderStep:old?.borderStep??.45,borderPatterns:old?.borderPatterns,borderPosition:old?.borderPosition??'center',borderOnly:old?.borderOnly??false,borderUnderlay:old?.borderUnderlay??true,fvNodeRings:old?.fvNodeRings||null});
 }
 componentMap=map;objects=components;objectVersion=maskVersion;
 if(selectedObject>objects.length)selectedObject=-1;
 fillObjectPicker();refreshLayerList();
}
function fillObjectPicker(){
 const el=$('shape-select');if(!el)return;
 const previous=selectedObject;el.replaceChildren();
 const option=(value,text)=>{let o=document.createElement('option');o.value=value;o.textContent=text;el.appendChild(o);};
 option('-1','Select a shape (click artwork)');
 objects.forEach((o,i)=>option(String(i+1),`Shape ${i+1} · ${(o.count*getSettings().width**2/Math.max(1,maskCanvas.width**2)).toFixed(1)} mm²${o.enabled?'':' · hidden'}`));
 selectedObject=previous>objects.length?-1:previous;el.value=String(selectedObject);
 const borderSel=$('border-object-select');borderSel.replaceChildren();for(const opt of el.options){const copy=document.createElement('option');copy.value=opt.value;copy.textContent=opt.textContent;borderSel.append(copy);}borderSel.value=String(selectedObject);
 syncObjectControls();syncBorderControls();
 if($('shape-count'))$('shape-count').textContent=`${objects.length} detected shapes · click a silhouette to edit its stitches`;
}
function syncObjectControls(){
 let o=objects[selectedObject-1],off=!o;
 for(const k of ['shape-enabled','shape-style','shape-angle','shape-spacing','shape-x','shape-y','shape-scale'])$(k).disabled=off;
 if(o){$('shape-enabled').checked=o.enabled;$('shape-style').value=o.style;$('shape-angle').value=o.angle;$('shape-spacing').value=o.spacing;$('shape-x').value=o.dx;$('shape-y').value=o.dy;$('shape-scale').value=o.scale;}
 syncStitchPicker('shape-style',o?.patterns||{});
 $('shape-angle-out').textContent=(o?o.angle:0)+'°';
 $('shape-spacing-out').textContent=o&&o.spacing?o.spacing+' mm':'Global';$('shape-scale-out').textContent=o?o.scale+'%':'100%';
}
function selectObject(idx){if(idx>=1)focusedOrderPart=null;selectedText=-1;selectedJefLayerId=null;selectedParts=idx>=1&&idx<=objects.length?new Set([partKey('raster',idx)]):new Set();refreshTextPicker();selectedObject=idx>=1&&idx<=objects.length?idx:-1; if($('shape-select'))$('shape-select').value=String(selectedObject);syncObjectControls();syncBorderControls();refreshLayerList();render();}

/* Keep border settings attached to the original shape, not global fill settings. */
function syncBorderControls(){
 const o=objects[selectedObject-1],off=!o||mode!=='image';
 for(const id of ['border-enabled','border-width','border-step','border-position','border-only','border-underlay','border-width-mm','border-stitch-style'])$(id).disabled=off;
 $('border-object-select').value=String(o?selectedObject:-1);
 $('border-enabled').checked=!!o?.borderEnabled;
 $('border-only').checked=!!o?.borderOnly;
 $('border-underlay').checked=o?.borderUnderlay!==false;
 $('border-width').value=o?.borderWidth??1.8;
 $('border-width-mm').value=o?.borderWidth??1.8;
 $('border-step').value=o?.borderStep??.45;
 $('border-position').value=o?.borderPosition??'center';syncStitchPicker('border-stitch-style',o?.borderPatterns||{});
 $('border-width-out').textContent=Number($('border-width').value).toFixed(1)+' mm';
 $('border-step-out').textContent=Number($('border-step').value).toFixed(2)+' mm';
 $('border-status').textContent=o?`Shape ${selectedObject}: ${o.borderEnabled?'Satin edge on':'Satin edge off'} · ${Number(o.borderWidth||1.8).toFixed(1)} mm${o.borderOnly?' · border only':''}`:'Select a shape in the design or from the Object dropdown.';
}
/* ---------- Workflow stages and settings tabs ----------
   The markup is static (stitch/workspace.html). This only toggles visibility and state. */
let currentTab='design';
const WORKFLOW_GROUPS=[
 {id:'create',name:'Artwork',tabs:['design','layers','create'],next:['Next: how it sews','Choose how the fills and edges sew.','Stitches','stitches']},
 {id:'digitize',name:'Stitches',tabs:['stitches','borders','crosshatch','draw'],next:['Next: sewing order','Check what sews first and where the thread jumps.','Sequence','order']},
 {id:'arrange',name:'Sequence',tabs:['order','sequence'],next:['Next: the machine','Check hoop fit and export the JEF.','Export','tools']},
 {id:'finish',name:'Export',tabs:['tools','view','ai'],next:['Test on scrap fabric first','Sew on scrap fabric with the same stabilizer.','Order','order']}
];
const TAB_CONFIG=WORKFLOW_GROUPS.flatMap(g=>g.tabs.map(id=>({id,group:g.id})));
let stageMemory={create:'design',digitize:'stitches',arrange:'order',finish:'tools'};
function groupForTab(tab){return WORKFLOW_GROUPS.find(group=>group.tabs.includes(tab))||WORKFLOW_GROUPS[0];}
function switchStage(id){const stage=WORKFLOW_GROUPS.find(g=>g.id===id);if(stage)switchTab(stageMemory[id]||stage.tabs[0]);}
function updateWorkflowGuide(){
 const title=$('workflow-next-title'),desc=$('workflow-next-description'),button=$('workflow-next-button');
 if(!title||!button)return;
 const [heading,description,action,next]=groupForTab(currentTab).next;
 title.textContent=heading;desc.textContent=description;button.textContent=action+' →';button.onclick=()=>switchTab(next);
}
// Lettering lives in the Add tab and per-shape settings in Parts.
const TAB_ALIAS={text:'create',objects:'layers'};
function switchTab(name,focus=false){
 name=TAB_ALIAS[name]||name;
 if(!TAB_CONFIG.some(t=>t.id===name))return;
 currentTab=name;
 const stage=groupForTab(name);
 stageMemory[stage.id]=name;
 document.querySelectorAll('[data-pane]').forEach(el=>{el.hidden=el.dataset.pane!==name;});
 document.querySelectorAll('[data-tab]').forEach(el=>{
  const active=el.dataset.tab===name;
  el.hidden=el.dataset.group!==stage.id;
  el.setAttribute('aria-selected',String(active));el.tabIndex=active?0:-1;
 });
 document.querySelectorAll('#stitch-lab [data-stage],.sl-flyout [data-stage],.sl-commands [data-stage]').forEach(el=>{const active=el.dataset.stage===stage.id;el.setAttribute('aria-pressed',String(active));el.classList.toggle('current',active);});
 if(name==='borders')syncBorderControls();if(name==='layers')refreshLayerList();if(name==='order')renderOrderList();
 if(name==='ai')aiSettingsSummary();
 syncPartReview();updateWorkflowGuide();
 if(focus)document.querySelector(`[data-tab="${name}"]`)?.focus();
}
function initializeTabs(){
 document.querySelectorAll('#stitch-lab [data-stage],.sl-flyout [data-stage],.sl-commands [data-stage]').forEach(b=>b.addEventListener('click',()=>switchStage(b.dataset.stage)));
 const tabs=document.querySelectorAll('[data-tab]');
 tabs.forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
 tabs[0]?.parentElement?.addEventListener('keydown',e=>{
  if(!['ArrowRight','ArrowLeft'].includes(e.key))return;
  const current=groupForTab(currentTab).tabs,index=current.indexOf(currentTab);
  switchTab(current[(index+(e.key==='ArrowRight'?1:-1)+current.length)%current.length],true);e.preventDefault();
 });
 switchTab('design');
}

function outlineObject(o,w,h,maxLen){
 if(o.fvNodeRings)return objectRings(o,w,h).map(r=>fvResample(r,maxLen));
 let W=maskCanvas.width,H=maskCanvas.height,cell=w/W;
 const [x0,y0,x1,y1]=o.bb, ink=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&componentMap[y*W+x]===o.id;
 let edges=new Map();const key=(a,b)=>a+','+b;
 function add(x,y,nx,ny){let k=key(x,y),v=edges.get(k)||[];v.push([nx,ny]);edges.set(k,v);}
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
  if(!ink(x,y))continue;
  if(!ink(x,y-1))add(x,y,x+1,y);
  if(!ink(x+1,y))add(x+1,y,x+1,y+1);
  if(!ink(x,y+1))add(x+1,y+1,x,y+1);
  if(!ink(x-1,y))add(x,y+1,x,y);
 }
 let paths=[];
 for(let [k,unused] of edges){
  while((edges.get(k)||[]).length){let [sx,sy]=k.split(',').map(Number),x=sx,y=sy,pts=[],n=0;
   do {pts.push({x:(x/W-.5)*w,y:(y/H-.5)*h});let opts=edges.get(key(x,y));if(!opts||!opts.length)break;[x,y]=opts.pop();n++;}while((x!==sx||y!==sy)&&n<W*H*4);
   if(pts.length<5)continue;pts.push(pts[0]);let smooth=simplifyPath(pts,.18),res=[smooth[0]];
   for(let i=1;i<smooth.length;i++)res.push(...interpolated(smooth[i-1],smooth[i],maxLen));paths.push(res);
  }
 }
 return paths;
}
/* Satin edging: sample each directed contour and lay alternating penetrations
   on the opposite sides of the boundary. These are physical zigzag stitch paths,
   not a drawn outline. Each polygon edge is directed with the black area on the
   screen-right side, including hole boundaries. */
function sampleClosedContour(path,spacing){
 const src=path.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
 if(src.length<3)return [];
 const poly=src.slice();if(dist(poly[0],poly.at(-1))>.001)poly.push(poly[0]);
 const segments=[],lengths=[];let total=0;
 for(let i=1;i<poly.length;i++){const d=dist(poly[i-1],poly[i]);if(d<.0001)continue;segments.push([poly[i-1],poly[i],d]);total+=d;lengths.push(total);}
 const n=Math.min(6500,Math.max(4,Math.ceil(total/Math.max(.30,spacing))));
 if(!Number.isFinite(total)||total<1||n<4)return [];
 const sampled=[];let edge=0,previous=0;
 for(let i=0;i<n;i++){
  const at=i*total/n;while(edge<segments.length-1&&lengths[edge]<at){previous=lengths[edge];edge++;}
  const [a,b,len]=segments[edge],f=Math.min(1,Math.max(0,(at-previous)/len));
  sampled.push({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f});
 }
 return sampled;
}
function satinContourBorder(o,w,h,width,advance,placement,addUnderlay){
 const contours=outlineObject(o,w,h,1.4),paths=[];
 let skipped=0;
 const cWidth=Math.max(.6,Math.min(width,6)),step=Math.max(.30,advance);
 const inner=placement==='inside'?cWidth:placement==='outside'?0:cWidth/2;
 const outer=placement==='inside'?0:placement==='outside'?-cWidth:-cWidth/2;
 for(const boundary of contours){
  const points=sampleClosedContour(boundary,step),n=points.length;
  if(n<4){skipped++;continue;}
  // Centerline underlay is sewn before the cover stitches.
  const normalAt=(i)=>{const p=points[(i-1+n)%n],q=points[(i+1)%n],dx=q.x-p.x,dy=q.y-p.y,l=Math.hypot(dx,dy)||1;return {x:-dy/l,y:dx/l};};
  const move=(p,normal,d)=>({x:p.x+normal.x*d,y:p.y+normal.y*d});
  if(addUnderlay){
   const track=[],underlayStep=Math.max(1,Math.round(2.2/step));
   for(let i=0;i<n;i+=underlayStep)track.push(move(points[i],normalAt(i),(inner+outer)/2));
   if(track.length>=3){track.push({...track[0]});paths.push(track);}
  }
  const stitches=[];
  for(let i=0;i<n;i++){const p=points[i],normal=normalAt(i);
   stitches.push(move(p,normal,inner),move(p,normal,outer));
  }
  if(stitches.length>=8){stitches.push({...stitches[0]});stitches.borderTop=true;paths.push(stitches);}else skipped++;
 }
 return {paths,skipped};
}

function reinforceRun(points){if(points.length<2)return points;const out=[points[0]];
 for(let i=1;i<points.length;i++)out.push(points[i],points[i-1],points[i]);return out;}
function stitchManualPath(points,style,width,length,patterns={}){
 if(points.length<2)return points;
 const base=[points[0]];
 for(let i=1;i<points.length;i++)base.push(...interpolated(points[i-1],points[i],style==='zigzag'?.55:length));
 const family=stitchPatterns.family(style),pattern=patterns[family],repeat=stitchPatterns.sizeFor(family,patterns[family+'Size']);
 let path=base;
 if(style==='zigzag'){
  const spans=base.map((p,i)=>{
   const prev=base[Math.max(0,i-1)],next=base[Math.min(base.length-1,i+1)],dx=next.x-prev.x,dy=next.y-prev.y,n=Math.hypot(dx,dy)||1,side=i%2?1:-1;
   return {x:p.x-side*dy/n*width/2,y:p.y+side*dx/n*width/2};
  });
  path=stitchPatterns.satinTexture([spans],pattern,repeat)[0];
 }else path=stitchPatterns.accentRun([style==='triple'?reinforceRun(base):base],pattern,repeat)[0];
 if(patterns.relief&&patterns.relief!=='none')path=stitchPatterns.reliefOnRuns([path],patterns.relief,
  stitchPatterns.sizeFor('embossed',patterns.reliefSize),Math.round(Math.max(1,Math.min(3,+patterns.reliefPasses||2))),Number(patterns.reliefAngle)||0)[0];
 return path;
}

/* ---------- Image digitizer ----------
   Each ink region is traced to its outline in millimetres and sewn like a vector shape: the
   recipe (tatami, satin, running line) follows the shape, rows are chained into one continuous
   path, underlay sews first, and each region starts where the previous one ended. Connections
   stay inside the shape, so no stitch crosses empty fabric. */
// Trace the boundary of an ink region. ink(x,y) tests a pixel; toMm(x,y) maps a pixel corner.
function traceRings(ink,x0,y0,x1,y1,toMm,tol){
 const VW=x1-x0+3,key=(x,y)=>(y-y0+1)*VW+(x-x0+1),next=new Map();
 const add=(ax,ay,bx,by)=>{const k=key(ax,ay);let v=next.get(k);if(!v)next.set(k,v=[]);v.push(key(bx,by));};
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){if(!ink(x,y))continue;
  if(!ink(x,y-1))add(x,y,x+1,y);if(!ink(x+1,y))add(x+1,y,x+1,y+1);if(!ink(x,y+1))add(x+1,y+1,x,y+1);if(!ink(x-1,y))add(x,y+1,x,y);}
 const rings=[],px=k=>k%VW+x0-1,py=k=>Math.floor(k/VW)+y0-1;
 for(const [start,list] of next)while(list.length){const verts=[];let k=start,guard=0;
  // Where two pixels touch only at a corner, step across to the diagonal pixel (a left turn) so
  // the outline stays in one piece (8-connected, like the region itself) instead of splitting.
  let dx=0,dy=0;
  do{verts.push(k);const opts=next.get(k);if(!opts?.length)break;let pick=opts.length-1;
   if(opts.length>1&&(dx||dy)){let best=-9;opts.forEach((n,i)=>{const ex=px(n)-px(k),ey=py(n)-py(k),turn=ex===dy&&ey===-dx?2:ex===dx&&ey===dy?1:0;if(turn>best){best=turn;pick=i;}});}
   const n=opts.splice(pick,1)[0];dx=px(n)-px(k);dy=py(n)-py(k);k=n;}while(k!==start&&++guard<4e6);
  if(verts.length<4)continue;
  // Midpoints of the pixel edges turn staircases into straight lines; simplification does the rest.
  const pts=verts.map((v,i)=>{const w=verts[(i+1)%verts.length];return toMm((px(v)+px(w))/2,(py(v)+py(w))/2);});
  pts.push({...pts[0]});const ring=simplifyPath(pts,tol);if(ring.length>=4)rings.push(ring);}
 return rings;}
function ringArea(r){let a=0;for(let i=1;i<r.length;i++)a+=r[i-1].x*r[i].y-r[i].x*r[i-1].y;return a/2;}
const regionRingCache=new Map();
function objectRings(o,w,h){
 if(o.fvNodeRings)return o.fvNodeRings.map(r=>r.map(p=>({x:p.x*w,y:p.y*h})));
 const W=maskCanvas.width,H=maskCanvas.height,key=objectVersion+'|'+W+'x'+H+'|'+w.toFixed(3)+'|'+o.id;
 let rings=regionRingCache.get(key);
 if(!rings){if(regionRingCache.size>800)regionRingCache.clear();const [x0,y0,x1,y1]=o.bb,cell=w/W;
  rings=traceRings((x,y)=>x>=0&&y>=0&&x<W&&y<H&&componentMap[y*W+x]===o.id,x0,y0,x1,y1,(x,y)=>({x:(x/W-.5)*w,y:(y/H-.5)*h}),Math.min(.2,Math.max(.03,cell*.6)));
  regionRingCache.set(key,rings);}
 // Pinholes smaller than the noise filter are filled over; outlines (positive area) always stay.
 return rings.filter(r=>{const a=ringArea(r);return a>0?a>.005:-a>=Math.max(.1,smallArea*.5);});}
// Stitch settings shared by artwork shapes and lettering.
function regionOptions(s){const u=s.underlayType;
 return {patterns:s.patterns,stitch:Math.max(2,Math.min(7,s.length)),run:Math.max(1.2,Math.min(2.5,s.length)),underlay:u==='none'?false:u==='edge'||u==='tatami'?u:'auto',pull:s.pullComp,
  satinStep:s.satinStep,satinLimit:s.satinLimit,satinOverlap:s.satinOverlap,satinDirection:s.satinDirection,chain:s.seqConnect,maxLink:Math.max(4,s.seqMaxLink),
  cross:{on:!!s.crossEnabled,spacing:s.crossSpacing,angle:s.crossAngle,open:s.crossMode==='mesh'}};}
// Sew a traced shape. Explicit Satin keeps its stitch type when coverage needs several columns.
function sewRegion(rings,opt){
 const A=Math.abs(fvArea(rings)),P=rings.reduce((t,r)=>t+fvRingLen(r),0),w=P?2*A/P:0;
 const pull=Math.min(opt.pull||0,Math.max(.05,w*.1));
 const base={patterns:opt.patterns,startPoint:opt.startPoint,angle:opt.angle||0,spacing:opt.spacing,satinSpacing:opt.satinStep,satinMax:opt.satinLimit,satinOverlap:opt.satinOverlap,
  stitch:opt.stitch,run:opt.run,underlay:opt.underlay,pull,entry:opt.entry,ties:true,chain:opt.chain,maxLink:opt.maxLink};
 let style=opt.style||'auto',recipe;
 const explicitSatin=(window.FervorPatterns?.family(style)||style)==='satin'||['satin-outline','zigzag'].includes(style);
 if(w<.45&&style!=='triple'&&!explicitSatin&&!window.FervorPatterns?.types[style])style='outline';
 const cross=opt.cross||{},crossLayer=style==='crosshatch'||cross.on;
 const bb=fvBounds(rings.flat()),tiny=Math.max(bb.maxx-bb.minx,bb.maxy-bb.miny)<7;
 if(style==='auto'){
  recipe=tiny?{...base,type:'fill'}:fvAutoRecipe(rings,{...base,type:'fill',prefer:base.angle},opt.satinLimit,1);
  if(recipe.type==='fill')recipe.outline=true;
 }else if(explicitSatin){
  const direction=opt.satinDirection==='angle'?'angle':'auto';
  recipe={...base,type:style==='raised-satin'?style:'satin',direction,auto:direction==='angle'?'rows':undefined,
   satinSpacing:style==='zigzag'?Math.max(.85,opt.satinStep*2):opt.satinStep,
   outline:style==='satin-outline'};
 }else if(style==='outline'||style==='triple'||(style!=='fill'&&window.FervorPatterns?.types[style]))recipe={...base,type:style};
 else{
  recipe={...base,type:'fill',spacing:crossLayer&&cross.open?Math.max(opt.spacing,cross.spacing):opt.spacing};
  if(style==='fill-outline')recipe.outline=true;
 }
 if(crossLayer&&recipe.type==='fill')recipe.cross={spacing:cross.spacing||1,angle:cross.angle??90};
 if(explicitSatin||recipe.type==='satin')recipe.onSatin=({columns,splitSections})=>{satinColumns+=columns;satinSplits+=splitSections;};
 return fvBuildPaths({kind:'fill',rings},recipe);
}
function smartPaths(s,w,h){
 updateObjects();sequenceStats={joined:0,routeLength:0,perShapeJumps:0,crossObjectJumps:0};
 const W=maskCanvas.width,H=maskCanvas.height,mmSqPerPx=w*h/(W*H),items=[],shared=regionOptions(s);
 for(const o of objects){
  if(!o.enabled||o.count*mmSqPerPx<smallArea)continue;
  const c={x:(o.cx/W-.5)*w,y:(o.cy/H-.5)*h},ratio=(o.scale||100)/100,sx=ratio*(o.stretchX||1),sy=ratio*(o.stretchY||1);
  const move=p=>({x:c.x+(p.x-c.x)*sx+(o.dx||0),y:c.y+(p.y-c.y)*sy+(o.dy||0)});
  const rings=objectRings(o,w,h).map(r=>r.map(move));if(!rings.length)continue;
  const b=fvBounds(rings.flat());items.push({o,rings,move,center:{x:(b.minx+b.maxx)/2,y:(b.miny+b.maxy)/2}});
 }
 if(s.seqOrder==='reading')items.sort((a,b)=>Math.abs(a.center.y-b.center.y)<8?a.center.x-b.center.x:a.center.y-b.center.y);
 // Start at the hoop centre, then always sew the nearest remaining shape from where the last one ended.
 const output=[];let cur={x:0,y:0};
 while(items.length){let pick=0;
  if(s.seqOrder!=='reading'){let bd=Infinity;items.forEach((it,i)=>{const d=fvNearestOnRings(it.rings,cur)?.d??Infinity;if(d<bd){bd=d;pick=i;}});}
  const {o,rings,move}=items.splice(pick,1)[0];
  const borderOnly=o.borderEnabled&&o.borderOnly,style=o.style==='auto'?s.style:o.style,angle=o.style==='auto'?s.fillAngle:o.angle;
  const paths=borderOnly?[]:sewRegion(rings,{...shared,patterns:{...shared.patterns,...o.patterns},style,angle,spacing:o.spacing||s.spacing,entry:cur,startPoint:o.startPoint&&move({x:o.startPoint.x*w,y:o.startPoint.y*h})});
  if(o.borderEnabled){
   const bw=Math.min(o.borderWidth||1.8,s.satinLimit,6);
   const edged=satinContourBorder(o,w,h,bw,o.borderStep||.45,o.borderPosition||'center',o.borderUnderlay!==false);
   const edge=o.borderPatterns||{};
   let at=paths.at(-1)?.at(-1)||(o.startPoint?move({x:o.startPoint.x*w,y:o.startPoint.y*h}):cur);
   for(const p of edged.paths){
    const ordered=fvRotateRing(p.map(move),at);
    const textured=p.borderTop?stitchPatterns.satinTexture([ordered],edge.satin,stitchPatterns.sizeFor('satin',edge.satinSize))[0]:ordered;
    const q=p.borderTop&&edge.relief&&edge.relief!=='none'?stitchPatterns.reliefOnRuns([textured],edge.relief,
     stitchPatterns.sizeFor('embossed',edge.reliefSize),Math.round(Math.max(1,Math.min(3,+edge.reliefPasses||2))),Number(edge.reliefAngle)||0)[0]:textured;
    paths.push(q);at=q.at(-1);
   }
  }
  for(const p of paths){p.ownerId=o.id;p.forceJump=true;}
  if(paths.length){output.push(...paths);cur=paths.at(-1).at(-1);}
 }
 let prev=null;for(const p of output){if(prev){if(prev.ownerId===p.ownerId)sequenceStats.perShapeJumps++;else sequenceStats.crossObjectJumps++;}prev=p;}
 return output;
}

/* Independent editable lettering layers. Render actual glyph outlines to a bitmap,
   then produce JEF sew/jump paths from their shapes (no fonts needed at stitch time). */
const lettering=window.FervorLettering;
const TEXT_FAMILIES=[
 ['Small / run stitch',[
  ['micro-block','Micro Block',null,3,5],['micro-narrow','Micro Narrow',null,3,5],['micro-round','Micro Round',null,3,5]
 ]],
 ['Block',[
  ['sans','Arial Bold','bold 128px Arial, sans-serif',5,25],['humanist','Verdana Bold','bold 128px Verdana, Arial, sans-serif',5,25],
  ['narrow','Arial Narrow Bold','bold 128px "Arial Narrow", Arial, sans-serif',6,25],['avenir','Avenir Heavy','bold 128px "Avenir Next", Arial, sans-serif',6,25]
 ]],
 ['Serif',[
  ['serif','Classic Serif','bold 128px "Times New Roman", Times, serif',7,30],['georgia','Georgia Bold','bold 128px Georgia, serif',7,30],
  ['mono','Typewriter','bold 128px "Courier New", monospace',8,30]
 ]],
 ['Fancy / special',[
  ['rounded','Arial Rounded Bold','bold 128px "Arial Rounded MT Bold", Arial, sans-serif',6,28],
  ['futura','Futura Bold','bold 128px Futura, Arial, sans-serif',7,28],['copperplate','Copperplate','bold 128px Copperplate, Georgia, serif',10,35]
 ]],
 ['Monogram / appliqué outlines',[
  ['impact','Heavy Display','900 128px Impact, "Arial Black", sans-serif',12,35],['monogram','Baskerville Capitals','bold 128px Baskerville, Georgia, serif',10,35],
  ['outline-block','Wide Block','900 128px "Arial Black", Arial, sans-serif',12,35]
 ]],
 ['Outline',[['trebuchet','Trebuchet Outline','bold 128px "Trebuchet MS", Arial, sans-serif',7,30]]],
 ['Script',[
  ['chancery','Apple Chancery','128px "Apple Chancery", cursive',12,35],
  ['snell','Snell Roundhand','bold 128px "Snell Roundhand", cursive',14,35]
 ]],
 ['Greek / Cyrillic / Japanese',[
  ['multilingual','Greek / Cyrillic · Sans','bold 128px Arial, sans-serif',8,30],
  ['japanese','Japanese · Hiragino Sans','bold 128px "Hiragino Sans", "Yu Gothic", sans-serif',12,35]
 ]]
];
const TEXT_FONTS=Object.fromEntries(TEXT_FAMILIES.flatMap(([,fonts])=>fonts.map(f=>[f[0],f])));
function mountTextFonts(){
 const select=$('text-font');select.replaceChildren();
 for(const [label,fonts] of TEXT_FAMILIES){
  const group=document.createElement('optgroup');group.label=label;
  for(const [id,name] of fonts)group.append(new Option(name,id));
  select.append(group);
 }
}
const TEXT_FIELDS={content:'text-content',font:'text-font',height:'text-height',tracking:'text-track',x:'text-x',y:'text-y',
 rotation:'text-rotation',style:'text-style',spacing:'text-spacing',satinAxis:'text-satin-axis',join:'text-join',
 width:'text-width',lineGap:'text-line-gap',align:'text-align'};
const TEXT_NUMBERS=new Set(['height','tracking','x','y','rotation','spacing','width','lineGap']);
const TEXT_INPUTS=Object.values(TEXT_FIELDS);
const textImageCache=new Map();
function readTextFields(){
 const t={};
 for(const [key,id] of Object.entries(TEXT_FIELDS))t[key]=TEXT_NUMBERS.has(key)?$(id).valueAsNumber:$(id).value;
 t.patterns=readPatterns('text-style');t.satinAxis=+$('text-satin-axis').value;t.microRun=$('text-micro-run').value;
 return lettering.fields(t);
}
function setTextFields(value){
 if(!value)return;
 const t=lettering.fields(value);
 for(const [key,id] of Object.entries(TEXT_FIELDS))if(t[key]!==undefined)$(id).value=t[key];
 syncStitchPicker('text-style',t.patterns||{});
 $('text-micro-run').value=t.microRun==='triple'?'triple':'single';
 updateTextLabels();
}
function updateTextLabels(){
 const t=readTextFields(),micro=lettering.isMicro(t.font),fallback=micro&&!lettering.supports(t.content);
 for(const [id,out,u] of [['text-height','text-height-out',' mm'],['text-track','text-track-out',' mm'],['text-rotation','text-rotation-out','°'],['text-spacing','text-spacing-out',' mm']])$(out).textContent=$(id).value+u;
 $('text-outline-settings').hidden=micro&&!fallback;
 $('text-micro-settings').hidden=!micro||fallback;
 const font=TEXT_FONTS[t.font];
 const size=font?`${font[3]}–${font[4]} mm starting cap height.`:'';
 $('text-font-note').textContent=fallback?'These characters use Arial outlines. Micro faces cover uppercase Latin, numbers and common marks.':
  micro?`${size} Single-line capitals for small lettering.`:`${size} Lowercase and accents vary in height.`;
 syncStitchPicker('text-style');
 const bmp=textRaster(t);$('text-dimensions').textContent=bmp.W||bmp.paths?.length?`${bmp.mmW.toFixed(1)} × ${bmp.mmH.toFixed(1)} mm`:'—';
}
function refreshTextPicker(){
 const select=$('text-select');if(!select)return;select.replaceChildren();
 const option=(value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);};
 option('-1','New lettering layer');
 textLayers.forEach((t,i)=>option(String(i+1),`${i+1}. ${(t.content||'(empty)').replace(/\n/g,' / ')}`));
 select.value=String(selectedText>=0?selectedText+1:-1);
 $('remove-text').disabled=$('duplicate-text').disabled=selectedText<0;
 $('split-text').disabled=selectedText<0||(textRaster(textLayers[selectedText]).letters?.length||0)<2;
}
function selectText(i){
 focusedOrderPart=null;selectedText=i>=0&&i<textLayers.length?i:-1;
 if(selectedText>=0){selectedParts.clear();selectionSync();}
 selectedObject=-1;syncObjectControls();refreshTextPicker();refreshLayerList();
 if(selectedText>=0)setTextFields(textLayers[selectedText]);
 render();
}
function addText(pos=null){
 const t=readTextFields();t.content=t.content.trim();
 if(!t.content){$('jump-to-text').click();$('text-feedback').textContent='Enter your lettering first.';return;}
 if(pos){t.x=pos.x;t.y=pos.y;}
 captureLayerUndo();textLayers.push(t);selectText(textLayers.length-1);queueRebuild();
 $('text-feedback').textContent='Lettering added. Edit it here or drag it with Select.';
}
function splitTextIntoLetters(){
 const t=textLayers[selectedText];if(!t)return;
 const letters=textRaster(t).letters;
 if(!letters||letters.length<2)return;
 const world=textTransform(t),first=selectedText;
 const parts=letters.map(glyph=>({...t,...world(glyph),content:glyph.content,
  font:lettering.isMicro(t.font)&&!lettering.supports(t.content)?'sans':t.font}));
 captureLayerUndo();textLayers.splice(first,1,...parts.map(t=>({...t,noteAnchor:undefined})));
 stitchOrderKeys=stitchOrderKeys.flatMap(key=>{
  if(!key.startsWith('text:'))return [key];
  const index=+key.slice(5);
  if(index===first)return parts.map((_,i)=>'text:'+(first+i));
  return ['text:'+(index>first?index+parts.length-1:index)];
 });
 selectText(first);queueRebuild();
 $('text-feedback').textContent=`${parts.length} editable letters. Select one here or on the canvas to change its position, font or stitches.`;
}
function textGeometryKey(t){return JSON.stringify([t.content,t.font,t.height,t.tracking,t.width,t.lineGap,t.align]);}
function textRaster(value){
 const t=lettering.fields(value),key=textGeometryKey(t);
 if(textImageCache.has(key))return textImageCache.get(key);
 const strokes=lettering.layout(t);
 if(strokes){if(textImageCache.size>=18)textImageCache.clear();textImageCache.set(key,strokes);return strokes;}
 const canvas=document.createElement('canvas');let c=canvas.getContext('2d',{willReadFrequently:true});
 const font=TEXT_FONTS[t.font]?.[2]||(lettering.isMicro(t.font)?TEXT_FONTS.sans:TEXT_FONTS.serif)[2];
 c.font=font;c.textBaseline='alphabetic';
 const cap=c.measureText('H').actualBoundingBoxAscent||92,mmPerPx=t.height/cap,mmPerPxX=mmPerPx*t.width/100;
 const trackPx=t.tracking/mmPerPxX,lineStep=cap+t.lineGap/mmPerPx;
 const rows=t.content.split('\n').map(line=>{
  const glyphs=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(line)].map(x=>x.segment):[...line];
  const advances=glyphs.map(ch=>Math.max(1,c.measureText(ch).width+trackPx));
  return {glyphs,advances,width:glyphs.length?advances.reduce((a,b)=>a+b,0)-trackPx:0};
 });
 const advance=Math.max(1,...rows.map(row=>row.width));
 // Layout operates on a fixed pixel cap height. Preserve exact physical dimensions at any zoom.
 canvas.width=Math.ceil(advance+96);canvas.height=Math.ceil(210+(rows.length-1)*lineStep);
 c=canvas.getContext('2d',{willReadFrequently:true});c.font=font;c.textBaseline='alphabetic';c.fillStyle='#000';
 const letters=[];
 rows.forEach((row,i)=>{
  let x=45+lettering.offset(t.align,advance,row.width);
  for(let j=0;j<row.glyphs.length;j++){
   const content=row.glyphs[j],baseline=158+i*lineStep,m=c.measureText(content);
   c.fillText(content,x,baseline);
   if(content.trim())letters.push({content,
    x:x+(m.actualBoundingBoxRight-m.actualBoundingBoxLeft)/2,
    y:baseline+(m.actualBoundingBoxDescent-m.actualBoundingBoxAscent)/2});
   x+=row.advances[j];
  }
 });
 const d=c.getImageData(0,0,canvas.width,canvas.height).data;
 let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
 for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
  if(d[(y*canvas.width+x)*4+3]>140){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
 }
 const W=Math.max(0,maxX-minX+1),H=Math.max(0,maxY-minY+1),ink=new Uint8Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)ink[y*W+x]=d[((y+minY)*canvas.width+x+minX)*4+3]>140?1:0;
 const result={W,H,letters:letters.map(g=>({content:g.content,x:(g.x-minX-W/2)*mmPerPxX,y:(g.y-minY-H/2)*mmPerPx})),mmW:W*mmPerPxX,mmH:H*mmPerPx,mmPerPx,mmPerPxX,ink};
 if(textImageCache.size>=18)textImageCache.clear();textImageCache.set(key,result);return result;
}
function textTransform(t){const angle=(t.rotation||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 return p=>({x:p.x*c-p.y*s+t.x,y:p.x*s+p.y*c+t.y});}
// Lettering: every glyph (and each separate piece, like the dot of an i) is traced to its outline
// and sewn left to right, each one starting where the previous one ended.
const textRingCache=new Map();
function textRegions(t){t=lettering.fields(t);const key=textGeometryKey(t);let regions=textRingCache.get(key);
 if(!regions){const bmp=textRaster(t);regions=[];
  if(bmp.W){const {W,H,ink,mmPerPx,mmPerPxX}=bmp,label=new Int32Array(W*H);let id=0;
   for(let i=0;i<W*H;i++){if(!ink[i]||label[i])continue;id++;label[i]=id;const q=[i];let x0=W,y0=H,x1=0,y1=0;
    for(let n=0;n<q.length;n++){const k=q[n],x=k%W,y=(k-x)/W;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
     for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;const m=ny*W+nx;if(ink[m]&&!label[m]){label[m]=id;q.push(m);}}}
    if(q.length<4)continue;const me=id;
    const rings=traceRings((x,y)=>x>=0&&y>=0&&x<W&&y<H&&label[y*W+x]===me,x0,y0,x1,y1,(x,y)=>({x:(x-W/2)*mmPerPxX,y:(y-H/2)*mmPerPx}),Math.min(.15,Math.max(.03,mmPerPx*.6))).filter(r=>{const a=ringArea(r);return a>0?a>.005:-a>=.04;});
    if(rings.length)regions.push({rings,order:x0});}
   regions.sort((a,b)=>a.order-b.order);}
  if(textRingCache.size>25)textRingCache.clear();textRingCache.set(key,regions);}
 const transform=textTransform(t);
 return regions.map(r=>r.rings.map(ring=>ring.map(transform)));}
function textPaths(value,s=getSettings(),entry=null){
 const t=lettering.fields(value),geometry=textRaster(t);
 if(geometry.paths){
  const move=textTransform(t),step=Math.max(.7,Math.min(1.55,t.height*.23)),triple=t.microRun==='triple';
  let cursor=t.join==='closest'?entry:null;
  return geometry.paths.map(p=>{
   const stitches=lettering.sample(p,step).map(move);
   if(cursor&&stitches.length>1&&dist(cursor,stitches.at(-1))<dist(cursor,stitches[0]))stitches.reverse();
   const path=triple?reinforceRun(stitches):stitches;
   cursor=t.join==='closest'?path.at(-1):null;
   path.forceJump=true;return path;
  }).filter(path=>path.length>1);
 }
 const shared=regionOptions(s),style=t.style||'auto',spacing=t.spacing||.45,paths=[];
 // Satin axis is measured on the lettering, so it turns with it.
 const axis=(Number.isFinite(t.satinAxis)?t.satinAxis:90)+(t.rotation||0),fill=(s.fillAngle||0)+(t.rotation||0),satin=stitchPatterns.family(style)==='satin';
 // No underlay under 5 mm lettering: it would show through and thicken the letters.
 const underlay=t.height<5?false:shared.underlay;
 let cur=t.join==='closest'?entry:null;
 for(const rings of textRegions(t)){
  const p=sewRegion(rings,{...shared,patterns:{...shared.patterns,...t.patterns},style,angle:satin?axis+90:fill,
   satinDirection:satin?'angle':shared.satinDirection,spacing,satinStep:spacing,underlay,entry:cur});
  if(p.length){paths.push(...p);if(t.join==='closest')cur=p.at(-1).at(-1);}
 }
 return paths;}
function appendTextEvents(out,s){
 let cur=null;for(let i=out.length-1;i>=0;i--)if(out[i].type!=='color'){cur={x:out[i].x,y:out[i].y};break;}
 for(let i=0;i<textLayers.length;i++){const t=textLayers[i];if(!t.content.trim())continue;const paths=textPaths(t,s,cur);
  if(paths.length){const from=out.length;makePathsToEvents(paths,{...s,angle:0,offsetX:0,offsetY:0},1,1,out);for(let n=from;n<out.length;n++)out[n].orderKey='text:'+i;cur=paths.at(-1).at(-1);}}}
function textHitTest(wp){for(let i=textLayers.length-1;i>=0;i--){const t=textLayers[i],b=textRaster(t),a=-t.rotation*Math.PI/180,dx=wp.x-t.x,dy=wp.y-t.y;
  let rx=dx*Math.cos(a)-dy*Math.sin(a),ry=dx*Math.sin(a)+dy*Math.cos(a);
  if(Math.abs(rx)<b.mmW/2+2&&Math.abs(ry)<b.mmH/2+2)return i;
 }return -1;}
function renderTextSelections(scale){if(selectedText<0||!textLayers[selectedText])return;const t=textLayers[selectedText],b=textRaster(t);
 ctx.save();ctx.translate(display.cx+t.x*scale,display.cy+t.y*scale);ctx.rotate(t.rotation*Math.PI/180);ctx.strokeStyle=selectionInk();ctx.lineWidth=1.4;ctx.setLineDash([7,5]);ctx.strokeRect(-b.mmW*scale/2-6,-b.mmH*scale/2-6,b.mmW*scale+12,b.mmH*scale+12);ctx.restore();}

const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function interpolated(a,b,step){let n=Math.max(1,Math.ceil(dist(a,b)/Math.max(.6,step))),p=[];for(let i=1;i<=n;i++)p.push({x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n});return p;}
function simplifyPath(points,tolerance=.36){if(points.length<5)return points;let keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;let stack=[[0,points.length-1]];
 while(stack.length){let [a,b]=stack.pop(),maxD=0,idx=-1,p=points[a],q=points[b];let dx=q.x-p.x,dy=q.y-p.y,den=dx*dx+dy*dy;
 for(let i=a+1;i<b;i++){let t=den?Math.max(0,Math.min(1,((points[i].x-p.x)*dx+(points[i].y-p.y)*dy)/den)):0;let xx=p.x+dx*t,yy=p.y+dy*t,dd=Math.hypot(points[i].x-xx,points[i].y-yy);if(dd>maxD){maxD=dd;idx=i;}}
 if(maxD>tolerance&&idx!==-1){keep[idx]=1;stack.push([a,idx],[idx,b]);}
 }return points.filter((_,i)=>keep[i]);}
function transformPoint(pt,w,h,s,importedMode=false){const a=s.angle*Math.PI/180,c=Math.cos(a),ss=Math.sin(a);let x=pt.x,y=pt.y; if(importedMode){x*=s.width/originalBounds.width;y*=s.width/originalBounds.width;}return {x:x*c-y*ss+s.offsetX,y:x*ss+y*c+s.offsetY};}
function fromWorld(x,y,s){let a=s.angle*Math.PI/180,c=Math.cos(a),ss=Math.sin(a),xx=x-s.offsetX,yy=y-s.offsetY;return {x:xx*c+yy*ss,y:-xx*ss+yy*c};}
function makePathsToEvents(paths,s,w,h,out){
 let last=null,owner=null;
 for(const path of paths){
  if(path.length<2)continue;
  const ownerId=path.ownerId??null;
  for(let i=0;i<path.length;i++){
   const p=path[i],q=transformPoint(p,w,h,s);
   const connected=last&&ownerId!==null&&owner===ownerId&&!path.forceJump&&dist(q,last)<.7;
   const type=i>0||connected?'stitch':'jump';
   out.push({...q,type,ownerId,role:path.role||null,
    travel:type==='stitch'?p.travel:undefined,jumpNeedsTrim:type==='jump'&&!!path.forceJump});
   last=q;owner=ownerId;
  }
 }
}
function manualToWorld(pt,w,h,s){return transformPoint({x:pt.u*w,y:pt.v*h},w,h,s);}
function generateFromRaster(s){if(!maskCanvas.width)throw new Error('No image loaded');
 let w=s.width,h=w*maskCanvas.height/maskCanvas.width;if(w>200||h>280)throw new Error('Design exceeds the 500E 200 × 280 mm embroidery area');
 let out=[],paths=smartPaths(s,w,h);
 makePathsToEvents(paths,s,w,h,out);
 for(const e of out)if(e.ownerId!==null&&e.ownerId!==undefined)e.orderKey='shape:'+e.ownerId;
 for(let i=0;i<manual.length;i++){const stroke=manual[i];if(stroke.length<2)continue;let points=stroke.map(p=>({x:p.u*w,y:p.v*h}));let densified=stitchManualPath(points,s.lineStyle,s.lineWidth,Math.min(2.5,s.length),s.linePatterns);let from=out.length;makePathsToEvents([densified],s,w,h,out);for(let n=from;n<out.length;n++)out[n].orderKey='manual:'+i;}
 appendJefOverlayEvents(out,s);appendTextEvents(out,s);return reorderStitchEvents(out);
}
function appendJefOverlayEvents(out,s){
 exportPalette=[palette[0]??1];let thread=exportPalette[0]+'|';
 for(const L of jefLayers){if(L.hidden)continue;let threadCode=L.threadCode??1,threadHex=L.threadHex||null,key=threadCode+'|'+(threadHex||'');
  if(key!==thread){out.push({type:'color',x:0,y:0});exportPalette.push(threadCode);thread=key;}
  for(const path of L.paths){if(path.length<2)continue;
   path.forEach((p,i)=>{const q=transformPoint(transformLayerPoint(p,L),0,0,s,false);out.push({type:i===0?'jump':'stitch',x:q.x,y:q.y,ownerId:L.id,orderKey:'jef:'+L.id,threadCode,threadHex,role:path.role||path[0].role,travel:i?p.travel:undefined,jumpNeedsTrim:!i&&!!L.fvSource,trimFromSource:!i&&p.trimFromSource});});
  }
 }
}
function generateFromImported(s){
 // Each imported stitch run is a separate editable part. Never stitch across a removed section.
 let out=[],lastColor=null;exportPalette=[];
 for(const layer of jefLayers){if(layer.hidden)continue;
  let col=layer.colorIndex||0;
  if(lastColor!==col){if(lastColor!==null)out.push({type:'color',x:0,y:0});exportPalette.push(palette[col]??1);lastColor=col;}
  for(const path of layer.paths){if(path.length<2)continue;
   for(let i=0;i<path.length;i++){
    const local=transformLayerPoint(path[i],layer);
    const q=transformPoint(local,0,0,{...s,angle:s.angle,offsetX:s.offsetX,offsetY:s.offsetY},true);
    out.push({x:q.x,y:q.y,type:i===0?'jump':'stitch',ownerId:layer.id,orderKey:'jef:'+layer.id,role:path.role||path[0].role,travel:i?path[i].travel:undefined,jumpNeedsTrim:!i&&!!layer.fvSource,trimFromSource:!i&&path[i].trimFromSource});
   }
  }
 }
 for(let i=0;i<manual.length;i++){const stroke=manual[i];if(stroke.length<2)continue;const hh=s.width*(originalBounds.height/Math.max(.01,originalBounds.width));let pts=stroke.map(p=>({x:p.u*s.width,y:p.v*hh}));let from=out.length;makePathsToEvents([stitchManualPath(pts,s.lineStyle,s.lineWidth,Math.min(2.5,s.length),s.linePatterns)],s,s.width,hh,out);for(let n=from;n<out.length;n++)out[n].orderKey='manual:'+i;}
 appendTextEvents(out,s);return reorderStitchEvents(out);
}


// Stitch order is applied to actual needle commands before simulation and JEF export.
// Each order item retains all its internal paths; color changes are rebuilt across items.
let stitchOrderKeys=[],stitchOrderItems=[],stitchAutoKeys=[];
function stitchOrderLabel(key){
 const [kind,id]=String(key).split(':');
 if(kind==='shape')return `Artwork shape ${id}`;
 if(kind==='jef'){const L=jefLayers.find(v=>String(v.id)===id);return L?.name||`Imported stitch part ${id}`;}
 if(kind==='text')return `Text: ${(textLayers[+id]?.content||'Lettering').slice(0,30)}`;
 if(kind==='manual')return `Drawn stitch line ${+id+1}`;
 return 'Stitch part';
}
function reorderStitchEvents(input){
 const groups=new Map(),sequence=[];
 let colorIdx=0;const oldPalette=exportPalette.length?exportPalette.slice():[palette[0]??1];
 for(let i=0;i<input.length;i++){
  const e=input[i];
  if(e.type==='color'){colorIdx++;continue;}
  const key=e.orderKey||('misc:'+i);
  let g=groups.get(key);
  if(!g){g={key,name:stitchOrderLabel(key),events:[],thread:e.threadCode??oldPalette[Math.min(colorIdx,oldPalette.length-1)]??1,hex:e.threadHex||null};groups.set(key,g);sequence.push(key);}
  g.events.push(e);
 }
 stitchAutoKeys=sequence.slice();
 const valid=new Set(sequence);
 stitchOrderKeys=[...stitchOrderKeys.filter(k=>valid.has(k)),...sequence.filter(k=>!stitchOrderKeys.includes(k))];
 const desired=stitchOrderKeys.slice(),output=[];let thread=null;const newPalette=[],newHexes=[];
 stitchOrderItems=[];
 for(const key of desired){
  const g=groups.get(key);if(!g)continue;
  // Two different vector colours can share the nearest Janome code; they still need a thread stop.
  const threadKey=g.thread+'|'+(g.hex||'');
  if(thread!==threadKey){if(thread!==null)output.push({type:'color',x:0,y:0});newPalette.push(g.thread);newHexes.push(g.hex);thread=threadKey;}
  const begin=output.length;
  let stage=null,stops=0;
  for(const event of g.events){
   const role=event.role?.startsWith('applique-')?event.role:null;
   if(stage&&role&&stage!==role){
    output.push({type:'color',x:0,y:0,role});newPalette.push(g.thread);newHexes.push(g.hex);stops++;
   }
   stage=role||stage;
   output.push(event);
  }
  stitchOrderItems.push({stops,key:g.key,name:g.name,stitches:g.events.filter(e=>e.type==='stitch').length,events:g.events.length,previewEvents:g.events,thread:g.thread,begin});
 }
 exportPalette=newPalette.length?newPalette:[palette[0]??1];exportThreadHexes=newPalette.length?newHexes:[];
 if(document.getElementById('order-list'))renderOrderList();
 return output;
}
function moveOrderKey(key,delta){const i=stitchOrderKeys.indexOf(key),j=i+delta;if(i<0||j<0||j>=stitchOrderKeys.length)return;[stitchOrderKeys[i],stitchOrderKeys[j]]=[stitchOrderKeys[j],stitchOrderKeys[i]];queueRebuild();}
function moveOrderKeyTo(key,target){const i=stitchOrderKeys.indexOf(key),j=stitchOrderKeys.indexOf(target);if(i<0||j<0||i===j)return;stitchOrderKeys.splice(i,1);stitchOrderKeys.splice(j,0,key);queueRebuild();}
function drawOrderThumbnail(canvas,points){
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 let previous=null;
 for(const point of points){
  if(point.type==='stitch'&&!point.travel){
   const start=previous||point;
   minX=Math.min(minX,start.x,point.x);minY=Math.min(minY,start.y,point.y);
   maxX=Math.max(maxX,start.x,point.x);maxY=Math.max(maxY,start.y,point.y);
  }
  previous=point;
 }
 if(!Number.isFinite(minX))return;
 const {width,height}=canvas;
 const scale=Math.min((width-14)/Math.max(.1,maxX-minX),(height-14)/Math.max(.1,maxY-minY));
 const ctx=canvas.getContext('2d');
 ctx.setTransform(scale,0,0,scale,width/2-scale*(minX+maxX)/2,height/2-scale*(minY+maxY)/2);
 ctx.strokeStyle='#e0eee4';ctx.lineWidth=1.65/scale;ctx.lineCap='round';ctx.lineJoin='round';
 ctx.beginPath();
 previous=null;
 let sewn=false;
 for(const point of points){
  if(point.type==='stitch'&&!point.travel&&previous){
   if(!sewn)ctx.moveTo(previous.x,previous.y);
   ctx.lineTo(point.x,point.y);
   sewn=true;
  }else sewn=false;
  previous=point;
 }
 ctx.stroke();
 canvas.dataset.drawn='true';
}
function orderThumbnail(part){
 if(!part.thumbnail){
  const canvas=document.createElement('canvas');
  canvas.width=96;canvas.height=72;canvas.className='order-thumbnail';
  canvas.setAttribute('aria-hidden','true');
  part.thumbnail=canvas;
 }
 const canvas=part.thumbnail;
 if(!canvas.dataset.drawn)drawStitchThumbnailWhenVisible(canvas,()=>drawOrderThumbnail(canvas,part.previewEvents));
 return canvas;
}
function renderOrderList(){
 const list=$('order-list');if(!list)return;
 detachStitchThumbnails(list);
 list.replaceChildren();
 const set=$('order-show-numbers');if(set){set.textContent=UI.showSequence.checked?'Hide order numbers':'Show order numbers';set.setAttribute('aria-pressed',String(UI.showSequence.checked));}
 const hoop=$('order-show-hoop');if(hoop)hoop.textContent='Hoop outline: '+(UI.showHoop.checked?'On':'Off');
 const jump=$('order-show-jumps');if(jump)jump.textContent='Travel paths: '+(UI.showJumps.checked?'On':'Off');
 if(!stitchOrderItems.length){list.innerHTML='<li class="order-empty">No embroidery parts available.</li>';return;}
 stitchOrderItems.forEach((part,i)=>{
  const li=document.createElement('li');li.className='order-item';li.draggable=true;li.dataset.orderKey=part.key;
  const no=document.createElement('span');no.className='order-index';no.textContent=String(i+1).padStart(2,'0');
  const detail=document.createElement('button');detail.type='button';detail.className='order-detail';
  detail.setAttribute('aria-label','Select '+part.name);
  detail.append(orderThumbnail(part));
  const caption=document.createElement('span');caption.className='fv-order-caption';
  detail.addEventListener('click',()=>selectOrderPart(part.key));
  const title=document.createElement('strong');title.textContent=part.name;
  const sub=document.createElement('small');sub.textContent=part.stitches.toLocaleString()+' stitches'+(part.stops?' · '+part.stops+' appliqué stops':'');caption.append(title,sub);detail.append(caption);
  const actions=document.createElement('div');actions.className='order-actions';
  const up=document.createElement('button');up.type='button';up.title='Sew earlier';up.setAttribute('aria-label','Move '+part.name+' earlier');up.textContent='↑';up.disabled=i===0;up.addEventListener('click',()=>moveOrderKey(part.key,-1));
  const down=document.createElement('button');down.type='button';down.title='Sew later';down.setAttribute('aria-label','Move '+part.name+' later');down.textContent='↓';down.disabled=i===stitchOrderItems.length-1;down.addEventListener('click',()=>moveOrderKey(part.key,1));
  actions.append(up,down);li.append(no,detail,actions);
  li.addEventListener('dragstart',e=>{li.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',part.key);});
  li.addEventListener('dragend',()=>li.classList.remove('dragging'));
  li.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';});
  li.addEventListener('drop',e=>{e.preventDefault();const from=e.dataTransfer.getData('text/plain');moveOrderKeyTo(from,part.key);});
  list.append(li);
 });
 syncOrderSelection();
 $('order-feedback').textContent=`${stitchOrderItems.length} editable parts · Changes affect JEF export and sew-out playback.`;
}
function bindStitchOrder(){
 $('order-show-numbers').addEventListener('click',()=>{UI.showSequence.checked=!UI.showSequence.checked;renderOrderList();render();});
 $('order-show-hoop').addEventListener('click',()=>{UI.showHoop.checked=!UI.showHoop.checked;renderOrderList();render();});
 $('order-show-jumps').addEventListener('click',()=>{UI.showJumps.checked=!UI.showJumps.checked;renderOrderList();render();});
 $('order-auto').addEventListener('click',()=>{stitchOrderKeys=stitchAutoKeys.slice();queueRebuild();});
 $('secure-runs').addEventListener('change',()=>queueRebuild());
 for(const id of ['fv27-cut-between-parts','fv27-trim-min-distance'])$(id).addEventListener('change',()=>{refreshTrimPreview();updateTravelAudit();render();});
}
function queueRebuild(){if(generationTimer)clearTimeout(generationTimer);setStatus('Preparing stitch plan…');generationTimer=setTimeout(rebuild,110);}
function trimOptions(){
 const enabled=$('fv27-cut-between-parts').checked;
 return {autoTrimBetweenParts:enabled,autoTrimExposedJumps:enabled,trimMinDistanceMm:Number($('fv27-trim-min-distance').value)||0};
}
function refreshTrimPreview(){
 const el=$('fv27-trim-count');if(!el)return;
 const opts=trimOptions(),count=JefCore.planTrims(events,opts).length;
 el.textContent=`${count} JEF cutting marker${count===1?'':'s'} planned`+(opts.autoTrimExposedJumps?' for qualifying jumps.': ' from the imported stitch data.');

}
function updateSequencePanel(){
 const panel=$('sequence-stats');if(!panel)return;
 const st=machineAssessment(events).stats;
 panel.innerHTML=`<strong>${sequenceStats.joined.toLocaleString()} stitched connections</strong> · ${sequenceStats.routeLength.toFixed(0)} mm of internal travel<br>`+
 `<strong>${st.internalJumps} within-shape jumps</strong> · ${st.externalJumps} between-shape/other jumps<br>`+
 `${st.jumpsAboveTrim} jumps would meet the selected auto-trim threshold · ${st.jumpLength.toFixed(0)} mm total jump travel`;
 refreshTrimPreview();
}

function reinforceDisjointRuns(src){
 // Add very short back-and-forth reinforcement stitches before/after jumps >=3mm.
 // Do not change imported machine files, which have their own authored stitch semantics.
 const ret=[];let previous=null;
 for(let i=0;i<src.length;i++){
  const e=src[i],next=src[i+1],after=src[i+2];
  if(e.type==='color'){ret.push(e);previous=null;continue;}
  ret.push(e);
  if(e.type==='stitch'&&next?.type==='jump'){
   const gap=Math.hypot(next.x-e.x,next.y-e.y);
   if(gap>=3&&previous?.type==='stitch'){
    const d=Math.hypot(e.x-previous.x,e.y-previous.y);
    if(d>=.5){const t=Math.min(.65,d*.35)/d;const a={...e,x:e.x-(e.x-previous.x)*t,y:e.y-(e.y-previous.y)*t,type:'stitch'};
     ret.push({...a,travel:undefined},{...e,type:'stitch',travel:undefined},{...a,travel:undefined},{...e,type:'stitch',travel:undefined});
    }
   }
  }
  if(e.type==='jump'&&previous?.type==='stitch'&&after?.type==='stitch'){
   const gap=Math.hypot(e.x-previous.x,e.y-previous.y),d=Math.hypot(after.x-e.x,after.y-e.y);
   if(gap>=3&&d>=.5){const t=Math.min(.65,d*.35)/d;
    const a={...e,x:e.x+(after.x-e.x)*t,y:e.y+(after.y-e.y)*t,type:'stitch'};
    ret.push({...a,travel:undefined},{...e,type:'stitch',travel:undefined},{...a,travel:undefined},{...e,type:'stitch',travel:undefined});
   }
  }
  previous=e;
 }
 return ret;
}
// v2.6: reversible, conservative cleanup of raster-generated needle movements.
// Keeps authored JEF/PES elements, text outlines, jump destinations, and stage transitions unchanged.
let optimizeActive=false,optimizePrevious=null,cleanupCount=0;
function thinRasterEvents(source){
 let cleaned=[],removed=0;
 for(let i=0;i<source.length;i++){
  const e=source[i],prev=cleaned.at(-1),next=source[i+1];
  const key=e.orderKey||'';
  if(e.type==='stitch'&&prev?.type==='stitch'&&next?.type==='stitch'&&key.startsWith('shape:')&&
      prev.orderKey===key&&next.orderKey===key&&!prev.role&&!e.role&&!next.role&&!prev.travel&&!e.travel&&!next.travel){
   const d=Math.hypot(e.x-prev.x,e.y-prev.y),bridge=Math.hypot(next.x-prev.x,next.y-prev.y);
   if(d<.25&&bridge<=3.2&&bridge>.35){
    const vx=next.x-prev.x,vy=next.y-prev.y;
    const t=((e.x-prev.x)*vx+(e.y-prev.y)*vy)/(bridge*bridge);
    const error=Math.hypot(e.x-(prev.x+t*vx),e.y-(prev.y+t*vy));
    if(t>=-.02&&t<=1.02&&error<=.09){removed++;continue;}
   }
  }
  cleaned.push(e);
 }
 cleanupCount=removed;
 return cleaned;
}
function optimizationReport(message,warning=false){const el=$('fv26-fix-report');if(!el)return;el.textContent=message;el.hidden=false;el.classList.toggle('warn',warning);}
function optimizationImproves(baseline,result){
 if(result.uncut>baseline.uncut||result.long>baseline.long||result.tooLong>baseline.tooLong
   ||result.maxStitch>Math.max(9,baseline.maxStitch)+0.001||result.cutCount>baseline.cutCount
   ||result.short>baseline.short||result.total>baseline.total+.5||result.sewLength>baseline.sewLength+.5)return false;
 return result.uncut<baseline.uncut||result.long<baseline.long||result.tooLong<baseline.tooLong||result.short<baseline.short
  ||result.cutCount<baseline.cutCount||result.total<baseline.total-.5;
}
function applyOptimization(){
 if(mode!=='image'){
  optimizationReport('This design was imported as machine stitch data. Automated path cleanup is disabled to preserve its authored JEF/PES order. Edit the source artwork or adjust stitch order manually.',true);return;
 }
 if(optimizeActive){optimizationReport('Optimization is already active. Review the audit and use Undo optimization to restore the prior plan.');return;}
 const baseline=makeTravelAudit();
 const backup={connect:$('seq-connect').checked,max:$('seq-max-link').value,order:$('seq-order').value};
 optimizePrevious=backup;
 $('seq-connect').checked=true;$('seq-max-link').value=Math.max(20,+backup.max||14);
 // Does not replace user-defined manual ordering (stitchOrderKeys), which remains independent.
 $('seq-order').value='nearest';updateNumbers();optimizeActive=true;
 rebuild();
 const result=makeTravelAudit();
 const better=optimizationImproves(baseline,result);
 if(!better){
  optimizeActive=false;optimizePrevious=null;
  $('seq-connect').checked=backup.connect;$('seq-max-link').value=backup.max;$('seq-order').value=backup.order;updateNumbers();rebuild();
  $('fv26-revert-plan').hidden=true;
  optimizationReport(`No safe automatic improvement found. ${baseline.long} jumps ≥3 mm remain, including travel between disconnected parts. Confirm machine automatic jump trimming and inspect the stitch-out.`,true);return;
 }
 $('fv26-revert-plan').hidden=false;
 optimizationReport(`Applied to raster-generated stitches. Short movements: ${baseline.short} → ${result.short}. Jumps ≥3 mm: ${baseline.long} → ${result.long}. Jump travel: ${baseline.total.toFixed(0)} → ${result.total.toFixed(0)} mm. ${cleanupCount} redundant short stitch points removed. ${result.long} long jumps remain; machine auto-trimming and a physical sew-out are still required.`);
}
function undoOptimization(){
 if(!optimizeActive)return;
 optimizeActive=false;
 const prior=optimizePrevious;optimizePrevious=null;
 if(prior){$('seq-connect').checked=prior.connect;$('seq-max-link').value=prior.max;$('seq-order').value=prior.order;}
 updateNumbers();rebuild();$('fv26-revert-plan').hidden=true;
 optimizationReport('Optimization reverted. Original routing settings and unthinned stitch instructions have been restored.');
}
$('fv26-optimize-plan')?.addEventListener('click',applyOptimization);
$('fv26-revert-plan')?.addEventListener('click',undoOptimization);

let travelAudit=null;
function makeTravelAudit(){
 let prev=null,short=0,tooLong=0,maxStitch=0,sewLength=0;
 const sewn=[],counts={stitch:0,jump:0},threshold=Number($('seq-trim').value);
 for(let i=0;i<events.length;i++){
  const e=events[i];
  if(e.type==='color'){prev=null;continue;}
  if(e.type==='jump')counts.jump++;
  if(e.type==='stitch'){
   counts.stitch++;
   if(prev){
    const d=dist(prev,e);
    if(d<.25)short++;
    if(d>9)tooLong++;
    maxStitch=Math.max(maxStitch,d);
    if(e.travel&&d>.005){sewn.push({from:prev,to:e,index:i,inside:e.travel});sewLength+=d;}
   }
  }
  prev=e;
 }
 const cuts=new Set(JefCore.planTrims(events,trimOptions())),jumps=JefCore.jumpRuns(events).map(j=>({...j,cut:cuts.has(j.start)}));
 const total=jumps.reduce((sum,j)=>sum+j.distance,0),long=jumps.filter(j=>j.distance>=3).length;
 const max=jumps.reduce((d,j)=>Math.max(d,j.distance),0),above=threshold>0?jumps.filter(j=>j.distance>=threshold).length:0;
 const uncut=jumps.filter(j=>!j.cut&&j.distance>=3).length;
 const longest=jumps.filter(j=>j.distance>=3).sort((a,b)=>b.distance-a.distance).slice(0,10)
  .map(j=>({d:j.distance,x0:j.from.x,y0:j.from.y,x1:j.to.x,y1:j.to.y,cut:j.cut}));
 return {threshold,total,long,max,above,short,tooLong,maxStitch,longest,counts,uncut,cutCount:cuts.size,sewn,sewLength,jumps};
}
function updateTravelAudit(){
 const x=travelAudit=makeTravelAudit(),panel=$('travel-audit');
 syncPartReview();
 if(!panel)return;
 panel.classList.toggle('warn',x.uncut>0||x.tooLong>0);
 const meetsThreshold=x.threshold>0?`${x.above} meet the ${x.threshold} mm machine-trim assumption`:'Machine auto-trim assumption off';
 const unmarked=x.jumps.filter(jump=>!jump.cut).length;
 panel.innerHTML=`<strong>Stitch-travel audit</strong><br>${x.jumps.length} travel runs (${events.filter(event=>event.type==='jump').length} jump events) · ${meetsThreshold}.<br>`+
  `${x.cutCount} planned JEF trim markers · ${unmarked} unmarked runs (${x.uncut} of 3 mm or more) · ${x.sewLength.toFixed(1)} mm sewn travel.<br>`+
  '<small>JEF markers are written at eligible travel runs. Unmarked travel may still trim depending on your machine settings. In Stitches, turn on Travel paths to see blue sewn travel, green marked jumps and amber unmarked jumps.</small>'+
  (x.short>20?`<p class="fv24-stitch-warning">${x.short} movements under 0.25 mm. Inspect dense intersections to prevent thread buildup.</p>`:'')+
  (x.tooLong?`<p class="fv24-stitch-warning">${x.tooLong} sewing movements over 9 mm. Inspect wide satin and gaps.</p>`:'')+
  (x.longest.length?`<details class="fv24-longest"><summary>Inspect ${Math.min(5,x.longest.length)} longest jump paths</summary><ol>${x.longest.slice(0,5).map(q=>`<li>${q.d.toFixed(1)} mm · ${q.cut?'Cut marked':'Unmarked'} · (${q.x0.toFixed(1)}, ${q.y0.toFixed(1)}) to (${q.x1.toFixed(1)}, ${q.y1.toFixed(1)}) mm</li>`).join('')}</ol></details>`:'');
}
function drawTravelPaths(xy,before){
 if(!travelAudit)return;
 ctx.save();ctx.lineWidth=1.5;
 for(const seg of travelAudit.sewn){
  if(seg.index>=before)break;
  const a=xy(seg.from.x,seg.from.y),b=xy(seg.to.x,seg.to.y);
  ctx.strokeStyle='#2585e8';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
 }
 ctx.setLineDash([4,4]);
 for(const trip of travelAudit.jumps){
  if(trip.start>=before)break;
  const to=events[Math.min(trip.end,before-1)],a=xy(trip.from.x,trip.from.y),b=xy(to.x,to.y);
  ctx.strokeStyle=trip.cut?'#29a167':'#e09a2c';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
 }
 ctx.restore();
}
function downloadTravelAudit(){
 const x=makeTravelAudit(),b=calcBounds(events),dims=PHYSICAL_HOOPS[selectedMachineHoop]||PHYSICAL_HOOPS.RE20b;
 const report=[
 'FERVOR STITCH LAB · STITCH-TRAVEL PREFLIGHT','Generated: '+new Date().toISOString(),
 'Design: '+(sourceName||'Untitled'),'Machine: Janome MC500E LE','Hoop: '+selectedMachineHoop+' ('+dims.join(' x ')+' mm)',
 'Design: '+b.w.toFixed(1)+' x '+b.h.toFixed(1)+' mm',
 'Sewing stitches: '+x.counts.stitch,'Jump commands: '+x.counts.jump,'Jumps >=3 mm: '+x.long,
 'Travel distance: '+x.total.toFixed(1)+' mm','Longest jump: '+x.max.toFixed(1)+' mm',
 'Jumps meeting selected '+x.threshold+' mm assumed threshold: '+x.above,
 'Sewing movements <0.25 mm: '+x.short,'Sewing movements >9 mm: '+x.tooLong,
 'Longest jumps (millimeters, centered hoop coordinates):',
 ...x.longest.map((j,i)=>(i+1)+'. '+j.d.toFixed(1)+' mm | ('+j.x0.toFixed(1)+','+j.y0.toFixed(1)+') -> ('+j.x1.toFixed(1)+','+j.y1.toFixed(1)+')'),
 '', 'PRE-FLIGHT (manual checks, not machine verification):',
 '[ ] Machine hoop matches selected hoop; use Trace without stitching (Janome 500E LE manual p.28)',
 '[ ] Stabilizer/needle/thread suit material (manual pp.13,17)',
 '[ ] Embroidery settings -> Thread cutting: choose Easy ON (>=3 mm) or Advanced threshold (manual p.53)',
 '[ ] Test on stabilized scrap. Inspect reverse side for tails and tangled thread.',
 'EXPLICIT JEF CUTS: '+x.cutCount+' planned. Verify the cutting-command setting on the machine.',
 'UNMARKED JUMPS >=3 mm: '+x.uncut, 'SEWN EDGE OR UNDERLAY TRAVEL: '+x.sewLength.toFixed(1)+' mm',
 'Easy automatic jump trims are separate and depend on the machine setting.',
 'This software audit is not a physical stitch-out or third-party JEF compatibility test.'
 ];
 download(report.join('\n'),filename('txt').replace('_STITCH_LAB.','_PREFLIGHT.'),'text/plain;charset=utf-8');
}
$('fv24-download-audit')?.addEventListener('click',downloadTravelAudit);

function rebuild(){generationTimer=null;
 queueMicrotask(()=>{if(events.some(e=>e.type==='stitch'))document.body.classList.remove('fv18-empty');});
 let resized=false;if(!resizer&&!dragLayer)for(const L of jefLayers)if(L.fvSource&&(Math.abs((L.scaleX??1)-1)>1e-6||Math.abs((L.scaleY??1)-1)>1e-6||(L.fvSource.physical&&L.fvPhysicalScale!==nomuLayerScale())))resized=fvRegenerateLayer(L)||resized;if(resized&&['layers','stitches'].includes(currentTab))refreshLayerList();satinColumns=0;satinSplits=0;let s=getSettings();try{events=mode==='image'?generateFromRaster(s):generateFromImported(s);if(mode==='image'&&optimizeActive)events=thinRasterEvents(events);else cleanupCount=0;if(mode==='image'&&$('secure-runs').checked)events=reinforceDisjointRuns(events);if(events.filter(e=>e.type==='stitch').length===0){alertMessage('No active stitches. Show a layer or add artwork to continue.',true);}
  const stitched=events.filter(e=>e.type==='stitch');let stitches=stitched.length,jumps=events.filter(e=>e.type==='jump').length;const b=calcBounds(events);lastStats={stitches,jumps,w:b.w,h:b.h};
  resetSimulationForRebuild();updateSequencePanel();updateTravelAudit();scheduleRecentSave();$('stitch-count').textContent=stitches.toLocaleString();$('jump-count').textContent=jumps.toLocaleString();if($('working-file-name'))$('working-file-name').textContent='FILE / '+String(sourceName||'UNTITLED').slice(0,32);if($('workspace-source'))$('workspace-source').textContent=String(sourceName||'Untitled')+' · Adjust sizing and stitches, then export a JEF file.';const sewn=calcBounds(stitched),extent=stitches?sewn.w.toFixed(1)+' × '+sewn.h.toFixed(1)+' mm':'—';
  $('design-size').textContent=extent;$('stitched-area-detail').textContent=extent;vectorSizeSummary();
  if(stitches>120000)alertMessage('High stitch count. Increase fill spacing before exporting.',true);
  else dismissMessage();if(stitches)setStatus('Stitch plan ready','success');else setStatus('Blank canvas · drop artwork to begin','neutral');
 const capWidth=100,capHeight=50;
 const warn=garment==='cap'&&(b.w>capWidth||b.h>capHeight);
 $('fit-message').textContent=warn?`Exceeds suggested 100 × 50 mm flat cap-front design area; verify your specific cap hoop.`:`${garment==='cap'?'Cap':'Garment'} preset · ${new Set(stitched.map(event=>event.orderKey)).size} stitched parts · ${extent}${satinColumns?' · '+satinColumns+' satin columns'+(satinSplits?' across '+satinSplits+' wide split sections':''):''}`; 
 $('fit-message').classList.toggle('fit-warning',warn);updateMachinePanel();render();
  if(fitOnNextRebuild){fitOnNextRebuild=false;requestAnimationFrame(()=>{
  // An empty canvas shows the whole hoop; a design is framed to its own extent.
  if(document.body.classList.contains('fv18-empty'))window.FervorZoom?.fitHoop?.();else window.FervorZoom?.fitDesign?.();});}
 }catch(e){events=[];lastStats=null;travelAudit=null;resetSimulationForRebuild();setStatus('Attention needed','error');alertMessage(e.message,true);updateMachinePanel();render();}}
function calcBounds(list){let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity;for(let ev of list){if(ev.type==='color')continue;minx=Math.min(minx,ev.x);maxx=Math.max(maxx,ev.x);miny=Math.min(miny,ev.y);maxy=Math.max(maxy,ev.y);}if(!Number.isFinite(minx))return {minx:-40,maxx:40,miny:-15,maxy:15,w:80,h:30};return {minx,maxx,miny,maxy,w:maxx-minx,h:maxy-miny};}

function hexToRgb(hex){return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];}
function tone(rgb,factor){return `rgb(${rgb.map(x=>Math.max(0,Math.min(255,Math.round(x*factor)))).join(',')})`;}
/* ---------- Realistic sew-out renderer ----------
   Fabric is drawn in millimetres, so the weave scales with zoom and moves with the design.
   Each stitch is a shaded, twisted thread sprite. Its sheen depends on the stitch direction
   relative to a fixed top-left light, as with real polyester and rayon thread. A blurred shadow
   layer seats the threads on the cloth. Short jumps the machine will not trim (below the
   jump-cut length, 3 mm by default on the 500E) are drawn as loose connecting threads. */
const FABRIC_WEAVES={'structured-cap':{kind:'twill',pitch:.3},woven:{kind:'plain',pitch:.28},knit:{kind:'knit',pitch:.55},fleece:{kind:'fleece',pitch:.5}};
const LIGHT_ANGLE=-Math.PI*.75;
let fabricTileCache=new Map();
function fabricTile(rgb,kind,px){
 const key=rgb.join(',')+'|'+kind+'|'+px.toFixed(2);if(fabricTileCache.has(key))return fabricTileCache.get(key);
 if(fabricTileCache.size>24)fabricTileCache.clear();
 const n=kind==='twill'?6:kind==='knit'?4:kind==='fleece'?1:6,size=Math.max(4,Math.round(px*n*(kind==='fleece'?24:1)));
 const t=document.createElement('canvas');t.width=size;t.height=size;const g=t.getContext('2d'),cell=size/(kind==='fleece'?24:n);
 g.fillStyle=tone(rgb,.86);g.fillRect(0,0,size,size);
 let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 if(kind==='fleece'){for(let i=0;i<size*size/9;i++){const x=rnd()*size,y=rnd()*size,r=.6+rnd()*cell*.5;g.fillStyle=rnd()>.5?`rgba(255,255,255,${.04+rnd()*.07})`:`rgba(0,0,0,${.03+rnd()*.06})`;g.beginPath();g.arc(x,y,r,0,7);g.fill();}}
 else if(kind==='knit'){
  // Stockinette: columns of V-shaped loops.
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const x=i*cell,y=j*cell;for(const side of [0,1]){const gr=g.createLinearGradient(x,y,x+cell,y+cell);gr.addColorStop(0,tone(rgb,1.08));gr.addColorStop(1,tone(rgb,.8));g.fillStyle=gr;g.beginPath();g.ellipse(x+cell*(side?.68:.32),y+cell*.5,cell*.24,cell*.46,(side?-1:1)*.42,0,7);g.fill();}}
 }else{
  // Plain weave or 2/1 twill: each crossing is a short shaded yarn float.
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const over=kind==='twill'?((i+j)%3)!==0:((i+j)%2)===0,x=i*cell,y=j*cell,v=.94+rnd()*.12;
   const gr=over?g.createLinearGradient(x,y,x,y+cell):g.createLinearGradient(x,y,x+cell,y);
   gr.addColorStop(0,tone(rgb,.86*v));gr.addColorStop(.45,tone(rgb,(over?1.06:1.0)*v));gr.addColorStop(1,tone(rgb,.84*v));g.fillStyle=gr;
   const inset=cell*.06;if(over)g.fillRect(x,y+inset,cell,cell-2*inset);else g.fillRect(x+inset,y,cell-2*inset,cell);}
  // Fibre noise breaks up the regular grid.
  for(let k=0;k<size*size/14;k++){g.fillStyle=rnd()>.5?'rgba(255,255,255,.05)':'rgba(0,0,0,.05)';g.fillRect(rnd()*size,rnd()*size,1+rnd()*cell*.6,.6);}
 }
 fabricTileCache.set(key,t);return t;}
function drawFabric(W,H,scale){
 const rgb=FABRIC_SWATCHES[previewFabric]||FABRIC_SWATCHES.linen,weave=FABRIC_WEAVES[$('fabric-type')?.value]||FABRIC_WEAVES.woven;
 ctx.fillStyle=`rgb(${rgb.join(',')})`;ctx.fillRect(0,0,W,H);
 const px=weave.pitch*scale;
 if(px>=1.6){const tile=fabricTile(rgb,weave.kind,px),pat=ctx.createPattern(tile,'repeat'),n=weave.kind==='twill'?6:weave.kind==='knit'?4:weave.kind==='fleece'?24:6;
  // Anchor the weave to the design origin so the cloth moves with the embroidery.
  if(pat.setTransform)pat.setTransform(new DOMMatrix().translate(display.cx,display.cy).scale(px*n/tile.width));
  ctx.save();ctx.globalAlpha=Math.min(.7,.3+px/14);ctx.fillStyle=pat;ctx.fillRect(0,0,W,H);ctx.restore();}
 const light=ctx.createLinearGradient(0,0,W,H);light.addColorStop(0,'rgba(255,255,255,.12)');light.addColorStop(.55,'rgba(255,255,255,0)');light.addColorStop(1,'rgba(0,0,0,.12)');ctx.fillStyle=light;ctx.fillRect(0,0,W,H);
 const vignette=ctx.createRadialGradient(W*.5,H*.45,Math.min(W,H)*.25,W*.5,H*.45,Math.max(W,H)*.75);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.14)');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);}
// Kept for callers that still ask for a fabric canvas (e.g. PNG export of older code paths).
function wovenFabric(W,H){const c=document.createElement('canvas');c.width=W;c.height=H;return c;}
const SPRITE_L=64,SPRITE_BUCKETS=12;let spriteCache=new Map();
function threadSprite(rgb,bucket,variant,res){
 const key=rgb.join(',')+'|'+bucket+'|'+variant+'|'+res;let sp=spriteCache.get(key);if(sp)return sp;
 if(spriteCache.size>900)spriteCache.clear();
 const L=SPRITE_L,Wd=res,c=document.createElement('canvas');c.width=L;c.height=Wd;const g=c.getContext('2d');
 // Sheen: brightest when the thread runs perpendicular to the light direction.
 const theta=bucket/SPRITE_BUCKETS*Math.PI,sheen=Math.sin(theta-LIGHT_ANGLE)**2,vary=[.97,1,1.035][variant];
 const lum=(.299*rgb[0]+.587*rgb[1]+.114*rgb[2])/255,spec=(.22+.5*sheen)*(1-lum*.55);
 g.save();g.beginPath();g.roundRect?g.roundRect(0,0,L,Wd,Wd/2):g.rect(0,0,L,Wd);g.clip();
 const body=g.createLinearGradient(0,0,0,Wd);
 body.addColorStop(0,tone(rgb,.52*vary));body.addColorStop(.2,tone(rgb,(.82+.12*sheen)*vary));body.addColorStop(.42,tone(rgb,(1.02+.2*sheen)*vary));
 body.addColorStop(.62,tone(rgb,(.9+.06*sheen)*vary));body.addColorStop(.86,tone(rgb,.66*vary));body.addColorStop(1,tone(rgb,.46*vary));
 g.fillStyle=body;g.fillRect(0,0,L,Wd);
 // Plied twist: slanted fibre grooves and highlights along the thread.
 const step=Math.max(3,Wd*.85),phase=variant*step/3;g.lineWidth=Math.max(.6,Wd*.08);
 for(let x=-Wd-phase;x<L+Wd;x+=step){g.strokeStyle='rgba(0,0,0,.16)';g.beginPath();g.moveTo(x,Wd);g.lineTo(x+Wd*.75,0);g.stroke();g.strokeStyle=`rgba(255,255,255,${.05+.1*sheen})`;g.beginPath();g.moveTo(x+step*.45,Wd);g.lineTo(x+step*.45+Wd*.75,0);g.stroke();}
 // Specular stripe on the lit side.
 const hi=g.createLinearGradient(0,Wd*.22,0,Wd*.5);hi.addColorStop(0,'rgba(255,255,255,0)');hi.addColorStop(.5,`rgba(255,255,255,${spec})`);hi.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=hi;g.fillRect(0,Wd*.22,L,Wd*.28);
 // Thread ends dive into the fabric: darker and narrower at the needle points.
 const ends=g.createLinearGradient(0,0,L,0);ends.addColorStop(0,'rgba(0,0,0,.42)');ends.addColorStop(.12,'rgba(0,0,0,0)');ends.addColorStop(.88,'rgba(0,0,0,0)');ends.addColorStop(1,'rgba(0,0,0,.42)');g.fillStyle=ends;g.fillRect(0,0,L,Wd);
 g.restore();spriteCache.set(key,c);return c;}
let threadCache={key:'',events:null,count:0,layer:null,shadow:null,ox:0,oy:0,map:null};
function threadLuminance(rgb){return .299*rgb[0]+.587*rgb[1]+.114*rgb[2];}
function threadLighting(rgb,darkGrid){
 // Adapt low-contrast thread colors in the grid preview only.
 const luminance=threadLuminance(rgb);
 if(darkGrid){
  if(luminance>=148)return rgb;
  const lift=(148-luminance)/(255-luminance);
  return rgb.map(channel=>Math.round(channel+(255-channel)*lift));
 }
 if(luminance<=208)return rgb;
 return rgb.map(channel=>Math.round(channel*208/luminance));
}
function embroideryThread(block){
 return exportThreadHexes[block]||JefCore.threadHex?.(exportPalette[block]??palette[block]??1)||'#222321';
}
function previewThreadHex(block,darkGrid){
 if(previewMode==='realistic')return embroideryThread(block);
 return THREAD_SWATCHES[previewThread]||THREAD_SWATCHES[darkGrid?'white':'charcoal'];
}
function realisticThreads(xy,renderCount,scale,darkGrid=false){
 const W=canvas.width,H=canvas.height,b=calcBounds(events),w=Math.max(1.1,Math.min(56,previewThickness*1.45*scale)),pad=Math.ceil(w*3+6);
 let lw=Math.ceil(b.w*scale)+pad*2,lh=Math.ceil(b.h*scale)+pad*2;const local=lw<=4200&&lh<=4200&&lw*lh<=12e6;
 if(!local){lw=W;lh=H;}
 const trimAt=Math.max(0,num('seq-trim')||3),hexes=exportThreadHexes.join(',')+'|'+exportPalette.join(','),fabricRgb=FABRIC_SWATCHES[previewFabric]||FABRIC_SWATCHES.linen;
 const fabricDark=previewMode==='realistic'&&threadLuminance(fabricRgb)<90;
 const key=[scale.toFixed(4),w.toFixed(2),previewThread,hexes,trimAt,previewMode,darkGrid,fabricDark,local?'L':display.cx.toFixed(1)+','+display.cy.toFixed(1),lw,lh].join('|');
 let cache=threadCache;
 const reuse=cache.events===events&&cache.key===key&&cache.layer&&renderCount>=cache.count;
 if(!reuse){const layer=document.createElement('canvas'),shadow=document.createElement('canvas');layer.width=shadow.width=lw;layer.height=shadow.height=lh;
  const ox=local?b.minx*scale-pad:0,oy=local?b.miny*scale-pad:0;
  const map=local?(x,y)=>({x:x*scale-ox,y:y*scale-oy}):(x,y)=>xy(x,y);
  cache=threadCache={key,events,count:0,layer,shadow,ox,oy,map};}
 if(renderCount>cache.count){
  const c=cache.layer.getContext('2d'),sh=cache.shadow.getContext('2d'),map=cache.map;
  const blockColor=block=>{
   const rgb=hexToRgb(previewThreadHex(block,darkGrid));
   return previewMode==='thread'&&previewThread==='auto'?threadLighting(rgb,darkGrid):rgb;
  };
  const res=w<=6?12:w<=14?24:w<=28?40:64;let block=0;for(let i=0;i<cache.count;i++)if(events[i].type==='color')block++;
  let rgb=blockColor(block),prior=null;
  for(let i=cache.count-1;i>=0;i--){const e=events[i];if(e.type==='color')break;if(e.type==='stitch'||e.type==='jump'){prior=e;break;}}
  sh.lineCap='round';sh.strokeStyle=fabricDark?'rgba(0,0,0,.75)':previewMode==='thread'?'rgba(0,0,0,.45)':'rgba(20,14,6,.55)';sh.lineWidth=w*1.15;sh.beginPath();
  for(let i=cache.count;i<renderCount;i++){const e=events[i];
   if(e.type==='color'){block++;rgb=blockColor(block);prior=null;continue;}
   if(!prior){prior=e;continue;}
   const dmm=Math.hypot(e.x-prior.x,e.y-prior.y);
   if(e.type==='jump'&&dmm>=trimAt&&trimAt>0){prior=e;continue;}
   const a=map(prior.x,prior.y),q=map(e.x,e.y),dx=q.x-a.x,dy=q.y-a.y,len=Math.hypot(dx,dy);prior=e;
   if(len<.05)continue;
   const loose=e.type==='jump',tw=loose?Math.max(.8,w*.55):w*(.94+((i*2654435761>>>0)%7)/70),ux=dx/len,uy=dy/len;
   // Shadow first, offset down-right (away from the light).
   sh.moveTo(a.x+w*.35,a.y+w*.5);sh.lineTo(q.x+w*.35,q.y+w*.5);
   let ang=Math.atan2(dy,dx);if(ang<0)ang+=Math.PI;const bucket=Math.round(ang/Math.PI*SPRITE_BUCKETS)%SPRITE_BUCKETS,variant=(i*7919)%3;
   const sp=threadSprite(rgb,bucket,variant,res),ext=Math.min(tw*.42,len*.5),L=len+ext*2;
   c.setTransform(ux*L/SPRITE_L,uy*L/SPRITE_L,-uy*tw/sp.height,ux*tw/sp.height,a.x-ux*ext,a.y-uy*ext);
   c.globalAlpha=loose?.85:1;c.drawImage(sp,0,-sp.height/2);
  }
  c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;sh.stroke();cache.count=renderCount;
 }
 // A local layer is anchored to the design, so panning only moves where it is drawn.
 const dx=local?display.cx+cache.ox:0,dy=local?display.cy+cache.oy:0;
 ctx.save();ctx.globalAlpha=fabricDark?.7:.5;ctx.filter=`blur(${Math.max(.6,w*.45).toFixed(1)}px)`;ctx.drawImage(cache.shadow,dx,dy);ctx.restore();
 ctx.drawImage(cache.layer,dx,dy);
}
function syncViewButtons(){
 stitchPreview=previewMode!=='artwork';
 document.querySelectorAll('#stitch-lab .view-switch [data-view]').forEach(b=>{
  b.setAttribute('aria-pressed',String(b.dataset.view===previewMode));
 });
 $('preview-fabric-field').hidden=previewMode!=='realistic';
 $('preview-thread-field').hidden=previewMode!=='thread';
 $('preview-original-field').hidden=previewMode!=='thread';
 $('preview-original').disabled=!sourceImage;
 $('preview-caption').textContent=STITCH_PREVIEW_LABELS[previewMode];
 render();
}
function downloadPreviewPng(){cleanCapture=true;render();canvas.toBlob(blob=>{cleanCapture=false;render();if(blob)download(blob,filename('png'),'image/png');else alertMessage('Could not generate preview PNG.',true);},'image/png');}

function sequenceOverlayEntries(){
 const entries=[],seen=new Set();
 for(const e of events){
  if(e.type==='color'||e.ownerId===null||e.ownerId===undefined)continue;
  const key=e.orderKey||String(e.ownerId);
  if(seen.has(key))continue;
  seen.add(key);
  entries.push({index:entries.length+1,x:e.x,y:e.y});
 }
 return entries;
}
function drawHoopOverlay(xy,scale){
 const dims=PHYSICAL_HOOPS[selectedMachineHoop]||PHYSICAL_HOOPS.RE20b;
 const left=display.cx-dims[0]*scale/2,top=display.cy-dims[1]*scale/2,w=dims[0]*scale,h=dims[1]*scale;
 ctx.save();
 ctx.setLineDash(previewMode==='realistic'?[10,6]:[8,5]);
 ctx.lineWidth=previewMode==='realistic'?2.2:1.5;
 ctx.strokeStyle=previewMode==='realistic'?'rgba(18,194,99,.95)':(document.body.classList.contains('fv-theme-dark')?'rgba(255,255,255,.86)':'#12c263');
 ctx.strokeRect(left,top,w,h);
 const tag=`${selectedMachineHoop} · ${dims[0]} × ${dims[1]} mm`;
 ctx.font='bold 12px Calibri, Arial, sans-serif';
 const pad=7,tw=ctx.measureText(tag).width+pad*2,th=22;
 const tx=Math.max(8,Math.min(left,w+left-tw));
 // Keep the label clear of the floating controls over the canvas.
 const cr=canvas.getBoundingClientRect(),k=cr.width?canvas.width/cr.width:1;let clear=54;
 for(const ov of document.querySelectorAll('#stitch-lab .sl-ov-tl,#stitch-lab .sl-ov-tr')){const o=ov.getBoundingClientRect();if(!o.height)continue;const x0=(o.left-cr.left)*k,x1=(o.right-cr.left)*k;if(x1>tx&&x0<tx+tw)clear=Math.max(clear,(o.bottom-cr.top)*k+6);}
 const ty=Math.max(clear,top-th-6);
 ctx.fillStyle='rgba(0,0,0,.76)';
 ctx.fillRect(tx,ty,tw,th);
 ctx.strokeStyle=document.body.classList.contains('fv-theme-dark')&&previewMode!=='realistic'?'rgba(255,255,255,.88)':'rgba(18,194,99,.9)';
 ctx.setLineDash([]);ctx.lineWidth=1;ctx.strokeRect(tx+.5,ty+.5,tw-1,th-1);
 ctx.fillStyle='#f4fff7';
 ctx.fillText(tag,tx+pad,ty+15);
 ctx.restore();
}
function drawSequenceOverlay(xy){
 const entries=sequenceOverlayEntries();
 if(!entries.length)return;
 ctx.save();
 ctx.font='bold 12px Calibri, Arial, sans-serif';
 ctx.textAlign='center';ctx.textBaseline='middle';
 for(const item of entries){
  const p=xy(item.x,item.y),r=11;
  ctx.fillStyle='rgba(0,0,0,.80)';ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='rgba(255,70,70,.95)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#fff';ctx.fillText(String(item.index),p.x,p.y+0.5);
 }
 const legend='Embroidery order';
 const pad=8,lh=24,lw=ctx.measureText(legend).width+pad*2;
 ctx.fillStyle='rgba(0,0,0,.76)';ctx.fillRect(14,14,lw,lh);
 ctx.strokeStyle='rgba(255,70,70,.95)';ctx.lineWidth=1;ctx.strokeRect(14.5,14.5,lw-1,lh-1);
 ctx.fillStyle='#fff';ctx.textAlign='left';ctx.fillText(legend,14+pad,26);
 ctx.restore();
}

function render(){let W=canvas.width,H=canvas.height,s=getSettings();const fvDarkCanvas=document.body.classList.contains('fv-theme-dark')&&previewMode!=='realistic';ctx.clearRect(0,0,W,H);if(previewMode!=='realistic'){ctx.fillStyle=fvDarkCanvas?(document.body.classList.contains('fv-theme-art')?getComputedStyle(canvas).getPropertyValue('--sl-paper').trim()||'#1c1714':'#090909'):'#fff';ctx.fillRect(0,0,W,H);}
 let b=calcBounds(events),visualWidth=mode==='image'?s.width:Math.max(1,s.width),visualHeight=mode==='image'?s.width*(maskCanvas.height/Math.max(maskCanvas.width,1)):s.width*(originalBounds.height/Math.max(originalBounds.width,1));
 let extent=Math.max(Math.max(b.w,visualWidth),48),eHeight=Math.max(Math.max(b.h,visualHeight),24);
 let scale=Math.min((W-75)/Math.max(extent+12,90),(H-75)/Math.max(eHeight+12,55))*viewZoom;display={scale,cx:W/2+viewPan.x,cy:H/2+viewPan.y};window.FervorCanvasMetrics={scale,cx:display.cx,cy:display.cy,canvasWidth:W,canvasHeight:H};window.dispatchEvent(new Event('fervor:canvas-painted'));
 const xy=(x,y)=>({x:display.cx+x*scale,y:display.cy+y*scale});
 if(previewMode==='realistic')drawFabric(W,H,scale);
 // The drafting grid follows the design scale in all fabric-free views.
 if(previewMode!=='realistic'){ctx.save();ctx.strokeStyle=fvDarkCanvas?'rgba(255,255,255,.15)':'#ededed';ctx.lineWidth=1;
 const gridStep=Math.max(10,Math.ceil(9/Math.max(.01,scale)/10)*10);for(let x=Math.floor((0-display.cx)/scale/gridStep)*gridStep;x<=Math.ceil((W-display.cx)/scale/gridStep)*gridStep;x+=gridStep){let x0=xy(x,0).x;ctx.beginPath();ctx.moveTo(x0,0);ctx.lineTo(x0,H);ctx.stroke();}
 for(let y=Math.floor((0-display.cy)/scale/gridStep)*gridStep;y<=Math.ceil((H-display.cy)/scale/gridStep)*gridStep;y+=gridStep){let y0=xy(0,y).y;ctx.beginPath();ctx.moveTo(0,y0);ctx.lineTo(W,y0);ctx.stroke();}
 // Center axes
 ctx.strokeStyle=fvDarkCanvas?'rgba(255,255,255,.36)':'#cccccc';let o=xy(0,0);ctx.beginPath();ctx.moveTo(o.x-11,o.y);ctx.lineTo(o.x+11,o.y);ctx.moveTo(o.x,o.y-11);ctx.lineTo(o.x,o.y+11);ctx.stroke();ctx.restore();}
 if(mode==='image'){
  const showOriginal=previewMode==='thread'&&previewOriginal;
  const image=showOriginal?sourceImage:previewMode!=='realistic'&&s.showArt&&maskCanvas.width?maskCanvas:null;
  if(image){ctx.save();ctx.translate(display.cx+s.offsetX*scale,display.cy+s.offsetY*scale);ctx.rotate(s.angle*Math.PI/180);
   ctx.globalAlpha=showOriginal?.38:previewMode==='thread'?.10:stitchPreview?.20:.96;
   ctx.filter=!showOriginal&&fvDarkCanvas?'invert(1)':'none';
   ctx.drawImage(image,-visualWidth*scale/2,-visualHeight*scale/2,visualWidth*scale,visualHeight*scale);ctx.restore();}
 }
 if(previewMode!=='realistic'&&mode==='image'&&selectedObject>0&&componentMap&&objects[selectedObject-1]){
 const obj=objects[selectedObject-1],bb=obj.bb;
 ctx.save();ctx.translate(display.cx+s.offsetX*scale,display.cy+s.offsetY*scale);ctx.rotate(s.angle*Math.PI/180);
 ctx.strokeStyle=selectionInk();ctx.globalAlpha=.6;ctx.lineWidth=1.2;ctx.setLineDash([4,4]);
 let midx=(obj.cx/maskCanvas.width-.5)*visualWidth*scale,midy=(obj.cy/maskCanvas.height-.5)*visualHeight*scale;
 ctx.translate(midx+(obj.dx||0)*scale,midy+(obj.dy||0)*scale);ctx.scale((obj.scale||100)/100,(obj.scale||100)/100);ctx.translate(-midx,-midy);
 ctx.strokeRect((bb[0]/maskCanvas.width-.5)*visualWidth*scale,(bb[1]/maskCanvas.height-.5)*visualHeight*scale,(bb[2]-bb[0]+1)/maskCanvas.width*visualWidth*scale,(bb[3]-bb[1]+1)/maskCanvas.height*visualHeight*scale);ctx.restore();}
 if(events.length&&(previewMode==='realistic'||previewMode==='thread')){
  realisticThreads(xy,simCursor,scale,previewMode==='thread'&&fvDarkCanvas);
 }
 if(events.length&&previewMode==='stitches'){ctx.save();ctx.lineWidth=1.15;let last=null,colorIndex=0;const colors=fvDarkCanvas?['#f7f7f7','#e4b99f','#a8cbef','#e7d399']:['#101d17','#a6513c','#466b86','#a28536'];
 let currentColor=threadPreviewHex(0,fvDarkCanvas)||colors[0];ctx.strokeStyle=currentColor;ctx.beginPath();
 let drawn=0,drawLimit=simCursor;for(let e of events){if(drawn++>=drawLimit)break;if(e.type==='color'){ctx.stroke();ctx.beginPath();last=null;colorIndex++;currentColor=threadPreviewHex(colorIndex,fvDarkCanvas)||colors[colorIndex%colors.length];ctx.strokeStyle=currentColor;continue;}
  let p=xy(e.x,e.y);
  if(last&&e.type==='stitch'){ctx.lineTo(p.x,p.y);}else{ctx.stroke();ctx.beginPath();ctx.moveTo(p.x,p.y);}
  last=e;
 }
 ctx.stroke();ctx.restore();
 if(s.showJumps)drawTravelPaths(xy,simCursor);
 }

 if(!cleanCapture&&simCursor>0&&simCursor<events.length&&previewMode!=='artwork'){
  let n=simCursor-1;while(n>=0&&events[n].type==='color')n--;
  if(n>=0){const pos=xy(events[n].x,events[n].y);ctx.save();ctx.lineWidth=1.8;ctx.strokeStyle='#ff7f24';ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(pos.x,pos.y,6.2,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(pos.x-11,pos.y);ctx.lineTo(pos.x-6,pos.y);ctx.moveTo(pos.x+6,pos.y);ctx.lineTo(pos.x+11,pos.y);ctx.moveTo(pos.x,pos.y-11);ctx.lineTo(pos.x,pos.y-6);ctx.moveTo(pos.x,pos.y+6);ctx.lineTo(pos.x,pos.y+11);ctx.stroke();ctx.restore();}
 }
 if(!cleanCapture)drawDensityMap(xy,scale);
 if(!cleanCapture&&s.showHoop)drawHoopOverlay(xy,scale);
 if(!cleanCapture&&s.showSequence)drawSequenceOverlay(xy);
 // Artwork preview shares the paths and dimensions used for embroidery.
 if(previewMode==='artwork')for(const t of textLayers){
  const geom=textRaster(t),move=textTransform(t);
  const draw=pts=>{pts.forEach((pt,i)=>{const p=xy(pt.x,pt.y);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});};
  ctx.save();ctx.fillStyle=ctx.strokeStyle=selectionInk();ctx.lineWidth=Math.max(1,scale*.28);ctx.lineCap='round';ctx.lineJoin='round';
  if(geom.paths){ctx.beginPath();geom.paths.forEach(path=>draw(path.map(move)));ctx.stroke();}
  else for(const rings of textRegions(t)){ctx.beginPath();rings.forEach(draw);ctx.fill('evenodd');}
  ctx.restore();
 }
 if(previewMode!=='realistic')renderTextSelections(scale);
 // manual shapes and node editing
 if(previewMode!=='realistic'&&(activeStroke||manual.length)){ctx.save();ctx.strokeStyle='#0c7c79';ctx.lineWidth=2;ctx.fillStyle='#0c7c79';const arr=activeStroke?[...manual,activeStroke]:manual;
 arr.forEach((stroke,idx)=>{let ps=stroke.map(p=>manualToWorld(p,visualWidth,visualHeight,s)).map(p=>xy(p.x,p.y));if(!ps.length)return;ctx.beginPath();ctx.moveTo(ps[0].x,ps[0].y);for(let i=1;i<ps.length;i++)ctx.lineTo(ps[i].x,ps[i].y);ctx.stroke();ps.forEach((pt,j)=>{let selected=selectedNode&&selectedNode.i===idx&&selectedNode.j===j;ctx.beginPath();ctx.arc(pt.x,pt.y,selected?5:3,0,Math.PI*2);ctx.fill();});});ctx.restore();}
 if(!cleanCapture&&tool!=='nodes')drawLayerSelection(xy,scale);if(!cleanCapture)fvNodeDraw(xy);
 if(typeof drawPartReview==='function'&&!cleanCapture)drawPartReview(xy);
 if(typeof drawNotes==='function')drawNotes(xy);
 }
window.addEventListener('fervor:theme-change',()=>{try{render();}catch(_){}});
function toWorld(ev){let rect=canvas.getBoundingClientRect();return {x:(ev.clientX-rect.left)*canvas.width/rect.width/display.scale-display.cx/display.scale,y:(ev.clientY-rect.top)*canvas.height/rect.height/display.scale-display.cy/display.scale};}
function worldToNormalized(wp){let s=getSettings(),local=fromWorld(wp.x,wp.y,s),width=s.width,height=mode==='image'?s.width*maskCanvas.height/Math.max(maskCanvas.width,1):s.width*(originalBounds.height/originalBounds.width);return {u:local.x/width,v:local.y/height};}
function pushUndo(){if(mode!=='image')return;undoStack.push(maskCanvas.toDataURL('image/png'));if(undoStack.length>15)undoStack.shift();redoStack=[];noteUndoKind('mask');}
async function undo(){if(!undoStack.length)return;redoStack.push(maskCanvas.toDataURL('image/png'));const src=undoStack.pop();let im=await imageFrom(src);maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height);maskCtx.drawImage(im,0,0);maskVersion++;queueRebuild();}
async function redo(){if(!redoStack.length)return;undoStack.push(maskCanvas.toDataURL('image/png'));let im=await imageFrom(redoStack.pop());maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height);maskCtx.drawImage(im,0,0);maskVersion++;queueRebuild();}
function brushAt(wp){let s=getSettings(),p=worldToNormalized(wp),x=(p.u+.5)*maskCanvas.width,y=(p.v+.5)*maskCanvas.height;maskCtx.fillStyle=tool==='brush'?'#000':'#fff';maskCtx.beginPath();maskCtx.arc(x,y,s.brushSize/2,0,Math.PI*2);maskCtx.fill();maskVersion++;render();}
function pickNode(wp){let s=getSettings(),w=s.width,h=mode==='image'?s.width*maskCanvas.height/Math.max(maskCanvas.width,1):s.width*(originalBounds.height/originalBounds.width),best=null;
 manual.forEach((stroke,i)=>stroke.forEach((p,j)=>{let a=manualToWorld(p,w,h,s),d=dist(a,wp);if(d<1.8&&(best===null||d<best.d))best={i,j,d};}));return best;}
function startMarquee(wp,e){focusedOrderPart=null;marquee={start:wp,end:wp,additive:!!(e.shiftKey||e.metaKey||e.ctrlKey)};canvas.setPointerCapture(e.pointerId);render();}
function finishMarquee(){
 if(!marquee)return;
 const m=marquee;marquee=null;
 const rect={minx:Math.min(m.start.x,m.end.x),maxx:Math.max(m.start.x,m.end.x),miny:Math.min(m.start.y,m.end.y),maxy:Math.max(m.start.y,m.end.y)};
 if(!m.additive)selectedParts.clear();
 if(rect.maxx-rect.minx>.4&&rect.maxy-rect.miny>.4){
  const candidates=[...jefLayers.filter(x=>!x.hidden).map(L=>({kind:'jef',id:L.id,L})),...(mode==='image'?objects.filter(x=>x.enabled).map(L=>({kind:'raster',id:L.id,L})):[])];
  for(const p of candidates){const b=partBounds(p);if(b.maxx>=rect.minx&&b.minx<=rect.maxx&&b.maxy>=rect.miny&&b.miny<=rect.maxy)selectedParts.add(partKey(p.kind,p.id));}
 }
 selectionSync();refreshLayerList();render();
 if(selectedParts.size>0)setStatus(`${selectedParts.size} parts selected`,'success');
}

// The path editor edits source geometry, so rebuild, simulation and export share the result.
let fvNodeSelection=null,fvNodeDrag=null,fvNodeRound=false,fvNodeRadius=4,fvNodeStrength=.35,fvNodePointer=null;
function fvNodeRecord(){
 if(!fvNodeSelection)return null;const n=fvNodeSelection,L=n.kind==='raster'?objects.find(o=>o.id===n.id):jefLayers.find(o=>o.id===n.id);
 if(!L||(n.kind==='raster'?!L.enabled:L.hidden))return null;
 const paths=n.kind==='raster'?L.fvNodeRings:(L.fvSource?.rings||L.paths),path=paths?.[n.ring];
 return path?{...n,node:Math.max(0,Math.min(n.node,path.length-1)),L,paths,path,shape:n.kind==='raster'||!!L.fvSource}:null;
}
function fvNodeWorld(p,r){
 if(r.kind==='jef')return layerPointWorld(p,r.L);
 const s=getSettings(),w=s.width,h=w*maskCanvas.height/maskCanvas.width,L=r.L,c={x:(L.cx/maskCanvas.width-.5)*w,y:(L.cy/maskCanvas.height-.5)*h},z=(L.scale||100)/100;
 return transformPoint({x:c.x+(p.x*w-c.x)*z*(L.stretchX||1)+(L.dx||0),y:c.y+(p.y*h-c.y)*z*(L.stretchY||1)+(L.dy||0)},0,0,s);
}
function fvNodeLocal(p,r){
 const s=getSettings(),q=fromWorld(p.x,p.y,s),L=r.L;
 if(r.kind==='jef'){
  const k=mode==='jef'?s.width/originalBounds.width:1,c=L.center||{x:0,y:0},a=-(L.rotation||0)*Math.PI/180,x=q.x/k-c.x-(L.dx||0),y=q.y/k-c.y-(L.dy||0);
  return {x:c.x+(x*Math.cos(a)-y*Math.sin(a))/(L.scaleX||1),y:c.y+(x*Math.sin(a)+y*Math.cos(a))/(L.scaleY||1)};
 }
 const w=s.width,h=w*maskCanvas.height/maskCanvas.width,c={x:(L.cx/maskCanvas.width-.5)*w,y:(L.cy/maskCanvas.height-.5)*h},z=(L.scale||100)/100;
 return {x:(c.x+(q.x-c.x-(L.dx||0))/(z*(L.stretchX||1)))/w,y:(c.y+(q.y-c.y-(L.dy||0))/(z*(L.stretchY||1)))/h};
}
function fvNodeClosed(r){return r.shape&&r.path.length>3&&dist(r.path[0],r.path.at(-1))<1e-7;}
function fvNodeSet(r,i,p){const closed=fvNodeClosed(r),last=r.path.length-1;r.path[i]=p;if(closed&&i===0)r.path[last]={...p};else if(closed&&i===last)r.path[0]={...p};}
function fvNodeCommit(){const r=fvNodeRecord();if(r?.L.fvSource){delete r.L.fvSource.oval;delete r.L.fvSource.nomuProfile;r.L.fvRecipe.nomuReference=false;fvRegenerateLayer(r.L);}fvNodeDrag=null;refreshLayerList();rebuild();fvNodeUI();}
function fvStartPart(){
 const parts=selectedPartRecords();
 return parts.length===1?parts[0]:null;
}
function fvStartEditable(r){return r&&(r.kind==='raster'?r.L.enabled:!!r.L.fvSource);}
function fvStartAnchor(r){return r?.kind==='raster'?r.L.startPoint:r?.L.fvRecipe?.startPoint;}
function fvUpdateStart(part,point){
 if(!fvStartEditable(part))return;
 captureLayerUndo();
 if(part.kind==='raster')part.L.startPoint=point;
 else{
  part.L.fvRecipe={...part.L.fvRecipe,startPoint:point};
  fvRegenerateLayer(part.L);
 }
 rebuild();
}
function fvStartClick(wp){
 if(!fvNodeChoose(wp)){
  setStatus('Click an artwork edge or stitch path to select its part.');return;
 }
 const r=fvNodeRecord();
 if(!fvStartEditable(r)){setStatus('This imported part preserves the original needle order.');return;}
 const hit=fvNearestOnRings([r.path.map(p=>fvNodeWorld(p,r))],wp);
 if(hit)fvUpdateStart(r,fvNodeLocal(hit.q,r));
}
function fvStartCurrentNode(){
 const r=fvNodeRecord();
 if(!fvStartEditable(r))return;
 fvUpdateStart(r,{...r.path[r.node]});
 setTool('start');
}
function fvStartDraw(xy){
 const r=fvStartPart(),key=r?(r.kind==='raster'?'shape:':'jef:')+r.id:null;
 let first=null,last=null;
 for(const e of events){
  if(e.type==='color'||key&&e.orderKey!==key)continue;
  first??=e;last=e;
 }
 const detail=$('fv-start-status');
 const anchor=fvStartAnchor(r);
 detail.textContent=!first?'Add stitches to see their start and finish.':
  !r?'Design start and finish · click a part edge to choose its entry.':
  !fvStartEditable(r)?'Original stitch order · view only.':
  anchor?'Custom entry · marker shows the actual stitch start.':'Automatic entry · click the part edge to change it.';
 $('fv-start-reset').disabled=!anchor||!fvStartEditable(r);
 if(!first)return;
 const pixelRatio=canvas.width/Math.max(1,canvas.getBoundingClientRect().width);
 function marker(p,label,color,xOffset){
  const q=xy(p.x,p.y),radius=5*pixelRatio;
  ctx.beginPath();ctx.arc(q.x,q.y,radius,0,Math.PI*2);
  ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#18120f';ctx.lineWidth=2*pixelRatio;ctx.stroke();
  ctx.font=`600 ${11*pixelRatio}px "Courier New",monospace`;
  ctx.textAlign=xOffset>0?'left':'right';ctx.textBaseline='middle';
  ctx.lineWidth=3*pixelRatio;ctx.strokeText(label,q.x+xOffset*pixelRatio,q.y);
  ctx.fillText(label,q.x+xOffset*pixelRatio,q.y);
 }
 ctx.save();
 marker(last,'Finish','#ffcb83',-10);
 marker(first,'Start','#9be4f3',10);
 ctx.restore();
}
function fvNodeUI(){const tray=$('fv-node-tray');if(!tray)return;tray.hidden=tool!=='nodes';$('fv-start-tray').hidden=tool!=='start';const r=fvNodeRecord();$('fv-node-start').disabled=!fvStartEditable(r);$('fv-node-status').textContent=r?`${r.shape?'Outline':'Needle points'} · ${r.path.length-(fvNodeClosed(r)?1:0)} nodes · point ${r.node+1}`:'Click a shape or stitch run';for(const id of ['fv-node-insert','fv-node-delete','fv-node-smooth'])$(id).disabled=!r||(id==='fv-node-smooth'&&!r.shape);}
function fvNodeDraw(xy){if(tool==='start'){fvStartDraw(xy);return;}if(tool!=='nodes')return;
 if(fvNodeRound&&fvNodePointer){const p=xy(fvNodePointer.x,fvNodePointer.y),radius=fvNodeRadius*display.scale;ctx.save();ctx.strokeStyle='#3985ff';ctx.fillStyle='#3985ff12';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.setLineDash([2,4]);ctx.beginPath();ctx.arc(p.x,p.y,radius*.55,0,Math.PI*2);ctx.stroke();ctx.restore();}
 const r=fvNodeRecord();if(!r)return;
 const pts=r.path.map(p=>{const q=fvNodeWorld(p,r);return xy(q.x,q.y);}),ratio=canvas.width/Math.max(1,canvas.getBoundingClientRect().width),size=6*ratio;
 ctx.save();ctx.strokeStyle='#3985ff';ctx.lineWidth=1.5*ratio;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
 const end=pts.length-(fvNodeClosed(r)?1:0);let prev=null;
 for(let i=0;i<end;i++){const q=pts[i];if(q.x<0||q.y<0||q.x>canvas.width||q.y>canvas.height)continue;if(i!==r.node&&prev&&dist(q,prev)<size*1.3)continue;ctx.fillStyle=i===r.node?'#3985ff':'#fff';if(fvNodeRound){ctx.beginPath();ctx.arc(q.x,q.y,size*.55,0,Math.PI*2);ctx.fill();ctx.stroke();}else{ctx.fillRect(q.x-size/2,q.y-size/2,size,size);ctx.strokeRect(q.x-size/2,q.y-size/2,size,size);}prev=q;}ctx.restore();fvNodeUI();
}
function fvNodeTolerance(){return 10*canvas.width/Math.max(1,canvas.getBoundingClientRect().width)/display.scale;}
function fvNodeChoose(wp){
 let best=null;const limit=fvNodeTolerance();
 for(const L of jefLayers.filter(l=>!l.hidden)){const paths=L.fvSource?.rings||L.paths;paths.forEach((path,ring)=>{const r={kind:'jef',id:L.id,L};for(let i=0;i<path.length-1;i++){const hit=fvNearestOnRings([[fvNodeWorld(path[i],r),fvNodeWorld(path[i+1],r)]],wp);if(hit&&hit.d<limit&&(!best||hit.d<best.d))best={kind:'jef',id:L.id,ring,node:i,d:hit.d};}});}
 if(!best){const id=hitLayer(wp),L=jefLayers.find(l=>l.id===id);if(L){const paths=L.fvSource?.rings||L.paths;let d=Infinity;paths.forEach((path,ring)=>{const hit=fvNearestOnRings([path.map(p=>layerPointWorld(p,L))],wp);if(hit&&hit.d<d){d=hit.d;best={kind:'jef',id,ring,node:hit.i};}});}}
 if(best){fvNodeSelection=best;selectJefLayer(best.id);return true;}
 if(mode==='image'){
  const id=hitRasterWorld(wp),o=objects.find(o=>o.id===id&&o.enabled);if(o){
   const w=getSettings().width,h=w*maskCanvas.height/maskCanvas.width;
   // Creating an exact outline cache changes no stitches; the first edit creates the undo entry.
   if(!o.fvNodeRings)o.fvNodeRings=objectRings(o,w,h).map(r=>r.map(p=>({x:p.x/w,y:p.y/h})));
   let ring=0,bd=Infinity;o.fvNodeRings.forEach((path,i)=>{const r={kind:'raster',id,L:o},hit=fvNearestOnRings([path.map(p=>fvNodeWorld(p,r))],wp);if(hit&&hit.d<bd){bd=hit.d;ring=i;}});
   fvNodeSelection={kind:'raster',id,ring,node:0};selectObject(id);return true;
  }
 }
 return false;
}
function fvNodeDown(e,wp){
 fvNodePointer=wp;
 if(fvNodeRound){if(!fvNodeRecord())fvNodeChoose(wp);const r=fvNodeRecord();if(!r)return;captureLayerUndo();fvNodeDrag={pointerId:e.pointerId,before:snapshotLayerState(),moved:false,round:true,last:wp};canvas.setPointerCapture(e.pointerId);fvNodeRoundAt(r,wp);render();e.preventDefault();return;}
 let r=fvNodeRecord(),hit=null;
 if(r){const limit=fvNodeTolerance();r.path.forEach((p,i)=>{const d=dist(fvNodeWorld(p,r),wp);if(d<limit&&(!hit||d<hit.d))hit={i,d};});}
 if(hit){fvNodeSelection.node=hit.i;captureLayerUndo();fvNodeDrag={pointerId:e.pointerId,before:snapshotLayerState(),moved:false};canvas.setPointerCapture(e.pointerId);}
 else{fvNodeChoose(wp);fvNodeDrag=null;}
 render();fvNodeUI();e.preventDefault();
}
function fvNodeMove(e,wp){fvNodePointer=wp;const r=fvNodeRecord();if(!r||!fvNodeDrag||fvNodeDrag.pointerId!==e.pointerId){if(fvNodeRound)render();return;}
 if(fvNodeDrag.round){if(dist(wp,fvNodeDrag.last)>=.08){fvNodeRoundAt(r,wp);fvNodeDrag.last=wp;}}else fvNodeSet(r,r.node,fvNodeLocal(wp,r));fvNodeDrag.moved=true;render();}
// One weighted, simultaneous pass; endpoints stay fixed and closed rings remain welded.
function fvSmoothBrush(points,center,radius,strength,closed){
 const n=points.length-(closed?1:0);if(n<3)return points.map(p=>({...p}));
 const out=points.slice(0,n).map((p,i)=>{if(!closed&&(i===0||i===n-1))return {...p};const d=Math.hypot(p.x-center.x,p.y-center.y);if(d>=radius)return {...p};const a=points[(i+n-1)%n],b=points[(i+1)%n],weight=strength*Math.pow(1-d/radius,2);return {x:p.x+((a.x+b.x)/2-p.x)*weight,y:p.y+((a.y+b.y)/2-p.y)*weight};});
 if(closed)out.push({...out[0]});return out;
}
function fvNodeRoundAt(r,wp){const world=r.path.map(p=>fvNodeWorld(p,r)),points=fvSmoothBrush(world,wp,fvNodeRadius,fvNodeStrength,fvNodeClosed(r));r.paths[r.ring]=points.map(p=>fvNodeLocal(p,r));if(fvNodeDrag)fvNodeDrag.moved=true;}
function fvNodeToggleRound(){if(fvNodeDrag)fvNodeCommit();fvNodeRound=!fvNodeRound;spaceHeld=false;const button=$('fv-node-round');button?.setAttribute('aria-pressed',String(fvNodeRound));if(button)button.textContent=fvNodeRound?'Round brush · On':'Round brush · Off';$('fv-node-brush-options').hidden=!fvNodeRound;canvas.style.cursor=fvNodeRound?'none':'default';render();}

function fvNodeInsert(wp=null){const r=fvNodeRecord();if(!r)return;let i=Math.min(r.node,r.path.length-2),p;
 if(wp){const hit=fvNearestOnRings([r.path.map(p=>fvNodeWorld(p,r))],wp);if(!hit||hit.d>fvNodeTolerance())return;i=hit.i;p=fvNodeLocal(hit.q,r);}
 else p={x:(r.path[i].x+r.path[i+1].x)/2,y:(r.path[i].y+r.path[i+1].y)/2};
 captureLayerUndo();r.path.splice(i+1,0,p);fvNodeSelection.node=i+1;fvNodeCommit();
}
function fvNodeDelete(){const r=fvNodeRecord();if(!r)return;const closed=fvNodeClosed(r),n=r.path.length-(closed?1:0);if(n<=(closed?3:2)){setStatus('Keep at least '+(closed?3:2)+' points in this path');return;}
 captureLayerUndo();const i=closed?r.node%n:r.node;if(closed)r.path.pop();r.path.splice(i,1);if(closed)r.path.push({...r.path[0]});fvNodeSelection.node=Math.min(i,r.path.length-(closed?2:1));fvNodeCommit();
}
function fvNodeSmooth(){const r=fvNodeRecord();if(!r||!r.shape)return;const closed=fvNodeClosed(r),n=r.path.length-(closed?1:0),i=r.node%n;if(!closed&&(i===0||i===n-1))return;
 captureLayerUndo();const a=r.path[(i+n-1)%n],b=r.path[(i+1)%n],p=r.path[i];fvNodeSet(r,i,{x:(a.x+2*p.x+b.x)/4,y:(a.y+2*p.y+b.y)/4});fvNodeCommit();
}
function fvNodeKey(e){if(tool==='start'&&e.key==='Escape'){setTool('select');return true;}
 if(tool!=='nodes'||e.target?.matches('input,textarea,select,[contenteditable]'))return false;
 if(e.key==='['||e.key===']'){fvNodeRadius=Math.max(.5,Math.min(20,fvNodeRadius+(e.key===']'?.5:-.5)));$('fv-node-radius').value=fvNodeRadius;$('fv-node-radius-out').textContent=fvNodeRadius+' mm';render();return true;}
 if(e.key==='Escape'){if(fvNodeDrag){restoreLayerState(fvNodeDrag.before);fvNodeDrag=null;}else{fvNodeSelection=null;setTool('select');}render();return true;}
 if(e.key==='Delete'||e.key==='Backspace'){fvNodeDelete();return true;}
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){const r=fvNodeRecord();if(!r)return true;const p=fvNodeWorld(r.path[r.node],r),step=e.shiftKey?1:.1;captureLayerUndo();p.x+=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0;p.y+=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;fvNodeSet(r,r.node,fvNodeLocal(p,r));fvNodeCommit();return true;}
 return false;
}

function setTool(v){const route=tool==='start'||v==='start';if(v==='text'){window.FervorStitchInspector?.(true);switchTab('text');}if(fvNodeDrag)fvNodeCommit();tool=v;fvNodeUI();syncNoteToolbar();for(let b of document.querySelectorAll('[data-tool]'))b.classList.toggle('chosen',b.dataset.tool===tool);
 // The blank-canvas card steps aside while a drawing tool is in use.
 $('stitch-lab')?.classList.toggle('sl-drawing',tool!=='select'&&tool!=='pan');canvas.style.cursor=tool==='nodes'&&fvNodeRound?'none':tool==='pan'?'grab':tool==='brush'||tool==='erase'?'crosshair':tool==='line'||tool==='text'||tool==='split'||tool==='marquee'||tool==='start'||tool==='note'?'crosshair':'default';$('edit-hint').textContent=tool==='nodes'?'Drag nodes · double-click edge to add · Space: round brush · [ / ]: radius · Delete point · ⌘/Ctrl+Z undo':tool==='pan'?'Drag the canvas to pan · Space-drag from any tool · two-finger scroll on trackpad.':tool==='line'?'Click to place points. Double-click or press Enter to finish.':tool==='brush'?'Paint black pixels directly onto the artwork.':tool==='erase'?'Erase unwanted details. Ctrl/⌘+Z to undo.':tool==='text'?'Click in the canvas to place or move lettering.':tool==='split'?'Drag a rectangle around stitches to cut into a separate movable layer.':tool==='marquee'?'Press and drag across the design to select multiple parts. Hold Shift to add to the selection.':tool==='note'?'Click to add a note. Drag its pin or title to move it.':tool==='start'?'Click a shape edge to choose where it starts sewing. Use Nodes to start from an exact node.':'Drag empty space to box-select. Drag a selected part to move it.';if(route)render();}
/* v2.13 viewport panning + stitch-object alignment. All alignment acts on editable geometry, never on export coordinates alone. */
function localDelta(dx,dy,kind){
 const s=getSettings(),a=s.angle*Math.PI/180,c=Math.cos(a),v=Math.sin(a),k=kind==='jef'&&mode==='jef'?Math.max(.001,s.width/Math.max(.001,originalBounds.width)):1;
 return {x:(dx*c+dy*v)/k,y:(-dx*v+dy*c)/k};
}
function pickedParts(){
 const parts=selectedPartRecords();if(parts.length)return parts.map(p=>({kind:p.kind,object:p.L,box:partBounds(p)}));
 const t=selectedText>=0?textLayers[selectedText]:null;
 if(!t)return [];
 const glyph=textRaster(t),w=glyph.mmW,h=glyph.mmH;
 return [{kind:'text',object:t,box:{minx:t.x-w/2,maxx:t.x+w/2,miny:t.y-h/2,maxy:t.y+h/2}}];
}
function moveObject(item,dx,dy){
 if(Math.abs(dx)<.0001&&Math.abs(dy)<.0001)return;
 if(item.kind==='text'){item.object.x=+(item.object.x+dx).toFixed(3);item.object.y=+(item.object.y+dy).toFixed(3);return;}
 const d=localDelta(dx,dy,item.kind);
 item.object.dx=+((item.object.dx||0)+d.x).toFixed(3);
 item.object.dy=+((item.object.dy||0)+d.y).toFixed(3);
}
function partPosition(b,mode){
 if(mode==='left')return b.minx;if(mode==='right')return b.maxx;if(mode==='top')return b.miny;if(mode==='bottom')return b.maxy;
 if(mode==='hcenter')return (b.minx+b.maxx)/2;
 if(mode==='vcenter')return (b.miny+b.maxy)/2;
 return 0;
}
function alignParts(cmd){
 const items=pickedParts();if(!items.length){alertMessage('Select an embroidery part first. Shift-click or Box select for multiple parts.',true);return false;}
 const box=(item)=>item.box;let n=0;
 if(cmd==='hoop-x'||cmd==='hoop-y'||cmd==='hoop-both'){
   const bounds={minx:Math.min(...items.map(x=>x.box.minx)),maxx:Math.max(...items.map(x=>x.box.maxx)),miny:Math.min(...items.map(x=>x.box.miny)),maxy:Math.max(...items.map(x=>x.box.maxy))};
   const dx=cmd==='hoop-y'?0:-partPosition(bounds,'hcenter');
   const dy=cmd==='hoop-x'?0:-partPosition(bounds,'vcenter');
   if(items[0].kind!=='text')captureLayerUndo();for(const item of items){moveObject(item,dx,dy);n++;}
 }else if(['left','right','top','bottom','hcenter','vcenter'].includes(cmd)){
   if(items.length<2){alertMessage('Select two or more parts. The first selected part is the alignment reference.',true);return false;}
   if(items[0].kind!=='text')captureLayerUndo();
   const anchor=partPosition(box(items[0]),cmd);
   for(const item of items.slice(1)){const delta=anchor-partPosition(box(item),cmd);moveObject(item,['left','right','hcenter'].includes(cmd)?delta:0,['top','bottom','vcenter'].includes(cmd)?delta:0);n++;}
 }else if(cmd==='distribute-x'||cmd==='distribute-y'){
   if(items.length<3){alertMessage('Select at least three parts to distribute.',true);return false;}
   const ax=cmd==='distribute-x',sorted=[...items].sort((a,b)=>partPosition(a.box,ax?'hcenter':'vcenter')-partPosition(b.box,ax?'hcenter':'vcenter'));
   const start=partPosition(sorted[0].box,ax?'hcenter':'vcenter'),end=partPosition(sorted.at(-1).box,ax?'hcenter':'vcenter');
   if(items[0].kind!=='text')captureLayerUndo();
   for(let i=1;i<sorted.length-1;i++){const delta=start+(end-start)*i/(sorted.length-1)-partPosition(sorted[i].box,ax?'hcenter':'vcenter');moveObject(sorted[i],ax?delta:0,ax?0:delta);n++;}
 }
 refreshLayerList();queueRebuild();setStatus(`Aligned ${n} part${n===1?'':'s'}`,'success');return true;
}
function snapDragged(){
 if(!snapEnabled)return false;
 const items=pickedParts();if(items.length!==1)return false;
 const moving=items[0];const b=moving.box;
 const others=[];if(moving.kind==='text'){
   for(const p of [...jefLayers.map(x=>({kind:'jef',L:x})),...(mode==='image'?objects.filter(x=>x.enabled).map(x=>({kind:'raster',L:x})):[])])others.push(partBounds(p));
 }else{
   for(const p of [...jefLayers.map(x=>({kind:'jef',id:x.id,L:x})),...(mode==='image'?objects.filter(x=>x.enabled).map(x=>({kind:'raster',id:x.id,L:x})):[])]){
    if(p.kind===moving.kind&&p.L===moving.object)continue;others.push(partBounds(p));
   }
 }
 const find=(axis)=>{
   const modes=axis==='x'?['left','hcenter','right']:['top','vcenter','bottom'];
   const value=(x,k)=>partPosition(x,k),candidates=[];
   for(const b2 of others)for(const m of modes)candidates.push({v:value(b2,m),priority:1});
   let best=null,limit=Math.max(.25,8/Math.max(.01,display.scale));
   for(const m of modes){const at=value(b,m);for(const candidate of [...candidates,...(m===(axis==='x'?'hcenter':'vcenter')?[{v:0,priority:0}]:[])]){const d=candidate.v-at;if(Math.abs(d)<=limit&&(!best||Math.abs(d)<Math.abs(best.d)))best={d};}}
   return best?.d||0;
 };
 const dx=find('x'),dy=find('y');if(!dx&&!dy)return false;
 moveObject(moving,dx,dy);refreshLayerList();queueRebuild();return true;
}
function setPan(dx,dy){viewPan.x+=dx;viewPan.y+=dy;render();}
window.FervorTools={align:alignParts,setSnap(value){snapEnabled=!!value;return snapEnabled;},getSnap:()=>snapEnabled,setTool,createShape:(kind,w,h,outline)=>createStitchedShape(kind,w,h,outline),getSelectionCount:()=>pickedParts().length,panBy:setPan};
window.addEventListener('keydown',e=>{if(window.FervorStitchKeys&&!window.FervorStitchKeys())return;if(tool==='nodes'&&e.code==='Space'&&!e.target?.matches?.('input,textarea,select,[contenteditable]')&&!e.altKey&&!e.metaKey&&!e.ctrlKey){if(!e.repeat)fvNodeToggleRound();e.preventDefault();e.stopImmediatePropagation();return;}if(e.code==='Space'&&!e.repeat&&!e.target?.matches?.('input,textarea,select,[contenteditable]')&&!e.altKey&&!e.metaKey&&!e.ctrlKey){if(tool==='nodes'){fvNodeToggleRound();e.preventDefault();e.stopImmediatePropagation();return;}spaceHeld=true;canvas.style.cursor='grab';e.preventDefault();}},true);
window.addEventListener('keyup',e=>{if(e.code==='Space'){spaceHeld=false;if(!panGesture)canvas.style.cursor=tool==='nodes'&&fvNodeRound?'none':tool==='pan'?'grab':'default';}},true);
window.addEventListener('blur',()=>{spaceHeld=false;panGesture=null;});
canvas.addEventListener('pointercancel',()=>{panGesture=null;canvas.style.cursor=tool==='pan'?'grab':'default';});

canvas.addEventListener('pointerdown',e=>{
 if(tool==='pan'||spaceHeld||e.button===1){panGesture={pointerId:e.pointerId,x:e.clientX,y:e.clientY};canvas.style.cursor='grabbing';canvas.setPointerCapture(e.pointerId);e.preventDefault();return;}
 const wp=toWorld(e);if(tool==='note'){if(e.button===0)addCanvasNote(wp);return;}if(tool==='nodes'){fvNodeDown(e,wp);return;}if(tool==='start'){fvStartClick(wp);return;}if(startResize(e,wp))return;if(tool==='marquee'){startMarquee(wp,e);return;}if(tool==='split'&&selectedJefLayerId!==null){if(selectedJefLayerId===null){alertMessage('Select a stitch layer first, then drag a box around the portion to separate.',true);return;}splitBox={start:wp,end:wp};canvas.setPointerCapture(e.pointerId);render();return;}if(tool==='brush'||tool==='erase'){if(mode!=='image')return;pushUndo();paintInProgress=true;canvas.setPointerCapture(e.pointerId);brushAt(wp);return;}
 if(tool==='text'){if(selectedText<0)addText(wp);else{captureLayerUndo();textLayers[selectedText].x=+wp.x.toFixed(1);textLayers[selectedText].y=+wp.y.toFixed(1);setTextFields(textLayers[selectedText]);queueRebuild();}return;}
 if(tool==='line'){let p=worldToNormalized(wp);if(!activeStroke)activeStroke=[];activeStroke.push(p);render();return;}
 if(tool==='select'){const ti=textHitTest(wp);if(ti<0&&jefLayers.length&&startImportedDrag(wp,e))return;else if(globalMove){dragLayer={kind:'all',start:wp,x:+UI.offsetX.value,y:+UI.offsetY.value};canvas.setPointerCapture(e.pointerId);return;}if(ti>=0){selectText(ti);captureLayerUndo();dragText={i:ti,dx:textLayers[ti].x-wp.x,dy:textLayers[ti].y-wp.y};canvas.setPointerCapture(e.pointerId);return;}if(mode==='image'){let s=getSettings(),p=worldToNormalized(wp),ix=Math.floor((p.u+.5)*maskCanvas.width),iy=Math.floor((p.v+.5)*maskCanvas.height);let id=hitRasterWorld(wp);if(id>0){if(e.shiftKey||e.metaKey||e.ctrlKey||multiSelectionMode){selectPart('raster',id,e);return;}
 if(selectedParts.size>1&&selectedParts.has(partKey('raster',id))){multiDragStart(wp,e,false);return;}
 selectPart('raster',id);captureLayerUndo();dragLayer={kind:'shape',id,start:fromWorld(wp.x,wp.y,s),dx:objects[id-1].dx||0,dy:objects[id-1].dy||0,scale:objects[id-1].scale||100};canvas.setPointerCapture(e.pointerId);return;}}selectedNode=pickNode(wp);if(selectedNode){dragNode=true;canvas.setPointerCapture(e.pointerId);render();return;}startMarquee(wp,e);}
});
canvas.addEventListener('pointermove',e=>{
 if(panGesture){const g=panGesture;if(g.pointerId===e.pointerId){const r=canvas.getBoundingClientRect();setPan((e.clientX-g.x)*canvas.width/r.width,(e.clientY-g.y)*canvas.height/r.height);g.x=e.clientX;g.y=e.clientY;}return;}
 const wp=toWorld(e);if(tool==='nodes'){fvNodeMove(e,wp);return;}if(resizer){moveResize(wp,e);return;}if(tool==='select'&&!dragLayer&&!marquee){const hit=hitResizeHandle(wp);canvas.style.cursor=hit?(hit.h.id==='n'||hit.h.id==='s'?'ns-resize':hit.h.id==='nw'||hit.h.id==='se'?'nwse-resize':'nesw-resize'):'default';}if(marquee){marquee.end=wp;render();return;}if(splitBox){splitBox.end=wp;render();return;}if(dragLayer){updateLayerDrag(wp);return;}if(dragText){let t=textLayers[dragText.i];if(t){t.x=+(wp.x+dragText.dx).toFixed(1);t.y=+(wp.y+dragText.dy).toFixed(1);setTextFields(t);render();}return;}if(paintInProgress){brushAt(wp);return;}
 if(dragNode&&selectedNode){manual[selectedNode.i][selectedNode.j]=worldToNormalized(wp);render();}
});
canvas.addEventListener('pointerup',()=>{if(panGesture){panGesture=null;canvas.style.cursor=tool==='pan'||spaceHeld?'grab':'default';return;}if(tool==='nodes'){if(fvNodeDrag)fvNodeCommit();return;}if(endResize())return;if(marquee){finishMarquee();return;}if(splitBox&&splitBox.end){finishBoxSplit();return;}if(dragLayer){const kind=dragLayer.kind;dragLayer=null;if(kind==='shape'||kind==='jef'||kind==='group')snapDragged();queueRebuild();}if(dragText){dragText=null;snapDragged();queueRebuild();}if(paintInProgress){paintInProgress=false;queueRebuild();}if(dragNode){dragNode=false;queueRebuild();}});
canvas.addEventListener('dblclick',e=>{if(tool==='nodes'){if(!fvNodeRound)fvNodeInsert(toWorld(e));return;}finishLine();});
canvas.addEventListener('pointercancel',()=>{if(fvNodeDrag){const before=fvNodeDrag.before;fvNodeDrag=null;restoreLayerState(before);}});
function finishLine(){if(activeStroke&&activeStroke.length>1){manual.push(activeStroke);queueRebuild();}activeStroke=null;render();}
window.addEventListener('keydown',e=>{if(window.FervorStitchKeys&&!window.FervorStitchKeys())return;let tag=(document.activeElement?.tagName||'').toLowerCase();if(tag==='input'||tag==='textarea'||tag==='select')return;
 if(fvNodeKey(e)){e.preventDefault();e.stopImmediatePropagation();return;}
 if(e.key==='Escape'&&openedNote){openedNote=null;render();return;}
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='a'){e.preventDefault();selectAllParts();return;}
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='c'){e.preventDefault();copySelectedParts();return;}
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='v'){e.preventDefault();pasteCopiedParts();return;}
 if(e.key==='Escape'&&(selectedParts.size||focusedOrderPart)){clearPartSelection();return;}
if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();exportProject();return;}if(e.key.toLowerCase()==='j'&&!e.ctrlKey&&!e.metaKey){$('show-jumps').checked=!$('show-jumps').checked;render();return;}if(e.key==='Enter'&&activeStroke)finishLine();if(e.key==='Escape'){activeStroke=null;splitBox=null;marquee=null;render();}if((e.key==='Delete'||e.key==='Backspace')&&selectedParts.size){e.preventDefault();deleteSelectedParts();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey){const k=redoKinds.pop();if(k==='mask'&&redoStack.length){undoKinds.push(k);redo();}else{if(k)undoKinds.push(k);undoLayers(true);}}else{const k=undoKinds.pop();if(k==='mask'&&undoStack.length){redoKinds.push(k);undo();}else{if(k)redoKinds.push(k);undoLayers(false);}}}});
async function loadJef(buffer,name){try{stitchOrderKeys=[];
 let j=JefCore.parse(buffer);return await loadStitchPattern(j,name,'JEF');}
 catch(e){alertMessage('Could not read this JEF: '+e.message,true);setStatus('JEF import failed','error');return false;}}
async function loadPes(buffer,name){try{stitchOrderKeys=[];const j=window.NOMU_PES.parse(buffer);return await loadStitchPattern(j,name,j.sourceFormat);}
 catch(e){alertMessage('Could not read '+name+': '+e.message,true);setStatus('PES import failed','error');return false;}}
async function loadStitchPattern(j,name,format){clearTimeout(recentSaveTimer);recentSaveTimer=null;currentProjectId=null;openedVersion=null;try{optimizeActive=false;optimizePrevious=null;$('fv26-revert-plan').hidden=true;$('fv26-fix-report').hidden=true;restoreNotes();mode='jef';vectorHandoff=false;sourceName=name.replace(/\.(jef|pes|pec)$/i,'');imported=j.events;palette=j.palette;originalJef=null;originalBounds={width:j.width,height:j.height,center:j.center};manual=[];textLayers=[];selectedText=-1;refreshTextPicker();activeStroke=null;selectedNode=null;
 jefLayers=splitJefIntoLayers(j.events,j.center);for(const L of jefLayers)L.threadCode=j.palette[L.colorIndex]??1;selectedJefLayerId=jefLayers[0]?.id??null;selectedParts=selectedJefLayerId===null?new Set():new Set([partKey('jef',selectedJefLayerId)]);layerHistory=[];futureLayerHistory=[];
 setSettings({...DEFAULTS,width:Math.max(20,Math.round(j.width*10)/10),hoop:String(j.hoopCode)});syncMode();refreshLayerList();previewMode=DEFAULT_PREVIEW_MODE;syncViewButtons();fitOnNextRebuild=true;queueRebuild();switchTab('layers');setStatus('JEF imported','success');
 alertMessage(`Loaded ${jefLayers.length} independently editable ${format} stitch runs (${j.events.filter(e=>e.type==='stitch').length.toLocaleString()} stitches). Export as JEF or save a Stitch Lab project; source file stays unchanged.`);
 scheduleRecentSave();return true;
 }catch(e){alertMessage('Could not edit '+format+': '+e.message,true);setStatus('Import failed','error');return false;}}

async function handleUpload(file){if(!file)return;window.FervorFocus?.exit?.();let name=file.name;
 if(window.FervorDocs?.ready){window.FervorDocs.beforeOpen(name.replace(/\.[^.]+$/,''));}
 document.body.classList.remove('fv18-empty');
 if(/\.jef$/i.test(name))return loadJef(await file.arrayBuffer(),name);
 if(/\.(pes|pec)$/i.test(name))return loadPes(await file.arrayBuffer(),name);
 if(/\.emb$/i.test(name))return alertMessage('Wilcom EMB is a proprietary editable design file; this app cannot decode it natively. Export it as PES or JEF in Wilcom/Hatch and open the exported machine file here. Keep the original EMB for full editing.',true);
 if(/\.json$/i.test(name))return loadProject(await file.text());
 if(!/\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(name))return alertMessage('Use PNG, JPG, PES/PEC, JEF or saved Stitch Lab JSON.',true);
 UI.threshold.value=DEFAULTS.threshold;updateNumbers();return loadImage(await readAsDataUrl(file),name.replace(/\.[^.]+$/,''));}

/* The sidebar stays a compact view of Stitch Lab projects in Project Files. */
const projectFiles=window.FervorProjectFiles;
let currentProjectId=null,openedVersion=null,recentSaveTimer=null,recentRender=0;
function hasProjectContent(){return Boolean(sourceImage&&sourceDataUrl&&!document.body.classList.contains('fv18-empty')||
 jefLayers.length||manual.length||textLayers.some(t=>t.content)||annotations.length||currentProjectId);}
async function storeRecentDesign(project=projectSnapshot()){
 if(!project?.sourceName)return null;
 const id=currentProjectId||=projectFiles.key();
 const plan=events.slice(),equivalentTo=openedVersion&&openedVersion.working===projectFiles.signature('stitch',project,plan)?openedVersion.stored:undefined;
 const saved=await projectFiles.save({id,type:'stitch',name:project.sourceName,project:{...project,fileId:id,fv18Blank:project.fv18Blank??document.body.classList.contains('fv18-empty')},events:plan,equivalentTo});
 if(saved){window.FervorDocs?.saved(id);if(currentProjectId===id&&!project.fv18Blank&&!document.body.classList.contains('fv18-empty')&&!window.FervorProjectSession.openOrder().includes(id))window.FervorProjectSession.touch(id);}
 return saved;
}
function flushRecentSave(){
 if(recentSaveTimer||generationTimer){
  if(generationTimer){clearTimeout(generationTimer);rebuild();}
  clearTimeout(recentSaveTimer);recentSaveTimer=null;
  if(hasProjectContent())return storeRecentDesign().catch(e=>console.warn('Autosave skipped:',e.message));
 }
}
function scheduleRecentSave(){
 clearTimeout(recentSaveTimer);
 recentSaveTimer=setTimeout(()=>{
  recentSaveTimer=null;
  if(hasProjectContent())storeRecentDesign().catch(e=>console.warn('Autosave skipped:',e.message));
 },1800);
}
async function listRecentDesigns(){
 const entries=await projectFiles.list(),map=new Map(entries.map(x=>[x.id,x]));
 return entries.filter(x=>x.type==='stitch'&&projectFiles.isActive(x,map)).sort((a,b)=>b.modifiedAt-a.modifiedAt);
}
async function openSavedStitch(item){
 if(!item?.project)throw Error('The project file is missing its design.');
 if(await window.FervorDocs?.activateSaved?.(item.id))return item.name;
 window.FervorDocs?.openSaved(item.name);
 if(!await loadProject(item.project,{id:item.id,name:item.name,storedSignature:item.signature}))throw Error('The stitch project could not be opened.');
 document.body.classList.toggle('fv18-empty',!!item.project.fv18Blank);
 window.FervorDocs?.afterOpen();switchTab('layers');return item.name;
}
async function refreshRecentDesigns(){
 const root=$('recent-designs');if(!root)return;
 const rev=++recentRender;
 let items;
 try{items=await listRecentDesigns();}
 catch(_){if(rev===recentRender)root.textContent='Project Files is unavailable in this browser profile.';return;}
 if(rev!==recentRender)return;
 root.replaceChildren();$('recent-design-count').textContent=items.length?String(Math.min(8,items.length)):'';
 if(!items.length){const m=document.createElement('small');m.textContent='No saved designs yet.';root.append(m);return;}
 for(const item of items.slice(0,8)){
  const row=document.createElement('div');row.className='recent-entry';
  const button=document.createElement('button');button.className='recent-open';button.type='button';
  const name=document.createElement('strong');name.textContent=item.name;
  const sub=document.createElement('small');sub.textContent=new Date(item.modifiedAt).toLocaleString()+(item.testedAt?' · Tested':'');
  button.append(name,sub);
  button.addEventListener('click',async()=>{
   try{await openSavedStitch(await projectFiles.open(item.id));alertMessage('Opened saved design: '+item.name);}
   catch(e){alertMessage(e.message,true);}
  });
  const remove=document.createElement('button');remove.type='button';remove.className='recent-remove';remove.textContent='×';
  remove.title='Move to Recently Deleted';remove.setAttribute('aria-label','Move '+item.name+' to Recently Deleted');
  remove.addEventListener('click',async()=>{
   try{await projectFiles.edit('trash',item.id);alertMessage('Moved to Recently Deleted. You can restore it in Project Files.');}
   catch(e){alertMessage(e.message,true);}
  });
  row.append(button,remove);root.append(row);
 }
}
async function saveCurrentProject(){
 try{
  if(generationTimer){clearTimeout(generationTimer);rebuild();}
  clearTimeout(recentSaveTimer);recentSaveTimer=null;
  const item=await storeRecentDesign();
  alertMessage(item?'Saved to Project Files.':'Restore this project from Recently Deleted before saving.',!item);
 }catch(e){alertMessage('Could not save: '+e.message,true);}
}
function bindRecentDesigns(){
 $('recent-save').addEventListener('click',saveCurrentProject);
 $('recent-browse-files').addEventListener('click',e=>window.FervorFileBrowser.show(e.currentTarget,'stitch'));
 window.addEventListener('fervor:project-files-change',refreshRecentDesigns);
 window.addEventListener('fervor:project-file-renamed',e=>{
  if(e.detail.id===currentProjectId){sourceName=e.detail.name;window.FervorDocs?.afterOpen();}
 });
 refreshRecentDesigns();
}

function doExportJef(){if(!events.length)return alertMessage('Generate a stitch plan before exporting.',true);
 readiness=machineAssessment(events);if(!readiness.ok){updateMachinePanel();return alertMessage('Export blocked: stitch path does not fit the selected physical hoop.',true);}
 try{let value=UI.hoop.value,hoopCode=value==='auto'?'auto':parseInt(value,10),result=JefCore.write(events,{hoopCode,palette:exportPalette.length?exportPalette:palette,...trimOptions()});
 let size=result.stats.width.toFixed(1)+' × '+result.stats.height.toFixed(1);
 if(result.stats.stitches!==result.parsed.events.filter(e=>e.type==='stitch').length)throw new Error('JEF round-trip stitch mismatch');
 if(result.stats.stitches>75000)alertMessage('Exported a high-stitch-count file. Review density and test carefully.',true);
 else alertMessage(`Exported ${result.stats.stitches.toLocaleString()} stitches (${size} mm) with ${result.stats.trims} JEF cutting markers. On Janome, enable Advanced → Cutting Command. Structurally checked only; machine cutting and stitch quality require a sew-out.`);
 download(result.buffer,filename('JEF'),'application/octet-stream');setStatus('JEF exported','success');
 window.dispatchEvent(new CustomEvent('stitchlab:jef-exported',{detail:{buffer:result.buffer}}));
 }catch(e){alertMessage('Export blocked: '+e.message,true);}}
function doExportSvg(){if(!events.length)return;let bounds=calcBounds(events),pad=5;let paths=[],points=[],color=0;
 function push(){if(points.length>1)paths.push(`<polyline points="${points.map(p=>p.map(n=>n.toFixed(2)).join(',')).join(' ')}" fill="none" stroke="${['#111111','#af543c','#376b85'][color%3]}" stroke-width="0.32" stroke-linecap="round" stroke-linejoin="round"/>`);points=[];}
 for(let ev of events){if(ev.type==='color'){push();color++;continue;}if(ev.type==='jump'){push();points.push([ev.x,ev.y]);continue;}points.push([ev.x,ev.y]);}push();
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.w+2*pad}mm" height="${bounds.h+2*pad}mm" viewBox="${bounds.minx-pad} ${bounds.miny-pad} ${bounds.w+2*pad} ${bounds.h+2*pad}">${paths.join('\n')}</svg>`;
 download(svg,filename('svg'),'image/svg+xml');}
function projectSnapshot(){let data={app:'NOMU Stitch Lab',version:2.9,mode,vectorHandoff,sourceName,fileId:currentProjectId,fv26Optimized:optimizeActive,fv26OriginalRouting:optimizePrevious,inverseArtwork:!!$('fv23-invert')?.checked,settings:getSettings(),manual,textLayers,annotations,noteVisibility,palette,sourceDataUrl:mode==='image'?sourceDataUrl:null,maskDataUrl:mode==='image'?maskCanvas.toDataURL('image/png'):null,imported:mode==='jef'?imported:null,originalBounds:mode==='jef'?originalBounds:null,jefLayers:jefLayers,preview:{mode:previewMode,fabric:previewFabric,thread:previewThread,original:previewOriginal,threadColorMode:1,thickness:previewThickness},shapeSettings:mode==='image'?objects.map(o=>({cx:o.cx,cy:o.cy,style:o.style,patterns:o.patterns,startPoint:o.startPoint||null,spacing:o.spacing,angle:o.angle,enabled:o.enabled,dx:o.dx,dy:o.dy,scale:o.scale,stretchX:o.stretchX,stretchY:o.stretchY,borderEnabled:o.borderEnabled,borderWidth:o.borderWidth,borderStep:o.borderStep,borderPatterns:o.borderPatterns,borderPosition:o.borderPosition,borderOnly:o.borderOnly,borderUnderlay:o.borderUnderlay,fvNodeRings:o.fvNodeRings||null})):[],smallArea,garment,selectedMachineHoop,stitchOrder:stitchOrderKeys,autoTrimBetweenParts:$('fv27-cut-between-parts').checked,trimMinDistanceMm:Number($('fv27-trim-min-distance').value)||0,secureRuns:$('secure-runs').checked,simulation:{spm:+$('sim-machine-speed').value,efficiency:+$('sim-efficiency').value,trimSeconds:+$('sim-trim-seconds').value,colorSeconds:+$('sim-color-seconds').value,playbackRate:+$('sim-playback-rate').value}};return data;}
function exportProject(){const data=projectSnapshot();const {fileId,...portable}=data;download(JSON.stringify(portable),filename('json'),'application/json');storeRecentDesign(data).catch(e=>alertMessage('Could not save locally: '+e.message,true));}
async function loadProject(json,{id=null,name=null,storedSignature}={}){fvNodeSelection=null;fvNodeDrag=null;focusedOrderPart=checkedPart=null;try{let p=typeof json==='string'?JSON.parse(json):json;if(p.app!=='NOMU Stitch Lab')throw new Error('Unknown project format');clearTimeout(recentSaveTimer);recentSaveTimer=null;
 if($('fv23-invert'))$('fv23-invert').checked=!!p.inverseArtwork; if(p.mode==='image'){if(!await loadImage(p.sourceDataUrl,p.sourceName,p.maskDataUrl))return false;}
 else {mode='jef';vectorHandoff=false;sourceName=p.sourceName;imported=p.imported;originalBounds=p.originalBounds;palette=p.palette||[1];sourceImage=null;jefLayers=Array.isArray(p.jefLayers)?p.jefLayers:splitJefIntoLayers(imported,originalBounds.center);nextJefLayerId=Math.max(1,...jefLayers.map(x=>x.id||0))+1;selectedJefLayerId=null;selectedParts.clear();syncMode();}
 currentProjectId=id;openedVersion=null;sourceName=name||sourceName;
 setSettings({...p.settings,satinDirection:p.settings?.satinDirection||'auto',satinOverlap:p.settings?.satinOverlap??.25});
 previewMode=Object.hasOwn(STITCH_PREVIEW_LABELS,p.preview?.mode)?p.preview.mode:DEFAULT_PREVIEW_MODE;
 previewOriginal=!!p.preview?.original;$('preview-original').checked=previewOriginal;
 previewThread=p.preview&&(p.preview.threadColorMode||p.preview.thread!=='charcoal')&&THREAD_SWATCHES[p.preview.thread]?p.preview.thread:'auto';
 $('preview-thread').value=previewThread;
 if(p.preview){previewFabric=FABRIC_SWATCHES[p.preview.fabric]?p.preview.fabric:'linen';previewThickness=Math.max(.25,Math.min(.60,Number(p.preview.thickness)||.38));$('preview-fabric').value=previewFabric;$('preview-thread').value=previewThread;$('preview-thickness').value=previewThickness;$('preview-thickness-label').textContent=previewThickness.toFixed(2)+' mm';syncViewButtons();}
 manual=p.manual||[];textLayers=Array.isArray(p.textLayers)?p.textLayers.filter(t=>t&&typeof t==='object').map(lettering.fields):[];selectedText=-1;refreshTextPicker();
 if(p.mode==='image'){selectedParts.clear();jefLayers=Array.isArray(p.jefLayers)?p.jefLayers:[];nextJefLayerId=Math.max(1,...jefLayers.map(x=>x.id||0))+1;selectedJefLayerId=null;updateObjects(true);for(let old of p.shapeSettings||[]){let shape=objects.find(o=>Math.hypot(o.cx-old.cx,o.cy-old.cy)<4);if(shape)Object.assign(shape,{style:old.style,patterns:old.patterns,startPoint:old.startPoint||null,angle:old.angle,spacing:old.spacing,enabled:old.enabled,dx:old.dx,dy:old.dy,scale:old.scale,stretchX:old.stretchX||1,stretchY:old.stretchY||1,borderEnabled:old.borderEnabled??false,borderWidth:old.borderWidth??1.8,borderStep:old.borderStep??.45,borderPatterns:old.borderPatterns,borderPosition:old.borderPosition??'center',borderOnly:old.borderOnly??false,borderUnderlay:old.borderUnderlay??true,fvNodeRings:old.fvNodeRings||null});}fillObjectPicker();}
 vectorHandoff=mode==='image'&&(p.vectorHandoff===true||(p.vectorHandoff===undefined&&maskCanvas.width===640&&maskCanvas.height===360&&!objects.length&&editableVectorLayers().length>0));
 syncMode();
 optimizeActive=!!p.fv26Optimized;optimizePrevious=p.fv26OriginalRouting||null;$('fv26-revert-plan').hidden=!optimizeActive;$('fv26-fix-report').hidden=true;
 $('secure-runs').checked=!!p.secureRuns;$('fv27-cut-between-parts').checked=p.autoTrimBetweenParts!==false;$('fv27-trim-min-distance').value=String(p.trimMinDistanceMm??3);stitchOrderKeys=Array.isArray(p.stitchOrder)?p.stitchOrder.slice():[];if(Number.isFinite(p.smallArea))smallArea=p.smallArea;if(p.garment)garment=p.garment; $('garment-select').value=garment;selectedMachineHoop=PHYSICAL_HOOPS[p.selectedMachineHoop]?p.selectedMachineHoop:'RE20b';$('physical-hoop').value=selectedMachineHoop;
 if(p.simulation){for(const [key,value] of Object.entries({'sim-machine-speed':p.simulation.spm,'sim-efficiency':p.simulation.efficiency,'sim-trim-seconds':p.simulation.trimSeconds,'sim-color-seconds':p.simulation.colorSeconds,'sim-playback-rate':p.simulation.playbackRate}))if(value!==undefined&&value!==null)$(key).value=value;}
 restoreNotes(p.annotations,p.noteVisibility??'pins');
 for(const L of jefLayers){
  const src=L.fvSource,r=L.fvRecipe;
  if(!src?.physical||!r)continue;
  const figure=src.nomuFigure||(L.name==='NOMU mark'&&src.rings?.length===2);
  if(figure)src.nomuFigure=true;
  if(!src.nomuProfile&&r.nomuReference!==false&&(figure||src.oval)){
   src.nomuProfile=figure?'figure':'oval';
   if(src.oval&&r.ovalMode===undefined&&(r.ovalWidth??4.3)===4.3)r.ovalMode='scale';
   if(r.satinMax===6.5&&!r.startPoint&&(!r.patterns?.satin||r.patterns.satin==='smooth'))r.satinMax=8;
  }
  if(figure||src.oval)fvRegenerateLayer(L);
 }
 for(let i=1;i<jefLayers.length;i++){
  const oval=jefLayers[i],mark=jefLayers[i-1];
  if(oval.name==='NOMU oval'&&mark.name==='NOMU mark'&&oval.fvSource?.oval&&mark.fvSource?.nomuProfile==='figure'
    &&!oval.nomuEmblem&&!mark.nomuEmblem&&Math.hypot((oval.dx||0)-(mark.dx||0),(oval.dy||0)-(mark.dy||0))<1){
   mark.nomuEmblem=oval.nomuEmblem=createEditorId();
  }
 }
 refreshLayerList();$('min-area').value=smallArea;$('min-area-out').textContent=smallArea.toFixed(2)+' mm²';syncViewButtons();fitOnNextRebuild=true;
 if(storedSignature!==undefined){
  clearTimeout(generationTimer);rebuild();
  openedVersion={stored:storedSignature,working:projectFiles.signature('stitch',projectSnapshot(),events)};
 }else queueRebuild();
 setStatus('Project restored','success');return true;}
 catch(e){alertMessage('Could not open project: '+e.message,true);return false;}}

/* AI Mockups: the precise stitch instructions stay unchanged. Images are editorial concepts. */
let aiLastImage=null,aiReferenceImage=null,aiBusy=false;
function aiServerBase(){return location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname)?'':null;}
function aiSetStatus(msg,err=false){$('ai-result-status').textContent=msg;$('ai-result-status').style.color=err?'#a04739':'#315944';}
function aiShowComparison(){ $('ai-result').hidden=false;$('ai-result').scrollIntoView({behavior:'smooth',block:'center'}); }
function aiSettingsSummary(){
 const st=getSettings(),b=calcBounds(events),s=events.filter(v=>v.type==='stitch').length;
 $('ai-configuration').textContent=`${b.w.toFixed(1)} × ${b.h.toFixed(1)} mm · ${s.toLocaleString()} stitches · ${previewThread} thread · ${previewFabric} fabric · ${st.style} · ${st.spacing.toFixed(2)} mm fill rows${st.crossEnabled?' · crosshatch':''} · ${st.underlayType} underlay · ${selectedMachineHoop} hoop`;
}
function aiCaptureCurrent(){
 const oldMode=previewMode,oldZoom=viewZoom,oldScrub=$('seq-scrub').value,oldSimCursor=simCursor;
 try{
  previewMode='realistic';viewZoom=1;$('seq-scrub').value=1000;simCursor=events.length;cleanCapture=true;render();
  const output=document.createElement('canvas');output.width=1024;output.height=768;
  const oc=output.getContext('2d');oc.fillStyle='#e9e2d4';oc.fillRect(0,0,1024,768);
  const ratio=Math.min(1024/canvas.width,768/canvas.height),w=canvas.width*ratio,h=canvas.height*ratio;
  oc.drawImage(canvas,(1024-w)/2,(768-h)/2,w,h);
  return output.toDataURL('image/png');
 }finally{cleanCapture=false;previewMode=oldMode;viewZoom=oldZoom;$('seq-scrub').value=oldScrub;simCursor=oldSimCursor;render();}
}
function aiGetReference(){const url=aiCaptureCurrent();aiReferenceImage=url;$('ai-source-preview').src=url;return url;}
function aiCollectRequest(){
 const st=getSettings(),bb=calcBounds(events);
 const styles=mode==='image'?objects.filter(o=>o.enabled).slice(0,300).map(o=>({style:o.style,angle:o.angle,spacing:o.spacing,border:o.borderEnabled?{width:o.borderWidth,placement:o.borderPosition}:null})):[];
 return {image:aiGetReference(), scene:$('ai-scene').value,placement:$('ai-placement').value,accuracy:$('ai-accuracy').value,model:$('ai-model').value,
  fabric:previewFabric,thread:previewThread,garment:st.fabricType,stitchMethod:st.style,crosshatch:st.crossEnabled,fillAngle:st.fillAngle,
  size_mm:[Math.round(bb.w*10)/10,Math.round(bb.h*10)/10],objectStyles:styles, lettering:textLayers.map(t=>t.content).filter(Boolean).join(' ').slice(0,150),
  extras:$('ai-extra').value.trim().slice(0,450),uprightEmblem:$('ai-upright-emblem').checked};
}
async function aiHealth(){
 try{if(aiServerBase()===null)throw new Error('Open this editor through the local server for AI mockups.');
 const r=await fetch('/api/health',{cache:'no-store'});if(!r.ok)throw new Error('Server unavailable');const j=await r.json();
 $('ai-connection').textContent=j.ai_ready?'AI server connected. Your API key stays on your computer; the current reference image will be sent only when you press Generate.':'Local server is running without an API key. Restart it and enter an API key to enable generation.';
 $('ai-connection').classList.toggle('ok',!!j.ai_ready);return !!j.ai_ready;
 }catch(e){$('ai-connection').classList.remove('ok');$('ai-connection').textContent='AI generation needs the ZIP package’s local Python server. Open the HTML through http://127.0.0.1:7867/. The editor remains usable offline.';return false;}
}
async function aiGenerate(){
 if(aiBusy)return;
 aiSettingsSummary();const req=aiCollectRequest();aiShowComparison();
 if(!await aiHealth()){aiSetStatus('AI service not connected. Start NOMU_AI_Server.py from the ZIP with an OpenAI API key to generate a render.',true);return;}
 aiBusy=true;$('ai-generate').disabled=true;$('ai-generate').textContent='Generating image…';aiSetStatus('Generating an image from the configured design and selected garment.');
 try{
  const res=await fetch('/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req)});
  const json=await res.json();if(!res.ok||!json.image)throw new Error(json.error||'No image was returned.');
  aiLastImage='data:image/png;base64,'+json.image;
  $('ai-result-preview').src=aiLastImage;$('ai-result-preview').hidden=false;$('ai-image-placeholder').hidden=true;$('ai-save-render').disabled=false;
  aiSetStatus(`Generated from ${req.size_mm.join(' × ')} mm stitch reference · ${req.scene} · ${req.thread} thread on ${req.fabric}. Concept visualization; not a physical stitch guarantee.`);
 }catch(e){aiSetStatus('AI rendering failed: '+e.message,true);}
 finally{aiBusy=false;$('ai-generate').disabled=false;$('ai-generate').textContent='Generate AI mockup';}
}
function aiDownloadReference(){const url=aiReferenceImage||aiGetReference();const a=document.createElement('a');a.href=url;a.download=filename('png').replace('.png','_AI_REFERENCE.png');a.click();}
function aiDownloadResult(){if(!aiLastImage)return;const a=document.createElement('a');a.href=aiLastImage;a.download=filename('png').replace('.png','_AI_MOCKUP.png');a.click();}
function aiBindControls(){
 $('ai-generate').addEventListener('click',aiGenerate);
 $('ai-open-result').addEventListener('click',()=>{aiSettingsSummary();aiGetReference();aiShowComparison();aiSetStatus('Current configured stitches. AI render available after connecting local server.');});
 $('ai-reference-download').addEventListener('click',aiDownloadReference);
 $('ai-save-reference').addEventListener('click',aiDownloadReference);
 $('ai-save-render').addEventListener('click',aiDownloadResult);
 $('ai-close-result').addEventListener('click',()=>{$('ai-result').hidden=true;});
 $('ai-scene').addEventListener('change',()=>{if($('ai-scene').value==='cap')$('ai-placement').value='center front';});
 aiHealth();
}

// 500E LE SEW-OUT SIMULATION: estimates are modeled, never firmware-derived times.
let simCursor=0,simElapsed=0,simTotalSeconds=0,simPlaying=false,simLastFrame=0,simLastDraw=0;
let simTimes=new Float64Array(1),simStitches=new Uint32Array(1),simActiveStitches=0,simBreakdown=null;
let simRaf=0,simUiWired=false;
function simFormat(seconds){if(!Number.isFinite(seconds))return '—';let s=Math.max(0,Math.round(seconds));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=s%60;return h?`${h}h ${String(m).padStart(2,'0')}m ${String(sec).padStart(2,'0')}s`:`${m}m ${String(sec).padStart(2,'0')}s`;}
function simInputs(){return {spm:+$('sim-machine-speed').value||600,util:(+$('sim-efficiency').value||80)/100,trim:+$('sim-trim-seconds').value||0,color:+$('sim-color-seconds').value||0};}
function stopSimulation(){if(simRaf)cancelAnimationFrame(simRaf);simRaf=0;simPlaying=false;simLastFrame=0;const b=$('sim-play');if(b){b.textContent='▶ Play';b.setAttribute('aria-label','Play stitch simulation');}}
function recalculateSimTimes(){
 const p=simInputs(),trimLimit=Number($('seq-trim').value),base=60/(p.spm*p.util);
 simTimes=new Float64Array(events.length+1);simStitches=new Uint32Array(events.length+1);
 let t=0,stitches=0,jumps=0,trimCount=0,colorCount=0,manualTime=0,travelTime=0;let prev={x:0,y:0};
 for(let i=0;i<events.length;i++){
  const e=events[i];
  if(e.type==='color'){colorCount++;t+=p.color;manualTime+=p.color;}
  else if(e.type==='stitch'){stitches++;t+=base;prev=e;}
  else if(e.type==='jump'){
   jumps++;const d=Math.hypot(e.x-prev.x,e.y-prev.y);
   // The Janome manual provides no travel-speed specification; use an explicit provisional model.
   const dt=.08+d/150;travelTime+=dt;t+=dt;
   if(trimLimit>0&&d>=trimLimit){trimCount++;t+=p.trim;}
   prev=e;
  }
  simTimes[i+1]=t;simStitches[i+1]=stitches;
 }
 simTotalSeconds=t;simActiveStitches=stitches;
 const sew=stitches*base,trims=trimCount*p.trim;
 simBreakdown={sew,travel:travelTime,trims,colors:manualTime,trimCount,jumps,colorCount,stitches,rawMinimum:stitches*60/p.spm};
 if(simCursor>events.length)simCursor=events.length;
 simElapsed=simTimes[simCursor]||0;
 updateSimulationUI();
}
function simEventForTime(sec){let lo=0,hi=simTimes.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(simTimes[mid]<=sec)lo=mid;else hi=mid-1;}return lo;}
function simSetCursor(next,redraw=true){simCursor=Math.max(0,Math.min(events.length,Math.floor(next)));simElapsed=simTimes[simCursor]||0;updateSimulationUI();if(redraw)render();}
function updateSimulationUI(){
 const p=events.length?simCursor/events.length:1;
 $('seq-scrub').value=Math.round(p*1000);$('seq-scrub-out').textContent=(100*p).toFixed(1)+'%';
 $('sim-time-total').textContent=simFormat(simTotalSeconds);
 $('sim-time-remaining').textContent=simFormat(simTotalSeconds-simElapsed);
 $('sim-count').textContent=(simStitches[simCursor]||0).toLocaleString()+' / '+simActiveStitches.toLocaleString();
 $('sim-current-percent').textContent=(100*p).toFixed(1)+'%';$('sim-progress-fill').style.width=(100*p).toFixed(2)+'%';
 const b=simBreakdown;
 if(b)$('sim-time-breakdown').innerHTML=`<div><span>Needle sewing</span><strong>${simFormat(b.sew)}</strong></div><div><span>Jump travel (${b.jumps}) · provisional</span><strong>${simFormat(b.travel)}</strong></div><div><span>Likely trims (${b.trimCount}) · modeled</span><strong>${simFormat(b.trims)}</strong></div><div><span>Color-change pauses (${b.colorCount})</span><strong>${simFormat(b.colors)}</strong></div><div style="margin-top:4px;border-top:1px solid #e1ebe3;padding-top:5px"><span>Theoretical sewing floor at max speed</span><strong>${simFormat(b.rawMinimum)}</strong></div>`;
 $('sim-efficiency-out').textContent=$('sim-efficiency').value+'% of maximum';
 $('sim-trim-seconds-out').textContent=Number($('sim-trim-seconds').value).toFixed(1)+' seconds';
 $('sim-color-seconds-out').textContent=$('sim-color-seconds').value+' seconds';
}
function resetSimulationForRebuild(){stopSimulation();simCursor=events.length;recalculateSimTimes();}
function simFrame(now){
 if(!simPlaying)return;
 if(!simLastFrame)simLastFrame=now;
 const dt=Math.min(.25,Math.max(0,(now-simLastFrame)/1000));simLastFrame=now;
 simElapsed=Math.min(simTotalSeconds,simElapsed+dt*(+$('sim-playback-rate').value||1));
 simCursor=simEventForTime(simElapsed);
 if(now-simLastDraw>=85||simCursor>=events.length){simLastDraw=now;updateSimulationUI();render();}
 if(simCursor>=events.length){stopSimulation();updateSimulationUI();render();return;}
 simRaf=requestAnimationFrame(simFrame);
}
function startSimulation(){if(!events.length)return;if(simPlaying){stopSimulation();return;}if(simCursor>=events.length)simSetCursor(0);
 simPlaying=true;simLastFrame=0;simLastDraw=0;$('sim-play').textContent='Ⅱ Pause';$('sim-play').setAttribute('aria-label','Pause stitch simulation');simRaf=requestAnimationFrame(simFrame);
}
function simStep(forward){stopSimulation();let next=simCursor;
 if(forward){do{next++;}while(next<events.length&&events[next-1]?.type!=='stitch');}
 else {do{next--;}while(next>0&&events[next-1]?.type!=='stitch');}
 simSetCursor(next);
}
function bindSimulationControls(){if(simUiWired)return;simUiWired=true;
 $('seq-scrub').addEventListener('input',()=>{stopSimulation();simSetCursor(events.length*(+$('seq-scrub').value/1000));});
 $('sim-play').addEventListener('click',startSimulation);
 $('sim-reset').addEventListener('click',()=>{stopSimulation();simSetCursor(0);});
 $('sim-end').addEventListener('click',()=>{stopSimulation();simSetCursor(events.length);});
 $('sim-back').addEventListener('click',()=>simStep(false));$('sim-next').addEventListener('click',()=>simStep(true));
 for(const k of ['sim-machine-speed','sim-efficiency','sim-trim-seconds','sim-color-seconds'])$(k).addEventListener('input',()=>{stopSimulation();const ratio=events.length?simCursor/events.length:1;recalculateSimTimes();simSetCursor(Math.round(events.length*ratio),false);});
 $('seq-trim').addEventListener('change',()=>{const ratio=events.length?simCursor/events.length:1;recalculateSimTimes();simSetCursor(Math.round(events.length*ratio),false);});
 $('sim-playback-rate').addEventListener('change',()=>{simLastFrame=0;});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSimulation();});
 recalculateSimTimes();
}

function bindControls(){
 let previewFrame=0;
 $('panel-stitches').addEventListener('input',()=>{
  if(previewFrame)return;
  previewFrame=requestAnimationFrame(()=>{
   previewFrame=0;syncStitchPicker('stitch-style');
   if(selectedObject>0)syncStitchPicker('shape-style');
   syncPartReview();
  });
 });
 $('line-width').addEventListener('input',()=>syncStitchPicker('line-style'));
 $('line-style').addEventListener('input',()=>{syncStitchPicker('line-style');queueRebuild();});
 $('line-width').addEventListener('input',()=>{updateNumbers();queueRebuild();});
 aiBindControls();bindLayerControls();bindStitchOrder();bindPartReview();bindNotes();
 document.querySelectorAll('#stitch-lab .view-switch [data-view]').forEach(b=>b.addEventListener('click',()=>{previewMode=b.dataset.view;syncViewButtons();}));
 $('preview-fabric').addEventListener('change',e=>{previewFabric=e.target.value;render();if(currentTab==='ai')aiSettingsSummary();});
 $('preview-thread').addEventListener('change',e=>{previewThread=e.target.value;scheduleRecentSave();render();if(currentTab==='ai')aiSettingsSummary();});
 $('preview-original').addEventListener('change',e=>{previewOriginal=e.target.checked;scheduleRecentSave();render();});
 $('preview-thickness').addEventListener('input',e=>{previewThickness=+e.target.value;$('preview-thickness-label').textContent=previewThickness.toFixed(2)+' mm';render();});
 $('download-preview').addEventListener('click',downloadPreviewPng);
 for(const [id,target] of [['inspect-stitches','travel-audit'],['inspect-jumps','fv26-optimize-plan']]){
  $(id).addEventListener('click',()=>{
   window.FervorStitchInspector?.(true);switchTab('order');
   requestAnimationFrame(()=>{$(target).scrollIntoView({block:'center'});$(target).focus({preventScroll:true});});
  });
 }
 for(const id of ['cross-enabled','cross-spacing','cross-angle','cross-mode','seq-connect','seq-max-link','seq-order','seq-trim'])$(id).addEventListener('input',()=>{updateNumbers();queueRebuild();});
 bindSimulationControls();
 $('seq-visualize').addEventListener('click',()=>{$('show-jumps').checked=!$('show-jumps').checked;$('seq-visualize').textContent=$('show-jumps').checked?'Hide jump paths in preview':'Show travel paths in preview';render();});
 $('physical-hoop').addEventListener('change',e=>{selectedMachineHoop=e.target.value;updateMachinePanel();render();});
 $('machine-inspect').addEventListener('click',()=>{updateMachinePanel();alertMessage(readiness.ok?'Design fits selected physical hoop dimensions; machine and fabric sew-out remain untested.':readiness.hard.join(' '),!readiness.ok);});for(let [key,el] of Object.entries(UI)){
 if(key==='sizeNumber')continue;
 el.addEventListener('input',()=>{if(key==='style')syncStitchPicker('stitch-style');if(key==='width'){UI.sizeNumber.value=UI.width.value;}if(key==='threshold'&&mode==='image'){thresholdSource(true);undoStack=[];}updateNumbers();if(key==='showJumps'||key==='showArt'||key==='showHoop'||key==='showSequence'){renderOrderList();render();}else queueRebuild();});}
 UI.sizeNumber.addEventListener('change',()=>{UI.width.value=Math.max(20,Math.min(200,parseFloat(UI.sizeNumber.value)||104));UI.sizeNumber.value=UI.width.value;updateNumbers();queueRebuild();});
 $('file-input').addEventListener('change',async e=>{await handleUpload(e.target.files[0]);e.target.value='';});
 bindRecentDesigns();
 $('open-file').addEventListener('click',()=>$('file-input').click());$('sample-file').addEventListener('click',()=>{stitchOrderKeys=[];setSettings(DEFAULTS);loadImage(window.NOMU_SAMPLE,'GALLOP_NOMU');});
 $('btn-digitize').addEventListener('click',()=>rebuild());$('export-jef').addEventListener('click',doExportJef);$('export-svg').addEventListener('click',doExportSvg);$('export-project').addEventListener('click',exportProject);
 $('undo').addEventListener('click',undo);$('redo').addEventListener('click',redo);$('clear-lines').addEventListener('click',()=>{manual=[];activeStroke=null;selectedNode=null;queueRebuild();});
 $('fv-node-round').onclick=fvNodeToggleRound;
 $('fv-node-radius').oninput=e=>{fvNodeRadius=+e.target.value;$('fv-node-radius-out').textContent=fvNodeRadius+' mm';render();};
 $('fv-node-strength').oninput=e=>{fvNodeStrength=+e.target.value/100;$('fv-node-strength-out').textContent=e.target.value+'%';};
 canvas.addEventListener('pointerleave',()=>{if(!fvNodeDrag){fvNodePointer=null;if(tool==='nodes')render();}});
 $('fv-node-start').onclick=fvStartCurrentNode;
 $('fv-start-reset').onclick=()=>fvUpdateStart(fvStartPart(),null);
 $('fv-start-done').onclick=()=>setTool('select');
 $('sl-order').onclick=()=>{window.FervorStitchInspector?.(true);switchTab('order');};
 $('sl-audit').onclick=()=>$('inspect-stitches').click();
 $('fv-node-insert').onclick=()=>fvNodeInsert();$('fv-node-delete').onclick=fvNodeDelete;$('fv-node-smooth').onclick=fvNodeSmooth;$('fv-node-done').onclick=()=>{setTool('select');render();};
 $('finish-line').addEventListener('click',finishLine);document.querySelectorAll('[data-tool]').forEach(e=>e.addEventListener('click',()=>setTool(e.dataset.tool)));
 $('notice-close').addEventListener('click',dismissMessage);
 $('jump-to-text').addEventListener('click',()=>{window.FervorStitchInspector?.(true);switchTab('text');$('text-content').focus({preventScroll:true});});
 $('guide').addEventListener('click',()=>{if(window.FervorHelp)window.FervorHelp.open('stitch',$('guide'));else $('guide-modal').showModal();});$('guide-close').addEventListener('click',()=>$('guide-modal').close());
 $('fv23-invert').addEventListener('change',()=>{if(mode==='image'&&sourceImage){thresholdSource(true);undoStack=[];updateObjects(true);queueRebuild();alertMessage($('fv23-invert').checked?'Stitching light pixels: inverse artwork enabled. Check large background fills before exporting.':'Standard dark-pixel stitching restored.');}else alertMessage('Inverse embroidery applies to imported raster artwork; existing JEF and PES files contain finished needle paths.',true);});
 $('sample-file').title='Load the three-horse artwork from this conversation';
 // Fit controls use the actual physical hoop dimensions, not merely the design footprint.
 // The zoom % is relative to the app's natural fit-to-artwork view.
 function fvUpdateZoom(){const z=$('zoom-value');if(z)z.textContent=Math.round(viewZoom*100)+'%';render();}
 function fvDesignBaseScale(){
  const W=canvas.width,H=canvas.height,s=getSettings(),b=calcBounds(events);
  let visualWidth=mode==='image'?s.width:Math.max(1,s.width);
  let visualHeight=mode==='image'?s.width*(maskCanvas.height/Math.max(maskCanvas.width,1)):s.width*(originalBounds.height/Math.max(originalBounds.width,1));
  const extent=Math.max(Math.max(b.w,visualWidth),48),eHeight=Math.max(Math.max(b.h,visualHeight),24);
  return Math.min((W-75)/Math.max(extent+12,90),(H-75)/Math.max(eHeight+12,55));
 }
 function fvFitHoop(){viewPan={x:0,y:0};
  const hoop=PHYSICAL_HOOPS[selectedMachineHoop]||PHYSICAL_HOOPS.RE20b;
  const target=Math.min((canvas.width-140)/hoop[0],(canvas.height-130)/hoop[1]);
  viewZoom=Math.max(.04,Math.min(5,target/Math.max(.001,fvDesignBaseScale())));
  fvUpdateZoom();return {hoop:selectedMachineHoop,zoom:viewZoom,dimensions:hoop};
 }
 function fvFitDesign(){viewZoom=1;viewPan={x:0,y:0};fvUpdateZoom();return viewZoom;}
 window.FervorZoom={fitHoop:fvFitHoop,fitDesign:fvFitDesign,getZoom:()=>viewZoom,getPan:()=>({...viewPan}),panBy:setPan};
 $('zoom-in').addEventListener('click',()=>{viewZoom=Math.min(6,viewZoom*1.25);fvUpdateZoom();});
 $('zoom-out').addEventListener('click',()=>{viewZoom=Math.max(.04,viewZoom/1.25);fvUpdateZoom();});
 $('zoom-reset').addEventListener('click',fvFitDesign);
 canvas.addEventListener('wheel',e=>{e.preventDefault();if(e.ctrlKey||e.metaKey){const rect=canvas.getBoundingClientRect(),mx=(e.clientX-rect.left)*canvas.width/rect.width,my=(e.clientY-rect.top)*canvas.height/rect.height,ratio=Math.exp(-e.deltaY*.003);const beforeScale=display.scale;viewZoom=Math.max(.04,Math.min(6,viewZoom*ratio));const afterScale=beforeScale*ratio;viewPan.x=(mx-canvas.width/2)-(mx-canvas.width/2-viewPan.x)*afterScale/Math.max(.001,beforeScale);viewPan.y=(my-canvas.height/2)-(my-canvas.height/2-viewPan.y)*afterScale/Math.max(.001,beforeScale);fvUpdateZoom();}else{const r=canvas.getBoundingClientRect(),k=e.deltaMode===1?18:e.deltaMode===2?canvas.height:1;setPan(-e.deltaX*k*canvas.width/r.width,-e.deltaY*k*canvas.height/r.height);}},{passive:false});
 window.addEventListener('keydown',e=>{
  if(window.FervorStitchKeys&&!window.FervorStitchKeys())return;
  if(e.altKey||e.ctrlKey||e.metaKey||e.target?.matches?.('input,textarea,select,[contenteditable]'))return;
  if(e.key==='0'){fvFitDesign();e.preventDefault();}
  else if(e.key.toLowerCase()==='h' && !e.shiftKey){fvFitHoop();e.preventDefault();}
 });

 $('border-object-select').addEventListener('change',e=>selectObject(+e.target.value));
 $('border-width-mm').addEventListener('change',()=>{const n=+$('border-width-mm').value;if(!Number.isFinite(n))return; $('border-width').value=Math.min(6,Math.max(.6,n));$('border-width').dispatchEvent(new Event('input',{bubbles:true}));});
 const borderUpdate=()=>{const o=objects[selectedObject-1];if(!o)return;
  o.borderEnabled=$('border-enabled').checked;o.borderWidth=+$('border-width').value;o.borderStep=+$('border-step').value;o.borderPatterns=readPatterns('border-stitch-style');o.borderPosition=$('border-position').value;o.borderOnly=$('border-only').checked;o.borderUnderlay=$('border-underlay').checked;
  syncBorderControls();queueRebuild();};
 for(const id of ['border-enabled','border-width','border-step','border-position','border-only','border-underlay','border-stitch-style'])$(id).addEventListener('input',borderUpdate);
 $('border-apply-all').addEventListener('click',()=>{if(mode!=='image')return alertMessage('Satin borders need source artwork with editable objects.',true);
  const chosen=objects[selectedObject-1];const opt={borderWidth:chosen?.borderWidth??+$('border-width').value,borderStep:chosen?.borderStep??+$('border-step').value,borderPatterns:chosen?.borderPatterns||readPatterns('border-stitch-style'),borderPosition:chosen?.borderPosition??$('border-position').value,borderOnly:chosen?.borderOnly??$('border-only').checked,borderUnderlay:chosen?.borderUnderlay??$('border-underlay').checked};
  for(const o of objects)if(o.enabled){Object.assign(o,opt);o.borderEnabled=true;}syncBorderControls();queueRebuild();alertMessage(`Satin border applied to ${objects.filter(o=>o.enabled).length} visible shapes. Review fine details before exporting.`);
 });
 $('border-clear-all').addEventListener('click',()=>{for(const o of objects){o.borderEnabled=false;o.borderOnly=false;}syncBorderControls();queueRebuild();});
 $('split-text').addEventListener('click',splitTextIntoLetters);
 $('text-font').addEventListener('input',e=>{if(e.target.value==='trebuchet')$('text-style').value='outline';});
 $('text-character').addEventListener('change',e=>{
  const input=$('text-content'),symbol=e.target.value;if(!symbol)return;
  const start=input.selectionStart,end=input.selectionEnd;
  if(input.value.length-(end-start)+symbol.length<=input.maxLength){
   input.setRangeText(symbol,start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));
  }
  e.target.value='';input.focus();
 });
 $('text-select').addEventListener('change',e=>selectText(+e.target.value-1));
 $('add-text').addEventListener('click',()=>addText());
 $('remove-text').addEventListener('click',()=>{
  if(selectedText<0)return;
  captureLayerUndo();textLayers.splice(selectedText,1);selectText(-1);queueRebuild();
  $('text-feedback').textContent='Removed lettering layer.';
 });
 $('duplicate-text').addEventListener('click',()=>{
  const t=textLayers[selectedText];if(!t)return;
  captureLayerUndo();textLayers.push({...t,noteAnchor:undefined,x:t.x+3,y:t.y+3});selectText(textLayers.length-1);queueRebuild();
 });
 const undoArmed=new WeakSet();
 for(const id of [...TEXT_INPUTS,'text-micro-run']){
  const input=$(id);
  input.addEventListener('input',()=>{
   updateTextLabels();
   if(selectedText<0)return;
   if(!undoArmed.has(input)){captureLayerUndo();undoArmed.add(input);}
   Object.assign(textLayers[selectedText],readTextFields());if(currentTab==='layers')refreshLayerList();refreshTextPicker();queueRebuild();
  });
  input.addEventListener('change',()=>undoArmed.delete(input));
  input.addEventListener('blur',()=>undoArmed.delete(input));
 }
 updateTextLabels();
 $('shape-select').addEventListener('change',e=>selectObject(+e.target.value));
 const shapeUpdate=()=>{const o=objects[selectedObject-1];if(!o)return;o.enabled=$('shape-enabled').checked;o.style=$('shape-style').value;o.patterns=readPatterns('shape-style');o.angle=+$('shape-angle').value;o.spacing=+$('shape-spacing').value;o.dx=+$('shape-x').value;o.dy=+$('shape-y').value;o.scale=+$('shape-scale').value;syncObjectControls();queueRebuild();};
 for(let k of ['shape-enabled','shape-style','shape-angle','shape-spacing','shape-x','shape-y','shape-scale'])$(k).addEventListener('input',shapeUpdate);
 $('garment-select').addEventListener('change',e=>{garment=e.target.value;if(vectorHandoff&&editableVectorLayers().length){resizeVectorDesign(garment==='cap'?100:160);queueRebuild();return;}if(garment==='cap'){UI.width.value=100;UI.spacing.value=.48;UI.length.value=2.8;}
 else{UI.width.value=160;UI.spacing.value=.55;UI.length.value=3.2;}UI.sizeNumber.value=UI.width.value;updateNumbers();queueRebuild();});
 $('fabric-type').addEventListener('change',e=>{
  const profiles={
   'structured-cap':{spacing:.5,pull:.20,underlay:'auto'},
   'woven':{spacing:.55,pull:.15,underlay:'edge'},
   'knit':{spacing:.52,pull:.35,underlay:'edge'},
   'fleece':{spacing:.48,pull:.40,underlay:'tatami'}
  };const p=profiles[e.target.value];if(!p)return;
  UI.spacing.value=p.spacing;$('pull-comp').value=p.pull;$('underlay-type').value=p.underlay;
  updateNumbers();queueRebuild();alertMessage('Loaded starting values for '+e.target.options[e.target.selectedIndex].text+'. Fabric performance must be checked with a physical stitch-out.');
 });
 for(const id of ['underlay-type','pull-comp','satin-direction','satin-overlap'])$(id).addEventListener('input',()=>{updateNumbers();queueRebuild();});
 $('min-area').addEventListener('input' ,e=>{smallArea=+e.target.value;$('min-area-out').textContent=smallArea.toFixed(2)+' mm²';queueRebuild();});
 $('preset-crisp').addEventListener('click',()=>{UI.spacing.value=.42;UI.length.value=2.3;$('underlay-type').value='edge';updateNumbers();queueRebuild();});
 $('preset-fast').addEventListener('click',()=>{UI.spacing.value=.75;UI.length.value=3.8;$('underlay-type').value='none';updateNumbers();queueRebuild();});
 $('vector-design-width').addEventListener('change',({target})=>{
  if(resizeVectorDesign(target.valueAsNumber))target.value=Number(target.value);
  else{const bounds=vectorDesignBounds(editableVectorLayers());target.value=(bounds.maxx-bounds.minx).toFixed(1);}
 });
 $('quick-cap-width').addEventListener('click',()=>{garment='cap';$('garment-select').value='cap';if(vectorHandoff&&editableVectorLayers().length){resizeVectorDesign(90);queueRebuild();return;}UI.width.value=90;UI.sizeNumber.value=90;updateNumbers();queueRebuild();});

}

/* v1.9 / Shape and symbol creation. Objects become editable stitched layers,
   not raster-only decorations. Shapes are approximations: test stitch-out. */
function createPolyVertexSet(kind){
 const ring=(n,turn=-Math.PI/2)=>Array.from({length:n},(_,i)=>{let a=turn+i*Math.PI*2/n;return {x:.5*Math.cos(a),y:.5*Math.sin(a)};});
 if(kind==='rectangle')return [{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}];
 if(kind==='circle')return ring(72);
 if(kind==='triangle')return ring(3);
 if(kind==='diamond')return ring(4,-Math.PI/2);
 if(kind==='hexagon')return ring(6);
 if(kind==='star'||kind==='spark'){let vertices=kind==='spark'?4:5,inner=kind==='spark'?.13:.22;return Array.from({length:vertices*2},(_,i)=>{let a=-Math.PI/2+i*Math.PI/vertices,r=i%2?inner:.5;return{x:r*Math.cos(a),y:r*Math.sin(a)};});}
 if(kind==='heart')return Array.from({length:80},(_,i)=>{const a=i*Math.PI*2/80;return{x:(16*Math.sin(a)**3)/36,y:-(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a))/36};});
 if(kind==='arrow')return [{x:-.5,y:-.16},{x:.16,y:-.16},{x:.16,y:-.36},{x:.5,y:0},{x:.16,y:.36},{x:.16,y:.16},{x:-.5,y:.16}];
 if(kind==='cross')return [{x:-.17,y:-.5},{x:.17,y:-.5},{x:.17,y:-.17},{x:.5,y:-.17},{x:.5,y:.17},{x:.17,y:.17},{x:.17,y:.5},{x:-.17,y:.5},{x:-.17,y:.17},{x:-.5,y:.17},{x:-.5,y:-.17},{x:-.17,y:-.17}];
 if(kind==='lightning')return [{x:.02,y:-.5},{x:-.30,y:.06},{x:.02,y:.06},{x:-.08,y:.5},{x:.36,y:-.12},{x:.09,y:-.12},{x:.24,y:-.5}];
 return null;
}
function createStitchedShape(kind,ww=null,hh=null,outline=null){
 const raw=createPolyVertexSet(kind);if(!raw&&kind!=='line'){alertMessage('Shape not supported.',true);return false;}
 const w=Math.min(150,Math.max(3,Number(ww??$('create-width').value)||20));
 const h=Math.min(150,Math.max(3,Number(hh??$('create-height').value)||20));
 const borderOnly=outline===null?$('create-outline-only').checked:outline;
 // Imported stitch coordinates use the same coordinate system as the current design.
 // In image mode world millimeters are direct. JEF mode stores native import coordinates.
 const factor=mode==='jef'?originalBounds.width/Math.max(.1,getSettings().width):1;
 const line=kind==='line';
 const poly=line?[{x:-w*factor/2,y:-h*factor/2},{x:w*factor/2,y:h*factor/2}]:raw.map(p=>({x:p.x*w*factor,y:p.y*h*factor}));
 if(!line)poly.push({...poly[0]});
 const source={kind:line?'line':'fill',rings:[poly],physical:true};
 const recipe={type:line||borderOnly?'outline':'fill',outline:!line&&!borderOnly,spacing:.55,stitch:2.7,run:1.7,pull:0,underlay:false};
 const L=makeJefLayer([poly],0,kind.charAt(0).toUpperCase()+kind.slice(1));
 L.threadCode=palette[0]??1;L.fvSource=source;L.fvRecipe=recipe;
 if(!fvRegenerateLayer(L))return false;
 captureLayerUndo();
 jefLayers.push(L);selectedParts=new Set([partKey('jef',L.id)]);
 selectionSync();refreshLayerList();queueRebuild();
 alertMessage(`Added ${kind}. Select it on the canvas or open Layers to move, resize, rotate, hide, or delete it. Stitch layout is experimental; test on scrap.`);
 return true;
}
let createPendingActions=[];
function createAnalyzeInstruction(input){
 const actions=[],unhandled=[];let remaining=input.trim();
 function take(regex,func){remaining=remaining.replace(regex,(all,...groups)=>{func(...groups);return ' ';});}
 take(/(?:set\s+)?(?:design\s+)?width\s*(?:to|=|:)?\s*(\d{2,3}(?:\.\d+)?)\s*(?:mm|millimeters)?/gi,n=>actions.push({type:'width',value:+n,label:`Set design width to ${n} mm`}));
 take(/(?:rotate\s+(?:design\s+)?(?:by\s+)?)([-+]?\d{1,3})(?:\s*°|\s*degrees)?/gi,n=>actions.push({type:'rotate',value:+n,label:`Rotate entire design by ${n}°`}));
 take(/(?:denser\s+fill|increase\s+(?:fill\s+)?density|tighten\s+fill)/gi,()=>actions.push({type:'density',value:-.10,label:'Reduce fill spacing by 0.10 mm'}));
 take(/(?:lighter\s+fill|reduce\s+(?:fill\s+)?density|less\s+dense)/gi,()=>actions.push({type:'density',value:.10,label:'Increase fill spacing by 0.10 mm'}));
 take(/(?:fill\s+spacing\s*(?:to|=|:)?\s*)(0?\.\d+|1(?:\.\d+)?)\s*(?:mm)?/gi,n=>actions.push({type:'spacing',value:+n,label:`Set fill spacing to ${n} mm`}));
 take(/(?:use\s+)?(?:tatami\s+fill|fill\s+only)/gi,()=>actions.push({type:'style',value:'fill',label:'Use tatami fill'}));
 take(/(?:use\s+)?(?:running\s+outline\s+only|outline\s+only)/gi,()=>actions.push({type:'style',value:'outline',label:'Use running outline for artwork'}));
 take(/(?:hide|remove|turn\s+off)\s+(?:the\s+)?(?:stitch\s+)?order\s+numbers/gi,()=>actions.push({type:'numbers',value:false,label:'Hide order numbers'}));
 take(/(?:show|turn\s+on)\s+(?:the\s+)?(?:stitch\s+)?order\s+numbers/gi,()=>actions.push({type:'numbers',value:true,label:'Show order numbers'}));
 take(/(?:hide|turn\s+off)\s+(?:the\s+)?hoop\s+outline/gi,()=>actions.push({type:'hoop',value:false,label:'Hide hoop outline'}));
 take(/(?:show|turn\s+on)\s+(?:the\s+)?hoop\s+outline/gi,()=>actions.push({type:'hoop',value:true,label:'Show hoop outline'}));
 take(/(?:add|insert|draw|create)\s+(?:a\s+|an\s+)?(rectangle|circle|triangle|diamond|hexagon|line|star|heart|arrow|cross|spark|lightning)/gi,kind=>actions.push({type:'shape',value:kind.toLowerCase(),label:`Insert ${kind.toLowerCase()}`}));
 take(/(?:add\s+)?(?:text|lettering)\s*[:=]?\s*[“"']([^“"']{1,40})[”"']/gi,word=>actions.push({type:'text',value:word.trim(),label:`Add stitched lettering: ${word.trim()}`}));
 const leftovers=remaining.replace(/\b(and|then|please|the|a|an|to|make|set|use|also|with)\b/gi,'').replace(/[.,;!\s]+/g,' ').trim();
 if(leftovers)unhandled.push(`Not understood: ${leftovers.slice(0,160)}`);
 return {actions,unhandled};
}
function createPreviewInstruction(){
 const input=$('create-prompt').value;const result=createAnalyzeInstruction(input);createPendingActions=result.actions;
 const panel=$('create-prompt-result');panel.replaceChildren();panel.hidden=false;
 const head=document.createElement('strong');head.textContent=result.actions.length?`${result.actions.length} change(s) ready for review`:'No supported changes found';panel.append(head);
 if(result.actions.length){const ul=document.createElement('ul');for(const a of result.actions){const li=document.createElement('li');li.textContent=a.label;ul.append(li);}panel.append(ul);}
 if(result.unhandled.length){const p=document.createElement('p');p.className='unsupported';p.textContent=result.unhandled.join(' • ');panel.append(p);}
 $('create-apply').hidden=!result.actions.length;
}
function createApplyInstruction(){
 if(!createPendingActions.length)return;
 let changed=false,unknown=[];
 for(const a of createPendingActions){switch(a.type){
  case 'width':if(vectorHandoff&&editableVectorLayers().length){changed=resizeVectorDesign(a.value)||changed;break;}UI.width.value=Math.max(20,Math.min(200,a.value));UI.sizeNumber.value=UI.width.value;changed=true;break;
  case 'rotate':UI.angle.value=Math.max(-180,Math.min(180,+UI.angle.value+a.value));changed=true;break;
  case 'density':UI.spacing.value=Math.max(.35,Math.min(1.4,+UI.spacing.value+a.value));changed=true;break;
  case 'spacing':UI.spacing.value=Math.max(.35,Math.min(1.4,a.value));changed=true;break;
  case 'style':UI.style.value=a.value;changed=true;break;
  case 'numbers':UI.showSequence.checked=a.value;renderOrderList();render();break;
  case 'hoop':UI.showHoop.checked=a.value;render();break;
  case 'shape':if(createStitchedShape(a.value))changed=true;break;
  case 'text':$('text-content').value=a.value;addText();changed=true;break;
  default:unknown.push(a.label);
 }}
 updateNumbers();if(changed)queueRebuild();
 createPendingActions=[];$('create-apply').hidden=true;
 const panel=$('create-prompt-result');panel.textContent='Applied supported changes to the editable stitch plan. Save your project and review the preview before exporting.';
}
function createNomuMark(withOval){
 const scale=nomuLayerScale();
 const symbol={kind:'fill',physical:true,nomuFigure:true,nomuProfile:'figure',rings:stitchPatterns.nomuSymbolRings.map(r=>r.map(([x,y])=>({x:(x-118)*.154/scale,y:(y-139)*.154/scale})))};
 const oval={rx:16.8/scale,ry:20.5/scale,width:4.3/scale,center:{x:0,y:0}};
 const ring={kind:'fill',physical:true,nomuProfile:'oval',oval,rings:stitchPatterns.ovalRings(oval.rx,oval.ry,oval.width,oval.center)};
 captureLayerUndo();
 const create=(src,name,recipe)=>{
  const layer=makeJefLayer(src.rings,0,name);
  layer.fvSource=src;layer.fvRecipe={type:'satin',satinSpacing:.4,satinMax:8,satinOverlap:.25,pull:.12,underlay:true,ties:true,...recipe};
  layer.threadCode=1;fvRegenerateLayer(layer);jefLayers.push(layer);return layer;
 };
 // The bundled B_L SAT reference sews the horizontal figure before the turning oval.
 const mark=create(symbol,'NOMU mark',{angle:0,direction:'angle',underlay:'auto'});
 const outer=withOval?create(ring,'NOMU oval',{ovalWidth:4.3,ovalMode:'scale'}):null;
 if(outer)mark.nomuEmblem=outer.nomuEmblem=createEditorId();
 selectJefLayer((outer||mark).id);window.FervorStitchInspector?.(true);switchTab('stitches');
 fitOnNextRebuild=true;queueRebuild();
 setStatus(withOval?'Editable NOMU emblem inserted':'Editable NOMU mark inserted','success');
}
function initCreationStudio(){
 document.querySelectorAll('[data-create]').forEach(btn=>btn.addEventListener('click',()=>createStitchedShape(btn.dataset.create)));
 $('create-analyze').addEventListener('click',createPreviewInstruction);
 $('create-clear').addEventListener('click',()=>{$('create-prompt').value='';$('create-prompt-result').hidden=true;$('create-apply').hidden=true;createPendingActions=[];});
 $('create-apply').addEventListener('click',createApplyInstruction);
 $('fv26-create-nomu')?.addEventListener('click',()=>createNomuMark(false));
 $('fv26-create-nomu-oval')?.addEventListener('click',()=>createNomuMark(true));
}


// Receive FERVOR Vector geometry without flattening artwork to a raster image.
// Each shape becomes its own editable stitch layer: tatami fill (with underlay) for fills,
// running stitch or satin for outlines. Colours map to the nearest Janome JEF thread code.
const FV_JEF_THREADS=[[1,'#000000'],[2,'#ffffff'],[3,'#ffff17'],[4,'#ff6600'],[5,'#2f5933'],[6,'#237336'],[7,'#65c2c8'],[8,'#ab5a96'],[9,'#f669a0'],[10,'#ff0000'],[11,'#b1704e'],[12,'#0b2f84'],[13,'#e4c35d'],[14,'#481a05'],[15,'#ac9cc7'],[16,'#fcf294'],[17,'#f999b7'],[18,'#fab381'],[19,'#c9a480'],[20,'#970533'],[21,'#a0b8cc'],[22,'#7fc21c'],[23,'#e5e5e5'],[24,'#889b9b'],[25,'#98d6bd'],[26,'#b2e1e3'],[27,'#368ba0'],[28,'#4f83ab'],[29,'#386a91'],[30,'#071650']];
function fvNearestJefThread(hex){if(!/^#[0-9a-f]{6}$/i.test(hex||''))return 1;const [r,g,b]=hexToRgb(hex);let best=1,score=Infinity;
 for(const [code,h] of FV_JEF_THREADS){const [R,G,B]=hexToRgb(h),rm=(r+R)/2,d=(2+rm/256)*(r-R)**2+4*(g-G)**2+(2+(255-rm)/256)*(b-B)**2;if(d<score){score=d;best=code;}}return best;}
function fvFlattenVectorContour(c,map){
 const nodes=(c&&Array.isArray(c.nodes)?c.nodes:[]).filter(p=>Number.isFinite(+p.x)&&Number.isFinite(+p.y));
 if(nodes.length<2)return [];
 const closed=c.closed!==false,last=closed?nodes.length:nodes.length-1,out=[map(nodes[0])];
 for(let i=0;i<last;i++){
  const a=nodes[i],b=nodes[(i+1)%nodes.length];
  if(!a.out&&!b.in){out.push(map(b));continue;}
  const c1=a.out||a,c2=b.in||b,A=map(a),C1=map(c1),C2=map(c2),B=map(b);
  // Adaptive subdivision from the control polygon length keeps curves smooth at any size.
  const span=Math.hypot(C1.x-A.x,C1.y-A.y)+Math.hypot(C2.x-C1.x,C2.y-C1.y)+Math.hypot(B.x-C2.x,B.y-C2.y),sections=Math.max(2,Math.min(160,Math.ceil(span/.3)));
  for(let j=1;j<=sections;j++){const t=j/sections,q=1-t;out.push({x:q*q*q*A.x+3*q*q*t*C1.x+3*q*t*t*C2.x+t*t*t*B.x,y:q*q*q*A.y+3*q*q*t*C1.y+3*q*t*t*C2.y+t*t*t*B.y});}
 }
 if(closed&&Math.hypot(out[0].x-out.at(-1).x,out[0].y-out.at(-1).y)>1e-6)out.push({...out[0]});
 return out;
}
// Even stitch spacing along a polyline. Sharp corners (>30°) always get a needle point; only
// corners closer than 0.3 mm merge, so small lettering keeps its shape.
function fvResample(points,step,keepCorners=true){
 if(points.length<2)return points.map(p=>({...p}));
 const out=[{...points[0]}];let carry=0;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y);if(len<1e-9)continue;
  let t=step-carry;while(t<len-1e-9){out.push({x:a.x+(b.x-a.x)*t/len,y:a.y+(b.y-a.y)*t/len});t+=step;}carry=len-(t-step);
  if(keepCorners&&i<points.length-1){const c=points[i+1],v1x=b.x-a.x,v1y=b.y-a.y,v2x=c.x-b.x,v2y=c.y-b.y,l2=Math.hypot(v2x,v2y);if(l2>1e-9&&(v1x*v2x+v1y*v2y)/(len*l2)<Math.cos(Math.PI/6)){if(Math.hypot(out.at(-1).x-b.x,out.at(-1).y-b.y)>Math.min(step*.3,.3))out.push({...b});else out[out.length-1]={...b};carry=0;}}
 }
 const end=points.at(-1),gap=Math.hypot(out.at(-1).x-end.x,out.at(-1).y-end.y);
 if(gap>Math.min(step*.35,.3)||out.length<2)out.push({...end});else out[out.length-1]={...end};
 return out;
}
function fvSatinColumn(points,width,density=.42){
 const closed=points.length>3&&Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y)<1e-6;
 const pts=fvResample(points,density,false),n=pts.length,out=[];if(n<2)return out;
 for(let i=0;i<n;i++){const a=pts[i>0?i-1:closed?n-2:0],c=pts[i<n-1?i+1:closed?1:n-1],tx=c.x-a.x,ty=c.y-a.y,l=Math.hypot(tx,ty)||1,side=i%2?1:-1;
  out.push({x:pts[i].x-ty/l*side*width/2,y:pts[i].y+tx/l*side*width/2});}
 return out;
}
// Tatami fill. Rows run at `angle`; overlapping row segments are chained into continuous
// serpentine runs, so a ring or letter outline needs a few jumps instead of one per row.
function fvTatami(contours,angle,spacing,stitch,inset=0,stagger=true,pull=0,opts={}){
 const rings=contours.filter(c=>c.length>3);if(!rings.length)return [];
 const a=angle*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a),rot=p=>({x:p.x*ca+p.y*sa,y:-p.x*sa+p.y*ca}),back=p=>({x:p.x*ca-p.y*sa,y:p.x*sa+p.y*ca});
 const R=rings.map(r=>r.map(rot)),yb=fvBounds(R.flat()),ymin=yb.miny,ymax=yb.maxy;
 const rows=Math.min(2400,Math.floor((ymax-ymin)/spacing)),runs=[];let open=[];
 const tolerance=.18+pull;
 const hugsEdge=(a,b)=>fvTravelClear(R,[a,b],tolerance,Math.max(.7,inset+pull+.34));
 for(let k=0;k<rows;k++){const y=ymin+(k+.5)*spacing,xs=[];
  for(const poly of R)for(let j=0;j<poly.length-1;j++){const p=poly[j],q=poly[j+1];if((p.y<=y&&q.y>y)||(q.y<=y&&p.y>y))xs.push(p.x+(y-p.y)*(q.x-p.x)/(q.y-p.y));}
  xs.sort((m,n)=>m-n);const segs=[];for(let j=0;j+1<xs.length;j+=2){const x1=xs[j]+inset-pull,x2=xs[j+1]-inset+pull;if(x2-x1>.4)segs.push({x1,x2,y,k});}
  const next=[];
  for(const seg of segs){let best=null,overlap=0;for(const run of open){if(run.taken)continue;const last=run.segs.at(-1),o=Math.min(last.x2,seg.x2)-Math.max(last.x1,seg.x1),side=run.segs.length%2?'x2':'x1';
   // Only chain when the connecting stitch along the edge stays short and inside the shape:
   // at a notch (between the arms of an F, say) the rows on each side become separate runs.
   if(o>overlap&&Math.abs(last[side]-seg[side])<=Math.min(8,Math.max(2.5*stitch,4*spacing))&&hugsEdge({x:last[side],y:last.y},{x:seg[side],y:seg.y})){overlap=o;best=run;}}
   if(best){best.taken=true;best.segs.push(seg);next.push(best);}else{const run={segs:[seg],taken:true};runs.push(run);next.push(run);}}
  for(const run of next)run.taken=false;open=next;
 }
 const paths=[];
 for(const run of runs){const path=[];run.segs.forEach((seg,i)=>{const forward=i%2===0,from=forward?seg.x1:seg.x2,to=forward?seg.x2:seg.x1,len=Math.abs(to-from),dir=Math.sign(to-from)||1;
   // The link from the previous row runs along the edge; keep it within one stitch length.
   const prev=path.at(-1);if(prev){const n=Math.ceil(Math.hypot(from-prev.x,seg.y-prev.y)/Math.min(stitch,2));for(let j=1;j<n;j++)path.push({x:prev.x+(from-prev.x)*j/n,y:prev.y+(seg.y-prev.y)*j/n,travel:'edge'});}
   path.push({x:from,y:seg.y,...(prev?{travel:'edge'}:{})});
   // Brick offset: needle points shift a third of a stitch on each row so they do not line up.
   const phase=opts.pattern?window.FervorPatterns.phase(opts.pattern,seg.k,from,seg.y,opts.patternSize):(seg.k%3)/3;
   const offset=stagger?phase*stitch:0;
   let d=offset>=.28&&offset<len?offset:stitch;
   const programmed=['moire','brocade','dimples'].includes(opts.pattern);
   while(d<len-stitch*.35){
    const x=from+dir*d;
    path.push({x,y:seg.y});
    const advance=programmed?.67+window.FervorPatterns.phase(opts.pattern,seg.k,x,seg.y,opts.patternSize)*.33:1;
    d+=stitch*advance;
   }
   // Never leave a final stitch longer than the stitch length.
   const lastX=path.at(-1).x,gap=Math.abs(to-lastX);if(gap>stitch*1.02)path.push({x:(lastX+to)/2,y:seg.y});
   path.push({x:to,y:seg.y});});
  if(path.length>1){paths.push(path.map(p=>({...back(p),travel:p.travel})));}}
 const first=opts.start||(paths.length?paths[0][0]:null);
 if(opts.chain===false){
  // Visit runs nearest-first, reversing a run when its far end is closer.
  const ordered=[];let cur=first;const left=paths.slice();
  while(left.length){let bi=0,rev=false,bd=Infinity;left.forEach((p,i)=>{const d0=Math.hypot(p[0].x-cur.x,p[0].y-cur.y),d1=Math.hypot(p.at(-1).x-cur.x,p.at(-1).y-cur.y);if(d0<bd){bd=d0;bi=i;rev=false;}if(d1<bd){bd=d1;bi=i;rev=true;}});
   const p=left.splice(bi,1)[0];const route=rev?fvReversePath(p):p;ordered.push(route);cur=route.at(-1);}
  return ordered;}
 // Top runs can connect only along a rail or boundary. The underlay can also
 // cross the interior because the next solid top layer covers the route.
 return fvSatinTravel(paths,rings,first,stitch,true,opts.maxLink||14,opts.covered===true,pull);
}
function fvInside(rings,p){let c=false;for(const r of rings)for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/((b.y-a.y)||1e-12)+a.x)c=!c;}return c;}
function fvNearestOnRings(rings,p){let best=null;rings.forEach((r,ri)=>{for(let i=0;i<r.length-1;i++){const a=r[i],b=r[i+1],dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy||1e-12,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)),q={x:a.x+dx*t,y:a.y+dy*t},d=Math.hypot(p.x-q.x,p.y-q.y);if(!best||d<best.d)best={ri,i,t,q,d};}});return best;}
function fvRingLen(r){let L=0;for(let i=1;i<r.length;i++)L+=Math.hypot(r[i].x-r[i-1].x,r[i].y-r[i-1].y);return L;}
// Travel along the inside of the boundary between two edge points of the same ring.
function fvEdgeTravel(rings,a,b,maxLen=40,inset=.45){const A=fvNearestOnRings(rings,a),B=fvNearestOnRings(rings,b);if(!A||!B||A.ri!==B.ri||A.d>1.5||B.d>1.5)return null;
 const r=rings[A.ri],n=r.length-1,cum=[0];for(let i=1;i<=n;i++)cum.push(cum[i-1]+Math.hypot(r[i].x-r[i-1].x,r[i].y-r[i-1].y));const L=cum[n];if(!L)return null;
 const sA=cum[A.i]+(cum[A.i+1]-cum[A.i])*A.t,sB=cum[B.i]+(cum[B.i+1]-cum[B.i])*B.t,fwd=((sB-sA)%L+L)%L,dir=fwd<=L-fwd?1:-1,len=Math.min(fwd,L-fwd);if(len>maxLen)return null;
 const pts=[A.q];if(dir>0){let i=A.i+1;for(let k=0;k<n&&((cum[i%n]-sA+L)%L)<fwd;k++,i++)pts.push(r[i%n]);}else{let i=A.i;for(let k=0;k<n&&((sA-cum[i]+L)%L)<L-fwd&&((sA-cum[i]+L)%L)>0;k++,i=(i-1+n)%n)pts.push(r[i]);}
 pts.push(B.q);
 const inner=pts.map((p,k)=>{const q=pts[Math.min(pts.length-1,k+1)],o=pts[Math.max(0,k-1)],tx=q.x-o.x,ty=q.y-o.y,tl=Math.hypot(tx,ty)||1,nx=-ty/tl,ny=tx/tl,c1={x:p.x+nx*inset,y:p.y+ny*inset};return fvInside(rings,c1)?c1:{x:p.x-nx*inset,y:p.y-ny*inset};});
 return fvResample(inner,2.2,true).slice(1);}
// Test every leg against the ring geometry. Estimating coverage from the
// endpoints alone can create a visible diagonal or cross a cutout.
function fvTravelClear(rings,route,tolerance,edgeDistance=Infinity){
 for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i],n=Math.max(2,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.32));
  for(let j=1;j<n;j++){
   const t=j/n,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
   const inside=fvInside(rings,p);
   if(inside&&edgeDistance===Infinity)continue;
   const near=fvNearestOnRings(rings,p)?.d??Infinity;
   if(near>(inside?edgeDistance:Math.min(tolerance,edgeDistance)))return false;
  }
 }
 return true;
}
function fvReversePath(path){
 return path.slice().reverse().map((p,i)=>({...p,travel:path[path.length-i]?.travel}));
}
// Return only verified intermediate points. For top stitching any sewn
// connection must stay near the boundary. Otherwise the caller starts a jump.
function fvConnect(e,s0,rings,near=1.2,maxTravel=14,covered=false,pull=0,step=1.8){
 const d=Math.hypot(e.x-s0.x,e.y-s0.y),tolerance=Math.max(.08,Math.min(.36,pull+.1));
 if(d<.07)return {points:[],role:'edge'};
 if(!rings.length)return d<=near?{points:[],role:'edge'}:null;
 if(d>maxTravel)return null;
 const direct=[e,s0],edgeLimit=Math.max(.58,Math.min(.95,pull+.55));
 if((covered||d<=Math.min(near,2.2))&&fvTravelClear(rings,direct,tolerance,covered?Infinity:edgeLimit)){
  const steps=Math.ceil(d/step);
  return {points:Array.from({length:steps-1},(_,i)=>({x:e.x+(s0.x-e.x)*(i+1)/steps,y:e.y+(s0.y-e.y)*(i+1)/steps})),role:covered?'covered':'edge'};
 }
 const via=fvEdgeTravel(rings,e,s0,maxTravel,.25);
 if(!via?.length)return null;
 // Keep the original corner points and subdivide each leg. Resampling the
 // whole route can cut across a corner of the actual outline.
 const route=[e,...via,s0];
 if(fvRingLen(route)>maxTravel||!fvTravelClear(rings,route,tolerance,edgeLimit))return null;
 const points=[];
 for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i],n=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/step));
  for(let j=1;j<=n;j++)if(i<route.length-1||j<n)points.push({x:a.x+(b.x-a.x)*j/n,y:a.y+(b.y-a.y)*j/n});
 }
 return {points,role:'edge'};
}
function fvAppendTravel(path,next,connection){
 path.push(...connection.points.map(p=>({...p,travel:connection.role})),{...next[0],travel:connection.role});
 for(let i=1;i<next.length;i++)path.push(next[i]);
}
function fvChain(paths,rings,near=1.2,maxTravel=14){
 const out=[];let cur=null;
 for(const p of paths){
  if(!p||p.length<2)continue;
  if(!cur){cur=p.slice();continue;}
  const last=cur.at(-1),via=fvConnect(last,p[0],rings,near,maxTravel);
  if(via){sequenceStats.joined++;sequenceStats.routeLength+=fvRingLen([last,...via.points,p[0]]);fvAppendTravel(cur,p,via);continue;}
  out.push(cur);cur=p.slice();
 }
 if(cur)out.push(cur);
 return out;
}
function fvArea(rings){const b=fvBounds(rings.flat()),step=.25;let A=0;for(let y=b.miny+step/2;y<b.maxy;y+=step){const xs=[];for(const r of rings)for(let j=0;j<r.length-1;j++){const p=r[j],q=r[j+1];if((p.y<=y&&q.y>y)||(q.y<=y&&p.y>y))xs.push(p.x+(y-p.y)*(q.x-p.x)/(q.y-p.y));}xs.sort((a,c)=>a-c);for(let j=0;j+1<xs.length;j+=2)A+=(xs[j+1]-xs[j])*step;}return A;}
function fvMajorAngle(pts){let mx=0,my=0;for(const p of pts){mx+=p.x;my+=p.y;}mx/=pts.length;my/=pts.length;let a=0,b=0,c=0;for(const p of pts){const x=p.x-mx,y=p.y-my;a+=x*x;b+=x*y;c+=y*y;}return Math.atan2(2*b,a-c)/2*180/Math.PI;}
// Ring-shaped band (outer contour + one hole of near-constant width): sew it as a turning satin
// column, like the oval in professional NOMU files.
function fvBandRails(rings){if(rings.length!==2)return null;const [r0,r1]=rings,outer=Math.abs(fvArea([r0]))>=Math.abs(fvArea([r1]))?r0:r1,inner=outer===r0?r1:r0;if(!fvInside([outer],inner[0]))return null;
 const ds=fvResample(inner,1,false).map(p=>fvNearestOnRings([outer],p).d).sort((a,c)=>a-c);if(!ds.length)return null;const lo=ds[Math.floor(ds.length*.05)],hi=ds[Math.floor(ds.length*.95)];
 if(hi>7.2||lo<.6||hi/lo>2.2)return null;
 // Both rails must stay close: a figure with a small hole (e.g. a head) is not a band.
 const back=fvResample(outer,1,false).map(p=>fvNearestOnRings([inner],p).d).sort((a,c)=>a-c),bhi=back[Math.floor(back.length*.95)];if(!(bhi<=Math.min(9,Math.max(1.2,hi*1.45))))return null;
 return {outer,inner,width:(lo+hi)/2};}
function fvTurningSatin(rails,density=.4,pull=0,entry=null){const {outer,inner}=rails,Lo=fvRingLen(outer),Li=fvRingLen(inner),n=Math.max(12,Math.ceil(Math.max(Lo,Li)/density));
 const sample=(r,L,count,start)=>{const pts=fvResample(r,L/count,false);const k=start;return pts.slice(0,count).map((_,i)=>pts[(i+k)%Math.min(count,pts.length)]);};
 let o=fvResample(outer,Lo/n,false).slice(0,n);let inn=fvResample(inner,Li/n,false).slice(0,n);
 if(entry){let k=0,bd=Infinity;o.forEach((p,i)=>{const d=Math.hypot(p.x-entry.x,p.y-entry.y);if(d<bd){bd=d;k=i;}});o=o.slice(k).concat(o.slice(0,k));
  // Also look along the inner rail: entering on the nearer edge saves a jump.
  let ki=0,bi=Infinity;inn.forEach((p,i)=>{const d=Math.hypot(p.x-entry.x,p.y-entry.y);if(d<bi){bi=d;ki=i;}});if(bi<bd){const c=inn[ki];let ko=0,bo=Infinity;o.forEach((p,i)=>{const d=Math.hypot(p.x-c.x,p.y-c.y);if(d<bo){bo=d;ko=i;}});o=o.slice(ko).concat(o.slice(0,ko));rails.startInner=true;}}
 // Align the inner rail's start and direction with the outer rail.
 let bestK=0,bd=Infinity;for(let k=0;k<inn.length;k++){const d=Math.hypot(inn[k].x-o[0].x,inn[k].y-o[0].y);if(d<bd){bd=d;bestK=k;}}inn=inn.slice(bestK).concat(inn.slice(0,bestK));
 const fwd=Math.hypot(inn[Math.min(3,inn.length-1)].x-o[Math.min(3,o.length-1)].x,inn[Math.min(3,inn.length-1)].y-o[Math.min(3,o.length-1)].y),rev=Math.hypot(inn[(inn.length-3+inn.length)%inn.length].x-o[Math.min(3,o.length-1)].x,inn[(inn.length-3+inn.length)%inn.length].y-o[Math.min(3,o.length-1)].y);
 if(rev<fwd)inn=[inn[0],...inn.slice(1).reverse()];
 const m=Math.min(o.length,inn.length),out=[],flip=rails.startInner?1:0;for(let i=0;i<=m;i++){const a=o[i%m],b=inn[i%m],dx=a.x-b.x,dy=a.y-b.y,l=Math.hypot(dx,dy)||1,ext=pull/2;out.push((i+flip)%2?{x:b.x-dx/l*ext,y:b.y-dy/l*ext}:{x:a.x+dx/l*ext,y:a.y+dy/l*ext});}
 return {satin:out,entryPoint:rails.startInner?inn[0]:o[0],center:Array.from({length:m+1},(_,i)=>({x:(o[i%m].x+inn[i%m].x)/2,y:(o[i%m].y+inn[i%m].y)/2}))};}
// Length of every scan row across the region at a given row direction.
function fvRowLengths(rings,angle,spacing=.5){const a=angle*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a),R=rings.map(r=>r.map(p=>({x:p.x*ca+p.y*sa,y:-p.x*sa+p.y*ca}))),b=fvBounds(R.flat()),out=[];
 for(let y=b.miny+spacing/2;y<b.maxy;y+=spacing){const xs=[];for(const poly of R)for(let j=0;j<poly.length-1;j++){const p=poly[j],q=poly[j+1];if((p.y<=y&&q.y>y)||(q.y<=y&&p.y>y))xs.push(p.x+(y-p.y)*(q.x-p.x)/(q.y-p.y));}
  xs.sort((m,n)=>m-n);for(let j=0;j+1<xs.length;j+=2)out.push(xs[j+1]-xs[j]);}
 return out;}
// The satin row direction that crosses the strokes: the shortest rows on average, with no row
// (ignoring the longest 4 %) over the satin limit. Null when no direction fits.
// A preferred direction (the design's fill angle) wins unless another is clearly better, so
// neighbouring letters and shapes keep the same sheen.
function fvSatinAngle(rings,maxSatin,angles=[0,15,30,45,60,75,90,105,120,135,150,165],prefer=null){let best=null,pref=null;
 const list=prefer===null?angles:[...new Set([...angles,((Math.round(prefer)%180)+180)%180])];
 for(const a of list){const rows=fvRowLengths(rings,a).sort((m,n)=>m-n);if(!rows.length)continue;const p96=rows[Math.min(rows.length-1,Math.floor(rows.length*.96))],mean=rows.reduce((t,v)=>t+v,0)/rows.length;
  if(p96>maxSatin)continue;if(!best||mean<best.mean-1e-6)best={angle:a,mean};if(prefer!==null&&a===((Math.round(prefer)%180)+180)%180)pref={angle:a,mean};}
 if(pref&&best&&pref.mean<=best.mean*1.35)return pref.angle;
 return best?best.angle:null;}
// Choose how a filled region should sew, the way a digitizer would.
function fvAutoRecipe(rings,base,maxSatin=9,minSatin=.8){const A=fvArea(rings),P=rings.reduce((t,r)=>t+fvRingLen(r),0),w=P?2*A/P:0,band=fvBandRails(rings);
 if(band&&band.width>=minSatin&&band.width<=Math.min(7,maxSatin))return {...base,type:'satin',auto:'turning',angle:0};
 if(w>minSatin&&w<=Math.min(5.5,maxSatin)){const ang=fvSatinAngle(rings,maxSatin,undefined,base.prefer??null);if(ang!==null)return {...base,type:'satin',auto:'rows',angle:ang};}
 return {...base,type:'fill'};}
function fvBounds(points){let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;for(const p of points){if(p.x<minx)minx=p.x;if(p.x>maxx)maxx=p.x;if(p.y<miny)miny=p.y;if(p.y>maxy)maxy=p.y;}return {minx,miny,maxx,maxy};}
// Lock stitches: three tiny stitches at the start and end of a run so it cannot unravel after a trim.
function fvTie(path){if(path.length<2)return path;const a=path[0],b=path[1],l=Math.hypot(b.x-a.x,b.y-a.y)||1,d=Math.min(.45,l*.5),u={x:(b.x-a.x)/l,y:(b.y-a.y)/l};
 const y=path.at(-1),z=path.at(-2),m=Math.hypot(y.x-z.x,y.y-z.y)||1,e=Math.min(.45,m*.5),v={x:(z.x-y.x)/m,y:(z.y-y.y)/m};
 return [a,{x:a.x+u.x*d,y:a.y+u.y*d},{...a},...path.slice(1),{x:y.x+v.x*e,y:y.y+v.y*e},{...y}];}
// Start a closed ring at the point nearest p.
function fvRotateRing(r,p){const closed=r.length>3&&Math.hypot(r[0].x-r.at(-1).x,r[0].y-r.at(-1).y)<1e-6;if(!p||!closed)return r.slice();const n=r.length-1;let k=0,bd=Infinity;for(let i=0;i<n;i++){const d=Math.hypot(r[i].x-p.x,r[i].y-p.y);if(d<bd){bd=d;k=i;}}const out=r.slice(k,n).concat(r.slice(0,k));out.push({...out[0]});return out;}
// Running lines along rings, nearest first, each starting where the last one ended.
function fvRunRings(rings,run,start,triple=false){const left=rings.map(r=>fvResample(r,run)).filter(r=>r.length>=2),out=[];let cur=start;
 while(left.length){let bi=0,bd=Infinity;if(cur)left.forEach((r,i)=>{for(const p of r){const d=Math.hypot(p.x-cur.x,p.y-cur.y);if(d<bd){bd=d;bi=i;}}});
  let r=left.splice(bi,1)[0];const closed=r.length>3&&Math.hypot(r[0].x-r.at(-1).x,r[0].y-r.at(-1).y)<1e-6;
  if(closed)r=fvRotateRing(r,cur);else if(cur&&Math.hypot(r.at(-1).x-cur.x,r.at(-1).y-cur.y)<Math.hypot(r[0].x-cur.x,r[0].y-cur.y))r=r.slice().reverse();
  if(triple)r=reinforceRun(r);out.push(r);cur=r.at(-1);}
 return out;}
// Edge-walk underlay: a running line just inside each boundary, so it never shows past the top stitches.
function fvInsetRun(rings,d,step){return rings.map(r=>{const pts=fvResample(r,step,false);if(pts.length>3&&Math.hypot(pts[0].x-pts.at(-1).x,pts[0].y-pts.at(-1).y)<1e-6)pts.pop();const n=pts.length;if(n<3)return null;
  const inner=pts.map((p,i)=>{const a=pts[(i-1+n)%n],b=pts[(i+1)%n],tx=b.x-a.x,ty=b.y-a.y,l=Math.hypot(tx,ty)||1,nx=-ty/l,ny=tx/l;for(const s of [1,-1]){const c={x:p.x+nx*d*s,y:p.y+ny*d*s};if(fvInside(rings,c))return c;}return null;}).filter(Boolean);
  return inner.length>=3?[...inner,{...inner[0]}]:null;}).filter(Boolean);}
// Join neighbouring satin paths only with short, inside-the-shape travel.
function fvSatinTravel(paths,rings,start,cap,chain,maxTravel,covered=false,pull=0){
 const remaining=paths.slice(),result=[];
 let cursor=start;
 while(remaining.length){
  let pick=0,reverse=false,connection=null;
  if(cursor){
   const candidates=[];
   remaining.forEach((p,i)=>{
    const a=Math.hypot(cursor.x-p[0].x,cursor.y-p[0].y),b=Math.hypot(cursor.x-p.at(-1).x,cursor.y-p.at(-1).y);
    candidates.push({i,distance:Math.min(a,b),reverse:b<a,entry:b<a?p.at(-1):p[0]});
   });
   candidates.sort((a,b)=>a.distance-b.distance);
   let next=candidates[0];
   if(chain&&result.length)for(const c of candidates.slice(0,6)){
    if(c.distance>maxTravel)break;
    connection=fvConnect(cursor,c.entry,rings,1.2,maxTravel,covered,pull,Math.min(1.8,cap));
    if(connection){next=c;break;}
   }
   pick=next.i;reverse=next.reverse;
  }
  const chosen=remaining.splice(pick,1)[0],path=reverse?fvReversePath(chosen):chosen;
  const previous=result.at(-1);
  if(previous&&connection){
   sequenceStats.joined++;sequenceStats.routeLength+=fvRingLen([cursor,...connection.points,path[0]]);
   fvAppendTravel(previous,path,connection);
  }else result.push(path.slice());
  cursor=result.at(-1).at(-1);
 }
 return result;
}
// Build stitch paths from a part's source geometry (mm) and recipe. Pure: same input → same stitches.
// Optional recipe fields: underlay ('auto' | 'edge' | 'tatami' | false), satinSpacing, run, outline
// (true | 'triple': a running border after the fill), cross ({spacing, angle}: a second fill layer),
// chain (false keeps every row separate), maxLink (longest edge travel in mm).
function fvBuildPaths(src,recipe){
 const rings=src.rings.filter(r=>r.length>=2),closed=rings.filter(r=>r.length>3&&Math.hypot(r[0].x-r.at(-1).x,r[0].y-r.at(-1).y)<1e-6),st=getSettings();
 const spacing=Math.max(.3,Math.min(1.2,recipe.spacing||st.spacing||.45)),stitch=Math.max(2,Math.min(7,recipe.stitch||4)),run=Math.max(1,Math.min(3,recipe.run||2.5)),pull=Math.max(0,Math.min(.6,recipe.pull??st.pullComp??.2)),angle=+recipe.angle||0,start=recipe.startPoint||recipe.entry||null;
 const chain=recipe.chain!==false,maxLink=recipe.maxLink||40,link=(ps,near=1.4)=>chain?fvChain(ps,closed,near,maxLink):ps,tat={chain,maxLink};
 const isSatin=recipe.type==='satin'||recipe.type==='raised-satin',raised=recipe.type==='raised-satin';
 const family=stitchPatterns.family(recipe.type),pattern=recipe.patterns?.[family],repeat=stitchPatterns.sizeFor(family,recipe.patterns?.[family+'Size']??(family==='embossed'?recipe.patterns?.embossSize:undefined),pattern);
 const patterns=recipe.patterns||{},texture=ps=>patterns.satin?stitchPatterns.satinTexture(ps,patterns.satin,repeat):ps;
 let under=recipe.underlay===false||recipe.underlay==='none'?'none':recipe.underlay===true||recipe.underlay==null?'auto':recipe.underlay;
 if(src.nomuFigure&&under==='auto'){
  const b=fvBounds(closed.flat());
  if(b.maxx-b.minx<17)under='none';
 }
 const satinSpacing=Math.max(.25,Math.min(1.7,recipe.satinSpacing||Math.min(spacing,.42)));
 let paths=[],entryRuns=1;
 if((recipe.type==='fill'||recipe.type==='embossed')&&closed.length){const b=fvBounds(closed.flat()),narrow=Math.min(b.maxx-b.minx,b.maxy-b.miny);
  if(narrow<.8)paths=fvRunRings(closed,1.2,start);
  else{let u=[];
   if(under==='edge'&&narrow>1.5)u=fvRunRings(fvInsetRun(closed,.5,2.5),2.5,start);
   else if(under!=='none'&&under!=='edge'&&narrow>(under==='tatami'?2:3))u=fvTatami(closed,angle+90,2,3.2,.45,false,0,{...tat,start,covered:true});
   // Top fill starts where the underlay finished, so the two join with a short travel.
   const fillPattern=recipe.type==='fill'?pattern:null;
   const directional=stitchPatterns.directionalPatterns.has(fillPattern);
   const top=directional?window.FervorPatterns.decorative(closed,'directional-tatami',{pattern:fillPattern,spacing,angle,run:stitch,size:repeat}):
    fvTatami(closed,angle+(fillPattern==='diagonal'?35:0),spacing,stitch,0,true,pull,{...tat,start:u.at(-1)?.at(-1)||start,pattern:fillPattern,patternSize:repeat});
   const cross=recipe.cross?fvTatami(closed,angle+(+recipe.cross.angle||90),Math.max(.3,+recipe.cross.spacing||1),stitch,0,true,Math.min(.2,pull),{...tat,start:top.at(-1)?.at(-1)||start}):[];
   paths=directional||recipe.startPoint?[...u,...top,...cross]:link([...u,...top,...cross]);
   entryRuns=u.length||top.length;
   if(recipe.type==='embossed'){
    // Sew two neighboring motif lines over the base fill to build visible texture.
    // Each line is clipped to the shape and its holes before it becomes a needle path.
    const relief=window.FervorPatterns.decorative(closed,'embossed',{angle,run:Math.min(run,1.8),
     pattern,size:repeat,passes:patterns.embossPasses??2,nomuHeight:patterns.nomuHeight});
    for(const path of relief){path.role='emboss-relief';paths.push(path);}
   }
  }
 }
 else if(isSatin){
  const max=Math.max(2,Math.min(8,recipe.satinMax||st.satinLimit||6.5));
  if(src.oval){
   const {rx,ry,width,center}=src.oval,shift=path=>path.map(p=>({...p,x:p.x+center.x,y:p.y+center.y}));
   const top=window.FervorPatterns.ovalSatin(rx,ry,width,{spacing:satinSpacing,max,overlap:recipe.satinOverlap??st.satinOverlap,pull}).map(shift);
   // Keep the buildup across the same rails without stacking a full second top layer.
   const lower=raised?window.FervorPatterns.ovalSatin(rx,ry,width,{spacing:satinSpacing*2.7,max,overlap:0,pull:0}).map(shift):[];
   const centerRun=under==='none'?[]:fvRunRings([window.FervorPatterns.ovalRings(rx,ry,width/2,center)[1]],run,start);
   paths=[...centerRun,...lower,...texture(top)];recipe.onSatin?.({columns:top.length,splitSections:top.length>1?1:0});
  }
  const band=!src.oval&&!raised&&src.kind==='fill'&&recipe.auto!=='rows'&&recipe.direction!=='angle'?fvBandRails(closed):null;
  if(band){
   // The reference icon sews the border as one turning column around the figure.
   const t=fvTurningSatin(band,satinSpacing*.5,pull,start);
   const lower=under!=='none'?fvResample(t.center,1.8,false):[];
   const turning=[...lower,...t.satin];
   if(turning.every((p,i)=>!i||dist(p,turning[i-1])<=max-.16)){
    const upper=texture([t.satin])[0];
    paths=recipe.startPoint&&lower.length?[lower,upper]:[lower.concat(upper)];recipe.onSatin?.({columns:1,splitSections:0});
   }
  }
  if(src.kind==='fill'&&closed.length&&!paths.length){
   const plan=window.FervorSatin.plan(closed,{angle,direction:recipe.direction||(recipe.auto==='rows'?'angle':'auto'),spacing:satinSpacing,max,pull,underlay:under,overlap:recipe.satinOverlap??st.satinOverlap});
   const lower=fvSatinTravel(plan.underlay,closed,start,max-.16,chain,maxLink,true,pull);
   const buildup=raised?window.FervorSatin.plan(closed,{angle,direction:recipe.direction||'auto',spacing:satinSpacing*2.7,max,pull:0,underlay:'none',overlap:0}).top:[];
   const upper=fvSatinTravel(texture(plan.top),closed,lower.at(-1)?.at(-1)||start,max-.16,chain,maxLink,false,pull);
   paths=[...lower,...buildup,...upper];recipe.onSatin?.(plan);
  }else if(src.kind!=='fill'||!closed.length){const width=Math.max(.8,Math.min(7,max-pull-.7,recipe.width||src.widthMm||2));
   for(const r of rings){const col=fvSatinColumn(r,width+pull);if(raised)paths.push(fvSatinColumn(r,width,.9));paths.push(under!=='none'&&width>=1.6?[...fvResample(r,2).reverse(),...texture([col])[0]]:texture([col])[0]);}}}
 else if(['motif','ripple','contour','cross-stitch','stipple'].includes(recipe.type)&&closed.length){
  paths=window.FervorPatterns.decorative(closed,recipe.type,{spacing,angle,run,pattern,size:patterns[family+'Size']??patterns.motifSize,nomuHeight:patterns.nomuHeight});
  if(!paths.length)paths=fvRunRings(closed,run,start);
  entryRuns=paths.length;
 }
 else if(recipe.type==='applique'&&closed.length){
  const decorate=(role,list)=>list.map(path=>Object.assign(path,{role}));
  const placement=fvRunRings(closed,run,start);
  const tackdown=fvRunRings(fvInsetRun(closed,Math.min(.5,repeat*.18),Math.min(1.5,run)),Math.min(1.6,run),start);
  const fix=tackdown.length===closed.length&&tackdown.every(p=>fvTravelClear(closed,p,.06))?tackdown:fvRunRings(closed,Math.min(1.6,run),start);
  const finish=closed.map(r=>{
   const line=fvRotateRing(r,start);
   if(pattern==='bean')return fvRunRings([line],run,start,true)[0];
   if(pattern==='raw')return fvResample(line,run);
   if(pattern==='blanket'){
    const path=fvSatinColumn(line,repeat,Math.max(.9,spacing*2.4)),out=[path[0]];
    for(let i=1;i<path.length;i++){out.push(path[i]);if(i%2&&i+1<path.length)out.push(path[i-1]);}
    return out;
   }
   return fvSatinColumn(line,repeat,pattern==='zigzag'?Math.max(.85,spacing*2):spacing);
  });
  paths=[...decorate('applique-placement',placement),...decorate('applique-tackdown',fix),...decorate('applique-finish',finish)];
  entryRuns=placement.length;
 }
 else paths=stitchPatterns.accentRun(link(fvRunRings(rings,run,start,recipe.type==='triple')),pattern,repeat);
 // A running border sews last, starting where the fill finished.
 if(recipe.outline&&closed.length&&(recipe.type==='fill'||isSatin)){
  const border=fvRunRings(closed,run,paths.at(-1)?.at(-1)||start,recipe.outline==='triple');
  paths=isSatin?[...paths,...border]:link([...paths,...border]);
 }
 paths=paths.filter(p=>p&&p.length>=2);
 if(recipe.startPoint&&paths.length){
  let at=0,pathIndex=0,nearest=Infinity;
  for(let p=0;p<Math.min(paths.length,entryRuns);p++){
   for(let i=0;i<paths[p].length;i++){
    const d=dist(paths[p][i],start);
    if(d<nearest){nearest=d;pathIndex=p;at=i;}
   }
  }
  const [first]=paths.splice(pathIndex,1),last=first.at(-1);
  let routed=[first];
  if(at===first.length-1&&dist(first[0],last)>1e-7)routed=[fvReversePath(first)];
  else if(at>0&&at<first.length-1){
   if(dist(first[0],last)<1e-7)routed=[first.slice(at).concat(first.slice(1,at+1))];
   else routed=[first.slice(at),first.slice(0,at+1)];
  }
  paths.unshift(...routed.map(p=>Object.assign(p,{role:first.role})));
 }
 if(patterns.relief&&patterns.relief!=='none'){
  const passes=Math.round(Math.max(1,Math.min(3,+patterns.reliefPasses||2)));
  const adjusted=angle+(Number.isFinite(+patterns.reliefAngle)?+patterns.reliefAngle:0);
  if(closed.length){
   const relief=stitchPatterns.decorative(closed,'embossed',{angle:adjusted,run:Math.min(run,1.8),
    pattern:patterns.relief,size:patterns.reliefSize,passes,nomuHeight:patterns.reliefNomuHeight});
   const role=recipe.type==='applique'?'applique-finish':'emboss-relief';
   for(const path of relief){path.role=role;paths.push(path);}
  }else paths=stitchPatterns.reliefOnRuns(paths,patterns.relief,stitchPatterns.sizeFor('embossed',patterns.reliefSize),passes,adjusted);
 }
 // Lock each separate run, and preserve jumps where two satin sections cannot be safely joined.
 return paths.map(path=>{
  const result=recipe.ties===false?path:fvTie(path);
  if(path.role){
   result.role=path.role;
   result[0]={...result[0],role:path.role};
  }
  if(closed.length||isSatin)result.forceJump=true;
  return result;
 });
}
function nomuLayerScale(){return mode==='jef'?getSettings().width/Math.max(.01,originalBounds.width):1;}
function usesNomuReference(L){
 const src=L.fvSource,r=L.fvRecipe;
 return !!src.nomuProfile&&r.nomuReference!==false&&r.type==='satin'&&!r.startPoint
  &&(!r.patterns?.satin||r.patterns.satin==='smooth')
  &&(!r.patterns?.relief||r.patterns.relief==='none')&&(!src.oval||r.ovalMode==='scale');
}
function nomuReferenceFrame(src,factor){
 if(src.oval){
  const {rx,ry,center}=src.oval;
  return {x:center.x*factor,y:center.y*factor,sx:rx*factor/16.8,sy:ry*factor/20.5};
 }
 const b=layerBounding(src.rings),sx=(b.maxx-b.minx)*factor/(104*.154),sy=(b.maxy-b.miny)*factor/(137*.154);
 return {x:b.minx*factor+52*.154*sx,y:b.miny*factor+69*.154*sy,sx,sy};
}
function fvRegenerateLayer(L){
 if(!L?.fvSource)return false;
 const src=L.fvSource,recipe=L.fvRecipe,sx=L.scaleX??1,sy=L.scaleY??1,c=L.center||{x:0,y:0};
 const mapRings=(rings,convert)=>rings.map(r=>r.map(p=>({...p,...convert(p)})));
 // Bake scaling into the source contours and build new needle points in physical millimeters.
 if(Math.abs(sx-1)>1e-6||Math.abs(sy-1)>1e-6){
  const scale=p=>({x:c.x+(p.x-c.x)*sx,y:c.y+(p.y-c.y)*sy});
  src.rings=mapRings(src.rings,scale);
  if(typeof annotations!=='undefined')for(const note of annotations){
   if(note.anchor?.kind==='jef'&&note.anchor.id===L.id)note.anchor.local=scale(note.anchor.local);
  }
  if(src.oval)src.oval={...src.oval,center:scale(src.oval.center),rx:src.oval.rx*sx,ry:src.oval.ry*sy};
  if(src.widthMm)src.widthMm*=Math.sqrt(Math.abs(sx*sy));
  if(recipe.startPoint)recipe.startPoint=scale(recipe.startPoint);
  L.scaleX=1;L.scaleY=1;
 }
 const factor=src.physical?nomuLayerScale():1;
 const mm=p=>({x:p.x*factor,y:p.y*factor});
 let oval=null;
 if(src.oval){
  const {rx,ry,center}=src.oval;
  const curvature=Math.min(rx*rx/ry,ry*ry/rx);
  const outerBand=recipe.ovalMode==='scale'?Math.sqrt(rx*ry)*4.3/Math.sqrt(16.8*20.5):Math.max(.8,Math.min(40,recipe.ovalWidth??4.3))/factor;
  const width=Math.min(outerBand,curvature*.72);
  src.oval.width=width;
  src.rings=stitchPatterns.ovalRings(rx,ry,width,center);
  oval={rx:rx*factor,ry:ry*factor,width:width*factor,center:mm(center)};
 }
 L.fvSatinStats=null;
 const reference=src.nomuProfile&&usesNomuReference(L)&&window.FervorNomu.plan(
  window.FervorNomu.original()[src.nomuProfile],nomuReferenceFrame(src,factor),{max:recipe.satinMax,cleanEntry:src.nomuProfile==='figure'});
 if(reference)L.fvSatinStats={reference:true,splits:reference.splits};
 const paths=reference?[reference.path]:fvBuildPaths({...src,rings:factor===1?src.rings:mapRings(src.rings,mm),oval},{
  ...recipe,startPoint:recipe.startPoint&&mm(recipe.startPoint),
  onSatin:({columns,splitSections})=>{L.fvSatinStats={columns,splitSections};}
 });
 if(!paths.length)return false;
 L.paths=factor===1?paths:paths.map(path=>Object.assign(path.map(p=>({...p,x:p.x/factor,y:p.y/factor})),{role:path.role}));
 L.fvPhysicalScale=factor;return true;
}
async function fvImportVectorPaths(doc){
 if(!doc||!Array.isArray(doc.shapes)||!doc.shapes.length)throw new Error('No vector shapes in the document.');
 if(doc.shapes.length>400)throw new Error('Too many shapes. Hide or delete small shapes in Vector first.');
 const shapes=doc.shapes.filter(sh=>sh&&sh.visible!==false&&Array.isArray(sh.contours)&&(sh.fill&&sh.fill!=='none'||sh.stroke&&sh.stroke!=='none'));
 if(!shapes.length)throw new Error('Visible shapes need a fill or outline before transfer.');
 // "Design width" is the width of the visible artwork, not of the 960 px artboard.
 const identity=p=>({x:+p.x,y:+p.y}),all=shapes.flatMap(sh=>sh.contours.flatMap(c=>fvFlattenVectorContour(c,identity))),bb=fvBounds(all);
 if(!Number.isFinite(bb.minx))throw new Error('The vector shapes have no drawable geometry.');
 const widthMm=Math.max(10,Math.min(250,+doc.widthMm||100)),mmPerPx=widthMm/Math.max(1,bb.maxx-bb.minx),cx=(bb.minx+bb.maxx)/2,cy=(bb.miny+bb.maxy)/2;
 const map=p=>({x:(+p.x-cx)*mmPerPx,y:(+p.y-cy)*mmPerPx});
 const st=getSettings(),spacing=Math.max(.3,Math.min(1.2,st.spacing||.45)),stitch=Math.max(1.5,Math.min(5,st.length||2.8)),run=Math.min(stitch,2.5),angle=st.fillAngle||0;
 // Build fill and outline parts. Outlines are separate parts so they stitch after their fill.
 const parts=[];let satinCapped=0;
 for(const shape of shapes){
  const contours=shape.contours.map(c=>({closed:c.closed!==false,pts:fvFlattenVectorContour(c,map)})).filter(c=>c.pts.length>=2),name=String(shape.name||'Vector shape').slice(0,80);
  if(!contours.length)continue;
  const fillHex=shape.fill&&shape.fill!=='none'?String(shape.fill).toLowerCase():null,strokeHex=shape.stroke&&shape.stroke!=='none'?String(shape.stroke).toLowerCase():null;
  if(fillHex){const rings=contours.filter(c=>c.closed).map(c=>c.pts);if(rings.length){const src={kind:'fill',rings},base={type:'fill',angle,spacing,stitch:4,underlay:st.underlayType,pull:st.pullComp??.2,ties:true,satinMax:st.satinLimit,satinSpacing:st.satinStep,satinOverlap:st.satinOverlap};
   const explicit=stitchPatterns.family(st.style)==='satin';
   const recipe=explicit?{...base,type:st.style==='raised-satin'?st.style:'satin',patterns:st.patterns,
    direction:st.satinDirection,outline:st.style==='satin-outline',satinSpacing:st.style==='zigzag'?Math.max(.85,st.satinStep*2):st.satinStep}:
    st.style in stitchPatterns.types?{...base,type:st.style,patterns:st.patterns}:fvAutoRecipe(rings,{...base,patterns:st.patterns},st.satinLimit);
   const paths=fvBuildPaths(src,recipe);
   if(paths.length)parts.push({name:strokeHex&&strokeHex!==fillHex?name+' · fill':name,hex:fillHex,paths,src,recipe,bbox:fvBounds(rings.flat())});}}
  if(strokeHex){const w=(+shape.strokeWidth||0)*mmPerPx;if(w>7)satinCapped++;
   const src={kind:'outline',rings:contours.map(c=>c.pts),widthMm:Math.min(7,w)},recipe={type:w>=1?'satin':'outline',width:Math.min(7,Math.max(1,w)),angle:0,underlay:true,pull:0,ties:true},paths=fvBuildPaths(src,recipe);
   const b=fvBounds(contours.flatMap(c=>c.pts));if(paths.length)parts.push({name:fillHex&&strokeHex!==fillHex?name+' · outline':name,hex:strokeHex,paths,src,recipe,bbox:{minx:b.minx-w/2,miny:b.miny-w/2,maxx:b.maxx+w/2,maxy:b.maxy+w/2}});}
 }
 // Group same-coloured parts to save thread changes, but never move a part ahead of one it overlaps.
 const overlaps=(a,b)=>a.minx<=b.maxx&&b.minx<=a.maxx&&a.miny<=b.maxy&&b.miny<=a.maxy,groups=[];
 for(const part of parts){if(!part.paths.length)continue;let target=null;for(let g=groups.length-1;g>=0;g--){if(groups[g].hex===part.hex){target=groups[g];break;}if(groups[g].parts.some(o=>overlaps(o.bbox,part.bbox)))break;}
  if(target)target.parts.push(part);else groups.push({hex:part.hex,parts:[part]});}
 let ordered=groups.flatMap(g=>g.parts);
 // Within one colour the stacking order does not show, so sew it like a digitizer: start with the
 // part nearest the design centre (centre-out keeps fabric distortion moving outwards), then always
 // the nearest remaining part.
 for(const g of groups){if(g.parts.length<2)continue;const left=g.parts.slice(),seq=[];const centre=p=>({x:(p.bbox.minx+p.bbox.maxx)/2,y:(p.bbox.miny+p.bbox.maxy)/2});
  let cur=null;const within=(a,b)=>a!==b&&a.bbox.minx>=b.bbox.minx&&a.bbox.maxx<=b.bbox.maxx&&a.bbox.miny>=b.bbox.miny&&a.bbox.maxy<=b.bbox.maxy,depth=p=>left.filter(o=>within(p,o)).length;
  left.sort((a,b)=>depth(b)-depth(a)||Math.hypot(centre(a).x,centre(a).y)-Math.hypot(centre(b).x,centre(b).y));
  seq.push(left.shift());cur=seq[0].paths.at(-1)?.at(-1);
  while(left.length){let bi=0,bd=Infinity;left.forEach((p,i)=>{const d=Math.min(...p.src.rings.map(r=>fvNearestOnRings([r],cur).d));if(d<bd){bd=d;bi=i;}});const next=left.splice(bi,1)[0];seq.push(next);cur=next.paths.at(-1)?.at(-1)||cur;}
  g.parts=seq;}
 ordered=groups.flatMap(g=>g.parts);
 // Closest join: rebuild each part so it starts nearest to where the previous part ended.
 let exit=null;for(const part of ordered){if(exit){part.recipe={...part.recipe,entry:exit};const again=fvBuildPaths(part.src,part.recipe);if(again.length)part.paths=again;}exit=part.paths.at(-1)?.at(-1)||exit;}
 const points=ordered.reduce((n,p)=>n+p.paths.reduce((m,q)=>m+q.length,0),0);
 if(!ordered.length)throw new Error('The visible shapes produced no stitches.');
 if(points>400000)throw new Error('The design would need too many stitches. Reduce the design width or simplify the paths first.');
 // Open the vector design in its own Stitch Lab tab instead of replacing the current design.
 const hasDesign=events.some(e=>e.type==='stitch')||jefLayers.length>0||manual.length>0||textLayers.some(t=>t.content);
 if(hasDesign&&window.FervorDocs?.ready)window.FervorDocs.openSaved(doc.name||'FERVOR Vector');else window.FervorDocs?.beforeOpen?.(doc.name||'FERVOR Vector');
 await window.FervorWorkspace.newBlank(doc.name||'FERVOR Vector');
 const imported=ordered.map(part=>{const layer=makeJefLayer(part.paths,0,part.name);layer.threadCode=fvNearestJefThread(part.hex);layer.threadHex=part.hex;layer.fervorVector={hex:part.hex};layer.fvSource=part.src;layer.fvRecipe=part.recipe;
  // Centre the layer on its source so later resizes scale about the shape, not the stitches.
  const bb=fvBounds(part.src.rings.flat());layer.center={x:(bb.minx+bb.maxx)/2,y:(bb.miny+bb.maxy)/2};return layer;});
 captureLayerUndo();jefLayers.push(...imported);vectorHandoff=true;syncMode();
 selectedParts=new Set();selectionSync();refreshLayerList();switchTab('layers');
 $('show-art').checked=false;document.body.classList.remove('fv18-empty');
 previewMode=DEFAULT_PREVIEW_MODE;syncViewButtons();fitOnNextRebuild=true;queueRebuild();window.FervorDocs?.afterOpen?.();
 const colours=new Set(ordered.map(p=>p.hex)).size,heightMm=(bb.maxy-bb.miny)*mmPerPx;
 setStatus(`${imported.length} vector parts · ${colours} thread colour${colours===1?'':'s'}`,'success');
 alertMessage(`Vector design added: ${widthMm.toFixed(0)} × ${heightMm.toFixed(1)} mm, ${imported.length} stitch parts, ${groups.length} thread block${groups.length===1?'':'s'}. Thread colours are the nearest Janome JEF codes; set your actual threads on the machine.${satinCapped?` ${satinCapped} outline(s) wider than 7 mm were capped to a 7 mm satin.`:''}`);
 return {layers:imported.length,colors:colours,widthMm,heightMm,source:'vector'};
}

// FERVOR homepage navigation bridge. It reuses the existing IndexedDB store and editor functions.
window.FervorWorkspace={
 snapshot(){return {...projectSnapshot(),fv18Blank:document.body.classList.contains('fv18-empty')};},
 async restore(data){await loadProject(data,{id:data?.fileId,name:data?.sourceName});document.body.classList.toggle('fv18-empty',!!data?.fv18Blank);},
 async loadSample(){if(await loadImage(window.NOMU_SAMPLE,'GALLOP_NOMU'))window.FervorDocs?.afterOpen();},
 async newBlank(name){previewThread='auto';previewOriginal=false;$('preview-thread').value='auto';$('preview-original').checked=false;const c=document.createElement('canvas');c.width=640;c.height=360;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);await loadImage(c.toDataURL('image/png'),name);document.body.classList.add('fv18-empty');setStatus('Blank canvas · drop artwork to begin','neutral');},
 async importArtwork(file){return handleUpload(file);},
 async importVectorPaths(document){return fvImportVectorPaths(document);},
 async addImage(file){const result=await addImageLayer(file);document.body.classList.remove('fv18-empty');return result;},
 async openRecent(item){return openSavedStitch(item);},
 currentFileId(){return currentProjectId;},
 async restoreSaved(item){
  if(!await loadProject(item.project,{id:item.id,name:item.name,storedSignature:item.signature}))throw Error('The stitch project could not be opened.');
  document.body.classList.toggle('fv18-empty',!!item.project.fv18Blank);
 },
 renameCurrent(name){sourceName=name;},
 saveCurrent(){flushRecentSave();return storeRecentDesign({...projectSnapshot(),fv18Blank:document.body.classList.contains('fv18-empty')});},
 flushSave:flushRecentSave,
 openArtwork(){switchTab('design');$('file-input').click();},
 currentName(){return sourceName||'Untitled design';},
 openNote(id){
  if(!annotations.some(note=>note.id===id))return;
  if(noteVisibility==='hidden')noteVisibility='pins';
  openedNote=id;render();
  const ui=noteElements.get(id);
  if(ui?.wrapper.hidden||!ui?.wrapper.getClientRects().length)window.FervorZoom?.fitHoop();
  render();noteElements.get(id)?.input.focus({preventScroll:true});
 },
 showGuide(){ $('guide').click(); },
 notify(message,error=false){alertMessage(message,error);},
 goToEditor(){switchTab('design');},
 goToStage(id){switchStage(id);}
};

const partControlHomes=new Map();
let focusedOrderPart=null,checkedPart=null,reviewHighlight=null,satinFieldSlot=null;
const primarySatinFields=['satin-direction','satin-step','satin-limit'];
function selectedOrderKey(){
 if(selectedText>=0)return 'text:'+selectedText;
 const parts=selectedPartRecords(),p=parts.length===1?parts[0]:null;
 return p?(p.kind==='raster'?'shape:':'jef:')+p.id:(!parts.length&&focusedOrderPart?.startsWith('manual:')?focusedOrderPart:null);
}
function syncOrderSelection(){
 const key=selectedOrderKey();
 for(const row of $('order-list').children){
  const active=row.dataset.orderKey===key;
  row.classList.toggle('selected',active);
  if(active)row.querySelector('.order-detail')?.setAttribute('aria-current','true');
  else row.querySelector('.order-detail')?.removeAttribute('aria-current');
 }
}
function selectOrderPart(key){
 const [kind,id]=key.split(':');
 focusedOrderPart=null;
 if(kind==='shape')selectObject(+id);
 else if(kind==='jef')selectJefLayer(+id);
 else if(kind==='text')selectText(+id);
 else{focusedOrderPart=key;selectObject(-1);}
 syncPartReview();render();
}
function bindPartReview(){
 const tray=$('fv-sew-tray');
 for(const control of [tray,...['shape-style','shape-angle','shape-spacing','layer-w','layer-h'].map(id=>$(id).closest('.sl-field'))]){
  const home=document.createComment('Part settings');
  control.before(home);partControlHomes.set(control,home);
 }
 const baseline=$('panel-stitches').querySelector('section.image-only');
 satinFieldSlot=document.createElement('div');satinFieldSlot.id='fv-primary-satin';
 $('spacing').closest('.sl-field').before(satinFieldSlot);
 satinFieldSlot.append(...primarySatinFields.map(id=>$(id).closest('.sl-field')));
 const shared=document.createElement('details');
 shared.className='sl-advanced';shared.id='fv-shared-satin';shared.hidden=true;
 const summary=document.createElement('summary');summary.textContent='Shared satin settings';
 shared.append(summary);$('fv-part-controls').after(shared);
 const defaults=document.createElement('details'),title=document.createElement('summary');
 defaults.id='fv-design-defaults';defaults.className='sl-advanced fv-design-defaults';title.textContent='Design-wide fill settings';
 baseline.before(defaults);defaults.append(title,baseline);defaults.open=true;
 $('fv-check-part').addEventListener('click',()=>{
  const key=selectedOrderKey();
  checkedPart=checkedPart===key?null:key;syncPartReview();render();
 });
 $('fv-review-sequence').addEventListener('click',()=>switchTab('order'));
 $('fv-logo-ratio').addEventListener('change',e=>{
  const layer=selectedLayer();if(!layer?.fvSource)return;
  captureLayerUndo();layer.fvKeepRatio=e.target.checked;scheduleRecentSave();
 });
 $('fv-part-lettering').addEventListener('click',()=>switchTab('text',true));
 syncPartReview();
}
function syncPartReview(){
 const slot=$('fv-part-controls');if(!slot)return;
 const key=selectedOrderKey(),inFill=currentTab==='stitches',active=key!==null;
 const [kind,id]=key?.split(':')||[];
 const layer=kind==='jef'?jefLayers.find(layer=>layer.id===+id):null,generated=layer?.fvSource;
 const ratio=$('fv-logo-ratio');
 ratio.closest('label').hidden=!(generated?.nomuFigure||generated?.oval);
 ratio.checked=layer?.fvKeepRatio!==false;
 const obj=kind==='shape'?objects[+id-1]:null;
 const rawFill=$('fv-design-defaults');
 if(rawFill){
  const collapsed=active&&mode==='image';
  if(rawFill.dataset.scoped!==String(collapsed)){rawFill.dataset.scoped=String(collapsed);rawFill.open=!collapsed;}
  rawFill.querySelector('summary').hidden=!collapsed;
  rawFill.hidden=mode!=='image';
 }
 for(const [control,home] of partControlHomes){
  const belongs=control.id==='fv-sew-tray'||control.querySelector('#layer-w,#layer-h')?generated:obj;
  if(inFill&&belongs){
   if(control.parentElement!==slot)slot.append(control);
  }
  else if(control.previousSibling!==home)home.after(control);
 }
 $('fv-part-review').hidden=!active;
 $('fv-part-lettering').hidden=kind!=='text';
 const family=stitchPatterns.family(UI.style.value),satin=family==='satin',simple=['outline','triple'].includes(family);
 const partFamily=obj?stitchPatterns.family(obj.style==='auto'?UI.style.value:obj.style):null;
 const partSatin=partFamily==='satin';
 if(satinFieldSlot){
  const shared=$('fv-shared-satin'),useShared=inFill&&partSatin;
  if(useShared&&satinFieldSlot.parentElement!==shared)shared.append(satinFieldSlot);
  else if(!useShared&&satinFieldSlot.parentElement===shared)$('spacing').closest('.sl-field').before(satinFieldSlot);
  shared.hidden=!useShared;
  satinFieldSlot.hidden=!useShared&&!satin&&UI.style.value!=='auto';
  $('spacing').closest('.sl-field').hidden=satin||simple;
  $('length').closest('.sl-field').hidden=satin;
  $('fill-angle').closest('.sl-field').hidden=simple||(satin&&$('satin-direction').value==='auto');
 }
 if(obj&&inFill){
  $('shape-spacing').closest('.sl-field').hidden=partSatin||['outline','triple'].includes(partFamily);
  $('shape-angle').closest('.sl-field').hidden=obj.style==='auto'||(partSatin&&$('satin-direction').value==='auto')||['outline','triple'].includes(partFamily);
 }else for(const id of ['shape-spacing','shape-angle'])$(id).closest('.sl-field').hidden=false;
 const hint=$('fv-part-hint');
 hint.textContent=kind==='jef'&&!generated?'This part has existing needle paths. Review the sequence or digitize its source artwork to change the fill.':'';
 hint.hidden=!hint.textContent;
 syncOrderSelection();
 reviewHighlight=null;
 if(!active){checkedPart=null;return;}
 if(checkedPart!==key)checkedPart=null;
 const item=stitchOrderItems.find(part=>part.key===key),open=checkedPart===key;
 $('fv-part-title').textContent=item?.name||stitchOrderLabel(key);
 const button=$('fv-check-part');
 button.textContent=open?'Close check':'Check this part';button.setAttribute('aria-expanded',String(open));
 $('fv-part-result').hidden=!open;
 if(!open)return;
 const paths=item?.previewEvents||[];
 let previous=null,maxStitch=0,short=0,overlong=0,longestStitch=null;
 for(const point of paths){
  if(point.type==='stitch'&&previous){
   const length=dist(previous,point);
   if(length<.25&&!point.role&&!previous.role)short++;
   if(length>9)overlong++;
   if(length>maxStitch){maxStitch=length;longestStitch={from:previous,to:point};}
  }
  previous=point;
 }
 const jumps=(travelAudit?.jumps||[]).filter(j=>j.from.orderKey===key&&j.next.orderKey===key);
 const uncut=jumps.filter(j=>!j.cut&&j.distance>=3),longest=jumps.reduce((a,b)=>!a||b.distance>a.distance?b:a,null);
 reviewHighlight=uncut.reduce((a,b)=>!a||b.distance>a.distance?b:a,null)||(overlong?longestStitch:null)||longest;
 const highlight=reviewHighlight?(overlong&&reviewHighlight===longestStitch?'Highlighted the longest stitch.':'Highlighted '+(reviewHighlight.cut?'a marked cut':'an unmarked jump')+'.'):'';
 $('fv-part-report').textContent=paths.length
  ?[item.stitches.toLocaleString()+' stitches',jumps.length+' internal jumps',uncut.length+' unmarked ≥3 mm',
    'Longest stitch '+maxStitch.toFixed(1)+' mm'+(overlong?' · '+overlong+' over 9 mm':''),
    short?short+' untagged movements under 0.25 mm':'',highlight].filter(Boolean).join(' · ')
  :'This part has no active stitches.';
}
function drawPartReview(xy){
 if(!reviewHighlight||currentTab!=='stitches')return;
 const {from,to}=reviewHighlight,a=xy(from.x,from.y),b=xy(to.x,to.y);
 ctx.save();ctx.lineCap='round';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
 ctx.strokeStyle='#211813';ctx.lineWidth=6;ctx.stroke();
 ctx.strokeStyle='#ffc46d';ctx.lineWidth=3;ctx.setLineDash([5,4]);ctx.stroke();ctx.setLineDash([]);
 for(const p of [a,b]){ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fillStyle='#ffc46d';ctx.fill();}
 ctx.restore();
}

/* Design notes use local coordinates when attached to a part and save as project metadata. */
const notePalette=[['Gold','#f4d37e'],['Mint','#a6d8bd'],['Rose','#edb2be'],['Sky','#add0ed'],['Gray','#d6cec2']];
let annotations=[],noteVisibility='pins',openedNote=null;
const noteElements=new Map();
function safeNotePoint(value){return !!value&&Number.isFinite(value.x)&&Number.isFinite(value.y);}
function restoreNotes(data,visibility){
 annotations=Array.isArray(data)?data.filter(n=>n&&typeof n.id==='string'&&safeNotePoint(n.position)).map(n=>({
  id:n.id,updatedAt:Number(n.updatedAt)||0,attachments:window.FervorNoteAttachments.normalize(n.attachments),text:typeof n.text==='string'?n.text.slice(0,2000):'',
  color:/^#[0-9a-f]{6}$/i.test(n.color)?n.color:notePalette[0][1],position:n.position,
  anchor:n.anchor&&['jef','raster','text'].includes(n.anchor.kind)&&safeNotePoint(n.anchor.local)?n.anchor:null
 })): [];
 if(visibility!==undefined||!Array.isArray(data))noteVisibility=['pins','notes','hidden'].includes(visibility)?visibility:'pins';
 openedNote=null;noteElements.clear();$('fv-note-layer')?.replaceChildren();
}
function createEditorId(){return globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
function noteTextLocal(p,t){
 const a=-(t.rotation||0)*Math.PI/180,x=p.x-t.x,y=p.y-t.y;
 return {x:x*Math.cos(a)-y*Math.sin(a),y:x*Math.sin(a)+y*Math.cos(a)};
}
function noteAnchor(p,part){
 if(!part)return null;
 const {kind,L,id}=part;
 if(kind==='text'){
  L.noteAnchor||=createEditorId();
  return {kind,id:L.noteAnchor,local:noteTextLocal(p,L)};
 }
 const anchor={kind,id,local:fvNodeLocal(p,part)};
 if(kind==='raster'){anchor.cx=L.cx;anchor.cy=L.cy;}
 return anchor;
}
function notePart(anchor){
 if(anchor?.kind==='text'){
  const L=textLayers.find(t=>t.noteAnchor===anchor.id);
  return L?{kind:'text',L}:null;
 }
 if(anchor?.kind==='jef'){
  const L=jefLayers.find(L=>L.id===anchor.id);
  return L?{kind:'jef',id:L.id,L}:null;
 }
 if(anchor?.kind==='raster'&&mode==='image'){
  const L=objects.find(o=>Math.hypot(o.cx-anchor.cx,o.cy-anchor.cy)<4);
  return L?{kind:'raster',id:L.id,L}:null;
 }
 return null;
}
function noteWorld(note,s){
 const part=notePart(note.anchor);
 if(part?.kind==='text')return textTransform(part.L)(note.anchor.local);
 if(part)return fvNodeWorld(note.anchor.local,part);
 const scale=note.position.width?s.width/note.position.width:1;
 return transformPoint({x:note.position.x*scale,y:note.position.y*scale},0,0,s);
}
function moveCanvasNote(note,p){
 const s=getSettings();
 note.position={...fromWorld(p.x,p.y,s),width:s.width};
 const part=notePart(note.anchor);
 note.anchor=noteAnchor(p,part);
 render();
}
function bindNoteDrag(note,handle){
 let drag=null,suppressClick=false;
 handle.addEventListener('pointerdown',e=>{
  if(!e.isPrimary||e.button!==0||spaceHeld)return;
  suppressClick=false;
  const start=toWorld(e),position=noteWorld(note,getSettings());
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,offset:{x:position.x-start.x,y:position.y-start.y},moved:false};
  handle.setPointerCapture(e.pointerId);
 });
 handle.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  if(!drag.moved){
   if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<4)return;
   captureLayerUndo();drag.moved=true;handle.classList.add('fv-note-dragging');
  }
  const bounds=canvas.getBoundingClientRect(),margin=14,scale=display.scale;
  const p=toWorld({clientX:Math.max(bounds.left+margin,Math.min(bounds.right-margin,e.clientX)),
   clientY:Math.max(bounds.top+margin,Math.min(bounds.bottom-margin,e.clientY))});
  const insetX=margin*canvas.width/bounds.width,insetY=margin*canvas.height/bounds.height;
  moveCanvasNote(note,{
   x:Math.max((insetX-display.cx)/scale,Math.min((canvas.width-insetX-display.cx)/scale,p.x+drag.offset.x)),
   y:Math.max((insetY-display.cy)/scale,Math.min((canvas.height-insetY-display.cy)/scale,p.y+drag.offset.y))
  });
 });
 const finish=e=>{
  if(!drag||e.pointerId!==drag.id)return;
  if(drag.moved){suppressClick=true;scheduleRecentSave();}
  drag=null;handle.classList.remove('fv-note-dragging');
 };
 handle.addEventListener('pointerup',finish);
 handle.addEventListener('lostpointercapture',finish);
 handle.addEventListener('click',e=>{
  if(suppressClick&&e.detail>0){e.stopImmediatePropagation();e.preventDefault();suppressClick=false;}
 },true);
}
function noteSelectedPart(){
 const parts=selectedPartRecords();
 if(parts.length===1)return parts[0];
 return selectedText>=0?{kind:'text',L:textLayers[selectedText]}:null;
}
function addCanvasNote(p,part=null){
 if(!part){
  const text=textHitTest(p);
  if(text>=0)part={kind:'text',L:textLayers[text]};
  else{
   const id=hitLayer(p),raster=id===null&&mode==='image'?hitRasterWorld(p):-1;
   if(id!==null)part={kind:'jef',id,L:jefLayers.find(L=>L.id===id)};
   else if(raster>0)part={kind:'raster',id:raster,L:objects[raster-1]};
  }
 }
 captureLayerUndo();
 const s=getSettings(),note={id:createEditorId(),updatedAt:Date.now(),text:'',color:notePalette[0][1],position:{...fromWorld(p.x,p.y,s),width:s.width},anchor:noteAnchor(p,part)};
 annotations.push(note);openedNote=note.id;
 if(noteVisibility==='hidden')noteVisibility='pins';
 scheduleRecentSave();render();
 noteElements.get(note.id)?.input.focus({preventScroll:true});
}
function syncNoteToolbar(){
 const tools=$('fv-note-tools');if(!tools)return;
 tools.hidden=tool!=='note';
 $('fv-note-selected').disabled=!noteSelectedPart();
 $('fv-note-view').value=noteVisibility;
}
function bindNotes(){
 $('fv-note-selected').addEventListener('click',()=>{
  const part=noteSelectedPart();if(!part)return;
  if(part.kind==='text'){addCanvasNote({x:part.L.x,y:part.L.y},part);return;}
  const b=partBounds(part);addCanvasNote({x:(b.minx+b.maxx)/2,y:(b.miny+b.maxy)/2},part);
 });
 $('fv-note-view').addEventListener('change',e=>{noteVisibility=e.target.value;openedNote=null;scheduleRecentSave();render();});
}
function makeNoteElement(note){
 const wrapper=document.createElement('div');wrapper.className='fv-canvas-note';
 wrapper.innerHTML=`<button type="button" class="fv-note-pin" aria-expanded="false"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 4h16v10l-6 6H4z M14 20v-6h6 M8 8h8 M8 12h4"/></svg></button>
  <div class="fv-note-card" hidden>
   <strong class="fv-note-caption" title="Drag to move the note"></strong>
   <textarea maxlength="2000" rows="3" aria-label="Note text" placeholder="Write a note…"></textarea>
   <div class="fv-note-colors" role="group" aria-label="Note color"><input type="color" aria-label="Custom note color"></div>
   <div class="fv-note-actions"><button type="button" class="fv-note-remove">Delete note</button><button type="button" class="fv-note-done">Done</button></div>
  </div>`;
 $('fv-note-layer').append(wrapper);
 const marker=wrapper.querySelector('.fv-note-pin'),card=wrapper.querySelector('.fv-note-card'),input=card.querySelector('textarea');
 const heading=card.querySelector('strong'),colors=card.querySelector('.fv-note-colors'),custom=colors.querySelector('input');
 bindNoteDrag(note,marker);bindNoteDrag(note,heading);
 marker.addEventListener('keydown',e=>{
  const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  const d=directions[e.key];if(!d)return;
  e.preventDefault();e.stopPropagation();
  if(!e.repeat)captureLayerUndo();
  const p=noteWorld(note,getSettings()),step=e.shiftKey?4:1;
  moveCanvasNote(note,{x:p.x+d[0]*step,y:p.y+d[1]*step});scheduleRecentSave();
 });
 let textUndo=false;
 input.value=note.text;
 function noteChanged(){note.updatedAt=Date.now();scheduleRecentSave();render();}
 window.FervorNoteAttachments.bind(card,note,captureLayerUndo,noteChanged);
 function syncColor(){
  wrapper.style.setProperty('--note-color',note.color);custom.value=note.color;
  for(const choice of colors.querySelectorAll('button'))choice.setAttribute('aria-pressed',String(choice.dataset.color===note.color));
 }
 function setColor(color){if(note.color===color)return;captureLayerUndo();note.color=color;syncColor();noteChanged();}
 for(const [label,color] of notePalette){
  const choice=document.createElement('button');choice.type='button';choice.title=label;choice.setAttribute('aria-label',label);
  choice.dataset.color=color;choice.style.background=color;
  choice.addEventListener('click',()=>setColor(color));custom.before(choice);
 }
 syncColor();custom.addEventListener('change',()=>setColor(custom.value));
 function close(){
  if(noteVisibility==='notes')noteVisibility='pins';
  openedNote=null;scheduleRecentSave();render();marker.focus({preventScroll:true});
 }
 input.addEventListener('input',()=>{if(!textUndo){captureLayerUndo();textUndo=true;}note.text=input.value;noteChanged();});
 input.addEventListener('blur',()=>{textUndo=false;});
 card.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}});
 marker.addEventListener('click',()=>{if(openedNote===note.id){close();return;}openedNote=note.id;render();input.focus({preventScroll:true});});
 card.querySelector('.fv-note-done').addEventListener('click',close);
 card.querySelector('.fv-note-remove').addEventListener('click',()=>{
  captureLayerUndo();annotations=annotations.filter(n=>n!==note);openedNote=null;scheduleRecentSave();render();canvas.focus({preventScroll:true});
 });
 return {wrapper,marker,card,input,heading};
}
function drawNotes(xy){
 const layer=$('fv-note-layer');if(!layer)return;
 syncNoteToolbar();
 layer.hidden=cleanCapture||noteVisibility==='hidden';
 if(layer.hidden)return;
 for(const [id,ui] of noteElements)if(!annotations.some(n=>n.id===id)){ui.wrapper.remove();noteElements.delete(id);}
 if(!annotations.length)return;
 const s=getSettings(),w=layer.clientWidth,h=layer.clientHeight;
 for(const n of annotations){
  if(!noteElements.has(n.id))noteElements.set(n.id,makeNoteElement(n));
  const {wrapper,marker,card,heading}=noteElements.get(n.id),p=noteWorld(n,s),q=xy(p.x,p.y);
  const x=q.x*w/canvas.width,y=q.y*h/canvas.height,open=noteVisibility==='notes'||openedNote===n.id;
  wrapper.hidden=x<0||x>w||y<0||y>h;
  if(wrapper.hidden)continue;
  wrapper.style.left=x+'px';wrapper.style.top=y+'px';wrapper.classList.toggle('fv-note-current',openedNote===n.id);
  wrapper.style.setProperty('--note-card-x',Math.min(13,Math.max(8-x,w-x-258))+'px');
  wrapper.classList.toggle('fv-note-above',y>h-198);
  marker.setAttribute('aria-expanded',String(open));
  const label=n.text.trim().split('\n')[0].slice(0,65)||'Sticky note';
  marker.title=label+' · Drag to move';marker.setAttribute('aria-label','Open note: '+label);
  heading.textContent=n.anchor?'Part note':'Canvas note';
  card.hidden=!open;
 }
}

initializeTabs();mountTextFonts();
for(const id of ['stitch-style','shape-style','text-style','line-style','border-stitch-style'])mountStitchPicker(id);
setSettings(DEFAULTS);bindControls();initCreationStudio();setTool('select');window.FervorWorkspace.initialized=window.FervorWorkspace.newBlank('Untitled');
})();

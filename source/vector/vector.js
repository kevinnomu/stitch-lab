/* FERVOR Vector — native SVG drawing, trace, magic selection and Stitch Lab handoff. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const root=$('fervor-vector'),svg=$('fvv-svg');if(!root||!svg||!window.FervorVectorTrace)return;
const NS='http://www.w3.org/2000/svg';
const T=window.FervorVectorTrace,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const state={name:'Untitled Vector',fileId:null,shapes:[],selected:null,node:null,tool:'select',source:null,mask:null,maskApplied:false,tracePending:null,history:[],future:[],drag:null,pen:null,fitPaper:true,zoom:1,view:{x:0,y:0,w:960,h:640},dirty:false,preview:'result',maskVersion:0,space:false};
let nextId=1,notification=null,documentRevision=0;
let vectorTabSerial=1,activeVectorTab='vtab-1',vectorTabs=[{id:'vtab-1',name:'Untitled Vector',doc:null}];
const el=(tag,attrs={},text='')=>{const node=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))if(v!==null&&v!==undefined)node.setAttribute(k,String(v));if(text)node.textContent=text;return node;};
const deep=v=>JSON.parse(JSON.stringify(v));
const crop=window.FervorVectorCrop({state,svg,el,note,imageFrom,filename:fileSafeName,changed:()=>{
 state.maskVersion++;mark();scheduleRetrace();renderRaster();
},trace:()=>{setTool('select');showPanel('trace');traceImage();}});
function note(message){$('fvv-message').textContent=message;clearTimeout(notification);notification=setTimeout(()=>{$('fvv-message').textContent='FERVOR VECTOR · LOCAL DOCUMENT'},5200);}
function mark(){state.dirty=true;autoSave();}
function snapshot(){return deep(state.shapes)}
function checkpoint(){state.history.push(snapshot());if(state.history.length>60)state.history.shift();state.future=[];mark();}
function undo(){if(!state.history.length)return;state.future.push(snapshot());state.shapes=state.history.pop();state.selected=null;state.node=null;render();mark();}
function redo(){if(!state.future.length)return;state.history.push(snapshot());state.shapes=state.future.pop();state.selected=null;state.node=null;render();mark();}
function id(){let v;do{v='vector-'+(nextId++).toString(36);}while(state.shapes.some(s=>s.id===v));return v;}
// Saved shapes keep their ids, so new ids must start above the highest one in use.
function syncNextId(){for(const s of state.shapes){const m=/^vector-([0-9a-z]+)$/.exec(s.id);if(m){const v=parseInt(m[1],36);if(Number.isFinite(v)&&v>=nextId)nextId=v+1;}}}
const n=(x,y,inn=null,out=null)=>({x,y,in:inn,out});
const contour=(points,closed=true)=>({closed,nodes:points.map(p=>n(p.x,p.y,p.in||null,p.out||null))});
function normShapes(raw){if(!Array.isArray(raw))return [];return raw.filter(v=>v&&typeof v==='object').map(s=>({
 id:String(s.id||id()),name:String(s.name||'Vector Shape').slice(0,120),fill:String(s.fill||'none'),stroke:String(s.stroke||'none'),strokeWidth:clamp(+s.strokeWidth||2,.25,80),lastFill:s.lastFill||'#a3cda7',fillRule:s.fillRule==='nonzero'?'nonzero':'evenodd',visible:s.visible!==false,locked:!!s.locked,contours:(s.contours||[]).map(c=>({closed:c.closed!==false,nodes:(c.nodes||[]).filter(p=>Number.isFinite(+p.x)&&Number.isFinite(+p.y)).map(p=>({x:+p.x,y:+p.y,in:p.in?{x:+p.in.x,y:+p.in.y}:null,out:p.out?{x:+p.out.x,y:+p.out.y}:null}))})).filter(c=>c.nodes.length>=2)
 })).filter(s=>s.contours.length);}
function pathD(c){if(!c||c.nodes.length<2)return '';const pts=c.nodes,format=v=>Number(v.toFixed(3));let d=`M ${format(pts[0].x)} ${format(pts[0].y)}`;const length=c.closed?pts.length:pts.length-1;
 for(let i=0;i<length;i++){const a=pts[i],b=pts[(i+1)%pts.length];if(a.out||b.in){const o=a.out||a,q=b.in||b;d+=` C ${format(o.x)} ${format(o.y)} ${format(q.x)} ${format(q.y)} ${format(b.x)} ${format(b.y)}`;}else d+=` L ${format(b.x)} ${format(b.y)}`;}return c.closed?d+' Z':d;
}
function shapeD(s){return s.contours.map(pathD).join(' ')}
function newShape(name,points,fill='#a3cda7',closed=true){return {id:id(),name,fill,stroke:'none',strokeWidth:3,lastFill:fill,visible:true,locked:false,contours:[contour(points,closed)]};}
function selected(){return state.shapes.find(s=>s.id===state.selected)||null;}
function setSelected(id){state.selected=id;state.node=null;render();}
function setTool(tool){
 const previous=state.tool;state.tool=tool;state.pen=null;
 if(tool==='crop'){
  showPanel('crop');
  if(state.source){state.source.visible=true;setPreviewMode('source');}
 }else if(previous==='crop'&&currentPanel()==='crop'){
  showPanel(state.source?'trace':'artwork');
 }root.querySelectorAll('[data-fvv-tool]').forEach(b=>{const on=b.dataset.fvvTool===tool;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});$('fvv-tool-label').textContent=tool==='crop'?'MAGNETIC CROP':tool==='magic'?'FLOOD':tool.toUpperCase().replaceAll('-',' ');svg.style.cursor=tool==='hand'?'grab':tool==='select'?'default':'crosshair';render();}
function setSettingsOpen(open){root.classList.toggle('fvv-settings-open',!!open);const b=$('fvv-settings-button');b?.setAttribute('aria-expanded',String(!!open));if(b){b.title=b.querySelector('span').textContent=open?'Hide settings':'Show settings';}if(!root.hidden)updateViewport();}
function stageActive(stage){root.dataset.stage=stage;root.querySelectorAll('[data-fvv-stage]').forEach(b=>{const on=b.dataset.fvvStage===stage;b.classList.toggle('active',on);b.setAttribute('aria-current',on?'step':'false');});}
function currentPanel(){return root.querySelector('[data-fvv-panel-content].active')?.dataset.fvvPanelContent||'artwork';}
// The centered workflow is the only stage navigation. The inspector is contextual.
function showPanel(panel,open=true){root.querySelectorAll('[data-fvv-panel-content]').forEach(e=>e.classList.toggle('active',e.dataset.fvvPanelContent===panel));const stage=panel==='trace'||panel==='crop'?'trace':panel==='layers'||panel==='appearance'?'paths':panel==='export'?'export':'artwork';stageActive(stage);setSettingsOpen(open);}
function selectStage(stage){if(state.tool==='crop')setTool('select');if(stage==='artwork')showPanel('artwork',false);else showPanel(stage==='trace'?'trace':stage==='paths'?'appearance':'export');}
function setPreviewMode(v){if(!['source','result','split'].includes(v))v='result';state.preview=v;const input=$('fvv-trace-view');if(input)input.value=v;root.querySelectorAll('[data-fvv-view]').forEach(b=>{const selected=b.dataset.fvvView===v;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});renderRaster();renderTrace();const paths=$('fvv-path-layer');if(paths)paths.style.opacity=v==='source'?'.3':'1';}
function viewportPixels(){const rect=svg.getBoundingClientRect();return {w:Math.max(1,rect.width||svg.clientWidth||960),h:Math.max(1,rect.height||svg.clientHeight||640)};}
function fitSelection(onlySelected=false){const objects=onlySelected?(selected()?[selected()]:[]):state.shapes.filter(s=>s.visible!==false);const pts=objects.flatMap(boundPoints);if(!pts.length){fitArtboard();return;}const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x)),minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y));state.fitPaper=false;const bounds={x:(minX+maxX)/2,y:(minY+maxY)/2,w:Math.max(15,maxX-minX),h:Math.max(15,maxY-minY)};const vp=viewportPixels();state.zoom=clamp(Math.min(vp.w/bounds.w,vp.h/bounds.h)*.78,.1,8);state.view={x:bounds.x-vp.w/state.zoom/2,y:bounds.y-vp.h/state.zoom/2,w:vp.w/state.zoom,h:vp.h/state.zoom};useView();}

function svgCoordinates(event){const pt=svg.createSVGPoint();pt.x=event.clientX;pt.y=event.clientY;const m=svg.getScreenCTM();if(!m)return {x:0,y:0};const o=pt.matrixTransform(m.inverse());return {x:o.x,y:o.y};}
function makeShapePath(s,preview=false){return el('path',{'d':shapeD(s),'class':'fvv-shape'+(s.id===state.selected?' fvv-selected':''),'fill':s.fill||'none','stroke':s.stroke||'none','stroke-width':s.strokeWidth||2,'fill-rule':s.fillRule||'evenodd','data-fvv-id':preview?null:s.id,'vector-effect':'non-scaling-stroke','opacity':preview?.76:1});}
// The source image stays visible while isolating and tracing. After Expand it hides in the
// Vector paths view, and the Source / Trace preview views always bring it back.
function renderRaster(){const layer=$('fvv-raster-layer');layer.replaceChildren();if(!state.source)return;const view=state.preview||'result';if(state.source.visible===false&&view==='result')return;const r=state.source.rect;
 const original=state.source.originalDataUrl;
 const displayRaster=/^data:image\/(?:png|jpe?g|webp|gif|bmp|x-ms-bmp);/i.test(original||'')?original:state.source.dataUrl;
 const base=view==='source'?1:view==='split'?.55:(state.tracePending?.2:state.shapes.length?.45:1),masked=view!=='source'&&state.maskApplied&&state.mask;
 layer.append(el('image',{x:r.x,y:r.y,width:r.w,height:r.h,href:displayRaster,'preserveAspectRatio':'none','opacity':masked?Math.min(base,.25):base,'data-fvv-raster':'1'}));
 if(masked){if(state.source.maskVersion!==state.maskVersion||!state.source.maskPreview){state.source.maskPreview=T.maskedImage(state.source.imageData,state.mask);state.source.maskVersion=state.maskVersion;}
  layer.append(el('image',{x:r.x,y:r.y,width:r.w,height:r.h,href:state.source.maskPreview,'preserveAspectRatio':'none','opacity':view==='result'&&state.tracePending?.3:1,'class':'fvv-mask-preview'}));}
}
function renderShapes(){const layer=$('fvv-path-layer');layer.replaceChildren();for(const s of state.shapes){if(s.visible!==false)layer.append(makeShapePath(s));}}
function renderTrace(){const layer=$('fvv-trace-layer');layer.replaceChildren();const view=state.preview||'result';layer.style.opacity=view==='source'?'0':view==='split'?'.6':'1';if(!state.tracePending)return;for(const s of state.tracePending)layer.append(makeShapePath(s,true));}
function boundPoints(s){return s.contours.flatMap(c=>c.nodes.map(p=>({x:p.x,y:p.y})));}
function renderGizmos(){const layer=$('fvv-editor-gizmos');layer.replaceChildren();const s=selected();if(s&&s.visible!==false){const points=boundPoints(s);if(points.length){const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;layer.append(el('rect',{x:x-2,y:y-2,width:w+4,height:h+4,class:'fvv-selection-box'}));}
  if(state.tool==='node')for(let ci=0;ci<s.contours.length;ci++)for(let ni=0;ni<s.contours[ci].nodes.length;ni++){const p=s.contours[ci].nodes[ni];if(p.in){layer.append(el('line',{x1:p.x,y1:p.y,x2:p.in.x,y2:p.in.y,class:'fvv-handle-line'}));layer.append(el('circle',{cx:p.in.x,cy:p.in.y,r:4,class:'fvv-control','data-ci':ci,'data-ni':ni,'data-handle':'in'}));}if(p.out){layer.append(el('line',{x1:p.x,y1:p.y,x2:p.out.x,y2:p.out.y,class:'fvv-handle-line'}));layer.append(el('circle',{cx:p.out.x,cy:p.out.y,r:4,class:'fvv-control','data-ci':ci,'data-ni':ni,'data-handle':'out'}));}layer.append(el('rect',{x:p.x-4,y:p.y-4,width:8,height:8,class:'fvv-anchor'+(state.node?.ci===ci&&state.node?.ni===ni?' chosen':''),'data-ci':ci,'data-ni':ni,'data-handle':'anchor'}));}}
 if(state.pen&&state.pen.length){const c=contour(state.pen,false);layer.append(el('path',{d:pathD(c),fill:'none',stroke:'#5fa878','stroke-width':2,'stroke-dasharray':'4 4'}));for(const p of state.pen)layer.append(el('circle',{cx:p.x,cy:p.y,r:3,fill:'#5fa878'}));}
 if(state.drag?.type==='new'&&state.drag.current){const a=state.drag.start,b=state.drag.current;layer.append(el('rect',{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y),fill:'rgba(163,205,167,.22)',stroke:'#4b8c66','stroke-width':1.5,'stroke-dasharray':'5 4'}));}
}
function renderLayers(){const list=$('fvv-layer-list');list.replaceChildren();$('fvv-layer-count').textContent=`${state.shapes.length} SHAPES`;
 [...state.shapes].reverse().forEach(s=>{const row=document.createElement('div');row.className='fvv-layer-row'+(s.id===state.selected?' current':'');row.setAttribute('role','listitem');const chip=document.createElement('span');chip.className='fvv-layer-swatch';chip.style.background=s.fill==='none'?'transparent':s.fill;
 const name=document.createElement('button');name.type='button';name.className='fvv-layer-name';name.textContent=s.name;name.title=s.name+' · double-click to rename';name.addEventListener('click',()=>setSelected(s.id));name.addEventListener('dblclick',()=>renameShape(s.id));
 const visibility=document.createElement('button');visibility.type='button';visibility.textContent=s.visible?'◉':'○';visibility.title=s.visible?'Hide':'Show';visibility.setAttribute('aria-label',(s.visible?'Hide ':'Show ')+s.name);visibility.addEventListener('click',()=>{checkpoint();s.visible=!s.visible;if(!s.visible&&state.selected===s.id){state.selected=null;state.node=null;}render();});
 const lock=document.createElement('button');lock.type='button';lock.className='fvv-layer-lock'+(s.locked?' on':'');lock.textContent=s.locked?'🔒':'🔓';lock.title=s.locked?'Unlock':'Lock (prevents selecting and moving on the canvas)';lock.setAttribute('aria-label',(s.locked?'Unlock ':'Lock ')+s.name);lock.setAttribute('aria-pressed',String(!!s.locked));lock.addEventListener('click',()=>{checkpoint();s.locked=!s.locked;if(s.locked&&state.selected===s.id){state.selected=null;state.node=null;}render();});
 const trash=document.createElement('button');trash.type='button';trash.textContent='×';trash.title='Delete object';trash.setAttribute('aria-label','Delete '+s.name);trash.addEventListener('click',()=>removeShape(s.id));row.append(chip,name,visibility,lock,trash);list.append(row);});
 if(!state.shapes.length){const empty=document.createElement('p');empty.className='fvv-help';empty.textContent='No shapes yet. Draw with Pen, Shape or Ellipse, or add an image and trace it.';list.append(empty);}
}
function renameShape(target=state.selected){const s=state.shapes.find(x=>x.id===target);if(!s)return;const name=prompt('Shape name',s.name);if(name===null||!name.trim()||name.trim()===s.name)return;checkpoint();s.name=name.trim().slice(0,120);render();}
function renderAppearance(){const s=selected();if(!s)return;const mode=s.fill!=='none'&&s.stroke!=='none'?'both':s.fill!=='none'?'fill':'stroke';$('fvv-shape-mode').value=mode;$('fvv-fill').value=/^#[0-9a-f]{6}$/i.test(s.fill)?s.fill:s.lastFill||'#a3cda7';$('fvv-stroke').value=/^#[0-9a-f]{6}$/i.test(s.stroke)?s.stroke:'#263b30';$('fvv-stroke-width').value=s.strokeWidth;$('fvv-stroke-width-out').textContent=s.strokeWidth+' px';}
function updateExportSize(){const out=$('fvv-export-size');if(!out)return;const pts=state.shapes.filter(s=>s.visible!==false).flatMap(boundPoints);if(!pts.length){out.textContent='Draw or trace shapes to see the stitched size.';return;}const w=Math.max(...pts.map(p=>p.x))-Math.min(...pts.map(p=>p.x)),h=Math.max(...pts.map(p=>p.y))-Math.min(...pts.map(p=>p.y)),mm=clamp(+$('fvv-design-mm').value||100,10,250);out.textContent=`Stitched size ≈ ${mm} × ${w>0?(mm*h/w).toFixed(1):'—'} mm. Check that it fits your hoop in Stitch Lab.`;}
function isBlank(){return !state.source&&!state.shapes.length;}
function render(){$('fvv-empty').hidden=!isBlank()||!['select','hand'].includes(state.tool);updateExportSize();renderRaster();renderTrace();renderShapes();renderGizmos();crop.render();renderLayers();renderAppearance();const tab=vectorTabs.find(t=>t.id===activeVectorTab);if(tab&&tab.name!==state.name){tab.name=state.name;renderVectorTabs();}$('fvv-zoom-display').textContent=Math.round(state.zoom*100)+'%';}
function useView(){const vp=viewportPixels(),centerX=state.view.x+state.view.w/2,centerY=state.view.y+state.view.h/2,w=vp.w/state.zoom,h=vp.h/state.zoom;state.view={x:centerX-w/2,y:centerY-h/2,w,h};svg.setAttribute('viewBox',`${state.view.x} ${state.view.y} ${w} ${h}`);$('fvv-zoom-display').textContent=Math.round(state.zoom*100)+'%';const frame=$('fvv-svg-frame');if(frame){frame.style.setProperty('--fvv-grid-size',(25*state.zoom)+'px');frame.style.setProperty('--fvv-major-size',(100*state.zoom)+'px');frame.style.setProperty('--fvv-grid-origin-x',(-state.view.x*state.zoom)+'px');frame.style.setProperty('--fvv-grid-origin-y',(-state.view.y*state.zoom)+'px');}if(crop.active())crop.render();}
function setZoom(level){state.fitPaper=false;state.zoom=clamp(level,.1,8);useView();}
function fitArtboard(){state.fitPaper=true;const vp=viewportPixels();state.zoom=clamp(Math.min(vp.w/1010,vp.h/690),.1,8);state.view={x:480-vp.w/state.zoom/2,y:320-vp.h/state.zoom/2,w:vp.w/state.zoom,h:vp.h/state.zoom};useView();}
// Zoom around a screen point so the artwork under the cursor stays put.
function zoomAt(level,clientX,clientY){const r=svg.getBoundingClientRect(),old=state.zoom,next=clamp(level,.1,8);if(next===old)return;state.fitPaper=false;const fx=r.width?(clientX-r.left)/r.width:.5,fy=r.height?(clientY-r.top)/r.height:.5,wx=state.view.x+fx*state.view.w,wy=state.view.y+fy*state.view.h,vp=viewportPixels(),w=vp.w/next,h=vp.h/next;state.zoom=next;state.view={x:wx-fx*w,y:wy-fy*h,w,h};useView();}
// Match Stitch Lab's 25px drafting squares at 100% regardless of panel width.
function updateViewport(){
 if(!root.hidden)(state.fitPaper?fitArtboard:useView)();
}
const viewResizeObserver=typeof ResizeObserver!=='undefined'?new ResizeObserver(updateViewport):null;
if(viewResizeObserver)viewResizeObserver.observe($('fvv-svg-frame')||svg);
function removeShape(idToDelete=state.selected){const index=state.shapes.findIndex(s=>s.id===idToDelete);if(index===-1)return;checkpoint();state.shapes.splice(index,1);if(state.selected===idToDelete){state.selected=null;state.node=null;}render();note('Shape deleted.');}
function duplicateShape(){const s=selected();if(!s)return;checkpoint();const copy=deep(s);copy.id=id();copy.name=s.name+' copy';copy.contours.forEach(c=>c.nodes.forEach(p=>{p.x+=18;p.y+=18;if(p.in){p.in.x+=18;p.in.y+=18;}if(p.out){p.out.x+=18;p.out.y+=18;}}));state.shapes.push(copy);state.selected=copy.id;render();note('Editable duplicate created.');}
function moveLayer(step){const i=state.shapes.findIndex(s=>s.id===state.selected),j=i+step;if(i<0||j<0||j>=state.shapes.length)return;checkpoint();[state.shapes[i],state.shapes[j]]=[state.shapes[j],state.shapes[i]];render();}
function prepareBlankView(){
 showPanel('artwork',false);
 setPreviewMode('result');
 setTool('select');
 state.fitPaper=true;
 updateViewport();
 note('Blank vector canvas · ready to draw.');
}
function newDocument(yes=false,name='Untitled Vector'){
 if(!yes&&state.dirty&&!confirm('Start a new vector document? Save the current document first if you need it.'))return;
 documentRevision++;traceSerial++;clearTimeout(retraceTimer);$('fvv-trace').removeAttribute('aria-busy');
 Object.assign(state,{name,fileId:null,shapes:[],selected:null,node:null,source:null,mask:null,tracePending:null,maskApplied:false,
  history:[],future:[],dirty:false,pen:null,drag:null,space:false});
 nextId=1;crop.reset();prepareBlankView();
}
let appearanceLive=null;
function liveAppearance(key,val){const s=selected();if(!s)return;if(appearanceLive!==s.id){checkpoint();appearanceLive=s.id;}if(key==='fill'){s.fill=val;s.lastFill=val;}if(key==='stroke')s.stroke=val;if(key==='width'){s.strokeWidth=+val;if(s.stroke==='none')s.stroke='#283b30';}renderShapes();renderLayers();}
function applyAppearance(key,val){const s=selected();if(!s)return;const live=appearanceLive===s.id&&key!=='mode';appearanceLive=null;if(!live)checkpoint();if(key==='mode'){if(val==='fill'){s.fill=s.fill==='none'?s.lastFill||'#a3cda7':s.fill;s.stroke='none';}else if(val==='stroke'){if(s.fill!=='none')s.lastFill=s.fill;s.fill='none';s.stroke=s.stroke==='none'?'#283b30':s.stroke;}else{if(s.fill==='none')s.fill=s.lastFill||'#a3cda7';if(s.stroke==='none')s.stroke='#283b30';}}
 if(key==='fill'){s.fill=val;s.lastFill=val;if(s.stroke==='none'&&s.fill==='none')s.fill=val;}if(key==='stroke'){s.stroke=val;}if(key==='width'){s.strokeWidth=+val;if(s.stroke==='none')s.stroke='#283b30';}render();}
function nodeEdit(action){const s=selected(),sel=state.node;if(!s)return note('Select a shape first.');if(!sel){if(state.tool!=='node')setTool('node');return note('Click one of the square anchor points to choose a node.');}const c=s.contours[sel.ci],p=c?.nodes?.[sel.ni];if(!p)return;
 if(action==='smooth'){checkpoint();const prev=c.nodes[(sel.ni-1+c.nodes.length)%c.nodes.length],next=c.nodes[(sel.ni+1)%c.nodes.length];const dx=next.x-prev.x,dy=next.y-prev.y,len=Math.hypot(dx,dy)||1,span=Math.min(35,len*.20);p.in={x:p.x-dx/len*span,y:p.y-dy/len*span};p.out={x:p.x+dx/len*span,y:p.y+dy/len*span};}
 if(action==='sharp'){checkpoint();p.in=null;p.out=null;}
 if(action==='add'){if(!c.closed&&sel.ni===c.nodes.length-1)return note('Select a node that has a following segment.');checkpoint();const other=c.nodes[(sel.ni+1)%c.nodes.length];if(other){
   if(p.out||other.in){const p1=p.out||p,p2=other.in||other,L=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2}),a=L(p,p1),b=L(p1,p2),q=L(p2,other),ab=L(a,b),bq=L(b,q),mid=L(ab,bq);p.out=p.out?a:null;other.in=other.in?q:null;c.nodes.splice(sel.ni+1,0,n(mid.x,mid.y,ab,bq));}
   else c.nodes.splice(sel.ni+1,0,n((p.x+other.x)/2,(p.y+other.y)/2));state.node={ci:sel.ci,ni:sel.ni+1};}}
 if(action==='delete'){if(c.nodes.length<=(c.closed?3:2))return note(c.closed?'A closed shape needs at least three nodes.':'A path needs at least two nodes.');checkpoint();c.nodes.splice(sel.ni,1);state.node=null;}
 render();}
function breakApart(){const s=selected();if(!s||s.contours.length<2)return note('Select a shape containing several contours.');checkpoint();let idx=0;const list=s.contours.map(c=>({...s,id:id(),name:s.name+' '+(++idx),contours:[deep(c)]}));state.shapes.splice(state.shapes.indexOf(s),1,...list);state.selected=list[0].id;render();note('Contours separated into individual shapes.');}
function finalizePen(close=false){if(!state.pen||state.pen.length<2){state.pen=null;renderGizmos();return;}if(close&&state.pen.length<3)close=false;checkpoint();const closed=close;const s=newShape(closed?'Drawn Shape':'Drawn Path',state.pen.map(p=>({x:p.x,y:p.y,in:p.in?{...p.in}:null,out:p.out?{...p.out}:null})),closed?'#a3cda7':'none',closed);s.stroke=closed?'none':'#283b30';state.shapes.push(s);state.selected=s.id;state.pen=null;setTool('node');render();note(closed?'Closed shape created. Drag anchors or handles to refine it.':'Open path created. Drag anchors or handles to refine it.');}
function shapeFromDrag(type,a,b){const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y);if(right-left<5||bottom-top<5)return;let points=[];if(type==='rect')points=[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];else{const cx=(left+right)/2,cy=(top+bottom)/2,rx=(right-left)/2,ry=(bottom-top)/2;points=Array.from({length:24},(_,i)=>{const ang=i*Math.PI*2/24;return {x:cx+rx*Math.cos(ang),y:cy+ry*Math.sin(ang)};});}checkpoint();const s=newShape(type==='rect'?'Rectangle':'Ellipse',points);state.shapes.push(s);state.selected=s.id;setTool('select');render();}
function makeTraceSettings(){const preset=$('fvv-preset').value;return {mode:$('fvv-trace-mode').value,colors:['3','6','16'].includes(preset)?+preset:3,threshold:+$('fvv-threshold').value,paths:+$('fvv-paths').value,corners:+$('fvv-corners').value,noise:+$('fvv-noise').value,ignoreWhite:$('fvv-ignore-white').checked};}
let traceSerial=0;
function traceImage(quiet=false){if(!state.source)return note('Open PNG, JPG, or WEBP artwork first.');const opts=makeTraceSettings(),serial=++traceSerial;if(!quiet)note('Tracing artwork into individual vector paths…');$('fvv-trace')?.setAttribute('aria-busy','true');return new Promise(resolve=>setTimeout(()=>{if(serial!==traceSerial||!state.source){resolve(false);return;}try{const result=T.trace(state.source.imageData,state.mask,opts),rect=state.source.rect,scaleX=rect.w/result.width,scaleY=rect.h/result.height;
 // Corners slider: 100% keeps most turns sharp, 0% rounds nearly everything.
 const cornerDeg=clamp(170-opts.corners*1.4,25,170);state.tracePending=result.shapes.map((raw,i)=>{
   const contours=raw.loops.map(loop=>({closed:true,nodes:T.curveNodes(loop.map(p=>({x:rect.x+p.x*scaleX,y:rect.y+p.y*scaleY})),cornerDeg)}));
   return {id:id(),name:`Trace ${String(i+1).padStart(2,'0')}`,contours,fill:$('fvv-trace-fills').checked?raw.fill:'none',stroke:$('fvv-trace-strokes').checked?raw.fill:'none',strokeWidth:2,lastFill:raw.fill,visible:true,locked:false};
 });if(!state.tracePending.length){state.tracePending=null;render();note('No paths at these settings. Try a different Threshold, or lower Noise.');$('fvv-trace-info').textContent='No paths found at these settings.';return;}
 const nodes=state.tracePending.reduce((a,s)=>a+s.contours.reduce((b,c)=>b+c.nodes.length,0),0);
 $('fvv-trace-info').textContent=`${state.tracePending.length} shapes · ${nodes.toLocaleString()} nodes · ${result.colors.length} color group(s)${result.count>state.tracePending.length?` · largest ${state.tracePending.length} of ${result.count} kept`:''}. Adjust the sliders to re-trace, then Expand to edit.`;
 setPreviewMode('result');render();if(!quiet)note(`${state.tracePending.length} paths traced. Expand to place them as editable shapes.`);
 }catch(err){console.error(err);note('Tracing could not complete: '+err.message);}finally{$('fvv-trace')?.removeAttribute('aria-busy');resolve(!!state.tracePending);}},15));
}
// Once a trace preview exists, slider and preset changes re-trace automatically.
let retraceTimer=0;function scheduleRetrace(){if(!state.tracePending||!state.source)return;clearTimeout(retraceTimer);retraceTimer=setTimeout(()=>traceImage(true),260);}
function expandTrace(){if(!state.tracePending||!state.tracePending.length)return note('Trace artwork before expanding.');checkpoint();const count=state.tracePending.length;state.shapes.push(...state.tracePending);state.selected=state.tracePending[0].id;state.tracePending=null;state.maskApplied=false;if(state.source)state.source.visible=false;setPreviewMode('result');render();showPanel('layers');note(`${count} traced shapes added. Click any shape to select, move or restyle it.`);}
function maskAt(p,operation='replace'){if(!state.source)return note('Open a raster image to use Magic Crop.');const r=state.source.rect,iw=state.source.imageData.width,ih=state.source.imageData.height;if(p.x<r.x||p.y<r.y||p.x>r.x+r.w||p.y>r.y+r.h)return;
 const x=clamp(Math.round((p.x-r.x)/r.w*iw),0,iw-1),y=clamp(Math.round((p.y-r.y)/r.h*ih),0,ih-1);
 if(state.tool==='magic'){state.mask=T.floodImage(state.source.imageData,x,y,+$('fvv-tolerance').value,state.mask,operation);note('Object selected. Refine with Add / Erase or select Trace.');}
 else{if(!state.mask)state.mask=new Uint8Array(iw*ih).fill(state.tool==='brush-remove'?1:0);if(state.drag?.fresh){state.mask=new Uint8Array(state.mask);state.drag.fresh=false;}T.brush(state.mask,iw,ih,x,y,+$('fvv-brush-size').value,state.tool==='brush-add');}
 state.maskApplied=true;crop.usePixelMask();state.maskVersion++;if(state.tracePending)scheduleRetrace();renderRaster();}
function createImageDataFromImage(img){const max=760,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0,w,h);return {imageData:g.getImageData(0,0,w,h),dataUrl:c.toDataURL('image/png')};}
function imageFrom(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('This image cannot be decoded.'));img.src=src;});}
async function loadRaster(src,name='Artwork',revision=documentRevision){
 const img=await imageFrom(src);
 if(revision!==documentRevision)return;
 const parsed=createImageDataFromImage(img);const ratio=Math.min(800/img.naturalWidth,510/img.naturalHeight),w=img.naturalWidth*ratio,h=img.naturalHeight*ratio;const kept=state.shapes.length;state.source={dataUrl:parsed.dataUrl,originalDataUrl:src,imageData:parsed.imageData,rect:{x:(960-w)/2,y:(640-h)/2,w,h},visible:true};state.mask=null;state.maskApplied=false;state.maskVersion++;state.tracePending=null;crop.reset();if(!kept||/^Untitled Vector/.test(state.name))state.name=name;state.selected=null;mark();fitArtboard();showPanel('trace');setPreviewMode('result');setTool('select');render();note(kept?`Artwork placed behind your ${kept} existing shape(s). Select Trace image, or use Crop to isolate part of it first.`:'Artwork loaded. Select Trace image, or use Crop (M) to place anchors around an edge.');}
function fileAsURL(file){return new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(file);});}
// SVG inputs become separate path objects with their curves, transforms and computed colors.
// The document is attached off-screen only for the duration of this synchronous call so the
// browser resolves transforms (getCTM) and CSS / inherited fills; scripts and external
// references are removed first.
function sanitizeSvg(svgRoot){svgRoot.querySelectorAll('script,foreignObject,image,iframe,audio,video,a').forEach(x=>x.remove());
 for(const node of [svgRoot,...svgRoot.querySelectorAll('*')]){for(const a of [...node.attributes]){if(/^on/i.test(a.name)||(/href$/i.test(a.name)&&!/^#/.test(a.value.trim())))node.removeAttribute(a.name);}}
 svgRoot.querySelectorAll('style').forEach(st=>{st.textContent=st.textContent.replace(/@import[^;]*;?/gi,'').replace(/url\(\s*(['"]?)(?!#)[^)]*\)/gi,'none');});}
function importSvgText(text,name){const doc=new DOMParser().parseFromString(text,'image/svg+xml');if(doc.querySelector('parsererror'))throw Error('Invalid SVG file.');const svgRoot=doc.documentElement;if(svgRoot.localName!=='svg')throw Error('Not an SVG document.');
 sanitizeSvg(svgRoot);
 let vb=(svgRoot.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
 if(vb.length!==4||!vb.every(Number.isFinite)||vb[2]<=0||vb[3]<=0){const w=parseFloat(svgRoot.getAttribute('width'))||960,h=parseFloat(svgRoot.getAttribute('height'))||640;vb=[0,0,w,h];}
 const live=document.importNode(svgRoot,true);live.setAttribute('viewBox',vb.join(' '));live.setAttribute('width',vb[2]);live.setAttribute('height',vb[3]);live.setAttribute('preserveAspectRatio','none');
 const host=document.createElement('div');host.setAttribute('aria-hidden','true');host.style.cssText='position:fixed;left:-100000px;top:0;opacity:0;pointer-events:none;contain:strict;width:'+vb[2]+'px;height:'+vb[3]+'px';host.append(live);document.body.append(host);
 const imported=[];
 try{
  const sw=vb[2],sh=vb[3],scale=Math.min(860/sw,540/sh),ox=(960-sw*scale)/2,oy=(640-sh*scale)/2;
  for(const source of live.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line')){if(imported.length>=320)break;
   if(source.closest('defs,clipPath,mask,symbol,marker,pattern'))continue;
   const cs=getComputedStyle(source);if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0)continue;
   let contours=[];const tag=source.localName,num=a=>{const v=parseFloat(source.getAttribute(a));return Number.isFinite(v)?v:0;};
   if(tag==='path')contours=parseSvgPath(source.getAttribute('d')||'');
   else if(tag==='rect'){const x=num('x'),y=num('y'),w=num('width'),h=num('height');if(w>0&&h>0){let rx=Math.min(w/2,num('rx')||num('ry')),ry=Math.min(h/2,num('ry')||rx);if(rx>0&&ry>0){const k=.5523;contours=[{closed:true,nodes:[n(x+rx,y,{x:x+rx-rx*k,y},null),n(x+w-rx,y,null,{x:x+w-rx+rx*k,y}),n(x+w,y+ry,{x:x+w,y:y+ry-ry*k},null),n(x+w,y+h-ry,null,{x:x+w,y:y+h-ry+ry*k}),n(x+w-rx,y+h,{x:x+w-rx+rx*k,y:y+h},null),n(x+rx,y+h,null,{x:x+rx-rx*k,y:y+h}),n(x,y+h-ry,{x,y:y+h-ry+ry*k},null),n(x,y+ry,null,{x,y:y+ry-ry*k})]}];}else contours=[contour([{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}])];}}
   else if(tag==='circle'||tag==='ellipse'){const cx=num('cx'),cy=num('cy'),rx=num(tag==='circle'?'r':'rx'),ry=tag==='circle'?rx:num('ry');if(rx>0&&ry>0){const k=.5523;contours=[{closed:true,nodes:[n(cx+rx,cy,{x:cx+rx,y:cy-ry*k},{x:cx+rx,y:cy+ry*k}),n(cx,cy+ry,{x:cx+rx*k,y:cy+ry},{x:cx-rx*k,y:cy+ry}),n(cx-rx,cy,{x:cx-rx,y:cy+ry*k},{x:cx-rx,y:cy-ry*k}),n(cx,cy-ry,{x:cx-rx*k,y:cy-ry},{x:cx+rx*k,y:cy-ry})]}];}}
   else if(tag==='line')contours=[contour([{x:num('x1'),y:num('y1')},{x:num('x2'),y:num('y2')}],false)];
   else{const nums=(source.getAttribute('points')||'').trim().split(/[\s,]+/).map(Number);const pts=[];for(let i=0;i+1<nums.length;i+=2)if(Number.isFinite(nums[i])&&Number.isFinite(nums[i+1]))pts.push({x:nums[i],y:nums[i+1]});if(pts.length>=2)contours=[contour(pts,tag==='polygon')];}
   contours=contours.filter(c=>c.nodes.length>=2);if(!contours.length)continue;
   const m=attributeMatrix(source,live),map=p=>p?{x:ox+(m.a*p.x+m.c*p.y+m.e)*scale,y:oy+(m.b*p.x+m.d*p.y+m.f)*scale}:null;
   contours=contours.map(c=>({closed:c.closed,nodes:c.nodes.map(p=>{const q=map(p);return {x:q.x,y:q.y,in:map(p.in),out:map(p.out)};})}));
   const fillOff=cs.fill==='none'||+cs.fillOpacity===0,strokeOff=cs.stroke==='none'||!cs.stroke||+cs.strokeOpacity===0||parseFloat(cs.strokeWidth)===0;
   const fill=fillOff||tag==='line'?'none':paintColor(cs.fill,live),stroke=strokeOff?'none':paintColor(cs.stroke,live);
   const unit=Math.sqrt(Math.abs(m.a*m.d-m.b*m.c))||1,strokeWidth=clamp((parseFloat(cs.strokeWidth)||1)*unit*scale,.25,80);
   if(fill==='none'&&stroke==='none')continue;
   imported.push({id:id(),name:(source.getAttribute('id')||source.closest('g[id]')?.getAttribute('id')||'SVG '+tag+' '+(imported.length+1)).slice(0,120),fill,stroke,strokeWidth,fillRule:cs.fillRule==='evenodd'?'evenodd':'nonzero',lastFill:fill==='none'?'#a3cda7':fill,contours,visible:true,locked:false});
  }
 }finally{host.remove();}
 if(!imported.length)throw Error('No visible paths or shapes found in the SVG.');checkpoint();state.shapes.push(...imported);state.selected=null;if(!state.shapes.length||/^Untitled Vector/.test(state.name))state.name=name;showPanel('layers');setTool('select');render();fitSelection(false);mark();note(`Imported ${imported.length} editable SVG shapes.`);
}
// Compose the transform attributes from the element up to the root. getCTM() is not used
// because page CSS (transform:none rules) can override presentation attributes.
function attributeMatrix(node,stop){let m=new DOMMatrix();for(let e=node;e&&e!==stop;e=e.parentElement){const list=e.transform?.baseVal;if(list&&list.numberOfItems){const t=list.consolidate()?.matrix;if(t)m=new DOMMatrix([t.a,t.b,t.c,t.d,t.e,t.f]).multiply(m);}}return m;}
// Resolve a computed paint value (rgb(), named color or gradient reference) to #rrggbb.
function paintColor(value,svgRoot){value=String(value||'').trim();if(!value||value==='none')return 'none';
 const ref=/url\(\s*["']?#([^"')]+)["']?\s*\)/.exec(value);if(ref){const stop=svgRoot.querySelector('#'+CSS.escape(ref[1]))?.querySelector('stop');if(stop)return normalizeColor(getComputedStyle(stop).stopColor||stop.getAttribute('stop-color')||'#7a8a7f');const fallback=value.replace(ref[0],'').trim();return fallback?normalizeColor(fallback):'#7a8a7f';}
 return normalizeColor(value);}
function normalizeColor(c){c=String(c||'').trim();if(/^#[0-9a-f]{6}$/i.test(c))return c.toLowerCase();if(/^#[0-9a-f]{3}$/i.test(c))return '#'+[...c.slice(1)].map(x=>x+x).join('').toLowerCase();if(/^#[0-9a-f]{8}$/i.test(c))return c.slice(0,7).toLowerCase();
 const rgb=/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);if(rgb)return '#'+rgb.slice(1,4).map(x=>clamp(Math.round(+x),0,255).toString(16).padStart(2,'0')).join('');
 if(/^[a-z]+$/i.test(c)||/^(hsl|color)/i.test(c)){const tmp=document.createElement('span');tmp.style.color=c;if(!tmp.style.color)return '#333333';document.body.appendChild(tmp);const value=getComputedStyle(tmp).color;tmp.remove();return normalizeColor(value);}return '#333333';}
// Endpoint arc → cubic Bézier segments (SVG 1.1 implementation notes F.6.5).
function arcToCubics(x1,y1,rx,ry,phi,large,sweep,x2,y2){if(!rx||!ry||(x1===x2&&y1===y2))return [{c1:{x:x1,y:y1},c2:{x:x2,y:y2},p:{x:x2,y:y2}}];
 rx=Math.abs(rx);ry=Math.abs(ry);const a=phi*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a),dx=(x1-x2)/2,dy=(y1-y2)/2,xp=cos*dx+sin*dy,yp=-sin*dx+cos*dy;
 const lambda=xp*xp/(rx*rx)+yp*yp/(ry*ry);if(lambda>1){const k=Math.sqrt(lambda);rx*=k;ry*=k;}
 const num=rx*rx*ry*ry-rx*rx*yp*yp-ry*ry*xp*xp,den=rx*rx*yp*yp+ry*ry*xp*xp,co=(large===sweep?-1:1)*Math.sqrt(Math.max(0,num/den)),cxp=co*rx*yp/ry,cyp=-co*ry*xp/rx;
 const cx=cos*cxp-sin*cyp+(x1+x2)/2,cy=sin*cxp+cos*cyp+(y1+y2)/2,angle=(ux,uy,vx,vy)=>{const d=Math.hypot(ux,uy)*Math.hypot(vx,vy)||1,s=ux*vy-uy*vx<0?-1:1;return s*Math.acos(clamp((ux*vx+uy*vy)/d,-1,1));};
 const t1=angle(1,0,(xp-cxp)/rx,(yp-cyp)/ry);let dt=angle((xp-cxp)/rx,(yp-cyp)/ry,(-xp-cxp)/rx,(-yp-cyp)/ry);if(!sweep&&dt>0)dt-=2*Math.PI;if(sweep&&dt<0)dt+=2*Math.PI;
 const parts=Math.max(1,Math.ceil(Math.abs(dt)/(Math.PI/2))),step=dt/parts,k=4/3*Math.tan(step/4),pt=t=>({x:cx+rx*Math.cos(t)*cos-ry*Math.sin(t)*sin,y:cy+rx*Math.cos(t)*sin+ry*Math.sin(t)*cos}),dv=t=>({x:-rx*Math.sin(t)*cos-ry*Math.cos(t)*sin,y:-rx*Math.sin(t)*sin+ry*Math.cos(t)*cos});
 const out=[];for(let i=0;i<parts;i++){const a0=t1+i*step,a1=a0+step,p0=pt(a0),p1=pt(a1),d0=dv(a0),d1=dv(a1);out.push({c1:{x:p0.x+k*d0.x,y:p0.y+k*d0.y},c2:{x:p1.x-k*d1.x,y:p1.y-k*d1.y},p:p1});}return out;}
function closeContour(sub){if(sub.nodes.length>=3){const a=sub.nodes[0],b=sub.nodes.at(-1);if(Math.hypot(a.x-b.x,a.y-b.y)<1e-6){a.in=b.in||a.in;sub.nodes.pop();}}sub.closed=true;return sub;}
function parseSvgPath(d){const tokens=(d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[]),contours=[];let i=0,cmd='',cur={x:0,y:0},start={x:0,y:0},sub=null,prevCmd='',lastControl=null,lastQuad=null;
 const arity={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7,Z:0};const read=n=>{const vals=[];for(let k=0;k<n;k++){if(i>=tokens.length||/[a-zA-Z]/.test(tokens[i]))return null;vals.push(+tokens[i++]);}return vals;};let guard=0;
 while(i<tokens.length&&guard++<60000){if(/[a-zA-Z]/.test(tokens[i]))cmd=tokens[i++];if(!cmd)break;const upper=cmd.toUpperCase(),relative=cmd!==upper;if(upper==='Z'){if(sub?.nodes?.length>=2)contours.push(closeContour(sub));sub=null;cur={...start};lastControl=null;lastQuad=null;prevCmd='Z';cmd='';continue;}if(!(upper in arity))break;const values=read(arity[upper]);if(!values)break;const xy=(x,y)=>({x:x+(relative?cur.x:0),y:y+(relative?cur.y:0)});
  if(upper==='M'){const p=xy(values[0],values[1]);if(sub&&sub.nodes.length>=2)contours.push(sub);sub={closed:false,nodes:[n(p.x,p.y)]};cur=p;start={...p};cmd=relative?'l':'L';prevCmd='M';continue;}
  if(!sub)sub={closed:false,nodes:[n(cur.x,cur.y)]};let p=null,pointIn=null;const anchor=sub.nodes.at(-1);
  if(upper==='L')p=xy(values[0],values[1]);
  else if(upper==='H')p={x:values[0]+(relative?cur.x:0),y:cur.y};
  else if(upper==='V')p={x:cur.x,y:values[0]+(relative?cur.y:0)};
  else if(upper==='C'){const c1=xy(values[0],values[1]),c2=xy(values[2],values[3]);p=xy(values[4],values[5]);anchor.out=c1;pointIn=c2;lastControl=c2;}
  else if(upper==='S'){const c1=(prevCmd==='C'||prevCmd==='S')&&lastControl?{x:2*cur.x-lastControl.x,y:2*cur.y-lastControl.y}:{...cur};const c2=xy(values[0],values[1]);p=xy(values[2],values[3]);anchor.out=c1;pointIn=c2;lastControl=c2;}
  else if(upper==='Q'||upper==='T'){const q=upper==='Q'?xy(values[0],values[1]):(prevCmd==='Q'||prevCmd==='T')&&lastQuad?{x:2*cur.x-lastQuad.x,y:2*cur.y-lastQuad.y}:{...cur};p=upper==='Q'?xy(values[2],values[3]):xy(values[0],values[1]);anchor.out={x:cur.x+(q.x-cur.x)*2/3,y:cur.y+(q.y-cur.y)*2/3};pointIn={x:p.x+(q.x-p.x)*2/3,y:p.y+(q.y-p.y)*2/3};lastQuad=q;}
  else if(upper==='A'){const end=xy(values[5],values[6]);const segs=arcToCubics(cur.x,cur.y,values[0],values[1],values[2],!!values[3],!!values[4],end.x,end.y);for(let k=0;k<segs.length;k++){const seg=segs[k];sub.nodes.at(-1).out=seg.c1;if(k<segs.length-1)sub.nodes.push(n(seg.p.x,seg.p.y,seg.c2));else{p=seg.p;pointIn=seg.c2;}}}
  if(!p)break;sub.nodes.push(n(p.x,p.y,pointIn));cur=p;prevCmd=upper;
 }
 if(sub&&sub.nodes.length>=2)contours.push(sub);return contours;
}
async function importFile(file){
 if(!file)return false;
 if(!isBlank()||state.fileId)createVectorTab();
 const revision=documentRevision,name=file.name.replace(/\.[^.]+$/,'');
 if(/\.(fvector|json)$/i.test(file.name)){
  const data=await file.text();
  if(revision!==documentRevision)return false;
  await loadDocument(JSON.parse(data));autoSave();
 }else if(/\.svg$/i.test(file.name)||file.type==='image/svg+xml'){
  const markup=await file.text();
  if(revision!==documentRevision)return false;
  importSvgText(markup,name);
 }else{
  if(!/\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name))throw Error('Open PNG, JPG, WEBP, SVG or a FERVOR Vector document.');
  const url=await fileAsURL(file);
  if(revision!==documentRevision)return false;
  await loadRaster(url,name,revision);
 }
 return true;
}
function download(data,name,mime){const url=URL.createObjectURL(new Blob([data],{type:mime})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);}
function exportSVG(){const content=state.shapes.filter(s=>s.visible).map(s=>`<path d="${escapeAttr(shapeD(s))}" fill="${escapeAttr(s.fill)}" fill-rule="${s.fillRule==='nonzero'?'nonzero':'evenodd'}" stroke="${escapeAttr(s.stroke)}" stroke-width="${s.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`).join('\n  ');return `<svg xmlns="${NS}" viewBox="0 0 960 640" width="960" height="640">\n  ${content}\n</svg>`;}
const escapeAttr=s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function fileSafeName(){return (state.name||'FERVOR-Vector').replace(/[^A-Za-z0-9 _-]+/g,'').trim().replaceAll(' ','_')||'FERVOR-Vector';}
function encodeMask(mask){if(!mask)return null;const r=[];let last=mask[0],count=0;for(const n of mask){if(n!==last){r.push(count);count=0;last=n;}count++;}r.push(count);return {start:mask[0],runs:r};}
function decodeMask(mask,count){if(!mask?.runs?.length)return null;const out=new Uint8Array(count);let index=0,on=mask.start;for(const n of mask.runs){out.fill(on,index,Math.min(count,index+n));index+=n;on=on?0:1;}return out;}
function documentData(){return {format:'fervor-vector',version:1,name:state.name,savedAt:new Date().toISOString(),artboard:{width:960,height:640},shapes:deep(state.shapes),source:state.source?{dataUrl:state.source.dataUrl,rect:state.source.rect,originalDataUrl:state.source.originalDataUrl,mask:encodeMask(state.mask),maskApplied:state.maskApplied,crop:crop.serialize()}:null};}

function captureVectorTab(){flushVectorSave();const tab=vectorTabs.find(t=>t.id===activeVectorTab);if(tab){tab.doc=documentData();tab.fileId=state.fileId;tab.name=state.name;tab.dirty=state.dirty;}}
const session=window.FervorProjectSession;
let vectorReady=false,vectorOpening=false,initialVectorTabs;
function rememberVectorTabs(){
 if(vectorReady)session.remember('vector',vectorTabs.map(tab=>tab.fileId),state.fileId);
}
function renderVectorTabs(){
 const list=$('fvv-project-list');if(!list)return;list.replaceChildren();
 for(const tab of vectorTabs){
  const wrap=document.createElement('div'),title=document.createElement('button'),close=document.createElement('button');
  wrap.className='fvv-project-tab'+(tab.id===activeVectorTab?' active':'');
  title.type=close.type='button';title.className='fvv-project-title';title.textContent=tab.name;title.title=tab.name+' · Double-click to rename';
  if(tab.id===activeVectorTab)title.setAttribute('aria-current','true');
  title.onclick=()=>switchVectorTab(tab.id);
  title.ondblclick=async()=>{await switchVectorTab(tab.id);if(activeVectorTab===tab.id)renameVector();};
  title.onkeydown=async e=>{if(e.key==='F2'){e.preventDefault();await switchVectorTab(tab.id);if(activeVectorTab===tab.id)renameVector();}};
  close.className='fvv-project-close';close.textContent='×';close.setAttribute('aria-label','Close '+tab.name);
  close.onclick=()=>closeVectorTab(tab.id);
  const selector=`[data-tab-id="${tab.id}"] .fvv-project-title`;
  session.bindReorder(wrap,vectorTabs,tab,selector,()=>{renderVectorTabs();rememberVectorTabs();list.querySelector(selector)?.focus({preventScroll:true});});
  wrap.append(title,close);list.append(wrap);
 }
}
async function restoreVectorTab(tab){
 const stored=!tab.doc&&tab.fileId?await projectFiles.open(tab.fileId):null;
 await loadDocument(stored?{...stored.project,name:stored.name}:tab.doc,tab.fileId);
 state.dirty=!!tab.dirty;
}
function restoreVectorTabs(){return initialVectorTabs??=(async()=>{
 try{
  const saved=await session.available('vector');
  if(saved.items.length){
   const candidates=saved.items.map(item=>({id:'vtab-'+(++vectorTabSerial),name:item.name,fileId:item.id}));
   const tab=candidates.find(item=>item.fileId===saved.active)||candidates[0];
   await restoreVectorTab(tab);vectorTabs=candidates;activeVectorTab=tab.id;
  }
 }catch(error){note(error.message);}
 vectorReady=true;renderVectorTabs();rememberVectorTabs();
})();}
async function switchVectorTab(id){
 if(vectorOpening||id===activeVectorTab)return;
 const tab=vectorTabs.find(t=>t.id===id);if(!tab)return;
 captureVectorTab();vectorOpening=true;
 try{
  await restoreVectorTab(tab);activeVectorTab=id;session.touch(tab.fileId,isBlank());
  stageActive('artwork');setSettingsOpen(false);rememberVectorTabs();
 }catch(error){note(error.message);}
 finally{vectorOpening=false;renderVectorTabs();}
}
async function closeVectorTab(id){
 if(vectorOpening)return;
 const index=vectorTabs.findIndex(t=>t.id===id);if(index<0)return;
 if(id===activeVectorTab){
  const next=vectorTabs[index+1]||vectorTabs[index-1];
  if(next){await switchVectorTab(next.id);if(activeVectorTab!==next.id)return;}
  else{
   flushVectorSave();const blank='vtab-'+(++vectorTabSerial);activeVectorTab=blank;
   newDocument(true);vectorTabs.push({id:blank,name:state.name,doc:documentData()});
  }
 }
 vectorTabs.splice(index,1);renderVectorTabs();rememberVectorTabs();
}
function renameVector(){
 session.renameProject(state.name,async name=>{
  if(state.fileId)await projectFiles.edit('rename',state.fileId,name);
  else state.name=name;
  const tab=vectorTabs.find(t=>t.id===activeVectorTab);if(tab)tab.name=state.name;
  renderVectorTabs();
 });
}
async function duplicateVector(){
 try{
  const saved=await saveLocal();
  if(!saved)throw Error('Restore this design from Recently Deleted before duplicating it.');
  const copy=await projectFiles.edit('copy',saved.id);await openSaved(await projectFiles.open(copy.id));
 }catch(error){note(error.message);}
}
function createVectorTab(){
 captureVectorTab();
 if(isBlank()&&!state.fileId&&!state.dirty){const index=vectorTabs.findIndex(t=>t.id===activeVectorTab);if(index>=0)vectorTabs.splice(index,1);}
 const id='vtab-'+(++vectorTabSerial);
 activeVectorTab=id;
 newDocument(true,'Untitled Vector '+vectorTabSerial);
 vectorTabs.push({id,name:state.name,doc:documentData()});
 renderVectorTabs();rememberVectorTabs();
 if(!root.hidden)focusCanvasEntry();
}

async function loadDocument(doc,fileId=null){if(doc===null){newDocument(true);return;}if(!doc||doc.format!=='fervor-vector'||!Array.isArray(doc.shapes))throw Error('This is not a FERVOR Vector document.');const revision=++documentRevision;traceSerial++;clearTimeout(retraceTimer);$('fvv-trace').removeAttribute('aria-busy');state.name=String(doc.name||'Vector Document');state.fileId=fileId;state.shapes=normShapes(doc.shapes);state.selected=null;state.node=null;state.history=[];state.future=[];state.source=null;state.mask=null;state.maskApplied=false;state.tracePending=null;if(doc.source?.dataUrl){const img=await imageFrom(doc.source.dataUrl);if(revision!==documentRevision)return;const parsed=createImageDataFromImage(img);state.source={...parsed,originalDataUrl:doc.source.originalDataUrl,rect:doc.source.rect||{x:80,y:80,w:800,h:480}};state.mask=decodeMask(doc.source.mask,parsed.imageData.width*parsed.imageData.height);state.maskApplied=!!doc.source.maskApplied;}crop.reset(doc.source?.crop);state.dirty=false;state.maskVersion++;syncNextId();showPanel('layers');setTool('select');render();renderVectorTabs();note(`Opened ${state.name}`);}
const projectFiles=window.FervorProjectFiles;
let saveTimer=0;
async function saveLocal(){
 const fresh=!state.fileId,id=state.fileId||=projectFiles.key(),project=documentData(),blank=isBlank();
 const tab=vectorTabs.find(t=>t.id===activeVectorTab);
 if(tab)tab.fileId=id;
 const saved=await projectFiles.save({id,type:'vector',name:state.name,project});
 if(saved){if(fresh&&state.fileId===id)session.touch(id,blank);rememberVectorTabs();}
 return saved;
}
function flushVectorSave(){
 if(!saveTimer)return;
 clearTimeout(saveTimer);saveTimer=0;
 if(!isBlank()||state.fileId)return saveLocal().catch(error=>note('Could not save: '+error.message));
}
function autoSave(){clearTimeout(saveTimer);saveTimer=setTimeout(flushVectorSave,1800);}
async function save(){
 clearTimeout(saveTimer);saveTimer=0;
 try{
  const item=await saveLocal();
  if(item){if(item.id===state.fileId)state.dirty=false;note('Saved to Project Files.');}
  else note('Restore this project from Recently Deleted before saving.');
 }catch(error){note('Could not save: '+error.message);}
}
async function openSaved(item){
 await restoreVectorTabs();
 if(state.fileId===item.id){session.touch(item.id,isBlank());return;}
 const prior=vectorTabs.find(t=>t.fileId===item.id);
 if(prior){await switchVectorTab(prior.id);return;}
 if(!isBlank()||state.fileId||state.dirty)createVectorTab();
 await loadDocument({...item.project,name:item.name},item.id);
 const tab=vectorTabs.find(t=>t.id===activeVectorTab);if(tab){tab.fileId=item.id;tab.name=state.name;}
 session.touch(item.id,isBlank());rememberVectorTabs();renderVectorTabs();
}
window.addEventListener('fervor:project-file-renamed',event=>{
 const {id,name}=event.detail;
 if(state.fileId===id)state.name=name;
 for(const tab of vectorTabs)if(tab.fileId===id){tab.name=name;if(tab.doc)tab.doc.name=name;}
 renderVectorTabs();
});
async function handoff(){const shapes=state.shapes.filter(s=>s.visible&&s.contours.length&&(s.fill!=='none'||s.stroke!=='none'));if(!shapes.length)return note(state.tracePending?.length?'Select Expand to paths first, then send to Stitch Lab.':'Draw or trace vector shapes (with a fill or outline) before sending to Stitch Lab.');const mm=clamp(+$('fvv-design-mm').value||100,10,250);$('fvv-design-mm').value=mm;$('fvv-export-mm').value=mm;try{await saveLocal().catch(()=>false);if(!window.FervorWorkspace?.importVectorPaths)throw Error('Stitch Lab vector import is not available.');await window.FervorWorkspace.importVectorPaths({name:state.name,shapes:deep(shapes),artboard:{width:960,height:640},widthMm:mm});switchToStitch();note(`${shapes.length} shape(s) sent to Stitch Lab at ${mm} mm wide.`);}catch(err){console.error(err);note('Stitch Lab transfer: '+err.message);}}

function focusCanvasEntry(){
 const target=$('fvv-empty').hidden?svg:$('fvv-start-title');
 target.focus({preventScroll:true});
}
async function begin(){
 await restoreVectorTabs();
 root.hidden=false;
 document.body.classList.add('fv-vector-active');
 document.body.classList.remove('fervor-home-open');
 const home=$('fervor-home');if(home)home.hidden=true;
 requestAnimationFrame(()=>{if(root.hidden)return;updateViewport();render();focusCanvasEntry();});
}
function startVectorFromHome(){window.FervorSuite.open('vector');}
function switchToStitch(){root.hidden=true;document.body.classList.remove('fv-vector-active','fervor-home-open');$('fervor-home').hidden=true;window.scrollTo(0,0);window.FervorWorkspace?.goToEditor?.();}
function goHome(){root.hidden=true;document.body.classList.remove('fv-vector-active');document.body.classList.add('fervor-home-open');$('fervor-home').hidden=false;window.scrollTo(0,0);}
function setPreset(v){const presets={bw:{mode:'bw',threshold:128,paths:70,corners:75,noise:8},silhouette:{mode:'bw',threshold:170,paths:45,corners:55,noise:18},line:{mode:'bw',threshold:195,paths:85,corners:90,noise:5},sketch:{mode:'bw',threshold:150,paths:87,corners:35,noise:3},technical:{mode:'bw',threshold:115,paths:95,corners:100,noise:4},'3':{mode:'color',threshold:128,paths:68,corners:70,noise:12},'6':{mode:'color',threshold:128,paths:72,corners:65,noise:11},'16':{mode:'color',threshold:128,paths:86,corners:70,noise:5}};const p=presets[v]||presets.bw;$('fvv-trace-mode').value=p.mode;for(const key of ['threshold','paths','corners','noise'])$('fvv-'+key).value=p[key];syncRanges();}
function syncRanges(){for(const [name,unit] of [['threshold',''],['paths','%'],['corners','%'],['noise',' px'],['tolerance',''],['brush-size','']])$('fvv-'+name+'-out').textContent=$('fvv-'+name).value+unit;}
function screenDistance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)*state.zoom;}
function onPointerDown(e){if(e.button>1)return;const p=svgCoordinates(e);state.drag=null;svg.focus({preventScroll:true});
 if(state.tool==='hand'||state.space||e.button===1){state.drag={type:'pan',clientX:e.clientX,clientY:e.clientY,view:{...state.view}};svg.setPointerCapture(e.pointerId);svg.style.cursor='grabbing';e.preventDefault();return;}

 if(state.tool==='crop'){crop.down(e,p);return;}
 if(['magic','brush-add','brush-remove'].includes(state.tool)){if(!state.source)return note('Open a raster image first.');if(state.tool!=='magic')state.drag={type:'brush',fresh:true};maskAt(p,e.shiftKey?'add':e.altKey?'remove':'replace');if(state.tool!=='magic'){svg.setPointerCapture(e.pointerId);}else mark();return;}
 if(state.tool==='pen'){
  // Click the first point to close the path. Click-drag places a smooth (curved) point.
  if(state.pen&&state.pen.length>=3&&screenDistance(p,state.pen[0])<10){finalizePen(true);return;}
  if(state.pen?.length&&screenDistance(p,state.pen.at(-1))<3)return;
  if(!state.pen)state.pen=[];const point={x:p.x,y:p.y,in:null,out:null};state.pen.push(point);state.drag={type:'pen-handle',point,start:p};svg.setPointerCapture(e.pointerId);renderGizmos();return;}
 if(state.tool==='rect'||state.tool==='ellipse'){state.drag={type:'new',newType:state.tool,start:p,current:p};svg.setPointerCapture(e.pointerId);return;}
 const handle=e.target.closest('[data-handle]');if(handle&&state.tool==='node'){const s=selected();if(!s||s.locked)return;const ci=+handle.dataset.ci,ni=+handle.dataset.ni,kind=handle.dataset.handle;if(!s.contours[ci]?.nodes?.[ni])return;state.node={ci,ni};state.drag={type:'node',ci,ni,kind,start:p,original:snapshot(),moved:false};svg.setPointerCapture(e.pointerId);renderGizmos();return;}
 const path=e.target.closest('[data-fvv-id]'),shape=path?state.shapes.find(x=>x.id===path.dataset.fvvId):null;
 if(shape&&!shape.locked){if(state.selected!==shape.id){state.selected=shape.id;state.node=null;render();}if(state.tool==='select'||state.tool==='node'){state.drag={type:'shape',start:p,original:snapshot(),moved:false};svg.setPointerCapture(e.pointerId);}}
 else{if(shape?.locked)note(`${shape.name} is locked. Unlock it in the Objects list to edit it.`);state.selected=null;state.node=null;render();}
}
function onPointerMove(e){const p=svgCoordinates(e);$('fvv-coordinates').textContent=`X ${Math.round(p.x)} · Y ${Math.round(p.y)}`;
 if(!state.drag){if(state.tool==='crop'){crop.move(e,p);return;}if(state.tool==='pen'&&state.pen?.length)renderPenPreview(p);return;}const d=state.drag;if(d.type==='pan'){state.fitPaper=false;const r=svg.getBoundingClientRect();state.view={...d.view,x:d.view.x-(e.clientX-d.clientX)*d.view.w/Math.max(1,r.width),y:d.view.y-(e.clientY-d.clientY)*d.view.h/Math.max(1,r.height)};useView();return;}if(d.type==='brush'){maskAt(p,'add');return;}if(d.type==='new'){d.current=e.shiftKey?squareFrom(d.start,p):p;renderGizmos();return;}
 if(d.type==='pen-handle'){if(screenDistance(p,d.start)<3)return;d.point.out={x:p.x,y:p.y};d.point.in={x:2*d.point.x-p.x,y:2*d.point.y-p.y};renderGizmos();return;}
 if(d.type==='shape'){const s=selected();if(!s)return;let dx=p.x-d.start.x,dy=p.y-d.start.y;if(Math.abs(dx)+Math.abs(dy)<.35)return;if(e.shiftKey){if(Math.abs(dx)>Math.abs(dy))dy=0;else dx=0;}d.moved=true;const orig=d.original.find(x=>x.id===s.id);if(!orig)return;for(let ci=0;ci<s.contours.length;ci++)for(let ni=0;ni<s.contours[ci].nodes.length;ni++){const point=s.contours[ci].nodes[ni],old=orig.contours[ci].nodes[ni];point.x=old.x+dx;point.y=old.y+dy;point.in=old.in?{x:old.in.x+dx,y:old.in.y+dy}:null;point.out=old.out?{x:old.out.x+dx,y:old.out.y+dy}:null;}renderShapes();renderGizmos();return;}
 if(d.type==='node'){const s=selected();if(!s)return;const point=s.contours[d.ci].nodes[d.ni],old=d.original.find(x=>x.id===s.id).contours[d.ci].nodes[d.ni],dx=p.x-d.start.x,dy=p.y-d.start.y;if(Math.abs(dx)+Math.abs(dy)<.3)return;d.moved=true;
  if(d.kind==='anchor'){point.x=old.x+dx;point.y=old.y+dy;point.in=old.in?{x:old.in.x+dx,y:old.in.y+dy}:null;point.out=old.out?{x:old.out.x+dx,y:old.out.y+dy}:null;}
  else{const moved={x:(old[d.kind]?.x??old.x)+dx,y:(old[d.kind]?.y??old.y)+dy};point[d.kind]=moved;
   // Smooth nodes keep both handles in line unless Alt is held, which breaks the tangent.
   const other=d.kind==='in'?'out':'in';if(!e.altKey&&old[other]){const len=Math.hypot(old[other].x-old.x,old[other].y-old.y),vx=old.x-moved.x,vy=old.y-moved.y,vl=Math.hypot(vx,vy)||1;point[other]={x:old.x+vx/vl*len,y:old.y+vy/vl*len};}}
  renderShapes();renderGizmos();}
}
function squareFrom(a,b){const size=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y));return {x:a.x+Math.sign(b.x-a.x||1)*size,y:a.y+Math.sign(b.y-a.y||1)*size};}
function renderPenPreview(p){renderGizmos();const last=state.pen.at(-1),layer=$('fvv-editor-gizmos'),closing=state.pen.length>=3&&screenDistance(p,state.pen[0])<10;const c={closed:false,nodes:[{...last,in:null},{x:p.x,y:p.y,in:null,out:null}]};layer.append(el('path',{d:pathD(c),fill:'none',stroke:'#5fa878','stroke-width':1.2,'stroke-dasharray':'2 4','vector-effect':'non-scaling-stroke','pointer-events':'none'}));if(closing)layer.append(el('circle',{cx:state.pen[0].x,cy:state.pen[0].y,r:7/state.zoom,fill:'none',stroke:'#2f7d50','stroke-width':2,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));}
function onPointerUp(e){crop.end(e);const d=state.drag;state.drag=null;if(!d)return;if(d.type==='pan')svg.style.cursor=state.tool==='hand'||state.space?'grab':state.tool==='select'?'default':'crosshair';if(d.type==='new'&&d.current)shapeFromDrag(d.newType,d.start,d.current);if(d.type==='pen-handle')renderGizmos();if((d.type==='node'||d.type==='shape')&&d.moved){state.history.push(d.original);if(state.history.length>60)state.history.shift();state.future=[];mark();render();}if(d.type==='brush'){mark();renderRaster();note('Mask updated.');}try{if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);}catch(_){} }
function nudge(dx,dy){const s=selected();if(!s||s.locked)return;checkpoint();const move=p=>{p.x+=dx;p.y+=dy;};
 if(state.tool==='node'&&state.node){const p=s.contours[state.node.ci]?.nodes?.[state.node.ni];if(p){move(p);if(p.in)move(p.in);if(p.out)move(p.out);}}
 else for(const c of s.contours)for(const p of c.nodes){move(p);if(p.in)move(p.in);if(p.out)move(p.out);}
 renderShapes();renderGizmos();}
function keydown(e){if(window.FervorFileBrowser?.active||!document.body.classList.contains('fv-vector-active'))return;if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable)return;
 const meta=e.metaKey||e.ctrlKey,low=e.key.toLowerCase();if(meta&&low==='z'){e.preventDefault();e.stopImmediatePropagation();if(e.shiftKey){if(!crop.undo(true)&&state.tool!=='crop')redo();}else if(!crop.undo(false)&&state.tool!=='crop')undo();return;}if(meta&&low==='y'){e.preventDefault();e.stopImmediatePropagation();if(!crop.undo(true)&&state.tool!=='crop')redo();return;}if(meta&&low==='s'){e.preventDefault();e.stopImmediatePropagation();save();return;}if(meta&&low==='d'){e.preventDefault();e.stopImmediatePropagation();duplicateShape();return;}
 if(meta&&(low==='='||low==='+')){e.preventDefault();e.stopImmediatePropagation();setZoom(state.zoom*1.25);return;}if(meta&&low==='-'){e.preventDefault();e.stopImmediatePropagation();setZoom(state.zoom/1.25);return;}if(meta&&low==='0'){e.preventDefault();e.stopImmediatePropagation();fitArtboard();return;}
 if(e.code==='Space'&&!meta&&document.activeElement?.tagName!=='BUTTON'){e.preventDefault();e.stopImmediatePropagation();if(!state.space){state.space=true;svg.style.cursor='grab';}return;}
 if(!meta&&crop.key(e)){e.preventDefault();e.stopImmediatePropagation();return;}
 if(e.key==='Backspace'&&state.pen?.length){e.preventDefault();e.stopImmediatePropagation();state.pen.pop();if(!state.pen.length)state.pen=null;renderGizmos();return;}
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopImmediatePropagation();if(state.tool==='node'&&state.node)nodeEdit('delete');else removeShape();return;}
 if(e.key.startsWith('Arrow')&&selected()){e.preventDefault();e.stopImmediatePropagation();const step=e.shiftKey?10:1;nudge(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0);return;}
 if(e.key==='Escape'){e.stopImmediatePropagation();if(state.pen?.length>=2){finalizePen(false);return;}state.pen=null;state.drag=null;if(state.tool!=='select')setTool('select');else{state.selected=null;state.node=null;render();}return;}
 if(e.key==='Enter'&&state.pen){finalizePen(false);e.stopImmediatePropagation();return;}
 if(low==='c'&&!meta&&state.pen){finalizePen(true);e.stopImmediatePropagation();return;}
 const toolMap={v:'select',h:'hand',a:'node',n:'node',p:'pen',r:'rect',e:'ellipse',m:'crop',w:'magic'};if(toolMap[low]&&!meta&&!e.altKey){e.preventDefault();e.stopImmediatePropagation();setTool(toolMap[low]);return;}
 // Keep the remaining single-key shortcuts of the hidden Stitch Lab editor from firing here.
 if(!meta&&!e.altKey&&e.key.length===1)e.stopImmediatePropagation();
}
function keyup(e){if(e.code==='Space'&&state.space){state.space=false;if(!state.drag)svg.style.cursor=state.tool==='hand'?'grab':state.tool==='select'?'default':'crosshair';}}
function onWheel(e){if(root.hidden)return;e.preventDefault();state.fitPaper=false;
 // Pinch / Ctrl / ⌘ + wheel zooms at the cursor. Plain wheel or two-finger scroll pans.
 if(e.ctrlKey||e.metaKey){zoomAt(state.zoom*Math.exp(-e.deltaY*(e.deltaMode===1?.05:.0025)),e.clientX,e.clientY);return;}
 const k=e.deltaMode===1?18:e.deltaMode===2?viewportPixels().h:1,dx=(e.shiftKey&&!e.deltaX?e.deltaY:e.deltaX)*k,dy=(e.shiftKey&&!e.deltaX?0:e.deltaY)*k;state.view={...state.view,x:state.view.x+dx/state.zoom,y:state.view.y+dy/state.zoom};useView();}

function installToolIcons(){
 const shapes={
  select:'<path d="m5 3 14 9-7 1-3 7z"/>',
  hand:'<path d="M7 11V5a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8-4a2 2 0 0 1 4 0v6c0 4-3 6-7 6h-4c-3 0-5-1-7-4L3 15a2 2 0 0 1 4-2l3 3"/>',
  node:'<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M7 5h10M5 7v10h12"/>',
  pen:'<path d="M12 19 5 21l2-7 10-10 5 5-10 10Z"/><path d="m15 6 5 5"/>',
  rect:'<rect x="3" y="5" width="18" height="14"/>',
  ellipse:'<circle cx="12" cy="12" r="9"/>',
  crop:'<path d="M5 3v16h16M3 5h16v16"/><path d="M9 9l6 6" stroke-dasharray="2 2"/>',
  magic:'<path d="m3 21 12-12m-6-6 1 3 3 1-3 1-1 3-1-3-3-1 3-1zM19 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
  'brush-add':'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
  'brush-remove':'<circle cx="12" cy="12" r="9"/><path d="M7 12h10"/>',
  duplicate:'<rect x="8" y="8" width="12" height="12"/><path d="M4 16H3V4h12v1"/>',
  delete:'<path d="M5 6h14M9 6V4h6v2M7 6l1 15h8l1-15M10 10v7M14 10v7"/>',
  layers:'<path d="m12 2 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5m-18 5 9 5 9-5"/>',
  import:'<path d="M5 3h10l4 4v13H5zM15 3v5h4M12 11v6m-3-3h6"/>',
  fit:'<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M7 11V7h4m2 10h4v-4"/>',
  'zoom-in':'<circle cx="10" cy="10" r="7"/><path d="m15.5 15.5 5 5M10 6v8M6 10h8"/>',
  'zoom-out':'<circle cx="10" cy="10" r="7"/><path d="m15.5 15.5 5 5M6 10h8"/>'
 };
 const common={select:'[data-tool="select"]',hand:'[data-tool="pan"]',node:'[data-tool="nodes"]',pen:'[data-tool="line"]',rect:'#sl-shapes','brush-add':'[data-tool="brush"]','brush-remove':'[data-tool="erase"]',layers:'#sl-layers',import:'#sl-add-file',fit:'#zoom-reset','zoom-in':'#zoom-in','zoom-out':'#zoom-out'};
 const inspectorIcon=$('sl-inspector-toggle')?.querySelector('svg')?.cloneNode(true);
 if(inspectorIcon)$('fvv-settings-button').prepend(inspectorIcon);
 for(const button of root.querySelectorAll('.fvv-tools button')){
  const key=button.dataset.fvvTool||button.dataset.fvvCommand||button.dataset.fvvQuick;
  const icon=button.querySelector('.fvv-icon');
  if(!icon)continue;
  icon.setAttribute('aria-hidden','true');
  const shared=common[key]&&document.querySelector(common[key]+' svg');
  if(shared){icon.replaceChildren(shared.cloneNode(true));continue;}
  if(shapes[key])icon.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">'+shapes[key]+'</svg>';
 }
}

function init(){installToolIcons();root.querySelectorAll('[data-fvv-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.fvvTool)));
 $('fvv-home').addEventListener('click',goHome);$('fvv-logo-home').addEventListener('click',goHome);$('fvv-to-stitch').addEventListener('click',switchToStitch);$('fvv-new').addEventListener('click',createVectorTab);
 $('fvv-rename-project').addEventListener('click',renameVector);$('fvv-copy-project').addEventListener('click',duplicateVector);
 const more=$('fvv-more-menu'),moreToggle=$('fvv-more-toggle');function toggleMore(on){more.hidden=!on;moreToggle.setAttribute('aria-expanded',String(on));}moreToggle.addEventListener('click',e=>{e.stopPropagation();toggleMore(more.hidden);});document.addEventListener('pointerdown',e=>{if(!root.contains(e.target)||(!more.contains(e.target)&&!moreToggle.contains(e.target)))toggleMore(false);});more.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>toggleMore(false)));
 $('fvv-settings-button').addEventListener('click',()=>setSettingsOpen(!root.classList.contains('fvv-settings-open')));
 $('fvv-artwork-import').addEventListener('click',()=>$('fvv-file-input').click());
 $('fvv-empty-open').onclick=()=>$('fvv-file-input').click();
 $('fvv-empty-draw').onclick=()=>{setTool('pen');svg.focus({preventScroll:true});};
 $('fvv-empty-sample').onclick=()=>loadRaster(window.NOMU_SAMPLE,'Gallop').catch(e=>note(e.message));
 $('fvv-start-crop').onclick=()=>{setTool('crop');svg.focus();};
 const canvasArea=$('fvv-canvas-area'),dropCue=$('fvv-drop-cue');
 canvasArea.addEventListener('dragover',e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();dropCue.hidden=false;});
 canvasArea.addEventListener('dragleave',e=>{if(!canvasArea.contains(e.relatedTarget))dropCue.hidden=true;});
 canvasArea.addEventListener('drop',e=>{
  if(!e.dataTransfer.files.length)return;
  e.preventDefault();dropCue.hidden=true;
  importFile(e.dataTransfer.files[0]).catch(err=>note('Open failed: '+err.message));
 });
 $('fvv-appearance-toggle').addEventListener('click',()=>showPanel('appearance'));
 root.querySelectorAll('[data-fvv-stage]').forEach(b=>b.addEventListener('click',()=>selectStage(b.dataset.fvvStage)));
 root.querySelectorAll('[data-fvv-view]').forEach(b=>b.addEventListener('click',()=>setPreviewMode(b.dataset.fvvView)));
 root.querySelectorAll('[data-fvv-quick]').forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.fvvQuick;if(a==='layers')showPanel('layers');else if(a==='import')$('fvv-file-input').click();else if(a==='fit')fitSelection(false);else if(a==='zoom-in')setZoom(state.zoom*1.25);else if(a==='zoom-out')setZoom(state.zoom/1.25);}));
 $('fvv-zoom-design').addEventListener('click',()=>fitSelection(false));$('fvv-focus').addEventListener('click',()=>fitSelection(true));
 $('fvv-export-svg-side').addEventListener('click',()=>download(exportSVG(),fileSafeName()+'.svg','image/svg+xml'));
 $('fvv-export-native-side').addEventListener('click',()=>download(JSON.stringify(documentData(),null,2),fileSafeName()+'.fvector','application/json'));
 $('fvv-export-send').addEventListener('click',handoff);
 for(const [a,b] of [['fvv-design-mm','fvv-export-mm'],['fvv-export-mm','fvv-design-mm']])$(a)?.addEventListener('input',()=>{const other=$(b);if(other)other.value=$(a).value;updateExportSize();});
$('fvv-open').addEventListener('click',e=>window.FervorFileBrowser.show(e.currentTarget,'vector'));$('fvv-save').addEventListener('click',save);$('fvv-more-save')?.addEventListener('click',save);$('fvv-export-project').addEventListener('click',()=>download(JSON.stringify(documentData(),null,2),fileSafeName()+'.fvector','application/json'));$('fvv-export-svg').addEventListener('click',()=>download(exportSVG(),fileSafeName()+'.svg','image/svg+xml'));
 $('fvv-file-input').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';try{await importFile(file);}catch(err){console.error(err);note('Open failed: '+err.message);}});
 $('fvv-send').addEventListener('click',handoff);$('fvv-send-side').addEventListener('click',handoff);
 $('fvv-undo').addEventListener('click',()=>state.tool==='crop'?crop.undo(false):undo());$('fvv-redo').addEventListener('click',()=>state.tool==='crop'?crop.undo(true):redo());
 $('fvv-zoom-plus').addEventListener('click',()=>setZoom(state.zoom*1.25));$('fvv-zoom-minus').addEventListener('click',()=>setZoom(state.zoom/1.25));$('fvv-zoom-fit').addEventListener('click',fitArtboard);
 $('fvv-shape-mode').addEventListener('change',e=>applyAppearance('mode',e.target.value));$('fvv-fill').addEventListener('input',e=>liveAppearance('fill',e.target.value));$('fvv-fill').addEventListener('change',e=>applyAppearance('fill',e.target.value));$('fvv-stroke').addEventListener('input',e=>liveAppearance('stroke',e.target.value));$('fvv-stroke').addEventListener('change',e=>applyAppearance('stroke',e.target.value));$('fvv-stroke-width').addEventListener('change',e=>applyAppearance('width',e.target.value));$('fvv-stroke-width').addEventListener('input',e=>{$('fvv-stroke-width-out').textContent=e.target.value+' px';liveAppearance('width',e.target.value);});
 $('fvv-node-smooth').addEventListener('click',()=>nodeEdit('smooth'));$('fvv-node-sharp').addEventListener('click',()=>nodeEdit('sharp'));$('fvv-node-add').addEventListener('click',()=>nodeEdit('add'));$('fvv-node-delete').addEventListener('click',()=>nodeEdit('delete'));$('fvv-break-apart').addEventListener('click',breakApart);
 $('fvv-shape-duplicate').addEventListener('click',duplicateShape);$('fvv-layer-up').addEventListener('click',()=>moveLayer(1));$('fvv-layer-down').addEventListener('click',()=>moveLayer(-1));$('fvv-layer-delete').addEventListener('click',()=>removeShape());root.querySelectorAll('[data-fvv-command]').forEach(b=>b.addEventListener('click',()=>b.dataset.fvvCommand==='delete'?removeShape():duplicateShape()));
 $('fvv-preset').addEventListener('change',e=>{setPreset(e.target.value);scheduleRetrace();});for(const id of ['threshold','paths','corners','noise','tolerance','brush-size'])$('fvv-'+id).addEventListener('input',()=>{syncRanges();if(['threshold','paths','corners','noise'].includes(id))scheduleRetrace();});for(const id of ['fvv-trace-mode','fvv-trace-fills','fvv-trace-strokes','fvv-ignore-white'])$(id).addEventListener('change',scheduleRetrace);
 $('fvv-trace').addEventListener('click',()=>traceImage(false));$('fvv-expand').addEventListener('click',expandTrace);
 $('fvv-mask-clear').addEventListener('click',()=>{crop.clear();render();note('Raster selection cleared.');});$('fvv-mask-apply').addEventListener('click',()=>{if(!state.mask)return note('Select an object first.');state.maskApplied=true;mark();render();note('Object isolated. Trace it to create vector paths.');});
 $('fvv-trace-view').addEventListener('change',e=>setPreviewMode(e.target.value));
 svg.addEventListener('pointerdown',onPointerDown);svg.addEventListener('pointermove',onPointerMove);svg.addEventListener('pointerup',onPointerUp);svg.addEventListener('pointercancel',onPointerUp);
 svg.addEventListener('dblclick',e=>{if(state.tool==='pen'){e.preventDefault();finalizePen(false);}});
 svg.addEventListener('wheel',onWheel,{passive:false});
 document.addEventListener('keydown',keydown,true);document.addEventListener('keyup',keyup,true);window.addEventListener('blur',()=>{state.space=false;});
 $('fvv-theme').addEventListener('click',()=>{const btn=$('fv-theme-toggle')||$('fv-editor-theme-toggle');if(btn)btn.click();else {const dark=!document.body.classList.contains('fv-theme-dark');document.body.classList.toggle('fv-theme-dark',dark);}});
 function themeLabel(){const v=localStorage.getItem('fervor_theme_mode_v1')||'auto';$('fvv-theme').textContent='THEME · '+v.toUpperCase();}themeLabel();window.addEventListener('fervor:theme-change',themeLabel);
 // Add entry points without reworking the existing homepage and editor state machines.
 const homeCTA=$('fv-home-continue');if(homeCTA){const button=homeCTA.cloneNode(false);button.id='fv-home-open-vector';button.className='fv-home-pill fvv-home-entry';button.textContent='Create Vector';const wrap=document.createElement('div');wrap.append(button);const cap=document.createElement('p');cap.textContent='Isolate, trace and edit vector paths.';wrap.append(cap);const row=homeCTA.closest('.fv-home-ctas');if(row)row.insertBefore(wrap,homeCTA.parentElement);button.addEventListener('click',startVectorFromHome);}
 // The alternate workspace stays inside the same application and document system.
 window.FervorVector={open:begin,close:goHome,ready:restoreVectorTabs,createTab:createVectorTab,openFile:async file=>{await restoreVectorTabs();return importFile(file);},openSaved,flushSave:flushVectorSave,get shapes(){return state.shapes},get active(){return document.body.classList.contains('fv-vector-active')},get selection(){return state.selected},get traceCount(){return state.tracePending?.length||0},save,loadDocument,exportSVG,trace:traceImage,expand:expandTrace,setTool,newDocument,undo,redo,send:handoff};
 useView();syncRanges();setPreviewMode('result');render();renderVectorTabs();selectStage('artwork');
}
init();
})();

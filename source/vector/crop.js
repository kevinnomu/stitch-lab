/* Anchor editing and the mask preview for Vector's magnetic crop. */
(() => {
 const engine=window.FervorCropEngine;
 const $=id=>document.getElementById(id);
 const layer=$('fvv-crop-layer'),status=$('fvv-crop-status');
 const copy=value=>structuredClone(value);
 const isArrow=key=>['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key);
 window.FervorVectorCrop=function({state,svg,el,note,changed,imageFrom,filename,trace}){
  let path=engine.clean(null,{x:0,y:0,w:960,h:640});
  let map=null,cache=new Map(),selected=-1,hover=null,drag=null;
  let history=[],future=[];
  const active=()=>state.tool==='crop'&&!!state.source;
  const strength=()=>path.magnet?path.strength/100:0;
  const rect=()=>state.source.rect;
  const keepOnImage=p=>({x:Math.max(rect().x,Math.min(rect().x+rect().w,p.x)),
   y:Math.max(rect().y,Math.min(rect().y+rect().h,p.y))});
  const toGrid=p=>({x:(p.x-rect().x)/rect().w*(map.width-1),y:(p.y-rect().y)/rect().h*(map.height-1)});
  const fromGrid=p=>({x:rect().x+p.x/Math.max(1,map.width-1)*rect().w,y:rect().y+p.y/Math.max(1,map.height-1)*rect().h});
  const radius=()=>3+path.strength*.11;
  const pathData=(points,closed=false)=>points.length?'M'+points.map(p=>p.x.toFixed(2)+' '+p.y.toFixed(2)).join('L')+(closed?'Z':''):'';
  function beginMap(){
   if(map)return;
   const img=state.source.imageData,scale=Math.min(1,420/Math.max(img.width,img.height));
   const input=document.createElement('canvas');input.width=img.width;input.height=img.height;
   input.getContext('2d').putImageData(img,0,0);
   const small=document.createElement('canvas');
   small.width=Math.max(1,Math.round(img.width*scale));small.height=Math.max(1,Math.round(img.height*scale));
   const ctx=small.getContext('2d',{willReadFrequently:true});
   ctx.drawImage(input,0,0,small.width,small.height);map=engine.edgeMap(ctx.getImageData(0,0,small.width,small.height));
  }
  function anchor(p,manual=false){
   p=keepOnImage(p);
   if(manual||!strength())return p;
   beginMap();const grid=toGrid(p),snapped=engine.snap(map,grid,radius(),strength());
   return snapped===grid?p:fromGrid(snapped);
  }
  function parts(){
   const count=path.anchors.length-(path.closed?0:1);
   if(count<1)return [];
   if(strength())beginMap();
   const next=new Map(),all=[];
   for(let i=0;i<count;i++){
    const a=path.anchors[i],b=path.anchors[(i+1)%path.anchors.length],key=[a.x,a.y,b.x,b.y,strength()].join(',');
    let segment=cache.get(key);
    if(!segment){
     segment=strength()?engine.segment(map,toGrid(a),toGrid(b),strength(),8+path.strength*.26).map(fromGrid):[a,b];
     segment[0]=a;segment[segment.length-1]=b;
    }
    next.set(key,segment);all.push(segment);
   }
   cache=next;return all;
  }
  function outline(){return parts().flatMap((segment,index)=>index?segment.slice(1):segment);}
  function information(){
   const count=path.anchors.length,description=!state.source?'Open or drop a raster image to begin.':path.closed?
    `${count} anchors · drag a square or click the outline to insert another.`:count?
    `${count} anchor${count===1?'':'s'} · click the first square or press Enter to close.`:'Click along the edge of the shape you want to keep.';
   if(status.textContent!==description)status.textContent=description;
   $('fvv-crop-magnet').setAttribute('aria-pressed',String(path.magnet));
   $('fvv-crop-magnet').textContent='Magnet '+(path.magnet?'on':'off');
   $('fvv-crop-strength').value=path.strength;
   $('fvv-crop-strength').disabled=!path.magnet;
   $('fvv-crop-strength-value').textContent=path.strength+'%';
   $('fvv-crop-close').disabled=path.closed||count<3;
   $('fvv-crop-remove').disabled=selected<0||(path.closed&&count<=3);
   $('fvv-crop-reset').disabled=!count&&!state.mask;
   $('fvv-crop-undo').disabled=!history.length;
   $('fvv-crop-redo').disabled=!future.length;
   $('fvv-crop-trace').disabled=!path.closed;
   $('fvv-crop-png').disabled=!path.closed;
  }
  function render(){
   layer.replaceChildren();information();
   if(!active()||!path.anchors.length)return;
   const points=outline(),d=pathData(points,path.closed);
   if(d){
    layer.append(el('path',{d,class:'fvv-crop-boundary',fill:'none','vector-effect':'non-scaling-stroke'}));
    layer.append(el('path',{d,class:'fvv-crop-ants',fill:'none','vector-effect':'non-scaling-stroke'}));
   }
   if(!path.closed&&hover&&!drag)layer.append(el('path',{d:pathData([path.anchors.at(-1),hover]),class:'fvv-crop-guide',fill:'none','vector-effect':'non-scaling-stroke'}));
   const size=9/state.zoom;
   path.anchors.forEach((p,i)=>layer.append(el('rect',{x:p.x-size/2,y:p.y-size/2,width:size,height:size,
    class:'fvv-crop-anchor'+(i===selected?' chosen':'')+(i===0&&!path.closed?' first':''),
    'data-crop-anchor':i,'vector-effect':'non-scaling-stroke'})));
  }
  function maskFromPath(){
   const {width,height}=state.source.imageData,r=rect(),canvas=document.createElement('canvas');
   canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});
   ctx.setTransform(width/r.w,0,0,height/r.h,-r.x*width/r.w,-r.y*height/r.h);
   ctx.fill(new Path2D(pathData(outline(),true)),'evenodd');
   const bytes=ctx.getImageData(0,0,width,height).data,out=new Uint8Array(width*height);
   for(let i=0;i<out.length;i++)out[i]=bytes[i*4+3]>128?1:0;
   return out;
  }
  function record(){
   return {path:copy(path),mask:state.mask,applied:state.maskApplied,selected};
  }
  function checkpoint(before=record()){
   history.push(before);if(history.length>30)history.shift();future=[];
  }
  function step(redo){
   if(!active())return false;
   const from=redo?future:history,to=redo?history:future;
   if(!from.length)return false;
   to.push(record());
   const data=from.pop();
   path=data.path;state.mask=data.mask;state.maskApplied=data.applied;selected=data.selected;
   hover=null;cache.clear();changed();render();return true;
  }
  function updateMask(){
   if(path.closed){state.mask=maskFromPath();state.maskApplied=true;path.rasterMode='path';}
   changed();render();
  }
  function close(){
   if(path.closed||path.anchors.length<3)return;
   checkpoint();path.closed=true;hover=null;updateMask();note('Crop isolated. Edit the outline, trace it, or export a PNG.');
  }
  function remove(){
   if(selected<0||(path.closed&&path.anchors.length<=3))return;
   checkpoint();path.anchors.splice(selected,1);selected=Math.min(selected,path.anchors.length-1);
   updateMask();
  }
  function clear(){
   if(!state.source)return;
   checkpoint();path.anchors=[];path.closed=false;path.rasterMode='path';
   state.mask=null;state.maskApplied=false;cache.clear();selected=-1;hover=null;
   changed();render();
  }
  function settings(key,value){
   if(path[key]===value)return;
   checkpoint();path[key]=value;cache.clear();updateMask();
  }
  function down(e,p){
   if(!active()){note('Open a PNG, JPG or WEBP image to start a crop.');return;}
   const hit=e.target.closest('[data-crop-anchor]');
   if(hit){
    const i=Number(hit.dataset.cropAnchor);
    if(!path.closed&&i===0&&path.anchors.length>=3){close();return;}
    selected=i;drag={pointer:e.pointerId,start:p,before:record(),moved:false};svg.setPointerCapture(e.pointerId);render();return;
   }
   const r=rect();if(p.x<r.x||p.x>r.x+r.w||p.y<r.y||p.y>r.y+r.h)return;
   if(path.anchors.length>=128)return note('This crop has 128 anchors. Remove a point before adding another.');
   if(path.closed){
    const closest=engine.nearest(parts(),p);
    if(!closest||closest.distance*state.zoom>11){selected=-1;render();return;}
    checkpoint();selected=closest.index+1;
    path.anchors.splice(selected,0,{x:closest.x,y:closest.y});updateMask();return;
   }
   const next=anchor(p,e.altKey);
   if(path.anchors.some(a=>Math.hypot(a.x-next.x,a.y-next.y)*state.zoom<3))return;
   checkpoint();selected=path.anchors.length;path.anchors.push(next);hover=null;
   changed();render();
  }
  function move(e,p){
   if(!active())return;
   if(drag?.pointer===e.pointerId){
    if(!drag.moved&&Math.hypot(p.x-drag.start.x,p.y-drag.start.y)*state.zoom<3)return;
    drag.moved=true;path.anchors[selected]=anchor(p,e.altKey);render();
   }else if(!path.closed&&path.anchors.length){hover=anchor(p,e.altKey);render();}
  }
  function end(e){
   if(drag?.pointer!==e.pointerId)return;
   const {before,moved}=drag;drag=null;
   if(moved&&e.type==='pointercancel'){path=before.path;cache.clear();render();}
   else if(moved){checkpoint(before);updateMask();}
   if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
  }
  function key(e){
   if(!active()||e.target!==svg)return false;
   if(e.key==='Enter'&&!path.closed&&path.anchors.length>=3){close();return true;}
   if(e.key==='Delete'||e.key==='Backspace'){remove();return true;}
   if(e.key==='Tab'&&path.anchors.length){
    if(e.shiftKey&&selected<=0||!e.shiftKey&&selected>=path.anchors.length-1){selected=-1;render();return false;}
    selected=e.shiftKey?selected-1:selected+1;render();return true;
   }
   if(isArrow(e.key)&&selected>=0){
    const s=(e.shiftKey?10:1)/state.zoom,p=path.anchors[selected];
    const x=p.x+(e.key==='ArrowLeft'?-s:e.key==='ArrowRight'?s:0),y=p.y+(e.key==='ArrowUp'?-s:e.key==='ArrowDown'?s:0);
    if(!e.repeat)checkpoint();
    path.anchors[selected]=keepOnImage({x,y});updateMask();return true;
   }
   return false;
  }
  async function exportPng(){
   if(!state.source||!path.closed)return;
   const source=state.source,r=source.rect,points=outline(),mask=state.mask;
   const maskType=path.rasterMode,downloadName=filename()+'_crop.png';
   const img=await imageFrom(source.originalDataUrl||source.dataUrl);
   const xs=points.map(p=>(p.x-r.x)/r.w*img.naturalWidth),ys=points.map(p=>(p.y-r.y)/r.h*img.naturalHeight);
   const left=maskType==='path'?Math.floor(Math.min(...xs)):0,top=maskType==='path'?Math.floor(Math.min(...ys)):0;
   const w=maskType==='path'?Math.ceil(Math.max(...xs))-left:img.naturalWidth;
   const h=maskType==='path'?Math.ceil(Math.max(...ys))-top:img.naturalHeight;
   if(w<1||h<1)throw Error('The crop does not contain any image pixels.');
   const scale=Math.min(1,8192/Math.max(w,h),Math.sqrt(16000000/(w*h)));
   const out=document.createElement('canvas');out.width=Math.max(1,Math.floor(w*scale));out.height=Math.max(1,Math.floor(h*scale));
   const ctx=out.getContext('2d');ctx.setTransform(out.width/w,0,0,out.height/h,-left*out.width/w,-top*out.height/h);
   if(maskType==='path'){
    ctx.clip(new Path2D(pathData(xs.map((x,i)=>({x,y:ys[i]})),true)),'evenodd');
    ctx.drawImage(img,0,0);
   }else{
    ctx.drawImage(img,0,0);ctx.globalCompositeOperation='destination-in';
    const m=document.createElement('canvas');m.width=source.imageData.width;m.height=source.imageData.height;
    const mCtx=m.getContext('2d'),alpha=mCtx.createImageData(m.width,m.height);
    for(let i=0;i<mask.length;i++)alpha.data[i*4+3]=mask[i]?255:0;
    mCtx.putImageData(alpha,0,0);ctx.drawImage(m,0,0,img.naturalWidth,img.naturalHeight);
   }
   const blob=await new Promise(resolve=>out.toBlob(resolve,'image/png'));
   if(!blob)throw Error('The PNG could not be encoded.');
   const href=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=href;link.download=downloadName;document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(href),2500);note('Transparent PNG exported.');
  }
  $('fvv-crop-magnet').onclick=()=>settings('magnet',!path.magnet);
  $('fvv-crop-strength').oninput=e=>{$('fvv-crop-strength-value').textContent=e.target.value+'%';};
  $('fvv-crop-strength').onchange=e=>settings('strength',Number(e.target.value));
  $('fvv-crop-close').onclick=close;$('fvv-crop-remove').onclick=remove;$('fvv-crop-reset').onclick=clear;
  $('fvv-crop-undo').onclick=()=>step(false);$('fvv-crop-redo').onclick=()=>step(true);
  $('fvv-crop-trace').onclick=()=>trace();
  $('fvv-crop-png').onclick=()=>exportPng().catch(e=>note(e.message));
  svg.addEventListener('pointerleave',()=>{if(hover){hover=null;render();}});
  return {active,down,move,end,key,render,undo:step,serialize:()=>path.anchors.length?copy(path):null,clear,
   reset(value){map=null;cache.clear();history=[];future=[];selected=-1;hover=null;drag=null;
    path=engine.clean(value,state.source?.rect||{x:0,y:0,w:960,h:640});},
   usePixelMask(){if(path.closed)path.rasterMode='mask';}};
 };
})();

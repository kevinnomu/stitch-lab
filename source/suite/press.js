/* Add tactile feedback to native controls without changing their activation. */
(() => {
 const controls='button, summary, input[type="button"], input[type="submit"], input[type="reset"], a[href], [role="button"], [role="tab"]';
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 const animations=new WeakMap();
 const held=new Map();

 function controlAt(target){
  if(!(target instanceof Element))return null;
  const control=target.closest(controls);
  if(!control||control.closest('#fvc-piano,#fv22-toolrail,.fvv-tools,[inert],[hidden]')||
     control.matches(':disabled,[aria-disabled="true"],[draggable="true"]'))return null;
  return control;
 }
 function profile(control){
  if(control.matches('#fv-home-continue,.fv-home-pill,.sl-pill.primary,.fvr-primary')){
   return {depth:3,scale:.986,duration:70,release:220};
  }
  if(control.matches('.fvr-row,.layer-label,.recent-open,summary,a[href]:not([role="button"])')){
   return {depth:1,scale:1,duration:55,release:150};
  }
  return {depth:2,scale:.975,duration:62,release:180};
 }
 function frame(y,scale,offset,easing){
  return {translate:'0px '+y+'px',scale:String(scale),offset,easing};
 }
 const rest=frame(0,1,0,'linear');
 function animate(control,frames,options){
  animations.get(control)?.cancel();
  if(reducedMotion.matches||typeof control.animate!=='function')return null;
  const anim=control.animate(frames,options);
  animations.set(control,anim);
  return anim;
 }
 function begin(key,control,bounds=null){
  if(held.has(key)||[...held.values()].some(press=>press.control===control))return;
  const p=profile(control);
  control.dataset.fvContact='';
  const anim=animate(control,[{...rest,easing:'cubic-bezier(.21,.78,.25,1)'},frame(p.depth,p.scale,1,'linear')],
   {duration:p.duration,fill:'forwards'});
  held.set(key,{control,p,anim,bounds});
 }
 function end(key,settle=false){
  const press=held.get(key);
  if(!press)return;
  held.delete(key);
  const {control,p,anim}=press;
  delete control.dataset.fvContact;
  if(!control.isConnected||settle||reducedMotion.matches){anim?.cancel();return;}
  if(!anim)return;
  const progress=anim.effect.getComputedTiming().progress??0;
  const from=frame(p.depth*progress,1+(p.scale-1)*progress,0,'linear');
  const frames=[from];
  // Give a quick tap time to reach the end of its travel before it springs back.
  if(progress<.86){
   from.easing='cubic-bezier(.20,.74,.29,1)';
   frames.push(frame(p.depth,p.scale,.2,'cubic-bezier(.18,.75,.37,1)'));
  }else from.easing='cubic-bezier(.18,.75,.37,1)';
  frames.push(frame(-p.depth*.22,1+(1-p.scale)*.2,.62,'ease-out'),{...rest,offset:1});
  animate(control,frames,{duration:p.release});
 }
 function clear(){
  for(const key of held.keys())end(key,true);
 }
 const cap={capture:true,passive:true};
 addEventListener('pointerdown',e=>{
  if(e.button!==0||!e.isPrimary)return;
  const control=controlAt(e.target);
  if(control)begin(e.pointerId,control,control.getBoundingClientRect());
 },cap);
 addEventListener('pointermove',e=>{
  const b=held.get(e.pointerId)?.bounds;
  if(!b)return;
  const slop=e.pointerType==='touch'?10:5;
  if(e.clientX<b.left-slop||e.clientX>b.right+slop||e.clientY<b.top-slop||e.clientY>b.bottom+slop)end(e.pointerId,true);
 },cap);
 addEventListener('pointerup',e=>end(e.pointerId),cap);
 addEventListener('pointercancel',e=>end(e.pointerId,true),cap);
 addEventListener('contextmenu',clear,cap);
 addEventListener('blur',clear);
 addEventListener('keydown',e=>{
  if(e.repeat||e.altKey||e.ctrlKey||e.metaKey||(e.key!=='Enter'&&e.key!==' '))return;
  const control=controlAt(e.target);
  if(!control||(e.key===' '&&control.matches('a[href]:not([role="button"])')))return;
  begin(e.key,control);
 },cap);
 addEventListener('keyup',e=>end(e.key),cap);
 document.addEventListener('focusout',e=>{
  for(const [key,press] of held)if(typeof key==='string'&&press.control===e.target)end(key,true);
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
 reducedMotion.addEventListener('change',clear);
})();

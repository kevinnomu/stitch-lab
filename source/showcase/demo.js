(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const home=$('fervor-home'),guide=$('gallop-guide'),next=$('gallop-next');
 const V=window.FervorVector,W=window.FervorWorkspace;
 function showHome(){
  if(V.active)V.close();
  home.hidden=false;document.body.classList.add('fervor-home-open');
  guide.hidden=true;$('gallop-start').focus({preventScroll:true});
 }
 $('fv-header-home').addEventListener('click',showHome);
 $('fvv-logo-home').addEventListener('click',()=>{guide.hidden=true;});
 $('portfolio-vector').onclick=()=>window.FervorSuite.open('vector');
 $('portfolio-stitch').onclick=()=>window.FervorSuite.open('stitch');
 $('portfolio-files').onclick=event=>window.FervorFileBrowser.show(event.currentTarget);
 $('gallop-close').onclick=()=>{guide.hidden=true;};
 function step(copy,label,action){
  $('gallop-step').textContent=copy;next.textContent=label;next.hidden=!label;guide.hidden=false;
  next.onclick=action?async()=>{
   next.disabled=true;
   try{await action();}
   catch(error){$('gallop-step').textContent=error.message;}
   finally{next.disabled=false;}
  }:null;
 }
 async function trace(){
  if(!await V.trace(false))throw Error('Adjust the trace threshold and try again.');
  V.expand();
  if(!V.shapes.length)throw Error('Adjust the trace threshold and try again.');
  V.setTool('node');
  const nodes=V.shapes.flatMap(shape=>shape.contours).reduce((n,c)=>n+c.nodes.length,0);
  step(nodes+' editable nodes. Drag one of the square anchors or transfer the design as it is.','Digitize at 90 mm',digitize);
 }
 async function digitize(){
  $('fvv-design-mm').value='90';
  await V.send();
  if(V.active)throw Error('Complete the Vector transfer, then try again.');
  W.goToStage('arrange');
  $('tab-sequence').click();
  step('The design is now in Stitch Lab in millimeters. Use Play to see the real stitch order, then export.','Review export',()=>{
   if($('sim-play').getAttribute('aria-label')==='Pause stitch simulation')$('sim-play').click();
   W.goToStage('finish');
   $('tab-tools').click();
   step('Stitch Lab checks the hoop and decodes the JEF it writes. Export to see the dimensions from the machine file.','Export and inspect JEF',()=>{
    if($('export-jef').disabled)throw Error('Resolve any hoop or stitch warnings before export.');
    $('export-jef').click();
   });
  });
 }
 $('gallop-start').onclick=async()=>{
  try{
   await V.ready();
   V.createTab();
   await window.FervorSuite.open('vector');
   // Keep the sample available in the standalone file without a network fetch.
   const uri=window.NOMU_SAMPLE,raw=atob(uri.split(',')[1]);
   const file=new File([Uint8Array.from(raw,c=>c.charCodeAt(0))],'Gallop.png',{type:'image/png'});
   await V.openFile(file);
   step('Start with the source silhouette. Trace follows the edges and preserves interior holes.','Trace Gallop',trace);
  }catch(error){step(error.message,'',null);}
 };
 async function inspect(buffer){
  const local=location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname);
  if(local){
   try{
    const response=await fetch('/api/jef/inspect',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:buffer});
    if(response.status!==404){
     const details=await response.json();if(!response.ok)throw Error(details.error);
     return {...details,decoder:'Python API'};
    }
   }catch(error){if(!(error instanceof TypeError))throw error;}
  }
  const p=window.JefCore.parse(buffer);
  return {width_mm:p.width,height_mm:p.height,stitches:p.events.filter(e=>e.type==='stitch').length,decoder:'Browser decoder'};
 }
 function summary(p){
  return p.width_mm.toFixed(1)+' × '+p.height_mm.toFixed(1)+' mm · '+p.stitches.toLocaleString()+' stitches · '+p.decoder;
 }
 const proof=$('proof-result');
 async function showProof(buffer){
  try{proof.textContent=summary(await inspect(buffer));}
  catch(error){proof.textContent=error.message;}
 }
 $('proof-sample').onclick=async()=>{
  try{
   const embedded=$('proof-sample').dataset.jef;
   if(embedded){await showProof(Uint8Array.from(atob(embedded),c=>c.charCodeAt(0)).buffer);return;}
   const response=await fetch('samples/Gallop-90mm.jef');
   if(!response.ok)throw Error('Gallop sample is unavailable.');
   await showProof(await response.arrayBuffer());
  }catch(error){proof.textContent=error.message;}
 };
 $('proof-file').onchange=async event=>{
  const file=event.target.files[0];if(file)await showProof(await file.arrayBuffer());
  event.target.value='';
 };
 window.addEventListener('stitchlab:jef-exported',async event=>{
  if(guide.hidden)return;
  try{step(summary(await inspect(event.detail.buffer)), 'Start from a new Gallop sample',showHome);}
  catch(error){step(error.message,'Return to the demo',showHome);}
 });
})();

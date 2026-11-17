/* Small local image attachments can travel in a portable project file. */
(() => {
'use strict';
const limit=6,url=/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i;
function normalize(value){
 if(!Array.isArray(value))return [];
 return value.filter(item=>typeof item?.src==='string'&&item.src.length<=2_000_000&&url.test(item.src)).slice(0,limit)
  .map(item=>({src:item.src,name:String(item.name||'Screenshot').slice(0,150)}));
}
async function encode(file){
 if(file.size>30_000_000)throw Error('Choose an image smaller than 30 MB.');
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();image.src=url;await image.decode();
  const canvas=document.createElement('canvas'),scale=Math.min(1,1280/Math.max(image.naturalWidth,image.naturalHeight));
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  return {name:file.name||'Screenshot',src:canvas.toDataURL('image/webp',.86)};
 }finally{URL.revokeObjectURL(url);}
}
function bind(container,note,beforeChange,afterChange){
 let attaching=false;
 const gallery=document.createElement('div'),controls=document.createElement('div'),status=document.createElement('small');
 const picker=document.createElement('input'),button=document.createElement('button');
 gallery.className='fv-note-images';controls.className='fv-note-attachments';status.setAttribute('role','status');
 picker.type='file';picker.accept='image/*';picker.multiple=true;picker.hidden=true;
 button.type='button';button.textContent='Add image…';button.title='Choose, paste or drop an image or screenshot';
 button.onclick=()=>picker.click();
 controls.append(button,picker,status);container.append(gallery,controls);
 function render(){
  gallery.replaceChildren();
  const items=note.attachments||[];button.disabled=attaching||items.length>=limit;
  items.forEach((item,index)=>{
   const figure=document.createElement('figure'),img=document.createElement('img'),remove=document.createElement('button');
   img.src=item.src;img.alt=item.name;img.title=item.name;
   remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Remove '+item.name);
   remove.onclick=()=>{beforeChange();items.splice(index,1);render();afterChange();};
   figure.append(img,remove);gallery.append(figure);
  });
 }
 async function add(files){
  const images=[...files].filter(file=>file.type.startsWith('image/'));
  if(!images.length||attaching)return;
  const remaining=limit-(note.attachments?.length||0);
  if(!remaining){status.textContent='This note has six images.';return;}
  attaching=true;render();
  try{
   const results=await Promise.allSettled(images.slice(0,remaining).map(encode));
   if(!container.isConnected)return;
   const attached=normalize(results.filter(result=>result.status==='fulfilled').map(result=>result.value));
   if(attached.length){beforeChange();note.attachments=[...note.attachments||[],...attached].slice(0,limit);afterChange();}
   status.textContent=attached.length<Math.min(remaining,images.length)?'Some images could not be added.':
    images.length>remaining?'The note now has six images.':'';
  }finally{attaching=false;render();}
 }
 const hasFiles=e=>e.dataTransfer?.types?.includes('Files');
 container.addEventListener('dragover',e=>{if(hasFiles(e)){e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy';container.classList.add('fv-note-drop');}});
 container.addEventListener('dragleave',e=>{if(!container.contains(e.relatedTarget))container.classList.remove('fv-note-drop');});
 container.addEventListener('drop',e=>{if(!hasFiles(e))return;e.preventDefault();e.stopPropagation();container.classList.remove('fv-note-drop');add(e.dataTransfer.files);});
 container.addEventListener('paste',e=>{const files=e.clipboardData?.files;if(!files||![...files].some(file=>file.type.startsWith('image/')))return;e.preventDefault();e.stopPropagation();add(files);});
 picker.onchange=()=>{add(picker.files);picker.value='';};
 note.attachments=normalize(note.attachments);render();
}
window.FervorNoteAttachments={bind,normalize};
})();

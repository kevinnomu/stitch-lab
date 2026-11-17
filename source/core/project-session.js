/* Workspace tabs store stable project IDs. Edits stay in the project database. */
(() => {
'use strict';
const files=window.FervorProjectFiles;
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch(_){return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch(_){}};
const key=kind=>'fervor-open-tabs-'+kind;
const recentKey='fervor-project-open-history';
function load(kind){return read(key(kind),{active:null,ids:[]});}
function remember(kind,ids,active){write(key(kind),{ids:[...new Set(ids.filter(Boolean))],active:active||null});}
function touch(id,blank){
 if(!id)return;
 const previous=read(recentKey,[]);
 if(blank)return;
 write(recentKey,[id,...previous.filter(value=>value!==id)].slice(0,60));
}
function openOrder(){return read(recentKey,[]);}
async function available(kind){
 const saved=load(kind),map=new Map((await files.list()).map(item=>[item.id,item]));
 return {active:saved.active,items:saved.ids.map(id=>map.get(id)).filter(item=>item?.type===kind&&files.isActive(item,map))};
}
function bindReorder(element,items,item,selector,changed){
 element.draggable=true;element.dataset.tabId=String(item.id);
 function move(from,to){
  if(from<0||to<0||from===to||to>=items.length)return;
  const [moved]=items.splice(from,1);items.splice(to,0,moved);changed(moved);
 }
 element.addEventListener('dragstart',e=>{
  e.dataTransfer.setData('application/x-fervor-tab',String(item.id));e.dataTransfer.effectAllowed='move';
 });
 element.addEventListener('dragover',e=>{
  if(e.dataTransfer.types.includes('application/x-fervor-tab')){e.preventDefault();e.dataTransfer.dropEffect='move';}
 });
 element.addEventListener('drop',e=>{
  const from=e.dataTransfer.getData('application/x-fervor-tab');if(!from)return;e.preventDefault();
  move(items.findIndex(tab=>String(tab.id)===from),items.indexOf(item));
 });
 element.addEventListener('keydown',e=>{
  if(!e.altKey||!['ArrowLeft','ArrowRight'].includes(e.key))return;
  e.preventDefault();const index=items.indexOf(item);
  move(index,index+(e.key==='ArrowLeft'?-1:1));
  element.parentElement?.querySelector(selector)?.focus({preventScroll:true});
 });
}
const rename=document.createElement('dialog');
rename.id='fv-rename-project';rename.setAttribute('aria-labelledby','fv-rename-heading');
rename.innerHTML='<form><h2 id="fv-rename-heading">Rename project</h2><label>Project name<input name="name" maxlength="100" required></label><p role="status"></p><div><button type="button">Cancel</button><button type="submit">Rename</button></div></form>';
document.body.append(rename);
const form=rename.querySelector('form'),input=form.elements.name,submit=form.querySelector('[type="submit"]');
form.querySelector('[type="button"]').onclick=()=>rename.close();
let applyName;
form.onsubmit=async e=>{
 e.preventDefault();const value=input.value.trim();
 if(!value||submit.disabled)return;
 submit.disabled=true;
 try{await applyName(value);rename.close();}
 catch(error){form.querySelector('[role="status"]').textContent=error.message;}
 finally{submit.disabled=false;}
};
function renameProject(name,apply){
 if(rename.open)return;
 applyName=apply;input.value=name;form.querySelector('[role="status"]').textContent='';rename.showModal();input.select();
}
window.FervorProjectSession={remember,available,touch,openOrder,bindReorder,renameProject};
})();

/* Project Files is a modal so browsing never closes or replaces the current design. */
(() => {
'use strict';
const files=window.FervorProjectFiles;
const dialog=document.createElement('dialog');
dialog.id='fv-project-files';dialog.setAttribute('aria-labelledby','fv-project-title');
dialog.innerHTML=`
 <div class="fv-project-header">
  <div><h2 id="fv-project-title">Project Files</h2><p>Projects saved locally in FERVOR.</p></div>
  <button type="button" class="fv-project-close" aria-label="Close Project Files">×</button>
 </div>
 <div class="fv-project-layout">
  <aside class="fv-project-sidebar" aria-label="File locations">
   <nav aria-label="Project locations">
    <button type="button" data-location="projects">All Projects</button>
    <button type="button" data-location="recent">Recent</button>
    <button type="button" data-location="notes">Notes</button>
    <button type="button" data-location="deleted">Recently Deleted <span id="fv-project-trash-count"></span></button>
   </nav>
   <h3>Folders</h3>
   <div id="fv-project-folders"></div>
  </aside>
  <section class="fv-project-main" aria-label="Saved projects">
   <div class="fv-project-tools">
    <button type="button" id="fv-project-new">New Folder</button>
    <button type="button" id="fv-project-import">Import File…</button>
    <input type="file" id="fv-project-input" accept=".json,.fvector,.jef,.pes,.pec,.svg,.png,.jpg,.jpeg,.webp,.gif,.bmp" hidden>
    <input type="search" id="fv-project-search" placeholder="Search Project Files" aria-label="Search Project Files">
    <label for="fv-project-filter" class="fv-project-sr">Project type</label>
    <select id="fv-project-filter"><option value="">All types</option><option value="stitch">Stitch Lab</option><option value="vector">Vector</option></select>
    <select id="fv-project-sort" aria-label="Sort projects"><option value="recent">Most recent</option><option value="name">Name</option><option value="random">Random</option></select>
    <button type="button" id="fv-project-shuffle" hidden>Reshuffle</button>
    <select id="fv-notes-source" aria-label="Filter notes by source" hidden><option value="">All sources</option><option value="stitch">Stitch Lab</option></select>
    <select id="fv-notes-sort" aria-label="Sort notes" hidden><option value="source">By source</option><option value="recent">Recently edited</option></select>
    <div class="fv-project-segment" role="group" aria-label="View">
     <button type="button" data-layout="grid" aria-pressed="true">Icons</button>
     <button type="button" data-layout="list" aria-pressed="false">List</button>
    </div>
   </div>
   <nav id="fv-project-path" aria-label="Current folder"></nav>
   <div class="fv-project-content" id="fv-project-content" data-layout="grid"></div>
   <div id="fv-project-actions" class="fv-project-actions" hidden></div>
   <form id="fv-project-form" class="fv-project-form" hidden>
    <label id="fv-project-form-label" for="fv-project-name"></label>
    <input id="fv-project-name" type="text" maxlength="100" required autocomplete="off">
    <select id="fv-project-folder-select" aria-label="Destination folder" hidden></select>
    <button type="submit" class="fv-project-primary" id="fv-project-submit">Save</button>
    <button type="button" id="fv-project-cancel">Cancel</button>
   </form>
  </section>
 </div>
 <details class="fv-project-transfer">
  <summary>Transfer library</summary>
  <div class="fv-project-transfer-actions">
   <button type="button" id="fv-project-export-library">Export library…</button>
   <button type="button" id="fv-project-import-library">Import library…</button>
   <input type="file" id="fv-project-library-input" accept=".json,application/json" hidden>
   <small>Transfer includes Stitch Lab and Vector projects, folders, project notes. Saved data lives in this browser profile for the address where you opened FERVOR. Imports merge into the current library.</small>
  </div>
 </details>
 <p id="fv-project-status" role="status"></p>`;
document.body.append(dialog);
const $=id=>document.getElementById(id);
const content=$('fv-project-content'),form=$('fv-project-form'),actions=$('fv-project-actions');
const search=$('fv-project-search'),filter=$('fv-project-filter'),nameInput=$('fv-project-name'),destination=$('fv-project-folder-select');
const order=$('fv-project-sort'),source=$('fv-notes-source'),notesOrder=$('fv-notes-sort'),shuffle=$('fv-project-shuffle');
let randomRanks=new Map(),notes=[],opening=false,editing=false;
function shuffleRanks(){randomRanks=new Map(all.map(item=>[item.id,Math.random()]));}
let all=[],map=new Map(),location='projects',folderId=null,selection=null,layout='grid',formState=null,trigger=null,loadingVersion=0,importType='stitch';
const labels={folder:'Folder',stitch:'Stitch Lab',vector:'Vector'};
const date=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'});
const byName=(a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'});
const active=x=>files.isActive(x,map);
const activeFolders=()=>all.filter(x=>x.type==='folder'&&active(x)).sort(byName);
const icon=kind=>kind==='folder'
 ?'<svg viewBox="0 0 32 32" width="44" height="44" aria-hidden="true"><path d="M3 8h10l3 4h13v13H3zM3 13h26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'
 :'<svg viewBox="0 0 32 32" width="38" height="38" aria-hidden="true"><path d="M8 3h10l6 6v20H8zM18 3v7h6M12 16h8m-8 5h8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
function text(tag,value,className){
 const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el;
}
function button(label,click,className){
 const el=text('button',label,className);el.type='button';el.addEventListener('click',click);return el;
}
function status(value=''){$('fv-project-status').textContent=value;}
function trail(id){
 const parents=[];
 for(let item=map.get(id);item;item=map.get(item.parentId))parents.unshift(item);
 return parents;
}
function openLocation(view,id=null){
 location=view;folderId=id;selection=null;search.value='';hideForm();status();if(view==='notes')refresh();render();
}
function renderSidebar(){
 dialog.querySelectorAll('[data-location]').forEach(b=>{
  const current=b.dataset.location===location&&(location!=='projects'||folderId===null);
  b.setAttribute('aria-current',current?'page':'false');
 });
 $('fv-project-trash-count').textContent=String(all.filter(x=>x.deletedAt).length);
 const folders=$('fv-project-folders'),items=activeFolders();
 folders.replaceChildren();
 if(!items.length){folders.append(text('p','No folders yet.'));return;}
 const itemsByParent=new Map();
 for(const item of items){
  if(!itemsByParent.has(item.parentId))itemsByParent.set(item.parentId,[]);
  itemsByParent.get(item.parentId).push(item);
 }
 function append(parentId,depth){
  for(const item of itemsByParent.get(parentId)||[]){
   const b=button(item.name,()=>openLocation('projects',item.id));
   const glyph=text('span','▱','fv-project-folder-icon');glyph.setAttribute('aria-hidden','true');
   b.prepend(glyph);b.title=item.name;
   b.style.setProperty('--project-indent',Math.min(depth,5)*10+'px');
   if(folderId===item.id&&location==='projects')b.setAttribute('aria-current','page');
   folders.append(b);append(item.id,depth+1);
  }
 }
 append(null,0);
}
function renderPath(){
 const path=$('fv-project-path');path.replaceChildren();
 if(location!=='projects'){
  path.append(text('strong',location==='notes'?'Notes':location==='recent'?'Recent Projects':'Recently Deleted'));
  return;
 }
 path.append(button('All Projects',()=>openLocation('projects')));
 for(const p of trail(folderId)){
  const sep=text('span','/');sep.setAttribute('aria-hidden','true');
  path.append(sep,button(p.name,()=>openLocation('projects',p.id)));
 }
}
function shown(){
 const query=search.value.toLocaleLowerCase().trim(),kind=filter.value;
 let entries;
 if(location==='deleted')entries=all.filter(x=>x.deletedAt);
 else if(location==='recent')entries=all.filter(x=>x.type!=='folder'&&active(x));
 else entries=all.filter(x=>active(x)&&(query||x.parentId===folderId));
 if(query)entries=entries.filter(x=>x.name.toLocaleLowerCase().includes(query));
 if(kind)entries=entries.filter(x=>x.type===kind||x.type==='folder');
 const compare=order.value==='name'?byName:order.value==='random'?
  (a,b)=>(randomRanks.get(a.id)??1)-(randomRanks.get(b.id)??1)||byName(a,b):
  (a,b)=>(location==='deleted'?b.deletedAt-a.deletedAt:b.modifiedAt-a.modifiedAt)||byName(a,b);
 return entries.sort((a,b)=>(location==='projects'?Number(b.type==='folder')-Number(a.type==='folder'):0)||compare(a,b));
}
function select(id){
 if(selection!==id)hideForm();
 selection=id;
 for(const el of content.querySelectorAll('[data-file-id]'))el.setAttribute('aria-pressed',String(el.dataset.fileId===selection));
 renderActions();
}
function tile(item){
 const node=document.createElement('button');node.type='button';node.className='fv-project-tile';
 node.dataset.fileId=item.id;node.setAttribute('aria-pressed',String(item.id===selection));node.title=item.name;
 const visual=document.createElement('span');visual.className='fv-project-preview';
 if(item.thumbnail){
  const img=document.createElement('img');img.alt='';img.loading='lazy';img.src=item.thumbnail;visual.append(img);
 }else visual.innerHTML=icon(item.type);
 const meta=document.createElement('span');meta.className='fv-project-meta';
 meta.append(text('strong',item.name),text('small',[
  labels[item.type],item.type==='folder'&&!item.deletedAt?null:date.format(item.deletedAt||item.modifiedAt),
  search.value.trim()&&item.parentId?trail(item.parentId).map(p=>p.name).join(' / '):null
 ].filter(Boolean).join(' · ')));
 if(item.testedAt)meta.append(text('span','✓ Tested','fv-project-tested'));
 node.append(visual,meta);
 node.addEventListener('click',()=>select(item.id));
 node.addEventListener('dblclick',()=>{if(location!=='deleted')activate(item);});
 node.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&location!=='deleted'){e.preventDefault();activate(item);}
  if(e.key==='F2'&&location!=='deleted'){e.preventDefault();select(item.id);beginForm('rename',item);}
 });
 return node;
}
function render(){
 if(folderId&&(!map.has(folderId)||!active(map.get(folderId)))){folderId=null;selection=null;}
 renderSidebar();renderPath();
 const isNotes=location==='notes';
 for(const control of [$('fv-project-import'),$('fv-project-new'),filter,order,dialog.querySelector('.fv-project-segment')])control.hidden=isNotes;
 source.hidden=notesOrder.hidden=!isNotes;shuffle.hidden=isNotes||order.value!=='random';
 search.placeholder=isNotes?'Search notes':'Search Project Files';
 search.setAttribute('aria-label',search.placeholder);
 if(isNotes){renderNotes();actions.hidden=true;return;}
 const entries=shown();
 if(!entries.some(x=>x.id===selection)){selection=null;if(formState?.item)hideForm();}
 content.dataset.layout=layout;
 if(entries.length)content.replaceChildren(...entries.map(tile));
 else content.replaceChildren(text('p',search.value?'No matches.':location==='deleted'?'Recently Deleted is empty.':
  folderId?'This folder is empty.':'No saved projects yet. Save a design or import a file to get started.','fv-project-empty'));
 $('fv-project-new').disabled=location==='deleted';
 dialog.querySelectorAll('[data-layout]:is(button)').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.layout===layout)));
 renderActions();
}
async function refresh(){
 const rev=++loadingVersion;
 try{
  const entries=await files.list();if(rev!==loadingVersion)return;
  all=entries;map=new Map(all.map(x=>[x.id,x]));
  if(location==='notes')notes=await files.listNotes();
  if(rev===loadingVersion)render();
 }catch(error){if(rev===loadingVersion)status('Project Files could not open. '+error.message);}
}
function renderActions(){
 const item=map.get(selection);actions.hidden=!item||!!formState;actions.replaceChildren();if(actions.hidden)return;
 actions.append(text('strong',item.name));
 if(location==='deleted'){
  actions.append(button('Restore',()=>mutate('restore',item), 'fv-project-primary'));return;
 }
 actions.append(button('Open',()=>activate(item),'fv-project-primary'),
  button('Rename',()=>beginForm('rename',item)),
  button('Move',()=>beginForm('move',item)));
 if(item.type!=='folder')actions.append(button('Duplicate',()=>mutate('copy',item)));
 if(item.type==='stitch')actions.append(button(item.testedAt?'Clear Tested':'Mark as Tested',()=>mutate('tested',item)));
 actions.append(button('Move to Recently Deleted',()=>mutate('trash',item),'fv-project-trash'));
}
function hideForm(){form.hidden=true;formState=null;}
function beginForm(action,item=null){
 formState={action,item};form.hidden=false;
 const moving=action==='move';nameInput.hidden=moving;nameInput.disabled=moving;
 destination.hidden=!moving;
 const label=$('fv-project-form-label');
 label.htmlFor=moving?destination.id:nameInput.id;label.textContent=moving?'Move to':action==='rename'?'Rename':'Folder name';
 $('fv-project-submit').textContent=moving?'Move':action==='folder'?'Create Folder':'Save Name';
 if(moving){
  const allowed=activeFolders().filter(x=>!trail(x.id).some(p=>p.id===item.id));
  destination.replaceChildren(new Option('All Projects',''),...allowed.map(x=>new Option(trail(x.id).map(p=>p.name).join(' / '),x.id)));
  destination.value=item.parentId||'';destination.focus();
 }else{nameInput.value=item?.name||'';nameInput.focus();nameInput.select();}
 renderActions();
}
async function mutate(action,item){
 if(editing)return;editing=true;
 try{
  if(action==='tested')await window.FervorWorkspace?.flushSave();
  const result=await files.edit(action,item.id);
  if(action==='trash'||action==='restore')selection=null;
  if(action==='copy')selection=result.id;
  await refresh();
  status(action==='trash'?'Moved to Recently Deleted.':action==='restore'?'Restored to Project Files.':
   action==='tested'?(result.testedAt?'Marked this version as tested.':'Tested mark cleared.'):'Project duplicated.');
 }catch(error){status(error.message);}
 finally{editing=false;}
}
function renderNotes(){
 const query=search.value.trim().toLocaleLowerCase();
 const visible=notes.filter(note=>(!source.value||source.value===note.kind)&&
  `${note.source} ${note.text||''}`.toLocaleLowerCase().includes(query)).sort(notesOrder.value==='source'?
  (a,b)=>a.kind.localeCompare(b.kind)||a.source.localeCompare(b.source)||((b.updatedAt||0)-(a.updatedAt||0)):
  (a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
 content.dataset.layout='notes';content.replaceChildren();
 if(!visible.length){content.append(text('p',query?'No matching notes.':'No notes here yet. Add a note in Stitch Lab or in fullscreen artwork.','fv-project-empty'));return;}
 for(const note of visible){
  const row=text('article','','fv-notes-row');
  const link=button(note.source,async()=>{
   if(note.kind==='stitch'){const item=map.get(note.sourceId);if(item){await activate(item);if(!dialog.open)window.FervorWorkspace.openNote(note.id);}}
   else{
    try{await window.FervorArt.openNote(note.art,note.id);trigger=null;dialog.close();}
    catch(error){status(error.message);}
   }
  });
  row.append(text('small',note.kind==='art'?'Artwork':'Stitch Lab'),link,text('p',note.text||''));
  for(const attachment of window.FervorNoteAttachments.normalize(note.attachments)){
   const image=document.createElement('img');image.src=attachment.src;image.alt=attachment.name;row.append(image);
  }
  content.append(row);
 }
}
async function activate(item){
 if(opening)return;
 if(item.type==='folder'){openLocation('projects',item.id);return;}
 opening=true;
 try{
  const stored=await files.open(item.id);
  if(item.type==='vector')await window.FervorVector.openSaved(stored);
  else await window.FervorWorkspace.openRecent(stored);
  trigger=null;window.FervorSuite.open(item.type);
  if(dialog.open)dialog.close();
  document.getElementById(item.type==='vector'?'fvv-svg':'design-canvas')?.focus({preventScroll:true});
 }catch(error){if(dialog.open)status(error.message);else throw error;}
 finally{opening=false;}
}
dialog.querySelector('.fv-project-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('cancel',e=>{
 e.preventDefault();
 if(formState){hideForm();renderActions();}
 else dialog.close();
});
dialog.addEventListener('close',()=>{if(trigger?.getClientRects().length)trigger.focus({preventScroll:true});trigger=null;});
dialog.querySelectorAll('[data-location]').forEach(b=>b.addEventListener('click',()=>openLocation(b.dataset.location)));
dialog.querySelectorAll('button[data-layout]').forEach(b=>b.addEventListener('click',()=>{layout=b.dataset.layout;render();}));
$('fv-project-new').addEventListener('click',()=>beginForm('folder'));
$('fv-project-cancel').addEventListener('click',()=>{hideForm();renderActions();});
search.addEventListener('input',render);filter.addEventListener('change',render);
order.onchange=()=>{if(order.value==='random')shuffleRanks();render();};
shuffle.onclick=()=>{shuffleRanks();render();};
source.onchange=notesOrder.onchange=render;
form.addEventListener('submit',async e=>{
 e.preventDefault();if(!formState)return;
 const {action,item}=formState,submit=$('fv-project-submit');
 submit.disabled=true;
 try{
  const value=action==='move'?destination.value||null:nameInput.value.trim();
  if(action!=='move'&&!value)throw Error('Enter a name.');
  const result=await files.edit(action,item?.id??folderId,value);
  hideForm();
  if(action==='folder'){location='projects';folderId=result.parentId;search.value='';}
  selection=result.id;await refresh();status(result.name+(action==='move'?' moved.':action==='folder'?' created.':' renamed.'));
 }catch(error){status(error.message);}
 finally{submit.disabled=false;}
});
$('fv-project-import').addEventListener('click',()=>$('fv-project-input').click());
const libraryFormat='fervor-library';
const libraryExport=$('fv-project-export-library'),libraryImport=$('fv-project-import-library');
const libraryInput=$('fv-project-library-input');
async function transferLibrary(work){
 if(libraryExport.disabled)return;
 libraryExport.disabled=libraryImport.disabled=true;
 try{await work();}
 catch(error){status(error.message||'Could not transfer the library.');}
 finally{libraryExport.disabled=libraryImport.disabled=false;}
}
libraryExport.onclick=()=>transferLibrary(async()=>{
 status('Preparing library backup…');
 await Promise.all([window.FervorWorkspace?.flushSave(),window.FervorVector?.flushSave()]);
 const projects=await files.exportProjects(),favorites=window.FervorArt.favorites();
 const data=new Blob([JSON.stringify({format:libraryFormat,version:1,projects,favorites})],{type:'application/json'});
 const url=URL.createObjectURL(data),link=document.createElement('a');
 link.href=url;link.download='FERVOR_library.json';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
 status('Library backup exported.');
});
libraryImport.onclick=()=>libraryInput.click();
libraryInput.onchange=()=>{
 const file=libraryInput.files[0];libraryInput.value='';
 if(!file)return;
 transferLibrary(async()=>{
  status('Importing library backup…');
  let backup;
  try{backup=JSON.parse(await file.text());}
  catch(_){throw Error('This file is not a readable FERVOR library backup.');}
  if(backup?.format!==libraryFormat||backup.version!==1||!Array.isArray(backup.favorites)){
   throw Error('Choose a FERVOR library backup exported from Transfer library.');
  }
  const projects=await files.importProjects(backup.projects);
  const favorites=window.FervorArt.importFavorites(backup.favorites);
  await refresh();
  status('Imported '+projects+' '+(projects===1?'project':'projects')+' and '+favorites+' artwork '+(favorites===1?'favorite.':'favorites.'));
 });
};
$('fv-project-input').addEventListener('change',async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 try{
  let target=/\.(svg|fvector)$/i.test(file.name)?'vector':/\.(jef|pes|pec)$/i.test(file.name)?'stitch':filter.value||importType;
  if(/\.json$/i.test(file.name)){
   const doc=JSON.parse(await file.text());
   target=doc.format==='fervor-vector'?'vector':'stitch';
  }
  const opened=target==='vector'?await window.FervorVector.openFile(file):await window.FervorWorkspace.importArtwork(file);
  if(opened===false)throw Error('The file could not be opened.');
  trigger=null;window.FervorSuite.open(target);dialog.close();
 }catch(error){status(error.message);}
});
window.addEventListener('fervor:project-files-change',()=>{if(dialog.open)refresh();});
function show(from,kind='',view='projects'){
 if(dialog.open)return;
 trigger=from;importType=kind||'stitch';location=view;folderId=null;selection=null;search.value='';filter.value=kind;
 hideForm();status();dialog.showModal();render();search.focus();
 window.FervorWorkspace?.flushSave();window.FervorVector?.flushSave();refresh();
}
async function openLast(from){
 try{
  const entries=await files.list(),index=new Map(entries.map(item=>[item.id,item]));
  const available=item=>item&&(item.type==='stitch'||item.type==='vector')&&files.isActive(item,index);
  const last=window.FervorProjectSession.openOrder().map(id=>index.get(id)).find(available)
   ??entries.filter(available).sort((a,b)=>b.modifiedAt-a.modifiedAt)[0];
  if(last)await activate(last);
  else show(from,'','recent');
 }catch(error){show(from,'','recent');status(error.message);}
}
window.FervorFileBrowser={get active(){return dialog.open;},show,openLast};
})();

/* The local catalog separates small browser cards from editable project data. */
(() => {
'use strict';
const DB='FERVOR_Project_Files';
const key=()=>crypto.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const title=(value,fallback='Untitled')=>String(value||'').trim().slice(0,100)||fallback;
const legacyId=(type,name)=>'legacy:'+type+':'+name;
const saveEvent=()=>window.dispatchEvent(new Event('fervor:project-files-change'));
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
function openDatabase(name,upgrade){
 return new Promise((resolve,reject)=>{
  const r=indexedDB.open(name);
  r.onupgradeneeded=()=>upgrade(r.result,r.transaction);
  r.onsuccess=()=>resolve(r.result);
  r.onerror=()=>reject(r.error);
  r.onblocked=()=>reject(Error('Close the other FERVOR window and try again.'));
 });
}
let databasePromise;
function database(){
 if(!databasePromise)databasePromise=openDatabase(DB,db=>{
  db.createObjectStore('entries',{keyPath:'id'});
  db.createObjectStore('projects');
  db.createObjectStore('settings');
 }).then(async db=>{
  try{await migrate(db);}
  catch(error){db.close();throw error;}
  db.onversionchange=()=>{db.close();databasePromise=null;};
  return db;
 }).catch(error=>{databasePromise=null;throw error;});
 return databasePromise;
}
async function transaction(db,stores,mode,operation){
 const tx=db.transaction(stores,mode);
 const done=new Promise((resolve,reject)=>{
  tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('Could not save the project file.'));
 });
 const tables=Object.fromEntries(stores.map(name=>[name,tx.objectStore(name)]));
 try{
  const result=await operation(tables);
  await done;return result;
 }catch(error){
  try{tx.abort();}catch(_){}
  await done.catch(()=>{});
  throw error;
 }
}
async function legacyProjects(name,table){
 let missing=false;
 const db=await openDatabase(name,(_db,tx)=>{missing=true;tx.abort();})
  .catch(error=>{if(missing)return null;throw error;});
 if(!db)return [];
 try{
  if(!db.objectStoreNames.contains(table))return [];
  return await request(db.transaction(table).objectStore(table).getAll());
 }finally{db.close();}
}
async function migrate(db){
 const marker='legacy-v1';
 if(await request(db.transaction('settings').objectStore('settings').get(marker)))return;
 const [stitch,vector]=await Promise.all([
  legacyProjects('NOMU_Stitch_Lab_Recent_v1','projects'),
  legacyProjects('FERVOR_Vector_Documents','documents')
 ]);
 const incoming=[
  ...stitch.filter(x=>x.name&&x.project?.app==='NOMU Stitch Lab').map(x=>['stitch',x.name,x.date,x.project]),
  ...vector.filter(x=>x.name&&x.format==='fervor-vector').map(x=>['vector',x.name,Date.parse(x.savedAt),x])
 ];
 const records=await Promise.all(incoming.map(async([type,name,date,project])=>{
  const id=legacyId(type,name),modifiedAt=Number(date)||Date.now();
  return [{id,type,name:title(name),parentId:null,modifiedAt,signature:signature(type,project),
   thumbnail:await makeThumbnail(type,project),testedAt:null,deletedAt:null},project];
 }));
 await transaction(db,['entries','projects','settings'],'readwrite',async ({entries,projects,settings})=>{
  if(await request(settings.get(marker)))return;
  for(const [entry,project] of records){entries.put(entry);projects.put(project,entry.id);}
  settings.put(true,marker);
 });
}
function isActive(entry,map){
 for(let node=entry;node;node=map.get(node.parentId))if(node.deletedAt)return false;
 return true;
}
const types=new Set(['stitch','vector']);
function content(type,project){
 const {fileId,sourceName,fv18Blank,preview,noteVisibility,annotations,simulation,...rest}=project;
 if(type==='vector'){
  const {name,savedAt,...drawing}=rest;
  return drawing;
 }
 const {settings={},jefLayers=[],textLayers=[],...design}=rest;
 const {showJumps,showArt,showHoop,showSequence,brushSize,...stitchSettings}=settings;
 return {...design,settings:stitchSettings,textLayers:textLayers.map(({noteAnchor,...text})=>text),
  jefLayers:jefLayers.map(({name,fvPhysicalScale,fvSatinStats,paths,...layer})=>layer.fvSource?layer:{...layer,paths})};
}
function checksum(value){
 let a=2166136261,b=0x9e3779b9;
 for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b^c,5)+1;}
 return `${a>>>0}:${b>>>0}:${value.length}`;
}
function signature(type,project,events){
 if(type==='stitch'&&events){
  const commands=events.map(e=>[e.type,Math.round(e.x*10),Math.round(e.y*10),e.threadCode,e.threadHex,e.trimFromSource,e.jumpNeedsTrim]);
  return checksum(JSON.stringify([commands,project.palette,project.settings?.hoop,project.selectedMachineHoop,
   project.autoTrimBetweenParts,project.trimMinDistanceMm]));
 }
 return checksum(JSON.stringify(content(type,project)));
}
function drawableImage(src){
 if(typeof src!=='string'||!/^data:image\/(png|webp|jpeg|gif|bmp);base64,/i.test(src))return Promise.resolve(null);
 return new Promise(resolve=>{
  const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=src;
 });
}
function fittedImage(ctx,img,w,h){
 const ratio=Math.min((w-24)/img.naturalWidth,(h-20)/img.naturalHeight);
 const iw=img.naturalWidth*ratio,ih=img.naturalHeight*ratio;
 ctx.drawImage(img,(w-iw)/2,(h-ih)/2,iw,ih);
}
function stitchedPreview(ctx,w,h,events){
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const p of events){
  if(p.type!=='stitch')continue;
  x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);
 }
 if(!Number.isFinite(x0))return false;
 const scale=Math.min((w-34)/Math.max(1,x1-x0),(h-32)/Math.max(1,y1-y0));
 const px=x=>w/2+(x-(x0+x1)/2)*scale,py=y=>h/2+(y-(y0+y1)/2)*scale;
 ctx.lineWidth=1.05;ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='#f4dfc3';
 let pen=null,current='';
 ctx.beginPath();
 for(const p of events){
  if(p.type==='color'){pen=null;continue;}
  const ink=/^#[0-9a-f]{6}$/i.test(p.threadHex)?p.threadHex:'#f4dfc3';
  if(ink!==current){ctx.stroke();ctx.beginPath();current=ink;ctx.strokeStyle=ink;if(pen)ctx.moveTo(px(pen.x),py(pen.y));}
  if(p.type==='stitch'&&pen){ctx.moveTo(px(pen.x),py(pen.y));ctx.lineTo(px(p.x),py(p.y));}
  pen=p;
 }
 ctx.stroke();return true;
}
function drawVector(ctx,w,h,project){
 const width=project.artboard?.width||960,height=project.artboard?.height||640;
 const factor=Math.min((w-16)/width,(h-16)/height);
 ctx.save();ctx.translate((w-width*factor)/2,(h-height*factor)/2);ctx.scale(factor,factor);
 let drew=false;
 for(const shape of project.shapes||[]){
  if(shape.visible===false)continue;
  const geometry=new Path2D();
  for(const contour of shape.contours||[]){
   const pts=contour.nodes||[];if(pts.length<2)continue;
   geometry.moveTo(pts[0].x,pts[0].y);
   for(let i=0;i<(contour.closed?pts.length:pts.length-1);i++){
    const a=pts[i],b=pts[(i+1)%pts.length];
    if(a.out||b.in){const out=a.out||a,into=b.in||b;geometry.bezierCurveTo(out.x,out.y,into.x,into.y,b.x,b.y);}
    else geometry.lineTo(b.x,b.y);
   }
   if(contour.closed)geometry.closePath();
  }
  if(shape.fill&&shape.fill!=='none'){ctx.fillStyle='#3b2f28';ctx.fillStyle=shape.fill;ctx.fill(geometry,shape.fillRule==='nonzero'?'nonzero':'evenodd');drew=true;}
  if(shape.stroke&&shape.stroke!=='none'){ctx.strokeStyle='#3b2f28';ctx.strokeStyle=shape.stroke;ctx.lineWidth=Math.max(1/factor,Number(shape.strokeWidth)||1);ctx.stroke(geometry);drew=true;}
 }
 ctx.restore();return drew;
}
async function makeThumbnail(type,project,events=[]){
 try{
  const canvas=document.createElement('canvas'),w=288,h=176;canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  ctx.fillStyle=type==='vector'?'#f0eae0':'#241d19';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle=type==='vector'?'#d4c8ba':'#453a32';ctx.beginPath();
  for(let x=0;x<w;x+=18){ctx.moveTo(x,0);ctx.lineTo(x,h);}
  for(let y=0;y<h;y+=18){ctx.moveTo(0,y);ctx.lineTo(w,y);}
  ctx.stroke();
  let drawn=type==='vector'?drawVector(ctx,w,h,project):stitchedPreview(ctx,w,h,events);
  if(!drawn&&type==='stitch'&&project.jefLayers?.length){
   const moves=[];
   for(const layer of project.jefLayers){
    if(layer.hidden)continue;
    const a=Number(layer.rotation||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),cx=layer.center?.x||0,cy=layer.center?.y||0;
    for(const path of layer.paths||[])for(let i=0;i<path.length;i++){
     const p=path[i],x=(p.x-cx)*(layer.scaleX||1),y=(p.y-cy)*(layer.scaleY||1);
     moves.push({x:cx+x*c-y*s+(layer.dx||0),y:cy+x*s+y*c+(layer.dy||0),type:i?'stitch':'jump',threadHex:layer.threadHex});
    }
   }
   drawn=stitchedPreview(ctx,w,h,moves);
  }
  if(!drawn){
   const image=await drawableImage(type==='vector'?project.source?.dataUrl:project.maskDataUrl||project.sourceDataUrl);
   if(!image)return null;
   fittedImage(ctx,image,w,h);
  }
  return canvas.toDataURL('image/jpeg',.8);
 }catch(_){return null;}
}
async function list(){
 const db=await database();
 return request(db.transaction('entries').objectStore('entries').getAll());
}
async function exportProjects(){
 await Promise.all(saves.values());
 return transaction(await database(),['entries','projects'],'readonly',async ({entries,projects})=>{
  const records=await request(entries.getAll());
  return Promise.all(records.map(async entry=>({
   entry, project:entry.type==='folder'?null:await request(projects.get(entry.id))
  })));
 });
}
function transferProjects(records){
 if(!Array.isArray(records))throw Error('This backup is missing its project list.');
 const byId=new Map();
 for(const record of records){
  const {entry,project}=record||{};
  if(!entry||typeof entry.id!=='string'||!entry.id||byId.has(entry.id)||
   !(types.has(entry.type)||entry.type==='folder')||typeof entry.name!=='string'||
   (entry.parentId!=null&&typeof entry.parentId!=='string')||
   (entry.type==='stitch'&&project?.app!=='NOMU Stitch Lab')||
   (entry.type==='vector'&&(project?.format!=='fervor-vector'||!Array.isArray(project.shapes)))){
   throw Error('This backup contains an invalid project or folder.');
  }
  byId.set(entry.id,record);
 }
 const ordered=[],added=new Set();
 for(const record of records){
  const ancestors=[],seen=new Set();
  for(let node=record;node&&!added.has(node.entry.id);){
   const {id,parentId}=node.entry;
   if(seen.has(id))throw Error('This backup contains a circular folder path.');
   seen.add(id);ancestors.push(node);
   if(parentId==null)break;
   node=byId.get(parentId);
   if(node?.entry.type!=='folder')throw Error('This backup contains a missing parent folder.');
  }
  for(const node of ancestors.reverse()){added.add(node.entry.id);ordered.push(node);}
 }
 return ordered;
}
async function importProjects(records){
 const ordered=transferProjects(records);
 const count=await transaction(await database(),['entries','projects'],'readwrite',async ({entries,projects})=>{
  const existing=new Map((await request(entries.getAll())).map(entry=>[entry.id,entry]));
  const destinations=new Map();
  let imported=0;
  for(const {entry,project} of ordered){
   const prior=existing.get(entry.id),folder=entry.type==='folder';
   let id=entry.id;
   if(prior){
    if(prior.type===entry.type&&(folder||
     JSON.stringify(await request(projects.get(id)))===JSON.stringify(project))){
     destinations.set(entry.id,id);continue;
    }
    id='import:'+checksum(JSON.stringify([entry.id,entry.type,project]));
   }
   destinations.set(entry.id,id);
   if(existing.has(id))continue;
   const transferred={
    id,type:entry.type,name:title(entry.name),parentId:destinations.get(entry.parentId)??null,
    modifiedAt:Number(entry.modifiedAt)||Date.now(),deletedAt:Number(entry.deletedAt)||null,
    testedAt:entry.type==='stitch'?Number(entry.testedAt)||null:null,
    signature:typeof entry.signature==='string'?entry.signature:null,
    thumbnail:typeof entry.thumbnail==='string'&&/^data:image\/(?:jpeg|png|webp);base64,/i.test(entry.thumbnail)?entry.thumbnail:null,
    hasNotes:entry.type==='stitch'&&Boolean(project.annotations?.length)
   };
   entries.add(transferred);existing.set(id,transferred);
   if(!folder){projects.add(project,id);imported++;}
  }
  return imported;
 });
 saveEvent();return count;
}
async function open(id){
 const db=await database();
 return transaction(db,['entries','projects'],'readonly',async ({entries,projects})=>{
  const map=new Map((await request(entries.getAll())).map(x=>[x.id,x])),item=map.get(id);
  if(!item||!types.has(item.type)||!isActive(item,map))throw Error('This project is in Recently Deleted or no longer available.');
  return {...item,project:await request(projects.get(id))};
 });
}
const saves=new Map();
function save(options){
 const {id,type,project}=options;
 if(!id||!types.has(type))return Promise.reject(Error('Invalid project file.'));
 const snapshot={...options,project:structuredClone(project)};
 const prior=saves.get(id);
 const pending=(prior?prior.catch(()=>{}):Promise.resolve()).then(()=>commitSave(snapshot));
 saves.set(id,pending);
 const release=()=>{if(saves.get(id)===pending)saves.delete(id);};
 pending.then(release,release);
 return pending;
}
async function commitSave({id,type,name,project:payload,events,equivalentTo}){
 const sign=signature(type,payload,events),dataCheck=checksum(JSON.stringify(payload));
 const db=await database();
 const thumb=await makeThumbnail(type,payload,events);
 const saved=await transaction(db,['entries','projects'],'readwrite',async ({entries,projects})=>{
  const map=new Map((await request(entries.getAll())).map(x=>[x.id,x]));
  const existing=map.get(id);
  if(existing&&!isActive(existing,map))return null;
  if(existing?.dataCheck===dataCheck&&existing.signature===sign&&(!thumb||existing.thumbnail))return {item:existing,changed:false};
  const changed=!existing||(existing.signature!==sign&&existing.signature!==equivalentTo);
  const item={id,type,name:existing?.name||title(name),parentId:existing?.parentId??null,
   modifiedAt:changed||!existing?Date.now():existing.modifiedAt,deletedAt:null,
   hasNotes:type==='stitch'&&!!payload.annotations?.length,testedAt:changed?null:existing?.testedAt??null,signature:sign,dataCheck,thumbnail:thumb||existing?.thumbnail||null};
  entries.put(item);projects.put(payload,id);
  return {item,changed:true};
 });
 if(saved?.changed)saveEvent();
 return saved?.item??null;
}
async function edit(action,id,value){
 if(saves.has(id))await saves.get(id).catch(()=>{});
 const db=await database();
 const result=await transaction(db,['entries','projects'],'readwrite',async ({entries,projects})=>{
  const map=new Map((await request(entries.getAll())).map(x=>[x.id,x]));
  const row=map.get(id);
  const folder=folderId=>{
   if(folderId==null)return null;
   const p=map.get(folderId);
   if(p?.type!=='folder'||!isActive(p,map))throw Error('That folder is unavailable.');
   return p;
  };
  if(action==='folder'){
   const parentId=folder(id)?.id??null;
   const item={id:key(),type:'folder',name:title(value,'New Folder'),parentId,modifiedAt:Date.now(),deletedAt:null};
   entries.add(item);return item;
  }
  if(!row)throw Error('This item is unavailable.');
  if(action==='restore'){
   if(!row.deletedAt)throw Error('This item is already in Project Files.');
   const parent=map.get(row.parentId);
   if(parent&&!isActive(parent,map))row.parentId=null;
   row.deletedAt=null;
  }else{
   if(!isActive(row,map))throw Error('Restore this item before editing it.');
   if(action==='rename'){
    row.name=title(value,row.name);
   }else if(action==='move'){
    const parent=folder(value);
    for(let p=parent;p;p=map.get(p.parentId))if(p.id===id)throw Error('A folder cannot be moved inside itself.');
    row.parentId=parent?.id??null;
   }else if(action==='trash')row.deletedAt=Date.now();
   else if(action==='tested'&&row.type==='stitch')row.testedAt=row.testedAt?null:Date.now();
   else if(action==='copy'&&types.has(row.type)){
    const item={...row,id:key(),name:title(row.name.slice(0,94)+' copy'),modifiedAt:Date.now(),testedAt:null,dataCheck:null};
    const data=await request(projects.get(row.id));
    entries.add(item);projects.add(data,item.id);return item;
   }else throw Error('This action is unavailable.');
  }
  entries.put(row);return row;
 });
 if(action==='rename')window.dispatchEvent(new CustomEvent('fervor:project-file-renamed',{detail:{id:result.id,name:result.name}}));
 saveEvent();return result;
}
async function artworkNotes(id){
 const db=await database();
 return request(db.transaction('settings').objectStore('settings').get('art-notes:'+id));
}
async function saveArtworkNote(id,art,note,remove=false){
 const db=await database(),storageKey='art-notes:'+id;
 await transaction(db,['settings'],'readwrite',async ({settings})=>{
  const previous=await request(settings.get(storageKey));
  const notes=previous?.notes||[],index=notes.findIndex(item=>item.id===note.id);
  if(remove){if(index>=0)notes.splice(index,1);}
  else if(index>=0)notes[index]=note;
  else notes.push(note);
  if(notes.length)settings.put({art,notes},storageKey);
  else settings.delete(storageKey);
 });
 saveEvent();
}
async function listNotes(){
 const db=await database();
 return transaction(db,['entries','projects','settings'],'readonly',async ({entries,projects,settings})=>{
  const map=new Map((await request(entries.getAll())).map(x=>[x.id,x]));
  const designs=[...map.values()].filter(x=>x.type==='stitch'&&isActive(x,map)&&x.hasNotes!==false);
  const records=await Promise.all(designs.map(async item=>{
   const project=await request(projects.get(item.id));
   return (project?.annotations||[]).map(note=>({...note,kind:'stitch',source:item.name,sourceId:item.id}));
  }));
  const art=await request(settings.getAll(IDBKeyRange.bound('art-notes:','art-notes;')));
  return [...records.flat(),...art.flatMap(record=>record.notes.map(note=>({...note,kind:'art',source:record.art.title,art:record.art})))];
 });
}
window.FervorProjectFiles={key,list,open,save,edit,isActive,signature,artworkNotes,saveArtworkNote,listNotes,exportProjects,importProjects};
})();

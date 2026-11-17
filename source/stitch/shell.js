/* FERVOR 5 — Stitch Lab shell.
   Everything around the stitch engine: design tabs, menus, panels, canvas sizing, flyouts,
   command finder, drag-and-drop, rulers and keyboard shortcuts. The engine (stitch/engine.js)
   owns the design, stitches and export; this file only calls its public APIs:
   window.FervorWorkspace, window.FervorZoom, window.FervorTools and window.FervorCanvasMetrics. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const app=$('stitch-lab'),body=document.body,viewport=$('sl-viewport'),canvas=$('design-canvas');
if(!app||!viewport||!canvas||!window.FervorWorkspace)return;
const W=window.FervorWorkspace,typing=e=>e.target?.matches?.('input,textarea,select,[contenteditable]');
const stitchActive=()=>!window.FervorStitchKeys||window.FervorStitchKeys();
const click=id=>$(id)?.click();

/* ---------- Design tabs ---------- */
const tabBar=$('fv22-project-tabs'),addTab=$('fv22-new-project'),session=window.FervorProjectSession,projectFiles=window.FervorProjectFiles;
let tabs=[],activeId=null,nextId=1,switching=false,restored=false;
const activeTab=()=>tabs.find(t=>t.id===activeId);
const fileId=t=>t?.storedId||t?.data?.fileId;
const snapshot=()=>{try{return W.snapshot()}catch(_){return null}};
function rememberTabs(){
 if(restored)session.remember('stitch',tabs.map(fileId),fileId(activeTab()));
}
function saveActive(){
 const t=activeTab();if(!t||switching)return;
 W.flushSave();
 t.data=snapshot();t.storedId=t.data?.fileId||null;t.title=W.currentName()||t.title;
 rememberTabs();
}
function makeTab(title,data=null){
 const t={id:nextId++,title:String(title||'Untitled'),data,storedId:data?.fileId||null};
 tabs.push(t);activeId=t.id;renderTabs();return t;
}
function renderTabs(){
 tabBar.querySelectorAll('.sl-doc').forEach(el=>el.remove());
 for(const t of tabs){
  const b=document.createElement('div');b.className='sl-doc'+(t.id===activeId?' active':'');
  const name=document.createElement('button');name.type='button';name.className='sl-doc-name';name.textContent=t.title;
  name.title=t.title+' · Double-click to rename · Option + ←/→ to reorder';
  if(t.id===activeId)name.setAttribute('aria-current','true');
  name.addEventListener('dblclick',async e=>{e.preventDefault();if(activeId!==t.id)await switchTo(t.id);if(activeId===t.id)renameActive();});
  name.addEventListener('keydown',e=>{if(e.key==='F2'){e.preventDefault();switchTo(t.id).then(()=>{if(activeId===t.id)renameActive();});}});
  const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Close '+t.title);
  close.addEventListener('click',e=>{e.stopPropagation();closeTab(t.id)});
  b.addEventListener('click',()=>switchTo(t.id));
  session.bindReorder(b,tabs,t,`[data-tab-id="${t.id}"] .sl-doc-name`,()=>{renderTabs();rememberTabs();tabBar.querySelector(`[data-tab-id="${t.id}"] .sl-doc-name`)?.focus({preventScroll:true});});
  b.append(name,close);tabBar.insertBefore(b,addTab);
 }
}
async function restoreTab(tab){
 if(tab.data)await W.restore(tab.data);
 else if(fileId(tab))await W.restoreSaved(await projectFiles.open(fileId(tab)));
 else await W.newBlank(tab.title);
}
async function switchTo(id){
 if(switching||id===activeId)return;
 const next=tabs.find(t=>t.id===id);if(!next)return;
 saveActive();switching=true;
 try{
  await restoreTab(next);activeId=id;session.touch(fileId(next),next.data?.fv18Blank);
 }catch(error){W.notify(error.message,true);}
 finally{switching=false;renderTabs();rememberTabs();}
}
async function closeTab(id){
 if(switching)return;
 const index=tabs.findIndex(t=>t.id===id);if(index<0)return;
 if(id===activeId){
  const next=tabs[index+1]||tabs[index-1];
  if(next){await switchTo(next.id);if(activeId!==next.id)return;}
  else {saveActive();tabs.splice(index,1);activeId=null;await newDocument();return;}
 }
 tabs.splice(index,1);renderTabs();rememberTabs();
}
async function newDocument(){
 if(switching)return;
 await ensureTabs();if(switching)return;saveActive();
 const old=activeTab();
 if(old&&!fileId(old)&&old.data?.fv18Blank){tabs.splice(tabs.indexOf(old),1);}
 const name='Untitled '+nextId;makeTab(name);
 switching=true;
 try{await W.newBlank(name);}finally{switching=false;}
 renderTabs();rememberTabs();body.classList.remove('fervor-home-open');$('fervor-home').hidden=true;
}
let initialization;
function ensureTabs(){return initialization??=(async()=>{
 await W.initialized;
 try{
  const saved=await session.available('stitch');
  if(saved.items.length){
   tabs=saved.items.map(item=>({id:nextId++,title:item.name,storedId:item.id}));
   const tab=tabs.find(t=>fileId(t)===saved.active)||tabs[0];
   switching=true;
   try{await restoreTab(tab);activeId=tab.id;}finally{switching=false;}
  }
 }catch(error){W.notify(error.message,true);}
 if(!activeTab())makeTab(W.currentName()||'Untitled',snapshot());
 restored=true;window.FervorDocs.ready=true;renderTabs();rememberTabs();
})();}
function renameActive(){
 session.renameProject(W.currentName(),async name=>{
  if(W.currentFileId())await projectFiles.edit('rename',W.currentFileId(),name);
  else W.renameCurrent(name);
  window.FervorDocs.afterOpen();
 });
}
async function duplicateActive(){
 await ensureTabs();
 try{
  const saved=await W.saveCurrent();
  if(!saved)throw Error('Restore this design from Recently Deleted before duplicating it.');
  const item=await projectFiles.edit('copy',saved.id);
  await W.openRecent(await projectFiles.open(item.id));W.notify('Opened '+item.name+'.');
 }catch(error){W.notify(error.message,true);}
}
window.FervorDocs={ready:false,ensureTabs,
 beforeOpen(name){if(!this.ready||switching||body.classList.contains('fv18-empty'))return;saveActive();makeTab(name);},
 afterOpen(){
  if(switching)return;
  const t=activeTab();if(!t)return;
  t.title=W.currentName()||t.title;t.storedId=W.currentFileId();t.data=null;
  session.touch(t.storedId,body.classList.contains('fv18-empty'));renderTabs();rememberTabs();
 },
 saved(id){if(W.currentFileId()===id){const t=activeTab();if(t){t.storedId=id;rememberTabs();}}},
 newDocument,saveActive,renderTabs,
 openSaved(name){saveActive();const t=activeTab();if(t&&!fileId(t)&&t.data?.fv18Blank){t.title=name;return;}makeTab(name);},
 async activateSaved(id){
  await ensureTabs();
  if(!id)return false;
  if(W.currentFileId()===id){session.touch(id,body.classList.contains('fv18-empty'));return true;}
  const tab=tabs.find(t=>fileId(t)===id);if(!tab)return false;
  await switchTo(tab.id);return activeId===tab.id;
 }};
window.addEventListener('fervor:project-file-renamed',e=>{
 for(const tab of tabs){
  if(fileId(tab)!==e.detail.id)continue;
  if(tab.data)tab.data.sourceName=e.detail.name;
  tab.title=e.detail.name;
 }
 renderTabs();
});
addTab.addEventListener('click',newDocument);
$('sl-rename-design').addEventListener('click',renameActive);
$('sl-copy-design').addEventListener('click',duplicateActive);
ensureTabs();
let lastName=W.currentName();
document.addEventListener('change',e=>{if(e.target?.id==='file-input')setTimeout(()=>{const n=W.currentName();if(n!==lastName){lastName=n;window.FervorDocs.afterOpen();}},600);});

/* ---------- Menus and popovers ---------- */
function popover(button,panel){
 const set=open=>{panel.hidden=!open;button.setAttribute('aria-expanded',String(open));};
 button.addEventListener('click',e=>{e.stopPropagation();set(panel.hidden);});
 document.addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!button.contains(e.target))set(false);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){set(false);button.focus();}});
 return set;}
const setMenu=popover($('sl-more'),$('sl-more-menu'));
const closeBrandFiles=popover($('fv-brand-chevron'),$('fv-brand-files-menu'));
$('fv-brand-project-files').addEventListener('click',()=>{
 closeBrandFiles(false);window.FervorFileBrowser.show($('fv-brand-chevron'));
});
$('sl-more-menu').addEventListener('click',e=>{const item=e.target.closest('button');if(!item)return;setMenu(false);if(item.dataset.proxy)click(item.dataset.proxy);});
popover($('sl-appearance'),$('finish-settings'));
// File actions that used to be duplicated across the page all route to the engine's own buttons.
$('export-jef-bottom').addEventListener('click',()=>click('export-jef'));
$('sl-save').addEventListener('click',()=>{click('recent-save');window.FervorDocs.saveActive();renderTabs();});
$('sl-commands').addEventListener('click',()=>openCommands());
$('sl-add-file').addEventListener('click',()=>click('fv22-add-image-input'));
$('fv22-add-image-input').addEventListener('change',async e=>{const files=[...(e.target.files||[])];e.target.value='';for(const f of files)await W.addImage(f);});
$('sl-layers').addEventListener('click',()=>{W.goToStage('create');click('tab-layers');setInspector(true);});
// Blank canvas: the three ways to start.
$('sl-empty-open').addEventListener('click',()=>W.openArtwork());
$('sl-empty-text').addEventListener('click',()=>{setInspector(true);$('jump-to-text').click();});
$('sl-empty-sample').addEventListener('click',()=>W.loadSample());
$('hoop-fit-status').addEventListener('click',()=>{W.goToStage('finish');click('tab-tools');setInspector(true);});
$('notice-close').addEventListener('click',()=>{$('notice').hidden=true;});
// "?" buttons reveal the longer explanation for a section in place.
app.addEventListener('click',e=>{const b=e.target.closest('.sl-help-toggle');if(!b)return;const box=$(b.getAttribute('aria-controls'));if(!box)return;box.hidden=!box.hidden;b.setAttribute('aria-expanded',String(!box.hidden));});

/* ---------- Canvas backing store follows the visible viewport ----------
   The engine works in millimetres; resizing the bitmap only changes resolution. */
let scheduled=false,prevW=0,prevH=0;
function syncCanvas(){scheduled=false;if(body.classList.contains('fervor-home-open'))return;const r=viewport.getBoundingClientRect();if(!r.width||!r.height)return;
 const dpr=Math.min(devicePixelRatio||1,1.5),w=Math.max(300,Math.min(2200,Math.round(r.width*dpr))),h=Math.max(300,Math.min(1400,Math.round(r.height*dpr)));
 if(w===prevW&&h===prevH)return;const oldW=canvas.width||1200,oldH=canvas.height||650,pan=window.FervorZoom?.getPan?.()||{x:0,y:0};
 canvas.width=w;canvas.height=h;prevW=w;prevH=h;window.FervorZoom?.panBy?.(pan.x*(w/oldW-1),pan.y*(h/oldH-1));}
function scheduleCanvas(){if(!scheduled){scheduled=true;requestAnimationFrame(syncCanvas);}}
new ResizeObserver(scheduleCanvas).observe(viewport);
new MutationObserver(scheduleCanvas).observe(body,{attributes:true,attributeFilter:['class']});
requestAnimationFrame(scheduleCanvas);
$('sl-fit-hoop').addEventListener('click',()=>window.FervorZoom?.fitHoop?.());

/* ---------- Inspector, focus mode and small screens ---------- */
const inspectorToggle=$('sl-inspector-toggle'),narrow=matchMedia('(max-width:900px)');
window.FervorStitchInspector=setInspector;
function setInspector(open){app.classList.toggle('sl-inspector-closed',!open);inspectorToggle.setAttribute('aria-expanded',String(open));inspectorToggle.title=open?'Hide settings':'Show settings';scheduleCanvas();}
inspectorToggle.addEventListener('click',()=>setInspector(app.classList.contains('sl-inspector-closed')));
if(narrow.matches)setInspector(false);
narrow.addEventListener('change',()=>setInspector(!narrow.matches));
function setFocus(on){body.classList.toggle('fv13-focus',on);const b=$('sl-focus');b.setAttribute('aria-pressed',String(on));b.title=on?'Exit focus · Esc':'Focus canvas · Shift F';scheduleCanvas();}
$('sl-focus').addEventListener('click',()=>setFocus(!body.classList.contains('fv13-focus')));
window.FervorFocus={exit:()=>setFocus(false),isActive:()=>body.classList.contains('fv13-focus')};

/* ---------- Shapes and align flyouts ---------- */
const api=window.FervorTools,fly=document.createElement('div');fly.className='sl-flyout';fly.hidden=true;fly.setAttribute('role','dialog');app.append(fly);
let flyFrom=null;
const icon=p=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>';
function closeFly(){fly.hidden=true;flyFrom=null;}
function openFly(from,title,html,bind){if(flyFrom===from&&!fly.hidden){closeFly();return;}flyFrom=from;fly.setAttribute('aria-label',title);
 fly.innerHTML=`<div class="sl-flyout-head"><strong>${title}</strong><button type="button" class="sl-x" aria-label="Close">×</button></div>${html}`;fly.hidden=false;
 const r=from.getBoundingClientRect();fly.style.top=Math.max(8,Math.min(innerHeight-fly.offsetHeight-8,r.top))+'px';fly.style.left=Math.min(innerWidth-fly.offsetWidth-8,r.right+10)+'px';
 fly.querySelector('.sl-x').addEventListener('click',closeFly);bind();}
document.addEventListener('pointerdown',e=>{if(!fly.hidden&&!fly.contains(e.target)&&!flyFrom?.contains(e.target))closeFly();});
const SHAPES=[['rectangle','<rect x="3" y="7" width="18" height="11"/>'],['circle','<circle cx="12" cy="12" r="8"/>'],['triangle','<path d="M12 3 22 21H2Z"/>'],['diamond','<path d="M12 2 22 12 12 22 2 12Z"/>'],['hexagon','<path d="M7 3h10l5 9-5 9H7l-5-9Z"/>'],['line','<path d="M4 20 20 4"/>'],['star','<path d="m12 2 3 7 7 1-5.4 5 1.4 7-6-4-6 4 1.4-7L2 10l7-1Z"/>'],['heart','<path d="M20.5 8.5c0 5-8.5 12-8.5 12S3.5 13.5 3.5 8.5a5 5 0 0 1 8.5-3 5 5 0 0 1 8.5 3Z"/>'],['arrow','<path d="M4 12h16m-7-7 7 7-7 7"/>'],['cross','<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>'],['spark','<path d="M12 2 15 9 22 12 15 15 12 22 9 15 2 12 9 9Z"/>'],['lightning','<path d="M14 2 5 14h6l-1 8 9-13h-7Z"/>']];
$('sl-shapes').addEventListener('click',e=>openFly(e.currentTarget,'Insert shape',
 `<div class="sl-shape-grid">${SHAPES.map(([n,p])=>`<button type="button" data-shape="${n}" title="${n}">${icon(p)}<span>${n}</span></button>`).join('')}</div>
 <div class="sl-row"><label class="sl-field-inline">W mm <input id="sl-shape-w" type="number" min="3" max="150" value="20"></label><label class="sl-field-inline">H mm <input id="sl-shape-h" type="number" min="3" max="150" value="20"></label></div>
 <label class="sl-check"><input id="sl-shape-outline" type="checkbox"> Outline only</label>
 <div class="sl-row"><button type="button" class="sl-btn" data-nomu-shape="fv26-create-nomu">NOMU figure</button><button type="button" class="sl-btn" data-nomu-shape="fv26-create-nomu-oval">NOMU with oval</button></div>`,
 ()=>{
  fly.querySelectorAll('[data-shape]').forEach(b=>b.addEventListener('click',()=>{
   api.createShape(b.dataset.shape,+$('sl-shape-w').value||20,+$('sl-shape-h').value||20,$('sl-shape-outline').checked);closeFly();
  }));
  fly.querySelectorAll('[data-nomu-shape]').forEach(b=>b.addEventListener('click',()=>{
   $(b.dataset.nomuShape).click();closeFly();
  }));
 }));
const ALIGN=[['hoop-both','Center in hoop'],['hoop-x','Hoop center X'],['hoop-y','Hoop center Y'],['left','Left'],['hcenter','Center X'],['right','Right'],['top','Top'],['vcenter','Center Y'],['bottom','Bottom'],['distribute-x','Distribute X'],['distribute-y','Distribute Y']];
$('sl-align').addEventListener('click',e=>openFly(e.currentTarget,'Align',
 `<p class="sl-hint">Select two or more parts to align them to each other; the first stays put.</p><div class="sl-align-grid">${ALIGN.map(([k,l])=>`<button type="button" class="sl-btn" data-align="${k}">${l}</button>`).join('')}</div>
 <label class="sl-check"><input id="sl-snap" type="checkbox" ${api.getSnap()?'checked':''}> Snap while moving</label>`,
 ()=>{fly.querySelectorAll('[data-align]').forEach(b=>b.addEventListener('click',()=>{if(api.align(b.dataset.align))closeFly();}));$('sl-snap').addEventListener('change',e=>api.setSnap(e.target.checked));}));
addEventListener('resize',closeFly,{passive:true});

/* ---------- Command finder (⌘K) ---------- */
const dialog=document.createElement('dialog');dialog.className='sl-commands';dialog.setAttribute('aria-label','Find a command');
dialog.innerHTML='<input type="search" id="sl-command-input" autocomplete="off" placeholder="Search tools, views and actions…" aria-label="Search commands"><div id="sl-command-list" role="listbox"></div>';
document.body.append(dialog);
const COMMANDS=[
 ['Fit hoop','H',()=>window.FervorZoom?.fitHoop?.()],['Fit design','0',()=>window.FervorZoom?.fitDesign?.()],
 ['Select tool','V',()=>app.querySelector('[data-tool="select"]').click()],['Hand tool','Space',()=>app.querySelector('[data-tool="pan"]').click()],
 ['Stitch start','S',()=>app.querySelector('[data-tool="start"]').click()],['Box select','M',()=>app.querySelector('[data-tool="marquee"]').click()],['Draw stitch path','L',()=>app.querySelector('[data-tool="line"]').click()],
 ['Place text','T',()=>app.querySelector('[data-tool="text"]').click()],['Insert shape','',()=>$('sl-shapes').click()],['Align parts','',()=>$('sl-align').click()],
 ['View: thread on grid','',()=>app.querySelector('[data-view="thread"]').click()],
 ['View: finished embroidery','',()=>app.querySelector('[data-view="realistic"]').click()],['View: stitch paths','',()=>app.querySelector('[data-view="stitches"]').click()],['View: source artwork','',()=>app.querySelector('[data-view="artwork"]').click()],
 ['Open artwork or stitch file','',()=>click('open-file')],['Add file to this design','',()=>click('fv22-add-image-input')],['New design','',()=>newDocument()],
 ['Parts','',()=>$('sl-layers').click()],['Fill & density','',()=>{W.goToStage('digitize');click('tab-stitches');setInspector(true);}],
 ['Stitch order','',()=>{W.goToStage('arrange');click('tab-order');setInspector(true);}],['Stitch-out player','',()=>{W.goToStage('arrange');click('tab-sequence');setInspector(true);}],
 ['Machine readiness','',()=>$('hoop-fit-status').click()],['Save','⌘S',()=>$('sl-save').click()],['Export JEF','',()=>click('export-jef')],
 ['Save project .json','',()=>click('export-project')],['Export stitch SVG','',()=>click('export-svg')],['Save preview PNG','',()=>click('download-preview')],
 ['Focus canvas','⇧F',()=>setFocus(true)],['Show or hide settings','',()=>inspectorToggle.click()],['Guide','',()=>click('guide')],['Home','',()=>click('fv-header-home')]];
const input=dialog.querySelector('input'),list=dialog.querySelector('#sl-command-list');let shown=[],active=0;
function renderCommands(){const q=input.value.trim().toLowerCase();shown=COMMANDS.filter(c=>!q||c[0].toLowerCase().includes(q));active=0;list.replaceChildren();
 if(!shown.length){const p=document.createElement('p');p.className='sl-hint';p.textContent='No matching commands';list.append(p);return;}
 shown.forEach((c,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','option');b.className=i===0?'active':'';b.innerHTML='<span></span><kbd></kbd>';b.firstChild.textContent=c[0];b.lastChild.textContent=c[1];b.addEventListener('click',()=>run(c));list.append(b);});}
function run(c){dialog.close();c[2]();}
function openCommands(){if(body.classList.contains('fervor-home-open'))return;input.value='';renderCommands();dialog.showModal();input.focus();}
input.addEventListener('input',renderCommands);
input.addEventListener('keydown',e=>{if(!shown.length)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();active=(active+(e.key==='ArrowDown'?1:-1)+shown.length)%shown.length;[...list.children].forEach((b,i)=>b.classList.toggle('active',i===active));list.children[active].scrollIntoView({block:'nearest'});}if(e.key==='Enter'){e.preventDefault();run(shown[active]);}});
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});

/* ---------- Drag and drop ---------- */
let depth=0;const files=ev=>ev.dataTransfer?.types?.includes('Files');
viewport.addEventListener('dragenter',ev=>{if(!files(ev)||ev.target.closest('.fv-note-card'))return;ev.preventDefault();depth++;body.classList.add('fv18-dragging');});
viewport.addEventListener('dragover',ev=>{if(!files(ev))return;ev.preventDefault();ev.dataTransfer.dropEffect='copy';});
viewport.addEventListener('dragleave',ev=>{if(!files(ev)||ev.target.closest('.fv-note-card'))return;depth=Math.max(0,depth-1);if(!depth)body.classList.remove('fv18-dragging');});
viewport.addEventListener('drop',async ev=>{ev.preventDefault();depth=0;body.classList.remove('fv18-dragging');
 const list=[...(ev.dataTransfer?.files||[])].filter(f=>/\.(png|jpe?g|webp|bmp|gif|jef|pes|pec)$/i.test(f.name));
 if(!list.length){W.notify?.('Drop a PNG, JPG, WEBP, JEF or PES file.',true);return;}
 for(const f of list){try{if(body.classList.contains('fv18-empty')){await W.importArtwork(f);window.FervorDocs.afterOpen();}else await W.addImage(f);}catch(e){W.notify?.('Could not open '+f.name+': '+e.message,true);}}});

/* ---------- Rulers (display only; never affect export) ---------- */
const show=$('fv18-show-rulers'),units=$('fv18-ruler-units');
const ruler=cls=>{const c=document.createElement('canvas');c.className='sl-ruler '+cls;c.setAttribute('aria-hidden','true');viewport.append(c);return c;};
const top=ruler('sl-ruler-top'),left=ruler('sl-ruler-left');let frame=0;
function prep(c,w,h){const k=Math.min(devicePixelRatio||1,2);c.width=Math.max(1,Math.round(w*k));c.height=Math.max(1,Math.round(h*k));c.style.width=w+'px';c.style.height=h+'px';const x=c.getContext('2d');x.setTransform(k,0,0,k,0,0);x.clearRect(0,0,w,h);return x;}
function drawRulers(){frame=0;const m=window.FervorCanvasMetrics;if(!show.checked||!m||!(m.scale>0))return;
 const vr=viewport.getBoundingClientRect(),cr=canvas.getBoundingClientRect(),sx=cr.width/m.canvasWidth,sy=cr.height/m.canvasHeight,size=22,dark=body.classList.contains('fv-theme-dark');
 const inch=units.value==='in',unitMm=inch?25.4:10,steps=inch?[.125,.25,.5,1,2,5]:[.1,.2,.5,1,2,5,10],ppm=m.scale*sx,major=(steps.find(v=>v*unitMm*ppm>=56)||steps.at(-1))*unitMm;
 for(const horiz of [true,false]){const len=horiz?vr.width:vr.height,ctx=prep(horiz?top:left,horiz?len:size,horiz?size:len),org=horiz?cr.left-vr.left+m.cx*sx:cr.top-vr.top+m.cy*sy,p=horiz?ppm:m.scale*sy;
  ctx.fillStyle=dark?'#050605':'#ffffff';ctx.fillRect(0,0,horiz?len:size,horiz?size:len);ctx.strokeStyle=dark?'#555':'#bbb';ctx.fillStyle=dark?'#bbb':'#555';ctx.font='10px "Courier New",monospace';ctx.lineWidth=1;
  const minor=major/5;for(let n=Math.floor(-org/p/minor)-1,c=0;n*minor*p+org<=len&&c<600;n++,c++){const pos=Math.round(org+n*minor*p)+.5,big=n%5===0;if(pos<0)continue;ctx.beginPath();
   if(horiz){ctx.moveTo(pos,size);ctx.lineTo(pos,size-(big?9:4));}else{ctx.moveTo(size,pos);ctx.lineTo(size-(big?9:4),pos);}ctx.stroke();
   if(big){const label=String(+((n*minor)/unitMm).toFixed(3));if(horiz)ctx.fillText(label,pos+2,10);else{ctx.save();ctx.translate(10,pos-2);ctx.rotate(-Math.PI/2);ctx.fillText(label,0,0);ctx.restore();}}}}}
function scheduleRulers(){if(show.checked&&!frame)frame=requestAnimationFrame(drawRulers);}
function updateRulers(){app.classList.toggle('sl-rulers',show.checked);try{localStorage.setItem('fv18-rulers',JSON.stringify({enabled:show.checked,units:units.value}))}catch(_){}scheduleRulers();}
try{const saved=JSON.parse(localStorage.getItem('fv18-rulers')||'{}');show.checked=!!saved.enabled;units.value=saved.units==='in'?'in':'cm';}catch(_){}
show.addEventListener('change',updateRulers);units.addEventListener('change',updateRulers);addEventListener('fervor:canvas-painted',scheduleRulers);updateRulers();

/* ---------- Keyboard ---------- */
const TOOL_KEYS={q:'note',s:'start',n:'nodes',v:'select',m:'marquee',b:'brush',e:'erase',l:'line',t:'text',p:'pan'};
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&e.shiftKey){document.querySelectorAll('dialog[open]').forEach(d=>d.close());setFocus(false);closeFly();return;}
 if(!stitchActive())return;
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();dialog.open?dialog.close():openCommands();return;}
 if(typing(e)||e.metaKey||e.ctrlKey||e.altKey)return;
 if(e.shiftKey&&e.key.toLowerCase()==='f'){e.preventDefault();setFocus(!body.classList.contains('fv13-focus'));return;}
 if(e.key==='Escape'&&body.classList.contains('fv13-focus')){setFocus(false);return;}
 const tool=TOOL_KEYS[e.key.toLowerCase()];if(tool&&!e.shiftKey){e.preventDefault();app.querySelector(`[data-tool="${tool}"]`)?.click();}
});
})();

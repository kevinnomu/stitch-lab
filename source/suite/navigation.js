/* FERVOR 5 · one workspace switcher shared by Bay, Stitch Lab and Vector. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const names=[['vector','Vector'],['stitch','Stitch Lab']];
const groups=[
 {root:document.querySelector('#fervor-bay .bay-header-actions'),name:'bay',hide:[]},
 {root:document.querySelector('#stitch-lab .sl-suite'),name:'stitch',hide:[]},
 {root:document.querySelector('#fervor-vector .fvv-header-actions'),brand:'#fervor-vector .fvv-brand',name:'vector',hide:['fvv-to-stitch']},
 {root:document.querySelector('#fervor-compose .fvc-header-actions'),brand:'#fervor-compose .fvc-brand',name:'compose',hide:['fvc-to-vector','fvc-to-stitch','fvc-home']},
 {root:document.querySelector('#fervor-radar .fvr-head-actions'),brand:'#fervor-radar .fvr-brand',name:'radar',hide:['fvr-compose','fvr-vector','fvr-stitch','fvr-home']}
];
const closeOthers=name=>{
 if(name!=='bay'&&window.FervorBay?.active)window.FervorBay.close({home:false});
 if(name!=='compose'&&window.FervorCompose?.active)window.FervorCompose.close();
 if(name!=='radar'&&window.FervorRadar?.active)window.FervorRadar.close();
 if(name!=='vector'&&window.FervorVector?.active)window.FervorVector.close();
};
async function open(name){
 closeOthers(name);
 if(name==='stitch'){
   document.body.classList.remove('fervor-home-open','fv-compose-active','fv-radar-active','fv-vector-active');
   const home=$('fervor-home');if(home)home.hidden=true;
   await window.FervorDocs?.ensureTabs();
 }else if(name==='bay')window.FervorBay?.open?.();
 else if(name==='vector')window.FervorVector?.open?.();
 else if(name==='compose')window.FervorCompose?.open?.();
 else if(name==='radar')window.FervorRadar?.open?.();
 refresh();
}
function refresh(){const mode=document.body.classList.contains('fv-bay-active')?'bay':document.body.classList.contains('fv-radar-active')?'radar':document.body.classList.contains('fv-compose-active')?'compose':document.body.classList.contains('fv-vector-active')?'vector':'stitch';
 document.querySelectorAll('[data-fv30-switch]').forEach(b=>{const current=b.dataset.fv30Switch===mode;b.setAttribute('aria-current',current?'page':'false');});
 document.querySelectorAll('.fv30-suite-select').forEach(s=>s.value=mode);
}
for(const g of groups){if(!g.root||!['bay','stitch','vector'].includes(g.name))continue;
 // Each workspace's own one-off "switch to …" buttons give way to this shared switcher.
 for(const id of g.hide){const el=$(id);if(el)el.classList.add('fv30-replaced');}
 const nav=document.createElement('nav');nav.className='fv30-suite-nav';nav.setAttribute('aria-label','FERVOR workspaces');
 for(const [name,label] of names){const b=document.createElement('button');b.type='button';b.dataset.fv30Switch=name;b.textContent=label;b.insertAdjacentHTML('afterbegin',window.FervorIcon(name,14));b.title='Open '+label;b.addEventListener('click',()=>open(name));nav.append(b)}
 const sel=document.createElement('select');sel.className='fv30-suite-select';sel.setAttribute('aria-label','Switch workspace');for(const [name,label] of names){const o=document.createElement('option');o.value=name;o.textContent=label;sel.append(o)}sel.addEventListener('change',()=>open(sel.value));
 // Every workspace centres the switcher in its header, as Stitch Lab does; the logo returns home.
 const brand=g.brand&&document.querySelector(g.brand);
 if(brand){const slot=document.createElement('div');slot.className='fx-suite';slot.append(nav,sel);brand.after(slot);}
 else{g.root.prepend(sel);g.root.prepend(nav);}
}
const labSuite=document.querySelector('#stitch-lab .sl-suite');document.querySelector('#stitch-lab .sl-top-right')?.prepend(labSuite);
const vectorSuite=document.querySelector('#fervor-vector .fx-suite');if(vectorSuite)document.querySelector('#fervor-vector .fvv-header-actions')?.prepend(vectorSuite);
const vectorTabs=document.querySelector('#fervor-vector .fvv-project-bar');if(vectorTabs)document.querySelector('#fervor-vector .fvv-brand')?.append(vectorTabs);
new MutationObserver(refresh).observe(document.body,{attributes:true,attributeFilter:['class']});
window.FervorSuite={open,refresh};refresh();
})();

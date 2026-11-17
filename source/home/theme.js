
(()=>{
 const header=document.querySelector('#fervor-home .fv-home-header');
 if(header && !document.getElementById('fv-theme-toggle')){
  const btn=document.createElement('button');btn.type='button';btn.id='fv-theme-toggle';btn.className='fv-theme-toggle';btn.setAttribute('aria-live','polite');header.appendChild(btn);
  const KEY='fervor_theme_mode_v1';const mq=window.matchMedia('(prefers-color-scheme: dark)');
  const bar=document.querySelector('body > .topbar .top-actions');
  let editorBtn=document.getElementById('fv-editor-theme-toggle');
  if(bar&&!editorBtn){editorBtn=document.createElement('button');editorBtn.id='fv-editor-theme-toggle';editorBtn.className='fv-editor-theme-toggle';editorBtn.type='button';bar.insertBefore(editorBtn,bar.firstChild);}
  const MIGRATION='fervor_5_8_start_in_art_v1';
  try{if(!localStorage.getItem(MIGRATION)){localStorage.setItem(KEY,'art');localStorage.setItem(MIGRATION,'1');}}catch(_){}
  function pref(){try{return sessionTheme||localStorage.getItem(KEY)||'art'}catch(_){return sessionTheme||'art'}}
  function apply(){
    const p=pref(),dark=p==='dark'||p==='art'||(p==='auto'&&mq.matches);
    document.body.classList.toggle('fv-theme-art',p==='art');
    document.body.classList.toggle('fv-theme-dark',dark);
    for(const b of [btn,editorBtn])if(b){b.textContent='THEME · '+p.toUpperCase();b.setAttribute('aria-label','Theme '+p+'. Change appearance');b.title='Auto / Dark / Light / Art';}
    window.dispatchEvent(new Event('fervor:theme-change'));
  }
  let sessionTheme;
  function set(theme){sessionTheme=theme;try{localStorage.setItem(KEY,theme);}catch(_){}apply();}
  function rotate(){const order=['auto','dark','light','art'],p=pref();set(order[(order.indexOf(p)+1)%order.length]);}
  window.FervorTheme={set};
  btn.addEventListener('click',rotate);
  editorBtn?.addEventListener('click',rotate);
  mq.addEventListener?.('change',()=>{if(pref()==='auto')apply()});apply();
 }
})();

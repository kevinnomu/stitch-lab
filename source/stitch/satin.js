/* Closed filled objects become ordered satin columns. Coordinates are in millimeters. */
(() => {
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
 const phases=[-.48,-.15,.39,.12,.5,-.29];

 function frame(rings,angle){
  const c=Math.cos(angle*Math.PI/180),s=Math.sin(angle*Math.PI/180);
  const back=p=>({x:p.x*c-p.y*s,y:p.x*s+p.y*c});
  const edges=[];
  let bottom=Infinity,top=-Infinity;
  for(const ring of rings){
   const r=ring.map(p=>({x:p.x*c+p.y*s,y:-p.x*s+p.y*c}));
   for(let i=1;i<r.length;i++){
    const a=r[i-1],b=r[i];
    bottom=Math.min(bottom,a.y,b.y);top=Math.max(top,a.y,b.y);
    if(Math.abs(a.y-b.y)>1e-8)edges.push(a.y<b.y?[a,b]:[b,a]);
   }
  }
  const cache=new Map();
  function spans(y){
   if(cache.has(y))return cache.get(y);
   const xs=[];
   for(const [a,b] of edges)if(a.y<=y&&b.y>y)xs.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y));
   xs.sort((a,b)=>a-b);
   const list=[];
   for(let i=0;i+1<xs.length;i+=2)if(xs[i+1]-xs[i]>.015)list.push({lo:xs[i],hi:xs[i+1],y});
   cache.set(y,list);return list;
  }
  function inside(a,b,tolerance=.015){
   for(const t of [.16,.33,.5,.67,.84]){
    const p=lerp(a,b,t);
    if(!spans(p.y).some(r=>p.x>=r.lo-tolerance&&p.x<=r.hi+tolerance))return false;
   }
   return true;
  }
  return {back,bottom,top,spans,inside};
 }
 function rowSamples(space,step){
  const h=space.top-space.bottom;
  if(!Number.isFinite(h)||h<=1e-8)return [];
  const count=clamp(Math.ceil(h/step),1,2400);
  return Array.from({length:count},(_,i)=>space.spans(space.bottom+(i+.5)*h/count));
 }
 function chooseAngle(rings,prefer,target,mode){
  if(mode==='angle')return prefer;
  let best=Infinity,answer=prefer;
  for(const angle of new Set([prefer,0,15,30,45,60,75,90,105,120,135,150,165])){
   const samples=rowSamples(frame(rings,angle),.75);
   let area=0,lengthPenalty=0,splitPenalty=0;
   for(const spans of samples)for(const r of spans){
    const width=r.hi-r.lo;
    area+=width;
    lengthPenalty+=width*Math.sqrt(width);
    splitPenalty+=width*Math.max(0,Math.ceil(width/target)-1);
   }
   if(!area)continue;
   const score=(lengthPenalty+splitPenalty*.9)/area;
   if(score<best){best=score;answer=angle;}
  }
  return answer;
 }
 // An overlap of one interval with several predecessors or successors is a new section.
 // This preserves holes, notches and branches instead of crossing them with a running stitch.
 function sections(rows){
  let active=[];
  const tracks=[];
  for(const line of rows){
   const matches=line.map(()=>[]),counts=new Uint16Array(active.length);
   let start=0;
   line.forEach((row,i)=>{
    while(start<active.length&&active[start].last.hi<=row.lo)start++;
    for(let j=start;j<active.length&&active[j].last.lo<row.hi;j++){
     matches[i].push(j);counts[j]++;
    }
   });
   active=line.map((row,i)=>{
    const match=matches[i],old=match.length===1&&counts[match[0]]===1?active[match[0]]:null;
    if(old){old.rows.push(row);old.last=row;return old;}
    const track={rows:[row],last:row};tracks.push(track);return track;
   });
  }
  return tracks;
 }
 function sampleRun(points,space){
  const paths=[];
  let path=[points[0]];
  for(let i=1;i<points.length;i++){
   const a=path.at(-1),b=points[i],next=points[i+1];
   if(next&&length(a,b)<1.6&&length(a,next)<2&&space.inside(a,next))continue;
   if(!space.inside(a,b)){
    if(path.length>1)paths.push(path);
    path=[b];continue;
   }
   const n=Math.ceil(length(a,b)/1.8);
   for(let j=1;j<=n;j++)path.push(lerp(a,b,j/n));
  }
  if(path.length>1)paths.push(path);
  return paths;
 }
 function columnPaths(rows,space,cap,pull,underlay){
  const under=[];
  if(underlay!=='none'&&rows.length>=3&&rows.some(row=>row.hi-row.lo>=1.5)){
   const rails=underlay==='edge'?[.22,.78]:[.5];
   for(const ratio of rails)under.push(...sampleRun(rows.map(r=>({x:r.lo+(r.hi-r.lo)*ratio,y:r.y})),space));
  }
  const top=[];
  let path=[],lastBare=null,side=0;
  function finish(){
   if(path.length>=2)top.push(path);
   path=[];lastBare=null;
  }
  function point(row,left){
   const x=left?row.lo:row.hi;
   const move=Math.min(pull,(row.hi-row.lo)*.12);
   return {x:x+(left&&row.outerLeft?-move:!left&&row.outerRight?move:0),y:row.y};
  }
  for(const row of rows){
   const left=side%2===0,tip=point(row,left),bare={x:left?row.lo:row.hi,y:row.y};
   if(lastBare&&(length(path.at(-1),tip)>cap||!space.inside(lastBare,bare,.04)))finish();
   if(!path.length){
    const opposite=point(row,!left);
    if(length(tip,opposite)>.015)path.push(opposite);
   }
   path.push(tip);lastBare=bare;side++;
  }
  finish();
  return {under,top};
 }
 function plan(rings,options={}){
  const max=clamp(options.max||6.5,2,8),cap=max-.16;
  const spacing=clamp(options.spacing||.45,.25,1.7)/2,pull=clamp(options.pull||0,0,.3);
  const seam=Math.min(.28,spacing*.93);
  const overlap=Number.isFinite(options.overlap)?clamp(options.overlap,0,.5):.25;
  const target=Math.max(.5,cap-2*pull-2*seam-overlap-.11);
  const prefer=Number.isFinite(options.angle)?((options.angle%180)+180)%180:0;
  const angle=chooseAngle(rings,prefer,target,options.direction);
  const space=frame(rings,angle),tracks=sections(rowSamples(space,spacing));
  const under=[],top=[];
  let columns=0,splitSections=0;
  for(const {rows} of tracks){
   let widest=0;
   for(const r of rows)widest=Math.max(widest,r.hi-r.lo);
   const count=Math.max(1,Math.ceil(widest/target));
   if(count>1)splitSections++;
   columns+=count;
   for(let lane=0;lane<count;lane++){
    const band=rows.map((r,i)=>{
     const w=(r.hi-r.lo)/count,shift=Math.min(seam,w*.18);
     const cut=n=>r.lo+n*w+(n>0&&n<count?shift*phases[(n+i)%phases.length]:0);
     // Extend only the internal rails. The shared overlap compensates for pull
     // across a split while leaving the original outline and hole edges intact.
     const extension=Math.min(overlap/2,w*.16);
     const lo=Math.max(r.lo,cut(lane)-(lane>0?extension:0));
     const hi=Math.min(r.hi,cut(lane+1)+(lane+1<count?extension:0));
     return {lo,hi,y:r.y,outerLeft:lane===0,outerRight:lane===count-1};
    });
    const result=columnPaths(band,space,cap,pull,options.underlay??'none');
    under.push(...result.under);top.push(...result.top);
   }
  }
  return {angle,columns,splitSections,underlay:under.map(path=>path.map(space.back)),top:top.map(path=>path.map(space.back))};
 }
 const api={plan};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else window.FervorSatin=api;
})();

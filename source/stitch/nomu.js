/* Scale the bundled Baby-Last needle paths without redigitizing the silhouette. */
((root)=>{
 const hypot=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
 const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
 const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
 let reference;
 function read(events){
  const runs=[];let run=[],last=null;
  for(const e of events){
   if(e.type==='stitch'){
    if(!run.length&&last?.type==='jump')run.push({x:last.x,y:last.y});
    run.push({x:e.x,y:e.y});
   }else if(run.length){runs.push(run);run=[];}
   last=e;
  }
  if(run.length)runs.push(run);
  return {figure:runs[0],oval:runs[1]};
 }
 function original(){
  if(!reference){
   const bytes=Uint8Array.from(atob(root.NOMU_JEF_SAMPLE),c=>c.charCodeAt(0));
   reference=read(root.JefCore.parse(bytes.buffer).events);
  }
  return reference;
 }
 // Insert alternating rail pairs only where the authored route has an uninterrupted zigzag.
 // Turns, locks, and moves between lobes keep their original ordering.
 function rows(path,frame){
  const map=p=>({x:frame.x+p.x*frame.sx,y:frame.y+p.y*frame.sy});
  const points=[map(path[0]),map(path[1])];
  for(let i=2;i<path.length;i++){
   const a=path[i-1],b=path[i],c=path[i+1],d=path[i+2];
   if(c&&d){
    const ab=hypot(a,b),cd=hypot(c,d),ac=hypot(a,c),bd=hypot(b,d);
    const direction=((b.x-a.x)*(d.x-c.x)+(b.y-a.y)*(d.y-c.y))/Math.max(.0001,ab*cd);
    if(Math.min(ab,cd)>=2.1&&Math.max(ac,bd)<=1.1&&Math.min(ac,bd)>=.08&&direction>.95){
     const A=map(a),B=map(b),C=map(c),D=map(d);
     const gap=(hypot(A,C)+hypot(B,D))*.5;
     const density=Math.sqrt(Math.abs(frame.sx*frame.sy));
     const extra=clamp(Math.min(Math.round(density)-1,Math.floor(gap/.28)-1),0,12);
     points.push(B);
     for(let j=1;j<=extra;j++){const t=j/(extra+1);points.push(mix(A,C,t),mix(B,D,t));}
     points.push(C);i++;continue;
    }
   }
   points.push(map(b));
  }
  return points;
 }
 function plan(path,frame,{max=8,cleanEntry=false}={}){
  if(!path?.length)return null;
  const native=Math.abs(frame.sx-1)<1e-7&&Math.abs(frame.sy-1)<1e-7&&max>=8;
  const points=rows(path,frame);
  // For the installed figure, enter at the head's authored tie stitches.
  // Preserve the source route when explicitly rendering the original file.
  if(cleanEntry)points.shift();
  // Preserve the original lead-in at its authored size. On a large logo, keep this
  // entry close to the first penetration instead of scaling a long thread tail.
  if(!native&&!cleanEntry){
   const lead=hypot(points[0],points[1]),length=clamp(lead,.05,2);
   if(lead>length)points[0]=mix(points[1],points[0],length/lead);
  }
  const cap=native?8:clamp(max,3,8)-.14;
  const result=[points[0]];let splits=0;
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],count=Math.max(1,Math.ceil(hypot(a,b)/cap));
   for(let j=1;j<count;j++)result.push(mix(a,b,j/count));
   result.push(b);splits+=count-1;
  }
  result.role='reference-satin';
  return {path:result,splits};
 }
 const api={original,read,plan};
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.FervorNomu=api;
})(typeof window==='undefined'?globalThis:window);

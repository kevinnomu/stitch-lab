/* Local magnetic crop. Snap to color/alpha gradients and route near the intended segment. */
(() => {
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 function edgeMap({width,height,data}){
  const plane=new Float32Array(width*height);
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
   const i=(y*width+x)*4;
   let peak=0;
   for(let k=0;k<4;k++){
    const p=i+k,step=width*4;
    const tl=data[p-step-4],tc=data[p-step],tr=data[p-step+4];
    const ml=data[p-4],mr=data[p+4],bl=data[p+step-4],bc=data[p+step],br=data[p+step+4];
    const gx=(tr+2*mr+br-tl-2*ml-bl)/4,gy=(bl+2*bc+br-tl-2*tc-tr)/4;
    peak=Math.max(peak,Math.hypot(gx,gy));
   }
   const contrast=Math.max(0,peak-8);
   plane[y*width+x]=contrast/(contrast+29);
  }
  return {width,height,plane};
 }
 function snap(map,p,radius,strength){
  const {plane,width,height}=map,x=clamp(Math.round(p.x),0,width-1),y=clamp(Math.round(p.y),0,height-1);
  if(strength<=0)return p;
  const r=Math.max(1,radius);
  let best=p,score=.19;
  for(let cy=Math.max(0,Math.floor(y-r));cy<=Math.min(height-1,y+r);cy++){
   for(let cx=Math.max(0,Math.floor(x-r));cx<=Math.min(width-1,x+r);cx++){
    const d=Math.hypot(cx-p.x,cy-p.y);
    if(d>r)continue;
    const value=plane[cy*width+cx]-d/r*(.50-.19*strength);
    if(value>score){score=value;best={x:cx,y:cy};}
   }
  }
  return best;
 }
 function project(p,a,b){
  const dx=b.x-a.x,dy=b.y-a.y;
  const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
  const x=a.x+t*dx,y=a.y+t*dy;
  return {x,y,distance:Math.hypot(p.x-x,p.y-y)};
 }
 function simplify(points,tolerance=.66){
  const keep=new Uint8Array(points.length);
  const work=[[0,points.length-1]];
  keep[0]=keep[points.length-1]=1;
  while(work.length){
   const [first,last]=work.pop();
   let split=-1,distance=tolerance;
   for(let i=first+1;i<last;i++){
    const d=project(points[i],points[first],points[last]).distance;
    if(d>distance){distance=d;split=i;}
   }
   if(split!==-1){keep[split]=1;work.push([first,split],[split,last]);}
  }
  return points.filter((_,i)=>keep[i]);
 }
 class Queue {
  items=[];
  push(value){
   const a=this.items;let i=a.length;
   while(i>0){
    const parent=(i-1)>>1;
    if(a[parent].score<=value.score)break;
    a[i]=a[parent];i=parent;
   }
   a[i]=value;
  }
  pop(){
   const a=this.items,head=a[0],tail=a.pop();
   if(a.length===0)return head;
   let i=0;
   while(i*2+1<a.length){
    let child=i*2+1;
    if(child+1<a.length&&a[child+1].score<a[child].score)child++;
    if(a[child].score>=tail.score)break;
    a[i]=a[child];i=child;
   }
   a[i]=tail;
   return head;
  }
 }
 const adjacent=[[-1,0,1],[1,0,1],[0,-1,1],[0,1,1],[-1,-1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[1,1,Math.SQRT2]];
 function segment(map,a,b,strength=.65,reach=22){
  const direct=[a,b];if(!map||strength<=0)return direct;
  const {width,height,plane}=map;
  const ax=clamp(Math.round(a.x),0,width-1),ay=clamp(Math.round(a.y),0,height-1);
  const bx=clamp(Math.round(b.x),0,width-1),by=clamp(Math.round(b.y),0,height-1);
  const chord=Math.hypot(bx-ax,by-ay);
  if(chord<3)return direct;
  const band=Math.max(4,Math.min(reach,chord*.42));
  const x0=Math.max(0,Math.floor(Math.min(ax,bx)-band)),y0=Math.max(0,Math.floor(Math.min(ay,by)-band));
  const w=Math.min(width,Math.ceil(Math.max(ax,bx)+band+1))-x0;
  const h=Math.min(height,Math.ceil(Math.max(ay,by)+band+1))-y0;
  const start=(ay-y0)*w+ax-x0,end=(by-y0)*w+bx-x0;
  const previous=new Int32Array(w*h).fill(-1),cost=new Float64Array(w*h).fill(Infinity),closed=new Uint8Array(w*h);
  const open=new Queue();cost[start]=0;open.push({i:start,score:chord});
  while(open.items.length){
   const {i}=open.pop();
   if(closed[i])continue;
   if(i===end)break;
   closed[i]=1;
   const px=i%w,py=(i/w)|0;
   for(const [dx,dy,step] of adjacent){
    const nx=px+dx,ny=py+dy;
    if(nx<0||ny<0||nx>=w||ny>=h)continue;
    const index=ny*w+nx;
    if(closed[index])continue;
    const x=nx+x0,y=ny+y0,m=project({x,y},a,b).distance/band;
    if(m>1&&index!==end)continue;
    const edge=plane[y*width+x];
    const score=cost[i]+step*(1+strength*8*(1-edge)**2+1.5*m*m);
    if(score>=cost[index])continue;
    cost[index]=score;previous[index]=i;
    open.push({i:index,score:score+Math.hypot(x-bx,y-by)});
   }
  }
  if(previous[end]===-1)return direct;
  const points=[];let edgeSum=0;
  for(let i=end;i!==start;i=previous[i]){
   const x=i%w+x0,y=((i/w)|0)+y0;
   points.push({x,y});edgeSum+=plane[y*width+x];
  }
  if(edgeSum/points.length<.13)return direct;
  points.reverse();points.pop();
  return simplify([a,...points,b]);
 }
 function nearest(parts,p){
  let best=null;
  parts.forEach((part,index)=>{
   for(let i=1;i<part.length;i++){
    const hit=project(p,part[i-1],part[i]);
    if(!best||hit.distance<best.distance)best={...hit,index};
   }
  });
  return best;
 }
 function clean(value,rect){
  const source=value&&typeof value==='object'?value:{};
  const anchors=Array.isArray(source.anchors)?source.anchors.slice(0,128).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)).map(p=>({
   x:clamp(p.x,rect.x,rect.x+rect.w),y:clamp(p.y,rect.y,rect.y+rect.h)})):[];
  return {anchors,closed:!!source.closed&&anchors.length>=3,
   magnet:source.magnet!==false,strength:Number.isFinite(source.strength)?clamp(source.strength,0,100):65,
   rasterMode:source.rasterMode==='mask'?'mask':'path'};
 }
 const api={edgeMap,snap,segment,nearest,clean};
 if(typeof module==='object')module.exports=api;
 else window.FervorCropEngine=api;
})();

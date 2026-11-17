/* FERVOR Vector raster operations. No network dependency: segmentation and tracing run locally. */
(()=>{'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const colorHex=(r,g,b)=>'#'+[r,g,b].map(n=>clamp(Math.round(n),0,255).toString(16).padStart(2,'0')).join('');
function floodImage(imageData,x,y,tolerance=38,mask=null,operation='replace'){
 const {width:w,height:h,data:d}=imageData,cells=w*h;
 x=clamp(x|0,0,w-1);y=clamp(y|0,0,h-1);const start=y*w+x,index=start*4;
 const reference=[d[index],d[index+1],d[index+2]],t2=tolerance*tolerance*3;
 const visited=new Uint8Array(cells),stack=new Int32Array(cells);let size=0;stack[size++]=start;visited[start]=1;
 const out=operation==='replace'||!mask?new Uint8Array(cells):new Uint8Array(mask);
 while(size){const i=stack[--size],k=i*4,dr=d[k]-reference[0],dg=d[k+1]-reference[1],db=d[k+2]-reference[2];
  if(d[k+3]<32||dr*dr+dg*dg+db*db>t2)continue;
  out[i]=operation==='remove'?0:1;
  const xx=i%w,yy=(i/w)|0;
  if(xx>0&&!visited[i-1]){visited[i-1]=1;stack[size++]=i-1;}
  if(xx<w-1&&!visited[i+1]){visited[i+1]=1;stack[size++]=i+1;}
  if(yy>0&&!visited[i-w]){visited[i-w]=1;stack[size++]=i-w;}
  if(yy<h-1&&!visited[i+w]){visited[i+w]=1;stack[size++]=i+w;}
 }
 return out;
}
function brush(mask,w,h,cx,cy,radius,add){if(!mask)return;const r=Math.max(1,radius/2),x0=clamp(Math.floor(cx-r),0,w-1),x1=clamp(Math.ceil(cx+r),0,w-1),y0=clamp(Math.floor(cy-r),0,h-1),y1=clamp(Math.ceil(cy+r),0,h-1);for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){if((x-cx)**2+(y-cy)**2<=r*r)mask[y*w+x]=add?1:0;}}
function maskedImage(imageData,mask){const w=imageData.width,h=imageData.height,c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');const out=ctx.createImageData(w,h);out.data.set(imageData.data);for(let i=0;i<w*h;i++)if(!mask[i])out.data[i*4+3]=0;ctx.putImageData(out,0,0);return c.toDataURL('image/png');}
function samplePalette(d,w,h,n,mask,ignoreWhite){const raw=[];const stride=Math.max(1,Math.floor(w*h/1500));for(let i=0;i<w*h;i+=stride){if(mask&&!mask[i])continue;const k=i*4;if(d[k+3]<32)continue;if(ignoreWhite&&Math.min(d[k],d[k+1],d[k+2])>242)continue;raw.push([d[k],d[k+1],d[k+2]]);}if(!raw.length)return [[20,25,20]];
 n=Math.min(n,raw.length);
 const means=Array.from({length:n},(_,i)=>raw[Math.min(raw.length-1,Math.floor((i+.5)/n*raw.length))].slice());
 // Farthest point seeding spreads the palette across visible tones.
 for(let j=1;j<n;j++){let best=-1,dist=-1;for(let k=0;k<raw.length;k++){const c=raw[k];let D=Infinity;for(let m=0;m<j;m++){const q=means[m],z=(q[0]-c[0])**2+(q[1]-c[1])**2+(q[2]-c[2])**2;if(z<D)D=z;}if(D>dist){dist=D;best=k;}}means[j]=raw[Math.max(0,best)].slice();}
 let counts=new Array(n).fill(0);
 for(let it=0;it<8;it++){const sums=means.map(()=>[0,0,0,0]);for(const c of raw){let best=0,dist=Infinity;for(let j=0;j<n;j++){const m=means[j],z=(m[0]-c[0])**2+(m[1]-c[1])**2+(m[2]-c[2])**2;if(z<dist){dist=z;best=j;}}for(let k=0;k<3;k++)sums[best][k]+=c[k];sums[best][3]++;}for(let j=0;j<n;j++)if(sums[j][3])for(let k=0;k<3;k++)means[j][k]=sums[j][k]/sums[j][3];counts=sums.map(v=>v[3]);}
 // Keep only colours that cover a real area and are visibly distinct. A 6-colour preset on a
 // 3-colour logo otherwise turns anti-aliased edge pixels into phantom colour layers.
 const order=means.map((m,i)=>({m,c:counts[i]})).sort((a,b)=>b.c-a.c),unique=[];
 for(const {m,c} of order){if(c<raw.length*.015&&unique.length)continue;if(unique.some(u=>(u[0]-m[0])**2+(u[1]-m[1])**2+(u[2]-m[2])**2<40*40))continue;unique.push(m);}
 return unique;
}
function pointToSegmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy||1,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/den,0,1);return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));}
function simplifyOpen(points,tolerance){if(points.length<4)return points;const keep=new Uint8Array(points.length);keep[0]=1;keep[points.length-1]=1;const stack=[[0,points.length-1]];while(stack.length){const [a,b]=stack.pop();let max=-1,index=-1;for(let i=a+1;i<b;i++){const d=pointToSegmentDistance(points[i],points[a],points[b]);if(d>max){max=d;index=i;}}if(max>tolerance&&index>0){keep[index]=1;stack.push([a,index],[index,b]);}}return points.filter((_,i)=>keep[i]);}
function simplifyLoop(points,tolerance,limit=320){if(points.length<4)return points;
 // Start the loop at its sharpest pixel corner so a real corner is never smoothed away by the seam.
 let start=0,best=-2;for(let i=0;i<points.length;i++){const a=points[(i-1+points.length)%points.length],b=points[i],c=points[(i+1)%points.length],v1x=b.x-a.x,v1y=b.y-a.y,v2x=c.x-b.x,v2y=c.y-b.y,den=Math.hypot(v1x,v1y)*Math.hypot(v2x,v2y)||1,turn=1-(v1x*v2x+v1y*v2y)/den;if(turn>best){best=turn;start=i;}}
 const arr=[...points.slice(start),...points.slice(0,start),points[start]];let result=simplifyOpen(arr,tolerance);
 if(result.length>limit)result=simplifyOpen(arr,tolerance*result.length/limit);
 if(result.length>1&&Math.hypot(result[0].x-result.at(-1).x,result[0].y-result.at(-1).y)<.01)result.pop();
 return result.length>=3?result:points.slice(0,Math.min(points.length,limit));}
function signedArea(points){let a=0;for(let i=0;i<points.length;i++){const x=points[i],y=points[(i+1)%points.length];a+=x.x*y.y-y.x*x.y;}return a/2;}
// Pixel-edge loops are staircases. Replacing every edge by its midpoint turns 45° stairs into straight
// diagonals while leaving axis-aligned edges and right-angle corners close to the original pixels.
function edgeMidpoints(pts){const out=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];out.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2});}
 // Merge collinear runs before simplification to keep the point count low.
 const merged=[];for(let i=0;i<out.length;i++){const a=out[(i-1+out.length)%out.length],b=out[i],c=out[(i+1)%out.length];if(Math.abs((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))>1e-9)merged.push(b);}
 return merged.length>=3?merged:out;}
function pixelContours(binary,w,h,minArea=4,tolerance=1.1,maxShapes=400){
 const seen=new Uint8Array(w*h),components=[];
 // Collect every component first, then trace the largest. Stopping in scan order dropped
 // whole regions in the lower part of busy images.
 for(let start=0;start<w*h;start++){
  if(!binary[start]||seen[start])continue;const pixels=[],stack=[start];seen[start]=1;
  while(stack.length){const i=stack.pop(),x=i%w,y=(i/w)|0;pixels.push(i);
   for(const j of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(j>=0&&binary[j]&&!seen[j]){seen[j]=1;stack.push(j);}
  }
  if(pixels.length>=minArea)components.push(pixels);
 }
 components.sort((a,b)=>b.length-a.length);
 const shapes=[],owner=new Int32Array(w*h).fill(-1);
 for(let ci=0;ci<Math.min(components.length,maxShapes);ci++){
  const pixels=components[ci];for(const i of pixels)owner[i]=ci;
  const has=i=>owner[i]===ci,edges=new Map();
  function edge(ax,ay,bx,by){const key=ax+','+ay;let e=edges.get(key);if(!e){e=[];edges.set(key,e);}e.push({ax,ay,bx,by,used:false});}
  for(const i of pixels){const x=i%w,y=(i/w)|0;
    if(y===0||!has(i-w))edge(x,y,x+1,y);
    if(x===w-1||!has(i+1))edge(x+1,y,x+1,y+1);
    if(y===h-1||!has(i+w))edge(x+1,y+1,x,y+1);
    if(x===0||!has(i-1))edge(x,y+1,x,y);
  }
  const loops=[];
  for(const arr of edges.values())for(const first of arr){if(first.used)continue;const pts=[],origin=first.ax+','+first.ay;let e=first,steps=0;
   while(e&&!e.used&&steps++<400000){e.used=true;pts.push({x:e.ax,y:e.ay});const key=e.bx+','+e.by;if(key===origin)break;const candidates=(edges.get(key)||[]).filter(v=>!v.used);if(!candidates.length)break;
    // The correct continuation turns right at ambiguous touching vertices.
    let preferred=null,best=Infinity;const ddx=e.bx-e.ax,ddy=e.by-e.ay;for(const c of candidates){const dx=c.bx-c.ax,dy=c.by-c.ay,cross=ddx*dy-ddy*dx,dot=ddx*dx+ddy*dy,rank=cross>0?0:dot>0?1:cross<0?2:3;if(rank<best){best=rank;preferred=c;}}e=preferred;
   }
   if(pts.length>2){const clean=simplifyLoop(edgeMidpoints(pts),tolerance);if(Math.abs(signedArea(clean))>1)loops.push(clean);}
  }
  if(loops.length)shapes.push({loops,area:pixels.length});
 }
 return shapes;
}
// 3×3 majority vote on the colour label image. Removes the one-pixel anti-aliasing slivers that
// otherwise become long, thin extra shapes along every colour boundary.
function majorityLabels(labels,w,h,passes=1){let src=labels;for(let p=0;p<passes;p++){const out=new Int16Array(src.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,own=src[i];if(own<0){out[i]=-1;continue;}const counts=new Map();for(let dy=-1;dy<=1;dy++){const yy=y+dy;if(yy<0||yy>=h)continue;for(let dx=-1;dx<=1;dx++){const xx=x+dx;if(xx<0||xx>=w)continue;const v=src[yy*w+xx];if(v>=0)counts.set(v,(counts.get(v)||0)+1);}}let best=own,bc=counts.get(own)||0;for(const [k,c] of counts)if(c>bc+1){best=k;bc=c;}out[i]=best;}src=out;}return src;}
function trace(imageData,selection,opts={}){
 const {width:ow,height:oh,data:original}=imageData,detail=clamp(+opts.paths||70,10,100),maxSide=opts.maxSide||Math.round(280+detail*4.2);
 const sc=Math.min(1,maxSide/Math.max(ow,oh)),w=Math.max(1,Math.round(ow*sc)),h=Math.max(1,Math.round(oh*sc));
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const raw=document.createElement('canvas');raw.width=ow;raw.height=oh;raw.getContext('2d').putImageData(imageData,0,0);
 const c=canvas.getContext('2d',{willReadFrequently:true});c.imageSmoothingQuality='high';c.drawImage(raw,0,0,w,h);const d=c.getImageData(0,0,w,h).data;
 let mask=null;if(selection){mask=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)mask[y*w+x]=selection[clamp(Math.floor((y+.5)/h*oh),0,oh-1)*ow+clamp(Math.floor((x+.5)/w*ow),0,ow-1)];}
 const mode=opts.mode==='color'?'color':'bw',palette=mode==='bw'?[[26,30,26]]:samplePalette(d,w,h,clamp(+opts.colors||3,2,16),mask,opts.ignoreWhite);
 const t=+opts.threshold||128;let labels=new Int16Array(w*h).fill(-1);
 for(let i=0;i<w*h;i++){
   if(mask&&!mask[i])continue;const k=i*4,r=d[k],g=d[k+1],b=d[k+2],a=d[k+3];if(a<32)continue;
   if(mode==='bw'){if(r*.299+g*.587+b*.114<t)labels[i]=0;continue;}
   if(opts.ignoreWhite&&Math.min(r,g,b)>240)continue;
   let bi=0,dist=Infinity;for(let j=0;j<palette.length;j++){const p=palette[j],z=(r-p[0])**2+(g-p[1])**2+(b-p[2])**2;if(z<dist){dist=z;bi=j;}}labels[i]=bi;
 }
 if(mode==='color'&&palette.length>1){
  // A colour whose pixels are mostly on boundaries is an anti-aliasing blend, not artwork.
  // Hand its pixels to the nearest remaining colour (or to the background if light and ignored).
  const total=new Array(palette.length).fill(0),edge=new Array(palette.length).fill(0);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,l=labels[i];if(l<0)continue;total[l]++;if(x===0||y===0||x===w-1||y===h-1||labels[i-1]!==l||labels[i+1]!==l||labels[i-w]!==l||labels[i+w]!==l)edge[l]++;}
  const blend=palette.map((_,j)=>total[j]>0&&edge[j]/total[j]>.55),keep=palette.map((_,j)=>j).filter(j=>!blend[j]&&total[j]>0);
  if(keep.length&&keep.length<palette.length){for(let i=0;i<w*h;i++){const l=labels[i];if(l<0||!blend[l])continue;const k=i*4,r=d[k],g=d[k+1],b=d[k+2];if(opts.ignoreWhite&&Math.min(r,g,b)>200){labels[i]=-1;continue;}let best=keep[0],bd=Infinity;for(const j of keep){const q=palette[j],z=(r-q[0])**2+(g-q[1])**2+(b-q[2])**2;if(z<bd){bd=z;best=j;}}labels[i]=best;}}
  labels=majorityLabels(labels,w,h,1);
 }
 const bitmaps=palette.map(()=>new Uint8Array(w*h));for(let i=0;i<w*h;i++)if(labels[i]>=0)bitmaps[labels[i]][i]=1;
 const areaScale=(Math.max(w,h)/260)**2,minArea=clamp(Math.round((+opts.noise||8)*.65*areaScale),1,4000),eps=.22+(100-detail)*.028,shapes=[];
 for(let pi=0;pi<palette.length;pi++){
  const comps=pixelContours(bitmaps[pi],w,h,minArea,eps);
  for(const comp of comps){const loops=comp.loops.map(points=>points.map(p=>({x:p.x/sc,y:p.y/sc})));const fill=colorHex(...palette[pi]);shapes.push({loops,fill,area:comp.area});}
 }
 shapes.sort((a,b)=>b.area-a.area);
 const kept=shapes.slice(0,320);
 return {width:ow,height:oh,shapes:kept,count:shapes.length,colors:[...new Set(kept.map(s=>s.fill))]};
}
// Convert a simplified polygon into Bézier nodes. Turns sharper than cornerDeg stay corners;
// everything else gets tangent handles one third of the adjacent segment length.
function curveNodes(points,cornerDeg=60){const n=points.length,out=[];if(n<3)return points.map(p=>({x:p.x,y:p.y,in:null,out:null}));
 const limit=Math.cos(cornerDeg*Math.PI/180);
 for(let i=0;i<n;i++){const a=points[(i-1+n)%n],p=points[i],b=points[(i+1)%n],v1x=p.x-a.x,v1y=p.y-a.y,v2x=b.x-p.x,v2y=b.y-p.y,l1=Math.hypot(v1x,v1y),l2=Math.hypot(v2x,v2y);
  const cos=l1&&l2?(v1x*v2x+v1y*v2y)/(l1*l2):1;
  if(cos<limit){out.push({x:p.x,y:p.y,in:null,out:null});continue;}
  let tx=b.x-a.x,ty=b.y-a.y;const tl=Math.hypot(tx,ty)||1;tx/=tl;ty/=tl;
  out.push({x:p.x,y:p.y,in:{x:p.x-tx*l1/3,y:p.y-ty*l1/3},out:{x:p.x+tx*l2/3,y:p.y+ty*l2/3}});
 }
 return out;}
window.FervorVectorTrace={trace,floodImage,brush,maskedImage,curveNodes};
})();

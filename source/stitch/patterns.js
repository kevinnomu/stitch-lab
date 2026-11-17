/* Fill recipes shared by artwork, editable stitch objects and lettering. */
(() => {
 const types = {
  fill:'Tatami', satin:'Satin', 'raised-satin':'Raised satin', motif:'Motif', embossed:'Embossed',
  ripple:'Ripple', contour:'Contour', 'cross-stitch':'Cross stitch', stipple:'Stipple single run',
  outline:'Running outline', triple:'Triple run', applique:'Appliqué'
 };
 const motifNames={
  diamond:'Diamond',grid:'Square',chevron:'Chevron',wave:'Sine wave',circle:'Pebble',
  honeycomb:'Honeycomb',petal:'Four petals',scale:'Scallop',chain:'Linked ovals',spark:'Spark',
  ladder:'Ladder',spiral:'Square spiral',herringbone:'Herringbone',arch:'Arch',
  weave:'Woven bars',reed:'Reeds',eye:'Eyelet',flame:'Flame',nomu:'NOMU figure'
 };
 const choices = {
  fill:{adaptive:'Adaptive stagger',brick:'Classic brick',diagonal:'Diagonal',
   'half-drop':'Half drop',twill:'Twill',prism:'Prism stagger',scatter:'Irregular grain',
   chevron:'Chevron',basket:'Basket weave',tartan:'Tartan blocks',pinwheel:'Pinwheel tiles',
   'broken-twill':'Broken twill',ribbon:'Ribbon rows',parquet:'Parquet',
   moire:'Moiré splits',brocade:'Brocade splits',dimples:'Dimple splits'},
  satin:{adaptive:'Adaptive splits',smooth:'Classic smooth',ribbed:'Ribbed',wave:'Wave',
   cord:'Raised cord',braid:'Braided ribs',twill:'Diagonal split',pearl:'Pearl ridge',
   chevron:'Chevron split',reed:'Reeded split',eye:'Eyelet split',lattice:'Lattice split',
   scallop:'Scalloped split',grain:'Staggered grain',bars:'Raised bars',halo:'Double edge'},
  embossed:{diamond:'Diamond',wave:'Wave',grid:'Grid',...Object.fromEntries(Object.entries(motifNames).filter(([id])=>!['diamond','wave','grid'].includes(id)))},
  motif:motifNames,
  ripple:{round:'Concentric',ellipse:'Elliptical',rays:'Fluted rings',spiral:'Spiral',diamond:'Diamond ripples',arch:'Crescent arcs'},
  contour:{even:'Even inset',alternating:'Paired contours',graduated:'Graduated spacing',double:'Reinforced contours',islands:'Broken contours'},
  'cross-stitch':{classic:'Classic X',plus:'Upright cross',offset:'Staggered X',star:'Double cross',half:'Half cross',alternating:'Alternating slant'},
  stipple:{wander:'Meander',gentle:'Soft meander',grain:'Irregular grain',steps:'Stepped meander',loops:'Looping meander',jagged:'Angular meander'},
  outline:{single:'Single run',dashed:'Long–short',bead:'Beaded',pulse:'Pulsed bean',cord:'Corded'},
  triple:{single:'Even triple',dashed:'Long–short triple',bead:'Beaded triple',pulse:'Pulsed triple',cord:'Corded triple'},
  applique:{satin:'Satin edge',blanket:'Blanket edge',zigzag:'Open zigzag edge',bean:'Bean edge',raw:'Raw edge'}
 };
 const defaults={fill:'brick',satin:'smooth',motif:'diamond',embossed:'diamond'};
 const family=type=>type==='running'?'outline':['satin','raised-satin','satin-outline','zigzag'].includes(type)?'satin':['auto','fill-outline','crosshatch'].includes(type)?'fill':type;
 const defaultPattern=type=>defaults[type]||Object.keys(choices[type]||{})[0];
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
 const cross=(a,b)=>a.x*b.y-a.y*b.x;
 const TAU=Math.PI*2;
 const wrap=value=>value-Math.floor(value);
 const grain=i=>wrap(Math.sin((i+1)*127.1)*43758.5453);
 const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
 const number=(v,fallback)=>v!=null&&Number.isFinite(+v)&&v!==''?+v:fallback;
 const defaultSize=type=>({embossed:5,motif:3.5,ripple:3.5,contour:2,'cross-stitch':3,stipple:3,outline:4,triple:4,applique:2.6}[type]??5);
 const sizes=(type,pattern)=>type==='applique'?{min:1.2,max:5,step:.1}:{min:pattern==='nomu'?8:type==='embossed'?3:type==='motif'?2:1.5,max:18,step:.5};
 const sizeFor=(type,value,pattern)=>{const {min,max}=sizes(type,pattern);return clamp(number(value,pattern==='nomu'?9:defaultSize(type)),min,max);};
 const nomuHeightFor=(value,pitch)=>clamp(number(value,Math.min(6,pitch-.75)),4,pitch-.75);
 const reliefOptions={none:'None',...motifNames};
 const directionalPatterns=new Set(['chevron','basket','tartan','pinwheel','broken-twill','ribbon','parquet']);
 function phase(pattern,row,x=0,y=0,size=5) {
  switch(pattern){
   case 'adaptive':return [.12,.61,.29,.84][row%4];
   case 'diagonal':return (row%5)/5;
   case 'half-drop':return (row%2)*.5;
   case 'twill':return (row%7)/7;
   case 'prism':return (3-Math.abs(row%6-3))/3*.9;
   case 'scatter':return .16+grain(row)*.7;
   case 'moire':return .5+.34*Math.sin(TAU*(x*.45+y)/size);
   case 'brocade':return .48+.37*Math.sin(TAU*x/size)*Math.cos(TAU*y/size);
   case 'dimples':return .25+.45*Math.pow(Math.cos(TAU*x/size)*Math.cos(TAU*y/size),4);
   default:return (row%3)/3;
  }
 }
 function satinTexture(paths,pattern,size=5){
  if(!pattern||pattern==='smooth')return paths;
  return paths.map(path=>{
   const out=[path[0]];
   let rail=0,previousMiddle=null;
   for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],length=distance(a,b);
    const mid=mix(a,b,.5);
    if(previousMiddle)rail+=distance(previousMiddle,mid);
    previousMiddle=mid;
    if(!a.travel&&!b.travel&&length>=1.7){
     const t=TAU*rail/size,row=i-1,even=row%2===0;
     let ratios=[],relief=false;
     switch(pattern){
      case 'adaptive':if(length>=3.2)ratios=[.5+(even?.08:-.08)];break;
      case 'ribbed':if(wrap(rail/size)<.36)ratios=[.5];relief=true;break;
      case 'wave':ratios=[.5+.22*Math.sin(t)*(even?1:-1)];relief=true;break;
      case 'cord':ratios=[.5];relief=true;break;
      case 'braid':ratios=[.5+.23*Math.sin(t),.5-.23*Math.sin(t)];relief=true;break;
      case 'twill':ratios=[.2+.6*wrap(rail/size+(even?0:.5))];break;
      case 'pearl':if(Math.cos(t)>.35)ratios=[.5];relief=true;break;
      case 'chevron':ratios=[.2+.6*Math.abs(2*wrap(rail/size)-1)];break;
      case 'reed':ratios=wrap(rail/size)<.5?[.34,.66]:[.5];break;
      case 'eye':ratios=[.5-.27*Math.abs(Math.sin(t)),.5+.27*Math.abs(Math.sin(t))];break;
      case 'lattice':ratios=even?[.22,.73]:[.36,.61];break;
      case 'scallop':ratios=[.27+.45*Math.abs(Math.cos(t*.5))];break;
      case 'grain':ratios=[.25+.5*grain(row)];break;
      case 'bars':if(wrap(rail/size)<.5)ratios=[.33,.67];relief=true;break;
      case 'halo':ratios=[.23,.77];relief=true;break;
     }
     let last=0;
     for(const r of ratios.sort((x,y)=>x-y)){
      const half=relief?Math.min(.25,length*.12)/length:0,left=r-half,right=r+half;
      if((left-last)*length<.28||(1-right)*length<.28)continue;
      if(relief)out.push(mix(a,b,left),mix(a,b,right),mix(a,b,left),mix(a,b,right));
      else out.push(mix(a,b,r));
      last=right;
     }
    }
    out.push(b);
   }
   return out;
  });
 }
 function accentRun(paths,pattern,repeat=4){
  if(!pattern||pattern==='single')return paths;
  return paths.map(path=>{
   let run=0;
   const out=[path[0]];
   for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],d=distance(a,b),p=wrap(run/repeat);
    run+=d;
    if(d>=.85){
     if(pattern==='dashed'&&p<.5)out.push(mix(a,b,.38));
     if(pattern==='cord'||pattern==='pulse'&&p<.45||pattern==='bead'&&p<.25){
      const c=mix(a,b,.30),e=mix(a,b,pattern==='bead'?.58:.76);
      out.push(c,e,c,e);
     }
    }
    out.push(b);
   }
   return out;
  });
 }
 // Open strokes have no fill area. Add repeated short return stitches along the
 // original line rather than placing a motif in empty space beside the part.
 function reliefOnRuns(paths,pattern,repeat,passes,angle=0){
  if(pattern==='nomu')return paths;
  const index=Math.max(0,Object.keys(reliefOptions).indexOf(pattern)-1);
  return paths.map(path=>{
   const accented=[path[0]];
   let along=0;
   for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],d=distance(a,b);
    const phase=wrap(along/repeat+angle/360);
    const coverage=.24+(index%5)*.11;
    if(d>=.9&&phase<coverage){
     const center=.42+.12*Math.sin(TAU*phase*(1+index%4));
     const left=mix(a,b,center-.14),right=mix(a,b,center+.14);
     accented.push(left,right);
     for(let j=1;j<passes;j++)accented.push(left,right);
    }
    along+=d;accented.push(b);
   }
   return accented;
  });
 }
 function within(edges,p) {
  let inside=false;
  for (const [a,d] of edges) if ((a.y>p.y)!==(a.y+d.y>p.y)&&p.x<a.x+(p.y-a.y)*d.x/d.y) inside=!inside;
  return inside;
 }
 const edgesOf=rings=>rings.flatMap(r=>r.slice(1).map((b,i)=>[r[i],{x:b.x-r[i].x,y:b.y-r[i].y}]));
 function clipPaths(rings, guides, step) {
  const edges=edgesOf(rings);
  const output=[];
  for (const guide of guides) {
   let run=[];
   function flush(){if(run.length>1)output.push(run);run=[];}
   for (let i=1;i<guide.length;i++) {
    const a=guide[i-1],b=guide[i],dx={x:b.x-a.x,y:b.y-a.y};
    const crossings=[0,1];
    for (const [p,d] of edges) {
     const den=cross(dx,d);
     if(Math.abs(den)<1e-10)continue;
     const offset={x:p.x-a.x,y:p.y-a.y},t=cross(offset,d)/den,u=cross(offset,dx)/den;
     if(t>1e-7&&t<1-1e-7&&u>=0&&u<1)crossings.push(t);
    }
    crossings.sort((a,b)=>a-b);
    for(let j=1;j<crossings.length;j++){
     const lo=crossings[j-1],hi=crossings[j];
     if((hi-lo)*distance(a,b)<1e-6)continue;
     const mid=mix(a,b,(hi+lo)/2);
     if(!within(edges,mid)){flush();continue;}
     const from=mix(a,b,lo),to=mix(a,b,hi);
     if(!run.length||distance(run.at(-1),from)>1e-5){flush();run.push(from);}
     const count=Math.max(1,Math.ceil(distance(from,to)/step));
     for(let k=1;k<=count;k++)run.push(mix(from,to,k/count));
    }
   }
   flush();
  }
  return output.filter(path=>path.reduce((length,p,i)=>i?length+distance(p,path[i-1]):0,0)>=.35);
 }
 // Sew a convex tile with same-direction rows, keeping each turnaround inside it.
 function fillTile(left,top,right,bottom,angle,spacing){
  const c=Math.cos(angle),s=Math.sin(angle);
  const toLocal=([x,y])=>({x:x*c+y*s,y:y*c-x*s});
  const toPaper=(x,y)=>({x:x*c-y*s,y:x*s+y*c});
  const ring=[[left,top],[right,top],[right,bottom],[left,bottom],[left,top]].map(toLocal);
  const low=Math.min(...ring.map(p=>p.y)),high=Math.max(...ring.map(p=>p.y));
  const count=Math.max(1,Math.ceil((high-low)/spacing)),path=[];
  for(let j=0;j<count;j++){
   const y=low+(high-low)*(j+.5)/count,intercepts=[];
   for(let i=1;i<ring.length;i++){
    const a=ring[i-1],b=ring[i];
    if((a.y>y)!==(b.y>y))intercepts.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y));
   }
   if(intercepts.length!==2)continue;
   let [x0,x1]=intercepts.sort((a,b)=>a-b);
   if(j%2)[x0,x1]=[x1,x0];
   path.push(toPaper(x0,y),toPaper(x1,y));
  }
  return path;
 }
 function directionalTatami(pattern,bounds,spacing,size){
  const {left,right,top,bottom}=bounds,paths=[];
  const tile=Math.max(size,spacing*5,Math.max(right-left,bottom-top)/48);
  const bands=pattern==='chevron'||pattern==='ribbon';
  for(let y=top,j=0;y<bottom;y+=tile,j++){
   const rowBottom=Math.min(bottom,y+tile);
   if(bands){
    paths.push(fillTile(left,y,right,rowBottom,pattern==='ribbon'?Math.sin(j*Math.PI/3)*.63:(j%2?-1:1)*Math.PI/7,spacing));
    continue;
   }
   for(let x=left,i=0;x<right;x+=tile,i++){
    const angles={
     basket:(i+j)%2*Math.PI/2,tartan:(i%3===0||j%3===0)?Math.PI/2:0,
     pinwheel:((i%2)+2*(j%2))*Math.PI/4,
     'broken-twill':(((i+j)%4)<2?1:-1)*Math.PI/4,
     parquet:(((i+j)%2)?Math.PI/3:-Math.PI/6)+(j%2)*.24
    };
    paths.push(fillTile(x,y,Math.min(right,x+tile),rowBottom,angles[pattern]??0,spacing));
   }
  }
  return paths;
 }
 const loop=(count,fn)=>Array.from({length:count+1},(_,i)=>fn(i*TAU/count,i/count));
 // Closed silhouettes traced from the supplied NOMU mark artwork. The second ring is the head opening.
 const nomuSymbolRings=[
  [[66,132],[68,127],[74,127],[75,125],[92,125],[85,118],[80,102],[82,92],[87,83],[91,81],[91,78],[111,70],[134,72],[134,74],[138,74],[147,81],[155,97],[154,110],[151,112],[150,119],[145,121],[146,123],[143,123],[143,125],[163,126],[168,128],[170,135],[168,156],[164,157],[164,159],[151,159],[142,159],[141,161],[144,166],[149,167],[152,172],[158,174],[158,177],[165,181],[165,190],[160,195],[143,205],[134,207],[134,204],[128,204],[117,193],[108,204],[96,207],[96,204],[90,204],[87,200],[83,200],[71,192],[71,180],[81,174],[83,169],[92,165],[94,158],[69,158],[70,156],[67,155],[66,151],[66,132]],
  [[100,98],[102,107],[107,112],[110,112],[109,114],[124,114],[124,112],[128,112],[134,105],[134,98],[135,94],[131,89],[132,87],[125,85],[125,83],[110,83],[110,85],[104,87],[100,98]]
 ];
 const motifs={
  nomu:nomuSymbolRings.map(ring=>ring.map(([x,y])=>[(x-118)/69,(y-139)/69])),
  diamond:[[[0,-1],[1,0],[0,1],[-1,0],[0,-1]]],
  grid:[[[-.82,-.82],[.82,-.82],[.82,.82],[-.82,.82],[-.82,-.82]]],
  chevron:[[[-1,-.65],[0,.44],[1,-.65]],[[-1,.02],[0,.95],[1,.02]]],
  circle:[loop(18,a=>[.85*Math.cos(a),.85*Math.sin(a)])],
  honeycomb:[loop(6,a=>[.96*Math.cos(a),.96*Math.sin(a)])],
  petal:[loop(32,a=>{const r=.92*Math.cos(2*a);return [r*Math.cos(a),r*Math.sin(a)];})],
  scale:[loop(14,a=>[Math.cos(a/2),-.8*Math.sin(a/2)]),[[-1,.47],[0,.96],[1,.47]]],
  chain:[loop(20,a=>[.45*Math.cos(a)-.46,.65*Math.sin(a)]),loop(20,a=>[.45*Math.cos(a)+.46,.65*Math.sin(a)])],
  spark:[loop(8,(a,i)=>[(Math.round(i*8)%2?.37:.96)*Math.cos(a),(Math.round(i*8)%2?.37:.96)*Math.sin(a)])],
  ladder:[[[-.85,-.65],[.85,-.65]],[[-.85,.65],[.85,.65]],...[[-.65,-.65],[-.2,-.65],[.2,-.65],[.65,-.65]].map(([x,y])=>[[x,y],[x,-y]])],
  spiral:[[[-.88,.88],[-.88,-.88],[.88,-.88],[.88,.88],[-.48,.88],[-.48,-.46],[.46,-.46],[.46,.48],[-.03,.48],[-.03,-.05]]],
  herringbone:[[[-.94,-.65],[-.15,.2],[.85,-.65]],[[-.94,.03],[-.15,.89],[.85,.03]]],
  arch:[loop(12,a=>[.85*Math.cos(a/2),-.9*Math.sin(a/2)+.36])],
  weave:[[[-.9,-.6],[.25,-.6],[.25,-.15],[.9,-.15]],[[-.9,.18],[-.25,.18],[-.25,.67],[.9,.67]]],
  reed:[[[-.64,.9],[-.64,-.82]],[[0,.9],[0,-.82]],[[.64,.9],[.64,-.82]]],
  eye:[loop(24,a=>[.92*Math.cos(a),.54*Math.sign(Math.sin(a))*Math.pow(Math.abs(Math.sin(a)),1.4)]),loop(12,a=>[.24*Math.cos(a),.24*Math.sin(a)])],
  flame:[[[0,1],[-.66,.54],[-.5,-.14],[-.13,.12],[.03,-.96],[.57,-.37],[.72,.45],[0,1]]]
 };
 function motifGuides(pattern,pitch,bounds,nomuHeight){
  const {left,right,top,bottom}=bounds,paths=[],width=right-left,height=bottom-top;
  if(pattern==='wave'){
   const count=Math.max(4,Math.ceil(width/Math.min(1,pitch/10)));
   for(let y=top+Math.min(pitch,height)/2;y<bottom;y+=pitch){
    paths.push(Array.from({length:count+1},(_,i)=>{
     const x=left+width*i/count;
     return {x,y:y+pitch*.24*Math.sin((x-left)*TAU/pitch)};
    }));
   }
   return paths;
  }
  const glyph=motifs[pattern]||motifs.diamond;
  for(let y=top+Math.min(pitch,height)/2,row=0;y<bottom;y+=pitch,row++){
   const offset=['honeycomb','scale','arch'].includes(pattern)?(row%2)*pitch*.48:0;
   for(let x=left+Math.min(pitch,width)/2-offset;x<right;x+=pitch){
    for(const line of glyph){
     const scale=pattern==='nomu'?nomuHeightFor(nomuHeight,pitch)*69/137:pitch*.43;
     const points=line.map(([u,v])=>({x:x+u*scale,y:y+v*scale}));
     if(pattern!=='nomu'){paths.push(points);continue;}
     const guide=[points[0]];
     // Remove tiny tracing steps while keeping the two closed contours.
     for(const p of points.slice(1,-1))if(distance(guide.at(-1),p)>=.28&&distance(guide[0],p)>=.28)guide.push(p);
     if(guide.length>2)paths.push([...guide,guide[0]]);
    }
   }
  }
  return paths;
 }
 function offsetGuide(path,offset){
  return path.map((p,i)=>{
   const closed=distance(path[0],path.at(-1))<1e-7;
   const a=path[i===0&&closed?path.length-2:Math.max(0,i-1)];
   const b=path[i===path.length-1&&closed?1:Math.min(path.length-1,i+1)],d=distance(a,b)||1;
   return {x:p.x-(b.y-a.y)*offset/d,y:p.y+(b.x-a.x)*offset/d};
  });
 }
 function decorative(rings,type,{pattern,spacing=.45,angle=0,run=2,size,passes=2,nomuHeight}={}) {
  const rad=angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
  const local=rings.map(r=>r.map(({x,y})=>({x:x*c+y*s,y:y*c-x*s})));
  const pts=local.flat();
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  const w=right-left,h=bottom-top,cx=(left+right)/2,cy=(top+bottom)/2;
  const sizing=type==='directional-tatami'?'fill':type;
  const baseline={ripple:3.5,contour:2,'cross-stitch':3,stipple:3};
  const pitch=Math.max(size==null&&baseline[type]?spacing*4:sizeFor(sizing,size,pattern),spacing*1.35,Math.max(w,h)/60);
  const bounds={left,right,top,bottom},paths=[];
  if(type==='directional-tatami'){
   paths.push(...directionalTatami(pattern,bounds,spacing,pitch));
  }else if(type==='embossed'||type==='motif'){
   const repeat=Math.max(Math.max(w,h)/48,pitch);
   const guides=motifGuides(pattern,repeat,bounds,nomuHeight);
   for(const guide of guides){
    if(type==='motif'){paths.push(guide);continue;}
    const depth=clamp(Math.round(passes),1,3);
    const rows=[];
    for(let k=0;k<depth;k++){
     const row=offsetGuide(guide,(k-(depth-1)/2)*.27);
     rows.push(...(k%2?row.reverse():row));
    }
    paths.push(rows);
   }
  }else if(type==='ripple'){
   const radius=Math.hypot(w,h)*.64,style=pattern||'round';
   if(style==='spiral'){
    const turns=radius/pitch,count=Math.ceil(turns*84);
    paths.push(Array.from({length:count+1},(_,i)=>{const t=i/count,r=t*radius;return {x:cx+r*Math.cos(t*turns*TAU),y:cy+r*Math.sin(t*turns*TAU)};}));
   }else for(let r=pitch/2;r<=radius;r+=pitch){
    paths.push(loop(Math.min(160,Math.max(24,Math.ceil(TAU*r/Math.min(2,run)))),(a)=>{
     if(style==='arch')a=a*.69-.55;
     const rate=style==='rays'?1+.12*Math.cos(9*a):style==='diamond'?1/(Math.abs(Math.cos(a))+Math.abs(Math.sin(a))):1;
     return {x:cx+r*rate*Math.cos(a),y:cy+r*rate*Math.sin(a)*(style==='ellipse'?.62:1)+(style==='arch'?-h*.3:0)};
    }));
   }
  }else if(type==='contour'){
   // Move each edge toward the filled side. Clip again at corners and holes.
   const edges=edgesOf(local);
   for(const ring of local){
    const pts=ring.slice(0,-1),n=pts.length;
    const normal=(a,b)=>{const d=distance(a,b)||1;return {x:(a.y-b.y)/d,y:(b.x-a.x)/d};};
    const direction=normal(pts[0],pts[1]),middle=mix(pts[0],pts[1],.5);
    const sign=within(edges,{x:middle.x+direction.x*.025,y:middle.y+direction.y*.025})?1:-1;
    const offsets=pts.map((p,i)=>{
     const a=normal(pts[(i+n-1)%n],p),b=normal(p,pts[(i+1)%n]);
     const d=Math.max(.45,1+a.x*b.x+a.y*b.y);
     return {x:sign*(a.x+b.x)/d,y:sign*(a.y+b.y)/d};
    });
    for(let depth=pitch/3,row=0;depth<Math.min(w,h)/2;row++){
     const guide=pts.map((p,i)=>({x:p.x+offsets[i].x*depth,y:p.y+offsets[i].y*depth}));
     if(pattern==='islands'){for(let i=0;i<n;i++)paths.push([guide[i],mix(guide[i],guide[(i+1)%n],.74)]);}
     else if(guide.length>2){
      const full=[...guide,guide[0]];
      paths.push(full);
      if(pattern==='double')paths.push(offsetGuide(full,.28));
     }
     depth+=pitch*(pattern==='alternating'?(row%2?1.58:.42):pattern==='graduated'?Math.min(2,.7+row*.13):1);
    }
   }
  }else if(type==='stipple'){
   const meander=[];
   for(let y=top+pitch/2,k=0;y<bottom-pitch*.4;y+=pitch,k++){
    const n=Math.ceil(w/(pitch*.42));
    if(n<1)continue;
    const row=Array.from({length:n+1},(_,i)=>{
     const t=i*1.4+k*2.4,loop=pattern==='loops'?.12*Math.sin(t):0;
     const bend=pattern==='gentle'?.2*Math.sin(t*.56):pattern==='steps'?.22*(Math.floor(i/3)%2?1:-1):
      pattern==='grain'? .58*(grain(i+k*n)-.5):pattern==='jagged'?.3*(i%2?1:-1):.33*Math.sin(t);
     return {x:left+w*(.03+.94*i/n)+pitch*loop,y:y+pitch*bend};
    });
    meander.push(...(k%2?row.reverse():row));
   }
   if(meander.length>1)paths.push(meander);
  }else{
   const half=pitch*.4;
   for(let y=top+pitch/2,row=0;y<bottom+half;y+=pitch,row++){
    const stagger=pattern==='offset'&&row%2?pitch/2:0;
    for(let x=left+pitch/2-stagger,col=0;x<right+half;x+=pitch,col++){
     const p=(u,v)=>({x:x+u*half,y:y+v*half});
     if(pattern==='plus'||pattern==='star')paths.push([p(0,-1),p(0,1)],[p(-1,0),p(1,0)]);
     if(pattern!=='plus'){
      const alternate=pattern==='alternating'&&(row+col)%2===1;
      paths.push(alternate?[p(-1,1),p(1,-1)]:[p(-1,-1),p(1,1)]);
      if(!['alternating','half'].includes(pattern))paths.push([p(-1,1),p(1,-1)]);
     }
    }
   }
  }
  return clipPaths(local,paths,run).map(path=>path.map(({x,y})=>({x:x*c-y*s,y:x*s+y*c})));
 }
 function ovalRings(rx,ry,width,center={x:0,y:0}){
  const point=(a,d)=>{
   const x=Math.cos(a),y=Math.sin(a),n=Math.hypot(x/rx,y/ry);
   return {x:center.x+x*rx-d*x/rx/n,y:center.y+y*ry-d*y/ry/n};
  };
  const sample=d=>Array.from({length:129},(_,i)=>point(Math.PI*2*(i%128)/128,d));
  return [sample(0),sample(width).reverse()];
 }
 function ovalSatin(rx,ry,width,{spacing=.45,max=6.5,overlap=.25,pull=0}={}){
  const lanes=Math.max(1,Math.ceil((width+2*pull)/(max-overlap-.78)));
  const count=Math.max(24,Math.ceil(2*Math.PI*Math.max(rx,ry)/spacing/2)*2);
  return Array.from({length:lanes},(_,lane)=>{
   const out=lane*width/lanes-(lane===0?pull:overlap/2);
   const inside=(lane+1)*width/lanes+(lane===lanes-1?pull:overlap/2);
   return Array.from({length:count+2},(_,i)=>{
    const a=Math.PI*2*(i+(lane%2)*.5)/count-Math.PI/2;
    const x=Math.cos(a),y=Math.sin(a),n=Math.hypot(x/rx,y/ry),d=i%2?inside:out;
    return {x:x*rx-d*x/rx/n,y:y*ry-d*y/ry/n};
   });
  });
 }
 const api={nomuSymbolRings,nomuHeightFor,types,choices,family,defaultPattern,sizes,sizeFor,reliefOptions,reliefOnRuns,directionalPatterns,phase,satinTexture,accentRun,decorative,ovalRings,ovalSatin};
 if(typeof module==='object')module.exports=api;
 else window.FervorPatterns=api;
})();

/* NOMU Stitch Lab JEF codec. JEF distances are signed 0.1mm deltas.
   Writer follows pyembroidery's JEF header/record layout. */
(function(root,factory){
 const API=factory(); if(typeof module==='object'&&module.exports)module.exports=API;
 root.JefCore=API;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 // Janome JEF display colors, in file-index order. Index 0 denotes no thread.
 // RGB reference: https://github.com/inkstitch/inkstitch/blob/main/palettes/InkStitch%20Janome.gpl
 const threadColors=[null,
  '#f0f0f0','#000000','#e4c35d','#f669a0','#ff0000','#ff6600','#ffff17','#481a05',
  '#237336','#0b2f84','#ab5a96','#ac9cc7','#fdf5b5','#f999b7','#fab381','#d7bda4',
  '#9c6445','#970533','#a0b8cc','#65c2c8','#7fc21c','#2f5933','#e5e5e5','#889b9b',
  '#98d6bd','#b2e1e3','#98f3fe','#70a9e2','#1d5478','#071650','#ffbbbb','#ff6048',
  '#ff5a27','#e2a188','#b59474','#f5db8b','#ffcc00','#ffbde3','#c3007e','#a80043',
  '#540571','#ff0927','#c6eecb','#608541','#609418','#06480d','#5bd2b5','#4cb58f',
  '#04917b','#595b61','#ffffdc','#ff4720','#00b552','#0257b5','#d0bab0','#e3be81',
  '#e6651e','#e6965a','#f09c96','#a76c3d','#b45a30','#6e3937','#5c2625','#6231bd',
  '#14329c','#165fa7','#c4e39d','#fd33a3','#ee71af','#843154','#a39166','#0c8918',
  '#f7f297','#cc9900','#c79732','#ff9d00','#ffba5e','#fcf121'
 ];
 const threadHex=index=>threadColors[index]||null;
 const s8 = a=>a>127?a-256:a;
 const signed16=(a)=>Math.round(a);
 const steps=p=>({x:Math.round(p.x*10),y:Math.round(p.y*10)});
 const keyFor=e=>e.orderKey??(e.ownerId==null?null:'object:'+e.ownerId);
 // An embroidered float can be several machine jump commands. Audit it as one
 // trip from the last sewn point to the next run, excluding start and color changes.
 function jumpRuns(events){
  const trips=[];
  let previous=null,start=-1,position=null,distance=0,marked=false,needsTrim=false;
  for(let index=0;index<events.length;index++){
   const e=events[index];
   if(e.type==='color'){previous=null;start=-1;continue;}
   if(e.type==='jump'){
    if(!previous)continue;
    if(start<0){start=index;position=previous;distance=0;marked=false;needsTrim=false;}
    const a=steps(position),b=steps(e);
    distance+=Math.hypot(b.x-a.x,b.y-a.y)/10;
    position=e;marked||=e.trimFromSource===true;needsTrim||=e.jumpNeedsTrim===true;
    continue;
   }
   if(e.type!=='stitch')continue;
   if(start>=0&&(distance>0||marked)){
    const from=keyFor(previous),to=keyFor(e);
    trips.push({start,end:index-1,from:previous,to:position,next:e,distance,marked,needsTrim,betweenParts:from!==null&&to!==null&&from!==to});
   }
   previous=e;start=-1;
  }
  return trips;
 }
 // Write a cutting marker before exposed travel, including a jump between
 // runs of one shape. Retain authored cuts on imported files.
 function planTrims(events,options={}){
  const minDist=Math.max(0,Number(options.trimMinDistanceMm)||0);
  return jumpRuns(events).filter(run=>run.marked||
   (run.distance+.00001>=minDist&&(
    (options.autoTrimBetweenParts&&run.betweenParts)||(options.autoTrimExposedJumps&&run.needsTrim)
   ))).map(run=>run.start);
 }
 function parse(buffer){
  let bytes=new Uint8Array(buffer),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length<124)throw new Error('Not a valid JEF file: header too short');
  const off=v.getUint32(0,true),magic=v.getUint32(4,true),numColors=v.getUint32(24,true),cmdCount=v.getUint32(28,true),hoopCode=v.getUint32(32,true);
  if(magic!==20||off<116||off>bytes.length||numColors<1||numColors>1000||off!==116+numColors*8)throw new Error('Invalid JEF header or palette offset');
  let palette=[];for(let j=0;j<numColors;j++)palette.push(v.getInt32(116+j*4,true));
  let events=[],x=0,y=0,i=off,units=0,colorChanges=0,ended=false;
  while(i<bytes.length){
   if(i+1>=bytes.length)throw new Error('Truncated JEF command');
   let a=bytes[i++],b=bytes[i++];
   if(a===128){
     if(b===16){units++;ended=true;break;}
     if(i+2>bytes.length)throw new Error('Truncated extended JEF command');
     let dx=s8(bytes[i++]),dy=-s8(bytes[i++]);units+=2;
     if(b===1){colorChanges++;events.push({x:x/10,y:y/10,type:'color'});continue;}
     if(b===2){x+=dx;y+=dy;events.push({x:x/10,y:y/10,type:'jump',trimFromSource:dx===0&&dy===0});continue;}
     throw new Error('Unsupported JEF command '+b);
   }
   x+=s8(a);y-=s8(b);units++;
   events.push({x:x/10,y:y/10,type:'stitch'});
   if(events.length>1500000)throw new Error('JEF is unreasonably large');
  }
  if(!ended)throw new Error('Missing JEF end record');
  if(units!==cmdCount)throw new Error(`Header count ${cmdCount} does not match ${units} decoded commands`);
  let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity;
  for(let e of events){if(e.type==='color')continue;minx=Math.min(minx,e.x);maxx=Math.max(maxx,e.x);miny=Math.min(miny,e.y);maxy=Math.max(maxy,e.y);}
  return {events,palette,hoopCode,width:Math.round((maxx-minx)*10)/10,height:Math.round((maxy-miny)*10)/10,center:{x:(minx+maxx)/2,y:(miny+maxy)/2},colorChanges,commandCount:units,colors:numColors};
 }
 function write(events,options={}){
  if(!events||!events.length)throw new Error('No stitches to export');
  let records=[],currentX=0,currentY=0,units=1,nStitches=0,nJumps=0,nColor=0,nTrims=0;
  const plannedTrimIndices=new Set(planTrims(events,options));
  let xs=[],ys=[]; const dlim=115;
  for(let ei=0;ei<events.length;ei++){
   const ev=events[ei];
   if(plannedTrimIndices.has(ei)){
    // 0x80 0x02 + zero movement: explicit JEF cutting marker (experimental).
    // Emit at the PREVIOUS object's end, before any jumps toward next object.
    records.push(128,2,0,0);units+=2;nTrims++;
   }
   if(ev.type==='color'){records.push(128,1,0,0);units+=2;nColor++;continue;}
   if(ev.type!=='jump'&&ev.type!=='stitch')continue;
   const destX=Math.round(ev.x*10),destY=Math.round(ev.y*10);
   if(!Number.isFinite(destX)||!Number.isFinite(destY)||Math.abs(destX)>1000000||Math.abs(destY)>1000000)throw new Error('Invalid stitch coordinate');
   let dx=destX-currentX,dy=destY-currentY;
   let count=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/dlim));
   if(count>10000)throw new Error('Excessive movement');
   let sx=currentX,sy=currentY;
   for(let i=1;i<=count;i++){
    const px=sx+Math.round(dx*i/count),py=sy+Math.round(dy*i/count),a=px-currentX,b=py-currentY;
    if(a===0&&b===0)continue;
    if(ev.type==='jump') {records.push(128,2,a&255,(-b)&255);units+=2;nJumps++;}
    else {records.push(a&255,(-b)&255);units++;nStitches++;}
    currentX=px;currentY=py;
   }
   xs.push(destX);ys.push(destY);
  }
  if(!xs.length||nStitches===0)throw new Error('Design has no sewing stitches');
  records.push(128,16);
  // Loop instead of Math.min(...xs): spreading 100k+ stitches overflows the call stack.
  let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity;for(let i=0;i<xs.length;i++){const x=xs[i],y=ys[i];if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;}
  const width=maxx-minx,height=maxy-miny;
  if(width>2000||height>2800)throw new Error(`Design ${width/10} × ${height/10} mm exceeds 500E maximum 200 × 280 mm`);
  if(Math.max(Math.abs(minx),Math.abs(maxx))>1000||Math.max(Math.abs(miny),Math.abs(maxy))>1400)throw new Error('The design extends beyond the 500E maximum 200 × 280 mm area. Reduce size or offsets.');
  const colors=nColor+1; const off=116+8*colors;
  const out=new ArrayBuffer(off+records.length+(options.padding===false?0:82));
  const v=new DataView(out);const u=new Uint8Array(out);
  let p=0;const I32=n=>{v.setInt32(p,n,true);p+=4;};
  I32(off);I32(20);
  let d=new Date();let z=n=>String(n).padStart(2,'0');
  let stamp=String(d.getFullYear())+z(d.getMonth()+1)+z(d.getDate())+z(d.getHours())+z(d.getMinutes())+z(d.getSeconds());
  for(const ch of stamp)u[p++]=ch.charCodeAt(0);
  u[p++]=115;u[p++]=0;
  I32(colors);I32(units);
  let hoopCode=options.hoopCode===undefined?'auto':options.hoopCode;
  if(hoopCode==='auto')hoopCode=(width>1400||height>2000)?38:39;
  I32(hoopCode);
  const hx=Math.round(width/2),hy=Math.round(height/2);
  for(let i=0;i<2;i++){I32(hx);I32(hy);}
  for(const [hw,hh] of [[550,550],[250,250],[700,1000],[700,1000]]){
   const x=hw-hx,y=hh-hy;
   for(let i=0;i<2;i++){I32(x>=0&&y>=0?x:-1);I32(x>=0&&y>=0?y:-1);}
  }
  let palette=options.palette||[];
  for(let i=0;i<colors;i++)I32(Number.isFinite(palette[i])?palette[i]:1);
  for(let i=0;i<colors;i++)I32(13);
  if(p!==off)throw new Error('JEF header encoding mismatch');
  u.set(records,off);
  const parsed=parse(out);
  if(parsed.commandCount!==units||parsed.events.filter(e=>e.type==='stitch').length!==nStitches||parsed.events.filter(e=>e.trimFromSource).length!==nTrims)throw new Error('JEF roundtrip or cutting-command validation failed');
  return {buffer:out,stats:{stitches:nStitches,jumps:nJumps,trims:nTrims,colors,bytes:out.byteLength,width:width/10,height:height/10,hoopCode},parsed};
 }
 return {parse,write,planTrims,jumpRuns,threadHex};
});

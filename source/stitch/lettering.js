/* Single-line embroidery alphabets. Each stroke is drawn as a needle path in a 4 × 6 cell. */
(() => {
 const glyphs = {
  A:'06 03 20 43 46;13 33', B:'06 00 30 41 42 33 03;33 44 45 36 06',
  C:'41 30 10 01 05 16 36 45', D:'06 00 20 42 44 26 06',
  E:'40 00 06 46;03 33', F:'40 00 06;03 33',
  G:'41 30 10 01 05 16 36 45 43 23', H:'00 06;40 46;03 43',
  I:'00 40;20 26;06 46', J:'00 40 45 36 16 05 04',
  K:'00 06;40 03 46', L:'00 06 46',
  M:'06 00 23 40 46', N:'06 00 46 40',
  O:'10 30 41 45 36 16 05 01 10', P:'06 00 30 41 42 33 03',
  Q:'10 30 41 45 36 16 05 01 10;34 47', R:'06 00 30 41 42 33 03;23 46',
  S:'41 30 10 01 02 13 33 44 45 36 16 05', T:'00 40;20 26',
  U:'00 05 16 36 45 40', V:'00 26 40',
  W:'00 16 23 36 40', X:'00 46;40 06',
  Y:'00 23 40;23 26', Z:'00 40 06 46',
  0:'10 30 41 45 36 16 05 01 10', 1:'11 20 26;06 46',
  2:'01 10 30 41 42 06 46', 3:'00 30 41 42 33 13;33 44 45 36 16 05',
  4:'30 04 44;30 36', 5:'40 00 03 33 44 45 36 16 05',
  6:'41 30 10 01 05 16 36 45 44 33 13 04', 7:'00 40 16',
  8:'13 02 01 10 30 41 42 33 13 04 05 16 36 45 44 33',
  9:'05 16 36 45 41 30 10 01 02 13 33 42',
  '.':'25 26', ',':'25 17', ':':'22 23;25 26', '-':'13 33', '!':'20 24;25 26',
  '?':'01 10 30 41 42 24;25 26', '/':'06 40', '&':'44 26 06 04 42 41 30 20 11 13 46',
  "'":'20 21', '+':'13 33;22 24', '(':'30 12 14 36', ')':'10 32 34 16', ' ':''
 };
 const faces = {
  'micro-block':{width:1,round:0},
  'micro-narrow':{width:.79,round:0},
  'micro-round':{width:1.12,round:.28}
 };
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 const number=(v,fallback,lo,hi)=>Number.isFinite(v)?clamp(v,lo,hi):fallback;
 function fields(value={}) {
  return {...value,content:typeof value.content==='string'?value.content.replace(/\r\n?/g,'\n').split('\n').slice(0,4).join('\n').slice(0,80):'',
   height:number(value.height,7,3,35),tracking:number(value.tracking,.2,-.5,3),
   width:number(value.width,100,70,140),lineGap:number(value.lineGap,2,0,12),
   join:value.join==='digitized'?'digitized':'closest',
   align:['left','center','right'].includes(value.align)?value.align:'center',
   x:number(value.x,0,-140,140),y:number(value.y,0,-160,160),rotation:number(value.rotation,0,-180,180)};
 }
 const supports=text=>[...text.toUpperCase()].every(c=>c==='\n'||Object.hasOwn(glyphs,c));
 const isMicro=font=>Object.hasOwn(faces,font);
 const offset=(align,block,line)=>align==='left'?0:align==='right'?block-line:(block-line)/2;
 const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
 function roundCorners(points,amount){
  if(!amount||points.length<3)return points;
  const closed=points[0].x===points.at(-1).x&&points[0].y===points.at(-1).y;
  const vertices=closed?points.slice(0,-1):points;
  const out=[];
  for(let i=0;i<vertices.length;i++){
   const p=vertices[i];
   if(!closed&&(i===0||i===vertices.length-1)){out.push(p);continue;}
   const a=mix(p,vertices[(i+vertices.length-1)%vertices.length],amount);
   const b=mix(p,vertices[(i+1)%vertices.length],amount);
   out.push(a,mix(mix(a,p,.5),mix(p,b,.5),.5),b);
  }
  if(closed)out.push(out[0]);
  return out;
 }
 function layout(value){
  const t=fields(value),face=faces[t.font];
  if(!face||!supports(t.content))return null;
  const unit=t.height/6,sx=unit*face.width*t.width/100,advance=Math.max(4.2*sx,4.8*sx+t.tracking);
  const lines=t.content.toUpperCase().split('\n');
  const widths=lines.map(line=>line.length?advance*(line.length-1)+4*sx:0);
  const block=Math.max(0,...widths),paths=[],letters=[];
  for(let row=0;row<lines.length;row++){
   const left=offset(t.align,block,widths[row]),top=row*(t.height+t.lineGap);
   for(let index=0;index<lines[row].length;index++){
    const glyph=glyphs[lines[row][index]];
    if(!glyph)continue;
    const start=paths.length;
    for(const stroke of glyph.split(';')){
     const points=stroke.split(' ').map(([x,y])=>({x:left+index*advance+Number(x)*sx,y:top+Number(y)*unit}));
     paths.push(roundCorners(points,face.round));
    }
    const points=paths.slice(start).flat(),xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    letters.push({content:lines[row][index],x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2});
   }
  }
  if(!paths.length)return {paths,letters,mmW:0,mmH:0};
  const xs=paths.flat().map(p=>p.x),ys=paths.flat().map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const shift=p=>({...p,x:p.x-(minX+maxX)/2,y:p.y-(minY+maxY)/2});
  return {paths:paths.map(path=>path.map(shift)),letters:letters.map(shift),mmW:maxX-minX,mmH:maxY-minY};
 }
 function sample(path,step){
  const points=[path[0]];
  for(let i=1;i<path.length;i++){
   const a=points.at(-1),b=path[i],distance=Math.hypot(b.x-a.x,b.y-a.y);
   if(distance<.20&&i<path.length-1)continue;
   if(distance<.12)continue;
   const count=Math.ceil(distance/step);
   for(let j=1;j<=count;j++)points.push(mix(a,b,j/count));
  }
  return points;
 }
 const api={fields,isMicro,supports,offset,layout,sample};
 if(typeof module==='object')module.exports=api;
 else window.FervorLettering=api;
})();

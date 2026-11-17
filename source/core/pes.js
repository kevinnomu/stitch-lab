
// Browser-local Brother PES / PEC stitch reader. Extracts stitch-only commands,
// not the original vector/design objects. Native Wilcom EMB is not decoded.
window.NOMU_PES={parse(buffer){
 const b=new Uint8Array(buffer),v=new DataView(buffer);
 if(b.length<550)throw new Error('PES/PEC file too short');
 const magic=String.fromCharCode(...b.slice(0,8));
 let off;
 if(magic==='#PEC0001')off=8;
 else if(magic.startsWith('#PES'))off=v.getUint32(8,true);
 else throw new Error('Not a recognized PES / PEC file');
 if(off<0||off+529>=b.length||String.fromCharCode(...b.slice(off,off+3))!=='LA:')throw new Error('PES file lacks a valid embedded PEC stitch block');
 const changes=b[off+48],count=changes===255?0:changes+1;
 if(count>100||off+49+count>off+512)throw new Error('Unusual PES color sequence');
 const palette=Array.from({length:Math.max(1,count)},(_,i)=>1+(b[off+49+i]||0)%72);
 let p=off+528,x=0,y=0,events=[],change=0,finished=false;
 function s7(n){return n>63?n-128:n;}
 function s12(n){n&=4095;return n>2047?n-4096:n;}
 while(p<b.length-1&&events.length<1500000){
  let a=b[p++],c=b[p++];
  if(a===255&&c===0){finished=true;break;}
  if(a===254&&c===176){if(p>=b.length)break;p++;events.push({x:x/10,y:y/10,type:'color'});change++;continue;}
  let jump=false,trim=false,dx,dy;
  if(a&128){if(p>=b.length)break;jump=!!(a&16);trim=!!(a&32);dx=s12(a<<8|c);c=b[p++];}
  else dx=s7(a);
  if(c&128){if(p>=b.length)break;jump=jump||!!(c&16);trim=trim||!!(c&32);dy=s12(c<<8|b[p++]);}
  else dy=s7(c);
  x+=dx;y+=dy;
  events.push({x:x/10,y:y/10,type:jump||trim?'jump':'stitch',trimFromSource:trim});
 }
 if(!finished)throw new Error('PES stitch block incomplete or too large');
 if(!events.some(e=>e.type==='stitch'))throw new Error('PES contains no sewing stitches');
 const pts=events.filter(e=>e.type!=='color');
 const minx=Math.min(...pts.map(e=>e.x)),maxx=Math.max(...pts.map(e=>e.x));
 const miny=Math.min(...pts.map(e=>e.y)),maxy=Math.max(...pts.map(e=>e.y));
 const cx=(minx+maxx)/2,cy=(miny+maxy)/2;
 // Center Brother's stitch coordinates on the same editable world canvas.
 events=events.map(e=>({...e,x:e.x-cx,y:e.y-cy}));
 return {events,palette,hoopCode:'auto',width:maxx-minx,height:maxy-miny,center:{x:0,y:0},colors:Math.max(1,count),sourceFormat:magic.startsWith('#PEC')?'PEC':'PES',colorChanges:change};
}};

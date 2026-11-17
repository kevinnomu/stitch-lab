const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync(require('node:path').join(__dirname,'../source/suite/press.js'),'utf8');

function bus(){
 const listeners=new Map();
 return {
  addEventListener(name,fn){listeners.set(name,fn);},
  emit(name,event={}){listeners.get(name)?.(event);}
 };
}
class Control{
 constructor(kind='button'){this.kind=kind;this.dataset={};this.isConnected=true;this.history=[];}
 closest(selector){return selector.startsWith('#fvc-piano')?['piano','toolrail'].includes(this.kind)?this:null:this;}
 matches(selector){
  if(selector.startsWith(':disabled'))return this.kind==='disabled';
  if(selector.startsWith('#fv-home-continue'))return this.kind==='hero';
  if(selector.startsWith('.fvr-row'))return this.kind==='row';
  return false;
 }
 getBoundingClientRect(){return {left:0,right:40,top:0,bottom:40};}
 animate(frames,options){
  const animation={progress:0,effect:{getComputedTiming(){return {progress:animation.progress};}},cancel(){animation.cancelled=true;}};
  this.history.push({frames,options,animation});return animation;
 }
}
const win=bus(),doc=bus(),motion=bus();
vm.runInNewContext(script,{Element:Control,document:doc,matchMedia:()=>motion,addEventListener:win.addEventListener});
const button=new Control('hero');
const pointer=(control=button,ptr=1)=>({button:0,isPrimary:true,pointerId:ptr,pointerType:'mouse',target:control});
const hasContact=control=>Object.hasOwn(control.dataset,'fvContact');
win.emit('pointerdown',pointer());
assert.ok(hasContact(button));
assert.equal(button.history[0].frames.at(-1).translate,'0px 3px');
win.emit('pointerup',pointer());
assert.ok(!hasContact(button));
assert.ok(button.history[0].animation.cancelled);
assert.ok(button.history[1].frames.some(f=>f.translate==='0px 3px'),'even a quick tap reaches the depressed depth');
assert.ok(button.history[1].frames.some(f=>parseFloat(f.translate.split(' ')[1])<0),'release overshoots before landing');
win.emit('pointerdown',pointer());
win.emit('pointermove',{...pointer(),clientX:90,clientY:90});
assert.ok(!hasContact(button)&&button.history[2].animation.cancelled);
win.emit('pointerdown',pointer());
win.emit('pointercancel',pointer());
assert.ok(!hasContact(button));
for(const kind of ['disabled','piano','toolrail']){
 const control=new Control(kind);
 win.emit('pointerdown',pointer(control));
 assert.ok(!hasContact(control));
 assert.equal(control.history.length,0);
}
const tool=new Control();
win.emit('keydown',{target:tool,key:' '});
assert.ok(hasContact(tool));
assert.equal(tool.history[0].frames.at(-1).translate,'0px 2px');
win.emit('keyup',{key:' '});
assert.ok(!hasContact(tool));
win.emit('keydown',{target:tool,key:'Enter'});
assert.ok(hasContact(tool));
doc.emit('focusout',{target:tool});
assert.ok(!hasContact(tool));
motion.matches=true;
motion.emit('change');
const reduced=new Control('row');
win.emit('pointerdown',pointer(reduced));
assert.ok(hasContact(reduced));
win.emit('pointerup',pointer(reduced));
assert.ok(!hasContact(reduced));
assert.equal(reduced.history.length,0);
console.log('Tactile controls: press depth, spring return, keyboard, cancellation and reduced motion PASS');

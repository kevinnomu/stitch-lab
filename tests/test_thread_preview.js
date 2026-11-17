/* Check the real canvas render path for the default Thread preview. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../source/stitch/engine.js'),'utf8');
const defaults = source.slice(source.indexOf('const DEFAULT_PREVIEW_MODE='),source.indexOf('let previewMode='));
const lighting = source.slice(source.indexOf('function threadLuminance('),source.indexOf('function realisticThreads('));
const render = source.slice(source.indexOf('function render(){let W='),source.indexOf("window.addEventListener('fervor:theme-change'"));
const calls = [];
const noop = () => {};
let dark = false;
let art = false;
const context = vm.createContext({
  ctx: new Proxy({},{
    get: (_, key) => key==='fillRect' ? ()=>calls.push('fill') : key==='stroke' ? ()=>calls.push('grid') : noop,
    set: (_, key, value) => { if(key==='fillStyle')calls.push(value);return true; }
  }),
  Event: class {constructor(type){this.type=type;}},
  document:{body:{classList:{contains:name=>name==='fv-theme-dark'?dark:name==='fv-theme-art'&&art}}},
  getComputedStyle:()=>({getPropertyValue:name=>name==='--sl-paper'?'#1c1714':''}),
  window:{dispatchEvent:noop},
  canvas:{width:1200,height:700},
  getSettings:()=>({width:90}),
  calcBounds:()=>({w:65,h:35}),
  viewZoom:1,viewPan:{x:0,y:0},mode:'jef',
  originalBounds:{width:65,height:35},
  events:[{type:'jump',x:0,y:0},{type:'stitch',x:1,y:0}],simCursor:2,
  cleanCapture:false,
  darkGrid:false,
  tool:'select',activeStroke:null,manual:[],
  drawFabric:()=>calls.push('fabric'),
  realisticThreads:(_,count,scale,gridDark)=>calls.push(['threads',count,gridDark]),
  drawDensityMap:noop,renderTextSelections:noop,drawLayerSelection:noop,fvNodeDraw:noop
});
vm.runInContext(defaults+lighting+render+'\nlet previewMode=DEFAULT_PREVIEW_MODE,display;render();',context);
assert.ok(calls.includes('#fff')&&calls.includes('grid'));
assert.ok(!calls.includes('fabric'));
assert.deepEqual(calls.find(Array.isArray),['threads',2,false]);
dark=true;
calls.length=0;
vm.runInContext('render()',context);
assert.ok(calls.includes('#090909')&&calls.includes('grid'));
assert.deepEqual(calls.find(Array.isArray),['threads',2,true]);
art=true;
calls.length=0;
vm.runInContext('render()',context);
assert.ok(calls.includes('#1c1714')&&calls.includes('grid'));
assert.deepEqual(calls.find(Array.isArray),['threads',2,true]);
calls.length=0;
vm.runInContext("previewMode='realistic';render()",context);
assert.deepEqual(calls,['fabric',['threads',2,false]]);
assert.ok(vm.runInContext('threadLuminance(threadLighting([30,32,34],true))>140',context));
assert.ok(vm.runInContext('threadLuminance(threadLighting([250,246,240],false))<210',context));
console.log('Default Thread rendering, theme grid, fabric separation and thread contrast passed.');

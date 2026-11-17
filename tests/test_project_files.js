const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../source/core/project-files.js'),'utf8');
const context={window:{}};
vm.runInNewContext(source,context);
const {signature,isActive}=context.window.FervorProjectFiles;

const project={sourceName:'Gallop',annotations:[],palette:[1],selectedMachineHoop:'RE20b',
 settings:{hoop:'auto',showArt:true},trimMinDistanceMm:3,autoTrimBetweenParts:true};
const plan=[{type:'jump',x:0,y:0},{type:'stitch',x:2,y:2,threadCode:1}];
const initial=signature('stitch',project,plan);
assert.equal(signature('stitch',{...project,sourceName:'New Name',annotations:[{text:'Tested on canvas'}]},plan),initial,
 'editing file information does not alter a sew-out revision');
assert.equal(signature('stitch',{...project,settings:{...project.settings,showArt:false}},plan),initial);
assert.notEqual(signature('stitch',project,[plan[0],{...plan[1],x:3}]),initial,
 'changed needle positions alter the stitch revision');
assert.notEqual(signature('stitch',{...project,trimMinDistanceMm:7},plan),initial,
 'trim changes alter the stitch revision');

const root={id:'root',deletedAt:null},folder={id:'folder',parentId:root.id,deletedAt:null};
const file={id:'file',parentId:folder.id,deletedAt:null},map=new Map([[root.id,root],[folder.id,folder],[file.id,file]]);
assert.ok(isActive(file,map));
root.deletedAt=1700000000000;
assert.equal(isActive(file,map),false,'a trashed ancestor hides nested designs');
root.deletedAt=null;
assert.ok(isActive(file,map),'restoring the folder restores its visible children');
file.deletedAt=1700000000050;
assert.equal(isActive(file,map),false,'child with its own deletion stays in Recently Deleted');
console.log('Project Files: sew-out revision fingerprints and trash inheritance PASS.');

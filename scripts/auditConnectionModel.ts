import * as THREE from 'three';
import {mkdirSync,writeFileSync} from 'node:fs';
import {cappedDemonstrationProject,demonstrationProject} from '../src/engine/demonstration';
import {buildRunwaySteel} from '../src/components/runwaySteelGeometry';
import {buildReferenceFraming} from '../src/components/referenceFraming';
import {buildRunwayDetails,createHardwareBuilder} from '../src/components/connectionDetails';
import {buildIndependentSupports,independentBearingSettings} from '../src/components/independentSupportGeometry';
import {buildReferenceStructure,cloneOppositeRunway} from '../src/components/referenceStructure';
import {referenceColumns,referenceCrossheads} from '../src/data/aiscReferenceShapes';
import {demonstrationFraming as f} from '../src/components/framingSettings';
import {railKeeperStations} from '../src/engine/simpleSupports';
import {checkHardwareClashes} from '../src/components/hardwareClashes';
const results=[];
for(const project of [cappedDemonstrationProject(),demonstrationProject()]){
 const group=new THREE.Group(),steel=new THREE.MeshBasicMaterial(),edge=new THREE.LineBasicMaterial(),materials={column:steel,beam:steel,plate:steel,foundation:steel,weld:steel,edge},hardware=createHardwareBuilder(steel);
 const p=project,s=p.section,d=s.d/1000,tf=s.tf/1000,tw=s.tw/1000,bf=s.bf/1000,L=p.spans.reduce((a,b)=>a+b,0)/1000,supports=[-L/2];for(const span of p.spans)supports.push(supports.at(-1)!+span/1000);
 const railBase=d/2+(s.kind==='cap'?s.capTw/1000:0),railH=p.railHeight/1000,railZ=p.railEccentricity/1000,bs=p.details!.bearing,r=p.details!.rail;
 const ref=buildReferenceFraming({bracket:p.details!.bracket,independentBearing:independentBearingSettings(p),supports,girderDepth:d,girderWidth:bf,girderFlangeT:tf,columnHeight:f.height/1000,roofBottom:railBase+railH+.0125+f.roofClearance/1000,column:referenceColumns.find(v=>v.name===f.column)!,crosshead:referenceCrossheads.find(v=>v.name===f.crosshead)!,materials,hardware,frameStyle:f.frameStyle});group.add(ref.group);
 const details=buildRunwayDetails({supports,length:L,depth:d,width:bf,flangeT:tf,webT:tw,railBase,railZ,railBearingWidth:s.kind==='cap'?s.capWidth/1000:bf,railBearingT:s.kind==='cap'?s.capTw/1000:tf,omitStiffeners:true,keeperStations:railKeeperStations(p).map(x=>x/1000-L/2),weldedKeeper:{width:r.clipWidth/1000,thickness:r.clipThickness/1000,projection:r.clipProjection/1000,weld:r.clipWeld/1000,baseWidth:r.baseWidth/1000,baseThickness:r.baseThickness/1000,spacing:p.aist!.clipSpacing/1000},bearingStiffener:{width:bs.stiffenerWidth/1000,thickness:bs.stiffenerThickness/1000,cope:bs.cope/1000},hardware,plate:steel,weld:steel,edge});group.add(details.group);
 group.add(buildIndependentSupports(p,ref.columnFace,steel,edge,hardware,true,steel));group.add(buildRunwaySteel(p,{steel,cap:steel,rail:steel,weld:steel,edge},details.railHoles,ref.girderBoltHoles));
 group.add(cloneOppositeRunway(group,f.width/1000,supports,railZ));
 group.add(buildReferenceStructure({supports,bayWidth:f.width/1000,columnBottom:ref.columnBottom,floor:ref.floor,railTop:railBase+railH+.0125,roofClearance:f.roofClearance/1000,columnOffset:ref.columnOffset,column:referenceColumns.find(v=>v.name===f.column)!,hardware,materials:{...materials,brace:steel,crane:steel},cranes:[],wheelRadius:Math.max(.075,d*.16),railZ,frameStyle:f.frameStyle,roofSlope:f.roofSlope,bracketTop:ref.beamTop}).group);
 const audit=checkHardwareClashes(group);results.push({project:p.title,framing:f,audit});console.log(JSON.stringify({project:p.number,hardware:audit.hardware,solids:audit.solids,pairs:audit.pairs,issues:audit.issues.length,examples:audit.issues.slice(0,8)}));
 const geometries=new Set<THREE.BufferGeometry>();group.traverse(o=>{if((o as THREE.Mesh).geometry)geometries.add((o as THREE.Mesh).geometry);});geometries.forEach(g=>g.dispose());steel.dispose();edge.dispose();
}
mkdirSync('output/connection-review',{recursive:true});writeFileSync('output/connection-review/model-clashes.json',JSON.stringify({date:new Date().toISOString(),results},null,2));

import { describe,expect,it } from 'vitest';
import * as THREE from 'three';
import { buildReferenceFraming } from '../src/components/referenceFraming';
import { buildReferenceStructure,cloneOppositeRunway } from '../src/components/referenceStructure';
import { createHardwareBuilder,type Hole } from '../src/components/connectionDetails';
import { referenceColumns,referenceCrossheads } from '../src/data/aiscReferenceShapes';

function model(){
 const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),edge=new THREE.LineBasicMaterial(),hardware=createHardwareBuilder(material),supports=[-3.81,3.81];
 const framing=buildReferenceFraming({supports,girderDepth:.6096,girderWidth:.254,columnHeight:3.048,roofBottom:2.8307,column:referenceColumns[0],crosshead:referenceCrossheads[0],frameStyle:'tapered',hardware,materials:{column:material,beam:material,plate:material,foundation:material,edge}});
 const building=buildReferenceStructure({supports,bayWidth:9.144,columnBottom:framing.columnBottom,floor:framing.floor,railTop:.3923,roofClearance:2.4384,columnOffset:framing.columnOffset,column:referenceColumns[0],frameStyle:'tapered',roofSlope:2,bracketTop:framing.beamTop,hardware,materials:{column:material,beam:material,plate:material,foundation:material,brace:material,crane:material,edge},cranes:[],wheelRadius:.0975});
 const far=cloneOppositeRunway(framing.group,9.144,supports,0);building.group.add(framing.group,far);building.group.updateMatrixWorld(true);return{...building,framing,hardware,far};
}
function axisHits(mesh:THREE.Object3D,position:THREE.Vector3,direction:THREE.Vector3){return new THREE.Raycaster(position.clone().addScaledVector(direction,-1),direction).intersectObject(mesh,false);}
describe('Prefab tapered moment frames',()=>{
 it('deepens continuous columns and knee rafters, raises the gable ridge, and uses C/Z secondary framing',()=>{
  const {group,framing,roofTop}=model(),column=group.getObjectByName('column-S1')!;
  expect(column.userData.aiscShape).toBeUndefined();expect(column.userData.tapered).toBe(true);
  const profile=column.userData.profile;expect(profile.at(-1).upper-profile.at(-1).lower).toBeGreaterThan(2*(profile[0].upper-profile[0].lower));
  const rafter=group.getObjectByName('portal-rafter-1-1')!;expect(rafter.userData.profile[0].upper-rafter.userData.profile[0].lower).toBeCloseTo(.8);expect(rafter.userData.profile.at(-1).upper-rafter.userData.profile.at(-1).lower).toBeCloseTo(.35);
  expect(roofTop).toBeGreaterThan(framing.columnTop+.8);expect(group.getObjectByName('purlin-1-1')!.userData.coldFormed).toBe('Z');expect(group.getObjectByName('wall-girt-1-1-1')!.userData.coldFormed).toBe('C');
  expect(group.getObjectByName('roof-brace-1-2-A')).toBeDefined();expect(group.getObjectByName('B-S1-ridge-plate-1')).toBeDefined();expect(group.getObjectByName('roof-beam-1')).toBeUndefined();
 });
 it('aligns all knee and ridge holes with fasteners on both sides of each frame',()=>{
  const {group}=model();
  for(const side of [1,2])for(const station of [1,2]){
   const plate=group.getObjectByName(`B${side}-S${station}-knee-end-plate`)!,column=group.getObjectByName(`${side===2?'F-':''}column-S${station}`)!,direction=new THREE.Vector3(0,0,side===1?1:-1);
   const flanges=column.children.filter(p=>p.name.includes('bottom-flange'));
   for(let n=1;n<=8;n++){
    const bolt=group.getObjectByName(`B${side}-S${station}-KB-${n}`)!,position=bolt.getWorldPosition(new THREE.Vector3());
    expect(axisHits(plate,position,direction)).toHaveLength(0);
    for(const flange of flanges)expect(axisHits(flange,position,direction)).toHaveLength(0);
   }
   // Confirm these ray checks do not merely miss the entire plate.
   const center=plate.getWorldPosition(new THREE.Vector3());expect(axisHits(plate,center,direction).length).toBeGreaterThan(0);
  }
  for(const station of [1,2])for(let n=1;n<=8;n++){
   const bolt=group.getObjectByName(`B-S${station}-RP-${n}`)!,position=bolt.getWorldPosition(new THREE.Vector3());
   for(const sign of [-1,1])expect(axisHits(group.getObjectByName(`B-S${station}-ridge-plate-${sign}`)!,position,new THREE.Vector3(0,0,1))).toHaveLength(0);
  }
  for(const side of [1,2])for(const station of [1,2])for(const level of [1,2])for(let n=1;n<=4;n++){
   const bolt=group.getObjectByName(`B${side}-S${station}-G${level}-bolt-${n}`)!,position=bolt.getWorldPosition(new THREE.Vector3()),axis=new THREE.Vector3(0,1,0).applyQuaternion(bolt.getWorldQuaternion(new THREE.Quaternion()));
   const column=group.getObjectByName(`${side===2?'F-':''}column-S${station}`)!,flanges=column.children.filter(p=>p.name.includes('top-flange'));
   const tangent=new THREE.Vector3(1,0,0),across=new THREE.Vector3().crossVectors(axis,tangent).normalize();
   for(let sample=0;sample<8;sample++){
    const angle=sample*Math.PI/4,p=position.clone().addScaledVector(tangent,Math.cos(angle)*.01905/2).addScaledVector(across,Math.sin(angle)*.01905/2);
    for(const flange of flanges)expect(axisHits(flange,p,axis)).toHaveLength(0);
   }
  }
 });
 it('retains actual drilled plate holes suitable for highlighting, rather than surface-only marks',()=>{
  const {group}=model();let count=0;
  group.traverse(object=>{
   const mesh=object as THREE.Mesh,holes=mesh.geometry?.userData.plateHoles as Hole[]|undefined;
   if(!holes?.length)return;count+=holes.length;
   // Rim coordinates are local to the drilled mesh, including rotated/mirrored plates.
   for(const h of holes){const p=new THREE.Vector3(h.x,0,h.z).applyMatrix4(mesh.matrixWorld),normal=new THREE.Vector3(0,1,0).transformDirection(mesh.matrixWorld);expect(axisHits(mesh,p,normal)).toHaveLength(0);}
  });
  expect(count).toBeGreaterThan(150);
 });
});

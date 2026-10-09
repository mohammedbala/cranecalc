import * as THREE from 'three';
import type {BracketInput} from '../engine/bracketInputs';
import {existingBracketProfile,existingBracketLabel} from '../engine/bracketProfiles';
import {boltProperties} from '../engine/connectionStrength';
import {horizontalPlateGeometry,type HardwareBuilder,type PartInfo} from './connectionDetails';

/** Survey-driven built-up stub, new bolted spreader, and existing column
 * continuity plates. Unknown original weld sizes are intentionally not drawn. */
export function buildExistingBrackets(b:BracketInput,supports:number[],seatTop:number,steel:THREE.Material,edge:THREE.LineBasicMaterial,bearing?:{width:number;length:number;thickness:number},hardware?:HardwareBuilder){
 const e=existingBracketProfile(b),group=new THREE.Group();group.name='existing-column-brackets';group.userData.bracketArrangement=b.arrangement;
 const mm=.001,face=b.reach*mm,tip=face-e.projection*mm,mid=(face+tip)/2,newMid=face-b.seatProjection*mm/2,top=seatTop-b.seatThickness*mm;
 const oldSteel=steel.clone();if('color' in oldSteel)(oldSteel as THREE.MeshStandardMaterial).color.set('#835e50');
 const adapter=new THREE.Group();adapter.name='new-bolted-spreader-seats';adapter.userData.designedBracket=true;group.add(adapter);
 const add=(parent:THREE.Group,geometry:THREE.BufferGeometry,id:string,family:string,x:number,y:number,z:number,station:number,existing=true)=>{
  const mesh=new THREE.Mesh(geometry,existing?oldSteel:steel);mesh.name=id;mesh.position.set(x,y,z);mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),edge));
  mesh.userData.existingSteel=existing;mesh.userData.part={id,family,support:{x:station,z:face},description:existing?`${existingBracketLabel(b)}. Existing steel, modeled from the selected section and survey inputs. Original welds and resistance require the documented support assessment.`:'New bolted spreader seat. Gravity bearing and plate checks in the worksheet; bolt attachment assessment and independent locating/sliding details are required. See S-05.'} satisfies PartInfo;parent.add(mesh);return mesh;
 };
 supports.forEach((x,i)=>{
  const id=`EB-S${i+1}`,holes=[-1,1].flatMap(sx=>[-1,1].map(sz=>({x:sx*e.bolts.pitch/2000,z:sz*e.bolts.gauge/2000-mid,diameter:boltProperties(e.bolts.grade,e.bolts.diameter).hole*mm})));
  add(adapter,horizontalPlateGeometry(b.seatLength*mm,b.seatProjection*mm,b.seatThickness*mm,holes.map(h=>({...h,z:h.z+mid-newMid}))),`${id}-new-seat`,'New bolted spreader plate',x,seatTop-b.seatThickness*mm/2,newMid,x,false);
  add(group,horizontalPlateGeometry(e.width*mm,e.projection*mm,e.flangeThickness*mm,holes),`${id}-top-flange`,'Existing bracket top flange',x,top-e.flangeThickness*mm/2,mid,x);
  add(group,new THREE.BoxGeometry(e.width*mm,e.flangeThickness*mm,e.projection*mm),`${id}-bottom-flange`,'Existing bracket bottom flange',x,top-(e.depth-e.flangeThickness/2)*mm,mid,x);
  add(group,new THREE.BoxGeometry(e.webThickness*mm,(e.depth-2*e.flangeThickness)*mm,e.projection*mm),`${id}-web`,'Existing bracket web',x,top-e.depth*mm/2,mid,x);
  const outstand=(e.width-e.webThickness)*mm/2;
  for(const side of [-1,1])add(group,new THREE.BoxGeometry(outstand,(e.depth-2*e.flangeThickness)*mm,e.tipStiffenerThickness*mm),`${id}-tip-stiffener-${side}`,'Existing bracket end stiffener',x+side*(e.webThickness*mm/2+outstand/2),top-e.depth*mm/2,tip+e.tipStiffenerThickness*mm/2,x);
  // Paired plates either side of the existing column web, between its flanges.
  const c=b.receiver,w=(c.width-c.webThickness)*mm/2,depth=(c.depth-2*c.flangeThickness)*mm;
  for(const [level,y] of [top+e.continuityAbove*mm,top-e.flangeThickness*mm/2,top-(e.depth-e.flangeThickness/2)*mm].entries())for(const side of [-1,1])add(group,new THREE.BoxGeometry(w,e.continuityThickness*mm,depth),`${id}-continuity-${level}-${side}`,'Existing column continuity plate',x+side*(c.webThickness*mm/2+w/2),y,face+c.depth*mm/2,x);
  if(bearing)add(adapter,new THREE.BoxGeometry(bearing.length,bearing.thickness,bearing.width),`${id}-bearing`,'Runway bearing plate',x,seatTop+bearing.thickness/2,0,x,false);
  if(hardware)for(const [j,h] of holes.entries())hardware.bolt(adapter,{id:`${id}-seat-bolt-${j+1}`,family:'New spreader retaining bolt',description:`${e.bolts.grade} bolt through new spreader and existing top flange. Original hole positions and attachment design require verification; not a rated girder hold-down.`,diameter:e.bolts.diameter*mm,grip:(b.seatThickness+e.flangeThickness)*mm,support:{x,z:face}},new THREE.Vector3(x+h.x,top-e.flangeThickness*mm,mid+h.z));
 });
 return group;
}

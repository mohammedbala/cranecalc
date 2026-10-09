import * as THREE from 'three';
import type {ProjectInput} from '../engine/types';
import {topFlangeAngleData} from '../engine/angleTie';
import {alternativeTieStations} from './tieStations';
import {horizontalPlateGeometry,type HardwareBuilder,type Hole,type PartInfo} from './connectionDetails';
import {filletWeld} from './weldGeometry';

/** User Figure 14 inspired top-flange load path. Dimensions are editable
 * reference geometry; slots do not establish movement or connection capacity. */
export function topFlangeAngleColumnHoles(p:ProjectInput){
 const a=topFlangeAngleData(p);if(!a)return [];
 return alternativeTieStations(p,a.endSetback).flatMap(at=>(a.paired?[-1,1]:[-1]).flatMap(side=>[-1,1].map(sx=>({station:at.station,x:at.x+sx*a.boltPitch/2000,y:(a.top+(side>0?a.plateThickness:0)+side*a.boltLevel)/1000,diameter:a.holeDiameter/1000}))));
}
export function buildTopFlangeAngles(p:ProjectInput,columnFace:number,steel:THREE.Material,edge:THREE.LineBasicMaterial,weld:THREE.Material,hardware?:HardwareBuilder){
 const group=new THREE.Group(),a=topFlangeAngleData(p);group.name='slotted-top-flange-angle-tiebacks';group.userData.tieArrangement=p.details?.brace.arrangement;
 if(!a?.shape)return group;
 const mm=.001,w=a.width*mm,t=a.thickness*mm,pt=a.plateThickness*mm,shim=a.shimThickness*mm,top=a.top*mm,hd=a.holeDiameter*mm;
 const face=columnFace,back=face-shim,plateEnd=back-t-.00635,zBolt=back-a.leg*.65*mm,start=(a.edge-a.lap)*mm;
 const note='Top-flange tie reference inspired by supplied Figure 14. Horizontal slots run along the runway (X). Bolt bearing/slip, angle prying, plate, weld, column, movement and fatigue design remain unverified. No lower-flange restraint is provided by this option.';
 const add=(geo:THREE.BufferGeometry,id:string,family:string,at:THREE.Vector3,station:number)=>{
  const mesh=new THREE.Mesh(geo,steel);mesh.name=id;mesh.position.copy(at);mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo),edge));
  mesh.userData.part={id,family,description:`${a.shape!.name}. ${note}`,support:{x:station,z:0}} satisfies PartInfo;group.add(mesh);return mesh;
 };
 const vertical=(id:string,family:string,x:number,y:number,z:number,width:number,height:number,thickness:number,holes:Hole[],station:number)=>{
  const mesh=add(horizontalPlateGeometry(width,height,thickness,holes),id,family,new THREE.Vector3(x,y,z),station);mesh.rotation.x=Math.PI/2;return mesh;
 };
 for(const at of alternativeTieStations(p,a.endSetback)){
  const id=`${at.id}-top-${p.details!.brace.arrangement}`,columnHoles=[-1,1].map(sx=>({x:sx*a.boltPitch/2000,z:0,diameter:hd,slotLength:a.slotLength*mm,slotAxis:'x' as const}));
  const bolts=[-1,1].map(sx=>({x:sx*a.boltPitch/2000,z:zBolt-(start+plateEnd)/2,diameter:hd}));
  add(horizontalPlateGeometry(w,plateEnd-start,pt,bolts),`${id}-tie-plate`,p.section.kind==='cap'?'Top cap tie plate (reference)':'Top flange tie plate (reference)',new THREE.Vector3(at.x,top+pt/2,(start+plateEnd)/2),at.station);
  for(const sx of [-1,1])filletWeld(group,`${id}-flange-weld-${sx}`,new THREE.Vector3(at.x+sx*w/2,top,start),new THREE.Vector3(at.x+sx*w/2,top,a.edge*mm),new THREE.Vector3(sx,0,0),new THREE.Vector3(0,1,0),a.weldSize*mm,weld,'Tie plate to top flange/cap: reference lap weld, subject to local load transfer and fatigue design.',{x:at.station,z:0});
  for(const side of a.paired?[-1,1]:[-1]){
   const yBase=top+(side>0?pt:0),yBolt=yBase+side*a.boltLevel*mm,yCenter=yBase+side*a.depth*mm/2;
   const holes=columnHoles.map(h=>({...h,z:-(yBolt-yCenter)}));
   // The two touching legs form the actual L section, without double volume at the heel.
   vertical(`${id}-angle-${side}-vertical`,'Slotted column angle leg (reference)',at.x,yCenter,back-t/2,w,a.depth*mm,t,holes,at.station);
   const legWidth=a.leg*mm-t,legCenter=back-t-legWidth/2;
   add(horizontalPlateGeometry(w,legWidth,t,[-1,1].map(sx=>({x:sx*a.boltPitch/2000,z:zBolt-legCenter,diameter:hd}))),`${id}-angle-${side}-horizontal`,'Column angle horizontal leg (reference)',new THREE.Vector3(at.x,yBase+side*t/2,legCenter),at.station);
   if(shim>0)vertical(`${id}-shim-${side}`,'Column fit-up shim pack (reference)',at.x,yCenter,face-shim/2,w,a.depth*mm,shim,holes,at.station);
   for(const sx of [-1,1]){
    const bx=at.x+sx*a.boltPitch/2000,washerT=a.washerThickness*mm;
    vertical(`${id}-slot-washer-${side}-${sx}`,'Slotted-angle plate washer (reference)',bx,yBolt,back-t-washerT/2,a.washerLength*mm,a.washerWidth*mm,washerT,[{x:0,z:0,diameter:hd}],at.station);
    hardware?.bolt(group,{id:`${id}-column-bolt-${side}-${sx}`,family:'Top tie column bolt',description:note+' Round hole in existing column; slotted angle and shims; separate plate washer spans slot.',diameter:a.boltDiameter*mm,grip:(p.details!.bracket!.receiver.flangeThickness+a.shimThickness+a.thickness+a.washerThickness)*mm,support:{x:at.station,z:0}},new THREE.Vector3(bx,yBolt,face+p.details!.bracket!.receiver.flangeThickness*mm),new THREE.Vector3(0,0,-1));
   }
  }
  for(const sx of [-1,1])hardware?.bolt(group,{id:`${id}-lap-bolt-${sx}`,family:'Top tie plate lap bolt',description:note+' Round-hole lap through the horizontal angle leg and tie plate.',diameter:a.boltDiameter*mm,grip:pt+t*(a.paired?2:1),support:{x:at.station,z:0}},new THREE.Vector3(at.x+sx*a.boltPitch/2000,top-t,zBolt));
 }
 return group;
}

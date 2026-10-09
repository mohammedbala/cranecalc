import * as THREE from 'three';
import type {ProjectInput} from '../engine/types';
import {alternativeTieStations} from './tieStations';
export {alternativeTieStations} from './tieStations';
import {isAngleTie} from '../engine/angleTie';
import {buildAngleTies} from './angleTieGeometry';
import {referenceTie,tieArrangement} from '../engine/connectionOptions';
import {horizontalPlateGeometry,type PartInfo,type HardwareBuilder} from './connectionDetails';
import {filletWeld} from './weldGeometry';

/** Generic family preview. Pins/eyes are NOT manufacturer models or rated
 * assemblies, and are excluded from the current installed-bolt clearance audit. */
export function buildAlternativeTies(p:ProjectInput,columnFace:number,steel:THREE.Material,edge:THREE.LineBasicMaterial,weldMaterial:THREE.Material=steel,hardware?:HardwareBuilder){
 const group=new THREE.Group(),d=p.details,kind=tieArrangement(d);group.name='reference-tieback-arrangements';group.userData.tieArrangement=kind;
 if(!d||kind==='paired-bars')return group;
 if(isAngleTie(kind))return buildAngleTies(p,columnFace,steel,edge,weldMaterial,hardware);
 const r=referenceTie(d),mm=.001,b=p.section,depth=b.d*mm,tf=b.tf*mm,bf=b.bf*mm,tw=b.tw*mm;
 const pinD=r.pinDiameter*mm,eyeD=r.eyeDiameter*mm,eyeT=r.eyeThickness*mm,fork=r.forkThickness*mm;
 const rise=kind==='flexible-plate'?r.plateWidth*mm:eyeD+2*.0127;
 const capDrop=b.kind==='cap'?(b.capDepth-b.capTw-b.tf)*mm:0;
 const upper=depth/2-tf-Math.max(capDrop,0)-rise/2-.0254,lower=-depth/2+tf+rise/2+.0254;
 const za=bf/2+r.pinSetback*mm,zb=columnFace-r.pinSetback*mm;
 const pinMaterial=new THREE.MeshStandardMaterial({color:0xa4afbb,metalness:.7,roughness:.35}),bearingMaterial=new THREE.MeshStandardMaterial({color:0xad8857,metalness:.55,roughness:.4});
 const note='Generic reference tieback. No supplier rating or verified stiffness, articulation, fatigue, pin, clevis or attachment design. Report generation is blocked.';
 const add=(geo:THREE.BufferGeometry,id:string,family:string,at:THREE.Vector3,station:number,material=steel)=>{
  const mesh=new THREE.Mesh(geo,material);mesh.position.copy(at);mesh.name=id;mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo),edge));mesh.userData.part={id,family,description:note+(/column|receiver/i.test(family)?' Field attachment to existing column; weld size and extent require connection design.':''),support:{x:station,z:0}} satisfies PartInfo;group.add(mesh);return mesh;
 };
 const plate=(id:string,family:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,station:number)=>add(new THREE.BoxGeometry(sx,sy,sz),id,family,new THREE.Vector3(x,y,z),station);
 // A vertical Y/Z plate, thickness in X, with a genuine through-hole.
 const drilled=(id:string,family:string,x:number,y:number,z:number,l:number,h:number,t:number,hole:number,station:number,material=steel)=>{
  const geo=horizontalPlateGeometry(l,h,t,[{x:0,z:0,diameter:hole}]);
  const mesh=add(geo,id,family,new THREE.Vector3(x,y,z),station,material);
  // Rotate the part, keeping hole metadata in the geometry's local X/Z plane
  // so the viewer's hole-rim overlay follows the same through-hole.
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0)));
  return mesh;
 };
 const ring=(id:string,family:string,x:number,y:number,z:number,outer:number,inner:number,thickness:number,station:number,material=steel)=>{
  const shape=new THREE.Shape();shape.absarc(0,0,outer/2,0,2*Math.PI,false);const hole=new THREE.Path();hole.absarc(0,0,inner/2,0,2*Math.PI,true);shape.holes.push(hole);
  const geo=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:24});geo.translate(0,0,-thickness/2);geo.rotateY(Math.PI/2);
  return add(geo,id,family,new THREE.Vector3(x,y,z),station,material);
 };
 const receivers=new Map<string,{station:number;y:number;points:number[]}>();
 for(const at of alternativeTieStations(p))for(const [flange,y] of [['top',upper],['bottom',lower]] as const){
  const sign=flange==='top'?1:-1,id=`${at.id}-${flange}-${kind}`,xc=kind==='paired-links'?at.station+(at.x<at.station?-1:1)*r.linkSpacing*mm/2:at.x;
  const saddleLength=Math.max(kind==='flexible-plate'?r.plateThickness*mm+.0381:eyeT+2*fork+.0254,(d.brace.flangeAttachment?.saddleLength??127)*mm),rootStart=tw/2+.0254,rootEnd=bf/2;
  plate(`${id}-saddle`,'Flange attachment saddle (reference)',at.x,sign*(depth/2-tf-.00635),(rootStart+rootEnd)/2,saddleLength,.0127,rootEnd-rootStart,at.station);
  const rootHeight=Math.abs(sign*(depth/2-tf-.0127)-y)+rise/2;
  const lap=.0381,plateT=r.plateThickness*mm,rootT=.01905,rootX=kind==='flexible-plate'?at.x-(plateT+rootT)/2:at.x;
  const rootTip=kind==='flexible-plate'?za+lap:za-eyeD*.675-.0127;
  plate(`${id}-root`,'Flange attachment gusset (reference)',rootX,sign*(depth/2-tf-.0127)-sign*rootHeight/2,(rootStart+rootTip)/2,kind==='flexible-plate'?rootT:eyeT,rootHeight,rootTip-rootStart,at.station);
  if(kind==='flexible-plate'){
   plate(`${id}-plate`,'Flexible plate tieback (reference)',at.x,y,(za+zb)/2,r.plateThickness*mm,r.plateWidth*mm,zb-za,at.station);
   plate(`${id}-column-root`,'Flexible-plate receiver (reference)',rootX,y,(zb-lap+columnFace)/2,rootT,r.plateWidth*mm+2*d.brace.connection.weldSize*mm,columnFace-zb+lap,at.station);
   for(const z of [za,zb-lap])for(const side of [-1,1])filletWeld(group,`${id}-weld-${z}-${side}`,new THREE.Vector3(at.x-plateT/2,y+side*rise/2,z),new THREE.Vector3(at.x-plateT/2,y+side*rise/2,z+lap),new THREE.Vector3(1,0,0),new THREE.Vector3(0,side,0),d.brace.connection.weldSize*mm,weldMaterial,'Concept lap attachment weld; imposed movement and fatigue require project design.');
   continue;
  }
  const start=new THREE.Vector3(at.x,y,za),end=new THREE.Vector3(xc,y,zb),axis=end.clone().sub(start),length=axis.length();
  plate(`${id}-fork-back`,'Girder clevis back plate (reference)',at.x,y,za-eyeD*.675-.00635,eyeT+2*fork+.0254,eyeD*1.25,.0127,at.station);
  plate(`${id}-column-fork-back`,'Column clevis back plate (reference)',xc,y,zb+eyeD*.675+.00635,eyeT+2*fork+.0254,eyeD*1.25,.0127,at.station);
  const link=new THREE.CylinderGeometry(r.linkDiameter*mm/2,r.linkDiameter*mm/2,Math.max(.001,length-eyeD),24);link.rotateX(Math.PI/2);
  const body=add(link,`${id}-body`,'Articulated link body (reference)',start.clone().add(end).multiplyScalar(.5),at.station);body.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),axis.normalize());
  for(const [endName,point] of [['girder',start],['column',end]] as const){
   ring(`${id}-${endName}-eye`,'Bearing eye (reference)',point.x,y,point.z,eyeD,pinD*1.5,eyeT,at.station);
   ring(`${id}-${endName}-bearing`,'Spherical bearing envelope (reference)',point.x,y,point.z,pinD*1.5,pinD,eyeT*.85,at.station,bearingMaterial);
   for(const side of [-1,1])drilled(`${id}-${endName}-clevis-${side}`,'Drilled clevis plate (reference)',point.x+side*(eyeT/2+.0127+fork/2),y,point.z,eyeD*1.35,eyeD*1.25,fork,pinD+.0015,at.station);
   const grip=eyeT+2*fork+.0254,geo=new THREE.CylinderGeometry(pinD/2,pinD/2,grip+.0127,24);geo.rotateZ(Math.PI/2);
   add(geo,`${id}-${endName}-pin`,'Clevis pin (reference)',new THREE.Vector3(point.x,y,point.z),at.station,pinMaterial);
   for(const side of [-1,1])ring(`${id}-${endName}-retainer-${side}`,'Pin retaining collar (reference)',point.x+side*(grip/2+.004),y,point.z,pinD*1.45,pinD,.006,at.station,pinMaterial);
  }
  const key=`${at.station}-${flange}`,existing=receivers.get(key)??{station:at.station,y,points:[]};existing.points.push(xc);receivers.set(key,existing);
 }
 for(const [key,v] of receivers){
  const left=Math.min(...v.points)-eyeT/2-fork-.0254,right=Math.max(...v.points)+eyeT/2+fork+.0254;
  plate(`tie-shared-${key}-column-plate`,kind==='paired-links'?'Shared column tieback plate (reference)':'Column tieback plate (reference)',(left+right)/2,v.y,columnFace-.009525,right-left,eyeD*1.5,.01905,v.station);
  const rootStart=zb+eyeD*.675+.0127,rootEnd=columnFace-.01905;
  for(const [i,x] of v.points.entries())plate(`tie-shared-${key}-gusset-${i}`,'Column clevis root (reference)',x,v.y,(rootStart+rootEnd)/2,eyeT,eyeD,Math.max(.001,rootEnd-rootStart),v.station);
 }
 if(!group.children.length||kind==='flexible-plate'){pinMaterial.dispose();bearingMaterial.dispose();}
 return group;
}

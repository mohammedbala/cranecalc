import * as THREE from 'three';
import type {ProjectInput} from '../engine/types';
import type {PartInfo,HardwareBuilder} from './connectionDetails';
import {buildTopFlangeAngles} from './topFlangeAngleGeometry';
import {angleTie} from '../engine/angleTie';
import {alternativeTieStations} from './tieStations';
import {filletWeld} from './weldGeometry';

/** L-shaped solids with no overlap at the heel; nominal fillets omitted. */
export function angleMemberGeometry(vertical:number,outstanding:number,thickness:number,length:number,side=1){
 const s=new THREE.Shape();s.moveTo(0,-vertical/2);s.lineTo(side*outstanding,-vertical/2);s.lineTo(side*outstanding,-vertical/2+thickness);s.lineTo(side*thickness,-vertical/2+thickness);s.lineTo(side*thickness,vertical/2);s.lineTo(0,vertical/2);s.closePath();
 return new THREE.ExtrudeGeometry(s,{depth:length,bevelEnabled:false,curveSegments:1});
}
export function buildAngleTies(p:ProjectInput,columnFace:number,steel:THREE.Material,edge:THREE.LineBasicMaterial,weldMaterial:THREE.Material,hardware?:HardwareBuilder){
 const group=new THREE.Group();group.name='reference-angle-tiebacks';group.userData.tieArrangement=p.details?.brace.arrangement;
 const d=p.details!;if(!d)return group;
 const a=angleTie(d),mm=.001,b=p.section,depth=b.d*mm,tf=b.tf*mm,bf=b.bf*mm,tw=b.tw*mm;
 if(a.connectionStyle==='top-flange-angle')return buildTopFlangeAngles(p,columnFace,steel,edge,weldMaterial,hardware);
 const rise=a.rise*mm,capDrop=b.kind==='cap'?Math.max(0,b.capDepth-b.capTw-b.tf)*mm:0;
 const upper=depth/2-tf-capDrop-rise/2-.0254,lower=-depth/2+tf+rise/2+.0254;
 const start=bf/2+a.setback*mm,finish=columnFace-a.setback*mm,lap=a.lap*mm,g=a.gussetThickness*mm,h=a.depth*mm;
 if(!a.shape||finish<=start)return group;
 const note='Custom angle tieback reference. No assigned member, weld, fatigue, stiffness or movement capacity. Nominal catalogue geometry omits rolled fillets.';
 const add=(geometry:THREE.BufferGeometry,id:string,family:string,x:number,y:number,z:number,station:number)=>{
  const mesh=new THREE.Mesh(geometry,steel);mesh.name=id;mesh.position.set(x,y,z);mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),edge));
  mesh.userData.part={id,family,description:`${a.paired?'2 - ':''}${a.shape!.name}. ${note}${/Column/.test(family)?' Field attachment to existing column; root weld size and extent require design.':''}`,support:{x:station,z:0}} satisfies PartInfo;group.add(mesh);return mesh;
 };
 for(const at of alternativeTieStations(p,a.endSetback))for(const [flange,y] of [['top',upper],['bottom',lower]] as const){
  const id=`${at.id}-${flange}-${d.brace.arrangement}`,sign=flange==='top'?1:-1,rootStart=tw/2+.0254,rootTip=start+lap;
  const faceY=sign*(depth/2-tf-.0127),rootHeight=Math.abs(faceY-y)+rise/2;
  add(new THREE.BoxGeometry(a.saddleLength*mm,.0127,bf/2-rootStart),`${id}-saddle`,'Angle flange saddle (reference)',at.x,sign*(depth/2-tf-.00635),(rootStart+bf/2)/2,at.station);
  // Drop inside the flange edge before extending out beneath a cap channel.
  // A constant-height gusset would cut through a downturned cap leg.
  add(new THREE.BoxGeometry(g,rootHeight,bf/2-rootStart),`${id}-girder-gusset`,'Angle girder gusset (reference)',at.x,faceY-sign*rootHeight/2,(rootStart+bf/2)/2,at.station);
  add(new THREE.BoxGeometry(g,rise,rootTip-bf/2),`${id}-girder-lap`,'Angle gusset lap (reference)',at.x,y,(bf/2+rootTip)/2,at.station);
  add(new THREE.BoxGeometry(g,rise,columnFace-finish+lap),`${id}-column-gusset`,'Column angle receiver (reference)',at.x,y,(finish-lap+columnFace)/2,at.station);
  for(const side of a.paired?[-1,1]:[1]){
   add(angleMemberGeometry(h,a.leg*mm,a.thickness*mm,finish-start,side),`${id}-angle-${side}`,'L-section tieback (reference)',at.x+side*g/2,y,start,at.station);
   for(const [end,z] of [['girder',start],['column',finish-lap]] as const)for(const edgeSign of [-1,1]){
    filletWeld(group,`${id}-${side}-${end}-lap-${edgeSign}`,new THREE.Vector3(at.x+side*g/2,y+edgeSign*h/2,z),new THREE.Vector3(at.x+side*g/2,y+edgeSign*h/2,z+lap),new THREE.Vector3(side,0,0),new THREE.Vector3(0,edgeSign,0),a.weldSize*mm,weldMaterial,'Angle-to-gusset lap weld, reference size only. Strength and fatigue require design; column root weld remains unsized.',{x:at.station,z:0});
   }
  }
 }
 return group;
}

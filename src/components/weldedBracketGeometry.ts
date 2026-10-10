import {isExistingBracketType,existingBracketProfile} from '../engine/bracketProfiles';
import * as THREE from 'three';
import type {BracketInput} from '../engine/bracketInputs';
import type {PartInfo} from './connectionDetails';
import {aiscShapeByName} from '../data/aiscSections';
import {bracketArrangement} from '../engine/connectionOptions';
import {filletWeld} from './weldGeometry';
import {buildExistingBrackets} from './existingBracketGeometry';
import type {HardwareBuilder} from './connectionDetails';
export function buildWeldedBrackets(b:BracketInput,supports:number[],seatTop:number,steel:THREE.Material,edge:THREE.LineBasicMaterial,bearing?:{width:number;length:number;thickness:number},weldMaterial:THREE.Material=steel,hardware?:HardwareBuilder){
 if(isExistingBracketType(bracketArrangement(b)))return buildExistingBrackets(b,supports,seatTop,steel,edge,bearing,hardware);
 const group=new THREE.Group(),kind=bracketArrangement(b);group.name='designed-welded-column-brackets';group.userData.designedBracket=kind==='twin-rib';group.userData.bracketArrangement=kind;
 const mm=.001,face=b.reach*mm,tip=face-b.seatProjection*mm,top=seatTop-b.seatThickness*mm;
 const add=(geometry:THREE.BufferGeometry,id:string,family:string,x:number,y:number,z:number,station:number)=>{
  const isWeld=family.includes('fillet'),mesh=new THREE.Mesh(geometry,isWeld?weldMaterial:steel);mesh.name=id;mesh.position.set(x,y,z);mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),edge));
  mesh.userData.part={id,family,description:kind==='twin-rib'?'Project bracket geometry; see Column bracket checks and the bracket details. Receiving building global capacity is separate.':'Reference bracket arrangement. Geometry and welds shown to the entered dimensions; connection strength, stability and fatigue require a new project model.',support:{x:station,z:face},...(isWeld?{weld:{kind:'fillet',location:family.includes('column')?'field':'shop',existingSteel:family.includes('column'),size:(family.includes('column')?b.rootWeld:b.seatWeld)/1000,length:(family.includes('column')?b.ribDepth:b.seatProjection)/1000}}:{})} satisfies PartInfo;group.add(mesh);return mesh;
 };
 supports.forEach((x,i)=>{
  add(new THREE.BoxGeometry(b.seatLength*mm,b.seatThickness*mm,b.seatProjection*mm),`WB-S${i+1}-seat`,kind==='twin-rib'?'Designed bracket seat':'Bracket seat (reference)',x,seatTop-b.seatThickness*mm/2,(face+tip)/2,x);
  if(bearing)add(new THREE.BoxGeometry(bearing.length,bearing.thickness,bearing.width),`WB-S${i+1}-bearing`,'Girder bearing plate',x,seatTop+bearing.thickness/2,0,x);
  if(kind==='rolled-corbel'){
   const shape=aiscShapeByName(b.corbelShape??'W12X40')!;
   if(!shape)return;
   const d=shape.d*.0254,bf=shape.bf*.0254,tf=shape.tf*.0254,tw=shape.tw*.0254,L=b.seatProjection*mm;
   for(const [label,y] of [['top',top-tf/2],['bottom',top-d+tf/2]] as const)add(new THREE.BoxGeometry(bf,tf,L),`WB-S${i+1}-corbel-${label}`,`${shape.name} corbel flange (reference)`,x,y,(face+tip)/2,x);
   add(new THREE.BoxGeometry(tw,d-2*tf,L),`WB-S${i+1}-corbel-web`,`${shape.name} corbel web (reference)`,x,top-d/2,(face+tip)/2,x);
   for(const sign of [-1,1]){
    filletWeld(group,`WB-S${i+1}-corbel-web-root-${sign}`,new THREE.Vector3(x+sign*tw/2,top-tf,face),new THREE.Vector3(x+sign*tw/2,top-d+tf,face),new THREE.Vector3(sign,0,0),new THREE.Vector3(0,0,-1),b.rootWeld*mm,weldMaterial,'Field weld corbel to existing column (reference; weld-group design required).',{x,z:face},{location:'field',existingSteel:true});
    filletWeld(group,`WB-S${i+1}-corbel-seat-${sign}`,new THREE.Vector3(x+sign*bf/2,top,tip),new THREE.Vector3(x+sign*bf/2,top,face),new THREE.Vector3(sign,0,0),new THREE.Vector3(0,-1,0),b.seatWeld*mm,weldMaterial,'Shop weld seat to corbel (reference; plate and fatigue design required).',{x,z:face},{location:'shop'});
   }
   for(const [at,sy] of [[top-tf,-1],[top-d+tf,1]] as const)for(const side of [-1,1])filletWeld(group,`WB-S${i+1}-corbel-flange-root-${sy}-${side}`,new THREE.Vector3(x+side*tw/2,at,face),new THREE.Vector3(x+side*bf/2,at,face),new THREE.Vector3(0,sy,0),new THREE.Vector3(0,0,-1),b.rootWeld*mm,weldMaterial,'Field weld corbel flange to existing column (reference; no assigned capacity).',{x,z:face},{location:'field',existingSteel:true});
   return;
  }
  for(const side of [-1,1]){
   const rx=x+side*b.ribSpacing*mm/2;
   if(kind==='haunched-seat'){
    const profile=new THREE.Shape();profile.moveTo(0,0);profile.lineTo(b.seatProjection*mm,0);profile.lineTo(b.seatProjection*mm,-b.ribDepth*mm);profile.lineTo(0,-(b.tipDepth??b.ribDepth/4)*mm);profile.closePath();
    const geo=new THREE.ExtrudeGeometry(profile,{depth:b.ribThickness*mm,bevelEnabled:false});geo.rotateY(-Math.PI/2);geo.translate(b.ribThickness*mm/2,0,0);
    add(geo,`WB-S${i+1}-rib-${side}`,'Tapered bracket rib (reference)',rx,top,tip,x);
   }else add(new THREE.BoxGeometry(b.ribThickness*mm,b.ribDepth*mm,b.seatProjection*mm),`WB-S${i+1}-rib-${side}`,'Designed rectangular bracket rib',rx,top-b.ribDepth*mm/2,(face+tip)/2,x);
   for(const sign of [-1,1]){
    const rw=b.rootWeld*mm,sw=b.seatWeld*mm;
    const root=new THREE.Shape();root.moveTo(0,0);root.lineTo(sign*rw,0);root.lineTo(0,-rw);root.closePath();
    const rg=new THREE.ExtrudeGeometry(root,{depth:b.ribDepth*mm,bevelEnabled:false});rg.rotateX(Math.PI/2);
    add(rg,`WB-S${i+1}-root-${side}-${sign}`,'Continuous rib-to-column fillet',rx+sign*b.ribThickness*mm/2,top,face,x);
    const seat=new THREE.Shape();seat.moveTo(0,0);seat.lineTo(sign*sw,0);seat.lineTo(0,-sw);seat.closePath();
    add(new THREE.ExtrudeGeometry(seat,{depth:b.seatProjection*mm,bevelEnabled:false}),`WB-S${i+1}-seat-weld-${side}-${sign}`,'Continuous seat-to-rib fillet',rx+sign*b.ribThickness*mm/2,top,tip,x);
   }
  }
 });
 return group;
}

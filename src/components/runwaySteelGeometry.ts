import * as THREE from 'three';
import type {ProjectInput} from '../engine/types';
import {girderSegments} from '../engine/simpleSupports';
import {horizontalPlateGeometry,type Hole,type PartInfo} from './connectionDetails';
import {filletWeld} from './weldGeometry';
export function buildRunwaySteel(p:ProjectInput,materials:{steel:THREE.Material;cap:THREE.Material;rail:THREE.Material;weld:THREE.Material;edge:THREE.LineBasicMaterial},railHoles:Hole[]=[],seatHoles:Hole[]=[]){
 const group=new THREE.Group();group.name='runway-members';const s=p.section,L=p.spans.reduce((a,b)=>a+b,0)/1000,d=s.d/1000,bf=s.bf/1000,tf=s.tf/1000,tw=s.tw/1000,railBase=d/2+(s.kind==='cap'?s.capTw/1000:0),railZ=p.railEccentricity/1000;
 const add=(id:string,family:string,g:THREE.BufferGeometry,x:number,y:number,z:number,material:THREE.Material)=>{const mesh=new THREE.Mesh(g,material);mesh.name=id;mesh.position.set(x,y,z);mesh.userData.part={id,family,description:'Entered runway section geometry; rail section remains the supplied idealization.'} satisfies PartInfo;mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g),materials.edge));group.add(mesh);return mesh;};
 for(const [i,member] of girderSegments(p).entries()){
  const l=(member.end-member.start)/1000,x=(member.start+member.end)/2000-L/2,id=`girder-${i+1}`;
  const flange=(name:string,t:number,w:number,y:number,material:THREE.Material,holes:Hole[])=>add(name,'Runway flange',horizontalPlateGeometry(l,w,t,holes.filter(h=>h.x>x-l/2+.012&&h.x<x+l/2-.012).map(h=>({...h,x:h.x-x}))),x,y,0,material);
  flange(`${id}-top-flange`,tf,bf,d/2-tf/2,materials.steel,s.kind==='cap'?[]:railHoles);flange(`${id}-bottom-flange`,tf,bf,-d/2+tf/2,materials.steel,seatHoles);
  add(`${id}-web`,'Runway web',new THREE.BoxGeometry(l,d-2*tf,tw),x,0,0,materials.steel);
  if(s.kind==='cap'){
   flange(`${id}-cap-web`,s.capTw/1000,s.capWidth/1000,d/2+s.capTw/2000,materials.cap,railHoles);
   for(const side of [-1,1]){
    add(`${id}-cap-flange-${side}`,'Cap channel flange',new THREE.BoxGeometry(l,(s.capDepth-s.capTw)/1000,s.capTf/1000),x,d/2-(s.capDepth-s.capTw)/2000,side*(s.capWidth-s.capTf)/2000,materials.cap);
    if(p.capDesign)filletWeld(group,`${id}-cap-weld-${side}`,new THREE.Vector3(x-l/2,d/2,side*bf/2),new THREE.Vector3(x+l/2,d/2,side*bf/2),new THREE.Vector3(0,-1,0),new THREE.Vector3(0,0,side),p.capDesign.weldSize/1000,materials.weld,'Continuous cap-to-W top-flange edge fillet. Stops at the independent girder end; entered weld leg.');
   }
  }
 }
 const r=p.details?.rail;
 if(r){const rh=p.aist!.railDepth/1000,bt=r.baseThickness/1000,ht=r.headThickness/1000;add('rail-foot','Rail foot',new THREE.BoxGeometry(L,bt,r.baseWidth/1000),0,railBase+bt/2,railZ,materials.rail);add('rail-web','Rail web',new THREE.BoxGeometry(L,rh-bt-ht,r.webThickness/1000),0,railBase+(rh+bt-ht)/2,railZ,materials.rail);add('rail-head','Rail head',new THREE.BoxGeometry(L,ht,r.headWidth/1000),0,railBase+rh-ht/2,railZ,materials.rail);}
 else{const h=Math.max(.025,p.railHeight/1000);for(const [id,y,ht,w] of [['foot',railBase+.006,.012,.09],['web',railBase+h/2,h,.025],['head',railBase+h,.025,.065]] as const)add(`rail-${id}`,'Schematic rail',new THREE.BoxGeometry(L,ht,w),0,y,railZ,materials.rail);}
 return group;
}

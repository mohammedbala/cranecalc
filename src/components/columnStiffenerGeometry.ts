import * as THREE from 'three';
import type {BracketInput} from '../engine/bracketInputs';
import type {PartInfo} from './connectionDetails';
import {bracketStiffenerGeometry} from '../engine/columnStiffeners';
import {filletWeld} from './weldGeometry';

/**
 * Column stiffeners in the receiving column at each bracket: a pair of plates, one each side of the column web, at
 * each force level, with their corner clips and the fillets to the loaded flange (both flanges at full depth) and to
 * the web, field welds on an existing column and shop welds on a new one. Bracket axes: x along the runway, y up,
 * z from the girder web line toward the column, whose loaded flange outer face is at the bracket face (reach).
 */
export function addColumnStiffeners(group:THREE.Group,b:BracketInput,supports:number[],seatTop:number,steel:THREE.Material,edge:THREE.LineBasicMaterial,weldMaterial:THREE.Material,columnIsNew:boolean){
 const g=bracketStiffenerGeometry(b,{enabled:true,isNew:columnIsNew,shape:''});if(!g)return;
 const mm=.001,face=b.reach*mm,tf=g.tf*mm,tw=g.tw*mm,t=g.t*mm,w=g.width*mm,L=g.length*mm,c=g.clip*mm,z0=face+tf,z1=z0+L;
 const execution={location:columnIsNew?'shop' as const:'field' as const,existingSteel:!columnIsNew},where=columnIsNew?'Shop':'Field';
 const V=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
 supports.forEach((x,i)=>{
  const support={x,z:face},id=`CS-S${i+1}`;
  for(const l of g.levels){
   const y=seatTop+l.z*mm;
   for(const sx of [-1,1]){
    // Plan outline (x, z) with the clip at the loaded flange and, at full depth, at the far flange; extruded through the thickness.
    const shape=new THREE.Shape(),pts:[number,number][]=[[sx*(tw/2+c),z0],[sx*(tw/2+w),z0],[sx*(tw/2+w),z1],...(g.full?[[sx*(tw/2+c),z1],[sx*tw/2,z1-c]] as [number,number][]:[[sx*tw/2,z1]] as [number,number][]),[sx*tw/2,z0+c]];
    shape.moveTo(...pts[0]);for(const q of pts.slice(1))shape.lineTo(...q);shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:t,bevelEnabled:false});geometry.rotateX(Math.PI/2);geometry.translate(0,t/2,0);
    const mesh=new THREE.Mesh(geometry,steel);mesh.name=`${id}-${l.key}-${sx}`;mesh.position.set(x,y,0);mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),edge));
    mesh.userData.part={id:mesh.name,family:'Column stiffener',description:`Column stiffener at the ${l.name}: ${g.t.toFixed(1)} mm plate, ${g.full?'full':'half'} depth; see the column stiffener checks and details.`,support} satisfies PartInfo;
    group.add(mesh);
    for(const fy of [-1,1]){
     const yf=y+fy*t/2;
     for(const [zf,dir] of g.full?[[z0,1],[z1,-1]] as const:[[z0,1]] as const)filletWeld(group,`${id}-${l.key}-flange-${sx}-${fy}-${dir}`,V(x+sx*(tw/2+c),yf,zf),V(x+sx*(tw/2+w),yf,zf),V(0,0,dir),V(0,fy,0),g.s.flangeWeld*mm,weldMaterial,`${where} fillet, column stiffener to the column flange; designed size.`,support,execution);
     filletWeld(group,`${id}-${l.key}-web-${sx}-${fy}`,V(x+sx*tw/2,yf,z0+c),V(x+sx*tw/2,yf,g.full?z1-c:z1),V(sx,0,0),V(0,fy,0),g.s.webWeld*mm,weldMaterial,`${where} fillet, column stiffener to the column web; designed size.`,support,execution);
    }
   }
  }
 });
}

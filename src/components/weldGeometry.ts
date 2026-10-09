import * as THREE from 'three';
import type {PartInfo} from './connectionDetails';

/** Equal-leg triangular fillet in the two exposed surface directions. Dimensions
 * are actual inputs in metres; no visual enlargement or inferred weld sizes. */
export function filletWeld(parent:THREE.Group,id:string,start:THREE.Vector3,end:THREE.Vector3,u:THREE.Vector3,v:THREE.Vector3,size:number,material:THREE.Material,description:string,support?:PartInfo['support'],execution?:Pick<NonNullable<PartInfo['weld']>,'location'|'existingSteel'>){
 const along=end.clone().sub(start),length=along.length();if(size<=0||length<=0)return;
 const a=u.clone().normalize().multiplyScalar(size),b=v.clone().normalize().multiplyScalar(size);
 const points=[start,start.clone().add(a),start.clone().add(b),end,end.clone().add(a),end.clone().add(b)];
 const positions=points.flatMap(p=>p.toArray()),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setIndex([0,2,1,3,4,5,0,1,4,0,4,3,1,2,5,1,5,4,2,0,3,2,3,5]);geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,material);mesh.name=id;mesh.userData.part={id,family:execution?.location==='field'?'Field fillet weld':'Fillet weld',description,support,weld:{kind:'fillet',size,length,...execution}} satisfies PartInfo;parent.add(mesh);return mesh;
}
export function stiffenerWelds(parent:THREE.Group,id:string,x:number,depth:number,tf:number,tw:number,width:number,thickness:number,cope:number,size:number,topCjp:boolean,material:THREE.Material,support?:PartInfo['support']){
 const h=depth/2-tf;
 for(const side of [-1,1])for(const face of [-1,1]){
  const px=x+face*thickness/2,z=side*tw/2;
  filletWeld(parent,`${id}-web-weld-${side}-${face}`,new THREE.Vector3(px,-h+cope,z),new THREE.Vector3(px,h-cope,z),new THREE.Vector3(face,0,0),new THREE.Vector3(0,0,side),size,material,'Continuous bearing-stiffener-to-web fillet; entered leg size. Corner copes remain clear.',support);
  if(!topCjp)for(const level of [-1,1])filletWeld(parent,`${id}-flange-weld-${level}-${side}-${face}`,new THREE.Vector3(px,level*h,side*(tw/2+cope)),new THREE.Vector3(px,level*h,side*(tw/2+width)),new THREE.Vector3(face,0,0),new THREE.Vector3(0,-level,0),size,material,'Bearing-stiffener flange fillet from the current rolled-girder template. Review top CJP preference and fatigue detail.',support);
 }
 if(topCjp)for(const side of [-1,1]){
  const length=Math.max(0,width-cope),mesh=new THREE.Mesh(new THREE.BoxGeometry(thickness,.001,length),material);
  mesh.position.set(x,h-.0005,side*(tw/2+cope+length/2));mesh.name=`${id}-top-cjp-${side}`;
  mesh.userData.part={id:mesh.name,family:'CJP weld indication',description:'Stiffener-to-top-flange CJP. Surface indication only; groove preparation, penetration and backing are not modeled. Bottom end is fitted, unwelded.',support,weld:{kind:'CJP indication',length}} satisfies PartInfo;parent.add(mesh);
 }
}

import * as THREE from 'three';
import type {PartInfo} from './connectionDetails';
export interface AuditModel {geometries:{positions:Float32Array;index:Uint32Array|null}[];meshes:{geometry:number;matrix:number[];name:string;part?:PartInfo}[]}
export function hardwareAuditModel(root:THREE.Object3D):AuditModel{
 root.updateMatrixWorld(true);const data:AuditModel={geometries:[],meshes:[]},indices=new Map<THREE.BufferGeometry,number>();
 root.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;let i=indices.get(m.geometry);
  if(i===undefined){i=data.geometries.length;indices.set(m.geometry,i);const position=m.geometry.getAttribute('position');data.geometries.push({positions:new Float32Array(position.array),index:m.geometry.index?new Uint32Array(m.geometry.index.array):null});}
  data.meshes.push({geometry:i,matrix:m.matrixWorld.toArray(),name:m.name,part:m.userData.part});
 });return data;
}
export function restoreHardwareAuditModel(data:AuditModel){
 const group=new THREE.Group(),material=new THREE.MeshBasicMaterial(),geometries=data.geometries.map(g=>{const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(g.positions,3));if(g.index)geometry.setIndex(new THREE.BufferAttribute(g.index,1));return geometry;});
 for(const m of data.meshes){const mesh=new THREE.Mesh(geometries[m.geometry],material);mesh.name=m.name;mesh.userData.part=m.part;mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(m.matrix);group.add(mesh);}return group;
}

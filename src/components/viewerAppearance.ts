import * as THREE from 'three';

// Component colors inspired by Tekla's class-colored, rendered steel views.
// They identify parts, never utilization or design approval.
export const modelPalette={
 runway:'#4568ae',cap:'#6584cc',rail:'#697784',column:'#9764b1',
 roof:'#7385a7',plate:'#66a9ae',existing:'#9c96ad',foundation:'#c8ccd3',hardware:'#d4ad55',
 weld:'#dc8b36',opposite:'#8498c1',crane:'#dcad46',brace:'#79a6a3',
 wheel:'#4d5869',edge:'#26334d',selection:'#ffc83d'
} as const;
export const modelLegend=[
 ['Runway',modelPalette.runway],['Columns (ref.)',modelPalette.column],
 ['Plates / ties',modelPalette.plate],['Bolts',modelPalette.hardware],['Welds',modelPalette.weld]
] as const;
export function modelMaterial(color:THREE.ColorRepresentation,extra:THREE.MeshLambertMaterialParameters={}){
 return new THREE.MeshLambertMaterial({color,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,...extra});
}
export function addModelLighting(scene:THREE.Scene){
 scene.add(new THREE.HemisphereLight(0xffffff,0x9299b4,1.35));
 const key=new THREE.DirectionalLight(0xffffff,1.7);key.position.set(7,12,8);scene.add(key);
 const fill=new THREE.DirectionalLight(0xe6edff,.6);fill.position.set(-7,3,-9);scene.add(fill);
}
export function frameModelCamera(camera:THREE.PerspectiveCamera|THREE.OrthographicCamera,frame:THREE.Box3,direction:THREE.Vector3,aspect:number){
 const center=frame.getCenter(new THREE.Vector3()),normal=direction.clone().normalize();
 camera.position.copy(center).add(normal);camera.lookAt(center);
 const inverse=camera.quaternion.clone().invert();let required=.05,halfHeight=.05;
 const tangent=camera instanceof THREE.PerspectiveCamera?Math.tan(THREE.MathUtils.degToRad(camera.fov/2)):1;
 for(const x of [frame.min.x,frame.max.x])for(const y of [frame.min.y,frame.max.y])for(const z of [frame.min.z,frame.max.z]){
  const corner=new THREE.Vector3(x,y,z).sub(center).applyQuaternion(inverse);
  required=Math.max(required,Math.abs(corner.x)/(tangent*aspect)+corner.z,Math.abs(corner.y)/tangent+corner.z);
  halfHeight=Math.max(halfHeight,Math.abs(corner.y),Math.abs(corner.x)/aspect);
 }
 if(camera instanceof THREE.OrthographicCamera){
  halfHeight*=1.08;camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;camera.zoom=1;
  required=Math.max(1,frame.getSize(new THREE.Vector3()).length()*1.5);
 }else{camera.aspect=aspect;required*=1.08;}
 camera.position.copy(center).addScaledVector(normal,required);camera.lookAt(center);camera.updateProjectionMatrix();camera.updateMatrixWorld();
 return center;
}

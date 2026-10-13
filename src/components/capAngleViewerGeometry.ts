import * as THREE from 'three';
import type {ProjectInput} from '../engine/types';
import {capAngleGeometry,capAngleTieParts} from '../engine/capAngle';
import type {PartInfo} from './connectionDetails';
import {filletWeld} from './weldGeometry';

const family:Record<string,string>={'angle-leg':'Cap tieback angle','tie-plate':'Cap tieback tie plate','end-plate':'Cap tieback end plate',shim:'Finger shims','plate-washer':'Plate washer',stiffener:'Column stiffener at the tie level'};
const description:Record<string,string>={
 'angle-leg':'Catalog angle bolted through the column-side cap channel flange in horizontal slots, its horizontal leg level with the top of the cap; the girder slides along the runway.',
 'tie-plate':'Tie plate lapped on the angle with two slip-critical bolts in short slots across the runway; shop welded to the end plate.',
 'end-plate':'End plate bolted through finger shims to the column flange, one bolt above and one below the tie plate, in field-drilled holes.',
 shim:'Finger shims (nominal pack shown) between the end plate and the column flange.',
 'plate-washer':'Plate washer over the long slot in the angle.',
 stiffener:'Column stiffener at the tie level on the tie side of the column web (AISC J10.8).'};

/**
 * The cap tieback angles in the 3D viewer, one at each girder end, from the engine's tie geometry (capAngleTieParts:
 * x along the runway from the tie centerline, y from the web toward the column, z up from the top of the cap). Viewer
 * frame, meters: x along the runway from its middle, y up from the girder mid-depth, z across toward the column face.
 * The plates and shop welds are shown; the bolts, and their holes in the cap channel and column flanges, are in the
 * drawings and checks, not in this model (so the viewer's hardware scan does not cover them).
 */
export function buildCapAngleTies(p:ProjectInput,columnFace:number,steel:THREE.Material,edge:THREE.LineBasicMaterial,weldMaterial:THREE.Material=steel){
 const group=new THREE.Group();group.name='cap-angle-ties';group.userData.tieArrangement='cap-angle';
 const g=capAngleGeometry(p);if(!g)return group;
 const mm=.001,L=p.spans.reduce((a,b)=>a+b,0)*mm,s=p.section,top=(s.d/2+s.capTw)*mm;
 g.stations.forEach((v,i)=>{
  const parts=capAngleTieParts(p,{station:i});if(!parts)return;
  const id=`bay-${v.bay}-${v.end}-cap-angle`,support:PartInfo['support']={x:v.station*mm-L/2,z:0};
  const X=(x:number)=>v.x*mm-L/2+x*mm,Y=(z:number)=>top+z*mm,Z=(y:number)=>columnFace-(g.face-y)*mm;
  parts.boxes.forEach((b,j)=>{
   if(b.kind==='channel-flange'||b.kind==='column-flange'||b.kind==='sleeve')return;
   // The short leg stops under the long leg so the two legs do not overlap.
   const z1=b.name.startsWith('angle short leg')?-g.ta:b.max[2];
   const geometry=new THREE.BoxGeometry((b.max[0]-b.min[0])*mm,(z1-b.min[2])*mm,(b.max[1]-b.min[1])*mm),mesh=new THREE.Mesh(geometry,steel);
   mesh.position.set(X((b.min[0]+b.max[0])/2),Y((b.min[2]+z1)/2),Z((b.min[1]+b.max[1])/2));mesh.name=`${id}-${b.kind}-${j+1}`;
   mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),edge));
   mesh.userData.part={id:mesh.name,family:family[b.kind]??b.name,description:description[b.kind]??b.name,support} satisfies PartInfo;group.add(mesh);
  });
  // Shop fillets, end plate to tie plate, on both faces of the tie plate.
  for(const w of parts.welds)for(const face of [1,-1]){
   const z=face>0?g.plate.z1:g.plate.z0,a=new THREE.Vector3(X(-g.plate.width/2),Y(z),Z(g.endPlate.y0)),b=new THREE.Vector3(X(g.plate.width/2),Y(z),Z(g.endPlate.y0));
   filletWeld(group,`${id}-end-plate-weld-${face>0?'top':'bottom'}`,a,b,new THREE.Vector3(0,face,0),new THREE.Vector3(0,0,-1),w.size*mm,weldMaterial,'Shop fillet, end plate to tie plate.',support,{location:'shop'});
  }
 });
 return group;
}

import {flangeTieGeometry} from '../engine/tieGeometry';
import {tieArrangement} from '../engine/connectionOptions';
import {buildAlternativeTies} from './alternativeTieGeometry';
import {filletWeld,stiffenerWelds} from './weldGeometry';
import * as THREE from 'three';
import type {ProjectInput} from '../engine/types';
import {independentBearings,simpleSupportInput} from '../engine/simpleSupports';
import {boltProperties} from '../engine/connectionStrength';
import {horizontalPlateGeometry,type HardwareBuilder,type PartInfo} from './connectionDetails';
import {bearingStiffenerGeometry} from './bearingStiffenerGeometry';
import {activeEndBearing} from '../engine/endBearingInputs';

export function independentBearingSettings(p:ProjectInput){
 if(p.system!=='simple')return undefined;
 return {thickness:(p.details?.bearing.thickness??25.4)/1000,seatLength:(2*(p.details?.bearing.length??254)+simpleSupportInput(p).endGap+2*simpleSupportInput(p).guideTravel)/1000};
}
/** Dimensioned girder-side plates; receiving column gussets are reference
 * interfaces. No bottom-flange drilling or cross-joint plate is introduced. */
export function buildIndependentSupports(p:ProjectInput,columnFace:number,material:THREE.Material,edge:THREE.LineBasicMaterial,hardware?:HardwareBuilder,includeTies=true,weldMaterial:THREE.Material=material){
 const group=new THREE.Group();group.name='independent-girder-supports';const layout=flangeTieGeometry(p);
 const L=p.spans.reduce((a,b)=>a+b,0)/1000,b=p.section,bs=p.details?.bearing,d=b.d/1000,tf=b.tf/1000,tw=b.tw/1000;
 const plate=(name:string,l:number,h:number,w:number,x:number,y:number,z:number,family:string)=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(l,h,w),material);mesh.position.set(x,y,z);mesh.name=name;mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),edge));
  mesh.userData.part={id:name,family,description:activeEndBearing(p)?'Independent girder end bearing, bolted to the seat: standard holes at the locating end, long slots at the sliding end; see S-02 / S-04.':'Independent girder end; see S-04. Receiving bracket and movement-compatible column attachment require project design.',support:{x,z:0}} satisfies PartInfo;group.add(mesh);return mesh;
 };
 for(const end of independentBearings(p)){
  const x=end.center/1000-L/2,t=(bs?.thickness??25.4)/1000,w=(bs?.width??b.bf)/1000,len=(end.finish-end.start)/1000,id=`bay-${end.bay}-${end.end}`;
  plate(`${id}-bearing`,len,t,w,x,-d/2-t/2,0,`${end.role==='LOCATING'?'Locating':'Sliding'} end bearing`);
  if(!bs)continue;
  for(const side of [-1,1]){
   const mesh=new THREE.Mesh(bearingStiffenerGeometry(bs.stiffenerWidth/1000,d-2*tf,bs.stiffenerThickness/1000,bs.cope/1000,side),material);
   mesh.position.set(x,0,side*tw/2);mesh.name=`${id}-stiffener-${side}`;
   mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),edge));
   mesh.userData.part={id:mesh.name,family:'Independent bearing stiffener',description:'Full depth between flange faces, fitted at both ends; only web-side corners are coped for fillet clearance. See S-02 / S-04.',support:{x:end.station/1000-L/2,z:0}} satisfies PartInfo;
   group.add(mesh);
  }
  stiffenerWelds(group,id,x,d,tf,tw,bs.stiffenerWidth/1000,bs.stiffenerThickness/1000,bs.cope/1000,bs.weldSize/1000,p.section.kind==='cap'&&!!p.capDesign?.topStiffenerCjp,weldMaterial,{x:end.station/1000-L/2,z:0});
  if(!p.details||!includeTies||tieArrangement(p.details)!=='paired-bars')continue;
  const tie=p.details.brace,c=tie.connection,th=tie.thickness/1000,gw=tie.gussetThickness/1000,width=tie.width/1000,length=tie.length/1000;
  // Paired vertical flat bars can bend out of their plane with end rotation.
  // Place their column end at the actual reference column face.
  const z0=columnFace-length,tx=x+(layout?(end.end==='left'?-1:1)*layout.attachment.longitudinalSetback/1000:0);
  for(const side of [-1,1]){
   const y=layout?(side>0?layout.topCenter:layout.bottomCenter)/1000:side*(d/2-tf-width/2),conn=((c.rows-1)*c.pitch+2*c.edge)/1000;
   if(layout){
    const a=layout.attachment,L=layout.rootLength/1000,zs=layout.rootStart/1000,ze=layout.rootEnd/1000,t=a.saddleThickness/1000,sz=a.weldSize/1000;
    plate(`${id}-flange-saddle-${side}`,a.saddleLength/1000,t,L,tx,side*(d/2-tf-t/2),(zs+ze)/2,'Direct flange saddle');
    for(const sign of [-1,1]){
     const sx=tx+sign*a.saddleLength/2000,sy=side*(d/2-tf);
     filletWeld(group,`${id}-saddle-weld-${side}-${sign}`,new THREE.Vector3(sx,sy,zs),new THREE.Vector3(sx,sy,ze),new THREE.Vector3(sign,0,0),new THREE.Vector3(0,-side,0),sz,weldMaterial,'Continuous saddle-to-flange weld; direct flange load path, no web attachment.');
     const gx=tx+sign*gw/2,gy=side*(d/2-tf-t);
     filletWeld(group,`${id}-gusset-flange-weld-${side}-${sign}`,new THREE.Vector3(gx,gy,zs),new THREE.Vector3(gx,gy,ze),new THREE.Vector3(sign,0,0),new THREE.Vector3(0,-side,0),sz,weldMaterial,'Continuous gusset-to-saddle weld; eccentric tie force checked.');
     filletWeld(group,`${id}-column-tie-weld-${side}-${sign}`,new THREE.Vector3(gx,y-width/2,columnFace),new THREE.Vector3(gx,y+width/2,columnFace),new THREE.Vector3(sign,0,0),new THREE.Vector3(0,0,-1),c.weldSize/1000,weldMaterial,'Field weld gusset to existing column; local column flange and weld checks. Global frame movement remains separate.',{x:end.station/1000-L/2,z:columnFace},{location:'field',existingSteel:true});
    }
   }
   for(const [rootIndex,at] of [z0+conn/2,columnFace-conn/2].entries()){
    const rootStart=layout&&rootIndex===0?layout.rootStart/1000:at-conn/2,rootEnd=at+conn/2;
    const rootTop=layout&&rootIndex===0?side*(d/2-tf-layout.attachment.saddleThickness/1000):y+side*width/2;
    const rootBottom=y-side*width/2,rootY=(rootTop+rootBottom)/2,rootHeight=Math.abs(rootTop-rootBottom);
    const holes=[];for(let row=0;row<c.rows;row++)for(const line of [-1,1])holes.push({x:at-conn/2+c.edge/1000+row*c.pitch/1000-(rootStart+rootEnd)/2,z:y+line*c.gauge/2000-rootY,diameter:boltProperties(c.grade,c.diameter).hole/1000});
    const mesh=new THREE.Mesh(horizontalPlateGeometry(rootEnd-rootStart,rootHeight,gw,holes),material);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0)));
    mesh.position.set(tx,rootY,(rootStart+rootEnd)/2);mesh.name=`${id}-tie-gusset-${side>0?'top':'bottom'}-${rootIndex+1}`;mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),edge));
    mesh.userData.part={id:mesh.name,family:'Tie receiving gusset (interface)',support:{x:end.station/1000-L/2,z:0},description:layout?'Direct flange saddle / column gusset; local strength and fatigue checked. Movement and building interface remain separate.':'Drilled central ply. Girder-side in-plane strength checked; column root and movement flexibility require project design.'} satisfies PartInfo;group.add(mesh);
   }
   for(const ply of [-1,1]){
    const holes=[];for(const offset of [0,length-conn])for(let row=0;row<c.rows;row++)for(const line of [-1,1])holes.push({x:offset+c.edge/1000+row*c.pitch/1000-length/2,z:line*c.gauge/2000,diameter:boltProperties(c.grade,c.diameter).hole/1000});
    const mesh=new THREE.Mesh(horizontalPlateGeometry(length,width,th,holes),material);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0)));
    mesh.position.set(tx+ply*(gw+th)/2,y,z0+length/2);mesh.name=`${id}-tie-${side}-${ply}`;mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),edge));
    mesh.userData.part={id:mesh.name,family:'Independent flange tie',description:'Paired vertical flat bars to the column, separate for each girder. Lateral strength/stiffness checked; longitudinal flexure and column-side attachment require project detailing.',support:{x:end.station/1000-L/2,z:0}} satisfies PartInfo;group.add(mesh);
   }
   if(hardware)for(const [rootIndex,offset] of [0,length-conn].entries())for(let row=0;row<c.rows;row++)for(const line of [-1,1])hardware.bolt(group,{id:`${id}-tie-bolt-${side>0?'top':'bottom'}-${rootIndex+1}-${row+1}-${line>0?2:1}`,family:'Independent tie bolt',description:'Two cover bars and central gusset; separate bolt group for each girder end.',diameter:c.diameter/1000,grip:2*th+gw,support:{x:end.station/1000-L/2,z:0}},new THREE.Vector3(tx-th-gw/2,y+line*c.gauge/2000,z0+offset+c.edge/1000+row*c.pitch/1000),new THREE.Vector3(1,0,0));
  }
 }
 if(includeTies&&tieArrangement(p.details)!=='paired-bars')group.add(buildAlternativeTies(p,columnFace,material,edge,weldMaterial,hardware));
 return group;
}

import * as THREE from 'three';
import { shapeMeters, type ReferenceShape } from '../data/aiscReferenceShapes';
import { horizontalPlateGeometry, type HardwareBuilder, type Hole, type PartInfo } from './connectionDetails';
import { coldFormedMember, columnProfile, portalDimensions as dims, profileUpper, taperedISection } from './metalBuildingGeometry';

interface Options {
 supports:number[]; bayWidth:number; columnBottom:number; bracketTop:number; railTop:number; roofClearance:number; columnOffset:number; column:ReferenceShape; roofSlope:number; hardware?:HardwareBuilder;
 materials:{beam:THREE.Material;plate:THREE.Material;brace:THREE.Material;edge:THREE.LineBasicMaterial};
}
export function buildPrefabFrame(o:Options){
 const group=new THREE.Group();group.name='prefab-moment-frames';
 const c=shapeMeters(o.column),t=.0254,holeD=.02205,roofBottom=o.railTop+o.roofClearance,columnTop=roofBottom+dims.kneeDepth;
 const columnMid=(o.columnBottom+columnTop)/2,profile=columnProfile(columnTop-o.columnBottom,o.bracketTop-columnMid,c.d),face=o.columnOffset-c.d/2;
 const faces=[face,-o.bayWidth-face],rows=[o.columnOffset,-o.bayWidth-o.columnOffset],ridge=-o.bayWidth/2,run=(faces[0]-faces[1])/2,pitch=o.roofSlope/12;
 const ridgeTop=columnTop+pitch*(run-t),roofAt=(z:number)=>columnTop+pitch*(run-t-Math.abs(z-ridge));
 const outlined=(geometry:THREE.BufferGeometry,name:string,family:string,description:string)=>{
  const mesh=new THREE.Mesh(geometry,o.materials.plate);mesh.name=name;mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),o.materials.edge));mesh.userData.part={id:name,family,description} satisfies PartInfo;group.add(mesh);return mesh;
 };
 const rod=(name:string,a:THREE.Vector3,b:THREE.Vector3)=>{const delta=b.clone().sub(a),mesh=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,delta.length(),8),o.materials.brace);mesh.name=name;mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());group.add(mesh);};
 const secondary=(name:string,a:THREE.Vector3,b:THREE.Vector3,depth:number,zSection:boolean,slope=0)=>{
  const mesh=coldFormedMember(name,a.distanceTo(b),depth,.075,zSection,{steel:o.materials.plate,edge:o.materials.edge});mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.rotation.x=slope;group.add(mesh);
  mesh.traverse(part=>{if((part as THREE.Mesh).isMesh)part.userData.part={id:part.name,family:zSection?'Z roof purlin':'C wall girt / eave strut',description:'Representative lipped cold-formed section; dimensions and connections are illustrative.'} satisfies PartInfo;});
 };
 o.supports.forEach((x,station)=>{
  for(const [side,z] of faces.entries()){
   const inward=side===0?-1:1,id=`B${side+1}-S${station+1}`,support={x,z:rows[side]},holes:Hole[]=[];
   for(const [row,drop] of [.12,.30,.50,.68].entries())for(const sx of [-1,1]){
    holes.push({x:sx*.09,z:drop-dims.kneeDepth/2,diameter:holeD});
    o.hardware?.bolt(group,{id:`${id}-KB-${row*2+(sx<0?1:2)}`,family:'Moment-frame knee bolt',description:'Tapered rafter end plate to continuous building-column flange',diameter:.01905,grip:t+c.tf,support},new THREE.Vector3(x+sx*.09,columnTop-drop,z-inward*c.tf),new THREE.Vector3(0,0,inward));
   }
   const endPlate=outlined(horizontalPlateGeometry(.36,dims.kneeDepth,t,o.hardware?holes:[]),`${id}-knee-end-plate`,'Moment-frame knee end plate','Illustrative bolted rigid knee connection');
   endPlate.position.set(x,columnTop-dims.kneeDepth/2,z+inward*t/2);endPlate.rotation.x=side===0?Math.PI/2:-Math.PI/2;
   // Mirroring the far plate flips its local Z-to-world-Y mapping.
   if(side===1){endPlate.geometry.dispose();endPlate.geometry=horizontalPlateGeometry(.36,dims.kneeDepth,t,o.hardware?holes.map(h=>({...h,z:-h.z})):[]);const edge=endPlate.children[0] as THREE.LineSegments;edge.geometry.dispose();edge.geometry=new THREE.EdgesGeometry(endPlate.geometry);}
   endPlate.userData.part.support=support;
   const end=run-2*t,haunch=Math.min(1.6,end*.32),points=[{s:0,upper:0,lower:-dims.kneeDepth},{s:haunch,upper:pitch*haunch,lower:pitch*haunch-.4},{s:end,upper:pitch*end,lower:pitch*end-dims.ridgeDepth}];
   const rafter=taperedISection(`portal-rafter-${station+1}-${side+1}`,points,dims.flangeWidth,dims.flangeT,dims.webT,{steel:o.materials.beam,edge:o.materials.edge});
   const axis=new THREE.Vector3(0,0,inward),up=new THREE.Vector3(0,1,0),width=new THREE.Vector3().crossVectors(axis,up);rafter.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(axis,up,width));rafter.position.set(x,columnTop,z+inward*t);group.add(rafter);
   for(const mesh of rafter.children){mesh.userData.part={id:`${rafter.name}-${mesh.name}`,family:'Tapered moment-frame rafter',description:'Fabricated I-rafter with deep knee haunch and reduced depth toward the ridge.',support} satisfies PartInfo;mesh.name=`${rafter.name}-${mesh.name}`;}
   // Transverse web stiffeners emphasize the fabricated knee and ridge joints.
   for(const s of [.045,end-.045]){
    const depth=s<.1?dims.kneeDepth:dims.ridgeDepth,y=columnTop+pitch*s-depth/2,stiffener=outlined(new THREE.BoxGeometry(dims.flangeWidth-dims.webT,depth-2*dims.flangeT,.01),`${id}-${s<.1?'knee':'ridge'}-stiffener`,'Rafter connection stiffener','Illustrative full-depth web stiffener');stiffener.position.set(x,y,z+inward*(t+s));
   }
  }
  const ridgeHoles:Hole[]=[];
  for(const [row,drop] of [.055,.135,.215,.295].entries())for(const sx of [-1,1]){
   ridgeHoles.push({x:sx*.10,z:drop-dims.ridgeDepth/2,diameter:holeD});
   o.hardware?.bolt(group,{id:`B-S${station+1}-RP-${row*2+(sx<0?1:2)}`,family:'Ridge moment-splice bolt',description:'Paired rafter ridge end plates',diameter:.01905,grip:2*t,support:{x,z:ridge}},new THREE.Vector3(x+sx*.10,ridgeTop-drop,ridge-t),new THREE.Vector3(0,0,1));
  }
  for(const sign of [-1,1]){const plate=outlined(horizontalPlateGeometry(.38,dims.ridgeDepth,t,o.hardware?ridgeHoles:[]),`B-S${station+1}-ridge-plate-${sign}`,'Ridge moment-splice plate','Illustrative paired bolted end plates at the gable ridge');plate.position.set(x,ridgeTop-dims.ridgeDepth/2,ridge+sign*t/2);plate.rotation.x=Math.PI/2;plate.userData.part.support={x,z:ridge};}
 });
 const outer=(y:number)=>o.columnOffset+profileUpper(profile,y-columnMid),topOuter=outer(columnTop);
 for(let bay=0;bay<o.supports.length-1;bay++){
  const a=o.supports[bay],b=o.supports[bay+1];
  // Two roof slopes with a common ridge. Z purlins sit on the rafter upper flange.
  for(let line=0;line<=8;line++){
   const z=faces[1]+t+(faces[0]-faces[1]-2*t)*line/8,slope=line<4?-Math.atan(pitch):line>4?Math.atan(pitch):0;
   secondary(`purlin-${bay+1}-${line+1}`,new THREE.Vector3(a,roofAt(z)+.105,z),new THREE.Vector3(b,roofAt(z)+.105,z),.20,true,slope);
  }
  for(const side of [0,1]){
   const outward=side===0?1:-1,z=side===0?topOuter+.085:-o.bayWidth-topOuter-.085;
   secondary(`eave-strut-${side+1}-${bay+1}`,new THREE.Vector3(a,columnTop-.12,z),new THREE.Vector3(b,columnTop-.12,z),.20,false);
   for(let level=1;level<=4;level++){
    const y=o.columnBottom+(columnTop-o.columnBottom)*level/5;
    secondary(`wall-girt-${side+1}-${bay+1}-${level}`,new THREE.Vector3(a,y,z),new THREE.Vector3(b,y,z),.18,false);
    for(const x of [a,b]){const columnZ=side===0?outer(y):-o.bayWidth-outer(y),clip=outlined(new THREE.BoxGeometry(.08,.10,Math.abs(z-columnZ)),`girt-clip-${side}-${bay}-${level}-${x}`,'Girt stand-off clip','Representative bypass-girt clip');clip.position.set(x,y,(z+columnZ)/2);}
   }
  }
 }
 const bracedBays=[...new Set([0,o.supports.length-2])];
 for(const side of [0,1]){
  const outward=side===0?1:-1,stations=[...new Set(bracedBays.flatMap(b=>[b,b+1]))],locations=new Map<string,THREE.Vector3>();
  for(const station of stations)for(const [level,y] of [o.columnBottom+.65,columnTop-.45].entries()){
   const x=o.supports[station],id=`B${side+1}-S${station+1}-G${level+1}`,local=y-columnMid;
   const slope=(profileUpper(profile,local+.001)-profileUpper(profile,local-.001))/.002,normal=new THREE.Vector3(0,-slope,outward).normalize(),z=side===0?outer(y):-o.bayWidth-outer(y),surface=new THREE.Vector3(x,y,z),holes:Hole[]=[];
   for(const sx of [-1,1])for(const sy of [-1,1])holes.push({x:sx*.045,z:-outward*sy*.055,diameter:holeD});
   const plate=outlined(horizontalPlateGeometry(.18,.22,.012,o.hardware?holes:[]),id,'Bracing gusset','Representative sidewall rod-bracing attachment');plate.position.copy(surface).addScaledVector(normal,.006);plate.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(1,0,0),normal,new THREE.Vector3().crossVectors(new THREE.Vector3(1,0,0),normal)));plate.userData.part.support={x,z:rows[side]};
   locations.set(`${station}-${level}`,surface.clone().addScaledVector(normal,.04));
   for(const sx of [-1,1])for(const sy of [-1,1]){
    const position=new THREE.Vector3(sx*.045,0,-outward*sy*.055).applyQuaternion(plate.quaternion).add(surface).addScaledVector(normal,-c.tf);
    o.hardware?.bolt(group,{id:`${id}-bolt-${(sx<0?1:3)+(sy<0?0:1)}`,family:'Bracing gusset bolt',description:'Representative rod-bracing attachment to tapered column flange',diameter:.01905,grip:c.tf+.012,support:{x,z:rows[side]}},position,normal);
   }
  }
  for(const bay of bracedBays){rod(`wall-brace-${side+1}-${bay+1}-A`,locations.get(`${bay}-0`)!,locations.get(`${bay+1}-1`)!);rod(`wall-brace-${side+1}-${bay+1}-B`,locations.get(`${bay}-1`)!,locations.get(`${bay+1}-0`)!);}
 }
 for(const bay of bracedBays)for(const side of [0,1]){
  const a=o.supports[bay],b=o.supports[bay+1],z=faces[side],eave=roofAt(z)+.25,apex=ridgeTop+.25;
  rod(`roof-brace-${bay+1}-${side+1}-A`,new THREE.Vector3(a,eave,z),new THREE.Vector3(b,apex,ridge));rod(`roof-brace-${bay+1}-${side+1}-B`,new THREE.Vector3(a,apex,ridge),new THREE.Vector3(b,eave,z));
 }
 return {group,rows,roofBottom,roofTop:ridgeTop+.28,ridgeTop,roofShape:'Tapered fabricated I',purlinShape:'Lipped Z',frameCount:o.supports.length};
}

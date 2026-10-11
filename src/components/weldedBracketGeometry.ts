import {isExistingBracketType,existingBracketProfile} from '../engine/bracketProfiles';
import * as THREE from 'three';
import type {BracketInput} from '../engine/bracketInputs';
import type {PartInfo} from './connectionDetails';
import {bracketArrangement} from '../engine/connectionOptions';
import {rolledStub} from '../engine/rolledBracketInputs';
import {haunchGeometry} from '../engine/taperedHaunchInputs';
import {haunchPlatesAndWelds,type XYZ} from '../engine/taperedHaunchParts';
import {filletWeld} from './weldGeometry';
import {buildExistingBrackets} from './existingBracketGeometry';
import {weldedRibBracket,haunchTipDepth} from '../engine/bracketRib';
import type {HardwareBuilder} from './connectionDetails';
/** bearingWidth: the girder bearing plate width across the runway (m), which places a tapered haunch's top flange flare. */
export function buildWeldedBrackets(b:BracketInput,supports:number[],seatTop:number,steel:THREE.Material,edge:THREE.LineBasicMaterial,bearing?:{width:number;length:number;thickness:number},weldMaterial:THREE.Material=steel,hardware?:HardwareBuilder,columnIsNew=false,bearingWidth?:number){
 if(isExistingBracketType(bracketArrangement(b)))return buildExistingBrackets(b,supports,seatTop,steel,edge,bearing,hardware);
 if(bracketArrangement(b)==='rolled-corbel')return buildRolledBrackets(b,supports,seatTop,steel,edge,bearing,weldMaterial,columnIsNew);
 if(bracketArrangement(b)==='tapered-haunch')return buildTaperedHaunches(b,supports,seatTop,steel,edge,bearing,weldMaterial,columnIsNew,bearingWidth);
 const group=new THREE.Group(),kind=bracketArrangement(b);group.name='designed-welded-column-brackets';group.userData.designedBracket=weldedRibBracket(b);group.userData.bracketArrangement=kind;
 const mm=.001,face=b.reach*mm,tip=face-b.seatProjection*mm,top=seatTop-b.seatThickness*mm;
 const add=(geometry:THREE.BufferGeometry,id:string,family:string,x:number,y:number,z:number,station:number)=>{
  const isWeld=family.includes('fillet'),mesh=new THREE.Mesh(geometry,isWeld?weldMaterial:steel);mesh.name=id;mesh.position.set(x,y,z);mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),edge));
  mesh.userData.part={id,family,description:weldedRibBracket(b)?'Project bracket geometry; see Column bracket checks and the bracket details. Receiving building global capacity is separate.':'Reference bracket arrangement. Geometry and welds shown to the entered dimensions; connection strength, stability and fatigue require a new project model.',support:{x:station,z:face},...(isWeld?{weld:{kind:'fillet',location:family.includes('column')?'field':'shop',existingSteel:family.includes('column'),size:(family.includes('column')?b.rootWeld:b.seatWeld)/1000,length:(family.includes('column')?b.ribDepth:b.seatProjection)/1000}}:{})} satisfies PartInfo;group.add(mesh);return mesh;
 };
 supports.forEach((x,i)=>{
  add(new THREE.BoxGeometry(b.seatLength*mm,b.seatThickness*mm,b.seatProjection*mm),`WB-S${i+1}-seat`,weldedRibBracket(b)?'Designed bracket seat':'Bracket seat (reference)',x,seatTop-b.seatThickness*mm/2,(face+tip)/2,x);
  if(bearing)add(new THREE.BoxGeometry(bearing.length,bearing.thickness,bearing.width),`WB-S${i+1}-bearing`,'Girder bearing plate',x,seatTop+bearing.thickness/2,0,x);
  for(const side of [-1,1]){
   const rx=x+side*b.ribSpacing*mm/2;
   if(kind==='haunched-seat'){
    // Root depth at the column face, the tip depth at the seat edge: the rib the checks and details use.
    const profile=new THREE.Shape();profile.moveTo(0,0);profile.lineTo(b.seatProjection*mm,0);profile.lineTo(b.seatProjection*mm,-b.ribDepth*mm);profile.lineTo(0,-haunchTipDepth(b)*mm);profile.closePath();
    const geo=new THREE.ExtrudeGeometry(profile,{depth:b.ribThickness*mm,bevelEnabled:false});geo.rotateY(-Math.PI/2);geo.translate(b.ribThickness*mm/2,0,0);
    add(geo,`WB-S${i+1}-rib-${side}`,'Designed haunched bracket rib',rx,top,tip,x);
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
/**
 * New rolled wide-flange brackets: the W stub with its top at the seat (or with a spreader seat on it), the bearing
 * stiffeners under the girder web line and every weld to the designed sizes: the stub to the column (field to an
 * existing column, shop to a new one), and the seat and stiffener fillets (shop). x along the runway, y up, z from
 * the girder web line toward the column face.
 */
export function buildRolledBrackets(b:BracketInput,supports:number[],seatTop:number,steel:THREE.Material,edge:THREE.LineBasicMaterial,bearing?:{width:number;length:number;thickness:number},weldMaterial:THREE.Material=steel,columnIsNew=false){
 const group=new THREE.Group();group.name='designed-welded-column-brackets';group.userData.designedBracket=true;group.userData.bracketArrangement='rolled-corbel';
 const st=rolledStub(b);if(!st)return group;
 const mm=.001,face=b.reach*mm,r=st.input,seat=st.seat,d=st.d*mm,bf=st.bf*mm,tf=st.tf*mm,tw=st.tw*mm,L=st.L*mm,top=seatTop-(seat?seat.t*mm:0),zc=face-L/2;
 const column={location:columnIsNew?'shop' as const:'field' as const,existingSteel:!columnIsNew};
 const description='Designed wide-flange bracket; see Column bracket checks and the bracket details. Receiving building global capacity is separate.';
 const add=(geometry:THREE.BufferGeometry,id:string,family:string,x:number,y:number,z:number,station:number)=>{
  const mesh=new THREE.Mesh(geometry,steel);mesh.name=id;mesh.position.set(x,y,z);mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),edge));
  mesh.userData.part={id,family,description,support:{x:station,z:face}} satisfies PartInfo;group.add(mesh);return mesh;
 };
 const V=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
 supports.forEach((x,i)=>{
  const id=`WB-S${i+1}`,support={x,z:face};
  if(bearing)add(new THREE.BoxGeometry(bearing.length,bearing.thickness,bearing.width),`${id}-bearing`,'Girder bearing plate',x,seatTop+bearing.thickness/2,0,x);
  if(seat)add(new THREE.BoxGeometry(seat.length*mm,seat.t*mm,(seat.y1-seat.y0)*mm),`${id}-seat`,'Spreader seat plate',x,seatTop-seat.t*mm/2,face-(seat.y0+seat.y1)/2*mm,x);
  for(const [label,y] of [['top',top-tf/2],['bottom',top-d+tf/2]] as const)add(new THREE.BoxGeometry(bf,tf,L),`${id}-corbel-${label}`,`${st.name} bracket flange`,x,y,zc,x);
  add(new THREE.BoxGeometry(tw,d-2*tf,L),`${id}-corbel-web`,`${st.name} bracket web`,x,top-d/2,zc,x);
  const sf=st.stiffener;
  if(sf)for(const sx of [-1,1]){
   const w=sf.width*mm,t=sf.t*mm,h=d-2*tf,c=sf.clip*mm,shape=new THREE.Shape();
   // Plate in the x-y plane with clipped corners at the web, extruded through its thickness along z.
   shape.moveTo(sx*tw/2,-h/2+c);shape.lineTo(sx*(tw/2+c),-h/2);shape.lineTo(sx*(tw/2+w),-h/2);shape.lineTo(sx*(tw/2+w),h/2);shape.lineTo(sx*(tw/2+c),h/2);shape.lineTo(sx*tw/2,h/2-c);shape.closePath();
   const geo=new THREE.ExtrudeGeometry(shape,{depth:t,bevelEnabled:false});geo.translate(0,0,-t/2);
   add(geo,`${id}-stiffener-${sx}`,'Bracket bearing stiffener',x,top-d/2,0,x);
   for(const fz of [-1,1]){
    filletWeld(group,`${id}-stiffener-web-${sx}-${fz}`,V(x+sx*tw/2,top-tf-c,fz*t/2),V(x+sx*tw/2,top-d+tf+c,fz*t/2),V(sx,0,0),V(0,0,fz),sf.weld*mm,weldMaterial,'Shop fillet, stiffener to web; designed size.',support,{location:'shop'});
    for(const [y,up] of [[top-tf,-1],[top-d+tf,1]] as const)filletWeld(group,`${id}-stiffener-flange-${sx}-${fz}-${up}`,V(x+sx*(tw/2+c),y,fz*t/2),V(x+sx*(tw/2+w),y,fz*t/2),V(0,up,0),V(0,0,fz),sf.weld*mm,weldMaterial,'Shop fillet, stiffener to flange; top end also fitted to bear.',support,{location:'shop'});
   }
  }
  if(seat)for(const sx of [-1,1])filletWeld(group,`${id}-seat-weld-${sx}`,V(x+sx*bf/2,top,face-seat.y0*mm),V(x+sx*bf/2,top,face-seat.y1*mm),V(sx,0,0),V(0,-1,0),seat.weld*mm,weldMaterial,'Shop fillet, spreader seat to the flange tip; designed size.',support,{location:'shop'});
  const k=st.k*mm,k1=st.k1*mm,where=columnIsNew?'Shop':'Field';
  if(r.flangeJoint==='fillet'){
   for(const [y,out] of [[top,1],[top-d,-1]] as const){
    filletWeld(group,`${id}-flange-column-${out}`,V(x-bf/2,y,face),V(x+bf/2,y,face),V(0,out,0),V(0,0,-1),r.flangeWeld*mm,weldMaterial,`${where} fillet, outer face of the flange to the column flange; designed weld group.`,support,column);
    for(const sx of [-1,1])filletWeld(group,`${id}-flange-column-inner-${out}-${sx}`,V(x+sx*k1,y-out*tf,face),V(x+sx*bf/2,y-out*tf,face),V(0,-out,0),V(0,0,-1),r.flangeWeld*mm,weldMaterial,`${where} fillet, inner face of the flange to the column flange; designed weld group.`,support,column);
   }
  }else for(const [y,label] of [[top-tf/2,'top'],[top-d+tf/2,'bottom']] as const){
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(bf,tf,.001),weldMaterial);mesh.position.set(x,y,face-.0005);mesh.name=`${id}-flange-cjp-${label}`;
   mesh.userData.part={id:mesh.name,family:'CJP weld indication',description:`${where} CJP groove weld, flange to the column flange. Surface indication only; groove preparation and backing are not modeled.`,support,weld:{kind:'CJP indication',length:st.bf/1000,...column}} satisfies PartInfo;group.add(mesh);
  }
  for(const sx of [-1,1])filletWeld(group,`${id}-web-column-${sx}`,V(x+sx*tw/2,top-k,face),V(x+sx*tw/2,top-d+k,face),V(sx,0,0),V(0,0,-1),r.webWeld*mm,weldMaterial,`${where} fillet, web to the column flange; designed weld group.`,support,column);
 });
 return group;
}
/**
 * New built-up tapered I haunches: every plate (web, flared top flange, sloping bottom flange, bearing stiffeners,
 * tip end plate) and every fillet to the designed sizes, from the same geometry as the checks and the details; the
 * CJP flange joints as surface indications. x along the runway, y up, z from the girder web line toward the column.
 */
export function buildTaperedHaunches(b:BracketInput,supports:number[],seatTop:number,steel:THREE.Material,edge:THREE.LineBasicMaterial,bearing?:{width:number;length:number;thickness:number},weldMaterial:THREE.Material=steel,columnIsNew=false,bearingWidth?:number){
 const group=new THREE.Group();group.name='designed-welded-column-brackets';group.userData.designedBracket=true;group.userData.bracketArrangement='tapered-haunch';
 const mm=.001,W=(bearing?.width??bearingWidth??0)/mm,g=haunchGeometry(b,W),{plates,welds}=haunchPlatesAndWelds(g,!columnIsNew),face=b.reach*mm;
 const description='Designed built-up tapered I haunch; see Column bracket checks and the bracket details. Receiving building global capacity is separate.';
 supports.forEach((x,i)=>{
  const id=`WB-S${i+1}`,support={x,z:face};
  // Haunch coordinates (mm: x along the runway, y from the column face, z up from the top) to the model (m).
  const P=(q:XYZ)=>new THREE.Vector3(x+q[0]*mm,seatTop+q[2]*mm,face-q[1]*mm),D=(q:XYZ)=>new THREE.Vector3(q[0],q[2],-q[1]).normalize();
  // A continuous girder's bearing plate, centered on the grid (simple-span bearings are drawn with the girder ends).
  if(bearing){const box=new THREE.Mesh(new THREE.BoxGeometry(bearing.length,bearing.thickness,bearing.width),steel);box.name=`${id}-bearing`;box.position.set(x,seatTop+bearing.thickness/2,0);box.userData.part={id:box.name,family:'Girder bearing plate',description,support} satisfies PartInfo;group.add(box);}
  for(const pl of plates){
   // A prism: the outline in its own plane extruded through the thickness along the face normal.
   const pts=pl.outline.map(P),o=pts[0],u=pts[1].clone().sub(o).normalize(),n=D(pl.normal),v=new THREE.Vector3().crossVectors(n,u);
   const shape=new THREE.Shape(pts.map(q=>{const r=q.clone().sub(o);return new THREE.Vector2(r.dot(u),r.dot(v));}));
   const geo=new THREE.ExtrudeGeometry(shape,{depth:pl.thickness*mm,bevelEnabled:false});geo.applyMatrix4(new THREE.Matrix4().makeBasis(u,v,n).setPosition(o));
   const mesh=new THREE.Mesh(geo,steel);mesh.name=`${id}-${pl.id}`;mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo),edge));
   mesh.userData.part={id:mesh.name,family:`Tapered haunch ${pl.name.toLowerCase()}`,description,support} satisfies PartInfo;group.add(mesh);
  }
  for(const w of welds){
   const execution={location:w.location,existingSteel:w.location==='field'};
   if(w.kind==='cjp'){
    const a=P(w.path[0]),c=P(w.path[1]),mesh=new THREE.Mesh(new THREE.BoxGeometry(a.distanceTo(c),w.size*mm,.001),weldMaterial);mesh.position.copy(a.clone().add(c).multiplyScalar(.5));mesh.position.z+=.0005;mesh.name=`${id}-${w.id}`;
    mesh.userData.part={id:mesh.name,family:'CJP weld indication',description:`${w.location==='field'?'Field':'Shop'} CJP groove weld, ${w.name.toLowerCase()}. Surface indication only; groove preparation and backing are not modeled.`,support,weld:{kind:'CJP indication',length:a.distanceTo(c),...execution}} satisfies PartInfo;group.add(mesh);
   }else w.runs.forEach((r,j)=>filletWeld(group,`${id}-${w.id}-${j}`,P(r.path[0]),P(r.path[1]),D(r.legs[0]),D(r.legs[1]),w.size*mm,weldMaterial,`${w.location==='field'?'Field':'Shop'} fillet, ${w.name.toLowerCase()}; designed size.`,support,execution));
  }
 });
 return group;
}

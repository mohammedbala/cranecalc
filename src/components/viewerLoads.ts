import * as THREE from 'three';
import type {CalculationSnapshot} from '../engine/types';
import {beamSystem} from '../engine/beam';
import {format} from '../engine/units';

export type LoadView='applied'|'reactions'|'traction'|'off';
export type LoadKind='vertical'|'lateral'|'dead'|'reaction'|'traction';
type XYZ=[number,number,number];
export interface ViewerLoad {
 id:string; kind:LoadKind; mode:Exclude<LoadView,'off'>; amount:number; x:number;
 label:string; description:string; anchor:XYZ; attachment:XYZ; arrows:{tail:XYZ;tip:XYZ}[];
}
export const loadColors:Record<LoadKind,string>={vertical:'#be4939',lateral:'#246fac',dead:'#66717c',reaction:'#168477',traction:'#a9650a'};
export const loadViewNotes:Record<Exclude<LoadView,'off'>,string>={
 applied:'Unfactored wheel loads including entered impact; signed lateral thrust; dead load includes girder, rail and added load.',
 reactions:'Vertical support reactions ON the girder for this wheel position, including dead load and impact. Shared supports show the sum from adjacent bays.',
 traction:'Entered longitudinal resultant per crane on this runway. Opposite arrows are alternative directions, not simultaneous forces; wheel distribution is unspecified.'
};

/** Presentation of the existing moving-analysis case, not a new design combination.
 * Coordinates use the viewer's metres, while forces and positions retain N/mm.
 * Recompute reactions for THIS case: demand.reactions belongs to peak reaction.
 */
export function viewerLoads(snapshot:CalculationSnapshot|null,governing:string):ViewerLoad[]{
 const analysis=snapshot?.analysis,lc=analysis?.demand.governing[governing];
 if(!snapshot||!analysis||!lc)return [];
 const p=snapshot.input,L=p.spans.reduce((a,b)=>a+b,0),d=p.section.d/1000;
 const railTop=d/2+(p.section.kind==='cap'?p.section.capTw/1000:0)+Math.max(.025,p.railHeight/1000)+.0125;
 const z=p.railEccentricity/1000,radius=Math.max(.075,d*.16),size=Math.max(.65,Math.min(1.6,L/1000*.045));
 const rows:ViewerLoad[]=[];
 const label=(id:string,v:number,line=false)=>`${id} · ${format(Math.abs(v),line?'lineLoad':'force',p.units)}`;
 lc.points.forEach((pt,i)=>{
  const x=pt.x/1000-L/2000,attachment:XYZ=[x,railTop,z];
  if(Number.isFinite(pt.vertical)&&Math.abs(pt.vertical)>1e-6){
   const tip:XYZ=[x,railTop+2*radius+.025,z],tail:XYZ=[x,tip[1]+Math.sign(pt.vertical)*size,z],id=`V${i+1}`;
   rows.push({id,kind:'vertical',mode:'applied',amount:pt.vertical,x:pt.x,label:label(id,pt.vertical),description:`${pt.crane} · wheel ${i+1} vertical, including entered impact`,anchor:tail,attachment,arrows:[{tail,tip}]});
  }
  // PointLoad.lateral already carries the individual crane sign. Do not apply
  // lateralSign again: that legacy field only describes the first crane.
  if(Number.isFinite(pt.lateral)&&Math.abs(pt.lateral)>1e-6){
   const tip:XYZ=[x,railTop+radius,z],tail:XYZ=[x,tip[1],z-Math.sign(pt.lateral)*size],id=`H${i+1}`;
   rows.push({id,kind:'lateral',mode:'applied',amount:pt.lateral,x:pt.x,label:label(id,pt.lateral),description:`${pt.crane} · wheel ${i+1} lateral ${pt.lateral>0?'+Z':'−Z'}`,anchor:tail,attachment,arrows:[{tail,tip}]});
  }
 });
 const q=analysis.selfWeight+p.deadLoad+p.railWeight;
 let start=0;
 if(Number.isFinite(q)&&q>1e-9)for(const [i,span] of p.spans.entries()){
  const y=d/2,zD=p.section.bf/2000+.22,arrows=Array.from({length:5},(_,j)=>{
   const x=(start+span*(j+.5)/5)/1000-L/2000;
   return {tail:[x,y+size*.5,zD] as XYZ,tip:[x,y,zD] as XYZ};
  }),id=`D${i+1}`,x=start+span/2;
  rows.push({id,kind:'dead',mode:'applied',amount:q,x,label:label(id,q,true),description:`Bay ${i+1} · uniform girder, rail and added dead load`,anchor:arrows[2].tail,attachment:arrows[2].tip,arrows});start+=span;
 }
 if(snapshot.properties&&Number.isFinite(q)){
  const reactions=beamSystem(p.spans,p.section.E*snapshot.properties.Ix,p.system).evaluate(lc.points.map(pt=>({x:pt.x,p:pt.vertical})),q).reactions;
  for(const [i,r] of reactions.entries()){
   if(!Number.isFinite(r.r)||Math.abs(r.r)<1e-5)continue;
   const id=`R${i+1}`,x=r.x/1000-L/2000,tip:XYZ=[x,-d/2,0],tail:XYZ=[x,tip[1]-Math.sign(r.r)*size,0];
   rows.push({id,kind:'reaction',mode:'reactions',amount:r.r,x:r.x,label:label(id,r.r),description:`Support ${i+1} · ${r.r>0?'upward reaction on girder':'downward hold-down reaction (uplift)'}`,anchor:tail,attachment:tip,arrows:[{tail,tip}]});
  }
 }
 p.cranes.forEach((crane,i)=>{
  const origin=lc.positions[i];if(!Number.isFinite(origin)||!Number.isFinite(crane.longitudinal)||crane.longitudinal<=0)return;
  const wheels=crane.wheels.map(w=>origin+w.offset).filter(x=>x>=0&&x<=L);if(!wheels.length)return;
  const station=wheels.reduce((a,b)=>a+b,0)/wheels.length,x=station/1000-L/2000,y=railTop+2*radius+size*.6,id=`T${i+1}`,tail:XYZ=[x,y,z];
  rows.push({id,kind:'traction',mode:'traction',amount:crane.longitudinal,x:station,label:`${id} · ±${format(crane.longitudinal,'force',p.units)}`,description:`${crane.name} · reversible longitudinal resultant; either direction separately`,anchor:tail,attachment:[x,railTop,z],arrows:[-1,1].map(sign=>({tail,tip:[x+sign*size,y,z] as XYZ}))});
 });
 return rows;
}

/** Separate scene overlay: never mirrored, picked as hardware, or clash-tested. */
export function buildLoadArrows(loads:ViewerLoad[]){
 const group=new THREE.Group();group.name='calculated-runway-loads';
 const layers={applied:new THREE.Group(),reactions:new THREE.Group(),traction:new THREE.Group()};
 for(const [name,layer] of Object.entries(layers)){layer.name=`load-view-${name}`;group.add(layer);}
 for(const load of loads){
  const item=new THREE.Group();item.name=load.id;item.userData.viewerLoad=load;layers[load.mode].add(item);
  const material=new THREE.MeshBasicMaterial({color:loadColors[load.kind],depthTest:false,depthWrite:false,transparent:true,opacity:.95});
  for(const {tail,tip} of load.arrows){
   const a=new THREE.Vector3(...tail),b=new THREE.Vector3(...tip),delta=b.clone().sub(a),length=delta.length(),direction=delta.normalize(),head=length*.19;
   const shaft=new THREE.Mesh(new THREE.CylinderGeometry(length*.013,length*.013,length-head,8),material);
   shaft.position.copy(a).addScaledVector(direction,(length-head)/2);shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
   const cone=new THREE.Mesh(new THREE.ConeGeometry(length*.057,head,12),material);cone.position.copy(b).addScaledVector(direction,-head/2);cone.quaternion.copy(shaft.quaternion);
   shaft.renderOrder=50;cone.renderOrder=50;item.add(shaft,cone);
  }
  if(load.kind==='dead'){
   const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(load.arrows.map(a=>new THREE.Vector3(...a.tail))),new THREE.LineBasicMaterial({color:loadColors.dead,depthTest:false,depthWrite:false,transparent:true}));line.renderOrder=49;item.add(line);
  }
 }
 return {group,setView:(mode:LoadView)=>{for(const [name,layer] of Object.entries(layers))layer.visible=name===mode;}};
}

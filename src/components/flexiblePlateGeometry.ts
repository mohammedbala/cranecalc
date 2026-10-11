import * as THREE from 'three';
import type {ProjectInput} from '../engine/types';
import {flangeTieGeometry,tieRelease,columnGussetHeight,columnGussetExtension} from '../engine/tieGeometry';
import {boltProperties} from '../engine/connectionStrength';
import {supportColumn} from '../engine/drawingData';
import {horizontalPlateGeometry,type HardwareBuilder,type PartInfo} from './connectionDetails';
import {filletWeld} from './weldGeometry';

/**
 * Designed flexible plate tieback (AISC DG7 §11.2): at each tied flange of each girder end, the direct flange saddle
 * and its welds, the girder gusset hung from it, the column gusset (with the release slots when enabled) and one
 * flexible plate on the gusset face toward the girder end, bolted in single shear with the heads on the plate. The
 * same geometry as the engine checks and the drawings (flangeTieGeometry); the column face is the modeled face.
 */
export function buildFlexiblePlateTies(p:ProjectInput,columnFace:number,steel:THREE.Material,edge:THREE.LineBasicMaterial,weldMaterial:THREE.Material=steel,hardware?:HardwareBuilder){
 const group=new THREE.Group();group.name='flexible-plate-ties';group.userData.tieArrangement='flexible-plate';
 const g=flangeTieGeometry(p),d=p.details;if(!g||!d)return group;
 const mm=.001,L=p.spans.reduce((a,b)=>a+b,0)*mm,b=p.section,depth=b.d*mm,tf=b.tf*mm,t=d.brace,c=t.connection,a=g.attachment;
 const th=t.thickness*mm,gw=t.gussetThickness*mm,width=t.width*mm,length=t.length*mm,rel=tieRelease(p),hg=columnGussetHeight(p)*mm,col=supportColumn(p);
 const conn=g.connection*mm,gap=g.barGap*mm,z0=columnFace-gap-length,hole=boltProperties(c.grade,c.diameter).hole*mm;
 const box=(geometry:THREE.BufferGeometry,id:string,family:string,description:string,at:THREE.Vector3,station:number,rotate=false)=>{
  const mesh=new THREE.Mesh(geometry,steel);mesh.position.copy(at);mesh.name=id;mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),edge));
  // A vertical Y/Z plate with genuine holes: the geometry's local X/Z plane turned upright, thickness along X.
  if(rotate)mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0)));
  mesh.userData.part={id,family,description,support:{x:station,z:0}} satisfies PartInfo;group.add(mesh);return mesh;
 };
 for(const v of g.stations){
  const id=`bay-${v.bay}-${v.end}`,tx=v.tieX*mm-L/2,s=v.plateSide,station=v.station*mm-L/2;
  for(const side of g.sides){
   const y=(side>0?g.topCenter:g.bottomCenter)*mm,ts=a.saddleThickness*mm,zs=g.rootStart*mm,ze=g.rootEnd*mm,sz=a.weldSize*mm,flange=side*(depth/2-tf);
   box(new THREE.BoxGeometry(a.saddleLength*mm,ts,ze-zs),`${id}-plate-saddle-${side}`,'Direct flange saddle','Saddle under the tied flange, welded to it only by two transverse end fillets; local flange, saddle and weld checks.',new THREE.Vector3(tx,flange-side*ts/2,(zs+ze)/2),station);
   for(const sign of [-1,1]){
    const sx=tx+sign*a.saddleLength*mm/2;
    filletWeld(group,`${id}-plate-saddle-weld-${side}-${sign}`,new THREE.Vector3(sx,flange,zs),new THREE.Vector3(sx,flange,ze),new THREE.Vector3(sign,0,0),new THREE.Vector3(0,-side,0),sz,weldMaterial,'Transverse end fillet, saddle to flange; direct flange load path, no web attachment.',{x:station,z:0},{location:'shop'});
    const gx=tx+sign*gw/2,gy=flange-side*ts;
    filletWeld(group,`${id}-plate-gusset-weld-${side}-${sign}`,new THREE.Vector3(gx,gy,zs),new THREE.Vector3(gx,gy,ze),new THREE.Vector3(sign,0,0),new THREE.Vector3(0,-side,0),sz,weldMaterial,'Gusset-to-saddle fillet; tie force, lap couple and imposed movement checked.',{x:station,z:0},{location:'shop'});
    filletWeld(group,`${id}-plate-column-weld-${side}-${sign}`,new THREE.Vector3(gx,y-hg/2,columnFace),new THREE.Vector3(gx,y+hg/2,columnFace),new THREE.Vector3(sign,0,0),new THREE.Vector3(0,0,-1),c.weldSize*mm,weldMaterial,`${col.field?'Field':'Shop'} weld, column gusset to ${col.isNew?'the new':'the existing'} column; root weld, column flange and fatigue checked.`,{x:station,z:columnFace},col.field?{location:'field',existingSteel:true}:{location:'shop'});
   }
   // Girder gusset from the saddle to the plate bottom, through the girder-end bolt group; the column gusset from the
   // column face past the column-end bolt group by its slotted end edge.
   for(const [index,at] of [z0+conn/2,columnFace-gap-conn/2].entries()){
    const rootStart=index===0?zs:at-conn/2-columnGussetExtension(p)*mm,rootEnd=index===1?columnFace:at+conn/2;
    const top=index===0?flange-side*ts:y+side*hg/2,bottom=index===0?y-side*width/2:y-side*hg/2,rootY=(top+bottom)/2,rootHeight=Math.abs(top-bottom);
    const holes=[];for(let row=0;row<c.rows;row++)for(const line of [-1,1])holes.push({x:at-conn/2+c.edge*mm+row*c.pitch*mm-(rootStart+rootEnd)/2,z:y+line*c.gauge*mm/2-rootY,...(index===1&&rel?{diameter:rel.width*mm,slotLength:rel.slot*mm,slotAxis:'z' as const}:{diameter:hole})});
    box(horizontalPlateGeometry(rootEnd-rootStart,rootHeight,gw,holes),`${id}-plate-gusset-${side>0?'top':'bottom'}-${index+1}`,'Flexible plate tie gusset',index===1&&rel?'Column gusset with vertical slots; sleeved bolts release support deflection. Root weld, column flange, bearing and fatigue checked.':'Girder gusset on the flange saddle; lap couple, imposed movement and fatigue checked.',new THREE.Vector3(tx,rootY,(rootStart+rootEnd)/2),station,true);
   }
   // The flexible plate on the gusset face toward its girder end, drilled at both ends.
   const holes=[];for(const offset of [0,length-conn])for(let row=0;row<c.rows;row++)for(const line of [-1,1])holes.push({x:offset+c.edge*mm+row*c.pitch*mm-length/2,z:line*c.gauge*mm/2,diameter:hole});
   box(horizontalPlateGeometry(length,width,th,holes),`${id}-flexible-plate-${side>0?'top':'bottom'}`,'Flexible plate tieback','One vertical plate across the runway, bolted in single shear: stiff across the runway, it flexes about its weak axis with girder end rotation and thermal travel. Strength, stability, lap bolts, imposed movement and fatigue checked.',new THREE.Vector3(tx+s*(gw+th)/2,y,z0+length/2),station,true);
   // Single-shear bolts, heads on the plate; F436 washer and nut on the gusset face (on the sleeve end at the slotted column gusset).
   if(hardware)for(const [index,offset] of [0,length-conn].entries())for(let row=0;row<c.rows;row++)for(const line of [-1,1]){
    const extra=index===1&&rel?rel.clearance*mm:0,origin=tx-s*(gw/2+extra);
    hardware.bolt(group,{id:`${id}-plate-bolt-${side>0?'top':'bottom'}-${index+1}-${row+1}-${line>0?2:1}`,family:'Flexible plate tie bolt',description:index===1&&rel?'Single shear; pretensioned against a steel sleeve in the vertical gusset slot.':'Single shear, slip-critical; heads on the plate.',diameter:c.diameter*mm,grip:gw+th+extra,support:{x:station,z:0}},new THREE.Vector3(origin,y+line*c.gauge*mm/2,z0+offset+c.edge*mm+row*c.pitch*mm),new THREE.Vector3(s,0,0));
   }
  }
 }
 return group;
}

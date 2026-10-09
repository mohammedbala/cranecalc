import * as THREE from 'three';
import type {PartInfo} from './connectionDetails';
export interface HardwareClash {a:string;b:string;component:string;overlapMm:number;point:[number,number,number];reference:boolean}
export interface HardwareAudit {method:string;toleranceMm:number;hardware:number;solids:number;pairs:number;excludedHardware:string[];issues:HardwareClash[];limitations:string[]}
const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
/** A positive finding is an actual solid interval intersecting an interior
 * fastener probe, NOT a bounding-box clash. Welded/faying face contact is ignored.
 * This finite sampling is a screening tool, not a certified solid/swept-volume test. */
export function checkHardwareClashes(root:THREE.Object3D,toleranceMm=.5):HardwareAudit{
 root.updateMatrixWorld(true);const tol=toleranceMm/1000,meshes:THREE.Mesh[]=[];
 root.traverse(o=>{if((o as THREE.Mesh).isMesh)meshes.push(o as THREE.Mesh);});
 const bounds=new Map(meshes.map(m=>[m,new THREE.Box3().setFromObject(m)]));
 const targets=meshes.map((m,i)=>{const proxy=new THREE.Mesh(m.geometry,material);proxy.matrixWorld.copy(m.matrixWorld);const id=m.userData.part?.id??m.name??`solid-${i}`;return {original:m,proxy,box:bounds.get(m)!,id:id||`solid-${i}`,normal:new THREE.Matrix3().getNormalMatrix(m.matrixWorld)};});
 const excludedHardware=meshes.filter(m=>m.userData.part?.family==='Wheel hub bolt').map(m=>m.userData.part.id as string);
 const hardware=meshes.filter(m=>m.userData.part?.diameter&&m.userData.part.family!=='Wheel hub bolt'),ray=new THREE.Raycaster(),issues:HardwareClash[]=[];let pairs=0;
 for(const bolt of hardware){
  const p=bolt.userData.part as PartInfo,d=p.diameter!,g=p.grip??.0254,wt=.16*d,nh=.85*d,projection=.65*d,axis=new THREE.Vector3(0,1,0).transformDirection(bolt.matrixWorld);
  const profiles=p.anchor?[{kind:'exposed anchor rod',a:0,b:g+wt+nh+projection,ro:.45*d,ri:0},{kind:'washer',a:g,b:g+wt,ro:d,ri:.55*d},{kind:'nut',a:g+wt,b:g+wt+nh,ro:.8125*d,ri:.53*d}]:[
   {kind:'shank / exposed thread core',a:-wt-nh-projection,b:g+wt,ro:.45*d,ri:0},
   {kind:'full shank',a:Math.min(g*.35,d*.5),b:g+wt,ro:.5*d,ri:0},
   {kind:'head washer',a:g,b:g+wt,ro:d,ri:.55*d},{kind:'bolt head',a:g+wt,b:g+wt+.65*d,ro:.8125*d,ri:0},
   {kind:'nut washer',a:-wt,b:0,ro:d,ri:.55*d},{kind:'nut',a:-wt-nh,b:-wt,ro:.8125*d,ri:.53*d}];
  for(const t of targets){
   if(t.original===bolt||!bounds.get(bolt)!.intersectsBox(t.box))continue;
   const other=t.original.userData.part as PartInfo|undefined;if(other?.diameter&&p.id.localeCompare(other.id)>0)continue;
   // Intentional embedment is outside exposed-anchor profiles, not a blanket host exclusion.
   pairs++;let found:HardwareClash|undefined;
   const center=t.box.getCenter(new THREE.Vector3()),radius=t.box.getSize(new THREE.Vector3()).length()/2;
   for(const profile of profiles){
    if(profile.b-profile.a<tol)continue;
    const probes:number[][]=profile.ri===0?[[0,0]]:[];
    for(const ratio of [.2,.6,.94])for(let n=0;n<12;n++){const r=profile.ri+(profile.ro-profile.ri)*ratio,a=n*Math.PI/6;probes.push([r*Math.cos(a),r*Math.sin(a)]);}
    for(const [x,z] of probes){
     const origin=new THREE.Vector3(x,0,z).applyMatrix4(bolt.matrixWorld),base=center.clone().sub(origin).dot(axis)-radius-.001;
     ray.set(origin.clone().addScaledVector(axis,base),axis);ray.near=0;ray.far=2*radius+.002;
     const hits=ray.intersectObject(t.proxy,false);if(hits.length<2)continue;
     let winding=0,entry=0;
     for(let h=0;h<hits.length;){let sum=0,j=h;
      while(j<hits.length&&Math.abs(hits[j].distance-hits[h].distance)<1e-7){const n=hits[j].face!.normal.clone().applyNormalMatrix(t.normal).dot(axis);if(Math.abs(n)>1e-7)sum+=n<0?1:-1;j++;}
      // Coplanar face triangles may duplicate a hit: normalize to one crossing.
      sum=Math.sign(sum);const before=winding;winding+=sum;
      const y=base+hits[h].distance;
      if(before===0&&winding!==0)entry=y;
      if(before!==0&&winding===0){const lo=Math.max(entry,profile.a+tol/2),hi=Math.min(y,profile.b-tol/2),overlap=hi-lo;
       if(overlap>tol&&(!found||overlap*1000>found.overlapMm)){const point=origin.clone().addScaledVector(axis,(lo+hi)/2);found={a:p.id,b:t.id,component:profile.kind,overlapMm:overlap*1000,point:point.toArray(),reference:p.id.startsWith('F-')||t.id.startsWith('F-')||/^B(?:-|\d)/.test(p.id)||/^B(?:-|\d)/.test(t.id)||/^S\d+-/.test(p.id)};}
      }h=j;
     }
    }
   }
   if(found)issues.push(found);
  }
 }
 return {method:'Static solid-intersection probes through fastener component envelopes',toleranceMm,hardware:hardware.length,solids:meshes.length,pairs,excludedHardware,issues:issues.sort((a,b)=>b.overlapMm-a.overlapMm),limitations:[
  'Positive findings intersect the actual modeled solid, including drilled holes. Overlap is length along a probe, not minimum separation.',
  'Finite radial probes can miss small contacts between probes, hex corners, thread crests and unmodeled fabrication tolerances. No finding is not proof of clash-free fabrication.',
  'Intentional anchor embedment is excluded; faying contact below tolerance is ignored. Bolt shanks through real holes are retained in the scan.',
  'Schematic crane wheel-hub bolts and intentional buried anchor lengths are excluded. Plate/member clashes away from hardware are not scanned.',
  'Static installed geometry only: wrench access, bolt insertion, weld access, sliding/rotation travel, crane swept clearances and unmodeled rail joints are not checked.',
  'Reference building and opposite runway hardware are illustrative. Scanning geometry does not verify their structural design.'
 ]};
}

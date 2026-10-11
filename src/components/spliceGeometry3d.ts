import * as THREE from 'three';
import type {ProjectInput} from '../engine/types';
import {activeSplices,spliceGeometry,spliceStations,spliceMark} from '../engine/spliceInputs';
import {horizontalPlateGeometry,type Hole,type HardwareBuilder,type PartInfo} from './connectionDetails';

/** A plate in the x-y plane (thickness along z) with round holes at (x, y), centred on its origin. */
export function verticalPlateGeometry(length:number,height:number,thickness:number,holes:{x:number;y:number;diameter:number}[]=[]){
 const shape=new THREE.Shape();
 shape.moveTo(-length/2,-height/2);shape.lineTo(length/2,-height/2);shape.lineTo(length/2,height/2);shape.lineTo(-length/2,height/2);shape.closePath();
 for(const h of holes){const p=new THREE.Path();p.absarc(h.x,h.y,h.diameter/2,0,Math.PI*2,true);shape.holes.push(p);}
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:12});
 geometry.translate(0,0,-thickness/2);
 return geometry;
}

/**
 * Holes of the girder field splices in the girder flanges and web, in viewer metres: x along the runway from its
 * middle, z across it, y up from the girder mid-depth for the web.
 */
export function spliceGirderHoles(p:ProjectInput){
 const sp=activeSplices(p),stations=spliceStations(p),out={top:[] as Hole[],bottom:[] as Hole[],web:[] as {x:number;y:number;diameter:number}[]};
 if(!sp||!stations.length)return out;
 const g=spliceGeometry(p,sp),L=p.spans.reduce((a,v)=>a+v,0),m=.001,d=g.hole*m;
 for(const s of stations){
  const x0=(s-L/2)*m;
  for(const [key,f] of [['top',g.top],['bottom',g.bottom]] as const)for(const x of f.rows.flatMap(v=>[-v,v]))for(const z of f.lines.flatMap(v=>[-v,v]))out[key].push({x:x0+x*m,z:z*m,diameter:d});
  for(const x of g.web.columns.flatMap(v=>[-v,v]))for(const y of g.web.rows)out.web.push({x:x0+x*m,y:y*m,diameter:d});
 }
 return out;
}

/**
 * Splice plates and bolts of every girder field splice: inner plates under the top flange, outer and inner plates
 * on the bottom flange, a plate each side of the web, and pretensioned bolts through each group, in the runway
 * viewer coordinates (metres; girder mid-depth at y = 0).
 */
export function buildGirderSplices(p:ProjectInput,materials:{plate:THREE.Material;edge:THREE.LineBasicMaterial},hardware?:HardwareBuilder){
 const group=new THREE.Group();group.name='girder-field-splices';
 const sp=activeSplices(p),stations=spliceStations(p);
 if(!sp||!stations.length)return group;
 const g=spliceGeometry(p,sp),b=p.section,L=p.spans.reduce((a,v)=>a+v,0),m=.001,d=b.d*m,tf=b.tf*m,hd=g.hole*m;
 const add=(id:string,family:string,description:string,geometry:THREE.BufferGeometry,x:number,y:number,z:number)=>{
  const mesh=new THREE.Mesh(geometry,materials.plate);mesh.name=id;mesh.position.set(x,y,z);
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),materials.edge));
  mesh.userData.part={id,family,description} satisfies PartInfo;group.add(mesh);return mesh;
 };
 stations.forEach((s,i)=>{
  const x0=(s-L/2)*m,mark=spliceMark(i);
  for(const [name,f,top] of [['top',g.top,true],['bottom',g.bottom,false]] as const){
   const i0=f.input,len=f.length*m,holes=(z0:number)=>f.rows.flatMap(v=>[-v,v]).flatMap(x=>f.lines.flatMap(v=>[-v,v]).map(z=>({x:x*m,z:z*m-z0,diameter:hd}))).filter(h=>Math.abs(h.z)<1);
   const face=top?d/2:-d/2,inward=top?-1:1;
   if(f.outer){const t=i0.outerThickness*m;add(`${mark}-${name}-outer`,'Girder splice plate',`${mark}: outer plate, ${name} flange; slip-critical faying surfaces.`,horizontalPlateGeometry(len,i0.outerWidth*m,t,holes(0).filter(h=>Math.abs(h.z)<i0.outerWidth*m/2)),x0,face-inward*t/2,0);}
   if(f.inner)for(const side of [-1,1]){
    const t=i0.innerThickness*m,zc=side*(f.innerFrom+f.innerTo)/2*m,w=i0.innerWidth*m;
    add(`${mark}-${name}-inner-${side>0?'R':'L'}`,'Girder splice plate',`${mark}: inner plate, ${name} flange, flush with the flange tip.`,horizontalPlateGeometry(len,w,t,holes(zc).filter(h=>Math.abs(h.z)<w/2)),x0,face+inward*(tf+t/2),zc);
   }
   // Bolts: heads on the outer face, nuts inside the section; grip through every ply.
   const grip=(f.outer?i0.outerThickness:0)+b.tf+(f.inner?i0.innerThickness:0),nutFace=face+inward*(b.tf+(f.inner?i0.innerThickness:0))*m;
   if(hardware)for(const x of f.rows.flatMap(v=>[-v,v]))for(const z of f.lines.flatMap(v=>[-v,v]))
    hardware.bolt(group,{id:`${mark}-${name}-${Math.round(x)}-${Math.round(z)}`,family:'Girder splice bolt',description:`${mark}: ${sp.grade} slip-critical bolt, ${name} flange`,diameter:sp.diameter*m,grip:grip*m},new THREE.Vector3(x0+x*m,nutFace,z*m),new THREE.Vector3(0,top?1:-1,0));
  }
  const w=sp.web,wl=g.web.length*m,holes=g.web.columns.flatMap(v=>[-v,v]).flatMap(x=>g.web.rows.map(y=>({x:x*m,y:y*m,diameter:hd})));
  for(const side of [-1,1])add(`${mark}-web-${side>0?'R':'L'}`,'Girder splice plate',`${mark}: web plate, ${side>0?'far':'near'} side.`,verticalPlateGeometry(wl,w.height*m,w.thickness*m,holes),x0,0,side*(b.tw/2+w.thickness/2)*m);
  if(hardware)for(const h of holes)hardware.bolt(group,{id:`${mark}-web-${Math.round(h.x/m)}-${Math.round(h.y/m)}`,family:'Girder splice bolt',description:`${mark}: ${sp.grade} slip-critical bolt, web`,diameter:sp.diameter*m,grip:(b.tw+2*w.thickness)*m},new THREE.Vector3(x0+h.x,h.y,-(b.tw/2+w.thickness)*m),new THREE.Vector3(0,0,1));
 });
 return group;
}

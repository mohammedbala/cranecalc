import * as THREE from 'three';
import { horizontalPlateGeometry, type Hole } from './connectionDetails';

export type FrameStyle = 'tapered' | 'rolled';
export interface TaperPoint { s:number; upper:number; lower:number }
interface Materials { steel:THREE.Material; edge:THREE.LineBasicMaterial }

// Fabricated plate geometry for the illustrative metal building. These dimensions
// are visual proportions, not AISC rolled-section properties or member designs.
export const portalDimensions={kneeDepth:.8,ridgeDepth:.35,columnKneeDepth:.75,flangeWidth:.3,flangeT:.018,webT:.01};
export function columnProfile(length:number,bracketStation:number,baseDepth:number):TaperPoint[]{
 const lower=-baseDepth/2;
 return [{s:-length/2,lower,upper:lower+baseDepth*.8},{s:bracketStation,lower,upper:lower+baseDepth},{s:length/2,lower,upper:lower+portalDimensions.columnKneeDepth}];
}
export function profileUpper(points:TaperPoint[],s:number){
 const found=points.findIndex((p,index)=>index>0&&s<=p.s),i=found<0?points.length-2:Math.max(0,found-1);
 const a=points[i],b=points[i+1],t=THREE.MathUtils.clamp((s-a.s)/(b.s-a.s),0,1);return a.upper+(b.upper-a.upper)*t;
}

export function taperedISection(name:string,points:TaperPoint[],bf:number,tf:number,tw:number,materials:Materials,lowerHoles:Hole[]=[],upperHoles:Hole[]=[]){
 const group=new THREE.Group();group.name=name;group.userData.tapered=true;group.userData.profile=points;
 const outline=(geometry:THREE.BufferGeometry,suffix:string)=>{
  const mesh=new THREE.Mesh(geometry,materials.steel);mesh.name=suffix;mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),materials.edge));group.add(mesh);return mesh;
 };
 const shape=new THREE.Shape();shape.moveTo(points[0].s,points[0].lower+tf);
 for(const p of points.slice(1))shape.lineTo(p.s,p.lower+tf);
 for(const p of [...points].reverse())shape.lineTo(p.s,p.upper-tf);shape.closePath();
 const web=new THREE.ExtrudeGeometry(shape,{depth:tw,bevelEnabled:false});web.translate(0,0,-tw/2);outline(web,'web');
 for(const [side,holes] of [['upper',upperHoles],['lower',lowerHoles]] as const){
  for(let i=0;i<points.length-1;i++){
   const a=points[i],b=points[i+1],dy=b[side]-a[side],dx=b.s-a.s,angle=Math.atan2(dy,dx),cos=Math.cos(angle),length=Math.hypot(dx,dy),mid=(a.s+b.s)/2;
   const localHoles=holes.filter(h=>h.x>=a.s&&h.x<=b.s).map(h=>({...h,x:(h.x-mid)/cos}));
   const mesh=outline(horizontalPlateGeometry(length,bf,tf,localHoles),`${side==='lower'?'bottom':'top'}-flange${points.length>2?`-${i+1}`:''}`);
   mesh.rotation.z=angle;mesh.position.set(mid,(a[side]+b[side])/2+(side==='lower'?tf/2:-tf/2)/cos,0);
  }
 }
 return group;
}

// Thin, lipped C/Z members used for the exposed secondary framing.
export function coldFormedMember(name:string,length:number,depth:number,width:number,zSection:boolean,materials:Materials){
 const group=new THREE.Group();group.name=name;group.userData.coldFormed=zSection?'Z':'C';const t=.003,lip=.018;
 const plate=(suffix:string,h:number,w:number,y:number,z:number)=>{const geometry=new THREE.BoxGeometry(length,h,w),mesh=new THREE.Mesh(geometry,materials.steel);mesh.name=`${name}-${suffix}`;mesh.position.set(0,y,z);mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),materials.edge));group.add(mesh);};
 plate('web',depth,t,0,0);
 for(const sign of [-1,1]){const side=zSection?sign:1;plate(`flange-${sign}`,t,width,sign*(depth-t)/2,side*width/2);plate(`lip-${sign}`,lip,t,sign*(depth-lip)/2,side*(width-t/2));}
 return group;
}

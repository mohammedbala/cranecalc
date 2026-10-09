import * as THREE from 'three';

export type FastenerComponent = 'shaft' | 'thread' | 'head' | 'head-washer' | 'nut-washer' | 'nut';
export const fastenerColors:Record<FastenerComponent,string>={shaft:'#b99c58',thread:'#78612e',head:'#d4ad55','head-washer':'#e4cf94','nut-washer':'#e4cf94',nut:'#b68d3e'};
export const fastenerLabels:Record<FastenerComponent,string>={shaft:'Bolt shank',thread:'Helical thread',head:'Hex bolt head','head-washer':'Head washer','nut-washer':'Nut washer',nut:'Hex nut'};
export interface FastenerPiece { kind:FastenerComponent; geometry:THREE.BufferGeometry }

function ring(outside:number,inside:number,height:number,y:number,hex=false) {
 const shape=new THREE.Shape();
 if(hex){for(let i=0;i<6;i++){const a=Math.PI/6+i*Math.PI/3,x=outside*Math.cos(a),z=outside*Math.sin(a);if(i===0)shape.moveTo(x,z);else shape.lineTo(x,z);}shape.closePath();}
 else shape.absarc(0,0,outside,0,Math.PI*2,false);
 if(inside){const hole=new THREE.Path();hole.absarc(0,0,inside,0,Math.PI*2,true);shape.holes.push(hole);}
 const bevel=Math.min(height*.12,outside*.025);
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:height-2*bevel,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,curveSegments:20,steps:1});
 geometry.rotateX(-Math.PI/2);geometry.translate(0,y+bevel,0);return geometry;
}

// A continuous V-profile helix around the rod, rather than stacked rings.
// Pitch/proportions are representative visualization data, not a thread specification.
export function helicalThreadGeometry(diameter:number,start:number,end:number,pitch=diameter/8) {
 const core=diameter*.45,crest=diameter*.51,profile=[[core,-.42],[crest,-.08],[crest,.08],[core,.42]];
 const turns=Math.max(1,(end-start)/pitch-.84),steps=Math.ceil(turns*24),positions:number[]=[],indices:number[]=[];
 for(let i=0;i<=steps;i++){
  const angle=i/steps*turns*Math.PI*2,center=start+pitch*.42+i/steps*turns*pitch;
  for(const [radius,offset] of profile)positions.push(radius*Math.cos(angle),center+offset*pitch,radius*Math.sin(angle));
 }
 for(let i=0;i<steps;i++)for(let j=0;j<3;j++){
  const a=i*4+j,b=a+4;indices.push(a,a+1,b,b,a+1,b+1);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));geometry.computeVertexNormals();
 geometry.userData.threadPitch=pitch;geometry.userData.turns=turns;return geometry;
}

export function buildFastenerPieces(diameter:number,grip:number,anchor=false,embed=.16):FastenerPiece[] {
 const pieces:FastenerPiece[]=[],washerT=diameter*.16,nutH=diameter*.85,projection=diameter*.65,hexRadius=diameter*1.625/Math.sqrt(3);
 const bottom=anchor?-embed:-washerT-nutH-projection,top=anchor?grip+washerT+nutH+projection:grip+washerT;
 const threadStart=anchor?Math.max(bottom,grip-diameter*.5):bottom,threadEnd=anchor?top:Math.min(grip*.35,diameter*.5);
 const add=(kind:FastenerComponent,geometry:THREE.BufferGeometry)=>{
  const color=new THREE.Color(fastenerColors[kind]),values=new Float32Array(geometry.getAttribute('position').count*3);
  for(let i=0;i<values.length;i+=3){values[i]=color.r;values[i+1]=color.g;values[i+2]=color.b;}
  geometry.setAttribute('color',new THREE.BufferAttribute(values,3));pieces.push({kind,geometry});
 };
 const cylinder=(radius:number,a:number,b:number)=>{const geometry=new THREE.CylinderGeometry(radius,radius,b-a,24);geometry.translate(0,(a+b)/2,0);return geometry;};
 add('shaft',cylinder(diameter*.45,bottom,top));
 if(anchor&&threadStart>bottom)add('shaft',cylinder(diameter/2,bottom,threadStart));
 if(!anchor&&top>threadEnd)add('shaft',cylinder(diameter/2,threadEnd,top));
 add('thread',helicalThreadGeometry(diameter,threadStart,threadEnd));
 add('head-washer',ring(diameter,diameter*.55,washerT,grip));
 if(anchor)add('nut',ring(hexRadius,diameter*.53,nutH,grip+washerT,true));
 else{
  add('head',ring(hexRadius,0,diameter*.65,grip+washerT,true));
  add('nut-washer',ring(diameter,diameter*.55,washerT,-washerT));
  add('nut',ring(hexRadius,diameter*.53,nutH,-washerT-nutH,true));
 }
 return pieces;
}

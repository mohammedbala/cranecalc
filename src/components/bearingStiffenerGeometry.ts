import * as THREE from 'three';

/** Local plate outline: x runs out from the web, y down from the top flange.
 * Only the two web-side corners are clipped; the outboard edge bears against
 * both flanges. Coordinates may use mm or metres, provided inputs agree. */
export function bearingStiffenerProfile(width:number,height:number,cope:number):[number,number][]{
 return [[0,cope],[cope,0],[width,0],[width,height],[cope,height],[0,height-cope]];
}

/** Transverse plate in the Y/Z plane, centred through its X thickness. */
export function bearingStiffenerGeometry(width:number,height:number,thickness:number,cope:number,side:number){
 const profile=bearingStiffenerProfile(width,height,cope),shape=new THREE.Shape();
 profile.forEach(([x,y],i)=>i?shape.lineTo(x,height/2-y):shape.moveTo(x,height/2-y));shape.closePath();
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false});
 geometry.translate(0,0,-thickness/2);geometry.rotateY(-side*Math.PI/2);
 return geometry;
}

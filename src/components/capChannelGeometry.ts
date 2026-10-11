import * as THREE from 'three';
import {capChannelProfile,type ChannelPoint} from '../engine/channelProfile';
import type {Section} from '../engine/types';

type CapSection=Pick<Section,'capWidth'|'capDepth'|'capTw'|'capTf'|'capCatalogueId'>;
/**
 * Extrude a channel-plane outline (mm, x across, y up from the W top flange) along the world x axis, `length` metres
 * long and centred on x = 0: the outline's x maps to world z and its y to world y (metres). A mesh at (x, W top, z)
 * then sits the cap on the girder.
 */
function extrude(points:ChannelPoint[],length:number){
 const shape=new THREE.Shape(points.map(([x,y])=>new THREE.Vector2(x/1000,y/1000)));
 const g=new THREE.ExtrudeGeometry(shape,{depth:length,bevelEnabled:false,curveSegments:1,steps:1});
 // Extrusion runs along +z; turn it onto +x (z' = -x, mirror-symmetric profile) and centre it on its length.
 g.rotateY(Math.PI/2);g.translate(-length/2,0,0);
 return g;
}
/** The whole cap channel in true section (2:12 sloped flanges, root fillets). */
export const capChannelGeometry=(s:CapSection,length:number)=>extrude(capChannelProfile(s).outline,length);
/**
 * One turned-down channel flange (leg) below the web, with its sloped inner face and root fillet, for models that
 * keep the channel web as a separate (perforated) plate between y = 0 and tw. side = +1 is at world z > 0.
 */
export function capLegGeometry(s:CapSection,length:number,side:-1|1){
 const p=capChannelProfile(s),leg:ChannelPoint[]=[[p.d/2,0],...p.side.slice(1)];
 return extrude(leg.map(([x,y])=>[-side*x,y] as ChannelPoint),length);
}

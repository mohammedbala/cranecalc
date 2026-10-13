import {aiscChannelByName} from '../data/aiscChannels';
import type {Section} from './types';

/**
 * True section outline of a rolled AISC channel (C / MC shape) as the cap sits on a crane girder:
 * web horizontal on top of the W flange, flanges (legs) turned down.
 *
 * Local coordinates in mm: x across the girder (0 on the channel centerline, outer leg faces at x = ±d/2),
 * y up with y = 0 on the underside of the channel web (the face bearing on the W top flange); the back
 * of the web is at y = tw and the leg toes at y = tw - bf.
 *
 * Geometry (AISC Manual Part 1 / ASTM A6 channel profile):
 * - The inner flange face of C shapes slopes 2 in 12 (1:6). MC shapes are rolled with flatter, varying slopes
 *   that the table does not give; for them the slope (0 to 2:12) is fitted so that the outline reproduces
 *   the tabulated centroid x̄. tf is the average flange thickness, i.e. the thickness at
 *   mid-projection of the flange beyond the web, so the flange is tf + (bf - tw)/12 thick at the web face
 *   and tf - (bf - tw)/12 at the toe. The outer face is square to the web.
 * - The web-to-flange fillet radius is not tabulated. It is taken so that the fillet's tangent point on the
 *   web lies at k (the tabulated k_des, outer flange face to web toe of fillet); with no k (a non-catalog
 *   cap) or a k that does not reach past the flange root, the radius is taken as tw.
 * - The small rounding at the flange toe is ignored (toe drawn square).
 */
export interface ChannelDims{d:number;bf:number;tw:number;tf:number;k?:number;
 /** Inner flange slope, run per unit of projection; 2:12 (1/6) for C shapes, the default. */
 slope?:number}
export type ChannelPoint=[number,number];
export interface ChannelProfile{
 /** Closed outline (first point not repeated), clockwise in y-up axes, starting at the back of the web, -x end. */
 outline:ChannelPoint[];
 /** The +x half of the outline: outer top corner, down the outer face, across the toe, up the sloped face and round the fillet to the web toe of fillet (webFlat, 0). */
 side:ChannelPoint[];
 d:number;bf:number;tw:number;tf:number;
 /** Flange thickness at the web face (root) and at the toe, measured across (in x). */
 rootThickness:number;toeThickness:number;
 /** Inner flange slope used (run per unit of projection). */
 slope:number;
 /** Web-to-flange fillet radius and the outer flange face to web toe of fillet distance (= k). */
 filletRadius:number;k:number;
 /** x of the web toe of fillet (positive side): the flat underside of the web spans |x| <= webFlat. */
 webFlat:number;
 /** Leg toe level (y) and the inner face x at the toe (positive side). */
 toeY:number;toeInner:number;
 /** Inner flange face x (positive side) at level y, ignoring the fillet. */
 innerFace:(y:number)=>number;
 /** Convex trapezoid of each leg below the web (positive side): outer root, outer toe, inner toe, inner root. */
 leg:ChannelPoint[];
 area:number;
 /** Centroid y in the local axes, and x̄ measured from the back of the web (AISC "x" of a channel). */
 centroidY:number;xBar:number;
}

/** Inner flange slope of AISC channels, run per unit depth: 2 in 12. */
export const channelFlangeSlope=1/6;

export function channelProfile({d,bf,tw,tf,k,slope}:ChannelDims,arcSegments=6):ChannelProfile{
 const m=slope??channelFlangeSlope,proj=bf-tw;
 const rootThickness=tf+m*proj/2,toeThickness=Math.max(tf-m*proj/2,1e-6*tf);
 const toeY=tw-bf,half=d/2;
 // Inner face x at level y (positive side): the thickness grows by m per unit of rise toward the web.
 const innerFace=(y:number)=>half-(tf+m*(proj/2+y));
 // Corner of web underside and sloped inner face, and the fillet tangent geometry. The void corner angle α is
 // between the web underside (toward -x) and the flange face running down (dx,dy) = (m,-1).
 const len=Math.hypot(m,1),u1:ChannelPoint=[m/len,-1/len],u2:ChannelPoint=[-1,0];
 const alpha=Math.acos(u1[0]*u2[0]+u1[1]*u2[1]),cot=1/Math.tan(alpha/2);
 const fromK=k!==undefined&&k>rootThickness?(k-rootThickness)/cot:0;
 const r=Math.min(fromK>0?fromK:tw,.9*(-toeY)/cot,.9*(half-rootThickness)/cot);
 const T=r*cot,C:ChannelPoint=[half-rootThickness,0];
 const p1:ChannelPoint=[C[0]+T*u1[0],C[1]+T*u1[1]],p2:ChannelPoint=[C[0]+T*u2[0],0];
 const bis=[u1[0]+u2[0],u1[1]+u2[1]],bl=Math.hypot(bis[0],bis[1]),dist=r/Math.sin(alpha/2);
 const O:ChannelPoint=[C[0]+dist*bis[0]/bl,C[1]+dist*bis[1]/bl];
 const a1=Math.atan2(p1[1]-O[1],p1[0]-O[0]),a2=Math.atan2(p2[1]-O[1],p2[0]-O[0]);
 // Arc from the flange tangent point up to the web tangent point (the short way round).
 let sweep=a2-a1;while(sweep>Math.PI)sweep-=2*Math.PI;while(sweep<-Math.PI)sweep+=2*Math.PI;
 const arc:ChannelPoint[]=[];
 for(let i=0;i<=arcSegments;i++){const a=a1+sweep*i/arcSegments;arc.push([O[0]+r*Math.cos(a),O[1]+r*Math.sin(a)]);}
 arc[0]=p1;arc[arcSegments]=p2;
 // Right side, from the outer top corner down and in to the web underside.
 const right:ChannelPoint[]=[[half,tw],[half,toeY],[half-toeThickness,toeY],...arc];
 const mirror=(p:ChannelPoint):ChannelPoint=>[-p[0],p[1]];
 const outline:ChannelPoint[]=[...right,...right.slice().reverse().map(mirror)];
 // Shoelace area and centroid.
 let A2=0,cx=0,cy=0;
 for(let i=0;i<outline.length;i++){const [x0,y0]=outline[i],[x1,y1]=outline[(i+1)%outline.length],c=x0*y1-x1*y0;A2+=c;cx+=(x0+x1)*c;cy+=(y0+y1)*c;}
 const area=Math.abs(A2/2),centroidY=cy/(3*A2);void cx;
 return {outline,side:right,d,bf,tw,tf,slope:m,rootThickness,toeThickness,filletRadius:r,k:half-p2[0],webFlat:p2[0],toeY,toeInner:half-toeThickness,innerFace,
  leg:[[half,0],[half,toeY],[half-toeThickness,toeY],[half-rootThickness,0]],area,centroidY,xBar:tw-centroidY};
}

/** Inner flange slope that reproduces a tabulated x̄ (bisection on 0 to 2:12; x̄ falls as the slope rises). */
export function fittedChannelSlope(dims:Omit<ChannelDims,'slope'>,xBar:number){
 let lo=0,hi=channelFlangeSlope;
 if(channelProfile({...dims,slope:lo},2).xBar<=xBar)return lo;
 if(channelProfile({...dims,slope:hi},2).xBar>=xBar)return hi;
 for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(channelProfile({...dims,slope:mid},2).xBar>xBar)lo=mid;else hi=mid;}
 return (lo+hi)/2;
}

/** Profile of a cataloged AISC channel (inch table values), with its slope (2:12 for C, fitted to x̄ for MC). */
export function aiscChannelProfile(c:{name:string;d:number;bf:number;tw:number;tf:number;kdes:number;x:number},arcSegments=6){
 const dims={d:c.d*25.4,bf:c.bf*25.4,tw:c.tw*25.4,tf:c.tf*25.4,k:c.kdes*25.4};
 return channelProfile({...dims,slope:c.name.startsWith('MC')?fittedChannelSlope(dims,c.x*25.4):channelFlangeSlope},arcSegments);
}

/** Profile of a capped section's channel (capWidth = d, capDepth = bf, capTw = tw, capTf = tf), with k_des from the AISC table when cataloged. */
export function capChannelProfile(s:Pick<Section,'capWidth'|'capDepth'|'capTw'|'capTf'|'capCatalogueId'>,arcSegments=6){
 const c=s.capCatalogueId?aiscChannelByName(s.capCatalogueId):undefined;
 const dims={d:s.capWidth,bf:s.capDepth,tw:s.capTw,tf:s.capTf,k:c?c.kdes*25.4:undefined};
 return channelProfile({...dims,slope:c?.name.startsWith('MC')?fittedChannelSlope(dims,c.x*25.4):channelFlangeSlope},arcSegments);
}

/** The outline mapped through a local-to-drawing transform (e.g. section offset, scale and y flip). */
export const channelOutline=(p:ChannelProfile,map:(x:number,y:number)=>ChannelPoint)=>p.outline.map(([x,y])=>map(x,y));

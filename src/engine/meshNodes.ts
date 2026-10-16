/** Mesh nodes of the beam element models (beam.ts, lateralTorsion.ts, columnAnalysis.ts). Canonical units: mm. */

/**
 * Anchors closer than this share one node: 1 mm, 1e-4 of the member length or 1/100 of the section depth, the largest.
 * An element much shorter than the section is deep beside a softly restrained girder end leaves a pivot of the
 * stiffness matrix near round-off: the factorization then reports a false instability (a wheel 0.24 mm from the end
 * support of a W14 bay on its tie and slotted bearing cut the critical load factor of its case from 2.05 to 0.69), or
 * the solution loses its accuracy.
 * The lateral stiffness of such an element, 12EI_y/l^3, grows with the depth as fast as l^3 does, so a length in
 * proportion to the depth keeps the same margin for every section. Beam theory does not resolve positions this close
 * (a wheel 1/100 of the depth from a bearing stiffener bears on it), and moving a load or restraint by 1e-4 of the
 * member changes no result materially.
 */
export const meshTolerance=(length:number,depth=0)=>Math.max(1,1e-4*Math.abs(length),Math.abs(depth)/100);

export interface MeshNodes{
 /** Node positions, ascending, at least `tolerance` apart. */
 nodes:number[];
 /** Index of the node an anchor or load was placed on: its own position or the node it merged into. */
 index:(x:number)=>number;
}

/** Index of the entry of an ascending array nearest to x. */
function nearest(sorted:number[],x:number){
 let lo=0,hi=sorted.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(sorted[mid]<=x)lo=mid;else hi=mid;}
 return Math.abs(sorted[hi]-x)<Math.abs(sorted[lo]-x)?hi:lo;
}

/**
 * Nodes of a one-dimensional element mesh.
 * - `anchors`: member ends, supports and restraints, in priority order. An anchor within the tolerance of an earlier
 *   one is placed on it (the member ends, listed first, never move).
 * - `loads`: each is placed on the nearest node within the tolerance (an anchor or an earlier load), else becomes a
 *   node of its own. The load moves by at most the tolerance.
 * - `grid`: subdivision points, left out within the tolerance of any anchor, load or kept grid point.
 * No two nodes are closer than the tolerance, so no element is shorter than it.
 */
export function meshNodes(anchors:number[],loads:number[],grid:number[],tolerance:number):MeshNodes{
 const placed=new Map<number,number>(),fixed:number[]=[];
 const place=(x:number)=>{
  if(placed.has(x))return;
  let best:number|undefined,distance=tolerance;
  for(const v of fixed){const d=Math.abs(v-x);if(d<=distance){distance=d;best=v;}}
  if(best===undefined){fixed.push(x);best=x;}
  placed.set(x,best);
 };
 for(const x of anchors)place(x);
 for(const x of loads)place(x);
 // Grid points stay clear of every anchor and load position, including those that moved onto another node.
 const avoid=[...new Set([...fixed,...placed.keys()])].sort((a,b)=>a-b);
 const kept=grid.filter(x=>!avoid.length||Math.abs(avoid[nearest(avoid,x)]-x)>tolerance).sort((a,b)=>a-b);
 const sortedFixed=[...fixed].sort((a,b)=>a-b);
 const nodes:number[]=[];
 let g=0;
 for(const x of sortedFixed){
  while(g<kept.length&&kept[g]<x){if(!nodes.length||kept[g]-nodes[nodes.length-1]>tolerance)nodes.push(kept[g]);g++;}
  // A grid point kept just before an anchor cannot be within the tolerance of it (avoid holds every anchor).
  nodes.push(x);
 }
 for(;g<kept.length;g++)if(!nodes.length||kept[g]-nodes[nodes.length-1]>tolerance)nodes.push(kept[g]);
 const position=new Map(nodes.map((x,i)=>[x,i]));
 return {nodes,index(x:number){
  const at=placed.get(x);
  if(at!==undefined)return position.get(at)!;
  const i=nearest(nodes,x);
  if(Math.abs(nodes[i]-x)>tolerance)throw Error('Missing mesh node.');
  return i;
 }};
}

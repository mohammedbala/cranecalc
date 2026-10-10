import type {ProjectInput} from './types';

/**
 * Existing runway beyond a modeled end. A modeled end with an adjacent bay is an interior support of a longer
 * runway: the adjacent simple-span girder bears on the same support. Its reaction there is added to the support
 * demands; the adjacent girder itself is existing and is not checked. Continuous girders must be modeled to their
 * true ends.
 */
export interface AdjacentBay {end:'left'|'right';station:number;length:number}
export function adjacentBays(p:ProjectInput):AdjacentBay[]{
 if(p.system!=='simple'||!p.continuation)return [];
 const L=p.spans.reduce((a,b)=>a+b,0),bays:AdjacentBay[]=[];
 if(p.continuation.left>0)bays.push({end:'left',station:0,length:p.continuation.left});
 if(p.continuation.right>0)bays.push({end:'right',station:L,length:p.continuation.right});
 return bays;
}
export const continues=(p:ProjectInput,end:'left'|'right')=>adjacentBays(p).some(b=>b.end===end);
/** Runway ends with end stops: the modeled ends that are not continued. */
export const runwayEnds=(p:ProjectInput)=>(['left','right'] as const).filter(end=>!continues(p,end));
/** Point loads beyond the modeled girder that fall on an adjacent bay. */
export function onAdjacentBays(p:ProjectInput,x:number){
 const L=p.spans.reduce((a,b)=>a+b,0);
 return adjacentBays(p).some(b=>b.end==='left'?x<0&&x>=-b.length:x>L&&x<=L+b.length);
}
/** Reaction of each adjacent simple-span girder at the shared support, by support station (spans + 1 entries). */
export function adjacentReactions(p:ProjectInput,loads:{x:number;p:number}[],q=0){
 const L=p.spans.reduce((a,b)=>a+b,0),r=Array.from({length:p.spans.length+1},()=>0);
 for(const b of adjacentBays(p)){
  const j=b.end==='left'?0:p.spans.length;
  r[j]+=q*b.length/2;
  for(const l of loads){const d=b.end==='left'?-l.x:l.x-L;if(d>0&&d<=b.length)r[j]+=l.p*(1-d/b.length);}
 }
 return r;
}
/** Extent of crane travel: the modeled runway plus the adjacent bays. */
export function travelLimits(p:ProjectInput){
 const L=p.spans.reduce((a,b)=>a+b,0),bays=adjacentBays(p);
 return {start:-(bays.find(b=>b.end==='left')?.length??0),end:L+(bays.find(b=>b.end==='right')?.length??0)};
}

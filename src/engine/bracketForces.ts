/** Girder end bearing on a support; offset is from the grid to its reaction, positive toward the next grid. */
export interface BearingForce {bay:number;end:'left'|'right';vertical:number;offset:number;existing?:boolean}
/** One concurrent factored force set delivered by the girder ends to a support. */
export interface SupportForceSet {
 id:string;combination:string;
 /** Combined downward reaction and its moment about the grid, ΣV·offset. */
 vertical:number;moment:number;
 /** At the locating bearing; top and bottom flange lateral forces of all girder ends at the support. */
 longitudinal:number;top:number;bottom:number;
 ends:BearingForce[];
}
/**
 * Per-support envelope of the factored strength force sets. Every entry is one whole concurrent set: its reactions,
 * seat moment, longitudinal force and both flange lateral forces act together.
 * - `maxVertical` / `maxMoment`: the largest total reaction and seat moment. At a grid loaded from both sides the
 *   same extreme is reached with the opposite seat moment and the end reactions exchanged: that set is `mirror`,
 *   and `reversible` marks it.
 * - `minBearing` / `minVertical`: the least single girder end reaction and the least total reaction (uplift negative).
 * - `longitudinal`: the largest longitudinal force; `forward` / `backward` the largest toward the higher / lower grid.
 *   `reversible.longitudinal` marks one reached equally both ways (traction); a crane stop force acts one way only.
 * - `top` / `bottom`: the largest top / bottom flange lateral force.
 * Sets that tie on their criterion keep the larger total reaction (for a minimum the lesser), then the larger seat
 * moment, longitudinal and lateral forces, so each entry carries its most severe concurrent companions.
 */
export interface SupportForceEnvelope {
 /** Grid number, from 1 at the first support. */
 x:number;grid:number;maxVertical:SupportForceSet;maxMoment:SupportForceSet;
 mirror:{vertical?:SupportForceSet;moment?:SupportForceSet};
 /** Least single bearing reaction; negative is uplift. */
 minBearing:SupportForceSet;
 /** Least total reaction at the grid; negative is uplift. */
 minVertical:SupportForceSet;
 longitudinal:SupportForceSet;forward?:SupportForceSet;backward?:SupportForceSet;
 top:SupportForceSet;bottom:SupportForceSet;
 reversible:{vertical:boolean;moment:boolean;longitudinal:boolean};
}
/** A rotating girder end bears on the span side of its plate: the reaction acts at 0.8 of the bearing length from the girder end. */
export const seatOffset=(v:{end:'left'|'right';offset:number},bearingLength:number)=>v.offset+(v.end==='left'?1:-1)*.3*bearingLength;
/** Girder end reactions on each side of a grid, undefined without a girder there: the girder to the left ends at its right end. */
export function sideReactions(f:SupportForceSet){
 const side=(end:'left'|'right')=>{const v=f.ends.filter(e=>e.end===end);return v.length?v.reduce((a,e)=>a+e.vertical,0):undefined;};
 return {left:side('right'),right:side('left')};
}
/** Least single girder end reaction of a set (the total where the girder is continuous). */
export const leastBearing=(f:SupportForceSet)=>f.ends.length?Math.min(...f.ends.map(v=>v.vertical)):f.vertical;
// Mirrored crane positions give the same extreme up to rounding.
const same=(a:number,b:number)=>Math.abs(a-b)<=1e-6*Math.max(Math.abs(a),Math.abs(b),1);
type Key=(f:SupportForceSet)=>number;
/** Whether f ranks above g on the keys in order, each compared to rounding. */
const ranks=(f:SupportForceSet,g:SupportForceSet,keys:Key[])=>{for(const k of keys){const a=k(f),b=k(g);if(!same(a,b))return a>b;}return false;};
const abs=(k:Key):Key=>f=>Math.abs(k(f));
const V:Key=f=>f.vertical,M:Key=f=>f.moment,F:Key=f=>f.longitudinal,T:Key=f=>f.top,B:Key=f=>f.bottom;
// Companions kept on a tie: the larger (for a minimum the lesser) reaction, then the larger seat moment and horizontal
// forces; for a lateral force row the longitudinal force ahead of the seat moment.
const heavier=[V,abs(M),abs(F),abs(T),abs(B)],lateral=[V,abs(F),abs(M),abs(T),abs(B)],horizontal=[abs(F),abs(B),abs(T)];

export function createSupportForceEnvelope(stations:number[]){
 type Track={hi:SupportForceSet;lo:SupportForceSet};
 type Entry={vertical?:Track;moment?:Track;minBearing?:SupportForceSet;minVertical?:SupportForceSet;longitudinal?:SupportForceSet;forward?:SupportForceSet;backward?:SupportForceSet;top?:SupportForceSet;bottom?:SupportForceSet};
 const at=stations.map(()=>({} as Entry));
 // Largest and least signed moment among the sets that tie on `key`.
 const track=(t:Track|undefined,f:SupportForceSet,key:Key):Track=>{
  if(!t||key(f)>key(t.hi)&&!same(key(f),key(t.hi)))return {hi:f,lo:f};
  if(!same(key(f),key(t.hi)))return t;
  return {hi:ranks(f,t.hi,[M,...heavier])?f:t.hi,lo:ranks(f,t.lo,[g=>-g.moment,...heavier])?f:t.lo};
 };
 const best=(old:SupportForceSet|undefined,f:SupportForceSet,keys:Key[])=>!old||ranks(f,old,keys)?f:old;
 function add(j:number,f:SupportForceSet){
  const v=at[j];
  v.vertical=track(v.vertical,f,V);
  v.moment=track(v.moment,f,abs(M));
  v.minBearing=best(v.minBearing,f,[g=>-leastBearing(g),g=>-g.vertical,...horizontal]);
  v.minVertical=best(v.minVertical,f,[g=>-g.vertical,g=>-leastBearing(g),...horizontal]);
  v.longitudinal=best(v.longitudinal,f,[abs(F),...heavier]);
  if(f.longitudinal>0)v.forward=best(v.forward,f,[F,...heavier]);
  if(f.longitudinal<0)v.backward=best(v.backward,f,[g=>-g.longitudinal,...heavier]);
  v.top=best(v.top,f,[abs(T),...lateral]);v.bottom=best(v.bottom,f,[abs(B),...lateral]);
 }
 function result():SupportForceEnvelope[]{
  return stations.flatMap((x,j)=>{
   const v=at[j];if(!v.vertical||!v.moment)return [];
   const pick=(t:Track)=>Math.abs(t.lo.moment)>Math.abs(t.hi.moment)&&!same(t.lo.moment,-t.hi.moment)?t.lo:t.hi;
   const both=(t:Track)=>t.hi.moment>0&&t.lo.moment<0&&same(t.hi.moment,-t.lo.moment);
   const reverses=!!v.forward&&!!v.backward&&same(v.forward.longitudinal,-v.backward.longitudinal);
   return [{x,grid:j+1,maxVertical:pick(v.vertical),maxMoment:pick(v.moment),mirror:{...(both(v.vertical)?{vertical:v.vertical.lo}:{}),...(both(v.moment)?{moment:v.moment.lo}:{})},
    minBearing:v.minBearing!,minVertical:v.minVertical!,longitudinal:v.longitudinal!,...(v.forward?{forward:v.forward}:{}),...(v.backward?{backward:v.backward}:{}),top:v.top!,bottom:v.bottom!,
    reversible:{vertical:both(v.vertical),moment:both(v.moment),longitudinal:reverses}}];
  });
 }
 return {add,result};
}

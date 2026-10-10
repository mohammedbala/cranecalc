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
 * Per-support envelope of the factored strength force sets. `reversible` marks a seat moment reached in both
 * directions (crane on either side of the grid): the bracket takes either sign, with the end reactions mirrored;
 * and a longitudinal force reached in both directions (traction), where a crane stop force acts one way only.
 * `top` and `bottom` are each the set with the largest top or bottom flange force, with the other flange's force
 * of the same set: they act together.
 */
export interface SupportForceEnvelope {
 /** Grid number, from 1 at the first support. */
 x:number;grid:number;maxVertical:SupportForceSet;maxMoment:SupportForceSet;
 /** Least single bearing reaction; negative is uplift. */
 minBearing:SupportForceSet;
 longitudinal:SupportForceSet;top:SupportForceSet;bottom:SupportForceSet;
 reversible:{vertical:boolean;moment:boolean;longitudinal:boolean};
}
/** A rotating girder end bears on the span side of its plate: the reaction acts at 0.8 of the bearing length from the girder end. */
export const seatOffset=(v:{end:'left'|'right';offset:number},bearingLength:number)=>v.offset+(v.end==='left'?1:-1)*.3*bearingLength;
/** Girder end reactions on each side of a grid, undefined without a girder there: the girder to the left ends at its right end. */
export function sideReactions(f:SupportForceSet){
 const side=(end:'left'|'right')=>{const v=f.ends.filter(e=>e.end===end);return v.length?v.reduce((a,e)=>a+e.vertical,0):undefined;};
 return {left:side('right'),right:side('left')};
}
const least=(f:SupportForceSet)=>f.ends.length?Math.min(...f.ends.map(v=>v.vertical)):f.vertical;
// Mirrored crane positions give the same extreme up to rounding.
const same=(a:number,b:number)=>Math.abs(a-b)<=1e-6*Math.max(Math.abs(a),Math.abs(b),1);

export function createSupportForceEnvelope(stations:number[]){
 type Track={hi:SupportForceSet;lo:SupportForceSet};
 const at=stations.map(()=>({} as {vertical?:Track;moment?:Track;minBearing?:SupportForceSet;longitudinal?:SupportForceSet;top?:SupportForceSet;bottom?:SupportForceSet;forward?:number;backward?:number}));
 // Largest and least signed moment among the sets that tie on `key`; a tie on the moment keeps the larger reaction.
 const track=(t:Track|undefined,f:SupportForceSet,key:(f:SupportForceSet)=>number):Track=>{
  if(!t||key(f)>key(t.hi)&&!same(key(f),key(t.hi)))return {hi:f,lo:f};
  if(!same(key(f),key(t.hi)))return t;
  const better=(a:SupportForceSet,dir:number)=>dir*f.moment>dir*a.moment&&!same(f.moment,a.moment)||same(f.moment,a.moment)&&f.vertical>a.vertical;
  return {hi:better(t.hi,1)?f:t.hi,lo:better(t.lo,-1)?f:t.lo};
 };
 const largest=(old:SupportForceSet|undefined,f:SupportForceSet,key:(f:SupportForceSet)=>number)=>!old||key(f)>key(old)?f:old;
 function add(j:number,f:SupportForceSet){
  const v=at[j];
  v.vertical=track(v.vertical,f,s=>s.vertical);
  v.moment=track(v.moment,f,s=>Math.abs(s.moment));
  v.minBearing=largest(v.minBearing,f,s=>-least(s));
  v.longitudinal=largest(v.longitudinal,f,s=>Math.abs(s.longitudinal));
  v.forward=Math.max(v.forward??0,f.longitudinal);v.backward=Math.max(v.backward??0,-f.longitudinal);
  v.top=largest(v.top,f,s=>Math.abs(s.top));v.bottom=largest(v.bottom,f,s=>Math.abs(s.bottom));
 }
 function result():SupportForceEnvelope[]{
  return stations.flatMap((x,j)=>{
   const v=at[j];if(!v.vertical||!v.moment)return [];
   const pick=(t:Track)=>Math.abs(t.lo.moment)>Math.abs(t.hi.moment)&&!same(t.lo.moment,-t.hi.moment)?t.lo:t.hi;
   const both=(t:Track)=>t.hi.moment>0&&t.lo.moment<0&&same(t.hi.moment,-t.lo.moment);
   const reverses=(v.forward??0)>0&&same(v.forward??0,v.backward??0);
   return [{x,grid:j+1,maxVertical:pick(v.vertical),maxMoment:pick(v.moment),minBearing:v.minBearing!,longitudinal:v.longitudinal!,top:v.top!,bottom:v.bottom!,reversible:{vertical:both(v.vertical),moment:both(v.moment),longitudinal:reverses}}];
  });
 }
 return {add,result};
}

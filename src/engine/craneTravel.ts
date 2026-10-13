import type {ProjectInput} from './types';
import {runwayEnds} from './continuation';
import {activeEndStop,stopEnds,stopLip,stopRailEnd} from './endStopInputs';
import {endGridOverhang} from './simpleSupports';

/**
 * A crane against a runway-end stop with its bumper fully compressed, when the stop force peaks. `origin` is the
 * first-wheel position from grid 1 and `wheel` the end wheel nearest the stop. From the end-truck geometry
 * ('geometry') when this calculation designs the girder-mounted stop and the crane supplier gives the bumper overhang
 * a (end-wheel centerline to the extended bumper face): the end wheel stands a less the bumper stroke s from the stop
 * face. Otherwise ('travel') the entered travel limit toward that end, kept on the runway (every wheel on the girder).
 */
export interface StopContact{end:'left'|'right';origin:number;wheel:number;basis:'geometry'|'travel';face?:number;overhang?:number;stroke?:number;railEnd?:number}

/** Struck face of the stop face plate, from grid 1, at a runway end that carries a stop designed in this calculation. */
export function stopFace(p:ProjectInput,end:'left'|'right'){
 const e=activeEndStop(p);if(!e||!stopEnds(p).includes(end))return undefined;
 const L=p.spans.reduce((a,b)=>a+b,0),face=e.setback+e.base.length-stopLip(e);
 return end==='left'?face-endGridOverhang(p,'left'):L+endGridOverhang(p,'right')-face;
}
/** Rail end at a runway end with a designed stop, from grid 1. */
export function stopRailEndAt(p:ProjectInput,end:'left'|'right'){
 const e=activeEndStop(p);if(!e||!stopEnds(p).includes(end))return undefined;
 const L=p.spans.reduce((a,b)=>a+b,0);
 return end==='left'?stopRailEnd(e)-endGridOverhang(p,'left'):L+endGridOverhang(p,'right')-stopRailEnd(e);
}
/**
 * Stop contacts of a crane. Cranes are ordered along the runway: only the first reaches the left stop and only the
 * last the right one (another crane's travel limit toward that end is the crane beyond it, a crane-to-crane bumper
 * case). A crane whose end wheel cannot reach the end span never strikes that stop.
 */
export function stopContacts(p:ProjectInput,crane:number):StopContact[]{
 const c=p.cranes[crane];if(!c)return [];
 const ends=stopEnds(p).length?stopEnds(p):runwayEnds(p),L=p.spans.reduce((a,b)=>a+b,0),last=c.wheels.at(-1)!.offset;
 const a=c.design?.bumperOverhang,s=c.design?.bumperStroke??0,out:StopContact[]=[];
 for(const end of ends){
  if(end==='left'?crane!==0:crane!==p.cranes.length-1)continue;
  const face=c.design?.bumperBypassesGirder?undefined:stopFace(p,end),dir=end==='left'?1:-1;
  let contact:StopContact;
  if(face!==undefined&&a!==undefined){const wheel=face+dir*(a-s);contact={end,wheel,origin:end==='left'?wheel:wheel-last,basis:'geometry',face,overhang:a,stroke:s,railEnd:stopRailEndAt(p,end)};}
  else{const origin=end==='left'?Math.max(c.travelStart,0):Math.min(c.travelEnd,L-last);contact={end,origin,wheel:end==='left'?origin:origin+last,basis:'travel'};}
  if(end==='left'?contact.wheel<=p.spans[0]+1e-6:contact.wheel>=L-p.spans.at(-1)!-1e-6)out.push(contact);
 }
 return out;
}
/**
 * Travel of a crane's first wheel: the entered range, running to stop contact toward a runway end whose stop geometry
 * is known (the crane can reach its stop; travel limit switches are not relied on).
 */
export function craneTravel(p:ProjectInput,crane:number){
 const c=p.cranes[crane],known=stopContacts(p,crane).filter(v=>v.basis==='geometry');
 return {start:known.find(v=>v.end==='left')?.origin??c.travelStart,end:known.find(v=>v.end==='right')?.origin??c.travelEnd};
}
/**
 * The runway end whose stop a crane is against at `origin` (its stop contact), or undefined: the crane stop force acts
 * only there.
 */
export function craneAtStop(p:ProjectInput,crane:number,origin:number):'left'|'right'|undefined{
 const c=p.cranes[crane];if(!c)return undefined;
 const tol=1e-6*Math.max(1,Math.abs(c.travelEnd-c.travelStart));
 return stopContacts(p,crane).find(v=>Math.abs(origin-v.origin)<=tol)?.end;
}

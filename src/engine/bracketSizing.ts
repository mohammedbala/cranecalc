/**
 * Template sizing of the welded rib brackets, the twin-rib seat and the haunched rib seat, for the project's support
 * reactions (after sizeTaperedHaunch). A sizing set from supportReactions puts each support's largest reaction on one
 * girder end at a time, at its bearing's reaction offset (0.8 of the bearing length from the girder end, or centered
 * on a continuous girder's interior grid), with one crane's side thrust (and its support torque) and longitudinal
 * force, or the crane stop force; per duty bin the crane reaction without impact on each girder end in turn; the
 * single-crane service reaction. The bracket's own collector and checks (createBracketCollector, bracketChecks) give
 * every ratio exactly as the full analysis reports it, and the full analysis then checks every concurrent case.
 *
 * The bracket starts light and grows in standard increments until every ratio is at most the target (or no growth
 * helps): ribs 1 in deeper or one plate step thicker, whichever lowers the governing ratio more per pound; root and seat
 * fillets 1/16 in at a time (to 5/8 in, and t - 1/16 in); the seat one plate step; continuity plates in the receiving
 * column (existing columns, or new ones where they clear the bracing gussets) where the unstiffened column does not
 * take the rib forces, then their fillets, thickness and length. The ribs stand under the girder bearing stiffeners, or
 * as near as the receiving flange allows, clear of the bearing bolt nuts below the seat; the bracket stays stiff enough
 * for the top-flange tie's column-end release, and without a configured reach it reaches far enough for the tie's clear
 * length (tieReach). Canonical units N, mm.
 */
import type {ProjectInput} from './types';
import type {BracketInput} from './bracketInputs';
import {sectionProperties} from './section';
import {supportReactions,supportStations} from './supportReactions';
import {seatOffset} from './bracketForces';
import {createBracketCollector,bracketChecks,validateBracket,type BracketLoads,type SeatHorizontal} from './bracketDesign';
import {weldedRibBracket,haunchedBracket,ribGeometry,torqueArm,haunchAngleLimits} from './bracketRib';
import {independentBearings,simpleSupportInput,endGridCentered} from './simpleSupports';
import {activeEndBearing,continuousBearings} from './endBearingInputs';
import {endBearingGeometry} from './endBearing';
import {wrenchClearance} from './endStop';
import {railTopAboveSteel} from './railSeat';
import {filletMinimum} from './connectionStrength';
import {initialColumnStiffeners,receiverK} from './columnStiffenerInputs';
import {columnStiffenerErrors} from './columnStiffeners';
import {seatSettingTolerance} from './fitTolerances';
import {beamSystem} from './beam';
import {girderDeadLoad} from './newSteel';
import {craneDesignMinimum} from './aistLoads';
import {available} from './aiscStrength';
import {columnGussetExtension,tieRelease} from './tieGeometry';

const inch=25.4,eighth=inch/8,sixteenth=inch/16,up=(v:number,step:number)=>Math.ceil(v/step-1e-9)*step,down=(v:number,step:number)=>Math.floor(v/step+1e-9)*step;
/** Plate thicknesses the ribs, seat and continuity plates step through: 1/8 in to 1 1/2 in, then 1/4 in. */
export const plateSteps=[.375,.5,.625,.75,.875,1,1.125,1.25,1.375,1.5,1.75,2,2.25,2.5,2.75,3].map(v=>v*inch);
const nextPlate=(t:number)=>plateSteps.find(v=>v>t+1e-6);
/** Largest fillet the sizing grows to: 5/8 in, a few passes; and the plate-edge limit t - 1/16 in of the thinner part. */
const maxFillet=(...t:number[])=>Math.min(5/8*inch,Math.min(...t)-sixteenth);
/** Deepest rib the sizing grows to: the haunch's 45° free edge (h_r - h_t <= L), and 48 in for a rectangular rib. */
const maxRibDepth=(b:BracketInput)=>haunchedBracket(b)?b.seatProjection*2:48*inch;

export interface BracketSizingSet {
 strength:{x:number;loads:BracketLoads;horizontal:SeatHorizontal}[];
 fatigue:{x:number;bin:number;loads:BracketLoads;horizontal:SeatHorizontal}[];
 service:{x:number;loads:BracketLoads;horizontal:SeatHorizontal}[];
 /** Largest unfactored support reaction with all cranes, impact and dead load (the AIST §5.9.2 basis). */
 serviceReaction:number;
 /**
  * The top-flange tie's vertical release at the column gusset, where it has one: its slot travel u, and what besides
  * the bracket deflection uses it (the factored end rotation over the tie setback and the 1/16 in positioning
  * allowance), with the cranes and impact the deflection is multiplied by (tieMovementChecks, tie-release-travel).
  */
 release?:{travel:number;other:number;factor:number};
}
/**
 * The girder bearings at each support: the reaction offset along the runway (seatOffset: 0.8 of the bearing length
 * from a girder end, centered on a continuous girder's interior grid) and the bearing center, both from the grid.
 */
export function supportBearings(p:ProjectInput){
 const Lbr=p.details!.bearing.length,stations=supportStations(p),at=stations.map(()=>[] as {reaction:number;center:number}[]);
 const grid=(x:number)=>stations.findIndex(s=>Math.abs(s-x)<1e-6);
 if(p.system==='continuous')continuousBearings(p).forEach((v,i,all)=>{const c=v.center-v.station,end=i===0?'left' as const:i===all.length-1?'right' as const:undefined;at[i].push({reaction:end?seatOffset({end,offset:c},Lbr):c,center:c});});
 else for(const v of independentBearings(p)){const j=grid(v.station);if(j>=0)at[j].push({reaction:seatOffset({end:v.end,offset:v.center-v.station},Lbr),center:v.center-v.station});}
 return at;
}
/**
 * Sizing set from the unfactored support reactions (strength factors 1.2/1.6 LRFD, 1.0 ASD):
 * - strength, at each support and each of its girder bearings in turn: the whole factored reaction (less the support
 *   steel, which the collector adds as the bracket self-weight) at that bearing's reaction offset, with the factored
 *   side thrust as the bottom-flange force through the bearing bolts (both senses), its support torque about the seat
 *   (side thrust times the rail top height: the top-flange restraint force on torqueArm) and the factored crane
 *   longitudinal force; the crane stop force with 1.2(D + C_d) + C_v (factor 1.0 LRFD, 0.67 ASD, as the haunch);
 *   the same reaction without side thrust (no support torque: the reaction at the web line, where a tapered rib's
 *   own critical section is nearest the root and its moment the largest); any uplift 0.9D + 1.6 C_min; the dead load
 *   alone with the factored top-flange force: the analysis envelope has sets with a crane's top-flange restraint
 *   force at a support whose crane reaction there is small (the crane in the next bay), whose support torque moves
 *   the reaction to the flange-tip bound of the eccentricity (seatEccentricity); the haunched rib checks take their
 *   critical section at that largest eccentricity;
 * - fatigue, per duty bin: the crane reaction without impact, its own weight plus the bin's lifted fraction, on each
 *   girder end in turn (the crane crossing the grid), with half the side thrust (C_d + C_v + 0.5 C_ss), and the bin's
 *   share of the least crane reaction where it lifts the support (the signed range spans both);
 * - service: the crane reaction with impact on each girder end.
 */
export function bracketSizingSet(p:ProjectInput,rotation?:number):BracketSizingSet{
 const d=p.details!,r=supportReactions(p,sectionProperties(p.section)),lrfd=p.method==='LRFD',Lbr=d.bearing.length,stations=supportStations(p),bearings=supportBearings(p);
 const railTop=d.bearing.thickness+p.section.d+(p.section.kind==='cap'?p.section.capTw:0)+railTopAboveSteel(p),arm=torqueArm(p),top=(H:number)=>H*railTop/arm;
 const F=(lrfd?1.6:1)*r.Cls,stop=Math.max(0,...p.cranes.map(c=>c.design&&!c.design.bumperBypassesGirder?c.design.bumperForce:0))*(lrfd?1:.67);
 const fatigueMax=Math.max(0,...r.supports.map(s=>s.Cd+s.Cv)),deadMax=Math.max(0,...r.supports.map(s=>s.Cd));
 const bins=d.spectrum.map((v,bin)=>({bin,scale:fatigueMax>0?(deadMax+v.liftFraction*(fatigueMax-deadMax))/fatigueMax:0}));
 const at=(V:number,x:number):BracketLoads=>[{vertical:V,offset:x,length:.4*Lbr}];
 const set:BracketSizingSet={strength:[],fatigue:[],service:[],serviceReaction:0},seen=new Set<string>();
 const rel=tieRelease(p),f=d.brace.flangeAttachment;
 if(rel)set.release={travel:rel.travel,other:(rotation??girderEndRotation(p))*(f?.enabled?f.longitudinalSetback:0)+inch/16,factor:p.cranes.length*(1+Math.max(...p.cranes.map(c=>c.impact)))};
 // Each distinct set once (symmetric grids repeat them).
 const push=<T extends {loads:BracketLoads;horizontal:SeatHorizontal}>(list:T[],v:T,kind:string)=>{const k=JSON.stringify([kind,v.loads,v.horizontal,(v as {bin?:number}).bin]);if(!seen.has(k)){seen.add(k);list.push(v);}};
 r.supports.forEach((s,j)=>{
  const x=stations[j],D=s.D-s.Ds,crane=s.Cd+s.Cv+s.Ci,R=(lrfd?1.2:1)*D+(lrfd?1.6:1)*crane,H=(lrfd?1.6:1)*s.Css,Rstop=(lrfd?1.2:1)*(D+s.Cd)+s.Cv;
  const lift=(lrfd?.9:.6)*D+(lrfd?1.6:1)*Math.min(0,s.craneMinimum);
  // The least crane reaction without impact (a continuous girder's support lifts with the crane in the next span).
  const least=s.craneMinimum<0&&crane>0?s.craneMinimum*(s.Cd+s.Cv)/crane:0;
  set.serviceReaction=Math.max(set.serviceReaction,s.D+crane);
  for(const v of bearings[j]){
   push(set.strength,{x,loads:at(R,v.reaction),horizontal:{longitudinal:F,bottom:H,top:top(H),offset:v.center}},'s');
   push(set.strength,{x,loads:at(R,v.reaction),horizontal:{longitudinal:F,bottom:0,top:0,offset:v.center}},'s');
   if(stop>0)push(set.strength,{x,loads:at(Rstop,v.reaction),horizontal:{longitudinal:stop,bottom:0,top:0,offset:v.center}},'s');
   if(lift<0)push(set.strength,{x,loads:at(lift,v.reaction),horizontal:{longitudinal:0,bottom:H,top:top(H),offset:v.center}},'s');
   push(set.strength,{x,loads:at((lrfd?1.2:1)*D,v.reaction),horizontal:{longitudinal:0,bottom:H,top:top(H),offset:v.center}},'s');
   for(const b of bins){const Hf=.5*s.Css*b.scale;push(set.fatigue,{x,bin:b.bin,loads:at((s.Cd+s.Cv)*b.scale,v.reaction),horizontal:{longitudinal:0,bottom:Hf,top:top(Hf),offset:v.center}},'f');
    if(least<0)push(set.fatigue,{x,bin:b.bin,loads:at(least*b.scale,v.reaction),horizontal:{longitudinal:0,bottom:0,top:0,offset:v.center}},'f');}
   push(set.service,{x,loads:at(crane,v.reaction),horizontal:{longitudinal:0,bottom:s.Css,top:top(s.Css),offset:v.center}},'v');
  }
 });
 return set;
}
/** Checks of the bracket that the sizing does not drive: detailing it sets by construction, the AIST reaction recommendation, the bearing bolts, and the column's own stress ranges. */
const notSized=/^bracket-(receiver|load-path|tr13-load|uplift|column-weld-minimum|root-minimum|root-maximum|seat-minimum|seat-maximum|fatigue-column|colstiff-(length|fit|weld-minimum|weld-length|fatigue-toe))$/;
/**
 * The bracket checks under the sizing set, as the full analysis reports them (bracketChecks), keyed by check id
 * without the 'bracket-' prefix: utilization of every check the sizing drives. `nuts` is the nut clearance below
 * the seat over the AISC tightening clearance (end-bearing-wrench-rib), without bolted end bearings none; `release`
 * the vertical travel the tie's column-end release needs with this bracket's service deflection over its slot travel
 * (tie-release-travel: the bracket must not deflect more than the tie's release takes).
 */
export function bracketSizingRatios(p:ProjectInput,set=bracketSizingSet(p)){
 const c=createBracketCollector(p),ratios:Record<string,number>={};
 if(!c)return ratios;
 for(const v of set.strength)c.observe('strength','sizing',v.x,v.loads,-1,v.horizontal);
 for(const v of set.fatigue)c.observe('fatigue','sizing',v.x,v.loads,v.bin,v.horizontal);
 for(const v of set.service)c.observe('service','sizing',v.x,v.loads,-1,v.horizontal);
 for(const k of bracketChecks(p,c.result,set.serviceReaction))if(k.utilization!==undefined&&(k.status==='pass'||k.status==='fail')&&!notSized.test(k.id))ratios[k.id.replace(/^bracket-/,'')]=k.utilization;
 const nuts=nutClearance(p,p.details!.bracket!);if(nuts)ratios.nuts=nuts.required/Math.max(1e-9,nuts.clear);
 if(set.release)ratios.release=((c.result.service.deflection?.value??0)*set.release.factor+set.release.other)/set.release.travel;
 return ratios;
}
/**
 * The receiving column's own fatigue ratio under the sizing set's duty bins, which the bracket sizing does not drive
 * (notSized): bracket-fatigue-column, the column flange at the rib weld toes (AISC Table A-3.1 item 7.1, the whole
 * bracket moment on the column section), by the check's method and cycles. The column choice answers it.
 */
export function bracketColumnFatigueRatio(p:ProjectInput,set=bracketSizingSet(p)){
 const c=createBracketCollector(p);if(!c)return 0;
 for(const v of set.fatigue)c.observe('fatigue','sizing',v.x,v.loads,v.bin,v.horizontal);
 return bracketChecks(p,c.result,set.serviceReaction).find(k=>k.id==='bracket-fatigue-column')?.utilization??0;
}
/** Clear distance from the bearing bolts to the rib faces' seat fillets below the seat, and the tightening clearance it needs (end-bearing-wrench-rib). */
export function nutClearance(p:ProjectInput,b:BracketInput){
 const eb=activeEndBearing(p);if(!eb)return undefined;
 const g=endBearingGeometry({...p,details:{...p.details!,bracket:b}},eb);
 return {clear:Math.min(...g.ribs.flatMap(r=>g.rows.map(x=>Math.abs(x-r))))-b.ribThickness/2-b.seatWeld,required:wrenchClearance(eb.bolts.diameter)};
}
/**
 * Rib spacing on the 1/8 in grid: the ribs under the girder bearing stiffeners (2(g/2 + N/2) apart for simple spans,
 * the runway-end bearing's N for a continuous girder), or as near as the receiving flange (both root fillets 1/4 in
 * inside its tips), the seat (the rib-to-seat fillets under it) and the bearing bolt nuts below the seat allow;
 * undefined when no spacing clears the nuts.
 */
export function ribSpacingFor(p:ProjectInput,b:BracketInput){
 const d=p.details!,Lbr=d.bearing.length,gap=p.system==='simple'?simpleSupportInput(p).endGap:0;
 const target=p.system==='continuous'||(p.spans.length<2&&!endGridCentered(p))?Lbr:gap+Lbr;
 // Strictly inside the validation limits (validateBracket), on the 1/8 in grid.
 const room=(s:number)=>s+b.ribThickness+2*b.rootWeld+inch/2<=b.receiver.width-1e-6&&s+b.ribThickness+2*b.seatWeld<=b.seatLength-1e-6;
 const lo=up(b.ribThickness+2*b.rootWeld+eighth,eighth),fits:number[]=[];
 for(let s=down(Math.min(b.receiver.width,b.seatLength),eighth);s>=lo-1e-6;s-=eighth){if(!room(s))continue;const n=nutClearance(p,{...b,ribSpacing:s});if(!n||n.clear>=n.required+1e-3)fits.push(s);}
 return fits.sort((x,y)=>Math.abs(x-target)-Math.abs(y-target)||y-x)[0];
}
/** Steel weight of the bracket and its continuity plates, N, for comparing growth steps. */
export function bracketWeight(p:ProjectInput,b:BracketInput){
 const g=ribGeometry(b),s=b.columnStiffeners?.enabled?b.columnStiffeners:undefined,c=b.receiver;
 const plates=s?4*s.thickness*s.width*(s.length==='full'?c.depth-2*c.flangeThickness:c.depth/2-c.flangeThickness):0;
 return (b.seatLength*b.seatProjection*b.seatThickness+2*g.area*b.ribThickness+plates)*p.section.density*9.80665/1e9;
}

/**
 * Factored end rotation of the girder at its supports under one crane with impact and the dead load (1.2D + 1.6C
 * LRFD, D + C ASD), over the crane positions: the movement the top-flange tie follows (tieMovements, from the analysis).
 */
export function girderEndRotation(p:ProjectInput){
 const props=sectionProperties(p.section),beam=beamSystem(p.spans,p.section.E*props.Ix,p.system),stations=supportStations(p),L=stations.at(-1)!,lrfd=p.method==='LRFD';
 const at=(r:ReturnType<typeof beam.evaluate>)=>stations.map(x=>{const i=r.x.findIndex(v=>Math.abs(v-x)<1e-6);return i<0?0:r.rotation[i];});
 const dead=at(beam.evaluate([],(lrfd?1.2:1)*girderDeadLoad(p,props.weight)));
 let worst=Math.max(0,...dead.map(Math.abs));
 for(const c of p.cranes){
  const f=(lrfd?1.6:1)*(1+Math.max(c.impact,craneDesignMinimum(c).impact))/(c.includesImpact?1+c.impact:1),last=c.wheels.at(-1)!.offset;
  for(let k=0;k<=60;k++){const o=-last+(L+last)*k/60,w=c.wheels.map(v=>({x:o+v.offset,p:f*v.loaded})).filter(v=>v.x>=0&&v.x<=L);if(!w.length)continue;
   at(beam.evaluate(w)).forEach((v,j)=>{worst=Math.max(worst,Math.abs(v+dead[j]));});}
 }
 return worst;
}
/**
 * Reach of a designed welded rib bracket when none is configured: the given default, or longer where the top-flange
 * tie, whose length follows the column face (configurator attachBracket: its bars end at the bracket reach), needs a
 * longer clear length between its bolt groups for the girder end movement (AISC DG7 §11.2). Each bar (or the single
 * flexible plate) of thickness t_b is fixed at both bolt groups, so the movement Δ = θ_u d + αLΔT (factored end rotation
 * about the bearing, thermal travel at a sliding end, as tieMovements) bends it out of plane by 6EIΔ/L²; that moment is
 * held to 0.8 of the plastic moment φF_yZ_y, the rest of the tie's H1 check left for its axial force:
 * L ≥ √(2Et_bΔ/(0.8φF_y)). Rounded up to whole inches, to 36 in. Simple spans with a flange-saddle tie only (a
 * continuous girder's ties sit at its bearing stiffeners; a cap tieback angle slides in its slots). The bars are those
 * the details carry when the bracket is sized; a thinner tie needs less. The configurator sizes the tie first
 * (sizeFlangeTie: the shortest column face at which the sized bars pass every tie check) and then the bracket at that
 * reach ('fixed'); this closed-form screen serves a bracket sized on its own.
 */
export function tieReach(p:ProjectInput,reach:number,rotation?:number){
 const d=p.details!,t=d.brace,f=t.flangeAttachment,arrangement=t.arrangement??'paired-bars';
 if(p.system!=='simple'||!f?.enabled||f.columnFace===undefined||(arrangement!=='paired-bars'&&arrangement!=='flexible-plate'))return reach;
 const ss=simpleSupportInput(p),delta=(rotation??girderEndRotation(p))*p.section.d+12e-6*Math.max(...p.spans)*Math.max(ss.temperatureRise,ss.temperatureFall);
 const need=Math.sqrt(2*p.section.E*t.thickness*delta/(.8*available(d.material.Fy,p.method,.9,1.67)));
 // Clear length at this reach: the tie runs from its girder end to the column face (length + reach - columnFace).
 const c=t.connection,free=t.length+reach-f.columnFace-2*((c.rows-1)*c.pitch+2*c.edge)-columnGussetExtension(p);
 return free>=need?reach:Math.min(36*inch,up(reach+need-free,inch));
}

type Move=(b:BracketInput)=>boolean;
/**
 * The project with its welded rib bracket sized for the reactions: from a light bracket (1/2 in ribs 12 in deep, or
 * a haunch root of half the projection; a 3/4 in seat projecting 1 in past the bearing plate and just long enough for
 * both girder bearings with the setting tolerance; J2.4 minimum fillets; no continuity plates), every step grows the
 * part that governs the largest ratio:
 * - rib flexure, stability, combined stress, fatigue at the root or along the free edge, deflection, rotation and the
 *   column panel: 1 in deeper or one plate step thicker, whichever lowers that ratio more per pound (the root fillet
 *   1/16 in larger where the rib root fatigue governs and that lowers it more);
 * - rib shear and the free-edge thickness: thicker; connected metal at the root: thicker up to the column flange;
 * - root fillets, strength or fatigue: 1/16 in larger, then a deeper rib; the seat-to-column group: the same;
 * - seat flexure, shear and fatigue: one plate step; seat fillets: 1/16 in, then the thinner plate;
 * - an unstiffened column check (flange at the ribs or under the seat, web yielding, crippling, sidesway): continuity
 *   plates where they can go in (initialColumnStiffeners), else a deeper rib;
 * - continuity plates: fillets 1/16 in, then 1/8 in thicker (to 1 1/4 in), half to full depth for the web shear, then
 *   a deeper rib (a wider pair spacing);
 * after each step the rib spacing (ribSpacingFor), a haunch's tip depth (a third of the root, at least 6 in, within
 * the 10° to 45° free edge), the continuity plates' J10.8 thickness and every fillet's J2.4 minimum follow. A step that
 * leaves no rib spacing clear of the bearing bolt nuts is not taken, and a ratio no step lowers is set aside (the
 * checks report it). The code minimums met by construction (J10.8 plate proportions, nut clearance) need only reach 1.
 * Stops when every ratio is at most `target` or after 200 steps; the full analysis then checks every concurrent case.
 * A sized bracket that fails validation is not used: the configured one is kept.
 */
export interface BracketSizingOptions {
 /**
  * 'tie': no reach is configured, so choose one long enough for the top-flange tie as the details carry it (tieReach);
  * 'fixed' (default): keep it (the configurator, whose tie sizing has set the reach).
  */
 reach?:'tie'|'fixed';
 /** Called after every step with the governing ratio and the bracket it led to (undefined: nothing helps that ratio). */
 trace?:(step:number,key:string,ratio:number,next?:BracketInput)=>void;
}
export function sizeWeldedBracket(p:ProjectInput,target=.9,options:BracketSizingOptions={}):ProjectInput{
 const q=structuredClone(p),d=q.details!,b0=d.bracket;
 if(!b0?.enabled||!weldedRibBracket(b0))return q;
 const haunched=haunchedBracket(b0),c=b0.receiver,E=q.section.E,Fy=d.material.Fy;
 // Stiffeners go into an existing column; a new column takes them only where they clear its bracing gussets.
 const stiffenersFit=(b:BracketInput)=>columnStiffenerErrors({...q,details:{...d,bracket:b}}).length===0;
 /** Haunch tip: a third of the root depth, at least 6 in, within the free-edge slope limits (h_r - h_t from L tan 10° to L). */
 const tipFor=(b:BracketInput)=>{const L=b.seatProjection,h=b.ribDepth,steep=h-L*Math.tan(haunchAngleLimits.max*Math.PI/180),flat=h-L*Math.tan(haunchAngleLimits.min*Math.PI/180);
  return Math.min(Math.max(6*inch,up(h/3,inch),up(steep,inch/4)),down(flat,inch/4));};
 /** Dependent sizes: the rib spacing, a haunch's tip, the stiffener J10.8 thickness and every fillet's minimum. False when no rib spacing clears the bolts. */
 const settle=(b:BracketInput)=>{
  if(haunched)b.tipDepth=tipFor(b);
  b.rootWeld=Math.max(b.rootWeld,filletMinimum([b.ribThickness,c.flangeThickness]));
  b.seatWeld=Math.max(b.seatWeld,filletMinimum([b.ribThickness,b.seatThickness]));
  const s=b.columnStiffeners;
  if(s?.enabled){
   s.thickness=Math.max(s.thickness,up(Math.max(b.seatThickness,b.ribThickness)/2,eighth),up(s.width/(.56*Math.sqrt(E/Fy)),eighth),up(s.width/16,eighth));
   s.flangeWeld=Math.max(s.flangeWeld,filletMinimum([s.thickness,c.flangeThickness]));s.webWeld=Math.max(s.webWeld,filletMinimum([s.thickness,c.webThickness]));
  }
  const spacing=ribSpacingFor(q,b);if(spacing===undefined)return false;b.ribSpacing=spacing;return true;
 };
 // The light start, at a reach long enough for the top-flange tie's clear length where none is configured (tieReach).
 let b:BracketInput={...structuredClone(b0),ribThickness:.5*inch,seatThickness:.75*inch,rootWeld:0,seatWeld:0};
 delete b.columnStiffeners;
 // The girder's factored end rotation, for the tie's clear length and its release travel, once.
 let rotation:number|undefined;const theta=()=>rotation??=girderEndRotation(q);
 if(options.reach==='tie')b.reach=tieReach(q,b0.reach,theta());
 b.seatProjection=up(b.reach+d.bearing.width/2+inch,inch/2);
 // The seat holds both girder bearings with the setting tolerance (end-bearing-seat-fit): g/2 + N + t_set each side.
 b.seatLength=up(2*((p.system==='simple'?simpleSupportInput(q).endGap/2:0)+d.bearing.length+seatSettingTolerance),inch/2);
 b.ribDepth=haunched?Math.max(12*inch,up(b.seatProjection/2,inch)):12*inch;
 if(!settle(b))return q;
 // The sizing set at the sized bracket's reach and bearing offsets (supportReactions take its support steel as dead load).
 d.bracket=b;const set=bracketSizingSet(q,tieRelease(q)?theta():undefined);
 const ratios=(v:BracketInput)=>{d.bracket=v;return bracketSizingRatios(q,set);};
 // Code minimums the sizing meets by construction (the J10.8 plate proportions, the nut clearance) need only reach 1:
 // they are scaled to the target so a plate at its minimum is not grown for margin.
 const exact=new Set(['colstiff-proportions','nuts','release']),scaled=(r:Record<string,number>)=>Object.entries(r).map(([k,v])=>[k,exact.has(k)?v*target:v] as [string,number]);
 // A ratio nothing can lower is set aside (and reported by the checks), so the others still grow.
 const stuck=new Set<string>(),worst=(r:Record<string,number>)=>scaled(r).filter(([k])=>!stuck.has(k)).sort((x,y)=>y[1]-x[1])[0]??['',0];
 // A step on a copy, kept only when it settles (a rib spacing clear of the nuts) and changes something.
 const step=(from:BracketInput,move:Move)=>{const v=structuredClone(from);if(!move(v))return undefined;return settle(v)&&JSON.stringify(v)!==JSON.stringify(from)?v:undefined;};
 const deeper:Move=v=>{if(v.ribDepth+inch>maxRibDepth(v)+1e-6)return false;v.ribDepth+=inch;return true;};
 const thicker:Move=v=>{const t=nextPlate(v.ribThickness);if(!t||t>3*inch)return false;v.ribThickness=t;return true;};
 const rootWeld:Move=v=>{const w=v.rootWeld+sixteenth;if(w>maxFillet(v.ribThickness,c.flangeThickness)+1e-6)return false;v.rootWeld=w;return true;};
 const seatWeld:Move=v=>{const w=v.seatWeld+sixteenth;if(w>maxFillet(v.ribThickness,v.seatThickness)+1e-6)return false;v.seatWeld=w;return true;};
 const seat:Move=v=>{const t=nextPlate(v.seatThickness);if(!t)return false;v.seatThickness=t;return true;};
 const thinner:Move=v=>v.seatThickness<=v.ribThickness?seat(v):thicker(v);
 const stiffen:Move=v=>{if(v.columnStiffeners?.enabled)return false;v.columnStiffeners=initialColumnStiffeners(v.receiver,receiverK(v,q.existingColumn)?.k,Math.max(v.seatThickness,v.ribThickness));return stiffenersFit(v);};
 const plateWeld=(k:'flangeWeld'|'webWeld'):Move=>v=>{const s=v.columnStiffeners;if(!s)return false;const w=s[k]+sixteenth;if(w>maxFillet(s.thickness)+1e-6)return false;s[k]=w;return true;};
 const plateThicker:Move=v=>{const s=v.columnStiffeners;if(!s||s.thickness+eighth>1.25*inch+1e-6)return false;s.thickness+=eighth;return true;};
 const fullDepth:Move=v=>{const s=v.columnStiffeners;if(!s||s.length==='full')return false;s.length='full';return true;};
 const both:Move=v=>{const flange=plateWeld('flangeWeld')(v),web=plateWeld('webWeld')(v);return flange||web;};
 // Moves for each governing ratio: each list is tried in order (the first that applies), a nested list is a choice
 // made by the larger drop of that ratio per pound of steel added.
 const rib:Move[]=[deeper,thicker],moves:Record<string,(Move|Move[])[]>={
  'rib-flexure':[rib],'rib-interaction':[rib],'rib-flexure-root':[rib],'rib-edge':[rib],'fatigue-rib-edge':[rib],'fatigue-peak':[rib],'rotation':[rib],'uplift-rib-flexure':[rib],'column-panel':[deeper],
  // The deflection adds the rib's and the seat's: either may govern it, also where the tie's release takes it.
  'deflection':[[deeper,thicker,seat]],'release':[[deeper,thicker,seat]],
  'fatigue-rib':[[deeper,thicker,rootWeld]],
  'rib-shear':[[thicker,deeper]],'rib-shear-root':[[thicker,deeper]],'uplift-rib-shear':[[thicker,deeper]],'rib-edge-thickness':[thicker],'root-base':[thicker,deeper],
  'root-weld':[rootWeld,deeper,thicker],'fatigue-rootWeld':[rootWeld,deeper,thicker],'uplift-root-weld':[rootWeld,deeper],'column-weld':[rootWeld,deeper],'fatigue-columnWeld':[rootWeld,deeper],
  'seat-flexure':[seat],'seat-shear':[seat],'fatigue-seat':[seat],'uplift-seat-flexure':[seat],
  'seat-weld':[seatWeld,thinner],'fatigue-seatWeld':[seatWeld,thinner],'uplift-seat-weld':[seatWeld,thinner],
  'column-flange':[stiffen,deeper],'uplift-column-flange':[stiffen,deeper],'seat-flange':[stiffen,deeper],'seat-web':[stiffen,deeper],'column-yield':[stiffen,deeper],'column-crippling':[stiffen,deeper],'column-sidesway':[stiffen,deeper],
  'colstiff-upper':[plateThicker,deeper],'colstiff-lower':[plateThicker,deeper],'colstiff-proportions':[plateThicker],
  'colstiff-flange-weld':[plateWeld('flangeWeld'),plateThicker,deeper],'colstiff-fatigue-plate':[plateWeld('flangeWeld'),plateThicker,deeper],
  'colstiff-web-weld':[plateWeld('webWeld'),plateThicker,deeper],'colstiff-fatigue-weld':[both,plateThicker,deeper],'colstiff-web-shear':[fullDepth,deeper],
  'nuts':[]};
 let r=ratios(b);
 for(let i=0;i<200;i++){
  const [key,value]=worst(r);if(value<=target)break;
  let next:BracketInput|undefined;
  for(const m of moves[key]??[rib]){
   if(Array.isArray(m)){
    // The candidate that lowers the governing ratio most per pound added (a fillet counts as one pound per step).
    let best:{v:BracketInput;score:number;r:Record<string,number>}|undefined;
    for(const move of m){const v=step(b,move);if(!v)continue;const rv=ratios(v),drop=value-(exact.has(key)?target:1)*(rv[key]??0),cost=Math.max(bracketWeight(q,v)-bracketWeight(q,b),4.448);
     if(drop>1e-9&&(!best||drop/cost>best.score))best={v,score:drop/cost,r:rv};}
    if(best){next=best.v;r=best.r;break;}
    continue;
   }
   next=step(b,m);if(next){r=ratios(next);break;}
  }
  options.trace?.(i,key,value,next);
  if(!next){stuck.add(key);continue;}
  b=next;
 }
 d.bracket=b;
 // Never hand on an invalid bracket: keep the configured one where the sized one fails validation.
 if(validateBracket(q).length)d.bracket=b0;
 return q;
}

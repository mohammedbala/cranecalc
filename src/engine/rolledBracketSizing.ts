/**
 * Template sizing of the rolled W-stub bracket ('rolled-corbel') for the project's support reactions, in the pattern of
 * the welded rib seats (sizeWeldedBracket): the same sizing set (bracketSizingSet: each support's largest factored
 * reaction on one girder end at a time with the side thrust and its torque, the longitudinal or stop force and any
 * uplift; the crane reaction of each duty bin; the service reaction), and every ratio from the stub's own collector and
 * checks (createRolledBracketCollector, rolledBracketChecks), exactly as the full analysis reports it; the full analysis
 * then checks every concurrent case.
 *
 * The bracket starts light, on the lightest W12, W14 or W16 whose flanges fit the receiving column flange, with fillet
 * flange welds at the J2.4 minimum, no bearing stiffeners, a 3/4 in spreader seat and no column stiffeners, and grows on
 * the governing ratio: the stub to the next heavier shape of a family, or the next with a wider flange or a deeper web,
 * whichever lowers that ratio most per pound; the seat one plate step; fillets 1/16 in at a time (to 5/8 in and
 * t - 1/16 in), the flange fillets to CJP groove welds where the fillet cannot carry the flange; bearing stiffeners where
 * the stub web or flange outstands need them; and, in the receiving column where an unstiffened J10 check governs,
 * full-depth continuity plates (existing columns, or new ones where they clear the bracing gussets; otherwise a deeper
 * stub). A second pass sizes the seat, welds and plates again from light on the stub the first pass chose, and the
 * lighter result is kept. Canonical units N, mm.
 */
import type {ProjectInput,CheckResult} from './types';
import type {BracketInput} from './bracketInputs';
import {aiscWShapes,aiscShapeByName} from '../data/aiscSections';
import {isRolledBracket,rolledInput,rolledStub} from './rolledBracketInputs';
import {createRolledBracketCollector,rolledBracketChecks,rolledSelfWeight,rolledSeatChecks,stubBoltLayout,bearingExtent,stubBearing} from './rolledBracket';
import {validateBracket} from './bracketDesign';
import {bracketSizingSet,tieReach,girderEndRotation,plateSteps,type BracketSizingOptions} from './bracketSizing';
import {filletMinimum} from './connectionStrength';
import {initialColumnStiffeners,receiverK} from './columnStiffenerInputs';
import {activeEndBearing} from './endBearingInputs';
import {endBearingGeometry} from './endBearing';
import {wrenchClearance} from './endStop';
import {seatSettingTolerance} from './fitTolerances';
import {tieRelease} from './tieGeometry';

const inch=25.4,eighth=inch/8,sixteenth=inch/16,up=(v:number,step:number)=>Math.ceil(v/step-1e-9)*step;
const nextPlate=(t:number)=>plateSteps.find(v=>v>t+1e-6);
/** Largest fillet the sizing grows to: 5/8 in, a few passes; and t - 1/16 in of the thinner part. */
const maxFillet=(...t:number[])=>Math.min(5/8*inch,Math.min(...t)-sixteenth);

/**
 * Stub shapes the sizing chooses from, lightest first: W12, W14 and W16 sections whose flanges fit the receiving
 * column flange (CJP at the flange tips at most) and are not slender (b_f/2t_f ≤ 1.0√(E/F_y), B4.1b case 10).
 */
export function stubCandidates(b:BracketInput,E:number,families=/^W(12|14|16|18|21)X/){
 const Fy=rolledInput(b).Fy,c=b.receiver;
 return aiscWShapes.filter(s=>families.test(s.name)&&s.bf*inch<=c.width+1e-6&&s.bf/(2*s.tf)<=Math.sqrt(E/Fy)).sort((x,y)=>x.weight-y.weight);
}
/** Steel weight of the rolled bracket, N: the stub, its bearing stiffeners and spreader seat, and any column stiffeners. */
export function rolledBracketWeight(p:ProjectInput,b:BracketInput){
 const q={...p,details:{...p.details!,bracket:b}},st=rolledStub(b);if(!st)return Infinity;
 const s=b.columnStiffeners?.enabled?b.columnStiffeners:undefined,c=b.receiver;
 const plates=s?4*s.thickness*s.width*(s.length==='full'?c.depth-2*c.flangeThickness:c.depth/2-c.flangeThickness)*p.section.density*9.80665/1e9:0;
 return rolledSelfWeight(q,st)+plates;
}
/** End bearing checks of the stub that geometry alone sets: bolt edges on the seat and stub, the nut clearances below them, the bearings' fit on the seat. */
const seatFitIds=new Set(['end-bearing-stub-edge','end-bearing-wrench-stub-column','end-bearing-seat-fit','end-bearing-seat-fit-end','end-bearing-wrench-stub-web','end-bearing-wrench-stub-tip','end-bearing-wrench-stub-stiffener']);
/**
 * The geometric end-bearing checks of the bearings on the stub (rolledSeatChecks without the bolt forces, which the full
 * analysis supplies): each as its demand over its capacity, at most 1 when it fits. Empty without bolted end bearings.
 */
export function stubSeatFit(p:ProjectInput):Record<string,number>{
 const e=activeEndBearing(p);if(!e)return {};
 const compared=(id:string,_t:string,demand:number,capacity:number):CheckResult=>({id,group:'End bearings',title:id,demand,capacity,quantity:'length',utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&demand<=capacity*(1+1e-9)?'pass':'fail',equation:'',note:'',referenceIds:[]});
 try{
  const checks=rolledSeatChecks(p,e,endBearingGeometry(p,e),0,0,wrenchClearance(e.bolts.diameter),()=>0,compared);
  return Object.fromEntries(checks.filter(c=>seatFitIds.has(c.id)).map(c=>[c.id,c.utilization??1e12]));
 }catch{return {'end-bearing-stub-edge':1e12};}
}
/** Checks of the stub the sizing does not drive: detailing it sets by construction, the AIST reaction recommendation, the bearing bolts and the column's own stress range. */
const notSized=/^wbracket-(tr13-load|uplift|fatigue-column|flange-weld-minimum|flange-weld-length|web-weld-minimum|seat-weld-minimum|seat-weld-maximum|stiffener-weld-minimum|colstiff-(length|fit|weld-minimum|weld-length|fatigue-toe))$/;
/**
 * The rolled bracket checks under the sizing set, as the full analysis reports them (rolledBracketChecks), keyed by
 * check id without the 'wbracket-' prefix; `release` is the vertical travel the tie's column-end release needs with
 * this bracket's service deflection over its slot travel (tie-release-travel), as for the welded seats.
 */
export function rolledBracketSizingRatios(p:ProjectInput,set=bracketSizingSet(p)){
 const c=createRolledBracketCollector(p),ratios:Record<string,number>={};
 if(!c)return ratios;
 for(const v of set.strength)c.observe('strength','sizing',v.x,v.loads,-1,v.horizontal);
 for(const v of set.fatigue)c.observe('fatigue','sizing',v.x,v.loads,v.bin,v.horizontal);
 for(const v of set.service)c.observe('service','sizing',v.x,v.loads,-1,v.horizontal);
 for(const k of rolledBracketChecks(p,c.result,set.serviceReaction))if(k.utilization!==undefined&&(k.status==='pass'||k.status==='fail')&&!notSized.test(k.id))ratios[k.id.replace(/^wbracket-/,'')]=k.utilization;
 if(set.release)ratios.release=((c.result.service.deflection?.value??0)*set.release.factor+set.release.other)/set.release.travel;
 return ratios;
}

type Move=(b:BracketInput)=>boolean;
/**
 * The project with its rolled W-stub bracket sized for the reactions (see the file header). Moves per governing ratio:
 * - stub flexure, shear, combined stress (H3.3 with the torsion warping), interaction, flange shear, rotation, the
 *   stub web at the stiffener toes, the CJP flanges, the web base metal and the J10.6 panel: the stub;
 * - deflection and the tie's release travel: the stub or the seat (both enter the deflection);
 * - stub web local yielding and crippling under the bearing (J10.2, J10.3): bearing stiffeners, then the stub; the
 *   flange outstands under the seat reactions: stiffeners or the stub, per pound;
 * - bearing stiffeners as columns (J10.8), in bearing and their welds: thicker, larger fillets;
 * - the seat in bending and its fatigue: one plate step or the stub, per pound; seat fillets: 1/16 in, then the stub;
 * - flange fillets (strength and fatigue): 1/16 in, then CJP groove welds, then the stub; web fillets: 1/16 in, then
 *   the stub;
 * - an unstiffened column check (J10.1 to J10.4): full-depth continuity plates where they can go in, else the stub;
 *   the plates' own checks as in sizeWeldedBracket;
 * after each step the stub length (1 in past the bearing plate, the bolt edge at its tip), the seat (both bearings with
 * the setting tolerance, the bolt edges, past the flange tips), the J10.8 stiffener and plate thicknesses and every
 * fillet's J2.4 minimum follow; a step that leaves the bracket invalid, or a bolt edge, nut clearance or the bearing fit
 * unmet, is not taken, and a ratio no step lowers is set aside (the checks report it). Code minimums met by
 * construction (the J10.8 proportions) and the tie's release travel need only reach 1. Stops when every ratio is at most
 * `target` or after 200 steps per pass. A sized bracket that fails validation is not used: the configured one is kept.
 */
export function sizeRolledBracket(p:ProjectInput,target=.9,options:BracketSizingOptions&{
 /** Stub shapes to choose from (default: stubCandidates), e.g. one fixed shape. */
 shapes?:string[]}={}):ProjectInput{
 const q=structuredClone(p),d=q.details!,b0=d.bracket;
 if(!b0?.enabled||!isRolledBracket(b0))return q;
 const c=b0.receiver,E=q.section.E,eb=activeEndBearing(q),shapes=stubCandidates(b0,E,options.shapes?/^W\d+X/:undefined).filter(s=>!options.shapes||options.shapes.includes(s.name));
 if(!shapes.length)return q;
 const shape=(b:BracketInput)=>aiscShapeByName(b.corbelShape??'')!;
 const withBracket=(b:BracketInput)=>({...q,details:{...d,bracket:b}});
 /** Dependent sizes; false where the bracket would be invalid or a bolt edge, nut clearance or bearing fit unmet. */
 const settle=(b:BracketInput)=>{
  const st0=rolledStub(b);if(!st0)return false;
  const r=b.rolled={...rolledInput(b)};
  // Fillets across a flange that would overhang the column flange, or inner segments under four sizes long: CJP.
  if(r.flangeJoint==='fillet'){r.flangeWeld=Math.max(r.flangeWeld,filletMinimum([st0.tf,c.flangeThickness]));if(st0.bf+2*r.flangeWeld>c.width-1e-6||st0.bf/2-st0.k1<4*r.flangeWeld)r.flangeJoint='cjp';}
  r.webWeld=Math.max(r.webWeld,filletMinimum([st0.tw,c.flangeThickness]));
  // The stub reaches 1 in past the bearing plate and 1.5 bolt diameters past the outer bolt row.
  const {W}=stubBearing(withBracket(b)),lay=eb?stubBoltLayout(withBracket(b),eb):undefined;
  b.seatProjection=up(Math.max(b.reach+W/2+inch,lay?lay.rows[1]+1.5*eb!.bolts.diameter:0),inch/2);
  if(r.stiffeners){
   const st=rolledStub(b)!,s=st.stiffener!;
   r.stiffenerThickness=Math.max(r.stiffenerThickness,.375*inch,up(Math.max(st.tf/2,s.width/16,s.width/(.56*Math.sqrt(E/r.Fy))),eighth));
   r.stiffenerWeld=Math.max(r.stiffenerWeld,filletMinimum([r.stiffenerThickness,st.tw],[r.stiffenerThickness,st.tf]));
  }
  if(r.seatPlate){
   const st=rolledStub(b)!;
   b.seatWeld=Math.max(b.seatWeld,filletMinimum([b.seatThickness,st.tf]));
   // Both girder bearings with the setting tolerance, the bolts 1.5 diameters inside its ends, past the flange tips.
   b.seatLength=up(Math.max(2*(bearingExtent(q)+seatSettingTolerance),lay?2*(lay.outer+1.5*eb!.bolts.diameter):0,st.bf+2*(b.seatWeld+inch/4)),inch/2);
  }
  const s=b.columnStiffeners;
  if(s?.enabled){
   const st=rolledStub(b)!;
   s.thickness=Math.max(s.thickness,up(st.tf/2,eighth),up(s.width/(.56*Math.sqrt(E/d.material.Fy)),eighth),up(s.width/16,eighth));
   s.flangeWeld=Math.max(s.flangeWeld,filletMinimum([s.thickness,c.flangeThickness]));s.webWeld=Math.max(s.webWeld,filletMinimum([s.thickness,c.webThickness]));
  }
  const v=withBracket(b);
  return validateBracket(v).length===0&&Object.values(stubSeatFit(v)).every(x=>x<=1+1e-9);
 };
 // The girder's factored end rotation, for the tie's clear length and its release travel, once.
 let rotation:number|undefined;const theta=()=>rotation??=girderEndRotation(q);
 const reach=options.reach==='tie'?tieReach(q,b0.reach,theta()):b0.reach;
 /** The light start on a stub: fillet flanges at the J2.4 minimum, no stiffeners, a 3/4 in seat, no column stiffeners. */
 const light=(name:string)=>{
  const b:BracketInput={...structuredClone(b0),reach,corbelShape:name,seatThickness:.75*inch,seatWeld:0,
   rolled:{...rolledInput(b0),flangeJoint:'fillet',flangeWeld:0,webWeld:0,stiffeners:false,stiffenerThickness:.375*inch,stiffenerWeld:0,seatPlate:true}};
  delete b.columnStiffeners;return b;
 };
 // The lightest candidate that settles valid.
 let start:BracketInput|undefined;
 for(const s of shapes){const b=light(s.name);if(settle(b)){start=b;break;}}
 if(!start)return q;
 // The sizing set at the sized bracket's reach and bearing offsets (supportReactions take its support steel as dead load).
 d.bracket=start;const set=bracketSizingSet(q,tieRelease(q)?theta():undefined);
 const ratios=(v:BracketInput)=>{d.bracket=v;return rolledBracketSizingRatios(q,set);};
 const weight=(v:BracketInput)=>rolledBracketWeight(q,v);
 // Code minimums the sizing meets by construction need only reach 1: scaled to the target so a part at its minimum
 // is not grown for margin.
 const exact=new Set(['stiffener-proportions','colstiff-proportions','release']);
 const step=(from:BracketInput,move:Move)=>{const v=structuredClone(from);if(!move(v))return undefined;return settle(v)&&JSON.stringify(v)!==JSON.stringify(from)?v:undefined;};
 // The stub: the next heavier shape of each family, or the next with a wider flange or a deeper web.
 const heavier=(test:(s:typeof shapes[number],now:typeof shapes[number])=>boolean):Move=>v=>{const now=shape(v),next=shapes.find(s=>s.weight>now.weight+1e-9&&test(s,now));if(!next)return false;v.corbelShape=next.name;return true;};
 const stub:Move[]=[...['W12X','W14X','W16X','W18X','W21X'].map(f=>heavier(s=>s.name.startsWith(f))),heavier((s,n)=>s.bf>n.bf+.5),heavier((s,n)=>s.d>n.d+1)];
 const seat:Move=v=>{const t=nextPlate(v.seatThickness);if(!t)return false;v.seatThickness=t;return true;};
 const seatWeld:Move=v=>{const st=rolledStub(v)!,w=v.seatWeld+sixteenth;if(w>maxFillet(st.tf,v.seatThickness)+1e-6)return false;v.seatWeld=w;return true;};
 const flangeWeld:Move=v=>{const r=v.rolled!,st=rolledStub(v)!;if(r.flangeJoint!=='fillet')return false;const w=r.flangeWeld+sixteenth;if(w>maxFillet(st.tf,c.flangeThickness)+1e-6||st.bf+2*w>c.width-1e-6)return false;r.flangeWeld=w;return true;};
 const cjp:Move=v=>{const r=v.rolled!;if(r.flangeJoint==='cjp')return false;r.flangeJoint='cjp';return true;};
 const webWeld:Move=v=>{const r=v.rolled!,st=rolledStub(v)!,w=r.webWeld+sixteenth;if(w>maxFillet(st.tw,c.flangeThickness)+1e-6)return false;r.webWeld=w;return true;};
 const stiffen:Move=v=>{const r=v.rolled!;if(r.stiffeners)return false;r.stiffeners=true;return true;};
 const stiffenerThicker:Move=v=>{const r=v.rolled!;if(!r.stiffeners)return false;const t=nextPlate(r.stiffenerThickness);if(!t||t>1.5*inch)return false;r.stiffenerThickness=t;return true;};
 // A larger stiffener fillet, on a thicker stiffener where the plate-edge limit t - 1/16 in stops it.
 const stiffenerWeld:Move=v=>{const r=v.rolled!;if(!r.stiffeners)return false;const w=r.stiffenerWeld+sixteenth;if(w>5/8*inch+1e-6)return false;
  if(w>maxFillet(r.stiffenerThickness)+1e-6){const t=nextPlate(r.stiffenerThickness);if(!t||t>1.5*inch)return false;r.stiffenerThickness=t;}r.stiffenerWeld=w;return true;};
 // Continuity plates, full depth: the stub's flange force and lateral moment as a couple between the plates (J10.8).
 const columnStiffen:Move=v=>{if(v.columnStiffeners?.enabled)return false;v.columnStiffeners={...initialColumnStiffeners(v.receiver,receiverK(v,q.existingColumn)?.k,rolledStub(v)!.tf),length:'full'};return true;};
 // A larger plate fillet, on a plate 1/8 in thicker where the plate-edge limit t - 1/16 in stops it.
 const plateWeld=(k:'flangeWeld'|'webWeld'):Move=>v=>{const s=v.columnStiffeners;if(!s?.enabled)return false;const w=s[k]+sixteenth;if(w>5/8*inch+1e-6)return false;
  if(w>maxFillet(s.thickness)+1e-6){if(s.thickness+eighth>1.25*inch+1e-6)return false;s.thickness+=eighth;}s[k]=w;return true;};
 const plateThicker:Move=v=>{const s=v.columnStiffeners;if(!s?.enabled||s.thickness+eighth>1.25*inch+1e-6)return false;s.thickness+=eighth;return true;};
 const fullDepth:Move=v=>{const s=v.columnStiffeners;if(!s?.enabled||s.length==='full')return false;s.length='full';return true;};
 const both:Move=v=>{const flange=plateWeld('flangeWeld')(v),web=plateWeld('webWeld')(v);return flange||web;};
 // Moves for each governing ratio, tried in order (the first that applies); a nested list is a choice made by the
 // larger drop of that ratio per pound of steel added.
 const moves:Record<string,(Move|Move[])[]>={
  'stub-flexure':[stub],'stub-shear':[stub],'stub-flange-shear':[stub],'stub-interaction':[stub],'stub-combined':[stub],'rotation':[stub],
  'fatigue-stiffener-toe':[stub],'flange-cjp':[stub],'web-base':[stub],'column-panel':[stub],
  'deflection':[[...stub,seat]],'release':[[...stub,seat]],
  'web-yielding':[stiffen,stub],'web-crippling':[stiffen,stub],'stiffener-required':[stiffen,stub],'flange-outstand':[[stiffen,...stub]],
  'stiffener-proportions':[stiffenerThicker],'stiffener-column':[[stiffenerThicker,...stub]],'stiffener-bearing':[stiffenerThicker,stub],
  'stiffener-weld':[stiffenerWeld,stiffenerThicker],'fatigue-stiffener-weld':[stiffenerWeld,stiffenerThicker],
  'seat-flexure':[[seat,...stub]],'seat-shear':[seat],'fatigue-seat':[[seat,...stub]],'seat-weld':[seatWeld,stub],'fatigue-seat-weld':[seatWeld,stub],
  'flange-weld':[flangeWeld,cjp,stub],'flange-base':[cjp,stub],'fatigue-flange':[flangeWeld,cjp,stub],
  'web-weld':[webWeld,stub],'fatigue-web':[webWeld,stub],'fatigue-web-weld':[webWeld,stub],
  'column-flange':[columnStiffen,stub],'column-yield-top':[columnStiffen,stub],'column-yield-bottom':[columnStiffen,stub],'column-crippling':[columnStiffen,stub],'column-sidesway':[columnStiffen,stub],
  'colstiff-upper':[plateThicker,stub],'colstiff-lower':[plateThicker,stub],'colstiff-proportions':[plateThicker],
  'colstiff-flange-weld':[plateWeld('flangeWeld'),plateThicker,stub],'colstiff-fatigue-plate':[plateWeld('flangeWeld'),plateThicker,stub],
  'colstiff-web-weld':[plateWeld('webWeld'),plateThicker,stub],'colstiff-fatigue-weld':[both,plateThicker,stub],'colstiff-web-shear':[fullDepth,stub]};
 /** One growth pass from a settled bracket; returns the bracket and its ratios. */
 const grow=(from:BracketInput,pass:number)=>{
  let b=from,r=ratios(b);
  const stuck=new Set<string>(),scaled=(x:Record<string,number>)=>Object.entries(x).map(([k,v])=>[k,exact.has(k)?v*target:v] as [string,number]);
  const worst=(x:Record<string,number>)=>scaled(x).filter(([k])=>!stuck.has(k)).sort((u,v)=>v[1]-u[1])[0]??['',0];
  for(let i=0;i<200;i++){
   const [key,value]=worst(r);if(value<=target)break;
   let next:BracketInput|undefined;
   for(const m of moves[key]??[stub]){
    if(Array.isArray(m)){
     // The candidate that lowers the governing ratio most per pound added (a fillet or a joint change counts as one pound).
     let best:{v:BracketInput;score:number;r:Record<string,number>}|undefined;
     for(const move of m){const v=step(b,move);if(!v)continue;const rv=ratios(v),drop=value-(exact.has(key)?target:1)*(rv[key]??0),cost=Math.max(weight(v)-weight(b),4.448);
      if(drop>1e-9&&(!best||drop/cost>best.score))best={v,score:drop/cost,r:rv};}
     if(best){next=best.v;r=best.r;break;}
     continue;
    }
    // A single move is taken where it lowers the governing ratio (else the next one is tried).
    const v=step(b,m);if(!v)continue;const rv=ratios(v);
    if(value-(exact.has(key)?target:1)*(rv[key]??0)>1e-9){next=v;r=rv;break;}
   }
   options.trace?.(pass*1000+i,key,value,next);
   if(!next){stuck.add(key);continue;}
   b=next;
  }
  return {b,r,within:Object.entries(r).every(([k,v])=>v<=(exact.has(k)?1:target)+1e-9)};
 };
 const first=grow(start,0);
 // Again from light on the chosen stub: the seat, welds, stiffeners and plates grown for it alone.
 const again=light(first.b.corbelShape!);
 const second=settle(again)?grow(again,1):undefined;
 // The result within every ratio, the lighter where both are (or neither is).
 const pick=!second||(first.within&&!second.within)?first:second.within&&!first.within?second:weight(second.b)<=weight(first.b)?second:first;
 d.bracket=pick.b;
 // Never hand on an invalid bracket: keep the configured one where the sized one fails validation.
 if(validateBracket(q).length)d.bracket=b0;
 return q;
}

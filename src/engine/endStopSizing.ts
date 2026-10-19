import {fabricationTolerance} from './fitTolerances';
import type {ProjectInput} from './types';
import {defaultEndStop,stopLip,type EndStopInput} from './endStopInputs';
import {endStopChecks,endStopGeometry,endStopLoadCases,stopBoltForces,stopNutClearances,stopObstacles,wrenchClearance} from './endStop';
import {railPadThickness} from './railSeat';
import {filletMinimum} from './connectionStrength';
import {aiscShapeByName} from '../data/aiscSections';

const inch=25.4,eighth=inch/8,sixteenth=inch/16;
const up=(v:number,step:number)=>Math.ceil(v/step-1e-9)*step,down=(v:number,step:number)=>Math.floor(v/step+1e-9)*step;
/** Bolt diameters tried, smallest first. */
export const stopBoltSizes=[.75,.875,1,1.125].map(v=>v*inch);
/** Bolt tension used at most to this fraction of the J3.7 combined tension-shear strength. */
export const stopBoltTarget=.9;
/** Clear width between two stiffeners for laying their inside fillets: 3 in, and 0.3 of the stiffener height. */
export const stopWeldAccess=(stiffenerHeight:number)=>Math.max(3*inch,.3*stiffenerHeight);
type Arrangement=NonNullable<EndStopInput['stiffener']['arrangement']>;
/** Checks the bolt pattern, base length and arrangement cannot fix by thickening plates or welds. */
const layoutChecks=new Set(['end-stop-bolt-shear','end-stop-slip','end-stop-bearing-flange','end-stop-flange-prying','end-stop-web','end-stop-flange-edge','end-stop-base-edge','end-stop-spacing','end-stop-wrench-face','end-stop-wrench-web','end-stop-wrench-bearing','end-stop-wrench-saddle','end-stop-fit','end-stop-width','end-stop-stiffener-fit','end-stop-stiffener-clear','end-stop-wrench-stiffener']);

export interface StopSizing {stop:EndStopInput;fits:boolean;reason?:string;tried:number}
/**
 * Bolted runway end stop sized for the bumper force of the project's cranes (AIST TR-13 stop combinations: P = 1.0 C_bs
 * LRFD, 0.67 C_bs ASD, at the bumper contact height) and for the rail string bearing on it (1.6 C_ls LRFD, 1.0 ASD, at the
 * base plate), on the girder as detailed: its flange, any cap, the end bearing stiffener and the runway-end tie saddle.
 *
 * Bolt pattern, base length and stiffener arrangement are stepped, shortest base plate first, then two before three bolt
 * rows, then 3/4, 7/8, 1 and 1 1/8 in bolts, then the arrangement: two stiffeners between the bolt lines with a clear
 * width of at least max(3 in, 0.3 × stiffener height) for their inside fillets, else two stiffeners at the base plate
 * edges with the bolts between them, else one central stiffener. Across the runway the gauge stays in the window
 * b_f − 3d ≥ g ≥ 2(k_1 + C_1) (flange edge distance, nut clear of the web fillet) and the bolt heads keep the socket
 * clearance C_1 (AISC Manual Table 7-15) to the stiffener and face plate fillet toes. Along the girder the stop is set
 * back from the girder end until every nut below the flange clears the end bearing stiffener and the top tie saddle
 * by C_1. A layout is kept when the front bolt tension is at most 0.9 of the J3.7 combined strength, the J3.9 group slip
 * and every other stop check pass with the plates thickened in 1/8 in steps (base and face plates from 5/8 in, stiffeners
 * from 1/2 in) and the fillets in 1/16 in steps from the Table J2.4 minimum. When no layout fits, the least failing one
 * is returned with fits false (a stop by others or a welded stop is then needed).
 */
export function sizeEndStop(p:ProjectInput):StopSizing{
 const base=p.details?.endStop??{...structuredClone(defaultEndStop),enabled:true};
 const b=p.section,shape=aiscShapeByName(b.catalogueId??''),k1=b.tw/2+(shape?shape.kdes*inch-b.tf:0);
 const surface=b.kind==='cap'?b.capWidth:b.bf,Wmax=down(Math.min(surface-2*fabricationTolerance,16*inch),.25*inch),D=base.bumperDiameter;
 const railDepth=p.aist?.railDepth??p.railHeight,pad=railPadThickness(p),obstacles=stopObstacles(p);
 const withStop=(e:EndStopInput):ProjectInput=>({...p,details:{...p.details!,endStop:e}});
 let best:{stop:EndStopInput;score:number}|undefined,tried=0;
 // Plan layout of one candidate for its plate and weld sizes; undefined when it cannot be laid out.
 const layout=(db:number,rows:2|3,N:number,arrangement:Arrangement,t:{tb:number;tp:number;ts:number;w:number}):EndStopInput|undefined=>{
  const C=wrenchClearance(db),gMin=up(Math.max(2*(k1+C),8/3*db),.25*inch),gFlange=down(b.bf-3*db,.25*inch),toe=t.w+C;
  const H=up(railDepth+pad+base.bumperHeight-t.tb+D/2+.5*inch,inch),Ls=down(N-snapLip(t.w)-t.tp-inch,.25*inch);
  if(Ls<3*inch)return undefined;
  // The narrowest gauge that keeps the weld access between two stiffeners and the socket clearance at their toes: a
  // wide gauge only lengthens the flange's prying lever b. The stiffeners reach H - 1/2 in at most (endStopGeometry).
  const access=stopWeldAccess(H-.5*inch),wide=(v:number)=>up(Math.max(v,D,0),.25*inch);
  let Wb:number,gauge:number,spacing:number;
  if(arrangement==='inner'){spacing=up(access+t.ts,.25*inch);gauge=Math.max(gMin,up(spacing+t.ts+2*toe,.25*inch));Wb=wide(gauge+3*db);}
  else if(arrangement==='outer'){gauge=gMin;Wb=wide(Math.max(gauge+2*t.ts+2*toe,access+2*t.ts));spacing=Wb-t.ts;}
  else{gauge=Math.max(gMin,up(t.ts+2*toe,.25*inch));spacing=1;Wb=wide(gauge+3*db);}
  if(Wb>Wmax+1e-6||gauge>gFlange+1e-6)return undefined;
  const e:EndStopInput={...structuredClone(base),enabled:true,base:{length:N,width:Wb,thickness:t.tb},face:{thickness:t.tp,height:H},
   stiffener:{thickness:t.ts,length:Ls,spacing,arrangement},bolts:{...base.bolts,diameter:db,gauge,rows,frontClear:up(C+t.w,.25*inch),edge:Math.max(1.5*inch,up(1.5*db,.25*inch))},weldSize:t.w};
  if(arrangement==='inner')delete e.stiffener.arrangement;
  if(rows===2)delete e.bolts.rows;
  // Set back from the girder end until the nuts clear the bearing stiffener and the tie saddle.
  for(let setback=.5*inch;setback<=48*inch;setback+=.25*inch){
   const c=stopNutClearances(p,{...e,setback},obstacles);
   if(c.bearing>=C-1e-6&&(c.saddle===undefined||c.saddle>=C-1e-6))return {...e,setback};
  }
  return undefined;
 };
 const snapLip=(w:number)=>stopLip({...base,weldSize:w});
 const P=endStopLoadCases(withStop(base),base).bumper.F;
 for(let N=10*inch;N<=30*inch+1e-6;N+=inch)for(const rows of [2,3] as const)for(const db of stopBoltSizes)for(const arrangement of ['inner','outer','center'] as Arrangement[]){
  const t={tb:.625*inch,tp:.625*inch,ts:.5*inch,w:.25*inch};
  t.w=Math.max(t.w,filletMinimum([t.tb,t.tp],[t.ts,t.tb],[t.ts,t.tp]));
  let e=layout(db,rows,N,arrangement,t);if(!e)continue;
  // Bolt screen before the plate sizing: front tension with shear, and the group slip, for the bumper.
  {const q=withStop(e),lc=endStopLoadCases(q,e),f=stopBoltForces(q,e,lc.bumper.F,lc.bumper.arm);if(f.T>stopBoltTarget*f.front.tension||f.slip<P)continue;}
  for(let i=0;i<40&&e;i++){
   tried++;
   const checks=endStopChecks(withStop(e)),fails=checks.filter(c=>c.status==='fail'||(c.id==='end-stop-bolt-tension'&&(c.utilization??0)>stopBoltTarget));
   const score=fails.reduce((a,c)=>a+Math.min(10,c.utilization??10),0);
   if(!best||score<best.score)best={stop:e,score};
   if(!fails.length)return {stop:e,fits:true,tried};
   if(fails.some(c=>layoutChecks.has(c.id)||c.id==='end-stop-bolt-tension'))break;
   const has=(...ids:string[])=>fails.some(c=>ids.includes(c.id));
   if(has('end-stop-face','end-stop-face-outstand'))t.tp+=eighth;
   if(has('end-stop-base-prying','end-stop-bearing-base'))t.tb+=eighth;
   if(has('end-stop-flexure','end-stop-shear','end-stop-stiffener'))t.ts+=eighth;
   if(has('end-stop-weld','end-stop-stiffener-weld')){if(t.w+sixteenth<=Math.min(.625*inch,t.ts)+1e-6)t.w+=sixteenth;else t.ts+=eighth;}
   t.w=Math.max(t.w,filletMinimum([t.tb,t.tp],[t.ts,t.tb],[t.ts,t.tp]));
   if(Math.max(t.tb,t.tp)>2.5*inch||t.ts>2*inch)break;
   e=layout(db,rows,N,arrangement,t);
  }
 }
 return {stop:best?.stop??base,fits:false,tried,reason:'No bolted end stop fits this girder top for the bumper force: use a building-mounted stop (by others) or a welded stop designed for it.'};
}

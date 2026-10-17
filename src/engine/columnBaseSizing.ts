/**
 * Template sizing of the base plate, anchor rods and spread footing of new freestanding runway columns
 * (existingColumn.isNew with columnBase.enabled) for the project's support reactions, with the base's own check
 * functions (columnBase.ts), so every ratio is the one the full calculation reports:
 * - the plate under the design-method actions: concrete bearing and thickness (basePlate, AISC Design Guide 1) and
 *   the column flange fillets;
 * - the anchor rods at strength level: tension, shear, their interaction and the plate washer welds (anchorStrength,
 *   ACI 318-19 Chapter 17), the row tension from the bearing block; their clearance to the column flange (rodClearance);
 * - fatigue (AISC 360-16 Appendix 3) of the rods, the column flange joint to the plate and the plate at its toe under
 *   the crane duty bins (columnBaseFatigue);
 * - the footing at service level: soil bearing, overturning, sliding and the brace uplift, the dead load of the
 *   runway, column, footing and soil resisting them; at strength level: one-way and two-way shear, flexure, minimum
 *   reinforcement and bar development (footingStrength); the frost depth and the bar spacing;
 * - the runway drift at the rail with the footing rotating on the soil (baseDrift).
 * Canonical units N, mm.
 */
import type {ProjectInput} from './types';
import {sectionProperties} from './section';
import {supportReactions,type SupportReactionSet} from './supportReactions';
import {existingColumnAnalysis,existingColumnSection} from './existingColumn';
import {anchorsFor,anchorStrength,barArea,barDiameter,baseDrift,basePlate,columnBaseActions,columnBaseAnalysis,columnBaseFatigue,columnBaseFatigueActions,rodClearance,columnBaseChecks,flangeWeldCapacity,flangeWeldDemand,footingStrength,footingWeight,plateWasherWeld,soilPressure} from './columnBase';
import {anchorHardware,barSizes} from './columnBaseInputs';
import {seismicBasis} from './runwaySeismic';

const inch=25.4,foot=304.8,psi=0.006894757293168,up=(v:number,step:number)=>Math.ceil(v/step-1e-9)*step;
/** The next multiple of `step` above `v`, and the last one below it: sizes stay on their standard increments. */
const next=(v:number,step:number)=>(Math.floor(v/step+1e-6)+1)*step,previous=(v:number,step:number)=>(Math.ceil(v/step-1e-6)-1)*step;
/** Prescriptive limits held to their code value rather than the sizing target. */
const codeLimits=new Set(['frost','bar-spacing','min-steel','rod-clear']);
/** Standard anchor rod diameters, 3/4 to 2 in. */
const rodDiameters=[.75,1,1.25,1.5,1.75,2].map(v=>v*inch);
/** Largest footing (square, plan and depth), plate, plate thickness and rod embedment the sizing goes to. */
const caps={footing:30*foot,depth:8*foot,plate:60*inch,thickness:6*inch,embedment:48*inch};
/**
 * Share of the drift target the column alone may take for the footing to be sized for the rest: a column more flexible
 * than that is left to the column choice (the configurator steps to a heavier shape) rather than to a rigid footing.
 */
export const columnDriftShare=.8;
const finite=(v:number)=>Number.isNaN(v)?Infinity:v;

/**
 * Sizing set: the support reactions (supportReactions), the column result for the drift (existingColumnAnalysis) and
 * the base actions of every support as the full analysis forms them (columnBaseActions): in the design method for the
 * plate, at strength level (LRFD) for the anchors and the footing strength, at service level (ASD) for the soil,
 * overturning, sliding and uplift. Only the column geometry changes them; the reactions do not depend on the base.
 */
export function baseSizingSet(p:ProjectInput,reactions:SupportReactionSet=supportReactions(p,sectionProperties(p.section))){
 return {reactions,column:existingColumnAnalysis(p,reactions),design:columnBaseActions(p,reactions,p.method),strength:columnBaseActions(p,reactions,'LRFD'),service:columnBaseActions(p,reactions,'ASD'),fatigue:columnBaseFatigueActions(p,reactions)};
}
export type BaseSizingSet=ReturnType<typeof baseSizingSet>;
export interface BaseSizingRatios{
 /** Ratio of each base check, by check id without the 'base-' prefix (demand over capacity, as reported). */
 ratios:Record<string,number>;
 /** Governing anchor limit states at the action with the largest interaction, and whether shear or tension dominates there. */
 tension:'steel'|'breakout'|'pullout'|'blowout';shear:'steel'|'pryout'|'breakout'|'breakoutY';dominant:'tension'|'shear';
 /** Edges closer than 1.5hef reduce the effective embedment (ACI 318-19 §17.6.2.1.2). */
 edgeReduced:boolean;
 /** Required plate thickness, and the column's own drift over the drift limit. */
 tRequired:number;column:number;
}
type AnchorResult=ReturnType<typeof anchorStrength>;
/** Governing tension and shear limit states of one anchor result. */
function anchorStates(r:AnchorResult){
 const k=r.seismic?.75:1,tension=([['steel',r.steelT],['breakout',k*r.breakout],['pullout',k*r.pullout],['blowout',r.blowout===undefined?Infinity:k*r.blowout]] as const).reduce((x,y)=>y[1]<x[1]?y:x)[0];
 const shear=([['steel',r.V/r.steelV],['pryout',r.V/r.pryout],['breakout',r.Vx/r.breakoutV],['breakoutY',r.Vy/r.breakoutVy]] as const).reduce((x,y)=>y[1]>x[1]?y:x)[0];
 return {tension,shear,dominant:(r.V/r.phiVn>r.T/r.phiNn?'shear':'tension') as 'tension'|'shear'};
}

/**
 * The base ratios as columnBaseAnalysis and columnBaseChecks form them (the worst action at each support, the worst
 * support for each check), each component function evaluated once per action.
 */
export function baseSizingRatios(p:ProjectInput,set:BaseSizingSet=baseSizingSet(p)):BaseSizingRatios{
 const b=p.columnBase!,{section:c}=existingColumnSection(p),A=sectionProperties(c).A,f=b.footing,an=b.anchors,arm=f.thickness+b.grout,W=footingWeight(b);
 const ratios:Record<string,number>={},put=(k:string,v:number)=>{ratios[k]=Math.max(ratios[k]??0,finite(v));};
 let tRequired=0;
 for(const sp of set.design)for(const a of sp.actions){const r=basePlate(p,b,a);tRequired=Math.max(tRequired,finite(r.tRequired));put('bearing',r.bearing);}
 put('plate',tRequired/b.plate.thickness);
 // The flange fillets with the base bimoment's flange lateral moments (flangeWeldDemand).
 const flange=Math.max(0,...set.design.flatMap(sp=>sp.actions.map(a=>flangeWeldDemand(p,b,a,A).demand)));
 put('weld',flange/flangeWeldCapacity(p,b));
 // The rods (anchorsFor): torque shear added as vectors per rod, the bimoment's rod force; tension and shear each at their own worst action.
 const seismicAnchors=(seismicBasis(p)?.sdc??'A')>='C',washer=plateWasherWeld(b).phiRn;
 let governing:{r:AnchorResult;v:number}|undefined;
 for(const sp of set.strength){
  let worst:{r:AnchorResult;v:number}|undefined;
  for(const a of sp.actions){const r=anchorsFor(p,b,a,seismicAnchors),v=finite(r.interaction);put('anchor-tension',r.T/r.phiNn);put('anchor-shear',r.V/r.phiVn);put('washer-weld',r.V/(2*an.perRow)/washer);if(!worst||v>worst.v)worst={r,v};}
  if(!worst)continue;
  put('anchor-interaction',worst.r.interaction);
  if(!governing||worst.v>governing.v)governing=worst;
 }
 const fs=(resist:number,ot:number)=>resist<=0?0:ot>0?resist/ot:Infinity;
 for(const sp of set.service)for(const a of sp.actions){
  const required=a.fs??1.5,dead=a.Pd+W-(a.uplift??0);
  put('soil',soilPressure(b,a.P+W,a.Mx+a.Vx*arm,a.My+a.Vy*arm)/b.soil.allowable);
  const tipping=Math.min(fs(dead*f.L/2-a.Md-a.Vd*arm,a.Mh+a.Vh*arm),fs(dead*f.B/2,a.My+a.Vy*arm));put('overturning',tipping>0?required/tipping:Infinity);
  const v=dead>0?Math.hypot(a.Vx,a.Vy)/dead:Infinity,sliding=v>0?b.soil.friction/v:Infinity;put('sliding',sliding>0?required/sliding:Infinity);
  if((a.uplift??0)>0)put('uplift',required*a.uplift!/(a.Pd+W));
 }
 for(const sp of set.strength)for(const a of sp.actions){
  const r=footingStrength(p,b,a);put('two-way',r.vu/r.phivc);
  for(const w of [r.along,r.across]){put('one-way',w.Vu/w.phiVc);put('flexure',w.Mu/w.phiMn);put('min-steel',w.AsMin/w.As);put('development',w.available>0?w.ld/w.available:Infinity);}
 }
 // Fatigue of the rods, the flange joint and the plate under the duty bins (columnBaseFatigue); the rods' clearance to the flange.
 for(const a of set.fatigue){const z=columnBaseFatigue(p,b,a);put('anchor-fatigue',z.rod.range/z.rod.capacity);put('weld-fatigue-toe',z.toe.range/z.toe.capacity);if(z.root)put('weld-fatigue-root',z.root.range/z.root.capacity);put('plate-fatigue',z.plate.range/z.plate.capacity);}
 {const g=rodClearance(p,b);put('rod-clear',g.required/g.available);}
 put('frost',b.soil.frost/(f.soil+f.thickness));
 put('bar-spacing',f.spacing/Math.min(3*f.thickness,18*inch));
 const d=baseDrift(p,set.column);put('drift',d.total/d.limit);
 return {ratios,...(governing?anchorStates(governing.r):{tension:'steel' as const,shear:'steel' as const,dominant:'tension' as const}),edgeReduced:!!governing&&governing.r.hef<an.embedment-1e-6,tRequired,column:d.column/d.limit};
}

/** The same ratios from the full analysis (columnBaseAnalysis, columnBaseChecks): what the calculation reports. */
export function exactBaseSizingRatios(p:ProjectInput,set:BaseSizingSet=baseSizingSet(p)):BaseSizingRatios{
 const r=columnBaseAnalysis(p,set.reactions),ratios:Record<string,number>={};
 for(const c of columnBaseChecks(p,r,set.column))if(c.id.startsWith('base-')&&c.utilization!==undefined)ratios[c.id.slice(5)]=finite(c.utilization);
 const supports=r.supports??[r],governing=supports.reduce((x,y)=>finite(y.anchors.interaction)>finite(x.anchors.interaction)?y:x).anchors,d=baseDrift(p,set.column);
 return {ratios,...anchorStates(governing),edgeReduced:governing.hef<p.columnBase!.anchors.embedment-1e-6,tRequired:Math.max(...supports.map(v=>finite(v.plate.tRequired))),column:d.column/d.limit};
}

/**
 * The rail stays where it is: a thicker base plate lowers the seat, the column top and the crane-level bracing by as
 * much, and the column's effective and unbraced lengths keep their proportion to its height.
 */
function lowerColumn(p:ProjectInput,delta:number){
 const c=p.existingColumn!,k=(c.height-delta)/c.height;
 c.height-=delta;c.seatElevation-=delta;c.Lcx*=k;c.Lcy*=k;c.Lcz*=k;c.Lb*=k;
 const receiver=p.details?.bracket?.enabled?p.details.bracket.receiver:undefined;if(receiver)receiver.unbracedLength*=k;
 if(p.longitudinalBracing)p.longitudinalBracing.height-=delta;
}

/**
 * The project with its new column bases sized for the reactions. Every dimension grows from the entered one in
 * standard increments, the governing ratio first, until every ratio is at most `target` (the frost depth, bar spacing
 * and minimum reinforcement to their code limits), or after 400 steps:
 * - plate: the thickness straight to the required one in 1/8 in; N and B 1/2 in longer where the bearing block does
 *   not fit; the flange fillets 1/16 in larger, up to the column flange and plate thickness;
 * - anchor rods by the governing limit state: steel, the next diameter (3/4 to 2 in in 1/4 in steps, ASTM F1554
 *   Grade 36, then Grade 55); pullout, the next diameter (a larger nut); concrete breakout or pryout, 1 in more
 *   embedment (a larger footing where its edges cut hef); side-face blowout or shear breakout, a larger footing; then
 *   a third and a fourth rod per row; then a 1/2 in longer plate for the tension lever. The edge distance (1.5
 *   diameters, the washer on the plate), gauge (four diameters and a washer between rods), plate (washers clear of the
 *   flange welds, rods inside its width) and footing depth (the heads above the bottom bars) follow the rods, as
 *   validateColumnBase requires, and the rod rows stay clear of the flange fillets by the washer and its fillet and by
 *   the nut's socket clearance (rodClearance);
 * - fatigue under the crane duty bins (columnBaseFatigue): the rods' thread range by the next diameter, then more
 *   rods, then a longer plate; the flange fillet root by larger fillets, then a CJP flange joint; the plate at the
 *   fillet toe 1/8 in thicker;
 * - footing, square (L = B): 6 in larger for soil bearing, overturning, drift, bar development and the rods' edge
 *   distances; 2 in deeper for one-way and two-way shear and the frost depth; for sliding and the brace uplift,
 *   which only the dead load resists, deeper while its depth is less than half its projection past the plate, else
 *   larger; bottom bars each way 1 in closer (to 6 in), then the next bar size, for flexure and minimum steel, then
 *   deeper.
 * Nothing shrinks. The rail stays put: a thicker plate lowers the column (lowerColumn). The drift is left to the column
 * where the column alone takes more than columnDriftShare of the target, and the flange fillets where they reach the
 * column flange or plate thickness; a check that no step can improve stays as it is. The ratios come from the sizing
 * set (baseSizingRatios); once they are met, the full analysis's checks (exactBaseSizingRatios) confirm them and steer
 * any further step. The surveyed existing building beside the runway is not moved here.
 */
export function sizeColumnBase(p:ProjectInput,target=.9):ProjectInput{
 const q=structuredClone(p),col=q.existingColumn,b=q.columnBase;
 if(!col?.enabled||!col.isNew||!b?.enabled)return q;
 const {section}=existingColumnSection(q),reactions=supportReactions(q,sectionProperties(q.section)),pl=b.plate,a=b.anchors,ft=b.footing;
 // Footing: square, never smaller than the plate; deep enough for the rod heads above both bar layers.
 const fitFooting=()=>{
  ft.L=ft.B=Math.max(ft.L,ft.B);
  while(ft.L<pl.N||ft.B<pl.B)ft.L=ft.B=next(ft.L,6*inch);
  while(a.embedment+ft.cover+2*barDiameter[ft.bar]>ft.thickness+1e-6)ft.thickness=next(ft.thickness,2*inch);
 };
 // Rods: the plate washer on the plate and clear of the flange welds, rods four diameters and a washer apart,
 // inside the plate width (validateColumnBase).
 const fit=()=>{
  const hw=anchorHardware(a.diameter);
  while(a.edge<1.5*a.diameter||a.edge<hw.washer/2)a.edge=next(a.edge,inch/4);
  while(a.perRow>2&&a.gauge/(a.perRow-1)<Math.max(4*a.diameter,hw.washer))a.gauge=next(a.gauge,inch/2);
  while(pl.B<section.bf||a.gauge>pl.B-2*a.edge+1e-6)pl.B=next(pl.B,inch/2);
  // The rod rows clear the flange fillets by the washer and its fillet, and by the nut's socket clearance (rodClearance).
  while(pl.N<section.d+2*a.edge+2*a.diameter||rodClearance(q,b).required>rodClearance(q,b).available+1e-6)pl.N=next(pl.N,inch/2);
  fitFooting();
 };
 const wider=()=>{const L=next(ft.L,6*inch);if(L>caps.footing+1e-6)return false;ft.L=ft.B=L;return true;};
 const deeper=()=>{const t=next(ft.thickness,2*inch);if(t>caps.depth+1e-6)return false;ft.thickness=t;return true;};
 // Dead load: a footing about twice as wide as deep past the plate.
 const heavier=()=>ft.thickness<(ft.L-pl.N)/4?deeper()||wider():wider()||deeper();
 const longer=()=>{const N=next(pl.N,inch/2);if(N>caps.plate+1e-6)return false;pl.N=N;return true;};
 const larger=()=>{const B=next(pl.B,inch/2);if(B>caps.plate+1e-6)return longer();pl.B=B;longer();return true;};
 const nextRod=()=>rodDiameters.find(v=>v>a.diameter+1e-6);
 const largerRod=()=>{const d=nextRod();if(d){a.diameter=d;return true;}if(a.grade==='F1554-36'){a.grade='F1554-55';return true;}return false;};
 const largerNut=()=>{const d=nextRod();if(!d)return false;a.diameter=d;return true;};
 const moreRods=()=>{if(a.perRow>=4)return false;a.perRow++;return true;};
 const embed=(edgeReduced:boolean)=>{
  if(edgeReduced)return wider();
  const hef=next(a.embedment,inch);if(hef>caps.embedment+1e-6||hef+ft.cover+2*barDiameter[ft.bar]>caps.depth+1e-6)return false;
  a.embedment=hef;return true;
 };
 const area=(bar:typeof ft.bar,spacing:number)=>(Math.floor((Math.min(ft.L,ft.B)-2*ft.cover)/spacing)+1)*barArea[bar];
 const moreSteel=()=>{
  const closer=previous(ft.spacing,inch);if(closer>=6*inch-1e-6){ft.spacing=closer;return true;}
  const i=barSizes.indexOf(ft.bar);if(i<0||i>=barSizes.length-1)return false;
  // The next bar at the widest whole-inch spacing that keeps the steel area.
  const bar=barSizes[i+1],As=area(ft.bar,ft.spacing);let k=Math.max(6,Math.floor(Math.min(3*ft.thickness,18*inch)/inch+1e-6));
  while(k>6&&area(bar,k*inch)<As)k--;
  ft.bar=bar;ft.spacing=k*inch;return true;
 };
 const grow=(key:string,s:BaseSizingRatios):boolean=>{
  switch(key){
   case 'plate':{const t=Math.max(next(pl.thickness,inch/8),up(s.tRequired/target,inch/8));if(!Number.isFinite(t))return longer();if(t>caps.thickness+1e-6)return false;pl.thickness=t;return true;}
   case 'bearing':return larger();
   // Fatigue: the rods by a larger diameter (more stress area), then more rods, then a longer plate (a longer lever);
   // the flange fillet root by larger fillets, then a CJP flange joint (as 'weld'); the plate thicker. The column
   // flange toe is the column's.
   case 'anchor-fatigue':{const d=nextRod();if(d){a.diameter=d;return true;}return moreRods()||longer();}
   case 'plate-fatigue':{const t=next(pl.thickness,inch/8);if(t>caps.thickness+1e-6)return false;pl.thickness=t;return true;}
   case 'weld-fatigue-root':{if(pl.flangeJoint==='cjp')return false;const w=next(pl.weld,inch/16);if(w>Math.min(section.tf,pl.thickness)+1e-6){pl.flangeJoint='cjp';return true;}pl.weld=w;return true;}
   // Fillets up to the flange and plate thickness, then CJP flanges (the web keeps its fillets).
   case 'weld':{if(pl.flangeJoint==='cjp')return false;const w=Math.max(next(pl.weld,inch/16),up(pl.weld*s.ratios.weld/target,inch/16));
    if(w>Math.min(section.tf,pl.thickness)+1e-6){pl.flangeJoint='cjp';return true;}pl.weld=w;return true;}
   case 'anchor-tension':case 'anchor-shear':case 'anchor-interaction':case 'washer-weld':{
    if(key==='washer-weld')return largerRod()||moreRods();
    const shear=key==='anchor-shear'||(key==='anchor-interaction'&&s.dominant==='shear');
    if(shear)return s.shear==='steel'?largerRod()||moreRods():s.shear==='pryout'?embed(s.edgeReduced)||moreRods():wider();
    return (s.tension==='steel'?largerRod():s.tension==='pullout'?largerNut():s.tension==='blowout'?wider():embed(s.edgeReduced))||moreRods()||longer();
   }
   case 'soil':case 'overturning':case 'development':case 'drift':return key==='drift'&&s.column>columnDriftShare*target?false:wider();
   case 'sliding':case 'uplift':return heavier();
   case 'frost':case 'one-way':case 'two-way':return deeper();
   case 'flexure':case 'min-steel':return moreSteel()||deeper();
   case 'bar-spacing':{const max=Math.floor(Math.min(3*ft.thickness,18*inch)/inch+1e-6)*inch;if(ft.spacing<=max)return false;ft.spacing=max;return true;}
  }
  return false;
 };
 fit();
 let set=baseSizingSet(q,reactions),exact=false;
 const stuck=new Set<string>();
 for(let i=0;i<400;i++){
  const s=exact?exactBaseSizingRatios(q,set):baseSizingRatios(q,set);
  const open=Object.entries(s.ratios).filter(([k,v])=>!stuck.has(k)&&!(v<=(codeLimits.has(k)?1:target))).sort((x,y)=>y[1]-x[1]);
  if(!open.length){if(exact)break;exact=true;continue;}
  // A bearing block that does not fit the plate leaves the plate thickness and the rod tension unbounded.
  const key=s.ratios.bearing>1&&!stuck.has('bearing')?'bearing':open[0][0],t=pl.thickness;
  if(!grow(key,s))stuck.add(key);
  fit();
  if(pl.thickness!==t){lowerColumn(q,pl.thickness-t);set=baseSizingSet(q,reactions);}
 }
 return q;
}

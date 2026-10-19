/**
 * Template sizing of the column cap for the project's support reactions, in the pattern of the bracket sizing
 * (sizeWeldedBracket, sizeRolledBracket): a sizing set of girder end force sets at every grid, and every ratio from the
 * cap's own collector and checks (createColumnCapCollector, columnCapChecks), exactly as the full analysis reports it;
 * the full analysis then checks every concurrent case.
 *
 * Sizing set (supportReactions, strength factors 1.2/1.6 LRFD, 1.0 ASD), at every grid and each of its girder
 * bearings alone: the support's whole factored reaction on that bearing with the side thrust at the rail head as fork
 * forces of the girder end (statics of the girder end on the cap with the torque about the shear center amplified for
 * second-order twist at strength, B = 1/(1 - alpha/lambda): the top-flange force T = H[(h_sc - a_b) + B(h_r - h_sc)]/(a_t - a_b) and
 * the bottom-flange force H - T through the bearing bolts, both senses), and the factored longitudinal force; the crane
 * stop force with 1.2(D + C_d) + C_v; any uplift 0.9D + 1.6C_min with the side thrust; per duty bin the crane reaction
 * without impact, its own weight plus the bin's lifted fraction, with half the side thrust. The Appendix 6 brace force
 * and stiffness of the fork come from the girder's moving-load moment (braceImperfection).
 *
 * Growth on the governing ratio: the cap plate one plate step; the all-around cap fillets 1/16 in (to 5/8 in and
 * t - 1/16 in of the thinner part; past 5/8 in, to 1 in, only once the cap weld ratio exceeds 1: heavyCapFillet; then CJP
 * groove welds with reinforcing fillets where no such fillet passes); the bearing bolts one diameter up (3/4 in to 1 1/4 in) or A490, or a wider gauge,
 * whichever lowers the bolt tension or slip ratio most per pound; the bolt edge distance 1/8 in for the nut clearance at
 * the column web; the cap stiffeners thicker, deeper or with larger fillets. After each step the cap plate covers the
 * column, the bearings and the bolt edges, the fillets meet their J2.4 minimum, the end bearing edge distances follow
 * the bolt, the bearing plate lengthens for the larger bolt's nut and washer clearance to the stiffener, and a step that leaves the cap invalid or an end-bearing edge, slot, sleeve or nut clearance unmet is not
 * taken. The bearing bolt count is the end bearing's four per girder end. Canonical units N, mm.
 */
import type {ProjectInput,CheckResult} from './types';
import type {ColumnCapInput} from './columnCapInputs';
import type {SupportForceSet} from './bracketForces';
import {activeColumnCap} from './columnCapInputs';
import {columnCapGeometry,createColumnCapCollector,columnCapChecks,validateColumnCap,capColumn,capBoltSets} from './columnCap';
import {available} from './aiscStrength';
import {supportReactions,supportStations} from './supportReactions';
import {sectionProperties} from './section';
import {movingAnalysis} from './analysis';
import {braceImperfection} from './forcesDelivered';
import {railTopAboveSteel} from './railSeat';
import {flexureCurves} from './loadHeightFlexure';
import {cappedMechanics} from './cappedMechanics';
import {filletMinimum,boltProperties} from './connectionStrength';
import {activeEndBearing,slidingBolts,type EndBearingInput} from './endBearingInputs';
import {endBearingChecks,endBearingGeometry,slotEndDistance} from './endBearing';
import {plateSteps} from './bracketSizing';
import {wrenchClearance} from './endStop';
import {slidingClearance} from './fitTolerances';
import type {DesignAnalysis} from './types';

const inch=25.4,eighth=inch/8,sixteenth=inch/16,up=(v:number,step:number)=>Math.ceil(v/step-1e-9)*step;
const nextPlate=(t:number)=>plateSteps.find(v=>v>t+1e-6);
const boltSizes=[.75,.875,1,1.125,1.25].map(v=>v*inch);
/** Largest fillet the sizing grows to: 5/8 in, a few passes; and t - 1/16 in of the thinner part. */
const maxFillet=(...t:number[])=>Math.min(5/8*inch,Math.min(...t)-sixteenth);
/**
 * Largest multi-pass cap fillet, taken only where a 5/8 in fillet would fail its check (the cap weld fatigue of heavy
 * cranes: Category F on the throat, the range falling as 1/w): 1 in, and t - 1/16 in of the thinner part (AISC 360-16
 * J2.2b maximum size along an edge, applied to the column flange). The checks print the size.
 */
export const heavyCapFillet=(...t:number[])=>Math.min(inch,Math.min(...t)-sixteenth);

export interface CapSizingSet {
 strength:{x:number;f:SupportForceSet}[];fatigue:{x:number;bin:number;f:SupportForceSet}[];
 /** Appendix 6 brace force and required stiffness at the girder end (braceImperfection of the moving-load moment). */
 ctx:{imperfection:number;required:number};
 /** Fork model of the strength sets: the second-order amplification B of the torque about the shear center (above the cap top). */
 fork?:{amplification:number;shearCenter:number;lambda:number};
}
/** The sizing set of the column cap (see the file header). */
export function capSizingSet(p:ProjectInput):CapSizingSet{
 const d=p.details!,props=sectionProperties(p.section),r=supportReactions(p,props),lrfd=p.method==='LRFD',g=columnCapGeometry(p),stations=supportStations(p);
 const railTop=d.bearing.thickness+p.section.d+railTopAboveSteel(p),{top:at,bottom:ab}=g.arms;
 // Second-order torsion: the analysis amplifies the girder twist by 1/(1 - alpha/lambda) (AISC C2.3 / Appendix 1 at alpha,
 // 0.8 stiffness). lambda is estimated from the uniform-moment elastic moment at Lb (F2-4 / F4-5) times the Commentary F1
 // load-height factor 1.4^(2y/h) (rail head, y from mid-depth), no moment-gradient credit, at 0.8, over the girder's
 // factored moving-load moment; the torque about the shear center is amplified, the lateral shear through it is not.
 const a=movingAnalysis(p,props,8),Mu=(lrfd?1.2:1)*a.deadMoment+(lrfd?1.6:1)*(a.demand.moment-a.deadMoment);
 const depth=p.section.d+(p.section.kind==='cap'?p.section.capTw:0),yLoad=-(railTopAboveSteel(p)+depth/2);
 const lambda=Mu>0?.8*flexureCurves(p,props).positive.mocr*1.4**(2*yLoad/depth)/Mu:Infinity,alpha=lrfd?1:1.6;
 const amplify=lambda>1.25*alpha?1/(1-alpha/lambda):5;
 const sc=d.bearing.thickness+(cappedMechanics(p.section)?.shearCenter??p.section.d/2);
 // Fork forces of a rail-head force H at a girder end on the cap: T at the top flange, H - T at the bottom flange, from the
 // moment about the bottom flange of H through the shear center and the amplified torque H(h_r - h_sc).
 const fork=(H:number,B=amplify)=>{const T=H*((sc-ab)+B*(railTop-sc))/(at-ab);return {top:T,bottom:H-T};};
 const F=(lrfd?1.6:1)*r.Cls,stop=Math.max(0,...p.cranes.map(c=>c.design&&!c.design.bumperBypassesGirder?c.design.bumperForce:0))*(lrfd?1:.67);
 const fatigueMax=Math.max(0,...r.supports.map(s=>s.Cd+s.Cv)),deadMax=Math.max(0,...r.supports.map(s=>s.Cd));
 const bins=d.spectrum.map((v,bin)=>({bin,scale:fatigueMax>0?(deadMax+v.liftFraction*(fatigueMax-deadMax))/fatigueMax:0}));
 const set:CapSizingSet={strength:[],fatigue:[],ctx:{imperfection:0,required:0},fork:{amplification:amplify,shearCenter:sc,lambda}};let n=0;
 r.supports.forEach((s,j)=>{
  const x=stations[j],D=s.D,crane=s.Cd+s.Cv+s.Ci,R=(lrfd?1.2:1)*D+(lrfd?1.6:1)*crane,H=(lrfd?1.6:1)*s.Css,Rstop=(lrfd?1.2:1)*(D+s.Cd)+s.Cv;
  const lift=(lrfd?.9:.6)*D+(lrfd?1.6:1)*Math.min(0,s.craneMinimum);
  for(const b of g.grids[j]?.bearings??[]){
   const on=(V:number,h:{top:number;bottom:number},longitudinal:number,id:string):SupportForceSet=>({id:`sizing-${n++}-${id}`,combination:`sizing ${id}`,vertical:V,moment:V*b.reaction,longitudinal,top:h.top,bottom:h.bottom,
    ends:b.bay!==undefined&&b.end?[{bay:b.bay,end:b.end,vertical:V,offset:b.reaction}]:[]});
   for(const sense of [1,-1]){const h=fork(sense*H);set.strength.push({x,f:on(R,h,F,'strength')});if(lift<0)set.strength.push({x,f:on(lift,h,0,'uplift')});}
   if(stop>0)set.strength.push({x,f:on(Rstop,{top:0,bottom:0},stop,'stop')});
   for(const v of bins)for(const sense of [1,-1])set.fatigue.push({x,bin:v.bin,f:on((s.Cd+s.Cv)*v.scale,fork(sense*.5*s.Css*v.scale,1),0,'fatigue')});
  }
 });
 // The Appendix 6 point-brace force and stiffness from the girder's factored moving-load moment and longitudinal force.
 const Pu=Math.max(F,stop);
 const A6=braceImperfection(p,{moment:Mu,axial:Pu},props);set.ctx={imperfection:A6.force,required:A6.stiffness};
 return set;
}
/** Checks of the cap the sizing does not drive: the column's own stub, the J2.4 minimums it sets, the girder flange. */
const notSized=/^column-cap-(column-stub|column-stub-shear|weld-minimum|stiffener-weld-minimum|weld-base|flange-prying|bolt-edge)$/;
/** The column cap checks under the sizing set, keyed by check id without the 'column-cap-' prefix. */
export function columnCapSizingRatios(p:ProjectInput,set=capSizingSet(p)){
 const c=createColumnCapCollector(p),ratios:Record<string,number>={};
 if(!c)return ratios;
 for(const v of set.strength)c.observe('strength',v.x,v.f);
 for(const v of set.fatigue)c.observe('fatigue',v.x,v.f,v.bin);
 const r=c.finish();
 for(const k of columnCapChecks(p,r,set.ctx))if(k.utilization!==undefined&&(k.status==='pass'||k.status==='fail')&&!notSized.test(k.id))ratios[k.id.replace(/^column-cap-/,'')]=k.utilization;
 // A bolt tension at or above the slip limit leaves no slip resistance (k_sc = 0): the ratio then measures that tension
 // against the limit, so that a larger, stronger or wider-spaced bolt still registers as progress.
 const bolts=capBoltSets(p,r,set.ctx.imperfection),gone=bolts.filter(v=>!(v.c.slip>0));
 if(gone.length)ratios['bolt-slip']=1e3*Math.max(...gone.map(v=>(p.method==='LRFD'?1:1.5)*v.T/(1.13*v.c.pretension)));
 return ratios;
}
/** Steel weight of the cap plate and its stiffeners, N, with a pound for every bolt and fillet step (for comparing steps). */
export function columnCapWeight(p:ProjectInput,cap:ColumnCapInput,e?:EndBearingInput){
 const g=columnCapGeometry({...p,columnCap:cap}),gamma=p.section.density*9.80665/1e9,stiffeners=g.grids.reduce((a,v)=>a+v.stiffeners.length,0);
 const bolts=e?(boltSizes.findIndex(v=>Math.abs(v-e.bolts.diameter)<1e-6)+(e.bolts.grade==='A490'?2:0))*4.448:0;
 return gamma*(cap.plate.length*cap.plate.width*cap.plate.thickness+stiffeners*cap.stiffener.thickness*cap.stiffener.height*g.clear)+bolts+(cap.weld+cap.stiffener.weld)/sixteenth*4.448;
}
/** End bearing checks that the bolts, edges and plates set alone (edges, slots, sleeves, washers, nut clearances): none may fail. */
function endBearingFit(p:ProjectInput,e:EndBearingInput){
 const none={axial:0,uplift:0,endRotation:0} as unknown as DesignAnalysis;
 try{return endBearingChecks(p,e,{analysis:none,lateral:0}).filter((c:CheckResult)=>c.id!=='end-bearing-travel').every(c=>c.status!=='fail');}catch{return false;}
}

type Move=(v:{cap:ColumnCapInput;e:EndBearingInput})=>boolean;
/**
 * The project with its column cap sized for the reactions (see the file header): the cap plate, cap fillets, cap
 * stiffeners and the bearing bolts (diameter, grade, gauge, edge distance). Ratios no step lowers are set aside and
 * reported by the checks; stops when every ratio is at most `target` or after 200 steps. Without an active column cap
 * and bolted end bearings the project is returned unchanged; a sized cap that fails validation is not used.
 */
export function sizeColumnCap(p:ProjectInput,target=.9,options:{trace?:(step:number,key:string,ratio:number,next?:ColumnCapInput)=>void}={}):ProjectInput{
 const q=structuredClone(p),cap0=activeColumnCap(q),e0=activeEndBearing(q);
 if(!cap0||!e0)return q;
 const col=capColumn(q),bs=q.details!.bearing,length0=bs.length;
 const apply=(v:{cap:ColumnCapInput;e:EndBearingInput})=>{q.columnCap=v.cap;q.details!.endBearing=v.e;};
 /** Dependent sizes: the plate covers the column, the bearings and the bolt edges; J2.4 minimum fillets; the end bearing edge for the bolt. */
 const settle=(v:{cap:ColumnCapInput;e:EndBearingInput})=>{
  const c=v.cap,b=v.e.bolts;apply(v);
  // Sliding-end sleeves that take 1.5 times the larger bolt's pretension (end-bearing-sleeve), in 1/16 in walls.
  try{
   if(slidingBolts(v.e).mode==='sleeved'){const bp=boltProperties(b.grade,b.diameter),Fy=q.details!.material.Fy;let w=slidingBolts(v.e).wall;
    while(Math.PI/4*((bp.hole+2*w)**2-bp.hole**2)*Fy<1.5*bp.pretension&&w<inch)w+=sixteenth;if(w>slidingBolts(v.e).wall+1e-9)v.e.sleeveWall=w;}
  }catch{return false;}
  // The girder end and bearing plate edge distances for the bolt and its slot (end-bearing-end-edge, -plate-edge).
  try{const h=endBearingGeometry(q,v.e);b.edge=Math.max(b.edge,up(slotEndDistance(b.diameter,h.hole,h.slot).required,eighth));}catch{return false;}
  // The bearing plate long enough for the bolt rows at its ends to clear the stiffener pair at mid-bearing with the nut
  // (C1) and the plate washer at either extreme of travel (end-bearing-wrench-stiffener, -washer-stiffener), as
  // bearingLayout lays it out: a larger bolt has a larger edge, wrench clearance and washer. Never shorter than laid out.
  try{const h=endBearingGeometry(q,v.e),toStiffener=Math.max(wrenchClearance(b.diameter),h.washer.length/2+h.travel+slidingClearance)+bs.stiffenerThickness/2+bs.weldSize;
   bs.length=Math.max(length0,up(2*(b.edge+toStiffener),inch/4));if(q.aist)q.aist.bearingLength=bs.length;}catch{return false;}
  c.weld=Math.max(c.weld,filletMinimum([c.plate.thickness,col.tf]));
  c.stiffener.weld=Math.max(c.stiffener.weld,filletMinimum([c.stiffener.thickness,col.tf]));
  const g=columnCapGeometry(q);
  c.stiffener.height=Math.max(c.stiffener.height,up(4*c.stiffener.weld+g.clip,inch/2));
  const reach=Math.max(...g.bearings.map(v=>Math.max(Math.abs(v.x0),Math.abs(v.x1)))),xb=Math.max(...g.grids.flatMap(v=>v.bolts.map(o=>Math.abs(o.x))));
  c.plate.width=Math.max(c.plate.width,up(Math.max(col.d+2*(c.weld+eighth),bs.width,b.gauge+3*b.diameter),inch/2));
  c.plate.length=Math.max(c.plate.length,up(Math.max(col.bf,2*(reach+inch/2),2*(xb+1.5*b.diameter)),inch/2));
  apply(v);
  return validateColumnCap(q).length===0&&endBearingFit(q,v.e);
 };
 const start={cap:structuredClone(cap0),e:structuredClone(e0)};
 if(!settle(start))return p;
 const set=capSizingSet(q);
 const ratios=(v:{cap:ColumnCapInput;e:EndBearingInput})=>{apply(v);return columnCapSizingRatios(q,set);};
 const weight=(v:{cap:ColumnCapInput;e:EndBearingInput})=>{apply(v);return columnCapWeight(q,v.cap,v.e);};
 const step=(from:{cap:ColumnCapInput;e:EndBearingInput},move:Move)=>{const v=structuredClone(from);if(!move(v))return undefined;return settle(v)&&JSON.stringify(v)!==JSON.stringify(from)?v:undefined;};
 const plate:Move=v=>{const t=nextPlate(v.cap.plate.thickness);if(!t)return false;v.cap.plate.thickness=t;return true;};
 const weld:Move=v=>{const w=v.cap.weld+sixteenth;if(v.cap.joint==='cjp'||w>maxFillet(v.cap.plate.thickness,col.tf)+1e-6)return false;v.cap.weld=w;return true;};
 // Past 5/8 in only once the governing cap weld ratio exceeds 1 at the 5/8 in limit (it would fail there), then in 1/16 in
 // steps to the sizing target.
 let governing=0,heavy=false;
 const heavyWeld:Move=v=>{heavy||=governing>1+1e-9;const w=v.cap.weld+sixteenth;if(!heavy||v.cap.joint==='cjp'||w>heavyCapFillet(v.cap.plate.thickness,col.tf)+1e-6)return false;v.cap.weld=w;return true;};
 // Where no fillet the sizing takes passes (the nut clearance at the web or the 1 in limit stops it): CJP groove welds of
 // the column flanges and web with the reinforcing fillet, t/4 of the flange and at most 3/8 in, never under the J2.4 minimum.
 const cjp:Move=v=>{if(!heavy||v.cap.joint==='cjp')return false;v.cap.joint='cjp';v.cap.weld=up(Math.max(filletMinimum([v.cap.plate.thickness,col.tf]),Math.min(col.tf/4,3/8*inch)),sixteenth);return true;};
 const bolt:Move=v=>{const i=boltSizes.findIndex(x=>x>v.e.bolts.diameter+1e-6);if(i<0)return false;v.e.bolts.diameter=boltSizes[i];return true;};
 const grade:Move=v=>{if(v.e.bolts.grade==='A490')return false;v.e.bolts.grade='A490';return true;};
 const gauge:Move=v=>{v.e.bolts.gauge+=inch/2;return true;};
 const edge:Move=v=>{v.e.bolts.edge+=eighth;return true;};
 const stiffThicker:Move=v=>{const t=nextPlate(v.cap.stiffener.thickness);if(!t)return false;v.cap.stiffener.thickness=t;return true;};
 const stiffDeeper:Move=v=>{v.cap.stiffener.height+=inch;return true;};
 const stiffWeld:Move=v=>{const w=v.cap.stiffener.weld+sixteenth;if(w>maxFillet(v.cap.stiffener.thickness,col.tf)+1e-6)return false;v.cap.stiffener.weld=w;return true;};
 const bolts:Move[]=[bolt,grade,gauge];
 const moves:Record<string,(Move|Move[])[]>={
  'plate':[plate],'plate-shear':[plate],'web-yield':[plate],'web-cripple':[plate],'prying':[plate],'fork-stiffness':[[plate,bolt]],'bolt-bearing':[plate,bolt],
  'weld':[weld,plate,heavyWeld,cjp],'weld-fatigue':[weld,plate,heavyWeld,cjp],
  'bolt-tension':[bolts],'bolt-slip':[bolts],
  'wrench-web':[edge],'wrench-flange':[],'wrench-stiffener':[edge],
  'stiffener-bearing':[stiffThicker],'stiffener-slenderness':[stiffThicker],'stiffener-shear':[[stiffThicker,stiffDeeper]],'stiffener-flange':[stiffDeeper],
  'stiffener-weld':[stiffWeld,stiffDeeper],'stiffener-weld-fatigue':[stiffWeld,stiffDeeper]};
 let v=start,r=ratios(v);const stuck=new Set<string>();
 const worst=(x:Record<string,number>)=>Object.entries(x).filter(([k])=>!stuck.has(k)).sort((a,b)=>b[1]-a[1])[0]??['',0];
 for(let i=0;i<200;i++){
  const [key,value]=worst(r);if(value<=target)break;
  governing=value;
  let next:typeof v|undefined;
  for(const m of moves[key]??[]){
   const list=Array.isArray(m)?m:[m];
   // The candidate that lowers the governing ratio most per pound added (a bolt or fillet step counts as one pound).
   let best:{v:typeof v;score:number;r:Record<string,number>}|undefined;
   // A step must lower the governing ratio without raising another one (of those still growing) above it.
   for(const move of list){const s=step(v,move);if(!s)continue;const rs=ratios(s),drop=value-(rs[key]??0),cost=Math.max(weight(s)-weight(v),4.448);
    const others=Math.max(0,...Object.entries(rs).filter(([k])=>k!==key&&!stuck.has(k)).map(([,x])=>x));
    // Nut clearances have no step of their own: a step that leaves a nut without its clearance is not taken.
    const clears=Object.entries(rs).every(([k,x])=>!/^wrench-/.test(k)||x<=Math.max(1,r[k]??0)+1e-9);
    if(drop>1e-9&&others<value-1e-9&&clears&&(!best||drop/cost>best.score))best={v:s,score:drop/cost,r:rs};}
   if(best){next=best.v;r=best.r;break;}
  }
  options.trace?.(i,key,value,next?.cap);
  if(!next){stuck.add(key);continue;}
  v=next;
 }
 // Settled again: the bearing length follows the chosen bolts, not the last step tried.
 settle(v);
 // The plate washers over the sliding-end slots carry the bolt tension of the fork couple (end-bearing-washer-bending:
 // f_b = 6(T/2)a/(bt^2), a = w_slot/2 - 0.8d_b): thickened in 1/16 in steps for the largest tension of the sizing set.
 {const c=createColumnCapCollector(q);if(c){for(const x of set.strength)c.observe('strength',x.x,x.f);
  const T=Math.max(0,...capBoltSets(q,c.finish(),set.ctx.imperfection).map(x=>x.T)),h=endBearingGeometry(q,v.e),a=Math.max(0,h.slotWidth/2-.8*v.e.bolts.diameter);
  const need=Math.sqrt(6*(T/2)*a/(h.washer.length*available(q.details!.material.Fy,q.method,.9,1.67)));
  if(h.sleeved&&need>v.e.washerThickness+1e-9){v.e.washerThickness=up(need,sixteenth);apply(v);}}}
 if(validateColumnCap(q).length){q.columnCap=cap0;q.details!.endBearing=e0;bs.length=length0;if(q.aist)q.aist.bearingLength=length0;}
 return q;
}

import type {CalculationSnapshot,ProjectInput} from './types';
import type {RunwayCaseEvent} from './designAnalysis';
import type {LateralTorsionResult} from './lateralTorsion';
import {sectionProperties} from './section';
import {movingAnalysis} from './analysis';
import {craneSideThrust} from './flangeTieSizing';
import {craneDesignMinimum} from './aistLoads';
import {defaultSplices,spliceLayout,validateSplices,type SpliceInput} from './spliceInputs';
import {createSpliceCollector,spliceChecks} from './girderSplice';
import {practicalPieceLength} from './girderPieces';

const inch=25.4,up=(v:number,step:number)=>Math.ceil(v/step-1e-9)*step;

/** Factored actions estimated at a splice joint for sizing (the full analysis then checks the splice). */
export interface SpliceDemandEstimate {station:number;momentMax:number;momentMin:number;shear:number;axial:number;topLateral:number;bottomLateral:number;topShear:number}

/**
 * Splice actions for sizing, from the moving-load search of the configurator (movingAnalysis): at each joint the
 * largest positive and negative moment and shear within the splice plates' reach, the crane load factor 1.6 (LRFD) on
 * the whole envelope (dead load included, conservatively), and the top flange lateral moment as the side thrust moment
 * of the weak-axis model carried by the top flange alone (DG7), raised by a quarter for warping from the rail
 * eccentricity; the bottom flange takes a tenth of it. The axial force is the factored crane traction (at least the AIST
 * minimum) or the bumper force, the larger.
 */
export function spliceDemandEstimate(p:ProjectInput,stations:number[],reach:number):SpliceDemandEstimate[]{
 const props=sectionProperties(p.section),a=movingAnalysis(p,props,8),lrfd=p.method==='LRFD',factor=lrfd?1.6:1;
 const wheelThrust=Math.max(...p.cranes.map(c=>c.wheels.reduce((s,w)=>s+Math.abs(w.lateral),0))),thrust=wheelThrust>0?Math.max(1,craneSideThrust(p)/wheelThrust):1;
 // The factored longitudinal force: traction (at least the AIST minimum) or the bumper force where the stop bears on the girder.
 const axial=Math.max(0,...p.cranes.map(c=>Math.max(factor*Math.max(c.longitudinal,craneDesignMinimum(c).traction),c.design&&!c.design.bumperBypassesGirder?c.design.bumperForce:0)));
 return stations.map(x=>{
  const rows=a.envelope.filter(v=>Math.abs(v.x-x)<=reach+1e-6),near=rows.length?rows:[a.envelope.reduce((b,v)=>Math.abs(v.x-x)<Math.abs(b.x-x)?v:b)];
  const lateral=factor*thrust*Math.max(...near.map(v=>Math.max(Math.abs(v.lateralMax),Math.abs(v.lateralMin))))*1.25;
  return {station:x,momentMax:factor*Math.max(0,...near.map(v=>v.momentMax)),momentMin:factor*Math.min(0,...near.map(v=>v.momentMin)),shear:factor*Math.max(...near.map(v=>Math.max(Math.abs(v.shearMax),Math.abs(v.shearMin)))),
   axial,topLateral:lateral,bottomLateral:.1*lateral,topShear:factor*thrust*wheelThrust/2};
 });
}

/** The splice checks under the estimated actions, through the analysis collector and the check functions themselves. */
export function spliceSizingChecks(p:ProjectInput,estimate:SpliceDemandEstimate[]){
 const props=sectionProperties(p.section),c=createSpliceCollector(p,props);
 if(!c)return [];
 const E=p.section.E,k=.8,If=props.Iy/2,h0=props.h0;
 for(const v of estimate)for(const [i,M] of [v.momentMax,v.momentMin].entries()){
  // A state at the joint: the shear V from a reaction at the girder start, the moment M, the lateral flange moments
  // from a lateral curvature and a warping curvature, the flange lateral shear from the third derivative.
  const e:RunwayCaseEvent={kind:'strength',id:`S${i}`,combination:'sizing estimate',cranes:[],horizontalCrane:-1,lateralSign:1,wheels:[],q:0,railTorquePerLength:0,axial:v.axial,verticalReactions:[{x:0,r:v.shear}]};
  const curvature=(v.topLateral+v.bottomLateral)/(2*E*k*If),warping=(v.topLateral-v.bottomLateral)/(2*E*k*If)/(h0/2),third=v.topShear/(E*k*If);
  const at=()=>({x:0,v:0,slope:0,twist:0,twistRate:0,curvature,warpingCurvature:warping,warpingThird:0,lateralThird:third});
  c.observe(e,-1,{at,stations:[],restraints:[],fixedReactions:[],residual:0} as unknown as LateralTorsionResult,0,p.spans.reduce((a,b)=>a+b,0),()=>M);
 }
 const splices=c.finish();
 return spliceChecks({input:p,properties:props,detailResults:{splices},checks:[]} as unknown as CalculationSnapshot).filter(v=>v.status!=='not-applicable');
}

export interface SplicesDesigned {splices:SpliceInput;stations:number[];
 /** Each joint from its nearest interior support, in feet and as a fraction of the span: "SP1 5.42 ft (0.217 L) past grid 3". */
 where:string;governing:{id:string;title:string;utilization:number};estimate:SpliceDemandEstimate[];why:string}
/**
 * Bolted slip-critical field splices for a continuous girder longer than a practical piece (practicalPieceLength):
 * placed automatically in the inflection region 0.20 to 0.25 of the span from interior supports (spliceLayout), and
 * sized for the larger of the estimated factored actions at the joints and 50% of the flange strength (the design
 * basis): starting from the template proportions (defaultSplices) for 1, 1 1/8 and 1 1/4 in A490 bolts in turn, the
 * flange bolt rows, web bolt columns and plate thicknesses grow until every splice check passes for the estimated actions
 * raised by 1/`target` (the margin the full analysis may find above the estimate) and the basis minimum. Undefined when the girder needs no splice or none can be built here (the
 * open item girder-piece-basis then stands).
 */
export function designSplices(p:ProjectInput,target=.85):SplicesDesigned|undefined{
 const L=p.spans.reduce((a,b)=>a+b,0);
 if(p.system!=='continuous'||!p.details||p.section.kind==='cap'||!p.section.catalogueId||L<=practicalPieceLength+1e-6)return undefined;
 let estimate:SpliceDemandEstimate[]|undefined;
 for(const db of [1,1.125,1.25].map(v=>v*inch)){
  const sp=defaultSplices(p,p.details.rail,db);
  const q={...p,details:{...p.details,splices:sp}};
  for(let step=0;step<40;step++){
   const errors=validateSplices(q),layout=spliceLayout(q);
   if(layout.errors.length||!layout.stations.length)break;
   // Geometry the sizing cannot fix by adding bolts or thickness: try the next bolt size.
   if(errors.length)break;
   estimate??=spliceDemandEstimate(q,layout.stations,layout.geometry!.half);
   if(estimate.length!==layout.stations.length||estimate.some((v,i)=>Math.abs(v.station-layout.stations[i])>1))estimate=spliceDemandEstimate(q,layout.stations,layout.geometry!.half);
   // The estimate raised by 1/target: the margin the full analysis may find above it. The basis minimum is exact.
   const raised=estimate.map(v=>({...v,momentMax:v.momentMax/target,momentMin:v.momentMin/target,shear:v.shear/target,axial:v.axial/target,topLateral:v.topLateral/target,bottomLateral:v.bottomLateral/target,topShear:v.topShear/target}));
   const checks=spliceSizingChecks(q,raised),over=checks.filter(c=>c.status==='fail');
   if(!over.length){
    const g=checks.filter(c=>c.quantity!=='length').reduce((a,c)=>(c.utilization??0)>(a.utilization??0)?c:a);
    const inches=(v:number)=>`${+(v/inch).toFixed(3)} in`;
    const grids=p.spans.reduce((a,v)=>[...a,a.at(-1)!+v],[0]),where=layout.stations.map((x,i)=>{const j=grids.reduce((b,v,k)=>Math.abs(v-x)<Math.abs(grids[b]-x)?k:b,0),span=x<grids[j]?p.spans[j-1]:p.spans[j],t=Math.abs(x-grids[j]);return `SP${i+1} ${+(t/304.8).toFixed(2)} ft (${(t/span).toFixed(3)} L) ${x<grids[j]?'before':'past'} grid ${j+1}`;}).join(', ');
    return {splices:sp,stations:layout.stations,where,governing:{id:g.id,title:g.title,utilization:g.utilization??0},estimate,
     why:`${sp.grade} ${inches(db)} slip-critical bolts (Class ${sp.surface}): top flange ${2*sp.top.rows*sp.top.lines} bolts each side on two inner plates ${inches(sp.top.innerThickness)} thick, bottom flange ${2*sp.bottom.rows*sp.bottom.lines} on an outer plate ${inches(sp.bottom.outerThickness)} and two inner plates ${inches(sp.bottom.innerThickness)}, web ${sp.web.rows*sp.web.columns} on two plates ${inches(sp.web.thickness)}; sized for the larger of the estimated factored actions at the joints (raised by 1/${target}) and 50% of the flange strength (governing: ${g.title}, ${(g.utilization??0).toFixed(2)})`};
   }
   // Grow the part each failing check names, once per step.
   const ids=new Set(over.map(c=>c.id)),has=(re:RegExp)=>[...ids].some(id=>re.test(id));
   let grew=false;
   const grow=(f:()=>boolean)=>{if(f())grew=true;};
   // Bearing and tearout (J3.10): first the clear distances that develop full bearing (l_c = 2d at the girder and
   // plate ends and between holes), then more bolts.
   const hole=db+(db<inch-1e-6?inch/16:inch/8),eFull=up(2*db+hole/2,inch/8),sFull=up(2*db+hole,inch/4);
   const clearDistances=(f:{endDistance:number;pitch:number;rows:number})=>{let c=false;if(f.endDistance<eFull-1e-6){f.endDistance=eFull;c=true;}if(f.rows>1&&f.pitch<sFull-1e-6){f.pitch=sFull;c=true;}if(sp.edge<eFull-1e-6){sp.edge=eFull;c=true;}return c;};
   const webClear=()=>{let c=false;if(sp.web.endDistance<eFull-1e-6){sp.web.endDistance=eFull;c=true;}if(sp.web.columns>1&&sp.web.spacing<sFull-1e-6){sp.web.spacing=sFull;c=true;}if(sp.edge<eFull-1e-6){sp.edge=eFull;c=true;}return c;};
   if(has(/^splice-top-bearing$/))grow(()=>clearDistances(sp.top)||(sp.top.rows<6?(sp.top.rows++,true):false));
   else if(has(/^splice-top-(slip|bolt-shear)$/))grow(()=>sp.top.rows<6?(sp.top.rows++,true):false);
   if(has(/^splice-top-(plate|block)/))grow(()=>sp.top.innerThickness<2*inch?(sp.top.innerThickness+=inch/8,true):false);
   if(has(/^splice-bottom-bearing$/))grow(()=>clearDistances(sp.bottom)||(sp.bottom.rows<8?(sp.bottom.rows++,true):false));
   else if(has(/^splice-bottom-(slip|bolt-shear)$/))grow(()=>sp.bottom.rows<8?(sp.bottom.rows++,true):false);
   if(has(/^splice-bottom-(plate|block)/))grow(()=>sp.bottom.outerThickness<2*inch?(sp.bottom.outerThickness+=inch/8,sp.bottom.innerThickness+=inch/8,true):false);
   if(has(/^splice-web-bearing$/))grow(()=>webClear()||(sp.web.columns<4?(sp.web.columns++,true):false));
   else if(has(/^splice-web-(slip|bolt-shear)$/))grow(()=>sp.web.columns<4?(sp.web.columns++,true):false);
   if(has(/^splice-web-plate|^splice-web-block/))grow(()=>sp.web.thickness<inch?(sp.web.thickness=up(sp.web.thickness+inch/8,inch/8),true):false);
   if(!grew)break;
  }
 }
 return undefined;
}

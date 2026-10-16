/**
 * Template sizing of the tie at the girder ends: the paired flat bars or the single flexible plate on the direct flange
 * saddle (independent simple spans), and the paired bars on the bearing stiffener (continuous girders). The tie force,
 * its fatigue range and the movements the tie must follow are estimated before any analysis (tieSizingDemands), the tie
 * is evaluated with the engine's own check functions (flange attachment, tie movement, flexible plate, the saddle-toe
 * fatigue register points, the brace member and its stiffness), and its proportions are chosen in standard increments
 * (sizeFlangeTie):
 * - bolts at the AISC J3.3 minimum pitch (2 2/3 d) and the 1.5d edge distance the tie checks use, on the 1/8 in grid;
 * - the column-end release slots with the travel the vertical movement needs, and the gauge, bar width and column
 *   gusset height that follow from the slots;
 * - the thinnest bar or plate, from 1/4 in in 1/16 in steps, that carries the force with the imposed movement;
 * - gussets from 3/4 in in 1/8 in steps, larger bolts, the saddle plate and its fillets, the setback of the tie from
 *   the bearing stiffener and the bar width where those checks govern;
 * - the flexible length: where the movement needs it, the column face (the designed bracket's reach, or the column
 *   face of a support by others) moves out in 1 in steps.
 * Canonical units N, mm, MPa.
 */
import type {CalculationSnapshot,CheckResult,ProjectInput} from './types';
import {sectionProperties} from './section';
import {beamSystem} from './beam';
import {girderDeadLoad} from './newSteel';
import {craneDesignMinimum} from './aistLoads';
import {craneTravel} from './craneTravel';
import {railTopAboveSteel} from './railSeat';
import {braceSystem,fatigueSpectrumBin} from './detailAnalysis';
import {flangeTieChecks,flangeTieResponse,stiffenerTieChecks} from './flangeTieDesign';
import {tieMovementChecks} from './tieMovement';
import {isPlateTie,plateTieChecks} from './plateTie';
import {lapChecks} from './detailChecks';
import {flangeTieFamily,flangeTieGeometry,stiffenerTieGeometry,tieBarGap,tieRelease,columnGussetHeight} from './tieGeometry';
import {selectBracketArrangement,tieArrangement} from './connectionOptions';
import {isTaperedHaunch} from './taperedHaunchInputs';
import {minimumFillet} from './connectionStrength';
import {wrenchClearance} from './endStop';
import {restraintClearances,secantStiffness} from './restraintClearance';
import {snapQuarter} from './quarterInch';
import {validateRunwayDetails} from './detailValidation';

const inch=25.4,sixteenth=inch/16,up=(v:number,step:number)=>Math.ceil(v/step-1e-9)*step,down=(v:number,step:number)=>Math.floor(v/step+1e-9)*step;

/** Side thrust of the heaviest crane on this runway (unfactored, all wheels), at least the design minimum, N. */
export function craneSideThrust(p:ProjectInput){
 return Math.max(0,...p.cranes.map(c=>Math.max(c.wheels.reduce((a,w)=>a+w.lateral,0),craneDesignMinimum(c).runwaySide)));
}

/**
 * Girder end rotations at the supports, rad, the largest factored moment and the side thrust reaction, from the girder
 * models of the moving-load search: the dead load and the crane wheels at sampled positions along the runway (each
 * crane alone with a wheel over every support, and two neighbouring cranes at closest approach). `service` is the
 * largest single-crane static rotation (the cyclic movement), `factored` the largest of 1.2D + 1.6(1 + I)C (LRFD) or
 * D + (1 + I)C (ASD) with every crane present (the static movement the tie checks use), `moment` the largest factored
 * moment of the same states; `lateral` the largest support reaction of one crane's side thrust (at least the design
 * minimum) on the top flange braced at the supports, unfactored, and `clipLateral` the largest side thrust of the wheels
 * within one rail clip window (the clip spacing, at least twice the rail depth plus the flange), unfactored.
 */
export function girderEndEstimate(p:ProjectInput,steps=60){
 const props=sectionProperties(p.section),EI=p.section.E*props.Ix,system=beamSystem(p.spans,EI,p.system,undefined,20);
 const lateralSystem=beamSystem(p.spans,p.section.E*p.section.tf*p.section.bf**3/12,p.system,p.lateralBraceSpacing);
 const supports=[0];for(const l of p.spans)supports.push(supports.at(-1)!+l);
 const L=supports.at(-1)!,support=(x:number)=>supports.some(s=>Math.abs(s-x)<1e-6);
 const deadResult=system.evaluate([],girderDeadLoad(p,props.weight)),dead=deadResult.rotation.map((v,i)=>support(deadResult.x[i])?v:0);
 const lrfd=p.method==='LRFD',gD=lrfd?1.2:1,gC=lrfd?1.6:1;
 const wheels=(k:number,origin:number)=>{const c=p.cranes[k],impact=Math.max(c.impact,craneDesignMinimum(c).impact);
  return c.wheels.map(w=>({x:origin+w.offset,p:w.loaded/(c.includesImpact?1+c.impact:1),impact}));};
 const origins=(k:number)=>{const t=craneTravel(p,k),o=new Set<number>();for(let i=0;i<=steps;i++)o.add(t.start+(t.end-t.start)*i/steps);
  for(const s of supports)for(const w of p.cranes[k].wheels){const v=s-w.offset;if(v>=t.start-1e-9&&v<=t.end+1e-9)o.add(v);}
  return [...o];};
 let service=0,factored=0,moment=0,lateral=0,clipLateral=0;
 const window=Math.max(p.aist?.clipSpacing??0,2*((p.aist?.railDepth||p.railHeight)+p.section.tf));
 // One crane's side thrust: its wheel shares, raised to the design minimum as in the analysis.
 const side=(k:number,origin:number)=>{const c=p.cranes[k],total=c.wheels.reduce((n,w)=>n+w.lateral,0),factor=total>0?Math.max(1,craneDesignMinimum(c).runwaySide/total):1;
  return c.wheels.map(w=>({x:origin+w.offset,p:w.lateral*factor}));};
 const evaluate=(group:{x:number;p:number;impact:number}[],single:boolean)=>{
  const on=group.filter(w=>w.x>=0&&w.x<=L);if(!on.length)return;
  const s=system.evaluate(on.map(w=>({x:w.x,p:w.p}))),si=system.evaluate(on.map(w=>({x:w.x,p:w.p*(1+w.impact)})));
  for(let i=0;i<s.rotation.length;i++){
   if(support(s.x[i])){if(single)service=Math.max(service,Math.abs(s.rotation[i]));factored=Math.max(factored,Math.abs(gD*dead[i]+gC*si.rotation[i]));}
   moment=Math.max(moment,Math.abs(gD*deadResult.moment[i]+gC*si.moment[i]));
  }
 };
 for(let k=0;k<p.cranes.length;k++){
  for(const o of origins(k)){
   evaluate(wheels(k,o),true);
   const h=side(k,o),on=h.filter(w=>w.x>=0&&w.x<=L);
   if(on.length)for(const r of lateralSystem.evaluate(on).reactions)if(support(r.x))lateral=Math.max(lateral,Math.abs(r.r));
   for(const w of h)clipLateral=Math.max(clipLateral,h.filter(v=>v.x>=w.x-1e-6&&v.x<=w.x+window+1e-6).reduce((n,v)=>n+v.p,0));
  }
  // The next crane at closest approach behind this one.
  if(k+1<p.cranes.length){const gap=p.cranes[k].wheels.at(-1)!.offset+Math.max(p.cranes[k].minSeparation,p.cranes[k+1].minSeparation);
   for(const o of origins(k))evaluate([...wheels(k,o),...wheels(k+1,o+gap)],false);}
 }
 return {service,factored,moment,lateral,clipLateral};
}

/** Demands for sizing the tie before any analysis (canonical units). */
export interface TieSizingDemands {
 /** Factored tie force including the bracing imperfection force, N. */
 force:number;
 /** Unfactored tie force range, N. */
 range:number;
 /** Factored and single-crane static end rotations, rad. */
 rotation:number;serviceRotation:number;
 /** Vertical deflection of a designed support at the bearing under one crane, mm; undefined for a support by others. */
 support?:number;
 /** Factored side thrust of the wheel group at a rail clip, N. */
 railLateral:number;
 /** AISC Appendix 6 point-brace force and stiffness for the top flange restraint, N and N/mm. */
 braceForce:number;braceStiffness:number;
}
/**
 * The sizing demands. Force: the factored side thrust reaction at a support (girderEndEstimate), carried to the top
 * restraint with its torsional share (the rail head y_r above the tie line, over the depth h_r from the tie line to the
 * bottom restraint: R(1 + y_r/h_r)), plus the Appendix 6 brace force 0.02M_rC_d/h_o + 0.01P_r with P_r the factored
 * traction or the bumper force. Range: 1.25 times the unfactored side thrust of the crane (it reverses; the torsional
 * share). Rotations and the largest factored moment: girderEndEstimate. A designed support deflects at most its
 * deflection limit. Appendix 6 stiffness: (1/φ)(10M_rC_d/h_o + 8P_r)/L_br. Rail clip: the factored side thrust of the
 * wheels in one clip window.
 */
export function tieSizingDemands(p:ProjectInput):TieSizingDemands{
 const H=craneSideThrust(p),r=girderEndEstimate(p),b=p.details?.bracket,lrfd=p.method==='LRFD',props=sectionProperties(p.section),s=p.section;
 const P=Math.max(0,...p.cranes.map(c=>Math.max((lrfd?1.6:1)*Math.max(c.longitudinal,craneDesignMinimum(c).traction),c.design&&!c.design.bumperBypassesGirder?c.design.bumperForce:0)));
 const Cd=p.system==='continuous'?2:1,Lbr=Math.min(p.lateralBraceSpacing,p.aist?.bottomBraceSpacing||p.lateralBraceSpacing);
 const braceForce=.02*r.moment*Cd/props.h0+.01*P;
 // Tie line and restraints from mid-depth: the top tie line (about 4 in below the flange before the tie is laid out), the
 // bottom tie line or the bottom flange (bearing bolts).
 const g=flangeTieGeometry(p),st=stiffenerTieGeometry(p),top=g?.topCenter??st?.topCenter??s.d/2-s.tf-4*inch,sides=g?.sides??st?.sides??[1];
 const bottom=sides.includes(-1)?(g?.bottomCenter??st?.bottomCenter??-s.d/2+s.tf):-s.d/2+s.tf/2;
 const railHead=s.d/2+(s.kind==='cap'?s.capTw:0)+railTopAboveSteel(p),torsion=1+Math.max(0,railHead-top)/Math.max(top-bottom,s.tf);
 return {force:(lrfd?1.6:1)*r.lateral*torsion+braceForce,range:1.25*H,rotation:r.factored,serviceRotation:r.service,support:b?.enabled?b.deflectionLimit:undefined,railLateral:(lrfd?1.6:1)*r.clipLateral,
  braceForce,braceStiffness:(lrfd?1/.75:2)*(10*r.moment*Cd/props.h0+8*P)/Lbr};
}

/** A calculation snapshot carrying only the sizing demands, for the tie check functions. */
function sizingSnapshot(p:ProjectInput,demand:TieSizingDemands):CalculationSnapshot{
 return {input:p,designAnalysis:{endRotation:demand.rotation,serviceRotation:demand.serviceRotation},
  detailResults:{demands:{brace:demand.force,braceFatigue:demand.range,railLateral:demand.railLateral},...(demand.support!==undefined?{bracket:{service:{deflection:{value:demand.support}}}}:{})}} as unknown as CalculationSnapshot;
}

/**
 * Utilization of every tie check under the sizing demands, by check id: the flange attachment, stiffener tie, tie
 * movement and flexible plate checks, the tie member and its stiffness in series with the slot play (Appendix 6),
 * and the saddle end-fillet toes (AISC A-3.1 item 7.1): the local flange range plus the girder's own range at the toe
 * (the static wheels of one crane as the end reaction over the toe distance, 1.5 times for lateral bending and warping
 * at the flange tip), all cycles at that range.
 */
export function tieSizingRatios(p:ProjectInput,demand=tieSizingDemands(p)):Record<string,number>{
 const s=sizingSnapshot(p,demand),brace=braceSystem(p),force=demand.force/brace.cos,ratios:Record<string,number>={};
 // Fit and detailing limits (lengths: spacing, edge distances, clearances, weld size limits) are kept apart, as a
 // non-enumerable list: they hold at their limit, where strength and fatigue ratios keep the sizing margin.
 const geometric=new Set<string>();Object.defineProperty(ratios,'geometric',{value:geometric,enumerable:false});
 const put=(c:Pick<CheckResult,'id'|'utilization'|'status'|'quantity'>)=>{if(c.utilization!==undefined&&Number.isFinite(c.utilization)&&c.status!=='excluded'&&c.status!=='not-applicable'){ratios[c.id]=Math.max(ratios[c.id]??0,c.utilization);if(c.quantity==='length')geometric.add(c.id);}};
 const d=p.details!,plate=isPlateTie(p);
 for(const c of [...flangeTieChecks(s,force),...stiffenerTieChecks(s,force),...tieMovementChecks(s,{force,member:brace.member}),
  // The single plate's single-shear laps, or the paired bars' double-cover connection.
  ...(plate?plateTieChecks(s,{force,cos:brace.cos,member:brace.member}):lapChecks(p,d.brace.connection,'tie','Flange tie connection',force,0,d.brace.gussetThickness,d.material.Fy,d.material.Fu))])put(c);
 ratios['brace-member']=demand.force/brace.capacity;
 ratios['brace-stiffness']=demand.braceStiffness/secantStiffness(brace.stiffness,restraintClearances(p).top.gap,demand.braceForce);
 const g=flangeTieGeometry(p);
 if(g){
  const a=g.attachment,cycles=p.details!.spectrum.reduce((n,v)=>n+v.cycles,0),category=a.saddleLength<2*inch?'C':a.saddleLength<=Math.min(12*a.saddleThickness,4*inch)?'D':a.saddleThickness<=.8*inch?'E':'E1';
  const props=sectionProperties(p.section),toe=Math.max(...g.stations.map(v=>Math.abs(v.tieX-v.station)))+a.saddleLength/2+a.weldSize;
  const wheels=Math.max(...p.cranes.map(c=>c.wheels.reduce((n,w)=>n+w.loaded/(c.includesImpact?1+c.impact:1),0)));
  const range=flangeTieResponse(p,demand.range).flange+1.5*wheels*toe/props.Sx;
  ratios['saddle-toe-fatigue']=range/fatigueSpectrumBin(category,range,cycles).allowable;
 }
 return ratios;
}

/** Tie proportions the sizing chooses; the rest follows (applyTieProportions). */
export interface TieProportions {diameter:number;thickness:number;gusset:number;travel:number;face:number;
 /** Extra bar width beyond the gauge and edge distances, mm. */
 widen:number;saddleThickness:number;saddleWeld:number;setback:number}

/** Bolt pitch and edge distance on the 1/8 in grid: AISC J3.3 minimum spacing 2 2/3 d, and the 1.5d edge the tie checks use. */
export const tieBoltSpacing=(db:number)=>({pitch:up(8/3*db,inch/8),edge:up(1.5*db,inch/8)});

/**
 * A designed bracket at a new reach: the seat reaches past the far bearing edge as the configurator lays it out, and
 * a tapered haunch is proportioned again for the new projection (its sizing follows).
 */
export function setBracketReach(p:ProjectInput,reach:number){
 const d=p.details!,b=d.bracket;if(!b?.enabled||Math.abs(b.reach-reach)<1e-6)return p;
 b.reach=reach;b.seatProjection=Math.max(b.seatProjection,up(reach+d.bearing.width/2+1.5*inch,inch));
 if(isTaperedHaunch(b)){delete b.haunch;p.details=selectBracketArrangement(d,'tapered-haunch',p.system);}
 return p;
}

/**
 * Write the chosen proportions into the tie so every dependent dimension follows, as the detail template lays them out:
 * the release slots set the gauge, the bar holds the gauge and both edge distances, the girder end of the bars sits on
 * the 1/4 in grid at least 1/2 in past the saddle start with its bolt group 1/4 in past the flange tip (the stiffener
 * tie: 1/4 in clear of the bearing stiffener), the bars run to the column face less the clear gap, the column root
 * fillets run the column gusset height and the girder gusset covers the bolt group.
 */
export function applyTieProportions(p:ProjectInput,x:TieProportions){
 const d=p.details!,t=d.brace,c=t.connection,a=t.flangeAttachment,rel=t.release,plate=tieArrangement(d)==='flexible-plate';
 // Column root fillets: the Table J2.4 minimum for the gusset and the receiving flange, 5/16 in at least.
 const receiver=d.bracket?.enabled?d.bracket.receiver.flangeThickness:x.gusset;
 const weld=Math.max(5/16*inch,minimumFillet(Math.min(x.gusset,receiver))),spacing=tieBoltSpacing(x.diameter);
 // A single plate is tightened from its face: the column-end bolts keep the socket clearance C1 to the toe of the
 // column root fillet across the clear gap (AISC Manual Table 7-15).
 const edge=plate?Math.max(spacing.edge,up(wrenchClearance(x.diameter)-tieBarGap(weld)+weld,inch/8)):spacing.edge;
 Object.assign(c,{diameter:x.diameter,pitch:spacing.pitch,edge,rows:2,thickness:x.thickness,weldSize:weld});
 t.thickness=x.thickness;t.gussetThickness=x.gusset;
 if(rel)rel.travel=x.travel;
 c.gauge=up(8/3*x.diameter,inch/4);
 const release=tieRelease(p);if(release)c.gauge=Math.max(c.gauge,release.minimumGauge);
 t.width=up(c.gauge+2*c.edge,inch/4)+x.widen;if(plate)t.width=Math.max(t.width,4*x.thickness);
 if(d.bracket?.enabled)setBracketReach(p,x.face);
 const connection=(c.rows-1)*c.pitch+2*c.edge;
 if(a?.enabled&&p.system==='simple'){
  Object.assign(a,{saddleThickness:x.saddleThickness,weldSize:x.saddleWeld,longitudinalSetback:x.setback});
  if(!d.bracket?.enabled)a.columnFace=x.face;
  const b=p.section,rootStart=snapQuarter(b.tw/2+a.webGap,'up'),rootEnd=rootStart+snapQuarter(b.bf/2-rootStart,'down');
  const start=up(Math.max(rootStart+inch/2,rootEnd-connection+inch/4),inch/4);
  t.length=t.reach=x.face-tieBarGap(c.weldSize)-start;
  t.connectionLength=up(start+connection-rootStart,inch/4);
 }else{
  const root=p.section.tw/2+d.bearing.stiffenerWidth,start=up(root+inch/4,inch/4);
  t.length=t.reach=x.face-start;
  t.connectionLength=up(start+connection-root,inch/4);
 }
 c.weldLength=columnGussetHeight(p);
 return p;
}

/** The current proportions of a project's tie. */
export function tieProportions(p:ProjectInput):TieProportions{
 const d=p.details!,t=d.brace,a=t.flangeAttachment,g=flangeTieGeometry(p),st=stiffenerTieGeometry(p);
 return {diameter:t.connection.diameter,thickness:t.thickness,gusset:t.gussetThickness,travel:t.release?.travel??inch/8,face:g?.face??st?.face??t.length,widen:0,
  saddleThickness:a?.saddleThickness??1.5*inch,saddleWeld:a?.weldSize??.375*inch,setback:a?.longitudinalSetback??0};
}

/** The fit and detailing limits among a set of sizing ratios (tieSizingRatios). */
export const sizingLimits=(ratios:Record<string,number>):Set<string>=>(ratios as unknown as {geometric?:Set<string>}).geometric??new Set();
/** Checks the imposed movement governs: a thicker bar or plate only adds to them, a longer one relieves them. */
const movementChecks=new Set(['tie-move-strength','tie-move-gusset','tie-move-weld','tie-move-root-fatigue','tie-move-fatigue','plate-tie-bolt-fatigue','tie-prying']);
/** Checks a thicker gusset or a larger bolt relieves. */
const gussetChecks=new Set(['tie-move-gusset','tie-move-weld','tie-move-root-fatigue','flange-tie-gusset','flange-tie-gusset-weld','flange-tie-gusset-fatigue','flange-tie-column-weld','flange-tie-column-root-fatigue','tie-gusset-compression','tie-net','tie-block','tie-weld','tie-release-net','tie-release-block','tie-release-bearing']);
const boltChecks=new Set(['tie-bolt','tie-slip','tie-prying','tie-bearing','plate-tie-bolt-fatigue','tie-release-sleeve']);

/**
 * The project with its tie sized for the estimated demands (tieSizingDemands), every ratio at most `target` where the
 * search finds such a set. `reach`: the largest column face distance from the girder web centerline (bracket reach, or
 * the column face of a support by others) the sizing may move to, mm; the face never moves inward. Search: column
 * faces from the current one outward in 1 in steps; at each, bars or plates from 1/4 in in 1/16 in steps; at each
 * thickness the governing check sets the next step (a thicker gusset, a larger bolt, a thicker saddle or a thinner one
 * for a shorter lever on the flange, larger saddle fillets, a wider bar and taller column gusset for the column flange)
 * until every ratio is at most the target or no step helps. A thickness at which the imposed movement governs ends that
 * face; a face whose best set is governed by a check the flexible length does not change ends the search. Returns the
 * first passing set, or the one with the smallest largest ratio.
 */
export function sizeFlangeTie(p:ProjectInput,opts:{reach?:number;target?:number}={}):ProjectInput{
 const d=p.details;
 if(!d||!flangeTieFamily(d)||(!flangeTieGeometry(p)&&!stiffenerTieGeometry(p)))return p;
 const target=opts.target??.9,base=tieProportions(p),demand=tieSizingDemands(p);
 const plate=tieArrangement(d)==='flexible-plate',release=!!d.brace.release?.enabled;
 // Release travel: the vertical movement at the tie (a designed support's deflection limit under every crane with
 // impact, or the same allowance for a support by others; the end rotation over the setback) plus the 1/16 in
 // positioning allowance and a 1/32 in tolerance, on the 1/16 in grid.
 const cranes=p.cranes.length,impact=Math.max(...p.cranes.map(c=>c.impact));
 const travel=release?Math.max(inch/8,up((demand.support??sixteenth)*cranes*(1+impact)+demand.rotation*base.setback+sixteenth+inch/32,sixteenth)):base.travel;
 const faces:number[]=[];for(let f=base.face;f<=Math.max(base.face,opts.reach??base.face)+1e-6;f+=inch)faces.push(f);
 const thicknesses=[4,5,6,7,8,9,10,12].map(v=>v*sixteenth),bolts=[.5,.625,.75,.875].map(v=>v*inch);
 const minSaddle=Math.max(inch,up(p.section.tf,inch/8));
 type Trial={q:ProjectInput;ratios:Record<string,number>;worst:number;excess:number;governs:string;compression:number};
 let best:Trial|undefined,evaluations=0;
 // The best set: the least total excess over the limits (strength and fatigue at the target, fit at one), then the least
 // largest ratio.
 const better=(a:Trial,b?:Trial)=>!b||a.excess<b.excess-1e-9||(Math.abs(a.excess-b.excess)<=1e-9&&a.worst<b.worst);
 const evaluate=(x:TieProportions):Trial|undefined=>{
  evaluations++;
  const q=applyTieProportions(structuredClone(p),x);
  if(validateRunwayDetails(q).length)return undefined;
  const ratios=tieSizingRatios(q,demand),brace=braceSystem(q);
  // Strength and fatigue ratios against the target, fit and detailing limits against one.
  const geometric=sizingLimits(ratios),entries=Object.entries(ratios).map(([k,v])=>[k,geometric.has(k)?v:v/target] as const).sort((u,v)=>v[1]-u[1]);
  // The axial part P/P_c of the H1 check of one ply, compression governing.
  const compression=demand.force/brace.cos/brace.plies/brace.member.compression.capacity;
  const r={q,ratios,worst:entries[0]?.[1]??0,excess:entries.reduce((n,[,v])=>n+Math.max(0,v-1),0),governs:entries[0]?.[0]??'',compression};
  if(better(r,best))best=r;
  return r;
 };
 // The step that relieves the governing check; false when there is none left.
 const step=(x:TieProportions,k:string,r:Trial)=>{
  // Axial force with imposed movement: a wider bar adds compression strength without adding to the weak-axis moment
  // ratio of the imposed movement; its share of the H1 sum decides.
  if(k==='tie-move-strength'&&r.compression>=.3&&x.widen<3*inch-1e-6){x.widen+=inch/4;return true;}
  if(gussetChecks.has(k)&&x.gusset<1.25*inch-1e-6){x.gusset+=inch/8;return true;}
  if(boltChecks.has(k)){const next=bolts.find(v=>v>x.diameter+1e-6);if(next){x.diameter=next;return true;}}
  // The receiving column flange: a taller column gusset, by longer slot travel first (the slot pattern sets the gusset
  // height and widens the bars only half as much), then wider bars.
  if(k==='flange-tie-column'||k==='flange-tie-column-fatigue'){
   if(release&&x.travel<travel+3/16*inch-1e-6){x.travel+=sixteenth;return true;}
   if(x.widen<3*inch-1e-6){x.widen+=inch/4;return true;}
  }
  // The saddle plate and the flange under it trade off: a thicker saddle bends less but moves the tie line (the lever on
  // the flange) down by as much. Each takes its step only while the other keeps within the target.
  const flangeLocal=Math.max(r.ratios['flange-tie-flange']??0,r.ratios['saddle-toe-fatigue']??0,r.ratios['plate-tie-keeper-flange']??0),saddlePlate=Math.max(r.ratios['flange-tie-saddle']??0,r.ratios['flange-tie-saddle-fatigue']??0);
  const lever=flangeTieGeometry(r.q)?.topDrop??Infinity;
  if((k==='flange-tie-saddle'||k==='flange-tie-saddle-fatigue')&&x.saddleThickness<2.5*inch-1e-6&&flangeLocal*(lever+inch/8)/lever<=target){x.saddleThickness+=inch/8;return true;}
  if(k==='flange-tie-flange'||k==='saddle-toe-fatigue'||k==='plate-tie-keeper-flange'){
   if(x.saddleThickness>minSaddle+1e-6&&saddlePlate*(x.saddleThickness/(x.saddleThickness-inch/8))**2<=target){x.saddleThickness-=inch/8;return true;}
   // A smaller bolt narrows the bars, their slots and the lever, where the bolts have the strength.
   const smaller=[...bolts].reverse().find(v=>v<x.diameter-1e-6);
   if(smaller&&Math.max(0,...['tie-bolt','tie-slip','tie-prying','tie-bearing','plate-tie-bolt-fatigue'].map(id=>r.ratios[id]??0))*(x.diameter/smaller)**2<=.8*target){x.diameter=smaller;return true;}
  }
  if((k==='flange-tie-saddle-weld'||k==='flange-tie-weld-fatigue')&&x.saddleWeld+sixteenth<=Math.min(x.saddleThickness,p.section.tf,x.gusset)-sixteenth+1e-6){x.saddleWeld+=sixteenth;return true;}
  return false;
 };
 for(const face of faces){
  let atFace:Trial|undefined,previous:number|undefined;
  for(const thickness of thicknesses){
   if(evaluations>300)break;
   const x:TieProportions={...base,face,thickness,travel,diameter:.625*inch,gusset:Math.max(.75*inch,plate?up(2*thickness,inch/8):0),widen:0};
   let r=evaluate(x);
   for(let i=0;i<30&&r&&r.worst>1;i++){
    const before={...x};if(!step(x,r.governs,r))break;
    const next=evaluate(x);if(!next){Object.assign(x,before);break;}
    r=next;
   }
   if(!r)continue;
   if(r.worst<=1)return r.q;
   if(better(r,atFace))atFace=r;
   // The imposed movement governs: a thicker bar or plate only adds to it, except to the axial force with imposed
   // movement while its compression share falls faster than the moment share grows.
   const h1=r.ratios['tie-move-strength']??0;
   if(movementChecks.has(r.governs)&&!(r.governs==='tie-move-strength'&&(previous===undefined||h1<previous)))break;
   previous=h1;
  }
  // A farther column face only relieves the imposed movement: go on while a movement check is above the target.
  if(!atFace||!Object.entries(atFace.ratios).some(([k,v])=>movementChecks.has(k)&&v>target)||evaluations>300)break;
 }
 return best?.q??p;
}

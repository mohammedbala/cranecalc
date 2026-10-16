import {finiteLife,fatigueCoefficient,fatigueThreshold,KSI} from './fatigueConstants';
import {girderDeadLoad,newSteelTakeoff} from './newSteel';
import {adjacentBays} from './continuation';
import {flexureCurves} from './loadHeightFlexure';
import {flangeTieGeometry,tiePlies} from './tieGeometry';
import {flangeTieResponse} from './flangeTieDesign';
import {cappedMechanics} from './cappedMechanics';
import {createBracketCollector} from './bracketDesign';
import {createSupportForceEnvelope,seatOffset,type SupportForceSet} from './bracketForces';
import {createExistingBracketCollector} from './existingBracket';
import {createRolledBracketCollector} from './rolledBracket';
import {createTaperedHaunchCollector} from './taperedHaunch';
import {bracketSeat} from './rolledBracketInputs';
import { LateralTorsionBeam } from './lateralTorsion';
import {meshTolerance} from './meshNodes';
import { beamSystem,momentAt } from './beam';
import { boltProperties,plateMember,compressionResistance } from './connectionStrength';
import type { RunwayCaseEvent,RunwayCaseObserver } from './designAnalysis';
import type { ProjectInput,Properties } from './types';
import type { FatigueDetailResult,InterfaceAction,RunwayCaseRecord,RunwayDetailResults } from './runwayDetails';
import { railClipResponse } from './railClip';
import { railTopAboveSteel,railClipInput } from './railSeat';
import {tractionBays,railClipStations,girderSegments,independentBearings,endGridOverhang,endGridCentered} from './simpleSupports';
import {activeEndStop,stopBoltRows,stopEnds} from './endStopInputs';
import {craneAtStop} from './craneTravel';
import {railBearsOnStops} from './railLayout';
import {restraintClearances,secantStiffness} from './restraintClearance';
import {activeEndBearing,locatingSupport} from './endBearingInputs';
import {craneCombinations} from './aistLoads';
import {runwayEnds} from './continuation';
import {activeColumnCap} from './columnCapInputs';
import {capForkStiffness,createColumnCapCollector} from './columnCap';
import {capAngleBraceSystem,capAngleFatigueDetails} from './capAngleTie';
import {capTieLine} from './capAngle';

export function braceSystem(p:ProjectInput){
 // The cap tieback angle: its tie plate member and the series stiffness of its plate, legs, bolts, shims and column flange.
 const capAngle=capAngleBraceSystem(p);if(capAngle)return capAngle;
 const d=p.details!,b=d.brace,m=d.material,bolt=boltProperties(b.connection.grade,b.connection.diameter),holes=2*(bolt.hole+1.5875),plies=tiePlies(p);
 const plate=plateMember(b.width,b.thickness,b.length,p.section.E,m.Fy,m.Fu,b.width-holes,p.method),cos=b.reach/b.length;
 // Each bar buckles out of plane between the innermost bolt rows, fixed in the girder bolt group and
 // pinned at the column end: K = 0.8 (AISC Commentary Table C-A-7.1 recommended value).
 const between=b.length-2*(b.connection.edge+(b.connection.rows-1)*b.connection.pitch),bucklingLength=.8*Math.max(between,b.thickness);
 const member={...plate,bucklingLength,compression:compressionResistance(plate.A,plate.r,bucklingLength,p.section.E,m.Fy,p.method)};
 // Two flat bars (or one flexible plate in single shear) in parallel, two end connections in series. The connection
 // model includes gusset axial strain and conservative bolt shear deformation;
 // no stiffness from the excluded supporting building is inferred.
 const n=2*b.connection.rows,G=p.section.E/2.6,grip=plies*b.thickness+b.gussetThickness;
 const plateK=p.section.E*b.gussetThickness*(b.connection.gauge+2*b.connection.edge)/b.connectionLength;
 const boltK=n*plies*G*bolt.area/grip;
 const weldArea=2*b.connection.weldLength*b.connection.weldSize/Math.sqrt(2);
 const weldK=G*weldArea/(2*b.connection.weldSize);
 const connectionK=1/(1/plateK+1/boltK+1/weldK);
 const localCompliance=flangeTieGeometry(p)?flangeTieResponse(p,1).compliance:0;
 const stiffness=cos*cos/(1/(plies*member.stiffness)+2/connectionK+localCompliance);
 return {member,cos,connectionK,stiffness,plies,capacity:plies*Math.min(member.tension,member.compression.capacity)*cos};
}
const mergeStations=(xs:number[])=>[...xs].sort((a,b)=>a-b).filter((x,i,s)=>!i||x-s[i-1]>1e-6);
/** Each flange is restrained only at its own brace stations; both flanges are tied at supports. */
export function flangeRestraintStations(p:ProjectInput){
 const supports=[0];for(const l of p.spans)supports.push(supports.at(-1)!+l);
 const L=supports.at(-1)!,tolerance=meshTolerance(Math.min(...p.spans));
 // A brace station within meshTolerance of a support is that support (the support restrains both flanges there).
 const series=(spacing:number)=>{const s=[...supports];for(let i=1;i*spacing<L-1e-6;i++)if(supports.every(x=>Math.abs(x-i*spacing)>tolerance))s.push(i*spacing);return mergeStations(s);};
 return {top:series(p.lateralBraceSpacing),bottom:series(p.aist?.bottomBraceSpacing||L)};
}
export function restraintStations(p:ProjectInput){const f=flangeRestraintStations(p);return mergeStations([...f.top,...f.bottom]);}
/** Largest restraint gap of each flange, and between stations restraining both flanges against twist. */
export function flangeRestraintGaps(p:ProjectInput){
 const gap=(s:number[])=>Math.max(...s.slice(1).map((x,i)=>x-s[i])),f=flangeRestraintStations(p);
 const both=f.top.filter(x=>f.bottom.some(y=>Math.abs(x-y)<=1e-6));
 return {top:gap(f.top),bottom:gap(f.bottom),twist:gap(both)};
}
/** Compression-flange unbraced length: top flange on simple spans, either flange on continuous spans. */
export function compressionFlangeGap(p:ProjectInput){const g=flangeRestraintGaps(p);return p.system==='continuous'?Math.max(g.top,g.bottom):g.top;}
const constants={A:[25,24*KSI],B:[12,16*KSI],B1:[6.1,12*KSI],C:[4.4,10*KSI],D:[2.2,7*KSI],E:[1.1,4.5*KSI],E1:[.39,2.6*KSI]} as const;
export function fatigueSpectrumBin(category:keyof typeof constants,range:number,cycles:number){
 const [cf]=constants[category];
 const allowable=finiteLife(cf,cycles);
 // Palmgren–Miner cumulative damage using the AISC cubic S-N curve. Below
 // the threshold receives damage too: no endurance-limit credit for a mixed spectrum.
 const damage=range===0?0:cycles/(cf*(fatigueCoefficient/range)**3);
 // threshold: Table A-3.1 F_TH for the category, so a register point can be screened (range < F_TH).
 return {allowable,damage,threshold:fatigueThreshold(category)};
}
export function automaticFatigueDetails(p:ProjectInput){
 const d=p.details!,L=p.spans.reduce((s,v)=>s+v,0),list=[...d.fatigueDetails];
 const tie=flangeTieGeometry(p);
 // Saddle welded to the flange by transverse end fillets across it: a short attachment, AISC Table A-3.1 item 7.1
 // (welds transverse to the stress) by its length a along the stress and thickness b. The crack starts at the
 // toe of each end fillet on the flange, one weld leg beyond the saddle end.
 const sa=tie?.attachment,inch=25.4,saddleCategory=!sa?'E1':sa.saddleLength<2*inch?'C':sa.saddleLength<=Math.min(12*sa.saddleThickness,4*inch)?'D':sa.saddleThickness<=.8*inch?'E':'E1';
 if(tie)for(const [i,v] of tie.stations.entries())for(const sign of [-1,1])for(const point of tie.sides.map(side=>side>0?'top-right' as const:'bottom-right' as const))list.push({id:`SA${i}-${sign}-${point}`,name:`Flange saddle ${i+1} · end fillet toe ${sign<0?1:2} / ${point}`,x:v.tieX+sign*(tie.attachment.saddleLength/2+tie.attachment.weldSize),point,category:saddleCategory,reference:`AISC Table A-3.1 item 7.1, Category ${saddleCategory==='E1'?'E′':saddleCategory} for a ${(tie.attachment.saddleLength/inch).toFixed(2)} in attachment: toe of the transverse end fillet on the flange; global stress plus local flange strip bending`});
 // Cap tieback angle: bolt holes in the column-side channel flange near each girder end.
 list.push(...capAngleFatigueDetails(p));
 // End stop bolt holes through the top flange near each runway end: pretensioned bolted joint, net section.
 const stop=activeEndStop(p);
 // The rows are measured from the girder end, past the grid when the end bearing is centered on the support web; a
 // hole on that overhang is sampled at the grid (the overhang carries no girder moment).
 const span=(x:number)=>Math.min(L,Math.max(0,x));
 if(stop)for(const [end,x0,dir] of ([['left',-endGridOverhang(p,'left'),1],['right',L+endGridOverhang(p,'right'),-1]] as const).filter(([end])=>stopEnds(p).includes(end)))for(const [r,row] of stopBoltRows(stop).entries())for(const side of ['left','right'] as const)list.push({id:`SH-${end}${r}-${side}`,name:`End stop holes, ${end} runway end, ${r?'front':'back'} row · ${side}`,x:span(x0+dir*row),point:`top-${side}`,category:'B',reference:'AISC Table A-3.1 item 2.2 · net section at pretensioned bolts; flange tip stress bounds the hole line'});
 // Rail clip base welded to the top plate (the cap channel web or the W top flange) by fillets at both ends of the base,
 // across the runway: a short attachment, AISC Table A-3.1 item 7.1, by its length a along the stress (the base length)
 // and thickness b (the base thickness). Bolted clamp plates: holes through the top plate, item 2.2.
 const clip=railClipInput(d.rail),bolted=clip.type==='bolted',a=clip.baseLength,tb=clip.baseThickness;
 const category=bolted?'B':a<2*inch?'C':a<=Math.min(12*tb,4*inch)?'D':tb<=.8*inch?'E':'E1';
 const clipReference=bolted?'AISC Table A-3.1 item 2.2 · holes for pretensioned clamp-plate bolts through the top plate'
  :`AISC Table A-3.1 item 7.1, Category ${category==='E1'?'E′':category}: rail clip base ${(a/inch).toFixed(2)} in long, ${(tb/inch).toFixed(2)} in thick, welded across the runway at both ends`;
 for(const [i,x] of railClipStations(p).map(span).entries()){
  for(const side of ['left','right'] as const)list.push({id:`RC${i}-${side}`,name:`Rail clip base weld ${i+1} · ${side}`,x,point:`top-${side}`,category,reference:clipReference});
 }
 if(p.section.kind==='cap'){
  // Continuous longitudinal welds: Category B base metal. End terminations:
  // conservative Category E; evaluated at both ends of each physical segment.
  const positions=list.filter(f=>f.id.startsWith('RC')&&f.id.endsWith('left')).map(f=>f.x);
  for(const [i,x] of positions.entries())for(const side of ['left','right'] as const)list.push({id:`CW${i}-${side}`,name:`Cap weld base metal ${i+1} · ${side}`,x,point:`top-${side}`,category:'B',reference:'AISC Table A-3.1 item 3.1; continuous longitudinal weld'});
  const ends=p.system==='continuous'?[0,L]:girderSegments(p).flatMap(m=>[m.start,m.end]).map(span);
  // The cap ends like a cover plate wider than the flange, with longitudinal welds only: Table A-3.1 item 3.7, E'.
  const capEnd='E1';
  for(const [i,x] of ends.entries())for(const side of ['left','right'] as const)list.push({id:`CE${i}-${side}`,name:`Cap end termination ${i+1} · ${side}`,x,point:`top-${side}`,category:capEnd,reference:'AISC Table A-3.1 item 3.7: end of a welded cover plate wider than the flange, no weld across the end, Category E′'});
 }
 // With the end bearings centered on the support web the end-bay girders run past grids 1 and n+1: a generated
 // detail on that overhang (cap tieback holes, saddles) is sampled at the grid, where the overhang meets the span.
 const own=d.fatigueDetails.length;
 return endGridCentered(p)?list.map((f,k)=>k<own?f:{...f,x:span(f.x)}):list;
}
/**
 * Where the girder's longitudinal force reaches the supports. Simple bays: traction at the locating (left) end of
 * each occupied bay, either way; the crane stop force (AIST stop combinations) only with the crane against a stop
 * (craneAtStop), on the end bay that carries that stop, toward the stop: bay 1 for the stop at the left runway end,
 * the last bay for the one at the right end, which that bay delivers to its own locating end. A floating rail string
 * between girder-mounted stops (tight joints) carries traction either way: no rail-seat friction is relied on, so it
 * reaches the girder under the driven wheels (the occupied bays) or, once the string has crept against a stop,
 * through that stop into its end bay, toward the stop, wherever the crane is (`rail`). A continuous girder with
 * bolted bearings locates at one support; otherwise the runway ends take it.
 */
export function longitudinalPaths(p:ProjectInput,supports:number[]){
 const stops=new Set(craneCombinations(p.method).filter(c=>c.bumper>0).map(c=>`${p.method} ${c.id}`));
 const ends=stopEnds(p).length?stopEnds(p):runwayEnds(p),stopBays=[...(ends.includes('left')?[{bay:1,sign:-1}]:[]),...(ends.includes('right')?[{bay:p.spans.length,sign:1}]:[])];
 const L=supports.at(-1)!,locating=p.system==='continuous'&&activeEndBearing(p)?supports[locatingSupport(p)]:undefined,railString=railBearsOnStops(p);
 // The stop the crane is against, toward which its stop force acts.
 const struckBy=(e:RunwayCaseEvent)=>{const crane=e.cranes.find(c=>c.index===e.horizontalCrane),end=e.stop??(crane&&craneAtStop(p,crane.index,crane.origin));return stopBays.filter(v=>v.sign===(end==='left'?-1:end==='right'?1:0));};
 return {
  actions(e:RunwayCaseEvent):{bay:number;sign:number;rail?:boolean}[]{
   const stop=stops.has(e.combination);
   if(p.system!=='simple')return stop?struckBy(e).map(v=>({bay:-1,sign:v.sign})):[{bay:-1,sign:-1},{bay:-1,sign:1}];
   const occupied=tractionBays(p,e);
   if(!stop){const local=occupied.flatMap(bay=>[-1,1].map(sign=>({bay,sign})));return railString?[...local,...stopBays.filter(v=>!local.some(w=>w.bay===v.bay&&w.sign===v.sign)).map(v=>({...v,rail:true}))]:local;}
   const struck=struckBy(e).filter(v=>occupied.includes(v.bay));
   return struck.length?struck:[{bay:-1,sign:1}];
  },
  continuousAt:(x:number)=>locating===undefined?Math.abs(x)<1e-6||Math.abs(x-L)<1e-6:Math.abs(x-locating)<1e-6,
  stopBays
 };
}
/**
 * `braceForce`: the Appendix 6 brace force P_br of the design envelope (braceImperfection); restraints with play enter
 * the buckling eigenvalue at their secant stiffness with the play taken up at that force. Without it, the stiffness
 * after contact throughout.
 */
export function createDetailCollector(p:ProjectInput,props:Properties,subdivisions:number,braceForce?:number){
 const bracket=createBracketCollector(p);
 const existingBracket=createExistingBracketCollector(p);
 const rolledBracket=createRolledBracketCollector(p);
 const taperedHaunch=createTaperedHaunchCollector(p);
 const capCollector=createColumnCapCollector(p);
 const details=p.details!,brace=braceSystem(p),E=p.section.E,G=E/2.6,L=p.spans.reduce((s,l)=>s+l,0),cap=cappedMechanics(p.section),z=cap?p.section.d+p.section.capTw+railTopAboveSteel(p)-cap.shearCenter:railTopAboveSteel(p)+p.section.d/2,allStations=restraintStations(p),flanges=flangeRestraintStations(p),restrains=(xs:number[],x:number)=>xs.some(v=>Math.abs(v-x)<=1e-6);
 const supports=[0];for(const l of p.spans)supports.push(supports.at(-1)!+l);
 const groups=p.system==='continuous'?[[0,L]]:p.spans.map((_,i)=>[supports[i],supports[i+1]]);
 // `subdivisions` elements per span: a continuous girder, one member over all its spans, has subdivisions times the
 // number of spans over its length (as its vertical beamSystem), not `subdivisions` over the whole runway.
 const memberSubdivisions=subdivisions*(p.system==='continuous'?p.spans.length:1);
 const longitudinal=longitudinalPaths(p,supports);
 // Bolted end bearings restrain the bottom flange at each support through four bolts into the seat: bolt shear
 // deformation over the flange, bearing plate and seat grip. Otherwise the bottom flange tie is the brace pair.
 const eb=activeEndBearing(p),ebBolt=eb?boltProperties(eb.bolts.grade,eb.bolts.diameter):undefined;
 const columnCap=activeColumnCap(p);
 const ebK=eb&&ebBolt?4*G*ebBolt.area/(p.section.tf+details.bearing.thickness+(details.bracket?.enabled?bracketSeat(details.bracket).thickness:columnCap?columnCap.plate.thickness:details.bearing.thickness)):0;
 const bottomK=(x:number)=>ebK&&supports.some(v=>Math.abs(v-x)<=1e-6)?ebK:brace.stiffness;
 // On a column cap no tie reaches the top flange: the bearing stiffeners and the bolted bottom flange form a fork.
 const forkK=columnCap&&eb?capForkStiffness(p).k:0,topK=(x:number)=>forkK&&supports.some(v=>Math.abs(v-x)<=1e-6)?forkK:brace.stiffness;
 // Girder-end hardware on the seats (bearing plate and stiffeners at each girder end, end stops at the runway ends).
 const steel=newSteelTakeoff(p),endHardware=(bay:number,end:'left'|'right')=>steel.perEnd+(bay===0&&end==='left'&&steel.stops.includes('left')||bay===p.spans.length-1&&end==='right'&&steel.stops.includes('right')?steel.stopEach:0);
 const gridHardware=(x:number)=>steel.grid[supports.findIndex(v=>Math.abs(v-x)<1e-6)]??0;
 // Play in the support restraints: the top tie at the supports and the sliding bearing (right) end of each simple bay.
 const clearance=restraintClearances(p),gapped=clearance.top.gap>0||clearance.bottom.gap>0,atSupport=(x:number)=>!forkK&&supports.some(v=>Math.abs(v-x)<=1e-6),gapK=(k:number,gap:number,P:number)=>gap>0?secantStiffness(k,gap,P):k;
 const bearings=independentBearings(p),adjacent=adjacentBays(p);
 const vertical=beamSystem(p.spans,E*props.Ix,p.system,undefined,subdivisions);
 const detailInputs=automaticFatigueDetails(p);
 const fatigue:FatigueDetailResult[]=detailInputs.map(f=>({id:f.id,name:f.name,x:f.x,category:f.category,threshold:fatigueThreshold(f.category),reference:f.reference,bins:details.spectrum.map(b=>({name:b.name,cycles:b.cycles,minimum:0,maximum:0,range:0,allowable:0,damage:0})),damage:0,range:0,peak:0}));
 const result:RunwayDetailResults={normalStress:0,shearStress:0,railDisplacement:0,twist:0,criticalMultiplier:128,residual:0,meshChange:0,travelChange:0,cases:0,braceStiffness:brace.stiffness,braceForce:0,fatigue,interfaces:[],railFatigueBins:details.spectrum.map(b=>({name:b.name,cycles:b.cycles,vertical:0,lateral:0,weldStress:0})),demands:{brace:0,braceFatigue:0,verticalFatigue:0,endLongitudinal:0,railLateral:0,railVertical:0,railFatigueVertical:0,railFatigueLateral:0},governing:{}};
 if(cap)result.cap={longitudinalFlow:0,fatigueFlows:details.spectrum.map(()=>0)};
 const curves=flexureCurves(p,props),loadHeight=result.loadHeight={utilization:0,demand:0,capacity:0,length:p.unbracedLength,critical:Infinity,id:'',combination:'',x:0,cb:1,mocr:curves.positive.mocr,height:z};
 // AISC 360-16 Commentary F1 load-height comparison: Cb (F1-1) of the case's moment diagram over the unbraced segment times
 // 1.4^(2y/h), y the load point from mid-depth (negative above it), h the section depth; extrapolated above the top flange.
 const depth=p.section.d+(cap?p.section.capTw:0),yLoad=-(railTopAboveSteel(p)+depth/2),f1Factor=1.4**(2*yLoad/depth);
 const commentary=(moment:(x:number)=>number,xm:number,start:number,end:number,wheelXs:number[],c:typeof curves.positive)=>{
  const tops=[start,end,...flanges.top.filter(x=>x>start+1e-6&&x<end-1e-6)],a=Math.max(...tops.filter(x=>x<=xm+1e-6)),b=Math.min(...tops.filter(x=>x>=xm-1e-6)),Lseg=b-a;
  const at=(t:number)=>Math.abs(moment(a+t*Lseg)),points=[...Array.from({length:201},(_,i)=>i/200),...wheelXs.filter(x=>x>=a&&x<=b).map(x=>(x-a)/Lseg)];
  const mmax=Math.max(...points.map(at)),quarter:[number,number,number]=[at(.25),at(.5),at(.75)],gradient=12.5*mmax/(2.5*mmax+3*quarter[0]+4*quarter[1]+3*quarter[2]);
  const cb=gradient*f1Factor;
  return {segment:[a,b] as [number,number],mmax,quarter,gradient,y:yLoad,h:depth,factor:f1Factor,cb,capacity:c.capacity(cb*c.mocr)};
 };
 // The top restraint acts where the tie acts on the girder: the cap tieback's tie plate line above the cap (M6), else
 // the W top flange; the bottom restraint (end bearing bolts or bottom tie) at the W bottom flange.
 const tieLine=capTieLine(p),topRestraint=cap?(tieLine!==undefined?tieLine-cap.shearCenter:cap.topOffset):undefined;
 const mechanics=cap?{Iy:cap.Iy,topOffset:topRestraint,bottomOffset:cap.bottomOffset,centroidOffset:cap.centroidOffset,monosymmetry:cap.beta,polarRadiusSquared:cap.polarRadiusSquared}:{};
 const interfaceExtremes=new Map<string,InterfaceAction>(),seen=new Set<string>(),observedSets=new Set<string>(),bayStates=new Map<string,{x:number;top:number;bottom:number}[]>(),forces=createSupportForceEnvelope(supports);
 const snap=(x:number)=>supports.find(v=>Math.abs(v-x)<1e-6)??x;
 const braceFatigue={min:0,max:0},braceEndFatigue={min:0,max:0},verticalFatigue={min:0,max:0};
 // Unfactored dead load for the Appendix 3.1 peak and the register peaks: major bending from the girder, cap, rail and
 // entered live load; torsion of each bay from the eccentric rail weight, with the modeled restraints. Solved once.
 const deadQ=girderDeadLoad(p,props.weight)+(p.aist?.liveLoad??0),deadTorsion=new Map<number,ReturnType<LateralTorsionBeam['solve']>>();
 let deadVertical:ReturnType<typeof vertical.evaluate>|undefined;
 const deadBay=(bay:number)=>{let t=deadTorsion.get(bay);if(!t){const [start,end]=groups[bay];
  t=new LateralTorsionBeam({length:end-start,E,G,Iy:props.Iy,J:props.J,Cw:props.Cw,h0:props.h0,polarRadiusSquared:(props.Ix+props.Iy)/props.A,subdivisions:memberSubdivisions,...mechanics,
   restraints:allStations.filter(x=>x>=start-1e-6&&x<=end+1e-6).map(x=>({x:x-start,top:restrains(flanges.top,x)?topK(x):0,bottom:restrains(flanges.bottom,x)?bottomK(x):0})),
   loads:[],distributedTorque:p.railWeight*p.railEccentricity}).solve();deadTorsion.set(bay,t);}return t;};
 const deadMoment=(x:number)=>{deadVertical??=vertical.evaluate([],deadQ);return momentAt(x,deadVertical.reactions,[],deadQ);};
 // The dead-load torsion at a station, recovered once per bay and station (stations recur over the crane positions).
 const deadStations=new Map<string,ReturnType<ReturnType<LateralTorsionBeam['solve']>['at']>>();
 const deadAt=(bay:number,x:number)=>{const key=`${bay}:${x.toFixed(4)}`;let v=deadStations.get(key);if(!v){v=deadBay(bay).at(x);deadStations.set(key,v);}return v;};
 function peak(key:'normalStress'|'shearStress'|'railDisplacement'|'twist',value:number,e:RunwayCaseEvent,x:number){if(value>result[key]){result[key]=value;result.governing[key]={id:e.id,combination:e.combination,x,value};}}
 // Every strength and service case by id, so printed results can name the combination and crane position (caseIndex).
 const registry=new Map<string,RunwayCaseRecord>();
 // Combined normal stress of each flange: section modulus, half width and normalized warping function at its tips.
 const flangeNormal=result.flangeNormal={top:0,bottom:0},flangeS={top:cap?cap.Stop:props.Sx,bottom:cap?cap.Sbottom:props.Sx},flangeHalf={top:(cap?p.section.capWidth:p.section.bf)/2,bottom:p.section.bf/2};
 const flangeW=cap?{top:Math.max(...cap.fibres.filter(v=>v.y>0).map(v=>Math.abs(v.omega))),bottom:Math.max(...cap.fibres.filter(v=>v.y<0).map(v=>Math.abs(v.omega)))}:{top:props.h0*p.section.bf/4,bottom:props.h0*p.section.bf/4};
 result.flangeWarping=flangeW;
 const flangeParts:NonNullable<RunwayDetailResults['flangeParts']>=result.flangeParts={top:{P:0,M:0,My:0,thetaM:0,warping:0},bottom:{P:0,M:0,My:0,thetaM:0,warping:0}};
 function flangePeak(k:'top'|'bottom',value:number,e:RunwayCaseEvent,x:number,v:{P:number;M:number;My:number;thetaM:number;warping:number}){if(value>flangeNormal[k]){flangeNormal[k]=value;flangeParts[k]=v;result.governing[k==='top'?'normalStressTop':'normalStressBottom']={id:e.id,combination:e.combination,x,value};}}
 const evaluate=(e:RunwayCaseEvent,bin=-1)=>{
  const key=JSON.stringify([e.kind,bin,e.wheels,e.q,e.railTorquePerLength,e.axial,e.horizontalCrane,e.cranes]);
  if(seen.has(key))return;seen.add(key);result.cases++;
  if(e.kind!=='fatigue'&&!registry.has(e.id))registry.set(e.id,{combination:e.combination,cranes:e.cranes.map(c=>({...c})),lateralSign:e.lateralSign,...(e.stop?{stop:e.stop}:{})});
  const majorLoads=e.wheels.map(w=>({x:w.x,p:w.p}));
  const moment=(x:number)=>momentAt(x,e.verticalReactions,majorLoads,e.q);
  const reactions=new Map<number,{top:number;bottom:number}>();
  const endActions:{x:number;bay:number;end:'left'|'right';vertical:number;top:number;bottom:number;longitudinal:number;offset:number;existing?:boolean}[]=[],joints:{bay:number;p:number}[]=[];
  for(const [bayIndex,[start,end]] of groups.entries()){
   const wheels=e.wheels.filter(w=>w.x>=start-1e-6&&(w.x<end-1e-6||(end===L&&w.x<=end+1e-6)));
   const stations=allStations.filter(x=>x>=start-1e-6&&x<=end+1e-6);
   const strength=e.kind==='strength',stiffnessFactor=strength?.8:1,totalH=e.wheels.reduce((a,w)=>a+Math.abs(w.h),0);
   // A bay's lateral/torsional response depends only on its own loads. When the same bay state recurs
   // (other cranes elsewhere, a repeated combination), every peak it can set is already recorded, so only
   // its restraint forces are needed again for the shared supports and interfaces.
   const bayKey=JSON.stringify([e.kind,bin,bayIndex,wheels.map(w=>[w.x,w.p,w.h]),e.q,e.railTorquePerLength,strength?e.axial:0,strength?totalH:0]);
   let restraintForces=bayStates.get(bayKey),r:ReturnType<LateralTorsionBeam['solve']>|undefined;
   if(!restraintForces){
   // Restraints with play (restraintClearances) enter the strength cases, stresses and buckling eigenvalue alike, at
   // their secant stiffness, the play taken up at the Appendix 6 brace force of the design envelope (AISC 360-16
   // Appendix 6.3.1b, as the brace stiffness check). Service cases use the stiffness after contact; the rail-head check
   // adds the rigid-body take-up, and clearanceEffects bounds the twist between the two ends of a bay.
   const brScale=strength&&gapped?braceForce??0:0;
   const restraintsAt=(secant:boolean)=>stations.map(x=>({x:x-start,top:restrains(flanges.top,x)?gapK(topK(x),secant&&atSupport(x)?clearance.top.gap:0,brScale)*stiffnessFactor:0,bottom:restrains(flanges.bottom,x)?gapK(bottomK(x),secant&&ebK&&Math.abs(x-end)<1e-6?clearance.bottom.gap:0,brScale)*stiffnessFactor:0}));
   const beamWith=(restraints:ReturnType<typeof restraintsAt>)=>new LateralTorsionBeam({length:end-start,E:E*stiffnessFactor,G:G*stiffnessFactor,Iy:props.Iy,J:props.J,Cw:props.Cw,h0:props.h0,polarRadiusSquared:(props.Ix+props.Iy)/props.A,subdivisions:memberSubdivisions,...mechanics,
    loads:wheels.map(w=>({x:Math.max(0,w.x-start),lateral:w.h,torque:w.p*p.railEccentricity+w.h*z,vertical:w.p,height:z})),
    restraints,
    axial:strength?e.axial:0,moment:strength?x=>moment(x+start):undefined,
    distributedTorque:e.railTorquePerLength,
    // Apply the full UDL at rail height for the stability test conservatively.
    distributedVertical:strength?e.q:0,distributedHeight:z
   });
   const beam=beamWith(restraintsAt(brScale>0)),stability=beam;
   let ownMultiplier:number|undefined;
   if(strength&&!stability.isStable(result.criticalMultiplier)){
    const critical=stability.criticalMultiplier(result.criticalMultiplier);
    if(critical.value<result.criticalMultiplier){result.criticalMultiplier=critical.value;result.governing.criticalMultiplier={id:e.id,combination:e.combination,x:start,value:critical.value};ownMultiplier=critical.value;}
   }
   const geometry=strength?(p.method==='LRFD'?1:1.6):0;
   // A girder that buckles below the applied load has no equilibrium state to recover: record the case and let
   // the stability check (whose multiplier is then below 1) report the failure instead of stopping the analysis.
   try{r=beam.solve(geometry);}catch(error){if(!(strength&&error instanceof Error&&error.message.startsWith('Lateral/torsional instability')))throw error;}
   if(!r){result.unstableCases=(result.unstableCases??0)+1;restraintForces=stations.map(x=>({x:x-start,top:0,bottom:0}));bayStates.set(bayKey,restraintForces);}
   else{
   result.residual=Math.max(result.residual,r.residual);
   if(strength){
    // Load-height LTB: the elastic critical moment of this case (wheels at the rail head, UDL at rail height, axial
    // load, modeled restraints and moment gradient) is Mcr = lambda M / 0.8 because the eigen model carries 0.8
    // stiffness. It enters F2 / F4 / F5 as Cb = Mcr / Mocr (AISC 360-16 F1 and Commentary F1), never above 1, and the
    // strength never exceeds phi Mcr. A case is screened out when it is stable at the multiplier that would just reach
    // the governing utilization so far.
    let Mx=0,xm=start;for(const st of r.stations){const m=moment(st.x+start);if(Math.abs(m)>Math.abs(Mx)){Mx=m;xm=st.x+start;}}
    const c=Mx>=0?curves.positive:curves.negative,M=Math.abs(Mx);
    if(M>0){
     const record=(u:number,capacity:number,critical:number)=>{if(u>loadHeight.utilization)Object.assign(loadHeight,{utilization:u,demand:M,capacity,length:p.unbracedLength,critical,cb:Number.isFinite(critical)?c.cb(critical):1,mocr:c.mocr,sign:Mx>=0?1:-1,id:e.id,combination:e.combination,x:xm,commentary:commentary(moment,xm,start,end,wheels.map(w=>w.x),c)});};
     record(M/c.base,c.base,Infinity);
     // This case's multiplier is at least the least one found so far, which bounds its strength from below.
     const bound=M/c.capacity(result.criticalMultiplier*M/.8);
     const threshold=.8*c.criticalFor(M/loadHeight.utilization)/M;
     if(bound>loadHeight.utilization&&threshold>0&&!stability.isStable(threshold)){
      let lambda=ownMultiplier;
      if(lambda===undefined){let lo=Math.min(result.criticalMultiplier,threshold),hi=threshold;if(!stability.isStable(lo))lo=0;for(let i=0;i<30;i++){const mid=(lo+hi)/2;if(stability.isStable(mid))lo=mid;else hi=mid;}lambda=lo;}
      const critical=lambda*M/.8,capacity=c.capacity(critical);
      record(M/capacity,capacity,critical);
     }
    }
   }
   restraintForces=r.restraints.map(v=>({x:v.x,top:v.top,bottom:v.bottom}));bayStates.set(bayKey,restraintForces);
   }
   }
   if(p.system==='simple')for(const [endName,x] of [['left',start],['right',end]] as const){
    const lateral=restraintForces.find(re=>Math.abs(re.x-(x-start))<1e-6)!;
    const vertical=e.q*(end-start)/2+wheels.reduce((sum,w)=>sum+w.p*(endName==='left'?(end-w.x):(w.x-start))/(end-start),0)+(e.deadFactor??0)*endHardware(bayIndex,endName);
    const bearing=bearings.find(v=>v.bay===bayIndex+1&&v.end===endName)!;
    endActions.push({x,bay:bayIndex+1,end:endName,vertical,top:lateral?.top??0,bottom:lateral?.bottom??0,longitudinal:0,offset:bearing.center-x});
   }
   if(p.system==='simple'&&bayIndex)joints.push({bay:bayIndex+1,p:wheels.filter(w=>Math.abs(w.x-start)<=1e-6).reduce((a,w)=>a+w.p,0)});
   for(const re of restraintForces){const x=snap(re.x+start),old=reactions.get(x)??{top:0,bottom:0};reactions.set(x,{top:old.top+re.top,bottom:old.bottom+re.bottom});}
   if(!r)continue;
   for(const s of r.stations){
    const x=s.x+start,M=moment(x),warping=E*Math.abs(s.warpingCurvature)*props.h0*p.section.bf/4;
    if(strength){
     // Sum component magnitudes for a conservative corner-stress envelope.
     // Whole-section bending + explicit warping replaces force-couple stresses
     // in this supplementary check; no double counting of the old flange model.
     // Each flange at its own extreme fibre (AISC DG7 / DG9): P/A + Mx/Sx of that flange + lateral bending (M_y + theta Mx)
     // and warping E W_no theta'' at that flange's tips. The larger is the girder's combined normal stress.
     const P0=Math.abs(e.axial),M0=Math.abs(M),My0=E*Math.abs(s.curvature)*props.Iy,tM0=Math.abs(M*s.twist),w0=E*Math.abs(s.warpingCurvature);
     const flange=(k:'top'|'bottom')=>P0/props.A+M0/flangeS[k]+(My0+tM0)*flangeHalf[k]/props.Iy+(cap?w0*flangeW[k]:warping);
     const top=flange('top'),bottom=flange('bottom');
     peak('normalStress',Math.max(top,bottom),e,x);
     if(top>flangeNormal.top)flangePeak('top',top,e,x,{P:P0,M:M0,My:My0,thetaM:tM0,warping:cap?w0*flangeW.top:warping});
     if(bottom>flangeNormal.bottom)flangePeak('bottom',bottom,e,x,{P:P0,M:M0,My:My0,thetaM:tM0,warping:cap?w0*flangeW.bottom:warping});
     const V=e.verticalReactions.reduce((a,v)=>a+(v.x<=x+1e-7?v.r:0),0)-e.wheels.reduce((a,w)=>a+(w.x<=x+1e-7?w.p:0),0)-e.q*x;
     const h=p.section.d-2*p.section.tf;
     const tauWeb=1.5*Math.abs(V)/(h*p.section.tw)+G*p.section.tw*Math.abs(s.twistRate);
     const tauFlange=1.5*totalH/(cap?Math.min(2*p.section.bf*p.section.tf,p.section.capWidth*p.section.capTw):2*p.section.bf*p.section.tf)+G*(cap?.maxThickness??p.section.tf)*Math.abs(s.twistRate)+E*Math.abs(s.warpingThird)*(cap?.shearCoefficient??props.h0*p.section.bf**2/16);
     peak('shearStress',Math.max(tauWeb,tauFlange),e,x);
    }
    if(cap&&(strength||e.kind==='fatigue')){
     const V=e.verticalReactions.reduce((a,v)=>a+(v.x<=x+1e-7?v.r:0),0)-e.wheels.reduce((a,w)=>a+(w.x<=x+1e-7?w.p:0),0)-e.q*x;
     const flow=Math.abs(V)*cap.channelQ/(2*props.Ix)+E*Math.abs(s.lateralThird)*cap.channelHalfFirstMoment+E*Math.abs(s.warpingThird)*cap.channelHalfWarpBound;
     if(strength)result.cap!.longitudinalFlow=Math.max(result.cap!.longitudinalFlow,flow);
     else result.cap!.fatigueFlows[bin]=Math.max(result.cap!.fatigueFlows[bin],flow);
    }
    if(e.kind==='service'){peak('railDisplacement',Math.abs(s.v+z*s.twist),e,x);peak('twist',Math.abs(s.twist),e,x);}
    if(e.kind==='fatigue'){
     // Appendix 3.1 peak: this unfactored fatigue state plus the dead load, components superposed then summed in magnitude,
     // at each flange's extreme fibre and tips as the factored combined stress (the larger flange governs).
     const d=deadAt(bayIndex,x-start),Mt=Math.abs(M+deadMoment(x)),w=E*Math.abs(s.warpingCurvature+d.warpingCurvature);
     const lat=E*Math.abs(s.curvature+d.curvature)*props.Iy+Math.abs((M+deadMoment(x))*(s.twist+d.twist));
     const at=(k:'top'|'bottom')=>Mt/flangeS[k]+lat*flangeHalf[k]/props.Iy+(cap?w*flangeW[k]:w*props.h0*p.section.bf/4);
     const f=Math.max(at('top'),at('bottom'));
     if(f>(result.fatiguePeak?.value??0))result.fatiguePeak={value:f,x,id:e.id,combination:`${e.combination}, ${details.spectrum[bin]?.name??''} + D`};
    }
   }
   if(e.kind==='fatigue')for(let i=0;i<fatigue.length;i++){
    const f=detailInputs[i];if(f.x<start||f.x>end)continue;
    const s=r.at(f.x-start),y=f.point.startsWith('top')?props.h0/2:-props.h0/2,xEdge=f.point.endsWith('right')?p.section.bf/2:-p.section.bf/2;
    // Major-axis stress at the outer flange face; the sectorial coordinate uses the flange centroid distance h0/2.
    const points=cap?cap.fibres.filter(v=>(f.point.startsWith('top')?v.y>0:v.y<0)&&(f.point.endsWith('right')?v.x>0:v.x<0)):[{x:xEdge,y:Math.sign(y)*p.section.d/2,omega:xEdge*y}];
    const b=fatigue[i].bins[bin];
    for(const point of points){const stress=-moment(f.x)*point.y/props.Ix-E*s.curvature*point.x-E*s.warpingCurvature*point.omega;b.minimum=Math.min(b.minimum,stress);b.maximum=Math.max(b.maximum,stress);}
   }
  }
  // An adjacent existing girder bears on a continued end support, mirrored about the support centerline.
  for(const b of adjacent){
   const own=bearings.find(v=>b.end==='left'?v.bay===1&&v.end==='left':v.bay===p.spans.length&&v.end==='right')!;
   endActions.push({x:b.station,bay:b.end==='left'?0:p.spans.length+1,end:b.end==='left'?'right':'left',vertical:e.adjacentReactions?.find(v=>Math.abs(v.x-b.station)<1e-6)?.r??0,top:0,bottom:0,longitudinal:0,offset:-(own.center-b.station),existing:true});
  }
  // A wheel over a shared grid bears on the girder end on either side of the joint: both are bounded.
  const moved=joints.filter(v=>v.p>0),simple=p.system==='simple',Lbr=details.bearing.length;
  const splits=[{tag:'',ends:endActions},...(moved.length?[{tag:'-J',ends:endActions.map(v=>{const m=v.existing?undefined:moved.find(g=>g.bay===(v.end==='left'?v.bay:v.bay+1));return m?{...v,vertical:v.vertical+(v.end==='left'?-m.p:m.p)}:v;})}]:[])];
  // Concurrent girder end forces at a station. Independent bays deliver the longitudinal force at their own
  // locating (left) end. Traction acts either way; for a straddling crane each occupied bay receives the FULL
  // traction in a separate bounding scenario, avoiding an invented drive-wheel split. The crane stop force acts
  // only on a bay that carries a stop, with the crane on it, toward the stop. The bay carrying the force also
  // carries its end couple: its left end lifts and its right end presses down for a force toward the right, and
  // the reverse for the opposite sign. A continuous girder delivers it at its locating support.
  const actions=e.kind==='strength'&&e.axial?longitudinal.actions(e):[{bay:-1,sign:1}];
  const concurrent=(x:number)=>{
   const here=splits.map(s=>({tag:s.tag,ends:s.ends.filter(v=>Math.abs(v.x-x)<1e-6)})),out:{id:string;sign:number;couple:number;ends?:typeof endActions}[]=[];
   for(const [i,s] of here.entries()){
    if(i&&s.ends.every((v,j)=>v.vertical===here[0].ends[j].vertical))continue;
    for(const {bay,sign,rail} of actions){
     const couple=(v:{bay:number;end:'left'|'right';existing?:boolean})=>v.bay===bay&&!v.existing?(v.end==='left'?-1:1)*sign*(e.longitudinalCouple??0)/p.spans[v.bay-1]:0;
     out.push({id:simple?`${e.id}-${rail?'R':'T'}${bay}${s.tag}`:e.id,sign,couple:s.ends.reduce((a,v)=>a+couple(v),0),ends:simple?s.ends.map(v=>({...v,vertical:v.vertical+couple(v),longitudinal:v.bay===bay&&v.end==='left'?sign*e.axial:0})):undefined});
    }
   }
   return out;
  };
  // Longitudinal force delivered at a station by a concurrent set: its bays' locating ends, or the continuous girder's locating support.
  const delivered=(x:number,c:{sign:number;ends?:typeof endActions})=>c.ends?c.ends.reduce((a,v)=>a+v.longitudinal,0):e.kind==='strength'&&longitudinal.continuousAt(x)?c.sign*e.axial:0;
  // One whole concurrent set at a support: the girder end reactions (each at 0.8 of its bearing length from its
  // girder end), their seat moment, the locating bearing's longitudinal force and the flange lateral forces of all
  // girder ends at the grid. The bracket design force envelope tabulates these sets and the bracket checks take them.
  // A continuous girder bears centered on its interior grids. At a runway-end grid its girder end is on the grid and
  // its bearing runs inboard, the reaction at 0.8 of the bearing length from that end as at a simple-span end.
  // Simple spans take each girder end's own bearing (independentBearings): at a runway-end grid the girder end is on
  // the grid, or with endGridBearing 'centered' the bearing is centered on the support web (offset 0.3 L_bearing).
  const endBearingOffset=(x:number)=>simple?0:Math.abs(x-supports[0])<1e-6?seatOffset({end:'left',offset:Lbr/2},Lbr):Math.abs(x-supports.at(-1)!)<1e-6?seatOffset({end:'right',offset:-Lbr/2},Lbr):0;
  const supportSet=(x:number,c:ReturnType<typeof concurrent>[number]):SupportForceSet=>{
   const r=reactions.get(x)??{top:0,bottom:0},ends=c.ends??[],at=(v?:{x:number;r:number}[])=>v?.find(w=>Math.abs(w.x-x)<1e-6)?.r??0;
   const vertical=c.ends?ends.reduce((a,v)=>a+v.vertical,0):at(e.verticalReactions)+at(e.adjacentReactions)+c.couple+(e.deadFactor??0)*gridHardware(x);
   return {id:c.id,combination:e.combination,vertical,moment:c.ends?ends.reduce((a,v)=>a+v.vertical*seatOffset(v,Lbr),0):vertical*endBearingOffset(x),
    longitudinal:delivered(x,c),top:r.top,bottom:r.bottom,ends:ends.map(v=>({bay:v.bay,end:v.end,vertical:v.vertical,offset:seatOffset(v,Lbr),...(v.existing?{existing:true}:{})}))};
  };
  // The bracket takes the same concurrent sets, each girder reaction over the inner 0.4 of its bearing plate.
  // A bay carrying the force away from this support leaves its reactions unchanged: each distinct set once.
  // The seat also takes the locating bearing's longitudinal force and, through the bearing bolts, the bottom-flange
  // lateral force of the girder ends at the grid, at their bearings' mean offset along the runway.
  if(bracket||existingBracket||capCollector||rolledBracket||taperedHaunch)for(const x of supports){const distinct=new Set<string>();for(const c of concurrent(x)){
   const edge=endBearingOffset(x),f=supportSet(x,c),loads=f.ends.length?f.ends.map(v=>({vertical:v.vertical,offset:v.offset,length:.4*Lbr})):[edge?{vertical:f.vertical,offset:edge,length:.4*Lbr}:{vertical:f.vertical,offset:0}];
   // The bottom-flange force passes through the bearing bolts: at a continuous runway end, at the bearing's center.
   // The top-flange restraint force goes with the set: its moment about the seat is the support torque (welded rib brackets).
   const own=(c.ends??[]).filter(v=>!v.existing),horizontal={longitudinal:f.longitudinal,bottom:f.bottom,top:f.top,offset:own.length?own.reduce((a,v)=>a+v.offset,0)/own.length:Math.sign(edge)*Lbr/2};
   const key=[...loads.map(v=>v.vertical),horizontal.longitudinal].join();if(distinct.has(key))continue;distinct.add(key);
   // The same whole set at the same support recurs whenever the loads that reach it repeat (another crane elsewhere,
   // a combination with the same factors here): the collectors have already recorded everything it can set.
   const setKey=[e.kind,bin,x,...loads.flatMap(v=>[v.vertical,v.offset]),f.vertical,f.moment,f.longitudinal,f.top,f.bottom,horizontal.offset].join();if(observedSets.has(setKey))continue;observedSets.add(setKey);
   bracket?.observe(e.kind,f.id,x,loads,bin,horizontal);
   existingBracket?.observe(e.kind,f.id,x,loads,bin);
   capCollector?.observe(e.kind,x,f,bin);
   rolledBracket?.observe(e.kind,f.id,x,loads,bin,horizontal);
   taperedHaunch?.observe(e.kind,f.id,x,loads,bin,horizontal);
  }}
  if(e.kind==='strength'){
   // Top-flange restraint force of each girder end (the force on its own tie) and of all girder ends at a grid.
   for(const a of endActions)if(!a.existing&&Math.abs(a.top)>(result.demands.braceEnd??0)){result.demands.braceEnd=Math.abs(a.top);result.governing.braceEnd={id:e.id,combination:e.combination,x:a.x,value:Math.abs(a.top)};}
   for(const [x,r] of reactions){
    if(Math.max(Math.abs(r.top),Math.abs(r.bottom))>result.demands.brace)result.governing.brace={id:e.id,combination:e.combination,x,value:Math.max(Math.abs(r.top),Math.abs(r.bottom))};
    result.demands.brace=Math.max(result.demands.brace,Math.abs(r.top),Math.abs(r.bottom));
    const support=supports.indexOf(x);
    for(const c of concurrent(x)){
     const {id,sign,couple,ends}=c;
     const item:InterfaceAction={id,combination:e.combination,x,vertical:(e.verticalReactions.find(v=>Math.abs(v.x-x)<1e-6)?.r??0)+(e.adjacentReactions?.find(v=>Math.abs(v.x-x)<1e-6)?.r??0)+couple+(e.deadFactor??0)*gridHardware(x),top:r.top,bottom:r.bottom,longitudinal:delivered(x,{sign,ends}),torque:cap?r.top*topRestraint!+r.bottom*cap.bottomOffset:(r.top-r.bottom)*props.h0/2,cranes:e.cranes,lateralSign:e.lateralSign,controls:[],ends};
     if(ends)item.seatMoment=ends.reduce((sum,v)=>sum+v.vertical*v.offset,0);else if(endBearingOffset(x))item.seatMoment=item.vertical*Math.sign(endBearingOffset(x))*Lbr/2;
     if(support>=0)forces.add(support,supportSet(x,c));
     for(const component of ['vertical','top','bottom','longitudinal','torque'] as const)for(const dir of [-1,1]){
      const k=`${e.combination}:${x}:${component}:${dir}`,old=interfaceExtremes.get(k);
      if(!old||dir*item[component]>dir*old[component])interfaceExtremes.set(k,{...item,controls:[`${component} ${dir===1?'max':'min'}`]});
     }
     // Retain individual end-bearing extrema, with the OTHER end's
     // simultaneous force intact. Combined bracket maxima alone miss these.
     for(const end of ends??[])for(const dir of [-1,1]){
      const k=`${e.combination}:${x}:bay${end.bay}:${dir}`,old=interfaceExtremes.get(k),previous=old?.ends?.find(v=>v.bay===end.bay)?.vertical;
      if(previous===undefined||dir*end.vertical>dir*previous)interfaceExtremes.set(k,{...item,controls:[`${end.existing?'adjacent existing girder':`bay ${end.bay}`} bearing ${dir===1?'max':'min'}`]});
     }
     if(ends)for(const dir of [-1,1]){const k=`${e.combination}:${x}:seatMoment:${dir}`,old=interfaceExtremes.get(k);if(!old||dir*item.seatMoment!>dir*old.seatMoment!)interfaceExtremes.set(k,{...item,controls:[`seat eccentricity moment ${dir===1?'max':'min'}`]});}
    }
   }
   result.demands.endLongitudinal=Math.max(result.demands.endLongitudinal,e.axial);
   // Group every wheel in a conservative moving window at least as long as
   // the clip interval or 45-degree wheel-bearing patch. No load sharing credit.
   const window=Math.max(p.aist!.clipSpacing,2*(p.aist!.railDepth+p.section.tf));
   for(const w of e.wheels){const group=e.wheels.filter(v=>v.x>=w.x-1e-6&&v.x<=w.x+window+1e-6);result.demands.railLateral=Math.max(result.demands.railLateral,group.reduce((n,v)=>n+Math.abs(v.h),0));result.demands.railVertical=Math.max(result.demands.railVertical,group.reduce((n,v)=>n+v.p,0));}
  }
  if(e.kind==='service'){
   // Service side thrust (unfactored, single crane) of the same wheel group: for clips rated on an allowable basis.
   const window=Math.max(p.aist!.clipSpacing,2*(p.aist!.railDepth+p.section.tf));
   for(const w of e.wheels){const H=e.wheels.filter(v=>v.x>=w.x-1e-6&&v.x<=w.x+window+1e-6).reduce((n,v)=>n+Math.abs(v.h),0);result.demands.railLateralService=Math.max(result.demands.railLateralService??0,H);}
  }
  if(e.kind==='fatigue'){
   const window=Math.max(p.aist!.clipSpacing,2*(p.aist!.railDepth+p.section.tf));
   for(const w of e.wheels){
    const group=e.wheels.filter(v=>v.x>=w.x-1e-6&&v.x<=w.x+window+1e-6),P=group.reduce((n,v)=>n+v.p,0),H=group.reduce((n,v)=>n+Math.abs(v.h),0);
    result.demands.railFatigueVertical=Math.max(result.demands.railFatigueVertical,P);result.demands.railFatigueLateral=Math.max(result.demands.railFatigueLateral,H);
    const bound=result.railFatigueBins[bin];bound.vertical=Math.max(bound.vertical,P);bound.lateral=Math.max(bound.lateral,H);
   }
   for(const r of reactions.values()){braceFatigue.min=Math.min(braceFatigue.min,r.top,r.bottom);braceFatigue.max=Math.max(braceFatigue.max,r.top,r.bottom);}
   for(const a of endActions)if(!a.existing){braceEndFatigue.min=Math.min(braceEndFatigue.min,a.top);braceEndFatigue.max=Math.max(braceEndFatigue.max,a.top);}
   for(const r of e.verticalReactions){verticalFatigue.min=Math.min(verticalFatigue.min,r.r);verticalFatigue.max=Math.max(verticalFatigue.max,r.r);}
  }
 };
 const observe:RunwayCaseObserver=e=>{
  if(e.kind!=='fatigue'){evaluate(e);return;}
  for(let bin=0;bin<details.spectrum.length;bin++){
   const fraction=details.spectrum[bin].liftFraction;
   const wheels=e.cranes.flatMap(c=>p.cranes[c.index].wheels.map(w=>({x:c.origin+w.offset,p:w.unloaded+(c.loaded?fraction*(w.loaded/(p.cranes[c.index].includesImpact?1+p.cranes[c.index].impact:1)-w.unloaded):0)}))).filter(w=>w.x>=0&&w.x<=L);
   const loads=e.wheels.map((w,i)=>({...w,p:wheels[i].p}));
   evaluate({...e,wheels:loads,verticalReactions:vertical.evaluate(loads.map(w=>({x:w.x,p:w.p}))).reactions},bin);
  }
 };
 const finish=()=>{
  const deadBounds=detailInputs.map(f=>Math.abs(deadMoment(f.x))/props.Sx);
  for(const [bay,[start,end]] of groups.entries()){
   const deadT=deadBay(bay);
   detailInputs.forEach((f,i)=>{if(f.x>=start&&f.x<=end){const v=deadT.at(f.x-start);deadBounds[i]+=E*Math.abs(v.curvature)*(cap?p.section.capWidth:p.section.bf)/2+E*Math.abs(v.warpingCurvature)*(cap?.omegaMax??props.h0*p.section.bf/4);}});
  }
  // TR13 §3.10.2.3: Cds + liftFraction*Cvs + 0.5Css, without impact or
  // strength factors. Bound each bin by its own wheel-group force envelope.
  // The clip base welds of each bin: the clip force is one-way (the rail pushes the bearing clip outward and lifts the
  // hold-down clip's nose, never the reverse), so the weld stress runs from zero to the bin value at each passage. The
  // clip forces act across the runway and load the clip welds, not the girder top plate along its span: the RC register
  // points carry the girder's own stress range at the clip station (A-3.1 item 7.1), without a local addition.
  for(const bound of result.railFatigueBins)bound.weldStress=railClipResponse(p,bound.lateral).weldStress;
  if(cap)for(const f of fatigue)if(f.id.startsWith('CE'))for(const bin of f.bins){const traction=Math.max(...p.cranes.map(c=>c.longitudinal))/props.A;bin.minimum-=traction;bin.maximum+=traction;}
  result.braceForce=result.demands.brace;
  result.demands.braceFatigue=braceFatigue.max-braceFatigue.min;
  if(p.system==='simple')result.demands.braceEndFatigue=braceEndFatigue.max-braceEndFatigue.min;
  result.demands.verticalFatigue=verticalFatigue.max-verticalFatigue.min;
  if(flangeTieGeometry(p)){const localRange=flangeTieResponse(p,result.demands.braceFatigue).flange;for(const f of fatigue)if(f.id.startsWith('SA'))for(const b of f.bins){b.minimum-=localRange/2;b.maximum+=localRange/2;}}

  for(const [i,f] of fatigue.entries()){for(const b of f.bins){b.range=b.maximum-b.minimum;Object.assign(b,fatigueSpectrumBin(f.category as keyof typeof constants,b.range,b.cycles));}f.range=Math.max(...f.bins.map(b=>b.range));f.damage=f.bins.reduce((a,b)=>a+b.damage,0);f.peak=deadBounds[i]+Math.max(...f.bins.flatMap(b=>[Math.abs(b.minimum),Math.abs(b.maximum)]));}
  const grouped=new Map<string,InterfaceAction>();
  for(const v of interfaceExtremes.values()){const key=`${v.x}:${v.id}:${v.longitudinal}`;const old=grouped.get(key);if(old)old.controls.push(...v.controls);else grouped.set(key,{...v,controls:[...v.controls]});}
  result.interfaces=[...grouped.values()].sort((a,b)=>a.x-b.x||a.combination.localeCompare(b.combination));
  result.bracketForces=forces.result();
  if(bracket)result.bracket=bracket.result;
  if(existingBracket)result.existingBracket=existingBracket.result;
  if(rolledBracket)result.rolledBracket=rolledBracket.result;
  if(taperedHaunch)result.taperedHaunch=taperedHaunch.result;
  if(capCollector)result.columnCap=capCollector.finish();
  // Not serialized: calculate() keeps only the cases a printed result names (caseIndex).
  Object.defineProperty(result,'caseRegistry',{value:registry,enumerable:false});
  return result;
 };
 return {observe,finish};
}

import {adjacentBays} from './continuation';
import {flexureCurves} from './loadHeightFlexure';
import {flangeTieGeometry} from './tieGeometry';
import {flangeTieResponse} from './flangeTieDesign';
import {cappedMechanics} from './cappedMechanics';
import {createBracketCollector} from './bracketDesign';
import {createSupportForceEnvelope,seatOffset} from './bracketForces';
import {createExistingBracketCollector} from './existingBracket';
import { LateralTorsionBeam } from './lateralTorsion';
import { beamSystem,momentAt } from './beam';
import { boltProperties,plateMember,compressionResistance } from './connectionStrength';
import type { RunwayCaseEvent,RunwayCaseObserver } from './designAnalysis';
import type { ProjectInput,Properties } from './types';
import type { FatigueDetailResult,InterfaceAction,RunwayDetailResults } from './runwayDetails';
import { railKeeperResponse } from './railKeeper';
import {tractionBays,railKeeperStations,girderSegments,independentBearings} from './simpleSupports';
import {activeEndStop,stopBoltRows,stopEnds} from './endStopInputs';
import {activeEndBearing,locatingSupport} from './endBearingInputs';
import {craneCombinations} from './aistLoads';
import {runwayEnds} from './continuation';

export function braceSystem(p:ProjectInput){
 const d=p.details!,b=d.brace,m=d.material,bolt=boltProperties(b.connection.grade,b.connection.diameter),holes=2*(bolt.hole+1.5875);
 const plate=plateMember(b.width,b.thickness,b.length,p.section.E,m.Fy,m.Fu,b.width-holes,p.method),cos=b.reach/b.length;
 // Each bar buckles out of plane between the innermost bolt rows, fixed in the girder bolt group and
 // pinned at the column end: K = 0.8 (AISC Commentary Table C-A-7.1 recommended value).
 const between=b.length-2*(b.connection.edge+(b.connection.rows-1)*b.connection.pitch),bucklingLength=.8*Math.max(between,b.thickness);
 const member={...plate,bucklingLength,compression:compressionResistance(plate.A,plate.r,bucklingLength,p.section.E,m.Fy,p.method)};
 // Two flat bars in parallel, two end connections in series. The connection
 // model includes gusset axial strain and conservative bolt shear deformation;
 // no stiffness from the excluded supporting building is inferred.
 const n=2*b.connection.rows,G=p.section.E/2.6,grip=2*b.thickness+b.gussetThickness;
 const plateK=p.section.E*b.gussetThickness*(b.connection.gauge+2*b.connection.edge)/b.connectionLength;
 const boltK=n*2*G*bolt.area/grip;
 const weldArea=2*b.connection.weldLength*b.connection.weldSize/Math.sqrt(2);
 const weldK=G*weldArea/(2*b.connection.weldSize);
 const connectionK=1/(1/plateK+1/boltK+1/weldK);
 const localCompliance=flangeTieGeometry(p)?flangeTieResponse(p,1).compliance:0;
 const stiffness=cos*cos/(1/(2*member.stiffness)+2/connectionK+localCompliance);
 return {member,cos,connectionK,stiffness,capacity:2*Math.min(member.tension,member.compression.capacity)*cos};
}
const mergeStations=(xs:number[])=>[...xs].sort((a,b)=>a-b).filter((x,i,s)=>!i||x-s[i-1]>1e-6);
/** Each flange is restrained only at its own brace stations; both flanges are tied at supports. */
export function flangeRestraintStations(p:ProjectInput){
 const supports=[0];for(const l of p.spans)supports.push(supports.at(-1)!+l);
 const L=supports.at(-1)!;
 const series=(spacing:number)=>{const s=[...supports];for(let i=1;i*spacing<L-1e-6;i++)s.push(i*spacing);return mergeStations(s);};
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
const constants={A:[25,165],B:[12,110],B1:[6.1,83],C:[4.4,69],D:[2.2,48],E:[1.1,31],E1:[.39,18]} as const;
export function fatigueSpectrumBin(category:keyof typeof constants,range:number,cycles:number){
 const [cf]=constants[category];
 const allowable=6900*(cf/cycles)**(1/3);
 // Palmgren–Miner cumulative damage using the AISC cubic S-N curve. Below
 // the threshold receives damage too: no endurance-limit credit for a mixed spectrum.
 const damage=range===0?0:cycles/(cf*(6900/range)**3);
 return {allowable,damage};
}
export function automaticFatigueDetails(p:ProjectInput){
 const d=p.details!,L=p.spans.reduce((s,v)=>s+v,0),list=[...d.fatigueDetails];
 const tie=flangeTieGeometry(p);
 // Saddle welded across the flange: AISC Table A-3.1 item 7.2 by its length a along the stress and thickness b.
 const sa=tie?.attachment,inch=25.4,saddleCategory=!sa?'E1':sa.saddleLength<2*inch?'C':sa.saddleLength<=Math.min(12*sa.saddleThickness,4*inch)?'D':sa.saddleThickness<=.8*inch?'E':'E1';
 if(tie)for(const [i,v] of tie.stations.entries())for(const sign of [-1,1])for(const point of tie.sides.map(side=>side>0?'top-right' as const:'bottom-right' as const))list.push({id:`SA${i}-${sign}-${point}`,name:`Flange saddle ${i+1} edge ${sign} / ${point}`,x:v.tieX+sign*tie.attachment.saddleLength/2,point,category:saddleCategory,reference:`AISC Table A-3.1 item 7.2, Category ${saddleCategory==='E1'?'E′':saddleCategory} for a ${(tie.attachment.saddleLength/inch).toFixed(2)} in attachment; global stress plus local flange strip bending`});
 // End stop bolt holes through the top flange near each runway end: pretensioned bolted joint, net section.
 const stop=activeEndStop(p);
 if(stop)for(const [end,x0,dir] of ([['left',0,1],['right',L,-1]] as const).filter(([end])=>stopEnds(p).includes(end)))for(const [r,row] of stopBoltRows(stop).entries())for(const side of ['left','right'] as const)list.push({id:`SH-${end}${r}-${side}`,name:`End stop holes, ${end} runway end, ${r?'front':'back'} row · ${side}`,x:x0+dir*row,point:`top-${side}`,category:'B',reference:'AISC Table A-3.1 item 2.2 · net section at pretensioned bolts; flange tip stress bounds the hole line'});
 const category=d.rail.clipWidth<50?'C':d.rail.clipWidth<=Math.min(12*d.rail.clipThickness,100)?'D':d.rail.clipThickness<=20?'E':'E1';
 for(const [i,x] of railKeeperStations(p).entries()){
  for(const side of ['left','right'] as const)list.push({id:`RC${i}-${side}`,name:`Rail keeper ${i+1} · ${side}`,x,point:`top-${side}`,category,reference:'AISC Table A-3.1, 7.1 · attachment length/thickness from keeper geometry'});
 }
 if(p.section.kind==='cap'){
  // Continuous longitudinal welds: Category B base metal. End terminations:
  // conservative Category E; evaluated at both ends of each physical segment.
  const positions=list.filter(f=>f.id.startsWith('RC')&&f.id.endsWith('left')).map(f=>f.x);
  for(const [i,x] of positions.entries())for(const side of ['left','right'] as const)list.push({id:`CW${i}-${side}`,name:`Cap weld base metal ${i+1} · ${side}`,x,point:`top-${side}`,category:'B',reference:'AISC Table A-3.1 item 3.1; continuous longitudinal weld'});
  const ends=p.system==='continuous'?[0,L]:girderSegments(p).flatMap(m=>[m.start,m.end]);
  // The cap ends like a cover plate wider than the flange, with longitudinal welds only: Table A-3.1 item 3.7, E'.
  const capEnd='E1';
  for(const [i,x] of ends.entries())for(const side of ['left','right'] as const)list.push({id:`CE${i}-${side}`,name:`Cap end termination ${i+1} · ${side}`,x,point:`top-${side}`,category:capEnd,reference:'AISC Table A-3.1 item 3.7: end of a welded cover plate wider than the flange, no weld across the end, Category E′'});
 }
 return list;
}
/**
 * Where the girder's longitudinal force reaches the supports. Simple bays: traction at the locating (left) end of
 * each occupied bay, either way; the crane stop force (AIST stop combinations) only on an end bay that carries a
 * stop, with the crane on it, toward the stop: bay 1 for a stop at the left runway end, the last bay for one at
 * the right end, which that bay delivers to its own locating end. A continuous girder with bolted bearings locates
 * at one support; otherwise the runway ends take it.
 */
export function longitudinalPaths(p:ProjectInput,supports:number[]){
 const stops=new Set(craneCombinations(p.method).filter(c=>c.bumper>0).map(c=>`${p.method} ${c.id}`));
 const ends=stopEnds(p).length?stopEnds(p):runwayEnds(p),stopBays=[...(ends.includes('left')?[{bay:1,sign:-1}]:[]),...(ends.includes('right')?[{bay:p.spans.length,sign:1}]:[])];
 const L=supports.at(-1)!,locating=p.system==='continuous'&&activeEndBearing(p)?supports[locatingSupport(p)]:undefined;
 return {
  actions(e:RunwayCaseEvent):{bay:number;sign:number}[]{
   const stop=stops.has(e.combination);
   if(p.system!=='simple')return stop?stopBays.map(v=>({bay:-1,sign:v.sign})):[{bay:-1,sign:-1},{bay:-1,sign:1}];
   const occupied=tractionBays(p,e);
   if(!stop)return occupied.flatMap(bay=>[-1,1].map(sign=>({bay,sign})));
   const struck=stopBays.filter(v=>occupied.includes(v.bay));
   return struck.length?struck:[{bay:-1,sign:1}];
  },
  continuousAt:(x:number)=>locating===undefined?Math.abs(x)<1e-6||Math.abs(x-L)<1e-6:Math.abs(x-locating)<1e-6,
  stopBays
 };
}
export function createDetailCollector(p:ProjectInput,props:Properties,subdivisions:number){
 const bracket=createBracketCollector(p);
 const existingBracket=createExistingBracketCollector(p);
 const details=p.details!,brace=braceSystem(p),E=p.section.E,G=E/2.6,L=p.spans.reduce((s,l)=>s+l,0),cap=cappedMechanics(p.section),z=cap?p.section.d+p.section.capTw+p.railHeight-cap.shearCenter:p.railHeight+p.section.d/2,allStations=restraintStations(p),flanges=flangeRestraintStations(p),restrains=(xs:number[],x:number)=>xs.some(v=>Math.abs(v-x)<=1e-6);
 const supports=[0];for(const l of p.spans)supports.push(supports.at(-1)!+l);
 const groups=p.system==='continuous'?[[0,L]]:p.spans.map((_,i)=>[supports[i],supports[i+1]]);
 const longitudinal=longitudinalPaths(p,supports);
 // Bolted end bearings restrain the bottom flange at each support through four bolts into the seat: bolt shear
 // deformation over the flange, bearing plate and seat grip. Otherwise the bottom flange tie is the brace pair.
 const eb=activeEndBearing(p),ebBolt=eb?boltProperties(eb.bolts.grade,eb.bolts.diameter):undefined;
 const ebK=eb&&ebBolt?4*G*ebBolt.area/(p.section.tf+details.bearing.thickness+(details.bracket?.enabled?details.bracket.seatThickness:details.bearing.thickness)):0;
 const bottomK=(x:number)=>ebK&&supports.some(v=>Math.abs(v-x)<=1e-6)?ebK:brace.stiffness;
 const bearings=independentBearings(p),adjacent=adjacentBays(p);
 const vertical=beamSystem(p.spans,E*props.Ix,p.system,undefined,subdivisions);
 const detailInputs=automaticFatigueDetails(p);
 const fatigue:FatigueDetailResult[]=detailInputs.map(f=>({id:f.id,name:f.name,x:f.x,category:f.category,reference:f.reference,bins:details.spectrum.map(b=>({name:b.name,cycles:b.cycles,minimum:0,maximum:0,range:0,allowable:0,damage:0})),damage:0,range:0,peak:0}));
 const result:RunwayDetailResults={normalStress:0,shearStress:0,railDisplacement:0,twist:0,criticalMultiplier:128,residual:0,meshChange:0,travelChange:0,cases:0,braceStiffness:brace.stiffness,braceForce:0,fatigue,interfaces:[],railFatigueBins:details.spectrum.map(b=>({name:b.name,cycles:b.cycles,vertical:0,lateral:0,flangeStress:0,plateStress:0,weldStress:0})),demands:{brace:0,braceFatigue:0,verticalFatigue:0,endLongitudinal:0,railLateral:0,railVertical:0,railFatigueVertical:0,railFatigueLateral:0},governing:{}};
 if(cap)result.cap={longitudinalFlow:0,fatigueFlows:details.spectrum.map(()=>0)};
 const curves=flexureCurves(p,props),loadHeight=result.loadHeight={utilization:0,demand:0,capacity:0,length:p.unbracedLength,critical:Infinity,id:'',combination:'',x:0};
 const mechanics=cap?{Iy:cap.Iy,topOffset:cap.topOffset,bottomOffset:cap.bottomOffset,centroidOffset:cap.centroidOffset,monosymmetry:cap.beta,polarRadiusSquared:cap.polarRadiusSquared}:{};
 const interfaceExtremes=new Map<string,InterfaceAction>(),seen=new Set<string>(),bayStates=new Map<string,{x:number;top:number;bottom:number}[]>(),forces=createSupportForceEnvelope(supports);
 const snap=(x:number)=>supports.find(v=>Math.abs(v-x)<1e-6)??x;
 const braceFatigue={min:0,max:0},verticalFatigue={min:0,max:0};
 function peak(key:'normalStress'|'shearStress'|'railDisplacement'|'twist',value:number,e:RunwayCaseEvent,x:number){if(value>result[key]){result[key]=value;result.governing[key]={id:e.id,combination:e.combination,x,value};}}
 const evaluate=(e:RunwayCaseEvent,bin=-1)=>{
  const key=JSON.stringify([e.kind,bin,e.wheels,e.q,e.railTorquePerLength,e.axial,e.horizontalCrane,e.cranes]);
  if(seen.has(key))return;seen.add(key);result.cases++;
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
   const beam=new LateralTorsionBeam({length:end-start,E:E*stiffnessFactor,G:G*stiffnessFactor,Iy:props.Iy,J:props.J,Cw:props.Cw,h0:props.h0,polarRadiusSquared:(props.Ix+props.Iy)/props.A,subdivisions,...mechanics,
    loads:wheels.map(w=>({x:Math.max(0,w.x-start),lateral:w.h,torque:w.p*p.railEccentricity+w.h*z,vertical:w.p,height:z})),
    restraints:stations.map(x=>({x:x-start,top:restrains(flanges.top,x)?brace.stiffness*stiffnessFactor:0,bottom:restrains(flanges.bottom,x)?bottomK(x)*stiffnessFactor:0})),
    axial:strength?e.axial:0,moment:strength?x=>moment(x+start):undefined,
    distributedTorque:e.railTorquePerLength,
    // Apply the full UDL at rail height for the stability test conservatively.
    distributedVertical:strength?e.q:0,distributedHeight:z
   });
   let ownMultiplier:number|undefined;
   if(strength&&!beam.isStable(result.criticalMultiplier)){
    const critical=beam.criticalMultiplier(result.criticalMultiplier);
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
    // Load-height LTB in the inelastic range: the elastic critical moment of this case (wheels at the rail head,
    // UDL at rail height, axial load, modeled restraints and moment gradient) is Mcr = lambda M / 0.8 because the
    // eigen model carries 0.8 stiffness. It enters F2/F5 through the length L_e with Mcr(L_e) = Mcr, never
    // shorter than Lb, so a case is screened out when it is stable at the multiplier that would just reach the
    // governing utilization so far.
    let Mx=0,xm=start;for(const st of r.stations){const m=moment(st.x+start);if(Math.abs(m)>Math.abs(Mx)){Mx=m;xm=st.x+start;}}
    const c=Mx>=0?curves.positive:curves.negative,M=Math.abs(Mx);
    if(M>0){
     const record=(u:number,capacity:number,length:number,critical:number)=>{if(u>loadHeight.utilization)Object.assign(loadHeight,{utilization:u,demand:M,capacity,length,critical,id:e.id,combination:e.combination,x:xm});};
     record(M/c.base,c.base,p.unbracedLength,Infinity);
     // This case's multiplier is at least the least one found so far, which bounds its equivalent length.
     const bound=M/c.lowerBound(Math.max(p.unbracedLength,c.length(result.criticalMultiplier*M/.8)));
     const threshold=.8*c.mcr(c.lengthFor(M/loadHeight.utilization))/M;
     if(bound>loadHeight.utilization&&!beam.isStable(threshold)){
      let lambda=ownMultiplier;
      if(lambda===undefined){let lo=Math.min(result.criticalMultiplier,threshold),hi=threshold;if(!beam.isStable(lo))lo=0;for(let i=0;i<30;i++){const mid=(lo+hi)/2;if(beam.isStable(mid))lo=mid;else hi=mid;}lambda=lo;}
      const critical=lambda*M/.8,length=Math.max(p.unbracedLength,c.length(critical)),capacity=c.available(length);
      record(M/capacity,capacity,length,critical);
     }
    }
   }
   restraintForces=r.restraints.map(v=>({x:v.x,top:v.top,bottom:v.bottom}));bayStates.set(bayKey,restraintForces);
   }
   }
   if(p.system==='simple')for(const [endName,x] of [['left',start],['right',end]] as const){
    const lateral=restraintForces.find(re=>Math.abs(re.x-(x-start))<1e-6)!;
    const vertical=e.q*(end-start)/2+wheels.reduce((sum,w)=>sum+w.p*(endName==='left'?(end-w.x):(w.x-start))/(end-start),0);
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
     const normal=Math.abs(e.axial)/props.A+Math.abs(M)/props.Sx+E*Math.abs(s.curvature)*(cap?p.section.capWidth:p.section.bf)/2+Math.abs(M*s.twist)/props.Sy+(cap?E*Math.abs(s.warpingCurvature)*cap.omegaMax:warping);
     peak('normalStress',normal,e,x);
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
    for(const {bay,sign} of actions){
     const couple=(v:{bay:number;end:'left'|'right';existing?:boolean})=>v.bay===bay&&!v.existing?(v.end==='left'?-1:1)*sign*(e.longitudinalCouple??0)/p.spans[v.bay-1]:0;
     out.push({id:simple?`${e.id}-T${bay}${s.tag}`:e.id,sign,couple:s.ends.reduce((a,v)=>a+couple(v),0),ends:simple?s.ends.map(v=>({...v,vertical:v.vertical+couple(v),longitudinal:v.bay===bay&&v.end==='left'?sign*e.axial:0})):undefined});
    }
   }
   return out;
  };
  // Longitudinal force delivered at a station by a concurrent set: its bays' locating ends, or the continuous girder's locating support.
  const delivered=(x:number,c:{sign:number;ends?:typeof endActions})=>c.ends?c.ends.reduce((a,v)=>a+v.longitudinal,0):e.kind==='strength'&&longitudinal.continuousAt(x)?c.sign*e.axial:0;
  // The bracket takes the same concurrent sets as the support force envelope, each girder reaction over the
  // inner 0.4 of its bearing plate.
  // A bay carrying the force away from this support leaves its reactions unchanged: each distinct set once.
  // The seat also takes the locating bearing's longitudinal force and, through the bearing bolts, the bottom-flange
  // lateral force of the girder ends at the grid, at their bearings' mean offset along the runway.
  if(bracket||existingBracket)for(const x of supports){const distinct=new Set<string>();for(const c of concurrent(x)){
   const loads=c.ends?c.ends.map(v=>({vertical:v.vertical,offset:seatOffset(v,Lbr),length:.4*Lbr})):[{vertical:e.verticalReactions.find(v=>Math.abs(v.x-x)<1e-6)?.r??0,offset:0}];
   const own=(c.ends??[]).filter(v=>!v.existing),horizontal={longitudinal:delivered(x,c),bottom:reactions.get(x)?.bottom??0,offset:own.length?own.reduce((a,v)=>a+v.offset,0)/own.length:0};
   const key=[...loads.map(v=>v.vertical),horizontal.longitudinal].join();if(distinct.has(key))continue;distinct.add(key);
   bracket?.observe(e.kind,c.id,x,loads,bin,horizontal);
   existingBracket?.observe(e.kind,c.id,x,loads,bin);
  }}
  if(e.kind==='strength'){
   for(const [x,r] of reactions){
    result.demands.brace=Math.max(result.demands.brace,Math.abs(r.top),Math.abs(r.bottom));
    const support=supports.indexOf(x);
    for(const {id,sign,couple,ends} of concurrent(x)){
     const item:InterfaceAction={id,combination:e.combination,x,vertical:(e.verticalReactions.find(v=>Math.abs(v.x-x)<1e-6)?.r??0)+(e.adjacentReactions?.find(v=>Math.abs(v.x-x)<1e-6)?.r??0)+couple,top:r.top,bottom:r.bottom,longitudinal:delivered(x,{sign,ends}),torque:cap?r.top*cap.topOffset+r.bottom*cap.bottomOffset:(r.top-r.bottom)*props.h0/2,cranes:e.cranes,lateralSign:e.lateralSign,controls:[],ends};
     if(ends)item.seatMoment=ends.reduce((sum,v)=>sum+v.vertical*v.offset,0);
     if(support>=0)forces.add(support,{id,combination:e.combination,vertical:ends?ends.reduce((sum,v)=>sum+v.vertical,0):item.vertical,moment:ends?ends.reduce((sum,v)=>sum+v.vertical*seatOffset(v,Lbr),0):0,longitudinal:item.longitudinal,top:r.top,bottom:r.bottom,ends:(ends??[]).map(v=>({bay:v.bay,end:v.end,vertical:v.vertical,offset:seatOffset(v,Lbr),...(v.existing?{existing:true}:{})}))});
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
  if(e.kind==='fatigue'){
   const window=Math.max(p.aist!.clipSpacing,2*(p.aist!.railDepth+p.section.tf));
   for(const w of e.wheels){
    const group=e.wheels.filter(v=>v.x>=w.x-1e-6&&v.x<=w.x+window+1e-6),P=group.reduce((n,v)=>n+v.p,0),H=group.reduce((n,v)=>n+Math.abs(v.h),0);
    result.demands.railFatigueVertical=Math.max(result.demands.railFatigueVertical,P);result.demands.railFatigueLateral=Math.max(result.demands.railFatigueLateral,H);
    const bound=result.railFatigueBins[bin];bound.vertical=Math.max(bound.vertical,P);bound.lateral=Math.max(bound.lateral,H);
   }
   for(const r of reactions.values()){braceFatigue.min=Math.min(braceFatigue.min,r.top,r.bottom);braceFatigue.max=Math.max(braceFatigue.max,r.top,r.bottom);}
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
  const q=p.deadLoad+p.railWeight+props.weight+(p.aist?.liveLoad??0);
  const dead=vertical.evaluate([],q);
  const deadBounds=detailInputs.map(f=>Math.abs(momentAt(f.x,dead.reactions,[],q))/props.Sx);
  for(const [start,end] of groups){
   const beam=new LateralTorsionBeam({length:end-start,E,G,Iy:props.Iy,J:props.J,Cw:props.Cw,h0:props.h0,polarRadiusSquared:(props.Ix+props.Iy)/props.A,subdivisions,...mechanics,
    restraints:allStations.filter(x=>x>=start-1e-6&&x<=end+1e-6).map(x=>({x:x-start,top:restrains(flanges.top,x)?brace.stiffness:0,bottom:restrains(flanges.bottom,x)?bottomK(x):0})),
    loads:[],distributedTorque:p.railWeight*p.railEccentricity});
   const deadT=beam.solve();
   detailInputs.forEach((f,i)=>{if(f.x>=start&&f.x<=end){const v=deadT.at(f.x-start);deadBounds[i]+=E*Math.abs(v.curvature)*(cap?p.section.capWidth:p.section.bf)/2+E*Math.abs(v.warpingCurvature)*(cap?.omegaMax??props.h0*p.section.bf/4);}});
  }
  // TR13 §3.10.2.3: Cds + liftFraction*Cvs + 0.5Css, without impact or
  // strength factors. Bound each bin by its own wheel-group force envelope.
  // Full local reversal and independent global/local superposition remain
  // conservative; no position coincidence, load sharing or endurance credit.
  for(const bound of result.railFatigueBins){
   const local=railKeeperResponse(details.rail,p.aist!.railDepth,p.railEccentricity,cap?p.section.capTw:p.section.tf,bound.vertical,bound.lateral);
   bound.flangeStress=local.flangeStress;bound.plateStress=local.plateStress;bound.weldStress=local.weldStress;
  }
  for(const f of fatigue)if(f.id.startsWith('RC'))for(const [i,bin] of f.bins.entries()){
   const local=result.railFatigueBins[i].flangeStress;bin.minimum-=local;bin.maximum+=local;
  }
  if(cap)for(const f of fatigue)if(f.id.startsWith('CE'))for(const bin of f.bins){const traction=Math.max(...p.cranes.map(c=>c.longitudinal))/props.A;bin.minimum-=traction;bin.maximum+=traction;}
  result.braceForce=result.demands.brace;
  result.demands.braceFatigue=braceFatigue.max-braceFatigue.min;
  result.demands.verticalFatigue=verticalFatigue.max-verticalFatigue.min;
  if(flangeTieGeometry(p)){const localRange=flangeTieResponse(p,result.demands.braceFatigue).flange;for(const f of fatigue)if(f.id.startsWith('SA'))for(const b of f.bins){b.minimum-=localRange/2;b.maximum+=localRange/2;}}

  for(const [i,f] of fatigue.entries()){for(const b of f.bins){b.range=b.maximum-b.minimum;Object.assign(b,fatigueSpectrumBin(f.category as keyof typeof constants,b.range,b.cycles));}f.range=Math.max(...f.bins.map(b=>b.range));f.damage=f.bins.reduce((a,b)=>a+b.damage,0);f.peak=deadBounds[i]+Math.max(...f.bins.flatMap(b=>[Math.abs(b.minimum),Math.abs(b.maximum)]));}
  const grouped=new Map<string,InterfaceAction>();
  for(const v of interfaceExtremes.values()){const key=`${v.x}:${v.id}:${v.longitudinal}`;const old=grouped.get(key);if(old)old.controls.push(...v.controls);else grouped.set(key,{...v,controls:[...v.controls]});}
  result.interfaces=[...grouped.values()].sort((a,b)=>a.x-b.x||a.combination.localeCompare(b.combination));
  result.bracketForces=forces.result();
  if(bracket)result.bracket=bracket.result;
  if(existingBracket)result.existingBracket=existingBracket.result;
  return result;
 };
 return {observe,finish};
}

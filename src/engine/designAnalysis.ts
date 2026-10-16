import {cranePositions,pairs,type CranePosition} from './cranePositions';
import {girderDeadLoad,newSteelTakeoff} from './newSteel';
import { beamSystem, momentAt, type BeamResult } from './beam';
import { craneCombinations, emptyAistInputs, craneDesignMinimum } from './aistLoads';
import { interaction, type GirderStrength } from './aiscStrength';
import type { ProjectInput, Properties, DesignAnalysis, DesignCaseSummary } from './types';
import {cappedElasticProperties} from './capChannel';
import {railClipStations,girderSegments} from './simpleSupports';
import {adjacentReactions} from './continuation';
import {railTopAboveSteel} from './railSeat';
import {craneAtStop} from './craneTravel';
import {runwaySiteSeismic,seismicCraneCombinations} from './columnSupport';

const abs=(xs:number[])=>Math.max(0,...xs.map(Math.abs));
export interface RunwayCaseEvent {
 kind:'strength'|'fatigue'|'service'; id:string; combination:string;
 cranes:{index:number;origin:number;loaded:boolean}[]; horizontalCrane:number; lateralSign:number;
 wheels:{x:number;p:number;h:number}[]; q:number; railTorquePerLength:number; axial:number;
 verticalReactions:{x:number;r:number}[];
 /** Reactions of adjacent existing girders at the modeled end supports, simultaneous with this case. */
 adjacentReactions?:{x:number;r:number}[];
 /** Strength cases: the longitudinal force times its height above the girder bearing (traction at the rail head, bumper above it). */
 longitudinalCouple?:number;
 /** Strength cases: the dead-load factor, for the girder-end hardware on the seats (newSteelTakeoff), which is not in verticalReactions. */
 deadFactor?:number;
 /** Crane stop combinations: the runway end whose stop the crane is against (craneAtStop). */
 stop?:'left'|'right';
 /** The number of later cases identical to this one but for their cranes marked loaded (a combination without a
  * lifted-load factor gives every load mask the loads of the first): they are numbered, not observed. */
 repeats?:number;
}
export type RunwayCaseObserver=(event:RunwayCaseEvent)=>void;
export interface DesignAnalysisOptions {
 /** false: only the load cases go to the observer (a detailed run); the envelope of the returned analysis is not
  * computed and stays zero. The cases, their order and their ids are the same either way. */
 envelope?:boolean;
 /** The same envelope search (project, section, strength and mesh) at fewer travel steps, for a travel refinement:
  * the states whose crane positions all recur here unchanged are its states, so only the others are evaluated and
  * the envelope values (maxima and minima, exact) are merged with it. Such a result serves the refinement comparison
  * only: its governing records, combination records and case count combine the two searches. Without an observer. */
 previous?:DesignAnalysis;
}
/** The search behind an envelope result, for options.previous. */
const searches=new WeakMap<DesignAnalysis,{p:ProjectInput;props:Properties;strength:GirderStrength;mesh:number;positions:CranePosition[][]}>();
const positionKey=(v:CranePosition)=>`${v.origin}|${v.after}|${v.before}|${v.station}|${v.coarse}|${v.sparse}`;
/** A search beyond this many strength cases stops with an error instead of running for hours. */
export const designCaseLimit=4000000;

type Wheel=ProjectInput['cranes'][number]['wheels'][number]&{lateral:number;x:number;static:number};
type Reactions=BeamResult['reactions'];
/** The vertical responses of one crane position: all a load case needs (reactions by load type, adjacent bays). */
interface VerticalResponse {wheels:Wheel[];impact:number;adjacent:{vd:number[];vl:number[];vi:number[]};beyond:boolean;
 vd:{reactions:Reactions;rotation:number[]};vl:{reactions:Reactions;rotation:number[]};vi:{reactions:Reactions;rotation:number[]};vs:{reactions:Reactions;rotation:number[];displacement:number[]};eq:number}
/** The flange responses and moment bases of one crane position, for the design envelope. */
interface EnvelopeResponse {td:{reactions:Reactions;displacement:number[]};tl:{reactions:Reactions;displacement:number[]};ti:{reactions:Reactions};th:{reactions:Reactions;displacement:number[]};
 bd:{reactions:Reactions};bl:{reactions:Reactions};bi:{reactions:Reactions};bh:{reactions:Reactions};
 moments:Record<'vd'|'vl'|'vi'|'td'|'tl'|'ti'|'th'|'bd'|'bl'|'bi'|'bh',number[]>;fatigueV:number[];fatigueT:number[];fatigueB:number[];eq:number}

/**
 * The crane-position responses of the runwayDesignAnalysis calls of one calculation (withDesignCache), by project,
 * mesh, crane and origin: the travel and mesh refinements, the detailed runs and the H1 re-run revisit the same
 * positions. The vertical responses are kept for every mesh; the flange responses and moment bases only for the mesh
 * last used, which bounds the memory.
 */
interface ResponseCache {vertical:Map<string,VerticalResponse>;envelope:Map<string,EnvelopeResponse>}
let scope:{caches:Map<string,ResponseCache>;envelopeKey?:string}|undefined;
/** Runs f with the crane-position responses shared by its runwayDesignAnalysis calls; nothing is kept after f returns. */
export function withDesignCache<T>(f:()=>T):T{const outer=scope;scope={caches:new Map()};try{return f();}finally{scope=outer;}}

export function runwayDesignAnalysis(p:ProjectInput,props:Properties,strength:GirderStrength,steps:number,mesh:number,observe?:RunwayCaseObserver,options:DesignAnalysisOptions={}):DesignAnalysis {
 const envelope=options.envelope!==false;
 const di=p.aist??emptyAistInputs,L=p.spans.reduce((a,b)=>a+b,0),q=girderDeadLoad(p,props.weight),endSteel=newSteelTakeoff(p).grid;
 const vertical=beamSystem(p.spans,p.section.E*props.Ix,p.system,undefined,mesh);
 const cap=cappedElasticProperties(p.section),flangeI=p.section.tf*p.section.bf**3/12,topI=cap?.topI??flangeI;
 const top=beamSystem(p.spans,p.section.E*topI,p.system,p.lateralBraceSpacing,mesh);
 const bottom=beamSystem(p.spans,p.section.E*flangeI,p.system,di.bottomBraceSpacing||L,mesh);
 const railT=top.evaluate([],p.railWeight*p.railEccentricity/props.h0),railB=bottom.evaluate([],-p.railWeight*p.railEccentricity/props.h0);
 const v0=vertical.evaluate([]),t0=top.evaluate([]),b0=bottom.evaluate([]),dead=vertical.evaluate([],q),live=vertical.evaluate([],di.liveLoad);
 const stations=[0];for(const span of p.spans)stations.push(stations.at(-1)!+span);
 const criticalStations=[...stations];
 if(p.details){
  criticalStations.push(...p.details.fatigueDetails.map(f=>f.x));
  // A girder end or rail clip past a runway-end grid (bearing centered on the support web) is outside the spans: the
  // model samples the grids, where that overhang meets the span.
  criticalStations.push(...[...railClipStations(p),...girderSegments(p).flatMap(m=>[m.start,m.end])].map(x=>Math.min(L,Math.max(0,x))));
 }
 const samples=[...new Set([...v0.x,...t0.x,...b0.x])].sort((a,b)=>a-b);
 const supportNodes=v0.x.flatMap((x,i)=>stations.some(s=>Math.abs(s-x)<1e-6)?[i]:[]);
 const bayOf=(x:number)=>{const i=stations.findIndex(s=>s>x+1e-6);return i<0?p.spans.length-1:Math.max(0,i-1);},verticalByBay=p.spans.map(()=>0),lateralByBay=p.spans.map(()=>0);
 const atDetail=(r:BeamResult,loads:{x:number;p:number}[])=>momentAt(p.fatigue.location,r.reactions,loads,0);
 const flangeY=(p.section.d-p.section.tf)/2;
 // Rail head and bumper above the girder bearing surface.
 const railHead=railTopAboveSteel(p),railTop=(cap?p.section.d+p.section.capTw:p.section.d)+railHead,bumperLever=railTop+(p.details?.endStop?.bumperHeight??0);
 const railLever=(cap?p.section.d+p.section.capTw+railHead-cap.topY:railHead+p.section.tf/2)/props.h0,verticalLever=p.railEccentricity/props.h0;
 let eq=Math.max(dead.equilibriumError,live.equilibriumError);
 // Reduced pairing for several cranes (PairingOptions): a crane over a station with its neighbor at closest approach
 // or on the coarse grid of the base travel steps.
 const positions=cranePositions(p,steps,criticalStations,{coarseSteps:p.cranes.length===2?12:6});
 // Refinement reuse: every position of the previous search must recur here with the same pairing.
 const prior=envelope&&!observe&&options.previous?searches.get(options.previous):undefined;
 const reused=prior&&prior.p===p&&prior.props===props&&prior.strength===strength&&prior.mesh===mesh&&prior.positions.length===positions.length?prior.positions.map(list=>new Set(list.map(positionKey))):undefined;
 const fresh=reused&&positions.map(list=>new Set(list.map(positionKey)));
 const reuse=reused&&reused.every((keys,k)=>[...keys].every(key=>fresh![k].has(key)))?reused:undefined,old=(k:number,v:CranePosition)=>!!reuse?.[k].has(positionKey(v));
 const cacheKey=scope?`${mesh}|${JSON.stringify(props)}|${JSON.stringify(p)}`:'';
 let cache:ResponseCache|undefined;
 if(scope){
  cache=scope.caches.get(cacheKey);if(!cache){cache={vertical:new Map(),envelope:new Map()};scope.caches.set(cacheKey,cache);}
  if(envelope&&scope.envelopeKey!==cacheKey){if(scope.envelopeKey!==undefined)scope.caches.get(scope.envelopeKey)?.envelope.clear();scope.envelopeKey=cacheKey;}
 }
 const responses=p.cranes.map((c,craneIndex)=>{
  const minimum=craneDesignMinimum(c),impact=Math.max(c.impact,minimum.impact),totalSide=c.wheels.reduce((sum,w)=>sum+w.lateral,0),sideFactor=totalSide>0?Math.max(1,minimum.runwaySide/totalSide):1;
  return positions[craneIndex].map(position=>{const origin=position.origin,key=`${craneIndex}:${origin}`;
   let v=cache?.vertical.get(key);
   if(!v){
    const all:Wheel[]=c.wheels.map(w=>({...w,lateral:w.lateral*sideFactor,x:origin+w.offset,static:w.loaded/(c.includesImpact?1+c.impact:1)})),wheels=all.filter(w=>w.x>=0&&w.x<=L);
    // Wheels on an adjacent existing bay load only the shared support, by load type.
    const adjacent={vd:adjacentReactions(p,all.map(w=>({x:w.x,p:w.unloaded}))),vl:adjacentReactions(p,all.map(w=>({x:w.x,p:w.static-w.unloaded}))),vi:adjacentReactions(p,all.map(w=>({x:w.x,p:w.static*impact})))},beyond=adjacent.vd.some(v=>v>0)||adjacent.vl.some(v=>v>0);
    const vd=vertical.evaluate(wheels.map(w=>({x:w.x,p:w.unloaded}))),vl=vertical.evaluate(wheels.map(w=>({x:w.x,p:w.static-w.unloaded}))),vi=vertical.evaluate(wheels.map(w=>({x:w.x,p:w.static*impact}))),vs=vertical.evaluate(wheels.map(w=>({x:w.x,p:w.static})));
    v={wheels,impact,adjacent,beyond,vd:{reactions:vd.reactions,rotation:vd.rotation},vl:{reactions:vl.reactions,rotation:vl.rotation},vi:{reactions:vi.reactions,rotation:vi.rotation},vs:{reactions:vs.reactions,rotation:vs.rotation,displacement:vs.displacement},
     eq:Math.max(vd.equilibriumError,vl.equilibriumError,vi.equilibriumError,vs.equilibriumError)};
    cache?.vertical.set(key,v);
   }
   const wheels=v.wheels;
   let e:EnvelopeResponse|undefined;
   if(envelope){
    e=cache?.envelope.get(key);
    if(!e){
     const loads=(key:'dead'|'lift'|'impact'|'side'|'static')=>wheels.map(w=>({x:w.x,p:key==='dead'?w.unloaded:key==='lift'?w.static-w.unloaded:key==='impact'?w.static*impact:key==='side'?w.lateral:w.static}));
     const cd=loads('dead'),cv=loads('lift'),ci=loads('impact'),h=loads('side');
     const td=top.evaluate(cd),tl=top.evaluate(cv),ti=top.evaluate(ci),th=top.evaluate(h);
     const bd=bottom.evaluate(cd),bl=bottom.evaluate(cv),bi=bottom.evaluate(ci),bh=bottom.evaluate(h);
     // Reactions are an exact influence basis for moments at arbitrary wheel/detail stations.
     const basis=(r:{reactions:Reactions},ls:{x:number;p:number}[])=>samples.map(x=>momentAt(x,r.reactions,ls,0));
     e={td:{reactions:td.reactions,displacement:td.displacement},tl:{reactions:tl.reactions,displacement:tl.displacement},ti:{reactions:ti.reactions},th:{reactions:th.reactions,displacement:th.displacement},
      bd:{reactions:bd.reactions},bl:{reactions:bl.reactions},bi:{reactions:bi.reactions},bh:{reactions:bh.reactions},
      moments:{vd:basis(v.vd,cd),vl:basis(v.vl,cv),vi:basis(v.vi,ci),td:basis(td,cd),tl:basis(tl,cv),ti:basis(ti,ci),th:basis(th,h),bd:basis(bd,cd),bl:basis(bl,cv),bi:basis(bi,ci),bh:basis(bh,h)},
      fatigueV:[atDetail(v.vd as BeamResult,cd),atDetail(v.vl as BeamResult,cv)],fatigueT:[atDetail(td,cd),atDetail(tl,cv),atDetail(th,h)],fatigueB:[atDetail(bd,cd),atDetail(bl,cv),atDetail(bh,h)],
      eq:Math.max(td.equilibriumError,tl.equilibriumError,ti.equilibriumError,th.equilibriumError,bd.equilibriumError,bl.equilibriumError,bi.equilibriumError,bh.equilibriumError)};
     cache?.envelope.set(key,e);
    }
    eq=Math.max(eq,v.eq,e.eq);
   }
   return {origin,position,wheels,impact:v.impact,adjacent:v.adjacent,beyond:v.beyond,vd:v.vd,vl:v.vl,vi:v.vi,vs:v.vs,...(e as EnvelopeResponse)};
  });
 });
 // Site seismic data adds TR-13 5a and 7a: the crane's seismic force on this runway at the rail head (Cs times its wheel
 // loads across, capped by wheel friction along) and the girder line's own along the runway (review B11).
 const site=runwaySiteSeismic(p),secured=site?.input.liftedLoadSecured?1:0,lineMass=site?site.mass.line*Math.max(...p.spans):0;
 const combinations:(ReturnType<typeof craneCombinations>[number]&{seismic?:number})[]=[...craneCombinations(p.method,di.concurrency==='full'),...seismicCraneCombinations(p)],records=new Map<string,DesignCaseSummary>();
 for(const c of combinations)records.set(c.id,{id:`${p.method} ${c.id}`,equation:c.equation,moment:0,lateralMoment:0,shear:0,reaction:0,axial:0,interaction:0,positions:[],location:0});
 const result:DesignAnalysis={combinations:[],cases:0,convergence:0,meshConvergence:0,equilibriumError:0,singleVertical:0,serviceRotation:0,deadRotation:abs(supportNodes.map(i=>dead.rotation[i])),singleLateral:0,endRotation:0,serviceReaction:0,fatigueMin:0,fatigueMax:0,wheelLoad:0,wheelNearEndLoad:0,torsion:0,moment:0,shear:0,reaction:0,uplift:0,axial:0,lateralMoment:0,interactionTop:0,interactionBottom:0,topLateralMoment:0,bottomLateralMoment:0,interaction:0,governing:{}};
 const railTM=samples.map(x=>momentAt(x,railT.reactions,[],p.railWeight*verticalLever)),railBM=samples.map(x=>momentAt(x,railB.reactions,[],-p.railWeight*verticalLever));
 const deadAdjacent=adjacentReactions(p,[],q),liveAdjacent=adjacentReactions(p,[],di.liveLoad);
 const deadM=samples.map(x=>momentAt(x,dead.reactions,[],q)),liveM=samples.map(x=>momentAt(x,live.reactions,[],di.liveLoad));
 // Per crane: the design traction (the larger of the supplier's and the minimum) and the bumper force on the girder.
 const tractionForce=p.cranes.map(c=>Math.max(c.longitudinal,craneDesignMinimum(c).traction)),bumperForce=p.cranes.map(c=>c.design?.bumperBypassesGirder?0:c.design?.bumperForce??0);
 const topStrength={...strength,flangeMinor:strength.topMinor??strength.flangeMinor},bottomStrength={...strength,flangeMinor:strength.bottomMinor??strength.flangeMinor};
 const nearEnd=(x:number)=>p.system==='simple'?stations.some(s=>Math.abs(x-s)<=p.section.d):Math.min(x,L-x)<=p.section.d,torsionArm=railHead+flangeY;
 for(const [craneIndex,group] of responses.entries())for(const s of group){
  if(old(craneIndex,s.position))continue;
  if(envelope){
   result.singleVertical=Math.max(result.singleVertical,abs(s.vs.displacement));
   // Largest single-crane deflection within each bay, for a limit on that bay's own span.
   for(let n=0;n<v0.x.length;n++){const bay=bayOf(v0.x[n]);verticalByBay[bay]=Math.max(verticalByBay[bay],Math.abs(s.vs.displacement[n]));}
   // Girder end rotation at the supports under one static crane: the cyclic movement imposed on end ties.
   result.serviceRotation=Math.max(result.serviceRotation??0,abs(supportNodes.map(i=>s.vs.rotation[i])));
  }
  for(const sign of [-1,1]){
   if(envelope)for(let n=0;n<t0.x.length;n++){const v=Math.abs(verticalLever*(s.td.displacement[n]+s.tl.displacement[n])+(1+railLever)*s.th.displacement[n]*sign),bay=bayOf(t0.x[n]);result.singleLateral=Math.max(result.singleLateral,v);lateralByBay[bay]=Math.max(lateralByBay[bay],v);}
   observe?.({kind:'service',adjacentReactions:stations.map((x,j)=>({x,r:s.adjacent.vd[j]+s.adjacent.vl[j]})),id:`S-${craneIndex}-${s.origin}-${sign}`,combination:'Single crane · static',cranes:[{index:craneIndex,origin:s.origin,loaded:true}],horizontalCrane:craneIndex,lateralSign:sign,wheels:s.wheels.map(w=>({x:w.x,p:w.static,h:w.lateral*sign})),q:0,railTorquePerLength:0,axial:0,verticalReactions:s.vs.reactions});
  }
 }
 const chosen:{index:number;response:typeof responses[number][number]}[]=[];
 type Governed='moment'|'shear'|'reaction'|'uplift'|'axial'|'lateralMoment'|'topLateralMoment'|'bottomLateralMoment'|'interaction'|'interactionTop'|'interactionBottom';
 function govern(key:Governed,value:number,c:DesignCaseSummary){if(value>(result[key]??0)){result[key]=value;result.governing[key]={...c,positions:[...c.positions]};}}
 // govern() with the case at a station: the summary is copied only when it governs (same fields and order as {...c, ...}).
 function governAt(key:Governed,value:number,c:DesignCaseSummary,location:number,moment:number,lateralMoment:number){if(value>(result[key]??0)){result[key]=value;result.governing[key]={...c,location,moment,lateralMoment,positions:[...c.positions]};}}
 function governAtX(key:Governed,value:number,c:DesignCaseSummary,location:number){if(value>(result[key]??0)){result[key]=value;result.governing[key]={...c,location,positions:[...c.positions]};}}
 function evaluate(){
  // Each subset includes independent empty/loaded crane states. Minimum lifted
  // load is zero conservatively; no invented minimum manufacturer lifted load.
  if(envelope&&chosen.length){
   const serviceR=dead.reactions.map((r,j)=>r.r+(endSteel[j]??0)+deadAdjacent[j]+chosen.reduce((sum,s)=>sum+s.response.vd.reactions[j].r+s.response.vl.reactions[j].r+s.response.vi.reactions[j].r+s.response.adjacent.vd[j]+s.response.adjacent.vl[j]+s.response.adjacent.vi[j],0));
   result.serviceReaction=Math.max(result.serviceReaction,...serviceR);
  }
  for(let loadMask=0;loadMask<2**chosen.length;loadMask++){
   const full=chosen.map((_,i)=>Boolean(loadMask&(1<<i)));
   // Fatigue: Cds+Cvs+0.5Css, a single lateral crane force, no impact or factors. With the single-crane
   // basis (TR-13 / DG7) only arrangements with one crane on the runway are fatigue states.
   if(!(di.fatigueCranes==='single'&&chosen.length>1))for(let hi=0;hi<Math.max(1,chosen.length);hi++)for(const sign of [-1,1]){
    if(envelope){
     const topPoint=di.fatiguePoint.startsWith('top'),side=di.fatiguePoint.endsWith('left')?-1:1;
     let mx=0,my=0;
     for(let i=0;i<chosen.length;i++){const v=chosen[i].response;mx+=v.fatigueV[0]+(full[i]?v.fatigueV[1]:0);const fm=topPoint?v.fatigueT:v.fatigueB;my+=(topPoint?1:-1)*verticalLever*(fm[0]+(full[i]?fm[1]:0))+(i===hi?.5*(topPoint?1+railLever:-railLever)*fm[2]*sign:0);}
     const majorS=cap?(topPoint?cap.Stop:cap.Sbottom):props.Sx;
     const lateralS=cap&&topPoint?cap.topS:flangeI/(p.section.bf/2);
     const stress=(topPoint?-1:1)*mx/majorS+side*my/lateralS;
     result.fatigueMin=Math.min(result.fatigueMin,stress);result.fatigueMax=Math.max(result.fatigueMax,stress);
    }
    if(observe){
     const wheels=chosen.flatMap((s,i)=>s.response.wheels.map(w=>({x:w.x,p:full[i]?w.static:w.unloaded,h:i===hi?.5*w.lateral*sign:0})));
     const verticalReactions=v0.reactions.map((r,j)=>({x:r.x,r:chosen.reduce((sum,s,i)=>sum+s.response.vd.reactions[j].r+(full[i]?s.response.vl.reactions[j].r:0),0)}));
     const adjacentFatigue=v0.reactions.map((r,j)=>({x:r.x,r:chosen.reduce((sum,s,i)=>sum+s.response.adjacent.vd[j]+(full[i]?s.response.adjacent.vl[j]:0),0)}));
     observe({kind:'fatigue',adjacentReactions:adjacentFatigue,id:`F-${chosen.map(s=>`${s.index}@${s.response.origin}`).join(',')}-${loadMask}-${hi}-${sign}`,combination:'Cds + Cvs + 0.5 Css',cranes:chosen.map((s,i)=>({index:s.index,origin:s.response.origin,loaded:full[i]})),horizontalCrane:chosen[hi]?.index??-1,lateralSign:sign,wheels,q:0,railTorquePerLength:0,axial:0,verticalReactions});
    }
   }
   for(const factors of combinations){
    if(factors.single&&chosen.length!==1)continue;
    // No lifted-load factor (cv = 0, or the minimum lifted load): every load mask has the loads of the first, so the
    // cases of the later masks are numbered (ids and case count unchanged) but neither evaluated nor observed again.
    const liftFree=!!factors.minimumLift||!factors.cv,repeated=liftFree&&loadMask>0,repeats=liftFree&&!loadMask?2**chosen.length-1:0;
    const eq=site?factors.seismic??0:0;
    const ids=chosen.length&&(factors.h||factors.l||factors.bumper||eq)?Array.from({length:chosen.length},(_,i)=>i):[-1];
    for(const hi of ids)for(const sign of factors.h||eq?[-1,1]:[1]){
     // The crane stop force exists only with that crane against a stop: the stop combinations are evaluated there
     // alone, so the girder, its end stop and its locating bearing all see the crane at the stop.
     const stop=factors.bumper&&hi>=0?craneAtStop(p,chosen[hi].index,chosen[hi].response.origin):undefined;
     if(factors.bumper&&!stop)continue;
     if(++result.cases>designCaseLimit)throw Error(`AIST design search exceeds ${designCaseLimit.toLocaleString('en-US')} cases. Reduce cranes or travel ranges.`);
     if(repeated)continue;
     const f=chosen.map((_,i)=>factors.minimumLift?0:full[i]?factors.cv:0);
     const traction=hi<0?0:factors.l*tractionForce[chosen[hi].index],bumper=hi<0?0:factors.bumper*bumperForce[chosen[hi].index];
     // Traction acts at the top of the rail and the bumper above it; both are resisted at the girder bearing,
     // so each bay carries the end couple F*e as equal and opposite end reactions F*e/L.
     const quake=hi<0||!eq?0:eq*site!.along*chosen[hi].response.wheels.reduce((a,w)=>a+w.unloaded+secured*(w.static-w.unloaded),0),eh=eq?eq*site!.across*sign:0;
     const axial=traction+bumper+quake+(eq?eq*site!.Cs*lineMass:0),longitudinalCouple=traction*railTop+bumper*bumperLever+quake*railTop;
     const record=records.get(factors.id)!;
     const wheels=chosen.flatMap((s,i)=>s.response.wheels.map(w=>({x:w.x,p:factors.cd*w.unloaded+f[i]*(w.static-w.unloaded)+factors.i*w.static*s.response.impact,h:i===hi?factors.h*w.lateral*sign+eh*(w.unloaded+secured*(w.static-w.unloaded)):0})));
     const vr=dead.reactions.map((r,j)=>({x:r.x,r:factors.d*r.r+factors.live*live.reactions[j].r+chosen.reduce((sum,s,i)=>sum+factors.cd*s.response.vd.reactions[j].r+f[i]*s.response.vl.reactions[j].r+factors.i*s.response.vi.reactions[j].r,0)}));
     const ar=dead.reactions.map((r,j)=>({x:r.x,r:factors.d*deadAdjacent[j]+factors.live*liveAdjacent[j]+chosen.reduce((sum,s,i)=>sum+factors.cd*s.response.adjacent.vd[j]+f[i]*s.response.adjacent.vl[j]+factors.i*s.response.adjacent.vi[j],0)}));
     observe?.({kind:'strength',adjacentReactions:ar,longitudinalCouple,deadFactor:factors.d,...(stop?{stop}:{}),id:`D-${result.cases}`,combination:record.id,cranes:chosen.map((s,i)=>({index:s.index,origin:s.response.origin,loaded:full[i]})),horizontalCrane:chosen[hi]?.index??-1,lateralSign:sign,wheels,q:factors.d*q+factors.live*di.liveLoad,railTorquePerLength:factors.d*p.railWeight*p.railEccentricity,axial,verticalReactions:vr,...(repeats?{repeats}:{})});
     if(!envelope)continue;
     const c:DesignCaseSummary={id:record.id,equation:record.equation,moment:0,lateralMoment:0,shear:0,reaction:0,interaction:0,positions:chosen.map(s=>s.response.origin),axial,location:0};
     // The section of the largest shear and the grid of the largest reaction, for the governing-action table.
     let shearAt=0;
     const tr=t0.reactions.map((r,j)=>({x:r.x,r:factors.d*railT.reactions[j].r+chosen.reduce((sum,s,i)=>sum+verticalLever*(factors.cd*s.response.td.reactions[j].r+f[i]*s.response.tl.reactions[j].r+factors.i*s.response.ti.reactions[j].r)+(i===hi?(1+railLever)*(factors.h*s.response.th.reactions[j].r*sign+eh*(s.response.td.reactions[j].r+secured*s.response.tl.reactions[j].r)):0),0)}));
     const br=b0.reactions.map((r,j)=>({x:r.x,r:factors.d*railB.reactions[j].r+chosen.reduce((sum,s,i)=>sum-verticalLever*(factors.cd*s.response.bd.reactions[j].r+f[i]*s.response.bl.reactions[j].r+factors.i*s.response.bi.reactions[j].r)+(i===hi?-railLever*(factors.h*s.response.bh.reactions[j].r*sign+eh*(s.response.bd.reactions[j].r+secured*s.response.bl.reactions[j].r)):0),0)}));
     for(let j=0;j<dead.rotation.length;j++)result.endRotation=Math.max(result.endRotation,Math.abs(factors.d*dead.rotation[j]+factors.live*live.rotation[j]+chosen.reduce((sum,s,i)=>sum+factors.cd*s.response.vd.rotation[j]+f[i]*s.response.vl.rotation[j]+factors.i*s.response.vi.rotation[j],0)));
     const vLoads=wheels.map(w=>({x:w.x,p:w.p})),tLoads=wheels.map(w=>({x:w.x,p:verticalLever*w.p+(1+railLever)*w.h})),bLoads=wheels.map(w=>({x:w.x,p:-verticalLever*w.p-railLever*w.h}));
     const uniform=factors.d*q+factors.live*di.liveLoad;
     // The shear just beside a station: support reactions to its left less the wheels and the uniform load.
     const shearAtStation=(station:number)=>{let R=0;for(const r of vr)R=R+(r.x<=station?r.r:0);let W=0;for(const w of wheels)W=W+(w.x<=station?w.p:0);return R-W-uniform*station;};
     for(let n=0;n<samples.length+wheels.length;n++){
      const wheel=n>=samples.length,x=wheel?wheels[n-samples.length].x:samples[n];
      let M:number,Mt:number,Mb:number;
      if(wheel){M=momentAt(x,vr,vLoads,uniform);Mt=momentAt(x,tr,tLoads,factors.d*p.railWeight*verticalLever);Mb=momentAt(x,br,bLoads,-factors.d*p.railWeight*verticalLever);}
      else{M=factors.d*deadM[n]+factors.live*liveM[n];Mt=factors.d*railTM[n];Mb=factors.d*railBM[n];for(let i=0;i<chosen.length;i++){const m=chosen[i].response.moments;M+=factors.cd*m.vd[n]+f[i]*m.vl[n]+factors.i*m.vi[n];Mt+=verticalLever*(factors.cd*m.td[n]+f[i]*m.tl[n]+factors.i*m.ti[n])+(i===hi?(1+railLever)*(factors.h*m.th[n]*sign+eh*(m.td[n]+secured*m.tl[n])):0);Mb-=verticalLever*(factors.cd*m.bd[n]+f[i]*m.bl[n]+factors.i*m.bi[n])+(i===hi?railLever*(factors.h*m.bh[n]*sign+eh*(m.bd[n]+secured*m.bl[n])):0);}}
      // H1 at each flange with that flange's lateral moment and resistance (AISC DG7); the larger governs.
      const My=Math.max(Math.abs(Mt),Math.abs(Mb)),uTop=interaction(axial,M,Mt,topStrength,p.method).utilization,uBottom=interaction(axial,M,Mb,bottomStrength,p.method).utilization,u=Math.max(uTop,uBottom);
      governAt('interactionTop',uTop,c,x,M,Math.abs(Mt));governAt('interactionBottom',uBottom,c,x,M,Math.abs(Mb));
      c.moment=Math.max(c.moment,Math.abs(M));c.lateralMoment=Math.max(c.lateralMoment,My);
      if(u>c.interaction){c.interaction=u;c.location=x;}
      // This interaction is evaluated at each actual concurrent station.
      governAt('interaction',u,c,x,M,My);
      governAt('moment',Math.abs(M),c,x,M,My);governAt('lateralMoment',My,c,x,M,My);
      governAtX('topLateralMoment',Math.abs(Mt),c,x);governAtX('bottomLateralMoment',Math.abs(Mb),c,x);
      if(wheel)for(const side of [-1e-5,1e-5]){const station=x+side;if(station<0||station>L)continue;const V=shearAtStation(station);if(Math.abs(V)>c.shear){c.shear=Math.abs(V);shearAt=x;}}
     }
     // Include UDL end shear, also for the no-crane state.
     for(const x of stations)for(const side of [-1e-5,1e-5]){const station=x+side;if(station<0||station>L)continue;const V=shearAtStation(station);if(Math.abs(V)>c.shear){c.shear=Math.abs(V);shearAt=x;}}
     // Support reactions include an adjacent existing girder bearing on a modeled end support.
     // The couple can load either end of the bay that carries the force: bound both signs at every support.
     const sr=vr.map((r,j)=>r.r+ar[j].r+factors.d*(endSteel[j]??0)),shift=stations.map((_,j)=>longitudinalCouple/Math.min(...[p.spans[j-1],p.spans[j]].filter(v=>v>0)));c.reaction=Math.max(0,...sr.map((r,j)=>r+shift[j]));const reactionAt=vr[sr.reduce((k,r,j)=>r+shift[j]>sr[k]+shift[k]?j:k,0)]?.x??0;
     governAtX('shear',c.shear,c,shearAt);governAtX('reaction',c.reaction,c,reactionAt);govern('uplift',Math.max(0,...sr.map((r,j)=>-(r-shift[j]))),c);govern('axial',axial,c);
     for(const w of wheels){result.wheelLoad=Math.max(result.wheelLoad,w.p);if(nearEnd(w.x))result.wheelNearEndLoad=Math.max(result.wheelNearEndLoad,w.p);result.torsion=Math.max(result.torsion,Math.abs(w.p*p.railEccentricity+w.h*torsionArm));}
     record.moment=Math.max(record.moment,c.moment);record.lateralMoment=Math.max(record.lateralMoment,c.lateralMoment);record.shear=Math.max(record.shear,c.shear);record.reaction=Math.max(record.reaction,c.reaction);record.axial=Math.max(record.axial,axial);if(c.interaction>=record.interaction){record.interaction=c.interaction;record.positions=c.positions;record.location=c.location;}
    }
   }
  }
 }
 let added=0;
 function visit(index:number){
  if(index===responses.length){if(!reuse||added)evaluate();return;}
  visit(index+1); // A crane absent from the modeled runway is a real load state.
  for(const r of responses[index]){
   const previous=chosen.at(-1);if(!pairs(p,index,r.position,previous&&{index:previous.index,position:previous.response.position}))continue;
   if(!r.wheels.length&&!r.beyond)continue;const isNew=old(index,r.position)?0:1;chosen.push({index,response:r});added+=isNew;visit(index+1);added-=isNew;chosen.pop();
  }
 }
 visit(0);result.combinations=[...records.values()];result.equilibriumError=eq;result.verticalByBay=verticalByBay;result.lateralByBay=lateralByBay;
 if(reuse)mergePrevious(result,options.previous!);
 if(envelope)searches.set(result,{p,props,strength,mesh,positions});
 return result;
}

/** The envelope of a refined search from its new states (result) and the previous search: maxima and minima merged. */
function mergePrevious(result:DesignAnalysis,previous:DesignAnalysis){
 for(const k of ['singleVertical','serviceRotation','singleLateral','endRotation','serviceReaction','fatigueMax','wheelLoad','wheelNearEndLoad','torsion','moment','shear','reaction','uplift','axial','lateralMoment','topLateralMoment','bottomLateralMoment','interaction','interactionTop','interactionBottom'] as const){
  const b=previous[k]??0;if(b>=(result[k]??0)){result[k]=b;if(previous.governing[k])result.governing[k]=previous.governing[k];}
 }
 result.fatigueMin=Math.min(result.fatigueMin,previous.fatigueMin);result.cases+=previous.cases;
 for(const key of ['verticalByBay','lateralByBay'] as const)result[key]=result[key]?.map((v,i)=>Math.max(v,previous[key]?.[i]??0));
 for(const c of result.combinations){
  const o=previous.combinations.find(v=>v.id===c.id);if(!o)continue;
  c.moment=Math.max(c.moment,o.moment);c.lateralMoment=Math.max(c.lateralMoment,o.lateralMoment);c.shear=Math.max(c.shear,o.shear);c.reaction=Math.max(c.reaction,o.reaction);c.axial=Math.max(c.axial,o.axial);
  if(o.interaction>c.interaction){c.interaction=o.interaction;c.positions=o.positions;c.location=o.location;}
 }
}

/**
 * Quick configurator: a complete runway project from a few choices (RunwayConfig). Every dependent input follows from
 * them: the crane data from the capacity and span with consistent statics and bumper data, the rail from the wheel
 * load, the girder sized for the moving loads, the detailed connections from the girder (neutralDetails), and the
 * supports, tieback and supporting columns as chosen. Supplier, survey and site data the configurator cannot know
 * are filled with clearly marked fictitious example values so the package calculates at once; a project package
 * blocks them until they are replaced (packageContentChecks). Canonical units N, mm, MPa.
 */
import type {Crane,ProjectInput,Section} from './types';
import type {RunwayDetails} from './runwayDetails';
import {runwayConfigSchema,type RunwayConfig} from './configInputs';
import {demonstrationProject,cappedDemonstrationProject,newColumnDemonstrationProject} from './demonstration';
import {neutralDetails} from './detailTemplate';
import {emptyCraneDesign,craneDesignMinimum} from './aistLoads';
import {emptyCapDesign} from './capDesignInputs';
import {aiscWShapes,aiscShapeByName,loadAiscSection} from '../data/aiscSections';
import {aiscChannelByName,loadCappedSection} from '../data/aiscChannels';
import {sectionProperties} from './section';
import {girderStrength} from './aiscStrength';
import {movingAnalysis} from './analysis';
import {selectBracketArrangement,selectTieArrangement} from './connectionOptions';
import {sizeTaperedHaunch} from './taperedHaunchSizing';
import {baseSizingRatios,columnDriftShare,sizeColumnBase} from './columnBaseSizing';
import {supportReactions} from './supportReactions';
import {existingColumnAnalysis} from './existingColumn';
import {baseDrift} from './columnBase';
import {sizeCapAngle,capAngleForceEstimate} from './capAngleTie';
import {sizeWeldedBracket} from './bracketSizing';
import {defaultRolledBracket} from './rolledBracketInputs';
import {defaultColumnCap} from './columnCapInputs';
import {capWorkPointDrop} from './columnCap';
import {columnBaseElevation} from './columnBaseInputs';
import {railTopAboveSteel} from './railSeat';
import {columnGussetHeight} from './tieGeometry';
import {classFromCycles} from './buildingClass';

const inch=25.4,foot=304.8,kip=4448.2216152605,ksi=6.894757293168,fpm=5.08,g=9.80665;
const up=(v:number,step:number)=>Math.ceil(v/step-1e-9)*step,round=(v:number,step:number)=>Math.round(v/step)*step;
const sum=(a:number[])=>a.reduce((s,v)=>s+v,0);

/** Configuration choices that cannot go together, adjusted to the nearest valid set with a reason for each change. */
export function normalizeConfig(input:RunwayConfig):{config:RunwayConfig;changes:string[]}{
 const c={...input},changes:string[]=[];
 const fix=(when:boolean,patch:Partial<RunwayConfig>,why:string)=>{if(when){Object.assign(c,patch);changes.push(why);}};
 if(c.scope==='analysis')return {config:c,changes};
 fix(c.support==='column-cap'&&c.structure!=='new',{structure:'new'},'A column cap sits on new freestanding columns: the columns are new.');
 fix(c.structure==='new'&&c.support==='by-others',{support:'twin-rib'},'New columns carry a bracket designed here: the support is the welded twin-rib seat.');
 fix(c.tie==='cap-angle'&&c.girder!=='capped',{tie:'paired-bars'},'The cap tieback angle bolts to a channel cap: the tie is paired flat bars on this rolled girder.');
 fix(c.tie!=='paired-bars'&&c.system==='continuous',{tie:'paired-bars'},'Continuous girders are tied at the bearing stiffeners: the tie is paired flat bars.');
 fix(c.support==='column-cap'&&c.tie!=='paired-bars',{tie:'paired-bars'},'A girder on a column cap is held by the cap stiffeners (fork support): no flange tie.');
 fix(c.support==='by-others'&&c.system==='continuous',{support:'twin-rib'},'A continuous girder needs a seat designed here for the stiffener ties: the support is the welded twin-rib seat.');
 return {config:c,changes};
}

/** Building class from the TR-13 Table 1.1 count; the duty spectrum totals sit at the top of each range. */
const classTotals={A:2000000,B:500000,C:100000,D:20000} as const;
/** Duty spectrum of the class: rated, half and quarter lifts in the proportions of a general-service crane. */
export function exampleSpectrum(cls:RunwayConfig['buildingClass']){
 const N=classTotals[cls],rated=.3*N,half=.5*N;
 return {total:N,repetitions:rated,bins:[{name:'Rated lifts',liftFraction:1,cycles:rated},{name:'Half-load lifts',liftFraction:.5,cycles:half},{name:'Light lifts',liftFraction:.25,cycles:N-rated-half}]};
}

export interface CraneEstimate {Q:number;T:number;B:number;approach:number;offsets:number[];Pmax:number;Pempty:number;Pmin:number;driven:number;speed:number;stroke:number;efficiency:number;bumper:number;impact:number;double:boolean}
/**
 * Typical crane data for a top-running bridge crane of the capacity and span, with consistent statics (TR-13 §1.5.6.1
 * items): the trolley and bridge weights from catalog proportions, the hook approach, the wheel loads from the
 * weights (loaded trolley at the hook approach: maximum; empty: the empty load; loaded at the far end: the minimum, so
 * the wheel loads of both runways sum to the crane weight), the rated speed and a bumper absorbing the full energy at
 * 100% speed and decelerating at most 14 ft/s² at 50% speed (TR-13 commentary to §3.6.3). Forces N, lengths mm.
 */
export function estimateCrane(capacity:number,craneSpan:number,control:'cab'|'pendant'):CraneEstimate{
 const Q=2*capacity,S=craneSpan,double=control==='cab'||capacity>10;
 const T=round(.22*Q+.6,.1),B=round((2+S*(.15+.017*capacity))*(double?1:.75),.5),a=Math.max(3,round(.04*S+1.5,.5));
 const runway=B/2+(Q+T)*(S-a)/S,n=runway/2<=40?2:4;
 const wheelBase=Math.max(6,round(S/7,.5)),bogie=3.5,offsets=n===2?[0,wheelBase]:[0,bogie,Math.max(9,round(S/6,.5)),Math.max(9,round(S/6,.5))+bogie];
 const Pmax=runway/n,Pempty=(B/2+T*(S-a)/S)/n,Pmin=(B/2+(Q+T)*a/S)/n;
 const speed=control==='pendant'?(capacity<=5?100:capacity<=15?80:60):(capacity<=10?200:capacity<=25?180:150);
 const efficiency=control==='pendant'?.5:.9,v=speed/60,WE=.5*B+.9*T;
 const stroke=Math.max(2,up((.5*v)**2/(2*efficiency*14)*12,1)),E=WE/32.174*v*v/2,F=E/(efficiency*stroke/12);
 const bumper=Math.max(2,up(1.1*F,.5));
 return {Q:Q*kip,T:T*kip,B:B*kip,approach:a*foot,offsets:offsets.map(v=>v*foot),Pmax:Pmax*kip,Pempty:Pempty*kip,Pmin:Pmin*kip,driven:Pmax*n/2*kip,speed:speed*fpm,stroke:stroke*inch,efficiency,bumper:bumper*kip,impact:control==='pendant'?.1:.25,double};
}

/** The configured crane(s), with the side thrust at the design minimum and the traction of half the wheels driven. */
export function exampleCranes(cfg:RunwayConfig,length:number):Crane[]{
 const e=estimateCrane(cfg.capacity,cfg.craneSpan,cfg.control),tons=+cfg.capacity.toFixed(2),n=e.offsets.length,last=e.offsets.at(-1)!;
 const crane=(i:number):Crane=>{
  const c:Crane={id:`crane-${i+1}`,name:`Example crane CR-${i+1} · ${tons} US tons`,
   wheels:e.offsets.map(offset=>({offset,loaded:e.Pmax,unloaded:e.Pempty,lateral:0})),impact:e.impact,includesImpact:false,
   longitudinal:Math.max(.2*e.driven,.1*n*e.Pmax),minSeparation:4*foot,travelStart:-last,travelEnd:length,
   operatingClass:`CMAA Class ${cfg.cmaa} ${cfg.control} crane; AIST Class ${cfg.buildingClass} building (example)`,
   loadSource:`Fictitious example supplier schedule: typical proportions of a ${tons}-ton ${e.double?'double':'single'}-girder ${cfg.control}-operated crane, ${+cfg.craneSpan.toFixed(1)} ft span; replace with the crane supplier's wheel loads`,
   design:{...emptyCraneDesign,control:cfg.control,type:'maintenance',ratedLoad:e.Q,trolleyWeight:e.T,bridgeWeight:e.B,drivenWheelLoad:e.driven,sideShare:.5,
    distributionSource:'Fictitious example: one-half of the crane side thrust assigned to this runway (no stiffness analysis of both runways)',splitConfirmed:true,
    bumperForce:e.bumper,bumperBypassesGirder:false,guideRollers:false,cmaaClass:cfg.cmaa,bridgeSpeed:e.speed,minWheelLoad:e.Pmin,bumperStroke:e.stroke,bumperEfficiency:e.efficiency}};
  const side=craneDesignMinimum(c).runwaySide/n;c.wheels=c.wheels.map(w=>({...w,lateral:side}));
  return c;
 };
 return cfg.cranes===2?[crane(0),crane(1)]:[crane(0)];
}

/** Rail depth for the maximum static wheel load (typical crane-rail selection, lighter rails for light wheels). */
export function railDepthFor(wheel:number){const P=wheel/kip;return (P<=10?3.5:P<=20?4.25:P<=32?5.25:6)*inch;}
/** Fictitious example rail clip for a rail base of the width: light series below a 4 1/2 in base. */
export function exampleClip(railBase:number,depth:number,weld:number):NonNullable<RunwayDetails['rail']['clip']>{
 const light=railBase<=4.5*inch+1e-6,across=(light?2:2.5)*inch;
 return {type:'weld-on',product:`Fictitious example data RC-W${light?'L':''}: weld-on floating crane rail clip for a ${+(depth/inch).toFixed(2)} in rail, or equal`,basis:'allowable',
  lateral:(light?6:10)*kip,uplift:(light?3:5)*kip,baseLength:3.75*inch,baseWidth:across,baseThickness:.75*inch,weld,weldLength:across};
}

/** Least flange width (W, or the cap web inside the channel flanges) that seats the rail and its clips. */
export function seatWidthNeeded(depth:number,clipWidth:number,tolerance=.125*inch){return 2*(tolerance+up(depth,1.5875)/2+clipWidth);}

const wCandidates=()=>aiscWShapes.filter(s=>s.d>=12&&s.d<=40&&s.bf/(2*s.tf)<=.38*Math.sqrt(29000/50)&&(s.d-2*s.kdes)/s.tw<=3.76*Math.sqrt(29000/50)).sort((a,b)=>a.weight-b.weight);
const capChannels=['C10X15.3','C12X20.7','C12X25','C15X33.9','C15X40','C15X50','MC18X42.7'];
export interface GirderTrial {name:string;weight:number;utilization:number;deflection:number;lateral:number;shear:number;section:Section;
 /** The governing sizing ratio: top-flange tip stress with warping and second-order twist, the H1 top-flange interaction with the load-height LTB strength, or the elastic stability margin. */
 governs:string}
/**
 * Top-flange sizing ratios of a girder section under the factored moving-load envelope (canonical units):
 * - flange tips: M_u/S_x + M_f/S_f ≤ φF_y, with M_f the top flange's lateral moment from the rail-head side thrust
 *   (its direct share I_yt/I_y plus the warping couple of the torque about the shear center, height y_g) and from the
 *   rail eccentricity e (M_u e/h_0), amplified for the second-order twist by 1/(1 − M_u/(0.8M_cr));
 * - H1 at the top flange (DG7): M_u/φM_n + M_f/φF_yS_f, M_n by F2 with C_b = M_cr/M_ocr (load height) at most 1;
 * - elastic stability: 0.8M_cr/M_u ≥ 1/φ.
 * M_cr is the classical elastic critical moment of the bay with the wheels at the rail head, y_g above the shear
 * center (C1 = 1.13, C2 = 0.46, fork supports at the girder ends), the same mechanics the full analysis solves by
 * eigenvalues; with the monosymmetry term of a capped section (C3 = 0.53); the configurator uses it to rank sections,
 * the full analysis then checks the chosen one.
 */
export function girderSizingRatios(p:ProjectInput,section:Section,demand:{Mu:number;Mcrane:number;Hu:number;V:number;flexibleTie?:boolean},strength=girderStrength({...p,section,aist:p.aist?{...p.aist,netFlangeArea:section.bf*section.tf}:p.aist},sectionProperties(section))){
 const pr=sectionProperties(section),E=section.E,G=E/2.6,L=p.unbracedLength,lrfd=p.method==='LRFD',phi=(v:number)=>lrfd?.9*v:v/1.67;
 const cap=section.kind==='cap'?aiscChannelByName(section.capCatalogueId??''):undefined,Iyb=section.tf*section.bf**3/12,Iyt=Iyb+(cap?cap.Ix*inch**4:0);
 const h0=section.d-section.tf,ysc=h0*Iyb/(Iyt+Iyb),hr=p.railHeight+(p.aist?.railPad?.25*inch:0),yg=ysc+section.tf/2+(cap?section.capTw:0)+hr;
 // Monosymmetry (Wagner) term: positive with the larger flange on top (the cap), which raises M_cr; zero for a W.
 const rho=Iyt/(Iyt+Iyb),betaX=.9*h0*(2*rho-1)*(1-(pr.Iy/pr.Ix)**2);
 const pe=Math.PI**2*E*pr.Iy/L**2,base=pr.Cw/pr.Iy+L*L*G*pr.J/(Math.PI**2*E*pr.Iy),C1=1.13,C2=.46,C3=.53,arm=C2*yg-C3*betaX/2;
 const Mcr=C1*pe*(Math.sqrt(base+arm**2)-arm),Mocr=pe*(Math.sqrt(base+(betaX/2)**2)+betaX/2);
 const top=Iyt/(Iyt+Iyb),Mf0=demand.Hu*(top+yg/h0)+demand.Mcrane*Math.abs(p.railEccentricity)/h0;
 const amplification=demand.Mu<.8*Mcr?1/(1-demand.Mu/(.8*Mcr)):Infinity;
 const halfWidth=cap?section.capWidth/2:section.bf/2,Sf=Iyt/halfWidth,Stop=pr.Ix/(section.d+(cap?section.capTw:0)-pr.cy);
 // Calibrated against the full analysis of the simulation set: a capped top flange (the channel tips) and a single
 // flexible plate tie (less end restraint against twist) carry more warping stress than this estimate gives.
 const tips=(demand.Mu/Stop+Mf0*amplification/Sf)/phi(section.Fy)*(cap?1.4:1)*(demand.flexibleTie?1.25:1);
 // F2 (F4 for caps, through girderStrength) with the load-height C_b: M_n,LTB scales with C_b below M_p.
 const cb=Math.min(1,Mcr/Mocr),Mn=strength.ltb!==undefined?Math.min(strength.major,cb*strength.major):strength.major;
 const h1=demand.Mu/Mn+Mf0/phi(section.Fy*Sf),stability=(lrfd?1/.9:1.67)/(.8*Mcr/demand.Mu);
 const ratios={tips,h1,stability,shear:demand.V/strength.shear};
 const [governs,utilization]=Object.entries(ratios).sort((a,b)=>b[1]-a[1])[0];
 return {...ratios,utilization,governs,Mcr,cb,amplification};
}
/**
 * Girder sizing for the moving loads: one moving-load analysis of the configured runway gives the envelope moments
 * and deflections (moments of a prismatic girder do not depend on its stiffness; deflections scale with 1/I), then
 * each catalog section (compact W, or W + channel cap whose cap web seats the rail and clips) is checked with
 * girderSizingRatios, the vertical and lateral deflection limits and the web shear. The lightest section within the
 * targets is returned; the full analysis then checks it completely (fatigue, local and connection checks).
 */
export function sizeGirder(p:ProjectInput,kind:'rolled'|'capped',opts:{minSeat:number;minFlange?:number;capRoom?:number;flexibleTie?:boolean;target?:number;deflectionTarget?:number}):GirderTrial|undefined{
 const target=opts.target??.85,deflectionTarget=opts.deflectionTarget??.9;
 const ref=structuredClone(p);ref.section=loadAiscSection(ref.section,'W24X104');
 const props=sectionProperties(ref.section),a=movingAnalysis(ref,props,8),L=Math.max(...p.spans),lrfd=p.method==='LRFD';
 const Md=a.deadMoment,M=a.demand.moment,H=a.demand.lateralMoment,V=a.demand.shear,dv=a.demand.deflection*props.Ix,dh=a.demand.lateralDeflection*props.Iy;
 const vLimit=L/p.verticalLimit,hLimit=L/Math.max(p.lateralLimit,400);
 const trials:GirderTrial[]=[];
 const consider=(section:Section,name:string,weight:number)=>{
  const pr=sectionProperties(section),dead=Md*(pr.weight+p.railWeight+p.deadLoad)/(props.weight+p.railWeight+p.deadLoad),Mcrane=(lrfd?1.6:1)*(M-Md);
  const r=girderSizingRatios(p,section,{Mu:(lrfd?1.2:1)*dead+Mcrane,Mcrane,Hu:(lrfd?1.6:1)*H,V:(lrfd?1.6:1)*V,flexibleTie:opts.flexibleTie});
  trials.push({name,weight,utilization:r.utilization,governs:r.governs,deflection:dv/pr.Ix/vLimit,lateral:dh/pr.Iy/hLimit,shear:r.shear,section});
 };
 // Flanges wide enough for the bearing bolts, end-stop bolts and saddles (minFlange), and for the rail and clips.
 const minFlange=Math.max(opts.minFlange??0,kind==='rolled'?opts.minSeat:0);
 if(kind==='rolled'){
  for(const w of wCandidates())if(w.bf*inch>=minFlange-1e-6)consider(loadAiscSection(p.section,w.name),w.name,w.weight);
 }else{
  for(const ch of capChannels){const c=aiscChannelByName(ch)!;
   for(const w of wCandidates()){
    // The W flange fits between the channel flanges with room for the tie gussets beside it (capRoom), the channel
    // web seats the rail and clips, and the cap stays above the neutral axis (a deep cap on a shallow W is outside
    // the capped-girder model).
    // AISC F13.2 proportions of a singly symmetric member: 0.1 <= I_yc/I_y <= 0.9 with the cap channel in the
    // compression flange.
    const Iyf=w.tf*w.bf**3/12,rho=(Iyf+c.Ix)/(2*Iyf+c.Ix);
    if(c.d<w.bf+2*c.tf+.25+(opts.capRoom??0)/inch||w.bf*inch<minFlange-1e-6||w.bf<.6*c.d||(c.d/2-c.tf)*inch*2<opts.minSeat-1e-6||w.d<1.4*c.bf+8||w.d<c.d*.9||rho>.9)continue;
    consider(loadCappedSection(p.section,w.name,ch),`${w.name} + ${ch}`,w.weight+c.weight);
   }
  }
 }
 const ok=trials.filter(t=>t.utilization<=target&&t.deflection<=deflectionTarget&&t.lateral<=deflectionTarget).sort((x,y)=>x.weight-y.weight);
 return ok[0]??trials.sort((x,y)=>Math.max(x.utilization,x.deflection)-Math.max(y.utilization,y.deflection))[0];
}

/** Existing supporting column for the crane: the surveyed W14 the example building has, heavier for heavier cranes. */
export const existingColumnFor=(capacity:number)=>capacity<=7.5?'W14X90':capacity<=15?'W14X120':capacity<=30?'W14X159':'W14X211';
/** New freestanding cantilever column for the crane. */
export const newColumnFor=(capacity:number)=>capacity<=5?'W14X120':capacity<=12.5?'W14X159':capacity<=25?'W14X211':'W14X257';

function shapePlates(name:string){const s=aiscShapeByName(name)!;return {depth:s.d*inch,width:s.bf*inch,flangeThickness:s.tf*inch,webThickness:s.tw*inch};}

/** The parsed, normalized configuration (a blank title becomes 'Crane runway'). */
export const configOf=(input:RunwayConfig)=>normalizeConfig(runwayConfigSchema.parse({...input,title:input.title?.trim()||'Crane runway'}));
/**
 * The project up to the girder: cranes, runway, criteria, duty, rail depth and the girder (named or sized), without
 * connections or supports. `trial` is the sizing result when the girder was sized here.
 */
function skeleton(cfg:RunwayConfig){
 const p=demonstrationProject(),spans=Array.from({length:cfg.bays},()=>cfg.span*foot),L=sum(spans),longest=Math.max(...spans);
 const spectrum=exampleSpectrum(cfg.buildingClass),N=spectrum.total,count=(v:number)=>v.toLocaleString('en-US');
 p.reportPurpose='demonstration';p.reportFormat='compact';p.title=cfg.title;p.number=cfg.number;p.engineer='';
 p.units=cfg.units;p.method=cfg.method;p.scope=cfg.scope;p.system=cfg.system;p.spans=spans;delete p.continuation;
 p.cranes=exampleCranes(cfg,L);
 const wheel=Math.max(...p.cranes[0].wheels.map(w=>w.loaded)),depth=railDepthFor(wheel);
 p.railHeight=depth;p.railEccentricity=.25*inch;p.deadLoad=0;
 p.unbracedLength=p.lateralBraceSpacing=longest;
 const severe=cfg.buildingClass==='A'||cfg.buildingClass==='B';
 p.verticalLimit=severe?1000:cfg.cmaa==='D'?800:600;p.lateralLimit=400;
 p.criteriaSource=`Fictitious example owner criteria: AIST Class ${cfg.buildingClass} building, CMAA Class ${cfg.cmaa} crane; vertical L/${p.verticalLimit}, rail-head lateral L/400.`;
 p.aist={...p.aist!,buildingClass:cfg.buildingClass,classConfirmed:true,buildingCycles:spectrum.repetitions,railDepth:depth,netFlangeArea:0,bottomBraceSpacing:longest,axialLength:longest,torsionalLength:longest,
  runwayOnly:true,supportType:cfg.support==='column-cap'?'column':'bracket',clipSpacing:24*inch,railPad:depth>=5*inch,fastener:'clips',camber:0,fatiguePoint:'bottom-left',
  fatigueReference:'AISC 360 Table A-3.1, 1.1 · plain rolled bottom flange; full detail register in the package',
  cycleSource:`Fictitious example duty: ${count(N)} wheel-induced stress fluctuations in three duty bins (rated, half and light lifts), loaded and empty passes included.`};
 delete p.aist.classBasis;
 p.fatigue={category:'A',cycles:N,detail:'Plain rolled bottom flange; welded attachments are checked separately in the detail register.',location:spans[0]/2};
 // Rail weight per the rail section the details proportion (placeholder until the details are built).
 const railArea=(r:{headWidth:number;headThickness:number;baseWidth:number;baseThickness:number;webThickness:number})=>r.headWidth*r.headThickness+r.baseWidth*r.baseThickness+(depth-r.headThickness-r.baseThickness)*r.webThickness;
 p.railWeight=railArea({headWidth:.55*depth,headThickness:.3*depth,baseWidth:depth,baseThickness:.17*depth,webThickness:.12*depth})*7850*g/1e9;
 const clipWidth=(up(depth,1.5875)<=4.5*inch+1e-6?2:2.5)*inch,minSeat=seatWidthNeeded(depth,clipWidth);
 // Flanges that take the 5 1/2 in gauge of the 3/4 in end bearing bolts with the sleeved slots at the J3.4 edge
 // distance (8 3/8 in), and caps wide enough for the tie gussets beside the W flange (a saddle tie or flexible plate).
 const sizing={minSeat,minFlange:8.5*inch,capRoom:cfg.tie==='cap-angle'||cfg.support==='column-cap'?0:2.5*inch,flexibleTie:cfg.tie==='flexible-plate'};
 // Girder: the named section, else sized for the moving loads.
 let trial:GirderTrial|undefined;
 if(cfg.girder==='capped'){
  if(cfg.girderShape&&cfg.capChannel)p.section=loadCappedSection(p.section,cfg.girderShape,cfg.capChannel);
  else{trial=sizeGirder(p,'capped',sizing);p.section=trial?.section??loadCappedSection(p.section,'W24X94','C15X33.9');}
  const capped=cappedDemonstrationProject().capDesign!;
  p.capDesign={...capped,cmaaClass:cfg.cmaa,dutySource:`Fictitious example: crane supplier confirms CMAA Class ${cfg.cmaa}, ${+cfg.capacity.toFixed(2)}-ton crane; ${count(N)} wheel stress fluctuations`};
 }else{
  if(cfg.girderShape)p.section=loadAiscSection(p.section,cfg.girderShape);
  else{trial=sizeGirder(p,'rolled',sizing);p.section=trial?.section??loadAiscSection(p.section,'W24X104');}
  delete p.capDesign;
 }
 p.section.Fy=50*ksi;p.section.Fu=65*ksi;p.section.E=29000*ksi;
 p.aist.netFlangeArea=p.section.bf*p.section.tf;
 p.drawing={originator:'CraneCalc configurator',checker:'',datumElevation:100*foot,datumLabel:'Reference finished floor',railElevation:cfg.railElevation*foot,
  address:'Fictitious example site',code:{building:'2021 IBC as adopted by the fictitious example jurisdiction',editions:'2016',reviewed:false}};
 delete p.existingColumn;delete p.columnBase;delete p.longitudinalBracing;delete p.columnCap;
 return {p,depth,clipWidth,spectrum,N,trial,railArea};
}

/** What a configuration will produce, for the configurator's summary: crane data, duty, rail and girder. */
export function previewConfig(input:RunwayConfig){
 const {config:cfg,changes}=configOf(input),{p,depth,trial,spectrum}=skeleton(cfg);
 const crane=estimateCrane(cfg.capacity,cfg.craneSpan,cfg.control),structure=cfg.scope==='analysis'?undefined:cfg.structure==='new'?(cfg.columnShape??newColumnFor(cfg.capacity)):cfg.support==='by-others'?undefined:(cfg.columnShape??existingColumnFor(cfg.capacity));
 return {config:cfg,changes,crane,spectrum,railDepth:depth,girder:p.section.name,trial:trial&&{utilization:trial.utilization,deflection:trial.deflection,lateral:trial.lateral,weight:trial.weight},column:structure,verticalLimit:p.verticalLimit};
}

/** The configured project. Unknown supplier, survey and site data are fictitious examples, marked as such. */
export function buildProject(input:RunwayConfig):ProjectInput{
 const cfg=configOf(input).config,{p,depth,clipWidth,spectrum,N,railArea}=skeleton(cfg),spans=p.spans;
 p.configurator={...cfg};
 const scopeText=`${cfg.bays} ${cfg.system==='simple'?'simply supported':'continuous'} ${cfg.span}-ft bay${cfg.bays>1?'s':''}, ${p.section.name} girder${cfg.bays>1?'s':''}, ${cfg.cranes===2?'two':'one'} ${+cfg.capacity.toFixed(2)}-ton ${cfg.control} crane${cfg.cranes===2?'s':''}`;
 if(cfg.scope==='analysis'){
  delete p.details;p.connections.enabled=false;
  p.notes=`Example configuration generated by the CraneCalc configurator from typical crane proportions; fictitious crane and owner data, to be replaced with project data. Scope: girder analysis under supplied loads (${scopeText}). Connections, supports and drawings are not part of an analysis-only package.`;
  return p;
 }

 // Detailed connections for the girder, completed with fictitious example supplier data.
 delete p.details;p.connections.enabled=true;
 const d=neutralDetails(p);p.details=d;delete d.reviewed;
 const r=d.rail;r.name=`Example ${+(depth/inch).toFixed(2)} in crane rail · idealized plate geometry (fictitious; use the rail supplier's section)`;
 r.padSource='Fictitious example RP-01 polyurethane crane-rail pad; allowable compression per the fictitious supplier rating sheet';
 r.clip=exampleClip(r.baseWidth,depth,(clipWidth<2.5*inch?.25:.3125)*inch);
 p.railWeight=railArea(r)*7850*g/1e9;
 d.criteria.railGauge=cfg.craneSpan*foot;
 d.spectrum=spectrum.bins;p.fatigue.cycles=N;
 if(d.endStop)d.endStop.source='Fictitious example supplier data: bumper force, bumper centerline height and contact diameter';
 d.fabrication.steel=p.section.kind==='cap'?'W girder ASTM A992; cap channel and connection plates ASTM A572 Grade 50 unless noted.':'Girder ASTM A992; plates, bars and stiffeners ASTM A572 Grade 50 unless noted.';
 if(p.section.kind==='cap')d.fabrication.welding+=' Cap: continuous fillet each W top-flange edge, with the end development shown. Full cap bearing contact required. Bearing stiffeners CJP to the W top flange, bottom fitted.';
 if(cfg.tie!=='cap-angle'&&d.brace.arrangement==='cap-angle'){d.brace.arrangement='paired-bars';delete d.brace.capAngle;}

 const reach=(cfg.reach??20)*inch,seatLevel=(base:number)=>cfg.railElevation*foot-base-railTopAboveSteel(p)-(p.section.kind==='cap'?p.section.capTw:0)-p.section.d-d.bearing.thickness;
 if(cfg.support==='by-others'){
  // Brackets by others on the existing building: the tie runs to the column face, no supporting column is checked.
  p.notes=`Example configuration generated by the CraneCalc configurator; fictitious crane, supplier and owner data, to be replaced with project data. Scope: ${scopeText}, on existing column brackets by others; the rail, girders, ties to the column face, bearings and end stops. Existing building frames, column brackets, anchors and foundations are excluded.`;
  p.drawing!.existingEvaluation='Fictitious existing structure evaluation: frames, brackets, bracing, connections and foundations for the added crane loads';
 }else if(cfg.structure==='existing'){
  const shape=cfg.columnShape??existingColumnFor(cfg.capacity),w=aiscShapeByName(shape)!,base=cappedDemonstrationProject(),k=cfg.span/25;
  const seat=seatLevel(0),scale=(v:{P:number;Mx:number;My:number;V:number})=>({P:v.P*k,Mx:v.Mx*k,My:v.My,V:v.V*k});
  const e=base.existingColumn!;
  p.existingColumn={...e,shape,d:w.d*inch,bf:w.bf*inch,tf:w.tf*inch,tw:w.tw*inch,Fy:50*ksi,Fu:65*ksi,height:seat+8*foot,seatElevation:seat,Lcx:seat+8*foot,Lcy:8*foot,Lcz:8*foot,Lb:8*foot,
   existing:Object.fromEntries(Object.entries(e.existing).map(([key,v])=>[key,scale(v)])) as typeof e.existing,
   welding:{...e.welding!,grade:'ASTM A992',source:'Fictitious example: mill certificates with the original building records'},
   source:`Fictitious example: survey of the existing ${shape} columns and the original building calculations, column line B`,
   longitudinalExit:'column-strut',service:{...e.service!,source:'Fictitious example: building frame report, 10-year wind and dead/snow runs at the crane girder'},
   frame:{type:'braced',source:'Fictitious example: column line B braced by the roof diaphragm and the sidewall rod bracing'},
   siteSeismic:{...e.siteSeismic!,source:'Fictitious example: site data from the original building report (Site Class D, SDS 0.25, SDC B; steel system not specifically detailed for seismic, R = 3)',
    alteration:{dcrIncrease:.06,source:'Fictitious example: evaluation of the existing bracing and frames with the runway and crane mass added (largest D/C increase 6%)'}}};
  delete p.drawing!.railElevation;
  p.drawing!.existingEvaluation='Fictitious existing structure evaluation: column line B frame, bracing, connections and foundations for the added crane loads';
  p.longitudinalBracing={...base.longitudinalBracing!,bayWidth:cfg.span*foot,height:seat,rod:{...base.longitudinalBracing!.rod,diameter:bracingRod(p,cfg.span*foot,seat)},existing:{W:6*kip,E:3*kip},wind10:3.5*kip,
   source:'Fictitious example: existing sidewall rod bracing at grid lines 2-3 and the original wind/seismic report (10-year wind 3.5 kip on this line)',confirmed:true};
  attachBracket(p,cfg,shape,reach,false);
  p.notes=`Example configuration generated by the CraneCalc configurator; fictitious crane, supplier, survey and owner data, to be replaced with project data. Scope: ${scopeText}, on new ${bracketText(cfg)} welded to the existing ${shape} columns, with the rail, ties, bearings and end stops; the existing columns are checked with their existing load effects and the existing sidewall rod bracing takes the crane longitudinal forces.`;
 }else{
  // New freestanding cantilever columns on spread footings with crane-level rod bracing (newColumnDemonstrationProject).
  const shape=cfg.columnShape??newColumnFor(cfg.capacity),w=aiscShapeByName(shape)!,demo=newColumnDemonstrationProject(),heavy=Math.min(1,Math.max(0,(cfg.capacity-2)/28));
  const baseInput={...structuredClone(demo.columnBase!),
   plate:{...demo.columnBase!.plate,...basePlatePlan(shape),thickness:up((1.25+.75*heavy)*inch,.125*inch)},
   anchors:{...demo.columnBase!.anchors,diameter:(heavy>.5?1.25:1)*inch,embedment:(15+6*heavy)*inch},
   footing:{...demo.columnBase!.footing,L:round((6.5+5*heavy)*foot,.5*foot),B:round((6.5+5*heavy)*foot,.5*foot),thickness:up((24+12*heavy)*inch,inch),bar:(heavy>.5?'#7':'#6') as '#6'|'#7',spacing:10*inch},
   source:'Fictitious example geotechnical report: 3,000 psf allowable (net), base friction 0.35, 120 pcf; interior heated building, frost not applicable. Concrete 4,000 psi; ASTM A615 Grade 60 bars; ASTM F1554 Grade 36 rods'};
  p.columnBase=baseInput;
  const seat=seatLevel(columnBaseElevation(baseInput)),top=seat+d.bearing.thickness+p.section.d+(p.section.kind==='cap'?p.section.capTw:0);
  const c=demo.existingColumn!;
  p.existingColumn={...c,shape,d:w.d*inch,bf:w.bf*inch,tf:w.tf*inch,tw:w.tw*inch,height:top,seatElevation:seat,Lcx:2.1*top,Lcy:top,Lcz:top,Lb:top,
   seismic:{...c.seismic!,source:'Fictitious example site data: SDS 0.20, SD1 0.08, Site Class D, Risk Category II, SDC B',building:{drift:1.5*inch,source:'Fictitious example building report: maximum inelastic displacement 1.5 in at the runway level'}},
   adjacent:{...c.adjacent!,source:'Fictitious example survey: existing column faces located at every grid, footings by test pits'}};
  clearExistingFootings(p);
  delete p.drawing!.existingEvaluation;
  const middle=Math.ceil(cfg.bays/2);
  p.longitudinalBracing={...demo.longitudinalBracing!,bayWidth:cfg.span*foot,height:seat,rod:{...demo.longitudinalBracing!.rod,diameter:Math.max(inch,bracingRod(p,cfg.span*foot,seat))},bays:1,
   source:`Fictitious example: new crane-level rod X-bracing between the new columns at grid lines ${middle}-${middle+1}; no building wind or seismic on this line`,confirmed:true,
   design:{...structuredClone(demo.longitudinalBracing!.design!),spans:[middle]}};
  // The clevis pin is at least the rod diameter.
  const bd=p.longitudinalBracing.design!;bd.pin={...bd.pin,diameter:Math.max(bd.pin.diameter,p.longitudinalBracing.rod.diameter)};
  if(cfg.support==='column-cap'){
   const col=p.existingColumn;d.bracket={...structuredClone(demo.details!.bracket!),enabled:false};
   if(d.brace.flangeAttachment)d.brace.flangeAttachment.enabled=false;p.aist!.supportType='column';
   if(d.endBearing)d.endBearing.enabled=true;
   col.height=col.seatElevation;col.Lcx=2.1*col.height;col.Lcy=col.height;col.Lcz=col.height;col.Lb=col.height;
   p.columnCap={...structuredClone(defaultColumnCap),enabled:true};
   // The cap plate covers the column and both girder bearings.
   p.columnCap.plate={...p.columnCap.plate,width:Math.max(p.columnCap.plate.width,up(w.bf*inch+1.5*inch,.5*inch))};
   // The girder's bearing stiffener pair lands between the column flanges.
   const clear=(w.d-2*w.tf)*inch;d.bearing.stiffenerWidth=Math.min(d.bearing.stiffenerWidth,Math.floor((clear-p.section.tw)/2/(inch/8)+1e-9)*inch/8);
   p.longitudinalBracing.height=col.seatElevation-capWorkPointDrop(p);
  }else attachBracket(p,cfg,shape,reach,true);
  p.notes=`Example configuration generated by the CraneCalc configurator; fictitious crane, supplier, site and owner data, to be replaced with project data. Scope: ${scopeText}, on new freestanding ${shape} columns with ${cfg.support==='column-cap'?'column caps':bracketText(cfg)}, base plates, anchor rods and spread footings, and crane-level rod X-bracing; the existing building carries no crane load. Seismic: ordinary steel cantilever column system across the runway and rod bracing not specifically detailed for seismic resistance along it, Seismic Design Category B.`;
 }
 attachTie(p,cfg);
 // The supports carry the bracket (or cap) and tie before the new column bases are sized for their reactions.
 const q=withHaunch(p,cfg);
 return cfg.structure==='new'?withColumnBase(q,cfg):q;
}
/**
 * The tapered haunch sized for the reactions. A new column carries the haunch without continuity plates, which would
 * clash with the bracing gussets on its web: the next heavier W14 until the sizing needs none.
 */
function withHaunch(p:ProjectInput,cfg:RunwayConfig):ProjectInput{
 const b=p.details?.bracket;
 if(!b?.enabled||b.arrangement!=='tapered-haunch')return p;
 const sized=sizeTaperedHaunch(p);
 if(cfg.structure!=='new'||cfg.columnShape||!sized.details!.bracket!.columnStiffeners?.enabled)return sized;
 for(const shape of heavierColumns(p.existingColumn!.shape)){
  const q=structuredClone(p),w=aiscShapeByName(shape)!,c=q.existingColumn!;
  Object.assign(c,{shape,d:w.d*inch,bf:w.bf*inch,tf:w.tf*inch,tw:w.tw*inch});
  q.details!.bracket!.receiver={...q.details!.bracket!.receiver,...shapePlates(shape),source:`New ${shape} column designed here; no other loads`};
  if(q.columnBase)q.columnBase.plate={...q.columnBase.plate,...basePlatePlan(shape)};
  delete q.details!.bracket!.haunch;delete q.details!.bracket!.columnStiffeners;
  q.details=selectBracketArrangement(q.details!,'tapered-haunch',q.system);
  const r=sizeTaperedHaunch(q);
  if(!r.details!.bracket!.columnStiffeners?.enabled){r.notes=r.notes.replaceAll(p.existingColumn!.shape,shape);return r;}
 }
 return sized;
}
/** Sizing target of the new column bases. */
const baseTarget=.9;
/**
 * New columns: the base plates, anchor rods and footings sized for the reactions (sizeColumnBase), and the existing
 * building's column lines moved clear of the sized footings. Where the column chosen here is too flexible for the
 * runway drift with its footing rotating on the soil, the project is built on the lightest heavier W14 that meets the
 * drift: one whose own drift leaves the footing room (at most columnDriftShare of the target, the footing sized for the
 * rest), or that meets it on the footing already sized; the configuration keeps its blank column choice.
 */
function withColumnBase(p:ProjectInput,cfg:RunwayConfig):ProjectInput{
 const q=sizeColumnBase(p,baseTarget);clearExistingFootings(q);
 if(cfg.columnShape||baseSizingRatios(q).ratios.drift<=baseTarget)return q;
 const reactions=supportReactions(q,sectionProperties(q.section));
 for(const shape of heavierColumns(q.existingColumn!.shape)){
  const t=structuredClone(q),w=aiscShapeByName(shape)!;
  Object.assign(t.existingColumn!,{shape,d:w.d*inch,bf:w.bf*inch,tf:w.tf*inch,tw:w.tw*inch});
  if(t.details?.bracket?.enabled)Object.assign(t.details.bracket.receiver,shapePlates(shape));
  const d=baseDrift(t,existingColumnAnalysis(t,reactions));
  if(d.total>baseTarget*d.limit&&d.column>columnDriftShare*baseTarget*d.limit)continue;
  const r=buildProject({...cfg,columnShape:shape});
  if(baseSizingRatios(r).ratios.drift<=baseTarget)return {...r,configurator:{...cfg}};
 }
 return q;
}
/**
 * The existing building's column lines stand far enough outboard that the new footings clear theirs by the required
 * clear distance with 3 in to spare (across the runway: both footings' L).
 */
function clearExistingFootings(p:ProjectInput){
 const adj=p.existingColumn?.adjacent,ft=p.columnBase?.footing;if(!adj||!ft)return;
 const outboard=(line:NonNullable<typeof adj.A>)=>({...line,offset:Math.max(line.offset,up(ft.L/2+line.footing.L/2+adj.footingClear+3*inch,6*inch))});
 adj.A=adj.A&&outboard(adj.A);adj.B=adj.B&&outboard(adj.B);
}
/**
 * Rod diameter of one braced bay of X-bracing for the crane's longitudinal forces: the bumper force plus the traction
 * of all cranes along the diagonal, against 0.75 F_u A_b/0.75 of an A36 rod's threaded area with 25% to spare for the
 * building's own wind and the rod's fatigue.
 */
function bracingRod(p:ProjectInput,bay:number,height:number){
 const F=Math.max(...p.cranes.map(c=>c.design?.bumperForce??0))+p.cranes.reduce((n,c)=>n+c.longitudinal,0),T=1.25*F*Math.hypot(bay,height)/bay;
 return [.75,1,1.25,1.5,1.75,2].map(d=>d*inch).find(d=>.75*.75*58*ksi*Math.PI*d*d/4>=T)??2*inch;
}
/** Base plate plan for a column shape: the anchor rows clear the column flange welds and plate washers. */
function basePlatePlan(shape:string){const w=aiscShapeByName(shape)!;return {N:up(w.d*inch+9.5*inch,.5*inch),B:up(w.bf*inch+3.5*inch,.5*inch)};}
/** W14 column shapes heavier than the given one, lightest first. */
const heavierColumns=(shape:string)=>{const w=aiscShapeByName(shape)!;return aiscWShapes.filter(s=>s.name.startsWith('W14X')&&s.weight>w.weight&&s.weight<=398).sort((a,b)=>a.weight-b.weight).map(s=>s.name).slice(0,8);};

const bracketText=(cfg:RunwayConfig)=>({'twin-rib':'welded twin-rib bracket seats','haunched-seat':'welded haunched rib seats','rolled-corbel':'rolled W-stub brackets','tapered-haunch':'built-up tapered I haunches','by-others':'brackets by others','column-cap':'column caps'})[cfg.support];

/**
 * The welded bracket of the configured kind on the supporting column: the receiving column is the column shape, the
 * bracket reaches the girder web line, and the tie between the girder and the column face spans the rest.
 */
function attachBracket(p:ProjectInput,cfg:RunwayConfig,shape:string,reach:number,isNew:boolean){
 const d=p.details!,plates=shapePlates(shape),col=p.existingColumn!,heavy=cfg.capacity>10;
 const receiver={...plates,Fy:col.Fy,Fu:col.Fu,unbracedLength:isNew?col.height:8*foot,axialDemand:isNew?0:Math.round(1.2*col.existing.D.P+1.6*col.existing.S.P),confirmed:true,
  source:isNew?`New ${shape} column designed here; no other loads`:`Fictitious example survey: existing ${shape} column, ASTM A992 per mill certificates; 8 ft flange unbraced length (girts); factored existing gravity axial 1.2D + 1.6S from the building records for the panel zone.`};
 const kind=cfg.support as Exclude<RunwayConfig['support'],'by-others'|'column-cap'>;
 const base=cappedDemonstrationProject().details!.bracket!;
 let b={...structuredClone(base),reach,receiver,loadPathConfirmed:true};
 delete b.columnStiffeners;
 // The seat carries both bearings and reaches past the far bearing edge; ribs straddle the bearing bolts on the column
 // flange (the welded rib seats are sized below).
 b.seatProjection=Math.max(b.seatProjection,up(reach+d.bearing.width/2+1.5*inch,inch));
 b.ribSpacing=Math.min(b.ribSpacing,plates.width-2*inch);
 if(heavy){b.ribThickness=Math.max(b.ribThickness,1.5*inch);b.seatThickness=Math.max(b.seatThickness,2*inch);b.rootWeld=Math.max(b.rootWeld,.5*inch);}
 d.bracket=b;
 p.details=selectBracketArrangement(d,kind,p.system);b=p.details.bracket!;
 if(kind==='haunched-seat'){b.tipDepth=Math.max(6*inch,up(b.ribDepth/3,inch));}
 if(kind==='rolled-corbel'){
  b.corbelShape=cfg.capacity<=10?'W12X65':cfg.capacity<=20?'W12X87':'W12X106';b.seatThickness=1.5*inch;b.seatWeld=.375*inch;
  b.rolled={...defaultRolledBracket,flangeJoint:'cjp',webWeld:.3125*inch,stiffenerThickness:.5*inch,stiffenerWeld:.25*inch,seatPlate:true};
  p.details.endBearing!.bolts.edge=2.125*inch;
 }
 if(kind==='tapered-haunch'){delete b.haunch;p.details=selectBracketArrangement(p.details,'tapered-haunch',p.system);b=p.details.bracket!;}
 // The welded rib seats are sized for the reactions: ribs, seat, fillets, the rib spacing under the girder bearing
 // stiffeners and any continuity plates the receiving column needs (where they clear a new column's bracing gussets);
 // without a configured reach, one that leaves the top-flange tie the clear length its movement needs.
 if(kind==='twin-rib'||kind==='haunched-seat'){p.details.bracket=sizeWeldedBracket(p,.9,{reach:cfg.reach===undefined?'tie':'fixed'}).details!.bracket;b=p.details.bracket!;}
 // The tie spans from its girder end to the column face at the bracket reach.
 const t=p.details.brace,f=t.flangeAttachment;
 if(f?.enabled&&f.columnFace!==undefined){const shift=b.reach-f.columnFace;t.length+=shift;t.reach=t.length;delete f.columnFace;}
}

/** The configured tieback on the details. */
function attachTie(p:ProjectInput,cfg:RunwayConfig){
 const d=p.details!;
 if(cfg.support==='column-cap')return;
 if(cfg.tie==='flexible-plate'){
  p.details=selectTieArrangement(d,'flexible-plate');
  const t=p.details.brace,light=cfg.capacity<=5,thickness=(light?.25:cfg.capacity<=15?.375:.5)*inch;
  Object.assign(t,{thickness,width:Math.max(t.width,6*inch),gussetThickness:Math.max(t.gussetThickness,2*thickness)});
  Object.assign(t.connection,{thickness});t.connection.weldLength=columnGussetHeight(p);
 }else if(cfg.tie==='cap-angle'&&p.section.kind==='cap'){
  p.details=selectTieArrangement(d,'cap-angle');
  p.details.brace.capAngle=sizeCapAngle(p,capAngleForceEstimate(p));
 }else if(d.brace.arrangement!=='paired-bars'){
  d.brace.arrangement='paired-bars';delete d.brace.capAngle;
 }
}

/** Fill a configuration's derived values for display: the crane estimate and the building class count. */
export function configSummary(cfg:RunwayConfig){
 const e=estimateCrane(cfg.capacity,cfg.craneSpan,cfg.control),s=exampleSpectrum(cfg.buildingClass);
 return {crane:e,spectrum:s,impliedClass:classFromCycles(s.total)};
}

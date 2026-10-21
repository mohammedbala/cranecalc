/**
 * Quick configurator: a complete runway project from a few choices (RunwayConfig). Every dependent input follows from
 * them: the crane data from the capacity and span with consistent statics and bumper data, the rail from the wheel
 * load, the girder sized for the moving loads, the detailed connections from the girder (neutralDetails), and the
 * supports, tieback and supporting columns as chosen. Supplier, survey and site data the configurator cannot know
 * are filled with clearly marked fictitious example values so the package calculates at once; a project package
 * blocks them until they are replaced (packageContentChecks). Canonical units N, mm, MPa.
 */
import type {Crane,ProjectInput,Section} from './types';
import {format as formatUnits} from './units';
import type {RunwayDetails} from './runwayDetails';
import {runwayConfigSchema,supportLabels,tieLabels,type ConfigSelection,type RunwayConfig} from './configInputs';
import {demonstrationProject,cappedDemonstrationProject,newColumnDemonstrationProject} from './demonstration';
import {neutralDetails} from './detailTemplate';
import {sizeEndStop} from './endStopSizing';
import {emptyCraneDesign,craneDesignMinimum,craneCombinations} from './aistLoads';
import {railClipResponse} from './railClip';
import {emptyCapDesign} from './capDesignInputs';
import {aiscWShapes,aiscShapeByName,loadAiscSection} from '../data/aiscSections';
import {aiscChannelByName,loadCappedSection} from '../data/aiscChannels';
import {sectionProperties} from './section';
import {available,girderStrength} from './aiscStrength';
import {movingAnalysis} from './analysis';
import {fatigueSpectrumBin,railClipCategory} from './detailAnalysis';
import {selectBracketArrangement,selectTieArrangement,tieArrangement,tieOptions} from './connectionOptions';
import {sizeTaperedHaunch} from './taperedHaunchSizing';
import {baseSizingRatios,columnDriftShare,sizeColumnBase} from './columnBaseSizing';
import {bracingRatios,columnTorsionRatio,sizeBracing,sizeTorsionStrut,twistMovementTarget,withTwistMovementTarget} from './bracingSizing';
import {bracingDesign,defaultTorsionBrace,designsBracing,girderOffset,torsionBraceActive} from './newColumnBracing';
import {longitudinalBracingAnalysis,longitudinalBracingChecks} from './longitudinalBracing';
import {supportReactions} from './supportReactions';
import {existingColumnAnalysis,existingColumnChecks,existingColumnSection,twistMovementLimit} from './existingColumn';
import {existingWeldingDemand} from './existingWelding';
import {baseDrift,footingsOf} from './columnBase';
import {sizeCapAngle,capAngleForceEstimate,validateCapAngle,capAngleSizingRatios,capAngleFits,capAngleWrenchSetback} from './capAngleTie';
import {simpleSupportInput,railClipStations} from './simpleSupports';
import {seatSettingTolerance} from './fitTolerances';
import {sizeWeldedBracket,bracketColumnFatigueRatio} from './bracketSizing';
import {sizeRolledBracket} from './rolledBracketSizing';
import {sizeColumnCap,columnCapSizingRatios} from './columnCapSizing';
import {defaultRolledBracket,isRolledBracket} from './rolledBracketInputs';
import {activeColumnCap,defaultColumnCap} from './columnCapInputs';
import {capWorkPointDrop,columnCapGeometry} from './columnCap';
import {columnBaseElevation} from './columnBaseInputs';
import {railTopAboveSteel} from './railSeat';
import {cantileverHeightLimit} from './runwaySeismic';
import {columnGussetHeight,flangeTieFamily,flangeTieGeometry,stiffenerTieGeometry,stiffenerTieJoint} from './tieGeometry';
import {sizeFlangeTie,sizingLimit,tieSizingRatios,girderEndEstimate,tieSizingDemands,tieOnBearingStiffener,bracketServiceDeflection} from './flangeTieSizing';
import {designSplices,type SplicesDesigned} from './spliceSizing';
import {practicalPieceLength} from './girderPieces';
import {applyBearingLayout,bearingSeat,defaultBearingShim,capTieBearingLength} from './endBearing';
import {validateRunwayDetails} from './detailValidation';
import {stiffenerGussetMisfit} from './connectionCoordination';
import {weldedRibBracket} from './bracketRib';
import {classFromCycles} from './buildingClass';
import {tiedToBuilding,type ColumnTieInput} from './craneColumnInputs';
import {buildingColumnProject,columnPlates,columnShortening,columnTieCapacities,columnTieGeometry,craneColumnLayout,girderTieFace} from './craneColumn';
import {validateColumnCap} from './columnCap';
import {minimumEdge,capAngleGeometry} from './capAngle';
import {flangeStrengths} from './designAnalysis';
import {transverseFilletFatigue,minimumFillet} from './connectionStrength';
import {stiffenerPairSection} from './detailChecks';
import {finiteLife,fatigueThreshold} from './fatigueConstants';
import {columnReactionOffset} from './existingColumn';
import {stepGeometry,steppedColumnAnalysis,steppedColumnChecks,stepWeldThickness} from './steppedColumn';
import {stepStrutChecks,stepStrutLayout,type StepStrutForces} from './craneLevelStrut';
import {bumperAtGrids,locatingGrids} from './columnSupport';
import {craneLevelStrut} from './existingColumn';
import type {SupportReactionSet} from './supportReactions';
import {activeStep} from './steppedColumnInputs';
import {independentBearings} from './simpleSupports';
import {twistRotationLimit,twistSlip} from './columnTwistLimit';

const inch=25.4,foot=304.8,kip=4448.2216152605,ksi=6.894757293168,fpm=5.08,g=9.80665;
/** Fictitious example allowable lateral bearing (passive) pressure, 150 psf/ft (IBC 2018 Table 1806.2, sandy soils). */
const examplePassive=150*1.570874638e-7;
const up=(v:number,step:number)=>Math.ceil(v/step-1e-9)*step,round=(v:number,step:number)=>Math.round(v/step)*step;
const sum=(a:number[])=>a.reduce((s,v)=>s+v,0);

/** Configuration choices that cannot go together, adjusted to the nearest valid set with a reason for each change. */
export function normalizeConfig(input:RunwayConfig):{config:RunwayConfig;changes:string[];rules:ConfigRule[]}{
 const c={...input},changes:string[]=[],rules:ConfigRule[]=[];
 const fix=(when:boolean,patch:Partial<RunwayConfig>,why:string)=>{if(when){
  for(const [field,to] of Object.entries(patch) as [ConfigRule['field'],string][])if(c[field]!==to)rules.push({field,from:String(c[field]),to,why});
  Object.assign(c,patch);changes.push(why);}};
 if(c.scope==='analysis')return {config:c,changes,rules};
 // A capped girder longer than a practical piece has no designed field splice (spliceInputs.ts: the cap channel would
 // need its own splice): its web is the rail seat, so splice plates and bolt heads on it clash with the rail and clips,
 // and a staggered field CJP splice of the channel and the W top flange lies under the wheels (a transverse groove weld
 // in the fatigue-loaded top flange, AISC 360 App. 3 Table A-3.1 Section 5). Simple spans keep every piece one bay
 // long (AISC DG7 favours simple-span runway girders).
 fix(c.girder==='capped'&&c.system==='continuous'&&c.bays*c.span*foot>practicalPieceLength+1e-6,{system:'simple'},`A continuous capped girder over ${+(practicalPieceLength/foot).toFixed(0)} ft needs field splices of the W and the cap channel, which this calculation does not design (the channel web is the rail seat, so splice plates clash with the rail and clips, and a field CJP splice of the cap lies in the fatigue-loaded top flange under the wheels): the capped girders are simple spans, one bay long (AISC DG7 favours simple-span runway girders).`);
 fix(c.support==='column-cap'&&c.structure!=='new',{structure:'new'},'A column cap sits on new freestanding columns: the columns are new.');
 // New freestanding columns are crane columns themselves: there is no building column to tie to or column step to bear on.
 fix(c.structure==='new'&&(c.support==='crane-column'||c.support==='stepped-column'),{support:'column-cap'},`New freestanding columns are crane columns themselves, with no existing building column to ${c.support==='crane-column'?'tie a crane column to':'bear on at a column step'}: the girders bear on column caps over the new columns.`);
 // New freestanding columns are an ASCE 7-16 cantilever column system across the runway (runwaySeismic.ts, Table
 // 12.2-1 G, §12.2.5.2), which validateExistingColumn limits to 35 ft from the base. The column stops at the top of the
 // girder (bracket seats) or under it (column cap), below the top of rail, and its base plate sits on the grout above
 // the floor (columnBaseElevation ≥ 0 with the footings flush with the slab), so a top of rail at most 35 ft above the
 // floor keeps every new column within the limit, whatever girder the sizing chooses.
 if(c.structure==='new'&&c.railElevation*foot>cantileverHeightLimit+1e-6){const from=c.railElevation,to=cantileverHeightLimit/foot;c.railElevation=to;
  changes.push(`New freestanding runway columns are a cantilever column system (ASCE 7 Table 12.2-1, §12.2.5.2), limited to ${to} ft from the column base: the top of rail is lowered from ${from} ft to ${to} ft above the floor (the columns stop below the rail). A higher runway needs columns tied to a building frame: an existing building with crane columns tied to its columns, or its stepped columns.`);}
 fix(c.structure==='new'&&c.support==='by-others',{support:'twin-rib'},'New columns carry a bracket designed here: the support is the welded twin-rib seat.');
 fix(c.tie==='cap-angle'&&c.girder!=='capped',{tie:'paired-bars'},'The cap tieback angle bolts to a channel cap: the tie is paired flat bars on this rolled girder.');
 fix(c.tie!=='paired-bars'&&c.system==='continuous',{tie:'paired-bars'},'Continuous girders are tied at the bearing stiffeners: the tie is paired flat bars.');
 fix(c.support==='column-cap'&&c.tie!=='paired-bars',{tie:'paired-bars'},'A girder on a column cap is held by the cap stiffeners (fork support): no flange tie.');
 fix(c.support==='by-others'&&c.system==='continuous',{support:'twin-rib'},'A continuous girder needs a seat designed here for the stiffener ties: the support is the welded twin-rib seat.');
 // The girder web over the lower shaft's crane-side flange sets a stepped column's reach (the step geometry).
 if(c.support==='stepped-column'&&c.reach!==undefined){delete c.reach;changes.push('On a column step the girder bears over the lower shaft\'s crane-side flange: the reach comes from the column geometry, not the entered reach.');}
 // The lower shaft of a stepped column holds the upper shaft within its flanges (validateSteppedColumn) with the tie room
 // past the girder flange that withSteppedColumn gives its own choice: at least as wide, and d_l − d_u − t_fl/2 at least
 // the girder half flange (the named girder or cap, else the least 8 1/2 in flange) plus 6 in.
 if(c.support==='stepped-column'&&c.columnShape){const lo=aiscShapeByName(c.columnShape),hi=aiscShapeByName(c.buildingColumnShape??existingColumnFor(c.capacity));
  const girder=c.girder==='capped'?aiscChannelByName(c.capChannel??'')?.d:aiscShapeByName(c.girderShape??'')?.bf,half=(girder??8.5)/2;
  if(lo&&hi&&(lo.bf<hi.bf-1e-9||lo.d-hi.d-lo.tf/2-half<6-1e-9)){changes.push(`The lower shaft of a stepped column holds the upper shaft within its flanges, at least as wide and deep enough for the top-flange tie past the girder flange (6 in of tie room): the ${c.columnShape} lower shaft does not hold the ${hi.name} upper shaft so, and the lower shaft is chosen for the crane.`);delete c.columnShape;}}
 return {config:c,changes,rules};
}
/** One configuration choice a rule changed (normalizeConfig, or the AIST column-bracket screen): the field, as it was, as it became and why. */
export interface ConfigRule {field:'structure'|'support'|'tie'|'system'|'girder';from:string;to:string;why:string}

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

/**
 * AIST TR-13 Table 3.2 crane type of the configured crane: as configured, else a maintenance (standby) crane for CMAA
 * Class A service and a mill crane otherwise (the TR-13 row for production cranes in a steel mill building; cab side
 * thrust 0.4Q, impact 25%). Pendant cranes: maintenance, which sets no load (their side thrust is 0.1(Q + T + B)).
 */
export const configCraneType=(cfg:RunwayConfig)=>cfg.aistType??(cfg.control==='pendant'||cfg.cmaa==='A'?'maintenance':'mill');
/** The TR-13 side-thrust rule of the configured crane, for the configurator's summary. */
export function sideThrustRule(cfg:RunwayConfig){
 const type=configCraneType(cfg),eta={mill:.4,maintenance:.3,magnet:1,stacker:2}[type];
 return {type,rule:cfg.control==='pendant'?'0.1(Q + T + B), pendant operation (TR-13 Table 3.2), at least 0.2(Q + T) (ASCE 7 §4.9.4)':type==='stacker'?'max(2.0Q, 0.4(Q + T + A), 0.15(Q + T + B + A)) (TR-13 Table 3.2, stacker)':`max(${eta}Q, 0.2(Q + T), 0.1(Q + T + B)) (TR-13 Table 3.2, ${type} crane, cab or radio operated)`};
}
/**
 * Assumed bumper overhang, end-wheel centerline to the face of the extended bumper: 18 in (the end truck beyond the wheel
 * and the bumper body, a typical supplier proportion) plus the bumper stroke. Stated in the project notes as assumed.
 */
export const exampleBumperOverhang=(e:Pick<CraneEstimate,'stroke'>)=>up(18*inch+e.stroke,inch);
const overhangNote=(e:Pick<CraneEstimate,'stroke'>)=>`Bumper overhang assumed ${+(exampleBumperOverhang(e)/inch).toFixed(2)} in (end-wheel centerline to the extended bumper face, a typical supplier proportion): the stop contact positions use it; confirm with the crane supplier.`;
/** The configured crane(s), with the side thrust at the design minimum and the traction of half the wheels driven. */
export function exampleCranes(cfg:RunwayConfig,length:number):Crane[]{
 const e=estimateCrane(cfg.capacity,cfg.craneSpan,cfg.control),tons=+cfg.capacity.toFixed(2),n=e.offsets.length,last=e.offsets.at(-1)!;
 const crane=(i:number):Crane=>{
  const c:Crane={id:`crane-${i+1}`,name:`Example crane CR-${i+1} · ${tons} US tons`,
   wheels:e.offsets.map(offset=>({offset,loaded:e.Pmax,unloaded:e.Pempty,lateral:0})),impact:e.impact,includesImpact:false,
   longitudinal:Math.max(.2*e.driven,.1*n*e.Pmax),minSeparation:4*foot,travelStart:-last,travelEnd:length,
   operatingClass:`CMAA Class ${cfg.cmaa} ${cfg.control} crane; AIST Class ${cfg.buildingClass} building (example)`,
   loadSource:`Fictitious example supplier schedule: typical proportions of a ${tons}-ton ${e.double?'double':'single'}-girder ${cfg.control}-operated crane, ${+cfg.craneSpan.toFixed(1)} ft span; replace with the crane supplier's wheel loads`,
   design:{...emptyCraneDesign,control:cfg.control,type:configCraneType(cfg),ratedLoad:e.Q,trolleyWeight:e.T,bridgeWeight:e.B,drivenWheelLoad:e.driven,sideShare:.5,
    distributionSource:'Fictitious example: one-half of the crane side thrust assigned to this runway (no stiffness analysis of both runways)',splitConfirmed:true,
    bumperForce:e.bumper,bumperBypassesGirder:false,guideRollers:false,cmaaClass:cfg.cmaa,bridgeSpeed:e.speed,minWheelLoad:e.Pmin,bumperStroke:e.stroke,bumperEfficiency:e.efficiency,
    // Assumed end-truck geometry (exampleBumperOverhang), so the stop contacts follow the stop face.
    bumperOverhang:exampleBumperOverhang(e)}};
  const side=craneDesignMinimum(c).runwaySide/n;c.wheels=c.wheels.map(w=>({...w,lateral:side}));
  return c;
 };
 return cfg.cranes===2?[crane(0),crane(1)]:[crane(0)];
}

/** Rail depth for the maximum static wheel load (typical crane-rail selection, lighter rails for light wheels). */
export function railDepthFor(wheel:number){const P=wheel/kip;return (P<=10?3.5:P<=20?4.25:P<=32?5.25:6)*inch;}
/** Fictitious example rail clip for a rail base of the width: light series below a 4 1/2 in base; weld-on or bolted. */
export function exampleClip(railBase:number,depth:number,weld:number,type:'weld-on'|'bolted'='weld-on'):NonNullable<RunwayDetails['rail']['clip']>{
 const light=railBase<=4.5*inch+1e-6,across=(light?2:2.5)*inch;
 return {type,product:type==='bolted'?`Fictitious example data RC-B${light?'L':''}: bolted floating crane rail clamp plate for a ${+(depth/inch).toFixed(2)} in rail, or equal`:`Fictitious example data RC-W${light?'L':''}: weld-on floating crane rail clip for a ${+(depth/inch).toFixed(2)} in rail, or equal`,basis:'allowable',
  lateral:(light?6:10)*kip,uplift:(light?3:5)*kip,baseLength:3.75*inch,baseWidth:across,baseThickness:.75*inch,weld,weldLength:across};
}

/**
 * The top plate's fatigue at the weld-on rail clips before the analysis, by the project's method as the register
 * reports it (detail-full-cycle-RC: the all-cycle bound, the rated-lift range at every one of the n_SR cycles against
 * F_SR without the threshold; Miner's equivalent range never exceeds it): the clip base an AISC Table A-3.1 item 7.1
 * attachment (railClipCategory, Category D for the example base). The range at the largest crane moment without impact
 * is the vertical bending stress at the top of the girder plus the lateral bending of the top flange (with any cap
 * channel) at its tip under the full side thrust, which bounds the fatigue side thrust with the flange warping
 * (AIST TR-13 §3.10.2.3; AISC DG7). ratio > 1: the clips are bolted clamp plates instead, holes for pretensioned bolts
 * through the top plate (item 2.2, Category B), as AISC DG7 and AIST TR-13 allow.
 */
export function railClipFatigue(p:ProjectInput){
 const clip=p.details?.rail.clip,cycles=p.fatigue.cycles;
 if(!clip||clip.type==='bolted'||cycles<2e4)return {ratio:0,why:''};
 const s=p.section,pr=sectionProperties(s),a=movingAnalysis(p,pr,8),impact=Math.max(0,...p.cranes.map(c=>c.impact));
 const cap=s.kind==='cap'?aiscChannelByName(s.capCatalogueId??''):undefined,Iyt=s.tf*s.bf**3/12+(cap?cap.Ix*inch**4:0),half=s.kind==='cap'?s.capWidth/2:s.bf/2;
 const vertical=(a.demand.moment-a.deadMoment)/(1+impact)*(s.d+(s.kind==='cap'?s.capTw:0)-pr.cy)/pr.Ix,lateral=a.demand.lateralMoment*half/Iyt,range=vertical+lateral;
 const category=railClipCategory(clip),allowable=fatigueSpectrumBin(category,range,cycles).allowable,ratio=range/allowable,ksiOf=(v:number)=>p.units==='SI'?`${v.toFixed(1)} MPa`:`${(v/6.894757).toFixed(2)} ksi`;
 return {ratio,why:`Weld-on clip bases on the ${s.kind==='cap'?'cap channel web':'top flange'} are an AISC Table A-3.1 item 7.1 attachment, Category ${category==='E1'?'E′':category}: the estimated top-plate range ${ksiOf(range)} (rated-lift crane moment without impact plus the top-flange lateral bending under the side thrust) at all ${cycles.toLocaleString('en-US')} cycles exceeds F_SR = ${ksiOf(allowable)} (ratio ${ratio.toFixed(2)}, the project's all-cycle method). Bolted clamp plates leave holes for pretensioned bolts (item 2.2, Category B), as AISC DG7 and AIST TR-13 allow.`};
}
/**
 * The weld-on clip base welds' strength before the analysis (rail-clip-weld, railChecks.ts): the factored side thrust of
 * the wheel group at a clip station, every wheel within the clip window (the clip spacing, at least 2(h_r + t_f), as
 * detailAnalysis groups them; two cranes at their minimum separation counted as wheels of one group where they fall in
 * it), the largest side-thrust factor of the strength combinations, on ONE clip in both of its roles (railClipResponse,
 * no sharing with the neighboring clips), against φ(0.6F_EXX) (AISC 360-16 J2.4). ratio > 1: the clips are bolted clamp
 * plates instead (no base welds), as AISC DG7 and AIST TR-13 allow.
 */
export function railClipWeldStrength(p:ProjectInput){
 const clip=p.details?.rail.clip;
 if(!clip||clip.type==='bolted'||!p.aist)return {ratio:0,why:''};
 const window=Math.max(p.aist.clipSpacing,2*(p.aist.railDepth+p.section.tf)),factor=Math.max(0,...craneCombinations(p.method,p.aist.concurrency==='full').map(c=>c.h));
 // Wheels along the rail: the cranes in order, each next crane at the minimum separation past the last wheel.
 const wheels:{x:number;h:number}[]=[];let start=0;
 for(const c of p.cranes){for(const w of c.wheels)wheels.push({x:start+w.offset,h:w.lateral});start+=Math.max(0,...c.wheels.map(w=>w.offset))+c.minSeparation;}
 const H=factor*Math.max(0,...wheels.map(w=>sum(wheels.filter(v=>v.x>=w.x-1e-6&&v.x<=w.x+window+1e-6).map(v=>v.h))));
 const stress=railClipResponse(p,H).weldStress,Fexx=p.details!.material.Fexx,capacity=available(.6*Fexx,p.method,.75,2),ratio=stress/capacity;
 const kipOf=(v:number)=>p.units==='SI'?`${(v/1000).toFixed(1)} kN`:`${(v/kip).toFixed(1)} kip`,ksiOf=(v:number)=>p.units==='SI'?`${v.toFixed(0)} MPa`:`${(v/ksi).toFixed(1)} ksi`;
 return {ratio,why:`The weld-on clip base welds: the factored side thrust ${kipOf(H)} of the wheel group at a clip station on one clip gives a weld stress ${ksiOf(stress)} against φ(0.6F_EXX) = ${ksiOf(capacity)} (ratio ${ratio.toFixed(2)}, AISC 360-16 J2.4). Bolted clamp plates have no base welds (holes for pretensioned bolts through the top plate, AISC Table A-3.1 item 2.2, Category B), as AISC DG7 and AIST TR-13 allow.`};
}
/** Least flange width (W, or the cap web inside the channel flanges) that seats the rail and its clips. */
export function seatWidthNeeded(depth:number,clipWidth:number,tolerance=.125*inch){return 2*(tolerance+up(depth,1.5875)/2+clipWidth);}

/**
 * Girder candidates: compact rolled W beams 12 to 40 in deep, without the column shapes (W12 and W14 sections with
 * flanges 12 in wide or more, the jumbo W14s among them): a runway those would carry takes a deeper beam, a capped
 * girder, else a built-up plate girder (sizeGirder reports it).
 */
export const girderCandidate=(s:{name:string;bf:number})=>!(/^W1[24]X/.test(s.name)&&s.bf>=12-1e-9);
const wCandidates=()=>aiscWShapes.filter(s=>s.d>=12&&s.d<=40&&girderCandidate(s)&&s.bf/(2*s.tf)<=.38*Math.sqrt(29000/50)&&(s.d-2*s.kdes)/s.tw<=3.76*Math.sqrt(29000/50)).sort((a,b)=>a.weight-b.weight);
const capChannels=['C10X15.3','C12X20.7','C12X25','C15X33.9','C15X40','C15X50','MC18X42.7'];
/**
 * Least clear pocket each side between the W top flange tip and the inside of the cap channel flange, where the
 * continuous cap-to-flange fillet is laid: 1 1/2 in for a manual or semi-automatic fillet (2 in would be needed for
 * submerged arc welding). capChecks cap-weld-pocket-clear checks it for named sections.
 */
export const capWeldPocket=1.5*inch;
export interface GirderTrial {name:string;weight:number;utilization:number;deflection:number;lateral:number;shear:number;section:Section;
 /** The governing sizing ratio: top-flange tip stress with warping and second-order twist, the H1 top-flange interaction with the load-height LTB strength, or the elastic stability margin. */
 governs:string;
 /**
  * Why it was chosen, for the configurator selection log: whether it met the sizing targets, the least flange width the
  * details needed, and the next lighter candidate with the reason it was rejected.
  */
 basis?:{passed:boolean;target:number;deflectionTarget:number;minFlange:number;lighter?:{name:string;why:string};
  /** A lighter capped pair within the same targets, reported beside a heavy rolled choice (screened). */
  alternative?:{name:string;weight:number};
  /** The lighter candidates rejected, counted by reason. */
  rejected:Record<string,number>}}
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
export function girderSizingRatios(p:ProjectInput,section:Section,demand:{Mu:number;Mcrane:number;Hu:number;V:number;flexibleTie?:boolean;
 /** Factored negative (hogging) moment of a continuous girder, as a magnitude: the bottom flange in compression. */
 Mneg?:number},strength=girderStrength({...p,section,aist:p.aist?{...p.aist,netFlangeArea:section.bf*section.tf}:p.aist},sectionProperties(section))){
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
 // H1 by the sign of the moment, as the calculation (flangeStrengths, majorBySign): positive moment against the
 // strength with the top flange (and cap) in compression, with the top flange's lateral bending; the negative moment of
 // a continuous girder against M_c- (the W bottom flange in compression, F4/F5 for a cap) and, at the top flange, against
 // its tension-flange strength with the same lateral bending.
 const sign=flangeStrengths(strength),Mneg=demand.Mneg??0;
 const h1=Math.max(demand.Mu/Mn+Mf0/phi(section.Fy*Sf),Mneg>0?Mneg/sign.bottom.majorReverse!:0,Mneg>0?Mneg/sign.top.majorReverse!+Mf0/phi(section.Fy*Sf):0),stability=(lrfd?1/.9:1.67)/(.8*Mcr/demand.Mu);
 const ratios={tips,h1,stability,shear:demand.V/strength.shear};
 const [governs,utilization]=Object.entries(ratios).sort((a,b)=>b[1]-a[1])[0];
 // Rail-head lateral movement as the full analysis takes it: the top flange (with the cap) carries its direct share of
 // the side thrust and the warping couple of the torque about the shear center, I_yt for the whole I_y. The factor
 // multiplies the whole-section lateral deflection (at least 1).
 const lateralFactor=Math.max(1,(top+yg/h0)*pr.Iy/Iyt);
 return {...ratios,utilization,governs,Mcr,cb,amplification,lateralFactor};
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
 const negative=Math.max(0,...a.envelope.map(v=>-v.momentMin));
 const Md=a.deadMoment,M=a.demand.moment,H=a.demand.lateralMoment,V=a.demand.shear,dv=a.demand.deflection*props.Ix,dh=a.demand.lateralDeflection*props.Iy;
 const vLimit=L/p.verticalLimit,hLimit=L/Math.max(p.lateralLimit,400);
 const trials:GirderTrial[]=[],misfits:{name:string;weight:number;why:string;kind:string}[]=[],ins=(v:number)=>p.units==='SI'?`${Math.round(v)} mm`:`${(v/inch).toFixed(2)} in`;
 const consider=(section:Section,name:string,weight:number)=>{
  const pr=sectionProperties(section),dead=Md*(pr.weight+p.railWeight+p.deadLoad)/(props.weight+p.railWeight+p.deadLoad),Mcrane=(lrfd?1.6:1)*(M-Md);
  // A continuous girder's negative moment: the envelope's least moment less the reference dead moment (the interior
  // support moment) factored as crane load, plus this section's dead moment factored as dead load.
  const Mneg=(lrfd?1.6:1)*Math.max(0,negative-Md)+(lrfd?1.2:1)*dead;
  const r=girderSizingRatios(p,section,{Mu:(lrfd?1.2:1)*dead+Mcrane,Mcrane,Hu:(lrfd?1.6:1)*H,V:(lrfd?1.6:1)*V,flexibleTie:opts.flexibleTie,Mneg:p.system==='continuous'?Mneg:0});
  trials.push({name,weight,utilization:r.utilization,governs:r.governs,deflection:dv/pr.Ix/vLimit,lateral:dh/pr.Iy/hLimit*r.lateralFactor,shear:r.shear,section});
 };
 // Flanges wide enough for the bearing bolts, end-stop bolts and saddles (minFlange), and for the rail and clips.
 const minFlange=Math.max(opts.minFlange??0,kind==='rolled'?opts.minSeat:0);
 if(kind==='rolled'){
  for(const w of wCandidates()){if(w.bf*inch>=minFlange-1e-6)consider(loadAiscSection(p.section,w.name),w.name,w.weight);else misfits.push({name:w.name,weight:w.weight,why:`flange ${ins(w.bf*inch)} narrower than the ${ins(minFlange)} the details need`,kind:'flange width'});}
 }else{
  for(const ch of capChannels){const c=aiscChannelByName(ch)!;
   for(const w of wCandidates()){
    // The W flange fits between the channel flanges with room for the tie gussets beside it (capRoom), the channel
    // web seats the rail and clips, and the cap stays above the neutral axis (a deep cap on a shallow W is outside
    // the capped-girder model).
    // AISC F13.2 proportions of a singly symmetric member: 0.1 <= I_yc/I_y <= 0.9 with the cap channel in the
    // compression flange.
    const Iyf=w.tf*w.bf**3/12,rho=(Iyf+c.Ix)/(2*Iyf+c.Ix);
    // Each side keeps a pocket of at least 1 1/2 in (capWeldPocket) between the W flange tip and the channel flange for
    // the continuous cap-to-flange fillet, whatever room the ties need.
    const misfit=(c.d-2*c.tf-w.bf)/2<Math.max(capWeldPocket/inch,(.25+(opts.capRoom??0)/inch)/2)-1e-9?'W flange too wide for the channel with the weld pocket and tie room'
     :w.bf*inch<minFlange-1e-6?`flange ${ins(w.bf*inch)} narrower than the ${ins(minFlange)} the details need`:w.bf<.6*c.d?'W flange narrower than 0.6 of the channel depth'
     :(c.d/2-c.tf)*inch*2<opts.minSeat-1e-6?'channel web too narrow for the rail seat':w.d<1.4*c.bf+8||w.d<c.d*.9?'W too shallow for the cap channel':rho>.9?`I_yc/I_y = ${rho.toFixed(2)} > 0.9 (AISC F13.2)`:'';
    if(misfit){misfits.push({name:`${w.name} + ${ch}`,weight:w.weight+c.weight,why:misfit,kind:misfit.startsWith('flange')?'flange width':misfit.startsWith('I_yc')?'AISC F13.2 proportions':'cap channel fit'});continue;}
    consider(loadCappedSection(p.section,w.name,ch),`${w.name} + ${ch}`,w.weight+c.weight);
   }
  }
 }
 const ok=trials.filter(t=>t.utilization<=target&&t.deflection<=deflectionTarget&&t.lateral<=deflectionTarget).sort((x,y)=>x.weight-y.weight);
 // Without a candidate within the targets, the closest: the least of its largest ratio (an unstable trial ranks last),
 // then the least deflection. The strength estimate enters divided by 1.6, the least ratio of the estimate to the
 // calculated top-flange ratio on the heaviest catalog girders (1.63 to 2.42, beyondGirderCatalog), so a section that
 // meets the deflection limits is not passed over for an estimate the calculation does not bear out.
 const worst=(t:GirderTrial)=>Math.min(1e9,Math.max(t.utilization/1.6,t.deflection,t.lateral));
 const chosen=ok[0]??trials.sort((x,y)=>worst(x)-worst(y)||x.deflection-y.deflection)[0];
 if(!chosen)return chosen;
 // The next lighter candidate and why it was not taken: a sizing ratio or deflection over its target, or a misfit.
 const over=(t:GirderTrial)=>[t.utilization>target?`${t.governs} ratio ${t.utilization.toFixed(2)} > ${target}`:'',t.deflection>deflectionTarget?`vertical deflection ${t.deflection.toFixed(2)} of the limit > ${deflectionTarget}`:'',t.lateral>deflectionTarget?`lateral deflection ${t.lateral.toFixed(2)} of the limit > ${deflectionTarget}`:''].filter(Boolean).join('; ');
 const lighters=[...trials.filter(t=>t.weight<chosen.weight-1e-9&&over(t)).map(t=>({name:t.name,weight:t.weight,why:over(t),kind:t.utilization>target?'sizing ratio':'deflection'})),...misfits.filter(m=>m.weight<chosen.weight-1e-9)].sort((x,y)=>y.weight-x.weight);
 const rejected:Record<string,number>={};for(const v of lighters)rejected[v.kind]=(rejected[v.kind]??0)+1;
 return {...chosen,basis:{passed:ok[0]===chosen,target,deflectionTarget,minFlange,lighter:lighters[0]&&{name:lighters[0].name,why:lighters[0].why},rejected}};
}

/** Existing supporting column for the crane: the surveyed W14 the example building has, heavier for heavier cranes. */
export const existingColumnFor=(capacity:number)=>capacity<=7.5?'W14X90':capacity<=15?'W14X120':capacity<=30?'W14X159':'W14X211';
/** New freestanding cantilever column for the crane. */
export const newColumnFor=(capacity:number)=>capacity<=5?'W14X120':capacity<=12.5?'W14X159':capacity<=25?'W14X211':'W14X257';

function shapePlates(name:string){const s=aiscShapeByName(name)!;return {depth:s.d*inch,width:s.bf*inch,flangeThickness:s.tf*inch,webThickness:s.tw*inch};}

/** The parsed, normalized configuration (a blank title becomes 'Crane runway'). */
export const configOf=(input:RunwayConfig)=>{
 // The selection log of a project being rebuilt from its configurator record is output, not a choice.
 const {selections:_log,beyondCatalog:_stop,...choices}=input,entered=runwayConfigSchema.parse({...choices,title:input.title?.trim()||'Crane runway'});
 return {...normalizeConfig(entered),entered};
};
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
  runwayOnly:true,supportType:cfg.support==='column-cap'?'column':'bracket',clipSpacing:(cfg.railPad===false?30:24)*inch,railPad:cfg.railPad??depth>=5*inch,fastener:'clips',camber:0,fatiguePoint:'bottom-left',
  fatigueReference:'AISC 360 Table A-3.1, 1.1 · plain rolled bottom flange; full detail register in the package',
  cycleSource:`Fictitious example duty: ${count(N)} crane passages in three duty bins (rated, half and light lifts), loaded and empty passes included. The bins are an assumed general-service proportion, not crane or owner data, so the fatigue checks govern by the all-cycle bound (the full fatigue load at every one of the ${count(N)} cycles); Miner's sum over the bins is listed for comparison until a sourced duty spectrum is entered.`};
 delete p.aist.classBasis;
 // No owner or crane-supplier duty spectrum: the TR-13 class method, the full fatigue load at all class cycles, governs.
 p.fatigue={category:'A',cycles:N,detail:'Plain rolled bottom flange; welded attachments are checked separately in the detail register.',location:spans[0]/2,method:'all-cycle'};
 // Rail weight per the rail section the details proportion (placeholder until the details are built).
 const railArea=(r:{headWidth:number;headThickness:number;baseWidth:number;baseThickness:number;webThickness:number})=>r.headWidth*r.headThickness+r.baseWidth*r.baseThickness+(depth-r.headThickness-r.baseThickness)*r.webThickness;
 p.railWeight=railArea({headWidth:.55*depth,headThickness:.3*depth,baseWidth:depth,baseThickness:.17*depth,webThickness:.12*depth})*7850*g/1e9;
 const clipWidth=(up(depth,1.5875)<=4.5*inch+1e-6?2:2.5)*inch,minSeat=seatWidthNeeded(depth,clipWidth);
 // Flanges that take the 5 1/2 in gauge of the 3/4 in end bearing bolts with the sleeved slots at the J3.4 edge
 // distance (8 3/8 in), and caps wide enough for the tie gussets beside the W flange (a saddle tie or flexible plate).
 // The flexible plate's estimate factor (less end restraint against twist) only where the plate stays: on a crane column
 // attachTie always replaces it (paired bars on the bearing stiffener, or the cap angle on a capped girder), and the
 // girder sized for the softer plate came out about 1.25 times heavier than the final calculation needed (046, 052).
 const sizing={minSeat,minFlange:8.5*inch,capRoom:cfg.tie==='cap-angle'||cfg.support==='column-cap'?0:2.5*inch,flexibleTie:cfg.tie==='flexible-plate'&&cfg.support!=='crane-column'};
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

/** AIST TR-13 §5.9.2: column brackets are recommended for support reactions up to about 50 kip. */
export const bracketReactionLimit=50*kip;
/**
 * The largest unfactored support reaction with all cranes present, impact and the dead load (girder, rail and the
 * support steel): supportReactions on the project as built so far (the girder sized), the basis of the AIST
 * column-bracket recommendation (aistChecks column-brackets: the design analysis service reaction).
 */
export function serviceReactionEstimate(p:ProjectInput){
 const r=supportReactions(p,sectionProperties(p.section));
 return Math.max(0,...r.supports.map(s=>s.D+s.Cd+s.Cv+s.Ci));
}
/**
 * The configuration and its skeleton, screened against the AIST TR-13 §5.9.2 column-bracket recommendation once the
 * girder is known: above it the brackets entered are kept (the guideline, a clause to be verified, never replaces the
 * support entered), with an advisory note naming the direct column bearing alternatives: column caps on new columns, a
 * crane column or a stepped column beside a building column.
 */
function screened(input:RunwayConfig){
 const {config,changes,rules,entered}=configOf(input);let cfg=config,sk=skeleton(cfg);
 // No rolled W within the sizing targets (the catalog of girderCandidate): a capped girder (W + channel cap) where one
 // passes them, before a jumbo rolled section; else the closest is kept as an open item (beyondCatalog).
 if(cfg.scope==='design'&&cfg.girder==='rolled'&&!cfg.girderShape&&sk.trial?.basis?.passed===false){
  const n=normalizeConfig({...cfg,girder:'capped'}),capped=skeleton(n.config);
  if(capped.trial?.basis?.passed){
   const why=`No compact rolled W meets the girder sizing targets (closest ${sk.trial.name}: ${sk.trial.governs} ratio ${sk.trial.utilization.toFixed(2)}, vertical deflection ${sk.trial.deflection.toFixed(2)} and lateral ${sk.trial.lateral.toFixed(2)} of the limits, screening estimates): the girder is a W with a channel cap, whose wide top flange carries the side thrust (AISC DG7).`;
   changes.push(why,...n.changes);rules.push({field:'girder',from:'rolled',to:'capped',why},...n.rules);cfg=n.config;sk=capped;
  }
 }
 // A heavy rolled girder (150 plf or more) governed by its top flange: the lightest capped pair within the same targets
 // is reported beside it where it is at least 20% lighter (AISC DG7: a cap channel carries the side thrust).
 const rolled=sk.trial;
 if(cfg.scope==='design'&&cfg.girder==='rolled'&&!cfg.girderShape&&rolled?.basis?.passed&&rolled.weight>=150&&rolled.governs!=='shear'){
  const alt=skeleton(normalizeConfig({...cfg,girder:'capped'}).config).trial;
  if(alt?.basis?.passed&&alt.weight<.8*rolled.weight)rolled.basis.alternative={name:alt.name,weight:alt.weight};
 }
 if(cfg.scope!=='design')return {config:cfg,changes,sk,rules,entered};
 const R=serviceReactionEstimate(sk.p);
 // Column caps, crane columns and column steps are direct column bearing, not brackets: the recommendation does not apply.
 if(cfg.support==='column-cap'||cfg.support==='crane-column'||cfg.support==='stepped-column'||R<=bracketReactionLimit)return {config:cfg,changes,sk,reaction:R,rules,entered};
 const about=`about ${cfg.units==='SI'?`${Math.round(R/1000)} kN (${Math.round(R/kip)} kip)`:`${Math.round(R/kip)} kip`}`,limit=cfg.units==='SI'?'222 kN (50 kip)':'50 kip';
 // The TR-13 bracket guideline (clause to be verified) is an advisory, not a code limit: it never replaces the support
 // entered, on new or existing columns; the note and the selection log point to the direct column bearing alternatives
 // (column caps on new columns; a crane column or a stepped column beside a building column). The bracket's own
 // strength, fatigue and column checks (and on new columns the twist rule, withTwistLimit) decide its adequacy.
 const consider=cfg.structure==='new'?'consider column caps over the new columns':'consider a crane column tied to the building column or a stepped column';
 const why=`The support reaction, ${about}, is above the AIST TR-13 §5.9.2 guideline of ${limit} for column brackets, a clause to be verified: ${consider}; an advisory, not a code limit, so the support entered (${supportLabels[cfg.support]}) is kept${cfg.support==='by-others'?', by others':' and checked here'}.`;
 changes.push(why);rules.push({field:'support',from:cfg.support,to:cfg.support,why});
 return {config:cfg,changes,sk,reaction:R,rules,entered};
}

/** What a configuration will produce, for the configurator's summary: crane data, duty, rail and girder. */
export function previewConfig(input:RunwayConfig){
 const {config:cfg,changes,sk,reaction}=screened(input),{p,depth,trial,spectrum}=sk;
 const crane=estimateCrane(cfg.capacity,cfg.craneSpan,cfg.control),design=cfg.scope!=='analysis';
 // The supporting column (a crane column, or a stepped column's lower shaft, an existing member the build keeps) and the
 // building column beside it, or the stepped column's upper shaft.
 const structure=!design?undefined:cfg.support==='crane-column'?(cfg.columnShape??craneColumnFor(cfg.capacity)):cfg.support==='stepped-column'?(cfg.columnShape??steppedLowerFor(cfg.capacity)):cfg.structure==='new'?(cfg.columnShape??newColumnFor(cfg.capacity)):cfg.support==='by-others'?undefined:(cfg.columnShape??existingColumnFor(cfg.capacity));
 const building=design&&(cfg.support==='crane-column'||cfg.support==='stepped-column')?(cfg.buildingColumnShape??existingColumnFor(cfg.capacity)):undefined;
 // The assumed end-truck geometry is stated with the changes (the crane supplier confirms it).
 if(cfg.scope==='design')changes.push(overhangNote(crane));
 // Beyond the catalog: the closest section is built, with this reason as an open item (beyondCatalog, configuratorOpenItems).
 if(design&&sk.trial&&beyondGirderCatalog(sk.trial)&&!cfg.girderShape)changes.push(`Plate girder required: no ${cfg.girder==='capped'?'W and channel cap pair':'compact rolled W or W and channel cap pair'} meets the girder sizing targets (closest ${sk.trial.name}: ${sk.trial.governs} ratio ${sk.trial.utilization.toFixed(2)}, vertical deflection ${sk.trial.deflection.toFixed(2)}, lateral ${sk.trial.lateral.toFixed(2)}); the configurator does not design plate girders, so the closest section is built and calculated as a review draft with this open item.`);
 return {config:cfg,changes,crane,spectrum,railDepth:depth,girder:p.section.name,trial:trial&&{utilization:trial.utilization,deflection:trial.deflection,lateral:trial.lateral,weight:trial.weight},column:structure,
  /** The existing building column beside a crane column, or the upper shaft of a stepped column. */
  buildingColumn:building,verticalLimit:p.verticalLimit,
  /** Largest unfactored support reaction (all cranes, impact, dead load), for the AIST column-bracket recommendation. */
  reaction,
  /** AIST TR-13 crane type and the side-thrust rule it takes. */
  sideThrust:sideThrustRule(cfg)};
}

/** The configured project. Unknown supplier, survey and site data are fictitious examples, marked as such. */
export function buildProject(input:RunwayConfig,trace:SelectionTrace={}):ProjectInput{
 // The twist layout rule (withTwistLimit) applies to the outermost build only: the sizing steps rebuild the project with
 // a named column, which must not change the layout under them.
 buildDepth++;
 try{
  let q=buildLayout(input,trace),target=twistMovementTarget();
  if(buildDepth!==1)return q;
  const unresolved=(r:ProjectInput)=>!!r.configurator?.beyondCatalog?.some(v=>v.member==='tie');
  // A tie on a new column's bracket that cannot take the column's twist movement while the column twist is within its
  // own limits (no torsion brace): the strut moment-connected in plan at the locating columns (the torsion brace) and
  // sized for a twist movement of 1/8 in, then 1/16 in and 1/32 in, the layout built again; kept where the tie then
  // passes its sizing, else the layout without the brace stays (the tie an open item).
  if(unresolved(q)&&!torsionBraceActive(q)&&twistsAtSeat(q)){
   let last=Infinity;
   for(const next of [inch/8,inch/16,inch/32]){
    const inner:SelectionTrace={},r=withForcedTorsionBrace(()=>withTwistMovementTarget(next,()=>buildLayout(input,inner)));
    if(!torsionBraceActive(r))break;
    if(!unresolved(r)){q=r;Object.assign(trace,inner);target=next;break;}
    // The strut already at the stiffest that fits: a tighter target moves nothing.
    const slip=Math.abs(seatTwist(r)?.t.service.slip??0);if(slip>=.99*last)break;last=slip;
   }
  }
  // A tie that cannot take the twist movement of a torsion-braced column (beyondCatalog 'tie'): the strut held to a
  // tighter twist movement (1/16 in, then 1/32 in), the layout built again.
  for(const next of [inch/16,inch/32].filter(v=>v<target)){
   if(!torsionBraceActive(q)||!unresolved(q))break;
   const inner:SelectionTrace={},r=forcedBrace(q)?withForcedTorsionBrace(()=>withTwistMovementTarget(next,()=>buildLayout(input,inner))):withTwistMovementTarget(next,()=>buildLayout(input,inner));
   // The strut already at the stiffest that fits (sizeTorsionStrut): a tighter target moves nothing, so it stops.
   const moved=(v:ProjectInput)=>Math.abs(seatTwist(v)?.t.service.slip??0),stuck=moved(r)>=.99*moved(q);
   q=r;Object.assign(trace,inner);target=next;
   if(stuck)break;
  }
  ({q,target}=withGussetFitColumn(q,input,trace,target));
  return titleAsDesigned(withTwistLimit(q,configOf(input).config,trace,target),configOf(input).entered);
 }finally{buildDepth--;}
}
/**
 * The project title (title blocks, report header) names the support and the tie as designed: where the title names the
 * support or tie entered (its id, e.g. 'rolled-corbel', or its label) and the configurator replaced it, the designed
 * one takes its place ('column-cap', 'end fork' for a girder on a column cap without a flange tie), so a title never
 * points the fabricator to parts that are not on the drawings. The selection log keeps the entered choices.
 */
function titleAsDesigned(q:ProjectInput,entered:RunwayConfig):ProjectInput{
 const c=q.configurator;if(!c||c.scope!=='design'||!q.details)return q;
 const fork=!!activeColumnCap(q)&&!tiedToBuilding(q),tie=fork?'end-fork':tieArrangement(q.details);
 const swap=(title:string,from:string,to:string,fromLabel:string,toLabel:string)=>{if(from===to)return title;
  const esc=(v:string)=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return title.replace(new RegExp(`(^|[^a-z-])${esc(from)}(?![a-z-])`,'gi'),`$1${to}`).replace(new RegExp(esc(fromLabel),'gi'),toLabel);};
 const forkLabel='End fork on the column cap';
 let t=swap(q.title,entered.support,c.support,supportLabels[entered.support],supportLabels[c.support]);
 t=swap(t,entered.tie,tie,tieLabels[entered.tie],fork?forkLabel:tieLabels[tie as keyof typeof tieLabels]??tie);
 if(t!==q.title)q.title=t.slice(0,120);
 return q;
}
let buildDepth=0;
/**
 * New columns whose flange cannot take the tie's column gussets at the bearing stiffeners (each girder end's bearing
 * center plus half the gusset and its fillet past the flange tip, stiffenerGussetMisfit, a coordination clash of the
 * calculation where it stays): first the torsion brace where the column twists unbraced, then the layout built again on the
 * lightest heavier W14 that takes them (a wider flange, and a torsionally stiffer column whose smaller twist shortens
 * the bearing slots); the configuration keeps its blank column choice, and the log says why.
 */
function withGussetFitColumn(q:ProjectInput,input:RunwayConfig,trace:SelectionTrace,target:number):{q:ProjectInput;target:number}{
 const cfg=configOf(input).config,col=q.existingColumn,misfit=(r:ProjectInput)=>!!stiffenerGussetMisfit(r);
 if(cfg.columnShape||cfg.scope!=='design'||cfg.structure!=='new'||!col?.enabled||!col.isNew||!misfit(q))return {q,target};
 const tieOpen=(r:ProjectInput)=>!!r.configurator?.beyondCatalog?.some(v=>v.member==='tie');
 const accept=(r:ProjectInput,inner:SelectionTrace,why:string)=>{Object.assign(trace,inner);r.notes+=` ${why}`;return r;};
 // The column twist lengthens the bearing slots (the bearings, so the gusset offset): first the torsion brace on the same
 // column, where the column twists at the seat and has none.
 if(!torsionBraceActive(q)&&twistsAtSeat(q)){
  const inner:SelectionTrace={},r=withForcedTorsionBrace(()=>withTwistMovementTarget(inch/8,()=>buildLayout(input,inner)));
  if(torsionBraceActive(r)&&!misfit(r)&&!validateRunwayDetails(r).length)return {q:accept(r,inner,`The tie's column gussets at the bearing stiffeners do not fit on the ${col.shape} flange with the bearing slots the column twist needs: the crane-level strut is moment-connected in plan at the locating columns (torsion brace), and the shorter slots bring the gussets onto the flange.`),target:inch/8};
 }
 const braced=torsionBraceActive(q)&&forcedBrace(q);
 for(const shape of heavierColumns(col.shape)){
  const inner:SelectionTrace={},build=()=>withTwistMovementTarget(target,()=>buildLayout({...input,columnShape:shape},inner)),r=braced?withForcedTorsionBrace(build):build();
  // Not where the tie that passed its sizing on the lighter column no longer does (the clash stays the open item).
  if(misfit(r)||validateRunwayDetails(r).length||tieOpen(r)&&!tieOpen(q))continue;
  const why=`The tie's column gussets at the bearing stiffeners do not fit on the ${col.shape} flange (${aiscShapeByName(col.shape)!.bf} in wide) with their fillets: the lightest heavier W14 whose flange takes them, ${shape}.`;
  accept(r,inner,why);
  if(r.configurator){delete r.configurator.columnShape;r.configurator.selections=[...(r.configurator.selections??[]).filter(v=>v.item!=='New column'),{item:'New column',entered:'configurator default',designed:shape,reason:why}].slice(0,24);}
  return {q:r,target};
 }
 return {q,target};
}
function buildLayout(input:RunwayConfig,trace:SelectionTrace):ProjectInput{
 const {config:cfg,sk,rules,entered}=screened(input),{p,depth,clipWidth,spectrum,N,railArea}=sk,spans=p.spans;
 // Both new supports are built: the crane column (craneColumnSupport) and the stepped column (withSteppedColumn).
 p.configurator={...cfg};
 const logged=(q:ProjectInput)=>{alignTieGusset(q,trace);refitCapAngleSetback(q,cfg,trace);const stop=beyondCatalog(entered,cfg,sk.trial,q);q.configurator={...cfg,selections:[...selectionLog(entered,cfg,rules,sk.trial,q,trace).slice(0,24-stop.length),...stop.map(openItemRow)],...(stop.length?{beyondCatalog:stop}:{})};return q;};
 const scopeText=`${cfg.bays} ${cfg.system==='simple'?'simply supported':'continuous'} ${cfg.span}-ft bay${cfg.bays>1?'s':''}, ${p.section.name} girder${cfg.bays>1?'s':''}, ${cfg.cranes===2?'two':'one'} ${+cfg.capacity.toFixed(2)}-ton ${cfg.control} crane${cfg.cranes===2?'s':''}`;
 if(cfg.scope==='analysis'){
  delete p.details;p.connections.enabled=false;
  p.notes=`Example configuration generated by the CraneCalc configurator from typical crane proportions; fictitious crane and owner data, to be replaced with project data. Scope: girder analysis under supplied loads (${scopeText}). Connections, supports and drawings are not part of an analysis-only package.`;
  return logged(p);
 }

 // Detailed connections for the girder, completed with fictitious example supplier data.
 delete p.details;p.connections.enabled=true;
 const d=neutralDetails(p);p.details=d;delete d.reviewed;
 // Simple spans bear centered on the runway-end grids: the girder runs half the bearing length past them, so the end
 // reaction is not eccentric to the support web (no rib reversal, no seat moment into the column at the runway ends).
 if(p.system==='simple')d.simpleSupport={...d.simpleSupport!,endGridBearing:'centered'};
 // The J10 effective bearing length is the bearing plate's (bearingLayout sizes the plate for it).
 if(p.aist)p.aist.bearingLength=d.bearing.length;
 const r=d.rail;r.name=`Example ${+(depth/inch).toFixed(2)} in crane rail · idealized plate geometry (fictitious; use the rail supplier's section)`;
 r.padSource='Fictitious example RP-01 polyurethane crane-rail pad; allowable compression per the fictitious supplier rating sheet';
 r.clip=exampleClip(r.baseWidth,depth,(clipWidth<2.5*inch?.25:.3125)*inch);
 d.spectrum=spectrum.bins;p.fatigue.cycles=N;
 // The clip base as a fatigue detail on the top plate, by the project's method: bolted clamp plates where the weld-on
 // base does not pass (railClipFatigue); the top-flange comparison point FT1 takes the clip's category.
 const clipFatigue=railClipFatigue(p),clipStrength=railClipWeldStrength(p);
 // The base welds' strength as well (railClipWeldStrength): the clips are bolted where either fails.
 if(clipFatigue.ratio>1||clipStrength.ratio>1){r.clip=exampleClip(r.baseWidth,depth,r.clip.weld,'bolted');trace.clip=[clipFatigue.ratio>1?clipFatigue.why:'',clipStrength.ratio>1?clipStrength.why:''].filter(Boolean).join(' ');}
 const ft=d.fatigueDetails.find(v=>v.id==='FT1'),category=railClipCategory(r.clip);
 if(ft)Object.assign(ft,{category,name:`Top flange at longest-bay midspan, category ${category==='E1'?'E′':category}`,reference:`AISC 360 Table A-3.1 · top-flange comparison point at the rail clip ${r.clip.type==='bolted'?'bolt holes (item 2.2)':'base welds (item 7.1)'}; rail clip stations are checked automatically`});
 p.railWeight=railArea(r)*7850*g/1e9;
 d.criteria.railGauge=cfg.craneSpan*foot;
 if(d.endStop)d.endStop.source='Fictitious example supplier data: bumper force, bumper centerline height and contact diameter';
 d.fabrication.steel=p.section.kind==='cap'?'W girder ASTM A992; cap channel and connection plates ASTM A572 Grade 50 unless noted.':'Girder ASTM A992; plates, bars and stiffeners ASTM A572 Grade 50 unless noted.';
 if(p.section.kind==='cap')d.fabrication.welding+=' Cap: continuous fillet each W top-flange edge, with the end development shown. Full cap bearing contact required. Bearing stiffeners CJP to the W top flange, bottom fitted.';
 if(p.section.kind==='cap')d.fabrication.inspection+=' Capped girder shop sequence: weld and UT the bearing stiffener CJPs and any under-flange attachments, check the top flange flatness, then fit and weld the cap.';
 if(cfg.tie!=='cap-angle'&&d.brace.arrangement==='cap-angle'){d.brace.arrangement='paired-bars';delete d.brace.capAngle;}

 const reach=(cfg.reach??20)*inch,seatLevel=(base:number)=>cfg.railElevation*foot-base-railTopAboveSteel(p)-(p.section.kind==='cap'?p.section.capTw:0)-p.section.d-d.bearing.thickness;
 if(cfg.support==='by-others'){
  // Brackets by others on the existing building: the tie runs to the column face, no supporting column is checked.
  p.notes=`Example configuration generated by the CraneCalc configurator; fictitious crane, supplier and owner data, to be replaced with project data. Scope: ${scopeText}, on existing column brackets by others; the rail, girders, ties to the column face, bearings and end stops. Existing building frames, column brackets, anchors and foundations are excluded.`;
  p.drawing!.existingEvaluation='Fictitious existing structure evaluation: frames, brackets, bracing, connections and foundations for the added crane loads';
 }else if(cfg.support==='crane-column'){
  // New crane columns beside the existing building columns, tied to them (craneColumnSupport).
  craneColumnSupport(p,cfg,seatLevel,scopeText);
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
  const braced=Math.ceil(cfg.bays/2);
  p.longitudinalBracing={...base.longitudinalBracing!,bayWidth:cfg.span*foot,height:seat,rod:{...base.longitudinalBracing!.rod,diameter:bracingRod(p,cfg.span*foot,seat)},existing:{W:6*kip,E:3*kip},wind10:3.5*kip,spans:[braced],
   source:`Fictitious example: existing sidewall rod bracing at grid lines ${braced}-${braced+1} and the original wind/seismic report (10-year wind 3.5 kip on this line)`,confirmed:true};
  if(cfg.support==='stepped-column')withSteppedColumn(p,cfg,scopeText,trace);
  else{attachBracket(p,cfg,shape,reach,false);
  p.notes=`Example configuration generated by the CraneCalc configurator; fictitious crane, supplier, survey and owner data, to be replaced with project data. Scope: ${scopeText}, on new ${bracketText(cfg)} welded to the existing ${shape} columns, with the rail, ties, bearings and end stops; the existing columns are checked with their existing load effects and the existing sidewall rod bracing takes the crane longitudinal forces.`;}
 }else{
  // New freestanding cantilever columns on spread footings with crane-level rod bracing (newColumnDemonstrationProject).
  const shape=cfg.columnShape??newColumnFor(cfg.capacity),w=aiscShapeByName(shape)!,demo=newColumnDemonstrationProject(),heavy=Math.min(1,Math.max(0,(cfg.capacity*cfg.cranes-2)/28));
  const baseInput={...structuredClone(demo.columnBase!),
   plate:{...demo.columnBase!.plate,...basePlatePlan(shape),thickness:up((1.25+.75*heavy)*inch,.125*inch)},
   anchors:{...demo.columnBase!.anchors,diameter:(heavy>.5?1.25:1)*inch,embedment:(15+6*heavy)*inch},
   footing:{...demo.columnBase!.footing,L:round((6.5+5*heavy)*foot,.5*foot),B:round((6.5+5*heavy)*foot,.5*foot),thickness:up((24+12*heavy)*inch,inch),bar:(heavy>.5?'#7':'#6') as '#6'|'#7',spacing:10*inch},
   soil:{...demo.columnBase!.soil,passive:examplePassive},source:'Fictitious example geotechnical report: 3,000 psf allowable (net), base friction 0.35, lateral bearing 150 psf/ft (IBC Table 1806.2), 120 pcf; interior heated building, frost not applicable. Concrete 4,000 psi; ASTM A615 Grade 60 bars; ASTM F1554 Grade 36 rods'};
  p.columnBase=baseInput;
  const seat=seatLevel(columnBaseElevation(baseInput)),top=seat+d.bearing.thickness+p.section.d+(p.section.kind==='cap'?p.section.capTw:0);
  const c=demo.existingColumn!;
  // Runway drift across the runway: H/240 for cab-operated cranes, H/100 for pendant-operated (AISC DG7 serviceability
  // recommendations, owner may tighten; clause to be verified).
  p.existingColumn={...c,shape,d:w.d*inch,bf:w.bf*inch,tf:w.tf*inch,tw:w.tw*inch,height:top,seatElevation:seat,Lcx:2.1*top,Lcy:top,Lcz:top,Lb:top,driftLimit:cfg.control==='pendant'?100:240,
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
   // The bearings on the shop-welded cap (no shims, Class B), before the cap is sized for them.
   setBearings(p);
   // The cap plate covers the column (its weld plus 1/8 in beyond each flange face) and the girder bearing plates.
   const capWidth=Math.max(w.bf*inch+1.5*inch,w.d*inch+2*(p.columnCap.weld+inch/8),d.bearing.width);
   p.columnCap.plate={...p.columnCap.plate,width:Math.max(p.columnCap.plate.width,up(capWidth,.5*inch))};
   // The girder's bearing stiffener pair lands between the column flanges.
   const clear=(w.d-2*w.tf)*inch;d.bearing.stiffenerWidth=Math.min(d.bearing.stiffenerWidth,Math.floor((clear-p.section.tw)/2/(inch/8)+1e-9)*inch/8);
   // The cap sized for the reactions (sizeColumnCap): plate, all-around fillets, cap stiffeners and the bearing bolts.
   // The girder's bearing stiffener pair, the fork's diaphragm, sized for its plate fatigue (stiffener-fatigue), before
   // the cap sizing lays the bearing plates out around it (washer and nut clearances to the stiffener).
   sizeForkStiffenerFatigue(p,Math.floor((clear-p.section.tw)/2/(inch/8)+1e-9)*inch/8);
   const sized=sizeColumnCap(p);p.columnCap=sized.columnCap;d.endBearing=sized.details!.endBearing;d.bearing=sized.details!.bearing;if(p.aist&&sized.aist)p.aist.bearingLength=sized.aist.bearingLength;
   p.longitudinalBracing.height=col.seatElevation-capWorkPointDrop(p);
  }else{attachBracket(p,cfg,shape,reach,true);withTorsionBrace(p);}
  p.notes=`Example configuration generated by the CraneCalc configurator; fictitious crane, supplier, site and owner data, to be replaced with project data. Scope: ${scopeText}, on new freestanding ${shape} columns with ${cfg.support==='column-cap'?'column caps':bracketText(cfg)}, base plates, anchor rods and spread footings, and crane-level rod X-bracing; the existing building carries no crane load. Seismic: ordinary steel cantilever column system across the runway and rod bracing not specifically detailed for seismic resistance along it, Seismic Design Category B.`;
 }
 // The tie first, for a trial reach (the configured one, or 20 in growing only as far as the tie needs); then the bracket
 // at the reach the tie settled on, and the tie finished on that bracket.
 attachTie(p,cfg,trace);if(cfg.support!=='column-cap')setBearings(p);
 // Crane columns: the building column where the sized tie ends, the cap for the bearings as laid out, the column tie.
 if(cfg.support==='crane-column')finishCraneColumn(p,trace);
 // The rail clips across the girder joints within the clip spacing, the bearings laid out again where the tie moved.
 if(fitClipJoints(p,cfg,trace)){setBearings(p);if(cfg.support==='crane-column')finishCraneColumn(p,trace);}
 // The supports carry the bracket (or cap) and tie before the new column bases are sized for their reactions.
 const tie=sizedTieRatios(p),q=finishCapAngle(finishTie(withHaunch(withWeldedBracket(p),cfg,trace),tie));
 // The end stops sized again for the crane bumper force on the finished girder end (bearing stiffener, tie saddle).
 if(q.details?.endStop)q.details.endStop=sizeEndStop(q).stop;
 // A continuous girder longer than a practical piece: bolted field splices in the inflection regions (spliceSizing.ts).
 const spliced=designSplices(q);if(spliced){q.details!.splices=spliced.splices;trace.splice=spliced;}
 q.notes+=` ${overhangNote(estimateCrane(cfg.capacity,cfg.craneSpan,cfg.control))}`;
 return withoutRailPad(logged(withBracketColumn(newColumns(cfg)?withCraneColumn(withCapColumn(withColumnBase(sizeBracing(q,baseTarget),cfg,trace),cfg),cfg,trace):withSteppedTie(withLongitudinalExit(withPreheat(finishSteppedColumn(withExistingRod(q),trace)),cfg,trace),cfg,trace),cfg,trace)),cfg,trace,logged);
}
/**
 * The column twist at a new column's bracket seat (columnTwistLimit.ts): the factored twist within the small-rotation limit
 * and the service movement of the girder line within the runway-level limit (the bracing displacement in series is left
 * to the calculation).
 */
function seatTwist(p:ProjectInput){
 const a=existingColumnAnalysis(p,supportReactions(p,sectionProperties(p.section))),t=a.torsion;
 if(!t)return undefined;
 const slip=Math.abs(t.service.slip),limit=twistMovementLimit(p,a);
 return {t,slip,limit,ratio:Math.max(Math.abs(t.twist)/twistRotationLimit,slip/limit),ok:slip<=limit+1e-9&&Math.abs(t.twist)<=twistRotationLimit};
}
/**
 * New freestanding columns with a bracket seat: each girder's longitudinal force reaches its locating column at the seat,
 * off the column axis, while the crane-level strut and rods hold the column at its centerline: a torque that twists the
 * column. Where that twist exceeds the column-twist limits, the strut is moment-connected in plan at the locating columns
 * (the torsion brace, design.torsionBrace): it holds the column against the twist, and the bracing sizing (sizeBracing)
 * sizes its plates, bolts and fillets and the strut for its moment and for the twist limits. Set before the bearings are
 * laid out, so the slot travel takes the braced column's movement.
 */
function withTorsionBrace(p:ProjectInput){
 const d=p.longitudinalBracing?.design;
 if(!d||d.torsionBrace||!designsBracing(p)||activeColumnCap(p)||!p.details?.bracket?.enabled||girderOffset(p)<=0)return;
 const s=seatTwist(p);if(s&&(!s.ok||forceTorsionBrace)){d.torsionBrace={...defaultTorsionBrace};sizeTorsionStrut(p);}
}
/** Set while buildProject retries a layout with the torsion brace for the tie's sake (the twist itself within its limits). */
let forceTorsionBrace=false;
function withForcedTorsionBrace<T>(f:()=>T):T{const was=forceTorsionBrace;forceTorsionBrace=true;try{return f();}finally{forceTorsionBrace=was;}}
/** A new column whose bracket seat twists the column (the girder off its axis, bracing designed here). */
const twistsAtSeat=(p:ProjectInput)=>!!p.existingColumn?.enabled&&!!p.existingColumn.isNew&&!!p.details?.bracket?.enabled&&designsBracing(p)&&!activeColumnCap(p)&&girderOffset(p)>0&&!!seatTwist(p);
/** The torsion brace is there for the tie only: the column twist without it is within its limits. */
const forcedBrace=(p:ProjectInput)=>{const r=structuredClone(p);delete r.longitudinalBracing!.design!.torsionBrace;return !!seatTwist(r)?.ok;};
/**
 * New freestanding columns with bracket seats: the bracket stays a bracket. The final layout's column twist with the
 * girder's longitudinal path as designed (withTorsionBrace: the strut moment-connected in plan at the locating columns,
 * set and sized here if the final reach first needs it), stated in the selection log with the unbraced twist for
 * comparison; where the twist still exceeds a limit the log says so and the failing check stays in the calculation.
 */
function withTwistLimit(q:ProjectInput,cfg:RunwayConfig,_trace:SelectionTrace,target=twistMovementTarget()):ProjectInput{
 if(cfg.scope!=='design'||cfg.structure!=='new'||cfg.support==='column-cap'||!q.existingColumn?.enabled||!q.details?.bracket?.enabled||!designsBracing(q))return q;
 const unbraced=(()=>{const r=structuredClone(q);delete r.longitudinalBracing!.design!.torsionBrace;return seatTwist(r);})();
 if(!unbraced||unbraced.ok&&!torsionBraceActive(q))return q;
 let r=q;
 if(!torsionBraceActive(r)){r=structuredClone(q);r.longitudinalBracing!.design={...bracingDesign(r),torsionBrace:{...defaultTorsionBrace}};r=withTwistMovementTarget(target,()=>sizeBracing(r));}
 const braced=seatTwist(r)!,len=(v:number)=>cfg.units==='SI'?`${Math.round(v)} mm`:`${+(v/inch).toFixed(3)} in`,d=bracingDesign(r),tb=d.torsionBrace!;
 const state=(v:NonNullable<ReturnType<typeof seatTwist>>)=>`${Math.abs(v.t.twist).toFixed(4)} rad factored (limit ${twistRotationLimit}) and ${len(v.slip)} of bearing movement at every crane start and stop (limit ${len(v.limit)})`;
 const plate=cfg.units==='SI'?`${Math.round(tb.thickness)} mm`:`${+(tb.thickness/inch).toFixed(3)} in`;
 const why=`The bracket stays: the ${d.strut.shape} crane-level strut is moment-connected in plan at every column by ${plate} plates on its flanges (torsion brace, ${tb.rows} rows of bolt pairs) and holds the new ${r.existingColumn!.shape} columns against the twist: ${state(braced)}${braced.ok?'':`, still beyond a limit (column-twist or column-twist-rotation fails and stays in the calculation: a stiffer strut, a torsionally stiffer column or a column cap is needed)`}. With the strut on the column centerline alone, the girder seated ${len(braced.t.offset)} off the column axis, the traction twists the column ${state(unbraced)}. The strut is sized so the girder's twist movement under the factored traction stays within ${len(target)} (a configurator target${target<inch/8?', tightened from 1/8 in where the tie could not take the movement':', the TR-13 alignment tolerance class'}, so the tie, slots and gaps are not sized by it).`;
 r.notes+=` ${why}`;
 const sel=r.configurator?.selections??[];
 if(r.configurator)r.configurator.selections=[...sel.filter(v=>v.item!=='Longitudinal path'),{item:'Longitudinal path',entered:'Crane-level strut on the column centerline',designed:`${d.strut.shape} strut with a torsion brace at the locating columns`,reason:why.slice(0,800)}].slice(0,24);
 return r;
}
/**
 * The last resort for the rail clips across the simple-span girder joints, where fitClipJoints found neither a saddle
 * setback nor a bearing-stiffener tie that keeps them within the 24 in clip spacing a rail pad allows (AIST TR-13, the
 * aist rail-clips check): a thick top flange widens the clip-free zone at the tie saddle past half the spacing. Where
 * the joint gap is within the 30 in TR-13 allows without a pad, the project is built with the rail bearing directly on
 * the girder and the clips at most 30 in apart (the clip, its welds or bolts and the flange checks take the longer
 * spacing). A high-cycle runway (CMAA D to F, AIST Class A or B) keeps its pad, and a configured pad is kept.
 */
function withoutRailPad(p:ProjectInput,cfg:RunwayConfig,trace:SelectionTrace,logged:(q:ProjectInput)=>ProjectInput):ProjectInput{
 if(cfg.railPad!==undefined||!p.aist?.railPad||highCycle(cfg)||p.system!=='simple'||!validateRunwayDetails(p).some(e=>e.includes(clipGapRule)))return p;
 const ks=railClipStations(p),gap=Math.max(...ks.slice(1).map((x,i)=>x-ks[i]));
 if(gap>30*inch+1e-6)return p;
 const inner:SelectionTrace={},r=buildProject({...cfg,railPad:false},inner);
 if(validateRunwayDetails(r).some(e=>e.includes(clipGapRule)))return p;
 const len=(v:number)=>cfg.units==='SI'?`${Math.round(v)} mm`:`${+(v/inch).toFixed(2)} in`;
 const why=`With a rail pad the clips stand at most ${len(p.aist.clipSpacing)} apart (AIST TR-13); across the girder joints the clips stand clear of the tie saddle (its end fillet and the clip's reach through the ${len(p.section.tf)} flange), ${len(gap)} apart, and neither the saddle at its farthest setback nor the tie on the bearing stiffener closes the gap: the rail bears directly on the girder (no pad: the configurator keeps one on high-cycle runways only, CMAA D to F or AIST Class A and B, and this is CMAA Class ${cfg.cmaa}, AIST Class ${cfg.buildingClass}) and the clips stand at most ${len(30*inch)} apart (TR-13 without a pad), checked for that spacing.`;
 Object.assign(trace,inner,{pad:why});r.notes+=` ${why}`;
 return logged(r);
}
/**
 * Existing columns: the specified preheat of the field welds to the column is the AWS D1.1 Category B minimum for the
 * thickest part welded there (existingWeldingDemand), once the bracket or haunch is sized, rather than the capped
 * demonstration's value.
 */
function withPreheat(p:ProjectInput):ProjectInput{
 const c=p.existingColumn;if(!c?.enabled||c.isNew||!c.welding)return p;
 const g=activeStep(p)?stepGeometry(p):undefined;
 c.welding={...c.welding,preheat:existingWeldingDemand(p,g?stepWeldThickness(p,g):existingColumnSection(p).section.tf).need};
 return p;
}
/**
 * Existing columns: the configured longitudinal exit, else the crane-level strut at the column centerline, or on the
 * girder line (at least 10 times the column's own stiffness there, so the column keeps 1/11 of the force) where the
 * column fails torsion from the girder offset with the centerline strut. Both struts are by the building engineer of
 * record, specified on S-00 and S-01.
 */
function withLongitudinalExit(p:ProjectInput,cfg:RunwayConfig,trace:SelectionTrace={}):ProjectInput{
 const c=p.existingColumn;if(!c?.enabled||c.isNew)return p;
 const reactions=supportReactions(p,sectionProperties(p.section));
 if(cfg.longitudinalExit){c.longitudinalExit=cfg.longitudinalExit;if(cfg.longitudinalExit==='girder-strut'&&activeStep(p))withStepStrut(p,reactions,trace);return p;}
 c.longitudinalExit='column-strut';
 // A stepped column twists in its lower shaft (steppedColumn.ts, column-lower-torsion).
 // Its twist at the step is limited too (column-lower-twist, factored; column-lower-twist-movement, service): the worst of the three.
 const torsion=activeStep(p)?steppedColumnChecks(p,steppedColumnAnalysis(p,reactions)).filter(v=>/^column-lower-(torsion|twist|twist-movement)$/.test(v.id)).reduce((a:ReturnType<typeof steppedColumnChecks>[number]|undefined,v)=>!a||!(v.utilization!<=a.utilization!)?v:a,undefined):existingColumnChecks(p,existingColumnAnalysis(p,reactions)).find(v=>v.id==='column-torsion');
 if(torsion&&!(torsion.utilization!<=1)){c.longitudinalExit='girder-strut';trace.exit=`${torsion.id} ${Number.isFinite(torsion.utilization)?torsion.utilization!.toFixed(2):'unstable'} > 1.00 with the strut at the column centerline (the girder offset twists the column): ${activeStep(p)?'the crane-level strut on the girder line, designed here, its path to the braced bay stiff enough that the share of the force the column keeps holds the twist limits':'the crane-level strut by others on the girder line'}`;
  if(activeStep(p))withStepStrut(p,reactions,trace);}
 return p;
}
/**
 * The stepped column's crane-level strut on the girder line (craneLevelStrut.ts), new steel: the lightest W8 to W14 with
 * nonslender elements (B4.1a) and L_c/r ≤ 200 over the longest bay that passes the strut's member checks, its
 * connection the fewest and smallest bolts and the thinnest plate that pass the connection checks (A572 Gr. 50 plate,
 * A992 strut, A325 bolts); then, with the strut in the column model, the next heavier shapes while the strut's own checks
 * (with its share of the force) or the column's twist checks still fail and a stiffer strut lowers the worst ratio.
 */
function withStepStrut(p:ProjectInput,reactions:SupportReactionSet,trace:SelectionTrace){
 const s=activeStep(p)!,E=p.section.E,Fy=50*ksi,limit=(v:number)=>v<=1+1e-9;
 const g=stepGeometry(p)!,locating=[...new Set([...locatingGrids(p),...bumperAtGrids(p).grids])],layout=stepStrutLayout(p,locating);
 const shapes=aiscWShapes.filter(w=>/^W(8|10|12|14)X/.test(w.name)&&w.bf/(2*w.tf)<=.56*Math.sqrt(E/Fy)&&(w.d-2*w.kdes)/w.tw<=1.49*Math.sqrt(E/Fy)&&layout.bay/(Math.sqrt(w.Iy/w.A)*inch)<=200).sort((a,b)=>a.weight-b.weight);
 if(!shapes.length){trace.strut='No W8 to W14 keeps L_c/r ≤ 200 over the bay: the crane-level strut needs intermediate bracing (not designed here).';return;}
 const run=()=>{const a=steppedColumnAnalysis(p,reactions),z=a.summary,cls=craneLevelStrut(p,z)!;return {a,z,cls};};
 const memberIds=/^step-strut-(compression|slenderness|tension)$/,strutChecks=(x:StepStrutForces)=>stepStrutChecks(p,g,x,layout);
 // The connection for a strut and force: fewest bolts, then the smallest bolt and the thinnest plate.
 const connect=(x:StepStrutForces)=>{
  for(const n of [2,3,4,5,6])for(const db of [.75,.875,1].map(v=>v*inch))for(const rows of [2,3,4,5,6])for(const tp of [.5,.625,.75,.875,1].map(v=>v*inch)){
   s.strut={...s.strut!,plate:{...s.strut!.plate,thickness:tp},bolts:{diameter:db,grade:'A325'},strutBolts:n,columnRows:rows};
   if(strutChecks(x).every(c=>c.status==='pass'))return true;}
  return false;};
 let x:StepStrutForces|undefined,best:{U:number;strut:NonNullable<typeof s.strut>}|undefined;
 for(const w of shapes){
  s.strut={shape:w.name,Fy,Fu:65*ksi,plate:{thickness:.5*inch,Fy,Fu:65*ksi},bolts:{diameter:.75*inch,grade:'A325'},strutBolts:2,columnRows:2};
  if(!x){const r=run();x={F:r.cls.force,caseId:'',share:r.z.support?.strut?.designed?.strutShare??1,service:r.z.support!.traction};}
  if(!strutChecks(x).filter(c=>memberIds.test(c.id)).every(c=>c.status==='pass'))continue;
  if(!connect(x))continue;
  // The strut in the column model: its share of the force and the column's twist.
  const r=run(),list=[...steppedColumnChecks(p,r.a)].filter(c=>/^step-strut-|^column-lower-twist/.test(c.id)),U=Math.max(...list.map(c=>c.utilization??0));
  x={...x,share:r.z.support?.strut?.designed?.strutShare??x.share};
  if(!best||U<best.U-1e-6)best={U,strut:structuredClone(s.strut)};else break;
  if(limit(U))break;
 }
 if(!best){delete s.strut;trace.strut='No W8 to W14 strut and connection passed the strut checks: the crane-level strut on the girder line is by others.';return;}
 s.strut=best.strut;const st=s.strut,len=(v:number)=>p.units==='SI'?`${Math.round(v)} mm`:`${+(v/inch).toFixed(3)} in`;
 trace.strut=`The lightest W8 to W14 (A992, nonslender, L_c/r ≤ 200 over the ${+(layout.bay/foot).toFixed(1)} ft bay) whose member and connection checks pass with the line force${best.U>1+1e-9?` (the column twist with it is still ${best.U.toFixed(2)}: a heavier strut no longer lowers it, the existing bracing's stiffness governs)`:', and with which the column holds its twist limits'}: ${st.shape}, its web lapped on a ${len(st.plate.thickness)} plate bolted to each lower crane-side flange (${2*st.columnRows} - ${len(st.bolts.diameter)} A325), ${st.strutBolts} bolts at each strut end.`;
}
/**
 * The welded rib seats (twin-rib, haunched seat) sized for the reactions (sizeWeldedBracket): ribs, seat, fillets, the
 * rib spacing under the girder bearing stiffeners and any continuity plates the receiving column needs (where they
 * clear a new column's bracing gussets), at the reach the sized tie needs (attachTie: the shortest at which the tie
 * passes its checks), kept as it is. The tie owns its column-end release travel, sized for the bracket's deflection
 * limit with the cranes and impact (sizeFlangeTie), so the bracket's release coordination (bracketSizingRatios
 * 'release') holds wherever its deflection check does and never grows the bracket. The rolled W stub likewise
 * (sizeRolledBracket): the stub shape, spreader seat, flange joint and fillets, bearing stiffeners and the full-depth
 * continuity plates an existing column needs (a new column's only where they clear its bracing gussets).
 */
function withWeldedBracket(p:ProjectInput):ProjectInput{
 const b=p.details?.bracket;
 if(b?.enabled&&weldedRibBracket(b))p.details!.bracket=sizeWeldedBracket(p,.9,{reach:'fixed'}).details!.bracket;
 else if(b?.enabled&&isRolledBracket(b))p.details!.bracket=sizeRolledBracket(p,.9,{reach:'fixed'}).details!.bracket;
 return p;
}
/** The sizing ratios of a sized paired-bar or flexible-plate tie on a designed bracket (tieSizingRatios), else none. */
function sizedTieRatios(p:ProjectInput){
 const t=p.details?.brace,arrangement=t?.arrangement??'paired-bars';
 return t&&p.details!.bracket?.enabled&&(arrangement==='paired-bars'||arrangement==='flexible-plate')?tieSizingRatios(p):undefined;
}
/**
 * The tie finished on the sized supports: where the bracket as sized (its reach, the receiving column) leaves a tie
 * ratio worse than the tie was sized for and above its limit, the tie is sized again at that reach.
 */
function finishTie(p:ProjectInput,sized?:Record<string,number>):ProjectInput{
 const now=sized&&sizedTieRatios(p);if(!sized||!now)return p;
 const worse=Object.entries(now).some(([k,v])=>v>Math.max(sized[k]??0,sizingLimit(now,k))+1e-9);
 if(worse)p.details=sizeFlangeTie(p).details;
 return p;
}
/**
 * The tapered haunch sized for the reactions. A new column carries the haunch without continuity plates, which would
 * clash with the bracing gussets on its web: the next heavier W14 until the sizing needs none.
 */
function withHaunch(p:ProjectInput,cfg:RunwayConfig,trace:SelectionTrace={}):ProjectInput{
 const b=p.details?.bracket;
 if(!b?.enabled||b.arrangement!=='tapered-haunch')return p;
 const sized=sizeTaperedHaunch(p,.9,{light:true});
 if(cfg.structure!=='new'||cfg.columnShape||!sized.details!.bracket!.columnStiffeners?.enabled)return sized;
 for(const shape of heavierColumns(p.existingColumn!.shape)){
  const q=structuredClone(p),w=aiscShapeByName(shape)!,c=q.existingColumn!;
  Object.assign(c,{shape,d:w.d*inch,bf:w.bf*inch,tf:w.tf*inch,tw:w.tw*inch});
  q.details!.bracket!.receiver={...q.details!.bracket!.receiver,...shapePlates(shape),source:`New ${shape} column designed here; no other loads`};
  if(q.columnBase)q.columnBase.plate={...q.columnBase.plate,...basePlatePlan(shape)};
  delete q.details!.bracket!.haunch;delete q.details!.bracket!.columnStiffeners;
  q.details=selectBracketArrangement(q.details!,'tapered-haunch',q.system);
  const r=sizeTaperedHaunch(q,.9,{light:true});
  if(!r.details!.bracket!.columnStiffeners?.enabled){r.notes=r.notes.replaceAll(p.existingColumn!.shape,shape);trace.column=`The tapered haunch on the ${p.existingColumn!.shape} needs column continuity plates, which clash with the bracing gussets on a new column web: the lightest heavier W14 that needs none`;return r;}
 }
 return sized;
}
/** Sizing target of the new column bases. */
/**
 * A column cap whose sized bolts, welds or plates still exceed a ratio of 1 on the chosen column (the fork couple
 * through the bearing bolts and the all-around cap fillets grow with the column depth and flange width): the project is
 * built on the lightest heavier W14 on which the cap sizing passes; otherwise (or when a heavier W14 barely lowers the
 * governing ratio) it stays, and the checks report the cap.
 */
function withCapColumn(q:ProjectInput,cfg:RunwayConfig):ProjectInput{
 if(cfg.support!=='column-cap'||cfg.columnShape||!activeColumnCap(q))return q;
 const worst=(r:ProjectInput)=>Math.max(0,...Object.values(columnCapSizingRatios(r)));
 let last=worst(q);if(last<=1)return q;
 for(const shape of heavierColumns(q.existingColumn!.shape)){
  const r=buildProject({...cfg,columnShape:shape}),now=worst(r);
  // A heavier W14 that barely changes the governing cap ratio will not bring it to 1: the fork needs another restraint.
  if(now>1&&now>.97*last)break;last=now;
  if(now<=1){r.notes+=` The column cap on the ${q.existingColumn!.shape} column leaves a cap ratio above 1 (the fork couple through the bearing bolts and the cap fillets): the columns are ${shape}.`;return {...r,configurator:{...cfg}};}
 }
 return q;
}
const baseTarget=.9;
/**
 * The bearing stiffener pair of a girder on a column cap (the end fork: the pair cantilevers the top-flange restraint
 * force over the web depth, diaphragmArrangement 'one-flange') sized for its plate fatigue as the check
 * stiffener-fatigue takes it: the reaction range over the pair, ΔR/A_st, plus the fork moment range ΔH·h over the pair's
 * section, against Category C (AISC 360-16 Table A-3.1 item 4.1) at all the duty cycles. ΔR is the largest unfactored
 * crane reaction at a support (crane weight and lifted load, all cranes, no impact: the calculation's verticalFatigue on
 * cases 081 and 086) and ΔH the estimated tie force range (tieSizingDemands, 1.26 to 1.33 times the calculation's fork
 * range there); held to fatigueTarget, 0.9 as the other sizings. Thicker plates in 1/8 in steps up to
 * 1 1/2 in, then wider up to `maxWidth` (the clear between the column flanges); never thinner or narrower than laid out.
 */
function sizeForkStiffenerFatigue(p:ProjectInput,maxWidth:number,fatigueTarget=.9){
 const d=p.details!,bs=d.bearing;if(!activeColumnCap(p)||tiedToBuilding(p))return;
 const props=sectionProperties(p.section),strength=girderStrength(p,props),R=Math.max(0,...supportReactions(p,props).supports.map(v=>v.Cv)),H=tieSizingDemands(p).range;
 const cycles=d.spectrum.reduce((n,b)=>n+b.cycles,0),Fsr=fatigueSpectrumBin('C',1,cycles).allowable;
 const stress=(t:number,b:number)=>{const q={...bs,stiffenerThickness:t,stiffenerWidth:b};return R/(2*(b-bs.cope)*t)+H*strength.h/stiffenerPairSection(q,p.section.tw).S;};
 if(stress(bs.stiffenerThickness,bs.stiffenerWidth)<=fatigueTarget*Fsr)return;
 const e8=inch/8,widths=[bs.stiffenerWidth];for(let b=bs.stiffenerWidth+inch/4;b<=Math.min(maxWidth,(p.section.bf-p.section.tw)/2)+1e-9;b+=inch/4)widths.push(b);
 let best:{t:number;b:number}|undefined;
 for(let t=bs.stiffenerThickness;t<=1.5*inch+1e-9;t+=e8)for(const b of widths)if(stress(t,b)<=fatigueTarget*Fsr&&(!best||t*b<best.t*best.b-1e-9))best={t,b};
 if(best){bs.stiffenerThickness=best.t;bs.stiffenerWidth=best.b;bs.weldSize=Math.max(bs.weldSize,minimumFillet(Math.min(best.t,p.section.tw)));}
}
/**
 * A welded rib bracket (twin-rib, haunched seat) whose column flange at the rib weld toes exceeds the sizing target in
 * fatigue (bracketColumnFatigueRatio: the range of the whole bracket moment on the column section, AISC Table A-3.1
 * item 7.1, which no bracket part lowers): the project is built on the lightest heavier W14 within it, skipping those
 * whose larger S_x alone cannot bring the ratio there; otherwise it stays and the checks report it. A configured
 * column shape is kept.
 */
function withBracketColumn(q:ProjectInput,cfg:RunwayConfig,trace:SelectionTrace):ProjectInput{
 const b=q.details?.bracket,col=q.existingColumn;
 if(cfg.columnShape||cfg.scope!=='design'||!b?.enabled||!weldedRibBracket(b)||!col?.enabled)return q;
 const first=bracketColumnFatigueRatio(q),Sx=(name:string)=>aiscShapeByName(name)!.Sx;if(first<=bracketTarget)return q;
 for(const shape of heavierColumns(col.shape)){
  if(first*Sx(col.shape)/Sx(shape)>bracketTarget)continue;
  const inner:SelectionTrace={},r=buildProject({...cfg,columnShape:shape},inner),now=bracketColumnFatigueRatio(r);
  if(now<=bracketTarget){
   Object.assign(trace,inner,{column:[trace.column,`The ${col.shape} column flange at the bracket rib weld toes has a fatigue ratio ${first.toFixed(2)} > ${bracketTarget} (AISC Table A-3.1 item 7.1, the bracket moment range on the column section at all cycles): the lightest heavier W14 within it, ${now.toFixed(2)}`].filter(Boolean).join('; ')});
   return {...r,configurator:{...cfg}};
  }
 }
 return q;
}
/** Sizing target of the welded rib brackets (withWeldedBracket) and of the column choice for their fatigue. */
const bracketTarget=.9;
/**
 * New columns: the base plates, anchor rods and footings sized for the reactions (sizeColumnBase), and the existing
 * building's column lines moved clear of the sized footings. Where the column chosen here is too flexible for the
 * runway drift with its footing rotating on the soil, the project is built on the lightest heavier W14 that meets the
 * drift: one whose own drift leaves the footing room (at most columnDriftShare of the target, the footing sized for the
 * rest), or that meets it on the footing already sized; the configuration keeps its blank column choice.
 */
function withColumnBase(p:ProjectInput,cfg:RunwayConfig,trace:SelectionTrace={}):ProjectInput{
 const q=combinedWhereOverlapping(p,sizeColumnBase(p,baseTarget),cfg,trace);clearExistingFootings(q);
 // The column twists where the girder's longitudinal force reaches it off its centerline (a bracket) or an offset
 // rod ends: the column torsion ratios (column-torsion, brace-rod-torsion) judge the shape as the drift does.
 const torsionOk=(r:ProjectInput)=>columnTorsionRatio(r)<=1;
 if(cfg.columnShape||baseSizingRatios(q).ratios.drift<=baseTarget&&torsionOk(q))return q;
 const reactions=supportReactions(q,sectionProperties(q.section)),drift0=baseSizingRatios(q).ratios.drift,torsion0=columnTorsionRatio(q);
 const why=`the ${q.existingColumn!.shape} chosen for the crane gives ${[drift0>baseTarget?`base drift ratio ${drift0.toFixed(2)} > ${baseTarget}`:'',torsion0>1?`column torsion ratio ${torsion0.toFixed(2)} > 1.00`:''].filter(Boolean).join(' and ')}: the lightest heavier W14 within the drift and torsion ratios`;
 for(const shape of heavierColumns(q.existingColumn!.shape)){
  const t=structuredClone(q),w=aiscShapeByName(shape)!;
  Object.assign(t.existingColumn!,{shape,d:w.d*inch,bf:w.bf*inch,tf:w.tf*inch,tw:w.tw*inch});
  if(t.details?.bracket?.enabled)Object.assign(t.details.bracket.receiver,shapePlates(shape));
  const d=baseDrift(t,existingColumnAnalysis(t,reactions));
  if(d.total>baseTarget*d.limit&&d.column>columnDriftShare*baseTarget*d.limit)continue;
  if(columnTorsionRatio(t,reactions)>1.05)continue;
  const inner:SelectionTrace={},r=buildProject({...cfg,columnShape:shape},inner);
  if(baseSizingRatios(r).ratios.drift<=baseTarget&&torsionOk(r)){Object.assign(trace,inner,{column:[trace.column,why[0].toUpperCase()+why.slice(1)].filter(Boolean).join('; ')});return {...r,configurator:{...cfg}};}
 }
 return q;
}
/**
 * Crane columns beside the building columns: the footing clearance checked here. Where the sized isolated footings (the
 * larger, the braced columns', governing) come closer to the surveyed building-column footing than the required clear
 * distance, each crane column and its building column stand on one combined footing that replaces the existing one
 * (columnBase.combined, combinedFooting), sized again from the configured start; the reason is logged.
 */
function combinedWhereOverlapping(p:ProjectInput,q:ProjectInput,cfg:RunwayConfig,trace:SelectionTrace):ProjectInput{
 const k=q.craneColumn,adj=q.existingColumn?.adjacent,line=adj?.A??adj?.B;
 if(!k?.enabled||!q.columnBase?.enabled||q.columnBase.combined||!adj?.enabled||!line||!(line.footing.L>0))return q;
 const L=Math.max(...footingsOf(q).map(v=>v.L)),clear=k.offset-L/2-line.footing.L/2;
 if(clear>=adj.footingClear)return q;
 const start=structuredClone(p);start.columnBase!.combined=true;
 const r=sizeColumnBase(start,baseTarget),si=cfg.units==='SI',ft=(v:number)=>si?`${Math.round(v)} mm`:`${+(v/foot).toFixed(2)} ft`,ins=(v:number)=>si?`${Math.round(v)} mm`:`${+(v/inch).toFixed(2)} in`,F=r.columnBase!;
 trace.footing=`Isolated ${ft(L)} square crane-column footings ${ins(k.offset)} from the building column would be ${clear<0?`${ins(-clear)} into`:`${ins(clear)} from`} its ${ft(line.footing.L)} footing (${ins(adj.footingClear)} clear required): each crane column and its building column stand on one combined footing replacing the existing one, ${ft(F.footing.L)} square${F.braced?` (${ft(F.braced.footing.L)} at the braced columns)`:''}, the building column shored and re-set on new anchor rods`;
 return r;
}
/**
 * The existing building's column lines stand far enough outboard that the new footings clear theirs by the required
 * clear distance with 3 in to spare (across the runway: both footings' L).
 */
function clearExistingFootings(p:ProjectInput){
 // The building columns beside crane columns stand where the ties put them (craneColumn.offset).
 if(p.craneColumn?.enabled)return;
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
/**
 * Existing building: the example sidewall rod (bracingRod's estimate) grows by 1/4 in, to 2 1/2 in, until its own checks as
 * the calculation reports them pass (longitudinalBracingChecks): the diagonal tension and the threaded-rod fatigue
 * range of the unfactored traction at the project's cycles (AISC Table A-3.1 item 8.5, F_SR at n_SR, not below F_TH).
 */
function withExistingRod(p:ProjectInput):ProjectInput{
 const b=p.longitudinalBracing;if(!b?.enabled||b.system!=='rod-x'||!p.existingColumn?.enabled||p.existingColumn.isNew)return p;
 const reactions=supportReactions(p,sectionProperties(p.section));
 const worst=()=>Math.max(0,...longitudinalBracingChecks(p,longitudinalBracingAnalysis(p,reactions)).filter(c=>c.id==='brace-tension'||c.id==='brace-rod-fatigue').map(c=>c.utilization??0));
 for(const d of [1,1.25,1.5,1.75,2,2.25,2.5].map(v=>v*inch)){if(worst()<=1)break;if(d>b.rod.diameter+1e-6)b.rod.diameter=d;}
 return p;
}
/** Base plate plan for a column shape: the anchor rows clear the column flange welds and plate washers. */
function basePlatePlan(shape:string){const w=aiscShapeByName(shape)!;return {N:up(w.d*inch+9.5*inch,.5*inch),B:up(w.bf*inch+3.5*inch,.5*inch)};}
/** W14 column shapes heavier than the given one, lightest first. */
const heavierColumns=(shape:string)=>{const w=aiscShapeByName(shape)!;return aiscWShapes.filter(s=>s.name.startsWith('W14X')&&s.weight>w.weight&&s.weight<=398).sort((a,b)=>a.weight-b.weight).map(s=>s.name).slice(0,8);};

const bracketText=(cfg:RunwayConfig)=>({'twin-rib':'welded twin-rib bracket seats','haunched-seat':'welded haunched rib seats','rolled-corbel':'rolled W-stub brackets','tapered-haunch':'built-up tapered I haunches','by-others':'brackets by others','column-cap':'column caps','crane-column':'column caps on new crane columns tied to the building columns','stepped-column':'the steps of the existing stepped columns'})[cfg.support];

/**
 * The welded bracket of the configured kind on the supporting column: the receiving column is the column shape, the
 * bracket reaches the girder web line, and the tie between the girder and the column face spans the rest.
 */
function attachBracket(p:ProjectInput,cfg:RunwayConfig,shape:string,reach:number,isNew:boolean){
 const d=p.details!,plates=shapePlates(shape),col=p.existingColumn!,heavy=cfg.capacity>10;
 const receiver={...plates,Fy:col.Fy,Fu:col.Fu,unbracedLength:isNew?col.height:8*foot,axialDemand:isNew?0:Math.round(1.2*col.existing.D.P+1.6*col.existing.S.P),confirmed:true,
  source:isNew?`New ${shape} column designed here; no other loads`:`Fictitious example survey: existing ${shape} column, ASTM A992 per mill certificates; 8 ft flange unbraced length (girts); factored existing gravity axial 1.2D + 1.6S from the building records for the panel zone.`};
 const kind=cfg.support as Exclude<RunwayConfig['support'],'by-others'|'column-cap'|'crane-column'|'stepped-column'>;
 const base=cappedDemonstrationProject().details!.bracket!;
 let b={...structuredClone(base),reach,receiver,loadPathConfirmed:true};
 delete b.columnStiffeners;
 // The seat carries both bearings and reaches past the far bearing edge; ribs straddle the bearing bolts on the column
 // flange (the welded rib seats are sized after the tie).
 b.seatProjection=Math.max(b.seatProjection,up(reach+d.bearing.width/2+1.5*inch,inch));
 b.ribSpacing=Math.min(b.ribSpacing,plates.width-2*inch);
 // The seat covers the bearing plates as laid out (their joint gap and setting tolerance), as its sizing will: the tie is
 // sized on this bracket before the seat is (bracketSizing), and an uncovered bearing would invalidate every tie trial.
 b.seatLength=Math.max(b.seatLength,up(2*((p.system==='simple'?simpleSupportInput(p).endGap/2:0)+d.bearing.length+seatSettingTolerance),inch/2));
 if(heavy){b.ribThickness=Math.max(b.ribThickness,1.5*inch);b.seatThickness=Math.max(b.seatThickness,2*inch);b.rootWeld=Math.max(b.rootWeld,.5*inch);}
 d.bracket=b;
 p.details=selectBracketArrangement(d,kind,p.system);b=p.details.bracket!;
 if(kind==='haunched-seat'){b.tipDepth=Math.max(6*inch,up(b.ribDepth/3,inch));}
 if(kind==='rolled-corbel'){
  b.corbelShape=cfg.capacity<=10?'W12X65':cfg.capacity<=20?'W12X87':'W12X106';b.seatThickness=1.5*inch;b.seatWeld=.375*inch;
  b.rolled={...defaultRolledBracket,flangeJoint:'cjp',webWeld:.3125*inch,stiffenerThickness:.5*inch,stiffenerWeld:.25*inch,seatPlate:true};
  p.details.endBearing!.bolts.edge=Math.max(p.details.endBearing!.bolts.edge,2.125*inch);
 }
 if(kind==='tapered-haunch'){delete b.haunch;p.details=selectBracketArrangement(p.details,'tapered-haunch',p.system);b=p.details.bracket!;}
 // The welded rib seats are sized once the tie has set the reach (withWeldedBracket).
 // The tie spans from its girder end to the column face at the bracket reach.
 const t=p.details.brace,f=t.flangeAttachment;
 if(f?.enabled&&f.columnFace!==undefined){const shift=b.reach-f.columnFace;t.length+=shift;t.reach=t.length;delete f.columnFace;}
 // Bars on the bearing stiffener (no flange saddle): from 1/4 in clear of the stiffener to the column face.
 else if(!f?.enabled){t.length=t.reach=b.reach-up(p.section.tw/2+p.details.bearing.stiffenerWidth+.25*inch,.25*inch);}
}

/**
 * Lower shaft of an existing stepped column for the crane: one assumed size per crane class (a fictitious example to be
 * replaced with the survey), matched to the example upper shaft (existingColumnFor) so that it holds it within its
 * flanges. Only an entered upper shaft that this size cannot hold moves the example to the lightest W24 to W33 that
 * does; the lower shaft is never resized for the new steel's checks (withSteppedTie).
 */
/** Assumed existing step cap thickness for the crane class (a fictitious example, replaced with the survey): 1 1/2 in to 15 t, 2 in to 30 t, else 2 1/2 in. */
export const steppedCapFor=(capacity:number)=>(capacity<=15?1.5:capacity<=30?2:2.5)*inch;
export const steppedLowerFor=(capacity:number)=>capacity<=15?'W30X173':capacity<=30?'W33X201':'W33X221';
const steppedLowerShapes=(start:string)=>{const w=aiscShapeByName(start)!;return aiscWShapes.filter(s=>/^W(24|27|30|33)X/.test(s.name)&&s.weight>=w.weight).sort((a,b)=>a.weight-b.weight).map(s=>s.name);};
/**
 * The girder on the step of an existing stepped column (support 'stepped-column'): the existing column becomes the lower
 * shaft (steppedLowerFor, or the configured column shape), the upper shaft the building column for the crane
 * (buildingColumnShape, else existingColumnFor), outer flanges flush, the girder web over the lower shaft's crane-side
 * flange and the top-flange tie to the upper shaft's inner face; fictitious example step cap and roof effects on the
 * upper shaft, marked as such. The step stiffener and the cap are finished once the bearings are laid out (finishSteppedColumn).
 */
function withSteppedColumn(p:ProjectInput,cfg:RunwayConfig,scopeText:string,trace:SelectionTrace){
 const c=p.existingColumn!,d=p.details!,upper=cfg.buildingColumnShape??existingColumnFor(cfg.capacity),wu=aiscShapeByName(upper)!;
 const girderHalf=(p.section.kind==='cap'?p.section.capWidth:p.section.bf)/2,room=6*inch;
 const fits=(name:string)=>{const w=aiscShapeByName(name)!;return w.bf>=wu.bf-1e-9&&(w.d-wu.d-w.tf/2)*inch-girderHalf>=room;};
 const start=steppedLowerFor(cfg.capacity),lower=cfg.columnShape??steppedLowerShapes(start).find(fits)??start,wl=aiscShapeByName(lower)!;
 if(!cfg.columnShape)trace.lower=`Assumed existing lower shaft for a ${+cfg.capacity.toFixed(2)}-ton crane (W30X173 to 15 t, W33X201 to 30 t, else W33X221; a fictitious example to be replaced with the survey)${lower!==start?`; ${start} does not hold the ${upper} upper shaft within its flanges with ${+(room/inch).toFixed(1)} in of tie room past the girder ${p.section.kind==='cap'?'cap':'flange'}: the lightest heavier W24 to W33 that does`:''}. An existing member: the configurator does not resize it for the new steel.`;
 if(!cfg.buildingColumnShape)trace.upper=`Fictitious example upper shaft (the building column above the step) for a ${+cfg.capacity.toFixed(2)}-ton crane (W14X90 to 7.5 t, W14X120 to 15 t, W14X159 to 30 t, else W14X211); replace with the surveyed shape.`;
 const lo={d:wl.d*inch,bf:wl.bf*inch,tf:wl.tf*inch,tw:wl.tw*inch},hi={d:wu.d*inch,bf:wu.bf*inch,tf:wu.tf*inch,tw:wu.tw*inch};
 Object.assign(c,{shape:lower,...lo});
 // The upper shaft runs 12 ft from the step to the roof; 8 ft girt spacing on both shafts.
 c.height=c.seatElevation+12*foot;c.Lcx=c.height;c.Lcy=c.Lcz=c.Lb=8*foot;
 c.source=`Fictitious example: survey of the existing stepped columns (lower ${lower}, upper ${upper}) and the original building calculations, column line B`;
 const girderOffset=lo.d/2-lo.tf/2,w=d.bearing.width;
 c.step={upper:{shape:upper,...hi,Fy:50*ksi,Fu:65*ksi},offset:(lo.d-hi.d)/2,girderOffset,
  // Roof effects on the upper shaft just above the step: the lower shaft's example effects, signed as aggravating the crane moment (conservative).
  existingUpper:structuredClone(c.existing),
  cap:{thickness:steppedCapFor(cfg.capacity),width:up(lo.d-lo.tf+w,inch),length:up(Math.max(lo.bf,2*d.bearing.length+2*inch),inch)},capWeld:(cfg.capacity<=15?5/16:1/2)*inch,upperLcy:8*foot,construction:'rolled',
  source:`Fictitious example: step cap, its ${cfg.capacity<=15?'5/16':'1/2'} in fillet welds and the upper-shaft roof effects at the step from the original building calculations (gravity moments taken as adding to the crane moment)`,confirmed:true};
 c.eccentricity=girderOffset+columnReactionOffset(p);
 if(d.bracket)d.bracket.enabled=false;
 p.aist!.supportType='column';
 // The tie runs from the girder to the upper shaft's inner flange face (stepGeometry).
 setStepTieFace(p);
 p.notes=`Example configuration generated by the CraneCalc configurator; fictitious crane, supplier, survey and owner data, to be replaced with project data. Scope: ${scopeText}, bearing on the steps of the existing stepped columns (lower ${lower}, upper ${upper}) over the lower shafts' crane-side flanges, with top-flange ties to the upper shafts, the rail, bearings and end stops; the stepped columns are checked as two-shaft columns with their existing load effects (effective lengths from a buckling analysis), with the step's local checks, and the existing sidewall rod bracing takes the crane longitudinal forces.`;
}
/** The tie's column face at the upper shaft's inner flange, the tie length following it. */
function setStepTieFace(p:ProjectInput){
 const g=stepGeometry(p);if(!g)return;
 const d=p.details!,t=d.brace,f=t.flangeAttachment,face=g.tieDistance;
 if(f?.enabled&&f.columnFace!==undefined){t.length+=face-f.columnFace;t.reach=t.length;f.columnFace=face;}
 else{t.length=t.reach=face-up(p.section.tw/2+d.bearing.stiffenerWidth+.25*inch,.25*inch);if(f)f.columnFace=face;}
 if(d.brace.capAngle)d.brace.capAngle.columnFace=face;
}
/**
 * Existing step fillets that still fail their Category F throat fatigue (step-weld-fatigue) once the step stiffener is
 * settled: built up in the field to the required leg (step.capWeldAdded, new work: the next 1/16 in above the required
 * leg, at most 1 in), a designed new-steel item instead of an open one. Above 1 in the step stays an engineer-of-record item.
 */
function buildUpStepWelds(q:ProjectInput,list:CheckResultLike[],trace:SelectionTrace):ProjectInput{
 const s=activeStep(q)!,w=list.find(v=>v.id==='step-weld-fatigue') as (CheckResultLike&{demand?:number;utilization?:number})|undefined;
 if(!w||w.status!=='fail'||w.demand===undefined)return q;
 const leg=Math.ceil(w.demand/(inch/16)-1e-9)*inch/16;
 if(leg>inch+1e-9)return q;
 s.capWeldAdded=leg;
 const why=`The existing ${+((s.capWeld??0)/inch).toFixed(3)} in step fillets fail Category F throat fatigue (step-weld-fatigue ${(w.utilization??0).toFixed(2)}, no bearing credit for an unfinished cap): built up in the field to a ${+(leg/inch).toFixed(4)} in leg (new work, AWS D1.1 Clause 11).`;
 trace.step=`${trace.step?trace.step+' ':''}${why}`;q.notes+=` ${why}`;
 return q;
}
/**
 * The step finished on the laid-out bearings: the example cap covers both girder bearings along the runway and the
 * bearing plate across it, at the assumed thickness for the crane class (never thickened: a failing cap is an EOR item); a step stiffener pair under
 * the upper inner flange only where the unstiffened lower web fails J10.2 or J10.3, the lightest plate that passes
 * every stiffener check.
 */
function finishSteppedColumn(q:ProjectInput,trace:SelectionTrace):ProjectInput{
 const s=activeStep(q);if(!s||!q.details)return q;
 // A continuous girder's runway-end bearing lies wholly on one side of the grid (seatEnds: centered N/2 from it), so the cap
 // reaches N plus the setting tolerance each way (end-bearing-seat-fit), as a simple span's shared grid does.
 const c=q.existingColumn!,d=q.details,N=d.bearing.length,reach=q.system==='continuous'?N/2:Math.max(0,...independentBearings(q).map(b=>Math.abs(b.center-b.station)));
 s.cap={...s.cap,width:up(c.d-c.tf+d.bearing.width,inch),length:up(Math.max(c.bf,2*(reach+N/2)+inch,N+inch),inch)};
 const reactions=supportReactions(q,sectionProperties(q.section)),checks=()=>steppedColumnChecks(q,steppedColumnAnalysis(q,reactions));
 const bad=(list:CheckResultLike[],ids:RegExp)=>list.filter(v=>ids.test(v.id)&&v.status==='fail');
 // The cap is existing steel (its assumed thickness per crane class, steppedCapFor): never thickened for the checks; a
 // failing cap check is a reinforcement or engineer-of-record item.
 let list=checks();
 const capFails=bad(list,/^step-(bearing|cap-flexure|flange-yielding)$/);
 if(capFails.length){trace.step=`The existing step cap (assumed PL ${+(s.cap.thickness/inch).toFixed(3)} in) fails ${capFails.map(v=>v.id).join(', ')}: a reinforcement or engineer-of-record evaluation item (the configurator does not resize existing members).`;q.notes+=` ${trace.step}`;}
 // The existing cap-to-web fillets under the inner flange carry its force range in full when no stiffener is fitted
 // (step-weld-fatigue, Category F, no bearing credit for an unfinished cap): a stiffener pair fitted to bear under the
 // inner flange (new steel) takes that force on its own fillets (step-stiffener-fatigue) and relieves those welds.
 const required=bad(list,/^step-stiffener-required$/).length>0,weldU=list.find(v=>v.id==='step-weld-fatigue')?.utilization??0,weld=weldU>1+1e-9;
 if(!required&&!weld)return q;
 const tw=c.tw,width=Math.floor((c.bf/2-tw/2-.25*inch)/(inch/4)+1e-9)*inch/4;
 for(const t of [.375,.5,.625,.75,.875,1,1.25].map(v=>v*inch)){
  s.stiffener={thickness:t,width,weld:Math.max(.3125*inch,t>=.75*inch?.375*inch:0)};list=checks();
  if(!bad(list,/^step-stiffener-/).length)break;
 }
 const after=list.find(v=>v.id==='step-weld-fatigue')?.utilization??0;
 // Added for the welds alone, the pair stays only where it lowers the weld ratio (the cap-to-web fillet governed).
 if(!required&&!(after<weldU-1e-9)){delete s.stiffener;return buildUpStepWelds(q,checks(),trace);}
 const web=list.find(v=>v.id==='step-web-yielding'||v.id==='step-web-crippling');
 trace.step=`${trace.step?trace.step+' ':''}${required?`The unstiffened lower web fails J10.2/J10.3 under the upper shaft's inner flange (${web?.title??'step web'})`:`The existing cap-to-web fillets under the upper shaft's inner flange fail Category F throat fatigue (step-weld-fatigue ${weldU.toFixed(2)}, no bearing credit for an unfinished cap)`}: a stiffener pair under the inner flange (J10.8), fitted to bear on the cap, the thinnest plate passing the stiffener checks${bad(list,/^step-stiffener-/).length?' (none of the sizing steps passes them all; the checks report the stiffener)':''}${!required?`; it carries the inner-flange force to the web on its own fillets (step-weld-fatigue ${after.toFixed(2)} with it)`:''}.`;
 q.notes+=` ${trace.step}`;
 return buildUpStepWelds(q,list,trace);
}
type CheckResultLike={id:string;status:string};
/**
 * A column step fixes the tie's column face at the upper shaft's inner flange, d_l − d_u − t_fl/2 from the girder web
 * (flush outer flanges). The lower shaft is an existing member: it is never resized to make the new tie pass. Where the
 * sized paired bars or flexible plate still exceed a sizing ratio there, the checks report the tie and the selections log
 * names new-steel remedies.
 */
function withSteppedTie(q:ProjectInput,cfg:RunwayConfig,trace:SelectionTrace):ProjectInput{
 const s=activeStep(q);if(!s||!q.details)return q;
 // The existing shafts as assumed or entered: their governing ratios, reported (never resized).
 const checks=steppedColumnChecks(q,steppedColumnAnalysis(q,supportReactions(q,sectionProperties(q.section)))),U=(id:string)=>checks.find(v=>v.id===id)?.utilization??0;
 const shafts=[['upper',U('column-upper-interaction')],['lower',Math.max(U('column-lower-interaction'),U('column-lower-torsion'))]] as const;
 trace.shafts=`Existing shafts as assumed: H1 ratio ${shafts.map(([k,v])=>`${k} ${v.toFixed(2)}`).join(', ')}${shafts.some(([,v])=>v>1+1e-9)?': over 1.00, a reinforcement or engineer-of-record evaluation item (the configurator does not resize existing members)':''}.`;
 if(!flangeTieFamily(q.details))return q;
 const worstOf=(r:ProjectInput)=>{const misfit=validateRunwayDetails(r).find(e=>/^details\.brace|tie/.test(e));
  return misfit?['tie fit',Infinity] as [string,number]:Object.entries(tieSizingRatios(r)).reduce((a,v)=>v[1]>a[1]?v:a,['',0] as [string,number]);};
 const worst=worstOf(q);
 if(worst[1]<=1+1e-9)return q;
 const face=+((q.details.brace.flangeAttachment?.columnFace??q.details.brace.reach)/inch).toFixed(2),label=(k:string)=>tieLabels[k as keyof typeof tieLabels]??k;
 const why=`At the step the tie runs only to the upper shaft's inner face (${face} in from the girder web), where ${Number.isFinite(worst[1])?`the sized ${label(tieArrangement(q.details)).toLowerCase()} exceeds its sizing ratio ${worst[0]} (${worst[1].toFixed(2)} > 1.00)`:'the bars do not fit between their bolt groups'}`;
 // New steel first: another flange tie type at the same (existing) geometry, where it passes; never a different column.
 if(!trace.stepTieRetry)for(const alt of (['paired-bars','flexible-plate'] as const).filter(k=>k!==cfg.tie)){
  const inner:SelectionTrace={stepTieRetry:true},r=buildProject({...cfg,tie:alt},inner);
  if(!activeStep(r)||!r.details||!flangeTieFamily(r.details)||tieArrangement(r.details)===tieArrangement(q.details))continue;
  const now=worstOf(r);
  if(now[1]<=1+1e-9){
   const text=`${why}: the ${label(tieArrangement(r.details)).toLowerCase()} passes there (new steel; the existing column is kept as assumed).`;
   Object.assign(trace,inner,{stepTieRetry:undefined,stepTie:text,tie:[inner.tie,text].filter(Boolean).join(' ')});
   r.notes+=` ${text}`;
   return {...r,configurator:{...cfg}};
  }
 }
 trace.stepTie=`${why}: the existing column is not resized; the checks report the tie. New-steel remedies: a longer tie to a new stub or stand-off on the upper shaft, a column-end slide, or a different tie type.`;
 q.notes+=` ${trace.stepTie}`;
 return q;
}

/**
 * The girder bearings for the supports and the tie as configured: steel shims under the bearing plates on existing, by-others and field-welded seats (defaultBearingShim); and the plate,
 * bolts and slot travel sized for the girder (applyBearingLayout: the length for the bolt layout, the J10 end bearing
 * and any remaining flange saddle; the travel from the span and the factored end rotation).
 */
function setBearings(p:ProjectInput){
 const d=p.details;if(!d)return;
 d.bearing.shim=defaultBearingShim(bearingSeat(p));
 const before=d.bearing.length;
 const rotation=girderEndEstimate(p).factored,force=tieSizingDemands(p).force,slip=seatTwistSlip(p);
 applyBearingLayout(p,rotation,force,slip);
 // A cap tieback angle at a runway-end grid: with the bearing centered on the grid its column end plate would land on the
 // column web; the girder end then stays on the grid.
 if(p.system==='simple'&&d.brace.arrangement==='cap-angle'&&d.simpleSupport?.endGridBearing==='centered'&&validateRunwayDetails(p).some(e=>e.includes('details.brace.capAngle'))){
  d.simpleSupport.endGridBearing='on-grid';applyBearingLayout(p,rotation,force,slip);}
 // A tapered haunch takes its top flange from the bearings it holds: proportioned again for the new bearing length.
 const b=p.details!.bracket;
 if(b?.enabled&&b.arrangement==='tapered-haunch'&&Math.abs(p.details!.bearing.length-before)>1e-6){delete b.haunch;p.details=selectBracketArrangement(p.details!,'tapered-haunch',p.system);}
}
/** The locating column's service twist movement at the seat (columnTwistLimit.twistSlip): the bearing slots take it. */
function seatTwistSlip(p:ProjectInput){
 if(!p.existingColumn?.enabled||activeStep(p))return 0;
 if(!p.existingColumn.isNew||tiedToBuilding(p))return 0;
 try{return twistSlip(existingColumnAnalysis(p,supportReactions(p,sectionProperties(p.section))));}catch{return 0;}
}
/** Top-flange service where a welded saddle attachment (AISC Table A-3.1 Category D or E) on the tied flange is avoided: CMAA Class D to F cranes, AIST Class A and B buildings. */
const highCycle=(cfg:RunwayConfig)=>['D','E','F'].includes(cfg.cmaa)||cfg.buildingClass==='A'||cfg.buildingClass==='B';
/**
 * The configured tieback on the details. Paired bars and the flexible plate are sized for the girder's tie force and
 * imposed movements (sizeFlangeTie): bars or plate, bolts, gussets, saddle and release slots, the column face (a
 * designed bracket's reach, or the face of a bracket by others) moving out to at most 30 in where the flexible length
 * needs it, unless the reach is configured. A saddle tie on a capped girder that cannot pass its checks so (the gusset
 * clear of the cap legs, the W flange local bending) takes the cap tieback angle instead, with the reason in the notes.
 */
function attachTie(p:ProjectInput,cfg:RunwayConfig,trace:SelectionTrace={}){
 const d=p.details!;let capMisfit:string|undefined;
 if(cfg.support==='column-cap')return;
 if(cfg.tie==='flexible-plate'){
  p.details=selectTieArrangement(d,'flexible-plate');
  const t=p.details.brace,light=cfg.capacity<=5,thickness=(light?.25:cfg.capacity<=15?.375:.5)*inch;
  Object.assign(t,{thickness,width:Math.max(t.width,6*inch),gussetThickness:Math.max(t.gussetThickness,2*thickness)});
  Object.assign(t.connection,{thickness});t.connection.weldLength=columnGussetHeight(p);
 }else if(cfg.tie==='cap-angle'&&p.section.kind==='cap'){
  const before=structuredClone(d);
  p.details=selectTieArrangement(d,'cap-angle');
  capMisfit=fitCapAngle(p);if(!capMisfit)return;
  // No cap angle of the sizing steps fits this girder end and column: paired flat bars on a top-flange saddle.
  p.details=before;p.details.brace.arrangement='paired-bars';delete p.details.brace.capAngle;
  trace.tie=`No cap tieback angle of the sizing steps fits this girder end and column (${capMisfit}): the tie is paired flat bars on a top-flange saddle.`;p.notes+=` ${trace.tie}`;
 }else if(d.brace.arrangement!=='paired-bars'){
  d.brace.arrangement='paired-bars';delete d.brace.capAngle;
 }
 const bracket=structuredClone(p.details!.bracket),face=p.details!.brace.flangeAttachment?.columnFace;
 // The farthest column face the tie sizing may move to: none on a column step, whose upper shaft fixes it.
 const farthest=cfg.reach===undefined&&cfg.support!=='stepped-column'?30*inch:undefined;
 p.details=sizeFlangeTie(p,{reach:farthest}).details;
 // A flexible plate still over a code limit when sized (its one ply takes the whole force with the imposed movement in
 // the H1 sum): paired bars on the same saddle, sized from the same column face, where they exceed their limits by less.
 if(p.details!.brace.arrangement==='flexible-plate'&&p.section.kind!=='cap'){
  const excess=(q:ProjectInput)=>Object.values(tieSizingRatios(q)).reduce((n,v)=>n+Math.max(0,v-1),0),now=excess(p);
  if(now>1e-9){
   const q=structuredClone(p);q.details=selectTieArrangement(q.details!,'paired-bars');delete q.details.brace.referenceDetail;
   if(bracket)q.details.bracket=structuredClone(bracket);if(face!==undefined)q.details.brace.flangeAttachment!.columnFace=face;
   q.details=sizeFlangeTie(q,{reach:farthest}).details;
   const worst=Object.entries(tieSizingRatios(p)).sort((a,b)=>b[1]-a[1])[0];
   if(excess(q)<now-1e-9){p.details=q.details;trace.tie=`The flexible plate cannot pass as sized (tie sizing ratio ${worst[0]} ${worst[1].toFixed(2)} > 1.00 for the estimated tie demands): the tie is paired flat bars on the same saddle, each bar taking half the force.`;p.notes+=` ${trace.tie}`;}
  }
 }
 if(p.section.kind==='cap'&&flangeTieGeometry(p)){
  const ratios=tieSizingRatios(p),worst=Object.entries(ratios).sort((a,b)=>b[1]-a[1])[0];
  if(worst&&worst[1]>1&&!capMisfit){
   // The cap angle slides in its slots and needs no flexible length: the column face goes back where the tie started.
   const saddle=structuredClone(p.details!);
   if(bracket)p.details!.bracket=bracket;if(face!==undefined)p.details!.brace.flangeAttachment!.columnFace=face;
   p.details=selectTieArrangement(p.details!,'cap-angle');
   const misfit=fitCapAngle(p),why=`The ${cfg.tie==='flexible-plate'?'flexible plate':'paired flat bars'} on a direct flange saddle do not suit this capped girder (tie sizing ratio ${worst[0]} ${worst[1].toFixed(2)} > 1.00 for the estimated tie demands)`;
   // A cap angle that does not fit the girder end and column: the saddle tie stays, its checks report it.
   if(misfit)p.details=saddle;
   trace.tie=misfit?`${why}, and no cap tieback angle of the sizing steps fits this girder end and column (${misfit}): the saddle tie stays as sized.`:`${why}: the tie is the cap tieback angle bolted to the channel cap.`;
   // A cap angle that fits but clearly cannot carry the tie force (capAngleUnresolved): the bars on the bearing stiffener.
   const stiff=!misfit&&capStiffenerTie({...p,details:saddle},p,farthest,bracket,face);
   if(stiff){p.details=stiff.details;trace.tie=`${why}, and the cap tieback angle cannot carry the tie force (${stiff.angle}): ${stiff.text}`;}
   p.notes+=` ${trace.tie}`;
  }
 }
 // A rolled simple-span girder whose sized saddle still exceeds a flange or saddle limit, or on a high-cycle runway: the
 // tie on the bearing stiffener instead (tieOnBearingStiffener).
 const moved=tieOnBearingStiffener(p,{reach:farthest,highCycle:highCycle(cfg)?`CMAA Class ${cfg.cmaa}, AIST Class ${cfg.buildingClass}`:undefined,bracket,face,
  prefer:cfg.support==='crane-column'?'on a crane column the top flange is tied to the building column, a flexible restraint: the girder twists more at the supports, and a welded saddle on the tied flange is a Category D/E attachment in that flange lateral bending':undefined});
 if(moved){p.details=moved.details;trace.tie=`A direct flange saddle does not suit this rolled girder (${moved.why}): the ${cfg.tie==='flexible-plate'?'tie is paired flat bars, which':'paired flat bars'} bolt to the tie-side bearing stiffener, cut as one plate with its gusset extension past the flange tip (no weld at the gusset), the full-depth stiffener pair carrying the tie force into the girder.`;p.notes+=` ${trace.tie}`;}
 // A configured reach holds the column face: where the sized tie still exceeds an imposed-movement limit there, the log
 // says so (the sizing moves the face out only where the reach is left to it).
 const movement=['tie-move-strength','tie-move-weld','tie-move-gusset','tie-move-fatigue','tie-move-root-fatigue'];
 if(cfg.reach!==undefined&&(tieArrangement(p.details)==='paired-bars'||tieArrangement(p.details)==='flexible-plate')){
  const over=Object.entries(tieSizingRatios(p)).filter(([k,v])=>movement.includes(k)&&v>1+1e-9).sort((a,b)=>b[1]-a[1]);
  if(over.length){const why=`The configured reach ${cfg.units==='SI'?`${Math.round(cfg.reach*inch)} mm`:`${cfg.reach} in`} holds the column face, and the tie at it still exceeds ${over.slice(0,2).map(([k,v])=>`${k} ${v.toFixed(2)}`).join(', ')} for the estimated tie demands: the girder end movement needs a longer flexible length (a longer reach, left blank for the configurator to choose).`;trace.tie=trace.tie?`${trace.tie} ${why}`:why;p.notes+=` ${why}`;}
 }
 // Paired bars that cannot follow the girder end movement with both ends fixed take the column-end slide (sizeFlangeTie).
 const slide=p.details!.brace.release?.slide;
 if(slide&&tieArrangement(p.details)==='paired-bars'){const why=`Fixed at both ends at this reach, the paired bars cannot follow the girder end rotation and thermal travel along the runway (the tie movement checks over their limits): the column gusset slides ${cfg.units==='SI'?`${Math.round(slide)} mm`:`${+(slide/inch).toFixed(3)} in`} each way along the runway on longer sleeves (column-end slide, fillers at the girder gusset; checks tie-slide-*).`;trace.tie=trace.tie?`${trace.tie} ${why}`:why;p.notes+=` ${why}`;}
}

/**
 * Rail clips across a simple-span girder joint: no clear gap between clips may exceed the clip spacing
 * (validateRunwayDetails). With a direct flange saddle the end clips stand clear of the saddle, its end fillet and the
 * clip's reach through the flange thickness (saddleClipSetback), so a long bearing or a thick flange opens the joint gap
 * past the spacing. The saddle first moves toward the girder end, 1/16 in at a time up to its end fillet one weld size
 * from the girder end (validated), to the least setback that closes the gap with no new misfit (the tie at a runway-end
 * grid moves off the grid as the saddle does), which shortens the clip-free end zone without changing the tie; else the tie moves
 * onto the bearing stiffener (tieOnBearingStiffener: no saddle, the clips then stand half their base from the girder
 * ends). Returns true where the tie changed (the bearings are then laid out again).
 */
const clipGapRule='girder gap plus rail clip end setbacks exceed the maximum clip spacing';
function fitClipJoints(p:ProjectInput,cfg:RunwayConfig,trace:SelectionTrace):boolean{
 const d=p.details,a=d?.brace.flangeAttachment,gapped=(q:ProjectInput)=>validateRunwayDetails(q).some(e=>e.includes(clipGapRule));
 if(!d||!p.aist||p.system!=='simple'||!a?.enabled||!gapped(p))return false;
 const len=(v:number)=>cfg.units==='SI'?`${Math.round(v)} mm`:`${+(v/inch).toFixed(3)} in`,ks=railClipStations(p);
 const gap=Math.max(...ks.slice(1).map((x,i)=>x-ks[i])),errors=validateRunwayDetails(p).length;
 const why=`with the tie saddle the rail clips stand clear of it at each girder end, so the clips across a girder joint would be ${len(gap)} apart, more than the ${len(p.aist.clipSpacing)} clip spacing`;
 // The least setback that closes the gap (a saddle farther out moves the tie at a runway-end grid off the grid).
 const far=Math.floor((d.bearing.length/2-a.saddleLength/2-a.weldSize)/(inch/16)+1e-9)*inch/16;
 for(let x=Math.ceil(a.longitudinalSetback/(inch/16)-1e-9)*inch/16+inch/16;x<=far+1e-6;x+=inch/16){
  const q=structuredClone(p);q.details!.brace.flangeAttachment!.longitudinalSetback=x;
  if(!gapped(q)&&validateRunwayDetails(q).length<errors){
   p.details=q.details;const note=`Rail clips: ${why}: the saddle sits ${len(x)} from the bearing center toward the girder end (its end fillet at least one weld size on the flange), so the clips come closer to the joint.`;
   trace.tie=trace.tie?`${trace.tie} ${note}`:note;p.notes+=` ${note}`;return false;
  }
 }
 const moved=tieOnBearingStiffener(p,{reach:cfg.reach===undefined&&cfg.support!=='stepped-column'?30*inch:undefined,bracket:d.bracket,face:a.columnFace,misfit:why});
 if(!moved)return false;
 p.details=moved.details;const note=`A direct flange saddle does not suit this rolled girder (${moved.why}): the paired flat bars bolt to the tie-side bearing stiffener, cut as one plate with its gusset extension past the flange tip, and the rail clips stand half their base from the girder ends.`;
 trace.tie=note;p.notes+=` ${note}`;
 return true;
}

/**
 * The cap tieback angle sized on the project (sizeCapAngle, held to the validateCapAngle fit). A girder end at a
 * runway-end grid whose centered bearing puts every angle's column end plate on the column web stays on the grid (as
 * setBearings does), and the angle is sized again. Returns the first fit rule no sized angle meets, else undefined.
 */
function fitCapAngle(p:ProjectInput):string|undefined{
 // The validateCapAngle rules, then the fit ratios the sizing holds at one (capAngleFits: the cap bolt edge to the
 // channel flange tip, the hardware below the top of the rail, the column nuts clear of the web fillet).
 const fitRatios=()=>{const g=capAngleGeometry(p);if(!g)return ['no cap angle geometry'];const m=capAngleMovementEstimate(p),r=capAngleSizingRatios(p,g,capAngleForceEstimate(p),m,d.spectrum.reduce((a,v)=>a+v.cycles,0)) as Record<string,number>;
  return [...capAngleFits].filter(k=>r[k]>1+1e-9).map(k=>`${k} ${r[k].toFixed(2)}`);};
 const d=p.details!,size=()=>{d.brace.capAngle=sizeCapAngle(p,capAngleForceEstimate(p),undefined,capAngleMovementEstimate(p));const v=validateCapAngle(p);return v.length?v:fitRatios();};
 let misfit=size();
 if(misfit.length&&p.system==='simple'&&d.simpleSupport?.endGridBearing==='centered'){d.simpleSupport.endGridBearing='on-grid';misfit=size();}
 return misfit[0]?.replace(/^details\.brace\.capAngle: /,'').replace(/(: |\. |\.$).*$/,'');
}
/**
 * The ratios by which the sized cap tieback angle clearly fails under the estimated tie force and movements, beyond
 * what the estimate's conservatism can explain: a strength or fit ratio past 1.5 (the tie force estimate, 2 × 1.6 times
 * the side thrust, bounds the calculated force), or a fatigue ratio the imposed movement controls past 2 (bounds of
 * the estimate; case 031, 1.38 estimated, is within its limit calculated). Undefined where the angle may pass; the
 * calculation then checks it. beyondCatalog reports it as an open item otherwise (case 047: lap slip 11.5, no capacity).
 */
function capAngleUnresolved(p:ProjectInput):string|undefined{
 const d=p.details!,g=capAngleGeometry(p);if(!g)return 'no cap angle geometry';
 const r=capAngleSizingRatios(p,g,capAngleForceEstimate(p),capAngleMovementEstimate(p,!!d.bracket?.enabled),d.spectrum.reduce((a,v)=>a+v.cycles,0));
 const moved=r.movementControlled??new Set<string>(),over=Object.entries(r as Record<string,number>).filter(([k,v])=>v>(moved.has(k)?2:1.5)).sort((a,b)=>b[1]-a[1]);
 return over.length?`sized ${d.brace.capAngle?.shape} still exceeds ${over.slice(0,3).map(([k,v])=>`${k} ${Number.isFinite(v)?v.toFixed(2):'no capacity'}`).join(', ')}`:undefined;
}
/**
 * Paired flat bars on the tie-side bearing stiffener of a capped simple-span girder, in place of a fitting cap tieback
 * angle that clearly cannot carry the tie force (capAngleUnresolved: its two bolts per group and one tie plate past
 * 1.5 of their strength, or the movement-controlled fatigue past 2): the bars and the gusset extension drop below the
 * cap channel's turned-down flanges (stiffenerTieGeometry) and the full-depth stiffener pair takes the force into the
 * girder (tieOnBearingStiffener, sized by sizeFlangeTie). Kept where the bars validate and their largest sizing ratio is
 * below the angle's (the estimates of each under the same tie force model); `saddle` is the project with the sized
 * saddle tie, `angle` with the sized cap angle. Undefined where the angle may pass, or the bars do no better.
 */
function capStiffenerTie(saddle:ProjectInput,angle:ProjectInput,reach:number|undefined,bracket:NonNullable<ProjectInput['details']>['bracket'],face:number|undefined){
 const over=capAngleUnresolved(angle);if(!over)return undefined;
 const g=capAngleGeometry(angle)!,d=angle.details!,ra=capAngleSizingRatios(angle,g,capAngleForceEstimate(angle),capAngleMovementEstimate(angle,!!d.bracket?.enabled),d.spectrum.reduce((a,v)=>a+v.cycles,0));
 const worstAngle=Math.max(...Object.values(ra as Record<string,number>));
 const moved=tieOnBearingStiffener(saddle,{reach,bracket,face,capped:true,misfit:`the cap tieback angle ${over}`});
 if(!moved)return undefined;
 const q={...saddle,details:moved.details},r=Object.entries(tieSizingRatios(q)).sort((a,b)=>b[1]-a[1]),worst=r[0]?.[1]??0;
 // The bearings are laid out again after the tie (setBearings): the column gussets at the bearing stiffeners must still
 // land on the receiving column flange (coord-tie-gusset-flange) as laid out then.
 const laid=structuredClone({...angle,details:moved.details});setBearings(laid);
 if(!(worst<worstAngle-1e-9)||stiffenerGussetMisfit(laid)||validateRunwayDetails(laid).length)return undefined;
 const left=r.filter(([k,v])=>v>sizingLimit(Object.fromEntries(r),k)+1e-9);
 return {details:moved.details,angle:over,text:`the paired flat bars bolt to the tie-side bearing stiffener${stiffenerTieJoint(q)==='integral'?', cut as one plate with its gusset extension past the flange tip':', through a gusset plate CJP welded to the stiffener edge (UT)'}, the bars below the cap channel flanges, the full-depth stiffener pair carrying the tie force into the girder${left.length?` (sized, still over ${left.slice(0,2).map(([k,v])=>`${k} ${v.toFixed(2)}`).join(', ')} for the estimated tie demands)`:''}.`};
}
/** Reasons the build steps record for the selection log (selectionLog). */
export interface SelectionTrace {tie?:string;column?:string;exit?:string;splice?:SplicesDesigned;clip?:string;
 /** Crane columns: the footing arrangement chosen by the clearance to the building-column footing (combinedWhereOverlapping). */
 footing?:string;
 /** Crane columns: the column tie sizing and the column face to the girder web (finishCraneColumn). */
 columnTie?:string;craneFace?:string;
 /** Stepped column: the lower and upper shaft choice and the step stiffener or cap the step checks needed. */
 lower?:string;upper?:string;step?:string;stepTie?:string;
 /** Stepped column: the crane-level strut on the girder line designed here (withStepStrut). */
 strut?:string;
 /** Internal: a rebuild with another tie type at the step (withSteppedTie), which does not try again. */
 stepTieRetry?:boolean;
 /** Stepped column: the existing shafts' governing ratios as built (never resized), a failing one an EOR / reinforcement item. */
 shafts?:string;
 /** The rail without its pad, the clips at the 30 in no-pad spacing (withoutRailPad). */
 pad?:string}
/**
 * No catalog girder within the targets, and the closest past a limit itself (an open item, the closest built and
 * calculated). The deflection estimates are the moving-load analysis scaled by 1/I (vertical: exact for a prismatic
 * girder; lateral: the top flange's share), 0.95 to 1.00 of the full calculation on the simulation set (cases 005,
 * 024, 047, 053, 072, 099): a deflection estimate above 1.00 is past its limit. The top-flange strength estimate (the
 * tips ratio) was 1.63 to 2.42 times the calculation's governing top-flange ratio (combined, torsion-normal) on the
 * same heavy sections, so it decides only above girderStrengthScatter, where even the least conservative of them
 * fails; below that the calculation's girder checks decide (case 072: estimate 1.67, calculated 0.76).
 */
const beyondGirderCatalog=(t:GirderTrial)=>t.basis?.passed===false&&(Math.max(t.deflection,t.lateral)>1+1e-9||t.utilization>girderStrengthScatter);
/** The largest ratio of the screening strength estimate to the calculated top-flange ratio on the heaviest catalog girders (case 005: 1.96 / 0.81). */
const girderStrengthScatter=2.5;
/** A member beyond the catalog as a row of the selection log (S-00 and the design summary print it). */
const openItemRow=(v:NonNullable<RunwayConfig['beyondCatalog']>[number]):ConfigSelection=>({item:'Open item',entered:v.member==='girder'?'Girder':v.member==='tie'?'Top-flange tie':'Crane column',
 designed:`${v.shape}, closest; ${v.member==='girder'?'plate girder required (outside the rolled/capped catalog)':v.member==='tie'?'tie to be designed by hand':'built-up crane column required'}`.slice(0,200),reason:v.reason});
/**
 * Members the catalog cannot supply within the sizing targets (configurator.beyondCatalog; calculate reports each as an
 * open item, configuratorOpenItems, and the closest member is built and checked, a review draft): a sized girder for which no compact rolled W (and no W + channel cap pair) meets the targets,
 * and a crane column heavier than the W14X398 the column sizing goes to.
 */
function beyondCatalog(entered:RunwayConfig,cfg:RunwayConfig,trial:GirderTrial|undefined,p:ProjectInput):NonNullable<RunwayConfig['beyondCatalog']>{
 const out:NonNullable<RunwayConfig['beyondCatalog']>=[];if(cfg.scope!=='design')return out;
 if(trial&&beyondGirderCatalog(trial)&&!entered.girderShape){
  const capped=cfg.girder==='capped';
  out.push({member:'girder',shape:p.section.name,reason:`Plate girder required: no ${capped?'W and channel cap pair':'compact rolled W or W and channel cap pair'} of the catalog meets the girder sizing targets for this crane and span (the closest, ${trial.name}: ${sizingRatioNames[trial.governs]??trial.governs} ratio ${trial.utilization.toFixed(2)}, vertical deflection ${trial.deflection.toFixed(2)} and lateral ${trial.lateral.toFixed(2)} of the limits, screening estimates; targets ratio ${trial.basis?.target} and deflections ${trial.basis?.deflectionTarget}). Design a built-up plate girder with a wide top flange (or a surge plate or lateral truss), or shorten the span; the configurator does not design plate girders.`});
 }
 // The flange tie as sized and placed (paired bars, flexible plate, on a saddle or the bearing stiffener) with a sizing
 // ratio of its own still past 1.00 (the targets aside): no arrangement the configurator tried passes, so the tie is an
 // open item rather than a tie its own sizing rejects handed on as a design.
 const d=p.details;
 // (A tie at a column step is sized with the stepped-column mechanics, withSteppedTie: not judged here.)
 if(d&&(flangeTieGeometry(p)||stiffenerTieGeometry(p))&&cfg.support!=='column-cap'&&cfg.support!=='stepped-column'){
  // The tie's own ratios: the supporting column's checks at the tie (column-*) are the column sizing's.
  const over=Object.entries(tieSizingRatios(p)).filter(([k,v])=>!k.startsWith('column-')&&v>1+1e-6).sort((a,b)=>b[1]-a[1]);
  if(over.length)out.push({member:'tie',shape:d.brace.arrangement??'paired-bars',reason:`Top-flange tie not resolved: the ${tieLabels[tieArrangement(d) as keyof typeof tieLabels]??tieArrangement(d)}${stiffenerTieGeometry(p)?' on the bearing stiffener':' on a flange saddle'}, as sized for the estimated tie demands, still exceeds ${over.slice(0,3).map(([k,v])=>`${k} ${v.toFixed(2)}`).join(', ')}, and no other tie arrangement the configurator tries fits and passes here. Choose another tie or support (a capped girder with the cap tieback angle, column caps, a stiffer support), or design the tie connection by hand.`});
 }
 // The cap tieback angle as sized still past its limits (capAngleUnresolved) where no other tie was taken: no set of
 // the sizing steps carries this tie: an open item, never an issued tie its own sizing rejects (case 047).
 const cg=d?.brace.arrangement==='cap-angle'&&cfg.support!=='column-cap'&&cfg.support!=='stepped-column'?capAngleGeometry(p):undefined;
 const unresolved=cg?capAngleUnresolved(p):undefined;
 if(unresolved)out.push({member:'tie',shape:'cap-angle',reason:`Top-flange tie not resolved: the cap tieback angle, as sized for the estimated tie force ${formatUnits(capAngleForceEstimate(p),'force',p.units,3)} and movements (the largest set of its sizing steps that fits this girder end and column), ${unresolved}, and no other tie arrangement the configurator tries fits and passes here. Choose another tie or support (a column cap or crane column with the girder end fork, a heavier cap channel), or design the tie by hand.`});
 const col=p.existingColumn,w=col?.shape?aiscShapeByName(col.shape):undefined;
 if(cfg.support==='crane-column'&&!entered.columnShape&&w&&w.weight>398+1e-9)
  out.push({member:'crane-column',shape:col!.shape,reason:`Built-up crane column required: the crane column sizing needs ${col!.shape}, past the W14X398 the rolled crane columns stop at (jumbo W14 shapes are heavy-shape material, AISC 360 A3.1c). Design a built-up or laced crane column, or reduce the crane column demand.`});
 return out;
}
/**
 * The girder gusset of a stiffener tie and the tie-side bearing stiffener as one plate (stiffenerTieJoint 'integral', as
 * the tie sizing intends) where a later step thickened the bearing stiffener: the gusset takes the stiffener's
 * thickness (a thicker gusset, conservative for every tie check). A gusset thicker than the stiffener (a gusset step
 * the sizing needed) stays a CJP-welded plate, and the tie log says so: one weld specification for the log, the
 * drawings, the checks and the inspections.
 */
function alignTieGusset(p:ProjectInput,trace:SelectionTrace){
 const d=p.details;if(!d||!stiffenerTieGeometry(p))return;
 // Not where the thicker gusset would put the column gussets past the receiving column flange tip
 // (coord-tie-gusset-flange) and the sized one does not: the sized gusset stays, CJP welded to the thicker stiffener.
 const t0=d.brace.gussetThickness,fits=!stiffenerGussetMisfit(p);
 if(t0<d.bearing.stiffenerThickness-1e-6){d.brace.gussetThickness=d.bearing.stiffenerThickness;if(fits&&stiffenerGussetMisfit(p))d.brace.gussetThickness=t0;}
 const t=d.brace.gussetThickness,st=d.bearing.stiffenerThickness;
 if(trace.tie&&Math.abs(t-st)>1e-6)
  trace.tie=trace.tie.replace(/, cut as one plate with its gusset extension past the flange tip( \(no weld at the gusset\))?/,`, through a ${t>st?'thicker':'thinner'} gusset plate CJP welded to the stiffener edge (UT)`);
}
const sizingRatioNames:Record<string,string>={tips:'top-flange tip stress (DG7, warping and second-order twist)',h1:'H1 top-flange interaction with the load-height LTB strength',stability:'elastic LTB stability margin',shear:'web shear'};
/**
 * The configurator selection log kept on the project (configurator.selections): every member or part that differs
 * from the configuration as entered, or that the configurator chose where the choice was blank, with the governing
 * reason: the configuration rule (normalizeConfig, the AIST column-bracket screen), the sizing ratio and value that
 * selected the girder and the next lighter candidate's reason for rejection, or the check that moved the tie, the
 * column or the longitudinal exit.
 */
function selectionLog(entered:RunwayConfig,cfg:RunwayConfig,rules:ConfigRule[],trial:GirderTrial|undefined,p:ProjectInput,trace:SelectionTrace):ConfigSelection[]{
 const out:ConfigSelection[]=[],design=cfg.scope==='design',si=cfg.units==='SI',len=(v:number)=>si?`${Math.round(v)} mm`:`${+(v/inch).toFixed(2)} in`,auto='configurator default';
 const add=(item:string,from:string,to:string,reason:string)=>out.push({item,entered:from.slice(0,160),designed:to.slice(0,200),reason:reason.slice(0,800)});
 const why=(field:ConfigRule['field'])=>rules.filter(r=>r.field===field).map(r=>r.why).join(' ');
 const structureLabel=(v:RunwayConfig['structure'])=>v==='new'?'New freestanding columns':'Existing building columns';
 if(design&&entered.structure!==cfg.structure)add('Structure',structureLabel(entered.structure),structureLabel(cfg.structure),why('structure'));
 if(design&&entered.support!==cfg.support)add('Girder support',supportLabels[entered.support],supportLabels[cfg.support],why('support'));
 // The TR-13 bracket guideline above its reaction: an advisory row, the support kept as entered.
 else if(design&&why('support'))add('Girder support, advisory',supportLabels[entered.support],`${supportLabels[cfg.support]}, kept`,why('support'));
 if(design&&entered.system!==cfg.system)add('Girder system',`${entered.bays} × ${entered.span} ft ${entered.system}`,`${cfg.bays} × ${cfg.span} ft ${cfg.system}`,why('system'));
 if(design&&p.details){
  const cap=!!activeColumnCap(p)&&!tiedToBuilding(p),arrangement=tieArrangement(p.details);
  const now=cap?'None: end fork on the column cap (bearing stiffeners and bolted bottom flange)':`${tieLabels[arrangement as keyof typeof tieLabels]??tieOptions.find(o=>o.id===arrangement)?.name??arrangement}${stiffenerTieGeometry(p)?' on a bearing-stiffener gusset':''}`;
  const reason=[why('tie'),trace.tie,cap&&!why('tie')?'A girder on a column cap is held by its bearing stiffeners and bolted bottom flange (fork), the top-flange restraint of the analysis: no flange tie.':''].filter(Boolean).join(' ');
  if(cap||entered.tie!==arrangement||trace.tie)add('Top-flange tie',tieLabels[entered.tie],now,reason);
 }
 if(design&&entered.girder!==cfg.girder)add('Girder type',entered.girder==='capped'?'Capped (W + channel)':'Rolled W',cfg.girder==='capped'?'Capped (W + channel)':'Rolled W',why('girder'));
 const named=cfg.girder==='capped'?!!(entered.girderShape&&entered.capChannel):!!entered.girderShape;
 if(!named&&trial){
  const b=trial.basis,kind=cfg.girder==='capped'?'W and channel cap pair':'compact W';
  const ratios=`${sizingRatioNames[trial.governs]??trial.governs} ratio ${trial.utilization.toFixed(2)}, vertical deflection ${trial.deflection.toFixed(2)} and lateral ${trial.lateral.toFixed(2)} of their limits`;
  const reason=[b?.passed===false?`No ${kind} meets every sizing target; the closest: ${ratios}`:`Lightest ${kind} within the sizing targets (ratio ≤ ${b?.target??.85}, deflections ≤ ${b?.deflectionTarget??.9} of the limits): ${ratios}`,
   b?`flanges at least ${len(b.minFlange)} wide for the end bearing bolt gauge and the rail seat`:'',
   b?.lighter?`lighter candidates rejected: ${Object.entries(b.rejected).map(([k,n])=>`${n} by ${k}`).join(', ')}; the next lighter, ${b.lighter.name}: ${b.lighter.why}`:'',
   b?.alternative?`a capped girder, ${b.alternative.name} (${Math.round(b.alternative.weight)} lb/ft against ${Math.round(trial.weight)} lb/ft), meets the same targets: consider it (girder type capped)`:'',
   entered.girderShape?'a capped girder is sized as a pair unless both the W and the channel are named':''].filter(Boolean).join('; ');
  add('Girder',entered.girderShape?`${entered.girderShape} + cap channel blank`:`${auto} (sized)`,p.section.name,`${reason}. These are the configurator's screening estimates (a simplified model that ranks the catalog), not the final ratios: the calculation checks the section and reports its own ratios.${b?.passed===false?beyondGirderCatalog(trial)?' A built-up plate girder is required: the closest section is built and calculated, and the package is a review draft (open item).':' The closest section is within the limits but not the sizing margins: the calculation decides.':''}`);
 }
 if(design&&trace.pad)add('Rail pad','configurator default (pad under rails 5 in deep and deeper)',`None: rail on the girder, clips at most ${len(30*inch)} apart`,trace.pad);
 const col=p.existingColumn;
 if(design&&cfg.support==='crane-column')craneColumnLog(entered,cfg,p,trace,add,len);
 else if(design&&col?.enabled&&!entered.columnShape){
  const base=cfg.structure==='new'?`New cantilever column for a ${+cfg.capacity.toFixed(2)}-ton crane (W14X120 to 5 t, W14X159 to 12.5 t, W14X211 to 25 t, else W14X257)`
   :`Fictitious example existing column for a ${+cfg.capacity.toFixed(2)}-ton crane (W14X90 to 7.5 t, W14X120 to 15 t, W14X159 to 30 t, else W14X211); replace with the surveyed shape`;
  if(activeStep(p))add('Lower shaft (stepped column)',auto,col.shape,[trace.lower,trace.shafts,trace.stepTie].filter(Boolean).join(' '));
  else add(cfg.structure==='new'?'New column':'Existing column',auto,col.shape,[base,trace.column].filter(Boolean).join('. ')+'.');
 }
 const step=activeStep(p);
 if(design&&step&&entered.columnShape&&(trace.shafts||trace.stepTie))add('Lower shaft (stepped column)',entered.columnShape,col!.shape,[trace.shafts,trace.stepTie].filter(Boolean).join(' '));
 if(design&&step&&!entered.buildingColumnShape)add('Upper shaft (stepped column)',auto,step.upper.shape,trace.upper??'');
 if(design&&step&&trace.step)add('Step stiffener',`${auto} (none)`,`${step.stiffener?`Pair of plates ${len(step.stiffener.thickness)} × ${len(step.stiffener.width)}, ${len(step.stiffener.weld)} fillets`:'None'}${step.capWeldAdded?`; existing step fillets built up to ${len(step.capWeldAdded)}`:''}`,trace.step);
 const bracket=p.details?.bracket;
 if(design&&bracket?.enabled&&!activeColumnCap(p)&&entered.reach===undefined&&Math.abs(bracket.reach-20*inch)>1e-6)
  add('Column face to girder web',`${auto} (${len(20*inch)})`,len(bracket.reach),'Set by the tie sizing: the column face moves out from 20 in (to at most 30 in) until the tie passes its imposed-movement and strength checks.');
 if(design&&trace.splice)add('Girder field splices',`${auto} (none: one ${+(p.spans.reduce((a,b)=>a+b,0)/foot).toFixed(1)} ft piece)`,`${trace.splice.stations.length} bolted slip-critical splice${trace.splice.stations.length>1?'s':''}: ${trace.splice.where}`,`The continuous girder exceeds the ${+(practicalPieceLength/foot).toFixed(0)} ft practical shipping and erection piece: automatic placement 0.20 to 0.25 of the span from an interior support (the inflection region, nearest 0.22 L), every piece within ${+(trace.splice.splices.maxPiece/foot).toFixed(0)} ft. ${trace.splice.why}.`);
 if(design&&trace.clip)add('Rail clips',`${auto} (weld-on)`,'Bolted clamp plates',trace.clip);
 if(design&&trace.exit&&!entered.longitudinalExit)add('Longitudinal force exit',`${auto} (strut at the column centerline)`,step?.strut?'Crane-level strut on the girder line, designed here':'Crane-level strut on the girder line, by others',`${trace.exit[0].toUpperCase()}${trace.exit.slice(1)}.`);
 if(design&&step&&trace.strut)add('Crane-level strut (girder line)',`${auto} (by others)`,step.strut?`${step.strut.shape}; at each column PL ${len(step.strut.plate.thickness)} with ${2*step.strut.columnRows} - ${len(step.strut.bolts.diameter)} A325 to the flange and ${step.strut.strutBolts} at each strut end`:'By others',trace.strut);
 return out;
}

/**
 * The cap tieback angle on the receiving column as finally chosen (a new column made heavier after the tie was sized,
 * for its drift or twist, has a larger web fillet): where the column bolt nuts no longer clear the web fillet
 * (cap-angle-column-wrench), the ties move along their girders (capAngleWrenchSetback). Kept where the angle still
 * validates and its cap bolt hardware still clears the bearing stiffener at the bearing length as laid out
 * (capTieBearingLength); else the setback stays and the check reports it.
 */
function refitCapAngleSetback(p:ProjectInput,cfg:RunwayConfig,trace:SelectionTrace){
 const d=p.details,c=d?.brace.capAngle;if(!d||!c||d.brace.arrangement!=='cap-angle')return;
 const g=capAngleGeometry(p);if(!g)return;
 const s=capAngleWrenchSetback(g),before=c.setback;if(s<=before+1e-6)return;
 c.setback=s;
 if(validateCapAngle(p).length||validateRunwayDetails(p).length||(capTieBearingLength(p,d.bearing.length)??0)>d.bearing.length+1e-6){c.setback=before;return;}
 const len=(v:number)=>cfg.units==='SI'?`${Math.round(v)} mm`:`${+(v/inch).toFixed(3)} in`;
 const why=`On the ${g.column.receiver?.name??'receiving'} column as chosen, the cap tieback's column bolt nuts clear the web fillet with the ties ${len(s)} from their girder ends (was ${len(before)}).`;
 trace.tie=trace.tie?`${trace.tie} ${why}`:why;p.notes+=` ${why}`;
}
/**
 * The movements the cap tieback angle is sized for (sizeCapAngle): the girder end rotations and the tie force range of
 * the flange tie sizing (tieSizingDemands), and the support's deflection at the bearing under one crane, a designed
 * bracket's deflection limit (it is sized to it) or its service deflection where larger, else 1/16 in for a support by
 * others (as the flange tie's release travel allows).
 */
function capAngleMovementEstimate(p:ProjectInput,sized=false){
 const m=tieSizingDemands(p),service=sized?bracketServiceDeflection(p):undefined;
 return {support:service??m.support??inch/16,rotation:m.rotation,serviceRotation:m.serviceRotation,range:m.range};
}
/**
 * The cap tieback angle finished on the sized bracket: sized again for the bracket's own service deflection under one
 * crane (bracketServiceDeflection) where the first sizing took the deflection limit. The new set is kept where its
 * hardware along the runway (the angle length and setback the bearings were laid out for) is no larger.
 */
function finishCapAngle(p:ProjectInput):ProjectInput{
 const c=p.details?.brace.capAngle;if(!c||p.details!.brace.arrangement!=='cap-angle'||!p.details!.bracket?.enabled)return p;
 const next=sizeCapAngle(p,capAngleForceEstimate(p),undefined,capAngleMovementEstimate(p,true));
 if(next.length<=c.length+1e-6&&next.setback<=c.setback+1e-6){
  p.details!.brace.capAngle=next;
  // The new set is kept only where it fits as the first did (validateCapAngle).
  if(validateCapAngle(p).length)p.details!.brace.capAngle=c;
 }
 return p;
}
/** Fill a configuration's derived values for display: the crane estimate and the building class count. */
export function configSummary(cfg:RunwayConfig){
 const e=estimateCrane(cfg.capacity,cfg.craneSpan,cfg.control),s=exampleSpectrum(cfg.buildingClass);
 return {crane:e,spectrum:s,impliedClass:classFromCycles(s.total)};
}

/** New crane columns and bases: the configurator's structure for the support (newColumns routes them to the base and bracing sizing). */
const newColumns=(cfg:RunwayConfig)=>cfg.structure==='new'||cfg.support==='crane-column';
/** New crane column beside an existing building column (support 'crane-column'), for the crane; grown by withCraneColumn. */
export const craneColumnFor=(capacity:number)=>capacity<=7.5?'W12X65':capacity<=15?'W14X90':capacity<=30?'W14X109':'W14X132';
const craneColumnRule='W12X65 to 7.5 t, W14X90 to 15 t, W14X109 to 30 t, else W14X132';
/**
 * The column tie of a candidate size: a plate shop welded to the crane column, its bolt row in vertical long slots on
 * sleeves (craneColumn.ts): pitch 3d (at least the slot width plus d), edge to the plate end at least the J3.4 minimum and
 * the slot half-width plus d, the slot as wide as the sleeve plus 1/16 in and long enough for `travel` each way.
 */
function columnTieOf(thickness:number,width:number,diameter:number,count:number,travel:number,elevation:number|undefined):ColumnTieInput{
 const od=diameter+(diameter<inch-1e-6?1/16:1/8)*inch+2*.25*inch,slotWidth=od+inch/16;
 return {plate:{thickness,width,Fy:50*ksi,Fu:65*ksi},bolts:{count,diameter,grade:'A325',pitch:up(Math.max(3*diameter,slotWidth+Math.max(diameter,inch/2)),inch/4),edge:up(Math.max(minimumEdge(diameter),slotWidth/2+diameter),inch/8)},
  slot:{width:slotWidth,length:up(od+2*travel,inch/8)},...(elevation!==undefined?{elevation}:{})};
}
/** The girder tie's column face on the building column: the tie length moves with it (as attachBracket's reach). */
function setTieFace(p:ProjectInput,face:number){
 const d=p.details!,t=d.brace,f=t.flangeAttachment;
 if(f?.enabled){const from=f.columnFace??t.length;t.length+=face-from;t.reach=t.length;f.columnFace=face;}
 else{t.length=t.reach=face-up(p.section.tw/2+d.bearing.stiffenerWidth+.25*inch,.25*inch);if(f)f.columnFace=face;}
 if(t.capAngle)t.capAngle.columnFace=face;
}
/**
 * The crane-column support before the tie: a new crane column (craneColumnFor, or the configured column shape) on its
 * base plate, anchor rods and spread footing (pinned four-rod base unless configured fixed; sized by withColumnBase), its
 * top braced across the runway by the column tie and along it by new crane-level rod X-bracing between the crane columns,
 * the girder on the column cap (sized by sizeColumnCap); beside it the existing building column (the configured building
 * column shape, else existingColumnFor), with the fictitious example survey, existing effects, frame, service and site
 * seismic data of the existing-building configurations. The girder tie reaches the building column face at the
 * configured reach (girder web to the face), at least the crane column's half depth plus the column tie's clear gap.
 */
function craneColumnSupport(p:ProjectInput,cfg:RunwayConfig,seatLevel:(base:number)=>number,scopeText:string){
 const d=p.details!,shape=cfg.columnShape??craneColumnFor(cfg.capacity),w=aiscShapeByName(shape)!,demo=newColumnDemonstrationProject(),base=cfg.craneColumnBase??'pinned';
 const heavy=Math.min(1,Math.max(0,(cfg.capacity*cfg.cranes-2)/28));
 const baseInput={...structuredClone(demo.columnBase!),plate:{...demo.columnBase!.plate,...basePlatePlan(shape),thickness:up((1.25+.5*heavy)*inch,.125*inch)},
  anchors:{...demo.columnBase!.anchors,diameter:(heavy>.5?1.25:1)*inch,embedment:(15+6*heavy)*inch},
  footing:{...demo.columnBase!.footing,L:round((5+3*heavy)*foot,.5*foot),B:round((5+3*heavy)*foot,.5*foot),thickness:up((20+8*heavy)*inch,inch),bar:'#6' as const,spacing:10*inch},
  soil:{...demo.columnBase!.soil,passive:examplePassive},source:'Fictitious example geotechnical report: 3,000 psf allowable (net), base friction 0.35, lateral bearing 150 psf/ft (IBC Table 1806.2), 120 pcf; interior heated building, frost not applicable. Concrete 4,000 psi; ASTM A615 Grade 60 bars; ASTM F1554 Grade 36 rods'};
 p.columnBase=baseInput;
 const seat=seatLevel(columnBaseElevation(baseInput)),c=demo.existingColumn!;
 // The building column (existing): the example survey and existing effects of the existing-building configurations.
 const bshape=cfg.buildingColumnShape??existingColumnFor(cfg.capacity),bw=aiscShapeByName(bshape)!,e=cappedDemonstrationProject().existingColumn!,k=cfg.span/25;
 const scale=(v:{P:number;Mx:number;My:number;V:number})=>({P:v.P*k,Mx:v.Mx*k,My:v.My,V:v.V*k});
 const {longitudinalExit:_x,...existing}=e;
 const building={...existing,isNew:false,shape:bshape,d:bw.d*inch,bf:bw.bf*inch,tf:bw.tf*inch,tw:bw.tw*inch,Fy:50*ksi,Fu:65*ksi,height:seat+8*foot,seatElevation:seat,Lcx:seat+8*foot,Lcy:8*foot,Lcz:8*foot,Lb:8*foot,
  existing:Object.fromEntries(Object.entries(e.existing).map(([key,v])=>[key,scale(v)])) as typeof e.existing,
  welding:{...e.welding!,grade:'ASTM A992',source:'Fictitious example: mill certificates with the original building records'},
  source:`Fictitious example: survey of the existing ${bshape} building columns and the original building calculations, column line B`,
  service:{...e.service!,source:'Fictitious example: building frame report, 10-year wind and dead/snow runs at the crane girder'},
  frame:{type:'braced' as const,source:'Fictitious example: column line B braced by the roof diaphragm and the sidewall rod bracing'},
  siteSeismic:{...e.siteSeismic!,source:'Fictitious example: site data from the original building report (Site Class D, SDS 0.25, SDC B; steel system not specifically detailed for seismic, R = 3)',
   alteration:{dcrIncrease:.06,source:'Fictitious example: evaluation of the existing bracing and frames with the runway and crane mass added (largest D/C increase 6%)'}}};
 // The crane column: braced at the top across the runway (column tie) and along it (bracing), K = 1 over its height.
 const footing={L:5*foot,B:5*foot},line={offset:0,spacing:0,start:0,shape:bshape,d:bw.d*inch,bf:bw.bf*inch,footing};
 p.existingColumn={...c,shape,d:w.d*inch,bf:w.bf*inch,tf:w.tf*inch,tw:w.tw*inch,height:seat,seatElevation:seat,strong:{base,top:'braced'},weak:{base,top:'braced'},Lcx:seat,Lcy:seat,Lcz:seat,Lb:seat,
  seismic:{...c.seismic!,source:'Fictitious example site data: SDS 0.20, SD1 0.08, Site Class D, Risk Category II, SDC B',building:{drift:1.5*inch,source:'Fictitious example building report: maximum inelastic displacement 1.5 in at the runway level'}},
  adjacent:{enabled:true,A:{...line,footing:{...footing}},B:{...line,footing:{...footing}},footingClear:6*inch,source:`Fictitious example survey: existing ${bshape} building columns at every grid beside the crane columns, ${+(footing.L/foot).toFixed(1)} ft square footings by test pits`}};
 p.drawing!.existingEvaluation='Fictitious existing structure evaluation: column line B frame, bracing, connections and foundations for the tie forces and the runway seismic mass';
 const middle=Math.ceil(cfg.bays/2);
 p.longitudinalBracing={...demo.longitudinalBracing!,bayWidth:cfg.span*foot,height:seat,rod:{...demo.longitudinalBracing!.rod,diameter:inch},bays:1,
  source:`Fictitious example: new crane-level rod X-bracing between the new crane columns at grid lines ${middle}-${middle+1}; the building's own bracing takes no crane longitudinal force`,confirmed:true,
  design:{...structuredClone(demo.longitudinalBracing!.design!),spans:[middle]}};
 const bd=p.longitudinalBracing.design!;bd.pin={...bd.pin,diameter:Math.max(bd.pin.diameter,p.longitudinalBracing.rod.diameter)};
 // The girder on the column cap with bolted end bearings; the top-flange tie to the building column face.
 d.bracket={...structuredClone(demo.details!.bracket!),enabled:false};p.aist!.supportType='column';
 if(d.endBearing)d.endBearing.enabled=true;
 const tie=columnTieOf(.5*inch,8*inch,.75*inch,2,.375*inch,undefined),gap=columnTieGeometryOf(tie),minimum=up(w.d*inch/2+gap,inch/2);
 // The configured reach, else 20 in as for the brackets (the tie sizing moves it out to at most 30 in), never inside the column tie's gap.
 const reach=Math.max(cfg.reach!==undefined?cfg.reach*inch:20*inch,minimum);
 p.craneColumn={enabled:true,offset:reach+bw.d*inch/2,building,columnTie:tie,base,source:`Fictitious example: new ${shape} crane columns beside the existing ${bshape} building columns, the column tie at the cap`};
 setTieFace(p,reach);
 p.columnCap={...structuredClone(defaultColumnCap),enabled:true};
 setBearings(p);
 const capWidth=Math.max(w.bf*inch+1.5*inch,w.d*inch+2*(p.columnCap.weld+inch/8),d.bearing.width);
 p.columnCap.plate={...p.columnCap.plate,width:Math.max(p.columnCap.plate.width,up(capWidth,.5*inch))};
 const clear=(w.d-2*w.tf)*inch;d.bearing.stiffenerWidth=Math.min(d.bearing.stiffenerWidth,Math.floor((clear-p.section.tw)/2/(inch/8)+1e-9)*inch/8);
 sizeCraneColumnCap(p);
 p.notes=`Example configuration generated by the CraneCalc configurator; fictitious crane, supplier, survey, site and owner data, to be replaced with project data. Scope: ${scopeText}, on column caps over new ${shape} crane columns beside the existing ${bshape} building columns (${base} bases, anchor rods and spread footings, crane-level rod X-bracing between the crane columns), with the rail, the top-flange ties and the column ties to the building columns, bearings and end stops; the building columns are checked for the tie forces with their existing load effects and carry no runway vertical load.`;
}
/** Least clear gap between the column flanges for a column tie (columnTieGeometry, without a project). */
function columnTieGeometryOf(t:ColumnTieInput){return Math.max(2*inch,(t.bolts.count-1)*t.bolts.pitch+2*t.bolts.edge+2*.5*inch);}
/** The column cap sized for the reactions on the crane column, and the bearings it takes (sizeColumnCap). */
function sizeCraneColumnCap(p:ProjectInput){
 const d=p.details!,sized=sizeColumnCap(p);p.columnCap=sized.columnCap;d.endBearing=sized.details!.endBearing;d.bearing=sized.details!.bearing;if(p.aist&&sized.aist)p.aist.bearingLength=sized.aist.bearingLength;
 p.longitudinalBracing!.height=p.existingColumn!.seatElevation-capWorkPointDrop(p);
}
/**
 * The crane-column support after the tie: the building column where the sized tie ends (the offset follows the tie's
 * column face), the cap sized again for the bearings as laid out with the tie, the column tie sized for its estimated
 * force (sizeColumnTie; the face moves out where its lap needs a wider gap), the building column's girder-tie elevation,
 * the surveyed footings beside the crane columns and the preheat of the field welds to the building column.
 */
function finishCraneColumn(p:ProjectInput,trace:SelectionTrace){
 const k=p.craneColumn;if(!k?.enabled)return;
 const bc=columnPlates(k.building),cc=columnPlates(p.existingColumn!),face=girderTieFace(p);
 if(face!==undefined)k.offset=face+bc.d/2;
 sizeCraneColumnCap(p);
 const why=sizeColumnTie(p);trace.columnTie=why;
 const need=cc.d/2+columnTieGeometry(p).minimumGap;
 if(craneColumnLayout(p)!.girderTie.face<need-1e-6){const f=up(need,inch/2);setTieFace(p,f);k.offset=f+bc.d/2;trace.craneFace=`The column tie's bolt lap needs ${+(columnTieGeometry(p).minimumGap/inch).toFixed(2)} in clear between the column flanges: the building column face is ${+(f/inch).toFixed(2)} in from the girder web.`;}
 const g=craneColumnLayout(p)!;k.building.seatElevation=g.girderTie.elevation;
 const adj=p.existingColumn!.adjacent;if(adj){adj.A=adj.A&&{...adj.A,offset:k.offset};adj.B=adj.B&&{...adj.B,offset:k.offset};}
 const q=buildingColumnProject(p);if(k.building.welding)k.building.welding={...k.building.welding,preheat:existingWeldingDemand(q,existingColumnSection(q).section.tf).need};
}
/**
 * The column tie sized for its estimated force: the girder tie force estimate (tieSizingDemands, an upper bound of the
 * bottom-flange force the cap delivers) plus the crane column's eccentric top reaction and its Appendix 6 brace force
 * 0.01P_r, against the tie's strengths and fit limits (columnTieCapacities) at the 0.9 sizing target, and its fatigue
 * (the girder tie force range estimate, all cycles); the slots travel each way the larger column shortening plus 1/4 in.
 * The lightest plate (1/2 to 1 in by 8 to 12 in) with two or three 3/4 to 1 in A325 bolts that passes. Returns the reason.
 */
function sizeColumnTie(p:ProjectInput):string{
 const k=p.craneColumn!,c=p.existingColumn!,reactions=supportReactions(p,sectionProperties(p.section)),a=existingColumnAnalysis(p,reactions),Pr=Math.max(0,a.governing.P.P);
 const cs=existingColumnSection(p).section,unit=1/Math.max(c.height,1),eccentric=Pr*a.eccentricity*(k.base==='fixed'?1.5:1)*unit,demand=tieSizingDemands(p),F=demand.force+eccentric+.01*Pr,range=demand.range;
 const cap=activeColumnCap(p),elevation=c.height-(cap?.plate.thickness??0)-inch/2;
 const short=columnShortening(p,reactions),travel=Math.max(short.crane,short.building)+short.tolerance;
 const cycles=p.details!.spectrum.reduce((n,v)=>n+v.cycles,0)||p.fatigue.cycles;
 let pick:ColumnTieInput|undefined;
 search:for(const t of [.5,.625,.75,1].map(v=>v*inch))for(const h of [8,10,12].map(v=>v*inch))for(const db of [.75,.875,1].map(v=>v*inch))for(const n of [2,3]){
  const tie=columnTieOf(t,h,db,n,travel,elevation-h/2);k.columnTie=tie;
  const g=columnTieGeometry(p),s=columnTieCapacities(p),ok=g.netWidth>0&&F<=.9*s.strength&&s.edge.ratio<=1&&s.spacing<=tie.bolts.pitch+1e-6
   &&range/(t*h)<=transverseFilletFatigue(t,g.weld,cycles).capacity&&range/Math.max(s.An,1e-9)<=Math.max(fatigueThreshold('E'),finiteLife(1.1,cycles))&&cs.tf>0;
  pick??=tie;if(ok){pick=tie;break search;}
 }
 k.columnTie=pick!;
 // In the project's units (an SI package reads SI).
 const t=k.columnTie,f=(v:number)=>formatUnits(v,'force',p.units,3),L=(v:number)=>formatUnits(v,'length',p.units,3);
 return `Column tie ${L(t.plate.thickness)} × ${L(t.plate.width)} with ${t.bolts.count} ${L(t.bolts.diameter)} A325 bolts on sleeves in ${L(t.slot.width)} × ${L(t.slot.length)} vertical slots: the lightest within the 0.9 sizing target for the estimated column-tie force ${f(F)} (the girder bottom-flange force through the cap, bounded by the girder tie force estimate ${f(demand.force)}; the crane column's eccentric top reaction ${f(eccentric)}; the brace force 0.01P_r ${f(.01*Pr)}; the calculation takes the bottom-flange force from the girder model) and its fatigue range ${f(range)} at all cycles; slot travel ${L(travel)} each way (the larger column shortening plus the erection tolerance).`;
}
/**
 * A crane column whose member (H1) or cap ratios exceed 1, or whose cap does not fit (validateColumnCap), on the chosen
 * shape: the project is built on the lightest heavier W14 that passes, unless a heavier W14 barely lowers the governing
 * ratio (the cap's fork-free bolts and welds then need another arrangement); otherwise it stays and the checks report it.
 */
function withCraneColumn(q:ProjectInput,cfg:RunwayConfig,trace:SelectionTrace):ProjectInput{
 if(cfg.support!=='crane-column'||cfg.columnShape||!tiedToBuilding(q))return q;
 const worst=(r:ProjectInput)=>{
  const a=existingColumnAnalysis(r,supportReactions(r,sectionProperties(r.section))),member=Math.max(0,...existingColumnChecks(r,a).filter(v=>/^column-(axial|flexure|flexure-y|shear|interaction)$/.test(v.id)).map(v=>v.utilization??0));
  const misfit=validateColumnCap(r).length>0,cap=misfit?Infinity:Math.max(0,...Object.values(columnCapSizingRatios(r)));
  // The bracing gussets and strut tabs load the crane-column web out of its plane (bracingSystemChecks): the bracing
  // sizing stiffens the web there first (sizeBracing), so the web ratio is left only where its stiffeners cannot carry it.
  const b=bracingRatios(r),web=Math.max(0,b['brace-column-web']??0,b['brace-strut-tab']??0);
  return {value:Math.max(member,cap,web),member:Math.max(member,web),column:member,web,cap,misfit};};
 let last=worst(q);
 // The reason names the member ratio (H1 and its parts) and the connection ratios (the bracing web, the cap) apart.
 const ratios=(v:typeof last)=>`member (H1) ratio ${v.column.toFixed(2)}, bracing connection (column web at the gussets and strut tabs, stiffened) ratio ${v.web.toFixed(2)}, column cap ratio ${Number.isFinite(v.cap)?v.cap.toFixed(2):'-'}`;
 if(last.value<=1){trace.column=[trace.column,`The ${q.existingColumn!.shape} crane column gives ${ratios(last)}`].filter(Boolean).join('; ');return q;}
 const why=`the ${q.existingColumn!.shape} crane column ${last.misfit?'does not fit its column cap (validateColumnCap)':`gives ${ratios(last)}: the ${last.column>1?'member':last.web>1?'bracing connection':'column cap'} exceeds 1.00 and no local fix brings it there`}; the lightest heavier W14 that passes`;
 // The lightest heavier W14 that passes; else the lightest whose member and bracing web pass, its cap ratios reported
 // (the cap's fatigue and fillets barely change with the column once the member passes).
 let best:{r:ProjectInput;inner:SelectionTrace;shape:string}|undefined;
 // The cap stiffeners under the girder bearing stiffeners (at each bearing center) land on the column flanges with
 // their fillets (validateColumnCap): where the bearings as laid out need a wider flange than this column's, the
 // candidates are the W14s at least that wide, the jumbo shapes included (heavierColumns stops at W14X398).
 const cap=activeColumnCap(q),w0=aiscShapeByName(q.existingColumn!.shape)!;
 const flange=cap?Math.max(0,...columnCapGeometry(q).grids.flatMap(v=>v.stiffeners.map(x=>2*(Math.abs(x)+cap.stiffener.thickness/2+cap.stiffener.weld)))):0;
 const shapes=flange>w0.bf*inch+1e-6?aiscWShapes.filter(s=>s.name.startsWith('W14X')&&s.weight>w0.weight&&s.bf*inch>=flange-1e-6).sort((a,b)=>a.weight-b.weight).map(s=>s.name).slice(0,8):heavierColumns(q.existingColumn!.shape);
 for(const shape of shapes){
  const inner:SelectionTrace={},r=buildProject({...cfg,columnShape:shape},inner),now=worst(r);
  if(now.value<=1){Object.assign(trace,inner,{column:[trace.column,why[0].toUpperCase()+why.slice(1)].filter(Boolean).join('; ')});return {...r,configurator:{...cfg}};}
  if(now.member<=1&&!now.misfit&&!best)best={r,inner,shape};
  if(best&&Number.isFinite(last.cap)&&now.cap>.97*last.cap)break;
  if(!best&&Number.isFinite(last.value)&&now.value>.99*last.value)break;
  last=now;
 }
 if(best){Object.assign(trace,best.inner,{column:[trace.column,`The ${q.existingColumn!.shape} crane column gives a member (H1 or bracing web) or cap ratio above 1.00: the lightest heavier W14 whose member and bracing web pass, ${best.shape}; its column cap ratios above 1.00 do not improve with a heavier column and are reported`].filter(Boolean).join('; ')});return {...best.r,configurator:{...cfg}};}
 return q;
}
/** Selection log entries of the crane-column support: the crane column, the building column, the column tie and the column face. */
function craneColumnLog(entered:RunwayConfig,cfg:RunwayConfig,p:ProjectInput,trace:SelectionTrace,add:(item:string,from:string,to:string,reason:string)=>void,len:(v:number)=>string){
 const col=p.existingColumn,k=p.craneColumn,auto='configurator default';if(!col?.enabled||!k?.enabled)return;
 if(!entered.columnShape)add('Crane column',auto,col.shape,[`New crane column for a ${+cfg.capacity.toFixed(2)}-ton crane (${craneColumnRule}), ${k.base} base, braced at the cap across the runway by the column tie and along it by the crane-level bracing`,trace.column].filter(Boolean).join('. ')+'.');
 if(!entered.buildingColumnShape)add('Building column',auto,k.building.shape,`Fictitious example existing building column for a ${+cfg.capacity.toFixed(2)}-ton crane (W14X90 to 7.5 t, W14X120 to 15 t, W14X159 to 30 t, else W14X211), checked for the tie forces with its existing load effects; replace with the surveyed shape.`);
 {const b=p.columnBase,ft=len;if(b?.enabled)add('Crane-column footing',auto,`${b.combined?'combined with the building column, ':''}${ft(b.footing.L)} square${b.braced?`; ${ft(b.braced.footing.L)} at the braced columns`:''}`,
  [trace.footing??`Isolated footings clear of the building-column footing`,`sized for the base reactions; the braced columns' footing apart from the others' (the rods' uplift and shear along the runway), sliding resisted by the base friction and the soil's lateral bearing on the footing and its shear key (IBC §1806.3.1)`].join('; ')+'.');}
 if(trace.columnTie)add('Column tie',auto,`${len(k.columnTie.plate.thickness)} × ${len(k.columnTie.plate.width)} plate, ${k.columnTie.bolts.count} bolts ${len(k.columnTie.bolts.diameter)}`,trace.columnTie);
 const g=craneColumnLayout(p);
 if(g&&entered.reach===undefined)add('Column face to girder web',auto,len(g.girderTie.face),[`The building column face from the girder web (the crane-column centerline): at least the crane column's half depth plus the column tie's clear gap, moved out by the tie sizing (to at most 30 in) where the tie needs the flexible length; the crane column stands ${len(g.gap)} clear of the building column`,trace.craneFace].filter(Boolean).join('. ')+'.');
}

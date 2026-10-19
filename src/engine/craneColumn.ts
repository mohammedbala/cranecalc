import {aiscShapeByName} from '../data/aiscSections';
import {tiedToBuilding,type CraneColumnInput} from './craneColumnInputs';
import type {ExistingColumnInput} from './existingColumnInputs';
import type {CalculationSnapshot,CheckResult,ProjectInput} from './types';
import {existingColumnAnalysis,existingColumnChecks,existingColumnSection,validateExistingColumn,type ExistingColumnCombination,type ExistingColumnResult} from './existingColumn';
import type {SupportReactionSet} from './supportReactions';
import {columnResponse} from './columnAnalysis';
import {sectionProperties} from './section';
import {boltCapacity,boltProperties,compressionResistance,minimumFillet,transverseFilletFatigue} from './connectionStrength';
import {available} from './aiscStrength';
import {minimumEdge,capAngleGeometry} from './capAngle';
import {flangeTieGeometry,stiffenerTieGeometry} from './tieGeometry';
import {braceImperfection} from './forcesDelivered';
import {secantStiffness} from './restraintClearance';
import {finiteLife,fatigueThreshold} from './fatigueConstants';
import {format} from './units';
import {latexNumber,withinLimit} from './math';
import {columnBaseActions} from './columnBase';

/**
 * Separate crane column tied to an existing building column (configurator support 'crane-column'; AISC Design Guide 7,
 * the separate crane column of the crane-building columns, clause to be confirmed: reference 'dg7-columns'; AIST TR-13
 * §5.9.2 direct column bearing). See craneColumnInputs.ts for the model. Canonical units N, mm, MPa.
 *
 * - The crane column is `p.existingColumn` (new, its girder on the column cap): it carries the girder vertical reactions
 *   and the rail eccentricity only, pinned (or fixed) at its base and braced at its top across the runway by the column
 *   tie, along it by the crane-level bracing. It is checked by the new-column path (existingColumnAnalysis without the
 *   side thrust, its base, cap and bracing), with the group 'Crane column'.
 * - The girder top-flange tie (paired bars, flexible plate or cap tieback angle) reaches the building column face; the
 *   girder bottom flange is held by the end-bearing bolts to the cap, the crane-column top and the column tie.
 * - The building column (`craneColumn.building`, existing) takes lateral load only from the runway: the side thrust at the
 *   rail head (its resultant through the two ties), the Appendix 6 brace forces the ties deliver and the runway's seismic
 *   force across the runway, with its own existing effects (buildingColumnProject: checks building-column-*).
 * - The column tie at the cap: one plate shop welded to the crane-column flange, lapping a tab on the building column (by
 *   others) with pretensioned bolts on steel sleeves through vertical long slots in the plate, so the two columns
 *   shorten independently (the established released-tie detail of this package, boltingBasis.ts).
 */
const inch=25.4;
/** Least clear distance between the facing flanges of the crane column and the building column (plan §2 validation). */
export const craneColumnGap=2*inch;
/** Default erection and fit-up allowance in the slot travel check. */
export const defaultSlotTolerance=.25*inch;
/** Wall of the steel sleeves the column-tie bolts are pretensioned against (as the cap tieback's sleeved bolts). */
export const columnTieSleeveWall=.25*inch;
/** Clear distance from the column-tie plate end to the building column face, and from the tab end to the crane column. */
export const columnTieEndClearance=.5*inch;

/** Plates of a column: the catalog shape where it is one, else the entered plates (no fillet credit). */
export function columnPlates(c:Pick<ExistingColumnInput,'shape'|'d'|'bf'|'tf'|'tw'>){
 const w=c.shape?aiscShapeByName(c.shape):undefined;
 return w?{shape:c.shape,d:w.d*inch,bf:w.bf*inch,tf:w.tf*inch,tw:w.tw*inch}:{shape:c.shape||'plates',d:c.d,bf:c.bf,tf:c.tf,tw:c.tw};
}

/**
 * Geometry of the crane column, the building column and the ties, for the drawings (WP-3) and the engine (WP-1).
 * Across the runway x is measured from the crane-column centerline, positive away from the crane span (toward the
 * building column); elevations from the crane-column base, the building column's base taken at the same level.
 */
export interface CraneColumnLayout {
 craneColumn:{shape:string;d:number;bf:number;tf:number;tw:number;x:number;base:number;top:number};
 buildingColumn:{shape:string;d:number;bf:number;tf:number;tw:number;x:number;base:number;top:number};
 /** Clear distance between the facing flanges (at least craneColumnGap and the column-tie lap, columnTieGeometry). */
 gap:number;
 /** Girder web centerline (the girder bears centered on the crane-column cap). */
 girderWeb:number;
 /** Girder top-flange tie: the girder web to the building-column inner face, and its elevation (the girder top flange). */
 girderTie:{face:number;elevation:number};
 /** Column tie at cap level: elevation, clear length between the flanges, plate, vertical slot and bolts at the building column. */
 columnTie:{elevation:number;length:number;plate:CraneColumnInput['columnTie']['plate'];slot:CraneColumnInput['columnTie']['slot'];bolts:CraneColumnInput['columnTie']['bolts']};
}
export function craneColumnLayout(p:ProjectInput):CraneColumnLayout|undefined{
 const k=p.craneColumn,c=p.existingColumn;if(!k?.enabled||!c?.enabled)return undefined;
 const cc=columnPlates(c),bc=columnPlates(k.building),bearing=p.details?.bearing.thickness??0;
 const top=c.height,girderTop=c.seatElevation+bearing+p.section.d+(p.section.kind==='cap'?p.section.capTw:0);
 return {craneColumn:{...cc,x:0,base:0,top},buildingColumn:{...bc,x:k.offset,base:0,top:k.building.height},
  gap:k.offset-bc.d/2-cc.d/2,girderWeb:0,girderTie:{face:k.offset-bc.d/2,elevation:girderTop-p.section.tf/2},
  columnTie:{elevation:k.columnTie.elevation??top,length:k.offset-bc.d/2-cc.d/2,plate:k.columnTie.plate,slot:k.columnTie.slot,bolts:k.columnTie.bolts}};
}

/**
 * The column tie's parts: the bolt hole and the sleeve through each vertical slot (outside diameter, play across the
 * slot in the force direction, vertical travel each way from the centered sleeve), the bolt row's lap along the tie (its
 * pitches and the two edge distances), the least clear gap between the flanges that holds the lap with the plate and
 * tab end clearances, and the shop fillet (both faces of the plate, its full depth) to the crane-column flange: the
 * AISC J2.4 minimum for the thinner part, at least 1/4 in.
 */
export function columnTieGeometry(p:ProjectInput){
 const k=p.craneColumn!,t=k.columnTie,b=boltProperties(t.bolts.grade,t.bolts.diameter),od=b.hole+2*columnTieSleeveWall,cc=columnPlates(p.existingColumn!);
 const lap=(t.bolts.count-1)*t.bolts.pitch+2*t.bolts.edge;
 return {hole:b.hole,od,play:Math.max(0,t.slot.width-od),travel:(t.slot.length-od)/2,lap,minimumGap:Math.max(craneColumnGap,lap+2*columnTieEndClearance),
  weld:Math.max(inch/4,minimumFillet(Math.min(t.plate.thickness,cc.tf))),
  /** Net width of the plate on a vertical section through a slot (the slot length plus 1/16 in, AISC B4.3b). */
  netWidth:t.plate.width-(t.slot.length+inch/16)};
}

/**
 * The building column projected into the existing-column model: an existing column (bracket, cap and base off) at the
 * crane column's girder seat (one datum, the crane-column base), without `craneColumn` so it keeps the side thrust; its
 * crane longitudinal force goes to the crane columns' bracing, not to it (longitudinal 'column' with no force, tieReactions).
 */
export function buildingColumnProject(p:ProjectInput):ProjectInput{
 const k=p.craneColumn!,c=p.existingColumn!,{craneColumn:_k,columnCap:_c,columnBase:_b,...rest}=p;
 const details=p.details&&{...p.details,bracket:p.details.bracket&&{...p.details.bracket,enabled:false}};
 const {step:_s,seismic:_z,adjacent:_a,...building}=k.building;
 return {...rest,details,drawing:p.drawing&&{...p.drawing,railElevation:undefined},
  existingColumn:{...building,enabled:true,isNew:false,seatElevation:c.seatElevation,eccentricity:Math.max(k.offset,1),longitudinal:'column'}};
}
/** The reactions the building column takes from the runway: the side thrust only (the crane column carries the rest). */
export function tieReactions(r:SupportReactionSet):SupportReactionSet{
 return {Cls:0,supports:r.supports.map(s=>({...s,D:0,Ds:0,L:0,Cd:0,Cv:0,Ci:0,Clv:0,craneMinimum:0}))};
}

const series=(...k:number[])=>1/k.reduce((a,v)=>a+1/v,0);
/** Strong-axis lateral stiffness of the building column at elevation z under a unit force (its own end conditions), N/mm. */
export function buildingColumnStiffness(p:ProjectInput,z:number){
 const q=buildingColumnProject(p),b=q.existingColumn!,{section}=existingColumnSection(q),props=sectionProperties(section),x=Math.min(Math.max(z,0),b.height);
 const r=columnResponse(b.height,section.E*props.Ix,b.strong,[{x,force:1}]);return 1/Math.max(Math.abs(r.displacement(x)),1e-12);
}
/** Axial stiffness of the column tie: the plate over the clear gap in series with the bolt shear deformation (grip of the plate and tab). */
export function columnTieStiffness(p:ProjectInput){
 const t=p.craneColumn!.columnTie,g=craneColumnLayout(p)!,E=p.section.E,G=E/2.6,b=boltProperties(t.bolts.grade,t.bolts.diameter);
 return series(E*t.plate.thickness*t.plate.width/Math.max(g.gap,1),t.bolts.count*G*b.area/(2*t.plate.thickness));
}
/**
 * Girder restraints at a crane-column support (the lateral-torsional model, detailAnalysis.ts): the top flange through
 * the girder tie (`tieK`) in series with the building column at the tie; the bottom flange through the end-bearing bolts
 * (`boltK`) in series with the crane-column top, the column tie in series with the building column at the column tie (in
 * parallel with a fixed-base crane column's own sway stiffness 3EI/H³). Each building column stiffness is its own
 * diagonal flexibility under a unit force at that elevation (the coupling of the two tie forces is not modeled).
 */
export function craneColumnRestraint(p:ProjectInput,tieK:number,boltK:number){
 const g=craneColumnLayout(p)!,c=p.existingColumn!,building={tie:buildingColumnStiffness(p,g.girderTie.elevation),columnTie:buildingColumnStiffness(p,g.columnTie.elevation)};
 const {section}=existingColumnSection(p),own=p.craneColumn!.base==='fixed'?3*section.E*sectionProperties(section).Ix/c.height**3:0;
 const columnTie=columnTieStiffness(p),columnTop=series(columnTie,building.columnTie)+own;
 return {top:series(tieK,building.tie),bottom:boltK>0?series(boltK,columnTop):columnTop,building,columnTie,columnTop};
}

/** Where the girder top-flange tie meets its column face, from the girder web: the flange or stiffener tie, or the cap tieback angle. */
export function girderTieFace(p:ProjectInput){
 let cap:ReturnType<typeof capAngleGeometry>;try{cap=capAngleGeometry(p);}catch{cap=undefined;}
 return cap?cap.face:(flangeTieGeometry(p)??stiffenerTieGeometry(p))?.face;
}

export function validateCraneColumn(p:ProjectInput):string[]{
 const k=p.craneColumn;if(!k?.enabled)return [];
 const errors:string[]=[],add=(test:boolean,m:string)=>{if(test)errors.push(`craneColumn.${m}`);},c=p.existingColumn,L=(v:number)=>format(v,'length',p.units,3);
 add(p.scope!=='design','enabled: crane columns apply to design reports.');
 add(!c?.enabled||!c.isNew,'enabled: the crane column is the new column designed here: enable the column check with a new column (existingColumn.isNew).');
 add(!p.columnCap?.enabled,'enabled: the girder bears on the crane-column cap: enable the column cap.');
 add(!!p.details?.bracket?.enabled,'enabled: a crane column carries the girder on its cap, not on a bracket: disable the bracket.');
 add(!!c?.step,'enabled: a crane column and a stepped column are alternative supports; remove one.');
 add(!!k.building.isNew,'building.isNew: the building column is an existing column.');
 add(!!k.building.step,'building.step: a stepped building column with a separate crane column is not modeled.');
 add(k.building.Fu<k.building.Fy,'building.Fu: ultimate strength cannot be less than yield strength.');
 add(!!k.building.shape&&!aiscShapeByName(k.building.shape),'building.shape: select an AISC W shape or clear it to use entered plates.');
 let bolt=true;try{boltProperties(k.columnTie.bolts.grade,k.columnTie.bolts.diameter);}catch{bolt=false;}
 add(!bolt,'columnTie.bolts.diameter: use an ASTM F3125 A325/A490 bolt with a supported nominal diameter from 1/2 to 1-1/2 in.');
 const g=craneColumnLayout(p);if(!c||!g)return errors;
 add(c.strong.top!=='braced','enabled: the column tie braces the crane-column top across the runway: set the strong-axis top to braced.');
 add(c.strong.base!==k.base,`base: the crane-column base (${k.base}) must agree with the column's strong-axis base (${c.strong.base}).`);
 add(g.gap+1e-6<craneColumnGap,`offset: the clear distance between the crane-column and building-column flanges is ${L(g.gap)}; at least ${L(craneColumnGap)} is needed for erection and the column tie.`);
 const flange=(p.section.kind==='cap'?p.section.capWidth:p.section.bf)/2;
 add(g.girderTie.face-flange<=0,`offset: the girder top flange${p.section.kind==='cap'?' and cap':''} must clear the building-column face (girder web to face ${L(g.girderTie.face)}).`);
 add(k.building.height<=g.girderTie.elevation,`building.height: the building column must reach the girder top-flange tie, ${L(g.girderTie.elevation)} above the base.`);
 add(g.columnTie.elevation>c.height+1e-6,'columnTie.elevation: the column tie must be on the crane column, at or below its top.');
 add(k.building.height<=g.columnTie.elevation,'building.height: the building column must reach the column tie.');
 add(k.columnTie.slot.length<=k.columnTie.bolts.diameter,'columnTie.slot.length: the vertical slot must be longer than the bolt diameter.');
 add(k.columnTie.slot.width<k.columnTie.bolts.diameter,'columnTie.slot.width: the slot must be at least the bolt diameter wide.');
 if(bolt){const t=columnTieGeometry(p);
  add(t.netWidth<=0,`columnTie.plate.width: the plate (${L(k.columnTie.plate.width)} deep) must be deeper than its vertical slots (${L(k.columnTie.slot.length)}) with material above and below them.`);}
 // The girder tie as laid out must end at the building column face the offset puts it at.
 const face=girderTieFace(p);
 if(p.details&&face!==undefined)add(Math.abs(face-g.girderTie.face)>inch/16,`offset: the girder top-flange tie ends at a column face ${L(face)} from the girder web, but the building column face is ${L(g.girderTie.face)} from it (offset less half the building column depth): set the tie's column face to the building column or correct the offset.`);
 // The building column itself, as an existing column (its plates, end conditions and effective lengths).
 for(const e of validateExistingColumn(buildingColumnProject(p)))errors.push(e.replace(/^existingColumn\./,'craneColumn.building.'));
 return errors;
}

/**
 * Results of the crane-column arrangement (the report and drawings read these). The crane column's own member result
 * stays `snapshot.existingColumn` (checks `column-*`, group 'Crane column'); the building column's is
 * `snapshot.buildingColumn` (checks `building-column-*`, group 'Building column').
 */
export interface CraneColumnResult {
 layout:CraneColumnLayout;
 /**
  * Forces delivered to the building column by the ties (factored, the governing sets): the girder tie design force
  * (the top-flange restraint force with the girder's Appendix 6 brace force) and the column-tie design force (the
  * bottom-flange restraint force, the crane column's eccentric top reaction and its Appendix 6 brace force).
  */
 ties:{girderTie:number;columnTie:number;case:string;bottom:number;eccentric:number;braceForce:number;range:number};
 /**
  * AISC 360-16 Appendix 6 §6.2.2 nodal brace at the crane-column top: required strength 0.01Pr and stiffness
  * (1/φ)(10Pr/L_br) (Ω = 2 ASD; the coefficient as the reference entry states it, conservative), against the building
  * column at the tie in series with the column tie, at its secant stiffness with the sleeve play taken up at P_br.
  */
 brace:{Pr:number;L:number;strength:{required:number;provided:number};stiffness:{required:number;building:number;tie:number;provided:number;play:number};case:ExistingColumnCombination['id']};
 /** Vertical slot travel at the column tie, each way from the centered sleeve: crane-column and building-column shortening (PL/EA) and the tolerance, the larger shortening plus the tolerance against the travel. */
 slot:{crane:number;building:number;tolerance:number;demand:number;capacity:number};
 /** Clear distance across the runway between the crane-column footing and the building column footing (undefined where its size is not entered). */
 footing?:{clear:number;required:number;crane:{L:number;B:number};building:{L:number;B:number};
  /** Where the footings overlap (an open coordination item): the crane-column base reactions for the combined or enlarged footing. */
  reactions?:FootingReactions};
}

/**
 * Available strengths of the column tie (one plate, the bolt row in single shear on sleeves through vertical long slots,
 * the shop fillets to the crane column) and its fit limits: tension (D2, net section through a slot), compression over
 * the clear gap (E3, K = 1.2), bolt shear (J3.6, threads included), bearing and tearout at long slots perpendicular to the
 * force (J3.10(b): 2.0dtF_u, 1.0l_ctF_u), the fillets (J2.4, no directional increase), the edge distances (J3.4, J3.5) and
 * the slot spacing (J3.3); `strength` the least force capacity.
 */
export function columnTieCapacities(p:ProjectInput){
 const t=p.craneColumn!.columnTie,g=craneColumnLayout(p)!,tg=columnTieGeometry(p),plate=t.plate,E=p.section.E,m=p.method;
 const Ag=plate.thickness*plate.width,An=Math.max(0,tg.netWidth*plate.thickness);
 const tension=Math.min(available(plate.Fy*Ag,m,.9,1.67),available(plate.Fu*An,m,.75,2));
 const comp=compressionResistance(Ag,plate.thickness/Math.sqrt(12),1.2*Math.max(g.gap,1),E,plate.Fy,m);
 const bolt=boltCapacity({grade:t.bolts.grade,diameter:t.bolts.diameter,planes:1,surface:'B',shear:0,tension:0,method:m}),bolts=bolt.shear*t.bolts.count;
 const db=t.bolts.diameter,lcEnd=t.bolts.edge-t.slot.width/2,lcIn=t.bolts.pitch-t.slot.width,perBolt=(lc:number)=>Math.max(0,Math.min(2*db*plate.thickness*plate.Fu,lc*plate.thickness*plate.Fu));
 const bearing=available(perBolt(lcEnd)+(t.bolts.count-1)*perBolt(lcIn),m,.75,2);
 const Fexx=p.details?.material.Fexx??482.6,weldLine=2*plate.width,weldCapacity=available(.6*Fexx,m,.75,2),weldForce=weldCapacity*weldLine*tg.weld/Math.SQRT2;
 const need=minimumEdge(db),vertical=(plate.width-t.slot.length)/2+t.slot.width/2,needV=need+.75*db;
 return {Ag,An,tension,comp,bolt,bolts,lcEnd,lcIn,bearing,weldLine,weldCapacity,weldForce,strength:Math.min(tension,comp.capacity,bolts,bearing,weldForce),
  edge:{need,end:t.bolts.edge,vertical,needV,ratio:Math.max(need/t.bolts.edge,needV/Math.max(vertical,1e-9))},spacing:Math.max(8/3*db,t.slot.width+Math.max(db,inch/2))};
}
/**
 * Shortening of the two columns between their bases and the column tie (PL/EA, unfactored): the crane column under the
 * runway dead load, the crane with impact at the most loaded support and its own weight; the building column under its
 * existing L and the largest of Lr, S and R; and the erection tolerance.
 */
export function columnShortening(p:ProjectInput,reactions:SupportReactionSet){
 const k=p.craneColumn!,g=craneColumnLayout(p)!,E=p.section.E,z=g.columnTie.elevation,cp=sectionProperties(existingColumnSection(p).section);
 const s=reactions.supports.reduce((a,v)=>v.D+v.Cd+v.Cv+v.Ci>a.D+a.Cd+a.Cv+a.Ci?v:a);
 const bp=sectionProperties(existingColumnSection(buildingColumnProject(p)).section),ex=k.building.existing;
 const P=Math.abs(ex.L.P)+Math.max(Math.abs(ex.Lr.P),Math.abs(ex.S.P),Math.abs(ex.R.P));
 return {crane:(s.D+s.Cd+s.Cv+s.Ci+cp.weight*z)*z/(E*cp.A),building:P*Math.min(z,k.building.height)/(E*bp.A),tolerance:k.tolerance??defaultSlotTolerance};
}

/** Fatigue cycles of the project: the duty spectrum where one is entered, else the project count. */
const cyclesOf=(p:ProjectInput)=>{const s=p.details?.spectrum??[];return s.length?s.reduce((a,v)=>a+v.cycles,0):p.fatigue.cycles;};

/** The crane-column base reactions a combined or enlarged footing is designed for: service (ASD) and factored (LRFD) extremes, both axes. */
export interface FootingReactions {service:{Pmax:number;Pmin:number;V:number;M:number};factored:{Pmax:number;Pmin:number;V:number;M:number}}
export function footingReactions(p:ProjectInput,reactions:SupportReactionSet):FootingReactions{
 const of=(method:ProjectInput['method'])=>{const a=columnBaseActions(p,reactions,method).flatMap(v=>v.actions);
  return {Pmax:Math.max(0,...a.map(v=>v.P)),Pmin:Math.min(...a.map(v=>v.P-(v.uplift??0))),V:Math.max(0,...a.map(v=>Math.hypot(v.Vx,v.Vy))),M:Math.max(0,...a.map(v=>Math.hypot(v.Mx,v.My)))};};
 return {service:of('ASD'),factored:of('LRFD')};
}
/** "P 120 kip max, 35 kip min; V 4.1 kip; M 0 (service); P 168 kip, ... (factored)". */
export function footingReactionText(r:FootingReactions,u:ProjectInput['units']){
 const f=(v:number)=>format(v,'force',u,3),m=(v:number)=>format(v,'moment',u,3),one=(x:FootingReactions['service'])=>`P ${f(x.Pmax)} max, ${f(x.Pmin)} min; V ${f(x.V)}; M ${m(x.M)}`;
 return `crane-column base, per column, ${one(r.service)} (service, ASD combinations); ${one(r.factored)} (factored, LRFD)`;
}
/**
 * Pipeline hook (calculate.ts, after the crane column, its base and the runway details): the building column under the
 * tie forces, the Appendix 6 brace of the crane-column top, the column tie, its slot travel, the gap and the footings.
 */
export function craneColumnCalculation(snapshot:CalculationSnapshot):void{
 const p=snapshot.input;if(!tiedToBuilding(p))return;
 const g=craneColumnLayout(p),crane=snapshot.existingColumn,reactions=snapshot.supportReactions,refs=['dg7-columns','aisc-app6'];
 if(!g||!crane||!reactions){snapshot.checks.push({id:'crane-column-basis',group:'Crane column',title:'Crane column tied to the building column · arrangement',status:'unsupported',equation:'',referenceIds:refs,note:'The crane column has no member analysis (enable the column check and its design scope): the building column, the brace and the column tie are not checked.'});return;}
 const k=p.craneColumn!,t=k.columnTie,c=p.existingColumn!,u=p.units,lrfd=p.method==='LRFD',E=p.section.E,tg=columnTieGeometry(p),f=(v:number,q:Parameters<typeof format>[1]='force')=>format(v,q,u,3);
 const checks:CheckResult[]=[],group='Crane column';
 const add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds:string[],caseId?:string)=>checks.push({id:`crane-column-${id}`,group,title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:Number.isFinite(demand)&&capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds,caseId});
 // The crane column: its largest factored axial force and the top reaction of its eccentric girder reaction.
 const {section:cs}=existingColumnSection(p),cp=sectionProperties(cs),Pr=Math.max(0,crane.governing.P.P),Lbr=g.columnTie.elevation;
 const unitTop=Math.abs(columnResponse(c.height,E*cp.Ix,c.strong,[{x:Math.min(c.seatElevation,c.height),moment:1}]).reactions.top);
 const eccentric=Pr*crane.eccentricity*unitTop,braceForce=.01*Pr;
 // The girder restraint forces at the supports (detailed runway model): the bottom flange through the cap to the column tie.
 const r=snapshot.detailResults,grids=r?.bracketForces??[],bottomSet=grids.reduce<{v:number;id:string}>((a,v)=>Math.abs(v.bottom.bottom)>a.v?{v:Math.abs(v.bottom.bottom),id:v.bottom.combination}:a,{v:0,id:''});
 const bottom=bottomSet.v,columnTieForce=bottom+eccentric+braceForce;
 const a6=snapshot.designAnalysis&&snapshot.properties?braceImperfection(p,snapshot.designAnalysis,snapshot.properties):undefined,girderTie=(r?.demands.brace??0)+(a6?.force??0);
 // Unfactored ranges for fatigue: the bottom flange lateral force range through the cap (every duty bin) and the eccentric top reaction of the static crane.
 const liveStatic=Math.max(0,...reactions.supports.map(s=>s.Cd+s.Cv+s.Ci));
 const range=Math.max(0,...(r?.columnCap?.grids??[]).flatMap(v=>v.fatigue.map(x=>x.lateral??0)))+liveStatic*crane.eccentricity*unitTop;
 // The building column: side thrust at the rail head, the brace forces the ties deliver, the runway mass across the runway.
 const projection=buildingColumnProject(p),building:ExistingColumnResult=existingColumnAnalysis(projection,tieReactions(reactions),{seismicReactions:reactions,
  lateral:[{x:g.columnTie.elevation,force:eccentric+braceForce},{x:g.girderTie.elevation,force:a6?.force??0}]});
 const buildingChecks=existingColumnChecks(projection,building,{prefix:'building-',label:'Building column'}).map(v=>v.id.startsWith('building-column-')?{...v,group:'Building column',title:v.title.replace(/^Existing column/,'Building column')}:v);
 // Appendix 6 nodal brace at the crane-column top.
 const kb=buildingColumnStiffness(p,g.columnTie.elevation),kt=columnTieStiffness(p),elastic=series(kb,kt),provided=secantStiffness(elastic,tg.play,braceForce);
 const required=(lrfd?1/.75:2)*10*Pr/Lbr;
 // The column tie: its strengths (one plate, the bolt row in single shear on sleeves through long slots perpendicular to the force).
 const cap=columnTieCapacities(p),{Ag,An,tension,comp,bolt,bolts,lcEnd,lcIn,bearing,weldCapacity}=cap,plate=t.plate,db=t.bolts.diameter,tieStrength=cap.strength;
 const weldStress=columnTieForce/(cap.weldLine*tg.weld/Math.SQRT2);
 // Slot travel: each column's shortening between its base and the tie, the larger plus the tolerance each way.
 const {crane:craneShort,building:buildingShort,tolerance}=columnShortening(p,reactions),slotDemand=Math.max(craneShort,buildingShort)+tolerance,slotCapacity=tg.travel;
 // Footing clearance across the runway (both footings concentric with their columns at each grid).
 const ft=p.columnBase?.enabled?p.columnBase.footing:undefined,adj=c.adjacent?.enabled?c.adjacent:undefined,line=adj?.A??adj?.B;
 const footing:CraneColumnResult['footing']=ft&&line&&line.footing.L>0&&line.footing.B>0?{clear:k.offset-ft.L/2-line.footing.L/2,required:adj!.footingClear,crane:{L:ft.L,B:ft.B},building:{L:line.footing.L,B:line.footing.B}}:undefined;

 snapshot.buildingColumn=building;
 snapshot.craneColumn={layout:g,ties:{girderTie,columnTie:columnTieForce,case:bottomSet.id,bottom,eccentric,braceForce,range},
  brace:{Pr,L:Lbr,strength:{required:braceForce,provided:tieStrength},stiffness:{required,building:kb,tie:kt,provided,play:tg.play},case:crane.governing.P.id},
  slot:{crane:craneShort,building:buildingShort,tolerance,demand:slotDemand,capacity:slotCapacity},footing};

 const L=(v:number)=>f(v,'length'),forces=`column-tie force ${f(columnTieForce)} = girder bottom-flange restraint ${f(bottom)}${bottomSet.id?` (${bottomSet.id})`:''} through the cap + the crane column's eccentric top reaction ${f(eccentric)} (P_r·e/H, e = ${L(crane.eccentricity)}) + the Appendix 6 brace force 0.01P_r = ${f(braceForce)}, taken together in either direction`;
 checks.push({id:'crane-column-basis',group,title:'Crane column tied to the building column · arrangement and load path',status:'pass',equation:'',referenceIds:[...refs,'tr13-bracket'],
  note:`New ${g.craneColumn.shape} crane column ${L(g.gap)} clear of the existing ${g.buildingColumn.shape} building column (centerlines ${L(k.offset)} apart), ${k.base} base, braced at the top across the runway by the column tie and along it by the crane-level bracing. Vertical: the girder on the column cap, the crane column and its footing (the building column takes no runway vertical load). Lateral: the girder top-flange tie to the building column face at ${L(g.girderTie.elevation)} above the base, and the bottom flange through the end-bearing bolts, cap and column top to the column tie at ${L(g.columnTie.elevation)}: the side thrust, the Appendix 6 brace forces and the runway's seismic force across the runway go to the building column (checked under Building column) and the building's lateral system. Column tie: ${L(plate.thickness)} × ${L(plate.width)} plate shop welded to the crane-column flange (${L(tg.weld)} fillets both faces), lapping a tab on the building column with ${t.bolts.count} ${t.bolts.grade} ${L(db)} bolts pretensioned against steel sleeves (${L(tg.od)} outside) through ${L(t.slot.width)} × ${L(t.slot.length)} vertical long slots, so the columns shorten independently. The tab and its connection to the existing building column are by others for the column-tie force reported here. Crane-column reactions, side thrust excluded: the column alone is checked above.`});
 add('gap','Crane column · clear gap to the building column',tg.minimumGap,g.gap,'length','c\\ge\\max\\left(2\\,\\mathrm{in},\\;(n-1)s+2l_e+2c_e\\right)',`Clear distance between the facing flanges ${L(g.gap)}: at least 2 in for erection, and the column-tie lap (${t.bolts.count} bolts at ${L(t.bolts.pitch)}, edges ${L(t.bolts.edge)}: ${L(tg.lap)}) with ${L(columnTieEndClearance)} clear at the plate and tab ends: ${L(tg.minimumGap)}.`,['dg7-columns']);
 add('brace-stiffness','Crane column top · nodal brace stiffness (Appendix 6)',required,provided,'stiffness','\\beta_{br}=\\frac{1}{\\phi}\\frac{10P_r}{L_{br}}\\le\\left(\\frac{1}{k_b}+\\frac{1}{k_t}+\\frac{g}{P_{br}}\\right)^{-1}',`AISC 360-16 Appendix 6 §6.2.2 nodal brace at the crane-column top, the coefficient 10 as the reference entry states it (conservative; to be verified): P_r = ${f(Pr)} (${crane.governing.P.id}), L_br = ${L(Lbr)} from the ${k.base} base to the column tie, ${lrfd?'φ = 0.75':'Ω = 2.00'}. Provided: the building column at the column tie, k_b = ${f(kb,'stiffness')} (unit force, ${k.building.strong.base} base, ${k.building.strong.top} top, column alone), in series with the column tie k_t = ${f(kt,'stiffness')} (plate over the gap and the bolt shear deformation), at its secant stiffness with the sleeve play g = ${L(tg.play)} across the slot taken up at P_br: ${f(provided,'stiffness')}. The building's own sway at the tie (frame and roof diaphragm) is excluded: the braced top of the building column is an existing-building survey item (Building column · frame type).`,refs,crane.governing.P.id);
 add('brace-strength','Crane column top · nodal brace strength (Appendix 6)',columnTieForce,tieStrength,'force','P_{br}=0.01P_r;\\quad P_{br}+H_b+H_e\\le\\min(\\phi R_n)_{tie}',`Required brace strength 0.01P_r = ${f(braceForce)}, with the concurrent ${forces}, against the governing strength of the column tie (plate, bolts, bearing at the slots and the shop weld below). The building column takes the same forces (Building column).`,refs,crane.governing.P.id);
 add('tie-plate-yield','Column tie · plate tension (yield, net section)',columnTieForce,tension,'force','\\min(\\phi F_yA_g,\\;\\phi F_uA_n),\\;A_n=(h-l_s-1/16)t',`${L(plate.thickness)} × ${L(plate.width)} plate: gross yielding (D2-1) and rupture of the net section through a vertical slot, A_n = ${f(An,'area')} (U = 1). ${forces}.`,['aisc-connections']);
 add('tie-compression','Column tie · plate compression',columnTieForce,comp.capacity,'force','P_n=F_{cr}A_g\\ \\ (E3),\\;KL/r=1.2L/(t/\\sqrt{12})',`Out-of-plane flexural buckling over the clear gap L = ${L(g.gap)}, K = 1.2 (welded end and the bolted lap rotation-fixed, the lap free to translate along the runway: AISC Commentary Table C-A-7.1 (c)); KL/r = ${comp.slenderness.toFixed(1)}.`,['aisc-e']);
 add('tie-bolts','Column tie · bolt shear',columnTieForce/t.bolts.count,bolt.shear,'force','r_n=F_{nv}A_b\\ \\ (J3.6),\\ \\text{single plane, threads included}',`${t.bolts.count} ${t.bolts.grade} ${L(db)} bolts in single shear on their sleeves; the force shared equally.`,['aisc-connections','tr13-bolting']);
 add('tie-bearing','Column tie · bearing and tearout at the long slots',columnTieForce,bearing,'force','R_n=\\sum\\min(2.0dtF_u,\\;1.0l_ctF_u)\\ \\ (J3.10b)',`Long-slotted holes with the slot perpendicular to the force (AISC 360-16 J3.10(b)), the bolt diameter d = ${L(db)} for bearing (the sleeve bears over its larger diameter); clear distance to the plate end l_c = ${L(lcEnd)}, between slots ${L(lcIn)}. In compression the bolts bear toward the plate body (not governing).`,['aisc-connections']);
 {const {need,end:endEdge,vertical,needV,ratio}=cap.edge;
  add('tie-edge','Column tie · edge distances at the slots',ratio,1,'ratio','l_e\\ge l_{e,min}\\ \\ (J3.4);\\quad l_{e,v}\\ge l_{e,min}+C_2,\\;C_2=0.75d\\ \\ (J3.5)',`To the plate end (the slot parallel to that edge, C₂ = 0): ${L(endEdge)} against ${L(need)} (Table J3.4). Above and below the slots, from the slot end center: ${L(vertical)} against ${L(needV)} (Table J3.5, slot perpendicular to the edge, C₂ = 0.75d not reduced).`,['aisc-connections']);}
 {const need=cap.spacing;
  add('tie-spacing','Column tie · slot spacing',need,t.bolts.pitch,'length','s\\ge\\max\\left(2\\tfrac23d,\\;w_s+\\max(d,\\tfrac12\\,\\mathrm{in})\\right)',`Slot centers ${L(t.bolts.pitch)} apart along the tie: at least 2 2/3 d (J3.3) and a clear ligament of d (at least 1/2 in) between slots of width ${L(t.slot.width)}.`,['aisc-connections']);}
 add('tie-weld','Column tie · shop fillets to the crane column',weldStress,weldCapacity,'stress','f=\\frac{F}{2h(0.707w)}\\le\\phi0.60F_{EXX}',`${L(tg.weld)} fillets both faces of the plate over its depth ${L(plate.width)} (the AISC J2.4 minimum for the thinner part, at least 1/4 in), the force normal to the weld; no directional increase taken. The crane-column flange is not checked for the local force (small against the flange; see the basis).`,['aisc-connections']);
 {const n=cyclesOf(p),allow=transverseFilletFatigue(plate.thickness,tg.weld,n).capacity,stress=range/Ag;
  add('tie-weld-fatigue','Column tie · fillet toe fatigue at the crane column',stress,allow,'stress','\\Delta f=\\frac{\\Delta F}{ht}\\le F_{SR}\\ \\ (A-3-5,\\ A-3-6)',`Unfactored range of the column-tie force ${f(range)}: the bottom-flange lateral force range through the cap in any duty bin plus the static crane's eccentric top reaction, at all ${n.toLocaleString('en-US')} cycles (all-cycle bound). Transverse fillets on the tension-loaded plate, Category C with the root reduction R_FIL.`,['aisc-fatigue'],undefined);
  const Fsr=Math.max(fatigueThreshold('E'),finiteLife(1.1,n)),net=range/Math.max(An,1e-9);
  add('tie-plate-fatigue','Column tie · plate net section fatigue at the slots',net,Fsr,'stress','\\Delta f=\\frac{\\Delta F}{A_n}\\le F_{SR}\\ \\ \\text{(Category E)}',`Net section through a slot, the plate bearing on the sleeve without clamping: taken as a pin plate (AISC Table A-3.1 item 2.4, Category E, C_f = 11 × 10⁸), all ${n.toLocaleString('en-US')} cycles.`,['aisc-fatigue']);}
 add('tie-slot-travel','Column tie · vertical slot travel (differential shortening)',slotDemand,slotCapacity,'length','\\max(\\delta_c,\\delta_b)+\\delta_t\\le\\frac{l_s-D_s}{2}',`Each way from the centered sleeve: crane column shortening δc = PL/EA = ${L(craneShort)} (runway dead load, crane with impact at the most loaded support and the column's own weight, base to the tie), building column shortening δb = ${L(buildingShort)} (its existing L and the largest of Lr, S and R axial effects, unfactored), the larger plus the erection tolerance ${L(tolerance)}; travel (${L(t.slot.length)} − ${L(tg.od)})/2 = ${L(slotCapacity)}. The sleeves are set centered at erection, after the runway dead load is on the crane column.`,['dg7-columns','aisc-connections']);
 if(footing){const s=footing,title='Crane column · footing clearance to the building column footing',eq='c_{ftg}=e-\\frac{L_c}{2}-\\frac{L_b}{2}\\ge c_{min}';
  const geometry=`Across the runway: the crane-column footing ${L(s.crane.L)} × ${L(s.crane.B)} and the existing building-column footing ${L(s.building.L)} × ${L(s.building.B)}, both concentric with their columns ${L(k.offset)} apart: clear ${L(s.clear)} against ${L(s.required)}.`;
  if(s.clear>=s.required)add('footing-clearance',title,s.required,s.clear,'length',eq,`${geometry} Excavation shall not undermine the existing footing.${adj?.source?` Survey: ${adj.source}.`:''}`,['criteria']);
  // Footings that overlap (or come too close) are a foundation coordination item, not a failed design of the runway:
  // a combined or enlarged footing for the reactions given here is the foundation engineer's (by others), so the check
  // stays open ('unverified') until that design is referenced, with the crane-column base reactions it needs.
  else{const r=footingReactions(p,reactions);s.reactions=r;
   checks.push({id:'crane-column-footing-clearance',group,title,status:'unverified',demand:s.required,capacity:s.clear,quantity:'length',equation:eq,referenceIds:['criteria'],
    note:`Combined or enlarged footing by the foundation engineer for the reactions given: ${footingReactionText(r,u)}. ${geometry} The isolated crane-column footing sized here overlaps (or comes too close to) the existing footing, so it cannot be built as drawn: a foundation coordination item (the crane-column footing checks above apply to the isolated footing only). The building-column footing also takes the base shear and moment of the tie forces (Building column). Excavation shall not undermine the existing footing.${adj?.source?` Survey: ${adj.source}.`:''}`});}
 }else checks.push({id:'crane-column-footing-clearance',group,title:'Crane column · footing clearance to the building column footing',status:'incomplete',equation:'',referenceIds:['criteria'],note:'Enter the surveyed building column footing (existingColumn.adjacent, its footing size) to check the crane-column footing against it.'});
 // The building column's footing clearance is reported here, not twice.
 snapshot.checks=snapshot.checks.filter(v=>v.id!=='existing-footing-clear');
 snapshot.checks.push(...buildingChecks,...checks);
}

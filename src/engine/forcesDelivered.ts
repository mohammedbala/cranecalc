import type {CalculationSnapshot,DesignAnalysis,ProjectInput,Properties} from './types';
import type {SupportForceSet} from './bracketForces';
import {craneCombinations} from './aistLoads';
import {runwayElevations} from './drawingData';
import {capTieLine} from './capAngle';
import {activeColumnCap} from './columnCapInputs';
import {flangeTieGeometry,tieLine} from './tieGeometry';
import {craneLevelStrut,existingColumnEccentricity} from './existingColumn';
import {tiedToBuilding} from './craneColumnInputs';

/**
 * Forces the runway delivers to the building columns (C4): at each grid, whole concurrent sets of the factored bracket
 * design force envelope, each resolved where it acts on the column:
 * - V, the girder reactions on the seat, at the eccentricity e from the column centerline (the column check's:
 *   the far bearing edge, or on a new column the web line plus columnReactionOffset): strong-axis moment M_x = V·e about the column;
 * - M_y, the seat moment ΣV·x of unbalanced girder end reactions about the grid: weak-axis moment on the column at
 *   the seat (not the girder torque about its shear center);
 * - H at the tie line, the top-flange restraint force of the set plus the Appendix 6 brace force (either way); its
 *   envelope is the tie design force;
 * - H at the seat, the bottom-flange restraint force through the bearing bolts (signed relative to the tie force);
 * - F, the longitudinal force at the locating bearing, on the girder line at the seat (to the crane-level strut).
 * Values within one row act together; rows are alternatives. Canonical units N, mm.
 * A crane column tied to the building (craneColumn.ts): the building column takes H only, at the girder tie (Htie) and
 * through the column tie (Hseat: the bottom-flange force, to which the column tie adds the crane column's brace force and
 * eccentric top reaction, `craneColumn`); V, M_y and F go to the crane column, its footing and bracing (V = M_y = F = 0).
 */
export interface DeliveredSet {
 label:string;combination:string;id:string;
 V:number;Mx?:number;My:number;
 /** Seat moment also reached reversed (end reactions exchanged), horizontal forces unchanged. */
 mirrored:boolean;
 /** Concurrent top-flange restraint force of the set (signed) and the force at the tie line with the brace force. */
 top:number;Htie:number;Hseat:number;F:number;
}
export interface DeliveredGrid {grid:number;x:number;sets:DeliveredSet[]}

/**
 * AISC 360-16 Appendix 6 stability bracing force that a top-flange tie adds to the restraint force of the analysis:
 * point bracing of the beam, P_br = 0.02M_rC_d/h_o (6.3.1b), and of the axial force, 0.01P_r (6.2.2), with the
 * girder's largest factored moment and axial force; and the required brace stiffness (LRFD φ = 0.75, ASD Ω = 2.00)
 * over the restraint spacing L_br. The flange restraint force of the lateral/torsional analysis is added to P_br.
 */
export function braceImperfection(p:ProjectInput,a:Pick<DesignAnalysis,'moment'|'axial'>,props:Pick<Properties,'h0'>){
 const Cd=p.system==='continuous'?2:1,Lbr=Math.min(p.lateralBraceSpacing,p.aist?.bottomBraceSpacing??p.lateralBraceSpacing);
 const flexure=.02*a.moment*Cd/props.h0,axial=.01*a.axial;
 const stiffness=(p.method==='LRFD'?1/.75:2)*(10*a.moment*Cd/props.h0+8*a.axial)/Lbr;
 return {flexure,axial,force:flexure+axial,stiffness,Cd,Lbr};
}

const near=(a:number,b:number)=>Math.abs(a-b)<=1e-6*Math.max(Math.abs(a),Math.abs(b),1);
const same=(a:SupportForceSet,b:SupportForceSet)=>a.id===b.id&&near(a.vertical,b.vertical)&&near(a.moment,b.moment)&&near(a.longitudinal,b.longitudinal)&&near(a.top,b.top)&&near(a.bottom,b.bottom);

/** The concurrent force sets at every grid, their elevations and the tie design force. */
export function deliveredForces(s:CalculationSnapshot){
 const p=s.input,r=s.detailResults,a=s.designAnalysis,props=s.properties;
 if(!r?.bracketForces?.length||!a||!props)return undefined;
 const b=p.details?.bracket,d=p.details!,tied=tiedToBuilding(p);
 // Reaction eccentricity from the column centerline (bracket: half the column depth, the reach and half the bearing).
 // A seat by others on a column this calculation does not model: from the column face, the girder web line entered for
 // the tie (its column face) plus half the bearing; the column half depth is the building engineer's (eFrom 'face').
 const face=!b?.enabled&&!p.existingColumn?.enabled&&!activeColumnCap(p)?d.brace.capAngle?.columnFace??d.brace.flangeAttachment?.columnFace:undefined;
 // A column checked here takes e from its resolved support, as its own check does (a column cap: the rail eccentricity).
 const e=tied?undefined:p.existingColumn?.enabled?existingColumnEccentricity(p):b?.enabled?b.receiver.depth/2+b.reach+d.bearing.width/2:face!==undefined?face+d.bearing.width/2:undefined;
 const eFrom:'centerline'|'face'|undefined=e===undefined?undefined:face!==undefined&&!b?.enabled&&!p.existingColumn?.enabled?'face':'centerline';
 const brace=braceImperfection(p,a,props),stops=new Set(craneCombinations(p.method,p.aist?.concurrency==='full').filter(c=>c.bumper>0).map(c=>`${p.method} ${c.id}`));
 const grids:DeliveredGrid[]=r.bracketForces.map(v=>{
  const sets:DeliveredSet[]=[];
  const add=(label:string,set:SupportForceSet|undefined,mirrored=false)=>{
   if(!set)return;const f=tied?{...set,vertical:0,moment:0,longitudinal:0}:set;const old=sets.find(x=>x.id===f.id&&near(x.V,f.vertical)&&near(x.My,f.moment)&&near(x.F,f.longitudinal)&&near(x.top,f.top));
   if(old){if(!old.label.includes(label))old.label+=` & ${label}`;old.mirrored||=mirrored;return;}
   sets.push({label,combination:f.combination,id:f.id,V:f.vertical,Mx:e===undefined?undefined:f.vertical*e,My:f.moment,mirrored,top:f.top,Htie:Math.abs(f.top)+brace.force,Hseat:f.bottom,F:f.longitudinal});
  };
  if(tied){add('max H',v.top);add('max H seat',v.bottom);return {grid:v.grid,x:v.x,sets};}
  add('max V',v.maxVertical,!!v.mirror.vertical&&v.reversible.vertical);
  if(!same(v.maxMoment,v.maxVertical))add('max M_y',v.maxMoment,!!v.mirror.moment&&v.reversible.moment);
  add('max H',v.top);
  for(const f of v.reversible.longitudinal&&v.backward&&v.forward?[v.backward,v.forward]:Math.abs(v.longitudinal.longitudinal)>=1?[v.longitudinal]:[])add(stops.has(f.combination)?'stop':'max F',f);
  if(v.minVertical.vertical<0)add('uplift',v.minVertical);
  return {grid:v.grid,x:v.x,sets};
 });
 // The tie line of the girder analysis (tieLine: the bar centroid of a flange or stiffener tie, the cap tieback line, or
 // the top flange at mid-thickness on a fork), and where a flange tie's bars bring the force to the column: their
 // centerline, below the flange by the saddle and its clearance (the same line).
 const el=runwayElevations(p),tie=tieLine(p),ft=capTieLine(p)===undefined?flangeTieGeometry(p):undefined;
 const bars=ft?p.section.d/2+ft.topCenter:undefined;
 const stopGrids=grids.filter(g=>g.sets.some(x=>stops.has(x.combination)&&Math.abs(x.F)>=1)).map(g=>g.grid);
 const tractionGrids=grids.filter(g=>g.sets.some(x=>!stops.has(x.combination)&&Math.abs(x.F)>=1)).map(g=>g.grid);
 const traction=Math.max(0,...grids.flatMap(g=>g.sets.filter(x=>!stops.has(x.combination)).map(x=>Math.abs(x.F))));
 const stop=Math.max(0,...grids.flatMap(g=>g.sets.filter(x=>stops.has(x.combination)).map(x=>Math.abs(x.F))));
 const analysis=Math.max(0,...grids.flatMap(g=>g.sets.map(x=>Math.abs(x.top))));
 // The crane-level strut by others that the existing-column check relies on: location, stiffness and design force.
 const strut=s.existingColumn?craneLevelStrut(p,s.existingColumn):undefined;
 return {grids,e,eFrom,brace,strut,
  /** A crane column tied to the building: the column-tie force parts beyond the bottom-flange force (calculate's craneColumn result). */
  craneColumn:tied&&s.craneColumn?{braceForce:s.craneColumn.ties.braceForce,eccentric:s.craneColumn.ties.eccentric,columnTie:s.craneColumn.ties.columnTie,elevation:{girderTie:s.craneColumn.layout.girderTie.elevation,columnTie:s.craneColumn.layout.columnTie.elevation}}:undefined,
  /** The girder web line from the column centerline (bracket) or from the column face (seat by others); e is taken beyond it (existingColumnEccentricity: the far bearing edge, or on a new column the web plus columnReactionOffset). */
  web:tied&&s.craneColumn?s.craneColumn.layout.girderTie.face:b?.enabled?b.receiver.depth/2+b.reach:face,
  /** The tie design force: the largest concurrent top-flange restraint force (all girder ends at a grid) plus the brace force. */
  tie:{analysis,design:r.demands.brace+brace.force,perEnd:r.demands.braceEnd},
  /**
   * Elevations above the floor datum: seat (top of the bracket), the tie line of the analysis and, for a flange tie, the
   * centerline of its bars at the column (tieBars); undefined without elevations.
   */
  elevation:el?{seat:el.seat,tie:el.seat+d.bearing.thickness+tie,tieBars:bars===undefined?undefined:el.seat+d.bearing.thickness+bars}:undefined,
  stopGrids,tractionGrids,traction,stop};
}
export type DeliveredForces=NonNullable<ReturnType<typeof deliveredForces>>;

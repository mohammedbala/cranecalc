import {aiscShapeByName} from '../data/aiscSections';
import {tiedToBuilding,type CraneColumnInput} from './craneColumnInputs';
import type {ExistingColumnInput} from './existingColumnInputs';
import type {CalculationSnapshot,ProjectInput} from './types';
import type {ExistingColumnCombination} from './existingColumn';
import {format} from './units';

/**
 * Separate crane column tied to an existing building column (configurator support 'crane-column'). WORK PACKAGE 0
 * contracts: the layout, the validator and the result type are final in shape; craneColumnCalculation is a stub that
 * marks the arrangement unsupported until WP-1 (crane column engine) implements it. See craneColumnInputs.ts for the model.
 */
const inch=25.4;
/** Least clear distance between the facing flanges of the crane column and the building column (plan §2 validation). */
export const craneColumnGap=2*inch;
/** Default erection and fit-up allowance in the slot travel check. */
export const defaultSlotTolerance=.25*inch;

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
 /** Clear distance between the facing flanges (at least craneColumnGap). */
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
 return errors;
}

/**
 * Results of the crane-column arrangement (WP-1 fills them; the shape may grow but these fields are the contract the
 * report and drawings read). The crane column's own member result stays `snapshot.existingColumn` (checks `column-*`,
 * group 'Crane column'); the building column's is `snapshot.buildingColumn` (checks `building-column-*`).
 */
export interface CraneColumnResult {
 layout:CraneColumnLayout;
 /** Forces delivered to the building column by the ties (factored, the governing combination): side thrust at the girder tie, the column-tie force. */
 ties:{girderTie:number;columnTie:number;case:string};
 /** AISC 360-16 Appendix 6 §6.2.2 nodal brace at the crane-column top: required strength 0.01Pr and stiffness (1/φ)(10Pr/L) (Ω = 2 ASD), against the building column at the tie in series with the column tie. */
 brace:{Pr:number;L:number;strength:{required:number;provided:number};stiffness:{required:number;building:number;tie:number;provided:number};case:ExistingColumnCombination['id']};
 /** Vertical slot travel at the column tie: crane-column and building-column shortening (PL/EA), the tolerance, their sum against the slot travel. */
 slot:{crane:number;building:number;tolerance:number;demand:number;capacity:number};
}

/**
 * Pipeline hook (calculate.ts, after the crane column's own analysis and base): the building-column analysis, the
 * brace, tie and slot checks. WP-0 stub: an unsupported open item, so a project with a crane column is never issued
 * before WP-1 implements the arrangement.
 */
export function craneColumnCalculation(snapshot:CalculationSnapshot):void{
 const p=snapshot.input;if(!tiedToBuilding(p))return;
 snapshot.checks.push({id:'crane-column-basis',group:'Crane column',title:'Crane column tied to the building column · arrangement',status:'unsupported',equation:'',referenceIds:['dg7-columns','aisc-app6'],
  note:'The separate crane column tied to the building column is not analyzed yet: the building column under the tie forces, the Appendix 6 brace stiffness and strength of the tie, the column tie and its slot travel are not checked. The crane column alone is checked above without the side thrust.'});
}

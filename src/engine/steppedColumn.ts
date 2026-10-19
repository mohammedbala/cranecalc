import {aiscShapeByName} from '../data/aiscSections';
import {activeStep,type StepInput} from './steppedColumnInputs';
import {columnPlates} from './craneColumn';
import type {CalculationSnapshot,ProjectInput} from './types';
import type {ExistingColumnResult} from './existingColumn';
import {format} from './units';

/**
 * Girder on the step of an existing stepped building column (configurator support 'stepped-column'). WORK PACKAGE 0
 * contracts: the geometry, the validator and the result type are final in shape; steppedColumnCalculation is a stub
 * that marks the arrangement unsupported until WP-2 (stepped column engine) implements it. See steppedColumnInputs.ts.
 */

/**
 * Step geometry for the drawings (WP-3) and the engine (WP-2). Across the runway x is from the lower-shaft centroid,
 * positive toward the crane span; elevations from the column base.
 */
export interface StepGeometry {
 lower:{shape:string;d:number;bf:number;tf:number;tw:number;x:number;base:number;top:number};
 upper:{shape:string;d:number;bf:number;tf:number;tw:number;x:number;base:number;top:number};
 /** Step cap on top of the lower shaft: its top is the girder seat (existingColumn.seatElevation). */
 cap:StepInput['cap']&{top:number;bottom:number};
 /** Girder web centerline and the girder reaction's eccentricity to the lower-shaft centroid (= girderOffset). */
 girderWeb:number;
 /** Upper-shaft inner flange face (toward the crane), where the top-flange tie lands, and its distance from the girder web. */
 tieFace:number;tieDistance:number;
 /** Upper-shaft inner flange centerline: its force P_u/2 ± M_u/(d_u − t_fu) bears on the lower web there (J10.2/J10.3). */
 innerFlange:number;
 stiffener?:NonNullable<StepInput['stiffener']>;
}
export function stepGeometry(p:ProjectInput):StepGeometry|undefined{
 const s=activeStep(p),c=p.existingColumn;if(!s||!c)return undefined;
 const lo=columnPlates(c),up=columnPlates(s.upper),xu=-s.offset,step=c.seatElevation;
 return {lower:{...lo,x:0,base:0,top:step-s.cap.thickness},upper:{...up,x:xu,base:step,top:c.height},cap:{...s.cap,top:step,bottom:step-s.cap.thickness},
  girderWeb:s.girderOffset,tieFace:xu+up.d/2,tieDistance:s.girderOffset-(xu+up.d/2),innerFlange:xu+up.d/2-up.tf/2,...(s.stiffener?{stiffener:s.stiffener}:{})};
}

export function validateSteppedColumn(p:ProjectInput):string[]{
 const c=p.existingColumn,s=c?.step;if(!c?.enabled||!s)return [];
 const errors:string[]=[],add=(test:boolean,m:string)=>{if(test)errors.push(`existingColumn.step.${m}`);},L=(v:number)=>format(v,'length',p.units,3);
 add(!!c.isNew,'upper: a stepped column is an existing building column; clear isNew.');
 add(!!p.craneColumn?.enabled,'upper: a crane column and a stepped column are alternative supports; remove one.');
 add(!!p.details?.bracket?.enabled,'upper: the girder bears on the step cap, not on a bracket: disable the bracket.');
 add(!!p.columnCap?.enabled,'upper: the girder bears on the step cap, not on a column cap: disable the column cap.');
 add(s.upper.Fu<s.upper.Fy,'upper.Fu: ultimate strength cannot be less than yield strength.');
 add(!!s.upper.shape&&!aiscShapeByName(s.upper.shape),'upper.shape: select an AISC W shape or clear it to use entered plates.');
 add(c.seatElevation>=c.height-1e-6,'upper: the step (existingColumn.seatElevation) must be below the column top: the upper shaft runs from the step to the top.');
 const g=stepGeometry(p);if(!g)return errors;
 add(g.lower.d<=g.upper.d,`upper.d: the lower shaft (${L(g.lower.d)}) must be deeper than the upper shaft (${L(g.upper.d)}).`);
 add(s.girderOffset<g.lower.d/2-g.lower.tf-1e-6||s.girderOffset>g.lower.d/2+1e-6,`girderOffset: the girder web must bear over the lower shaft's crane-side flange, ${L(g.lower.d/2-g.lower.tf)} to ${L(g.lower.d/2)} from the lower-shaft centroid.`);
 add(g.upper.x-g.upper.d/2<-g.lower.d/2-1e-6||g.upper.x+g.upper.d/2>g.lower.d/2+1e-6||g.upper.bf>g.lower.bf+1e-6,'offset: the upper shaft must stand within the lower shaft\'s footprint.');
 add(s.cap.thickness>=c.seatElevation,'cap.thickness: the step cap must sit on the lower shaft.');
 const flange=(p.section.kind==='cap'?p.section.capWidth:p.section.bf)/2;
 add(g.tieDistance-flange<=0,`offset: the girder top flange${p.section.kind==='cap'?' and cap':''} must clear the upper shaft's inner face (girder web to face ${L(g.tieDistance)}).`);
 return errors;
}

/**
 * Results of the stepped column (WP-2 fills them). `snapshot.existingColumn` holds the ExistingColumnResult-compatible
 * summary (governing, drift, support, bySupport) that the report, drawings and columnSupportChecks read; these are the
 * stepped-column specifics.
 */
export interface SteppedShaftResult {
 source:string;
 /** Effective lengths of the shaft: strong axis from the buckling analysis, weak axis as entered. */
 Lcx:number;Lcy:number;
 capacity:ExistingColumnResult['capacity'];
 governing:ExistingColumnResult['governing'];
}
export interface SteppedColumnResult {
 geometry:StepGeometry;
 /** Elastic buckling of the two-segment column (columnBuckling) under the governing combination's axial forces. */
 buckling:{factor:number;convergence:number;case:string;axial:{upper:number;lower:number};Lcx:{upper:number;lower:number}};
 upper:SteppedShaftResult;lower:SteppedShaftResult;
 /** Step local actions (stepSeat.ts): the girder reaction on the cap, the upper inner-flange force on the lower web, the panel shear. */
 step:{reaction:number;flangeForce:number;panelShear:number;case:string;stiffenerRequired:boolean};
}

/**
 * Pipeline hook (calculate.ts, in place of the prismatic existing-column analysis when a step is entered). WP-0 stub:
 * an unsupported open item, so a stepped column is never issued before WP-2 implements it.
 */
export function steppedColumnCalculation(snapshot:CalculationSnapshot):void{
 if(!activeStep(snapshot.input))return;
 snapshot.checks.push({id:'step-basis',group:'Stepped column',title:'Stepped column · girder on the step',status:'unsupported',equation:'',referenceIds:['dg7-columns','aisc-app7'],
  note:'The stepped column is not analyzed yet: the two-shaft model, its buckling analysis, the H1 checks of the upper and lower shafts and the step checks are not made, and the prismatic existing-column check does not apply to it.'});
}

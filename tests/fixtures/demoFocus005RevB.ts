import type {ProjectInput} from '../../src/engine/types';
import {demoFocus005} from './demoFocus005';

const inch=25.4,kip=4448.2216152605,ftPerMin=5.08;
/**
 * DEMO-FOCUS-005 revision B: the review's open items resolved by revised inputs and the section E design changes.
 * Every change from the reviewed project (demoFocus005()) is listed here; nothing else differs.
 */
export const revBChanges:string[]=[];
export function demoFocus005RevB():ProjectInput{
 const p=demoFocus005(),note=(s:string)=>revBChanges.length<20&&!revBChanges.includes(s)&&revBChanges.push(s);
 p.title='Cedar Works · New 5-ton runway in the existing 5-bay building · Rev B';
 // A4/B12 · corrected (fictitious) supplier schedule: statically consistent wheel loads for B = 10, T = 2.5, Q = 10 kip,
 // with the trolley at its 0.19 S hook approach; rated bridge speed, bumper stroke and efficiency.
 const c=p.cranes[0];
 c.wheels=c.wheels.map(w=>({...w,loaded:7.5*kip,unloaded:3.5*kip}));
 c.loadSource='Fictitious supplier schedule DEMO-CS-05 rev B: 7.5 kip max / 3.5 kip empty per wheel on the near runway, 3.7 kip minimum on the far runway; bridge speed 100 ft/min; bumper stroke 4 in, efficiency 0.5.';
 c.operatingClass='Fictitious CMAA C crane; AIST Class B building (400,000 cycles counted)';
 Object.assign(c.design!,{bridgeSpeed:100*ftPerMin,minWheelLoad:3.7*kip,belowHookWeight:0,bumperStroke:4*inch,bumperEfficiency:.5});
 note('Crane schedule corrected for statics: 7.5 kip max, 3.5 kip empty, 3.7 kip minimum per wheel (was 10 / 4 kip); bridge speed 100 ft/min, bumper stroke 4 in, efficiency 0.5 entered.');
 // A3 · Class B by the counted 400,000 cycles; one cycle count throughout.
 p.aist!.buildingClass='B';
 p.capDesign!.dutySource='Fictitious supplier confirms CMAA C, 5-US-ton crane; 400,000 wheel stress fluctuations (three duty bins)';
 note('AIST building class C → B (400,000 counted cycles); cap duty source corrected to 400,000 fluctuations.');
 // B7/B8 (section E) · crane-level longitudinal strut on the girder line at the locating columns.
 p.existingColumn!.longitudinalExit='girder-strut';
 note('Crane-level longitudinal strut on the girder line at the locating columns (removes the column torsion and weak-axis bending from the longitudinal force).');
 // B14/B15/D30/D32 · fabrication notes consistent with the generated requirements.
 const fab=p.details!.fabrication!;
 fab.bolting='ASTM F3125 Grade A325, sizes as detailed, pretensioned to the RCSC Table 8.1 minimum pretension; slip-critical Class B faying surfaces where cyclic (AIST TR-13 §5.14). Sliding-end bearing bolts and column-end tie bolts are pretensioned against steel sleeves. Rail joint bolts pretensioned in standard holes at tight joints; re-tighten after 30 and 90 days of crane operation.';
 fab.inspection='Visual inspection of all welds and bolt installations; verify pretension and faying-surface preparation. AWS D1.1 cyclically loaded acceptance criteria; 100% UT of all CJP groove welds; MT at attachment terminations and repaired welds (AIST TR-13 §5.17). Record baseline rail and connection condition before commissioning.';
 fab.railAlignment='Survey both rails unloaded and during commissioning; gauge, line, grade and eccentricity within the AIST TR-13 §5.18 tolerances listed in the construction notes, and the crane supplier requirements.';
 note('Fabrication notes rewritten: pretensioned bolts at tight rail joints, UT of CJP welds, TR-13 §5.18 tolerances.');
 p.details!.rail.jointType='tight';p.details!.rail.jointGap=inch/16;
 note('Rail joints entered as tight joints, 1/16 in maximum gap.');
 // D31 (section E) · haunch top flange widened for the 1/8 in bearing setting tolerance; cap-angle end plate taller.
 p.details!.bracket!.haunch!.topWidth=25.5*inch;
 p.details!.brace!.capAngle!.endPlate.height=5.5*inch;
 note('Haunch top flange 25 in → 25-1/2 in; cap-angle end plate 5-1/4 in → 5-1/2 in high.');
 // Building evaluation data that are not available (frame type, frame service displacements, site seismic, IEBC
 // evaluation, 10-year wind on the braced line) are omitted from this package and listed as by others.
 // The 0.005 rad rail rotation limit was not an owner or crane-supplier requirement: removed (TR-13 sets none).
 delete p.details!.criteria.twistLimit;
 p.criteriaSource=p.criteriaSource.replace(/[;,]?\s*twist\s*0\.005\s*rad/i,'');
 p.criteriaSource=p.criteriaSource.replace('AIST Class C','AIST Class B');
 note('Rail rotation limit 0.005 rad removed (not an owner or crane-supplier requirement; the rotation is reported, not checked).');
 p.omitUnverified=true;
 note('Checks without data (frame type, 10-year wind drift, rail gauge from frame spread, runway seismic, IEBC alteration) omitted from the report and listed as not checked (by others).');
 return p;
}

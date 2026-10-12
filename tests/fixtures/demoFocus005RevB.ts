import type {ProjectInput} from '../../src/engine/types';
import {demoFocus005} from './demoFocus005';
import {loadCappedSection} from '../../src/data/aiscChannels';
import {demonstrationClip} from '../../src/engine/demonstration';

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
 // E35 · end-bay bearings centered on the haunch web at the runway-end grids (girder runs 6 in past the grid).
 p.details!.simpleSupport!.endGridBearing='centered';
 note('End-bay bearings centered on the haunch web at grids 1 and 6 (seat moment there 27.9 → 10.5 kip-ft).');
 p.details!.brace!.capAngle!.endPlate.height=5.5*inch;
 note('Haunch top flange 25 in → 25-1/2 in; cap-angle end plate 5-1/4 in → 5-1/2 in high.');
 // Drawings dimension to whole 1/4 in: joint bars 3 7/8 → 3 3/4 in high, cap-angle lap bolt gauge 2 7/8 → 3 in.
 p.details!.rail.jointPlateHeight=3.75*inch;
 p.details!.brace.capAngle!.lapBolts.gauge=3*inch;
 note('Dimensions on the 1/4 in grid: joint bars 3 7/8 → 3 3/4 in high; cap-angle lap bolt gauge 2 7/8 → 3 in.');
 // Rail attachment to standard practice (AISC DG7; rail clip manufacturers): the welded keeper plates with lips, end
 // fillets, rail-base notches and notched anchor keepers are replaced by proprietary weld-on floating rail clips in
 // opposing pairs at 24 in, fictitious supplier data (rated 10 kip lateral, 5 kip uplift per clip, allowable), base
 // welded to the cap channel with 5/16 in fillets 2 1/2 in long across each end; the rail is anchored by the end stops.
 p.details!.rail.clip=demonstrationClip(.3125*inch);
 note('Rail keepers (welded plates with lips, end fillets, notched anchor keepers) replaced by weld-on floating rail clips per manufacturer (fictitious supplier data RC-W6: 10 kip lateral, 5 kip uplift per clip, allowable) in opposing pairs at 24 in, base welded 5/16 in x 2 1/2 in each end; rail anchored by the end stops.');
 // The 0.005 rad rail rotation limit was not an owner or crane-supplier requirement: removed (TR-13 sets none).
 delete p.details!.criteria.twistLimit;
 p.criteriaSource=p.criteriaSource.replace(/[;,]?\s*twist\s*0\.005\s*rad/i,'');
 p.criteriaSource=p.criteriaSource.replace('AIST Class C','AIST Class B');
 note('Rail rotation limit 0.005 rad removed (not an owner or crane-supplier requirement; the rotation is reported, not checked).');
 // E36 · girder re-optimised once the rail rotation limit is gone: W24X104 + C15X50 (154 plf) → W14X61 + C15X50 (111 plf),
 // governed by the Class B vertical deflection L/1000 (0.75). W12X53 + C15X50 fails it (1.09) and the singly symmetric
 // proportion; a lighter channel (C15X33.9) failed the (former) rail keeper fatigue. Runway seismic mass 2 × 125 ft × 43 plf = 10.8 kip less.
 p.section=loadCappedSection(p.section,'W14X61','C15X50');p.aist!.netFlangeArea=p.section.bf*p.section.tf;
 note('Girder W24X104 + C15X50 → W14X61 + C15X50 (154 → 111 plf; 10.8 kip less runway mass on the building).');
 // Building evaluation data that are not available (frame type, frame service displacements, site seismic, IEBC
 // evaluation, 10-year wind on the braced line) are omitted from this package and listed as by others.
 // The longitudinal bracing is left out of this package for now: the crane longitudinal force goes to the crane-level
 // strut on the girder line, and the strut, collector and braced bay are by the building engineer of record.
 p.longitudinalBracing!.enabled=false;
 note('Longitudinal bracing section removed from this package; the crane-level strut, collector and braced bay are by the building engineer of record.');
 p.omitUnverified=true;
 note('Checks without data (frame type, 10-year wind drift, rail gauge from frame spread, runway seismic, IEBC alteration) omitted from the report and listed as not checked (by others).');
 // One bumper data source throughout: the corrected supplier schedule (the end stop source still named CAP-CS-02).
 p.details!.endStop!.source='Fictitious supplier schedule DEMO-CS-05 rev B: bumper force, bumper centerline height and contact diameter';
 note('Bumper data source: the supplier schedule DEMO-CS-05 rev B (was CAP-CS-02).');
 // One revision identity for the calculation and the drawings (Rev B), with the revision log: Rev A the review issue,
 // Rev B the changes above.
 p.drawing={...p.drawing!,revisions:[{rev:'A',date:'2026-10-09',description:'Issued for review',by:'CC'},
  {rev:'B',date:'2026-10-12',description:'Revised for the review comments; changes in the revision log',by:'CC',changes:[...revBChanges]}]};
 return p;
}

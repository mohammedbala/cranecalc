import type {CalculationSnapshot,CheckResult,ProjectInput} from './types';
import {format} from './units';
import {existingWeldingDemand,weldsToExistingColumn} from './existingWelding';
import {existingColumnSection} from './existingColumn';
import {usesTaperedHaunch} from './taperedHaunch';
import {haunchInput} from './taperedHaunchInputs';
import {usesRolledBracket} from './rolledBracket';
import {rolledStub} from './rolledBracketInputs';
import {railJointType} from './railLayout';
import {runwayBoltingBasis} from './boltingBasis';
import {capAngleGeometry} from './capAngle';
import {activeEndBearing} from './endBearingInputs';

/**
 * One AWS D1.1 edition for the whole package: the 2020 edition, whose clause and table numbers the calculation cites
 * (Table 5.8 prequalified preheat, Clause 8 inspection, Clause 11 existing structures). AISC 360-16 references the
 * 2015 edition (different numbering); the project specifies the 2020 edition.
 */
export const awsEdition='2020';
export const awsCode=`AWS D1.1/D1.1M:${awsEdition}`;
const inch=25.4;

/** The weld metal of the detailed connections: the E70XX (or entered) electrode of every weld check, not the legacy screening value. */
export const weldElectrode=(p:ProjectInput)=>p.details?.material.Fexx??p.connections.Fexx;

/**
 * Preheat for the field welds to the existing column, from the same thickness basis everywhere (report, S-00, the
 * bracket sheet): the thickest part at the point of welding, the AWS D1.1 Table 5.8 Category B minimum for it, and the
 * temperature specified on the drawings, which is a project requirement where it exceeds the table value.
 */
export function preheatBasis(p:ProjectInput){
 if(!weldsToExistingColumn(p))return undefined;
 const w=p.existingColumn!.welding,{t,thickest,need}=existingWeldingDemand(p,existingColumnSection(p).section.tf);
 const specified=w?.preheat,governing=Math.max(need,specified??need),project=specified!==undefined&&specified>need+1e-6;
 const temp=(v:number)=>format(v,'temperature',p.units,0),len=(v:number)=>format(v,'length',p.units,3);
 const range=t<=.75*inch+1e-9?'up to 3/4 in':t<=1.5*inch+1e-9?'over 3/4 in through 1-1/2 in':t<=2.5*inch+1e-9?'over 1-1/2 in through 2-1/2 in':'over 2-1/2 in';
 const text=`preheat and interpass temperature at least ${temp(governing)}${project?' (project requirement)':''}; ${awsCode} Table 5.8, Category B, minimum ${temp(need)} for the thickest part at the weld, ${len(t)} (${thickest.name}; ${range})`;
 return {t,thickest,need,specified,governing,project,text,range};
}

/** Complete-joint-penetration groove welds in this package, by name. */
export function cjpWelds(p:ProjectInput):string[]{
 const d=p.details;if(!d)return [];
 const out:string[]=[];
 if(p.section.kind==='cap'&&p.capDesign?.topStiffenerCjp)out.push('girder bearing stiffeners to the W top flange');
 if(d.bracket?.enabled&&usesTaperedHaunch(p)&&haunchInput(d.bracket).flangeJoint==='cjp')out.push(`haunch flanges to the ${p.existingColumn?.isNew?'new':'existing'} column flange (field)`);
 if(d.bracket?.enabled&&usesRolledBracket(p)&&d.bracket.rolled?.flangeJoint==='cjp'&&rolledStub(d.bracket))out.push('bracket flanges to the column flange');
 return out;
}

export interface ConstructionNote {key:'bolting'|'welding'|'inspection'|'erection'|'tolerances';title:string;items:string[]}
/**
 * Construction and commissioning requirements generated from the calculation (not from free text): bolting,
 * welding, inspection, erection and commissioning, and the runway tolerances. The report's fabrication section and
 * sheet S-00 print these.
 */
export function constructionRequirements(p:ProjectInput):ConstructionNote[]{
 const d=p.details;if(!d)return [];
 const tight=railJointType(p)==='tight',cjp=cjpWelds(p),heat=preheatBasis(p),existing=weldsToExistingColumn(p);
 const bolting=[
  runwayBoltingBasis,
  ...(activeEndBearing(p)||capAngleGeometry(p)?['Bolts in slotted sliding plies are pretensioned against steel sleeves so the slotted ply is not clamped; plate washers cover the slots.']:[]),
  tight?'Rail joints: tight joints, rail ends butted with a gap of 1/16 in or less, staggered across the runway; joint bolts pretensioned in standard holes and re-tightened after 30 and 90 days of crane operation (AIST TR-13 §5.16.1). Thermal movement is taken by keepers that let the rail slide and by the clearance gap at the end stops.'
   :'Rail joints: open joints with the expansion gap shown (project choice); joint bolts re-tightened after 30 and 90 days of crane operation.'];
 const welding=[
  `E70XX low-hydrogen weld metal, ${awsCode}, cyclically loaded provisions (Clause 4 Part C); qualified or prequalified WPS and qualified welders.`,
  ...(existing?[`Field welds to the existing column: base metal confirmed before welding (AISC 360-16 Appendix 5.2.3: mill certificates or chemical analysis), a WPS approved by the engineer of record for that steel, ${heat?heat.text:'preheat per AWS D1.1 Table 5.8'}; weld with the crane out of service (${awsCode} Clause 11). The carbon equivalent is recorded for information; it is not a code limit for prequalified A572 Grade 50 / A992 steel.`]:[])];
 const inspection=[
  'Visual inspection of every weld (AISC 360-16 N5.4) and of every bolted joint; verify pretension and faying surfaces per the RCSC Specification (N5.6).',
  `Runway girder welds${existing?' and the welds to the existing column':''}: ${awsCode} Clause 8 acceptance criteria for cyclically loaded nontubular connections (AIST TR-13 §5.17).`,
  ...(cjp.length?[`100% UT of all CJP groove welds (${cjp.join('; ')}) to the cyclically loaded acceptance criteria of ${awsCode} 8.13.2.`]:[]),
  'MT at the terminations of fillet welds on cyclically loaded details and at repaired welds.',
  'Record the baseline rail and connection condition before commissioning.'];
 const erection=[
  'Provide temporary lateral and torsional restraint of each girder until its ties are complete. Set bearings level and fit bearing stiffeners before welding.',
  'Runway clearance test before the load test (AIST TR-13 §1.5.6.2): crane unloaded, hook fully up, run the crane the full length of the runway three times, with the trolley at each end of the bridge and at center; check the Fig. 1.1 clearances, including the clearance to the roof trusses deflected under snow.',
  ...(p.existingColumn?.enabled&&!p.existingColumn.isNew?['Confirm the crane clearance to the existing roof framing, bracing, lights, piping and other obstructions over the full runway, with the roof framing deflected under snow; report any shortfall to the engineer of record before commissioning.']:[]),
  ...(tight?['Re-tighten the rail joint bolts after 30 and 90 days of crane operation.']:[])];
 const tolerances=[
  'Runway fabrication and erection tolerances (AIST TR-13 §5.18), unless the crane manufacturer requires less:',
  'column base lines ±1/8 in; seat (bearing) plan position and elevation ±1/8 in;',
  'girder sweep 1/4 in per 50 ft; camber +1/4 in / −0 in per 50 ft; bearing-zone flatness ±1/32 in; girder end depth ±1/16 in; adjacent tops of girder flanges within 1/16 in;',
  'rail gauge ±1/4 in at 68 °F; rail line and grade 1/4 in per 50 ft, 3/8 in total; rail eccentricity on the girder web not more than 3/4 of the web thickness.',
  'Survey both rails unloaded after erection and during commissioning: gauge, elevation and straightness at every support and at midspan; submit the survey.'];
 return [{key:'bolting',title:'Bolting',items:bolting},{key:'welding',title:'Welding',items:welding},{key:'inspection',title:'Inspection',items:inspection},
  {key:'erection',title:'Erection and commissioning',items:erection},{key:'tolerances',title:'Runway tolerances',items:tolerances}];
}

/**
 * Sentences of the entered fabrication notes that contradict the generated requirements: snug-tight bolting on the
 * runway, open or sliding rail joints when the joints are tight, placeholder ("demonstration") tolerances, and an
 * inspection note without UT where the package has CJP welds.
 */
export function supersededFabricationNotes(p:ProjectInput):{field:string;sentence:string;reason:string}[]{
 const d=p.details;if(!d)return [];
 const out:{field:string;sentence:string;reason:string}[]=[];
 const tight=railJointType(p)==='tight',cjp=cjpWelds(p).length>0;
 for(const [field,text] of Object.entries(d.fabrication)){
  for(const sentence of text.split(/(?<=\.)\s+/)){
   if(/snug[- ]tight/i.test(sentence))out.push({field,sentence,reason:'snug-tight bolts are not permitted on the runway (AIST TR-13 §5.14)'});
   else if(tight&&/(sliding slots|expansion gap|open joint)/i.test(sentence))out.push({field,sentence,reason:'rail joints are tight joints (AIST TR-13 §5.16.1)'});
   else if(/demonstration tolerance/i.test(sentence))out.push({field,sentence,reason:'tolerances are those of AIST TR-13 §5.18'});
  }
  if(field==='inspection'&&cjp&&!/\bUT\b|ultrason/i.test(text))out.push({field,sentence:text,reason:`no UT is stated for the CJP welds; ${awsCode} cyclically loaded acceptance criteria and 100% UT of CJP welds apply (AIST TR-13 §5.17)`});
 }
 return out;
}
/** The entered fabrication text with the superseded sentences replaced by a pointer to the requirement that governs. */
export function enteredFabricationNote(p:ProjectInput,field:keyof NonNullable<ProjectInput['details']>['fabrication']){
 const d=p.details;if(!d)return '';
 const bad=supersededFabricationNotes(p).filter(v=>v.field===field);
 if(bad.some(v=>v.sentence===d.fabrication[field]))return '';
 return d.fabrication[field].split(/(?<=\.)\s+/).filter(v=>!bad.some(b=>b.sentence===v)).join(' ');
}

/**
 * Entered fabrication notes that contradict the code requirements are an open item (status 'fail') until the
 * project notes are corrected; the drawings and the report print the generated requirements meanwhile.
 */
export function constructionNoteChecks(s:CalculationSnapshot):CheckResult[]{
 const p=s.input;if(!p.details)return [];
 const bad=supersededFabricationNotes(p);
 return [{id:'construction-notes',group:'Coordination',title:'Entered fabrication notes consistent with the bolting, rail-joint, tolerance and inspection requirements',
  status:bad.length?'fail':'pass',equation:'',referenceIds:['tr13-bolting','tr13-rail-joints','tr13-tolerances','aws-d11-cyclic'],
  note:bad.length?`OPEN ITEM: ${bad.length} entered fabrication note${bad.length>1?'s contradict':' contradicts'} the requirements and ${bad.length>1?'are':'is'} superseded on the drawings and in the report: ${bad.map(v=>`${v.field}: "${v.sentence}" (${v.reason})`).join('; ')}. Correct the project fabrication notes.`
   :'The entered fabrication notes agree with the generated bolting, rail-joint, tolerance and inspection requirements.'}];
}

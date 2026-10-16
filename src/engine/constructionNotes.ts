import type {CalculationSnapshot,CheckResult,ProjectInput} from './types';
import {format,noteLength} from './units';
import {existingWeldingDemand,weldsToExistingColumn} from './existingWelding';
import {existingColumnSection} from './existingColumn';
import {usesTaperedHaunch} from './taperedHaunch';
import {haunchInput} from './taperedHaunchInputs';
import {usesRolledBracket} from './rolledBracket';
import {rolledStub} from './rolledBracketInputs';
import {railJointType,railJointDetail,weldedRailJointNote} from './railLayout';
import {runwayBoltingBasis} from './boltingBasis';
import {capAngleGeometry} from './capAngle';
import {activeEndBearing} from './endBearingInputs';
import {bearingSeat,bearingShim,bearingSurface} from './endBearing';
import {flangeTieFamily,stiffenerTieGeometry} from './tieGeometry';

/**
 * One AWS D1.1 edition for the whole package: the 2020 edition, whose clause and table numbers the calculation cites
 * (Table 5.8 prequalified preheat, Clause 8 inspection, Clause 11 existing structures). AISC 360-16 references the
 * 2015 edition (different numbering); the project specifies the 2020 edition.
 */
export const awsEdition='2020';
export const awsCode=`AWS D1.1/D1.1M:${awsEdition}`;
const inch=25.4;

const inches=noteLength;
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
 if(stiffenerTieGeometry(p))out.push('tie gussets to the girder bearing stiffeners');
 if(d.bracket?.enabled&&usesTaperedHaunch(p)&&haunchInput(d.bracket).flangeJoint==='cjp')out.push(`haunch flanges to the ${p.existingColumn?.isNew?'new':'existing'} column flange (field)`);
 if(d.bracket?.enabled&&usesRolledBracket(p)&&d.bracket.rolled?.flangeJoint==='cjp'&&rolledStub(d.bracket))out.push('bracket flanges to the column flange');
 return out;
}

/**
 * Seats whose position and elevation are only known from a survey (existing, by others, field welded to an existing
 * column): the seats are surveyed, the bearings shimmed to the theoretical elevation and the seat holes drilled to the
 * girder as set, so the ±1/8 in seat tolerance (AIST TR-13 §5.18) is not demanded of steel that cannot be shop-located.
 */
function seatSurvey(p:ProjectInput){
 const shim=bearingShim(p),max=shim.max>0?shim.max:inch/2,seat=bearingSeat(p);
 return `Bearing seats (${seat==='by-others'?'by others':seat==='existing'?'existing brackets':'field welded'}): survey the seats; shim to the theoretical elevation (steel shims, full bearing, ${shim.plies||3} plies and ${inches(max,p.units)} max., drilled to the bolt pattern); field drill or ream the seat holes after the girder is lined and leveled.`;
}
/** Faying surfaces of the bolted bearings: the plate-to-seat interface the locating slip passes through. */
function bearingFaying(p:ProjectInput){
 return bearingSurface(p)==='A'?'Bolted bearings: Class A faying surfaces (slip coefficient 0.30) at the bearing plate, shims and seat; clean paint, loose scale and oil off the seat at the bearing.'
  :'Bolted bearings: Class B faying surfaces (blast-cleaned, slip coefficient 0.50) at the girder flange, bearing plate and shop-welded seat.';
}
/** Field sequence of a top-flange tie with a slotted column gusset: the gusset is set to the girder as erected, not to the theoretical column face. */
const tieSequence='Top-flange ties: bearing bolts first; set, line and level the girder; bolt the bars to the girder gusset; fit the column gusset (cut to suit) between the bars, sleeves centered in the slots; tack it, weld out (bars removed where access needs it), reinstall and pretension.';

export interface ConstructionNote {key:'bolting'|'welding'|'inspection'|'erection'|'tolerances';title:string;items:string[]}
/**
 * Construction and commissioning requirements generated from the calculation (not from free text): bolting,
 * welding, inspection, erection and commissioning, and the runway tolerances. The report's fabrication section and
 * sheet S-00 print these.
 */
export function constructionRequirements(p:ProjectInput):ConstructionNote[]{
 const d=p.details;if(!d)return [];
 const joint=railJointDetail(p),floating='The rail floats in its clips between the end stops, which anchor it; the clearance gaps at the stops take its thermal movement.';
 const tight=railJointType(p)==='tight',cjp=cjpWelds(p),haunchCjp=!!d.bracket?.enabled&&usesTaperedHaunch(p)&&haunchInput(d.bracket).flangeJoint==='cjp',onExisting=!(p.existingColumn?.isNew&&p.existingColumn.enabled),heat=preheatBasis(p),existing=weldsToExistingColumn(p);
 const bolting=[
  runwayBoltingBasis,
  ...(activeEndBearing(p)||capAngleGeometry(p)?['Bolts in slotted sliding plies are pretensioned against steel sleeves so the slotted ply is not clamped; plate washers cover the slots.']:[]),
  ...(activeEndBearing(p)?[bearingFaying(p)]:[]),
  // Rail joints by the layout and the joint kind: bolted joint bars here; welded joints under welding; none for one-piece rails.
  ...(joint!=='bars'?[]:[tight?'Rail joints: tight joints, rail ends butted with a gap of 1/16 in or less, staggered across the runway; joint bolts pretensioned in standard holes and re-tightened after 30 and 90 days of crane operation (AIST TR-13 §5.16.1). The rail floats in its clips between the end stops, which anchor it; the clearance gaps at the stops take its thermal movement.'
   :'Rail joints: open joints with the expansion gap shown (project choice); joint bolts re-tightened after 30 and 90 days of crane operation.'])];
 const welding=[
  `E70XX low-hydrogen weld metal, ${awsCode}, cyclically loaded provisions (Clause 4 Part C); qualified or prequalified WPS and qualified welders.`,
  ...(joint==='welded'?[`${weldedRailJointNote} ${floating}`]:[]),
  ...(existing?[`Field welds to the existing column: base metal confirmed before welding (AISC 360-16 Appendix 5.2.3: mill certificates or chemical analysis), a WPS approved by the engineer of record for that steel, ${heat?heat.text:'preheat per AWS D1.1 Table 5.8'}; weld with the crane out of service (${awsCode} Clause 11).`]:[]),
  ...(haunchCjp?[`Haunch flange CJPs to the column flange: single-bevel groove on the haunch flange, on steel backing, welded through weld access holes in the haunch web (AISC 360-16 J1.6); backing removed, root backgouged and rewelded, reinforcing fillet (${awsCode}, cyclically loaded T-joints). Details on the haunch sheet.`]:[])];
 const inspection=[
  'Visual inspection of every weld (AISC 360-16 N5.4) and of every bolted joint; verify pretension and faying surfaces per the RCSC Specification (N5.6).',
  `Runway girder welds${existing?' and the welds to the existing column':''}: ${awsCode} Clause 8 acceptance criteria for cyclically loaded nontubular connections (AIST TR-13 §5.17).`,
  ...(cjp.length?[`100% UT of all CJP groove welds (${cjp.join('; ')}) to the cyclically loaded acceptance criteria of ${awsCode} 8.13.2.`]:[]),
  ...(haunchCjp&&onExisting?['UT of the existing column flange for laminations under the haunch flange CJP welds before welding (the flange is loaded through its thickness).']:[]),
  'MT at the terminations of fillet welds on cyclically loaded details and at repaired welds.',
  'Record the baseline rail and connection condition before commissioning.'];
 const erection=[
  ...(joint==='none'?[`Rail: each rail is one piece, no rail joint. ${tight?floating:'An anchor clip pair at mid-length holds it (rail layout); it moves thermally from there toward the stops.'}`]:[]),
  'Provide temporary lateral and torsional restraint of each girder until its ties are complete. Set bearings level and fit bearing stiffeners before welding.',
  ...(activeEndBearing(p)&&bearingSeat(p)!=='shop'?[seatSurvey(p)]:[]),
  ...(flangeTieFamily(d)&&d.brace.release?.enabled&&(d.bracket?.enabled||p.existingColumn?.enabled||d.brace.flangeAttachment?.columnFace!==undefined)?[tieSequence]:[]),
  // One clearance note: in an existing building the test also covers the existing framing and services.
  `Runway clearance test before the load test (AIST TR-13 §1.5.6.2): crane unloaded, hook fully up, run the crane the full length of the runway three times, with the trolley at each end of the bridge and at center; check the Fig. 1.1 clearances, including the clearance to the roof trusses deflected under snow${p.existingColumn?.enabled&&!p.existingColumn.isNew?', and to the existing roof framing, bracing, lights, piping and other obstructions; report any shortfall to the engineer of record before commissioning':''}.`];
 // (Re-tightening of the rail joint bolts after 30 and 90 days is stated once, with the rail joints under bolting.)
 const tolerances=[
  'Runway fabrication and erection tolerances (AIST TR-13 §5.18), unless the crane manufacturer requires less:',
  activeEndBearing(p)&&bearingSeat(p)!=='shop'?'column base lines ±1/8 in; seats surveyed and shimmed, holes drilled to the set girder (in place of the ±1/8 in seat position and elevation);':'column base lines ±1/8 in; seat (bearing) plan position and elevation ±1/8 in;',
  'girder sweep 1/4 in per 50 ft; camber +1/4 in / −0 in per 50 ft; bearing-zone flatness ±1/32 in; girder end depth ±1/16 in; adjacent tops of girder flanges within 1/16 in;',
  'rail gauge ±1/4 in at 68 °F; rail line and grade 1/4 in per 50 ft, 3/8 in total;',
  // The service limit and the design value are stated separately: the design may take a larger eccentricity than the
  // TR-13 service limit (conservative), but never calls the limit its design value.
  `rail centerline set on the girder web centerline within ${inches(d.criteria.alignmentTolerance,p.units)}, and the rail eccentricity in service not more than ${inches(Math.min(Math.abs(p.railEccentricity),.75*p.section.tw),p.units)} (${Math.abs(p.railEccentricity)<=.75*p.section.tw+1e-6?`the design eccentricity, within the AIST TR-13 §5.18 limit of 3/4 of the web thickness, ${inches(.75*p.section.tw,p.units)}`:`the AIST TR-13 §5.18 limit of 3/4 of the web thickness; the design takes a larger eccentricity, ${inches(Math.abs(p.railEccentricity),p.units)}, which is conservative`}).`,
  'Survey both rails unloaded after erection, before the load test and during commissioning: gauge, line, elevation and straightness at every support and at midspan; submit the survey.'];
 return [{key:'bolting',title:'Bolting',items:bolting},{key:'welding',title:'Welding',items:welding},{key:'inspection',title:'Inspection',items:inspection},
  {key:'erection',title:'Erection and commissioning',items:erection},{key:'tolerances',title:'Runway tolerances',items:tolerances}];
}

const stem=(w:string)=>w.replace(/(ed|ing|s)$/,'');
const noteWords=(v:string)=>new Set((v.toLowerCase().match(/[a-z0-9.§]+/g)??[]).filter(w=>w.length>2&&!['the','and','are','for','with','after','before','where','that','this','per','its'].includes(w)).map(stem));
const sentencesOf=(v:string)=>v.split(/(?<=[.;:])\s+(?=[A-Z])/).map(t=>t.trim()).filter(Boolean);
/**
 * Entered sentences that add to what is already written: a sentence is left out when one written sentence already
 * holds most of its words (a note says a thing once).
 */
export function addedSentences(text:string,written:string[],together=false){
 // together: the written text is one statement (a materials table), its words read as a whole
 const said=together?[noteWords(written.join(' '))]:written.flatMap(sentencesOf).map(noteWords);
 return sentencesOf(text).filter(v=>{const w=[...noteWords(v)];return w.length&&said.every(g=>w.filter(x=>g.has(x)).length/w.length<.6);});
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
 return [{id:'construction-notes',group:'Coordination',title:'Fabrication notes consistent with the bolting, rail-joint, tolerance and inspection requirements',
  status:bad.length?'fail':'pass',equation:'',referenceIds:['tr13-bolting','tr13-rail-joints','tr13-tolerances','aws-d11-cyclic'],
  note:bad.length?`OPEN ITEM: ${bad.length} entered fabrication note${bad.length>1?'s contradict':' contradicts'} the requirements and ${bad.length>1?'are':'is'} superseded on the drawings and in the report: ${bad.map(v=>`${v.field}: "${v.sentence}" (${v.reason})`).join('; ')}. Correct the project fabrication notes.`
   :'The project fabrication notes agree with the bolting, rail-joint, tolerance and inspection requirements of this calculation.'}];
}

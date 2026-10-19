import type {CalculationSnapshot,ProjectInput} from './types';
import {tiedToBuilding} from './craneColumnInputs';
import {girderSegments} from './simpleSupports';
import {columnBaseElevation} from './columnBaseInputs';
import {railTopAboveSteel} from './railSeat';
import {girderPieces} from './spliceInputs';

/**
 * Runway elevations above the floor datum, from project data only: the
 * surveyed column seat when the existing column is checked, the seat above
 * the new column's base plate on its footing, otherwise the entered
 * top-of-rail elevation. The 3D reference building is never used. The top of rail is above the top of
 * steel by the rail and any rail pad under it.
 */
export function runwayElevations(p:ProjectInput){
 const datum=p.drawing?.datumElevation??0,cap=p.section.kind==='cap'?p.section.capTw:0,bearing=p.details?.bearing.thickness??0,c=p.existingColumn;
 if(c?.enabled){
  const designedBase=c.isNew&&p.columnBase?.enabled,seat=datum+(designedBase?columnBaseElevation(p.columnBase!):0)+c.seatElevation,tos=seat+bearing+p.section.d;
  return {source:designedBase?'new column base' as const:'surveyed column seat' as const,datum,seat,tos,tor:tos+cap+railTopAboveSteel(p)};
 }
 if(p.drawing?.railElevation){const tor=datum+p.drawing.railElevation,tos=tor-railTopAboveSteel(p)-cap;return {source:'entered top of rail' as const,datum,seat:tos-p.section.d-bearing,tos,tor};}
 return undefined;
}

/**
 * The codes cited on the package. The calculation applies AISC 360-16 and ASCE 7-16; where the jurisdiction
 * adopts the 2022 editions, the engineer of record confirms the review before the package is issued.
 */
export function codeBasis(p:ProjectInput){
 const c=p.drawing?.code,adopted2022=c?.editions==='2022';
 return {building:c?.building.trim()||'NOT ENTERED: STATE THE IBC / IEBC EDITION ADOPTED BY THE AUTHORITY HAVING JURISDICTION',entered:!!c?.building.trim(),adopted2022,
  asce:adopted2022?'7-22 ADOPTED: §4.9 CRANE LOADS AND §2.3/§2.4 COMBINATIONS AS APPLIED FROM 7-16, REVIEWED BY THE EOR':'2016 (§4.9 UNCHANGED IN 7-22): CRANE LOADS, COMBINATIONS',
  aisc:adopted2022?'360-22 ADOPTED: CALCULATED TO 360-16 PROVISIONS, REVIEWED BY THE EOR FOR 360-22':'2016: STEEL DESIGN'};
}

/** Excluded checks that are delegated components (brackets and attachments by a bracket designer), listed as deferred submittals. */
export const delegatedChecks=new Set(['bracket-load-path','tie-move-support','end-bearing-seat']);
/** Excluded checks of the rail supplier's joint bars and bolts: new runway parts by the rail supplier, a deferred submittal. */
export const supplierJointCheck=(id:string)=>/^rail-joint-/.test(id);
/** Structure the calculation does not check, which the engineer of record evaluates for the permit submittal. */
export const unevaluatedStructure=(s:CalculationSnapshot)=>s.checks.filter(c=>c.status==='excluded'&&!delegatedChecks.has(c.id)&&!supplierJointCheck(c.id));
/**
 * A sheet is issued only for a validated project package with an engineer of record, an issue purpose, the
 * adopted code and, where the calculation leaves structure unchecked, a reference to the engineer's evaluation.
 */
/**
 * The one revision identity of the calculation and the drawings: the last entered revision (letter and date) when the
 * project records revisions, else the calculation date. The content fingerprint (s.revision) is printed once, small,
 * as the calc fingerprint; the letter is what the report header, the drawing title blocks and the file names carry.
 */
export function revisionIdentity(s:CalculationSnapshot){
 const list=(s.input.drawing?.revisions??[]).filter(r=>r.rev.trim()),last=list[list.length-1];
 const created=/^\d{4}-\d{2}-\d{2}/.exec(s.createdAt)?.[0]??'';
 return {letter:last?.rev.trim(),date:last?.date.trim()||created,fingerprint:s.revision,label:last?`Rev ${last.rev.trim()}`:`Calc ${s.revision}`,
  /** The label in capitals for page headers and title blocks; the fingerprint keeps its lower-case hex. */
  heading:last?`REV ${last.rev.trim().toUpperCase()}`:`CALC ${s.revision}`,revisions:list};
}
export function issueStatus(s:CalculationSnapshot){
 const p=s.input,d=p.drawing,eor=d?.eor,reasons:string[]=[];
 // Members beyond the configurator's catalog (configuratorOpenItems): open items named on every status line.
 const beyond=s.checks.filter(c=>/^configurator-(girder|tie|crane-column)$/.test(c.id)&&c.status!=='pass').map(c=>`Open item: ${c.title}`);
 // Parts that cannot be built as dimensioned (checkIntegrity.ts): the sheets draw them GEOMETRY CONFLICT - NOT DETAILED.
 const conflicts=s.geometryConflicts??s.checks.filter(c=>c.geometry).map(c=>({id:c.id,title:c.title}));
 const geometry=conflicts.length?[`Geometry conflict: ${conflicts.map(c=>c.title).join('; ')}`]:[];
 // A supplied-load analysis designs nothing: its sheets record the geometry analyzed and the interface requirements.
 if(p.scope==='analysis')return {issued:false,label:'ANALYSIS ONLY - NOT FOR CONSTRUCTION',reasons:['Supplied-load girder analysis: no girder, connection or support design',...(p.reportPurpose==='demonstration'?['fictitious demonstration data']:[]),...geometry]};
 if(p.reportPurpose==='demonstration')return {issued:false,label:'DEMONSTRATION - NOT FOR CONSTRUCTION',reasons:['Fictitious demonstration data',...beyond,...geometry]};
 if(!s.eligible)reasons.push('Resolve blocking inputs and models',...beyond);
 const failed=s.checks.filter(c=>c.status==='fail').length;if(failed)reasons.push(`Resolve ${failed} failed check${failed>1?'s':''}`);
 reasons.push(...geometry);
 if(!(eor?.name.trim()&&eor.firm.trim()&&eor.license.trim()))reasons.push('Enter the engineer of record, firm and license');
 if(!d?.issue||d.issue==='preliminary')reasons.push('Select an issue purpose');
 if(!d?.code?.building.trim())reasons.push('Enter the building code adopted by the jurisdiction');
 else if(d.code.editions==='2022'&&!d.code.reviewed)reasons.push('Confirm the engineer of record has reviewed this design against AISC 360-22 and ASCE 7-22');
 if(unevaluatedStructure(s).length&&!d?.existingEvaluation?.trim())reasons.push('Reference the engineer of record\'s evaluation of the structure not checked by this calculation');
 if(reasons.length)return {issued:false,label:'PRELIMINARY - NOT FOR CONSTRUCTION',reasons};
 return {issued:true,label:d!.issue==='permit'?'ISSUED FOR PERMIT':'ISSUED FOR CONSTRUCTION',reasons};
}

/**
 * Runway girder marks: girders of one section, length and end arrangement share
 * a mark. Both runways are identical, so each piece is furnished twice.
 */
export function girderMarks(p:ProjectInput){
 const segments=girderSegments(p),last=segments.length-1,marks:{mark:string;length:number;key:string}[]=[];
 // A spliced girder is furnished in pieces between its ends and its field splices, each piece marked.
 const pieces=girderPieces(p);
 return pieces.map(piece=>{
  const i=piece.segment,g=segments[i],length=piece.end-piece.start,ends=p.system==='continuous'?'continuous':i===0&&i===last?'single':i===0?'first':i===last?'last':'interior';
  const key=`${Math.round(length)}|${ends}|${piece.left}|${piece.right}`;let m=marks.find(v=>v.key===key);
  if(!m){m={mark:`RG${marks.length+1}`,length,key};marks.push(m);}
  return {...g,start:piece.start,end:piece.end,mark:m.mark,length,ends,...(piece.leftSplice!==undefined?{leftSplice:piece.leftSplice}:{}),...(piece.rightSplice!==undefined?{rightSplice:piece.rightSplice}:{})};
 });
}

/**
 * The column the runway bears on, as the drawings name it: a new column designed here is shop welded and,
 * when its base is designed, `detailed` on the new-column details; otherwise the existing column is field
 * welded and verified in the field. The drawings add the detail reference to a detailed column.
 */
export function supportColumn(p:ProjectInput){
 const c=p.existingColumn,isNew=!!(c?.enabled&&c.isNew),detailed=isNew&&!!p.columnBase?.enabled&&!!p.details;
 const name=isNew?`NEW ${c!.shape||'BUILT-UP'} COLUMN`:'EXISTING COLUMN';
 return {isNew,detailed,name,reference:isNew?name:'EXISTING COLUMN (REF.)',weld:isNew?'SHOP WELD':'FIELD WELD',field:!isNew};
}
/**
 * The column the girder top-flange tie lands on, as the tie details name it: on a crane column tied to the building
 * (tiedToBuilding) the existing building column beside it (field welded or field drilled, drawn dashed, the S-00 existing
 * building notes), not the new crane column the girder bears on; otherwise the supporting column (supportColumn).
 */
export function tieReceiverColumn(p:ProjectInput){
 if(!tiedToBuilding(p))return {...supportColumn(p),building:false};
 const name=`(E) ${p.craneColumn!.building.shape||'BUILT-UP'} BUILDING COLUMN`;
 return {isNew:false,detailed:false,name,reference:`${name} (REF.)`,weld:'FIELD WELD',field:true,building:true};
}

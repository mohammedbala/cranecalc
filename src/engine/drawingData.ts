import type {CalculationSnapshot,ProjectInput} from './types';
import {girderSegments} from './simpleSupports';
import {columnBaseElevation} from './columnBaseInputs';

/**
 * Runway elevations above the floor datum, from project data only: the
 * surveyed column seat when the existing column is checked, the seat above
 * the new column's base plate on its footing, otherwise the entered
 * top-of-rail elevation. The 3D reference building is never used.
 */
export function runwayElevations(p:ProjectInput){
 const datum=p.drawing?.datumElevation??0,cap=p.section.kind==='cap'?p.section.capTw:0,bearing=p.details?.bearing.thickness??0,c=p.existingColumn;
 if(c?.enabled){
  const designedBase=c.isNew&&p.columnBase?.enabled,seat=datum+(designedBase?columnBaseElevation(p.columnBase!):0)+c.seatElevation,tos=seat+bearing+p.section.d;
  return {source:designedBase?'new column base' as const:'surveyed column seat' as const,datum,seat,tos,tor:tos+cap+p.railHeight};
 }
 if(p.drawing?.railElevation){const tor=datum+p.drawing.railElevation,tos=tor-p.railHeight-cap;return {source:'entered top of rail' as const,datum,seat:tos-p.section.d-bearing,tos,tor};}
 return undefined;
}

/**
 * The codes cited on the package. The calculation applies AISC 360-16 and ASCE 7-16; where the jurisdiction
 * adopts the 2022 editions, the engineer of record confirms the review before the package is issued.
 */
export function codeBasis(p:ProjectInput){
 const c=p.drawing?.code,adopted2022=c?.editions==='2022';
 return {building:c?.building.trim()||'AS ADOPTED BY THE AUTHORITY HAVING JURISDICTION',adopted2022,
  asce:adopted2022?'7-22 ADOPTED: §4.9 CRANE LOADS AND §2.3/§2.4 COMBINATIONS AS APPLIED FROM 7-16, REVIEWED BY THE EOR':'2016 (§4.9 UNCHANGED IN 7-22): CRANE LOADS, COMBINATIONS',
  aisc:adopted2022?'360-22 ADOPTED: CALCULATED TO 360-16 PROVISIONS, REVIEWED BY THE EOR FOR 360-22':'2016: STEEL DESIGN'};
}

/** A sheet is issued only for a validated project package with an engineer of record, an issue purpose and the adopted code. */
export function issueStatus(s:CalculationSnapshot){
 const p=s.input,d=p.drawing,eor=d?.eor,reasons:string[]=[];
 if(p.reportPurpose==='demonstration')return {issued:false,label:'DEMONSTRATION - NOT FOR CONSTRUCTION',reasons:['Fictitious demonstration data']};
 if(!s.eligible)reasons.push('Resolve blocking inputs and models');
 const failed=s.checks.filter(c=>c.status==='fail').length;if(failed)reasons.push(`Resolve ${failed} failed check${failed>1?'s':''}`);
 if(!(eor?.name.trim()&&eor.firm.trim()&&eor.license.trim()))reasons.push('Enter the engineer of record, firm and license');
 if(!d?.issue||d.issue==='preliminary')reasons.push('Select an issue purpose');
 if(!d?.code?.building.trim())reasons.push('Enter the building code adopted by the jurisdiction');
 else if(d.code.editions==='2022'&&!d.code.reviewed)reasons.push('Confirm the engineer of record has reviewed this design against AISC 360-22 and ASCE 7-22');
 if(reasons.length)return {issued:false,label:'PRELIMINARY - NOT FOR CONSTRUCTION',reasons};
 return {issued:true,label:d!.issue==='permit'?'ISSUED FOR PERMIT':'ISSUED FOR CONSTRUCTION',reasons};
}

/**
 * Runway girder marks: girders of one section, length and end arrangement share
 * a mark. Both runways are identical, so each piece is furnished twice.
 */
export function girderMarks(p:ProjectInput){
 const segments=girderSegments(p),last=segments.length-1,marks:{mark:string;length:number;key:string}[]=[];
 return segments.map((g,i)=>{
  const length=g.end-g.start,ends=p.system==='continuous'?'continuous':i===0&&i===last?'single':i===0?'first':i===last?'last':'interior';
  const key=`${Math.round(length)}|${ends}`;let m=marks.find(v=>v.key===key);
  if(!m){m={mark:`RG${marks.length+1}`,length,key};marks.push(m);}
  return {...g,mark:m.mark,length,ends};
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

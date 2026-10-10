import type {CalculationSnapshot,ProjectInput} from './types';
import {girderSegments} from './simpleSupports';

/**
 * Runway elevations above the floor datum, from project data only: the
 * surveyed column seat when the existing column is checked, otherwise the
 * entered top-of-rail elevation. The 3D reference building is never used.
 */
export function runwayElevations(p:ProjectInput){
 const datum=p.drawing?.datumElevation??0,cap=p.section.kind==='cap'?p.section.capTw:0,bearing=p.details?.bearing.thickness??0;
 if(p.existingColumn?.enabled){const seat=datum+p.existingColumn.seatElevation,tos=seat+bearing+p.section.d;return {source:'surveyed column seat' as const,datum,seat,tos,tor:tos+cap+p.railHeight};}
 if(p.drawing?.railElevation){const tor=datum+p.drawing.railElevation,tos=tor-p.railHeight-cap;return {source:'entered top of rail' as const,datum,seat:tos-p.section.d-bearing,tos,tor};}
 return undefined;
}

/** A sheet is issued only for a validated project package with an engineer of record and an issue purpose. */
export function issueStatus(s:CalculationSnapshot){
 const p=s.input,d=p.drawing,eor=d?.eor,reasons:string[]=[];
 if(p.reportPurpose==='demonstration')return {issued:false,label:'DEMONSTRATION - NOT FOR CONSTRUCTION',reasons:['Fictitious demonstration data']};
 if(!s.eligible)reasons.push('Resolve blocking inputs and models');
 const failed=s.checks.filter(c=>c.status==='fail').length;if(failed)reasons.push(`Resolve ${failed} failed check${failed>1?'s':''}`);
 if(!(eor?.name.trim()&&eor.firm.trim()&&eor.license.trim()))reasons.push('Enter the engineer of record, firm and license');
 if(!d?.issue||d.issue==='preliminary')reasons.push('Select an issue purpose');
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

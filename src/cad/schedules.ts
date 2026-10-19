/**
 * Schedules generated from the design model (Revit-style): runway members, bolt groups and welds, as rows for
 * live tables on a drawing. Tables placed with SCHEDULE keep the rows they were made from, so a design change
 * refreshes the cells the user left alone and flags those the user overrode.
 */
import type {CalculationSnapshot} from '../engine/types';
import {girderMarks} from '../engine/drawingData';
import {weldElectrode} from '../engine/constructionNotes';
import {dimensionLength,electrodeClass,plateInches} from '../components/drawingFormat';

export type ScheduleKind='members'|'bolts'|'welds';
export interface Schedule{title:string;header:string[];rows:string[][]}
export type Schedules=Record<ScheduleKind,Schedule>;
export const scheduleTitles:Record<ScheduleKind,string>={members:'MEMBER SCHEDULE',bolts:'BOLT SCHEDULE',welds:'WELD SCHEDULE'};

/** The three schedules of a calculated design (rows may be empty when the design has no detailed connections). */
export function schedules(s:CalculationSnapshot):Schedules{
 const p=s.input,u=p.units,d=p.details,len=(mm:number)=>dimensionLength(mm,u),size=(mm:number)=>plateInches(mm,u),dia=(mm:number)=>u==='US'?`${plateInches(mm,u)} DIA.`:`M${Math.round(mm)}`;
 // Members: the girder marks (both runways), the rail and the cap channel.
 const marks=new Map<string,{n:number;length:number;ends:string}>();
 for(const g of girderMarks(p)){const m=marks.get(g.mark);if(m)m.n+=2;else marks.set(g.mark,{n:2,length:g.length,ends:g.ends});}
 const members:string[][]=[...marks].map(([mark,m])=>[mark,'RUNWAY GIRDER',p.section.name||(p.section.kind==='welded'?'WELDED PLATE GIRDER':'GIRDER'),String(m.n),len(m.length),m.ends.toUpperCase()]);
 const total=p.spans.reduce((a,v)=>a+v,0);
 if(d?.rail)members.push(['CR','CRANE RAIL',d.rail.name||'RAIL','2',len(total),'']);
 if(p.section.kind==='cap')members.push(['CC','CAP CHANNEL',`C ${len(p.section.capDepth)} CAP`,String(2*marks.size),len(total),'']);
 const col=p.existingColumn;if(col?.enabled)members.push(['COL',col.isNew?'NEW COLUMN':'EXISTING COLUMN',col.shape||'BUILT-UP','',col.isNew?'':'VERIFY IN FIELD','']);
 // Bolt groups by joint: diameter, grade and quantity where the design fixes one.
 const bolts:string[][]=[];
 if(d){
  const eb=d.endBearing;
  if(eb?.enabled)bolts.push(['GIRDER END BEARINGS',dia(eb.bolts.diameter),eb.bolts.grade,'','SLOTTED (SLIDING PLY)']);
  else bolts.push(['GIRDER END CONNECTIONS',dia(d.end.diameter),d.end.grade,String(d.end.rows*2),'STANDARD']);
  if(d.brace?.connection)bolts.push(['TIE CONNECTIONS',dia(d.brace.connection.diameter),d.brace.connection.grade,String(d.brace.connection.rows*2),'STANDARD']);
  const sp=d.splices;if(sp?.enabled)bolts.push(['GIRDER FIELD SPLICES',dia(sp.diameter),sp.grade,'','STANDARD, SLIP CRITICAL CLASS '+(sp.surface??'A')]);
 }
 // Welds: the detailed fillet sizes with the electrode.
 const welds:string[][]=[];
 if(d){
  const e=electrodeClass(weldElectrode(p),u);
  welds.push(['GIRDER END CONNECTION PLATES','FILLET',size(d.end.weldSize),len(d.end.weldLength),e]);
  if(d.brace?.connection)welds.push(['TIE CONNECTION PLATES','FILLET',size(d.brace.connection.weldSize),len(d.brace.connection.weldLength),e]);
  if(d.bearing?.weldSize)welds.push(['BEARING STIFFENERS','FILLET',size(d.bearing.weldSize),'BOTH SIDES',e]);
  if(p.section.kind==='cap'&&p.capDesign?.weldSize)welds.push(['CAP CHANNEL TO GIRDER','FILLET',size(p.capDesign.weldSize),p.capDesign.continuousWelds?'CONTINUOUS':'INTERMITTENT',e]);
  const clip=d.rail?.clip;if(clip?.type==='weld-on')welds.push(['RAIL CLIP BASES','FILLET',size(clip.weld),len(clip.weldLength),e]);
 }
 return {members:{title:scheduleTitles.members,header:['MARK','MEMBER','SECTION','QTY','LENGTH','ENDS'],rows:members},
  bolts:{title:scheduleTitles.bolts,header:['JOINT','DIAMETER','GRADE','QTY','HOLES'],rows:bolts},
  welds:{title:scheduleTitles.welds,header:['LOCATION','TYPE','SIZE','LENGTH','ELECTRODE'],rows:welds}};
}
/** A schedule's cells: its title row, the header and the rows. */
export const scheduleCells=(sc:Schedule)=>[[sc.title,...sc.header.slice(1).map(()=>'')],sc.header,...sc.rows];

export interface Refresh{cells:string[][];generated:string[][];overridden:number;changed:number}
/** New generated cells applied to a table: cells the user left alone follow; overrides stay and are counted when the design moved under them. */
export function refreshCells(cells:string[][],generated:string[][]|undefined,next:string[][]):Refresh{
 let overridden=0,changed=0;
 const out=next.map((row,i)=>row.map((v,j)=>{
  const was=generated?.[i]?.[j],cur=cells[i]?.[j];
  if(was===undefined||cur===undefined||cur===was){if(cur!==undefined&&cur!==v)changed++;return v;}
  if(was!==v)overridden++;return cur;
 }));
 return {cells:out,generated:next,overridden,changed};
}

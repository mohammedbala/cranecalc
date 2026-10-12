import type {CheckResult,ProjectInput} from './types';
import {bracketSeat} from './rolledBracketInputs';
import type {ExistingLineInput} from './existingColumnInputs';
import type {BracingSystemResult} from './newColumnBracing';
import {girderOffset} from './newColumnBracing';
import {existingColumnSection} from './existingColumn';
import {format} from './units';
import {latexNumber,withinLimit} from './math';

/**
 * Plan layout of the surveyed existing building beside new freestanding runway columns, and the clear distances
 * from the new runway steel and footings to it. Plan coordinates in mm: x along the runway from grid 1, u across it
 * from the runway grid line, positive away from the crane span (outboard). Every box is axis-aligned.
 */
export type RunwayLine='A'|'B';
export interface PlanBox{x0:number;x1:number;u0:number;u1:number}
const box=(x:number,u:number,along:number,across:number):PlanBox=>({x0:x-along/2,x1:x+along/2,u0:u-across/2,u1:u+across/2});
/** Least clear distance between two boxes in plan; negative is the overlap still to be removed. */
export function planClear(a:PlanBox,b:PlanBox){
 const dx=Math.max(b.x0-a.x1,a.x0-b.x1),du=Math.max(b.u0-a.u1,a.u0-b.u1);
 return dx>0&&du>0?Math.hypot(dx,du):Math.max(dx,du);
}
export interface ExistingColumnPlan{x:number;column:PlanBox;footing?:PlanBox}
export interface ExistingLinePlan{line:RunwayLine;input:ExistingLineInput;columns:ExistingColumnPlan[]}
export interface ClearancePair{line:RunwayLine;grid:number;existing:number;clear:number;from:PlanBox;to:PlanBox;part:string}
export interface ExistingLayout{
 lines:ExistingLinePlan[];
 /** The new runway at one grid line: columns, footings and the girder band. */
 grids:number[];columns:PlanBox[];footings:PlanBox[];brackets:PlanBox[];girder:PlanBox;
 steel?:ClearancePair;footing?:ClearancePair;
 /** Lines without an entered existing footing size. */
 unknownFootings:RunwayLine[];
 footingClear:number;source:string;
}
/** The surveyed existing building beside new freestanding columns, when it is entered. */
export function adjacentBuilding(p:ProjectInput){
 const c=p.existingColumn,a=c?.adjacent;
 return c?.enabled&&c.isNew&&p.columnBase?.enabled&&a?.enabled&&(a.A||a.B)?a:undefined;
}
/** Input errors of the surveyed existing building layout. */
export function validateAdjacentBuilding(p:ProjectInput):string[]{
 const a=p.existingColumn?.adjacent;if(!a?.enabled)return [];
 return (['A','B'] as const).flatMap(line=>{const e=a[line];return e&&e.spacing>0&&e.spacing<600?[`existingColumn.adjacent.${line}.spacing: enter the existing column spacing, or zero for an existing column at every runway grid.`]:[];});
}
/** Plan layout and least clear distances; undefined when no existing building is entered. */
export function existingLayout(p:ProjectInput):ExistingLayout|undefined{
 const a=adjacentBuilding(p);if(!a)return undefined;
 const column=existingColumnSection(p).section,base=p.columnBase!,ft=base.footing,br=p.details?.bracket?.enabled?p.details.bracket:undefined;
 const grids=p.spans.reduce((list,v)=>[...list,list.at(-1)!+v],[0]),length=grids.at(-1)!;
 // The new column's depth runs across the runway; its footing is concentric, L across and B along.
 const columns=grids.map(x=>box(x,0,column.bf,column.d)),footings=grids.map(x=>box(x,0,ft.B,ft.L));
 const brackets=br?grids.map(x=>({x0:x-bracketSeat(br).length/2,x1:x+bracketSeat(br).length/2,u0:-column.d/2-br.seatProjection,u1:-column.d/2})):[];
 const g=girderOffset(p),gw=Math.max(p.section.bf,p.section.kind==='cap'?p.section.capWidth:0),girder={x0:0,x1:length,u0:-g-gw/2,u1:-g+gw/2};
 // Existing columns near enough to matter: within reach of the runway's new footings and steel along it.
 const lines:ExistingLinePlan[]=[];
 for(const line of ['A','B'] as const){
  const e=a[line];if(!e)continue;
  const reach=Math.max(ft.B,column.bf)/2+Math.max(e.footing.B,e.bf)/2+300;
  const stations=e.spacing>0?(()=>{const out:number[]=[];const k0=Math.ceil((-reach-e.start)/e.spacing-1e-9);for(let k=k0;out.length<60;k++){const x=e.start+k*e.spacing;if(x>length+reach)break;out.push(x);}return out;})():grids.map(x=>x+e.start);
  lines.push({line,input:e,columns:stations.map(x=>({x,column:box(x,e.offset,e.bf,e.d),footing:e.footing.L>0&&e.footing.B>0?box(x,e.offset,e.footing.B,e.footing.L):undefined}))});
 }
 let steel:ClearancePair|undefined,footing:ClearancePair|undefined;
 // Ties go to the grid nearest the middle of the runway, where the drawing has room for the dimensions.
 const better=(next:ClearancePair,best?:ClearancePair)=>!best||next.clear<best.clear-.5||(Math.abs(next.clear-best.clear)<=.5&&Math.abs(grids[next.grid]-length/2)<Math.abs(grids[best.grid]-length/2)-1);
 for(const l of lines)l.columns.forEach((e,j)=>grids.forEach((_,i)=>{
  const parts:[string,PlanBox][]=[['column',columns[i]],...(brackets[i]?[['bracket',brackets[i]] as [string,PlanBox]]:[]),['girder',girder]];
  for(const [part,b] of parts){const pair={line:l.line,grid:i,existing:j,clear:planClear(b,e.column),from:b,to:e.column,part};if(better(pair,steel))steel=pair;}
  if(e.footing){const pair={line:l.line,grid:i,existing:j,clear:planClear(footings[i],e.footing),from:footings[i],to:e.footing,part:'footing'};if(better(pair,footing))footing=pair;}
 }));
 return {lines,grids,columns,footings,brackets,girder,steel,footing,unknownFootings:lines.filter(l=>!l.columns.some(v=>v.footing)).map(l=>l.line),footingClear:a.footingClear,source:a.source.trim()};
}

/**
 * Clear distances to the surveyed existing building (ASCE 7-16 §12.12.3 and the footing layout): the new columns,
 * brackets and girders against the existing columns, with the δMT separation where the seismic design gives it;
 * the new footings against the existing footings, with the entered least clear distance.
 */
export function existingLayoutChecks(p:ProjectInput,separation?:BracingSystemResult['separation']):CheckResult[]{
 const r=existingLayout(p);if(!r)return [];
 const u=p.units,f=(v:number)=>format(v,'length',u,3),checks:CheckResult[]=[],source=r.source;
 const where=(v:ClearancePair)=>`grid ${v.grid+1}${v.line}`;
 const add=(id:string,title:string,demand:number,capacity:number,equation:string,note:string,refs:string[])=>checks.push({id,group:'New column base',title,demand,capacity,quantity:'length',utilization:capacity>0?demand/capacity:1e12,
  status:!source?'unverified':Number.isFinite(capacity)&&capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note:`${note}${source?` Survey: ${source}.`:' Enter the survey source of the existing building layout.'}`,referenceIds:refs});
 const lines=r.lines.map(l=>`line ${l.line}: ${l.input.shape||'existing'} columns ${f(l.input.offset)} ${l.input.offset>=0?'outboard of':'inboard of'} grid ${l.line}, ${l.input.spacing>0?`at ${f(l.input.spacing)} from ${f(l.input.start)} past grid 1`:'at each runway grid'}`).join('; ');
 if(r.steel){
  const s=r.steel,required=separation?.required??0;
  add('existing-steel-clear','Existing building · clear distance from the new runway steel',required,s.clear,separation?'c\\ge\\delta_{MT}':'c>0',
   `Least plan distance from the new columns, brackets and girders to the surveyed existing columns (${lines}): ${f(s.clear)} at ${where(s)}, new ${s.part} to the existing column. ${separation?`ASCE 7 §12.12.3 separation δMT = ${f(separation.required)} (see the seismic separation check), shown on S-01 rounded up.`:'No seismic separation is calculated here (seismic design of the new columns is not enabled); the new steel must stay clear of the existing columns.'} Base plates sit at the floor, where the drift is nil; walls, girts and other framing are field verified.`,['asce-12']);
 }
 const fail=r.unknownFootings;
 if(fail.length)checks.push({id:'existing-footing-clear',group:'New column base',title:'Existing building · clear distance between new and existing footings',status:'incomplete',equation:'',referenceIds:['criteria'],note:`Enter the surveyed existing footing size on line${fail.length>1?'s':''} ${fail.join(' and ')} to check the new footings against it.`});
 else if(r.footing){
  const s=r.footing;
  add('existing-footing-clear','Existing building · clear distance between new and existing footings',r.footingClear,s.clear,'c_{ftg}\\ge c_{min}',
   `Least plan distance from the new ${f(p.columnBase!.footing.L)} × ${f(p.columnBase!.footing.B)} footings to the surveyed existing footings (${r.lines.map(l=>`line ${l.line} ${f(l.input.footing.L)} × ${f(l.input.footing.B)}`).join(', ')}): ${f(s.clear)} at ${where(s)}, against the entered minimum ${f(r.footingClear)}. Excavation and saw cutting shall not undermine the existing footings.`,['criteria']);
 }
 return checks;
}

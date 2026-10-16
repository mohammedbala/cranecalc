import {railBearsOnStops} from '../engine/railLayout';
import type {CalculationSnapshot} from '../engine/types';
import {leastBearing,sideReactions,type SupportForceEnvelope,type SupportForceSet} from '../engine/bracketForces';
import {activeEndBearing} from '../engine/endBearingInputs';
import {activeColumnCap} from '../engine/columnCapInputs';
import {craneCombinations,combinationLabel} from '../engine/aistLoads';
import {toDisplay,unit} from '../engine/units';
import {heading,paragraph,table,fitColumns,type Block,type Style} from './noteBlocks';
import {sheetRef} from './sheetGraphics';
import {topFlangeRestraint} from './tieNames';
import {sig3} from '../report/reportParts';
import {deliveredRows} from '../report/deliveredTable';

/**
 * Details whose notes carry the bracket design force table: the bracket details, else the independent
 * supports. A continuous runway on brackets by others has neither, and the cover carries the table.
 */
export function bracketForceTopic(s:CalculationSnapshot):'bracket'|'support'|'column-cap'|undefined{
 const p=s.input;if(!p.details)return undefined;
 if(activeColumnCap(p))return 'column-cap';
 return p.details.bracket?.enabled?'bracket':p.system==='simple'?'support':undefined;
}
/** Name of the support design force table: column cap or bracket. */
export const forceTableName=(s:CalculationSnapshot)=>activeColumnCap(s.input)?'COLUMN CAP DESIGN FORCES':'BRACKET DESIGN FORCES';
/** Reference from the details of `from` to the bracket design force table. */
export function bracketForcesAt(s:CalculationSnapshot,from:'bracket'|'support'|'column-cap'|'cover',here='BELOW'){const k=bracketForceTopic(s)??'cover',name=forceTableName(s);return k===from?`${name} ${here}`:`${name} ON ${k==='cover'?'S-00':sheetRef(k)}`;}
const near=(a:number,b:number)=>Math.abs(a-b)<=1e-6*Math.max(Math.abs(a),Math.abs(b),1);
const sameOrBoth=(a:number|undefined,b:number|undefined)=>a===undefined?b===undefined:b!==undefined&&near(a,b);
/** One row of the bracket design force table: a whole concurrent set, and the criteria it governs. */
export interface BracketForceCase {
 label:string;force:SupportForceSet;
 /** The same case also acts with the opposite seat moment and the left and right reactions exchanged, its horizontal forces unchanged. */
 mirrored:boolean;
}
/** Every value the table gives for a set agrees, so two criteria governed by it share one row. */
function sameCase(a:SupportForceSet,b:SupportForceSet){
 if(a===b)return true;
 const sa=sideReactions(a),sb=sideReactions(b);
 return near(a.vertical,b.vertical)&&near(a.moment,b.moment)&&near(a.longitudinal,b.longitudinal)&&near(a.top,b.top)&&near(a.bottom,b.bottom)&&sameOrBoth(sa.left,sb.left)&&sameOrBoth(sa.right,sb.right);
}
/** The mirrored set is the same case with the seat moment reversed and the end reactions exchanged, at the same horizontal forces. */
function mirrors(a:SupportForceSet,b:SupportForceSet){
 const sa=sideReactions(a),sb=sideReactions(b);
 return near(a.vertical,b.vertical)&&near(a.moment,-b.moment)&&sameOrBoth(sa.left,sb.right)&&sameOrBoth(sa.right,sb.left)&&near(a.longitudinal,b.longitudinal)&&near(a.top,b.top)&&near(a.bottom,b.bottom);
}
/** Criteria governed by one row, as one label: MAX V & M; MAX V, M & LONG.; MIN V & END V. */
function caseLabel(names:string[]){
 const groups:{word:string;items:string[]}[]=[];
 for(const n of names){const [word,...rest]=n.split(' '),item=rest.join(' '),last=groups.at(-1);if(last?.word===word)last.items.push(item);else groups.push({word,items:[item]});}
 const list=(v:string[])=>v.length>1?`${v.slice(0,-1).join(', ')} & ${v.at(-1)}`:v[0];
 return groups.map(g=>`${g.word} ${list(g.items)}`).join(' & ');
}
/**
 * The concurrent cases at each support, each a whole set (all reactions, seat moment, longitudinal force and both
 * flange lateral forces of one combination and crane position): the largest reaction and seat moment (both signs
 * where the grid is loaded from either side), the least total reaction and the least girder end reaction, the
 * largest longitudinal force (each way where traction governs it), and the largest top and bottom flange lateral
 * forces. A set governing several criteria is one row.
 */
export function bracketForceCases(s:CalculationSnapshot){
 const simple=s.input.system==='simple';
 return (s.detailResults?.bracketForces??[]).map(v=>{
  const rows:{names:string[];force:SupportForceSet;mirrored:boolean}[]=[];
  const add=(name:string,force:SupportForceSet,mirrored=false)=>{
   // An exact mirror found for the same set by another criterion holds for the row.
   const old=rows.find(r=>sameCase(r.force,force));
   if(old){if(!old.names.includes(name))old.names.push(name);old.mirrored||=mirrored;return;}
   rows.push({names:[name],force,mirrored});
  };
  // A largest reaction or moment reached from either side: one ± row for an exact mirror, else both sets.
  const extreme=(name:string,force:SupportForceSet,mirror?:SupportForceSet)=>{
   if(!simple){add(name,force);return;}
   if(mirror&&mirrors(force,mirror)){add(name,force,true);return;}
   add(name,force);if(mirror)add(name,mirror);
  };
  extreme('MAX V',v.maxVertical,v.mirror?.vertical);
  if(simple)extreme('MAX M',v.maxMoment,v.mirror?.moment);
  add('MIN V',v.minVertical??v.minBearing);
  // At a grid with one girder end the least end reaction is the least total.
  if(simple&&Math.max(...[v.maxVertical,v.minBearing].map(f=>f.ends.length))>1)add('MIN END V',v.minBearing);
  const longitudinal=v.reversible.longitudinal&&v.backward&&v.forward?[v.backward,v.forward]:Math.abs(v.longitudinal.longitudinal)>=1?[v.longitudinal]:[];
  for(const f of longitudinal)add('MAX LONG.',f);
  if(Math.abs(v.top.top)>=1)add('MAX H',v.top);
  if(Math.abs(v.bottom.bottom)>=1&&Math.abs(v.bottom.bottom)>Math.abs(v.top.bottom)*(1+1e-6))add('MAX H BOT.',v.bottom);
  return {grid:v.grid,envelope:v,cases:rows.map(r=>({label:caseLabel(r.names),force:r.force,mirrored:r.mirrored})) as BracketForceCase[]};
 });
}
export const hasUplift=(v:SupportForceEnvelope)=>Math.min(leastBearing(v.minBearing),(v.minVertical??v.minBearing).vertical)<-1;
/**
 * Signed values of one table row, to three significant figures (two decimals below 0.1) as the forces delivered to the
 * columns on S-00 print, a dash for a horizontal force that rounds to zero at 0.01 kip (0.1 kN). H TOP (H TIE) is ±
 * (it reverses with the side thrust and with the rail eccentricity), H BOTTOM (H SEAT) signed relative to it, LONG. (F)
 * + toward the higher-numbered grid.
 */
export function bracketForceCells(f:SupportForceSet,mirrored:boolean,u:'US'|'SI',units=true){
 const dp=u==='SI'?1:2,shown=(v:number,q:'force'|'moment')=>Math.abs(toDisplay(v,q,u))>=.5*10**-dp;
 // Without units the table states them in its heading.
 const bare=(v:string,q:'force'|'moment')=>units?v:v.slice(0,v.length-unit(q,u).length).trimEnd();
 const value=(v:number,q:'force'|'moment',sign='')=>{const d=Math.abs(toDisplay(v,q,u));return `${sign||(v<0&&shown(v,q)?'\u2212':'')}${bare(d<.1?`${d.toFixed(2)} ${unit(q,u)}`:sig3(Math.abs(v),q,u),q)}`;};
 const side=sideReactions(f),dash='—';
 const top=shown(f.top,'force'),bottom=shown(f.bottom,'force');
 return {
  vertical:value(f.vertical,'force'),left:side.left===undefined?dash:value(side.left,'force'),right:side.right===undefined?dash:value(side.right,'force'),
  moment:mirrored&&shown(f.moment,'moment')?value(f.moment,'moment','±'):value(f.moment,'moment'),
  longitudinal:shown(f.longitudinal,'force')?value(f.longitudinal,'force',f.longitudinal>0?'+':'\u2212'):dash,
  top:top?value(f.top,'force','±'):dash,
  bottom:!bottom?dash:value(f.bottom,'force',!top?'±':Math.sign(f.bottom)===Math.sign(f.top)?'±':'∓')
 };
}
const combination=(f:SupportForceSet)=>f.combination.replace(/^(LRFD|ASD) /,'');
/** Factored bracket design force envelope for the drawings: one consistent table wherever bracket forces appear. */
export function bracketForceBlocks(s:CalculationSnapshot,t:Style):Block[]{
 const p=s.input,u=p.units,simple=p.system==='simple',grids=bracketForceCases(s);
 const cap=!!activeColumnCap(p),title=heading(t,`${forceTableName(s)} / FACTORED ${p.method} ENVELOPE`);
 if(!grids.length)return [title,paragraph(t,'PENDING CALCULATION.')];
 // A continuous girder's runway-end bearings sit inboard of their grids: a seat moment column when any acts.
 const moments=!simple&&grids.some(g=>g.cases.some(c=>Math.abs(c.force.moment)>=1));
 const bolted=activeEndBearing(p);
 // The labels of the forces delivered to the columns on S-00 (and the calculation): M_y,seat, F, H tie, H seat. A column
 // cap has neither seat nor tie: its lateral forces stay at the top and bottom flanges.
 const L=cap?{M:'SEAT M',F:'LONG.',top:'H TOP',bottom:'H BOT.'}:{M:'MY,SEAT',F:'F',top:'H TIE',bottom:bolted?'H SEAT':'H BOT.'};
 const caseLabel=(v:string)=>cap?v:v.replace(/\bLONG\./g,'F').replace(/\bH BOT\./g,L.bottom);
 const rows=grids.flatMap(({grid,cases})=>cases.map((c,i)=>{
  const v=bracketForceCells(c.force,c.mirrored,u,false),head=[i?'':String(grid),caseLabel(c.label),combination(c.force),v.vertical];
  return simple?[...head,v.left,v.right,v.moment,v.longitudinal,v.top,v.bottom]:[...head,...(moments?[v.moment]:[]),v.longitudinal,v.top,v.bottom];
 }));
 const stops=new Set(craneCombinations(p.method).filter(c=>c.bumper>0).map(c=>`${p.method} ${c.id}`));
 const envelopes=grids.map(g=>g.envelope),uplift=envelopes.some(hasUplift);
 // The TR-13 traction and bumper cases of combination 10 print as 10-T and 10-B in the narrow column.
 const tenths=[...new Set(grids.flatMap(g=>g.cases.map(c=>combination(c.force))).filter(v=>/^\d+-[TB]$/.test(v)))].sort();
 const ten=tenths.length?` COMB. ${tenths.join(' / ')}: COMBINATION${tenths.length>1?'S':''} ${tenths.map(v=>combinationLabel(v).toUpperCase()).join(' / ')} ON S-00.`:'';
 // The S-00 tie force adds the Appendix 6 brace force to this restraint force.
 const braced=!cap&&deliveredRows(s).length?` H TIE HERE EXCLUDES THE APPENDIX 6 BRACE FORCE THAT THE S-00 H TIE ADDS.`:'';
 const locating=envelopes.filter(v=>Math.abs(v.longitudinal.longitudinal)>=1).map(v=>v.grid),stop=envelopes.filter(v=>Math.abs(v.longitudinal.longitudinal)>=1&&stops.has(v.longitudinal.combination)).map(v=>v.grid);
 const list=(g:number[])=>g.length>1?`GRIDS ${g.slice(0,-1).join(', ')} AND ${g.at(-1)}`:`GRID ${g[0]}`;
 const interior=simple&&grids.some(g=>g.cases.some(c=>c.label.includes('END V'))),mirrored=grids.some(g=>g.cases.some(c=>c.mirrored));
 return [title,
  // Column widths in proportion to the widest values, so each value stays on one line.
  // Column widths from the widest heading and value of each column, so each value stays on one line; the case names
  // wrap where the table is tight.
  ...(()=>{const headers=simple?['GRID','CASE','COMB.','V','LEFT V','RIGHT V',L.M,L.F,L.top,L.bottom]:['GRID','CASE','COMB.','V',...(moments?[L.M]:[]),L.F,L.top,L.bottom];return [table(t,headers,rows,fitColumns(t,headers,rows,[1]))];})(),
  // One note, as short as the two tables it replaced, so the notes column keeps its text size.
  // Values without units, so each reads on one line in the notes lane; the note under the table states them first.
  paragraph(t,`FORCES IN ${unit('force',u)}, MOMENTS IN ${unit('moment',u)}. ${p.method} FACTORED, AIST TR-13 COMBINATION NUMBERS PER S-00; ENVELOPE OF ALL CRANE POSITIONS. EACH ROW IS ONE CONCURRENT CASE, ITS FORCES ACTING TOGETHER; DO NOT COMBINE ROWS. V: GIRDER REACTIONS ON THE ${cap?'CAP, DOWNWARD POSITIVE':'SEAT, DOWNWARD POSITIVE, BRACKET SELF-WEIGHT EXCLUDED'}${simple?`; LEFT / RIGHT V: GIRDER END ON THE LOWER / HIGHER GRID SIDE. ${L.M} = ΣV × a ABOUT THE GRID, a = ARM TO EACH REACTION, AT 0.8 OF THE BEARING LENGTH FROM ITS GIRDER END${mirrored?'; ±: ALSO WITH LEFT AND RIGHT V EXCHANGED':''}`:moments?`; CONTINUOUS GIRDER BEARING CENTERED ON INTERIOR GRIDS; AT A RUNWAY-END GRID IT RUNS INBOARD FROM THE GIRDER END ON THE GRID. ${L.M} = V × a ABOUT THE GRID, a = ARM TO THE REACTION, AT 0.8 OF THE BEARING LENGTH FROM THE GIRDER END`:'; CONTINUOUS GIRDER BEARING CENTERED ON THE GRID'}. MIN V: LEAST TOTAL V${interior?'; END V: LEAST GIRDER END REACTION':''}${uplift?'; NEGATIVE IS UPLIFT':'; NO UPLIFT'}. ${L.F}:${L.F==='F'?' LONGITUDINAL FORCE':''} ${simple?'AT THE LOCATING BEARING OF EACH BAY, AT ITS LOWER-NUMBERED GRID; NONE AT A SLIDING END':locating.length?`AT THE LOCATING SUPPORT, ${list(locating)}`:'NONE'}. ${simple||moments?`${L.M} AND ${L.F}`:L.F} + TOWARD THE HIGHER-NUMBERED GRID. TRACTION ACTS EITHER WAY (BOTH SENSES LISTED WHERE IT GOVERNS)${railBearsOnStops(p)?', IN THE BAY UNDER THE CRANE OR VIA THE RAIL STRING AT AN END STOP':''}; THE CRANE STOP FORCE ACTS ONLY AT STOP CONTACT, TOWARD THE STOP${simple&&stop.length?`, AT ${list(stop)}`:''}. ${L.top} / ${L.bottom}: LATERAL FORCE OF ${simple?'ALL GIRDER ENDS AT THE GRID':'THE GIRDER'} ${cap?'AT THE TOP FLANGE, CARRIED DOWN THE BEARING STIFFENERS (FORK) / AT THE BOTTOM FLANGE; BOTH THROUGH THE BEARING BOLTS INTO THE CAP':`AT ${topFlangeRestraint(p,false)} / ${bolted?'THROUGH THE BEARING BOLTS INTO THE SEAT':'AT THE BOTTOM FLANGE TIES'}`}, ± TOGETHER; ${L.bottom} IS SIGNED RELATIVE TO ${L.top}: − OPPOSITE (A COUPLE), + THE SAME WAY.${braced}${ten}`)
 ];
}

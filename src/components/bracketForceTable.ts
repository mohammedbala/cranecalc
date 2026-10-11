import type {CalculationSnapshot} from '../engine/types';
import {leastBearing,sideReactions,type SupportForceEnvelope,type SupportForceSet} from '../engine/bracketForces';
import {activeEndBearing} from '../engine/endBearingInputs';
import {craneCombinations} from '../engine/aistLoads';
import {toDisplay,unit} from '../engine/units';
import {heading,paragraph,table,type Block,type Style} from './noteBlocks';
import {sheetRef} from './sheetGraphics';

/**
 * Details whose notes carry the bracket design force table: the bracket details, else the independent
 * supports. A continuous runway on brackets by others has neither, and the cover carries the table.
 */
export function bracketForceTopic(s:CalculationSnapshot):'bracket'|'support'|undefined{
 const p=s.input;if(!p.details)return undefined;
 return p.details.bracket?.enabled?'bracket':p.system==='simple'?'support':undefined;
}
/** Reference from the details of `from` to the bracket design force table. */
export function bracketForcesAt(s:CalculationSnapshot,from:'bracket'|'support'|'cover',here='BELOW'){const k=bracketForceTopic(s)??'cover';return k===from?`BRACKET DESIGN FORCES ${here}`:`BRACKET DESIGN FORCES ON ${k==='cover'?'S-00':sheetRef(k)}`;}
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
 * Signed values of one table row, each to the table precision (a dash for a horizontal force that rounds to zero):
 * SI forces to 0.1 kN and moments to 0.1 kN·m, US to 0.01 kip and kip-ft. H TOP is ± (it reverses with the side thrust and with
 * the rail eccentricity), H BOTTOM signed relative to it, LONG. + toward the higher-numbered grid.
 */
export function bracketForceCells(f:SupportForceSet,mirrored:boolean,u:'US'|'SI'){
 const dp=u==='SI'?1:2,shown=(v:number,q:'force'|'moment')=>Math.abs(toDisplay(v,q,u))>=.5*10**-dp;
 const value=(v:number,q:'force'|'moment',sign='')=>{const d=Math.abs(toDisplay(v,q,u));return `${sign||(v<0&&shown(v,q)?'-':'')}${d.toLocaleString('en-US',{maximumFractionDigits:dp})} ${unit(q,u)}`;};
 const side=sideReactions(f),dash='—';
 const top=shown(f.top,'force'),bottom=shown(f.bottom,'force');
 return {
  vertical:value(f.vertical,'force'),left:side.left===undefined?dash:value(side.left,'force'),right:side.right===undefined?dash:value(side.right,'force'),
  moment:mirrored&&shown(f.moment,'moment')?value(f.moment,'moment','±'):value(f.moment,'moment'),
  longitudinal:shown(f.longitudinal,'force')?value(f.longitudinal,'force',f.longitudinal>0?'+':'-'):dash,
  top:top?value(f.top,'force','±'):dash,
  bottom:!bottom?dash:value(f.bottom,'force',!top?'±':Math.sign(f.bottom)===Math.sign(f.top)?'+':'-')
 };
}
const combination=(f:SupportForceSet)=>f.combination.replace(/^(LRFD|ASD) /,'');
/** Factored bracket design force envelope for the drawings: one consistent table wherever bracket forces appear. */
export function bracketForceBlocks(s:CalculationSnapshot,t:Style):Block[]{
 const p=s.input,u=p.units,simple=p.system==='simple',grids=bracketForceCases(s);
 const title=heading(t,`BRACKET DESIGN FORCES / FACTORED ${p.method} ENVELOPE`);
 if(!grids.length)return [title,paragraph(t,'PENDING CALCULATION.')];
 const rows=grids.flatMap(({grid,cases})=>cases.map((c,i)=>{
  const v=bracketForceCells(c.force,c.mirrored,u),head=[i?'':String(grid),c.label,combination(c.force),v.vertical];
  return simple?[...head,v.left,v.right,v.moment,v.longitudinal,v.top,v.bottom]:[...head,v.longitudinal,v.top,v.bottom];
 }));
 const stops=new Set(craneCombinations(p.method).filter(c=>c.bumper>0).map(c=>`${p.method} ${c.id}`));
 const envelopes=grids.map(g=>g.envelope),uplift=envelopes.some(hasUplift),bolted=activeEndBearing(p);
 const locating=envelopes.filter(v=>Math.abs(v.longitudinal.longitudinal)>=1).map(v=>v.grid),stop=envelopes.filter(v=>Math.abs(v.longitudinal.longitudinal)>=1&&stops.has(v.longitudinal.combination)).map(v=>v.grid);
 const list=(g:number[])=>g.length>1?`GRIDS ${g.slice(0,-1).join(', ')} AND ${g.at(-1)}`:`GRID ${g[0]}`;
 const interior=simple&&grids.some(g=>g.cases.some(c=>c.label.includes('END V'))),mirrored=grids.some(g=>g.cases.some(c=>c.mirrored));
 return [title,
  // Column widths in proportion to the widest values, so each value stays on one line.
  simple?table(t,['GRID','CASE','COMB.','V','LEFT V','RIGHT V','SEAT M','LONG.','H TOP','H BOT.'],rows,[.65,1.89,.81,1,1,1,1.38,1,1.01,.95]):table(t,['GRID','CASE','COMB.','V','LONG.','H TOP','H BOT.'],rows,[.65,1.89,.81,1,1,1.01,.95]),
  // One note, as short as the two tables it replaced, so the notes column keeps its text size.
  paragraph(t,`${p.method} FACTORED, AIST TR-13 COMBINATION NUMBERS PER S-00; ENVELOPE OF ALL CRANE POSITIONS. EACH ROW IS ONE CONCURRENT CASE, ITS FORCES ACTING TOGETHER; DO NOT COMBINE ROWS. V: GIRDER REACTIONS ON THE SEAT, DOWNWARD POSITIVE, BRACKET SELF-WEIGHT EXCLUDED${simple?`; LEFT / RIGHT V: GIRDER END ON THE LOWER / HIGHER GRID SIDE. SEAT M = ΣV × e ABOUT THE GRID, e TO EACH REACTION AT 0.8 OF THE BEARING LENGTH FROM ITS GIRDER END${mirrored?'; ±: ALSO WITH LEFT AND RIGHT V EXCHANGED':''}`:'; CONTINUOUS GIRDER BEARING CENTERED ON THE GRID'}. MIN V: LEAST TOTAL V${interior?'; END V: LEAST GIRDER END REACTION':''}${uplift?'; NEGATIVE IS UPLIFT':'; NO UPLIFT'}. LONG.: ${simple?'AT THE LOCATING BEARING OF EACH BAY, AT ITS LOWER-NUMBERED GRID; NONE AT A SLIDING END':locating.length?`AT THE LOCATING SUPPORT, ${list(locating)}`:'NONE'}. ${simple?'SEAT M AND LONG.':'LONG.'} + TOWARD THE HIGHER-NUMBERED GRID. TRACTION ACTS EITHER WAY (BOTH SENSES LISTED WHERE IT GOVERNS); THE CRANE STOP FORCE ACTS ONLY WITH THE CRANE AT THE STOP, AT THE END OF ITS TRAVEL, TOWARD THE STOP${simple&&stop.length?`, AT ${list(stop)}`:''}. H TOP / H BOT.: LATERAL FORCE OF ${simple?'ALL GIRDER ENDS AT THE GRID':'THE GIRDER'} AT THE TOP FLANGE TIES / ${bolted?'THROUGH THE BEARING BOLTS INTO THE SEAT':'AT THE BOTTOM FLANGE TIES'}, ± TOGETHER; H BOT. IS SIGNED RELATIVE TO H TOP: - OPPOSITE (A COUPLE), + THE SAME WAY.`)
 ];
}

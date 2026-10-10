import type {CalculationSnapshot} from '../engine/types';
import {sideReactions,type SupportForceEnvelope,type SupportForceSet} from '../engine/bracketForces';
import {activeEndBearing} from '../engine/endBearingInputs';
import {craneCombinations} from '../engine/aistLoads';
import {format} from '../engine/units';
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
const least=(f:SupportForceSet)=>f.ends.length?Math.min(...f.ends.map(v=>v.vertical)):f.vertical;
const combination=(f:SupportForceSet)=>f.combination.replace(/^(LRFD|ASD) /,'');
/** Rows of the envelope at each support: largest reaction, largest seat moment (when a different case) and least bearing reaction. */
export function bracketForceRows(s:CalculationSnapshot){
 const simple=s.input.system==='simple';
 return (s.detailResults?.bracketForces??[]).map(v=>{
  // A continuous girder bears centrally on the seat, so its largest reaction is the only downward case.
  const same=!simple||near(v.maxMoment.vertical,v.maxVertical.vertical)&&near(Math.abs(v.maxMoment.moment),Math.abs(v.maxVertical.moment));
  return {grid:v.grid,envelope:v,cases:[
   {label:same&&simple?'MAX V & M':'MAX V',force:v.maxVertical,reversible:v.reversible.vertical},
   ...(same?[]:[{label:'MAX M',force:v.maxMoment,reversible:v.reversible.moment}]),
   {label:'MIN V',force:v.minBearing,reversible:false}
  ]};
 });
}
export const hasUplift=(v:SupportForceEnvelope)=>least(v.minBearing)<-1;
/**
 * Horizontal force rows at each support, each one concurrent set: the largest longitudinal force with its lateral
 * forces, and the largest top-flange (and, when a different set, bottom-flange) lateral force with its own
 * longitudinal and other-flange forces. H TOP and H BOTTOM of a row act together.
 */
export function bracketHorizontalRows(s:CalculationSnapshot){
 return (s.detailResults?.bracketForces??[]).map(v=>{
  const rows:{label:string;force:SupportForceSet}[]=[],differs=(a:SupportForceSet,b:SupportForceSet)=>a.id!==b.id&&!(near(a.longitudinal,b.longitudinal)&&near(a.top,b.top)&&near(a.bottom,b.bottom));
  const long=Math.abs(v.longitudinal.longitudinal)>=1;
  if(long)rows.push({label:'MAX LONG.',force:v.longitudinal});
  if(!long||differs(v.top,v.longitudinal))rows.push({label:'MAX H',force:v.top});
  else rows[0].label='MAX LONG. & H';
  if(Math.abs(v.bottom.bottom)>Math.abs(v.top.bottom)*(1+1e-6)&&differs(v.bottom,v.top))rows.push({label:'MAX H BOT.',force:v.bottom});
  return {grid:v.grid,envelope:v,rows};
 });
}
/** Factored bracket design force envelope for the drawings: one consistent table wherever bracket forces appear. */
export function bracketForceBlocks(s:CalculationSnapshot,t:Style):Block[]{
 const p=s.input,u=p.units,simple=p.system==='simple',rows=bracketForceRows(s);
 // SI forces to 0.1 kN and moments to 0.1 kN·m; US to 0.01 kip and kip-ft.
 const dp=u==='SI'?1:2,force=(v:number)=>format(v,'force',u,dp),signed=(v:number,both:boolean)=>both?`±${format(Math.abs(v),'moment',u,dp)}`:format(v,'moment',u,dp);
 const title=heading(t,`BRACKET DESIGN FORCES / FACTORED ${p.method} ENVELOPE`);
 if(!rows.length)return [title,paragraph(t,'PENDING CALCULATION.')];
 const vertical=rows.flatMap(({grid,cases})=>cases.map((c,i)=>{
  const side=sideReactions(c.force),row=[i?'':String(grid),c.label,combination(c.force),force(c.force.vertical)];
  return simple?[...row,side.left===undefined?'—':force(side.left),side.right===undefined?'—':force(side.right),signed(c.force.moment,c.reversible)]:row;
 }));
 // Longitudinal: ± where it acts either way (traction), else signed, + toward the higher-numbered grid (stop force).
 const stops=new Set(craneCombinations(p.method).filter(c=>c.bumper>0).map(c=>`${p.method} ${c.id}`));
 const oneWay=(v:SupportForceEnvelope,f:SupportForceSet)=>f===v.longitudinal&&!v.reversible.longitudinal&&stops.has(f.combination);
 // H TOP and H BOTTOM of one set act together and reverse together with the side thrust: the top reads ±, the
 // bottom − where it opposes the top (a couple) and + where it acts with it.
 const horizontalRows=bracketHorizontalRows(s);
 const horizontal=horizontalRows.flatMap(({grid,envelope:v,rows:hr})=>hr.map(({label,force:f},i)=>{
  const L=Math.abs(f.longitudinal)<1?'—':oneWay(v,f)?`${f.longitudinal>0?'+':'-'}${force(Math.abs(f.longitudinal))}`:`±${force(Math.abs(f.longitudinal))}`;
  const top=Math.abs(f.top)<1?'—':`±${force(Math.abs(f.top))}`,bottom=Math.abs(f.bottom)<1?'—':Math.abs(f.top)<1?`±${force(Math.abs(f.bottom))}`:`${Math.sign(f.bottom)===Math.sign(f.top)?'+':'-'}${force(Math.abs(f.bottom))}`;
  return [i?'':String(grid),label,combination(f),L,top,bottom];
 }));
 const uplift=rows.some(r=>hasUplift(r.envelope)),bolted=activeEndBearing(p);
 const locating=horizontalRows.filter(r=>Math.abs(r.envelope.longitudinal.longitudinal)>=1).map(r=>r.grid),stop=horizontalRows.filter(r=>Math.abs(r.envelope.longitudinal.longitudinal)>=1&&oneWay(r.envelope,r.envelope.longitudinal)).map(r=>r.grid);
 const grids=(g:number[])=>g.length>1?`GRIDS ${g.slice(0,-1).join(', ')} AND ${g.at(-1)}`:`GRID ${g[0]}`;
 return [title,
  simple?table(t,['GRID','CASE','COMB.','V','LEFT V','RIGHT V','SEAT M'],vertical,[.45,.85,.55,1,1,1,1.2]):table(t,['GRID','CASE','COMB.','V'],vertical,[.45,.85,.55,1]),
  table(t,['GRID','CASE','COMB.','LONG.','H TOP','H BOTTOM'],horizontal,[.45,1.05,.55,1,1,1]),
  paragraph(t,`${p.method} FACTORED, AIST TR-13 COMBINATION NUMBERS PER S-00; ENVELOPE OF ALL CRANE POSITIONS. EACH ROW IS ONE CONCURRENT CASE; DO NOT COMBINE ROWS. V: GIRDER REACTIONS ON THE SEAT, DOWNWARD POSITIVE, BRACKET SELF-WEIGHT EXCLUDED.${simple?' LEFT V / RIGHT V: GIRDER END ON THE LOWER / HIGHER GRID SIDE. SEAT M = ΣV × e ABOUT THE GRID, e TO EACH REACTION AT 0.8 OF THE BEARING LENGTH FROM ITS GIRDER END, POSITIVE TOWARD THE NEXT GRID; ±: EITHER SIGN WITH LEFT AND RIGHT V EXCHANGED.':' CONTINUOUS GIRDER BEARING CENTERED ON THE GRID.'} MIN V: LEAST ${simple?'GIRDER END ':''}REACTION${uplift?'; NEGATIVE IS UPLIFT':'; NO UPLIFT'}.`),
  paragraph(t,`HORIZONTAL FORCES: EACH ROW IS ONE CONCURRENT CASE; DO NOT COMBINE ROWS. LONGITUDINAL: ${simple?'AT THE LOCATING BEARING OF EACH BAY, AT ITS LOWER-NUMBERED GRID; NONE AT A SLIDING END':locating.length?`AT THE LOCATING SUPPORT, ${grids(locating)}`:'NONE'}. ±: EITHER WAY (CRANE TRACTION${simple?'':', OR THE STOP FORCE AT EITHER END'}); A SIGNED VALUE ACTS ONE WAY ONLY: THE CRANE STOP FORCE, TOWARD THE STOP, + TOWARD THE HIGHER-NUMBERED GRID${simple&&stop.length?`: ONLY THE END BAYS WITH A STOP CARRY IT, TO ${grids(stop)}`:''}. H TOP / H BOTTOM: LATERAL FORCE OF ${simple?'ALL GIRDER ENDS AT THE GRID':'THE GIRDER'} AT THE TOP FLANGE TIES / ${bolted?'THROUGH THE BEARING BOLTS INTO THE SEAT':'AT THE BOTTOM FLANGE TIES'}. THEY ACT TOGETHER AND REVERSE TOGETHER WITH THE SIDE THRUST; H BOTTOM IS SIGNED RELATIVE TO H TOP: - OPPOSITE (A COUPLE), + THE SAME WAY.`)
 ];
}

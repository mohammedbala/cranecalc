import type {CalculationSnapshot} from '../engine/types';
import {sideReactions,type SupportForceEnvelope,type SupportForceSet} from '../engine/bracketForces';
import {activeEndBearing} from '../engine/endBearingInputs';
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
/** Factored bracket design force envelope for the drawings: one consistent table wherever bracket forces appear. */
export function bracketForceBlocks(s:CalculationSnapshot,t:Style):Block[]{
 const p=s.input,u=p.units,simple=p.system==='simple',rows=bracketForceRows(s);
 const force=(v:number)=>format(v,'force',u,2),signed=(v:number,both:boolean)=>both?`±${format(Math.abs(v),'moment',u,2)}`:format(v,'moment',u,2);
 const title=heading(t,`BRACKET DESIGN FORCES / FACTORED ${p.method} ENVELOPE`);
 if(!rows.length)return [title,paragraph(t,'PENDING CALCULATION.')];
 const vertical=rows.flatMap(({grid,cases})=>cases.map((c,i)=>{
  const side=sideReactions(c.force),row=[i?'':String(grid),c.label,combination(c.force),force(c.force.vertical)];
  return simple?[...row,side.left===undefined?'—':force(side.left),side.right===undefined?'—':force(side.right),signed(c.force.moment,c.reversible)]:row;
 }));
 const horizontal=rows.map(({grid,envelope:v})=>[String(grid),...([['longitudinal',v.longitudinal],['top',v.top],['bottom',v.bottom]] as const).map(([k,f])=>Math.abs(f[k])<1?'—':`±${force(Math.abs(f[k]))} (${combination(f)})`)]);
 const uplift=rows.some(r=>hasUplift(r.envelope)),bolted=activeEndBearing(p);
 return [title,
  simple?table(t,['GRID','CASE','COMB.','V','LEFT V','RIGHT V','SEAT M'],vertical,[.45,.85,.55,1,1,1,1.2]):table(t,['GRID','CASE','COMB.','V'],vertical,[.45,.85,.55,1]),
  table(t,['GRID','LONGITUDINAL','H TOP','H BOTTOM'],horizontal,[.45,1.25,1.15,1.15]),
  paragraph(t,`${p.method} FACTORED, AIST TR-13 COMBINATION NUMBERS PER S-00; ENVELOPE OF ALL CRANE POSITIONS. EACH ROW IS ONE CONCURRENT CASE; DO NOT COMBINE ROWS. V: GIRDER REACTIONS ON THE SEAT, DOWNWARD POSITIVE, BRACKET SELF-WEIGHT EXCLUDED.${simple?' LEFT V / RIGHT V: GIRDER END ON THE LOWER / HIGHER GRID SIDE. SEAT M = ΣV × e ABOUT THE GRID, e TO EACH REACTION AT 0.8 OF THE BEARING LENGTH FROM ITS GIRDER END, POSITIVE TOWARD THE NEXT GRID; ±: EITHER SIGN WITH LEFT AND RIGHT V EXCHANGED.':' CONTINUOUS GIRDER BEARING CENTERED ON THE GRID.'} MIN V: LEAST ${simple?'GIRDER END ':''}REACTION${uplift?'; NEGATIVE IS UPLIFT':'; NO UPLIFT'}.`),
  paragraph(t,`EACH HORIZONTAL FORCE IS ITS OWN MAXIMUM, EITHER DIRECTION. LONGITUDINAL: CRANE TRACTION OR STOP FORCE ${simple?'AT THE LOCATING (LEFT) BEARING OF EACH BAY; NONE AT A SLIDING END':'AT THE RUNWAY ENDS'}. H TOP / H BOTTOM: LATERAL FORCE OF ${simple?'ALL GIRDER ENDS AT THE GRID':'THE GIRDER'} AT THE TOP FLANGE TIES / ${bolted?'THROUGH THE BEARING BOLTS INTO THE SEAT':'AT THE BOTTOM FLANGE TIES'}.`)
 ];
}

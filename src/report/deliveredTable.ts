import {railBearsOnStops} from '../engine/railLayout';
import type {CalculationSnapshot,ProjectInput} from '../engine/types';
import {activeColumnCap} from '../engine/columnCapInputs';
import {activeStep} from '../engine/steppedColumnInputs';
import {deliveredForces,type DeliveredForces,type DeliveredSet} from '../engine/forcesDelivered';
import {drawingElevation} from '../components/drawingFormat';
import {caseLabel,sig3,tidyNumbers} from './reportParts';
import {toDisplay,unit} from '../engine/units';
import {tiedToBuilding} from '../engine/craneColumnInputs';
import {columnBaseElevation} from '../engine/columnBaseInputs';

/**
 * The forces delivered to the building columns (C4), one table printed identically on page 1, in section 3.5 and
 * on S-00: per grid, whole concurrent sets (max V, max H, max or stop longitudinal force), each with the vertical
 * reaction at its eccentricity, the strong-axis moment V·e, the weak-axis seat moment, the lateral forces at the tie
 * line and at the seat, and the longitudinal force at the seat on the girder line.
 */
const esc=(v:unknown)=>caseLabel(tidyNumbers(String(v??''))).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const deliveredHeaders=['Grid','Set','Combination','V','Mx = V·e','My,seat','H tie','H seat','F'];
/**
 * A crane column tied to the building column (craneColumn.ts): the building column takes H only, the girder tie design force
 * at the girder tie and the column tie design force at the crane-column top (V, M and F go to the crane column).
 */
export const craneColumnDeliveredHeaders=['Grid','Set','Combination','H girder tie','H column tie'];
/** The headers for a project: on a column cap the top-flange force is the end fork's (H top), there is no tie. */
export const deliveredHeadersOf=(p:ProjectInput)=>tiedToBuilding(p)?craneColumnDeliveredHeaders:activeColumnCap(p)?deliveredHeaders.map(v=>v==='H tie'?'H top':v):deliveredHeaders;

/** A set label in sentence case, "and" for "&": "Max V and max F". */
const sentence=(v:string)=>{const t=v.replace(/\s*&\s*/g,' and ');return t.charAt(0).toUpperCase()+t.slice(1);};
/** Rows of the table as text, in the project units; signs: + down (V), M_y ± where reached either way, H tie either way with H seat signed relative to it, F + toward the next grid. */
export function deliveredRows(s:CalculationSnapshot,d:DeliveredForces|undefined=deliveredForces(s)){
 if(!d)return [];
 const u=s.input.units,small=(v:number|undefined,q:'force'|'moment')=>v!==undefined&&Math.abs(toDisplay(v,q,u))<.1?`${Math.abs(toDisplay(v,q,u)).toFixed(2)} ${unit(q,u)}`:sig3(v,q,u);
 const f=(v:number|undefined)=>small(v,'force'),m=(v:number|undefined)=>small(v,'moment');
 const sign=(v:number,t:string)=>Math.abs(v)<1?'—':`${v>=0?'+':'−'}${t}`;
 // Mx is never a dash: V·e where e is known (from the column face where the seat is by others), else the product to form.
 const row=(grid:number,i:number,x:DeliveredSet)=>[i?'':String(grid),sentence(x.label),x.combination,f(x.V),x.Mx===undefined?'V·e':m(x.Mx),Math.abs(x.My)<1?'—':x.mirrored?`±${m(Math.abs(x.My))}`:`${x.My>=0?'+':'−'}${m(Math.abs(x.My))}`,
  `±${f(x.Htie)}`,Math.abs(x.Hseat)<1?'—':`${Math.sign(x.Hseat)===Math.sign(x.top)||Math.abs(x.top)<1?'±':'∓'}${f(Math.abs(x.Hseat))}`,sign(x.F,f(Math.abs(x.F)))];
 // A crane column: the girder tie design force and the column tie design force (the bottom-flange force with the crane
 // column's eccentric top reaction and its Appendix 6 brace force, deliveredForces craneColumn), either way.
 const k=d.craneColumn;
 if(k)return d.grids.flatMap(g=>g.sets.map((x,i)=>[i?'':String(g.grid),sentence(x.label),x.combination,`±${f(x.Htie)}`,`±${f(Math.abs(x.Hseat)+k.eccentric+k.braceForce)}`]));
 // The crane-level strut by others the column check relies on: its design force along the runway at the seat level.
 const z=d.strut,strut=z?[['Strut',`Crane-level strut by others, ${z.location==='girder-line'?'girder line':'column C/L'}`,`traction / stop`,'—','—','—','—','—',`±${f(z.force)}`]]:[];
 return [...d.grids.flatMap(g=>g.sets.map((x,i)=>row(g.grid,i,x))),...strut];
}

/** The key printed with the table, one line each: what acts together, where each force acts, the tie design force and the stop grids. */
export function deliveredNote(s:CalculationSnapshot,d:DeliveredForces|undefined=deliveredForces(s),separator=' '){
 if(!d)return '';
 const u=s.input.units,f=(v:number|undefined)=>sig3(v,'force',u),len=(v:number|undefined)=>sig3(v,'length',u),el=(v?:number)=>v===undefined?'':`, El. ${drawingElevation(v,u)}`;
 const step=!!activeStep(s.input);
 const grids=(v:number[])=>v.length>1?`grids ${v.slice(0,-1).join(', ')} and ${v.at(-1)}`:`grid ${v[0]}`;
 const support=s.detailResults?.taperedHaunch?'haunch':s.input.details?.bracket?.enabled?'bracket':'support';
 // Where V acts: from the column centerline, or from the column face where the seat and the column are by others.
 // The reaction beyond the web line: the far bearing edge (half the plate width), or on a new column designed here the
 // web line plus the larger of the rail eccentricity and the bearing plate's kern (columnReactionOffset).
 const half=(s.input.details?.bearing.width??0)/2,beyond=d.web!==undefined&&d.e!==undefined?d.e-d.web:0;
 const far=beyond>1e-3?Math.abs(beyond-half)<1e-3?` (the far edge of the bearing plate, a conservative reaction position; the girder web is at ${len(d.web)})`:` (the girder web line at ${len(d.web)} plus ${len(beyond)}, the larger of the rail eccentricity and the bearing plate's kern b/6, for a full-contact bearing under the web's bearing stiffeners)`:'';
 const at=d.e===undefined?'; e, from the column centerline to the reaction, is not established here (the column is by others): Mx = V·e with the surveyed seat position (column strong axis).'
  :d.eFrom==='face'?`, at e = ${len(d.e)} from the column face${far}. Mx = V·e is the moment at the column face; for the column centerline add V times half the column depth (column by others).`
  :`, at e = ${len(d.e)} from the ${step?'lower shaft ':''}column centerline${far}. Mx = V·e (column strong axis).`;
 const bars=d.elevation?.tieBars,k=d.craneColumn,b=s.input.columnBase;
 // Elevations from the crane-column base (craneColumnLayout) on the drawing datum, as runwayElevations.
 const elAt=(z:number)=>(s.input.drawing?.datumElevation??0)+(b?.enabled?columnBaseElevation(b):0)+z;
 if(k)return [`Factored ${s.input.method}. Each row is one concurrent set; do not combine rows. The building column takes these horizontal forces only, across the runway and in either direction; the runway vertical reactions, My and the longitudinal force go to the crane column, its footing and the crane-level bracing.`,
  `H girder tie: top-flange restraint force plus the Appendix 6 brace force (${f(d.brace.force)}), at the girder tie, El. ${drawingElevation(elAt(k.elevation.girderTie),u)}, at the building column face; design value ${f(d.tie.design)}.`,
  `H column tie: bottom-flange restraint force through the bearing bolts and the cap, plus the crane column's eccentric top reaction (${f(k.eccentric)}) and its Appendix 6 nodal brace force 0.01Pr (${f(k.braceForce)}), at the column tie, El. ${drawingElevation(elAt(k.elevation.columnTie),u)}; design value ${f(k.columnTie)}.`,
  `The two ties act together in each set. The girder tie's column gusset (or end plate) with its welds or bolts and the column tie's tab with its field welds and the building column web are designed here; the building column flange and web at the girder tie are by others for these forces.`].join(separator);
 return [`Factored ${s.input.method}. Each row is one concurrent set; do not combine rows.`,
  `V: girder reactions on the ${step?'step cap of the stepped column':'seat'}${d.elevation?el(d.elevation.seat):''}${at}`,
  `My,seat: moment of the unbalanced end reactions about the grid (column weak axis).`,
  activeColumnCap(s.input)?`H top: top-flange restraint force of the end fork plus the Appendix 6 brace force (${f(d.brace.force)}), at the girder top flange${d.elevation?el(d.elevation.tie):''}, carried by the bearing stiffeners to the bolted bottom flange and the cap (no top-flange tie); design value ${f(d.tie.design)}.`
   :`H tie: top-flange restraint force plus the Appendix 6 brace force (${f(d.brace.force)}), at the tie line${d.elevation?el(d.elevation.tie):''}${bars!==undefined&&d.elevation?`, delivered to the ${step?'upper shaft inner flange':'column'} by the tie at its centerline${el(bars)}`:step?', delivered to the upper shaft inner flange':''}; design value ${f(d.tie.design)}.`,
  `H seat: bottom-flange restraint force at the bearing bolts, ∓ opposite in sign to H ${activeColumnCap(s.input)?'top':'tie'}.`,
  `F: longitudinal force at the locating bearing, + toward the next grid.${d.stopGrids.length?` Stop force ${f(d.stop)} at ${grids(d.stopGrids)} only.`:''}${railBearsOnStops(s.input)?' Traction reaches the bay under the crane, or through the floating rail string an end bay at its stop.':''}`,
  ...(d.strut?[`Strut: the crane-level strut by others ${d.strut.location==='girder-line'?`on the girder line, ${len(d.strut.offset)} from the column centerline,`:'at the column centerline'} at the seat level of grids ${d.strut.grids.join(', ')}${d.strut.stiffness!==undefined?`, axial stiffness k ≥ ${sig3(d.strut.stiffness,'stiffness',u)} at each seat`:''}: design force F = ${f(d.strut.force)} (traction ${f(d.strut.traction)}${d.strut.stop?`, stop ${f(d.strut.stop)}`:''}), carried to the braced bay; the existing column check relies on it.`]:[]),
  ...(s.steppedColumn?.topRestraint?[`Column top: the stepped-column check takes each column top as braced across the runway (roof bracing or diaphragm), which must take the crane's share of the top reaction, ${f(s.steppedColumn.topRestraint.factored)} factored (${f(s.steppedColumn.topRestraint.service)} unfactored) per grid, with the building's own: for the building engineer of record to confirm.`]:[]),
  `V includes the bearing hardware on the seat; the ${support} and other support steel (${f(Math.max(0,...(s.supportReactions?.supports??[]).map(v=>v.Ds)))} per grid, dead) goes straight into the column.`].join(separator);
}

export function deliveredTableHtml(s:CalculationSnapshot,compact=false){
 const d=deliveredForces(s),rows=deliveredRows(s,d);if(!rows.length)return '';
 const sub=(h:string)=>h.replace(/^M(x|y,seat|y)/,'M<sub>$1</sub>').replace(/^H (tie|top|seat)$/,'H<sub>$1</sub>');
 const head=deliveredHeadersOf(s.input).map(sub);
 return `<table class="delivered${compact?' compact':''}"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((v,i)=>`<td${i>2?' class="num"':''}>${i===0?`<b>${esc(v)}</b>`:esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="key${compact?' counts':''}">${esc(deliveredNote(s,d,'\n')).replace(/\bM(x|y,seat|y)\b/g,'M<sub>$1</sub>').replace(/\bH (tie|top|seat)\b/g,'H<sub>$1</sub>').replace(/\n/g,'<br/>')}</p>`;
}
export const deliveredCss=`table.delivered{font-size:8.5px}table.delivered th:nth-child(n+4){text-align:right}table.delivered.compact{font-size:7.5px}table.delivered td.num{text-align:right;white-space:nowrap}table.by-others.matrix{font-size:7.5px}table.by-others.compact td{padding:1px 4px}`;

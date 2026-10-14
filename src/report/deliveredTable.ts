import {railBearsOnStops} from '../engine/railLayout';
import type {CalculationSnapshot} from '../engine/types';
import {deliveredForces,type DeliveredForces,type DeliveredSet} from '../engine/forcesDelivered';
import {drawingElevation} from '../components/drawingFormat';
import {caseLabel,sig3,tidyNumbers} from './reportParts';
import {toDisplay,unit} from '../engine/units';

/**
 * The forces delivered to the building columns (C4), one table printed identically on page 1, in section 3.5 and
 * on S-00: per grid, whole concurrent sets (max V, max H, max or stop longitudinal force), each with the vertical
 * reaction at its eccentricity, the strong-axis moment V·e, the weak-axis seat moment, the lateral forces at the tie
 * line and at the seat, and the longitudinal force at the seat on the girder line.
 */
const esc=(v:unknown)=>caseLabel(tidyNumbers(String(v??''))).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const deliveredHeaders=['Grid','Set','Combination','V','Mx = V·e','My,seat','H tie','H seat','F'];

/** A set label in sentence case, "and" for "&": "Max V and max F". */
const sentence=(v:string)=>{const t=v.replace(/\s*&\s*/g,' and ');return t.charAt(0).toUpperCase()+t.slice(1);};
/** Rows of the table as text, in the project units; signs: + down (V), M_y ± where reached either way, H tie either way with H seat signed relative to it, F + toward the next grid. */
export function deliveredRows(s:CalculationSnapshot,d:DeliveredForces|undefined=deliveredForces(s)){
 if(!d)return [];
 const u=s.input.units,small=(v:number|undefined,q:'force'|'moment')=>v!==undefined&&Math.abs(toDisplay(v,q,u))<.1?`${Math.abs(toDisplay(v,q,u)).toFixed(2)} ${unit(q,u)}`:sig3(v,q,u);
 const f=(v:number|undefined)=>small(v,'force'),m=(v:number|undefined)=>small(v,'moment');
 const sign=(v:number,t:string)=>Math.abs(v)<1?'—':`${v>=0?'+':'−'}${t}`;
 const row=(grid:number,i:number,x:DeliveredSet)=>[i?'':String(grid),sentence(x.label),x.combination,f(x.V),m(x.Mx),Math.abs(x.My)<1?'—':x.mirrored?`±${m(Math.abs(x.My))}`:`${x.My>=0?'+':'−'}${m(Math.abs(x.My))}`,
  `±${f(x.Htie)}`,Math.abs(x.Hseat)<1?'—':`${Math.sign(x.Hseat)===Math.sign(x.top)||Math.abs(x.top)<1?'±':'∓'}${f(Math.abs(x.Hseat))}`,sign(x.F,f(Math.abs(x.F)))];
 return d.grids.flatMap(g=>g.sets.map((x,i)=>row(g.grid,i,x)));
}

/** The key printed with the table, one line each: what acts together, where each force acts, the tie design force and the stop grids. */
export function deliveredNote(s:CalculationSnapshot,d:DeliveredForces|undefined=deliveredForces(s),separator=' '){
 if(!d)return '';
 const u=s.input.units,f=(v:number|undefined)=>sig3(v,'force',u),len=(v:number|undefined)=>sig3(v,'length',u),el=(v?:number)=>v===undefined?'':`, El. ${drawingElevation(v,u)}`;
 const grids=(v:number[])=>v.length>1?`grids ${v.slice(0,-1).join(', ')} and ${v.at(-1)}`:`grid ${v[0]}`;
 const support=s.detailResults?.taperedHaunch?'haunch':s.input.details?.bracket?.enabled?'bracket':'support';
 return [`Factored ${s.input.method}. Each row is one concurrent set; do not combine rows.`,
  `V: girder reactions on the seat${d.elevation?el(d.elevation.seat):''}, at e = ${len(d.e)} from the column centerline${d.web!==undefined&&d.e!==undefined&&d.e-d.web>1e-3?` (the far edge of the bearing plate, a conservative reaction position; the girder web is at ${len(d.web)})`:''}. Mx = V·e (column strong axis).`,
  `My,seat: moment of the unbalanced end reactions about the grid (column weak axis).`,
  `H tie: top-flange restraint force plus the Appendix 6 brace force (${f(d.brace.force)}), at the tie line${d.elevation?el(d.elevation.tie):''}; design value ${f(d.tie.design)}.`,
  `H seat: bottom-flange restraint force at the bearing bolts, ∓ opposite in sign to H tie.`,
  `F: longitudinal force at the locating bearing, + toward the next grid.${d.stopGrids.length?` Stop force ${f(d.stop)} at ${grids(d.stopGrids)} only.`:''}${railBearsOnStops(s.input)?' Traction reaches the bay under the crane, or through the floating rail string an end bay at its stop.':''}`,
  `V includes the bearing hardware on the seat; the ${support} and other support steel (${f(Math.max(0,...(s.supportReactions?.supports??[]).map(v=>v.Ds)))} per grid, dead) goes straight into the column.`].join(separator);
}

export function deliveredTableHtml(s:CalculationSnapshot,compact=false){
 const d=deliveredForces(s),rows=deliveredRows(s,d);if(!rows.length)return '';
 const sub=(h:string)=>h.replace(/^M(x|y,seat|y)/,'M<sub>$1</sub>').replace(/^H (tie|seat)$/,'H<sub>$1</sub>');
 const head=deliveredHeaders.map(sub);
 return `<table class="delivered${compact?' compact':''}"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((v,i)=>`<td${i>2?' class="num"':''}>${i===0?`<b>${esc(v)}</b>`:esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="key${compact?' counts':''}">${esc(deliveredNote(s,d,'\n')).replace(/\bM(x|y,seat|y)\b/g,'M<sub>$1</sub>').replace(/\bH (tie|seat)\b/g,'H<sub>$1</sub>').replace(/\n/g,'<br/>')}</p>`;
}
export const deliveredCss=`table.delivered{font-size:8.5px}table.delivered th:nth-child(n+4){text-align:right}table.delivered.compact{font-size:7.5px}table.delivered td.num{text-align:right;white-space:nowrap}table.by-others.matrix{font-size:7.5px}table.by-others.compact td{padding:1px 4px}`;

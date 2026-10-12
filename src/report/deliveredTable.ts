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
export const deliveredHeaders=['Grid','Set','Combination','V','Mx = V·e','My seat','H tie','H seat','F long.'];

/** Rows of the table as text, in the project units; signs: + down (V), M_y ± where reached either way, H tie either way with H seat signed relative to it, F + toward the next grid. */
export function deliveredRows(s:CalculationSnapshot,d:DeliveredForces|undefined=deliveredForces(s)){
 if(!d)return [];
 const u=s.input.units,small=(v:number|undefined,q:'force'|'moment')=>v!==undefined&&Math.abs(toDisplay(v,q,u))<.1?`${Math.abs(toDisplay(v,q,u)).toFixed(2)} ${unit(q,u)}`:sig3(v,q,u);
 const f=(v:number|undefined)=>small(v,'force'),m=(v:number|undefined)=>small(v,'moment');
 const sign=(v:number,t:string)=>Math.abs(v)<1?'0':`${v>=0?'+':'−'}${t}`;
 const row=(grid:number,i:number,x:DeliveredSet)=>[i?'':String(grid),x.label,x.combination,f(x.V),m(x.Mx),Math.abs(x.My)<1?'0':x.mirrored?`± ${m(Math.abs(x.My))}`:`${x.My>=0?'+':'−'}${m(Math.abs(x.My))}`,
  `± ${f(x.Htie)}`,Math.abs(x.Hseat)<1?'0':`${Math.sign(x.Hseat)===Math.sign(x.top)||Math.abs(x.top)<1?'±':'∓'} ${f(Math.abs(x.Hseat))}`,sign(x.F,f(Math.abs(x.F)))];
 return d.grids.flatMap(g=>g.sets.map((x,i)=>row(g.grid,i,x)));
}

/** The statement printed with the table: where each force acts, which values act together, the tie design force and the stop grids. */
export function deliveredNote(s:CalculationSnapshot,d:DeliveredForces|undefined=deliveredForces(s)){
 if(!d)return '';
 const u=s.input.units,f=(v:number|undefined)=>sig3(v,'force',u),len=(v:number|undefined)=>sig3(v,'length',u),el=(v?:number)=>v===undefined?'':`El. ${drawingElevation(v,u)}`;
 const grids=(v:number[])=>v.length>1?`grids ${v.slice(0,-1).join(', ')} and ${v.at(-1)}`:`grid ${v[0]}`;
 return `Factored AIST runway combinations (${s.input.method}); each row is one concurrent set at one grid and its values act together; rows are alternatives, not to be combined. `+
  `V: girder reactions on the seat${d.elevation?` (top of the haunch, ${el(d.elevation.seat)})`:''}, down, at e = ${len(d.e)} from the column centerline (far bearing edge, as the haunch and column checks): Mx = V·e about the column strong axis. `+
  `My: seat moment ΣV·x of the unbalanced girder end reactions about the grid, about the column weak axis (± where reached either way); it is not the girder torque about its shear center. `+
  `H tie: top-flange restraint force of the set plus the AISC Appendix 6 brace force ${f(d.brace.force)}, either direction, at the tie line${d.elevation?` (${el(d.elevation.tie)})`:''} into the column flange; its largest value is the tie design force ${f(d.tie.design)}. `+
  `H seat: bottom-flange restraint force through the bearing bolts at the seat, ∓ opposite to H tie (a couple), ± with it. `+
  `F long.: longitudinal force at the locating bearing, at the seat on the girder line, to the crane-level strut; + toward the next grid.`+
  (d.stopGrids.length?` The crane stop force ${f(d.stop)} reaches ${grids(d.stopGrids)} only (the locating ends of the end bays); traction ${f(d.traction)} reaches ${grids(d.tractionGrids)}.`:'')+
  ` The haunch self-weight is not included in V.`;
}

export function deliveredTableHtml(s:CalculationSnapshot,compact=false){
 const d=deliveredForces(s),rows=deliveredRows(s,d);if(!rows.length)return '';
 const head=deliveredHeaders.map(h=>h.replace(/^M(x|y)/,'M<sub>$1</sub>'));
 return `<table class="delivered${compact?' compact':''}"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((v,i)=>`<td${i>2?' class="num"':''}>${i===0?`<b>${esc(v)}</b>`:esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="${compact?'counts':''}">${esc(deliveredNote(s,d)).replace(/\bM(x|y)\b/g,'M<sub>$1</sub>')}</p>`;
}
export const deliveredCss=`table.delivered{font-size:8.5px}table.delivered.compact{font-size:7.5px}table.delivered td.num{text-align:right;white-space:nowrap}table.by-others.matrix{font-size:7.5px}table.by-others.compact td{padding:1px 4px}`;

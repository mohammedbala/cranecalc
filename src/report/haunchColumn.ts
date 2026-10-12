import type {CalculationSnapshot} from '../engine/types';
import {projectHaunch,haunchColumnStrengths} from '../engine/taperedHaunch';
import {columnStiffenerGeometry,stiffenerGauge} from '../engine/columnStiffeners';
import {plateInches} from '../components/drawingFormat';
import {caseLabel,sig3,tidyNumbers} from './reportParts';

/**
 * The haunch-to-column force system on the calculation page (C2): one force system per haunch flange at the column
 * face (normal force and lateral moment), the unstiffened J10.1-J10.4 values with the same equivalent concentrated
 * force at each level, the decision on the column stiffeners and how they carry the system.
 */
const esc=(v:unknown)=>caseLabel(tidyNumbers(String(v??''))).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** The column stiffeners as specified: plates, depth, fillets and where they are welded. */
export function columnStiffenerSpec(s:CalculationSnapshot|{input:CalculationSnapshot['input']}){
 const p=s.input,g=columnStiffenerGeometry(p);if(!g)return undefined;
 const pl=(v:number)=>plateInches(v,p.units),levels=g.levels.map(l=>l.name.replace(/^haunch /,'')).join(' and ');
 return `2 pairs PL ${pl(g.t)} × ${pl(g.width)}, ${g.full?'full depth':'half depth'}, one pair at the ${g.rolled?'stub':'haunch'} ${levels}; ${pl(g.s.flangeWeld)} fillets to the flange${g.full?'s':''} and ${pl(g.s.webWeld)} to the web, both faces; ${g.field?'field welded inside the existing column':'shop welded inside the new column'}`;
}

export function haunchColumnBlock(s:CalculationSnapshot){
 const p=s.input,h=s.detailResults?.taperedHaunch;if(!h||!p.details?.bracket?.enabled)return '';
 const u=p.units,F=(v:number|undefined)=>sig3(v,'force',u),M=(v:number|undefined)=>sig3(v,'moment',u),L=(v:number|undefined)=>sig3(v,'length',u),S=h.strength;
 const g=projectHaunch(p),J=haunchColumnStrengths(p,g),cs=columnStiffenerGeometry(p),pull=S.pull,push=S.push;if(!pull||!push)return '';
 const check=(id:string)=>s.checks.find(c=>c.id===id);
 const rows:{level:string;state:string;Ru:number;cap?:number}[]=[
  {level:'Top flange',state:'J10.1 flange local bending',Ru:pull.value,cap:J.flange},{level:'Top flange',state:'J10.2 web local yielding',Ru:pull.value,cap:J.yieldTop},
  {level:'Bottom flange',state:'J10.2 web local yielding',Ru:push.value,cap:J.yieldBottom},{level:'Bottom flange',state:'J10.3 web crippling',Ru:push.value,cap:J.crippling},
  {level:'Bottom flange',state:'J10.4 web sidesway buckling',Ru:push.value,cap:J.sidesway}];
 const dc=(r:typeof rows[number])=>r.cap===undefined?undefined:r.Ru/r.cap,exceeded=rows.filter(r=>(dc(r)??0)>1);
 const table=`<table class="checks j10-info"><thead><tr><th>Level</th><th>Unstiffened limit state (AISC 360-16)</th><th>R<sub>u</sub> (same at the level)</th><th>φR<sub>n</sub></th><th>D/C</th><th>${cs?'With the stiffeners':'Result'}</th></tr></thead><tbody>${rows.map(r=>{const d=dc(r);return `<tr><td>${esc(r.level)}</td><td>${esc(r.state)}</td><td class="num">${esc(F(r.Ru))}</td><td class="num">${r.cap===undefined?'—':esc(F(r.cap))}</td><td class="num">${d===undefined?'—':d.toFixed(2)}</td><td>${r.cap===undefined?'N/A: (h/t<sub>w</sub>)/(L<sub>b</sub>/b<sub>f</sub>) &gt; 1.7, J10.4(b)(2)':cs?'stiffened, not governing':d!<=1?'OK':'NG'}</td></tr>`;}).join('')}</tbody></table>`;
 const sys=(pk:typeof pull,sym:string,b:number)=>`${sym} = ${F(Math.abs(pk.P??0))} with M<sub>f</sub> = ${M(Math.abs(pk.M??0))}: R<sub>u</sub> = ${sym} + 3M<sub>f</sub>/b = ${F(Math.abs(pk.P??0))} + 3 × ${M(Math.abs(pk.M??0))}${u==='US'?' × 12 in/ft':''}/${L(b)} = ${F(pk.value)}`;
 const intro=`<p><b>Haunch flange forces on the existing column.</b> Each haunch flange delivers one force system at the column face: its normal force (top flange tension T = M/h<sub>o</sub> + P/2; bottom flange compression, horizontal component C cos α) and its lateral moment M<sub>f</sub>, from the torque of the unbalanced girder reactions about the haunch, which the haunch carries by flange bending with warping fixed at the column (AISC DG9), and from the longitudinal force. Unstiffened, the column takes each system as one equivalent concentrated force, twice the more loaded half flange, in every J10 limit state at that level: top, ${sys(pull,'T',g.btr)} (case ${esc(pull.caseId)}); bottom, ${sys(push,'C',g.bb)}.</p>`;
 if(!cs)return intro+table+`<p>${exceeded.length?`${esc(exceeded.map(r=>`${r.state} at the ${r.level.toLowerCase()}`).join(', '))} ${exceeded.length>1?'are':'is'} exceeded: a full-depth column stiffener pair at each haunch flange level (AISC J10.8) is required.`:'The unstiffened column carries both flange force systems: no column stiffeners are required.'}</p>`;
 const up=check('haunch-colstiff-upper'),low=check('haunch-colstiff-lower'),panel=check('haunch-column-panel'),gauge=stiffenerGauge(cs),spec=columnStiffenerSpec(s)!;
 const decision=`<p><b>Decision: column stiffeners required.</b> ${exceeded.length?`With this force system ${esc(exceeded.map(r=>`${r.state.replace(/^J10\.\d /,'')} (${r.state.match(/^J10\.\d/)![0]}) at the ${r.level.toLowerCase()}, D/C ${dc(r)!.toFixed(2)}`).join(', '))} ${exceeded.length>1?'are':'is'} exceeded, and`:'Although the unstiffened J10 strengths are not exceeded,'} the J10 provisions address a concentrated force, not the flange moment the haunch needs fixed at the column to carry its torque. A full-depth column stiffener pair at each haunch flange level is therefore provided and designed by AISC J10.8: ${esc(spec)}. The pair carries its flange's whole force system, with no unstiffened column strength credited: the flange force shared by the two plates and M<sub>f</sub> as a couple between them, g = t<sub>w</sub> + b<sub>s</sub> = ${L(cs.tw)} + ${L(cs.width)} = ${L(gauge)} apart, R<sub>st</sub> = T/2 ± M<sub>f</sub>/g on one plate (${up?`${F(up.demand)} at the top flange, D/C ${up.utilization!.toFixed(2)}`:''}${low?`; ${F(low.demand)} at the bottom flange, D/C ${low.utilization!.toFixed(2)}`:''}), checked for tension yielding (J4.1) and as a column with half the J10.8 web strip (J4.4), with its fillets to the flanges and the web (J2.4) and the web shear along them (J4.2). Full depth, beyond the half depth J10.8(3) requires, takes the couple to the far flange; J10.5 and J10.7 (unframed beam ends) do not apply to this continuous column. With the stiffeners, J10.1 to J10.4 are not governing and the table above is for information. The net flange force is the J10.6 panel shear${panel?` (${F(panel.demand)}, D/C ${panel.utilization!.toFixed(2)})`:''}; the stiffeners add no panel strength.${cs.field?' They are field welded inside the existing column under the same controls as the haunch welds: base metal confirmed, approved WPS and preheat, crane out of service and the column under dead load only (recorded inputs and S-00).':''}</p>`;
 return intro+table+decision;
}

import type {CalculationSnapshot} from '../engine/types';
import {projectHaunch,haunchColumnStrengths} from '../engine/taperedHaunch';
import {projectStub,stubColumnStrengths} from '../engine/rolledBracket';
import {columnStiffenerGeometry,stiffenerGauge} from '../engine/columnStiffeners';
import type {FlangePeak,FlangeLevelStrengths} from '../engine/flangeForceSystem';
import {plateInches} from '../components/drawingFormat';
import {caseLabel,sig3,tidyNumbers} from './reportParts';
import {dcText} from '../engine/checkPresentation';
import {caseName} from '../engine/caseNames';

/**
 * The bracket-to-column force system on the calculation page (C2), for the I-shaped brackets (tapered haunch, W stub):
 * one force system per bracket flange at the column face (normal force and lateral moment), the unstiffened
 * J10.1-J10.4 values with the same equivalent concentrated force at each level, the decision on the column stiffeners
 * and how they carry the system.
 */
const sentence=(v:string)=>v.charAt(0).toUpperCase()+v.slice(1);
const esc=(v:unknown)=>caseLabel(tidyNumbers(String(v??''))).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** The column stiffeners as specified: plates, depth, fillets and where they are welded. */
export function columnStiffenerSpec(s:CalculationSnapshot|{input:CalculationSnapshot['input']}){
 const p=s.input,g=columnStiffenerGeometry(p);if(!g)return undefined;
 const pl=(v:number)=>plateInches(v,p.units);
 // Each pair where its bracket delivers force: at each flange of an I-shaped bracket (W stub, tapered haunch), at the seat
 // and the rib bottom of a welded rib bracket, named from the force levels themselves.
 const flanges=g.levels.every(l=>/ flange$/.test(l.name)),where=flanges?(g.levels.length>1?`one pair at each ${g.levels[0].name.replace(/ (top|bottom) flange$/,'')} flange`:`one pair at the ${g.levels[0].name}`):`one pair at the ${g.levels.map(l=>l.name).join(' and one at the ')}`;
 return `${g.levels.length} pair${g.levels.length>1?'s':''} PL ${pl(g.t)} × ${pl(g.width)}, ${g.full?'full depth':'half depth'}, ${where}; ${pl(g.s.flangeWeld)} fillets to the flange${g.full?'s':''} and ${pl(g.s.webWeld)} to the web, both faces; ${g.field?'field welded inside the existing column':'shop welded inside the new column'}`;
}

/**
 * The flange force systems of the project's I-shaped bracket: its strength peaks (pull, push, the stiffener plate
 * forces, with the flange systems), the unstiffened column strengths at its two flange levels, the flange widths, the
 * check id prefix and how the text names the bracket.
 */
export function flangeBracket(s:CalculationSnapshot){
 const p=s.input,d=p.details;if(!d?.bracket?.enabled)return undefined;
 const h=s.detailResults?.taperedHaunch;
 if(h){const g=projectHaunch(p);return {kind:'haunch' as const,prefix:'haunch',name:'haunch',S:h.strength as Record<string,FlangePeak|undefined>,J:haunchColumnStrengths(p,g) as FlangeLevelStrengths,b:[g.btr,g.bb] as [number,number],bottom:'C\\cos\\alpha'};}
 const w=s.detailResults?.rolledBracket;
 if(w){const st=projectStub(p);return {kind:'stub' as const,prefix:'wbracket',name:'stub',S:w.strength as Record<string,FlangePeak|undefined>,J:stubColumnStrengths(p,st),b:[st.bf,st.bf] as [number,number],bottom:'C'};}
 return undefined;
}

export function flangeColumnBlock(s:CalculationSnapshot){
 const p=s.input,fb=flangeBracket(s);if(!fb)return '';
 const u=p.units,F=(v:number|undefined)=>sig3(v,'force',u),M=(v:number|undefined)=>sig3(v,'moment',u),L=(v:number|undefined)=>sig3(v,'length',u),S=fb.S;
 const J=fb.J,cs=columnStiffenerGeometry(p),pull=S.pull,push=S.push,haunch=fb.kind==='haunch',name=fb.name;if(!pull||!push)return '';
 const check=(id:string)=>s.checks.find(c=>c.id===`${fb.prefix}-${id}`);
 const rows:{level:string;state:string;Ru:number;cap?:number}[]=[
  {level:'Top flange',state:'J10.1 flange local bending',Ru:pull.value,cap:J.flange},{level:'Top flange',state:'J10.2 web local yielding',Ru:pull.value,cap:J.yieldTop},
  {level:'Bottom flange',state:'J10.2 web local yielding',Ru:push.value,cap:J.yieldBottom},{level:'Bottom flange',state:'J10.3 web crippling',Ru:push.value,cap:J.crippling},
  {level:'Bottom flange',state:'J10.4 web sidesway buckling',Ru:push.value,cap:J.sidesway}];
 const dc=(r:typeof rows[number])=>r.cap===undefined?undefined:r.Ru/r.cap,exceeded=rows.filter(r=>(dc(r)??0)>1);
 const na=rows.some(r=>r.cap===undefined);
 const table=`<table class="checks j10-info"><thead><tr><th>Level</th><th>${cs?'Unstiffened column (basis for the stiffener decision)':'Limit state (AISC 360-16)'}</th><th>R<sub>u</sub> (same at the level)</th><th>φR<sub>n</sub></th><th>D/C</th><th>Result</th></tr></thead><tbody>${rows.map(r=>{const d=dc(r);return `<tr><td>${esc(r.level)}</td><td>${esc(r.state)}</td><td class="num">${esc(F(r.Ru))}</td><td class="num">${r.cap===undefined?'—':esc(F(r.cap))}</td><td class="num">${d===undefined?'—':d.toFixed(2)}</td><td>${r.cap===undefined?'N/A *':d!<=1?'OK':cs?'Exceeded':'NG'}</td></tr>`;}).join('')}</tbody></table>${na?'<p class="key">* J10.4 does not apply: (h/t<sub>w</sub>)/(L<sub>b</sub>/b<sub>f</sub>) &gt; 1.7, J10.4(b)(2).</p>':''}`;
 const sys=(pk:typeof pull,sym:string,b:number)=>`${sym} = ${F(Math.abs(pk.P??0))} with M<sub>f</sub> = ${M(Math.abs(pk.M??0))}: R<sub>u</sub> = ${sym} + 3M<sub>f</sub>/b = ${F(Math.abs(pk.P??0))} + 3 × ${M(Math.abs(pk.M??0))}${u==='US'?' × 12 in/ft':''}/${L(b)} = ${F(pk.value)}`;
 const existing=!!p.existingColumn?.enabled&&!p.existingColumn.isNew,column=haunch||existing?'existing column':'column';
 const forces=haunch?`its normal force (top flange tension T = M/h<sub>o</sub> + P/2; bottom flange compression, horizontal component C cos α) and its lateral moment M<sub>f</sub>, from the torque of the unbalanced girder reactions about the haunch, which the haunch carries by flange bending with warping fixed at the column (AISC DG9), and from the longitudinal force`
  :`its normal force (top flange tension T = M/(d − t<sub>f</sub>) + N/2; bottom flange compression C = M/(d − t<sub>f</sub>) − N/2) and its lateral moment M<sub>f</sub>, from the torque of the unbalanced girder reactions and the longitudinal force about the stub, which the stub carries by flange bending with warping fixed at the column (AISC DG9), and from the lateral force at the bearing bolts`;
 const intro=`<p>Each ${name} flange delivers ${haunch?`an axial force (T = M/h<sub>o</sub> + P/2 at the top, C cos α at the bottom) and a lateral moment M<sub>f</sub> from the ${name} torque`:`an axial force (T = M/(d − t<sub>f</sub>) + N/2 at the top, C = M/(d − t<sub>f</sub>) − N/2 at the bottom) and a lateral moment M<sub>f</sub> from the ${name} torque and the longitudinal force`}. Unstiffened, the ${column} would take each as one concentrated force R<sub>u</sub> = T + 3M<sub>f</sub>/b, twice the more loaded half flange: top, ${sys(pull,'T',fb.b[0])}; bottom, ${sys(push,'C',fb.b[1])} (${esc(caseName(s,pull.caseId).split(',')[0])}${/\(a\)|adjacent girder end/.test(caseName(s,pull.caseId))?' (a)':''}).</p>`;
 if(!cs)return intro+table+`<p>${exceeded.length?`${esc(exceeded.map(r=>`${r.state} at the ${r.level.toLowerCase()}`).join(', '))} ${exceeded.length>1?'are':'is'} exceeded: a full-depth column stiffener pair at each ${name} flange level (AISC J10.8) is required.`:'The unstiffened column carries both flange force systems: no column stiffeners are required.'}</p>`;
 const up=check('colstiff-upper'),low=check('colstiff-lower'),panel=check('column-panel'),gauge=stiffenerGauge(cs),spec=columnStiffenerSpec(s)!,depth=cs.full?'full-depth':'half-depth';
 const reach=cs.full?'Full depth, beyond the half depth J10.8(3) requires, takes the couple to the far flange':'Half depth, to the column centerline as J10.8(3) requires: the couple passes into the loaded flange and the web';
 // The exceeded limit states grouped by state: "web local yielding (J10.2) at both flange levels (D/C 1.32 top, 1.20 bottom)".
 // J10.2 with the column's k (receiverWebK: surveyed, k_des of its AISC shape, else t_f without rolled-fillet credit).
 const fillet=`; ${esc(J.kText)}`;
 const states=[...new Set(exceeded.map(r=>r.state))].map(st=>{const v=exceeded.filter(r=>r.state===st),cl=st.match(/^J10\.\d/)![0];
  return `${esc(st.replace(/^J10\.\d /,''))} (${cl}) is exceeded at ${v.length>1?'both flange levels':`the ${v[0].level.toLowerCase()}`} (D/C ${v.map(r=>`${dc(r)!.toFixed(2)}${v.length>1?` ${r.level.split(' ')[0].toLowerCase()}`:''}`).join(', ')}${cl==='J10.2'?fillet:''})`;});
 const decision=`<p><b>Column stiffeners required.</b> ${states.length?`Unstiffened, ${states.join('; ')}, and`:'The unstiffened J10 strengths are not exceeded, but'} the ${name} needs M<sub>f</sub> resisted at the column. ${sentence(depth)} stiffener pairs (${esc(spec)}) carry each flange's full force system with no credit for the unstiffened column: R<sub>st</sub> = T/2 ± M<sub>f</sub>/g, g = t<sub>w</sub> + b<sub>s</sub> = ${L(gauge)}${up||low?`, giving ${[up?`${F(up.demand)} at the top (D/C ${dcText(up.utilization,2)})`:'',low?`${F(low.demand)} at the bottom (D/C ${dcText(low.utilization,2)})`:''].filter(Boolean).join(' and ')}`:''}. The pairs are checked for J4.1 yielding, J4.4 buckling with the J10.8 web strip, J2.4 welds and J4.2 web shear. ${reach}; J10.5 and J10.7 do not apply to this continuous column.${panel?.demand!==undefined?` Panel shear J10.6: ${F(panel.demand)}, D/C ${dcText(panel.utilization,2)}; the stiffeners add no panel strength.`:''}${cs.field?` Field welding controls: section @@ref:fabrication@@.`:''}</p>`;
 return intro+table+decision;
}
/** The tapered haunch's block (C2); flangeColumnBlock serves the W stub too. */
export const haunchColumnBlock=(s:CalculationSnapshot)=>s.detailResults?.taperedHaunch?flangeColumnBlock(s):'';

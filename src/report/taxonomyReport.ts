import type {CalculationSnapshot,CheckResult,ProjectInput} from '../engine/types';
import {toDisplay,unit,type Quantity} from '../engine/units';
import {dcText} from '../engine/checkPresentation';
import {allCycleRange,categoryLabel,checkTypeLabel,effectLabel,gateLabel,registerPoints,type BodyLine,type FatigueRow,type Taxonomy,type TaxonEntry} from '../engine/checkTaxonomy';
import {caseLabel,equationCell,fixed2,shortReference,sig3,statusLabel,subscripts,tidyNumbers,value} from './reportParts';
import {responsibilityMatrix,responsibilityBlock} from './responsibility';
import {damageText} from '../engine/fatigueConstants';

/**
 * Report blocks driven by the check taxonomy: body rows of the governing DESIGN checks, page-1 open items and counts,
 * the fatigue table, the detailing checklist, the input / load-basis / classification tables, the "not checked in
 * this package" list, Appendix A and the CSV of every computed result.
 */
const esc=(v:unknown)=>subscripts(caseLabel(tidyNumbers(String(v??''))).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)));
type Units=ProjectInput['units'];
const q=(c:CheckResult)=>c.quantity??'ratio';
const ksi=6.894757293168;
const stress=(v:number|undefined,u:Units)=>v===undefined||!Number.isFinite(v)?'—':u==='US'?`${(v/ksi).toFixed(2)} ksi`:`${v.toFixed(1)} MPa`;
/** Sentences split at a stop followed by a capital, so decimals (1.0Cbs, 7.2 kip) stay whole. */
const sentences=(v:string)=>v.split(/(?<=[.;])\s+(?=[A-Z])/).map(t=>t.trim()).filter(Boolean);
const firstSentence=(v:string)=>sentences(v)[0]??'';

/** One body row per line: the controlling limit state with its equation, demand, limit and D/C; merged lines name it. */
export function bodyTable(lines:BodyLine[],tax:Taxonomy,units:Units){
 if(!lines.length)return '';
 return `<table class="checks body-checks"><colgroup><col class="c-title"/><col class="c-eq"/><col class="c-num"/><col class="c-num"/><col class="c-dc"/><col class="c-res"/></colgroup><thead><tr><th>Check · reference</th><th>Equation</th><th>Demand</th><th>Limit</th><th>D/C</th><th>Result</th></tr></thead><tbody>${lines.map(l=>{
  const c=l.controlling,t=tax.entries.get(c.id)!;
  const head=l.merged?`<b>${esc(l.title)}</b><small class="ctrl">Controlling: ${esc(c.title)}${l.also.length?`; also ${l.also.map(a=>`${esc(a.title)} ${dcText(a.utilization,2)}`).join('; ')}`:''} · ${l.members.length} limit states</small>`:`<b>${esc(c.title)}</b>`;
  const typical=t.typicalOf>1?` <span class="family">typical of ${t.typicalOf}</span>`:'';
  return `<tr class="${c.status}" data-checks="${esc(l.members.map(m=>m.id).join(' '))}"><td>${head}${typical}${l.owner?' <span class="family">owner criterion</span>':''}<small class="ref">${esc(shortReference(c))}</small>${c.caseId?`<small class="ref">Governing case: ${esc(tax.caseName(c.caseId))}</small>`:''}</td><td class="eq">${equationCell(c)}</td><td class="num">${value(c.demand,q(c),units)}</td><td class="num">${value(c.capacity,q(c),units)}</td><td class="num">${dcText(c.utilization,2,'—')}</td><td class="res"><b class="${c.status}">${esc(statusLabel(c.status))}</b></td></tr>`;
 }).join('')}</tbody></table>`;
}
/** "N other limit states checked, max D/C x.xx (Appendix A)". */
export const othersLine=(checks:CheckResult[])=>{
 if(!checks.length)return '';
 const max=Math.max(...checks.map(c=>c.utilization??0));
 return `<p class="others">${checks.length} other limit state${checks.length>1?'s':''} checked, max D/C ${dcText(max,2)} (Appendix A).</p>`;
};

const kindLabel={clash:'Clash / coordination',redesign:'Redesign flag',input:'Missing or inconsistent input',detailing:'Detailing rule not met'} as const;
/** Page 1, first: every open item (clashes, redesign flags, missing input) and the by-others list. */
export function openItemsBlock(tax:Taxonomy,s:CalculationSnapshot){
 const items=tax.openItems;
 const list=items.length?`<table class="open-items"><thead><tr><th>Open item</th><th>Check</th><th>Status</th><th>What is needed</th></tr></thead><tbody>${items.map(o=>`<tr><td><b>${kindLabel[o.kind]}</b></td><td>${esc(o.check.title)}${o.check.utilization!==undefined&&Number.isFinite(o.check.utilization)&&o.check.status==='fail'?` (D/C ${dcText(o.check.utilization,2)})`:''}<small>${esc(o.check.group)}</small></td><td><b>${esc(statusLabel(o.check.status))}</b></td><td>${esc(sentences(o.check.note.replace(/^OPEN ITEM:\s*/,'')).slice(0,2).join(' '))}</td></tr>`).join('')}</tbody></table>`:'';
 return `<h2>Open items</h2>${items.length?list:'<p>No open coordination, redesign or input items.</p>'}${byOthersBlock(tax,s,true)}`;
}
/** The pass banner: never "no failed checks" while an open item exists. */
export function banner(tax:Taxonomy,draft=false){
 const n=tax.openItems.length,g=tax.governing;
 const head=draft?'<b>REVIEW DRAFT — NOT FOR ISSUE.</b> Open items include missing input (unverified); the calculation cannot be issued until they are resolved.<br/>':'';
 if(n){const kinds=[...new Set(tax.openItems.map(o=>kindLabel[o.kind].toLowerCase()))];return `<div class="banner fail">${head}<b>${n} OPEN ITEM${n>1?'S':''} — REVIEW REQUIRED, DO NOT ISSUE FOR CONSTRUCTION</b><br/>${esc(kinds.join('; '))}: listed below.${g?` Governing design D/C ${dcText(g.dc,2)}: ${esc(g.title)} (${esc(g.element)}).`:''}</div>`;}
 return `<div class="banner"><b>ALL DESIGN CHECKS SATISFIED</b> — no open items.${g?` Governing design D/C ${dcText(g.dc,2)}: ${esc(g.title)} (${esc(g.element)}).`:''}</div>`;
}
/** Counts: design checks evaluated E (shown S), screened R, detailing rules D (F flagged). */
export function countsLine(tax:Taxonomy){
 const c=tax.counts,design=[...tax.entries.values()].filter(t=>t.type==='design'),reg=(gate:string)=>design.filter(t=>t.gate===gate&&/^detail-(fatigue|full-cycle)-/.test(t.check.id)).map(t=>t.check);
 const ev=reg('evaluated'),sc=reg('screened'),regText=(v:CheckResult[])=>v.length?`; ${v.length} of them at ${registerPoints(v)} fatigue register points`:'';
 return `<p class="counts">A check is one computed result (one row of Appendix A and of the CSV); a body row shows the governing check of a limit state, a merged group or a fatigue detail; a fatigue register point is one station and flange edge of the girder detail register, with two checks (equivalent range and all-cycle). <b>Design checks evaluated ${c.designEvaluated}</b> (${c.designShown} body rows${regText(ev)}), <b>screened ${c.designScreened}</b>${sc.length?` (${sc.length} of them at ${registerPoints(sc)} register points)`:''}, not applicable ${c.designNotApplicable}; <b>detailing rules ${c.detailing}</b> (${c.detailingFlagged} flagged). Also recorded: ${c.byType.classification} classifications, ${c.byType.verification} analysis verifications, ${c.byType.input} inputs, ${c.byType['load-basis']} load-basis comparisons, ${c.byType['by-others']} by others — ${c.total} results in all (Appendix A and the CSV).</p>`;
}

/**
 * What this package leaves to others: the responsibility matrix (item, what is needed, acceptance criterion, force
 * and location delivered, responsible party), compact on page 1 and complete in section 6.7 (responsibility.ts).
 */
export function byOthersItems(tax:Taxonomy,s:CalculationSnapshot){return responsibilityMatrix(tax,s);}
export function byOthersBlock(tax:Taxonomy,s:CalculationSnapshot,compact=false){return responsibilityBlock(tax,s,compact);}

/** Category as printed in the fatigue table: "D", "C″ (root, R_FIL = 0.70)" (R_FIL = F_SR / F_SR,C at n_SR), "item 8.5". */
const catHtml=(r:FatigueRow,n:number)=>{const l=esc(categoryLabel(r.category,r.title));
 if(r.category!=="C''"||!r.capacity)return l.replace('R_FIL','R<sub>FIL</sub>');
 return l.replace('R_FIL)',`R<sub>FIL</sub> = ${(r.capacity/allCycleRange('C',n)).toFixed(2)})`);};
/**
 * The fatigue table: every evaluated detail at the design cycle count n_SR with the Miner equivalent range f_sr,eq and
 * the largest range f_sr,max against the same F_SR at n_SR (two D/Cs on one basis, the project method's in bold), the
 * damage sum for information; the screened details counted. A detail is one row (a family of register points of one
 * detail and category, or one named check); a check is one computed result of Appendix A.
 */
export function fatigueTable(tax:Taxonomy,units:Units){
 const F=tax.fatigue,miner=F.method==='miner',gate=(c:CheckResult)=>tax.entries.get(c.id)?.gate;
 const all=[...F.evaluated,...F.screened].flatMap(r=>r.members),nEv=all.filter(c=>gate(c)==='evaluated').length,nSc=all.filter(c=>gate(c)==='screened').length;
 // Register points of a detail: all of them, and those screened below F_TH on their own range.
 const typical=(r:FatigueRow)=>{if(r.points<=1)return '';const sc=registerPoints(r.members.filter(c=>gate(c)==='screened'));
  return `<small>typical of ${r.points} register points${sc?` (${r.points-sc} evaluated, ${sc} below F<sub>TH</sub>)`:''}</small>`;};
 const ratio=(v:number|undefined,governs:boolean)=>v===undefined?'—':governs?`<b>${dcText(v,2)}</b>`:dcText(v,2);
 const row=(r:FatigueRow,i:number)=>{const byMiner=miner&&r.miner!==undefined;
  return `<tr class="${r.governing.status}"><td><span class="step">${i+1}</span> <b>${esc(r.title)}</b>${typical(r)}<small>${esc(r.location)}</small></td><td>${catHtml(r,F.cycles)}</td><td class="num">${r.threshold===undefined?'none':stress(r.threshold,units)}</td><td class="num">${stress(r.capacity,units)}</td><td class="num">${stress(r.range,units)}</td><td class="num">${stress(r.equivalent,units)}</td><td class="num">${r.damage===undefined?'—':damageText(r.damage)}</td><td class="num">${ratio(r.miner,byMiner)}</td><td class="num">${ratio(r.allCycle,!byMiner)}</td><td class="res"><b>${esc(statusLabel(r.governing.status))}</b></td></tr>`;};
 const peak=F.peak?`<p>Peak stress under the unfactored cyclic loads (AISC 360-16 Appendix 3.1, f<sub>max</sub> ≤ 0.66F<sub>y</sub>): D/C ${dcText(F.peak.controlling.utilization,2)}, ${stress(F.peak.controlling.demand,units)} against ${stress(F.peak.controlling.capacity,units)} (${esc(F.peak.controlling.title)}; dead load plus the unfactored fatigue loading, never a factored stress).</p>`:'';
 const n=F.cycles.toLocaleString('en-US');
 return `<p><b>Basis.</b> AISC 360-16 Appendix 3 at the design cycle count n<sub>SR</sub> = ${n} (the sum of the duty bins). Miner’s rule over the duty bins is reported as the equivalent constant-amplitude stress range f<sub>sr,eq</sub> = (Σn<sub>i</sub>f<sub>sr,i</sub><sup>3</sup>/n<sub>SR</sub>)<sup>1/3</sup> against F<sub>SR</sub> at n<sub>SR</sub>; the all-cycle bound compares the largest bin range f<sub>sr,max</sub> with the same F<sub>SR</sub>. F<sub>SR</sub> is taken without the threshold F<sub>TH</sub> (no endurance-limit credit in a variable spectrum), so both ratios are on one basis and f<sub>sr,eq</sub>/F<sub>SR</sub> = (Σn<sub>i</sub>/N<sub>i</sub>)<sup>1/3</sup>; the damage sum Σn<sub>i</sub>/N<sub>i</sub> is listed for information. <b>${miner?'Governing method: Miner’s rule, D/C = f<sub>sr,eq</sub>/F<sub>SR</sub> (bold); the all-cycle ratio is shown alongside.':'Governing method: all-cycle bound, D/C = f<sub>sr,max</sub>/F<sub>SR</sub> (bold); the Miner ratio is shown alongside.'}</b> A detail is one row of the table (a family of register points of the same detail and category, or one named check); a check is one computed result in Appendix A. <b>${F.evaluated.length} detail${F.evaluated.length===1?'':'s'} evaluated; ${F.screened.length} detail${F.screened.length===1?'':'s'} screened</b> below F<sub>TH</sub> (AISC 360-16 Appendix 3.1: largest live-load stress range less than F<sub>TH</sub>; a weld-root detail, Category C″ with R<sub>FIL</sub> &lt; 1 (Eq. A-3-6), has no threshold and is always evaluated). Of their ${all.length} checks, ${nEv} are evaluated and ${nSc} screened: a register point whose own largest range is below F<sub>TH</sub> is screened, also within an evaluated detail. Every check is in Appendix A and the CSV.</p>`
  +(F.evaluated.length?`<table class="checks fatigue-table"><colgroup><col style="width:27%"/><col style="width:8%"/><col style="width:7%"/><col style="width:8%"/><col style="width:8%"/><col style="width:8%"/><col style="width:8%"/><col style="width:8%"/><col style="width:9%"/><col style="width:7%"/></colgroup><thead><tr><th>Detail · governing location</th><th>Cat.</th><th>F<sub>TH</sub></th><th>F<sub>SR</sub> at n<sub>SR</sub></th><th>f<sub>sr,max</sub></th><th>f<sub>sr,eq</sub></th><th>Σn<sub>i</sub>/N<sub>i</sub></th><th>Miner f<sub>sr,eq</sub>/F<sub>SR</sub></th><th>All-cycle f<sub>sr,max</sub>/F<sub>SR</sub></th><th>Result</th></tr></thead><tbody>${F.evaluated.map((r,i)=>row(r,i)).join('')}</tbody></table>`:'')+peak
  +(F.screened.length?`<p class="others">Screened details (${F.screened.length}), closest to F<sub>TH</sub>: ${[...F.screened].filter(r=>r.range!==undefined&&r.threshold).sort((a,b)=>b.range!/b.threshold!-a.range!/a.threshold!).slice(0,4).map(r=>`${esc(r.title)} ${stress(r.range,units)} vs ${stress(r.threshold,units)}`).join('; ')}.</p>`:'');
}

const margin=(c:CheckResult,units:Units)=>{
 if(c.demand===undefined||c.capacity===undefined||!Number.isFinite(c.capacity))return '—';
 if(c.quantity!=='length'){const m=Math.max(0,1-(c.utilization??0));return `${(m*100).toFixed(0)}%`;}
 const m=Math.abs(c.capacity-c.demand);if(m<1e-6)return '0';
 return fixed2(m,'length',units);
};
/** The detailing checklist: failures and rules met with less than 1/8 in (or 10%) margin; everything else in one line. */
export function detailingChecklist(tax:Taxonomy,units:Units){
 const D=tax.detailing,flags=D.flagged;
 const rows=flags.map(({entry:t,reason})=>{const c=t.check;return `<tr class="${c.status}"><td><b>${esc(c.title)}</b><small>${esc(t.elementLabel)} · ${esc(shortReference(c))}</small></td><td class="num">${value(c.demand,q(c),units)}</td><td class="num">${value(c.capacity,q(c),units)}</td><td class="num">${margin(c,units)}</td><td>${esc(reason)}</td><td class="res"><b class="${c.status}">${c.status==='pass'?'MET':esc(statusLabel(c.status))}</b></td></tr>`;}).join('');
 const gated=D.gated.filter(t=>t.gate==='advisory'||t.gate==='not-applicable');
 return `<p>Detailing rules are pass/fail: they never set the governing D/C. Listed: rules not met and rules met with less than 1/8 in or 10% margin (fit rules: less than the 1/8 in setting and fit-up tolerance).</p>`
  +(flags.length?`<table class="checks detailing-list"><colgroup><col style="width:36%"/><col style="width:11%"/><col style="width:11%"/><col style="width:9%"/><col style="width:25%"/><col style="width:8%"/></colgroup><thead><tr><th>Rule · element · reference</th><th>Required / provided</th><th>Limit</th><th>Margin</th><th>Flag</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>`:'')
  +`<p class="others"><b>${D.satisfied} detailing rules satisfied</b> with more margin (Appendix A).${gated.length?` Not applicable or advisory: ${gated.map(t=>`${esc(t.check.title)} — ${esc(gateLabel[t.gate].toLowerCase())}`).join('; ')}.`:''}</p>`;
}

/** The value of a recorded input: a specified temperature (preheat) as specified, else the recorded quantity. */
const inputValue=(c:CheckResult,units:Units)=>{const v=c.quantity==='temperature'&&c.capacity!==undefined?c.capacity:c.demand;return v!==undefined?value(v,q(c),units):'—';};
/** Recorded inputs with their source (survey, mill certificate, supplier). */
export function inputsTable(tax:Taxonomy,units:Units){
 const v=[...tax.entries.values()].filter(t=>t.type==='input');if(!v.length)return '';
 return `<h3>Recorded inputs and assumptions</h3><table class="assumptions"><colgroup><col style="width:28%"/><col style="width:52%"/><col style="width:10%"/><col style="width:10%"/></colgroup><thead><tr><th>Input</th><th>Basis and source</th><th>Value</th><th>Status</th></tr></thead><tbody>${v.map(t=>{const c=t.check;return `<tr class="${c.status}"><td><b>${esc(c.title)}</b></td><td>${esc(firstSentence(c.note))}</td><td class="num">${inputValue(c,units)}</td><td><b>${esc(statusLabel(c.status))}</b></td></tr>`;}).join('')}</tbody></table>`;
}
/** Supplied load against the code minimum, with the value that governs. */
export function loadBasisTable(tax:Taxonomy,units:Units){
 // Rows that compare something (demand = code minimum, capacity = value used); 1.00 / 1.00 inclusion records are left out.
 const v=[...tax.entries.values()].filter(t=>t.type==='load-basis'&&!(q(t.check)==='ratio'&&t.check.demand===1&&t.check.capacity===1));if(!v.length)return '';
 return `<h3>Load basis: supplied value against the code minimum</h3><table class="load-basis"><colgroup><col style="width:30%"/><col style="width:14%"/><col style="width:14%"/><col style="width:14%"/><col style="width:28%"/></colgroup><thead><tr><th>Load</th><th>Supplied / used</th><th>Code minimum</th><th>Governs</th><th>Basis</th></tr></thead><tbody>${v.map(t=>{const c=t.check,has=c.demand!==undefined&&c.capacity!==undefined;
  // The value used is the greater of the two: when it exceeds the code minimum the supplier value governs.
  const gov=!has?'—':c.capacity!>c.demand!+1e-9*Math.max(1,Math.abs(c.demand!))?'Supplier':'Code minimum';
  return `<tr><td><b>${esc(c.title)}</b></td><td class="num">${has?value(c.capacity,q(c),units):'—'}</td><td class="num">${has?value(c.demand,q(c),units):'—'}</td><td>${esc(gov)}</td><td>${esc(shortReference(c))}</td></tr>`;}).join('')}</tbody></table>`;
}
/** Section and element classification, feeding the strength checks (not checks themselves). */
export function classificationTable(tax:Taxonomy,units:Units){
 const v=[...tax.entries.values()].filter(t=>t.type==='classification');if(!v.length)return '';
 const result=(t:TaxonEntry)=>{const c=t.check;if(t.gate==='modifier')return c.status==='fail'||(c.utilization??0)>1?'F13.1 not met: F13-1 applies':'F13.1 met: no reduction';if(c.status==='not-applicable')return 'Not applicable';
  if(/compact/i.test(c.title))return c.status==='pass'?'Compact':'Noncompact / slender';return c.status==='pass'?'Within limit':'Outside limit';};
 return `<h3>Section and element classification (feeds the strength checks)</h3><table class="classification"><colgroup><col style="width:34%"/><col style="width:16%"/><col style="width:12%"/><col style="width:12%"/><col style="width:26%"/></colgroup><thead><tr><th>Element · test</th><th>Element</th><th>Ratio</th><th>Limit</th><th>Classification</th></tr></thead><tbody>${v.map(t=>{const c=t.check;return `<tr><td><b>${esc(c.title)}</b><small>${esc(shortReference(c))}</small></td><td>${esc(t.elementLabel)}</td><td class="num">${t.gate==='modifier'?'—':sig3(c.demand,q(c),units)}</td><td class="num">${t.gate==='modifier'?'—':sig3(c.capacity,q(c),units)}</td><td>${esc(result(t))}</td></tr>`;}).join('')}</tbody></table>`;
}
/** "Analysis verified: N criteria, max ratio x". */
export function verificationLine(tax:Taxonomy){
 const v=[...tax.entries.values()].filter(t=>t.type==='verification');if(!v.length)return '';
 const max=Math.max(...v.map(t=>t.check.utilization??0)),bad=v.filter(t=>t.check.status!=='pass');
 return `<p class="verified"><b>Analysis verified: ${v.length} criteria, max ratio ${dcText(max,2)}${bad.length?`; ${bad.length} NOT MET`:''}.</b> Equilibrium residuals and moving-load / station refinement (${v.map(t=>esc(t.check.title)).join(', ')}); every value in Appendix A.</p>`;
}

const location=(t:TaxonEntry)=>t.location??'';
/**
 * Appendix A: every computed result, with its type, element, gate, demand, limit, D/C and reference. A check repeated
 * over many stations or register points (rail clips, cap weld base metal, holes; Miner and all-cycle separately) is
 * one row: its governing instance with "typical of N", the governing location and the range of D/C. Every instance,
 * with its id, is in the CSV.
 */
export function appendixA(tax:Taxonomy,units:Units){
 const order:Record<string,number>={design:0,detailing:1,classification:2,input:3,'load-basis':4,verification:5,'by-others':6};
 // Grouped: register points of one detail family, and one check repeated at stations (the same title but for numbers and sides).
 const same=(t:TaxonEntry)=>t.check.title.replace(/\d+(\.\d+)?/g,'#').replace(/\s*·\s*(left|right)\b/g,'');
 const all=[...tax.entries.values()],groupOf=(t:TaxonEntry)=>t.repeat?`${t.repeat}|${t.repeat.startsWith('register:')?'':same(t)}|${/^detail-full-cycle-/.test(t.check.id)?'all-cycle':'miner'}`:undefined;
 const groups=new Map<string,TaxonEntry[]>();for(const t of all){const k=groupOf(t);if(k)groups.set(k,[...(groups.get(k)??[]),t]);}
 const dc=(t:TaxonEntry)=>t.check.utilization!==undefined&&Number.isFinite(t.check.utilization)?t.check.utilization:-1;
 const rows:{t:TaxonEntry;members:TaxonEntry[]}[]=[];
 for(const t of all){
  const k=groupOf(t);if(!k){rows.push({t,members:[t]});continue;}
  const v=groups.get(k)!;if(v.length<3){rows.push({t,members:[t]});continue;}
  const gov=v.reduce((a,b)=>(b.check.status==='fail'?1e9:0)+dc(b)>(a.check.status==='fail'?1e9:0)+dc(a)?b:a,v[0]);
  if(t===gov)rows.push({t,members:v});
 }
 rows.sort((a,b)=>order[a.t.type]-order[b.t.type]||a.t.elementLabel.localeCompare(b.t.elementLabel));
 const range=(v:TaxonEntry[])=>{const d=v.map(dc).filter(x=>x>=0);if(!d.length)return '';const lo=dcText(Math.min(...d),2),hi=dcText(Math.max(...d),2);return lo===hi?`D/C ${hi}`:`D/C ${lo} to ${hi}`;};
 const grouped=rows.filter(r=>r.members.length>1).reduce((n,r)=>n+r.members.length,0);
 return `<p>Every computed result (${all.length}). Type: design checks count toward the governing D/C; detailing rules are pass/fail; the rest are recorded. Gate: evaluated, screened (with the reason) or not applicable. A check repeated at many stations or register points is printed once (${rows.filter(r=>r.members.length>1).length} rows for ${grouped} results): its governing instance, the number of points and the range of D/C. Every result, with its location, is listed in the check-results CSV.</p><table class="appendix-a"><colgroup><col style="width:7%"/><col style="width:10%"/><col style="width:25%"/><col style="width:16%"/><col style="width:8%"/><col style="width:8%"/><col style="width:5%"/><col style="width:6%"/><col style="width:15%"/></colgroup><thead><tr><th>Type</th><th>Element</th><th>Check · reference</th><th>Gate · reason</th><th>Demand</th><th>Limit</th><th>D/C</th><th>Result</th><th>Repeats · case</th></tr></thead><tbody>${rows.map(({t,members})=>{const c=t.check,n=members.length;
  const where=t.location?`<small>${n>1?'governs at ':''}${esc(t.location)}</small>`:'';
  return `<tr class="${c.status}" data-check="${esc(c.id)}"${n>1?` data-members="${esc(members.map(m=>m.check.id).join(' '))}"`:''}><td>${esc(checkTypeLabel[t.type])}${t.effect?`<small>${esc(effectLabel[t.effect])}</small>`:''}</td><td>${esc(t.elementLabel)}</td><td>${esc(c.title)}<small>${esc(shortReference(c))}</small></td><td>${esc(gateLabel[t.gate])}${t.reason?`<small>${esc(t.reason)}</small>`:''}</td><td class="num">${value(c.demand,q(c),units)}</td><td class="num">${value(c.capacity,q(c),units)}</td><td class="num">${dcText(c.utilization,2,'—')}</td><td>${esc(statusLabel(c.status))}</td><td>${n>1?`typical of ${n}; ${range(members)}`:''}${where}${c.caseId?`<small>${esc(tax.caseName(c.caseId))}</small>`:''}</td></tr>`;}).join('')}</tbody></table>`;
}
export const taxonomyCss=`figure.fatigue-sn{display:block}figure.fatigue-sn>svg{display:block;width:100%;max-width:600px;height:auto;margin:0 auto 4px}table.body-checks small.ctrl{display:block;font-size:7.5px;margin-top:1px}p.others{font-size:8.5px;margin:2px 0 8px;font-style:italic}p.counts{font-size:9px;border:1px solid #000;padding:4px 8px}table.open-items,table.by-others{font-size:8.5px}table.open-items small,table.by-others small{display:block;font-size:7.5px}table.fatigue-table td small,table.detailing-list td small,table.classification td small{display:block;font-size:7.5px}table.appendix-a{font-size:6.8px}table.appendix-a td{padding:1px 2px;border-bottom:.3px solid #999}table.appendix-a small{display:block;font-size:6px;color:#333}table.appendix-a th{font-size:7px}table.assumptions,table.load-basis,table.classification{font-size:8.5px}p.verified{border-left:3px solid #000;padding:2px 6px}`;

/** A CSV number as the report prints it (three significant figures, whole numbers from 100 up), without separators. */
function csvNumber(v:number|undefined,q:Quantity,units:Units){
 if(v===undefined||!Number.isFinite(v))return '';
 const d=Number(toDisplay(v,q,units).toPrecision(12)),a=Math.abs(d);if(a<5e-5)return '0';
 // A US length of whole sixteenths (a size, a tolerance) is exact: 0.375, not 0.38.
 if(q==='length'&&units==='US'&&Math.abs(d*16-Math.round(d*16))<1e-6)return String(d);
 const decimals=q==='temperature'||q==='temperatureChange'?0:a<.1?Math.min(6,1-Math.floor(Math.log10(a))):a>=100?0:Math.min(2,Math.max(0,2-Math.floor(Math.log10(a))));
 return String(Number(d.toFixed(decimals)));
}
/**
 * CSV of every computed result: type, element, location, group and typical-of-N, gate and reason, values, reference,
 * case. Values are in the project's units (US: kip, in, ksi, kip-ft; SI: kN, mm, MPa, kN·m) rounded as the report
 * prints them, with the unit of each row; `internal: true` gives the unrounded SI-internal values (N, mm, MPa) for tools.
 */
export function checksCsv(s:CalculationSnapshot,tax:Taxonomy,o:{internal?:boolean}={}){
 const cell=(v:unknown)=>{const t=String(v??'');return /[",\n]/.test(t)?`"${t.replace(/"/g,'""')}"`:t;};
 const units=s.input.units;
 const head=['id','type','effect','element','title','group','location','repeat_group','typical_of','governs_group','body_line','gate','gate_reason','status','demand','capacity','utilization','quantity','units','reference','case','case_name','classification_rule'];
 const rows=[...tax.entries.values()].map(t=>{const c=t.check,line=t.line&&tax.shown.some(l=>l.key===t.line)?t.line:'',qq=(c.quantity??'ratio') as Quantity;
  const [demand,capacity,util,u]=o.internal?[c.demand??'',c.capacity??'',c.utilization??'','SI internal (N, mm, MPa)']:[csvNumber(c.demand,qq,units),csvNumber(c.capacity,qq,units),c.utilization!==undefined&&Number.isFinite(c.utilization)?Number(c.utilization.toFixed(c.utilization<.1&&c.utilization>0?4:2)):'',unit(qq,units)];
  return [c.id,t.type,t.effect??'',t.elementLabel,c.title,c.group,t.location??'',t.repeat??'',t.typicalOf,t.governsRepeat?'yes':'',line,t.gate,t.reason??'',c.status,demand,capacity,util,c.quantity??'',u,shortReference(c),c.caseId??'',c.caseId?tax.caseName(c.caseId):'',t.rule];});
 return [head,...rows].map(r=>r.map(cell).join(',')).join('\n')+'\n';
}

/**
 * Fatigue summary plot (S-N, log-log, black and white): for each evaluated detail, numbered as in the fatigue table and
 * drawn with its own marker shape, its duty bins (n_i, f_sr,i) as open markers, the Miner equivalent range f_sr,eq at
 * the design cycle count n_SR as a filled marker and the largest range there (the all-cycle bound) as a bar; its design
 * curve F_SR(n) (Appendix 3 Eq. A-3-1, slope 1/3; Category F Eq. A-3-2, slope 1/6) through F_SR at n_SR (so R_FIL
 * reductions carry over) down to the threshold F_TH (none for a C″ root), labelled at its right end. Details on one
 * curve share it. Screened details: crosses at n_SR, at their largest range. Full titles in the key below the plot.
 */
export function fatigueSnPlot(tax:Taxonomy,units:Units){
 const F=tax.fatigue,N=F.cycles,toU=(v:number)=>units==='US'?v/ksi:v,unit=units==='US'?'ksi':'MPa';
 const rows=F.evaluated.map((r,i)=>({r,i,n:i+1})).filter(({r})=>r.range!==undefined&&r.capacity!==undefined&&r.capacity>0).map(({r,i,n})=>{
  const m=/^F$/.test(r.category)?6:3,FSR=toU(r.capacity!),TH=r.threshold===undefined?0:toU(r.threshold);
  const bins=(r.bins?.length?r.bins:[{cycles:N,range:r.range!}]).filter(b=>b.cycles>0&&b.range>0).map(b=>({n:b.cycles,f:toU(b.range)}));
  return {n,i,m,FSR,TH,range:toU(r.range!),eq:r.bins?.length&&r.equivalent!==undefined?toU(r.equivalent):undefined,bins,label:categoryLabel(r.category,r.title),title:r.title};
 });
 const scr=F.screened.filter(r=>r.range!==undefined&&r.range>0).map(r=>({range:toU(r.range!)}));
 if(!rows.length&&!scr.length)return '';
 const x0=4,x1=8,W=600,L=50,R=118,T=14,ph=240,pw=W-L-R;
 // F_SR(n): through F_SR at N with slope 1/m, not below F_TH.
 const curve=(r:typeof rows[number],n:number)=>Math.max(r.FSR*(N/n)**(1/r.m),r.TH);
 const vals=rows.length?rows.flatMap(r=>[r.range,curve(r,10**x0),curve(r,10**x1),...r.bins.map(b=>b.f),...(r.eq?[r.eq]:[])]):scr.map(s=>s.range);
 // The axis spans the evaluated details; screened ranges below it are counted in the key, not drawn.
 const y0=Math.floor(Math.log10(Math.min(...vals)*.8)),y1=Math.ceil(Math.log10(Math.max(...vals)*1.2));
 const X=(n:number)=>L+(Math.log10(n)-x0)/(x1-x0)*pw,Y=(v:number)=>T+ph-(Math.log10(v)-y0)/(y1-y0)*ph,clipY=(v:number)=>Math.min(Math.max(v,10**y0),10**y1);
 // One marker shape per detail (open or filled), centered at (x, y).
 const shape=(k:number,x:number,y:number,fill:boolean,s=3)=>{
  const st=`fill="${fill?'#000':'#fff'}" stroke="#000" stroke-width=".8"`,p=(pts:number[][])=>`<polygon points="${pts.map(([a,b])=>`${(x+a*s).toFixed(1)},${(y+b*s).toFixed(1)}`).join(' ')}" ${st}/>`;
  switch(k%7){
   case 0:return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s}" ${st}/>`;
   case 1:return p([[-.9,-.9],[.9,-.9],[.9,.9],[-.9,.9]]);
   case 2:return p([[0,-1.15],[1.05,.75],[-1.05,.75]]);
   case 3:return p([[0,-1.2],[1.2,0],[0,1.2],[-1.2,0]]);
   case 4:return p([[0,1.15],[1.05,-.75],[-1.05,-.75]]);
   case 5:return p([[0,-1.1],[1.05,-.34],[.65,.9],[-.65,.9],[-1.05,-.34]]);
   default:return p([[-1,-.5],[0,-1.1],[1,-.5],[1,.5],[0,1.1],[-1,.5]]);
  }
 };
 let g='';
 for(let k=x0;k<=x1;k++){for(const s of [1,2,5])if(k<x1||s===1){const n=s*10**k,x=X(n).toFixed(1);g+=`<line x1="${x}" y1="${T}" x2="${x}" y2="${T+ph}" stroke="#000" stroke-width="${s===1?.4:.15}"/>`;}
  g+=`<text x="${X(10**k).toFixed(1)}" y="${T+ph+11}" font-size="8" text-anchor="middle">10<tspan dy="-3" font-size="6">${k}</tspan></text>`;}
 for(let k=y0;k<=y1;k++){for(const s of [1,2,5])if(k<y1||s===1){const v=s*10**k,y=Y(v).toFixed(1);g+=`<line x1="${L}" y1="${y}" x2="${L+pw}" y2="${y}" stroke="#000" stroke-width="${s===1?.4:.15}"/>`;g+=`<text x="${L-3}" y="${(+y+3).toFixed(1)}" font-size="7.5" text-anchor="end">${+(v.toPrecision(2))}</text>`;}}
 g+=`<rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="none" stroke="#000" stroke-width=".8"/>`;
 g+=`<text x="${L+pw/2}" y="${T+ph+24}" font-size="8.5" text-anchor="middle">Number of stress-range cycles, n</text><text transform="translate(12 ${T+ph/2}) rotate(-90)" font-size="8.5" text-anchor="middle">Stress range f<tspan font-size="6.5" dy="1.5">sr</tspan><tspan dy="-1.5"> (${unit})</tspan></text>`;
 // Design cycle count.
 const xN=X(N);
 g+=`<line x1="${xN.toFixed(1)}" y1="${T}" x2="${xN.toFixed(1)}" y2="${T+ph}" stroke="#000" stroke-width=".7" stroke-dasharray="1.5 1.5"/><text x="${(xN+3).toFixed(1)}" y="${T+9}" font-size="7.5">n<tspan font-size="5.5" dy="1.5">SR</tspan><tspan dy="-1.5"> = ${N.toLocaleString('en-US')}</tspan></text>`;
 // Curves: one per distinct (category, F_SR at N, F_TH, slope), labelled at the right end.
 const curves=new Map<string,{r:typeof rows[number];ns:number[];labels:Set<string>}>();
 for(const r of rows){const key=`${r.m}|${r.FSR.toPrecision(4)}|${r.TH.toPrecision(4)}`,c=curves.get(key)??{r,ns:[],labels:new Set<string>()};c.ns.push(r.n);c.labels.add(r.label);curves.set(key,c);}
 const ends=[...curves.values()].map(c=>({...c,y:Y(clipY(curve(c.r,10**x1)))})).sort((a,b)=>a.y-b.y);
 // Solid and dashed alternately in the order of F_SR at n_SR, where the curves are read.
 const dashed=new Set([...ends].sort((a,b)=>b.r.FSR-a.r.FSR).filter((_,k)=>k%2));
 let last=-1e9;
 for(const c of ends){
  const pts:string[]=[];for(let j=0;j<=80;j++){const n=10**(x0+(x1-x0)*j/80);pts.push(`${X(n).toFixed(1)},${Y(clipY(curve(c.r,n))).toFixed(1)}`);}
  g+=`<polyline points="${pts.join(' ')}" fill="none" stroke="#000" stroke-width=".9"${dashed.has(c)?' stroke-dasharray="5 2.5"':''}/>`;
  const ly=Math.max(c.y,last+10);last=ly;const label=[...c.labels].map(l=>l.startsWith('item')?`A-3.1 ${l}`:`Cat. ${l}`).join(', ');
  g+=`<line x1="${L+pw}" y1="${c.y.toFixed(1)}" x2="${L+pw+5}" y2="${ly.toFixed(1)}" stroke="#000" stroke-width=".4"/><text x="${L+pw+7}" y="${(ly+2.6).toFixed(1)}" font-size="7.5"><tspan font-weight="700">${c.ns.join(', ')}</tspan> ${esc(label).replace('R_FIL','R<tspan font-size="5.5" dy="1.5">FIL</tspan><tspan dy="-1.5"></tspan>')}</text>`;
 }
 // Screened details: crosses on the n_SR line.
 for(const s of scr.filter(v=>v.range>=10**y0)){const y=Y(s.range);g+=`<path d="M${(xN-2.2).toFixed(1)},${(y-2.2).toFixed(1)}L${(xN+2.2).toFixed(1)},${(y+2.2).toFixed(1)}M${(xN-2.2).toFixed(1)},${(y+2.2).toFixed(1)}L${(xN+2.2).toFixed(1)},${(y-2.2).toFixed(1)}" stroke="#000" stroke-width=".6"/>`;}
 // Each detail: open markers at its duty bins, the largest range at n_SR as a bar (all-cycle) and f_sr,eq filled.
 const tags:{n:number;y:number}[]=[];
 for(const r of rows){
  for(const b of r.bins)g+=`<g class="bin" data-detail="${r.n}" data-n="${b.n}" data-f="${b.f.toFixed(3)}">${shape(r.i,X(b.n),Y(clipY(b.f)),false,2.6)}</g>`;
  if(r.eq!==undefined){const yr=Y(clipY(r.range));g+=`<line class="max" data-detail="${r.n}" x1="${(xN-4.5).toFixed(1)}" y1="${yr.toFixed(1)}" x2="${(xN+4.5).toFixed(1)}" y2="${yr.toFixed(1)}" stroke="#000" stroke-width="1.4"/>`;g+=`<g class="eq" data-detail="${r.n}" data-f="${r.eq.toFixed(3)}">${shape(r.i,xN,Y(clipY(r.eq)),true,2.6)}</g>`;tags.push({n:r.n,y:Y(clipY(r.eq))});}
  else tags.push({n:r.n,y:Y(clipY(r.range))});
 }
 // Detail numbers right of the n_SR line, pushed apart to 9 px, with a short leader.
 tags.sort((a,b)=>a.y-b.y);last=-1e9;for(const t of tags){const ly=Math.max(t.y,last+9);last=ly;g+=`<line x1="${(xN+4).toFixed(1)}" y1="${t.y.toFixed(1)}" x2="${(xN+11).toFixed(1)}" y2="${ly.toFixed(1)}" stroke="#000" stroke-width=".35"/><text x="${(xN+13).toFixed(1)}" y="${(ly+2.8).toFixed(1)}" font-size="7.5" font-weight="700">${t.n}</text>`;}
 // Key below the plot: symbols, then every detail with its marker and full title (wrapped, never cut).
 let ky=T+ph+40;const col=(W-L)/2,kx=(c:number)=>L+c*col;
 const sym=[[shape(0,kx(0)+6,ky,false,2.6),'Duty bin i at (n<tspan font-size="5.5" dy="1.5">i</tspan><tspan dy="-1.5">, f</tspan><tspan font-size="5.5" dy="1.5">sr,i</tspan><tspan dy="-1.5">)</tspan>'],
  [shape(0,kx(1)+6,ky,true,2.6),'Miner equivalent f<tspan font-size="5.5" dy="1.5">sr,eq</tspan><tspan dy="-1.5"> at n</tspan><tspan font-size="5.5" dy="1.5">SR</tspan>']] as const;
 for(const [svg,label] of sym)g+=svg;
 g+=`<text x="${kx(0)+14}" y="${ky+2.8}" font-size="7.5">${sym[0][1]}</text><text x="${kx(1)+14}" y="${ky+2.8}" font-size="7.5">${sym[1][1]}</text>`;ky+=11;
 g+=`<line x1="${kx(0)+1.5}" y1="${ky}" x2="${kx(0)+10.5}" y2="${ky}" stroke="#000" stroke-width="1.4"/><text x="${kx(0)+14}" y="${ky+2.8}" font-size="7.5">Largest range f<tspan font-size="5.5" dy="1.5">sr,max</tspan><tspan dy="-1.5"> at n</tspan><tspan font-size="5.5" dy="1.5">SR</tspan><tspan dy="-1.5"> (all-cycle bound)</tspan></text>`;
 g+=`<path d="M${kx(1)+3.8},${ky-2.2}L${kx(1)+8.2},${ky+2.2}M${kx(1)+3.8},${ky+2.2}L${kx(1)+8.2},${ky-2.2}" stroke="#000" stroke-width=".6"/><text x="${kx(1)+14}" y="${ky+2.8}" font-size="7.5">Screened detail, largest range below F<tspan font-size="5.5" dy="1.5">TH</tspan><tspan dy="-1.5"> (${scr.length}${scr.some(v=>v.range<10**y0)?`; ${scr.filter(v=>v.range<10**y0).length} below the axis`:''})</tspan></text>`;ky+=14;
 // Detail entries in two columns, each wrapped at about 62 characters.
 const wrap=(t:string,w=62)=>{const out:string[]=[];let line='';for(const word of t.split(' ')){if(line&&(line+' '+word).length>w){out.push(line);line=word;}else line=line?line+' '+word:word;}if(line)out.push(line);return out;};
 const entries=rows.map(r=>({r,lines:wrap(r.label.startsWith('item')&&r.title.includes(r.label)?r.title:`${r.title} · ${r.label.startsWith('item')?`A-3.1 ${r.label}`:`Cat. ${r.label}`}`)}));
 const half=Math.ceil(entries.length/2),colY=[ky,ky];
 entries.forEach((e,j)=>{const c=j<half?0:1,y=colY[c];g+=shape(e.r.i,kx(c)+6,y,false,2.6)+`<text x="${kx(c)+14}" y="${y+2.8}" font-size="7.5"><tspan font-weight="700">${e.r.n}</tspan> ${e.lines.map((l,k)=>`${k?`<tspan x="${kx(c)+21}" dy="9">`:'<tspan>'}${esc(l).replace('R_FIL','R<tspan font-size="5.5" dy="1.5">FIL</tspan><tspan dy="-1.5"></tspan>')}</tspan>`).join('')}</text>`;colY[c]+=9*e.lines.length+3;});
 const H=Math.ceil(Math.max(...colY)+4);
 return `<figure class="calculation-figure fatigue-sn"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="S-N summary of the evaluated fatigue details" font-family="Arial, sans-serif">${g}</svg><figcaption><strong>Fatigue summary · duty bins against the design curves</strong><p>Each evaluated detail (numbered as in the table, one marker shape each) with its AISC 360-16 Appendix 3 design curve through F<sub>SR</sub> at n<sub>SR</sub> down to the threshold F<sub>TH</sub> (none for a C″ weld root), labelled at its right end. Open markers: the duty bins (n<sub>i</sub>, f<sub>sr,i</sub>); a bin below the curve uses n<sub>i</sub>/N<sub>i</sub> of the life. At n<sub>SR</sub>: the Miner equivalent range f<sub>sr,eq</sub> (filled) and the largest range applied to all cycles (bar); a point below its curve passes. Crosses: screened details at their largest range.</p></figcaption></figure>`;
}

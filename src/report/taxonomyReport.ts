import type {CalculationSnapshot,CheckResult,ProjectInput} from '../engine/types';
import {toDisplay,unit,type Quantity} from '../engine/units';
import {dcText} from '../engine/checkPresentation';
import {allCycleRange,categoryLabel,checkTypeLabel,effectLabel,gateLabel,registerPoints,type BodyLine,type FatigueRow,type Taxonomy,type TaxonEntry} from '../engine/checkTaxonomy';
import {caseLabel,checkTitle,equationCell,fixed2,num,shortReference,sig3,statusLabel,subscripts,tidyNumbers,value} from './reportParts';
import {responsibilityMatrix,responsibilityBlock} from './responsibility';
import {damageText} from '../engine/fatigueConstants';

/**
 * Report blocks driven by the check taxonomy: body rows of the governing DESIGN checks, page-1 open items and counts,
 * the fatigue table, the detailing checklist, the input / load-basis / classification tables, the "not checked in
 * this package" list, Appendix A and the CSV of every computed result.
 */
const esc=(v:unknown)=>subscripts(caseLabel(tidyNumbers(String(v??''))).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)));
/**
 * Text for an SVG <text> element: escaped like esc(), with engineering subscripts (R_FIL, F_TH, n_SR) as shifted <tspan>s.
 * HTML markup such as <sub> must never reach an inline SVG: the HTML parser closes the <svg> at it and spills the rest.
 */
const svgEsc=(v:unknown)=>caseLabel(tidyNumbers(String(v??''))).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
 .replace(/(?<![\w/.&#-])([A-Za-z])_\{?([A-Za-z]{1,8}|\d)\}?(?![\w])/g,'$1<tspan font-size="5.5" baseline-shift="-1.5">$2</tspan>');
type Units=ProjectInput['units'];
const q=(c:CheckResult)=>c.quantity??'ratio';
const ksi=6.894757293168;
/** A stress to three significant figures, trailing zeros dropped: 8 ksi, 2.6 ksi, 12.4 ksi. */
const stress=(v:number|undefined,u:Units)=>v===undefined||!Number.isFinite(v)?'—':u==='US'?`${num(v/ksi,{fixed:true})} ksi`:`${num(v,{fixed:true})} MPa`;
/**
 * Sentences split at a stop followed by a capital, so decimals (1.0Cbs, 7.2 kip) stay whole, and only outside
 * parentheses and brackets, so a parenthetical "(Fictitious …; E70XX welds)" is never cut open.
 */
const sentences=(v:string)=>{
 const out:string[]=[];let depth=0,start=0;
 for(let i=0;i<v.length;i++){const ch=v[i];
  if(ch==='('||ch==='[')depth++;else if((ch===')'||ch===']')&&depth>0)depth--;
  else if(depth===0&&(ch==='.'||ch===';')&&/^\s+[A-Z]/.test(v.slice(i+1,i+8))){out.push(v.slice(start,i+1));start=i+1;}}
 out.push(v.slice(start));return out.map(t=>t.trim()).filter(Boolean);
};
const firstSentence=(v:string)=>sentences(v)[0]??'';
const sentence=(v:string)=>v.charAt(0).toUpperCase()+v.slice(1);

/** One body row per line: the controlling limit state with its equation, demand, limit and D/C; merged lines name it. */
export function bodyTable(lines:BodyLine[],tax:Taxonomy,units:Units){
 if(!lines.length)return '';
 return `<table class="checks body-checks"><colgroup><col class="c-title"/><col class="c-eq"/><col class="c-num"/><col class="c-num"/><col class="c-dc"/><col class="c-res"/></colgroup><thead><tr><th>Check · reference</th><th>Equation</th><th>Demand</th><th>Limit</th><th>D/C</th><th>Result</th></tr></thead><tbody>${lines.map(l=>{
  const c=l.controlling,t=tax.entries.get(c.id)!;
  const head=l.merged?`<b>${esc(l.title)}</b><small class="ctrl">Controlling: ${esc(c.title.replace(/\s*·\s*/g,', '))}${l.also.length?`; also ${l.also.map(a=>`${esc(a.title.replace(/\s*·\s*/g,', '))} (${dcText(a.utilization,2)})`).join('; ')}`:''}</small>`:`<b>${esc(checkTitle(c.title))}</b>`;
  const typical=t.typicalOf>1?` <span class="family">typical of ${t.typicalOf}</span>`:'';
  return `<tr class="${c.status}" data-checks="${esc(l.members.map(m=>m.id).join(' '))}"${l.key.startsWith('top:')?' data-top="1"':''}><td>${head}${typical}${l.owner?' <span class="family">owner criterion</span>':''}<small class="ref">${esc(shortReference(c))}</small>${c.caseId?`<small class="ref">Governing case: ${esc(tax.caseName(c.caseId))}</small>`:''}</td><td class="eq">${equationCell(c)}</td><td class="num">${maximumRule(c)?value(c.demand,q(c),units):value(c.capacity,q(c),units,c.demand)}</td><td class="num">${maximumRule(c)?'≤ ':'≥ '}${maximumRule(c)?value(c.capacity,q(c),units,c.demand):value(c.demand,q(c),units)}</td><td class="num">${dcText(c.utilization,2,'—')}</td><td class="res"><b class="${c.status}">${esc(statusLabel(c.status))}</b></td></tr>`;
 }).join('')}</tbody></table>`;
}
/** "N other limit states checked, max D/C x.xx (Appendix A)". */
export const othersLine=(checks:CheckResult[])=>{
 if(!checks.length)return '';
 const max=Math.max(...checks.map(c=>c.utilization??0));
 return `<p class="others">${checks.length} other limit state${checks.length>1?'s':''} checked, max D/C ${dcText(max,2)} (Appendix A).</p>`;
};

const kindLabel={clash:'Clash / coordination',redesign:'Redesign flag',input:'Missing or inconsistent input',detailing:'Detailing rule not met'} as const;
/** Page 1: every open item (clashes, redesign flags, missing input), when there are any, and where the items by others are. */
export function openItemsBlock(tax:Taxonomy,s:CalculationSnapshot){
 const items=tax.openItems;
 const list=items.length?`<table class="open-items"><thead><tr><th>Open item</th><th>Check</th><th>Status</th><th>What is needed</th></tr></thead><tbody>${items.map(o=>`<tr><td><b>${kindLabel[o.kind]}</b></td><td>${esc(o.check.title)}${o.check.utilization!==undefined&&Number.isFinite(o.check.utilization)&&o.check.status==='fail'?` (D/C ${dcText(o.check.utilization,2)})`:''}<small>${esc(o.check.group)}</small></td><td><b>${esc(statusLabel(o.check.status))}</b></td><td>${esc(sentences(o.check.note.replace(/^OPEN ITEM:\s*/,'')).slice(0,2).join(' '))}</td></tr>`).join('')}</tbody></table>`:'';
 const others=responsibilityMatrix(tax,s).length?`<p>Items by others and the forces delivered to them: section @@ref:by-others@@.</p>`:'';
 return `${items.length?`<h2>Open items</h2>${list}`:''}${others}`;
}
/** The governing check as the banner names it: its title without separators and without a repeated "fatigue". */
const governingTitle=(t:string)=>(/fatigue/i.test(t.replace(/\s*·\s*fatigue$/i,''))?t.replace(/\s*·\s*fatigue$/i,''):t).replace(/\s*·\s*/g,', ');
/**
 * The pass banner: never "no failed checks" while an open item exists. A demonstration states what was done, an analysis
 * for assumed design criteria, not a verified design; a project states that its checks are within their limits for the
 * stated design criteria (the engineer of record's review and seal are separate).
 */
export function banner(tax:Taxonomy,draft=false,demonstration=false){
 const n=tax.openItems.length,g=tax.governing,gov=g?` Governing D/C = ${dcText(g.dc,2)} (${esc(g.element)}): ${esc(governingTitle(g.title))}.`:'';
 const head=draft?'<b>REVIEW DRAFT — NOT FOR ISSUE.</b> Open items include missing input (unverified); the calculation cannot be issued until they are resolved.<br/>':'';
 if(n){const kinds=[...new Set(tax.openItems.map(o=>kindLabel[o.kind].toLowerCase()))];return `<div class="banner fail">${head}<b>${n} OPEN ITEM${n>1?'S':''} — REVIEW REQUIRED, DO NOT ISSUE FOR CONSTRUCTION</b><br/>${esc(kinds.join('; '))}: listed below.${gov}</div>`;}
 return `<div class="banner"><b>${demonstration?'Demonstration analysis completed for assumed design criteria.':'All design checks within their limits for the stated design criteria.'}</b>${gov}</div>`;
}
/** The count of results under the summary: design checks evaluated, screened and not applicable; detailing rules and those with small margin. */
export function countsLine(tax:Taxonomy){
 const c=tax.counts;
 return `<p class="counts">${c.designEvaluated} design checks evaluated${c.designScreened?`, ${c.designScreened} screened below the fatigue threshold`:''}${c.designNotApplicable?`, ${c.designNotApplicable} N/A`:''}; ${c.detailing} detailing rules${c.detailingFlagged?` (${c.detailingFlagged} with small margin, section @@ref:detailing-checklist@@)`:''}. All results: Appendix A.</p>`;
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
/** The taxonomy with only the fatigue details of the named elements (for a section's own fatigue table and S-N plot). */
export function fatigueOf(tax:Taxonomy,elements:(key:string)=>boolean):Taxonomy{
 return {...tax,fatigue:{...tax.fatigue,evaluated:tax.fatigue.evaluated.filter(r=>elements(r.element)),screened:tax.fatigue.screened.filter(r=>elements(r.element))}};
}
/**
 * The fatigue table: every evaluated detail at the design cycle count n_SR with the Miner equivalent range f_sr,eq and
 * the largest range f_sr,max against the same F_SR at n_SR (two D/Cs on one basis, the design ratio in bold), and the
 * damage sum; then the screened details closest to F_TH. `basis` false: the table alone (a second fatigue table
 * after the section that states the basis).
 */
export function fatigueTable(tax:Taxonomy,units:Units,o:{basis?:boolean}={}){
 const F=tax.fatigue,miner=F.method==='miner',gate=(c:CheckResult)=>tax.entries.get(c.id)?.gate;
 // Register points of a detail: all of them, and those screened below F_TH on their own range.
 const typical=(r:FatigueRow)=>{if(r.points<=1)return '';const sc=registerPoints(r.members.filter(c=>gate(c)==='screened'));
  return `<small>${r.points} locations${sc?` (${r.points-sc} evaluated, ${sc} below F<sub>TH</sub>)`:''}</small>`;};
 const ratio=(v:number|undefined,governs:boolean)=>v===undefined?'—':governs?`<b>${dcText(v,2)}</b>`:dcText(v,2);
 const row=(r:FatigueRow,i:number)=>{const byMiner=miner&&r.miner!==undefined;
  return `<tr class="${r.governing.status}"><td><span class="step">${i+1}</span> <b>${esc(checkTitle(r.title))}</b>${typical(r)}<small>${esc(r.location)}</small></td><td>${catHtml(r,F.cycles)}</td><td class="num">${r.threshold===undefined?'none':stress(r.threshold,units)}</td><td class="num">${stress(r.capacity,units)}</td><td class="num">${stress(r.range,units)}</td><td class="num">${stress(r.equivalent,units)}</td><td class="num">${r.damage===undefined?'—':damageText(r.damage)}</td><td class="num">${ratio(r.miner,byMiner)}</td><td class="num">${ratio(r.allCycle,!byMiner)}</td><td class="res"><b>${esc(statusLabel(r.governing.status))}</b></td></tr>`;};
 const pk=F.peak?.controlling;
 const peak=pk&&o.basis!==false?`<p>Peak stress under dead load plus the unfactored cyclic load: f<sub>max</sub> = ${sig3(pk.demand,'stress',units)} ≤ 0.66F<sub>y</sub> = ${sig3(pk.capacity,'stress',units)} (AISC 360-16 Appendix 3.1), D/C ${dcText(pk.utilization,2)}.</p>`:'';
 const n=F.cycles.toLocaleString('en-US');
 const basis=o.basis===false?'':`<p><b>Basis.</b> AISC 360-16 Appendix 3 at n<sub>SR</sub> = ${n}, the total of the duty bins. ${miner?`D/C = f<sub>sr,eq</sub>/F<sub>SR</sub>, with f<sub>sr,eq</sub> = (Σn<sub>i</sub>f<sub>sr,i</sub><sup>3</sup>/n<sub>SR</sub>)<sup>1/3</sup> (Miner’s rule, no threshold credit). The largest bin range applied to all cycles, f<sub>sr,max</sub>/F<sub>SR</sub>, is shown for comparison; where a detail has no Miner ratio (—) it is the design ratio. The design ratio is in bold.`:`D/C = f<sub>sr,max</sub>/F<sub>SR</sub>, the largest bin range applied to all cycles; the Miner ratio f<sub>sr,eq</sub>/F<sub>SR</sub> is shown for comparison. The design ratio is in bold.`} Details whose largest range is below F<sub>TH</sub> are screened (Appendix A); a weld root, Category C″ with R<sub>FIL</sub> &lt; 1 (Eq. A-3-6), has no threshold.</p>`;
 return basis
  +(F.evaluated.length?`<table class="checks fatigue-table"><colgroup><col style="width:27%"/><col style="width:8%"/><col style="width:7%"/><col style="width:8%"/><col style="width:8%"/><col style="width:8%"/><col style="width:8%"/><col style="width:8%"/><col style="width:9%"/><col style="width:7%"/></colgroup><thead><tr><th>Detail and location</th><th>Cat.</th><th>F<sub>TH</sub></th><th>F<sub>SR</sub> at n<sub>SR</sub></th><th>f<sub>sr,max</sub></th><th>f<sub>sr,eq</sub></th><th>Σn<sub>i</sub>/N<sub>i</sub></th><th>Miner f<sub>sr,eq</sub>/F<sub>SR</sub></th><th>All-cycle f<sub>sr,max</sub>/F<sub>SR</sub></th><th>Result</th></tr></thead><tbody>${F.evaluated.map((r,i)=>row(r,i)).join('')}</tbody></table>`:'')+peak
  +(F.screened.length?`<p class="others">Screened details (${F.screened.length}), closest to F<sub>TH</sub>: ${[...F.screened].filter(r=>r.range!==undefined&&r.threshold).sort((a,b)=>b.range!/b.threshold!-a.range!/a.threshold!).filter((r,i,a)=>a.findIndex(o=>Math.abs(o.range!-r.range!)<=1e-6*Math.max(1,r.range!)&&o.threshold===r.threshold)===i).slice(0,4).map(r=>`${esc(checkTitle(r.title))} ${stress(r.range,units)} vs ${stress(r.threshold,units)}`).join('; ')}.</p>`:'');
}

/**
 * A maximum-type rule (a maximum weld, a part that must fit a space) compares the provided value (demand) with the
 * limit (capacity); every other detailing rule compares the required minimum (demand) with the provided value
 * (capacity).
 */
export const maximumRule=(c:CheckResult)=>/-max(imum)?$|-fit$/.test(c.id)||/\bmaximum\b|\bfits?\b/i.test(c.title);
/** Signed margin: negative when the rule is not met. */
const margin=(c:CheckResult,units:Units)=>{
 if(c.demand===undefined||c.capacity===undefined||!Number.isFinite(c.capacity))return '—';
 if(c.quantity!=='length'){const m=1-(c.utilization??0);return `${(m*100).toFixed(0)}%`;}
 // A margin is computed: decimals with the unit (0.025 in, 0.063 in, 0 in), never a fraction.
 const m=c.capacity-c.demand;return Math.abs(m)<1e-6?sig3(0,'length',units):`${m<0?'−':''}${sig3(Math.abs(m),'length',units)}`;
};
/** The flag of a detailing rule in two phrases: at the limit, or less margin than the 1/8 in (or 10%) setting tolerance. */
const flagText=(c:CheckResult,reason:string)=>c.status!=='pass'?reason:/exactly|at (the )?limit/i.test(reason)?'At limit':/^Margin (\d+%|< (1\/8 in|10%))$/.test(reason)?reason:'Margin < 1/8 in';
/** The detailing checklist: failures and rules met with less than 1/8 in (or 10%) margin; everything else in one line. */
export function detailingChecklist(tax:Taxonomy,units:Units){
 const D=tax.detailing,flags=D.flagged;
 const rows=flags.map(({entry:t,reason})=>{const c=t.check;return `<tr class="${c.status}"><td><b>${esc(checkTitle(c.title))}</b><small>${esc(t.elementLabel)}; ${esc(shortReference(c))}</small></td><td class="num">${maximumRule(c)?value(c.demand,q(c),units):value(c.capacity,q(c),units,c.demand)}</td><td class="num">${maximumRule(c)?'≤ ':'≥ '}${maximumRule(c)?value(c.capacity,q(c),units,c.demand):value(c.demand,q(c),units)}</td><td class="num">${margin(c,units)}</td><td>${esc(flagText(c,reason))}</td><td class="res"><b class="${c.status}">${esc(statusLabel(c.status))}</b></td></tr>`;}).join('');
 const gated=D.gated.filter(t=>t.gate==='advisory'||t.gate==='not-applicable'),names=(v:TaxonEntry[])=>v.map(t=>esc(t.check.title.replace(/\s*·\s*/g,', '))).join('; ');
 const na=gated.filter(t=>t.gate==='not-applicable'),adv=gated.filter(t=>t.gate==='advisory');
 return `<p>Detailing rules not met, or met with less than 1/8 in or 10% margin.</p>`
  +(flags.length?`<table class="checks detailing-list"><colgroup><col style="width:36%"/><col style="width:11%"/><col style="width:11%"/><col style="width:9%"/><col style="width:25%"/><col style="width:8%"/></colgroup><thead><tr><th>Rule</th><th>Provided</th><th>Required</th><th>Margin</th><th>Flag</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>`:'')
  +`<p class="others">Other ${D.satisfied} rules: OK (Appendix A).${na.length?` N/A: ${names(na)}.`:''}${adv.length?` Advisory: ${names(adv)}.`:''}</p>`;
}

/** The value of a recorded input: a specified temperature (preheat) as specified, else the recorded quantity. */
const inputValue=(c:CheckResult,units:Units)=>{const v=c.quantity==='temperature'&&c.capacity!==undefined?c.capacity:c.demand;return v!==undefined?value(v,q(c),units):'—';};
/** Design assumptions and confirmed inputs with their source (survey, mill certificate, supplier); `only` picks the rows of one section. */
export function inputsTable(tax:Taxonomy,units:Units,o:{only?:(c:CheckResult)=>boolean;title?:string;crane?:string}={}){
 const v=[...tax.entries.values()].filter(t=>t.type==='input'&&(!o.only||o.only(t.check)));if(!v.length)return '';
 // A failed or unconfirmed input says so; a confirmed one needs no status.
 const open=(c:CheckResult)=>c.status!=='pass'&&c.status!=='not-applicable'?` <b>${esc(statusLabel(c.status))}</b>`:'';
 return `<h3>${esc(o.title??'Design assumptions and confirmed inputs')}</h3><table class="assumptions"><colgroup><col style="width:30%"/><col style="width:56%"/><col style="width:14%"/></colgroup><thead><tr><th>Item</th><th>Basis and source</th><th>Value</th></tr></thead><tbody>${v.map(t=>{const c=t.check;return `<tr class="${c.status}"><td><b>${esc(sentence(o.crane&&c.title.startsWith(`${o.crane} · `)?c.title.slice(o.crane.length+3):c.title).replace(/\s*·\s*/g,', '))}</b></td><td>${esc(firstSentence(c.note))}</td><td class="num">${inputValue(c,units)}${open(c)}</td></tr>`;}).join('')}</tbody></table>`;
}
/** Supplied load against the code minimum, with the value that governs. */
export function loadBasisTable(tax:Taxonomy,units:Units){
 // Rows that compare something (demand = code minimum, capacity = value used); 1.00 / 1.00 inclusion records are left out.
 const v=[...tax.entries.values()].filter(t=>t.type==='load-basis'&&!(q(t.check)==='ratio'&&t.check.demand===1&&t.check.capacity===1));if(!v.length)return '';
 return `<h3>Load basis: supplied value against the code minimum</h3><table class="load-basis"><colgroup><col style="width:30%"/><col style="width:14%"/><col style="width:14%"/><col style="width:14%"/><col style="width:28%"/></colgroup><thead><tr><th>Load</th><th>Supplied / used</th><th>Code minimum</th><th>Governs</th><th>Basis</th></tr></thead><tbody>${v.map(t=>{const c=t.check,has=c.demand!==undefined&&c.capacity!==undefined;
  // The value used is the greater of the two: when it exceeds the code minimum the supplier value governs.
  const gov=!has?'—':c.capacity!>c.demand!+1e-9*Math.max(1,Math.abs(c.demand!))?'Supplier':'Code minimum';
  return `<tr><td><b>${esc(checkTitle(c.title))}</b></td><td class="num">${has?value(c.capacity,q(c),units,c.demand):'—'}</td><td class="num">${has?value(c.demand,q(c),units):'—'}</td><td>${esc(gov)}</td><td>${esc(shortReference(c))}</td></tr>`;}).join('')}</tbody></table>`;
}
/**
 * Section and element classification, feeding the strength checks (not checks themselves); `elements` picks the rows
 * of one section. A row that repeats a design check of its element (same demand and limit) is left out.
 */
export function classificationTable(tax:Taxonomy,units:Units,elements?:(key:string)=>boolean){
 const near=(x?:number,y?:number)=>x!==undefined&&y!==undefined&&Math.abs(x-y)<=5e-3*Math.max(Math.abs(y),1e-9);
 // A repeat: a design check of the same element, or another classification of a member element (the project-level
 // "Loads, analysis and detailing" row gives way to the member's own) with the same demand and limit.
 const same=(a:TaxonEntry,b:TaxonEntry)=>a!==b&&near(a.check.demand,b.check.demand)&&near(a.check.capacity,b.check.capacity);
 const all=[...tax.entries.values()],repeat=(t:TaxonEntry)=>all.some(d=>same(t,d)&&((d.type==='design'&&d.element===t.element)||(d.type==='classification'&&t.element==='gates'&&d.element!=='gates')));
 const v=all.filter(t=>t.type==='classification'&&(!elements||elements(t.element))&&!repeat(t));if(!v.length)return '';
 // A ratio just inside its limit is printed with one more digit, so it does not read as equal to the limit (0.896, not 0.90).
 const ratioCell=(c:CheckResult)=>{const a=sig3(c.demand,q(c),units);return q(c)==='ratio'&&c.demand!==undefined&&c.demand!==c.capacity&&a===sig3(c.capacity,q(c),units)?String(+c.demand.toPrecision(3)):a;};
 const result=(t:TaxonEntry)=>{const c=t.check;if(t.gate==='modifier')return c.status==='fail'||(c.utilization??0)>1?'F13.1 not met: F13-1 applies':'F13.1 met: no reduction';if(c.status==='not-applicable')return 'N/A';
  if(/compact/i.test(c.title))return c.status==='pass'?'Compact':'Noncompact / slender';return c.status==='pass'?'OK':'NG';};
 return `<h3>Section classification</h3><table class="classification"><colgroup><col style="width:34%"/><col style="width:16%"/><col style="width:12%"/><col style="width:12%"/><col style="width:26%"/></colgroup><thead><tr><th>Check</th><th>Member</th><th>Ratio</th><th>Limit</th><th>Classification</th></tr></thead><tbody>${v.map(t=>{const c=t.check;return `<tr><td><b>${esc(checkTitle(c.title))}</b><small>${esc(shortReference(c))}</small></td><td>${esc(t.elementLabel)}</td><td class="num">${t.gate==='modifier'?'—':ratioCell(c)}</td><td class="num">${t.gate==='modifier'?'—':sig3(c.capacity,q(c),units)}</td><td>${esc(result(t))}</td></tr>`;}).join('')}</tbody></table>`;
}
/** The analysis verification in one sentence: equilibrium residuals and the refinement of the travel step, stations and mesh. */
export function verificationLine(tax:Taxonomy){
 const v=[...tax.entries.values()].filter(t=>t.type==='verification');if(!v.length)return '';
 const bad=v.filter(t=>t.check.status!=='pass'),eq=v.filter(t=>/equilibrium|residual/i.test(`${t.check.id} ${t.check.title}`)),fine=v.filter(t=>!eq.includes(t));
 const util=(w:TaxonEntry[])=>Math.max(0,...w.map(t=>t.check.utilization??0)),pct=(x:number)=>`${+(x*100).toFixed(2)}%`;
 const change=Math.max(0,...fine.map(t=>t.check.demand??0)),tol=Math.max(0,...fine.map(t=>t.check.capacity??0));
 const parts=[eq.length?`the largest equilibrium residual is ${pct(util(eq))} of its tolerance`:'',fine.length?`halving the travel step, station spacing and warping mesh changes the governing results by less than ${pct(tol)} (largest ${pct(change)})`:''].filter(Boolean);
 return `<p class="verified"><b>Verification:</b> ${parts.join('; ')}${bad.length?`; <b>${bad.length} NOT MET</b>`:''}. Values: Appendix A.</p>`;
}

/**
 * Appendix A: the check results, with type, element, status, demand, limit, D/C and reference, in the order of the
 * report (girder, rail, bearings, support, column, tie, end stops), then the inputs and the analysis verification. A
 * check repeated over many stations or locations (rail clips, cap weld base metal, holes; Miner and all-cycle
 * separately) is one row: its governing instance, the number of locations and the range of D/C. Every instance, with
 * its id, is in the CSV; rows that compare nothing (inclusion records, inputs without a value) are in the CSV only.
 */
export function appendixA(tax:Taxonomy,units:Units){
 const typeOrder:Record<string,number>={design:0,detailing:0,classification:0,input:1,'load-basis':1,verification:2,'by-others':3};
 const elementOrder=['girder','service','fatigue','rail','bearing','support','column','base','tie','longitudinal','stops','gates'],el=(t:TaxonEntry)=>{const i=elementOrder.indexOf(t.element);return i<0?elementOrder.length:i;};
 // Grouped: register points of one detail family, and one check repeated at stations (the same title but for numbers and sides).
 const same=(t:TaxonEntry)=>t.check.title.replace(/\d+(\.\d+)?/g,'#').replace(/\s*·\s*(left|right)\b/g,'');
 const has=(v?:number)=>v!==undefined&&Number.isFinite(v);
 const empty=(t:TaxonEntry)=>{const c=t.check;return (t.type==='load-basis'&&(c.quantity??'ratio')==='ratio'&&c.demand===1&&c.capacity===1)||(t.type==='input'&&!has(c.demand)&&!has(c.capacity));};
 const recorded=[...tax.entries.values()].filter(empty),all=[...tax.entries.values()].filter(t=>!empty(t)),groupOf=(t:TaxonEntry)=>t.repeat?`${t.repeat}|${t.repeat.startsWith('register:')?'':same(t)}|${/^detail-full-cycle-/.test(t.check.id)?'all-cycle':'miner'}`:undefined;
 const groups=new Map<string,TaxonEntry[]>();for(const t of all){const k=groupOf(t);if(k)groups.set(k,[...(groups.get(k)??[]),t]);}
 const dc=(t:TaxonEntry)=>t.check.utilization!==undefined&&Number.isFinite(t.check.utilization)?t.check.utilization:-1;
 const rows:{t:TaxonEntry;members:TaxonEntry[]}[]=[];
 for(const t of all){
  const k=groupOf(t);if(!k){rows.push({t,members:[t]});continue;}
  const v=groups.get(k)!;if(v.length<3){rows.push({t,members:[t]});continue;}
  const gov=v.reduce((a,b)=>(b.check.status==='fail'?1e9:0)+dc(b)>(a.check.status==='fail'?1e9:0)+dc(a)?b:a,v[0]);
  if(t===gov)rows.push({t,members:v});
 }
 rows.sort((a,b)=>typeOrder[a.t.type]-typeOrder[b.t.type]||el(a.t)-el(b.t)||a.t.elementLabel.localeCompare(b.t.elementLabel));
 const range=(v:TaxonEntry[])=>{const d=v.map(dc).filter(x=>x>=0);if(!d.length)return '';const lo=dcText(Math.min(...d),2),hi=dcText(Math.max(...d),2);return lo===hi?`D/C ${hi}`:`D/C ${lo} to ${hi}`;};
 // A value without a limit that applies (an unstiffened strength where stiffeners carry the force) is information, not N/A.
 const info=(t:TaxonEntry)=>t.check.status==='not-applicable'&&has(t.check.utilization)&&has(t.check.capacity);
 const status=(t:TaxonEntry)=>t.type==='by-others'?'By others':info(t)?'Info':gateLabel[t.gate]==='Not applicable'?'N/A':gateLabel[t.gate];
 const type=(t:TaxonEntry)=>t.type==='design'?(t.effect?esc(effectLabel[t.effect]):''):`${esc(checkTypeLabel[t.type])}${t.effect?`<small>${esc(effectLabel[t.effect])}</small>`:''}`;
 return `<p>Check results. Status: Evaluated; Screened (largest fatigue range below F<sub>TH</sub>); N/A, with the reason; Info (a value reported without a limit that applies). A check repeated at many locations is printed once, at the governing location, with the number of locations and the D/C range; the CSV lists every location.</p><table class="appendix-a"><colgroup><col style="width:7%"/><col style="width:10%"/><col style="width:25%"/><col style="width:16%"/><col style="width:8%"/><col style="width:8%"/><col style="width:5%"/><col style="width:6%"/><col style="width:15%"/></colgroup><thead><tr><th>Type</th><th>Element</th><th>Check and reference</th><th>Status</th><th>Demand</th><th>Limit</th><th>D/C</th><th>Result</th><th>Case and locations</th></tr></thead><tbody>${rows.map(({t,members})=>{const c=t.check,n=members.length;
  const where=t.location?`<small>${n>1?'governs at ':''}${esc(t.location)}</small>`:'';
  return `<tr class="${c.status}" data-check="${esc(c.id)}"${n>1?` data-members="${esc(members.map(m=>m.check.id).join(' '))}"`:''}><td>${type(t)}</td><td>${esc(t.elementLabel)}</td><td>${esc(checkTitle(c.title))}<small>${esc(shortReference(c))}</small></td><td>${status(t)}${t.reason&&t.type!=='by-others'?`<small>${esc(t.reason)}</small>`:''}</td><td class="num">${maximumRule(c)?value(c.demand,q(c),units):value(c.capacity,q(c),units,c.demand)}</td><td class="num">${maximumRule(c)?'≤ ':'≥ '}${maximumRule(c)?value(c.capacity,q(c),units,c.demand):value(c.demand,q(c),units)}</td><td class="num">${dcText(c.utilization,2,'—')}</td><td>${info(t)?'Info':t.gate==='not-applicable'?'N/A':esc(statusLabel(c.status))}</td><td>${n>1?`${n} locations; ${range(members)}`:''}${where}${c.caseId?`<small>${esc(tax.caseName(c.caseId))}</small>`:''}</td></tr>`;}).join('')}${recorded.length?`<tr class="pass" data-check="${esc(recorded[0].check.id)}" data-members="${esc(recorded.map(t=>t.check.id).join(' '))}"><td>Recorded</td><td colspan="8">Inputs and load-basis records without a comparison: ${recorded.map(t=>esc(t.check.title.replace(/\s*·\s*/g,', '))).join('; ')} (values in the CSV).</td></tr>`:''}</tbody></table>`;
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
 * reductions carry over) down to the threshold F_TH (none for a C″ root), labeled at its right end. Details on one
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
 g+=`<line x1="${xN.toFixed(1)}" y1="${T}" x2="${xN.toFixed(1)}" y2="${T+ph}" stroke="#000" stroke-width=".7" stroke-dasharray="1.5 1.5"/><text x="${xN.toFixed(1)}" y="${T-3}" font-size="7.5" text-anchor="middle">n<tspan font-size="5.5" dy="1.5">SR</tspan><tspan dy="-1.5"> = ${N.toLocaleString('en-US')}</tspan></text>`;
 // Curves: one per distinct (category, F_SR at N, F_TH, slope), labeled at the right end.
 const curves=new Map<string,{r:typeof rows[number];ns:number[];labels:Set<string>}>();
 for(const r of rows){const key=`${r.m}|${r.FSR.toPrecision(4)}|${r.TH.toPrecision(4)}`,c=curves.get(key)??{r,ns:[],labels:new Set<string>()};c.ns.push(r.n);c.labels.add(r.label);curves.set(key,c);}
 const ends=[...curves.values()].map(c=>({...c,y:Y(clipY(curve(c.r,10**x1)))})).sort((a,b)=>a.y-b.y);
 // Solid and dashed alternately in the order of F_SR at n_SR, where the curves are read.
 const dashed=new Set([...ends].sort((a,b)=>b.r.FSR-a.r.FSR).filter((_,k)=>k%2));
 let last=-1e9;
 for(const c of ends){
  const pts:string[]=[];for(let j=0;j<=80;j++){const n=10**(x0+(x1-x0)*j/80);pts.push(`${X(n).toFixed(1)},${Y(clipY(curve(c.r,n))).toFixed(1)}`);}
  g+=`<polyline points="${pts.join(' ')}" fill="none" stroke="#000" stroke-width=".9"${dashed.has(c)?' stroke-dasharray="5 2.5"':''}/>`;
  const ly=Math.max(c.y,last+10);last=ly;const label=[...c.labels].map(l=>l.startsWith('item')?`A-3.1 ${l}`:`Cat. ${l.replace(/ \(root, R_FIL\)$/,' root')}`).join(', ');
  g+=`<line x1="${L+pw}" y1="${c.y.toFixed(1)}" x2="${L+pw+5}" y2="${ly.toFixed(1)}" stroke="#000" stroke-width=".4"/><text x="${L+pw+7}" y="${(ly+2.6).toFixed(1)}" font-size="7.5"><tspan font-weight="700">${c.ns.join(', ')}</tspan> ${svgEsc(label)}</text>`;
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
 entries.forEach((e,j)=>{const c=j<half?0:1,y=colY[c];g+=shape(e.r.i,kx(c)+6,y,false,2.6)+`<text x="${kx(c)+14}" y="${y+2.8}" font-size="7.5"><tspan font-weight="700">${e.r.n}</tspan> ${e.lines.map((l,k)=>`${k?`<tspan x="${kx(c)+21}" dy="9">`:'<tspan>'}${svgEsc(l)}</tspan>`).join('')}</text>`;colY[c]+=9*e.lines.length+3;});
 const H=Math.ceil(Math.max(...colY)+4);
 return `<figure class="calculation-figure fatigue-sn"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="S-N summary of the evaluated fatigue details" font-family="Arial, sans-serif">${g}</svg><figcaption><strong>Fatigue design curves and duty bins</strong><p>Design curves (AISC 360-16 Appendix 3) of the evaluated details, numbered as in the table, each through F<sub>SR</sub> at n<sub>SR</sub> down to F<sub>TH</sub> (none for a C″ weld root). Open markers: duty-bin ranges (n<sub>i</sub>, f<sub>sr,i</sub>). Filled: f<sub>sr,eq</sub> at n<sub>SR</sub>. Bar: f<sub>sr,max</sub> at n<sub>SR</sub>. ×: screened details at their largest range. Points below their curve pass.</p></figcaption></figure>`;
}

import type {CalculationSnapshot,CheckResult,ProjectInput} from '../engine/types';
import {toDisplay,unit,type Quantity} from '../engine/units';
import {dcText} from '../engine/checkPresentation';
import {categoryLabel,checkTypeLabel,effectLabel,gateLabel,type BodyLine,type FatigueRow,type Taxonomy,type TaxonEntry} from '../engine/checkTaxonomy';
import {caseLabel,equationCell,fixed2,shortReference,sig3,statusLabel,subscripts,tidyNumbers,value} from './reportParts';

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
 // The not-checked list is printed once (section "Not checked in this package"); page 1 names the items and refers to it.
 const others=byOthersItems(tax,s);
 const pointer=others.length?`<p class="by-others-pointer"><b>Not checked in this package (by others):</b> ${others.map(v=>esc(v.title)).join('; ')}. What remains by others and the forces delivered to each item: section @@ref:by-others@@.</p>`:'';
 return `<h2>Open items</h2>${items.length?list:'<p>No open coordination, redesign or input items.</p>'}${pointer}`;
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
 const c=tax.counts,reg=[...tax.entries.values()].filter(t=>t.type==='design'&&t.gate==='evaluated'&&t.check.id.startsWith('detail-')).length;
 return `<p class="counts"><b>Design checks evaluated ${c.designEvaluated}</b> (shown ${c.designShown}${reg?`; ${reg} of them fatigue register points`:''}), <b>screened ${c.designScreened}</b>, not applicable ${c.designNotApplicable}; <b>detailing rules ${c.detailing}</b> (${c.detailingFlagged} flagged). Also recorded: ${c.byType.classification} classifications, ${c.byType.verification} analysis verifications, ${c.byType.input} inputs, ${c.byType['load-basis']} load-basis comparisons, ${c.byType['by-others']} by others — ${c.total} results in all (Appendix A and the CSV).</p>`;
}

/** What remains by others, exactly, with the forces delivered to it. */
export function byOthersItems(tax:Taxonomy,s:CalculationSnapshot){
 const u=s.input.units,r=s.detailResults,f=(v:number|undefined)=>sig3(v,'force',u),m=(v:number|undefined)=>sig3(v,'moment',u);
 const env=(k:'vertical'|'top'|'bottom'|'longitudinal'|'torque')=>r?.interfaces.length?Math.max(...r.interfaces.map(v=>Math.abs(v[k]))):undefined;
 const covered=(re:RegExp)=>[...tax.entries.values()].filter(t=>re.test(t.check.id)&&t.type!=='by-others'&&t.check.status!=='not-applicable').length;
 return tax.byOthers.map(t=>{
  const id=t.check.id;
  if(id==='bracket-load-path'){
   const n=covered(/^(haunch-|cap-angle-(col-bolt|endplate|column))/);
   return {title:'Bracket and tie column-side load path',remains:`Nothing beyond the building frame: the haunch, its welds into the column, the column local effects (J10) and the tie's column bolts, end plate and column flange are checked in this package (${n} checks). The column member and frame are listed separately.`,forces:`Tie force to the column ${f(r?.braceForce)} factored; seat reaction ${f(env('vertical'))}, seat moment ${m(env('torque'))}.`};
  }
  if(id==='supporting-structure')return {title:'Existing frame, connections and foundations',remains:'Building frame, roof and wall framing, the column-to-foundation connections, anchors and foundations for the crane reactions combined with the building loads (ASCE 7 combinations); the checked column member is not included here.',
   forces:`Per support, factored AIST envelope: vertical ${f(env('vertical'))}, lateral top ${f(env('top'))} / bottom ${f(env('bottom'))}, longitudinal ${f(env('longitudinal'))}, seat moment ${m(env('torque'))} (section “Forces delivered to the building”; unfactored by load type in “Support reactions”).`};
  const force=sentences(t.check.note).find(x=>/\d\s*(kip|kN)\b/.test(x));
  const rest=firstSentence(t.check.note.replace(/^Not checked here:\s*/,''));
  return {title:t.check.title,remains:rest.charAt(0).toUpperCase()+rest.slice(1),forces:force?.trim()??'See “Forces delivered to the building”.'};
 });
}
export function byOthersBlock(tax:Taxonomy,s:CalculationSnapshot,compact=false){
 const items=byOthersItems(tax,s);if(!items.length)return '';
 return `<h3>Not checked in this package (by others)</h3><table class="by-others"><thead><tr><th>Item</th><th>What remains by others</th><th>Forces delivered</th></tr></thead><tbody>${items.map(v=>`<tr><td><b>${esc(v.title)}</b></td><td>${esc(compact?firstSentence(v.remains):v.remains)}</td><td>${esc(v.forces)}</td></tr>`).join('')}</tbody></table>`;
}

/** The fatigue table: details evaluated, with Miner's sum and the all-cycle bound side by side; screened details counted. */
export function fatigueTable(tax:Taxonomy,units:Units){
 const F=tax.fatigue,method=F.method==='miner'?"Miner's sum over the duty bins":'all-cycle bound (largest range at every cycle)';
 const row=(r:FatigueRow,i:number)=>`<tr class="${r.governing.status}"><td><span class="step">${i+1}</span> <b>${esc(r.title)}</b>${r.typicalOf>1?` <span class="family">typical of ${r.typicalOf}</span>`:''}<small>${esc(r.location)}</small></td><td>${esc(categoryLabel(r.category,r.title)).replace('R_FIL','R<sub>FIL</sub>')}</td><td class="num">${stress(r.range,units)}</td><td class="num">${stress(r.threshold,units)}</td><td class="num">${r.miner===undefined?'—':dcText(r.miner,2)}</td><td class="num">${r.allCycle===undefined?'—':dcText(r.allCycle,2)}</td><td class="num"><b>${dcText(r.dc,2,'—')}</b></td><td class="res"><b>${esc(statusLabel(r.governing.status))}</b></td></tr>`;
 const peak=F.peak?`<p>Peak elastic stress (AISC 360-16 Appendix 3.1, ≤ 0.66F<sub>y</sub>): max D/C ${dcText(F.peak.controlling.utilization,2)} (${esc(F.peak.controlling.title)}).</p>`:'';
 return `<p><b>Governing method (project setting): ${method}.</b> ${F.method==='miner'?'The all-cycle bound (the largest range applied to every cycle) is shown alongside for comparison.':'Miner\'s sum is shown alongside for comparison.'} ${F.cycles.toLocaleString('en-US')} live-load cycles. <b>${F.evaluated.length} detail${F.evaluated.length===1?'':'s'} evaluated; ${F.screened.length} screened</b> below the constant-amplitude threshold F<sub>TH</sub> (AISC 360-16 Appendix 3.1: largest live-load stress range less than F<sub>TH</sub>), recorded with their ranges in Appendix A and the CSV.</p>`
  +(F.evaluated.length?`<table class="checks fatigue-table"><colgroup><col style="width:34%"/><col style="width:6%"/><col style="width:11%"/><col style="width:10%"/><col style="width:9%"/><col style="width:10%"/><col style="width:10%"/><col style="width:10%"/></colgroup><thead><tr><th>Detail · governing location</th><th>Cat.</th><th>f<sub>sr</sub> max</th><th>F<sub>TH</sub></th><th>Σn<sub>i</sub>/N<sub>i</sub></th><th>All-cycle f<sub>sr</sub>/F<sub>SR</sub></th><th>D/C</th><th>Result</th></tr></thead><tbody>${F.evaluated.map((r,i)=>row(r,i)).join('')}</tbody></table>`:'')+peak
  +(F.screened.length?`<p class="others">Screened below threshold (${F.screened.length} details, ${F.screened.reduce((n,r)=>n+r.typicalOf,0)} checks); closest to F<sub>TH</sub>: ${[...F.screened].filter(r=>r.range!==undefined&&r.threshold).sort((a,b)=>b.range!/b.threshold!-a.range!/a.threshold!).slice(0,4).map(r=>`${esc(r.title)} ${stress(r.range,units)} vs ${stress(r.threshold,units)}`).join('; ')}.</p>`:'');
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
 const v=[...tax.entries.values()].filter(t=>t.type==='load-basis');if(!v.length)return '';
 return `<h3>Load basis: supplied value against the code minimum</h3><table class="load-basis"><colgroup><col style="width:30%"/><col style="width:14%"/><col style="width:14%"/><col style="width:14%"/><col style="width:28%"/></colgroup><thead><tr><th>Load</th><th>Supplied / used</th><th>Code minimum</th><th>Governs</th><th>Basis</th></tr></thead><tbody>${v.map(t=>{const c=t.check,has=c.demand!==undefined&&c.capacity!==undefined;
  const gov=!has?'—':c.demand!>=c.capacity!-1e-9?'Supplied / used':'Code minimum';
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
 * over many stations or register points (rail keepers, cap weld base metal, holes; Miner and all-cycle separately) is
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
 * Fatigue summary plot (S-N, log-log, black and white): for each evaluated detail, numbered as in the fatigue table,
 * its design curve F_SR(n) (Appendix 3 Eq. A-3-1, slope 1/3; Category F Eq. A-3-2, slope 1/6) down to its threshold
 * F_TH, passing through the allowable at the design cycles (Δf / all-cycle ratio, so R_PJP / R_FIL reductions carry
 * over), with the largest stress range (open circle) and the Miner equivalent constant-amplitude range
 * F_SR(N)·D^(1/m) (filled) at the design cycle count N. Screened details are plotted as crosses below their thresholds.
 */
export function fatigueSnPlot(tax:Taxonomy,units:Units){
 const F=tax.fatigue,N=F.cycles,toU=(v:number)=>units==='US'?v/ksi:v,unit=units==='US'?'ksi':'MPa';
 const rows=F.evaluated.filter(r=>r.range!==undefined&&r.allCycle!==undefined&&r.allCycle>0).map((r,i)=>{
  const m=/^F$/.test(r.category)?6:3,FSR=toU(r.range!/r.allCycle!),TH=toU(r.threshold??0);
  return {n:F.evaluated.indexOf(r)+1,m,FSR,TH,range:toU(r.range!),eq:r.miner!==undefined?FSR*r.miner**(1/m):undefined,i};
 });
 const scr=F.screened.filter(r=>r.range!==undefined&&r.range>0).map(r=>({range:toU(r.range!),TH:toU(r.threshold??0)}));
 if(!rows.length&&!scr.length)return '';
 const W=600,H=280,L=50,R=210,T=14,B=36,pw=W-L-R,ph=H-T-B,x0=4,x1=8;
 const vals=rows.length?rows.flatMap(r=>[r.range,r.TH,r.FSR*(N/10**x0)**(1/r.m),...(r.eq?[r.eq]:[])]):scr.map(r=>r.TH);
 // The axis spans the evaluated details; screened ranges below it are counted in the key, not drawn.
 const y0=Math.floor(Math.log10(Math.min(...vals)*.8)),y1=Math.ceil(Math.log10(Math.max(...vals)*1.2));
 const X=(n:number)=>L+(Math.log10(n)-x0)/(x1-x0)*pw,Y=(v:number)=>T+ph-(Math.log10(v)-y0)/(y1-y0)*ph,clipY=(v:number)=>Math.min(Math.max(v,10**y0),10**y1);
 let g='';
 for(let k=x0;k<=x1;k++){for(const s of [1,2,5])if(k<x1||s===1){const n=s*10**k,x=X(n).toFixed(1);g+=`<line x1="${x}" y1="${T}" x2="${x}" y2="${T+ph}" stroke="#000" stroke-width="${s===1?.4:.15}"/>`;}
  g+=`<text x="${X(10**k).toFixed(1)}" y="${T+ph+11}" font-size="8" text-anchor="middle">10<tspan dy="-3" font-size="6">${k}</tspan></text>`;}
 for(let k=y0;k<=y1;k++){for(const s of [1,2,5])if(k<y1||s===1){const v=s*10**k,y=Y(v).toFixed(1);g+=`<line x1="${L}" y1="${y}" x2="${L+pw}" y2="${y}" stroke="#000" stroke-width="${s===1?.4:.15}"/>`;g+=`<text x="${L-3}" y="${(+y+3).toFixed(1)}" font-size="7.5" text-anchor="end">${+(v.toPrecision(2))}</text>`;}}
 g+=`<rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="none" stroke="#000" stroke-width=".8"/>`;
 g+=`<text x="${L+pw/2}" y="${H-6}" font-size="8.5" text-anchor="middle">Number of stress-range cycles, n</text><text transform="translate(12 ${T+ph/2}) rotate(-90)" font-size="8.5" text-anchor="middle">Stress range f<tspan font-size="6.5" dy="1.5">sr</tspan><tspan dy="-1.5"> (${unit})</tspan></text>`;
 // Design cycle count.
 g+=`<line x1="${X(N).toFixed(1)}" y1="${T}" x2="${X(N).toFixed(1)}" y2="${T+ph}" stroke="#000" stroke-width=".8" stroke-dasharray="5 2 1 2"/><text x="${(X(N)+3).toFixed(1)}" y="${T+9}" font-size="7.5">N = ${N.toLocaleString('en-US')}</text>`;
 const dashes=['','4 2','1.5 1.5','6 2 1.5 2','2 2 6 2','8 3'],labels:{n:number;y:number}[]=[];
 for(const r of rows){
  // Curve through (N, F_SR(N)) with slope 1/m, down to F_TH.
  const at=(n:number)=>Math.max(r.FSR*(N/n)**(1/r.m),r.TH),pts:string[]=[];
  for(let k=0;k<=80;k++){const n=10**(x0+(x1-x0)*k/80);pts.push(`${X(n).toFixed(1)},${Y(clipY(at(n))).toFixed(1)}`);}
  g+=`<polyline points="${pts.join(' ')}" fill="none" stroke="#000" stroke-width=".9" stroke-dasharray="${dashes[r.i%dashes.length]}"/>`;
  const x=X(N),yr=Y(clipY(r.range));g+=`<circle cx="${x.toFixed(1)}" cy="${yr.toFixed(1)}" r="3.2" fill="#fff" stroke="#000" stroke-width=".9"/>`;
  if(r.eq)g+=`<circle cx="${x.toFixed(1)}" cy="${Y(clipY(r.eq)).toFixed(1)}" r="2.6" fill="#000"/>`;
  labels.push({n:r.n,y:yr});
 }
 // Point labels right of the N line, pushed apart to 9 px and joined to their points by a short leader.
 labels.sort((a,b)=>a.y-b.y);let last=-1e9;for(const l of labels){const ly=Math.max(l.y,last+9);last=ly;const x=X(N);g+=`<line x1="${(x+3.5).toFixed(1)}" y1="${l.y.toFixed(1)}" x2="${(x+12).toFixed(1)}" y2="${ly.toFixed(1)}" stroke="#000" stroke-width=".4"/><text x="${(x+14).toFixed(1)}" y="${(ly+3).toFixed(1)}" font-size="7.5" font-weight="700">${l.n}</text>`;}
 for(const s of scr.filter(v=>v.range>=10**y0)){const x=X(N)-7,y=Y(s.range);g+=`<path d="M${x-2.2},${y-2.2}L${x+2.2},${y+2.2}M${x-2.2},${y+2.2}L${x+2.2},${y-2.2}" stroke="#000" stroke-width=".7"/>`;}
 // Key.
 const kx=L+pw+10;let ky=T+6;const key=(svg:string,label:string)=>{g+=svg.replace(/\{x\}/g,String(kx)).replace(/\{y\}/g,String(ky))+`<text x="${kx+22}" y="${ky+3}" font-size="7.5">${label}</text>`;ky+=12;};
 key(`<circle cx="{x}" cy="{y}" r="3.2" transform="translate(8 0)" fill="#fff" stroke="#000" stroke-width=".9"/>`,'Largest range f<tspan font-size="5.5" dy="1.5">sr</tspan><tspan dy="-1.5"> (all cycles)</tspan>');
 key(`<circle cx="{x}" cy="{y}" r="2.6" transform="translate(8 0)" fill="#000"/>`,'Miner equivalent f<tspan font-size="5.5" dy="1.5">sr</tspan><tspan dy="-1.5"> at N</tspan>');
 key(`<path d="M{x},{y}" transform="translate(6 -2.2)" stroke="#000"/><path d="M${kx+5.8},${ky-2.2}L${kx+10.2},${ky+2.2}M${kx+5.8},${ky+2.2}L${kx+10.2},${ky-2.2}" stroke="#000" stroke-width=".7"/>`,`Screened, below F<tspan font-size="5.5" dy="1.5">TH</tspan><tspan dy="-1.5"> (${scr.length}; ${scr.filter(v=>v.range<10**y0).length} below the axis)</tspan>`);
 ky+=4;
 for(const r of rows){const row=F.evaluated[r.n-1];g+=`<line x1="${kx}" y1="${ky}" x2="${kx+18}" y2="${ky}" stroke="#000" stroke-width=".9" stroke-dasharray="${dashes[r.i%dashes.length]}"/><text x="${kx+22}" y="${ky+3}" font-size="7.5"><tspan font-weight="700">${r.n}</tspan> ${(l=>l.startsWith('item')?`A-3.1 ${l}`:`Cat. ${l}`)(esc(categoryLabel(row.category,row.title)).replace('R_FIL','R<tspan font-size="5.5" dy="1.5">FIL</tspan><tspan dy="-1.5"></tspan>'))} · ${esc(row.title.length>34?row.title.slice(0,33)+'…':row.title)}</text>`;ky+=11;}
 return `<figure class="calculation-figure fatigue-sn"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="S-N summary of the evaluated fatigue details" font-family="Arial, sans-serif">${g}</svg><figcaption><strong>Fatigue summary · stress range against design life</strong><p>Each evaluated detail (numbered as in the table) with its AISC 360-16 Appendix 3 design curve down to the threshold F<sub>TH</sub>. At the design life N, the open circle is the largest live-load stress range (all-cycle bound) and the filled circle the Miner-equivalent constant-amplitude range over the duty bins; a point below its curve passes. Crosses: details screened below their thresholds.</p></figcaption></figure>`;
}

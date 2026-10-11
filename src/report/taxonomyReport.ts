import type {CalculationSnapshot,CheckResult,ProjectInput} from '../engine/types';
import {dcText} from '../engine/checkPresentation';
import {checkTypeLabel,effectLabel,gateLabel,type BodyLine,type FatigueRow,type Taxonomy,type TaxonEntry} from '../engine/checkTaxonomy';
import {equationCell,shortReference,sig3,statusLabel,tidyNumbers} from './reportParts';

/**
 * Report blocks driven by the check taxonomy: body rows of the governing DESIGN checks, page-1 open items and counts,
 * the fatigue table, the detailing checklist, the input / load-basis / classification tables, the "not checked in
 * this package" list, Appendix A and the CSV of every computed result.
 */
const esc=(v:unknown)=>tidyNumbers(String(v??'')).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
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
  return `<tr class="${c.status}" data-checks="${esc(l.members.map(m=>m.id).join(' '))}"><td>${head}${typical}${l.owner?' <span class="family">owner criterion</span>':''}<small class="ref">${esc(shortReference(c))}</small>${c.caseId?`<small class="ref">Governing case ${esc(c.caseId)}</small>`:''}</td><td class="eq">${equationCell(c)}</td><td class="num">${sig3(c.demand,q(c),units)}</td><td class="num">${sig3(c.capacity,q(c),units)}</td><td class="num">${dcText(c.utilization,2,'—')}</td><td class="res"><b class="${c.status}">${esc(statusLabel(c.status))}</b></td></tr>`;
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
 const row=(r:FatigueRow)=>`<tr class="${r.governing.status}"><td><b>${esc(r.title)}</b>${r.typicalOf>1?` <span class="family">typical of ${r.typicalOf}</span>`:''}<small>${esc(r.location)}</small></td><td>${esc(r.category)}</td><td class="num">${stress(r.range,units)}</td><td class="num">${stress(r.threshold,units)}</td><td class="num">${r.miner===undefined?'—':dcText(r.miner,2)}</td><td class="num">${r.allCycle===undefined?'—':dcText(r.allCycle,2)}</td><td class="num"><b>${dcText(r.dc,2,'—')}</b></td><td class="res"><b>${esc(statusLabel(r.governing.status))}</b></td></tr>`;
 const peak=F.peak?`<p>Peak elastic stress (AISC 360-16 Appendix 3.1, ≤ 0.66F<sub>y</sub>): max D/C ${dcText(F.peak.controlling.utilization,2)} (${esc(F.peak.controlling.title)}).</p>`:'';
 return `<p><b>Governing method (project setting): ${method}.</b> ${F.method==='miner'?'The all-cycle bound is shown alongside; set the project fatigue method to “all-cycle” to govern by it.':'Miner\'s sum is shown alongside.'} ${F.cycles.toLocaleString('en-US')} live-load cycles. <b>${F.evaluated.length} detail${F.evaluated.length===1?'':'s'} evaluated; ${F.screened.length} screened</b> below the constant-amplitude threshold F<sub>TH</sub> (AISC 360-16 Appendix 3.1: largest live-load stress range less than F<sub>TH</sub>), recorded with their ranges in Appendix A and the CSV.</p>`
  +(F.evaluated.length?`<table class="checks fatigue-table"><colgroup><col style="width:34%"/><col style="width:6%"/><col style="width:11%"/><col style="width:10%"/><col style="width:9%"/><col style="width:10%"/><col style="width:10%"/><col style="width:10%"/></colgroup><thead><tr><th>Detail · governing location</th><th>Cat.</th><th>Δf max</th><th>F<sub>TH</sub></th><th>Miner ΣD</th><th>All-cycle Δf/F<sub>SR</sub></th><th>D/C</th><th>Result</th></tr></thead><tbody>${F.evaluated.map(row).join('')}</tbody></table>`:'')+peak
  +(F.screened.length?`<p class="others">Screened below threshold (${F.screened.length} details, ${F.screened.reduce((n,r)=>n+r.typicalOf,0)} checks); closest to F<sub>TH</sub>: ${[...F.screened].filter(r=>r.range!==undefined&&r.threshold).sort((a,b)=>b.range!/b.threshold!-a.range!/a.threshold!).slice(0,4).map(r=>`${esc(r.title)} ${stress(r.range,units)} vs ${stress(r.threshold,units)}`).join('; ')}.</p>`:'');
}

const margin=(c:CheckResult,units:Units)=>{
 if(c.demand===undefined||c.capacity===undefined||!Number.isFinite(c.capacity))return '—';
 if(c.quantity!=='length'){const m=Math.max(0,1-(c.utilization??0));return `${(m*100).toFixed(0)}%`;}
 const m=Math.abs(c.capacity-c.demand);if(m<1e-6)return '0';
 return sig3(m,'length',units);
};
/** The detailing checklist: failures and rules met with less than 1/8 in (or 10%) margin; everything else in one line. */
export function detailingChecklist(tax:Taxonomy,units:Units){
 const D=tax.detailing,flags=D.flagged;
 const rows=flags.map(({entry:t,reason})=>{const c=t.check;return `<tr class="${c.status}"><td><b>${esc(c.title)}</b><small>${esc(t.elementLabel)} · ${esc(shortReference(c))}</small></td><td class="num">${sig3(c.demand,q(c),units)}</td><td class="num">${sig3(c.capacity,q(c),units)}</td><td class="num">${margin(c,units)}</td><td>${esc(reason)}</td><td class="res"><b class="${c.status}">${c.status==='pass'?'MET':esc(statusLabel(c.status))}</b></td></tr>`;}).join('');
 const gated=D.gated.filter(t=>t.gate==='advisory'||t.gate==='not-applicable');
 return `<p>Detailing rules are pass/fail: they never set the governing D/C. Listed: rules not met and rules met with less than 1/8 in or 10% margin (fit rules: less than the 1/8 in setting and fit-up tolerance).</p>`
  +(flags.length?`<table class="checks detailing-list"><colgroup><col style="width:36%"/><col style="width:11%"/><col style="width:11%"/><col style="width:9%"/><col style="width:25%"/><col style="width:8%"/></colgroup><thead><tr><th>Rule · element · reference</th><th>Required / provided</th><th>Limit</th><th>Margin</th><th>Flag</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>`:'')
  +`<p class="others"><b>${D.satisfied} detailing rules satisfied</b> with more margin (Appendix A).${gated.length?` Not applicable or advisory: ${gated.map(t=>`${esc(t.check.title)} — ${esc(gateLabel[t.gate].toLowerCase())}`).join('; ')}.`:''}</p>`;
}

/** Recorded inputs with their source (survey, mill certificate, supplier). */
export function inputsTable(tax:Taxonomy,units:Units){
 const v=[...tax.entries.values()].filter(t=>t.type==='input');if(!v.length)return '';
 return `<h3>Recorded inputs and assumptions</h3><table class="assumptions"><colgroup><col style="width:28%"/><col style="width:52%"/><col style="width:10%"/><col style="width:10%"/></colgroup><thead><tr><th>Input</th><th>Basis and source</th><th>Value</th><th>Status</th></tr></thead><tbody>${v.map(t=>{const c=t.check;return `<tr class="${c.status}"><td><b>${esc(c.title)}</b></td><td>${esc(firstSentence(c.note))}</td><td class="num">${c.demand!==undefined?sig3(c.demand,q(c),units):'—'}</td><td><b>${esc(statusLabel(c.status))}</b></td></tr>`;}).join('')}</tbody></table>`;
}
/** Supplied load against the code minimum, with the value that governs. */
export function loadBasisTable(tax:Taxonomy,units:Units){
 const v=[...tax.entries.values()].filter(t=>t.type==='load-basis');if(!v.length)return '';
 return `<h3>Load basis: supplied value against the code minimum</h3><table class="load-basis"><colgroup><col style="width:30%"/><col style="width:14%"/><col style="width:14%"/><col style="width:14%"/><col style="width:28%"/></colgroup><thead><tr><th>Load</th><th>Supplied / used</th><th>Code minimum</th><th>Governs</th><th>Basis</th></tr></thead><tbody>${v.map(t=>{const c=t.check,has=c.demand!==undefined&&c.capacity!==undefined;
  const gov=!has?'—':c.demand!>=c.capacity!-1e-9?'Supplied / used':'Code minimum';
  return `<tr><td><b>${esc(c.title)}</b></td><td class="num">${has?sig3(c.capacity,q(c),units):'—'}</td><td class="num">${has?sig3(c.demand,q(c),units):'—'}</td><td>${esc(gov)}</td><td>${esc(shortReference(c))}</td></tr>`;}).join('')}</tbody></table>`;
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
/** Appendix A: every computed result, with its type, element, group, gate, demand, limit, D/C, reference and case. */
export function appendixA(tax:Taxonomy,units:Units){
 const order:Record<string,number>={design:0,detailing:1,classification:2,input:3,'load-basis':4,verification:5,'by-others':6};
 const v=[...tax.entries.values()].sort((a,b)=>order[a.type]-order[b.type]||a.elementLabel.localeCompare(b.elementLabel));
 return `<p>Every computed result (${v.length}). Type: design checks count toward the governing D/C; detailing rules are pass/fail; the rest are recorded. Gate: evaluated, screened (with the reason) or not applicable. Repeated details are evaluated everywhere and grouped (typical of N, governing instance marked ★).</p><table class="appendix-a"><colgroup><col style="width:7%"/><col style="width:10%"/><col style="width:25%"/><col style="width:16%"/><col style="width:8%"/><col style="width:8%"/><col style="width:5%"/><col style="width:6%"/><col style="width:15%"/></colgroup><thead><tr><th>Type</th><th>Element</th><th>Check · id · reference</th><th>Gate · reason</th><th>Demand</th><th>Limit</th><th>D/C</th><th>Result</th><th>Group · case</th></tr></thead><tbody>${v.map(t=>{const c=t.check;
  return `<tr class="${c.status}" data-check="${esc(c.id)}"><td>${esc(checkTypeLabel[t.type])}${t.effect?`<small>${esc(effectLabel[t.effect])}</small>`:''}</td><td>${esc(t.elementLabel)}</td><td>${esc(c.title)}<small>${esc(c.id)} · ${esc(shortReference(c))}</small></td><td>${esc(gateLabel[t.gate])}${t.reason?`<small>${esc(t.reason)}</small>`:''}</td><td class="num">${sig3(c.demand,q(c),units)}</td><td class="num">${sig3(c.capacity,q(c),units)}</td><td class="num">${dcText(c.utilization,2,'—')}</td><td>${esc(statusLabel(c.status))}</td><td>${t.typicalOf>1?`typical of ${t.typicalOf}${t.governsRepeat?' ★':''}`:''}${location(t)?`<small>${esc(location(t))}</small>`:''}${c.caseId?`<small>${esc(c.caseId)}</small>`:''}</td></tr>`;}).join('')}</tbody></table>`;
}
export const taxonomyCss=`table.body-checks small.ctrl{display:block;font-size:7.5px;margin-top:1px}p.others{font-size:8.5px;margin:2px 0 8px;font-style:italic}p.counts{font-size:9px;border:1px solid #000;padding:4px 8px}table.open-items,table.by-others{font-size:8.5px}table.open-items small,table.by-others small{display:block;font-size:7.5px}table.fatigue-table td small,table.detailing-list td small,table.classification td small{display:block;font-size:7.5px}table.appendix-a{font-size:6.8px}table.appendix-a td{padding:1px 2px;border-bottom:.3px solid #999}table.appendix-a small{display:block;font-size:6px;color:#333}table.appendix-a th{font-size:7px}table.assumptions,table.load-basis,table.classification{font-size:8.5px}p.verified{border-left:3px solid #000;padding:2px 6px}`;

/** CSV of every computed result: type, element, location, group and typical-of-N, gate and reason, values, reference, case. */
export function checksCsv(s:CalculationSnapshot,tax:Taxonomy){
 const cell=(v:unknown)=>{const t=String(v??'');return /[",\n]/.test(t)?`"${t.replace(/"/g,'""')}"`:t;};
 const head=['id','type','effect','element','title','group','location','repeat_group','typical_of','governs_group','body_line','gate','gate_reason','status','demand','capacity','utilization','quantity','units','reference','case','classification_rule'];
 const rows=[...tax.entries.values()].map(t=>{const c=t.check,line=t.line&&tax.shown.some(l=>l.key===t.line)?t.line:'';
  return [c.id,t.type,t.effect??'',t.elementLabel,c.title,c.group,t.location??'',t.repeat??'',t.typicalOf,t.governsRepeat?'yes':'',line,t.gate,t.reason??'',c.status,c.demand??'',c.capacity??'',c.utilization??'',c.quantity??'','SI internal (N, mm, MPa)',shortReference(c),c.caseId??'',t.rule];});
 return [head,...rows].map(r=>r.map(cell).join(',')).join('\n')+'\n';
}

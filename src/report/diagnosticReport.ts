import katex from 'katex';
import type {CalculationSnapshot,CheckResult} from '../engine/types';
import {buildTaxonomy,type TaxonEntry} from '../engine/checkTaxonomy';
import {craneCombinations} from '../engine/aistLoads';
import {dcText} from '../engine/checkPresentation';
import {summaryElements} from './designSummary';
import {appendixA,taxonomyCss} from './taxonomyReport';
import {checkTableCss,fixed2,sig3,statusLabel,subscripts,tidyNumbers} from './reportParts';
import {feetInches} from '../components/drawingFormat';

/**
 * The NOT VERIFIED — DIAGNOSTIC report of a blocked snapshot: the analysis did not pass its own verification
 * (equilibrium or refinement), or the snapshot carries input errors or unsupported results, so no calculation can be
 * issued (calculate.ts `eligible`; checkTaxonomy reviewDraftExportable). This is not that calculation: it states why the
 * package is blocked, with the failed verification and its data, the indicators that explain it and what to do, the
 * inputs and the load basis, and every result with those that depend on the analysis marked UNVERIFIED (no OK / NG).
 * The drawings of a blocked package cite a calculation that is not issued; this report says so on every page.
 */
const esc=(v:unknown)=>subscripts(tidyNumbers(String(v??'')).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)));
const raw=(v:string)=>v.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!));
/** A small measure as printed by a solver check: 0.0069, 4.07 × 10⁻¹¹. */
const sci=(v:number|undefined)=>{if(v===undefined||!Number.isFinite(v))return '—';if(v===0||Math.abs(v)>=1e-3)return String(+v.toPrecision(3));const e=Math.floor(Math.log10(Math.abs(v))),m=v/10**e;return `${m.toFixed(2)} × 10${String(e).replace(/[-0-9]/g,d=>"⁻⁰¹²³⁴⁵⁶⁷⁸⁹"["-0123456789".indexOf(d)])}`;};
/** A ratio as a percentage to three figures at most (the report's rule): 55.6%, 1.00%, 0.69%. */
const pct=(v:number|undefined)=>v===undefined||!Number.isFinite(v)?'—':`${(v*100).toFixed(Math.abs(v)>=.1?1:2)}%`;
const cssText=(v:string)=>`"${v.replace(/[\\"]/g,c=>`\\${c}`).replace(/[\n\r]/g,' ').replace(/</g,'\\3c ').replace(/>/g,'\\3e ')}"`;
const math=(tex:string)=>katex.renderToString(tex,{throwOnError:false,displayMode:false});
/** Types of result that do not depend on the analysis: dimensions and fit, recorded inputs and the supplied loads. */
const independent=new Set<TaxonEntry['type']>(['detailing','input','load-basis','by-others']);
export const diagnosticTitle='NOT VERIFIED — DIAGNOSTIC';

/** What to do about a failed verification, from its kind and the analysis indicators. */
function verificationRemedy(c:CheckResult,s:CalculationSnapshot){
 const st=s.checks.find(v=>v.id==='torsion-stability'),lam=st?.capacity,required=st?.demand,unstable=s.detailResults?.unstableCases??0;
 const nearInstability=(lam!==undefined&&required!==undefined&&lam<required)||unstable>0;
 const instability=nearInstability?` The girder is at or past lateral-torsional instability under the design loads (elastic critical multiplier λ = ${lam?.toFixed(2)??'—'}${required!==undefined?` against ${required.toFixed(2)} required`:''}${unstable?`; ${unstable} strength case${unstable>1?'s':''} buckle below the applied load`:''}): its response does not converge on refinement. Stiffen the girder in lateral bending and torsion or its top-flange restraint, or remove restraint play, before refining the analysis.`:'';
 if(/equilibrium/.test(c.id))return `The model does not satisfy equilibrium: a support, restraint or load is mis-specified, or the model is singular. Check the spans, the supports and the restraint stiffnesses.${instability}`;
 if(/travel|convergence/.test(c.id))return `The governing results changed by ${pct(c.demand)} when the crane-position step was halved (limit ${pct(c.capacity)}).${instability||' Refine the travel step, or check for a result that changes abruptly with the crane position (a load over a very short element or a restraint with play).'}`;
 if(/mesh/.test(c.id))return `The governing results changed by ${pct(c.demand)} when the mesh or the stations were doubled (limit ${pct(c.capacity)}).${instability||' Refine the mesh (more elements per span), or check for very short elements between nodes.'}`;
 return `Resolve this verification before the calculation can be issued.${instability}`;
}

export function diagnosticReport(s:CalculationSnapshot,fontCss=''){
 const p=s.input,u=p.units,tax=buildTaxonomy(s,summaryElements(p));
 const failedVerification=s.checks.filter(c=>c.group==='Analysis'&&c.status!=='pass'),unsupported=s.checks.filter(c=>c.status==='unsupported');
 const reasons=[...s.errors.map(e=>`Input error: ${e}`),...failedVerification.map(c=>`${c.title}: not met (${c.demand!==undefined&&c.capacity!==undefined?`${sci(c.demand)} against the tolerance ${sci(c.capacity)}`:statusLabel(c.status)})`),...unsupported.map(c=>`${c.title}: unsupported`)];
 const r=s.detailResults,st=s.checks.find(c=>c.id==='torsion-stability');
 const verificationRows=s.checks.filter(c=>c.group==='Analysis').map(c=>`<tr class="${c.status==='pass'?'pass':'fail'}"><td><b>${esc(c.title)}</b><small>${raw(c.note)}</small></td><td>${c.equation?math(c.equation):''}</td><td class="num">${sci(c.demand)}</td><td class="num">${sci(c.capacity)}</td><td class="num">${dcText(c.utilization,2,'—')}</td><td class="res"><b>${c.status==='pass'?'Met':'NOT MET'}</b></td></tr>`).join('');
 const indicators:[string,string][]=[
  ...(st?.capacity!==undefined?[['Elastic critical load multiplier λ (0.8 stiffness)',`${st.capacity.toFixed(2)} (required ${st.demand?.toFixed(2)??'—'})`] as [string,string]]:[]),
  ...(r?.unstableCases?[['Strength cases that buckle below the applied load',String(r.unstableCases)] as [string,string]]:[]),
  ...(r?[['Largest twist, any case (unverified)',`${r.twist.toPrecision(3)} rad`],['Rail-head lateral displacement (unverified)',sig3(r.railDisplacement,'length',u)],['Change on travel refinement',`${(r.travelChange*100).toFixed(2)}%`],['Change on mesh refinement',`${(r.meshChange*100).toFixed(2)}%`],['Equation residual',sci(r.residual)]] as [string,string][]:[]),
 ];
 const remedies=failedVerification.map(c=>`<li><b>${esc(c.title)}.</b> ${esc(verificationRemedy(c,s))}</li>`).join('');
 // Inputs and load basis: the data the analysis ran on, independent of its result.
 const inputs:[string,string][]=[['Project',`${p.title} (${p.number})`],['Method / units',`${p.method}, ${u}`],['Girder',`${p.section.name} (${p.section.kind}), F_y ${sig3(p.section.Fy,'stress',u)}`],['Spans',`${p.system}: ${p.spans.map(v=>u==='US'?feetInches(v):fixed2(v,'length',u)).join(' + ')}`],
  ['Unbraced length / restraint spacing',`${fixed2(p.unbracedLength,'length',u)} / ${fixed2(p.lateralBraceSpacing,'length',u)}`],['Rail height / eccentricity',`${fixed2(p.railHeight,'length',u)} / ${fixed2(p.railEccentricity,'length',u)}`],
  ['Support',p.details?.bracket?.enabled?(p.details.bracket.arrangement??'bracket'):p.existingColumn?.enabled?'existing column seat':'seat by others'],['Top-flange restraint',p.details?.brace.arrangement??'—'],['Fatigue cycles',p.fatigue.cycles.toLocaleString('en-US')]];
 const cranes=p.cranes.map(c=>`<tr><td><b>${esc(c.name)}</b><small>${esc(c.loadSource)}</small></td><td>${c.wheels.length}</td><td class="num">${c.wheels.map(w=>sig3(w.loaded,'force',u)).join(' / ')}</td><td class="num">${c.wheels.map(w=>sig3(w.unloaded,'force',u)).join(' / ')}</td><td class="num">${c.wheels.map(w=>sig3(w.lateral,'force',u)).join(' / ')}</td><td class="num">${(c.impact*100).toFixed(0)}%</td></tr>`).join('');
 const combos=craneCombinations(p.method,p.aist?.concurrency==='full').map(c=>`<li>${esc(`${p.method} ${c.id}`)}: ${math(c.equation)}</li>`).join('');
 const dependent=(t:TaxonEntry)=>!independent.has(t.type)&&t.type!=='verification';
 const nDependent=[...tax.entries.values()].filter(dependent).length;
 const footer=`${p.number} · ${diagnosticTitle} · no calculation issued · Calc ${s.revision}`;
 const title=`${esc(p.title)} · ${diagnosticTitle}`;
 return `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title><style>${fontCss}
@page{size:Letter;margin:18mm 14mm 18mm;@top-center{content:${cssText(`${diagnosticTitle} — NOT A CALCULATION — DO NOT USE FOR DESIGN, FABRICATION OR PERMIT`)};font:bold 8px Arial,sans-serif;color:#000}@bottom-left{content:${cssText(footer)};font:8px Arial,sans-serif}@bottom-right{content:"Page " counter(page) " of " counter(pages);font:8px Arial,sans-serif}}
*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:9.5px;line-height:1.45;color:#000}h1{font-size:20px;margin:4px 0}h2{font-size:13px;border-bottom:1px solid #000;margin:16px 0 6px;break-after:avoid}h3{font-size:11px;margin:10px 0 4px;break-after:avoid}
.stamp{border:3px solid #000;padding:8px 12px;margin:10px 0;font-size:12px}.stamp b{display:block;font-size:16px;letter-spacing:.5px}table{width:100%;border-collapse:collapse;margin:6px 0 10px;table-layout:fixed}td,th{border-bottom:.5px solid #888;padding:2px 4px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#e6e6e6}td.num{text-align:right}td small{display:block;font-size:7.5px;color:#222}tr.fail td,tr.unverified td{background:#efefef}ul{margin:4px 0 8px 16px;padding:0}li{margin:2px 0}pre{font-size:7px;white-space:pre-wrap;overflow-wrap:anywhere;border:.5px solid #888;padding:6px}
${checkTableCss}${taxonomyCss}</style></head><body>
<h1>${esc(p.title)}</h1><p>${esc(p.number)} · Crane runway girder · Calc ${esc(s.revision)} · ${esc(s.createdAt.slice(0,10))}</p>
<div class="stamp"><b>${diagnosticTitle}</b>The analysis of this revision did not pass its verification, so no calculation is issued for it. This document is a diagnostic record, not a calculation: the results that depend on the analysis (${nDependent}) are marked UNVERIFIED and carry no OK or NG, and the drawing sheets of this revision, which refer to "the calculation", have no calculation behind them until the analysis verifies.</div>
<h2>1. Why the package is blocked</h2><ul>${reasons.map(v=>`<li>${esc(v)}</li>`).join('')||'<li>Blocked: the snapshot is not eligible for issue.</li>'}</ul>
<h2>2. Analysis verification</h2><table><colgroup><col style="width:34%"/><col style="width:26%"/><col style="width:10%"/><col style="width:10%"/><col style="width:9%"/><col style="width:11%"/></colgroup><thead><tr><th>Verification</th><th>Measure</th><th>Value</th><th>Tolerance</th><th>Ratio</th><th>Result</th></tr></thead><tbody>${verificationRows}</tbody></table>
${indicators.length?`<h3>Indicators</h3><table><tbody>${indicators.map(([k,v])=>`<tr><th style="width:45%">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`:''}
${remedies?`<h3>What is needed</h3><ul>${remedies}</ul>`:''}
<h2>3. Inputs</h2><table><tbody>${inputs.map(([k,v])=>`<tr><th style="width:35%">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
<h2>4. Load basis</h2><table><colgroup><col style="width:30%"/><col style="width:8%"/><col style="width:18%"/><col style="width:18%"/><col style="width:16%"/><col style="width:10%"/></colgroup><thead><tr><th>Crane</th><th>Wheels</th><th>Loaded wheel</th><th>Empty wheel</th><th>Lateral</th><th>Impact</th></tr></thead><tbody>${cranes}</tbody></table>
<p>Load combinations (AIST TR-13 §3.10${p.method==='LRFD'?', with the ASCE 7 §4.9 reading':''}):</p><ul>${combos}</ul>
<h2>5. Results, unverified</h2><p>Every result of the snapshot. Results that depend on the analysis (strength, serviceability, fatigue, stability and their classifications) are printed for diagnosis only and marked <b>Unverified</b>; dimensional and fit rules, recorded inputs and supplied loads do not depend on it and keep their status.</p>${appendixA(tax,u,{unverified:dependent})}
<h2>Appendix: project input</h2><pre>${raw(JSON.stringify(p,null,1))}</pre>
</body></html>`;
}

import {describe,expect,it} from 'vitest';
import {sim002Snapshot} from './fixtures/sim002';
import {buildTaxonomy} from '../src/engine/checkTaxonomy';
import {dcText,noCapacity} from '../src/engine/checkPresentation';
import {deliveredForces} from '../src/engine/forcesDelivered';
import {newSteelTakeoff} from '../src/engine/newSteel';
import {summaryElements,summaryTable} from '../src/report/designSummary';
import {detailTypeName,openGroups} from '../src/report/openItems';
import {banner,bodyTable,countsLine,openItemsBlock,valueCells} from '../src/report/taxonomyReport';
import {compactReport} from '../src/report/compactReport';
import {reportHtml} from '../src/report/reportHtml';
import {workedSteps} from '../src/report/workedChecks';
import {termsFor} from '../src/report/equationTerms';
import {notationSection} from '../src/report/notation';
import {deliveredNote,deliveredRows} from '../src/report/deliveredTable';
import {responsibilityMatrix,runwayParts} from '../src/report/responsibility';
import {equationCell,sig3} from '../src/report/reportParts';
import type {CalculationSnapshot,CheckResult} from '../src/engine/types';

/**
 * Report clarity (calculation-package review, calculation-clarity findings): open items grouped by detail with
 * remedies, true relations and substitutions for failing checks, text conditional on the arrangement, element
 * results that include every open item, NO CAPACITY instead of sentinel ratios, the forces delivered to columns by
 * others, and the NOT VERIFIED — DIAGNOSTIC report of a blocked package. SIM-002 (stored snapshot): an uncapped W27X146
 * on seats by others with a single flexible-plate tie, 52 failing checks.
 */
const base=sim002Snapshot();
const clone=():CalculationSnapshot=>structuredClone(base);
const taxonomy=(s:CalculationSnapshot)=>buildTaxonomy(s,summaryElements(s.input));
const tax=taxonomy(base);
const html=compactReport(base,'');
const page1=html.slice(0,html.indexOf('</section>'));
const text=(h:string)=>h.replace(/<span class="katex-mathml">[\s\S]*?<\/span>/g,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&#39;/g,"'").replace(/\s+/g,' ');
const check=(s:CalculationSnapshot,id:string)=>s.checks.find(c=>c.id===id)!;

describe('open items: one per detail type and element, sorted, with what is needed',()=>{
 const {groups,bounds}=openGroups(tax,base);
 it('groups the register points of one detail, folds the all-cycle bound into the Miner item and counts its locations',()=>{
  expect(tax.openItems.length).toBe(52);
  expect(groups.length).toBeLessThan(16);
  const saddle=groups.filter(g=>g.key.startsWith('register:SA'));
  expect(saddle).toHaveLength(1);
  const g=saddle[0];
  expect(g.title).toBe('Flange saddle · end fillet toe');
  expect(g.locations).toBe(20);expect(g.of).toBe(20);
  // The Miner ratio is the design ratio (fatigue method miner): members are Miner checks, the all-cycle bounds are folded.
  expect(g.members.every(c=>c.id.startsWith('detail-fatigue-'))).toBe(true);
  expect(g.folded).toHaveLength(20);expect(g.folded.every(c=>c.id.startsWith('detail-full-cycle-'))).toBe(true);
  expect(g.dc).toBeCloseTo(Math.max(...g.members.map(c=>c.utilization!)),9);
  expect(groups.some(v=>v.governing.id.startsWith('detail-full-cycle-'))).toBe(false);
  expect(bounds.points).toBe(0);
  expect(detailTypeName('Flange saddle 3 · end fillet toe 2 / top-right')).toBe('Flange saddle · end fillet toe');
  expect(detailTypeName('Rail clip base weld 12 · left')).toBe('Rail clip base weld');
 });
 it('sorts by severity, then by D/C, and names the element of each item',()=>{
  const order={clash:0,redesign:1,detailing:2,input:3};
  for(let i=1;i<groups.length;i++){
   const a=groups[i-1],b=groups[i];
   expect(order[a.kind]<=order[b.kind]).toBe(true);
   if(a.kind===b.kind)expect((a.dc??-1)>=(b.dc??-1)).toBe(true);
  }
  expect(groups[0].dc).toBeCloseTo(3.86,2);
  const block=openItemsBlock(tax,base);
  expect(block.match(/<tr class="open-item" data-status="[a-z-]+" data-open=/g)).toHaveLength(groups.length);
  // No row reads "Redesign flag": each names its element and detail.
  expect(block).not.toContain('Redesign flag');expect(block).toContain('<b>Top-flange tie</b>: ');
  expect(banner(tax,false,true,base)).toContain(`${groups.length} OPEN ITEMS`);
  expect(page1).toContain(`${groups.length} OPEN ITEMS`);
 });
 it('says what is needed: a size, a reduction or the data to supply, never the method note',()=>{
  for(const g of groups){
   expect(g.remedy.length,g.key).toBeGreaterThan(20);
   expect(g.remedy,g.key).not.toBe(g.governing.note);
   expect(g.remedy.startsWith(g.governing.note.slice(0,40)),g.key).toBe(false);
  }
  const by=(id:string)=>groups.find(g=>g.members.some(c=>c.id===id))!.remedy;
  expect(by('bearing-plate')).toMatch(/^Thicken the bearing plate to t_p ≥ 1 1\/8 in/);
  expect(by('stiffener-lateral-flexure')).toMatch(/t_s ≥ 3\/4 in/);
  expect(by('flange-tie-flange')).toMatch(/lengthen the saddle to B ≥ \d/);
  expect(by('flange-tie-saddle-weld')).toMatch(/w ≥ 7\/16 in/);
  expect(by('tie-slip')).toMatch(/more or larger bolts/);
  expect(by('detail-fatigue-SA0--1-top-right')).toMatch(/the stress range must drop by at least 55%/);
  expect(by('column-brackets')).toMatch(/crane columns/);
 });
 it('does not list an all-cycle bound whose Miner ratio is within its limit',()=>{
  const s=clone(),miner=check(s,'detail-fatigue-SA0--1-top-right'),full=check(s,'detail-full-cycle-SA0--1-top-right');
  // Only this point open, by its all-cycle bound alone.
  for(const c of s.checks)if(/^detail-(fatigue|full-cycle)-SA/.test(c.id)&&c!==full){c.status='pass';c.utilization=.8;}
  miner.utilization=.95;full.status='fail';full.utilization=1.1;
  const t=taxonomy(s),{groups:v,bounds:b}=openGroups(t,s);
  expect(v.some(g=>g.key.startsWith('register:SA'))).toBe(false);
  expect(b).toEqual({points:1,max:1.1});
  expect(text(openItemsBlock(t,s))).toContain('The all-cycle bound exceeds 1.0 at 1 more register point (up to 1.10) where the Miner ratio, the design ratio, is within its limit');
 });
});

describe('failing checks: true relations and their substitutions',()=>{
 it('prints the demand side of a failing check with ">" and NG, never "capacity ≥ demand"',()=>{
  const w=workedSteps(base,check(base,'stiffener-lateral-flexure'),(v,q)=>`${v.toFixed(3)}${q}`)!;
  expect(w.join(' ')).toMatch(/H=H_\{top\}\+P_\{br\}/);
  expect(w.at(-1)).toMatch(/\\ >\\ /);expect(w.at(-1)).toContain('\\textbf{NG}');
  expect(w.join(' ')).not.toMatch(/\\ \\(ge|le)\\ /);
  const t=text(html);
  expect(t).toContain('Governing: Restraint diaphragm lateral flexure (AISC 360-16): 41.9 ksi > 29.9 ksi, D/C = 1.40, NG.');
  expect(t).toContain('Also NG: Bearing plate flexure (AISC 360-16 F11): 36.0 ksi > 29.9 ksi, D/C = 1.20, NG.');
 });
 it('never prints a satisfied relation for a failing check, nor a failed one for a passing check',()=>{
  const tx=(v:number,q:string)=>`${v.toPrecision(4)}\\,${q}`;let worked=0;
  for(const c of base.checks){
   const w=workedSteps(base,c,tx);if(!w)continue;worked++;
   const all=w.join(' '),over=c.status==='fail';
   if(over)expect(all,c.id).not.toMatch(/\\ \\(ge|le)\\ |\\le1(?![.\d])|\\le\$\{/);
   else expect(all,c.id).not.toMatch(/\\ [<>]\\ |\\textbf\{NG\}/);
  }
  expect(worked).toBeGreaterThan(5);
 });
 it('works the governing girder check term by term, with the twist and the second-order amplification',()=>{
  const t=text(html),at=t.indexOf('e. Normal stress with warping torsion');
  expect(at).toBeGreaterThan(0);
  const part=t.slice(at,at+2500);
  expect(part).toMatch(/λ = 2\.39 \(0\.8 stiffness\), so the twist and lateral bending are amplified about 1\/\(1 − α\/λ\) = 1\/\(1 − 1\.6\/2\.39\) = 3\.0/);
  expect(part).toMatch(/This check governs over H1 \(part d, 0\.90\)/);
  expect(part).toMatch(/The twist at the governing station, θ = 0\.061 rad, is above 0\.05 rad/);
 });
 it('prints the design checks of a table as demand and limit, plain; the requirement with its sense for a detailing rule',()=>{
  const c=check(base,'bearing-plate');
  expect(valueCells(c,'design','US')).toEqual(['36.0 ksi','29.9 ksi']);
  const edge=check(base,'rail-joint-edge');
  expect(valueCells(edge,'detailing','US')[1]).toMatch(/^≥ /);
  const line=tax.shown.find(l=>l.controlling.id==='bearing-plate')!;
  expect(bodyTable([line],tax,'US')).not.toMatch(/≥|≤/);
 });
});

describe('text follows the arrangement (uncapped W, one flexible plate, top-flange tie only, seat by others)',()=>{
 const t=text(html);
 it('has no capped, paired-bar, haunch or both-flange wording, and no empty references',()=>{
  for(const v of ['paired flat-bar','double-cover','Both cover and central plies','cap legs','cap or flanges','Top / bottom force offset','Support, support','half the cap width','top fiber (cap)','W and cap channel','Capped girder, flange bending','haunches, column stiffeners','section —','e = —','capped sections','girder top plate'])
   expect(t,v).not.toContain(v);
  expect(t).toContain('one flexible plate is at the top flange only, lapped on one gusset face and bolted in single shear (one slip plane) at each end');
  expect(t).toContain('Force offset below the top flange');
 });
 it('states the tie force the tie checks use, F = H + P_br',()=>{
  const d=deliveredForces(base)!,force=(v:number)=>sig3(v,'force','US');
  expect(t).toContain(`Tie design force F = H + P br = ${force(base.detailResults!.demands.brace)} + ${force(d.brace.force)} = ${force(d.tie.design)}`);
 });
 it('defines equation symbols and notation groups by the section',()=>{
  const c=check(base,'torsion-normal');
  expect(termsFor(c).map(([,m])=>m).join(' ')).not.toMatch(/\bcap\b/);
  // A definition that names another symbol prints its subscript, never the underscore.
  expect(equationCell(c)).toContain('I<sub>y</sub> over half the flange width');expect(equationCell(c)).not.toContain('I_y over half');
  expect(termsFor({...c,title:'Combined normal stress with warping · top flange (cap tips)'}).map(([,m])=>m).join(' ')).toContain('half the cap width');
  expect(notationSection(['M_f\\le M_{cf}'])).toContain('Flange bending and rail');
  expect(notationSection(['q_w\\le r_w','M_f'])).toContain('Capped girder, flange bending and rail');
  expect(newSteelTakeoff(base.input).items[0].name).toBe('Girder (W shape)');
  expect(runwayParts(base.input)).toBe('girders, bolted end bearings, ties and end stops');
 });
});

describe('the element results include every open item',()=>{
 it('reads NG where a detailing rule fails though the governing design check passes',()=>{
  const s=clone(),edge=check(s,'rail-joint-edge');edge.status='fail';edge.utilization=1.1;edge.demand=edge.capacity!*1.1;
  const t=taxonomy(s),row=summaryTable(s,t).split('</tr>').find(v=>v.includes('Rail, clips and joints'))!;
  expect(row).toContain('<b class="fail">NG</b>');expect(row).toContain('Open: Rail joint bars, bolt edge distance (not met)');
  // The governing design check of the element is still the one named.
  expect(row).toContain('Rail joint bars, fatigue');
  // A detailing rule is met or not: its open item prints NG without a ratio, and the dimension to provide.
  const item=openItemsBlock(t,s).split('</tr>').find(v=>v.includes('data-open="rail-joint-edge"'))!;
  expect(item).toContain('<td class="num"><b>NG</b></td>');expect(text(item)).toMatch(/Provide at least .* short\)/);
 });
 it('counts the NG design checks and the detailing rules not met or not established under the summary',()=>{
  const ng=[...tax.entries.values()].filter(t=>t.type==='design'&&t.gate==='evaluated'&&t.check.status==='fail').length;
  expect(ng).toBe(51);
  expect(text(countsLine(tax))).toContain(`${tax.counts.designEvaluated} design checks evaluated (51 NG), and ${tax.counts.designScreened} more screened below the fatigue threshold`);
  const s=clone(),edge=check(s,'rail-joint-edge');edge.status='fail';edge.utilization=1.1;
  expect(text(countsLine(taxonomy(s)))).toMatch(/detailing rules \(1 not met(, \d+ with small margin)?, section/);
  edge.status='unverified';
  expect(text(countsLine(taxonomy(s)))).toMatch(/detailing rules \(1 not established(, \d+ with small margin)?, section/);
 });
 it('never shows OK for an element with an open item',()=>{
  const {groups}=openGroups(tax,base),open=new Set(groups.map(g=>g.elementLabel));
  for(const row of summaryTable(base,tax).split('</tr>').slice(1,-1)){
   const label=summaryElements(base.input).find(e=>row.includes(`<b>${e.label}</b>`))?.label;
   if(label&&open.has(label))expect(row,label).toContain('<b class="fail">NG</b>');
  }
 });
});

describe('NO CAPACITY instead of a sentinel or clamped ratio',()=>{
 it('prints NO CAPACITY above 1000 and when not finite',()=>{
  expect(dcText(1.83e7,2)).toBe('NO CAPACITY');expect(dcText(1001,2)).toBe('NO CAPACITY');expect(dcText(Infinity,2)).toBe('NO CAPACITY');
  expect(dcText(999.5,2)).toBe('999.50');expect(noCapacity(2.4)).toBe(false);
 });
 it('never prints the clamped B1 ratio of a tie that has no capacity',()=>{
  const s=clone(),c=check(s,'tie-move-strength');c.demand=18272462.95;c.utilization=18272462.95;c.status='fail';
  const out=text(compactReport(s,''));
  expect(out).not.toMatch(/18,?272|1\.83 × 10/);
  expect(out).toMatch(/NO CAPACITY/);
 },120000);
});

describe('forces delivered to columns by others',()=>{
 it('states the reaction eccentricity from the column face, its moment and where the tie force enters the column',()=>{
  const d=deliveredForces(base)!,p=base.input.details!;
  expect(d.eFrom).toBe('face');expect(d.e).toBeCloseTo(p.brace.flangeAttachment!.columnFace!+p.bearing.width/2,6);
  for(const r of deliveredRows(base,d))expect(r[4]).not.toBe('—');
  const note=deliveredNote(base,d);
  expect(note).toContain('at e = 37.0 in from the column face');expect(note).toContain('for the column centerline add V times half the column depth');
  // The analysis applies the tie force at the bars' centerline (tieLine), so the tie line and the bars coincide.
  expect(d.elevation!.tieBars!).toBeCloseTo(d.elevation!.tie,6);
  expect(note).toMatch(/delivered to the column by the tie at its centerline, El\. /);
  const rows=responsibilityMatrix(tax,base).map(r=>`${r.needed} ${r.forces}`).join(' ');
  expect(rows).not.toContain('@@ref:column@@');expect(rows).toContain('the columns themselves are not checked in this package');
  expect(rows).toContain('from the column face');
 });
});

describe('a blocked package: the NOT VERIFIED — DIAGNOSTIC report, never the calculation',()=>{
 const blocked=()=>{const s=clone(),c=check(s,'detail-travel');c.status='fail';c.demand=.556;c.utilization=55.6;s.eligible=false;return s;};
 it('exports only the diagnostic report, with the failed verification, its data and every dependent result unverified',()=>{
  const s=blocked();
  expect(()=>reportHtml(s)).toThrow(/not eligible/);
  const out=reportHtml(s,undefined,'',{diagnostic:true}),t=text(out);
  expect(t).toContain('NOT VERIFIED — DIAGNOSTIC');expect(t).toContain('no calculation is issued');
  expect(t).toMatch(/Detailed load-position refinement[^]*0\.556[^]*0\.01[^]*NOT MET/);
  expect(t).toContain('The governing results changed by 55.6% when the crane-position step was halved (limit 1.00%)');
  // Design results are unverified (no OK or NG); geometry rules keep their status.
  const rows=[...out.matchAll(/<tr class="([a-z-]+)" data-check="([^"]+)"/g)];
  const design=rows.filter(m=>m[2]==='torsion-normal'||m[2]==='bearing-plate');
  expect(design.map(m=>m[1])).toEqual(['unverified','unverified']);
  expect(rows.find(m=>m[2]==='rail-joint-edge')?.[1]).toBe('pass');
  // Section classifications are geometry: they keep their status; the bracket reaction limit uses the reactions.
  expect(rows.find(m=>m[2]==='compact-flange')?.[1]).toBe('pass');expect(rows.find(m=>m[2]==='column-brackets')?.[1]).toBe('unverified');
  expect(out).not.toContain('class="summary-checks"');expect(out).not.toContain('runway-plan-sheet-page');
 });
 it('leaves an eligible package to its calculation',()=>{
  expect(reportHtml(base,undefined,'',{diagnostic:true})).not.toContain('NOT VERIFIED — DIAGNOSTIC');
 },240000);
});

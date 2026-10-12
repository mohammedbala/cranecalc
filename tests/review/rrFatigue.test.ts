import {beforeAll,describe,expect,it} from 'vitest';
import type {CalculationSnapshot} from '../../src/engine/types';
import type {RunwayDetailResults} from '../../src/engine/runwayDetails';
import {calculate} from '../../src/engine/calculate';
import {buildTaxonomy,categoryLabel,type Taxonomy} from '../../src/engine/checkTaxonomy';
import {summaryElements} from '../../src/report/designSummary';
import {compactReport} from '../../src/report/compactReport';
import {fatigueSnPlot,fatigueTable} from '../../src/report/taxonomyReport';
import {classBasisSentence} from '../../src/engine/buildingClass';
import {demoFocus005RevB} from '../fixtures/demoFocus005RevB';

/**
 * Peer review M7 and the fatigue figure (P4) on DEMO-FOCUS-005 Rev B: Miner results as an equivalent constant-amplitude
 * range against F_SR at the design cycle count (the all-cycle basis), the one-way keeper flange range, the 0.66Fy peak
 * on unfactored loads, AISC category labels, one count definition, the class and cycle-basis statements and the S-N
 * plot of the duty bins. One calculate of Rev B.
 */
const p=demoFocus005RevB();
let s:CalculationSnapshot,tax:Taxonomy,r:RunwayDetailResults,body:string;
const check=(id:string)=>s.checks.find(c=>c.id===id)!;
const KSI=6.894757293168361,Cf:Record<string,number>={A:25,B:12,B1:6.1,C:4.4,D:2.2,E:1.1,E1:.39};
const text=(h:string)=>h.replace(/<annotation[\s\S]*?<\/annotation>/g,'').replace(/<span class="katex-mathml">[\s\S]*?<\/span>/g,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/\s+/g,' ');
beforeAll(()=>{s=calculate(p);tax=buildTaxonomy(s,summaryElements(s.input));r=s.detailResults!;body=text(compactReport(s,''));},900000);

describe('M7 · fatigue basis and presentation (Rev B)',()=>{
 it('stays free of failing and unverified checks',()=>{
  expect(s.eligible).toBe(true);
  expect(s.checks.filter(c=>['fail','unverified','incomplete','unsupported'].includes(c.status)).map(c=>c.id)).toEqual([]);
 });
 it('reports Miner as f_sr,eq = (Σn_i f_sr,i³/N)^(1/3) against F_SR at N, the all-cycle basis (item 1)',()=>{
  // The governing rail keeper register point.
  const keeper=r.fatigue.filter(f=>f.id.startsWith('RC')).reduce((a,b)=>b.damage>a.damage?b:a);
  const c=check(`detail-fatigue-${keeper.id}`),all=check(`detail-full-cycle-${keeper.id}`);
  const N=keeper.bins.reduce((a,b)=>a+b.cycles,0),feq=Math.cbrt(keeper.bins.reduce((a,b)=>a+b.cycles*b.range**3,0)/N),FSR=1000*KSI*Math.cbrt(Cf[keeper.category]/N);
  expect(N).toBe(400000);
  expect(c.quantity).toBe('stress');expect(c.demand!).toBeCloseTo(feq,9);expect(c.capacity!).toBeCloseTo(FSR,9);expect(c.utilization!).toBeCloseTo(feq/FSR,12);
  // Same F_SR as the all-cycle bound, so the two D/Cs are on one basis; the damage sum is (D/C)^3, printed for information.
  expect(all.capacity!).toBeCloseTo(c.capacity!,9);expect(all.demand!).toBeCloseTo(keeper.range,9);
  expect(c.utilization!**3).toBeCloseTo(keeper.damage,12);
  expect(c.equation).toBe('f_{sr,eq}=\\left(\\frac{\\sum_in_if_{sr,i}^{3}}{n_{SR}}\\right)^{1/3}\\le F_{SR}');
  expect(c.note).toMatch(/Σn_i\/N_i = (\d+\.\d{2}|< 0\.01) \(information\)/);
  // No damage sum is reported as a D/C any more: every Miner check is a stress comparison.
  expect(s.checks.filter(v=>/\\sum_i\s*n_i\/N_i|\\sum_i\(f_\{sr,i\}/.test(v.equation)).map(v=>v.id)).toEqual([]);
  // The haunch Miner checks on the same basis: D/C = (Σn_i/N_i)^(1/3) of the bins.
  const top=check('haunch-fatigue-top-flange'),F=r.taperedHaunch!.fatigue,n=F.reduce((a,v)=>a+v.cycles,0);
  expect(top.demand!).toBeCloseTo(Math.cbrt(F.reduce((a,v)=>a+v.cycles*Math.max(0,v.topFlange)**3,0)/n),9);
  expect(top.capacity!).toBeCloseTo(1000*KSI*Math.cbrt(4.4/n),9);
  // The table carries f_sr,eq, F_SR, Σn_i/N_i and both ratios; the rail keeper row's D/C is the Miner ratio.
  const row=tax.fatigue.evaluated.find(v=>v.title==='Rail keeper')!;
  expect(row.miner!).toBeCloseTo(c.utilization!,9);expect(row.dc).toBe(row.miner);expect(row.equivalent!).toBeCloseTo(feq,9);expect(row.capacity!).toBeCloseTo(FSR,9);
  const table=fatigueTable(tax,'US');
  expect(table).toContain('<th>f<sub>sr,eq</sub></th>');expect(table).toContain('<th>Σn<sub>i</sub>/N<sub>i</sub></th>');expect(table).toContain('<th>F<sub>SR</sub> at n<sub>SR</sub></th>');
 });
 it('takes the keeper local flange range one-way, added once to the global range (item 2)',()=>{
  // RC (keeper toe) and CW (cap weld base metal) points share station and flange edge: their bin ranges differ by the local range.
  for(const rc of r.fatigue.filter(f=>f.id.startsWith('RC'))){
   const cw=r.fatigue.find(f=>f.id===rc.id.replace(/^RC/,'CW'))!;
   rc.bins.forEach((b,i)=>expect(b.range-cw.bins[i].range).toBeCloseTo(r.railFatigueBins[i].flangeStress,6));
  }
  const keeper=tax.fatigue.evaluated.find(v=>v.title==='Rail keeper')!;
  // Reviewer's one-way estimate: 9.83 ksi largest range, about 0.56 all-cycle (17.65 ksi Category D at 400,000).
  expect(keeper.range!/KSI).toBeGreaterThan(9.5);expect(keeper.range!/KSI).toBeLessThan(10.2);
  expect(keeper.allCycle!).toBeGreaterThan(.53);expect(keeper.allCycle!).toBeLessThan(.58);
  expect(check(`detail-fatigue-RC0-left`).note).toMatch(/one-way/);expect(body).not.toMatch(/full reversal/i);
 });
 it('checks the Appendix 3.1 peak stress on unfactored loads, never the factored stress (item 5)',()=>{
  const c=check('fatigue-peak-detailed'),peak=Math.max(r.fatiguePeak!.value,...r.fatigue.map(f=>f.peak));
  expect(c.demand!).toBeCloseTo(peak,9);expect(c.capacity!).toBeCloseTo(.66*p.section.Fy,9);
  expect(c.demand!).toBeLessThan(r.normalStress);expect(c.note).toMatch(/unfactored/);expect(c.note).toMatch(/factored strength stresses are not used/);
 });
 it('prints AISC Table A-3.1 categories: C″ for a fillet root (no threshold), items 8.2/8.5, never "Cat. —" (item 3)',()=>{
  const cats=tax.fatigue.rows.map(v=>categoryLabel(v.category,v.title));
  for(const c of cats)expect(c,c).toMatch(/^(A|B|B′|C|C′|C″ \(root, R_FIL\)|D|E|E′|F|item 8\.\d)$/);
  // A weld root with R_FIL < 1 has no threshold (AISC 360-16 Eq. A-3-5/A-3-6): evaluated, never screened.
  const roots=tax.fatigue.rows.filter(v=>v.category==="C''");
  expect(roots.length).toBeGreaterThan(0);for(const v of roots){expect(v.threshold).toBeUndefined();expect(v.gate).toBe('evaluated');}
  expect(tax.fatigue.rows.find(v=>/threaded rod/.test(v.title))!.category).toBe('bolt');
  for(const raw of ['Cat. —','Category bolt',"C''",'Category item','threaded r…'])expect(body,raw).not.toContain(raw);
  expect(fatigueTable(tax,'US')).not.toContain('…');
 });
 it('counts with one definition: checks, body rows, details and register points (item 4)',()=>{
  const reg=s.checks.filter(c=>/^detail-(fatigue|full-cycle)-/.test(c.id)),points=r.fatigue.length;
  expect(reg).toHaveLength(2*points);
  const ev=reg.filter(c=>tax.entries.get(c.id)!.gate==='evaluated'),sc=reg.filter(c=>tax.entries.get(c.id)!.gate==='screened');
  const pts=(v:typeof reg)=>new Set(v.map(c=>c.id.replace(/^detail-(fatigue|full-cycle)-/,''))).size;
  expect(ev.length).toBe(2*pts(ev));expect(sc.length).toBe(2*pts(sc));expect(pts(ev)+pts(sc)).toBe(points);
  expect(body).toContain(`Design checks evaluated ${tax.counts.designEvaluated} (${tax.counts.designShown} body rows; ${ev.length} of them at ${pts(ev)} fatigue register points), screened ${tax.counts.designScreened} (${sc.length} of them at ${pts(sc)} register points)`);
  expect(body).toContain(`The girder detail register has ${points} points`);expect(body).toContain(`${2*points} checks: ${pts(ev)} points (${ev.length} checks) evaluated, ${pts(sc)} points (${sc.length} checks) screened`);
  // Every fatigue design check is in exactly one table row (a detail), evaluated or screened; checks keep their own gate.
  const F=tax.fatigue,members=[...F.evaluated,...F.screened].flatMap(v=>v.members),gate=(id:string)=>tax.entries.get(id)!.gate;
  const fatigueChecks=[...tax.entries.values()].filter(t=>t.type==='design'&&t.effect==='fatigue'&&!/^fatigue-peak/.test(t.check.id)&&t.check.status!=='not-applicable');
  expect(members.length).toBe(fatigueChecks.length);
  const nEv=members.filter(c=>gate(c.id)==='evaluated').length,nSc=members.filter(c=>gate(c.id)==='screened').length;
  expect(nSc).toBe(tax.counts.designScreened);expect(nEv+nSc).toBe(members.length);
  expect(body).toContain(`${F.evaluated.length} details evaluated; ${F.screened.length} details screened`);
  expect(body).toContain(`Of their ${members.length} checks, ${nEv} are evaluated and ${nSc} screened`);
  const keeper=F.evaluated.find(v=>v.title==='Rail keeper')!;expect(keeper.points*2).toBe(keeper.members.length);
  const kSc=pts(keeper.members.filter(c=>gate(c.id)==='screened'));
  expect(body).toMatch(new RegExp(`Rail keeper typical of ${keeper.points} register points \\(${keeper.points-kSc} evaluated, ${kSc} below F TH \\)`));
  expect(body).not.toMatch(/points at \d+ locations/);
 });
 it('states the cycle basis as modelled and the Class B basis where the class is printed (items 6, 7)',()=>{
  expect(body).toMatch(/The 400,000 fluctuations include the loaded and the empty return passages .*an empty passage \(C d = 3\.50 kip per wheel\) is counted at a loaded bin’s range, the lightest being 4\.50 kip per wheel \(Light lifts\)/);
  const sentence=classBasisSentence(p);
  expect(sentence).toBe('Class B: TR-13 Table 1.1 classifies the building by its number of load cycles, and no basis limiting the count to full-load repetitions is stated, so all 400,000 crane load cycles are counted (Class B, 100,000 to 500,000 cycles), where the owner\'s 30,000 full-load repetitions alone would give Class C.');
  expect(check('building-class').note.startsWith(sentence)).toBe(true);
  expect(body).toContain(sentence.replace(/'/g,'\''));
 });
 it('plots every duty bin of each detail, the equivalent range at N, full labels and screened crosses on the N line (P4)',()=>{
  const svg=fatigueSnPlot(tax,'US');
  // Every duty bin of every Miner detail at its own (n_i, f_sr,i), left of n_SR = 400,000; f_sr,eq filled at n_SR.
  const rows=tax.fatigue.evaluated,bins=[...svg.matchAll(/<g class="bin" data-detail="(\d+)" data-n="(\d+)" data-f="([\d.]+)">/g)].map(m=>({d:+m[1],n:+m[2],f:+m[3]}));
  rows.forEach((v,i)=>{
   const mine=bins.filter(b=>b.d===i+1);
   if(v.bins?.length){expect(mine.map(b=>b.n).sort()).toEqual(v.bins.filter(b=>b.range>0).map(b=>b.cycles).sort());
    for(const b of mine)expect(b.f).toBeCloseTo(v.bins.find(x=>x.cycles===b.n)!.range/KSI,2);
    expect(+svg.match(new RegExp(`<g class="eq" data-detail="${i+1}" data-f="([\\d.]+)">`))![1]).toBeCloseTo(v.equivalent!/KSI,2);}
   else expect(mine.map(b=>b.n)).toEqual([400000]);
  });
  expect(bins.some(b=>b.n===60000)&&bins.some(b=>b.n===260000)&&bins.some(b=>b.n===80000)).toBe(true);
  const X=(n:number)=>50+(Math.log10(n)-4)/4*(600-50-118);
  // Full titles in the key, nothing cut; categories as AISC prints them.
  expect(svg).not.toContain('…');expect(svg).not.toContain('Cat. —');
  const words=(t:string)=>t.split(' ');
  for(const v of rows)for(const w of words(v.title))expect(svg,v.title).toContain(w.replace(/&/g,'&amp;').replace(/'/g,'&#39;'));
  // Screened crosses at x = N exactly.
  const xN=X(400000),cross=new RegExp(`M${(xN-2.2).toFixed(1)},[\\d.]+L${(xN+2.2).toFixed(1)},`,'g');
  expect((svg.match(cross)??[]).length).toBeGreaterThan(0);
  // At most two line styles for the curves.
  expect(new Set([...svg.matchAll(/<polyline [^>]*?(stroke-dasharray="([^"]*)")?\/>/g)].map(m=>m[2]??'solid')).size).toBeLessThanOrEqual(2);
 });
});

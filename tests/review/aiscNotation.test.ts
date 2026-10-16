import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {calculate} from '../../src/engine/calculate';
import {presentCheck} from '../../src/engine/checkPresentation';
import {craneCombinations} from '../../src/engine/aistLoads';
import {reportHtml} from '../../src/report/reportHtml';
import {compactReport} from '../../src/report/compactReport';
import {equationSymbols,entrySymbol,notationGroups,notationSection} from '../../src/report/notation';
import {notationSymbols,standardSymbols,termsFor} from '../../src/report/equationTerms';
import {caseLabel} from '../../src/report/reportParts';
import {categoryLabel} from '../../src/engine/checkTaxonomy';
import type {CheckResult} from '../../src/engine/types';
import {demoFocus005RevB} from '../fixtures/demoFocus005RevB';

/**
 * The report's equations use the notation a structural engineer working to AISC writes: AISC 360-16 / Manual symbols,
 * AISC DG7 / DG9 crane-girder and torsion symbols, AIST TR-13 crane loads, with short subscripts (no clause numbers,
 * no prose). The notation work changes no result: every check's id, status and D/C equals revB.checks.json, written
 * from the code before it. The notation section lists only symbols the equations use. One calculate of Rev B.
 */
const p=demoFocus005RevB(),s=calculate(p);
const baseline:{id:string;status:string;utilization:number|null}[]=JSON.parse(readFileSync(new URL('../fixtures/revB.checks.json',import.meta.url),'utf8'));
const unescape=(t:string)=>t.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&amp;/g,'&');
const html=reportHtml(s,undefined,'');
const printed=[...html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map(m=>unescape(m[1]));
const equations=s.checks.map(c=>c.equation).filter(Boolean);
const presented=s.checks.map(c=>presentCheck(c,'US').equation).filter(Boolean);
const combinations=craneCombinations(p.method,p.aist!.concurrency==='full').map(c=>c.equation);
/** Words and code names that make a subscript prose, a document name or a made-up label. */
const prose=/manufactur|driving|driven|single|static|wrench|mesh|fine|coarse|suppl|design|global|unstiff|total|near|owner|AIST|ASCE|CMAA|bumper|runway|rail|bracket|column|bearing|uplift|provided|required|clear|travel|counted|stated|cyclic|peak|keeper|saddle|sleeve|washer|nut|head|base|project|assessment|strip|seat|building|crane|this|other|girder|joint|fit|cap|setback|steel|support|scaled|end|flange|weld|shim|wheel|bolt|row|tie|col|attached|preheat|fatigue|dev|req/i;
const clause=/\b[A-K]\d{1,2}\b|\d+\.\d+|\bJ\d/;
const subscripts=(tex:string)=>[...equationSymbols(tex)].filter(v=>v.includes('_{')).map(v=>({v,sub:v.slice(v.indexOf('_{')+2,-1)}));

describe('AISC notation in the calculation report (Rev B)',()=>{
 it('writes every symbol with a short subscript, without clause numbers or prose',()=>{
  const bad=new Set<string>();
  for(const tex of [...equations,...presented,...printed])for(const {v,sub} of subscripts(tex)){
   const plain=sub.replace(/\\[a-zA-Z]+/g,'');
   if(plain.length>6||clause.test(sub)||prose.test(plain))bad.add(v);
  }
  expect([...bad]).toEqual([]);
  // A spot check of the symbols the review named: none of them survives anywhere in the printed report.
  const all=[...equations,...printed].join(' ');
  for(const old of ['w_{min,J2.4}','R_{n,J10','P_{driving','F_{bumper','\\delta_{v,single','R_{column','T_{fit','c_{wrench}','c_{nut}','\\epsilon','D_{fine}','I_{design}','I_{supplied}','n_{owner}','n_{AIST}','x_{near}','q_{global','y_{row}','t_{attached}','H_{runway}','P_{static}','L_{dev}','h_0'])
   expect(all,old).not.toContain(old);
 });
 it('states torsion and stresses the way DG9 and DG7 write them, not in Vlasov or matrix form',()=>{
  const all=[...equations,...printed].join(' ');
  for(const academic of ['\\partial','\\omega','\\det','v^{\\prime','Ku-f','\\mathbf'])expect(all,academic).not.toContain(academic);
  const eq=(id:string)=>s.checks.find(c=>c.id===id)!.equation;
  // m11 (peer review): each flange at its own extreme fibre, S_xc to the cap and S_xt to the bottom flange.
  // The lateral moment of the coupled second-order analysis already carries theta M_x; both at its 0.8 stiffness (C2.3).
  expect(eq('torsion-normal')).toBe('f_{un}=\\frac{P}{A}+\\frac{M_x}{S_{xc}}+\\frac{M_y}{S_y}+\\sigma_{ws};\\quad\\sigma_{ws}=0.8EW_{no}\\theta^{\\prime\\prime}');
  expect(eq('torsion-normal-bottom')).toBe('f_{un}=\\frac{P}{A}+\\frac{M_x}{S_{xt}}+\\frac{M_yb_f}{2I_y}+\\sigma_{ws};\\quad\\sigma_{ws}=0.8EW_{no}\\theta^{\\prime\\prime}');
  expect(eq('torsion-shear')).toMatch(/^f_\{uv\}=\\tau_b\+\\tau_t\+\\tau_\{ws\}/);
  expect(eq('fatigue')).toMatch(/^f_\{sr\}=f_\{max\}-f_\{min\}\\le F_\{SR\}=/);
  expect(eq('crane-1-traction')).toContain('0.20\\Sigma P_d');
  // m3 (peer review): the governing limit with every criterion stated.
  expect(eq('vertical')).toBe('\\Delta_v\\le L/1000=\\text{0.30 in}');
  // Category F in its US form: F_SR = 100(1.5/n_SR)^0.167 ≥ 8 ksi, never the SI constants.
  const catF=presentCheck(s.checks.find(c=>c.id==='cap-weld-fatigue')!,'US').equation;
  expect(catF).toContain('100(1.5/n_{SR})^{0.167}\\ge8\\,\\mathrm{ksi}');expect(catF).not.toMatch(/690|MPa/);
 });
 it('defines every symbol it uses: AISC standard, the notation section, or a definition under the equation',()=>{
  const known=new Set([...standardSymbols,...notationSymbols()]),undefinedSymbols:string[]=[];
  for(const c of s.checks){if(!c.equation)continue;
   const local=new Set(termsFor(c).map(([t])=>entrySymbol(t)));
   for(const v of equationSymbols(c.equation))if(!known.has(v)&&!local.has(v))undefinedSymbols.push(`${c.id}: ${v}`);}
  expect(undefinedSymbols).toEqual([]);
  // The definitions are printed under the equation in the check tables.
  expect(html).toContain('<small class="where">where ');
 });
 it('labels fatigue categories and load combinations the way AISC and ASCE 7 / TR-13 print them',()=>{
  expect(categoryLabel("C''")).toBe('C″ (root, R_FIL)');expect(categoryLabel("E'")).toBe('E′');
  expect(categoryLabel('bolt')).toBe('item 8.5');expect(categoryLabel('—','Longitudinal bracing · threaded rod fatigue (A-3.1 item 8.5)')).toBe('item 8.5');
  expect(caseLabel('LRFD TR-13 4-S−')).toBe('TR-13 LRFD 4 (S, W reversed)');expect(caseLabel('LRFD 3-S-L')).toBe('ASCE 7 LRFD 3 (S, L)');
  expect(caseLabel('LRFD 10-B')).toBe('LRFD 10 (bumper)');expect(caseLabel('LRFD AIST bumper')).toBe('LRFD TR-13 crane stop');expect(caseLabel('LRFD 2c')).toBe('LRFD 2c');
  // The calculation pages (the drawing sheets carry their own combination table).
  const text=compactReport(s,'').replace(/<annotation[\s\S]*?<\/annotation>/g,'');
  for(const raw of ['TR-13 4-S','AIST bumper','LRFD 6/7','10-T','10-B',"Category bolt",'Cat. —'])expect(text,raw).not.toContain(raw);
  // M1: the capped girder prints the F4 equation it computes (F4-2 with R_pc M_yc, F_L, L_p, L_r), not the F5 form.
  expect(printed.some(t=>t.startsWith('M_{n,LTB}=C_b\\left[R_{pc}M_{yc}-(R_{pc}M_{yc}-F_LS_{xc})'))).toBe(true);
  expect(printed.some(t=>t.startsWith('M_n=\\min(R_{pg}F_{cr}S_{xc}'))).toBe(false);
 });
 // revB.checks.json is regenerated by each finding that changes a result (peer review group B: M2, m10, m11).
 it('leaves every result unchanged: id, status and D/C of every check as in revB.checks.json',()=>{
  expect(s.checks.map(c=>c.id)).toEqual(baseline.map(b=>b.id));
  const differ=(c:CheckResult,b:typeof baseline[number])=>c.status!==b.status||(b.utilization===null?c.utilization!==undefined&&Number.isFinite(c.utilization):Math.abs((c.utilization??NaN)-b.utilization)>1e-9*Math.max(1,Math.abs(b.utilization)));
  expect(s.checks.filter((c,i)=>differ(c,baseline[i])).map(c=>c.id)).toEqual([]);
 });
 it('lists in the notation only symbols the equations use, and every one of them',()=>{
  const used=new Set([...equations,...combinations].flatMap(t=>[...equationSymbols(t)]));
  const entries=notationGroups.flatMap(([,l])=>l.map(([t])=>t));
  // W_h (weight below the hook) enters the crane statics only when the crane has one; Rev B's has none.
  expect(entries.filter(t=>!used.has(entrySymbol(t))&&t!=='W_h')).toEqual([]);
  // Brief: crane-girder symbols only, at most 30 table rows; standard AISC symbols are not listed.
  const n=notationSection([...equations,...combinations]),rows=(n.match(/<tr><td>/g)??[]).length;
  expect(rows).toBeLessThanOrEqual(30);expect(n).toContain('Crane runway symbols.');
  for(const standard of ['F_y','R_n','M_n','\\phi','E','A_g'])expect(entries).not.toContain(standard);
  expect(html).toMatch(/\d\.\d Notation<\/h2>/);
 });
});

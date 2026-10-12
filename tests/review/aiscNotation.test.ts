import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {calculate} from '../../src/engine/calculate';
import {presentCheck} from '../../src/engine/checkPresentation';
import {craneCombinations} from '../../src/engine/aistLoads';
import {reportHtml} from '../../src/report/reportHtml';
import {equationSymbols,entrySymbol,notationGroups,notationSection} from '../../src/report/notation';
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
  expect(eq('torsion-normal')).toBe('f_{un}=\\frac{P}{A}+\\frac{M_x}{S_x}+\\frac{M_y+\\theta M_x}{S_y}+\\sigma_w;\\quad\\sigma_w=EW_{no}\\theta^{\\prime\\prime}');
  expect(eq('torsion-shear')).toMatch(/^f_\{uv\}=\\tau_b\+\\tau_t\+\\tau_\{ws\}/);
  expect(eq('fatigue')).toMatch(/^f_\{sr\}=f_\{max\}-f_\{min\}\\le F_\{SR\}=/);
  expect(eq('crane-1-traction')).toContain('0.20\\Sigma P_d');
  expect(eq('vertical')).toBe('\\Delta_v\\le L/1000');
  // Category F in its US form: F_SR = 100(1.5/n_SR)^0.167 ≥ 8 ksi, never the SI constants.
  const catF=presentCheck(s.checks.find(c=>c.id==='cap-weld-fatigue')!,'US').equation;
  expect(catF).toContain('100(1.5/n_{SR})^{0.167}\\ge8\\,\\mathrm{ksi}');expect(catF).not.toMatch(/690|MPa/);
 });
 it('leaves every result unchanged: id, status and D/C of every check as before the notation work',()=>{
  expect(s.checks.map(c=>c.id)).toEqual(baseline.map(b=>b.id));
  const differ=(c:CheckResult,b:typeof baseline[number])=>c.status!==b.status||(b.utilization===null?c.utilization!==undefined&&Number.isFinite(c.utilization):Math.abs((c.utilization??NaN)-b.utilization)>1e-9*Math.max(1,Math.abs(b.utilization)));
  expect(s.checks.filter((c,i)=>differ(c,baseline[i])).map(c=>c.id)).toEqual([]);
 });
 it('lists in the notation only symbols the equations use, and every one of them',()=>{
  const used=new Set([...equations,...combinations].flatMap(t=>[...equationSymbols(t)]));
  const entries=notationGroups.flatMap(([,l])=>l.map(([t])=>t));
  expect(entries.filter(t=>!used.has(entrySymbol(t)))).toEqual([]);
  // Brief: crane-girder symbols only, at most 30 table rows; standard AISC symbols are not listed.
  const n=notationSection([...equations,...combinations]),rows=(n.match(/<tr><td>/g)??[]).length;
  expect(rows).toBeLessThanOrEqual(30);expect(n).toContain(`(${entries.length})`);
  for(const standard of ['F_y','R_n','M_n','\\phi','E','A_g'])expect(entries).not.toContain(standard);
  expect(html).toMatch(/\/ Notation<\/h2>/);
 });
});

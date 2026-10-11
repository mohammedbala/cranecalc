import {describe,expect,it} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {cappedDemonstrationProject,demonstrationProject} from '../src/engine/demonstration';
import {compactReport} from '../src/report/compactReport';
import {checkTable,monochrome,shortReference,sig3} from '../src/report/reportParts';
import {elementChecks,loadPathFigure} from '../src/report/designSummary';
import {checkFigure,checkGroupPurpose} from '../src/components/checkFigures';
import type {CheckResult} from '../src/engine/types';
import {overPrecise} from './fixtures/reportText';

const capped=calculate(cappedDemonstrationProject());
const html=compactReport(capped,'');
/** Hex colours whose channels differ: anything that is not black, white or a neutral gray. */
const coloured=(text:string)=>[...text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map(m=>m[1].length===3?m[1].split('').map(c=>c+c).join(''):m[1]).filter(h=>!(h.slice(0,2)===h.slice(2,4)&&h.slice(2,4)===h.slice(4,6)));

describe('compact, readable calculation report',()=>{
 it('opens with the summary: result, specified details, the load-path figure and the governing check of each element',()=>{
  const summary=html.indexOf('Design summary'),basis=html.indexOf('1.1 / Scope, codes &amp; design basis');
  expect(summary).toBeGreaterThan(0);expect(basis).toBeGreaterThan(summary);
  expect(html.indexOf('NO FAILED CHECKS')).toBeLessThan(summary);
  expect(html.indexOf('class="load-path-figure"')).toBeGreaterThan(summary);
  expect(html.indexOf('class="summary-checks"')).toBeLessThan(basis);
  // The actual bracket, tie and girder are named on page 1.
  expect(html.slice(0,basis)).toContain('Twin-rib bracket: 2 ribs PL 1 1/2&quot;');
  expect(html.slice(0,basis)).toContain('W24X94 + C15X33.9');
  for(const {element,checks} of elementChecks(capped))if(element.step)expect(html.slice(0,basis)).toContain(element.label.replace('&','&amp;'));
  expect(elementChecks(capped).reduce((n,v)=>n+v.checks.length,0)).toBe(capped.checks.length);
 },240000);
 it('reads as a calculation: inputs, load development, analysis, member checks, then connection checks',()=>{
  const parts=['1 · DESIGN BASIS &amp; INPUTS','2 · LOAD DEVELOPMENT','3 · ANALYSIS','4 · MEMBER CHECKS','5 · CONNECTION CHECKS','6 · DETAILING, FABRICATION &amp; APPLICABILITY'].map(t=>html.indexOf(t));
  expect(parts.every(i=>i>0)).toBe(true);expect([...parts].sort((a,b)=>a-b)).toEqual(parts);
  // Pages are numbered within their part, in order.
  const titles=[...html.matchAll(/<h2>(\d+)\.(\d+) \/ [^<]*<\/h2>/g)].map(m=>[Number(m[1]),Number(m[2])]);
  for(let i=1;i<titles.length;i++)expect(titles[i][0]>titles[i-1][0]||titles[i][1]===titles[i-1][1]+1).toBe(true);
  // Every load with the equation that produced it, before the analysis results that use it.
  const at=(t:string)=>html.indexOf(t);
  for(const t of ['Crane wheel loads &amp; impact','Side thrust, traction &amp; bumper forces','Dead loads, load cases &amp; combinations','Fatigue loading'])expect(at(t)).toBeGreaterThan(parts[1]);
  expect(at('Governing design actions')).toBeGreaterThan(parts[2]);expect(at('Bracket design forces')).toBeGreaterThan(parts[2]);expect(at('Bracket design forces')).toBeLessThan(parts[3]);
  // Members before connections: the girder, rail and bracket as a member, then the welds and attachments.
  // The section heading (page 1 may cite the existing-column reference by the same name when one of its checks governs).
  for(const t of ['Runway girder · strength &amp; stability','Welded bracket · member checks','Existing column check</h2>'])expect(at(t)).toBeGreaterThan(parts[3]),expect(at(t)).toBeLessThan(parts[4]);
  for(const t of ['Cap channel welds','Bolted end bearings','Welded bracket · welds, fatigue','Direct flange attachment','Runway end stops'])expect(at(t)).toBeGreaterThan(parts[4]);
  // Each check group states its loads and governing case, and the girder flexure and shear are worked with numbers.
  expect(html.match(/<p class="basis">/g)!.length).toBeGreaterThan(12);
  const girder=html.slice(at('Runway girder · strength &amp; stability'),at('Runway girder · serviceability'));
  expect(girder).toContain('class="basis"');expect(girder).toContain('class="worked"');expect(girder).toContain('LRFD 2c');
  expect(girder.match(/<span class="katex-display">/g)!.length).toBeGreaterThanOrEqual(3);
  expect(html).not.toContain('@@ref');expect(html).not.toMatch(/sections? —/);
  // Loads and analysis results to three significant figures, positions to 0.1 ft.
  const text=(from:number,to:number)=>html.slice(from,to).replace(/<annotation[\s\S]*?<\/annotation>/g,'').replace(/<[^>]+>/g,' ');
  const digits=(v:string)=>v.replace(/[,.]/g,'').replace(/^0+/,'').replace(/0+$/,v.includes('.')?'':'0').length;
  expect([...text(parts[1],parts[3]).matchAll(/(\d[\d,]*\.\d+) ?(kip|in|ksi|kip-ft|rad)\b/g)].map(m=>m[0]).filter(v=>digits(v.split(' ')[0])>3)).toEqual([]);
  expect(text(parts[1],parts[3])).toMatch(/\d+\.\d ft/);
  // How each main connection is checked: weld metal, rib flexure and the wheel patch worked with numbers.
  for(const t of ['0.6F_{EXX}','F11\\text{-}2','l_b=2(d_{rail}+t_f)','A_{pb}=2(b_s-c)t_s','\\frac{P_r}{2P_c}'])expect(html,t).toContain(t);
 });
 it('prints every check exactly once, each with its equation inline in LaTeX and a code citation',()=>{
  const ids=[...html.matchAll(/data-checks="([^"]*)"/g)].flatMap(m=>m[1].split(' ')),covered=new Set(ids);
  expect(capped.checks.filter(c=>!covered.has(c.id)).map(c=>c.id)).toEqual([]);
  expect(ids.length).toBe(covered.size);
  const rows=[...html.matchAll(/<tr class="[a-z-]+" data-checks="[^"]*">([\s\S]*?)<\/tr>/g)].map(m=>m[1]);
  expect(rows.length).toBeGreaterThan(150);
  for(const row of rows){
   expect(row).toMatch(/<td class="eq">(<span class="katex">|<i>)/);
   expect(row).toMatch(/<small class="ref">[A-Za-z]/);
  }
  expect(html).not.toContain('katex-error');expect(html).not.toMatch(/NaN|undefined/);
  // Separate display-equation boxes are not repeated in the compact report.
  expect(html).not.toContain('<div class="equation">');
 });
 it('prints every number with at most two decimal places',()=>{
  expect(overPrecise(html)).toEqual([]);
 });
 it('is black and white: page styles, figures and embedded sketches carry no colour',()=>{
  expect(coloured(html)).toEqual([]);
  for(const topic of Object.keys(checkGroupPurpose))expect(coloured(checkFigure(topic,cappedDemonstrationProject()).svg)).toEqual([]);
  expect(monochrome('<path stroke="#17212b" fill="#fff"/>')).toBe('<path stroke="#202020" fill="#ffffff"/>');
 });
 it('numbers the load path in each figure as its caption lists it, and names the detail used',()=>{
  const p=cappedDemonstrationProject();
  for(const topic of Object.keys(checkGroupPurpose)){
   const f=checkFigure(topic,p),marks=[...f.svg.matchAll(/font-weight="700" fill="#000">(\d+)<\/text>/g)].map(m=>Number(m[1]));
   expect(f.path.length).toBeGreaterThan(1);
   expect(marks.sort((a,b)=>a-b)).toEqual(f.path.map((_,i)=>i+1));
   expect(f.detail.length).toBeGreaterThan(10);
  }
  expect(checkFigure('Column bracket',p).detail).toContain('Twin-rib bracket');
  expect(checkFigure('Connections',p).detail).toContain('bars at the top flange');
  const svg=loadPathFigure(p);
  for(const n of [1,2,3,4,5,7,8])expect(svg).toContain(`>${n}</text>`);
  expect(svg).toContain('TWIN-RIB BRACKET');expect(svg).toContain('TOP TIE');
 });
 it('cites the specific clause of a connection limit state, three significant figures and two decimals at most',()=>{
  const c=(id:string)=>capped.checks.find(v=>v.id===id)!;
  expect(shortReference(c('tie-slip'))).toBe('AISC 360-16 J3.8');
  expect(shortReference(c('tie-block'))).toBe('AISC 360-16 J4.3');
  expect(shortReference(c('bracket-column-yield'))).toContain('AISC 360-16 J10.2');
  expect(shortReference(c('crane-1-impact'))).toContain('ASCE 7-16 §4.9.3');
  expect(sig3(25.4*0.0329961,'length','US')).toBe('3.30 × 10⁻² in');expect(sig3(25.4*0.25,'length','US')).toBe('0.25 in');expect(sig3(25.4*21.0865,'length','US')).toBe('21.1 in');expect(sig3(914.68*1355817.948,'moment','US')).toBe('915 kip-ft');
 });
 it('collapses checks repeated over stations to their governing member, keeping the count',()=>{
  const rows:CheckResult[]=[1,2,3].map(i=>({id:`s${i}`,group:'Fatigue',title:`Station ${i}`,status:'pass',equation:'\\Delta f\\le F_{SR}',note:'',referenceIds:['aisc-fatigue'],demand:i,capacity:10,utilization:i/10,quantity:'ratio'}));
  const out=checkTable(rows,{units:'US',rendered:new Set()});
  expect(out).toContain('Station 3');expect(out).toContain('governing of 3');expect(out).not.toContain('Station 1<');
  expect(out).toContain('data-checks="s1 s2 s3"');
 });
 it('flags failures at the top and in each row',()=>{
  const s=structuredClone(calculate(demonstrationProject()));const c=s.checks.find(v=>v.id==='major')!;c.status='fail';c.utilization=1.2;
  const out=compactReport(s,'');
  expect(out).toContain('1 CHECK NOT SATISFIED');expect(out).toContain('<b class="fail">NG</b>');
 },240000);
 it('keeps equations free of control characters (unescaped LaTeX backslashes)',()=>{
  for(const c of capped.checks)expect(c.equation).not.toMatch(/[\f\r\t\v\b]/);
 });
});

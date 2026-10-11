import {describe,expect,it} from 'vitest';
import {reviewOpenItem} from './review/openItems';
import {calculate} from '../src/engine/calculate';
import {cappedDemonstrationProject,demonstrationProject} from '../src/engine/demonstration';
import {compactReport} from '../src/report/compactReport';
import {checkTable,monochrome,shortReference,sig3} from '../src/report/reportParts';
import {elementChecks,loadPathFigure} from '../src/report/designSummary';
import {checkFigure,checkGroupPurpose} from '../src/components/checkFigures';
import type {CheckResult} from '../src/engine/types';

const capped=calculate(cappedDemonstrationProject());
const html=compactReport(capped,'');
/** Hex colours whose channels differ: anything that is not black, white or a neutral gray. */
const coloured=(text:string)=>[...text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map(m=>m[1].length===3?m[1].split('').map(c=>c+c).join(''):m[1]).filter(h=>!(h.slice(0,2)===h.slice(2,4)&&h.slice(2,4)===h.slice(4,6)));

describe('compact, readable calculation report',()=>{
 it('opens with the summary: result, specified details, the load-path figure and the governing check of each element',()=>{
  const summary=html.indexOf('Design summary'),basis=html.indexOf('01 / Basis, inputs &amp; scope')>0?html.indexOf('01 / Basis, inputs &amp; scope'):html.indexOf('01 / Basis, inputs & scope');
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
 it('prints every check, each with its equation inline in LaTeX and a code citation',()=>{
  const covered=new Set([...html.matchAll(/data-checks="([^"]*)"/g)].flatMap(m=>m[1].split(' ')));
  expect(capped.checks.filter(c=>!covered.has(c.id)).map(c=>c.id)).toEqual([]);
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
 it('cites the specific clause of a connection limit state and three significant figures',()=>{
  const c=(id:string)=>capped.checks.find(v=>v.id===id)!;
  expect(shortReference(c('tie-slip'))).toBe('AISC 360-16 J3.8');
  expect(shortReference(c('tie-block'))).toBe('AISC 360-16 J4.3');
  expect(shortReference(c('bracket-column-yield'))).toContain('AISC 360-16 J10.2');
  expect(shortReference(c('crane-1-impact'))).toContain('ASCE 7-16 §4.9.3');
  expect(sig3(25.4*0.0329961,'length','US')).toBe('0.0330 in');expect(sig3(914.68*1355817.948,'moment','US')).toBe('915 kip-ft');
 });
 it('collapses checks repeated over stations to their governing member, keeping the count',()=>{
  const rows:CheckResult[]=[1,2,3].map(i=>({id:`s${i}`,group:'Fatigue',title:`Station ${i}`,status:'pass',equation:'\\Delta f\\le F_{SR}',note:'',referenceIds:['aisc-fatigue'],demand:i,capacity:10,utilization:i/10,quantity:'ratio'}));
  const out=checkTable(rows,{units:'US',rendered:new Set()});
  expect(out).toContain('Station 3');expect(out).toContain('governing of 3');expect(out).not.toContain('Station 1<');
  expect(out).toContain('data-checks="s1 s2 s3"');
 });
 it('flags failures at the top and in each row',()=>{
  const s=structuredClone(calculate(demonstrationProject()));s.checks=s.checks.filter(v=>!reviewOpenItem(v));const c=s.checks.find(v=>v.id==='major')!;c.status='fail';c.utilization=1.2;
  const out=compactReport(s,'');
  expect(out).toContain('1 CHECK NOT SATISFIED');expect(out).toContain('<b class="fail">NG</b>');
 },240000);
 it('keeps equations free of control characters (unescaped LaTeX backslashes)',()=>{
  for(const c of capped.checks)expect(c.equation).not.toMatch(/[\f\r\t\v\b]/);
 });
});

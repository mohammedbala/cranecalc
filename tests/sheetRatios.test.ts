import {describe,it,expect} from 'vitest';
import {sheetFixture,sheetFixtureNames} from './fixtures/sheets/sheetFixtures';
import {drawingSheetSet,detailTopics} from '../src/components/planSheet';
import {flangeTieTopic} from '../src/components/flangeTieSheet';
import {sheetEntities} from '../src/components/svgEntities';
import {limitLength} from '../src/components/drawingFormat';
import {elementSummary,inElements,sheetDc,sheetOpenGroups,sheetStamp,sheetTaxonomy,blockedPackage} from '../src/components/sheetRatios';
import {noteStyle} from '../src/components/noteBlocks';
import {holdsFor} from '../src/components/detailHolds';
import type {CalculationSnapshot,CheckResult} from '../src/engine/types';

/**
 * The sheets say what the calculation says (sheetRatios.ts): D/C summaries over the element's whole check set with the
 * failing items named, NO CAPACITY for a part without capacity, a stamp that counts open items, a blocked package that
 * quotes no result, and limits handed to others never rounded up.
 */
const text=(svg:string)=>sheetEntities(svg,'US').filter(e=>e.type==='text').map(e=>e.type==='text'?e.value:'').join(' ');
const setText=(s:CalculationSnapshot)=>drawingSheetSet(s).map(v=>({number:v.number,text:text(v.svg)}));
const notesText=(s:CalculationSnapshot)=>{const t=flangeTieTopic(s)!;return t.notes!(noteStyle(444,s.input.units)).map(b=>text(b.render(0,0))).join(' ').replace(/\s+/g,' ');};
const clone=(s:CalculationSnapshot):CalculationSnapshot=>structuredClone(s);
const templates=sheetFixtureNames().filter(v=>/^t\d\d$/.test(v));

describe('limits handed to others',()=>{
 it('floors a maximum and ceils a minimum, with the decimal where the fraction would mislead',()=>{
  const inch=25.4;
  expect(limitLength(.053*inch,'US','max')).toBe('0.053 IN (3/64)');
  expect(limitLength(.053*inch,'US','min')).toBe('0.053 IN (1/16)');
  expect(limitLength(inch/16,'US','max')).toBe('1/16"');
  expect(limitLength(.984*inch,'US','max')).toBe('0.984 IN (31/32)');
  expect(limitLength(.89*inch,'US','max')).toBe('0.890 IN (7/8)');
  expect(limitLength(1.3462,'SI','max')).toBe('1.3 mm');expect(limitLength(1.3462,'SI','min')).toBe('1.4 mm');
  // Never more than the limit (max) or less than the requirement (min).
  for(const v of [.041,.053,.37,.89,.984,1.2,2.37,7.9])for(const sense of ['max','min'] as const){
   const t=limitLength(v*inch,'US',sense),m=t.match(/^([\d.]+) IN/),printed=m?Number(m[1]):Number(eval(t.replace(/"$/,'').replace(/^(\d+) (\d+\/\d+)$/,'$1+$2')));
   if(sense==='max')expect(printed,t).toBeLessThanOrEqual(v+1e-9);else expect(printed,t).toBeGreaterThanOrEqual(v-1e-9);
  }
 });
 it('prints the bracket deflection limit alike on S-00 and S-03',()=>{
  const s=sheetFixture('t05'),limit=s.checks.find(c=>c.id==='tie-move-support')!.capacity!,v=`DEFLECTION AT THE BEARING UNDER CRANE LOADS ${limitLength(limit,'US','max')} MAX.`;
  const sheets=setText(s);
  // The deferred submittal on the cover and the tie note on the detail sheet: one string.
  const on=sheets.filter(x=>x.text.replace(/\s+/g,' ').includes(v)).map(x=>x.number);
  expect(on.some(n=>n.startsWith('S-00'))).toBe(true);expect(on.some(n=>!n.startsWith('S-00'))).toBe(true);
 },300000);
});

describe('D/C as the sheets print it',()=>{
 const s=sheetFixture('t04');
 it('reads NO CAPACITY, NG above 1.00 and UNVERIFIED for a blocked package',()=>{
  expect(sheetDc(s,Infinity)).toBe('NO CAPACITY');expect(sheetDc(s,1e12)).toBe('NO CAPACITY');expect(sheetDc(s,523)).toBe('> 99 NG');
  expect(sheetDc(s,1.234)).toBe('1.23 NG');expect(sheetDc(s,.5)).toBe('0.50');
  const b=clone(s);b.eligible=false;b.checks.push({id:'analysis-equilibrium',group:'Analysis',title:'Equilibrium',status:'fail',equation:'',note:'',referenceIds:[]});
  expect(blockedPackage(b)).toBe(true);expect(sheetDc(b,.5)).toBe('UNVERIFIED');
 });
 it('takes the tie maximum from the whole tie, the saddle-toe register points included, and names failures',()=>{
  const v=clone(sheetFixture('t03')),sa=v.checks.find(c=>/^detail-fatigue-SA/.test(c.id))!,tie=v.checks.find(c=>c.id==='flange-tie-flange')!;
  Object.assign(sa,{status:'fail',utilization:1.45,demand:(sa.capacity??1)*1.45});
  // A part with no capacity: the flag is the truth (JSON stores its Infinity as null).
  Object.assign(tie,{status:'fail',utilization:null,noCapacity:true});
  const e=elementSummary(v,inElements(['tie'],/^(detail-(fatigue|full-cycle)-SA|plate-tie-keeper-flange$)/));
  expect(e.strength?.dc).toBe(Infinity);expect(e.failing[0].check.id).toBe('flange-tie-flange');
  const t=notesText(v).toUpperCase();
  expect(t).toContain('NO CAPACITY STRENGTH');expect(t).toMatch(/1\.45 NG FATIGUE/);expect(t).toContain(sa.id.toUpperCase());
  expect(t).not.toMatch(/1000000000000|INFINITY|NULL/);
 });
});

describe('every template sheet set',()=>{
 for(const name of templates)it(`${name}: maxima at least the element's design D/C, failures named, no sentinel numbers, the stamp counts open items`,()=>{
  const s=sheetFixture(name),sheets=setText(s),all=sheets.map(v=>v.text).join(' ').toUpperCase(),{tax}=sheetTaxonomy(s);
  // No number of 7 or more significant digits, no D/C above 99.
  for(const m of all.matchAll(/(?<![A-Z0-9.,])\d[\d,]*(\.\d+)?(?![A-Z0-9])/g)){const digits=m[0].replace(/[,.]/g,'').replace(/^0+/,'').replace(/0+$/,'');expect(digits.length,m[0]).toBeLessThan(7);}
  for(const m of all.matchAll(/(\d+\.\d\d) NG/g))expect(Number(m[1])).toBeLessThanOrEqual(99);
  // The flange tie summary is at least the largest evaluated design D/C of the tie.
  const topic=flangeTieTopic(s);
  if(topic){
   const mapped=(c:CheckResult)=>{const t=tax.entries.get(c.id)!;return (t.element==='tie'||/^(detail-(fatigue|full-cycle)-SA|plate-tie-keeper-flange$)/.test(c.id))&&t.type==='design'&&t.gate==='evaluated'&&['pass','fail'].includes(c.status)&&typeof c.utilization==='number';};
   const strength=Math.max(0,...s.checks.filter(c=>mapped(c)&&tax.entries.get(c.id)!.effect!=='fatigue'&&!/fatigue|full-cycle/.test(c.id)).map(c=>c.utilization!));
   const m=notesText(s).match(/MAX\. D\/C ([\d.]+)/);
   if(strength>0){expect(m,name).not.toBeNull();expect(Number(m![1])).toBeGreaterThanOrEqual(Math.min(strength,99)-.005);}
  }
  // Every failing check is named on a sheet: by its id, or by the governing check of its open item.
  const groups=sheetOpenGroups(s);
  for(const c of s.checks.filter(v=>v.status==='fail')){
   const g=groups.find(v=>v.members.includes(c)||v.folded.includes(c));
   expect(all.includes(c.id.toUpperCase())||(!!g&&all.includes(g.governing.id.toUpperCase())),`${name} ${c.id}`).toBe(true);
  }
  const stamp=sheetStamp(s);
  if(groups.length)expect(all).toContain(`${groups.length} OPEN ITEM${groups.length>1?'S':''}`);else expect(stamp).toBeUndefined();
  expect(all).not.toContain('FAILED CHECK');
  if(!s.checks.some(c=>c.status==='fail'))expect(holdsFor(s)).toEqual([]);
 },300000);
});

describe('a package whose analysis did not verify',()=>{
 it('quotes no result: no SEE CALCULATION, no numeric D/C, and says why',()=>{
  const s=clone(sheetFixture('t05'));s.eligible=false;s.checks.push({id:'analysis-equilibrium',group:'Analysis',title:'Equilibrium',status:'fail',equation:'',note:'',referenceIds:[]});
  const sheets=setText(s);
  for(const v of sheets){
   expect(v.text,v.number).not.toContain('SEE CALCULATION');
   expect(v.text,v.number).not.toMatch(/D\/C[^A-Z]{0,4}\d|\d\.\d\d NG|FAILS \d/);
   expect(v.text,v.number).toContain('ANALYSIS NOT VERIFIED - NO CALCULATION ISSUED - SEE DIAGNOSTIC REPORT');
  }
  const cover=sheets.map(v=>v.text).join(' ');
  expect(cover).toContain('NOT ISSUABLE');expect(cover).toContain('NO CALCULATION REPORT IS ISSUED FOR THESE DRAWINGS');
  for(const t of detailTopics(s))for(const v of t.views)expect(v.title).toBeTruthy();
 },300000);
});

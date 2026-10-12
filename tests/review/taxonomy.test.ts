import {describe,expect,it} from 'vitest';
import {demoFocus005Before,demoFocus005Snapshot} from '../fixtures/demoFocus005';
import {buildTaxonomy,classifyCheck,gateCheck,type Taxonomy} from '../../src/engine/checkTaxonomy';
import {summaryElements} from '../../src/report/designSummary';
import {compactReport} from '../../src/report/compactReport';
import {checksCsv} from '../../src/report/taxonomyReport';
import {reportHtml} from '../../src/report/reportHtml';
import {shortReference} from '../../src/report/reportParts';
import {references,tr13Clause} from '../../src/engine/references';
import type {CalculationSnapshot,CheckResult} from '../../src/engine/types';

/**
 * Check taxonomy on DEMO-FOCUS-005 (TAXONOMY.md items 1-9, review A1, A5, C16, C19, C20, C21, D34). The stored
 * snapshot holds every check of the review baseline; variants are edited copies of it.
 */
const base=demoFocus005Snapshot();
const clone=():CalculationSnapshot=>structuredClone(base);
const taxonomy=(s:CalculationSnapshot)=>buildTaxonomy(s,summaryElements(s.input));
const tax=taxonomy(base);
const html=compactReport(base,'');
const page1=html.slice(0,html.indexOf('</section>'));
const text=(h:string)=>h.replace(/<span class="katex-mathml">[\s\S]*?<\/span>/g,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/\s+/g,' ');
/** Without the owner twist criterion (G3 makes it optional): the row is not applicable. */
const noTwist=()=>{const s=clone(),c=s.checks.find(v=>v.id==='rail-twist')!;c.status='not-applicable';delete c.utilization;return s;};
const bodyMembers=(t:Taxonomy)=>new Set([...t.shown.flatMap(l=>[l.controlling.id,...l.also.map(a=>a.id)]),...t.fatigue.evaluated.flatMap(r=>r.members.map(m=>m.id))]);

describe('classification (item 1)',()=>{
 it('gives every check exactly one type from the explicit table, none by default',()=>{
  expect(base.checks).toHaveLength(966);
  const unclassified=base.checks.filter(c=>classifyCheck(c).rule==='default').map(c=>c.id);
  expect(unclassified).toEqual([]);
  const n=tax.counts.byType;
  expect(Object.values(n).reduce((a,b)=>a+b,0)).toBe(966);
  expect(n).toEqual({design:837,detailing:82,classification:12,verification:9,input:16,'load-basis':7,'by-others':3});
 });
 it('types the review examples as the spec says',()=>{
  const type=(id:string)=>classifyCheck(base.checks.find(c=>c.id===id)!).type;
  expect(['cap-angle-lap-edge','cap-angle-washer','end-bearing-washer','end-bearing-seat-fit','cap-angle-endplate-edge','haunch-stiffener-proportions','haunch-flange-web-weld-maximum','stiffener-weld-minimum','minimum-thickness','cap-angle-plate-slenderness'].map(type)).toEqual(Array(10).fill('detailing'));
  expect(['compact-flange','compact-web','cap-proportion','cap-angle-column-holes'].map(type)).toEqual(Array(4).fill('classification'));
  expect(['equilibrium','detail-travel'].map(type)).toEqual(['verification','verification']);
  expect(['crane-1-impact','crane-1-side','load-basis'].map(type)).toEqual(Array(3).fill('load-basis'));
  expect(['column-weld-ce','bracket-receiver','building-class'].map(type)).toEqual(Array(3).fill('input'));
  expect(['supporting-structure','brace-by-others','bracket-load-path'].map(type)).toEqual(Array(3).fill('by-others'));
  expect(['rail-twist','brace-tension','cap-angle-slot-travel','haunch-colstiff-fatigue-weld','detail-fatigue-RC60-left'].map(type)).toEqual(Array(5).fill('design'));
 });
 it('classifies checks other branches add by group and id pattern',()=>{
  const k=(c:Partial<CheckResult>)=>classifyCheck({id:'x',group:'Strength',title:'',status:'pass',equation:'',note:'',referenceIds:[],...c} as CheckResult);
  expect(k({id:'cap-tie-stiffener-clash',group:'Coordination',status:'fail',quantity:'length'}).type).toBe('detailing');
  expect(k({id:'crane-1-statics-runway',group:'Crane input',status:'fail'}).type).toBe('input');
  expect(k({id:'fatigue-cycles',group:'Criteria',status:'fail'}).type).toBe('input');
  expect(k({id:'column-torsion',group:'Existing column',demand:1,capacity:1}).type).toBe('design');
  expect(k({id:'brace-rod-fatigue',group:'Longitudinal bracing',quantity:'stress'}).effect).toBe('fatigue');
  expect(k({id:'wheel-web-tr13',group:'Local forces',quantity:'force'}).effect).toBe('local');
  expect(k({id:'cap-development-full-force',group:'Cap channel',quantity:'force'}).type).toBe('design');
 });
});

describe('gates (item 2; C19, C20, C21)',()=>{
 const gate=(s:CalculationSnapshot,id:string)=>gateCheck(s,s.checks.find(c=>c.id===id)!).gate;
 it('screens fatigue details whose largest range is below F_TH, and keeps the rest',()=>{
  // A weld root (Category C″, R_FIL < 1) has no threshold (AISC 360-16 Eq. A-3-5/A-3-6): always evaluated.
  expect(tax.fatigue.evaluated.map(r=>r.title)).toEqual(['Column stiffener fillets · throat fatigue (A-3.1 item 8.2)','Rail keeper','Column stiffener plates at the flange fillets','Haunch flanges at the column welds (top and bottom)','Keeper body · end-weld root','Existing column flange at the haunch weld toes','Tie plate at the end plate fillets · root']);
  const r=(t:string)=>tax.fatigue.rows.find(v=>v.title===t)!,ksi=(v?:number)=>Number((v!/6.894757293168).toFixed(2));
  expect([ksi(r('Rail keeper').range),r('Rail keeper').category,r('Rail keeper').miner!.toFixed(2),r('Rail keeper').allCycle!.toFixed(2)]).toEqual([13.33,'D','0.65','0.76']);
  expect([ksi(r('Haunch flanges at the column welds (top and bottom)').range),ksi(r('Existing column flange at the haunch weld toes').range),ksi(r('Column stiffener fillets · throat fatigue (A-3.1 item 8.2)').range)]).toEqual([15.94,3.76,10.52]);
  for(const id of ['fatigue','stiffener-fatigue','cap-weld-fatigue','rail-keeper-fatigue','haunch-fatigue-stiffener-weld','cap-angle-plate-fatigue','detail-fatigue-CE3-left','detail-full-cycle-SH-left1-left','detail-fatigue-CA3-L'])expect(gate(base,id)).toBe('screened');
  expect(tax.fatigue.screened.length).toBeGreaterThan(25);
 });
 it('screens every fatigue detail when live-load cycles are under 20,000',()=>{
  const s=clone();s.input.details!.spectrum=s.input.details!.spectrum!.map(v=>({...v,cycles:5000}));
  expect(taxonomy(s).fatigue.evaluated).toHaveLength(0);
  expect(gateCheck(s,s.checks.find(c=>c.id==='haunch-colstiff-fatigue-weld')!).reason).toMatch(/< 20,000/);
 });
 it('re-evaluates a screened detail as soon as its range reaches F_TH (gates run from current results)',()=>{
  const s=clone(),f=s.detailResults!.taperedHaunch!.fatigue;for(const b of f)b.flare*=8;
  expect(gate(base,'haunch-fatigue-flare')).toBe('screened');expect(gate(s,'haunch-fatigue-flare')).toBe('evaluated');
  expect(taxonomy(s).fatigue.evaluated.some(r=>r.members.some(m=>m.id==='haunch-fatigue-flare'))).toBe(true);
 });
 it('treats J10.8 proportions as advisory unless J10 requires the stiffeners (C19)',()=>{
  expect(gate(base,'haunch-stiffener-proportions')).toBe('advisory');
  expect(gate(base,'haunch-colstiff-proportions')).toBe('evaluated'); // R_st = 72.4 kip > 0: J10.2 requires them
  const s=clone();s.checks.find(c=>c.id==='haunch-web-crippling')!.utilization=1.2;
  expect(gate(s,'haunch-stiffener-proportions')).toBe('evaluated');
 });
 it('applies the J2.2b maximum fillet to fillets along edges only, not T-joints (C20)',()=>{
  for(const id of ['haunch-flange-web-weld-maximum','haunch-web-weld-maximum','stiffener-weld-maximum'])expect(gate(base,id)).toBe('not-applicable');
  for(const id of ['cap-weld-max','rail-keeper-weld-size'])expect(gate(base,id)).toBe('evaluated');
 });
 it('develops the full channel force only at partial-length caps (C17 gate)',()=>{
  expect(gate(base,'cap-development')).toBe('not-applicable');
  const s=clone();s.input.capDesign!.fullLength=false;expect(gate(s,'cap-development')).toBe('evaluated');
 });
 it('records F13.1 as a capacity modifier, not a check (C21)',()=>{
  expect(gate(base,'cap-angle-column-holes')).toBe('modifier');
  expect(tax.shown.some(l=>l.members.some(m=>m.id==='cap-angle-column-holes'))).toBe(false);
  expect(text(html)).toMatch(/F13\.1 met: no reduction/);
 });
 it('runs the owner twist criterion only when it is entered',()=>{
  const s=clone(),c=s.checks.find(v=>v.id==='rail-twist')!;delete c.capacity;
  expect(gate(s,'rail-twist')).toBe('not-applicable');expect(gate(base,'rail-twist')).toBe('evaluated');
  expect(tax.shown.find(l=>l.controlling.id==='rail-twist')!.owner).toBe(true);
 });
});

describe('body and page 1 (items 3-5; A1, C16)',()=>{
 it('shows about 35-40 design checks',()=>{
  expect(tax.counts.designShown).toBeGreaterThanOrEqual(35);expect(tax.counts.designShown).toBeLessThanOrEqual(44);
  const rows=(html.match(/<tr class="[a-z-]+" data-checks=/g)??[]).length;
  expect(rows+tax.fatigue.evaluated.length).toBe(tax.counts.designShown);
 });
 it('takes the page-1 governing D/C from a design check: rail rotation 0.98 with the owner twist limit, rod bracing 0.86 without',()=>{
  expect(tax.governing!.check.id).toBe('rail-twist');expect(tax.governing!.dc.toFixed(2)).toBe('0.98');
  expect(text(page1)).toMatch(/Governing design D\/C 0\.98: Rail rotation/);
  const t=taxonomy(noTwist());expect(t.governing!.check.id).toBe('brace-tension');expect(t.governing!.dc.toFixed(2)).toBe('0.86');
  // Never a detailing minimum (lap-bolt edge distance 1.00) or the cap-end full-force rule (0.97).
  for(const v of [tax,t])expect(['cap-angle-lap-edge','cap-development','cap-angle-column-holes']).not.toContain(v.governing!.check.id);
 });
 it('keeps every design check that governed its element or had D/C ≥ 0.5 in the body, merged, or gated with a reason',()=>{
  const before=demoFocus005Before().checks,members=bodyMembers(tax),missing:string[]=[];
  // Old report: the governing check of each element (failure, else largest non-length D/C) and every row at D/C ≥ 0.5.
  const elements=summaryElements(base.input),old=new Set<string>();
  for(const e of elements){const v=base.checks.filter(c=>elements.find(x=>x.match(c))===e&&c.utilization!==undefined&&c.quantity!=='length'&&c.status==='pass');if(v.length)old.add(v.reduce((a,b)=>b.utilization!>a.utilization!?b:a).id);}
  for(const c of before)if((c.utilization??0)>=.5)old.add(c.id);
  for(const id of old){
   const t=tax.entries.get(id)!;if(t.type!=='design')continue;
   if(t.gate!=='evaluated'){expect(t.reason,id).toBeTruthy();continue;}
   if(!members.has(id))missing.push(id);
  }
  expect(missing).toEqual([]);
 });
 it('keeps the retained checks at their D/C',()=>{
  const before=new Map(demoFocus005Before().checks.map(c=>[c.id,c]));
  for(const l of tax.shown)expect(l.controlling.utilization,l.controlling.id).toBe(before.get(l.controlling.id)!.utilization);
  for(const m of html.matchAll(/<tr class="[a-z-]+" data-checks="([^"]+)">([\s\S]*?)<\/tr>/g)){
   const l=tax.shown.find(v=>v.members.map(x=>x.id).join(' ')===m[1])!,dc=[...m[2].matchAll(/<td class="num">([^<]*)<\/td>/g)].map(v=>v[1])[2];
   expect(dc,l.key).toBe(before.get(l.controlling.id)!.utilization!.toFixed(2));
  }
 });
 it('merges redundant checks into one line naming the controlling limit state (item 4)',()=>{
  const line=(key:string)=>tax.lines.find(l=>l.key.startsWith(key+'@'))!;
  expect(line('girder-combined').members.map(c=>c.id).sort()).toEqual(['combined','minor','torsion-normal']);
  expect(line('girder-combined').controlling.id).toBe('torsion-normal'); // warping combined stress governs: reported instead
  expect(line('girder-ltb').controlling.id).toBe('flexure-load-height');
  expect(line('cap-angle-lap-bolts').controlling.id).toBe('cap-angle-lap-slip');
  expect(line('end-bearing-bolts').members).toHaveLength(7);
  expect(line('haunch-stiffeners').controlling.id).toBe('haunch-stiffener-column');
  expect(line('rail-joint').members).toHaveLength(5);
  expect(text(html)).toMatch(/Cap tie sleeves and plate washers Controlling: Steel sleeves · bolt installation load/);
 });
 it('groups repeated register points as typical of N with the governing location (item 3)',()=>{
  const keeper=tax.fatigue.rows.find(r=>r.title==='Rail keeper')!;
  expect(keeper.typicalOf).toBe(272);expect(keeper.governing.id).toMatch(/^detail-fatigue-RC60-(left|right)$/);expect(keeper.location).toMatch(/Rail keeper 61, x = 109\.8 ft/);
  expect(tax.entries.get('detail-fatigue-RC10-left')!.typicalOf).toBe(272);
 });
 it('puts open items first on page 1 and never says "no failed checks" while one exists (A1)',()=>{
  // The baseline's tie-hardware / bearing-stiffener notice came from the unused gusseted-tie template; coordination is
  // now derived from the Coordination checks (G4, A1), which the stored baseline snapshot does not hold: no open item.
  expect(tax.openItems).toEqual([]);expect(text(page1)).not.toMatch(/Connection layout requires redesign/);
  const s=clone();
  s.checks.push({id:'cap-tie-stiffener-clash',group:'Coordination',title:'Cap tie nuts clear of the girder bearing stiffeners',status:'fail',demand:3.2,capacity:-5,utilization:1e12,quantity:'length',equation:'c\\ge c_{min}',note:'OPEN ITEM: CONNECTION LAYOUT REQUIRES REDESIGN; do not fabricate this arrangement.',referenceIds:[]},
   {id:'crane-1-data',group:'Crane input',title:'Crane supplier data',status:'unverified',equation:'',note:'Bridge speed and minimum wheel loads are missing.',referenceIds:[]});
  const t=taxonomy(s),h=compactReport(s,''),p1=text(h.slice(0,h.indexOf('</section>')));
  expect(t.openItems.map(o=>o.kind)).toEqual(['clash','input']);
  expect(p1).toMatch(/2 OPEN ITEMS — REVIEW REQUIRED/);expect(p1).not.toMatch(/NO FAILED CHECKS|ALL DESIGN CHECKS SATISFIED/);
  expect(p1.indexOf('Cap tie nuts clear')).toBeLessThan(p1.indexOf('Design summary'));
  expect(p1.indexOf('Crane supplier data')).toBeLessThan(p1.indexOf('Design summary'));
  // Detailing never sets the governing D/C, even a failed clash.
  expect(t.governing!.check.id).toBe('rail-twist');
 });
 it('prints the counts line',()=>{
  expect(text(page1)).toMatch(/Design checks evaluated 414 \(44 body rows; 272 of them at 136 fatigue register points\), screened 419 \(400 of them at 200 register points\), not applicable 4; detailing rules 75 \(16 flagged\)/);
 });
 it('states exactly what remains by others with the forces delivered (D34)',()=>{
  const t=text(page1);
  // Peer review M10/C4: page 1 lists each item with its responsible party (the responsibility matrix in section 6.7 gives
  // what is needed, the criterion and the forces) and the per-grid concurrent force sets delivered to the columns.
  expect(t).toMatch(/Not checked in this package: responsibility matrix/);
  expect(t).toMatch(/Collector, brace connections|Crane-level strut on the girder line/);expect(t).toMatch(/Building engineer of record/);
  expect(t).toMatch(/Forces delivered to the building columns/);expect(t).toMatch(/LRFD 2c 35\.6 kip/);
  const m=text(html.slice(html.indexOf('/ Not checked in this package · responsibility matrix</h2>')));
  expect(m).toMatch(/base shear 10 kip and column axial ±7\.2 kip/);expect(m).toMatch(/Acceptance criterion/);
 });
});

describe('detailing checklist, fatigue table, appendix and CSV (items 6-8)',()=>{
 const section=(title:string)=>{const i=html.indexOf(`<h2>${title}`)>=0?html.indexOf(`<h2>${title}`):html.indexOf(` / ${title}</h2>`);return html.slice(i,html.indexOf('</section>',i));};
 it('lists only flagged detailing rules on one page, never with a D/C',()=>{
  const flagged=tax.detailing.flagged.map(f=>f.entry.check.id);
  expect(flagged).toEqual(expect.arrayContaining(['end-bearing-seat-fit','cap-angle-endplate-edge','cap-angle-lap-edge','cap-angle-washer','end-bearing-washer','stiffener-weld-minimum','haunch-web-weld-minimum']));
  expect(flagged.length).toBeLessThanOrEqual(25);
  const page=text(section('Detailing checklist'));
  expect(page).toMatch(/59 detailing rules satisfied/);
  expect(page).not.toMatch(/Bolt spacing/); // a satisfied rule with margin is not listed
  expect(page).toMatch(/Bearings and bolts fit on the haunch top flange .* Met exactly: no margin for the 1\/8 in setting \/ fit-up tolerance/);
 });
 it('prints one short fatigue table with both methods side by side and the setting stated',()=>{
  const page=text(section('Fatigue · girder and attachments'));
  expect(page).toMatch(/Governing method: Miner’s rule, D\/C = f sr,eq \/F SR \(bold\); the all-cycle ratio is shown alongside/);
  expect(page).toMatch(/7 details evaluated; 3\d details screened/);
  expect(page).toMatch(/Rail keeper typical of 136 register points Rail keeper 61, x = 109\.8 ft D 7\.00 ksi 17\.65 ksi 13\.33 ksi 11\.51 ksi 0\.28 0\.65 0\.76 OK/);
  const s=clone();s.input.fatigue.method='all-cycle';
  const t=taxonomy(s);expect(t.fatigue.evaluated.find(r=>r.title==='Rail keeper')!.dc!.toFixed(2)).toBe('0.76');
 });
 it('lists every computed result in Appendix A and the CSV',()=>{
  // Appendix A groups checks repeated over stations into one row (typical of N; data-members lists them); the CSV keeps every row.
  const a=section('Appendix A');expect((a.match(/<tr class=/g)??[]).length).toBeLessThan(966/2);
  const listed=[...a.matchAll(/data-check="([^"]*)"(?: data-members="([^"]*)")?/g)].flatMap(m=>m[2]?m[2].split(' '):[m[1]]);
  expect(listed).toHaveLength(966);expect(new Set(listed)).toEqual(new Set(base.checks.map(c=>c.id)));
  const csv=checksCsv(base,tax).trim().split('\n');expect(csv).toHaveLength(967);
  expect(csv[0]).toBe('id,type,effect,element,title,group,location,repeat_group,typical_of,governs_group,body_line,gate,gate_reason,status,demand,capacity,utilization,quantity,units,reference,case,case_name,classification_rule');
  expect(new Set(csv.slice(1).map(r=>r.split(',')[0]))).toEqual(new Set(base.checks.map(c=>c.id)));
  expect(csv.find(r=>r.startsWith('haunch-fatigue-stiffener-weld,'))).toMatch(/,screened,"?Below threshold: largest range 7\.29 ksi < F_TH 8\.00 ksi/);
 });
});

describe('TR-13 basis and clause citations (A5)',()=>{
 const cite=(id:string)=>shortReference(base.checks.find(c=>c.id===id)!);
 it('cites AIST TR-13 as the 2021 edition, keeping the source document in the audit record only',()=>{
  // Owner decision: the February 24, 2020 document is treated as the 2021 edition; the record keeps that provenance.
  const tr13=references.filter(r=>/^AIST Technical Report 13/.test(r.title));expect(tr13.length).toBeGreaterThan(10);
  for(const r of tr13){expect(r.title).toBe('AIST Technical Report 13');expect(r.edition).toBe('2021');expect(r.status).toBe('partial');expect(r.evidence).toMatch(/February 24, 2020/);}
  const printed=text(html);expect(printed).toContain('AIST Technical Report 13 (2021)');
  expect(printed).not.toMatch(/UNVERIFIED \(text not read\)|text not read|not re-read|transcribed from|committee draft|ballot draft|February 24, 2020|2021 printing/);
  expect(text(html)).not.toMatch(/supplied source dated February 24, 2020/);
 });
 it('cites the clause that governs each limit state',()=>{
  expect(cite('vertical')).toMatch(/AIST TR-13 §5\.8\.7( ·|$)/);
  expect(cite('compact-web')).toMatch(/AIST TR-13 §5\.8\b/);expect(cite('shear')).toMatch(/AIST TR-13 §5\.8\b/);
  expect(cite('wheel-yield')).toMatch(/AIST TR-13 §5\.8\.6/);
  expect(cite('end-bearing-sleeve')).toMatch(/AIST TR-13 §5\.14/);
  expect(cite('rail-keeper-flexure')).toMatch(/AIST TR-13 §5\.16( ·|$)/);expect(cite('rail-joint-bolts')).toMatch(/AIST TR-13 §5\.16\.1/);
  expect(cite('minimum-thickness')).toMatch(/AIST TR-13 §5\.13/);
  expect(cite('detail-fatigue-RC1-left')).toMatch(/§5\.7/);
  // No deflection, web or sleeve check cites §5.7 (fatigue); no rail check cites §5.9 or §5.13.
  for(const id of ['vertical','lateral','rail-head','compact-web','shear','wheel-yield','end-bearing-sleeve'])expect(cite(id)).not.toMatch(/§5\.7\b/);
  for(const id of ['rail-keeper-flexure','rail-keeper-weld','rail-joint-bolts','rail-clips','rail-flexure'])expect(cite(id)).not.toMatch(/§5\.(9|13)\b/);
  expect(cite('end-bearing-spacing')).not.toMatch(/TR-13/);
  expect(tr13Clause('haunch-seat-strip')).toBe('§5.9.2');
 });
});

describe('review draft export with missing-data open items (unverified)',()=>{
 it('exports a REVIEW DRAFT listing the unverified items first; an issued report still requires eligibility',()=>{
  const s=clone();
  s.checks.push({id:'column-frame',group:'Existing column',title:'Existing column · frame type and sway amplification',status:'unverified',equation:'',note:'Frame type not entered: the column check is provisional.',referenceIds:[]});
  s.eligible=false;
  expect(()=>reportHtml(s,undefined,'')).toThrow(/not eligible/);
  const h=reportHtml(s,undefined,'',{reviewDraft:true}),p1=text(h.slice(0,h.indexOf('</section>')));
  expect(p1).toMatch(/REVIEW DRAFT — NOT FOR ISSUE/);expect(p1).toMatch(/1 OPEN ITEM —/);
  expect(p1.indexOf('frame type and sway amplification')).toBeLessThan(p1.indexOf('Design summary'));
  // Unsupported results or failed analysis verification are never exported, draft or not.
  const u=structuredClone(s);u.checks.push({...u.checks.at(-1)!,id:'x-unsupported',status:'unsupported'});
  expect(()=>reportHtml(u,undefined,'',{reviewDraft:true})).toThrow();
 });
});

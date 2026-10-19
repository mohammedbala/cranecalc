import {describe,expect,it} from 'vitest';
import {sim002Snapshot} from './fixtures/sim002';
import {integrityAndGates} from '../src/engine/calculate';
import {buildTaxonomy,classifyCheck,gateCheck,openKind} from '../src/engine/checkTaxonomy';
import {openGroups} from '../src/report/openItems';
import {countsLine,maximumRule,openItemsBlock} from '../src/report/taxonomyReport';
import {summaryElements} from '../src/report/designSummary';
import type {CalculationSnapshot,CheckResult} from '../src/engine/types';

/**
 * Open items filed under the kind of what they need (the classification table of checkTaxonomy.ts): strength checks as
 * design even with a length quantity, applicability limits and the bumper against the stop as redesign, 'input' only for
 * missing data and true input checks, the E2 user note as a recommendation, one item per physical weld or member.
 * SIM-002 (stored): an uncapped W27X146 with a single flexible-plate tie, 52 failing checks before this layer.
 */
const kip=4448.2216152605,inch=25.4;
const chk=(v:Partial<CheckResult>&{id:string}):CheckResult=>({group:'Test',title:v.id,status:'pass',equation:'',note:'Module note.',referenceIds:[],...v});
const taxonomy=(s:CalculationSnapshot)=>buildTaxonomy(s,summaryElements(s.input));
const text=(h:string)=>h.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ');

describe('classification table',()=>{
 it('types the base plate thickness and a prying thickness as design, never as a detailing default',()=>{
  const plate=chk({id:'base-plate',group:'New column base',status:'fail',demand:1.58*inch,capacity:inch,utilization:1.58,quantity:'length',equation:'t\\ge l\\sqrt{\\frac{2f_p}{\\phi F_y}};\\quad t\\ge\\sqrt{\\frac{4Tx}{\\phi BF_y}}'});
  expect(classifyCheck(plate)).toMatchObject({type:'design',effect:'flexure',rule:'id'});
  expect(openKind({check:plate,type:'design'})).toBe('redesign');
  const prying=chk({id:'column-cap-prying',group:'Column cap',quantity:'length',equation:'t_{min}=\\sqrt{\\frac{4Tb^\\prime}{\\phi pF_u}}'});
  expect(classifyCheck(prying)).toMatchObject({type:'design',rule:'default'});
  // A dimension without a resistance factor stays a detailing rule.
  expect(classifyCheck(chk({id:'brace-rod-crossing',group:'Bracing',quantity:'length',equation:'s\\ge d_{rod}+1/4\\,in'})).type).toBe('detailing');
 });
 it('files the TR-13 §5.9.2 applicability limits and the bumper against the stop as redesign',()=>{
  for(const id of ['column-brackets','bracket-tr13-load']){
   const c=chk({id,group:'Detailing',status:'fail',demand:339.5e3,capacity:222.4e3,utilization:1.53,quantity:'force'});
   expect(classifyCheck(c).type,id).toBe('classification');expect(openKind({check:c,type:classifyCheck(c).type}),id).toBe('redesign');
  }
  const bumper=chk({id:'crane-1-bumper-stop',group:'Bumper selection',status:'fail',demand:36*kip,capacity:20*kip,utilization:1.8,quantity:'force'});
  // A restatement of the end-stop checks: a bumper-selection record (not counted twice), filed as the end stop's redesign.
  expect(classifyCheck(bumper).type).toBe('input');expect(openKind({check:bumper,type:'input'})).toBe('redesign');
 });
 it("keeps 'input' for missing data and true input checks only",()=>{
  const k=(c:CheckResult)=>openKind({check:c,type:classifyCheck(c).type});
  expect(k(chk({id:'crane-1-statics-runway',group:'Crane input',status:'fail',demand:62*kip,capacity:61*kip,utilization:1.02,quantity:'force'}))).toBe('input');
  expect(k(chk({id:'crane-1-data',group:'Crane input',status:'fail'}))).toBe('input');
  expect(k(chk({id:'shear',group:'Strength',status:'unverified'}))).toBe('input');
  expect(k(chk({id:'long-span-backup',group:'Bracing',status:'unsupported'}))).toBe('redesign');
  expect(k(chk({id:'hook-bolts',group:'Detailing',status:'fail',demand:1,capacity:.5,utilization:2,quantity:'ratio'}))).toBe('redesign');
  expect(k(chk({id:'rail-joint-edge',group:'Rail',status:'fail',demand:30,capacity:25,utilization:1.2,quantity:'length'}))).toBe('detailing');
  expect(k(chk({id:'tie-stiffener-gusset-length',group:'Connections',status:'fail',demand:-212,capacity:158,quantity:'length',geometry:true}))).toBe('clash');
 });
 it('reads a maximum rule only for detailing checks',()=>{
  expect(maximumRule(chk({id:'crane-1-statics-runway',group:'Crane input',title:'Crane · Maximum load on one runway',quantity:'force'}))).toBe(false);
  expect(maximumRule(chk({id:'flange-tie-weld-maximum',group:'Flange attachment',title:'Saddle weld · maximum size',quantity:'length'}))).toBe(true);
 });
});

describe('open items of SIM-002',()=>{
 const s=sim002Snapshot();
 // The tie bars' E2 user-note slenderness above 200 (strut and tie, 211 on baseline:3) and a bumper without a stop strength.
 Object.assign(s.checks.find(c=>c.id==='tie-slenderness')!,{status:'fail',demand:211,utilization:1.055});
 s.checks.push(chk({id:'bracket-tr13-load',group:'Bracket',title:'AIST column bracket · reaction recommendation',status:'fail',demand:307404.5,capacity:222411.1,utilization:1.382,quantity:'force',note:'Reference AIST Technical Report 13 §5.9.2.'}));
 integrityAndGates(s);
 const tax=taxonomy(s),{groups}=openGroups(tax,s);
 const group=(id:string)=>groups.find(g=>g.members.some(c=>c.id===id));
 it('lists the E2 user note as a recommendation, not an open item or a failure',()=>{
  const c=s.checks.find(v=>v.id==='tie-slenderness')!;
  expect(c.status).toBe('not-applicable');expect(c.utilization).toBeCloseTo(1.055,3);
  expect(gateCheck(s,c)).toMatchObject({gate:'advisory',recommendation:true});
  expect(tax.openItems.some(o=>o.check.id==='tie-slenderness')).toBe(false);expect(group('tie-slenderness')).toBeUndefined();
  expect(tax.recommendations.map(r=>r.check.id)).toContain('tie-slenderness');
  expect(text(openItemsBlock(tax,s))).toMatch(/Recommendations? \(not code requirements, not counted as open items\):.*Flexible plate, slenderness 211 against 200 \(AISC 360-16 E2 user note: L ?c ?\/r preferably should not exceed 200\)[.;]/);
  // The strength deficiency stays in the H1 check of the tie.
  expect(group('tie-move-strength')!.kind).toBe('redesign');
 });
 it('lists the TR-13 §5.9.2 bracket guideline (clause to be verified) as an advisory while the bracket checks pass',()=>{
  expect(group('column-brackets')).toBeUndefined();expect(group('bracket-tr13-load')).toBeUndefined();
  const c=s.checks.find(v=>v.id==='bracket-tr13-load')!;
  expect(gateCheck(s,c)).toMatchObject({gate:'advisory',recommendation:true});
  expect(tax.recommendations.map(r=>r.check.id)).toContain('bracket-tr13-load');
  expect(text(openItemsBlock(tax,s))).toMatch(/reaction above the TR-13 guideline for brackets, consider a crane column or stepped column/);
  // A failing check of the bracket itself keeps the guideline an open item beside it.
  const failing={...s,checks:[...s.checks,chk({id:'bracket-root-weld',group:'Bracket',status:'fail',demand:2,capacity:1,utilization:2,quantity:'force'})]};
  expect(gateCheck(failing,{...c,status:'fail'}).gate).toBe('evaluated');
 });
 it('reads the column gusset root fillets as one weld, the tie in compression as one member',()=>{
  const welds=tax.lines.find(l=>l.key.startsWith('tie-column-welds@'))!;
  expect(welds.members.map(c=>c.id).sort()).toEqual(['flange-tie-column-weld','tie-move-weld','tie-weld']);
  expect(welds.controlling.id).toBe('tie-move-weld');expect(welds.also.map(c=>c.id)).toEqual(expect.arrayContaining(['tie-weld','flange-tie-column-weld']));
  const g=group('tie-weld')!;expect(g.members.map(c=>c.id)).toEqual(['tie-move-weld','tie-weld']);expect(group('tie-move-weld')).toBe(g);
  const member=tax.lines.find(l=>l.key.startsWith('tie-member@'))!;
  expect(member.members.map(c=>c.id).sort()).toEqual(['brace-member','plate-tie-compression']);
  // The two weld-root fatigue checks of the column gusset are one row of the fatigue table.
  const rows=tax.fatigue.rows.filter(r=>r.members.some(m=>m.id==='tie-root-fatigue'||m.id==='flange-tie-column-root-fatigue'));
  expect(rows).toHaveLength(1);expect(rows[0].title).toBe('Column gusset root · weld-root normal fatigue');
 });
 it('counts no comparison bound or recommendation as an NG design check',()=>{
  const ng=[...tax.entries.values()].filter(t=>t.type==='design'&&t.gate==='evaluated'&&t.check.status==='fail').map(t=>t.check.id);
  expect(ng.some(id=>id.startsWith('detail-full-cycle-'))).toBe(false);expect(ng).not.toContain('tie-slenderness');
  expect(text(countsLine(tax))).toContain(`(${ng.length} NG)`);
 });
 it('ranks no capacity first in the governing D/C',()=>{
  const t=structuredClone(s);t.checks.push(chk({id:'end-stop-slip',group:'End stops',title:'Bolts · slip with tension',status:'fail',demand:10*kip,capacity:0,utilization:1e12,quantity:'force'}));
  integrityAndGates(t);const g=taxonomy(t).governing!;
  expect(g.check.id).toBe('end-stop-slip');expect(g.dc).toBe(Infinity);
 });
});

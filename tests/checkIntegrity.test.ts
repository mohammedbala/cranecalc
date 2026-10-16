import {describe,expect,it} from 'vitest';
import {sim002Snapshot} from './fixtures/sim002';
import {demoFocus005Snapshot} from './fixtures/demoFocus005';
import {geometricCheck,normalizeCheck,normalizeChecks} from '../src/engine/checkIntegrity';
import {compared} from '../src/engine/math';
import {buildTaxonomy,dcOf} from '../src/engine/checkTaxonomy';
import {issueStatus} from '../src/engine/drawingData';
import {stopDesignStrength} from '../src/engine/craneInput';
import {tieMovementChecks} from '../src/engine/tieMovement';
import {braceSystem} from '../src/engine/detailAnalysis';
import {checksCsv,valueCells} from '../src/report/taxonomyReport';
import {summaryElements} from '../src/report/designSummary';
import type {CalculationSnapshot,CheckResult} from '../src/engine/types';

/**
 * Check integrity (checkIntegrity.ts): every check tells the truth about its own status. A dimension that is negative
 * fails as a geometry conflict without a ratio; a part with no capacity fails with an infinite ratio and the flag; the
 * results of a ply its holes lie outside of are not valid; the snapshot lists its geometry conflicts.
 */
const inch=25.4,kip=4448.2216152605;
const chk=(v:Partial<CheckResult>&{id:string}):CheckResult=>({group:'Test',title:v.id,status:'pass',equation:'',note:'Module note.',referenceIds:[],...v});
const snap=(checks:CheckResult[]):CalculationSnapshot=>{const s=sim002Snapshot();s.checks=checks;return s;};

describe('rule (i): impossible geometry fails as a geometry conflict',()=>{
 it('fails a negative gusset length that passed with a negative D/C, with no ratio and the length in the note',()=>{
  // t08 before the tie-length fix: tie-stiffener-gusset-length passed at D/C -1.34 with a required length of -212 mm.
  const c=chk({id:'tie-stiffener-gusset-length',title:'Unbraced gusset length covers the stiffener extension',demand:-212,capacity:158,utilization:-212/158,quantity:'length',equation:'L_g\\ge x_{end}-x_{st}',substitution:'x'});
  const n=normalizeCheck(c,snap([]));
  expect(n.status).toBe('fail');expect(n.geometry).toBe(true);expect(n.utilization).toBeUndefined();expect(n.noCapacity).toBeUndefined();expect(n.substitution).toBeUndefined();
  expect(n.note).toMatch(/^Invalid geometry: required length = −8\.35 in: a negative length; the parts it spans overlap by 8\.35 in \(provided 6\.22 in\)\. Module note\.$/);
  // The demand and capacity stay as computed.
  expect([n.demand,n.capacity]).toEqual([-212,158]);
 });
 it('states the overlap of a negative clearance, never NO CAPACITY for a dimension',()=>{
  const c=chk({id:'tie-stiffener-bar-clearance',title:'Tie bars clear the bearing stiffener',status:'fail',demand:6.35,capacity:-332.9,utilization:1e12,quantity:'length'});
  const n=normalizeCheck(c,snap([]));
  expect(n.geometry).toBe(true);expect(n.noCapacity).toBeUndefined();expect(n.utilization).toBeUndefined();
  expect(n.note).toMatch(/^Invalid geometry: provided clear distance = −13\.11 in: the parts overlap by 13\.11 in \(1\/4 in required, short by 13\.36 in\)\./);
  // An edge rule with the hole centre outside the part.
  const e=normalizeCheck(chk({id:'end-stop-flange-edge',title:'Girder flange · bolt edge distance',status:'fail',demand:1.5*.75*inch,capacity:-.25*inch,utilization:-4.5,quantity:'length'}),snap([]));
  expect(e.note).toMatch(/^Invalid geometry: provided edge distance = −1\/4 in: the hole centre lies 1\/4 in outside the part \(1 1\/8 in required, short by 1 3\/8 in\)\./);
 });
 it('gives a used-up clearance no ratio and keeps a met zero clearance', ()=>{
  const used=normalizeCheck(chk({id:'coord-tie-stiffener',status:'fail',demand:3.175,capacity:0,utilization:1e12,quantity:'length'}),snap([]));
  expect(used.status).toBe('fail');expect(used.utilization).toBeUndefined();expect(used.geometry).toBeUndefined();expect(used.noCapacity).toBeUndefined();
  expect(used.note).toMatch(/^No ratio: 0 in provided against 1\/8 in required, short by 1\/8 in\./);
  const met=normalizeCheck(chk({id:'coord-tie-stiffener',status:'pass',demand:0,capacity:0,utilization:1e12,quantity:'length'}),snap([]));
  expect(met.status).toBe('pass');expect(met.utilization).toBeUndefined();
 });
 it('treats lengths and fit, clearance, edge, length and gap rules as dimensions, not fatigue or strength',()=>{
  expect(geometricCheck({id:'end-bearing-plate-bearing',quantity:'force'})).toBe(false);
  expect(geometricCheck({id:'bracket-colstiff-weld-length',quantity:'ratio'})).toBe(true);
  expect(geometricCheck({id:'bracket-fatigue-rib-edge',quantity:'ratio'})).toBe(false);
  expect(geometricCheck({id:'end-stop-flange-prying',quantity:'length'})).toBe(true);
 });
});

describe('rule (ii): no capacity is a flag and an infinite ratio, never a sentinel',()=>{
 it('fails a zero resistance with utilization Infinity and noCapacity',()=>{
  // baseline:15: end-stop-slip with no slip resistance left under the bolt tension, D/C 1e12.
  const n=normalizeCheck(chk({id:'end-stop-slip',status:'fail',demand:10*kip,capacity:0,utilization:1e12,quantity:'force'}),snap([]));
  expect(n.status).toBe('fail');expect(n.noCapacity).toBe(true);expect(n.utilization).toBe(Infinity);
  expect(n.note).toMatch(/^No capacity: the resistance is 0 kip against a demand of 10 kip\. Module note\./);
 });
 it('flags a clamped amplifier ratio above 1000 and keeps the module explanation',()=>{
  const n=normalizeCheck(chk({id:'tie-move-strength',status:'fail',demand:18272463,capacity:1,utilization:18272463,quantity:'ratio',note:'B1 clamped.'}),snap([]));
  expect(n.noCapacity).toBe(true);expect(n.utilization).toBe(Infinity);expect(n.note).toMatch(/^No capacity: the computed ratio \(1\.83e\+7\) is above 1000/);
  const own=normalizeCheck(chk({id:'tie-move-strength',status:'fail',demand:Infinity,capacity:1,utilization:Infinity,quantity:'ratio',note:'Lap couple: elastic instability, αP_r/P_e1 = 1.20 ≥ 1, no capacity.'}),snap([]));
  expect(own.noCapacity).toBe(true);expect(own.note).toBe('Lap couple: elastic instability, αP_r/P_e1 = 1.20 ≥ 1, no capacity.');
 });
 it('leaves a check with nothing to carry met at a zero ratio, and a finite D/C alone',()=>{
  const zero=normalizeCheck(chk({id:'brace-tension',status:'pass',demand:0,capacity:0,utilization:NaN,quantity:'force'}),snap([]));
  expect(zero.status).toBe('pass');expect(zero.utilization).toBe(0);expect(zero.noCapacity).toBeUndefined();
  const ok=chk({id:'shear',status:'fail',demand:120,capacity:100,utilization:1.2,quantity:'force'});
  expect(normalizeCheck(ok,snap([]))).toBe(ok);
 });
 it('ranks no capacity above every finite D/C and a rule without a ratio below',()=>{
  expect(dcOf(chk({id:'a',status:'fail',utilization:Infinity,noCapacity:true}))).toBe(Infinity);
  // A stored snapshot (JSON) writes Infinity as null: the flag decides.
  expect(dcOf(chk({id:'a',status:'fail',noCapacity:true}))).toBe(Infinity);
  expect(dcOf(chk({id:'a',status:'fail',utilization:1e12,quantity:'force'}))).toBe(Infinity);
  expect(dcOf(chk({id:'a',status:'fail',geometry:true,quantity:'length'}))).toBe(-1);
  expect(dcOf(chk({id:'a',status:'fail',utilization:3.2}))).toBe(3.2);
 });
 it('applies the same rules in the shared compared() for new code',()=>{
  const g=compared('x-gap','Test','Gap',-2,5,'length','g\\ge0','n',[]);
  expect(g.status).toBe('fail');expect(g.geometry).toBe(true);expect(g.utilization).toBeUndefined();
  const none=compared('x-shear','Test','Shear',5,0,'force','V\\le\\phi V_n','n',[]);
  expect(none.status).toBe('fail');expect(none.noCapacity).toBe(true);expect(none.utilization).toBe(Infinity);expect(none.substitution).toBeUndefined();
  const ok=compared('x-shear','Test','Shear',5,10,'force','V\\le\\phi V_n','n',[]);
  expect(ok).toMatchObject({status:'pass',utilization:.5});expect(ok.substitution).toMatch(/=0\.5000$/);
  expect(compared('x-clear','Test','Clear',0,0,'length','c\\ge0','n',[]).status).toBe('pass');
 });
});

describe('rule (iii): results of a ply its holes lie outside of are not valid',()=>{
 const stop=(edge:number)=>[
  chk({id:'end-stop-flange-edge',title:'Girder flange · bolt edge distance',status:edge>=28.575?'pass':'fail',demand:28.575,capacity:edge,utilization:28.575/edge,quantity:'length'}),
  chk({id:'end-stop-bearing-flange',title:'Girder flange · bolt bearing / tearout',status:'pass',demand:5000,capacity:250000,utilization:.02,quantity:'force'}),
  chk({id:'end-stop-flange-prying',title:'Girder top flange · thickness for no prying (ratio t_min/t)',status:'pass',demand:7.8,capacity:16.3,utilization:.48,quantity:'length'}),
  chk({id:'end-stop-base-edge',title:'Base plate · bolt edge distance',status:'pass',demand:28.575,capacity:38.1,utilization:.75,quantity:'length'}),
  chk({id:'end-stop-bearing-base',title:'Base plate · bolt bearing / tearout',status:'pass',demand:5000,capacity:284000,utilization:.018,quantity:'force'})];
 it('fails the flange bearing and prying of stop holes 0.26 in outside the W flange (baseline:17)',()=>{
  const s=snap(stop(-.26*inch));normalizeChecks(s);
  const by=(id:string)=>s.checks.find(c=>c.id===id)!;
  expect(by('end-stop-flange-edge').geometry).toBe(true);
  for(const id of ['end-stop-bearing-flange','end-stop-flange-prying']){
   expect(by(id).status,id).toBe('fail');expect(by(id).utilization,id).toBeUndefined();
   expect(by(id).note,id).toMatch(/^Not valid: Girder flange · bolt edge distance fails \(invalid geometry\)/);
  }
  // The base plate holes are inside the base plate: its results stand.
  expect(by('end-stop-bearing-base').status).toBe('pass');expect(by('end-stop-bearing-base').utilization).toBe(.018);
  expect(s.geometryConflicts).toEqual([{id:'end-stop-flange-edge',title:'Girder flange · bolt edge distance'}]);
  // The bumper is not compared with a stop strength computed on those plies.
  expect(stopDesignStrength(s.input,stop(-.26*inch),40*kip)).toBe(0);
 });
 it('keeps the bearing and prying results of a short edge distance with the holes inside the ply',()=>{
  const s=snap(stop(20));normalizeChecks(s);
  expect(s.checks.find(c=>c.id==='end-stop-flange-edge')!.status).toBe('fail');
  expect(s.checks.find(c=>c.id==='end-stop-bearing-flange')!.status).toBe('pass');
  expect(s.geometryConflicts).toEqual([]);
  // A hole edge past the flange edge (edge distance under the hole radius) makes them not valid.
  const t=snap(stop(8));normalizeChecks(t);expect(t.checks.find(c=>c.id==='end-stop-flange-prying')!.note).toMatch(/^Not valid: .*the holes or parts lie outside the ply/);
 });
});

describe('rule (iv): the snapshot lists its geometry conflicts, the issue status names them',()=>{
 it('lists a negative gusset length and keeps the calculation exportable',()=>{
  const s=sim002Snapshot(),eligible=s.eligible;
  s.checks.push(chk({id:'tie-stiffener-gusset-length',title:'Unbraced gusset length covers the stiffener extension',demand:-212,capacity:158,utilization:-1.34,quantity:'length'}));
  normalizeChecks(s);
  expect(s.geometryConflicts).toEqual([{id:'tie-stiffener-gusset-length',title:'Unbraced gusset length covers the stiffener extension'}]);
  expect(s.eligible).toBe(eligible);
  expect(issueStatus(s).reasons).toContain('Geometry conflict: Unbraced gusset length covers the stiffener extension');
  // The taxonomy files it as a clash/geometry open item without a D/C; the CSV says why the D/C is empty.
  const tax=buildTaxonomy(s,summaryElements(s.input));
  expect(tax.openItems.find(o=>o.check.id==='tie-stiffener-gusset-length')!.kind).toBe('clash');
  const row=checksCsv(s,tax).split('\n').find(r=>r.startsWith('tie-stiffener-gusset-length,'))!;
  expect(row).toMatch(/,fail,-8\.35,6\.22,,length,in,.*,invalid geometry$/);
 });
});

describe('stored calculations through the integrity layer',()=>{
 for(const [name,s0] of [['SIM-002',sim002Snapshot()],['DEMO-FOCUS-005',demoFocus005Snapshot()]] as const){
  it(`${name}: no check passes with a negative dimension; every ratio above 1000 is a flagged no capacity`,()=>{
   const s=structuredClone(s0);normalizeChecks(s);
   const negative=s.checks.filter(c=>geometricCheck(c)&&c.status==='pass'&&((c.demand??0)<0||(c.capacity??0)<0));
   expect(negative.map(c=>c.id)).toEqual([]);
   const sentinel=s.checks.filter(c=>c.utilization!==undefined&&(Number.isNaN(c.utilization)||c.utilization>1e3)&&!(c.noCapacity&&c.utilization===Infinity));
   expect(sentinel.map(c=>c.id)).toEqual([]);
   expect(s.checks.filter(c=>c.geometry).every(c=>c.status==='fail'&&c.utilization===undefined)).toBe(true);
   expect(s.geometryConflicts!.map(c=>c.id)).toEqual(s.checks.filter(c=>c.geometry).map(c=>c.id));
  });
 }
});

describe('inverse-sense checks print the provided value and the requirement',()=>{
 it('reads the footing factor of safety and λ as value and limit with the true relation',()=>{
  const sliding=normalizeCheck(chk({id:'base-sliding',status:'fail',demand:1.5,capacity:.31,utilization:4.84,quantity:'ratio'}),snap([]));
  expect(sliding.sense).toBe('min');expect(valueCells(sliding,'design','US')).toEqual(['0.31','&lt; 1.50']);
  const lambda=normalizeCheck(chk({id:'torsion-stability',status:'pass',demand:1/.9,capacity:1.37,utilization:.81,quantity:'ratio'}),snap([]));
  expect(valueCells(lambda,'design','US')).toEqual(['1.37','≥ 1.11']);
  // A strength check keeps demand and limit.
  expect(valueCells(chk({id:'shear',status:'pass',demand:100,capacity:200,utilization:.5,quantity:'ratio'}),'design','US')).toEqual(['100','200']);
 });
});

describe('tie B1: one end-condition model, no clamped amplifier',()=>{
 // SIM-002: a single flexible plate tie (ASD, α = 1.6); P_c and P_e1 over the same L_c = 0.8 × the length between the
 // innermost bolt rows (the old P_e1 used K = 1, 1/0.64 lower).
 const s=sim002Snapshot(),b=braceSystem(s.input),E=s.input.section.E,t=s.input.details!.brace;
 const Pe1=Math.PI**2*E*(t.width*t.thickness**3/12)/b.member.bucklingLength**2,strength=(F:number)=>tieMovementChecks(s,{force:F,member:b.member}).find(c=>c.id==='tie-move-strength')!;
 it('amplifies the lap couple with P_e1 over the length of P_c',()=>{
  const c=strength(11.425*kip);
  expect(c.note).toMatch(new RegExp(`B1 = ${(1/(1-1.6*11.425*kip/Pe1)).toFixed(3)} \\(C_m = 1, P_e1 = [\\d.]+ kip over L_c = [\\d.]+ in, the length of P_c\\)`));
  expect(c.note).toMatch(/Both ends are fixed in their bolt groups \(movement moment 6EIΔ\/L², L_c = 0\.8 × the length between the innermost bolt rows for P_c and P_e1\)/);
 });
 it('gives a finite D/C where the K = 1 Euler load was below αP_r (baseline:12)',()=>{
  // αP_r between the K = 1 Euler load (0.64 P_e1) and P_e1: the old B1 was clamped to 1e9 (D/C 18,272,463 on baseline:12).
  const F=.8*Pe1/1.6,c=normalizeCheck(strength(F),s);
  expect(1.6*F).toBeGreaterThan(.64*Pe1);
  expect(Number.isFinite(c.utilization)).toBe(true);expect(c.noCapacity).toBeUndefined();expect(c.utilization!).toBeLessThan(1e3);
  expect(c.note).toMatch(/B1 = 5\.000 \(C_m = 1/);
 });
 it('fails with elastic instability and no capacity when αP_r reaches P_e1',()=>{
  const c=normalizeCheck(strength(1.1*Pe1/1.6),s);
  expect(c.status).toBe('fail');expect(c.noCapacity).toBe(true);expect(c.utilization).toBe(Infinity);
  expect(c.note).toMatch(/elastic instability, αP_r\/P_e1 = 1\.10 ≥ 1 \(P_e1 = [\d.]+ kip over L_c = [\d.]+ in\), no capacity/);
  expect(c.note).not.toMatch(/^No capacity:/);
 });
});

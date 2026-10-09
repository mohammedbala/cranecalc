import { describe,it,expect } from 'vitest';
import katex from 'katex';
import { calculate,validateProject } from '../src/engine/calculate';
import { exampleProject } from '../src/engine/defaults';
import { aistCraneMinimum,craneCombinations } from '../src/engine/aistLoads';
import { girderStrength,concentratedResistance } from '../src/engine/aiscStrength';
import { sectionProperties } from '../src/engine/section';
import { fatigueResistance } from '../src/engine/aistChecks';
import { loadAiscSection,aiscWShapes } from '../src/data/aiscSections';
import { toDisplay } from '../src/engine/units';
import { references } from '../src/engine/references';
import { designProject } from './fixtures/aistProject';
describe('AIST draft loads and applicability',()=>{
 it('uses the greatest side-thrust rule and distinguishes pendant, maintenance and stacker cranes',()=>{
  const c=designProject().cranes[0];let m=aistCraneMinimum(c);expect(m.totalSide).toBe(.4*136000);expect(m.runwaySide).toBe(27200);expect(m.traction).toBe(22000);
  c.design!.control='pendant';m=aistCraneMinimum(c);expect(m.impact).toBe(.1);expect(m.totalSide).toBe(.1*(136000+18000+70000));
  c.design!.control='cab';c.design!.type='maintenance';expect(aistCraneMinimum(c).impact).toBe(.2);
  c.design!.type='stacker';c.design!.rigidArmWeight=10000;expect(aistCraneMinimum(c).totalSide).toBe(272000);
  c.design!.type='mill';c.design!.ratedLoad=10000;c.design!.trolleyWeight=80000;expect(aistCraneMinimum(c).totalSide).toBe(18000);
 });
 it('pins corrected 2b and the distinct single-crane impact and ASD minimum-lift terms',()=>{
  const lrfd=craneCombinations('LRFD'),asd=craneCombinations('ASD');
  expect(lrfd.find(c=>c.id==='2b')).toMatchObject({cd:1.2,cv:1.6,h:1.6,l:1.6,i:0});
  expect(lrfd.find(c=>c.id==='2c')).toMatchObject({single:true,i:1.6,h:0});
  expect(asd.find(c=>c.id==='10')).toMatchObject({d:.6,cd:.6,cv:1,h:1,minimumLift:true});
  expect(asd.find(c=>c.id==='2b')).toMatchObject({i:1,h:0,single:true});
 });
 it('keeps legacy projects valid and identifies missing design input instead of source-pending placeholders',()=>{
  const p=structuredClone(exampleProject);expect(validateProject(p)).toEqual([]);const s=calculate(p);
  expect(s.errors).toEqual([]);expect(s.eligible).toBe(false);expect(s.checks.find(c=>c.id==='load-basis')?.status).toBe('incomplete');expect(s.checks.find(c=>c.id==='crane-1-manufacturer')?.status).toBe('incomplete');
  expect(s.checks.find(c=>c.id==='major')?.demand).toBeGreaterThan(s.analysis!.demand.moment);
  expect(s.checks.some(c=>c.status==='unverified')).toBe(false);
 });
});
describe('Independent AISC and published DG7 benchmarks',()=>{
 it('matches DG7 Example 14.1.1 W24×131 available major and whole-section minor ASD strengths',()=>{
  const p=designProject();p.method='ASD';p.section=loadAiscSection(p.section,'W24X131');p.section.Fy=50*6.894757293;p.section.E=29000*6.894757293;p.unbracedLength=360*25.4;
  const v=girderStrength(p,sectionProperties(p.section));
  expect(toDisplay(v.major,'moment','US')).toBeCloseTo(605,0);expect(toDisplay(v.minor,'moment','US')).toBeCloseTo(203,0);
  expect(v.k/25.4).toBeCloseTo(1.46,8);expect(v.compact).toBe(true);expect(v.shearPhi).toBe(1);expect(v.shearOmega).toBe(1.5);
  // DG7's flange-only definition is used conservatively; do not substitute the
  // worked example's whole-section Manual minor strength for a single flange.
  expect(toDisplay(v.flangeMinor,'moment','US')).toBeCloseTo(99.645,2);
  p.method='LRFD';const lrfd=girderStrength(p,sectionProperties(p.section));expect(toDisplay(lrfd.major,'moment','US')).toBeCloseTo(909,0);
 });
 it('agrees with DG7 ASD conservative moment envelopes and the concurrent closed-form solution',()=>{
  const p=designProject();p.method='ASD';p.spans=[360*25.4];p.section=loadAiscSection(p.section,'W24X131');p.section.Fy=50*6.894757293;p.section.E=29000*6.894757293;
  p.section.density=131*.45359237/.3048/(p.section.A*1e-6);p.railWeight=.05*4448.221615/304.8;p.unbracedLength=p.lateralBraceSpacing=p.spans[0];
  Object.assign(p.aist!,{bottomBraceSpacing:p.spans[0],axialLength:p.spans[0],torsionalLength:p.spans[0]});p.cranes[0].travelEnd=p.spans[0];p.cranes[0].wheels.forEach((w,i)=>{w.loaded=38.1*4448.221615;w.unloaded=19.65*4448.221615;w.offset=i*144*25.4;w.lateral=2.53*4448.221615;});
  const s=calculate(p);expect(s.errors).toEqual([]);const impactMoment=toDisplay(s.designAnalysis!.moment,'moment','US');
  // DG7 adds the independent UDL maximum at midspan to the wheel maximum.
  // Our solver keeps the UDL and wheel moment at the same actual station.
  const P=38.1*1.25,q=.181,L=30,a=12,x=(P*(2*L-a)+q*L*L/2)/(4*P+q*L);
  const exact=P*x*(2*L-a-2*x)/L+q*x*(L-x)/2;expect(impactMoment).toBeCloseTo(exact,0);expect(impactMoment).toBeLessThan(478);expect(Math.abs(impactMoment/478-1)).toBeLessThan(.01);
  const staticCase=s.designAnalysis!.combinations.find(c=>c.id==='ASD 2a')!;expect(toDisplay(staticCase.moment,'moment','US')).toBeLessThan(386.5);expect(Math.abs(toDisplay(staticCase.moment,'moment','US')/386-1)).toBeLessThan(.01);
  const steel=girderStrength(p,s.properties!),sideRatio=(steel.h/p.section.tw)/(p.unbracedLength/p.section.bf),sidesway=3.3e6*p.section.tw**3*p.section.tf/steel.h**2*.4*sideRatio**3/1.76;
  expect(Math.abs(toDisplay(sidesway,'force','US')/105-1)).toBeLessThan(.02);
 });
 it('returns finite strength primitives for every pinned catalogue shape and rejects noncompact AIST girder flexure',()=>{
  const p=designProject();for(const shape of aiscWShapes){p.section=loadAiscSection(p.section,shape.name);const s=girderStrength(p,sectionProperties(p.section));for(const [k,v] of Object.entries(s))if(typeof v==='number')expect(Number.isFinite(v),`${shape.name}.${k}`).toBe(true);}
  p.section=loadAiscSection(p.section,'W21X48');const s=calculate(p);expect(s.checks.find(c=>c.id==='compact-flange')?.status).toBe('fail');expect(s.checks.find(c=>c.id==='major')?.status).toBe('unsupported');
 });
 it('verifies J10 end yielding and crippling against hand substitution and applies the correct design factors',()=>{
  const p=designProject(),str=girderStrength(p,sectionProperties(p.section)),bearing=200,{Fy,E,tf,tw,d}=p.section;
  const r=concentratedResistance(p,str,bearing,true);expect(r.yielding).toBeCloseTo(Fy*tw*(2.5*str.k+bearing),5);
  const q=bearing/d<=.2?3*bearing/d:4*bearing/d-.2;expect(r.crippling).toBeCloseTo(.75*.4*tw**2*(1+q*(tw/tf)**1.5)*Math.sqrt(E*Fy*tf/tw),5);
  p.method='ASD';expect(concentratedResistance(p,str,bearing,true).crippling).toBeCloseTo(r.crippling/(.75*2),5);
 });
 it('applies the F13 net-flange rupture cap to flexure and validates actual net area',()=>{
  const p=designProject(),gross=p.section.bf*p.section.tf;
  p.aist!.netFlangeArea=gross;const full=girderStrength(p,sectionProperties(p.section));expect(full.netLimitApplies).toBe(false);
  p.aist!.netFlangeArea=.15*gross;const perforated=girderStrength(p,sectionProperties(p.section));
  expect(perforated.netLimitApplies).toBe(true);expect(perforated.netMoment).toBeCloseTo(.9*p.section.Fu*.15*p.section.Sx,4);expect(perforated.major).toBe(perforated.netMoment);expect(perforated.major).toBeLessThan(full.major);
  const s=calculate(p);expect(s.checks.find(c=>c.id==='flange-net')?.status).toBe('fail');expect(s.designAnalysis!.interaction).toBeGreaterThan(calculate(designProject()).designAnalysis!.interaction);
  p.aist!.netFlangeArea=gross*1.01;expect(validateProject(p)).toContain('aist.netFlangeArea: cannot exceed the gross area bf × tf of one flange.');
 });
 it('does not take favorable strength credit for approximate welded thin-plate torsion',()=>{
  const p=designProject();p.section.kind='welded';p.section.catalogueId='';p.unbracedLength=7620;
  const props=sectionProperties(p.section),v=girderStrength(p,props),zero=girderStrength(p,{...props,J:0});
  expect(v.major).toBe(zero.major);expect(v.compression).toBe(zero.compression);expect(v.compact).toBe(true);
 });
});
describe('Concurrent design, fatigue and export safety',()=>{
 it('uses independent load factors, minimum horizontal forces, exact coincident interaction and normalized impact',()=>{
  const p=designProject(),s=calculate(p),a=s.designAnalysis!,c=s.checks.find(c=>c.id==='crane-1-side')!;
  expect(c.status).toBe('fail');expect(c.demand).toBe(27200);expect(a.wheelLoad).toBeCloseTo(1.2*42000+1.6*68000+1.6*.25*110000,5);
  expect(a.governing.interaction.id).toBe('LRFD 2b');expect(a.governing.interaction.axial).toBe(1.6*22000);expect(a.governing.moment.id).toBe('LRFD 2c');
  expect(a.interaction).toBeGreaterThan(1);expect(a.equilibriumError).toBeLessThan(1e-7);expect(a.convergence).toBeLessThan(.01);expect(a.meshConvergence).toBeLessThan(.01);
  p.cranes[0].includesImpact=true;p.cranes[0].wheels.forEach(w=>w.loaded*=1.25);const b=calculate(p).designAnalysis!;expect(b.moment).toBeCloseTo(a.moment,4);expect(b.fatigueMax-b.fatigueMin).toBeCloseTo(a.fatigueMax-a.fatigueMin,6);
  expect(s.eligible).toBe(false);expect(s.checks.find(c=>c.id==='torsion')?.status).toBe('unsupported');
 });
 it('uses AISC fatigue constants and thresholds; excludes impact from the same material-point history',()=>{
  const f=fatigueResistance('C',2000000);expect(f.FSR).toBeCloseTo(89.7408098327,8);expect(fatigueResistance('C',1e15).FSR).toBe(69);expect(fatigueResistance('B1',1e15).FSR).toBe(83);
  const p=designProject(),s=calculate(p);p.cranes[0].impact=.5;const b=calculate(p);expect(b.designAnalysis!.fatigueMin).toBeCloseTo(s.designAnalysis!.fatigueMin,6);expect(b.designAnalysis!.fatigueMax).toBeCloseTo(s.designAnalysis!.fatigueMax,6);expect(b.designAnalysis!.moment).toBeGreaterThan(s.designAnalysis!.moment);
  expect(s.checks.find(c=>c.id==='fatigue')?.status).toBe('fail');
 });
 it('enforces stricter AIST serviceability, pad clip spacing and actual model completeness',()=>{
  const p=designProject();p.verticalLimit=100;p.aist!.railPad=true;p.aist!.bearingLength=0;p.connections.enabled=false;const s=calculate(p);
  expect(s.checks.find(c=>c.id==='vertical')?.capacity).toBe(7620/1000);expect(s.checks.find(c=>c.id==='rail-clips')?.status).toBe('fail');expect(s.checks.find(c=>c.id==='local')?.status).toBe('incomplete');expect(s.checks.find(c=>c.id==='connections-scope')?.status).toBe('incomplete');expect(s.eligible).toBe(false);
 });
 it('keeps above-centroid vertical stability and placeholder fatigue details visible',()=>{
  const p=designProject();p.railHeight=0;p.railEccentricity=0;p.cranes[0].wheels.forEach(w=>w.lateral=0);p.cranes[0].design!.sideShare=0;
  p.fatigue.detail='Select and document the actual fatigue detail';const s=calculate(p);
  expect(s.checks.find(c=>c.id==='torsion')?.status).toBe('unsupported');expect(s.checks.find(c=>c.id==='fatigue')?.status).toBe('incomplete');expect(s.checks.find(c=>c.id==='flange-net')?.status).toBe('incomplete');
 });
 it('shows shared-support bracket reactions and limits serviceability to one crane on a continuous two-bay runway',()=>{
  const p=designProject();p.system='continuous';p.spans=[7620,7620];p.cranes[0].travelEnd=15240;p.cranes.push({...structuredClone(p.cranes[0]),id:'second',name:'Second crane'});const s=calculate(p);
  expect(s.errors).toEqual([]);expect(s.designAnalysis!.singleVertical).toBeLessThan(s.analysis!.demand.deflection);expect(s.designAnalysis!.serviceReaction).toBeGreaterThan(50*4448.221615);expect(s.checks.find(c=>c.id==='column-brackets')?.status).toBe('fail');
  expect(s.designAnalysis!.combinations.some(c=>c.moment>0&&c.positions.length===2)).toBe(true);
 },20000);
 it('renders every worksheet equation without KaTeX errors and resolves every provision identifier',()=>{
  const s=calculate(designProject());for(const c of s.checks){if(c.equation)expect(()=>katex.renderToString(c.equation,{throwOnError:true})).not.toThrow();if(c.substitution)expect(()=>katex.renderToString(c.substitution!,{throwOnError:true})).not.toThrow();for(const id of c.referenceIds)expect(references.some(r=>r.id===id),id).toBe(true);}
 });
});

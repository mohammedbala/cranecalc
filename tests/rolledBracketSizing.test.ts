import {describe,it,expect} from 'vitest';
import {templateProject} from '../src/engine/templates';
import {buildProject} from '../src/engine/configurator';
import {defaultRunwayConfig,type RunwayConfig} from '../src/engine/configInputs';
import {calculate,validateProject} from '../src/engine/calculate';
import {sizeRolledBracket,rolledBracketSizingRatios,rolledBracketWeight,stubCandidates,stubSeatFit} from '../src/engine/rolledBracketSizing';
import {rolledStub} from '../src/engine/rolledBracketInputs';
import {initialColumnStiffeners,receiverK} from '../src/engine/columnStiffenerInputs';
import {columnStiffenerErrors} from '../src/engine/columnStiffeners';
import {aiscShapeByName} from '../src/data/aiscSections';
import type {CalculationSnapshot,ProjectInput} from '../src/engine/types';
import {bracketSheetSvg} from '../src/components/bracketSheet';

const inch=25.4,lb=4.4482216152605;
/** Every ratio the sizing drives within the target; the J10.8 proportions and the tie's release travel met exactly (at most 1). */
const within=(p:ProjectInput,target=.9)=>Object.entries(rolledBracketSizingRatios(p)).filter(([k,v])=>v>(['stiffener-proportions','colstiff-proportions','release'].includes(k)?1:target)+1e-9).map(([k,v])=>`${k} ${v.toFixed(3)}`);
/** Simulation case 085: a 3-ton cab crane on five 30-ft bays, new W14X120 columns with crane-level rod bracing. */
const newColumns:RunwayConfig={...defaultRunwayConfig,capacity:3,craneSpan:70,buildingClass:'D',bays:5,span:30,railElevation:31,structure:'new',support:'rolled-corbel',reach:16};

describe('rolled W-stub bracket sizing',()=>{
 it('chooses from W12 to W21 stubs whose flanges fit the receiving column flange',()=>{
  const b=templateProject('t03').details!.bracket!,shapes=stubCandidates(b,29000*6.894757293168);
  expect(shapes.length).toBeGreaterThan(20);
  for(const s of shapes){expect(s.name).toMatch(/^W(12|14|16|18|21)X/);expect(s.bf*inch).toBeLessThanOrEqual(b.receiver.width+1e-6);}
  expect(shapes.map(s=>s.weight)).toEqual([...shapes.map(s=>s.weight)].sort((x,y)=>x-y));
 });
 it('sizes the t03 stub within every ratio: valid, with full-depth continuity plates in the existing W14X90',()=>{
  // The configured W12X65 stub with a 1 1/2 in seat (538 lb) failed ten checks, J10.2 at the column by 3.24.
  const p=templateProject('t03'),b=p.details!.bracket!,st=rolledStub(b)!,r=b.rolled!;
  expect(validateProject(p)).toEqual([]);expect(within(p)).toEqual([]);
  // The unstiffened W14X90 cannot take the stub's flange force systems: continuity plates at both stub flanges.
  const s=b.columnStiffeners!;expect(s.enabled).toBe(true);expect(s.length).toBe('full');expect(columnStiffenerErrors(p)).toEqual([]);
  expect(s.flangeWeld).toBeLessThan(s.thickness);expect(s.webWeld).toBeLessThan(s.thickness);
  expect(s.thickness).toBeGreaterThanOrEqual(st.tf/2-1e-9);
  // Fillet flange joints fit on the column flange within 5/8 in; otherwise CJP groove welds.
  if(r.flangeJoint==='fillet'){expect(st.bf+2*r.flangeWeld).toBeLessThanOrEqual(b.receiver.width+1e-6);expect(r.flangeWeld).toBeLessThanOrEqual(5/8*inch+1e-9);}
  // The bearing bolts' edges, the nut clearances below the seat and stub and the bearings' fit on the seat.
  expect(Object.entries(stubSeatFit(p)).filter(([,v])=>v>1)).toEqual([]);
  expect(rolledBracketWeight(p,b)/lb).toBeLessThan(800);
  // The W-stub sheet draws the continuity plates: the plan at the bracket and the callout at the stub flanges.
  const svg=bracketSheetSvg({input:p,revision:'sizing',createdAt:'',errors:[],warnings:[],properties:null,analysis:null,checks:[],eligible:false,referenceVersion:''} as CalculationSnapshot);
  expect(svg).toContain('data-view="column-stiffener-plan"');expect(svg).toContain('2 PAIRS COL. STIFFENERS');expect(svg).toContain('AT STUB FLANGES');expect(svg).not.toMatch(/NaN|undefined/);
 },120000);
 it('starts light: a 2-ton crane gets a lighter stub and no continuity plates where the column takes the stub',()=>{
  const light=buildProject({...defaultRunwayConfig,capacity:2,control:'pendant',craneSpan:40,bays:2,span:20,support:'rolled-corbel'}),t03=templateProject('t03');
  expect(validateProject(light)).toEqual([]);expect(within(light)).toEqual([]);
  const w=(p:ProjectInput)=>rolledBracketWeight(p,p.details!.bracket!);
  expect(w(light)).toBeLessThan(w(t03));
  expect(aiscShapeByName(light.details!.bracket!.corbelShape!)!.weight).toBeLessThanOrEqual(aiscShapeByName(t03.details!.bracket!.corbelShape!)!.weight);
  // Sizing again from the sized bracket changes nothing.
  expect(sizeRolledBracket(light).details!.bracket).toEqual(light.details!.bracket);
 },120000);
 it('keeps a new column free of continuity plates that would clash with its bracing gussets: a deeper stub instead',()=>{
  const p=buildProject(newColumns),b=p.details!.bracket!;
  expect(p.existingColumn?.isNew).toBe(true);expect(b.arrangement).toBe('rolled-corbel');expect(b.columnStiffeners).toBeUndefined();
  const plates={...b,columnStiffeners:{...initialColumnStiffeners(b.receiver,receiverK(b,p.existingColumn)?.k,rolledStub(b)!.tf),length:'full' as const}};
  expect(columnStiffenerErrors({...p,details:{...p.details!,bracket:plates}}).join(' ')).toContain('clashes with the crane-level bracing gusset');
  expect(validateProject(p)).toEqual([]);expect(within(p)).toEqual([]);
 },120000);
});

describe('sized W stub in the full calculation',()=>{
 it('t03: no W-stub, column J10 or column stiffener check fails',()=>{
  const s=calculate(templateProject('t03'));expect(s.errors).toEqual([]);
  const failing=s.checks.filter(c=>(c.id.startsWith('wbracket-')||c.id.startsWith('bracket-')||c.id.startsWith('end-bearing-'))&&!['pass','not-applicable','excluded'].includes(c.status)).map(c=>`${c.id} ${c.utilization?.toFixed(3)}`);
  expect(failing).toEqual([]);
  expect(s.checks.find(c=>c.id==='wbracket-colstiff-upper')?.status).toBe('pass');
  // J10.2 at the column states its k.
  expect(s.checks.find(c=>c.id==='wbracket-column-yield-top')?.note).toContain('k = kdes = 1.31 in (AISC W14X90)');
 },900000);
});

import {describe,expect,it} from 'vitest';
import {refinementChange,refinementEquation,refinementVerdict,type RefinementChange} from '../src/engine/detailChecks';
import {equationSymbols,entrySymbol} from '../src/report/notation';
import {notationSymbols,standardSymbols,termsFor} from '../src/report/equationTerms';
import type {CheckResult} from '../src/engine/types';
import type {RunwayDetailResults} from '../src/engine/runwayDetails';
import type {SupportForceEnvelope} from '../src/engine/bracketForces';

/**
 * Convergence gates of the detailed analysis (detail-travel, detail-mesh) judge the governing results: the D/C of each
 * check, relative for D/C >= 0.5 and absolute (to 0.005) below it, plus the support forces delivered. Baseline case 9
 * (five-span continuous W18X76) was blocked by a 1.03% change that came only from fatigue stress ranges of 0.012 and
 * 0.0015 MPa at the runway-end stiffeners (D/C about 1e-5), while every governing result had settled to 0.05%.
 */
const check=(id:string,utilization:number):CheckResult=>({id,group:'Fatigue',title:id,status:'pass',equation:'',note:'',referenceIds:[],utilization,demand:utilization,capacity:1,quantity:'ratio'});
const set=(checks:CheckResult[],grids:{top:number;vertical:number}[]=[])=>({checks,results:{bracketForces:grids.map((g,i)=>({grid:i+1,maxVertical:{vertical:g.vertical},minBearing:{ends:[],vertical:g.vertical/2},maxMoment:{moment:0},longitudinal:{longitudinal:0},top:{top:g.top},bottom:{bottom:0}}) as unknown as SupportForceEnvelope)} as RunwayDetailResults});
const step=(value:number,changes:Record<string,number>):RefinementChange=>({value,governing:Object.keys(changes)[0],changes:new Map(Object.entries(changes))});

describe('governing-results change between refinement levels',()=>{
 it('holds governing checks to 1% and smaller ones to an absolute 0.005 of their D/C',()=>{
  // Case 9's end-stiffener fatigue range fell from 0.0118 to 0.0015 MPa: D/C 1e-4 to 1e-5, a change of no consequence.
  const c=refinementChange(set([check('detail-full-cycle-RC5',1.166),check('detail-full-cycle-FS1',1e-4),check('torsion-shear',.38)]),set([check('detail-full-cycle-RC5',1.1665),check('detail-full-cycle-FS1',1e-5),check('torsion-shear',.381)]));
  expect(c.value).toBeLessThan(.01);expect(c.governing).toBe('torsion-shear');
  expect(c.changes.get('detail-full-cycle-FS1')!).toBeCloseTo(9e-5/.5,12);
  expect(c.changes.get('detail-full-cycle-RC5')!).toBeCloseTo(.0005/1.1665,12);
 });
 it('still sees a change that could move a verdict, in a small result as in a governing one',()=>{
  expect(refinementChange(set([check('a',1)]),set([check('a',1.02)])).value).toBeCloseTo(.02/1.02,12);
  // A sub-governing check that moves from 0.2 to 0.3 is a real non-convergence: 0.1/0.5 = 20%.
  expect(refinementChange(set([check('b',.2)]),set([check('b',.3)])).value).toBeCloseTo(.2,12);
  // The fabricated instability of template t03: torsion-stability 0.54 -> 1.59.
  expect(refinementChange(set([check('torsion-stability',.54)]),set([check('torsion-stability',1.59)])).value).toBeGreaterThan(.6);
 });
 it('measures each support force against the largest of that force over the grids',()=>{
  const c=refinementChange(set([],[{top:1000,vertical:2e5},{top:10,vertical:2e5}]),set([],[{top:1004,vertical:2e5},{top:12,vertical:2e5}]));
  expect(c.changes.get('support force: grid 2 top')!).toBeCloseTo(2/502,12);
  expect(c.changes.get('support force: grid 1 top')!).toBeCloseTo(4/1004,12);
  expect(c.value).toBeLessThan(.01);
  expect(refinementChange(set([],[{top:1000,vertical:2e5}]),set([],[{top:1030,vertical:2e5}])).value).toBeGreaterThan(.01);
 });
 it('pairs repeated check ids in order',()=>{
  const c=refinementChange(set([check('x',1),check('x',.6)]),set([check('x',1),check('x',.66)]));
  expect(c.changes.get('x')).toBe(0);expect(c.changes.get('x#1')!).toBeCloseTo(.06/.66,12);
 });
});

describe('refinement verdict',()=>{
 it('converges when the last refinement changes the governing results by at most 1%',()=>{
  expect(refinementVerdict([step(.03,{a:.03}),step(.008,{a:.008})])).toMatchObject({converged:true,value:.008});
 });
 it('accepts a marginal miss that shrinks geometrically, reporting the estimated error of the finest level',()=>{
  // 2.5% then 1.03%: ratio 0.41, the finest level within 1.03% x 0.41/0.59 = 0.72% of the converged value.
  const v=refinementVerdict([step(.025,{a:.025,b:.004}),step(.0103,{a:.0103,b:.002})]);
  expect(v.converged).toBe(true);expect(v.last).toBe(.0103);
  expect(v.ratio!).toBeCloseTo(.412,9);expect(v.value).toBeCloseTo(.0103*.412/.588,9);expect(v.value).toBeLessThan(.01);
 });
 it('never hides a non-convergence',()=>{
  // Slow (ratio 0.86: estimated 6% from the converged value), growing, too large, or a single step.
  expect(refinementVerdict([step(.012,{a:.012}),step(.0103,{a:.0103})]).converged).toBe(false);
  expect(refinementVerdict([step(.005,{a:.005}),step(.0103,{a:.0103})]).converged).toBe(false);
  expect(refinementVerdict([step(.08,{a:.08}),step(.025,{a:.025})])).toMatchObject({converged:false,value:.025});
  expect(refinementVerdict([step(.0103,{a:.0103})]).converged).toBe(false);
  // A result above 1% that did not change before (a new peak) cannot be extrapolated.
  expect(refinementVerdict([step(.02,{a:.02}),step(.0103,{a:.005,b:.0103})]).converged).toBe(false);
  // The t03 sliver: detail-travel 55.6 at 1280 steps.
  expect(refinementVerdict([step(.02,{a:.02}),step(55.6,{a:55.6})]).converged).toBe(false);
 });
 it('prints the estimate it gates on, with every symbol defined',()=>{
  const marginal=refinementVerdict([step(.025,{a:.025}),step(.0103,{a:.0103})]),plain=refinementVerdict([step(.008,{a:.008})]);
  expect(refinementEquation(plain,'elements')).toBe('|D_{2n}/D_n-1|\\le0.01\\ \\ \\text{(elements)}');
  const equation=refinementEquation(marginal,'elements'),known=new Set([...standardSymbols,...notationSymbols()]);
  expect(equation).toContain('\\frac{\\rho}{1-\\rho}');
  const local=new Set(termsFor({id:'detail-mesh',group:'Analysis',title:'',status:'pass',equation,note:'',referenceIds:[]}).map(([t])=>entrySymbol(t)));
  expect([...equationSymbols(equation)].filter(v=>!known.has(v)&&!local.has(v))).toEqual([]);
 });
});

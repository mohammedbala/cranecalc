import {describe,expect,it} from 'vitest';
import {calculate,validateProject} from '../src/engine/calculate';
import {buildProject} from '../src/engine/configurator';
import {defaultRunwayConfig} from '../src/engine/configInputs';
import {templateProject} from '../src/engine/templates';
import {demonstrationProject,newColumnDemonstrationProject} from '../src/engine/demonstration';
import {anchorGrades,barSizes,columnBaseElevation} from '../src/engine/columnBaseInputs';
import {barArea} from '../src/engine/columnBase';
import {existingColumnRailElevation} from '../src/engine/existingColumn';
import {baseSizingRatios,exactBaseSizingRatios,sizeColumnBase} from '../src/engine/columnBaseSizing';
import type {ProjectInput} from '../src/engine/types';

const inch=25.4,foot=304.8,target=.9,codeLimits=['frost','bar-spacing','min-steel','rod-clear'];
/** Every size of the base, each of which the sizing may only keep or increase (bottom steel as area per width). */
const sizes=(p:ProjectInput)=>{const b=p.columnBase!,{plate:pl,anchors:a,footing:f}=b;
 return {N:pl.N,B:pl.B,thickness:pl.thickness,weld:pl.weld,diameter:a.diameter,grade:anchorGrades.indexOf(a.grade),perRow:a.perRow,edge:a.edge,gauge:a.gauge,embedment:a.embedment,
  L:f.L,width:f.B,depth:f.thickness,bar:barSizes.indexOf(f.bar),steel:barArea[f.bar]/f.spacing};};
/** Rail head above the floor: the column base on the footing plus the rail above the column base. */
const rail=(p:ProjectInput)=>columnBaseElevation(p.columnBase!)+existingColumnRailElevation(p);
const within=(ratios:Record<string,number>)=>Object.entries(ratios).filter(([k,v])=>!(v<=(codeLimits.includes(k)?1:target)+1e-9)).map(([k,v])=>`${k} ${v}`);

describe('New column base sizing',()=>{
 it('grows an undersized base until every ratio meets the target, with the ratios of the full analysis',()=>{
  const p=newColumnDemonstrationProject(),b=p.columnBase!;
  // A small footing, short 3/4 in rods and light bars: well short of the reactions.
  Object.assign(b.footing,{L:5*foot,B:5*foot,thickness:20*inch,spacing:12*inch});Object.assign(b.anchors,{diameter:.75*inch,embedment:12*inch});
  const q=sizeColumnBase(p),fast=baseSizingRatios(q),exact=exactBaseSizingRatios(q);
  expect(within(exact.ratios)).toEqual([]);
  // The sizing ratios are the calculation's, check by check.
  expect(Object.keys(fast.ratios).sort()).toEqual(Object.keys(exact.ratios).sort());
  for(const [k,v] of Object.entries(exact.ratios))expect(fast.ratios[k],k).toBeCloseTo(v,9);
  const before=sizes(p),after=sizes(q);
  for(const k of Object.keys(before) as (keyof typeof before)[])expect(after[k],k).toBeGreaterThanOrEqual(before[k]-1e-9);
  expect(after.L).toBeGreaterThan(before.L);expect(after.diameter).toBeGreaterThan(before.diameter);
  // Square footing; the rail stays at the entered elevation, the column lowered by any plate growth.
  expect(q.columnBase!.footing.B).toBe(q.columnBase!.footing.L);
  expect(rail(q)).toBeCloseTo(rail(p),6);
  expect(q.existingColumn!.height-q.existingColumn!.seatElevation).toBeCloseTo(p.existingColumn!.height-p.existingColumn!.seatElevation,6);
  expect(validateProject(q)).toEqual([]);
 },120000);
 it('never shrinks an adequate base and is idempotent',()=>{
  // The demonstration base passes every check: sizing only brings ratios above the 0.9 target down to it.
  const p=newColumnDemonstrationProject(),q=sizeColumnBase(p),before=sizes(p),after=sizes(q);
  for(const k of Object.keys(before) as (keyof typeof before)[])expect(after[k],k).toBeGreaterThanOrEqual(before[k]-1e-9);
  expect(within(baseSizingRatios(q).ratios)).toEqual([]);
  expect(sizeColumnBase(q)).toEqual(q);
  // A larger footing and longer rods than needed stay as they are.
  const big=structuredClone(q);Object.assign(big.columnBase!.footing,{L:q.columnBase!.footing.L+foot,B:q.columnBase!.footing.L+foot});big.columnBase!.anchors.embedment+=inch;
  const r=sizeColumnBase(big),large=sizes(big),kept=sizes(r);
  for(const k of Object.keys(large) as (keyof typeof large)[])expect(kept[k],k).toBeGreaterThanOrEqual(large[k]-1e-9);
  expect(sizeColumnBase(r)).toEqual(r);
  // Only new freestanding columns with a base are sized.
  const girderOnly=demonstrationProject();expect(sizeColumnBase(girderOnly)).toEqual(girderOnly);
 },120000);
});

describe('Configurator new column bases',()=>{
 it.each([
  ['t06 template, 10-ton crane',()=>templateProject('t06')],
  ['25-ton crane, 70 ft span, 30 ft bays',()=>buildProject({...defaultRunwayConfig,structure:'new',support:'twin-rib',capacity:25,craneSpan:70,span:30})],
 ] as const)('%s: every base check and the footing clearance pass in the full calculation',(_,build)=>{
  const p=build();
  expect(validateProject(p)).toEqual([]);
  expect(p.configurator?.columnShape).toBeUndefined();
  const s=calculate(p);
  expect(s.errors).toEqual([]);
  const base=s.checks.filter(c=>c.id.startsWith('base-'));
  expect(base.map(c=>c.id)).toEqual(expect.arrayContaining(['base-bearing','base-plate','base-weld','base-anchor-tension','base-anchor-shear','base-anchor-interaction','base-soil','base-overturning','base-sliding','base-one-way','base-two-way','base-flexure','base-min-steel','base-development','base-drift']));
  expect(base.filter(c=>c.status!=='pass').map(c=>`${c.id} ${c.status} ${c.utilization}`)).toEqual([]);
  expect(s.checks.filter(c=>c.id==='existing-footing-clear').map(c=>c.status)).toEqual(['pass']);
  // The sizing saw the calculation's ratios.
  const ratios=exactBaseSizingRatios(p).ratios;
  for(const c of base)if(c.utilization!==undefined)expect(ratios[c.id.slice(5)],c.id).toBeCloseTo(c.utilization,9);
 },600000);
});

import {describe,expect,it} from 'vitest';
import cases from './fixtures/simulationCasesV3.json';
import {buildProject} from '../src/engine/configurator';
import type {RunwayConfig} from '../src/engine/configInputs';
import {capAngleGeometry} from '../src/engine/capAngle';
import {capAngleFits,capAngleForceEstimate,capAngleSizingRatios,capAngleWrenchSetback,validateCapAngle} from '../src/engine/capAngleTie';
import {validateRunwayDetails} from '../src/engine/detailValidation';
import {stiffenerTieGeometry} from '../src/engine/tieGeometry';
import {stiffenerGussetMisfit} from '../src/engine/connectionCoordination';

const inch=25.4;
const sim=cases as Record<string,RunwayConfig>;

/**
 * Cap tieback angle fit and selection (round 7): the sizing keeps the smallest set that fits (the column nuts clear the
 * web by moving the ties along their girders, in the direction that clears), and a fitting angle that clearly cannot
 * carry the tie force gives way to the paired bars on the bearing stiffener where those do better.
 */
describe('cap tieback angle fit and selection',()=>{
 it('steps the setback past a girder end that reaches beyond the column centerline (the tie first moves toward the web)',()=>{
  // Girder end 5.13 in past the centerline (a centered bearing at a runway-end grid), k1 0.9 in, 5/8 in bolts: C1 = 1.3125 in.
  const g={input:{setback:3.5*inch},column:{diameter:.625*inch,receiver:{k1:.9*inch}},
   stations:[{end:'left',offset:-1.63*inch},{end:'right',offset:1.63*inch}]} as unknown as NonNullable<ReturnType<typeof capAngleGeometry>>;
  const s=capAngleWrenchSetback(g),need=.9*inch+1.3125*inch;
  // Every tie at least C1 + k1 from the centerline, past it on the girder side, on the 1/4 in grid (the old shortfall
  // step, 3.5 + 0.75 in, left the left tie 0.88 in from the centerline).
  expect(s).toBeCloseTo(7.5*inch,6);
  expect(Math.abs(s-5.13*inch)).toBeGreaterThanOrEqual(need-1e-6);
  // Already clear: kept.
  expect(capAngleWrenchSetback({...g,stations:[{end:'left',offset:3*inch}]} as typeof g)).toBe(3.5*inch);
 });
 it('case 015: the light cap angle fits the C15 cap and the W14X120 column (no escalation to L5X5X7/8 on a failing fit)',()=>{
  const p=buildProject(sim['015']),c=p.details!.brace.capAngle!;
  expect(p.details!.brace.arrangement).toBe('cap-angle');
  // L4X4 with 3/4 in bolts at most (the cap bolt fatigue estimate takes the 5/8 in bolts past the 0.9 target).
  expect(c.shape.startsWith('L4X4')).toBe(true);expect(c.capBolts.diameter).toBeLessThanOrEqual(.75*inch+1e-6);
  expect(validateCapAngle(p)).toEqual([]);
  const g=capAngleGeometry(p)!,r=capAngleSizingRatios(p,g,capAngleForceEstimate(p),undefined,2e6) as Record<string,number>;
  for(const k of capAngleFits)if(r[k]!==undefined)expect(r[k],k).toBeLessThanOrEqual(1);
  expect(p.configurator!.beyondCatalog?.some(v=>v.member==='tie')).toBeFalsy();
 },300000);
 it('case 050 (40 t): paired bars on the bearing stiffener below the cap channel flanges in place of the overloaded cap angle, logged',()=>{
  const p=buildProject(sim['050']);
  expect(p.details!.brace.arrangement).toBe('paired-bars');
  expect(p.details!.brace.flangeAttachment?.enabled).toBe(false);
  const st=stiffenerTieGeometry(p)!,s=p.section;
  expect(s.kind).toBe('cap');
  // The bars and gusset below the turned-down cap flanges, the column gussets on the receiving column flange.
  expect(st.topCenter+st.height/2).toBeLessThanOrEqual(s.d/2-(s.capDepth-s.capTw)-st.clear+1e-6);
  expect(stiffenerGussetMisfit(p)).toBeUndefined();
  expect(validateRunwayDetails(p)).toEqual([]);
  expect(p.configurator!.selections!.find(v=>v.item==='Top-flange tie')!.reason).toMatch(/the cap tieback angle cannot carry the tie force \(sized L\dX\dX[\d/]+ still exceeds .*\): the paired flat bars bolt to the tie-side bearing stiffener/);
  expect(p.configurator!.beyondCatalog?.some(v=>v.member==='tie')).toBeFalsy();
 },300000);
});

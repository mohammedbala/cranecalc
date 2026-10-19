import {describe,expect,it} from 'vitest';
import {newColumnDemonstrationProject} from '../src/engine/demonstration';
import {existingColumnAnalysis,existingColumnChecks,existingColumnSection,twistMovementLimit} from '../src/engine/existingColumn';
import {longitudinalBracingAnalysis} from '../src/engine/longitudinalBracing';
import {bracingSystemAnalysis,bracingSystemChecks,columnTorsion,defaultTorsionBrace,girderOffset,strutSection,torsionBase,torsionBraceStiffness} from '../src/engine/newColumnBracing';
import {columnTwistChecks,twistMovement,twistRotationLimit} from '../src/engine/columnTwistLimit';
import {railTopAboveSteel} from '../src/engine/railSeat';
import {sectionProperties} from '../src/engine/section';
import {supportReactions} from '../src/engine/supportReactions';
import {bracingTopic} from '../src/components/bracingSheet';
import type {CalculationSnapshot,ProjectInput} from '../src/engine/types';

const inch=25.4;
const braced=(p:ProjectInput)=>{const q=structuredClone(p);q.longitudinalBracing!.design={...q.longitudinalBracing!.design!,torsionBrace:{...defaultTorsionBrace}};return q;};
// The demonstration carries the torsion brace; p0 is it without (the strut on the column centerline alone).
const p0=(()=>{const q=newColumnDemonstrationProject();delete q.longitudinalBracing!.design!.torsionBrace;return q;})(),p1=braced(p0),column=existingColumnSection(p0).section;
const reactions=supportReactions(p0,sectionProperties(p0.section));
const a0=existingColumnAnalysis(p0,reactions),a1=existingColumnAnalysis(p1,reactions);

describe('torsion brace at a new column bracket (the strut moment-connected in plan)',()=>{
 it('shares the seat torque with the column by stiffness, continuous strut in weak-axis bending',()=>{
  const hs=p1.existingColumn!.seatElevation,k=torsionBraceStiffness(p1,column,hs,torsionBase(p1))!;
  expect(torsionBraceStiffness(p0,column,hs,torsionBase(p0))).toBeUndefined();
  expect(k.Ktheta).toBeCloseTo(columnTorsion(column,1,hs,torsionBase(p1)).Ktheta,6);
  // A runway-end column, one segment: 4EI/L less the far column's give (bounded by 3EI/L and 4EI/L).
  const s=strutSection(p1),EI=s.E*sectionProperties(s).Iy,L=Math.min(...p1.spans);
  expect(k.segments).toBe(1);expect(k.K).toBeGreaterThan(3*EI/Math.max(...p1.spans)*(1-1e-9));expect(k.K).toBeLessThan(4*EI/L);
  expect(k.keep).toBeCloseTo(k.Ktheta/(k.Ktheta+k.K),12);expect(k.keep).toBeLessThan(.2);
  // The column keeps that share: its torque, twist and movement scale by it.
  const t0=a0.torsion!,t1=a1.torsion!;
  expect(t1.service.T).toBeCloseTo(t0.service.T*k.keep,6);expect(t1.service.twist).toBeCloseTo(t0.service.twist*k.keep,9);
  expect(t1.T).toBeLessThan(t0.T*k.keep*(1+1e-9));expect(t1.brace?.keep).toBe(k.keep);
  expect(Math.abs(t1.twist)).toBeLessThan(twistRotationLimit);
 });
 it('checks the strut, plates, bolts and welds of the brace and holds the twist limits',()=>{
  const lb=longitudinalBracingAnalysis(p1,reactions,column),r=bracingSystemAnalysis(p1,reactions,lb,column,a1),tb=r.torsionBrace!;
  expect(bracingSystemAnalysis(p0,reactions,longitudinalBracingAnalysis(p0,reactions,column),column,a0).torsionBrace).toBeUndefined();
  expect(tb.T).toBeCloseTo(r.seatForce.F*girderOffset(p1),6);expect(tb.M).toBeCloseTo(tb.stiffness.moment*tb.T,6);expect(tb.Mp).toBeCloseTo(tb.M/2,9);
  const checks=bracingSystemChecks(p1,r,column),ids=['brace-torsion-strut','brace-torsion-plate','brace-torsion-bolts','brace-torsion-weld'];
  for(const id of ids){const c=checks.find(v=>v.id===id)!;expect(c,id).toBeDefined();expect(c.group).toBe('Torsion brace');expect(Number.isFinite(c.utilization)).toBe(true);}
  expect(checks.find(v=>v.id==='brace-torsion-strut')!.note).toContain('moment-connected in plan at every column');
  // The twist checks of the braced column: the movement limit min(H/400, 2 in) and the brace in the note.
  const col=existingColumnChecks(p1,a1),move=col.find(v=>v.id==='column-twist')!,rot=col.find(v=>v.id==='column-twist-rotation')!;
  expect(move.capacity).toBeCloseTo(Math.min((a1.railElevation-railTopAboveSteel(p1))/400,2*inch),9);expect(move.capacity).toBeCloseTo(twistMovementLimit(p1,a1),9);
  expect(rot.status).toBe('pass');expect(move.status).toBe('pass');expect(move.note).toContain('Torsion brace');
  // Unbraced, the same column fails both (the demonstration's open W14).
  const col0=existingColumnChecks(p0,a0);expect(col0.find(v=>v.id==='column-twist-rotation')!.status).toBe('fail');
 });
 it('draws the torsion plates in the strut plan and specifies them in the bracing data and notes',()=>{
  const lb=longitudinalBracingAnalysis(p1,reactions,column),r=bracingSystemAnalysis(p1,reactions,lb,column,a1);
  const s={input:p1,bracingSystem:r,longitudinalBracing:lb,existingColumn:a1,checks:[],detailResults:undefined} as unknown as CalculationSnapshot;
  const topic=bracingTopic(s),plan=topic.views.find(v=>v.title.includes('PLAN'))!.render().svg;
  expect(plan).toContain('TORSION PLATES');
 });
});

describe('one twist basis for new and stepped columns',()=>{
 it('words both from columnTwistChecks with their own ids',()=>{
  const t=a0.torsion!,limit=twistMovementLimit(p0,a0);
  const n=columnTwistChecks(p0,t,{label:'New column',limit,model:'M.'}),st=columnTwistChecks(p0,t,{label:'Lower shaft',ids:{rotation:'column-lower-twist',movement:'column-lower-twist-movement'},at:'step',limit,model:'M.',movementUsed:false});
  expect(n.map(v=>v.id)).toEqual(['column-twist-rotation','column-twist']);expect(st.map(v=>v.id)).toEqual(['column-lower-twist','column-lower-twist-movement']);
  expect(st[0].title).toBe('Lower shaft · twist at the step under the factored torque (small-rotation limit)');
  expect(st[1].title).toBe('Lower shaft twist · girder movement along the runway at the step (service)');
  expect(n[0].capacity).toBe(st[0].capacity);expect(n[0].equation).toBe(st[0].equation);expect(n[1].equation).toBe(st[1].equation);
  expect(st[1].note).not.toContain('added to the sliding bearing travel');expect(n[1].note).toContain('added to the sliding bearing travel');
 });
 it('takes the twist under the factored traction into the tie (1.6 LRFD, 1.0 ASD), none on a reviewed column',()=>{
  const m=twistMovement(a0,'LRFD');
  expect(m.service).toBeCloseTo(Math.abs(a0.torsion!.service.slip),12);expect(m.factored).toBeCloseTo(1.6*m.service,12);
  expect(twistMovement(a0,'ASD').factored).toBeCloseTo(m.service,12);
  expect(twistMovement({...a0,support:{} as never},'LRFD')).toEqual({service:0,factored:0});
 });
});

describe('configurator: new-column brackets stay brackets',()=>{
 it('keeps t06 on its twin-rib seats with a torsion brace and logs the longitudinal path',async()=>{
  const {templateProject}=await import('../src/engine/templates');
  const p=templateProject('t06');
  expect(p.details!.bracket!.enabled).toBe(true);expect(p.columnCap?.enabled??false).toBe(false);
  expect(p.longitudinalBracing!.design!.torsionBrace).toBeDefined();
  const sel=p.configurator!.selections!.find(v=>v.item==='Longitudinal path')!;
  expect(sel.reason).toContain('The bracket stays');expect(p.configurator!.selections!.some(v=>v.item==='Girder support')).toBe(false);
  const a=existingColumnAnalysis(p,supportReactions(p,sectionProperties(p.section))),t=a.torsion!;
  expect(Math.abs(t.twist)).toBeLessThanOrEqual(twistRotationLimit);expect(Math.abs(t.service.slip)).toBeLessThanOrEqual(twistMovementLimit(p,a));
 },120000);
});

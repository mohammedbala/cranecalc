import {describe,it,expect} from 'vitest';
import {defaultExistingColumn} from '../src/engine/existingColumnInputs';
import {supportReactions} from '../src/engine/supportReactions';
import {sectionProperties} from '../src/engine/section';
import {columnResponse,steppedStiffness} from '../src/engine/columnAnalysis';
import {fixedBaseRatio,stepGeometry,steppedColumnAnalysis,upperShaftSection,validateSteppedColumn} from '../src/engine/steppedColumn';
import {stepPanel,stepWebStrength,upperFlangeArm} from '../src/engine/stepSeat';
import {existingColumnSection,existingColumnRailElevation,columnReactionOffset} from '../src/engine/existingColumn';
import {classifyCheck} from '../src/engine/checkTaxonomy';
import {aiscShapeByName} from '../src/data/aiscSections';
import {designProject} from './fixtures/aistProject';
import type {ProjectInput} from '../src/engine/types';
import {buildProject} from '../src/engine/configurator';
import {calculate,validateProject} from '../src/engine/calculate';
import {defaultRunwayConfig,type RunwayConfig} from '../src/engine/configInputs';

const kip=4448.221615,inch=25.4,foot=304.8;
const plates=(shape:string)=>{const w=aiscShapeByName(shape)!;return {shape,d:w.d*inch,bf:w.bf*inch,tf:w.tf*inch,tw:w.tw*inch};};
const zero={P:0,Mx:0,My:0,V:0};
/** Lower W27X146, upper W14X74 flush on the outer flanges, the girder over the crane-side flange; 30 ft column, step at 20 ft. */
function stepped(lower='W27X146',upper='W14X74'):ProjectInput{
 const p=designProject(),lo=plates(lower),up=plates(upper);
 p.existingColumn={...structuredClone(defaultExistingColumn),enabled:true,confirmed:true,source:'Unit test survey',...lo,height:30*foot,seatElevation:20*foot,Lcx:30*foot,Lcy:10*foot,Lcz:10*foot,Lb:10*foot};
 p.existingColumn.existing.D={P:60*kip,Mx:20*kip*foot,My:0,V:1*kip};
 p.existingColumn.step={upper:{...up,Fy:345,Fu:448},offset:(lo.d-up.d)/2,girderOffset:lo.d/2-lo.tf/2,
  existingUpper:{D:{P:30*kip,Mx:0,My:0,V:0},L:{...zero},Lr:{...zero},S:{P:20*kip,Mx:0,My:0,V:0},R:{...zero},W:{...zero},E:{...zero}},
  cap:{thickness:1.5*inch,width:40*inch,length:24*inch},source:'Unit test survey of the step',confirmed:true};
 p.existingColumn.eccentricity=p.existingColumn.step.girderOffset+columnReactionOffset(p);
 return p;
}
const analyse=(p:ProjectInput)=>steppedColumnAnalysis(p,supportReactions(p,sectionProperties(p.section)));

/** Fixed-base, free-top stepped cantilever (tests/columnBuckling.test.ts): tan(k1 l1)·tan(k2 a) = √(N2 EI2/(P1 EI1)). */
function steppedCantilever(L:number,a:number,EI1:number,EI2:number,P1:number,P2:number){
 const N2=P1+P2,rhs=Math.sqrt(N2*EI2/(P1*EI1)),k1=(l:number)=>Math.sqrt(l*P1/EI1),k2=(l:number)=>Math.sqrt(l*N2/EI2);
 let hi=Math.min((Math.PI/2/(L-a))**2*EI1/P1,(Math.PI/2/a)**2*EI2/N2)*(1-1e-12),lo=0;
 for(let i=0;i<200;i++){const m=(lo+hi)/2;if(Math.tan(k1(m)*(L-a))*Math.tan(k2(m)*a)>rhs)hi=m;else lo=m;}
 return (lo+hi)/2;
}

describe('stepped column: buckling and effective lengths',()=>{
 it('every combination\'s buckling factor matches the stepped cantilever\'s characteristic equation (fixed base, free top)',()=>{
  const p=stepped();p.existingColumn!.strong={base:'fixed',top:'free'};p.existingColumn!.Lcx=2.1*p.existingColumn!.height;
  expect(validateSteppedColumn(p)).toEqual([]);
  const a=analyse(p),c=p.existingColumn!,E=p.section.E,EIu=E*sectionProperties(upperShaftSection(p).section).Ix,EIl=E*sectionProperties(existingColumnSection(p).section).Ix,ratio=fixedBaseRatio(c.strong);
  expect(ratio).toBeCloseTo(1.05,9);
  const rows=a.combinations.flatMap(v=>v.rows).filter(r=>r.upper.P>0&&r.lower.P>r.upper.P).slice(0,12);
  expect(rows.length).toBeGreaterThan(5);
  for(const r of rows){
   const reference=steppedCantilever(c.height,c.seatElevation,EIu,EIl,r.upper.P,r.lower.P-r.upper.P);
   expect(r.lambda*ratio**2/reference).toBeCloseTo(1,5);
   // L_c,i = π√(EI_i/(λP_i)) on the design factor; B1 = 1/(1 − α/λ).
   expect(r.Lcx.upper).toBeCloseTo(Math.PI*Math.sqrt(EIu/(r.lambda*r.upper.P)),6);
   expect(r.Lcx.lower).toBeCloseTo(Math.PI*Math.sqrt(EIl/(r.lambda*r.lower.P)),6);
   expect(r.lower.B1x).toBeCloseTo(1/(1-1/r.lambda),9);
  }
  // A prismatic column (upper = lower shape, no offset) under a top load only: K = 2.1 (2.0 ideal × the C-A-7.1 ratio).
 });
 it('a prismatic column (the same shape above and below) under a uniform axial force: K = 1 pinned and braced, 2.1 fixed and free',()=>{
  const p=stepped('W14X74','W14X74'),c=p.existingColumn!,s=c.step!;s.offset=0;s.girderOffset=c.d/2-c.tf/2;
  c.existing.D={P:50*kip,Mx:0,My:0,V:0};s.existingUpper.D={P:50*kip,Mx:0,My:0,V:0};s.existingUpper.S={...zero};
  const a=analyse(p),r=a.combinations.flatMap(v=>v.rows).find(x=>x.id==='LRFD 1')!;
  // 1.4D: the girder dead reaction makes the lower force slightly larger; the upper K on the whole height is close to 1.
  expect(r.upper.P).toBeCloseTo(1.4*50*kip,3);
  const EI=p.section.E*sectionProperties(existingColumnSection(p).section).Ix,Pcr=r.lambda*r.upper.P;
  expect(Pcr).toBeLessThan(Math.PI**2*EI/c.height**2);expect(Pcr).toBeGreaterThan(.9*Math.PI**2*EI/c.height**2);
  c.strong={base:'fixed',top:'free'};const f=analyse(p).combinations.flatMap(v=>v.rows).find(x=>x.id==='LRFD 1')!;
  expect(f.Lcx.upper/c.height).toBeGreaterThan(2.1);expect(f.Lcx.upper/c.height).toBeLessThan(2.2);
 });
});

/** Internal moment of a unit step moment just above the step (the first upper-shaft sample), as steppedColumnAnalysis samples it. */
function unitAboveStep(p:ProjectInput){
 const c=p.existingColumn!,E=p.section.E,hs=c.seatElevation,rs=Math.min(existingColumnRailElevation(p),c.height);
 const EI=steppedStiffness(hs,E*sectionProperties(existingColumnSection(p).section).Ix,E*sectionProperties(upperShaftSection(p).section).Ix);
 const r=columnResponse(c.height,EI,c.strong,[{x:hs,moment:1}],[rs]);
 for(let i=0;i+1<r.samples.length;i+=2)if((r.samples[i].x+r.samples[i+1].x)/2>hs)return r.samples[i].moment;
 throw Error('no upper sample');
}
describe('stepped column: signed superposition at the step',()=>{
 const row=(p:ProjectInput,id:string)=>analyse(p).combinations[0].rows.find(r=>r.id===`LRFD ${id}`)!;
 it('an existing roof moment that relieves the crane moment lowers the upper shaft\'s moment at the step; one that adds raises it, by hand',()=>{
  const base=stepped(),m=unitAboveStep(base),r0=row(base,'1'),e=analyse(base).summary.eccentricity;
  // 1.4D: the girder dead reaction R at e, no lateral load; B1 = 1/(1 − 1/λ).
  expect(r0.Mstep).toBeCloseTo(r0.upper.B1x*Math.abs(r0.R*e*m),3);
  const X=.5*r0.R*e*Math.abs(m)/1.4,withMx=(v:number)=>{const p=stepped();p.existingColumn!.step!.existingUpper.D.Mx=v;return p;};
  const add=row(withMx(X),'1'),relieve=row(withMx(-X),'1');
  expect(add.Mstep).toBeCloseTo(add.upper.B1x*Math.abs(add.R*e*m+Math.sign(m)*1.4*X),3);
  expect(relieve.Mstep).toBeCloseTo(relieve.upper.B1x*Math.abs(relieve.R*e*m-Math.sign(m)*1.4*X),3);
  expect(relieve.Mstep).toBeLessThan(r0.Mstep);expect(add.Mstep).toBeGreaterThan(r0.Mstep);
  expect(relieve.upper.U).toBeLessThan(add.upper.U);
  // A roof moment exactly opposing the crane moment leaves the upper shaft's step moment at zero in 1.4D: F = P_u/2.
  const exact=row(withMx(-r0.R*e*Math.abs(m)/1.4),'1');
  expect(exact.Mstep/r0.Mstep).toBeLessThan(1e-9);expect(exact.Fin).toBeCloseTo(exact.upper.P/2,3);
  // The lower shaft keeps its own existing effects as magnitudes: unchanged by the upper-shaft moment.
  expect(relieve.lower.Mx).toBeCloseTo(add.lower.Mx,6);
  // W and E reverse: their upper moments add as magnitudes whatever their sign.
  const w=(v:number)=>{const p=stepped();p.existingColumn!.step!.existingUpper.W.Mx=v;return row(p,'4-S+ (side thrust, no impact)').Mstep;};
  expect(w(X)).toBeCloseTo(w(-X),6);expect(w(X)).toBeGreaterThan(w(0));
 });
});

describe('stepped column: step local checks by hand',()=>{
 it('J10.2, J10.3 and J10.6 under the inner-flange force P_u/2 + |M_u|/(d_u − t_fu); J7 on the cap',()=>{
  const p=stepped(),a=analyse(p),g=stepGeometry(p)!,c=p.existingColumn!,E=p.section.E,checks=a.stepChecks,find=(id:string)=>checks.find(v=>v.id===id)!;
  const rows=a.combinations.flatMap(v=>v.rows),gov=rows.reduce((x,y)=>y.Fin>x.Fin?y:x);
  expect(a.result.step.flangeForce).toBeCloseTo(gov.upper.P/2+gov.Mstep/(g.upper.d-g.upper.tf),6);
  expect(upperFlangeArm(g)).toBeCloseTo(g.upper.d-g.upper.tf,9);
  const tc=c.step!.cap.thickness,tw=g.lower.tw;
  expect(find('step-web-yielding').capacity).toBeCloseTo(c.Fy*tw*(2.5*tc+g.upper.tf),3);
  expect(find('step-web-crippling').capacity).toBeCloseTo(.75*.4*tw**2*Math.sqrt(E*c.Fy*tc/tw),3);
  expect(stepWebStrength(p,g).yielding).toBe(find('step-web-yielding').capacity);
  expect(find('step-web-yielding').demand).toBeCloseTo(a.result.step.flangeForce,6);
  // The deep beam between the lower flange centerlines.
  const s=g.lower.d-g.lower.tf,aa=g.innerFlange+s/2,F=a.result.step.flangeForce;
  expect(stepPanel(g,F).shear).toBeCloseTo(F*Math.max(aa,s-aa)/s,6);expect(find('step-panel-shear').demand).toBeCloseTo(F*Math.max(aa,s-aa)/s,6);
  // J7: the girder bearing plate's overlap with the cap, at the lesser F_y.
  const d=p.details,w=d?.bearing.width??g.lower.bf,N=d?.bearing.length??254,ox=Math.min(g.girderWeb+w/2,g.cap.width/2)-(g.girderWeb-w/2),oy=Math.min(N,g.cap.length/2);
  const R=Math.max(...rows.map(r=>r.R));expect(a.result.step.reaction).toBeCloseTo(R,6);
  expect(find('step-bearing').demand).toBeGreaterThanOrEqual(R/(.75*1.8*Math.min(c.Fy,d?.material.Fy??c.Fy)*ox*oy)-1e-9);
  // The upper shaft's inner flange stands over the lower web, within the lower flanges.
  expect(Math.abs(g.innerFlange)).toBeLessThan(g.lower.d/2-g.lower.tf);
  expect(find('step-stiffener-required').status).toBe(F>Math.min(find('step-web-yielding').capacity!,find('step-web-crippling').capacity!)?'fail':'pass');
 });
 it('with a step stiffener the pair carries the whole force: the unstiffened J10.2/J10.3 are for information',()=>{
  const p=stepped();p.existingColumn!.step!.stiffener={thickness:.625*inch,width:6*inch,weld:.3125*inch};
  const checks=analyse(p).stepChecks,find=(id:string)=>checks.find(v=>v.id===id)!;
  expect(find('step-web-yielding').status).toBe('not-applicable');expect(find('step-web-crippling').status).toBe('not-applicable');
  for(const id of ['step-stiffener-bearing','step-stiffener-column','step-stiffener-weld','step-stiffener-width','step-stiffener-thickness','step-stiffener-fatigue'])expect(find(id).status,id).toBe('pass');
  for(const c of checks)expect(classifyCheck(c).rule,c.id).not.toBe('default');
 });
});

describe('configured stepped columns (support stepped-column)',()=>{
 const A:RunwayConfig={...defaultRunwayConfig,title:'Stepped A',capacity:20,control:'cab',cmaa:'C',bays:4,span:30,girder:'rolled',structure:'existing',support:'stepped-column',tie:'paired-bars',railElevation:32,craneSpan:70,columnShape:'W40X199',buildingColumnShape:'W14X159'};
 const B:RunwayConfig={...defaultRunwayConfig,title:'Stepped B',capacity:10,control:'cab',cmaa:'C',bays:3,span:25,girder:'capped',structure:'existing',support:'stepped-column',tie:'cap-angle',railElevation:26,craneSpan:60};
 for(const [name,cfg,tie] of [['20 t cab, 4 × 30 ft rolled, paired bars',A,'paired-bars'],['10 t cab, 3 × 25 ft capped, cap tieback angles',B,'cap-angle']] as const)it(name,()=>{
  const p=buildProject(cfg),c=p.existingColumn!,s=c.step!,g=stepGeometry(p)!;
  expect(validateProject(p)).toEqual([]);
  expect(p.aist!.supportType).toBe('column');expect(p.details!.bracket?.enabled??false).toBe(false);expect(p.details!.brace.arrangement).toBe(tie);
  expect(s.construction).toBe('rolled');expect(s.source).toMatch(/^Fictitious example/);expect(c.source).toMatch(/^Fictitious example/);
  // Outer flanges flush, the girder over the crane-side flange, the tie at the upper shaft's inner face.
  expect(s.offset).toBeCloseTo((c.d-s.upper.d)/2,9);expect(s.girderOffset).toBeCloseTo(c.d/2-c.tf/2,9);
  const face=tie==='cap-angle'?p.details!.brace.capAngle!.columnFace??p.details!.brace.flangeAttachment?.columnFace:p.details!.brace.flangeAttachment?.columnFace;
  expect(face).toBeCloseTo(g.tieDistance,6);
  const items=p.configurator!.selections!.map(v=>v.item);
  if(!cfg.columnShape){expect(items).toContain('Lower shaft (stepped column)');expect(items).toContain('Upper shaft (stepped column)');}
  else expect(c.shape).toBe(cfg.columnShape);
  const r=calculate(p);
  expect(r.errors).toEqual([]);
  expect(r.steppedColumn).toBeDefined();expect(r.checks.some(v=>v.id==='step-basis')).toBe(false);
  for(const id of ['column-upper-interaction','column-lower-interaction','column-buckling-basis','step-web-yielding','step-panel-shear','column-drift'])expect(r.checks.some(v=>v.id===id),id).toBe(true);
  // Every check passes where it is evaluated: the sizing makes the arrangement work.
  expect(r.checks.filter(v=>v.status==='fail').map(v=>`${v.id} ${v.utilization?.toFixed(3)}`)).toEqual([]);
  for(const v of r.checks.filter(v=>v.group==='Stepped column'))expect(classifyCheck(v).rule,v.id).not.toBe('default');
 },600000);
});

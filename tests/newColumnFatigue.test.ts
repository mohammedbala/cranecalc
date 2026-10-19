import {describe,expect,it} from 'vitest';
import {demonstrationProject} from '../src/engine/demonstration';
import {defaultExistingColumn} from '../src/engine/existingColumnInputs';
import {defaultColumnBase,type ColumnBaseInput} from '../src/engine/columnBaseInputs';
import {anchorArea,columnBaseFatigue,elasticRowTension,rodClearance,type BaseFatigueActions} from '../src/engine/columnBase';
import {existingColumnSection} from '../src/engine/existingColumn';
import {sectionProperties} from '../src/engine/section';
import {finiteLife,KSI} from '../src/engine/fatigueConstants';
import {girderPieceChecks,spliceStations} from '../src/engine/girderPieces';
import type {ProjectInput} from '../src/engine/types';

const inch=25.4,foot=304.8,kip=4448.2216152605,ksi=6.894757293168;
const base=():ColumnBaseInput=>({...structuredClone(defaultColumnBase),enabled:true,
 plate:{N:20*inch,B:18*inch,thickness:1.25*inch,Fy:50*ksi,weld:.3125*inch},
 anchors:{grade:'F1554-36',diameter:inch,perRow:2,edge:2*inch,gauge:12*inch,embedment:18*inch}});
const column=():ProjectInput=>{const p=demonstrationProject();p.existingColumn={...structuredClone(defaultExistingColumn),enabled:true,isNew:true,shape:'W14X90'};p.columnBase=base();return p;};

/** Elastic base plate solved directly: C − T = P and C(N/2 − Y/3) + T f = M with plane sections, f_s = n f_c (N/2 + f − Y)/Y. */
function direct(b:ColumnBaseInput,P:number,M:number){
 const N=b.plate.N,B=b.plate.B,f=N/2-b.anchors.edge,As=b.anchors.perRow*anchorArea(b.anchors.diameter),n=200000/(57000*Math.sqrt(b.concrete.fc/.006894757293168)*.006894757293168);
 // For a trial Y, the concrete stress from the moment equation; the axial residual decides the bisection.
 const residual=(Y:number)=>{const k=n*(N/2+f-Y)/Y,arm=B*Y/2*(N/2-Y/3)+As*k*f,fc=M/arm;return {r:fc*B*Y/2-As*k*fc-P,T:As*k*fc};};
 let lo=1,hi=N;for(let i=0;i<100;i++){const m=(lo+hi)/2;if(residual(m).r>0)hi=m;else lo=m;}
 return residual((lo+hi)/2).T;
}

describe('new column base fatigue (AISC 360-16 Appendix 3)',()=>{
 it('solves the elastic anchor row tension as the plane-section equilibrium does',()=>{
  const b=base();
  // Within the kern the plate bears throughout: no rod tension.
  expect(elasticRowTension(b,b.plate.B,2,50*kip,50*kip*3*inch)).toBe(0);
  for(const M of [400,800,1600])expect(elasticRowTension(b,b.plate.B,2,40*kip,M*kip*inch)/kip).toBeCloseTo(direct(b,40*kip,M*kip*inch)/kip,3);
  // Net uplift: both rows in tension.
  expect(elasticRowTension(b,b.plate.B,2,-10*kip,80*kip*inch)/kip).toBeCloseTo(5+80/(2*8),6);
 });
 it('takes the rod, flange and plate ranges between the crane-on and crane-off states',()=>{
  const p=column(),b=p.columnBase!,{section:c}=existingColumnSection(p),s=sectionProperties(c);
  const a:BaseFatigueActions={x:0,e:30*inch,bins:[{name:'Rated',cycles:100000,P1:60*kip,M1:1500*kip*inch,B1:0,P2:20*kip,M2:300*kip*inch}]};
  const z=columnBaseFatigue(p,b,a),T=elasticRowTension(b,b.plate.B,2,60*kip,1500*kip*inch)-elasticRowTension(b,b.plate.B,2,20*kip,300*kip*inch);
  expect(z.rod.range).toBeCloseTo(T/2/anchorArea(inch),6);
  expect(z.toe.range).toBeCloseTo(1200*kip*inch/s.Sx-40*kip/s.A,6);
  // Item 8.5: Cf = 3.9e8 with a 7 ksi threshold; the fillet root C'' carries R_FIL, without a threshold.
  expect(z.rod.capacity/KSI).toBeCloseTo(Math.max(finiteLife(.39,1e5),7*KSI)/KSI,6);
  expect(z.root!.R).toBeLessThan(1);expect(z.root!.capacity).toBeCloseTo(z.root!.R*finiteLife(4.4,1e5),6);
  // A CJP flange joint has no root detail.
  b.plate.flangeJoint='cjp';expect(columnBaseFatigue(p,b,a).root).toBeUndefined();
 });
 it('keeps the plate washers, their fillets and the nut socket clear of the column flange fillets',()=>{
  const p=column(),g=rodClearance(p,p.columnBase!),d=existingColumnSection(p).section.d;
  expect(g.available).toBeCloseTo(10*inch-2*inch-d/2,6);
  // 3 in washer: 1 1/2 + 5/16 washer fillet + 5/16 flange fillet; socket 1.6 x 1 in + 5/16 + the 1/16 in fabrication tolerance.
  expect(g.washer/inch).toBeCloseTo(2.125,6);expect(g.wrench/inch).toBeCloseTo(1.975,6);expect(g.required).toBe(g.washer);
 });
});

describe('continuous girder piece length',()=>{
 it('opens an item for a one-piece continuous girder over 60 ft with splices near the inflection points',()=>{
  const p=demonstrationProject();p.system='continuous';p.spans=[25,25,25,25].map(v=>v*foot);
  expect(spliceStations(p).map(v=>v/foot)).toEqual([55]);
  const [c]=girderPieceChecks(p);expect(c.id).toBe('girder-piece-basis');expect(c.status).toBe('unverified');expect(c.note).toMatch(/0\.2 of the span/);
  p.details!.girderPiece='Erector: one 100 ft piece, permitted load and two-crane pick';expect(girderPieceChecks(p)[0].status).toBe('pass');
  p.spans=[25,25].map(v=>v*foot);expect(girderPieceChecks(p)).toEqual([]);
 });
});

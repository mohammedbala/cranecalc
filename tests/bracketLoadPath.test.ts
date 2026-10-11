import {describe,it,expect} from 'vitest';
import {cappedDemonstrationProject,demonstrationProject,newColumnDemonstrationProject} from '../src/engine/demonstration';
import {createDetailCollector,longitudinalPaths} from '../src/engine/detailAnalysis';
import {sectionProperties} from '../src/engine/section';
import {bracketResponse,columnWeldGroup,columnWeldField,columnWeldStress,createBracketCollector,bracketChecks,seatColumnWeld,seatColumnWeldSizes,seatColumnWeldLength} from '../src/engine/bracketDesign';
import {createSupportForceEnvelope,type SupportForceSet} from '../src/engine/bracketForces';
import {minimumFillet} from '../src/engine/connectionStrength';
import {bracingDesign} from '../src/engine/newColumnBracing';
import {locatingSupport} from '../src/engine/endBearingInputs';
import {craneAtStop} from '../src/engine/endStopInputs';
import type {RunwayCaseEvent} from '../src/engine/designAnalysis';
import type {ProjectInput} from '../src/engine/types';

const inch=25.4,foot=304.8;
/** A strength event with the crane at `origin` and a longitudinal force `axial` at the rail head. */
const event=(p:ProjectInput,id:string,combination:string,origin:number,axial:number):RunwayCaseEvent=>({kind:'strength',id,combination,cranes:[{index:0,origin,loaded:true}],horizontalCrane:0,lateralSign:1,
 wheels:p.cranes[0].wheels.map(w=>({x:origin+w.offset,p:20000,h:0})),q:2,railTorquePerLength:0,axial,longitudinalCouple:axial*1000,verticalReactions:[]});
const envelope=(p:ProjectInput,events:RunwayCaseEvent[])=>{const c=createDetailCollector(p,sectionProperties(p.section),20);for(const e of events)c.observe(e);return c.finish().bracketForces!;};

describe('longitudinal force at the supports',()=>{
 it('takes the crane stop force only into the end bays that carry a stop, toward the stop, and traction into every occupied bay',()=>{
  const p=cappedDemonstrationProject(),F=17793,c=p.cranes[0];
  expect(longitudinalPaths(p,[0,1,2,3].map(i=>i*25*foot)).stopBays).toEqual([{bay:1,sign:-1},{bay:3,sign:1}]);
  // The stop force exists only with the crane against a stop, at the end of its travel: anywhere else on the
  // runway, even on an end bay, no stop is struck and no longitudinal force reaches a support.
  for(const origin of [30*foot,2*foot,62*foot])expect(envelope(p,[event(p,'off','LRFD 8',origin,F)]).map(v=>v.longitudinal.longitudinal)).toEqual([0,0,0,0]);
  expect([craneAtStop(p,0,c.travelStart),craneAtStop(p,0,c.travelEnd),craneAtStop(p,0,2*foot)]).toEqual(['left','right',undefined]);
  // At the left stop it pushes RG1 toward grid 1, delivered at its locating end; its far end lifts.
  const left=envelope(p,[event(p,'left','LRFD 8',c.travelStart,F)]);
  expect(left.map(v=>v.longitudinal.longitudinal)).toEqual([-F,0,0,0]);expect(left[0].reversible.longitudinal).toBe(false);
  const couple=F*1000/(25*foot),stop=left[1].minBearing.ends.find(v=>v.bay===1)!;
  const still=envelope(p,[{...event(p,'left','LRFD 8',c.travelStart,F),axial:0,longitudinalCouple:0}])[1].minBearing.ends.find(v=>v.bay===1)!;
  expect(stop.vertical).toBeCloseTo(still.vertical-couple,6);
  // At the right stop it pushes RG3 toward grid 4; RG3 locates at grid 3. The event names the stop it strikes.
  const right=envelope(p,[event(p,'right','LRFD 8',c.travelEnd,F)]);
  expect(right.map(v=>v.longitudinal.longitudinal)).toEqual([0,0,F,0]);
  expect(envelope(p,[{...event(p,'named','LRFD 8',c.travelEnd,F),stop:'right'}]).map(v=>v.longitudinal.longitudinal)).toEqual([0,0,F,0]);
  // Traction reaches the occupied bay's locating end in either direction.
  const traction=envelope(p,[event(p,'drive','LRFD 2b',30*foot,F/10)]);
  expect(traction.map(v=>Math.abs(v.longitudinal.longitudinal))).toEqual([0,F/10,0,0]);expect(traction[1].reversible.longitudinal).toBe(true);
 });
 it('delivers a continuous girder\'s longitudinal force at its locating support',()=>{
  const p=demonstrationProject();p.system='continuous';p.details!.brace.flangeAttachment!.enabled=false;
  const stations=[0,1,2,3].map(i=>i*25*foot),at=stations[locatingSupport(p)];
  expect(longitudinalPaths(p,stations).continuousAt(at)).toBe(true);expect(longitudinalPaths(p,stations).continuousAt(0)).toBe(false);
  const f=envelope(p,[event(p,'drive','LRFD 2b',30*foot,4000),event(p,'stop','LRFD 8',p.cranes[0].travelStart,20000)]);
  expect(f.map(v=>Math.abs(v.longitudinal.longitudinal))).toEqual(stations.map(x=>x===at?20000:0));
  // Toward the stop the crane is against: the left one here, the right one at the other end of its travel.
  expect(f[locatingSupport(p)].longitudinal.longitudinal).toBe(-20000);
  expect(envelope(p,[event(p,'stop','LRFD 8',p.cranes[0].travelEnd,20000)])[locatingSupport(p)].longitudinal.longitudinal).toBe(20000);
 });
});

describe('bracket design force envelope',()=>{
 it('keeps whole concurrent sets, and the bracket weld group is checked for the same sets',()=>{
  const p=cappedDemonstrationProject(),c=p.cranes[0],F=17793,b=p.details!.bracket!,Lbr=p.details!.bearing.length;
  const collector=createDetailCollector(p,sectionProperties(p.section),20);
  // The crane against the right stop: one concurrent set at each support, so every criterion there is that set.
  collector.observe(event(p,'stop','LRFD 8',c.travelEnd,F));
  const r=collector.finish(),forces=r.bracketForces!;
  for(const v of forces)for(const k of ['maxVertical','maxMoment','minVertical','minBearing','top','bottom'] as const)expect(v[k]).toEqual(v.longitudinal);
  expect(forces[2].longitudinal.longitudinal).toBe(F);expect(forces[2].forward).toEqual(forces[2].longitudinal);expect(forces[2].backward).toBeUndefined();
  // The weld group peak from the tabulated sets, with the bracket self-weight and the bottom-flange force either
  // way at the mean bearing offset, is the one the bracket checks record.
  const self=1.4*(b.seatLength*b.seatProjection*b.seatThickness+2*b.ribDepth*b.ribThickness*b.seatProjection)*p.section.density*9.80665/1e9;
  seatColumnWeldSizes(p).forEach((w,i)=>{
   const g=columnWeldGroup(b,w);let seat=0;
   for(const v of forces){
    const f=v.longitudinal,rr=bracketResponse(p,[...f.ends.map(e=>({vertical:e.vertical,offset:e.offset,length:.4*Lbr})),{vertical:self,offset:0,length:b.seatLength}]);
    const xH=f.ends.reduce((a,e)=>a+e.offset-(e.end==='left'?1:-1)*.3*Lbr,0)/f.ends.length;
    for(const H of [f.bottom,-f.bottom])seat=Math.max(seat,columnWeldStress(b,g,rr.e,{V:rr.V,Mseat:rr.Mx,F:f.longitudinal,H,xH}).seat);
   }
   expect(r.bracket!.columnWeld!.peaks[i].seat.value).toBeCloseTo(seat,6);
  });
 });
 it('breaks ties toward the heavier companions and keeps both senses of a reversing longitudinal force',()=>{
  const env=createSupportForceEnvelope([0]);
  const set=(id:string,vertical:number,moment:number,longitudinal:number,top=0):SupportForceSet=>({id,combination:'LRFD 2c',vertical,moment,longitudinal,top,bottom:-top/3,ends:[]});
  env.add(0,set('a',50,10,-6400));env.add(0,set('b',60,5,-6400));env.add(0,set('c',60,20,-6400));env.add(0,set('d',58,0,6400));env.add(0,set('e',10,0,6400));env.add(0,set('f',10,0,0,500));
  const [v]=env.result();
  expect(v.longitudinal.id).toBe('c');expect(v.backward!.id).toBe('c');expect(v.forward!.id).toBe('d');expect(v.reversible.longitudinal).toBe(true);
  // The least total reaction keeps the case with the larger horizontal forces.
  expect(v.minVertical.id).toBe('e');expect(v.minBearing.id).toBe('e');
 });
});

describe('bracket seat to column flange',()=>{
 it('is one elastic weld group with the rib root fillets, in equilibrium with the concurrent forces',()=>{
  const b=cappedDemonstrationProject().details!.bracket!,g=columnWeldGroup(b,5/16*inch),e=b.reach+12*inch;
  const f={V:60000,Mseat:2e6,F:18000,H:-4000,xH:150};
  const field=columnWeldField(b,g,e,f),sum={H:0,F:0,Vy:0,Mx:0,My:0,Mz:0};
  for(const l of g.lines){
   const n=400,L=Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1]);
   for(let i=0;i<n;i++){const t=(i+.5)/n,x=l.a[0]+(l.b[0]-l.a[0])*t,y=l.a[1]+(l.b[1]-l.a[1])*t,s=field(x,y),dA=l.t*L/n,u=x-g.xc,v=y-g.yc;
    sum.H+=s.n*dA;sum.F+=s.tx*dA;sum.Vy+=s.ty*dA;sum.Mx+=s.n*v*dA;sum.My-=s.n*u*dA;sum.Mz+=(s.ty*u-s.tx*v)*dA;}
  }
  // Applied: V down at e, F along the runway at the girder web line and H off the flange, both at the seat top.
  const dy=g.ys-g.yc;
  expect(sum.H).toBeCloseTo(f.H,0);expect(sum.F).toBeCloseTo(f.F,0);expect(sum.Vy).toBeCloseTo(-f.V,0);
  expect(sum.Mx/(f.V*e+f.H*dy)).toBeCloseTo(1,3);expect(sum.My/(f.F*b.reach-f.H*(f.xH-g.xc))).toBeCloseTo(1,3);
  expect(sum.Mz/(-(f.Mseat-f.V*g.xc)-f.F*dy)).toBeCloseTo(1,3);
  // The seat line takes tension at the top from the bracket moment; it pulls the flange.
  const w=columnWeldStress(b,g,e,{V:60000,Mseat:0,F:0,H:0,xH:0});
  expect(Math.min(...w.ends)).toBeGreaterThan(0);expect(w.pull).toBeCloseTo(Math.max(...w.ends)*g.seatThroat*g.L,6);
  expect(g.L).toBeCloseTo(seatColumnWeldLength(b),9);expect(g.L).toBeCloseTo(Math.min(b.seatLength,b.receiver.width)-inch/2,9);
 });
 it('is sized from the J2.4 minimum for the bracket design forces, or entered with the bracing collector',()=>{
  const p=cappedDemonstrationProject(),b=p.details!.bracket!,min=minimumFillet(Math.max(b.seatThickness,b.receiver.flangeThickness));
  expect(seatColumnWeldSizes(p)[0]).toBeCloseTo(min,9);expect(seatColumnWeld(p).size).toBeCloseTo(min,9);
  const c=createBracketCollector(p)!;
  c.observe('strength','gravity',0,[{vertical:60000,offset:0}],-1,{longitudinal:18000,bottom:2000,offset:0});
  let checks=bracketChecks(p,c.result);
  const get=(id:string)=>checks.find(v=>v.id==='bracket-'+id)!;
  for(const id of ['column-weld','column-weld-minimum','seat-flange','seat-web','fatigue-columnWeld'])expect(get(id).status,id).toBe('pass');
  expect(get('column-weld').caseId).toBe('gravity');expect(get('load-path').note).toContain('top fillet across the flange');
  // A force the minimum fillet cannot carry selects a larger one.
  c.observe('strength','stop',0,[{vertical:60000,offset:0}],-1,{longitudinal:900000,bottom:0,offset:0});
  checks=bracketChecks(p,c.result);
  const sized=seatColumnWeld(p,c.result);
  expect(sized.size).toBeGreaterThan(min);
  expect(sized.peaks!.seat.value).toBeLessThanOrEqual(sized.capacity);
  // With the crane-level bracing the entered collector fillet is the seat weld.
  const q=newColumnDemonstrationProject();expect(seatColumnWeldSizes(q)).toEqual([bracingDesign(q).seatWeld]);
 });
});

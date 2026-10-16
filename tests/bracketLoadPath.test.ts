import {describe,it,expect} from 'vitest';
import {cappedDemonstrationProject,demonstrationProject,newColumnDemonstrationProject} from '../src/engine/demonstration';
import {createDetailCollector,longitudinalPaths} from '../src/engine/detailAnalysis';
import {sectionProperties} from '../src/engine/section';
import {bracketResponse,columnWeldGroup,columnWeldField,columnWeldStress,createBracketCollector,bracketChecks,seatColumnWeld,seatColumnWeldSizes,seatColumnWeldLength,torqueArm} from '../src/engine/bracketDesign';
import {createSupportForceEnvelope,type SupportForceSet} from '../src/engine/bracketForces';
import {minimumFillet} from '../src/engine/connectionStrength';
import {bracingDesign} from '../src/engine/newColumnBracing';
import {locatingSupport} from '../src/engine/endBearingInputs';
import {craneAtStop,craneTravel,stopContacts,stopFace} from '../src/engine/craneTravel';
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
  // Without the end-truck geometry the stop contacts are the entered travel limits kept on the runway (the demo crane
  // travels from 10 ft before grid 1, its second wheel at grid 1, to its first wheel at the far end), the end wheel no
  // farther than the stop face, where the rail ends: every wheel on the rail.
  const [l,r]=stopContacts(p,0).map(v=>v.origin);
  expect(l).toBeCloseTo(stopFace(p,'left')!,6);expect(r).toBeCloseTo(stopFace(p,'right')!-10*foot,6);
  expect([craneAtStop(p,0,l),craneAtStop(p,0,r),craneAtStop(p,0,c.travelStart),craneAtStop(p,0,c.travelEnd),craneAtStop(p,0,2*foot)]).toEqual(['left','right',undefined,undefined,undefined]);
  // Two cranes, the second cloned with full travel as the UI adds one: the first reaches only the left stop and the
  // second only the right; each one's travel limit toward the other crane is that crane, not a stop.
  const two=cappedDemonstrationProject();two.cranes.push(structuredClone(two.cranes[0]));
  expect([stopContacts(two,0).map(v=>v.end),stopContacts(two,1).map(v=>v.end)]).toEqual([['left'],['right']]);
  expect([craneAtStop(two,0,l),craneAtStop(two,0,r),craneAtStop(two,1,l),craneAtStop(two,1,r)]).toEqual(['left',undefined,undefined,'right']);
  // With the end-truck geometry the crane stops with its end wheel the bumper overhang less the stroke from the stop
  // face, its travel running to those contacts.
  const g=cappedDemonstrationProject();Object.assign(g.cranes[0].design!,{bumperOverhang:15*inch,bumperStroke:4*inch});
  const [gl,gr]=stopContacts(g,0);
  expect([gl.basis,gr.basis]).toEqual(['geometry','geometry']);
  expect(gl.wheel).toBeCloseTo(gl.face!+11*inch,6);expect(gr.wheel).toBeCloseTo(gr.face!-11*inch,6);expect(gr.origin).toBeCloseTo(gr.wheel-10*foot,6);
  expect(gl.wheel).toBeGreaterThan(gl.railEnd!);expect(craneTravel(g,0)).toEqual({start:gl.origin,end:gr.origin});
  // At the left stop it pushes RG1 toward grid 1, delivered at its locating end; its far end lifts.
  const left=envelope(p,[event(p,'left','LRFD 8',l,F)]);
  expect(left.map(v=>v.longitudinal.longitudinal)).toEqual([-F,0,0,0]);expect(left[0].reversible.longitudinal).toBe(false);
  const couple=F*1000/(25*foot),stop=left[1].minBearing.ends.find(v=>v.bay===1)!;
  const still=envelope(p,[{...event(p,'left','LRFD 8',l,F),axial:0,longitudinalCouple:0}])[1].minBearing.ends.find(v=>v.bay===1)!;
  expect(stop.vertical).toBeCloseTo(still.vertical-couple,6);
  // At the right stop it pushes RG3 toward grid 4; RG3 locates at grid 3. The event names the stop it strikes.
  const right=envelope(p,[event(p,'right','LRFD 8',r,F)]);
  expect(right.map(v=>v.longitudinal.longitudinal)).toEqual([0,0,F,0]);
  expect(envelope(p,[{...event(p,'named','LRFD 8',r,F),stop:'right'}]).map(v=>v.longitudinal.longitudinal)).toEqual([0,0,F,0]);
  // Traction reaches the occupied bay's locating end in either direction and, through the floating rail string bearing
  // on a stop, either end bay toward its stop with the crane on bay 2: grid 1 for RG1, grid 3 for RG3.
  const traction=envelope(p,[event(p,'drive','LRFD 2b',30*foot,F/10)]);
  expect(traction.map(v=>Math.abs(v.longitudinal.longitudinal))).toEqual([F/10,F/10,F/10,0]);expect(traction[1].reversible.longitudinal).toBe(true);
  expect([traction[0].longitudinal.longitudinal,traction[2].longitudinal.longitudinal]).toEqual([-F/10,F/10]);expect(traction[0].reversible.longitudinal).toBe(false);
  // Open joints anchor each rail piece to its own girder: traction stays in the occupied bay.
  const open=cappedDemonstrationProject();open.details!.rail.jointType='open';
  expect(envelope(open,[event(open,'drive','LRFD 2b',30*foot,F/10)]).map(v=>Math.abs(v.longitudinal.longitudinal))).toEqual([0,F/10,0,0]);
 });
 it('delivers a continuous girder\'s longitudinal force at its locating support',()=>{
  const p=demonstrationProject();p.system='continuous';p.details!.brace.flangeAttachment!.enabled=false;
  const stations=[0,1,2,3].map(i=>i*25*foot),at=stations[locatingSupport(p)];
  expect(longitudinalPaths(p,stations).continuousAt(at)).toBe(true);expect(longitudinalPaths(p,stations).continuousAt(0)).toBe(false);
  const f=envelope(p,[event(p,'drive','LRFD 2b',30*foot,4000),event(p,'stop','LRFD 8',stopContacts(p,0)[0].origin,20000)]);
  expect(f.map(v=>Math.abs(v.longitudinal.longitudinal))).toEqual(stations.map(x=>x===at?20000:0));
  // Toward the stop the crane is against: the left one here, the right one at the other end of its travel.
  expect(f[locatingSupport(p)].longitudinal.longitudinal).toBe(-20000);
  expect(envelope(p,[event(p,'stop','LRFD 8',stopContacts(p,0)[1].origin,20000)])[locatingSupport(p)].longitudinal.longitudinal).toBe(20000);
 });
});

describe('continuous girder runway-end bearings',()=>{
 it('takes the end-grid reaction inboard of the grid, at 0.8 of the bearing length, with its seat moment',()=>{
  const p=cappedDemonstrationProject();p.system='continuous';p.details!.brace.flangeAttachment!.enabled=false;
  const Lbr=p.details!.bearing.length,stations=p.spans.reduce((a,v)=>[...a,a.at(-1)!+v],[0]),c=createDetailCollector(p,sectionProperties(p.section),20);
  // A continuous girder's support reactions come from the runway analysis with the event.
  c.observe({...event(p,'mid','LRFD 2b',30*foot,0),verticalReactions:stations.map(x=>({x,r:100000}))});
  const r=c.finish(),f=r.bracketForces!;
  expect(f[0].maxVertical.moment).toBeCloseTo(f[0].maxVertical.vertical*.8*Lbr,3);
  expect(f.at(-1)!.maxVertical.moment).toBeCloseTo(-f.at(-1)!.maxVertical.vertical*.8*Lbr,3);
  expect(f[0].maxVertical.vertical).toBeCloseTo(100000,6);for(const v of f.slice(1,-1))expect(v.maxVertical.moment).toBe(0);
  // The twin ribs share an interior reaction about equally; at a runway end the inboard rib takes most of it.
  const at=(x:number)=>r.bracket!.stations.find(v=>Math.abs(v.x-x)<1e-6)!;
  expect(at(0).rightRib).toBeGreaterThan(1.5*at(0).leftRib);expect(at(stations.at(-1)!).leftRib).toBeGreaterThan(1.5*at(stations.at(-1)!).rightRib);
  expect(at(stations[1]).leftRib).toBeCloseTo(at(stations[1]).rightRib,-2);
 });
});

describe('bracket design force envelope',()=>{
 it('keeps whole concurrent sets, and the bracket weld group is checked for the same sets',()=>{
  const p=cappedDemonstrationProject(),c=p.cranes[0],F=17793,b=p.details!.bracket!,Lbr=p.details!.bearing.length;
  const collector=createDetailCollector(p,sectionProperties(p.section),20);
  // The crane against the right stop: one concurrent set at each support, so every criterion there is that set.
  collector.observe(event(p,'stop','LRFD 8',stopContacts(p,0)[1].origin,F));
  const r=collector.finish(),forces=r.bracketForces!;
  for(const v of forces)for(const k of ['maxVertical','maxMoment','minVertical','minBearing','top','bottom'] as const)expect(v[k]).toEqual(v.longitudinal);
  expect(forces[2].longitudinal.longitudinal).toBe(F);expect(forces[2].forward).toEqual(forces[2].longitudinal);expect(forces[2].backward).toBeUndefined();
  // The weld group peak from the tabulated sets, with the bracket self-weight and the bottom-flange force either
  // way at the mean bearing offset, is the one the bracket checks record; each set's reaction at its own eccentricity,
  // moved off the web line by its support torque (the top-flange restraint force on torqueArm).
  const self=1.4*(b.seatLength*b.seatProjection*b.seatThickness+2*b.ribDepth*b.ribThickness*b.seatProjection)*p.section.density*9.80665/1e9;
  seatColumnWeldSizes(p).forEach((w,i)=>{
   const g=columnWeldGroup(b,w);let seat=0;
   for(const v of forces){
    const f=v.longitudinal,rr=bracketResponse(p,[...f.ends.map(e=>({vertical:e.vertical,offset:e.offset,length:.4*Lbr})),{vertical:self,offset:0,length:b.seatLength}],Math.abs(f.top)*torqueArm(p));
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
  for(const id of ['column-weld','column-weld-minimum','fatigue-columnWeld'])expect(get(id).status,id).toBe('pass');
  // The demonstration's column stiffeners carry the seat-level force (C2): J10.1 and J10.2 under the seat are for information.
  for(const id of ['seat-flange','seat-web']){expect(get(id).status,id).toBe('not-applicable');expect(get(id).note,id).toMatch(/^Unstiffened J10\.\d, not governing \(the column is stiffened at this level\): R_u = .* D\/C 0\.\d\d\./);}
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

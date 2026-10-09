import {describe,it,expect} from 'vitest';
import {openSection} from '../src/engine/openSection';
import {cappedMechanics} from '../src/engine/cappedMechanics';
import {LateralTorsionBeam,type LateralTorsionInput} from '../src/engine/lateralTorsion';
import {loadCappedSection} from '../src/data/aiscChannels';
import {exampleProject} from '../src/engine/defaults';
import {girderStrength} from '../src/engine/aiscStrength';
import {sectionProperties} from '../src/engine/section';
import {emptyCapDesign} from '../src/engine/capDesignInputs';
import {capInputChecks,capAttachmentChecks} from '../src/engine/capChecks';
import {demonstrationProject} from '../src/engine/demonstration';
import type {CalculationSnapshot} from '../src/engine/types';
const near=(a:number,b:number,t=1e-6)=>expect(Math.abs(a/b-1)).toBeLessThan(t);
const pcap=()=>{const p=demonstrationProject();p.section=loadCappedSection(p.section,'W30X99','C15X33.9');p.aist!.netFlangeArea=p.section.bf*p.section.tf;p.capDesign={...emptyCapDesign,Fy:50*6.894757293,Fu:65*6.894757293,materialSource:'Independent test material',cmaaClass:'C',dutySource:'Test class',fitupNote:'Full contact test',contactConfirmed:true,unperforated:true,topStiffenerCjp:true};return p;};

describe('capped runway mechanics and design',()=>{
 it('integrates unequal-flange I shear center and Cw against the closed form',()=>{
  const b1=200,t1=12,b2=350,t2=16,h=500,tw=8;
  const nodes=[{x:0,y:0},{x:-b1/2,y:0},{x:b1/2,y:0},{x:0,y:h},{x:-b2/2,y:h},{x:b2/2,y:h}];
  const walls=[{from:0,to:1,t:t1},{from:0,to:2,t:t1},{from:0,to:3,t:tw},{from:3,to:4,t:t2},{from:3,to:5,t:t2}].map(w=>({...w,part:'beam' as const}));
  const a=openSection(nodes,walls),I1=t1*b1**3/12,I2=t2*b2**3/12;
  near(a.shearCenter,h*I2/(I1+I2));near(a.Cw,h*h*I1*I2/(I1+I2));
  near(a.Iy,I1+I2);expect(Math.abs(a.orthogonality.axial)).toBeLessThan(1e-5);expect(Math.abs(a.orthogonality.lateral)).toBeLessThan(1e-3);
  const shifted=openSection(nodes.map(n=>({...n,y:n.y+713})),walls);
  near(shifted.Cw,a.Cw);near(shifted.shearCenter,a.shearCenter+713);near(shifted.beta,a.beta);
  const scaled=openSection(nodes.map(n=>({x:n.x*2,y:n.y*2})),walls.map(w=>({...w,t:w.t*2})));
  near(scaled.Cw,a.Cw*64);near(scaled.beta,a.beta*2);near(scaled.shearCoefficient,a.shearCoefficient*8);
 });
 it('recovers a symmetric I warping shear coefficient without empirical constants',()=>{
  const b=200,t=12,h=500;
  const a=openSection([{x:0,y:0},{x:-b/2,y:0},{x:b/2,y:0},{x:0,y:h},{x:-b/2,y:h},{x:b/2,y:h}],
   [{from:0,to:1,t},{from:0,to:2,t},{from:0,to:3,t:8},{from:3,to:4,t},{from:3,to:5,t}].map(w=>({...w,part:'beam' as const})));
  near(a.Cw,t*b**3*h*h/24);near(a.shearCoefficient,h*b*b/16);expect(Math.abs(a.beta)).toBeLessThan(1e-10);
 });
 it('matches signed monosymmetric constant-moment closed-form eigenvalues',()=>{
  // Sine-mode determinant: M² + (EIy k² beta) M - EIy k²(GJ+ECw k²)=0.
  // Equivalent to Ellifritt/Lue Eq.1 after reversing their beta-axis convention.
  const base:LateralTorsionInput={length:9000,E:200000,G:200000/2.6,Iy:1.8e8,J:1.8e6,Cw:1.9e13,h0:720,polarRadiusSquared:90000,loads:[],restraints:[],fixed:[{x:0,dofs:['v','twist']},{x:9000,dofs:['v','twist']}],subdivisions:40,monosymmetry:-390};
  const k=Math.PI/base.length,A=base.E*base.Iy*k*k,B=base.G*base.J+base.E*base.Cw*k*k;
  for(const sign of [-1,1]){const beta=base.monosymmetry!*sign,exact=(-A*beta+Math.sqrt((A*beta)**2+4*A*B))/2,M=sign*1e8;
   near(new LateralTorsionBeam({...base,moment:()=>M}).criticalMultiplier().value*Math.abs(M),exact,.0002);
  }
 });
 it('matches E4-3 flexural-torsional axial eigenvalue with centroid offset',()=>{
  const p:LateralTorsionInput={length:9000,E:200000,G:200000/2.6,Iy:1.8e8,J:1.8e6,Cw:1.9e13,h0:720,polarRadiusSquared:120000,centroidOffset:-160,axial:1e5,loads:[],restraints:[],fixed:[{x:0,dofs:['v','twist']},{x:9000,dofs:['v','twist']}],subdivisions:40};
  const k=Math.PI/p.length,Py=p.E*p.Iy*k*k,Pz=(p.G*p.J+p.E*p.Cw*k*k)/p.polarRadiusSquared,H=1-p.centroidOffset!**2/p.polarRadiusSquared;
  const exact=2*Py*Pz/(Py+Pz+Math.sqrt((Py+Pz)**2-4*H*Py*Pz));
  near(new LateralTorsionBeam(p).criticalMultiplier().value*p.axial!,exact,.0002);
 });
 it('balances eccentric top/bottom spring reactions about the shear center',()=>{
  const m=cappedMechanics(pcap().section)!;
  const p:LateralTorsionInput={length:7620,E:200000,G:200000/2.6,Iy:m.Iy,J:m.J,Cw:m.Cw,h0:m.h0,polarRadiusSquared:m.polarRadiusSquared,topOffset:m.topOffset,bottomOffset:m.bottomOffset,loads:[{x:3810,lateral:10000,torque:3e6}],restraints:[{x:0,top:20000,bottom:20000},{x:7620,top:20000,bottom:20000}]};
  const r=new LateralTorsionBeam(p).solve();near(r.restraints.reduce((a,v)=>a+v.lateral,0),10000);near(r.restraints.reduce((a,v)=>a+v.torque,0),3e6);
  expect(m.beta).toBeLessThan(0);expect(m.shearCenter).toBeGreaterThan(m.elastic.cy);
  near(m.J/25.4**4,3.77+1.01); // AISC component J, no overlap credit.
 });
 it('uses F5 Lr and conservative BOTH-sign resistance, not the F4 example table',()=>{
  const p=pcap();p.unbracedLength=360*25.4;p.method='ASD';
  const s=girderStrength(p,sectionProperties(p.section)),top=s.capDirections![0],bottom=s.capDirections![1];
  // Independent substitution of DG7 rounded geometric data, rt=4.50 in.
  near(top.rt/25.4,4.5,.006);near(top.Lp/25.4,119,.008);near(top.Lr/25.4,407,.009);
  expect(top.Lr/25.4).toBeLessThan(457); // Published F4 table Lr, deliberately not mixed with F5.
  expect(s.major).toBeLessThanOrEqual(bottom.Mn/1.67*(1+1e-10));
  expect(s.topMinor!).toBeGreaterThan(s.bottomMinor!);expect(s.compact).toBe(true);
 });
 it('reproduces the guide cap-weld VQ/(2I) with independent rounded inputs',()=>{
  const cap=cappedMechanics(pcap().section)!,q=77.7*4448.221615*cap.channelQ/(2*cap.elastic.Ix);
  near(q/(4448.221615/25.4),.756,.012); // DG7 Example 14.1.3, per weld, kip/in.
 });
 it('retains missing-input, heavy-duty, intermittent-weld and contact gates',()=>{
  const p=pcap();expect(capInputChecks(p).every(c=>c.status==='pass')).toBe(true);
  for(const field of ['continuousWelds','fullLength','contactConfirmed','unperforated','topStiffenerCjp'] as const){const q=structuredClone(p);q.capDesign![field]=false;expect(capInputChecks(q).some(c=>c.status==='incomplete')).toBe(true);}
  for(const c of ['E','F'] as const){p.capDesign!.cmaaClass=c;expect(capInputChecks(p).find(v=>v.id==='cap-duty')!.status).toBe('unsupported');}
  delete p.capDesign;expect(capInputChecks(p).some(c=>c.status==='incomplete')).toBe(true);
 });
 it('independently checks cap throat shear and full-force end development',()=>{
  const p=pcap();p.cranes.forEach(c=>c.longitudinal=0);p.capDesign!.developmentLength=1200;p.capDesign!.weldSize=6.35;p.capDesign!.Fexx=490;
  const snapshot={input:p,detailResults:{cap:{longitudinalFlow:100,fatigueFlows:[50]},demands:{railVertical:0,railLateral:0},railFatigueBins:[{vertical:0,lateral:0}]} } as CalculationSnapshot;
  const checks=capAttachmentChecks(snapshot),w=checks.find(c=>c.id==='cap-weld-strength')!;
  near(w.demand!,100);near(w.capacity!,.75*.6*490*6.35/Math.sqrt(2));
  const fatigue=checks.find(c=>c.id==='cap-weld-fatigue')!;near(fatigue.demand!,100/(6.35/Math.sqrt(2)));
  const dev=checks.find(c=>c.id==='cap-development')!,beta=1.2-.002*1200/6.35;
  near(dev.capacity!,2*beta*1200*w.capacity!);
  snapshot.detailResults!.demands.endLongitudinal=10000;
  const withTraction=capAttachmentChecks(snapshot).find(c=>c.id==='cap-weld-strength')!;
  near(withTraction.demand!,100+10000*(10/39)/(2*beta*1200));
 });
});

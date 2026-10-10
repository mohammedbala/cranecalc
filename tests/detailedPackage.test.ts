import {beforeAll,describe,it,expect} from 'vitest';
import {calculate,validateProject,fingerprint} from '../src/engine/calculate';
import {demonstrationProject} from '../src/engine/demonstration';
import {createDetailCollector,fatigueSpectrumBin} from '../src/engine/detailAnalysis';
import {sectionProperties} from '../src/engine/section';
import {transverseFilletFatigue,minimumFillet} from '../src/engine/connectionStrength';
import {Beam} from '../src/engine/beam';
import type {CalculationSnapshot} from '../src/engine/types';
import {engineeringSketches,lineworkDxf} from '../src/components/drafting';
import {interfaceCsv} from '../src/engine/detailExports';
import {reportHtml} from '../server/report';
let snapshot:CalculationSnapshot;
beforeAll(()=>{snapshot=calculate(demonstrationProject());},180000);
describe('representative runway package',()=>{
 it('recomputes an exportable design with passing model and engineering gates',()=>{
  expect(snapshot.errors).toEqual([]);expect(snapshot.checks.filter(c=>!['pass','not-applicable','excluded'].includes(c.status))).toEqual([]);expect(snapshot.eligible).toBe(true);
  // Building adequacy is stated as outside the calculation, never as a pass.
  // The demonstration bracket and column are by others, so the bearing seat, the column flange at the
  // tie roots and the bracket deflection limit for the tie slots are listed with them.
  expect(snapshot.checks.filter(c=>c.status==='excluded').map(c=>c.id)).toEqual(['supporting-structure','end-bearing-seat','flange-tie-column','flange-tie-column-fatigue','tie-move-support']);
  expect(snapshot.detailResults!.fatigue.length).toBeGreaterThan(20);
  expect(snapshot.detailResults!.travelChange).toBeLessThan(.01);expect(snapshot.detailResults!.meshChange).toBeLessThan(.01);
 });
 it('retains true fatigue-cycle and root-weld behavior without an endurance loophole',()=>{
  expect(fatigueSpectrumBin('C',10,1e6).damage).toBeGreaterThan(0);
  expect(fatigueSpectrumBin('C',100,2e6).damage).toBeCloseTo(2*fatigueSpectrumBin('C',100,1e6).damage,12);
  expect(transverseFilletFatigue(25.4,6.35,1e6).reduction).toBeCloseTo(.2408,3);
  expect(transverseFilletFatigue(25.4,6.35,1e12).capacity).toBeLessThan(1);
  expect(minimumFillet(50)).toBe(7.9375);
 });
 it('recovers support rotation independently of the displacement envelope',()=>{
  const L=6000,EI=200000*200e6,P=100000,b=new Beam(0,L,EI,[0,L],20),r=b.evaluate([{x:1200,p:P}]);
  const expected=P*(L-1200)*(L*L-(L-1200)**2)/(6*L*EI);
  expect(Math.abs(r.rotation[0])/expected).toBeCloseTo(1,8);
 });
 it('groups close wheels for rail details and retains signed simultaneous interfaces',()=>{
  const p=demonstrationProject(),props=sectionProperties(p.section),c=createDetailCollector(p,props,20),x=3000;
  c.observe({kind:'strength',id:'grouped',combination:'independent fixture',cranes:[{index:0,origin:x,loaded:true}],horizontalCrane:0,lateralSign:1,wheels:[{x,p:10000,h:1000},{x:x+100,p:20000,h:2000}],q:0,railTorquePerLength:0,axial:1000,verticalReactions:[{x:0,r:15000},{x:p.spans[0],r:15000}]});
  const r=c.finish();expect(r.demands.railVertical).toBe(30000);expect(r.demands.railLateral).toBe(3000);
  const L=p.spans.reduce((sum,v)=>sum+v,0);
  expect(r.interfaces.every(v=>v.id==='grouped-T1'&&Math.abs(v.longitudinal)===(v.x===0?1000:0))).toBe(true);
  expect(r.interfaces.some(v=>v.x>0&&v.x<L&&v.longitudinal===0)).toBe(true);
  expect(r.interfaces.some(v=>v.longitudinal<0)).toBe(true);
 });
 it('rejects fictional project source certification and invalid detail geometry',()=>{
  const p=demonstrationProject();p.reportPurpose='project';delete p.details;
  const s=calculate(p);expect(s.eligible).toBe(false);expect(s.checks.some(c=>c.note.includes('manufacturer')&&c.status==='incomplete')).toBe(true);
  const p2=demonstrationProject();p2.unbracedLength=1000;expect(validateProject(p2).join()).toContain('top (compression) flange restraint spacing');
  p2.unbracedLength=p2.spans[0];const spacing=p2.aist!.clipSpacing;p2.aist!.clipSpacing=.1;expect(validateProject(p2).join()).toContain('200 rail-keeper');p2.aist!.clipSpacing=spacing;p2.details!.spectrum[0].cycles++;expect(validateProject(p2).join()).toContain('sum');
  p2.details!.spectrum[0].cycles--;p2.cranes[0].design!.bumperBypassesGirder=false;p2.details!.endStop!.enabled=false;expect(validateProject(p2).join()).toContain('design the girder-mounted runway end stops');
 });
 it('derives all detail sheets and export records from the current snapshot',()=>{
  const sheets=engineeringSketches(snapshot);expect(sheets).toHaveLength(9);
  // SK-05 shows the bolted end bearing: four standard holes at the locating end, four slots at the sliding end.
  expect(sheets.find(s=>s.number==='SK-05')!.entities.filter(e=>e.type==='circle')).toHaveLength(4);
  const dxf=lineworkDxf(snapshot);expect(dxf.includes('4 A325 bolts, diameter 7/8"')).toBe(true);expect(dxf).toContain(snapshot.revision);
  const csv=interfaceCsv(snapshot);expect(csv).toContain(snapshot.input.units==='US'?'vertical_down_kip':'vertical_down_N');expect(csv).toContain('BUMPER-1');
  const html=reportHtml(snapshot);expect(html).toContain('FICTITIOUS');expect(html).toContain('OUTSIDE THIS CALCULATION - BY OTHERS');expect(html).toContain('signed');expect(html).toContain('SK-07');expect(html).not.toContain('class="json"');
  const p=structuredClone(snapshot.input);p.details!.rail.clipThickness*=1.1;expect(fingerprint(p)).not.toBe(snapshot.revision);
 });
});

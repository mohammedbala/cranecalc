import {describe,expect,it} from 'vitest';
import {buildProject} from '../src/engine/configurator';
import {defaultRunwayConfig} from '../src/engine/configInputs';
import {flangeTieGeometry,stiffenerTieGeometry,tieLine} from '../src/engine/tieGeometry';
import {LateralTorsionBeam} from '../src/engine/lateralTorsion';
import {createDetailCollector} from '../src/engine/detailAnalysis';
import {sectionProperties} from '../src/engine/section';
import {clearanceEffects} from '../src/engine/restraintClearance';
import {deliveredForces} from '../src/engine/forcesDelivered';
import {runwayElevations} from '../src/engine/drawingData';
import {railTopAboveSteel} from '../src/engine/railSeat';
import {demonstrationProject,newColumnDemonstrationProject} from '../src/engine/demonstration';
import {defaultColumnCap} from '../src/engine/columnCapInputs';
import type {CalculationSnapshot,ProjectInput} from '../src/engine/types';

/**
 * The tie force acts on the girder at the drawn tie line (tieLine): a bar force F at a drop e below the flange is F at
 * the flange plus the torque F·e. The analysis restraint, the interface torque, the rail-head take-up and the S-00 tie
 * elevation all use that line.
 */
const p=buildProject({...defaultRunwayConfig,capacity:5,craneSpan:48,cmaa:'A',buildingClass:'D',bays:3,span:20,railElevation:26,structure:'existing',support:'by-others',tie:'flexible-plate'});
// The direct flange saddle (the configurator may move a tie that cannot pass onto the bearing stiffener).
if(p.details!.brace.flangeAttachment)p.details!.brace.flangeAttachment.enabled=true;
const props=sectionProperties(p.section),s=p.section;
// One strength case: the crane's wheels in bay 1 with side thrust, as the moving-load search hands it to the collector.
function run(q:ProjectInput){
 const c=createDetailCollector(q,sectionProperties(q.section),20),L=q.spans[0],crane=q.cranes[0],x0=L/2-crane.wheels.at(-1)!.offset/2;
 const wheels=crane.wheels.map(w=>({x:x0+w.offset,p:1.6*w.loaded,h:1.6*w.lateral}));
 const R1=wheels.reduce((a,w)=>a+w.p*(L-w.x)/L,0),R2=wheels.reduce((a,w)=>a+w.p,0)-R1,supports=[0,...q.spans.map((_,i)=>q.spans.slice(0,i+1).reduce((a,v)=>a+v,0))];
 c.observe({kind:'strength',id:'bay1',combination:'fixture',cranes:[{index:0,origin:x0,loaded:true}],horizontalCrane:0,lateralSign:1,wheels,q:0,railTorquePerLength:0,axial:0,verticalReactions:supports.map((x,i)=>({x,r:i===0?R1:i===1?R2:0}))});
 return c.finish();
}

describe('the tie force acts at the drawn tie line',()=>{
 it('W18 direct flange saddle: the analysis tie height is the drawn bar centroid, the restraint arms follow it',()=>{
  const g=flangeTieGeometry(p)!;
  expect(s.catalogueId).toMatch(/^W18/);expect(g).toBeDefined();
  // The flange tie sheet draws the bar centroid g.topDrop below the flange underside.
  expect(Math.abs(tieLine(p)-(s.d-s.tf-g.topDrop))).toBeLessThan(1);
  expect(tieLine(p)).toBeCloseTo(s.d/2+g.topCenter,9);
  // 4 5/8 to 6 in below the top of steel, not at the flange.
  expect((s.d-tieLine(p))/25.4).toBeGreaterThan(4.5);
  // The bottom flange is restrained by the end bearing bolts at mid-thickness.
  expect(tieLine(p,'bottom')).toBeCloseTo(s.tf/2,9);
  // The analysis: the interface torque of every support is the restraint forces times their arms from the shear center.
  const r=run(p),yt=tieLine(p)-s.d/2,yb=tieLine(p,'bottom')-s.d/2;
  expect(r.interfaces.length).toBeGreaterThan(0);
  for(const v of r.interfaces)expect(Math.abs(v.torque-(v.top*yt+v.bottom*yb))).toBeLessThan(1e-6*Math.max(1,Math.abs(v.top*yt)));
  expect(Math.max(...r.interfaces.map(v=>Math.abs(v.top)))).toBeGreaterThan(0);
  // The rail-head take-up is measured from the same line.
  expect(clearanceEffects(p,props,tieLine(p),s.d+railTopAboveSteel(p)).yt).toBeCloseTo(tieLine(p),9);
 },120000);
 it('LateralTorsionBeam: each restraint force acts at its offset, so its torque is F times that offset',()=>{
  const L=6096,E=s.E,yt=tieLine(p)-s.d/2,yb=-props.h0/2;
  const beam=new LateralTorsionBeam({length:L,E,G:E/2.6,Iy:props.Iy,J:props.J,Cw:props.Cw,h0:props.h0,polarRadiusSquared:(props.Ix+props.Iy)/props.A,subdivisions:24,topOffset:yt,bottomOffset:yb,
   loads:[{x:L/2,lateral:20000,torque:20000*(s.d/2+150)}],restraints:[{x:0,top:5e4,bottom:8e4},{x:L,top:5e4,bottom:8e4}]});
  const r=beam.solve();
  for(const v of r.restraints){
   expect(v.torque).toBeCloseTo(v.top*yt+v.bottom*yb,6);
   const st=r.at(v.x);expect(v.top).toBeCloseTo(5e4*(st.v+yt*st.twist),6);expect(v.bottom).toBeCloseTo(8e4*(st.v+yb*st.twist),6);
  }
 });
 it('H TIE rises against the flange-level model: the same lateral load at the rail head with the tie at its bar line',()=>{
  // Stiff end restraints, the wheel's side thrust at the rail head: the top force is H(z - y_b)/(y_t - y_b) by statics.
  const L=6096,E=s.E,z=s.d/2+railTopAboveSteel(p),yb=-props.h0/2,H=20000;
  const top=(yt:number)=>{const r=new LateralTorsionBeam({length:L,E,G:E/2.6,Iy:props.Iy,J:props.J,Cw:props.Cw,h0:props.h0,polarRadiusSquared:(props.Ix+props.Iy)/props.A,subdivisions:24,topOffset:yt,bottomOffset:yb,
   loads:[{x:L/2,lateral:H,torque:H*z}],restraints:[{x:0,top:1e9,bottom:1e9},{x:L,top:1e9,bottom:1e9}]}).solve();return Math.abs(r.restraints[0].top);};
  const flange=top(props.h0/2),bars=top(tieLine(p)-s.d/2);
  expect(flange).toBeCloseTo(H/2*(z-yb)/(props.h0/2-yb),-1);
  expect(bars).toBeCloseTo(H/2*(z-yb)/(tieLine(p)-s.d/2-yb),-1);
  expect(bars/flange).toBeGreaterThan(1.2);
 });
 it('the S-00 tie elevation is the seat plus the bearing plate plus the tie line, and equals the bars at the column',()=>{
  const r=run(p),a={moment:2e8,axial:2e4} as CalculationSnapshot['designAnalysis'];
  const dl=deliveredForces({input:p,detailResults:r,designAnalysis:a,properties:props} as unknown as CalculationSnapshot)!,el=runwayElevations(p)!;
  expect(dl.elevation!.tie).toBeCloseTo(el.seat+p.details!.bearing.thickness+tieLine(p),6);
  expect(dl.elevation!.tieBars).toBeCloseTo(dl.elevation!.tie,6);
 },120000);
 it('bars on the bearing stiffener gusset act at their own line; a column cap fork at the flange',()=>{
  const q=demonstrationProject();q.details!.brace.flangeAttachment={...q.details!.brace.flangeAttachment!,enabled:false};
  const st=stiffenerTieGeometry(q)!;expect(st).toBeDefined();
  expect(tieLine(q)).toBeCloseTo(q.section.d/2+st.topCenter,9);
  expect(tieLine(q)).toBeLessThan(q.section.d-q.section.tf-st.height/2);
  // On a column cap the stiffeners and the bolted bottom flange form the fork: no tie, the flange line.
  const c=newColumnDemonstrationProject();c.details!.bracket!.enabled=false;c.details!.brace.flangeAttachment!.enabled=false;c.aist!.supportType='column';c.columnCap={...structuredClone(defaultColumnCap),enabled:true};
  expect(tieLine(c)).toBeCloseTo(c.section.d-c.section.tf/2,9);expect(tieLine(c,'bottom')).toBeCloseTo(c.section.tf/2,9);
 });
});

import {describe,expect,it} from 'vitest';
import {demoFocus005} from '../fixtures/demoFocus005';
import {coordinationChecks,connectionCoordination,boxClearance} from '../../src/engine/connectionCoordination';
import {capAngleGeometry,capAngleTieParts,capBoltNutEnvelope,beveledWasher} from '../../src/engine/capAngle';
import {railJointType,railJointGap,railMovements,railAnchors,tightJointGap} from '../../src/engine/railLayout';
import {constructionRequirements,supersededFabricationNotes,preheatBasis,cjpWelds,awsCode,weldElectrode} from '../../src/engine/constructionNotes';
import {carbonEquivalent,existingWeldingChecks} from '../../src/engine/existingWelding';
import {existingColumnSection} from '../../src/engine/existingColumn';
import {tieColumnScope} from '../../src/engine/loadPathScope';
import {seatSettingTolerance,oversizedEdgeIncrement} from '../../src/engine/fitTolerances';
import {snugTightNotPermitted} from '../../src/engine/boltingBasis';
import {detailedDrawings} from '../../src/components/detailedDrawings';
import type {CalculationSnapshot} from '../../src/engine/types';

const inch=25.4,p0=demoFocus005();
const snapshotOf=(p=p0)=>({input:p,revision:'test',checks:[],warnings:[],errors:[],eligible:true} as unknown as CalculationSnapshot);

describe('G4 · A1 coordination checks replace the text flag',()=>{
 it('checks the cap tie hardware against the girder bearing stiffeners from the engine geometry',()=>{
  const c=coordinationChecks(p0),tie=c.find(v=>v.id==='coord-cap-tie-stiffener')!;
  // Before: the paired-bar template fields (brace.length 18 in, bolt rows 3.25 and 5.25 in from the web) were read for
  // the cap angle and produced "CONNECTION LAYOUT REQUIRES REDESIGN". After: the cap angle's own hardware is 0.93 in clear.
  expect(tie.group).toBe('Coordination');expect(tie.status).toBe('pass');
  expect(tie.capacity!/inch).toBeCloseTo(.933,2);expect(tie.demand!/inch).toBeCloseTo(.125,6);
  expect(tie.note).toMatch(/grid 1/);
  expect(c.find(v=>v.id==='coord-cap-tie-adjacent')!.capacity!/inch).toBeCloseTo(3.75,3);
  expect(c.find(v=>v.id==='coord-rail-joints')!.status).toBe('pass');
  expect(connectionCoordination(p0)).toHaveLength(0);
 });
 it('fails, with the parts and grid named, when the stiffener outstand reaches the nut',()=>{
  const p=structuredClone(p0);p.details!.bearing.stiffenerWidth=6*inch;
  const tie=coordinationChecks(p).find(v=>v.id==='coord-cap-tie-stiffener')!;
  expect(tie.status).toBe('fail');expect(tie.capacity!).toBeLessThan(0);expect(tie.note).toMatch(/^OPEN ITEM: CONNECTION LAYOUT REQUIRES REDESIGN/);
  expect(tie.note).toMatch(/Interference/);expect(connectionCoordination(p)[0]).toMatch(/bearing stiffeners/);
 });
 it('measures signed box clearance',()=>{
  expect(boxClearance({min:[0,0,0],max:[1,1,1]},{min:[2,0,0],max:[3,1,1]})).toBeCloseTo(1);
  expect(boxClearance({min:[0,0,0],max:[1,1,1]},{min:[.75,0,0],max:[3,1,1]})).toBeCloseTo(-.25);
 });
 it('draws SK-06 from the checked cap tieback angle, not the gusseted double-cover template',()=>{
  const sk=detailedDrawings(snapshotOf()).find(v=>v.number==='SK-06')!;
  const text=sk.entities.filter(v=>v.type==='text').map(v=>(v as {text:string}).text).join(' | ');
  expect(sk.title).toMatch(/L4X4X1\/2/);expect(text).toMatch(/Cap bolts: 2 - /);expect(text).toMatch(/beveled washers/);expect(text).not.toMatch(/cover plates/i);
  const all=detailedDrawings(snapshotOf()).flatMap(d=>d.entities.filter(v=>v.type==='text').map(v=>(v as {text:string}).text)).join(' | ');
  expect(all).toMatch(/CAP TIEBACK ANGLE AT EACH GIRDER END \/ SK-06/);expect(all).toMatch(/Bottom flange held by the bolted end bearings/);
  expect(all).toMatch(/cap tieback bolt holes/);expect(all).toMatch(/TAPERED I HAUNCH: SK-10/);
 });
});

describe('G4 · beveled washer and true flange thickness at the cap bolt line',()=>{
 it('seats the nut on an F436 1:6 beveled washer on the sloped C15X50 flange',()=>{
  const g=capAngleGeometry(p0)!,seat=g.cap.seat;
  expect(seat.washer.kind).toBe('beveled');expect(seat.washer.t).toBeCloseTo(5/16*inch,6);expect(seat.washer.width).toBeCloseTo(1.75*inch,6);
  // C15X50: tf 0.650 average, 2:12 inner slope; bolt line 2.25 in below the top of the cap = 1.534 in below the web.
  expect(seat.thickness/inch).toBeCloseTo(.65+(1.5-1.534)/6,3);
  const nut=capAngleTieParts(p0)!.bolts.find(v=>v.group==='cap')!.nut;
  expect((g.y0-nut[1])/inch).toBeCloseTo(seat.thickness/inch+5/16,6);
  expect(capBoltNutEnvelope(g)[0].parts.map(v=>v.name)).toEqual(['F436 1:6 beveled washer','heavy hex nut','bolt stick-through']);
  expect(beveledWasher(.625*inch).thick/inch).toBeCloseTo(5/16+.875/6,6);
 });
});

describe('G4 · B14 tight rail joints by default',()=>{
 it('uses TR-13 tight joints with one anchor per rail and the end-stop gap for thermal movement',()=>{
  expect(p0.details!.rail.jointGap/inch).toBeCloseTo(.375,6);// entered open-joint gap is kept but not used
  expect(railJointType(p0)).toBe('tight');expect(railJointGap(p0)).toBeCloseTo(tightJointGap,9);
  const m=railMovements(p0);expect(m.joints.every(v=>v.movement===0)).toBe(true);
  expect(railAnchors(p0).every(r=>r.anchors.length===1)).toBe(true);
  const end=Math.max(...m.ends.map(v=>v.movement));expect(end/inch).toBeGreaterThan(.2);expect(end/inch).toBeLessThan(.4);
  const open=structuredClone(p0);open.details!.rail.jointType='open';expect(railJointGap(open)).toBeCloseTo(.375*inch,6);
  expect(railAnchors(open).some(r=>r.anchors.length>1)).toBe(true);
 });
});

describe('G4 · B15, D28, D29, D32 construction requirements',()=>{
 const req=constructionRequirements(p0),text=req.flatMap(v=>v.items).join(' ');
 it('lists the TR-13 clearance test, roof framing clearance, the §5.18 tolerances and the re-torque',()=>{
  expect(text).toMatch(/§1\.5\.6\.2/);expect(text).toMatch(/three times, with the trolley at each end of the bridge and at center/);expect(text).toMatch(/roof trusses deflected under snow/);
  expect(text).toMatch(/existing roof framing/);expect(text).toMatch(/column base lines ±1\/8 in/);expect(text).toMatch(/3\/4 of the web thickness/);
  expect(text).toMatch(/30 and 90 days/);expect(text).not.toMatch(/demonstration tolerance/i);
 });
 it('uses one AWS D1.1 edition and one preheat thickness basis, labelling 150 °F a project requirement',()=>{
  expect(awsCode).toBe('AWS D1.1/D1.1M:2020');
  const h=preheatBasis(p0)!;expect(h.t/inch).toBeCloseTo(1,6);expect(h.thickest.name).toBe('haunch top flange');
  expect(h.need).toBeCloseTo(10,6);expect(h.governing).toBeCloseTo((150-32)*5/9,6);expect(h.project).toBe(true);
  expect(h.text).toMatch(/150 °F \(project requirement\)/);expect(h.text).toMatch(/over 3\/4 in through 1-1\/2 in/);expect(h.text).toMatch(/minimum 50 °F/);
 });
 it('requires AWS D1.1 cyclic acceptance criteria and 100% UT of the CJP welds',()=>{
  expect(cjpWelds(p0)).toEqual(['girder bearing stiffeners to the W top flange','haunch flanges to the existing column flange (field)']);
  expect(text).toMatch(/100% UT of all CJP groove welds/);expect(text).toMatch(/cyclically loaded nontubular connections \(AIST TR-13 §5\.17\)/);
 });
 it('flags the entered notes that contradict them',()=>{
  const bad=supersededFabricationNotes(p0);
  expect(bad.map(v=>v.field)).toEqual(['bolting','inspection','railAlignment']);
 });
});

describe('G4 · C22 carbon equivalent, D27 electrode, D30 bolting, D31 tolerances, D34 by others',()=>{
 it('reports the carbon equivalent as information, with the Annex B formula including Si',()=>{
  const ce=existingWeldingChecks(p0,existingColumnSection(p0).section.tf).find(v=>v.id==='column-weld-ce')!;
  expect(ce.status).toBe('pass');expect(ce.capacity).toBeUndefined();expect(ce.utilization).toBeUndefined();expect(ce.demand).toBeCloseTo(.42,9);
  expect(ce.equation).toContain('Mn+Si');expect(ce.note).toMatch(/Information only/);
  expect(carbonEquivalent({basis:'mill-certificates',grade:'',preheat:0,deadLoadOnly:true,source:'',chemistry:{C:.2,Mn:1.2,Si:.3,Cu:.3}})!.value).toBeCloseTo(.2+1.5/6+.3/15,9);
 });
 it('takes the weld metal from the detailed connections (E70XX, 70 ksi)',()=>{
  expect(p0.connections.Fexx).toBeCloseTo(490,6);// legacy SI default in the fixture (71.1 ksi)
  expect(weldElectrode(p0)/6.894757293168).toBeCloseTo(70,6);
 });
 it('reports snug-tight runway bolts as an open item',()=>{
  const c=snugTightNotPermitted('x','t','g','cap bolts');expect(c.status).toBe('fail');expect(c.note).toMatch(/TR-13 §5\.14/);expect(c.note).toMatch(/J1\.10 list was removed/);
 });
 it('adds the setting and fit-up tolerances',()=>{
  expect(seatSettingTolerance/inch).toBe(.125);expect(oversizedEdgeIncrement(.625*inch)/inch).toBe(1/16);expect(oversizedEdgeIncrement(inch)/inch).toBe(1/8);
 });
 it('states what of the bracket and tie load path remains by others',()=>{
  const s=tieColumnScope(p0);expect(s.byOthers).toBe(false);expect(s.title).toBe('Bracket and tie load paths to the column');
  expect(s.sentence).toMatch(/checked under Cap tieback/);expect(s.sentence).toMatch(/frame, its connections and foundations beyond the checked column remain by others/);
 });
});

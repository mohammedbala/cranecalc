import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {bracketResponse,seatStrip,rectangularRibFlexure,createBracketCollector,bracketChecks,validateBracket} from '../src/engine/bracketDesign';
import {projectSchema} from '../src/engine/types';
import {buildWeldedBrackets} from '../src/components/weldedBracketGeometry';
import {buildReferenceFraming} from '../src/components/referenceFraming';
import {referenceColumns,referenceCrossheads} from '../src/data/aiscReferenceShapes';

describe('welded bracket independent statics and limit states',()=>{
 it('matches a centered uniform load patch closed form',()=>{
  const P=10000,L=200,a=100,s=seatStrip([{vertical:P,offset:0}],L,a);
  expect(s.reactions).toEqual([P/2,P/2]);expect(s.moment).toBeCloseTo(P*(2*L-a)/8,5);expect(s.shear).toBeCloseTo(P/2,3);
  expect(seatStrip([{vertical:P,offset:0}],L,L).moment).toBeCloseTo(P*L/8,5);
 });
 it('preserves negative rib force and exact overhang moment',()=>{
  const s=seatStrip([{vertical:10000,offset:200}],200,100);
  expect(s.reactions).toEqual([-5000,15000]);expect(s.moment).toBeCloseTo(10000*100,5);
  const reverse=seatStrip([{vertical:-10000,offset:200}],200,100);expect(reverse.moment).toBe(s.moment);expect(reverse.shear).toBe(s.shear);
 });
 it('keeps simultaneous adjacent reactions; symmetrical bearings cancel seat torque',()=>{
  const p=cappedDemonstrationProject(),b=p.details!.bracket!,r=bracketResponse(p,[{vertical:10000,offset:-130},{vertical:30000,offset:130}]);
  expect(r.V).toBe(40000);expect(r.Mx).toBe(2600000);expect(r.ribs[0]+r.ribs[1]).toBe(40000);
  expect((r.ribs[1]-r.ribs[0])*b.ribSpacing/2).toBeCloseTo(2600000,5);
  expect(bracketResponse(p,[{vertical:20000,offset:-130},{vertical:20000,offset:130}]).ribs).toEqual([20000,20000]);
 });
 it('matches hand-calculated eccentric root-weld endpoint stress',()=>{
  const p=cappedDemonstrationProject(),b=p.details!.bracket!,r=bracketResponse(p,[{vertical:20000,offset:0}]);
  const P=10000,e=b.reach+p.details!.bearing.width/2,a=b.rootWeld/Math.sqrt(2),Aw=2*a*b.ribDepth,Iw=2*a*b.ribDepth**3/12;
  expect(r.rootWeld).toBeCloseTo(Math.hypot(P/Aw,P*e*(b.ribDepth/2)/Iw),9);
  expect(r.normal).toBeCloseTo(6*P*e/(b.ribThickness*b.ribDepth**2),9);
 });
 it('exercises all AISC F11 branches and LRFD/ASD resistance factors',()=>{
  const b=cappedDemonstrationProject().details!.bracket!,E=200000,Fy=345;
  for(const ratio of [.04,.5,2.5]){
   const v={...b,seatProjection:ratio*(E/Fy)*b.ribThickness**2/(2*b.ribDepth)};
   const S=b.ribThickness*b.ribDepth**2/6,Mp=Fy*b.ribThickness*b.ribDepth**2/4;
   const Mn=ratio<=.08?Mp:ratio<=1.9?Math.min(Mp,(1.52-.274*ratio)*Fy*S):1.9/ratio*Fy*S;
   expect(rectangularRibFlexure(v,E,Fy,'LRFD').capacity).toBeCloseTo(.9*Mn,3);
   expect(rectangularRibFlexure(v,E,Fy,'ASD').capacity).toBeCloseTo(Mn/1.67,3);
  }
 });
 it('captures a rib-governing offset case even when its total V is lower',()=>{
  const p=cappedDemonstrationProject(),c=createBracketCollector(p)!;
  c.observe('strength','larger-total',0,[{vertical:40000,offset:0}],-1);
  c.observe('strength','offset',0,[{vertical:30000,offset:200}],-1);
  expect(c.result.strength.vertical.caseId).toBe('larger-total');expect(c.result.strength.ribMoment.caseId).toBe('offset');
  c.observe('service','static',0,[{vertical:10000,offset:0}],-1);
  c.observe('fatigue','bin',0,[{vertical:10000,offset:0}],0);
  const direct=bracketResponse(p,[{vertical:10000,offset:0}]);expect(c.result.fatigue[0].rib).toBeCloseTo(direct.normal,10); // from the unloaded state; gravity does not reverse
  expect(c.result.service.deflection.value).toBe(direct.deflection);
  expect(c.result.strength.vertical.value).toBeGreaterThan(40000); // own weight only in strength
 });
 it('blocks unconfirmed geometry and fails thin seat, uplift and high column axial force',()=>{
  const p=cappedDemonstrationProject(),b=p.details!.bracket!;b.seatThickness=12.7;b.receiver.axialDemand=1e8;b.receiver.confirmed=false;
  const c=createBracketCollector(p)!;c.observe('strength','test',0,[{vertical:80000,offset:180}],-1);c.observe('strength','uplift',0,[{vertical:-5000,offset:0}],-1);
  const checks=bracketChecks(p,c.result),get=(id:string)=>checks.find(v=>v.id==='bracket-'+id)!;
  expect(get('receiver').status).toBe('unverified');expect(get('seat-flexure').status).toBe('fail');expect(get('column-panel').status).toBe('fail');expect(get('uplift').status).toBe('fail');
 });
 it('rejects invalid geometry and nonfinite data without invalidating older files',()=>{
  const p=cappedDemonstrationProject();p.details!.bracket!.seatProjection=100;expect(validateBracket(p).join()).toContain('complete bearing patch');
  p.details!.bracket!.ribDepth=NaN;expect(projectSchema.safeParse(p).success).toBe(false);
  delete p.details!.bracket;expect(projectSchema.safeParse(p).success).toBe(true);expect(createBracketCollector(p)).toBeUndefined();
 });
 it('draws actual full-depth rectangular ribs and no obsolete bolted bracket hardware',()=>{
  const b=cappedDemonstrationProject().details!.bracket!,steel=new THREE.MeshBasicMaterial(),edge=new THREE.LineBasicMaterial();
  const group=buildWeldedBrackets(b,[0],0,steel,edge),rib=group.getObjectByName('WB-S1-rib-1')!;
  const bounds=new THREE.Box3().setFromObject(rib),size=bounds.getSize(new THREE.Vector3());
  expect(size.x*1000).toBeCloseTo(b.ribThickness,3);expect(size.y*1000).toBeCloseTo(b.ribDepth,3);expect(size.z*1000).toBeCloseTo(b.seatProjection,3);
  const frame=buildReferenceFraming({bracket:b,supports:[0,5],girderDepth:.6,girderWidth:.3,columnHeight:3,column:referenceColumns[0],crosshead:referenceCrossheads[0],materials:{column:steel,beam:steel,plate:steel,foundation:steel,edge}});
  expect(frame.columnFace*1000).toBeCloseTo(b.reach,6);expect(frame.group.getObjectByName('bracket-S1')).toBeUndefined();expect(frame.group.getObjectByName('bracket-end-plate-S1')).toBeUndefined();expect(frame.group.getObjectByName('WB-S1-seat')).toBeDefined();
 });
});

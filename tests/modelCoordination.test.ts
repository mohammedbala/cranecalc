import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {hardwareAuditModel,restoreHardwareAuditModel} from '../src/components/hardwareAuditModel';
import {checkHardwareClashes} from '../src/components/hardwareClashes';
import {createHardwareBuilder,horizontalPlateGeometry} from '../src/components/connectionDetails';
import {filletWeld,stiffenerWelds} from '../src/components/weldGeometry';
import {buildRunwaySteel} from '../src/components/runwaySteelGeometry';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {connectionCoordination} from '../src/engine/connectionCoordination';
const material=new THREE.MeshBasicMaterial(),edge=new THREE.LineBasicMaterial();
function fixture(hole:boolean){const g=new THREE.Group(),t=.0254;const plate=new THREE.Mesh(horizontalPlateGeometry(.2,.2,t,hole?[{x:0,z:0,diameter:.022}]:[]),material);plate.position.y=t/2;plate.name='plate';g.add(plate);createHardwareBuilder(material).bolt(g,{id:'bolt',family:'Test bolt',description:'',diameter:.01905,grip:t},new THREE.Vector3());return g;}
describe('hardware solid-intersection review',()=>{
 it('accepts a shank through a real hole and washers touching faying faces',()=>{expect(checkHardwareClashes(fixture(true)).issues).toHaveLength(0);});
 it('finds the same shank through undrilled steel',()=>{const r=checkHardwareClashes(fixture(false));expect(r.issues).toHaveLength(1);expect(r.issues[0].b).toBe('plate');expect(r.issues[0].reference).toBe(false);expect(r.issues[0].overlapMm).toBeCloseTo(25.4,2);});
 it('detects a nut striking a separate obstruction and handles mirrored models',()=>{
  const g=fixture(true),block=new THREE.Mesh(new THREE.BoxGeometry(.08,.008,.08),material);block.name='obstruction';block.position.y=-.010;g.add(block);
  const a=checkHardwareClashes(g);expect(a.issues.some(v=>v.b==='obstruction')).toBe(true);
  g.scale.z=-1;g.position.z=-12;const b=checkHardwareClashes(g);expect(b.issues.map(v=>[v.a,v.b,v.overlapMm])).toEqual(a.issues.map(v=>[v.a,v.b,v.overlapMm]));
 });
 it('detects distinct fasteners colliding without counting their internal components',()=>{
  const g=fixture(true);createHardwareBuilder(material).bolt(g,{id:'bolt-2',family:'Test bolt',description:'',diameter:.01905,grip:.0254},new THREE.Vector3(.01,0,0));
  expect(checkHardwareClashes(g).issues.some(v=>v.a==='bolt'&&v.b==='bolt-2')).toBe(true);
 });
 it('preserves world transforms and holes in the background scan model',()=>{const g=fixture(false);g.scale.z=-1;g.position.set(5,2,-12);const a=checkHardwareClashes(g),b=checkHardwareClashes(restoreHardwareAuditModel(hardwareAuditModel(g)));expect(b.issues).toEqual(a.issues);});
 it('excludes and identifies schematic wheel hardware rather than issuing fake clashes',()=>{
  const g=new THREE.Group();createHardwareBuilder(material).bolt(g,{id:'WH-1',family:'Wheel hub bolt',description:''},new THREE.Vector3());
  const r=checkHardwareClashes(g);expect(r.hardware).toBe(0);expect(r.excludedHardware).toEqual(['WH-1']);
 });
});
describe('specified weld geometry and coordination',()=>{
 it('draws a triangular fillet to its actual leg, length and volume',()=>{
  const g=new THREE.Group(),w=filletWeld(g,'w',new THREE.Vector3(),new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),.01,material,'test')!;
  const box=new THREE.Box3().setFromObject(w);expect(box.max.x).toBeCloseTo(.01,7);expect(box.max.y).toBeCloseTo(.01,7);expect(box.max.z).toBe(1);expect(w.userData.part.weld.size).toBe(.01);
  const p=w.geometry.getAttribute('position'),idx=w.geometry.index!;let volume=0;for(let i=0;i<idx.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,idx.getX(i)),b=new THREE.Vector3().fromBufferAttribute(p,idx.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(p,idx.getX(i+2));volume+=a.dot(b.cross(c))/6;}expect(Math.abs(volume)).toBeCloseTo(.00005,8);
 });
 it('keeps fitted bottom ends unwelded for the capped CJP template and clears corner copes',()=>{
  const g=new THREE.Group();stiffenerWelds(g,'test',0,.6,.02,.01,.12,.02,.025,.008,true,material);
  expect(g.children).toHaveLength(6);expect(g.children.filter(x=>x.name.includes('cjp'))).toHaveLength(2);
  const web=g.children.find(x=>x.name.includes('web-weld'))!,bounds=new THREE.Box3().setFromObject(web);expect(bounds.min.y).toBeCloseTo(-.255,6);expect(bounds.max.y).toBeCloseTo(.255,6);
 });
 it('stops cap welds at independent girder ends and reports the actual input conflict',()=>{
  const p=cappedDemonstrationProject(),g=buildRunwaySteel(p,{steel:material,cap:material,rail:material,weld:material,edge}),w=g.children.filter(x=>x.userData.part?.weld);
  expect(w).toHaveLength(6);const a=new THREE.Box3().setFromObject(w[0]),b=new THREE.Box3().setFromObject(w[2]);expect((b.min.x-a.max.x)*1000).toBeCloseTo(p.details!.simpleSupport!.endGap,2);
  expect(connectionCoordination(p)).toHaveLength(0);
  // Keep the original clashing geometry as a regression, not the revised demo.
  p.details!.brace.flangeAttachment=undefined;p.details!.brace.length=24*25.4;
  expect(connectionCoordination(p)).toHaveLength(1);p.details!.brace.length=200;expect(connectionCoordination(p)).toHaveLength(0);
 });
});

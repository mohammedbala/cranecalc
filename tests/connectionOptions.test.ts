import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {calculate,validateProject,fingerprint} from '../src/engine/calculate';
import {projectSchema} from '../src/engine/types';
import {connectionOptionChecks,validateConnectionOptions,defaultReferenceTie,bracketModelDepth} from '../src/engine/connectionOptions';
import {buildWeldedBrackets} from '../src/components/weldedBracketGeometry';
import {buildAlternativeTies} from '../src/components/alternativeTieGeometry';
import {aiscShapeByName} from '../src/data/aiscSections';
import {drawingSheetSet} from '../src/components/planSheet';
import {detailedDrawings} from '../src/components/detailedDrawings';
import {flangeTieGeometry} from '../src/engine/tieGeometry';

const material=new THREE.MeshBasicMaterial(),edge=new THREE.LineBasicMaterial();
function volume(g:THREE.BufferGeometry){const geometry=g.index?g.toNonIndexed():g,a=geometry.getAttribute('position');let sum=0;for(let i=0;i<a.count;i+=3){const x=new THREE.Vector3().fromBufferAttribute(a,i),y=new THREE.Vector3().fromBufferAttribute(a,i+1),z=new THREE.Vector3().fromBufferAttribute(a,i+2);sum+=x.dot(y.cross(z))/6;}return Math.abs(sum);}
describe('connection arrangement library and design boundaries',()=>{
 it('keeps legacy input valid and its existing component model selected',()=>{
  const p=cappedDemonstrationProject();expect(validateProject(p)).toEqual([]);expect(connectionOptionChecks(p)).toEqual([]);expect(flangeTieGeometry(p)).toBeDefined();
 });
 it('round-trips selection and editable dimensions through the server schema',()=>{
  const p=cappedDemonstrationProject(),previous=fingerprint(p);p.details!.bracket!.arrangement='haunched-seat';p.details!.bracket!.tipDepth=127;p.details!.brace.arrangement='bearing-link';p.details!.brace.referenceDetail={...defaultReferenceTie,pinDiameter:31.75};
  const restored=projectSchema.parse(JSON.parse(JSON.stringify(p)));expect(restored.details!.bracket!.tipDepth).toBe(127);expect(restored.details!.brace.referenceDetail!.pinDiameter).toBe(31.75);expect(fingerprint(p)).not.toBe(previous);expect(validateProject(restored)).toEqual([]);
 });
 it.each(['haunched-seat','rolled-corbel'] as const)('does not assign twin-rib resistance to %s',kind=>{
  const p=cappedDemonstrationProject();p.details!.bracket!.arrangement=kind;
  const s=calculate(p);expect(s.errors).toEqual([]);expect(s.eligible).toBe(false);expect(s.detailResults).toBeUndefined();
  expect(s.checks.find(c=>c.id==='option-bracket-model')).toMatchObject({status:'unsupported'});expect(s.checks.find(c=>c.id==='option-bracket-model')?.capacity).toBeUndefined();expect(s.checks.some(c=>c.id==='bracket-rib-flexure')).toBe(false);
 },60000);
 it.each(['flexible-plate','bearing-link','paired-links'] as const)('does not inherit flat-bar stiffness or fatigue for %s',kind=>{
  const p=cappedDemonstrationProject();p.details!.brace.arrangement=kind;const s=calculate(p);
  expect(s.errors).toEqual([]);expect(s.eligible).toBe(false);expect(s.checks.some(c=>c.id==='brace-member'||c.id==='tie-weld-fatigue')).toBe(false);expect(s.checks.find(c=>c.id==='option-tie-model')).toMatchObject({status:'unsupported'});expect(flangeTieGeometry(p)).toBeUndefined();
  p.scope='analysis';expect(calculate(p).eligible).toBe(false);
 });
 it('rejects unknown selections, nonexistent shapes and incompatible double links',()=>{
  const p=cappedDemonstrationProject();expect(projectSchema.safeParse({...p,details:{...p.details,brace:{...p.details!.brace,arrangement:'rated-link'}}}).success).toBe(false);
  p.details!.bracket!.arrangement='rolled-corbel';p.details!.bracket!.corbelShape='W999X999';expect(validateConnectionOptions(p).join(' ')).toContain('valid AISC');
  p.details!.bracket!.arrangement='twin-rib';p.details!.brace.arrangement='paired-links';p.system='continuous';expect(validateConnectionOptions(p).join(' ')).toContain('separate simple-span');
 });
 it('rejects tapered ribs deeper at the tip and eyes without pin material',()=>{
  const p=cappedDemonstrationProject(),b=p.details!.bracket!;b.arrangement='haunched-seat';b.tipDepth=b.ribDepth+1;expect(validateConnectionOptions(p).join(' ')).toContain('tip depth');
  b.tipDepth=b.ribDepth/4;p.details!.brace.arrangement='bearing-link';p.details!.brace.referenceDetail={...defaultReferenceTie,eyeDiameter:30,pinDiameter:25.4};expect(validateConnectionOptions(p).join(' ')).toContain('radial material');
 });
 it('validates the selected tie geometry without applying inactive bolt or bearing dimensions',()=>{
  const p=cappedDemonstrationProject();p.details!.brace.arrangement='flexible-plate';p.details!.brace.referenceDetail={...defaultReferenceTie,eyeDiameter:30,pinDiameter:25.4,linkDiameter:60,eyeThickness:3000,forkThickness:3000};
  p.details!.brace.connection.gauge=1000;expect(validateProject(p)).toEqual([]);
  p.details!.brace.referenceDetail.plateWidth=p.section.d;expect(validateConnectionOptions(p).join(' ')).toContain('assemblies overlap');
  p.details!.brace.arrangement='paired-links';p.details!.brace.referenceDetail={...defaultReferenceTie,linkSpacing:114.3};expect(validateConnectionOptions(p).join(' ')).toContain('retaining collars');
  p.details!.brace.referenceDetail.linkSpacing=127;expect(validateConnectionOptions(p)).toEqual([]);
 });
 it('builds actual tapered ribs with the exact trapezoid volume',()=>{
  const b=cappedDemonstrationProject().details!.bracket!;b.arrangement='haunched-seat';b.tipDepth=127;
  const group=buildWeldedBrackets(b,[0],0,material,edge),rib=group.getObjectByName('WB-S1-rib-1') as THREE.Mesh;
  expect(volume(rib.geometry)).toBeCloseTo((b.ribDepth+b.tipDepth)/2*b.seatProjection*b.ribThickness/1e9,9);expect(group.userData.designedBracket).toBe(false);
 });
 it('uses the selected AISC W dimensions for corbel flanges and web',()=>{
  const b=cappedDemonstrationProject().details!.bracket!;b.arrangement='rolled-corbel';b.corbelShape='W12X40';const shape=aiscShapeByName(b.corbelShape)!;
  const group=buildWeldedBrackets(b,[0],0,material,edge),web=group.getObjectByName('WB-S1-corbel-web') as THREE.Mesh;
  web.geometry.computeBoundingBox();const size=web.geometry.boundingBox!.getSize(new THREE.Vector3());expect(size.x).toBeCloseTo(shape.tw*.0254,7);expect(size.y).toBeCloseTo((shape.d-2*shape.tf)*.0254,7);expect(bracketModelDepth(b)).toBeCloseTo(shape.d*25.4,7);expect(group.getObjectByName('WB-S1-rib-1')).toBeUndefined();
 });
 it('builds bearing eyes with open bores, separate pins and shared receivers',()=>{
  const p=cappedDemonstrationProject();p.details!.brace.arrangement='paired-links';const group=buildAlternativeTies(p,p.details!.bracket!.reach/1000,material,edge);
  const parts:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh)parts.push(o);});
  expect(parts.filter(o=>o.userData.part?.family==='Articulated link body (reference)')).toHaveLength(12);
  expect(parts.filter(o=>o.userData.part?.family==='Shared column tieback plate (reference)')).toHaveLength(8);
  const eye=parts.find(o=>o.userData.part?.family==='Bearing eye (reference)')!;eye.updateMatrixWorld(true);const point=eye.getWorldPosition(new THREE.Vector3()),ray=new THREE.Raycaster(point.clone().add(new THREE.Vector3(-1,0,0)),new THREE.Vector3(1,0,0));
  expect(ray.intersectObject(eye,false)).toHaveLength(0);expect(parts.some(o=>o.userData.part?.family==='Clevis pin (reference)')).toBe(true);
  const clevis=parts.find(o=>o.userData.part?.family==='Drilled clevis plate (reference)')!;clevis.updateMatrixWorld(true);
  const holeAxis=new THREE.Vector3(0,1,0).transformDirection(clevis.matrixWorld),holeCenter=clevis.getWorldPosition(new THREE.Vector3());
  expect(new THREE.Raycaster(holeCenter.clone().addScaledVector(holeAxis,-1),holeAxis).intersectObject(clevis,false)).toHaveLength(0);
 });
 it('replaces stale fabrication sheets with a selected-geometry reference sheet',()=>{
  const p=cappedDemonstrationProject();p.details!.bracket!.arrangement='haunched-seat';p.details!.brace.arrangement='bearing-link';const s=calculate(p),sheets=drawingSheetSet(s);
  expect(sheets).toHaveLength(1);expect(sheets[0].svg).toContain('WELDED HAUNCHED SEAT');expect(sheets[0].svg).toContain('SINGLE ARTICULATED BEARING LINK');expect(sheets[0].svg).toContain('NOT FOR FABRICATION');expect(sheets[0].svg).toContain('VARIABLE-DEPTH RIB STABILITY');expect(sheets[0].svg).not.toMatch(/NaN|Infinity|\[object Object\]/);expect(detailedDrawings(s)).toEqual([]);
 });
});

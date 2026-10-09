import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {projectSchema,type CalculationSnapshot} from '../src/engine/types';
import {calculate,validateProject,fingerprint} from '../src/engine/calculate';
import {tieOptions,selectTieArrangement,validateConnectionOptions,defaultReferenceTie} from '../src/engine/connectionOptions';
import {angleTie} from '../src/engine/angleTie';
import {aiscAngles,aiscAngleByName} from '../src/data/aiscAngles';
import {buildAlternativeTies} from '../src/components/alternativeTieGeometry';
import {angleMemberGeometry} from '../src/components/angleTieGeometry';
import {connectionConceptSheetSvg} from '../src/components/connectionConceptSheet';
import {drawingSheetSet} from '../src/components/planSheet';
import {detailedDrawings} from '../src/components/detailedDrawings';
import ConnectionOptions from '../src/components/ConnectionOptions';

function project(kind:'single-angle'|'double-angle'='single-angle'){
 const p=cappedDemonstrationProject();p.units='US';p.details=selectTieArrangement(p.details!,kind);p.details.brace[kind==='double-angle'?'doubleAngle':'singleAngle']!.connectionStyle='gusseted';return p;
}
const snapshot=(input=project()):CalculationSnapshot=>({input,revision:'angle-review',createdAt:'2026-10-09',errors:[],warnings:[],properties:null,analysis:null,checks:[],eligible:false,referenceVersion:''});
const volume=(g:THREE.BufferGeometry)=>{const a=(g.index?g.toNonIndexed():g).getAttribute('position');let total=0;for(let i=0;i<a.count;i+=3)total+=new THREE.Vector3().fromBufferAttribute(a,i).dot(new THREE.Vector3().fromBufferAttribute(a,i+1).cross(new THREE.Vector3().fromBufferAttribute(a,i+2)))/6;return Math.abs(total);};

describe('angle tieback selection and geometry',()=>{
 it('loads pinned catalogue dimensions and keeps all six tieback families available',()=>{
  expect(aiscAngles).toHaveLength(137);expect(aiscAngleByName('L3X3X1/4')).toMatchObject({row:537,d:3,b:3,t:.25,weight:4.9});
  expect(tieOptions.map(o=>o.id)).toEqual(['paired-bars','single-angle','double-angle','flexible-plate','bearing-link','paired-links']);
  expect(angleTie(project().details!)).toMatchObject({depth:expect.closeTo(76.2,8),leg:expect.closeTo(76.2,8),thickness:6.35,paired:false});
 });
 it('round-trips both angle profiles and restores each without changing brackets or loads',()=>{
  const p=project(),bracket=structuredClone(p.details!.bracket),cranes=structuredClone(p.cranes),original=fingerprint(p);
  p.details!.brace.singleAngle!.lap=40;p.details!.brace.singleAngle!.shape='L3X3X3/8';
  p.details=selectTieArrangement(p.details!,'double-angle');p.details!.brace.doubleAngle!.lap=45;
  p.details=selectTieArrangement(p.details!,'flexible-plate');p.details!.brace.referenceDetail!.plateThickness=8;
  p.details=selectTieArrangement(p.details!,'single-angle');expect(angleTie(p.details!).lap).toBe(40);expect(angleTie(p.details!).shape!.name).toBe('L3X3X3/8');
  p.details=selectTieArrangement(p.details!,'double-angle');expect(angleTie(p.details!).lap).toBe(45);
  expect(p.details!.bracket).toEqual(bracket);expect(p.cranes).toEqual(cranes);expect(fingerprint(p)).not.toBe(original);
  const restored=projectSchema.parse(JSON.parse(JSON.stringify(p)));expect(restored.details!.brace).toEqual(p.details!.brace);expect(validateProject(restored)).toEqual([]);
 });
 it.each(['single-angle','double-angle'] as const)('validates active dimensions only for %s and blocks inherited capacity',kind=>{
  const p=project(kind);p.details!.brace.referenceDetail={...defaultReferenceTie,eyeDiameter:30,pinDiameter:2000};p.details!.brace.connection.gauge=1000;
  expect(validateProject(p)).toEqual([]);const s=calculate(p);expect(s.errors).toEqual([]);expect(s.eligible).toBe(false);expect(s.detailResults).toBeUndefined();
  expect(s.checks.find(v=>v.id==='option-tie-model')).toMatchObject({status:'unsupported',referenceIds:['connection-options','angle-tie-basis']});expect(s.checks.some(v=>v.id==='brace-member')).toBe(false);
  p.scope='analysis';expect(calculate(p).eligible).toBe(false);
 });
 it('rejects unknown sections, excessive laps, overlapping ties and oversized column attachments',()=>{
  const p=project(),a=p.details!.brace.singleAngle!;a.shape='L999X999X9';expect(validateConnectionOptions(p).join()).toContain('valid AISC L-section');
  a.shape='L3X3X1/4';a.lap=200;expect(validateConnectionOptions(p).join()).toContain('attachment lap');
  a.lap=50.8;a.shape='L12X12X1-3/8';expect(validateConnectionOptions(p).join()).toContain('angle assemblies overlap');expect(validateConnectionOptions(p).join()).toContain('receiving column flange');expect(validateConnectionOptions(p).join()).toContain('adjacent angle ties');
  a.shape='L3X3X1/4';a.weldSize=8;expect(validateConnectionOptions(p).join()).toContain('weld leg');
 });
 it('uses true mirrored L solids without double-counting the heel',()=>{
  for(const sign of [-1,1]){const g=angleMemberGeometry(.0762,.0508,.00635,.3,sign);expect(volume(g)).toBeCloseTo((.0762+.0508-.00635)*.00635*.3,10);g.computeBoundingBox();expect(g.boundingBox!.getSize(new THREE.Vector3()).toArray()).toEqual(expect.arrayContaining([expect.closeTo(.0508,7),expect.closeTo(.0762,7),expect.closeTo(.3,7)]));}
 });
 it.each(['single-angle','double-angle'] as const)('builds %s at every separate girder end with matching attachment welds',kind=>{
  const p=project(kind),g=buildAlternativeTies(p,p.details!.bracket!.reach/1000,new THREE.MeshBasicMaterial(),new THREE.LineBasicMaterial()),parts:THREE.Mesh[]=[];g.traverse(o=>{if(o instanceof THREE.Mesh)parts.push(o);});
  const count=kind==='single-angle'?12:24,angles=parts.filter(o=>o.userData.part?.family==='L-section tieback (reference)');expect(angles).toHaveLength(count);expect(parts.filter(o=>o.userData.part?.weld)).toHaveLength(count*4);expect(parts.filter(o=>o.userData.part?.family==='Column angle receiver (reference)')).toHaveLength(12);
  expect(parts.some(o=>/Clevis|Bearing eye/.test(o.userData.part?.family??''))).toBe(false);expect(parts.every(o=>o.userData.part?.support)).toBe(true);
  const a=angleTie(p.details!);for(const m of angles){m.geometry.computeBoundingBox();const size=m.geometry.boundingBox!.getSize(new THREE.Vector3());expect(size.y).toBeCloseTo(a.depth/1000,7);expect(size.z).toBeCloseTo((p.details!.bracket!.reach-p.section.bf/2-2*a.setback)/1000,7);}
  // Outer top gussets and angles pass below the downturned cap leg.
  const capBottom=(p.section.d/2-p.section.capDepth+p.section.capTw)/1000;
  for(const m of parts.filter(v=>v.name.includes('-top-')&&(v.name.endsWith('-girder-lap')||v.userData.part?.family==='L-section tieback (reference)'))){expect(new THREE.Box3().setFromObject(m).max.y).toBeLessThan(capBottom-.02);}
  p.system='continuous';expect(validateConnectionOptions(p)).toEqual([]);
 });
 it('offers an imperial AISC selector and angle inputs without unrelated pin inputs',()=>{
  const p=project(),html=renderToStaticMarkup(createElement(ConnectionOptions,{value:p.details!,onChange:()=>{},numeric:(label:string)=>label,system:p.system,units:p.units}));
  expect(html).toContain('AISC tie angle');expect(html).toContain('Single-angle tie geometry');expect(html).toContain('4.9 lb/ft each');expect(html).toContain('Angle attachment lap');expect(html).not.toContain('End pin / attachment setback');expect(html).not.toContain('Bearing eye diameter');
 });
 it('projects the selected angles onto the reference drawing with source and field attachment callouts',()=>{
  const s=snapshot(project('double-angle')),svg=connectionConceptSheetSvg(s);expect(svg).toContain('DOUBLE-ANGLE TIEBACK / PLAN');expect(svg).toContain('2 - L2-1/2X2-1/2X1/4');expect(svg).toContain('AISC SHAPES DATABASE V16.0');expect(svg).toContain('FIELD WELD TO EXISTING COLUMN');expect(svg).toContain('SIZE / EXTENT BY CONNECTION DESIGN');expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  expect(drawingSheetSet(s)).toHaveLength(1);expect(detailedDrawings(s)).toEqual([]);
 });
});

import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {projectSchema,type CalculationSnapshot} from '../src/engine/types';
import {selectTieArrangement,validateConnectionOptions,connectionOptionChecks,connectionHardwareAuditSupported} from '../src/engine/connectionOptions';
import {angleTie,topFlangeAngleData} from '../src/engine/angleTie';
import {buildAlternativeTies} from '../src/components/alternativeTieGeometry';
import {topFlangeAngleColumnHoles} from '../src/components/topFlangeAngleGeometry';
import {horizontalPlateGeometry,createHardwareBuilder} from '../src/components/connectionDetails';
import {buildReferenceFraming} from '../src/components/referenceFraming';
import {buildRunwaySteel} from '../src/components/runwaySteelGeometry';
import {referenceColumns,referenceCrossheads} from '../src/data/aiscReferenceShapes';
import {checkHardwareClashes} from '../src/components/hardwareClashes';
import {connectionConceptSheetSvg} from '../src/components/connectionConceptSheet';
import AngleTieInputs from '../src/components/AngleTieInputs';

const project=(kind:'single-angle'|'double-angle'='single-angle')=>{const p=cappedDemonstrationProject();p.units='US';p.details=selectTieArrangement(p.details!,kind);return p;};
const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),edge=new THREE.LineBasicMaterial();
describe('slotted top-flange column angles',()=>{
 it('retains old gusset geometry and restores independently saved top-flange inputs',()=>{
  const p=project(),input=p.details!.brace.singleAngle!;expect(angleTie(p.details!).connectionStyle).toBe('top-flange-angle');
  input.topFlange={...angleTie(p.details!).topFlange,shimThickness:9.525};input.connectionStyle='gusseted';
  expect(angleTie(p.details!).shape?.name).toBe('L3X3X1/4');delete input.connectionStyle;
  expect(angleTie(p.details!).connectionStyle).toBe('gusseted');
  input.connectionStyle='top-flange-angle';expect(angleTie(projectSchema.parse(p).details!).topFlange.shimThickness).toBe(9.525);
 });
 it('cuts real capsule slots rather than drawing slot outlines over solid steel',()=>{
  const geometry=horizontalPlateGeometry(.2,.1,.01,[{x:0,z:0,diameter:.02,slotLength:.06,slotAxis:'x'}]),mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld();
  const ray=(x:number,z=0)=>new THREE.Raycaster(new THREE.Vector3(x,.1,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length;
  expect(ray(0)).toBe(0);expect(ray(.025)).toBe(0);expect(ray(.035)).toBeGreaterThan(0);expect(ray(0,.015)).toBeGreaterThan(0);
  expect(geometry.userData.plateHoles[0].slotAxis).toBe('x');
 });
 it.each(['single-angle','double-angle'] as const)('places %s only at the top flange with nuts, washers, threads and shim packs',kind=>{
  const p=project(kind),a=topFlangeAngleData(p)!,g=buildAlternativeTies(p,.508,material,edge,material,createHardwareBuilder(material)),parts:THREE.Mesh[]=[];g.traverse(o=>{if(o instanceof THREE.Mesh)parts.push(o);});
  expect(validateConnectionOptions(p)).toEqual([]);
  expect(parts.filter(m=>m.userData.part?.family==='Slotted column angle leg (reference)')).toHaveLength(kind==='single-angle'?6:12);
  expect(parts.filter(m=>m.userData.part?.diameter)).toHaveLength(kind==='single-angle'?24:36);
  expect(parts.some(m=>m.name.includes('-bottom-'))).toBe(false);
  expect(parts.filter(m=>m.userData.part?.diameter).every(m=>m.userData.part.components.includes('helical threads'))).toBe(true);
  expect(parts.filter(m=>m.userData.part?.weld).every(m=>m.userData.part.weld.location!=='field')).toBe(true);
  expect(parts.filter(m=>m.userData.part?.family==='Top cap tie plate (reference)').every(m=>Math.abs(new THREE.Box3().setFromObject(m).min.y-a.top/1000)<1e-6)).toBe(true);
  expect(topFlangeAngleColumnHoles(p)).toHaveLength(kind==='single-angle'?12:24);
  p.system='continuous';expect(topFlangeAngleColumnHoles(p)).toHaveLength(kind==='single-angle'?8:16);
  // A centerline bolt would hit the receiving column web in continuous framing.
  expect(validateConnectionOptions(p)).toEqual([]);
 });
 it('rejects lost slot ligament, hardware crowding and rail interference',()=>{
  const p=project(),a=angleTie(p.details!).topFlange;p.details!.brace.singleAngle!.topFlange={...a,slotLength:101.6};
  expect(validateConnectionOptions(p).join()).toContain('clear material');
  p.details!.brace.singleAngle!.topFlange={...a,shape:'L2X2X1/4'};expect(validateConnectionOptions(p).join()).toContain('clear the column bolt heads');
  p.details!.brace.singleAngle!.topFlange={...a,lap:127};expect(validateConnectionOptions(p).join()).toContain('clear the rail');
 });
 it.each(['single-angle','double-angle'] as const)('clears installed hardware for %s, including real receiving-column holes',kind=>{
  const p=project(kind),L=p.spans.reduce((a,b)=>a+b,0)/1000,supports=[-L/2];let x=-L/2;for(const span of p.spans)supports.push(x+=span/1000);
  const hardware=createHardwareBuilder(material),g=new THREE.Group();
  const framing=buildReferenceFraming({supports,girderDepth:p.section.d/1000,girderWidth:p.section.bf/1000,columnHeight:4,column:referenceColumns[0],crosshead:referenceCrossheads[0],bracket:p.details!.bracket,columnConnectionHoles:topFlangeAngleColumnHoles(p),frameStyle:'tapered',materials:{column:material,beam:material,plate:material,foundation:material,edge}});
  g.add(framing.group,buildAlternativeTies(p,framing.columnFace,material,edge,material,hardware),buildRunwaySteel(p,{steel:material,cap:material,rail:material,weld:material,edge}));
  const audit=checkHardwareClashes(g);expect(audit.hardware).toBe(kind==='single-angle'?24:36);expect(audit.issues).toEqual([]);
 },30000);
 it('states the top-only load path, slot travel and pending design scope',()=>{
  const p=project(),html=renderToStaticMarkup(createElement(AngleTieInputs,{value:p.details!,onChange:()=>{},numeric:label=>label,units:'US'}));
  expect(html).toContain('Slotted top-flange angle');expect(html).toContain('No diaphragm or lower-flange tie');expect(html).toContain('nominal centered travel');
  const check=connectionOptionChecks(p).find(c=>c.id==='option-tie-model')!;expect(check.status).toBe('unsupported');expect(check.note).toContain('Lower-flange restraint is not provided');
  expect(connectionHardwareAuditSupported(p)).toBe(true);p.details!.brace.singleAngle!.connectionStyle='gusseted';expect(connectionHardwareAuditSupported(p)).toBe(false);
 });
 it('draws the bolted detail in plan and elevation without inventing a column weld',()=>{
  const p=project('double-angle'),s={input:p,revision:'top-angle',createdAt:'2026-10-09',errors:[],warnings:[],properties:null,analysis:null,checks:[],eligible:false,referenceVersion:''} as CalculationSnapshot;
  const svg=connectionConceptSheetSvg(s);expect(svg).toContain('TOP-FLANGE TIE / ELEVATION');expect(svg).toContain('HORIZONTAL SLOTS / X');expect(svg).toContain('SHIM PACK');expect(svg).toContain('BOLTED COLUMN ANGLE');expect(svg).toContain('NO LOWER-FLANGE TIE');expect(svg).not.toContain('SIZE / EXTENT BY CONNECTION DESIGN');expect(svg).not.toMatch(/NaN|Infinity|undefined/);
 });
});

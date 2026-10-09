import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {aiscShapeByName} from '../src/data/aiscSections';
import {bracketOptions,selectBracketArrangement,connectionOptionChecks} from '../src/engine/connectionOptions';
import {existingBracketProfile,selectExistingWideFlange,existingBracketSectionArea} from '../src/engine/bracketProfiles';
import {existingBracketResponse,validateExistingBracket} from '../src/engine/existingBracket';
import {projectSchema,type CalculationSnapshot} from '../src/engine/types';
import {calculate,validateProject} from '../src/engine/calculate';
import {withRunwaySpans} from '../src/engine/runwayGeometry';
import {buildWeldedBrackets} from '../src/components/weldedBracketGeometry';
import {createHardwareBuilder} from '../src/components/connectionDetails';
import {checkHardwareClashes} from '../src/components/hardwareClashes';
import {bracketSheetSvg} from '../src/components/bracketSheet';
import {connectionSheetSvg} from '../src/components/connectionSheet';
import {detailedDrawings} from '../src/components/detailedDrawings';
import {drawingSvg} from '../src/components/drafting';
import {compactReport} from '../server/compactReport';

function project(){const p=cappedDemonstrationProject();p.units='US';p.details=selectBracketArrangement(p.details!,'existing-w-corbel');return p;}

describe('selectable bracket library',()=>{
 it('keeps the RFP-style W bracket as one of five families, independent of the girder',()=>{
  expect(bracketOptions.map(v=>v.id)).toEqual(['twin-rib','haunched-seat','rolled-corbel','existing-w-corbel','existing-corbel']);
  const base=cappedDemonstrationProject(),p=project();expect(base.details!.bracket!.arrangement??'twin-rib').toBe('twin-rib');
  expect(p.section).toEqual(base.section);expect(p.details!.bracket!.wideFlange!.shape).toBe('W12X65');expect(validateProject(p)).toEqual([]);
  const parsed=projectSchema.parse(JSON.parse(JSON.stringify(p)));expect(parsed.details!.bracket!.wideFlange).toEqual(p.details!.bracket!.wideFlange);
 });
 it('restores independent built-up and W-section inputs across every family',()=>{
  let d=project().details!;d.bracket!.wideFlange!.projection=910;d.bracket!.wideFlange!.geometrySource='Survey W';
  d=selectBracketArrangement(d,'existing-corbel');d.bracket!.existing!.depth=530;d.bracket!.existing!.geometrySource='Survey plates';
  d=selectBracketArrangement(d,'rolled-corbel');d.bracket!.corbelShape='W12X50';
  d=selectBracketArrangement(d,'haunched-seat');d.bracket!.tipDepth=150;
  d=selectBracketArrangement(d,'twin-rib');d=selectBracketArrangement(d,'existing-w-corbel');
  expect(existingBracketProfile(d.bracket).projection).toBe(910);expect(existingBracketProfile(d.bracket).geometrySource).toBe('Survey W');
  d=selectBracketArrangement(d,'existing-corbel');expect(existingBracketProfile(d.bracket).depth).toBe(530);expect(existingBracketProfile(d.bracket).geometrySource).toBe('Survey plates');
  expect(d.bracket!.corbelShape).toBe('W12X50');expect(d.bracket!.tipDepth).toBe(150);
 });
 it('derives W dimensions and area from the catalogue and clears stale assessment on section change',()=>{
  let b=project().details!.bracket!;const raw=b.wideFlange!;
  raw.surveyConfirmed=true;raw.conditionConfirmed=true;raw.rating={...raw.rating,vertical:1e6,source:'Previous assessment',confirmed:true,contactConfirmed:true,method:'ASD'};
  expect(selectExistingWideFlange(b,'W12X65').wideFlange!.rating.confirmed).toBe(true);
  b=selectExistingWideFlange(b,'W12X72');b.wideFlange!.depth=9999;b.wideFlange!.width=9999;
  const e=existingBracketProfile(b),s=aiscShapeByName('W12X72')!;
  expect(e.depth).toBe(s.d*25.4);expect(e.width).toBe(s.bf*25.4);expect(e.flangeThickness).toBe(s.tf*25.4);expect(e.webThickness).toBe(s.tw*25.4);expect(existingBracketSectionArea(b)).toBe(s.A*25.4**2);
  expect(e.rating.vertical).toBe(0);expect(e.rating.source).toBe('');expect(e.rating.confirmed).toBe(false);expect(e.rating.contactConfirmed).toBe(false);expect(e.rating.method).toBe('ASD');expect(e.surveyConfirmed).toBe(false);expect(e.conditionConfirmed).toBe(false);
 });
 it('uses active W geometry for fit and seat demands; rejects an unknown section',()=>{
  const p=project(),load=[{vertical:20000,offset:0}],old=existingBracketResponse(p,load);
  p.details!.bracket=selectExistingWideFlange(p.details!.bracket!,'W14X90');
  const b=p.details!.bracket!,e=existingBracketProfile(b),r=existingBracketResponse(p,load),w=p.details!.bearing.width,a=p.details!.bearing.length;
  expect(r.seatStress).not.toBe(old.seatStress);expect(r.seatStress).toBeCloseTo(6*20000*(2*e.width-a)/8/(w*b.seatThickness**2),8);
  b.wideFlange!.shape='W8X10';expect(validateExistingBracket(p).join()).toContain('edge distances must fit');
  b.wideFlange!.shape='W999X999';expect(validateExistingBracket(p).join()).toContain('valid AISC W-section');
 });
 it('routes the W type to catalogue-sized existing steel with real holes and clear hardware',()=>{
  const b=project().details!.bracket!,s=aiscShapeByName(b.wideFlange!.shape)!,material=new THREE.MeshBasicMaterial(),edge=new THREE.LineBasicMaterial(),hardware=createHardwareBuilder(material);
  const g=buildWeldedBrackets(b,[0],0,material,edge,undefined,material,hardware);g.updateMatrixWorld(true);
  const web=g.getObjectByName('EB-S1-web') as THREE.Mesh;web.geometry.computeBoundingBox();const size=web.geometry.boundingBox!.getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(s.tw*.0254,7);expect(size.y).toBeCloseTo((s.d-2*s.tf)*.0254,7);expect(web.userData.existingSteel).toBe(true);expect(web.userData.part.description).toContain('W12X65');
  expect(g.getObjectByName('WB-S1-rib-1')).toBeUndefined();expect(hardware.count).toBe(4);
  for(const id of ['EB-S1-new-seat','EB-S1-top-flange']){const m=g.getObjectByName(id) as THREE.Mesh;for(const h of m.geometry.userData.plateHoles){const c=new THREE.Vector3(h.x,0,h.z).applyMatrix4(m.matrixWorld);expect(new THREE.Raycaster(c.clone().add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,-1,0)).intersectObject(m,false)).toHaveLength(0);}}
  expect(checkHardwareClashes(g).issues).toEqual([]);
 });
 it('carries the selected bracket section into engineering sheets and CAD labels',()=>{
  const s:CalculationSnapshot={input:project(),revision:'bracket-library-review',createdAt:'2026-10-09',checks:[],properties:null,analysis:null,errors:[],warnings:[],referenceVersion:'test',eligible:false};
  for(const svg of [bracketSheetSvg(s),connectionSheetSvg(s),drawingSvg(detailedDrawings(s).find(v=>v.name==='existing-column-bracket')!)]){
   expect(svg).toContain('W12X65 WIDE-FLANGE BRACKET');expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  }
  expect(bracketSheetSvg(s)).toContain('36 X 24 IN');
 });
 it('runs the new seat workflow while preserving assessment gates and alternative-type exclusions',()=>{
  const p=withRunwaySpans(project(),[7620]);p.details!.fatigueDetails=p.details!.fatigueDetails.filter(v=>v.x<=7620);
  const s=calculate(p);expect(s.errors).toEqual([]);expect(s.detailResults?.existingBracket).toBeDefined();expect(s.detailResults?.bracket).toBeUndefined();expect(s.checks.find(v=>v.id==='existing-assessment')?.status).toBe('unverified');expect(s.checks.find(v=>v.id==='existing-seat-flexure')?.capacity).toBeGreaterThan(0);expect(s.eligible).toBe(false);
  expect(compactReport(s,'')).toContain('W12X65 WIDE-FLANGE BRACKET');
  for(const kind of ['haunched-seat','rolled-corbel'] as const){p.details=selectBracketArrangement(p.details!,kind);expect(connectionOptionChecks(p).find(v=>v.id==='option-bracket-model')?.status).toBe('unsupported');}
 },120000);
});

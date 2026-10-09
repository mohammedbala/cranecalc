import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {defaultExistingBracket} from '../src/engine/existingBracketInputs';
import {withSiUnits} from '../src/engine/units';
import {validateProject,calculate} from '../src/engine/calculate';
import {projectSchema,type CalculationSnapshot} from '../src/engine/types';
import {connectionOptionChecks} from '../src/engine/connectionOptions';
import {existingBracketResponse,createExistingBracketCollector,existingBracketChecks,validateExistingBracket} from '../src/engine/existingBracket';
import {createBracketCollector} from '../src/engine/bracketDesign';
import {buildExistingBrackets} from '../src/components/existingBracketGeometry';
import {createHardwareBuilder} from '../src/components/connectionDetails';
import {checkHardwareClashes} from '../src/components/hardwareClashes';
import {bracketSheetSvg} from '../src/components/bracketSheet';
import {detailedDrawings} from '../src/components/detailedDrawings';
import {drawingSvg} from '../src/components/drafting';
import {flangeTieGeometry} from '../src/engine/tieGeometry';
import {withRunwaySpans} from '../src/engine/runwayGeometry';
import {compactReport} from '../server/compactReport';

function project(){const p=withSiUnits(cappedDemonstrationProject()),b=p.details!.bracket!;b.arrangement='existing-corbel';b.existing=structuredClone(defaultExistingBracket);b.seatProjection=Math.max(b.seatProjection,b.reach+b.existing.bolts.gauge/2+b.existing.bolts.edge);b.existing.projection=Math.max(b.existing.projection,b.seatProjection);return p;}
function snapshot():CalculationSnapshot {return {input:project(),revision:'existing-review',createdAt:'2026-10-09',checks:[],properties:null,analysis:null,errors:[],warnings:[],referenceVersion:'test',eligible:false};}

describe('existing bracket assessment and new seat',()=>{
 it('retains the girder and tie model without assigning twin-rib capacities',()=>{
  const p=project();expect(validateProject(p)).toEqual([]);expect(connectionOptionChecks(p)).toEqual([]);expect(createBracketCollector(p)).toBeUndefined();expect(flangeTieGeometry(p)).toBeDefined();
  const parsed=projectSchema.parse(JSON.parse(JSON.stringify(p)));expect(parsed.details!.bracket!.existing).toEqual(p.details!.bracket!.existing);
 });
 it('matches independent centered-patch strip bending and eccentric bracket statics',()=>{
  const p=project(),b=p.details!.bracket!,e=b.existing!,P=20000,a=p.details!.bearing.length,w=p.details!.bearing.width;
  const r=existingBracketResponse(p,[{vertical:P,offset:0}]),M=P*(2*e.width-a)/8;
  expect(r.vertical).toBe(P);expect(r.rootMoment).toBe(P*(b.reach+w/2));expect(r.seatMoment).toBe(0);expect(r.seatStress).toBeCloseTo(6*M/(w*b.seatThickness**2),9);
  const eccentric=existingBracketResponse(p,[{vertical:10000,offset:-160},{vertical:30000,offset:160}]);expect(eccentric.seatMoment).toBe(3200000);expect(eccentric.vertical).toBe(40000);
 });
 it('keeps capacity, condition, method, service and attachment data as explicit gates',()=>{
  const p=project(),c=createExistingBracketCollector(p)!;c.observe('strength','load',0,[{vertical:20000,offset:160}],-1);c.observe('service','service',0,[{vertical:12000,offset:160}],-1);c.observe('fatigue','fatigue',0,[{vertical:9000,offset:160}],0);
  let checks=existingBracketChecks(p,c.result);expect(checks.find(v=>v.id==='existing-vertical')?.status).toBe('unverified');expect(checks.find(v=>v.id==='existing-assessment')?.status).toBe('unverified');expect(checks.find(v=>v.id==='existing-seat-flexure')?.capacity).toBeGreaterThan(0);expect(c.result.fatigue[0].vertical).toBe(18000);
  const e=p.details!.bracket!.existing!;e.rating={...e.rating,vertical:100000,rootMoment:1e8,seatMoment:1e8,fatigueRange:100000,fatigueRootMoment:1e8,fatigueSeatMoment:1e8,cycles:1e9,source:'Unit test assessment, not project data',confirmed:true};
  checks=existingBracketChecks(p,c.result);expect(checks.find(v=>v.id==='existing-assessment')?.status).toBe('pass');expect(checks.find(v=>v.id==='existing-contact')?.status).toBe('unverified');expect(checks.find(v=>v.id==='existing-attachment')?.status).toBe('unverified');
  p.method='ASD';expect(existingBracketChecks(p,c.result).find(v=>v.id==='existing-assessment')?.status).toBe('unverified');
 });
 it('evaluates simultaneous interaction and fails overload and gravity uplift',()=>{
  const p=project(),e=p.details!.bracket!.existing!;Object.assign(e.rating,{vertical:10000,rootMoment:1e7,seatMoment:1e6});
  const c=createExistingBracketCollector(p)!;c.observe('strength','eccentric',0,[{vertical:25000,offset:180}],-1);c.observe('strength','uplift',0,[{vertical:-5000,offset:0}],-1);
  const checks=existingBracketChecks(p,c.result);expect(checks.find(v=>v.id==='existing-interaction')?.status).toBe('fail');expect(checks.find(v=>v.id==='existing-uplift')?.status).toBe('fail');expect(c.result.strength.interaction.caseId).toBe('eccentric');
  const row=c.result.stations[0];expect(row.vertical/10000+row.rootMoment/1e7+Math.abs(row.seatMoment)/1e6).toBeCloseTo(row.utilization,10);
 });
 it('rejects unsupportable plates and hardware trapped against the girder or web',()=>{
  const p=project(),e=p.details!.bracket!.existing!;e.bolts.gauge=150;expect(validateExistingBracket(p).join()).toContain('clearance outside');e.bolts.gauge=400;e.bolts.pitch=40;expect(validateExistingBracket(p).join()).toContain('clearance from');e.projection=100;expect(validateExistingBracket(p).join()).toContain('full transverse projection');
 });
 it('models a surveyed I-stub, six continuity plates, real aligned holes and four clear fasteners',()=>{
  const p=project(),b=p.details!.bracket!,material=new THREE.MeshBasicMaterial(),edge=new THREE.LineBasicMaterial(),hardware=createHardwareBuilder(material),g=buildExistingBrackets(b,[0],0,material,edge,undefined,hardware);g.updateMatrixWorld(true);
  expect(hardware.count).toBe(4);expect(g.getObjectByName('EB-S1-web')).toBeDefined();expect(g.getObjectByName('WB-S1-rib-1')).toBeUndefined();
  const plates:THREE.Object3D[]=[];g.traverse(o=>{if(o.userData.part?.family==='Existing column continuity plate')plates.push(o);});expect(plates).toHaveLength(6);
  for(const id of ['EB-S1-new-seat','EB-S1-top-flange']){const m=g.getObjectByName(id) as THREE.Mesh;for(const h of m.geometry.userData.plateHoles){const c=new THREE.Vector3(h.x,0,h.z).applyMatrix4(m.matrixWorld);expect(new THREE.Raycaster(c.clone().add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,-1,0)).intersectObject(m,false)).toHaveLength(0);}}
  expect(checkHardwareClashes(g).issues).toEqual([]);
 });
 it('shows the existing arrangement in ARCH D and CAD without new rib-root welds',()=>{
  const s=snapshot(),svg=bracketSheetSvg(s),cad=detailedDrawings(s).find(v=>v.name==='existing-column-bracket');
  expect(svg).toContain('EXISTING BUILT-UP I-BRACKET');expect(svg).toContain('NEW SPREADER');expect(svg).toContain('914.4 X 609.6 MM');expect(svg).not.toContain('FIELD WELD TO EXISTING COLUMN');expect(svg).not.toMatch(/NaN|Infinity|undefined/);expect(cad).toBeDefined();expect(drawingSvg(cad!)).toContain('EXISTING BUILT-UP I-BRACKET');expect(detailedDrawings(s).some(v=>v.name==='welded-column-bracket')).toBe(false);
 });
 it('runs complete girder and tie checks while missing existing assessments block export',()=>{
  const p=withRunwaySpans(project(),[7620]);p.details!.fatigueDetails=p.details!.fatigueDetails.filter(v=>v.x<=7620);
  const s=calculate(p);expect(s.errors).toEqual([]);expect(s.detailResults?.existingBracket).toBeDefined();expect(s.detailResults?.bracket).toBeUndefined();expect(s.checks.some(c=>c.id==='brace-member')).toBe(true);expect(s.checks.some(c=>c.id==='torsion-normal')).toBe(true);expect(s.checks.some(c=>c.id==='bracket-rib-flexure')).toBe(false);expect(s.eligible).toBe(false);
  // Exercise the report template without bypassing eligibility or inventing a
  // site assessment. The UI/server export gate still rejects this snapshot.
  const html=compactReport(s,'');
  expect(html).toContain('04B / Existing brackets and new bolted seats');
  expect(html).toContain('04D / Existing support and seat fatigue');
  expect(html).toContain('not calculated here');
  expect(html).toContain('unverified');
  expect(html).not.toContain('04B / Welded column bracket');
  expect(html).not.toMatch(/NaN|Infinity|undefined/);
 },120000);
});

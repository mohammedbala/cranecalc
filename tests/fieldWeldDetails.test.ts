import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {cappedDemonstrationProject,demonstrationProject} from '../src/engine/demonstration';
import type {CalculationSnapshot} from '../src/engine/types';
import {bracketSheetSvg} from '../src/components/bracketSheet';
import {flangeTieSheetSvg} from '../src/components/flangeTieSheet';
import {connectionSheetSvg} from '../src/components/connectionSheet';
import {connectionConceptSheetSvg} from '../src/components/connectionConceptSheet';
import {detailedDrawings} from '../src/components/detailedDrawings';
import {buildWeldedBrackets} from '../src/components/weldedBracketGeometry';
import {buildIndependentSupports} from '../src/components/independentSupportGeometry';
const snapshot=(input=cappedDemonstrationProject()):CalculationSnapshot=>({input,revision:'field-weld-review',createdAt:'2026-10-08',errors:[],warnings:[],properties:null,analysis:null,checks:[],eligible:false,referenceVersion:''});
const flags=(svg:string)=>(svg.match(/data-field-weld="true"/g)??[]).length;
describe('field welds to existing building steel',()=>{
 it('flags column attachments and preserves unflagged new-part weld symbols',()=>{
  const s=snapshot(),before=JSON.stringify(s.input),bracket=bracketSheetSvg(s),tie=flangeTieSheetSvg(s),generic=connectionSheetSvg(snapshot(demonstrationProject()));
  // The tie sheet flags the column root in the transverse section and in the plan.
  expect(flags(bracket)).toBe(1);expect(flags(tie)).toBe(2);expect(flags(generic)).toBe(1);
  for(const svg of [bracket,tie,generic])expect(svg).toContain('EXISTING');
  expect(bracket).toContain('SHOP WELD SEAT TO RIBS');expect(bracket).toContain('FIELD WELD TO EXISTING COLUMN');expect(tie).toContain('/ EACH GUSSET');
  expect(tie).toContain('LOCAL CHECKS: PENDING');expect(tie).not.toMatch(/NaN|Infinity/);
  expect(JSON.stringify(s.input)).toBe(before);
  const drawings=detailedDrawings(s);
  for(const name of ['welded-column-bracket','direct-flange-tie'])expect(drawings.find(d=>d.name===name)?.entities.some(e=>e.type==='text'&&e.text.includes('FIELD WELD')&&e.text.includes('EXISTING COLUMN'))).toBe(true);
 });
 it.each(['flexible-plate','bearing-link','paired-links'] as const)('shows unsized field intent for the reference %s without assigning a capacity',tie=>{
  const s=snapshot();s.input.details!.bracket!.arrangement='haunched-seat';s.input.details!.brace.arrangement=tie;
  const svg=connectionConceptSheetSvg(s);expect(flags(svg)).toBe(2);expect(svg).toContain('SIZE / EXTENT BY CONNECTION DESIGN');expect(svg).toContain('NOT FOR FABRICATION');expect(svg).not.toMatch(/NaN|Infinity|\[object Object\]/);
 });
 it('identifies field and shop welds in 3D without changing their entered sizes',()=>{
  const p=cappedDemonstrationProject(),b=p.details!.bracket!,steel=new THREE.MeshBasicMaterial(),edge=new THREE.LineBasicMaterial();
  for(const kind of ['twin-rib','haunched-seat','rolled-corbel'] as const){
   b.arrangement=kind;const group=buildWeldedBrackets(b,[0],0,steel,edge),welds:any[]=[];
   group.traverse(o=>{if(o.userData.part?.weld)welds.push(o.userData.part.weld);});
   const field=welds.filter(w=>w.location==='field');expect(field).toHaveLength(kind==='rolled-corbel'?6:4);
   expect(field.every(w=>w.existingSteel&&w.size===b.rootWeld/1000)).toBe(true);
   expect(welds.filter(w=>w.location==='shop').every(w=>w.size===b.seatWeld/1000)).toBe(true);
  }
  b.arrangement='twin-rib';const group=buildIndependentSupports(p,b.reach/1000,steel,edge),field:any[]=[];
  group.traverse(o=>{if(o.userData.part?.weld?.location==='field')field.push(o.userData.part);});
  // Top-flange ties only (bolted end bearings restrain the bottom flange): two root fillets at each of six girder ends.
  expect(field).toHaveLength(12);
  expect(field.every(v=>v.weld.size===p.details!.brace.connection.weldSize/1000&&v.weld.existingSteel)).toBe(true);
 });
});

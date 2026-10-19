import {describe,it,expect} from 'vitest';
import {defaultExistingColumn} from '../src/engine/existingColumnInputs';
import {existingColumnAnalysis,existingColumnChecks} from '../src/engine/existingColumn';
import {columnBaseActions} from '../src/engine/columnBase';
import {supportReactions} from '../src/engine/supportReactions';
import {sectionProperties} from '../src/engine/section';
import {acrossRunwaySeismic,seismicBasis} from '../src/engine/runwaySeismic';
import {craneColumnReactions,tiedToBuilding,type CraneColumnInput} from '../src/engine/craneColumnInputs';
import {craneColumnCalculation,craneColumnLayout,validateCraneColumn} from '../src/engine/craneColumn';
import {stepGeometry,steppedColumnCalculation,validateSteppedColumn} from '../src/engine/steppedColumn';
import {classifyCheck} from '../src/engine/checkTaxonomy';
import {buildProject,normalizeConfig} from '../src/engine/configurator';
import {defaultRunwayConfig} from '../src/engine/configInputs';
import {newColumnDemonstrationProject} from '../src/engine/demonstration';
import {aiscShapeByName} from '../src/data/aiscSections';
import {designProject} from './fixtures/aistProject';
import type {CalculationSnapshot,ProjectInput} from '../src/engine/types';

const kip=4448.221615,inch=25.4,foot=304.8;
const existingProject=()=>{const p=designProject();p.existingColumn={...structuredClone(defaultExistingColumn),enabled:true,confirmed:true,source:'Unit test'};p.existingColumn.existing.D={P:50*kip,Mx:0,My:0,V:0};return p;};
const building=():CraneColumnInput['building']=>({...structuredClone(defaultExistingColumn),enabled:true,height:30*foot,seatElevation:20*foot,source:'Unit test survey',confirmed:true});
const tie:CraneColumnInput['columnTie']={plate:{thickness:.75*inch,width:8*inch,Fy:345,Fu:448},bolts:{count:4,diameter:.875*inch,grade:'A325',pitch:3*inch,edge:1.5*inch},slot:{length:2.5*inch,width:15/16*inch}};
const plates=(shape:string)=>{const w=aiscShapeByName(shape)!;return {shape,d:w.d*inch,bf:w.bf*inch,tf:w.tf*inch,tw:w.tw*inch};};
/** A new W14X120 crane column on its cap, tied to an existing W14X90 at `offset`. */
function craneProject(offset:number){
 const p=newColumnDemonstrationProject(),c=p.existingColumn!;
 p.details!.bracket!.enabled=false;p.columnCap={enabled:true,plate:{length:26*inch,width:16*inch,thickness:1.5*inch},weld:5/16*inch,stiffener:{thickness:.75*inch,height:8*inch,weld:5/16*inch}};
 c.strong={base:'pinned',top:'braced'};
 p.craneColumn={enabled:true,offset,building:building(),columnTie:tie,base:'pinned',source:'Unit test'};
 return p;
}
const snapshotOf=(input:ProjectInput)=>({input,checks:[],errors:[],warnings:[]} as unknown as CalculationSnapshot);

describe('crane column tied to the building: contracts (WP-0)',()=>{
 it('removes the side thrust from the crane column and its base, and its seismic force across the runway',()=>{
  const p=existingProject(),r=supportReactions(p,sectionProperties(p.section));
  const free=existingColumnAnalysis(p,r);
  const q={...structuredClone(p),craneColumn:{enabled:true,offset:30*inch,building:building(),columnTie:tie,base:'pinned' as const,source:''}};
  expect(tiedToBuilding(p)).toBe(false);expect(tiedToBuilding(q)).toBe(true);
  const tied=existingColumnAnalysis(q,r);
  expect(free.crane.lateral).toBeGreaterThan(0);expect(tied.crane.lateral).toBe(0);
  expect(tied.drift.value).toBeLessThan(free.drift.value);
  expect(craneColumnReactions(q,r).supports.every(s=>s.Css===0)).toBe(true);expect(craneColumnReactions(p,r)).toBe(r);
  // The base: no side-thrust moment Mh on the tied crane column; the seismic basis across the runway goes to the building.
  const n=newColumnDemonstrationProject(),rn=supportReactions(n,sectionProperties(n.section)),nt={...structuredClone(n),craneColumn:q.craneColumn};
  const Mh=(x:ProjectInput)=>Math.max(...columnBaseActions(x,rn,x.method).flatMap(v=>v.actions).map(a=>a.Mh));
  expect(Mh(n)).toBeGreaterThan(0);expect(Mh(nt)).toBe(0);
  n.existingColumn!.seismic={...n.existingColumn!.seismic!,enabled:true};nt.existingColumn!.seismic={...n.existingColumn!.seismic};
  expect(acrossRunwaySeismic(n)).toEqual(seismicBasis(n));expect(acrossRunwaySeismic(nt)).toBeUndefined();expect(seismicBasis(nt)).toBeDefined();
 });
 it('prefixes and labels the column checks of a second column',()=>{
  const p=existingProject(),r=existingColumnAnalysis(p,supportReactions(p,sectionProperties(p.section)));
  const plain=existingColumnChecks(p,r),named=existingColumnChecks(p,r,{prefix:'building-',label:'Building column'});
  expect(named.map(c=>c.id)).toEqual(plain.map(c=>c.id.startsWith('column-')?`building-${c.id}`:c.id));
  expect(named.find(c=>c.id==='building-column-interaction')).toMatchObject({group:'Building column',status:plain.find(c=>c.id==='column-interaction')!.status});
  expect(named.find(c=>c.id==='building-column-axial')!.title).toMatch(/^Building column · /);
  // The taxonomy types each prefixed check as its unprefixed twin, none by the default rule.
  for(const [a,b] of plain.map((c,i)=>[c,named[i]] as const)){const x=classifyCheck(a),y=classifyCheck(b);expect(y.rule).not.toBe('default');expect([y.type,y.effect]).toEqual([x.type,x.effect]);}
 });
 it('lays out the two columns and the ties, and validates the gap, the base and the arrangement',()=>{
  const cc=plates('W14X120'),bc=plates('W14X90'),offset=cc.d/2+bc.d/2+3*inch,p=craneProject(offset),g=craneColumnLayout(p)!;
  expect(g.gap).toBeCloseTo(3*inch,6);expect(g.girderTie.face).toBeCloseTo(offset-bc.d/2,6);expect(g.buildingColumn.x).toBe(offset);
  expect(g.columnTie).toMatchObject({elevation:p.existingColumn!.height,length:g.gap});
  expect(validateCraneColumn(p)).toEqual([]);
  expect(validateCraneColumn(craneProject(cc.d/2+bc.d/2+1*inch)).join(' ')).toMatch(/craneColumn\.offset: the clear distance .* at least/);
  const q=craneProject(offset);q.craneColumn!.base='fixed';q.details!.bracket!.enabled=true;q.craneColumn!.building.isNew=true;
  const e=validateCraneColumn(q).join(' ');
  expect(e).toMatch(/craneColumn\.base: /);expect(e).toMatch(/not on a bracket/);expect(e).toMatch(/building\.isNew/);
  // The stub keeps any crane-column project from being issued until WP-1 implements it.
  const s=snapshotOf(p);craneColumnCalculation(s);
  expect(s.checks).toMatchObject([{id:'crane-column-basis',status:'unsupported'}]);expect(classifyCheck(s.checks[0]).rule).toBe('id');
  const t=snapshotOf(existingProject());craneColumnCalculation(t);expect(t.checks).toEqual([]);
 });
});

describe('stepped column: contracts (WP-0)',()=>{
 /** Lower W24X104, upper W12X65 flush on the outer flanges, the girder over the crane-side flange. */
 function stepped(){
  const p=existingProject(),c=p.existingColumn!,lo=plates('W24X104'),up=plates('W12X65');
  Object.assign(c,{...lo});
  const zero={P:0,Mx:0,My:0,V:0};
  c.step={upper:{...up,Fy:345,Fu:448},offset:(lo.d-up.d)/2,girderOffset:lo.d/2-lo.tf/2,existingUpper:{D:{...zero},L:{...zero},Lr:{...zero},S:{...zero},R:{...zero},W:{...zero},E:{...zero}},
   cap:{thickness:inch,width:14*inch,length:16*inch},source:'Unit test survey',confirmed:true};
  return {p,lo,up};
 }
 it('places the shafts, the girder and the tie face: d_l − d_u − t_fl/2 from the girder web with flush outer flanges',()=>{
  const {p,lo,up}=stepped(),g=stepGeometry(p)!;
  expect(g.upper.x).toBeCloseTo(-(lo.d-up.d)/2,9);expect(g.tieDistance).toBeCloseTo(lo.d-up.d-lo.tf/2,9);
  expect(g.cap.top).toBe(p.existingColumn!.seatElevation);expect(g.lower.top).toBeCloseTo(g.cap.bottom,9);expect(g.upper.top).toBe(p.existingColumn!.height);
  expect(validateSteppedColumn(p)).toEqual([]);
 });
 it('rejects an upper shaft as deep as the lower, a girder off the flange, a step at the top and a new column',()=>{
  const {p,lo}=stepped(),s=p.existingColumn!.step!;
  s.upper={...s.upper,...plates('W24X104')};s.girderOffset=0;p.existingColumn!.seatElevation=p.existingColumn!.height;
  const e=validateSteppedColumn(p).join(' ');
  expect(e).toMatch(/must be deeper/);expect(e).toMatch(/girderOffset: .*crane-side flange/);expect(e).toMatch(/below the column top/);
  const n=stepped().p;n.existingColumn!.isNew=true;expect(validateSteppedColumn(n).join(' ')).toMatch(/clear isNew/);expect(stepGeometry(n)).toBeUndefined();
  expect(lo.d).toBeGreaterThan(0);
 });
 it('the stub replaces the prismatic column check with an unsupported open item',()=>{
  const {p}=stepped(),s=snapshotOf(p);steppedColumnCalculation(s);
  expect(s.checks).toMatchObject([{id:'step-basis',status:'unsupported'}]);
  const t=snapshotOf(existingProject());steppedColumnCalculation(t);expect(t.checks).toEqual([]);
 });
});

describe('check taxonomy of the crane-column and stepped-column families',()=>{
 const ids:Record<string,[string,string?]>={
  'crane-column-basis':['input'],'crane-column-brace-stiffness':['design','stability'],'crane-column-brace-strength':['design','axial'],
  'crane-column-tie-plate-yield':['design','axial'],'crane-column-tie-compression':['design','axial'],'crane-column-tie-bolts':['design','connection'],'crane-column-tie-bearing':['design','connection'],
  'crane-column-tie-edge':['detailing'],'crane-column-tie-slot-travel':['design','movement'],'crane-column-gap':['detailing'],'crane-column-footing-clearance':['detailing'],
  'column-buckling-basis':['classification'],'column-upper-axial':['design','axial'],'column-lower-axial':['design','axial'],'column-upper-flexure-y':['design','flexure'],
  'column-upper-interaction':['design','flexure'],'column-lower-interaction':['design','flexure'],'column-lower-shear':['design','shear'],
  'building-column-interaction':['design','flexure'],'building-column-frame':['input'],'building-column-drift-wind':['design','movement'],'building-column-weld-preheat':['input'],
  'step-basis':['input'],'step-web-yielding':['design','local'],'step-web-crippling':['design','local'],'step-panel-shear':['design','local'],'step-bearing':['design','connection'],
  'step-cap-flexure':['design','flexure'],'step-stiffener-bearing':['design','local'],'step-stiffener-weld':['design','connection'],'step-stiffener-width':['detailing'],
  'step-stiffener-thickness':['detailing'],'step-stiffener-required':['input'],
 };
 for(const [id,[type,effect]] of Object.entries(ids))it(id,()=>{
  const c=classifyCheck({id,group:'Crane column',title:'',status:'pass',equation:'',note:'',referenceIds:[],demand:1,capacity:2});
  expect(c.rule).not.toBe('default');expect(c.type).toBe(type);if(effect)expect(c.effect).toBe(effect);
 });
});

describe('configurator rules for the new supports (WP-0)',()=>{
 it('a new structure takes column caps; a column step takes its reach from the geometry',()=>{
  for(const support of ['crane-column','stepped-column'] as const){
   const r=normalizeConfig({...defaultRunwayConfig,structure:'new',support,tie:'flexible-plate'});
   expect(r.config).toMatchObject({structure:'new',support:'column-cap',tie:'paired-bars'});
   expect(r.rules[0]).toMatchObject({field:'support',from:support,to:'column-cap'});expect(r.changes[0]).toMatch(/crane columns themselves/);
  }
  const s=normalizeConfig({...defaultRunwayConfig,structure:'existing',support:'stepped-column',reach:24});
  expect(s.config.reach).toBeUndefined();expect(s.config.support).toBe('stepped-column');expect(s.changes[0]).toMatch(/reach comes from the column geometry/);
  expect(normalizeConfig({...defaultRunwayConfig,structure:'existing',support:'crane-column',reach:24}).changes).toEqual([]);
 });
 it('does not build them yet: a clear error, not another arrangement',()=>{
  for(const support of ['crane-column','stepped-column'] as const)expect(()=>buildProject({...defaultRunwayConfig,structure:'existing',support})).toThrow(/does not build the .* support yet/);
 });
});

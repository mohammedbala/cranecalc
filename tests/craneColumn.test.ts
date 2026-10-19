import {describe,it,expect,beforeAll} from 'vitest';
import {defaultExistingColumn} from '../src/engine/existingColumnInputs';
import {existingColumnAnalysis,existingColumnSection} from '../src/engine/existingColumn';
import {supportReactions} from '../src/engine/supportReactions';
import {sectionProperties} from '../src/engine/section';
import {secantStiffness} from '../src/engine/restraintClearance';
import {type CraneColumnInput} from '../src/engine/craneColumnInputs';
import {buildingColumnStiffness,columnTieGeometry,columnTieStiffness,craneColumnCalculation,craneColumnLayout,craneColumnRestraint,validateCraneColumn} from '../src/engine/craneColumn';
import {createDetailCollector,braceSystem} from '../src/engine/detailAnalysis';
import {runwayDesignAnalysis} from '../src/engine/designAnalysis';
import {girderStrength} from '../src/engine/aiscStrength';
import {activeEndBearing} from '../src/engine/endBearingInputs';
import {boltProperties as bolt} from '../src/engine/connectionStrength';
import {classifyCheck} from '../src/engine/checkTaxonomy';
import {buildProject} from '../src/engine/configurator';
import {calculate,validateProject} from '../src/engine/calculate';
import {defaultRunwayConfig,type RunwayConfig} from '../src/engine/configInputs';
import {newColumnDemonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';
import {aiscShapeByName} from '../src/data/aiscSections';
import type {CalculationSnapshot,ProjectInput} from '../src/engine/types';

const inch=25.4,foot=304.8,kip=4448.2216152605;
const plates=(shape:string)=>{const w=aiscShapeByName(shape)!;return {shape,d:w.d*inch,bf:w.bf*inch,tf:w.tf*inch,tw:w.tw*inch};};
const building=():CraneColumnInput['building']=>({...structuredClone(defaultExistingColumn),enabled:true,height:30*foot,seatElevation:20*foot,Lcx:30*foot,source:'Unit test survey',confirmed:true});
const tie:CraneColumnInput['columnTie']={plate:{thickness:.75*inch,width:8*inch,Fy:345,Fu:448},bolts:{count:2,diameter:.875*inch,grade:'A325',pitch:3*inch,edge:1.5*inch},slot:{length:2.5*inch,width:1.5*inch}};
/** A new W14X120 crane column on its cap (pinned base, braced top), tied to an existing W14X90 at `offset`. */
function craneProject(offset:number){
 const p=newColumnDemonstrationProject(),c=p.existingColumn!;
 p.details!.bracket!.enabled=false;p.columnCap={enabled:true,plate:{length:26*inch,width:16*inch,thickness:1.5*inch},weld:5/16*inch,stiffener:{thickness:.75*inch,height:8*inch,weld:5/16*inch}};
 c.strong={base:'pinned',top:'braced'};c.height=c.seatElevation;c.Lcx=c.height;
 p.craneColumn={enabled:true,offset,building:building(),columnTie:structuredClone(tie),base:'pinned',source:'Unit test'};
 const f=p.details!.brace.flangeAttachment;if(f)f.columnFace=offset-plates('W14X90').d/2;
 return p;
}
const snapshotOf=(p:ProjectInput)=>{const r=supportReactions(p,sectionProperties(p.section));
 return {input:p,checks:[],errors:[],warnings:[],supportReactions:r,existingColumn:existingColumnAnalysis(p,r)} as unknown as CalculationSnapshot;};
const cc=plates('W14X120'),bc=plates('W14X90'),offset=cc.d/2+bc.d/2+8*inch;

describe('crane column tied to the building column: mechanics',()=>{
 it('takes the building column stiffness at the tie from the pinned-braced beam formula, and the column tie in series',()=>{
  const p=craneProject(offset),g=craneColumnLayout(p)!,E=p.section.E,w=aiscShapeByName('W14X90')!,I=w.Ix*inch**4,L=30*foot;
  for(const a of [g.columnTie.elevation,g.girderTie.elevation]){const b=L-a;expect(buildingColumnStiffness(p,a)/(3*E*I*L/(a*a*b*b))).toBeCloseTo(1,6);}
  // Column tie: plate E·t·h over the clear gap, in series with n·G·A_b over the grip of the plate and tab (2t).
  const t=p.craneColumn!.columnTie,Ab=Math.PI*t.bolts.diameter**2/4,kPlate=E*t.plate.thickness*t.plate.width/g.gap,kBolts=t.bolts.count*(E/2.6)*Ab/(2*t.plate.thickness);
  expect(columnTieStiffness(p)).toBeCloseTo(1/(1/kPlate+1/kBolts),3);
  expect(g.gap).toBeCloseTo(8*inch,6);
 });
 it('checks the Appendix 6 nodal brace of the crane-column top by hand: 0.01Pr and (1/φ)(10Pr/L) against the building column, the tie and the sleeve play',()=>{
  const p=craneProject(offset),s=snapshotOf(p);craneColumnCalculation(s);
  const r=s.craneColumn!,g=craneColumnLayout(p)!,Pr=s.existingColumn!.governing.P.P,L=g.columnTie.elevation;
  expect(r.brace.Pr).toBeCloseTo(Pr,6);expect(r.brace.L).toBeCloseTo(L,6);
  expect(r.brace.strength.required).toBeCloseTo(.01*Pr,6);
  expect(r.brace.stiffness.required).toBeCloseTo(10*Pr/L/.75,6);
  // Sleeve: standard hole (7/8 in bolt: 15/16 in) plus two 1/4 in walls; play across the 1 1/2 in slot.
  const od=bolt('A325',.875*inch).hole+2*.25*inch,play=1.5*inch-od,kb=buildingColumnStiffness(p,L),kt=columnTieStiffness(p);
  expect(od).toBeCloseTo(1.4375*inch,6);expect(r.brace.stiffness.play).toBeCloseTo(play,6);
  expect(r.brace.stiffness.provided).toBeCloseTo(1/(1/kb+1/kt+play/(.01*Pr)),6);
  expect(r.brace.stiffness.provided).toBeCloseTo(secantStiffness(1/(1/kb+1/kt),play,.01*Pr),6);
  const k=s.checks.find(c=>c.id==='crane-column-brace-stiffness')!;expect(k.demand).toBeCloseTo(r.brace.stiffness.required,6);expect(k.capacity).toBeCloseTo(r.brace.stiffness.provided,6);
  // No detailed runway results here: the column tie takes the eccentric top reaction and the brace force only.
  expect(r.ties.columnTie).toBeCloseTo(.01*Pr+Pr*s.existingColumn!.eccentricity/p.existingColumn!.height,3);
 });
 it('sizes the slot travel from the differential shortening by hand',()=>{
  const p=craneProject(offset),q=structuredClone(p);q.craneColumn!.building.existing.S={P:60*kip,Mx:0,My:0,V:0};q.craneColumn!.building.existing.L={P:20*kip,Mx:0,My:0,V:0};
  const s=snapshotOf(q);craneColumnCalculation(s);const r=s.craneColumn!.slot,g=craneColumnLayout(q)!,E=q.section.E,z=g.columnTie.elevation;
  const sr=s.supportReactions!.supports.reduce((a,v)=>v.D+v.Cd+v.Cv+v.Ci>a.D+a.Cd+a.Cv+a.Ci?v:a),cp=sectionProperties(existingColumnSection(q).section);
  expect(cp.A/(aiscShapeByName('W14X120')!.A*inch**2)).toBeCloseTo(1,3);
  expect(r.crane).toBeCloseTo((sr.D+sr.Cd+sr.Cv+sr.Ci+cp.weight*z)*z/(E*cp.A),6);
  expect(r.building).toBeCloseTo(80*kip*z/(E*aiscShapeByName('W14X90')!.A*inch**2),6);
  expect(r.tolerance).toBeCloseTo(.25*inch,9);expect(r.demand).toBeCloseTo(Math.max(r.crane,r.building)+r.tolerance,9);
  const od=bolt('A325',.875*inch).hole+.5*inch;expect(r.capacity).toBeCloseTo((2.5*inch-od)/2,9);
  const c=s.checks.find(v=>v.id==='crane-column-tie-slot-travel')!;expect(c.status).toBe(r.demand<=r.capacity?'pass':'fail');
 });
 it('validates the girder tie face against the building column face, and the building column as an existing column',()=>{
  const p=craneProject(offset);expect(validateCraneColumn(p)).toEqual([]);
  const q=craneProject(offset);q.details!.brace.flangeAttachment!.columnFace!+=2*inch;expect(validateCraneColumn(q).join(' ')).toMatch(/craneColumn\.offset: the girder top-flange tie ends at a column face/);
  const r=craneProject(offset);r.craneColumn!.building.Lcx=20*foot;expect(validateCraneColumn(r).join(' ')).toMatch(/craneColumn\.building\.Lcx/);
 });
 it('names every crane-column and building-column check by its own taxonomy rule',()=>{
  const s=snapshotOf(craneProject(offset));craneColumnCalculation(s);
  expect(s.checks.some(c=>c.id==='building-column-interaction')).toBe(true);
  for(const c of s.checks)expect(classifyCheck(c).rule,c.id).not.toBe('default');
 });
});

/** One detailed lateral-torsional run of the girder (createDetailCollector), coarse and equal for every project compared. */
function detailRun(p:ProjectInput){
 const props=sectionProperties(p.section),c=createDetailCollector(p,props,10);runwayDesignAnalysis(p,props,girderStrength(p,props),16,20,c.observe,{envelope:false});return c.finish();
}
const cfg13:RunwayConfig={...defaultRunwayConfig,title:'Crane columns, flexible plates',capacity:15,control:'cab',bays:4,span:25,girder:'rolled',structure:'existing',support:'crane-column',tie:'flexible-plate',cmaa:'C',buildingClass:'C',railElevation:24,craneSpan:60};
const cfg14:RunwayConfig={...defaultRunwayConfig,title:'Heavy crane columns, paired bars',capacity:25,control:'cab',bays:4,span:30,girder:'rolled',structure:'existing',support:'crane-column',tie:'paired-bars',cmaa:'D',buildingClass:'B',railElevation:30,craneSpan:60};

describe('crane column: configured builds and full calculations',()=>{
 let p13:ProjectInput,p14:ProjectInput;
 beforeAll(()=>{p13=buildProject(cfg13);p14=buildProject(cfg14);},600000);
 it('builds valid projects: crane column on its cap tied to the building column, the girder tie at the building column face',()=>{
  for(const p of [p13,p14]){
   expect(validateProject(p)).toEqual([]);
   expect(p.craneColumn?.enabled).toBe(true);expect(p.existingColumn).toMatchObject({isNew:true,strong:{base:'pinned',top:'braced'}});expect(p.columnCap?.enabled).toBe(true);
   expect(p.aist!.supportType).toBe('column');expect(p.details!.bracket?.enabled).toBe(false);
   const g=craneColumnLayout(p)!;expect(g.gap).toBeGreaterThanOrEqual(columnTieGeometry(p).minimumGap-1e-6);
   const items=p.configurator!.selections!.map(v=>v.item);for(const k of ['Crane column','Building column','Column tie'])expect(items).toContain(k);
  }
 });
 it('reduces the girder tie forces to the bracket-and-tie case for a very stiff building column and column tie',()=>{
  // Crane column with a rigid building column and a very stiff column tie.
  const q=structuredClone(p13),k=q.craneColumn!;
  Object.assign(k.building,{shape:'',d:3000,bf:3000,tf:300,tw:300,strong:{base:'fixed',top:'braced'}});
  // A mechanical limit, not a buildable tie (the schema allows at most 8 bolts; the detail run does not validate).
  k.columnTie={...k.columnTie,plate:{...k.columnTie.plate,thickness:12,width:30000},bolts:{...k.columnTie.bolts,count:400,diameter:1.5*inch}};
  const brace=braceSystem(q),eb=activeEndBearing(q)!,G=q.section.E/2.6,ebK=4*G*bolt(eb.bolts.grade,eb.bolts.diameter).area/(q.section.tf+q.details!.bearing.thickness+q.columnCap!.plate.thickness);
  const restraint=craneColumnRestraint(q,brace.stiffness,ebK);
  expect(restraint.top/brace.stiffness).toBeGreaterThan(.995);expect(restraint.bottom/ebK).toBeGreaterThan(.99);
  // The same girder, tie and bearings on a welded bracket at the same column face, its seat as thick as the cap plate.
  const b=structuredClone(q),seat=b.columnCap!.plate.thickness,face=craneColumnLayout(q)!.girderTie.face;
  delete b.craneColumn;delete b.columnCap;
  b.details!.bracket={...structuredClone(cappedDemonstrationProject().details!.bracket!),enabled:true,reach:face,seatThickness:seat};
  b.existingColumn={...b.existingColumn!,isNew:false};
  const a=detailRun(q),r=detailRun(b);
  expect(r.braceStiffness).toBeCloseTo(brace.stiffness,6);expect(a.braceStiffness/brace.stiffness).toBeGreaterThan(.995);
  expect(a.demands.brace/r.demands.brace).toBeCloseTo(1,2);
  // And the real building column and column tie are softer restraints: the tie force changes with them.
  const real=detailRun(p13);expect(real.braceStiffness).toBeLessThan(brace.stiffness);
 },600000);
 // No check fails and nothing is left open: the isolated crane-column footings would overlap the building columns'
 // existing footings, so each crane column and its building column stand on one combined footing that replaces the
 // existing one (columnBase.combined), checked for both columns' loads. At CMAA D Class B the cap fillets stop at 5/8 in
 // (CJP beyond) and the rail clips are bolted for the base weld strength (WP-4).
 for(const [name,which,allowed] of [
  ['15 t cab, 4 × 25 ft, rolled girder, flexible plate',()=>p13,[]],
  ['25 t CMAA D, Class B, 4 × 30 ft, paired bars',()=>p14,[]]] as const){
  it(`calculates ${name}: only the known open items fail`,()=>{
   const s=calculate(which());
   expect(s.errors).toEqual([]);
   const failing=s.checks.filter(c=>c.status==='fail').map(c=>`${c.id} ${c.utilization?.toFixed(3)}`);
   console.log(`${name}: failing ${failing.join(', ')||'none'}`);
   expect(s.checks.filter(c=>c.status==='fail').map(c=>c.id).filter(id=>!(allowed as readonly string[]).includes(id))).toEqual([]);
   expect(s.checks.filter(c=>['incomplete','unsupported'].includes(c.status)).map(c=>c.id)).toEqual([]);
   // This arrangement's checks are typed by their own rules (the new-column base rows keep the taxonomy they have elsewhere).
   for(const c of s.checks.filter(v=>/^(crane-column-|building-column-)/.test(v.id)))expect(classifyCheck(c).rule,c.id).not.toBe('default');
   expect(s.buildingColumn).toBeDefined();expect(s.craneColumn!.ties.columnTie).toBeGreaterThan(s.craneColumn!.brace.strength.required);
   for(const id of ['crane-column-brace-stiffness','crane-column-brace-strength','crane-column-tie-slot-travel','building-column-interaction','column-interaction','column-cap-weld'])expect(s.checks.find(c=>c.id===id)?.status,id).toBe('pass');
   expect(s.checks.find(c=>c.id==='column-cap-fork-stiffness')?.status).toBe('not-applicable');
   expect(s.checks.find(c=>c.id==='brace-stiffness')?.status).toBe('pass');
   const footing=s.checks.find(c=>c.id==='crane-column-footing-clearance')!;
   expect(footing.status).toBe('pass');expect(footing.note).toMatch(/^With the columns [\d.]+ in apart, an isolated crane-column footing cannot keep 6 in clear/);
   expect(s.craneColumn!.footing!.combined).toBe(true);expect(which().columnBase!.combined).toBe(true);
   // The braced columns' footing is sized apart from the others' (columnBase.braced), and neither nears the old 13 ft.
   const b=which().columnBase!;expect(b.braced).toBeDefined();expect(b.footing.L).toBeLessThan(b.braced!.footing.L+1e-6);expect(b.braced!.footing.L).toBeLessThan(12.5*304.8);
   expect(s.checks.filter(c=>c.status==='unverified').map(c=>c.id)).toEqual([]);
  },600000);
 }
});

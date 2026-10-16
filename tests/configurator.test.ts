import {describe,expect,it} from 'vitest';
import {runwayTemplates,templateProject} from '../src/engine/templates';
import {buildProject,estimateCrane,exampleSpectrum,normalizeConfig,previewConfig,railDepthFor,seatWidthNeeded} from '../src/engine/configurator';
import {defaultRunwayConfig,type RunwayConfig} from '../src/engine/configInputs';
import {validateProject} from '../src/engine/calculate';
import {craneInputChecks,craneStatics,bumperSelectionChecks} from '../src/engine/craneInput';
import {buildingClassCheck,fatigueCycleCheck} from '../src/engine/buildingClass';
import {packageContentChecks} from '../src/engine/detailTemplate';
import {projectSchema} from '../src/engine/types';

const kip=4448.2216152605,foot=304.8,inch=25.4;

describe('configuration templates',()=>{
 it('are a dozen distinct, complete configurations',()=>{
  expect(runwayTemplates).toHaveLength(12);
  expect(new Set(runwayTemplates.map(t=>t.id)).size).toBe(12);
  // Every support and tie kind and both structures appear.
  const supports=new Set(runwayTemplates.map(t=>t.config.support)),ties=new Set(runwayTemplates.map(t=>t.config.tie));
  for(const s of ['by-others','twin-rib','haunched-seat','rolled-corbel','tapered-haunch','column-cap'])expect(supports).toContain(s);
  for(const s of ['paired-bars','flexible-plate','cap-angle'])expect(ties).toContain(s);
  expect(runwayTemplates.some(t=>t.config.structure==='new')).toBe(true);
  expect(runwayTemplates.some(t=>t.config.system==='continuous')).toBe(true);
  expect(runwayTemplates.some(t=>t.config.cranes===2)).toBe(true);
  expect(runwayTemplates.some(t=>t.config.scope==='analysis')).toBe(true);
  for(const t of runwayTemplates)expect(normalizeConfig(t.config).changes).toEqual([]);
 });
 it.each(runwayTemplates.map(t=>[t.id,t] as const))('%s builds a valid project with the chosen arrangement',(_,t)=>{
  const p=templateProject(t.id),c=t.config;
  expect(validateProject(p)).toEqual([]);
  expect(projectSchema.parse(JSON.parse(JSON.stringify(p))).configurator).toEqual(p.configurator);
  expect(p.configurator?.template).toBe(t.id);
  expect(p.spans).toEqual(Array(c.bays).fill(c.span*foot));
  expect(p.cranes).toHaveLength(c.cranes);
  expect(p.section.kind).toBe(c.girder==='capped'?'cap':'rolled');
  if(c.scope==='analysis'){expect(p.details).toBeUndefined();return;}
  const d=p.details!;
  if(c.support==='column-cap'){expect(p.columnCap?.enabled).toBe(true);expect(d.bracket?.enabled).toBeFalsy();}
  else if(c.support==='by-others')expect(d.bracket?.enabled).toBeFalsy();
  else expect(d.bracket).toMatchObject({enabled:true,arrangement:c.support});
  if(c.support!=='column-cap')expect(d.brace.arrangement??'paired-bars').toBe(c.tie);
  expect(!!p.existingColumn?.enabled).toBe(c.support!=='by-others');
  expect(!!p.existingColumn?.isNew).toBe(c.structure==='new');
  expect(!!p.columnBase?.enabled).toBe(c.structure==='new');
  // A template is an example: the content gates of a project package still apply when it is turned into one.
  expect(packageContentChecks({...p,reportPurpose:'project'}).map(v=>v.id)).toContain('project-content');
 });
});

describe('crane data from the capacity',()=>{
 it.each([[2,40,'pendant'],[10,60,'cab'],[25,70,'cab'],[40,90,'cab']] as const)('%s tons, %s ft %s: consistent statics and bumper data',(capacity,span,control)=>{
  const cfg:RunwayConfig={...defaultRunwayConfig,capacity,craneSpan:span,control,bays:3,span:30};
  const p=buildProject(cfg),c=p.cranes[0],s=craneStatics(c)!;
  // Wheel loads of both runways sum to the crane weight; the lifted share stays within the rated load.
  expect(s.sumAll/s.total).toBeCloseTo(1,9);expect(s.lifted).toBeLessThanOrEqual(s.lift*(1+1e-9));
  expect(craneInputChecks(p).filter(k=>k.status!=='pass')).toEqual([]);
  // Bumper: deceleration at half speed within 16 ft/s², the full energy at the supplier force.
  const bumper=bumperSelectionChecks(p,[]).filter(k=>k.id.endsWith('decel')||k.id.endsWith('energy'));
  expect(bumper.map(k=>k.status)).toEqual(['pass','pass']);
  const e=estimateCrane(capacity,span,control);
  expect(e.Q).toBeCloseTo(2*capacity*kip,6);expect(c.wheels.length).toBe(e.offsets.length);
  expect(c.design?.cmaaClass).toBe('C');expect(c.impact).toBe(control==='pendant'?.1:.25);
 });
 it('selects a rail for the wheel load and the flange width that seats it with the clips',()=>{
  expect(railDepthFor(8*kip)).toBe(3.5*inch);expect(railDepthFor(16*kip)).toBe(4.25*inch);expect(railDepthFor(30*kip)).toBe(5.25*inch);expect(railDepthFor(45*kip)).toBe(6*inch);
  // 6 in rail base, 2 1/2 in clips, 1/8 in alignment allowance each side.
  expect(seatWidthNeeded(6*inch,2.5*inch)).toBeCloseTo(11.25*inch,6);
 });
});

describe('duty and class',()=>{
 it.each(['A','B','C','D'] as const)('Class %s: one cycle count throughout, the counted class is the chosen one',cls=>{
  const p=buildProject({...defaultRunwayConfig,buildingClass:cls,bays:2});
  expect(buildingClassCheck(p).status).toBe('pass');expect(fatigueCycleCheck(p).status).toBe('pass');
  expect(p.details!.spectrum.reduce((n,b)=>n+b.cycles,0)).toBe(exampleSpectrum(cls).total);
  expect(p.verticalLimit).toBe(cls==='A'||cls==='B'?1000:600);
 });
});

describe('dependent choices',()=>{
 it('adjusts incompatible choices and says why',()=>{
  const r=normalizeConfig({...defaultRunwayConfig,structure:'existing',support:'column-cap',tie:'cap-angle',girder:'rolled'});
  expect(r.config).toMatchObject({structure:'new',support:'column-cap',tie:'paired-bars'});
  expect(r.changes.length).toBeGreaterThanOrEqual(2);
  expect(normalizeConfig({...defaultRunwayConfig,structure:'new',support:'by-others'}).config.support).toBe('twin-rib');
  expect(normalizeConfig({...defaultRunwayConfig,system:'continuous',tie:'flexible-plate'}).config.tie).toBe('paired-bars');
 });
 it('previews the crane, duty, rail and sized girder without building the details',()=>{
  const v=previewConfig({...defaultRunwayConfig,capacity:5,control:'pendant',craneSpan:50});
  expect(v.girder).toMatch(/^W\d+X/);expect(v.trial?.utilization).toBeLessThan(1);
  expect(v.crane.Pmax).toBeGreaterThan(v.crane.Pmin);expect(v.spectrum.total).toBe(100000);
  // A named girder is used as given.
  expect(previewConfig({...defaultRunwayConfig,girderShape:'W24X104'}).girder).toBe('W24X104');
 });
});

describe('AIST TR-13 §5.9.2 column-bracket recommendation',()=>{
 it('estimates the support reaction as the calculation reports it',()=>{
  // column-brackets of the full calculation (the design analysis service reaction) for the earlier templates t05
  // (15 t, brackets by others), t08 (20 t continuous) and t10 (25 t haunches): 55.0, 86.0 and 91.5 kip.
  const cases:[Partial<RunwayConfig>,number][]=[[{capacity:15,craneSpan:70,bays:4,span:25,support:'by-others',railElevation:24},55.0],
   [{capacity:20,craneSpan:70,bays:4,span:30,system:'continuous',railElevation:26},86.0],
   [{capacity:25,craneSpan:70,cmaa:'D',buildingClass:'B',bays:4,span:30,support:'tapered-haunch',railElevation:28},91.5]];
  for(const [cfg,R] of cases)expect(Math.abs(previewConfig({...defaultRunwayConfig,...cfg}).reaction!/kip/R-1)).toBeLessThan(.02);
 });
 it('puts a new structure above it on column caps over the new crane columns, and says why',()=>{
  const cfg:RunwayConfig={...defaultRunwayConfig,capacity:20,craneSpan:70,bays:4,span:30,structure:'new',support:'twin-rib',tie:'flexible-plate'};
  const v=previewConfig(cfg);
  expect(v.reaction!).toBeGreaterThan(50*kip);expect(v.config).toMatchObject({structure:'new',support:'column-cap',tie:'paired-bars'});
  expect(v.changes[0]).toMatch(/^The support reaction, about \d+ kip, exceeds the AIST TR-13 §5\.9\.2 recommendation of 50 kip for column brackets: the girders bear on column caps over the new crane columns/);
  const p=buildProject(cfg);
  expect(p.configurator?.support).toBe('column-cap');expect(p.columnCap?.enabled).toBe(true);expect(p.details!.bracket?.enabled).toBeFalsy();
  expect(validateProject(p)).toEqual([]);
 },120000);
 it('keeps the brackets of an existing structure above it, with the warning; within it nothing is said',()=>{
  const v=previewConfig({...defaultRunwayConfig,capacity:20,craneSpan:70,bays:4,span:30});
  expect(v.config.support).toBe('twin-rib');
  expect(v.changes).toContainEqual(expect.stringMatching(/^Support reaction about \d+ kip exceeds the AIST TR-13 §5\.9\.2 recommendation of 50 kip for column brackets; consider new crane columns with column caps, or obtain the engineer of record's acceptance\.$/));
  // The one statement within the limit is the assumed bumper overhang (end-truck geometry for the stop contacts).
  const light=previewConfig({...defaultRunwayConfig,capacity:5});expect(light.changes.filter(v=>!/^Bumper overhang assumed/.test(v))).toEqual([]);expect(light.changes.at(-1)).toMatch(/^Bumper overhang assumed \d+ in/);expect(light.reaction!).toBeLessThan(50*kip);
 });
});

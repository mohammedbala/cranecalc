import {describe,expect,it} from 'vitest';
import {runwayTemplates,templateProject} from '../src/engine/templates';
import {buildProject,estimateCrane,exampleSpectrum,normalizeConfig,previewConfig,railDepthFor,seatWidthNeeded} from '../src/engine/configurator';
import {defaultRunwayConfig,supportKinds,type RunwayConfig} from '../src/engine/configInputs';
import {validateProject} from '../src/engine/calculate';
import {craneInputChecks,craneStatics,bumperSelectionChecks} from '../src/engine/craneInput';
import {buildingClassCheck,fatigueCycleCheck} from '../src/engine/buildingClass';
import {packageContentChecks} from '../src/engine/detailTemplate';
import {projectSchema} from '../src/engine/types';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import StartPanel from '../src/components/StartPanel';
import {sheetFixture} from './fixtures/sheets/sheetFixtures';
import {drawingSheetSet} from '../src/components/planSheet';
import {annotationClashes} from '../src/components/detailSheet';
import {selectionsTable} from '../src/report/designSummary';
import {spliceLayout} from '../src/engine/spliceInputs';
import {girderPieceChecks} from '../src/engine/girderPieces';

const kip=4448.2216152605,foot=304.8,inch=25.4;

describe('configuration templates',()=>{
 it('are sixteen distinct, complete configurations',()=>{
  expect(runwayTemplates).toHaveLength(16);
  expect(new Set(runwayTemplates.map(t=>t.id)).size).toBe(16);
  // Every support and tie kind and both structures appear.
  const supports=new Set(runwayTemplates.map(t=>t.config.support)),ties=new Set(runwayTemplates.map(t=>t.config.tie));
  for(const s of supportKinds)expect(supports).toContain(s);
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
  // New columns with bracket seats whose column twist exceeds its limit bear on column caps instead (withTwistLimit).
  const twisted=c.structure==='new'&&c.support!=='column-cap'&&!!p.configurator?.selections?.some(v=>v.item==='Girder support'&&/twists/.test(v.reason));
  if(c.support==='column-cap'||twisted){expect(p.columnCap?.enabled).toBe(true);expect(d.bracket?.enabled).toBeFalsy();expect(p.configurator?.support).toBe('column-cap');}
  // A crane column: the girder on its cap, tied to the building column; a stepped column: the girder on the step.
  else if(c.support==='crane-column'){expect(p.columnCap?.enabled).toBe(true);expect(p.craneColumn?.enabled).toBe(true);expect(d.bracket?.enabled).toBeFalsy();expect(p.aist!.supportType).toBe('column');}
  else if(c.support==='stepped-column'){expect(p.existingColumn?.step).toBeDefined();expect(p.craneColumn).toBeUndefined();expect(d.bracket?.enabled).toBeFalsy();expect(p.aist!.supportType).toBe('column');}
  else if(c.support==='by-others')expect(d.bracket?.enabled).toBeFalsy();
  else expect(d.bracket).toMatchObject({enabled:true,arrangement:c.support});
  // A rolled simple-span saddle that does not suit the girder (or a high-cycle runway) gives way to paired bars on the
  // bearing stiffener (attachTie): the flexible plate then becomes paired bars.
  // A capped saddle that does not suit the girder takes the cap tieback angle, with the reason in the notes.
  const onStiffener=c.system==='simple'&&c.girder==='rolled'&&d.brace.flangeAttachment?.enabled===false,capAngle=c.girder==='capped'&&p.notes.includes('do not suit this capped girder');
  if(c.support!=='column-cap'&&!twisted)expect(d.brace.arrangement??'paired-bars').toBe(onStiffener?'paired-bars':capAngle?'cap-angle':c.tie);
  expect(!!p.existingColumn?.enabled).toBe(c.support!=='by-others');
  // A crane column is a new column on its own base beside the existing building column.
  expect(!!p.existingColumn?.isNew).toBe(c.structure==='new'||c.support==='crane-column');
  expect(!!p.columnBase?.enabled).toBe(c.structure==='new'||c.support==='crane-column');
  // A template is an example: the content gates of a project package still apply when it is turned into one.
  expect(packageContentChecks({...p,reportPurpose:'project'}).map(v=>v.id)).toContain('project-content');
 },300000);
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
  // A capped girder over a 60 ft piece has no designed field splice (the cap channel too): simple spans, logged.
  const capped=normalizeConfig({...defaultRunwayConfig,girder:'capped',system:'continuous',bays:5,span:20,tie:'flexible-plate'});
  expect(capped.config).toMatchObject({system:'simple',tie:'flexible-plate'});
  expect(capped.rules).toContainEqual({field:'system',from:'continuous',to:'simple',why:expect.stringMatching(/cap channel.*simple spans/)});
  expect(normalizeConfig({...defaultRunwayConfig,girder:'capped',system:'continuous',bays:3,span:20}).config.system).toBe('continuous');
  // Each change is kept per choice for the selection log: the field, as entered, as adjusted and the rule.
  expect(r.rules).toContainEqual({field:'structure',from:'existing',to:'new',why:expect.stringMatching(/new freestanding columns/)});
  expect(r.rules).toContainEqual({field:'tie',from:'cap-angle',to:'paired-bars',why:expect.any(String)});
 });
 it('previews the crane, duty, rail and sized girder without building the details',()=>{
  const v=previewConfig({...defaultRunwayConfig,capacity:5,control:'pendant',craneSpan:50});
  expect(v.girder).toMatch(/^W\d+X/);expect(v.trial?.utilization).toBeLessThan(1);
  expect(v.crane.Pmax).toBeGreaterThan(v.crane.Pmin);expect(v.spectrum.total).toBe(100000);
  // A named girder is used as given.
  expect(previewConfig({...defaultRunwayConfig,girderShape:'W24X104'}).girder).toBe('W24X104');
 });
 it('previews the crane column beside the building column, and the stepped column\'s lower and upper shafts',()=>{
  const crane=previewConfig({...defaultRunwayConfig,capacity:15,support:'crane-column',girderShape:'W30X191'});
  expect(crane).toMatchObject({column:'W14X90',buildingColumn:'W14X120'});
  expect(previewConfig({...defaultRunwayConfig,capacity:15,support:'crane-column',girderShape:'W30X191',columnShape:'W14X159',buildingColumnShape:'W14X145'})).toMatchObject({column:'W14X159',buildingColumn:'W14X145'});
  const step=previewConfig({...defaultRunwayConfig,capacity:20,support:'stepped-column',girderShape:'W30X191'});
  // The assumed lower shaft for the class holds the upper shaft: the preview shows the shaft the build keeps.
  expect(step).toMatchObject({column:'W33X201',buildingColumn:'W14X159'});
  // Both are direct column bearing: no column-bracket warning whatever the reaction.
  expect([...crane.changes,...step.changes].filter(v=>/^Support reaction/.test(v))).toEqual([]);
  expect(previewConfig({...defaultRunwayConfig,girderShape:'W24X104'}).buildingColumn).toBeUndefined();
 });
 it('takes the new supports only on an existing structure, ignores a stepped column\'s reach and keeps its lower shaft deeper than the upper',()=>{
  for(const support of ['crane-column','stepped-column'] as const){
   const r=normalizeConfig({...defaultRunwayConfig,structure:'new',support});
   expect(r.config.support).toBe('column-cap');expect(r.rules).toContainEqual({field:'support',from:support,to:'column-cap',why:expect.stringMatching(/^New freestanding columns are crane columns themselves/)});
   expect(normalizeConfig({...defaultRunwayConfig,support}).changes).toEqual([]);
  }
  const step=normalizeConfig({...defaultRunwayConfig,support:'stepped-column',reach:24});
  expect(step.config.reach).toBeUndefined();expect(step.changes[0]).toMatch(/reach comes from the column geometry/);
  // The crane column keeps its reach: the girder web to the building column face.
  expect(normalizeConfig({...defaultRunwayConfig,support:'crane-column',reach:24}).config.reach).toBe(24);
  const shallow=normalizeConfig({...defaultRunwayConfig,support:'stepped-column',columnShape:'W14X159',buildingColumnShape:'W14X120'});
  expect(shallow.config.columnShape).toBeUndefined();expect(shallow.changes[0]).toMatch(/does not hold the W14X120 upper shaft/);
  expect(normalizeConfig({...defaultRunwayConfig,support:'stepped-column',columnShape:'W33X201'}).config.columnShape).toBe('W33X201');
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
  // The selection log names the support and the tie that were replaced, each with its governing rule.
  const log=p.configurator!.selections!,row=(item:string)=>log.find(v=>v.item===item);
  expect(row('Girder support')).toMatchObject({entered:'Welded twin-rib seat',designed:'Column cap (new columns)',reason:expect.stringMatching(/exceeds the AIST TR-13 §5\.9\.2 recommendation/)});
  expect(row('Top-flange tie')).toMatchObject({entered:'Flexible plate',designed:expect.stringMatching(/^None: end fork on the column cap/),reason:expect.stringMatching(/fork/)});
  expect(row('New column')?.designed).toBe(p.existingColumn!.shape);
 },120000);
 it('puts an existing structure above it on crane columns tied to the building columns; within it nothing is said',()=>{
  const v=previewConfig({...defaultRunwayConfig,capacity:20,craneSpan:70,bays:4,span:30});
  expect(v.config.support).toBe('crane-column');
  expect(v.changes).toContainEqual(expect.stringMatching(/^The support reaction, about \d+ kip, exceeds the AIST TR-13 §5\.9\.2 recommendation of 50 kip for column brackets: new crane columns beside the building columns/));
  // The structure stays existing (t05, t08 and t10 are within the recommendation and keep their brackets).
  expect(v.config.structure).toBe('existing');
  // The one statement within the limit is the assumed bumper overhang (end-truck geometry for the stop contacts).
  const light=previewConfig({...defaultRunwayConfig,capacity:5});expect(light.changes.filter(v=>!/^Bumper overhang assumed/.test(v))).toEqual([]);expect(light.changes.at(-1)).toMatch(/^Bumper overhang assumed \d+ in/);expect(light.reaction!).toBeLessThan(50*kip);
 });
});

describe('configurator selection log',()=>{
 it('records each choice the configurator made with its governing reason, and is not read back as a choice',()=>{
  const p=templateProject('t01'),log=p.configurator!.selections!,row=(item:string)=>log.find(v=>v.item===item);
  // The girder sized here: its governing sizing ratio and the lighter candidates rejected, counted by reason.
  expect(row('Girder')).toMatchObject({entered:'configurator default (sized)',designed:p.section.name});
  expect(row('Girder')!.reason).toMatch(/ratio \d\.\d\d, vertical deflection \d\.\d\d and lateral \d\.\d\d of their limits/);
  expect(row('Girder')!.reason).toMatch(/lighter candidates rejected: \d+ by /);
  expect(row('Existing column')).toMatchObject({entered:'configurator default',designed:p.existingColumn!.shape});
  // Nothing the user entered as built is listed: support and tie are as configured.
  expect(row('Girder support')).toBeUndefined();
  expect(projectSchema.parse(JSON.parse(JSON.stringify(p))).configurator?.selections).toEqual(log);
  // Rebuilt from its configurator record (log included), the project and the log come back the same.
  const q=buildProject(p.configurator!);
  expect(q.section.name).toBe(p.section.name);expect(q.configurator!.selections).toEqual(log);
  // The start panel shows the log of the project it built.
  const html=renderToStaticMarkup(createElement(StartPanel,{project:p,onBuild:()=>{}}));
  expect(html).toContain('Configurator selections');expect(html).toContain(`<td>${p.section.name}</td>`);
  // A girder named in the configuration is used as entered and is not listed.
  expect(buildProject({...p.configurator!,girderShape:'W24X104'}).configurator!.selections!.find(v=>v.item==='Girder')).toBeUndefined();
 },120000);
 it('offers the crane-column and stepped-column choices in the start panel, with their own column inputs and sketches',()=>{
  const base=sheetFixture('t07').input,render=(id:string)=>renderToStaticMarkup(createElement(StartPanel,{project:{...base,configurator:{...runwayTemplates.find(t=>t.id===id)!.config}},onBuild:()=>{}}));
  const crane=render('t13');
  for(const v of ['Crane column (new)','Building column (existing)','Crane column base','Building column face to girder web'])expect(crane).toContain(v);
  // Both new supports are offered on an existing structure (no "(n/a)" on them).
  expect(crane).toMatch(/<option value="crane-column"[^>]*>Crane column tied to the building column \(existing\)<\/option>/);
  expect(crane).toMatch(/<option value="stepped-column"[^>]*>Girder on the column step \(existing stepped column\)<\/option>/);
  const step=render('t15');
  for(const v of ['Lower shaft (existing)','Upper shaft (existing)','W40X199'])expect(step).toContain(v);
  expect(step).not.toContain('Column face to girder web');expect(step).not.toContain('Crane column base');
  // Each template card sketches its support: a crane column has a column tie with its slot, a stepped column its step cap.
  expect(crane.match(/class="support-sketch"/g)!.length).toBe(runwayTemplates.length);
 });
 it('splices a continuous girder longer than a 60 ft piece in its inflection region and logs the splice design',()=>{
  const p=templateProject('t08'),l=spliceLayout(p),row=p.configurator!.selections!.find(v=>v.item==='Girder field splices')!;
  expect(validateProject(p)).toEqual([]);expect(l.errors).toEqual([]);expect(l.stations.length).toBeGreaterThan(0);
  expect(Math.max(...l.pieces.map(v=>v.length))).toBeLessThanOrEqual(60*foot+1e-6);
  // Each joint 0.20 to 0.25 of the span from an interior support (the 25 ft spans of t08).
  for(const x of l.stations){const t=Math.min(...[25,50,75].map(g=>Math.abs(x-g*foot)))/(25*foot);expect(t).toBeGreaterThanOrEqual(.2-1e-9);expect(t).toBeLessThanOrEqual(.25+1e-9);}
  expect(p.details!.splices).toMatchObject({enabled:true,placement:'auto',basis:'minimum',top:{plates:'inner'},bottom:{plates:'inner-outer'}});
  expect(row.designed).toMatch(/^1 bolted slip-critical splice: SP1 [\d.]+ ft \(0\.2\d\d L\) (before|past) grid \d/);
  expect(row.reason).toMatch(/A490 .* slip-critical bolts .* 50% of the flange strength/);
  // The open item for an unspliced one-piece girder does not apply; a girder within a piece takes no splices.
  expect(girderPieceChecks(p)).toEqual([]);
  expect(templateProject('t01').details!.splices).toBeUndefined();
  expect(buildProject(p.configurator!).details!.splices).toEqual(p.details!.splices);
 },120000);
 it('prints the log in the design summary and compactly on S-00, clear of other text',()=>{
  const s=sheetFixture('t07'),log=[{item:'Girder support',entered:'Welded twin-rib seat',designed:'Column cap (new columns)',reason:'The support reaction, about 117 kip, exceeds the AIST TR-13 §5.9.2 recommendation of 50 kip for column brackets: the girders bear on column caps.'},
   {item:'Girder',entered:'configurator default (sized)',designed:s.input.section.name,reason:'Lightest compact W within the sizing targets (ratio ≤ 0.85): top-flange tip stress ratio 0.83; next lighter, W14X426: tips ratio 1.14 > 0.85.'}];
  expect(selectionsTable(s.input)).toBe('');
  s.input.configurator={...s.input.configurator!,selections:log};
  const html=selectionsTable(s.input);
  expect(html).toContain('<h3>Configurator selections</h3>');expect(html).toContain('next lighter, W14X426');
  const cover=drawingSheetSet(s).find(v=>v.number==='S-00')!.svg;
  expect(cover).toContain('CONFIGURATOR SELECTIONS');expect(cover).toContain('WELDED TWIN-RIB SEAT →');
  // The cover keeps the first clause of each reason; the full reason is in the calculation.
  expect(cover).not.toContain('NEXT LIGHTER');
  expect(annotationClashes(cover)).toBe(0);expect(cover).not.toMatch(/data-overflow/);
 });
});

import {describe,expect,it,vi} from 'vitest';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createElement,isValidElement,type ReactElement,type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {exampleProject} from '../src/engine/defaults';
import {caseEntry,exportSampleCases,governingCheck,parseCsv} from '../scripts/exportSampleCases';
import SampleCaseGallery,{CaseCard,openSampleCase} from '../src/components/SampleCaseGallery';
import {emptyFilters,filterCases,type SampleCaseEntry,type SampleCaseIndex} from '../src/components/sampleCaseIndex';

const foot=304.8;
const config={units:'US',method:'LRFD',scope:'design',capacity:10,craneSpan:60,control:'cab',cmaa:'C',cranes:1,buildingClass:'C',system:'simple',bays:exampleProject.spans.length,span:25,railElevation:30,girder:'rolled',structure:'existing',support:'twin-rib',tie:'paired-bars'};
const spanText=`${exampleProject.spans.length} × ${Math.round(exampleProject.spans[0]/foot*10)/10} ft`;
const checksCsv=[
 'id,type,title,status,utilization',
 'design-scope,load-basis,Runway load-path scope,pass,1',
 'girder-flexure,design,"Girder · flexure, top flange",pass,0.8123',
 'rail-clips,detailing,Opposing rail clip spacing,pass,1',
 'column-brackets,classification,Column bracket applicability,fail,1.4101',
 'web-crippling,design,Web local crippling,not-applicable,',
].join('\n');
const summary={id:1,outcome:'eligible-with-failures',calcSeconds:32.24,counts:{pass:488,fail:1,'not-applicable':8},
 open:[{id:'column-brackets',group:'Detailing',title:'Column bracket applicability',status:'fail',utilization:1.41014,note:'long note'}],governing:[{id:'design-scope',title:'Runway load-path scope',utilization:1}]};

/** A case set of three: 001 valid with results, 002 invalid, 003 valid (new columns, column cap, two cranes) without results. */
function fixtureDirs(){
 const root=mkdtempSync(path.join(tmpdir(),'sample-cases-')),cases=path.join(root,'cases'),results=path.join(root,'results'),out=path.join(root,'out');
 for(const d of [cases,path.join(results,'001'),path.join(results,'002'),out])mkdirSync(d,{recursive:true});
 const invalid=structuredClone(exampleProject) as any;invalid.section.d=0;
 writeFileSync(path.join(cases,'001.json'),JSON.stringify({id:1,title:'stale title',descriptor:'existing structure; support twin-rib',config,project:exampleProject}));
 writeFileSync(path.join(cases,'002.json'),JSON.stringify({id:2,descriptor:'broken',config,project:invalid}));
 writeFileSync(path.join(cases,'003.json'),JSON.stringify({id:3,descriptor:'new columns',config:{...config,structure:'new',support:'column-cap',cranes:2,capacity:7.5,system:'continuous',girder:'capped'},project:exampleProject}));
 writeFileSync(path.join(results,'001','summary.json'),JSON.stringify(summary));
 writeFileSync(path.join(results,'001','checks.csv'),checksCsv);
 writeFileSync(path.join(results,'002','summary.json'),JSON.stringify({id:2,outcome:'invalid'}));
 writeFileSync(path.join(out,'099.json'),'{}');// stale output of an earlier case set
 return {cases,results,out};
}

describe('sample case export',()=>{
 it('writes each valid project compactly and an index with the run results; invalid projects are skipped and reported',()=>{
  const d=fixtureDirs(),r=exportSampleCases({casesDir:d.cases,resultsDir:d.results,outDir:d.out,generated:'2026-10-19'});
  expect(r.written).toEqual([1,3]);
  expect(r.skipped).toEqual([{id:2,reason:expect.stringMatching(/^section\.d/)}]);
  expect(r.withoutResults).toEqual([3]);
  expect(readdirSync(d.out).sort()).toEqual(['001.json','003.json','index.json']);
  const text=readFileSync(path.join(d.out,'001.json'),'utf8');
  expect(text).toBe(JSON.stringify(exampleProject));// no pretty print
  const index=JSON.parse(readFileSync(path.join(d.out,'index.json'),'utf8')) as SampleCaseIndex;
  expect(index).toMatchObject({version:1,generated:'2026-10-19',count:2});
  const [a,b]=index.cases;
  expect(a).toMatchObject({id:1,file:'001.json',title:`10-ton cab crane · existing building · twin-rib seats · ${spanText}`,descriptor:'existing structure; support twin-rib',
   structure:'existing',support:'twin-rib',supportLabel:'Welded twin-rib seat',tie:'paired-bars',tieLabel:'Paired flat bars',system:'simple',girder:'rolled',girderSystem:'simple-rolled',
   section:exampleProject.section.name,capacity:10,cranes:1,control:'cab',cmaa:'C',buildingClass:'C',units:'US',method:'LRFD',craneSpan:60,
   outcome:'eligible-with-failures',counts:summary.counts,calcSeconds:32.2,bytes:Buffer.byteLength(text),
   open:[{id:'column-brackets',title:'Column bracket applicability',status:'fail',utilization:1.41}]});
  // Governing: the failing ratio beats the passing design checks; the load-basis and detailing ratios of 1 are not demands.
  expect(a.governing).toEqual({id:'column-brackets',title:'Column bracket applicability',status:'fail',utilization:1.41});
  expect(b).toMatchObject({id:3,title:`2 × 7.5-ton cab cranes · new columns · column caps · ${spanText} continuous capped`,tie:'none',tieLabel:'No flange tie (column cap)',
   girderSystem:'continuous-capped',outcome:'not-run',governing:null,open:[],calcSeconds:null,counts:{}});
 });
 it('reads quoted CSV fields and takes the governing design ratio when nothing fails',()=>{
  const rows=parseCsv(checksCsv);
  expect(rows).toHaveLength(5);expect(rows[1].title).toBe('Girder · flexure, top flange');
  expect(governingCheck({checks:rows.filter(r=>r.status!=='fail')})).toEqual({id:'girder-flexure',title:'Girder · flexure, top flange',status:'pass',utilization:0.812});
  // Without a check table only failing summary items count; the summary's placeholder ratios of 1 do not.
  expect(governingCheck({summary:{...summary,open:[]}})).toBeNull();
  expect(governingCheck({summary})?.utilization).toBe(1.41);
  // Unknown support kinds of a regenerated set are spelled from their id.
  expect(caseEntry({id:7,config:{...config,support:'stepped-column'},project:exampleProject}).title).toContain('· stepped column ·');
 });
 it('the published case set has a project file for every index entry',()=>{
  const dir=path.join(__dirname,'..','public','cases'),index=JSON.parse(readFileSync(path.join(dir,'index.json'),'utf8')) as SampleCaseIndex;
  expect(index.count).toBe(index.cases.length);expect(index.count).toBeGreaterThan(0);
  for(const c of index.cases)expect(existsSync(path.join(dir,c.file)),c.file).toBe(true);
  expect(readdirSync(dir).filter(f=>/^\d+\.json$/.test(f))).toHaveLength(index.count);
 });
});

// Gallery fixture: the exported entries of the fixture set plus variants.
const base=caseEntry({id:1,descriptor:'fixture',config,project:exampleProject},{summary,checks:parseCsv(checksCsv)});
const entries:SampleCaseEntry[]=[
 base,
 {...caseEntry({id:2,config:{...config,structure:'new',support:'column-cap',capacity:30},project:exampleProject},{summary:{...summary,outcome:'eligible',open:[],counts:{pass:500}},checks:parseCsv(checksCsv).filter(r=>r.status!=='fail')})},
 {...caseEntry({id:3,config:{...config,capacity:2,tie:'flexible-plate'},project:exampleProject},{summary:{...summary,outcome:'review-draft',open:[{id:'x',title:'Rail fatigue',status:'unverified',utilization:null}]}})},
];
const fixture:SampleCaseIndex={version:1,generated:'2026-10-19',count:entries.length,cases:entries};

function find(node:ReactNode,match:(e:ReactElement<any>)=>boolean,found:ReactElement<any>[]=[]):ReactElement<any>[]{
 if(Array.isArray(node))for(const n of node)find(n,match,found);
 else if(isValidElement(node)){const e=node as ReactElement<any>;if(match(e))found.push(e);find(e.props.children,match,found);}
 return found;
}

describe('sample case gallery',()=>{
 it('filters by structure, support, tie, girder system, capacity and outcome and sorts by D/C',()=>{
  const ids=(f:Partial<typeof emptyFilters>)=>filterCases(entries,{...emptyFilters,...f}).map(c=>c.id);
  expect(ids({})).toEqual([1,2,3]);
  expect(ids({structure:'new'})).toEqual([2]);
  expect(ids({support:'twin-rib',tie:'flexible-plate'})).toEqual([3]);
  expect(ids({girderSystem:'simple-rolled',capacity:'small'})).toEqual([3]);
  expect(ids({capacity:'heavy'})).toEqual([]);expect(ids({capacity:'large'})).toEqual([2]);expect(ids({capacity:'medium'})).toEqual([1]);
  expect(ids({outcome:'review-draft'})).toEqual([3]);
  expect(ids({query:'column caps'})).toEqual([2]);expect(ids({query:'002'})).toEqual([2]);
  expect(ids({sort:'dc'})).toEqual([1,2,3]);// 1.41, 0.81, none
  expect(ids({sort:'capacity'})).toEqual([3,1,2]);
 });
 it('renders the cases of an index with their outcome, D/C and the fictitious-data note',()=>{
  const html=renderToStaticMarkup(createElement(SampleCaseGallery,{index:fixture,onOpen:()=>{}}));
  expect(html).toContain('3 cases');
  expect(html).toContain(base.title);expect(html).toContain('With failures');expect(html).toContain('Review draft');
  expect(html).toContain('D/C 1.41');expect(html).toContain('Column bracket applicability');
  expect(html).toMatch(/fictitious demonstration configurations/);
  expect(html).toContain('aria-label="Open case 001: ');expect(html).toContain('aria-label="Open case 001 on the drawing sheets"');
  // Initial filters narrow the list and offer to clear them.
  const narrowed=renderToStaticMarkup(createElement(SampleCaseGallery,{index:fixture,onOpen:()=>{},initialFilters:{structure:'new'}}));
  expect(narrowed).toContain('1 of 3 cases');expect(narrowed).toContain('Clear filters');
  expect(narrowed).not.toContain('aria-label="Open case 001');expect(narrowed).toContain('aria-label="Open case 002');
  expect(renderToStaticMarkup(createElement(SampleCaseGallery,{index:fixture,onOpen:()=>{},initialFilters:{capacity:'heavy'}}))).toContain('No cases match these filters.');
 });
 it('Open and Drawings call the load path with their view',()=>{
  const onOpen=vi.fn(),card=CaseCard({entry:base,onOpen}),buttons=find(card,e=>e.type==='button');
  expect(buttons.map(b=>b.props['aria-label'])).toEqual([`Open case 001: ${base.title}`,'Open case 001 on the drawing sheets']);
  buttons[0].props.onClick();buttons[1].props.onClick();
  expect(onOpen.mock.calls).toEqual([['Calculation'],['Diagrams']]);
 });
 it('loads a case: fetches its file, validates it and hands the project to the app',async()=>{
  const onOpen=vi.fn(),fetcher=vi.fn(async(_url:string)=>({ok:true,status:200,json:async()=>structuredClone(exampleProject)}));
  await openSampleCase(base,'Diagrams',{onOpen,fetcher});
  expect(fetcher).toHaveBeenCalledWith('/cases/001.json');
  expect(onOpen).toHaveBeenCalledWith(exampleProject,base,'Diagrams');
  // An invalid or missing file is refused and nothing is loaded.
  const invalid=structuredClone(exampleProject) as any;invalid.section.d=0;onOpen.mockClear();
  await expect(openSampleCase(base,'Calculation',{onOpen,fetcher:async()=>({ok:true,status:200,json:async()=>invalid})})).rejects.toThrow(/Case 001 is not a valid project: section\.d/);
  await expect(openSampleCase(base,'Calculation',{onOpen,fetcher:async()=>({ok:false,status:404,json:async()=>null})})).rejects.toThrow(/HTTP 404/);
  expect(onOpen).not.toHaveBeenCalled();
 });
});

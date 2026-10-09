import { exampleProject } from '../src/engine/defaults';
import { loadAiscSection } from '../src/data/aiscSections';
import { sectionProperties } from '../src/engine/section';
import { girderStrength } from '../src/engine/aiscStrength';
import { Beam, momentAt, type BeamResult } from '../src/engine/beam';
import { toDisplay } from '../src/engine/units';
import { runPermitBenchmarks, type PermitBenchmarkResult } from './permitPackages';
import { beamCases, strengthCases, permitSources, type BeamCase } from './permitCases';

const inch=25.4, foot=304.8, kip=4448.221615, ksi=6.894757293;
export interface SuiteResult extends PermitBenchmarkResult {
  sourceId:string; printedPage?:string; absoluteTolerance:number;
  expectation:'agreement'|'conservative'|'rounding'|'unresolved';
}
type Row = Omit<SuiteResult,'relativeDifference'|'status'>;
export function comparePermitRow(row:Row):SuiteResult {
  const a=typeof row.published==='number'?[row.published]:row.published;
  const b=typeof row.computed==='number'?[row.computed]:row.computed;
  if(a.length!==b.length||a.some(v=>!Number.isFinite(v))||b.some(v=>!Number.isFinite(v)))throw Error(`Invalid benchmark ${row.id}`);
  const errors=a.map((v,i)=>Math.abs(v-b[i]));
  const relativeDifference=Math.max(...errors.map((v,i)=>v/Math.max(Math.abs(a[i]),1e-12)));
  const matches=errors.every((v,i)=>v<=Math.max(row.absoluteTolerance,row.tolerance*Math.abs(a[i])));
  return {...row,relativeDifference,status:matches?'match':'difference'};
}

type Loading=BeamCase['strength'];
function beamResponse(beam:Beam,load:Loading):BeamResult {
  const points=(load.points??[]).map(p=>({x:p.x*foot,p:p.p*kip}));
  // Two-point Gauss integration is exact for the engine's cubic load shapes.
  // Split at actual FE nodes and partial-load boundaries. This is a fixture
  // adapter to existing point-load mechanics, not a new app load capability.
  for(const partial of load.partial??[]){
    const lo=partial.from*foot,hi=partial.to*foot;
    const cuts=[lo,...beam.nodes.filter(x=>x>lo&&x<hi),hi];
    for(let i=1;i<cuts.length;i++){
      const mid=(cuts[i-1]+cuts[i])/2,half=(cuts[i]-cuts[i-1])/2;
      for(const sign of [-1,1])points.push({x:mid+sign*half/Math.sqrt(3),p:partial.q*kip/foot*half});
    }
  }
  return beam.evaluate(points,load.q*kip/foot);
}
function peakMoment(response:BeamResult,loading:Loading,span:number):number {
  // Reactions come from the shared solver. Locate exact V=0 roots between
  // load discontinuities instead of copying a rounded report station grid.
  const reactions=response.reactions.map(r=>({x:r.x/foot,r:r.r/kip}));
  const points=loading.points??[],partials=loading.partial??[];
  const cuts=[...new Set([0,span,...points.map(p=>p.x),...partials.flatMap(p=>[p.from,p.to])])].sort((a,b)=>a-b);
  const moment=(x:number)=>momentAt(x,reactions,points,loading.q)+partials.reduce((m,p)=>{
    const extent=Math.min(Math.max(x-p.from,0),p.to-p.from);
    return m-p.q*extent*(x-p.from-extent/2);
  },0);
  const shear=(x:number)=>reactions.reduce((v,r)=>v+(r.x<=x?r.r:0),0)-points.reduce((v,p)=>v+(p.x<=x?p.p:0),0)-loading.q*x-partials.reduce((v,p)=>v+p.q*Math.min(Math.max(x-p.from,0),p.to-p.from),0);
  const stations=[...cuts];
  for(let i=1;i<cuts.length;i++){
    const mid=(cuts[i-1]+cuts[i])/2;
    const q=loading.q+partials.filter(p=>mid>p.from&&mid<p.to).reduce((v,p)=>v+p.q,0);
    if(q){const root=mid+shear(mid)/q;if(root>cuts[i-1]&&root<cuts[i])stations.push(root);}
  }
  return Math.max(...stations.map(x=>Math.abs(moment(x))));
}

export function runAllPermitBenchmarks():SuiteResult[] {
  const rows:SuiteResult[]=runPermitBenchmarks().map(row=>comparePermitRow({...row,sourceId:'everett',absoluteTolerance:0,expectation:['end-crippling','end-compression'].includes(row.id)?'unresolved':'agreement'}));
  for(const c of strengthCases){
    const p=structuredClone(exampleProject);
    p.method=c.method;p.section=loadAiscSection(p.section,c.shape);
    p.section.Fy=c.Fy*ksi;p.section.E=c.E*ksi;p.unbracedLength=c.LbIn*inch;
    // Existing example hole data must not impose a net-section reduction.
    if(p.aist)p.aist.netFlangeArea=0;
    const strength=girderStrength(p,sectionProperties(p.section));
    for(const v of c.values){
      const value=strength[v.key];
      const computed=v.unit==='kip-ft'?toDisplay(value,'moment','US'):v.unit==='kip-in'?toDisplay(value,'moment','US')*12:v.unit==='kip'?toDisplay(value,'force','US'):v.unit==='in'?value/inch:value;
      rows.push(comparePermitRow({id:`${c.sourceId}-${v.key}`,sourceId:c.sourceId,check:`${c.shape} ${v.key==='major'?'available major-axis flexure':v.key==='shear'?'available web shear':v.key==='flangeRatio'?'flange width/thickness ratio':v.key}`,page:v.page,printedPage:v.printedPage,unit:v.unit,published:v.published,computed,tolerance:v.tolerance??.001,absoluteTolerance:0,expectation:v.expectation??'agreement',note:v.note??`${c.method}; Fy=${c.Fy} ksi, E=${c.E} ksi, Lb=${c.LbIn} in. Shared AISC strength engine; Cb=1.`}));
    }
  }
  for(const c of beamCases){
    const project=structuredClone(exampleProject);
    const I=c.I??sectionProperties(loadAiscSection(project.section,c.shape!)).Ix/inch**4;
    const beam=new Beam(0,c.span*foot,c.E*ksi*I*inch**4,[0,c.span*foot],160);
    const strength=beamResponse(beam,c.strength);
    const service=c.service?beamResponse(beam,c.service):undefined;
    const live=c.live?beamResponse(beam,c.live):undefined;
    const dead=c.dead?beamResponse(beam,c.dead):undefined;
    if([strength,service,live,dead].some(r=>r&&r.equilibriumError>1e-7))throw Error(`Equilibrium failed: ${c.sourceId}`);
    const deflection=(r:BeamResult|undefined)=>r?Math.max(...r.displacement.map(Math.abs))/inch:NaN;
    const outputs={moment:peakMoment(strength,c.strength,c.span),reaction:Math.max(...strength.reactions.map(r=>Math.abs(r.r)))/kip,totalDeflection:deflection(service),liveDeflection:deflection(live),deadReaction:dead?Math.max(...dead.reactions.map(r=>Math.abs(r.r)))/kip:NaN};
    for(const v of c.values){
      const isDeflection=v.key.includes('Deflection');
      const unresolved=isDeflection&&['intrachat','dish','yusen','fused','falkner'].includes(c.sourceId);
      rows.push(comparePermitRow({id:`${c.sourceId}-${v.key}`,sourceId:c.sourceId,check:v.key==='moment'?'Applied peak bending moment':v.key==='reaction'?'Peak support reaction / shear':v.key==='deadReaction'?'Peak dead-load support reaction':v.key==='totalDeflection'?'Total service deflection':'Transient/live deflection',page:v.page??c.page,printedPage:v.page&&v.page!==c.page?undefined:c.printedPage,unit:isDeflection?'in':v.key==='moment'?'kip-ft':'kip',published:v.published,computed:outputs[v.key],tolerance:.001,absoluteTolerance:v.absoluteTolerance??0,expectation:unresolved?'unresolved':'agreement',note:`Shared Euler–Bernoulli solver; simple ${c.span} ft span, E=${c.E} ksi, I=${I} in4. Explicit published loading; extrema use 160 displacement intervals and exact moment stations. ${unresolved?'Published displacement is slightly higher than the bending-only replay; source analysis details are insufficient to establish why. Independent uniform-load closed-form checks agree with this engine; do not relabel this comparison matched. ':''}No building-code load generation or whole-building analysis.`}));
    }
  }
  for(const source of permitSources)if(!rows.some(r=>r.sourceId===source.id))throw Error(`Untested source: ${source.id}`);
  return rows;
}

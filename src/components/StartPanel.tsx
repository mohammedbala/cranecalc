import {useEffect,useRef,useState} from 'react';
import {Hammer,LayoutTemplate,LoaderCircle,RotateCcw,TriangleAlert} from 'lucide-react';
import {runwayTemplates,type RunwayTemplate} from '../engine/templates';
import {defaultRunwayConfig,supportLabels,tieLabels,type RunwayConfig,type SupportKind,type TieKind} from '../engine/configInputs';
import {normalizeConfig,type previewConfig} from '../engine/configurator';
import {aiscWShapes} from '../data/aiscSections';
import type {ProjectInput} from '../engine/types';

type Preview=ReturnType<typeof previewConfig>;
const kip=4448.2216152605,inch=25.4,foot=304.8,fpm=5.08;
const k=(v:number,digits=1)=>`${(v/kip).toFixed(digits)} kip`;
const n=(v:number)=>v.toLocaleString('en-US');

/** Configurator work in a worker (the girder sizing runs a moving-load analysis); on the main thread without workers. */
function useConfigRunner(){
 const worker=useRef<Worker|null>(null),pending=useRef(new Map<number,{resolve:(v:unknown)=>void;reject:(e:Error)=>void}>()),sequence=useRef(0);
 useEffect(()=>()=>{worker.current?.terminate();worker.current=null;},[]);
 return (type:'preview'|'build',config:RunwayConfig):Promise<unknown>=>{
  if(typeof Worker==='undefined')return import('../engine/configurator').then(m=>type==='build'?m.buildProject(config):m.previewConfig(config));
  if(!worker.current){
   const w=new Worker(new URL('../engine/configWorker.ts',import.meta.url),{type:'module'});
   w.onmessage=e=>{const p=pending.current.get(e.data.requestId);if(!p)return;pending.current.delete(e.data.requestId);if(e.data.error)p.reject(Error(e.data.error));else p.resolve(e.data.result);};
   w.onerror=e=>{for(const p of pending.current.values())p.reject(Error(e.message||'Configurator failed'));pending.current.clear();worker.current?.terminate();worker.current=null;};
   worker.current=w;
  }
  const requestId=++sequence.current;
  return new Promise((resolve,reject)=>{pending.current.set(requestId,{resolve,reject});worker.current!.postMessage({type,config,requestId});});
 };
}

/** Elevation sketch of a configuration's support: the column, the bracket or cap, the girder and its tie. */
export function SupportSketch({config}:{config:RunwayConfig}){
 const s=config.support,newColumn=config.structure==='new',capped=config.girder==='capped',analysis=config.scope==='analysis';
 const girder=<g>{/* girder section */}<path d="M66 15H90M66 17H90M78 17V40M66 40H90M66 42H90" strokeWidth="1.6"/>{capped&&<path d="M63 12V15H93V12" strokeWidth="1.4"/>}<rect x="75" y={capped?6:8} width="6" height={capped?6:7} fill="currentColor" stroke="none" opacity=".75"/></g>;
 if(analysis)return <svg viewBox="0 0 120 80" className="support-sketch" aria-hidden="true" fill="none" stroke="currentColor"><path d="M8 46H112" strokeWidth="3"/><path d="M14 50l-5 8h10zM60 50l-5 8h10zM106 50l-5 8h10z" strokeWidth="1.2"/>{[30,42,78,90].map(x=><path key={x} d={`M${x} 20V40M${x-3} 35l3 5 3-5`} strokeWidth="1.3"/>)}<path d="M8 68H112" strokeWidth=".6" strokeDasharray="2 2"/></svg>;
 const column=s==='column-cap'
  ?<g><rect x="70" y="44" width="16" height="30" strokeWidth="1.4"/><path d="M62 43H94" strokeWidth="2.4"/>{[72,84].map(x=><path key={x} d={`M${x} 44V52`} strokeWidth="1"/>)}</g>
  :<g><rect x="12" y="4" width="12" height="70" strokeWidth="1.4" strokeDasharray={newColumn?undefined:'0'}/>{!newColumn&&<path d="M12 10l12 8M12 26l12 8M12 42l12 8M12 58l12 8" strokeWidth=".5"/>}</g>;
 const base=newColumn?<g><path d={s==='column-cap'?'M66 74H90':'M8 74H28'} strokeWidth="2"/><rect x={s==='column-cap'?60:4} y="74" width="36" height="5" strokeWidth=".8" strokeDasharray="2 1.5"/></g>:<path d="M2 74H118" strokeWidth=".6"/>;
 const seat='M24 42H92';
 const bracket=s==='twin-rib'?<g><path d={seat} strokeWidth="2.2"/><rect x="24" y="43" width="56" height="18" strokeWidth="1.3"/></g>
  :s==='haunched-seat'?<g><path d={seat} strokeWidth="2.2"/><path d="M24 43H84V49L24 66Z" strokeWidth="1.3"/></g>
  :s==='rolled-corbel'?<g><path d={seat} strokeWidth="2.2"/><path d="M24 45H86M24 59H86M86 45V59M24 52H86" strokeWidth="1.3"/></g>
  :s==='tapered-haunch'?<g><path d={seat} strokeWidth="2.2"/><path d="M24 70L88 49M24 52 88 46" strokeWidth="1.3"/><path d="M88 43V49" strokeWidth="1.3"/></g>
  :s==='by-others'?<g><path d={seat} strokeWidth="1.6" strokeDasharray="3 2"/><path d="M24 43H80V60H24" strokeWidth="1" strokeDasharray="3 2"/></g>:null;
 const tie=s==='column-cap'?null:config.tie==='cap-angle'?<path d="M24 12H62V9" strokeWidth="1.6"/>:<path d="M24 16H66" strokeWidth={config.tie==='flexible-plate'?1:2}/>;
 return <svg viewBox="0 0 120 80" className="support-sketch" aria-hidden="true" fill="none" stroke="currentColor">{column}{bracket}{girder}{tie}{base}</svg>;
}

function TemplateCard({t,onCustomize,onBuild,busy}:{t:RunwayTemplate;onCustomize:()=>void;onBuild:()=>void;busy:boolean}){
 const c=t.config;
 return <article className="template-card">
  <div className="template-figure"><SupportSketch config={c}/></div>
  <div className="template-body">
   <h3>{t.name}</h3>
   <p>{t.summary}</p>
   <p className="template-facts">{c.cranes===2?'2 × ':''}{c.capacity} t {c.control} · {c.bays} × {c.span} ft {c.system} · CMAA {c.cmaa} · Class {c.buildingClass}</p>
   <div className="template-tags">{t.tags.map(tag=><span key={tag}>{tag}</span>)}</div>
   <div className="template-actions">
    <button className="outline-button" onClick={onCustomize}>Customize</button>
    <button className="outline-button primary" disabled={busy} onClick={onBuild}>{busy?<LoaderCircle size={13} className="spin"/>:<Hammer size={13}/>}Build</button>
   </div>
  </div>
 </article>;
}

function NumberField({label,unit,value,onChange,min,max,step=1,placeholder}:{label:string;unit:string;value:number|undefined;onChange:(v:number|undefined)=>void;min:number;max:number;step?:number;placeholder?:string}){
 const [text,setText]=useState(value===undefined?'':String(value));
 useEffect(()=>{setText(value===undefined?'':String(value));},[value]);
 const v=Number(text),invalid=text!==''&&(!Number.isFinite(v)||v<min||v>max);
 return <label className="field"><span>{label}</span><div className={`number-wrap ${invalid?'invalid':''}`}><input type="number" inputMode="decimal" value={text} min={min} max={max} step={step} placeholder={placeholder}
  onChange={e=>{setText(e.target.value);const x=Number(e.target.value);if(e.target.value==='')onChange(placeholder?undefined:value);else if(Number.isFinite(x)&&x>=min&&x<=max)onChange(x);}}/><span>{unit}</span></div></label>;
}
function Select<T extends string|number>({label,value,options,onChange}:{label:string;value:T;options:{value:T;label:string;disabled?:string}[];onChange:(v:T)=>void}){
 return <label className="field"><span>{label}</span><select value={String(value)} onChange={e=>{const o=options.find(x=>String(x.value)===e.target.value);if(o)onChange(o.value);}}>
  {options.map(o=><option key={String(o.value)} value={String(o.value)} disabled={!!o.disabled} title={o.disabled}>{o.label}{o.disabled?' (n/a)':''}</option>)}</select></label>;
}

const compactW=aiscWShapes.filter(s=>s.d>=12&&s.d<=40&&s.bf/(2*s.tf)<=.38*Math.sqrt(29000/50)&&(s.d-2*s.kdes)/s.tw<=3.76*Math.sqrt(29000/50)).sort((a,b)=>a.d-b.d||a.weight-b.weight).map(s=>s.name);
const columnShapes=aiscWShapes.filter(s=>s.name.startsWith('W14X')&&s.weight>=61&&s.weight<=398).sort((a,b)=>a.weight-b.weight).map(s=>s.name);
const channels=['C10X15.3','C12X20.7','C12X25','C15X33.9','C15X40','C15X50','MC18X42.7'];
const classCycles={A:'more than 500,000',B:'100,000–500,000',C:'20,000–100,000',D:'up to 20,000'} as const;

/** Templates and the quick configurator: the shortest way from a few choices to a complete runway package. */
export default function StartPanel({project,onBuild}:{project:ProjectInput;onBuild:(p:ProjectInput,label:string)=>void}){
 const [config,setConfig]=useState<RunwayConfig>(()=>project.configurator?{...defaultRunwayConfig,...project.configurator}:{...runwayTemplates[0].config});
 const [notes,setNotes]=useState<string[]>([]),[preview,setPreview]=useState<Preview|null>(null),[previewError,setPreviewError]=useState(''),[building,setBuilding]=useState('');
 const formRef=useRef<HTMLElement>(null),run=useConfigRunner();
 useEffect(()=>{let live=true;const t=setTimeout(()=>{run('preview',config).then(r=>{if(live){setPreview(r as Preview);setPreviewError('');}},e=>{if(live)setPreviewError(e instanceof Error?e.message:String(e));});},350);return ()=>{live=false;clearTimeout(t);};},[config]);// eslint-disable-line react-hooks/exhaustive-deps
 // Dependent choices follow at once: an incompatible pair is adjusted and the reason shown.
 const set=(patch:Partial<RunwayConfig>)=>setConfig(c=>{const r=normalizeConfig({...c,...patch});setNotes(r.changes);return r.config;});
 const build=async(cfg:RunwayConfig,label:string)=>{
  setBuilding(label);
  try{onBuild(await run('build',cfg) as ProjectInput,label);}
  catch(e){setPreviewError(e instanceof Error?e.message:String(e));}
  finally{setBuilding('');}
 };
 const customize=(t:RunwayTemplate)=>{setConfig({...t.config});setNotes([]);formRef.current?.scrollIntoView({behavior:'smooth',block:'start'});};
 const c=config,design=c.scope==='design',supports:{value:SupportKind;label:string;disabled?:string}[]=(Object.keys(supportLabels) as SupportKind[]).map(v=>({value:v,label:supportLabels[v],
  disabled:v==='by-others'&&c.structure==='new'?'new columns carry a bracket designed here':v==='column-cap'&&c.structure!=='new'?'column caps sit on new columns':v==='by-others'&&c.system==='continuous'?'continuous girders need a seat designed here':undefined}));
 const ties:{value:TieKind;label:string;disabled?:string}[]=(Object.keys(tieLabels) as TieKind[]).map(v=>({value:v,label:tieLabels[v],
  disabled:c.support==='column-cap'&&v!=='paired-bars'?'a column cap holds the girder without a flange tie':v==='cap-angle'&&c.girder!=='capped'?'bolts to a channel cap':v!=='paired-bars'&&c.system==='continuous'?'simple spans only':undefined}));
 const p=preview,crane=p?.crane;
 return <>
  <div className="result-head"><div><div className="eyebrow">START</div><h2>Templates & quick setup</h2></div><span className="model-tag">{runwayTemplates.length} templates</span></div>
  <div className="source-intro"><LayoutTemplate size={21}/><p>Pick the template closest to your runway, or set the choices below, then build. The configurator generates every dependent input: crane wheel loads and bumper data from the capacity and span, the rail, the girder size, bearings, ties, the bracket or cap, the columns and their foundations. Supplier, survey and site data are fictitious examples, marked for replacement before a project is issued. Everything stays editable under Inputs & checks.</p></div>
  {project.configurator&&<div className="config-current"><span>Current project built from {project.configurator.template?runwayTemplates.find(t=>t.id===project.configurator!.template)?.name??'a template':'the configurator'}: {project.configurator.title}</span><button className="text-button" onClick={()=>{setConfig({...defaultRunwayConfig,...project.configurator!});setNotes([]);formRef.current?.scrollIntoView({behavior:'smooth',block:'start'});}}><RotateCcw size={12}/>Edit its choices</button></div>}
  <div className="template-grid">{runwayTemplates.map(t=><TemplateCard key={t.id} t={t} busy={building===t.name} onCustomize={()=>customize(t)} onBuild={()=>void build(t.config,t.name)}/>)}</div>
  <section ref={formRef} className="configurator" aria-label="Quick configurator">
   <div className="result-head"><div><div className="eyebrow">QUICK CONFIGURATOR</div><h2>Set up a runway</h2></div><span className="model-tag">{c.template?`From ${runwayTemplates.find(t=>t.id===c.template)?.name.split(' · ')[0]??c.template}`:'Custom'}</span></div>
   <div className="config-layout">
    <div className="config-form">
     <fieldset><legend>Project</legend><div className="field-grid">
      <label className="field"><span>Title</span><input value={c.title} maxLength={120} onChange={e=>set({title:e.target.value})}/></label>
      <label className="field"><span>Project number</span><input value={c.number} maxLength={80} onChange={e=>set({number:e.target.value})}/></label>
      <Select label="Package" value={c.scope} options={[{value:'design',label:'Full design and drawings'},{value:'analysis',label:'Girder analysis only'}]} onChange={v=>set({scope:v})}/>
      <Select label="Design method" value={c.method} options={[{value:'LRFD',label:'LRFD'},{value:'ASD',label:'ASD'}]} onChange={v=>set({method:v})}/>
     </div></fieldset>
     <fieldset><legend>Crane</legend><div className="field-grid">
      <NumberField label="Rated capacity" unit="US tons" value={c.capacity} min={.5} max={60} step={.5} onChange={v=>v!==undefined&&set({capacity:v})}/>
      <NumberField label="Crane span (rail to rail)" unit="ft" value={c.craneSpan} min={20} max={150} onChange={v=>v!==undefined&&set({craneSpan:v})}/>
      <Select label="Operation" value={c.control} options={[{value:'cab',label:'Cab or radio (25% impact)'},{value:'pendant',label:'Pendant (10% impact)'}]} onChange={v=>set({control:v})}/>
      <Select label="CMAA service class" value={c.cmaa} options={(['A','B','C','D'] as const).map(v=>({value:v,label:`Class ${v}${v==='D'?' (L/800)':''}`}))} onChange={v=>set({cmaa:v})}/>
      <Select label="Cranes on the runway" value={c.cranes} options={[{value:1,label:'One crane'},{value:2,label:'Two identical cranes'}]} onChange={v=>set({cranes:v as 1|2})}/>
      <Select label="AIST building class" value={c.buildingClass} options={(['A','B','C','D'] as const).map(v=>({value:v,label:`Class ${v} · ${classCycles[v]} cycles`}))} onChange={v=>set({buildingClass:v})}/>
     </div></fieldset>
     <fieldset><legend>Runway</legend><div className="field-grid">
      <NumberField label="Bays" unit="bays" value={c.bays} min={1} max={6} onChange={v=>v!==undefined&&set({bays:Math.round(v)})}/>
      <NumberField label="Bay length (column to column)" unit="ft" value={c.span} min={10} max={50} step={.5} onChange={v=>v!==undefined&&set({span:v})}/>
      <Select label="Girder system" value={c.system} options={[{value:'simple',label:'Simple spans'},{value:'continuous',label:'Continuous girder'}]} onChange={v=>set({system:v})}/>
      <NumberField label="Top of rail above floor" unit="ft" value={c.railElevation} min={10} max={60} step={.5} onChange={v=>v!==undefined&&set({railElevation:v})}/>
     </div></fieldset>
     <fieldset><legend>Girder</legend><div className="field-grid">
      <Select label="Girder type" value={c.girder} options={[{value:'rolled',label:'Rolled W shape'},{value:'capped',label:'W shape + channel cap'}]} onChange={v=>set({girder:v,girderShape:undefined,capChannel:undefined})}/>
      <Select label="Girder section" value={c.girderShape??''} options={[{value:'',label:'Size automatically'},...compactW.map(v=>({value:v,label:v}))]} onChange={v=>set({girderShape:v||undefined,...(c.girder==='capped'&&v&&!c.capChannel?{capChannel:'C15X33.9'}:{})})}/>
      {c.girder==='capped'&&<Select label="Cap channel" value={c.capChannel??''} options={[{value:'',label:'Size automatically'},...channels.map(v=>({value:v,label:v}))]} onChange={v=>set({capChannel:v||undefined})}/>}
     </div></fieldset>
     {design&&<fieldset><legend>Supports and tieback</legend><div className="field-grid">
      <Select label="Structure" value={c.structure} options={[{value:'existing',label:'Existing building columns'},{value:'new',label:'New freestanding columns'}]} onChange={v=>set({structure:v,columnShape:undefined})}/>
      <Select label="Girder support" value={c.support} options={supports} onChange={v=>set({support:v})}/>
      <Select label="Top-flange tieback" value={c.tie} options={ties} onChange={v=>set({tie:v})}/>
      {c.support!=='by-others'&&<Select label={c.structure==='new'?'New column':'Existing column'} value={c.columnShape??''} options={[{value:'',label:'Chosen for the crane'},...columnShapes.map(v=>({value:v,label:v}))]} onChange={v=>set({columnShape:v||undefined})}/>}
      {c.support!=='column-cap'&&<NumberField label="Column face to girder web" unit="in" value={c.reach} placeholder="20" min={12} max={48} step={.5} onChange={v=>set({reach:v})}/>}
     </div></fieldset>}
     {notes.length>0&&<div className="inline-note config-notes"><TriangleAlert size={14}/><div>{notes.map(v=><p key={v}>{v}</p>)}</div></div>}
    </div>
    <aside className="config-summary" aria-live="polite">
     <h3>What will be built</h3>
     {previewError&&<div className="error-banner"><TriangleAlert size={14}/><p>{previewError}</p></div>}
     {!p&&!previewError&&<p className="subtle"><LoaderCircle size={12} className="spin"/> Sizing…</p>}
     {p&&crane&&<dl>
      <div><dt>Crane</dt><dd>{c.cranes===2?'2 × ':''}{c.capacity}-ton {crane.double?'double':'single'}-girder {c.control}: rated {k(crane.Q)}, trolley {k(crane.T)}, bridge {k(crane.B)}</dd></div>
      <div><dt>Wheels</dt><dd>{crane.offsets.length} per rail{crane.offsets.length===2?` at ${(crane.offsets[1]/foot).toFixed(1)} ft`:''}: max {k(crane.Pmax)}, empty {k(crane.Pempty)}, min {k(crane.Pmin)} (static, each)</dd></div>
      <div><dt>Travel & bumper</dt><dd>{Math.round(crane.speed/fpm)} fpm; {(crane.stroke/inch).toFixed(0)} in stroke, {k(crane.bumper)} bumper force; impact {Math.round(crane.impact*100)}%</dd></div>
      <div><dt>Duty</dt><dd>Class {c.buildingClass}: {n(p.spectrum.total)} cycles ({p.spectrum.bins.map(b=>`${n(b.cycles)} at ${b.liftFraction*100}%`).join(', ')}); vertical L/{p.verticalLimit}</dd></div>
      <div><dt>Rail</dt><dd>{(p.railDepth/inch).toFixed(2)} in rail, weld-on clips (example data)</dd></div>
      <div><dt>Girder</dt><dd><strong>{p.girder}</strong>{p.trial?` · sized: DG7 top-flange ratio ${p.trial.utilization.toFixed(2)}, deflection ${p.trial.deflection.toFixed(2)} of L/${p.verticalLimit}`:' · as selected'}</dd></div>
      {design&&<div><dt>Supports</dt><dd>{c.structure==='new'?'New':'Existing'} {p.column??''} columns · {supportLabels[c.support]}{c.support==='column-cap'?'':` · ${tieLabels[c.tie]}`}{c.structure==='new'?' · base plates, footings, rod bracing':''}</dd></div>}
     </dl>}
     <button className="generate" disabled={!!building} onClick={()=>void build(config,config.title)}>{building===config.title?<LoaderCircle size={16} className="spin"/>:<Hammer size={16}/>}Build project</button>
     <p className="form-note">Building replaces the current project (save it first if you need it). The full calculation then runs; open items show what to resolve.</p>
    </aside>
   </div>
  </section>
 </>;
}

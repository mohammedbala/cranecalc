import {useState} from 'react';
import {ArrowUpRight,Check,ChevronDown,ChevronRight,CircleHelp,X} from 'lucide-react';
import katex from 'katex';
import type {CheckResult,ProjectInput} from '../engine/types';
import {format} from '../engine/units';
import {references} from '../engine/references';

import {checkGroupPurpose} from './checkFigures';
import {CheckFigure} from './CheckFigure';
export {checkGroupPurpose} from './checkFigures';
export function checkPurpose(c:CheckResult):string{
 const key=(c.id+' '+c.title).toLowerCase();
 if(c.status==='unsupported')return 'Confirm that a compatible calculation model exists for this selection.';
 if(c.status==='not-applicable')return 'Document why this provision does not apply to the selected arrangement.';
 const specific:Record<string,string>={
  'building-class':'Match the owner’s building load repetitions to the selected AIST class.',
  'design-scope':'Confirm which actions reach this girder before applying runway-only combinations.',
  'load-basis':'Combine crane actions in the applicable operating states and directions.',
  'compact-flange':'Limit flange width-to-thickness ratios to satisfy the compact-element requirement.',
  'compact-web':'Limit web depth-to-thickness ratio to satisfy the compact-element requirement.',
  'axial':'Resist longitudinal compression with the assumed effective lengths and restraints.',
  'minimum-thickness':'Provide the minimum steel thickness for the exposure and member type.',
  'rail-clips':'Keep opposing clip pairs within the maximum permitted spacing.',
  'rail-keeper-float':'Keep the rail float in the keepers plus its setting tolerance within the design rail eccentricity.',
  'rail-anchor-weld':'Carry the crane longitudinal force and rail creep from the rail anchor into the girder.',
  'rail-end-gap':'Keep the anchored rail end clear of the end stop over the rail temperature swing.',
  'column-brackets':'Check the reaction limit for using brackets; bracket resistance is checked separately.',
  'bolt-spacing':'Provide the minimum bolt center spacing; fastener strength is checked separately.',
  'equilibrium':'Confirm that support reactions balance applied loads.',
  'design-equilibrium':'Confirm equilibrium for the decomposed design-load responses.',
  'convergence':'Confirm that a finer crane travel grid does not materially change peak demands.',
  'design-travel':'Confirm that finer crane positioning captures the governing design combination.',
  'mesh':'Confirm that finer sampling along the beam does not materially change demands.',
  'design-mesh':'Confirm that finer station sampling captures the governing design response.'
 };
 if(specific[c.id])return specific[c.id];
 if(c.group==='Analysis')return checkGroupPurpose.Analysis;
 if(/survey|assessment|source|documented|material basis/.test(key))return 'Establish the documented geometry, material or resistance used in the design.';
 if(/fatigue|cyclic|miner|stress range/.test(key))return 'Control repeated-load cracking over the specified service life.';
 if(/deflect|drift|rotation|twist|rail-head|rail head/.test(key))return 'Limit movement to the specified operating or serviceability criterion.';
 if(/buckl|stability|ltb|slender/.test(key))return 'Prevent instability under the applied forces and assumed restraints.';
 if(/interaction|combined|h3|h1/.test(key))return 'Check simultaneous actions together, rather than separate maxima.';
 if(/weld/.test(key))return 'Transfer the connection force through the weld and connected steel.';
 if(/bolt|slip|hole|edge distance|pitch|gauge/.test(key))return 'Check fastener force transfer or the geometry required by the connection.';
 if(/bearing|crippl|stiffener|local flange|local web/.test(key))return 'Resist concentrated load at the wheel, bearing or attachment.';
 if(/flexur|bending|moment/.test(key))return 'Resist the governing bending action at the checked member or plate.';
 if(/shear/.test(key))return 'Resist the applied shear without yielding or rupture.';
 if(/tension|rupture|net section|yield/.test(key))return 'Keep the applied action within the applicable steel resistance.';
 if(/gap|clearance|travel|fit|footprint/.test(key))return 'Provide the physical fit or movement allowance required by the detail.';
 return checkGroupPurpose[c.group]??'Verify the stated demand or prerequisite against its documented limit.';
}
// These engine comparisons encode confirmations, not physical demand/capacity.
const isConfirmation=(c:CheckResult)=>['building-class','design-scope','load-basis'].includes(c.id)||/^crane-\d+-(split|bumper)$/.test(c.id);
const utilization=(c:CheckResult)=>!isConfirmation(c)&&['pass','fail'].includes(c.status)&&Number.isFinite(c.utilization)?c.utilization:undefined;
const statusLabels:Record<CheckResult['status'],string>={pass:'PASS',fail:'FAIL',unsupported:'MODEL REQUIRED',incomplete:'INPUT REQUIRED',unverified:'VERIFY BASIS','not-applicable':'N/A',excluded:'BY OTHERS'};
export function MathEquation({tex}:{tex:string}){return <div className="equation" dangerouslySetInnerHTML={{__html:katex.renderToString(tex,{throwOnError:false,displayMode:true,strict:'ignore'})}}/>;}
export function CheckCard({check,units}:{check:CheckResult;units:'US'|'SI'}){
 const [open,setOpen]=useState(false),resolved=['pass','fail'].includes(check.status),ratio=utilization(check),confirmation=isConfirmation(check);
 const value=(v:number|undefined)=>!confirmation&&Number.isFinite(v)?format(v,check.quantity??'ratio',units,3):'—';
 const displayValue=(v:number|undefined)=>{const text=value(v),split=text.lastIndexOf(' ');return split<0?text:<><span className="check-number">{text.slice(0,split)}</span>{' '}<span className="check-unit">{text.slice(split+1)}</span></>;};
 return <article className={`check-card ${check.status}`}>
  <button className="check-top" onClick={()=>setOpen(!open)} aria-expanded={open}>
   <span className={`status-icon ${check.status}`}>{check.status==='pass'?<Check size={13}/>:check.status==='fail'?<X size={13}/>:<CircleHelp size={13}/>}</span>
   <span className="check-name"><strong>{check.title}</strong><small>{checkPurpose(check)}</small></span>
   <span className="check-inline-values"><span aria-label={`Demand or requirement: ${value(check.demand)}`}>{displayValue(check.demand)}</span><span aria-label={`Capacity, limit or provided value: ${value(check.capacity)}`}>{displayValue(check.capacity)}</span></span>
   <span className="check-outcome"><b className={check.status==='fail'?'danger':''}>{ratio===undefined?'—':ratio.toFixed(3)}</b><small className={`check-status ${check.status}`}>{statusLabels[check.status]}</small></span>
   <ChevronDown size={12} className={open?'rotated':''}/>
  </button>
  {open&&<div className="check-body">
   <dl className="check-explanation"><div><dt>Why</dt><dd>{checkPurpose(check)}</dd></div>{check.caseId&&<div><dt>Governing case</dt><dd>{check.caseId}</dd></div>}<div><dt>{resolved?'Method / assumptions':check.status==='not-applicable'?'Applicability':'Required to resolve'}</dt><dd>{check.note}</dd></div></dl>
   {confirmation&&<p className="form-note">Confirmation check · no physical demand/capacity ratio.</p>}
   {check.equation&&<MathEquation tex={check.equation}/>} {resolved&&!confirmation&&check.substitution&&<MathEquation tex={check.substitution}/>}
   <div className="ref-tags" aria-label="Check references">{check.referenceIds.map(id=>{const r=references.find(r=>r.id===id);return r?.url?<a key={id} href={r.url} target="_blank" rel="noreferrer">{r.title} · {r.clause}<ArrowUpRight size={11}/></a>:<span key={id}>{r?.title??id}{r?.clause?' · '+r.clause:''}</span>;})}</div>
  </div>}
 </article>;
}
export function CheckGroup({name,checks,units,issuesOnly,project}:{name:string;checks:CheckResult[];project?:ProjectInput;units:'US'|'SI';issuesOnly:boolean}){
 const rows=checks.filter(c=>c.group===name),issues=rows.filter(c=>!['pass','not-applicable'].includes(c.status)),visible=issuesOnly?issues:rows;
 if(!rows.length)return null;
 const utilizations=rows.map(utilization).filter((v):v is number=>v!==undefined);
 const max=utilizations.length?Math.max(...utilizations):undefined,pass=rows.filter(c=>c.status==='pass').length,fail=rows.filter(c=>c.status==='fail').length,na=rows.filter(c=>c.status==='not-applicable').length,others=rows.filter(c=>c.status==='excluded').length;
 return <details className={`worksheet-checks ${issues.length?'has-issues':''}`} open={issues.length>0||rows.length<=6}>
  <summary><ChevronRight size={13}/><strong>{name}</strong><span>{pass} pass{fail?` · ${fail} fail`:''}{issues.length-fail-others?` · ${issues.length-fail-others} pending`:''}{others?` · ${others} by others`:''}{na?` · ${na} N/A`:''}</span><b className={max!==undefined&&max>1?'danger':''}>{max===undefined?'—':max.toFixed(3)}<small>MAX D/C</small></b></summary>
  <CheckFigure topic={name} project={project}/>
  {visible.length?<><div className="check-column-head"><span>CHECK / WHY IT MATTERS</span><span>DEMAND / REQ.</span><span>LIMIT / PROVIDED</span><span>D/C · STATUS</span></div>{visible.map(c=><CheckCard key={c.id} check={c} units={units}/>)}</>:<p className="form-note">No checks need review in this group.</p>}
 </details>;
}

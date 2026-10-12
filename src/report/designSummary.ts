import type {CalculationSnapshot,CheckResult,ProjectInput} from '../engine/types';
import {componentDetail,type Component} from '../components/figureDetails';
import {stepBadge} from '../components/checkFigures';
import {dcText} from '../engine/checkPresentation';
import {activeColumnCap} from '../engine/columnCapInputs';
import {activeEndBearing} from '../engine/endBearingInputs';
import {equationCell,governing,shortReference,statusLabel,subscripts} from './reportParts';
import {loadPathSteps,supportAssemblyFigure} from './hairline/figures';
import {classifyCheck,registerPoints,type Taxonomy} from '../engine/checkTaxonomy';

/**
 * The summary at the top of the calculation: the support section with its numbered load path, and the
 * governing check of each element along that path.
 */
const esc=(v:unknown)=>subscripts(String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)));
interface Element{key:string;step?:number;order:number;label:string;component?:Component;path:string;match:(c:CheckResult)=>boolean}

function supportLabel(p:ProjectInput){
 if(activeColumnCap(p))return 'Column cap';
 const b=p.details?.bracket;if(!b?.enabled)return 'Girder seat (by others)';
 return {'twin-rib':'Twin-rib bracket','haunched-seat':'Haunched seat bracket','rolled-corbel':'W-stub bracket','tapered-haunch':'Tapered I haunch','existing-corbel':'Existing bracket, new seat','existing-w-corbel':'Existing bracket, new seat'}[b.arrangement??'twin-rib'];
}
const bearingIds=['bearing-plate','bearing-contact','hold-down-model','stiffener-weld','stiffener-combined-weld','stiffener-bearing','stiffener-column','stiffener-lateral-flexure','stiffener-width','stiffener-thickness','stiffener-weld-minimum','stiffener-weld-maximum','stiffener-fatigue','stiffener-weld-fatigue'];
/** Elements in load-path order; each check belongs to the first element that claims it. */
export function summaryElements(p:ProjectInput):Element[]{
 const column=p.existingColumn?.enabled,isNew=column&&p.existingColumn!.isNew,cap=!!activeColumnCap(p),n=loadPathSteps(p);
 // Numbered as the summary figure's markers, without gaps; girder deflection and fatigue continue the girder (no number).
 const list:Omit<Element,'order'>[]=[
  {key:'rail',step:n.rail,label:'Rail, keepers & joints',component:'rail',path:'Wheel load P and side thrust H at the rail head; the rail bears on the flange, the keepers hold it',match:c=>c.group==='Rail details'||c.id.startsWith('rail-')},
  {key:'bearing',step:n.bearing,label:'Bearings & end connection',component:'bearing',path:`Bearing stiffeners and bearing plate${activeEndBearing(p)?'; bolts carry longitudinal force and uplift':''}`,match:c=>c.group==='End bearings'||bearingIds.includes(c.id)||/^(simple-|rotation-clearance$)/.test(c.id)},
  {key:'girder',step:n.girder,label:'Runway girder · strength',component:'girder',path:'Bending, shear, torsion and wheel patch between supports',match:c=>['Strength','Local forces','Cap channel'].includes(c.group)},
  {key:'service',label:'Runway girder · deflection',path:'Single crane, static: vertical and rail-head lateral movement',match:c=>c.group==='Serviceability'},
  {key:'fatigue',label:'Fatigue · girder and attachments',path:'Stress range at every detail, all duty bins',match:c=>c.group==='Fatigue'},
  {key:'support',step:n.support,label:supportLabel(p),component:'support',path:cap?'Cap plate, stiffeners and welds into the column':p.details?.bracket?.enabled?'Seat, bracket and its welds into the column':'Reactions reported for the support design by others',match:c=>c.group==='Column bracket'||c.group==='Column cap'},
  {key:'column',step:n.column,label:column?(isNew?'New column':'Existing column'):'Supporting structure',component:'column',path:column?(isNew?'Fixed-base cantilever: P, M, V and drift':'Crane reactions with the existing building loads'):'Building frame and foundations by others',match:c=>['Existing column','New column','Supporting structure'].includes(c.group)},
  {key:'base',step:n.base,label:'Base plate, anchors & footing',component:'base',path:'Base plate on grout, anchor rods, footing on soil',match:c=>c.group==='New column base'},
  {key:'tie',step:n.tie,label:cap?'Girder end restraint':'Top-flange tie',component:'tie',path:cap?'Fork of bearing stiffeners and bolted bottom flange':'Lateral flange force through the tie to the column',match:c=>['Flange attachment','Tie movement','Bracing','Cap tieback','Cap tieback movement'].includes(c.group)||(c.group==='Connections'&&c.id.startsWith('tie-'))},
  {key:'longitudinal',step:n.longitudinal,label:'Longitudinal system',component:'bracing',path:'Traction and stop force through the locating bearing to the strut and bracing',match:c=>['Longitudinal bracing','Brace connections','Crane-level strut'].includes(c.group)},
  {key:'stops',step:n.stops,label:'End stops',component:'end-stop',path:'Bumper force at the runway ends into the girder',match:c=>c.group==='End stops'},
  {key:'gates',label:'Loads, analysis & detailing',path:'Load basis, equilibrium, convergence and detailing rules',match:()=>true}
 ];
 const sub:Record<string,number>={service:.1,fatigue:.2};
 return list.map(e=>({...e,order:e.key==='service'||e.key==='fatigue'?(n.girder??2)+sub[e.key]:e.step??99}));
}
export function elementChecks(s:CalculationSnapshot){
 const elements=summaryElements(s.input),out=new Map(elements.map(e=>[e.key,[] as CheckResult[]]));
 for(const c of s.checks)out.get(elements.find(e=>e.match(c))!.key)!.push(c);
 return elements.map(e=>({element:e,checks:out.get(e.key)!})).filter(v=>v.checks.length).sort((a,b)=>a.element.order-b.element.order);
}

/**
 * The support assembly in the Hairline isometric style, to the project's sizes: wheel, rail, girder end, bearing,
 * the actual support (bracket type, column cap or by others), column, base and top tie, with load-path markers 1-8.
 */
export const loadPathFigure=(p:ProjectInput)=>supportAssemblyFigure(p,{className:'load-path-figure'});

/** A failure first; otherwise the governing DESIGN check (never a detailing rule, input or classification). */
export function governingForSummary(checks:CheckResult[]){
 const failed=checks.filter(c=>c.status==='fail');if(failed.length)return governing(failed);
 const design=checks.filter(c=>classifyCheck(c).type==='design'&&c.utilization!==undefined&&c.status==='pass');
 const strength=design.length?design:checks.filter(c=>c.utilization!==undefined&&c.quantity!=='length'&&c.status==='pass');
 return governing(strength.length?strength:checks);
}
/**
 * Summary rows: one per element with DESIGN checks, its governing DESIGN check (body line or evaluated fatigue
 * detail) inline, D/C and the counts. Detailing rules, inputs and classifications never govern an element.
 */
export function summaryTable(s:CalculationSnapshot,tax:Taxonomy){
 const p=s.input,defs=summaryElements(p);
 const rows=defs.map(e=>{
  const el=tax.elements.find(v=>v.key===e.key),lines=el?.shown??[],fat=tax.fatigue.evaluated.filter(r=>r.element===e.key);
  const cands=[...lines.map(l=>({c:l.controlling,dc:l.controlling.utilization??0,label:l.merged?l.title:undefined})),...fat.map(r=>({c:r.governing,dc:r.dc??0,label:`${r.title} · fatigue`}))];
  if(!cands.length)return undefined;
  const g=cands.reduce((a,b)=>(b.c.status==='fail'?1e9:0)+b.dc>(a.c.status==='fail'?1e9:0)+a.dc?b:a);
  const all=[...tax.entries.values()].filter(t=>t.element===e.key),design=all.filter(t=>t.type==='design'&&t.gate==='evaluated'),fails=all.filter(t=>t.type==='design'&&t.check.status==='fail').length;
  const det=all.filter(t=>t.type==='detailing'&&t.gate==='evaluated').length,shown=lines.length+fat.length;
  // Counted as on page 2: checks (Appendix A rows), body rows, and register points (two checks each).
  const reg=design.filter(t=>/^detail-(fatigue|full-cycle)-/.test(t.check.id)).map(t=>t.check);
  return {e,g,counts:`${design.length} design check${design.length===1?'':'s'} in ${shown} body row${shown===1?'':'s'}${reg.length?` (${reg.length} of them at ${registerPoints(reg)} fatigue register points)`:''}${det?`, ${det} detailing rules`:''}${fails?`, ${fails} NG`:''}`};
 }).filter(v=>v!==undefined).sort((a,b)=>a!.e.order-b!.e.order);
 return `<table class="summary-checks"><colgroup><col class="s-el"/><col class="s-check"/><col class="s-eq"/><col class="s-dc"/><col class="s-res"/></colgroup><thead><tr><th>Element · specified detail</th><th>Governing design check · reference</th><th>Equation</th><th>D/C</th><th>Result</th></tr></thead><tbody>${rows.map(v=>{
  const {e,g,counts}=v!,detail=e.component?componentDetail(e.component,p):'';
  return `<tr class="${g.c.status}"><td>${e.step?stepBadge(e.step)+' ':''}<b>${esc(e.label)}</b>${detail&&e.key!=='service'&&e.key!=='fatigue'?`<small>${esc(detail)}</small>`:''}<small class="path">${esc(e.path)}</small></td><td><b>${esc(g.label??g.c.title)}</b>${g.label?`<small>Controlling: ${esc(g.c.title)}</small>`:''}<small class="ref">${esc(shortReference(g.c))}</small><small>${counts}</small></td><td class="eq">${equationCell(g.c)}</td><td class="num">${dcText(g.dc,2,'—')}</td><td class="res"><b class="${g.c.status}">${esc(statusLabel(g.c.status))}</b></td></tr>`;
 }).join('')}</tbody></table>`;
}
export const summaryCss=`.summary-head{display:grid;grid-template-columns:330px 1fr;gap:12px;align-items:start;margin:6px 0}.summary-head svg{width:330px;height:auto;border:1px solid #000}.summary-head .key td,.summary-head .key th{padding:2px 5px;font-size:8.5px}.summary-head .key th:first-child{width:24%}.banner{border:2px solid #000;padding:6px 10px;margin:8px 0;font-size:11px}.banner b{font-size:12px}.banner.fail{background:#e6e6e6}table.summary-checks{font-size:9px}table.summary-checks col.s-el{width:30%}table.summary-checks col.s-check{width:24%}table.summary-checks col.s-eq{width:32%}table.summary-checks col.s-dc{width:6%}table.summary-checks col.s-res{width:8%}table.summary-checks td{vertical-align:middle;padding:3px 4px}table.summary-checks td small{display:block;font-size:7.5px;color:#222}table.summary-checks td small.path{font-style:italic}table.summary-checks td.num{text-align:right}table.summary-checks td.res{text-align:center}table.summary-checks td.eq .katex{font-size:1em;white-space:normal}table.summary-checks tr.fail td{background:#e6e6e6;font-weight:700}`;

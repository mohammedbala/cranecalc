import type {CalculationSnapshot,CheckResult,ProjectInput} from '../engine/types';
import {type Component} from '../components/figureDetails';
import {stepBadge} from '../components/checkFigures';
import {dcText} from '../engine/checkPresentation';
import {activeColumnCap} from '../engine/columnCapInputs';
import {tiedToBuilding,girderEndFork} from '../engine/craneColumnInputs';
import {activeStep} from '../engine/steppedColumnInputs';
import {activeEndBearing} from '../engine/endBearingInputs';
import {equationCell,governing,shortReference,sig3,statusLabel,subscripts} from './reportParts';
import {loadPathSteps,supportAssemblyFigure} from './hairline/figures';
import {classifyCheck,reviewDraftExportable,type Taxonomy} from '../engine/checkTaxonomy';
import {groupDc,openByElement,openItemGroups,ruleItem} from './openItems';

/**
 * The summary at the top of the calculation: the support section with its numbered load path, and the
 * governing check of each element along that path.
 */
const esc=(v:unknown)=>subscripts(String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)));
interface Element{key:string;step?:number;order:number;label:string;component?:Component;path:string;match:(c:CheckResult)=>boolean}

function supportLabel(p:ProjectInput){
 if(activeColumnCap(p))return 'Column cap';
 if(activeStep(p))return 'Step of the existing stepped column';
 const b=p.details?.bracket;if(!b?.enabled)return 'Girder seat (by others)';
 return {'twin-rib':'Twin-rib bracket','haunched-seat':'Haunched seat bracket','rolled-corbel':'W-stub bracket','tapered-haunch':'Tapered haunch','existing-corbel':'Existing bracket, new seat','existing-w-corbel':'Existing bracket, new seat'}[b.arrangement??'twin-rib'];
}
const bearingIds=['bearing-plate','bearing-contact','hold-down-model','stiffener-weld','stiffener-combined-weld','stiffener-bearing','stiffener-column','stiffener-lateral-flexure','stiffener-width','stiffener-thickness','stiffener-weld-minimum','stiffener-weld-maximum','stiffener-fatigue','stiffener-weld-fatigue'];
/** Elements in load-path order; each check belongs to the first element that claims it. */
export function summaryElements(p:ProjectInput):Element[]{
 const column=p.existingColumn?.enabled,isNew=column&&p.existingColumn!.isNew,cap=!!activeColumnCap(p),fork=girderEndFork(p),tied=tiedToBuilding(p),n=loadPathSteps(p);
 // A crane column tied to the building column: the crane column member, its column tie (the Appendix 6 nodal brace of its
 // top, with the tab on the building column) and the existing building column under the tie forces each get a row; the
 // footing clearance to the building column footing belongs to the footing.
 const columnTie=(c:CheckResult)=>c.group==='Crane column'&&/^crane-column-(tie-|tab-|brace-|gap$)/.test(c.id),footingClear=(c:CheckResult)=>c.id==='crane-column-footing-clearance';
 // Numbered as the summary figure's markers, without gaps; girder deflection and fatigue continue the girder (no number).
 const list:Omit<Element,'order'>[]=[
  {key:'rail',step:n.rail,label:'Rail, clips and joints',component:'rail',path:'Wheel load P and side thrust H at the rail head; the rail bears on the flange, the rail clips hold it',
   // The rail-head movement and rotation are girder serviceability (section 4.3), not rail checks.
   match:c=>c.group!=='Serviceability'&&(c.group==='Rail details'||c.id.startsWith('rail-'))},
  {key:'bearing',step:n.bearing,label:activeEndBearing(p)?'Bolted end bearings':'Bearings',component:'bearing',path:`Bearing stiffeners and bearing plate${activeEndBearing(p)?'; bolts carry longitudinal force and uplift':''}`,match:c=>c.group==='End bearings'||bearingIds.includes(c.id)||/^(simple-|rotation-clearance$)/.test(c.id)},
  {key:'girder',step:n.girder,label:'Runway girder strength',component:'girder',path:'Bending, shear, torsion and wheel patch between supports',match:c=>['Strength','Local forces','Cap channel'].includes(c.group)},
  {key:'service',label:'Runway girder deflection',path:'Single crane, static: vertical and rail-head lateral movement',match:c=>c.group==='Serviceability'},
  {key:'fatigue',label:'Runway girder fatigue',path:'Stress range at every detail, all duty bins',match:c=>c.group==='Fatigue'},
  {key:'support',step:n.support,label:supportLabel(p),component:'support',path:cap?'Cap plate, stiffeners and welds into the column':activeStep(p)?'Existing step cap, the lower shaft under it and the step stiffeners':p.details?.bracket?.enabled?'Seat, bracket and its welds into the column':'Reactions reported for the support design by others',match:c=>c.group==='Column bracket'||c.group==='Column cap'||(c.group==='Stepped column'&&/^step-/.test(c.id))},
  {key:'column',step:n.column,label:tied?'Crane column':column?(isNew?'New column':'Existing column (conditional)'):'Supporting structure',component:'column',path:tied?'Girder reactions on the cap to its own base; braced at the top by the column tie':column?(isNew?'Fixed-base cantilever: P, M, V and drift':'Crane reactions with the existing building loads; holds with the braced top, frame, bracing and crane-level strut listed with the column check'):'Building frame and foundations by others',match:c=>['Existing column','New column','Supporting structure','Stepped column'].includes(c.group)||(tied&&c.group==='Crane column'&&!columnTie(c)&&!footingClear(c))},
  ...(tied?[{key:'column-tie',label:'Column tie to the building column',path:'Appendix 6 nodal brace of the crane-column top: tie plate, slotted bolts and the tab on the building column',match:columnTie},
   {key:'building-column',label:'Existing building column (tie forces)',path:'Side thrust and brace forces from the girder tie and the column tie, with its own existing effects',match:(c:CheckResult)=>c.group==='Building column'}]:[]),
  {key:'base',step:n.base,label:'Base plate, anchors and footing',component:'base',path:'Base plate on grout, anchor rods, footing on soil',match:c=>c.group==='New column base'||footingClear(c)},
  {key:'tie',step:n.tie,label:fork?'Girder end restraint':`${p.details?.brace?.arrangement==='cap-angle'?'Cap tieback':'Top-flange tie'}${tied?' to the building column':''}`,component:'tie',path:fork?'Fork of bearing stiffeners and bolted bottom flange':`Lateral flange force through the tie to the ${tied?'building ':''}column`,match:c=>['Flange attachment','Tie movement','Bracing','Cap tieback','Cap tieback movement'].includes(c.group)||(c.group==='Connections'&&c.id.startsWith('tie-'))},
  {key:'longitudinal',step:n.longitudinal,label:'Longitudinal system',component:'bracing',path:'Traction and stop force through the locating bearing to the strut and bracing',match:c=>['Longitudinal bracing','Brace connections','Crane-level strut'].includes(c.group)},
  {key:'stops',step:n.stops,label:'End stops',component:'end-stop',path:'Bumper force at the runway ends into the girder',match:c=>c.group==='End stops'},
  {key:'gates',label:'Loads, analysis and detailing',path:'Load basis, equilibrium, convergence and detailing rules',match:()=>true}
 ];
 const sub:Record<string,number>={service:.1,fatigue:.2},after:Record<string,number>={'column-tie':.3,'building-column':.6};
 return list.map(e=>({...e,order:e.key==='service'||e.key==='fatigue'?(n.girder??2)+sub[e.key]:e.key in after?(n.column??5)+after[e.key]:e.step??99}));
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
 * Summary rows: one per element with DESIGN checks or open items, its governing DESIGN check (body line or evaluated
 * fatigue detail) inline with its reference, equation and D/C. Detailing rules, inputs and classifications never govern
 * an element, but its result is the worst of everything open there: an element with an open item (a failed strength or
 * fatigue check, a detailing rule or fit not met, missing input) reads NG (or the open status) with its open items
 * named, so the summary never says OK where the open-items list has an item. The element is named only; its
 * specification is in the design summary above.
 */
export function summaryTable(s:CalculationSnapshot,tax:Taxonomy){
 const p=s.input,defs=summaryElements(p),title=(v:string)=>v.replace(/\s*·\s*/g,', ');
 const open=openByElement(openItemGroups(tax,s).groups);
 const rows=defs.map(e=>{
  const el=tax.elements.find(v=>v.key===e.key),lines=el?.shown??[],fat=tax.fatigue.evaluated.filter(r=>r.element===e.key),items=open.get(e.key)??[];
  const cands=[...lines.map(l=>({c:l.controlling,dc:l.controlling.utilization??0})),...fat.map(r=>({c:r.governing,dc:r.dc??0}))];
  // The longitudinal system left to the building engineer keeps its step in the load path, as a by-others row.
  if(!cands.length&&!items.length)return e.key==='longitudinal'&&p.existingColumn?.enabled?{e,byOthers:true as const}:undefined;
  // Without a design check, the first open item stands in (a detailing rule or fit with no ratio).
  const g:{c:CheckResult;dc:number|undefined}=cands.length?cands.reduce((a,b)=>(b.c.status==='fail'?1e9:0)+b.dc>(a.c.status==='fail'?1e9:0)+a.dc?b:a):{c:items[0].governing,dc:ruleItem(items[0])?undefined:items[0].dc};
  return {e,g,items,checked:cands.length>0};
 }).filter(v=>v!==undefined).sort((a,b)=>a!.e.order-b!.e.order);
 return `<table class="summary-checks"><colgroup><col class="s-el"/><col class="s-check"/><col class="s-eq"/><col class="s-dc"/><col class="s-res"/></colgroup><thead><tr><th>Element</th><th>Governing check</th><th>Equation</th><th>D/C</th><th>Result</th></tr></thead><tbody>${rows.map(v=>{
  if('byOthers' in v!){const {e}=v!;return `<tr class="excluded"><td>${e.step?stepBadge(e.step)+' ':''}<b>${esc(e.label)}</b></td><td colspan="2">Crane-level strut, collector, brace connections and braced bay: building engineer of record (section @@ref:by-others@@). Forces delivered: section @@ref:interfaces@@.</td><td class="num">—</td><td class="res"><b>By others</b></td></tr>`;}
  const {e,g,items,checked}=v as Exclude<typeof v,{byOthers:true}>;
  // The element's result: NG when anything there failed, else an open status (unverified, incomplete), else the governing check's.
  // An open item that is not the governing check keeps its own status in the note: it never labels a passing check.
  const status=items.some(i=>i.governing.status==='fail')?'fail':(items.find(i=>i.members.includes(g.c))??(checked?undefined:items[0]))?.governing.status??g.c.status;
  const others=items.filter(i=>!i.members.includes(g.c));
  const note=others.length?`<small class="open">Open: ${others.slice(0,2).map(i=>`${esc(title(i.title))} (${esc(groupDc(i))})`).join('; ')}${others.length>2?`; ${others.length-2} more`:''} (open items, page 1)</small>`:'';
  return `<tr class="${status}"><td>${e.step?stepBadge(e.step)+' ':''}<b>${esc(e.label)}</b></td><td>${esc(title(g.c.title))}<small class="ref">${esc(shortReference(g.c))}</small>${note}</td><td class="eq">${equationCell(g.c)}</td><td class="num">${dcText(g.dc,2,'—',g.c.status)}</td><td class="res"><b class="${status}">${esc(statusLabel(status))}</b></td></tr>`;
 }).join('')}</tbody></table>`;
}
/**
 * The configurator selection log (configurator.selections) as the short 'Configurator selections' table of the design
 * summary: what was built in place of the configuration as entered, or chosen where it was blank, and why.
 */
export function selectionsTable(p:ProjectInput,s?:CalculationSnapshot){
 const rows=p.configurator?.selections??[];if(!rows.length)return '';
 return `<h3>Configurator selections</h3><table class="selections"><thead><tr><th>Item</th><th>As entered</th><th>As designed</th><th>Governing reason</th></tr></thead><tbody>${rows.map(v0=>{const v=s?selectionView(s,v0):v0,f=s&&selectionFinal(s,v0.item,v0.entered);return `<tr><td>${esc(v.item)}</td><td>${esc(v.entered)}</td><td>${esc(v.designed)}</td><td>${esc(v.reason)}${f?` <b>${esc(f)}</b>`:''}</td></tr>`;}).join('')}</tbody></table>`;
}
/** The summary element whose final ratios a configurator selection is judged by. */
const selectionElements:Record<string,string[]>={Girder:['girder','service'],'Girder type':['girder','service'],'Crane column':['column'],'New column':['column'],'Existing column':['column'],'Lower shaft (stepped column)':['column'],'Top-flange tie':['tie'],'Column tie':['tie'],'Column cap, at its limits':['support']};
/** An 'Open item' row of the log (configurator openItemRow): its member, as entered, and the element its ratios are in. */
const openItemMember:Record<string,{member:string,keys:string[]}>={Girder:{member:'girder',keys:['girder','service']},'Top-flange tie':{member:'tie',keys:['tie']},'Column cap':{member:'column-cap',keys:['support']},'Crane column':{member:'crane-column',keys:['column']}};
/** The configurator item (configurator-<member>, calculate.configuratorOpenItems) a log row stands for. */
const selectionMember=(item:string,entered?:string)=>item==='Open item'?openItemMember[entered??'']?.member:item==='Column cap, at its limits'?'column-cap':undefined;
/**
 * Whether the calculation closed the configurator item a log row stands for (its configurator-<member> item passes: the
 * member's own checks all pass). Such a row reads as closed everywhere (the log, S-00): never as an open item.
 */
export function selectionClosed(s:CalculationSnapshot,item:string,entered?:string){
 const m=selectionMember(item,entered);return !!m&&s.checks.find(c=>c.id===`configurator-${m}`)?.status==='pass';
}
/**
 * A log row as printed: a row whose configurator item the calculation closed reads as closed (an 'Open item' is titled
 * 'Closed item', its member as built and confirmed; its reason is the configurator's screening estimate, not an open item).
 */
export function selectionView<T extends {item:string,entered:string,designed:string,reason:string}>(s:CalculationSnapshot,v0:T):T{
 // The bracket advisory quotes the configurator's reaction estimate (to the nearest 5): with the calculation's reaction
 // (its column bracket reaction check) available, that value leads and the estimate is labeled as such.
 const R=s.checks.find(c=>/^(column-brackets|(bracket|haunch|wbracket)-tr13-load)$/.test(c.id)&&c.demand!==undefined&&Number.isFinite(c.demand))?.demand;
 const v=R===undefined?v0:{...v0,reason:v0.reason.replace(/^The support reaction, about ([^,]*?), is above/,(_,est:string)=>`The support reaction ${sig3(R,'force',s.input.units)} (the calculation's; configurator estimate about ${est.replace(/\s*\(([^()]*)\)/,', $1')}) is above`)};
 if(!selectionClosed(s,v.item,v.entered))return v;
 const reason=v.reason.replace(/^([^:]{1,60}) not resolved: /,'$1, screening estimate: ').replace(/\s*\(review draft: open item\)/,'').replace(/\s*Open item: the package is a review draft[^.]*\./,'');
 return v.item==='Open item'?{...v,item:'Closed item',designed:`${v.entered==='Column cap'?'Column cap on the ':''}${v.designed.split(/[,;]/)[0]} as built, confirmed by the calculation`,reason}:{...v,reason};
}
/**
 * The final calculated ratios beside a configurator selection whose reason quotes screening estimates (the sized girder,
 * the columns, the tie): the governing design D/C of its element after calculate(), and for the girder the vertical and
 * lateral deflection ratios. Undefined for other items, without a ratio, or for a package whose analysis did not verify
 * (it quotes no result).
 */
export function selectionFinal(s:CalculationSnapshot,item:string,entered?:string){
 const keys=item==='Open item'?openItemMember[entered??'']?.keys:selectionElements[item];if(!keys||(!s.eligible&&!reviewDraftExportable(s)))return undefined;
 const all=elementChecks(s),of=(k:string)=>all.find(v=>v.element.key===k)?.checks??[];
 const checks=keys.flatMap(of).filter(c=>c.group!=='Serviceability'),g=checks.length?governingForSummary(checks):undefined;
 const dc=(id:string)=>{const u=s.checks.find(c=>c.id===id)?.utilization;return u!==undefined&&Number.isFinite(u)?u.toFixed(2):undefined;};
 const v=item.startsWith('Girder')?dc('vertical'):undefined,h=item.startsWith('Girder')?dc('lateral'):undefined;
 if(!g||g.utilization===undefined||!Number.isFinite(g.utilization))return undefined;
 const closed=selectionClosed(s,item,entered)?'closed by the calculation (the member\'s own checks pass), ':'';
 return `Final calculation: ${closed}governing D/C ${dcText(g.utilization,2,'-',g.status)} (${g.title})${v&&h?`, vertical deflection ${v} and lateral ${h} of the limits`:''}.`;
}
export const summaryCss=`table.selections{font-size:8.5px}table.selections td{vertical-align:top;padding:2px 4px}table.selections td:nth-child(1){width:13%}table.selections td:nth-child(2),table.selections td:nth-child(3){width:16%}.summary-head{display:grid;grid-template-columns:330px 1fr;gap:12px;align-items:start;margin:6px 0}.summary-head svg{width:330px;height:auto;border:1px solid #000}.summary-head .key td,.summary-head .key th{padding:2px 5px;font-size:8.5px}.summary-head .key th:first-child{width:24%}.banner{border:2px solid #000;padding:6px 10px;margin:8px 0;font-size:11px}.banner b{font-size:12px}.banner.fail{background:#e6e6e6}table.summary-checks{font-size:9px}table.summary-checks col.s-el{width:20%}table.summary-checks col.s-check{width:32%}table.summary-checks col.s-eq{width:34%}table.summary-checks col.s-dc{width:6%}table.summary-checks col.s-res{width:8%}table.summary-checks td{vertical-align:middle;padding:3px 4px}table.summary-checks td small{display:block;font-size:7.5px;color:#222}table.summary-checks td small.path{font-style:italic}table.summary-checks td.num{text-align:right}table.summary-checks td.res{text-align:center}table.summary-checks td.eq .katex{font-size:1em;white-space:normal}table.summary-checks tr.fail td{background:#e6e6e6;font-weight:700}`;

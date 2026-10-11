import type {CalculationSnapshot,CheckResult,ProjectInput} from '../engine/types';
import {componentDetail,type Component} from '../components/figureDetails';
import {stepBadge} from '../components/checkFigures';
import {dcText} from '../engine/checkPresentation';
import {activeColumnCap} from '../engine/columnCapInputs';
import {activeEndBearing} from '../engine/endBearingInputs';
import {equationCell,governing,shortReference,statusLabel} from './reportParts';

/**
 * The summary at the top of the calculation: the support section with its numbered load path, and the
 * governing check of each element along that path.
 */
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
interface Element{key:string;step?:number;label:string;component?:Component;path:string;match:(c:CheckResult)=>boolean}

function supportLabel(p:ProjectInput){
 if(activeColumnCap(p))return 'Column cap';
 const b=p.details?.bracket;if(!b?.enabled)return 'Girder seat (by others)';
 return {'twin-rib':'Twin-rib bracket','haunched-seat':'Haunched seat bracket','rolled-corbel':'W-stub bracket','tapered-haunch':'Tapered I haunch','existing-corbel':'Existing bracket, new seat','existing-w-corbel':'Existing bracket, new seat'}[b.arrangement??'twin-rib'];
}
const bearingIds=['bearing-plate','bearing-contact','hold-down-model','stiffener-weld','stiffener-combined-weld','stiffener-bearing','stiffener-column','stiffener-lateral-flexure','stiffener-width','stiffener-thickness','stiffener-weld-minimum','stiffener-weld-maximum','stiffener-fatigue','stiffener-weld-fatigue'];
/** Elements in load-path order; each check belongs to the first element that claims it. */
export function summaryElements(p:ProjectInput):Element[]{
 const column=p.existingColumn?.enabled,isNew=column&&p.existingColumn!.isNew,cap=!!activeColumnCap(p);
 return [
  {key:'rail',step:1,label:'Rail, keepers & joints',component:'rail',path:'Wheel load P and side thrust H at the rail head; the rail bears on the flange, the keepers hold it',match:c=>c.group==='Rail details'||c.id.startsWith('rail-')},
  {key:'bearing',step:3,label:'Bearings & end connection',component:'bearing',path:`Bearing stiffeners and bearing plate${activeEndBearing(p)?'; bolts carry longitudinal force and uplift':''}`,match:c=>c.group==='End bearings'||bearingIds.includes(c.id)},
  {key:'girder',step:2,label:'Runway girder · strength',component:'girder',path:'Bending, shear, torsion and wheel patch between supports',match:c=>['Strength','Local forces','Cap channel'].includes(c.group)},
  {key:'service',step:2,label:'Runway girder · deflection',path:'Single crane, static: vertical and rail-head lateral movement',match:c=>c.group==='Serviceability'},
  {key:'fatigue',step:2,label:'Fatigue · girder and attachments',path:'Stress range at every detail, all duty bins',match:c=>c.group==='Fatigue'},
  {key:'support',step:4,label:supportLabel(p),component:'support',path:cap?'Cap plate, stiffeners and welds into the column':p.details?.bracket?.enabled?'Seat, bracket and its welds into the column':'Reactions reported for the support design by others',match:c=>c.group==='Column bracket'||c.group==='Column cap'},
  {key:'column',step:5,label:column?(isNew?'New column':'Existing column'):'Supporting structure',component:'column',path:column?(isNew?'Fixed-base cantilever: P, M, V and drift':'Crane reactions with the existing building loads'):'Building frame and foundations by others',match:c=>['Existing column','New column','Supporting structure'].includes(c.group)},
  {key:'base',step:6,label:'Base plate, anchors & footing',component:'base',path:'Base plate on grout, anchor rods, footing on soil',match:c=>c.group==='New column base'},
  {key:'tie',step:7,label:cap?'Girder end restraint':'Top-flange tie',component:'tie',path:cap?'Fork of bearing stiffeners and bolted bottom flange':'Lateral flange force through the tie to the column',match:c=>['Flange attachment','Tie movement','Bracing'].includes(c.group)||(c.group==='Connections'&&c.id.startsWith('tie-'))},
  {key:'longitudinal',step:8,label:'Longitudinal system',component:'bracing',path:'Traction and stop force through the locating bearing to the strut and bracing',match:c=>['Longitudinal bracing','Brace connections','Crane-level strut'].includes(c.group)},
  {key:'stops',step:9,label:'End stops',component:'end-stop',path:'Bumper force at the runway ends into the girder',match:c=>c.group==='End stops'},
  {key:'gates',label:'Loads, analysis & detailing',path:'Load basis, equilibrium, convergence and detailing rules',match:()=>true}
 ];
}
export function elementChecks(s:CalculationSnapshot){
 const elements=summaryElements(s.input),out=new Map(elements.map(e=>[e.key,[] as CheckResult[]]));
 for(const c of s.checks)out.get(elements.find(e=>e.match(c))!.key)!.push(c);
 return elements.map(e=>({element:e,checks:out.get(e.key)!})).filter(v=>v.checks.length).sort((a,b)=>(a.element.step??99)-(b.element.step??99));
}

const ink='#000',gray='#d4d4d4';
const R=(x:number,y:number,w:number,h:number,focus=false,dashed=false)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${focus?gray:'white'}" stroke="${ink}" stroke-width="${focus?1.5:1}"${dashed?' stroke-dasharray="5 3"':''}/>`;
const P=(d:string,fill='none',w=1,dashed=false)=>`<path d="${d}" fill="${fill}" stroke="${ink}" stroke-width="${w}" stroke-linejoin="round"${dashed?' stroke-dasharray="5 3"':''}/>`;
const T=(x:number,y:number,t:string,anchor='middle',size=8.5)=>`<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="${size}" fill="${ink}">${esc(t)}</text>`;
const M=(n:number,x:number,y:number)=>`<circle cx="${x}" cy="${y}" r="7" fill="white" stroke="${ink}" stroke-width="1.2"/><text x="${x}" y="${y+3.4}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9.5" font-weight="700" fill="${ink}">${n}</text>`;
function A(x:number,y:number,tx:number,ty:number){const a=Math.atan2(ty-y,tx-x),s=7;return P(`M${x} ${y}L${tx-4*Math.cos(a)} ${ty-4*Math.sin(a)}`,'none',2)+`<path d="M${tx} ${ty}L${tx-s*Math.cos(a-.4)} ${ty-s*Math.sin(a-.4)}L${tx-s*Math.cos(a+.4)} ${ty-s*Math.sin(a+.4)}Z" fill="${ink}"/>`;}
/**
 * Section through a support, looking along the runway: wheel, rail, girder, bearing, the actual support
 * (bracket type, column cap or by others), column, base and top tie, with load-path markers 1-8.
 */
export function loadPathFigure(p:ProjectInput){
 const capped=p.section.kind==='cap',cap=!!activeColumnCap(p),b=p.details?.bracket,bracket=!cap&&b?.enabled,kind=b?.arrangement??'twin-rib';
 const col=p.existingColumn?.enabled,isNew=!!(col&&p.existingColumn!.isNew),base=isNew&&p.columnBase?.enabled;
 const cx=120,tf=96,top=capped?tf-6:tf,railTop=top-22,H=base?306:286;
 let g='';
 // Girder: W with optional cap channel, bearing stiffeners each side of the web, bearing plate.
 g+=R(cx-28,tf,56,6)+R(cx-3,tf+6,6,60)+R(cx-28,tf+66,56,6)+R(cx-26,tf+6,20,60,true)+R(cx+6,tf+6,20,60,true);
 if(capped)g+=P(`M${cx-34} ${tf+16}V${tf-6}H${cx+34}V${tf+16}`,'none',2);
 g+=R(cx-28,tf+72,56,6,true);
 // Rail, keepers, wheel and the applied loads.
 g+=P(`M${cx-16} ${top}V${top-4}H${cx-3}V${top-16}H${cx-10}V${railTop}H${cx+10}V${top-16}H${cx+3}V${top-4}H${cx+16}V${top}Z`,'white',1.2)+R(cx-24,top-6,7,6,true)+R(cx+17,top-6,7,6,true);
 g+=`<circle cx="${cx}" cy="${railTop-14}" r="13" fill="white" stroke="${ink}" stroke-width="1.2"/>`+A(cx,railTop-58,cx,railTop-29)+T(cx+8,railTop-48,'P','start',10);
 g+=A(cx+52,railTop+3,cx+12,railTop+3)+T(cx+56,railTop+6,'H','start',10);
 g+=`<circle cx="${cx-44}" cy="${railTop+3}" r="5" fill="white" stroke="${ink}" stroke-width="1.2"/><circle cx="${cx-44}" cy="${railTop+3}" r="1.6" fill="${ink}"/>`+T(cx-53,railTop+6,'F','end',10);
 const seatY=tf+78,colX=262,colW=30;
 if(cap){
  // Girder centered on the column: cap plate on the milled column top.
  g+=R(cx-32,seatY,64,6,true)+R(cx-15,seatY+6,30,H-seatY-(base?40:6))+T(cx+40,seatY+40,'COLUMN CAP','start');
 }else if(bracket){
  g+=R(cx-34,seatY,colX-cx+34,7,true);
  if(kind==='haunched-seat')g+=P(`M${cx-24} ${seatY+7}H${colX}V${seatY+70}L${cx-24} ${seatY+24}Z`,gray,1.5);
  else if(kind==='rolled-corbel')g+=R(cx-28,seatY+7,colX-cx+28,5,true)+R(cx-28,seatY+52,colX-cx+28,5,true)+P(`M${cx-28} ${seatY+12}V${seatY+52}`)+R(cx-3,seatY+12,6,40,true);
  else if(kind.startsWith('existing'))g+=R(cx-28,seatY+7,colX-cx+28,50,false,true)+T(cx+70,seatY+36,'EXISTING');
  else g+=R(cx-24,seatY+7,colX-cx+24,56,true);
  g+=T((cx+colX)/2+(kind==='rolled-corbel'?30:-6),seatY+(kind==='haunched-seat'?22:kind==='rolled-corbel'?40:52),{'twin-rib':'TWIN-RIB BRACKET','haunched-seat':'HAUNCHED SEAT','rolled-corbel':'W STUB'}[kind as string]??'','middle',8);
  g+=P(`M${colX-2} ${seatY+7}V${seatY+(kind==='haunched-seat'?70:56)}`,'none',2.5);
 }else{
  g+=R(cx-34,seatY,68,10,false,true)+T(cx,seatY+24,'SEAT BY OTHERS');
 }
 // Column beside the girder (bracket or by others), with its base or a break line.
 if(!cap){
  const bottom=base?H-40:H-10;
  g+=R(colX,24,colW,bottom-24,false,!col)+T(colX+colW/2,18,col?p.existingColumn!.shape||'COLUMN':'COLUMN BY OTHERS');
 }
 const baseX=cap?cx:colX+colW/2;
 if(base)g+=R(baseX-26,H-40,52,5,true)+R(baseX-52,H-35,104,24)+P(`M${baseX-12} ${H-46}V${H-18}M${baseX+12} ${H-46}V${H-18}`,'none',2)+P(Array.from({length:13},(_,i)=>`M${baseX-52+i*8} ${H-5}L${baseX-46+i*8} ${H-11}`).join(''));
 else if(col)g+=P(`M${baseX-20} ${H-10}l8 -4l-6 -4l8 -4`,'none',1)+T(baseX,H-1,'EXISTING FOUNDATION');
 // Top-flange tie to the column (no tie where the girder sits on a column cap: the end fork restrains it).
 const tie=!cap&&p.details;
 if(tie)g+=R(cx+28,tf+8,colX-cx-28-10,5,true)+R(colX-10,tf+2,10,16,true)+T((cx+28+colX-10)/2,tf+26,'TOP TIE');
 // Markers in load-path order.
 g+=M(1,cx-34,railTop-6)+M(2,cx-48,tf+36)+M(3,cx+46,seatY-6)+M(4,cap?cx-46:bracket?cx+100:cx+48,cap?seatY+3:bracket?seatY+(kind.startsWith('existing')?14:kind==='haunched-seat'?40:30):seatY+18);
 g+=M(5,cap?cx:colX+colW/2,cap?seatY+60:150);
 if(base)g+=M(6,baseX+68,H-24);
 if(tie)g+=M(7,cx+86,tf-4);else if(cap)g+=M(7,cx-48,tf+60);
 g+=M(8,cx-60,seatY+4);
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 330 ${H}" role="img" aria-label="Load path through a support" class="load-path-figure"><title>Load path through a support</title><desc>Section through a runway support looking along the runway. Numbered markers follow the load path listed in the summary table: 1 rail, 2 girder, 3 bearing, 4 support, 5 column, 6 base, 7 lateral restraint, 8 longitudinal force. P vertical wheel load, H side thrust, F longitudinal force (toward the viewer).</desc>${g}</svg>`;
}

/** A failure first; otherwise the governing strength or stress check, not a dimensional rule met at its minimum. */
function governingForSummary(checks:CheckResult[]){
 const failed=checks.filter(c=>c.status==='fail');if(failed.length)return governing(failed);
 const strength=checks.filter(c=>c.utilization!==undefined&&c.quantity!=='length'&&c.status==='pass');
 return governing(strength.length?strength:checks);
}
/** Summary rows: one per element with checks, its governing check inline, D/C and the number of checks. */
export function summaryTable(s:CalculationSnapshot){
 const p=s.input;
 return `<table class="summary-checks"><colgroup><col class="s-el"/><col class="s-check"/><col class="s-eq"/><col class="s-dc"/><col class="s-res"/></colgroup><thead><tr><th>Element · specified detail</th><th>Governing check · reference</th><th>Equation</th><th>D/C</th><th>Result</th></tr></thead><tbody>${elementChecks(s).map(({element:e,checks})=>{
  const g=governingForSummary(checks),fails=checks.filter(c=>c.status==='fail').length,detail=e.component?componentDetail(e.component,p):'';
  const counts=`${checks.length} check${checks.length>1?'s':''}${fails?`, ${fails} NG`:''}`;
  return `<tr class="${g.status}"><td>${e.step?stepBadge(e.step)+' ':''}<b>${esc(e.label)}</b>${detail&&e.key!=='service'&&e.key!=='fatigue'?`<small>${esc(detail)}</small>`:''}<small class="path">${esc(e.path)}</small></td><td><b>${esc(g.title)}</b><small class="ref">${esc(shortReference(g))}</small><small>${counts}</small></td><td class="eq">${equationCell(g)}</td><td class="num">${dcText(g.utilization,2,'—')}</td><td class="res"><b class="${g.status}">${esc(statusLabel(g.status))}</b></td></tr>`;
 }).join('')}</tbody></table>`;
}
export const summaryCss=`.summary-head{display:grid;grid-template-columns:330px 1fr;gap:12px;align-items:start;margin:6px 0}.summary-head svg{width:330px;height:auto;border:1px solid #000}.summary-head .key td,.summary-head .key th{padding:2px 5px;font-size:8.5px}.summary-head .key th:first-child{width:24%}.banner{border:2px solid #000;padding:6px 10px;margin:8px 0;font-size:11px}.banner b{font-size:12px}.banner.fail{background:#e6e6e6}table.summary-checks{font-size:9px}table.summary-checks col.s-el{width:30%}table.summary-checks col.s-check{width:24%}table.summary-checks col.s-eq{width:32%}table.summary-checks col.s-dc{width:6%}table.summary-checks col.s-res{width:8%}table.summary-checks td{vertical-align:middle;padding:3px 4px}table.summary-checks td small{display:block;font-size:7.5px;color:#222}table.summary-checks td small.path{font-style:italic}table.summary-checks td.num{text-align:right}table.summary-checks td.res{text-align:center}table.summary-checks td.eq .katex{font-size:1em;white-space:normal}table.summary-checks tr.fail td{background:#e6e6e6;font-weight:700}`;

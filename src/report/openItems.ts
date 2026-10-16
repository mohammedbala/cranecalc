import type {CalculationSnapshot,CheckResult,ProjectInput} from '../engine/types';
import {fatigueData,registerFamily,type OpenItem,type Taxonomy,type TaxonEntry} from '../engine/checkTaxonomy';
import {dcText,noCapacity} from '../engine/checkPresentation';
import {noteLength} from '../engine/units';
import {columnStiffenerGeometry} from '../engine/columnStiffeners';
import {columnFlangeWidth,flangeEffectiveWidth} from '../engine/flangeTieDesign';
import {flangeTieGeometry} from '../engine/tieGeometry';
import {maximumRule,sig3,statusLabel,value} from './reportParts';

/**
 * The open items of a calculation as a reviewer acts on them: one item per detail type and element, never one per
 * station or register point. Register points of one fatigue detail (every saddle toe, every rail clip weld) are one
 * item with the number of locations and the largest D/C; checks merged into one body line (H1 and the normal stress
 * of a flange) are one item; a check repeated at many stations is one item. The fatigue ratio that is not the
 * project's method (the all-cycle bound beside a Miner check of the same point, as in the fatigue table) is folded
 * into the item of its point and never listed on its own. Items are sorted by severity, then by D/C, and each says
 * what is needed: the remedy the engine can state from the check (a size, a plate, a weld, more bolts, a smaller
 * stress range) or "refine the model / supply data".
 */
export type OpenKind=OpenItem['kind'];
export interface OpenGroup{
 key:string;kind:OpenKind;element:string;elementLabel:string;
 /** The detail type: "Flange saddle · end fillet toe", or the check title. */
 title:string;
 /** The controlling open check (largest D/C by the project's method). */
 governing:CheckResult;
 /** Every open check of the item by the project's method, governing first. */
 members:CheckResult[];
 /** Open fatigue ratios of the same points by the other method (all-cycle bounds beside Miner checks). */
 folded:CheckResult[];
 /** Distinct locations open, and of the detail in all. */
 locations:number;of:number;
 /** Largest finite D/C of the members (Infinity when one has no capacity). */
 dc?:number;
 remedy:string;
}
const order:Record<OpenKind,number>={clash:0,redesign:1,detailing:2,input:3};
export const openKindLabel:Record<OpenKind,string>={clash:'Clash / fit',redesign:'Redesign',detailing:'Detailing',input:'Input'};
const dcOf=(c:CheckResult)=>c.utilization===undefined||Number.isNaN(c.utilization)?-1:noCapacity(c.utilization)?Infinity:c.utilization;
const pointOf=(id:string)=>id.match(/^detail-(?:fatigue|full-cycle)-(.+)$/)?.[1];
/** A register detail name without its numbers, sides and positions: "Flange saddle 3 · end fillet toe 2 / top-right" → "Flange saddle · end fillet toe". */
export const detailTypeName=(name:string)=>name.replace(/\s*\/\s*(top|bottom)-(left|right)\b/g,'').replace(/\s*·\s*(left|right|channel flange (left|right))\b/g,'')
 .replace(/,\s*(left|right) runway end,?/g,'').replace(/,\s*(back|front) row\b/g,'').replace(/,\s*(bay|grid)\s*\d+[^·]*/g,'').replace(/\s*·\s*all-cycle bound$/,'')
 .replace(/\s+\d+\b/g,'').replace(/\s{2,}/g,' ').replace(/[\s,·]+$/,'').trim();

/** The open items of a snapshot, grouped, sorted and with their remedies; `bounds` counts register points whose only open ratio is the comparison bound. */
export function openGroups(tax:Taxonomy,s:CalculationSnapshot):{groups:OpenGroup[];bounds:{points:number;max:number}}{
 const miner=tax.fatigue.method==='miner',ids=new Set(s.checks.map(c=>c.id));
 const register=s.detailResults?.fatigue??[];
 // The design ratio of a register point follows the project's method; the other ratio of the same point is a bound.
 const isBound=(c:CheckResult)=>{const pt=pointOf(c.id);if(!pt)return false;
  const full=c.id.startsWith('detail-full-cycle-'),other=full?`detail-fatigue-${pt}`:`detail-full-cycle-${pt}`;
  return (miner?full:!full)&&ids.has(other);};
 const keyOf=(c:CheckResult)=>{
  const t=tax.entries.get(c.id),pt=pointOf(c.id);
  if(pt){const f=register.find(v=>v.id===pt),fam=registerFamily(s,c.id);return `register:${fam?.replace(/^register:/,'').split('|').slice(0,2).join('|')??pt}|${detailTypeName(f?.name??c.title)}`;}
  if(t?.line&&(t.line.includes('@')||t.line.startsWith('repeat:')))return `line:${t.line}`;
  if(t?.repeat&&!t.repeat.startsWith('register:'))return `repeat:${t.repeat}`;
  return `check:${c.id}`;
 };
 const byKey=new Map<string,OpenItem[]>();
 for(const o of tax.openItems){const k=keyOf(o.check);byKey.set(k,[...(byKey.get(k)??[]),o]);}
 // Register points of each detail type, open or not, for "n of N locations".
 const pointsOf=new Map<string,Set<string>>();
 for(const c of s.checks){const pt=pointOf(c.id);if(!pt)continue;const k=keyOf(c);pointsOf.set(k,(pointsOf.get(k)??new Set()).add(pt));}
 const groups:OpenGroup[]=[],boundPoints=new Set<string>();let boundMax=0;
 for(const [key,items] of byKey){
  const checks=items.map(o=>o.check),design=checks.filter(c=>!isBound(c)),folded=checks.filter(isBound);
  if(!design.length){for(const c of folded){boundPoints.add(pointOf(c.id)!);boundMax=Math.max(boundMax,dcOf(c));}continue;}
  const members=[...design].sort((a,b)=>dcOf(b)-dcOf(a)),gov=members[0],t=tax.entries.get(gov.id);
  const kind=items.map(o=>o.kind).reduce((a,b)=>order[b]<order[a]?b:a);
  const pts=new Set(members.map(c=>pointOf(c.id)).filter((v):v is string=>!!v));
  // All locations of the detail: the register points of its type, or the checks repeating its equation; the limit states
  // merged into one body line (H1 and the normal stress of a flange) are one location.
  const repeated=key.startsWith('repeat:')||key.startsWith('line:repeat:'),merged=key.startsWith('line:')&&!repeated;
  const of=key.startsWith('register:')?pointsOf.get(key)?.size??pts.size:repeated?Math.max(members.length,t?.typicalOf??1):merged?1:members.length;
  const title=key.startsWith('register:')?key.split('|').slice(2).join('|'):key.startsWith('line:')&&members.length>1&&t?.line?lineTitle(tax,t.line)??gov.title:gov.title;
  const dcs=members.map(dcOf).filter(v=>v>=0);
  const g:OpenGroup={key,kind,element:t?.element??'gates',elementLabel:t?.elementLabel??'Loads, analysis and detailing',title,governing:gov,members,folded,
   locations:merged?1:pts.size||members.length,of:merged?1:Math.max(of,pts.size||members.length),dc:dcs.length?Math.max(...dcs):undefined,remedy:''};
  g.remedy=remedyFor(g,s,tax);
  groups.push(g);
 }
 groups.sort((a,b)=>order[a.kind]-order[b.kind]||(b.dc??-1)-(a.dc??-1)||a.title.localeCompare(b.title));
 return {groups,bounds:{points:boundPoints.size,max:boundMax}};
}
/** The open items of a taxonomy, computed once per taxonomy object. */
const cache=new WeakMap<Taxonomy,ReturnType<typeof openGroups>>();
export function openItemGroups(tax:Taxonomy,s:CalculationSnapshot){
 let v=cache.get(tax);if(!v){v=openGroups(tax,s);cache.set(tax,v);}
 return v;
}
const lineTitle=(tax:Taxonomy,key:string)=>tax.lines.find(l=>l.key===key)?.title;

// ---------------------------------------------------------------- remedies
interface RemedyContext{c:CheckResult;g:OpenGroup;s:CalculationSnapshot;p:ProjectInput;u:number;units:ProjectInput['units'];
 /** A size raised by the ratio r, rounded up to 1/16 in (1 mm), as printed. */
 size:(mm:number,r:number)=>string;len:(mm:number|undefined)=>string;pct:(r:number)=>string}
type Remedy=[RegExp,(x:RemedyContext)=>string|undefined];
/** The reduction a demand needs to meet its limit: 1 − 1/u, as a whole percent rounded up. */
const reduction=(u:number)=>Math.ceil((1-1/u)*100-1e-9);
const range=(x:RemedyContext)=>Number.isFinite(x.u)?`the stress range must drop by at least ${reduction(x.u)}%`:'the stress range must drop';
const sentenceStart=(v:string)=>v.charAt(0).toUpperCase()+v.slice(1);
/**
 * Remedies by check-id family, first match wins. Each states the change the result calls for, with the size or the
 * reduction the D/C gives (a fillet scales with D/C, a plate in bending with √(D/C), a saddle strip with D/C), or what to
 * refine or supply. Sizes are first estimates for the redesign; the revised design is recalculated.
 */
const remedies:Remedy[]=[
 // Fatigue register points, by detail family (the register id prefix).
 [/^detail-(fatigue|full-cycle)-SA/,x=>`Saddle end-fillet toes on the girder flange (AISC Table A-3.1 item 7.1): the range is the global flange stress plus the local flange bending from the tie force over the flange's effective width; ${range(x)}. Take the tie to the bearing stiffener (no attachment welded to the flange), or reduce the local bending with a shorter lever (a thinner saddle or a narrower tie) or a longer saddle; a longer attachment lowers the category.`],
 [/^detail-(fatigue|full-cycle)-RC/,x=>`Rail clip base welds on the ${x.p.section.kind==='cap'?'cap channel web':'girder top flange'}: ${range(x)}. Bolted clips or clips on a rail pad without welds to the flange, or a closer clip spacing that lowers the force on each clip.`],
 [/^detail-(fatigue|full-cycle)-(FT|FB)/,x=>`Girder flange at midspan: ${range(x)}. A heavier girder, or move the attachments that set the category away from the midspan flange.`],
 [/^detail-(fatigue|full-cycle)-FS/,x=>`Bearing stiffener weld toes: ${range(x)}. Thicker stiffeners and web, or a better detail at the toe.`],
 [/^detail-(fatigue|full-cycle)-SH/,x=>`End stop bolt holes in the flange: ${range(x)}. Move the end stop to a lower-stress location (over the support) or reduce the bumper force.`],
 [/^detail-(fatigue|full-cycle)-/,x=>`${sentenceStart(range(x))} at this detail: a better detail category, a larger section or a smaller cyclic force.`],
 // Girder
 [/^(torsion-normal|torsion-normal-bottom|combined|combined-bottom|minor)$/,x=>`Reduce the girder flange stress by at least ${reduction(x.u)}%: a section stiffer in lateral bending and torsion (wider or heavier top flange, or a cap channel), closer or stiffer top-flange restraint, or less play in the ties and bearings, which drives the second-order twist. Then recalculate.`],
 [/^(major|flexure-load-height|torsion-stability)$/,x=>`Raise the major-axis flexural strength by at least ${Math.ceil((x.u-1)*100)}%: a deeper or heavier girder, or brace the compression flange at shorter intervals (L_b = ${x.len(x.p.unbracedLength)}).`],
 [/^(shear|torsion-shear)$/,()=>'Increase the web area (thicker or deeper web) or reduce the torsion.'],
 [/^(wheel-yield|wheel-cripple|wheel-web-tr13|sidesway)$/,()=>'Thicker girder web, or a deeper rail to spread the wheel load.'],
 [/^(vertical|lateral|rail-head|rail-twist)$/,x=>`Stiffen the girder (${/vertical/.test(x.c.id)?'I_x':'lateral bending and torsion: I_y, J, C_w'}) or reduce the play of the ties and bearings, by at least ${reduction(x.u)}% of the movement; or obtain the owner's or crane supplier's acceptance of the larger value.`],
 // Bearings and stiffeners
 [/^stiffener-lateral-flexure$/,x=>{const b=x.p.details?.bearing;return `Thicken the bearing stiffener pair to t_s ≥ ${b?x.size(b.stiffenerThickness,x.u):'u·t_s'} (or widen to b_s ≥ ${b?x.size(b.stiffenerWidth,Math.sqrt(x.u)):'√u·b_s'}); the check is a bound (full-height cantilever, no web participation): refine the model with the web before resizing.`;}],
 [/^bearing-plate$/,x=>{const b=x.p.details?.bearing;return `Thicken the bearing plate to t_p ≥ ${b?x.size(b.thickness,Math.sqrt(x.u)):'√u·t_p'} (plate bending), or move the bearing stiffeners to shorten the cantilever.`;}],
 [/^stiffener-(weld|combined-weld)$/,x=>{const b=x.p.details?.bearing;return `Increase the stiffener-to-web fillets to w ≥ ${b?x.size(b.weldSize,x.u):'u·w'}.`;}],
 [/^stiffener-(fatigue|weld-fatigue)$/,x=>`Bearing stiffener: ${range(x)} (thicker or wider stiffeners, or full-penetration welds to a better category).`],
 // Ties at the flange
 [/^(flange-tie-flange|plate-tie-keeper-flange)$/,x=>{const g=flangeTieGeometry(x.p),b=g&&flangeEffectiveWidth(x.p,g);
  // The local stress falls with the effective width b_e = B + a + min(a, s_e): a saddle longer by (u - 1) b_e.
  return `The girder flange bends locally under the saddle (elastic, over the effective width b_e = B + a + min(a, s_e)${b?` = ${x.len(b.width)}`:''}): lengthen the saddle to B ≥ ${b?x.size(b.B+(x.u-1)*b.width,1):'B + (u − 1)b_e'} (the end-fillet toe category falls past 4 in), shorten the lever (a thinner saddle or a narrower tie), or take the tie to the bearing stiffener (stiffener tie, no flange bending).`;}],
 [/^flange-tie-column$/,x=>{const g=flangeTieGeometry(x.p),b=g?.receiver&&columnFlangeWidth(x.p,g);
  return `The column flange bends locally at the tie gusset (elastic, over b_c = h_g + min(x, s_top)${b?` = ${x.len(b.width)}`:''}): a taller column gusset${b?` (h_g ≥ ${x.size(b.hg+(x.u-1)*b.width,1)})`:''}, the gusset nearer the column web, or a column stiffener behind the gusset.`;}],
 [/^flange-tie-(gusset|saddle)$/,x=>`Thicker ${/gusset/.test(x.c.id)?'tie gusset':'saddle plate'} or a longer weld line: the local stress must drop by ${reduction(x.u)}%.`],
 [/^flange-tie-(saddle-weld|gusset-weld)$/,x=>{const a=x.p.details?.brace.flangeAttachment;return `Increase the ${/saddle/.test(x.c.id)?'saddle-to-flange end':'gusset-to-saddle'} fillets to w ≥ ${a?x.size(a.weldSize,x.u):'u·w'} (within the J2.2b edge limit), or lengthen them.`;}],
 [/^(flange-tie-column-weld|tie-weld|tie-move-weld)$/,x=>{const w=x.p.details?.brace.connection.weldSize;return `Increase the column gusset root fillets to w ≥ ${w?x.size(w,x.u):'u·w'}, or a taller gusset${/move/.test(x.c.id)?'; or release the imposed movement at the column end (sleeved slots)':''}.`;}],
 [/^tie-(slip|bolts?|bolt-shear|bearing)$|^tie-.*-(slip|bolt)$/,x=>`Raise the lap bolt resistance by ${Math.ceil((x.u-1)*100)}%: more or larger bolts, or a Class B faying surface (slip).`],
 [/^tie-move-(strength|gusset|fatigue|root-fatigue)$/,x=>noCapacity(x.u)?'The tie buckles under its force with the imposed movement (no capacity): a thicker plate or bars, or a shorter clear length between the bolt groups.':`Reduce the bending from the imposed movement by ${reduction(x.u)}%: release the column end (sleeved vertical slots), lengthen the clear tie length, or a thinner, more flexible tie out of plane with the axial strength kept.`],
 [/^(brace-member|brace-stiffness)$/,x=>`Stronger or stiffer tie (larger plate or bars, stiffer connections): ${Math.ceil((x.u-1)*100)}% more is needed.`],
 [/^flange-tie-.*fatigue$/,x=>`Tie attachment: ${range(x)}: a stiffer, longer saddle or taller gusset, or take the tie to the bearing stiffener.`],
 // Supports
 [/^(bracket|haunch|wbracket)-colstiff-(flange-weld|web-weld)$/,x=>{const g=columnStiffenerGeometry(x.p),w=g&&(/flange/.test(x.c.id)?g.s.flangeWeld:g.s.webWeld);return `Increase the column stiffener ${/flange/.test(x.c.id)?'flange':'web'} fillets to w ≥ ${w?x.size(w,x.u):'u·w'}.`;}],
 [/^(bracket|haunch|wbracket)-colstiff-web-shear$/,()=>'Lengthen the column stiffeners (full depth) or add a web doubler: the column web shear along the welds is exceeded.'],
 [/^(bracket|haunch|wbracket)-colstiff-fatigue-(weld|plate)$/,x=>`Column stiffener ${/weld/.test(x.c.id)?'fillet throats (Category F)':'plates at their fillets'}: ${range(x)}. Larger fillets or complete-joint-penetration welds (a better category), or thicker plates.`],
 [/^(bracket|haunch|wbracket)-fatigue-/,x=>`Bracket welds and plates at the column: ${range(x)}. Larger welds or a better detail category, deeper ribs or a thicker seat, or a smaller cyclic reaction.`],
 [/^bracket-root-weld$/,x=>{const w=x.p.details?.bracket?.rootWeld;return `Increase the rib-to-column fillets to w ≥ ${w?x.size(w,x.u):'u·w'}, or deeper ribs.`;}],
 [/^bracket-seat-weld$/,x=>{const w=x.p.details?.bracket?.seatWeld;return `Increase the seat fillets to w ≥ ${w?x.size(w,x.u):'u·w'}.`;}],
 [/^column-brackets$/,()=>'The grid reaction exceeds the AIST TR-13 §5.9.2 limit for column-mounted brackets: provide crane columns, or record the engineer of record’s acceptance of brackets for this load.'],
 [/^column-torsion$/,()=>'Take the longitudinal force out at the girder line: a crane-level strut at the locating columns (by others), or a bracket that brings the force to the column centerline.'],
 [/^column-/,x=>`Existing column exceeded by ${Math.ceil((x.u-1)*100)}%: reinforce the column or reduce its demand; confirm the restraint assumptions with the building engineer of record.`],
 [/fatigue/,x=>`${sentenceStart(range(x))}: a better detail category, a larger section at the detail, or a smaller cyclic force.`],
 // Rail and end stops
 [/^rail-anchorage$/,x=>`Anchor the rail for ${Math.ceil((x.u-1)*100)}% more longitudinal force: more anchor clip pairs (at least ${Math.ceil(x.u)}× the present), or anchor the rail at the end stops.`],
 [/^rail-joint-/,()=>'Rail joint: longer or thicker joint bars and larger bolts, or welded rail joints.'],
 [/^rail-clip-/,()=>'Closer rail clip spacing or a clip with a higher rating (manufacturer).'],
 [/^end-stop-(slip|bolt-tension|bolt-shear|bearing-base|bearing-flange)$/,x=>`Raise the end stop bolt resistance by ${Math.ceil((x.u-1)*100)}%: more or larger bolts, or a Class B faying surface.`],
 [/^end-stop-(girder|uplift)$/,()=>'Lower the bumper or move the stop force into the column (column-mounted stop); the girder at the stop is overstressed.'],
 [/^end-stop-/,x=>`Larger end stop plates or welds: ${Math.ceil((x.u-1)*100)}% more resistance is needed.`],
];
/** Detailing rules: the dimension to provide, from the rule's own provided and required values. */
function detailingRemedy(x:RemedyContext){
 const c=x.c;if(c.demand===undefined||c.capacity===undefined||!Number.isFinite(c.capacity))return undefined;
 const max=maximumRule(c),q=c.quantity??'ratio',v=(n:number)=>value(n,q,x.units);
 if(q!=='length')return max?`Reduce to at most ${v(c.capacity)} (now ${v(c.demand)}).`:`Provide at least ${v(c.demand)} (now ${v(c.capacity)}).`;
 const short=Math.abs(c.demand-c.capacity);
 return max?`Reduce to at most ${v(c.capacity)} (now ${v(c.demand)}, ${sig3(short,'length',x.units)} over): resize or relocate the part.`
  :`Provide at least ${v(c.demand)} (now ${v(c.capacity)}, ${sig3(short,'length',x.units)} short): move the hole, bolt or part, or resize it.`;
}
/** The first sentence of a note, without an "OPEN ITEM:" prefix. */
const firstSentence=(v:string)=>{const t=v.replace(/^OPEN ITEM:\s*/,'');const m=t.match(/^.{12,240}?[.;](\s|$)/);return (m?m[0]:t.slice(0,200)).trim();};
export function remedyFor(g:OpenGroup,s:CalculationSnapshot,tax:Taxonomy){
 const p=s.input,c=g.governing,t=tax.entries.get(c.id),units=p.units,u=g.dc===undefined||g.dc<0?1:g.dc;
 const step=units==='US'?25.4/16:1;
 const x:RemedyContext={c,g,s,p,u,units,len:v=>sig3(v,'length',units),pct:r=>`${Math.ceil(r*100)}%`,
  size:(mm,r)=>Number.isFinite(r)?noteLength(Math.ceil(mm*r/step-1e-9)*step,units):'a larger size'};
 // Missing or unconfirmed data: what to supply, from the check's own note.
 if(g.kind==='input'&&c.status!=='fail')return `Supply or confirm: ${firstSentence(c.note)}`;
 if(c.group==='Coordination'&&!c.demand)return firstSentence(c.note);
 const own=remedies.find(([re])=>re.test(c.id));
 const text=t?.type==='detailing'||g.kind==='clash'?detailingRemedy(x):undefined;
 if(text)return text;
 // No capacity (a zero resistance, or an amplifier past its limit): a resize by the ratio means nothing.
 if(noCapacity(u)&&!/^tie-move-/.test(c.id))return 'No capacity in this arrangement: change the arrangement or the part (the check cannot be met by resizing alone).';
 const v=own?.[1](x);if(v)return v;
 if(g.kind==='input')return `Resolve: ${firstSentence(c.note)}`;
 // A fatigue detail without its own remedy: the reduction of its stress range.
 const f=t?.effect==='fatigue'?fatigueData(s,c):undefined;
 if(f)return `${sentenceStart(range(x))} at this detail: a better detail category, a larger section or a smaller cyclic force.`;
 return `Increase the resistance by at least ${Math.ceil((u-1)*100)}%, or reduce the demand, then recalculate.`;
}

/** Element of each open item, for the summary: element key → the open items there, governing first. */
export function openByElement(groups:OpenGroup[]){
 const m=new Map<string,OpenGroup[]>();
 for(const g of groups)m.set(g.element,[...(m.get(g.element)??[]),g]);
 return m;
}
/**
 * A detailing rule or a fit is met or not: its item prints no ratio (a clearance sentinel would read as NO CAPACITY);
 * its remedy states the dimension to provide.
 */
export const ruleItem=(g:OpenGroup)=>g.kind==='clash'||g.kind==='detailing';
/** An item's result in a sentence: "D/C 2.21", "NO CAPACITY", "not met" for a rule, or its open status. */
export const groupDc=(g:OpenGroup)=>g.governing.status!=='fail'?statusLabel(g.governing.status):ruleItem(g)?'not met':g.dc===undefined?'NG':noCapacity(g.dc)?'NO CAPACITY':`D/C ${dcText(g.dc,2)}`;
/** An item's result in the open-items table: the D/C with NG, NG alone for a rule, or its open status. */
export const groupDcCell=(g:OpenGroup)=>g.governing.status!=='fail'?`<b>${statusLabel(g.governing.status)}</b>`:ruleItem(g)||g.dc===undefined?'<b>NG</b>':`<b>${dcText(g.dc,2)}</b> NG`;
export type {TaxonEntry};

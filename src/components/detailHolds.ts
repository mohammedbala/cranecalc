import type {CalculationSnapshot,CheckResult} from '../engine/types';
import {rect,text,textWidth,lettering} from './sheetGraphics';
import type {ViewRender} from './detailSheet';
import type {OpenGroup} from '../report/openItems';
import {sheetOpenGroups,blockedPackage,sheetDc,checkDc,sheetCheckName} from './sheetRatios';

/**
 * A view whose parts cannot be built as dimensioned: a part size or clear length ≤ 0, a failing fit or clearance rule of
 * the view, or one of its checks in snapshot.geometryConflicts (checkIntegrity.ts). Returns the check that says so, or
 * 'PART SIZE ≤ 0' for a size with no check behind it; undefined when the view can be drawn.
 */
export function viewConflict(s:CalculationSnapshot,o:{sizes?:(number|undefined)[];fits?:RegExp;checks?:RegExp}):string|undefined{
 const conflicts=s.geometryConflicts??s.checks.filter(c=>c.geometry).map(c=>({id:c.id,title:c.title}));
 const own=o.checks?conflicts.find(c=>o.checks!.test(c.id)):undefined;if(own)return own.id;
 const fit=o.fits?s.checks.find(c=>c.status==='fail'&&o.fits!.test(c.id)):undefined;if(fit)return fit.id;
 if((o.sizes??[]).some(v=>v!==undefined&&!(Number.isFinite(v)&&v>0)))return 'PART SIZE ≤ 0';
 return undefined;
}
/** The body of a view that is not detailed: a boxed GEOMETRY CONFLICT - NOT DETAILED with the check behind it; its title stays. */
export function conflictView(id:string):ViewRender{
 const lines=['GEOMETRY CONFLICT - NOT DETAILED',`(${id.toUpperCase()})`,'REVISE THE ARRANGEMENT BEFORE DETAILING'];
 const size=lettering.text,w=Math.max(...lines.map((v,i)=>textWidth(v,i?size:12,!i)))+28,h=22+lines.length*16;
 let svg=`<g data-view="geometry-conflict" data-geometry-conflict="${id}">${rect(0,0,w,h,'divider')}`;
 lines.forEach((v,i)=>{svg+=text(w/2,22+i*16,v,i?size:12,'middle',i?400:700);});
 return {svg:svg+'</g>',scale:'NOT DETAILED'};
}

/**
 * HOLD tags: each open item with a failing check (and the crane-column footing coordination item, unverified: the
 * isolated footing drawn is not built until the combined or enlarged footing is designed), at the views that draw its part, so a detail is never read as final
 * while the calculation fails it. An item maps to views by the report's element of its governing check (openItemGroups),
 * and register points and fit rules by their ids; one that maps to no view is listed on S-00 (OPEN ITEMS).
 */
export interface Hold{group:OpenGroup;check:CheckResult;dc?:number;views?:RegExp;text:string;
 /** The result alone ("NG D/C 1.22", "NG GEOMETRY CONFLICT"), for the boxed tag at a view: the sheet's hold list names the check. */
 tag:string}
const byId:[RegExp,RegExp][]=[
 [/^detail-(fatigue|full-cycle)-(SA|SL)/,/SADDLE|FLANGE TIE|TIE AND STIFFENER/],
 [/^detail-(fatigue|full-cycle)-RC/,/RAIL CLIP/],
 [/^detail-(fatigue|full-cycle)-SH/,/END STOP/],
 [/^detail-(fatigue|full-cycle)-FS/,/BEARING/],
 [/^detail-(fatigue|full-cycle)-/,/$^/],
 [/^(end-stop-|crane-\d+-bumper-stop$)/,/END STOP/],
 // The bracket's own checks and the TR-13 reaction recommendation (column-brackets, element 'gates') at the bracket views.
 [/^(column-brackets$|bracket-)/,/BRACKET|HAUNCH/],
 [/^(cap-angle-|cap-clearance$)/,/CAP TIEBACK|FLANGE TIE/],
 [/^rail-joint-/,/RAIL JOINT|RAIL LAYOUT/],
 [/^rail-(clip|keeper|pad|seat)/,/RAIL CLIP/],
 [/^rail-/,/RAIL (CLIP|JOINT|LAYOUT)/],
 [/^end-bearing-/,/END BEARINGS|SLIDING BEARING BOLT|GIRDER BEARINGS \/ LOCATING/],
 // A crane column tied to the building column (craneColumnSheet.ts): the footing coordination at the footing plan, the
 // column tie at its section, the brace and the building column at the elevation.
 [/^crane-column-footing-clearance$/,/^FOOTING \/ PLAN$/],
 [/^crane-column-tie-/,/^COLUMN TIE \/ SECTION$/],
 [/^(crane-column-|building-column-)/,/^CRANE COLUMN AND BUILDING COLUMN/],
];
const byElement:Record<string,RegExp>={
 // The girder's strength items at the capped girder section (a rolled girder has no detail of its own: listed on S-00).
 girder:/^CAPPED GIRDER SECTION$/,
 rail:/RAIL (CLIP|JOINT|LAYOUT)/,bearing:/BEARING|SLIDING/,tie:/TIE|SADDLE|CAP TIEBACK/,stops:/END STOP/,
 support:/BRACKET|HAUNCH|COLUMN CAP|GIRDER BEARING|GIRDER END AT COLUMN|ADJACENT GIRDER ENDS/,column:/NEW RUNWAY COLUMN|BASE PLATE|COLUMN CAP/,base:/NEW RUNWAY COLUMN|BASE PLATE|FOOTING/,
 longitudinal:/BRACED BAY|BRACE AND STRUT|BRACE AT COLUMN|STRUT AND GUSSETS/,
};
const cache=new WeakMap<CheckResult[],Hold[]>();
export function holdsFor(s:CalculationSnapshot):Hold[]{
 let v=cache.get(s.checks);if(v)return v;
 const coordination=(c:CheckResult)=>c.id==='crane-column-footing-clearance'&&c.status==='unverified';
 v=sheetOpenGroups(s).filter(g=>g.members.some(c=>c.status==='fail'||coordination(c))).map(g=>{
  if(coordination(g.governing))return {group:g,check:g.governing,views:/^FOOTING \/ PLAN$/,text:'OPEN ITEM: FOOTING COORDINATION',tag:'OPEN ITEM: FOOTING COORDINATION'};
  const c=g.members.find(m=>m.status==='fail')===g.governing?g.governing:g.members.find(m=>m.status==='fail')!;
  const views=byId.find(([re])=>re.test(c.id))?.[1]??byElement[g.element];
  const dc=c.geometry?undefined:g.kind==='clash'||g.kind==='detailing'?checkDc(c):g.dc;
  const shown=dc===undefined?'':sheetDc(s,dc).replace(/ NG$/,''),value=c.geometry?'GEOMETRY CONFLICT':blockedPackage(s)||!shown?'':shown==='NO CAPACITY'?shown:`D/C ${shown}`;
  return {group:g,check:c,dc,views:views&&views.source!=='$^'?views:undefined,text:`NG ${sheetCheckName(c,g).toUpperCase()}${value?` ${value}`:''}`,tag:`NG${value?` ${value}`:''}`};
 });
 cache.set(s.checks,v);return v;
}
/** The holds at one view, worst first. */
export const viewHolds=(s:CalculationSnapshot,title:string)=>holdsFor(s).filter(h=>h.views?.test(title)).sort((a,b)=>(b.dc??-1)-(a.dc??-1));
/** The open items no view draws: listed on S-00. */
export const unplacedHolds=(s:CalculationSnapshot,titles:string[])=>holdsFor(s).filter(h=>!h.views||!titles.some(t=>h.views!.test(t)));
/**
 * The boxed tag below a view title: "HOLD - NG D/C x.xx (+n)", the worst hold's result; the sheet's hold list names each
 * check by its title (a check title in the tag would outgrow narrow views).
 */
export function holdTag(cx:number,y:number,holds:Hold[]){
 if(!holds.length)return '';
 const label=`HOLD - ${holds[0].tag}${holds.length>1?` (+${holds.length-1})`:''}`,size=lettering.text,w=textWidth(label,size,true)+10;
 return `<g data-hold="${holds.map(h=>h.check.id).join(' ')}">${rect(cx-w/2,y-size*.86,w,size*1.16,'divider')}${text(cx,y,label,size,'middle',700)}</g>`;
}

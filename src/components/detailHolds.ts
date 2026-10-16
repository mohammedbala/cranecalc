import type {CalculationSnapshot,CheckResult} from '../engine/types';
import {rect,text,textWidth,lettering} from './sheetGraphics';
import type {ViewRender} from './detailSheet';

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
export type {CheckResult};

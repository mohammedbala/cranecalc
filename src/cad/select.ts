/**
 * Selection beyond picks and windows: fence, quick select by type and property, select similar, and groups.
 */
import {inWindow,pieceIntersections,pieces,segSeg,textBox,type Box,type CadDoc,type Ent,type Pt} from './model';

/** Entities crossed by the fence (a chain of points). */
export function fenceSelect(ents:Ent[],fence:Pt[],doc:Pick<CadDoc,'display'|'realPerUnit'>):number[]{
 const segs=fence.slice(1).map((b,i)=>({k:'seg' as const,a:fence[i],b}));
 return ents.filter(e=>{
  if(e.type==='text'){const b=textBox(e);return segs.some(s=>b.some((p,i)=>segSeg(s.a,s.b,p,b[(i+1)%4])));}
  const ps=pieces(e,doc);return segs.some(s=>ps.some(p=>pieceIntersections(s,p).length>0));
 }).map(e=>e.id);
}
export type QuickProp='layer'|'color'|'ltype'|'weight';
export interface QuickSpec{type:Ent['type']|'*';prop:QuickProp|'none';op:'='|'<>'|'*';value?:string;exclude?:boolean}
/** A property as QSELECT compares it: ByLayer for an object without its own value. */
export function propValue(e:Ent,prop:QuickProp):string{
 if(prop==='layer')return e.layer;
 const v=e[prop];return v===undefined?'ByLayer':String(v);
}
/** QSELECT: the entities of a type whose property equals (or not) the value; exclude inverts the match. */
export function quickSelect(ents:Ent[],spec:QuickSpec):number[]{
 const match=(e:Ent)=>{
  if(spec.type!=='*'&&e.type!==spec.type&&!(spec.type==='xline'&&e.type==='ray'))return false;
  if(spec.prop==='none'||spec.op==='*')return true;
  const v=propValue(e,spec.prop);return spec.op==='='?v===spec.value:v!==spec.value;
 };
 return ents.filter(e=>spec.exclude?!match(e):match(e)).map(e=>e.id);
}
/** SELECTSIMILAR: entities of the same type, layer, color, linetype and lineweight as any selected one. */
export function selectSimilar(ents:Ent[],selected:Ent[]):number[]{
 const sig=(e:Ent)=>[e.type==='ray'?'xline':e.type,e.layer,e.color,e.ltype,e.weight].join('|'),want=new Set(selected.map(sig));
 return ents.filter(e=>want.has(sig(e))).map(e=>e.id);
}
/** The ids with every member of the groups they belong to. */
export function expandGroups(doc:Pick<CadDoc,'groups'>,ids:Iterable<number>):number[]{
 const set=new Set(ids);if(!doc.groups?.length)return [...set];
 for(const g of doc.groups)if(g.ids.some(id=>set.has(id)))for(const id of g.ids)set.add(id);
 return [...set];
}
/** A fresh unnamed group name (*A1, *A2 ...). */
export const unnamedGroup=(doc:Pick<CadDoc,'groups'>)=>{let i=1;while(doc.groups?.some(g=>g.name===`*A${i}`))i++;return `*A${i}`;};
/** Window or crossing selection (re-exported for callers that only need selection). */
export const windowSelect=(ents:Ent[],box:Box,crossing:boolean,doc:Pick<CadDoc,'display'|'realPerUnit'>)=>ents.filter(e=>inWindow(e,box,crossing,doc)).map(e=>e.id);

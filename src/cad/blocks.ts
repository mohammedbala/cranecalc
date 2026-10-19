/**
 * Blocks and references: named block definitions with attribute definitions, block references (inserts) with
 * attribute values, and external references to other drawings of the project. A reference draws, picks and
 * exports as the definition's entities placed by its insertion point, scale, rotation and mirror.
 */
import {
 apply,compose,mirroring,rotation,scaling,transformEnt,translation,
 type Affine,type AttDefEnt,type CadDoc,type Ent,type InsertEnt,type Pt,type TextEnt,type XrefEnt,
} from './model';

export interface BlockDef{name:string;base:Pt;entities:Ent[];description?:string;units?:CadDoc['unit']}
/** What expanding a reference needs from its drawing. */
export type BlockCtx=Partial<Pick<CadDoc,'blocks'|'unit'>>;

/** The map from block coordinates to the drawing: base point to the origin, mirror, scale, rotate, then to the insertion point. */
export function insertMap(e:Pick<InsertEnt,'at'|'scale'|'rotation'|'mirror'>,base:Pt):Affine{
 let m=translation([-base[0],-base[1]]);
 if(e.mirror)m=compose(mirroring([0,0],[0,1]),m);
 m=compose(scaling([0,0],e.scale),m);
 m=compose(rotation([0,0],e.rotation),m);
 return compose(translation(e.at),m);
}
/** An attribute definition as the text it shows outside a block: its tag. */
export const attdefText=(a:Omit<AttDefEnt,'id'>,value=a.tag):Omit<TextEnt,'id'>=>({type:'text',layer:a.layer,at:a.at,height:a.height,value,angle:a.angle,align:a.align,bold:false,...(a.style?{style:a.style}:{}),...(a.color!==undefined?{color:a.color}:{})});

// ---- external references -------------------------------------------------------------------------------------------
let xrefResolver:((name:string)=>CadDoc|undefined)|undefined;
/** The editor registers where referenced drawings come from (the project's sheets and sketches, edited or generated). */
export function setXrefResolver(fn:((name:string)=>CadDoc|undefined)|undefined){xrefResolver=fn;xrefCache.clear();}
const xrefCache=new Map<string,CadDoc|undefined>();
export function resolveXref(name:string){if(!xrefResolver)return undefined;if(!xrefCache.has(name))xrefCache.set(name,xrefResolver(name));return xrefCache.get(name);}

// ---- expansion -----------------------------------------------------------------------------------------------------
const cache=new WeakMap<object,{blocks:unknown;children:Ent[]}>();
/**
 * The entities a reference draws, in drawing coordinates: nested references expanded, attribute definitions shown with
 * the reference's values (hidden ones left out), and children on layer 0 taking the reference's layer and properties.
 */
export function children(e:InsertEnt|XrefEnt|Omit<InsertEnt,'id'>|Omit<XrefEnt,'id'>,ctx:BlockCtx,depth=0):Ent[]{
 const hit=cache.get(e);if(hit&&hit.blocks===(e.type==='xref'?resolveXref(e.name):ctx.blocks))return hit.children;
 let src:Ent[]=[],base:Pt=[0,0],inner:BlockCtx=ctx;
 if(e.type==='insert'){const def=ctx.blocks?.find(b=>b.name===e.name);if(def){src=def.entities;base=def.base;}}
 else{const doc=resolveXref(e.name);if(doc){src=doc.entities.filter(x=>doc.layers.find(l=>l.name===x.layer)?.visible!==false);inner=doc;}}
 const out:Ent[]=[];
 if(depth<8){
  const m=insertMap({at:e.at,scale:e.scale,rotation:e.rotation,mirror:e.type==='insert'?e.mirror:false},base);
  for(const c of src){
   const own=c.layer==='0'?{layer:e.layer,...(c.color===undefined&&e.color!==undefined?{color:e.color}:{}),...(c.ltype===undefined&&e.ltype!==undefined?{ltype:e.ltype}:{}),...(c.weight===undefined&&e.weight!==undefined?{weight:e.weight}:{})}:{};
   if(c.type==='attdef'){
    if(c.invisible)continue;
    const value=e.type==='insert'?e.attribs?.[c.tag]??c.value:c.tag;
    out.push(transformEnt({...attdefText(c,value),id:-1,...own} as TextEnt,m));continue;
   }
   if(c.type==='insert'||c.type==='xref'){for(const g of children(transformEnt({...c,...own},m) as InsertEnt|XrefEnt,inner,depth+1))out.push(g);continue;}
   out.push(transformEnt({...c,...own,id:-1} as Ent,m));
  }
 }
 cache.set(e,{blocks:e.type==='xref'?resolveXref(e.name):ctx.blocks,children:out});
 return out;
}
/**
 * The drawing's entities with every reference replaced by what it draws (for plotting and export); children on layers
 * the drawing lacks (an external drawing's) go on the reference's layer.
 */
export function flatten(list:Ent[],ctx:BlockCtx&Partial<Pick<CadDoc,'layers'>>):Ent[]{
 if(!list.some(e=>e.type==='insert'||e.type==='xref'))return list;
 const names=ctx.layers?new Set(ctx.layers.map(l=>l.name)):undefined;
 return list.flatMap(e=>e.type==='insert'||e.type==='xref'?children(e,ctx).map(c=>names&&!names.has(c.layer)?{...c,layer:e.layer}:c):[e]);
}
/** The attribute definitions of a block, in order. */
export const attdefsOf=(def:BlockDef|undefined)=>(def?.entities??[]).filter((e):e is AttDefEnt=>e.type==='attdef');
/** A block made from entities: their own coordinates, with the base point that will sit at the insertion point. */
export function makeBlock(name:string,base:Pt,ents:Ent[],description?:string):BlockDef{
 return {name,base,entities:ents.map((e,i)=>({...e,id:i+1})),...(description?{description}:{})};
}
/** Whether the block (or a block it nests) refers to the named block: a definition may not contain itself. */
export function nests(blocks:BlockDef[],name:string,target:string,seen=new Set<string>()):boolean{
 if(name===target)return true;if(seen.has(name))return false;seen.add(name);
 const def=blocks.find(b=>b.name===name);
 return !!def?.entities.some(e=>e.type==='insert'&&nests(blocks,e.name,target,seen));
}
/** Where a point in block coordinates lands in the drawing. */
export const toDrawing=(e:InsertEnt,def:BlockDef,p:Pt)=>apply(insertMap(e,def.base),p);

/**
 * Edit tracking: an edited drawing as a change set over the drawing generated from the design. Each generated object
 * carries the signature of its content (src); the drawing keeps the signatures it was generated with. An object with
 * its src unchanged is generated; with a different signature, modified; without src, added by the user; a generated
 * signature missing from the drawing was deleted. When the design changes, the change set is replayed on the newly
 * generated drawing: generated objects follow the design, the user's additions, deletions and modifications carry
 * over, and a modified object whose generated original is gone is flagged for review.
 */
import type {CadDoc,CadGroup,CadLayer,Ent} from './model';

const fnv=(s:string,seed:number)=>{let h=seed>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0).toString(16).padStart(8,'0');};
const round=(v:unknown):unknown=>typeof v==='number'?Math.round(v*1e4)/1e4:Array.isArray(v)?v.map(round):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>k!=='id'&&k!=='src').sort(([a],[b])=>a<b?-1:1).map(([k,x])=>[k,round(x)])):v;
/** The content signature of an object: its type, layer, properties and geometry (to 1e-4), not its id. */
export function signature(e:Ent):string{const s=JSON.stringify(round(e));return fnv(s,0x811c9dc5)+fnv(s,0x01000193);}
/** A generated drawing with every object marked by its signature, and the set of signatures kept. */
export function stamp(doc:CadDoc):CadDoc{
 const entities=doc.entities.map(e=>({...e,src:signature(e)}));
 return {...doc,entities,generatedSigs:entities.map(e=>e.src)};
}
export const isModified=(e:Ent)=>!!e.src&&signature(e)!==e.src;
export interface EditSet{added:Ent[];modified:Ent[];deleted:string[]}
/** The user's edits relative to the drawing as generated (undefined for drawings edited before tracking). */
export function editSet(doc:CadDoc):EditSet|undefined{
 if(!doc.generatedSigs)return undefined;
 const left=new Map<string,number>();for(const s of doc.generatedSigs)left.set(s,(left.get(s)??0)+1);
 const added:Ent[]=[],modified:Ent[]=[];
 for(const e of doc.entities){
  if(!e.src||!left.get(e.src)){added.push(e);continue;}
  left.set(e.src,left.get(e.src)!-1);if(isModified(e))modified.push(e);
 }
 const deleted:string[]=[];for(const [s,n] of left)for(let i=0;i<n;i++)deleted.push(s);
 return {added,modified,deleted};
}
export interface Conflict{id:number;note:string}
export interface Replay{doc:CadDoc;conflicts:Conflict[];carried:{added:number;modified:number;deleted:number};dropped:number}
/** The edits replayed on the drawing generated for the current design. */
export function replay(edited:CadDoc,generated:CadDoc):Replay|undefined{
 const set=editSet(edited);if(!set)return undefined;
 const gen=stamp(generated),bySig=new Map<string,Ent[]>();
 for(const e of gen.entities){const l=bySig.get(e.src!);if(l)l.push(e);else bySig.set(e.src!,[e]);}
 const removed=new Set<Ent>(),replaced=new Map<Ent,Ent>(),idMap=new Map<number,number>(),conflicts:Conflict[]=[];
 let deleted=0,modified=0,dropped=0;
 for(const s of set.deleted){const l=bySig.get(s);const hit=l?.find(x=>!removed.has(x)&&!replaced.has(x));if(hit){removed.add(hit);deleted++;}else dropped++;}
 const extra:Ent[]=[];
 for(const e of set.modified){
  const l=bySig.get(e.src!),hit=l?.find(x=>!removed.has(x)&&!replaced.has(x));
  if(hit){replaced.set(hit,{...e,id:hit.id});idMap.set(e.id,hit.id);modified++;}
  else{const {src:_,...rest}=e;extra.push(rest as Ent);}
 }
 // Generated objects the user left alone keep their new ids (and follow the design); others are mapped where they went.
 const unchangedOld=new Map<string,number[]>();for(const e of edited.entities)if(e.src&&!isModified(e)){const l=unchangedOld.get(e.src);if(l)l.push(e.id);else unchangedOld.set(e.src,[e.id]);}
 const entities:Ent[]=[];
 for(const e of gen.entities){if(removed.has(e))continue;const r=replaced.get(e);entities.push(r??e);if(!r){const l=unchangedOld.get(e.src!);const old=l?.shift();if(old!==undefined)idMap.set(old,e.id);}}
 let nextId=Math.max(gen.nextId,...entities.map(e=>e.id))+1;
 for(const e of extra){const id=nextId++;idMap.set(e.id,id);entities.push({...e,id});conflicts.push({id,note:'You modified this object; the design no longer generates the original, so it is kept as you left it.'});}
 for(const e of set.added){const id=nextId++;idMap.set(e.id,id);const {src:_,...rest}=e;entities.push({...rest,id} as Ent);}
 // Layers: the generated table, with the edited states and any layers the user made.
 const layers:CadLayer[]=gen.layers.map(l=>edited.layers.find(x=>x.name===l.name)??l);
 for(const l of edited.layers)if(!layers.some(x=>x.name===l.name))layers.push(l);
 const groups:CadGroup[]=(edited.groups??[]).map(g=>({name:g.name,ids:g.ids.map(i=>idMap.get(i)).filter((x):x is number=>x!==undefined)})).filter(g=>g.ids.length);
 const doc:CadDoc={...gen,layers,entities,nextId,generatedSigs:gen.generatedSigs,realPerUnit:edited.realPerUnit,
  ...(groups.length?{groups}:{}),...(edited.textStyles?{textStyles:edited.textStyles}:{}),...(edited.dimStyles?{dimStyles:edited.dimStyles}:{}),...(edited.blocks?{blocks:edited.blocks}:{}),
  ...(edited.model?{model:edited.model}:{}),...(edited.ltscale?{ltscale:edited.ltscale}:{}),...(edited.plotStyle?{plotStyle:edited.plotStyle}:{}),...(edited.pageSetup?{pageSetup:edited.pageSetup}:{})};
 return {doc,conflicts,carried:{added:set.added.length,modified,deleted},dropped};
}

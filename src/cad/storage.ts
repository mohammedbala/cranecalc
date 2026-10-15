import {useSyncExternalStore} from 'react';
import type {CalculationSnapshot,ProjectInput} from '../engine/types';
import type {CadDoc} from './model';

/**
 * Edited drawings, saved in the browser (IndexedDB) by project and drawing. Each keeps the design it was made from
 * (`base`): the calculation fingerprint and the framing settings. While the design is unchanged the edited drawing
 * replaces the generated one; after a design change the generated drawing shows and the edit waits for review.
 */
export interface CadRecord{id:string;project:string;drawing:string;base:string;savedAt:string;doc:CadDoc}

const DB='cranecalc-cad',STORE='drawings';
const fnv=(s:string)=>{let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0).toString(16).padStart(8,'0');};
export const cadProjectKey=(p:ProjectInput)=>(p.number||'untitled').trim()||'untitled';
export const cadBaseKey=(s:CalculationSnapshot,framing:unknown)=>`${s.revision}|${fnv(JSON.stringify(framing??{}))}`;
const recordId=(project:string,drawing:string)=>`${project}|${drawing}`;

let dbPromise:Promise<IDBDatabase|null>|undefined;
function db(){
 if(!dbPromise)dbPromise=new Promise(resolve=>{
  try{
   if(typeof indexedDB==='undefined'){resolve(null);return;}
   const req=indexedDB.open(DB,1);
   req.onupgradeneeded=()=>{const store=req.result.createObjectStore(STORE,{keyPath:'id'});store.createIndex('project','project');};
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);req.onblocked=()=>resolve(null);
  }catch{resolve(null);}
 });
 return dbPromise;
}
const done=<T,>(req:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});

// In-memory copy of the records, shared by the drafting viewer, the editor and the output panel.
const records=new Map<string,CadRecord>(),loaded=new Set<string>(),listeners=new Set<()=>void>();
let version=0;
const emit=()=>{version++;for(const fn of listeners)fn();};
/** Whether edits can be kept after the page closes (IndexedDB available). */
export let cadPersistent=true;

export async function loadCadRecords(project:string){
 if(loaded.has(project))return;
 loaded.add(project);
 const d=await db();if(!d){cadPersistent=false;return;}
 try{
  const list=await done(d.transaction(STORE).objectStore(STORE).index('project').getAll(project) as IDBRequest<CadRecord[]>);
  for(const r of list)if(!records.has(r.id))records.set(r.id,r);
  emit();
 }catch{cadPersistent=false;}
}
export function getCadRecord(project:string,drawing:string){return records.get(recordId(project,drawing));}
export async function saveCadRecord(project:string,base:string,doc:CadDoc){
 const r:CadRecord={id:recordId(project,doc.key),project,drawing:doc.key,base,savedAt:new Date().toISOString(),doc};
 records.set(r.id,r);emit();
 const d=await db();if(!d){cadPersistent=false;return r;}
 try{await done(d.transaction(STORE,'readwrite').objectStore(STORE).put(r));}catch{cadPersistent=false;}
 return r;
}
export async function deleteCadRecord(project:string,drawing:string){
 const id=recordId(project,drawing);records.delete(id);emit();
 const d=await db();if(!d)return;
 try{await done(d.transaction(STORE,'readwrite').objectStore(STORE).delete(id));}catch{/* kept in memory only */}
}
/** Re-render on any change to the saved edits; returns the version. */
export function useCadRecords(project:string){
 if(!loaded.has(project))void loadCadRecords(project);
 return useSyncExternalStore(fn=>{listeners.add(fn);return ()=>{listeners.delete(fn);};},()=>version,()=>version);
}
/** The saved edit of a drawing and whether it was made for the current design. */
export function cadEditFor(project:string,drawing:string,base:string){
 const r=getCadRecord(project,drawing);
 return r?{record:r,current:r.base===base}:undefined;
}

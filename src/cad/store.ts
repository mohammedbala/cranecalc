import type {CadDoc,CadLayer,Ent,NewEnt} from './model';

/** One undoable edit: entities put (added or replaced by id) and deleted, and optionally the layer table. */
export interface Change{put?:Ent[];add?:NewEnt[];del?:number[];layers?:CadLayer[]}
interface State{ents:Map<number,Ent|null>;layers?:CadLayer[]}
interface Step{label:string;before:State;after:State}

/** The open drawing with its selection and unlimited undo and redo. */
export class CadStore{
 doc:CadDoc;
 selection=new Set<number>();
 /** Bumped on every change to the drawing or the selection. */
 version=0;
 /** Bumped on changes to the drawing only (not the selection). */
 docVersion=0;
 private byId=new Map<number,Ent>();
 private undoStack:Step[]=[];private redoStack:Step[]=[];
 private listeners=new Set<()=>void>();
 constructor(doc:CadDoc){this.doc=doc;this.index();}
 private index(){this.byId=new Map(this.doc.entities.map(e=>[e.id,e]));}
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return ()=>{this.listeners.delete(fn);};};
 getVersion=()=>this.version;
 private emit(doc:boolean){this.version++;if(doc)this.docVersion++;for(const fn of this.listeners)fn();}
 get(id:number){return this.byId.get(id);}
 get canUndo(){return this.undoStack.length>0;}
 get canRedo(){return this.redoStack.length>0;}
 get undoLabel(){return this.undoStack[this.undoStack.length-1]?.label;}
 get redoLabel(){return this.redoStack[this.redoStack.length-1]?.label;}
 /** Change drawing settings that are not geometry (the drawing scale): not undoable. */
 setMeta(patch:Partial<Pick<CadDoc,'realPerUnit'>>){this.doc={...this.doc,...patch};this.emit(true);}
 /** Replace the whole drawing (open, revert); clears the history. */
 reset(doc:CadDoc){this.doc=doc;this.index();this.selection.clear();this.undoStack=[];this.redoStack=[];this.emit(true);}
 /** Record and apply an edit; returns the ids of the entities it added. */
 commit(label:string,change:Change):number[]{
  const put=[...(change.put??[])],added:number[]=[];
  for(const e of change.add??[]){const id=this.doc.nextId++;added.push(id);put.push({...e,id} as Ent);}
  const before:State={ents:new Map()},after:State={ents:new Map()};
  for(const e of put){before.ents.set(e.id,this.byId.get(e.id)??null);after.ents.set(e.id,e);}
  for(const id of change.del??[])if(this.byId.has(id)){before.ents.set(id,this.byId.get(id)!);after.ents.set(id,null);}
  if(change.layers){before.layers=this.doc.layers;after.layers=change.layers;}
  if(!after.ents.size&&!after.layers)return added;
  this.apply(after);this.undoStack.push({label,before,after});this.redoStack=[];
  if(this.undoStack.length>500)this.undoStack.shift();
  this.emit(true);return added;
 }
 undo(){const s=this.undoStack.pop();if(!s)return undefined;this.apply(s.before);this.redoStack.push(s);this.emit(true);return s.label;}
 redo(){const s=this.redoStack.pop();if(!s)return undefined;this.apply(s.after);this.undoStack.push(s);this.emit(true);return s.label;}
 private apply(state:State){
  const removed=new Set<number>(),replaced=new Map<number,Ent>(),added:Ent[]=[];
  for(const [id,e] of state.ents){if(!e)removed.add(id);else if(this.byId.has(id))replaced.set(id,e);else added.push(e);}
  let list=this.doc.entities.filter(e=>!removed.has(e.id)).map(e=>replaced.get(e.id)??e);
  if(added.length){
   const top=list.length?list[list.length-1].id:0;
   list=[...list,...added];
   // Draw order follows id: an entity restored by undo goes back to its place.
   if(added.some(e=>e.id<top))list.sort((a,b)=>a.id-b.id);
  }
  this.doc={...this.doc,entities:list,layers:state.layers??this.doc.layers};
  this.index();
  for(const id of [...this.selection])if(!this.byId.has(id))this.selection.delete(id);
 }
 // ---- selection ----
 select(ids:Iterable<number>,mode:'replace'|'add'|'remove'='replace'){
  if(mode==='replace')this.selection.clear();
  for(const id of ids){if(mode==='remove')this.selection.delete(id);else if(this.byId.has(id))this.selection.add(id);}
  this.emit(false);
 }
 clearSelection(){if(this.selection.size){this.selection.clear();this.emit(false);}}
 selected():Ent[]{return [...this.selection].map(id=>this.byId.get(id)).filter((e):e is Ent=>!!e);}
 layer(name:string){return this.doc.layers.find(l=>l.name===name);}
}

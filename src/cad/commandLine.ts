/**
 * The command line's helpers: AutoComplete over command names and aliases (as AutoCAD's), the input history recalled
 * with the arrow keys, and the clipboard commands behind Ctrl+Shift+C (copy with a base point) and Ctrl+Shift+V
 * (paste as a block).
 */
import {makeBlock} from './blocks';
import {commandNames,placeCmd} from './commands';
import {strip,type Command,type Env} from './cmdkit';
import {transformEnt,translation,type Ent,type NewEnt,type Pt} from './model';

export interface Suggestion{name:string;alias?:string}
/** Commands matching what has been typed: the alias typed exactly, then names and aliases that start with it, then names that contain it. */
export function suggestCommands(typed:string,max=8):Suggestion[]{
 const t=typed.trim().toUpperCase();if(!t||!/^[A-Z][A-Z0-9_]*$/.test(t))return [];
 const out:Suggestion[]=[],seen=new Set<string>(),put=(name:string,alias?:string)=>{if(seen.has(name)||out.length>=max)return;seen.add(name);out.push(alias&&alias!==name?{name,alias}:{name});};
 const names=[...new Set(Object.values(commandNames))].sort(),aliases=Object.keys(commandNames).sort((a,b)=>a.length-b.length||(a<b?-1:1));
 if(commandNames[t])put(commandNames[t],t);
 for(const n of names)if(n.startsWith(t))put(n);
 for(const a of aliases)if(a.startsWith(t))put(commandNames[a],a);
 for(const n of names)if(n.includes(t))put(n);
 return out;
}

/** Input history: entries newest last, without repeats in a row; recall walks back from the end. */
export class History{
 private items:string[]=[];private at=-1;
 constructor(private limit=200){}
 push(v:string){const s=v.trim();if(!s)return;if(this.items.at(-1)!==s)this.items.push(s);if(this.items.length>this.limit)this.items.shift();this.at=-1;}
 /** The previous (dir -1) or next (dir 1) entry, or undefined past the newest. */
 recall(dir:-1|1):string|undefined{
  if(!this.items.length)return undefined;
  if(this.at<0)this.at=dir<0?this.items.length-1:-1;
  else this.at=Math.max(0,this.at+dir);
  if(this.at<0||this.at>=this.items.length){this.at=-1;return undefined;}
  return this.items[this.at];
 }
 reset(){this.at=-1;}
 get list():readonly string[]{return this.items;}
}

/** COPYBASE: the selection to the clipboard with a picked base point. */
export function copyBaseCmd(env:Env,ents:Ent[],onCopy:(ents:NewEnt[],base:Pt)=>void):Command{
 const cmd:Command={name:'COPYBASE',done:false,prompt:()=>'COPYBASE Specify base point:',
  point(p){onCopy(ents.map(strip),p);env.log(`${ents.length} copied to the clipboard with a base point.`);cmd.done=true;},
  preview:()=>undefined};
 if(!ents.length){env.log('Select objects first.');cmd.done=true;}
 return cmd;
}
/** PASTEBLOCK: the clipboard as a new block (named A$C and a number, as AutoCAD names them) inserted at a point. */
export function pasteBlockCmd(env:Env,ents:NewEnt[],base:Pt):Command{
 const taken=new Set((env.store.doc.blocks??[]).map(b=>b.name));let i=1;while(taken.has(`A$C${i}`))i++;const name=`A$C${i}`;
 const inner=placeCmd(env,'PASTEBLOCK',ents,base);
 const cmd:Command={...inner,name:'PASTEBLOCK',prompt:()=>'PASTEBLOCK Specify insertion point:',
  point(p){
   const def=makeBlock(name,[0,0],ents.map((e,k)=>transformEnt({...e,id:k+1} as Ent,translation([-base[0],-base[1]]))));
   env.store.commit('Paste as block',{meta:{blocks:[...(env.store.doc.blocks??[]),def]},add:[{type:'insert',layer:env.layer(),name,at:p,scale:1,rotation:0}]});
   env.log(`Pasted as block ${name}.`);cmd.done=true;
  }};
 return cmd;
}

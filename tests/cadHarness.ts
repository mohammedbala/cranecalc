import {makeCommand,type Command,type Env} from '../src/cad/commands';
import {CadStore} from '../src/cad/store';
import {dist,formatLength,nearest,type CadDoc,type Ent,type NewEnt,type Pt} from '../src/cad/model';
import {expect} from 'vitest';

export const blank=():CadDoc=>({key:'S-09',title:'Test sheet',unit:'in',display:'US',realPerUnit:25.4,width:36,height:24,svgScale:1/72,
 layers:[{name:'0',color:7,ltype:'Continuous',weight:25,visible:true,locked:false},{name:'LOCKED',color:1,ltype:'Continuous',weight:25,visible:true,locked:true}],entities:[],nextId:1});
export const near=(a:Pt,b:Pt,tol=1e-9)=>expect(dist(a,b)).toBeLessThan(tol);
export type Step=Pt|string|null|{pick:Pt};
/** A store and a command runner: clicks (points), picks ({pick}: the nearest entity to the point), typed values (strings), Enter (null). */
export function setup(doc=blank()){
 const store=new CadStore(doc),log:string[]=[];let offset:number|undefined,win:{box:[number,number,number,number];crossing:boolean}|undefined;
 const env:Env={store,layer:()=>'0',textHeight:()=>.125,setTextHeight:()=>{},dimHeight:()=>.1,offsetDistance:()=>offset,setOffsetDistance:d=>{offset=d;},
  log:m=>{log.push(m);},neighbors:e=>store.doc.entities.filter(o=>o.id!==e.id),zoomExtents:()=>{},zoomWindow:()=>{},openPanel:()=>{},
  length:d=>formatLength(d*store.doc.realPerUnit,store.doc.display),vars:{},lastWindow:()=>win};
 const pickAt=(p:Pt)=>{let best:Ent|undefined,bd=Infinity;for(const e of store.doc.entities){const d=nearest(e,p,store.doc).d;if(d<bd-1e-12){bd=d;best=e;}}return bd<.05?best:undefined;};
 const run=(name:string,...steps:Step[]):Command=>{
  const c=makeCommand(name,env);if(!c)throw Error(`No command ${name}`);if(c.selectFirst)c.begin?.();
  for(const s of steps){if(c.done)break;
   if(s===null)c.enter?.();
   else if(typeof s==='string'){if(!c.text?.(s))throw Error(`${name} rejected "${s}" at "${c.prompt()}"`);}
   else if('pick' in s)c.pick?.(pickAt(s.pick),s.pick);
   else c.point?.(s);
  }
  return c;
 };
 const add=(...ents:NewEnt[])=>store.commit('test',{add:ents});
 return {store,env,run,log,add,setWindow:(box:[number,number,number,number],crossing=true)=>{win={box,crossing};}};
}

import {makeBlock,type BlockDef} from './blocks';
import {writeDxf} from './dxf';
import type {DxfImport} from './dxfImport';
import {compose,scaling,transformEnt,translation,type CadDoc,type CadLayer,type Ent,type NewEnt,type Pt} from './model';
import {editable,isKey,num,type Command,type Env} from './cmdkit';
import type {Meta} from './store';

/** Imported drawing units in this drawing's units (inches, millimeters, or sketch units at the drawing scale). */
export function importFactor(src:CadDoc,dst:CadDoc){
 const mm=(d:CadDoc)=>d.unit==='in'?25.4:d.unit==='mm'?1:d.realPerUnit;
 // A sheet (paper units) takes real-size geometry at its drawing scale: real millimeters over real per drawing unit.
 return mm(src)/(dst.unit==='unit'?dst.realPerUnit:mm(dst));
}
const uniqueName=(base:string,taken:Set<string>)=>{let n=base.toUpperCase().replace(/[^A-Z0-9_\-$ ]/g,'_').slice(0,50)||'IMPORT',i=1;const b=n;while(taken.has(n))n=`${b}-${++i}`;return n;};
/** What an import adds besides its objects: missing layers, styles and blocks (existing names keep the drawing's). */
function merged(env:Env,src:CadDoc):{layers?:CadLayer[];meta:Meta}{
 const d=env.store.doc,layers=[...d.layers];let added=false;
 for(const l of src.layers)if(!layers.some(x=>x.name===l.name)){layers.push(l);added=true;}
 const blocks=[...(d.blocks??[])];for(const b of src.blocks??[])if(!blocks.some(x=>x.name===b.name))blocks.push(b);
 const textStyles=[...(d.textStyles??[])];for(const t of src.textStyles??[])if(t.name!=='Standard'&&!textStyles.some(x=>x.name===t.name))textStyles.push(t);
 const dimStyles=[...(d.dimStyles??[])];for(const t of src.dimStyles??[])if(t.name!=='Standard'&&!dimStyles.some(x=>x.name===t.name))dimStyles.push(t);
 return {...(added?{layers}:{}),meta:{...(blocks.length!==(d.blocks?.length??0)?{blocks}:{}),...(textStyles.length!==(d.textStyles?.length??0)?{textStyles}:{}),...(dimStyles.length!==(d.dimStyles?.length??0)?{dimStyles}:{})}};
}
/** IMPORT: a DXF read in the browser, placed as a block (the default) or as objects at a point, at this drawing's units. */
export function importCmd(env:Env,src:DxfImport,fileName:string):Command{
 const d=src.doc,ents=d.entities.filter(e=>e.type!=='viewport'),k=importFactor(d,env.store.doc);
 let mode:'block'|'objects'='block',step:'mode'|'point'|'scale'='mode',scale=k;
 const strip=({id:_,...r}:Ent)=>r as NewEnt;
 const name=uniqueName(fileName.replace(/\.dxf$/i,''),new Set((env.store.doc.blocks??[]).map(b=>b.name)));
 const ghost=(p:Pt)=>ents.length>3000?undefined:ents.map(e=>strip(transformEnt(e,compose(translation(p),scaling([0,0],scale)))));
 const place=(p:Pt)=>{
  const m=merged(env,d);
  if(mode==='block'){
   const def:BlockDef=makeBlock(name,[0,0],ents,`Imported from ${fileName}`);
   env.store.commit(`Import ${fileName}`,{...(m.layers?{layers:m.layers}:{}),meta:{...m.meta,blocks:[...(m.meta.blocks??env.store.doc.blocks??[]),def]},add:[{type:'insert',layer:env.layer(),name,at:p,scale,rotation:0}]});
   env.log(`${ents.length} objects imported as block ${name}.`);
  }else{
   const map=compose(translation(p),scaling([0,0],scale));
   env.store.commit(`Import ${fileName}`,{...(m.layers?{layers:m.layers}:{}),meta:m.meta,add:ents.map(e=>strip(transformEnt(e,map)))});
   env.log(`${ents.length} objects imported.`);
  }
  const skipped=Object.entries(src.skipped);if(skipped.length)env.log(`Skipped: ${skipped.map(([t,n])=>`${n} ${t}`).join(', ')}.`);
  for(const n of src.notes.slice(0,3))env.log(n);
  cmd.done=true;
 };
 const cmd:Command={name:'IMPORT',done:false,
  prompt:()=>step==='mode'?`IMPORT ${fileName}: ${ents.length} objects. Insert as [Block/Objects] <Block>:`:step==='scale'?`IMPORT Specify scale factor <${Number(scale.toPrecision(6))}>:`:`IMPORT Specify insertion point or [Scale] (scale ${Number(scale.toPrecision(6))}):`,
  text(t){
   if(step==='mode'){if(isKey(t,'Block')){mode='block';step='point';return true;}if(isKey(t,'Objects')){mode='objects';step='point';return true;}return false;}
   if(step==='point'&&isKey(t,'Scale')){step='scale';return true;}
   if(step==='scale'){const v=num(t);if(v===undefined||v<=0)return false;scale=v;step='point';return true;}
   return false;
  },
  enter(){if(step==='mode'){step='point';return;}if(step==='scale'){step='point';return;}cmd.done=true;},
  point(p){if(step==='point')place(p);},
  preview:q=>step==='point'?{ents:ghost(q)}:undefined};
 if(!ents.length){env.log(`${fileName} holds nothing this editor reads.`);cmd.done=true;}
 return cmd;
}
/** WBLOCK: the selection (and the blocks it uses) as a DXF file of its own. */
function wblockCmd(env:Env):Command{
 const cmd:Command={name:'WBLOCK',done:false,selectFirst:true,prompt:()=>'WBLOCK',
  begin(){
   const list=editable(env);if(!list.length){cmd.done=true;return;}
   const d=env.store.doc,names=new Set<string>();const walk=(es:Ent[])=>{for(const e of es)if(e.type==='insert'&&!names.has(e.name)){names.add(e.name);walk(d.blocks?.find(b=>b.name===e.name)?.entities??[]);}};walk(list);
   const out:CadDoc={...d,entities:list,model:undefined,groups:undefined,blocks:d.blocks?.filter(b=>names.has(b.name))};
   env.download?.(`${d.key}-wblock.dxf`,writeDxf(out,{k:d.unit==='unit'?d.realPerUnit/(d.display==='US'?25.4:1):1}),'application/dxf');
   env.log(`${list.length} objects written to ${d.key}-wblock.dxf.`);cmd.done=true;
  }};
 return cmd;
}
export const interchangeNames:Record<string,string>={IMPORT:'IMPORT',DXFIN:'IMPORT',IMP:'IMPORT',OPEN:'IMPORT',W:'WBLOCK',WBLOCK:'WBLOCK',DXFOUT:'DXFOUT',EXPORT:'DXFOUT'};
export const interchangeCommands:Record<string,(env:Env)=>Command>={WBLOCK:wblockCmd};

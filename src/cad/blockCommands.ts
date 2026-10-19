import {attdefsOf,children,makeBlock,nests,resolveXref,type BlockDef} from './blocks';
import {libraryBlock} from './blockLibrary';
import {unitScale,type CadLayer,type Ent,type InsertEnt,type NewEnt,type Pt} from './model';
import {angleText,editable,isKey,num,type Command,type Env} from './cmdkit';

/** A block by name: the drawing's own, else the library's. */
export const findBlock=(env:Env,name:string):{def:BlockDef;fromLibrary:boolean}|undefined=>{
 const own=env.store.doc.blocks?.find(b=>b.name.toUpperCase()===name.toUpperCase());if(own)return {def:own,fromLibrary:false};
 const lib=libraryBlock(name.toUpperCase());return lib?{def:lib,fromLibrary:true}:undefined;
};
/** The scale that draws a block defined in inches at its size in this drawing's units. */
export const unitFactor=(env:Env,def:BlockDef)=>unitScale(env.store.doc.unit)/unitScale(def.units??env.store.doc.unit);
const strip=(e:Ent):NewEnt=>{const {id:_,src:__,...r}=e;return r as NewEnt;};

function blockCmd(env:Env):Command{
 let list:Ent[]=[],step:'name'|'redefine'|'base'='name',name='';
 const cmd:Command={name:'BLOCK',done:false,selectFirst:true,
  begin(){list=editable(env).filter(e=>e.type!=='xref');if(!list.length){env.log('Select the objects for the block.');cmd.done=true;}},
  prompt:()=>step==='name'?'BLOCK Enter block name:':step==='redefine'?`BLOCK Block ${name} exists. Redefine it? [Yes/No] <N>:`:`BLOCK Specify insertion base point for ${name}:`,
  freeText:()=>step==='name',
  text(t){
   if(step==='name'){
    const v=t.trim().toUpperCase();if(!v){cmd.done=true;return true;}
    if(!/^[A-Z0-9_\-$ ]{1,60}$/.test(v)){env.log('Block names take letters, digits, spaces, -, _ and $.');return true;}
    if(list.some(e=>e.type==='insert'&&nests(env.store.doc.blocks??[],e.name,v))){env.log(`A block cannot contain itself: the selection holds ${v}.`);return true;}
    name=v;step=env.store.doc.blocks?.some(b=>b.name===v)?'redefine':'base';return true;
   }
   if(step==='redefine'){if(isKey(t,'Yes')){step='base';return true;}if(isKey(t,'No')){step='name';return true;}}
   return false;
  },
  enter(){if(step==='redefine'){step='name';return;}cmd.done=true;},
  point(p){
   if(step!=='base')return;
   const def=makeBlock(name,p,list),others=(env.store.doc.blocks??[]).filter(b=>b.name!==name);
   const attribs=Object.fromEntries(attdefsOf(def).map(a=>[a.tag,a.value]));
   env.store.commit('Block',{meta:{blocks:[...others,def]},del:list.map(e=>e.id),add:[{type:'insert',layer:env.layer(),name,at:p,scale:1,rotation:0,...(Object.keys(attribs).length?{attribs}:{})}]});
   env.log(`Block ${name} defined from ${list.length} objects.`);cmd.done=true;
  }};
 return cmd;
}
/** INSERT, or placing a named block straight from the palette. */
export function insertCmd(env:Env,preset?:string):Command{
 type Step='name'|'point'|'scale'|'rotation'|'attr';
 let step:Step='name',found:ReturnType<typeof findBlock>,scale=1,rotation=0,at:Pt|undefined,ai=0;const values:Record<string,string>={};
 const defs=()=>found!.def,ads=()=>attdefsOf(found?.def);
 const choose=(n:string)=>{found=findBlock(env,n);if(!found){env.log(`No block named ${n} (the library has GRID-BUBBLE, SECTION-MARK, WELD-FILLET, TITLE-ARCHD ...).`);return false;}scale=unitFactor(env,found.def);step='point';env.vars.INSNAME=found.def.name;return true;};
 const ent=(p:Pt):Omit<InsertEnt,'id'>=>({type:'insert',layer:env.layer(),name:defs().name,at:p,scale,rotation,...(Object.keys(values).length?{attribs:{...values}}:{})});
 const ghost=(p:Pt)=>children(ent(p),{blocks:[defs()]}).map(strip);
 const finish=()=>{const e=ent(at!);env.store.commit(`Insert ${e.name}`,found!.fromLibrary?{meta:{blocks:[...(env.store.doc.blocks??[]),defs()]},add:[e]}:{add:[e]});cmd.done=true;};
 const nextAttr=()=>{if(ai<ads().length){step='attr';return;}finish();};
 const cmd:Command={name:'INSERT',done:false,
  prompt:()=>({name:`INSERT Enter block name${env.vars.INSNAME?` <${env.vars.INSNAME}>`:''}:`,point:`INSERT Specify insertion point for ${found?.def.name} or [Scale/Rotate]:`,scale:`INSERT Specify scale factor <${Number(scale.toFixed(4))}>:`,
   rotation:`INSERT Specify rotation angle <${rotation}>:`,attr:`INSERT ${ads()[ai]?.prompt||ads()[ai]?.tag} <${ads()[ai]?.value}>:`} as Record<Step,string>)[step],
  freeText:()=>step==='name'||step==='attr',
  text(t){
   if(step==='name'){const v=t.trim()||String(env.vars.INSNAME??'');if(!v){cmd.done=true;return true;}choose(v);return true;}
   if(step==='point'){if(isKey(t,'Scale')){step='scale';return true;}if(isKey(t,'Rotate')){step='rotation';return true;}return false;}
   if(step==='scale'){const v=num(t);if(v===undefined||v===0)return false;scale=v;step='point';return true;}
   if(step==='rotation'){const v=angleText(t);if(v===undefined)return false;rotation=v;step='point';return true;}
   if(step==='attr'){const a=ads()[ai];values[a.tag]=t.trim()?t:a.value;ai++;nextAttr();return true;}
   return false;
  },
  point(p){if(step==='point'){at=p;nextAttr();}},
  enter(){if(step==='scale'||step==='rotation'){step='point';return;}cmd.done=true;},
  preview:q=>step==='point'||step==='scale'||step==='rotation'?{ents:ghost(q)}:undefined};
 if(preset)choose(preset);
 return cmd;
}
function attdefCmd(env:Env):Command{
 type Step='tag'|'prompt'|'value'|'point';
 let step:Step='tag',tag='',prompt='',value='',invisible=false;
 const h=env.textHeight();
 const ent=(at:Pt):NewEnt=>({type:'attdef',layer:env.layer(),tag,prompt:prompt||tag,value,at,height:h,angle:0,align:0,...(invisible?{invisible:true}:{})});
 const cmd:Command={name:'ATTDEF',done:false,
  prompt:()=>({tag:`ATTDEF Enter attribute tag${invisible?' (invisible)':''} or [Invisible]:`,prompt:'ATTDEF Enter attribute prompt:',value:'ATTDEF Enter default value:',point:'ATTDEF Specify start point:'} as Record<Step,string>)[step],
  freeText:()=>step!=='point',
  text(t){
   if(step==='tag'){const v=t.trim().toUpperCase();if(!v){cmd.done=true;return true;}if(v==='I'||v==='INVISIBLE'){invisible=!invisible;return true;}if(/\s/.test(v)){env.log('Attribute tags have no spaces.');return true;}tag=v;step='prompt';return true;}
   if(step==='prompt'){prompt=t.trim();step='value';return true;}
   if(step==='value'){value=t;step='point';return true;}
   return false;
  },
  point(p){if(step!=='point')return;env.store.commit('Attribute definition',{add:[ent(p)]});cmd.done=true;},
  preview:q=>step==='point'?{ents:[{type:'text',layer:env.layer(),at:q,height:h,value:tag,angle:0,align:0,bold:false}]}:undefined};
 return cmd;
}
function xattachCmd(env:Env):Command{
 let step:'name'|'point'|'scale'='name',name='',scale=1,at:Pt|undefined;
 const ent=(p:Pt):NewEnt=>({type:'xref',layer:env.layer(),name,at:p,scale,rotation:0});
 const cmd:Command={name:'XATTACH',done:false,
  prompt:()=>step==='name'?'XATTACH Enter the drawing to reference (a sheet or sketch number, S-01, SK-02 ...):':step==='point'?`XATTACH Specify insertion point for ${name}:`:`XATTACH Specify scale factor <${scale}>:`,
  freeText:()=>step==='name',
  text(t){
   if(step==='name'){const v=t.trim().toUpperCase();if(!v){cmd.done=true;return true;}if(v===env.store.doc.key){env.log('A drawing cannot reference itself.');return true;}if(!resolveXref(v)){env.log(`No drawing ${v} in this project.`);return true;}name=v;step='point';return true;}
   if(step==='scale'){const x=num(t);if(x===undefined||x<=0)return false;scale=x;env.store.commit('Attach reference',{add:[ent(at!)]});cmd.done=true;return true;}
   return false;
  },
  point(p){if(step==='point'){at=p;step='scale';}},
  enter(){if(step==='scale'){env.store.commit('Attach reference',{add:[ent(at!)]});cmd.done=true;return;}cmd.done=true;},
  preview:q=>step==='point'?{ents:children({type:'xref',layer:env.layer(),name,at:q,scale,rotation:0},{}).slice(0,3000).map(strip)}:undefined};
 return cmd;
}
/** XBIND: references become blocks of the drawing (with their layers), so they plot and export everywhere. */
function xbindCmd(env:Env):Command{
 const cmd:Command={name:'XBIND',done:false,selectFirst:true,prompt:()=>'XBIND',
  begin(){
   const xs=editable(env).filter((e):e is Extract<Ent,{type:'xref'}>=>e.type==='xref');
   if(!xs.length){env.log('Select external references to bind.');cmd.done=true;return;}
   const blocks=[...(env.store.doc.blocks??[])],layers:CadLayer[]=[...env.store.doc.layers],put:Ent[]=[];
   for(const x of xs){
    const doc=resolveXref(x.name);if(!doc){env.log(`${x.name} is not available.`);continue;}
    const bname=`XREF-${x.name}`,rename=(l:string)=>`${x.name}$${l}`;
    for(const l of doc.layers)if(!layers.some(m=>m.name===rename(l.name)))layers.push({...l,name:rename(l.name)});
    if(!blocks.some(b=>b.name===bname))blocks.push(makeBlock(bname,[0,0],doc.entities.filter(e=>e.type!=='xref').map(e=>({...e,layer:rename(e.layer)}))));
    put.push({id:x.id,type:'insert',layer:x.layer,name:bname,at:x.at,scale:x.scale,rotation:x.rotation});
   }
   if(put.length){env.store.commit('Bind references',{meta:{blocks},layers,put});env.log(`${put.length} reference${put.length>1?'s':''} bound as blocks.`);}
   cmd.done=true;
  }};
 return cmd;
}

function beditCmd(env:Env):Command{
 const sel=env.store.selected().find((e):e is InsertEnt=>e.type==='insert');
 const cmd:Command={name:'BEDIT',done:false,prompt:()=>'BEDIT Enter the block to edit:',freeText:()=>true,
  text(t){const v=t.trim();if(!v){cmd.done=true;return true;}const f=findBlock(env,v);if(!f){env.log(`No block named ${v}.`);return true;}env.editBlock?.(f.def.name);cmd.done=true;return true;}};
 if(env.blockEditing?.()){env.log('Close the block editor first (BCLOSE).');cmd.done=true;}
 else if(sel){env.editBlock?.(sel.name);cmd.done=true;}
 return cmd;
}
function bcloseCmd(env:Env):Command{
 const cmd:Command={name:'BCLOSE',done:false,prompt:()=>`BCLOSE Save the changes to ${env.blockEditing?.()}? [Yes/No] <Y>:`,
  text(t){if(isKey(t,'Yes')){env.closeBlock?.(true);cmd.done=true;return true;}if(isKey(t,'No')){env.closeBlock?.(false);cmd.done=true;return true;}return false;},
  enter(){env.closeBlock?.(true);cmd.done=true;}};
 if(!env.blockEditing?.()){env.log('No block is open for editing.');cmd.done=true;}
 return cmd;
}
function atteditCmd(env:Env):Command{
 const cmd:Command={name:'ATTEDIT',done:false,prompt:()=>'ATTEDIT Select a block reference:',wantsPick:()=>true,
  pick(e){if(!e)return;if(e.type!=='insert'||!attdefsOf(env.store.doc.blocks?.find(b=>b.name===e.name)).length){env.log('That block has no attributes.');return;}env.editAttributes?.(e.id);cmd.done=true;}};
 return cmd;
}

export const blockNames:Record<string,string>={
 B:'BLOCK',BLOCK:'BLOCK',I:'INSERT',INSERT:'INSERT',ATT:'ATTDEF',ATTDEF:'ATTDEF',XA:'XATTACH',XATTACH:'XATTACH',XBIND:'XBIND',XB:'XBIND',
 BE:'BEDIT',BEDIT:'BEDIT',BCLOSE:'BCLOSE',ATE:'ATTEDIT',ATTEDIT:'ATTEDIT',EATTEDIT:'ATTEDIT',
};
export const blockCommands:Record<string,(env:Env)=>Command>={BLOCK:blockCmd,INSERT:env=>insertCmd(env),ATTDEF:attdefCmd,XATTACH:xattachCmd,XBIND:xbindCmd,BEDIT:beditCmd,BCLOSE:bcloseCmd,ATTEDIT:atteditCmd};

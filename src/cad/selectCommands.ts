import {expandGroups,selectSimilar,unnamedGroup} from './select';
import {editable,type Command,type Env} from './cmdkit';

function groupCmd(env:Env):Command{
 let ids:number[]=[];
 const make=(name:string)=>{
  const groups=env.store.doc.groups??[];if(ids.length<2){cmd.done=true;return false;}
  if(groups.some(g=>g.name.toUpperCase()===name.toUpperCase())){env.log(`A group named ${name} exists already.`);return false;}
  env.store.commit('Group',{groups:[...groups,{name,ids}]});env.log(`Group ${name} made of ${ids.length} objects.`);cmd.done=true;return true;
 };
 const cmd:Command={name:'GROUP',done:false,selectFirst:true,
  begin(){ids=editable(env).map(e=>e.id);if(ids.length<2){env.log('Select two or more objects to group.');cmd.done=true;}},
  prompt:()=>`GROUP Enter a group name or [*Unnamed] <${unnamedGroup(env.store.doc)}>:`,
  freeText:()=>true,
  text(s){const t=s.trim();if(!t||t==='*'||t.toUpperCase()==='*UNNAMED'||t.toUpperCase()==='U'){make(unnamedGroup(env.store.doc));return true;}if(!/^[\w\- ]{1,60}$/.test(t)){env.log('Group names take letters, digits, spaces, - and _.');return true;}make(t.toUpperCase());return true;}};
 return cmd;
}
function ungroupCmd(env:Env):Command{
 const cmd:Command={name:'UNGROUP',done:false,selectFirst:true,prompt:()=>'UNGROUP',
  begin(){const ids=new Set(env.store.selected().map(e=>e.id)),groups=env.store.doc.groups??[],keep=groups.filter(g=>!g.ids.some(id=>ids.has(id)));
   if(keep.length===groups.length)env.log('The selection is in no group.');else{env.store.commit('Ungroup',{groups:keep});env.log(`${groups.length-keep.length} group${groups.length-keep.length>1?'s':''} removed.`);}cmd.done=true;}};
 return cmd;
}
function similarCmd(env:Env):Command{
 const cmd:Command={name:'SELECTSIMILAR',done:false,selectFirst:true,prompt:()=>'SELECTSIMILAR',
  begin(){const visible=env.store.doc.entities.filter(e=>{const l=env.store.layer(e.layer);return !!l&&l.visible&&!l.locked;});const ids=selectSimilar(visible,env.store.selected());
   env.store.select(expandGroups(env.store.doc,ids));env.log(`${ids.length} similar objects selected.`);cmd.keepSelection=true;cmd.done=true;}};
 return cmd;
}
export const selectNames:Record<string,string>={G:'GROUP',GROUP:'GROUP',UNGROUP:'UNGROUP',SELECTSIMILAR:'SELECTSIMILAR'};
export const selectCommands:Record<string,(env:Env)=>Command>={GROUP:groupCmd,UNGROUP:ungroupCmd,SELECTSIMILAR:similarCmd};

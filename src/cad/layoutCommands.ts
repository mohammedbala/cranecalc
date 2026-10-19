import {modelExtents,scaleLabel,snapScale,emptyModel} from './layout';
import {unitScale,type CadLayer,type Ent,type NewEnt,type Pt} from './model';
import {isKey,type Command,type Env} from './cmdkit';

const VPLAYER:CadLayer={name:'VIEWPORTS',color:9,ltype:'Continuous',weight:13,visible:true,locked:false};
/** A viewport filling the rectangle, showing the model's extents at the largest standard scale that fits. */
export function fitViewport(env:Env,a:Pt,b:Pt):NewEnt{
 const doc=env.store.doc,m=doc.model??emptyModel(doc),w=Math.abs(b[0]-a[0]),h=Math.abs(b[1]-a[1]),at:Pt=[(a[0]+b[0])/2,(a[1]+b[1])/2];
 // Model units are inches or millimeters; layout units are paper inches, millimeters or sketch units.
 const paperPerModel=doc.unit==='unit'?unitScale('unit')/(doc.display==='US'?1:25.4):1;
 const ext=modelExtents(m.entities,{...doc,unit:doc.display==='US'?'in':'mm',realPerUnit:doc.display==='US'?25.4:1});
 if(!ext)return {type:'viewport',layer:VPLAYER.name,at,width:w,height:h,view:[0,0],scale:m.annoScale*paperPerModel};
 const fit=Math.min(w/Math.max(1e-9,ext[2]-ext[0]),h/Math.max(1e-9,ext[3]-ext[1]))*.95;
 return {type:'viewport',layer:VPLAYER.name,at,width:w,height:h,view:[(ext[0]+ext[2])/2,(ext[1]+ext[3])/2],scale:snapScale(doc,fit/paperPerModel)*paperPerModel};
}
function mviewCmd(env:Env):Command{
 let a:Pt|undefined;
 const make=(p:Pt,q:Pt)=>{
  if(Math.abs(p[0]-q[0])<1e-9||Math.abs(p[1]-q[1])<1e-9)return;
  const v=fitViewport(env,p,q),layers=env.store.doc.layers.some(l=>l.name===VPLAYER.name)?undefined:[...env.store.doc.layers,VPLAYER];
  env.store.commit('Viewport',{add:[v],...(layers?{layers}:{}),...(env.store.doc.model?{}:{meta:{model:emptyModel(env.store.doc)}})});
  if(v.type==='viewport')env.log(`Viewport at ${scaleLabel(env.store.doc,v.scale)}: double-click it to work in model space; Properties sets its scale.`);
  cmd.done=true;
 };
 const cmd:Command={name:'MVIEW',done:false,
  prompt:()=>a?'MVIEW Specify opposite corner:':'MVIEW Specify corner of viewport or [Fit]:',base:()=>a,
  point(p){if(!a){a=p;return;}make(a,p);},
  text(t){if(!a&&isKey(t,'Fit')){const d=env.store.doc,m=.5*unitScale(d.unit);make([m,m],[d.width-m,d.height-m]);return true;}return false;},
  preview:q=>a?{ents:[{type:'poly',layer:env.layer(),closed:true,points:[a,[q[0],a[1]],q,[a[0],q[1]]]}]}:undefined};
 if(env.store.doc.space==='model'){env.log('MVIEW works on the layout: switch to the layout tab.');cmd.done=true;}
 return cmd;
}
/** A scale as typed: 1:50, 1/48, 48 (one to 48), or 1/4"=1'-0" style labels. */
export function parseScale(raw:string,display:'US'|'SI'):number|undefined{
 const t=raw.trim().replace(/\s+/g,'');
 const ratio=/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(t);if(ratio&&+ratio[2]>0)return +ratio[1]/ +ratio[2];
 const frac=/^1\/(\d+(?:\.\d+)?)$/.exec(t);if(frac&&+frac[1]>0)return 1/ +frac[1];
 const arch=/^(\d+(?:\.\d+)?|\d+\/\d+|\d+-\d+\/\d+)"?=1'(?:-0")?$/.exec(t);
 if(arch){const p=arch[1].includes('-')?(()=>{const [w,f]=arch[1].split('-');const [n,d]=f.split('/');return +w+ +n/ +d;})():arch[1].includes('/')?(()=>{const [n,d]=arch[1].split('/');return +n/ +d;})():+arch[1];return p/12;}
 const n=Number(t);if(Number.isFinite(n)&&n>0)return n>=1?1/n:n;
 void display;return undefined;
}
function annoscaleCmd(env:Env):Command{
 const cmd:Command={name:'ANNOSCALE',done:false,
  prompt:()=>`ANNOSCALE Enter the annotation scale (1:50, 1/48, 1/4"=1'-0") <${scaleLabel(env.store.doc,env.store.doc.annoScale??1)}>:`,
  text(t){
   const s=parseScale(t,env.store.doc.display);if(!s)return false;
   const old=env.store.doc.annoScale??s,k=old/s;
   const put=env.store.doc.entities.filter(e=>e.annotative).map(e=>scaleAnno(e,k));
   env.store.commit('Annotation scale',{put,meta:{annoScale:s,ltscale:1/s}});env.log(`Annotation scale ${scaleLabel(env.store.doc,s)}; ${put.length} annotative objects resized.`);cmd.done=true;return true;
  },
  enter(){cmd.done=true;}};
 if(env.store.doc.space!=='model'){env.log('ANNOSCALE sets the scale model space is drafted at: switch to the Model tab.');cmd.done=true;}
 return cmd;
}
const scaleAnno=(e:Ent,k:number):Ent=>e.type==='text'||e.type==='attdef'||e.type==='leader'||e.type==='dim'?{...e,height:e.height*k}:e.type==='mtext'?{...e,height:e.height*k,width:e.width*k}:e;

export const layoutNames:Record<string,string>={MV:'MVIEW',MVIEW:'MVIEW',ANNOSCALE:'ANNOSCALE',MS:'MSPACE',MSPACE:'MSPACE',MODEL:'MSPACE',PS:'PSPACE',PSPACE:'PSPACE',LAYOUT:'PSPACE',PLOT:'PLOT',PRINT:'PLOT',PAGESETUP:'PLOT'};
export const layoutCommands:Record<string,(env:Env)=>Command>={MVIEW:mviewCmd,ANNOSCALE:annoscaleCmd};

import {
 add,angleOf,dist,explodeEnt,extendEnt,mirroring,offsetEnt,polar,rotation,scaling,sub,sweep,transformEnt,translation,trimEnt,
 type CadDoc,type Ent,type NewEnt,type Pt,
} from './model';
import {editable,fmtAngle,ghosts,key,num,strip,type Command,type Env} from './cmdkit';
import {drawCommands,drawNames} from './drawCommands';
import {modifyCommands,modifyNames} from './modifyCommands';
export type {Command,Env,Preview} from './cmdkit';

// ---- draw --------------------------------------------------------------------------------------------------------
function lineCmd(env:Env):Command{
 const pts:Pt[]=[];let made=0;
 const c:Command={name:'LINE',done:false,
  prompt:()=>!pts.length?'LINE Specify first point:':`LINE Specify next point or [Undo${made>=2?'/Close':''}]:`,
  base:()=>pts[pts.length-1],
  point(p){if(pts.length){env.store.commit('Line',{add:[{type:'line',layer:env.layer(),a:pts[pts.length-1],b:p}]});made++;}pts.push(p);},
  text(s){const k=key(s);
   if(k==='U'&&pts.length){if(made){env.store.undo();made--;}pts.pop();return true;}
   if(k==='C'&&made>=2){env.store.commit('Line',{add:[{type:'line',layer:env.layer(),a:pts[pts.length-1],b:pts[0]}]});c.done=true;return true;}
   return false;},
  enter(){c.done=true;},
  preview:cur=>pts.length?{ents:[{type:'line',layer:env.layer(),a:pts[pts.length-1],b:cur}],tip:`${env.length(dist(pts[pts.length-1],cur))} < ${fmtAngle(angleOf(pts[pts.length-1],cur))}`}:undefined};
 return c;
}
function plineCmd(env:Env):Command{
 const pts:Pt[]=[];
 const make=(closed:boolean)=>{if(pts.length>=(closed?3:2))env.store.commit('Polyline',{add:[{type:'poly',layer:env.layer(),points:[...pts],closed}]});c.done=true;};
 const c:Command={name:'PLINE',done:false,
  prompt:()=>!pts.length?'PLINE Specify start point:':`PLINE Specify next point or [Undo${pts.length>=3?'/Close':''}]:`,
  base:()=>pts[pts.length-1],point(p){pts.push(p);},
  text(s){const k=key(s);if(k==='U'&&pts.length){pts.pop();return true;}if(k==='C'&&pts.length>=3){make(true);return true;}return false;},
  enter(){make(false);},
  preview:cur=>pts.length?{ents:[{type:'poly',layer:env.layer(),points:[...pts,cur],closed:false}],tip:`${env.length(dist(pts[pts.length-1],cur))} < ${fmtAngle(angleOf(pts[pts.length-1],cur))}`}:undefined};
 return c;
}
function rectCmd(env:Env):Command{
 let a:Pt|undefined;
 const box=(p:Pt,q:Pt):Pt[]=>[p,[q[0],p[1]],q,[p[0],q[1]]];
 const c:Command={name:'RECTANG',done:false,
  prompt:()=>a?'RECTANG Specify other corner point:':'RECTANG Specify first corner point:',base:()=>a,
  point(p){if(!a){a=p;return;}env.store.commit('Rectangle',{add:[{type:'poly',layer:env.layer(),points:box(a,p),closed:true}]});c.done=true;},
  preview:cur=>a?{ents:[{type:'poly',layer:env.layer(),points:box(a,cur),closed:true}],tip:`${env.length(Math.abs(cur[0]-a[0]))} × ${env.length(Math.abs(cur[1]-a[1]))}`}:undefined};
 return c;
}
function circleCmd(env:Env):Command{
 let center:Pt|undefined,diameter=false;
 const make=(r:number)=>{if(r>0)env.store.commit('Circle',{add:[{type:'circle',layer:env.layer(),center:center!,radius:r}]});c.done=true;};
 const c:Command={name:'CIRCLE',done:false,
  prompt:()=>!center?'CIRCLE Specify center point:':diameter?'CIRCLE Specify diameter:':'CIRCLE Specify radius or [Diameter]:',base:()=>center,
  point(p){if(!center)center=p;else make(dist(center,p)/(diameter?2:1));},
  text(s){if(!center)return false;if(key(s)==='D'){diameter=true;return true;}const v=num(s);if(v===undefined)return false;make(diameter?v/2:v);return true;},
  preview:cur=>center?{ents:[{type:'circle',layer:env.layer(),center,radius:Math.max(1e-9,dist(center,cur)/(diameter?2:1))}],rubber:[center,cur],tip:`${diameter?'Ø':'R'} ${env.length(dist(center,cur))}`}:undefined};
 return c;
}
export {arcThrough} from './drawCommands';
function textCmd(env:Env):Command{
 let at:Pt|undefined,step:'at'|'height'|'angle'|'text'='at',height=env.textHeight(),angle=0;
 const c:Command={name:'TEXT',done:false,
  prompt:()=>step==='at'?'TEXT Specify start point of text:':step==='height'?`TEXT Specify height <${Number(height.toFixed(4))}>:`:step==='angle'?`TEXT Specify rotation angle of text <${angle}>:`:'TEXT Enter text (Enter on an empty line ends):',
  base:()=>at,freeText:()=>step==='text',
  point(p){if(step==='at'){at=p;step='height';}else if(step==='height'){height=dist(at!,p);env.setTextHeight(height);step='angle';}else if(step==='angle'){angle=angleOf(at!,p);step='text';}},
  text(s){
   if(step==='height'){const v=num(s);if(v===undefined||v<=0)return false;height=v;env.setTextHeight(v);step='angle';return true;}
   if(step==='angle'){const v=Number(s);if(!Number.isFinite(v))return false;angle=v;step='text';return true;}
   if(step==='text'){if(!s.trim()){c.done=true;return true;}env.store.commit('Text',{add:[{type:'text',layer:env.layer(),at:at!,height,value:s,angle,align:0,bold:false}]});at=add(at!,polar([0,0],height*1.65,angle-90));return true;}
   return false;},
  enter(){if(step==='height')step='angle';else if(step==='angle')step='text';else c.done=true;},
  preview:cur=>step==='at'?undefined:step==='height'?{rubber:[at!,cur],tip:env.length(dist(at!,cur))}:step==='angle'?{rubber:[at!,cur],tip:fmtAngle(angleOf(at!,cur))}:undefined};
 return c;
}
function dimCmd(env:Env,aligned:boolean):Command{
 const pts:Pt[]=[];let force:'horizontal'|'vertical'|undefined;
 const kind=(cur:Pt):'aligned'|'horizontal'|'vertical'=>{
  if(aligned)return 'aligned';if(force)return force;
  const [a,b]=pts,x0=Math.min(a[0],b[0]),x1=Math.max(a[0],b[0]),y0=Math.min(a[1],b[1]),y1=Math.max(a[1],b[1]);
  if(cur[0]>=x0&&cur[0]<=x1)return 'horizontal';if(cur[1]>=y0&&cur[1]<=y1)return 'vertical';
  const dx=Math.min(Math.abs(cur[0]-x0),Math.abs(cur[0]-x1)),dy=Math.min(Math.abs(cur[1]-y0),Math.abs(cur[1]-y1));
  return dy>=dx?'horizontal':'vertical';
 };
 const dim=(cur:Pt):NewEnt=>({type:'dim',layer:env.layer(),kind:kind(cur),a:pts[0],b:pts[1],at:cur,height:env.dimHeight()});
 const name=aligned?'DIMALIGNED':'DIMLINEAR';
 const c:Command={name,done:false,
  prompt:()=>pts.length===0?`${name} Specify first extension line origin:`:pts.length===1?`${name} Specify second extension line origin:`:`${name} Specify dimension line location${aligned?'':' or [Horizontal/Vertical]'}:`,
  base:()=>pts[pts.length-1],
  point(p){if(pts.length<2){pts.push(p);return;}env.store.commit('Dimension',{add:[dim(p)]});c.done=true;},
  text(s){const k=key(s);if(pts.length===2&&!aligned&&(k==='H'||k==='V')){force=k==='H'?'horizontal':'vertical';return true;}return false;},
  preview:cur=>pts.length===2?{ents:[dim(cur)]}:pts.length===1?{rubber:[pts[0],cur],tip:env.length(dist(pts[0],cur))}:undefined};
 return c;
}

// ---- modify ------------------------------------------------------------------------------------------------------
function moveCopyCmd(env:Env,copy:boolean):Command{
 let list:Ent[]=[],base:Pt|undefined;
 const name=copy?'COPY':'MOVE';
 const c:Command={name,done:false,selectFirst:true,
  begin(){list=editable(env);if(!list.length){env.log('Nothing to '+name.toLowerCase()+' (locked layers are skipped).');c.done=true;}},
  prompt:()=>!base?`${name} Specify base point:`:`${name} Specify second point${copy?' or <exit>':''}:`,
  base:()=>base,
  point(p){
   if(!base){base=p;return;}
   const m=translation(sub(p,base));
   if(copy){env.store.commit('Copy',{add:list.map(e=>strip(transformEnt(e,m)))});}
   else{env.store.commit('Move',{put:list.map(e=>transformEnt(e,m))});c.done=true;}
  },
  enter(){c.done=true;},
  preview:cur=>base?{ents:ghosts(list,translation(sub(cur,base))),rubber:[base,cur],tip:`${env.length(dist(base,cur))} < ${fmtAngle(angleOf(base,cur))}`}:undefined};
 return c;
}
function rotateCmd(env:Env):Command{
 let list:Ent[]=[],base:Pt|undefined;
 const go=(deg:number)=>{env.store.commit('Rotate',{put:list.map(e=>transformEnt(e,rotation(base!,deg)))});c.done=true;};
 const c:Command={name:'ROTATE',done:false,selectFirst:true,
  begin(){list=editable(env);if(!list.length)c.done=true;},
  prompt:()=>!base?'ROTATE Specify base point:':'ROTATE Specify rotation angle:',base:()=>base,
  point(p){if(!base)base=p;else go(angleOf(base,p));},
  text(s){if(!base)return false;const v=Number(s);if(!Number.isFinite(v))return false;go(v);return true;},
  preview:cur=>base?{ents:ghosts(list,rotation(base,angleOf(base,cur))),rubber:[base,cur],tip:fmtAngle(angleOf(base,cur))}:undefined};
 return c;
}
function scaleCmd(env:Env):Command{
 let list:Ent[]=[],base:Pt|undefined;
 const go=(k:number)=>{if(k>0)env.store.commit('Scale',{put:list.map(e=>transformEnt(e,scaling(base!,k)))});c.done=true;};
 const c:Command={name:'SCALE',done:false,selectFirst:true,
  begin(){list=editable(env);if(!list.length)c.done=true;},
  prompt:()=>!base?'SCALE Specify base point:':'SCALE Specify scale factor:',base:()=>base,
  point(p){if(!base)base=p;else go(dist(base,p));},
  text(s){if(!base)return false;const v=num(s);if(v===undefined)return false;go(v);return true;},
  preview:cur=>base?{ents:ghosts(list,scaling(base,Math.max(1e-6,dist(base,cur)))),rubber:[base,cur],tip:`× ${Number(dist(base,cur).toFixed(4))}`}:undefined};
 return c;
}
function mirrorCmd(env:Env):Command{
 let list:Ent[]=[],a:Pt|undefined,b:Pt|undefined;
 const go=(erase:boolean)=>{const m=mirroring(a!,b!);if(erase)env.store.commit('Mirror',{put:list.map(e=>transformEnt(e,m))});else env.store.commit('Mirror',{add:list.map(e=>strip(transformEnt(e,m)))});c.done=true;};
 const c:Command={name:'MIRROR',done:false,selectFirst:true,
  begin(){list=editable(env);if(!list.length)c.done=true;},
  prompt:()=>!a?'MIRROR Specify first point of mirror line:':!b?'MIRROR Specify second point of mirror line:':'MIRROR Erase source objects? [Yes/No] <N>:',
  base:()=>b?undefined:a,
  point(p){if(!a)a=p;else if(!b)b=p;},
  text(s){if(!b)return false;const k=key(s);if(k==='Y'||k==='YES'){go(true);return true;}if(k==='N'||k==='NO'){go(false);return true;}return false;},
  enter(){if(b)go(false);},
  preview:cur=>a&&!b&&dist(a,cur)>1e-12?{ents:ghosts(list,mirroring(a,cur)),rubber:[a,cur]}:undefined};
 return c;
}
function eraseCmd(env:Env):Command{
 const c:Command={name:'ERASE',done:false,selectFirst:true,prompt:()=>'ERASE',
  begin(){const list=editable(env);if(list.length)env.store.commit('Erase',{del:list.map(e=>e.id)});env.log(`${list.length} erased.`);c.done=true;}};
 return c;
}
function explodeCmd(env:Env):Command{
 const c:Command={name:'EXPLODE',done:false,selectFirst:true,prompt:()=>'EXPLODE',
  begin(){
   const del:number[]=[],add:NewEnt[]=[];
   for(const e of editable(env)){const parts=explodeEnt(e,env.store.doc);if(parts){del.push(e.id);add.push(...parts);}}
   if(del.length)env.store.commit('Explode',{del,add});
   env.log(del.length?`${del.length} exploded.`:'Only polylines, dimensions and blocks explode.');c.done=true;}};
 return c;
}
function offsetCmd(env:Env):Command{
 let d=env.offsetDistance(),target:Ent|undefined;
 const c:Command={name:'OFFSET',done:false,
  prompt:()=>d===undefined?'OFFSET Specify offset distance:':!target?`OFFSET Select object to offset or <exit> (distance ${env.length(d)}):`:'OFFSET Specify point on side to offset:',
  wantsPick:()=>d!==undefined&&!target,
  pick(e){if(!e)return;if(env.store.layer(e.layer)?.locked){env.log('That object is on a locked layer.');return;}if(!['line','poly','circle','arc','ellipse','spline','xline','ray'].includes(e.type)){env.log('Offset lines, polylines, circles, arcs, ellipses, splines and construction lines.');return;}target=e;},
  point(p){if(d===undefined){return;}if(target){const o=offsetEnt(target,d,p);if(o)env.store.commit('Offset',{add:[o]});else env.log('Cannot offset that far.');target=undefined;}},
  text(s){if(d!==undefined&&!target)return false;const v=num(s);if(d===undefined&&v!==undefined&&v>0){d=v;env.setOffsetDistance(v);return true;}return false;},
  enter(){if(d===undefined)return;c.done=true;},
  preview:cur=>target&&d!==undefined?{ents:[offsetEnt(target,d,cur)].filter((e):e is NewEnt=>!!e)}:undefined};
 return c;
}
function trimCmd(env:Env,extend:boolean):Command{
 const name=extend?'EXTEND':'TRIM';
 const c:Command={name,done:false,
  prompt:()=>`${name} Select object to ${extend?'extend':'trim'} or <exit>:`,
  wantsPick:()=>true,
  pick(e,p){
   if(!e)return;if(env.store.layer(e.layer)?.locked){env.log('That object is on a locked layer.');return;}
   if(extend){const r=extendEnt(e,p,env.neighbors(e),env.store.doc);if(r)env.store.commit('Extend',{put:[r]});else env.log('No boundary ahead of that end.');return;}
   const pieces=trimEnt(e,p,env.neighbors(e),env.store.doc);
   if(!pieces){env.log('Trim lines, polylines, circles, arcs, ellipses, splines and construction lines.');return;}
   env.store.commit('Trim',{del:[e.id],add:pieces});
  },
  enter(){c.done=true;}};
 return c;
}
function distCmd(env:Env):Command{
 let a:Pt|undefined;
 const c:Command={name:'DIST',done:false,prompt:()=>a?'DIST Specify second point:':'DIST Specify first point:',base:()=>a,
  point(p){if(!a){a=p;return;}const d=sub(p,a);env.log(`Distance = ${env.length(dist(a,p))}, angle ${fmtAngle(angleOf(a,p))}, ΔX = ${env.length(Math.abs(d[0]))}, ΔY = ${env.length(Math.abs(d[1]))}`);c.done=true;},
  preview:cur=>a?{rubber:[a,cur],tip:env.length(dist(a,cur))}:undefined};
 return c;
}
function zoomCmd(env:Env):Command{
 let windowing=false,a:Pt|undefined;
 const c:Command={name:'ZOOM',done:false,
  prompt:()=>!windowing?'ZOOM [Extents/Window] <Extents>:':a?'ZOOM Specify opposite corner:':'ZOOM Specify first corner:',
  point(p){if(!windowing){windowing=true;a=p;return;}if(!a){a=p;return;}env.zoomWindow(a,p);c.done=true;},
  text(s){const k=key(s);if(!windowing&&(k==='E'||k==='A')){env.zoomExtents();c.done=true;return true;}if(!windowing&&k==='W'){windowing=true;return true;}return false;},
  enter(){if(!windowing){env.zoomExtents();c.done=true;}},
  preview:cur=>a?{ents:[{type:'poly',layer:'0',closed:true,points:[a,[cur[0],a[1]],cur,[a[0],cur[1]]]}]}:undefined};
 return c;
}
/** Place entities that follow the cursor by their base point (paste). */
export function placeCmd(env:Env,name:string,ents:NewEnt[],base:Pt):Command{
 const c:Command={name,done:false,prompt:()=>`${name} Specify insertion point:`,
  point(p){const m=translation(sub(p,base));env.store.commit(name==='PASTE'?'Paste':name,{add:ents.map(e=>strip(transformEnt({...e,id:0} as Ent,m)))});c.done=true;},
  preview:cur=>({ents:ents.length>1500?undefined:ents.map(e=>strip(transformEnt({...e,id:0} as Ent,translation(sub(cur,base)))))})};
 return c;
}

export const commandNames:Record<string,string>={
 L:'LINE',LINE:'LINE',PL:'PLINE',PLINE:'PLINE',REC:'RECTANG',RECTANG:'RECTANG',RECTANGLE:'RECTANG',C:'CIRCLE',CIRCLE:'CIRCLE',A:'ARC',ARC:'ARC',
 T:'TEXT',DT:'TEXT',TEXT:'TEXT',DLI:'DIMLINEAR',DIM:'DIMLINEAR',DIMLINEAR:'DIMLINEAR',DAL:'DIMALIGNED',DIMALIGNED:'DIMALIGNED',
 M:'MOVE',MOVE:'MOVE',CO:'COPY',CP:'COPY',COPY:'COPY',RO:'ROTATE',ROTATE:'ROTATE',SC:'SCALE',SCALE:'SCALE',MI:'MIRROR',MIRROR:'MIRROR',
 E:'ERASE',ERASE:'ERASE',X:'EXPLODE',EXPLODE:'EXPLODE',O:'OFFSET',OFFSET:'OFFSET',TR:'TRIM',TRIM:'TRIM',EX:'EXTEND',EXTEND:'EXTEND',
 DI:'DIST',DIST:'DIST',Z:'ZOOM',ZOOM:'ZOOM',U:'UNDO',UNDO:'UNDO',REDO:'REDO',LA:'LAYER',LAYER:'LAYER',PR:'PROPERTIES',CH:'PROPERTIES',PROPERTIES:'PROPERTIES',
 ...drawNames,...modifyNames,
};
/** A command by its full name, or undefined for UNDO, REDO, LAYER and PROPERTIES, which the editor runs directly. */
export function makeCommand(name:string,env:Env):Command|undefined{
 switch(name){
  case 'LINE':return lineCmd(env);case 'PLINE':return plineCmd(env);case 'RECTANG':return rectCmd(env);case 'CIRCLE':return circleCmd(env);
  case 'TEXT':return textCmd(env);case 'DIMLINEAR':return dimCmd(env,false);case 'DIMALIGNED':return dimCmd(env,true);
  case 'MOVE':return moveCopyCmd(env,false);case 'COPY':return moveCopyCmd(env,true);case 'ROTATE':return rotateCmd(env);case 'SCALE':return scaleCmd(env);
  case 'MIRROR':return mirrorCmd(env);case 'ERASE':return eraseCmd(env);case 'EXPLODE':return explodeCmd(env);case 'OFFSET':return offsetCmd(env);
  case 'TRIM':return trimCmd(env,false);case 'EXTEND':return trimCmd(env,true);case 'DIST':return distCmd(env);case 'ZOOM':return zoomCmd(env);
 }
 return drawCommands[name]?.(env)??modifyCommands[name]?.(env);
}
/** Default text and dimension heights: 1/8 in or 2.5 mm on a sheet; sketches by their own text. */
export function defaultHeights(doc:CadDoc){
 const texts=doc.entities.filter(e=>e.type==='text').map(e=>e.type==='text'?e.height:0).sort((a,b)=>a-b);
 const median=texts.length?texts[Math.floor(texts.length/2)]:undefined;
 const h=doc.unit==='in'?.09375:doc.unit==='mm'?2.5:(median??7);
 return {text:median??h,dim:h};
}

import {dimStyleOf,standardDimStyle,tableCell,textStyleOf,type DimStyle} from './annotation';
import {loopArea} from './hatch';
import {closedOutline} from './drawCommands';
import {
 add,angleOf,arcPoint,dist,dot,len,mul,sub,sweep,
 type CadDoc,type DimEnt,type Ent,type NewEnt,type Pt,
} from './model';
import {angleText,annoFactor,annoProps,fmtAngle,isKey,key,lockedPick,num,type Command,type Env} from './cmdkit';

/** The current dimension style (DIMSTYLE), Standard when unset. */
export function currentDimStyle(env:Env):DimStyle{
 const name=String(env.vars.DIMSTYLE??'Standard');
 return dimStyleOf(name,env.store.doc)??standardDimStyle(env.store.doc.unit);
}
/** A dimension's text height from its style, or the editor's dimension height. */
export const styleHeight=(st:DimStyle)=>st.textHeight*st.scale;
const ucs=(env:Env):Pt=>[+(env.vars.UCSX??0),+(env.vars.UCSY??0)];

// ---- MTEXT -----------------------------------------------------------------------------------------------------------
const justify:Record<string,number>={TL:1,TC:2,TR:3,ML:4,MC:5,MR:6,BL:7,BC:8,BR:9};
function mtextCmd(env:Env):Command{
 type Step='first'|'corner'|'height'|'justify'|'rotation'|'style'|'width'|'text';
 let step:Step='first',a:Pt|undefined,b:Pt|undefined,height=env.textHeight(),attach=1,angle=0,width:number|undefined,style=String(env.vars.TEXTSTYLE??'Standard');
 const lines:string[]=[];
 const fixed=textStyleOf(style,env.store.doc).height;if(fixed>0)height=fixed;
 // The insertion point is the box corner or side that the attachment names.
 const place=():{at:Pt;width:number}=>{
  const p=a!,q=b??a!,x0=Math.min(p[0],q[0]),x1=Math.max(p[0],q[0]),y0=Math.min(p[1],q[1]),y1=Math.max(p[1],q[1]),row=Math.floor((attach-1)/3),col=(attach-1)%3;
  const w=width??(x1-x0);return {at:[col===0?x0:col===1?(x0+x1)/2:x1,row===0?y1:row===1?(y0+y1)/2:y0],width:w};
 };
 const ent=(value:string):NewEnt=>({type:'mtext',layer:env.layer(),...place(),height:height*annoFactor(env),value,angle,attach,...(style!=='Standard'?{style}:{}),...annoProps(env)});
 const cmd:Command={name:'MTEXT',done:false,
  prompt:()=>({first:`MTEXT Specify first corner (style ${style}, height ${env.length(height)}):`,corner:'MTEXT Specify opposite corner or [Height/Justify/Rotation/Style/Width]:',height:`MTEXT Specify height <${env.length(height)}>:`,
   justify:'MTEXT Enter justification [TL/TC/TR/ML/MC/MR/BL/BC/BR] <TL>:',rotation:`MTEXT Specify rotation angle <${angle}>:`,style:`MTEXT Enter style name <${style}>:`,width:'MTEXT Specify width (0 for no wrapping):',
   text:'MTEXT Enter text: Enter starts a new line, Enter on an empty line ends:'} as Record<Step,string>)[step],
  base:()=>step==='corner'?a:undefined,freeText:()=>step==='text'||step==='style',
  point(p){if(step==='first'){a=p;step='corner';}else if(step==='corner'){b=p;step='text';}else if(step==='width'){width=Math.abs(p[0]-a![0]);step='text';}},
  text(t){
   if(step==='corner'){
    if(isKey(t,'Height')){step='height';return true;}if(isKey(t,'Justify')){step='justify';return true;}if(isKey(t,'Rotation')){step='rotation';return true;}
    if(isKey(t,'Style')){step='style';return true;}if(isKey(t,'Width')){step='width';return true;}return false;
   }
   if(step==='height'){const v=num(t);if(v===undefined||v<=0)return false;height=v;env.setTextHeight(v);step='corner';return true;}
   if(step==='justify'){const j=justify[key(t)];if(!j)return false;attach=j;step='corner';return true;}
   if(step==='rotation'){const v=angleText(t);if(v===undefined)return false;angle=v;step='corner';return true;}
   if(step==='style'){const s=t.trim();if(!s){step='corner';return true;}if(s!=='Standard'&&!env.store.doc.textStyles?.some(x=>x.name===s)){env.log(`No text style named ${s}.`);return true;}style=s;step='corner';return true;}
   if(step==='width'){const v=num(t);if(v===undefined||v<0)return false;width=v;step='text';return true;}
   if(step==='text'){if(!t.trim()&&!lines.length){cmd.done=true;return true;}if(!t.trim()){finish();return true;}lines.push(t);return true;}
   return false;
  },
  enter(){if(step==='text'){finish();return;}if(step==='corner'||step==='width'){if(step==='corner')b=a;step='text';return;}if(step!=='first')step='corner';else cmd.done=true;},
  preview:q=>step==='corner'&&a?{ents:[{type:'poly',layer:env.layer(),closed:true,points:[a,[q[0],a[1]],q,[a[0],q[1]]]}]}:step==='text'&&lines.length?{ents:[ent(lines.join('\n'))]}:undefined};
 const finish=()=>{if(lines.length)env.store.commit('Multiline text',{add:[ent(lines.join('\n'))]});cmd.done=true;};
 return cmd;
}

// ---- dimensions ----------------------------------------------------------------------------------------------------
const dimBase=(env:Env):Pick<DimEnt,'layer'|'height'|'style'|'annotative'>=>{const st=currentDimStyle(env);return {layer:env.layer(),height:styleHeight(st)*annoFactor(env),style:st.name,...annoProps(env)};};
const lineHit=(a:Pt,b:Pt,c:Pt,d:Pt):Pt|undefined=>{const r=sub(b,a),s=sub(d,c),den=r[0]*s[1]-r[1]*s[0];if(Math.abs(den)<1e-12)return undefined;const t=((c[0]-a[0])*s[1]-(c[1]-a[1])*s[0])/den;return add(a,mul(r,t));};
function dimAngularCmd(env:Env):Command{
 type Step='pick'|'second'|'vertex'|'p1'|'p2'|'place';
 let step:Step='pick',first:{e:Ent;p:Pt}|undefined,c:Pt|undefined,a:Pt|undefined,b:Pt|undefined;
 const dim=(at:Pt):NewEnt=>({type:'dim',kind:'angular',...dimBase(env),c:c!,a:a!,b:b!,at});
 const cmd:Command={name:'DIMANGULAR',done:false,
  prompt:()=>({pick:'DIMANGULAR Select arc, circle, line, or <specify vertex>:',second:'DIMANGULAR Select second line:',vertex:'DIMANGULAR Specify angle vertex:',p1:'DIMANGULAR Specify first angle endpoint:',p2:'DIMANGULAR Specify second angle endpoint:',place:'DIMANGULAR Specify dimension arc line location:'} as Record<Step,string>)[step],
  wantsPick:()=>step==='pick'||step==='second',
  base:()=>step==='p1'||step==='p2'?c:undefined,
  pick(e,p){
   if(!e)return;
   if(step==='pick'){
    if(e.type==='arc'){c=e.center;a=arcPoint(e,e.start);b=arcPoint(e,e.end);step='place';return;}
    if(e.type==='circle'){c=e.center;a=p;step='p2';return;}
    if(e.type==='line'){first={e,p};step='second';return;}
    env.log('Select an arc, a circle or a line.');return;
   }
   if(e.type!=='line'||first?.e.type!=='line'){env.log('Select a second line.');return;}
   const l1=first.e,x=lineHit(l1.a,l1.b,e.a,e.b);if(!x){env.log('The lines are parallel.');return;}
   c=x;a=first.p;b=p;step='place';
  },
  point(p){if(step==='vertex'){c=p;step='p1';}else if(step==='p1'){a=p;step='p2';}else if(step==='p2'){b=p;step='place';}else if(step==='place'){env.store.commit('Angular dimension',{add:[dim(p)]});cmd.done=true;}},
  enter(){if(step==='pick'){step='vertex';return;}cmd.done=true;},
  preview:q=>step==='place'?{ents:[dim(q)]}:step==='p2'&&a?{rubber:[c!,q],tip:fmtAngle(sweep(angleOf(c!,a),angleOf(c!,q)))}:undefined};
 return cmd;
}
function dimRadialCmd(env:Env,diameter:boolean):Command{
 const name=diameter?'DIMDIAMETER':'DIMRADIUS';let c:Pt|undefined,a:Pt|undefined;
 const dim=(at:Pt):NewEnt=>({type:'dim',kind:diameter?'diameter':'radius',...dimBase(env),c:c!,a:a!,b:a!,at});
 const cmd:Command={name,done:false,
  prompt:()=>c?`${name} Specify dimension line location:`:`${name} Select arc or circle:`,
  wantsPick:()=>!c,
  pick(e,p){if(!e)return;if(e.type!=='arc'&&e.type!=='circle'){env.log('Select an arc or a circle.');return;}c=e.center;const d=dist(c,p)||1;a=add(c,mul(sub(p,c),e.radius/d));},
  point(p){if(!c)return;env.store.commit(diameter?'Diameter dimension':'Radius dimension',{add:[dim(p)]});cmd.done=true;},
  preview:q=>c?{ents:[dim(q)]}:undefined};
 return cmd;
}
function dimOrdinateCmd(env:Env):Command{
 let p:Pt|undefined,axis:'x'|'y'|undefined;
 const dim=(at:Pt):NewEnt=>({type:'dim',kind:'ordinate',...dimBase(env),c:ucs(env),a:p!,b:p!,at,...(axis?{axis}:{})});
 const cmd:Command={name:'DIMORDINATE',done:false,
  prompt:()=>p?'DIMORDINATE Specify leader endpoint or [Xdatum/Ydatum]:':'DIMORDINATE Specify feature location:',
  base:()=>p,
  point(q){if(!p){p=q;return;}env.store.commit('Ordinate dimension',{add:[dim(q)]});cmd.done=true;},
  text(t){if(!p)return false;if(isKey(t,'Xdatum')){axis='x';return true;}if(isKey(t,'Ydatum')){axis='y';return true;}return false;},
  preview:q=>p?{ents:[dim(q)]}:undefined};
 return cmd;
}
/** The last linear dimension drawn (DIMBASELINE and DIMCONTINUE start from it). */
function lastLinear(doc:CadDoc):DimEnt|undefined{
 for(let i=doc.entities.length-1;i>=0;i--){const e=doc.entities[i];if(e.type==='dim'&&(e.kind==='horizontal'||e.kind==='vertical'||e.kind==='aligned'))return e;}
 return undefined;
}
/** The next dimension of a chain: continued from the last one's second point, or from the base's first point one step out. */
export function chainDim(prev:DimEnt,base:DimEnt,p:Pt,baseline:boolean,spacing:number):Omit<DimEnt,'id'>{
 const dir:Pt=prev.kind==='horizontal'?[1,0]:prev.kind==='vertical'?[0,1]:(()=>{const v=sub(prev.b,prev.a),l=len(v)||1;return [v[0]/l,v[1]/l] as Pt;})();
 const n:Pt=[-dir[1],dir[0]],side=Math.sign(dot(sub(prev.at,prev.a),n))||1;
 const {id:_,...rest}=prev;
 if(!baseline)return {...rest,a:prev.b,b:p,text:undefined};
 return {...rest,a:base.a,b:p,at:add(prev.at,mul(n,side*spacing)),text:undefined};
}
function dimChainCmd(env:Env,baseline:boolean):Command{
 const name=baseline?'DIMBASELINE':'DIMCONTINUE';
 let base=lastLinear(env.store.doc),prev=base;const made:number[]=[];
 const spacing=()=>{const st=dimStyleOf(prev?.style,env.store.doc)??currentDimStyle(env);return st.baseline*st.scale;};
 const cmd:Command={name,done:false,
  prompt:()=>prev?`${name} Specify a second extension line origin or [Undo/Select] <done>:`:`${name} Select ${baseline?'base':'continued'} dimension:`,
  wantsPick:()=>!prev,
  base:()=>prev?.b,
  pick(e){if(!e)return;if(e.type!=='dim'||!(e.kind==='horizontal'||e.kind==='vertical'||e.kind==='aligned')){env.log('Select a linear dimension.');return;}base=e;prev=e;},
  point(p){if(!prev||!base)return;const d=chainDim(prev,base,p,baseline,spacing());const [id]=env.store.commit(baseline?'Baseline dimension':'Continued dimension',{add:[d]});made.push(id);prev=env.store.get(id) as DimEnt;},
  text(t){if(isKey(t,'Undo')&&made.length){env.store.undo();made.pop();prev=made.length?env.store.get(made[made.length-1]) as DimEnt:base;return true;}if(isKey(t,'Select')){prev=undefined;base=undefined;return true;}return false;},
  enter(){cmd.done=true;},
  preview:q=>prev&&base?{ents:[chainDim(prev,base,q,baseline,spacing())]}:undefined};
 if(!prev)env.log('No linear dimension yet: select one to start from.');
 return cmd;
}

// ---- leaders -------------------------------------------------------------------------------------------------------
function leaderCmd(env:Env,multi:boolean):Command{
 const name=multi?'MLEADER':'LEADER',pts:Pt[]=[],lines:string[]=[];let writing=false;
 const st=currentDimStyle(env),h=styleHeight(st)*annoFactor(env);
 const ent=(extra?:Pt):NewEnt=>({type:'leader',layer:env.layer(),points:extra?[...pts,extra]:[...pts],value:lines.join('\n'),height:h,style:st.name,...annoProps(env)});
 const finish=()=>{if(pts.length>=2)env.store.commit(multi?'Multileader':'Leader',{add:[ent()]});cmd.done=true;};
 const cmd:Command={name,done:false,
  prompt:()=>writing?`${name} Enter annotation text (Enter on an empty line ends):`:!pts.length?`${name} Specify leader arrowhead location:`:multi?`${name} Specify leader landing location:`:`${name} Specify next point or <annotation>:`,
  base:()=>pts[pts.length-1],freeText:()=>writing,
  point(p){if(writing)return;pts.push(p);if(multi&&pts.length===2)writing=true;},
  text(t){if(!writing)return false;if(!t.trim()){finish();return true;}lines.push(t);return true;},
  enter(){if(writing){finish();return;}if(pts.length>=2){writing=true;return;}cmd.done=true;},
  preview:q=>!writing&&pts.length?{ents:[ent(q)]}:writing?{ents:[ent()]}:undefined};
 return cmd;
}

// ---- tables --------------------------------------------------------------------------------------------------------
function tableCmd(env:Env):Command{
 const u=env.store.doc.unit==='in'?1:env.store.doc.unit==='mm'?25.4:72;
 let step:'cols'|'rows'|'width'|'height'|'at'='cols',cols=+(env.vars.TABLECOLS??4),rows=+(env.vars.TABLEROWS??3),cw=+(env.vars.TABLECOLW??1.5*u),rh=+(env.vars.TABLEROWH??.3*u);
 const h=env.textHeight();
 // A header row plus the data rows.
 const ent=(at:Pt):NewEnt=>({type:'table',layer:env.layer(),at,cols:Array(cols).fill(cw),rows:Array(rows+1).fill(rh),cells:[],height:Math.min(h,rh*.45),header:1});
 const cmd:Command={name:'TABLE',done:false,
  prompt:()=>({cols:`TABLE Number of columns <${cols}>:`,rows:`TABLE Number of data rows <${rows}>:`,width:`TABLE Column width <${env.length(cw)}>:`,height:`TABLE Row height <${env.length(rh)}>:`,at:'TABLE Specify insertion point (top-left corner):'})[step],
  point(p){if(step==='at'){env.store.commit('Table',{add:[ent(p)]});env.log('Double-click a cell to type in it.');cmd.done=true;}},
  text(t){
   const v=step==='cols'||step==='rows'?Number(t):num(t);if(v===undefined||!Number.isFinite(v)||v<=0)return false;
   if(step==='cols'){if(!Number.isInteger(v)||v>200)return false;cols=v;env.vars.TABLECOLS=v;step='rows';}
   else if(step==='rows'){if(!Number.isInteger(v)||v>2000)return false;rows=v;env.vars.TABLEROWS=v;step='width';}
   else if(step==='width'){cw=v;env.vars.TABLECOLW=v;step='height';}
   else if(step==='height'){rh=v;env.vars.TABLEROWH=v;step='at';}
   else return false;
   return true;
  },
  enter(){if(step==='cols')step='rows';else if(step==='rows')step='width';else if(step==='width')step='height';else if(step==='height')step='at';else cmd.done=true;},
  preview:q=>step==='at'?{ents:[ent(q)]}:undefined};
 return cmd;
}
/** The cell of a table under p, or undefined. */
export function cellAt(e:Extract<Ent,{type:'table'}>,p:Pt):{i:number;j:number}|undefined{
 for(let i=0;i<e.rows.length;i++)for(let j=0;j<e.cols.length;j++){const {lo,hi}=tableCell(e,i,j);if(p[0]>=lo[0]&&p[0]<=hi[0]&&p[1]>=lo[1]&&p[1]<=hi[1])return {i,j};}
 return undefined;
}
/** The table with one cell's text set. */
export function setCell(e:Extract<Ent,{type:'table'}>,i:number,j:number,value:string){
 const cells=e.rows.map((_,r)=>e.cols.map((__,c)=>e.cells[r]?.[c]??''));cells[i][j]=value;
 return {...e,cells};
}

// ---- REVCLOUD ------------------------------------------------------------------------------------------------------
/** A revision cloud around a closed outline: arcs of about the arc length bulging outward. */
export function cloudPoly(outline:Pt[],arcLength:number):{points:Pt[];bulges:number[]}{
 const loop=loopArea(outline)<0?[...outline].reverse():outline,pts:Pt[]=[],bul:number[]=[];
 for(let i=0;i<loop.length;i++){
  const a=loop[i],b=loop[(i+1)%loop.length],L=dist(a,b),n=Math.max(1,Math.round(L/arcLength));
  for(let k=0;k<n;k++){pts.push(add(a,mul(sub(b,a),k/n)));bul.push(Math.tan(30*Math.PI/180));}
 }
 return {points:pts,bulges:bul};
}
function revcloudCmd(env:Env):Command{
 const u=env.store.doc.unit==='in'?1:env.store.doc.unit==='mm'?25.4:72;
 type Step='first'|'corner'|'poly'|'object'|'arc';
 let step:Step='first',mode:'R'|'P'=String(env.vars.REVCLOUDMODE??'R')==='P'?'P':'R',a:Pt|undefined;const pts:Pt[]=[];
 const arc=()=>+(env.vars.REVCLOUDARC??.375*u);
 const make=(outline:Pt[],replace?:Ent)=>{const c=cloudPoly(outline,arc());const e:NewEnt={type:'poly',layer:env.layer(),closed:true,...c};env.store.commit('Revision cloud',replace?{del:[replace.id],add:[{...e,layer:replace.layer}]}:{add:[e]});cmd.done=true;};
 const rect=(p:Pt,q:Pt):Pt[]=>[p,[q[0],p[1]],q,[p[0],q[1]]];
 const cmd:Command={name:'REVCLOUD',done:false,
  prompt:()=>({first:`REVCLOUD Specify ${mode==='R'?'first corner':'start point'} or [Arc length/Object/Rectangular/Polygonal] (arc ${env.length(arc())}):`,corner:'REVCLOUD Specify opposite corner:',
   poly:'REVCLOUD Specify next point or <close>:',object:'REVCLOUD Select a closed object:',arc:`REVCLOUD Specify arc length <${env.length(arc())}>:`} as Record<Step,string>)[step],
  base:()=>step==='corner'?a:step==='poly'?pts[pts.length-1]:undefined,
  wantsPick:()=>step==='object',
  pick(e){if(!e||lockedPick(env,e))return;const o=closedOutline(e);if(!o){env.log('Select a closed polyline, circle, ellipse or closed spline.');return;}make(e.type==='poly'&&!e.bulges?.some(x=>x)?e.points:o,e);},
  point(p){
   if(step==='first'){if(mode==='R'){a=p;step='corner';}else{pts.push(p);step='poly';}return;}
   if(step==='corner'){if(Math.abs(p[0]-a![0])>1e-9&&Math.abs(p[1]-a![1])>1e-9)make(rect(a!,p));return;}
   if(step==='poly')pts.push(p);
  },
  text(t){
   if(step==='first'){
    if(isKey(t,'Arc length')||key(t)==='A'){step='arc';return true;}
    if(isKey(t,'Object')){step='object';return true;}
    if(isKey(t,'Rectangular')){mode='R';env.vars.REVCLOUDMODE='R';return true;}
    if(isKey(t,'Polygonal')){mode='P';env.vars.REVCLOUDMODE='P';return true;}
   }
   if(step==='arc'){const v=num(t);if(v===undefined||v<=0)return false;env.vars.REVCLOUDARC=v;step='first';return true;}
   return false;
  },
  enter(){if(step==='poly'){if(pts.length>=3)make([...pts]);else cmd.done=true;return;}if(step==='arc'||step==='object'){step='first';return;}cmd.done=true;},
  preview:q=>{
   if(step==='corner'&&a&&Math.abs(q[0]-a[0])>1e-9&&Math.abs(q[1]-a[1])>1e-9)return {ents:[{type:'poly',layer:env.layer(),closed:true,...cloudPoly(rect(a,q),arc())}]};
   if(step==='poly'&&pts.length)return {ents:[{type:'poly',layer:env.layer(),closed:false,points:[...pts,q]}]};
   return undefined;
  }};
 return cmd;
}

// ---- settings: LTSCALE, PLOTSTYLE, UCS -------------------------------------------------------------------------------
function ltscaleCmd(env:Env):Command{
 const cmd:Command={name:'LTSCALE',done:false,prompt:()=>`LTSCALE Enter new linetype scale factor <${env.store.doc.ltscale??1}>:`,
  text(t){const v=num(t);if(v===undefined||v<=0)return false;env.store.commit('Linetype scale',{meta:{ltscale:v}});env.log(`Linetype scale ${v}.`);cmd.done=true;return true;},
  enter(){cmd.done=true;}};
 return cmd;
}
function plotStyleCmd(env:Env):Command{
 const cmd:Command={name:'PLOTSTYLE',done:false,prompt:()=>`PLOTSTYLE Enter plot style [Monochrome/Grayscale/Color] <${env.store.doc.plotStyle??'monochrome'}>:`,
  text(t){const k=key(t)[0],v=k==='M'?'monochrome':k==='G'?'grayscale':k==='C'?'color':undefined;if(!v)return false;env.store.commit('Plot style',{meta:{plotStyle:v}});env.log(`Plot style ${v}: paper view, SVG and plots.`);cmd.done=true;return true;},
  enter(){cmd.done=true;}};
 return cmd;
}
function ucsCmd(env:Env):Command{
 const cmd:Command={name:'UCS',done:false,prompt:()=>`UCS Specify origin of UCS or [World] <${ucs(env).map(v=>Number(v.toFixed(4))).join(',')}>:`,
  point(p){env.vars.UCSX=p[0];env.vars.UCSY=p[1];env.log('Ordinate dimensions measure from the new origin.');cmd.done=true;},
  text(t){if(isKey(t,'World')){delete env.vars.UCSX;delete env.vars.UCSY;cmd.done=true;return true;}return false;},
  enter(){cmd.done=true;}};
 return cmd;
}

export const annotateNames:Record<string,string>={
 MT:'MTEXT',MTEXT:'MTEXT',DAN:'DIMANGULAR',DIMANGULAR:'DIMANGULAR',DRA:'DIMRADIUS',DIMRADIUS:'DIMRADIUS',DDI:'DIMDIAMETER',DIMDIAMETER:'DIMDIAMETER',
 DOR:'DIMORDINATE',DIMORDINATE:'DIMORDINATE',DBA:'DIMBASELINE',DIMBASELINE:'DIMBASELINE',DCO:'DIMCONTINUE',DIMCONTINUE:'DIMCONTINUE',
 LE:'LEADER',LEADER:'LEADER',QLEADER:'LEADER',MLD:'MLEADER',MLEADER:'MLEADER',TB:'TABLE',TABLE:'TABLE',REVCLOUD:'REVCLOUD',RC:'REVCLOUD',
 LTS:'LTSCALE',LTSCALE:'LTSCALE',PLOTSTYLE:'PLOTSTYLE',UCS:'UCS',
 ST:'STYLE',STYLE:'STYLE',D:'DIMSTYLE',DST:'DIMSTYLE',DDIM:'DIMSTYLE',DIMSTYLE:'DIMSTYLE',
};
export const annotateCommands:Record<string,(env:Env)=>Command>={
 MTEXT:mtextCmd,DIMANGULAR:dimAngularCmd,DIMRADIUS:env=>dimRadialCmd(env,false),DIMDIAMETER:env=>dimRadialCmd(env,true),DIMORDINATE:dimOrdinateCmd,
 DIMBASELINE:env=>dimChainCmd(env,true),DIMCONTINUE:env=>dimChainCmd(env,false),LEADER:env=>leaderCmd(env,false),MLEADER:env=>leaderCmd(env,true),
 TABLE:tableCmd,REVCLOUD:revcloudCmd,LTSCALE:ltscaleCmd,PLOTSTYLE:plotStyleCmd,UCS:ucsCmd,
};

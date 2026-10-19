/**
 * Annotation: text and dimension styles, and the drawable pieces (lines, arcs, fills, text) of the composite
 * entities: dimensions of every kind, multiline text, leaders and tables. Everything that draws, exports, picks or
 * explodes these entities goes through primitives().
 */
import {
 DEG,add,angleOf,dist,dot,formatLength,len,mid,mul,norm360,polar,sub,sweep,textWidthPerHeight,
 type Align,type CadDoc,type DimEnt,type Ent,type LeaderEnt,type MTextEnt,type NewEnt,type Pt,type TableEnt,
} from './model';

export type ArrowKind='closed'|'open'|'tick'|'dot'|'none';
export interface TextStyle{name:string;font:string;widthFactor:number;oblique:number;height:number;bold?:boolean}
/** Sizes in paper (drawing) units before the overall scale; precision is the inch denominator (US) or decimals (SI). */
export interface DimStyle{
 name:string;textHeight:number;arrowSize:number;arrow:ArrowKind;extOffset:number;extBeyond:number;textGap:number;
 textPos:'above'|'centered';units:'arch'|'decimal';precision:number;scale:number;baseline:number;textStyle?:string;prefix?:string;suffix?:string;
}
/** What drawing a composite entity needs from its drawing. */
export type Ctx=Pick<CadDoc,'display'|'realPerUnit'>&Partial<Pick<CadDoc,'unit'|'textStyles'|'dimStyles'>>;
export type Prim={k:'line';a:Pt;b:Pt}|{k:'arc';c:Pt;r:number;s:number;e:number}|{k:'fill';pts:Pt[]}|{k:'text';at:Pt;height:number;value:string;angle:number;align:Align;bold:boolean;style?:string};

export const fonts:Record<string,string>={
 Arial:'Arial, "Liberation Sans", Helvetica, sans-serif','Arial Narrow':'"Arial Narrow", "Liberation Sans Narrow", Arial, sans-serif',
 'Times New Roman':'"Times New Roman", "Liberation Serif", Times, serif','Courier New':'"Courier New", "Liberation Mono", Courier, monospace',
};
export const standardTextStyle:TextStyle={name:'Standard',font:'Arial',widthFactor:1,oblique:0,height:0};
/** The Standard dimension style for a drawing's units: 3/32" (2.5 mm) text with closed arrows. */
export function standardDimStyle(unit:CadDoc['unit']='in'):DimStyle{
 const k=unit==='in'?1:unit==='mm'?25.4:72,h=unit==='mm'?2.5:unit==='in'?.09375:7;
 return {name:'Standard',textHeight:h,arrowSize:h*1.1,arrow:'closed',extOffset:h*.5,extBeyond:h*.6,textGap:h*.45,textPos:'above',units:'arch',precision:unit==='mm'?0:16,scale:1,baseline:.375*k};
}
export const textStyleOf=(name:string|undefined,ctx?:Partial<Pick<CadDoc,'textStyles'>>)=>ctx?.textStyles?.find(s=>s.name===(name??'Standard'))??standardTextStyle;
export const dimStyleOf=(name:string|undefined,ctx?:Partial<Pick<CadDoc,'dimStyles'|'unit'>>)=>name?ctx?.dimStyles?.find(s=>s.name===name)??(name==='Standard'?standardDimStyle(ctx?.unit):undefined):undefined;
const textWidth=(value:string,bold:boolean,height:number,style:TextStyle)=>textWidthPerHeight(value,bold||!!style.bold,style.font)*height*style.widthFactor;

/** A real length as a dimension style reads it. */
export function formatDim(mm:number,st:DimStyle|undefined,display:'US'|'SI'){
 const pre=st?.prefix??'',suf=st?.suffix??'';
 if(!st)return formatLength(mm,display);
 if(display==='SI'){const p=Math.max(0,Math.min(4,Math.round(st.precision)));return `${pre}${(Math.round(mm*10**p)/10**p).toFixed(p)}${suf}`;}
 if(st.units==='decimal'){const p=Math.max(0,Math.min(4,Math.round(st.precision)));return `${pre}${(mm/25.4).toFixed(p)}"${suf}`;}
 const d=[1,2,4,8,16,32,64].includes(st.precision)?st.precision:16,n=Math.round(Math.abs(mm)/25.4*d),sign=mm<0?'-':'';
 const ft=Math.floor(n/(12*d)),rest=n-ft*12*d,inch=Math.floor(rest/d);let f=rest-inch*d,dd=d;while(f&&f%2===0){f/=2;dd/=2;}
 const frac=f?`${inch||ft?`${inch} `:''}${f}/${dd}`:`${inch}`;
 return `${pre}${ft?`${sign}${ft}'-${frac}"`:`${sign}${frac}"`}${suf}`;
}
const fmtDeg=(a:number,st?:DimStyle)=>`${st&&st.units==='decimal'?a.toFixed(Math.min(4,st.precision)):Number(a.toFixed(a%1?2:0))}°`;

// ---- arrows ----------------------------------------------------------------------------------------------------------
/** An arrowhead at tip pointing away from back (back is a point along the dimension line behind the tip). */
export function arrowPrims(tip:Pt,back:Pt,size:number,kind:ArrowKind):Prim[]{
 const v=sub(back,tip),l=len(v);if(l<1e-12||kind==='none')return [];
 const u=mul(v,1/l),n:Pt=[-u[1],u[0]];
 switch(kind){
  case 'closed':{const w=size*.18,b=add(tip,mul(u,size));return [{k:'fill',pts:[tip,add(b,mul(n,w)),sub(b,mul(n,w))]}];}
  case 'open':{const w=size*.3,b=add(tip,mul(u,size));return [{k:'line',a:tip,b:add(b,mul(n,w))},{k:'line',a:tip,b:sub(b,mul(n,w))}];}
  case 'tick':{const t=mul(add(u,n),size*.5/Math.SQRT2);return [{k:'line',a:sub(tip,t),b:add(tip,t)}];}
  case 'dot':{const r=size*.25,pts:Pt[]=[];for(let i=0;i<12;i++)pts.push(polar(tip,r,i*30));return [{k:'fill',pts}];}
 }
}

// ---- dimensions --------------------------------------------------------------------------------------------------
interface DimSizes{h:number;arrow:number;gap:number;ext:number;textGap:number;kind:ArrowKind;centered:boolean;style?:DimStyle}
function sizes(e:DimEnt,ctx?:Ctx):DimSizes{
 const st=dimStyleOf(e.style,ctx),h=e.height;
 if(!st)return {h,arrow:h*1.1,gap:h*.5,ext:h*.6,textGap:h*.45,kind:'closed',centered:false};
 const k=st.scale;return {h,arrow:st.arrowSize*k,gap:st.extOffset*k,ext:st.extBeyond*k,textGap:st.textGap*k,kind:st.arrow,centered:st.textPos==='centered',style:st};
}
const readable=(deg:number)=>{let a=deg;a=((a%360)+360)%360;if(a>90.0001&&a<=270.0001)a-=180;return a>180?a-360:a;};
const text=(at:Pt,height:number,value:string,angle:number,align:Align=1,style?:string):Prim=>({k:'text',at,height,value,angle,align,bold:false,...(style?{style}:{})});
/** The dimension's measured value in its units: a length in drawing units, or degrees for angular. */
export function dimMeasure(e:DimEnt):number{
 switch(e.kind){
  case 'horizontal':return Math.abs(e.b[0]-e.a[0]);
  case 'vertical':return Math.abs(e.b[1]-e.a[1]);
  case 'aligned':return dist(e.a,e.b);
  case 'radius':return dist(e.c??e.a,e.a);
  case 'diameter':return 2*dist(e.c??e.a,e.a);
  case 'ordinate':{const c=e.c??[0,0];return Math.abs(ordinateAxis(e)==='x'?e.a[0]-c[0]:e.a[1]-c[1]);}
  case 'angular':{const c=e.c!,a1=angleOf(c,e.a),a2=angleOf(c,e.b),at=angleOf(c,e.at),s=sweep(a1,a2);return norm360(at-a1)<=s?s:360-s;}
 }
}
/** An ordinate dimension measures x when its leader runs mostly up or down from the feature. */
export const ordinateAxis=(e:DimEnt)=>e.axis??(Math.abs(e.at[1]-e.a[1])>=Math.abs(e.at[0]-e.a[0])?'x':'y');
export function dimValue(e:DimEnt,ctx:Ctx){
 const st=dimStyleOf(e.style,ctx);
 if(e.text!==undefined&&e.text!=='<>')return e.text;
 const m=dimMeasure(e);
 if(e.kind==='angular')return fmtDeg(m,st);
 const v=formatDim(m*ctx.realPerUnit,st,ctx.display);
 return e.kind==='radius'?`R${v}`:e.kind==='diameter'?`Ø${v}`:v;
}
/** Lines, arcs, arrowheads and text of a dimension. */
export function dimPrims(e:DimEnt,ctx:Ctx):Prim[]{
 const s=sizes(e,ctx),out:Prim[]=[],value=dimValue(e,ctx),ts=s.style?.textStyle;
 const push=(...p:Prim[])=>{out.push(...p);};
 if(e.kind==='horizontal'||e.kind==='vertical'||e.kind==='aligned'){
  const dir:Pt=e.kind==='horizontal'?[1,0]:e.kind==='vertical'?[0,1]:(()=>{const v=sub(e.b,e.a),l=len(v)||1;return [v[0]/l,v[1]/l] as Pt;})();
  const n:Pt=[-dir[1],dir[0]],off=dot(sub(e.at,e.a),n);
  const foot=(p:Pt):Pt=>add(e.at,mul(dir,dot(sub(p,e.at),dir)));
  const fa=foot(e.a),fb=foot(e.b);
  const side=(p:Pt,f:Pt)=>{const v=sub(f,p),l=len(v);return l>1e-12?mul(v,1/l):mul(n,Math.sign(off)||1);};
  for(const [p,f] of [[e.a,fa],[e.b,fb]] as const){const u=side(p,f);if(dist(p,f)>s.gap)push({k:'line',a:add(p,mul(u,s.gap)),b:add(f,mul(u,s.ext))});}
  push({k:'line',a:fa,b:fb});
  const along=sub(fb,fa),l=len(along)||1,u=mul(along,1/l);
  if(l>2.4*s.arrow)push(...arrowPrims(fa,fb,s.arrow,s.kind),...arrowPrims(fb,fa,s.arrow,s.kind));
  else push(...arrowPrims(fa,sub(fa,u),s.arrow,s.kind),...arrowPrims(fb,add(fb,u),s.arrow,s.kind));
  const angle=readable(Math.atan2(u[1],u[0])/DEG),up:Pt=[-Math.sin(angle*DEG),Math.cos(angle*DEG)];
  push(text(s.centered?add(mid(fa,fb),mul(up,-s.h/2)):add(mid(fa,fb),mul(up,s.textGap)),s.h,value,angle,1,ts));
  return out;
 }
 if(e.kind==='angular'){
  const c=e.c!,r=dist(c,e.at),a1=angleOf(c,e.a),a2=angleOf(c,e.b),at=angleOf(c,e.at),sw=sweep(a1,a2);
  // The sector holding the dimension arc: between the legs, or their opposite (the reflex) side.
  const [s0,s1]=norm360(at-a1)<=sw?[a1,a2]:[a2,a1],arcSw=sweep(s0,s1);
  for(const [p,ang] of [[norm360(at-a1)<=sw?e.a:e.b,s0],[norm360(at-a1)<=sw?e.b:e.a,s1]] as const){
   const d=dist(c,p),dirOut=d<r?1:-1,start=d<r?d+s.gap:d-s.gap,end=r+dirOut*s.ext;
   if(Math.abs(r-d)>s.gap)push({k:'line',a:polar(c,start,ang),b:polar(c,end,ang)});
  }
  push({k:'arc',c,r,s:s0,e:s0+arcSw});
  const step=s.arrow/Math.max(r,1e-9)/DEG,inside=arcSw*DEG*r>2.4*s.arrow;
  push(...arrowPrims(polar(c,r,s0),polar(c,r,s0+(inside?step:-step)),s.arrow,s.kind),...arrowPrims(polar(c,r,s0+arcSw),polar(c,r,s0+arcSw+(inside?-step:step)),s.arrow,s.kind));
  const m=s0+arcSw/2,angle=readable(m-90),up:Pt=[-Math.sin(angle*DEG),Math.cos(angle*DEG)],rad=polar([0,0],1,m),outward=dot(up,rad)>=0?1:-1;
  push(text(add(polar(c,r,m),mul(up,s.centered?-s.h/2:outward*s.textGap+(outward<0?-s.h:0))),s.h,value,angle,1,ts));
  return out;
 }
 if(e.kind==='radius'||e.kind==='diameter'){
  const c=e.c??e.a,r=dist(c,e.a),u=(()=>{const v=sub(e.at,c),l=len(v);return l>1e-12?mul(v,1/l):[1,0] as Pt;})(),pOn=add(c,mul(u,r)),outside=dist(c,e.at)>r;
  if(e.kind==='radius'){
   if(outside){push({k:'line',a:pOn,b:e.at},...arrowPrims(pOn,e.at,s.arrow,s.kind));}
   else{push({k:'line',a:c,b:pOn},...arrowPrims(pOn,c,s.arrow,s.kind));}
  }else{
   const pOff=sub(c,mul(u,r));
   if(outside){push({k:'line',a:pOn,b:e.at},...arrowPrims(pOn,e.at,s.arrow,s.kind),{k:'line',a:pOff,b:sub(pOff,mul(u,s.arrow*2))},...arrowPrims(pOff,sub(pOff,mul(u,s.arrow)),s.arrow,s.kind));}
   else{push({k:'line',a:pOff,b:pOn},...arrowPrims(pOn,pOff,s.arrow,s.kind),...arrowPrims(pOff,pOn,s.arrow,s.kind));}
  }
  // Text on a short horizontal landing at the leader end (outside) or along the line (inside).
  if(outside){const right=u[0]>=0,land=add(e.at,[right?s.arrow:-s.arrow,0]);push({k:'line',a:e.at,b:land},text(add(land,[right?s.textGap:-s.textGap,-s.h/2]),s.h,value,0,right?0:2,ts));}
  else{const angle=readable(Math.atan2(u[1],u[0])/DEG),up:Pt=[-Math.sin(angle*DEG),Math.cos(angle*DEG)];push(text(add(e.at,mul(up,s.textGap)),s.h,value,angle,1,ts));}
  return out;
 }
 // Ordinate: a leader from the feature, perpendicular to the measured axis, with a jog to the text end.
 const axis=ordinateAxis(e),vertical=axis==='x',p=e.a,end=e.at;
 const dir:Pt=vertical?[0,Math.sign(end[1]-p[1])||1]:[Math.sign(end[0]-p[0])||1,0],start=add(p,mul(dir,s.gap));
 const knee:Pt=vertical?[p[0],end[1]-dir[1]*s.arrow*2]:[end[0]-dir[0]*s.arrow*2,p[1]];
 push({k:'line',a:start,b:knee},{k:'line',a:knee,b:sub(end,mul(dir,s.arrow))},{k:'line',a:sub(end,mul(dir,s.arrow)),b:end});
 // Text beside the leader end, read along the leader and centered on it.
 push(text(add(add(end,mul(dir,s.textGap)),vertical?[s.h/2,0]:[0,-s.h/2]),s.h,value,vertical?90:0,dir[0]<0||dir[1]<0?2:0,ts));
 return out;
}

// ---- multiline text ------------------------------------------------------------------------------------------------
export interface MTextLine{at:Pt;value:string;align:Align}
/** Wrapped lines of a multiline text, placed by its attachment, and its box (four corners). */
export function mtextLayout(e:Omit<MTextEnt,'id'>,ctx?:Ctx):{lines:MTextLine[];box:Pt[]}{
 const st=textStyleOf(e.style,ctx),h=e.height,bold=!!e.bold,gap=h*5/3*(e.spacing??1),lines:string[]=[];
 for(const para of e.value.split('\n')){
  if(e.width<=0){lines.push(para);continue;}
  let cur='';
  for(const word of para.split(/(\s+)/)){
   const next=cur+word;
   if(cur.trim()&&textWidth(next.trimEnd(),bold,h,st)>e.width){lines.push(cur.trimEnd());cur=word.trimStart();}else cur=next;
  }
  lines.push(cur.trimEnd());
 }
 const W=e.width>0?e.width:Math.max(0,...lines.map(l=>textWidth(l,bold,h,st))),blockH=h+(lines.length-1)*gap;
 const row=Math.floor((e.attach-1)/3),col=(e.attach-1)%3,x0=col===0?0:col===1?-W/2:-W,top=row===0?0:row===1?blockH/2:blockH;
 const c=Math.cos(e.angle*DEG),s=Math.sin(e.angle*DEG),P=(x:number,y:number):Pt=>[e.at[0]+x*c-y*s,e.at[1]+x*s+y*c];
 const out=lines.map((value,i):MTextLine=>({value,at:P(col===0?x0:col===1?x0+W/2:x0+W,top-h-i*gap),align:col as Align}));
 const lo=top-blockH-.28*h,hi=top+.12*h;
 return {lines:out,box:[P(x0,lo),P(x0+W,lo),P(x0+W,hi),P(x0,hi)]};
}

// ---- leaders -------------------------------------------------------------------------------------------------------
export function leaderPrims(e:Omit<LeaderEnt,'id'>,ctx?:Ctx):Prim[]{
 const st=dimStyleOf(e.style,ctx),h=e.height,arrow=st?st.arrowSize*st.scale:h*1.1,kind=e.arrow??st?.arrow??'closed',out:Prim[]=[];
 const pts=e.points;if(pts.length<2)return out;
 for(let i=1;i<pts.length;i++)out.push({k:'line',a:pts[i-1],b:pts[i]});
 out.push(...arrowPrims(pts[0],pts[1],arrow,kind));
 if(!e.value)return out;
 const last=pts[pts.length-1],prev=pts[pts.length-2],right=last[0]>=prev[0],land=add(last,[right?h:-h,0]);
 if(e.landing!==false)out.push({k:'line',a:last,b:land});
 const tip=e.landing!==false?land:last,gap=h*5/3,lines=e.value.split('\n');
 lines.forEach((value,i)=>out.push(text(add(tip,[right?h*.45:-h*.45,-h/2-i*gap]),h,value,0,right?0:2,st?.textStyle)));
 return out;
}

// ---- tables --------------------------------------------------------------------------------------------------------
/** The corner of a table cell: column j, row i (top-left of the table at e.at, rows going down). */
export function tableCell(e:Omit<TableEnt,'id'>,i:number,j:number):{lo:Pt;hi:Pt}{
 const x0=e.at[0]+e.cols.slice(0,j).reduce((s,v)=>s+v,0),y1=e.at[1]-e.rows.slice(0,i).reduce((s,v)=>s+v,0);
 return {lo:[x0,y1-e.rows[i]],hi:[x0+e.cols[j],y1]};
}
export function tablePrims(e:Omit<TableEnt,'id'>):Prim[]{
 const W=e.cols.reduce((s,v)=>s+v,0),H=e.rows.reduce((s,v)=>s+v,0),[x,y]=e.at,out:Prim[]=[];
 let yy=y;for(let i=0;i<=e.rows.length;i++){out.push({k:'line',a:[x,yy],b:[x+W,yy]});yy-=e.rows[i]??0;}
 let xx=x;for(let j=0;j<=e.cols.length;j++){out.push({k:'line',a:[xx,y],b:[xx,y-H]});xx+=e.cols[j]??0;}
 const h=e.height,gap=h*5/3;
 e.rows.forEach((_,i)=>e.cols.forEach((__,j)=>{
  const v=e.cells[i]?.[j]??'';if(!v)return;
  const {lo,hi}=tableCell(e,i,j),lines=v.split('\n'),cy=(lo[1]+hi[1])/2,top=cy+(lines.length-1)*gap/2;
  const left=(e.align?.[j]??'center')==='left',rightA=(e.align?.[j]??'center')==='right';
  lines.forEach((value,k)=>out.push({k:'text',at:[left?lo[0]+h*.6:rightA?hi[0]-h*.6:(lo[0]+hi[0])/2,top-k*gap-h/2],height:h,value,angle:0,align:left?0:rightA?2:1,bold:i<(e.header??0)}));
 }));
 return out;
}

// ---- composite entities ----------------------------------------------------------------------------------------------
const cache=new WeakMap<object,{key:unknown[];prims:Prim[]}>();
/** The drawable pieces of a dimension, multiline text, leader or table (undefined for other entities). */
export function primitives(e:Ent|NewEnt,ctx:Ctx):Prim[]|undefined{
 if(e.type!=='dim'&&e.type!=='mtext'&&e.type!=='leader'&&e.type!=='table')return undefined;
 const key=[ctx.display,ctx.realPerUnit,ctx.textStyles,ctx.dimStyles,ctx.unit],hit=cache.get(e);
 if(hit&&hit.key.every((k,i)=>k===key[i]))return hit.prims;
 let prims:Prim[];
 switch(e.type){
  case 'dim':prims=dimPrims(e as DimEnt,ctx);break;
  case 'mtext':{const l=mtextLayout(e,ctx);prims=l.lines.map(x=>({k:'text',at:x.at,height:e.height,value:x.value,angle:e.angle,align:x.align,bold:!!e.bold,...(e.style?{style:e.style}:{})}));break;}
  case 'leader':prims=leaderPrims(e,ctx);break;
  case 'table':prims=tablePrims(e);break;
 }
 cache.set(e,{key,prims});return prims;
}
/** Primitives as plain entities (EXPLODE, DXF). */
export function primEnts(prims:Prim[],props:Pick<NewEnt,'layer'>&Partial<Pick<NewEnt,'color'|'ltype'|'weight'>>):NewEnt[]{
 return prims.flatMap((p):NewEnt[]=>{
  if(p.k==='line')return [{...props,type:'line',a:p.a,b:p.b}];
  if(p.k==='arc')return [{...props,type:'arc',center:p.c,radius:p.r,start:norm360(p.s),end:norm360(p.e)}];
  // Fills of more than four corners (dots) as a fan of triangles.
  if(p.k==='fill')return p.pts.length<=4?[{...props,type:'solid',points:p.pts}]:p.pts.slice(1,-1).map((q,i)=>({...props,type:'solid',points:[p.pts[0],q,p.pts[i+2]]}));
  return [{...props,type:'text',at:p.at,height:p.height,value:p.value,angle:p.angle,align:p.align,bold:p.bold,...(p.style?{style:p.style}:{})}];
 });
}
/** Text box corners of a text primitive (as textBox does for text entities). */
export function primTextBox(p:Extract<Prim,{k:'text'}>,ctx?:Ctx):Pt[]{
 const st=textStyleOf(p.style,ctx),w=textWidth(p.value,p.bold,p.height,st),x0=p.align===1?-w/2:p.align===2?-w:0,lo=-.28*p.height,hi=1.12*p.height;
 const c=Math.cos(p.angle*DEG),s=Math.sin(p.angle*DEG),at=(x:number,y:number):Pt=>[p.at[0]+x*c-y*s,p.at[1]+x*s+y*c];
 return [at(x0,lo),at(x0+w,lo),at(x0+w,hi),at(x0,hi)];
}

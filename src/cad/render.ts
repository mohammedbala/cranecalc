import {bulgeArc} from './curves';
import {DEG,bbox,clipSegment,compositeBoxes,curveSamples,effective,ellipseSweep,hatchLines,isComposite,pieces,textBox,textWidthPerHeight,type Box,type CadDoc,type Ctx,type Ent,type Grip,type NewEnt,type Pt,type SnapKind} from './model';
import {fonts,primitives,textStyleOf,type TextStyle} from './annotation';
import {children} from './blocks';
import {viewportContents} from './layout';
import {dashPattern} from './convert';
import {spatialIndex} from './spatial';

/** Screen view: world point (cx, cy) at the canvas center, scale pixels per drawing unit, canvas w × h CSS pixels. */
export interface View{cx:number;cy:number;scale:number;w:number;h:number}
export type Theme='dark'|'paper';
export const toScreen=(v:View,p:Pt):[number,number]=>[(p[0]-v.cx)*v.scale+v.w/2,v.h/2-(p[1]-v.cy)*v.scale];
export const toWorld=(v:View,x:number,y:number):Pt=>[(x-v.w/2)/v.scale+v.cx,(v.h/2-y)/v.scale+v.cy];
export const viewBox=(v:View):Box=>{const a=toWorld(v,0,v.h),b=toWorld(v,v.w,0);return [a[0],a[1],b[0],b[1]];};

// AutoCAD color index: 1–9 and the hue wheel in steps of 10.
const ACI:Record<number,string>={1:'#ff0000',2:'#ffff00',3:'#00ff00',4:'#00ffff',5:'#0000ff',6:'#ff00ff',7:'#ffffff',8:'#808080',9:'#c0c0c0'};
const wheel=['#ff0000','#ff3f00','#ff7f00','#ffbf00','#ffff00','#bfff00','#7fff00','#3fff00','#00ff00','#00ff3f','#00ff7f','#00ffbf','#00ffff','#00bfff','#007fff','#003fff','#0000ff','#3f00ff','#7f00ff','#bf00ff','#ff00ff','#ff00bf','#ff007f','#ff003f'];
export const aci=(c:number)=>ACI[c]??wheel[Math.round((c-10)/10)%24]??'#ffffff';
export const aciPalette=[1,2,3,4,5,6,7,8,9,30,40,140,150,210];
/** Plotted ink of a color by plot style: monochrome (black, the gray layers gray), grayscale, or the colors themselves. */
export function plotColor(color:number,style:CadDoc['plotStyle']='monochrome'){
 if(style==='color')return color===7?'#111':color===2?'#b89a00':color===4?'#00a3a3':color===3?'#1f9d2a':aci(color);
 if(style==='grayscale'){const hex=aci(color),r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16),l=color===7?0:Math.round(Math.min(.82,(.3*r+.59*g+.11*b)/255*.85)*255);return `rgb(${l},${l},${l})`;}
 return color===8?'#5f6670':color===9?'#9aa1a8':'#111';
}
/** On screen: the layer color on the dark model view; the plotted ink on paper. */
export function layerColor(color:number,theme:Theme,style?:CadDoc['plotStyle']){
 if(theme==='paper')return plotColor(color,style);
 return color===7?'#e8edf2':color===5?'#4d7dff':aci(color);
}
export const themeColors=(theme:Theme)=>theme==='dark'
 ?{bg:'#141b26',sheet:'#2b3a4c',grid:'rgba(255,255,255,.07)',select:'#5aa9ff',preview:'#9fd4ff',hover:'rgba(120,190,255,.55)',underlay:'rgba(255,159,67,.45)',crosshair:'rgba(225,235,245,.55)',snap:'#ffd60a',tip:'#22303f',tipText:'#e8edf2'}
 :{bg:'#cfd5cf',sheet:'#ffffff',grid:'rgba(0,0,0,.07)',select:'#1f6feb',preview:'#1f6feb',hover:'rgba(31,111,235,.45)',underlay:'rgba(230,110,0,.5)',crosshair:'rgba(20,30,40,.45)',snap:'#d97706',tip:'#ffffff',tipText:'#14202b'};

const boxCache=new WeakMap<object,Box>();
/** Cached extents of an entity (entities are immutable: a change makes a new object). */
export function cachedBox(e:Ent|NewEnt,doc:Ctx){let b=boxCache.get(e);if(!b){b=bbox(e as Ent,doc);boxCache.set(e,b);}return b;}
const overlaps=(a:Box,b:Box)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];

/** Add an entity's strokes to the current path (solids and text are filled separately). */
function strokePath(ctx:CanvasRenderingContext2D,v:View,e:Ent|NewEnt,doc:Ctx){
 const S=(p:Pt)=>toScreen(v,p);
 switch(e.type){
  case 'line':{const a=S(e.a),b=S(e.b);ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);break;}
  case 'poly':{
   const p=e.points.map(S);ctx.moveTo(p[0][0],p[0][1]);const n=e.points.length,segs=e.closed&&n>2?n:n-1;
   for(let i=0;i<segs;i++){const j=(i+1)%n,g=e.bulges?.[i]?bulgeArc(e.points[i],e.points[j],e.bulges[i]):undefined;
    if(g){const c=S(g.c);ctx.arc(c[0],c[1],g.r*v.scale,-g.a0*DEG,-(g.a0+g.sweep)*DEG,g.sweep>0);}else ctx.lineTo(p[j][0],p[j][1]);}
   if(e.closed)ctx.closePath();break;
  }
  case 'circle':{const c=S(e.center),r=e.radius*v.scale;ctx.moveTo(c[0]+r,c[1]);ctx.arc(c[0],c[1],r,0,2*Math.PI);break;}
  case 'arc':{const c=S(e.center),r=e.radius*v.scale,s=S([e.center[0]+e.radius*Math.cos(e.start*DEG),e.center[1]+e.radius*Math.sin(e.start*DEG)]);ctx.moveTo(s[0],s[1]);ctx.arc(c[0],c[1],r,-e.start*DEG,-e.end*DEG,true);break;}
  case 'ellipse':{
   const c=S(e.center),rx=Math.hypot(e.major[0],e.major[1])*v.scale,rot=-Math.atan2(e.major[1],e.major[0]),full=ellipseSweep(e)>=360,s=S(curveSamples(e)[0].p);
   ctx.moveTo(s[0],s[1]);ctx.ellipse(c[0],c[1],rx,rx*e.ratio,rot,-e.start*DEG,full?-e.start*DEG-2*Math.PI:-(e.start+ellipseSweep(e))*DEG,true);break;
  }
  case 'spline':{const p=curveSamples(e).map(q=>S(q.p));ctx.moveTo(p[0][0],p[0][1]);for(let i=1;i<p.length;i++)ctx.lineTo(p[i][0],p[i][1]);break;}
  case 'hatch':{if(e.pattern==='SOLID')break;const vb=viewBox(v);for(const [a,b] of hatchLines(e,doc.unit??'in')){if(Math.max(a[0],b[0])<vb[0]||Math.min(a[0],b[0])>vb[2]||Math.max(a[1],b[1])<vb[1]||Math.min(a[1],b[1])>vb[3])continue;const p=S(a),q=S(b);ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);}break;}
  case 'xline':case 'ray':{const pc=pieces(e as Ent)[0],vb=viewBox(v),m=(vb[2]-vb[0])*.05;if(pc.k!=='seg')break;const k=clipSegment(pc.a,pc.b,[vb[0]-m,vb[1]-m,vb[2]+m,vb[3]+m]);if(k){const a=S(k[0]),b=S(k[1]);ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);}break;}
  case 'insert':case 'xref':for(const c of children(e,doc))strokePath(ctx,v,c,doc);break;
  case 'viewport':{const a=S([e.at[0]-e.width/2,e.at[1]-e.height/2]),b=S([e.at[0]+e.width/2,e.at[1]+e.height/2]);ctx.rect(a[0],b[1],b[0]-a[0],a[1]-b[1]);break;}
  case 'dim':case 'leader':case 'table':case 'mtext':
   for(const p of primitives(e,doc)??[]){
    if(p.k==='line'){const a=S(p.a),b=S(p.b);ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);}
    else if(p.k==='arc'){const c=S(p.c),st=S([p.c[0]+p.r*Math.cos(p.s*DEG),p.c[1]+p.r*Math.sin(p.s*DEG)]);ctx.moveTo(st[0],st[1]);ctx.arc(c[0],c[1],p.r*v.scale,-p.s*DEG,-p.e*DEG,true);}
   }
   break;
 }
}
function fillShapes(ctx:CanvasRenderingContext2D,v:View,e:Ent|NewEnt,doc:Ctx){
 if(e.type==='insert'||e.type==='xref'){for(const c of children(e,doc))fillShapes(ctx,v,c,doc);return;}
 const polys=e.type==='solid'?[e.points]:isComposite(e)?(primitives(e,doc)??[]).flatMap(p=>p.k==='fill'?[p.pts]:[]):e.type==='hatch'&&e.pattern==='SOLID'?e.loops:[];
 for(const pts of polys){const p=pts.map(q=>toScreen(v,q));ctx.moveTo(p[0][0],p[0][1]);for(let i=1;i<p.length;i++)ctx.lineTo(p[i][0],p[i][1]);ctx.closePath();}
}
interface TextDraw{at:Pt;height:number;value:string;angle:number;align:number;bold:boolean;style:TextStyle}
function drawText(ctx:CanvasRenderingContext2D,v:View,t:TextDraw){
 const {at,height,value,angle,align,style}=t,bold=t.bold||!!style.bold,px=height/.716*v.scale,[x,y]=toScreen(v,at),wf=style.widthFactor||1;
 if(px<2.2){
  // Too small to read: a gray bar where the text is (greeked).
  const w=textWidthPerHeight(value,bold,style.font)*height*wf*v.scale,x0=align===1?-w/2:align===2?-w:0;
  ctx.save();ctx.translate(x,y);ctx.rotate(-angle*DEG);ctx.globalAlpha*=.45;ctx.fillRect(x0,-px*.6,w,Math.max(.8,px*.55));ctx.restore();return;
 }
 ctx.save();ctx.translate(x,y);if(angle)ctx.rotate(-angle*DEG);
 if(wf!==1)ctx.scale(wf,1);if(style.oblique)ctx.transform(1,0,-Math.tan(style.oblique*DEG),1,0,0);
 ctx.font=`${bold?700:400} ${px}px ${fonts[style.font]??fonts.Arial}`;ctx.textAlign=align===1?'center':align===2?'right':'left';ctx.textBaseline='alphabetic';
 ctx.fillText(value,0,0);ctx.restore();
}
/** The text an entity draws: its own, or its composite pieces' (dimension values, multiline text, leader notes, cells). */
function textsOf(e:Ent|NewEnt,doc:Ctx):TextDraw[]{
 if(e.type==='text')return [{at:e.at,height:e.height,value:e.value,angle:e.angle,align:e.align,bold:e.bold,style:textStyleOf(e.style,doc)}];
 if(isComposite(e))return (primitives(e,doc)??[]).flatMap(p=>p.k==='text'?[{at:p.at,height:p.height,value:p.value,angle:p.angle,align:p.align,bold:p.bold,style:textStyleOf(p.style,doc)}]:[]);
 if(e.type==='attdef')return [{at:e.at,height:e.height,value:e.tag,angle:e.angle,align:e.align,bold:false,style:textStyleOf(e.style,doc)}];
 if(e.type==='insert'||e.type==='xref')return children(e,doc).flatMap(c=>textsOf(c,doc));
 return [];
}

export interface SceneOptions{doc:CadDoc;view:View;theme:Theme;lwt:boolean;grid:number|null;underlay?:CadDoc|null}
/** The drawing itself: background, sheet, grid, underlay and every visible entity, batched by layer. */
export function drawScene(ctx:CanvasRenderingContext2D,o:SceneOptions){
 const {doc,view:v,theme}=o,c=themeColors(theme),vb=viewBox(v);
 ctx.fillStyle=c.bg;ctx.fillRect(0,0,v.w,v.h);
 const s0=toScreen(v,[0,doc.height]),s1=toScreen(v,[doc.width,0]);
 if(doc.space==='model'){/* model space has no sheet edge */}
 else if(theme==='paper'){ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(s0[0]+4,s0[1]+4,s1[0]-s0[0],s1[1]-s0[1]);ctx.fillStyle=c.sheet;ctx.fillRect(s0[0],s0[1],s1[0]-s0[0],s1[1]-s0[1]);}
 else{ctx.strokeStyle=c.sheet;ctx.lineWidth=1;ctx.setLineDash([]);ctx.strokeRect(s0[0]+.5,s0[1]+.5,s1[0]-s0[0],s1[1]-s0[1]);}
 if(o.grid){
  let g=o.grid;while(g*v.scale<8)g*=g*v.scale<3?10:2;
  ctx.strokeStyle=c.grid;ctx.lineWidth=1;ctx.beginPath();
  const lim:Box=doc.space==='model'?vb:[0,0,doc.width,doc.height],x0=Math.max(lim[0],Math.floor(vb[0]/g)*g),x1=Math.min(lim[2],vb[2]),y0=Math.max(lim[1],Math.floor(vb[1]/g)*g),y1=Math.min(lim[3],vb[3]);
  const t0=toScreen(v,[lim[0],lim[3]]),t1=toScreen(v,[lim[2],lim[1]]);
  for(let x=x0;x<=x1;x+=g){const p=toScreen(v,[x,0]);ctx.moveTo(Math.round(p[0])+.5,Math.max(0,t0[1]));ctx.lineTo(Math.round(p[0])+.5,Math.min(v.h,t1[1]));}
  for(let y=y0;y<=y1;y+=g){const p=toScreen(v,[0,y]);ctx.moveTo(Math.max(0,t0[0]),Math.round(p[1])+.5);ctx.lineTo(Math.min(v.w,t1[0]),Math.round(p[1])+.5);}
  ctx.stroke();
 }
 if(o.underlay){
  ctx.strokeStyle=c.underlay;ctx.fillStyle=c.underlay;ctx.lineWidth=1;ctx.setLineDash([]);ctx.beginPath();
  for(const e of spatialIndex(o.underlay.entities,o.underlay).query(vb))strokePath(ctx,v,e,doc);
  ctx.stroke();
 }
 drawEntities(ctx,doc.entities,o,vb);
 ctx.setLineDash([]);
}

/** True when an object's extents are under a pixel on screen. */
export const isDot=(b:Box,scale:number)=>(b[2]-b[0])*scale<1&&(b[3]-b[1])*scale<1;
/** Entities batched by layer and object properties; viewports draw what they show, clipped, before their border. */
function drawEntities(ctx:CanvasRenderingContext2D,ents:Ent[],o:SceneOptions,vb:Box){
 const {doc,view:v,theme}=o;
 for(const e of ents)if(e.type==='viewport'&&doc.layers.find(l=>l.name===e.layer)?.visible!==false&&overlaps(cachedBox(e,doc),vb)){
  const a=toScreen(v,[e.at[0]-e.width/2,e.at[1]+e.height/2]),b=toScreen(v,[e.at[0]+e.width/2,e.at[1]-e.height/2]);
  ctx.save();ctx.beginPath();ctx.rect(a[0],a[1],b[0]-a[0],b[1]-a[1]);ctx.clip();
  const inner:Box=[Math.max(vb[0],e.at[0]-e.width/2),Math.max(vb[1],e.at[1]-e.height/2),Math.min(vb[2],e.at[0]+e.width/2),Math.min(vb[3],e.at[1]+e.height/2)];
  drawEntities(ctx,viewportContents(e,doc),o,inner);ctx.restore();
 }
 const byLayer=new Map<string,Ent[]>();
 const names=new Set(doc.layers.map(l=>l.name)),put=(e:Ent,layer:string)=>{let list=byLayer.get(layer);if(!list)byLayer.set(layer,list=[]);list.push(e);};
 for(const e of spatialIndex(ents,doc).query(vb)){
  // A reference draws its children on their own layers (layers this drawing lacks fall back to the reference's).
  if(e.type==='insert'||e.type==='xref'){for(const c of children(e,doc))if(overlaps(cachedBox(c,doc),vb))put(c,names.has(c.layer)?c.layer:e.layer);continue;}
  put(e,e.layer);
 }
 for(const layer of doc.layers){
  const all=byLayer.get(layer.name);if(!layer.visible||!all?.length)continue;
  // Objects with their own color, linetype or lineweight draw in their own batch.
  const batches=new Map<string,Ent[]>();
  for(const e of all){const k=e.color===undefined&&e.ltype===undefined&&e.weight===undefined&&e.ltscale===undefined?'':`${e.color}|${e.ltype}|${e.weight}|${e.ltscale}`;let b=batches.get(k);if(!b)batches.set(k,b=[]);b.push(e);}
  for(const list of batches.values()){
   const f=effective(list[0],layer),color=layerColor(f.color,theme,doc.plotStyle);
   ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=o.lwt?Math.max(1,f.weight/24):1;ctx.lineCap='round';ctx.lineJoin='round';
   const dash=dashPattern(f.ltype,doc.unit,f.ltscale*(doc.ltscale??1)).map(d=>d*v.scale),longest=Math.max(0,...dash);
   ctx.setLineDash(dash.length&&longest>=1.5?dash.map(d=>Math.max(d,.01)):[]);
   // Objects smaller than a pixel at this zoom draw as a dot (as AutoCAD's display does), not as their geometry.
   const dots:Ent[]=[],full:Ent[]=[];for(const e of list)(isDot(cachedBox(e,doc),v.scale)?dots:full).push(e);
   ctx.beginPath();for(const e of full)if(e.type!=='text'&&e.type!=='solid')strokePath(ctx,v,e,doc);ctx.stroke();
   ctx.setLineDash([]);
   if(dots.length){ctx.beginPath();for(const e of dots){const b=cachedBox(e,doc),p=toScreen(v,[(b[0]+b[2])/2,(b[1]+b[3])/2]);ctx.rect(Math.floor(p[0]),Math.floor(p[1]),1,1);}ctx.fill();}
   ctx.beginPath();for(const e of full)if(e.type==='solid'||isComposite(e))fillShapes(ctx,v,e,doc);ctx.fill();
   // Solid hatches fill by the even-odd rule, one at a time so islands stay open.
   for(const e of full)if(e.type==='hatch'&&e.pattern==='SOLID'){ctx.beginPath();fillShapes(ctx,v,e,doc);ctx.fill('evenodd');}
   for(const e of full)for(const t of textsOf(e,doc))drawText(ctx,v,t);
  }
 }
 ctx.setLineDash([]);
}

export interface OverlayOptions{
 doc:CadDoc;view:View;theme:Theme;
 selected:Ent[];hover?:Ent;preview?:NewEnt[];rubber?:[Pt,Pt];
 window?:{a:Pt;b:Pt};grips?:Grip[];hot?:Pt;snap?:{kind:SnapKind;p:Pt};
 cursor?:[number,number];crosshair:boolean;tip?:string;pickbox:number;
 /** Tracking paths (dotted), acquired tracking points (small crosses) and a fence being drawn. */
 tracks?:[Pt,Pt][];acquired?:Pt[];fence?:Pt[];
 /** The base point of a block being edited. */
 basePoint?:Pt;
}
export const snapNames:Record<SnapKind,string>={end:'Endpoint',mid:'Midpoint',cen:'Center',qua:'Quadrant',int:'Intersection',per:'Perpendicular',nea:'Nearest',ins:'Insertion',grid:'Grid',nod:'Node',tan:'Tangent',ext:'Extension',par:'Parallel',app:'Apparent intersection',trk:'Tracking'};
/** Everything that follows the cursor: selection highlight, hover, preview, window, grips, snap marker, crosshair. */
export function drawOverlay(ctx:CanvasRenderingContext2D,o:OverlayOptions){
 const {doc,view:v,theme}=o,c=themeColors(theme),vb=viewBox(v);
 ctx.clearRect(0,0,v.w,v.h);ctx.lineCap='round';ctx.lineJoin='round';
 const outline=(list:(Ent|NewEnt)[],color:string,width:number,dash:number[])=>{
  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();
  for(const e of list){
   if(!overlaps(cachedBox(e,doc),vb))continue;
   if(e.type==='text'||e.type==='mtext'){for(const box of e.type==='text'?[textBox(e,doc)]:compositeBoxes(e as Ent,doc)){const b=box.map(p=>toScreen(v,p));ctx.moveTo(b[0][0],b[0][1]);for(let i=1;i<4;i++)ctx.lineTo(b[i][0],b[i][1]);ctx.closePath();}}
   else if(e.type==='hatch'){for(const l of e.loops){const b=l.map(p=>toScreen(v,p));ctx.moveTo(b[0][0],b[0][1]);for(const q of b.slice(1))ctx.lineTo(q[0],q[1]);ctx.closePath();}}
   else if(e.type==='solid')fillShapes(ctx,v,e,doc);
   else strokePath(ctx,v,e,doc);
  }
  ctx.stroke();ctx.setLineDash([]);
 };
 if(o.selected.length)outline(o.selected.filter(e=>overlaps(cachedBox(e,doc),vb)).slice(0,4000),c.select,1.6,[6,4]);
 if(o.hover)outline([o.hover],c.hover,4,[]);
 if(o.preview?.length){
  outline(o.preview,c.preview,1.2,[]);
  ctx.strokeStyle=c.preview;ctx.lineWidth=1;ctx.beginPath();for(const e of o.preview)if(e.type==='hatch')strokePath(ctx,v,e,doc);ctx.stroke();
  ctx.fillStyle=c.preview;ctx.beginPath();for(const e of o.preview)if(e.type==='solid'||isComposite(e))fillShapes(ctx,v,e,doc);ctx.fill();
  for(const e of o.preview)if(e.type==='hatch'&&e.pattern==='SOLID'){ctx.globalAlpha=.35;ctx.beginPath();fillShapes(ctx,v,e,doc);ctx.fill('evenodd');ctx.globalAlpha=1;}
  for(const e of o.preview)for(const t of textsOf(e,doc))drawText(ctx,v,t);
 }
 if(o.rubber){const a=toScreen(v,o.rubber[0]),b=toScreen(v,o.rubber[1]);ctx.strokeStyle=c.preview;ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();ctx.setLineDash([]);}
 if(o.window){
  const a=toScreen(v,o.window.a),b=toScreen(v,o.window.b),crossing=b[0]<a[0];
  ctx.fillStyle=crossing?'rgba(70,200,110,.16)':'rgba(70,130,255,.16)';ctx.strokeStyle=crossing?'#46c86e':'#4682ff';ctx.lineWidth=1;ctx.setLineDash(crossing?[5,4]:[]);
  ctx.fillRect(Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]));ctx.strokeRect(Math.min(a[0],b[0])+.5,Math.min(a[1],b[1])+.5,Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]));ctx.setLineDash([]);
 }
 if(o.tracks?.length||o.acquired?.length){
  ctx.strokeStyle=c.snap;ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.beginPath();
  for(const [a,b] of o.tracks??[]){const k=clipSegment(a,b,vb);if(!k)continue;const p=toScreen(v,k[0]),q=toScreen(v,k[1]);ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);}
  ctx.stroke();ctx.setLineDash([]);ctx.lineWidth=1.5;ctx.beginPath();
  for(const a of o.acquired??[]){const [x,y]=toScreen(v,a);ctx.moveTo(x-4,y);ctx.lineTo(x+4,y);ctx.moveTo(x,y-4);ctx.lineTo(x,y+4);}
  ctx.stroke();
 }
 if(o.basePoint){const [x,y]=toScreen(v,o.basePoint);ctx.strokeStyle=c.select;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-12,y);ctx.lineTo(x+12,y);ctx.moveTo(x,y-12);ctx.lineTo(x,y+12);ctx.moveTo(x+5,y);ctx.arc(x,y,5,0,2*Math.PI);ctx.stroke();}
 if(o.fence&&o.fence.length>1){const p=o.fence.map(q=>toScreen(v,q));ctx.strokeStyle=c.preview;ctx.lineWidth=1;ctx.setLineDash([6,3]);ctx.beginPath();ctx.moveTo(p[0][0],p[0][1]);for(const q of p.slice(1))ctx.lineTo(q[0],q[1]);ctx.stroke();ctx.setLineDash([]);}
 if(o.grips?.length){
  for(const g of o.grips){const [x,y]=toScreen(v,g.p);if(x<-8||y<-8||x>v.w+8||y>v.h+8)continue;const hot=o.hot&&Math.abs(o.hot[0]-g.p[0])<1e-12&&Math.abs(o.hot[1]-g.p[1])<1e-12;
   ctx.fillStyle=hot?'#ff3b30':'#2b7bff';ctx.fillRect(x-4,y-4,8,8);ctx.strokeStyle=theme==='dark'?'#dbe9ff':'#ffffff';ctx.lineWidth=1;ctx.strokeRect(x-4.5,y-4.5,9,9);}
 }
 if(o.snap){
  const [x,y]=toScreen(v,o.snap.p),r=6;ctx.strokeStyle=c.snap;ctx.lineWidth=2;ctx.beginPath();
  switch(o.snap.kind){
   case 'end':ctx.rect(x-r,y-r,2*r,2*r);break;
   case 'mid':ctx.moveTo(x,y-r);ctx.lineTo(x+r,y+r*.8);ctx.lineTo(x-r,y+r*.8);ctx.closePath();break;
   case 'cen':ctx.arc(x,y,r,0,2*Math.PI);break;
   case 'qua':ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);ctx.closePath();break;
   case 'int':ctx.moveTo(x-r,y-r);ctx.lineTo(x+r,y+r);ctx.moveTo(x+r,y-r);ctx.lineTo(x-r,y+r);break;
   case 'per':ctx.moveTo(x-r,y-r);ctx.lineTo(x-r,y+r);ctx.lineTo(x+r,y+r);ctx.moveTo(x-r,y);ctx.lineTo(x,y);ctx.lineTo(x,y+r);break;
   case 'nea':ctx.moveTo(x-r,y-r);ctx.lineTo(x+r,y-r);ctx.lineTo(x-r,y+r);ctx.lineTo(x+r,y+r);ctx.closePath();break;
   case 'ins':ctx.rect(x-r,y-r,2*r,2*r);ctx.moveTo(x-r,y);ctx.lineTo(x+r,y);break;
   case 'grid':case 'trk':ctx.moveTo(x-r,y);ctx.lineTo(x+r,y);ctx.moveTo(x,y-r);ctx.lineTo(x,y+r);break;
   case 'nod':ctx.arc(x,y,r,0,2*Math.PI);ctx.moveTo(x-r*.7,y-r*.7);ctx.lineTo(x+r*.7,y+r*.7);ctx.moveTo(x+r*.7,y-r*.7);ctx.lineTo(x-r*.7,y+r*.7);break;
   case 'tan':ctx.arc(x,y,r*.8,0,2*Math.PI);ctx.moveTo(x-r,y-r);ctx.lineTo(x+r,y-r);break;
   case 'ext':ctx.moveTo(x-r,y);ctx.lineTo(x-r*.5,y);ctx.moveTo(x-r*.15,y);ctx.lineTo(x+r*.15,y);ctx.moveTo(x+r*.5,y);ctx.lineTo(x+r,y);break;
   case 'par':ctx.moveTo(x-r,y+r*.4);ctx.lineTo(x+r*.2,y-r);ctx.moveTo(x-r*.2,y+r);ctx.lineTo(x+r,y-r*.4);break;
   case 'app':ctx.rect(x-r,y-r,2*r,2*r);ctx.moveTo(x-r*.7,y-r*.7);ctx.lineTo(x+r*.7,y+r*.7);ctx.moveTo(x+r*.7,y-r*.7);ctx.lineTo(x-r*.7,y+r*.7);break;
  }
  ctx.stroke();
  if(o.cursor)tip(ctx,o.cursor[0]+14,o.cursor[1]+22,snapNames[o.snap.kind],c);
 }
 if(o.cursor&&o.crosshair){
  const [x,y]=o.cursor;ctx.strokeStyle=c.crosshair;ctx.lineWidth=1;ctx.beginPath();
  ctx.moveTo(0,Math.round(y)+.5);ctx.lineTo(v.w,Math.round(y)+.5);ctx.moveTo(Math.round(x)+.5,0);ctx.lineTo(Math.round(x)+.5,v.h);ctx.stroke();
  const p=o.pickbox;ctx.strokeStyle=theme==='dark'?'#ffffff':'#14202b';ctx.strokeRect(Math.round(x-p)+.5,Math.round(y-p)+.5,2*p,2*p);
 }
 if(o.cursor&&o.tip)tip(ctx,o.cursor[0]+14,o.cursor[1]-(o.snap?28:14),o.tip,c);
}
function tip(ctx:CanvasRenderingContext2D,x:number,y:number,text:string,c:ReturnType<typeof themeColors>){
 ctx.font='12px "DM Sans", Arial, sans-serif';const w=ctx.measureText(text).width+10;
 const X=Math.min(x,ctx.canvas.clientWidth-w-4);
 ctx.fillStyle=c.tip;ctx.strokeStyle='rgba(120,140,160,.6)';ctx.lineWidth=1;ctx.fillRect(X,y-14,w,19);ctx.strokeRect(X+.5,y-13.5,w-1,18);
 ctx.fillStyle=c.tipText;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(text,X+5,y-4.5);
}

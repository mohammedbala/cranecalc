/**
 * The CAD editor's drawing model: entities on layers in drawing units (paper inches or millimeters for the issued
 * sheets, sketch units for the engineering sketches), y up, origin at the lower-left corner of the sheet.
 */
import {hatchSegments,insideLoops} from './hatch';
import {children,type BlockDef} from './blocks';
import {fonts,mtextLayout,primEnts,primTextBox,primitives,textStyleOf,type Ctx,type DimStyle,type TextStyle} from './annotation';
import {bulgeArc,bulgePoint,bulgeThrough,ellipseParam,ellipsePoint,splineParam,splineParams,splinePoint,splineRange,splineThrough,subBulge,subSpline,type BulgeArc,type SplineGeom} from './curves';

export type Pt=[number,number];
export type Align=0|1|2;
export type LineType='Continuous'|'DASHED'|'CENTER'|'HIDDEN'|'PHANTOM'|'DASHDOT'|'DOT'|'BORDER'|'DIVIDE'|'DASHED2'|'HIDDEN2'|'CENTER2';
export const lineTypes:LineType[]=['Continuous','DASHED','HIDDEN','CENTER','PHANTOM','DASHDOT','DOT','BORDER','DIVIDE','DASHED2','HIDDEN2','CENTER2'];
export interface CadLayer{name:string;color:number;ltype:LineType;weight:number;visible:boolean;locked:boolean}

/** Object properties: color (AutoCAD color index), linetype and lineweight (1/100 mm) are ByLayer when unset. */
export interface EntProps{layer:string;color?:number;ltype?:LineType;weight?:number;ltscale?:number;
 /** Annotative (model space text, dimensions, leaders): drawn at one paper size in every viewport. */
 annotative?:boolean}
interface Base extends EntProps{id:number}
export interface LineEnt extends Base{type:'line';a:Pt;b:Pt}
/** bulges[i] is the bulge of the segment from point i to the next (tan of a quarter of its sweep; 0 straight). */
export interface PolyEnt extends Base{type:'poly';points:Pt[];closed:boolean;bulges?:number[]}
/** An ellipse or elliptical arc: major is the vector from the center to the end of the major axis; start and end are parameters in degrees. */
export interface EllipseEnt extends Base{type:'ellipse';center:Pt;major:Pt;ratio:number;start:number;end:number}
/** A B-spline (control points and clamped knots); fit keeps the points it was drawn through. */
export interface SplineEnt extends Base{type:'spline';degree:number;ctrl:Pt[];knots:number[];fit?:Pt[];closed:boolean}
/** A construction line through base along dir (unit), infinite both ways (xline) or one way (ray). */
export interface XlineEnt extends Base{type:'xline'|'ray';base:Pt;dir:Pt}
/** A hatch: closed boundary loops (filled by the even-odd rule) with a pattern at a scale and angle about an origin. */
export interface HatchEnt extends Base{type:'hatch';loops:Pt[][];pattern:string;scale:number;angle:number;origin?:Pt}
/** A filled triangle or quadrilateral (arrowheads, dots). */
export interface SolidEnt extends Base{type:'solid';points:Pt[]}
export interface CircleEnt extends Base{type:'circle';center:Pt;radius:number}
/** Counterclockwise from start to end, degrees from +x. */
export interface ArcEnt extends Base{type:'arc';center:Pt;radius:number;start:number;end:number}
/** height is the cap height; at is the baseline anchor (left, center or right by align). */
export interface TextEnt extends Base{type:'text';at:Pt;height:number;value:string;angle:number;align:Align;bold:boolean;style?:string}
/** A dimension measuring a to b; at is a point on the dimension line. */
/**
 * A dimension: linear (horizontal, vertical, aligned) measures a to b with its line through at; angular measures the
 * angle at c between a and b with its arc through at; radius and diameter measure the circle at c through a, text at at;
 * ordinate measures a's x or y from the datum c, leader ending at at. text overrides the value; style names a dimension style.
 */
export interface DimEnt extends Base{type:'dim';kind:'aligned'|'horizontal'|'vertical'|'angular'|'radius'|'diameter'|'ordinate';a:Pt;b:Pt;at:Pt;height:number;text?:string;c?:Pt;style?:string;axis?:'x'|'y'}
/** Multiline text: wrapped to width (0: no wrap), lines split at newlines, placed by attach (1-9: top, middle, bottom rows; left, center, right). */
export interface MTextEnt extends Base{type:'mtext';at:Pt;width:number;height:number;value:string;angle:number;attach:number;style?:string;spacing?:number;bold?:boolean}
/** A leader: arrow at the first point, through the others, with text after a landing at the last. */
export interface LeaderEnt extends Base{type:'leader';points:Pt[];value:string;height:number;arrow?:'closed'|'open'|'tick'|'dot'|'none';landing?:boolean;style?:string}
/** A table: top-left corner, column widths, row heights (going down), cell text; header rows are bold. */
export interface TableEnt extends Base{type:'table';at:Pt;cols:number[];rows:number[];cells:string[][];height:number;header?:number;align?:('left'|'center'|'right')[];title?:string;source?:string}
/** An attribute definition: a tagged value a block's references fill in (shown as its tag outside a block). */
export interface AttDefEnt extends Base{type:'attdef';tag:string;prompt:string;value:string;at:Pt;height:number;angle:number;align:Align;invisible?:boolean;style?:string}
/** A block reference: the named block placed at at, scaled, rotated (degrees) and mirrored, with attribute values by tag. */
export interface InsertEnt extends Base{type:'insert';name:string;at:Pt;scale:number;rotation:number;mirror?:boolean;attribs?:Record<string,string>}
/** An external reference: another drawing of the project (by its number) placed at at, scaled and rotated. */
export interface XrefEnt extends Base{type:'xref';name:string;at:Pt;scale:number;rotation:number}
/** A layout viewport: a window on the sheet (center at, width × height, paper units) onto model space centered at view, at scale (paper units per model unit). */
export interface ViewportEnt extends Base{type:'viewport';at:Pt;width:number;height:number;view:Pt;scale:number;frozen?:string[];locked?:boolean}
export type Ent=LineEnt|PolyEnt|SolidEnt|CircleEnt|ArcEnt|TextEnt|DimEnt|EllipseEnt|SplineEnt|XlineEnt|HatchEnt|MTextEnt|LeaderEnt|TableEnt|AttDefEnt|InsertEnt|XrefEnt|ViewportEnt;
/** Model space of a layout: real-size entities (inches or millimeters) and the annotation scale they are drafted at. */
export interface ModelSpace{entities:Ent[];nextId:number;annoScale:number}
/** An entity before it has an id. */
export type NewEnt=Ent extends infer E?E extends Ent?Omit<E,'id'>:never:never;

export interface CadDoc{
 /** The drawing it was made from: a sheet number (S-02) or a sketch number (SK-01). */
 key:string;title:string;
 /** Coordinate unit: paper inches or millimeters for sheets, sketch units for sketches. */
 unit:'in'|'mm'|'unit';
 /** Lengths are shown in feet-inches (US) or millimeters (SI). */
 display:'US'|'SI';
 /** Real millimeters per drawing unit for dimensions and distances (the drawing scale). */
 realPerUnit:number;
 /** Sheet extents in drawing units; the SVG of the sheet has width/svgScale by height/svgScale user units. */
 width:number;height:number;svgScale:number;
 layers:CadLayer[];entities:Ent[];nextId:number;
 /** Named groups: picking one member selects the group. */
 groups?:CadGroup[];
 /** Text and dimension styles (Standard when absent), the global linetype scale and the plot style. */
 textStyles?:TextStyle[];dimStyles?:DimStyle[];ltscale?:number;plotStyle?:'monochrome'|'grayscale'|'color';
 /** Block definitions, by name. */
 blocks?:BlockDef[];
 /** Model space behind the layout's viewports. */
 model?:ModelSpace;
 /** Page setup for plotting. */
 pageSetup?:{lineweights?:boolean};
 /** Set on model space while it is open on the Model tab (not stored): the annotation scale it is drafted at. */
 space?:'model';annoScale?:number;
}
export type {BlockDef};
export type {Ctx,DimStyle,TextStyle};
export interface CadGroup{name:string;ids:number[]}
/** Color, linetype and lineweight as drawn: the object's own, else its layer's. */
export const effective=(e:EntProps,l?:CadLayer)=>({color:e.color??l?.color??7,ltype:e.ltype??l?.ltype??'Continuous' as LineType,weight:e.weight??l?.weight??25,ltscale:e.ltscale??1});
/** An entity's own properties, to carry onto the pieces made from it. */
export const propsOf=(e:EntProps):EntProps=>{const o:EntProps={layer:e.layer};if(e.color!==undefined)o.color=e.color;if(e.ltype!==undefined)o.ltype=e.ltype;if(e.weight!==undefined)o.weight=e.weight;if(e.ltscale!==undefined)o.ltscale=e.ltscale;return o;};

export const DEG=Math.PI/180;
/** Drawing units per paper inch: patterns and linetypes are defined in inches. */
export const unitScale=(unit:CadDoc['unit'])=>unit==='in'?1:unit==='mm'?25.4:72;
const hatchCache=new WeakMap<object,{unit:string;segs:[Pt,Pt][]}>();
/** A hatch's pattern lines in drawing units (cached: entities are immutable). */
export function hatchLines(e:Omit<HatchEnt,'id'>,unit:CadDoc['unit']):[Pt,Pt][]{
 const c=hatchCache.get(e);if(c&&c.unit===unit)return c.segs;
 const segs=hatchSegments(e,unitScale(unit));hatchCache.set(e,{unit,segs});return segs;
}
export const add=(a:Pt,b:Pt):Pt=>[a[0]+b[0],a[1]+b[1]];
export const sub=(a:Pt,b:Pt):Pt=>[a[0]-b[0],a[1]-b[1]];
export const mul=(a:Pt,k:number):Pt=>[a[0]*k,a[1]*k];
export const dot=(a:Pt,b:Pt)=>a[0]*b[0]+a[1]*b[1];
export const cross=(a:Pt,b:Pt)=>a[0]*b[1]-a[1]*b[0];
export const len=(a:Pt)=>Math.hypot(a[0],a[1]);
export const dist=(a:Pt,b:Pt)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export const lerp=(a:Pt,b:Pt,t:number):Pt=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
export const mid=(a:Pt,b:Pt):Pt=>lerp(a,b,.5);
export const polar=(c:Pt,r:number,deg:number):Pt=>[c[0]+r*Math.cos(deg*DEG),c[1]+r*Math.sin(deg*DEG)];
export const angleOf=(a:Pt,b:Pt)=>Math.atan2(b[1]-a[1],b[0]-a[0])/DEG;
export const norm360=(a:number)=>((a%360)+360)%360;
/** Counterclockwise sweep from start to end, in (0, 360]. */
export const sweep=(start:number,end:number)=>{const s=norm360(end-start);return s===0?360:s;};
export const onArc=(deg:number,start:number,end:number,tol=1e-9)=>norm360(deg-start)<=sweep(start,end)+tol;
export const arcPoint=(e:{center:Pt;radius:number},deg:number)=>polar(e.center,e.radius,deg);
export const close=(a:Pt,b:Pt,tol=1e-9)=>Math.abs(a[0]-b[0])<=tol&&Math.abs(a[1]-b[1])<=tol;

// ---- text extents ------------------------------------------------------------------------------------------------
let measureCtx:CanvasRenderingContext2D|null|undefined;
const widthCache=new Map<string,number>();
/** Width of the text in units of its cap height (cap height 0.716 em), in Arial unless another font is named. */
export function textWidthPerHeight(value:string,bold:boolean,font='Arial'){
 const key=(bold?'b':'r')+(font==='Arial'?'':font+'|')+value;let w=widthCache.get(key);if(w!==undefined)return w;
 if(measureCtx===undefined){try{measureCtx=typeof document!=='undefined'?document.createElement('canvas').getContext('2d'):null;}catch{measureCtx=null;}}
 if(measureCtx){measureCtx.font=`${bold?700:400} 100px ${fonts[font]??fonts.Arial}`;w=measureCtx.measureText(value).width/71.6;}
 else w=value.length*(bold?.62:.56)/.716;
 if(widthCache.size>20000)widthCache.clear();
 widthCache.set(key,w);return w;
}
/** The four corners of a text's box: baseline-left, baseline-right, top-right, top-left (descenders included). */
export function textBox(e:Omit<TextEnt,'id'>,ctx?:Partial<Pick<CadDoc,'textStyles'>>):Pt[]{
 const st=textStyleOf(e.style,ctx),w=textWidthPerHeight(e.value,e.bold||!!st.bold,st.font)*e.height*st.widthFactor,x0=e.align===1?-w/2:e.align===2?-w:0,lo=-.28*e.height,hi=1.12*e.height;
 const c=Math.cos(e.angle*DEG),s=Math.sin(e.angle*DEG),at=(x:number,y:number):Pt=>[e.at[0]+x*c-y*s,e.at[1]+x*s+y*c];
 return [at(x0,lo),at(x0+w,lo),at(x0+w,hi),at(x0,hi)];
}

// ---- dimensions --------------------------------------------------------------------------------------------------
/** A length in real millimeters as a drawing reads it: feet-inches to 1/16 in (US) or whole millimeters (SI). */
export function formatLength(mm:number,display:'US'|'SI'){
 if(display==='SI')return `${Math.round(mm)}`;
 const sixteenths=Math.round(Math.abs(mm)/25.4*16),sign=mm<0?'-':'';
 const ft=Math.floor(sixteenths/192),rest=sixteenths-ft*192,inch=Math.floor(rest/16);let f=rest-inch*16,d=16;
 while(f&&f%2===0){f/=2;d/=2;}
 const frac=f?`${inch||ft?`${inch} `:''}${f}/${d}`:`${inch}`;
 return ft?`${sign}${ft}'-${frac}"`:`${sign}${frac}"`;
}
export interface DimGeometry{lines:[Pt,Pt][];arcs:{c:Pt;r:number;s:number;e:number}[];arrows:Pt[][];text:{at:Pt;angle:number;value:string;height:number}}
/** Extension lines, dimension line or arc, arrowheads and text of a dimension. */
export function dimGeometry(e:DimEnt,doc:Ctx):DimGeometry{
 const prims=primitives(e,doc)!,t=prims.find(p=>p.k==='text') as {at:Pt;angle:number;value:string;height:number}|undefined;
 return {lines:prims.flatMap(p=>p.k==='line'?[[p.a,p.b] as [Pt,Pt]]:[]),arcs:prims.flatMap(p=>p.k==='arc'?[{c:p.c,r:p.r,s:p.s,e:p.e}]:[]),arrows:prims.flatMap(p=>p.k==='fill'?[p.pts]:[]),
  text:t?{at:t.at,angle:t.angle,value:t.value,height:t.height}:{at:e.at,angle:0,value:'',height:e.height}};
}
/** An attribute definition read as the text of its tag. */
export const attdefAsText=(a:Omit<AttDefEnt,'id'>):Omit<TextEnt,'id'>=>({type:'text',layer:a.layer,at:a.at,height:a.height,value:a.tag,angle:a.angle,align:a.align,bold:false,...(a.style?{style:a.style}:{})});
/** Whether an entity is drawn from primitives (dimensions, multiline text, leaders, tables). */
export const isComposite=(e:{type:string}):e is DimEnt|MTextEnt|LeaderEnt|TableEnt=>e.type==='dim'||e.type==='mtext'||e.type==='leader'||e.type==='table';
/** Text boxes of a composite entity's text. */
export function compositeBoxes(e:Ent,ctx:Ctx):Pt[][]{
 if(e.type==='mtext')return [mtextLayout(e,ctx).box];
 return (primitives(e,ctx)??[]).flatMap(p=>p.k==='text'?[primTextBox(p,ctx)]:[]);
}

// ---- pieces: every entity as straight segments and circular arcs -------------------------------------------------
/** A straight segment, or a counterclockwise circular arc from s to e degrees (a full circle when the sweep is 360). */
export type Piece={k:'seg';a:Pt;b:Pt}|{k:'arc';c:Pt;r:number;s:number;e:number};
/** Half-length of a construction line in drawing units: far beyond any sheet. */
export const XLINE_REACH=1e6;
/** Sweep of an ellipse in parameter degrees, in (0, 360]. */
export const ellipseSweep=(e:{start:number;end:number})=>{const s=norm360(e.end-e.start);return s<1e-9?360:s;};
const polyCount=(e:PolyEnt)=>e.points.length<2?0:e.points.length-1+(e.closed&&e.points.length>2?1:0);
const bulgeOf=(e:PolyEnt,i:number)=>e.bulges?.[i]??0;
const polyEnds=(e:PolyEnt,i:number):[Pt,Pt]=>[e.points[i],e.points[(i+1)%e.points.length]];
/** Points along an ellipse or spline with their parameters (relative to the start for ellipses). */
export function curveSamples(e:Omit<EllipseEnt,'id'>|Omit<SplineEnt,'id'>):{p:Pt;t:number}[]{
 if(e.type==='ellipse'){const sw=ellipseSweep(e),n=Math.max(8,Math.ceil(sw/2)),out=[];for(let i=0;i<=n;i++){const t=sw*i/n;out.push({p:ellipsePoint(e,e.start+t),t});}return out;}
 return splineParams(e,24).map(t=>({p:splinePoint(e,t),t}));
}
/** A polyline's outline as points in order, arc segments as chords about every 5 degrees (closed: no repeated start). */
export function polyOutline(e:PolyEnt):Pt[]{
 const out:Pt[]=[e.points[0]],n=polyCount(e);
 for(let i=0;i<n;i++){const [a,b]=polyEnds(e,i),bg=bulgeOf(e,i),m=bg?Math.max(2,Math.ceil(Math.abs(4*Math.atan(bg)/DEG)/5)):1;for(let j=1;j<=m;j++)out.push(bulgePoint(a,b,bg,j/m));}
 if(e.closed&&e.points.length>2)out.pop();
 return out;
}
const arcPiece=(k:BulgeArc):Piece=>k.sweep>0?{k:'arc',c:k.c,r:k.r,s:k.a0,e:k.a0+k.sweep}:{k:'arc',c:k.c,r:k.r,s:k.a0+k.sweep,e:k.a0};
export function pieces(e:Ent,doc?:Ctx):Piece[]{
 const segs=(pts:Pt[]):Piece[]=>{const s:Piece[]=[];for(let i=1;i<pts.length;i++)s.push({k:'seg',a:pts[i-1],b:pts[i]});return s;};
 switch(e.type){
  case 'line':return [{k:'seg',a:e.a,b:e.b}];
  case 'poly':{const out:Piece[]=[];for(let i=0;i<polyCount(e);i++){const [a,b]=polyEnds(e,i),k=bulgeArc(a,b,bulgeOf(e,i));out.push(k?arcPiece(k):{k:'seg',a,b});}return out;}
  case 'solid':{const p=e.points;return p.map((v,i)=>({k:'seg',a:v,b:p[(i+1)%p.length]}));}
  case 'circle':return [{k:'arc',c:e.center,r:e.radius,s:0,e:360}];
  case 'arc':return [{k:'arc',c:e.center,r:e.radius,s:e.start,e:e.start+sweep(e.start,e.end)}];
  case 'ellipse':case 'spline':return segs(curveSamples(e).map(s=>s.p));
  case 'xline':return [{k:'seg',a:add(e.base,mul(e.dir,-XLINE_REACH)),b:add(e.base,mul(e.dir,XLINE_REACH))}];
  case 'ray':return [{k:'seg',a:e.base,b:add(e.base,mul(e.dir,XLINE_REACH))}];
  case 'dim':case 'leader':case 'table':return (primitives(e,doc??{display:'US',realPerUnit:1})??[]).flatMap((p):Piece[]=>p.k==='line'?[{k:'seg',a:p.a,b:p.b}]:p.k==='arc'?[{k:'arc',c:p.c,r:p.r,s:p.s,e:p.e}]:[]);
  case 'mtext':case 'attdef':return [];
  case 'insert':case 'xref':return children(e,doc??{}).flatMap(c=>pieces(c,doc));
  case 'viewport':{const [x0,y0,x1,y1]=[e.at[0]-e.width/2,e.at[1]-e.height/2,e.at[0]+e.width/2,e.at[1]+e.height/2],c:Pt[]=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];return c.map((a,i)=>({k:'seg' as const,a,b:c[(i+1)%4]}));}
  case 'hatch':return e.loops.flatMap(l=>l.map((a,i)=>({k:'seg' as const,a,b:l[(i+1)%l.length]})));
  case 'text':return [];
 }
}
const pieceSweep=(p:Extract<Piece,{k:'arc'}>)=>sweep(p.s,p.e);
const onPiece=(p:Extract<Piece,{k:'arc'}>,q:Pt)=>pieceSweep(p)>=360-1e-9||onArc(angleOf(p.c,q),p.s,p.e,1e-7);
/** Chords of an arc piece, about every 5 degrees. */
export function arcChords(p:Extract<Piece,{k:'arc'}>,step=5):Pt[]{const sw=pieceSweep(p),n=Math.max(2,Math.ceil(sw/step)),out:Pt[]=[];for(let i=0;i<=n;i++)out.push(polar(p.c,p.r,p.s+sw*i/n));return out;}
export function pieceNearest(pc:Piece,p:Pt):Pt{
 if(pc.k==='seg')return nearestOnSegment(p,pc.a,pc.b).point;
 const a=angleOf(pc.c,p);if(onArc(a,pc.s,pc.e))return polar(pc.c,pc.r,a);
 const s=polar(pc.c,pc.r,pc.s),t=polar(pc.c,pc.r,pc.e);return dist(p,s)<dist(p,t)?s:t;
}
export function pieceIntersections(p:Piece,q:Piece,extendFirst=false):Pt[]{
 if(p.k==='seg'&&q.k==='seg'){const x=segSeg(p.a,p.b,q.a,q.b,extendFirst);return x?[x.p]:[];}
 if(p.k==='seg'||q.k==='seg'){const s=(p.k==='seg'?p:q) as Extract<Piece,{k:'seg'}>,k=(p.k==='arc'?p:q) as Extract<Piece,{k:'arc'}>;return segCircle(s.a,s.b,k.c,k.r,extendFirst&&p.k==='seg').map(t=>lerp(s.a,s.b,t)).filter(x=>onPiece(k,x));}
 return circleCircle(p.c,p.r,q.c,q.r).filter(x=>(extendFirst||onPiece(p,x))&&onPiece(q,x));
}

// ---- extents, segments and picking -------------------------------------------------------------------------------
export type Box=[number,number,number,number];
const boxOf=(pts:Pt[]):Box=>{let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(const [x,y] of pts){if(x<a)a=x;if(y<b)b=y;if(x>c)c=x;if(y>d)d=y;}return [a,b,c,d];};
export function arcExtremes(e:{center:Pt;radius:number},start:number,end:number):Pt[]{
 const pts=[arcPoint(e,start),arcPoint(e,end)];
 for(const q of [0,90,180,270])if(onArc(q,start,end))pts.push(arcPoint(e,q));
 return pts;
}
const piecePoints=(list:Piece[]):Pt[]=>list.flatMap(p=>p.k==='seg'?[p.a,p.b]:arcExtremes({center:p.c,radius:p.r},p.s,p.e));
export function bbox(e:Ent,doc?:Ctx):Box{
 switch(e.type){
  case 'line':return boxOf([e.a,e.b]);
  case 'poly':return e.bulges?.some(b=>b)?boxOf(piecePoints(pieces(e))):boxOf(e.points);
  case 'solid':return boxOf(e.points);
  case 'circle':return [e.center[0]-e.radius,e.center[1]-e.radius,e.center[0]+e.radius,e.center[1]+e.radius];
  case 'arc':return boxOf(arcExtremes(e,e.start,e.end));
  case 'ellipse':case 'spline':case 'xline':case 'ray':return boxOf(piecePoints(pieces(e)));
  case 'hatch':return boxOf(e.loops.flat());
  case 'text':return boxOf(textBox(e,doc));
  case 'attdef':return boxOf(textBox(attdefAsText(e),doc));
  case 'viewport':return [e.at[0]-e.width/2,e.at[1]-e.height/2,e.at[0]+e.width/2,e.at[1]+e.height/2];
  case 'insert':case 'xref':{const cs=children(e,doc??{});if(!cs.length)return [e.at[0],e.at[1],e.at[0],e.at[1]];const bs=cs.map(c=>bbox(c,doc));return [Math.min(...bs.map(b=>b[0])),Math.min(...bs.map(b=>b[1])),Math.max(...bs.map(b=>b[2])),Math.max(...bs.map(b=>b[3]))];}
  case 'dim':case 'leader':case 'table':case 'mtext':{const c=doc??{display:'US',realPerUnit:1};return boxOf([...piecePoints(pieces(e,c)),...(primitives(e,c)??[]).flatMap(p=>p.k==='fill'?p.pts:[]),...compositeBoxes(e,c).flat()]);}
 }
}
/** Straight segments of an entity: curves other than circles and arcs as chords; circles and arcs have none. */
export function segments(e:Ent,doc?:Ctx):[Pt,Pt][]{
 if(e.type==='circle'||e.type==='arc'||e.type==='text'||e.type==='mtext'||e.type==='attdef')return [];
 const out:[Pt,Pt][]=[];
 for(const p of pieces(e,doc)){if(p.k==='seg')out.push([p.a,p.b]);else{const c=arcChords(p);for(let i=1;i<c.length;i++)out.push([c[i-1],c[i]]);}}
 return out;
}
export function nearestOnSegment(p:Pt,a:Pt,b:Pt):{point:Pt;t:number}{
 const v=sub(b,a),l2=dot(v,v);if(l2<1e-24)return {point:a,t:0};
 const t=Math.max(0,Math.min(1,dot(sub(p,a),v)/l2));return {point:lerp(a,b,t),t};
}
function inPolygon(p:Pt,poly:Pt[]){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>p[1])!==(yj>p[1])&&p[0]<(xj-xi)*(p[1]-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
/** The point of the entity nearest p, and its distance (0 inside text and solids). */
export function nearest(e:Ent,p:Pt,doc?:Ctx):{point:Pt;d:number}{
 if(e.type==='attdef')return nearest({...attdefAsText(e),id:e.id} as TextEnt,p,doc);
 if(e.type==='insert'||e.type==='xref'){let best={point:e.at,d:dist(p,e.at)};for(const c of children(e,doc??{})){const n=nearest(c,p,doc);if(n.d<best.d)best=n;}return best;}
 if(e.type==='text'){const box=textBox(e,doc);if(inPolygon(p,box))return {point:e.at,d:0};}
 if(isComposite(e)){const c=doc??{display:'US',realPerUnit:1};for(const box of compositeBoxes(e,c))if(inPolygon(p,box))return {point:p,d:0};if(e.type==='table'&&p[0]>=e.at[0]&&p[1]<=e.at[1]&&p[0]<=e.at[0]+e.cols.reduce((a,v)=>a+v,0)&&p[1]>=e.at[1]-e.rows.reduce((a,v)=>a+v,0))return {point:p,d:0};}
 if(e.type==='solid'&&inPolygon(p,e.points))return {point:p,d:0};
 if(e.type==='hatch'&&insideLoops(p,e.loops))return {point:p,d:0};
 let best={point:p,d:Infinity};
 for(const pc of pieces(e,doc)){const q=pieceNearest(pc,p),d=dist(p,q);if(d<best.d)best={point:q,d};}
 const boxes=e.type==='text'?[textBox(e,doc)]:e.type==='mtext'?compositeBoxes(e,doc??{display:'US',realPerUnit:1}):[];
 for(const box of boxes)for(let i=0;i<4;i++){const q=nearestOnSegment(p,box[i],box[(i+1)%4]).point,d=dist(p,q);if(d<best.d)best={point:q,d};}
 return best;
}
const segBox=(a:Pt,b:Pt,r:Box)=>{
 // Liang–Barsky clip: does segment ab touch rectangle r?
 let t0=0,t1=1;const dx=b[0]-a[0],dy=b[1]-a[1];
 for(const [p,q] of [[-dx,a[0]-r[0]],[dx,r[2]-a[0]],[-dy,a[1]-r[1]],[dy,r[3]-a[1]]]){
  if(p===0){if(q<0)return false;}else{const t=q/p;if(p<0){if(t>t1)return false;if(t>t0)t0=t;}else{if(t<t0)return false;if(t<t1)t1=t;}}
 }
 return true;
};
/** The part of segment ab inside rectangle r, or undefined. */
export function clipSegment(a:Pt,b:Pt,r:Box):[Pt,Pt]|undefined{
 let t0=0,t1=1;const dx=b[0]-a[0],dy=b[1]-a[1];
 for(const [p,q] of [[-dx,a[0]-r[0]],[dx,r[2]-a[0]],[-dy,a[1]-r[1]],[dy,r[3]-a[1]]]){
  if(p===0){if(q<0)return undefined;}else{const t=q/p;if(p<0){if(t>t1)return undefined;if(t>t0)t0=t;}else{if(t<t0)return undefined;if(t<t1)t1=t;}}
 }
 return [lerp(a,b,t0),lerp(a,b,t1)];
}
/** Window (entity wholly inside r) or crossing (entity touches r) selection test. */
export function inWindow(e:Ent,r:Box,crossing:boolean,doc?:Ctx):boolean{
 const b=bbox(e,doc);
 if(b[0]>=r[0]&&b[1]>=r[1]&&b[2]<=r[2]&&b[3]<=r[3])return true;
 if(!crossing||b[2]<r[0]||b[0]>r[2]||b[3]<r[1]||b[1]>r[3])return false;
 if(e.type==='text'||e.type==='solid'||e.type==='attdef'||isComposite(e))return true;
 if(e.type==='insert'||e.type==='xref')return children(e,doc??{}).some(c=>inWindow(c,r,true,doc));
 if(e.type==='hatch'&&insideLoops([(r[0]+r[2])/2,(r[1]+r[3])/2],e.loops))return true;
 return pieces(e,doc).some(p=>{if(p.k==='seg')return segBox(p.a,p.b,r);const c=arcChords(p,7.5);for(let i=1;i<c.length;i++)if(segBox(c[i-1],c[i],r))return true;return false;});
}

// ---- snap points -------------------------------------------------------------------------------------------------
export type SnapKind='end'|'mid'|'cen'|'qua'|'int'|'per'|'nea'|'ins'|'grid'|'nod'|'tan'|'ext'|'par'|'app'|'trk';
export function snapPoints(e:Ent,doc?:Ctx):{kind:SnapKind;p:Pt}[]{
 const out:{kind:SnapKind;p:Pt}[]=[];
 switch(e.type){
  case 'line':out.push({kind:'end',p:e.a},{kind:'end',p:e.b},{kind:'mid',p:mid(e.a,e.b)});break;
  case 'poly':for(const p of e.points)out.push({kind:'end',p});
   for(const p of pieces(e)){if(p.k==='seg')out.push({kind:'mid',p:mid(p.a,p.b)});else out.push({kind:'mid',p:polar(p.c,p.r,p.s+pieceSweep(p)/2)},{kind:'cen',p:p.c});}break;
  case 'solid':for(const p of e.points)out.push({kind:'end',p});break;
  case 'circle':out.push({kind:'cen',p:e.center});for(const q of [0,90,180,270])out.push({kind:'qua',p:arcPoint(e,q)});break;
  case 'arc':out.push({kind:'cen',p:e.center},{kind:'end',p:arcPoint(e,e.start)},{kind:'end',p:arcPoint(e,e.end)},{kind:'mid',p:arcPoint(e,e.start+sweep(e.start,e.end)/2)});
   for(const q of [0,90,180,270])if(onArc(q,e.start,e.end))out.push({kind:'qua',p:arcPoint(e,q)});break;
  case 'ellipse':{const sw=ellipseSweep(e);out.push({kind:'cen',p:e.center});
   for(const q of [0,90,180,270])if(sw>=360||norm360(q-e.start)<=sw)out.push({kind:'qua',p:ellipsePoint(e,q)});
   if(sw<360)out.push({kind:'end',p:ellipsePoint(e,e.start)},{kind:'end',p:ellipsePoint(e,e.end)},{kind:'mid',p:ellipsePoint(e,e.start+sw/2)});break;}
  case 'spline':{const [u0,u1]=splineRange(e);if(!e.closed)out.push({kind:'end',p:splinePoint(e,u0)},{kind:'end',p:splinePoint(e,u1)});for(const p of e.fit??[])out.push({kind:'nod',p});break;}
  case 'xline':out.push({kind:'mid',p:e.base});break;
  case 'ray':out.push({kind:'end',p:e.base});break;
  case 'text':out.push({kind:'ins',p:e.at});break;
  case 'dim':{
   if(e.kind==='horizontal'||e.kind==='vertical'||e.kind==='aligned'){out.push({kind:'end',p:e.a},{kind:'end',p:e.b});const g=dimGeometry(e,doc??{display:'US',realPerUnit:1}),dl=g.lines[g.lines.length-1];if(dl)out.push({kind:'end',p:dl[0]},{kind:'end',p:dl[1]});}
   else{out.push({kind:'end',p:e.a},{kind:'end',p:e.at});if(e.kind==='angular')out.push({kind:'end',p:e.b});if(e.c)out.push({kind:e.kind==='ordinate'?'end':'cen',p:e.c});}
   break;
  }
  case 'mtext':case 'attdef':out.push({kind:'ins',p:e.at});break;
  case 'viewport':for(const pc of pieces(e))if(pc.k==='seg')out.push({kind:'end',p:pc.a});out.push({kind:'cen',p:e.at});break;
  case 'insert':case 'xref':out.push({kind:'ins',p:e.at});for(const c of children(e,doc??{}))out.push(...snapPoints(c,doc).filter(s=>s.kind!=='ins'));break;
  case 'leader':for(const p of e.points)out.push({kind:'end',p});break;
  case 'table':{const W=e.cols.reduce((a,v)=>a+v,0),H=e.rows.reduce((a,v)=>a+v,0);out.push({kind:'ins',p:e.at},{kind:'end',p:[e.at[0]+W,e.at[1]]},{kind:'end',p:[e.at[0],e.at[1]-H]},{kind:'end',p:[e.at[0]+W,e.at[1]-H]});break;}
 }
 return out;
}

// ---- intersections -----------------------------------------------------------------------------------------------
/** Parameters (t along ab, u along cd) where two segments cross, or undefined. */
export function segSeg(a:Pt,b:Pt,c:Pt,d:Pt,extendFirst=false):{t:number;u:number;p:Pt}|undefined{
 const r=sub(b,a),s=sub(d,c),den=cross(r,s);if(Math.abs(den)<1e-14)return undefined;
 const ca=sub(c,a),t=cross(ca,s)/den,u=cross(ca,r)/den,eps=1e-9;
 if(u<-eps||u>1+eps||(!extendFirst&&(t<-eps||t>1+eps)))return undefined;
 return {t,u,p:lerp(a,b,t)};
}
/** Parameters t along ab where the segment (or its line when extend) meets a circle. */
export function segCircle(a:Pt,b:Pt,c:Pt,r:number,extend=false):number[]{
 const d=sub(b,a),f=sub(a,c),A=dot(d,d),B=2*dot(f,d),C=dot(f,f)-r*r,disc=B*B-4*A*C;
 if(A<1e-24||disc<0)return [];
 const q=Math.sqrt(disc),ts=disc===0?[-B/(2*A)]:[(-B-q)/(2*A),(-B+q)/(2*A)];
 return extend?ts:ts.filter(t=>t>=-1e-9&&t<=1+1e-9);
}
export function circleCircle(c1:Pt,r1:number,c2:Pt,r2:number):Pt[]{
 const d=dist(c1,c2);if(d<1e-12||d>r1+r2+1e-12||d<Math.abs(r1-r2)-1e-12)return [];
 const a=(r1*r1-r2*r2+d*d)/(2*d),h=Math.sqrt(Math.max(0,r1*r1-a*a)),m=add(c1,mul(sub(c2,c1),a/d)),o:Pt=[-(c2[1]-c1[1])/d*h,(c2[0]-c1[0])/d*h];
 return h<1e-12?[m]:[add(m,o),sub(m,o)];
}
/** All intersection points between two entities (text has none). */
export function intersections(e:Ent,f:Ent,doc?:Ctx):Pt[]{
 if(e.type==='text'||f.type==='text'||e.type==='hatch'||f.type==='hatch')return [];
 const out:Pt[]=[],pe=pieces(e,doc),pf=pieces(f,doc);
 for(const p of pe)for(const q of pf)for(const x of pieceIntersections(p,q))if(!out.some(o=>close(o,x,1e-9)))out.push(x);
 return out;
}

// ---- curve parameters ----------------------------------------------------------------------------------------------
/**
 * Curves by parameter: a line 0..1, an arc or elliptical arc by degrees from its start, a circle or full ellipse by
 * degrees (periodic), a polyline by segment index plus fraction, a spline by knot value, a construction line by length.
 */
export interface Range{t0:number;t1:number;periodic:boolean}
export function curveRange(e:Ent):Range|undefined{
 switch(e.type){
  case 'line':return {t0:0,t1:1,periodic:false};
  case 'arc':return {t0:0,t1:sweep(e.start,e.end),periodic:false};
  case 'circle':return {t0:0,t1:360,periodic:true};
  case 'poly':{const n=polyCount(e);return n?{t0:0,t1:n,periodic:e.closed&&e.points.length>2}:undefined;}
  case 'ellipse':{const sw=ellipseSweep(e);return {t0:0,t1:sw,periodic:sw>=360};}
  case 'spline':{const [a,b]=splineRange(e);return {t0:a,t1:b,periodic:e.closed};}
  case 'xline':return {t0:-XLINE_REACH,t1:XLINE_REACH,periodic:false};
  case 'ray':return {t0:0,t1:XLINE_REACH,periodic:false};
 }
 return undefined;
}
export function pointAt(e:Ent,t:number):Pt{
 switch(e.type){
  case 'line':return lerp(e.a,e.b,t);
  case 'arc':return arcPoint(e,e.start+t);
  case 'circle':return arcPoint(e,t);
  case 'poly':{const n=polyCount(e),i=Math.max(0,Math.min(n-1,Math.floor(t))),[a,b]=polyEnds(e,i);return bulgePoint(a,b,bulgeOf(e,i),t-i);}
  case 'ellipse':return ellipsePoint(e,e.start+t);
  case 'spline':return splinePoint(e,t);
  case 'xline':case 'ray':return add(e.base,mul(e.dir,t));
 }
 return [0,0];
}
/** The parameter of the curve point nearest p. */
export function paramAt(e:Ent,p:Pt):number{
 const clampSweep=(rel:number,sw:number)=>rel<=sw?rel:(rel-sw<360-rel?sw:0);
 switch(e.type){
  case 'line':{const v=sub(e.b,e.a),l2=dot(v,v);return l2<1e-24?0:Math.max(0,Math.min(1,dot(sub(p,e.a),v)/l2));}
  case 'arc':return clampSweep(norm360(angleOf(e.center,p)-e.start),sweep(e.start,e.end));
  case 'circle':return norm360(angleOf(e.center,p));
  case 'poly':{
   let best=0,bd=Infinity;
   for(let i=0;i<polyCount(e);i++){
    const [a,b]=polyEnds(e,i),k=bulgeArc(a,b,bulgeOf(e,i));let t:number,q:Pt;
    if(!k){const n=nearestOnSegment(p,a,b);t=n.t;q=n.point;}
    else{let d=angleOf(k.c,p)-k.a0;d=k.sweep>0?norm360(d):-norm360(-d);const sw=Math.abs(k.sweep),ad=Math.abs(d);t=ad<=sw?ad/sw:(ad-sw<360-ad?1:0);q=bulgePoint(a,b,bulgeOf(e,i),t);}
    const dd=dist(p,q);if(dd<bd-1e-12){bd=dd;best=i+t;}
   }
   return best;
  }
  case 'ellipse':{const sw=ellipseSweep(e),rel=norm360(ellipseParam(e,p)-e.start);return sw>=360?rel:clampSweep(rel,sw);}
  case 'spline':return splineParam(e,p);
  case 'xline':case 'ray':{const t=dot(sub(p,e.base),e.dir);return e.type==='ray'?Math.max(0,t):t;}
 }
 return 0;
}
/** Length of a curve (text, solids and dimensions have none). */
export function curveLength(e:Ent):number{
 switch(e.type){
  case 'line':return dist(e.a,e.b);
  case 'circle':return 2*Math.PI*e.radius;
  case 'arc':return e.radius*sweep(e.start,e.end)*DEG;
  case 'poly':return pieces(e).reduce((s,p)=>s+(p.k==='seg'?dist(p.a,p.b):p.r*pieceSweep(p)*DEG),0);
  case 'ellipse':case 'spline':{const s=curveSamples(e);let l=0;for(let i=1;i<s.length;i++)l+=dist(s[i-1].p,s[i].p);return l;}
 }
 return 0;
}
/** Unit tangent at parameter t, in the direction of increasing t. */
export function tangentAt(e:Ent,t:number):Pt{
 const r=curveRange(e);if(!r)return [1,0];
 const h=Math.max(1e-9,(r.t1-r.t0)*1e-6),a=pointAt(e,Math.max(r.t0,t-h)),b=pointAt(e,Math.min(r.t1,t+h)),v=sub(b,a),l=len(v);
 return l<1e-15?[1,0]:[v[0]/l,v[1]/l];
}
function polyChain(e:PolyEnt,t0:number,t1:number):{points:Pt[];bulges?:number[]}{
 const n=polyCount(e),end=t1<=t0?t1+n:t1,pts:Pt[]=[],bul:number[]=[];
 let t=t0,last:Pt|undefined;
 while(t<end-1e-12){
  const i=Math.floor(t+1e-12),next=Math.min(end,i+1),f0=Math.max(0,t-i),f1=next-i,j=((i%n)+n)%n,[a,b]=polyEnds(e,j),bg=bulgeOf(e,j);
  if(f1-f0>1e-12){pts.push(bulgePoint(a,b,bg,f0));bul.push(subBulge(bg,f1-f0));last=bulgePoint(a,b,bg,f1);}
  t=next;
 }
 if(last)pts.push(last);
 return bul.some(b=>Math.abs(b)>1e-12)?{points:pts,bulges:[...bul,0]}:{points:pts};
}
const joinSplines=(a:SplineGeom,b:SplineGeom):SplineGeom=>{
 const p=a.degree,shift=a.knots[a.knots.length-1]-b.knots[0];
 return {degree:p,ctrl:[...a.ctrl,...b.ctrl.slice(1)],knots:[...a.knots.slice(0,-1),...b.knots.slice(p+1).map(k=>k+shift)]};
};
/** The part of a curve from t0 to t1 (wrapping past the seam when t1 < t0 on a closed curve). */
export function subCurve(e:Ent,t0:number,t1:number):NewEnt|undefined{
 const r=curveRange(e);if(!r)return undefined;
 const wrap=r.periodic&&t1<=t0;if(!wrap&&t1-t0<1e-12)return undefined;
 const pr=propsOf(e);
 switch(e.type){
  case 'line':return {...pr,type:'line',a:pointAt(e,t0),b:pointAt(e,t1)};
  case 'arc':return {...pr,type:'arc',center:e.center,radius:e.radius,start:norm360(e.start+t0),end:norm360(e.start+t1)};
  case 'circle':return {...pr,type:'arc',center:e.center,radius:e.radius,start:norm360(t0),end:norm360(t1)};
  case 'ellipse':{const sw=wrap?norm360(t1-t0):t1-t0;if(sw>=360-1e-9||(wrap&&sw<1e-12))return {...pr,type:'ellipse',center:e.center,major:e.major,ratio:e.ratio,start:e.start,end:e.end};return {...pr,type:'ellipse',center:e.center,major:e.major,ratio:e.ratio,start:norm360(e.start+t0),end:norm360(e.start+t0+sw)};}
  case 'poly':{const c=polyChain(e,t0,t1);return c.points.length>1?{...pr,type:'poly',closed:false,...c}:undefined;}
  case 'spline':{
   const g=wrap?(()=>{const x=subSpline(e,t0,r.t1),y=subSpline(e,r.t0,t1);return x&&y?joinSplines(x,y):x??y;})():subSpline(e,t0,t1);
   return g?{...pr,type:'spline',degree:g.degree,ctrl:g.ctrl,knots:g.knots,closed:false}:undefined;
  }
  case 'xline':case 'ray':{
   const lo=t0>r.t0+1,hi=t1<r.t1-1;
   if(lo&&hi)return {...pr,type:'line',a:pointAt(e,t0),b:pointAt(e,t1)};
   if(lo)return {...pr,type:'ray',base:pointAt(e,t0),dir:e.dir};
   if(hi)return {...pr,type:'ray',base:pointAt(e,t1),dir:mul(e.dir,-1)};
   return {...pr,type:e.type,base:e.base,dir:e.dir};
  }
 }
 return undefined;
}
/** Distinct parameters where other entities cut e (inside its range). */
export function cutParams(e:Ent,others:Ent[],doc?:Ctx):number[]{
 const r=curveRange(e);if(!r)return [];
 const ts=others.filter(o=>o.id!==e.id).flatMap(o=>intersections(e,o,doc)).map(q=>paramAt(e,q));
 const span=r.t1-r.t0,eps=span*1e-9;
 const inner=r.periodic?ts:ts.filter(u=>u>r.t0+eps&&u<r.t1-eps);
 return [...new Set(inner.map(u=>+u.toFixed(9)))].sort((a,b)=>a-b);
}

// ---- transforms --------------------------------------------------------------------------------------------------
const clean=(a:number)=>Math.abs(a)<1e-9?0:a;
/** x' = m0 x + m2 y + m4, y' = m1 x + m3 y + m5. */
export type Affine=[number,number,number,number,number,number];
export const apply=(m:Affine,[x,y]:Pt):Pt=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
export const applyLinear=(m:Affine,[x,y]:Pt):Pt=>[m[0]*x+m[2]*y,m[1]*x+m[3]*y];
export const translation=(d:Pt):Affine=>[1,0,0,1,d[0],d[1]];
export function rotation(c:Pt,deg:number):Affine{const a=deg*DEG,co=Math.cos(a),s=Math.sin(a);return [co,s,-s,co,c[0]-co*c[0]+s*c[1],c[1]-s*c[0]-co*c[1]];}
export const scaling=(c:Pt,k:number):Affine=>[k,0,0,k,c[0]*(1-k),c[1]*(1-k)];
export function mirroring(a:Pt,b:Pt):Affine{
 const t=Math.atan2(b[1]-a[1],b[0]-a[0]),c=Math.cos(2*t),s=Math.sin(2*t);
 return [c,s,s,-c,a[0]-c*a[0]-s*a[1],a[1]-s*a[0]+c*a[1]];
}
/** m1 after m2. */
export const compose=(m1:Affine,m2:Affine):Affine=>[m1[0]*m2[0]+m1[2]*m2[1],m1[1]*m2[0]+m1[3]*m2[1],m1[0]*m2[2]+m1[2]*m2[3],m1[1]*m2[2]+m1[3]*m2[3],m1[0]*m2[4]+m1[2]*m2[5]+m1[4],m1[1]*m2[4]+m1[3]*m2[5]+m1[5]];
/** The entity under an affine map (uniform scale, rotation, reflection). Text and dimensions stay readable when mirrored. */
export function transformEnt<E extends Ent>(e:E,m:Affine):E{
 const det=m[0]*m[3]-m[1]*m[2],k=Math.sqrt(Math.abs(det)),mirror=det<0,rot=Math.atan2(m[1],m[0])/DEG,P=(p:Pt)=>apply(m,p);
 switch(e.type){
  case 'line':return {...e,a:P(e.a),b:P(e.b)};
  case 'poly':return mirror&&e.bulges?{...e,points:e.points.map(P),bulges:e.bulges.map(b=>-b)}:{...e,points:e.points.map(P)};
  case 'solid':return {...e,points:e.points.map(P)};
  case 'circle':return {...e,center:P(e.center),radius:e.radius*k};
  case 'arc':{const s=P(arcPoint(e,e.start)),t=P(arcPoint(e,e.end)),c=P(e.center);const a0=angleOf(c,s),a1=angleOf(c,t);return {...e,center:c,radius:e.radius*k,start:mirror?a1:a0,end:mirror?a0:a1};}
  case 'ellipse':{const full=ellipseSweep(e)>=360;return {...e,center:P(e.center),major:applyLinear(m,e.major),...(mirror&&!full?{start:norm360(-e.end),end:norm360(-e.start)}:{})};}
  case 'spline':return {...e,ctrl:e.ctrl.map(P),...(e.fit?{fit:e.fit.map(P)}:{})};
  case 'xline':case 'ray':{const d=applyLinear(m,e.dir),l=len(d)||1;return {...e,base:P(e.base),dir:[d[0]/l,d[1]/l]};}
  // The pattern turns and scales with the hatch; a mirrored hatch keeps its pattern reading the same way.
  case 'hatch':return {...e,loops:e.loops.map(l=>l.map(P)),origin:P(e.origin??[0,0]),scale:e.scale*k,angle:mirror?e.angle:clean(norm360(e.angle+rot))};
  case 'text':{
   if(!mirror)return {...e,at:P(e.at),height:e.height*k,angle:clean(norm360(e.angle+rot+180)-180)};
   // Mirrored text keeps reading left to right: mirror the box, then place the text in it.
   const box=textBox(e).map(P),align=e.align===0?2:e.align===2?0:1;
   const base=align===0?box[1]:align===2?box[0]:mid(box[0],box[1]);
   const dir=sub(box[0],box[1]);let angle=Math.atan2(dir[1],dir[0])/DEG;if(angle>90.0001||angle<=-90)angle+=angle>0?-180:180;
   const lift=mul([-Math.sin(angle*DEG),Math.cos(angle*DEG)],.28*e.height*k),at=add(base,lift);
   return {...e,at,height:e.height*k,angle:clean(angle),align:align as Align};
  }
  case 'dim':{
   // A horizontal or vertical dimension stays one when the map keeps the axes (a quarter turn swaps them).
   const keep=Math.abs(m[1])<1e-9&&Math.abs(m[2])<1e-9,swap=Math.abs(m[0])<1e-9&&Math.abs(m[3])<1e-9;
   const kind=e.kind==='aligned'?'aligned':keep?e.kind:swap?(e.kind==='horizontal'?'vertical':'horizontal'):'aligned';
   const axis=e.axis&&swap?(e.axis==='x'?'y':'x'):e.axis;
   return {...e,a:P(e.a),b:P(e.b),at:P(e.at),...(e.c?{c:P(e.c)}:{}),...(axis?{axis}:{}),height:e.height*k,kind:e.kind==='horizontal'||e.kind==='vertical'||e.kind==='aligned'?kind:e.kind};
  }
  case 'mtext':{
   if(!mirror)return {...e,at:P(e.at),height:e.height*k,width:e.width*k,angle:clean(norm360(e.angle+rot+180)-180)};
   // Mirrored multiline text keeps reading left to right: the baseline reversed, the attachment's column swapped.
   const u=applyLinear(m,[Math.cos(e.angle*DEG),Math.sin(e.angle*DEG)]);let angle=Math.atan2(-u[1],-u[0])/DEG;if(angle>90.0001||angle<=-90)angle+=angle>0?-180:180;
   const col=(e.attach-1)%3,row=Math.floor((e.attach-1)/3);
   return {...e,at:P(e.at),height:e.height*k,width:e.width*k,angle:clean(angle),attach:row*3+(2-col)+1};
  }
  case 'leader':return {...e,points:e.points.map(P),height:e.height*k};
  case 'attdef':{const t=transformEnt({...attdefAsText(e),id:e.id} as TextEnt,m);return {...e,at:t.at,height:t.height,angle:t.angle,align:t.align};}
  // A mirrored reference flips its mirror flag; its rotation becomes the mirror line's angle less the old rotation.
  case 'insert':return mirror?{...e,at:P(e.at),scale:e.scale*k,rotation:clean(norm360(rot-e.rotation)),mirror:!e.mirror}:{...e,at:P(e.at),scale:e.scale*k,rotation:clean(norm360(e.rotation+rot))};
  case 'xref':return {...e,at:P(e.at),scale:e.scale*k,rotation:clean(norm360(e.rotation+rot))};
  // Viewports stay square to the sheet: moved and scaled (with their scale), the model view unchanged.
  case 'viewport':return {...e,at:P(e.at),width:e.width*k,height:e.height*k,scale:e.scale*k};
  case 'table':{
   // Tables stay square to the sheet: the box moves (and scales) to where its corners go.
   const W=e.cols.reduce((a,v)=>a+v,0),H=e.rows.reduce((a,v)=>a+v,0),cs=[e.at,[e.at[0]+W,e.at[1]],[e.at[0],e.at[1]-H],[e.at[0]+W,e.at[1]-H]].map(q=>P(q as Pt));
   const c=mid(cs[0],cs[3]),w=W*k,h=H*k;return {...e,at:[c[0]-w/2,c[1]+h/2],cols:e.cols.map(v=>v*k),rows:e.rows.map(v=>v*k),height:e.height*k};
  }
 }
 return e;
}

// ---- grips -------------------------------------------------------------------------------------------------------
export interface Grip{p:Pt;role:string}
export function grips(e:Ent):Grip[]{
 switch(e.type){
  case 'line':return [{p:e.a,role:'a'},{p:e.b,role:'b'},{p:mid(e.a,e.b),role:'mid'}];
  case 'poly':return [...e.points.map((p,i)=>({p,role:`v${i}`})),...pieces(e).map((p,i)=>({p:p.k==='seg'?mid(p.a,p.b):polar(p.c,p.r,p.s+pieceSweep(p)/2),role:`s${i}`}))];
  case 'solid':return e.points.map((p,i)=>({p,role:`v${i}`}));
  case 'circle':return [{p:e.center,role:'center'},...[0,90,180,270].map(q=>({p:arcPoint(e,q),role:'radius'}))];
  case 'arc':return [{p:e.center,role:'center'},{p:arcPoint(e,e.start),role:'start'},{p:arcPoint(e,e.end),role:'end'},{p:arcPoint(e,e.start+sweep(e.start,e.end)/2),role:'radius'}];
  case 'ellipse':{const sw=ellipseSweep(e),g:Grip[]=[{p:e.center,role:'center'}];for(const q of [0,90,180,270])if(sw>=360||norm360(q-e.start)<=sw)g.push({p:ellipsePoint(e,q),role:`q${q}`});if(sw<360)g.push({p:ellipsePoint(e,e.start),role:'start'},{p:ellipsePoint(e,e.end),role:'end'});return g;}
  case 'spline':return e.fit?e.fit.map((p,i)=>({p,role:`f${i}`})):e.ctrl.map((p,i)=>({p,role:`c${i}`}));
  case 'xline':case 'ray':return [{p:e.base,role:'base'}];
  case 'hatch':{const b=boxOf(e.loops.flat());return [{p:[(b[0]+b[2])/2,(b[1]+b[3])/2],role:'center'},...e.loops.flatMap((l,i)=>l.map((p,j)=>({p,role:`l${i}v${j}`})))];}
  case 'text':return [{p:e.at,role:'at'}];
  case 'dim':return [{p:e.a,role:'a'},...(e.kind==='angular'||e.kind==='horizontal'||e.kind==='vertical'||e.kind==='aligned'?[{p:e.b,role:'b'}]:[]),{p:e.at,role:'at'},...(e.c?[{p:e.c,role:'c'}]:[])];
  case 'mtext':case 'attdef':case 'insert':case 'xref':return [{p:e.at,role:'at'}];
  case 'viewport':return [{p:e.at,role:'at'},...pieces(e).map((pc,i)=>({p:pc.k==='seg'?pc.a:e.at,role:`c${i}`}))];
  case 'leader':return e.points.map((p,i)=>({p,role:`v${i}`}));
  case 'table':return [{p:e.at,role:'at'}];
 }
}
/** The entity with one grip moved to p (from its original position from). */
export function stretchGrip(e:Ent,role:string,from:Pt,p:Pt):Ent{
 const d=sub(p,from);
 switch(e.type){
  case 'line':return role==='a'?{...e,a:p}:role==='b'?{...e,b:p}:transformEnt(e,translation(d));
  case 'poly':{
   const pts=e.points.map(q=>[...q] as Pt);
   if(role[0]==='v'){pts[+role.slice(1)]=p;return {...e,points:pts};}
   const i=+role.slice(1),j=(i+1)%pts.length;
   // The middle grip of an arc segment bends it through the point; of a straight segment, moves it.
   if(bulgeOf(e,i)){const bulges=[...(e.bulges??[])];bulges[i]=bulgeThrough(pts[i],p,pts[j]);return {...e,bulges};}
   pts[i]=add(pts[i],d);pts[j]=add(pts[j],d);
   return {...e,points:pts};
  }
  case 'solid':{const pts=e.points.map(q=>[...q] as Pt);pts[+role.slice(1)]=p;return {...e,points:pts};}
  case 'circle':return role==='center'?{...e,center:p}:{...e,radius:Math.max(1e-9,dist(e.center,p))};
  case 'arc':return role==='center'?{...e,center:p}:role==='start'?{...e,start:angleOf(e.center,p)}:role==='end'?{...e,end:angleOf(e.center,p)}:{...e,radius:Math.max(1e-9,dist(e.center,p))};
  case 'ellipse':{
   if(role==='center')return {...e,center:p};
   if(role==='start'||role==='end')return {...e,[role]:ellipseParam(e,p)};
   const L=len(e.major),r=Math.max(1e-9,dist(e.center,p));
   if(role==='q0'||role==='q180')return {...e,major:mul(e.major,r/L),ratio:Math.min(1,e.ratio*L/r)};
   // A minor axis dragged past the major one becomes the major axis.
   if(r<=L)return {...e,ratio:r/L};
   const minor:Pt=[-e.major[1]/L*r,e.major[0]/L*r];return {...e,major:minor,ratio:L/r,start:norm360(e.start-90),end:norm360(e.end-90)};
  }
  case 'spline':{
   if(role[0]==='f'&&e.fit){const fit=e.fit.map(q=>[...q] as Pt);fit[+role.slice(1)]=p;const g=splineThrough(fit,e.closed);return g?{...e,...g,fit}:e;}
   const ctrl=e.ctrl.map(q=>[...q] as Pt);ctrl[+role.slice(1)]=p;const {fit:_,...rest}=e;return {...rest,ctrl};
  }
  case 'xline':case 'ray':return {...e,base:p};
  case 'hatch':{if(role==='center')return transformEnt(e,translation(d));const [i,j]=role.slice(1).split('v').map(Number);return {...e,loops:e.loops.map((l,a)=>a===i?l.map((q,b)=>b===j?p:q):l)};}
  case 'text':return {...e,at:p};
  case 'dim':return role==='a'?{...e,a:p}:role==='b'?{...e,b:p}:role==='c'?{...e,c:p}:{...e,at:p};
  case 'mtext':case 'table':case 'attdef':case 'insert':case 'xref':return {...e,at:p};
  case 'viewport':{
   if(role==='at')return {...e,at:p};
   // A corner grip resizes the viewport about the opposite corner; the model stays put on the paper.
   const i=+role.slice(1),c=pieces(e).map(pc=>pc.k==='seg'?pc.a:e.at),o=c[(i+2)%4],x0=Math.min(o[0],p[0]),x1=Math.max(o[0],p[0]),y0=Math.min(o[1],p[1]),y1=Math.max(o[1],p[1]);
   if(x1-x0<1e-6||y1-y0<1e-6)return e;
   const at:Pt=[(x0+x1)/2,(y0+y1)/2];return {...e,at,width:x1-x0,height:y1-y0,view:[e.view[0]+(at[0]-e.at[0])/e.scale,e.view[1]+(at[1]-e.at[1])/e.scale]};
  }
  case 'leader':{const pts=e.points.map(q=>[...q] as Pt);pts[+role.slice(1)]=p;return {...e,points:pts};}
 }
}

// ---- trim, extend, offset, explode -------------------------------------------------------------------------------
/** Pieces left when the part of e under p between its nearest cutting points is removed; [] erases e. */
export function trimEnt(e:Ent,p:Pt,others:Ent[],doc?:Ctx):NewEnt[]|undefined{
 const r=curveRange(e);if(!r)return undefined;
 const cuts=cutParams(e,others,doc),t=paramAt(e,p);
 if(r.periodic){
  if(cuts.length<2)return [];
  const lo=[...cuts].reverse().find(u=>u<t)??cuts[cuts.length-1],hi=cuts.find(u=>u>t)??cuts[0];
  const piece=subCurve(e,hi,lo);return piece?[piece]:[];
 }
 const lo=Math.max(r.t0,...cuts.filter(u=>u<t)),hi=Math.min(r.t1,...cuts.filter(u=>u>t)),out:NewEnt[]=[],eps=(r.t1-r.t0)*1e-9;
 if(lo>r.t0+eps){const s=subCurve(e,r.t0,lo);if(s)out.push(s);}
 if(hi<r.t1-eps){const s=subCurve(e,hi,r.t1);if(s)out.push(s);}
 return out;
}
/** The two parts of e on either side of the stretch between the points at t0 and t1 (BREAK), or one part on a closed curve. */
export function breakEnt(e:Ent,t0:number,t1:number):NewEnt[]|undefined{
 const r=curveRange(e);if(!r)return undefined;
 if(r.periodic){
  if(Math.abs(t1-t0)<1e-12){// A closed curve broken at one point opens there.
   if(e.type==='poly'){const c=polyChain(e,t0,t0+polyCount(e));return [{...propsOf(e),type:'poly',closed:false,...c}];}
   return undefined;
  }
  const s=subCurve(e,t1,t0);return s?[s]:[];
 }
 const [a,b]=t0<=t1?[t0,t1]:[t1,t0],out:NewEnt[]=[],eps=(r.t1-r.t0)*1e-9;
 if(a>r.t0+eps){const s=subCurve(e,r.t0,a);if(s)out.push(s);}
 if(b<r.t1-eps){const s=subCurve(e,b,r.t1);if(s)out.push(s);}
 return out;
}
/** A line, open polyline or arc with the end nearer p extended to the nearest boundary ahead of it. */
export function extendEnt(e:Ent,p:Pt,others:Ent[],doc?:Ctx):Ent|undefined{
 const bounds=others.filter(o=>o.id!==e.id&&o.type!=='text'&&o.type!=='hatch').flatMap(o=>pieces(o,doc));
 if(e.type==='arc'){
  const atEnd=dist(p,arcPoint(e,e.end))<dist(p,arcPoint(e,e.start)),sw=sweep(e.start,e.end),gap=360-sw;
  const circle:Piece={k:'arc',c:e.center,r:e.radius,s:0,e:360};let best=Infinity;
  for(const b of bounds)for(const x of pieceIntersections(circle,b)){const a=angleOf(e.center,x),g=atEnd?norm360(a-e.end):norm360(e.start-a);if(g>1e-7&&g<gap-1e-7)best=Math.min(best,g);}
  return best<Infinity?(atEnd?{...e,end:norm360(e.end+best)}:{...e,start:norm360(e.start-best)}):undefined;
 }
 let a:Pt,b:Pt,set:(q:Pt)=>Ent;
 if(e.type==='line'){const atB=dist(p,e.b)<dist(p,e.a);a=atB?e.a:e.b;b=atB?e.b:e.a;set=q=>atB?{...e,b:q}:{...e,a:q};}
 else if(e.type==='poly'&&!e.closed&&e.points.length>1){
  const pts=e.points,atEnd=dist(p,pts[pts.length-1])<dist(p,pts[0]);
  if(bulgeOf(e,atEnd?pts.length-2:0))return undefined;
  a=atEnd?pts[pts.length-2]:pts[1];b=atEnd?pts[pts.length-1]:pts[0];set=q=>{const n=[...pts];if(atEnd)n[n.length-1]=q;else n[0]=q;return {...e,points:n};};
 }
 else return undefined;
 const v=sub(b,a),l=len(v);if(l<1e-12)return undefined;
 let best=Infinity;
 const ray:Piece={k:'seg',a,b};
 for(const o of bounds)for(const x of pieceIntersections(ray,o,true)){const t=dot(sub(x,a),v)/(l*l);if(t>1+1e-9)best=Math.min(best,t);}
 return best<Infinity?set(lerp(a,b,best)):undefined;
}
/** A copy offset by d toward the side of p. */
export function offsetEnt(e:Ent,d:number,p:Pt):NewEnt|undefined{
 const strip=({id:_,...rest}:Ent)=>rest as NewEnt;
 if(e.type==='line'){const v=sub(e.b,e.a),l=len(v);if(l<1e-12)return undefined;const n:Pt=[-v[1]/l,v[0]/l],s=Math.sign(dot(sub(p,e.a),n))||1;return {...strip(e),a:add(e.a,mul(n,d*s)),b:add(e.b,mul(n,d*s))} as NewEnt;}
 if(e.type==='xline'||e.type==='ray'){const n:Pt=[-e.dir[1],e.dir[0]],s=Math.sign(dot(sub(p,e.base),n))||1;return {...strip(e),base:add(e.base,mul(n,d*s))} as NewEnt;}
 if(e.type==='circle'||e.type==='arc'){const r=e.radius+(dist(p,e.center)>e.radius?d:-d);return r>1e-9?{...strip(e),radius:r} as NewEnt:undefined;}
 if(e.type==='poly')return offsetPoly(e,d,p);
 if(e.type==='ellipse'||e.type==='spline'){
  // A true offset of an ellipse or spline is not one: a spline through offset points, as AutoCAD makes.
  const t=paramAt(e,p),q=pointAt(e,t),tg=tangentAt(e,t),side=Math.sign(cross(tg,sub(p,q)))||1,r=curveRange(e)!;
  const n=e.type==='ellipse'?Math.max(12,Math.ceil(ellipseSweep(e)/10)):Math.max(8,(e.ctrl.length-1)*4),fit:Pt[]=[];
  for(let i=0;i<=(r.periodic?n-1:n);i++){const u=r.t0+(r.t1-r.t0)*i/n,g=tangentAt(e,u);fit.push(add(pointAt(e,u),mul([-g[1],g[0]],d*side)));}
  const g=splineThrough(fit,r.periodic);return g?{...propsOf(e),type:'spline',...g,fit,closed:r.periodic}:undefined;
 }
 return undefined;
}
function offsetPoly(e:PolyEnt,d:number,p:Pt):NewEnt|undefined{
 const ps=pieces(e);if(!ps.length)return undefined;
 const n=ps.length,closed=e.closed&&e.points.length>2;
 // Pick the side from the nearest piece: + is left of the direction of travel.
 let bi=0,bd=Infinity;ps.forEach((pc,i)=>{const dd=dist(p,pieceNearest(pc,p));if(dd<bd){bd=dd;bi=i;}});
 const bulge=(i:number)=>bulgeOf(e,i),near=ps[bi];
 const side=near.k==='seg'?(Math.sign(cross(sub(near.b,near.a),sub(p,near.a)))||1):(dist(p,near.c)<near.r?1:-1)*Math.sign(bulge(bi));
 type Off={a:Pt;b:Pt;c?:Pt;r?:number;ccw?:boolean};
 const off:Off[]=[];
 for(let i=0;i<n;i++){
  const [a,b]=polyEnds(e,i),k=bulgeArc(a,b,bulge(i));
  if(!k){const v=sub(b,a),l=len(v)||1,m:Pt=[-v[1]/l*d*side,v[0]/l*d*side];off.push({a:add(a,m),b:add(b,m)});continue;}
  const r=k.r-side*d*Math.sign(k.sweep);if(r<=1e-9)return undefined;
  const at=(q:Pt)=>add(k.c,mul(sub(q,k.c),r/k.r));off.push({a:at(a),b:at(b),c:k.c,r,ccw:k.sweep>0});
 }
 const lineHit=(x:Off,y:Off):Pt|undefined=>{const r=sub(x.b,x.a),q=sub(y.b,y.a),den=cross(r,q);if(Math.abs(den)<1e-14)return undefined;return add(x.a,mul(r,cross(sub(y.a,x.a),q)/den));};
 const join=(i:number,j:number,vertex:Pt):Pt=>{
  const x=off[i],y=off[j];if(close(x.b,y.a,1e-9))return x.b;
  if(!x.c&&!y.c)return lineHit(x,y)??x.b;
  const hits=x.c&&y.c?circleCircle(x.c,x.r!,y.c,y.r!):x.c?segCircle(y.a,y.b,x.c,x.r!,true).map(t=>lerp(y.a,y.b,t)):segCircle(x.a,x.b,y.c!,y.r!,true).map(t=>lerp(x.a,x.b,t));
  return hits.sort((u,v)=>dist(u,vertex)-dist(v,vertex))[0]??x.b;
 };
 const verts:Pt[]=[];
 if(closed){for(let i=0;i<n;i++)verts.push(join((i-1+n)%n,i,e.points[i]));}
 else{verts.push(off[0].a);for(let i=1;i<n;i++)verts.push(join(i-1,i,e.points[i]));verts.push(off[n-1].b);}
 const bulges=off.map((o,i)=>{if(!o.c)return 0;const s=verts[i],t=verts[(i+1)%verts.length],a0=angleOf(o.c,s),a1=angleOf(o.c,t);const sw=o.ccw?norm360(a1-a0):-norm360(a0-a1);return Math.tan(sw*DEG/4);});
 const {id:_,...rest}=e;
 return bulges.some(b=>b)?{...rest,points:verts,bulges:closed?bulges:[...bulges,0]}:{...rest,points:verts,bulges:undefined};
}
/** Lines and arcs from a polyline; lines, arrowheads and text from a dimension; lines from a patterned hatch. */
export function explodeEnt(e:Ent,doc:Ctx):NewEnt[]|undefined{
 const pr=propsOf(e);
 if(e.type==='hatch')return e.pattern==='SOLID'?undefined:hatchLines(e,doc.unit??'in').map(([a,b])=>({...pr,type:'line',a,b}) as NewEnt);
 if(e.type==='poly')return pieces(e).map(p=>p.k==='seg'?{...pr,type:'line',a:p.a,b:p.b} as NewEnt:{...pr,type:'arc',center:p.c,radius:p.r,start:norm360(p.s),end:norm360(p.e)} as NewEnt);
 if(isComposite(e))return primEnts(primitives(e,doc)!,pr);
 if(e.type==='insert'){const cs=children(e,doc);return cs.length?cs.map(({id:_,...c})=>c as NewEnt):undefined;}
 return undefined;
}

// ---- coordinate entry --------------------------------------------------------------------------------------------
/** A number as drafters type it: 12, -3.5, 3/4, 1-1/2, 1 1/2, 2'6", 2'-6 1/2". */
export function parseLength(raw:string):number|undefined{
 const s=raw.trim().replace(/\s+/g,' ');if(!s)return undefined;
 const ft=/^(-)?(\d+(?:\.\d+)?)'(?:\s*-?\s*(.*?))?"?$/.exec(s);
 if(ft&&s.includes("'")){const inches=ft[3]?parseLength(ft[3].replace(/"$/,'')):0;if(inches===undefined)return undefined;const v=+ft[2]*12+inches;return ft[1]?-v:v;}
 const t=s.replace(/"$/,'');
 const mixed=/^(-)?(\d+)(?:[ -])(\d+)\/(\d+)$/.exec(t);if(mixed){const v=+mixed[2]+ +mixed[3]/ +mixed[4];return mixed[1]?-v:v;}
 const frac=/^(-)?(\d+)\/(\d+)$/.exec(t);if(frac&&+frac[3]){const v=+frac[2]/ +frac[3];return frac[1]?-v:v;}
 return /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(t)?Number(t):undefined;
}
/**
 * A typed point: x,y (absolute), @dx,dy (relative to last), @d<a or d<a (polar, relative or from the origin), or a
 * bare distance along the direction from last to the cursor (direct distance entry).
 */
export function parsePoint(raw:string,last?:Pt,cursor?:Pt):Pt|undefined{
 const s=raw.trim();if(!s)return undefined;
 const rel=s.startsWith('@'),body=rel?s.slice(1):s,origin:Pt=rel?(last??[0,0]):[0,0];
 if(body.includes('<')){const [d,a]=body.split('<'),r=parseLength(d),deg=Number(a);if(r===undefined||!Number.isFinite(deg))return undefined;return polar(origin,r,deg);}
 if(body.includes(',')){const [x,y]=body.split(',').map(parseLength);if(x===undefined||y===undefined)return undefined;return [origin[0]+x,origin[1]+y];}
 if(!rel&&last&&cursor){const d=parseLength(body);if(d===undefined)return undefined;const v=sub(cursor,last),l=len(v);if(l<1e-12)return undefined;return add(last,mul(v,d/l));}
 return undefined;
}

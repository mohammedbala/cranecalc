import {sheetEntities,sheetLayers} from '../components/svgEntities';
import {sheetFormat} from '../components/sheetGraphics';
import {cadLayers,type CadDrawing} from '../components/drafting';
import {dxfDocument,type DxfEntity,type DxfLayer} from '../components/sheetDxf';
import {bulgeArc} from './curves';
import {fillTrapezoids} from './hatch';
import {fonts,primEnts,primitives,textStyleOf} from './annotation';
import {plotColor} from './render';
import {attdefText,flatten} from './blocks';
import {clippedContents,viewportContents} from './layout';
import {DEG,arcPoint,hatchLines,isComposite,polyOutline,clipSegment,curveSamples,dimGeometry,effective,ellipseSweep,pieces,sweep,type Box,type CadDoc,type CadLayer,type Ent,type LineType,type Pt} from './model';

const layer=(name:string,color:number,ltype:LineType,weight:number):CadLayer=>({name,color,ltype,weight,visible:true,locked:false});

/** An issued sheet as an editable drawing in paper inches (US) or millimeters (SI). */
export function docFromSheet(sheet:{number:string;title:string;svg:string},units:'US'|'SI'):CadDoc{
 const k=units==='US'?1/72:25.4/72,raw=sheetEntities(sheet.svg,units);
 const layers=[layer('0',7,'Continuous',25),...Object.entries(sheetLayers).map(([name,l])=>layer(name,l.color,l.ltype,l.weight))];
 for(const e of raw)if(!layers.some(l=>l.name===e.layer))layers.push(layer(e.layer,7,'Continuous',25));
 const entities=raw.map((e,i)=>({...e,id:i+1}) as Ent);
 return {key:sheet.number,title:sheet.title,unit:units==='US'?'in':'mm',display:units,realPerUnit:units==='US'?25.4:1,
  width:sheetFormat.width*k,height:sheetFormat.height*k,svgScale:k,layers,entities,nextId:entities.length+1};
}

const sketchLtype=(dash:string):LineType=>dash==='5 3'?'HIDDEN':dash==='14 3 2 3'?'CENTER':dash?'DASHED':'Continuous';
/** An engineering sketch as an editable drawing in sketch units, y up. */
export function docFromSketch(d:CadDrawing,units:'US'|'SI'):CadDoc{
 const layers=[layer('0',7,'Continuous',25),...Object.entries(cadLayers).map(([name,l])=>layer(name,l.color,sketchLtype(l.dash),l.weight))];
 const y=(p:[number,number]):Pt=>[p[0],d.height-p[1]];
 const entities=d.entities.map((e,i):Ent=>{
  const id=i+1;
  switch(e.type){
   case 'line':return {id,type:'line',layer:e.layer,a:y(e.a),b:y(e.b)};
   case 'polyline':return {id,type:'poly',layer:e.layer,points:e.points.map(y),closed:e.closed};
   case 'circle':return {id,type:'circle',layer:e.layer,center:y(e.center),radius:e.radius};
   case 'text':return {id,type:'text',layer:e.layer,at:y(e.at),height:e.size*.716,value:e.text,angle:-e.angle,align:e.align==='middle'?1:e.align==='end'?2:0,bold:false};
  }
 });
 return {key:d.number,title:d.title,unit:'unit',display:units,realPerUnit:d.mmPerUnit,width:d.width,height:d.height,svgScale:1,layers,entities,nextId:entities.length+1};
}

// ---- SVG ---------------------------------------------------------------------------------------------------------
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const r=(v:number)=>Number(v.toFixed(3));
/** Linetype dash patterns in paper inches (dash, gap, ...; a 0 dash is a dot): AutoCAD's acad.lin at a quarter. */
export const linePatterns:Record<LineType,{pattern:number[];description:string}>={
 Continuous:{pattern:[],description:'Solid line'},
 DASHED:{pattern:[.125,.0625],description:'Dashed __ __ __ __'},
 HIDDEN:{pattern:[.0625,.03125],description:'Hidden _ _ _ _ _ _'},
 CENTER:{pattern:[.25,.0625,.0625,.0625],description:'Center ____ _ ____ _'},
 PHANTOM:{pattern:[.3125,.0625,.0625,.0625,.0625,.0625],description:'Phantom _____ _ _ _____'},
 DASHDOT:{pattern:[.125,.0625,0,.0625],description:'Dash dot __ . __ . __'},
 DOT:{pattern:[0,.0625],description:'Dot . . . . . . .'},
 BORDER:{pattern:[.125,.0625,.125,.0625,0,.0625],description:'Border __ __ . __ __ .'},
 DIVIDE:{pattern:[.125,.0625,0,.0625,0,.0625],description:'Divide __ . . __ . .'},
 DASHED2:{pattern:[.0625,.03125],description:'Dashed (.5x) _ _ _ _'},
 HIDDEN2:{pattern:[.03125,.015625],description:'Hidden (.5x) _ _ _ _'},
 CENTER2:{pattern:[.125,.03125,.03125,.03125],description:'Center (.5x) ___ _ ___'},
};
/** Dash patterns in drawing units, times the linetype scale. */
export function dashPattern(ltype:LineType,unit:CadDoc['unit'],scale=1):number[]{
 const base=linePatterns[ltype]?.pattern??[];if(!base.length)return [];
 const k=(unit==='in'?1:unit==='mm'?25.4:72)*scale;
 return base.map(v=>v*k);
}
/** The four linetypes the shared drawing-set DXF writes, for the others. */
export const basicLtype=(l:LineType):'Continuous'|'DASHED'|'CENTER'|'HIDDEN'=>l==='Continuous'||l==='DASHED'||l==='CENTER'||l==='HIDDEN'?l:l==='DOT'||l==='HIDDEN2'?'HIDDEN':l==='DASHED2'?'DASHED':'CENTER';
/** Plotted line width of a layer in drawing units (lineweight in 1/100 mm). */
export const plotWidth=(l:CadLayer,unit:CadDoc['unit'])=>unit==='in'?l.weight/2540:unit==='mm'?l.weight/100:l.weight/23;
/** Plotted ink by color and plot style: black (the gray layers gray) by default. */
export const plotInk=(color:number,style?:CadDoc['plotStyle'])=>plotColor(color,style);
const sketchInk=(name:string,color:number)=>name in cadLayers?`var(--cad-${name.toLowerCase()},${cadLayers[name as keyof typeof cadLayers].ink})`:plotInk(color);

/** The drawing as an SVG; trueSize gives it its paper width and height (plotting at true scale). */
export function docToSvg(doc:CadDoc,opts:{trueSize?:boolean;lineweights?:boolean}={}){
 const k=doc.svgScale,W=doc.width/k,H=doc.height/k,X=(p:Pt)=>`${r(p[0]/k)},${r((doc.height-p[1])/k)}`,sketch=doc.unit==='unit';
 const byName=new Map(doc.layers.map(l=>[l.name,l]));
 let out='',open='';
 const lts=doc.ltscale??1,ps=doc.plotStyle,pw=(l:CadLayer)=>opts.lineweights===false?plotWidth({...l,weight:18},doc.unit):plotWidth(l,doc.unit);
 const style=(l:CadLayer)=>{const ink=sketch?sketchInk(l.name,l.color):plotInk(l.color,ps),dash=dashPattern(l.ltype,doc.unit,lts).map(v=>r(v/k)).join(' ');
  return `stroke="${ink}" fill="none" stroke-width="${r(pw(l)/k)}"${dash?` stroke-dasharray="${dash}"`:''} style="color:${ink}"`;};
 const text=(at:Pt,height:number,value:string,angle:number,align:number,bold:boolean,styleName?:string)=>{
  const [x,y]=X(at).split(','),size=r(height/.716/k),st=textStyleOf(styleName,doc),wf=st.widthFactor||1;
  const tf=[angle?`rotate(${r(-angle)} ${x} ${y})`:'',wf!==1||st.oblique?`translate(${x} ${y})${wf!==1?` scale(${r(wf)} 1)`:''}${st.oblique?` skewX(${r(-st.oblique)})`:''} translate(${-x} ${-y})`:''].filter(Boolean).join(' ');
  return `<text x="${x}" y="${y}" font-size="${size}"${bold||st.bold?' font-weight="700"':''}${st.font!=='Arial'?` font-family='${fonts[st.font]??fonts.Arial}'`:''}${align?` text-anchor="${align===1?'middle':'end'}"`:''}${tf?` transform="${tf}"`:''} fill="currentColor" stroke="none">${esc(value)}</text>`;
 };
 const arc=(c:Pt,rad:number,start:number,end:number)=>{const s=arcPoint({center:c,radius:rad},start),e=arcPoint({center:c,radius:rad},end),sw=sweep(start,end);return `<path d="M${X(s)}A${r(rad/k)},${r(rad/k)} 0 ${sw>180?1:0} 0 ${X(e)}"/>`;};
 const sheetBox:Box=[0,0,doc.width,doc.height];
 // An object's own color, linetype or lineweight overrides its layer's group style.
 const own=(e:Ent,l:CadLayer)=>{
  if(e.color===undefined&&e.ltype===undefined&&e.weight===undefined&&e.ltscale===undefined)return '';
  const f=effective(e,l),ink=sketch&&e.color===undefined?sketchInk(l.name,l.color):plotInk(f.color,ps),dash=dashPattern(f.ltype,doc.unit,f.ltscale*lts).map(v=>r(v/k)).join(' ');
  return ` stroke="${ink}" stroke-width="${r(pw({...l,weight:f.weight})/k)}" stroke-dasharray="${dash||'none'}" style="color:${ink}"`;
 };
 let clips=0;
 const body=(list:Ent[])=>{for(const e of flatten(list,doc)){
  const l=byName.get(e.layer);if(!l||!l.visible)continue;
  // A viewport: what it shows, clipped to it, then its border.
  if(e.type==='viewport'){
   if(open)out+='</g>';open='';const id=`vp${esc(doc.key)}-${++clips}`,[x,y]=X([e.at[0]-e.width/2,e.at[1]+e.height/2]).split(',');
   out+=`<clipPath id="${id}"><rect x="${x}" y="${y}" width="${r(e.width/k)}" height="${r(e.height/k)}"/></clipPath><g clip-path="url(#${id})">`;
   body(viewportContents(e,doc));if(open)out+='</g>';open='';out+='</g>';
  }
  if(open!==e.layer){if(open)out+='</g>';out+=`<g data-layer="${esc(e.layer)}" ${style(l)}>`;open=e.layer;}
  const o=own(e,l),line=(a:Pt,b:Pt)=>`<line x1="${X(a).split(',')[0]}" y1="${X(a).split(',')[1]}" x2="${X(b).split(',')[0]}" y2="${X(b).split(',')[1]}"${o}/>`;
  const wrap=(svg:string)=>o?`<g${o}>${svg}</g>`:svg;
  switch(e.type){
   case 'line':out+=line(e.a,e.b);break;
   case 'poly':{
    if(!e.bulges?.some(v=>v)){out+=e.closed?`<path d="M${e.points.map(X).join('L')}Z"${o}/>`:`<polyline points="${e.points.map(X).join(' ')}"${o}/>`;break;}
    let d=`M${X(e.points[0])}`;const n=e.points.length,segs=e.closed&&n>2?n:n-1;
    for(let i=0;i<segs;i++){const a=e.points[i],b=e.points[(i+1)%n],g=bulgeArc(a,b,e.bulges[i]??0);d+=g?`A${r(g.r/k)},${r(g.r/k)} 0 ${Math.abs(g.sweep)>180?1:0} ${g.sweep>0?0:1} ${X(b)}`:`L${X(b)}`;}
    out+=`<path d="${d}${e.closed&&n>2?'Z':''}"${o}/>`;break;
   }
   case 'solid':out+=`<path d="M${e.points.map(X).join('L')}Z" fill="currentColor" stroke="none"${o}/>`;break;
   case 'circle':out+=`<circle cx="${r(e.center[0]/k)}" cy="${r((doc.height-e.center[1])/k)}" r="${r(e.radius/k)}"${o}/>`;break;
   case 'arc':out+=wrap(arc(e.center,e.radius,e.start,e.end));break;
   case 'ellipse':{
    const rx=Math.hypot(e.major[0],e.major[1]),ry=rx*e.ratio,rot=r(-Math.atan2(e.major[1],e.major[0])/DEG),[cx,cy]=X(e.center).split(',');
    if(ellipseSweep(e)>=360){out+=`<ellipse cx="${cx}" cy="${cy}" rx="${r(rx/k)}" ry="${r(ry/k)}"${rot?` transform="rotate(${rot} ${cx} ${cy})"`:''}${o}/>`;break;}
    const s=curveSamples(e),p0=s[0].p,p1=s[s.length-1].p;
    out+=`<path d="M${X(p0)}A${r(rx/k)},${r(ry/k)} ${rot} ${ellipseSweep(e)>180?1:0} 0 ${X(p1)}"${o}/>`;break;
   }
   case 'spline':out+=`<polyline points="${curveSamples(e).map(s=>X(s.p)).join(' ')}"${o}/>`;break;
   case 'hatch':{
    if(e.pattern==='SOLID'){out+=`<path d="${e.loops.map(l=>`M${l.map(X).join('L')}Z`).join('')}" fill="currentColor" fill-rule="evenodd" stroke="none"${o}/>`;break;}
    const segs=hatchLines(e,doc.unit);if(segs.length)out+=`<path d="${segs.map(([a,b])=>`M${X(a)}L${X(b)}`).join('')}"${o}/>`;break;
   }
   case 'xline':case 'ray':{const pc=pieces(e)[0];if(pc.k==='seg'){const c=clipSegment(pc.a,pc.b,sheetBox);if(c)out+=line(c[0],c[1]);}break;}
   case 'text':out+=wrap(text(e.at,e.height,e.value,e.angle,e.align,e.bold,e.style));break;
   case 'attdef':out+=wrap(text(e.at,e.height,e.tag,e.angle,e.align,false,e.style));break;
   case 'viewport':{const c=[[e.at[0]-e.width/2,e.at[1]-e.height/2],[e.at[0]+e.width/2,e.at[1]-e.height/2],[e.at[0]+e.width/2,e.at[1]+e.height/2],[e.at[0]-e.width/2,e.at[1]+e.height/2]] as Pt[];out+=`<path d="M${c.map(X).join('L')}Z"${o}/>`;break;}
   case 'dim':case 'mtext':case 'leader':case 'table':out+=wrap((primitives(e,doc)??[]).map(p=>p.k==='line'?line(p.a,p.b):p.k==='arc'?arc(p.c,p.r,p.s,p.e):p.k==='fill'?`<path d="M${p.pts.map(X).join('L')}Z" fill="currentColor" stroke="none"/>`:text(p.at,p.height,p.value,p.angle,p.align,p.bold,p.style)).join(''));break;
  }
 }};
 body(doc.entities);
 if(open)out+='</g>';
 const paper=`style="fill:${sketch?'var(--cad-paper,#fff)':'#fff'};stroke:none"`;
 const size=opts.trueSize&&!sketch?` width="${r(doc.width)}${doc.unit}" height="${r(doc.height)}${doc.unit}"`:'';
 return `<svg xmlns="http://www.w3.org/2000/svg" class="cad-sheet" data-cad-edited="${esc(doc.key)}"${size} viewBox="0 0 ${r(W)} ${r(H)}" role="img" aria-label="${esc(doc.title)}"><title>${esc(doc.title)}</title><rect class="cad-paper" width="${r(W)}" height="${r(H)}" ${paper}/><g font-family="Arial, Helvetica, sans-serif" stroke-linecap="round" stroke-linejoin="round">${out}</g></svg>`;
}

// ---- DXF ---------------------------------------------------------------------------------------------------------
/** The drawing's DXF layers, with off and locked layers kept. */
export const docDxfLayers=(doc:CadDoc):Record<string,DxfLayer>=>Object.fromEntries(doc.layers.map(l=>[l.name,{color:l.color,weight:l.weight,ltype:basicLtype(l.ltype),off:!l.visible,locked:l.locked}]));
/**
 * DXF entities of the drawing scaled by k, for the shared drawing-set writer: dimensions, multiline text, leaders and
 * tables exploded to lines, arcs, fills and text; ellipses, splines and arc segments of polylines as polylines;
 * construction lines clipped to the sheet; hatches as their pattern lines or solid trapezoids.
 */
export function docDxfEntities(doc:CadDoc,k=1):DxfEntity[]{
 const P=(p:Pt):Pt=>[p[0]*k,p[1]*k],out:DxfEntity[]=[];
 const emit=(list:Ent[])=>{for(const e of flatten(list,doc)){
  switch(e.type){
   case 'viewport':{emit(clippedContents(e,doc));const c=[[e.at[0]-e.width/2,e.at[1]-e.height/2],[e.at[0]+e.width/2,e.at[1]-e.height/2],[e.at[0]+e.width/2,e.at[1]+e.height/2],[e.at[0]-e.width/2,e.at[1]+e.height/2]] as Pt[];out.push({type:'poly',layer:e.layer,points:c.map(P),closed:true});break;}
   case 'line':out.push({type:'line',layer:e.layer,a:P(e.a),b:P(e.b)});break;
   case 'attdef':{const t=attdefText(e);out.push({type:'text',layer:e.layer,at:P(t.at),height:t.height*k,value:t.value,angle:t.angle,align:t.align,bold:false});break;}
   case 'poly':{
    if(!e.bulges?.some(v=>v)){out.push({type:'poly',layer:e.layer,points:e.points.map(P),closed:e.closed});break;}
    const pts=polyOutline(e);
    out.push({type:'poly',layer:e.layer,points:pts.map(P),closed:e.closed});break;
   }
   case 'ellipse':case 'spline':{const s=curveSamples(e).map(v=>P(v.p)),full=e.type==='ellipse'?ellipseSweep(e)>=360:e.closed;if(full)s.pop();out.push({type:'poly',layer:e.layer,points:s,closed:full});break;}
   case 'xline':case 'ray':{const pc=pieces(e)[0];if(pc.k==='seg'){const c=clipSegment(pc.a,pc.b,[0,0,doc.width,doc.height]);if(c)out.push({type:'line',layer:e.layer,a:P(c[0]),b:P(c[1])});}break;}
   case 'hatch':if(e.pattern==='SOLID')for(const t of fillTrapezoids(e.loops))out.push({type:'solid',layer:e.layer,points:t.map(P)});else for(const [a,b] of hatchLines(e,doc.unit))out.push({type:'line',layer:e.layer,a:P(a),b:P(b)});break;
   case 'dim':case 'mtext':case 'leader':case 'table':
    for(const p of primEnts(primitives(e,doc)??[],{layer:e.layer})){
     if(p.type==='line')out.push({type:'line',layer:e.layer,a:P(p.a),b:P(p.b)});
     else if(p.type==='arc')out.push({type:'arc',layer:e.layer,center:P(p.center),radius:p.radius*k,start:p.start,end:p.end});
     else if(p.type==='solid')out.push({type:'solid',layer:e.layer,points:p.points.map(P)});
     else if(p.type==='text')out.push({type:'text',layer:e.layer,at:P(p.at),height:p.height*k,value:p.value,angle:p.angle,align:p.align,bold:p.bold});
    }
    break;
   case 'solid':out.push({type:'solid',layer:e.layer,points:e.points.map(P)});break;
   case 'circle':out.push({type:'circle',layer:e.layer,center:P(e.center),radius:e.radius*k});break;
   case 'arc':out.push({type:'arc',layer:e.layer,center:P(e.center),radius:e.radius*k,start:e.start,end:e.end});break;
   case 'text':out.push({type:'text',layer:e.layer,at:P(e.at),height:e.height*k,value:e.value,angle:e.angle,align:e.align,bold:e.bold});break;
  }
 }};
 emit(doc.entities);
 return out;
}
/**
 * The drawing as an AC1015 DXF: a sheet at full paper size in paper inches or millimeters (plot 1:1); a sketch at
 * real size in inches (US) or millimeters (SI).
 */
export function docToDxf(doc:CadDoc){
 const k=doc.unit==='unit'?doc.realPerUnit/(doc.display==='US'?25.4:1):1;
 return dxfDocument(docDxfEntities(doc,k),doc.display,docDxfLayers(doc),doc.width*k,doc.height*k);
}
/** Degrees to radians, for callers drawing arcs. */
export const rad=(deg:number)=>deg*DEG;

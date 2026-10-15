import {sheetEntities,sheetLayers} from '../components/svgEntities';
import {sheetFormat} from '../components/sheetGraphics';
import {cadLayers,type CadDrawing} from '../components/drafting';
import {dxfDocument,type DxfEntity,type DxfLayer} from '../components/sheetDxf';
import {DEG,arcPoint,dimGeometry,sweep,type CadDoc,type CadLayer,type Ent,type LineType,type Pt} from './model';

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
/** Dash patterns in drawing units. */
export function dashPattern(ltype:LineType,unit:CadDoc['unit']):number[]{
 if(ltype==='Continuous')return [];
 const k=unit==='in'?1:unit==='mm'?25.4:72;
 const base=ltype==='DASHED'?[.125,.0625]:ltype==='HIDDEN'?[.0625,.03125]:[.25,.0625,.0625,.0625];
 return base.map(v=>v*k);
}
/** Plotted line width of a layer in drawing units (lineweight in 1/100 mm). */
export const plotWidth=(l:CadLayer,unit:CadDoc['unit'])=>unit==='in'?l.weight/2540:unit==='mm'?l.weight/100:l.weight/23;
/** Plotted ink by layer color: black, with the gray layers in gray. */
export const plotInk=(color:number)=>color===8?'#5f6670':color===9?'#9aa1a8':'#111';
const sketchInk=(name:string,color:number)=>name in cadLayers?`var(--cad-${name.toLowerCase()},${cadLayers[name as keyof typeof cadLayers].ink})`:plotInk(color);

/** The drawing as an SVG in the coordinates of the sheet it came from (sketches keep their CAD-view colors). */
export function docToSvg(doc:CadDoc){
 const k=doc.svgScale,W=doc.width/k,H=doc.height/k,X=(p:Pt)=>`${r(p[0]/k)},${r((doc.height-p[1])/k)}`,sketch=doc.unit==='unit';
 const byName=new Map(doc.layers.map(l=>[l.name,l]));
 let out='',open='';
 const style=(l:CadLayer)=>{const ink=sketch?sketchInk(l.name,l.color):plotInk(l.color),dash=dashPattern(l.ltype,doc.unit).map(v=>r(v/k)).join(' ');
  return `stroke="${ink}" fill="none" stroke-width="${r(plotWidth(l,doc.unit)/k)}"${dash?` stroke-dasharray="${dash}"`:''} style="color:${ink}"`;};
 const text=(at:Pt,height:number,value:string,angle:number,align:number,bold:boolean)=>{
  const [x,y]=X(at).split(','),size=r(height/.716/k);
  return `<text x="${x}" y="${y}" font-size="${size}"${bold?' font-weight="700"':''}${align?` text-anchor="${align===1?'middle':'end'}"`:''}${angle?` transform="rotate(${r(-angle)} ${x} ${y})"`:''} fill="currentColor" stroke="none">${esc(value)}</text>`;
 };
 const arc=(c:Pt,rad:number,start:number,end:number)=>{const s=arcPoint({center:c,radius:rad},start),e=arcPoint({center:c,radius:rad},end),sw=sweep(start,end);return `<path d="M${X(s)}A${r(rad/k)},${r(rad/k)} 0 ${sw>180?1:0} 0 ${X(e)}"/>`;};
 for(const e of doc.entities){
  const l=byName.get(e.layer);if(!l||!l.visible)continue;
  if(open!==e.layer){if(open)out+='</g>';out+=`<g data-layer="${esc(e.layer)}" ${style(l)}>`;open=e.layer;}
  switch(e.type){
   case 'line':out+=`<line x1="${X(e.a).split(',')[0]}" y1="${X(e.a).split(',')[1]}" x2="${X(e.b).split(',')[0]}" y2="${X(e.b).split(',')[1]}"/>`;break;
   case 'poly':out+=e.closed?`<path d="M${e.points.map(X).join('L')}Z"/>`:`<polyline points="${e.points.map(X).join(' ')}"/>`;break;
   case 'solid':out+=`<path d="M${e.points.map(X).join('L')}Z" fill="currentColor" stroke="none"/>`;break;
   case 'circle':out+=`<circle cx="${r(e.center[0]/k)}" cy="${r((doc.height-e.center[1])/k)}" r="${r(e.radius/k)}"/>`;break;
   case 'arc':out+=arc(e.center,e.radius,e.start,e.end);break;
   case 'text':out+=text(e.at,e.height,e.value,e.angle,e.align,e.bold);break;
   case 'dim':{const g=dimGeometry(e,doc);out+=g.lines.map(([a,b])=>`<line x1="${X(a).split(',')[0]}" y1="${X(a).split(',')[1]}" x2="${X(b).split(',')[0]}" y2="${X(b).split(',')[1]}"/>`).join('')+g.arrows.map(p=>`<path d="M${p.map(X).join('L')}Z" fill="currentColor" stroke="none"/>`).join('')+text(g.text.at,g.text.height,g.text.value,g.text.angle,1,false);break;}
  }
 }
 if(open)out+='</g>';
 const paper=`style="fill:${sketch?'var(--cad-paper,#fff)':'#fff'};stroke:none"`;
 return `<svg xmlns="http://www.w3.org/2000/svg" class="cad-sheet" data-cad-edited="${esc(doc.key)}" viewBox="0 0 ${r(W)} ${r(H)}" role="img" aria-label="${esc(doc.title)}"><title>${esc(doc.title)}</title><rect class="cad-paper" width="${r(W)}" height="${r(H)}" ${paper}/><g font-family="Arial, Helvetica, sans-serif" stroke-linecap="round" stroke-linejoin="round">${out}</g></svg>`;
}

// ---- DXF ---------------------------------------------------------------------------------------------------------
/** The drawing's DXF layers, with off and locked layers kept. */
export const docDxfLayers=(doc:CadDoc):Record<string,DxfLayer>=>Object.fromEntries(doc.layers.map(l=>[l.name,{color:l.color,weight:l.weight,ltype:l.ltype,off:!l.visible,locked:l.locked}]));
/** DXF entities of the drawing scaled by k: dimensions exploded to lines, arrowheads and text. */
export function docDxfEntities(doc:CadDoc,k=1):DxfEntity[]{
 const P=(p:Pt):Pt=>[p[0]*k,p[1]*k],out:DxfEntity[]=[];
 for(const e of doc.entities){
  switch(e.type){
   case 'line':out.push({type:'line',layer:e.layer,a:P(e.a),b:P(e.b)});break;
   case 'poly':out.push({type:'poly',layer:e.layer,points:e.points.map(P),closed:e.closed});break;
   case 'solid':out.push({type:'solid',layer:e.layer,points:e.points.map(P)});break;
   case 'circle':out.push({type:'circle',layer:e.layer,center:P(e.center),radius:e.radius*k});break;
   case 'arc':out.push({type:'arc',layer:e.layer,center:P(e.center),radius:e.radius*k,start:e.start,end:e.end});break;
   case 'text':out.push({type:'text',layer:e.layer,at:P(e.at),height:e.height*k,value:e.value,angle:e.angle,align:e.align,bold:e.bold});break;
   case 'dim':{const g=dimGeometry(e,doc);for(const [a,b] of g.lines)out.push({type:'line',layer:e.layer,a:P(a),b:P(b)});for(const p of g.arrows)out.push({type:'solid',layer:e.layer,points:p.map(P)});out.push({type:'text',layer:e.layer,at:P(g.text.at),height:g.text.height*k,value:g.text.value,angle:g.text.angle,align:1,bold:false});break;}
  }
 }
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

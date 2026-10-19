/**
 * PLOT to PDF at true scale, in the browser: one page the size of the sheet, vector paths with lineweights and
 * linetypes, fills, and text in Helvetica. Colors follow the plot style (monochrome by default).
 */
import {primitives,textStyleOf} from './annotation';
import {bulgeArc} from './curves';
import {flatten} from './blocks';
import {dashPattern} from './convert';
import {fillTrapezoids} from './hatch';
import {clippedContents} from './layout';
import {
 DEG,clipSegment,curveSamples,effective,ellipseSweep,hatchLines,pieces,sweep,textWidthPerHeight,
 type CadDoc,type CadLayer,type Ent,type Pt,
} from './model';
import {plotColor} from './render';

export interface PlotOptions{lineweights:boolean;plotStyle?:CadDoc['plotStyle']}
const f=(v:number)=>{const s=v.toFixed(3);return s.includes('.')?s.replace(/\.?0+$/,''):s;};
const winAnsi=(t:string)=>t.replace(/[–—]/g,'-').replace(/[‘’′]/g,"'").replace(/[“”″]/g,'"').replace(/−/g,'-').replace(/⌀/g,'Ø').replace(/[^\x20-\x7e\xa0-\xff]/g,'?').replace(/[\\()]/g,c=>`\\${c}`);
const rgb=(hex:string)=>{if(hex.startsWith('rgb')){const m=hex.match(/\d+/g)!.map(Number);return m.map(v=>v/255);}const h=hex.slice(1);return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);};
/** Points per drawing unit: paper inches, millimeters, or sketch units (1/72 in). */
export const pointsPerUnit=(unit:CadDoc['unit'])=>unit==='in'?72:unit==='mm'?72/25.4:1;

/** Cubic Bezier pieces of a counterclockwise arc (at most a quarter turn each). */
function arcBeziers(c:Pt,r:number,a0:number,sweep:number):[Pt,Pt,Pt,Pt][]{
 const n=Math.max(1,Math.ceil(Math.abs(sweep)/90-1e-9)),step=sweep/n*DEG,out:[Pt,Pt,Pt,Pt][]=[];
 for(let i=0;i<n;i++){
  const t0=a0*DEG+i*step,t1=t0+step,k=4/3*Math.tan(step/4),p0:Pt=[c[0]+r*Math.cos(t0),c[1]+r*Math.sin(t0)],p3:Pt=[c[0]+r*Math.cos(t1),c[1]+r*Math.sin(t1)];
  out.push([p0,[p0[0]-k*r*Math.sin(t0),p0[1]+k*r*Math.cos(t0)],[p3[0]+k*r*Math.sin(t1),p3[1]-k*r*Math.cos(t1)],p3]);
 }
 return out;
}

/** The sheet as a one-page PDF (a latin-1 byte string). */
export function docToPdf(doc:CadDoc,o:PlotOptions):string{
 const k=pointsPerUnit(doc.unit),W=doc.width*k,H=doc.height*k,layers=new Map(doc.layers.map(l=>[l.name,l])),style=o.plotStyle??doc.plotStyle;
 const P=(p:Pt)=>`${f(p[0]*k)} ${f(p[1]*k)}`;
 let c='1 J 1 j\n';
 const setPen=(e:Ent,l:CadLayer)=>{
  const fx=effective(e,l),[r,g,b]=rgb(plotColor(fx.color,style)),w=o.lineweights?Math.max(.1,fx.weight/100/25.4*72):.5;
  const dash=dashPattern(fx.ltype,doc.unit,fx.ltscale*(doc.ltscale??1)).map(v=>v*k);
  c+=`${f(r)} ${f(g)} ${f(b)} RG ${f(r)} ${f(g)} ${f(b)} rg ${f(w)} w [${dash.map(f).join(' ')}] 0 d\n`;
 };
 const poly=(pts:Pt[],close:boolean,op='S')=>{if(pts.length<2)return;c+=`${P(pts[0])} m ${pts.slice(1).map(p=>`${P(p)} l`).join(' ')}${close?' h':''} ${op}\n`;};
 const arc=(ctr:Pt,r:number,a0:number,sw:number,op='S',start=true)=>{const bz=arcBeziers(ctr,r,a0,sw);if(!bz.length)return;if(start)c+=`${P(bz[0][0])} m `;c+=bz.map(b=>`${P(b[1])} ${P(b[2])} ${P(b[3])} c`).join(' ')+` ${op}\n`;};
 const text=(at:Pt,height:number,value:string,angle:number,align:number,bold:boolean,styleName?:string)=>{
  if(!value)return;
  const st=textStyleOf(styleName,doc),wf=st.widthFactor||1,b=bold||!!st.bold,w=textWidthPerHeight(value,b,st.font)*height*wf,shift=align===1?-w/2:align===2?-w:0;
  const ca=Math.cos(angle*DEG),sa=Math.sin(angle*DEG),x=at[0]+shift*ca,y=at[1]+shift*sa,size=height/.716*k;
  c+=`BT /${b?'F2':'F1'} ${f(size)} Tf ${f(ca*wf)} ${f(sa*wf)} ${f(-sa)} ${f(ca)} ${P([x,y])} Tm (${winAnsi(value)}) Tj ET\n`;
 };
 const draw=(list:Ent[])=>{
  for(const e of flatten(list,doc)){
   const l=layers.get(e.layer);if(!l||!l.visible)continue;
   if(e.type==='viewport'){
    // What the viewport shows, clipped to it; then its border.
    const x0=e.at[0]-e.width/2,y0=e.at[1]-e.height/2;
    c+=`q ${P([x0,y0])} ${f(e.width*k)} ${f(e.height*k)} re W n\n`;draw(clippedContents(e,doc));c+='Q\n';
    setPen(e,l);poly([[x0,y0],[x0+e.width,y0],[x0+e.width,y0+e.height],[x0,y0+e.height]],true);continue;
   }
   setPen(e,l);
   switch(e.type){
    case 'line':poly([e.a,e.b],false);break;
    case 'poly':{
     const n=e.points.length,segs=e.closed&&n>2?n:n-1;c+=`${P(e.points[0])} m `;
     for(let i=0;i<segs;i++){const a=e.points[i],b=e.points[(i+1)%n],g=bulgeArc(a,b,e.bulges?.[i]??0);if(g)arc(g.c,g.r,g.a0,g.sweep,'',false);else c+=`${P(b)} l `;}
     c+=e.closed&&n>2?'h S\n':'S\n';break;
    }
    case 'solid':poly(e.points,true,'f');break;
    case 'circle':arc(e.center,e.radius,0,360,'h S');break;
    case 'arc':arc(e.center,e.radius,e.start,sweep(e.start,e.end));break;
    case 'ellipse':case 'spline':{const s=curveSamples(e).map(v=>v.p);poly(s,e.type==='ellipse'?ellipseSweep(e)>=360:e.closed);break;}
    case 'xline':case 'ray':{const pc=pieces(e)[0];if(pc.k==='seg'){const cl=clipSegment(pc.a,pc.b,[0,0,doc.width,doc.height]);if(cl)poly(cl,false);}break;}
    case 'hatch':if(e.pattern==='SOLID'){for(const t of fillTrapezoids(e.loops))poly(t,true,'f');}else for(const [a,b] of hatchLines(e,doc.unit))poly([a,b],false);break;
    case 'text':text(e.at,e.height,e.value,e.angle,e.align,e.bold,e.style);break;
    case 'attdef':text(e.at,e.height,e.tag,e.angle,e.align,false,e.style);break;
    case 'dim':case 'mtext':case 'leader':case 'table':
     for(const p of primitives(e,doc)??[]){
      if(p.k==='line')poly([p.a,p.b],false);
      else if(p.k==='arc')arc(p.c,p.r,p.s,p.e-p.s);
      else if(p.k==='fill')poly(p.pts,true,'f');
      else text(p.at,p.height,p.value,p.angle,p.align,p.bold,p.style);
     }
     break;
   }
  }
 };
 draw(doc.entities);
 const objs=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(W)} ${f(H)}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
  `<< /Length ${c.length} >>\nstream\n${c}endstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  `<< /Title (${winAnsi(`${doc.key} ${doc.title}`)}) /Producer (CraneCalc CAD) >>`,
 ];
 let out='%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';const offsets:number[]=[];
 objs.forEach((obj,i)=>{offsets.push(out.length);out+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
 const xref=out.length;
 out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n${offsets.map(v=>`${String(v).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length+1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return out;
}
/** The PDF string as bytes for a Blob. */
export const pdfBytes=(s:string)=>Uint8Array.from(s,ch=>ch.charCodeAt(0)&255);

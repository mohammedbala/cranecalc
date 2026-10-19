/**
 * DXF reading, client-side: the header units and extents, layers, linetypes, text and dimension styles, blocks with
 * attribute definitions, groups, and the entities of model and paper space. Entities without a counterpart here
 * (3D solids, images, points, multileaders) are counted and skipped.
 */
import {bulgePoint,splineThrough} from './curves';
import {standardDimStyle,type DimStyle,type TextStyle} from './annotation';
import {hatchPatterns} from './hatch';
import type {BlockDef} from './blocks';
import {
 DEG,lineTypes,polar,
 type CadDoc,type CadGroup,type CadLayer,type Ent,type LineType,type NewEnt,type Pt,
} from './model';

type Pair=[number,string];
export interface DxfImport{doc:CadDoc;skipped:Record<string,number>;notes:string[]}
const num=(v:string|undefined,d=0)=>{const x=v===undefined?NaN:parseFloat(v);return Number.isFinite(x)?x:d;};
/** DXF text to plain text: %% codes and \U+ escapes decoded. */
export function decodeText(t:string){
 return t.replace(/%%[dD]/g,'°').replace(/%%[pP]/g,'±').replace(/%%[cC]/g,'Ø').replace(/%%%/g,'%').replace(/%%[uUoOkK]/g,'').replace(/\\U\+([0-9A-Fa-f]{4})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));
}
/** MTEXT contents to lines: paragraph breaks kept, formatting codes dropped, stacked fractions as a/b. */
export function decodeMtext(t:string){
 let s=t.replace(/\\P/g,'\n').replace(/\\~/g,' ').replace(/\\S([^;^#/]*)[\^#/]([^;]*);/g,'$1/$2');
 s=s.replace(/\\[ACHQTWFfp][^;]*;/g,'').replace(/\\[LlOoKkX]/g,'').replace(/\\\\/g,'\u0000').replace(/(?<!\\)[{}]/g,'').replace(/\\([{}])/g,'$1').replace(/\u0000/g,'\\');
 return decodeText(s);
}
const ltypeOf=(name:string|undefined):LineType|undefined=>{
 if(!name||name==='ByLayer'||name==='BYLAYER')return undefined;
 const n=name.toUpperCase(),hit=lineTypes.find(l=>l.toUpperCase()===n);if(hit)return hit;
 if(n==='CONTINUOUS')return 'Continuous';
 // Linetypes this editor lacks: the nearest family by name.
 return /HIDDEN|DOT/.test(n)?'HIDDEN':/CENTER|DASHDOT|CHAIN/.test(n)?'CENTER':/PHANTOM/.test(n)?'PHANTOM':/DASH/.test(n)?'DASHED':'Continuous';
};

export function readDxf(text:string):DxfImport{
 const lines=text.split(/\r?\n/),pairs:Pair[]=[];
 for(let i=0;i+1<lines.length;i+=2){const c=parseInt(lines[i].trim(),10);if(!Number.isFinite(c))continue;pairs.push([c,lines[i+1].replace(/\s+$/,'')]);}
 const skipped:Record<string,number>={},notes:string[]=[],skip=(t:string)=>{skipped[t]=(skipped[t]??0)+1;};
 const header:Record<string,Pair[]>={},layers:CadLayer[]=[],layerHandles=new Map<string,string>(),textStyles:TextStyle[]=[],dimStyles:DimStyle[]=[];
 const blocks:BlockDef[]=[],model:Ent[]=[],paper:Ent[]=[],handles=new Map<string,Ent>();
 const groups:{name:string;members:string[]}[]=[],groupNames=new Map<string,string>();
 let id=1;
 // Split into records: each starts at a 0 pair.
 type Rec={type:string;pairs:Pair[]};
 const recs:Rec[]=[];{let cur:Rec|undefined;for(const p of pairs){if(p[0]===0){cur={type:p[1],pairs:[]};recs.push(cur);}else cur?.pairs.push(p);}}
 const g=(r:Rec,c:number)=>r.pairs.find(p=>p[0]===c)?.[1];
 const gn=(r:Rec,c:number,d=0)=>num(g(r,c),d);
 const pt=(r:Rec,c:number):Pt=>[gn(r,c),gn(r,c+10)];
 const all=(r:Rec,c:number)=>r.pairs.filter(p=>p[0]===c).map(p=>p[1]);

 // ---- entity conversion ----
 const props=(r:Rec):Omit<Ent,'id'|'type'>&{layer:string}=>{
  const o:Record<string,unknown>={layer:g(r,8)??'0'};const c=g(r,62),lt=ltypeOf(g(r,6)),w=g(r,370),s=g(r,48);
  if(c!==undefined&&+c>0&&+c<256)o.color=+c;if(lt)o.ltype=lt;if(w!==undefined&&+w>=0)o.weight=+w;if(s!==undefined&&+s!==1)o.ltscale=+s;
  return o as Omit<Ent,'id'|'type'>&{layer:string};
 };
 const textAnchor=(r:Rec):{at:Pt;align:0|1|2}=>{
  const h=gn(r,72),v=gn(r,r.type==='ATTDEF'?74:73),at=h||v?pt(r,11):pt(r,10),height=gn(r,40,1),a=gn(r,50)*DEG,up:Pt=[-Math.sin(a),Math.cos(a)];
  const align=(h===1||h===4?1:h===2?2:0) as 0|1|2,dy=h===4||v===2?-height/2:v===3?-height:v===1?.28*height:0;
  return {at:[at[0]+up[0]*dy,at[1]+up[1]*dy],align};
 };
 const dimHeight=(style:string|undefined)=>{const st=dimStyles.find(d=>d.name===style)??dimStyles[0];return st?st.textHeight*st.scale:.09375;};
 function convert(r:Rec,rest:Rec[],i:number):{ent?:NewEnt;used:number;attribs?:Record<string,string>}{
  const pr=props(r);
  switch(r.type){
   case 'LINE':return {ent:{...pr,type:'line',a:pt(r,10),b:pt(r,11)},used:0};
   case 'LWPOLYLINE':{
    const points:Pt[]=[],bulges:number[]=[];
    for(const [c,v] of r.pairs){if(c===10){points.push([num(v),0]);bulges.push(0);}else if(c===20&&points.length)points[points.length-1][1]=num(v);else if(c===42&&points.length)bulges[bulges.length-1]=num(v);}
    if(points.length<2)return {used:0};
    return {ent:{...pr,type:'poly',points,closed:!!(gn(r,70)&1),...(bulges.some(b=>b)?{bulges}:{})},used:0};
   }
   case 'POLYLINE':{
    // Old-style polylines: VERTEX records follow until SEQEND.
    const points:Pt[]=[],bulges:number[]=[];let j=i+1;
    for(;j<rest.length&&rest[j].type==='VERTEX';j++){const v=rest[j];if(gn(v,70)&16)continue;points.push(pt(v,10));bulges.push(gn(v,42));}
    const used=j-i+(rest[j]?.type==='SEQEND'?0:-1);
    if(points.length<2||(gn(r,70)&(16|64)))return {used};
    return {ent:{...pr,type:'poly',points,closed:!!(gn(r,70)&1),...(bulges.some(b=>b)?{bulges}:{})},used};
   }
   case 'CIRCLE':return {ent:{...pr,type:'circle',center:pt(r,10),radius:gn(r,40,1)},used:0};
   case 'ARC':return {ent:{...pr,type:'arc',center:pt(r,10),radius:gn(r,40,1),start:gn(r,50),end:gn(r,51,360)},used:0};
   case 'ELLIPSE':{
    const a0=gn(r,41),a1=gn(r,42,2*Math.PI),full=Math.abs(a1-a0-2*Math.PI)<1e-6||Math.abs(a1-a0)<1e-9;
    return {ent:{...pr,type:'ellipse',center:pt(r,10),major:[gn(r,11),gn(r,21)],ratio:Math.min(1,Math.max(1e-6,gn(r,40,1))),start:full?0:a0/DEG,end:full?360:a1/DEG},used:0};
   }
   case 'SPLINE':{
    const degree=gn(r,71,3),knots=all(r,40).map(Number),xs=all(r,10).map(Number),ys=all(r,20).map(Number),fx=all(r,11).map(Number),fy=all(r,21).map(Number);
    const ctrl=xs.map((x,k)=>[x,ys[k]??0] as Pt),fit=fx.map((x,k)=>[x,fy[k]??0] as Pt),closed=!!(gn(r,70)&1);
    if(ctrl.length>degree&&knots.length===ctrl.length+degree+1)return {ent:{...pr,type:'spline',degree,ctrl,knots,closed,...(fit.length>1?{fit}:{})},used:0};
    const s=fit.length>1?splineThrough(fit,closed):undefined;
    return s?{ent:{...pr,type:'spline',...s,fit,closed},used:0}:{used:0};
   }
   case 'XLINE':case 'RAY':{const d=pt(r,11),l=Math.hypot(d[0],d[1])||1;return {ent:{...pr,type:r.type==='XLINE'?'xline':'ray',base:pt(r,10),dir:[d[0]/l,d[1]/l]},used:0};}
   case 'SOLID':case 'TRACE':{const a=pt(r,10),b=pt(r,11),c=pt(r,12),d=pt(r,13),tri=Math.abs(c[0]-d[0])<1e-12&&Math.abs(c[1]-d[1])<1e-12;return {ent:{...pr,type:'solid',points:tri?[a,b,c]:[a,b,d,c]},used:0};}
   case 'TEXT':{const t=textAnchor(r),v=decodeText(g(r,1)??'');if(!v.trim())return {used:0};const style=g(r,7);return {ent:{...pr,type:'text',at:t.at,height:gn(r,40,.125),value:v,angle:gn(r,50),align:t.align,bold:/BOLD/i.test(style??''),...(style&&style!=='Standard'&&!/^ARIAL(-BOLD)?$/i.test(style)?{style}:{})},used:0};}
   case 'ATTDEF':{const t=textAnchor(r);return {ent:{...pr,type:'attdef',tag:(g(r,2)??'TAG').toUpperCase(),prompt:decodeText(g(r,3)??''),value:decodeText(g(r,1)??''),at:t.at,height:gn(r,40,.125),angle:gn(r,50),align:t.align,...(gn(r,70)&1?{invisible:true}:{})},used:0};}
   case 'MTEXT':{
    const raw=[...all(r,3),g(r,1)??''].join(''),dir=g(r,11)!==undefined?Math.atan2(gn(r,21),gn(r,11))/DEG:gn(r,50),style=g(r,7);
    return {ent:{...pr,type:'mtext',at:pt(r,10),width:gn(r,41),height:gn(r,40,.125),value:decodeMtext(raw),angle:dir,attach:Math.min(9,Math.max(1,gn(r,71,1))),...(style&&style!=='Standard'?{style}:{}),...(g(r,44)&&gn(r,44)!==1?{spacing:gn(r,44)}:{})},used:0};
   }
   case 'DIMENSION':{
    const t=gn(r,70)&7,o=g(r,1),text=o===undefined||o===''||o==='<>'?undefined:decodeText(o),style=g(r,3)??'Standard',base={...pr,type:'dim' as const,height:dimHeight(style),style,...(text?{text}:{})};
    const p10=pt(r,10),p11=pt(r,11),p13=pt(r,13),p14=pt(r,14),p15=pt(r,15),p16=pt(r,16);
    if(t===0){const ang=((gn(r,50)%180)+180)%180;return {ent:{...base,kind:Math.abs(ang-90)<1e-6?'vertical':ang<1e-6||Math.abs(ang-180)<1e-6?'horizontal':'aligned',a:p13,b:p14,at:p10},used:0};}
    if(t===1)return {ent:{...base,kind:'aligned',a:p13,b:p14,at:p10},used:0};
    if(t===5)return {ent:{...base,kind:'angular',a:p13,b:p14,c:p15,at:p10},used:0};
    if(t===2){const r1=[p13,p14],r2=[p15,p10],x=hit(r1[0],r1[1],r2[0],r2[1]);if(!x)return {used:0};return {ent:{...base,kind:'angular',a:p14,b:p10,c:x,at:p16},used:0};}
    if(t===4)return {ent:{...base,kind:'radius',c:p10,a:p15,b:p15,at:p11},used:0};
    if(t===3)return {ent:{...base,kind:'diameter',c:[(p10[0]+p15[0])/2,(p10[1]+p15[1])/2],a:p15,b:p15,at:p11},used:0};
    return {ent:{...base,kind:'ordinate',c:p10,a:p13,b:p13,at:p14,axis:gn(r,70)&64?'x':'y'},used:0};
   }
   case 'LEADER':{
    const xs=all(r,10).map(Number),ys=all(r,20).map(Number),points=xs.map((x,k)=>[x,ys[k]??0] as Pt);if(points.length<2)return {used:0};
    return {ent:{...pr,type:'leader',points,value:'',height:dimHeight(g(r,3)),landing:false,...(g(r,71)==='0'?{arrow:'none' as const}:{})},used:0};
   }
   case 'HATCH':return {ent:hatch(r,pr),used:0};
   case 'INSERT':{
    const sx=gn(r,41,1),sy=gn(r,42,1),name=g(r,2)??'';
    if(Math.abs(Math.abs(sx)-Math.abs(sy))>1e-9*Math.max(1,Math.abs(sx)))notes.push(`${name}: a reference scaled unequally in x and y is placed at its x scale.`);
    const attribs:Record<string,string>={};let j=i+1;
    if(g(r,66)==='1'){for(;j<rest.length&&rest[j].type==='ATTRIB';j++)attribs[(g(rest[j],2)??'').toUpperCase()]=decodeText(g(rest[j],1)??'');}
    const used=g(r,66)==='1'?j-i+(rest[j]?.type==='SEQEND'?0:-1):0;
    return {ent:{...pr,type:'insert',name,at:pt(r,10),scale:Math.abs(sx)||1,rotation:gn(r,50),...(sx<0?{mirror:true}:{}),...(Object.keys(attribs).length?{attribs}:{})},used};
   }
   case 'VIEWPORT':{
    if(gn(r,69)===1)return {used:0};
    const h=gn(r,41),vh=gn(r,45,h)||h,frozen=all(r,331).map(x=>layerHandles.get(x)).filter((x):x is string=>!!x);
    return {ent:{...pr,type:'viewport',at:pt(r,10),width:gn(r,40),height:h,view:pt(r,12),scale:h/vh||1,...(frozen.length?{frozen}:{}),...(gn(r,90)&16384?{locked:true}:{})},used:0};
   }
  }
  skip(r.type);return {used:0};
 }
 const hit=(a:Pt,b:Pt,c:Pt,d:Pt):Pt|undefined=>{const r1=[b[0]-a[0],b[1]-a[1]],s=[d[0]-c[0],d[1]-c[1]],den=r1[0]*s[1]-r1[1]*s[0];if(Math.abs(den)<1e-12)return undefined;const t=((c[0]-a[0])*s[1]-(c[1]-a[1])*s[0])/den;return [a[0]+r1[0]*t,a[1]+r1[1]*t];};
 /** HATCH boundary paths (polyline or edge paths) as loops; patterns this editor lacks become ANSI31. */
 function hatch(r:Rec,pr:Omit<Ent,'id'|'type'>&{layer:string}):NewEnt|undefined{
  const P=r.pairs;let k=P.findIndex(p=>p[0]===91);if(k<0)return undefined;
  const nPaths=num(P[k][1]);k++;const loops:Pt[][]=[];
  const at=(c:number)=>{while(k<P.length&&P[k][0]!==c)k++;return k<P.length?P[k++][1]:undefined;};
  for(let n=0;n<nPaths&&k<P.length;n++){
   const flags=num(at(92));const loop:Pt[]=[];
   if(flags&2){
    const hasBulge=num(at(72)),count=num((at(73),at(93)));const pts:{p:Pt;b:number}[]=[];
    for(let v=0;v<count;v++){const x=num(at(10)),y=num(at(20));let b=0;if(hasBulge&&P[k]?.[0]===42)b=num(P[k++][1]);pts.push({p:[x,y],b});}
    pts.forEach((q,i2)=>{const nx=pts[(i2+1)%pts.length].p;loop.push(q.p);if(q.b){const m=Math.max(2,Math.ceil(Math.abs(4*Math.atan(q.b)/DEG)/6));for(let s=1;s<m;s++)loop.push(bulgePoint(q.p,nx,q.b,s/m));}});
   }else{
    const edges=num(at(93));
    for(let ed=0;ed<edges;ed++){
     const type=num(at(72));
     if(type===1){const a:Pt=[num(at(10)),num(at(20))],b:Pt=[num(at(11)),num(at(21))];if(!loop.length)loop.push(a);loop.push(b);}
     else if(type===2){const c:Pt=[num(at(10)),num(at(20))],rad=num(at(40)),s=num(at(50)),e=num(at(51)),ccw=num(at(73));let sw=((e-s)%360+360)%360||360;const m=Math.max(2,Math.ceil(sw/6));for(let q=0;q<=m;q++){const a=ccw?s+sw*q/m:-(s+sw*q/m);loop.push(polar(c,rad,a));}}
     else if(type===3){const c:Pt=[num(at(10)),num(at(20))],mj:Pt=[num(at(11)),num(at(21))],ratio=num(at(40)),s=num(at(50)),e=num(at(51)),ccw=num(at(73)),mn:Pt=[-mj[1]*ratio,mj[0]*ratio];const sw=((e-s)%360+360)%360||360,m=Math.max(4,Math.ceil(sw/6));for(let q=0;q<=m;q++){const t=(ccw?s+sw*q/m:-(s+sw*q/m))*DEG;loop.push([c[0]+mj[0]*Math.cos(t)+mn[0]*Math.sin(t),c[1]+mj[1]*Math.cos(t)+mn[1]*Math.sin(t)]);}}
     else if(type===4){const nk=(at(94),at(73),at(74),num(at(95))),nc=num(at(96));for(let q=0;q<nk;q++)at(40);const cp:Pt[]=[];for(let q=0;q<nc;q++)cp.push([num(at(10)),num(at(20))]);loop.push(...cp);}
    }
   }
   // Source object handles follow each path.
   const src=num(at(97));for(let q=0;q<src;q++)at(330);
   const clean=loop.filter((q,i2)=>!i2||Math.hypot(q[0]-loop[i2-1][0],q[1]-loop[i2-1][1])>1e-12);
   if(clean.length>3&&Math.hypot(clean[0][0]-clean[clean.length-1][0],clean[0][1]-clean[clean.length-1][1])<1e-9)clean.pop();
   if(clean.length>=3)loops.push(clean);
  }
  if(!loops.length)return undefined;
  const name=(g(r,2)??'SOLID').toUpperCase(),solid=gn(r,70)===1||name==='SOLID',known=name in hatchPatterns;
  if(!solid&&!known)notes.push(`Hatch pattern ${name} is drawn as ANSI31.`);
  return {...pr,type:'hatch',loops,pattern:solid?'SOLID':known?name:'ANSI31',scale:gn(r,41,1)||1,angle:gn(r,52)};
 }

 // ---- walk the sections ----
 let section='',block:BlockDef|undefined;
 for(let i=0;i<recs.length;i++){
  const r=recs[i];
  if(r.type==='SECTION'){
   section=g(r,2)??'';
   // The header's variables are 9 (name) and value pairs inside the section record itself.
   if(section==='HEADER'){let name='';for(const p of r.pairs){if(p[0]===9){name=p[1];header[name]=[];}else if(name)header[name].push(p);}}
   continue;
  }
  if(r.type==='ENDSEC'){section='';continue;}
  if(section==='TABLES'){
   if(r.type==='LAYER'){const c=gn(r,62,7),name=g(r,2)??'0';if(g(r,5))layerHandles.set(g(r,5)!,name);
    layers.push({name,color:Math.abs(c)||7,ltype:ltypeOf(g(r,6))??'Continuous',weight:g(r,370)!==undefined&&+g(r,370)!>=0?+g(r,370)!:25,visible:c>=0,locked:!!(gn(r,70)&4)});}
   else if(r.type==='STYLE'){const name=g(r,2)??'';if(name&&!(gn(r,70)&1)&&!/^ARIAL(-BOLD)?$/i.test(name)){const font=(g(r,3)??'').toLowerCase();
    textStyles.push({name,font:font.startsWith('times')?'Times New Roman':font.startsWith('cour')?'Courier New':font.startsWith('arialn')?'Arial Narrow':'Arial',widthFactor:gn(r,41,1)||1,oblique:gn(r,50),height:gn(r,40),...(/bd|bold/.test(font)?{bold:true}:{})});}}
   else if(r.type==='DIMSTYLE'){const name=g(r,2)??'';if(name){const base=standardDimStyle('in'),lu=gn(r,277,2),blk=(g(r,5)??g(r,342)??'').toUpperCase();
    dimStyles.push({...base,name,textHeight:gn(r,140,base.textHeight),arrowSize:gn(r,41,base.arrowSize),extOffset:gn(r,42,base.extOffset),extBeyond:gn(r,44,base.extBeyond),textGap:Math.abs(gn(r,147,base.textGap)),
     textPos:gn(r,77,1)?'above':'centered',units:lu===4||lu===6?'arch':'decimal',precision:lu===4||lu===6?2**gn(r,271,4):gn(r,271,2),scale:gn(r,40,1)||1,baseline:gn(r,43,base.baseline),
     arrow:/TICK|OBLIQUE/.test(blk)?'tick':/DOT/.test(blk)?'dot':/OPEN/.test(blk)?'open':/NONE/.test(blk)?'none':'closed'});}}
   continue;
  }
  if(section==='BLOCKS'){
   if(r.type==='BLOCK'){const name=g(r,2)??'';block=name.startsWith('*')?undefined:{name,base:pt(r,10),entities:[]};if(name.startsWith('*')&&!/^\*(Model|Paper)_Space/i.test(name)&&!/^\*D\d/i.test(name))skip('anonymous block');continue;}
   if(r.type==='ENDBLK'){if(block)blocks.push(block);block=undefined;continue;}
   if(!block)continue;
   const c=convert(r,recs,i);i+=Math.max(0,c.used);if(c.ent)block.entities.push({...c.ent,id:block.entities.length+1} as Ent);continue;
  }
  if(section==='ENTITIES'){
   const c=convert(r,recs,i);i+=Math.max(0,c.used);
   if(c.ent){const e={...c.ent,id:id++} as Ent;(g(r,67)==='1'?paper:model).push(e);if(g(r,5))handles.set(g(r,5)!,e);}
   continue;
  }
  if(section==='OBJECTS'){
   if(r.type==='DICTIONARY'){const names=all(r,3),refs=all(r,350);names.forEach((n,k)=>{if(refs[k])groupNames.set(refs[k],n);});}
   else if(r.type==='GROUP'){groups.push({name:groupNames.get(g(r,5)??'')??`*A${groups.length+1}`,members:all(r,340)});}
  }
 }

 // ---- the drawing ----
 const ins=num(header.$INSUNITS?.find(p=>p[0]===70)?.[1],-1),meas=num(header.$MEASUREMENT?.find(p=>p[0]===70)?.[1],0);
 const unit:CadDoc['unit']=ins===1?'in':ins===4?'mm':ins===5?'mm':meas===1?'mm':'in';
 if(ins!==1&&ins!==4&&ins>0)notes.push(`Drawing units code ${ins} read as ${unit==='in'?'inches':'millimeters'}.`);
 if(!layers.some(l=>l.name==='0'))layers.unshift({name:'0',color:7,ltype:'Continuous',weight:25,visible:true,locked:false});
 const used=new Set([...model,...paper,...blocks.flatMap(b=>b.entities)].map(e=>e.layer));
 for(const n of used)if(!layers.some(l=>l.name===n))layers.push({name:n,color:7,ltype:'Continuous',weight:25,visible:true,locked:false});
 const viewports=paper.filter(e=>e.type==='viewport'),isLayout=viewports.length>0;
 const xy=(v:Pair[]|undefined)=>v?[num(v.find(p=>p[0]===10)?.[1]),num(v.find(p=>p[0]===20)?.[1])]:[0,0];
 const sheet=isLayout?paper:model,lim=xy(header.$LIMMAX),em=xy(header.$EXTMAX),ext=isLayout?lim:[Math.max(lim[0],em[0]),Math.max(lim[1],em[1])];
 const maxX=Math.max(ext[0],...sheet.flatMap(e=>'at' in e&&Array.isArray(e.at)?[e.at[0]]:'a' in e&&Array.isArray(e.a)?[e.a[0],(e as {b:Pt}).b[0]]:[])),maxY=Math.max(ext[1],...sheet.flatMap(e=>'at' in e&&Array.isArray(e.at)?[e.at[1]]:'a' in e&&Array.isArray(e.a)?[e.a[1],(e as {b:Pt}).b[1]]:[]));
 const groupList:CadGroup[]=groups.map(gr=>({name:gr.name,ids:gr.members.map(h=>handles.get(h)?.id).filter((x):x is number=>x!==undefined)})).filter(gr=>gr.ids.length);
 const doc:CadDoc={key:'IMPORT',title:'Imported drawing',unit,display:unit==='in'?'US':'SI',realPerUnit:unit==='in'?25.4:1,width:Math.max(1,maxX),height:Math.max(1,maxY),svgScale:unit==='in'?1/72:25.4/72,
  layers,entities:sheet,nextId:id,
  ...(isLayout?{model:{entities:model,nextId:id,annoScale:viewports[0].type==='viewport'?viewports[0].scale:1/48}}:{}),
  ...(blocks.length?{blocks}:{}),...(textStyles.length?{textStyles}:{}),...(dimStyles.length?{dimStyles}:{}),...(groupList.length?{groups:groupList}:{}),
  ...(header.$LTSCALE&&num(header.$LTSCALE.find(p=>p[0]===40)?.[1],1)!==1?{ltscale:num(header.$LTSCALE.find(p=>p[0]===40)?.[1],1)}:{})};
 return {doc,skipped,notes};
}

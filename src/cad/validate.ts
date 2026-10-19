import {hatchPatterns} from './hatch';
import {lineTypes,type BlockDef,type CadDoc,type CadGroup,type CadLayer,type Ent,type EntProps,type Pt} from './model';

/**
 * An edited drawing received from outside (the report service): accepted only if every field has the expected type,
 * every coordinate is finite and the sizes are bounded, so the report renders it with docToSvg like its own drawings.
 */
export function parseCadDoc(x:unknown):CadDoc|undefined{
 const o=x as Record<string,unknown>;if(!o||typeof o!=='object')return undefined;
 const n=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<1e9;
 const str=(v:unknown,max=2000):v is string=>typeof v==='string'&&v.length<=max;
 const pt=(v:unknown):v is Pt=>Array.isArray(v)&&v.length===2&&n(v[0])&&n(v[1]);
 const pts=(v:unknown,min:number):v is Pt[]=>Array.isArray(v)&&v.length>=min&&v.length<=100000&&v.every(pt);
 if(!str(o.key,40)||!str(o.title,400)||!['in','mm','unit'].includes(o.unit as string)||!['US','SI'].includes(o.display as string))return undefined;
 if(!n(o.realPerUnit)||!n(o.width)||!n(o.height)||!n(o.svgScale)||!n(o.nextId)||o.realPerUnit<=0||o.width<=0||o.height<=0||o.svgScale<=0)return undefined;
 if(!Array.isArray(o.layers)||o.layers.length>2000||!Array.isArray(o.entities)||o.entities.length>300000)return undefined;
 const layers:CadLayer[]=[];
 for(const l of o.layers as Record<string,unknown>[]){
  if(!l||!str(l.name,80)||!n(l.color)||!n(l.weight)||!lineTypes.includes(l.ltype as CadLayer['ltype'])||typeof l.visible!=='boolean'||typeof l.locked!=='boolean')return undefined;
  layers.push({name:l.name,color:l.color,weight:l.weight,ltype:l.ltype as CadLayer['ltype'],visible:l.visible,locked:l.locked});
 }
 const names=new Set(layers.map(l=>l.name)),entities:Ent[]=[];
 const entity=(e:Record<string,unknown>,depth:number):Ent|undefined=>{
  if(!e||!n(e.id)||!str(e.layer,80)||!names.has(e.layer))return undefined;
  // Object properties are optional (ByLayer when absent).
  if(e.color!==undefined&&(!n(e.color)||e.color<0||e.color>256))return undefined;
  if(e.ltype!==undefined&&!lineTypes.includes(e.ltype as CadLayer['ltype']))return undefined;
  if(e.weight!==undefined&&(!n(e.weight)||e.weight<0||e.weight>211))return undefined;
  if(e.ltscale!==undefined&&(!n(e.ltscale)||e.ltscale<=0))return undefined;
  if(e.annotative!==undefined&&typeof e.annotative!=='boolean')return undefined;
  if(e.src!==undefined&&!str(e.src,40))return undefined;
  const base:EntProps&{id:number}={id:e.id,layer:e.layer};
  if(e.color!==undefined)base.color=e.color as number;if(e.ltype!==undefined)base.ltype=e.ltype as CadLayer['ltype'];if(e.weight!==undefined)base.weight=e.weight as number;if(e.ltscale!==undefined)base.ltscale=e.ltscale as number;if(e.annotative)base.annotative=true;if(e.src)base.src=e.src as string;
  switch(e.type){
   case 'line':if(!pt(e.a)||!pt(e.b))return undefined;return ({...base,type:'line',a:e.a,b:e.b});break;
   case 'poly':{if(!pts(e.points,2)||typeof e.closed!=='boolean')return undefined;
    const b=e.bulges;if(b!==undefined&&(!Array.isArray(b)||b.length!==(e.points as Pt[]).length||!b.every(n)))return undefined;
    return ({...base,type:'poly',points:e.points,closed:e.closed,...(b?{bulges:b as number[]}:{})});break;}
   case 'ellipse':if(!pt(e.center)||!pt(e.major)||Math.hypot(e.major[0],e.major[1])<=0||!n(e.ratio)||e.ratio<=0||e.ratio>1||!n(e.start)||!n(e.end))return undefined;
    return ({...base,type:'ellipse',center:e.center,major:e.major,ratio:e.ratio,start:e.start,end:e.end});break;
   case 'spline':{
    if(!n(e.degree)||!Number.isInteger(e.degree)||e.degree<1||e.degree>5||!pts(e.ctrl,2)||typeof e.closed!=='boolean')return undefined;
    const k=e.knots,c=(e.ctrl as Pt[]).length;if(!Array.isArray(k)||k.length!==c+e.degree+1||!k.every(n)||k.some((v,i)=>i&&v<k[i-1]))return undefined;
    if(e.fit!==undefined&&!pts(e.fit,2))return undefined;
    return ({...base,type:'spline',degree:e.degree,ctrl:e.ctrl,knots:k as number[],closed:e.closed,...(e.fit?{fit:e.fit as Pt[]}:{})});break;
   }
   case 'hatch':{
    const ls=e.loops;if(!Array.isArray(ls)||!ls.length||ls.length>2000||!ls.every(l=>pts(l,3))||typeof e.pattern!=='string'||!(e.pattern in hatchPatterns)||!n(e.scale)||e.scale<=0||!n(e.angle)||(e.origin!==undefined&&!pt(e.origin)))return undefined;
    return ({...base,type:'hatch',loops:ls as Pt[][],pattern:e.pattern,scale:e.scale,angle:e.angle,...(e.origin?{origin:e.origin as Pt}:{})});break;
   }
   case 'xline':case 'ray':if(!pt(e.base)||!pt(e.dir)||Math.abs(Math.hypot(e.dir[0],e.dir[1])-1)>1e-6)return undefined;return ({...base,type:e.type,base:e.base,dir:e.dir});break;
   case 'solid':if(!pts(e.points,3)||(e.points as Pt[]).length>4)return undefined;return ({...base,type:'solid',points:e.points});break;
   case 'circle':if(!pt(e.center)||!n(e.radius)||e.radius<=0)return undefined;return ({...base,type:'circle',center:e.center,radius:e.radius});break;
   case 'arc':if(!pt(e.center)||!n(e.radius)||e.radius<=0||!n(e.start)||!n(e.end))return undefined;return ({...base,type:'arc',center:e.center,radius:e.radius,start:e.start,end:e.end});break;
   case 'text':if(!pt(e.at)||!n(e.height)||e.height<=0||!str(e.value)||!n(e.angle)||![0,1,2].includes(e.align as number)||typeof e.bold!=='boolean'||(e.style!==undefined&&!str(e.style,80)))return undefined;
    return ({...base,type:'text',at:e.at,height:e.height,value:e.value,angle:e.angle,align:e.align as 0|1|2,bold:e.bold,...(e.style?{style:e.style as string}:{})});break;
   case 'mtext':if(!pt(e.at)||!n(e.width)||e.width<0||!n(e.height)||e.height<=0||!str(e.value,20000)||!n(e.angle)||!n(e.attach)||!Number.isInteger(e.attach)||e.attach<1||e.attach>9||(e.style!==undefined&&!str(e.style,80))||(e.spacing!==undefined&&(!n(e.spacing)||e.spacing<=0))||(e.bold!==undefined&&typeof e.bold!=='boolean'))return undefined;
    return ({...base,type:'mtext',at:e.at,width:e.width,height:e.height,value:e.value,angle:e.angle,attach:e.attach,...(e.style?{style:e.style as string}:{}),...(e.spacing?{spacing:e.spacing as number}:{}),...(e.bold?{bold:true}:{})});break;
   case 'leader':if(!pts(e.points,2)||!str(e.value,20000)||!n(e.height)||e.height<=0||(e.arrow!==undefined&&!['closed','open','tick','dot','none'].includes(e.arrow as string))||(e.landing!==undefined&&typeof e.landing!=='boolean')||(e.style!==undefined&&!str(e.style,80)))return undefined;
    return ({...base,type:'leader',points:e.points,value:e.value,height:e.height,...(e.arrow?{arrow:e.arrow as 'closed'}:{}),...(e.landing!==undefined?{landing:e.landing as boolean}:{}),...(e.style?{style:e.style as string}:{})});break;
   case 'table':{
    const cols=e.cols,rows=e.rows,cells=e.cells;
    if(!pt(e.at)||!Array.isArray(cols)||!cols.length||cols.length>200||!cols.every(v=>n(v)&&v>0)||!Array.isArray(rows)||!rows.length||rows.length>5000||!rows.every(v=>n(v)&&v>0)||!n(e.height)||e.height<=0)return undefined;
    if(!Array.isArray(cells)||cells.length>rows.length||!cells.every(r=>Array.isArray(r)&&r.length<=cols.length&&r.every(c=>str(c,2000))))return undefined;
    if((e.header!==undefined&&(!n(e.header)||e.header<0))||(e.align!==undefined&&(!Array.isArray(e.align)||!e.align.every(a=>['left','center','right'].includes(a))))||(e.title!==undefined&&!str(e.title,400))||(e.source!==undefined&&!str(e.source,80))||(e.generated!==undefined&&(!Array.isArray(e.generated)||e.generated.length>5000||!e.generated.every(r=>Array.isArray(r)&&r.length<=200&&r.every(c=>str(c,2000))))))return undefined;
    return ({...base,type:'table',at:e.at,cols:cols as number[],rows:rows as number[],cells:cells as string[][],height:e.height,...(e.header?{header:e.header as number}:{}),...(e.align?{align:e.align as ('left'|'center'|'right')[]}:{}),...(e.title?{title:e.title as string}:{}),...(e.source?{source:e.source as string}:{}),...(e.generated?{generated:e.generated as string[][]}:{})});break;
   }
   case 'dim':if(!['aligned','horizontal','vertical','angular','radius','diameter','ordinate'].includes(e.kind as string)||!pt(e.a)||!pt(e.b)||!pt(e.at)||!n(e.height)||e.height<=0||(e.text!==undefined&&!str(e.text,400))||(e.c!==undefined&&!pt(e.c))||(e.style!==undefined&&!str(e.style,80))||(e.axis!==undefined&&e.axis!=='x'&&e.axis!=='y'))return undefined;
    if((e.kind==='angular'||e.kind==='radius'||e.kind==='diameter')&&!pt(e.c))return undefined;
    return ({...base,type:'dim',kind:e.kind as 'aligned',a:e.a,b:e.b,at:e.at,height:e.height,text:e.text as string|undefined,...(e.c?{c:e.c as Pt}:{}),...(e.style?{style:e.style as string}:{}),...(e.axis?{axis:e.axis as 'x'|'y'}:{})});break;
   case 'attdef':if(!str(e.tag,80)||!(e.tag as string).trim()||!str(e.prompt,200)||!str(e.value)||!pt(e.at)||!n(e.height)||e.height<=0||!n(e.angle)||![0,1,2].includes(e.align as number)||(e.invisible!==undefined&&typeof e.invisible!=='boolean')||(e.style!==undefined&&!str(e.style,80)))return undefined;
    return ({...base,type:'attdef',tag:e.tag as string,prompt:e.prompt,value:e.value,at:e.at,height:e.height,angle:e.angle,align:e.align as 0|1|2,...(e.invisible?{invisible:true}:{}),...(e.style?{style:e.style as string}:{})});
   case 'insert':{
    if(depth>8||!str(e.name,120)||!pt(e.at)||!n(e.scale)||e.scale===0||!n(e.rotation)||(e.mirror!==undefined&&typeof e.mirror!=='boolean'))return undefined;
    const at=e.attribs;if(at!==undefined&&(typeof at!=='object'||at===null||Array.isArray(at)||Object.keys(at).length>200||!Object.entries(at).every(([k,v])=>str(k,80)&&str(v))))return undefined;
    return ({...base,type:'insert',name:e.name,at:e.at,scale:e.scale,rotation:e.rotation,...(e.mirror?{mirror:true}:{}),...(at?{attribs:{...(at as Record<string,string>)}}:{})});
   }
   case 'viewport':{
    if(depth>0||!pt(e.at)||!n(e.width)||e.width<=0||!n(e.height)||e.height<=0||!pt(e.view)||!n(e.scale)||e.scale<=0||(e.locked!==undefined&&typeof e.locked!=='boolean'))return undefined;
    const fr=e.frozen;if(fr!==undefined&&(!Array.isArray(fr)||fr.length>2000||!fr.every(x=>str(x,80))))return undefined;
    return {...base,type:'viewport',at:e.at,width:e.width,height:e.height,view:e.view,scale:e.scale,...(fr?{frozen:fr as string[]}:{}),...(e.locked?{locked:true}:{})};
   }
   case 'xref':if(!str(e.name,40)||!pt(e.at)||!n(e.scale)||e.scale<=0||!n(e.rotation))return undefined;return ({...base,type:'xref',name:e.name,at:e.at,scale:e.scale,rotation:e.rotation});
   default:return undefined;
  }
 };
 for(const e of o.entities as Record<string,unknown>[]){const v=entity(e,0);if(!v)return undefined;entities.push(v);}
 // Block definitions hold entities of their own (nested up to a depth); references must name a defined block.
 let blocks:BlockDef[]|undefined;
 if(o.blocks!==undefined){
  if(!Array.isArray(o.blocks)||o.blocks.length>5000)return undefined;blocks=[];
  for(const b of o.blocks as Record<string,unknown>[]){
   if(!b||!str(b.name,120)||!pt(b.base)||!Array.isArray(b.entities)||b.entities.length>200000||(b.description!==undefined&&!str(b.description,400)))return undefined;
   const list:Ent[]=[];for(const e of b.entities as Record<string,unknown>[]){const v=entity(e,1);if(!v)return undefined;list.push(v);}
   blocks.push({name:b.name,base:b.base,entities:list,...(b.description?{description:b.description as string}:{})});
  }
 }
 // Model space: real-size entities behind the viewports (no viewports of its own).
 let model:CadDoc['model'];
 if(o.model!==undefined){
  const m=o.model as Record<string,unknown>;
  if(!m||typeof m!=='object'||!Array.isArray(m.entities)||m.entities.length>300000||!n(m.nextId)||!n(m.annoScale)||m.annoScale<=0)return undefined;
  const list:Ent[]=[];for(const e of m.entities as Record<string,unknown>[]){const v=entity(e,1);if(!v)return undefined;list.push(v);}
  model={entities:list,nextId:m.nextId,annoScale:m.annoScale};
 }
 let generatedSigs:string[]|undefined;
 if(o.generatedSigs!==undefined){if(!Array.isArray(o.generatedSigs)||o.generatedSigs.length>300000||!o.generatedSigs.every(x=>str(x,40)))return undefined;generatedSigs=o.generatedSigs as string[];}
 if(o.pageSetup!==undefined){const ps=o.pageSetup as Record<string,unknown>;if(!ps||typeof ps!=='object'||(ps.lineweights!==undefined&&typeof ps.lineweights!=='boolean'))return undefined;}
 const blockNames=new Set(blocks?.map(b=>b.name));
 if([...entities,...(blocks??[]).flatMap(b=>b.entities),...(model?.entities??[])].some(e=>e.type==='insert'&&!blockNames.has(e.name)))return undefined;
 let groups:CadGroup[]|undefined;
 if(o.groups!==undefined){
  if(!Array.isArray(o.groups)||o.groups.length>5000)return undefined;groups=[];
  for(const g of o.groups as Record<string,unknown>[]){if(!g||!str(g.name,80)||!Array.isArray(g.ids)||g.ids.length>300000||!g.ids.every(n))return undefined;groups.push({name:g.name,ids:g.ids as number[]});}
 }
 // Styles and settings: bounded and typed, or the drawing is refused.
 const meta:Record<string,unknown>={};
 if(o.textStyles!==undefined){
  if(!Array.isArray(o.textStyles)||o.textStyles.length>200)return undefined;
  for(const t of o.textStyles as Record<string,unknown>[])if(!t||!str(t.name,80)||!str(t.font,80)||!n(t.widthFactor)||t.widthFactor<=0||!n(t.oblique)||Math.abs(t.oblique)>85||!n(t.height)||t.height<0||(t.bold!==undefined&&typeof t.bold!=='boolean'))return undefined;
  meta.textStyles=(o.textStyles as Record<string,unknown>[]).map(t=>({name:t.name,font:t.font,widthFactor:t.widthFactor,oblique:t.oblique,height:t.height,...(t.bold?{bold:true}:{})}));
 }
 if(o.dimStyles!==undefined){
  if(!Array.isArray(o.dimStyles)||o.dimStyles.length>200)return undefined;
  const keys=['textHeight','arrowSize','extOffset','extBeyond','textGap','precision','scale','baseline'];
  for(const d of o.dimStyles as Record<string,unknown>[])if(!d||!str(d.name,80)||!keys.every(k=>n(d[k])&&(d[k] as number)>=0)||!['closed','open','tick','dot','none'].includes(d.arrow as string)||!['above','centered'].includes(d.textPos as string)||!['arch','decimal'].includes(d.units as string)||(d.textStyle!==undefined&&!str(d.textStyle,80))||(d.prefix!==undefined&&!str(d.prefix,40))||(d.suffix!==undefined&&!str(d.suffix,40)))return undefined;
  meta.dimStyles=(o.dimStyles as Record<string,unknown>[]).map(d=>({name:d.name,textHeight:d.textHeight,arrowSize:d.arrowSize,arrow:d.arrow,extOffset:d.extOffset,extBeyond:d.extBeyond,textGap:d.textGap,textPos:d.textPos,units:d.units,precision:d.precision,scale:d.scale,baseline:d.baseline,...(d.textStyle?{textStyle:d.textStyle}:{}),...(d.prefix?{prefix:d.prefix}:{}),...(d.suffix?{suffix:d.suffix}:{})}));
 }
 if(o.ltscale!==undefined){if(!n(o.ltscale)||o.ltscale<=0)return undefined;meta.ltscale=o.ltscale;}
 if(o.plotStyle!==undefined){if(!['monochrome','grayscale','color'].includes(o.plotStyle as string))return undefined;meta.plotStyle=o.plotStyle;}
 return {...meta,...(generatedSigs?{generatedSigs}:{}),...(groups?{groups}:{}),...(blocks?{blocks}:{}),...(model?{model}:{}),...(o.pageSetup?{pageSetup:{...((o.pageSetup as {lineweights?:boolean}).lineweights!==undefined?{lineweights:(o.pageSetup as {lineweights:boolean}).lineweights}:{})}}:{}),key:o.key,title:o.title,unit:o.unit as CadDoc['unit'],display:o.display as CadDoc['display'],realPerUnit:o.realPerUnit,width:o.width,height:o.height,svgScale:o.svgScale,layers,entities,nextId:o.nextId};
}

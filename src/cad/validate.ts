import {lineTypes,type CadDoc,type CadGroup,type CadLayer,type Ent,type EntProps,type Pt} from './model';

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
 for(const e of o.entities as Record<string,unknown>[]){
  if(!e||!n(e.id)||!str(e.layer,80)||!names.has(e.layer))return undefined;
  // Object properties are optional (ByLayer when absent).
  if(e.color!==undefined&&(!n(e.color)||e.color<0||e.color>256))return undefined;
  if(e.ltype!==undefined&&!lineTypes.includes(e.ltype as CadLayer['ltype']))return undefined;
  if(e.weight!==undefined&&(!n(e.weight)||e.weight<0||e.weight>211))return undefined;
  if(e.ltscale!==undefined&&(!n(e.ltscale)||e.ltscale<=0))return undefined;
  const base:EntProps&{id:number}={id:e.id,layer:e.layer};
  if(e.color!==undefined)base.color=e.color as number;if(e.ltype!==undefined)base.ltype=e.ltype as CadLayer['ltype'];if(e.weight!==undefined)base.weight=e.weight as number;if(e.ltscale!==undefined)base.ltscale=e.ltscale as number;
  switch(e.type){
   case 'line':if(!pt(e.a)||!pt(e.b))return undefined;entities.push({...base,type:'line',a:e.a,b:e.b});break;
   case 'poly':{if(!pts(e.points,2)||typeof e.closed!=='boolean')return undefined;
    const b=e.bulges;if(b!==undefined&&(!Array.isArray(b)||b.length!==(e.points as Pt[]).length||!b.every(n)))return undefined;
    entities.push({...base,type:'poly',points:e.points,closed:e.closed,...(b?{bulges:b as number[]}:{})});break;}
   case 'ellipse':if(!pt(e.center)||!pt(e.major)||Math.hypot(e.major[0],e.major[1])<=0||!n(e.ratio)||e.ratio<=0||e.ratio>1||!n(e.start)||!n(e.end))return undefined;
    entities.push({...base,type:'ellipse',center:e.center,major:e.major,ratio:e.ratio,start:e.start,end:e.end});break;
   case 'spline':{
    if(!n(e.degree)||!Number.isInteger(e.degree)||e.degree<1||e.degree>5||!pts(e.ctrl,2)||typeof e.closed!=='boolean')return undefined;
    const k=e.knots,c=(e.ctrl as Pt[]).length;if(!Array.isArray(k)||k.length!==c+e.degree+1||!k.every(n)||k.some((v,i)=>i&&v<k[i-1]))return undefined;
    if(e.fit!==undefined&&!pts(e.fit,2))return undefined;
    entities.push({...base,type:'spline',degree:e.degree,ctrl:e.ctrl,knots:k as number[],closed:e.closed,...(e.fit?{fit:e.fit as Pt[]}:{})});break;
   }
   case 'xline':case 'ray':if(!pt(e.base)||!pt(e.dir)||Math.abs(Math.hypot(e.dir[0],e.dir[1])-1)>1e-6)return undefined;entities.push({...base,type:e.type,base:e.base,dir:e.dir});break;
   case 'solid':if(!pts(e.points,3)||(e.points as Pt[]).length>4)return undefined;entities.push({...base,type:'solid',points:e.points});break;
   case 'circle':if(!pt(e.center)||!n(e.radius)||e.radius<=0)return undefined;entities.push({...base,type:'circle',center:e.center,radius:e.radius});break;
   case 'arc':if(!pt(e.center)||!n(e.radius)||e.radius<=0||!n(e.start)||!n(e.end))return undefined;entities.push({...base,type:'arc',center:e.center,radius:e.radius,start:e.start,end:e.end});break;
   case 'text':if(!pt(e.at)||!n(e.height)||e.height<=0||!str(e.value)||!n(e.angle)||![0,1,2].includes(e.align as number)||typeof e.bold!=='boolean')return undefined;
    entities.push({...base,type:'text',at:e.at,height:e.height,value:e.value,angle:e.angle,align:e.align as 0|1|2,bold:e.bold});break;
   case 'dim':if(!['aligned','horizontal','vertical'].includes(e.kind as string)||!pt(e.a)||!pt(e.b)||!pt(e.at)||!n(e.height)||e.height<=0||(e.text!==undefined&&!str(e.text,400)))return undefined;
    entities.push({...base,type:'dim',kind:e.kind as 'aligned',a:e.a,b:e.b,at:e.at,height:e.height,text:e.text as string|undefined});break;
   default:return undefined;
  }
 }
 let groups:CadGroup[]|undefined;
 if(o.groups!==undefined){
  if(!Array.isArray(o.groups)||o.groups.length>5000)return undefined;groups=[];
  for(const g of o.groups as Record<string,unknown>[]){if(!g||!str(g.name,80)||!Array.isArray(g.ids)||g.ids.length>300000||!g.ids.every(n))return undefined;groups.push({name:g.name,ids:g.ids as number[]});}
 }
 return {...(groups?{groups}:{}),key:o.key,title:o.title,unit:o.unit as CadDoc['unit'],display:o.display as CadDoc['display'],realPerUnit:o.realPerUnit,width:o.width,height:o.height,svgScale:o.svgScale,layers,entities,nextId:o.nextId};
}

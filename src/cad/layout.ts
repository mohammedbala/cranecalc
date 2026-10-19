/**
 * Model space and layouts. A sheet (the drawing itself) is the layout, in paper units; its model space holds real-size
 * geometry (inches or millimeters). Viewports on the layout show model space at a scale (paper units per model unit),
 * with their own frozen layers. Annotative text, dimensions and leaders keep one paper size in every viewport.
 */
import {
 clipSegment,compose,scaling,transformEnt,translation,bbox,
 type Box,type CadDoc,type Ent,type ModelSpace,type Pt,type ViewportEnt,
} from './model';

/** Standard drawing scales: label and paper units per model unit (both in the same length unit). */
export const archScales:[string,number][]=[['12" = 1\'-0" (1:1)',1],['6" = 1\'-0"',1/2],['3" = 1\'-0"',1/4],['1 1/2" = 1\'-0"',1/8],['1" = 1\'-0"',1/12],['3/4" = 1\'-0"',1/16],['1/2" = 1\'-0"',1/24],
 ['3/8" = 1\'-0"',1/32],['1/4" = 1\'-0"',1/48],['3/16" = 1\'-0"',1/64],['1/8" = 1\'-0"',1/96],['3/32" = 1\'-0"',1/128],['1/16" = 1\'-0"',1/192],['1" = 20\'',1/240],['1" = 40\'',1/480]];
export const metricScales:[string,number][]=[['1:1',1],['1:2',1/2],['1:5',1/5],['1:10',1/10],['1:20',1/20],['1:25',1/25],['1:50',1/50],['1:100',1/100],['1:200',1/200],['1:500',1/500]];
export const scalesFor=(doc:Pick<CadDoc,'display'>)=>doc.display==='US'?archScales:metricScales;
export const scaleLabel=(doc:Pick<CadDoc,'display'>,s:number)=>scalesFor(doc).find(([,v])=>Math.abs(v-s)<1e-9)?.[0]??`1:${Number((1/s).toFixed(3))}`;
/** The largest standard scale not larger than s. */
export const snapScale=(doc:Pick<CadDoc,'display'>,s:number)=>scalesFor(doc).map(([,v])=>v).filter(v=>v<=s*(1+1e-9)).sort((a,b)=>b-a)[0]??s;

/** An empty model space: real inches (US) or millimeters (SI), annotation scale 1/4" = 1'-0" or 1:50. */
export const emptyModel=(doc:Pick<CadDoc,'display'>):ModelSpace=>({entities:[],nextId:1,annoScale:doc.display==='US'?1/48:1/50});
/** Model space as a drawing of its own, for editing on the Model tab (layers and styles shared with the layout). */
export function modelDoc(sheet:CadDoc):CadDoc{
 const m=sheet.model??emptyModel(sheet),us=sheet.display==='US';
 const ext=modelExtents(m.entities,sheet)??[0,0,(us?12*100:30000),(us?12*60:18000)];
 return {...sheet,title:`${sheet.title} · model`,unit:us?'in':'mm',realPerUnit:us?25.4:1,width:Math.max(1,ext[2]),height:Math.max(1,ext[3]),svgScale:1,
  entities:m.entities,nextId:m.nextId,ltscale:1/m.annoScale,space:'model',annoScale:m.annoScale,model:undefined};
}
/** The layout with the edited model space written back. */
export function withModel(sheet:CadDoc,model:CadDoc):CadDoc{
 const m=sheet.model??emptyModel(sheet);
 return {...sheet,model:{entities:model.entities,nextId:model.nextId,annoScale:model.annoScale??m.annoScale},layers:model.layers,textStyles:model.textStyles,dimStyles:model.dimStyles,blocks:model.blocks};
}
export function modelExtents(ents:Ent[],ctx:Partial<CadDoc>&Pick<CadDoc,'display'|'realPerUnit'>):Box|undefined{
 if(!ents.length)return undefined;const bs=ents.filter(e=>e.type!=='xline'&&e.type!=='ray').map(e=>bbox(e,ctx));if(!bs.length)return undefined;
 return [Math.min(...bs.map(b=>b[0])),Math.min(...bs.map(b=>b[1])),Math.max(...bs.map(b=>b[2])),Math.max(...bs.map(b=>b[3]))];
}

// ---- annotative objects ------------------------------------------------------------------------------------------
/** An annotative object drawn at another scale: its sizes multiplied by k about its own insertion point. */
export function annoAdjust(e:Ent,k:number):Ent{
 if(!e.annotative||Math.abs(k-1)<1e-12)return e;
 switch(e.type){
  case 'text':case 'attdef':return {...e,height:e.height*k};
  case 'mtext':return {...e,height:e.height*k,width:e.width*k};
  case 'leader':return {...e,height:e.height*k};
  case 'dim':return {...e,height:e.height*k};
 }
 return e;
}

// ---- viewports ---------------------------------------------------------------------------------------------------
export const viewportBox=(v:Pick<ViewportEnt,'at'|'width'|'height'>):Box=>[v.at[0]-v.width/2,v.at[1]-v.height/2,v.at[0]+v.width/2,v.at[1]+v.height/2];
/** Model coordinates to paper coordinates through a viewport. */
export const viewportMap=(v:ViewportEnt)=>compose(translation(v.at),compose(scaling([0,0],v.scale),translation([-v.view[0],-v.view[1]])));
export const paperToModel=(v:ViewportEnt,p:Pt):Pt=>[(p[0]-v.at[0])/v.scale+v.view[0],(p[1]-v.at[1])/v.scale+v.view[1]];
const cache=new WeakMap<object,{model:unknown;layers:unknown;list:Ent[]}>();
/**
 * What a viewport shows, as layout entities: model space mapped to the paper at the viewport's scale, annotative
 * objects kept at their paper size, layers frozen in the viewport (or off) left out. Clipping to the viewport is the
 * caller's (the canvas and SVG clip; exports clip lines and drop what lies outside).
 */
export function viewportContents(v:ViewportEnt,sheet:CadDoc):Ent[]{
 const ents=sheet.model?.entities??[],hit=cache.get(v);
 if(hit&&hit.model===ents&&hit.layers===sheet.layers)return hit.list;
 const m=viewportMap(v),box=viewportBox(v),frozen=new Set(v.frozen??[]),anno=(sheet.model?.annoScale??v.scale)/v.scale,ctx={...sheet,unit:sheet.display==='US'?'in' as const:'mm' as const};
 const list:Ent[]=[];
 for(const e of ents){
  if(frozen.has(e.layer))continue;
  const p=transformEnt(annoAdjust(e,anno),m),b=bbox(p,ctx);
  if(b[2]<box[0]||b[0]>box[2]||b[3]<box[1]||b[1]>box[3])continue;
  list.push(p);
 }
 cache.set(v,{model:ents,layers:sheet.layers,list});
 return list;
}
/** Viewport contents cut to the viewport for exports without clipping: lines and polylines cut, other objects whole if they touch it. */
export function clippedContents(v:ViewportEnt,sheet:CadDoc):Ent[]{
 const box=viewportBox(v),out:Ent[]=[];
 for(const e of viewportContents(v,sheet)){
  if(e.type==='line'){const c=clipSegment(e.a,e.b,box);if(c)out.push({...e,a:c[0],b:c[1]});continue;}
  if(e.type==='poly'&&!e.bulges?.some(x=>x)){const n=e.points.length,segs=e.closed&&n>2?n:n-1;for(let i=0;i<segs;i++){const c=clipSegment(e.points[i],e.points[(i+1)%n],box);if(c)out.push({id:e.id,type:'line',layer:e.layer,a:c[0],b:c[1],...(e.color!==undefined?{color:e.color}:{}),...(e.ltype?{ltype:e.ltype}:{}),...(e.weight!==undefined?{weight:e.weight}:{})});}continue;}
  out.push(e);
 }
 return out;
}

import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {
 ArrowRightToLine,Circle,Copy,CopyPlus,Download,Eraser,Eye,EyeOff,FlipHorizontal2,Hand,Layers,Lock,LockOpen,Maximize2,Move,
 MoveHorizontal,MousePointer2,Plus,Redo2,RectangleHorizontal,RotateCw,Ruler,Scaling,Scissors,SlidersHorizontal,Spline,TriangleAlert,Type,
 Undo2,Ungroup,Waypoints,X,Slash,
} from 'lucide-react';
import {
 DEG,add,angleOf,bbox,dimGeometry,dist,formatLength,grips as gripsOf,inWindow,intersections,lerp,nearest,nearestOnSegment,parseLength,
 parsePoint,segments,snapPoints,stretchGrip,sub,sweep,type Box,type CadDoc,type CadLayer,type Ent,type NewEnt,type Pt,type SnapKind,
} from '../cad/model';
import {CadStore} from '../cad/store';
import {commandNames,defaultHeights,makeCommand,placeCmd,type Command,type Env,type Preview} from '../cad/commands';
import {aci,aciPalette,cachedBox,drawOverlay,drawScene,toWorld,type Theme,type View} from '../cad/render';
import {docToDxf,docToSvg} from '../cad/convert';
import {cadPersistent,deleteCadRecord,saveCadRecord,type CadRecord} from '../cad/storage';
import '../cad/cad.css';

export interface CadSource{project:string;base:string;generated:CadDoc;record?:CadRecord;units:'US'|'SI'}
type Toggles={grid:boolean;snap:boolean;ortho:boolean;osnap:boolean;lwt:boolean};

const APERTURE=9,PICKBOX=5;
const snapRank:Record<SnapKind,number>={end:0,int:0,mid:1,cen:2,qua:2,ins:2,per:3,nea:4,grid:5};
const download=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const scales=(unit:CadDoc['unit']):[string,number][]=>unit==='in'
 ?[['1:1 (paper)',25.4],['3" = 1\'-0"',4*25.4],['1 1/2" = 1\'-0"',8*25.4],['1" = 1\'-0"',12*25.4],['3/4" = 1\'-0"',16*25.4],['1/2" = 1\'-0"',24*25.4],['3/8" = 1\'-0"',32*25.4],['1/4" = 1\'-0"',48*25.4],['3/16" = 1\'-0"',64*25.4],['1/8" = 1\'-0"',96*25.4]]
 :unit==='mm'?[['1:1 (paper)',1],['1:5',5],['1:10',10],['1:20',20],['1:25',25],['1:50',50],['1:100',100],['1:200',200]]:[];
const fmtNum=(v:number)=>String(Number(v.toFixed(4)));
const typeName:Record<Ent['type'],string>={line:'Line',poly:'Polyline',solid:'Solid',circle:'Circle',arc:'Arc',text:'Text',dim:'Dimension'};

export default function CadEditor({source,onClose}:{source:CadSource;onClose:()=>void}){
 const store=useMemo(()=>new CadStore(structuredClone(source.record?.doc??source.generated)),[]);// eslint-disable-line react-hooks/exhaustive-deps
 useSyncExternalStore(store.subscribe,store.getVersion);
 const doc=store.doc,heights=useMemo(()=>defaultHeights(source.generated),[source.generated]);
 const [toggles,setToggles]=useState<Toggles>({grid:false,snap:false,ortho:false,osnap:true,lwt:true});
 const [theme,setTheme]=useState<Theme>('dark');
 const [panel,setPanel]=useState<{props:boolean;layers:boolean}>({props:true,layers:true});
 const [currentLayer,setCurrentLayer]=useState(()=>doc.layers.some(l=>l.name==='S-ANNO')?'S-ANNO':doc.layers.some(l=>l.name==='OUTLINE')?'OUTLINE':'0');
 const [input,setInput]=useState('');
 const [log,setLog]=useState<string[]>(['CAD editor ready. Type a command (L, PL, C, T, DLI, M, CO, RO, TR, O …) or pick a tool. Esc cancels; Enter or Space repeats.']);
 const [stale,setStale]=useState(!!source.record&&source.record.base!==source.base);
 const [underlay,setUnderlay]=useState(false);
 const [saveState,setSaveState]=useState<'saved'|'saving'|'generated'>(source.record?'saved':'generated');
 const [textEdit,setTextEdit]=useState<{id:number;value:string;x:number;y:number}|null>(null);
 const [newLayer,setNewLayer]=useState<string|null>(null);
 const [coords,setCoords]=useState<Pt>([0,0]);
 const [help,setHelp]=useState(false);
 const [,rerender]=useState(0);const refresh=()=>rerender(v=>v+1);

 const wrapRef=useRef<HTMLDivElement>(null),sceneRef=useRef<HTMLCanvasElement>(null),overlayRef=useRef<HTMLCanvasElement>(null),cmdRef=useRef<HTMLInputElement>(null);
 const view=useRef<View>({cx:doc.width/2,cy:doc.height/2,scale:20,w:800,h:600});
 const cursor=useRef<{screen?:[number,number];world:Pt;raw:Pt}>({world:[0,0],raw:[0,0]});
 const hover=useRef<Ent|undefined>(undefined),snap=useRef<{kind:SnapKind;p:Pt}|undefined>(undefined);
 const active=useRef<Command|null>(null),selecting=useRef(false),lastCommand=useRef<string|null>(null);
 const grip=useRef<{id:number;role:string;from:Pt}|null>(null);
 const windowSel=useRef<{a:Pt;start:[number,number];dragged:boolean;hit?:number;shift?:boolean}|null>(null);
 const pan=useRef<{x:number;y:number;cx:number;cy:number}|null>(null);
 const [panMode,setPanMode]=useState(false);
 const textHeight=useRef(heights.text),offsetDistance=useRef<number|undefined>(undefined);
 const clipboard=useRef<{ents:NewEnt[];base:Pt}|null>(null);
 const togglesRef=useRef(toggles);togglesRef.current=toggles;
 const dirty=useRef({scene:true,overlay:true}),frame=useRef(0);
 const say=useCallback((m:string)=>setLog(l=>[...l.slice(-60),m]),[]);

 // ---- drawing ----
 const paint=useCallback(()=>{
  frame.current=0;
  const v=view.current,scene=sceneRef.current?.getContext('2d'),over=overlayRef.current?.getContext('2d');if(!scene||!over)return;
  if(dirty.current.scene){dirty.current.scene=false;drawScene(scene,{doc:store.doc,view:v,theme,lwt:togglesRef.current.lwt,grid:togglesRef.current.grid?gridSpacing(store.doc):null,underlay:underlay?source.generated:null});}
  if(dirty.current.overlay){dirty.current.overlay=false;
   const cmd=active.current,c=cursor.current;let pv:Preview|undefined;
   if(grip.current){const e=store.get(grip.current.id);if(e)pv={ents:[stripId(stretchGrip(e,grip.current.role,grip.current.from,c.world))],rubber:[grip.current.from,c.world],tip:`${lengthText(dist(grip.current.from,c.world))}`};}
   else if(cmd&&!selecting.current&&!cmd.wantsPick?.())pv=cmd.preview?.(c.world);
   const base=grip.current?.from??(cmd&&!selecting.current?cmd.base?.():undefined);
   const selected=store.selected(),showGrips=!cmd&&selected.length<=300;
   drawOverlay(over,{doc:store.doc,view:v,theme,selected,hover:hover.current,preview:pv?.ents,rubber:pv?.rubber??(base&&!pv?.ents?[base,c.world]:undefined),
    window:windowSel.current?{a:windowSel.current.a,b:c.raw}:undefined,grips:showGrips?selected.flatMap(gripsOf):undefined,hot:grip.current?.from,
    snap:snap.current,cursor:c.screen,crosshair:!panMode&&!pan.current,tip:pv?.tip,pickbox:cmd&&!cmd.wantsPick?.()&&!selecting.current?0:PICKBOX});
  }
 },[store,theme,underlay,source.generated,panMode]);// eslint-disable-line react-hooks/exhaustive-deps
 const schedule=useCallback((scene=false)=>{if(scene)dirty.current.scene=true;dirty.current.overlay=true;if(!frame.current)frame.current=requestAnimationFrame(paint);},[paint]);
 useEffect(()=>{schedule(true);},[store.docVersion,store.version,theme,toggles,underlay,schedule]);

 const zoomTo=useCallback((b:Box,margin=1.06)=>{
  const v=view.current,w=Math.max(1e-9,b[2]-b[0]),h=Math.max(1e-9,b[3]-b[1]);
  view.current={...v,cx:(b[0]+b[2])/2,cy:(b[1]+b[3])/2,scale:Math.min(v.w/(w*margin),v.h/(h*margin))};schedule(true);
 },[schedule]);
 const zoomExtents=useCallback(()=>zoomTo([0,0,store.doc.width,store.doc.height]),[zoomTo,store]);

 // Canvas size follows the editor; the first layout fits the sheet.
 useEffect(()=>{
  const wrap=wrapRef.current;if(!wrap)return;let first=true;
  const fit=()=>{
   const r=wrap.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
   for(const c of [sceneRef.current,overlayRef.current]){if(!c)continue;c.width=Math.max(1,Math.round(r.width*dpr));c.height=Math.max(1,Math.round(r.height*dpr));c.style.width=`${r.width}px`;c.style.height=`${r.height}px`;c.getContext('2d')?.setTransform(dpr,0,0,dpr,0,0);}
   view.current={...view.current,w:r.width,h:r.height};
   if(first){first=false;zoomExtents();}else schedule(true);
  };
  const ro=new ResizeObserver(fit);ro.observe(wrap);fit();
  return ()=>ro.disconnect();
 },[zoomExtents,schedule]);

 // ---- persistence: save a moment after each change ----
 const startVersion=useRef(store.docVersion);
 useEffect(()=>{
  if(store.docVersion===startVersion.current)return;
  setSaveState('saving');
  const t=setTimeout(()=>{void saveCadRecord(source.project,stale&&source.record?source.record.base:source.base,store.doc).then(()=>setSaveState('saved'));},500);
  return ()=>clearTimeout(t);
 },[store.docVersion,store,source.project,source.base,source.record,stale]);

 // ---- helpers ----
 function stripId(e:Ent):NewEnt{const {id:_,...rest}=e;return rest as NewEnt;}
 function lengthText(d:number){return formatLength(d*store.doc.realPerUnit,store.doc.display);}
 function gridSpacing(d:CadDoc){return d.unit==='in'?.25:d.unit==='mm'?5:10;}
 const layerOf=(name:string)=>store.doc.layers.find(l=>l.name===name);
 const pickable=(e:Ent)=>{const l=layerOf(e.layer);return !!l&&l.visible&&!l.locked;};
 const visible=(e:Ent)=>!!layerOf(e.layer)?.visible;
 function candidates(p:Pt,r:number,filter:(e:Ent)=>boolean){
  const out:Ent[]=[];for(const e of store.doc.entities){const b=cachedBox(e,store.doc);if(p[0]<b[0]-r||p[0]>b[2]+r||p[1]<b[1]-r||p[1]>b[3]+r)continue;if(filter(e))out.push(e);}
  return out;
 }
 function entityAt(p:Pt){
  const r=PICKBOX/view.current.scale;let best:Ent|undefined,bd=Infinity;
  for(const e of candidates(p,r,pickable)){const d=nearest(e,p,store.doc).d;if(d<=r&&d<=bd){bd=d;best=e;}}
  return best;
 }
 function findSnap(p:Pt,base?:Pt){
  const r=APERTURE/view.current.scale,near=candidates(p,r,visible).slice(-400);
  let best:{kind:SnapKind;p:Pt}|undefined,score=Infinity;
  const offer=(kind:SnapKind,q:Pt)=>{const d=dist(p,q);if(d>r)return;const s=snapRank[kind]*1e6+d;if(s<score){score=s;best={kind,p:q};}};
  for(const e of near)for(const s of snapPoints(e,store.doc))offer(s.kind,s.p);
  // Intersections and perpendiculars: only the segments and curves passing under the cursor.
  const pieces:Ent[]=[];
  for(const e of near){
   if(pieces.length>=80)break;
   if(e.type==='text')continue;
   if(e.type==='circle'||e.type==='arc'){if(nearest(e,p).d<=r)pieces.push(e);continue;}
   for(const [a,b] of segments(e,store.doc))if(dist(p,nearestOnSegment(p,a,b).point)<=r)pieces.push({id:-1,type:'line',layer:e.layer,a,b});
  }
  for(let i=0;i<pieces.length;i++)for(let j=i+1;j<pieces.length;j++)for(const q of intersections(pieces[i],pieces[j]))offer('int',q);
  if(base)for(const e of pieces){
   if(e.type==='line'){const v=sub(e.b,e.a),l2=v[0]*v[0]+v[1]*v[1];if(l2<1e-24)continue;const t=((base[0]-e.a[0])*v[0]+(base[1]-e.a[1])*v[1])/l2;if(t>=0&&t<=1)offer('per',lerp(e.a,e.b,t));}
   else if(e.type==='circle'||e.type==='arc'){const d=dist(base,e.center);if(d>1e-12){const q=add(e.center,[(base[0]-e.center[0])/d*e.radius,(base[1]-e.center[1])/d*e.radius]);if(e.type==='circle'||nearest(e,q).d<1e-9)offer('per',q);}}
  }
  return best;
 }
 /** The point a click gives: object snap first, then grid snap and ortho from the base point. */
 function resolvePoint(raw:Pt,base?:Pt):{p:Pt;snap?:{kind:SnapKind;p:Pt}}{
  const t=togglesRef.current;
  if(t.osnap){const s=findSnap(raw,base);if(s)return {p:s.p,snap:s};}
  let p=raw;
  if(t.snap){const g=gridSpacing(store.doc);p=[Math.round(p[0]/g)*g,Math.round(p[1]/g)*g];}
  if(t.ortho&&base){p=Math.abs(p[0]-base[0])>=Math.abs(p[1]-base[1])?[p[0],base[1]]:[base[0],p[1]];}
  return {p};
 }
 const wantsPoint=()=>!!grip.current||(!!active.current&&!selecting.current&&!active.current.wantsPick?.());
 const currentBase=()=>grip.current?.from??(active.current&&!selecting.current?active.current.base?.():undefined);

 // ---- commands ----
 const env:Env={
  store,layer:()=>layerOf(currentLayer)?.locked?'0':currentLayer,
  textHeight:()=>textHeight.current,setTextHeight:h=>{textHeight.current=h;},dimHeight:()=>heights.dim,
  offsetDistance:()=>offsetDistance.current,setOffsetDistance:d=>{offsetDistance.current=d;},
  log:say,neighbors:e=>{const b=cachedBox(e,store.doc);return store.doc.entities.filter(o=>o.id!==e.id&&visible(o)&&(()=>{const c=cachedBox(o,store.doc);return c[0]<=b[2]&&c[2]>=b[0]&&c[1]<=b[3]&&c[3]>=b[1];})());},
  zoomExtents,zoomWindow:(a,b)=>zoomTo([Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])],1.02),
  openPanel:p=>setPanel(v=>({...v,[p==='layers'?'layers':'props']:true})),length:lengthText,
 };
 const prompt=()=>grip.current?'** STRETCH ** Specify stretch point:':active.current?(selecting.current?`${active.current.name} Select objects (Enter when done):`:active.current.prompt()):'Command:';
 function endCommand(clear=true){if(active.current&&clear&&active.current.selectFirst)store.clearSelection();active.current=null;selecting.current=false;grip.current=null;snap.current=undefined;setInput('');refresh();schedule();}
 function step(){if(active.current?.done)endCommand();else{refresh();schedule();}}
 function run(raw:string){
  const name=commandNames[raw.trim().toUpperCase()]??raw.trim().toUpperCase();if(!name)return;
  if(active.current||grip.current)endCommand(false);
  say(`Command: ${name}`);
  if(name==='UNDO'){const l=store.undo();say(l?`Undo ${l}`:'Nothing to undo.');schedule(true);return;}
  if(name==='REDO'){const l=store.redo();say(l?`Redo ${l}`:'Nothing to redo.');schedule(true);return;}
  if(name==='LAYER'){setPanel(v=>({...v,layers:true}));return;}
  if(name==='PROPERTIES'){setPanel(v=>({...v,props:true}));return;}
  const cmd=makeCommand(name,env);if(!cmd){say(`Unknown command "${raw.trim()}". Press F1 for the command list.`);return;}
  lastCommand.current=name;active.current=cmd;
  if(cmd.selectFirst){if(store.selection.size)cmd.begin?.();else selecting.current=true;}
  step();
  setTimeout(()=>cmdRef.current?.focus(),0);
 }
 function cancel(){
  if(textEdit){setTextEdit(null);return;}
  if(active.current||grip.current){say('*Cancel*');endCommand(true);return;}
  if(windowSel.current){windowSel.current=null;schedule();return;}
  store.clearSelection();setInput('');schedule();
 }
 function enter(){
  if(grip.current){grip.current=null;refresh();schedule();return;}
  const cmd=active.current;
  if(!cmd){if(lastCommand.current)run(lastCommand.current);return;}
  if(selecting.current){selecting.current=false;if(store.selection.size)cmd.begin?.();else cmd.done=true;step();return;}
  cmd.enter?.();if(!cmd.enter)cmd.done=true;step();
 }
 function submit(value:string){
  const v=value;setInput('');
  if(!active.current&&!grip.current){if(!v.trim())enter();else run(v);return;}
  if(grip.current){const p=parsePoint(v,grip.current.from,cursor.current.world);if(p)commitGrip(p);else say('Point or option keyword required.');return;}
  const cmd=active.current!;
  if(cmd.freeText?.()){cmd.text?.(v);step();return;}
  if(!v.trim()){enter();return;}
  if(selecting.current){say('Pick objects or press Enter.');return;}
  if(cmd.text?.(v)){step();return;}
  if(cmd.point&&!cmd.wantsPick?.()){const p=parsePoint(v,cmd.base?.(),cursor.current.world);if(p){cmd.point(p);step();return;}}
  say('Point or option keyword required.');
 }
 function commitGrip(p:Pt){
  const g=grip.current!,e=store.get(g.id);grip.current=null;
  if(e)store.commit('Grip edit',{put:[stretchGrip(e,g.role,g.from,p)]});
  refresh();schedule(true);
 }

 // ---- selection ----
 function finishWindow(b:Pt,shift:boolean){
  const w=windowSel.current!;windowSel.current=null;
  const box:Box=[Math.min(w.a[0],b[0]),Math.min(w.a[1],b[1]),Math.max(w.a[0],b[0]),Math.max(w.a[1],b[1])],crossing=b[0]<w.a[0];
  const ids=store.doc.entities.filter(e=>pickable(e)&&inWindow(e,box,crossing,store.doc)).map(e=>e.id);
  store.select(ids,shift?'remove':'add');
  if(selecting.current)say(`${ids.length} found, ${store.selection.size} total`);
  schedule();
 }

 // ---- pointer ----
 const local=(e:{clientX:number;clientY:number}):[number,number]=>{const r=overlayRef.current!.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
 function onPointerDown(e:React.PointerEvent){
  const [x,y]=local(e),raw=toWorld(view.current,x,y);
  overlayRef.current?.setPointerCapture(e.pointerId);
  if(e.button===1||(e.button===0&&panMode)){e.preventDefault();pan.current={x,y,cx:view.current.cx,cy:view.current.cy};schedule();return;}
  if(e.button===2){enter();return;}
  if(e.button!==0)return;
  cmdRef.current?.focus();
  if(windowSel.current&&!windowSel.current.dragged&&windowSel.current.hit===undefined){finishWindow(raw,e.shiftKey);return;}
  const cmd=active.current;
  if(grip.current){commitGrip(resolvePoint(raw,grip.current.from).p);return;}
  if(cmd&&!selecting.current){
   if(cmd.wantsPick?.()){cmd.pick?.(entityAt(raw),raw);step();return;}
   const {p}=resolvePoint(raw,cmd.base?.());cmd.point?.(p);step();return;
  }
  // Idle or gathering a selection: a grip, an object, or the corner of a window.
  if(!cmd){
   const r=7/view.current.scale;
   for(const s of store.selected().slice(0,300))for(const g of gripsOf(s))if(dist(g.p,raw)<=r&&pickable(s)){grip.current={id:s.id,role:g.role,from:g.p};refresh();schedule();return;}
  }
  // An object under the cursor is picked on release; dragging from it opens a window instead.
  windowSel.current={a:raw,start:[x,y],dragged:false,hit:entityAt(raw)?.id,shift:e.shiftKey};schedule();
 }
 function onPointerMove(e:React.PointerEvent){
  const [x,y]=local(e),v=view.current;
  if(pan.current){view.current={...v,cx:pan.current.cx-(x-pan.current.x)/v.scale,cy:pan.current.cy+(y-pan.current.y)/v.scale};schedule(true);return;}
  const raw=toWorld(v,x,y);
  if(windowSel.current&&!windowSel.current.dragged&&Math.hypot(x-windowSel.current.start[0],y-windowSel.current.start[1])>5&&(e.buttons&1))windowSel.current.dragged=true;
  let world=raw;snap.current=undefined;
  if(wantsPoint()){const r=resolvePoint(raw,currentBase());world=r.p;snap.current=r.snap;}
  hover.current=!wantsPoint()&&!windowSel.current&&!panMode?entityAt(raw):undefined;
  cursor.current={screen:[x,y],world,raw};setCoords(world);schedule();
 }
 function onPointerUp(e:React.PointerEvent){
  if(pan.current){pan.current=null;schedule();return;}
  const w=windowSel.current;
  if(w?.dragged)finishWindow(toWorld(view.current,...local(e)),e.shiftKey);
  else if(w&&w.hit!==undefined){windowSel.current=null;store.select([w.hit],w.shift?'remove':'add');if(selecting.current)say(`1 found, ${store.selection.size} total`);schedule();}
 }
 function onWheel(e:WheelEvent){
  e.preventDefault();const [x,y]=local(e),v=view.current;
  if(!e.ctrlKey&&Math.abs(e.deltaX)>Math.abs(e.deltaY)*.5&&e.deltaMode===0&&Math.abs(e.deltaX)>0){view.current={...v,cx:v.cx+e.deltaX/v.scale,cy:v.cy-e.deltaY/v.scale};schedule(true);return;}
  const k=Math.exp(-Math.max(-60,Math.min(60,e.deltaY*(e.deltaMode===1?16:1)))*(e.ctrlKey?.01:.0022));
  const w=toWorld(v,x,y),s=Math.max(1e-3,Math.min(1e6,v.scale*k));
  view.current={...v,scale:s,cx:w[0]-(x-v.w/2)/s,cy:w[1]-(v.h/2-y)/s};schedule(true);
 }
 useEffect(()=>{const c=overlayRef.current;if(!c)return;const fn=(e:WheelEvent)=>onWheel(e);c.addEventListener('wheel',fn,{passive:false});return ()=>c.removeEventListener('wheel',fn);});
 function onDoubleClick(e:React.MouseEvent){
  if(active.current)return;
  const [x,y]=local(e),hit=entityAt(toWorld(view.current,x,y));
  if(hit&&(hit.type==='text'||hit.type==='dim')){grip.current=null;store.select([hit.id]);setTextEdit({id:hit.id,value:hit.type==='text'?hit.value:hit.text??'',x,y});}
 }
 function onAuxClick(e:React.MouseEvent){if(e.button===1&&e.detail===2)zoomExtents();}

 // ---- keyboard ----
 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{
   const target=e.target as HTMLElement,inField=target&&target!==cmdRef.current&&['INPUT','SELECT','TEXTAREA'].includes(target.tagName);
   const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
   if(e.key==='F1'){e.preventDefault();setHelp(v=>!v);return;}
   if(e.key==='F3'||e.key==='F7'||e.key==='F8'||e.key==='F9'){e.preventDefault();const name=({F3:'osnap',F7:'grid',F8:'ortho',F9:'snap'} as const)[e.key as 'F3'];setToggles(t=>({...t,[name]:!t[name]}));say(`<${name.toUpperCase()} ${togglesRef.current[name]?'off':'on'}>`);return;}
   if(inField)return;
   if(mod&&k==='z'&&!e.shiftKey){e.preventDefault();run('UNDO');return;}
   if(mod&&(k==='y'||(k==='z'&&e.shiftKey))){e.preventDefault();run('REDO');return;}
   if(mod&&k==='a'){e.preventDefault();store.select(store.doc.entities.filter(pickable).map(v=>v.id));schedule();return;}
   if(mod&&(k==='c'||k==='x')){const sel=store.selected().filter(pickable);if(!sel.length)return;e.preventDefault();const b=sel.map(v=>bbox(v,store.doc));clipboard.current={ents:sel.map(stripId),base:[Math.min(...b.map(v=>v[0])),Math.min(...b.map(v=>v[1]))]};if(k==='x')store.commit('Cut',{del:sel.map(v=>v.id)});say(`${sel.length} ${k==='x'?'cut':'copied'} to the clipboard.`);schedule(true);return;}
   if(mod&&k==='v'){if(!clipboard.current)return;e.preventDefault();if(active.current)endCommand(false);active.current=placeCmd(env,'PASTE',clipboard.current.ents,clipboard.current.base);say('Command: PASTE');refresh();schedule();return;}
   if(e.key==='Delete'&&!active.current&&store.selection.size&&!input){e.preventDefault();run('ERASE');return;}
   if(e.key==='Escape'){e.preventDefault();cancel();return;}
   // Enter and Space answer the command line wherever the focus is (AutoCAD).
   if(target!==cmdRef.current&&!mod&&(e.key==='Enter'||(e.key===' '&&!active.current?.freeText?.()))){e.preventDefault();cmdRef.current?.focus();submit(input);return;}
   if(target!==cmdRef.current&&!mod&&e.key.length===1&&/[\w@.,<'"/ -]/.test(e.key)){cmdRef.current?.focus();}
  };
  window.addEventListener('keydown',onKey);return ()=>window.removeEventListener('keydown',onKey);
 });
 function onCmdKey(e:React.KeyboardEvent<HTMLInputElement>){
  const free=!!active.current?.freeText?.();
  if(e.key==='Enter'||(e.key===' '&&!free)){e.preventDefault();submit(input);return;}
  if(e.key==='Escape'){e.preventDefault();cancel();}
 }

 // ---- property edits ----
 const selected=store.selected();
 function putEnt(e:Ent,label='Properties'){store.commit(label,{put:[e]});schedule(true);}
 function setLayers(layers:CadLayer[],label:string){store.commit(label,{layers});schedule(true);}
 function changeLayerOfSelection(name:string){store.commit('Change layer',{put:selected.map(e=>({...e,layer:name}))});schedule(true);}
 function resolveStale(keep:boolean){
  if(keep){void saveCadRecord(source.project,source.base,store.doc).then(()=>setSaveState('saved'));say('Kept the edited drawing for the current design.');}
  else{void deleteCadRecord(source.project,doc.key);store.reset(structuredClone(source.generated));startVersion.current=store.docVersion;setSaveState('generated');say('Started over from the generated drawing.');}
  setStale(false);setUnderlay(false);
 }
 function revert(){
  if(!window.confirm('Discard every edit to this drawing and go back to the generated drawing?'))return;
  void deleteCadRecord(source.project,doc.key);store.reset(structuredClone(source.generated));startVersion.current=store.docVersion;setSaveState('generated');setStale(false);say('Reverted to the generated drawing.');zoomExtents();
 }

 const tools:[string,string,ReactNode][]=[
  ['LINE','Line (L)',<Slash key="l" size={16}/>],['PLINE','Polyline (PL)',<Waypoints key="pl" size={16}/>],['RECTANG','Rectangle (REC)',<RectangleHorizontal key="r" size={16}/>],
  ['CIRCLE','Circle (C)',<Circle key="c" size={16}/>],['ARC','Arc, 3 points (A)',<Spline key="a" size={16}/>],['TEXT','Text (T)',<Type key="t" size={16}/>],
  ['DIMLINEAR','Linear dimension (DLI)',<Ruler key="d" size={16}/>],['DIMALIGNED','Aligned dimension (DAL)',<Ruler key="da" size={16} style={{transform:'rotate(-35deg)'}}/>],
 ];
 const modify:[string,string,ReactNode][]=[
  ['MOVE','Move (M)',<Move key="m" size={16}/>],['COPY','Copy (CO)',<Copy key="co" size={16}/>],['ROTATE','Rotate (RO)',<RotateCw key="ro" size={16}/>],
  ['SCALE','Scale (SC)',<Scaling key="sc" size={16}/>],['MIRROR','Mirror (MI)',<FlipHorizontal2 key="mi" size={16}/>],['OFFSET','Offset (O)',<CopyPlus key="o" size={16}/>],
  ['TRIM','Trim (TR)',<Scissors key="tr" size={16}/>],['EXTEND','Extend (EX)',<ArrowRightToLine key="ex" size={16}/>],['EXPLODE','Explode (X)',<Ungroup key="x" size={16}/>],
  ['ERASE','Erase (E, Delete)',<Eraser key="e" size={16}/>],['DIST','Measure distance (DI)',<MoveHorizontal key="di" size={16}/>],
 ];
 const counts=useMemo(()=>{const m=new Map<string,number>();for(const e of doc.entities)m.set(e.layer,(m.get(e.layer)??0)+1);return m;},[doc.entities]);
 const edited=saveState!=='generated';

 return <div className={`cad-editor theme-${theme}`} role="dialog" aria-modal="true" aria-label={`CAD editor: ${doc.key}`}>
  <header className="cad-top">
   <div className="cad-title"><strong>{doc.key}</strong><span>{doc.title}</span>
    <em className={`cad-save ${saveState}`}>{saveState==='generated'?'Generated drawing':saveState==='saving'?'Saving…':cadPersistent?'Edits saved in this browser':'Edits kept for this session only'}</em></div>
   <div className="cad-top-actions">
    <button title={`Undo${store.undoLabel?` ${store.undoLabel}`:''} (Ctrl+Z)`} disabled={!store.canUndo} onClick={()=>run('UNDO')}><Undo2 size={15}/></button>
    <button title={`Redo${store.redoLabel?` ${store.redoLabel}`:''} (Ctrl+Y)`} disabled={!store.canRedo} onClick={()=>run('REDO')}><Redo2 size={15}/></button>
    <span className="cad-sep"/>
    <button title="Zoom extents (Z E, double-click the wheel)" onClick={zoomExtents}><Maximize2 size={15}/></button>
    <button title="Pan (or drag with the middle button)" aria-pressed={panMode} className={panMode?'on':''} onClick={()=>setPanMode(v=>!v)}><Hand size={15}/></button>
    <span className="cad-sep"/>
    <button onClick={()=>download(new Blob([docToDxf(store.doc)],{type:'application/dxf'}),`${doc.key}${edited?'-edited':''}.dxf`)}><Download size={14}/>DXF</button>
    <button onClick={()=>download(new Blob([docToSvg(store.doc)],{type:'image/svg+xml'}),`${doc.key}${edited?'-edited':''}.svg`)}><Download size={14}/>SVG</button>
    <button disabled={!edited&&!store.canUndo} onClick={revert}>Revert to generated</button>
    <span className="cad-sep"/>
    <button className="cad-close" onClick={onClose} aria-label="Close the CAD editor"><X size={16}/>Close</button>
   </div>
  </header>
  {stale&&<div className="cad-stale"><TriangleAlert size={15}/><p><strong>The design changed after this drawing was edited</strong> ({new Date(source.record!.savedAt).toLocaleString()}). Your edited drawing is open; the generated drawing for the current design differs.</p>
   <button onClick={()=>setUnderlay(v=>!v)}>{underlay?'Hide':'Show'} current design underneath</button><button onClick={()=>resolveStale(true)}>Keep my edits</button><button onClick={()=>{if(window.confirm('Discard your edits and start from the drawing generated for the current design?'))resolveStale(false);}}>Start from the current design</button></div>}
  <div className="cad-body">
   <nav className="cad-tools" aria-label="CAD tools">
    <button title="Select (Esc)" className={!active.current&&!panMode?'on':''} onClick={()=>{cancel();setPanMode(false);}}><MousePointer2 size={16}/></button>
    <span className="cad-group">Draw</span>
    {tools.map(([name,title,icon])=><button key={name} title={title} aria-label={title} className={active.current?.name===name?'on':''} onClick={()=>run(name)}>{icon}</button>)}
    <span className="cad-group">Modify</span>
    {modify.map(([name,title,icon])=><button key={name} title={title} aria-label={title} className={active.current?.name===name?'on':''} onClick={()=>run(name)}>{icon}</button>)}
   </nav>
   <div className="cad-canvas" ref={wrapRef}>
    <canvas ref={sceneRef} aria-hidden="true"/>
    <canvas ref={overlayRef} className={panMode||pan.current?'panning':''} data-testid="cad-canvas" onPointerDown={onPointerDown} onMouseDown={e=>e.preventDefault()} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
     onPointerLeave={()=>{cursor.current={...cursor.current,screen:undefined};hover.current=undefined;schedule();}} onDoubleClick={onDoubleClick} onAuxClick={onAuxClick} onContextMenu={e=>e.preventDefault()}/>
    {textEdit&&<div className="cad-text-edit" style={{left:Math.min(textEdit.x,view.current.w-300),top:Math.max(4,textEdit.y-44)}}>
     <input autoFocus aria-label="Text" value={textEdit.value} onChange={e=>setTextEdit({...textEdit,value:e.target.value})}
      onKeyDown={e=>{if(e.key==='Enter'){const ent=store.get(textEdit.id);if(ent?.type==='text'&&textEdit.value.trim())putEnt({...ent,value:textEdit.value},'Edit text');if(ent?.type==='dim')putEnt({...ent,text:textEdit.value.trim()||undefined},'Edit dimension text');setTextEdit(null);cmdRef.current?.focus();}if(e.key==='Escape'){setTextEdit(null);cmdRef.current?.focus();}}}/>
     <small>Enter to apply · Esc to cancel{store.get(textEdit.id)?.type==='dim'?' · empty measures the distance':''}</small></div>}
    {help&&<HelpCard onClose={()=>setHelp(false)}/>}
   </div>
   {(panel.props||panel.layers)&&<aside className="cad-side">
    {panel.props&&<section className="cad-panel" aria-label="Properties"><h3><SlidersHorizontal size={13}/>Properties<button aria-label="Hide properties" onClick={()=>setPanel(v=>({...v,props:false}))}><X size={12}/></button></h3>
     <Properties doc={doc} selected={selected} layers={doc.layers} onPut={putEnt} onLayer={changeLayerOfSelection} lengthText={lengthText}/></section>}
    {panel.layers&&<section className="cad-panel" aria-label="Layers"><h3><Layers size={13}/>Layers<button aria-label="New layer" title="New layer" onClick={()=>setNewLayer('')}><Plus size={12}/></button><button aria-label="Hide layers" onClick={()=>setPanel(v=>({...v,layers:false}))}><X size={12}/></button></h3>
     {newLayer!==null&&<div className="cad-new-layer"><input autoFocus placeholder="Layer name" value={newLayer} onChange={e=>setNewLayer(e.target.value.toUpperCase().replace(/[^A-Z0-9_ -]/g,''))}
      onKeyDown={e=>{if(e.key==='Enter'&&newLayer.trim()&&!layerOf(newLayer.trim())){setLayers([...doc.layers,{name:newLayer.trim(),color:7,ltype:'Continuous',weight:25,visible:true,locked:false}],'New layer');setCurrentLayer(newLayer.trim());setNewLayer(null);}if(e.key==='Escape')setNewLayer(null);}}/></div>}
     <div className="cad-layers">{doc.layers.map(l=><div key={l.name} className={`cad-layer ${l.name===currentLayer?'current':''}`}>
      <button className="cad-layer-name" title="Make current" onClick={()=>setCurrentLayer(l.name)}>{l.name}<small>{counts.get(l.name)??0}</small></button>
      <button title={l.visible?'Turn off':'Turn on'} aria-label={`${l.visible?'Hide':'Show'} ${l.name}`} onClick={()=>setLayers(doc.layers.map(v=>v.name===l.name?{...v,visible:!v.visible}:v),l.visible?'Layer off':'Layer on')}>{l.visible?<Eye size={13}/>:<EyeOff size={13}/>}</button>
      <button title={l.locked?'Unlock':'Lock'} aria-label={`${l.locked?'Unlock':'Lock'} ${l.name}`} onClick={()=>setLayers(doc.layers.map(v=>v.name===l.name?{...v,locked:!v.locked}:v),l.locked?'Unlock layer':'Lock layer')}>{l.locked?<Lock size={13}/>:<LockOpen size={13}/>}</button>
      <select title="Color" aria-label={`Color of ${l.name}`} value={l.color} style={{background:aci(l.color)}} onChange={e=>setLayers(doc.layers.map(v=>v.name===l.name?{...v,color:+e.target.value}:v),'Layer color')}>
       {[...new Set([...aciPalette,l.color])].map(c=><option key={c} value={c}>{c}</option>)}</select>
     </div>)}</div></section>}
   </aside>}
  </div>
  <footer className="cad-bottom">
   <div className="cad-log" aria-live="polite">{log.slice(-3).map((m,i)=><p key={i}>{m}</p>)}</div>
   <label className="cad-cmd"><span>{prompt()}</span><input ref={cmdRef} aria-label="Command line" autoFocus spellCheck={false} autoComplete="off" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={onCmdKey}/></label>
   <div className="cad-status">
    <span className="cad-coords">{fmtNum(coords[0])}, {fmtNum(coords[1])} {doc.unit==='unit'?'':doc.unit}</span>
    {(['grid','snap','ortho','osnap','lwt'] as const).map(t=><button key={t} className={toggles[t]?'on':''} aria-pressed={toggles[t]} title={({grid:'Grid (F7)',snap:'Snap to grid (F9)',ortho:'Ortho (F8)',osnap:'Object snap (F3)',lwt:'Lineweights'})[t]} onClick={()=>setToggles(v=>({...v,[t]:!v[t]}))}>{t.toUpperCase()}</button>)}
    {scales(doc.unit).length>0&&<label className="cad-scale">Scale<select aria-label="Drawing scale for dimensions and distances" value={doc.realPerUnit} onChange={e=>{store.setMeta({realPerUnit:+e.target.value});schedule(true);}}>{scales(doc.unit).map(([n,v])=><option key={n} value={v}>{n}</option>)}</select></label>}
    <label className="cad-scale">Layer<select aria-label="Current layer" value={currentLayer} onChange={e=>setCurrentLayer(e.target.value)}>{doc.layers.map(l=><option key={l.name} value={l.name}>{l.name}</option>)}</select></label>
    <button title="Model (dark) or paper (light) view" onClick={()=>setTheme(t=>t==='dark'?'paper':'dark')}>{theme==='dark'?'MODEL':'PAPER'}</button>
    <button title="Commands and shortcuts (F1)" aria-pressed={help} className={help?'on':''} onClick={()=>setHelp(v=>!v)}>HELP</button>
    {!panel.props&&<button onClick={()=>setPanel(v=>({...v,props:true}))}>PROPS</button>}
    {!panel.layers&&<button onClick={()=>setPanel(v=>({...v,layers:true}))}>LAYERS</button>}
   </div>
  </footer>
 </div>;
}

const helpRows:[string,string][]=[
 ['L · LINE','Lines from point to point; U undoes a segment, C closes'],['PL · PLINE','A polyline; C closes, Enter ends'],['REC · RECTANG','Two corners'],
 ['C · CIRCLE','Center, then radius (or D for diameter)'],['A · ARC','Three points: start, through, end'],['T · TEXT','Start point, height, rotation, then the text; Enter on an empty line ends'],
 ['DLI · DIMLINEAR','Two points, then the dimension line (H or V to force)'],['DAL · DIMALIGNED','A dimension parallel to the two points'],
 ['M · MOVE / CO · COPY','Select, base point, second point (COPY repeats)'],['RO · ROTATE','Select, base point, angle'],['SC · SCALE','Select, base point, factor'],
 ['MI · MIRROR','Select, two points on the mirror line, keep or erase the source'],['O · OFFSET','Distance, then an object and the side'],
 ['TR · TRIM / EX · EXTEND','Pick the part to trim, or the end to extend; every object is a boundary'],['X · EXPLODE','Polylines to lines, dimensions to lines and text'],
 ['E · ERASE (Delete)','Erase the selection'],['DI · DIST','Distance and angle between two points'],['Z · ZOOM','E extents, W window'],['U / REDO','Undo, redo (Ctrl+Z, Ctrl+Y)'],
 ['Points','Click (object snaps), or type x,y · @dx,dy · @d<angle · a distance along the cursor; lengths take 1\'6", 1-1/2, 3/4'],
 ['Mouse','Wheel zooms at the cursor; middle drag pans (or the hand); middle double-click zooms to the sheet; right click is Enter'],
 ['Selecting','Click objects; drag left to right for a window, right to left for crossing; Shift removes; Ctrl+A all; grips stretch'],
 ['Keys','Enter or Space repeats or ends; Esc cancels; F3 snaps, F7 grid, F8 ortho, F9 grid snap; Ctrl+C / Ctrl+X / Ctrl+V; double-click text to edit'],
];
function HelpCard({onClose}:{onClose:()=>void}){
 return <div className="cad-help" role="dialog" aria-label="CAD commands"><h3>Commands and shortcuts<button aria-label="Close help" onClick={onClose}><X size={12}/></button></h3>
  <dl>{helpRows.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>;
}

/** Properties of the selection: geometry, text and layer, edited in place. */
function Properties({doc,selected,layers,onPut,onLayer,lengthText}:{doc:CadDoc;selected:Ent[];layers:CadLayer[];onPut:(e:Ent)=>void;onLayer:(name:string)=>void;lengthText:(d:number)=>string}){
 if(!selected.length)return <dl className="cad-props"><dt>Drawing</dt><dd>{doc.key}</dd><dt>Units</dt><dd>{doc.unit==='in'?'Paper inches':doc.unit==='mm'?'Paper millimeters':'Sketch units'}</dd>
  <dt>Objects</dt><dd>{doc.entities.length.toLocaleString()}</dd><dt>Size</dt><dd>{fmtNum(doc.width)} × {fmtNum(doc.height)}</dd><dd className="cad-hint">Click objects, or drag a window (left to right: inside; right to left: crossing). Shift-click removes.</dd></dl>;
 const layerSel=<select aria-label="Layer of the selection" value={selected.every(e=>e.layer===selected[0].layer)?selected[0].layer:''} onChange={e=>onLayer(e.target.value)}>
  {!selected.every(e=>e.layer===selected[0].layer)&&<option value="">*varies*</option>}{layers.map(l=><option key={l.name} value={l.name}>{l.name}</option>)}</select>;
 if(selected.length>1){const by=new Map<string,number>();for(const e of selected)by.set(typeName[e.type],(by.get(typeName[e.type])??0)+1);
  return <dl className="cad-props"><dt>Selected</dt><dd>{selected.length.toLocaleString()} ({[...by].map(([k,v])=>`${v} ${k.toLowerCase()}${v>1?'s':''}`).join(', ')})</dd><dt>Layer</dt><dd>{layerSel}</dd></dl>;}
 const e=selected[0];
 const num=(label:string,value:number,set:(v:number)=>Ent|undefined)=><><dt>{label}</dt><dd><NumField value={value} onCommit={v=>{const n=set(v);if(n)onPut(n);}}/></dd></>;
 const pt=(label:string,p:Pt,set:(p:Pt)=>Ent)=><>{num(`${label} X`,p[0],v=>set([v,p[1]]))}{num(`${label} Y`,p[1],v=>set([p[0],v]))}</>;
 return <dl className="cad-props"><dt>Object</dt><dd>{typeName[e.type]}</dd><dt>Layer</dt><dd>{layerSel}</dd>
  {e.type==='line'&&<>{pt('Start',e.a,a=>({...e,a}))}{pt('End',e.b,b=>({...e,b}))}<dt>Length</dt><dd>{fmtNum(dist(e.a,e.b))} · {lengthText(dist(e.a,e.b))}</dd><dt>Angle</dt><dd>{fmtNum((angleOf(e.a,e.b)+360)%360)}°</dd></>}
  {e.type==='poly'&&<><dt>Vertices</dt><dd>{e.points.length}</dd><dt>Closed</dt><dd><input type="checkbox" checked={e.closed} onChange={ev=>onPut({...e,closed:ev.target.checked})}/></dd>
   <dt>Length</dt><dd>{lengthText(segments(e).reduce((s,[a,b])=>s+dist(a,b),0))}</dd></>}
  {e.type==='circle'&&<>{pt('Center',e.center,center=>({...e,center}))}{num('Radius',e.radius,radius=>radius>0?{...e,radius}:undefined)}<dt>Diameter</dt><dd>{lengthText(2*e.radius)}</dd></>}
  {e.type==='arc'&&<>{pt('Center',e.center,center=>({...e,center}))}{num('Radius',e.radius,radius=>radius>0?{...e,radius}:undefined)}{num('Start angle',e.start,start=>({...e,start}))}{num('End angle',e.end,end=>({...e,end}))}<dt>Arc length</dt><dd>{lengthText(e.radius*sweep(e.start,e.end)*DEG)}</dd></>}
  {e.type==='text'&&<><dt>Contents</dt><dd><TextField value={e.value} onCommit={value=>value.trim()&&onPut({...e,value})}/></dd>{num('Height',e.height,height=>height>0?{...e,height}:undefined)}{num('Rotation',e.angle,angle=>({...e,angle}))}
   <dt>Justify</dt><dd><select value={e.align} onChange={ev=>onPut({...e,align:+ev.target.value as 0|1|2})}><option value={0}>Left</option><option value={1}>Center</option><option value={2}>Right</option></select></dd>
   <dt>Bold</dt><dd><input type="checkbox" checked={e.bold} onChange={ev=>onPut({...e,bold:ev.target.checked})}/></dd>{pt('Position',e.at,at=>({...e,at}))}</>}
  {e.type==='dim'&&<><dt>Type</dt><dd><select value={e.kind} onChange={ev=>onPut({...e,kind:ev.target.value as typeof e.kind})}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option><option value="aligned">Aligned</option></select></dd>
   <dt>Measurement</dt><dd>{dimGeometry({...e,text:undefined},doc).text.value}</dd><dt>Text override</dt><dd><TextField value={e.text??''} onCommit={t=>onPut({...e,text:t.trim()||undefined})}/></dd>{num('Text height',e.height,height=>height>0?{...e,height}:undefined)}</>}
  {e.type==='solid'&&<><dt>Vertices</dt><dd>{e.points.length}</dd></>}
 </dl>;
}
function NumField({value,onCommit}:{value:number;onCommit:(v:number)=>void}){
 const [text,setText]=useState(fmtNum(value));
 useEffect(()=>setText(fmtNum(value)),[value]);
 const commit=()=>{const v=parseLength(text);if(v!==undefined&&Math.abs(v-value)>1e-12)onCommit(v);else setText(fmtNum(value));};
 return <input className="cad-num" value={text} onChange={e=>setText(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape')setText(fmtNum(value));}}/>;
}
function TextField({value,onCommit}:{value:string;onCommit:(v:string)=>void}){
 const [text,setText]=useState(value);
 useEffect(()=>setText(value),[value]);
 return <input className="cad-txt" value={text} onChange={e=>setText(e.target.value)} onBlur={()=>{if(text!==value)onCommit(text);}} onKeyDown={e=>{if(e.key==='Enter'&&text!==value)onCommit(text);}}/>;
}

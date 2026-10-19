import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {
 ArrowRightToLine,Circle,Copy,CopyPlus,Download,Eraser,Eye,EyeOff,FlipHorizontal2,Hand,Layers,Lock,LockOpen,Maximize2,Move,
 MoveHorizontal,MousePointer2,Plus,Redo2,RectangleHorizontal,RotateCw,Ruler,Scaling,Scissors,SlidersHorizontal,Spline,TriangleAlert,Type,
 Undo2,Ungroup,Waypoints,X,Slash,Egg,Activity,Hexagon,MoveDiagonal,CornerDownRight,Diamond,StretchHorizontal,Grid3x3,RotateCcw,Unlink,Link,MoveRight,
 AlignHorizontalJustifyStart,PenLine,Paintbrush,PaintBucket,Scan,Combine,Blocks,AlignLeft,CaseSensitive,Triangle,Radius,Diameter,Milestone,Rows3,Columns3,Settings2,
 MessageSquareText,MessageSquare,Table,Cloud,Palette,Waves,
} from 'lucide-react';
import {
 DEG,add,angleOf,bbox,curveLength,dimGeometry,dist,formatLength,grips as gripsOf,inWindow,lineTypes,nearest,parseLength,
 parsePoint,stretchGrip,sub,sweep,type Box,type CadDoc,type CadLayer,type Ent,type NewEnt,type Pt,type SnapKind,type LineType,
} from '../cad/model';
import {CadStore} from '../cad/store';
import {commandNames,defaultHeights,makeCommand,placeCmd,type Command,type Env,type Preview} from '../cad/commands';
import {aci,aciPalette,cachedBox,drawOverlay,drawScene,snapNames,toWorld,type Theme,type View} from '../cad/render';
import {acquirable,allSnapModes,defaultSnapModes,resolveSnap,type Acquired} from '../cad/snap';
import {hatchArea,patternNames} from '../cad/hatch';
import {cellAt,setCell} from '../cad/annotateCommands';
import {dimValue,standardDimStyle} from '../cad/annotation';
import {StylesDialog} from '../cad/StylesDialog';
import {expandGroups,fenceSelect,propValue,quickSelect,type QuickProp,type QuickSpec} from '../cad/select';
import {docToDxf,docToSvg} from '../cad/convert';
import {cadPersistent,deleteCadRecord,saveCadRecord,type CadRecord} from '../cad/storage';
import '../cad/cad.css';

export interface CadSource{project:string;base:string;generated:CadDoc;record?:CadRecord;units:'US'|'SI'}
type Toggles={grid:boolean;snap:boolean;ortho:boolean;osnap:boolean;lwt:boolean;polar:boolean;otrack:boolean;dyn:boolean};

const APERTURE=9,PICKBOX=5;
/** Per-viewer editor preferences (snap modes, polar angle) in local storage, when it is available. */
function loadPref<T>(key:string,fallback:T):T{try{const v=localStorage.getItem(key);return v?JSON.parse(v) as T:fallback;}catch{return fallback;}}
function savePref(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value));}catch{/* not kept */}}
const download=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const scales=(unit:CadDoc['unit']):[string,number][]=>unit==='in'
 ?[['1:1 (paper)',25.4],['3" = 1\'-0"',4*25.4],['1 1/2" = 1\'-0"',8*25.4],['1" = 1\'-0"',12*25.4],['3/4" = 1\'-0"',16*25.4],['1/2" = 1\'-0"',24*25.4],['3/8" = 1\'-0"',32*25.4],['1/4" = 1\'-0"',48*25.4],['3/16" = 1\'-0"',64*25.4],['1/8" = 1\'-0"',96*25.4]]
 :unit==='mm'?[['1:1 (paper)',1],['1:5',5],['1:10',10],['1:20',20],['1:25',25],['1:50',50],['1:100',100],['1:200',200]]:[];
const fmtNum=(v:number)=>String(Number(v.toFixed(4)));
const typeName:Record<Ent['type'],string>={line:'Line',poly:'Polyline',solid:'Solid',circle:'Circle',arc:'Arc',text:'Text',dim:'Dimension',ellipse:'Ellipse',spline:'Spline',xline:'Construction line',ray:'Ray',hatch:'Hatch',mtext:'Multiline text',leader:'Leader',table:'Table'};

export default function CadEditor({source,onClose}:{source:CadSource;onClose:()=>void}){
 const store=useMemo(()=>new CadStore(structuredClone(source.record?.doc??source.generated)),[]);// eslint-disable-line react-hooks/exhaustive-deps
 useSyncExternalStore(store.subscribe,store.getVersion);
 const doc=store.doc,heights=useMemo(()=>defaultHeights(source.generated),[source.generated]);
 const [toggles,setToggles]=useState<Toggles>({grid:false,snap:false,ortho:false,osnap:true,lwt:true,polar:true,otrack:true,dyn:true});
 const [snapModes,setSnapModes]=useState<Set<SnapKind>>(()=>new Set(loadPref<SnapKind[]>('cad-osnap',defaultSnapModes)));
 const [polarAngle,setPolarAngle]=useState<number>(()=>loadPref('cad-polar',90));
 const [settings,setSettings]=useState<'osnap'|'polar'|null>(null);
 const [qselect,setQselect]=useState(false);
 const [pickGroups,setPickGroups]=useState(true);
 const [styles,setStyles]=useState<'text'|'dim'|null>(null);
 const [theme,setTheme]=useState<Theme>('dark');
 const [panel,setPanel]=useState<{props:boolean;layers:boolean}>({props:true,layers:true});
 const [currentLayer,setCurrentLayer]=useState(()=>doc.layers.some(l=>l.name==='S-ANNO')?'S-ANNO':doc.layers.some(l=>l.name==='OUTLINE')?'OUTLINE':'0');
 const [input,setInput]=useState('');
 const [log,setLog]=useState<string[]>(['CAD editor ready. Type a command (L, PL, C, T, DLI, M, CO, RO, TR, O …) or pick a tool. Esc cancels; Enter or Space repeats.']);
 const [stale,setStale]=useState(!!source.record&&source.record.base!==source.base);
 const [underlay,setUnderlay]=useState(false);
 const [saveState,setSaveState]=useState<'saved'|'saving'|'generated'>(source.record?'saved':'generated');
 const [textEdit,setTextEdit]=useState<{id:number;value:string;x:number;y:number;multi?:boolean;cell?:{i:number;j:number}}|null>(null);
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
 const vars=useRef<Record<string,number|string|boolean>>({}),lastWindow=useRef<{box:Box;crossing:boolean}|undefined>(undefined);
 const togglesRef=useRef(toggles);togglesRef.current=toggles;
 const snapRef=useRef({modes:snapModes,polarAngle});snapRef.current={modes:snapModes,polarAngle};
 const acquired=useRef<Acquired[]>([]),dwell=useRef<{key:string;t:number;a:Acquired;timer?:number}|null>(null),track=useRef<{tracks?:[Pt,Pt][];tip?:string}>({});
 const dynLock=useRef<number|null>(null),prevSelection=useRef<number[]>([]);
 const selMode=useRef<{kind:'W'|'C'|'F'|'G';pts:Pt[]}|null>(null),removing=useRef(false);
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
    snap:snap.current,cursor:c.screen,crosshair:!panMode&&!pan.current,tip:[track.current.tip,pv?.tip].filter(Boolean).join('  ·  ')||undefined,pickbox:cmd&&!cmd.wantsPick?.()&&!selecting.current?0:PICKBOX,
    tracks:track.current.tracks,acquired:acquired.current.map(a=>a.p),fence:selMode.current&&selMode.current.pts.length?[...selMode.current.pts,c.raw]:undefined});
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
  // A hatch picks from inside its area but gives way to the objects drawn over it.
  for(const e of candidates(p,r,pickable)){const d=nearest(e,p,store.doc).d+(e.type==='hatch'?r*.6:0);if(d<=r&&d<=bd){bd=d;best=e;}}
  return best;
 }
 const aperture=()=>APERTURE/view.current.scale;
 /** The point a click gives: object snap, tracking (polar and object snap tracking), grid snap, ortho; a locked dynamic-input length. */
 function resolvePoint(raw:Pt,base?:Pt):{p:Pt;snap?:{kind:SnapKind;p:Pt};tracks?:[Pt,Pt][];tip?:string}{
  const t=togglesRef.current,r=aperture();
  if(dynLock.current!==null&&base){const d=sub(raw,base),l=Math.hypot(d[0],d[1])||1;return {p:add(base,[d[0]/l*dynLock.current,d[1]/l*dynLock.current]),tip:`Length ${lengthText(dynLock.current)} (locked) < ${fmtNum((angleOf(base,raw)+360)%360)}°`};}
  const near=candidates(raw,r*12,visible).slice(-400);
  return resolveSnap(raw,near,store.doc,r,{osnap:t.osnap,modes:snapRef.current.modes,ortho:t.ortho,polar:t.polar&&!t.ortho,polarAngle:snapRef.current.polarAngle,otrack:t.otrack&&t.osnap,grid:t.snap?gridSpacing(store.doc):null},base,acquired.current);
 }
 /** Object snap tracking: a snap point hovered a moment is acquired (or released). */
 function dwellOn(raw:Pt){
  const t=togglesRef.current;if(!t.osnap||!(t.otrack||snapRef.current.modes.has('ext')||snapRef.current.modes.has('par'))){dwell.current=null;return;}
  const a=acquirable(raw,candidates(raw,aperture(),visible).slice(-400),store.doc,aperture());
  if(!a){if(dwell.current?.timer)clearTimeout(dwell.current.timer);dwell.current=null;return;}
  const key=`${a.p[0]},${a.p[1]}`;if(dwell.current?.key===key)return;
  if(dwell.current?.timer)clearTimeout(dwell.current.timer);
  const timer=window.setTimeout(()=>{
   if(dwell.current?.key!==key)return;
   const list=acquired.current,i=list.findIndex(x=>x.p[0]===a.p[0]&&x.p[1]===a.p[1]);
   acquired.current=i>=0?list.filter((_,j)=>j!==i):[...list.slice(-6),a];schedule();
  },380);
  dwell.current={key,t:performance.now(),a,timer};
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
  vars:vars.current,lastWindow:()=>lastWindow.current,
 };
 const selPrompt=()=>{const m=selMode.current,n=active.current!.name;
  if(m?.kind==='W'||m?.kind==='C')return `${n} Specify ${m.pts.length?'opposite':'first'} corner (${m.kind==='W'?'window':'crossing'}):`;
  if(m?.kind==='F')return `${n} Specify ${m.pts.length?'next fence point or <done>':'first fence point'}:`;
  if(m?.kind==='G')return `${n} Enter group name:`;
  return `${n} Select objects${removing.current?' to remove':''} or [ALL/Last/Previous/Window/Crossing/Fence/Group/Add/Remove] (Enter when done):`;};
 const prompt=()=>grip.current?'** STRETCH ** Specify stretch point:':active.current?(selecting.current?selPrompt():active.current.prompt()):'Command:';
 function endCommand(clear=true){
  const cmd=active.current;if(cmd&&clear&&cmd.selectFirst&&!cmd.keepSelection)store.clearSelection();
  active.current=null;selecting.current=false;grip.current=null;snap.current=undefined;selMode.current=null;removing.current=false;dynLock.current=null;acquired.current=[];track.current={};setInput('');refresh();schedule();
 }
 /** A selection-first command starts on the selection, which becomes the previous selection. */
 function beginOn(cmd:Command){prevSelection.current=[...store.selection];cmd.begin?.();}
 /** Ids picked or windowed, with whole groups when group selection is on. */
 const withGroups=(ids:number[])=>pickGroups?expandGroups(store.doc,ids).filter(id=>{const e=store.get(id);return !!e&&pickable(e);}):ids;
 function addToSelection(ids:number[],remove:boolean){store.select(withGroups(ids),remove||removing.current?'remove':'add');}
 function step(){if(active.current?.done)endCommand();else{refresh();schedule();}}
 function run(raw:string){
  const name=commandNames[raw.trim().toUpperCase()]??raw.trim().toUpperCase();if(!name)return;
  if(active.current||grip.current)endCommand(false);
  say(`Command: ${name}`);
  if(name==='UNDO'){const l=store.undo();say(l?`Undo ${l}`:'Nothing to undo.');schedule(true);return;}
  if(name==='REDO'){const l=store.redo();say(l?`Redo ${l}`:'Nothing to redo.');schedule(true);return;}
  if(name==='LAYER'){setPanel(v=>({...v,layers:true}));return;}
  if(name==='PROPERTIES'){setPanel(v=>({...v,props:true}));return;}
  if(name==='OSNAP'){setSettings('osnap');return;}
  if(name==='QSELECT'){setQselect(true);return;}
  if(name==='STYLE'||name==='DIMSTYLE'){setStyles(name==='STYLE'?'text':'dim');return;}
  const cmd=makeCommand(name,env);if(!cmd){say(`Unknown command "${raw.trim()}". Press F1 for the command list.`);return;}
  lastCommand.current=name;active.current=cmd;lastWindow.current=undefined;
  if(cmd.selectFirst){if(store.selection.size)beginOn(cmd);else selecting.current=true;}
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
  if(selecting.current){
   const m=selMode.current;
   if(m?.kind==='F'){if(m.pts.length>1){const ids=fenceSelect(store.doc.entities.filter(pickable),m.pts,store.doc);addToSelection(ids,false);say(`${ids.length} found, ${store.selection.size} total`);}selMode.current=null;refresh();schedule();return;}
   if(m){selMode.current=null;refresh();return;}
   selecting.current=false;if(store.selection.size)beginOn(cmd);else cmd.done=true;step();return;
  }
  cmd.enter?.();if(!cmd.enter)cmd.done=true;step();
 }
 function submit(value:string){
  const v=value;setInput('');
  if(!active.current&&!grip.current){if(!v.trim())enter();else run(v);return;}
  if(grip.current){const p=parsePoint(v,grip.current.from,cursor.current.world);if(p)commitGrip(p);else say('Point or option keyword required.');return;}
  const cmd=active.current!;
  if(!selecting.current&&cmd.freeText?.()){cmd.text?.(v);step();return;}
  if(!v.trim()){enter();return;}
  if(selecting.current){selectKeyword(v);return;}
  if(dynLock.current!==null&&cmd.base?.()&&cmd.point){const a=Number(v.trim().replace(/[°d]$/i,''));if(Number.isFinite(a)){const b=cmd.base()!;const len=dynLock.current;dynLock.current=null;cmd.point([b[0]+len*Math.cos(a*DEG),b[1]+len*Math.sin(a*DEG)]);step();return;}}
  if(cmd.text?.(v)){step();return;}
  if(cmd.point&&!cmd.wantsPick?.()){const p=parsePoint(v,cmd.base?.(),cursor.current.world);if(p){cmd.point(p);step();return;}}
  // A typed point answers an object prompt with the object there.
  if(cmd.wantsPick?.()){const p=parsePoint(v,cmd.base?.(),cursor.current.world);if(p){cmd.pick?.(entityAt(p),p);step();return;}}
  say('Point or option keyword required.');
 }
 /** The selection keywords of AutoCAD's Select objects prompt. */
 function selectKeyword(raw:string){
  const v=raw.trim(),k=v.toUpperCase(),m=selMode.current,all=()=>store.doc.entities.filter(pickable);
  if(m?.kind==='G'){const g=store.doc.groups?.find(x=>x.name.toUpperCase()===k);if(g){store.select(g.ids.filter(id=>{const e=store.get(id);return !!e&&pickable(e);}),removing.current?'remove':'add');say(`${g.ids.length} found, ${store.selection.size} total`);}else say(`No group named ${v}.`);selMode.current=null;refresh();schedule();return;}
  if(m&&(m.kind==='W'||m.kind==='C'||m.kind==='F')){const p=parsePoint(v,m.pts[m.pts.length-1],cursor.current.world);if(p){selectPoint(p);return;}}
  if(k==='ALL'){addToSelection(all().map(e=>e.id),false);say(`${store.selection.size} found`);}
  else if(k==='L'||k==='LAST'){const last=all().at(-1);if(last)addToSelection([last.id],false);say(last?`1 found, ${store.selection.size} total`:'Nothing found.');}
  else if(k==='P'||k==='PREVIOUS'){const ids=prevSelection.current.filter(id=>{const e=store.get(id);return !!e&&pickable(e);});addToSelection(ids,false);say(`${ids.length} found, ${store.selection.size} total`);}
  else if(k==='W'||k==='WINDOW'||k==='C'||k==='CROSSING'){selMode.current={kind:k[0] as 'W'|'C',pts:[]};}
  else if(k==='F'||k==='FENCE'){selMode.current={kind:'F',pts:[]};}
  else if(k==='G'||k==='GROUP'){selMode.current={kind:'G',pts:[]};}
  else if(k==='R'||k==='REMOVE'){removing.current=true;}
  else if(k==='A'||k==='ADD'){removing.current=false;}
  else say('Pick objects, use a selection option, or press Enter.');
  refresh();schedule();
 }
 /** A point given while a selection option collects points (window, crossing, fence). */
 function selectPoint(p:Pt){
  const m=selMode.current!;m.pts.push(p);
  if((m.kind==='W'||m.kind==='C')&&m.pts.length===2){
   const [a,b]=m.pts,box:Box=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])],ids=store.doc.entities.filter(e=>pickable(e)&&inWindow(e,box,m.kind==='C',store.doc)).map(e=>e.id);
   lastWindow.current={box,crossing:m.kind==='C'};addToSelection(ids,false);say(`${ids.length} found, ${store.selection.size} total`);selMode.current=null;
  }
  refresh();schedule();
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
  lastWindow.current={box,crossing};
  addToSelection(ids,shift);
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
  if(cmd&&selecting.current&&selMode.current&&selMode.current.kind!=='G'){selectPoint(raw);return;}
  if(grip.current){commitGrip(resolvePoint(raw,grip.current.from).p);return;}
  if(cmd&&!selecting.current){
   if(cmd.wantsPick?.()){cmd.pick?.(entityAt(raw),raw);step();return;}
   const {p}=resolvePoint(raw,cmd.base?.());dynLock.current=null;cmd.point?.(p);step();return;
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
  let world=raw;snap.current=undefined;track.current={};
  if(wantsPoint()){const r=resolvePoint(raw,currentBase());world=r.p;snap.current=r.snap;track.current={tracks:r.tracks,tip:r.tip};dwellOn(raw);}
  hover.current=!wantsPoint()&&!windowSel.current&&!panMode?entityAt(raw):undefined;
  cursor.current={screen:[x,y],world,raw};setCoords(world);schedule();
 }
 function onPointerUp(e:React.PointerEvent){
  if(pan.current){pan.current=null;schedule();return;}
  const w=windowSel.current;
  if(w?.dragged)finishWindow(toWorld(view.current,...local(e)),e.shiftKey);
  else if(w&&w.hit!==undefined){windowSel.current=null;addToSelection([w.hit],!!w.shift);if(selecting.current)say(`${withGroups([w.hit]).length} found, ${store.selection.size} total`);schedule();}
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
  if(!hit)return;
  grip.current=null;store.select([hit.id]);
  if(hit.type==='text'||hit.type==='dim')setTextEdit({id:hit.id,value:hit.type==='text'?hit.value:hit.text??'',x,y});
  else if(hit.type==='mtext'||hit.type==='leader')setTextEdit({id:hit.id,value:hit.value,x,y,multi:true});
  else if(hit.type==='table'){const c=cellAt(hit,toWorld(view.current,x,y));if(c)setTextEdit({id:hit.id,value:hit.cells[c.i]?.[c.j]??'',x,y,multi:true,cell:c});}
 }
 function onAuxClick(e:React.MouseEvent){if(e.button===1&&e.detail===2)zoomExtents();}

 // ---- keyboard ----
 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{
   const target=e.target as HTMLElement,inField=target&&target!==cmdRef.current&&['INPUT','SELECT','TEXTAREA'].includes(target.tagName);
   const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
   if(e.key==='F1'){e.preventDefault();setHelp(v=>!v);return;}
   const fkeys={F3:'osnap',F7:'grid',F8:'ortho',F9:'snap',F10:'polar',F11:'otrack',F12:'dyn'} as const;
   if(e.key in fkeys){e.preventDefault();const name=fkeys[e.key as keyof typeof fkeys],on=!togglesRef.current[name];
    // Ortho and polar tracking exclude each other, as in AutoCAD.
    setToggles(t=>({...t,[name]:on,...(on&&name==='ortho'?{polar:false}:on&&name==='polar'?{ortho:false}:{})}));say(`<${({osnap:'Osnap',grid:'Grid',ortho:'Ortho',snap:'Snap',polar:'Polar',otrack:'Object Snap Tracking',dyn:'Dynamic Input'} as const)[name]} ${on?'on':'off'}>`);return;}
   if(mod&&e.shiftKey&&k==='a'){e.preventDefault();setPickGroups(v=>{say(`<Groups ${v?'off':'on'}>`);return !v;});return;}
   if(inField)return;
   if(mod&&k==='z'&&!e.shiftKey){e.preventDefault();run('UNDO');return;}
   if(mod&&(k==='y'||(k==='z'&&e.shiftKey))){e.preventDefault();run('REDO');return;}
   if(mod&&k==='a'){e.preventDefault();store.select(store.doc.entities.filter(pickable).map(v=>v.id));schedule();return;}
   if(mod&&(k==='c'||k==='x')){const sel=store.selected().filter(pickable);if(!sel.length)return;e.preventDefault();const b=sel.map(v=>bbox(v,store.doc));clipboard.current={ents:sel.map(stripId),base:[Math.min(...b.map(v=>v[0])),Math.min(...b.map(v=>v[1]))]};if(k==='x')store.commit('Cut',{del:sel.map(v=>v.id)});say(`${sel.length} ${k==='x'?'cut':'copied'} to the clipboard.`);schedule(true);return;}
   if(mod&&k==='v'){if(!clipboard.current)return;e.preventDefault();if(active.current)endCommand(false);active.current=placeCmd(env,'PASTE',clipboard.current.ents,clipboard.current.base);say('Command: PASTE');refresh();schedule();return;}
   if(e.key==='Delete'&&!active.current&&store.selection.size&&!input){e.preventDefault();run('ERASE');return;}
   if(e.key==='Escape'){e.preventDefault();cancel();return;}
   // Enter and Space answer the command line wherever the focus is (AutoCAD).
   if(target!==cmdRef.current&&!mod&&(e.key==='Enter'||(e.key===' '&&(selecting.current||!active.current?.freeText?.())))){e.preventDefault();cmdRef.current?.focus();submit(input);return;}
   if(target!==cmdRef.current&&!mod&&e.key.length===1&&/[\w@.,<'"/ -]/.test(e.key)){cmdRef.current?.focus();}
  };
  window.addEventListener('keydown',onKey);return ()=>window.removeEventListener('keydown',onKey);
 });
 function onCmdKey(e:React.KeyboardEvent<HTMLInputElement>){
  const free=!selecting.current&&!!active.current?.freeText?.();
  // Dynamic input: Tab locks a typed length; the angle follows the cursor or is typed next.
  if(e.key==='Tab'&&togglesRef.current.dyn&&wantsPoint()&&currentBase()){const v=parseLength(input);if(v!==undefined&&v>0){e.preventDefault();dynLock.current=v;setInput('');say(`Length ${lengthText(v)}: type the angle, or click.`);schedule();return;}}
  if(e.key==='Enter'||(e.key===' '&&!free)){e.preventDefault();submit(input);return;}
  if(e.key==='Escape'){e.preventDefault();cancel();}
 }

 // ---- property edits ----
 const selected=store.selected();
 function putEnt(e:Ent,label='Properties'){store.commit(label,{put:[e]});schedule(true);}
 function applyTextEdit(){
  const t=textEdit!,ent=store.get(t.id);
  if(ent?.type==='text'&&t.value.trim())putEnt({...ent,value:t.value},'Edit text');
  else if(ent?.type==='dim')putEnt({...ent,text:t.value.trim()||undefined},'Edit dimension text');
  else if((ent?.type==='mtext'||ent?.type==='leader')&&(t.value.trim()||ent.type==='leader'))putEnt({...ent,value:t.value.replace(/\s+$/,'')},'Edit text');
  else if(ent?.type==='table'&&t.cell)putEnt(setCell(ent,t.cell.i,t.cell.j,t.value.replace(/\s+$/,'')),'Edit cell');
  setTextEdit(null);cmdRef.current?.focus();
 }
 function setLayers(layers:CadLayer[],label:string){store.commit(label,{layers});schedule(true);}
 function changeLayerOfSelection(name:string){store.commit('Change layer',{put:selected.map(e=>({...e,layer:name}))});schedule(true);}
 function changeSelection(label:string,fn:(e:Ent)=>Ent){store.commit(label,{put:selected.filter(pickable).map(fn)});schedule(true);}
 function resolveStale(keep:boolean){
  if(keep){void saveCadRecord(source.project,source.base,store.doc).then(()=>setSaveState('saved'));say('Kept the edited drawing for the current design.');}
  else{void deleteCadRecord(source.project,doc.key);store.reset(structuredClone(source.generated));startVersion.current=store.docVersion;setSaveState('generated');say('Started over from the generated drawing.');}
  setStale(false);setUnderlay(false);
 }
 function revert(){
  if(!window.confirm('Discard every edit to this drawing and go back to the generated drawing?'))return;
  void deleteCadRecord(source.project,doc.key);store.reset(structuredClone(source.generated));startVersion.current=store.docVersion;setSaveState('generated');setStale(false);say('Reverted to the generated drawing.');zoomExtents();
 }

 const I=(C:typeof Slash,extra?:React.CSSProperties)=><C size={16} style={extra}/>;
 type Tool=[string,string,ReactNode];
 const ribbon:{tab:string;panels:{name:string;tools:Tool[]}[]}[]=[
  {tab:'Home',panels:[
   {name:'Draw',tools:[['LINE','Line (L)',I(Slash)],['PLINE','Polyline (PL)',I(Waypoints)],['RECTANG','Rectangle (REC)',I(RectangleHorizontal)],['CIRCLE','Circle (C)',I(Circle)],
    ['ARC','Arc (A): 3 points, or start, center, end and the other AutoCAD variants',I(Spline)],['ELLIPSE','Ellipse (EL)',I(Egg)],['SPLINE','Spline (SPL)',I(Activity)],['POLYGON','Polygon (POL)',I(Hexagon)],
    ['XLINE','Construction line (XL)',I(MoveDiagonal)],['HATCH','Hatch (H): pick inside a closed area',I(PaintBucket)]]},
   {name:'Modify',tools:[['MOVE','Move (M)',I(Move)],['COPY','Copy (CO)',I(Copy)],['ROTATE','Rotate (RO)',I(RotateCw)],['SCALE','Scale (SC)',I(Scaling)],['MIRROR','Mirror (MI)',I(FlipHorizontal2)],
    ['OFFSET','Offset (O)',I(CopyPlus)],['TRIM','Trim (TR)',I(Scissors)],['EXTEND','Extend (EX)',I(ArrowRightToLine)],['FILLET','Fillet (F)',I(CornerDownRight)],['CHAMFER','Chamfer (CHA)',I(Diamond)],
    ['STRETCH','Stretch (S): select with a crossing window',I(StretchHorizontal)],['ARRAYRECT','Rectangular array (AR)',I(Grid3x3)],['ARRAYPOLAR','Polar array',I(RotateCcw)],
    ['BREAK','Break (BR)',I(Unlink)],['JOIN','Join (J)',I(Link)],['LENGTHEN','Lengthen (LEN)',I(MoveRight)],['ALIGN','Align (AL)',I(AlignHorizontalJustifyStart)],
    ['PEDIT','Edit polyline (PE)',I(PenLine)],['MATCHPROP','Match properties (MA)',I(Paintbrush)],['EXPLODE','Explode (X)',I(Ungroup)],['ERASE','Erase (E, Delete)',I(Eraser)]]},
   {name:'Select',tools:[['QSELECT','Quick select (QSELECT)',I(Scan)],['SELECTSIMILAR','Select similar',I(Combine)],['GROUP','Group (G)',I(Blocks)],['UNGROUP','Ungroup',I(Ungroup)]]},
   {name:'Utilities',tools:[['DIST','Measure distance (DI)',I(MoveHorizontal)]]},
  ]},
  {tab:'Annotate',panels:[
   {name:'Text',tools:[['TEXT','Single-line text (T)',I(Type)],['MTEXT','Multiline text (MT)',I(AlignLeft)],['STYLE','Text styles (ST)',I(CaseSensitive)]]},
   {name:'Dimensions',tools:[['DIMLINEAR','Linear dimension (DLI)',I(Ruler)],['DIMALIGNED','Aligned dimension (DAL)',I(Ruler,{transform:'rotate(-35deg)'})],['DIMANGULAR','Angular dimension (DAN)',I(Triangle)],
    ['DIMRADIUS','Radius dimension (DRA)',I(Radius)],['DIMDIAMETER','Diameter dimension (DDI)',I(Diameter)],['DIMORDINATE','Ordinate dimension (DOR)',I(Milestone)],
    ['DIMBASELINE','Baseline dimensions (DBA)',I(Rows3)],['DIMCONTINUE','Continued dimensions (DCO)',I(Columns3)],['DIMSTYLE','Dimension styles (D)',I(Settings2)]]},
   {name:'Leaders',tools:[['MLEADER','Multileader (MLD)',I(MessageSquareText)],['LEADER','Leader (LE)',I(MessageSquare)]]},
   {name:'Tables',tools:[['TABLE','Table (TB)',I(Table)]]},
   {name:'Markup',tools:[['REVCLOUD','Revision cloud',I(Cloud)]]},
  ]},
  {tab:'View',panels:[
   {name:'Navigate',tools:[['ZOOM','Zoom (Z): E extents, W window',I(Maximize2)]]},
   {name:'Plot',tools:[['PLOTSTYLE','Plot style: monochrome, grayscale or color',I(Palette)],['LTSCALE','Linetype scale (LTS)',I(Waves)],['UCS','Origin for ordinate dimensions (UCS)',I(Milestone)]]},
  ]},
 ];
 const [ribbonTab,setRibbonTab]=useState('Home');
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
  <div className="cad-ribbon">
   <div className="cad-tabs" role="tablist" aria-label="Ribbon">{ribbon.map(r=><button key={r.tab} role="tab" aria-selected={ribbonTab===r.tab} className={ribbonTab===r.tab?'on':''} onClick={()=>setRibbonTab(r.tab)}>{r.tab}</button>)}</div>
   <div className="cad-panels" role="toolbar" aria-label={`${ribbonTab} tools`}>
    <button title="Select (Esc)" aria-label="Select (Esc)" className={!active.current&&!panMode?'on':''} onClick={()=>{cancel();setPanMode(false);}}><MousePointer2 size={16}/></button>
    {ribbon.find(r=>r.tab===ribbonTab)!.panels.map(p=><div key={p.name} className="cad-panelgroup" role="group" aria-label={p.name}><div>{p.tools.map(([name,title,icon])=><button key={name} title={title} aria-label={title} className={active.current?.name===name?'on':''} onClick={()=>run(name)}>{icon}</button>)}</div><span>{p.name}</span></div>)}
   </div>
  </div>
  <div className="cad-body">
   <div className="cad-canvas" ref={wrapRef}>
    <canvas ref={sceneRef} aria-hidden="true"/>
    <canvas ref={overlayRef} className={panMode||pan.current?'panning':''} data-testid="cad-canvas" onPointerDown={onPointerDown} onMouseDown={e=>e.preventDefault()} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
     onPointerLeave={()=>{cursor.current={...cursor.current,screen:undefined};hover.current=undefined;schedule();}} onDoubleClick={onDoubleClick} onAuxClick={onAuxClick} onContextMenu={e=>e.preventDefault()}/>
    {textEdit&&<div className="cad-text-edit" style={{left:Math.min(textEdit.x,view.current.w-300),top:Math.max(4,textEdit.y-(textEdit.multi?96:44))}}>
     {textEdit.multi?<textarea autoFocus aria-label={textEdit.cell?'Cell text':'Text'} rows={4} value={textEdit.value} onChange={e=>setTextEdit({...textEdit,value:e.target.value})}
       onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey||textEdit.cell&&!e.shiftKey)){e.preventDefault();applyTextEdit();}if(e.key==='Escape'){setTextEdit(null);cmdRef.current?.focus();}}}/>
      :<input autoFocus aria-label="Text" value={textEdit.value} onChange={e=>setTextEdit({...textEdit,value:e.target.value})}
       onKeyDown={e=>{if(e.key==='Enter')applyTextEdit();if(e.key==='Escape'){setTextEdit(null);cmdRef.current?.focus();}}}/>}
     <small>{textEdit.multi?(textEdit.cell?'Enter applies · Shift+Enter new line':'Ctrl+Enter applies · Enter new line'):'Enter to apply'} · Esc to cancel{store.get(textEdit.id)?.type==='dim'?' · empty measures the distance':''}</small></div>}
    {help&&<HelpCard onClose={()=>setHelp(false)}/>}
    {settings==='osnap'&&<div className="cad-pop" role="dialog" aria-label="Object snap settings"><h3>Object snaps<button aria-label="Close" onClick={()=>setSettings(null)}><X size={12}/></button></h3>
     {allSnapModes.map(m=><label key={m}><input type="checkbox" checked={snapModes.has(m)} onChange={ev=>{const n=new Set(snapModes);if(ev.target.checked)n.add(m);else n.delete(m);setSnapModes(n);savePref('cad-osnap',[...n]);}}/>{snapNames[m]}</label>)}
     <div className="cad-pop-row"><button onClick={()=>{const n=new Set(allSnapModes);setSnapModes(n);savePref('cad-osnap',[...n]);}}>All</button><button onClick={()=>{setSnapModes(new Set());savePref('cad-osnap',[]);}}>None</button><button onClick={()=>{setSnapModes(new Set(defaultSnapModes));savePref('cad-osnap',defaultSnapModes);}}>Default</button></div></div>}
    {settings==='polar'&&<div className="cad-pop" role="dialog" aria-label="Polar tracking angle"><h3>Polar angle<button aria-label="Close" onClick={()=>setSettings(null)}><X size={12}/></button></h3>
     {[90,45,30,22.5,18,15,10,5].map(a=><label key={a}><input type="radio" name="polar" checked={polarAngle===a} onChange={()=>{setPolarAngle(a);savePref('cad-polar',a);setToggles(v=>({...v,polar:true,ortho:false}));}}/>{a}°</label>)}</div>}
    {styles&&<StylesDialog kind={styles} doc={doc} vars={vars.current} onClose={()=>setStyles(null)} onChange={(meta,label)=>{store.commit(label,{meta});schedule(true);}} onCurrent={(k,name)=>{vars.current[k==='text'?'TEXTSTYLE':'DIMSTYLE']=name;say(`Current ${k==='text'?'text':'dimension'} style: ${name}.`);refresh();}}
     onApplyDims={name=>{const st=(store.doc.dimStyles??[]).find(d=>d.name===name)??standardDimStyle(store.doc.unit);const dims=store.doc.entities.filter(e=>e.type==='dim'&&(e.style??'Standard')===name);if(dims.length){store.commit('Update dimensions',{put:dims.map(e=>({...e,height:st.textHeight*st.scale}) as Ent)});say(`${dims.length} dimensions updated to ${name}.`);schedule(true);}}}/>}
    {qselect&&<QuickSelect doc={doc} selected={selected} onClose={()=>setQselect(false)} onApply={(ids,append)=>{store.select(withGroups(ids),append?'add':'replace');say(`${ids.length} objects selected.`);setQselect(false);schedule();}} pickable={pickable}/>}
    {toggles.dyn&&cursor.current.screen&&(active.current||input)&&!textEdit&&<div className="cad-dyn" aria-hidden="true" style={{left:Math.min(cursor.current.screen[0]+20,view.current.w-260),top:Math.min(cursor.current.screen[1]+24,view.current.h-48)}}>
     <span>{prompt().replace(/^\S+ /,'').replace(/^\*\* STRETCH \*\* /,'')}</span><b>{input||'\u00a0'}</b>{dynLock.current!==null&&<em>length {lengthText(dynLock.current)} locked</em>}</div>}
   </div>
   {(panel.props||panel.layers)&&<aside className="cad-side">
    {panel.props&&<section className="cad-panel" aria-label="Properties"><h3><SlidersHorizontal size={13}/>Properties<button aria-label="Hide properties" onClick={()=>setPanel(v=>({...v,props:false}))}><X size={12}/></button></h3>
     <Properties doc={doc} selected={selected} layers={doc.layers} onPut={putEnt} onLayer={changeLayerOfSelection} onAll={changeSelection} lengthText={lengthText}/></section>}
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
    {(['grid','snap','ortho','polar','osnap','otrack','dyn','lwt'] as const).map(t=><span key={t} className="cad-toggle"><button className={toggles[t]?'on':''} aria-pressed={toggles[t]}
     title={({grid:'Grid (F7)',snap:'Snap to grid (F9)',ortho:'Ortho (F8)',polar:`Polar tracking, every ${polarAngle}° (F10)`,osnap:'Object snap (F3)',otrack:'Object snap tracking: hover a snap point to acquire it (F11)',dyn:'Dynamic input at the cursor; Tab locks a typed length (F12)',lwt:'Lineweights'})[t]}
     onClick={()=>setToggles(v=>({...v,[t]:!v[t],...(!v[t]&&t==='ortho'?{polar:false}:!v[t]&&t==='polar'?{ortho:false}:{})}))}>{t==='otrack'?'OTRACK':t.toUpperCase()}</button>
     {(t==='osnap'||t==='polar')&&<button className="cad-more" aria-label={t==='osnap'?'Object snap settings':'Polar tracking angle'} aria-expanded={settings===t} onClick={()=>setSettings(v=>v===t?null:t)}>▾</button>}</span>)}
    <button className={pickGroups?'on':''} aria-pressed={pickGroups} title="Picking a group member selects the whole group (Ctrl+Shift+A)" onClick={()=>setPickGroups(v=>!v)}>GROUPS</button>
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
 ['C · CIRCLE','Center, then radius (or D for diameter)'],['A · ARC','3 points; C center, E end, then A angle, L chord, R radius, D direction; Enter continues tangent'],
 ['EL · ELLIPSE','Axis endpoints and the other half-axis; C from the center; A for an elliptical arc'],['SPL · SPLINE','Fit points (M for control vertices); C closes'],
 ['XL · XLINE / RAY','Construction lines: through points, H, V, A angle, B bisect, O offset'],['POL · POLYGON','Sides, center, inscribed or circumscribed, radius; E on an edge'],['DO · DONUT','Inside and outside diameters, then centers'],
 ['H · HATCH','Pick inside closed areas (islands stay open), or S to select closed objects; P pattern, SC scale, A angle; Enter makes the hatch'],
 ['T · TEXT','Start point, height, rotation, then the text; Enter on an empty line ends'],
 ['MT · MTEXT','Two corners (H height, J justify, R rotation, S style, W width), then lines; an empty line ends'],
 ['DLI · DIMLINEAR','Two points, then the dimension line (H or V to force)'],['DAL · DIMALIGNED','A dimension parallel to the two points'],
 ['DAN · DIMANGULAR','Two lines, an arc, a circle, or Enter for a vertex and two points; then the arc location'],['DRA · DIMRADIUS / DDI · DIMDIAMETER','An arc or circle, then the text location'],
 ['DOR · DIMORDINATE','Feature point, then the leader end (X or Y datum); UCS sets the origin'],['DBA · DIMBASELINE / DCO · DIMCONTINUE','Next points after the last linear dimension'],
 ['MLD · MLEADER / LE · LEADER','Arrowhead, landing (or points), then the note'],['TB · TABLE','Columns, rows, sizes, corner; double-click a cell to type'],['REVCLOUD','R rectangular, P polygonal, O object, A arc length'],
 ['ST · STYLE / D · DIMSTYLE','Text and dimension styles; LTSCALE, PLOTSTYLE'],
 ['M · MOVE / CO · COPY','Select, base point, second point (COPY repeats)'],['RO · ROTATE','Select, base point, angle'],['SC · SCALE','Select, base point, factor'],
 ['MI · MIRROR','Select, two points on the mirror line, keep or erase the source'],['O · OFFSET','Distance, then an object and the side'],
 ['TR · TRIM / EX · EXTEND','Pick the part to trim, or the end to extend; every object is a boundary'],['F · FILLET / CHA · CHAMFER','R radius (D, A for chamfer), T trim, P whole polyline, M multiple; pick two objects'],
 ['S · STRETCH','Select with a crossing window, base point, second point'],['AR · ARRAYRECT / ARRAYPOLAR / ARRAYPATH','Columns and rows with spacing; center, count and angle; a path and a count'],
 ['BR · BREAK','Pick at the first point, then the second (@ breaks at the point; F picks the first point again)'],['J · JOIN','Lines, arcs and open polylines that meet, into one'],
 ['LEN · LENGTHEN','DE delta, P percent, T total, DY dynamic; then pick near the end to change'],['AL · ALIGN','Source and destination points (one or two pairs), optional scale'],
 ['PE · PEDIT','C/O close or open, J join, F fit, S spline, D decurve, R reverse'],['MA · MATCHPROP','Pick the source, then the objects to change'],
 ['X · EXPLODE','Polylines to lines and arcs, dimensions to lines and text'],
 ['E · ERASE (Delete)','Erase the selection'],['DI · DIST','Distance and angle between two points'],['Z · ZOOM','E extents, W window'],['U / REDO','Undo, redo (Ctrl+Z, Ctrl+Y)'],
 ['Points','Click (object snaps), or type x,y · @dx,dy · @d<angle · a distance along the cursor; lengths take 1\'6", 1-1/2, 3/4'],
 ['Mouse','Wheel zooms at the cursor; middle drag pans (or the hand); middle double-click zooms to the sheet; right click is Enter'],
 ['Selecting','Click objects; drag left to right for a window, right to left for crossing; Shift removes; Ctrl+A all; grips stretch'],
 ['Select objects','ALL, L last, P previous, W window, C crossing, F fence, G group, R remove, A add'],
 ['QSELECT · SELECTSIMILAR','Select by type and property; select objects like the selection'],['G · GROUP / UNGROUP','Name a group of the selection; picking a member selects the group (Ctrl+Shift+A)'],
 ['OS · OSNAP','Choose the running object snaps'],
 ['Keys','Enter or Space repeats or ends; Esc cancels; F3 snaps, F7 grid, F8 ortho, F9 grid snap, F10 polar, F11 snap tracking, F12 dynamic input (Tab locks a length); Ctrl+C / Ctrl+X / Ctrl+V; double-click text to edit'],
];
function HelpCard({onClose}:{onClose:()=>void}){
 return <div className="cad-help" role="dialog" aria-label="CAD commands"><h3>Commands and shortcuts<button aria-label="Close help" onClick={onClose}><X size={12}/></button></h3>
  <dl>{helpRows.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>;
}

const weights=[0,5,9,13,15,18,20,25,30,35,40,50,53,60,70,80,90,100,106,120,140,158,200,211];
type PropKey='color'|'ltype'|'weight'|'ltscale';
/** Color, linetype, lineweight and linetype scale of the selection: ByLayer or the object's own. */
function ObjectProps({selected,onAll}:{selected:Ent[];onAll:(label:string,fn:(e:Ent)=>Ent)=>void}){
 const same=<K extends PropKey>(k:K)=>selected.every(e=>e[k]===selected[0][k])?selected[0][k]:'*';
 const set=<K extends PropKey>(k:K,label:string,v:Ent[K]|undefined)=>onAll(label,e=>{const n={...e} as Ent;if(v===undefined)delete n[k];else (n as unknown as Record<string,unknown>)[k]=v;return n;});
 const c=same('color'),lt=same('ltype'),w=same('weight'),ls=same('ltscale');
 return <>
  <dt>Color</dt><dd><select aria-label="Color" value={c===undefined?'bylayer':String(c)} style={c!==undefined&&c!=='*'?{borderColor:aci(c)}:undefined} onChange={e=>set('color','Color',e.target.value==='bylayer'?undefined:+e.target.value)}>
   {c==='*'&&<option value="*">*varies*</option>}<option value="bylayer">ByLayer</option>{[...new Set([...aciPalette,...(typeof c==='number'?[c]:[])])].map(v=><option key={v} value={v}>{v}</option>)}</select></dd>
  <dt>Linetype</dt><dd><select aria-label="Linetype" value={lt===undefined?'bylayer':lt} onChange={e=>set('ltype','Linetype',e.target.value==='bylayer'?undefined:e.target.value as LineType)}>
   {lt==='*'&&<option value="*">*varies*</option>}<option value="bylayer">ByLayer</option>{lineTypes.map(v=><option key={v} value={v}>{v}</option>)}</select></dd>
  <dt>Lineweight</dt><dd><select aria-label="Lineweight" value={w===undefined?'bylayer':String(w)} onChange={e=>set('weight','Lineweight',e.target.value==='bylayer'?undefined:+e.target.value)}>
   {w==='*'&&<option value="*">*varies*</option>}<option value="bylayer">ByLayer</option>{weights.map(v=><option key={v} value={v}>{(v/100).toFixed(2)} mm</option>)}</select></dd>
  <dt>Lt scale</dt><dd><NumField value={typeof ls==='number'?ls:1} onCommit={v=>v>0&&set('ltscale','Linetype scale',Math.abs(v-1)<1e-12?undefined:v)}/></dd>
 </>;
}
/** Properties of the selection: geometry, text and layer, edited in place. */
function Properties({doc,selected,layers,onPut,onLayer,onAll,lengthText}:{doc:CadDoc;selected:Ent[];layers:CadLayer[];onPut:(e:Ent)=>void;onLayer:(name:string)=>void;onAll:(label:string,fn:(e:Ent)=>Ent)=>void;lengthText:(d:number)=>string}){
 if(!selected.length)return <dl className="cad-props"><dt>Drawing</dt><dd>{doc.key}</dd><dt>Units</dt><dd>{doc.unit==='in'?'Paper inches':doc.unit==='mm'?'Paper millimeters':'Sketch units'}</dd>
  <dt>Objects</dt><dd>{doc.entities.length.toLocaleString()}</dd><dt>Size</dt><dd>{fmtNum(doc.width)} × {fmtNum(doc.height)}</dd><dd className="cad-hint">Click objects, or drag a window (left to right: inside; right to left: crossing). Shift-click removes.</dd></dl>;
 const layerSel=<select aria-label="Layer of the selection" value={selected.every(e=>e.layer===selected[0].layer)?selected[0].layer:''} onChange={e=>onLayer(e.target.value)}>
  {!selected.every(e=>e.layer===selected[0].layer)&&<option value="">*varies*</option>}{layers.map(l=><option key={l.name} value={l.name}>{l.name}</option>)}</select>;
 if(selected.length>1){const by=new Map<string,number>();for(const e of selected)by.set(typeName[e.type],(by.get(typeName[e.type])??0)+1);
  return <dl className="cad-props"><dt>Selected</dt><dd>{selected.length.toLocaleString()} ({[...by].map(([k,v])=>`${v} ${k.toLowerCase()}${v>1?'s':''}`).join(', ')})</dd><dt>Layer</dt><dd>{layerSel}</dd><ObjectProps selected={selected} onAll={onAll}/></dl>;}
 const e=selected[0];
 const textStyleNames=['Standard',...(doc.textStyles??[]).map(t=>t.name).filter(n=>n!=='Standard')],dimStyleNames=['Standard',...(doc.dimStyles??[]).map(t=>t.name).filter(n=>n!=='Standard')];
 const styleSel=(value:string|undefined,set:(v:string|undefined)=>void)=><select aria-label="Text style" value={value??'Standard'} onChange={ev=>set(ev.target.value==='Standard'?undefined:ev.target.value)}>{textStyleNames.map(n=><option key={n} value={n}>{n}</option>)}</select>;
 const num=(label:string,value:number,set:(v:number)=>Ent|undefined)=><><dt>{label}</dt><dd><NumField value={value} onCommit={v=>{const n=set(v);if(n)onPut(n);}}/></dd></>;
 const pt=(label:string,p:Pt,set:(p:Pt)=>Ent)=><>{num(`${label} X`,p[0],v=>set([v,p[1]]))}{num(`${label} Y`,p[1],v=>set([p[0],v]))}</>;
 return <dl className="cad-props"><dt>Object</dt><dd>{typeName[e.type]}</dd><dt>Layer</dt><dd>{layerSel}</dd><ObjectProps selected={selected} onAll={onAll}/>
  {e.type==='line'&&<>{pt('Start',e.a,a=>({...e,a}))}{pt('End',e.b,b=>({...e,b}))}<dt>Length</dt><dd>{fmtNum(dist(e.a,e.b))} · {lengthText(dist(e.a,e.b))}</dd><dt>Angle</dt><dd>{fmtNum((angleOf(e.a,e.b)+360)%360)}°</dd></>}
  {e.type==='poly'&&<><dt>Vertices</dt><dd>{e.points.length}</dd><dt>Closed</dt><dd><input type="checkbox" checked={e.closed} onChange={ev=>onPut({...e,closed:ev.target.checked})}/></dd>
   <dt>Arc segments</dt><dd>{e.bulges?.filter(b=>b).length??0}</dd><dt>Length</dt><dd>{lengthText(curveLength(e))}</dd></>}
  {e.type==='circle'&&<>{pt('Center',e.center,center=>({...e,center}))}{num('Radius',e.radius,radius=>radius>0?{...e,radius}:undefined)}<dt>Diameter</dt><dd>{lengthText(2*e.radius)}</dd></>}
  {e.type==='arc'&&<>{pt('Center',e.center,center=>({...e,center}))}{num('Radius',e.radius,radius=>radius>0?{...e,radius}:undefined)}{num('Start angle',e.start,start=>({...e,start}))}{num('End angle',e.end,end=>({...e,end}))}<dt>Arc length</dt><dd>{lengthText(e.radius*sweep(e.start,e.end)*DEG)}</dd></>}
  {e.type==='ellipse'&&<>{pt('Center',e.center,center=>({...e,center}))}{num('Major radius',Math.hypot(...e.major),r=>r>0?{...e,major:[e.major[0]/Math.hypot(...e.major)*r,e.major[1]/Math.hypot(...e.major)*r]}:undefined)}
   {num('Radius ratio',e.ratio,ratio=>ratio>0&&ratio<=1?{...e,ratio}:undefined)}{num('Start parameter',e.start,start=>({...e,start}))}{num('End parameter',e.end,end=>({...e,end}))}<dt>Length</dt><dd>{lengthText(curveLength(e))}</dd></>}
  {e.type==='spline'&&<><dt>Degree</dt><dd>{e.degree}</dd><dt>{e.fit?'Fit points':'Control points'}</dt><dd>{e.fit?.length??e.ctrl.length}</dd><dt>Closed</dt><dd>{e.closed?'Yes':'No'}</dd><dt>Length</dt><dd>{lengthText(curveLength(e))}</dd></>}
  {(e.type==='xline'||e.type==='ray')&&<>{pt('Base',e.base,base=>({...e,base}))}{num('Angle',angleOf([0,0],e.dir),a=>({...e,dir:[Math.cos(a*DEG),Math.sin(a*DEG)]}))}</>}
  {e.type==='text'&&<><dt>Contents</dt><dd><TextField value={e.value} onCommit={value=>value.trim()&&onPut({...e,value})}/></dd>{num('Height',e.height,height=>height>0?{...e,height}:undefined)}{num('Rotation',e.angle,angle=>({...e,angle}))}
   <dt>Justify</dt><dd><select value={e.align} onChange={ev=>onPut({...e,align:+ev.target.value as 0|1|2})}><option value={0}>Left</option><option value={1}>Center</option><option value={2}>Right</option></select></dd>
   <dt>Bold</dt><dd><input type="checkbox" checked={e.bold} onChange={ev=>onPut({...e,bold:ev.target.checked})}/></dd>{pt('Position',e.at,at=>({...e,at}))}
   <dt>Style</dt><dd>{styleSel(e.style,v=>onPut({...e,style:v}))}</dd></>}
  {e.type==='mtext'&&<><dt>Contents</dt><dd><textarea className="cad-txt" rows={3} defaultValue={e.value} key={e.id+e.value} onBlur={ev=>{const v=ev.target.value.replace(/\s+$/,'');if(v&&v!==e.value)onPut({...e,value:v});}}/></dd>
   {num('Height',e.height,height=>height>0?{...e,height}:undefined)}{num('Width',e.width,width=>width>=0?{...e,width}:undefined)}{num('Rotation',e.angle,angle=>({...e,angle}))}{num('Line spacing',e.spacing??1,spacing=>spacing>0?{...e,spacing}:undefined)}
   <dt>Justify</dt><dd><select value={e.attach} onChange={ev=>onPut({...e,attach:+ev.target.value})}>{['Top left','Top center','Top right','Middle left','Middle center','Middle right','Bottom left','Bottom center','Bottom right'].map((n,i)=><option key={n} value={i+1}>{n}</option>)}</select></dd>
   <dt>Style</dt><dd>{styleSel(e.style,v=>onPut({...e,style:v}))}</dd><dt>Bold</dt><dd><input type="checkbox" checked={!!e.bold} onChange={ev=>onPut({...e,bold:ev.target.checked||undefined})}/></dd>{pt('Position',e.at,at=>({...e,at}))}</>}
  {e.type==='leader'&&<><dt>Text</dt><dd><textarea className="cad-txt" rows={2} defaultValue={e.value} key={e.id+e.value} onBlur={ev=>{const v=ev.target.value.replace(/\s+$/,'');if(v!==e.value)onPut({...e,value:v});}}/></dd>
   {num('Text height',e.height,height=>height>0?{...e,height}:undefined)}<dt>Arrowhead</dt><dd><select value={e.arrow??'closed'} onChange={ev=>onPut({...e,arrow:ev.target.value as 'closed'})}>{['closed','open','tick','dot','none'].map(a=><option key={a} value={a}>{a}</option>)}</select></dd>
   <dt>Landing</dt><dd><input type="checkbox" checked={e.landing!==false} onChange={ev=>onPut({...e,landing:ev.target.checked?undefined:false})}/></dd><dt>Vertices</dt><dd>{e.points.length}</dd></>}
  {e.type==='table'&&<><dt>Columns</dt><dd>{e.cols.length} <button title="Add a column" onClick={()=>onPut({...e,cols:[...e.cols,e.cols[e.cols.length-1]]})}>+</button><button title="Remove the last column" disabled={e.cols.length<2} onClick={()=>onPut({...e,cols:e.cols.slice(0,-1),cells:e.cells.map(r=>r.slice(0,e.cols.length-1))})}>−</button></dd>
   <dt>Rows</dt><dd>{e.rows.length} <button title="Add a row" onClick={()=>onPut({...e,rows:[...e.rows,e.rows[e.rows.length-1]]})}>+</button><button title="Remove the last row" disabled={e.rows.length<2} onClick={()=>onPut({...e,rows:e.rows.slice(0,-1),cells:e.cells.slice(0,e.rows.length-1)})}>−</button></dd>
   {num('Text height',e.height,height=>height>0?{...e,height}:undefined)}{num('Header rows',e.header??0,header=>header>=0&&header<=e.rows.length?{...e,header:Math.round(header)}:undefined)}
   {num('Column width',e.cols[0],w=>w>0?{...e,cols:e.cols.map(()=>w)}:undefined)}{num('Row height',e.rows[0],h=>h>0?{...e,rows:e.rows.map(()=>h)}:undefined)}{pt('Corner',e.at,at=>({...e,at}))}
   {e.source&&<><dt>Schedule</dt><dd>{e.source} (from the design)</dd></>}<dd className="cad-hint">Double-click a cell to type in it.</dd></>}
  {e.type==='dim'&&<><dt>Type</dt><dd>{e.kind==='horizontal'||e.kind==='vertical'||e.kind==='aligned'?<select value={e.kind} onChange={ev=>onPut({...e,kind:ev.target.value as typeof e.kind})}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option><option value="aligned">Aligned</option></select>:{angular:'Angular',radius:'Radius',diameter:'Diameter',ordinate:'Ordinate'}[e.kind]}</dd>
   <dt>Measurement</dt><dd>{dimValue({...e,text:undefined},doc)}</dd><dt>Style</dt><dd><select value={e.style??''} onChange={ev=>onPut({...e,style:ev.target.value||undefined})}><option value="">(none)</option>{dimStyleNames.map(n=><option key={n} value={n}>{n}</option>)}</select></dd><dt>Text override</dt><dd><TextField value={e.text??''} onCommit={t=>onPut({...e,text:t.trim()||undefined})}/></dd>{num('Text height',e.height,height=>height>0?{...e,height}:undefined)}</>}
  {e.type==='solid'&&<><dt>Vertices</dt><dd>{e.points.length}</dd></>}
  {e.type==='hatch'&&<><dt>Pattern</dt><dd><select aria-label="Hatch pattern" value={e.pattern} onChange={ev=>onPut({...e,pattern:ev.target.value})}>{patternNames.map(n=><option key={n} value={n}>{n}</option>)}</select></dd>
   {e.pattern!=='SOLID'&&<>{num('Scale',e.scale,scale=>scale>0?{...e,scale}:undefined)}{num('Angle',e.angle,angle=>({...e,angle}))}</>}
   <dt>Loops</dt><dd>{e.loops.length}</dd><dt>Area</dt><dd>{fmtNum(hatchArea(e.loops))} {doc.unit==='unit'?'sq units':`sq ${doc.unit}`}</dd></>}
 </dl>;
}
/** QSELECT: objects by type and property (layer, color, linetype, lineweight). */
function QuickSelect({doc,selected,onClose,onApply,pickable}:{doc:CadDoc;selected:Ent[];onClose:()=>void;onApply:(ids:number[],append:boolean)=>void;pickable:(e:Ent)=>boolean}){
 const [scope,setScope]=useState<'all'|'selection'>(selected.length?'selection':'all');
 const pool=(scope==='selection'?selected:doc.entities).filter(pickable);
 const types=[...new Set(pool.map(e=>e.type))];
 const [type,setType]=useState<QuickSpec['type']>('*'),[prop,setProp]=useState<QuickProp>('layer'),[op,setOp]=useState<QuickSpec['op']>('='),[exclude,setExclude]=useState(false),[append,setAppend]=useState(false);
 const values=[...new Set(pool.filter(e=>type==='*'||e.type===type).map(e=>propValue(e,prop)))].sort();
 const [value,setValue]=useState<string>('');const v=values.includes(value)?value:values[0]??'';
 return <div className="cad-pop cad-qselect" role="dialog" aria-label="Quick select"><h3>Quick select<button aria-label="Close quick select" onClick={onClose}><X size={12}/></button></h3>
  <label>Apply to<select value={scope} onChange={e=>setScope(e.target.value as 'all'|'selection')}><option value="all">Entire drawing</option>{selected.length>0&&<option value="selection">Current selection</option>}</select></label>
  <label>Object type<select value={type} onChange={e=>setType(e.target.value as QuickSpec['type'])}><option value="*">Multiple</option>{types.map(t=><option key={t} value={t}>{typeName[t]}</option>)}</select></label>
  <label>Property<select value={prop} onChange={e=>setProp(e.target.value as QuickProp)}><option value="layer">Layer</option><option value="color">Color</option><option value="ltype">Linetype</option><option value="weight">Lineweight</option></select></label>
  <label>Operator<select value={op} onChange={e=>setOp(e.target.value as QuickSpec['op'])}><option value="=">= Equals</option><option value="<>">&lt;&gt; Not equal</option><option value="*">* Select all</option></select></label>
  {op!=='*'&&<label>Value<select value={v} onChange={e=>setValue(e.target.value)}>{values.map(x=><option key={x} value={x}>{x}</option>)}</select></label>}
  <label className="cad-check"><input type="checkbox" checked={exclude} onChange={e=>setExclude(e.target.checked)}/>Exclude from the new selection</label>
  <label className="cad-check"><input type="checkbox" checked={append} onChange={e=>setAppend(e.target.checked)}/>Append to the current selection</label>
  <div className="cad-pop-row"><button className="on" onClick={()=>onApply(quickSelect(pool,{type,prop,op,value:v,exclude}),append)}>Select</button><button onClick={onClose}>Cancel</button></div></div>;
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

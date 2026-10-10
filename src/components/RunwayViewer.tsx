import {modelPalette,modelLegend,modelMaterial,addModelLighting,frameModelCamera} from './viewerAppearance';
import './viewerAppearance.css';
import {topFlangeAngleColumnHoles} from './topFlangeAngleGeometry';
import {usesExistingBracket} from '../engine/existingBracket';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import FastenerDetail from './FastenerDetail';
import ConnectionReview from './ConnectionReview';
import {connectionOptionChecks,connectionHardwareAuditSupported,bracketArrangement,tieArrangement} from '../engine/connectionOptions';
import {buildAlternativeTies} from './alternativeTieGeometry';
import {hardwareAuditModel,type AuditModel} from './hardwareAuditModel';
import {type HardwareAudit,type HardwareClash} from './hardwareClashes';
import {buildRunwaySteel} from './runwaySteelGeometry';
import { Box, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { CalculationSnapshot, ProjectInput } from '../engine/types';
import { format } from '../engine/units';
import { validateProject } from '../engine/calculate';
import { aiscShapeSource, referenceColumns, referenceCrossheads } from '../data/aiscReferenceShapes';
import { buildReferenceFraming,newColumnFraming } from './referenceFraming';
import { buildRunwayDetails, createHardwareBuilder, holeRimGeometry, type Hole, type PartInfo } from './connectionDetails';
import { buildReferenceStructure, cloneOppositeRunway } from './referenceStructure';
import {railKeeperStations} from '../engine/simpleSupports';
import {independentBearingSettings,buildIndependentSupports} from './independentSupportGeometry';
import type { FrameStyle } from './metalBuildingGeometry';
import { defaultFraming, type FramingSettings } from './framingSettings';
import {buildLoadArrows,viewerLoads,loadColors,loadViewNotes,type LoadView} from './viewerLoads';
import './viewerLoads.css';
import {flangeTieGeometry} from '../engine/tieGeometry';
const tieFaceMeters=(p:Parameters<typeof flangeTieGeometry>[0])=>{const f=flangeTieGeometry(p)?.face;return f===undefined?undefined:f/1000;};

type Projection = 'orthographic'|'perspective';
type View = 'Isometric' | 'Front' | 'End' | 'Top';
interface SceneApi { loads:(mode:LoadView,values:boolean)=>void; welds:(enabled:boolean)=>void; auditModel:()=>AuditModel; clash:(item:HardwareClash)=>void; setView:(v:View)=>void; zoom:(factor:number)=>void; wireframe:(enabled:boolean)=>void; holes:(enabled:boolean)=>void; focus:(id:string)=>void; clearSelection:()=>void; inspectPart:(id:string)=>void; zoomPart:()=>void; }
interface Props { input:ProjectInput; snapshot:CalculationSnapshot|null; expanded?:boolean; framing:FramingSettings; setFraming:React.Dispatch<React.SetStateAction<FramingSettings>>; }
const caseLabels:Record<string,string>={moment:'Peak moment',shear:'Peak shear',deflection:'Peak deflection',reaction:'Peak reaction',lateralMoment:'Peak lateral moment'};
export default function RunwayViewer({input,snapshot,expanded=false,framing,setFraming}:Props){
 const host=useRef<HTMLDivElement>(null),api=useRef<SceneApi|null>(null);
 const [view,setView]=useState<View>('Isometric'),[wire,setWire]=useState(false),[governing,setGoverning]=useState('moment'),[error,setError]=useState('');
 const [projection,setProjection]=useState<Projection>('orthographic');
 const [loadView,setLoadView]=useState<LoadView>('applied'),[loadValues,setLoadValues]=useState(true);
 const loads=useMemo(()=>viewerLoads(snapshot,governing),[snapshot,governing]),visibleLoads=loads.filter(l=>l.mode===loadView);
 const [detailed,setDetailed]=useState(()=>{try{return localStorage.getItem('cranecalc.viewer.hardware.v1')!=='false';}catch{return true;}});
 const [holes,setHoles]=useState(false),[holeCount,setHoleCount]=useState(0);
 const [focus,setFocus]=useState(''),[selected,setSelected]=useState<PartInfo|null>(null),[fasteners,setFasteners]=useState(0),[clipCount,setClipCount]=useState(0);
 const [parts,setParts]=useState<PartInfo[]>([]),[detailPart,setDetailPart]=useState<PartInfo|null>(null);
 const [buildingColumns,setBuildingColumns]=useState(0),[welds,setWelds]=useState(true),[weldCount,setWeldCount]=useState(0);
 const [audit,setAudit]=useState<HardwareAudit|null>(null),[auditing,setAuditing]=useState(false),[selectedClash,setSelectedClash]=useState<HardwareClash|null>(null);
 const auditWorker=useRef<Worker|null>(null),[auditError,setAuditError]=useState('');
 const scan=()=>{const model=api.current?.auditModel();if(!model)return;setAuditing(true);setAuditError('');auditWorker.current?.terminate();const worker=new Worker(new URL('./hardwareClashWorker.ts',import.meta.url),{type:'module'});auditWorker.current=worker;
  worker.onmessage=e=>{if(auditWorker.current!==worker)return;setAuditing(false);if(e.data.error)setAuditError(e.data.error);else setAudit(e.data.audit);worker.terminate();auditWorker.current=null;};
  worker.onerror=()=>{setAuditing(false);setAuditError('The hardware scan could not complete. Please run it again.');worker.terminate();auditWorker.current=null;};worker.postMessage(model);
 };
 const downloadAudit=()=>{if(!audit)return;const url=URL.createObjectURL(new Blob([JSON.stringify({revision:snapshot?.revision,framing,createdAt:new Date().toISOString(),audit},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='runway-hardware-clash-review.json';a.click();URL.revokeObjectURL(url);};
 const whole=framing.shown&&framing.full!==false,bayWidth=(framing.width??defaultFraming.width)/1000;
 useEffect(()=>{try{localStorage.setItem('cranecalc.viewer.hardware.v1',String(detailed));}catch{}},[detailed]);
 const invalid=validateProject(input).length>0;
 const loadCase=snapshot?.analysis?.demand.governing[governing];
 const wheelCount=loadCase?.points.length??0;
 useEffect(()=>{
  setAudit(null);setAuditError('');setAuditing(false);setSelectedClash(null);setSelected(null);
  const container=host.current;if(!container||invalid)return;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{setError('WebGL 2 is unavailable. Use the 2D elevation view.');return;}
  setError('');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setClearColor(0xe3e6ef,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
  renderer.domElement.setAttribute('aria-label','Interactive 3D runway model');renderer.domElement.tabIndex=0;
  container.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),group=new THREE.Group();scene.add(group);
  const length=input.spans.reduce((a,b)=>a+b,0)/1000,s=input.section,d=s.d/1000,bf=s.bf/1000,tf=s.tf/1000,tw=s.tw/1000;
  const supportHeight=Math.max(.65,d*1.25);let floor=-d/2-supportHeight;
  let viewAspect=1;
  const camera=projection==='orthographic'?new THREE.OrthographicCamera(-1,1,1,-1,.001,Math.max(200,length*20)):new THREE.PerspectiveCamera(35,1,.001,Math.max(200,length*20));
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minDistance=Math.max(.12,d*.5);controls.maxDistance=Math.max(length*10,framing.height/100,whole?bayWidth*15:0);controls.zoomToCursor=true;controls.minZoom=.05;controls.maxZoom=500;controls.listenToKeyEvents(renderer.domElement);
  addModelLighting(scene);
  const steel=modelMaterial(modelPalette.runway),cap=modelMaterial(modelPalette.cap),rail=modelMaterial(modelPalette.rail),support=modelMaterial(modelPalette.plate),wheelMaterial=modelMaterial(modelPalette.wheel);
  const columnMaterial=modelMaterial(modelPalette.column),beamMaterial=modelMaterial(modelPalette.roof),plateMaterial=modelMaterial(modelPalette.plate),foundationMaterial=modelMaterial(modelPalette.foundation);
  const framingEdges=new THREE.LineBasicMaterial({color:modelPalette.edge,transparent:true,opacity:.85});
  const hardwareMaterial=modelMaterial(0xffffff,{vertexColors:true}),weldMaterial=modelMaterial(modelPalette.weld,{side:THREE.DoubleSide});
  const oppositeSteel=modelMaterial(modelPalette.opposite),craneMaterial=modelMaterial(modelPalette.crane),braceMaterial=modelMaterial(modelPalette.brace);
  const materials=[steel,cap,rail,support,wheelMaterial,columnMaterial,beamMaterial,plateMaterial,foundationMaterial,hardwareMaterial,weldMaterial,oppositeSteel,craneMaterial,braceMaterial];
  const hardware=detailed?createHardwareBuilder(hardwareMaterial):undefined;
  const box=(l:number,h:number,w:number,x:number,y:number,z:number,material:THREE.Material,edges=true)=>{
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(l,h,w),material);mesh.position.set(x,y,z);group.add(mesh);
   if(edges){const outline=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),framingEdges);mesh.add(outline);}return mesh;
  };
  let position=-length/2;
  const supports=[position];for(const span of input.spans){position+=span/1000;supports.push(position);}
  const railBase=d/2+(s.kind==='cap'?s.capTw/1000:0),railH=Math.max(.025,input.railHeight/1000),railZ=input.railEccentricity/1000;
  const newColumn=newColumnFraming(input),reference=framing.shown?buildReferenceFraming({newColumn,columnFace:input.details?.bracket?.enabled?undefined:tieFaceMeters(input),columnConnectionHoles:topFlangeAngleColumnHoles(input),bracket:input.details?.bracket,continuousBearing:input.system==='continuous'&&input.details?.bracket?.enabled?{width:input.details.bearing.width/1000,length:input.details.bearing.length/1000,thickness:input.details.bearing.thickness/1000}:undefined,independentBearing:independentBearingSettings(input),supports,girderDepth:d,girderWidth:bf,girderFlangeT:tf,columnHeight:framing.height/1000,roofBottom:railBase+railH+.0125+(framing.roofClearance??defaultFraming.roofClearance)/1000,column:referenceColumns.find(s=>s.name===framing.column)!,crosshead:referenceCrossheads.find(s=>s.name===framing.crosshead)!,materials:{column:columnMaterial,beam:beamMaterial,plate:plateMaterial,foundation:foundationMaterial,weld:weldMaterial,edge:framingEdges},hardware,frameStyle:framing.frameStyle}):null;
  if(reference){group.add(reference.group);floor=reference.floor;}
  else for(const x of supports){box(.22,supportHeight,Math.max(.24,bf*.9),x,floor+supportHeight/2,0,support);box(.35,.035,Math.max(.38,bf*1.3),x,floor+.0175,0,support);}
  const cr=input.details?.rail;
  const runwayDetails=hardware?buildRunwayDetails({bearingStiffener:input.details?{width:input.details.bearing.stiffenerWidth/1000,thickness:input.details.bearing.stiffenerThickness/1000,cope:input.details.bearing.cope/1000,weld:input.details.bearing.weldSize/1000,topCjp:s.kind==='cap'&&!!input.capDesign?.topStiffenerCjp}:undefined,keeperStations:cr?railKeeperStations(input).map(x=>x/1000-length/2):undefined,omitStiffeners:input.system==='simple',supports,length,depth:d,width:bf,flangeT:tf,webT:tw,railBase,railZ,railBearingWidth:s.kind==='cap'?s.capWidth/1000:bf,railBearingT:s.kind==='cap'?s.capTw/1000:tf,weldedKeeper:cr?{width:cr.clipWidth/1000,thickness:cr.clipThickness/1000,projection:cr.clipProjection/1000,weld:cr.clipWeld/1000,baseWidth:cr.baseWidth/1000,baseThickness:cr.baseThickness/1000,spacing:input.aist!.clipSpacing/1000}:undefined,hardware,plate:plateMaterial,weld:weldMaterial,edge:framingEdges}):null;
  if(runwayDetails)group.add(runwayDetails.group);
  if(input.system==='simple')group.add(buildIndependentSupports(input,reference?.columnFace??.65,plateMaterial,framingEdges,hardware,true,weldMaterial));
  else if(tieArrangement(input.details)!=='paired-bars')group.add(buildAlternativeTies(input,reference?.columnFace??.65,plateMaterial,framingEdges,weldMaterial,hardware));
  group.add(buildRunwaySteel(input,{steel,cap,rail,weld:weldMaterial,edge:framingEdges},runwayDetails?.railHoles,reference?.girderBoltHoles));
  const radius=Math.max(.075,d*.16);
  for(const [index,point] of (loadCase?.points??[]).entries()){
   const wheel=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,.06,32),wheelMaterial);wheel.rotation.x=Math.PI/2;wheel.position.set(point.x/1000-length/2,railBase+railH+.0125+radius,railZ);group.add(wheel);
   const hub=new THREE.Mesh(new THREE.CylinderGeometry(radius*.34,radius*.34,.067,24),rail);hub.rotation.x=Math.PI/2;hub.position.copy(wheel.position);group.add(hub);
   if(hardware)for(let j=0;j<6;j++){
    const a=j*Math.PI/3,p=new THREE.Vector3(wheel.position.x+Math.cos(a)*radius*.22,wheel.position.y+Math.sin(a)*radius*.22,railZ-.0335);
    hardware.bolt(group,{id:`WH-${index+1}-${j+1}`,family:'Wheel hub bolt',description:'Representative wheel hub attachment',diameter:Math.min(.0127,radius*.085),grip:.067},p,new THREE.Vector3(0,0,1));
   }
  }
  if(whole){const opposite=cloneOppositeRunway(group,bayWidth,supports,railZ);opposite.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.material===steel||mesh.material===cap)mesh.material=oppositeSteel;});group.add(opposite);}
  const craneWheels=new Map<string,number[]>();for(const point of loadCase?.points??[]){const points=craneWheels.get(point.crane)??[];points.push(point.x/1000-length/2);craneWheels.set(point.crane,points);}
  const structure=whole&&reference&&!newColumn?buildReferenceStructure({supports,bayWidth,columnBottom:reference.columnBottom,floor,railTop:railBase+railH+.0125,roofClearance:(framing.roofClearance??defaultFraming.roofClearance)/1000,columnOffset:reference.columnOffset,column:referenceColumns.find(s=>s.name===framing.column)!,hardware,materials:{column:columnMaterial,beam:beamMaterial,plate:plateMaterial,foundation:foundationMaterial,brace:braceMaterial,crane:craneMaterial,edge:framingEdges},cranes:[...craneWheels].map(([id,wheels])=>({id,wheels})),wheelRadius:radius,railZ,frameStyle:framing.frameStyle,roofSlope:framing.roofSlope,bracketTop:reference.beamTop}):null;
  if(structure)group.add(structure.group);setBuildingColumns(reference?supports.length*(whole?2:1):0);
  const surfaceMaterials=new Set<THREE.Material>();
  group.traverse(object=>{
   const mesh=object as THREE.Mesh;if(!mesh.isMesh)return;
   for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    if(mesh.userData.existingSteel&&'color' in material)(material as THREE.MeshLambertMaterial).color.set(modelPalette.existing);
    if(material!==hardwareMaterial&&material!==weldMaterial)surfaceMaterials.add(material);
   }
  });
  setClipCount(runwayDetails?.clipLocations.length??0);
  const partList:PartInfo[]=[];group.traverse(o=>{if(o.userData.part)partList.push(o.userData.part as PartInfo);});setParts(partList);setFasteners(partList.filter(p=>p.diameter).length);setWeldCount(partList.filter(p=>p.weld).length);
  const weldMeshes:THREE.Object3D[]=[];group.traverse(o=>{if(o.userData.part?.weld)weldMeshes.push(o);});
  const fastenerMeshes:THREE.Object3D[]=[],holeRims:THREE.LineSegments[]=[],holeMaterial=new THREE.LineBasicMaterial({color:0x287bb6});let totalHoles=0;
  const drilledMeshes:THREE.Mesh[]=[];group.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.userData.part?.diameter)fastenerMeshes.push(mesh);if(mesh.geometry?.userData.plateHoles?.length)drilledMeshes.push(mesh);});
  for(const mesh of drilledMeshes){const plateHoles=mesh.geometry.userData.plateHoles as Hole[];totalHoles+=plateHoles.length;const rim=new THREE.LineSegments(holeRimGeometry(plateHoles,mesh.geometry.userData.plateThickness),holeMaterial);rim.visible=false;rim.name='bolt-hole-rims';mesh.add(rim);holeRims.push(rim);}setHoleCount(totalHoles);
  const ghostMaterials=new Map<THREE.Material,THREE.Material>(),obstructions:{mesh:THREE.Mesh;original:THREE.Material|THREE.Material[]}[]=[];
  group.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.isMesh&&!mesh.userData.part?.diameter&&!mesh.geometry.userData.plateHoles?.length)obstructions.push({mesh,original:mesh.material});});
  const ghost=(original:THREE.Material)=>{let material=ghostMaterials.get(original);if(!material){material=original.clone();material.transparent=true;material.opacity=.12;material.depthWrite=false;ghostMaterials.set(original,material);}return material;};
  const grid=new THREE.GridHelper(Math.max(length,whole?bayWidth+2:0,4)*1.4,32,0xaebbd2,0xcbd3e1);grid.position.set(0,floor-.02,whole?-bayWidth/2:0);scene.add(grid);
  const lineMaterial=new THREE.LineBasicMaterial({color:0x7685a1});
  const line=(points:THREE.Vector3[])=>group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),lineMaterial));
  const text=(label:string,x:number,y:number,z:number)=>{
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
   const ctx=canvas.getContext('2d');if(!ctx)return;ctx.clearRect(0,0,512,96);ctx.font='500 38px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#4b5d7b';ctx.fillText(label,256,48);
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.position.set(x,y,z);const size=Math.max(.65,Math.min(length*.18,2.2));sprite.scale.set(size,size*96/512,1);group.add(sprite);
  };
  position=-length/2;
  input.spans.forEach((span,i)=>{const end=position+span/1000,z=bf/2+.48,y=-d/2-.24;line([new THREE.Vector3(position,y,z),new THREE.Vector3(end,y,z)]);for(const x of [position,end])line([new THREE.Vector3(x,y-.035,z),new THREE.Vector3(x,y+.035,z)]);text(`${input.system==='continuous'?'Bay':'Span'} ${i+1} · ${format(span,'length',input.units)}`,position+span/2000,y-.12,z);position=end;});
  if(reference&&framing.labels){
   const x=supports[0],z=reference.columnOffset+.45;
   text(`${framing.frameStyle==='tapered'?'Tapered I':framing.column} column`,x+.65,(reference.columnTop+reference.columnBottom)/2,z);
   line([new THREE.Vector3(x,(reference.columnTop+reference.columnBottom)/2,reference.columnOffset),new THREE.Vector3(x+.65,(reference.columnTop+reference.columnBottom)/2,z)]);
   text(usesExistingBracket(input)?'Existing bracket / new seat':input.details?.bracket?.enabled?'Designed welded bracket':`${framing.crosshead} column bracket`,x+.7,reference.beamTop-.08,z+.1);
   line([new THREE.Vector3(x,reference.beamTop-.08,reference.bracketEnd),new THREE.Vector3(x+.7,reference.beamTop-.08,z+.1)]);
  }
  if(structure&&framing.labels){
   text(framing.frameStyle==='tapered'?'Tapered moment frame':`${structure.roofShape} roof beams`,supports[0],structure.roofTop+.25,-bayWidth/2);
   text(`Reference bay · ${format(bayWidth*1000,'length',input.units)}`,0,floor-.1,-bayWidth/2);
  }
  // Keep the analytical load overlay outside model geometry and the opposite
  // reference runway. It must never participate in selection or clash scans.
  const loadOverlay=buildLoadArrows(loads);scene.add(loadOverlay.group);
  let currentLoadView=loadView,showLoadValues=loadValues;loadOverlay.setView(loadView);
  const labelLayer=document.createElement('div');labelLayer.className='viewer-load-label-layer';labelLayer.setAttribute('aria-hidden','true');container.appendChild(labelLayer);
  const loadLabels=loads.map(load=>{const element=document.createElement('span');element.className='viewer-load-label';element.textContent=load.label;element.style.color=loadColors[load.kind];labelLayer.appendChild(element);return {load,element};});
  const updateLoadLabels=()=>{
   const width=container.clientWidth,height=container.clientHeight,placed:{x:number;y:number;w:number;h:number}[]=[];
   for(const {load,element} of loadLabels){
    element.style.display='none';
    if(!showLoadValues||load.mode!==currentLoadView)continue;
    const attachment=new THREE.Vector3(...load.attachment);
    if(renderer.clippingPlanes.some(plane=>plane.distanceToPoint(attachment)<0))continue;
    const pt=new THREE.Vector3(...load.anchor).project(camera);
    if(pt.z< -1||pt.z>1||Math.abs(pt.x)>1||Math.abs(pt.y)>1)continue;
    element.style.display='block';const w=element.offsetWidth,h=element.offsetHeight,x=(pt.x+1)*width/2-w/2,base=(1-pt.y)*height/2-h-7;
    let position:{x:number;y:number;w:number;h:number}|undefined;
    for(const offset of [0,-h-4,h+12]){
     const rect={x,y:base+offset,w,h};
     if(x<6||x+w>width-6||rect.y<6||rect.y+h>height-30)continue;
     if(placed.every(r=>rect.x+rect.w+4<r.x||r.x+r.w+4<rect.x||rect.y+rect.h+3<r.y||r.y+r.h+3<rect.y)){position=rect;break;}
    }
    if(!position){element.style.display='none';continue;}
    element.style.left=`${position.x}px`;element.style.top=`${position.y}px`;placed.push(position);
   }
  };
  const draw=()=>{renderer.render(scene,camera);updateLoadLabels();};
  const bounds=new THREE.Box3().setFromObject(group).union(new THREE.Box3().setFromObject(loadOverlay.group));
  const focusBounds=new Map<string,THREE.Box3>();
  if(reference)supports.forEach((x,i)=>{
   focusBounds.set(`seat-${i}`,new THREE.Box3(new THREE.Vector3(x-.5,reference.beamBottom-.53,reference.bracketStart-.07),new THREE.Vector3(x+.5,railBase+railH+.05,reference.columnOffset+.12)));
   focusBounds.set(`base-${i}`,new THREE.Box3(new THREE.Vector3(x-.45,floor-.02,reference.columnOffset-.45),new THREE.Vector3(x+.45,reference.columnBottom+.35,reference.columnOffset+.45)));
  });
  if(runwayDetails?.clipLocations.length){const x=runwayDetails.clipLocations[Math.floor(runwayDetails.clipLocations.length/2)];focusBounds.set('rail',new THREE.Box3(new THREE.Vector3(x-.22,railBase-.12,railZ-.19),new THREE.Vector3(x+.22,railBase+railH+.1,railZ+.19)));}
  if(whole)for(const [id,bounds] of [...focusBounds])focusBounds.set(`far-${id}`,new THREE.Box3(new THREE.Vector3(bounds.min.x,bounds.min.y,-bounds.max.z-bayWidth),new THREE.Vector3(bounds.max.x,bounds.max.y,-bounds.min.z-bayWidth)));
  if(structure&&reference&&framing.frameStyle==='tapered')supports.forEach((x,i)=>{
   for(const [side,z] of [reference.columnFace,-bayWidth-reference.columnFace].entries())focusBounds.set(`knee-${side}-${i}`,new THREE.Box3(new THREE.Vector3(x-.3,reference.columnTop-.95,z-.48),new THREE.Vector3(x+.3,reference.columnTop+.2,z+.48)));
   const ridgeY=reference.columnTop+(bayWidth/2+reference.columnFace-.0254)*framing.roofSlope/12;
   focusBounds.set(`ridge-${i}`,new THREE.Box3(new THREE.Vector3(x-.3,ridgeY-.48,-bayWidth/2-.45),new THREE.Vector3(x+.3,ridgeY+.28,-bayWidth/2+.45)));
  });
  let currentFocus=focusBounds.has(focus)?focus:'';
  if(currentFocus!==focus)setFocus('');
  let currentPreset=view;
  const setCamera=(preset:View,partBounds?:THREE.Box3,partDirection?:THREE.Vector3)=>{
   currentPreset=preset;
   const closeup=focusBounds.get(currentFocus),frame=partBounds??closeup??bounds,center=frame.getCenter(new THREE.Vector3());controls.target.copy(center);
   controls.minDistance=partBounds ? .03 : Math.max(.12,d*.5);
   renderer.clippingPlanes=closeup?[
    new THREE.Plane(new THREE.Vector3(1,0,0),-closeup.min.x),new THREE.Plane(new THREE.Vector3(-1,0,0),closeup.max.x),
    new THREE.Plane(new THREE.Vector3(0,1,0),-closeup.min.y),new THREE.Plane(new THREE.Vector3(0,-1,0),closeup.max.y),
    new THREE.Plane(new THREE.Vector3(0,0,1),-closeup.min.z),new THREE.Plane(new THREE.Vector3(0,0,-1),closeup.max.z)
   ]:[];
   const seatFocus=/seat-(\d+)$/.exec(currentFocus);
   const kneeFocus=/^knee-(\d+)-(\d+)$/.exec(currentFocus);
   const iso=kneeFocus?new THREE.Vector3(Number(kneeFocus[2])===0?-.3:.3,.3,kneeFocus[1]==='0'?-1:1).normalize():seatFocus?new THREE.Vector3(Number(seatFocus[1])===0?-1:1,.65,currentFocus.startsWith('far-')?1:-1).normalize():new THREE.Vector3(1,.65,1).normalize();
   const direction=partDirection??(preset==='End'?new THREE.Vector3(-1,0,.0001).normalize():preset==='Front'?new THREE.Vector3(0,0,kneeFocus?.[1]==='0'?-1:1):preset==='Top'?new THREE.Vector3(0,1,.0001).normalize():iso);
   frameModelCamera(camera,frame,direction,viewAspect);controls.update();draw();
  };
  let clashBox:THREE.Box3Helper|null=null;
  let selectionBox:THREE.Box3Helper|null=null,selectedObject:THREE.Object3D|undefined;
  const clearSelection=()=>{setSelectedClash(null);if(clashBox){scene.remove(clashBox);clashBox.geometry.dispose();(clashBox.material as THREE.Material).dispose();clashBox=null;}if(selectionBox){scene.remove(selectionBox);selectionBox.geometry.dispose();(selectionBox.material as THREE.Material).dispose();selectionBox=null;}selectedObject=undefined;setSelected(null);draw();};
  const partBounds=(object:THREE.Object3D)=>{const region=new THREE.Box3().setFromObject(object),part=object.userData.part as PartInfo;if(part.family==='Base anchor rod')region.min.y=object.getWorldPosition(new THREE.Vector3()).y+(part.grip??0)-.005;return region;};
  const selectPart=(object?:THREE.Object3D)=>{clearSelection();if(object?.userData.part){selectedObject=object;setSelected(object.userData.part as PartInfo);selectionBox=new THREE.Box3Helper(partBounds(object),modelPalette.selection);(selectionBox.material as THREE.LineBasicMaterial).depthTest=false;selectionBox.renderOrder=10;scene.add(selectionBox);draw();}};
  const zoomPart=()=>{
   if(!selectedObject)return;const part=selectedObject.userData.part as PartInfo,region=partBounds(selectedObject).expandByScalar(.025);
   const position=selectedObject.getWorldPosition(new THREE.Vector3()),supportId=/^S(\d+)-/.exec(part.id),supportX=part.support?.x??(supportId?supports[Number(supportId[1])-1]:position.x-.1);
   const dx=position.x-supportX,z=position.z-(part.support?.z??(supportId?0:railZ));
   const direction=new THREE.Vector3(Math.sign(dx)||1,.8,part.family==='Wheel hub bolt'?1:Math.sign(z)||1).normalize();
   setView('Isometric');setCamera('Isometric',region,direction);
  };
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let pointerStart={x:0,y:0};
  const down=(e:PointerEvent)=>{pointerStart={x:e.clientX,y:e.clientY};};
  const pick=(e:PointerEvent)=>{
   if(Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>5)return;
   const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
   const meshes:THREE.Object3D[]=[];group.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.isMesh&&o.visible){const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];if(!mats.every(m=>m.transparent&&m.opacity<=.15))meshes.push(o);}});
   const region=focusBounds.get(currentFocus),hit=raycaster.intersectObjects(meshes,false).find(h=>!region||region.containsPoint(h.point));selectPart(hit?.object);
  };
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',pick);
  const showHoles=(enabled:boolean)=>{clearSelection();fastenerMeshes.forEach(mesh=>{mesh.visible=!enabled;});holeRims.forEach(rim=>{rim.visible=enabled;});obstructions.forEach(({mesh,original})=>{mesh.material=enabled?(Array.isArray(original)?original.map(ghost):ghost(original)):original;});draw();};
  api.current={loads:(mode,values)=>{currentLoadView=mode;showLoadValues=values;loadOverlay.setView(mode);draw();},welds:enabled=>{weldMeshes.forEach(m=>m.visible=enabled);draw();},auditModel:()=>hardwareAuditModel(group),clash:item=>{clearSelection();currentFocus='';setFocus('');const found=partList.find(p=>p.id===item.a);let object:THREE.Object3D|undefined;group.traverse(o=>{if(o.userData.part?.id===found?.id)object=o;});selectPart(object);setSelectedClash(item);const pt=new THREE.Vector3(...item.point),region=new THREE.Box3().setFromCenterAndSize(pt,new THREE.Vector3(.32,.32,.32));clashBox=new THREE.Box3Helper(new THREE.Box3().setFromCenterAndSize(pt,new THREE.Vector3(.04,.04,.04)),0xc83525);(clashBox.material as THREE.LineBasicMaterial).depthTest=false;clashBox.renderOrder=11;scene.add(clashBox);setView('Isometric');setCamera('Isometric',region,new THREE.Vector3(1,.4,-1).normalize());},setView:setCamera,holes:showHoles,focus:id=>{currentFocus=focusBounds.has(id)?id:'';clearSelection();setCamera(currentPreset);},clearSelection,inspectPart:id=>{let found:THREE.Object3D|undefined;group.traverse(o=>{if(o.userData.part?.id===id&&o.visible)found=o;});selectPart(found);},zoomPart,zoom:factor=>{if(camera instanceof THREE.OrthographicCamera){camera.zoom=Math.min(500,Math.max(.05,camera.zoom/factor));camera.updateProjectionMatrix();}else camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);controls.update();draw();},wireframe:enabled=>{surfaceMaterials.forEach(m=>{m.visible=!enabled;});ghostMaterials.forEach((m,original)=>{m.visible=!enabled||!surfaceMaterials.has(original);});draw();}};
  let lastWidth=0,lastHeight=0;
  const resize=()=>{const w=container.clientWidth,h=container.clientHeight;if(!w||!h||w===lastWidth&&h===lastHeight)return;lastWidth=w;lastHeight=h;renderer.setSize(w,h);viewAspect=w/h;setCamera(currentPreset);};
  const observer=new ResizeObserver(resize);observer.observe(container);
  controls.addEventListener('change',draw);
  const lost=(e:Event)=>{e.preventDefault();setError('The 3D graphics context was lost. Reopen the viewer to restore it.');};renderer.domElement.addEventListener('webglcontextlost',lost);
  resize();setCamera(view);api.current.wireframe(wire);api.current.welds(welds);showHoles(holes&&detailed);
  return ()=>{auditWorker.current?.terminate();auditWorker.current=null;observer.disconnect();controls.removeEventListener('change',draw);controls.dispose();renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',pick);api.current=null;
   const geometries=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
   scene.traverse(object=>{const mesh=object as THREE.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);if(mesh.material)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){mats.add(material);const map=(material as THREE.MeshBasicMaterial).map;if(map)textures.add(map);}});
   geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>{if(!mats.has(m))m.dispose();});ghostMaterials.forEach(m=>{if(!mats.has(m))m.dispose();});if(!mats.has(framingEdges))framingEdges.dispose();if(!mats.has(holeMaterial))holeMaterial.dispose();lineMaterial.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();labelLayer.remove();};
  // Camera controls are applied separately without rebuilding model geometry.
 },[input,snapshot,governing,invalid,framing,detailed,projection]);
 const chooseView=(v:View)=>{setView(v);api.current?.setView(v);};
 const inspect=(id:string)=>{setFocus(id);api.current?.focus(id);};
 const reset=()=>{inspect('');chooseView('Isometric');};
 const showHardware=()=>{const part=selected?.diameter?selected:nearbyParts.find(p=>p.diameter&&!p.anchor)??nearbyParts.find(p=>p.diameter)??parts.find(p=>p.diameter&&!p.anchor);if(part)setDetailPart(part);};
 const showWhole=()=>{setFraming(p=>({...p,shown:true,full:true}));reset();};
 const nearbyParts=parts.filter(p=>{
  if(focus.startsWith('knee-')){const [,side,station]=focus.split('-');return p.id.startsWith(`B${Number(side)+1}-S${Number(station)+1}-`)&&!p.id.includes('ridge')&&(p.family.includes('knee')||p.family.includes('stiffener'));}
  if(focus.startsWith('ridge-'))return p.id.startsWith(`B-S${Number(focus.split('-')[1])+1}-`);
  const far=focus.startsWith('far-'),localFocus=far?focus.slice(4):focus;
  if(far!==p.id.startsWith('F-')||p.id.startsWith('B'))return false;
  const id=far?p.id.slice(2):p.id;
  if(localFocus==='rail'){const station=Math.floor(clipCount/2)+1;return id.startsWith(`RC-${station}-`)||id.startsWith(`rail-clip-${station}-`)||id.startsWith(`rail-keeper-weld-${station}-`);}
  if(!focus)return false;
  const station=Number(localFocus.split('-')[1])+1,support=`S${station}`,bayEnd=/^bay-(\d+)-(left|right)-/.exec(id);
  const atSupport=id.startsWith(`${support}-`)||id.includes(`-${support}-`)||id.endsWith(`-${support}`)||!!(bayEnd&&Number(bayEnd[1])+(bayEnd[2]==='right'?1:0)===station);
  const base=p.family==='Base anchor rod'||p.family==='Column base plate';return atSupport&&(localFocus.startsWith('base')?base:!base);
 });
 const visibleParts=nearbyParts.filter(p=>(!holes||!p.diameter)&&(welds||!p.weld));
 return <div className={`viewer cad-viewer ${expanded?'expanded':''}`}>
  <div className="viewer-toolbar"><div className="view-presets" aria-label="Camera views">{(['Isometric','Front','End','Top'] as const).map(v=><button key={v} className={view===v?'selected':''} aria-pressed={view===v} onClick={()=>chooseView(v)}>{v==='Isometric'?<Box size={12}/>:null}{v}</button>)}</div><label className="viewer-projection"><span>Projection</span><select aria-label="3D projection" value={projection} onChange={e=>setProjection(e.target.value as Projection)}><option value="orthographic">Orthographic</option><option value="perspective">Perspective</option></select></label><div className="viewer-actions"><button aria-label="Zoom in" title="Zoom in" onClick={()=>api.current?.zoom(.8)}><ZoomIn size={14}/></button><button aria-label="Zoom out" title="Zoom out" onClick={()=>api.current?.zoom(1.25)}><ZoomOut size={14}/></button><button aria-label="Reset 3D view" title="Reset view" onClick={reset}><RotateCcw size={13}/></button></div></div>
  <div className="viewer-canvas" ref={host} data-projection={projection} data-render-style="class-colored" data-load-view={loadView} data-load-count={visibleLoads.length} data-load-values={loadValues} data-model-length={input.spans.reduce((a,b)=>a+b,0)} data-bay-count={input.spans.length} data-member-system={input.system} data-girder-members={input.system==='continuous'?1:input.spans.length} data-moment-frames={whole&&framing.frameStyle==='tapered'?input.spans.length+1:0} data-model-depth={input.section.d} data-wheel-count={wheelCount} data-camera-view={view} data-reference-supports={framing.shown?input.spans.length+1:0} data-reference-column={framing.column} data-reference-crosshead={framing.crosshead} data-designed-bracket={!!input.details?.bracket?.enabled&&bracketArrangement(input.details.bracket)==='twin-rib'} data-bracket-arrangement={bracketArrangement(input.details?.bracket)} data-tie-arrangement={tieArrangement(input.details)} data-runway-support-type={framing.shown?'column-brackets':'schematic'} data-reference-height={framing.height} data-detail-level={detailed?'bolts':'members'} data-fastener-count={fasteners} data-inspection-focus={focus} data-reference-runways={whole?2:1} data-building-columns={buildingColumns} data-frame-style={framing.frameStyle} data-roof-slope={framing.roofSlope} data-hole-view={String(holes&&detailed)} data-hole-count={holeCount} data-weld-count={weldCount} data-welds-shown={welds} data-reference-bay-width={whole?bayWidth*1000:0}>{(invalid||error)&&<div className="viewer-empty" role="status">{invalid?'Correct invalid inputs to view the model.':error}</div>}<div className="viewer-axis" aria-hidden="true"><span>X <small>runway</small></span><span>Y <small>vertical</small></span><span>Z <small>lateral</small></span></div>{selected&&<div className="viewer-part" role="status" aria-label="Selected 3D part"><button aria-label="Clear selected part" onClick={()=>api.current?.clearSelection()}>×</button><strong>{selected.family}</strong><small>{selected.id}</small><p>{selected.description}</p>{selectedClash&&<p className="selected-clash"><b>Hardware intersection</b><br/>{selectedClash.b}<br/>{selectedClash.component} · {format(selectedClash.overlapMm,'length',input.units)} probe overlap</p>}{selected.diameter&&<p>Ø {format(selected.diameter*1000,'length',input.units)} · Grip {format((selected.grip??0)*1000,'length',input.units)}</p>}<small>{selected.weld?`${selected.weld.location==='field'?'FIELD WELD TO EXISTING STEEL · ':selected.weld.location==='shop'?'SHOP WELD · ':''}${selected.weld.kind} · ${selected.weld.size?format(selected.weld.size*1000,'length',input.units)+' leg · ':''}${format(selected.weld.length*1000,'length',input.units)} long`:selected.components??'Connection geometry; review scope'}</small><button className="part-zoom" aria-label="Zoom to selected 3D part" onClick={()=>api.current?.zoomPart()}><ZoomIn size={11}/>Zoom to part</button></div>}</div>
  <div className="viewer-model-legend" aria-label="Model component colors">{modelLegend.map(([label,color])=><span key={label}><i style={{background:color}}/>{label}</span>)}<small>Component colors · not check status</small></div>
  <div className="viewer-options"><label>Position case <select aria-label="3D governing load case" value={governing} onChange={e=>setGoverning(e.target.value)}>{Object.entries(caseLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="wireframe-option"><input type="checkbox" checked={detailed} onChange={e=>{setDetailed(e.target.checked);if(!e.target.checked)setHoles(false);}}/>Bolts & connections</label><label className="wireframe-option"><input type="checkbox" aria-label="Show bolt holes" disabled={!detailed} checked={holes&&detailed} onChange={e=>{setHoles(e.target.checked);api.current?.holes(e.target.checked);}}/>Show bolt holes</label><label className="wireframe-option"><input type="checkbox" checked={welds} onChange={e=>{setWelds(e.target.checked);api.current?.welds(e.target.checked);}}/>Welds ({weldCount})</label><label className="wireframe-option"><input type="checkbox" title="Steel outlines with solid hardware" checked={wire} onChange={e=>{setWire(e.target.checked);api.current?.wireframe(e.target.checked);}}/>Wireframe</label><span>{loadCase?.id??'Calculating…'}</span></div>
  <div className="viewer-load-controls">
   <label>Load arrows <select aria-label="3D load arrows" value={loadView} onChange={e=>{const mode=e.target.value as LoadView;setLoadView(mode);api.current?.loads(mode,loadValues);}}><option value="applied">Applied loads</option><option value="reactions">Bearing reactions</option><option value="traction">Longitudinal traction</option><option value="off">Off</option></select></label>
   <label><input type="checkbox" checked={loadValues} disabled={loadView==='off'} onChange={e=>{setLoadValues(e.target.checked);api.current?.loads(loadView,e.target.checked);}}/>Values</label>
   <div className="viewer-load-legend" aria-label="Load arrow legend">{(loadView==='applied'?['vertical','lateral','dead'] as const:loadView==='reactions'?['reaction'] as const:loadView==='traction'?['traction'] as const:[]).map(kind=><span key={kind}><i style={{background:loadColors[kind]}}/>{({vertical:'V · Wheel',lateral:'H · Lateral',dead:'D · Dead',reaction:'R · Vertical',traction:'T · Reversible'})[kind]}</span>)}</div>
   {loadView!=='off'&&<p role="status">{loadCase?`${loadViewNotes[loadView]} Primary runway only. Arrow lengths are schematic.`:'Load arrows appear when the current calculation is available.'}</p>}
   {loadView!=='off'&&loadCase&&<details className="viewer-load-values"><summary>Load values ({visibleLoads.length})</summary><p>Zoom in to separate overlapping labels. Stations are measured from the start of the runway.</p>{visibleLoads.length?<table><thead><tr><th>Load</th><th>Station</th><th>Description</th></tr></thead><tbody>{visibleLoads.map(load=><tr key={load.id}><td style={{color:loadColors[load.kind]}}>{load.label}</td><td>{format(load.x,'length',input.units)}</td><td>{load.description}</td></tr>)}</tbody></table>:<p>No nonzero loads in this view for the selected case.</p>}</details>}
  </div>
  <div className="viewer-inspect"><label>Inspect <select aria-label="Inspect 3D connection" value={focus} onChange={e=>inspect(e.target.value)}><option value="">{whole?'Whole structure':'Whole runway'}</option>{framing.shown&&[false,...(whole?[true]:[])].map(far=>input.spans.map((_,i)=>i).concat(input.spans.length).map(i=><optgroup key={`${far}-${i}`} label={`${far?'Opposite':'Primary'} support ${i+1}`}><option value={`${far?'far-':''}seat-${i}`}>{far?'Far ':''}S{i+1} · Column bracket & girder seat</option><option value={`${far?'far-':''}base-${i}`}>{far?'Far ':''}S{i+1} · Base & anchors</option></optgroup>))}{detailed&&clipCount>0&&<><option value="rail">Rail clip assembly</option>{whole&&<option value="far-rail">Opposite rail clip</option>}</>}{whole&&framing.frameStyle==='tapered'&&input.spans.concat(0).map((_,i)=><optgroup key={`portal-${i}`} label={`Moment frame ${i+1}`}><option value={`knee-0-${i}`}>S{i+1} · Primary frame knee</option><option value={`knee-1-${i}`}>S{i+1} · Opposite frame knee</option><option value={`ridge-${i}`}>S{i+1} · Ridge splice</option></optgroup>)}</select></label>{detailed&&visibleParts.length>0&&<label>Part <select aria-label="Inspect 3D part" value={visibleParts.some(p=>p.id===selected?.id)?selected!.id:''} onChange={e=>api.current?.inspectPart(e.target.value)}><option value="">Choose a part…</option>{visibleParts.map(p=><option key={p.id} value={p.id}>{p.family} · {p.id}</option>)}</select></label>}<button className="whole-structure fastener-open" disabled={!detailed||!fasteners} onClick={showHardware}>Fastener detail</button><button className="whole-structure" onClick={showWhole}><Box size={11}/>Whole structure</button><span>{focus?'Cutaway close-up · ':''}{detailed?holes?`${holeCount} plate holes · Fasteners hidden · Other members faded`:`${fasteners} fasteners · Click a part to inspect`:'Member view'}</span></div>
  <details className="viewer-review" open={!!audit?.issues.length}><summary>Hardware clash check <span>{audit?`${audit.issues.length} intersections / ${audit.hardware} fasteners`:'Not scanned'}</span></summary>{connectionOptionChecks(input).length>0&&<p className="model-coordination-warning">Selected alternatives require a project connection model. Static bolt checks do not establish structural strength, slot movement, articulated-pin behavior or tool access.</p>}<p>Checks installed bolts, nuts and washers against the modeled solids and welds. Actual holes remain open; touching faces are allowed. Static sampling at {format(.5,'length',input.units,4)} tolerance. Tool access, movement and unmodeled details require separate review.</p><div className="button-row"><button className="outline-button" disabled={!detailed||auditing||invalid||!connectionHardwareAuditSupported(input)} onClick={scan}>{auditing?'Checking…':'Check hardware clashes'}</button>{audit&&<button className="outline-button" onClick={downloadAudit}>Download clash report</button>}</div>{auditError&&<p role="alert">{auditError}</p>}{audit&&<><p>{audit.excludedHardware.length} schematic wheel-hub fasteners excluded; see report for scope.</p><p role="status">{audit.issues.length?`${audit.issues.length} intersecting part pairs found. Repeated connections and the opposite runway are counted separately.`:'No intersections detected by this static sample scan. This is not fabrication or access clearance approval.'}</p><div className="clash-list">{audit.issues.slice(0,50).map((v,i)=><button key={`${v.a}-${v.b}`} onClick={()=>{setHoles(false);api.current?.holes(false);api.current?.clash(v);}}><strong>{i+1}. {v.a}</strong><span>Intersects {v.b} · {v.component} · {format(v.overlapMm,'length',input.units,4)} probe overlap</span></button>)}</div>{audit.issues.length>50&&<p>Showing 50 of {audit.issues.length}. Download the report for every pair and the scan limitations.</p>}</>}</details>
  <ConnectionReview input={input}/>
  <details className="viewer-framing"><summary>Reference structure <span>{whole?'Complete crane bay · ':''}{framing.frameStyle==='tapered'?'Tapered moment frames':`${framing.column} columns`}</span></summary><div className="framing-controls"><label className="framing-check"><input type="checkbox" checked={framing.shown} onChange={e=>setFraming(p=>({...p,shown:e.target.checked}))}/>Reference framing</label><label className="framing-check"><input type="checkbox" checked={framing.full!==false} disabled={!framing.shown} onChange={e=>setFraming(p=>({...p,full:e.target.checked}))}/>Whole structure</label><label className="framing-check"><input type="checkbox" checked={framing.labels} disabled={!framing.shown} onChange={e=>setFraming(p=>({...p,labels:e.target.checked}))}/>Shape labels</label><label>Frame type<select aria-label="Reference frame type" value={framing.frameStyle} disabled={!framing.shown} onChange={e=>setFraming(p=>({...p,frameStyle:e.target.value as FrameStyle}))}><option value="tapered">Prefab · Tapered moment frame</option><option value="rolled">Rolled AISC reference frame</option></select></label>{framing.frameStyle==='rolled'&&<label>Column shape<select aria-label="Reference column shape" value={framing.column} disabled={!framing.shown} onChange={e=>setFraming(p=>({...p,column:e.target.value}))}>{referenceColumns.map(s=><option key={s.name}>{s.name}</option>)}</select></label>}<label>Bracket shape<select aria-label="Reference bracket shape" value={framing.crosshead} disabled={!framing.shown||input.details?.bracket?.enabled} onChange={e=>setFraming(p=>({...p,crosshead:e.target.value}))}>{referenceCrossheads.map(s=><option key={s.name}>{s.name}</option>)}</select></label><label>Height below bracket<select aria-label="Reference column height" value={framing.height} disabled={!framing.shown} onChange={e=>setFraming(p=>({...p,height:Number(e.target.value)}))}>{[3048,4572,6096].map(h=><option key={h} value={h}>{input.units==='US'?`${h/304.8} ft`:format(h,'length','SI')}</option>)}</select></label><label>Bay width<select aria-label="Reference bay width" value={framing.width??defaultFraming.width} disabled={!whole} onChange={e=>setFraming(p=>({...p,width:Number(e.target.value)}))}>{[6096,9144,12192].map(w=><option key={w} value={w}>{input.units==='US'?`${w/304.8} ft`:format(w,'length','SI')}</option>)}</select></label><label>Roof clearance<select aria-label="Reference roof clearance" value={framing.roofClearance??defaultFraming.roofClearance} disabled={!whole} onChange={e=>setFraming(p=>({...p,roofClearance:Number(e.target.value)}))}>{[1828.8,2438.4,3048].map(h=><option key={h} value={h}>{input.units==='US'?`${h/304.8} ft`:format(h,'length','SI')}</option>)}</select></label>{framing.frameStyle==='tapered'&&<label>Roof pitch<select aria-label="Reference roof pitch" value={framing.roofSlope} disabled={!whole} onChange={e=>setFraming(p=>({...p,roofSlope:Number(e.target.value)}))}>{[2,3,4].map(slope=><option key={slope} value={slope}>{slope}:12</option>)}</select></label>}</div><p>{framing.frameStyle==='tapered'?<>Tapered fabricated I-columns and haunched rafters, bolted knee/ridge joints, lipped Z purlins and C girts. Arrangement reference: <a href="https://www.mbmaeducation.org/wp-content/uploads/2023/06/MBMA_Student-Design-Competition_Quickstart_Guide.pdf" target="_blank" rel="noreferrer">MBMA metal building guide</a>. Dimensions are illustrative. </>:<>Rolled roof beams W16X50, purlins W10X33. </>}Rolled bracket / column geometry from <a href={aiscShapeSource} target="_blank" rel="noreferrer">AISC Shapes Database v16.0</a>; column shape applies to the rolled frame option. When enabled, the primary bracket and local receiver geometry use the project inputs; reference bracket selection is disabled. Runway girders bear on brackets attached to the continuous building columns. The primary runway uses project geometry. Opposite runway, building and crane are context only. Specified runway welds are shown; undefined tie-root and building fabrication welds require project details.</p></details>
  {detailPart&&<FastenerDetail part={detailPart} units={input.units} onClose={()=>setDetailPart(null)}/>}<div className="viewer-caption"><span>Drag to orbit · Scroll to zoom · Shift + drag to pan</span><span>{usesExistingBracket(input)?'Existing bracket geometry requires survey and a documented support assessment. New seat and selected ties have separate checks.':input.details?.bracket?.enabled?'Welded brackets use calculation inputs. Whole-building and separate guide/tie attachments require project design.':whole?'Complete reference structure; building and connection adequacy not evaluated.':detailed?'Hardware, holes & welds are illustrative; connection adequacy not evaluated.':framing.shown?'AISC reference framing; member and connection adequacy not evaluated.':'Idealized girder to scale; rail, wheels & supports are schematic.'}</span></div>
 </div>;
}

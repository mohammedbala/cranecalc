import {modelMaterial,addModelLighting} from './viewerAppearance';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RotateCcw, X } from 'lucide-react';
import { buildFastenerPieces,fastenerColors,fastenerLabels,type FastenerComponent } from './fastenerGeometry';
import type { PartInfo } from './connectionDetails';
import { format } from '../engine/units';

interface Props { part:PartInfo; units:'US'|'SI'; onClose:()=>void }
export default function FastenerDetail({part,units,onClose}:Props){
 const root=useRef<HTMLElement>(null),host=useRef<HTMLDivElement>(null),close=useRef(onClose);
 close.current=onClose;
 const [exploded,setExploded]=useState(true),[view,setView]=useState('Isometric'),[error,setError]=useState('');
 const api=useRef<{explode:(value:boolean)=>void;view:(value:string)=>void}|null>(null);
 const diameter=part.diameter??.01905,grip=part.grip??.0254,anchor=!!part.anchor;
 const componentKinds:FastenerComponent[]=anchor?['shaft','thread','head-washer','nut']:['head','head-washer','shaft','nut-washer','nut','thread'];
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,oldOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';root.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();close.current();}
   if(e.key==='Tab'){
    const buttons=[...(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[])],first=buttons[0],last=buttons.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }
  };
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=oldOverflow;if(previous?.isConnected)previous.focus();};
 },[]);
 useEffect(()=>{
  const container=host.current;if(!container)return;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});}catch{setError('3D hardware detail is unavailable in this browser.');return;}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));container.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','Interactive fastener assembly');
  renderer.clippingPlanes=anchor?[new THREE.Plane(new THREE.Vector3(0,1,0),diameter*.5)]:[];
  const scene=new THREE.Scene(),group=new THREE.Group();scene.add(group);
  addModelLighting(scene);
  const material=modelMaterial(0xffffff,{vertexColors:true});
  const pieces=buildFastenerPieces(diameter,grip,anchor),meshes=pieces.map(piece=>{
   const mesh=new THREE.Mesh(piece.geometry,material);mesh.name=piece.kind;group.add(mesh);return{kind:piece.kind,mesh};
  });
  const guideMaterial=new THREE.LineDashedMaterial({color:0x9aaab5,dashSize:diameter*.2,gapSize:diameter*.12});
  const guide=new THREE.Line(new THREE.BufferGeometry(),guideMaterial);group.add(guide);
  const assemblyBounds=()=>{const box=new THREE.Box3();for(const {mesh} of meshes)box.expandByObject(mesh);return box;};
  const camera=new THREE.PerspectiveCamera(35,1,.0001,10),controls=new OrbitControls(camera,renderer.domElement);controls.enablePan=false;controls.minDistance=diameter;controls.maxDistance=2;controls.zoomToCursor=true;
  let currentView=view,isExploded=exploded;
  const draw=()=>renderer.render(scene,camera);
  const fit=()=>{
   const bounds=assemblyBounds();if(anchor)bounds.min.y=Math.max(bounds.min.y,-diameter*.5);
   const center=bounds.getCenter(new THREE.Vector3()),direction=currentView==='Head'?new THREE.Vector3(.0001,1,.0001).normalize():currentView==='Nut & threads'?new THREE.Vector3(.8,-.5,1).normalize():currentView==='Side'?new THREE.Vector3(0,0,1):new THREE.Vector3(1,.4,1).normalize();
   controls.target.copy(center);camera.position.copy(center).add(direction);camera.lookAt(center);
   const inverse=camera.quaternion.clone().invert(),tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));let distance=0;
   for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const point=new THREE.Vector3(x,y,z).sub(center).applyQuaternion(inverse);distance=Math.max(distance,Math.abs(point.x)/(tangent*camera.aspect)+point.z,Math.abs(point.y)/tangent+point.z);
   }
   camera.position.copy(center).addScaledVector(direction,Math.max(diameter,distance)*1.2);controls.update();draw();
  };
  const explode=(value:boolean)=>{
   isExploded=value;
   for(const {kind,mesh} of meshes){
    const offset=anchor?(kind==='nut'?2:kind==='head-washer'?.8:0):(kind==='head'?2:kind==='head-washer'?.8:kind==='nut'?-2:kind==='nut-washer'?-.8:0);
    mesh.position.y=value?diameter*offset:0;
   }
   guide.visible=value;
   const bounds=assemblyBounds();if(anchor)bounds.min.y=Math.max(bounds.min.y,-diameter*.5);
   guide.geometry.dispose();guide.geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,bounds.min.y,0),new THREE.Vector3(0,bounds.max.y,0)]);guide.computeLineDistances();fit();
  };
  api.current={explode,view:value=>{currentView=value;fit();}};
  let lastWidth=0,lastHeight=0;
  const resize=()=>{const w=container.clientWidth,h=container.clientHeight;if(!w||!h||w===lastWidth&&h===lastHeight)return;lastWidth=w;lastHeight=h;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();fit();};
  const observer=new ResizeObserver(resize);observer.observe(container);controls.addEventListener('change',draw);resize();explode(isExploded);
  return()=>{observer.disconnect();controls.removeEventListener('change',draw);controls.dispose();pieces.forEach(p=>p.geometry.dispose());guide.geometry.dispose();guideMaterial.dispose();material.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();api.current=null;};
 },[diameter,grip,anchor]);
 return <div className="fastener-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <section ref={root} className="fastener-dialog" role="dialog" aria-modal="true" aria-label="Fastener detail">
   <header><div><small>{part.family} · {part.id}</small><h2>{anchor?'Anchor rod detail':'Bolt assembly detail'}</h2></div><button aria-label="Close fastener detail" onClick={onClose}><X size={18}/></button></header>
   <div className="fastener-controls"><div className="fastener-modes">{[false,true].map(value=><button key={String(value)} aria-pressed={exploded===value} className={exploded===value?'selected':''} onClick={()=>{setExploded(value);api.current?.explode(value);}}>{value?'Exploded':'Assembled'}</button>)}</div><div className="fastener-views">{['Isometric',...(anchor?[]:['Head']),'Side','Nut & threads'].map(value=><button key={value} aria-pressed={view===value} className={view===value?'selected':''} onClick={()=>{setView(value);api.current?.view(value);}}>{value}</button>)}<button aria-label="Reset fastener view" onClick={()=>{setView('Isometric');api.current?.view('Isometric');}}><RotateCcw size={13}/></button></div></div>
   <div className="fastener-canvas" ref={host} data-fastener-id={part.id} data-fastener-anchor={String(anchor)} data-assembly-mode={exploded?'exploded':'assembled'} data-thread-kind="helical">{error&&<p role="status">{error}</p>}<span>Drag to orbit · Scroll to zoom</span></div>
   <div className="fastener-legend" aria-label="Fastener components">{componentKinds.map(kind=><span key={kind}><i style={{background:fastenerColors[kind]}}/>{anchor&&kind==='shaft'?'Anchor rod':anchor&&kind==='head-washer'?'Washer':fastenerLabels[kind]}</span>)}</div>
   <footer><strong>Ø {format(diameter*1000,'length',units)} · Grip {format(grip*1000,'length',units)}</strong><span>Illustrative hardware · Colors identify parts{anchor?' · Embedded rod cut away':''}</span></footer>
  </section>
 </div>;
}

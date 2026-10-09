import {existingBracketLabel} from '../engine/bracketProfiles';
import * as THREE from 'three';
import type {CalculationSnapshot} from '../engine/types';
import {existingBracket,existingBoltPositions,usesExistingBracket} from '../engine/existingBracket';
import {simpleSupportInput} from '../engine/simpleSupports';
import {buildExistingBrackets} from './existingBracketGeometry';
import {projection,dispose} from './connectionConceptSheet';
import {drawingLength,plateInches} from './drawingFormat';
import {sheetStart,titleBlock,text,line,viewTitle,multiLeader,dimH,dimV,wrappedText,circle} from './sheetGraphics';
import {format} from '../engine/units';

export function existingBracketSheetSvg(s:CalculationSnapshot){
 const p=s.input;if(!usesExistingBracket(p))return '';
 const d=p.details!,b=d.bracket!,e=existingBracket(p),mm=.001;
 const material=new THREE.MeshBasicMaterial(),edge=new THREE.LineBasicMaterial(),group=buildExistingBrackets(b,[0],0,material,edge);
 const box=(id:string,l:number,h:number,w:number,x:number,y:number,z:number,existing=false)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(l*mm,h*mm,w*mm),material);mesh.name=id;mesh.userData.existingSteel=existing;mesh.position.set(x*mm,y*mm,z*mm);group.add(mesh);};
 const upper=p.section.d+d.bearing.thickness+100,lower=-b.seatThickness-e.depth-100,c=b.receiver;
 for(const z of [b.reach+c.flangeThickness/2,b.reach+c.depth-c.flangeThickness/2])box('existing-column-flange',c.width,upper-lower,c.flangeThickness,0,(upper+lower)/2,z,true);
 box('existing-column-web',c.webThickness,upper-lower,c.depth-2*c.flangeThickness,0,(upper+lower)/2,b.reach+c.depth/2,true);
 const gap=simpleSupportInput(p).endGap,len=d.bearing.length;
 const ends=p.system==='simple'?[-1,1].map(sign=>({a:sign<0?-b.seatLength/2:gap/2,z:sign<0?-gap/2:b.seatLength/2,center:sign*(gap+len)/2})):[{a:-b.seatLength/2,z:b.seatLength/2,center:0}];
 for(const [i,v] of ends.entries()){
  box('new-bearing-'+i,len,d.bearing.thickness,d.bearing.width,v.center,d.bearing.thickness/2,0);
  for(const y of [d.bearing.thickness+p.section.tf/2,d.bearing.thickness+p.section.d-p.section.tf/2])box('new-runway-flange-'+i,v.z-v.a,p.section.tf,p.section.bf,(v.a+v.z)/2,y,0);
  box('new-runway-web-'+i,v.z-v.a,p.section.d-2*p.section.tf,p.section.tw,(v.a+v.z)/2,d.bearing.thickness+p.section.d/2,0);
  if(p.section.kind==='cap'){
   const c=p.section,top=d.bearing.thickness+c.d;
   box('new-cap-web-'+i,v.z-v.a,c.capTw,c.capWidth,(v.a+v.z)/2,top+c.capTw/2,0);
   for(const sign of [-1,1])box('new-cap-leg-'+i+'-'+sign,v.z-v.a,c.capDepth-c.capTw,c.capTf,(v.a+v.z)/2,top-(c.capDepth-c.capTw)/2,sign*(c.capWidth-c.capTf)/2);
  }
 }
 const side=projection(group,v=>[v.z,-v.y],{x:65,y:92,w:285,h:217},p.units),front=projection(group,v=>[v.x,-v.y],{x:687,y:92,w:278,h:217},p.units),plan=projection(group,v=>[v.x,v.z],{x:67,y:409,w:282,h:210},p.units);
 const pt=(x:number,y:number,z:number)=>new THREE.Vector3(x*mm,y*mm,z*mm),dim=(n:number)=>drawingLength(n,p.units),size=(n:number)=>plateInches(n,p.units);
 let svg=sheetStart(s,'S-05','RUNWAY ON EXISTING COLUMN BRACKETS');
 svg+=line([612,76],[612,682],'divider')+line([24,375],[1200,375],'divider');
 svg+=`<g data-view="existing-bracket-side">${side.svg}`;
 svg+=multiLeader([side.project(pt(0,d.bearing.thickness+p.section.d/2,0))],[385,100],[p.section.name,'NEW RUNWAY / SEE S-01']);
 svg+=multiLeader([side.project(pt(0,-b.seatThickness/2,b.reach-b.seatProjection/2))],[385,159],[`NEW SPREADER PL ${size(b.seatThickness)}`,'4 RETAINING BOLTS / SEE PLAN']);
 svg+=multiLeader([side.project(pt(0,-b.seatThickness-e.depth/2,b.reach-b.seatProjection/2))],[385,222],[`EXISTING ${existingBracketLabel(b)}`,'VERIFY SECTION AND ROOT WELDS']);
 svg+=multiLeader([side.project(pt(0,-b.seatThickness-e.depth+e.flangeThickness/2,b.reach+c.depth/2))],[385,292],['EXISTING CONTINUITY PLATES','CAPACITY BY RECORDED ASSESSMENT']);
 const cl=side.project(pt(0,0,0)),face=side.project(pt(0,0,b.reach));
 svg+=dimH(cl[0],face[0],cl[1],322,dim(b.reach))+viewTitle(313,348,'BRACKET / TRANSVERSE SECTION',side.label)+'</g>';
 svg+=`<g data-view="existing-bracket-front">${front.svg}`;
 svg+=multiLeader([front.project(pt(0,d.bearing.thickness+p.section.d-p.section.tf/2,0))],[1000,100],[p.system==='simple'?'INDEPENDENT RUNWAY ENDS':'CONTINUOUS RUNWAY',`TIES: ${d.brace.flangeAttachment?.enabled?'S-06':'S-02'}${p.system==='simple'?' / ENDS: S-04':''}`]);
 svg+=multiLeader([front.project(pt(e.width/2,-b.seatThickness-e.depth/2,b.reach-b.seatProjection))],[1000,224],['EXISTING END STIFFENERS','SURVEY DIMENSIONS']);
 const fa=front.project(pt(-b.seatLength/2,0,0)),fz=front.project(pt(b.seatLength/2,0,0));
 svg+=dimH(fa[0],fz[0],fa[1],322,dim(b.seatLength))+viewTitle(907,348,'SUPPORT / LOOKING AT COLUMN',front.label)+'</g>';
 svg+=`<g data-view="existing-bracket-plan">${plan.svg}`;
 const bolts=existingBoltPositions(p).map(h=>plan.project(pt(h.x,0,h.z)));
 bolts.forEach(q=>{svg+=circle(q[0],q[1],2,'annotation')+line([q[0]-4,q[1]],[q[0]+4,q[1]])+line([q[0],q[1]-4],[q[0],q[1]+4]);});
 svg+=multiLeader([bolts[3]],[395,435],[`4 - ${dim(e.bolts.diameter)} DIA. ${e.bolts.grade}`,'NEW PLATE TO EXISTING FLANGE','MATCH VERIFIED HOLE LOCATIONS']);
 svg+=multiLeader([plan.project(pt(e.width/2,0,b.reach-b.seatProjection/2))],[395,534],['EXISTING BRACKET / DASHED','NEW SEAT / SOLID']);
 svg+=dimH(bolts[1][0],bolts[3][0],bolts[1][1],617,dim(e.bolts.pitch));
 svg+=dimV(bolts[0][1],bolts[1][1],bolts[0][0],48,dim(e.bolts.gauge));
 const pe=plan.project(pt(-b.seatLength/2,0,b.reach-b.seatProjection)),be=plan.project(pt(-e.width/2,0,-e.bolts.gauge/2));
 svg+=dimH(be[0],bolts[0][0],bolts[0][1],402,dim((e.width-e.bolts.pitch)/2));
 svg+=dimV(pe[1],bolts[0][1],bolts[0][0],364,dim(b.seatProjection-b.reach-e.bolts.gauge/2));
 svg+=viewTitle(313,655,'BOLTED SPREADER / PLAN',plan.label)+'</g>';
 svg+=text(906,402,'EXISTING SUPPORT / INSTALLATION NOTES',11,'middle',700);
 const notes=[
  'DASHED COMPONENTS ARE EXISTING. GEOMETRY MUST BE SURVEYED. REFERENCE ARRANGEMENTS DO NOT ESTABLISH CAPACITY OR FABRICATION DIMENSIONS.',
  `NEW SPREADER: ${dim(b.seatLength)} X ${dim(b.seatProjection)} X ${dim(b.seatThickness)}. NEW PLATE FY ${format(d.material.Fy,'stress',p.units).toUpperCase()}. FULL, LEVEL BEARING CONTACT REQUIRED.`,
  'VERIFY EXISTING STEEL, WELDS, CONTINUITY PLATES, CORROSION, FLANGE CONTACT AND HOLES AGAINST THE RECORDED ENGINEERING ASSESSMENT BEFORE INSTALLATION.',
  'SEAT BOLTS RETAIN THE SPREADER ONLY. DO NOT CLAMP OR WELD THE SLIDING GIRDER END. LOCATING GUIDES AND HOLD-DOWNS REQUIRE SEPARATE MOVEMENT-COMPATIBLE DETAILS.',
  'PROVIDE INDEPENDENT FLANGE TIES. FIELD WELDS TO EXISTING STEEL ARE SHOWN ONLY ON THE NEW TIE DETAILS; ORIGINAL BRACKET WELDS ARE NOT SPECIFIED AS NEW WORK.',
  'CHECK CRANE ENVELOPE, RAIL GAUGE, TOP OF RAIL, HOOK HEIGHT, BUMPER LOAD PATH AND ERECTION ACCESS WITH THE SUPPLIER. FULL BUILDING AND FOUNDATIONS ARE OUTSIDE THIS MODEL.'
 ];let y=424;for(const [i,n] of notes.entries()){const w=wrappedText(636,y,`${i+1}. ${n}`,109,7.7,10.5);svg+=w.svg;y+=w.height+7;}
 const unresolved=s.checks.filter(c=>c.id.startsWith('existing-')&&['unverified','incomplete','unsupported','fail'].includes(c.status));
 svg+=text(638,650,!s.checks.some(c=>c.id.startsWith('existing-'))?'SUPPORT REVIEW: CALCULATIONS PENDING':unresolved.length?`SUPPORT REVIEW: ${unresolved.length} CHECKS REQUIRE RESOLUTION`:'SUPPORT REVIEW: SEE CALCULATION AND ASSESSMENT',8,'start',700);
 svg+=titleBlock(s,'S-05','EXISTING BRACKETS / NEW BOLTED SEATS')+'</svg>';
 dispose(group);material.dispose();edge.dispose();return svg;
}

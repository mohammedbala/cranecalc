import {isExistingBracketType,existingBracketProfile} from '../engine/bracketProfiles';
import * as THREE from 'three';
import type {CalculationSnapshot} from '../engine/types';
import {bracketOptions,tieOptions,bracketArrangement,tieArrangement,bracketModelDepth} from '../engine/connectionOptions';
import {buildWeldedBrackets} from './weldedBracketGeometry';
import {buildAlternativeTies} from './alternativeTieGeometry';
import {buildIndependentSupports} from './independentSupportGeometry';
import {sheetStart,titleBlock,text,wrappedText,viewTitle,line,rect,multiLeader,fieldFilletLeader,sheetDrawingScale,n,type XY} from './sheetGraphics';
import {plateInches} from './drawingFormat';
import {angleTie,isAngleTie,topFlangeAngleData} from '../engine/angleTie';
import {createHardwareBuilder} from './connectionDetails';
import {independentBearings} from '../engine/simpleSupports';

/** Project edges from the same solids used in the viewer. No old fabrication
 * detail is substituted when a selected arrangement has no design model. */
export function projection(group:THREE.Group,axes:(v:THREE.Vector3)=>[number,number],box:{x:number;y:number;w:number;h:number},units:'US'|'SI'){
 group.updateMatrixWorld(true);const segments:[number,number,number,number][]= [];let curvedSilhouettes=0;
 const existingSegments=new Set<number[]>();
 group.traverse(o=>{
  if(!(o instanceof THREE.Mesh))return;
  const geometry=new THREE.EdgesGeometry(o.geometry,24),a=geometry.getAttribute('position');
  for(let i=0;i<a.count;i+=2){const from=axes(new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld)),to=axes(new THREE.Vector3().fromBufferAttribute(a,i+1).applyMatrix4(o.matrixWorld));const segment:[number,number,number,number]=[from[0],from[1],to[0],to[1]];segments.push(segment);if(o.userData.existingSteel)existingSegments.add(segment);}
  geometry.dispose();
  // Sharp edges alone show only a cylinder's end rings. Add its projected
  // silhouette so link bodies and pins remain connected in the line drawing.
  if(o.geometry.type==='CylinderGeometry'){
   const positions=o.geometry.getAttribute('position'),points:[number,number][]=[];
   for(let i=0;i<positions.count;i++)points.push(axes(new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld)));
   points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
   const cross=(a:[number,number],b:[number,number],c:[number,number])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
   const half=(values:[number,number][])=>{const hull:[number,number][]=[];for(const point of values){while(hull.length>1&&cross(hull.at(-2)!,hull.at(-1)!,point)<=0)hull.pop();hull.push(point);}return hull.slice(0,-1);};
   const hull=[...half(points),...half([...points].reverse())];
   for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length];segments.push([a[0],a[1],b[0],b[1]]);}
   curvedSilhouettes++;
  }
 });
 if(!segments.length)return {svg:'',label:'NTS',project:(_v:THREE.Vector3):XY=>[0,0]};
 const xs=segments.flatMap(s=>[s[0],s[2]]),ys=segments.flatMap(s=>[s[1],s[3]]),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
 const scale=sheetDrawingScale(Math.min(box.w/Math.max(.001,xmax-xmin),box.h/Math.max(.001,ymax-ymin))/1000,units),k=scale.pointsPerMm*1000;
 const x=(v:number)=>box.x+box.w/2+(v-(xmin+xmax)/2)*k,y=(v:number)=>box.y+box.h/2+(v-(ymin+ymax)/2)*k;
 const paths=(existing:boolean)=>segments.filter(s=>existingSegments.has(s)===existing).filter(([a,b,c,d])=>Math.hypot(c-a,d-b)>.00001).map(([a,b,c,d])=>`M${n(x(a))},${n(y(b))}L${n(x(c))},${n(y(d))}`).join('');
 return {svg:`<path class="reference-line" d="${paths(true)}"/><path class="runway-line" data-curved-silhouettes="${curvedSilhouettes}" d="${paths(false)}"/>`,label:scale.label,project:(v:THREE.Vector3):XY=>{const p=axes(v);return [x(p[0]),y(p[1])];}};
}
export function dispose(group:THREE.Group){const materials=new Set<THREE.Material>();group.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});materials.forEach(m=>m.dispose());}
export function connectionConceptSheetSvg(s:CalculationSnapshot){
 const p=s.input,d=p.details,b=d?.bracket;
 if(!d||!b)return '';
 const bracket=bracketOptions.find(o=>o.id===bracketArrangement(b))!,tie=tieOptions.find(o=>o.id===tieArrangement(d))!;
 const material=new THREE.MeshBasicMaterial(),edge=new THREE.LineBasicMaterial(),bracketGroup=buildWeldedBrackets(b,[0],0,material,edge);
 const side=projection(bracketGroup,v=>[v.z,-v.y],{x:50,y:110,w:285,h:180},p.units),front=projection(bracketGroup,v=>[v.x,-v.y],{x:680,y:110,w:450,h:180},p.units);
 const whole=tie.id==='paired-bars'?buildIndependentSupports(p,b.reach/1000,material,edge):buildAlternativeTies(p,b.reach/1000,material,edge,material,createHardwareBuilder(material));
 const station=-p.spans.reduce((a,b)=>a+b,0)/2000+(p.spans.length>1?p.spans[0]/1000:0);
 const selected=new THREE.Group();whole.traverse(o=>{if(o instanceof THREE.Mesh&&Math.abs((o.userData.part?.support?.x??Infinity)-station)<.0001)selected.add(o.clone());});
 const topAngle=topFlangeAngleData(p),context=new THREE.Group();
 if(topAngle){
  const L=p.spans.reduce((a,b)=>a+b,0)/1000,beam=p.section;
  const box=(x:number,y:number,z:number,l:number,h:number,w:number,existing=false)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(l,h,w),material);mesh.position.set(x,y,z);mesh.userData.existingSteel=existing;context.add(mesh);};
  const ends=p.system==='simple'?independentBearings(p).filter(e=>Math.abs(e.station/1000-L/2-station)<.0001).map(e=>({start:e.start/1000-L/2,finish:e.finish/1000-L/2})):[{start:station-.3,finish:station+.3}];
  for(const end of ends){const x=(end.start+end.finish)/2,l=end.finish-end.start;for(const sign of [-1,1])box(x,sign*(beam.d-beam.tf)/2000,0,l,beam.tf/1000,beam.bf/1000);box(x,0,0,l,(beam.d-2*beam.tf)/1000,beam.tw/1000);if(beam.kind==='cap'){box(x,(beam.d+beam.capTw)/2000,0,l,beam.capTw/1000,beam.capWidth/1000);for(const sign of [-1,1])box(x,beam.d/2000-(beam.capDepth-beam.capTw)/2000,sign*(beam.capWidth-beam.capTf)/2000,l,(beam.capDepth-beam.capTw)/1000,beam.capTf/1000);}}
  box(station,topAngle.top/1000,b.reach/1000+b.receiver.flangeThickness/2000,b.receiver.width/1000,.44,b.receiver.flangeThickness/1000,true);
  // Context solids participate in both projections so true scales include the girder.
  selected.add(context);
 }
 const plan=projection(selected,v=>[v.x,v.z],{x:60,y:405,w:285,h:180},p.units);
 const tieElevation=topAngle?projection(selected,v=>[v.z,-v.y],{x:665,y:405,w:285,h:180},p.units):null;
 const face=b.reach/1000,depth=bracketModelDepth(b)/1000,seat=b.seatThickness/1000;
 const rectangle=(a:XY,z:XY)=>rect(Math.min(a[0],z[0]),Math.min(a[1],z[1]),Math.abs(a[0]-z[0]),Math.abs(a[1]-z[1]),'reference-line');
 const existingSide=rectangle(side.project(new THREE.Vector3(0,.07,face)),side.project(new THREE.Vector3(0,-seat-depth-.07,face+b.receiver.flangeThickness/1000)));
 const existingFront=rectangle(front.project(new THREE.Vector3(-b.receiver.width/2000,.07,face)),front.project(new THREE.Vector3(b.receiver.width/2000,-seat-depth-.07,face)));
 const existingPlan=rectangle(plan.project(new THREE.Vector3(station-b.receiver.width/2000,0,face)),plan.project(new THREE.Vector3(station+b.receiver.width/2000,0,face+b.receiver.flangeThickness/1000)));
 let tieRoot=new THREE.Vector3(station,0,face);
 selected.traverse(o=>{if(o instanceof THREE.Mesh&&/column|receiver|receiving gusset/i.test(o.userData.part?.family??'')){const box=new THREE.Box3().setFromObject(o);if(Math.abs(box.max.z-face)<.001){tieRoot=box.getCenter(new THREE.Vector3());tieRoot.z=face;}}});
 let svg=sheetStart(s,'S-02','CONNECTION ARRANGEMENTS / REFERENCE ONLY');
 svg+=text(612,80,'REFERENCE ARRANGEMENT — PROJECT DESIGN REQUIRED — NOT FOR FABRICATION',12,'middle',700);
 svg+=existingSide+side.svg+existingFront+front.svg;
 svg+=multiLeader([side.project(new THREE.Vector3(0,.045,face))],[409,132],['EXISTING COLUMN (REF.)']);
 svg+=isExistingBracketType(bracket.id)?multiLeader([side.project(new THREE.Vector3(0,-seat-depth*.5,face))],[409,219],['EXISTING BRACKET AND ROOT WELDS','SURVEY / ASSESSMENT REQUIRED']):fieldFilletLeader([side.project(new THREE.Vector3(0,-seat-depth*.5,face))],[409,219],plateInches(b.rootWeld,p.units),['FIELD WELD TO EXISTING COLUMN',bracket.id==='rolled-corbel'?'CORBEL WEB / FLANGE ROOTS':'BOTH SIDES OF EACH RIB','REFERENCE SIZE / SEE DESIGN SCOPE'],true);
 svg+=viewTitle(310,325,bracket.name.toUpperCase()+' / SIDE',side.label)+viewTitle(905,325,'BRACKET / FRONT',front.label);
 svg+=line([24,352],[1200,352],'divider')+(topAngle?'':existingPlan)+plan.svg;
 if(topAngle&&tieElevation){
  const at=topAngle,xc=station+(p.system==='simple'?at.endSetback/1000:0);
  svg+=multiLeader([plan.project(new THREE.Vector3(xc,at.top/1000,face))],[405,529],['BOLTED COLUMN ANGLE',`${at.paired?'2 - ':''}${at.shape?.name??'VERIFY SECTION'}`]);
  svg+=multiLeader([plan.project(new THREE.Vector3(xc,at.top/1000,(face+at.edge/1000)/2))],[405,442],['TOP FLANGE / CAP TIE PLATE',`PL ${plateInches(at.plateThickness,p.units)}`,'NO LOWER-FLANGE TIE']);
  svg+=tieElevation.svg+viewTitle(900,615,'TOP-FLANGE TIE / ELEVATION',tieElevation.label);
  svg+=multiLeader([tieElevation.project(new THREE.Vector3(xc,(at.top-at.boltLevel)/1000,face-at.shimThickness/2000))],[988,430],['SHIM PACK',plateInches(at.shimThickness,p.units)]);
  svg+=multiLeader([tieElevation.project(new THREE.Vector3(xc,(at.top-at.boltLevel)/1000,face-(at.shimThickness+at.thickness)/1000))],[988,516],['HORIZONTAL SLOTS / X',`${plateInches(at.slotLength,p.units)} LONG`, 'PLATE WASHERS']);
  svg+=text(645,654,'SLOTS, BOLTS, PRYING, COLUMN EFFECTS, MOVEMENT AND FATIGUE: DESIGN REQUIRED.',8);
  svg+=text(645,668,'SUPPLIED FIGURE 14 INSPIRED; CAP / PAIRED-ANGLE VARIATIONS REQUIRE REVIEW.',8);
 }else svg+=fieldFilletLeader([plan.project(tieRoot)],[409,530],tie.id==='paired-bars'?plateInches(d.brace.connection.weldSize,p.units):'',['FIELD WELD TO EXISTING COLUMN',tie.id==='paired-bars'?'BOTH SIDES OF COLUMN GUSSET':'SIZE / EXTENT BY CONNECTION DESIGN'],tie.id==='paired-bars');
 svg+=viewTitle(315,615,tie.name.toUpperCase()+' / PLAN',plan.label);
 if(isAngleTie(tie.id)&&!topAngle){
  const a=angleTie(d);svg+=text(315,644,`${a.paired?'2 - ':''}${a.shape?.name??'VERIFY ANGLE'} / VERTICAL LEG TO GUSSET`,9,'middle');
  svg+=text(315,658,`LAP ${plateInches(a.lap,p.units)} / GUSSET ${plateInches(a.gussetThickness,p.units)} / REFERENCE GEOMETRY`,8,'middle');
 }
 if(!topAngle){svg+=wrappedText(645,395,bracket.required.toUpperCase(),89,8,13).svg;
 svg+=wrappedText(645,458,tie.required.toUpperCase(),89,8,13).svg;
 svg+=wrappedText(645,535,'GEOMETRY FROM ENTERED DIMENSIONS. SOURCE FAMILIES DO NOT SUPPLY PROJECT CAPACITIES. NO EXISTING BRACKET OR TIEBACK RESISTANCE IS ASSIGNED TO THE ALTERNATIVE. ARTICULATION, FIT-UP AND CONNECTION DESIGN REQUIRE REVIEW.',89,8,13).svg;
 svg+=text(645,610,'REFERENCE AIST TECHNICAL REPORT 13 §5.9.2; AISC DG7 §11.2.',8)+text(645,627,isAngleTie(tie.id)?'ANGLE GEOMETRY: AISC SHAPES DATABASE V16.0.':'ARTICULATED FAMILIES: GANTREX SINGLE / DOUBLE TIEBACKS.',8);}
 svg+=titleBlock(s,'S-02','CONNECTION ARRANGEMENTS / REFERENCE ONLY')+'</svg>';
 // Selected meshes share geometry with whole; dispose once through whole.
 dispose(context);dispose(bracketGroup);dispose(whole);material.dispose();edge.dispose();
 return svg;
}

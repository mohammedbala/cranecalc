import {activeEndBearing} from './endBearingInputs';
import {flangeTieGeometry,flangeTieFamily,stiffenerTieGeometry,columnGussetExtension} from './tieGeometry';
import {validatePlateTie} from './plateTie';
import {validateCapAngle} from './capAngleTie';
import {tieArrangement,validateConnectionOptions} from './connectionOptions';
import type { ProjectInput } from './types';
import {validateBracket} from './bracketDesign';
import { boltProperties } from './connectionStrength';
import { clipGeometry,railClipInput,railPadThickness } from './railSeat';
import { flangeRestraintGaps } from './detailAnalysis';
import {girderSegments,simpleSupportInput,railClipStations} from './simpleSupports';
export function validateRunwayDetails(p:ProjectInput){
 const d=p.details;if(!d)return [];
 const errors:string[]=[],L=p.spans.reduce((a,b)=>a+b,0),b=d.brace,r=d.rail;
 const add=(test:boolean,message:string)=>{if(test)errors.push(`details: ${message}`);};
 if(p.system==='simple'){
  const c=simpleSupportInput(p);
  add(girderSegments(p).some(m=>m.end-m.start<=2*d.bearing.length+2*c.guideTravel),'independent bearing plates and movement allowances must fit within each girder.');
 }
 add(Math.ceil(L/(p.aist?.clipSpacing??L))>200,'detailed model supports at most 200 rail clip intervals.');
 const clip=railClipInput(r);
 if(p.system==='simple')add(girderSegments(p).some(m=>m.end-m.start<clip.baseLength),'rail clips must fit fully on each independent girder.');
 if(p.system==='simple'&&p.aist&&p.aist.clipSpacing>0&&Math.ceil(L/p.aist.clipSpacing)<=200){const ks=railClipStations(p);add(ks.slice(1).some((x,i)=>x-ks[i]>p.aist!.clipSpacing+1e-6),'girder gap plus rail clip end setbacks exceed the maximum clip spacing.');}
 // Weld-on clips stand on the girder top plate against the rail-base toes and are welded at both ends of the base:
 // the clip and its base welds stay on the plate, and each strength fillet is at least four weld sizes long (J2.2b).
 {const k=clipGeometry(r,railPadThickness(p)),surface=p.section.kind==='cap'?p.section.capWidth/2-p.section.capTf:p.section.bf/2;
  add(d.criteria.alignmentTolerance+k.outer>surface+1e-6,`rail clips must fit on the ${p.section.kind==='cap'?'cap channel web between its flanges':'girder top flange'} (rail-base half width plus the clip base width and the rail setting tolerance).`);
  if(k.type==='weld-on'){
   add(k.weldLength>k.baseWidth+1e-6,'rail clip base welds cannot be longer than the clip base is wide.');
   add(k.weldLength<4*k.weld-1e-6,'rail clip base welds must be at least four times the weld size long (AISC 360-16 J2.2b).');
  }}
 // Girder-end cover plates sit between the girder end and the bearing stiffener pair at the bearing center.
 // A bolted end bearing replaces the girder-end cover plates on independent simple spans.
 const bearingBolts=activeEndBearing(p),webEnd=!bearingBolts;
 if(bearingBolts)try{boltProperties(bearingBolts.bolts.grade,bearingBolts.bolts.diameter);}catch(e){errors.push(`details: ${e instanceof Error?e.message:String(e)}`);}
 if(p.system==='simple'&&webEnd)add(d.end.gauge+2*d.end.edge>d.bearing.length/2-d.bearing.stiffenerThickness/2-d.bearing.weldSize+1e-6,'girder-end cover plates (bolt gauge plus two edge distances) must fit between the girder end and the bearing stiffeners and their welds.');
 // The unbraced length is validated against the compression-flange stations in validateProject.
 const gaps=flangeRestraintGaps(p);
 add((p.aist?.axialLength??0)+1e-6<Math.max(...p.spans),'axial effective length must cover a complete span in this template.');
 add((p.aist?.torsionalLength??0)+1e-6<gaps.twist,'torsional effective length cannot be shorter than the spacing of stations restraining both flanges against twist.');
 add(d.criteria.temperatureMaximum>150||!d.criteria.corrosionProtected,`Appendix 3 fatigue model requires temperature at most ${p.units==='US'?'302 °F':'150 °C'} and corrosion protection.`);
 add(p.cranes.some(c=>!c.design?.bumperBypassesGirder)&&!d.endStop?.enabled,'a crane stop force reaches the girder: design the girder-mounted runway end stops, or mark the crane stops as building-mounted.');
 add(d.material.Fu<d.material.Fy,'plate Fu must not be less than Fy.');
 // Paired flat bars and the single flexible plate share the tie dimensions, saddle, gussets and bolt groups.
 const family=flangeTieFamily(d);
 if(family)add(b.reach>b.length,'brace reach cannot exceed its length.');
 if(b.flangeAttachment?.enabled&&family){
  const g=flangeTieGeometry(p);add(!g,p.system==='simple'?'direct flange ties need the column face: enable the designed column bracket, or enter the column face distance for a bracket by others.':'direct flange ties require independent simple spans.');
  if(g){
   add(g.rootLength<=4*g.attachment.weldSize,'flange saddle must leave at least four weld legs of effective length.');
   add(g.start<=g.rootStart||g.gussetEnd<=g.rootEnd,'girder gusset must extend from the flange saddle through the complete bolt group.');
   add(g.freeLength<=0,tieArrangement(d)==='flexible-plate'?'flexible plate requires clear length between the two bolt groups.':'tie bars require clear length between the two bolt groups.');
   add(Math.abs(b.length-b.reach)>1e-6,'direct transverse tie model requires reach equal to bar length.');
   add(Math.abs(b.connection.weldLength-g.columnGusset)>1e-6,`column root weld length must equal the column gusset height (${(g.columnGusset/25.4).toFixed(3)} in).`);
   add(b.connectionLength<g.gussetEnd-g.rootStart-1e-6,'unbraced gusset length must include its full flange-to-end extension.');
   add(g.stations.some(v=>v.tieX-g.attachment.saddleLength/2<v.start-1e-6||v.tieX+g.attachment.saddleLength/2>v.finish+1e-6),'saddle must remain within its own girder end bearing region.');
   // The transverse end fillet at the saddle end toward the girder end lies on the flange.
   add(g.stations.some(v=>(v.end==='left'?v.tieX-g.attachment.saddleLength/2-v.start:v.finish-v.tieX-g.attachment.saddleLength/2)<g.attachment.weldSize-1e-6),'saddle end fillets must lie on the girder flange: the saddle end toward the girder end must be at least one weld size from it (reduce the tie setback or the saddle length).');
   if(g.receiver)add(g.stations.some(v=>Math.abs(v.tieX-v.station)+b.gussetThickness/2+b.connection.weldSize>g.receiver!.width/2),'column tie root welds must fit on the receiver flange.');
   if(g.sides.includes(-1)){
    add(g.topCenter-g.bottomCenter<=Math.max(b.width,g.columnGusset)+g.attachment.clearance,'top and bottom tie assemblies overlap.');
    // The lower column gusset stays above the bearing plate and seat at the column face.
    add(g.bottomCenter-g.columnGusset/2<-p.section.d/2+g.attachment.clearance,'lower column gusset must clear the girder bearing and bracket seat.');
   }
   add(d.bearing.stiffenerWidth>(p.section.bf-p.section.tw)/2,'fitted stiffener outstand must fit inside the flange.');
  }
 }
 // Paired bars on the bearing stiffener run just under the tied flange. On a capped girder the top bars and their girder
 // gusset must clear the cap channel's turned-down flange (its web on the W flange, its flanges reaching down past it).
 {const st=stiffenerTieGeometry(p),s=p.section;
  // No part of the tie may come out with no length: the bars between their bolt groups, the girder gusset from the
  // bearing stiffener through the girder-end bolt group, and the column gusset.
  if(st){const f=(v:number)=>(v/25.4).toFixed(3),free=b.length-2*st.connection-columnGussetExtension(p);
   add(free<=0,`tie bars require clear length between the two bolt groups (${f(free)} in): lengthen the bars with a larger column face distance (bracket reach) or shorten the bolt groups.`);
   add(st.gussetLength<=0,`the girder tie gusset must reach from the bearing stiffener (${f(st.root)} in from the web centerline) through the girder-end bolt group: the ${f(b.length)} in bars start ${f(st.start)} in from the web centerline for a column face at ${f(st.face)} in. Shorten the bars or increase the bracket reach.`);
   add(st.columnGussetLength<=0,'the column tie gusset must have a positive length.');}
  if(st&&s.kind==='cap'&&st.sides.includes(1)){const drop=s.capDepth-s.capTw,inner=s.capWidth/2-s.capTf;
   add(s.d/2-st.topCenter-st.height/2<drop&&st.root<s.capWidth/2&&st.face>inner,'paired tie bars and their girder gusset at the top flange pass through the turned-down cap channel flange: use the direct flange saddle, or a cap channel whose flanges stop above the bars.');}}
 add(r.Fu<r.Fy,'rail Fu must not be less than Fy.');
 add(r.headThickness+r.baseThickness>=(p.aist?.railDepth??0),'rail depth must exceed head plus base thickness.');
 add(r.webThickness>=Math.min(r.headWidth,r.baseWidth),'rail web must fit inside the head and base.');
 add(r.baseWidth>p.section.bf,'rail base must fit on the girder flange.');
 add(d.bearing.cope>=d.bearing.stiffenerWidth,'stiffener cope must be smaller than its outstand.');
 add(2*d.bearing.stiffenerWidth+p.section.tw>d.bearing.width,'bearing plate must support both stiffener outstands.');
 add(d.bearing.length<(p.aist?.bearingLength??0),'bearing plate length must cover the entered effective bearing length.');
 if(family){
  add(Math.abs(b.connection.thickness-b.thickness)>1e-6,tieArrangement(d)==='flexible-plate'?'tie connection plate thickness must equal the flexible plate thickness.':'tie cover-plate thickness must equal the paired tie-bar thickness in this template.');
  add(b.width<b.connection.gauge+2*b.connection.edge,'brace bar width must contain the two bolt lines and edge distances.');
 }
 if(webEnd)add((d.end.rows-1)*d.end.pitch+2*d.end.edge>p.section.d-2*p.section.tf,'end bolt pattern must fit within the clear girder web.');
 add(d.bearing.cope*2>=p.section.d-2*p.section.tf,'stiffener copes must leave a positive effective web-weld length.');
 if(webEnd)add(d.end.weldLength>2*d.end.edge+(d.end.rows-1)*d.end.pitch+1e-6,'end-plate effective weld length exceeds plate height.');
 add(d.fatigueDetails.some(v=>v.x>L),'fatigue stations must lie on the modeled girder.');
 add(Math.abs(d.spectrum.reduce((a,v)=>a+v.cycles,0)-p.fatigue.cycles)>.5,'duty-bin cycles must sum to the project fatigue cycles.');
 add(new Set(d.fatigueDetails.map(f=>f.id)).size!==d.fatigueDetails.length,'fatigue detail IDs must be unique.');
 for(const c of [...(webEnd?[d.end]:[]),...(family?[b.connection]:[])])try{
  const bolt=boltProperties(c.grade,c.diameter);add(c.weldLength<4*c.weldSize,'fillet weld effective length must be at least four times its leg.');add(c.edge<=bolt.hole/2||Math.min(c.gauge,c.pitch)<=bolt.hole,'bolt holes overlap or cross the plate edge.');
 }catch(e){errors.push(`details: ${e instanceof Error?e.message:String(e)}`);}
 try{const bolt=boltProperties('A325',r.jointBoltDiameter);add(r.jointPlateHeight<=bolt.hole+1.5875||r.jointPitch<=1.5*r.jointBoltDiameter+1.5875||r.jointEdge<=.75*r.jointBoltDiameter+1.5875,'rail-joint slots leave insufficient net material.');}catch(e){errors.push(`details: ${e instanceof Error?e.message:String(e)}`);}
 return [...errors,...validatePlateTie(p),...validateCapAngle(p),...validateBracket(p),...validateConnectionOptions(p)];
}

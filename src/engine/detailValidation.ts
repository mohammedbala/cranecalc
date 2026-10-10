import {flangeTieGeometry} from './tieGeometry';
import {tieArrangement,validateConnectionOptions} from './connectionOptions';
import type { ProjectInput } from './types';
import {validateBracket} from './bracketDesign';
import { boltProperties } from './connectionStrength';
import { flangeRestraintGaps } from './detailAnalysis';
import {girderSegments,simpleSupportInput,railKeeperStations} from './simpleSupports';
export function validateRunwayDetails(p:ProjectInput){
 const d=p.details;if(!d)return [];
 const errors:string[]=[],L=p.spans.reduce((a,b)=>a+b,0),b=d.brace,r=d.rail;
 const add=(test:boolean,message:string)=>{if(test)errors.push(`details: ${message}`);};
 if(p.system==='simple'){
  const c=simpleSupportInput(p);
  add(girderSegments(p).some(m=>m.end-m.start<=2*d.bearing.length+2*c.guideTravel),'independent bearing plates and movement allowances must fit within each girder.');
 }
 add(Math.ceil(L/(p.aist?.clipSpacing??L))>200,'detailed model supports at most 200 rail-keeper intervals.');
 if(p.system==='simple')add(girderSegments(p).some(m=>m.end-m.start<d.rail.clipWidth),'rail keepers must fit fully on each independent girder.');
 if(p.system==='simple'&&p.aist&&p.aist.clipSpacing>0&&Math.ceil(L/p.aist.clipSpacing)<=200){const ks=railKeeperStations(p);add(ks.slice(1).some((x,i)=>x-ks[i]>p.aist!.clipSpacing+1e-6),'girder gap plus rail keeper end setbacks exceed the maximum keeper spacing.');}
 // Each keeper is fillet welded on both faces; the inner fillet lies in the gap between the keeper and the rail foot, half the toe projection.
 add(r.clipWeld+1.5875>r.clipProjection/2+1e-6,'rail keeper inner fillet plus 1/16 in fit-up clearance must fit between the keeper and the rail foot (half the keeper projection).');
 // Girder-end cover plates sit between the girder end and the bearing stiffener pair at the bearing centre.
 if(p.system==='simple')add(d.end.gauge+2*d.end.edge>d.bearing.length/2-d.bearing.stiffenerThickness/2-d.bearing.weldSize+1e-6,'girder-end cover plates (bolt gauge plus two edge distances) must fit between the girder end and the bearing stiffeners and their welds.');
 // The unbraced length is validated against the compression-flange stations in validateProject.
 const gaps=flangeRestraintGaps(p);
 add((p.aist?.axialLength??0)+1e-6<Math.max(...p.spans),'axial effective length must cover a complete span in this template.');
 add((p.aist?.torsionalLength??0)+1e-6<gaps.twist,'torsional effective length cannot be shorter than the spacing of stations restraining both flanges against twist.');
 add(d.criteria.temperatureMaximum>150||!d.criteria.corrosionProtected,`Appendix 3 fatigue model requires temperature at most ${p.units==='US'?'302 °F':'150 °C'} and corrosion protection.`);
 add(p.cranes.some(c=>!c.design?.bumperBypassesGirder)&&!d.endStop?.enabled,'a crane stop force reaches the girder: design the girder-mounted runway end stops, or mark the crane stops as building-mounted.');
 add(!!d.endStop?.enabled&&p.cranes.some(c=>!c.design?.bumperBypassesGirder)&&!d.endStop.source.trim(),'enter the source of the bumper force, bumper height and contact diameter for the end stops.');
 add(d.material.Fu<d.material.Fy,'plate Fu must not be less than Fy.');
 if(tieArrangement(d)==='paired-bars')add(b.reach>b.length,'brace reach cannot exceed its length.');
 if(b.flangeAttachment?.enabled&&tieArrangement(d)==='paired-bars'){
  const g=flangeTieGeometry(p);add(!g,'direct flange ties require independent simple spans and an enabled designed column bracket.');
  if(g){
   add(g.rootLength<=4*g.attachment.weldSize,'flange saddle must leave at least four weld legs of effective length.');
   add(g.start<=g.rootStart||g.gussetEnd<=g.rootEnd,'girder gusset must extend from the flange saddle through the complete bolt group.');
   add(g.freeLength<=0,'tie bars require clear length between the two bolt groups.');
   add(Math.abs(b.length-b.reach)>1e-6,'direct transverse tie model requires reach equal to bar length.');
   add(Math.abs(b.connection.weldLength-b.width)>1e-6,'column root weld length must equal the actual gusset height.');
   add(b.connectionLength<g.gussetEnd-g.rootStart,'unbraced gusset length must include its full flange-to-end extension.');
   add(g.stations.some(v=>v.tieX-g.attachment.saddleLength/2<v.start-1e-6||v.tieX+g.attachment.saddleLength/2>v.finish+1e-6),'saddle must remain within its own girder end bearing region.');
   add(g.stations.some(v=>Math.abs(v.tieX-v.station)+b.gussetThickness/2+b.connection.weldSize>d.bracket!.receiver.width/2),'column tie root welds must fit on the receiver flange.');
   add(g.topCenter-g.bottomCenter<=b.width+g.attachment.clearance,'top and bottom tie assemblies overlap.');
   add(d.bearing.stiffenerWidth>(p.section.bf-p.section.tw)/2,'fitted stiffener outstand must fit inside the flange.');
  }
 }
 add(r.Fu<r.Fy,'rail Fu must not be less than Fy.');
 add(r.headThickness+r.baseThickness>=(p.aist?.railDepth??0),'rail depth must exceed head plus base thickness.');
 add(r.webThickness>=Math.min(r.headWidth,r.baseWidth),'rail web must fit inside the head and base.');
 add(r.baseWidth>p.section.bf,'rail base must fit on the girder flange.');
 add(d.bearing.cope>=d.bearing.stiffenerWidth,'stiffener cope must be smaller than its outstand.');
 add(2*d.bearing.stiffenerWidth+p.section.tw>d.bearing.width,'bearing plate must support both stiffener outstands.');
 add(d.bearing.length<(p.aist?.bearingLength??0),'bearing plate length must cover the entered effective bearing length.');
 if(tieArrangement(d)==='paired-bars'){
  add(Math.abs(b.connection.thickness-b.thickness)>1e-6,'tie cover-plate thickness must equal the paired tie-bar thickness in this template.');
  add(b.width<b.connection.gauge+2*b.connection.edge,'brace bar width must contain the two bolt lines and edge distances.');
 }
 add((d.end.rows-1)*d.end.pitch+2*d.end.edge>p.section.d-2*p.section.tf,'end bolt pattern must fit within the clear girder web.');
 add(d.bearing.cope*2>=p.section.d-2*p.section.tf,'stiffener copes must leave a positive effective web-weld length.');
 add(d.end.weldLength>2*d.end.edge+(d.end.rows-1)*d.end.pitch+1e-6,'end-plate effective weld length exceeds plate height.');
 add(d.fatigueDetails.some(v=>v.x>L),'fatigue stations must lie on the modeled girder.');
 add(Math.abs(d.spectrum.reduce((a,v)=>a+v.cycles,0)-p.fatigue.cycles)>.5,'duty-bin cycles must sum to the project fatigue cycles.');
 add(new Set(d.fatigueDetails.map(f=>f.id)).size!==d.fatigueDetails.length,'fatigue detail IDs must be unique.');
 for(const c of tieArrangement(d)==='paired-bars'?[d.end,b.connection]:[d.end])try{
  const bolt=boltProperties(c.grade,c.diameter);add(c.weldLength<4*c.weldSize,'fillet weld effective length must be at least four times its leg.');add(c.edge<=bolt.hole/2||Math.min(c.gauge,c.pitch)<=bolt.hole,'bolt holes overlap or cross the plate edge.');
 }catch(e){errors.push(`details: ${e instanceof Error?e.message:String(e)}`);}
 try{const bolt=boltProperties('A325',r.jointBoltDiameter);add(r.jointPlateHeight<=bolt.hole+1.5875||r.jointPitch<=1.5*r.jointBoltDiameter+1.5875||r.jointEdge<=.75*r.jointBoltDiameter+1.5875,'rail-joint slots leave insufficient net material.');}catch(e){errors.push(`details: ${e instanceof Error?e.message:String(e)}`);}
 return [...errors,...validateBracket(p),...validateConnectionOptions(p)];
}

import type {ProjectInput,CheckResult} from './types';
import type {BracketLoads} from './bracketDesign';
import {seatStrip} from './bracketDesign';
import {available} from './aiscStrength';
import {boltProperties} from './connectionStrength';
import {existingBracketProfile,existingBracketSectionArea,isExistingBracketType,defaultExistingWShape} from './bracketProfiles';
import {aiscShapeByName} from '../data/aiscSections';
import {simpleSupportInput} from './simpleSupports';

export const usesExistingBracket=(p:ProjectInput)=>!!p.details?.bracket?.enabled&&isExistingBracketType(p.details.bracket.arrangement);
export const existingBracket=(p:ProjectInput)=>existingBracketProfile(p.details?.bracket);
export const existingBoltPositions=(p:ProjectInput)=>{const c=existingBracket(p).bolts;return [-1,1].flatMap(x=>[-1,1].map(z=>({x:x*c.pitch/2,z:z*c.gauge/2})));};
type Peak={value:number;caseId:string;x:number};
export interface ExistingBracketResults {
 strength:Record<string,Peak>;service:Record<string,Peak>;
 fatigue:{name:string;cycles:number;seatStress:number;vertical:number;rootMoment:number;seatMoment:number}[];
 stations:{x:number;caseId:string;vertical:number;rootMoment:number;seatMoment:number;utilization:number}[];
}
/** New adapter: conservative beam strip between existing flange edges. The
 * existing flange/contact capacity is verified separately, with no composite
 * action, bolt tension, friction, or column-continuity credit. */
export function existingBracketResponse(p:ProjectInput,loads:BracketLoads){
 const b=p.details!.bracket!,e=existingBracket(p),bearing=p.details!.bearing;
 const vertical=loads.reduce((s,v)=>s+v.vertical,0),seatMoment=loads.reduce((s,v)=>s+v.vertical*v.offset,0);
 const rootMoment=loads.reduce((s,v)=>s+Math.abs(v.vertical),0)*(b.reach+bearing.width/2);
 const strip=seatStrip(loads,e.width,bearing.length),seatStress=6*strip.moment/(bearing.width*b.seatThickness**2),seatShear=1.5*strip.shear/(bearing.width*b.seatThickness);
 const radius=Math.max(e.width**2/4,Math.abs(b.seatLength**2-e.width**2)/4);
 return {vertical,rootMoment,seatMoment,seatStress,seatShear,
  seatDeflection:strip.moment*radius/(2*p.section.E*(bearing.width*b.seatThickness**3/12)),
  uplift:loads.reduce((s,v)=>s+Math.max(0,-v.vertical),0),
  interaction:e.rating.vertical>0&&e.rating.rootMoment>0&&e.rating.seatMoment>0?Math.abs(vertical)/e.rating.vertical+rootMoment/e.rating.rootMoment+Math.abs(seatMoment)/e.rating.seatMoment:0};
}
export function createExistingBracketCollector(p:ProjectInput){
 if(!usesExistingBracket(p))return undefined;
 const b=p.details!.bracket!,e=existingBracket(p),result:ExistingBracketResults={strength:{},service:{},fatigue:p.details!.spectrum.map(v=>({name:v.name,cycles:v.cycles,seatStress:0,vertical:0,rootMoment:0,seatMoment:0})),stations:[]};
 const observe=(kind:'strength'|'service'|'fatigue',caseId:string,x:number,loads:BracketLoads,bin:number)=>{
  const volume=b.seatLength*b.seatProjection*b.seatThickness+existingBracketSectionArea(b)*e.projection;
  const weight=volume*p.section.density*9.80665/1e9;
  const r=existingBracketResponse(p,kind==='strength'?[...loads,{vertical:weight*(p.method==='LRFD'?1.4:1),offset:0,length:b.seatLength}]:loads);
  if(kind==='fatigue'){
   const f=result.fatigue[bin];for(const key of ['seatStress','vertical','rootMoment','seatMoment'] as const)f[key]=Math.max(f[key],2*Math.abs(r[key]));return;
  }
  const target=kind==='strength'?result.strength:result.service;
  const values=kind==='strength'?{vertical:Math.abs(r.vertical),rootMoment:r.rootMoment,seatMoment:Math.abs(r.seatMoment),interaction:r.interaction,seatStress:r.seatStress,seatShear:r.seatShear,uplift:r.uplift}:{vertical:Math.abs(r.vertical),seatDeflection:r.seatDeflection};
  for(const [key,value] of Object.entries(values))if(!target[key]||value>target[key].value)target[key]={value,caseId,x};
  if(kind==='strength'){
   const old=result.stations.find(v=>v.x===x),score=r.interaction||Math.abs(r.vertical)+r.rootMoment/Math.max(b.reach,1)+Math.abs(r.seatMoment)/Math.max(e.width,1);
   if(!old||score>old.utilization){const row={x,caseId,vertical:r.vertical,rootMoment:r.rootMoment,seatMoment:r.seatMoment,utilization:score};if(old)Object.assign(old,row);else result.stations.push(row);}
  }
 };
 return {result,observe};
}
export function validateExistingBracket(p:ProjectInput){
 if(!usesExistingBracket(p))return [];
 const b=p.details!.bracket!,e=existingBracket(p),d=p.details!,errors:string[]=[];
 const add=(bad:boolean,message:string)=>{if(bad)errors.push('details.bracket.existing: '+message);};
 add(b.arrangement==='existing-w-corbel'&&!aiscShapeByName(b.wideFlange?.shape??defaultExistingWShape),'select a valid AISC W-section for the existing wide-flange bracket.');
 add(p.scope!=='design'||!p.aist?.runwayOnly,'existing bracket assessment requires the detailed runway design scope.');
 add(e.depth<=2*e.flangeThickness||e.webThickness>=e.width,'invalid surveyed I-bracket section.');
 add(e.Fu<e.Fy,'existing steel Fu must be at least Fy.');
 add(b.receiver.depth<=2*b.receiver.flangeThickness||b.receiver.webThickness>=b.receiver.width,'invalid receiving column section.');
 add(b.reach<=d.bearing.width/2||b.seatProjection<b.reach+d.bearing.width/2,'the complete bearing patch must fit clear of the column and on the bracket.');
 const offset=p.system==='simple'?simpleSupportInput(p).endGap/2+d.bearing.length/2:0;
 add(b.seatLength<2*offset+d.bearing.length,'new spreader must cover both independent girder bearings.');
 add(e.width>b.seatLength,'new spreader must cover the surveyed bracket flange width.');
 add(e.projection<b.seatProjection,'existing bracket must support the full transverse projection of the new plate.');
 add(b.receiver.Fu<b.receiver.Fy,'receiver Fu must be at least Fy.');
 try{boltProperties(e.bolts.grade,e.bolts.diameter);}catch{add(true,'select a supported ASTM bolt diameter.');}
 add(e.bolts.pitch+2*e.bolts.edge>Math.min(e.width,b.seatLength),'seat bolt rows and edge distances must fit the existing flange and new plate.');
 add(b.reach-e.bolts.gauge/2<e.bolts.edge||b.seatProjection-b.reach-e.bolts.gauge/2<e.bolts.edge,'seat bolt rows must clear both transverse plate edges.');
 // Conservative 2db radial wrench envelope; no hardware may enter the rail
 // bearing plate or runway bottom flange or the existing stub web.
 add(e.bolts.gauge/2<Math.max(d.bearing.width,p.section.bf)/2+2*e.bolts.diameter,'seat bolts need clearance outside the bearing plate and girder flange.');
 add(e.bolts.pitch/2<e.webThickness/2+2*e.bolts.diameter,'seat bolt nuts need clearance from the existing bracket web.');
 add(e.continuityThickness>=Math.min(e.depth/2,e.continuityAbove),'column continuity plates overlap.');
 return errors;
}
export function existingBracketChecks(p:ProjectInput,r:ExistingBracketResults):CheckResult[]{
 const b=p.details!.bracket!,e=existingBracket(p),m=p.details!.material,checks:CheckResult[]=[];
 const gate=(id:string,title:string,ok:boolean,note:string,byOthers=false)=>checks.push({id:'existing-'+id,group:'Column bracket',title,status:ok?(byOthers?'excluded':'pass'):'unverified',equation:'',note,referenceIds:['existing-bracket-basis']});
 const add=(id:string,title:string,demand:number,capacity:number,q:CheckResult['quantity'],equation:string,note:string,caseId?:string)=>checks.push({id:'existing-'+id,group:'Column bracket',title,demand,capacity,quantity:q,utilization:capacity>0?demand/capacity:undefined,status:capacity<=0?'unverified':demand<=capacity*(1+1e-9)?'pass':'fail',equation,note,caseId,referenceIds:['existing-bracket-basis','aisc-connections']});
 gate('survey','Existing bracket · survey and condition',e.surveyConfirmed&&e.conditionConfirmed&&!!e.geometrySource.trim()&&b.receiver.confirmed&&!!b.receiver.source.trim(),e.geometrySource||'Survey bracket, stiffeners, welds, column, corrosion and hole locations. The photograph supplies no verified dimensions or capacity.');
 gate('assessment','Existing bracket / column · documented resistance',e.rating.confirmed&&!!e.rating.source.trim()&&e.rating.method===p.method,`Enter available ${p.method} resistances from an engineering assessment of the existing bracket, root welds, continuity plates and receiving column. The assessment must permit the conservative linear interaction below. No steel resistance is calculated for the existing assembly. ${e.rating.source}`);
 gate('contact','Existing flange · bearing contact and local effects',e.rating.contactConfirmed,'Confirm the assessment covers the new plate footprint, eccentric bearing patches, flange/web local effects and bolted holes. Continuity plates are shown but receive no inferred strength credit.',true);
 gate('service','Existing support · stiffness and movement',e.rating.serviceConfirmed,'Confirm existing bracket/column deformation, rotation and clearances for the reported service reactions. The girder model has fixed support interfaces. The new seat deflection check excludes deformation of existing steel.',true);
 gate('attachment','Bolted seat and separate horizontal attachments',e.rating.attachmentConfirmed&&b.loadPathConfirmed,'Four seat bolts retain the new spreader on the existing top flange. Gravity transfers by bearing. A project connection assessment must cover erection/retention loads, bolts, connected steel, hole reduction and access. Flange ties and longitudinal locating/sliding attachments have separate load paths; these bolts are not a rated sliding hold-down.',true);
 const S=r.strength,V=r.service;
 for(const [key,title,cap,q] of [['vertical','Existing bracket · vertical reaction',e.rating.vertical,'force'],['rootMoment','Existing bracket · cantilever root moment',e.rating.rootMoment,'moment'],['seatMoment','Existing bracket · longitudinal eccentric moment',e.rating.seatMoment,'moment']] as const)add(key,title,S[key]?.value??0,cap,q,key==='rootMoment'?'M_r=\\sum|V_i|(e+b_p/2)':key==='seatMoment'?'M_s=\\sum V_i x_i':'V=\\sum V_i','Simultaneous signed bearing actions; conservative far-edge transverse eccentricity. Strength adds bracket and new-seat self-weight. Available resistance is supplied by the documented existing-structure assessment.',S[key]?.caseId);
 add('interaction','Existing bracket · combined actions',S.interaction?.value??0,e.rating.vertical>0&&e.rating.rootMoment>0&&e.rating.seatMoment>0?1:0,'ratio','|V|/V_a+|M_r|/M_{ra}+|M_s|/M_{sa}\\le1','Maximum interaction is evaluated on each concurrent load case, not assembled from unrelated maxima.',S.interaction?.caseId);
 add('seat-flexure','New bolted spreader · elastic bending',S.seatStress?.value??0,available(m.Fy,p.method,.9,1.67),'stress','f_b=6M_{strip,max}/(b_p t_p^2)','Seat strip simply supported at the existing flange edges, with actual bearing patches and overhangs. Full flange-contact adequacy is required separately.',S.seatStress?.caseId);
 add('seat-shear','New bolted spreader · shear',S.seatShear?.value??0,available(.6*m.Fy,p.method,.9,1.67),'stress','\\tau=1.5V_{strip,max}/(b_p t_p)','Peak elastic strip shear; no plastic distribution or composite flange action.',S.seatShear?.caseId);
 add('seat-deflection','New bolted spreader · incremental deflection',V.seatDeflection?.value??0,b.deflectionLimit,'length','|v|\\le M_{max}\\max| (x-r_1)(x-r_2) |/(2EI)','Moment-bound integration for the new plate only; existing support deformation requires the recorded assessment.',V.seatDeflection?.caseId);
 add('bolt-spacing','Seat bolts · minimum spacing',8/3*e.bolts.diameter,Math.min(e.bolts.pitch,e.bolts.gauge),'length','s\\ge (8/3)d_b','Standard holes, two rows in each direction. Fit checks include plate edges and conservative hardware clearance.');
 add('bolt-edge','Seat bolts · edge distance',1.5*e.bolts.diameter,e.bolts.edge,'length','e\\ge1.5d_b','Conservative machine-cut standard-hole minimum. Hole bearing and net-section effects require the attachment assessment.');
 add('uplift','Existing gravity seat · contact retained',S.uplift?.value??0,1,'force','V_{uplift}\\le0','Any upward bearing action above 1 N requires a separately designed hold-down; retaining bolts receive no uplift capacity.',S.uplift?.caseId);
 const cycles=Math.max(p.fatigue.cycles,r.fatigue.reduce((s,v)=>s+v.cycles,0));
 add('fatigue-cycles','Existing support · assessed fatigue cycles',cycles,e.rating.cycles,'ratio','N_{assessment}\\ge\\max(N_{project},\\sum N_i)','The documented fatigue ranges must cover the actual geometry, both moment axes, weld details and this number of cycles. No endurance or remaining-life credit is inferred.');
 const fatigueReady=e.rating.fatigueRange>0&&e.rating.fatigueRootMoment>0&&e.rating.fatigueSeatMoment>0;
 const fatigueUtilization=fatigueReady?Math.max(0,...r.fatigue.map(f=>f.vertical/e.rating.fatigueRange+f.rootMoment/e.rating.fatigueRootMoment+f.seatMoment/e.rating.fatigueSeatMoment)):0;
 add('fatigue','Existing support · assessed cyclic ranges',fatigueUtilization,fatigueReady?1:0,'ratio','\\Delta V/V_{SR}+\\Delta M_r/M_{r,SR}+\\Delta M_s/M_{s,SR}\\le1','Twice each maximum absolute unfactored bin response bounds reversal; the largest combined ratio applies to all assessed cycles. The source assessment must permit this range interaction.');
 const seatDamage=r.fatigue.reduce((sum,f)=>sum+(f.seatStress/(6900*(.39/f.cycles)**(1/3)))**3,0);
 add('seat-fatigue','New bolted spreader · fatigue',seatDamage,1,'ratio','D=\\sum(\\Delta f_i/F_{SR,i})^3\\le1','Conservative E-prime base-metal bound at all seat sections, no endurance-limit credit. Twice peak absolute strip stress bounds full reversal. Bolt fatigue and existing steel are covered by the separate assessment.');
 return checks;
}

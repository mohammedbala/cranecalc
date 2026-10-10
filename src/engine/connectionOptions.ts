import {isExistingBracketType,existingBracketProfile,defaultWideFlangeBracket} from './bracketProfiles';
import {defaultBracket,type BracketInput} from './bracketInputs';
import {defaultExistingBracket} from './existingBracketInputs';
import type {CheckResult,ProjectInput} from './types';
import type {RunwayDetails} from './runwayDetails';
import {aiscShapeByName} from '../data/aiscSections';
import {independentBearings} from './simpleSupports';
import {validateExistingBracket} from './existingBracket';
import {isAngleTie,angleTie,topFlangeAngleData,defaultSingleAngle,defaultDoubleAngle} from './angleTie';

export const bracketOptions=[
 {id:'twin-rib',name:'Welded twin-rib seat',status:'Component checks available',basis:'Reference AIST Technical Report 13 §5.9.2',url:'',description:'Two rectangular ribs and a spreader seat welded to the column. Uses the existing gravity-bracket component model; movement and whole-building design remain separate.',required:'Seat and rib strength, eccentric root welds, local column effects, fatigue and service rotation.'},
 {id:'haunched-seat',name:'Welded haunched seat',status:'Project design required',basis:'Reference AIST Technical Report 13 §5.9.2 · bracketed support family',url:'',description:'Two tapered plate ribs under a continuous seat. This is an editable concept within the bracketed-support family, not a reproduced or prequalified standard detail.',required:'Variable-depth rib stability, seat distribution, weld stress concentrations, column effects and fatigue. The rectangular-rib model does not apply.'},
 {id:'rolled-corbel',name:'New wide-flange bracket',status:'Project design required',basis:'Reference AIST Technical Report 13 §5.9.2 · AISC Shapes Database v16.0',url:'https://www.aisc.org/aisc/publications/steel-construction-manual-resources/',description:'A short W-section welded to the column with a spreader seat above. Catalogue dimensions define the model; the section designation does not establish connection capacity.',required:'Cantilever flexure, shear and stability; spreader plate; the complete I-shaped weld group; column local effects and fatigue.'},
 {id:'existing-w-corbel',name:'Existing wide-flange bracket · RFP-style',status:'New seat checks + assessed support',basis:'Great Falls Airport RFP · support arrangement, pp. 1–3',url:'https://flygtf.com/wp-content/uploads/2025/09/RFPbridgecrane082925.pdf#page=3',description:'A short AISC W-section bracket with a new bolted spreader seat. The RFP photograph inspires this support family; it supplies no verified bracket designation or rating. Select the actual surveyed W-section independently of the runway girder.',required:'New seat bending, shear and fatigue; bolt fit and access; concurrent vertical and eccentric actions; documented existing strength, fatigue, contact and serviceability. Separate flange ties require their own applicable design checks.'},
 {id:'existing-corbel',name:'Existing built-up plate I-bracket',status:'New seat checks + assessed support',basis:'Reference AIST Technical Report 13 §5.9.2 · surveyed existing support',url:'',description:'A custom I-section assembled from plates. Enter the measured web, flange, projection and stiffener dimensions. Its geometry and assessment are independent of the catalogue W-bracket option.',required:'New seat bending, shear and fatigue; bolt fit and access; concurrent support actions and documented existing bracket, root-weld, continuity-plate and column assessment.'},
] as const;
export const tieOptions=[
 {id:'paired-bars',name:'Paired flat-bar ties',status:'Component checks available',basis:'AISC DG7 §11.2 · current custom plate connection',url:'https://ej.aisc.org/index.php/engj/article/view/777',description:'Symmetric double-cover bars at the top flange (both flanges without bolted end bearings), on direct flange saddles when enabled. The thin bars flex with end rotation and thermal travel; sleeved bolts in vertical slots at the column gusset release support deflection.',required:'Bar, bolt, weld and flange-saddle checks with imposed-movement fatigue and strength, slot travel and sleeve checks.'},
 {id:'single-angle',name:'Single-angle tieback',status:'Project design required',basis:'AISC Shapes Database v16.0 · DG7 §11.2 movement principles',url:'https://ej.aisc.org/index.php/engj/article/view/777',description:'Select a slotted top-flange column angle inspired by supplied Figure 14, or retain the earlier gusseted both-flange arrangement. The top-flange detail has a tie plate, bolted clip angle, shim pack and plate washers. Catalogue geometry does not establish capacity.',required:'Slotted clip: bolts, bearing/slip, washers, prying, top plate/cap welds and column effects. Gusseted option: eccentric force, buckling and weld groups. Both require lateral stiffness, movement and fatigue design.'},
 {id:'double-angle',name:'Double-angle tieback',status:'Project design required',basis:'AISC Shapes Database v16.0 · DG7 §11.2 movement principles',url:'https://ej.aisc.org/index.php/engj/article/view/777',description:'Select two slotted column angles straddling one top-flange tie plate, or retain the earlier paired gusseted members. The top-flange arrangement is a paired-angle variation inspired by supplied Figure 14; it provides no lower-flange tie or assigned capacity.',required:'Paired-angle load sharing, prying, slotted bolt groups or gusseted weld groups, lateral stiffness, imposed movement and fatigue. A stiffer pair does not establish girder-end rotation compatibility.'},
 {id:'flexible-plate',name:'Flexible plate tieback',status:'Project design required',basis:'AISC DG7 §11.2 / Fig. 11-1; Fisher & Van de Pas (2002), Fig. 1',url:'https://ej.aisc.org/index.php/engj/article/view/777',description:'A thin vertical plate between flange and column attachments. Intended to flex out of plane with girder-end movement. The illustrated plate is a concept, not a verified copy of the published connection.',required:'Tension/compression, lateral restraint stiffness, imposed-displacement bending, welded attachments and fatigue. Plate dimensions alone do not establish flexibility.'},
 {id:'bearing-link',name:'Single articulated bearing link',status:'Supplier design required',basis:'Gantrex single tieback; Molyneux PFSL / TBL link families',url:'https://www.gantrex.com/products/tieback-assemblies/',description:'A steel link with bearing eyes at each end, attached to individual girder and column clevises. Supplier examples accommodate girder movement while transferring lateral force. Geometry is generic and carries no supplier rating.',required:'Supplier tension/compression, stiffness, articulation and fatigue ratings; pins, clevises, welds and receiving steel. Both-flange placement shown here requires project review.'},
 {id:'paired-links',name:'Double articulated tieback',status:'Supplier design required',basis:'Gantrex double tieback / adjacent girder arrangement',url:'https://www.gantrex.com/products/tieback-assemblies/',description:'Separate links from adjacent simple-span girder ends to a shared column attachment. End columns have one active link. The generic model is not a manufacturer assembly.',required:'Shared column attachment under concurrent signed link forces; supplier bearing/pin ratings, articulation envelope, fatigue and separate lower-flange restraint.'},
] as const;
export type BracketArrangement=typeof bracketOptions[number]['id'];
export type TieArrangement=typeof tieOptions[number]['id'];
/** Keep each existing profile separate; initialize fit only on first selection. */
export function selectBracketArrangement(d:RunwayDetails,kind:BracketArrangement):RunwayDetails{
 const b={...(d.bracket??defaultBracket),enabled:true,arrangement:kind};
 if(kind==='haunched-seat')b.tipDepth??=b.ribDepth/4;
 if(kind==='rolled-corbel')b.corbelShape??='W12X40';
 if(isExistingBracketType(kind)){
  const key=kind==='existing-w-corbel'?'wideFlange':'existing';
  if(!b[key]){
   const e=kind==='existing-w-corbel'?defaultWideFlangeBracket():structuredClone(defaultExistingBracket);
   e.bolts.gauge=Math.max(e.bolts.gauge,d.bearing.width+4*e.bolts.diameter+10);
   if(key==='wideFlange')b.wideFlange={...e,shape:defaultWideFlangeBracket().shape};
   else b.existing=e;
  }
  const e=existingBracketProfile(b);
  b.seatProjection=Math.max(b.seatProjection,b.reach+e.bolts.gauge/2+e.bolts.edge);
 }
 return {...d,bracket:b};
}
export const bracketArrangement=(b?:BracketInput):BracketArrangement=>b?.arrangement??'twin-rib';
export const tieArrangement=(d?:RunwayDetails):TieArrangement=>d?.brace.arrangement??'paired-bars';
export const defaultReferenceTie={plateWidth:101.6,plateThickness:9.525,pinDiameter:25.4,eyeDiameter:76.2,eyeThickness:38.1,linkDiameter:38.1,forkThickness:19.05,pinSetback:101.6,linkSpacing:127};
export const referenceTie=(d:RunwayDetails)=>d.brace.referenceDetail??defaultReferenceTie;
export function selectTieArrangement(d:RunwayDetails,kind:TieArrangement):RunwayDetails{
 const brace={...d.brace,arrangement:kind};
 if(kind==='single-angle')brace.singleAngle??={...defaultSingleAngle};
 else if(kind==='double-angle')brace.doubleAngle??={...defaultDoubleAngle};
 else if(kind!=='paired-bars')brace.referenceDetail??={...defaultReferenceTie};
 return {...d,bracket:kind==='paired-bars'?d.bracket:{...(d.bracket??defaultBracket),enabled:true},brace};
}
export const bracketModelDepth=(b:BracketInput)=>isExistingBracketType(bracketArrangement(b))?existingBracketProfile(b).depth:bracketArrangement(b)==='rolled-corbel'?(aiscShapeByName(b.corbelShape??'W12X40')?.d??12)*25.4:b.ribDepth;
export function connectionOptionChecks(p:ProjectInput):CheckResult[]{
 const d=p.details;if(!d)return [];
 const checks:CheckResult[]=[];
 const bracket=bracketOptions.find(o=>o.id===bracketArrangement(d.bracket))!;
 const tie=tieOptions.find(o=>o.id===tieArrangement(d))!;
 if(d.bracket?.enabled&&bracket.id!=='twin-rib'&&!isExistingBracketType(bracket.id))checks.push({id:'option-bracket-model',group:'Column bracket',title:`${bracket.name} · design model`,status:'unsupported',equation:'',note:bracket.required+' Preview geometry only; no capacity is assigned and the current twin-rib results are not reused.',referenceIds:['connection-options','tr13-bracket']});
 if(tie.id!=='paired-bars')checks.push({id:'option-tie-model',group:'Connections',title:`${tie.name} · design model`,status:'unsupported',equation:'',note:(topFlangeAngleData(p)?'Top-flange-only attachment inspired by supplied Figure 14. Check tie plate and angle strength, bolt slip/bearing, prying, slotted-hole and washer detailing, flange/cap weld fatigue, existing column local effects and imposed movement. Lower-flange restraint is not provided by this arrangement.':tie.required)+' No proprietary rating or existing flat-bar stiffness is assigned. Report generation remains blocked.',referenceIds:['connection-options',isAngleTie(tie.id)?'angle-tie-basis':tie.id==='flexible-plate'?'tieback-practice':'bearing-link-practice']});
 return checks;
}
/** Static bolt probes can review this new drilled/bolted preview independently
 * of its still-missing structural and movement model. */
export const connectionHardwareAuditSupported=(p:ProjectInput)=>connectionOptionChecks(p).every(c=>c.id==='option-tie-model'&&!!topFlangeAngleData(p));
export function validateConnectionOptions(p:ProjectInput):string[]{
 const d=p.details;if(!d)return [];
 const b=d.bracket,errors:string[]=[],kind=bracketArrangement(b),tie=tieArrangement(d),r=referenceTie(d);
 if(b?.enabled&&isExistingBracketType(kind))errors.push(...validateExistingBracket(p));
 if(b?.enabled&&kind==='haunched-seat'&&(b.tipDepth??b.ribDepth/4)>b.ribDepth)errors.push('details.bracket: haunch tip depth cannot exceed the root depth.');
 if(b?.enabled&&kind==='rolled-corbel'){
  const shape=aiscShapeByName(b.corbelShape??'W12X40');
  if(!shape)errors.push('details.bracket.corbelShape: select a valid AISC W-section.');
  else if(shape.bf*25.4>b.seatLength||shape.bf*25.4+2*b.rootWeld>b.receiver.width)errors.push('details.bracket: corbel flanges and root welds must fit on the seat and receiving column.');
 }
 if(tie!=='paired-bars'){
  if(!b?.enabled)errors.push('details.brace: alternative tie previews require an enabled column bracket to locate the receiving face.');
  if(isAngleTie(tie)){
   const a=angleTie(d),setback=a.endSetback,ends=independentBearings(p);
   const add=(bad:boolean,note:string)=>{if(bad)errors.push('details.brace.angle: '+note);};
   add(!a.shape,'select a valid AISC L-section.');
   const top=topFlangeAngleData(p);
   if(top){
    const xs=ends.map(e=>({e,x:e.center+(e.end==='left'?-1:1)*top.endSetback})),offsets=xs.length?xs.map(v=>v.x-v.e.station):[0];
    add(top.slotLength<=top.holeDiameter,'slot length must exceed the hole width.');
    add(top.boltPitch<=top.washerLength+6.35,'bolt pitch must clear adjacent plate washers.');
    add((top.width-top.boltPitch-top.slotLength)/2<top.boltDiameter,'slots need at least one bolt diameter of clear material to the angle ends (geometry screen, not a code edge-distance check).');
    add(top.depth*.35<top.boltDiameter||top.depth*.65<top.thickness+top.boltDiameter,'vertical angle leg must contain the bolt and washer.');
    add(top.leg*.35<top.boltDiameter||top.leg*.65<top.thickness+top.boltDiameter,'horizontal angle leg must contain the lap bolt and washer.');
    const headDepth=top.shimThickness+top.thickness+top.washerThickness+top.boltDiameter*.81;
    add(top.shimThickness+top.leg*.65-top.boltDiameter<headDepth+3.175,'lap bolt hardware must clear the column bolt heads. Increase angle leg size.');
    add(top.columnEnd<=top.edge||top.boltZ-top.holeDiameter/2<=top.edge,'column angle lap bolts must lie outside the girder flange/cap edge.');
    const railEdge=Math.abs(p.railEccentricity)+(d.rail.baseWidth/2+d.rail.clipProjection+d.rail.clipWeld);
    add(top.edge-top.lap<railEdge+6.35,'tie-plate overlap must clear the rail and keeper/weld envelope. Reduce overlap or use a wider top element.');
    add(top.weldSize>=Math.min(top.plateThickness,p.section.kind==='cap'?p.section.capTw:p.section.tf),'reference flange weld must be smaller than the connected plate thicknesses.');
    add(xs.some(({e,x})=>x-top.width/2-top.weldSize<e.start-1e-6||x+top.width/2+top.weldSize>e.finish+1e-6),'top tie plate and welds must stay within their own girder end.');
    add(!!b&&offsets.some(x=>Math.abs(x)+top.width/2>b.receiver.width/2),'top angles and shims must fit within the receiving column flange.');
    add(!!b&&offsets.some(x=>[-1,1].some(sx=>Math.abs(x+sx*top.boltPitch/2)<b.receiver.webThickness/2+top.boltDiameter+3.175)),'column bolt nuts must clear the column web.');
    const stations=new Map<number,number[]>();for(const v of xs){const values=stations.get(v.e.station)??[];values.push(v.x);stations.set(v.e.station,values);}
    add([...stations.values()].some(v=>v.sort((x,y)=>x-y).some((x,i)=>i>0&&x-v[i-1]<top.width+2*top.weldSize+6.35)),'adjacent top-flange ties and welds need clearance.');
    return errors;
   }
   add(a.lap>=a.setback,'attachment lap must be shorter than the end setback.');
   add(a.weldSize>=Math.min(a.thickness,a.gussetThickness),'preview weld leg must be smaller than both connected thicknesses.');
   add(!!b&&b.reach-p.section.bf/2-2*a.setback<=2*a.lap,'angle clear length must exceed the two attachment laps.');
   const capDrop=p.section.kind==='cap'?Math.max(0,p.section.capDepth-p.section.capTw-p.section.tf):0;
   add(p.section.d-2*p.section.tf-capDrop-50.8<=2*a.rise,'top and bottom angle assemblies overlap.');
   add((p.section.bf-p.section.tw)/2<=25.4,'flange attachment needs more than 1 in clear outstand.');
   add(a.saddleLength<a.right-a.left,'saddle length must cover the selected angle arrangement width.');
   add(ends.some(e=>{const x=e.center+(e.end==='left'?-1:1)*setback;return x-a.saddleLength/2<e.start-1e-6||x+a.saddleLength/2>e.finish+1e-6;}),'angle saddles must remain within their own girder end bearing regions.');
   const offsets=ends.map(e=>e.center+(e.end==='left'?-1:1)*setback-e.station);
   add(!!b&&(offsets.length?offsets:[0]).some(x=>x+a.left<-b.receiver.width/2||x+a.right>b.receiver.width/2),'angle attachments must fit within the receiving column flange.');
   const stations=new Map<number,number[]>();for(let i=0;i<ends.length;i++){const xs=stations.get(ends[i].station)??[];xs.push(offsets[i]);stations.set(ends[i].station,xs);}
   add([...stations.values()].some(xs=>xs.sort((x,y)=>x-y).some((x,i)=>i>0&&x+a.left<xs[i-1]+a.right+12.7)),'adjacent angle ties need at least 1/2 in separation.');
   return errors;
  }
  if(tie==='paired-links'&&p.system!=='simple')errors.push('details.brace: a double articulated tieback requires separate simple-span girder ends. Use a single link for a continuous girder.');
  const flexible=tie==='flexible-plate',rise=flexible?r.plateWidth:r.eyeDiameter+25.4;
  const capDrop=p.section.kind==='cap'?Math.max(0,p.section.capDepth-p.section.capTw-p.section.tf):0;
  if(b&&b.reach-p.section.bf/2-2*r.pinSetback<=(flexible?76.2:r.eyeDiameter))errors.push('details.brace: insufficient clear link/plate length between girder flange and column. Reduce attachment setback or increase bracket reach.');
  if((p.section.bf-p.section.tw)/2<=25.4)errors.push('details.brace: reference flange saddle requires more than 1 in clear flange outstand.');
  if(p.section.d-2*p.section.tf-capDrop-50.8<=2*rise)errors.push('details.brace: top and bottom reference tie assemblies overlap.');
  const ends=independentBearings(p),setback=d.brace.flangeAttachment?.longitudinalSetback??50.8;
  const saddleLength=Math.max(flexible?r.plateThickness+38.1:r.eyeThickness+2*r.forkThickness+25.4,d.brace.flangeAttachment?.saddleLength??127);
  if(ends.some(e=>{const x=e.center+(e.end==='left'?-1:1)*setback;return x-saddleLength/2<e.start||x+saddleLength/2>e.finish;}))errors.push('details.brace: reference flange saddles must remain within their own girder end bearing regions.');
  if(!flexible){
   if(r.pinSetback<.675*r.eyeDiameter+31.75)errors.push('details.brace: pin setback must fit the clevis and both root plates.');
   if(r.eyeDiameter<=1.5*r.pinDiameter+12.7)errors.push('details.brace: bearing eye must leave at least 1/4 in radial material outside the bearing insert.');
   if(r.linkDiameter>=r.eyeDiameter)errors.push('details.brace: link body must be smaller than the bearing eye.');
   const receiverWidth=r.eyeThickness+2*r.forkThickness+50.8;
   const spacing=tie==='paired-links'?r.linkSpacing:Math.max(0,...ends.map(e=>2*Math.abs(e.center+(e.end==='left'?-1:1)*setback-e.station)));
   if(b&&spacing+receiverWidth>b.receiver.width)errors.push('details.brace: tie clevises and shared receiver plate must fit within the receiving column flange.');
   if(tie==='paired-links'&&r.linkSpacing<r.eyeThickness+2*r.forkThickness+39.4)errors.push('details.brace: shared clevis spacing must clear both pin assemblies and retaining collars.');
  }
 }
 return errors;
}

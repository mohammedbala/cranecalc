import type {CheckResult,ProjectInput} from './types';
import type {RunwayDetails} from './runwayDetails';
import {emptyAistInputs} from './aistLoads';
import {defaultSimpleSupport} from './simpleSupports';
import {defaultEndBearing} from './endBearingInputs';
import {defaultEndStop,needsGirderStops} from './endStopInputs';
import {wrenchClearance} from './endStop';
import {columnGussetHeight,tieBarGap} from './tieGeometry';
import {aiscShapeByName} from '../data/aiscSections';
import {keeperGeometry} from './railSeat';

const inch=25.4,ksi=6.894757293;
/** Marker for inputs the template cannot know; any string starting with it blocks eligibility. */
export const toBeEntered='TO BE ENTERED:';
const up=(v:number,step:number)=>Math.ceil(v/step-1e-9)*step,down=(v:number,step:number)=>Math.max(step,Math.floor(v/step+1e-9)*step);

/**
 * Neutral detailed connection inputs sized from the project's girder and
 * spans, for a project started without the demonstration data. Nothing is
 * presented as confirmed: the rail, pad and supplier items are marked to be
 * entered, and the whole set needs the engineer's review before export.
 */
export function neutralDetails(p:ProjectInput):RunwayDetails{
 const b=p.section,shape=aiscShapeByName(b.catalogueId??''),k1=b.tw/2+(shape?shape.kdes*inch-b.tf:0);
 const stiffenerWidth=down((b.bf-b.tw)/2-.25*inch,.25*inch),stiffenerThickness=up(Math.max(b.tf/2,stiffenerWidth/16,.5*inch),.125*inch);
 const h=p.railHeight||p.aist?.railDepth||100,L=p.spans.reduce((a,v)=>a+v,0),longest=Math.max(...p.spans);
 // Fatigue register: bottom flange at each midspan, stiffener weld toes at each support, top flange in the longest bay.
 let x=0;const mids=p.spans.map(span=>{const m=x+span/2;x+=span;return m;}),grids=[0,...p.spans.map((_,i)=>p.spans.slice(0,i+1).reduce((a,v)=>a+v,0))];
 const register=[
  ...mids.map((m,i)=>({id:`FB${i+1}`,name:`Bottom flange, bay ${i+1} midspan`,x:m,point:'bottom-left' as const,category:'A' as const,reference:'AISC 360 Table A-3.1, 1.1 · plain rolled base metal'})),
  ...grids.map((g,i)=>({id:`FS${i+1}`,name:`Bearing stiffener weld toe, grid ${i+1}`,x:Math.min(g,L),point:'top-right' as const,category:'C' as const,reference:'AISC 360 Table A-3.1, 5.7 · transverse stiffener weld toe'})),
  {id:'FT1',name:'Top flange at longest-bay midspan, category D',x:mids[p.spans.indexOf(longest)],point:'top-right' as const,category:'D' as const,reference:'AISC 360 Table A-3.1 · conservative top-flange comparison point; keeper stations are checked automatically'}
 ].slice(0,16);
 // Top-flange tie on a direct flange saddle (simple spans): thin bars flex with end rotation and thermal travel,
 // sleeved bolts in vertical slots at the column gusset release support deflection. The column face is a placeholder.
 const simple=p.system==='simple',weld=.3125*inch,webGap=1*inch,rootStart=b.tw/2+webGap,saddle={length:3.5*inch,thickness:up(Math.max(1.5*inch,b.tf),.125*inch)};
 const tieConnection=2.25*inch+2*1.25*inch,tieStart=up(Math.max(rootStart+.5*inch,b.bf/2-tieConnection+.25*inch),.25*inch),tieLength=26*inch;
 const tieSetback=up(saddle.length/2+weld+stiffenerThickness/2+weld+.25*inch,.25*inch),bearingLength=12*inch;
 // Stop bolts clear the runway-end tie saddle and the bearing stiffener with nut clearance.
 const stopEdge=defaultEndStop.bolts.edge,C=wrenchClearance(defaultEndStop.bolts.diameter);
 const stopSetback=up(Math.max(bearingLength/2-tieSetback+saddle.length/2+weld,bearingLength/2+stiffenerThickness/2+weld)+C-stopEdge,.25*inch);
 const details:RunwayDetails={
  material:{Fy:50*ksi,Fu:65*ksi,Fexx:70*ksi},
  simpleSupport:{...defaultSimpleSupport,guideTravel:.5*inch},
  brace:{width:5*inch,thickness:.375*inch,length:tieLength,reach:tieLength,gussetThickness:.75*inch,connectionLength:up(tieStart+tieConnection-rootStart,.25*inch),
   connection:{rows:2,gauge:2.5*inch,pitch:2.25*inch,edge:1.25*inch,thickness:.375*inch,diameter:.625*inch,grade:'A325',surface:'B',projection:1.5*inch,weldSize:weld,weldLength:5*inch},
   ...(simple?{flangeAttachment:{enabled:true,longitudinalSetback:tieSetback,saddleLength:saddle.length,saddleThickness:saddle.thickness,webGap,clearance:.25*inch,weldSize:weld,columnFace:tieStart+tieLength+tieBarGap(weld)}}:{}),
   release:{enabled:true,travel:.125*inch,sleeveWall:.25*inch,clearance:.0625*inch}},
  end:{rows:4,gauge:2.875*inch,pitch:3*inch,edge:1.25*inch,thickness:.75*inch,diameter:.75*inch,grade:'A325',surface:'B',projection:1.5*inch,weldSize:.3125*inch,weldLength:11.5*inch},
  bearing:{width:up(b.bf+2*inch,.5*inch),length:bearingLength,thickness:1*inch,stiffenerWidth,stiffenerThickness,cope:up(Math.max(k1-b.tw/2,.75*inch),.125*inch),weldSize:.3125*inch},
  // Proportions of a typical crane rail of the entered depth; replace with the supplier's section.
  rail:{name:`${toBeEntered} rail designation and supplier`,headWidth:up(.55*h,1.5875),headThickness:up(.3*h,1.5875),baseWidth:up(h,1.5875),baseThickness:up(.17*h,1.5875),webThickness:up(.12*h,1.5875),Fy:60*ksi,Fu:90*ksi,padAllowable:10,padSource:`${toBeEntered} rail pad rating source`,
   padThickness:.25*inch,padWidth:up(h,1.5875),
   // Keeper under 4 in long (AISC Table A-3.1 Category D at the flange), 1/16 in clear of the rail-base toe, lip overlapping 1/2 in.
   clipWidth:3.875*inch,clipThickness:.75*inch,clipBodyWidth:2*inch,clipClearance:inch/16,clipProjection:.5625*inch,clipWeld:.3125*inch,anchorNotch:.5*inch,jointGap:.375*inch,jointPlateThickness:1*inch,jointPlateHeight:up(.55*h,1.5875),jointBoltDiameter:.875*inch,jointPitch:3*inch,jointEdge:1.5*inch,temperatureRange:30},
  criteria:{twistLimit:.005,railLateralLimit:400,railGauge:p.details?.criteria.railGauge??12192,alignmentTolerance:.125*inch,levelTolerance:.125*inch,rotationClearance:.5*inch,temperatureMaximum:50,corrosionProtected:true},
  fatigueDetails:register,
  spectrum:[{name:'All cycles at rated lift',liftFraction:1,cycles:p.fatigue.cycles}],
  fabrication:{
   steel:'Runway girder per the section shown; plates, bars and stiffeners ASTM A572 Grade 50 unless noted.',
   bolting:'ASTM F3125 Grade A325, pretensioned, Class B faying surfaces, standard holes unless slots are detailed. Sliding-end bearing bolts and column-end tie bolts pretensioned against steel sleeves. Rail-joint bolts snug-tight.',
   welding:'E70XX low-hydrogen electrodes per AWS D1.1, cyclically loaded provisions. Continuous fillets as dimensioned; no intermittent welds on cyclic load paths. Smooth starts and stops.',
   inspection:'Visual inspection of all welds; magnetic particle testing of fillets at fatigue-sensitive attachments; ultrasonic testing of CJP welds; bolt pretension verification per RCSC.',
   erection:'Set and level the bearings, install the end bearings and flange ties, then set the rails. Provide temporary restraint until the permanent ties are complete.',
   railAlignment:'Set the rails to the specified gauge, alignment and level tolerances and survey them after erection, before the load test.'
  },
  // Bolted bearings: each bay locates at its left end on simple spans; a continuous girder locates at one support.
  endBearing:{...structuredClone(defaultEndBearing),enabled:true},
  // The stop sits inboard of the runway-end tie saddle.
  ...(needsGirderStops(p)?{endStop:{...structuredClone(defaultEndStop),enabled:true,setback:stopSetback,base:{...defaultEndStop.base,length:11.5*inch},stiffener:{...defaultEndStop.stiffener,length:8.5*inch},source:`${toBeEntered} crane supplier bumper force, height and contact diameter`}}:{}),
  reviewed:false
 };
 // Root fillets run the full column gusset height, which contains the release slots.
 details.brace.connection.weldLength=columnGussetHeight({...p,details});
 return details;
}

/** The project with neutral detailed inputs added; the crane, girder and loads are kept. */
export function startDetailedDesign(p:ProjectInput):ProjectInput{
 const q=structuredClone(p),longest=Math.max(...q.spans);
 q.reportPurpose='project';q.scope='design';q.connections.enabled=true;
 q.aist??={...emptyAistInputs,railDepth:q.railHeight,bottomBraceSpacing:longest,axialLength:longest,torsionalLength:longest,clipSpacing:24*inch};
 if(!q.aist.railDepth)q.aist.railDepth=q.railHeight;
 q.details=neutralDetails(q);
 // Design for at least the rail setting allowance the drawings permit plus the float the keepers allow.
 q.railEccentricity=Math.sign(q.railEccentricity||1)*Math.max(Math.abs(q.railEccentricity),q.details.criteria.alignmentTolerance+keeperGeometry(q.details.rail).clearance);
 q.aist.bearingLength||=q.details.bearing.length;q.aist.netFlangeArea||=q.section.bf*q.section.tf;
 q.drawing??={originator:'',checker:'',datumElevation:0,datumLabel:'Finished floor'};
 return q;
}

const demoMarker=/\b(fictitious|fictional|demonstration|demo)\b/i;
/** Text fields that print in the package, by label. */
function packageText(p:ProjectInput):[string,string|undefined][]{
 const d=p.details;
 return [['Project title',p.title],['Project number',p.number],['Notes',p.notes],['Criteria source',p.criteriaSource],['Drawing originator',p.drawing?.originator],['Datum description',p.drawing?.datumLabel],
  ...p.cranes.flatMap((c,i)=>[[`Crane ${i+1} name`,c.name],[`Crane ${i+1} load source`,c.loadSource],[`Crane ${i+1} service`,c.operatingClass],[`Crane ${i+1} side-thrust distribution source`,c.design?.distributionSource]] as [string,string|undefined][]),
  ['AIST fatigue reference',p.aist?.fatigueReference],['AIST cycle source',p.aist?.cycleSource],['Fatigue detail',p.fatigue.detail],['Cap fit-up note',p.capDesign?.fitupNote],
  ['Rail designation',d?.rail.name],['Rail pad source',d?.rail.padSource],...Object.entries(d?.fabrication??{}).map(([k,v])=>[`Fabrication ${k}`,v] as [string,string]),
  ...(d?.fatigueDetails??[]).map(f=>[`Fatigue point ${f.id}`,`${f.name} ${f.reference}`] as [string,string]),
  ['Cap material source',p.capDesign?.materialSource],['Cap duty source',p.capDesign?.dutySource],['Existing column source',p.existingColumn?.source],['Bracing source',p.longitudinalBracing?.source],['End stop source',d?.endStop?.source],['Bracket receiver source',d?.bracket?.receiver.source]];
}
/**
 * Package-issuance gates: demonstration wording cannot reach a project
 * package, template placeholders must be replaced, and template details must
 * be reviewed by the engineer.
 */
export function packageContentChecks(p:ProjectInput):CheckResult[]{
 const checks:CheckResult[]=[],fields=packageText(p).filter(([,v])=>v?.trim());
 if(p.reportPurpose!=='demonstration'){
  const demo=fields.filter(([,v])=>demoMarker.test(v!)).map(([k])=>k);
  if(demo.length)checks.push({id:'project-content',group:'Detailing',title:'Demonstration wording in a project package',status:'incomplete',equation:'',referenceIds:['criteria'],note:`Replace demonstration or fictitious wording before issue: ${demo.slice(0,8).join(', ')}${demo.length>8?` and ${demo.length-8} more`:''}.`});
 }
 const pending=fields.filter(([,v])=>v!.trim().toUpperCase().startsWith(toBeEntered)).map(([k])=>k);
 if(pending.length)checks.push({id:'detail-placeholders',group:'Detailing',title:'Detailed inputs still to be entered',status:'incomplete',equation:'',referenceIds:['criteria'],note:`Enter: ${pending.join(', ')}.`});
 if(p.details?.reviewed===false)checks.push({id:'detail-review',group:'Detailing',title:'Generated detailed inputs reviewed',status:'unverified',equation:'',referenceIds:['criteria'],note:'The detailed connection inputs were generated from the girder and spans. Review every value against the project (rail section, rail gauge, tolerances, bearing and tie sizes, fatigue register, duty spectrum, fabrication notes) and confirm the review under Connections.'});
 return checks;
}

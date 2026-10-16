import type {CheckResult,ProjectInput} from './types';
import type {RunwayDetails} from './runwayDetails';
import {emptyAistInputs} from './aistLoads';
import {defaultSimpleSupport} from './simpleSupports';
import {defaultEndBearing} from './endBearingInputs';
import {bearingLayout,applyBearingLayout} from './endBearing';
import {defaultEndStop,needsGirderStops} from './endStopInputs';
import {wrenchClearance} from './endStop';
import {railSeatDefaults,defaultRailClip} from './railSeat';
import {columnGussetHeight,tieBarGap,tieRelease} from './tieGeometry';
import {aiscShapeByName} from '../data/aiscSections';
import {sizeCapAngle,capAngleForceEstimate} from './capAngleTie';
import {sizeFlangeTie,tieSizingDemands,tieOnBearingStiffener} from './flangeTieSizing';
import {available} from './aiscStrength';
import {minimumEdge} from './capAngle';
import {minimumFillet} from './connectionStrength';
import {stiffenerPairSection} from './detailChecks';
/** Template sizing of the tapered I haunch for the project's reactions. */
export {sizeTaperedHaunch} from './taperedHaunchSizing';

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
 // Bearing stiffener pair: the J10.8 proportions, and thick enough for the restraint diaphragm (stiffener-lateral-flexure)
 // at 90% under the tie sizing estimate F. The pair, welded continuously to both web faces, is one plate of width
 // 2b_s + t_w less the copes (stiffenerPairSection). Before the analysis the support torque is unknown, so the moment is
 // bounded by F·h_o whatever the arrangement: it bounds the St Venant torque with the Appendix 6 couple (both flanges
 // restrained directly), F·y_g plus that torque (a gusset tie) and the cantilever F·h (one flange restrained).
 const stiffenerWidth=down((b.bf-b.tw)/2-.25*inch,.25*inch),stiffenerCope=up(Math.max(k1-b.tw/2,.75*inch),.125*inch);
 const demands=tieSizingDemands(p),diaphragm=demands.force*(b.d-b.tf)/(stiffenerPairSection({stiffenerWidth,stiffenerThickness:1,cope:stiffenerCope},b.tw).S*.9*available(50*ksi,p.method,.9,1.67));
 const stiffenerThickness=up(Math.max(b.tf/2,stiffenerWidth/16,.5*inch,diaphragm),.125*inch);
 const h=p.railHeight||p.aist?.railDepth||100,L=p.spans.reduce((a,v)=>a+v,0),longest=Math.max(...p.spans);
 // Fatigue register: bottom flange at each midspan, stiffener weld toes at each support, top flange in the longest bay.
 let x=0;const mids=p.spans.map(span=>{const m=x+span/2;x+=span;return m;}),grids=[0,...p.spans.map((_,i)=>p.spans.slice(0,i+1).reduce((a,v)=>a+v,0))];
 const register=[
  ...mids.map((m,i)=>({id:`FB${i+1}`,name:`Bottom flange, bay ${i+1} midspan`,x:m,point:'bottom-left' as const,category:'A' as const,reference:'AISC 360 Table A-3.1, 1.1 · plain rolled base metal'})),
  ...grids.map((g,i)=>({id:`FS${i+1}`,name:`Bearing stiffener weld toe, grid ${i+1}`,x:Math.min(g,L),point:'top-right' as const,category:'C' as const,reference:'AISC 360 Table A-3.1, 5.7 · transverse stiffener weld toe'})),
  {id:'FT1',name:'Top flange at longest-bay midspan, category D',x:mids[p.spans.indexOf(longest)],point:'top-right' as const,category:'D' as const,reference:'AISC 360 Table A-3.1 · top-flange comparison point; rail clip stations are checked automatically'}
 ].slice(0,16);
 // Top-flange tie on a direct flange saddle (simple spans): thin bars flex with end rotation and thermal travel,
 // sleeved bolts in vertical slots at the column gusset release support deflection. The column face is a placeholder.
 // The saddle fillets carry the tie force in fatigue across the flange: 3/8 in, as on the demonstration runway.
 // The saddle starts on the 1/4 in grid from the web centerline, at least 3/4 in and 1/4 in past the rolled fillet clear of the web.
 const simple=p.system==='simple',weld=.3125*inch,saddleWeld=.375*inch,rootStart=up(Math.max(b.tw/2+.75*inch,k1+.25*inch),.25*inch),webGap=rootStart-b.tw/2,saddle={length:3.5*inch,thickness:up(Math.max(1.5*inch,b.tf),.125*inch)};
 const tieConnection=2.25*inch+2*1.25*inch,tieStart=up(Math.max(rootStart+.5*inch,b.bf/2-tieConnection+.25*inch),.25*inch),tieLength=26*inch;
 // The tie sits far enough from the bearing stiffener that the saddle end fillet clears the stiffener and its fillets by
 // 1/4 in (the flange-tie-stiffener-clearance rule, with the 5/16 in largest stiffener fillet).
 const tieSetback=up(saddle.length/2+saddleWeld+stiffenerThickness/2+weld+.25*inch,.25*inch);
 // Stop bolts clear the runway-end tie saddle and the bearing stiffener with nut clearance.
 const stopEdge=defaultEndStop.bolts.edge,C=wrenchClearance(defaultEndStop.bolts.diameter);
 // Rail joint bars fill 95% of the clear web between head and base, to the 1/4 in below; the joint bolt is the
 // largest that keeps the AISC J3.4 edge distance to both bar edges (holes on the bars' mid-height).
 const jointHeight=Math.floor(.95*(h-up(.3*h,1.5875)-up(.17*h,1.5875))/6.35)*6.35;
 const jointBolt=[.875,.75,.625,.5].map(v=>v*inch).find(db=>2*minimumEdge(db)<=jointHeight+1e-6)??.5*inch;
 // Bearing stiffener fillets: the J2.4 minimum by the thinner part; else 5/16 in, within the edge limit t - 1/16 in of the
 // thinner of the web and the stiffener, and no larger than the smallest fillet that develops the web in shear rupture
 // with fillets on both faces, D = t_w F_u/(1.414 F_EXX) to the next 1/16 in (t_w = 6.19D/F_u for E70, AISC J4.2): a larger
 // fillet adds no strength to the group (the web governs it), a smaller one would lower it below the web's.
 const webMatch=Math.ceil(b.tw*b.Fu/(Math.SQRT2*70*ksi)/(inch/16)-1e-9)*inch/16;
 const stiffenerWeld=Math.max(minimumFillet(Math.min(b.tw,stiffenerThickness)),Math.min(.3125*inch,Math.floor((Math.min(b.tw,stiffenerThickness)-inch/16)/(inch/16)+1e-9)*inch/16,webMatch));
 // The bolted bearing sized for the girder (bearingLayout): the slot travel for the span and end rotation, the bolt whose
 // sliding slot keeps the J3.3 long-slot proportion, the gauge narrowing on a narrow flange for the J3.4 edge distance, and
 // the plate length from the bolt layout, the J10 end bearing and the flange saddle, width and thickness.
 // On a narrow flange the stop bolts keep 1.5d edges; the stop stiffeners close up to keep the tightening clearance at
 // their weld toes, and the stop base keeps its 1.5d edges.
 const bearing=bearingLayout(p,{rotation:demands.rotation,lateral:demands.force,stiffenerThickness,stiffenerWeld,saddle:simple?{setback:tieSetback,length:saddle.length,weld:saddleWeld}:undefined}),bearingLength=bearing.length;
 // The stop base sits on the top flange: at most the flange width, the bolts 1.5d inside its edges.
 const sd=defaultEndStop.bolts.diameter,stopBase=Math.min(defaultEndStop.base.width,down(b.bf,.25*inch)),stopGauge=Math.min(defaultEndStop.bolts.gauge,down(stopBase-3*sd,.25*inch));
 const stopStiffener=stopGauge<defaultEndStop.bolts.gauge?.5*inch:defaultEndStop.stiffener.thickness;
 const stop={gauge:stopGauge,baseWidth:stopBase,thickness:stopStiffener,spacing:Math.min(defaultEndStop.stiffener.spacing,down(stopGauge-stopStiffener-2*(defaultEndStop.weldSize+C),.25*inch))};
 const stopSetback=up(Math.max(bearingLength/2-tieSetback+saddle.length/2+saddleWeld,bearingLength/2+stiffenerThickness/2+weld)+C-stopEdge,.25*inch);
 const details:RunwayDetails={
  material:{Fy:50*ksi,Fu:65*ksi,Fexx:70*ksi},
  simpleSupport:{...defaultSimpleSupport,guideTravel:bearing.travel},
  brace:{width:5*inch,thickness:.375*inch,length:tieLength,reach:tieLength,gussetThickness:.75*inch,connectionLength:up(tieStart+tieConnection-rootStart,.25*inch),
   connection:{rows:2,gauge:2.5*inch,pitch:2.25*inch,edge:1.25*inch,thickness:.375*inch,diameter:.625*inch,grade:'A325',surface:'B',projection:1.5*inch,weldSize:weld,weldLength:5*inch},
   ...(simple?{flangeAttachment:{enabled:true,longitudinalSetback:tieSetback,saddleLength:saddle.length,saddleThickness:saddle.thickness,webGap,clearance:.25*inch,weldSize:saddleWeld,columnFace:tieStart+tieLength+tieBarGap(saddleWeld)}}:{}),
   release:{enabled:true,travel:.125*inch,sleeveWall:.25*inch,clearance:.0625*inch}},
  end:{rows:4,gauge:2.75*inch,pitch:3*inch,edge:1.25*inch,thickness:.75*inch,diameter:.75*inch,grade:'A325',surface:'B',projection:1.5*inch,weldSize:.3125*inch,weldLength:11.5*inch},
  bearing:{width:bearing.width,length:bearingLength,thickness:bearing.thickness,stiffenerWidth,stiffenerThickness,cope:up(Math.max(k1-b.tw/2,.75*inch),.125*inch),weldSize:stiffenerWeld},
  // Proportions of a typical crane rail of the entered depth; replace with the supplier's section. The joint bars fill
  // 95% of that section's clear web between head and base, to the 1/4 in below.
  rail:{name:`${toBeEntered} rail designation and supplier`,headWidth:up(.55*h,1.5875),headThickness:up(.3*h,1.5875),baseWidth:up(h,1.5875),baseThickness:up(.17*h,1.5875),webThickness:up(.12*h,1.5875),Fy:60*ksi,Fu:90*ksi,padAllowable:10,padSource:`${toBeEntered} rail pad rating source`,
   padThickness:.25*inch,padWidth:up(h,1.5875),
   // Rail clips: the manufacturer's data are entered by the engineer; until then the placeholder clip (weld-on, 3 3/4 in
   // base, 5/16 in base welds) lays out the stations and every clip check is unverified.
   clip:{...structuredClone(defaultRailClip),product:`${toBeEntered} rail clip manufacturer and series (or equal), rated lateral and uplift capacity per clip`},
   jointGap:inch/16,jointPlateThickness:1*inch,jointPlateHeight:jointHeight,jointBoltDiameter:jointBolt,jointPitch:3*inch,jointEdge:1.5*inch,temperatureRange:30},
  criteria:{...(p.details?.criteria.twistLimit?{twistLimit:p.details.criteria.twistLimit}:{}),railLateralLimit:400,railGauge:p.details?.criteria.railGauge??12192,alignmentTolerance:.125*inch,levelTolerance:.125*inch,rotationClearance:.5*inch,temperatureMaximum:50,corrosionProtected:true},
  fatigueDetails:register,
  spectrum:[{name:'All cycles at rated lift',liftFraction:1,cycles:p.fatigue.cycles}],
  fabrication:{
   steel:'Runway girder per the section shown; plates, bars and stiffeners ASTM A572 Grade 50 unless noted.',
   bolting:'ASTM F3125 Grade A325, pretensioned, Class B faying surfaces, standard holes unless slots are detailed. Sliding-end bearing bolts and column-end tie bolts pretensioned against steel sleeves. Rail joints tight (gap 1/16 in max.), joint bolts pretensioned and re-tightened after 30 and 90 days of operation.',
   welding:'E70XX low-hydrogen electrodes per AWS D1.1/D1.1M:2020, cyclically loaded provisions. Continuous fillets as dimensioned; no intermittent welds on cyclic load paths. Smooth starts and stops.',
   inspection:'Visual inspection of all welds; AWS D1.1/D1.1M:2020 cyclically loaded acceptance criteria; magnetic particle testing of fillets at fatigue-sensitive attachments; 100% ultrasonic testing of CJP welds; bolt pretension verification per RCSC.',
   erection:'Set and level the bearings, install the end bearings and flange ties, then set the rails. Provide temporary restraint until the permanent ties are complete.',
   railAlignment:'Set the rails to the specified gauge, alignment and level tolerances and survey them after erection, before the load test.'
  },
  // Bolted bearings: each bay locates at its left end on simple spans; a continuous girder locates at one support.
  // The gauge narrows on a narrow flange so the sleeved slots keep the J3.4 edge distance.
  endBearing:{...structuredClone(defaultEndBearing),enabled:true,bolts:{...defaultEndBearing.bolts,...bearing.bolts},...(bearing.sleeveWall>5/16*inch+1e-9?{sleeveWall:bearing.sleeveWall}:{})},
  // The stop sits inboard of the runway-end tie saddle.
  // The face plate holds the whole bumper above the rail and its pad, with 1/2 in to spare, in whole inches.
  ...(needsGirderStops(p)?{endStop:{...structuredClone(defaultEndStop),enabled:true,setback:stopSetback,base:{...defaultEndStop.base,length:11.5*inch,width:stop.baseWidth},face:{...defaultEndStop.face,height:up((p.aist?.railDepth??p.railHeight)+(p.aist?.railPad?railSeatDefaults.padThickness:0)+defaultEndStop.bumperHeight-defaultEndStop.base.thickness+defaultEndStop.bumperDiameter/2+.5*inch,inch)},stiffener:{...defaultEndStop.stiffener,length:8.5*inch,spacing:stop.spacing,thickness:stop.thickness},bolts:{...defaultEndStop.bolts,gauge:stop.gauge},source:`${toBeEntered} crane supplier bumper force, height and contact diameter`}}:{}),
  reviewed:false
 };
 // Sleeved slots at the column end: the bolt gauge keeps the required material between the slots of a row, and the
 // bars contain that gauge and both edge distances, in 1/4 in steps.
 const tie=details.brace,c=tie.connection,release=tieRelease({...p,details});
 if(release){c.gauge=Math.max(c.gauge,release.minimumGauge);tie.width=Math.max(tie.width,up(c.gauge+2*c.edge,.25*inch));}
 // Root fillets run the full column gusset height, which contains the release slots.
 c.weldLength=columnGussetHeight({...p,details});
 // A capped girder of independent spans takes the cap tieback angle bolted to the channel cap (AISC DG7), sized in
 // standard increments for the estimated tie force; the bolted end bearings restrain the bottom flange.
 if(b.kind==='cap'&&simple){tie.arrangement='cap-angle';tie.capAngle=sizeCapAngle({...p,details},capAngleForceEstimate(p));}
 return details;
}

/** The project with neutral detailed inputs added; the crane, girder and loads are kept. */
export function startDetailedDesign(p:ProjectInput):ProjectInput{
 const q=structuredClone(p),longest=Math.max(...q.spans);
 q.reportPurpose='project';q.scope='design';q.connections.enabled=true;
 q.aist??={...emptyAistInputs,railDepth:q.railHeight,bottomBraceSpacing:longest,axialLength:longest,torsionalLength:longest,clipSpacing:24*inch};
 if(!q.aist.railDepth)q.aist.railDepth=q.railHeight;
 q.details=neutralDetails(q);
 // Design for at least the rail setting allowance the drawings permit plus 1/16 in of lateral play at the rail clips.
 q.railEccentricity=Math.sign(q.railEccentricity||1)*Math.max(Math.abs(q.railEccentricity),q.details.criteria.alignmentTolerance+inch/16);
 q.aist.bearingLength||=q.details.bearing.length;
 // Net flange area: the gross flange (no holes) unless entered, and never more than the current section's flange,
 // so a value left from another section does not block validation.
 q.aist.netFlangeArea=Math.min(q.aist.netFlangeArea||Infinity,q.section.bf*q.section.tf);
 q.drawing??={originator:'',checker:'',datumElevation:0,datumLabel:'Finished floor'};
 // The tie sized for the girder's tie force and imposed movements; the column face may move out to 30 in.
 q.details=sizeFlangeTie(q,{reach:30*inch}).details;
 // A rolled simple-span saddle that cannot pass, or on a high-cycle runway, gives way to bars on the bearing stiffener;
 // the bearing then needs no room for the saddle.
 const cmaa=q.cranes.map(c=>c.design?.cmaaClass).find(c=>c&&['D','E','F'].includes(c)),cls=q.aist.buildingClass==='A'||q.aist.buildingClass==='B'?q.aist.buildingClass:undefined;
 const moved=tieOnBearingStiffener(q,{reach:30*inch,highCycle:cmaa||cls?[cmaa?`CMAA Class ${cmaa}`:'',cls?`AIST Class ${cls}`:''].filter(Boolean).join(', '):undefined});
 if(moved){q.details=moved.details;applyBearingLayout(q,tieSizingDemands(q).rotation,tieSizingDemands(q).force);}
 return q;
}

const demoMarker=/\b(fictitious|fictional|demonstration|demo)\b/i;
/** Text fields that print in the package, by label. */
function packageText(p:ProjectInput):[string,string|undefined][]{
 const d=p.details;
 return [['Project title',p.title],['Project number',p.number],['Notes',p.notes],['Criteria source',p.criteriaSource],['Drawing originator',p.drawing?.originator],['Datum description',p.drawing?.datumLabel],
  ...p.cranes.flatMap((c,i)=>[[`Crane ${i+1} name`,c.name],[`Crane ${i+1} load source`,c.loadSource],[`Crane ${i+1} service`,c.operatingClass],[`Crane ${i+1} side-thrust distribution source`,c.design?.distributionSource]] as [string,string|undefined][]),
  ['AIST fatigue reference',p.aist?.fatigueReference],['AIST cycle source',p.aist?.cycleSource],['Fatigue detail',p.fatigue.detail],['Cap fit-up note',p.capDesign?.fitupNote],
  ['Rail designation',d?.rail.name],['Rail pad source',d?.rail.padSource],['Rail clip manufacturer',d?.rail.clip?.product],...Object.entries(d?.fabrication??{}).map(([k,v])=>[`Fabrication ${k}`,v] as [string,string]),
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

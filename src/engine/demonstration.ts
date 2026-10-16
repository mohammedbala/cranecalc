import {defaultEndStop} from './endStopInputs';
import {defaultEndBearing} from './endBearingInputs';
import {defaultBracket} from './bracketInputs';
import {initialColumnStiffeners,receiverK} from './columnStiffenerInputs';
import {emptyCapDesign} from './capDesignInputs';
import {loadCappedSection} from '../data/aiscChannels';
import { exampleProject } from './defaults';
import { loadAiscSection } from '../data/aiscSections';
import { emptyAistInputs,emptyCraneDesign } from './aistLoads';
import type { ProjectInput } from './types';
import type { LapConnection,RunwayDetails } from './runwayDetails';
import {defaultSimpleSupport} from './simpleSupports';
import {defaultExistingColumn,defaultExistingLine} from './existingColumnInputs';
import {defaultBracingDesign,defaultLongitudinalBracing} from './longitudinalBracingInputs';
import {defaultColumnBase} from './columnBaseInputs';
import {columnBaseElevation} from './columnBase';
import {aiscShapeByName} from '../data/aiscSections';
import {railTopAboveSteel} from './railSeat';
const inch=25.4,foot=304.8,kip=4448.221615,ksi=6.894757293;
const lap=():LapConnection=>({rows:2,gauge:3*inch,pitch:3*inch,edge:1.5*inch,thickness:.5*inch,diameter:.75*inch,grade:'A325',surface:'B',projection:2*inch,weldSize:.25*inch,weldLength:6*inch});
/**
 * Fictitious rail clip supplier data for the demonstrations (marked as such; no real product or rating): a weld-on,
 * floating crane rail clip for a 6 in rail, rated 10 kip lateral and 5 kip uplift per clip on an allowable (working
 * load) basis; base 3 3/4 in along the rail, 2 1/2 in across, 3/4 in thick; welded across both ends of the base. The
 * light series (RC-W6L, for the 2-ton capped example) is 2 in across, rated 6 kip lateral and 3 kip uplift.
 */
export function demonstrationClip(weld:number,light=false):NonNullable<RunwayDetails['rail']['clip']>{
 const across=(light?2:2.5)*inch;
 return {type:'weld-on',product:`Fictitious supplier data ${light?'RC-W6L':'RC-W6'}: weld-on floating crane rail clip for a 6 in rail, or equal`,basis:'allowable',
  lateral:(light?6:10)*kip,uplift:(light?3:5)*kip,baseLength:3.75*inch,baseWidth:across,baseThickness:.75*inch,weld,weldLength:across};
}
export function demonstrationDetails():RunwayDetails{return {
 material:{Fy:50*ksi,Fu:65*ksi,Fexx:70*ksi},
 simpleSupport:{...defaultSimpleSupport},
 // The direct flange saddle (used where a project selects it, e.g. the flexible plate): sized for the tie force at the
 // tie line, a 2 in saddle (its plate fatigue), 1/2 in end fillets and a 7/8 in gusset (their fatigue). The 10-ton
 // demonstration itself ties the girder at its bearing stiffener (demonstrationProject).
 // Top-flange tie on a direct flange saddle; the bottom flange is bolted to the seat. Thin bars flex with end
 // rotation and thermal travel; sleeved bolts in vertical slots at the column gusset release support deflection.
 // The 2 3/4 in gauge leaves the required material between the 1 1/2 in slots with the slot location tolerance;
 // the bars hold that gauge and two 1 1/4 in edges. The root fillets run the 5 3/4 in column gusset height.
 brace:{width:5.25*inch,thickness:.375*inch,length:25.5*inch,reach:25.5*inch,gussetThickness:.875*inch,connectionLength:5.75*inch,
  connection:{...lap(),diameter:.625*inch,gauge:2.75*inch,pitch:2.25*inch,edge:1.25*inch,thickness:.375*inch,weldSize:.3125*inch,weldLength:5.75*inch},
  flangeAttachment:{enabled:true,longitudinalSetback:3.5*inch,saddleLength:4*inch,saddleThickness:2*inch,webGap:.75*inch,clearance:.25*inch,weldSize:.5*inch,columnFace:28*inch},
  release:{enabled:true,travel:.125*inch,sleeveWall:.25*inch,clearance:.0625*inch}},
 // Cover plates (gauge + two edges) clear the bearing stiffener and its welds at half the bearing length.
 end:{...lap(),rows:4,gauge:2.75*inch,edge:1.25*inch,thickness:.75*inch,weldSize:.4375*inch,weldLength:11.5*inch,projection:1.5*inch},
 bearing:{width:12*inch,length:12.5*inch,thickness:1.125*inch,stiffenerWidth:5*inch,stiffenerThickness:1*inch,cope:1*inch,weldSize:.3125*inch},
 rail:{name:'Demo R-6 crane rail · idealized plate geometry',headWidth:3*inch,headThickness:1.25*inch,baseWidth:6*inch,baseThickness:.75*inch,webThickness:.75*inch,Fy:60*ksi,Fu:90*ksi,padAllowable:10,padSource:'Fictitious RP-01 polyurethane crane-rail pad; allowable compression per fictitious supplier rating sheet RP-01',padThickness:.125*inch,padWidth:6*inch,
  // Rail clips: fictitious supplier data (weld-on floating clips, manufacturer's allowable ratings and base weld), see
  // demonstrationClip.
  clip:demonstrationClip(.375*inch),jointGap:inch/16,jointPlateThickness:1.25*inch,jointPlateHeight:3.75*inch,jointBoltDiameter:.875*inch,jointPitch:3*inch,jointEdge:1.5*inch,temperatureRange:30},
 criteria:{twistLimit:.005,railLateralLimit:400,railGauge:40*foot+.5*inch,alignmentTolerance:.125*inch,levelTolerance:.125*inch,rotationClearance:.5*inch,temperatureMaximum:50,corrosionProtected:true},
 fatigueDetails:[
  {id:'F1',name:'Rolled bottom flange at midspan',x:12.5*foot,point:'bottom-left',category:'A',reference:'AISC Table A-3.1, 1.1 · plain rolled base metal'},
  {id:'F2',name:'Top flange at midspan, category D',x:12.5*foot,point:'top-right',category:'D',reference:'AISC Table A-3.1, 7.1 · category D at this comparison point; actual rail clip stations checked automatically'},
  {id:'F3',name:'Bearing stiffener weld toe, left support',x:0,point:'top-left',category:'C',reference:'AISC Table A-3.1, 5.8 · transverse stiffener weld toe'},
  {id:'F4',name:'Bearing stiffener weld toe, right support',x:25*foot,point:'top-right',category:'C',reference:'AISC Table A-3.1, 5.8 · transverse stiffener weld toe'}
 ],
 // Rated-lift cycles: the owner's 75,000 full-load repetitions, two wheel-induced stress cycles each.
 spectrum:[{name:'Rated lifts',liftFraction:1,cycles:150000},{name:'Routine half-load lifts',liftFraction:.5,cycles:650000},{name:'Light lifts',liftFraction:.25,cycles:200000}],
 fabrication:{steel:'Girder ASTM A992; connection plates ASTM A572 Grade 50. Rail grade and geometry per fictional R-6 schedule.',bolting:'ASTM F3125 Grade A325, sizes as detailed, pretensioned to the RCSC Table 8.1 minimum pretension. Standard holes and Class B unpainted faying surfaces unless slots are detailed. Sliding-end bearing bolts and column-end tie bolts are pretensioned against steel sleeves. Rail joints tight (gap 1/16 in max.), joint bolts pretensioned and re-tightened after 30 and 90 days of operation.',welding:'E70XX low-hydrogen welds. Continuous fillets as dimensioned; no intermittent welds on cyclic load paths. Smooth starts/stops and remove temporary welded attachments by grinding.',inspection:'Visual inspection of all welds and bolt installations; verify pretension and faying-surface preparation. AWS D1.1:2020 cyclically loaded acceptance criteria; 100% UT of CJP welds; MT at attachment terminations and repaired welds. Record baseline rail and connection condition before commissioning.',erection:'Provide temporary lateral/torsional restraint until both flange ties are complete. Set bearing plates level, fit bearing stiffeners, and verify end rotation clearance. Do not operate the crane before alignment and supplier commissioning checks.',railAlignment:'Survey both rails unloaded and during commissioning. Record gauge, elevation and straightness at supports and midspan; use the AIST TR-13 §5.18 tolerances, or the crane supplier tolerances where tighter.'}
};}
export function demonstrationProject():ProjectInput {
 const p=structuredClone(exampleProject);
 p.reportPurpose='demonstration';p.reportFormat='compact';p.title='Cedar Works · Three-bay 10-ton crane runway';p.number='DEMO-CR-010';p.engineer='CraneCalc capability demonstration';
 p.section=loadAiscSection(p.section,'W24X229');p.section.Fy=50*ksi;p.section.Fu=65*ksi;p.section.E=29000*ksi;
 p.spans=[25*foot,25*foot,25*foot];p.system='simple';p.scope='design';p.method='LRFD';p.units='US';
 p.deadLoad=0;p.railWeight=.07*kip/foot;p.railEccentricity=.25*inch;p.railHeight=6*inch;
 p.unbracedLength=25*foot;p.lateralBraceSpacing=25*foot;p.verticalLimit=600;p.lateralLimit=400;
 p.criteriaSource='Fictitious owner criteria: AIST Class C, vertical L/600, rail-head lateral L/400; twist 0.005 rad.';
 p.cranes=[{...p.cranes[0],name:'Demo crane CR-1 · 10 US tons',wheels:[{offset:0,loaded:20*kip,unloaded:8*kip,lateral:2*kip},{offset:10*foot,loaded:20*kip,unloaded:8*kip,lateral:2*kip}],impact:.25,includesImpact:false,longitudinal:4*kip,travelStart:-10*foot,travelEnd:75*foot,minSeparation:5*foot,operatingClass:'Fictitious CMAA Class C service; owner AIST Class C building',loadSource:'Fictitious supplier schedule DEMO-CS-01; used solely to demonstrate calculation capabilities',design:{...emptyCraneDesign,control:'cab',type:'maintenance',ratedLoad:20*kip,trolleyWeight:5*kip,bridgeWeight:20*kip,drivenWheelLoad:20*kip,sideShare:.5,distributionSource:'Fictitious supplier distribution: one-half of crane side thrust assigned to this runway',splitConfirmed:true,bumperForce:20*kip,bumperBypassesGirder:false,cmaaClass:'C'}}];
 p.aist={...emptyAistInputs,buildingClass:'C',classConfirmed:true,buildingCycles:75000,railDepth:6*inch,bearingLength:10*inch,netFlangeArea:p.section.bf*p.section.tf,bottomBraceSpacing:25*foot,axialLength:25*foot,torsionalLength:25*foot,runwayOnly:true,supportType:'bracket',clipSpacing:24*inch,railPad:true,camber:0,fatiguePoint:'bottom-left',fatigueReference:'AISC Table A-3.1, 1.1; full detail register in package',cycleSource:'Fictitious 1,000,000 wheel-induced stress fluctuations; three duty bins; includes loaded and empty return cycles.'};
 p.fatigue={category:'A',cycles:1000000,detail:'Plain rolled bottom flange; welded attachments checked separately in the detail register.',location:12.5*foot};
 p.details=demonstrationDetails();p.connections.enabled=true;
 // The rolled W24X229 ties at its bearing stiffener: the bars bolt to a gusset CJP welded to the tie-side bearing
 // stiffener (stiffenerTieGeometry), the stiffener pair carrying the tie force into the girder. With the restraint at the
 // tie line, a saddle 5 in below the flange leaves the rail twist over its limit and the saddle's flange bending and
 // fatigue near theirs; the bars just under the flange keep the twist within it. Proportions as sizeFlangeTie gives
 // them for the 28 in column face: 5/16 x 4 3/4 bars, 3/4 in gussets, 5/8 in bolts at 1 3/4 in pitch, 3/16 in travel.
 {const t=p.details.brace;t.flangeAttachment!.enabled=false;
  Object.assign(t,{width:4.75*inch,thickness:.3125*inch,length:22.25*inch,reach:22.25*inch,gussetThickness:.75*inch,connectionLength:4.25*inch});
  Object.assign(t.connection,{pitch:1.75*inch,edge:inch,thickness:.3125*inch});t.release={...t.release!,travel:.1875*inch};}
 // Bolted end bearings: standard holes at each bay's locating left end, long slots at its sliding right end.
 // A 1/2-in sliding allowance keeps the 3/4-in bolt slots within the AISC J3.2 long-slot limit.
 p.details.endBearing={...structuredClone(defaultEndBearing),enabled:true};p.details.simpleSupport={...p.details.simpleSupport!,guideTravel:.5*inch};
 // Girder-mounted end stops inboard of the runway-end tie saddle: both bolt rows clear the saddle and the bearing
 // stiffeners, and the bolt heads clear the stop weld toes by the socket clearance.
 p.details.endStop={...structuredClone(defaultEndStop),enabled:true,bumperHeight:6*inch,bumperDiameter:6*inch,setback:7*inch,railGap:1*inch,base:{length:12*inch,width:10*inch,thickness:1*inch},face:{thickness:1*inch,height:15*inch},stiffener:{thickness:.75*inch,length:9*inch,spacing:3*inch},bolts:{diameter:.75*inch,grade:'A325',gauge:7*inch,frontClear:1.75*inch,edge:1.5*inch},weldSize:.3125*inch,source:'Fictitious supplier data DEMO-CS-01: bumper force, bumper centerline height and contact diameter'};
 p.drawing={originator:'CraneCalc demonstration',checker:'',datumElevation:100*foot,datumLabel:'Reference finished floor',railElevation:20*foot};
 // Fictitious code basis, site and existing-structure evaluation, so the demonstration cover reads as a
 // complete package. The engineer of record and seal stay blank: they are the user's to enter.
 p.drawing.address='Fictitious site: 100 Demonstration Way';
 p.drawing.code={building:'2021 IBC as adopted by the fictitious demonstration jurisdiction',editions:'2016',reviewed:false};
 p.drawing.existingEvaluation='Fictitious existing structure evaluation DEMO-ER-01: frame, bracing, connections and foundations for the added crane loads';
 p.details.fatigueDetails[3].name='Bearing stiffener weld toe, support 2';
 for(let bay=1;bay<3;bay++){
  p.details.fatigueDetails.push({id:`FB${bay+1}`,name:`Rolled bottom flange, bay ${bay+1} midspan`,x:(bay*25+12.5)*foot,point:'bottom-left',category:'A',reference:'AISC Table A-3.1, 1.1 · plain rolled base metal'});
  p.details.fatigueDetails.push({id:`FT${bay+1}`,name:`Top flange, bay ${bay+1} midspan, category D`,x:(bay*25+12.5)*foot,point:'top-right',category:'D',reference:'AISC Table A-3.1, 7.1 · comparison point; rail clip stations automatic'});
  p.details.fatigueDetails.push({id:`FS${bay+2}`,name:`Stiffener weld toe, support ${bay+2}`,x:(bay+1)*25*foot,point:'top-right',category:'C',reference:'AISC Table A-3.1, 5.8 · transverse stiffener weld toe'});
 }
 const r=p.details.rail; p.railWeight=(r.headWidth*r.headThickness+r.baseWidth*r.baseThickness+(p.aist.railDepth-r.headThickness-r.baseThickness)*r.webThickness)*7850*9.80665/1e9;
 p.notes='Software capability demonstration using realistic fictitious geometry, supplier forces, duty and criteria. Not a site-specific design. Scope: three simply supported 25-ft bays on one runway line, its rail and girder-side connections. Existing building frames, column brackets, anchors and foundations are excluded. Bolted end stops on the girders at both ends of each runway take the full-speed bumper force into the girders and their locating supports. No fictitious manufacturer approval is claimed.';
 return p;
}

/** Separate light-duty capped example. It does not alter the original 10-ton
 * rolled-girder example or claim that its smaller assembly serves that crane. */
export function cappedDemonstrationProject():ProjectInput {
 const p=demonstrationProject();
 p.details!.bracket={...structuredClone(defaultBracket),enabled:true,loadPathConfirmed:true,receiver:{...defaultBracket.receiver,axialDemand:62*kip,confirmed:true,source:'Fictitious survey: existing W14X90 column, ASTM A572 Grade 50 per mill certificates; 10 ft flange unbraced length; 62 kip factored existing gravity axial (1.2D + 1.6S from the building records) for the panel zone.'}};
 p.notes=p.notes.replace('column brackets, ','');
 p.title='Cedar Works · Three-bay 2-ton capped runway';p.number='DEMO-CAP-002';
 p.section=loadCappedSection(p.section,'W24X94','C15X33.9');
 // Design for the rail-to-web offset the rail setting allowance permits, as in the rolled example.
 p.railEccentricity=.25*inch;
 p.capDesign={...emptyCapDesign,Fy:50*ksi,Fu:65*ksi,Fexx:70*ksi,weldSize:.3125*inch,developmentLength:60*inch,cmaaClass:'C',fullLength:true,continuousWelds:true,contactConfirmed:true,unperforated:true,topStiffenerCjp:true,materialSource:'Fictitious ASTM A572 Grade 50 channel; E70XX welds',dutySource:'Fictitious supplier confirms CMAA C, 2-US-ton crane; 1,000,000 wheel stress fluctuations',fitupNote:'Fictitious full-bearing fit-up: straighten and fit cap before continuous welding; inspect contact along full length; no gaps accepted.'};
 const c=p.cranes[0];c.name='Demo capped crane · 2 US tons';c.operatingClass='Fictitious CMAA C crane; AIST Class C building';
 c.wheels=c.wheels.map(w=>({...w,loaded:w.loaded*.2,unloaded:w.unloaded*.2,lateral:w.lateral*.2}));c.longitudinal*=.2;
 c.design={...c.design!,ratedLoad:c.design!.ratedLoad*.2,trolleyWeight:c.design!.trolleyWeight*.2,bridgeWeight:c.design!.bridgeWeight*.2,drivenWheelLoad:c.design!.drivenWheelLoad*.2,bumperForce:c.design!.bumperForce*.2};
 c.loadSource='Fictitious capped demonstration schedule CAP-CS-02; 2-ton crane, not the rolled 10-ton example';
 // A light pendant-operated crane: AIST TR-13 maintenance type, the closest to light general service.
 c.design.type='maintenance';c.design.control='pendant';
 p.drawing!.existingEvaluation='Fictitious existing structure evaluation DEMO-ER-02: column line B frame, bracing, connections and foundations for the added crane loads';
 p.aist!.netFlangeArea=p.section.bf*p.section.tf;
 // Fictitious surveyed column and existing building effects (unfactored) for the existing-column check.
 const none={P:0,Mx:0,My:0,V:0};
 p.existingColumn={...structuredClone(defaultExistingColumn),enabled:true,height:26*foot,seatElevation:18*foot,Lcx:26*foot,Lcy:8*foot,Lcz:8*foot,
  existing:{D:{P:25*kip,Mx:15*kip*foot,My:0,V:1*kip},L:{...none},Lr:{P:12*kip,Mx:6*kip*foot,My:0,V:.5*kip},S:{P:20*kip,Mx:10*kip*foot,My:0,V:.8*kip},R:{...none},W:{P:-8*kip,Mx:40*kip*foot,My:0,V:4*kip},E:{P:0,Mx:20*kip*foot,My:0,V:2*kip}},
  welding:{basis:'mill-certificates',grade:'ASTM A572 Grade 50',carbonEquivalent:.42,preheat:(150-32)*5/9,deadLoadOnly:true,source:'Fictitious demonstration: mill certificates with the original building records, heat 4471'},
  source:'Fictitious demonstration: original building calculation sheets 14-17, column line B',confirmed:true,
  // Structural review records for the existing column line: the sidewall rod bracing's crane-level strut connects at
  // the column centerline (so the girder offset still twists the column), a braced frame, the frame's 10-year wind
  // drift and gravity spread at the runway, the site seismic data and the alteration evaluation.
  longitudinalExit:'column-strut',
  frame:{type:'braced',source:'Fictitious demonstration: column line B braced by the roof diaphragm and the sidewall rod bracing (building report DEMO-ER-02)'},
  service:{wind10:.3*inch,spreadD:.05*inch,spreadS:.15*inch,roofSnow:25*4.788025898e-5,source:'Fictitious demonstration: building frame report DEMO-ER-02, 10-year wind and dead/snow runs at the crane girder'},
  siteSeismic:{enabled:true,SDS:.25,sdc:'B',Ie:1,R:3,liftedLoadSecured:false,friction:.6,source:'Fictitious demonstration: site data from the original building report (Site Class D, SDS 0.25, SDC B; steel system not specifically detailed for seismic, R = 3)',
   alteration:{dcrIncrease:.06,source:'Fictitious demonstration: evaluation DEMO-ER-02 of the existing bracing and frames with the runway and crane mass added (largest D/C increase 6%)'}}};
 // The surveyed seat sets the rail elevation the drawings show; no separate top of rail is entered.
 delete p.drawing!.railElevation;
 // Fictitious sidewall rod bracing up to the crane-level strut, with the building's own longitudinal wind and seismic forces.
 p.longitudinalBracing={...structuredClone(defaultLongitudinalBracing),enabled:true,bayWidth:25*foot,height:18*foot,existing:{W:6*kip,E:3*kip},
  wind10:3.5*kip,source:'Fictitious demonstration: sidewall rod bracing at grid lines 2-3 and the original wind/seismic report (10-year wind 3.5 kip on this line)',confirmed:true};
 // Revised independent ties: shorter, shifted clear of bearing stiffeners,
 // directly attached to flange saddles. No holes or cuts in the cap channel.
 Object.assign(p.details!.brace,{length:18*inch,reach:18*inch,width:5.25*inch,thickness:.3125*inch,gussetThickness:.875*inch,connectionLength:6*inch,
  flangeAttachment:{enabled:true,longitudinalSetback:3.5*inch,saddleLength:4*inch,saddleThickness:1.5*inch,webGap:.875*inch,clearance:.25*inch,weldSize:.3125*inch},
  release:{enabled:true,travel:.125*inch,sleeveWall:.25*inch,clearance:.0625*inch}});
 Object.assign(p.details!.brace.connection,{diameter:.625*inch,gauge:2.75*inch,pitch:2*inch,edge:1.25*inch,thickness:.3125*inch,weldLength:5.75*inch});
 p.details!.bracket!.seatWeld=.625*inch;
 p.details!.fabrication.bolting='ASTM F3125 Grade A325, sizes as detailed (tie bolts smaller than the other girder bolts), pretensioned to the RCSC Table 8.1 minimum pretension. Standard holes and Class B faying surfaces. Sliding-end bearing bolts and column-end tie bolts are pretensioned against steel sleeves. Rail joints tight (gap 1/16 in max.), joint bolts pretensioned and re-tightened after 30 and 90 days of operation.';
 p.details!.bearing.length=12*inch;p.details!.bearing.stiffenerWidth=4*inch;
 // Ribs between the inner bearing bolt rows and the column flange edges: nuts below the seat clear the ribs at
 // shared and runway-end grids, and both root welds stay on the 14-in receiving flange.
 p.details!.bracket!.ribSpacing=10.5*inch;
 // The 0.71 in W14X90 flange cannot take the rib forces in local bending (J10.1): continuity plates at the seat and
 // rib bottom, each side of the web, sized to the J10.8 minimums for the 2 in seat plate.
 {const b=p.details!.bracket!;b.columnStiffeners=initialColumnStiffeners(b.receiver,receiverK(b,p.existingColumn)?.k,Math.max(b.seatThickness,b.ribThickness));}
 // Lighter stop for the 2-ton crane, inboard of the runway-end tie saddle.
 // The 6 1/2 in gauge keeps the bolts on the 9.07 in W flange; 2 3/4 in stiffener centers and the face plate 1 3/4 in
 // ahead of the front bolts (on a 12 in base plate, so both bolt rows stay put) keep the heads clear of the welds.
 Object.assign(p.details!.endStop!,{setback:6.75*inch,base:{length:12*inch,width:9*inch,thickness:.75*inch},face:{thickness:.75*inch,height:15*inch},stiffener:{thickness:.5*inch,length:8.5*inch,spacing:2.75*inch},bolts:{diameter:.75*inch,grade:'A325',gauge:6.5*inch,frontClear:1.75*inch,edge:1.5*inch},source:'Fictitious supplier data CAP-CS-02: bumper force, bumper centerline height and contact diameter'});
 p.details!.end.weldSize=.3125*inch;p.details!.end.gauge=2.5*inch;p.details!.bearing.weldSize=.3125*inch;
 // Light crane: the rail bears directly on the cap web, without a pad. Weld-on clips with a 1/4 in base weld (the
 // 0.40 in channel web: Table J2.4 minimum 3/16 in).
 p.aist!.railPad=false;
 p.details!.rail.clip=demonstrationClip(.25*inch,true);
 p.details!.fabrication.steel='W girder ASTM A992; cap channel and connection plates ASTM A572 Grade 50. Fictitious rail specification per R-6 schedule.';
 p.details!.fabrication.welding+=' Cap: continuous fillet each W top-flange edge, size and end development per the cap section and development details. Full cap bearing contact required. Bearing stiffeners CJP to W top flange, bottom fitted.';
 p.notes+=' Separate capped example: 2-ton crane on W24X94 + C15X33.9, centered rail, continuous cap welds and full contact. This is not a substitute section for the 10-ton demonstration.';
 return p;
}

/**
 * Fictitious new freestanding runway columns for the 2-ton capped runway: a W14X120 cantilever on a spread
 * footing at each support, carrying the girder on its welded bracket and the top-flange tie at its face.
 * The columns stop at the top of the girder; crane-level rod bracing between two of them takes the
 * longitudinal forces. No existing building element carries crane load.
 */
export function newColumnDemonstrationProject():ProjectInput {
 const p=cappedDemonstrationProject();
 p.title='Cedar Works · New freestanding 2-ton runway columns';p.number='DEMO-NC-002';
 // New columns on new footings: the entered top of rail sets the column geometry, which validation reconciles.
 p.drawing!.railElevation=20*foot;
 // The existing building carries no crane load, so there is no existing structure evaluation to reference.
 delete p.drawing!.existingEvaluation;
 const shape='W14X120',w=aiscShapeByName(shape)!,d=p.details!,cap=p.section.kind==='cap'?p.section.capTw:0;
 const base={...structuredClone(defaultColumnBase),enabled:true,
  plate:{...defaultColumnBase.plate,N:23*inch,B:18*inch,thickness:1.25*inch},anchors:{...defaultColumnBase.anchors,diameter:inch,embedment:15*inch},
  footing:{...defaultColumnBase.footing,L:6.5*foot,B:6.5*foot,thickness:24*inch,bar:'#6' as const,spacing:10*inch},
  source:'Fictitious geotechnical report GEO-02: 3,000 psf allowable (net), base friction 0.35, 120 pcf; interior heated building, frost not applicable. Concrete 4,000 psi; ASTM A615 Grade 60 bars; ASTM F1554 Grade 36 rods',confirmed:true};
 // Rail top 20 ft above the floor: the seat sits below it by the rail, girder (with cap) and bearing plate,
 // measured from the column base on the grout and plate. The column stops at the top of the girder.
 const seat=20*foot-columnBaseElevation(base)-railTopAboveSteel(p)-cap-p.section.d-d.bearing.thickness,top=seat+d.bearing.thickness+p.section.d+cap;
 d.bracket!.receiver={...d.bracket!.receiver,depth:w.d*inch,width:w.bf*inch,flangeThickness:w.tf*inch,webThickness:w.tw*inch,Fy:50*ksi,Fu:65*ksi,unbracedLength:top,axialDemand:0,confirmed:true,source:`New ${shape} column designed here; no other loads`};
 // The 0.94 in W14X120 flange takes the rib forces unstiffened, clear of the crane-level bracing gussets.
 delete d.bracket!.columnStiffeners;
 p.existingColumn={...structuredClone(defaultExistingColumn),enabled:true,isNew:true,shape,Fy:50*ksi,Fu:65*ksi,height:top,seatElevation:seat,
  strong:{base:'fixed',top:'free'},weak:{base:'fixed',top:'braced'},Lcx:2.1*top,Lcy:top,Lcz:top,Lb:top,longitudinal:'bracing',driftLimit:240,source:'New column designed here',confirmed:true,
  seismic:{enabled:true,sdc:'B',SDS:.2,system:'ordinary',Ie:1,rho:1,source:'Fictitious site data: SDS 0.20, SD1 0.08, Site Class D, Risk Category II, SDC B',
   riskCategory:'II',Ss:.19,S1:.05,siteClass:'D',SD1:.08,
   building:{drift:1.5*inch,source:'Fictitious original building report: maximum inelastic displacement 1.5 in at the runway level'}},
  // The existing building's W12X40 frame columns stand 6 ft outboard of each runway grid line, on the same grids.
  adjacent:{enabled:true,A:{...defaultExistingLine,offset:6*foot,footing:{L:4*foot,B:4*foot}},B:{...defaultExistingLine,offset:6*foot,footing:{L:4*foot,B:4*foot}},footingClear:6*inch,
   source:'Fictitious survey SV-02: existing column faces located at every grid, footings by test pits at grids 1 and 3'}};
 p.columnBase=base;
 p.longitudinalBracing={...p.longitudinalBracing!,height:seat,existing:{W:0,E:0},source:'Fictitious new crane-level rod X-bracing between the new columns at grid lines 2-3; no building wind or seismic on this line',confirmed:true,
  // Clevis rods in the middle span, a W8X24 strut on the column line and the bracket seats welded to the columns.
  design:{...structuredClone(defaultBracingDesign),spans:[2]}};
 p.notes='Software capability demonstration using realistic fictitious geometry, supplier forces, duty and criteria. Not a site-specific design. Scope: three simply supported 25-ft bays of a 2-ton capped runway on new freestanding W14X120 columns with welded brackets, top-flange ties, base plates, anchor rods and spread footings poured flush with the saw cut slab, and crane-level rod X-bracing with a W8X24 strut on the column line. The existing building carries no crane load. Seismic: ordinary steel cantilever column system across the runway and rod bracing not specifically detailed for seismic resistance along it, Seismic Design Category B.';
 return p;
}

import {cappedDemonstrationProject,demonstrationProject} from '../../src/engine/demonstration';
import {selectBracketArrangement} from '../../src/engine/connectionOptions';
import {sizeTaperedHaunch} from '../../src/engine/taperedHaunchSizing';
import type {ProjectInput} from '../../src/engine/types';

const inch=25.4,foot=304.8,kip=4448.2216152605,ksi=6.894757293168;
/** AISC W14X90: d 14.0 in, bf 14.5 in, tf 0.71 in, tw 0.44 in. */
const W14X90={depth:14*inch,width:14.5*inch,flangeThickness:.71*inch,webThickness:.44*inch};

/**
 * Test project 1: the capped 2-ton demonstration on the built-up tapered I haunch as selected, its receiving column
 * the demonstration's existing W14X90 (plates and material as the existing-column check uses). Every check passes
 * without column stiffeners.
 */
export function cappedTaperedHaunch():ProjectInput{
 const p=cappedDemonstrationProject(),r=p.details!.bracket!.receiver;
 p.existingColumn!.shape='W14X90';
 p.details!.bracket!.receiver={...r,...W14X90,Fy:50*ksi,Fu:65*ksi,
  source:'EXISTING W14X90 COLUMN, SURVEY-VERIFIED (fictitious demonstration survey): d 14.0 in, bf 14.5 in, tf 0.71 in, tw 0.44 in; A992; 10 ft flange unbraced length; zero other axial loads for the local checks.'};
 p.details=selectBracketArrangement(p.details!,'tapered-haunch');
 return p;
}

/**
 * Test projects 2 (US) and 3 (SI): a new 7.5-ton crane runway in an existing 5-bay building. Plain rolled W24X229
 * girders on simple 25 ft spans, existing W14X90 columns at every grid (survey-verified, with existing load effects
 * and welding records), new built-up tapered I haunches field welded to the column flanges, top-flange ties, bolted
 * end bearings, girder end stops, and the building's existing rod X-bracing in one bay taking the crane longitudinal
 * forces.
 *
 * The sizing makes the haunch deep at the column: the unbalanced reactions of the two girder ends twist it, and with
 * warping fixed at the column the flange couples at the root reach the 0.71 in column flange. The unstiffened column
 * fails J10.1, so the sizing adds column stiffeners at both haunch flange levels (1 in, full depth, 5/8 in fillets)
 * and deepens the haunch until the stiffeners' web shear and fillet throat fatigue are within limits.
 */
export function existingBuildingHaunch(units:'US'|'SI'='US'):ProjectInput{
 const p=demonstrationProject();
 p.units=units;
 p.title='Cedar Works · New 7.5-ton runway in the existing 5-bay building';p.number=units==='SI'?'DEMO-TH-075-SI':'DEMO-TH-075';
 p.spans=[25*foot,25*foot,25*foot,25*foot,25*foot];
 // The demonstration's 10-ton crane scaled to a 7.5-ton crane of the same geometry.
 const c=p.cranes[0],k=.75;
 c.name='Demo crane CR-1 · 7.5 US tons';c.travelEnd=125*foot;
 c.wheels=c.wheels.map(w=>({...w,loaded:w.loaded*k,unloaded:w.unloaded*k,lateral:w.lateral*k}));c.longitudinal*=k;
 if(c.design)c.design={...c.design,ratedLoad:c.design.ratedLoad*k,trolleyWeight:c.design.trolleyWeight*k,bridgeWeight:c.design.bridgeWeight*k,drivenWheelLoad:c.design.drivenWheelLoad*k,bumperForce:c.design.bumperForce*k};
 c.loadSource='Fictitious supplier schedule DEMO-CS-075; used solely to demonstrate calculation capabilities';
 const d=p.details!;
 // Fatigue register over the five bays: bottom flange at each midspan, stiffener toes at every support.
 d.fatigueDetails=[
  ...[0,1,2,3,4].map(i=>({id:`FB${i+1}`,name:`Rolled bottom flange, bay ${i+1} midspan`,x:(i*25+12.5)*foot,point:'bottom-left' as const,category:'A' as const,reference:'AISC Table A-3.1, 1.1 · plain rolled base metal'})),
  ...[0,1,2,3,4,5].map(i=>({id:`FS${i+1}`,name:`Bearing stiffener weld toe, grid ${i+1}`,x:i*25*foot,point:i<5?'top-right' as const:'top-left' as const,category:'C' as const,reference:'AISC Table A-3.1, 5.8 · transverse stiffener weld toe'})),
  {id:'FT3',name:'Top flange, bay 3 midspan, conservative category D',x:62.5*foot,point:'top-right',category:'D',reference:'AISC Table A-3.1, 7.1 · conservative comparison point; keeper stations automatic'}];
 // Existing W14X90 columns (A992) at every grid: 30 ft to the roof truss, the surveyed haunch seat at 20 ft.
 const none={P:0,Mx:0,My:0,V:0};
 p.existingColumn={...p.existingColumn!,enabled:true,isNew:false,shape:'W14X90',d:W14X90.depth,bf:W14X90.width,tf:W14X90.flangeThickness,tw:W14X90.webThickness,Fy:50*ksi,Fu:65*ksi,height:30*foot,seatElevation:20*foot,eccentricity:18*inch,
  strong:{base:'pinned',top:'braced'},weak:{base:'pinned',top:'braced'},Lcx:30*foot,Lcy:10*foot,Lcz:10*foot,Lb:10*foot,longitudinal:'bracing',driftLimit:240,
  existing:{D:{P:42*kip,Mx:18*kip*foot,My:0,V:1.2*kip},L:{...none},Lr:{P:16*kip,Mx:7*kip*foot,My:0,V:.5*kip},S:{P:24*kip,Mx:11*kip*foot,My:0,V:.8*kip},R:{...none},W:{P:-10*kip,Mx:48*kip*foot,My:0,V:4.5*kip},E:{P:0,Mx:22*kip*foot,My:0,V:2*kip}},
  source:'Fictitious demonstration: survey SV-TH-01 of the existing W14X90 columns at grids 1-6 (flange thickness by UT, mill certificates on file) and the original building calculations, column line B',confirmed:true,
  welding:{basis:'mill-certificates',grade:'ASTM A992',carbonEquivalent:.41,preheat:(150-32)*5/9,deadLoadOnly:true,source:'Fictitious demonstration: mill certificates on file with the original building records (survey SV-TH-01)'}};
 const dr=p.drawing!;delete dr.railElevation;
 dr.existingEvaluation='Fictitious existing structure evaluation DEMO-ER-TH: column line B frame, roof bracing, rod X-bracing in bay 3, connections and foundations for the added crane loads';
 // The building's existing rod X-bracing in one bay takes the crane longitudinal forces with its own wind and seismic.
 p.longitudinalBracing={enabled:true,system:'rod-x',bays:1,bayWidth:25*foot,height:20*foot,tiers:1,rod:{diameter:1*inch,Fy:36*ksi,Fu:58*ksi},angle:{shape:'L3X3X1/4',Fy:36*ksi,Fu:58*ksi,bolts:3,boltDiameter:.75*inch},
  existing:{W:7*kip,E:3.5*kip},bumperToBracing:false,driftLimit:240,source:'Fictitious demonstration: existing 1 in rod X-bracing in bay 3, column line B (survey SV-TH-01) and the original wind/seismic report',confirmed:true};
 p.notes='Software capability demonstration using realistic fictitious geometry, supplier forces, duty and criteria. Not a site-specific design. Scope: a new 7.5-ton crane runway in an existing 5-bay building: five simply supported 25-ft W24X229 girders on new built-up tapered I haunches field welded to the existing W14X90 columns at every grid, with column stiffeners at the haunch flanges, top-flange ties, bolted end bearings and girder-mounted end stops. The existing columns are checked with their existing load effects; the existing rod X-bracing in bay 3 takes the crane longitudinal forces.';
 // The haunch, its receiving column the existing W14X90, the column face 28 in from the girder web line where the
 // demonstration's top-flange tie bars reach it.
 const sel=selectBracketArrangement(d,'tapered-haunch').bracket!;
 const b={...sel,reach:28*inch,loadPathConfirmed:true,receiver:{...sel.receiver,...W14X90,Fy:50*ksi,Fu:65*ksi,unbracedLength:10*foot,axialDemand:60*kip,confirmed:true,
  source:'EXISTING W14X90 COLUMN, SURVEY-VERIFIED (fictitious survey SV-TH-01): d 14.0 in, bf 14.5 in, tf 0.71 in (UT), tw 0.44 in; A992 per mill certificates; 10 ft flange unbraced length (girts); 60 kip concurrent axial from the building.'}};
 delete b.haunch;
 p.details=selectBracketArrangement({...d,bracket:b},'tapered-haunch');
 // The top-flange tie lands on the existing 0.71 in W14X90 flange: a 6 1/2 in deep tie and column gusset and a
 // 3 1/2 in saddle set back to the girder end.
 const t=p.details.brace;t.width=6.5*inch;t.connection.weldLength=6.5*inch;t.flangeAttachment!.saddleLength=3.5*inch;t.flangeAttachment!.longitudinalSetback=4.5*inch;
 return sizeTaperedHaunch(p);
}

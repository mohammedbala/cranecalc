import { exampleProject } from '../src/engine/defaults';
import { calculate } from '../src/engine/calculate';
import { sectionProperties } from '../src/engine/section';
import { loadAiscSection } from '../src/data/aiscSections';
import { girderStrength } from '../src/engine/aiscStrength';
import { fatigueResistance } from '../src/engine/aistChecks';
import { aistCraneMinimum, craneCombinations, emptyAistInputs, emptyCraneDesign } from '../src/engine/aistLoads';
import { beamSystem } from '../src/engine/beam';
import { runPermitBenchmarks } from './permitPackages';
import type { CalculationSnapshot, ProjectInput } from '../src/engine/types';

const inch=25.4, ft=304.8, kip=4448.221615, ksi=6.894757293;
export const reviewSources = [
  {id:'DG7',title:'AISC Design Guide 7, third edition (2019)',url:'https://www.aisc.org/globalassets/modern-steel/archives/2019/aug2019.pdf',location:'Supplied original DG7, Examples 14.1.1 and 14.1.2, printed pp. 63-69; online publisher overview, pp. 16-18. Full examples checked in the supplied PDF.'},
  {id:'MIT',title:'MIT OpenCourseWare 3.11: Beam Displacements (1999)',url:'https://ocw.mit.edu/courses/3-11-mechanics-of-materials-fall-1999/13534abb67b86d2fb8ee11a1f4f2b8c4_MIT3_11F99_bdisp.pdf',location:'Sections: double integration and superposition. New numerical test inputs below are independently chosen; these are equation-derived checks, not copied published example outputs.'},
  {id:'AIST',title:'Reference: AIST Technical Report 13',url:'https://www.aist.org/technology-committees/find-a-committee/cranes/tr-13-guide-files',location:'Supplied February 24, 2020 source: Table 3.2, Sections 3.10.2 and 5.8.7. Exact provenance remains in references/SOURCE_REGISTER.md.'},
  {id:'AISC',title:'ANSI/AISC 360-16, June 2018 printing',url:'https://www.aisc.org/aisc/publications/historic-standards/specification-for-structural-steel-buildings/',location:'F2, J10 and Appendix 3; original full text pinned in the source register.'},
  {id:'EVERETT',title:'Everett permit B2306-034, DeShazo SE-DS-RPT-17691 rev. 1',url:'https://lfportal.everettwa.gov/WebLink/DocView.aspx?dbid=0&id=2096929&page=1',location:'Report July 25, 2023; printed pp. 20, 24-25 / viewer pp. 39, 43-44.'},
];
export interface ReviewRow {label:string;unit:string;reference:number;app:number;relativeError:number;tolerance:number;absoluteTolerance:number;status:'MATCH'|'DIFFERENCE';basis:string;note:string;}
export interface ReviewCase {id:string;title:string;kind:string;purpose:string;sourceIds:string[];inputs:[string,string][];equations:string[];rows:ReviewRow[];notes:string[];diagram:{spans:number[];points:{x:number;p:number}[];q:number;continuous:boolean;caption:string};project?:ProjectInput;snapshot?:CalculationSnapshot;}
const row=(label:string,unit:string,reference:number,app:number,basis:string,note='',tolerance=.001,absoluteTolerance=1e-7):ReviewRow=>{
  if(!Number.isFinite(reference)||!Number.isFinite(app))throw Error(`Nonfinite comparison: ${label}`);
  const error=Math.abs(reference-app);
  return {label,unit,reference,app,relativeError:error/Math.max(Math.abs(reference),1e-12),tolerance,absoluteTolerance,status:error<=Math.max(tolerance*Math.abs(reference),absoluteTolerance)?'MATCH':'DIFFERENCE',basis,note};
};
function base(id:string,span=30):ProjectInput {
  const p=structuredClone(exampleProject);
  p.number=id;p.title=`Benchmark ${id} - source comparison`;p.engineer='Software verification - project engineer not assigned';p.spans=[span*ft];
  p.section=loadAiscSection(p.section,'W24X131');p.section.Fy=50*ksi;p.section.Fu=65*ksi;p.section.E=29000*ksi;
  p.section.density=131*.45359237/.3048/(p.section.A*1e-6);
  p.unbracedLength=p.lateralBraceSpacing=span*ft;p.railWeight=.05*kip/ft;p.railHeight=6*inch;
  p.aist={...emptyAistInputs,buildingClass:'A',buildingCycles:600000,classConfirmed:true,railDepth:6*inch,bearingLength:8*inch,netFlangeArea:p.section.bf*p.section.tf,bottomBraceSpacing:span*ft,axialLength:span*ft,torsionalLength:span*ft,runwayOnly:true,fatigueReference:'Benchmark detail category only; fabrication detail has not been designed',cycleSource:'Numerical test: 2,000,000 equivalent cycles'};
  p.fatigue.location=span*ft/2;p.fatigue.detail='Benchmark category C resistance; no approved project detail';
  const c=p.cranes[0];c.name='Reference wheel train';c.travelStart=-12*ft;c.travelEnd=span*ft;c.loadSource='DG7 Example 14.1.1 numerical benchmark; empty wheel 19.65 kip is an explicit replay assumption';
  c.wheels=[0,12].map(offset=>({offset:offset*ft,loaded:38.1*kip,unloaded:19.65*kip,lateral:2.53*kip}));
  c.design={...emptyCraneDesign,ratedLoad:40*kip,trolleyWeight:10.6*kip,bridgeWeight:57.2*kip,drivenWheelLoad:38.1*kip,distributionSource:'Benchmark assumption: one-half of total side thrust',splitConfirmed:true,bumperBypassesGirder:true};
  p.notes='NUMERICAL BENCHMARK ONLY. Source dimensions and explicit assumptions are recorded in the review. This is not a manufacturer-approved project or complete crane installation design.';
  return p;
}
function checked(p:ProjectInput){const s=calculate(p);if(s.errors.length||!s.analysis)throw Error(`${p.number}: ${s.errors.join('; ')}`);return s;}
const twoWheelMoment=(P:number,q:number,L=30,a=12)=>{const x=(P*(2*L-a)+q*L*L/2)/(4*P+q*L);return P*x*(2*L-a-2*x)/L+q*x*(L-x)/2;};
const force=(n:number)=>n/kip, moment=(n:number)=>n/(kip*ft);
// Independent simply-supported Green function; uses no engine beam matrices.
function delta(x:number,a:number,P:number,L:number,EI:number){return x<=a?P*(L-a)*x*(L*L-(L-a)**2-x*x)/(6*L*EI):P*a*(L-x)*(L*L-a*a-(L-x)**2)/(6*L*EI);}
function simpleReference(p:ProjectInput,steps:number){
  const L=p.spans[0]/ft,I=p.section.Ix/inch**4,E=p.section.E/ksi;
  // Nominal weight is explicit in the benchmark density; do not call the engine's section routine here.
  const q=.131+p.railWeight*ft/kip+p.deadLoad*ft/kip;
  let M=0,R=0,D=0;const selected:number[]=[];
  const visit=(i:number)=>{
    if(i<p.cranes.length){const c=p.cranes[i];for(let n=0;n<=steps;n++){
      const origin=(c.travelStart+(c.travelEnd-c.travelStart)*n/steps)/ft;
      if(i&&origin-selected[i-1]-p.cranes[i-1].wheels.at(-1)!.offset/ft<Math.max(c.minSeparation,p.cranes[i-1].minSeparation)/ft-1e-9)continue;
      selected.push(origin);visit(i+1);selected.pop();}return;}
    const loads=p.cranes.flatMap((c,i)=>c.wheels.map(w=>({x:selected[i]+w.offset/ft,static:w.loaded/kip/(c.includesImpact?1+c.impact:1),P:w.loaded/kip*(c.includesImpact?1:1+c.impact)}))).filter(w=>w.x>=0&&w.x<=L);
    const ra=q*L/2+loads.reduce((sum,w)=>sum+w.P*(L-w.x)/L,0),rb=q*L+loads.reduce((sum,w)=>sum+w.P,0)-ra;
    R=Math.max(R,ra,rb);const cuts=[...new Set([0,...loads.map(w=>w.x),L])].sort((a,b)=>a-b),stations=[...cuts];
    for(let j=1;j<cuts.length;j++){const mid=(cuts[j]+cuts[j-1])/2;const root=(ra-loads.filter(w=>w.x<mid).reduce((s,w)=>s+w.P,0))/q;if(root>cuts[j-1]&&root<cuts[j])stations.push(root);}
    for(const x of stations)M=Math.max(M,Math.abs(ra*x-q*x*x/2-loads.reduce((sum,w)=>sum+w.P*Math.max(0,x-w.x),0)));
    for(let n=0;n<=160;n++){const x=L*n/160;D=Math.max(D,loads.reduce((sum,w)=>sum+delta(x*12,w.x*12,w.static,L*12,E*I),0));}
  };visit(0);return {M,R,D};
}
function skeleton(id:string,title:string,kind:string,purpose:string,sourceIds:string[],spans:number[],points:{x:number;p:number}[]=[],q=0,continuous=false):ReviewCase {
 return {id,title,kind,purpose,sourceIds,inputs:[],equations:[],rows:[],notes:[],diagram:{spans,points,q,continuous,caption:'Benchmark loading schematic; dimensions in ft, point loads in kip and uniform load in kip/ft. Not a fabrication detail.'}};
}
export function runRunwayReview():ReviewCase[]{
 const cases:ReviewCase[]=[];
 {
  const c=skeleton('01','DG7 two-wheel runway - ASD','Published example + full app calculation','Check major-axis strength and moving-wheel demand against a published runway example.',['DG7','AISC'],[30],[{x:12,p:47.625},{x:24,p:47.625}],.181);
  const p=base(c.id);p.method='ASD';const s=checked(p),v=girderStrength(p,s.properties!);c.project=p;c.snapshot=s;
  c.inputs=[['Section / material','W24X131; Fy 50 ksi; E 29,000 ksi'],['Span / Lb','30 ft / 30 ft'],['Static wheel / spacing','38.1 kip each / 12 ft'],['Impact / dead UDL','25% / 0.181 kip/ft'],['Empty wheel assumption','19.65 kip; for AIST split only']];
  c.equations=['M_{wheel,max}=\\frac{P}{2L}(L-a/2)^2','M(x)=\\frac{Px(2L-a-2x)}{L}+\\frac{qx(L-x)}2'];
  c.rows=[row('Available major flexure','kip-ft',605,moment(v.major),'DG7 p. 66 printed value', '',.001),row('Whole-section minor resistance','kip-ft',203,moment(v.minor),'DG7 p. 66 printed value','This is a strength primitive, not the app single-flange design resistance.'),row('Impact moment vs concurrent solution','kip-ft',twoWheelMoment(38.1*1.25,.181),moment(s.designAnalysis!.moment),'Independent exact coincident wheel + UDL solution','',.001),row('Impact moment vs printed sum','kip-ft',478,moment(s.designAnalysis!.moment),'DG7 p. 66 independent-maxima sum','Published sum is a conservative bound; difference is expected and retained.',.001),row('Static moment vs printed sum','kip-ft',386,moment(s.designAnalysis!.combinations.find(r=>r.id==='ASD 2a')!.moment),'DG7 p. 66 independent-maxima sum','Same concurrence distinction.',.001)];
  c.notes=['The 203 kip-ft printed whole-section minor strength is rounded to a whole kip-ft; the catalogue calculation gives 203.3433. It remains flagged at the preselected 0.1% tolerance.','The published example is ASCE-based. Only common vertical demands and F2 resistance are compared here; AIST side thrust, flange resistance and service class are not assumed identical.','Complete design export remains blocked by the unresolved torsion, brace-system and connection models.'];cases.push(c);
 }
 {
  const c=skeleton('02','DG7 runway - LRFD and load-basis comparison','Published example + full app calculation','Check LRFD resistance and expose differences between DG7 example loading and the AIST projection.',['DG7','AIST','AISC'],[30],[{x:12,p:68.34},{x:24,p:68.34}],1.2*.181);
  const p=base(c.id),s=checked(p),v=girderStrength(p,s.properties!),P=1.2*19.65+1.6*(38.1-19.65)+1.6*.25*38.1;c.project=p;c.snapshot=s;
  c.inputs=[['Section / span / Lb','W24X131 / 30 ft / 30 ft'],['AIST wheel decomposition','Loaded 38.1 kip; assumed empty 19.65 kip'],['AIST 2c wheel','1.2(19.65)+1.6(18.45)+1.6(0.25)(38.1)'],['DG7 example wheel','55.5 kip before 25% impact, rounded published split']];
  c.equations=['P_u=1.2P_{empty}+1.6(P_{static}-P_{empty})+1.6IP_{static}','\\phi_bM_n=0.9M_n'];
  c.rows=[row('Available major flexure','kip-ft',909,moment(v.major),'DG7 p. 69'),row('Whole-section minor resistance','kip-ft',306,moment(v.minor),'DG7 p. 69','Whole-section primitive; no single-flange equivalence.',.002),row('AIST factored wheel','kip',P,force(s.designAnalysis!.wheelLoad),'Independent AIST 2c substitution'),row('AIST concurrent impact moment','kip-ft',twoWheelMoment(P,1.2*.181),moment(s.designAnalysis!.moment),'Independent exact solution with AIST factors'),row('Moment vs DG7 printed example','kip-ft',690,moment(s.designAnalysis!.moment),'DG7 p. 69','Different wheel decomposition/impact basis plus concurrence. This is a basis comparison, not an interchangeable design result.')];
  c.notes=['Do not tune the AIST engine to match the ASCE-based example. Establish the intended project load basis and manufacturer split first.'];cases.push(c);
 }
 {
  const c=skeleton('03','Single wheel at midspan','Shared solver component','Check the beam element against an independent closed-form point-load solution.',['MIT'],[30],[{x:15,p:30}]);
  const L=360,P=30,E=29000,I=4020,r=beamSystem([L*inch],E*ksi*I*inch**4,'simple',undefined,80).evaluate([{x:L*inch/2,p:P*kip}]);
  c.inputs=[['Length / stiffness','30 ft; E 29,000 ksi; I 4,020 in4'],['Load / dead load','30 kip at midspan / zero'],['Model boundary','Component test: app crane input requires at least two wheels']];c.equations=['R_A=R_B=P/2','M_{max}=PL/4','\\delta_{max}=PL^3/(48EI)'];
  c.rows=[row('Left reaction','kip',P/2,force(r.reactions[0].r),'Closed form'),row('Peak moment','kip-ft',P*30/4,moment(Math.max(...r.moment)),'Closed form'),row('Midspan deflection','in',P*L**3/(48*E*I),Math.max(...r.displacement)/inch,'Closed form')];cases.push(c);
 }
 for(const [id,two] of [['04',false],['05',true]] as const){
  const L=two?40:30,c=skeleton(id,two?'Two independently moving cranes':'Four unequal moving wheels','Full app supplied-load analysis','Compare app moving envelopes with a separately coded simply-supported superposition solution.',['MIT'],[L]);
  const p=base(id,L);p.scope='analysis';p.method='ASD';p.cranes[0].loadSource='Independent numerical test derived from linear beam equations; not a supplier schedule';
  p.cranes[0].wheels=(two?[20,20]:[18,25,22,16]).map((P,i)=>({offset:i*(two?8:5)*ft,loaded:P*kip,unloaded:P*kip*.4,lateral:0}));
  p.cranes[0].travelStart=two?0:-15*ft;p.cranes[0].travelEnd=(two?10:L)*ft;p.cranes[0].minSeparation=5*ft;
  if(two){const second=structuredClone(p.cranes[0]);second.id='second';second.name='Second benchmark crane';second.travelStart=20*ft;second.travelEnd=32*ft;second.wheels.forEach(w=>{w.loaded=15*kip;w.unloaded=6*kip;});p.cranes.push(second);}
  const s=checked(p),ref=simpleReference(p,two?180:2400);c.project=p;c.snapshot=s;
  const refFine=simpleReference(p,two?360:4800);
  c.inputs=[['Section / span','W24X131 / '+L+' ft'],['E / I','29,000 ksi / 4,020 in4'],['Crane wheel schedules',two?'C1: 20,20 kip at 0,8 ft; C2: 15,15 kip at 0,8 ft':'18,25,22,16 kip at 0,5,10,15 ft'],['Travel origin ranges',two?'C1 0-10 ft; C2 20-32 ft; minimum gap 5 ft':'-15 to 30 ft (includes entry and exit)'],['Impact / dead UDL','25% / 0.181 kip/ft']];
  c.equations=['R_A=qL/2+\\sum P_i(L-a_i)/L','M(x)=R_Ax-qx^2/2-\\sum P_i\\max(0,x-a_i)','\\delta(x)=\\sum_i\\delta_i(x;P_i,a_i)'];
  c.rows=[row('Maximum moment','kip-ft',refFine.M,moment(s.analysis!.demand.moment),'Independent dense travel search + exact moment stations','',.0025),row('Maximum support reaction','kip',refFine.R,force(s.analysis!.demand.reaction),'Independent equilibrium for each origin pair','',.0025),row('Static crane deflection','in',refFine.D,s.analysis!.demand.deflection/inch,'Independent Green-function superposition; 160 displacement stations','',.0025),row('Reference search refinement - moment','kip-ft',refFine.M,ref.M,'Separate reference travel-grid doubling','',.0002),row('Reference search refinement - deflection','in',refFine.D,ref.D,'Separate reference travel-grid doubling','',.0002)];
  c.diagram.points=s.analysis!.demand.governing.moment.points.map(w=>({x:w.x/ft,p:w.vertical/kip}));c.diagram.q=.181;c.diagram.caption+=' Wheel placement shown is the app governing moment position.';
  c.notes=['Static service deflection excludes impact and girder/rail dead load, matching analysis-scope behavior. Reference equations use inches and kips; app uses N and mm.','An actual app analysis PDF is appended to this review set after the server checks the input revision and eligibility.'];cases.push(c);
 }
 for(const bays of [2,3]){
  const id=bays===2?'06':'07',L=30,q=.2,c=skeleton(id,`${bays}-bay continuous girder under uniform load`,'Shared solver component','Check continuity, negative moments and support reactions independently of moving-load sampling.',['MIT'],Array(bays).fill(L),[],q,true);
  const r=beamSystem(Array(bays).fill(L*ft),29000*ksi*4020*inch**4,'continuous',undefined,40).evaluate([],q*kip/ft),inner=bays===2?-.125*q*L*L:-.1*q*L*L,outer=bays===2?.375*q*L:.4*q*L,central=bays===2?1.25*q*L:1.1*q*L;
  c.inputs=[['Equal spans',`${bays} x 30 ft`],['Uniform load','0.200 kip/ft over all spans'],['Stiffness','Constant EI; E 29,000 ksi; I 4,020 in4'],['Model','Continuous rotations; rigid vertical supports']];
  c.equations=bays===2?['M_B=-qL^2/8','R_A=R_C=3qL/8,\\quad R_B=5qL/4']:['M_B=M_C=-qL^2/10','R_A=R_D=0.4qL,\\quad R_B=R_C=1.1qL'];
  c.rows=[row('First internal support moment','kip-ft',inner,moment(r.moment[r.x.indexOf(L*ft)]),'Independent three-moment compatibility'),row('Outer support reaction','kip',outer,force(r.reactions[0].r),'Equilibrium using compatibility moments'),row('First inner support reaction','kip',central,force(r.reactions[1].r),'Equilibrium using compatibility moments'),row('Sum of reactions','kip',bays*q*L,force(r.reactions.reduce((s,r)=>s+r.r,0)),'Global equilibrium')];
  c.notes=['This component test deliberately isolates uniform loading. It does not claim a complete crane schedule or an app design export.'];cases.push(c);
 }
 {
  const L=30,P=30,c=skeleton('08','Continuous girder - partial loading and uplift','Shared solver component','Check negative support reactions that require a real hold-down load path.',['MIT'],[L,L],[{x:L/2,p:P}],0,true);
  const r=beamSystem([L*ft,L*ft],29000*ksi*4020*inch**4,'continuous',undefined,40).evaluate([{x:L*ft/2,p:P*kip}]);
  c.inputs=[['Spans / loading','Two 30-ft bays; 30 kip at center of first bay'],['Stiffness','E 29,000 ksi; I 4,020 in4'],['Support assumption','Supports can take tension; no gap/lift-off analysis']];c.equations=['M_B=-3PL/32','R_A=13P/32,\\quad R_B=11P/16,\\quad R_C=-3P/32','\\delta_{P}=23PL^3/(1536EI)'];
  c.rows=[row('Loaded-end reaction','kip',13*P/32,force(r.reactions[0].r),'Three-moment compatibility'),row('Internal reaction','kip',11*P/16,force(r.reactions[1].r),'Equilibrium'),row('Far support reaction (uplift)','kip',-3*P/32,force(r.reactions[2].r),'Equilibrium'),row('Internal support moment','kip-ft',-3*P*L/32,moment(r.moment[r.x.indexOf(L*ft)]),'Compatibility'),row('Deflection under the load','in',23*P*(L*12)**3/(1536*29000*4020),r.displacement[r.x.indexOf(L*ft/2)]/inch,'Independent superposition')];
  c.notes=['The negative reaction is a demand on anchors/hold-downs, not an anchor capacity check. A support that lifts off changes the structural model.'];cases.push(c);
 }
 {
  const c=skeleton('09','Minimum impact, side thrust and traction','AIST provision substitution','Exercise crane type/control branches using independent values from Table 3.2 rules.',['AIST'],[30]);
  const crane=base(c.id).cranes[0];Object.assign(crane.design!,{ratedLoad:40*kip,trolleyWeight:10*kip,bridgeWeight:60*kip,drivenWheelLoad:30*kip,sideShare:.5});
  c.inputs=[['Rated / trolley / bridge weights','40 / 10 / 60 kip'],['Driven wheel load / side share','30 kip / 0.5'],['Stacker rigid arm weight','5 kip when stacker is selected']];
  c.equations=['H_{mill}=\\max(0.4Q,0.2(Q+T),0.1(Q+T+B))','H_{pendant}=0.1(Q+T+B)','C_{ls}=0.2P_{driven}'];
  for(const [type,control,impact,H] of [['mill','cab',.25,16],['maintenance','cab',.20,12],['magnet','cab',.25,40],['stacker','cab',.25,80],['mill','pendant',.10,11]] as const){crane.design!.type=type;crane.design!.control=control;crane.design!.rigidArmWeight=5*kip;const m=aistCraneMinimum(crane);c.rows.push(row(`${control} ${type}: impact`,'ratio',impact,m.impact,'AIST Table 3.2 / pendant rule'),row(`${control} ${type}: runway side`,'kip',H*.5,force(m.runwaySide),'Independent greatest-of substitution'));}
  c.rows.push(row('Longitudinal traction','kip',6,force(aistCraneMinimum(crane).traction),'0.20 x 30 kip'));c.notes=['AIST building classes A-D and CMAA crane service classes A-F are different systems. The 50% side share is an explicit test input, not automatic supplier verification.'];cases.push(c);
 }
 {
  const c=skeleton('10','AIST combinations and impact normalization','Full app design calculation + provision substitution','Verify crane load factors, once-only impact and service-load treatment.',['AIST','EVERETT'],[25],[{x:7,p:110/4.448221615},{x:19,p:110/4.448221615}]);
  const p=base(c.id,25);p.cranes[0].travelStart=0;p.cranes[0].wheels.forEach(w=>{w.loaded=110000;w.unloaded=42000;w.lateral=8000;});Object.assign(p.cranes[0].design!,{ratedLoad:136000,trolleyWeight:18000,bridgeWeight:70000,drivenWheelLoad:110000});
  const s=checked(p),included=structuredClone(p);included.cranes[0].includesImpact=true;included.cranes[0].wheels.forEach(w=>w.loaded*=1.25);const b=checked(included);c.project=p;c.snapshot=s;
  c.inputs=[['Wheel static / empty','110 / 42 kN; two wheels at 12-ft spacing'],['Impact','25%, then repeated with impact already included'],['Factor vector order','D, crane dead, crane lift, side, traction, impact']];c.equations=['P_u=1.2(42)+1.6(110-42)+1.6(0.25)(110)=203.2\\;kN','P_{static}=P_{including\\ impact}/(1+I)'];
  for(const [id,expected] of [['2b',[1.2,1.2,1.6,1.6,1.6,0]],['2c',[1.2,1.2,1.6,0,1.6,1.6]]] as const){const combination=craneCombinations('LRFD').find(x=>x.id===id)!;(['d','cd','cv','h','l','i'] as const).forEach((key,i)=>c.rows.push(row(`LRFD ${id}: ${key}`,'factor',expected[i],combination[key],'AIST 3.10.2; Everett printed p. 20','',0,0)));}
  c.rows.push(row('Design wheel','kN',203.2,s.designAnalysis!.wheelLoad/1000,'Independent AIST 2c arithmetic'),row('Impact included: moment invariance','kip-ft',moment(s.designAnalysis!.moment),moment(b.designAnalysis!.moment),'Paired input-invariance check','Supplemental property test, not a second external source.'),row('Impact included: static deflection','in',s.designAnalysis!.singleVertical/inch,b.designAnalysis!.singleVertical/inch,'Paired input-invariance check'));
  c.notes=['Only runway terms are tested. General building wind, seismic, roof, thermal and foundation load combinations remain outside this suite.'];cases.push(c);
 }
 {
  const c=skeleton('11','Permit W24X76 local web resistance','Independent municipal permit comparison','Retain and explain the two unresolved local resistance differences from the permit sheet.',['EVERETT','AISC'],[30]);
  c.diagram.caption='Resistance-only reference member; the 30-ft graphic is illustrative. No project wheel demand or span is used in the local capacity calculation. Bearing length is 13.45 in.';
  c.inputs=[['Section / material','W24X76; Fy 50 ksi, E 29,000 ksi (replay basis)'],['Dimensions','d 23.9; tw 0.44; tf 0.68; k 1.18; h 21.54 in'],['Bearing length / method','13.45 in / LRFD'],['Scope','Base W web only; no cap-channel or stiffener credit']];c.equations=['R_{n,y}=F_y t_w(2.5k+l_b)','\\phi R_{n,c}=0.75(0.40)t_w^2[1+(4l_b/d-0.2)(t_w/t_f)^{1.5}]\\sqrt{EF_yt_f/t_w}'];
  c.rows=runPermitBenchmarks().filter(r=>r.id.startsWith('end-')).map(r=>row(r.check,r.unit,r.published as number,r.computed as number,'Everett printed p. 25',r.note));
  c.notes=['Crippling: printed 187.91 kip versus 179.7613 kip for the documented J10-5b substitution. Material inputs are reconstructed, not separately repeated on that local sheet.','Compression buckling: source 102.86 kip is unreduced; app conservative end case is 51.4304 kip. Establish actual load distance and stiffener contribution before resolving applicability.'];cases.push(c);
 }
 {
  const c=skeleton('12','Fatigue resistance and serviceability classes','AISC curve + AIST service criteria','Check finite-life/threshold fatigue behavior and owner/class deflection limits.',['AISC','AIST','EVERETT'],[25]);
  c.inputs=[['Fatigue cases','A at 500,000 cycles; C at 2,000,000 and 10^15 cycles'],['Service span','25 ft = 300 in'],['Building classes','A/B: L/1000; C/D: L/600; lateral L/400'],['Owner override','L/1200 vertical and L/500 lateral in final test']];c.equations=['F_{SR}=\\max[F_{TH},6900(C_f/N)^{1/3}]\\;MPa','\\delta_{allow}=L/\\max(n_{owner},n_{class})'];
  c.rows=[row('Category A finite-life resistance','ksi',36.84,fatigueResistance('A',500000).FSR/ksi,'Everett printed p. 24','Rounded SI and US coefficients differ slightly.'),row('Category C finite-life resistance','MPa',6900*Math.cbrt(4.4/2000000),fatigueResistance('C',2000000).FSR,'Independent Appendix 3 substitution'),row('Category C threshold','MPa',69,fatigueResistance('C',1e15).FSR,'AISC Appendix 3 threshold')];
  for(const [cls,n,cycles] of [['A',1000,600000],['B',1000,200000],['C',600,50000],['D',600,10000]] as const){const p=base(c.id,25);p.verticalLimit=100;p.lateralLimit=100;p.aist!.buildingClass=cls;p.aist!.buildingCycles=cycles;const s=checked(p);c.rows.push(row(`Class ${cls}: vertical limit`,'in',300/n,s.checks.find(x=>x.id==='vertical')!.capacity!/inch,'AIST 5.8.7'),row(`Class ${cls}: lateral limit`,'in',300/400,s.checks.find(x=>x.id==='lateral')!.capacity!/inch,'AIST 5.8.7'));if(cls==='A'){c.project=p;c.snapshot=s;}}
  const p=base(c.id,25);p.verticalLimit=1200;p.lateralLimit=500;const s=checked(p);c.rows.push(row('Stricter owner vertical limit','in',.25,s.checks.find(x=>x.id==='vertical')!.capacity!/inch,'AIST + owner criterion'),row('Stricter owner lateral limit','in',.6,s.checks.find(x=>x.id==='lateral')!.capacity!/inch,'AIST + owner criterion'));
  c.notes=['This validates the resistance curve and deflection criteria, not the actual fatigue detail category, owner duty spectrum, all detail locations, warping stress or rail twist.'];cases.push(c);
 }
 if(cases.length!==12)throw Error('Expected twelve distinct cases');
 return cases;
}

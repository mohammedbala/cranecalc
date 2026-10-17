import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';
import {calculate,validateProject} from '../src/engine/calculate';
import {sectionProperties} from '../src/engine/section';
import {loadAiscSection} from '../src/data/aiscSections';
import {spliceLayout,spliceGeometry,clipZones,spliceZones,validateSplices,defaultSplices,type SpliceInput} from '../src/engine/spliceInputs';
import {spliceBasis,spliceChecks,createSpliceCollector,type SpliceResults} from '../src/engine/girderSplice';
import {railClipStations} from '../src/engine/simpleSupports';
import {railLayout,railAnchors} from '../src/engine/railLayout';
import {girderMarks} from '../src/engine/drawingData';
import {drawingSheetSet} from '../src/components/planSheet';
import {buildGirderSplices} from '../src/components/spliceGeometry3d';
import {buildRunwaySteel} from '../src/components/runwaySteelGeometry';
import {createHardwareBuilder} from '../src/components/connectionDetails';
import {checkHardwareClashes} from '../src/components/hardwareClashes';
import type {CalculationSnapshot,ProjectInput} from '../src/engine/types';
import {classifyCheck} from '../src/engine/checkTaxonomy';
import type {RunwayCaseEvent} from '../src/engine/designAnalysis';

const inch=25.4,foot=304.8,kip=4448.2216152605,ksi=6.894757293168;
/** The 10-ton demonstration made continuous over 4 x 25 ft and spliced: the first test project. */
function continuousSplice():ProjectInput{
 const p=demonstrationProject();p.system='continuous';p.spans=[1,2,3,4].map(()=>25*foot);p.cranes[0].travelEnd=100*foot;p.aist!.supportType='column';
 const d=p.details!;d.brace.flangeAttachment!.enabled=false;d.bearing.thickness=1.25*inch;d.bearing.stiffenerThickness=1.25*inch;
 d.splices={enabled:true,maxPiece:60*foot,placement:'auto',stations:[],basis:'minimum',grade:'A490',diameter:1.25*inch,surface:'B',gap:.375*inch,edge:1.75*inch,
  top:{plates:'inner',outerWidth:13*inch,outerThickness:1*inch,innerWidth:5.25*inch,innerThickness:1.5*inch,lines:1,gauge:9*inch,lineSpacing:3*inch,rows:4,pitch:3.75*inch,endDistance:6.5*inch},
  bottom:{plates:'inner-outer',outerWidth:13*inch,outerThickness:1*inch,innerWidth:5.25*inch,innerThickness:1.25*inch,lines:1,gauge:6.5*inch,lineSpacing:3*inch,rows:3,pitch:3.75*inch,endDistance:1.75*inch},
  web:{thickness:.875*inch,height:15*inch,rows:4,pitch:3.75*inch,columns:2,spacing:3.75*inch,endDistance:3*inch}};
 return p;
}
/**
 * Two simply supported 70 ft bays on a W36X231 with a 5-ton crane, both flanges braced at the quarter points and
 * each girder spliced in the field: the second test project.
 */
function simpleSplice():ProjectInput{
 const p=demonstrationProject();p.spans=[70,70].map(v=>v*foot);
 p.section=loadAiscSection(p.section,'W36X231');p.section.Fy=50*ksi;p.section.Fu=65*ksi;p.section.E=29000*ksi;
 const brace=17.5*foot;p.unbracedLength=brace;p.lateralBraceSpacing=brace;
 p.aist={...p.aist!,netFlangeArea:p.section.bf*p.section.tf,bottomBraceSpacing:brace,axialLength:70*foot,torsionalLength:brace};
 const c=p.cranes[0];c.name='Demo crane CR-5 · 5 US tons';
 c.wheels=[{offset:0,loaded:11*kip,unloaded:4.4*kip,lateral:1.1*kip},{offset:10*foot,loaded:11*kip,unloaded:4.4*kip,lateral:1.1*kip}];
 c.longitudinal=2.2*kip;c.travelStart=-10*foot;c.travelEnd=140*foot;
 c.design={...c.design!,ratedLoad:10*kip,trolleyWeight:2.5*kip,bridgeWeight:11*kip,drivenWheelLoad:11*kip,bumperForce:10*kip};
 p.fatigue={...p.fatigue,location:35*foot};
 const d=p.details!;d.brace.flangeAttachment!.enabled=false;
 // Enclosed, heated building (20 °C either way); end gap and sliding allowance for the 70 ft girders.
 d.simpleSupport={...d.simpleSupport!,guideTravel:.75*inch,endGap:1.25*inch,temperatureRise:20,temperatureFall:20};
 d.endBearing!.bolts.edge=2.5*inch;d.bearing.stiffenerWidth=5.5*inch;d.brace.thickness=d.brace.connection.thickness=5/16*inch;
 d.fatigueDetails=[
  ...[0,1].map(i=>({id:`FB${i+1}`,name:`Rolled bottom flange, bay ${i+1} midspan`,x:(70*i+35)*foot,point:'bottom-left' as const,category:'A' as const,reference:'AISC Table A-3.1, 1.1 · plain rolled base metal'})),
  ...[0,1,2].map(i=>({id:`FS${i+1}`,name:`Stiffener weld toe, grid ${i+1}`,x:70*i*foot,point:'top-right' as const,category:'C' as const,reference:'AISC Table A-3.1, 5.8 · transverse stiffener weld toe'}))];
 d.splices={enabled:true,maxPiece:60*foot,placement:'auto',stations:[],basis:'minimum',grade:'A490',diameter:inch,surface:'B',gap:.375*inch,edge:1.5*inch,
  top:{plates:'inner',outerWidth:16.5*inch,outerThickness:1*inch,innerWidth:6.75*inch,innerThickness:1.25*inch,lines:1,gauge:8.5*inch,lineSpacing:3*inch,rows:6,pitch:3*inch,endDistance:6.25*inch},
  bottom:{plates:'inner-outer',outerWidth:16.5*inch,outerThickness:.875*inch,innerWidth:6.75*inch,innerThickness:1*inch,lines:1,gauge:6*inch,lineSpacing:3*inch,rows:4,pitch:3*inch,endDistance:1.5*inch},
  web:{thickness:.625*inch,height:27*inch,rows:8,pitch:3.5*inch,columns:2,spacing:3*inch,endDistance:2.5*inch}};
 return p;
}
const splice=(p:ProjectInput)=>p.details!.splices!;
/** Failing checks other than the demonstration crane's own input records (crane statics, data, bumper, building class). */
const failing=(s:CalculationSnapshot)=>s.checks.filter(c=>c.status==='fail'&&classifyCheck(c).type!=='input').map(c=>c.id);
const edit=(p:ProjectInput,fn:(s:SpliceInput)=>void)=>{fn(splice(p));return p;};

describe('girder field splice placement',()=>{
 it('splices a 100 ft continuous girder once, in the inflection region next to grid 3',()=>{
  const p=continuousSplice(),l=spliceLayout(p);
  expect(validateProject(p)).toEqual([]);expect(l.errors).toEqual([]);
  // 0.20 to 0.25 of the 25 ft span from the interior support at 50 ft, on 5 in steps, nearest 0.22: 65 in = 0.2167 L.
  expect(l.stations).toHaveLength(1);expect(l.stations[0]).toBeCloseTo(50*foot-65*inch,6);
  expect(l.pieces.map(v=>v.length)).toEqual([l.stations[0]-3/16*inch,100*foot-l.stations[0]-3/16*inch].map(v=>expect.closeTo(v,6)));
  expect(Math.max(...l.pieces.map(v=>v.length))).toBeLessThanOrEqual(60*foot);
  expect(girderMarks(p).map(g=>[g.mark,g.leftSplice??-1,g.rightSplice??-1])).toEqual([['RG1',-1,0],['RG2',0,-1]]);
 });
 it('keeps the clips, rail joints and rail anchors clear of the splice',()=>{
  const p=continuousSplice(),s=spliceLayout(p).stations[0],g=spliceGeometry(p,splice(p)),zones=clipZones(p,[s],g,splice(p));
  const ks=railClipStations(p),near=ks.filter(x=>Math.abs(x-s)<40*inch).map(x=>x-s);
  // A clip in the pocket between each girder end and the first bolt row, the next one beyond the bolt group.
  expect(near.filter(x=>Math.abs(x)<g.top.rows[0])).toHaveLength(2);
  for(const x of ks)expect(zones.some(([a,b])=>x>a+1e-6&&x<b-1e-6)).toBe(false);
  for(let i=1;i<ks.length;i++)expect(ks[i]-ks[i-1]).toBeLessThanOrEqual(p.aist!.clipSpacing+1e-6);
  const r=railLayout(p);expect(r.girderJoints).toEqual([s]);
  for(const j of r.rails.flatMap(v=>v.joints))expect(Math.abs(j-s)).toBeGreaterThanOrEqual(2*foot-1e-6);
  for(const a of railAnchors(p,r).flatMap(v=>v.anchors))expect(zones.some(([z0,z1])=>a.station>z0+1e-6&&a.station<z1-1e-6)).toBe(false);
 });
 it('splices each 70 ft simple bay once, as near its left end as the 60 ft piece allows',()=>{
  const p=simpleSplice(),l=spliceLayout(p),end=1.25/2*inch;
  expect(validateProject(p)).toEqual([]);expect(l.errors).toEqual([]);
  // 70 ft less 60 ft less the joint gap leaves a 9'-11 1/2" end piece; the plates then end the girder depth clear of the
  // bearing stiffeners, which moves the joint to 10'-5" from the girder end (5 in steps).
  expect(l.stations).toHaveLength(2);expect(l.stations[0]).toBeCloseTo(125*inch,6);expect(l.stations[1]).toBeCloseTo(70*foot+end+125*inch,6);
  expect(l.pieces).toHaveLength(4);
  for(const v of l.pieces){expect(v.length).toBeLessThanOrEqual(60*foot);expect(v.length).toBeGreaterThanOrEqual(10*foot);}
  expect(girderMarks(p).map(g=>[g.leftSplice??-1,g.rightSplice??-1])).toEqual([[-1,0],[0,-1],[-1,1],[1,-1]]);
 });
 it('leaves projects without splices unchanged',()=>{
  const demo=demonstrationProject();expect(spliceLayout(demo).stations).toEqual([]);expect(validateSplices(demo)).toEqual([]);
  const before=girderMarks(demo);
  demo.details!.splices=defaultSplices(demo,demo.details!.rail);
  expect(spliceLayout(demo).stations).toEqual([]);expect(validateSplices(demo)).toEqual([]);expect(girderMarks(demo)).toEqual(before);
  expect(railClipStations(demo)).toEqual(railClipStations(demonstrationProject()));
 });
 it('rejects entered stations at a bearing or too close together',()=>{
  const p=edit(continuousSplice(),s=>{s.placement='entered';s.stations=[50*foot+20*inch];});
  expect(validateSplices(p).join(' ')).toContain('the girder depth clear of the bearing and stiffeners at grid 3');
  edit(p,s=>{s.stations=[30*foot,36*foot];});
  expect(validateSplices(p).join(' ')).toContain('at least 10\'-0" apart');
 });
});

describe('girder splice validation',()=>{
 it('keeps an outer splice plate off the top flange under the rail',()=>{
  const p=edit(continuousSplice(),s=>{s.top.plates='inner-outer';});
  expect(validateSplices(p).join(' ')).toContain('use inner plates only on the top flange');
 });
 it('keeps the top flange bolt heads off the rail base',()=>{
  const p=edit(continuousSplice(),s=>{s.top.gauge=7*inch;});
  expect(validateSplices(p).join(' ')).toContain('clear the rail base');
 });
 it('keeps inner plates out of the web fillets and web plates clear of the flange nuts',()=>{
  expect(validateSplices(edit(continuousSplice(),s=>{s.top.innerWidth=6*inch;})).join(' ')).toContain('clear the web fillet');
  expect(validateSplices(edit(continuousSplice(),s=>{s.web.height=17*inch;s.web.rows=4;})).join(' ')).toContain('web splice plates must stay 1/4 in clear');
 });
 it('limits the top flange bolt group to the clip spacing',()=>{
  const p=edit(continuousSplice(),s=>{s.top.rows=6;});
  expect(validateSplices(p).join(' ')).toContain('clip spacing');
 });
 it('makes a capped girder longer than a piece a clear validation error',()=>{
  const p=cappedDemonstrationProject();p.system='continuous';p.details!.brace.flangeAttachment!.enabled=false;p.spans=[1,2,3].map(()=>25*foot);
  p.details!.splices=defaultSplices(p,p.details!.rail);
  expect(validateSplices(p).join(' ')).toContain('needs a splice of the cap channel');
  expect(validateProject(p).some(e=>e.includes('cap channel as well as the W section'))).toBe(true);
 });
 it('rejects a bolt size outside the supported range',()=>{
  expect(validateSplices(edit(continuousSplice(),s=>{s.diameter=1.1*inch;})).join(' ')).toContain('supported nominal diameter');
 });
});

describe('girder splice design values',()=>{
 it('takes the basis minimum as half the drilled flange strength and half the web shear strength',()=>{
  const p=continuousSplice(),props=sectionProperties(p.section),b=spliceBasis(p,props,splice(p),spliceGeometry(p,splice(p)));
  // W24X229: bf 13.1 in, tf 1.73 in; 1 1/4 in bolts: 1 3/8 in holes + 1/16 in, two per row.
  const Afn=(13.1-2*1.4375)*1.73;
  expect(b.top.Afn/645.16).toBeCloseTo(Afn,4);
  expect(b.top.strength/kip).toBeCloseTo(Math.min(.9*50*13.1*1.73,.75*65*Afn),2);
  expect(b.minimum.top/kip).toBeCloseTo(.5*.75*65*Afn,2);
  expect(b.minimum.web/kip).toBeCloseTo(.5*.6*50*26.0*.96,1);
  edit(p,s=>{s.basis='full';});
  expect(spliceBasis(p,props,splice(p),spliceGeometry(p,splice(p))).minimum.top/kip).toBeCloseTo(.75*65*Afn,2);
 });
 it('checks bolts, plates and the girder flange for the larger of the design forces and the minimum',()=>{
  const p=continuousSplice(),props=sectionProperties(p.section),s0=spliceLayout(p).stations[0];
  const gov=(value:number)=>({value,id:'D-1',combination:'LRFD 2b',station:s0});
  const splices:SpliceResults={stations:[{station:s0,mark:'SP1',momentMax:150e6,momentMin:-120e6,shear:200e3,axial:90e3,topLateral:14e6,bottomLateral:2.5e6,topShear:2e4,bottomShear:3e3,torque:3e6}],
   strength:{topBolt:gov(40e3),topTension:gov(120e3),topCompression:gov(160e3),topGirder:gov(130e3),bottomBolt:gov(39e3),bottomTension:gov(118e3),bottomCompression:gov(95e3),bottomGirder:gov(118e3),webBolt:gov(76e3),webMoment:gov(36e6),webShear:gov(204e3),webAxial:gov(29e3),moment:gov(152e6)},fatigue:[]};
  const s={input:p,properties:props,detailResults:{splices},checks:[]} as unknown as CalculationSnapshot;
  const c=Object.fromEntries(spliceChecks(s).map(v=>[v.id,v]));
  const Afn=(13.1-2*1.4375)*1.73,min=.5*.75*65*Afn;
  // Top flange: 8 bolts in single shear (threads included): phi Fnv Ab = 0.75(68)(1.2272).
  expect(c['splice-top-bolt-shear'].demand!/kip).toBeCloseTo(min/8,2);
  expect(c['splice-top-bolt-shear'].capacity!/kip).toBeCloseTo(.75*68*Math.PI*1.25**2/4,2);
  // Slip at the design force: 0.50(1.13)(102 kip), one plane.
  expect(c['splice-top-slip'].demand).toBe(40e3);expect(c['splice-top-slip'].capacity!/kip).toBeCloseTo(.5*1.13*102,2);
  // Half of the minimum on one side of the web: one inner plate 5 1/4 x 1 1/2.
  expect(c['splice-top-plate-yield'].capacity!/kip).toBeCloseTo(.9*50*5.25*1.5,2);
  expect(c['splice-top-plate-rupture'].capacity!/kip).toBeCloseTo(.75*65*(5.25-1.4375)*1.5,2);
  // Web: 50% of the web shear with its eccentricity e = 3/16 + 3 + 1 7/8 in, elastic bolt group, corner bolt.
  const V=.5*.6*50*26*.96,e=3/16+3+1.875,J=8*1.875**2+4*(1.875**2+5.625**2),M=V*e;
  expect(c['splice-web-bolt-shear'].demand!/kip).toBeCloseTo(Math.hypot(M*5.625/J,V/8+M*1.875/J),2);
  // F13.1: Fu Afn < Fy Afg, so the drilled flange limits the flexural strength.
  expect(c['splice-girder-flexure'].equation).toContain('F_uA_{fn}');
  expect(spliceChecks(s).every(v=>v.status==='pass')).toBe(true);
  for(const v of spliceChecks(s))expect(v.referenceIds.length).toBeGreaterThan(0);
 });
 it('splits the joint actions into flange forces, lateral flange moments and the web share',()=>{
  const p=continuousSplice(),props=sectionProperties(p.section),c=createSpliceCollector(p,props)!,s0=spliceLayout(p).stations[0],L=100*foot;
  // One 100 kip wheel at the joint on a simply supported 100 ft beam (any equilibrium state serves): M = P x (L - x)/L.
  const P=100*kip,e:RunwayCaseEvent={kind:'strength',id:'T',combination:'TEST',cranes:[],horizontalCrane:-1,lateralSign:1,wheels:[{x:s0,p:P,h:0}],q:0,railTorquePerLength:0,axial:0,verticalReactions:[{x:0,r:P*(L-s0)/L},{x:L,r:P*s0/L}]};
  const curvature=1e-7,at=()=>({x:0,v:0,slope:0,twist:0,twistRate:0,curvature,warpingCurvature:0,warpingThird:0,lateralThird:0});
  const R1=P*(L-s0)/L,R2=P*s0/L;
  c.observe(e,-1,{at,stations:[],restraints:[],fixedReactions:[],residual:0} as never,0,L,x=>x<=s0?R1*x:R2*(L-x));
  const r=c.finish(),b=p.section,Af=b.bf*b.tf,yf=(b.d-b.tf)/2,M=P*s0*(L-s0)/L,F=M*Af*yf/props.Ix,Mlat=b.E*.8*props.Iy/2*curvature;
  expect(r.strength.moment.value).toBeCloseTo(M,0);
  const g=spliceGeometry(p,splice(p)),yc=((5.25*inch*1.5*inch)*(g.top.innerFrom+g.top.innerTo)/2)/(5.25*inch*1.5*inch);
  expect(r.strength.topCompression.value).toBeCloseTo(F/2+Mlat/(2*yc),0);
  expect(r.strength.webMoment.value).toBeCloseTo(M*(1-2*Af*yf*yf/props.Ix)+P*(L-s0)/L*(3/16+3)*inch,-1);
 });
});

describe('girder splice drawings and model',()=>{
 it('builds splice plates and bolts that pass through drilled holes',()=>{
  const p=continuousSplice(),mat=new THREE.MeshBasicMaterial(),edge=new THREE.LineBasicMaterial(),hw=createHardwareBuilder(mat);
  const g=new THREE.Group();g.add(buildRunwaySteel(p,{steel:mat,cap:mat,rail:mat,weld:mat,edge}),buildGirderSplices(p,{plate:mat,edge},hw));
  const parts:string[]=[];g.traverse(o=>{if(o.userData.part?.family)parts.push(o.userData.part.family);});
  expect(parts.filter(f=>f==='Girder splice plate')).toHaveLength(7);
  expect(parts.filter(f=>f==='Girder splice bolt')).toHaveLength(2*(8+6+8));
  // Two girder pieces per runway, each with its own flanges and web.
  expect(g.getObjectByName('girder-2-web')).toBeDefined();expect(g.getObjectByName('girder-3-web')).toBeUndefined();
  const issues=checkHardwareClashes(g).issues.filter(v=>v.a.startsWith('SP')||v.b.startsWith('SP'));
  expect(issues).toEqual([]);
 });
 it('designs, details and draws the continuous test project',()=>{
  const s=calculate(continuousSplice());
  expect(s.errors).toEqual([]);expect(s.eligible).toBe(true);
  expect(failing(s)).toEqual([]);
  const group=s.checks.filter(c=>c.group==='Girder splice');
  expect(group.length).toBeGreaterThan(40);expect(group.every(c=>c.status==='pass')).toBe(true);
  expect(s.detailResults!.splices!.stations).toHaveLength(1);
  const plain=(v:string)=>v.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
  const sheets=drawingSheetSet(s).map(v=>({...v,svg:plain(v.svg)})),all=sheets.map(v=>v.svg).join('');
  expect(all).not.toMatch(/NOT IN SET|NaN|undefined/);
  const s01=sheets.find(v=>v.number==='S-01')!.svg,cover=sheets.filter(v=>v.number.startsWith('S-00')).map(v=>v.svg).join(''),detail=sheets.find(v=>v.svg.includes('data-view="girder-splice-elevation"'))!.svg;
  // S-01: the splice on the plan and elevation and the pieces in the schedule.
  expect(s01).toContain('data-splice="SP1"');expect(s01).toContain('1-SP1');expect(s01).toContain('SP1-5');
  expect(s01).toContain('44\'-6 3/4"');expect(s01).toContain('55\'-4 3/4"');
  // The detail: plate sizes, bolts and gauge as designed.
  expect(detail).toContain('2 PL 1 1/2" X 5 1/4" X 3\'-3 3/8"');expect(detail).toContain('8 - 1 1/4" DIA. A490 SC EACH SIDE,');
  expect(detail).toContain('2 PL 7/8" X 1\'-3" X 1\'-5 3/8"');expect(detail).toContain('PL 1" X 1\'-1" X 1\'-10 3/8"');
  expect(detail).toContain('>9"<');expect(detail).toContain('FAYING SURFACES CLASS B');
  // S-00 and its continuation: erection, materials and special inspection of the slip-critical joints.
  expect(cover).toContain('GIRDER SPLICE BOLTS');expect(cover).toContain('>SLIP-CRITICAL GIRDER<');expect(cover).toContain('COMPLETE THE GIRDER FIELD SPLICES');expect(cover).toContain('PRE-INSTALLATION VERIFICATION');
 },600000);
 it('designs, details and draws the simple-span test project',()=>{
  const s=calculate(simpleSplice());
  expect(s.errors).toEqual([]);
  // The hand-entered ties of this 70 ft test girder are not resized here (the configurator sizes ties): only they fall short.
  expect(failing(s).filter(id=>!id.startsWith('tie-'))).toEqual([]);
  // Nothing else falls short or stays open.
  expect(s.checks.filter(c=>!['pass','not-applicable','excluded'].includes(c.status)&&classifyCheck(c).type!=='input'&&!c.id.startsWith('tie-')).map(c=>`${c.id} ${c.status}`)).toEqual([]);
  const group=s.checks.filter(c=>c.group==='Girder splice');
  expect(group.length).toBeGreaterThan(40);expect(group.every(c=>c.status==='pass')).toBe(true);
  expect(s.detailResults!.splices!.stations.map(v=>v.mark)).toEqual(['SP1','SP2']);
  // Half the drilled flange each side of the web, W36X231 (b_f = 16.5 in, t_f = 1.26 in), 1 1/8 in standard holes (Table J3.3) plus 1/16 in:
  // phi F_u A_n = 0.75 x 65 x (16.5/2 - 1.1875) x 1.26 = 433.8 kip, half of it the basis force.
  const net=s.checks.find(c=>c.id==='splice-top-girder-net')!;
  expect(net.capacity!/kip).toBeCloseTo(.75*65*(16.5/2-1.1875)*1.26,0);expect(net.demand!/net.capacity!).toBeCloseTo(.5,3);
  const plain=(v:string)=>v.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
  const sheets=drawingSheetSet(s).map(v=>({...v,svg:plain(v.svg)})),all=sheets.map(v=>v.svg).join('');
  expect(all).not.toMatch(/NOT IN SET|NaN|undefined/);
  const s01=sheets.find(v=>v.number==='S-01')!.svg;
  expect(s01).toContain('data-splice="SP1"');expect(s01).toContain('data-splice="SP2"');expect(s01).toMatch(/SP2 \/ \d+\/S-\d\d/);
  expect(s01).toContain('1-SP1');expect(s01).toContain('SP1-2');expect(s01).toContain('2-SP2');expect(s01).toContain('SP2-3');
 },600000);
});

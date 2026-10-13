import {describe,it,expect} from 'vitest';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';
import {railPad,railTopAboveSteel,clipGeometry,clipEntered,railInputsWithDefaults,railSeatDefaults,defaultRailClip} from '../src/engine/railSeat';
import {railClipResponse,railAnchorForce} from '../src/engine/railClip';
import {railLayout,railAnchors,railMovements,railExpansion,railJointMovement} from '../src/engine/railLayout';
import {railChecks} from '../src/engine/railChecks';
import {runwayElevations} from '../src/engine/drawingData';
import {validateProject} from '../src/engine/calculate';
import {projectSchema,type CalculationSnapshot,type ProjectInput} from '../src/engine/types';
import {railKeeperView} from '../src/components/railKeeperView';
import {railLayoutView,movementUpTo} from '../src/components/railLayoutView';
import {coverSheetSvg} from '../src/components/coverSheet';
/** The open-joint scheme (expansion gap at every joint, each piece anchored): a project choice; TR-13 tight joints are the default. */
const openJoints=(p:ProjectInput)=>{p.details!.rail.jointType='open';p.details!.rail.jointGap=.375*25.4;return p;};

const inch=25.4,kip=4448.221615;
const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'));
const snapshot=(p:ProjectInput)=>({input:p,checks:[],errors:[],warnings:[],eligible:true} as unknown as CalculationSnapshot);
/** Rail checks on the wheel-group demands of the 10-ton example (scale 1) or the 2-ton capped example (0.2). */
function checks(p:ProjectInput,scale=1){
 const P=scale*(1.2*8*kip+1.6*(12*kip+.25*20*kip)),H=scale*1.6*2*kip,bins=[{name:'Rated',cycles:1e6,vertical:scale*20*kip,lateral:scale*kip,weldStress:0}];
 for(const b of bins)b.weldStress=railClipResponse(p,b.lateral).weldStress;
 const detailResults={demands:{railLateral:H,railLateralService:scale*2*kip,railVertical:P,railFatigueVertical:scale*20*kip,railFatigueLateral:scale*kip},railFatigueBins:bins};
 return railChecks({input:p,detailResults} as unknown as CalculationSnapshot);
}

describe('rail seat: pad and rail clips',()=>{
 it('adds the rail pad to the top of rail in the elevations and load heights',()=>{
  const p=demonstrationProject(),pad=railPad(p)!;
  expect(pad.thickness).toBeCloseTo(.125*inch,10);expect(pad.width).toBeCloseTo(6*inch,10);
  expect(railTopAboveSteel(p)).toBeCloseTo(p.railHeight+pad.thickness,10);
  const e=runwayElevations(p)!;expect(e.tor-e.tos).toBeCloseTo(6.125*inch,10);
  // The light capped example sets its rail directly on the cap web.
  const c=cappedDemonstrationProject();expect(railPad(c)).toBeUndefined();
  const ec=runwayElevations(c)!;expect(ec.tor-ec.tos).toBeCloseTo(c.railHeight+(c.section.kind==='cap'?c.section.capTw:0),10);
 });
 it('loads earlier project files (welded keepers): the placeholder clip lays out the stations, every clip check is unverified',()=>{
  const p=demonstrationProject(),r=p.details!.rail;
  const {padThickness,padWidth,clip,...legacy}=r;void padThickness;void padWidth;void clip;
  // An earlier file with the keeper fields: they are dropped on load.
  const old={...legacy,clipWidth:3.75*inch,clipThickness:.75*inch,clipProjection:.5*inch,clipWeld:.375*inch,anchorNotch:.5*inch};
  p.details!.rail=projectSchema.parse({...p,details:{...p.details,rail:old}}).details!.rail;
  expect(p.details!.rail).not.toHaveProperty('clipWidth');expect(p.details!.rail.clip).toBeUndefined();
  expect(railPad(p)!.thickness).toBe(railSeatDefaults.padThickness);expect(clipEntered(p.details!.rail)).toBe(false);
  expect(clipGeometry(p.details!.rail).baseLength).toBe(defaultRailClip.baseLength);
  const shown=railInputsWithDefaults(p.details!.rail),keys=Object.keys(shown);
  expect(keys.indexOf('padThickness')).toBe(keys.indexOf('padSource')+1);expect(keys.indexOf('clip')).toBe(keys.indexOf('padWidth')+1);
  const c=checks(p);
  for(const id of ['rail-clip-lateral','rail-clip-uplift','rail-clip-weld','rail-clip-weld-fatigue','rail-clip-weld-minimum'])expect(c.find(v=>v.id===id)?.status,id).toBe('unverified');
  expect(c.find(v=>v.id==='rail-clip-lateral')!.note).toContain('Rail clip manufacturer data are not entered');
 });
 it('places the clips against the rail-base toes and fits them on the girder',()=>{
  const p=demonstrationProject(),k=clipGeometry(p.details!.rail,railPad(p)!.thickness);
  expect(k.toe/inch).toBeCloseTo(3,10);expect(k.inner/inch).toBeCloseTo(3,10);expect(k.outer/inch).toBeCloseTo(5.5,10);
  expect(k.lateralHeight/inch).toBeCloseTo(.125+.375,10);expect(k.noseHeight/inch).toBeCloseTo(.875,10);
  expect(validateProject(p)).toEqual([]);expect(validateProject(cappedDemonstrationProject())).toEqual([]);
  // A clip base too wide for the flange, and a base weld shorter than 4w (J2.2b), are input errors.
  const wide=demonstrationProject();wide.details!.rail.clip!.baseWidth=4*inch;expect(validateProject(wide).join(' ')).toContain('rail clips must fit');
  const short=demonstrationProject();short.details!.rail.clip!.weldLength=1.25*inch;expect(validateProject(short).join(' ')).toContain('four times the weld size');
 });
 it('checks the manufacturer ratings on their basis, the base welds, their fatigue and minimum size; no keeper checks remain',()=>{
  const p=demonstrationProject(),c=checks(p),by=(id:string)=>c.find(v=>v.id===id)!;
  // Allowable ratings against the service side thrust of one wheel group: 2 kip on a 10 kip clip; uplift 2 x 6 / 6 = 2 kip on 5 kip.
  expect(by('rail-clip-lateral').demand!/kip).toBeCloseTo(2,6);expect(by('rail-clip-lateral').capacity!/kip).toBeCloseTo(10,6);expect(by('rail-clip-lateral').note).toContain('allowable (working-load) basis');
  expect(by('rail-clip-uplift').demand!/kip).toBeCloseTo(2,6);expect(by('rail-clip-uplift').capacity!/kip).toBeCloseTo(5,6);
  // LRFD ratings: the factored 3.2 kip.
  const lrfd=demonstrationProject();lrfd.details!.rail.clip!.basis='LRFD';expect(checks(lrfd).find(v=>v.id==='rail-clip-lateral')!.demand!/kip).toBeCloseTo(3.2,6);
  // Base welds, 3/8 in x 2 1/2 in across each end of the base: throat stress from the larger role, on phi 0.6 F_EXX.
  const w=railClipResponse(p,3.2*kip);expect(by('rail-clip-weld').demand).toBeCloseTo(w.weldStress,6);expect(by('rail-clip-weld').capacity).toBeCloseTo(.75*.6*70*6.894757,2);
  expect(w.A/inch**2).toBeCloseTo(2*.375/Math.SQRT2*2.5,6);
  expect(by('rail-clip-weld-fatigue').group).toBe('Fatigue');expect(by('rail-clip-weld-minimum').capacity!/inch).toBeCloseTo(.375,10);
  for(const v of c.filter(v=>v.id.startsWith('rail-clip')))expect(v.status,v.id).toBe('pass');
  expect(c.find(v=>/keeper|rail-anchor-|rail-flange-local/.test(v.id))).toBeUndefined();
  // The pad check only where a pad is specified.
  expect(by('rail-pad')).toBeDefined();expect(checks(cappedDemonstrationProject(),.2).find(v=>v.id==='rail-pad')).toBeUndefined();
  expect(railAnchorForce(demonstrationProject()).force/kip).toBeCloseTo(1.6*4,6);
 });
 it('defaults to AIST TR-13 tight rail joints: the floating rail is anchored by the end stops, the whole string grows into a stop gap',()=>{
  const p=demonstrationProject(),layout=railLayout(p),anchors=railAnchors(p,layout),moves=railMovements(p,layout),dT=p.details!.rail.temperatureRange;
  expect(p.details!.rail.jointType).toBeUndefined();expect(p.details!.rail.jointGap).toBeCloseTo(25.4/16,9);
  expect(anchors.every(a=>a.anchors.length===0)).toBe(true);expect(moves.joints.every(v=>v.movement===0)).toBe(true);
  for(const e of moves.ends){const rail=layout.rails.find(r=>r.side===e.side)!;expect(e.movement).toBeCloseTo(railExpansion*dT*(rail.end-rail.start),8);}
  const anchorage=checks(p).find(v=>v.id==='rail-anchorage')!;expect(anchorage.status).toBe('pass');expect(anchorage.demand!/kip).toBeCloseTo(6.4,4);expect(anchorage.capacity!/kip).toBeCloseTo(20,4);
  const note=texts(railKeeperView(snapshot(p)).render().svg).join(' ');
  expect(note).toContain('TIGHT JOINT (AIST TR-13 §5.16.1)');expect(note).toContain('PRETENSIONED IN 15/16" STANDARD HOLES');expect(note).toContain('RE-TIGHTEN THE BOLTS AFTER 30 AND 90 DAYS');expect(note).not.toContain('SNUG');
  expect(note).toContain('ANCHORED BY THE END STOPS');expect(note).toContain('NO ANCHOR CLIPS OR RAIL NOTCHES');
  const plan=texts(railLayoutView(snapshot(p)).render().svg).join(' ');expect(plan).toContain('EACH RAIL STRING IS ANCHORED BY THE END STOPS');expect(plan).toContain('6.4 KIP FACTORED');
  expect(plan).toContain(`UP TO ${movementUpTo(Math.max(...moves.ends.map(v=>v.movement)),'US')} INTO THE CLEARANCE GAP`);expect(plan).toContain('RAIL CLIP PAIRS (TICKS) AT 2\'-0" O.C. MAX.');
  expect(railLayoutView(snapshot(p)).render().svg).not.toContain('data-rail-anchor=');
 });
 it('open joints: an anchor clip pair at mid-length of each piece, each joint closing by the growth from both anchors',()=>{
  const p=openJoints(demonstrationProject()),layout=railLayout(p),anchors=railAnchors(p,layout),moves=railMovements(p,layout),dT=p.details!.rail.temperatureRange;
  layout.rails.forEach((rail,i)=>{
   const stations=[rail.start,...rail.joints,rail.end];
   expect(anchors[i].anchors.map(a=>a.station)).toEqual(rail.pieces.map((_,j)=>(stations[j]+stations[j+1])/2));
   rail.joints.forEach((j,n)=>expect(moves.joints.find(v=>v.side===rail.side&&v.station===j)!.movement).toBeCloseTo(railExpansion*dT*(rail.pieces[n]+rail.pieces[n+1])/2,8));
  });
  // Without the manufacturer's anchor rating the anchorage is unverified; with it, checked on the rating basis.
  expect(checks(p).find(v=>v.id==='rail-anchorage')!.status).toBe('unverified');
  p.details!.rail.clip!.anchorLongitudinal=8*kip;const a=checks(p).find(v=>v.id==='rail-anchorage')!;expect(a.status).toBe('pass');expect(a.demand!/kip).toBeCloseTo(4,4);
  const svg=railLayoutView(snapshot(p)).render().svg;expect(svg.match(/data-rail-anchor=/g)).toHaveLength(layout.rails.reduce((n,r)=>n+r.pieces.length,0));
  const note=texts(svg).join(' ');expect(note).toContain('ANCHOR CLIP PAIR (FIXED CLIPS PER MANUFACTURER');
  // The rail ends clear the stop base plates, so the end pieces are a little shorter than the stop-face layout gave (3.94 mm).
  const moved=railJointMovement(railMovements(p));expect(moved).toBeCloseTo(3.93,2);
  expect(note).toContain(`UP TO ${movementUpTo(moved,'US')} AT A JOINT (OPEN JOINTS, 3/8" GAP)`);
  const si=openJoints(demonstrationProject());si.units='SI';const metric=texts(railLayoutView(snapshot(si)).render().svg).join(' ');
  expect(metric).toContain('28.5 kN FACTORED');expect(metric).toContain('UP TO 4 mm AT A JOINT (OPEN JOINTS, 9.5 mm GAP)');
 });
 it('dimensions T.O.R. to T.O.S. at the top of the W on a capped girder, as the S-00 / S-01 elevations',()=>{
  const p=cappedDemonstrationProject(),t=texts(railKeeperView(snapshot(p)).render().svg),el=runwayElevations(p)!;
  // 6 in rail on the 0.40 in C15 web, no pad: 6 3/8 in, the T.O.R. - T.O.S. difference of the elevations, a reference
  // dimension (in parentheses).
  expect(t).toContain('(6 3/8")');expect(t).not.toContain('6"');
  expect((el.tor-el.tos)/25.4).toBeCloseTo(6+p.section.capTw/25.4,6);
 });
 it('specifies the rail clips in the standard note, with the field-welded base, the pad and the joint',()=>{
  const svg=railKeeperView(snapshot(openJoints(demonstrationProject()))).render().svg,us=texts(svg),all=us.join(' ');
  for(const t of ['RAIL PAD 1/8" X 6", CONT.:','ALLOWABLE COMPRESSION 1.45 KSI','(6 1/8")','T.O.R.','T.O.S.','RAIL CLIP, EACH SIDE (SCHEMATIC):','EACH END OF CLIP BASE (MIN.)'])expect(us).toContain(t);
  expect(all).toContain(`RAIL CLIPS: WELD-ON, PER MANUFACTURER (FICTITIOUS SUPPLIER DATA RC-W6`);
  expect(all).toContain('RATED ≥ 10 KIP LATERAL AND ≥ 5 KIP UPLIFT PER CLIP (ALLOWABLE), IN OPPOSING PAIRS AT 2\'-0" O.C. MAX.');
  expect(all).toContain('FLOATING; WELD BASE TO GIRDER TOP FLANGE PER MANUFACTURER (MIN. 3/8" FILLET X 2 1/2", EACH END OF THE BASE)');
  // The base weld is a field weld; no keeper, lip, notch or anchor-keeper remains.
  expect(svg).toContain('data-weld-location="field"');expect(all).not.toMatch(/KEEPER|NOTCH|\bLIP\b|\bK1\b/);
  expect(all).toContain('FICTITIOUS RP-01 POLYURETHANE CRANE-RAIL PAD');expect(us).not.toContain('FICTITIOUS RP-01 POLYURETHANE CRANE-RAIL PAD');
  // Rail joint: bolt pitch, edge distance to the bar end, the bolt line to the joint centerline and the bar length.
  expect(us.filter(t=>t==='1 1/2"')).toHaveLength(1);expect(us).toContain('1 3/4"');expect(us).toContain('3"');expect(us).toContain('1\'-0 1/2"');
  expect(all).toContain('2 BARS 1 1/4" X 3 3/4" X 1\'-0 1/2", SLOTTED 1 5/16" X 15/16" ALONG THE RAIL');expect(all).toContain('15/16" DRILLED HOLES IN THE RAIL WEB');
  expect(all).toContain('DRILL HOLES AND SAW-CUT ENDS; NO FLAME CUTTING OR PUNCHING');
  const capped=texts(railKeeperView(snapshot(cappedDemonstrationProject())).render().svg);
  expect(capped.some(t=>t.startsWith('RAIL PAD'))).toBe(false);expect(capped).toContain('(6 3/8")');expect(capped.join(' ')).toContain('WELD BASE TO CAP CHANNEL PER MANUFACTURER (MIN. 1/4" FILLET');
  const si=openJoints(demonstrationProject());si.units='SI';
  const metric=texts(railKeeperView(snapshot(si)).render().svg).join(' ');
  expect(metric).not.toMatch(/"|KSI|KIP|\d\.\d{2,} ?mm|\d\.[1-46-9] ?mm/);expect(metric).toContain('10 MPa');expect(metric).toContain('44 kN LATERAL');
 });
 it('states a movement limit rounded up',()=>{
  expect(movementUpTo(3.175,'US')).toBe('1/8"');expect(movementUpTo(3.2,'US')).toBe('5/32"');expect(movementUpTo(25.4,'US')).toBe('1"');
  expect(movementUpTo(30,'US')).toBe('1 3/16"');expect(movementUpTo(.1,'US')).toBe('1/32"');
  expect(movementUpTo(3.94,'SI')).toBe('4 mm');expect(movementUpTo(4,'SI')).toBe('4 mm');expect(movementUpTo(.2,'SI')).toBe('1 mm');
 });
 it('lists the rail pad and the rail clips under MATERIALS',()=>{
  const sheets=[{number:'S-02',title:'DETAILS',details:['RAIL CLIP / SECTION']}];
  const demo=texts(coverSheetSvg(snapshot(demonstrationProject()),sheets)).join(' ');
  expect(demo).toContain('RAIL PAD');expect(demo).toMatch(/1\/8" THICK X 6" WIDE, CONTINUOUS UNDER THE RAIL/);expect(demo).toContain('RAIL CLIPS');
  expect(texts(coverSheetSvg(snapshot(cappedDemonstrationProject()),sheets))).not.toContain('RAIL PAD');
 });
});

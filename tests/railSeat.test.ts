import {describe,it,expect} from 'vitest';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';
import {railPad,railTopAboveSteel,keeperGeometry,anchorGeometry,railInputsWithDefaults,railSeatDefaults} from '../src/engine/railSeat';
import {railKeeperResponse,railAnchorForce} from '../src/engine/railKeeper';
import {railLayout,railAnchors,railMovements,railExpansion,railJointMovement} from '../src/engine/railLayout';
import {railChecks} from '../src/engine/railChecks';
import {runwayElevations} from '../src/engine/drawingData';
import {validateProject} from '../src/engine/calculate';
import {projectSchema,type CalculationSnapshot,type ProjectInput} from '../src/engine/types';
import {railKeeperView} from '../src/components/railKeeperView';
import {railLayoutView,movementUpTo} from '../src/components/railLayoutView';
import {coverSheetSvg} from '../src/components/coverSheet';

const inch=25.4,kip=4448.221615;
const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'));
const snapshot=(p:ProjectInput)=>({input:p,checks:[],errors:[],warnings:[],eligible:true} as unknown as CalculationSnapshot);
/** Rail checks on the wheel-group demands of the 10-ton example (scale 1) or the 2-ton capped example (0.2). */
function checks(p:ProjectInput,scale=1){
 const P=scale*(1.2*8*kip+1.6*(12*kip+.25*20*kip)),H=scale*1.6*2*kip,bins=[{name:'Rated',cycles:1e6,vertical:scale*20*kip,lateral:scale*kip,flangeStress:0,plateStress:0,weldStress:0}];
 for(const b of bins)Object.assign(b,railKeeperResponse(p,b.vertical,b.lateral));
 const detailResults={demands:{railLateral:H,railVertical:P,railFatigueVertical:scale*20*kip,railFatigueLateral:scale*kip},railFatigueBins:bins};
 return railChecks({input:p,detailResults} as unknown as CalculationSnapshot);
}

describe('rail seat: pad, keepers and anchors',()=>{
 it('adds the rail pad to the top of rail in the elevations and load heights',()=>{
  const p=demonstrationProject(),pad=railPad(p)!;
  expect(pad.thickness).toBeCloseTo(.125*inch,10);expect(pad.width).toBeCloseTo(6*inch,10);
  expect(railTopAboveSteel(p)).toBeCloseTo(p.railHeight+pad.thickness,10);
  const e=runwayElevations(p)!;expect(e.tor-e.tos).toBeCloseTo(6.125*inch,10);
  // The light capped example sets its rail directly on the cap web.
  const c=cappedDemonstrationProject();expect(railPad(c)).toBeUndefined();
  const ec=runwayElevations(c)!;expect(ec.tor-ec.tos).toBeCloseTo(c.railHeight+(c.section.kind==='cap'?c.section.capTw:0),10);
 });
 it('loads earlier rail inputs, filling the pad, keeper and anchor defaults',()=>{
  const p=demonstrationProject(),r=p.details!.rail;
  const {padThickness,padWidth,clipBodyWidth,clipClearance,anchorNotch,...legacy}=r;
  void padThickness;void padWidth;void clipBodyWidth;void clipClearance;void anchorNotch;
  p.details!.rail=legacy as typeof r;
  expect(projectSchema.safeParse(p).success).toBe(true);
  const k=keeperGeometry(p.details!.rail,railPad(p)!.thickness);
  expect(railPad(p)!.thickness).toBe(railSeatDefaults.padThickness);expect(k.clearance).toBe(railSeatDefaults.clipClearance);expect(k.bodyWidth).toBe(r.clipThickness);
  const shown=railInputsWithDefaults(p.details!.rail),keys=Object.keys(shown);
  expect(keys.indexOf('padThickness')).toBe(keys.indexOf('padSource')+1);expect(keys.indexOf('clipBodyWidth')).toBe(keys.indexOf('clipThickness')+1);
  expect(shown.clipClearance).toBe(inch/16);expect(shown.anchorNotch).toBe(railSeatDefaults.anchorNotch);
 });
 it('locates the keeper clear of the rail-base toe and the anchor keeper in its notch',()=>{
  const p=demonstrationProject(),k=keeperGeometry(p.details!.rail,railPad(p)!.thickness),a=anchorGeometry(p.details!.rail,railPad(p)!.thickness);
  expect(k.toe/inch).toBeCloseTo(3,10);expect(k.inner/inch).toBeCloseTo(3.0625,10);expect(k.outer/inch).toBeCloseTo(5.4375,10);expect(k.tip/inch).toBeCloseTo(2.5,10);
  // 2 3/8 in body, 3/8 in fillets: the end fillets are 2 in, over 4w = 1 1/2 in (AISC 360-16 J2.2b).
  expect(k.overlap/inch).toBeCloseTo(.5,10);expect(k.height/inch).toBeCloseTo(.125+.75+.75,10);expect(k.endWeld/inch).toBeCloseTo(2,10);
  expect(a.engagement/inch).toBeCloseTo(.4375,10);expect(a.endWeld/inch).toBeCloseTo(1.875,10);expect(a.inner/inch).toBeCloseTo(2.5625,10);
  // The keeper end bears on the flat notch end beyond the 1/4 in radius corner hole: 1/2 - 1/4 = 1/4 in.
  expect(a.cornerRadius/inch).toBeCloseTo(.25,10);expect(a.bearing/inch).toBeCloseTo(.25,10);
  expect(validateProject(p)).toEqual([]);expect(validateProject(cappedDemonstrationProject())).toEqual([]);
 });
 it('checks the rail float plus the setting tolerance against the design eccentricity',()=>{
  const p=demonstrationProject(),float=checks(p).find(c=>c.id==='rail-keeper-float')!;
  expect(float.demand!/inch).toBeCloseTo(1/16+1/8,10);expect(float.capacity!/inch).toBeCloseTo(.25,10);expect(float.status).toBe('pass');
  // The former 13/16 in clearance lets the rail float far past the 1/4 in design eccentricity.
  p.details!.rail.clipClearance=13/16*inch;expect(checks(p).find(c=>c.id==='rail-keeper-float')!.status).toBe('fail');
 });
 it('checks the pad only where one is specified, and the anchor and keeper welds',()=>{
  const demo=checks(demonstrationProject()),capped=checks(cappedDemonstrationProject(),.2);
  expect(demo.find(c=>c.id==='rail-pad')).toBeDefined();expect(capped.find(c=>c.id==='rail-pad')).toBeUndefined();
  for(const c of [demo,capped])for(const id of ['rail-keeper-weld','rail-anchor-weld','rail-anchor-bearing','rail-keeper-flexure','rail-flange-local'])expect(c.find(v=>v.id===id)?.status).toBe('pass');
  expect(railAnchorForce(demonstrationProject()).force/kip).toBeCloseTo(1.6*4,6);
 });
 it('anchors each rail piece at mid-length and closes each joint by the growth from both anchors',()=>{
  const p=demonstrationProject(),layout=railLayout(p),anchors=railAnchors(p,layout),moves=railMovements(p,layout),dT=p.details!.rail.temperatureRange;
  layout.rails.forEach((rail,i)=>{
   const stations=[rail.start,...rail.joints,rail.end];
   expect(anchors[i].anchors.map(a=>a.station)).toEqual(rail.pieces.map((_,j)=>(stations[j]+stations[j+1])/2));
   rail.joints.forEach((j,n)=>expect(moves.joints.find(v=>v.side===rail.side&&v.station===j)!.movement).toBeCloseTo(railExpansion*dT*(rail.pieces[n]+rail.pieces[n+1])/2,8));
  });
 });
 it('dimensions T.O.R. to T.O.S. at the top of the W on a capped girder, as the S-00 / S-01 elevations',()=>{
  const p=cappedDemonstrationProject(),t=texts(railKeeperView(snapshot(p)).render().svg),el=runwayElevations(p)!;
  // 6 in rail on the 0.40 in C15 web, no pad: 6 3/8 in, the T.O.R. - T.O.S. difference of the elevations.
  expect(t).toContain('6 3/8"');expect(t).not.toContain('6"');
  expect((el.tor-el.tos)/25.4).toBeCloseTo(6+p.section.capTw/25.4,6);
 });
 it('draws and specifies the pad, the keeper and its welds, the anchor and the joint dimensions',()=>{
  const us=texts(railKeeperView(snapshot(demonstrationProject())).render().svg);
  // K1: 9/16 in projection and 2 3/8 in body (2 15/16 in), 3/4 in lip and 7/8 in under it (1 5/8 in); 3/8 in fillets,
  // 3 7/8 in on the outer face and 2 in on each end.
  for(const t of ['RAIL PAD 1/8" X 6", CONT.:','FICTITIOUS RP-01 POLYURETHANE CRANE-RAIL PAD','ALLOWABLE COMPRESSION 1.45 KSI','6 1/8"','T.O.R.','T.O.S.','OUTER FACE, EACH KEEPER','BOTH ENDS OF EACH KEEPER, STOPPED','KEEPER K1 / SECTION','KEEPERS AND RAIL ANCHOR / PLAN','2 3/8"','9/16"','2 15/16"','3/4"','7/8"','1 5/8"','3/8','2','3 7/8'])expect(us).toContain(t);
  expect(us.join(' ')).toContain('1/16" CLEAR OF RAIL-BASE TOE');expect(us.join(' ')).not.toContain('ROOT FILLETS');
  // Rail joint: bolt pitch, edge distances to the bar end and the rail end, bar length.
  expect(us.filter(t=>t==='1 1/2"')).toHaveLength(2);expect(us).toContain('3"');expect(us).toContain('1\'-0 3/8"');
  const capped=texts(railKeeperView(snapshot(cappedDemonstrationProject())).render().svg);
  expect(capped.some(t=>t.startsWith('RAIL PAD'))).toBe(false);expect(capped).toContain('6 3/8"');
  const si=demonstrationProject();si.units='SI';
  const metric=texts(railKeeperView(snapshot(si)).render().svg).join(' ');
  expect(metric).not.toMatch(/"|KSI|KIP|\d\.\d{2,} ?mm|\d\.[1-46-9] ?mm/);expect(metric).toContain('10 MPa');expect(metric).toContain('1.5 mm CLEAR');
 });
 it('specifies the rail fabrication, the anchor notch corner holes and the slotted joint bars',()=>{
  const svg=railKeeperView(snapshot(demonstrationProject())).render().svg,note=texts(svg).join(' ');
  // Joint: the bars are slotted (their net section and block shear are checked so); the rail web is drilled.
  expect(note).toContain('2 BARS 1 1/4" X 3 7/8" X 1\'-0 3/8", SLOTTED 1 5/16" X 15/16" ALONG THE RAIL');
  expect(note).toContain('15/16" DRILLED HOLES IN THE RAIL WEB');
  // Notches with drilled corner holes, and how rail steel is cut.
  expect(note).toContain('K1 IN NOTCHES 1/2" X 4" IN BOTH RAIL-BASE TOES AND THE PAD, 1/2" DRILLED HOLES CENTERED ON THE NOTCH CORNERS');
  expect(note).toContain('END FILLETS 1 7/8".');
  for(const t of ['DRILL HOLES, THEN SAW-CUT OR MILL ENDS AND NOTCHES','NO FLAME CUTTING OR PUNCHING','MT NOTCH CORNERS','CONFIRM NOTCHING WITH THE RAIL SUPPLIER'])expect(note).toContain(t);
  // Each corner hole: two seen quarter arcs beyond the notch end, one hidden under the anchor keeper.
  const plan=svg.slice(svg.indexOf('data-view="keeper-plan"'));
  expect(plan.match(/<path class="rail-line" d="M[^"]*A/g)).toHaveLength(4);expect(plan.match(/<path class="hidden-line" d="M[^"]*A/g)).toHaveLength(2);
 });
 it('closes the keeper K1 dimension strings in SI',()=>{
  // The 10-ton keeper read 14.5 + 51 = 65 and 19 + 22 = 41.5 mm at half-millimetre rounding.
  const piece=(p:ProjectInput)=>{p.units='SI';const svg=railKeeperView(snapshot(p)).render().svg,g=svg.slice(svg.indexOf('data-view="keeper-piece"'));
   return texts(g.slice(0,g.indexOf('</g>'))).map(t=>Number(t.replace(' mm','')));};
  // Text order: overall width, projection and body, lip and body height, overall height.
  const close=(v:number[])=>{expect(v[1]+v[2]).toBe(v[0]);expect(v[3]+v[4]).toBe(v[5]);};
  const demo=piece(demonstrationProject());expect(demo).toEqual([75,14,61,19,22,41]);close(demo);
  close(piece(cappedDemonstrationProject()));
  // Odd entered sizes still close, each part within a millimetre of its true size.
  const odd=demonstrationProject();Object.assign(odd.details!.rail,{clipProjection:.53*inch,clipBodyWidth:2.47*inch,clipThickness:.77*inch,baseThickness:.81*inch});
  const v=piece(odd);close(v);
  [.53,2.47,.77].forEach((x,i)=>expect(Math.abs(v[[1,2,3][i]]-x*inch)).toBeLessThan(1));
 });
 it('marks the rail anchors on the joint layout and states the longitudinal restraint',()=>{
  const p=demonstrationProject(),svg=railLayoutView(snapshot(p)).render().svg,layout=railLayout(p);
  expect(svg.match(/data-rail-anchor=/g)).toHaveLength(layout.rails.reduce((n,r)=>n+r.pieces.length,0));
  const note=texts(svg).join(' ');
  expect(note).toContain('RAIL ANCHORS');expect(note).toContain('6.4 KIP FACTORED');expect(note).toContain('CREEP');
  expect(note).toContain('SAW-CUT THE SHORTER PIECES SHOWN, NO FLAME CUTTING');
  // The computed joint closure (3.94 mm, the thermal check's movement), rounded up, with the gap it closes.
  const moved=railJointMovement(railMovements(p));expect(moved).toBeCloseTo(3.94,2);
  expect(note).toContain(`UP TO ${movementUpTo(moved,'US')} AT A JOINT (3/8" GAP)`);expect(movementUpTo(moved,'US')).toBe('5/32"');
  const si=demonstrationProject();si.units='SI';const metric=texts(railLayoutView(snapshot(si)).render().svg).join(' ');
  expect(metric).toContain('28.5 kN FACTORED');expect(metric).toContain('UP TO 4 mm AT A JOINT (9.5 mm GAP)');
 });
 it('states a movement limit rounded up',()=>{
  expect(movementUpTo(3.175,'US')).toBe('1/8"');expect(movementUpTo(3.2,'US')).toBe('5/32"');expect(movementUpTo(25.4,'US')).toBe('1"');
  expect(movementUpTo(30,'US')).toBe('1 3/16"');expect(movementUpTo(.1,'US')).toBe('1/32"');
  expect(movementUpTo(3.94,'SI')).toBe('4 mm');expect(movementUpTo(4,'SI')).toBe('4 mm');expect(movementUpTo(.2,'SI')).toBe('1 mm');
 });
 it('lists the rail pad under MATERIALS when the project has one',()=>{
  const sheets=[{number:'S-02',title:'DETAILS',details:['RAIL KEEPER / GIRDER ATTACHMENT']}];
  const demo=texts(coverSheetSvg(snapshot(demonstrationProject()),sheets)).join(' ');
  expect(demo).toContain('RAIL PAD');expect(demo).toMatch(/1\/8" THICK X 6" WIDE, CONTINUOUS UNDER THE RAIL/);
  expect(texts(coverSheetSvg(snapshot(cappedDemonstrationProject()),sheets))).not.toContain('RAIL PAD');
 });
});

import {describe,it,expect} from 'vitest';
import {cappedDemonstrationProject,demonstrationProject} from '../src/engine/demonstration';
import {flangeTieGeometry,tieRelease} from '../src/engine/tieGeometry';
import {flangeTieResponse,flangeTieChecks} from '../src/engine/flangeTieDesign';
import {validateRunwayDetails} from '../src/engine/detailValidation';
import {parallelWeldGroup} from '../src/engine/connectionStrength';
import {automaticFatigueDetails} from '../src/engine/detailAnalysis';
import {flangeTieTopic,flangeTieSheetSvg} from '../src/components/flangeTieSheet';
import type {CalculationSnapshot,ProjectInput} from '../src/engine/types';
const inch=25.4;
describe('direct flange attachment',()=>{
 it('fits wholly on its own girder, clear of cap legs, stiffeners and the rolled root',()=>{
  const p=cappedDemonstrationProject(),g=flangeTieGeometry(p)!,b=p.section,t=p.details!.brace;
  expect(validateRunwayDetails(p)).toEqual([]);
  expect(g.stations).toHaveLength(6);
  for(const v of g.stations){
   expect(v.tieX-g.attachment.saddleLength/2).toBeGreaterThanOrEqual(v.start);
   expect(v.tieX+g.attachment.saddleLength/2).toBeLessThanOrEqual(v.finish);
   expect(Math.abs(v.tieX-v.center)).toBeCloseTo(3.5*inch);
  }
  const capBottom=b.d/2+b.capTw-b.capDepth;
  expect(capBottom-(g.topCenter+t.width/2)).toBeCloseTo(.25*inch);
  expect(g.freeLength).toBeCloseTo(9*inch);
  expect(t.connection.gauge).toBeGreaterThan(8*t.connection.diameter/3);
 });
 it('matches independent section-modulus and virtual-work strip bounds',()=>{
  const p=cappedDemonstrationProject(),g=flangeTieGeometry(p)!,t=p.details!.brace,F=10000,r=flangeTieResponse(p,F);
  const B=4*inch,ts=1.375*inch,L=g.rootLength,h=r.h,H=h-ts;
  const flangeZ=B*p.section.tf**2/6;
  expect(r.flange).toBeCloseTo(F*h/flangeZ+1.5*F/(B*p.section.tf),8);
  // q=6FH/L²; center-loaded simple strip: m=qB/4; f=6m/ts².
  expect(r.saddle).toBeCloseTo(6*(6*F*H/L**2*B/4)/ts**2+1.5*F/(L*ts),8);
  // Flange strip loaded by the gusset couple along the saddle root: [g_web + (13/35)L]/(EI), plus the other parts.
  expect(r.compliance).toBeGreaterThan(h*h*(g.rootStart-p.section.tw/2+13/35*L)/(p.section.E*(B*p.section.tf**3/12)));
  const twice=flangeTieResponse(p,2*F);
  for(const key of ['gusset','saddle','flange','column','rootWeld'] as const)expect(twice[key]).toBeCloseTo(2*r[key],8);
  expect(twice.compliance).toBe(r.compliance);
  expect(r.gussetWeld.demand).toBeGreaterThan(F/(2*L*g.attachment.weldSize/Math.sqrt(2)));
  expect(t.width).toBeCloseTo(5*inch);
 });
 it('fails insufficient spacing and local plate resistance rather than suppressing the checks',()=>{
  const p=cappedDemonstrationProject(),snapshot={input:p,detailResults:{demands:{braceFatigue:4000}}} as CalculationSnapshot;
  expect(flangeTieChecks(snapshot,10000).filter(c=>c.status==='fail')).toEqual([]);
  p.details!.brace.flangeAttachment!.longitudinalSetback=2*inch;
  expect(flangeTieChecks(snapshot,10000).find(c=>c.id==='flange-tie-stiffener-clearance')?.status).toBe('fail');
  p.details!.brace.flangeAttachment!.saddleThickness=.25*inch;
  expect(flangeTieChecks(snapshot,10000).find(c=>c.id==='flange-tie-saddle')?.status).toBe('fail');
 });
 it('rejects a shortened connection or displaced saddle that leaves its assigned end',()=>{
  const p=cappedDemonstrationProject();p.details!.brace.connectionLength=inch;
  expect(validateRunwayDetails(p).some(v=>v.includes('full flange-to-end extension'))).toBe(true);
  p.details!.brace.flangeAttachment!.longitudinalSetback=8*inch;
  expect(validateRunwayDetails(p).some(v=>v.includes('own girder end'))).toBe(true);
 });
});

describe('saddle-to-flange weld, gusset sizing and cap coordination',()=>{
 const snapshot=(p:ProjectInput)=>({input:p,checks:[],detailResults:{demands:{braceFatigue:4000}}}) as unknown as CalculationSnapshot;
 const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'));
 const welds=(svg:string)=>svg.match(/<g data-multileader="weld"/g)??[];
 it('welds the saddle to the flange only by two full-width transverse end fillets, and checks exactly those',()=>{
  for(const p of [demonstrationProject(),cappedDemonstrationProject()]){
   const g=flangeTieGeometry(p)!,a=g.attachment,F=10000,r=flangeTieResponse(p,F);
   expect(g.endWeldLength).toBeCloseTo(g.rootLength,9);
   // Two weld lines along the tie, each the saddle width, at the saddle ends a saddle length apart; moment F·h.
   const ref=parallelWeldGroup({length:g.rootLength,gauge:a.saddleLength,size:a.weldSize,Fexx:p.details!.material.Fexx,method:p.method,vx:0,vy:F,normal:0,mx:F*r.h,my:0,mz:0});
   expect(r.saddleWeld.demand).toBeCloseTo(ref.demand,9);
   const check=flangeTieChecks(snapshot(p),F).find(c=>c.id==='flange-tie-saddle-weld')!;
   expect(check.title).toBe('Saddle-to-flange transverse end fillets');expect(check.note).toContain('two transverse end fillets');
  }
 });
 it('puts the toe of each end fillet on the flange in the fatigue register',()=>{
  const p=demonstrationProject(),g=flangeTieGeometry(p)!,a=g.attachment,toes=automaticFatigueDetails(p).filter(v=>v.id.startsWith('SA'));
  expect(toes).toHaveLength(2*g.stations.length);
  for(const [i,v] of g.stations.entries())for(const sign of [-1,1]){
   const toe=toes.find(f=>f.id===`SA${i}-${sign}-top-right`)!;
   expect(toe.x).toBeCloseTo(v.tieX+sign*(a.saddleLength/2+a.weldSize),9);
   // A 4 in short attachment welded across the flange: AISC Table A-3.1 item 7.1, Category D.
   expect(toe.category).toBe('D');expect(toe.reference).toContain('item 7.1');expect(toe.reference).toContain('transverse end fillet');
  }
 });
 it('rounds the column gusset up to a practical size with a slot tolerance and stops the bars clear of the column',()=>{
  for(const p of [demonstrationProject(),cappedDemonstrationProject()]){
   const g=flangeTieGeometry(p)!,r=tieRelease(p)!,c=p.details!.brace.connection;
   expect(g.columnGusset/(inch/4)).toBeCloseTo(Math.round(g.columnGusset/(inch/4)),9);
   expect((g.columnGusset-c.gauge)/2-r.travel).toBeGreaterThanOrEqual(r.edge+inch/16);
   expect(g.columnGusset).toBeCloseTo(5.5*inch,9);
   expect(g.barGap).toBeCloseTo(.5*inch,9);expect(g.barEnd).toBeCloseTo(g.face-.5*inch,9);expect(g.start).toBeCloseTo(g.barEnd-p.details!.brace.length,9);
   expect(g.columnGussetLength).toBeCloseTo(g.connection+.5*inch,9);
   expect(validateRunwayDetails(p)).toEqual([]);
  }
  // The bars stop below the toe of the 3/8 in gusset-to-saddle fillets on the rolled demonstration.
  const p=demonstrationProject(),g=flangeTieGeometry(p)!;
  expect(g.topDrop-p.details!.brace.width/2-g.attachment.saddleThickness).toBeCloseTo(.5*inch,9);
  expect(flangeTieChecks(snapshot(p),10000).find(c=>c.id==='flange-tie-bar-saddle-clearance')!.status).toBe('pass');
 });
 it('keeps the girder gusset at least 1/2 in clear of the cap channel flange',()=>{
  const p=cappedDemonstrationProject(),g=flangeTieGeometry(p)!,b=p.section;
  expect(g.capFlange).toBeCloseTo(b.capWidth/2-b.capTf,9);expect(g.capClear).toBeCloseTo(g.capFlange!-g.gussetEnd,9);
  const ok=flangeTieChecks(snapshot(p),10000).find(c=>c.id==='flange-tie-cap-clearance')!;
  expect(ok.status).toBe('pass');expect(ok.capacity).toBeGreaterThanOrEqual(.5*inch);
  // Shorter bars push the gusset toward the channel flange.
  p.details!.brace.length=p.details!.brace.reach=17.5*inch;
  expect(flangeTieChecks(snapshot(p),10000).find(c=>c.id==='flange-tie-cap-clearance')!.status).toBe('fail');
  expect(flangeTieChecks(snapshot(demonstrationProject()),10000).some(c=>c.id==='flange-tie-cap-clearance')).toBe(false);
 });
 it('draws one A2.4 symbol per joint with its size and length, the column, and the cap in the tie views',()=>{
  const p=cappedDemonstrationProject(),t=flangeTieTopic(snapshot(p))!;
  const section=t.views[0].render().svg,plan=t.views[1].render().svg,saddle=t.views[2].render().svg;
  // Transverse section: saddle-to-flange (arrow side), gusset-to-saddle (both sides) and the column root (both sides, field).
  const sectionWelds=welds(section);expect(sectionWelds).toHaveLength(3);
  // Lengths right of the triangles: once for the arrow-side saddle weld, on both sides for the both-sides welds.
  expect(texts(section).filter(v=>v==='3 1/4')).toHaveLength(3);expect(texts(section).filter(v=>v==='5 1/2')).toHaveLength(2);
  expect(texts(section)).toContain('SADDLE TO FLANGE, EACH END; {{REF:SADDLE%20%2F%20LONGITUDINAL%20SECTION}}');
  expect(texts(section)).toContain('7/8" CLR. TO CAP FLANGE (1/2" MIN.)');expect(section).toContain('data-field-weld="true"');
  // The existing column flange is drawn dashed beside the column gusset.
  expect(section.match(/class="reference-line"/g)!.length).toBeGreaterThanOrEqual(2);
  // Saddle section: one symbol at each saddle end and one for the gusset; the bars, filler, bolts and cap web are drawn.
  expect(welds(saddle)).toHaveLength(3);expect(texts(saddle).filter(v=>v==='3 1/4')).toHaveLength(4);
  expect(texts(saddle)).toEqual(expect.arrayContaining(['C15X33.9 CAP WEB AND','W24X94 TOP FLANGE','5/8" A325 SC BOLTS (BEYOND)']));
  expect(saddle).not.toContain('BOTH EDGES');
  // Plan: the column gusset welds carry their length; the W flange tips and channel flanges are hidden under the cap.
  expect(texts(plan)).toContain('5 1/2');
  expect(plan.match(/hidden-line/g)!.length).toBeGreaterThan(12);
 });
 it('shows no imperial units or soft-converted decimals on the SI tie views and notes',()=>{
  const p=cappedDemonstrationProject();p.units='SI';
  const words=texts(flangeTieSheetSvg(snapshot(p))).join(' ');
  expect(words).not.toMatch(/KSI|\d"|\d\/\d/);expect(words).toContain('FY 345 MPa MIN.');
  // Whole millimetres, or half millimetres under 25 mm.
  const values=[...words.matchAll(/([\d,]+(?:\.\d+)?) mm/g)].map(m=>Number(m[1].replace(/,/g,'')));
  expect(values.length).toBeGreaterThan(40);
  expect(values.filter(v=>v>=25?!Number.isInteger(v):!Number.isInteger(2*v))).toEqual([]);
 });
});

import {describe,expect,it} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';
import {endStopChecks,endStopGeometry} from '../src/engine/endStop';
import {stiffenerTieGeometry} from '../src/engine/tieGeometry';
import {stiffenerTieChecks} from '../src/engine/flangeTieDesign';
import {tieMovements} from '../src/engine/tieMovement';
import {connectionTopic} from '../src/components/connectionSheet';
import {flangeTieTopic,flangeTieSheetSvg} from '../src/components/flangeTieSheet';
import {endStopTopic,endStopSheetSvg} from '../src/components/endStopSheet';
import {structuralGeneralNotes} from '../src/components/structuralNotes';
import {annotationClashes} from '../src/components/detailSheet';
import {withDetailRoom} from '../src/components/sheetGraphics';
import type {CalculationSnapshot} from '../src/engine/types';

const inch=25.4,foot=304.8,kip=4448.2216152605;
const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'));
const demo=calculate(demonstrationProject());
/** The rolled demonstration drawn as a continuous girder without flange saddles; drawings read the input only. */
const continuous=(bolted=true)=>{const s=structuredClone(demo);s.input.system='continuous';s.input.details!.brace.flangeAttachment!.enabled=false;s.input.details!.endBearing!.enabled=bolted;return s;};
const view=(s:CalculationSnapshot,title:string)=>connectionTopic(s).views.find(v=>v.title===title)!;

describe('end stop stiffeners braced to the face plate',()=>{
 it('checks the stiffener-to-face-plate welds for the shear flow and the bumper reaction by hand',()=>{
  const p=demo.input,e=p.details!.endStop!,g=endStopGeometry(p,e),checks=Object.fromEntries(endStopChecks(p).map(c=>[c.id,c]));
  // Stiffeners reach the top of the 6 in contact, 11 in above the base plate, and stop an inch below the face top.
  expect(g.stiffenerHeight).toBeCloseTo(14*inch,9);
  // Face 9 x 1 and two 3/4 x 9 stiffeners: centroid 3.5 in back, I = 226.875 in^4, Q of the face 27 in^3.
  const flow=20*kip*27*inch**3/(226.875*inch**4)/4,push=20*kip*(.5+.25/3)/(2*6*inch);
  expect(checks['end-stop-stiffener-weld'].demand).toBeCloseTo(Math.hypot(flow,push)/(.3125*inch/Math.SQRT2),6);
  expect(checks['end-stop-stiffener-weld'].capacity).toBeCloseTo(.75*.6*p.details!.material.Fexx,6);
  // Outstand 6/2 + 1/4 - 3/2 - 3/8 = 1 3/8 in under the contact pressure P/d_b^2.
  expect(checks['end-stop-face-outstand'].demand).toBeCloseTo(6*(20*kip/(6*inch)**2)*(1.375*inch)**2/2/inch**2,6);
  for(const id of ['end-stop-stiffener-weld','end-stop-face-outstand','end-stop-face'])expect(checks[id].status).toBe('pass');
  // A stiffener that cannot carry the face plate fails.
  const q=structuredClone(p);q.cranes[0].design!.bumperForce*=8;expect(endStopChecks(q).find(c=>c.id==='end-stop-stiffener-weld')!.status).toBe('fail');
 });
 it('calls the stiffener-to-face fillets in the elevation, the plan and the shop note',()=>{
  const t=endStopTopic(demo),[elevation,plan,section]=t.views.map(v=>texts(v.render().svg).join(' | '));
  expect(elevation).toContain('STIFFENERS TO FACE PL,');expect(elevation).toContain('BOTH SIDES, FULL HEIGHT');expect(elevation).toContain('FACE PL AND STIFFENERS TO');
  expect(plan).toContain('TYP. BOTH STIFFENERS TO FACE PL');expect(section).toContain('WELDED TO FACE PL FULL HEIGHT');
  expect(texts(endStopSheetSvg(demo)).join(' ')).toContain('AND EACH STIFFENER TO THE FACE PLATE OVER ITS FULL HEIGHT');
 });
});

describe('continuous girder bearings, ties and end connection',()=>{
 it('bolts every bearing to its seat: one locating support, the others slotted',()=>{
  const s=continuous(),v=view(s,'GIRDER BEARINGS / LOCATING AND SLIDING'),t=texts(v.render().svg).join(' | ');
  expect(connectionTopic(s).views.some(v=>v.title==='GIRDER WEB / END CONNECTION')).toBe(false);
  expect(t).toContain('LOCATING, GRID 2');expect(t).toContain('SLIDING, GRIDS 1, 3, 4');expect(t).toContain('LOCATING: 4 - 3/4" A325 SC,');
  expect(t).toContain('SLOT IN FLANGE FOR 1/2" EA. WAY');expect(t).toContain('AT RUNWAY ENDS THE BEARING PL STARTS AT THE GIRDER END');
  expect(structuralGeneralNotes(s).join(' ')).toContain('STANDARD HOLES AT THE LOCATING SUPPORT (GRID 2)');
  // The sliding bearings travel with the thermal strain from the locating support, so the ties do too.
  expect(tieMovements(s).thermal).toBeCloseTo(12e-6*50*foot*30,6);
 });
 it('attaches the girder-side tie gusset to the bearing stiffener with a CJP and checks it',()=>{
  const s=continuous(),p=s.input,g=stiffenerTieGeometry(p)!,d=p.details!;
  expect(g.sides).toEqual([1]);expect(g.root).toBeCloseTo(p.section.tw/2+d.bearing.stiffenerWidth,9);
  expect(g.start-g.root).toBeCloseTo(.25*inch,9);expect(g.face-g.start).toBeCloseTo(d.brace.length,9);
  const F=10*kip,checks=Object.fromEntries(stiffenerTieChecks(s,F).map(c=>[c.id,c]));
  expect(checks['tie-stiffener-cjp'].capacity).toBeCloseTo(.9*d.material.Fy*Math.min(d.brace.gussetThickness,d.bearing.stiffenerThickness)*d.brace.width,6);
  expect(Object.values(checks).every(c=>c.status==='pass')).toBe(true);
  const svg=view(s,'FLANGE TIE / COLUMN CONNECTION').render().svg,t=texts(svg).join(' | ');
  expect(svg).toContain('data-weld="cjp"');expect(t).toContain('GIRDER GUSSET TO TIE-SIDE BEARING');expect(t).toContain('PLAN; TIE AT TOP FLANGE');
  expect(t).toContain('GIRDER GUSSET PL 3/4" X 5" X 5"');expect(t).toContain('COLUMN GUSSET PL 3/4"');
 });
 it('names the mating part of every weld of the girder web end connection',()=>{
  const t=texts(view(continuous(false),'GIRDER WEB / END CONNECTION').render().svg).join(' | ');
  expect(t).toContain('BOLTS THRU GIRDER WEB');expect(t).toContain('ONE EACH SIDE OF GIRDER WEB');
  expect(t).toContain('EACH COVER PL TO END PL, OUTER FACE');expect(t).toContain('COLUMN-SIDE END PL (REF.); END PL AND');
  expect(t).not.toContain('CENTRAL WEB');
 });
 it('draws the continuous details as clear in a taller cell',()=>{
  for(const units of ['US','SI'] as const)for(const bolted of [true,false]){
   const s=continuous(bolted);s.input.units=units;
   for(const v of connectionTopic(s).views){const standard=v.render(),roomy=withDetailRoom(4/3,()=>v.render());
    expect(annotationClashes(standard.svg),`${units} ${v.title}`).toBe(0);expect(annotationClashes(roomy.svg),`${units} ${v.title} roomy`).toBe(0);}
  }
 });
});

describe('dimensions and weld callouts of the tie, keeper and bearing details',()=>{
 it('chains the girder-end bolts, dimensions the bolt gauge and gussets and draws the release filler',()=>{
  const t=flangeTieTopic(demo)!,section=t.views[0].render().svg,words=texts(section).join(' | ');
  expect(words).not.toContain('1 1/4" + 2 1/4"');expect(texts(section)).toEqual(expect.arrayContaining(['1 1/4"','2 1/4"','2 1/2"']));
  expect(words).toMatch(/GIRDER GUSSET \| PL 3\/4" X 5 1\/4" X [\d /]+"; 1\/16" FILLER \(HIDDEN\)/);expect(words).toContain('COLUMN GUSSET PL 3/4" X 5 3/16" X 4 3/4"');
  // Tie and girder end located from the stiffener at each girder end of the shared support.
  const plan=texts(t.views[1].render().svg);
  expect(plan.filter(v=>v==='0\'-3 1/2"')).toHaveLength(2);expect(plan.filter(v=>v==='0\'-6 1/4"')).toHaveLength(2);
  const saddle=t.views[2].render().svg;expect(texts(saddle)).toEqual(expect.arrayContaining(['BOTH EDGES','GUSSET TO SADDLE']));
  const notes=texts(flangeTieSheetSvg(demo)).join(' ');
  expect(notes).toContain('NO HOLES OR CUTS THROUGH THE W FLANGES EXCEPT THOSE DETAILED FOR THE END BEARINGS AND END STOPS.');
  expect(notes).toMatch(/TIE LOCAL AND MOVEMENT CHECKS: SEE CALCULATION REPORT \(MAX\. D\/C \d\.\d\d\)\./);
 });
 it('dimensions the keeper, its clearance to the rail base, its lip bearing and length',()=>{
  const t=texts(view(demo,'RAIL KEEPER / GIRDER ATTACHMENT').render().svg);
  // K1: 2 9/16 overall, 2 body, 9/16 lip projection, 3/4 lip, 7/8 under the lip, 1 5/8 high, 3 7/8 long.
  expect(t).toEqual(expect.arrayContaining(['K1 1/16" CLEAR OF RAIL-BASE TOE (1/8" MAX.),','LIP BEARS 1/2"; SHIM, WELD, REMOVE SHIM','2 9/16"','2"','9/16"','3/4"','7/8"','1 5/8"','3 7/8"','3 7/8" LONG ALONG THE RAIL']));
 });
 it('gives the capped bearing stiffeners a CJP groove callout at the top flange and fits the bottom end only',()=>{
  const s=calculate(cappedDemonstrationProject()),svg=view(s,'GIRDER BEARING / COLUMN BRACKET').render().svg,t=texts(svg).join(' | ');
  expect(svg).toContain('data-weld="cjp"');expect(t).toContain('CJP TO W TOP FLANGE');expect(t).toContain('FIT BOTTOM END');
  expect(t).not.toContain('TOP CJP');expect(t).not.toContain('FIT / MILL');
 },240000);
});

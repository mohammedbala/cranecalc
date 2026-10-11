import {describe,it,expect,beforeAll} from 'vitest';
import * as THREE from 'three';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';
import {calculate as calculateProject,validateProject} from '../src/engine/calculate';
import {withColumnReviewData} from './fixtures/columnReviewData';
import {selectTieArrangement,tieOptions,connectionOptionChecks} from '../src/engine/connectionOptions';
import {flangeTieGeometry,tieRelease,tiePlies,tieEccentricity} from '../src/engine/tieGeometry';
import {braceSystem} from '../src/engine/detailAnalysis';
import {flangeTieResponse} from '../src/engine/flangeTieDesign';
import {plateFitOffset,validatePlateTie} from '../src/engine/plateTie';
import {validateRunwayDetails} from '../src/engine/detailValidation';
import {boltProperties} from '../src/engine/connectionStrength';
import {aiscShapeByName} from '../src/data/aiscSections';
import {drawingSheetSet} from '../src/components/planSheet';
import {flangeTieTopic} from '../src/components/flangeTieSheet';
import {buildIndependentSupports} from '../src/components/independentSupportGeometry';
import {createHardwareBuilder} from '../src/components/connectionDetails';
import {references} from '../src/engine/references';
import type {CalculationSnapshot,ProjectInput} from '../src/engine/types';
// Review G2: supply the supporting-column records so the package can pass and export.
const calculate=(p:Parameters<typeof calculateProject>[0])=>calculateProject(withColumnReviewData(p));

const inch=25.4,ksi=6.894757293168;
/** The 10-ton demonstration with one 1/2 in flexible plate on 1 in gussets (the documented test project). */
export function plateDemonstration(){
 const p=demonstrationProject();p.details=selectTieArrangement(p.details!,'flexible-plate');
 const t=p.details.brace;Object.assign(t,{thickness:.5*inch,gussetThickness:inch,length:25.25*inch,reach:25.25*inch});
 Object.assign(t.connection,{thickness:.5*inch,weldSize:7/16*inch});Object.assign(t.flangeAttachment!,{weldSize:.5*inch,longitudinalSetback:3.75*inch});
 // The rail twist limit of this example is reached with the stiffer paired bars: design for the 3/16 in rail-to-web
 // offset that the keeper float and the setting tolerance permit.
 p.railEccentricity=3/16*inch;
 return p;
}
/**
 * The 2-ton capped demonstration with one 1/4 in flexible plate, 6 in wide on a 6 in column gusset: on the 0.71 in
 * W14X90 flange the lap couple's local fatigue needs the taller root (5 1/4 in plate on 5 3/4 in: 1.02).
 */
export function cappedPlateDemonstration(){
 const p=cappedDemonstrationProject();p.details=selectTieArrangement(p.details!,'flexible-plate');
 Object.assign(p.details.brace,{thickness:.25*inch,width:6*inch});Object.assign(p.details.brace.connection,{thickness:.25*inch,pitch:1.75*inch,weldLength:6*inch});
 return p;
}
const check=(s:CalculationSnapshot,id:string)=>s.checks.find(c=>c.id===id)!;
const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'));

describe('flexible plate tieback selection and validation',()=>{
 it('is a designed option that keeps the bracket and flange-tie dimensions',()=>{
  expect(tieOptions.find(o=>o.id==='flexible-plate')?.status).toBe('Component checks available');
  const p=demonstrationProject(),before=structuredClone(p.details!.bracket);p.details=selectTieArrangement(p.details!,'flexible-plate');
  expect(p.details.bracket).toEqual(before);expect(p.details.brace.flangeAttachment?.enabled).toBe(true);
  expect(connectionOptionChecks(p)).toEqual([]);expect(tiePlies(p)).toBe(1);expect(flangeTieGeometry(p)?.plies).toBe(1);
  expect(validateProject(plateDemonstration())).toEqual([]);expect(validateProject(cappedPlateDemonstration())).toEqual([]);
 });
 it('rejects a plate without the flange saddle, a bar-like or short plate, mismatched plies and nuts on the stiffener',()=>{
  const bare=plateDemonstration();bare.details!.brace.flangeAttachment!.enabled=false;
  expect(validatePlateTie(bare).join(' ')).toContain('direct flange saddle');
  const thin=plateDemonstration();thin.details!.brace.thickness=thin.details!.brace.connection.thickness=3/16*inch;
  expect(validatePlateTie(thin).join(' ')).toContain('at least 1/4 in');
  const bar=plateDemonstration();bar.details!.brace.thickness=bar.details!.brace.connection.thickness=1.5*inch;
  expect(validatePlateTie(bar).join(' ')).toContain('four times its thickness');
  const short=plateDemonstration();Object.assign(short.details!.brace,{length:13*inch,reach:13*inch});
  expect(validatePlateTie(short).join(' ')).toContain('eight plate thicknesses');
  const plies=plateDemonstration();plies.details!.brace.connection.thickness=.375*inch;
  expect(validateRunwayDetails(plies).join(' ')).toContain('flexible plate thickness');
  const nuts=plateDemonstration();nuts.details!.brace.flangeAttachment!.longitudinalSetback=1.5*inch;
  expect(validatePlateTie(nuts).join(' ')).toContain('clear the bearing stiffener');
 });
});

describe('flexible plate tieback design (10-ton demonstration)',()=>{
 let s:CalculationSnapshot,p:ProjectInput;
 beforeAll(()=>{p=plateDemonstration();s=calculate(p);},240000);
 it('passes every check and is eligible for the package',()=>{
  expect(s.errors).toEqual([]);expect(s.eligible).toBe(true);
  expect(s.checks.filter(c=>!['pass','not-applicable','excluded'].includes(c.status)).map(c=>c.id)).toEqual([]);
  for(const id of ['plate-tie-tension-yield','plate-tie-tension-rupture','plate-tie-compression','tie-bolt','tie-prying','tie-slip','tie-bearing','tie-net','tie-block','tie-weld','plate-tie-wrench','plate-tie-bolt-fatigue','plate-tie-keeper-flange','tie-move-strength','tie-move-fatigue','tie-move-gusset','tie-move-weld','tie-move-root-fatigue','tie-release-travel','flange-tie-saddle-weld','flange-tie-saddle-fatigue','brace-member','brace-stiffness'])expect(check(s,id)?.status,id).toBe('pass');
  // The paired-bar double-cover template is not applied to the single plate.
  expect(s.checks.some(c=>c.id==='tie-plate-compression'||c.id==='tie-gross')).toBe(false);
  const ids=new Set(references.map(r=>r.id));for(const c of s.checks)for(const r of c.referenceIds)expect(ids.has(r),`${c.id} → ${r}`).toBe(true);
 });
 it('matches hand-checked plate, bolt and lap values',()=>{
  const t=p.details!.brace,Fy=50*ksi,Fu=65*ksi,hole=boltProperties('A325',.625*inch).hole;
  // AISC D2: PL 1/2 x 5 1/4, two 11/16 in holes plus 1/16 in.
  expect(check(s,'plate-tie-tension-yield').capacity).toBeCloseTo(.9*Fy*5.25*.5*inch**2,3);
  expect(check(s,'plate-tie-tension-rupture').capacity).toBeCloseTo(.75*Fu*(5.25*inch-2*(hole+inch/16))*.5*inch,3);
  // AISC E3 about the weak axis: K = 0.8 over the 18.25 in between the innermost bolt rows.
  const KL=.8*(25.25-2*(1.25+2.25))*inch,r=.5*inch/Math.sqrt(12),Fe=Math.PI**2*29000*ksi/(KL/r)**2,Fcr=.658**(Fy/Fe)*Fy;
  expect(Fy/Fe).toBeLessThan(2.25);expect(check(s,'plate-tie-compression').capacity).toBeCloseTo(.9*Fcr*5.25*.5*inch**2,0);
  // One shear plane: phi Fnv Ab, threads included.
  expect(check(s,'tie-bolt').capacity).toBeCloseTo(.75*54*ksi*Math.PI*(.625*inch)**2/4,3);
  // Lap eccentricity, plate centroid to gusset mid-plane, and the plate's stiffness share of the couple.
  const g=flangeTieGeometry(p)!,shape=aiscShapeByName('W24X229')!;
  expect(tieEccentricity(p)).toBeCloseTo(.75*inch,9);expect(g.freeLength).toBeCloseTo(15.5*inch,6);
  const rootLength=(shape.bf-shape.tw)/2*inch-inch,arm=(5/8+5.25/2)*inch,plate=2*5.25*inch*(.5*inch)**3/12/(15.5*inch);
  const column=5.75*inch*inch**3/(12*5.75*inch),girder=rootLength*inch**3/(7.8*arm);
  expect(g.columnGusset).toBeCloseTo(5.75*inch,6);expect(g.lapShare).toBeCloseTo(plate/(plate+Math.min(column,girder)),9);
  // Fit-up: 1/16 in gusset position plus half the 1/16 in sleeve clearance.
  expect(plateFitOffset(p)).toBeCloseTo(3/32*inch,9);expect(tieRelease(p)?.clearance).toBeCloseTo(inch/16,9);
  // Weak-axis demand from the imposed movement in the H1 check: M = 6EI(delta)/L^2 plus the amplified lap share.
  const note=check(s,'tie-move-strength').note;expect(note).toContain('single plate');expect(note).toContain('η = 0.078');
  expect(t.thickness).toBeCloseTo(.5*inch);
 });
 it('carries the lap couple into the gusset welds and column flange and softens the tie',()=>{
  const F=40000,plateResponse=flangeTieResponse(p,F),bars=demonstrationProject(),barsResponse=flangeTieResponse(bars,F);
  expect(plateResponse.twist).toBeCloseTo(F*.75*inch,6);expect(barsResponse.twist).toBe(0);
  const hg=flangeTieGeometry(p)!.columnGusset,w=7/16*inch;
  expect(plateResponse.rootWeld).toBeCloseTo((F/(2*hg)+F*.75*inch/(inch*hg))/(w/Math.SQRT2),6);
  const plate=braceSystem(p),pairs=braceSystem(bars);
  expect(plate.plies).toBe(1);expect(pairs.plies).toBe(2);expect(plate.stiffness).toBeLessThan(pairs.stiffness);
  expect(plate.capacity).toBeCloseTo(Math.min(plate.member.tension,plate.member.compression.capacity),6);
 });
 it('draws the single plate with callouts and notes that match the engine',()=>{
  const sheets=drawingSheetSet(s),all=sheets.map(v=>v.svg).join(''),words=texts(all);
  expect(words).toContain('FLEXIBLE PL 1/2" X 5 1/4" X 2\'-1 1/4", 3/4" CLR. TO COLUMN;');
  expect(words).toContain('GIRDER END: 4 - 5/8" A325 SC, SINGLE SHEAR,');
  expect(words).toContain('FLEXIBLE PLATE TIE NOTES / LOCAL CHECKS');
  expect(words).toContain('GIRDER GUSSET PL 1" X 5 7/8" X 5 1/4"');
  expect(words.some(v=>v.startsWith('2 FL')||v.includes('FILLER (HIDDEN)'))).toBe(false);
  expect(all).not.toMatch(/NaN|Infinity|undefined/);
  // Weld symbols: the column root fillets and the saddle fillets at their engine sizes and lengths.
  expect(words.filter(v=>v==='7/16').length).toBeGreaterThanOrEqual(2);expect(words.filter(v=>v==='5 3/4').length).toBeGreaterThanOrEqual(2);
  expect(words.filter(v=>v==='1/2').length).toBeGreaterThanOrEqual(3);
  // The summary ratio on the sheet is the largest strength ratio of the rated tie checks.
  const topic=flangeTieTopic(s)!;expect(topic.name).toBe('FLEXIBLE PLATE TIES');
  const strength=Math.max(...s.checks.filter(c=>(['Flange attachment','Tie movement'].includes(c.group)||c.id.startsWith('plate-tie')||/^tie-(bolt|prying|slip|bearing|net|block|weld)$/.test(c.id))&&c.status==='pass'&&c.quantity!=='length'&&c.id!=='tie-slenderness'&&!c.id.includes('fatigue')).map(c=>c.utilization??0));
  expect(words.join(' ')).toContain(`MAX. D/C ${strength.toFixed(2)} STRENGTH`);
 });
 it('builds the designed plate in 3D: one plate per tie on the gusset face toward the girder end',()=>{
  const steel=new THREE.MeshBasicMaterial(),edge=new THREE.LineBasicMaterial(),hardware=createHardwareBuilder(steel),g=flangeTieGeometry(p)!;
  const face=g.face/1000,group=buildIndependentSupports(p,face,steel,edge,hardware,true,steel),plates:THREE.Mesh[]=[],bolts:THREE.Object3D[]=[];
  group.traverse(o=>{if(o.userData.part?.family==='Flexible plate tieback')plates.push(o as THREE.Mesh);if(o.userData.part?.family==='Flexible plate tie bolt')bolts.push(o);});
  expect(plates).toHaveLength(g.stations.length*g.sides.length);expect(bolts).toHaveLength(plates.length*2*2*p.details!.brace.connection.rows);
  const L=p.spans.reduce((a,b)=>a+b,0)/1000,t=p.details!.brace;
  for(const v of g.stations){
   const plate=plates.find(m=>m.name===`bay-${v.bay}-${v.end}-flexible-plate-top`)!;plate.updateMatrixWorld(true);
   const box=new THREE.Box3().setFromObject(plate);
   expect(box.max.x-box.min.x).toBeCloseTo(t.thickness/1000,6);expect(box.max.z-box.min.z).toBeCloseTo(t.length/1000,6);expect(box.max.y-box.min.y).toBeCloseTo(t.width/1000,6);
   expect((box.min.x+box.max.x)/2).toBeCloseTo(v.tieX/1000-L/2+v.plateSide*(t.gussetThickness+t.thickness)/2000,6);
   expect(box.max.z).toBeCloseTo(face-g.barGap/1000,6);
  }
  expect(group.getObjectByName('reference-tieback-arrangements')).toBeUndefined();
 });
});

describe('flexible plate tieback design (capped demonstration)',()=>{
 it('passes every check with a 1/4 in plate',()=>{
  const s=calculate(cappedPlateDemonstration());
  expect(s.errors).toEqual([]);expect(s.eligible).toBe(true);
  expect(s.checks.filter(c=>!['pass','not-applicable','excluded'].includes(c.status)).map(c=>c.id)).toEqual([]);
  // Capped girder: the keepers stand on the cap web, the saddle under the W flange.
  expect(check(s,'plate-tie-keeper-flange').status).toBe('not-applicable');
  // A designed receiving column: the column flange local and fatigue checks include the lap couple.
  expect(check(s,'flange-tie-column').status).toBe('pass');expect(check(s,'flange-tie-column').note).toContain('lap couple');
 },240000);
});

import {describe,it,expect,beforeAll} from 'vitest';
import {cappedDemonstrationProject,demonstrationProject} from '../src/engine/demonstration';
import {calculate,validateProject} from '../src/engine/calculate';
import {selectTieArrangement,tieOptions,connectionOptionChecks} from '../src/engine/connectionOptions';
import {capAngleGeometry,capAngleTieParts,capAngleStiffenerGeometry,isCapAngleTie} from '../src/engine/capAngle';
import {tStubPrying,capAngleDesign,capAngleBraceSystem,capAngleResult,capAngleFatigueDetails,validateCapAngle,fillerFactor,sizeCapAngle,capAngleForceEstimate} from '../src/engine/capAngleTie';
import {braceSystem} from '../src/engine/detailAnalysis';
import {startDetailedDesign} from '../src/engine/detailTemplate';
import {simpleSupportInput} from '../src/engine/simpleSupports';
import {weldedAttachments} from '../src/engine/existingWelding';
import {references} from '../src/engine/references';
import {capAngleTopic,capAngleTitles} from '../src/components/capAngleSheet';
import {checkFigure} from '../src/components/checkFigures';
import {compactReport} from '../src/report/compactReport';
import {buildAlternativeTies} from '../src/components/alternativeTieGeometry';
import * as THREE from 'three';
import {loadPathFigure} from '../src/report/designSummary';
import type {CalculationSnapshot,ProjectInput} from '../src/engine/types';

const inch=25.4,kip=4448.2216152605,ksi=6.894757293168,E=29000;
/**
 * The capped 2-ton demonstration with the cap tieback angle: its bracket's receiving column is the surveyed existing
 * W14X90 (t_f 0.71 in) with the J10.8 stiffener pairs at the seat and rib bottom; 5/16 in end plate fillets.
 */
export function capAngleDemonstration(){
 const p=cappedDemonstrationProject();p.units='US';p.details=selectTieArrangement(p.details!,'cap-angle');
 p.details.brace.capAngle!.weldSize=5/16*inch;
 return p;
}
const zero={range:0,rotation:0,cyclicRotation:0,thermal:0,vertical:0,cyclicVertical:0};
const check=(s:CalculationSnapshot,id:string)=>s.checks.find(c=>c.id===id)!;
const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'));
const close=(v:number,expected:number,rel=.002)=>expect(Math.abs(v-expected)).toBeLessThanOrEqual(Math.abs(expected)*rel);

describe('AISC Manual Part 9 T-stub prying (demand form)',()=>{
 it('matches a hand calculation: t_min, α, q and the fitting strength',()=>{
  // T = 10 kip on a 1/2 in flange, b = 2 in, a = 1.5 in, p = 3 in, 3/4 in bolt in a 13/16 in hole, Fu = 65 ksi, LRFD:
  // b' = 1.625 in, a' = min(1.875, 2.875) = 1.875 in, ρ = 0.8667, δ = 1 − 0.8125/3 = 0.7292, φpFu = 175.5 kip/in;
  // t_min = √(4·10·1.625/175.5) = 0.6086 in; α = [(0.6086/0.5)² − 1]/δ = 0.6603; q = Tρδα/(1 + δα) = 2.817 kip;
  // fitting T = φpFu t²(1 + δ)/(4b') = 175.5·0.25·1.7292/6.5 = 11.672 kip.
  const v=tStubPrying({T:10*kip,t:.5*inch,b:2*inch,a:1.5*inch,p:3*inch,db:.75*inch,dPrime:13/16*inch,Fu:65*ksi,method:'LRFD'});
  close(v.bPrime/inch,1.625);close(v.aPrime/inch,1.875);close(v.rho,.86667);close(v.delta,.72917);
  close(v.tMin/inch,.60858);close(v.alpha,.66032);close(v.q/kip,2.8167);close(v.fitting/kip,11.672);
  // At the fitting strength the bolt-line moment reaches the stem-face moment: α = 1.
  close(tStubPrying({T:v.fitting,t:.5*inch,b:2*inch,a:1.5*inch,p:3*inch,db:.75*inch,dPrime:13/16*inch,Fu:65*ksi,method:'LRFD'}).alpha,1,1e-6);
  // A thick flange (t ≥ t_min) has no prying; ASD divides by Ω = 1.67.
  expect(tStubPrying({T:10*kip,t:.75*inch,b:2*inch,a:1.5*inch,p:3*inch,db:.75*inch,dPrime:13/16*inch,Fu:65*ksi,method:'LRFD'}).q).toBe(0);
  const asd=tStubPrying({T:10*kip,t:.5*inch,b:2*inch,a:1.5*inch,p:3*inch,db:.75*inch,dPrime:13/16*inch,Fu:65*ksi,method:'ASD'});
  close(asd.tMin/inch,Math.sqrt(4*10*1.625/(3*65/1.67)));
 });
 it('uses the J5.2 filler factor above 1/4 in of shims',()=>{
  expect(fillerFactor(.25*inch)).toBe(1);close(fillerFactor(.75*inch),.8,1e-9);
 });
});

describe('cap tieback angle: components hand-checked on the capped demonstration',()=>{
 const p=capAngleDemonstration(),g=capAngleGeometry(p)!;
 it('lays out the angle, tie plate, end plate and bolts from the inputs',()=>{
  // C15X33.9 cap (bf 3.4 in, 15 in wide), L4X4X1/2 × 6 1/2 in, column face 20 in from the web centerline.
  close(g.y0/inch,7.5);close(g.toe/inch,11.5);close(g.face/inch,20);
  close(g.cap.slotWidth/inch,1.25);close(g.cap.slotLength/inch,2);close(g.cap.sleeve!.od/inch,1.1875);
  close(g.lap.y/inch,10);close(g.plate.start/inch,8.75);close(g.plate.end/inch,19.25);close(g.plate.span/inch,9.25);close(g.plate.gap/inch,7.75);
  close(g.endPlate.z0/inch,-2.75);close(g.endPlate.z1/inch,3.25);close(g.column.zs[0]/inch,2.25);close(g.column.zs[1]/inch,-1.75);
  // Cap bolt line above the bearing: d + t_w,cap − gauge = 24.3 + 0.4 − 2.25 in.
  close(g.boltHeight/inch,22.45);
  expect(p.existingColumn?.shape).toBe('W14X90');expect(p.details!.bracket!.columnStiffeners?.enabled).toBe(true);
  expect(g.column.receiver?.shape).toBe('W14X90');close(g.column.receiver!.tf/inch,.71);close(g.column.receiver!.width/inch,14.5);
 });
 it('cap bolts: T = F/2 plus the prying force of the angle leg; the channel flange does not pry',()=>{
  // F = 20 kip: T = 10 kip. Angle leg: b = 2.25 − 0.5 = 1.75 in, b' = 1.4375 in; a = min(4, 3.4) − 2.25 = 1.15 in,
  // a' = 1.4625 in; p = 6.5/2 = 3.25 in; d' = slot length 2 in, δ = 0.3846; φpFu = 0.9·3.25·65 = 190.1 kip/in;
  // t_min = √(4·10·1.4375/190.1) = 0.5499 in > 0.5 in; α = (1.2097 − 1)/0.3846 = 0.5453; q = 1.704 kip.
  const x=capAngleDesign(p,g,{F:20*kip,...zero});
  close(x.T/kip,10);close(x.angleP.tMin/inch,.54994);close(x.angleP.alpha,.54531);close(x.angleP.q/kip,1.7041);
  close(x.angleP.fitting/kip,11.4457);
  // Channel flange: b = 2.25 − 0.4 = 1.85 in, p = min(3.5·1.85, 3.25/2 + 1.75·1.85) = 4.8625 in, d' = 11/16 in hole;
  // t_min = √(4·10·1.5375/(0.9·4.8625·65)) = 0.4650 in < t_f = 0.65 in: no prying; fitting 36.32 kip.
  close(x.channelP.p/inch,4.8625);close(x.channelP.tMin/inch,.46498);expect(x.channelP.q).toBe(0);close(x.channelP.fitting/kip,36.321);
  close(x.Q/kip,1.7041);
  // 5/8 in A325: φF_nt A_b = 0.75·90·0.3068 = 20.71 kip against T + q = 11.70 kip.
  close(x.capBolt.tension/kip,20.709);close((x.T+x.Q)/x.capBolt.tension,11.7041/20.709);
 });
 it('end plate and column flange T-stubs, and the stiffener at the tie level when the W14X90 flange needs it',()=>{
  // Column flange (W14X90, t_f 0.71 in), tie 4 in off the web: b = 4 − 0.22 = 3.78 in, p = min(3.5b, 2 + 1.75b) = 8.615 in;
  // fitting = 0.9·8.615·65·0.71²·(1 + 0.9202)/(4·3.4675) = 35.17 kip.
  const x=capAngleDesign(p,g,{F:20*kip,...zero});
  close(x.Tc/kip,10);close(x.columnP!.p/inch,8.615);close(x.columnP!.fitting/kip,35.173);expect(x.stiffenerRequired).toBe(false);
  // End plate 5/8 in: b = 2 − 0.25 = 1.75 in, a = 3 − 2 = 1 in, p = 5 in: t_min = 0.4434 in, no prying.
  close(x.endP.tMin/inch,.44338);expect(x.endP.q).toBe(0);
  // A 3/8 in flange under 30 kip per bolt needs the stiffener; with it the flange also spans to the stiffener.
  const weak=structuredClone(p);weak.details!.bracket!.receiver.flangeThickness=.375*inch;
  const gw=capAngleGeometry(weak)!,y=capAngleDesign(weak,gw,{F:60*kip,...zero});
  expect(y.stiffenerRequired).toBe(true);expect(y.stiffened).toBe(false);
  const st=capAngleStiffenerGeometry(gw)!;expect(st.provided).toBe(false);close(st.length/inch,14/2-.375);
  weak.details!.brace.capAngle!.stiffener={enabled:true,thickness:st.thickness,width:st.width,length:'half',clip:st.clip,flangeWeld:st.flangeWeld,webWeld:st.webWeld};
  const gs=capAngleGeometry(weak)!,z=capAngleDesign(weak,gs,{F:60*kip,...zero});
  expect(z.stiffened).toBe(true);expect(z.stiffP!.b).toBeCloseTo(gs.column.gauge-st.thickness/2,6);expect(z.Qc).toBeLessThanOrEqual(y.Qc+1e-9);
  const parts=capAngleTieParts(weak)!,box=parts.boxes.find(b=>b.kind==='stiffener')!;
  close(box.min[2],gs.plate.zc-st.thickness/2,1e-9);close(box.min[1],gs.face+gs.column.receiver!.tf,1e-9);close(box.max[1]-box.min[1],st.length,1e-9);
 });
 it('tie plate: E3 buckling over its clear span with K = 1',()=>{
  // 1/2 × 5 in plate, L = 9.25 in: r = 0.1443 in, KL/r = 64.09, Fe = π²E/(KL/r)² = 69.69 ksi; Fy/Fe = 0.7175 ≤ 2.25,
  // Fcr = 0.658^0.7175·50 = 37.03 ksi; φPn = 0.9·37.03·2.5 = 83.32 kip.
  const x=capAngleDesign(p,g,{F:10*kip,...zero});
  close(x.compression.slenderness,64.086);close(x.compression.Fe/ksi,69.690);close(x.compression.Fcr/ksi,37.030);close(x.compression.capacity/kip,83.318);
  close(x.yieldCap/kip,.9*50*2.5);
  // D2/J4.1(b): A_e = min(A_n, 0.85A_g); A_n = (5 − 2(11/16 + 1/16))·0.5 = 1.75 in² < 2.125 in².
  close(x.Ae/inch**2,1.75);close(x.ruptureCap/kip,.75*65*1.75);
 });
 it('stiffness: the components in series, as the girder lateral/torsional model and the Appendix 6 check take it',()=>{
  // Compliances, in/kip, E = 29,000 ksi: plate 9.25/(E·2.5); lap bolts (0.5 + 0.5)/(2G·0.3068), G = E/2.6;
  // angle leg 2³/(3E·6.5·0.5³/12); channel flange 1.85³/(3E·2·4.8625·0.65³/12); cap bolts 1.61875/(2E·0.3068);
  // end plate 4³/(48E·5·0.625³/12); column bolts (0.625 + 0.125 + 0.71)/(2E·0.3068); shims 0.125/(E·25.125);
  // column flange 3.78³/(3E·2·8.615·0.71³/12). Sum 3.792e-3 in/kip: 263.7 kip/in.
  const c={plate:9.25/(E*2.5),lap:1/(2*E/2.6*.30680),leg:8/(3*E*6.5*.125/12),channel:1.85**3/(3*E*2*4.8625*.65**3/12),cap:1.61875/(2*E*.30680),
   end:64/(48*E*5*.625**3/12),col:1.46/(2*E*.30680),shims:.125/(E*25.125),flange:3.78**3/(3*E*2*8.615*.71**3/12)};
  const k=1/Object.values(c).reduce((a,v)=>a+v,0);close(k,263.72,.002);
  const x=capAngleDesign(p,g,{F:0,...zero});close(x.stiffness*inch/kip,k,.002);
  close(x.compliance.angleLeg*kip/inch,c.leg,.002);close(x.compliance.columnFlange*kip/inch,c.flange,.002);
  const b=capAngleBraceSystem(p)!,sys=braceSystem(p);
  expect(sys.stiffness).toBeCloseTo(b.stiffness,6);expect(sys.cos).toBe(1);expect(b.plies).toBe(1);
 });
 it('lists the channel flange holes in the fatigue register: Category B sleeved, D snug-tight',()=>{
  const list=capAngleFatigueDetails(p);expect(list).toHaveLength(2*g.stations.length);
  expect(list.map(v=>v.id)).toContain('CA1-L');expect(list.every(v=>v.category==='B'&&v.reference.includes('2.2'))).toBe(true);
  const snug=structuredClone(p);snug.details!.brace.capAngle!.mode='snug-tight';
  expect(capAngleFatigueDetails(snug).every(v=>v.category==='D'&&v.reference.includes('2.3'))).toBe(true);
 });
 it('gives the isometric figure its geometry: x along the runway, y toward the column, z up from the top of the cap',()=>{
  const parts=capAngleTieParts(p)!,box=(name:string)=>parts.boxes.find(b=>b.name.startsWith(name))!;
  // Long leg flush with the top of the cap, from the channel flange's outside face to the toe.
  expect(box('angle long leg').max[2]).toBe(0);close(box('angle long leg').min[1],g.y0,1e-9);close(box('angle long leg').max[1],g.toe,1e-9);
  close(box('angle short leg').min[2],-4*inch,1e-9);close(box('angle short leg').max[0]-box('angle short leg').min[0],6.5*inch,1e-9);
  close(box('tie plate').max[2],.5*inch,1e-9);close(box('end plate').min[1],19.25*inch,1e-9);close(box('shim').max[1],20*inch,1e-9);
  parts.bolts.filter(b=>b.group==='cap').forEach((b,i)=>{close(b.head[0]/inch,[-1.625,1.625][i],1e-9);close(b.head[2]/inch,-2.25,1e-9);});
  expect(parts.bolts.filter(b=>b.group==='cap').every(b=>b.axis==='y'&&b.holes[0].kind==='long-slot'&&b.holes[0].along==='x')).toBe(true);
  expect(parts.bolts.filter(b=>b.group==='lap').every(b=>b.axis==='z'&&b.holes[0].kind==='short-slot'&&b.holes[0].along==='y')).toBe(true);
  parts.bolts.filter(b=>b.group==='column').forEach((b,i)=>close(b.head[2]/inch,[2.25,-1.75][i],1e-9));
  expect(parts.bolts.filter(b=>b.group==='column').every(b=>b.holes.at(-1)!.kind==='field-drilled')).toBe(true);
  // The first tie at a shared column (grid 2), 4 in from the column centerline; no stiffener for this flange.
  expect(parts.station).toMatchObject({bay:1,end:'right'});close(parts.station!.offsetFromColumn/inch,-4,1e-6);
  expect(parts.boxes.some(b=>b.kind==='stiffener')).toBe(false);expect(capAngleTieParts(p,{stiffener:true})!.boxes.some(b=>b.kind==='stiffener')).toBe(true);
  expect(parts.welds[0]).toMatchObject({bothSides:true});close(parts.welds[0].size/inch,.3125,1e-9);
  // The 3D viewer draws the same parts (not the generic reference tieback): the tie plate on the long leg at the
  // top of the cap, the end plate against the modeled column face.
  const model=buildAlternativeTies(p,20*inch/1000,new THREE.MeshBasicMaterial(),new THREE.LineBasicMaterial());
  expect(model.name).toBe('cap-angle-ties');
  const meshes=model.children.filter(o=>o instanceof THREE.Mesh) as THREE.Mesh[],fam=(f:string)=>meshes.filter(m=>m.userData.part?.family===f);
  expect(fam('Cap tieback tie plate')).toHaveLength(g.stations.length);expect(fam('Cap tieback angle')).toHaveLength(2*g.stations.length);
  const plate=fam('Cap tieback tie plate')[0],bounds=new THREE.Box3().setFromObject(plate),top=(p.section.d/2+p.section.capTw)/1000;
  close(bounds.max.y,top+.5*inch/1000,1e-6);close(bounds.max.z,(20-.75)*inch/1000,1e-6);
  expect(meshes.filter(m=>m.userData.part?.weld?.kind==='fillet')).toHaveLength(2*g.stations.length);
 });
});

describe('cap tieback angle: selection, template and validation',()=>{
 it('is a designed tie option for capped girders and the template default',()=>{
  expect(tieOptions.find(o=>o.id==='cap-angle')?.status).toBe('Component checks available');
  const p=capAngleDemonstration();expect(isCapAngleTie(p)).toBe(true);expect(connectionOptionChecks(p)).toEqual([]);
  expect(validateProject(p)).toEqual([]);
  // The column end is bolted: no tie gusset in the existing column welding.
  expect(weldedAttachments(p).map(v=>v.name)).not.toContain('tie gusset');
  const q=startDetailedDesign(cappedDemonstrationProject());
  expect(q.details!.brace.arrangement).toBe('cap-angle');expect(validateCapAngle(q)).toEqual([]);
  // Sized for the estimate: 2 × 1.6 × the side thrust of all wheels.
  expect(capAngleForceEstimate(q)).toBeGreaterThan(0);expect(q.details!.brace.capAngle).toEqual(sizeCapAngle(q,capAngleForceEstimate(q)));
 });
 it('rejects an uncapped girder, missing end bearings, continuous spans and misfit parts',()=>{
  const plain=demonstrationProject();plain.details=selectTieArrangement(plain.details!,'cap-angle');
  expect(validateCapAngle(plain).join(' ')).toContain('select a capped section');
  const noBearing=capAngleDemonstration();noBearing.details!.endBearing!.enabled=false;
  expect(validateCapAngle(noBearing).join(' ')).toContain('enable the bolted end bearings');
  const continuous=capAngleDemonstration();continuous.system='continuous';
  expect(validateCapAngle(continuous).join(' ')).toContain('independent simple spans');
  const short=capAngleDemonstration();short.details!.brace.capAngle!.setback=3*inch;
  expect(validateCapAngle(short).join(' ')).toContain('stay on its own girder');
  const narrow=capAngleDemonstration();narrow.details!.brace.capAngle!.endPlate.width=4.5*inch;
  expect(validateCapAngle(narrow).join(' ')).toContain('at least as wide as the tie plate');
  const slot=capAngleDemonstration();slot.details!.brace.capAngle!.travel=1.5*inch;
  expect(validateCapAngle(slot).join(' ')).toMatch(/slot/);
  for(const v of [plain,noBearing,continuous,short,narrow])expect(validateProject(v).some(e=>e.startsWith('details.brace.capAngle: '))).toBe(true);
 });
});

describe('cap tieback angle: the calculated demonstration',()=>{
 let s:CalculationSnapshot,si:CalculationSnapshot,p:ProjectInput;
 beforeAll(()=>{p=capAngleDemonstration();s=calculate(p);si=structuredClone(s);si.input.units='SI';},900000);
 it('passes every cap tieback check, each with its equation, clause and existing references',()=>{
  expect(s.errors).toEqual([]);
  const list=s.checks.filter(c=>c.id.startsWith('cap-angle-'));
  expect(list.length).toBeGreaterThan(50);
  for(const c of list){
   expect(['pass','not-applicable'],c.id).toContain(c.status);
   expect(c.equation.length,c.id).toBeGreaterThan(5);expect(c.note,c.id).toMatch(/AISC|AIST|RCSC|DG7|ASTM/);
   expect(c.referenceIds?.length,c.id).toBeGreaterThan(0);for(const r of c.referenceIds??[])expect(references.some(v=>v.id===r),`${c.id} ${r}`).toBe(true);
  }
  for(const id of ['cap-angle-cap-bolt','cap-angle-leg-prying','cap-angle-channel-flange','cap-angle-plate-compression','cap-angle-lap-slip','cap-angle-col-bolt','cap-angle-column-flange','cap-angle-endplate-weld','cap-angle-slot-travel','cap-angle-cap-bolt-fatigue','cap-angle-weld-root-fatigue'])expect(check(s,id),id).toBeDefined();
  expect(check(s,'cap-angle-stiffener').status).toBe('not-applicable');
  expect(s.checks.filter(c=>c.status==='fail').map(c=>c.id)).toEqual([]);
 });
 it('takes the tie force from the brace member, its stiffness from the series model, its travel from the end rotation',()=>{
  const F=check(s,'brace-member').demand!,r=capAngleResult(s)!;
  close(check(s,'cap-angle-cap-bolt').demand!,F/2+r.design.Q,1e-9);
  close(check(s,'brace-stiffness').capacity!,capAngleBraceSystem(p)!.stiffness,1e-6);
  // Travel = θ·(d + t_w,cap − gauge) + α·L·ΔT + setting tolerance, against the 3/8 in slot travel each way.
  const ss=simpleSupportInput(p),theta=s.designAnalysis!.endRotation;
  const travel=theta*(24.3+.4-2.25)*inch+12e-6*Math.max(...p.spans)*Math.max(ss.temperatureRise,ss.temperatureFall)+ss.settingTolerance;
  close(check(s,'cap-angle-slot-travel').demand!,travel,1e-6);close(check(s,'cap-angle-slot-travel').capacity!,.375*inch,1e-9);
  // The lower column bolt (1.75 in below the top of the cap) clears the bracket's column stiffeners at the seat
  // (2 in seat plate, 1 in plates centered on it): z_b − z_st = t_bearing + 24.3 + 0.4 − 1.75 − (−1 + 0.5) in ≥ C1.
  const clear=check(s,'cap-angle-bracket-stiffener-clear'),bs=p.details!.bracket!;
  expect(clear.status).toBe('pass');close(clear.capacity!,p.details!.bearing.thickness+(24.3+.4-1.75)*inch-(-bs.seatThickness/2+bs.columnStiffeners!.thickness/2),1e-6);
  // The fatigue register has the channel flange holes and they pass in the girder fatigue checks.
  expect(s.checks.some(c=>c.id.includes('CA1-L'))).toBe(true);
 });
 it('draws the callouts from the engine values, in US and SI',()=>{
  const us=capAngleTopic(s)!,m=capAngleTopic(si)!;
  expect(us.views.map(v=>v.title)).toEqual([capAngleTitles.section,capAngleTitles.plan]);
  const a=texts(us.views[0].render().svg);
  for(const t of ['END PL 5/8" X 5" X 6"','FINGER SHIMS 0 TO 1/4"','2 - 5/8" A325 BOLTS, PRETENSIONED,','2" EACH SIDE OF TIE PL; FIELD-','DRILL 11/16" HOLES IN COLUMN FLANGE',
   '2 - 5/8" A325 BOLTS 2 1/4" BELOW TOP;','1 1/4" X 2" HORIZ. SLOTS, SLEEVED','L4X4X1/2 X 0\'-6 1/2" CAP ANGLE, LONG','TIE PL 1/2" X 5" X 0\'-10 1/2" WITH',
   '2 - 5/8" A325 SC BOLTS, CLASS B,','11/16" X 7/8" SHORT SLOTS IN TIE PL,','1 1/4" TO TIE PL END','EXISTING W14X90 COLUMN (DASHED)','2 1/2"','7 3/4"','1\'-8"','5/16'])expect(a,t).toContain(t);
  const b=texts(us.views[1].render().svg);
  for(const t of ['0\'-3 1/2"','0\'-4"','2" SLOTS ALONG RUNWAY (HIDDEN),','3/8" TRAVEL EACH WAY','TIE PL 1/2" X 5"','EXISTING W14X90 COLUMN FLANGE (DASHED)'])expect(b,t).toContain(t);
  const c=texts(m.views[0].render().svg);
  for(const t of ['END PL 16 mm X 127 mm X 152 mm','2 - 16 mm A325 BOLTS 57 mm BELOW TOP;','32 mm X 51 mm HORIZ. SLOTS, SLEEVED','TIE PL 12.5 mm X 127 mm X 267 mm WITH','8 mm','508 mm'])expect(c,t).toContain(t);
  for(const v of [...us.views,...m.views])expect(v.render().svg).not.toMatch(/NaN|undefined|Infinity/);
 });
 it('prints the cap tieback pages and figure without NaN, in US and SI',()=>{
  for(const v of [s,si]){
   const html=compactReport(v,''),body=html.replace(/<style[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,' ');
   expect(html).toContain('Cap tieback angle');for(const page of ['04E','04F','04G'])expect(html).toContain(page);
   expect(body).not.toMatch(/\b(NaN|undefined|Infinity)\b/);
  }
  // The isometric figure from the tie geometry, numbered as the six caption steps; the summary still names the top tie.
  const markers=(svg:string)=>[...svg.matchAll(/font-weight="700" fill="#000">(\d+)<\/text>/g)].map(m=>Number(m[1])).sort((a,b)=>a-b);
  for(const topic of ['Cap tieback','Cap tieback movement','Connections']){
   const f=checkFigure(topic,p);expect(f.view,topic).toBe('isometric');expect(f.path).toHaveLength(6);expect(markers(f.svg)).toEqual([1,2,3,4,5,6]);
   expect(f.svg).toContain('CAP ANGLE TIE');expect(f.svg).not.toMatch(/NaN|undefined|Infinity/);
  }
  const summary=loadPathFigure(p);expect(summary).toContain('TOP TIE');expect(summary).not.toMatch(/NaN|undefined/);
 });
});

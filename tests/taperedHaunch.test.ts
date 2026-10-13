import {overPrecise} from './fixtures/reportText';
import {describe,it,expect} from 'vitest';
import {reviewOpenItem} from './review/openItems';
import * as THREE from 'three';
import {buildWeldedBrackets} from '../src/components/weldedBracketGeometry';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {calculate as calculateProject,validateProject} from '../src/engine/calculate';
import {withColumnReviewData} from './fixtures/columnReviewData';
import {projectSchema} from '../src/engine/types';
import type {CalculationSnapshot,CheckResult,ProjectInput} from '../src/engine/types';
import {selectBracketArrangement,connectionOptionChecks} from '../src/engine/connectionOptions';
import {haunchGeometry,haunchSection,defaultTaperedHaunch,type TaperedHaunchInput} from '../src/engine/taperedHaunchInputs';
import {haunchStations,haunchWebShear,haunchActions,haunchWeldGroup,haunchWeldStress,haunchColumnForces,validateTaperedHaunch,projectHaunch} from '../src/engine/taperedHaunch';
import {taperedHaunchParts} from '../src/engine/taperedHaunchParts';
import {bracketForceLevels,columnStiffenerGeometry} from '../src/engine/columnStiffeners';
import {taperedHaunchTopic,haunchPlanTitle,haunchSectionTitle} from '../src/components/taperedHaunchSheet';
import {drawingLength,plateInches} from '../src/components/drawingFormat';
import {detailTitles} from '../src/components/sheetGraphics';
import {compactReport} from '../src/report/compactReport';
import {drawingSheetSet} from '../src/components/planSheet';
import {checkFigure} from '../src/components/checkFigures';
import {cappedTaperedHaunch,existingBuildingHaunch} from './fixtures/taperedHaunchProjects';
// Review G2: supply the supporting-column records so the package can pass and export.
const calculate=(p:Parameters<typeof calculateProject>[0])=>calculateProject(withColumnReviewData(p));

const inch=25.4,kip=4448.2216152605,ksi=6.894757293168,E=29000*ksi,Fy=50*ksi;
/**
 * A haunch with round numbers for hand checks: 24 in root, 12 in tip over 16 in (slope 0.75, cos 0.8), so the 1 in
 * sloping bottom flange is 1.25 in on a vertical cut, as thick as the top flange; 12 in flanges, 1/2 in web, fillet
 * flange joints, the girder web line 12 in from the column face.
 */
const plates:TaperedHaunchInput={rootDepth:24*inch,tipDepth:12*inch,webThickness:.5*inch,topWidth:12*inch,rootWidth:12*inch,topThickness:1.25*inch,bottomWidth:12*inch,bottomThickness:inch,
 stiffener:{thickness:.5*inch,width:5.25*inch,weld:.3125*inch},flangeJoint:'fillet',flangeWeld:.3125*inch,flangeWebWeld:.25*inch,endPlate:false};
const bracket={arrangement:'tapered-haunch',haunch:plates,reach:12*inch,seatProjection:16*inch,rootWeld:.3125*inch,receiver:{width:14.5*inch,flangeThickness:.71*inch}};
const g=haunchGeometry(bracket);
const snapshotOf=(input:ProjectInput):CalculationSnapshot=>({input,revision:'tapered-haunch',createdAt:'2026-10-11',errors:[],warnings:[],properties:null,analysis:null,checks:[],eligible:false,referenceVersion:''});
const memo=<T,>(f:()=>T)=>{let v:T|undefined;return ()=>v??=f();};
const tp1=memo(()=>calculate(cappedTaperedHaunch()));
const tp2=memo(()=>calculate(existingBuildingHaunch('US')));
const byId=(checks:CheckResult[],id:string)=>checks.find(v=>v.id===id)!;
const close=(a:number,b:number,rel=1e-6)=>expect(Math.abs(a-b)).toBeLessThanOrEqual(rel*Math.max(Math.abs(a),Math.abs(b),1e-9));

describe('tapered I haunch: hand-checked mechanics',()=>{
 it('takes its vertical sections through the taper: the root section by hand',()=>{
  expect(g.alpha).toBeCloseTo(Math.atan(.75),12);close(g.tbv,1.25*inch);close(g.depth(8*inch),18*inch);
  // Root (y = 0): bottom flange 12 x 1 centred in its 1.25 in vertical cut, web 21.5 x 0.5, top flange 12 x 1.25.
  const parts=[[12,1,.625],[.5,21.5,1.25+21.5/2],[12,1.25,24-.625]].map(([b,t,y])=>({A:b*t,y,I:b*t**3/12}));
  const A=parts.reduce((s,v)=>s+v.A,0),ybar=parts.reduce((s,v)=>s+v.A*v.y,0)/A,I=parts.reduce((s,v)=>s+v.I+v.A*(v.y-ybar)**2,0);
  const r=haunchSection(g,0);
  close(r.A,A*inch**2);close(r.ybar,ybar*inch);close(r.Ix,I*inch**4);close(r.h0,(24-.625-.625)*inch);
  expect(A).toBeCloseTo(37.75,9);expect(I).toBeCloseTo(3879.75,1);
 });
 it('root flexure: AISC F4.1 compression flange yielding with the compact-web Rpc, no LTB within Lp (hand)',()=>{
  const r=haunchSection(g,0),st=haunchStations(g,E,Fy,14*inch,4*inch)[0];
  // Plastic neutral axis by equal areas, plastic modulus, Myc, Mp <= 1.6 My, Rpc = Mp/Myc (F4-9a, compact web).
  const A=r.A/inch**2,bottom=12*1,web=.5,yp=1.25+(A/2-bottom)/web;
  const Zx=bottom*(yp-.5-.125)+web*(yp-1.25)**2/2+web*(22.75-yp)**2/2+15*(24-.625-yp);
  close(r.yp,yp*inch);close(r.Zx,Zx*inch**3);
  const Sxc=r.Ix/r.ybar,Myc=Fy*Sxc,Mp=Math.min(Fy*Zx*inch**3,1.6*Fy*Math.min(Sxc,r.Sxt));
  const hc=2*(r.ybar-g.tbv),hp=2*(r.yp-g.tbv),lpw=(hc/hp)*Math.sqrt(E/Fy)/(.54*Mp/(Fy*Math.min(Sxc,r.Sxt))-.09)**2;
  expect(hc/g.tw).toBeLessThan(lpw);
  // Lb = 2L = 32 in against Lp = 1.1 rt sqrt(E/Fy): rt = bfc / sqrt(12(1 + aw/6)), aw = hc tw / (bfc tfc).
  const aw=hc*g.tw/(g.bb*g.tb),rt=g.bb/Math.sqrt(12*(1+aw/6));expect(2*g.L).toBeLessThan(1.1*rt*Math.sqrt(E/Fy));
  expect(st.pos.clause).toBe('F4');expect(st.pos.web).toBe('compact');
  close(st.pos.Mn,Mp);close(st.pos.R,Mp/Myc);
  // phi Mn = 0.9 Mp (LRFD), in kip-in.
  expect(.9*st.pos.Mn/(kip*inch)).toBeCloseTo(.9*Mp/(kip*inch),6);
 });
 it('web shear on the vertical section: G2.1 with kv = 5.34, Aw = h tw, phi 0.9 (hand)',()=>{
  const st=haunchStations(g,E,Fy,14*inch,4*inch),root=st[0].s,tip=st.at(-1)!.s;
  const v=haunchWebShear(g,root,E,Fy,'LRFD');expect(v.Cv1).toBe(1);
  // 21.5 / 0.5 = 43 <= 1.10 sqrt(5.34 E / Fy) = 61.2: phi Vn = 0.9 (0.6)(50 ksi)(24 in)(0.5 in) = 324 kip.
  expect(v.capacity/kip).toBeCloseTo(.9*.6*50*24*.5,6);
  // At the far bearing edge (y = 14 in) the section is 13.5 in deep.
  expect(haunchWebShear(g,tip,E,Fy,'LRFD').capacity/kip).toBeCloseTo(.9*.6*50*13.5*.5,6);
 });
 it('flange forces at the column: T = M/h0 + N/2, C = (M/h0 - N/2)/cos a, torsion T ln(h0r/h0a)/s, and the J10.1 pull (hand)',()=>{
  const root=haunchSection(g,0),e=14*inch;
  // Two girder ends 6 in either side of the web plane: 30 and 10 kip, H = 4 kip along the haunch at 2 in.
  const f=haunchActions(g,root,e,[{vertical:30*kip,offset:6*inch},{vertical:10*kip,offset:-6*inch}],{longitudinal:0,bottom:4*kip,offset:2*inch});
  const h0=22.75,ybar=root.ybar/inch,Mx=40*14+4*(24-ybar),T=30*6-10*6;
  expect(f.Mx/(kip*inch)).toBeCloseTo(Mx,6);expect(f.T/(kip*inch)).toBeCloseTo(T,6);
  expect(f.Tt/kip).toBeCloseTo(Mx/h0+2,6);expect(f.C/kip).toBeCloseTo((Mx/h0-2)/.8,6);
  const I0=Math.log(h0/(h0-.75*12))/.75;expect(f.Mtop/(kip*inch)).toBeCloseTo(T*I0+4*2,6);
  const c=haunchColumnForces(g,f);
  expect(c.tension/kip).toBeCloseTo(Mx/h0+2,6);expect(c.compression/kip).toBeCloseTo(Mx/h0-2,6);
  expect(c.pull/kip).toBeCloseTo(Mx/h0+2+3*(T*I0+8)/12,6);
  // The stiffener forces are the stiffener module's own (flangeStiffenerForces): twice the more loaded half flange.
  expect(c.stiffeners.upperT).toBeCloseTo(c.pull,6);expect(c.stiffeners.lowerC/kip).toBeCloseTo(Mx/h0-2+3*Math.abs(f.Mbot)/(12*kip*inch),6);
 });
 it('the haunch-to-column weld group: elastic group of the flange and web fillets (hand)',()=>{
  const root=haunchSection(g,0),e=14*inch,V=40*kip,f=haunchActions(g,root,e,[{vertical:V,offset:0}],{longitudinal:0,bottom:0,offset:0}),grp=haunchWeldGroup(g),w=haunchWeldStress(g,grp,root,f);
  // Lines (u, v in inches from the bottom of the root): outer faces of both flanges, inner faces from the
  // flange-to-web fillet (x0 = 0.25 + 0.25) to the tip, web fillets both sides between the flange-to-web fillets.
  const x0=.5,lines=[[12,24,.3125],[12,0,.3125],[6-x0,22.75,.3125],[6-x0,22.75,.3125],[6-x0,1.25,.3125],[6-x0,1.25,.3125]].map(([l,v,s])=>({l,v,te:s/Math.SQRT2,I0:0}));
  const web=24-1.25-1.25-2*.25;for(const _ of [0,1])lines.push({l:web,v:1.25+.25+web/2,te:.3125/Math.SQRT2,I0:web**2/12});
  const A=lines.reduce((s,q)=>s+q.te*q.l,0),vc=lines.reduce((s,q)=>s+q.te*q.l*q.v,0)/A,Ix=lines.reduce((s,q)=>s+q.te*q.l*((q.v-vc)**2+q.I0),0);
  close(grp.A,A*inch**2);close(grp.vc,vc*inch);close(grp.Ix,Ix*inch**4);
  // Top outer line end: n = M c / Ix with M = V e, ty = V / A; the bottom lines add C sin a over their throat area.
  const M=40*14,top=Math.hypot(M*(24-vc)/Ix,40/A);
  const Abot=lines.filter(q=>q.v<2).reduce((s,q)=>s+q.te*q.l,0),C=M/22.75/.8,bottom=Math.hypot(M*vc/Ix,40/A+C*.6/Abot);
  expect(w.flange/ksi).toBeCloseTo(Math.max(top,bottom),6);
 });
 it('J10.1 at the existing W14X90 flange: phi 6.25 Fy tf^2 against the top flange pull (test project 1)',()=>{
  const s=tp1(),c=byId(s.checks,'haunch-column-flange');
  expect(c.capacity!/kip).toBeCloseTo(.9*6.25*50*.71**2,3);expect(c.status).toBe('pass');
  expect(c.demand).toBeCloseTo(s.detailResults!.taperedHaunch!.strength.pull.value,6);
 });
});

describe('tapered I haunch: inputs, selection and validation',()=>{
 it('is a designed bracket family: selection sizes it, the schema round-trips it and old projects still load',()=>{
  const p=cappedTaperedHaunch();expect(p.details!.bracket!.arrangement).toBe('tapered-haunch');
  expect(validateProject(p)).toEqual([]);expect(connectionOptionChecks(p).find(c=>c.id==='option-bracket-model')).toBeUndefined();
  const parsed=projectSchema.parse(JSON.parse(JSON.stringify(p)));expect(parsed.details!.bracket!.haunch).toEqual(p.details!.bracket!.haunch);
  const old=cappedDemonstrationProject();expect(old.details!.bracket!.haunch).toBeUndefined();expect(projectSchema.safeParse(JSON.parse(JSON.stringify(old))).success).toBe(true);
  // A haunch already entered is kept on reselection.
  const again=selectBracketArrangement(p.details!,'tapered-haunch');expect(again.bracket!.haunch).toEqual(p.details!.bracket!.haunch);
  // Starting sizes: both flanges welded within the column flange less the CJP run-out, 3/8 in web, 1 in flanges.
  const d=defaultTaperedHaunch({seatProjection:28*inch,receiver:{width:14.5*inch}});
  expect(d.rootWidth).toBe(14*inch);expect(d.webThickness).toBe(.375*inch);expect(d.rootDepth).toBe(17*inch);expect(d.tipDepth).toBe(9*inch);
 });
 it('rejects plates that clash or leave the model',()=>{
  const errors=(edit:(p:ProjectInput)=>void)=>{const p=cappedTaperedHaunch();edit(p);return validateTaperedHaunch(p).join(' ');};
  const h=(p:ProjectInput)=>p.details!.bracket!.haunch!;
  expect(errors(()=>{})).toBe('');
  expect(errors(p=>{h(p).tipDepth=h(p).rootDepth+inch;})).toContain('cannot exceed the root depth');
  expect(errors(p=>{h(p).rootDepth=h(p).tipDepth+1.2*p.details!.bracket!.seatProjection;})).toContain('exceeds 45°');
  expect(errors(p=>{h(p).rootWidth=14.5*inch;})).toContain('must fit on the');
  expect(errors(p=>{h(p).bottomWidth=15*inch;})).toContain('bottom flange welded at the column');
  expect(errors(p=>{p.details!.bracket!.reach=p.details!.bearing.width/2+.1*inch;})).toContain('clear of the column-face welds');
  expect(errors(p=>{h(p).stiffener.width=8*inch;})).toContain('within the welded flange widths');
  expect(errors(p=>{h(p).webThickness=.0625*inch;})).toContain('thicken the web');
  expect(errors(p=>{h(p).topThickness=.25*inch;})).toContain('top flange b/2t');
  expect(errors(p=>{h(p).flangeWebWeld=h(p).webThickness;})).toContain('flange-to-web fillets must be smaller');
  expect(errors(p=>{p.existingColumn!.seatElevation=h(p).rootDepth/2;})).toContain('below the column base');
 });
});

describe('tapered I haunch: test projects',()=>{
 it('test project 1 (capped demonstration, existing W14X90) passes every check without column stiffeners',()=>{
  const s=tp1();expect(s.errors).toEqual([]);expect(s.eligible).toBe(true);
  expect(s.checks.filter(c=>(c.status==='fail'||c.status==='unverified'||c.status==='unsupported')&&!reviewOpenItem(c)).map(c=>c.id)).toEqual([]);
  const ids=s.checks.filter(c=>c.id.startsWith('haunch-')).map(c=>c.id);
  for(const id of ['haunch-flexure','haunch-shear','haunch-interaction','haunch-top-flange','haunch-bottom-flange','haunch-web-weld','haunch-stiffener-column','haunch-column-flange','haunch-column-yield-top','haunch-column-crippling','haunch-column-panel','haunch-fatigue-top-flange','haunch-deflection'])expect(ids).toContain(id);
  // Every check states its clause and governing case.
  for(const c of s.checks.filter(v=>v.id.startsWith('haunch-')&&v.demand!==undefined))expect(c.title,c.id).toMatch(/\(|·/);
 });
 // Test project 2 runs the full 5-bay calculation (about a minute alone): its own timeout, not the 60 s default.
 it('test project 2 (5 bays, existing W14X90 columns): column stiffeners at both haunch flanges take J10.1',()=>{
  const s=tp2(),p=s.input;expect(s.errors).toEqual([]);
  const failed=s.checks.filter(c=>c.status==='fail'&&!reviewOpenItem(c)).map(c=>c.id);
  expect(failed.filter(id=>id.startsWith('haunch')||id.startsWith('bracket')||id.startsWith('column')||id.startsWith('end-bearing'))).toEqual([]);
  // The unstiffened J10.1 fails on the 0.71 in flange; the stiffeners take R_u - phi R_n.
  expect(byId(s.checks,'haunch-column-flange').status).toBe('not-applicable');
  for(const id of ['upper','lower','proportions','flange-weld','web-weld','web-shear','fatigue-plate','fatigue-weld','fatigue-toe'])expect(byId(s.checks,`haunch-colstiff-${id}`).status,id).toBe('pass');
  // Levels: the top flange (the seat) and the sloping bottom flange's vertical cut at the column face.
  const h=projectHaunch(p),levels=bracketForceLevels(p.details!.bracket!,inch)!.levels;
  expect(levels[0].band[0]).toBeCloseTo(-h.tt,9);expect(levels[0].band[1]).toBe(0);
  expect(levels[1].band[0]).toBeCloseTo(-h.hr,9);expect(levels[1].band[1]).toBeCloseTo(-h.hr+h.tbv,9);expect(levels[1].plate.thickness).toBeCloseTo(h.tb,9);
  expect(columnStiffenerGeometry(p)!.full).toBe(true);
  // The existing rod X-bracing in bay 3 and the existing column with its load effects.
  expect(p.spans).toHaveLength(5);expect(p.longitudinalBracing!.enabled).toBe(true);expect(p.existingColumn!.shape).toBe('W14X90');
  expect(p.details!.bracket!.receiver.flangeThickness).toBe(.71*inch);
 },300000);
});

describe('tapered I haunch: drawings, parts, report and figures',()=>{
 it('draws the sizes, welds and holes the engine designed',()=>{
  const s=tp1(),p=s.input,h=projectHaunch(p),st=h.stiffener,topic=taperedHaunchTopic(s)!;
  expect(topic.views.map(v=>v.title)).toEqual([detailTitles.weldedBracket,haunchPlanTitle,haunchSectionTitle]);
  const svg=topic.views.map(v=>v.render().svg).join('').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&amp;','&');
  const dim=(v:number)=>drawingLength(v,p.units),size=(v:number)=>plateInches(v,p.units);
  for(const t of [dim(h.L),dim(h.a),dim(h.hr),dim(h.ht),dim(h.bt),dim(h.btr),dim(h.bb),`WEB PL ${size(h.tw)}`,`TOP FL. PL ${size(h.tt)} X ${dim(h.bt)}`,`BOTTOM FL. PL ${size(h.tb)} X ${dim(h.bb)}`,`2 STIFF. PL ${size(st.t)} X ${size(st.width)}`,size(h.webWeld).replaceAll('"',''),size(h.flangeWebWeld).replaceAll('"','')])expect(svg,t).toContain(t);
  expect(svg).toContain('data-weld="cjp"');expect(svg).toContain('data-weld-location="field"');
  const bolts=taperedHaunchParts(p).bolts.filter(b=>b.grid==='interior').length;expect(svg).toContain(`${bolts} - `);
  // The bracket sheet as issued, notes included, in US and SI.
  for(const units of ['US','SI'] as const){
   const sheet=drawingSheetSet({...s,input:{...s.input,units}}).find(v=>v.svg.includes('data-view="tapered-haunch-elevation"'))!;
   expect(sheet.svg).toContain('HAUNCH FABRICATION');expect(sheet.svg.match(/.{60}(NaN|undefined|Infinity).{30}/)?.[0]).toBeUndefined();
  }
 });
 it('exports the plate, weld and bolt geometry in mm for the isometric figures',()=>{
  const p=cappedTaperedHaunch(),parts=taperedHaunchParts(p),h=parts.geometry;
  expect(parts.plates.map(v=>v.id)).toEqual(expect.arrayContaining(['web','top-flange','bottom-flange','stiffener-left','stiffener-right','end-plate']));
  const web=parts.plates.find(v=>v.id==='web')!;expect(web.thickness).toBeCloseTo(h.tw,9);
  // The web outline: the top flange underside at the column, the tip, and the sloping bottom flange's inner face.
  const zs=web.outline.map(q=>q[2]),ys=web.outline.map(q=>q[1]);expect(Math.max(...zs)).toBeCloseTo(-h.tt,6);expect(Math.min(...zs)).toBeCloseTo(-h.hr+h.tbv,6);expect(Math.min(...ys)).toBe(0);
  const top=parts.plates.find(v=>v.id==='top-flange')!,xs=top.outline.map(q=>q[0]);expect(Math.max(...xs)-Math.min(...xs)).toBeCloseTo(h.bt,6);
  expect(parts.welds.filter(w=>w.location==='field').map(w=>w.id)).toEqual(expect.arrayContaining(['top-flange-column','bottom-flange-column']));
  expect(parts.welds.every(w=>w.kind==='cjp'||w.runs.length>0)).toBe(true);
  expect(parts.bolts.length).toBeGreaterThan(0);for(const b of parts.bolts)expect(Math.abs(b.x)).toBeLessThan(h.bt/2);
 });
 it('builds every plate, weld and column stiffener in the 3D model',()=>{
  const p=existingBuildingHaunch('US'),b=p.details!.bracket!,steel=new THREE.MeshBasicMaterial(),edge=new THREE.LineBasicMaterial();
  const group=buildWeldedBrackets(b,[0,7.62],6,steel,edge,undefined,steel,undefined,false,p.details!.bearing.width),names:string[]=[];
  group.traverse(o=>{if(o instanceof THREE.Mesh)names.push(o.name);});
  for(const id of ['web','top-flange','bottom-flange','stiffener-left','stiffener-right','end-plate'])expect(names,id).toContain(`WB-S2-${id}`);
  expect(names.filter(n=>n.startsWith('CS-S1-')&&!n.includes('weld')&&!/flange-|web-/.test(n))).toHaveLength(4);
  const box=new THREE.Box3().setFromObject(group);expect([box.min.x,box.min.y,box.max.z].every(Number.isFinite)).toBe(true);
  // The haunch hangs below the seat by its root depth (model in metres).
  expect(6-box.min.y).toBeGreaterThanOrEqual(projectHaunch(p).hr/1000-1e-6);
 });
 it('reports pages 04B-04D without NaN in US and SI',()=>{
  for(const s of [tp1(),{...tp2(),input:{...tp2().input,units:'SI' as const}}]){
   const html=compactReport(s,'');expect(overPrecise(html)).toEqual([]);
   for(const t of ['Tapered haunch, inputs and actions','Tapered haunch, member checks','Tapered haunch welds, fatigue and column local effects'])expect(html.includes(t),t).toBe(true);
   const pages=html.slice(html.indexOf('Tapered I haunch · inputs'),html.indexOf('Tapered I haunch · welds')+20000);expect(pages.match(/.{80}(NaN|undefined|Infinity).{40}/)?.[0]).toBeUndefined();
  }
 });
 it('draws its isometric report figure with the five captioned markers',()=>{
  const f=checkFigure('Column bracket',cappedTaperedHaunch());
  expect(f.view).toBe('isometric');expect(f.path).toHaveLength(5);
  expect([...f.svg.matchAll(/font-weight="700" fill="#000">(\d+)<\/text>/g)].map(m=>+m[1]).sort((a,b)=>a-b)).toEqual([1,2,3,4,5]);
  expect(f.svg).not.toMatch(/NaN|undefined|Infinity/);
 });
 it('test project 3 is test project 2 in SI',()=>{
  const p=existingBuildingHaunch('SI');expect(p.units).toBe('SI');expect(validateProject(p)).toEqual([]);
  expect(p.details!.bracket!.haunch).toEqual(existingBuildingHaunch('US').details!.bracket!.haunch);
  expect(snapshotOf(p).input.units).toBe('SI');
 });
});

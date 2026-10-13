import {describe,expect,it} from 'vitest';
import {calculate} from '../../src/engine/calculate';
import {reportHtml} from '../../src/report/reportHtml';
import {compactReport} from '../../src/report/compactReport';
import {buildTaxonomy} from '../../src/engine/checkTaxonomy';
import {summaryElements} from '../../src/report/designSummary';
import {loadBasisTable} from '../../src/report/taxonomyReport';
import {sectionProperties} from '../../src/engine/section';
import {girderStrength} from '../../src/engine/aiscStrength';
import {flexureCurves} from '../../src/engine/loadHeightFlexure';
import {combinationBasis,combinationLabel,combinationOmissions,craneCombinations} from '../../src/engine/aistLoads';
import {demoFocus005RevB} from '../fixtures/demoFocus005RevB';

/**
 * Peer review of DEMO-FOCUS-005 Rev B, group B (girder and loads): M2 load-height LTB on the page with the Commentary F1
 * comparison, M3 combination traceability, M4 load basis, M8/M9 worked substitutions that reproduce, m3 deflection
 * criteria, m10 wheel and sidesway checks, m11 top and bottom flanges. One calculate of Rev B.
 */
const p=demoFocus005RevB(),s=calculate(p),check=(id:string)=>s.checks.find(c=>c.id===id)!;
const kip=4448.2216152605,kipft=1355817.948,inch=25.4,ksi=6.894757293168;
const unescape=(t:string)=>t.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&amp;/g,'&');
const html=reportHtml(s,undefined,''),report=compactReport(s,'');
const tex=[...report.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map(m=>unescape(m[1]));
/** The numbers of a printed TeX line in order (1{,}575 → 1575), without units, subscripts, exponents or text. */
const strip=(t:string)=>t.replace(/\\mathrm\{[^}]*\}(\^\{?\d\}?)?/g,' ').replace(/\\text\{[^}]*\}/g,' ').replace(/_\{[^}]*\}|_[A-Za-z]/g,'').replace(/\^\{[^}]*\}|\^\d(\.\d+)?/g,'').replace(/\{,\}/g,'').replace(/\\[A-Za-z]+/g,' ');
const numbers=(t:string)=>[...strip(t).matchAll(/-?\d+(?:\.\d+)?/g)].map(m=>Number(m[0]));
const line=(re:RegExp)=>{const t=tex.find(v=>re.test(v));expect(t,String(re)).toBeDefined();return t!;};
const near=(a:number,b:number,tol=5e-3)=>expect(Math.abs(a-b)/Math.max(Math.abs(b),1e-9)).toBeLessThanOrEqual(tol);

describe('Rev B after the peer review, group B (girder and loads)',()=>{
 it('still has no failing, unverified or incomplete checks and is eligible',{timeout:900000},()=>{
  expect(s.errors).toEqual([]);expect(s.eligible).toBe(true);
  expect(s.checks.filter(c=>['fail','unverified','incomplete','unsupported'].includes(c.status)).map(c=>c.id)).toEqual([]);
  expect(buildTaxonomy(s,summaryElements(s.input)).openItems).toEqual([]);
 });

 it('M2: load-height LTB enters F4 as Cb = Mcr/Mocr, agrees with the Commentary F1 bound, and is the Mcx H1 uses',()=>{
  const lh=s.detailResults!.loadHeight!,c=check('flexure-load-height'),props=sectionProperties(p.section),st=girderStrength(p,props),curve=flexureCurves(p,props).positive;
  expect(c.capacity).toBeCloseTo(lh.capacity,6);
  expect(lh.mocr).toBeCloseTo(curve.mcr(p.unbracedLength),6);expect(lh.cb).toBeCloseTo(lh.critical/lh.mocr,9);
  expect(lh.capacity).toBeCloseTo(Math.min(st.major,.9*lh.cb*st.ltb!,.9*lh.critical),6);
  // The reviewer's Commentary F1 bound (D/C about 0.42): the eigenvalue Cb and the Commentary Cb agree within 10 %.
  const cm=lh.commentary!;expect(cm.factor).toBeCloseTo(1.4**(2*cm.y/cm.h),9);
  expect(Math.abs(cm.cb/lh.cb-1)).toBeLessThan(.1);expect(lh.demand/cm.capacity).toBeGreaterThan(.38);expect(lh.demand/cm.capacity).toBeLessThan(.46);
  expect(c.utilization!).toBeGreaterThan(check('major').utilization!);expect(c.utilization!).toBeGreaterThan(.4);
  // Basis: AISC F4 and Commentary F1, not the constant-moment EJ benchmark.
  expect(c.referenceIds).toContain('aisc-f4');expect(c.referenceIds).not.toContain('ltb-energy');
  expect(c.note).toMatch(/Commentary F1 comparison/);
  // H1 uses the governing flexural strength.
  expect(s.detailResults!.interaction!.mcx).toBeCloseTo(lh.capacity,6);
  // On the girder page: the LTB line is printed (not in "other limit states"), worked with its inputs.
  const tax=buildTaxonomy(s,summaryElements(s.input));
  expect(tax.shown.some(l=>l.controlling.id==='flexure-load-height')).toBe(true);
  const cb=numbers(line(/^C_b=\\frac\{M_\{cr\}\}\{F_\{cr\}S_\{xc\}\}=/));near(cb[0]/cb[1],cb[2],2e-3);
  const mn=numbers(line(/^\\phi_bM_n=0\.90\\times\\min\(/));near(mn[0]*Math.min(mn[1],mn[2]*mn[3]),mn[4]);near(mn[4],c.capacity!/kipft);
  const mcr=numbers(line(/^M_\{cr\}=\\lambda M_u\/0\.8=/));near(mcr[1]*mcr[2]/mcr[3],mcr[4]);
  const f1=numbers(line(/^\\text\{Cross-check, AISC Commentary F1: \}/));near(f1[5]*f1[6]/(f1[7]*f1[8]+f1[9]*f1[10]+f1[11]*f1[12]+f1[13]*f1[14]),f1[15]);near(f1[15],cm.gradient,2e-3);
 });

 it('M3: every printed combination maps to its TR-13 case and ASCE 7-16 basis; impact and side thrust are separate; no raw ids',()=>{
  const all=craneCombinations('LRFD'),omitted=combinationOmissions('LRFD').map(o=>o.id);
  expect(omitted).toEqual(['1','2','6/7','3a','4a']);
  expect(combinationLabel('10-T')).toBe('10 (traction)');expect(combinationLabel('10-B')).toBe('10 (bumper)');expect(combinationLabel('6/7')).toBe('6 and 7');
  for(const c of all)expect(combinationBasis('LRFD',c.id).asce,c.id).not.toBe('—');
  expect(combinationBasis('LRFD','2b').asce).toBe('§2.3.1 (2)');
  // DG7 errata (Feb. 2023): 2b has side thrust without impact, 2c impact without side thrust.
  const b2=all.find(c=>c.id==='2b')!,c2=all.find(c=>c.id==='2c')!;expect(b2.h).toBe(1.6);expect(b2.i).toBe(0);expect(c2.i).toBe(1.6);expect(c2.h).toBe(0);
  const text=report.replace(/<annotation[\s\S]*?<\/annotation>/g,'');
  expect(text).toMatch(/Impact and side thrust are in different combinations/);expect(text).toMatch(/errata of February 16, 2023/);
  const table=text.slice(text.indexOf('TR-13 case'),text.indexOf('Not listed, bounded by the cases shown'));
  for(const c of all.filter(c=>!omitted.includes(c.id)))expect(table,c.id).toContain(`LRFD ${combinationLabel(c.id)}`);
  for(const id of ['1','2','3a','4a'])expect(table).not.toMatch(new RegExp(`>LRFD ${id}<`));
  expect(text).toMatch(/Not listed, bounded by the cases shown: LRFD 1, 2, 6 and 7 \(no crane on the runway\); LRFD 3a \(bounded by 2a: /);
  expect(text).toMatch(/One crane runs on this runway/);
  // S-00 lists the same cases with the same labels.
  const s00=html.slice(html.indexOf('LOAD COMBINATIONS · RUNWAY GIRDER'),html.indexOf('SUPPORT REACTIONS · UNFACTORED'));
  expect(s00.length).toBeGreaterThan(100);
  for(const raw of ['10-T','10-B','6/7'])expect(s00).not.toContain(raw);
  expect(s00.toUpperCase()).toContain('10 (TRACTION)');expect(s00.toUpperCase()).toContain('ALSO EVALUATED');
 });

 it('M4: one load basis table, code minimum against the supplier value, the governing source named, no 1.00 / 1.00 rows',()=>{
  const text=report.replace(/<annotation[\s\S]*?<\/annotation>/g,'');
  const t=text.slice(text.indexOf('Crane design loads: code minimum against the supplier value'),text.indexOf('2.3 Dead loads'));
  expect(t).toMatch(/Vertical impact I.*?<b>25%<\/b> · Supplier/s);
  expect(t).toMatch(/Side thrust C<sub>ss<\/sub>, this runway.*?<b>2\.00 kip<\/b> · Supplier/s);
  expect(t).toMatch(/1\.00 kip at each of 2 wheels/);
  expect(text).not.toMatch(/scaled by 1\.00/);expect(text).not.toMatch(/Load basis: supplied value against the code minimum/);
  // The taxonomy table, where used: the supplier governs when its value exceeds the code minimum; inclusion rows dropped.
  const lb=loadBasisTable(buildTaxonomy(s,summaryElements(s.input)),'US');
  expect(lb).toMatch(/Vertical impact<\/b><\/td><td class="num">0\.25<\/td><td class="num">0\.10<\/td><td>Supplier/);
  expect(lb).not.toMatch(/Runway load-path scope|Wheel-load decomposition|AIST crane load combinations/);
 });

 it('m11: top and bottom flanges are checked separately; the bottom flange governs H1 and the normal stress',()=>{
  const top=check('combined'),bottom=check('combined-bottom'),nt=check('torsion-normal'),nb=check('torsion-normal-bottom');
  for(const c of [top,bottom,nt,nb])expect(c.status).toBe('pass');
  expect(top.title).toMatch(/top flange/);expect(bottom.title).toMatch(/bottom flange/);
  expect(bottom.utilization!).toBeGreaterThan(top.utilization!);expect(bottom.note).toMatch(/the bottom flange governs/);
  expect(nb.demand!).toBeGreaterThan(nt.demand!);expect(nt.equation).toContain('S_{xc}');expect(nb.equation).toContain('S_{xt}');
  // Each flange with its own section modulus and warping function at its tips.
  const W=s.detailResults!.flangeWarping!;expect(W.bottom).toBeGreaterThan(W.top);
  // The worked H1 lines reproduce: P/(2Pc) + Mrx/Mcx + Mf/Mcf.
  for(const [re,c] of [[/^\\text\{Top flange \(/,top],[/^\\text\{Bottom flange \(/,bottom]] as const){const n=numbers(line(re));near(n[1]/(n[2]*n[3])+n[4]/n[5]+n[6]/n[7],n[8],3e-3);near(n[8],c.utilization!,2e-3);}
 });

 it('m10: one wheel web yielding capacity over the TR-13 length (no k term), J10-7 sidesway with Cr = 960,000 ksi',()=>{
  expect(s.checks.some(c=>c.id==='wheel-web-tr13')).toBe(false);
  const y=check('wheel-yield'),lb=2*(p.aist!.railDepth+p.section.tf+p.section.capTw);
  expect(y.capacity).toBeCloseTo(p.section.Fy*p.section.tw*lb,6);expect(y.demand).toBeCloseTo(13.6*kip,0);
  const sw=check('sidesway');expect(sw.note).toMatch(/960,000 ksi/);
  const w=numbers(line(/^\\phi R_n=1\.00\\times F_\{yw\}t_wl_b=/));near(w[1]*w[2]*w[3]*w[4],w[5]);near(w[5],y.capacity!/kip);
  const sl=line(/^\\phi R_n=0\.85\\times\\frac\{C_rt_w\^3t_f\}/);expect(sl).toContain('960{,}000');
  const cr=line(/^\\phi R_n=0\.75\\times0\.40t_w\^2/);expect(cr).toContain('J10-5b');
  expect(tex.some(t=>t.includes('(0.375\\,\\mathrm{in})^2'))).toBe(true);
 });

 it('M8: worked substitutions print 3/8 in as 0.375 in, carry phi, and reproduce their results',()=>{
  const sh=numbers(line(/^\\phi_vV_n=1\.00\\times0\.6F_ydt_wC_\{v1\}/));expect(sh).toContain(.375);near(sh[2]*sh[3]*sh[4]*sh[5]*sh[6]*sh[7],sh[8]);
  for(const t of tex)expect(t,t).not.toMatch(/\b0\.37\\,\\mathrm\{in\}/);
  // Rail lateral flexure compares with phi Mn; the long weld equations break inside their column.
  expect(check('rail-flexure').equation).toContain('\\phi_bM_n');
  const rf=numbers(line(/^\\phi M_n=0\.90F_yS_y=/));near(rf[1]*rf[2]*rf[3]/12,rf[4]);
  const vd=numbers(line(/^\\Delta_v=\\frac\{Pa\(3L\^2-4a\^2\)\}\{24EI_x\}=/));near(vd[3]*vd[4]*(vd[5]*vd[6]**2+vd[7]*vd[8]**2)/(vd[9]*vd[10]*vd[11]),vd[12],2e-3);
 });

 it('m3: the deflection checks state every criterion and the governing one',()=>{
  const v=check('vertical');expect(v.equation).toMatch(/L\/1000=\\text\{0\.30 in\}/);
  expect(v.note).toMatch(/owner L\/600/);expect(v.note).toMatch(/AIST class B: L\/1000/);expect(v.note).toMatch(/CMAA C: L\/600/);expect(v.note).toMatch(/governing adopted limit L\/1000/);
  expect(v.capacity).toBeCloseTo(300*inch/1000,6);
  const l=check('lateral');expect(l.equation).toMatch(/L\/400=\\text\{0\.75 in\}/);expect(l.note).toMatch(/AIST L\/400/);
  expect(line(/^\\Delta_v\\le L\/n_v,\\ n_v=\\max\(600,\\,1000,\\,600\)=1000/)).toBeDefined();
 });

 it('M9: every element shows a worked example of its governing or near-limit checks',()=>{
  const worked=(re:RegExp)=>expect(tex.some(t=>re.test(t)),String(re)).toBe(true);
  worked(/^m_u=\\frac\{Pc\^2\}\{2lW\}=|^m_u=\\frac\{P\(x-x_s\)\}\{b_e\}=/);// haunch seat strip
  worked(/^P_c=\\phi P_n\/2=|^\\frac\{P_r\}\{P_c\}=/);// haunch bearing stiffener column (eccentric, or axial on a wing)
  worked(/^d_s=h_s-2c=/);// haunch stiffener as a stiffened seat
  worked(/^\\theta h_b\+\\alpha L\\Delta T\+t_\{set\}=/);// tie slots
  worked(/^1\.5T_b=1\.5\\times/);// sleeves
  worked(/^\\alpha L\\Delta T\+d\\theta\+t_\{set\}=/);// sliding end travel
  worked(/^t_\{min\}=\\sqrt\{\\frac\{4Tb\^\\prime\}\{\\phi pF_u\}\}=/);// end stop prying
  worked(/^f_w=\\frac\{1\}\{2t_el_w\}/);// rail clip base weld
  // The sleeve line reproduces.
  const sl=numbers(line(/^1\.5T_b=1\.5\\times/));near(sl[1]*sl[2],sl[3]);near(sl[4]*sl[5]*sl[6],sl[7]);
  const lh=s.detailResults!.loadHeight!;expect(lh.demand/kipft).toBeGreaterThan(100);expect(ksi).toBeGreaterThan(6);
 });
});

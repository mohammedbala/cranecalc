import {describe,expect,it} from 'vitest';
import {calculate} from '../../src/engine/calculate';
import {buildTaxonomy} from '../../src/engine/checkTaxonomy';
import {summaryElements} from '../../src/report/designSummary';
import {compactReport} from '../../src/report/compactReport';
import {coverSheetSvgs} from '../../src/components/coverSheet';
import {columnStiffenerGeometry,stiffenerGauge} from '../../src/engine/columnStiffeners';
import {deliveredForces,braceImperfection} from '../../src/engine/forcesDelivered';
import {deliveredRows} from '../../src/report/deliveredTable';
import {responsibilityMatrix} from '../../src/report/responsibility';
import {capTieLine,capAngleGeometry} from '../../src/engine/capAngle';
import {asceCombinations} from '../../src/engine/asceCombinations';
import {workedSteps,haunchJ10Worked} from '../../src/report/workedChecks';
import {demoFocus005RevB} from '../fixtures/demoFocus005RevB';
// The cover with the sheets continuing its notes (S-00A) where they do not fit it at the lettering size.
const coverSheetSvg=(...a:Parameters<typeof coverSheetSvgs>)=>coverSheetSvgs(...a).join('');

/**
 * Peer review round 2, group A (column side and hand-off) on DEMO-FOCUS-005 Rev B: C2 one force system at the haunch
 * flanges with the column stiffeners carrying it, C4 the forces delivered to the building per grid, M5 the existing
 * column check's stated conditions, M6 the tie design force and the restraint at the tie line, M10 the
 * responsibility matrix. One calculate.
 */
const kip=4448.2216152605,kft=kip*304.8,inch=25.4,ksi=6.894757293168;
const p=demoFocus005RevB(),s=calculate(p),check=(id:string)=>s.checks.find(c=>c.id===id)!;
const tax=buildTaxonomy(s,summaryElements(s.input)),html=compactReport(s,'');
const plain=(h:string)=>h.replace(/<annotation[\s\S]*?<\/annotation>/g,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ');
const text=plain(html),page1=plain(html.slice(0,html.indexOf('</section>')));
const section=(title:string)=>{const i=html.search(new RegExp(`<h2>\\d+\\.\\d+ ${title}</h2>`));expect(i,title).toBeGreaterThan(0);return plain(html.slice(i,html.indexOf('</section>',i)));};
const ru=(note:string)=>Number(note.match(/R_u = ([\d.,]+) kip/)![1].replace(/,/g,''));

describe('Rev B stays clean',()=>{
 it('has no failing, unverified or open checks',()=>{
  expect(s.errors).toEqual([]);expect(s.eligible).toBe(true);
  expect(s.checks.filter(c=>['fail','unverified','incomplete','unsupported'].includes(c.status)).map(c=>c.id)).toEqual([]);
  expect(tax.openItems).toEqual([]);
 });
});

describe('C2 · one force system for each haunch flange at the column face',()=>{
 const S=s.detailResults!.taperedHaunch!.strength;
 it('takes the same equivalent concentrated force in every unstiffened J10 limit state at a level, for information',()=>{
  const top=['haunch-column-flange','haunch-column-yield-top'].map(check),bottom=['haunch-column-yield-bottom','haunch-column-crippling'].map(check);
  for(const c of [...top,...bottom]){expect(c.status,c.id).toBe('not-applicable');expect(c.note).toMatch(/^Unstiffened J10\.\d, not governing \(the column is stiffened at this level\): R_u = /);}
  // One R_u per level: T + 3M_f/b at the top, C cos α + 3M_f/b at the bottom; before, J10.1 used 132 kip and J10.2 used T = 44.3 kip.
  expect(ru(top[0].note)).toBe(ru(top[1].note));expect(ru(bottom[0].note)).toBe(ru(bottom[1].note));
  expect(ru(top[0].note)).toBeCloseTo(S.pull.value/kip,0);expect(S.pull.value/kip).toBeCloseTo(144.3,0);
  expect(S.push.value/kip).toBeCloseTo(133.4,0);
  // The flange force system: T = 44.4 kip (with the wing stiffeners' weight) with M_f = 34.3 kip-ft (DG9 flange bending
  // of the torque), R_u = T + 3M_f/b.
  const b=14*inch;expect(Math.abs(S.pull.P!)/kip).toBeCloseTo(48.70,1);expect(Math.abs(S.pull.M!)/kft).toBeCloseTo(37.17,1);
  expect(S.pull.value).toBeCloseTo(Math.abs(S.pull.P!)+3*Math.abs(S.pull.M!)/b,3);
  // J10.2 with the column's k = kdes = 1.31 in (AISC J10.2: to the web toe of the fillet; with k = tf it read 1.44) is not
  // exceeded unstiffened; J10.1 is (1.02, below), and M_f needs the stiffeners. J10.1 cites J10.1, not J10.8.
  expect(check('haunch-column-yield-top').note).toMatch(/^Unstiffened J10\.2, not governing \(the column is stiffened at this level\): R_u = 144(\.\d+)? kip against φR_n = 166(\.\d+)? kip, D\/C 0\.87\./);expect(check('haunch-column-yield-top').note).toContain('k = kdes = 1.31 in (AISC W14X90)');
  expect(check('haunch-column-flange').note).toMatch(/^Unstiffened J10\.1, not governing/);
  // The panel takes the net flange force; the couples add none.
  expect(check('haunch-column-panel').demand).toBeCloseTo(Math.max(S.tension.value,S.compression.value),6);
 });
 it('designs the full-depth stiffener pair for T/2 ± M_f/g on one plate, no unstiffened strength credited',()=>{
  const g=columnStiffenerGeometry(p)!,gauge=stiffenerGauge(g);
  expect(gauge/inch).toBeCloseTo(.44+6.75,2);expect(g.full).toBe(true);expect(g.field).toBe(true);
  const up=check('haunch-colstiff-upper'),low=check('haunch-colstiff-lower');
  expect(up.equation).toContain('R_{st}=\\frac{T}{2}\\pm\\frac{M_f}{g}');expect(low.equation).toContain('\\frac{C}{2}\\pm\\frac{M_f}{g}');
  const T=S.stiffUpperT;expect(up.demand).toBeCloseTo(Math.abs(T.P!)/2+Math.abs(T.M!)/gauge,3);
  expect(up.demand!/kip).toBeCloseTo(86.4,0);expect(low.demand!/kip).toBeCloseTo(79.4,0);
  // One plate in tension: J4.1 yielding at the clipped contact, 0.90 Fy (b_s − c) t_s = 0.9(50)(6.0)(0.75) = 202.5 kip.
  expect(up.capacity!/kip).toBeCloseTo(.9*50*6*.75,1);expect(up.status).toBe('pass');expect(low.status).toBe('pass');
  // Welds on one plate (two throats) and the web shear along them carry the larger plate force.
  expect(check('haunch-colstiff-flange-weld').demand).toBeCloseTo(up.demand!/(2*g.s.flangeWeld/Math.SQRT2*g.contact),3);
  expect(check('haunch-colstiff-web-shear').demand).toBeCloseTo(up.demand!/(g.webLength*g.tw),3);
  for(const id of ['proportions','length','flange-weld','web-weld','web-shear','fatigue-plate','fatigue-weld'])expect(check('haunch-colstiff-'+id).status,id).toBe('pass');
 });
 it('makes the governing design D/C a meaningful check and lists the stiffeners in the summary',()=>{
  expect(tax.governing!.check.id).not.toMatch(/^haunch-column/);expect(tax.governing!.dc).toBeLessThan(.93);
  expect(page1).toMatch(/Column stiffeners 2 pairs PL 3\/4" × 6 3\/4", full depth, one pair at each haunch flange; 5\/8" fillets to the flanges and 5\/8" to the web, both faces; field welded inside the existing column/);
  // Worked: the unstiffened J10 at both flanges (R_u = P + 3M_f/b, J10.1 and J10.3) and the J10.6 panel with the net force.
  const tx=(v:number,q:string)=>`${q}:${v}`,j10=haunchJ10Worked(s,tx as never);
  // Each flange: the case name, the equation and its substitution on separate lines (none runs past the margin), then the strength.
  expect(j10).toHaveLength(8);expect(j10[0]).toMatch(/^\\text\{Top flange \(/);expect(j10[1]).toBe('R_u=T+\\frac{3M_f}{b}');expect(j10[2]).toMatch(/^\\quad=/);expect(j10[3]).toContain('6.25F_{yf}t_f^2');expect(j10[4]).toMatch(/^\\text\{Bottom flange \(/);expect(j10[7]).toContain('J10.3');
  expect(workedSteps(s,check('haunch-column-panel'),tx as never)?.[0]).toContain('\\max(T,\\ C\\cos\\alpha)');
  expect(text).toMatch(/Worked: unstiffened J10 at the haunch flanges \(basis for the stiffener decision\)/);
  expect(text).toMatch(/Column stiffeners required\. Unstiffened, flange local bending \(J10\.1\) is exceeded at the top flange \(D\/C 1\.02\), and the haunch needs M ?f resisted at the column/);expect(text).toMatch(/J10\.5 and J10\.7 do not apply/);
 });
});

describe('C4 · forces delivered to the building columns',()=>{
 const d=deliveredForces(s)!;
 it('gives per-grid concurrent sets with the strong-axis V·e and the weak-axis seat moment, not the girder torque',()=>{
  expect(d.grids.map(g=>g.grid)).toEqual([1,2,3,4,5,6]);expect(d.e!/inch).toBeCloseTo(33,6);
  const maxV=d.grids[2].sets.find(x=>x.label.startsWith('max V'))!;
  expect(maxV.V/kip).toBeCloseTo(29.0,1);expect(maxV.Mx!/kft).toBeCloseTo(29.04*33/12,0);expect(Math.abs(maxV.My)/kft).toBeCloseTo(20.4,1);
  // The girder torque about its shear center (2.11 kip-ft before) is not the seat moment.
  const torque=Math.max(...s.detailResults!.interfaces.map(v=>Math.abs(v.torque)));
  expect(Math.abs(maxV.My)).toBeGreaterThan(5*torque);
  // The crane stop force reaches grids 1 and 5 only; traction 1.6 × 2.0 = 3.2 kip reaches grids 1 to 5, none at the sliding grid 6.
  expect(d.stopGrids).toEqual([1,5]);expect(d.stop/kip).toBeCloseTo(10,3);expect(d.tractionGrids).toEqual([1,2,3,4,5]);expect(d.traction/kip).toBeCloseTo(3.2,3);
  expect(d.grids[5].sets.every(x=>Math.abs(x.F)<1)).toBe(true);
 });
 it('delivers the tie design force at the tie line, and prints the same rows in section 3.5 and on S-00 (page 1 points to them)',()=>{
  expect(Math.max(...d.grids.flatMap(g=>g.sets.map(x=>x.Htie)))).toBeCloseTo(d.tie.design,6);
  expect(d.tie.design).toBeCloseTo(check('brace-member').demand!,6);
  const rows=deliveredRows(s),line=(r:string[])=>r.slice(3).join(' ');
  const s35=section('Forces delivered to the building'),cover=[...coverSheetSvg(s,[]).matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1]).join(' ');
  expect(page1).not.toMatch(/Forces delivered to the building/);
  for(const r of rows){expect(s35).toContain(line(r));for(const v of r.slice(3))expect(cover).toContain(v.toUpperCase().replace(/&/g,'&amp;'));}
  expect(page1).not.toMatch(/seat moment 2\.11/);expect(s35).toMatch(/y,seat ?: moment of the unbalanced end reactions about the grid \(column weak axis\)/);
  expect(s35).toMatch(/El\. 118'-0"/);expect(s35).toMatch(/Stop force 10\.0 kip at grids 1 and 5 only/);
 });
});

describe('M5 · the existing column check states its conditions',()=>{
 it('is conditional on a braced frame next to its D/C and in the matrix',()=>{
  const c=check('column-interaction');expect(c.title).toMatch(/braced frame assumed/);expect(c.note).toMatch(/^Conditional on a braced \(non-sway\) frame/);
  // Page 1 names the column element as conditional; its governing check is the torsion from the share the strut leaves it.
  expect(page1).toMatch(/Existing column \(conditional\) Existing column, torsion from the longitudinal force offset/);
  expect(text).toMatch(/Conditional result\. The column check of this section holds with these restraints/);
  const col=section('Existing column');
  expect(col).toMatch(/Braced frame assumed \(pinned base, braced top, B1 only\)\. If the frame is a sway frame, repeat with B2 from the frame analysis/);
  expect(col).toMatch(/L ?cx = 312 in, base to the braced top\. Weak-axis, torsional and lateral-torsional buckling use 120 in, the surveyed unbraced length of the inner flange, which receives the bracket \(the girts at 96 in brace the outer flange only\)/);
  expect(col).toMatch(/Impact C ?i is included in the column load/);expect(col).toMatch(/Drift \(AIST TR-13 §5\.3\): H = 23[12](\.\d+)? in .*limit min\(H\/400, 2 in\) = 0\.58 in/);
  expect(col).toMatch(/Frame action, base fixity, anchors and foundations are by others \(section 6\.7\)/);expect(col).not.toMatch(/verified separately/);
  expect(col).toMatch(/combinations with E .*do not govern/);
 });
 it('numbers the combinations as ASCE 7-16 §2.3.1 and §2.3.6',()=>{
  const k=(id:string)=>asceCombinations('LRFD').find(v=>v.id===id)!.equation;
  expect(k('5+')).toBe('0.9D + 1.0W');expect(k('6+')).toBe('1.2D + 1.0E + L + 0.2S');expect(k('7+')).toBe('0.9D + 1.0E');
  expect(s.existingColumn!.combinations.some(v=>v.id==='LRFD 6+'&&v.equation.includes('E'))).toBe(true);
 });
});

describe('M6 · the tie design force and the restraint at the tie line',()=>{
 it('models the top restraint at the tie plate line and derives F = H + P_br on the page',()=>{
  const g=capAngleGeometry(p)!;expect(capTieLine(p)!/inch).toBeCloseTo(13.9+.716+.375/2,2);expect(g.plate.zc/inch).toBeCloseTo(.1875,4);
  const A6=braceImperfection(p,s.designAnalysis!,s.properties!),r=s.detailResults!;
  // P_br = 0.02(134.0 × 12)/13.42 + 0.01(10.0) = 2.40 + 0.10 = 2.50 kip (A2c moment); stiffness 5.68 kip/in required.
  expect(A6.force/kip).toBeCloseTo(2.50,2);expect(A6.stiffness/(kip/inch)).toBeCloseTo(5.68,2);
  expect(check('brace-member').demand).toBeCloseTo(r.demands.brace+A6.force,6);
  // The analysis force per grid (all girder ends) and per girder end (one tie); the restraint at the tie line lowers H from 4.38 kip.
  expect(r.demands.brace/kip).toBeLessThan(4.38);expect(r.demands.braceEnd!).toBeLessThanOrEqual(r.demands.brace*(1+1e-9));
  // Worked on the girder page: P_br, then F = H + P_br, against the tie strength.
  const w=workedSteps(s,check('brace-member'),((v:number,q:string)=>`${q}:${v}`) as never)!;
  expect(w).toHaveLength(3);expect(w[0]).toContain('P_{br}=\\frac{0.02M_rC_d}{h_o}+0.01P_r');expect(w[1]).toContain(`F=H+P_{br}=force:${r.demands.brace}+force:${A6.force}`);
  const tie=section('Cap tieback');
  expect(tie).toMatch(/tie design force F = H \+ P ?br = 4\.\d\d kip \+ 2\.50 kip = 6\.\d\d kip ?, pull or push/);
  expect(tie).toMatch(/H: largest top-flange restraint force at a grid \(LRFD A2b, grid 5\)/);expect(tie).toMatch(/Required brace stiffness 5\.68 kip\/in vs 34\.8 kip\/in provided \(the secant stiffness with the tie's play; 272 kip\/in after contact\)/);expect(tie).toMatch(/Fatigue range ΔF = 2\.\d\d kip/);
 });
});

describe('M10 · the responsibility matrix',()=>{
 const rows=responsibilityMatrix(tax,s),item=(re:RegExp)=>rows.find(r=>re.test(r.item));
 it('gives item, need, acceptance criterion, forces and location, responsible party for every item left to others',()=>{
  const m=section('Items by others and forces delivered');
  expect(m).toMatch(/Item What is needed Acceptance criterion Force and location delivered Responsible party/);
  for(const re of [/frame type/,/10-year wind \(TR-13/,/rail gauge/,/Runway seismic/,/alteration evaluation/,/Crane-level strut on the girder line/,/Crane data/,/Rail and crane wheels/,/Opposite runway/,/Existing column survey/,/Load test at 125%/])expect(item(re),String(re)).toBeDefined();
  expect(item(/10-year wind \(TR-13/)!.criterion).toMatch(/H\/400 or 2 in.*H = 232 in.*limit 0\.58 in/);
  expect(item(/rail gauge/)!.forces).toMatch(/Column alone, runway dead load plus static crane: \+0\.073 in \(7% of the limit\)\. Frame spread: by others\./);
  expect(item(/Crane data/)!.needed).toMatch(/s = 0\.5.*0\.9 trolley factor/);
  expect(item(/Crane-level strut/)!.needed).toMatch(/the existing column check relies on it/);expect(item(/Crane-level strut/)!.forces).toMatch(/crane stop 10\.0 kip at grids 1 and 5/);
  expect(item(/Load test/)!.criterion).toMatch(/12\.2 kip per wheel ≤ the design wheel load 15\.0 kip/);
  // No by-others row for what this package checks.
  expect(rows.some(r=>/column-side load path|load paths to the column/.test(r.item))).toBe(false);
  expect(tax.byOthers.some(t=>t.check.id==='bracket-load-path')).toBe(false);
  for(const r of rows)for(const k of ['item','needed','criterion','forces','party'] as const)expect(r[k].length,`${r.item} ${k}`).toBeGreaterThan(0);
  expect(page1).toMatch(/Items by others and the forces delivered to them: section 6\.7/);
 });
});

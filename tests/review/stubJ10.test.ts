import {describe,expect,it} from 'vitest';
import {calculate} from '../../src/engine/calculate';
import {compactReport} from '../../src/report/compactReport';
import {createRolledBracketCollector,rolledBracketChecks,columnFlangeForces,stubActions,stubBearing,projectStub,stubColumnStrengths} from '../../src/engine/rolledBracket';
import {createBracketCollector,bracketChecks} from '../../src/engine/bracketDesign';
import {columnStiffenerGeometry,stiffenerGauge} from '../../src/engine/columnStiffeners';
import {flangeLevelStrengths} from '../../src/engine/flangeForceSystem';
import {haunchColumnStrengths,haunchFlangeLevels,projectHaunch} from '../../src/engine/taperedHaunch';
import {workedSteps,flangeJ10Worked} from '../../src/report/workedChecks';
import {cappedStubW14X90,cappedTwinRibW14X90} from '../fixtures/columnStiffenerProjects';
import {demoFocus005RevB} from '../fixtures/demoFocus005RevB';
import type {CheckResult,ProjectInput} from '../../src/engine/types';
import {reviewOpenItem} from './openItems';

/**
 * C2 on the rolled W-stub bracket: one force system per stub flange at the column face (flange force T or C with the
 * flange lateral moment M_f), the same equivalent concentrated force R_u = P + 3M_f/b in J10.1-J10.4 at each flange
 * level, and with column stiffeners the pair carrying the whole system, R_st = P/2 ± M_f/g on one plate (the tapered
 * haunch's model, shared). The welded twin-rib bracket's stiffeners carry the whole force of each level too.
 * Engine level on the W12X58 stub on an A36 W14X90 test project; one full calculate for the report.
 */
const kip=4448.2216152605,inch=25.4,ksi=6.894757293168;
const byId=(checks:CheckResult[],id:string)=>{const c=checks.find(v=>v.id===id);expect(c,id).toBeDefined();return c!;};
const ru=(note:string)=>Number(note.match(/R_u = ([\d.,]+) kip/)![1].replace(/,/g,''));
/** Strength sets on the stub: an offset girder end with longitudinal and lateral force, and a centered pair; a fatigue bin; a service set. */
function stubRun(p:ProjectInput){
 const c=createRolledBracketCollector(p)!;
 c.observe('strength','offset',0,[{vertical:100000,offset:230,length:120}],-1,{longitudinal:8000,bottom:6000,offset:230});
 c.observe('strength','centered',0,[{vertical:70000,offset:-200,length:120},{vertical:70000,offset:200,length:120}],-1,{longitudinal:0,bottom:4000,offset:0});
 c.observe('fatigue','bin',0,[{vertical:30000,offset:230,length:120}],0);c.observe('service','v',0,[{vertical:30000,offset:0}],-1);
 return {r:c.result,checks:rolledBracketChecks(p,c.result)};
}

describe('C2 · one force system per W-stub flange at the column face',()=>{
 it('takes the same R_u = P + 3M_f/b in every unstiffened J10 limit state at a level, as design checks without stiffeners',()=>{
  const p=cappedStubW14X90(false),{r,checks}=stubRun(p),S=r.strength,st=projectStub(p);
  const top=['wbracket-column-flange','wbracket-column-yield-top'].map(id=>byId(checks,id)),bottom=['wbracket-column-yield-bottom','wbracket-column-crippling'].map(id=>byId(checks,id));
  // The same R_u at each level (before: J10.1 used T + 3M_f/b, J10.2 the net flange force T alone).
  expect(top[0].demand).toBe(top[1].demand);expect(bottom[0].demand).toBe(bottom[1].demand);
  expect(top[0].demand).toBe(S.pull.value);expect(bottom[0].demand).toBe(S.push.value);
  // R_u from the flange force system of its governing set: twice the more loaded half flange over b_f.
  expect(S.pull.value).toBeCloseTo(Math.abs(S.pull.P!)+3*Math.abs(S.pull.M!)/st.bf,6);
  expect(S.push.value).toBeCloseTo(Math.abs(S.push.P!)+3*Math.abs(S.push.M!)/st.bf,6);
  expect(Math.abs(S.pull.M!)).toBeGreaterThan(0);
  // The governing set's own forces: the offset end, with the longitudinal force, pulls hardest.
  const {a,e}=stubBearing(p),f=stubActions(st,a,e,[{vertical:100000,offset:230,length:120}],{longitudinal:8000,bottom:6000,offset:230});
  expect(columnFlangeForces(st,f).pull).toBeLessThanOrEqual(S.pull.value*(1+1e-9));
  // Design checks without stiffeners; the A36 W14X90 web cannot take the top flange system (J10.2 above J10.1).
  for(const c of [...top,...bottom]){expect(['pass','fail']).toContain(c.status);expect(c.note).toContain('One force system per stub flange');}
  expect(top[1].status).toBe('fail');expect(top[1].utilization!).toBeGreaterThan(top[0].utilization!);
  expect(top[1].note).toContain('a full-depth column stiffener pair at each stub flange level (J10.8) is required');
  // The panel takes the net flange force; the couples add none.
  expect(byId(checks,'wbracket-column-panel').demand).toBeCloseTo(Math.max(S.tension.value,S.compression.value),6);
  expect(S.tension.value).toBeLessThan(S.pull.value);
 });
 it('evaluates the unstiffened J10 strengths at the stub flange levels with the shared helper',()=>{
  const p=cappedStubW14X90(false),st=projectStub(p),J=stubColumnStrengths(p,st),c=p.details!.bracket!.receiver;
  expect(J.levels).toEqual({top:1.5*inch,bottom:1.5*inch+st.d,lbTop:st.tf,lbBottom:st.tf});
  const half=J.topFlangeEnd?.5:1;expect(J.flange).toBeCloseTo(.9*half*6.25*36*ksi*(.71*inch)**2,3);
  expect(J.yieldTop).toBeCloseTo(c.Fy*c.webThickness*((J.topWebEnd?2.5:5)*c.flangeThickness+st.tf),3);
  // The tapered haunch uses the same function (its J10 values are unchanged: Rev B checks.json).
  const q=demoFocus005RevB(),g=projectHaunch(q);expect(haunchColumnStrengths(q,g)).toEqual(flangeLevelStrengths(q,haunchFlangeLevels(g)));
 });
 it('with column stiffeners: J10.1-J10.4 for information, the plates carry P/2 ± M_f/g with no unstiffened strength credited',()=>{
  const p=cappedStubW14X90(true),{r,checks}=stubRun(p),S=r.strength,g=columnStiffenerGeometry(p)!,gauge=stiffenerGauge(g);
  for(const id of ['column-flange','column-yield-top','column-yield-bottom','column-crippling']){const c=byId(checks,'wbracket-'+id);
   expect(c.status,id).toBe('not-applicable');expect(c.note).toMatch(/^Unstiffened J10\.\d, not governing \(the column is stiffened at this level\): R_u = /);expect(c.note).toContain('half-depth column stiffener pair');}
  // The same R_u in the notes at each level.
  expect(ru(byId(checks,'wbracket-column-flange').note)).toBe(ru(byId(checks,'wbracket-column-yield-top').note));
  expect(ru(byId(checks,'wbracket-column-yield-bottom').note)).toBe(ru(byId(checks,'wbracket-column-crippling').note));
  expect(ru(byId(checks,'wbracket-column-flange').note)*kip).toBeCloseTo(S.pull.value,-2);
  // g = t_w + b_s = 0.44 + 6.75 in; R_st on one plate from the flange system of its governing set.
  expect(gauge/inch).toBeCloseTo(7.19,6);
  const up=byId(checks,'wbracket-colstiff-upper'),low=byId(checks,'wbracket-colstiff-lower');
  const T=S.stiffUpperT;expect(T.value).toBeCloseTo(Math.abs(T.P!)/2+Math.abs(T.M!)/gauge,6);
  expect(up.demand).toBeCloseTo(Math.max(T.value,S.stiffUpperC.value),6);
  const C=S.stiffLowerC;expect(C.value).toBeCloseTo(Math.abs(C.P!)/2+Math.abs(C.M!)/gauge,6);
  expect(low.demand).toBeCloseTo(Math.max(C.value,S.stiffLowerT.value),6);
  expect(up.equation).toContain('R_{st}=\\frac{T}{2}\\pm\\frac{M_f}{g}');expect(up.note).toContain('no unstiffened column strength credited');
  // One plate in tension: J4.1 at the clipped contact, 0.90 Fy (b_s − c) t_s = 0.9(50)(6.0)(0.75) = 202.5 kip.
  expect(up.capacity!/kip).toBeCloseTo(.9*50*6*.75,1);
  // Welds on one plate (two throats) and the web shear along them carry the larger plate force.
  const R=Math.max(up.demand!,low.demand!);
  expect(byId(checks,'wbracket-colstiff-flange-weld').demand).toBeCloseTo(R/(2*g.s.flangeWeld/Math.SQRT2*g.contact),6);
  expect(byId(checks,'wbracket-colstiff-web-shear').demand).toBeCloseTo(R/(g.webLength*g.tw),6);
 });
 it('carries the whole force of each level on the welded twin-rib stiffeners as well: one plate takes the rib over it',()=>{
  const p=cappedTwinRibW14X90(true),c=createBracketCollector(p)!;
  c.observe('strength','offset',0,[{vertical:80000,offset:250,length:120}],-1,{longitudinal:0,bottom:6000,offset:250});
  c.observe('fatigue','bin',0,[{vertical:30000,offset:250,length:120}],0);c.observe('service','v',0,[{vertical:40000,offset:0}],-1);
  const checks=bracketChecks(p,c.result),S=c.result.strength;
  expect(byId(checks,'bracket-colstiff-upper').demand).toBeCloseTo(S.stiffUpperT.value/2,6);expect(byId(checks,'bracket-colstiff-lower').demand).toBeCloseTo(S.stiffLowerC.value/2,6);
  for(const id of ['seat-flange','seat-web','column-yield','column-crippling'])expect(byId(checks,'bracket-'+id).note,id).toMatch(/^Unstiffened J10\.\d, not governing/);
  expect(byId(checks,'bracket-column-flange').note).toMatch(/^Unstiffened flange local bending at the ribs, not governing/);
 });
});

describe('C2 · the W-stub column stiffeners in the report (one calculate)',()=>{
 const s=calculate(cappedStubW14X90(true)),html=compactReport(s,'');
 const plain=(h:string)=>h.replace(/<annotation[\s\S]*?<\/annotation>/g,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ');
 const text=plain(html),check=(id:string)=>byId(s.checks,id);
 it('passes, shows the force system, the decision and the unstiffened values for information',()=>{
  expect(s.errors).toEqual([]);
  // Open review items of the demonstration crane data aside, nothing fails.
  expect(s.checks.filter(c=>!['pass','not-applicable','excluded'].includes(c.status)&&!reviewOpenItem(c)).map(c=>c.id)).toEqual([]);
  expect(text).toMatch(/Each stub flange delivers an axial force \(T = M\/\(d − t f \) \+ N\/2 at the top/);expect(text).toMatch(/Unstiffened, the existing column would take each as one concentrated force/);
  expect(text).toMatch(/top, T = [\d.]+ kip with M f = [\d.]+ kip-ft: R u = T \+ 3M f \/b = /);
  expect(text).toMatch(/Column stiffeners required\. Unstiffened, .*web local yielding \(J10\.2\) is exceeded at (the top flange|both flange levels) \(D\/C 1\.\d\d/);
  expect(text).toMatch(/Half-depth stiffener pairs \(2 pairs PL/);expect(text).toMatch(/carry each flange's full force system with no credit for the unstiffened column/);
  expect(text).toMatch(/Worked: unstiffened J10 at the stub flanges \(basis for the stiffener decision\)/);
  expect(text).toMatch(/Column stiffeners 2 pairs PL 3\/4" × 6 3\/4", half depth, one pair at each stub flange; 7\/16" fillets/);
  // The J10 table: the same R_u at a level, stiffened, not governing.
  const top=check('wbracket-column-flange'),yt=check('wbracket-column-yield-top');expect(ru(top.note)).toBe(ru(yt.note));
  expect(text).toMatch(/Top flange J10\.1 flange local bending (\d+) kip [\d.]+ kip [\d.]+ (OK|Exceeded) Top flange J10\.2 web local yielding \1 kip/);
  // Worked examples: R_u = T + 3M_f/b with J10.1 and J10.3; the plate force T/2 + M_f/g; the panel with the net force.
  const tx=(v:number,q:string)=>`${q}:${v}`,j10=flangeJ10Worked(s,tx as never);
  expect(j10).toHaveLength(8);expect(j10[1]).toBe('R_u=T+\\frac{3M_f}{b}');expect(j10[3]).toContain('6.25F_{yf}t_f^2');expect(j10[5]).toBe('R_u=C+\\frac{3M_f}{b}');expect(j10[7]).toContain('J10.3');
  expect(workedSteps(s,check('wbracket-colstiff-upper'),tx as never)?.[0]).toMatch(/R_\{st\}=\\frac\{T\}\{2\}\+\\frac\{M_f\}\{g\}/);
  expect(workedSteps(s,check('wbracket-column-panel'),tx as never)?.[0]).toContain('\\max(T,\\ C)');
 });
});

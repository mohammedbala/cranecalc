import {describe,expect,it} from 'vitest';
import {demoFocus005,demoFocus005Before} from '../fixtures/demoFocus005';
import {sectionProperties} from '../../src/engine/section';
import {girderStrength} from '../../src/engine/aiscStrength';
import {cappedMechanics} from '../../src/engine/cappedMechanics';
import {cappedElasticProperties} from '../../src/engine/capChannel';
import {capAttachmentChecks} from '../../src/engine/capChecks';
import {openSection,type Wall,type WallNode} from '../../src/engine/openSection';
import {aiscShapeByName} from '../../src/data/aiscSections';
import {aiscChannelByName,loadCappedSection} from '../../src/data/aiscChannels';
import {categoryF,finiteLife,filletRootReduction,KSI} from '../../src/engine/fatigueConstants';
import {transverseFilletFatigue} from '../../src/engine/connectionStrength';
import {fatigueResistance} from '../../src/engine/aistChecks';
import {presentCheck} from '../../src/engine/checkPresentation';
import {projectSchema,type CalculationSnapshot,type CheckResult} from '../../src/engine/types';
import {startDetailedDesign} from '../../src/engine/detailTemplate';

const inch=25.4,kip=4448.2216152605,kipft=1355817.948;
const before=(id:string)=>demoFocus005Before().checks.find(c=>c.id===id)!;

// Lue & Ellifritt (1993), Table 1, Cw in in^6 (the twelve values kept in scripts/reviewCappedProperties.ts).
const table:[string,string,number][]=[['W36X150','C15X33.9',146275],['W33X141','C15X33.9',117627],['W24X84','C12X20.7',24215],['W33X118','C15X33.9',91050],['W30X116','C15X33.9',68520],['W24X68','C12X20.7',18386],['W21X68','C12X20.7',13753],['W21X62','C12X20.7',12272],['W30X99','C15X33.9',53937],['W27X94','C15X33.9',43840],['W27X84','C15X33.9',37518],['W24X84','C15X33.9',28050]];
/** The engine's thin-wall tree with the plates at their OUTSIDE faces: W bottom flange at y = 0, merged W top flange + cap web at y = d + tw,cap. */
function outsideFaceCw(wn:string,cn:string){
 const w=aiscShapeByName(wn)!,c=aiscChannelByName(cn)!,nodes:WallNode[]=[{x:0,y:0}],walls:Wall[]=[];
 const br=(from:number,x:number,y:number,t:number,part:Wall['part'])=>{const to=nodes.length;nodes.push({x,y});walls.push({from,to,t,part});return to;};
 for(const s of [-1,1])br(0,s*w.bf/2,0,w.tf,'beam');
 const top=w.d+c.tw,web=br(0,0,top,w.tw,'beam'),legX=(c.d-c.tf)/2;
 for(const s of [-1,1]){const o=br(web,s*w.bf/2,top,w.tf+c.tw,'beam'),k=br(o,s*legX,top,c.tw,'channel');br(k,s*legX,w.d+c.tw-c.bf,c.tf,'channel');}
 return openSection(nodes,walls).Cw;
}

describe('A6 · capped Cw against Lue & Ellifritt (1993) Table 1',()=>{
 it('median-line integration stays 7.09-10.89% below the table; the outside-face convention reproduces it',()=>{
  const p=demoFocus005();let worst=0;
  for(const [w,c,published] of table){
   const m=cappedMechanics(loadCappedSection(p.section,w,c))!,median=m.Cw/inch**6/published-1,outside=outsideFaceCw(w,c)/published-1;
   expect(median).toBeGreaterThan(-.1090);expect(median).toBeLessThan(-.0708);
   expect(outside).toBeGreaterThan(-.025);expect(outside).toBeLessThan(.005);
   // Through-thickness (thick-wall) warping of every plate, sum b^3 t^3 / 144, is negligible.
   const W=aiscShapeByName(w)!,C=aiscChannelByName(c)!,thick=(2*W.bf**3*W.tf**3+C.d**3*C.tw**3+2*C.bf**3*C.tf**3)/144;
   worst=Math.max(worst,thick/published);
  }
  expect(worst).toBeLessThan(5e-4);
 });
 it('keeps the integrated Cw of the fixture girder (median line, as the AISC W-shape catalogue Cw with h0 = d - tf)',()=>{
  const p=demoFocus005(),s=sectionProperties(p.section);
  expect(s.Cw/inch**6).toBeCloseTo(62400.76,1);
  const w=aiscShapeByName('W24X104')!;expect(Math.abs(w.tf*w.bf**3*(w.d-w.tf)**2/24/w.Cw-1)).toBeLessThan(.02);
 });
});

describe('D25 · Iyc/Iy of the capped section',()=>{
 it('is 535.07 / 663 = 0.807; the 0.897 printed before was the index (Iyc/Iy)/0.9',()=>{
  const p=demoFocus005(),c=cappedElasticProperties(p.section)!,s=sectionProperties(p.section);
  expect(c.topI/inch**4).toBeCloseTo(535.07,2);expect(s.Iy/inch**4).toBeCloseTo(663,6);
  expect(c.topI/s.Iy).toBeCloseTo(.807,3);expect(before('cap-proportion').utilization).toBeCloseTo(c.topI/s.Iy/.9,6);
 });
});

describe('C23 · web compactness of the singly symmetric capped section (Table B4.1b case 16)',()=>{
 const p=demoFocus005(),s=sectionProperties(p.section),g=girderStrength(p,s),[pos,neg]=g.capDirections!;
 it('classifies the web for positive moment (simple spans), as compact, and selects F4',()=>{
  expect(p.system).toBe('simple');
  expect(pos.lambda).toBeCloseTo(27.70,2);expect(pos.lambdaP).toBeCloseTo(5.70*Math.sqrt(p.section.E/p.section.Fy),6);
  expect(pos.web).toBe('compact');expect(pos.clause).toBe('F4');
  expect(g.webRatio).toBe(pos.lambda);expect(g.webLimit).toBe(pos.lambdaP);expect(g.compact).toBe(true);
  // Before: hc/tw = 58.70 (bottom flange in compression) against 3.76 sqrt(E/Fy) = 90.55.
  expect(before('compact-web').demand).toBeCloseTo(58.699,3);expect(before('compact-web').capacity).toBeCloseTo(90.553,3);
 });
 it('gives lambda_p = 45.1 (noncompact) for the bottom flange in compression, as the review computed',()=>{
  expect(neg.lambda).toBeCloseTo(58.70,2);expect(neg.lambdaP).toBeCloseTo(45.10,1);expect(neg.web).toBe('noncompact');expect(neg.clause).toBe('F4');
 });
 it('propagates to the flexural strength: F4 with Rpc / Rpt instead of F5',()=>{
  expect(before('major').capacity!/kipft).toBeCloseTo(1067.80,1);
  expect(g.major/kipft).toBeCloseTo(1238.71,1);
  expect(g.flexureBranch).toContain('F4');
 });
 it('evaluates both directions on a continuous runway and keeps the less favourable web class',()=>{
  const c={...p,system:'continuous' as const},gc=girderStrength(c,sectionProperties(c.section));
  expect(gc.webCase!.web).toBe('noncompact');expect(gc.webLimit).toBeCloseTo(gc.webCase!.lambdaR,9);expect(gc.compact).toBe(true); // F4 covers a noncompact web
 });
});

describe('D26 · fatigue constants in their AISC 360-16 US form',()=>{
 it('evaluates 1000 (Cf/n)^0.333, 100 (1.5/n)^0.167 >= 8 ksi and the US thresholds exactly',()=>{
  const n=400000;
  expect(finiteLife(4.4,n)/KSI).toBeCloseTo(1000*(4.4/n)**(1/3),10);expect(finiteLife(25,5e5)/KSI).toBeCloseTo(36.84,2); // Everett permit, p.24
  expect(categoryF(n)/KSI).toBeCloseTo(Math.max(8,100*(1.5/n)**.167),10);
  expect(categoryF(1e12)/KSI).toBeCloseTo(8,12);
  expect(fatigueResistance('C',1e12).FSR/KSI).toBeCloseTo(10,12);expect(fatigueResistance('E1',1e12).FSR/KSI).toBeCloseTo(2.6,12);
  expect(filletRootReduction(inch,.25*inch)).toBeCloseTo((.06+.72*.25)/1,12);
  expect(transverseFilletFatigue(.5*inch,inch,1e12).capacity/KSI).toBeCloseTo(10,12);
  // Before (SI forms): Category F capacity of the cap weld 85.647 MPa = 12.422 ksi; now 100(1.5/n)^0.167 ksi.
  expect(before('cap-weld-fatigue').capacity).toBeCloseTo(Math.max(55,690*(1.5/n)**.167),6);
 });
 it('prints the US equations in a US report: no 1000.7604 / 100.0760 / 7.9771 and no MPa',()=>{
  const c=(equation:string,note=''):CheckResult=>({id:'x',group:'Fatigue',title:'x',status:'pass',demand:1,capacity:2,utilization:.5,quantity:'stress',substitution:'',equation,note,referenceIds:[]});
  const a=presentCheck(c('\\Delta f_w\\le\\max[55,690(1.5/n)^{0.167}]\\,MPa'),'US').equation,b=presentCheck(c('F_{SR}=\\max[F_{TH},6900(C_f/n_{SR})^{0.333}]'),'US').equation;
  const d=presentCheck(c('F_{SR}=\\max\\left[55,\\,690\\left(\\frac{1.5}{n}\\right)^{0.167}\\right]\\;\\text{MPa}'),'US').equation;
  const r=presentCheck(c('R_{FIL}=\\min[1,(0.103+1.24w/t_p)/t_p^{0.167}];F=6900R_{FIL}(4.4/n)^{0.333}'),'US').equation;
  expect(a).toBe('\\Delta f_w\\le\\max[8,100(1.5/n)^{0.167}]\\,ksi');expect(b).toBe('F_{SR}=\\max[F_{TH},1000(C_f/n_{SR})^{0.333}]');
  expect(d).toContain('\\max\\left[8,\\,100');expect(d).toContain('\\text{ksi}');expect(r).toContain('0.06+0.72w/t_p');expect(r).toContain('1000R_{FIL}');
  for(const v of [a,b,d,r]){expect(v).not.toMatch(/1000\.76|100\.07|7\.97|MPa|6900|690\(/);}
 });
});

describe('C17 · cap end force development: cumulative welds against the channel force at each section',()=>{
 it('replaces the full channel yield force rule (0.97) by F(x) = Mu(x) Qc / Ix (+ axial share) <= 2 x r_w',()=>{
  const p=demoFocus005(),props=sectionProperties(p.section),m=cappedMechanics(p.section)!,d=p.capDesign!;
  // Factored envelope values of the reviewed calculation: shear 143.5 kN, moment 223.2 kN m, axial 44.5 kN.
  const Vu=before('shear').demand!,Mu=before('major').demand!,Nu=before('axial').demand!;
  const s={input:p,properties:props,checks:[],errors:[],warnings:[],analysis:null,eligible:false,revision:'t',createdAt:'',referenceVersion:'t',
   designAnalysis:{shear:Vu,moment:Mu},
   detailResults:{cap:{longitudinalFlow:0,fatigueFlows:d?[0]:[]},demands:{endLongitudinal:Nu,railVertical:0,railLateral:0},railFatigueBins:[{vertical:0,lateral:0}]}} as unknown as CalculationSnapshot;
  const c=capAttachmentChecks(s).find(v=>v.id==='cap-development')!;
  const Ac=aiscChannelByName('C15X50')!.A*inch**2,Fy=Math.min(p.section.Fy,d.Fy),Fu=Math.min(p.section.Fu,d.Fu),t=Math.min(p.section.tf,p.section.capTw);
  const rw=Math.min(.75*.6*d.Fexx*d.weldSize/Math.SQRT2,.6*Fy*t,.75*.6*Fu*t);
  const expected=(Vu*m.channelQ/m.elastic.Ix+Nu*Ac/m.elastic.A/d.developmentLength)/(2*rw);
  expect(c.utilization).toBeCloseTo(expected,6);expect(c.status).toBe('pass');
  expect(c.title).toBe('Cap end · cumulative weld force development');expect(c.note).toContain('UNVERIFIED');
  expect(before('cap-development').utilization).toBeCloseTo(.9705,4);expect(c.utilization!).toBeLessThan(.2);
 });
});

describe('C18 · rail twist limit is an owner / crane-supplier input with no default',()=>{
 it('the schema accepts no limit and a new detailed design adds none',()=>{
  const p=demoFocus005(),q=structuredClone(p);delete q.details!.criteria.twistLimit;
  expect(projectSchema.safeParse(q).success).toBe(true);
  // DEMO-FOCUS-005 states the 0.005 rad limit as an owner input (criteriaSource), so it is kept and checked.
  expect(p.details!.criteria.twistLimit).toBe(.005);expect(p.criteriaSource).toMatch(/owner criteria.*twist 0\.005 rad/i);
  const fresh=startDetailedDesign({...q,details:undefined});expect(fresh.details?.criteria.twistLimit).toBeUndefined();
 });
});

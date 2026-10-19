import type {CalculationSnapshot,CheckResult} from '../engine/types';
import type {Quantity} from '../engine/units';
import {activeStep} from '../engine/steppedColumnInputs';
import {upperShaftSection,fixedBaseRatio} from '../engine/steppedColumn';
import {existingColumnSection} from '../engine/existingColumn';
import {sectionProperties} from '../engine/section';
import {stepStiffenerHeight,upperFlangeArm} from '../engine/stepSeat';

/** The report's own helpers (compactReport), passed in so the pages read as the rest of the report. */
export interface SteppedReportHelpers {
 page:(title:string,body:string,figures?:string[])=>string;sec:(name:string,key?:string,...aliases:string[])=>string;ref:(key:string)=>string;
 table:(headers:string[],rows:(string|number)[][],cls?:string)=>string;f:(v:number|undefined,q?:Quantity)=>string;q3:(v:number|undefined,q?:Quantity)=>string;e:(v:unknown)=>string;
 math:(tex:string)=>string;tx4:(v:number,q:Quantity)=>string;basis:(text:string)=>string;
 worked:(all:CheckResult[],steps?:string[],also?:string[])=>string;numeric:(checks:CheckResult[])=>string;
}

/**
 * The stepped column pages of the calculation report (support 'stepped-column', steppedColumn.ts): the two-shaft model
 * and the effective lengths from its buckling analysis (AISC 360-16 Appendix 7 §7.2 Commentary, K from a buckling
 * analysis), H1 for the upper and lower shafts with their governing cases, and the step's local checks worked (J7, J10).
 * Clause mapping of the DG7 stepped-column detail is not verified (references 'dg7-columns', 'aisc-app7' partial).
 */
export function steppedColumnReportPages(s:CalculationSnapshot,h:SteppedReportHelpers):string[]{
 const p=s.input,c=p.existingColumn,st=activeStep(p),r=s.steppedColumn,z=s.existingColumn;
 if(!c||!st||!r||!z)return [];
 const {page,sec,ref,table,f,q3,e,math,tx4,basis,worked,numeric}=h,g=r.geometry;
 const group=s.checks.filter(v=>v.group==='Stepped column'),welds=s.checks.filter(v=>v.group==='Existing column');
 const shaftChecks=group.filter(v=>/^column-(upper|lower)-/.test(v.id)),stepChecks=group.filter(v=>v.id.startsWith('step-'));
 const other=group.filter(v=>!shaftChecks.includes(v)&&!stepChecks.includes(v));
 const E=p.section.E,EIu=E*sectionProperties(upperShaftSection(p).section).Ix,EIl=E*sectionProperties(existingColumnSection(p).section).Ix;
 const b=r.buckling,ratio=fixedBaseRatio(c.strong),Lu=c.height-c.seatElevation,Ll=c.seatElevation;
 const K=(L:number,seg:number)=>Number.isFinite(L)?(L/seg).toFixed(2):'∞';
 const pages:string[]=[];

 // 1: the model and the effective lengths.
 const loads=(['D','L','Lr','S','R','W','E'] as const);
 // L_c,i = π√(EI_i/(λ_cr P_i)) with the governing combination's numbers (EI in force × length², as the bimoment unit).
 const Lc=(sk:'upper'|'lower',EI:number,P:number,L:number)=>{const i=sk==='upper'?'u':'l';return Number.isFinite(L)&&P>0
  ?math(`L_{c,${i}}=\\pi\\sqrt{\\frac{EI_${i}}{\\lambda_{cr}\\,P_${i}}}=\\pi\\sqrt{\\frac{${tx4(EI,'bimoment')}}{${b.factor.toFixed(3)}\\times${tx4(P,'force')}}}=${tx4(L,'length')}\\quad(K=${K(L,sk==='upper'?Lu:Ll)})`)
  :`<p>The ${sk} shaft is not in compression in the governing combination: no effective length.</p>`;};
 pages.push(page(sec('Stepped column · model and effective lengths','column','stepped-column'),
  `<p>The girder bears on the step of the existing stepped building column, over the lower shaft's crane-side flange (no bracket); the top-flange tie lands on the upper shaft's inner flange. One column across the runway, the lower shaft from the base to the step and the upper shaft from the step to the top, with the stepped EI(x): the girder reaction R acts at the step at e from the lower centroid, the side thrust at the rail head. Existing effects: the lower shaft's added as magnitudes at its governing section; the upper shaft's at the step superposed with their sign on the crane moment for the gravity loads D, L, L<sub>r</sub>, S and R (positive bends the upper shaft as the crane reaction moment does), as magnitudes for W and E.</p>`
  +table(['Item','Value','Item','Value'],[
   ['Lower shaft (E)',e(r.lower.source),'Upper shaft (E)',e(r.upper.source)],
   ['Base to step (top of cap)',f(c.seatElevation),'Step to top',f(Lu)],
   ['Lower / upper depth',`${f(g.lower.d)} / ${f(g.upper.d)}`,'Upper centroid outboard',f(st.offset)],
   ['Girder web from lower C/L',f(g.girderWeb),'Reaction eccentricity e',`${f(z.eccentricity)} (far bearing edge)`],
   ['Step cap (E)',`${f(g.cap.thickness)} × ${f(g.cap.width)} × ${f(g.cap.length)}`,'Tie face to girder web',f(g.tieDistance)],
   ['Strong axis',`${c.strong.base} base, ${c.strong.top} top`,'Weak axis',`${c.weak.base} base, ${c.weak.top} top; L<sub>cy</sub> ${f(r.lower.Lcy)} lower, ${f(r.upper.Lcy)} upper`]],'data')
  +`<h3>Existing load effects, unfactored</h3>`+table(['Load','Upper P','Upper M<sub>x</sub> (signed)','Upper M<sub>y</sub>','Lower P','Lower M<sub>x</sub>','Lower M<sub>y</sub>'],loads.map(k=>[k,q3(st.existingUpper[k].P,'force'),q3(st.existingUpper[k].Mx,'moment'),q3(st.existingUpper[k].My,'moment'),q3(c.existing[k].P,'force'),q3(c.existing[k].Mx,'moment'),q3(c.existing[k].My,'moment')]),'data')
  +`<p>Sources: ${e(c.source)}; ${e(st.source)}.</p>`
  +`<h3>Effective lengths from the buckling analysis (AISC 360-16 Appendix 7)</h3>`
  +`<p>Elastic flexural buckling of the two-segment column across the runway under each combination's axial forces, P<sub>u</sub> in the upper shaft and P<sub>l</sub> = P<sub>u</sub> + R in the lower (det(K − λK<sub>g</sub>) = 0, cubic elements with the geometric stiffness, mesh refinement change ${(b.convergence*100).toFixed(4)}%). Each combination has its own λ<sub>cr</sub>, effective lengths and B<sub>1</sub> = 1/(1 − α/λ<sub>cr</sub>)${ratio>1?`; the lengths include the Commentary Table C-A-7.1 design ratio ${ratio.toFixed(3)} for a fixed base`:''}. Governing combination ${e(b.case)}: P<sub>u</sub> = ${q3(b.axial.upper,'force')}, P<sub>l</sub> = ${q3(b.axial.lower,'force')}, λ<sub>cr</sub> = ${b.factor.toFixed(3)}; EI<sub>u</sub> = ${q3(EIu,'bimoment')}, EI<sub>l</sub> = ${q3(EIl,'bimoment')}.</p>`
  +Lc('upper',EIu,b.axial.upper,b.Lcx.upper)+Lc('lower',EIl,b.axial.lower,b.Lcx.lower)
  +`<p>The column's entered L<sub>cx</sub> is not used. The buckling factor is verified against the closed-form characteristic equation of the stepped cantilever; no published DG7 stepped-column example has been reconciled (an item for the engineer of record's review).</p>`
  +numeric(other.filter(v=>v.id==='column-buckling-basis'||v.id==='column-basis')),['Stepped column']));

 // 2: H1 for each shaft with its governing case.
 const row=(sk:'upper'|'lower')=>{const x=r[sk],u=x.governing.U,cap=x.capacity;return [sk==='upper'?'Upper shaft':'Lower shaft',e(u.id),q3(u.P,'force'),q3(u.Mx,'moment'),q3(u.My,'moment'),u.B1x.toFixed(2),f(x.Lcx),q3(cap.Pc,'force'),q3(cap.Mcx,'moment'),q3(cap.Mcy,'moment'),u.U.toFixed(2)];};
 const sp=z.support,braced=!c.frame;
 pages.push(page(sec('Stepped column · upper and lower shafts (H1)','column-shafts'),
  basis(`ASCE 7-16 ${p.method} combinations with the crane loads as live load L, W and E both ways, and the AIST TR-13 §3.10 supporting-structure forms (C<sub>d</sub> at the dead-load factor), each with its own buckling analysis; crane reactions by load type (section ${ref('reactions')}).`)
  +`<h3>Column and step combinations</h3>`+table(['ID','Factored combination (crane loads as L)'],[...new Map(z.combinations.map(k=>[k.id,k.equation])).entries()].map(([id,eq])=>[e(id),e(eq)]),'data')
  +`<p>Each crane-load row is evaluated as the impact case (no side thrust) and the side-thrust case (no impact) unless the project combines them in full: the suffix names the variant. W and E act in either direction; the same rows give the step actions (section ${ref('step')}).</p>`
  +table(['Shaft','Governing combination','P<sub>r</sub>','M<sub>rx</sub>','M<sub>ry</sub>','B<sub>1x</sub>','L<sub>cx</sub>','P<sub>c</sub>','M<sub>cx</sub>','M<sub>cy</sub>','H1'],[row('upper'),row('lower')],'data')
  +`<p>H1-1a / H1-1b with the capacities of the governing row (P<sub>c</sub> at its own L<sub>cx</sub>; the axial check takes the combination with the largest P<sub>r</sub>/P<sub>c</sub>: upper ${e(r.upper.axial?.case??'—')}, lower ${e(r.lower.axial?.case??'—')}). The upper shaft carries its existing axial force only; the lower shaft the existing force plus the girder reaction.</p>`
  +`<p class="notice"><b>Conditional result.</b> The shaft checks hold with these restraints, assumed here and confirmed by the building engineer of record (section ${ref('by-others')}): (1) ${c.strong.top==='braced'?`the column top braced across the runway (${c.strong.base} base, braced top), the roof bracing or diaphragm taking the crane's share of the top reaction, ${q3(r.topRestraint?.factored,'force')} factored (${q3(r.topRestraint?.service,'force')} unfactored) per grid`:`the column as entered across the runway (${c.strong.base} base, ${c.strong.top} top)`}; (2) ${braced?'a braced (non-sway) frame, B1 only (frame type not given)':c.frame?.type==='sway'?`the sway frame with B2 = ${c.frame.B2??'—'}`:'the braced frame entered'}; (3) weak-axis bracing at L<sub>cy</sub> = ${f(r.lower.Lcy)} (lower) and ${f(r.upper.Lcy)} (upper); (4) ${sp?.exit==='girder-strut'?'a crane-level strut on the girder line at each locating column':sp?.exit==='column-strut'?'a crane-level strut at the column centerline':'the eave strut at the column top'} for the longitudinal force. Drift (AIST TR-13 §5.3): limit ${f(z.drift.limit)}, displacement ${f(z.drift.value)} at the rail head.</p>`
  +worked(shaftChecks,[],['column-upper-interaction','column-lower-interaction'])+numeric([...shaftChecks,...other.filter(v=>v.id!=='column-buckling-basis'&&v.id!=='column-basis')]),['Stepped column']));

 // 3: the step's local checks.
 const sf=g.stiffener,stepTex=[
  `F_{in}=\\frac{P_u}{2}+\\frac{|M_u|}{d_u-t_{fu}}=${tx4(r.step.flangeForce,'force')}\\quad(d_u-t_{fu}=${tx4(upperFlangeArm(g),'length')})`,
  `V_{panel}=F_{in}\\frac{\\max(a,b)}{s}=${tx4(r.step.panelShear,'force')}`];
 pages.push(page(sec('Stepped column · step local checks','step'),
  `<p>At the step: the girder reaction on the existing step cap over the lower crane-side flange (J7 bearing, the flange end as J10.2/J10.3 with the cap as its flange, the cap cantilever in flexure), and the upper shaft's inner flange force on the lower web (J10.2, J10.3, the web panel between the lower flanges as the step's deep beam, J10.6)${sf?`, carried by a new step stiffener pair, 2 PL ${f(sf.thickness)} × ${f(sf.width)} × ${f(stepStiffenerHeight(g))}, fitted to the cap and field welded to the existing web (J10.8)`:''}. Largest factored reaction on the step R = ${q3(r.step.reaction,'force')}; inner-flange force ${q3(r.step.flangeForce,'force')} (${e(r.step.case)}); stiffener ${r.step.stiffenerRequired?'required by J10.2/J10.3':'not required by J10.2/J10.3'}${sf&&!r.step.stiffenerRequired?' (provided)':''}. The cap-as-flange and deep-beam analogies are mechanics models of the DG7 step detail; their clause mapping is not verified.</p>`
  +stepTex.map(math).join('')
  +worked(stepChecks,[],['step-bearing','step-cap-flexure','step-web-yielding','step-panel-shear','step-stiffener-column'])+numeric([...stepChecks,...welds]),['Stepped column']));
 return pages;
}

import {cappedMechanics} from '../engine/cappedMechanics';
import katex from 'katex';
import {cappedElasticProperties,cappedTorsionResearch} from '../engine/capChannel';
import type {ProjectInput} from '../engine/types';
import {format,formatSectionMass,type Quantity} from '../engine/units';
import {ref} from '../engine/references';
export default function CapChannelAssessment({project}:{project:ProjectInput}){
 const s=cappedElasticProperties(project.section);if(!s)return null;
 const m=cappedMechanics(project.section)!,research=cappedTorsionResearch(project.section),fmt=(v:number,q:Quantity)=>format(v,q,project.units,4);
 return <details className="design-combinations"><summary>Capped section · design properties</summary>
  <p>Tabulated AISC component properties, rotated channel, and the parallel-axis theorem. Full composite action is assumed; cap weld capacity is separate.</p>
  <p dangerouslySetInnerHTML={{__html:katex.renderToString('\\bar y=\\frac{A_wy_w+A_cy_c}{A_w+A_c},\\quad I_x=I_{x,w}+I_{y,c}+\\sum A_i(y_i-\\bar y)^2,\\quad I_y=I_{y,w}+I_{x,c}',{throwOnError:false})}}/>
  <div className="property-list">{([
   ['Area',s.A,'area'],['Centroid above bottom',s.cy,'length'],['Vertical bending Ix',s.Ix,'inertia'],['Whole-section lateral Iy',s.Iy,'inertia'],['Top flange + cap lateral It',s.topI,'inertia'],['Bottom elastic modulus',s.Sbottom,'modulus'],['Top elastic modulus',s.Stop,'modulus'],['Shear center above bottom',m.shearCenter,'length'],['Design J · component sum',m.J,'inertia'],['Integrated Cw',m.Cw,'warping']
  ] as [string,number,Quantity][]).map(([label,v,q])=><div key={label}><span>{label}</span><strong>{fmt(v,q)}</strong></div>)}</div>
  <p>Nominal beam + channel mass: {formatSectionMass(s.nominalWeight,project.units)}. Reference: AISC Design Guide 7 (third edition) §14.1 and Appendix Table A-1. <a href={ref('cap-channel-study').url} target="_blank" rel="noreferrer">Published cap-channel study</a>.</p>
  <details><summary>Published torsion estimates · research only</summary>{research?<><p>Ellifritt &amp; Lue (1998), Eqs. 11, 12 and 15. Area ratio {research.areaRatio.toFixed(3)} is within the published 0.20–0.95 range. Study scope: CMAA crane classes A–C, distinct from AIST building classes.</p><p>Estimated Cw: {fmt(research.Cw,'warping')} · estimated J: {fmt(research.J,'inertia')}.</p><p>These estimates are not used in the design resistance checks. They do not supply the shear-center position, warping stress recovery or attachment fatigue model. The paper also has inconsistent definitions in its repeated monosymmetry equation.</p></>:<p>The component area ratio is outside the published research range. No extrapolation is used.</p>}</details>
  <p><strong>Design method:</strong> conservative AISC F5 for both bending signs; separate top and bottom lateral resistance; E4/E7 compression; shear-center-based torsion and warping; continuous cap-weld strength, development and fatigue. Full contact is required. CMAA E/F, intermittent welds, partial caps and perforated top elements remain outside this model.</p>
  <details><summary>Model verification and published differences</summary><p>Closed-form mechanics checks verify the implemented median-line idealization. Twelve comparisons with the <a href="https://ej.aisc.org/index.php/engj/article/view/604" target="_blank" rel="noreferrer">1993 published Cw table</a> give values 7.09–10.89% lower; the exact cause remains unresolved. No fitted multiplier is used. Lower Cw alone does not establish conservative stresses; review this model difference for the project.</p></details>
 </details>;
}

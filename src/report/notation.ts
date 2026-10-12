import {inlineMath} from './reportParts';

/**
 * Notation: the principal symbols of the report's equations, with their meaning and source (AISC 360-16 symbols
 * unless noted). A symbol is listed only when it appears in this report's equations; quantities local to one check
 * are defined in that check's note. Matching is on the LaTeX of the equations as printed.
 */
type Entry=[tex:string,meaning:string];
const groups:[string,Entry[]][]=[
 ['Loads, actions and analysis',[
  ['P','Concentrated force; wheel load'],['P_u','Required axial or concentrated strength, LRFD'],['P_r','Required axial strength'],['P_c','Available axial strength'],['P_n','Nominal axial strength'],['P_y','Axial yield strength, F<sub>y</sub>A<sub>g</sub>'],
  ['P_{static}','Maximum static wheel load (no impact)'],['P_{wheel,max}','Maximum wheel load from the supplier schedule'],['P_{empty}','Wheel load of the unloaded crane'],['P_{driving,max}','Total maximum load on the driven wheels'],
  ['H','Lateral (side-thrust) force'],['H_{runway}','Side thrust assigned to one runway'],['T','Tension force; torque'],['T_u','Required tensile strength'],['T_b','Minimum bolt pretension, RCSC Table 8.1 / AISC Table J3.1'],
  ['V','Shear force'],['V_u','Required shear strength'],['V_n','Nominal shear strength'],['M','Bending moment'],['M_x','Major-axis bending moment'],['M_y','Minor-axis bending moment'],['M_z','Torque about the member axis'],
  ['M_r','Required flexural strength'],['M_{rx}','Required major-axis flexural strength'],['M_{ry}','Required minor-axis flexural strength'],['M_c','Available flexural strength'],['M_{cx}','Available major-axis flexural strength'],['M_{cy}','Available minor-axis flexural strength'],['M_n','Nominal flexural strength'],['M_{cr}','Elastic lateral-torsional buckling moment'],['M_f','Flange lateral bending moment from torsion (DG7)'],
  ['R_u','Required strength (LRFD); support reaction'],['R_n','Nominal strength'],['R_a','Required strength (ASD)'],
  ['C_v','Vertical crane load (TR-13)'],['C_{vm}','Vertical crane load, maximum wheel loads'],['C_{ss}','Crane side thrust'],['C_{ls}','Crane longitudinal (tractive) force'],['C_{bs}','Crane bumper (stop) force'],['C_i','Vertical impact'],['C_d','Crane dead load'],['C_{dm}','Crane dead load, maximum'],['C_{ds}','Crane dead load in the stop combination'],
  ['\\gamma_i','Load factor of load i'],['\\alpha','ASD/LRFD force level adjustment factor; coefficient'],['B_1','Moment amplification for P-δ effects, AISC Appendix 8'],['\\epsilon','Convergence or equilibrium residual of the analysis'],
  ['\\delta','Displacement; deflection'],['\\Delta','Displacement; range (of stress or force)'],['\\theta','Rotation; angle of twist'],['\\theta_{rail}','Rotation of the rail head about the girder axis'],['\\theta_{owner}','Rotation limit set by the owner or crane supplier']]],
 ['Geometry',[
  ['L','Length; span'],['L_b','Laterally unbraced length'],['L_{bay}','Bay (span) length'],['L_c','Effective length; clear distance in the direction of force (bolts)'],['L_w','Weld length'],['L_{dev}','Cap-to-girder weld development length'],['L_{bearing}','Bearing plate length along the girder'],
  ['d','Depth of section'],['d_b','Nominal bolt diameter'],['d_h','Nominal hole diameter'],['b','Width'],['b_f','Flange width'],['b_{cap}','Width of the cap channel (its depth d)'],['b_s','Stiffener width'],
  ['t','Thickness'],['t_f','Flange thickness'],['t_w','Web thickness'],['t_p','Plate thickness'],['t_s','Stiffener thickness'],['t_{min}','Minimum required thickness'],
  ['h','Clear web depth; height'],['h_0','Distance between flange centroids'],['h_{rail}','Height of the rail head above the top flange'],['e','Eccentricity; edge distance'],['e_{min}','Minimum edge distance, AISC Table J3.4'],['g','Bolt gauge (transverse spacing)'],['s','Bolt pitch (spacing along the force)'],['p','Pitch; tributary width (prying)'],
  ['l_b','Bearing length (AISC J10.2, J10.3)'],['l_c','Clear distance between holes or to the edge'],['k','Distance from outer face of flange to web toe of fillet; stiffness where defined in the check'],['k_1','Distance from web centerline to flange toe of fillet'],['x','Distance along the girder from the left support'],['y','Distance from the neutral axis; transverse coordinate'],['w','Fillet weld leg size'],['w_{min,J2.4}','Minimum fillet weld size, AISC Table J2.4']]],
 ['Section properties',[
  ['A','Cross-sectional area'],['A_g','Gross area'],['A_n','Net area'],['A_e','Effective net area'],['A_b','Nominal unthreaded body area of a bolt'],['A_w','Area of web or weld'],['A_c','Area of the cap channel'],
  ['I','Moment of inertia'],['I_x','Moment of inertia about the major axis'],['I_y','Moment of inertia about the minor axis'],['I_{yc}','Minor-axis moment of inertia of the compression flange (with the cap)'],
  ['S','Elastic section modulus'],['S_{xc}','Elastic section modulus to the compression flange'],['S_{x,min}','Least elastic section modulus about the major axis'],['S_y','Elastic section modulus about the minor axis'],['Z','Plastic section modulus'],
  ['J','Saint-Venant torsional constant'],['C_w','Warping constant'],['\\omega_{max}','Largest normalized warping function (sectorial coordinate) of the section'],['r','Radius of gyration'],['Q','First moment of area; reduction factor for slender elements'],
  ['\\lambda','Width-to-thickness ratio'],['\\lambda_f','Flange width-to-thickness ratio'],['\\lambda_w','Web width-to-thickness ratio'],['\\lambda_r','Limiting width-to-thickness ratio, noncompact/slender, Table B4.1b']]],
 ['Materials',[
  ['E','Modulus of elasticity of steel, 29,000 ksi'],['G','Shear modulus of steel, 11,200 ksi'],['F_y','Specified minimum yield stress'],['F_u','Specified minimum tensile strength'],['F_{yf}','Yield stress of the flange'],['F_{EXX}','Filler metal classification strength'],
  ['F_{nt}','Nominal tensile stress of a bolt, AISC Table J3.2'],['F_{nv}','Nominal shear stress of a bolt, AISC Table J3.2'],['F_{cr}','Critical stress'],['F_e','Elastic buckling stress'],['\\mu','Mean slip coefficient (Class B, 0.50); friction coefficient'],['\\rho','Density of steel; ratio as defined in the check']]],
 ['Resistance',[
  ['\\phi','Resistance factor, LRFD'],['\\Omega','Safety factor, ASD'],['\\phi_v','Resistance factor for shear'],['R_{pg}','Bending strength reduction factor, slender web'],['R_{pc}','Web plastification factor (compression flange)'],['R_{pt}','Web plastification factor (tension flange)'],['C_1','Coefficient'],['C_{v1}','Web shear strength coefficient, AISC G2.1'],['k_v','Web plate shear buckling coefficient'],['U','Shear lag factor'],['Y_t','Hole reduction coefficient, AISC F13.1'],['D_u','Ratio of mean installed to specified minimum pretension, 1.13'],['h_f','Factor for fillers'],['k_{sc}','Slip-critical combined tension and shear coefficient']]],
 ['Fatigue (AISC 360-16 Appendix 3)',[
  ['f_{max}','Largest live-load stress'],['f_{min}','Smallest live-load stress'],['\\Delta f','Live-load stress range'],['f_i','Stress range of duty bin i'],['n_i','Number of cycles of duty bin i'],['N_i','Cycles to failure at the stress range of bin i (Eq. A-3-1)'],['n_{total}','Total number of stress-range cycles'],['n_{SR}','Number of stress-range fluctuations in the design life'],
  ['D','Miner damage sum, Σ n<sub>i</sub>/N<sub>i</sub>'],['C_f','Constant from Table A-3.1 for the fatigue category'],['F_{SR}','Allowable stress range'],['F_{TH}','Threshold allowable stress range, Table A-3.1'],['R_{FIL}','Reduction factor for fillet-welded transverse joints, Eq. A-3-7'],['f_{peak}','Largest elastic stress under the fatigue loads (≤ 0.66F<sub>y</sub>)']]],
 ['Crane and runway (AIST TR-13, DG7)',[
  ['N_{building}','Building classification cycles, TR-13 Table 1.1'],['n_{AIST}','AIST span-to-deflection ratio'],['n_{CMAA}','Span-to-deflection ratio for the CMAA crane class'],['n_{owner}','Span-to-deflection ratio set by the owner'],['\\delta_{v,single,static}','Vertical deflection under one crane, static wheel loads'],['C_{supplied}','Supplied crane load'],['F_{bumper,manufacturer}','Bumper force given by the crane manufacturer'],['s_{clips}','Rail clip spacing'],['\\eta','Bumper energy-absorption efficiency'],['\\Delta_{rail}','Change in rail gauge']]],
];
const symbolsIn=(tex:string)=>{
 const out=new Set<string>();
 for(const m of tex.matchAll(/(\\(?:alpha|beta|gamma|delta|Delta|epsilon|eta|theta|kappa|lambda|mu|nu|rho|sigma|tau|phi|Phi|psi|omega|Omega|xi|zeta)|(?<![\\a-zA-Z])[A-Za-z])(_\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|_[A-Za-z0-9])?/g))out.add(m[0].replace(/_([A-Za-z0-9])$/,'_{$1}'));
 // A range Δf counts as the symbol \Delta f.
 if(/\\Delta\s*f\b/.test(tex))out.add('\\Delta f');
 return out;
};
const norm=(t:string)=>t.replace(/_([A-Za-z0-9])$/,'_{$1}');
/** Notation table for the symbols that appear in the given equations. */
export function notationSection(equations:string[]){
 const used=new Set<string>();for(const e of equations)for(const v of symbolsIn(e))used.add(v);
 const rows=groups.map(([g,list])=>[g,list.filter(([t])=>used.has(norm(t)))] as const).filter(([,l])=>l.length);
 const total=rows.reduce((n,[,l])=>n+l.length,0);
 return `<p>Symbols follow AISC 360-16 (Symbols) and AISC Design Guide 7 unless noted; crane load symbols follow AIST Technical Report 13. ${total} principal symbols of this report are listed. Quantities used in a single check (local dimensions, intermediate values) are defined in that check's note. Subscripts: <i>u</i> required (LRFD), <i>a</i> required (ASD), <i>n</i> nominal, <i>c</i> available (φR<sub>n</sub> or R<sub>n</sub>/Ω), <i>x</i>/<i>y</i> major/minor axis, <i>f</i> flange, <i>w</i> web or weld, <i>b</i> bolt, <i>p</i> plate, <i>s</i> stiffener. Units are those printed with each value; the calculation runs in SI internally and every printed value is converted.</p>`
  +`<table class="notation"><colgroup><col style="width:16%"/><col style="width:34%"/><col style="width:16%"/><col style="width:34%"/></colgroup><tbody>${rows.map(([g,l])=>{
   const half=Math.ceil(l.length/2),cells=Array.from({length:half},(_,i)=>[l[i],l[i+half]]);
   return `<tr class="group"><th colspan="4">${g}</th></tr>`+cells.map(([a,b])=>`<tr><td>${inlineMath(a[0])}</td><td>${a[1]}</td><td>${b?inlineMath(b[0]):''}</td><td>${b?b[1]:''}</td></tr>`).join('');
  }).join('')}</tbody></table>`;
}
export const notationCss=`table.notation{font-size:8.5px}table.notation td{padding:1.5px 4px;vertical-align:top}table.notation tr.group th{background:#e8e8e8;text-align:left;font-size:9px}`;

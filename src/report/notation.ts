import {inlineMath} from './reportParts';

/**
 * Notation, kept brief: the crane-girder symbols of the report's equations (crane loads, capped section and torsion,
 * rail, serviceability criteria, fatigue). Standard AISC symbols (F_y, E, A, φ …) are not listed. A symbol is listed only when it appears in this report's equations; quantities local to one check
 * are defined in that check's note. Matching is on the LaTeX of the equations as printed.
 */
type Entry=[tex:string,meaning:string];
const groups:[string,Entry[]][]=[
 ['Crane loads (AIST TR-13)',[
  ['P_{static}','Maximum static wheel load, no impact'],['P_{wheel,max}','Maximum wheel load from the supplier schedule'],['P_{empty}','Wheel load of the unloaded crane'],['P_{driving,max}','Total maximum load on the driven wheels'],
  ['C_{vm}','Vertical crane load, maximum wheel loads'],['C_i','Vertical impact'],['C_{ss}','Crane side thrust'],['H_{runway}','Side thrust assigned to one runway'],['C_{ls}','Crane longitudinal (tractive) force'],['C_{bs}','Crane bumper (stop) force'],['F_{bumper,manufacturer}','Bumper force given by the crane manufacturer'],['\\eta','Bumper energy-absorption efficiency'],
  ['C_d','Crane dead load'],['C_{dm}','Crane dead load, maximum'],['C_{ds}','Crane dead load in the stop combination']]],
 ['Capped girder, torsion and rail',[
  ['b_{cap}','Width of the cap channel (its depth d)'],['A_c','Area of the cap channel'],['I_{yc}','Minor-axis moment of inertia of the compression flange with the cap'],['L_{dev}','Cap-to-girder weld development length'],
  ['C_w','Warping constant'],['\\omega_{max}','Largest normalized warping function of the section'],['M_f','Flange lateral bending moment from torsion (DG7)'],
  ['h_{rail}','Height of the rail head above the top flange'],['l_b','Wheel bearing length on the web (AISC J10.2, J10.3; TR-13 §5.8.6)'],['\\theta_{rail}','Rotation of the rail head about the girder axis'],['\\theta_{owner}','Rotation limit set by the owner or crane supplier'],['s_{clips}','Rail clip spacing'],['\\Delta_{rail}','Change in rail gauge']]],
 ['Serviceability and classification',[
  ['N_{building}','Building classification cycles, TR-13 Table 1.1'],['\\delta_{v,single,static}','Vertical deflection under one crane, static wheel loads'],['n_{AIST}','AIST span-to-deflection ratio'],['n_{CMAA}','Span-to-deflection ratio for the CMAA crane class'],['n_{owner}','Span-to-deflection ratio set by the owner']]],
 ['Fatigue (AISC 360-16 Appendix 3)',[
  ['\\Delta f','Live-load stress range'],['f_{max}','Largest live-load stress'],['f_{min}','Smallest live-load stress'],['f_i','Stress range of duty bin i'],['n_i','Number of cycles of duty bin i'],['N_i','Cycles to failure at the stress range of bin i (Eq. A-3-1)'],['n_{total}','Total number of stress-range cycles'],['n_{SR}','Number of stress-range fluctuations in the design life'],
  ['D','Miner damage sum, Σ n<sub>i</sub>/N<sub>i</sub>'],['C_f','Constant from Table A-3.1 for the fatigue category'],['F_{SR}','Allowable stress range'],['F_{TH}','Threshold allowable stress range, Table A-3.1'],['R_{FIL}','Reduction factor for fillet-welded transverse joints, Eq. A-3-7'],['f_{peak}','Largest elastic stress under the fatigue loads (≤ 0.66F<sub>y</sub>)']]],
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
 return `<p>Symbols specific to crane runway girders and to this calculation (${total}); other symbols are the standard AISC 360-16 notation, and quantities local to one check are defined in its note. Subscripts: <i>u</i> required (LRFD), <i>n</i> nominal, <i>c</i> available.</p>`
  +`<table class="notation"><colgroup><col style="width:16%"/><col style="width:34%"/><col style="width:16%"/><col style="width:34%"/></colgroup><tbody>${rows.map(([g,l])=>{
   const half=Math.ceil(l.length/2),cells=Array.from({length:half},(_,i)=>[l[i],l[i+half]]);
   return `<tr class="group"><th colspan="4">${g}</th></tr>`+cells.map(([a,b])=>`<tr><td>${inlineMath(a[0])}</td><td>${a[1]}</td><td>${b?inlineMath(b[0]):''}</td><td>${b?b[1]:''}</td></tr>`).join('');
  }).join('')}</tbody></table>`;
}
export const notationCss=`table.notation{font-size:8.5px}table.notation td{padding:1.5px 4px;vertical-align:top}table.notation tr.group th{background:#e8e8e8;text-align:left;font-size:9px}`;

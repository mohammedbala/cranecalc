import {inlineMath} from './reportParts';

/**
 * Notation, kept brief: the crane-girder symbols of the report's equations (crane loads per AIST TR-13 and AISC DG7,
 * the capped section, the rail, serviceability and the fatigue duty bins). Standard symbols of AISC 360-16, the AISC
 * Manual and AISC DG9 (F_y, φ, R_n, F_SR, C_f, l_b, C_1, W_no, S_w …) are not listed. A symbol is listed only when it appears in this
 * report's equations; quantities local to one check are defined in that check's note.
 */
type Entry=[tex:string,meaning:string];
export const notationGroups:[string,Entry[]][]=[
 ['Crane loads (AIST TR-13, AISC DG7)',[
  ['P_{max}','Maximum static wheel load from the supplier schedule, without impact'],['P_{min}','Minimum wheel load on the opposite runway'],
  ['P_d','Maximum load on the driven wheels'],['Q','Rated capacity'],['T','Trolley weight'],['B','Bridge weight'],['W','Whole crane, B + T + Q'],['W_h','Weight below the hook'],
  ['C_d','Crane dead load: wheel loads of the empty crane (C<sub>dm</sub> multiple cranes, C<sub>ds</sub> single crane)'],
  ['C_v','Vertical crane load from the lifted load (C<sub>vm</sub> multiple cranes, C<sub>vs</sub> single crane, C<sub>vs,min</sub> least lifted load)'],
  ['C_i','Vertical impact, I·P<sub>max</sub>'],['I','Vertical impact factor'],['C_{ss}','Side thrust on one runway (ΣC<sub>ss</sub>: whole crane)'],
  ['C_{ls}','Longitudinal (tractive) force'],['C_{bs}','Bumper (crane stop) force'],['W_E','Bridge and trolley weight effective in the bumper'],['\\eta','Bumper efficiency']]],
 ['Capped girder, flange bending and rail',[
  ['A_c','Area of the cap channel'],['Q_c','First moment of the cap channel about the neutral axis'],['t_{wc}','Web thickness of the cap channel'],
  ['a^{\\prime}','Terminal development length of the cap welds (as F13.3)'],['r_w','Available strength of one cap weld per unit length'],['q_w','Shear flow on one cap weld'],
  ['h_r','Rail height'],['M_f','Flange lateral bending moment (side thrust and torsion)'],['M_{cf}','Available flexural strength of one flange about its own axis'],['S_f','Elastic section modulus of one flange about its own axis'],
  ['f_{un}','Total normal stress, factored loads, including warping'],['f_{uv}','Total shear stress, factored loads, including torsion'],
  ['\\Delta_r','Lateral movement of the rail head'],['\\Delta_o','Lateral deflection at the shear center']]],
 ['Serviceability and fit',[
  ['\\Delta_v','Vertical deflection, one crane, static wheel loads'],['\\Delta_h','Lateral deflection of the top flange, one crane'],['t_{set}','Setting tolerance (TR-13 §5.18)']]],
 ['Fatigue (unfactored duty-bin loads)',[
  ['f_{max}','Largest stress under the unfactored fatigue loads'],['f_{min}','Smallest stress under the unfactored fatigue loads'],
  ['f_{sr,i}','Stress range of duty bin i; F<sub>SR,i</sub> is the allowable range at its n<sub>i</sub> cycles'],
  ['f_{sr,eq}','Equivalent constant-amplitude stress range of the duty bins at n<sub>SR</sub> = Σn<sub>i</sub> cycles (Miner’s rule): its ratio to F<sub>SR</sub> at n<sub>SR</sub> is the fatigue D/C; Σn<sub>i</sub>/N<sub>i</sub> = (f<sub>sr,eq</sub>/F<sub>SR</sub>)<sup>3</sup> is given for information']]]
];
const greek='alpha|beta|gamma|delta|Delta|epsilon|varepsilon|eta|theta|Theta|kappa|lambda|mu|nu|rho|sigma|tau|phi|Phi|psi|omega|Omega|xi|zeta';
const operators='frac|tfrac|dfrac|sqrt|left|right|bigl|bigr|big|Big|max|min|le|ge|leq|geq|quad|qquad|times|cdot|sum|Sigma|tan|arctan|cos|sin|tanh|int|det|ldots|dots|notin|Rightarrow|begin|end|cases|aligned|circ|pm|mp|in|textstyle|displaystyle|mathbf|boldsymbol';
/**
 * The symbols of an equation as written (letter or Greek symbol, primes, subscript), e.g. F_{SR}, \sigma_w, a^{\prime}.
 * Text, units and operators are left out. A one-character subscript is normalized to braces (C_d → C_{d}).
 */
export function equationSymbols(tex:string){
 const s=tex.replace(/\\(?:text|mathrm|textrm|operatorname)\{[^{}]*\}/g,' ')
  .replace(/\^\{\\prime\\prime\\prime\}/g,"'''").replace(/\^\{\\prime\\prime\}/g,"''").replace(/\^\{?\\prime\}?/g,"'")
  .replace(new RegExp(`\\\\(?:${operators})(?![a-zA-Z])(?:_\\{[^{}]*\\}|_[A-Za-z0-9])?`,'g'),' ')
  .replace(/\\,(?:in|ft|kip|kN|mm|ksi|MPa|tons)\b/g,' ');
 const out=new Set<string>();
 // Each letter is its own symbol (F_yt_w is F_y and t_w); other control words are skipped with their subscripts.
 const re=new RegExp(`(\\\\(?:${greek})(?![a-zA-Z])|\\\\[a-zA-Z]+|[A-Za-z])('*)(_\\{[^{}]*(?:\\{[^{}]*\\}[^{}]*)*\\}|_\\\\[a-zA-Z]+|_[A-Za-z0-9])?`,'g'),isGreek=new RegExp(`^\\\\(?:${greek})$`);
 for(const m of s.matchAll(re)){
  if(m[1].startsWith('\\')&&!isGreek.test(m[1]))continue;
  const sub=m[3]?m[3].replace(/^_\{?/,'').replace(/\}$/,''):'';
  out.add(`${m[1]}${m[2]}${sub?`_{${sub}}`:''}`);
 }
 return out;
}
/** The one symbol a notation entry defines, normalized as equationSymbols writes it. */
export const entrySymbol=(tex:string)=>[...equationSymbols(tex)][0]??tex;
/** Notation table for the symbols that appear in the given equations. */
export function notationSection(equations:string[]){
 const used=new Set<string>();for(const e of equations)for(const v of equationSymbols(e))used.add(v);
 const rows=notationGroups.map(([g,list])=>[g,list.filter(([t])=>used.has(entrySymbol(t)))] as const).filter(([,l])=>l.length);
 const total=rows.reduce((n,[,l])=>n+l.length,0);
 return `<p>Symbols specific to crane runway girders and to this calculation (${total}). Other symbols have their AISC 360-16, AISC Manual and AISC Design Guide 9 meanings (torsion: θ, W<sub>no</sub>, S<sub>w</sub>, σ<sub>ws</sub>, τ<sub>t</sub>, τ<sub>ws</sub>); a symbol local to one check is defined under its equation.</p>`
  +`<table class="notation"><colgroup><col style="width:12%"/><col style="width:38%"/><col style="width:12%"/><col style="width:38%"/></colgroup><tbody>${rows.map(([g,l])=>{
   const half=Math.ceil(l.length/2),cells=Array.from({length:half},(_,i)=>[l[i],l[i+half]]);
   return `<tr class="group"><th colspan="4">${g}</th></tr>`+cells.map(([a,b])=>`<tr><td>${inlineMath(a[0])}</td><td>${a[1]}</td><td>${b?inlineMath(b[0]):''}</td><td>${b?b[1]:''}</td></tr>`).join('');
  }).join('')}</tbody></table>`;
}
export const notationCss=`table.notation{font-size:8.5px}table.notation td{padding:1.5px 4px;vertical-align:top}table.notation tr.group th{background:#e8e8e8;text-align:left;font-size:9px}`;

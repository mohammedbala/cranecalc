import katex from 'katex';
import {references,tr13Clause} from '../engine/references';
import {dcText} from '../engine/checkPresentation';
import type {CheckResult,ProjectInput} from '../engine/types';
import {toDisplay,unit,type Quantity} from '../engine/units';

/** Building blocks of the printed calculation: check rows with inline equations and short code citations. */
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** Short names of the register titles, as a plan reviewer cites them. */
const codeNames:[RegExp,string][]=[
 [/^ANSI\/AISC 360-16/,'AISC 360-16'],[/^AWS D1\.1/,'AWS D1.1:2020'],[/^ANSI\/AISC 341-16/,'AISC 341-16'],[/^AIST Technical Report 13/,'AIST TR-13'],
 [/^AISC Design Guide 7/,'AISC DG7'],[/^DG7 revisions/,'AISC DG7 errata'],[/^AISC Design Guide 1\b/,'AISC DG1'],
 [/^ASCE\/SEI 7-16/,'ASCE 7-16'],[/^ACI 318-19/,'ACI 318-19'],[/^Torsional Analysis of Steel Sections/,'Moore & Mueller (EJ 2002)'],
 [/^Design of Crane Runway Beam with Channel Cap/,'Ellifritt & Lue (EJ 1998)'],[/^Lateral-Torsional Buckling/,'Nayak et al. (EJ 2024)'],
 [/^New Fatigue Provisions for the Design of Crane Runway Girders/,'Fisher & Van de Pas (EJ 2002)'],[/^Euler–Bernoulli/,'Beam mechanics'],[/^Project serviceability criteria/,'Owner criteria']
];
export const codeName=(title:string)=>codeNames.find(([re])=>re.test(title))?.[1]??title.split(' · ')[0];
/** Clause-like tokens in a note: §5.9.2, J10.2, F2, Appendix 3, Table A-3.1, Eq. E3-4. */
const clausePattern=/§{1,2}\s?\d+(?:\.\d+)*(?:\([a-z0-9]\))?|\bAppendix\s\d+(?:\.\d+)*|\bTable\s[A-Z]?-?\d+(?:[.-]\d+)*|\bEqs?\.\s?[A-Z]?\d+(?:[.-]\d+)*|\b[B-K]\d{1,2}(?:\.\d{1,2}){0,2}(?:\([a-z]\))?(?=[\s,;.)–-]|$)/g;
const compact=(v:string)=>v.replace(/\s+/g,'').replace(/^§+/,'');
function clauseTokens(note:string){
 const out:string[]=[];
 for(const m of note.matchAll(clausePattern)){
  const t=m[0].replace(/\s+/g,' ');
  if(/^[B-K]\d/.test(t)&&Number(t.slice(1).split(/[.(]/)[0])>13)continue;
  if(!out.includes(t))out.push(t);
 }
 return out;
}
/** The AISC 360 section a connection limit state is defined in, from the check's name, for notes that cite none. */
const idClauses:[RegExp,string][]=[
 [/slip$/,'J3.8'],[/(^|-)(end-edge|plate-edge|flange-edge|base-edge|stub-edge|edge)$/,'J3.4'],[/(pitch|spacing)$/,'J3.3'],
 [/(^|-)net$/,'J4.1(b)'],[/gross$/,'J4.1(a)'],[/block$/,'J4.3'],[/shear-rupture$/,'J4.2(b)'],
 [/weld-(minimum|maximum|size)$/,'J2.2b'],[/(^|-)weld(-base)?$/,'J2.4'],
 [/(column-yield|web-yield|web-yielding)$/,'J10.2'],[/(cripple|crippling)$/,'J10.3'],[/sidesway$/,'J10.4'],[/panel$/,'J10.6'],[/column-flange$/,'J10.1'],
 [/(stiffener-bearing|pin-bearing|contact)$/,'J7'],[/cjp$/,'J2.4'],[/stiffener-column$/,'J10.8'],[/(hold-down-model|-uplift)$/,'J3.6'],[/(^bearing-plate|washer-bending|end-stop-face|end-stop-face-outstand)$/,'F11'],[/(bolt-tension|locating-tension)$/,'J3.7'],[/(bolts?|bolt-shear|locating-shear)$/,'J3.6'],
 [/^(tie|rail-joint|end-bearing-(flange|plate|sleeve|seat)|brace-strut)-bearing$/,'J3.10'],[/(plate|gusset)-compression$/,'J4.4'],[/fatigue/,'Appendix 3']
];
const idClause=(id:string)=>idClauses.find(([re])=>re.test(id))?.[1];
/** The chapters and sections a register entry spans (J3.1–J3.10 → J3; §5.8.1 → §5.8), for a note that names none. */
function clauseHeads(clause:string){
 const heads:string[]=[];
 for(const t of clauseTokens(clause)){
  const h=/^[B-K]\d/.test(t)?t.match(/^[B-K]\d{1,2}/)![0]:/^§/.test(t)?t.replace(/^§+\s?/,'§').split('.').slice(0,2).join('.'):t;
  if(!heads.includes(h))heads.push(h);
 }
 return heads.slice(0,5);
}
/** Does a register clause list cover this token? A chapter-level match (J10 for J10.2) counts. */
function covers(clause:string,token:string){
 const c=compact(clause),t=compact(token);
 if(c.includes(t))return true;
 const head=t.match(/^([B-K]\d{1,2})/)?.[1]??t.match(/^(\d+\.\d+)/)?.[1];
 return !!head&&new RegExp(`(^|[^A-Z0-9.])${head.replace('.','\\.')}($|[^0-9])`).test(c);
}
/**
 * A register entry that records a method of this calculation (a component model, the beam mechanics), not a published
 * document: it is described in the reference register, never printed as a code citation.
 */
export const methodReference=(r:{id:string;edition:string})=>r.id==='mechanics'||/CraneCalc method|component model|app mechanics|Elastic component model|custom arrangement|^\d{4}-\d{2}-\d{2}$/i.test(r.edition);
/**
 * The code citation of a check, e.g. "AISC 360-16 J10.2, J10.3 · AIST TR-13 §5.9.2": each referenced document by its
 * short name with the clause of this limit state: the clause named in the check's title first (its own clause, e.g.
 * "(G2.1)"), else the clauses its note names that the register entry covers, else the clause of the limit state by its
 * id. A document whose register entry spans many clauses and names none of this check is cited without a clause list
 * (AISC 360-16 is then left off when another document is cited); method records are not cited.
 */
export function shortReference(c:CheckResult){
 const titled=clauseTokens(c.title),tokens=[...titled,...clauseTokens(c.note).filter(t=>!titled.includes(t))],byId=idClause(c.id),used=new Set<string>(),groups=new Map<string,{specific:string[];heads:string[];id?:string;title:boolean}>();
 for(const rid of c.referenceIds){
  const r=references.find(v=>v.id===rid);if(!r||methodReference(r))continue;
  const name=codeName(r.title),g=groups.get(name)??{specific:[],heads:[],title:false};
  // The title's own clause, when it names one, is the citation of the limit state (J10.1, not the stiffener clause J10.8 of the note).
  const own=titled.filter(t=>covers(r.clause,t));
  if(own.length){if(!g.title){g.specific=[];g.title=true;}for(const t of own)if(!g.specific.includes(t)){used.add(t);g.specific.push(t);}}
  else if(!g.title)for(const t of tokens)if(!used.has(t)&&covers(r.clause,t)){used.add(t);g.specific.push(t);}
  // The limit state's own AISC section by its id (J3.8 slip, J10.2 web yielding): any AISC 360-16 entry may cite it.
  if(byId&&name==='AISC 360-16')g.id=byId;
  if(!g.heads.length)g.heads=clauseHeads(r.clause);
  groups.set(name,g);
 }
 // TR-13: the clause that governs this limit state (tr13Clauses), not the first clause of the register entry; none → left off.
 const tr13=tr13Clause(c.id);
 const cited=[...groups].filter(([name])=>!(name==='AIST TR-13'&&tr13==='')).map(([name,g])=>{
  const list=name==='AIST TR-13'&&tr13?tr13.split(', '):g.specific.length?g.specific:g.id?[g.id]:g.heads.length<=2?g.heads:[];
  return {name,list,general:!list.length};
 });
 // A thickness for no prying is a Manual Part 9 T-stub check: it is cited there when no AISC 360 clause is named.
 if(/prying$/.test(c.id)&&!cited.some(v=>/Manual/.test(v.name)))for(const v of cited)if(v.name==='AISC 360-16'&&v.general){v.name='AISC Manual Part 9';v.general=false;}
 const specific=cited.filter(v=>!v.general);
 // A broad AISC 360-16 entry with no clause of its own is left off where another document cites the limit state.
 return cited.filter(v=>!(v.general&&v.name==='AISC 360-16'&&specific.length)).map(v=>`${v.name} ${v.list.slice(0,4).join(', ')}`.trim()).join(' · ');
}
const superscript=(n:number)=>String(n).replace(/[-0-9]/g,c=>'⁻⁰¹²³⁴⁵⁶⁷⁸⁹'['-0123456789'.indexOf(c)]);
/** Mantissa (two decimals) and exponent of a value written as m × 10^e. */
function scientific(d:number){let e=Math.floor(Math.log10(Math.abs(d))),m=d/10**e;if(Math.abs(Number(m.toFixed(2)))>=10){m/=10;e++;}return {m:m.toFixed(2),e};}
/** Floating-point noise removed (0.37499999 → 0.375, 0.62500001 → 0.625), so every value rounds half-up on its true value. */
export const clean=(d:number)=>Number(d.toPrecision(12));
/** A displayed magnitude this small is zero (solver residue such as 2.02 × 10⁻¹⁷). */
const zero=5e-5;
/**
 * A number as printed in the calculation, in ordinary decimal notation: three significant figures, never more than
 * two decimal places at 0.1 and above, and whole numbers from 100 up (`fixed`: trailing zeros dropped, 68.1 not 68.10). Below 0.1 a value keeps two significant figures (0.038, 0.0049); a
 * magnitude under 5 × 10⁻⁵ prints 0. Only values of ten million and more are written m × 10ⁿ.
 */
export function num(d:number,o:{fixed?:boolean;tex?:boolean}={}){
 if(!Number.isFinite(d))return '—';
 d=clean(d);const a=Math.abs(d);if(a<zero)return '0';
 if(a>=1e7){const {m,e}=scientific(d);return o.tex?`${m}\\times10^{${e}}`:`${m} × 10${superscript(e)}`;}
 // Three significant figures: two decimals below 10, one below 100, none from 100. Below 0.1, two significant figures.
 // In an equation a value below 1 keeps three significant figures (t_w = 0.375 in), so the substitution reproduces.
 const decimals=a<.1?Math.min(6,(o.tex?2:1)-Math.floor(Math.log10(a))):a>=100?0:o.tex&&a<1?3:Math.min(2,Math.max(0,2-Math.floor(Math.log10(a))));
 const t=d.toLocaleString('en-US',{minimumFractionDigits:o.fixed||(o.tex&&a<1)?0:decimals,maximumFractionDigits:decimals,roundingMode:'halfExpand'} as Intl.NumberFormatOptions);
 return o.tex?t.replace(/,/g,'{,}'):t;
}
/** Temperatures print as whole degrees. */
const wholeDegrees=(q:Quantity)=>q==='temperature'||q==='temperatureChange';
/** Three significant figures (never more than two decimals), with the project unit. */
export function sig3(v:number|undefined,q:Quantity,units:ProjectInput['units']){
 if(v===undefined||!Number.isFinite(v))return '—';
 const u=unit(q,units),d=toDisplay(v,q,units);
 return `${wholeDegrees(q)?Math.round(d).toLocaleString('en-US'):num(d)}${u?` ${u}`:''}`;
}
/**
 * An inch length that is a whole number of sixteenths, as a fraction: 3/8 in, 6 3/4 in, 480 1/2 in. Undefined for any
 * other length, which then prints as a decimal.
 */
export function inchFraction(inches:number){
 const ticks=Math.round(Math.abs(inches)*16);
 if(!ticks||Math.abs(Math.abs(inches)*16-ticks)>1e-6)return undefined;
 const whole=Math.floor(ticks/16);let n=ticks%16,den=16;while(n&&n%2===0){n/=2;den/=2;}
 return `${inches<0?'-':''}${whole||!n?whole:''}${n?`${whole?' ':''}${n}/${den}`:''}`;
}
/**
 * The value to two decimals at most, every digit kept above that (dimensions, inputs), with the project unit. A US length
 * that is a whole number of sixteenths (a plate, bolt or weld size, a setting tolerance) prints as a fraction: 3/8 in,
 * never 0.37 or 0.38 in. Values of 100 and more print as whole numbers unless they are such a fraction.
 */
export function fixed2(v:number|undefined,q:Quantity,units:ProjectInput['units']){
 if(v===undefined||!Number.isFinite(v))return '—';
 const u=unit(q,units),d=toDisplay(v,q,units);
 if(q==='length'&&units==='US'){const fr=inchFraction(clean(d));if(fr&&!Number.isInteger(clean(d)))return `${fr} in`;}
 return `${wholeDegrees(q)?Math.round(d).toLocaleString('en-US'):num(d,{fixed:true})}${u?` ${u}`:''}`;
}
/** A check value: a US length of whole sixteenths as a fraction (a size or a tolerance), anything else to three significant figures. */
export const value=(v:number|undefined,q:Quantity,units:ProjectInput['units'])=>{
 if(q==='length'&&units==='US'&&v!==undefined&&Number.isFinite(v)){const d=clean(toDisplay(v,q,units)),fr=inchFraction(d);if(fr&&Math.abs(d)<100)return `${fr} in`;}
 return sig3(v,q,units);
};
/**
 * Numbers written by the engine into notes and titles, re-printed to the report's two-decimal rule: a decimal with
 * three or more places (1.0000, 116.051, 0.0012413) or in e-notation. Clause numbers (§3.10.2, J10.8) are left alone.
 */
export function tidyNumbers(text:string){
 return text.replace(/(?<![\w.§-])(-?\d[\d,]*\.\d{3,}(?:e[-+]?\d+)?|-?\d+(?:\.\d+)?e[-+]?\d+)(?!\w|\.\d)/gi,(m)=>num(Number(m.replace(/,/g,'')),{fixed:true}));
}
/**
 * Escaped report text with engineering subscripts as markup: R_FIL, F_TH, W_E, A_fn, t_min (from engine notes) print
 * R<sub>FIL</sub> and so on, never with the underscore. A sentence ending twice ("accepted..") is closed once.
 */
export function subscripts(html:string){
 return html.replace(/(?<![\w/.&#-])([A-Za-z])_\{?([A-Za-z]{1,8}|\d)\}?(?![\w])/g,'$1<sub>$2</sub>').replace(/(?<![.\d])\.\.(?=\s|$|<)/g,'.');
}
export const inlineMath=(tex:string)=>katex.renderToString(tex,{throwOnError:false,displayMode:false});
export const statusLabel=(s:CheckResult['status'])=>({pass:'OK',fail:'NG',excluded:'BY OTHERS','not-applicable':'N/A',unverified:'UNVERIFIED',unsupported:'UNSUPPORTED',incomplete:'INCOMPLETE'} as Record<string,string>)[s]??s.toUpperCase();
const firstSentence=(v:string)=>{const m=v.match(/^.{20,180}?[.;](\s|$)/);return (m?m[0]:v.slice(0,160)).trim();};
/** Checks repeating one equation, group and references over many stations or details. */
const familyKey=(c:CheckResult)=>c.equation?`${c.group}|${c.equation}|${c.referenceIds.join(',')}`:c.id;
/** The governing member: a failure first, then the largest finite demand/capacity. */
export function governing(checks:CheckResult[]){
 const rank=(c:CheckResult)=>(c.status==='fail'?1e9:0)+(c.utilization!==undefined&&Number.isFinite(c.utilization)?Math.min(c.utilization,1e8):-1);
 return checks.reduce((a,b)=>rank(b)>rank(a)?b:a,checks[0]);
}
/** The equation cell: the check's equation inline, or what an equation-free check rests on. */
export function equationCell(c:CheckResult){
 if(c.equation)return inlineMath(c.equation);
 return `<i>${c.status==='excluded'?'Outside this calculation':c.status==='not-applicable'?'Not applicable':'Recorded input'}: ${subscripts(esc(tidyNumbers(firstSentence(c.note))))}</i>`;
}
export interface CheckTableContext{units:ProjectInput['units'];rendered:Set<string>}
/**
 * One row per check: title with its code citation and governing case, the equation inline, demand, limit, D/C and result. Three or
 * more checks with the same equation (stations, fatigue points) print as their governing member.
 */
export function checkTable(checks:CheckResult[],x:CheckTableContext){
 if(!checks.length)return '';
 const families=new Map<string,CheckResult[]>();
 for(const c of checks){const k=familyKey(c),v=families.get(k);if(v)v.push(c);else families.set(k,[c]);}
 const rows=[...families.values()].flatMap(v=>v.length>=3?[{c:governing(v),n:v.length,members:v}]:v.map(c=>({c,n:1,members:[c]})));
 for(const c of checks)x.rendered.add(c.id);
 const q=(c:CheckResult)=>c.quantity??'ratio';
 return `<table class="checks"><colgroup><col class="c-title"/><col class="c-eq"/><col class="c-num"/><col class="c-num"/><col class="c-dc"/><col class="c-res"/></colgroup><thead><tr><th>Check · reference</th><th>Equation</th><th>Demand</th><th>Limit</th><th>D/C</th><th>Result</th></tr></thead><tbody>${rows.map(({c,n,members})=>`<tr class="${c.status}" data-checks="${esc(members.map(m=>m.id).join(' '))}"><td><b>${esc(tidyNumbers(c.title))}</b>${n>1?` <span class="family">governing of ${n}</span>`:''}<small class="ref">${esc(shortReference(c))}</small>${c.caseId?`<small class="ref">Governing case ${esc(c.caseId)}</small>`:''}</td><td class="eq">${equationCell(c)}</td><td class="num">${sig3(c.demand,q(c),x.units)}</td><td class="num">${sig3(c.capacity,q(c),x.units)}</td><td class="num">${dcText(c.utilization,2,'—')}</td><td class="res"><b class="${c.status}">${esc(statusLabel(c.status))}</b></td></tr>`).join('')}</tbody></table>`;
}
export const checkTableCss=`table.checks{font-size:9px;margin:6px 0 10px}table.checks col.c-title{width:27%}table.checks col.c-eq{width:37%}table.checks col.c-num{width:11%}table.checks col.c-dc{width:6%}table.checks col.c-res{width:8%}table.checks td{padding:3px 4px;vertical-align:middle}table.checks td.num{text-align:right;white-space:nowrap}table.checks th:nth-child(n+3){text-align:right}table.checks td.res,table.checks th:last-child{text-align:center}table.checks td small.ref{display:block;font-size:7.5px;color:#333;margin-top:1px}table.checks .family{font-size:7.5px;border:1px solid #000;padding:0 3px;white-space:nowrap}table.checks td.eq{font-size:9px;overflow:hidden}table.checks td.eq .katex{font-size:1.02em;white-space:normal}table.checks td.eq i{font-size:8px}table.checks tr.fail td{background:#e6e6e6;font-weight:700}table.checks b.fail{text-decoration:underline}`;
/** Any hex colour in embedded linework as the gray of equal luminance, so the printed calculation is black and white. */
export function monochrome(svg:string){
 return svg.replace(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi,(_,h:string)=>{
  const v=h.length===3?h.split('').map(c=>parseInt(c+c,16)):[0,2,4].map(i=>parseInt(h.slice(i,i+2),16));
  const y=Math.round(.2126*v[0]+.7152*v[1]+.0722*v[2]).toString(16).padStart(2,'0');
  return `#${y}${y}${y}`;
 });
}

import katex from 'katex';
import {references} from '../engine/references';
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
 [/^Fisher & Van de Pas/,'Fisher & Van de Pas (EJ 2002)'],[/^Euler–Bernoulli/,'Beam mechanics'],[/^Project serviceability criteria/,'Owner criteria']
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
 [/(stiffener-bearing|pin-bearing|contact)$/,'J7'],[/(bolt-tension|locating-tension)$/,'J3.7'],[/(bolts?|bolt-shear|locating-shear)$/,'J3.6'],
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
 * The code citation of a check, e.g. "AISC 360-16 J10.2, J10.3 · AIST TR-13 §5.9.2": each referenced document by
 * its short name, with the clauses the note names that the register entry covers, else the entry's first clause.
 */
export function shortReference(c:CheckResult){
 const tokens=clauseTokens(c.note),byId=idClause(c.id),used=new Set<string>(),groups=new Map<string,{specific:string[];heads:string[];id?:string}>();
 for(const rid of c.referenceIds){
  const r=references.find(v=>v.id===rid);if(!r)continue;
  const name=codeName(r.title),g=groups.get(name)??{specific:[],heads:[]};
  for(const t of tokens)if(!used.has(t)&&covers(r.clause,t)){used.add(t);g.specific.push(t);}
  if(byId&&name==='AISC 360-16'&&covers(r.clause,byId))g.id=byId;
  if(!g.heads.length)g.heads=clauseHeads(r.clause);
  groups.set(name,g);
 }
 return [...groups].map(([name,g])=>`${name} ${(g.specific.length?g.specific:g.id?[g.id]:g.heads).slice(0,4).join(', ')}`.trim()).join(' · ');
}
/** Three significant figures, with the project unit. */
export function sig3(v:number|undefined,q:Quantity,units:ProjectInput['units']){
 if(v===undefined||!Number.isFinite(v))return '—';
 const d=toDisplay(v,q,units),a=Math.abs(d),u=unit(q,units);
 if(a>=1e7||(a>0&&a<1e-4))return `${d.toExponential(2)}${u?` ${u}`:''}`;
 const decimals=a===0?0:Math.min(5,Math.max(0,2-Math.floor(Math.log10(a))));
 return `${d.toLocaleString('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals})}${u?` ${u}`:''}`;
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
 return `<i>${c.status==='excluded'?'Outside this calculation':c.status==='not-applicable'?'Not applicable':'Recorded input'}: ${esc(firstSentence(c.note))}</i>`;
}
export interface CheckTableContext{units:ProjectInput['units'];rendered:Set<string>}
/**
 * One row per check: title with its code citation, the equation inline, demand, limit, D/C and result. Three or
 * more checks with the same equation (stations, fatigue points) print as their governing member.
 */
export function checkTable(checks:CheckResult[],x:CheckTableContext){
 if(!checks.length)return '';
 const families=new Map<string,CheckResult[]>();
 for(const c of checks){const k=familyKey(c),v=families.get(k);if(v)v.push(c);else families.set(k,[c]);}
 const rows=[...families.values()].flatMap(v=>v.length>=3?[{c:governing(v),n:v.length,members:v}]:v.map(c=>({c,n:1,members:[c]})));
 for(const c of checks)x.rendered.add(c.id);
 const q=(c:CheckResult)=>c.quantity??'ratio';
 return `<table class="checks"><colgroup><col class="c-title"/><col class="c-eq"/><col class="c-num"/><col class="c-num"/><col class="c-dc"/><col class="c-res"/></colgroup><thead><tr><th>Check · reference</th><th>Equation</th><th>Demand</th><th>Limit</th><th>D/C</th><th>Result</th></tr></thead><tbody>${rows.map(({c,n,members})=>`<tr class="${c.status}" data-checks="${esc(members.map(m=>m.id).join(' '))}"><td><b>${esc(c.title)}</b>${n>1?` <span class="family">governing of ${n}</span>`:''}<small class="ref">${esc(shortReference(c))}</small></td><td class="eq">${equationCell(c)}</td><td class="num">${sig3(c.demand,q(c),x.units)}</td><td class="num">${sig3(c.capacity,q(c),x.units)}</td><td class="num">${dcText(c.utilization,2,'—')}</td><td class="res"><b class="${c.status}">${esc(statusLabel(c.status))}</b></td></tr>`).join('')}</tbody></table>`;
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

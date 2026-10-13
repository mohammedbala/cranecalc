import type {CalculationSnapshot} from './types';
import type {RunwayCaseRecord} from './runwayDetails';
import {craneCombinations} from './aistLoads';

/**
 * Engineering names of analysis cases. The moving-load analysis numbers its cases (D-8520 strength, S-0-25144.8-1
 * service); a bracket force set adds the bay that carries the longitudinal force (-T2; -R2 traction through the rail
 * string to that bay's stop) and, for a wheel over a shared grid, the
 * set with that wheel on the other girder end (-J). The report prints the combination and the crane position instead:
 * "LRFD 2c, crane at 10'-0" past grid 2". The CSV keeps the ids.
 */
const caseParts=(id:string)=>{const m=id.match(/^(.*?)(?:-([TR])(-?\d+))?(-J)?$/)!;return {base:m[1],bay:m[3]===undefined?undefined:Number(m[3]),rail:m[2]==='R',joint:!!m[4]};};
/** The recorded case an id refers to (its traction-bay and joint suffixes removed). */
export const caseBase=(id:string)=>caseParts(id).base;
/** Case ids in printed text: D-123, D-123-T2-J, S-0-25144.809375-1, S-0-19812--1-T-1-J. */
export const caseIdPattern=/\b[DS]-\d+(?:--?\d+(?:\.\d+)?)*(?:-[TR]-?\d+)?(?:-J)?(?!\w|\.\d)/g;

/** Inches to the nearest inch as feet and inches (10'-0"), or meters in SI. */
function distance(mm:number,units:'US'|'SI'){
 if(units==='SI')return `${(Math.abs(mm)/1000).toFixed(2)} m`;
 const inches=Math.round(Math.abs(mm)/25.4);return `${Math.floor(inches/12)}'-${inches%12}"`;
}
/** The position of a crane's first wheel from the grid at or before it: "at grid 2", "10'-0" past grid 2", "10'-0" before grid 1". */
export function cranePosition(s:CalculationSnapshot,origin:number){
 const p=s.input,grids=[0];for(const L of p.spans)grids.push(grids[grids.length-1]+L);
 if(origin<-1)return `${distance(origin,p.units)} before grid 1`;
 let g=0;for(let i=0;i<grids.length;i++)if(grids[i]<=origin+1)g=i;
 const off=origin-grids[g];
 return Math.abs(off)<12.7?`at grid ${g+1}`:`${distance(off,p.units)} past grid ${g+1}`;
}
/** A case record as text: combination, then each crane (empty or loaded) by the position of its first wheel. */
export function caseRecordName(s:CalculationSnapshot,r:RunwayCaseRecord,extra:{bay?:number;rail?:boolean;joint?:boolean}={}){
 const many=s.input.cranes.length>1,service=/single crane/i.test(r.combination);
 const cranes=r.cranes.map(c=>`${many?`crane ${c.index+1}`:'crane'}${c.loaded||service?'':' empty'} ${/^at /.test(cranePosition(s,c.origin))?'':'at '}${cranePosition(s,c.origin)}`);
 const parts=[service?'one crane, static wheel loads':r.combination,...cranes];
 const stop=craneCombinations(s.input.method).some(c=>c.bumper>0&&`${s.input.method} ${c.id}`===r.combination);
 if(extra.bay!==undefined&&extra.bay>0)parts.push(stop?`stop force on bay ${extra.bay}`:extra.rail?`traction through the rail string to the stop on bay ${extra.bay}`:`traction on bay ${extra.bay}`);
 if(extra.joint)parts.push('wheel over the grid taken by the adjacent girder end');
 return parts.join(', ');
}
/**
 * The engineering name of a case id; an id that is not a recorded analysis case (a combination name such as
 * "LRFD 2c", an ASCE 7 combination) is returned as it is.
 */
export function caseName(s:CalculationSnapshot,id:string|undefined){
 if(!id)return '—';
 const {base,bay,rail,joint}=caseParts(id),r=s.detailResults?.caseIndex?.[base];
 return r?caseRecordName(s,r,{bay,rail,joint}):id;
}
/** Every case id named in a text replaced by its engineering name. */
export const nameCases=(s:CalculationSnapshot,text:string)=>text.replace(caseIdPattern,id=>caseName(s,id));

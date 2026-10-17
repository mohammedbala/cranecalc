import type {CheckResult,ProjectInput} from './types';
import {format} from './units';
import {spliceLayout} from './spliceInputs';

const foot=304.8;
/** Practical shipping and erection length of one girder piece (legal-load trailers, handling between existing framing). */
export const practicalPieceLength=60*foot;
/**
 * Field splice positions that keep every piece of a continuous girder within `limit`: candidates near the dead-load
 * inflection points, 0.2 of the adjacent span from each interior support (equal-span continuous beams under uniform
 * load: about 0.21L), taken greedily from the left end, the farthest that keeps the piece within the limit.
 */
export function spliceStations(p:ProjectInput,limit=practicalPieceLength){
 const grids=[0];for(const l of p.spans)grids.push(grids.at(-1)!+l);
 const L=grids.at(-1)!,candidates=grids.slice(1,-1).flatMap((x,i)=>[x-.2*p.spans[i],x+.2*p.spans[i+1]]).sort((a,b)=>a-b);
 const out:number[]=[];let start=0;
 while(L-start>limit+1e-6){const next=candidates.filter(x=>x>start+1e-6&&x-start<=limit+1e-6).at(-1);if(next===undefined)break;out.push(next);start=next;}
 return out;
}
/**
 * A continuous girder longer than a practical piece: the calculation designs it as one length (no field splices are
 * designed here), so its shipping and its erection between the supporting columns, bracing and roof framing need the
 * erector's confirmation, or field splices designed by the engineer of record near the dead-load inflection points.
 * Open until the confirmation is recorded (details.girderPiece). Designed field splices (details.splices, girderSplice.ts)
 * that keep every piece within the practical length close it: the splices are then checked as connections.
 */
export function girderPieceChecks(p:ProjectInput):CheckResult[]{
 const L=p.spans.reduce((a,b)=>a+b,0);
 if(p.system!=='continuous'||!p.details||L<=practicalPieceLength+1e-6)return [];
 const designed=spliceLayout(p);
 if(designed.stations.length&&!designed.errors.length&&designed.pieces.every(v=>v.length<=practicalPieceLength+1e-6))return [];
 const u=p.units,len=(v:number)=>format(v,'length',u,3),confirmed=p.details.girderPiece?.trim();
 const existing=!!p.existingColumn?.enabled&&!p.existingColumn.isNew||!p.existingColumn?.enabled;
 const splices=spliceStations(p),grids=[0];for(const l of p.spans)grids.push(grids.at(-1)!+l);
 const where=splices.map(x=>{const g=grids.reduce((k,v,i)=>Math.abs(v-x)<Math.abs(grids[k]-x)?i:k,0);return `x = ${len(x)} (${len(Math.abs(x-grids[g]))} ${x<grids[g]?'before':'past'} grid ${g+1})`;}).join(', ');
 return [{id:'girder-piece-basis',group:'Detailing',title:'Continuous girder · one-piece length for shipping and erection',status:confirmed?'pass':'unverified',equation:`L\\le${len(practicalPieceLength)}\\ \\text{or splices}`,referenceIds:['aisc-j','tr13-crane'],
  note:`The continuous girder is designed as one ${len(L)} piece, longer than the practical shipping and erection length of ${len(practicalPieceLength)}; no field splices are entered (the drawings permit none without engineer approval).${existing?' It must be threaded between the existing columns, bracing and roof framing.':''} ${confirmed?`Confirmed: ${confirmed}.`:`Confirm the shipping and erection of the full length with the erector and record it (details.girderPiece), or add the bolted field splices this calculation designs (details.splices) near the dead-load inflection points, about 0.2 of the span from the interior supports: ${where} would keep each piece within ${len(practicalPieceLength)}.`}`}];
}

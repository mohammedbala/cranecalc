import type {ProjectInput} from './types';
import {craneTravel,stopContacts} from './craneTravel';
import {meshTolerance} from './meshNodes';

/**
 * Crane origins sampled for the moving-load search. `after` marks a crane placed at closest approach
 * behind the previous crane at that origin; `before` marks a crane placed at closest approach ahead of
 * the next crane at that origin. Each pairs only with its partner, so the coupled positions add one
 * case per partner instead of multiplying the search.
 */
export interface CranePosition {origin:number;after?:number;before?:number;
 /** A wheel over a support or detail station. Two such cranes are not paired with each other: each local
  * maximum needs one crane at its station and the others at closest approach or sampled positions. */
 station?:boolean;
 /** Reduced pairing (PairingOptions): a uniform travel sample of the coarse grid. */
 coarse?:boolean;
 /** Reduced pairing: a station position, paired with a neighboring crane only at closest approach or at a coarse
  * sample of that crane. */
 sparse?:boolean}
/**
 * Reduced pairing of the design and detailed searches: a crane with a wheel over a support or detail station meets
 * its neighbor at closest approach (either side) or at the coarse travel samples, not at every refined sample. The
 * local maximum at a station needs that crane over it and the other one as close as it can be.
 */
export interface PairingOptions {coarseSteps:number}
export const craneSeparation=(p:ProjectInput,a:number,b:number)=>Math.max(p.cranes[a].minSeparation,p.cranes[b].minSeparation);

// Absolute-maximum moment positions on a simple span (Barre): wheel k and the resultant of the wheels on
// the span are equidistant from midspan, for every contiguous group of wheels.
function maximumMomentOrigins(offsets:number[],loads:number[],spans:[number,number][]){
 const out:number[]=[];
 for(const [a,b] of spans)for(let i=0;i<offsets.length;i++){
  let P=0,Pd=0;
  for(let j=i;j<offsets.length;j++){
   P+=loads[j];Pd+=loads[j]*offsets[j];if(offsets[j]-offsets[i]>b-a)break;
   const r=Pd/P;for(let k=i;k<=j;k++)out.push((a+b)/2-(offsets[k]+r)/2);
  }
 }
 return out;
}

/**
 * A sampled crane origin that puts a wheel within meshTolerance of a support, moved so that the wheel is exactly on it
 * (the nearest such wheel and support): every model then has the wheel on the support node, instead of an element a
 * fraction of a millimetre long beside it (the lateral-torsional meshes also merge any other load within the tolerance
 * of a node). Origins outside the travel stay where they are.
 */
export function snapToSupports(p:ProjectInput,crane:number,origin:number,within:(o:number)=>boolean){
 const tolerance=meshTolerance(Math.min(...p.spans),p.section.d);
 let best=origin,distance=tolerance,x=0;
 for(const span of [0,...p.spans]){x+=span;for(const w of p.cranes[crane].wheels){const v=x-w.offset,d=Math.abs(v-origin);if(d>0&&d<=distance&&within(v)){distance=d;best=v;}}}
 return best;
}

export function cranePositions(p:ProjectInput,steps:number,stations:number[],reduced?:PairingOptions):CranePosition[][]{
 const supports=[0];for(const l of p.spans)supports.push(supports.at(-1)!+l);
 const spans=p.spans.map((_,i)=>[supports[i],supports[i+1]] as [number,number]);
 const travel=p.cranes.map((_,k)=>craneTravel(p,k)),within=(k:number,o:number)=>o>=travel[k].start-1e-9&&o<=travel[k].end+1e-9;
 const loaded=(k:number)=>p.cranes[k].wheels.map(w=>w.loaded);
 const aligned=p.cranes.map(()=>new Set<number>()),coarse=p.cranes.map(()=>new Set<number>());
 const sets=p.cranes.map((c,k)=>{
  // Uniform travel samples and maximum-moment positions are sampling devices: one within meshTolerance of putting a
  // wheel on a support is taken with the wheel on it (snapToSupports). Stop contacts keep their exact origin.
  const snap=(o:number)=>snapToSupports(p,k,o,v=>within(k,v));
  const {start,end}=travel[k],o=new Set<number>(Array.from({length:steps+1},(_,i)=>snap(start+(end-start)*i/steps)));
  if(reduced)for(let i=0;i<=steps;i++)if((i*reduced.coarseSteps)%steps===0)coarse[k].add(snap(start+(end-start)*i/steps));
  // The crane at each stop it strikes: the stop combinations act there alone.
  for(const v of stopContacts(p,k))o.add(v.origin);
  for(const v of maximumMomentOrigins(c.wheels.map(w=>w.offset),loaded(k),spans))if(within(k,v))o.add(snap(v));
  for(const x of stations)for(const w of c.wheels){const v=x-w.offset;if(within(k,v)&&!o.has(v)){o.add(v);aligned[k].add(v);}}
  return o;
 });
 const gap=(k:number)=>p.cranes[k-1].wheels.at(-1)!.offset+craneSeparation(p,k-1,k);
 const result=sets.map((s,k)=>[...s].sort((a,b)=>a-b).map(origin=>(aligned[k].has(origin)?{origin,station:true,...(reduced?{sparse:true}:{})}:{origin,...(coarse[k].has(origin)?{coarse:true}:{})}) as CranePosition));
 for(let k=1;k<p.cranes.length;k++){
  const g=gap(k),offsets=[...p.cranes[k-1].wheels.map(w=>w.offset),...p.cranes[k].wheels.map(w=>g+w.offset)];
  // Two neighboring cranes at closest approach act as one train: its maximum-moment positions.
  const train=new Set<number>();
  for(const v of maximumMomentOrigins(offsets,[...loaded(k-1),...loaded(k)],spans))if(within(k-1,v)&&within(k,v+g)&&!sets[k-1].has(v))train.add(v);
  for(const v of train)result[k-1].push({origin:v,before:v+g});
  // Behind every position of the previous crane, including its own coupled positions.
  for(const lead of result[k-1].map(v=>v.origin)){const o=lead+g;if(within(k,o)&&!sets[k].has(o))result[k].push({origin:o,after:lead});}
  // Ahead of this crane with a wheel over a support or detail station.
  for(const x of stations)for(const w of p.cranes[k].wheels){const o=x-w.offset;if(!within(k,o))continue;const lead=o-g;if(within(k-1,lead)&&!sets[k-1].has(lead))result[k-1].push({origin:lead,before:o});}
 }
 return result;
}

/** Whether a position may follow the previously chosen crane in the ordered search. */
export function pairs(p:ProjectInput,index:number,r:CranePosition,previous?:{index:number;position:CranePosition}){
 if(r.after!==undefined&&(previous?.index!==index-1||previous.position.origin!==r.after))return false;
 if(r.station&&previous?.position.station)return false;
 if(previous&&r.sparse&&!previous.position.coarse&&previous.position.before!==r.origin)return false;
 if(previous&&previous.position.sparse&&!r.coarse&&r.after!==previous.position.origin)return false;
 if(previous&&previous.index===index-1&&previous.position.before!==undefined&&r.origin!==previous.position.before)return false;
 if(previous&&r.origin-previous.position.origin-p.cranes[previous.index].wheels.at(-1)!.offset<craneSeparation(p,index,previous.index)-1e-6)return false;
 return true;
}

import type {ProjectInput} from './types';

/**
 * Crane origins sampled for the moving-load search. `after` marks a crane placed at closest approach
 * behind the previous crane at that origin; `before` marks a crane placed at closest approach ahead of
 * the next crane at that origin. Each pairs only with its partner, so the coupled positions add one
 * case per partner instead of multiplying the search.
 */
export interface CranePosition {origin:number;after?:number;before?:number;
 /** A wheel over a support or detail station. Two such cranes are not paired with each other: each local
  * maximum needs one crane at its station and the others at closest approach or sampled positions. */
 station?:boolean}
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

export function cranePositions(p:ProjectInput,steps:number,stations:number[]):CranePosition[][]{
 const supports=[0];for(const l of p.spans)supports.push(supports.at(-1)!+l);
 const spans=p.spans.map((_,i)=>[supports[i],supports[i+1]] as [number,number]);
 const within=(k:number,o:number)=>o>=p.cranes[k].travelStart-1e-9&&o<=p.cranes[k].travelEnd+1e-9;
 const loaded=(k:number)=>p.cranes[k].wheels.map(w=>w.loaded);
 const aligned=p.cranes.map(()=>new Set<number>());
 const sets=p.cranes.map((c,k)=>{
  const o=new Set<number>(Array.from({length:steps+1},(_,i)=>c.travelStart+(c.travelEnd-c.travelStart)*i/steps));
  for(const v of maximumMomentOrigins(c.wheels.map(w=>w.offset),loaded(k),spans))if(within(k,v))o.add(v);
  for(const x of stations)for(const w of c.wheels){const v=x-w.offset;if(within(k,v)&&!o.has(v)){o.add(v);aligned[k].add(v);}}
  return o;
 });
 const gap=(k:number)=>p.cranes[k-1].wheels.at(-1)!.offset+craneSeparation(p,k-1,k);
 const result=sets.map((s,k)=>[...s].sort((a,b)=>a-b).map(origin=>(aligned[k].has(origin)?{origin,station:true}:{origin}) as CranePosition));
 for(let k=1;k<p.cranes.length;k++){
  const g=gap(k),offsets=[...p.cranes[k-1].wheels.map(w=>w.offset),...p.cranes[k].wheels.map(w=>g+w.offset)];
  // Two neighbouring cranes at closest approach act as one train: its maximum-moment positions.
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
 if(previous&&previous.index===index-1&&previous.position.before!==undefined&&r.origin!==previous.position.before)return false;
 if(previous&&r.origin-previous.position.origin-p.cranes[previous.index].wheels.at(-1)!.offset<craneSeparation(p,index,previous.index)-1e-6)return false;
 return true;
}

import type {RunwayCaseRecord} from './runwayDetails';

type Cranes=RunwayCaseRecord['cranes'];
const stopCode={left:1,right:2} as const,stopName=[undefined,'left','right'] as const;
const strengthNumber=(id:string)=>{const m=/^D-(0|[1-9]\d*)$/.exec(id);return m?Number(m[1]):-1;};
const sameCranes=(a:Cranes,b:Cranes)=>a.length===b.length&&a.every((c,i)=>c.index===b[i].index&&c.origin===b[i].origin&&c.loaded===b[i].loaded);
const plainCranes=(cranes:Cranes)=>cranes.every(c=>Object.keys(c).join()==='index,origin,loaded'&&typeof c.index==='number'&&typeof c.origin==='number'&&typeof c.loaded==='boolean');

/**
 * The strength and service cases of a detailed run by id: printed results name cases by id and calculate() looks the
 * names up here (caseIndex). The moving-load search numbers its strength cases D-1, D-2, ... in the order it observes
 * them, so those are kept as typed columns (case number, combination, lateral sign, stop, and an index into the
 * distinct crane arrays, which the cases of one crane state share), about 20 bytes a case; any other id keeps its record.
 * get() returns a record equal to the one registered.
 */
export class CaseRegistry {
 private numbers=new Float64Array(1024);private combinations=new Uint16Array(1024);private signs=new Int8Array(1024);private stops=new Uint8Array(1024);private craneSets=new Int32Array(1024);
 private count=0;private names:string[]=[];private nameIndex=new Map<string,number>();private cranes:Cranes[]=[];
 private other=new Map<string,RunwayCaseRecord>();
 get size(){return this.count+this.other.size;}
 private find(n:number){
  let lo=0,hi=this.count-1;
  while(lo<=hi){const mid=(lo+hi)>>1,v=this.numbers[mid];if(v===n)return mid;if(v<n)lo=mid+1;else hi=mid-1;}
  return -1;
 }
 has(id:string){const n=strengthNumber(id);return (n>=0&&this.find(n)>=0)||this.other.has(id);}
 set(id:string,r:RunwayCaseRecord){
  const n=strengthNumber(id),keys=Object.keys(r);
  const compact=n>=0&&(!this.count||n>this.numbers[this.count-1])&&!this.other.has(id)&&(r.lateralSign===-1||r.lateralSign===0||r.lateralSign===1)&&!Object.is(r.lateralSign,-0)
   &&(r.stop===undefined?keys.length===3:(r.stop==='left'||r.stop==='right')&&keys.length===4)&&keys[0]==='combination'&&keys[1]==='cranes'&&keys[2]==='lateralSign'&&plainCranes(r.cranes);
  if(!compact){if(n>=0&&this.find(n)>=0)this.remove(n);this.other.set(id,r);return this;}
  if(this.count===this.numbers.length)this.grow();
  let name=this.nameIndex.get(r.combination);
  if(name===undefined){name=this.names.length;this.names.push(r.combination);this.nameIndex.set(r.combination,name);}
  const last=this.cranes.length-1;
  if(last<0||!sameCranes(this.cranes[last],r.cranes))this.cranes.push(r.cranes.map(c=>({index:c.index,origin:c.origin,loaded:c.loaded})));
  const i=this.count++;
  this.numbers[i]=n;this.combinations[i]=name;this.signs[i]=r.lateralSign;this.stops[i]=r.stop?stopCode[r.stop]:0;this.craneSets[i]=this.cranes.length-1;
  return this;
 }
 get(id:string):RunwayCaseRecord|undefined{
  const n=strengthNumber(id),i=n>=0?this.find(n):-1;
  if(i<0)return this.other.get(id);
  const stop=stopName[this.stops[i]];
  return {combination:this.names[this.combinations[i]],cranes:this.cranes[this.craneSets[i]].map(c=>({...c})),lateralSign:this.signs[i],...(stop?{stop}:{})};
 }
 private remove(n:number){
  const i=this.find(n);if(i<0)return;
  for(const a of [this.numbers,this.combinations,this.signs,this.stops,this.craneSets])a.copyWithin(i,i+1,this.count);
  this.count--;
 }
 private grow(){
  const size=this.numbers.length*2,grow=<T extends Float64Array|Uint16Array|Int8Array|Uint8Array|Int32Array>(a:T,make:(n:number)=>T)=>{const b=make(size);b.set(a);return b;};
  this.numbers=grow(this.numbers,n=>new Float64Array(n));this.combinations=grow(this.combinations,n=>new Uint16Array(n));this.signs=grow(this.signs,n=>new Int8Array(n));
  this.stops=grow(this.stops,n=>new Uint8Array(n));this.craneSets=grow(this.craneSets,n=>new Int32Array(n));
 }
}

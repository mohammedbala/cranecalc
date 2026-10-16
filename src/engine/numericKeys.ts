/**
 * Numeric keys for the dedup stores of the detailed collector (detailAnalysis.ts). A key is a sequence of doubles (the
 * fields its JSON string key held, -0 folded to 0 as JSON.stringify did) hashed to 64 bits by two independent 32-bit
 * lanes. The stores never accept a hash match on its own where a false match could drop a load case: KeyedCache
 * confirms every hit against the stored fields, and EventDedup confirms hits within the current crane state exactly
 * (see there for the one probabilistic acceptance and its bound).
 */
const word=new Float64Array(1),words=new Uint32Array(word.buffer);
const rotl=(x:number,r:number)=>(x<<r)|(x>>>(32-r));

/** A reusable buffer of key fields with its 64-bit hash (lanes `lo`, `hi`, unsigned 32-bit). */
export class KeyFields {
 values=new Float64Array(64);length=0;lo=0;hi=0;
 reset(){this.length=0;return this;}
 push(v:number){
  if(this.length===this.values.length){const grown=new Float64Array(this.values.length*2);grown.set(this.values);this.values=grown;}
  this.values[this.length++]=v===0?0:v;return this;
 }
 /** Two lanes: MurmurHash3 x86_32 block mixing, and an xxHash32-style round with other primes and rotations. */
 hash(){
  let a=0x9747b28c,b=0x165667b1;
  for(let i=0;i<this.length;i++){
   word[0]=this.values[i];
   for(let j=0;j<2;j++){
    const w=words[j];
    let k=Math.imul(w,0xcc9e2d51);k=rotl(k,15);k=Math.imul(k,0x1b873593);a^=k;a=rotl(a,13);a=(Math.imul(a,5)+0xe6546b64)|0;
    b=(b+Math.imul(w,0x85ebca77))|0;b=rotl(b,13);b=Math.imul(b,0x9e3779b1);
   }
  }
  a^=this.length;a^=a>>>16;a=Math.imul(a,0x85ebca6b);a^=a>>>13;a=Math.imul(a,0xc2b2ae35);a^=a>>>16;
  b^=this.length*0x27d4eb2f;b^=b>>>15;b=Math.imul(b,0x2c1b3c6d);b^=b>>>12;b=Math.imul(b,0x297a2d39);b^=b>>>15;
  this.lo=a>>>0;this.hi=b>>>0;return this;
 }
}

/** An open-addressing set of 64-bit hashes (two Uint32 per slot, load at most one half). */
export class HashSet64 {
 private table=new Uint32Array(2*1024);private mask=1023;size=0;
 private slot(lo:number,hi:number){let i=(lo^Math.imul(hi,0x9e3779b1))&this.mask;for(;;){const a=this.table[2*i],b=this.table[2*i+1];if((a===0&&b===0)||(a===lo&&b===hi))return i;i=(i+1)&this.mask;}}
 has(lo:number,hi:number){if(lo===0&&hi===0)lo=1;const i=this.slot(lo,hi);return this.table[2*i]===lo&&this.table[2*i+1]===hi;}
 /** Adds the hash; false when it was already present. */
 add(lo:number,hi:number){
  if(lo===0&&hi===0)lo=1;
  let i=this.slot(lo,hi);if(this.table[2*i]===lo&&this.table[2*i+1]===hi)return false;
  this.table[2*i]=lo;this.table[2*i+1]=hi;
  if(++this.size*2>this.mask+1){
   const old=this.table;this.table=new Uint32Array(old.length*2);this.mask=this.mask*2+1;
   for(let j=0;j<old.length;j+=2)if(old[j]!==0||old[j+1]!==0){i=this.slot(old[j],old[j+1]);this.table[2*i]=old[j];this.table[2*i+1]=old[j+1];}
  }
  return true;
 }
}

/**
 * Exact dedup of the load events of one detailed run: an event recurs only with the same kind and cranes (its group;
 * the JSON key held both), so a repeat is confirmed against the stored fields of the group being observed, which the
 * moving-load search emits consecutively. A repeat of an earlier, non-consecutive group (the same crane state listed
 * twice) is recognized by the exact group key and its 64-bit event hash: a false match then needs two different
 * events of that same group to share 64 hash bits, probability at most n/2^64 per event for a group of n events.
 */
export class EventDedup {
 private all=new HashSet64();private groups=new Set<string>();
 private group=new Float64Array(0);private recurring=false;
 // The events of the current group: their hash lanes and their fields (pooled, each from its start to the next).
 private los:number[]=[];private his:number[]=[];private starts:number[]=[];private pool=new Float64Array(1024);private used=0;
 /** Whether the event (its group fields first: `groupLength` of them) was seen; records it when not. */
 seen(f:KeyFields,groupLength:number){
  const v=f.values,n=f.length;
  let same=this.group.length===groupLength;
  for(let i=0;same&&i<groupLength;i++)same=this.group[i]===v[i];
  if(!same){
   this.group=v.slice(0,groupLength);
   const key=this.group.join();this.recurring=this.groups.has(key);this.groups.add(key);
   this.los.length=0;this.his.length=0;this.starts.length=0;this.used=0;
  }
  f.hash();
  for(let e=0;e<this.los.length;e++){
   if(this.los[e]!==f.lo||this.his[e]!==f.hi)continue;
   const a=this.starts[e],width=(e+1<this.starts.length?this.starts[e+1]:this.used)-a;if(width!==n)continue;
   let k=0;while(k<n&&this.pool[a+k]===v[k])k++;
   if(k===n)return true;
  }
  if(this.recurring&&this.all.has(f.lo,f.hi))return true;
  this.all.add(f.lo,f.hi);
  if(this.used+n>this.pool.length){const pool=new Float64Array(Math.max(2*this.pool.length,this.used+n));pool.set(this.pool.subarray(0,this.used));this.pool=pool;}
  this.los.push(f.lo);this.his.push(f.hi);this.starts.push(this.used);this.pool.set(v.subarray(0,n),this.used);this.used+=n;
  return false;
 }
}

/**
 * A bounded map from exact keys to values: open addressing on the 64-bit hash over typed arrays, the key fields pooled
 * in one Float64Array. A hit is confirmed against the stored fields, so a hash collision is a miss, never a wrong
 * value. At capacity the least recently used half is dropped in one pass (recency stamps), so a hit costs no reordering.
 */
export class KeyedCache<V> {
 private slots=new Int32Array(1024);private mask=1023;
 private lo=new Uint32Array(256);private hi=new Uint32Array(256);private start=new Int32Array(256);private width=new Int32Array(256);private stamp=new Float64Array(256);
 private values:V[]=[];private pool=new Float64Array(4096);private used=0;private count=0;private clock=0;
 constructor(readonly capacity:number){}
 get size(){return this.count;}
 private find(f:KeyFields){
  const n=f.length,v=f.values,pool=this.pool;
  for(let s=f.lo&this.mask;;s=(s+1)&this.mask){
   const i=this.slots[s]-1;if(i<0)return -1;
   if(this.lo[i]!==f.lo||this.hi[i]!==f.hi||this.width[i]!==n)continue;
   const a=this.start[i];let k=0;while(k<n&&pool[a+k]===v[k])k++;
   if(k===n)return i;
  }
 }
 get(f:KeyFields):V|undefined{const i=this.find(f);if(i<0)return undefined;this.stamp[i]=++this.clock;return this.values[i];}
 set(f:KeyFields,value:V){
  let i=this.find(f);if(i>=0){this.values[i]=value;this.stamp[i]=++this.clock;return;}
  if(this.count>=this.capacity)this.evict();
  if(this.count===this.lo.length)this.growEntries();
  if(this.used+f.length>this.pool.length){const pool=new Float64Array(Math.max(2*this.pool.length,this.used+f.length));pool.set(this.pool.subarray(0,this.used));this.pool=pool;}
  i=this.count++;this.lo[i]=f.lo;this.hi[i]=f.hi;this.start[i]=this.used;this.width[i]=f.length;this.stamp[i]=++this.clock;this.values[i]=value;
  this.pool.set(f.values.subarray(0,f.length),this.used);this.used+=f.length;
  if(2*this.count>this.mask+1)this.rehash(2*(this.mask+1));else this.place(i);
 }
 private place(i:number){let s=this.lo[i]&this.mask;while(this.slots[s])s=(s+1)&this.mask;this.slots[s]=i+1;}
 private rehash(size:number){this.slots=new Int32Array(size);this.mask=size-1;for(let i=0;i<this.count;i++)this.place(i);}
 private growEntries(){
  const n=2*this.lo.length,grow=<T extends Uint32Array|Int32Array|Float64Array>(a:T,make:(n:number)=>T)=>{const b=make(n);b.set(a);return b;};
  this.lo=grow(this.lo,n=>new Uint32Array(n));this.hi=grow(this.hi,n=>new Uint32Array(n));this.start=grow(this.start,n=>new Int32Array(n));this.width=grow(this.width,n=>new Int32Array(n));this.stamp=grow(this.stamp,n=>new Float64Array(n));
 }
 /** Keeps the more recently used half: entries and pool compacted in order, the slot table rebuilt. */
 private evict(){
  const keep=Math.max(1,Math.floor(this.count/2)),sorted=this.stamp.slice(0,this.count).sort(),threshold=sorted[this.count-keep];
  let j=0,used=0;
  for(let i=0;i<this.count;i++){
   if(this.stamp[i]<threshold)continue;
   this.pool.copyWithin(used,this.start[i],this.start[i]+this.width[i]);
   this.lo[j]=this.lo[i];this.hi[j]=this.hi[i];this.start[j]=used;this.width[j]=this.width[i];this.stamp[j]=this.stamp[i];this.values[j]=this.values[i];
   used+=this.width[i];j++;
  }
  this.values.length=j;this.count=j;this.used=used;this.rehash(this.mask+1);
 }
}

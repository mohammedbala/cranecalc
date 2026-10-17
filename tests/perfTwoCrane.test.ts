import {describe,expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {EventDedup,HashSet64,KeyedCache,KeyFields} from '../src/engine/numericKeys';
import {CaseRegistry} from '../src/engine/caseRegistry';
import type {RunwayCaseRecord} from '../src/engine/runwayDetails';

const root=fileURLToPath(new URL('..',import.meta.url));
/** One calculation in a child process with a 1.5 GB heap: its result line, or the failure. */
function calculateInChild(spec:object,budgetSeconds:number){
 const run=spawnSync(process.execPath,['--max-old-space-size=1536','--import','tsx','tests/fixtures/perfCalculate.ts',JSON.stringify(spec)],{cwd:root,encoding:'utf8',timeout:1000*(budgetSeconds+60),maxBuffer:1<<24});
 expect(run.error,String(run.error)).toBeUndefined();
 expect(run.status,run.stderr.slice(-2000)).toBe(0);
 return JSON.parse(run.stdout.trim().split('\n').at(-1)!) as {seconds:number;cpuSeconds:number;peakMB:number;errors:string[];cranes:number;detailCases:number;progress:{design:number;detailed:number;bad:number};analysis:{id:string;status?:string;value?:number}[]};
}
const fields=(...values:number[])=>{const f=new KeyFields();for(const v of values)f.push(v);return f;};
/** Every key collides: the stores must still tell the fields apart. */
class Colliding extends KeyFields{hash(){this.lo=12345;this.hi=678;return this;}}
const colliding=(...values:number[])=>{const f=new Colliding();for(const v of values)f.push(v);return f;};

describe('numeric dedup keys of the detailed collector',()=>{
 // Group fields: kind, crane count, then index, origin, loaded of each crane; then bin, wheels and the loads.
 const group=[0,2,0,1000,1,1,9000,0];
 it('merges exact repeats (-0 as 0, as the JSON keys did) and never two different events',()=>{
  const d=new EventDedup(),event=(...rest:number[])=>fields(...group,...rest);
  expect(d.seen(event(-1,2,500,100,10,9500,80,0),group.length)).toBe(false);
  expect(d.seen(event(-1,2,500,100,10,9500,80,0),group.length)).toBe(true);
  expect(d.seen(event(-1,2,500,100,10,9500,80,-0),group.length)).toBe(true);
  // One field one ulp apart, a different bin, a wheel fewer: different events.
  expect(d.seen(event(-1,2,500,100,10,9500,80+80*Number.EPSILON,0),group.length)).toBe(false);
  expect(d.seen(event(0,2,500,100,10,9500,80,0),group.length)).toBe(false);
  expect(d.seen(event(-1,1,500,100,10),group.length)).toBe(false);
  // The same loads with another crane state (the next group) are another event.
  const other=[0,2,0,1000,1,1,9000,1];
  expect(d.seen(fields(...other,-1,2,500,100,10,9500,80,0),other.length)).toBe(false);
  // The first crane state met again later: its events are repeats, a new one is not.
  expect(d.seen(event(-1,2,500,100,10,9500,80,0),group.length)).toBe(true);
  expect(d.seen(event(-1,2,500,100,11,9500,80,0),group.length)).toBe(false);
 });
 it('never takes a hash collision for a repeat',()=>{
  const d=new EventDedup(),g=[0,1,0,1000,1],h=[0,1,0,2000,1];
  expect(d.seen(colliding(...g,-1,1,500,100,10),g.length)).toBe(false);
  expect(d.seen(colliding(...g,-1,1,500,100,11),g.length)).toBe(false);
  expect(d.seen(colliding(...g,-1,1,500,100,10),g.length)).toBe(true);
  // Another crane state never seen before: a colliding hash from the earlier one is no repeat.
  expect(d.seen(colliding(...h,-1,1,500,100,10),h.length)).toBe(false);
  const cache=new KeyedCache<string>(10);
  cache.set(colliding(1,2,3).hash(),'a');
  expect(cache.get(colliding(1,2,3).hash())).toBe('a');
  expect(cache.get(colliding(1,2,4).hash())).toBeUndefined();
  expect(cache.get(colliding(1,2).hash())).toBeUndefined();
 });
 it('keeps the most recently used entries within its capacity',()=>{
  const cache=new KeyedCache<number>(4),key=(v:number)=>fields(v,v/3).hash();
  for(const v of [1,2,3,4])cache.set(key(v),v);
  expect(cache.get(key(1))).toBe(1);expect(cache.get(key(3))).toBe(3);
  // At capacity the less recently used half (2 and 4) leaves.
  cache.set(key(5),5);
  expect(cache.size).toBe(3);
  expect([1,2,3,4,5].map(v=>cache.get(key(v)))).toEqual([1,undefined,3,undefined,5]);
  for(let v=6;v<1000;v++)cache.set(key(v),v);
  expect(cache.size).toBeLessThanOrEqual(4);expect(cache.get(key(999))).toBe(999);
 });
 it('spreads distinct keys over the 64-bit hash space',()=>{
  const set=new HashSet64();let repeats=0;
  for(let i=0;i<200000;i++){const f=fields(0,1,0,i*25.4,1,-1,4,i*25.4,1e5,2e3,i*25.4+3048,1e5,-2e3).hash();if(!set.add(f.lo,f.hi))repeats++;}
  expect(repeats).toBe(0);expect(set.size).toBe(200000);
 });
});

describe('compact case registry',()=>{
 it('returns every record as registered',()=>{
  const r=new CaseRegistry(),records:[string,RunwayCaseRecord][]=[
   ['S-0-1524-1',{combination:'Single crane · static',cranes:[{index:0,origin:1524,loaded:true}],lateralSign:1}],
   ['D-1',{combination:'LRFD 1',cranes:[],lateralSign:1}],
   ['D-2',{combination:'LRFD 2a',cranes:[{index:0,origin:0,loaded:true},{index:1,origin:9144,loaded:false}],lateralSign:-1}],
   ['D-5',{combination:'LRFD 2a',cranes:[{index:0,origin:0,loaded:true},{index:1,origin:9144,loaded:false}],lateralSign:1}],
   ['D-9',{combination:'LRFD 8',cranes:[{index:0,origin:-300,loaded:true}],lateralSign:1,stop:'left'}],
   ['D-7',{combination:'LRFD 9',cranes:[{index:0,origin:600,loaded:false}],lateralSign:1}],
   ['X-1',{combination:'test',cranes:[{index:0,origin:1,loaded:true}],lateralSign:0.5}]];
  for(const [id,v] of records)r.set(id,v);
  for(const [id,v] of records){expect(r.has(id)).toBe(true);expect(JSON.stringify(r.get(id))).toBe(JSON.stringify(v));}
  expect(r.get('D-3')).toBeUndefined();expect(r.get('D-05')).toBeUndefined();expect(r.has('D-4')).toBe(false);
  expect(r.size).toBe(records.length);
 });
});

describe('two-crane runways within the browser memory',()=>{
 // The budgets are on the child's CPU time, which a shared machine's load does not inflate as it does wall time
 // (two 1-ton cranes on 2 x 15 ft: about 150 s CPU on this machine; the wall limit allows for a loaded machine).
 it('calculates a light two-crane runway with a 1.5 GB heap within its time budget',()=>{
  const r=calculateInChild({config:{cranes:2,capacity:1,craneSpan:30,control:'pendant',bays:2,span:15}},900);
  expect(r.errors).toEqual([]);expect(r.cranes).toBe(2);
  expect(r.cpuSeconds).toBeLessThan(300);expect(r.peakMB).toBeLessThan(1024);
  for(const id of ['detail-travel','detail-mesh'])expect(r.analysis.find(v=>v.id===id)?.status,id).toBe('pass');
  // calculate(input, {onProgress}): both searches report, each fraction in (0, 1].
  expect(r.progress.design).toBeGreaterThan(0);expect(r.progress.detailed).toBeGreaterThan(0);expect(r.progress.bad).toBe(0);
 },1000000);
 it.runIf(process.env.CRANECALC_PERF==='1')('calculates template t09 (two 5-ton cranes, five bays) in under 5 minutes below 2 GB',()=>{
  const r=calculateInChild({template:'t09'},1800);
  expect(r.errors).toEqual([]);
  expect(r.seconds).toBeLessThan(300);expect(r.peakMB).toBeLessThan(2048);
  for(const id of ['detail-travel','detail-mesh'])expect(r.analysis.find(v=>v.id===id)?.status,id).toBe('pass');
 },2000000);
});

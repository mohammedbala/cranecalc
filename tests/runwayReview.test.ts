import { describe, expect, it } from 'vitest';
import { runRunwayReview } from '../benchmarks/runwayReview';

describe('twelve runway review benchmarks',()=>{
 it('preserves external comparisons, independent mechanics checks and design export boundaries',()=>{
  const cases=runRunwayReview();
  expect(cases).toHaveLength(12);
  expect(new Set(cases.map(c=>c.id)).size).toBe(12);
  const expectedDifferences:Record<string,string[]>={
   '01':['Whole-section minor resistance','Impact moment vs printed sum','Static moment vs printed sum'],
   '02':['Moment vs DG7 printed example'],
   '11':['End web crippling','End web compression buckling'],
  };
  for(const c of cases){
   expect(c.rows.length).toBeGreaterThan(0);
   expect(c.rows.filter(r=>r.status==='DIFFERENCE').map(r=>r.label)).toEqual(expectedDifferences[c.id]??[]);
   if(c.snapshot){
    expect(c.snapshot.errors).toEqual([]);
    expect(c.snapshot.checks.filter(r=>r.group==='Analysis').every(r=>r.status==='pass')).toBe(true);
    expect(c.snapshot.eligible).toBe(['04','05'].includes(c.id));
   }
  }
  expect(cases.flatMap(c=>c.rows)).toHaveLength(78);
  expect(cases.find(c=>c.id==='08')!.rows.find(r=>r.label==='Far support reaction (uplift)')!.app).toBeLessThan(0);
  expect(cases.find(c=>c.id==='05')!.snapshot!.checks.find(r=>r.id==='vertical')!.status).toBe('fail');
  expect(cases.find(c=>c.id==='04')!.snapshot!.checks.find(r=>r.id==='vertical')!.status).toBe('pass');
 },60000);
});

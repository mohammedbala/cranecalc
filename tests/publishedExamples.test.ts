import {describe,it,expect} from 'vitest';
import {runPublishedExamples} from '../benchmarks/publishedExamples';
describe('additional published AISC comparisons',()=>{
 const cases=runPublishedExamples();
 it('retains twelve distinct input sets and the source values, without counting A/B methods twice',()=>{
  expect(cases).toHaveLength(12);
  expect(new Set(cases.map(c=>c.example)).size).toBe(12);
  expect(cases.flatMap(c=>c.rows)).toHaveLength(37);
  expect(cases.flatMap(c=>c.rows).filter(r=>r.status==='DIFFERENCE').map(r=>r.label)).toEqual([
   'Required Ix for L/360','LRFD major resistance','ASD major resistance','LRFD major resistance','ASD major resistance',
   'ASD minor resistance','ASD peak minor moment','LRFD resistance per pair length','ASD resistance per pair length',
   'LRFD tensile resistance','ASD reduced Fnt','LRFD group slip resistance','ASD group slip resistance',
  ]);
 });
 it('preserves conservative failing designs and the near-limit J.5 slip capacity',()=>{
  const find=(id:string,label:string)=>cases.find(c=>c.id===id)!.rows.find(r=>r.label===label)!.app;
  expect(find('AISC-05','LRFD major resistance')).toBeLessThan(266);
  expect(find('AISC-05','ASD major resistance')).toBeLessThan(184);
  expect(find('AISC-09','LRFD resistance per pair length')*16).toBeLessThan(300);
  expect(find('AISC-09','ASD resistance per pair length')*16).toBeLessThan(200);
  expect(find('AISC-12','LRFD group slip resistance')).toBeCloseTo(54.336,6);
  expect(find('AISC-12','ASD group slip resistance')).toBeCloseTo(36.224,6);
 });
});

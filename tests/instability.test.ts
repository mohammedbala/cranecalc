import {describe,expect,it} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {demonstrationProject} from '../src/engine/demonstration';

describe('girder that buckles below the applied load',()=>{
 it('reports a failed stability check instead of stopping the analysis',()=>{
  // Eight times the demonstration crane on the same W24X229 bays.
  const p=demonstrationProject();
  for(const c of p.cranes){for(const w of c.wheels){w.loaded*=8;w.unloaded*=8;w.lateral*=8;}if(c.design){c.design.ratedLoad*=8;c.design.trolleyWeight*=8;c.design.bridgeWeight*=8;c.design.drivenWheelLoad*=8;}}
  const s=calculate(p);
  expect(s.errors).toEqual([]);expect(s.eligible).toBe(false);
  const stability=s.checks.find(c=>c.id==='torsion-stability')!;
  expect(stability.status).toBe('fail');expect(stability.capacity!).toBeLessThan(1);
  expect(s.detailResults!.unstableCases).toBeGreaterThan(0);expect(stability.note).toContain('buckle below the applied load');
  // Unstable cases never lower a D/C: the checks that depend on their response fail with no capacity, and the load-height
  // flexure includes the case that buckles with its own multiplier (D/C at least 0.8/(0.9λ): its strength is at most φM_cr).
  const r=s.detailResults!,lambda=r.criticalMultiplier;expect(lambda).toBeLessThan(1);
  for(const id of ['torsion-normal','torsion-shear','rail-head','brace-member','brace-stiffness','stiffener-lateral-flexure','stiffener-combined-weld']){
   const c=s.checks.find(v=>v.id===id);if(!c)continue;
   expect(c.status,id).toBe('fail');expect(c.noCapacity,id).toBe(true);expect(c.utilization,id).toBe(Infinity);expect(c.note,id).toContain('unstable at the factored load');
  }
  const ties=s.checks.filter(c=>/^(flange-tie|tie)-/.test(c.id)&&!/fatigue/.test(c.id)&&c.quantity!=='length'&&c.demand!==undefined&&!['not-applicable','excluded'].includes(c.status));
  expect(ties.length).toBeGreaterThan(0);for(const c of ties)expect(c.noCapacity,c.id).toBe(true);
  const lh=s.checks.find(c=>c.id==='flexure-load-height')!;
  expect(lh.utilization!).toBeGreaterThanOrEqual((p.method==='LRFD'?.8/(.9*lambda):1.67*.8/lambda)*(1-1e-9));
 },900000);
});

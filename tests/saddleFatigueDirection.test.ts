import {describe,expect,it} from 'vitest';
import {templateProject} from '../src/engine/templates';
import {automaticFatigueDetails,braceSystem,createDetailCollector} from '../src/engine/detailAnalysis';
import {flangeTieGeometry} from '../src/engine/tieGeometry';
import {flangeTieResponse} from '../src/engine/flangeTieDesign';
import {sectionProperties} from '../src/engine/section';

/**
 * The direct flange saddle has two fatigue sites with different stress directions: the toes of its transverse end
 * fillets under the girder's longitudinal stress (SA, AISC A-3.1 item 7.1 by the saddle length along the runway), and the
 * end fillet terminations under the local flange bending across the flange from the tie force (SL, item 7.1 by the saddle
 * width across the flange: typically E′). The two ranges are never added.
 */
const inch=25.4,p=templateProject('t05'),g=flangeTieGeometry(p)!;
describe('saddle fatigue by stress direction (template:5 saddle)',()=>{
 it('registers the transverse points at Category E′ beside the longitudinal toes',()=>{
  expect(g.rootLength).toBeGreaterThan(4*inch);expect(g.attachment.saddleThickness).toBeGreaterThan(.8*inch);
  const f=automaticFatigueDetails(p),sa=f.filter(v=>v.id.startsWith('SA')),sl=f.filter(v=>v.id.startsWith('SL'));
  expect(sl.length).toBe(sa.length);expect(sl.length).toBeGreaterThan(0);
  for(const v of sl){expect(v.category).toBe('E1');expect(v.reference).toContain('across the flange');}
  // The toes keep the category of the 3 1/2 in length along the runway.
  for(const v of sa)expect(v.category).toBe(g.attachment.saddleLength<=Math.min(12*g.attachment.saddleThickness,4*inch)?'D':'E1');
 });
 it('puts the local flange bending range on the transverse points only, from their own tie force range in each bin',()=>{
  const c=createDetailCollector(p,sectionProperties(p.section),20),crane=p.cranes[0],L=p.spans[0],x0=L/2-crane.wheels.at(-1)!.offset/2;
  for(const sign of [1,-1]){
   const wheels=crane.wheels.map(w=>({x:x0+w.offset,p:w.loaded,h:sign*w.lateral}));
   const R1=wheels.reduce((a,w)=>a+w.p*(L-w.x)/L,0);
   c.observe({kind:'fatigue',id:`F${sign}`,combination:'fatigue',cranes:[{index:0,origin:x0,loaded:true}],horizontalCrane:0,lateralSign:sign,wheels,q:0,railTorquePerLength:0,axial:0,verticalReactions:[{x:0,r:R1},{x:L,r:wheels.reduce((a,w)=>a+w.p,0)-R1}]});
  }
  const r=c.finish(),local=flangeTieResponse(p,r.demands.braceFatigue).flange/braceSystem(p).cos;
  const sl=r.fatigue.filter(v=>v.id.startsWith('SL')&&v.x<L),sa=r.fatigue.filter(v=>v.id.startsWith('SA')&&v.x<L);
  expect(sl.length).toBeGreaterThan(0);
  for(const v of sl){
   expect(v.range).toBeGreaterThan(0);expect(v.range).toBeLessThanOrEqual(local*(1+1e-9));
   for(const b of v.bins)expect(b.minimum).toBeCloseTo(-b.maximum,9);
  }
  // The toes near the girder ends carry the girder's longitudinal stress range, far below the local flange bending.
  for(const v of sa)expect(v.range).toBeLessThan(.5*Math.min(...sl.map(w=>w.range)));
 },120000);
});

import {describe,expect,it} from 'vitest';
import {buildProject} from '../src/engine/configurator';
import {defaultRunwayConfig,type RunwayConfig} from '../src/engine/configInputs';
import {validateProject} from '../src/engine/calculate';
import {steppedColumnAnalysis,steppedColumnChecks} from '../src/engine/steppedColumn';
import {strutPathStiffness,strutShare} from '../src/engine/craneLevelStrut';
import {supportReactions} from '../src/engine/supportReactions';
import {sectionProperties} from '../src/engine/section';

/**
 * Round 7: the stepped column's crane-level strut on the girder line, designed here (craneLevelStrut.ts), instead of an
 * engineer-of-record dependency; the existing step fillets relieved or built up where they fail fatigue; the step cap
 * holding a continuous girder's runway-end bearing.
 */
const cfg=(c:Partial<RunwayConfig>):RunwayConfig=>({...defaultRunwayConfig,title:'Stepped',units:'US',method:'LRFD',scope:'design',cranes:1,system:'simple',girder:'capped',structure:'existing',support:'stepped-column',tie:'paired-bars',control:'cab',cmaa:'C',buildingClass:'C',...c});

describe('strut and column sharing the longitudinal force at the step',()=>{
 it('keeps equilibrium: the shares add to the force and the torques about the shear center balance',()=>{
  const kY=1600,Kt=5.4e7,yg=372,ys=403;
  for(const ks of [0,500,7600,1e6]){
   const r=strutShare(kY,Kt,ks,ys,yg);
   expect(r.keep+r.strut).toBeCloseTo(1,9);expect(r.torque+r.strut*ys).toBeCloseTo(yg,6);
   expect(r.move).toBeCloseTo(r.u+yg*r.theta,12);
  }
  // Without a strut the column takes it all at the girder offset; a stiff strut just outboard of the girder line leaves a small torque.
  expect(strutShare(kY,Kt,0,ys,yg).torque).toBeCloseTo(yg,6);
  expect(Math.abs(strutShare(kY,Kt,1e6,ys,yg).torque)).toBeLessThan(.1*yg);
 });
 it('puts the strut over its distance to the braced bay in series with the existing bracing',()=>{
  expect(strutPathStiffness(1e9,4572,7700)).toBeCloseTo(1/(4572/1e9+1/7700),9);
  expect(strutPathStiffness(1e9,0,Infinity)).toBe(1e12);
 });
});

describe('the configurator designs the strut where the column alone twists past its limits',()=>{
 // Sample case 065: a 10-ton cab crane on 15 ft bays, the column alone 38 times over the twist limit under the crane stop.
 const p=buildProject(cfg({capacity:10,craneSpan:88,bays:4,span:15,railElevation:32,cmaa:'C'}));
 const a=steppedColumnAnalysis(p,supportReactions(p,sectionProperties(p.section))),checks=steppedColumnChecks(p,a),check=(id:string)=>checks.find(v=>v.id===id)!;
 it('builds a valid project with the strut entered, its checks and the twist checks passing',()=>{
  expect(validateProject(p)).toEqual([]);
  expect(p.existingColumn!.longitudinalExit).toBe('girder-strut');
  const st=p.existingColumn!.step!.strut!;expect(st.shape).toMatch(/^W(8|10|12|14)X/);
  expect(a.result.twist!.alone.twist).toBeGreaterThan(.02*5);
  for(const id of ['step-strut-compression','step-strut-slenderness','step-strut-tension','step-strut-bolts','step-strut-plate','step-strut-column-bolts','step-strut-fit','step-strut-flange-holes','column-lower-twist','column-lower-twist-movement'])expect(check(id)?.status,id).toBe('pass');
  expect(checks.some(v=>v.id==='crane-level-strut')).toBe(false);
  expect(p.configurator!.selections!.find(v=>v.item==='Crane-level strut (girder line)')?.designed).toContain(st.shape);
 },300000);
 it('reports the bracing in series and the column share in the twist note',()=>{
  const n=check('column-lower-twist').note;
  expect(n).toMatch(/crane-level strut on the girder line/);expect(n).toMatch(/in series with the existing bracing/);
  const d=a.summary.support!.strut!.designed!;expect(d.at[d.grids[0]].ks).toBeLessThan(d.kb);
 });
});

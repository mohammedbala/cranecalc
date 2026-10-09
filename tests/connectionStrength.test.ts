import { describe,expect,it } from 'vitest';
import { bearingStiffener,blockShear,boltCapacity,boltProperties,elasticBoltGroup,parallelWeldGroup,plateBearing,plateMember } from '../src/engine/connectionStrength';
const inch=25.4,kip=4448.2216152605,ksi=6.894757293168;
describe('actual connection mechanics and AISC resistance',()=>{
 it('uses tabulated A325 pretension and slip resistance for a 3/4-inch two-plane connection',()=>{
  const b=boltCapacity({grade:'A325',diameter:.75*inch,planes:2,surface:'B',shear:0,tension:0,method:'LRFD'});
  expect(b.pretension/kip).toBeCloseTo(28,8);
  expect(b.slip/kip).toBeCloseTo(31.64,8);
  expect(b.shear/kip).toBeCloseTo(.75*54*Math.PI*.75**2/4*2,8);
  expect(b.tension/kip).toBeCloseTo(.75*90*Math.PI*.75**2/4,8);
  expect(b.hole/inch).toBeCloseTo(13/16,8);
  expect(boltProperties('A325',inch).hole/inch).toBeCloseTo(1.125,8);
 });
 it('reduces both tensile strength under shear and slip under applied tension',()=>{
  const p={grade:'A325' as const,diameter:.75*inch,planes:1 as const,surface:'A' as const,shear:12*kip,tension:8*kip,method:'LRFD' as const};
  const b=boltCapacity(p),Ab=Math.PI*.75**2/4;
  expect(b.FntPrime/ksi).toBeCloseTo(1.3*90-90*(12/Ab)/(.75*54),8);
  expect(b.slip/kip).toBeCloseTo(.3*(1.13*28-8),8);
  expect(boltCapacity({...p,method:'ASD'}).slip/kip).toBeCloseTo(.3*(1.13*28-1.5*8)/1.5,8);
  expect(boltCapacity({...p,tension:40*kip}).slip).toBe(0);
 });
 it('preserves force and moment equilibrium for an eccentric bolt group',()=>{
  const points=[{x:-50,y:-75},{x:50,y:-75},{x:-50,y:75},{x:50,y:75}];
  const r=elasticBoltGroup(points,{x:27000,y:52000,moment:6e6});
  expect(r.reduce((s,v)=>s+v.fx,0)).toBeCloseTo(27000,7);
  expect(r.reduce((s,v)=>s+v.fy,0)).toBeCloseTo(52000,7);
  expect(r.reduce((s,v)=>s+v.x*v.fy-v.y*v.fx,0)).toBeCloseTo(6e6,7);
  expect(Math.max(...r.map(v=>v.resultant))).toBeGreaterThan(Math.hypot(27000,52000)/4);
 });
 it('checks deformation-limited hole bearing and block shear on independent inch-unit paths',()=>{
  const b=plateBearing(.75*inch,13/16*inch,.5*inch,65*ksi,1.5*inch,3*inch,'LRFD');
  expect(b.capacity/kip).toBeCloseTo(.75*1.2*(1.5-13/32)*.5*65,7);
  // Two 5-in gross shear paths, two holes/side with terminal half deduction;
  // 3-in tension path; hole deduction includes the additional 1/16 in.
  const Agv=5*.5*2,Anv=(5-1.5*.875)*.5*2,Ant=(3-.875)*.5;
  const expected=.75*(Math.min(.6*65*Anv,.6*50*Agv)+.5*65*Ant);
  expect(blockShear(Agv*inch**2,Anv*inch**2,Ant*inch**2,50*ksi,65*ksi,'LRFD')/kip).toBeCloseTo(expected,7);
 });
 it('combines direct shear, eccentric in-plane moment and normal weld stress',()=>{
  const p={length:200,gauge:100,size:6,Fexx:490,method:'LRFD' as const,vx:0,vy:60000,normal:0,mx:0,my:0,mz:0};
  const direct=parallelWeldGroup(p);
  expect(direct.demand).toBeCloseTo(60000/(2*200*6/Math.sqrt(2)),8);
  expect(direct.capacity).toBeCloseTo(.75*.6*490,8);
  const eccentric=parallelWeldGroup({...p,mz:6e6,normal:25000,my:1e6});
  expect(eccentric.demand).toBeGreaterThan(direct.demand);
  expect(eccentric.demand).toBeCloseTo(Math.max(...eccentric.points.map(v=>Math.sqrt(v.tx**2+v.ty**2+v.normal**2))),8);
 });
 it('checks full-depth stiffener compression, fitted bearing and geometry',()=>{
  const s=bearingStiffener({width:100,thickness:16,cope:20,webThickness:12,webDepth:550,flangeThickness:20,loadedWidth:250,E:200000,Fy:345,method:'LRFD'});
  expect(s.A).toBe(4928);
  expect(s.bearingArea).toBe(2560);
  expect(s.bearing).toBeCloseTo(.75*1.8*345*2560,8);
  expect(s.compression.capacity).toBeLessThan(.9*345*s.A);
  expect(s.minimumThickness).toBe(10);
  const bar=plateMember(100,12,600,200000,345,450,60,'LRFD');
  expect(bar.stiffness).toBe(400000);
  expect(bar.compression.capacity).toBeLessThan(bar.tension);
 });
 it('rejects unsupported bolt sizes, missing geometry and impossible paths',()=>{
  expect(()=>boltProperties('A325',20)).toThrow(/supported nominal diameter/);
  expect(()=>blockShear(100,0,30,345,450,'LRFD')).toThrow(/positive/);
  expect(()=>parallelWeldGroup({length:20,gauge:100,size:6,Fexx:490,method:'LRFD',vx:1,vy:0,normal:0,mx:0,my:0,mz:0})).toThrow(/four times/);
 });
});

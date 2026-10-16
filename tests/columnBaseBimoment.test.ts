import {describe,expect,it} from 'vitest';
import {newColumnDemonstrationProject} from '../src/engine/demonstration';
import {supportReactions} from '../src/engine/supportReactions';
import {sectionProperties} from '../src/engine/section';
import {existingColumnSection} from '../src/engine/existingColumn';
import {anchorStrength,baseBimoment,basePlate,columnBaseActions,columnBaseAnalysis,flangeWeldDemand,type BaseAction} from '../src/engine/columnBase';
import {baseWarping,columnTorsion} from '../src/engine/newColumnBracing';

const inch=25.4,kip=4448.2216152605;

/**
 * The column torsion model and the base it relies on are one model: warping free at the base by default (Saint-Venant
 * torsion, no bimoment), or restrained against warping, when the base plate, its flange welds and the anchor rods are
 * designed for the bimoment B = T a tanh(z/a) as opposite flange lateral moments B/h0 (AISC Design Guide 9).
 */
describe('column base and the warping restraint of the torsion model',()=>{
 const p=newColumnDemonstrationProject(),column=existingColumnSection(p).section,props=sectionProperties(column),R=supportReactions(p,sectionProperties(p.section));
 it('carries no bimoment with a warping-free base, the matching bimoment with a restrained one',()=>{
  const free=columnTorsion(column,10*kip*inch,200*inch,'warping-free'),fixed=columnTorsion(column,10*kip*inch,200*inch,'warping-restrained');
  expect(free.B).toBe(0);expect(free.stress).toBe(0);expect(free.shear).toBeCloseTo(10*kip*inch*column.tf/props.J,9);
  expect(fixed.B).toBeCloseTo(baseWarping(column,10*kip*inch,200*inch).B,6);
  // The restraint stiffens the column against twist.
  expect(fixed.twist).toBeLessThan(free.twist);expect(fixed.Ktheta).toBeGreaterThan(free.Ktheta);
  for(const a of columnBaseActions(p,R,'LRFD').flatMap(s=>s.actions))expect(a.bimoment).toBeUndefined();
 });
 it('designs the plate halves, flange welds and rods for the bimoment',()=>{
  const q=structuredClone(p);q.existingColumn!.torsionBase='warping-restrained';
  const b=q.columnBase!,a=columnBaseActions(q,R,'LRFD')[1].actions.find(v=>v.bimoment)!;
  expect(a.bimoment).toBeGreaterThan(0);
  // Each half of the plate beside the web: P/2 and M/2 + 2B/bf on width B/2.
  const r=basePlate(q,b,a,'LRFD'),half={...structuredClone(b),plate:{...b.plate,B:b.plate.B/2}};
  const plain:BaseAction={...a,bimoment:undefined,P:a.P/2,Mx:a.Mx/2+2*a.bimoment!/column.bf};
  const h=basePlate(q,half,plain,'LRFD');
  expect(r.couple).toBeCloseTo(2*a.bimoment!/column.bf,6);expect(r.tRequired).toBeCloseTo(h.tRequired,9);expect(r.bearing).toBeCloseTo(h.bearing,9);
  expect(r.rodT).toBeCloseTo(h.T/Math.max(1,b.anchors.perRow/2),6);
  // Flange welds: F_f plus M_fl L_w/S_w, M_fl = B/h0, S_w of the outer and inner fillet lines about the flange center.
  const w=flangeWeldDemand(q,b,a,props.A),Ff=a.Mx/(column.d-column.tf)-a.P*column.bf*column.tf/props.A,Mfl=a.bimoment!/(column.d-column.tf);
  const Sw=(column.bf**3/12+2*((column.bf/2)**3-(column.tw/2)**3)/3)/(column.bf/2);
  expect(baseBimoment(q,b,a.bimoment!).Mfl).toBeCloseTo(Mfl,6);
  expect(w.demand).toBeCloseTo(Math.max(0,Ff)+Mfl*(2*column.bf-column.tw)/Sw,3);
  // The base checks report the bimoment where it governs.
  const base=columnBaseAnalysis(q,R),gov=(base.supports??[base]).find(v=>v.plate.weld.Mfl)!;
  expect(gov.plate.weld.Mfl).toBeGreaterThan(0);
 });
 it('adds the torque shear to each rod as a vector and reports the most loaded rod',()=>{
  const b=structuredClone(p.columnBase!),n=b.anchors.perRow,row=b.plate.N/2-b.anchors.edge,g=b.anchors.gauge;
  const rods=Array.from({length:n},(_,i)=>n>1?-g/2+i*g/(n-1):0).flatMap(y=>[[row,y],[-row,y]]),J=rods.reduce((s,[u,v])=>s+u*u+v*v,0),m=rods.length;
  const T=20*kip*inch,Vx=8*kip;
  const r=anchorStrength(b,0,Vx,0,false,T);
  const by=rods.map(([u,v])=>Math.hypot(Vx/m-T*v/J,T*u/J));
  expect(r.V).toBeCloseTo(m*Math.max(...by),6);
  // Torque alone: the group-equivalent shear n T r_max / Σr².
  expect(anchorStrength(b,0,0,0,false,T).V).toBeCloseTo(m*T*Math.hypot(row,g/2)/J,6);
  // Larger than adding the torque shear to the shear along the runway as a scalar would give for this rod.
  expect(r.V).toBeGreaterThan(Math.hypot(Vx,0));
 });
 it('reports the anchor shear and tension each at its own worst action',()=>{
  const base=columnBaseAnalysis(p,R);
  for(const s of base.supports??[base]){
   expect(s.anchorShear!.V/s.anchorShear!.phiVn).toBeGreaterThanOrEqual(s.anchors.V/s.anchors.phiVn-1e-12);
   expect(s.anchorTension!.T/s.anchorTension!.phiNn).toBeGreaterThanOrEqual(s.anchors.T/s.anchors.phiNn-1e-12);
  }
 });
});

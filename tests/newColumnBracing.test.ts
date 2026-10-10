import {describe,expect,it} from 'vitest';
import {calculate,validateProject} from '../src/engine/calculate';
import {newColumnDemonstrationProject} from '../src/engine/demonstration';
import {existingColumnSection} from '../src/engine/existingColumn';
import {columnBaseActions} from '../src/engine/columnBase';
import {alongSeismic,baseWarping,bracingGeometry,bracingLayout,bracingSystemChecks,braceCases,girderOffset,strutProperties,webYieldLine} from '../src/engine/newColumnBracing';
import {sectionProperties} from '../src/engine/section';
import {drawingSheetSet,detailReferences} from '../src/components/planSheet';
import {compactReport} from '../src/report/compactReport';
import type {ProjectInput} from '../src/engine/types';

const inch=25.4,foot=304.8,ksi=6.894757293168;
const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')).join(' ');
const p=newColumnDemonstrationProject(),s=calculate(p),check=(id:string)=>s.checks.find(c=>c.id===id);
const column=existingColumnSection(p).section;

describe('rod X-bracing between new freestanding columns',()=>{
 it('designs the rods, connections, strut, collector and seismic along the runway with every check passing',()=>{
  expect(s.errors).toEqual([]);expect(s.eligible).toBe(true);
  expect(s.checks.filter(c=>c.status==='fail').map(c=>c.id)).toEqual([]);
  for(const id of ['brace-tension','brace-pin','brace-pin-bearing','brace-gusset-rupture','brace-gusset-tearout','brace-gusset-yield','brace-gusset-weld','brace-column-web',
   'brace-strut','brace-strut-slenderness','brace-strut-tension','brace-strut-bolts','brace-strut-bearing','brace-strut-block','brace-strut-tab','brace-seat-weld','brace-collector-bearing',
   'brace-seismic-basis','brace-seismic-drift','brace-separation','column-torsion','base-uplift','brace-rod-crossing','brace-offset-gusset','brace-rod-torsion'])expect(check(id)?.status,id).toBe('pass');
  // Nothing of the new structure is left to others.
  expect(s.checks.some(c=>c.id==='supporting-structure'||c.id==='brace-by-others')).toBe(false);
 });
 it('develops the rod at every rod end: pin, gusset at the pin and Whitmore section by hand',()=>{
  const b=p.longitudinalBracing!,d=b.design!,g=s.bracingSystem!.geometry,Ab=Math.PI*b.rod.diameter**2/4;
  const T=Math.min(.75*.75*b.rod.Fu*Ab,.9*b.rod.Fy*Ab);
  expect(s.bracingSystem!.develop).toBeCloseTo(T,6);
  for(const id of ['brace-pin','brace-pin-bearing','brace-gusset-rupture','brace-gusset-tearout','brace-gusset-yield'])expect(check(id)!.demand).toBeCloseTo(T,6);
  const t=d.gusset.thickness,dp=d.pin.diameter,beff=2*t+.63*inch;
  expect(check('brace-pin')!.capacity).toBeCloseTo(.75*.6*d.pin.Fu*2*Math.PI*dp**2/4,6);
  expect(check('brace-pin-bearing')!.capacity).toBeCloseTo(.75*1.8*d.gusset.Fy*t*dp,6);
  expect(check('brace-gusset-rupture')!.capacity).toBeCloseTo(.75*d.gusset.Fu*2*t*beff,6);
  // AISC D5.2: plate width at the hole at least 2be + d, extension beyond the hole at least 1.33be.
  expect(g.width).toBeGreaterThanOrEqual(2*beff+g.dh-1e-9);expect(g.a).toBeGreaterThanOrEqual(1.33*beff-1e-9);
  expect(check('brace-gusset-tearout')!.capacity).toBeCloseTo(.75*.6*d.gusset.Fu*2*t*(g.a+dp/2),6);
  // Pins clear the column flange tips and the strut by the clevis envelope, on the rod line through the work points.
  const L=bracingLayout(p);
  expect(g.top.pin[0]).toBeGreaterThanOrEqual(column.bf/2+1.5*dp-1e-9);expect(-g.top.pin[1]).toBeGreaterThanOrEqual(g.strut.d/2+1.5*dp);
  expect(g.top.pin[1]/g.top.pin[0]).toBeCloseTo(-L.height/L.width,9);expect(g.bottom.pin[1]/g.bottom.pin[0]).toBeCloseTo(L.height/L.width,9);
  // The web yield line strip between the flanges.
  const c=s.bracingSystem!.outlines.welds.upper.to-s.bracingSystem!.outlines.welds.upper.from;
  expect(webYieldLine(column,c,'LRFD')).toBeCloseTo(.9*8*column.Fy*column.tw**2/4*c/(column.d-2*column.tf),6);
 });
 it('takes the braced span and work points from the runway and the column seat',()=>{
  const L=bracingLayout(p),r=s.longitudinalBracing!;
  expect(L.spans).toEqual([2]);expect(L.width).toBeCloseTo(25*foot,6);expect(L.height).toBeCloseTo(p.existingColumn!.seatElevation,6);
  expect(L.braced).toEqual([0,1,1,0]);expect(L.locating).toEqual([true,true,true,false]);
  expect(r.geometry).toMatchObject({bays:1,tiers:1,spans:[2]});expect(r.length).toBeCloseTo(Math.hypot(L.width,L.height),6);
 });
 it('loads the braced columns and bases with the rod forces and the locating columns with the girder torque',()=>{
  const reactions=s.supportReactions!,L=bracingLayout(p),e=girderOffset(p),Cbs=p.cranes[0].design!.bumperForce;
  const [base1,base2,,base4]=columnBaseActions(p,reactions,'LRFD'),V=Cbs*L.height/L.width,sp=reactions.supports[1];
  const comp=base2.actions.find(a=>a.id==='LRFD AIST bumper · brace')!,lift=base2.actions.find(a=>a.id==='LRFD AIST bumper · brace uplift')!;
  const dead=sp.D+sectionProperties(column).weight*p.existingColumn!.height;
  expect(comp.P).toBeCloseTo(1.2*dead+1.2*sp.Cd+sp.Cv+V,3);expect(comp.Vy).toBe(0);expect(comp.torque).toBeCloseTo(Cbs*e,3);
  expect(lift.P).toBeCloseTo(1.2*dead+1.2*Math.min(0,sp.craneMinimum)-V,3);expect(lift.uplift).toBeCloseTo(V,3);expect(lift.Vy).toBeCloseTo(Cbs,3);
  // The offset rod (upper end at grid 3) lands on the grid 2 base off the column centerline: its torque adds there.
  expect(lift.torque).toBeCloseTo(Cbs*e+Cbs*bracingGeometry(p,column).cross.offset,3);
  // Grid 1 locates its girder but is not braced; grid 4 does neither.
  expect(base1.actions.some(a=>a.id.endsWith('brace uplift'))).toBe(false);expect(base1.actions.find(a=>a.id==='LRFD AIST bumper · brace')!.torque).toBeCloseTo(Cbs*e,3);
  expect(base4.actions.some(a=>a.id.includes('· brace'))).toBe(false);
  // DG9 cantilever: B = T a tanh(z/a) at the fixed base, fw = B Wno / Cw.
  const t=s.existingColumn!.torsion!,props=sectionProperties(column),a=Math.sqrt(column.E*props.Cw/(column.E/2.6*props.J));
  expect(t.case.id).toBe('LRFD AIST bumper');expect(t.T).toBeCloseTo(Cbs*e,3);
  const w=baseWarping(column,t.T,p.existingColumn!.seatElevation);
  expect(w.a).toBeCloseTo(a,6);expect(t.stress).toBeCloseTo(t.T*a*Math.tanh(p.existingColumn!.seatElevation/a)*(props.h0*column.bf/4)/props.Cw,6);
  expect(check('column-torsion')!.demand).toBeGreaterThan(check('column-interaction')!.demand!);
 });
 it('calculates the seismic force along the runway, the drift and the separation from the building',()=>{
  const z=alongSeismic(p,s.supportReactions!,column)!,cross=p.existingColumn!.seismic!;
  expect(z.basis).toMatchObject({R:3,Omega0:3,Cd:3,rho:1});expect(z.basis.Cs).toBeCloseTo(Math.max(cross.SDS*cross.Ie/3,.01),9);
  const W=s.supportReactions!.supports.reduce((a,v)=>a+v.D,0)+p.cranes[0].wheels.reduce((a,w)=>a+w.unloaded,0)+4*sectionProperties(column).weight*p.existingColumn!.height+strutProperties(p).weight*75*foot;
  expect(z.weight).toBeCloseTo(W,3);expect(z.QE).toBeCloseTo(z.basis.Cs*W,3);expect(z.overstrength).toBe(false);
  // The seismic case is a line force on the rods: (1.2 + 0.2SDS)D + QE + L.
  const k=braceCases(p,s.supportReactions!,'LRFD',z).find(v=>v.id==='LRFD 6-E along')!;
  expect(k.H).toBeCloseTo(z.QE+s.supportReactions!.Cls,3);expect(s.longitudinalBracing!.combinations.some(c=>c.id==='LRFD 6-E along')).toBe(true);
  const sep=s.bracingSystem!.separation!;
  expect(sep.building).toBeCloseTo(1.5*inch,6);expect(sep.buildingEntered).toBe(true);
  expect(sep.required).toBeCloseTo(Math.hypot(Math.max(sep.across,sep.along),sep.building),9);
  expect(sep.along).toBeCloseTo(s.bracingSystem!.seismic!.drift,9);
 });
 it('passes the two rods of the X in parallel planes, one offset by the strut web and a filler',()=>{
  const g=bracingGeometry(p,column),b=p.longitudinalBracing!,d=b.design!,cr=g.cross,r=s.bracingSystem!;
  // Rod B's plane: the gusset thickness, the strut web and the filler from rod A's, at least 1/4 in clear of it.
  expect(cr.offset).toBeCloseTo(d.gusset.thickness+g.strut.tw+cr.filler,9);expect(cr.clear).toBeGreaterThanOrEqual(inch/4-1e-9);
  expect(cr.filler/(inch/16)).toBeCloseTo(Math.round(cr.filler/(inch/16)),9);expect(cr.offset-inch/16-b.rod.diameter).toBeLessThan(inch/4);
  expect(check('brace-rod-crossing')!.capacity).toBeCloseTo(cr.offset,9);
  // J5.2(b): a filler over 1/4 in reduces the strut bolt shear.
  expect(check('brace-strut-bolts')!.note).toContain('filler lies under the strut web');
  if(cr.filler>inch/4)expect(check('brace-strut-bolts')!.equation).toContain('0.4(t_f-0.25)');
  // The strut force acts off rod B's gusset by the offset less the lap; the rod's torque adds to the column torsion.
  expect(check('brace-offset-gusset')!.note).toMatch(/acts e = [\d.]+ in off the gusset plane/);
  expect(r.rodTorsion!.T).toBeCloseTo(r.strutForce.H/r.layout.spans.length*cr.offset,6);expect(r.rodTorsion!.U).toBeGreaterThan(r.rodTorsion!.base);
 });
 it('checks the bracket seat fillet for the girder force and its couple',()=>{
  const d=p.longitudinalBracing!.design!,br=p.details!.bracket!,F=s.bracingSystem!.seatForce.F,Lw=Math.min(br.seatLength,column.bf)-inch/2,e=girderOffset(p)-column.d/2;
  expect(F).toBeCloseTo(p.cranes[0].design!.bumperForce,3);
  expect(check('brace-seat-weld')!.demand).toBeCloseTo(Math.hypot(F/Lw,6*F*e/Lw**2),6);
  expect(check('brace-seat-weld')!.capacity).toBeCloseTo(.75*.6*70*ksi*d.seatWeld/Math.SQRT2,6);
 });
 it('reports rod bracing along the runway in SDC D unsupported and rejects inputs it cannot design',()=>{
  const r=s.bracingSystem!,checks=bracingSystemChecks(p,{...r,seismic:{...r.seismic!,permitted:false}},column);
  expect(checks.find(c=>c.id==='brace-seismic-basis')!.status).toBe('unsupported');
  const errs=(change:(q:ProjectInput)=>void)=>{const q=newColumnDemonstrationProject();change(q);return validateProject(q);};
  expect(errs(q=>{q.longitudinalBracing!.system='angle-x';}).some(e=>e.startsWith('longitudinalBracing.system:'))).toBe(true);
  expect(errs(q=>{q.longitudinalBracing!.tiers=2;}).some(e=>e.startsWith('longitudinalBracing.tiers:'))).toBe(true);
  expect(errs(q=>{q.longitudinalBracing!.existing.W=1000;}).some(e=>e.startsWith('longitudinalBracing.existing:'))).toBe(true);
  expect(errs(q=>{q.longitudinalBracing!.design!.spans=[4];}).some(e=>e.startsWith('longitudinalBracing.design.spans:'))).toBe(true);
  expect(errs(q=>{q.spans=[25*foot,20*foot,25*foot];q.longitudinalBracing!.design!.spans=[1,2];}).some(e=>e.includes('same length'))).toBe(true);
  expect(errs(q=>{q.longitudinalBracing!.design!.strut.shape='W99X1';}).some(e=>e.startsWith('longitudinalBracing.design.strut.shape:'))).toBe(true);
  expect(errs(q=>{q.longitudinalBracing!.design!.pin.diameter=.5*inch;}).some(e=>e.startsWith('longitudinalBracing.design.pin.diameter:'))).toBe(true);
  expect(errs(()=>{})).toEqual([]);
  // Gussets stay clear of the strut: the plate outline never enters the strut beyond its coped flanges.
  const g=bracingGeometry(p,column),cope=g.strut.end+g.strut.cope;
  for(const [x,z] of r.outlines.upper)expect(x<cope||Math.abs(z)>g.strut.d/2).toBe(true);
 });
 it('draws the bracing on S-01 and details it, with its design data and the separation',()=>{
  const set=drawingSheetSet(s),s01=set[1].svg,all=set.map(v=>texts(v.svg)).join(' ');
  expect(s01).toContain('data-elevation-bracing="true"');expect(s01).toContain('data-bracing="plan"');
  expect(texts(s01)).toContain('3/4" DIA. ROD X-BRACING, GRIDS 2-3, BOTH RUNWAYS');
  expect(texts(s01)).toContain('W8X24 STRUT ON COLUMN LINE, ALL SPANS');
  expect(texts(s01)).toMatch(/SEISMIC SEPARATION: KEEP ALL RUNWAY STEEL 0'-1 5\/8" MIN\. CLEAR/);
  const sheet=set.find(v=>v.svg.includes('data-view="braced-bay-elevation"'))!;
  for(const view of ['brace-top-connection','brace-base-connection','strut-plan','bracing-notes'])expect(sheet.svg).toContain(`data-view="${view}"`);
  expect(texts(sheet.svg)).toContain('BRACING DESIGN DATA');expect(texts(sheet.svg)).toContain('DEVELOP THE ROD');
  const refs=detailReferences(set);
  for(const title of ['BRACED BAY / ELEVATION','BRACE AND STRUT AT WORK POINT','BRACE AT COLUMN BASE','STRUT AND GUSSETS AT WORK POINT / PLAN'])expect(refs.get(title)).toMatch(new RegExp(`^\\d+/${sheet.number}$`));
  expect(all).not.toContain('NOT IN SET');
  // The isometric draws the rods and strut as new steel.
  expect(set[1].svg.match(/data-view="isometric"[\s\S]*?<\/g>/)![0].length).toBeGreaterThan(0);
  expect(compactReport(s,'')).toContain('06D / Bracing connections, strut and seismic along the runway');
 });
});

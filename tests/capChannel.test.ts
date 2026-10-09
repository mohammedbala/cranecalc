import {describe,it,expect} from 'vitest';
import {exampleProject} from '../src/engine/defaults';
import {loadCappedSection,matchesCappedSection,aiscChannels} from '../src/data/aiscChannels';
import {loadAiscSection} from '../src/data/aiscSections';
import {cappedElasticProperties,cappedTorsionResearch} from '../src/engine/capChannel';
import {sectionProperties} from '../src/engine/section';
import {validateProject,calculate} from '../src/engine/calculate';
import {runwayDesignAnalysis} from '../src/engine/designAnalysis';
import {girderStrength} from '../src/engine/aiscStrength';
import {emptyAistInputs} from '../src/engine/aistLoads';
const cap=(w:string,c='C15X33.9')=>loadCappedSection(exampleProject.section,w,c);
describe('catalogue cap-channel assessment',()=>{
 it('reproduces DG7 Table A-1 elastic properties within published rounding',()=>{
  // Original supplied third-edition guide, printed p.115. These are published
  // rounded values, independent of the v16 component transformation.
  const fixtures=[
   {w:'W30X99',c:'C15X33.9',Ix:5550,It:380,cy:18.5,Sb:300,St:481},
   {w:'W24X84',c:'C15X33.9',Ix:3340,It:362,cy:15.4,Sb:217,St:367},
   {w:'W24X84',c:'C12X20.7',Ix:3030,It:176,cy:14.3,Sb:211,St:302},
  ];
  for(const f of fixtures){const s=cappedElasticProperties(cap(f.w,f.c))!;
   for(const [actual,expected] of [[s.Ix/25.4**4,f.Ix],[s.topI/25.4**4,f.It],[s.cy/25.4,f.cy],[s.Sbottom/25.4**3,f.Sb],[s.Stop/25.4**3,f.St]])
    expect(Math.abs(actual/expected-1)).toBeLessThan(.005);
  }
 });
 it('retains component centroid offsets, rotated axes and nominal assembly weight',()=>{
  const s=cappedElasticProperties(cap('W30X99'))!;
  // Independently substituted catalogue US values: A=29+10, yc=29.7+.4-.788.
  expect(s.A/25.4**2).toBeCloseTo(39,12);
  expect(s.cy/25.4).toBeCloseTo(18.55820512820513,10);
  expect(s.Ix/25.4**4).toBeCloseTo(5553.283814358975,8);
  expect(s.Iy/25.4**4).toBeCloseTo(443,10);
  expect(s.nominalWeight).toBe(132.9);
  const p=sectionProperties(cap('W30X99'));expect(p.Ix).toBe(s.Ix);expect(p.Iy).toBe(s.Iy);
  expect(p.Cw).toBeGreaterThan(0); // Integrated median-line model; no empirical research fit.
  expect(p.Cw).not.toBe(cappedTorsionResearch(cap('W30X99'))!.Cw);
 });
 it('retains the square root in the research Cw formula and bounds applicability',()=>{
  const r=cappedTorsionResearch(cap('W30X99'))!;
  expect(r.Cw/25.4**6).toBeCloseTo(49342.12837056,6);
  expect(r.J/25.4**4).toBeCloseTo(7.79098,8);
  expect(r.beta/25.4).toBeCloseTo(19.42476298,7);
  expect(cappedTorsionResearch(cap('W24X250'))).toBeNull(); // Ac/Aw < .20
  expect(cappedElasticProperties(cap('W30X99','C3X4.1'))).toBeNull(); // Legs cannot fit
 });
 it('reproduces an independent center-load flange-couple displacement for the cap',()=>{
  const p=structuredClone(exampleProject),inch=25.4,kip=4448.221615,L=300;
  p.section=cap('W30X99');p.section.E=29000*6.894757293;p.spans=[L*inch];
  p.lateralBraceSpacing=p.unbracedLength=L*inch;p.railHeight=6*inch;p.railEccentricity=.25*inch;
  p.aist={...emptyAistInputs,bottomBraceSpacing:L*inch};
  p.cranes=[{...p.cranes[0],travelStart:L*inch/2,travelEnd:L*inch/2,wheels:[{offset:0,loaded:20*kip,unloaded:8*kip,lateral:2*kip}]}];
  const props=sectionProperties(p.section),a=runwayDesignAnalysis(p,props,girderStrength(p,props),8,40);
  // Direct statics of two flange beams, followed by PL^3/(48EI), in US units.
  const topY=(10.5*.670*(29.7-.670/2)+10*(29.7+.4-.788))/(10.5*.670+10);
  const h=topY-.670/2,It=.670*10.5**3/12+315;
  const topForce=20*.25/h+2*(29.7+.4+6-.670/2)/h;
  expect(a.singleLateral/inch).toBeCloseTo(topForce*L**3/(48*29000*It),7);
  expect(a.singleVertical/inch).toBeCloseTo(20*L**3/(48*29000*5553.283814358975),7);
  // This validates first-order elastic mechanics only; cap design remains gated.
 });
 it('rejects tampered catalogue combinations and retains complete-design gates',()=>{
  const p=structuredClone(exampleProject);p.section=cap('W30X99');
  expect(matchesCappedSection(p.section)).toBe(true);expect(validateProject(p)).toEqual([]);
  const r=calculate(p);expect(r.eligible).toBe(false);expect(r.checks.some(c=>c.status==='unsupported')).toBe(true);
  p.section.capTw+=1;expect(validateProject(p).join()).toContain('catalogue');
  expect(loadAiscSection(cap('W30X99'),'W24X84').capCatalogueId).toBeUndefined();
  expect(aiscChannels).toHaveLength(72);
 });
});

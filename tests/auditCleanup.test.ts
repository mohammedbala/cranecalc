import {describe,expect,it} from 'vitest';
import {exampleProject} from '../src/engine/defaults';
import {format} from '../src/engine/units';
import {references} from '../src/engine/references';
import {girderStrength} from '../src/engine/aiscStrength';
import {sectionProperties} from '../src/engine/section';
import {loadCappedSection} from '../src/data/aiscChannels';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {automaticFatigueDetails} from '../src/engine/detailAnalysis';

describe('audit cleanup',()=>{
 it('prints the US defaults as entered, not as converted SI values',()=>{
  const s=exampleProject.section;
  expect(format(s.Fy,'stress','US')).toMatch(/^50(\.0+)? ksi$/);expect(format(s.Fu,'stress','US')).toMatch(/^65(\.0+)? ksi$/);
  expect(format(s.E,'stress','US')).toMatch(/^29,000(\.0+)? ksi$/);
 });
 it('cites standards without mirror, draft or paid-file links',()=>{
  for(const r of references)expect(r.url).not.toMatch(/openpdfs|TR1319|\.docx|cloud\.aisc\.org\/ecom|flygtf/);
 });
 it('rates a capped girder web as the rolled web it is, and its cap ends as E′',()=>{
  const p=structuredClone(exampleProject);p.section=loadCappedSection(p.section,'W30X99','C15X33.9');
  const s=girderStrength(p,sectionProperties(p.section));expect(s.shearPhi).toBe(1);expect(s.Cv).toBe(1);
  const q=cappedDemonstrationProject();
  const ends=automaticFatigueDetails(q).filter(f=>f.id.startsWith('CE'));
  expect(ends.length).toBeGreaterThan(0);expect(ends.every(f=>f.category==='E1')).toBe(true);
 });
});

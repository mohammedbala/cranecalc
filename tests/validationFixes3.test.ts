import {beforeAll,describe,it,expect} from 'vitest';
import {calculate,validateProject} from '../src/engine/calculate';
import {exampleProject} from '../src/engine/defaults';
import {cappedDemonstrationProject,demonstrationProject} from '../src/engine/demonstration';
import {startDetailedDesign,neutralDetails} from '../src/engine/detailTemplate';
import {railLayout} from '../src/engine/railLayout';
import {stiffenerTieGeometry} from '../src/engine/tieGeometry';
import {drawingLength} from '../src/components/drawingFormat';
import {drawingSheetSet} from '../src/components/planSheet';
import type {CalculationSnapshot} from '../src/engine/types';

const inch=25.4;
let snapshot:CalculationSnapshot;
beforeAll(()=>{const p=structuredClone(exampleProject);p.scope='analysis';snapshot=calculate(p);},120000);

describe('validation fixes, third batch',()=>{
 it('lays out the rail joints the same in either display unit',()=>{
  const p=cappedDemonstrationProject();p.spans=[...p.spans,...p.spans];
  const us=railLayout({...p,units:'US'}),si=railLayout({...p,units:'SI'});
  expect(si.rails).toEqual(us.rails);
  // Cut pieces are multiples of 5 in (127 mm); full mill lengths stay uncut.
  for(const r of us.rails)for(const piece of r.pieces.slice(1,-1))expect(Math.abs(piece/127-Math.round(piece/127))<1e-9||Math.abs(piece-39*12*inch)<1e-6).toBe(true);
 });
 it('prints equal lengths alike however they were summed',()=>{
  expect(drawingLength(18000-(18000-450.65),'SI')).toBe(drawingLength(450.65,'SI'));
 });
 it('starts the detailed design with joint bars inside the rail web and a net flange area within the section',()=>{
  for(const h of [3.5,4,5,6,8].map(v=>v*inch)){
   const p=demonstrationProject();p.railHeight=h;if(p.aist)p.aist.railDepth=h;
   const r=neutralDetails(p).rail;expect(r.jointPlateHeight).toBeLessThanOrEqual(h-r.headThickness-r.baseThickness);
  }
  // A net area left from a heavier section no longer blocks validation after the section changes.
  const p=demonstrationProject();p.aist!.netFlangeArea=p.section.bf*p.section.tf*3;
  const q=startDetailedDesign(p);expect(q.aist!.netFlangeArea).toBeCloseTo(q.section.bf*q.section.tf,6);
  expect(validateProject(q).some(e=>e.includes('netFlangeArea'))).toBe(false);
 });
 it('drops capped stiffener-tie bars below the cap channel flanges',()=>{
  const p=cappedDemonstrationProject();p.system='continuous';p.details!.brace.flangeAttachment!.enabled=false;
  const g=stiffenerTieGeometry(p)!,s=p.section;
  expect(s.d/2-g.topCenter-g.height/2).toBeGreaterThanOrEqual(s.capDepth-s.capTw);
  expect(validateProject(p).filter(e=>e.includes('cap channel'))).toEqual([]);
 });
 it('states the multiple-crane basis and the rail criteria on S-00',()=>{
  const p=cappedDemonstrationProject();p.cranes.push({...structuredClone(p.cranes[0]),id:'cr-2'});
  const words=(svg:string)=>svg.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  const cover=words(drawingSheetSet({...snapshot,input:p}).find(v=>v.number==='S-00')!.svg);
  expect(cover).toContain('CRANES ON THE RUNWAY');expect(cover).toContain('CLOSEST APPROACH INCLUDED, WITH IMPACT ON EACH CRANE AND SIDE THRUST FROM ONE CRANE AT A TIME');
  expect(cover).toContain('RAIL TWIST / HEAD MOVEMENT');expect(cover).toMatch(/TWO 2 TON|two 2 ton/i);
  const one=drawingSheetSet({...snapshot,input:cappedDemonstrationProject()}).find(v=>v.number==='S-00')!.svg;
  expect(one).not.toContain('CRANES ON THE RUNWAY');
 });
});

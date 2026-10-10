import {describe,expect,it} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {demonstrationProject} from '../src/engine/demonstration';
import {railLayout,railLayoutCriteria} from '../src/engine/railLayout';
import {drawingSheetSet,detailReferences} from '../src/components/planSheet';
import {detailTitles} from '../src/components/sheetGraphics';

const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'));
const foot=304.8,{stock,clear,minPiece}=railLayoutCriteria;

describe('rail joint layout',()=>{
 it('keeps rail joints off girder joints and out of step with the opposite rail',()=>{
  const p=demonstrationProject(),r=railLayout(p),[a,b]=r.rails;
  expect(r.girderJoints).toEqual([25*foot,50*foot]);
  expect(r.wheelSteps).toEqual([0,10*foot]);
  // Runway A starts with a full mill length, runway B with a half length.
  expect(a.pieces[0]).toBeCloseTo(stock,6);expect(b.pieces[0]).toBeCloseTo(stock/2,6);
  for(const rail of r.rails){
   expect(rail.pieces.reduce((s,v)=>s+v,0)).toBeCloseTo(rail.end-rail.start,6);
   for(const piece of rail.pieces){expect(piece).toBeGreaterThanOrEqual(minPiece-1e-6);expect(piece).toBeLessThanOrEqual(stock+1e-6);}
   for(const j of rail.joints)for(const g of r.girderJoints)expect(Math.abs(j-g)).toBeGreaterThanOrEqual(clear-1e-6);
  }
  for(const j of b.joints)for(const i of a.joints)for(const s of r.wheelSteps)expect(Math.abs(Math.abs(j-i)-s)).toBeGreaterThanOrEqual(clear-1e-6);
  expect(r.conflicts).toEqual([]);
  // Rails stop short of the end stops at both true ends.
  expect(a.start).toBeGreaterThan(0);expect(a.end).toBeLessThan(75*foot);
 });
 it('joins the existing rail beyond a continued end and splits a short remainder',()=>{
  const p=demonstrationProject();p.continuation={left:20*foot,right:0,source:'Field survey'};p.spans=[25*foot,25*foot,25*foot,15*foot];
  const r=railLayout(p),[a]=r.rails;
  expect(r.existing).toEqual({left:true,right:false});
  expect(a.start).toBeCloseTo(-clear,6);
  // The continued end is a girder joint too.
  expect(r.girderJoints[0]).toBe(0);
  for(const rail of r.rails)for(const piece of rail.pieces)expect(piece).toBeGreaterThanOrEqual(minPiece-1e-6);
 });
 it('draws the layout, the sliding bolt section and keyed section cuts on the detail sheet',()=>{
  const s=calculate(demonstrationProject()),set=drawingSheetSet(s),refs=detailReferences(set),s02=set.find(v=>v.number==='S-02')!;
  const titles=[...s02.svg.matchAll(/data-detail-title="([^"]*)"/g)].map(m=>m[1]);
  expect(titles).toContain(detailTitles.railLayout);expect(titles).toContain(detailTitles.slidingBolt);
  // The tie plan and end bearing details draw these at a larger scale.
  expect(titles).not.toContain(detailTitles.supportTies);expect(titles).not.toContain(detailTitles.movement);
  expect(titles).toHaveLength(12);
  const t=texts(s02.svg).join(' ');
  expect(t).toContain('19\'-6"');expect(t).toContain('39\'-0"');
  expect(t).toContain('RAIL PIECES 39\'-0" MAX.');
  expect(t).toContain('STEEL SLEEVE 1 7/16" OD X 13/16" BORE');
  // Each section is keyed on its parent view by its own detail number.
  for(const title of [detailTitles.flangeTie,detailTitles.saddle,detailTitles.endStopSection]){
   const cut=s02.svg.match(new RegExp(`<g data-section-cut="${title}">(.*?)</g>`))?.[1];
   expect(cut,title).toBeDefined();expect(cut).toContain(refs.get(title));
  }
 },240000);
});

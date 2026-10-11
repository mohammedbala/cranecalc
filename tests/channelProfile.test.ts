import {describe,it,expect} from 'vitest';
import {aiscChannels} from '../src/data/aiscChannels';
import {channelProfile,capChannelProfile,channelFlangeSlope,aiscChannelProfile} from '../src/engine/channelProfile';

const inch=25.4;
describe('true AISC channel profile',()=>{
 it.each(aiscChannels.map(c=>[c.name,c] as const))('%s matches the tabulated area and x-bar',(_,c)=>{
  const p=aiscChannelProfile(c);
  // C shapes use the standard 2:12 slope; MC shapes have their slope fitted to x-bar.
  if(c.name.startsWith('C'))expect(p.slope).toBe(channelFlangeSlope);
  expect(Math.abs(p.area/inch**2/c.A-1)).toBeLessThan(.03);
  expect(Math.abs(p.xBar/inch/c.x-1)).toBeLessThan(.02);
  // The fillet lands on the web at k and the flange is thicker at the web than at the toe by the 2:12 slope.
  expect(p.k/inch).toBeCloseTo(c.kdes,6);
  expect(p.rootThickness-p.toeThickness).toBeCloseTo(p.slope*(c.bf-c.tw)*inch,6);
  expect(p.filletRadius).toBeGreaterThan(0);
 });
 it('sits web-down on the girder: web from y=0 to tw, legs down to tw-bf, symmetric about x=0',()=>{
  const s={capWidth:15*inch,capDepth:3.4*inch,capTw:.4*inch,capTf:.65*inch,capCatalogueId:'C15X33.9'};
  const p=capChannelProfile(s);
  const ys=p.outline.map(q=>q[1]),xs=p.outline.map(q=>q[0]);
  expect(Math.max(...ys)).toBeCloseTo(s.capTw,9);expect(Math.min(...ys)).toBeCloseTo(s.capTw-s.capDepth,9);
  expect(Math.max(...xs)).toBeCloseTo(s.capWidth/2,9);expect(Math.min(...xs)).toBeCloseTo(-s.capWidth/2,9);
  for(const q of p.outline)expect(p.outline.some(o=>Math.abs(o[0]+q[0])<1e-9&&Math.abs(o[1]-q[1])<1e-9)).toBe(true);
  // The flat underside of the web reaches the fillet toes, clear of the W flange tips of the demonstration girder.
  expect(p.webFlat).toBeCloseTo(s.capWidth/2-1.44*inch,6);
  expect(p.innerFace(0)).toBeCloseTo(s.capWidth/2-p.rootThickness,9);
  expect(p.innerFace(p.toeY)).toBeCloseTo(p.toeInner,9);
  // The leg trapezoid is convex and has the sloped inner face.
  expect(p.leg[3][0]).toBeLessThan(p.leg[2][0]);
 });
 it('falls back to a fillet radius of tw when k is unknown',()=>{
  const p=channelProfile({d:300,bf:90,tw:10,tf:15});
  expect(p.filletRadius).toBeCloseTo(10,9);
 });
});

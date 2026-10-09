import {describe,it,expect} from 'vitest';
import {cappedDemonstrationProject,demonstrationProject} from '../src/engine/demonstration';
import {createBracketCollector,bracketChecks} from '../src/engine/bracketDesign';
import {createDetailCollector} from '../src/engine/detailAnalysis';
import {sectionProperties} from '../src/engine/section';

describe('calculation corrections',()=>{
 it('uses alpha = 1.6 for the ASD panel-zone axial term (AISC 360-16 J10.6)',()=>{
  const p=cappedDemonstrationProject();p.method='ASD';
  const col=p.details!.bracket!.receiver,h=col.depth-2*col.flangeThickness,Py=col.Fy*(2*col.width*col.flangeThickness+h*col.webThickness);
  const c=createBracketCollector(p)!;c.observe('strength','panel',0,[{vertical:100000,offset:0}],-1);
  col.axialDemand=.5*Py-c.result.strength.vertical.value;
  const panel=bracketChecks(p,c.result).find(v=>v.id==='bracket-column-panel')!;
  // alpha*Pr/Py = 1.6 x 0.5 = 0.8, so Rn = 0.6 Fy dc tw (1.4 - 0.8); Omega = 1.67.
  expect(panel.capacity).toBeCloseTo(.6*col.Fy*col.depth*col.webThickness*.6/1.67,6);
 });
 it('evaluates rolled-girder fatigue bending stress at the outer flange face',()=>{
  const p=demonstrationProject();p.railEccentricity=0;
  p.details!.fatigueDetails=[{id:'T',name:'Top flange test point',x:2500,point:'top-left',category:'C',reference:'test'}];
  const props=sectionProperties(p.section),c=createDetailCollector(p,props,20),origin=1000,wheels=p.cranes[0].wheels;
  c.observe({kind:'fatigue',id:'f',combination:'test',cranes:[{index:0,origin,loaded:true}],horizontalCrane:0,lateralSign:1,wheels:wheels.map(w=>({x:origin+w.offset,p:0,h:0})),q:0,railTorquePerLength:0,axial:0,verticalReactions:[]});
  const bin=c.finish().fatigue.find(f=>f.id==='T')!.bins[0];
  // Rated-lift bin on the first 7620 mm simple span: closed-form moment at x = 2500 mm.
  const L=7620,x=2500,loads=wheels.map(w=>({a:origin+w.offset,P:w.loaded}));
  const R0=loads.reduce((s,l)=>s+l.P*(L-l.a)/L,0),M=R0*x-loads.filter(l=>l.a<x).reduce((s,l)=>s+l.P*(x-l.a),0);
  expect(bin.minimum).toBeCloseTo(-M*(p.section.d/2)/props.Ix,6);
 },60000);
});

import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {calculate as calculateProject,validateProject} from '../src/engine/calculate';
import {withColumnReviewData} from './fixtures/columnReviewData';
import {selectBracketArrangement,connectionOptionChecks} from '../src/engine/connectionOptions';
import {bracketResponse,columnWeldGroup,columnWeldStress,validateBracket} from '../src/engine/bracketDesign';
import {ribGeometry,ribResponse,ribFlexure,ribFreeEdge,rootCornerStress,ribDepthAt} from '../src/engine/bracketRib';
import {endBearingGeometry,activeEndBearing} from '../src/engine/endBearing';
import {buildWeldedBrackets} from '../src/components/weldedBracketGeometry';
import {bracketSheetSvg} from '../src/components/bracketSheet';
import {detailedDrawings} from '../src/components/detailedDrawings';
import {drawingLength,plateInches} from '../src/components/drawingFormat';
import {esc} from '../src/components/sheetGraphics';
import type {CalculationSnapshot,ProjectInput} from '../src/engine/types';
// Review G2: supply the supporting-column records so the package can pass and export.
const calculate=(p:Parameters<typeof calculateProject>[0])=>calculateProject(withColumnReviewData(p));

const inch=25.4,ksi=6.894757293168;
/** The capped demonstration with the haunched seat: 24 in root, 8 in tip, 28 in projection, 1 1/2 in ribs. */
function haunched():ProjectInput{const p=cappedDemonstrationProject();p.details=selectBracketArrangement(p.details!,'haunched-seat');p.details.bracket!.tipDepth=8*inch;return p;}
const snapshot=(input:ProjectInput):CalculationSnapshot=>({input,revision:'haunched-seat',createdAt:'2026-10-11',errors:[],warnings:[],properties:null,analysis:null,checks:[],eligible:false,referenceVersion:''});

describe('haunched rib mechanics, hand-checked',()=>{
 const p=haunched(),b=p.details!.bracket!,g=ribGeometry(b),E=p.section.E,G=E/2.6,e=b.reach+p.details!.bearing.width/2,t=b.ribThickness;
 it('finds the critical section of the taper at x = 2e - h_r/s',()=>{
  const s=(24-8)/28,x=2*e-24*inch/s,r=ribResponse(g,e,E,G),h=24*inch-s*x;
  expect(g.slope).toBeCloseTo(s,12);expect(g.angle*180/Math.PI).toBeCloseTo(Math.atan(16/28)*180/Math.PI,10);
  expect(r.critical.x).toBeCloseTo(x,9);expect(r.critical.depth).toBeCloseTo(h,9);
  // Stationary point: h = 2s(e - x).
  expect(h).toBeCloseTo(2*s*(e-x),9);
  expect(r.critical.bending).toBeCloseTo((e-x)/(t*h**2/6),15);
  // No section between the root and the load is more highly stressed.
  for(let i=0;i<=200;i++){const v=e*i/200;expect((e-v)/(t*ribDepthAt(g,v)**2/6)).toBeLessThanOrEqual(r.critical.bending*(1+1e-12));}
  // Traction-free sloping edge: stress along the edge is the section stress / cos^2 alpha.
  expect(r.critical.edge).toBeCloseTo(r.critical.bending*(1+s*s),15);
  expect(r.root.bending).toBeCloseTo(e/(t*(24*inch)**2/6),15);
  expect(r.load.shear).toBeCloseTo(1.5/(t*(24*inch-s*e)),15);
 });
 it('integrates the variable section to the closed-form deflection and rotation',()=>{
  const r=ribResponse(g,e,E,G),s=g.slope,hr=g.root,he=hr-s*e,rho=he/hr;
  const theta=12/(E*t*s**2)*(hr-he)**2/(2*he*hr**2);
  const bending=12/(E*t*s**3)*(Math.log(1/rho)-1.5+2*rho-rho**2/2),shear=Math.log(hr/he)/(5/6*G*t*s);
  expect(r.theta/theta).toBeCloseTo(1,8);expect(r.delta/(bending+shear)).toBeCloseTo(1,8);
  // A rectangular rib keeps the twin-rib closed forms.
  const rect=ribResponse(ribGeometry({...b,arrangement:'twin-rib'}),e,E,G),I=t*hr**3/12;
  expect(rect.delta).toBeCloseTo(e**3/(3*E*I)+e/(5/6*G*t*hr),15);expect(rect.theta).toBeCloseTo(e**2/(2*E*I),15);expect(rect.critical.x).toBe(0);
 });
 it('applies F11 at the section with the root-depth slenderness, and the bracket-plate free-edge rule',()=>{
  const x=ribResponse(g,e,E,G).critical.x,h=ribDepthAt(g,x),Fy=p.details!.material.Fy;
  const lambda=2*28*inch*24*inch/t**2,ratio=lambda*Fy/E,Mn=Math.min(Fy*t*h**2/4,(1.52-.274*ratio)*Fy*t*h**2/6);
  expect(ratio).toBeGreaterThan(.08);expect(ratio).toBeLessThan(1.9);
  expect(ribFlexure(b,E,Fy,'LRFD',x).capacity).toBeCloseTo(.9*Mn,6);
  // 250/sqrt(Fy, ksi) = 35.36 for 50 ksi: b/a = 28/24 > 1, so a/t = 24/1.5 = 16 governs; t_min = 24 in / 35.36.
  const edge=ribFreeEdge(g,E,Fy,'LRFD');
  expect(edge.limit).toBeCloseTo(1.47*Math.sqrt(E/Fy),12);expect(edge.limit).toBeCloseTo(250/Math.sqrt(Fy/ksi),0);
  expect(edge.slenderness).toBeCloseTo(16,12);expect(edge.minimumThickness).toBeCloseTo(24*inch/edge.limit,9);expect(edge.capacity).toBeCloseTo(.9*Fy,9);
  // Beyond the limit the edge stress is held to the elastic plate value.
  const thin=ribFreeEdge({...g,thickness:.5*inch},E,Fy,'ASD');expect(thin.Fcr).toBeCloseTo(Fy*(edge.limit/48)**2,9);expect(thin.capacity).toBeCloseTo(thin.Fcr/1.67,9);
 });
 it('adds the free-edge corner shear to the root fillet and the column weld group',()=>{
  const R=40000,r=bracketResponse(p,[{vertical:2*R,offset:0}]),a=b.rootWeld/Math.SQRT2,Aw=2*a*b.ribDepth,Iw=2*a*b.ribDepth**3/12,fb=R*e*(b.ribDepth/2)/Iw;
  expect(r.R).toBe(R);expect(r.rootWeld).toBeCloseTo(Math.hypot(fb,R/Aw+fb*g.slope),9);expect(rootCornerStress(fb,R/Aw,g.slope)).toBeCloseTo(r.rootWeld,9);
  expect(r.rootWeld).toBeGreaterThan(Math.hypot(fb,R/Aw));
  // Critical-section stresses scale the rib reaction by the geometric factors.
  const k=ribResponse(g,e,E,G);
  expect(r.M).toBeCloseTo(R*k.critical.moment,6);expect(r.normal).toBeCloseTo(R*k.critical.bending,9);expect(r.haunched!.ribEdge).toBeCloseTo(R*k.critical.edge,9);expect(r.shear).toBeCloseTo(R*k.load.shear,9);
  expect(r.haunched!.ribRootMoment).toBeCloseTo(R*e,6);expect(r.rotation).toBeCloseTo(R*k.theta,15);
  // The column weld group: the haunched root bottom carries n tan(alpha) more shear than the rectangular rib.
  const w=columnWeldGroup(b,b.seatWeld),set={V:2*R,Mseat:0,F:0,H:0,xH:0},taper=columnWeldStress(b,w,e,set).root;
  const flat=columnWeldStress({...b,arrangement:'twin-rib'},columnWeldGroup({...b,arrangement:'twin-rib'},b.seatWeld),e,set).root;
  expect(w.slope).toBeCloseTo(g.slope,12);expect(taper).toBeGreaterThan(flat);
 });
});
describe('haunched seat validation',()=>{
 it('accepts the demonstration geometry and rejects a missing taper, steep or shallow slopes and stub proportions',()=>{
  const p=haunched(),b=p.details!.bracket!;expect(validateProject(p)).toEqual([]);
  const errors=(f:(v:typeof b)=>void)=>{const q=haunched();f(q.details!.bracket!);return validateBracket(q).join(' ');};
  expect(errors(v=>{v.tipDepth=v.ribDepth;})).toContain('tip depth must be less than the root depth');
  expect(errors(v=>{v.tipDepth=v.ribDepth+1;})).toContain('tip depth must be less than the root depth');
  expect(errors(v=>{v.tipDepth=22*inch;})).toContain('free-edge slope 4.1°');
  expect(errors(v=>{v.ribDepth=40*inch;v.tipDepth=2*inch;})).toContain('free-edge slope 53.6°');
  expect(errors(v=>{v.ribDepth=12*inch;v.tipDepth=4*inch;})).toContain('projection / root depth 2.33');
  // The rib must clear the bearing bolt nuts below the seat as for the twin rib.
  const e=activeEndBearing(p)!;expect(endBearingGeometry(p,e).ribs).toEqual(endBearingGeometry({...p,details:{...p.details!,bracket:{...b,arrangement:'twin-rib'}}},e).ribs);
  expect(endBearingGeometry(p,e).ribs.length).toBeGreaterThan(0);
 });
});
describe('haunched seat drawings and model',()=>{
 it('details the taper, welds and notes from the engine geometry',()=>{
  for(const units of ['US','SI'] as const){
   const p=haunched();p.units=units;const s=snapshot(p),svg=bracketSheetSvg(s),b=p.details!.bracket!,dim=(v:number)=>esc(drawingLength(v,units));
   expect(svg).toContain(esc(`2 HAUNCHED RIB PL ${plateInches(b.ribThickness,units)}`));
   expect(svg).toContain(`${dim(b.ribDepth)} AT COLUMN TO ${dim(8*inch)} AT TIP`);
   // Root depth, tip depth and projection dimensions in the transverse section.
   const at=svg.indexOf('data-view="welded-bracket-side"'),next=svg.indexOf('data-view=',at+10),side=svg.slice(at,next<0?undefined:next);
   for(const v of [b.ribDepth,8*inch,b.seatProjection])expect(side).toContain(`>${dim(v)}<`);
   expect(side).toContain('CONT. FULL ROOT DEPTH');expect(side).toMatch(/<path class="runway-line" d="M[^"]*L[^"]*L[^"]*L[^"]*Z"\/>/);
   expect(svg).toContain('TWO HAUNCHED RIB PLATES');expect(svg).toContain('THERMALLY CUT TO A SURFACE ROUGHNESS');expect(svg).not.toContain('RECTANGULAR RIBS');expect(svg).not.toMatch(/NaN|Infinity/);
  }
  const sketch=detailedDrawings(snapshot(haunched())).find(d=>d.name==='welded-column-bracket')!;
  expect(sketch.entities.some(e=>e.type==='text'&&e.text.includes('2 HAUNCHED RIBS'))).toBe(true);
 });
 it('builds the designed tapered rib in 3D with the checked root weld',()=>{
  const b=haunched().details!.bracket!,group=buildWeldedBrackets(b,[0],0,new THREE.MeshBasicMaterial(),new THREE.LineBasicMaterial());
  expect(group.userData.designedBracket).toBe(true);
  const rib=group.getObjectByName('WB-S1-rib-1') as THREE.Mesh;rib.geometry.computeBoundingBox();const size=rib.geometry.boundingBox!.getSize(new THREE.Vector3());
  expect(size.y).toBeCloseTo(b.ribDepth/1000,6);expect(size.z).toBeCloseTo(b.seatProjection/1000,6);
  expect(rib.userData.part.family).toBe('Designed haunched bracket rib');
 });
});
describe('haunched seat package',()=>{
 it('designs the capped demonstration with every check passing',()=>{
  const p=haunched();expect(connectionOptionChecks(p)).toEqual([]);
  const s=calculate(p);expect(s.errors).toEqual([]);expect(s.eligible).toBe(true);
  expect(s.checks.filter(c=>!['pass','not-applicable','excluded'].includes(c.status)).map(c=>c.id)).toEqual([]);
  const by=(id:string)=>s.checks.find(c=>c.id===id)!,b=p.details!.bracket!,g=ribGeometry(b),E=p.section.E,e=b.reach+p.details!.bearing.width/2,k=ribResponse(g,e,E,E/2.6);
  for(const id of ['rib-flexure','rib-flexure-root','rib-shear','rib-shear-root','rib-interaction','rib-edge','rib-edge-thickness','fatigue-rib-edge','root-weld','column-weld','fatigue-rib','fatigue-rootWeld','deflection','rotation','tr13-load'])expect(by('bracket-'+id).status,id).toBe('pass');
  // Demands follow the peak rib reaction through the geometric factors.
  const R=s.detailResults!.bracket!.strength.ribReaction.value;
  expect(by('bracket-rib-flexure').demand).toBeCloseTo(R*k.critical.moment,0);
  expect(by('bracket-rib-flexure-root').demand).toBeCloseTo(R*e,0);
  expect(by('bracket-rib-edge').demand).toBeCloseTo(R*k.critical.edge,6);
  expect(by('bracket-rib-edge-thickness').demand).toBeCloseTo(24*inch/(1.47*Math.sqrt(E/p.details!.material.Fy)),9);
  expect(by('bracket-rib-flexure').capacity).toBeCloseTo(ribFlexure(b,E,p.details!.material.Fy,p.method,k.critical.x).capacity,3);
  for(const id of ['end-bearing-wrench-rib','end-bearing-seat-prying','end-bearing-seat-bearing'])expect(by(id).status,id).toBe('pass');
  expect(s.checks.some(c=>c.id==='option-bracket-model')).toBe(false);
 },300000);
});

import {describe,it,expect} from 'vitest';
import {reviewOpenItem} from './review/openItems';
import * as THREE from 'three';
import {cappedDemonstrationProject,newColumnDemonstrationProject} from '../src/engine/demonstration';
import {calculate,validateProject} from '../src/engine/calculate';
import {projectSchema} from '../src/engine/types';
import type {CalculationSnapshot,ProjectInput} from '../src/engine/types';
import {connectionOptionChecks,selectBracketArrangement} from '../src/engine/connectionOptions';
import {rolledStub,bracketSeat,defaultRolledBracket} from '../src/engine/rolledBracketInputs';
import {stubFlexure,stubShear,stubWebBearing,stubStiffener,stubWeldGroup,stubWeldStress,stubActions,stubLoads,flangeTipStresses,columnFlangeForces,validateRolledBracket,stubBoltLayout,createRolledBracketCollector,rolledBracketChecks} from '../src/engine/rolledBracket';
import {seatStrip} from '../src/engine/bracketDesign';
import {compactReport} from '../src/report/compactReport';
import {bracketSheetSvg} from '../src/components/bracketSheet';
import {buildWeldedBrackets} from '../src/components/weldedBracketGeometry';

// Leader routes of different callouts that cross, in sheet coordinates (as in drawingLeaders.test.ts).
type Point=[number,number];
const cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0];
const sub=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]];
// Inspect the geometry actually emitted to the drawing, in sheet coordinates: each detail is drawn
// in its own coordinates and translated into its grid cell. Shared branches inside a single callout
// are intentional; intersections between callouts are not.
function crossingLeaders(svg:string){
 const cells=[...svg.matchAll(/<g data-detail-cell="[^"]*"(?: data-cell-height="[^"]*")? transform="translate\(([-\d.e]+) ([-\d.e]+)\)">/g)].map(m=>({at:m.index!,dx:+m[1],dy:+m[2]}));
 // A detail's content runs from its cell group to its title, drawn after it at sheet level.
 if(svg.includes('data-detail-cell')&&!cells.length)throw new Error('detail cells not found');
 const offset=(i:number):Point=>{const c=cells.filter(v=>v.at<i).at(-1);return c&&svg.indexOf('<g data-view-title=',c.at)>i?[c.dx,c.dy]:[0,0];};
 const routes=[...svg.matchAll(/<g data-multileader="component">(.*?)<\/g>/gs)].flatMap((g,id)=>{const [dx,dy]=offset(g.index!);
  return [...g[1].matchAll(/data-leader-path="true" points="([^"]+)"/g)].map(m=>({id,points:m[1].split(' ').map(p=>{const [x,y]=p.split(',').map(Number);return [x+dx,y+dy] as Point;})}));});
 const hits:string[]=[];
 for(let i=0;i<routes.length;i++)for(let j=i+1;j<routes.length;j++){
  const a=routes[i],b=routes[j];if(a.id===b.id)continue;
  for(let ai=1;ai<a.points.length;ai++)for(let bi=1;bi<b.points.length;bi++){
   const p=a.points[ai-1],q=b.points[bi-1],r=sub(a.points[ai],p),s=sub(b.points[bi],q),den=cross(r,s),qp=sub(q,p);
   if(Math.abs(den)<1e-7){
    if(Math.abs(cross(qp,r))<1e-7 && Math.hypot(...r)>0){
     const axis=Math.abs(r[0])>Math.abs(r[1])?0:1;
     if(Math.max(Math.min(p[axis],a.points[ai][axis]),Math.min(q[axis],b.points[bi][axis]))<=Math.min(Math.max(p[axis],a.points[ai][axis]),Math.max(q[axis],b.points[bi][axis])))hits.push(`${a.id}/${b.id} overlap`);
    }
   }else{
    const t=cross(qp,s)/den,u=cross(qp,r)/den;
    if(t>=0&&t<=1&&u>=0&&u<=1)hits.push(`${a.id}/${b.id} crossing`);
   }
  }
 }
 return hits;
}

const inch=25.4,kip=4448.2216152605,ksi=6.894757293168,E=29000*ksi;
/** The capped demonstration on a W12X65 stub with a spreader seat, CJP flanges and bearing stiffeners. */
function rolledProject(base:()=>ProjectInput=cappedDemonstrationProject){
 const p=base();p.details=selectBracketArrangement(p.details!,'rolled-corbel');
 const b=p.details.bracket!;b.corbelShape='W12X65';b.seatThickness=1.5*inch;b.seatWeld=.375*inch;
 b.rolled={...b.rolled!,flangeJoint:'cjp',webWeld:.3125*inch,stiffenerThickness:.5*inch,stiffenerWeld:.25*inch,seatPlate:true};
 p.details.endBearing!.bolts.edge=2.125*inch;
 return p;
}
const snapshot=(input:ProjectInput):CalculationSnapshot=>({input,revision:'rolled-bracket',createdAt:'',errors:[],warnings:[],properties:null,analysis:null,checks:[],eligible:false,referenceVersion:''});

describe('new rolled wide-flange bracket',()=>{
 it('is a designed option: defaults on selection, schema round trip and no preview-only block',()=>{
  const p=rolledProject(),b=p.details!.bracket!;
  expect(connectionOptionChecks(p)).toEqual([]);expect(validateProject(p)).toEqual([]);
  const d=selectBracketArrangement(cappedDemonstrationProject().details!,'rolled-corbel');
  expect(d.bracket!.corbelShape).toBe('W14X90');expect(d.bracket!.rolled).toEqual(defaultRolledBracket);
  expect(projectSchema.parse(JSON.parse(JSON.stringify(p))).details!.bracket!.rolled).toEqual(b.rolled);
  // The plate the bearings land on: the seat, or the stub flange without one.
  expect(bracketSeat(b)).toMatchObject({thickness:1.5*inch,length:b.seatLength,depth:12.1*inch});
  b.rolled!.seatPlate=false;expect(bracketSeat(b)).toMatchObject({thickness:.605*inch,length:12*inch});
 });
 it('checks the stub by hand: F3 flexure, G2 shear, J10.2 and J10.3 under the bearing',()=>{
  const st=rolledStub(rolledProject().details!.bracket!)!,Fy=50*ksi;
  // W12X65: bf/2tf = 9.92 > 0.38(E/Fy)^0.5 = 9.15, noncompact flanges: F3 governs over F2 (Lb = 56 in < Lp = 128 in).
  const fl=stubFlexure(st,E,Fy,2*st.L),lp=.38*Math.sqrt(29000/50),lr=Math.sqrt(29000/50),lam=12/(2*.605);
  const Mn=(50*96.8-(50*96.8-.7*50*87.9)*(lam-lp)/(lr-lp))*kip*inch;
  expect(fl.branch).toBe('F3 flange local buckling');expect(fl.Mn/Mn).toBeCloseTo(1,6);expect(fl.Mn/(kip*inch)).toBeCloseTo(4749.6,0);
  expect(stubShear(st,E,Fy,'LRFD').capacity/kip).toBeCloseTo(.6*50*12.1*.39,3);
  // Bearing 12 in wide on a 9.07 in girder flange: lb = 9.07 in at the girder web line, 2 in from the stub tip
  // (end case for yielding and crippling).
  const lb=9.07*inch,wb=stubWebBearing(st,E,Fy,20*inch,lb,'LRFD');expect(wb.yieldEnd).toBe(true);expect(wb.crippleEnd).toBe(true);
  expect(wb.yielding/kip).toBeCloseTo(50*.39*(2.5*1.2+9.07),3);
  const r=9.07/12.1,term=r>.2?4*r-.2:3*r;
  expect(wb.crippling/kip).toBeCloseTo(.75*.4*.39**2*(1+term*(.39/.605)**1.5)*Math.sqrt(29000*50*.605/.39),2);
 });
 it('sizes the J10.8 stiffeners and the weld group consistently with hand values',()=>{
  const st=rolledStub(rolledProject().details!.bracket!)!,s=stubStiffener(st,E,50*ksi,20*inch,'LRFD')!;
  // Outstand to 1/4 in inside the flange tip, rounded down to 1/8 in; clip clears the design fillet by 1/8 in.
  expect(s.width/inch).toBeCloseTo(5.5,9);expect(s.clip/inch).toBeCloseTo(.75,9);
  expect(s.interior).toBe(true);expect(s.slender).toBeLessThan(25);expect(s.column/kip).toBeCloseTo(.9*50*(2*5.5*.5+25*.39*.39),3);
  // Fillet group (flanges both faces + web both sides) under V alone: throat stress at the top of the web line.
  const fil=rolledStub({...rolledProject().details!.bracket!,rolled:{...defaultRolledBracket,flangeWeld:.3125*inch,webWeld:.3125*inch}})!,g=stubWeldGroup(fil);
  const V=10*kip,e=26*inch,f=stubActions(fil,20*inch,e,[{vertical:V,offset:0}],{longitudinal:0,bottom:0,offset:0}),w=stubWeldStress(fil,g,20*inch,f);
  const v=fil.d/2;expect(w.flange).toBeCloseTo(Math.hypot(V*e*v/g.Ix,V/g.A),6);
  expect(g.lines).toHaveLength(8);expect(g.innerLength/inch).toBeCloseTo(6-(.195+1.2-.605),6);
 });
 it('carries the seat moment as stub torsion and the seat strip reactions at the flange tips',()=>{
  const st=rolledStub(rolledProject().details!.bracket!)!,loads=[{vertical:14*kip,offset:10*inch,length:4.8*inch}];
  const on=stubLoads(st,loads,12*inch),strip=seatStrip(loads,st.bf,12*inch);
  expect(on.loads.map(v=>v.vertical)).toEqual(strip.reactions);
  const f=stubActions(st,20*inch,26*inch,on.loads,{longitudinal:kip,bottom:0,offset:0});
  // Statics: the strip reactions reproduce the vertical load and its seat moment.
  expect(f.V/kip).toBeCloseTo(14,9);expect(f.Mseat/(kip*inch)).toBeCloseTo(140,6);
  const top=st.d/2+1.5*inch,T=140*kip*inch+kip*top;expect(f.T/(kip*inch)).toBeCloseTo(T/(kip*inch),6);
  expect(f.Qtop/kip).toBeCloseTo(.5+T/st.h0/kip,6);expect(f.Mtop/(kip*inch)).toBeCloseTo(f.Qtop/kip*20,6);
  const tips=flangeTipStresses(st,f),Sf=st.tf*st.bf**2/6;expect(Math.max(...tips)).toBeCloseTo(f.Mx/st.Sx+Math.abs(f.Mtop)/Sf,6);
  // J10.1 takes the flange lateral bending as a half-flange resultant; the web the resultant flange force only.
  const col=columnFlangeForces(st,f);expect(col.pull).toBeCloseTo(f.Mx/st.h0+3*Math.abs(f.Mtop)/st.bf,6);expect(col.tension).toBeCloseTo(f.Mx/st.h0,6);
 });
 it('checks bearings directly on the flange: outstand bending without stiffeners, J10.8 required under a heavy bearing',()=>{
  const p=rolledProject(),b=p.details!.bracket!;b.rolled={...b.rolled!,seatPlate:false,stiffeners:false};
  const run=(V:number)=>{const c=createRolledBracketCollector(p)!;
   c.observe('strength','S1',0,[{vertical:V,offset:5*inch,length:2*inch}],0,{longitudinal:0,bottom:0,offset:0});
   c.observe('service','V1',0,[{vertical:V/1.6,offset:5*inch,length:2*inch}],0);
   for(const [bin] of p.details!.spectrum.entries())c.observe('fatigue','F1',0,[{vertical:V/2,offset:5*inch,length:2*inch}],bin,{longitudinal:0,bottom:0,offset:0});
   return rolledBracketChecks(p,c.result);};
  // W12X65: k1 = tw/2 + kdes - tf = 0.79 in; lb = 9.07 in (girder flange); nearest patch edge 4 in from the web.
  const light=run(10*kip),outstand=light.find(c=>c.id==='wbracket-flange-outstand')!,k1=.195+1.2-.605;
  // The stub self-weight (1.4 LRFD) over the flange width adds its part beyond the fillet toe.
  const st=rolledStub(b)!,w=1.4*st.weight*st.L/kip,half=st.bf/inch/2,own=w*(half-k1)/(2*half)*((half+k1)/2-k1)/9.07;
  expect(outstand.status).toBe('pass');expect(outstand.demand!/kip).toBeCloseTo(10*(5-k1)/(9.07+2*(4-k1))+own,4);
  expect(outstand.capacity!/kip).toBeCloseTo(.9*50*.605**2/4,4);
  expect(light.some(c=>c.id.startsWith('wbracket-stiffener'))).toBe(false);expect(light.find(c=>c.id==='wbracket-seat-flexure')).toBeUndefined();
  const heavy=run(300*kip);
  expect(heavy.find(c=>c.id==='wbracket-stiffener-required')?.status).toBe('fail');expect(heavy.find(c=>c.id==='wbracket-web-yielding')?.status).toBe('fail');
 });
 it('rejects stubs, seats and bolts that do not fit',()=>{
  const p=rolledProject(),b=p.details!.bracket!,msg=()=>validateRolledBracket(p).join(' ');
  expect(validateRolledBracket(p)).toEqual([]);
  b.corbelShape='W999X999';expect(msg()).toContain('valid AISC W-section');b.corbelShape='W12X65';
  // A W14X145 (bf 15.5 in) does not fit the 14 in receiving flange.
  b.corbelShape='W14X145';expect(msg()).toContain('must fit on the receiving column flange');b.corbelShape='W12X65';
  // Without the spreader seat the two 12 in independent bearings do not fit on a 12 in flange.
  b.rolled!.seatPlate=false;expect(msg()).toContain('bearing plates must sit on the stub flange');b.rolled!.seatPlate=true;
  b.seatLength=10*inch;expect(msg()).toContain('spreader seat must cover the bearing plates');b.seatLength=26*inch;
  b.seatWeld=.625*inch;expect(msg()).toContain('smaller than the flange thickness');b.seatWeld=.375*inch;
  b.seatProjection=24*inch;expect(msg()).toContain('beyond the complete bearing plate');b.seatProjection=28*inch;
  expect(validateRolledBracket(p)).toEqual([]);
  const lay=stubBoltLayout(p,p.details!.endBearing!);expect(lay.inner/inch).toBeCloseTo(2.125,9);expect(lay.outer/inch).toBeCloseTo(.5+9.875,9);
 });
 it('draws the detail views with the engine sizes, field flags on an existing column and no crossing leaders',()=>{
  for(const units of ['US','SI'] as const){
   const p=rolledProject();p.units=units;const svg=bracketSheetSvg(snapshot(p));
   expect(svg).not.toMatch(/NaN|Infinity|undefined/);expect(crossingLeaders(svg)).toEqual([]);
   for(const view of ['rolled-bracket-side','rolled-bracket-plan','rolled-bracket-face'])expect(svg).toContain(`data-view="${view}"`);
   expect((svg.match(/data-field-weld="true"/g)??[]).length).toBe(2);expect(svg).toContain('data-weld="cjp"');
   // Text content in reading order, the wrapped note lines joined.
   const plain=svg.replace(/<[^>]+>/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ');
   if(units==='US'){
    for(const text of ['W12X65 X 2\'-4" LONG','2 STIFF. PL 1/2" X 5 1/2"','SEAT PL 1 1/2" X 2\'-2"','9/16" CLEAR OF COL.','8 - 13/16" STD HOLES IN SEAT','CJP GROOVE WELDS AT BOTH FLANGES','5/16" FILLETS BOTH SIDES OF THE WEB','3/8" FILLETS','FIELD WELD THE STUB'])expect(plain).toContain(text);
   }
  }
  const p=rolledProject(newColumnDemonstrationProject),svg=bracketSheetSvg(snapshot(p));
  expect(svg).not.toContain('data-field-weld="true"');expect(svg).toContain('SHOP WELD THE STUB TO THE NEW W14X120 COLUMN');
 });
 it('builds the designed stub, stiffeners and welds in 3D, field welds only to an existing column',()=>{
  const b=rolledProject().details!.bracket!,st=rolledStub(b)!,steel=new THREE.MeshBasicMaterial(),edge=new THREE.LineBasicMaterial();
  for(const isNew of [false,true]){
   const group=buildWeldedBrackets(b,[0],0,steel,edge,undefined,steel,undefined,isNew),welds:any[]=[];
   group.traverse(o=>{if(o.userData.part?.weld)welds.push(o.userData.part.weld);});
   expect(group.userData.designedBracket).toBe(true);
   const column=welds.filter(w=>w.existingSteel!==undefined);expect(column).toHaveLength(4);
   expect(column.every(w=>w.location===(isNew?'shop':'field'))).toBe(true);
   expect(welds.filter(w=>w.kind==='fillet'&&w.location==='shop'&&w.existingSteel===undefined).map(w=>Math.round(w.size*1e4))).toEqual([...Array(12).fill(Math.round(.25*inch*10)),...Array(2).fill(Math.round(.375*inch*10))]);
   const web=group.getObjectByName('WB-S1-corbel-web') as THREE.Mesh;web.geometry.computeBoundingBox();
   expect(web.geometry.boundingBox!.getSize(new THREE.Vector3()).y).toBeCloseTo((st.d-2*st.tf)/1000,7);
  }
 });
 it('designs the capped demonstration on the wide-flange bracket: every check passes but the unstiffened column web (J10.2)',()=>{
  const s=calculate(rolledProject());expect(s.errors).toEqual([]);expect(s.eligible).toBe(true);
  // C2: with one force system per stub flange, J10.2 web yielding takes the same R_u = P + 3M_f/b as J10.1 at each flange
  // level and the 0.44 in W14X90 web is exceeded at both (1.10 at the top flange, 1.03 at the bottom flange): this stub
  // on this column needs column stiffeners (as cappedStubW14X90(true)). A real result, reported, not hidden.
  expect(s.checks.filter(c=>(c.status==='fail'||c.status==='unverified'||c.status==='unsupported')&&!reviewOpenItem(c)).map(c=>c.id)).toEqual(['wbracket-column-yield-top','wbracket-column-yield-bottom']);
  const yt=s.checks.find(c=>c.id==='wbracket-column-yield-top')!,j1=s.checks.find(c=>c.id==='wbracket-column-flange')!;
  expect(yt.demand).toBe(j1.demand);expect(yt.utilization).toBeCloseTo(1.191,2);expect(yt.note).toContain('a full-depth column stiffener pair at each stub flange level (J10.8) is required');
  expect(s.detailResults?.rolledBracket).toBeDefined();expect(s.detailResults?.bracket).toBeUndefined();expect(s.checks.some(c=>c.id==='bracket-rib-flexure')).toBe(false);
  const ids=s.checks.filter(c=>c.id.startsWith('wbracket-')).map(c=>c.id);
  for(const id of ['stub-flexure','stub-shear','stub-combined','web-yielding','web-crippling','stiffener-column','stiffener-weld','flange-cjp','web-weld','column-flange','column-yield-top','column-yield-bottom','column-crippling','seat-flexure','seat-weld','fatigue-flange','fatigue-column','tr13-load','deflection'])expect(ids).toContain('wbracket-'+id);
  for(const id of ['end-bearing-seat-bearing','end-bearing-wrench-stub-web','end-bearing-wrench-stub-tip','end-bearing-wrench-stub-stiffener','end-bearing-seat-fit'])expect(s.checks.find(c=>c.id===id)?.status).toBe('pass');
  // The seat moment from one loaded bay twists the stub: the warping stress of the flanges is the governing stress.
  const combined=s.checks.find(c=>c.id==='wbracket-stub-combined')!;expect(combined.utilization).toBeGreaterThan(.3);
  const report=compactReport(s,'');expect(report).toContain('Wide-flange bracket, inputs');expect(report).toContain('Stub actions at the governing case of each grid');expect(report).not.toMatch(/NaN|undefined/);
 },180000);
});

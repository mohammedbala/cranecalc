import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {cappedDemonstrationProject,newColumnDemonstrationProject} from '../src/engine/demonstration';
import {selectBracketArrangement} from '../src/engine/connectionOptions';
import {createBracketCollector,bracketChecks,validateBracket,columnWeldGroup,columnWeldLevels,stiffenerLevelForces,seatFatigueCategory,bracketResponse,seatStrip,seatColumnWeldSizes} from '../src/engine/bracketDesign';
import {columnStiffenerGeometry,stiffenerPairStrength,requiredStiffenerForce,flangeForceLevels,flangeStiffenerForces,bracketForceLevels} from '../src/engine/columnStiffeners';
import {createRolledBracketCollector,rolledBracketChecks,stubStiffenerForces,stubActions,projectStub,stubBearing} from '../src/engine/rolledBracket';
import {receiverK,initialColumnStiffeners} from '../src/engine/columnStiffenerInputs';
import {bracketTopic} from '../src/components/bracketSheet';
import {columnStiffenerTitle} from '../src/components/columnStiffenerDrawing';
import {addColumnStiffeners} from '../src/components/columnStiffenerGeometry';
import {projectSchema} from '../src/engine/types';
import type {CalculationSnapshot,CheckResult,ProjectInput} from '../src/engine/types';
import {calculate} from '../src/engine/calculate';
import {drawingSheetSet} from '../src/components/planSheet';
import {sheetEntities} from '../src/components/sheetDxf';
import {textWidth} from '../src/components/sheetGraphics';
import {annotationClashes} from '../src/components/detailSheet';
import {cappedTwinRibW14X90,cappedStubW14X90,newW14X90Columns} from './fixtures/columnStiffenerProjects';

const inch=25.4,ksi=6.894757293168,kip=4448.2216152605;
/** The capped demonstration on a surveyed W14X90 receiving column (d 14.0, bf 14.5, tf 0.71, tw 0.44 in, kdes 1.31 in). */
function w14(p:ProjectInput=cappedDemonstrationProject()){
 const b=p.details!.bracket!;b.receiver={...b.receiver,depth:14*inch,width:14.5*inch,flangeThickness:.71*inch,webThickness:.44*inch,axialDemand:0};p.existingColumn!.shape='W14X90';delete b.columnStiffeners;return p;
}
const plates={enabled:true,thickness:1*inch,width:6.75*inch,length:'half' as const,clip:.75*inch,flangeWeld:5/16*inch,webWeld:5/16*inch};
const stiffened=(p=w14())=>{p.details!.bracket!.columnStiffeners={...plates};return p;};
const snapshot=(input:ProjectInput):CalculationSnapshot=>({input,revision:'column-stiffeners',createdAt:'2026-10-11',errors:[],warnings:[],properties:null,analysis:null,checks:[],eligible:false,referenceVersion:''});
/** Strength sets on the bracket: a centered pair of girder ends and an offset single end, both senses of H. */
function welded(p:ProjectInput){
 const c=createBracketCollector(p)!;
 c.observe('strength','centered',0,[{vertical:60000,offset:-200,length:120},{vertical:60000,offset:200,length:120}],-1,{longitudinal:8000,bottom:6000,offset:0});
 c.observe('strength','offset',0,[{vertical:80000,offset:250,length:120}],-1,{longitudinal:0,bottom:6000,offset:250});
 for(const bin of [0,1,2])c.observe('fatigue','bin',0,[{vertical:30000/(bin+1),offset:250,length:120}],bin);
 c.observe('service','service',0,[{vertical:40000,offset:0}],-1);
 return c.result;
}
const byId=(checks:CheckResult[],id:string)=>checks.find(v=>v.id===id)!;

describe('column stiffener geometry and strength, hand-checked',()=>{
 it('places the pairs at the seat and the rib bottom, half depth, from the W14X90 catalogue fillet',()=>{
  const g=columnStiffenerGeometry(stiffened())!;
  expect(g.K!.k).toBeCloseTo(1.31*inch,9);expect(g.K!.source).toBe('AISC W14X90');
  expect(g.length).toBeCloseTo(7*inch-.71*inch,9);expect(g.webLength).toBeCloseTo(g.length-.75*inch,9);expect(g.contact).toBeCloseTo(6*inch,9);
  // Upper pair centered on the 2 in seat; lower pair's bottom face on the 24 in rib bottom.
  expect(g.levels[0].z).toBeCloseTo(-inch,9);expect(g.levels[1].z).toBeCloseTo(-(2+24)*inch+inch/2,9);
  // Clip clear of the rolled fillet: k - tf + 1/8 in = k1 - tw/2 + 1/8 in.
  expect(g.requiredClip).toBeCloseTo((1.31-.71+.125)*inch,9);
  // Starting values for this column under a 2 in seat: 1 in plates (t_p/2), 6 3/4 in wide, 3/4 in clips.
  const start=initialColumnStiffeners(g.c,g.K!.k,2*inch);expect(start.thickness).toBeCloseTo(inch,9);expect(start.width).toBeCloseTo(6.75*inch,9);expect(start.clip).toBeCloseTo(.75*inch,9);
 });
 it('takes the J10.8 column of both plates and a 25tw web strip, bounded by yielding at the clipped contact',()=>{
  const p=stiffened(),g=columnStiffenerGeometry(p)!,Fy=50*ksi,E=29000*ksi,pair=stiffenerPairStrength(g,Fy,E,'LRFD',false);
  const tw=.44,A=2*6.75*1+25*tw*tw,Iy=tw*(25*tw)**3/12+2*6.75/12,Ix=25*tw*tw**3/12+2*(6.75**3/12+6.75*((tw+6.75)/2)**2),r=Math.sqrt(Math.min(Ix,Iy)/A);
  expect(pair.A).toBeCloseTo(A*inch**2,6);expect(pair.r).toBeCloseTo(r*inch,6);expect(pair.KL).toBeCloseTo(.75*6.29*inch,6);
  expect(pair.slender).toBeLessThan(25); // J4.4: Pn = Fy Ag
  expect(pair.column).toBeCloseTo(.9*50*A*kip,0);
  expect(pair.tension).toBeCloseTo(.9*50*12*kip,0);expect(pair.compression).toBeCloseTo(.9*50*12*kip,0);
  // Near the column top only 12tw of web counts.
  expect(stiffenerPairStrength(g,Fy,E,'ASD',true).A).toBeCloseTo((2*6.75+12*tw*tw)*inch**2,6);
 });
 it('requires R_u less the least unstiffened strength, and the full force where sidesway governs',()=>{
  const t=[{id:'a',label:'J10.1',value:250},{id:'b',label:'J10.2',value:180}],c=[{id:'b',label:'J10.2',value:150},{id:'c',label:'J10.3',value:400}];
  const r=requiredStiffenerForce(300,200,t,c);expect(r.Rt).toBe(120);expect(r.Rc).toBe(50);expect(r.tMin.label).toBe('J10.2');
  const s=requiredStiffenerForce(300,200,t,c,{id:'d',label:'J10.4',value:100});expect(s.swayGoverns).toBe(true);expect(s.Rc).toBe(200);
  expect(requiredStiffenerForce(100,100,t,c).Rt).toBe(0);
 });
 it('splits the weld group force at its centroid in equilibrium with the lateral force',()=>{
  const p=w14(),b=p.details!.bracket!,g=columnWeldGroup(b,seatColumnWeldSizes(p)[0]),e=b.reach+p.details!.bearing.width/2;
  for(const f of [{V:100000,Mseat:2e6,F:5000,H:20000,xH:100},{V:-30000,Mseat:0,F:0,H:-8000,xH:0}]){
   const w=columnWeldLevels(b,g,e,f);expect(w.upperT+w.lowerT-w.upperC-w.lowerC).toBeCloseTo(f.H,4);
  }
  // Gravity pulls at the seat and pushes at the rib bottom; the rib couple bounds them from below.
  const r=bracketResponse(p,[{vertical:100000,offset:0}]),v=stiffenerLevelForces(b,[g],r.ribs,r.e,{V:r.V,Mseat:r.Mx,F:0,H:0,xH:0});
  expect(v.upperT).toBeGreaterThanOrEqual(2*1.5*r.R*r.e/b.ribDepth-1e-6);expect(v.lowerC).toBeGreaterThanOrEqual(v.upperT*.5);expect(v.upperC).toBeCloseTo(0,6);
 });
 it('defines the force levels of any I-shaped bracket at its flanges, for brackets added later',()=>{
  // A 20 in deep bracket, 3/4 x 10 in flanges, its top flange 1 1/2 in below the seat top.
  const [up,low]=flangeForceLevels({top:-1.5*inch,depth:20*inch,tf:.75*inch,bf:10*inch,label:'haunch',section:'BUILT-UP'});
  expect(up.base).toBeCloseTo(-1.875*inch,9);expect(up.band[0]).toBeCloseTo(-2.25*inch,9);expect(up.band[1]).toBeCloseTo(-1.5*inch,9);expect(low.base).toBeCloseTo(-21.125*inch,9);
  expect(low.plate).toEqual({width:10*inch,thickness:.75*inch,name:'BUILT-UP bottom flange'});expect(up.name).toBe('haunch top flange');
  // Flange resultants 100 kN (tension) and -80 kN with 2 kN·m in-plane moment on the top flange of a 250 mm flange.
  const f=flangeStiffenerForces([100e3,-80e3],[2e6,0],250);
  expect(f.upperT).toBeCloseTo(100e3+3*2e6/250,6);expect(f.upperC).toBeCloseTo(0,6);expect(f.lowerC).toBeCloseTo(80e3,6);
  expect(f.plates.upper).toEqual([50e3-12e3,50e3+12e3]);
  // A bracket type without levels gets no stiffener geometry.
  const existing=w14();existing.details=selectBracketArrangement(existing.details!,'existing-corbel');expect(bracketForceLevels(existing.details.bracket!,inch)).toBeUndefined();
 });
 it('gives the W stub flange forces with the in-plane flange bending as twice the more loaded half flange',()=>{
  const p=selectBracketArrangement(w14().details!,'rolled-corbel'),q=w14();q.details=p;const st=projectStub(q),{a,e}=stubBearing(q);
  const f=stubActions(st,a,e,[{vertical:100000,offset:150}],{longitudinal:10000,bottom:5000,offset:150}),s=stubStiffenerForces(st,f);
  const P=f.Mx/st.h0+f.N/2;expect(s.upperT).toBeCloseTo(P+3*Math.abs(f.Mtop)/st.bf,6);expect(s.lowerC).toBeCloseTo(f.Mx/st.h0-f.N/2+3*Math.abs(f.Mbot)/st.bf,6);
  expect(s.plates.upper[0]+s.plates.upper[1]).toBeCloseTo(P,6);
 });
});

describe('column stiffener checks on the bracket',()=>{
 it('fails the W14X90 flange at the ribs without stiffeners and takes it over with them',()=>{
  const bare=bracketChecks(w14(),welded(w14()));
  expect(byId(bare,'bracket-column-flange').status).toBe('fail');expect(bare.some(c=>c.id.includes('colstiff'))).toBe(false);
  const p=stiffened(),r=welded(p),checks=bracketChecks(p,r),flange=byId(checks,'bracket-column-flange');
  expect(flange.status).toBe('not-applicable');expect(flange.note).toContain('J10.8 column stiffeners');
  const upper=byId(checks,'bracket-colstiff-upper'),strip=byId(bare,'bracket-column-flange').capacity!;
  const tension=Math.min(byId(checks,'bracket-seat-flange').capacity!,2*strip,byId(checks,'bracket-seat-web').capacity!,byId(checks,'bracket-column-yield').capacity!);
  expect(upper.demand).toBeCloseTo(r.strength.stiffUpperT.value-tension,4);expect(upper.status).toBe('pass');
  for(const id of ['upper','lower','proportions','length','flange-weld','web-weld','web-shear','weld-minimum','weld-length','fit','fatigue-plate','fatigue-weld','fatigue-toe'])expect(byId(checks,'bracket-colstiff-'+id)?.status,id).toBe('pass');
  // The flange fillets carry the stiffener force on four throats over the contact beyond the clip.
  expect(byId(checks,'bracket-colstiff-flange-weld').demand).toBeCloseTo(upper.demand!/(4*5/16*inch/Math.SQRT2*6*inch),6);
  expect(byId(checks,'bracket-column-panel').note).toContain('doubler plate (J10.9) is outside this design');
  expect(checks.every(c=>c.referenceIds.length>0)).toBe(true);
 });
 it('designs the W-stub stiffeners at the stub flanges and converts the failing J10.1 check',()=>{
  const p=w14();p.details=selectBracketArrangement(p.details!,'rolled-corbel');p.details.bracket!.corbelShape='W12X58';
  // An older A36 column: J10.1 at 36 ksi.
  p.details.bracket!.receiver={...p.details.bracket!.receiver,Fy:36*ksi,Fu:58*ksi};
  const run=(q:ProjectInput)=>{const c=createRolledBracketCollector(q)!;c.observe('strength','s',0,[{vertical:100000,offset:230,length:120}],-1,{longitudinal:8000,bottom:6000,offset:230});c.observe('fatigue','b',0,[{vertical:30000,offset:230,length:120}],0);c.observe('service','v',0,[{vertical:30000,offset:0}],-1);return rolledBracketChecks(q,c.result);};
  const bare=run(p);expect(byId(bare,'wbracket-column-flange').status).toBe('fail');
  p.details.bracket!.columnStiffeners={...plates,thickness:.75*inch,flangeWeld:7/16*inch,webWeld:7/16*inch};
  const checks=run(p);expect(byId(checks,'wbracket-column-flange').status).toBe('not-applicable');
  for(const id of ['upper','lower','proportions','flange-weld','web-weld','fit'])expect(byId(checks,'wbracket-colstiff-'+id).status,id).toBe('pass');
  expect(validateBracket(p)).toEqual([]);
 });
 it('rejects stiffeners that do not fit or clash, and an unknown column fillet',()=>{
  const err=(p:ProjectInput)=>validateBracket(p).join(' ');
  // A 24 in built-up receiver has no catalogue shape: k must come from the survey.
  const built=cappedDemonstrationProject(),br=built.details!.bracket!;br.receiver={...br.receiver,depth:24*inch,width:14*inch,flangeThickness:inch,webThickness:.75*inch};
  br.columnStiffeners={...plates};expect(err(built)).toContain('enter the receiving column k');
  built.details!.bracket!.columnStiffeners!.columnK=1.5*inch;expect(err(built)).not.toContain('receiving column k');
  const tight=stiffened();tight.details!.bracket!.columnStiffeners!.clip=.5*inch;expect(err(tight)).toContain('does not clear the column\'s rolled fillet');
  const wide=stiffened();wide.details!.bracket!.columnStiffeners!.width=7.5*inch;expect(err(wide)).toContain('do not fit within the column flange');
  const high=stiffened();high.details!.bracket!.columnStiffeners!.upperOffset=2*inch;expect(err(high)).toContain('upper pair must be centered within the seat');
  const thick=stiffened();thick.details!.bracket!.columnStiffeners!.flangeWeld=inch;expect(err(thick)).toContain('smaller than the plate thickness');
  expect(err(stiffened())).toBe('');
  // New columns with designed crane-level bracing: the rod gusset on the web at the seat work point.
  const nc=newColumnDemonstrationProject();nc.details!.bracket!.columnStiffeners={...plates,width:6.5*inch};expect(err(nc)).toContain('clashes with the crane-level bracing gusset');
  nc.longitudinalBracing!.enabled=false;expect(err(nc)).not.toContain('gusset');
  const existing=w14();existing.details=selectBracketArrangement(existing.details!,'existing-w-corbel');existing.details.bracket!.columnStiffeners={...plates};expect(err(existing)).toContain('designed for the welded twin-rib, haunched and W-stub brackets');
  expect(projectSchema.safeParse(stiffened()).success).toBe(true);
  const bad=stiffened();(bad.details!.bracket!.columnStiffeners as {length:string}).length='third';expect(projectSchema.safeParse(bad).success).toBe(false);
 });
 it('identifies the column fillet only from a matching catalogue shape or the survey',()=>{
  const b=stiffened().details!.bracket!;
  expect(receiverK(b,{enabled:true,shape:'W14X90'})?.k).toBeCloseTo(1.31*inch,9);
  expect(receiverK(b,{enabled:true,shape:'W14X99'})).toBeUndefined();
  expect(receiverK(b,{enabled:true,isNew:true,shape:'W14X120'})?.source).toBe('AISC W14X120');
 });
});

describe('uplift held down by the bolted end bearings',()=>{
 const lift=(p:ProjectInput)=>{const c=createBracketCollector(p)!;c.observe('strength','down',0,[{vertical:60000,offset:-200,length:120}],-1);c.observe('strength','lift',0,[{vertical:-20000,offset:300,length:120},{vertical:50000,offset:-300,length:120}],-1);return c;};
 it('passes with the hold-down and checks the reversed set through the bolt rows',()=>{
  const p=cappedDemonstrationProject(),c=lift(p),checks=bracketChecks(p,c.result),eb=p.details!.endBearing!,L=p.details!.bearing.length;
  const up=byId(checks,'bracket-uplift');expect(up.status).toBe('pass');expect(up.demand).toBeCloseTo(20000,6);expect(up.note).toContain('bolted end-bearing bolts');
  for(const id of ['rib-flexure','rib-shear','seat-flexure','seat-weld','root-weld'])expect(byId(checks,'bracket-uplift-'+id)?.status,id).toBe('pass');
  // The demonstration's column stiffeners take the reversed flange forces (checked with the stiffeners' reversed set).
  expect(byId(checks,'bracket-uplift-column-flange')?.status).toBe('not-applicable');
  // The lifting end pulls the seat up at its two bolt rows, half at each, about its bearing center 0.3L inboard of the patch.
  const center=300-.3*L,row=L/2-eb.bolts.edge,b=p.details!.bracket!;
  const q=bracketResponse(p,[{vertical:-10000,offset:center-row,length:2*eb.bolts.diameter},{vertical:-10000,offset:center+row,length:2*eb.bolts.diameter},{vertical:50000,offset:-300,length:120}]);
  expect(c.result.strength.upSeatNormal.value).toBeCloseTo(q.seatNormal,6);
  expect(q.seatNormal).toBeCloseTo(6*seatStrip([{vertical:-10000,offset:center-row,length:2*eb.bolts.diameter},{vertical:-10000,offset:center+row,length:2*eb.bolts.diameter},{vertical:50000,offset:-300,length:120}],b.ribSpacing,L).moment/(p.details!.bearing.width*b.seatThickness**2),6);
 });
 it('still fails without a hold-down',()=>{
  const p=cappedDemonstrationProject();p.details!.endBearing!.enabled=false;const checks=bracketChecks(p,lift(p).result);
  expect(byId(checks,'bracket-uplift').status).toBe('fail');expect(checks.some(c=>c.id.startsWith('bracket-uplift-'))).toBe(false);
 });
});

describe('seat fatigue at the rib fillet toes (AISC Table A-3.1 item 7.1)',()=>{
 it('uses Category C for ribs under 2 in thick along the seat stress, D to 4 in',()=>{
  const b=cappedDemonstrationProject().details!.bracket!;
  expect(seatFatigueCategory(b).name).toBe('C');expect(seatFatigueCategory({...b,ribThickness:2.5*inch}).name).toBe('D');expect(seatFatigueCategory({...b,ribThickness:5*inch}).name).toBe("E'");
  const p=cappedDemonstrationProject(),r=welded(p),seat=byId(bracketChecks(p,r),'bracket-fatigue-seat');
  const damage=r.fatigue.reduce((s,v)=>s+(v.seat/(6900*(4.4/v.cycles)**(1/3)))**3,0);
  expect(seat.demand).toBeCloseTo(damage,12);expect(seat.note).toContain('item 7.1, Category C');expect(seat.note).toContain('R_FIL');
  // The former bound, min(E', R_FIL C) on the seat thickness and fillet, is the larger damage by (C / E'-or-R_FIL^3 C).
  const old=r.fatigue.reduce((s,v)=>s+(v.seat/Math.min(6900*(.39/v.cycles)**(1/3),6900*Math.min(1,(.103+1.24*b.seatWeld/b.seatThickness)/b.seatThickness**.167)*(4.4/v.cycles)**.333))**3,0);
  expect(old/damage).toBeGreaterThan(10);
 });
});

describe('column stiffener drawings and model',()=>{
 const render=(p:ProjectInput)=>bracketTopic(snapshot(p))!.views.map(v=>({title:v.title,svg:v.render().svg}));
 it('calls out the engine sizes, clips and welds with the field flag on an existing column',()=>{
  const views=render(stiffened()),all=views.map(v=>v.svg).join('');
  expect(views.map(v=>v.title)).toContain(columnStiffenerTitle);
  expect(all).toContain('2 PAIRS COL. STIFFENERS PL 1&quot; X 6 3/4&quot; X 6 5/16&quot;');
  expect(all).toContain('HALF DEPTH, 3/4&quot; CLIPS, FIELD WELDED');
  const plan=views.find(v=>v.title===columnStiffenerTitle)!.svg;
  expect(plan).toContain('3/4&quot; X 3/4&quot; CORNER CLIPS');expect(plan).toContain('>5/16<');expect((plan.match(/data-weld-location="field"/g)??[]).length).toBe(2);
  expect(views[2].svg).toContain('class="hidden-line"');
 });
 it('shop welds the stiffeners on a new column and builds the plates and welds in the model',()=>{
  const nc=newColumnDemonstrationProject();nc.longitudinalBracing!.enabled=false;nc.existingColumn!.longitudinal='column';nc.details!.bracket!.columnStiffeners={...plates,width:6.5*inch};
  const plan=render(nc).find(v=>v.title===columnStiffenerTitle)!.svg;expect(plan).not.toContain('data-weld-location="field"');expect(plan).toContain('BOTH FACES, SHOP');
  const b=stiffened().details!.bracket!,group=new THREE.Group(),steel=new THREE.MeshBasicMaterial(),edge=new THREE.LineBasicMaterial();
  addColumnStiffeners(group,b,[0,5],0,steel,edge,steel,false);
  const plate=group.getObjectByName('CS-S1-upper-1')!,box=new THREE.Box3().setFromObject(plate),size=box.getSize(new THREE.Vector3());
  expect(size.y*1000).toBeCloseTo(inch,3);expect(size.x*1000).toBeCloseTo(6.75*inch,3);expect(size.z*1000).toBeCloseTo(6.29*inch,3);
  expect(box.min.z*1000).toBeCloseTo(b.reach+.71*inch,3);expect((box.min.y+box.max.y)/2*1000).toBeCloseTo(-inch,3);
  const welds=group.children.filter(o=>o.userData.part?.weld);expect(welds.length).toBe(2*2*2*2*2);
  expect(welds.every(o=>o.userData.part.weld.location==='field'&&o.userData.part.weld.existingSteel)).toBe(true);
 });
});

/** Text over text and annotation, grid, steel or hidden lines through text on a sheet, as the plan-check QA counts them. */
function sheetClashes(svg:string){
 const content=svg.slice(svg.indexOf('<g data-sheet-content'),svg.indexOf('<g data-title-block')),pt=(q:number[])=>[q[0]*72,1728-q[1]*72];
 const entities=sheetEntities(content,'US'),out:string[]=[];
 const boxes=entities.flatMap(e=>{
  if(e.type!=='text'||e.layer!=='S-ANNO-TEXT')return [];
  const size=e.height*72/.716,w=textWidth(e.value,size,e.bold),[x,y]=pt(e.at),a=e.align===1?-w/2:e.align===2?-w:0;
  const b=Math.abs(e.angle)<1?{x0:x+a,x1:x+a+w,y0:y-size*.72,y1:y+size*.21}:Math.abs(e.angle-90)<1?{x0:x-size*.72,x1:x+size*.21,y0:y-a-w,y1:y-a}:{x0:x-size*.21,x1:x+size*.72,y0:y+a,y1:y+a+w};
  return [{v:e.value,size,b}];
 });
 const crosses=(p:number[],q:number[],r:{x0:number;y0:number;x1:number;y1:number})=>{let t0=0,t1=1;const dx=q[0]-p[0],dy=q[1]-p[1];
  for(const [a,c] of [[-dx,p[0]-r.x0],[dx,r.x1-p[0]],[-dy,p[1]-r.y0],[dy,r.y1-p[1]]]){if(a===0){if(c<0)return false;continue;}const t=c/a;if(a<0){if(t>t1)return false;t0=Math.max(t0,t);}else{if(t<t0)return false;t1=Math.min(t1,t);}}
  return t1-t0>1e-6;};
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i].b,b=boxes[j].b,m=1.2;if(a.x0<b.x1-m&&b.x0<a.x1-m&&a.y0<b.y1-m&&b.y0<a.y1-m)out.push(`"${boxes[i].v}" x "${boxes[j].v}"`);}
 for(const e of entities){
  if((e.type!=='line'&&e.type!=='poly')||!['S-ANNO','S-ANNO-HEAVY','S-GRID','S-STEEL-NEW','S-EXISTING','S-RAIL','S-STEEL-HIDDEN'].includes(e.layer))continue;
  const q=(e.type==='line'?[e.a,e.b]:e.points).map(pt),segs:number[][][]=[];for(let k=1;k<q.length;k++)segs.push([q[k-1],q[k]]);if(e.type==='poly'&&e.closed)segs.push([q[q.length-1],q[0]]);
  for(const t of boxes){if(t.v.length<=2&&e.layer!=='S-ANNO'&&e.layer!=='S-GRID')continue;const s=t.size,b={x0:t.b.x0+s*.12,x1:t.b.x1-s*.12,y0:t.b.y0+s*.12,y1:t.b.y1-s*.25};
   if(segs.some(([a,c])=>crosses(a,c,b)))out.push(`line through "${t.v}"`);}
 }
 return out;
}
const failing=(s:CalculationSnapshot)=>s.checks.filter(c=>!['pass','not-applicable','excluded'].includes(c.status));
describe('column stiffener test projects, full calculation and drawing set',()=>{
 it('makes the capped twin-rib bracket on a W14X90 pass, its drawing set clear in US and SI',()=>{
  const bare=calculate(cappedTwinRibW14X90(false));expect(bare.errors).toEqual([]);
  expect(failing(bare).map(c=>c.id)).toEqual(['bracket-column-flange']);expect(failing(bare)[0].utilization).toBeCloseTo(1.376,3);
  const s=calculate(cappedTwinRibW14X90(true));expect(s.errors).toEqual([]);expect(s.eligible).toBe(true);
  expect(failing(s).map(c=>c.id)).toEqual([]);
  expect(s.checks.find(c=>c.id==='bracket-column-flange')!.status).toBe('not-applicable');
  expect(s.checks.filter(c=>c.id.startsWith('bracket-colstiff-')).length).toBe(13);
  for(const units of ['US','SI'] as const){
   const v=structuredClone(s);v.input.units=units;const sheets=drawingSheetSet(v);
   for(const sheet of sheets)expect(sheetClashes(sheet.svg),`${units} ${sheet.number}`).toEqual([]);
   const all=sheets.map(x=>x.svg).join('');expect(all).toContain(columnStiffenerTitle);expect(all).toContain('INSPECTION');expect(all).toContain('COLUMN STIFFENERS');
   for(const view of bracketTopic(v)!.views)expect(annotationClashes(view.render().svg),`${units} ${view.title}`).toBe(0);
  }
 },600000);
 it('passes the W12X58 stub on an A36 W14X90 and the new W14X90 columns with stiffeners',()=>{
  for(const p of [cappedStubW14X90(true),newW14X90Columns(true)]){const s=calculate(p);expect(s.errors).toEqual([]);expect(failing(s).map(c=>c.id),p.title).toEqual([]);}
 },600000);
});

import {describe,expect,it} from 'vitest';
import {reviewOpenItem} from './review/openItems';
import {calculate,validateProject} from '../src/engine/calculate';
import {newColumnDemonstrationProject} from '../src/engine/demonstration';
import {defaultColumnCap} from '../src/engine/columnCapInputs';
import {capAlongEccentricity,capForkStiffness,capWeldGroup,capWorkPointDrop,columnCapChecks,columnCapGeometry,createColumnCapCollector,nutDrop,stiffenerClip,validateColumnCap} from '../src/engine/columnCap';
import {existingColumnEccentricity} from '../src/engine/existingColumn';
import {bracingLayout,girderOffset} from '../src/engine/newColumnBracing';
import {aiscShapeByName} from '../src/data/aiscSections';
import {drawingSheetSet} from '../src/components/planSheet';
import type {SupportForceSet} from '../src/engine/bracketForces';
import type {ProjectInput} from '../src/engine/types';

const inch=25.4,kip=4448.2216152605,ksi=6.894757293168;
const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')).join(' ');
/** The new-column demonstration (2-ton capped runway, three simple spans) on column caps instead of brackets. */
export function cappedColumnProject():ProjectInput{
 const p=newColumnDemonstrationProject(),d=p.details!,c=p.existingColumn!;
 d.bracket!.enabled=false;d.brace.flangeAttachment!.enabled=false;p.aist!.supportType='column';
 c.height=c.seatElevation;c.Lcx=2.1*c.height;c.Lcy=c.height;c.Lcz=c.height;c.Lb=c.height;
 p.columnCap={...structuredClone(defaultColumnCap),enabled:true};
 p.longitudinalBracing!.height=c.seatElevation-capWorkPointDrop(p);
 return p;
}

describe('column cap geometry, load path and validation',()=>{
 const p=cappedColumnProject(),g=columnCapGeometry(p),w=aiscShapeByName('W14X120')!,bs=p.details!.bearing,gap=p.details!.simpleSupport!.endGap;
 it('centers the girder on the column and puts a cap stiffener under every girder bearing stiffener off the web',()=>{
  expect(validateProject(p)).toEqual([]);
  // Two girder ends on every interior grid, one at each runway end; each bearing stiffener at mid-bearing.
  expect(g.grids.map(v=>v.bearings.length)).toEqual([1,2,2,1]);
  const interior=g.grids[1];
  expect(interior.bearings.map(b=>b.center).sort((a,c)=>a-c)).toEqual([-(gap/2+bs.length/2),gap/2+bs.length/2].map(v=>expect.closeTo(v,6)));
  expect(interior.stiffeners.length).toBe(2);expect(interior.bearings.every(b=>b.line==='stiffener')).toBe(true);
  // Four bolts per girder end at the gauge, rows the end distance from each bearing plate end.
  const e=p.details!.endBearing!.bolts;
  expect(interior.bolts.length).toBe(8);
  expect(Math.min(...interior.bolts.filter(o=>o.x>0).map(o=>o.x))).toBeCloseTo(gap/2+e.edge,6);
  expect(new Set(interior.bolts.map(o=>Math.abs(o.z)))).toEqual(new Set([e.gauge/2]));
  // The girder is centered: only the rail eccentricity is left across the runway, none at the strut.
  expect(existingColumnEccentricity(p)).toBeCloseTo(Math.abs(p.railEccentricity),9);
  expect(girderOffset(p)).toBe(0);
  // The strut drops below the cap, its stiffeners and the bearing nuts.
  const sd=aiscShapeByName(p.longitudinalBracing!.design!.strut.shape)!.d*inch,cap=p.columnCap!;
  expect(g.hang).toBeCloseTo(Math.max(cap.stiffener.height,nutDrop(e.diameter)),9);
  expect(capWorkPointDrop(p)).toBeCloseTo(Math.ceil((cap.plate.thickness+g.hang+inch/2+sd/2)/(inch/4)-1e-9)*inch/4,9);
  expect(bracingLayout(p).height).toBeCloseTo(p.existingColumn!.seatElevation-capWorkPointDrop(p),9);
  // Each end reaction along the runway at 0.8 of its bearing length from its girder end, for the column's weak axis.
  expect(capAlongEccentricity(p,1)).toBeCloseTo(gap/2+.8*bs.length,6);
  expect(capAlongEccentricity(p,0)).toBeCloseTo(.8*bs.length,6);
  // Clips clear the cap fillet; the column web fillet comes from the catalogue.
  expect(stiffenerClip(cap)).toBeCloseTo(inch/2,9);
  expect(g.col.kdes).toBeCloseTo(w.kdes*inch,9);
 });
 it('rejects a cap that does not fit the column, the bearings or the arrangement',()=>{
  const bad=(edit:(q:ProjectInput)=>void)=>{const q=cappedColumnProject();edit(q);return [...validateProject(q),...validateColumnCap(q)].join(' ');};
  expect(bad(q=>{q.columnCap!.plate.width=14.5*inch;})).toContain('weld size plus 1/8 in beyond each column flange face');
  expect(bad(q=>{q.columnCap!.plate.length=20*inch;})).toContain('every girder bearing plate and its bolts must sit on the cap');
  expect(bad(q=>{q.details!.bracket!.enabled=true;})).toContain('choose either the welded bracket or the column cap');
  expect(bad(q=>{q.aist!.supportType='bracket';})).toContain('direct column bearing');
  expect(bad(q=>{q.details!.brace.flangeAttachment!.enabled=true;})).toContain('disable the direct flange ties');
  expect(bad(q=>{q.details!.endBearing!.enabled=false;})).toContain('enable the bolted end bearings');
  expect(bad(q=>{q.existingColumn!.height+=12*inch;})).toContain('the column stops at the cap');
  expect(bad(q=>{q.lateralBraceSpacing=q.spans[0]/2;})).toContain('intermediate flange braces');
  // Longer girder bearings move the bearing stiffener and its cap stiffener past the column flange tips.
  expect(bad(q=>{q.details!.bearing.length=16*inch;q.columnCap!.plate.length=36*inch;})).toContain('must land on the column flanges');
  // Bolts too close to the column web for the nut and wrench, reported as a failed check, not a validation error.
 });
});

describe('column cap limit states by hand',()=>{
 const p=cappedColumnProject(),g=columnCapGeometry(p),cap=p.columnCap!,bs=p.details!.bearing,col=g.col,m=p.details!.material,b=p.section;
 const set=(id:string,left:number,right:number,top:number,bottom:number,longitudinal=0):SupportForceSet=>{
  const ends=g.grids[1].bearings.map(v=>({bay:v.bay!,end:v.end!,vertical:v.end==='right'?left:right,offset:v.center}));
  return {id,combination:'LRFD 2b',vertical:left+right,moment:0,longitudinal,top,bottom,ends};
 };
 const collector=createColumnCapCollector(p)!;
 collector.observe('strength',g.grids[1].x,set('A',40*kip,10*kip,3*kip,-1*kip,5*kip));
 collector.observe('strength',g.grids[1].x,set('B',-2*kip,-1*kip,1*kip,1*kip));
 const r=collector.finish(),checks=columnCapChecks(p,r,{imperfection:0,required:1}),check=(id:string)=>checks.find(c=>c.id===`column-cap-${id}`)!;
 it('records the largest end reaction, uplift, lateral force and fork at each bearing',()=>{
  const grid=r.grids[1];
  expect(Math.max(...grid.bearings.map(v=>v.R.value))).toBeCloseTo(40*kip,6);
  expect(grid.uplift.value).toBeCloseTo(2*kip,6);expect(grid.lateral.value).toBeCloseTo(2*kip,6);
  // Fork moment about the bearing underside: the top flange force at its centroid, the bottom one at mid-flange.
  expect(grid.fork.value).toBeCloseTo(3*kip*(b.d-b.tf/2)-1*kip*b.tf/2,3);
 });
 it('cap plate: the cantilever from the cap stiffener to the bearing plate end under uniform pressure (AISC F11)',()=>{
  const q=40*kip/(bs.width*bs.length),c=bs.length/2,M=q*c*c/2;
  expect(check('plate').demand).toBeCloseTo(4*M/cap.plate.thickness**2,6);
  expect(check('plate').capacity).toBeCloseTo(.9*Math.min(m.Fy,col.Fy),6);
 });
 it('cap stiffener: fitted bearing, shear at both flanges and the four fillet lines',()=>{
  const R=40*kip,ts=cap.stiffener.thickness,Lw=cap.stiffener.height-g.clip,throat=cap.stiffener.weld/Math.SQRT2;
  expect(check('stiffener-bearing').capacity).toBeCloseTo(.75*1.8*m.Fy*ts*(col.d-2*col.tf-2*g.clip),6);
  expect(check('stiffener-shear').demand).toBeCloseTo(R/2,6);expect(check('stiffener-shear').capacity).toBeCloseTo(.6*m.Fy*ts*cap.stiffener.height,6);
  expect(check('stiffener-weld').demand).toBeCloseTo(R/2/(2*Lw)/throat,6);expect(check('stiffener-weld').capacity).toBeCloseTo(.75*.6*m.Fexx,6);
  expect(check('web-yield').status).toBe('not-applicable');
 });
 it('all-around cap weld group and the bearing bolts with the fork couple',()=>{
  const wg=capWeldGroup(p),xr=col.tw/2+col.fillet;
  expect(wg.A).toBeCloseTo(2*col.bf+4*(col.bf/2-xr)+2*(col.d-2*col.kdes),6);
  // Bolt tension: the uplift share and the fork moment over the lever from the tension bolts to bearing at the far edge.
  const lever=g.gauge/2+Math.min(b.bf,bs.width)/2-g.db,fork=3*kip*(b.d-b.tf/2)-1*kip*b.tf/2;
  expect(g.lever).toBeCloseTo(lever,9);
  expect(check('bolt-tension').demand).toBeCloseTo(fork/(2*lever),3);
  // A reaction over the web uses J10.2 at the column end with the cap as the loaded flange.
  const q=cappedColumnProject();q.system='continuous';q.details!.endBearing!.enabled=true;
  const gq=columnCapGeometry(q);expect(gq.grids[1].bearings[0].line).toBe('web');
 });
 it('fork stiffness: stiffener cantilever and the bolt couple in series',()=>{
  const k=capForkStiffness(p),E=b.E,ts=bs.stiffenerThickness,outer=b.tw/2+bs.stiffenerWidth,inner=b.tw/2+bs.cope,L=b.d-1.5*b.tf;
  const I=2*ts*(outer**3-inner**3)/3;
  expect(k.I).toBeCloseTo(I,3);expect(k.parts.bending).toBeCloseTo(L**3/(3*E*I),12);
  expect(1/k.k).toBeCloseTo(k.parts.bending+k.parts.shear+k.parts.rotation,12);
 });
});

describe('new-column demonstration on column caps',()=>{
 const p=cappedColumnProject(),s=calculate(p),check=(id:string)=>s.checks.find(c=>c.id===id);
 it('designs every limit state with the girder centered on the columns',()=>{
  expect(s.errors).toEqual([]);
  expect(s.checks.filter(c=>['fail','unsupported','unverified','incomplete'].includes(c.status)&&!reviewOpenItem(c)).map(c=>`${c.id} ${c.status}`)).toEqual([]);
  expect(s.eligible).toBe(true);
  // AIST §5.9.2: direct column bearing, so the bracket limit is not applied, for a stated reason.
  expect(check('column-brackets')?.status).toBe('not-applicable');expect(check('column-brackets')?.note).toContain('column caps');
  // The fork replaces the top-flange tie in the strength checks and in the lateral-torsional model.
  for(const id of ['brace-member','brace-stiffness','tie-bolt','tie-weld-fatigue'])expect(check(id),id).toBeUndefined();
  for(const id of ['column-cap-plate','column-cap-weld','column-cap-stiffener-weld','column-cap-bolt-tension','column-cap-fork-stiffness','column-cap-weld-fatigue','stiffener-lateral-flexure'])expect(check(id)?.status,id).toBe('pass');
  expect(s.detailResults!.columnCap!.fork.k).toBeCloseTo(capForkStiffness(p).k,6);
  expect(check('end-bearing-seat')).toBeUndefined();
 });
 it('draws the cap on S-01, the column sheet and its own details, with no bracket or tie details',()=>{
  const sheets=drawingSheetSet(s),all=sheets.map(v=>v.svg).join(''),words=texts(all),cap=p.columnCap!;
  expect(all).not.toContain('NOT IN SET');
  for(const view of ['bracket-connection','welded-bracket-face','welded-bracket-side','welded-bracket-plan','tie-connection','flange-tie-plan','independent-tie-plan','independent-end-elevation'])expect(all,view).not.toContain(`data-view="${view}"`);
  for(const view of ['column-cap-section','column-cap-arrangement'])expect(all).toContain(`data-view="${view}"`);
  expect(words).toContain(`CAP PL 1 1/2" X 1'-4" X 2'-2"`);
  expect(words).toContain('COLUMN CAP DESIGN FORCES');expect(words).not.toContain('BRACKET DESIGN FORCES');
  expect(words).toContain('CAP TO COLUMN');
  expect(texts(sheets.find(v=>v.number==='S-01')!.svg)).toContain('COLUMN CAP, SEE');
  // Weld symbols carry the engine's sizes: the all-around cap fillet and the cap stiffener fillets.
  const at=all.indexOf('data-view="column-cap-section"'),section=all.slice(at,all.indexOf('data-view=',at+10));
  expect(section).toContain('data-weld-all-around="true"');expect(texts(section)).toContain('CAP TO COLUMN');
  expect(words).toContain(`${(cap.weld/inch*16).toFixed(0)}/16`);
  // The S-00 scope states the arrangement.
  expect(texts(sheets[0].svg).toUpperCase()).toContain('WITH COLUMN CAPS');
 });
});

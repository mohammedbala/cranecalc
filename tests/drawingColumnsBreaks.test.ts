import {describe,expect,it} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {newColumnDemonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';
import {drawingSheetSet} from '../src/components/planSheet';
import {planSheetGeometry} from '../src/components/planSheetGeometry';
import {defaultFraming,drawnFrameStyle} from '../src/components/framingSettings';
import {sheetsDxf,sheetEntities} from '../src/components/sheetDxf';
import {engineeringSketches} from '../src/components/drafting';
import type {Entity,Pt} from '../src/components/svgEntities';
import {demoFocus005RevB} from './fixtures/demoFocus005RevB';

/**
 * The existing W14X90 building columns (and any new column) are prismatic: every view draws them at their constant
 * depth, never tapered as the illustrative metal-building frame. Break lines only where a member is shortened to fit
 * its view: never on a short, dimensioned piece (the cap tie plate, the girder depth in the haunch elevation), one
 * break line across a stack of plies, one across the shortened crane span, and an elevation column stub broken once.
 * One calculate of DEMO-FOCUS-005 rev B.
 */
const s=calculate(demoFocus005RevB()),sheets=drawingSheetSet(s),sheet=(n:string)=>sheets.find(v=>v.number===n)!.svg;
const inch=25.4;

/** The sheet with every data-view group but `keep` removed (the sheet frame, title block and notes stay). */
function keepView(svg:string,keep?:string){
 const groups:{name:string;start:number;end:number}[]=[];
 for(const m of svg.matchAll(/<g data-view="([^"]+)"/g)){
  let depth=0;const re=/<(\/?)g\b[^>]*?(\/?)>/g;re.lastIndex=m.index!;
  for(let t=re.exec(svg);t;t=re.exec(svg)){if(t[2])continue;depth+=t[1]?-1:1;if(!depth){groups.push({name:m[1],start:m.index!,end:re.lastIndex});break;}}
 }
 const kept=groups.find(g=>g.name===keep);if(keep)expect(kept,keep).toBeDefined();
 // Remove the outermost groups that neither are nor hold the kept view (views can nest).
 const holds=(g:typeof groups[number],h:typeof groups[number])=>g.start<=h.start&&h.end<=g.end;
 const drop=groups.filter(g=>g!==kept&&!(kept&&holds(g,kept))),outer=drop.filter(g=>!drop.some(h=>h!==g&&holds(h,g)));
 let out=svg;for(const g of outer.sort((a,b)=>b.start-a.start))out=out.slice(0,g.start)+out.slice(g.end);
 return out;
}
const segments=(e:Entity[]):[Pt,Pt][]=>e.flatMap(v=>v.type==='line'?[[v.a,v.b] as [Pt,Pt]]:v.type==='poly'?v.points.slice(1).map((p,i)=>[v.points[i],p] as [Pt,Pt]).concat(v.closed?[[v.points.at(-1)!,v.points[0]]]:[]):[]);
/** Straight edges on a layer longer than `min` paper inches that are neither vertical nor horizontal. */
const slanted=(e:Entity[],layer:string,min=.4)=>segments(e.filter(v=>v.layer===layer)).filter(([a,b])=>{
 const dx=Math.abs(b[0]-a[0]),dy=Math.abs(b[1]-a[1]);return Math.hypot(dx,dy)>min&&dx>1e-3&&dy>1e-3;});
/** A zig-zag break line (sheetGraphics breakLine): ends and inner shoulders on one line, two peaks either side of it. */
function zigzag(points:Pt[],amplitude?:number){
 if(points.length!==6)return false;
 const [a,,,,,b]=points,L=Math.hypot(b[0]-a[0],b[1]-a[1]);if(L<1e-9)return false;
 const off=points.map(p=>((p[0]-a[0])*-(b[1]-a[1])+(p[1]-a[1])*(b[0]-a[0]))/L),peak=Math.abs(off[2]),tol=1e-3*Math.max(L,peak);
 return peak>tol&&(amplitude===undefined||Math.abs(peak-amplitude)<2e-3)&&[0,1,4,5].every(i=>Math.abs(off[i])<tol)&&Math.abs(off[2]+off[3])<tol;
}
/** The break lines among the entities (peaks 4 pt either side of the line, in paper inches): the midpoint of each. */
const breaks=(e:Entity[]):Pt[]=>e.flatMap(v=>v.type==='poly'&&!v.closed&&v.layer==='S-ANNO'&&zigzag(v.points,4/72)?[[(v.points[0][0]+v.points[5][0])/2,(v.points[0][1]+v.points[5][1])/2] as Pt]:[]);
/** Entities of one view in sheet paper inches: those of the sheet with only that view, less those of the sheet without views. */
function viewEntities(n:string,view:string){
 const svg=sheet(n),none=new Set(sheetEntities(keepView(svg),'US').map(v=>JSON.stringify(v)));
 return sheetEntities(keepView(svg,view),'US').filter(v=>!none.has(JSON.stringify(v)));
}

describe('prismatic W columns',()=>{
 it('draws a surveyed existing or a new column as a rolled, constant-depth section in the reference framing',()=>{
  const p=demoFocus005RevB();
  expect(p.existingColumn?.enabled&&p.existingColumn.shape).toBe('W14X90');
  expect(drawnFrameStyle(p,defaultFraming)).toBe('rolled');
  // The illustrative tapered metal building stays the default for a project with no entered column.
  const unsurveyed=cappedDemonstrationProject();delete unsurveyed.existingColumn;
  expect(drawnFrameStyle(unsurveyed,defaultFraming)).toBe('tapered');
  for(const project of [p,newColumnDemonstrationProject()]){
   const m=planSheetGeometry(project),depths=[-6,-3,-1,0,1,3,6].map(y=>m.columnDepthAt(y));
   for(const d of depths)expect(d).toBeCloseTo(depths[0],9);
  }
  const m=planSheetGeometry(p);
  expect(m.column.d*1000/inch).toBeCloseTo(14.0,2);expect(m.column.bf*1000/inch).toBeCloseTo(14.5,2);
  expect(m.columnDepthAt(0)*1000/inch).toBeCloseTo(14.0,2);
 },900000);

 it('has no tapered (slanted) column edge in any view that draws the column',()=>{
  const views:[string,string][]=[['S-01','typical-section'],['S-01','elevation'],['S-02','bracket-connection'],['S-02','tapered-haunch-elevation'],
   ['S-02','tapered-haunch-plan'],['S-02','column-stiffener-plan'],['S-03','cap-angle-section'],['S-03','cap-angle-plan']];
  for(const [n,view] of views)expect(slanted(viewEntities(n,view),'S-EXISTING'),`${n} ${view}`).toEqual([]);
  // The tapered haunch itself is still drawn tapered: its sloping bottom flange is new steel.
  expect(slanted(viewEntities('S-02','tapered-haunch-elevation'),'S-STEEL-NEW').length).toBeGreaterThan(0);
 },900000);

 it('draws the columns of the typical section in the DXF as parallel flange lines 14.0 in apart',()=>{
  const e=viewEntities('S-01','typical-section'),xs=e.flatMap(v=>v.type==='line'?[v.a,v.b]:v.type==='poly'?v.points:v.type==='circle'?[v.center]:[]);
  const box={x0:Math.min(...xs.map(p=>p[0])),x1:Math.max(...xs.map(p=>p[0])),y0:Math.min(...xs.map(p=>p[1])),y1:Math.max(...xs.map(p=>p[1]))};
  // The DXF as written: LINE and LWPOLYLINE entities on the existing-steel layer inside the section.
  const dxf=sheetsDxf([{svg:sheet('S-01')}],'US').split('\n').map(v=>v.trim()),lines:[Pt,Pt][]=[];
  for(let i=0;i<dxf.length;i++){
   if(dxf[i]!=='LINE'&&dxf[i]!=='LWPOLYLINE')continue;
   const pairs=new Map<string,string[]>();let j=i+1;for(;j+1<dxf.length&&dxf[j]!=='0';j+=2)pairs.set(dxf[j],[...(pairs.get(dxf[j])??[]),dxf[j+1]]);
   if(pairs.get('8')?.[0]!=='S-EXISTING')continue;
   const X=(pairs.get('10')??[]).map(Number),Y=(pairs.get('20')??[]).map(Number);
   if(dxf[i]==='LINE')lines.push([[X[0],Y[0]],[Number(pairs.get('11')![0]),Number(pairs.get('21')![0])]]);
   else for(let k=1;k<X.length;k++)lines.push([[X[k-1],Y[k-1]],[X[k],Y[k]]]);
  }
  const inside=lines.filter(([a,b])=>[a,b].every(p=>p[0]>=box.x0-1e-6&&p[0]<=box.x1+1e-6&&p[1]>=box.y0-1e-6&&p[1]<=box.y1+1e-6));
  expect(inside.length).toBeGreaterThan(0);
  const long=inside.filter(([a,b])=>Math.hypot(b[0]-a[0],b[1]-a[1])>1);
  expect(long.length).toBeGreaterThanOrEqual(4);
  for(const [a,b] of long)expect(Math.abs(b[0]-a[0]),'column edge vertical in the DXF').toBeLessThan(1e-4);
  // Each column: its outer flange faces (the outermost long verticals at that column) 14.0 in apart at 1/2" = 1'-0".
  expect(sheet('S-01')).toContain('TYPICAL RUNWAY SECTION');
  const k=.5/12,xsLong=[...new Set(long.map(([a])=>Number(a[0].toFixed(4))))].sort((a,b)=>a-b),mid=(box.x0+box.x1)/2;
  for(const side of [xsLong.filter(x=>x<mid),xsLong.filter(x=>x>mid)]){
   expect(side.length).toBeGreaterThanOrEqual(2);
   expect((side.at(-1)!-side[0])/k).toBeCloseTo(14.0,1);
  }
 },900000);
});

describe('break lines',()=>{
 const counts=Object.fromEntries(sheets.map(v=>[v.number,breaks(sheetEntities(v.svg,'US')).length]));
 it('keeps the break lines per sheet within a sensible bound',()=>{
  // Rev B before: S-01 20, S-02 11, S-03 16.
  expect(counts['S-00']).toBe(0);
  expect(counts['S-01']).toBeLessThanOrEqual(13);
  expect(counts['S-02']).toBeLessThanOrEqual(5);
  expect(counts['S-03']).toBeLessThanOrEqual(10);
  for(const n of Object.keys(counts))expect(counts[n],n).toBeLessThanOrEqual(13);
 },900000);
 it('breaks no member drawn to its full length and no short dimensioned piece',()=>{
  // The girder end in the haunch elevation is drawn full depth; the cap tie plates whole.
  expect(breaks(viewEntities('S-02','tapered-haunch-elevation'))).toEqual([]);
  // The cap tieback section: the cap channel and girder web (cut away) and the column above and below, not the tie plate.
  expect(breaks(viewEntities('S-03','cap-angle-section')).length).toBe(4);
  // The shared-column plan: the two girder ends only.
  expect(breaks(viewEntities('S-03','cap-angle-plan')).length).toBe(2);
  // The sliding bolt section: one break line each side across the flange, bearing plate and seat.
  expect(breaks(viewEntities('S-02','sliding-bolt')).length).toBe(2);
 },900000);
 it('breaks each elevation column once at its foot, and the shortened crane span once',()=>{
  const supports=s.input.spans.length+1,el=breaks(viewEntities('S-01','elevation'));
  expect(el.length).toBe(supports);
  // One row of breaks, at the foot of the column stubs below the girder.
  expect(Math.max(...el.map(p=>p[1]))-Math.min(...el.map(p=>p[1]))).toBeLessThan(1e-6);
  // The typical section: the columns above and below the band (4), one break line across the span, and the break
  // symbols on the two dimension lines that cross it.
  expect(breaks(viewEntities('S-01','typical-section')).length).toBe(7);
 },900000);
 it('draws no break lines in the SK sketches',()=>{
  for(const d of engineeringSketches(s))expect(d.entities.filter(e=>e.type==='polyline'&&!e.closed&&zigzag(e.points)).length,d.number).toBe(0);
 },900000);
});

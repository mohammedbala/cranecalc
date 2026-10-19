import {describe,it,expect} from 'vitest';
import {readdirSync} from 'node:fs';
import {sheetFixture,sheetFixtureNames} from './fixtures/sheets/sheetFixtures';
import {drawingSheetSet,detailTopics} from '../src/components/planSheet';
import {annotationClashes} from '../src/components/detailSheet';
import {sheetEntities,type Entity} from '../src/components/svgEntities';
import {textWidth,lettering,sheetArea} from '../src/components/sheetGraphics';

/**
 * Readable drawing sheets for the configurations the quick configurator builds: its templates and generated
 * projects whose sheets once had overlapping annotation (tests/fixtures/sheets, calculation snapshots stored so these
 * tests need no calculate()), each drawn in US and SI units. On every sheet and every detail view: no text over text,
 * linework or a grid or detail bubble not its own (annotationClashes), no text under 3/32 in capitals (the lettering minimum), nothing outside the sheet border,
 * the drawing content inside the drawing area and clear of the seal, nothing marked as overflowing, and the detail cells
 * covering the drawing field.
 */
const minCap=lettering.min*.716/72-1e-6;
// Corners of an entity on the paper (inches, origin lower left): a text's box from its descender to its cap height.
function corners(e:Entity):[number,number][]{
 if(e.type==='text'){
  const size=e.height/.716,w=textWidth(e.value,size*72,e.bold)/72,a=e.align===1?-w/2:e.align===2?-w:0,t=e.angle*Math.PI/180,c=Math.cos(t),s=Math.sin(t);
  return [[a,-.21*size],[a+w,-.21*size],[a,.72*size],[a+w,.72*size]].map(([u,v])=>[e.at[0]+u*c-v*s,e.at[1]+u*s+v*c]);
 }
 if(e.type==='circle')return [[e.center[0]-e.radius,e.center[1]-e.radius],[e.center[0]+e.radius,e.center[1]+e.radius]];
 return e.type==='line'?[e.a,e.b]:e.points;
}
/** Problems of one generated sheet: clashes, overflow, small text, entities outside the border or the drawing area. */
function sheetProblems(svg:string){
 const problems:string[]=[],clashes=annotationClashes(svg);
 if(clashes)problems.push(`${clashes} annotation clashes`);
 for(const m of svg.match(/data-overflow[-\w]*="[^"]*"/g)??[])problems.push(`overflow ${m}`);
 for(const e of sheetEntities(svg,'US')){
  if(e.type==='text'&&e.height<minCap)problems.push(`text under 3/32 in: "${e.value}" (${(e.height/.716*72).toFixed(2)} pt)`);
  // Inside the border (0.5 in from the sheet edges).
  if(corners(e).some(([x,y])=>x<.5-1e-6||x>35.5+1e-6||y<.5-1e-6||y>23.5+1e-6))problems.push(`outside the border: ${e.type} ${e.type==='text'?e.value:''}`);
 }
 // The drawing content stays above the 2 in title band and clear of the 2.5 in seal box at the lower right.
 const content=svg.slice(svg.indexOf('<g data-sheet-content'),svg.indexOf('<g data-title-block'));
 for(const e of sheetEntities(content,'US'))if(corners(e).some(([x,y])=>y<2.5-1e-6||x>33+1e-6&&y<5-1e-6))problems.push(`outside the drawing area: ${e.type} ${e.type==='text'?e.value:''}`);
 return problems;
}
/** Detail cells tile the drawing field left of the notes: every row full width, the rows the full height. */
function cellProblems(svg:string){
 const cells=[...svg.matchAll(/data-cell-box="([\d.]+),([\d.]+),([\d.]+),([\d.]+)"/g)].map(m=>m.slice(1,5).map(Number));
 if(!cells.length)return [];
 const right=Math.max(...cells.map(([x,,w])=>x+w)),bottom=Math.max(...cells.map(([,y,,h])=>y+h)),area=cells.reduce((a,[,,w,h])=>a+w*h,0);
 return Math.abs(bottom-sheetArea.height)>1||Math.abs(area-right*sheetArea.height)>right*sheetArea.height*.005?[`cells cover ${Math.round(area/(right*sheetArea.height)*100)}% of the field, ${Math.round(bottom)} of ${sheetArea.height} high`]:[];
}

describe('readable drawing sheets',()=>{
 it('has the fixtures of the configurator templates and the generated projects',()=>{
  const names=sheetFixtureNames();
  // Every template, t09 (two cranes, five bays) included: its two-crane calculate() now fits in memory (about 20 min with
  // 3 GB of heap; scripts/refreshSheetFixtures.ts t09), and the stored snapshot is drawn like the others.
  for(let i=1;i<=16;i++)expect(names,`template t${String(i).padStart(2,'0')}`).toContain(`t${String(i).padStart(2,'0')}`);
  expect(names.filter(v=>v.startsWith('s')).length).toBeGreaterThanOrEqual(8);
  // The sample cases whose sheets had clashing annotation or text on grid bubbles (scripts/refreshSheetFixtures.ts, configFixtures).
  for(const c of ['015','047','049','057','059','062','066','078','083','084','086','087','088','094'])expect(names,`sample case ${c}`).toContain(`c${c}`);
  expect(readdirSync(new URL('./fixtures/sheets/',import.meta.url)).filter(f=>f.endsWith('.json.gz')).length).toBe(names.length);
 });
 // Each project in feet and inches and in SI (the configurator's units option): SI values and scales differ.
 for(const name of sheetFixtureNames())for(const units of ['US','SI'] as const){
  it(`${name} ${units}: every sheet and detail view reads clear, at 3/32 in lettering, inside the border`,()=>{
   const s=sheetFixture(name),problems:string[]=[];s.input.units=units;
   for(const sheet of drawingSheetSet(s)){
    for(const p of [...sheetProblems(sheet.svg),...cellProblems(sheet.svg)])problems.push(`${sheet.number} ${p}`);
   }
   for(const topic of detailTopics(s))for(const view of topic.views){
    const r=view.render(),clashes=annotationClashes(r.svg);
    if(clashes)problems.push(`${view.title}: ${clashes} annotation clashes`);
    for(const e of sheetEntities(`<g data-sheet-content="detail">${r.svg}</g>`,'US'))if(e.type==='text'&&e.height<minCap)problems.push(`${view.title}: text under 3/32 in "${e.value}"`);
   }
   expect(problems).toEqual([]);
  },600000);
 }
});

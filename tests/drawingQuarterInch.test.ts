import {describe,expect,it} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {drawingSheetSet} from '../src/components/planSheet';
import {engineeringSketches,type CadDrawing} from '../src/components/drafting';
import {auditDimensions,dimensionLength,plateInches} from '../src/components/drawingFormat';
import {snapQuarter} from '../src/engine/quarterInch';
import {demoFocus005RevB} from './fixtures/demoFocus005RevB';

/**
 * US drawings dimension to whole 1/4 in (no dimension to 1/16 in), and every field-weld flag points toward the side
 * its leader leaves the reference line. One calculate of DEMO-FOCUS-005 rev B and of the capped demonstration.
 */
const projects={revB:calculate(demoFocus005RevB()),capped:calculate(cappedDemonstrationProject())};
const drawn=Object.fromEntries(Object.entries(projects).map(([name,s])=>{
 const sheets=auditDimensions(()=>drawingSheetSet(s)),sketches=auditDimensions(()=>engineeringSketches(s));
 return [name,{sheets:sheets.result,sketches:sketches.result,offGrid:[...sheets.offGrid,...sketches.offGrid]}];
})) as Record<keyof typeof projects,{sheets:ReturnType<typeof drawingSheetSet>;sketches:CadDrawing[];offGrid:{mm:number;text:string;site:string}[]}>;

const unescape=(v:string)=>v.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
/** Lengths in inches in a dimension string: 1'-2 1/4", 3 3/4", 7/16", 5", and inch-mark-free weld lengths (1 1/2). */
function lengthTokens(t:string):number[]{
 return [...t.matchAll(/(?:(\d+)'-(\d+)(?: (\d+)\/(\d+))?")|(?:(?<![\d/.])(?:(\d+) )?(\d+)\/(\d+)(?![\d/]))|(?:(?<![\d/.'-])(\d+)"(?!\d))/g)]
  .map(m=>m[1]!==undefined?Number(m[1])*12+Number(m[2])+(m[3]?Number(m[3])/Number(m[4]):0):m[7]!==undefined?Number(m[5]??0)+Number(m[6])/Number(m[7]):Number(m[8]));
}
const onGrid=(inches:number)=>Math.abs(inches*4-Math.round(inches*4))<1e-9;
/** Dimension strings of a sheet: the text of every dimension line (rolled-shape reference dimensions excluded). */
const dimensionTexts=(svg:string)=>[...svg.matchAll(/<text[^>]* data-dim="true"[^>]*>([^<]*)<\/text>/g)].map(m=>unescape(m[1]));
/** SK sketch dimension text, less the labelled rolled-shape properties (bf, d) which keep their catalogue sizes. */
const sketchDimensions=(d:CadDrawing)=>d.entities.flatMap(e=>e.type==='text'&&e.layer==='DIMENSION'&&!/^(bf|d) = |\/ d /.test(e.text)?[e.text]:[]);

describe('dimensions on the 1/4 in grid (US)',()=>{
 it('formats dimension strings to 1/4 in and keeps material sizes to 1/16 in',()=>{
  expect(dimensionLength(25.4*(12+3/16),'US')).toBe(`1'-0 1/4"`);
  expect(dimensionLength(25.4*3.75,'US')).toBe(`0'-3 3/4"`);
  expect(plateInches(25.4*5/16,'US')).toBe('5/16"');
  expect(dimensionLength(98.4,'SI')).toBe('98.4 mm');
  expect(snapQuarter(25.4*(1+1/16),'up')/25.4).toBe(1.25);
  expect(snapQuarter(25.4*(1+3/16),'down')/25.4).toBe(1);
  // The audit sees a dimension that was not already on the grid.
  expect(auditDimensions(()=>dimensionLength(25.4*(1+1/16),'US')).offGrid).toHaveLength(1);
 });
 for(const name of Object.keys(projects) as (keyof typeof projects)[])describe(name,()=>{
  it('derives every printed dimension from geometry already on the grid',()=>{
   expect(drawn[name].offGrid.map(v=>`${(v.mm/25.4).toFixed(4)} in -> ${v.text} @ ${v.site}`)).toEqual([]);
  });
  it('prints every dimension string on its sheets and sketches in whole 1/4 in',()=>{
   const off:string[]=[];let count=0;
   for(const sheet of drawn[name].sheets)for(const t of dimensionTexts(sheet.svg)){count++;if(lengthTokens(t).some(v=>!onGrid(v)))off.push(`${sheet.number}: ${t}`);}
   for(const d of drawn[name].sketches)for(const t of sketchDimensions(d)){count++;if(lengthTokens(t).some(v=>!onGrid(v)))off.push(`${d.number}: ${t}`);}
   expect(off).toEqual([]);
   expect(count).toBeGreaterThan(100);
  });
  it('points every field-weld flag toward the side its leader leaves the reference line',()=>{
   let flags=0;
   for(const sheet of drawn[name].sheets){
    for(const m of sheet.svg.matchAll(/<g data-multileader="weld"[^>]*data-weld-location="field"[^>]*>/g)){
     const rest=sheet.svg.slice(m.index),next=rest.indexOf('<g data-multileader="weld"',1),group=next<0?rest:rest.slice(0,next);
     const route=/data-leader-path="true" points="([^"]*)"/.exec(group)![1].split(' ').map(v=>v.split(',').map(Number));
     const [elbow,landing]=route.slice(-2),side=elbow[0]<landing[0]?'left':'right';
     const flag=/<g data-field-weld="true" data-flag-toward="(left|right)"><line class="annotation" x1="([-\d.]+)" y1="([-\d.]+)"[^>]*\/><path class="annotation" style="fill:#111" d="M[-\d.]+,[-\d.]+l(-?\d+),3/.exec(group);
     expect(flag,`${sheet.number} field weld without a flag`).not.toBeNull();
     const [,toward,x,y,dx]=flag!;
     expect(toward,`${sheet.number} flag at ${x},${y}`).toBe(side);
     expect(Math.sign(Number(dx))).toBe(side==='left'?-1:1);
     // The staff stands at the junction of the leader and the reference line.
     expect(Math.abs(Number(x)-elbow[0])).toBeLessThan(.01);expect(Math.abs(Number(y)-elbow[1])).toBeLessThan(.01);
     flags++;
    }
   }
   // SK sketches: the flag pennant (a closed triangle on the staff) against the leader's last leg into the junction.
   for(const d of drawn[name].sketches){
    const polys=d.entities.filter(e=>e.type==='polyline'&&e.layer==='DIMENSION');
    for(const f of polys)if(f.type==='polyline'&&f.closed&&f.points.length===3&&f.points[0][0]===f.points[2][0]&&f.points[2][1]-f.points[0][1]===6){
     const [sx,sy]=[f.points[0][0],f.points[0][1]+15],leader=polys.find(e=>e.type==='polyline'&&!e.closed&&e.points.length===3&&e.points[1][0]===sx&&e.points[1][1]===sy);
     expect(leader,`${d.number} flag without leader`).toBeDefined();
     const pts=(leader as {points:[number,number][]}).points,side=Math.sign(pts[1][0]-pts[2][0]);
     expect(Math.sign(f.points[1][0]-f.points[0][0]),d.number).toBe(side);
     flags++;
    }
   }
   expect(flags).toBeGreaterThan(0);
  });
 });
});

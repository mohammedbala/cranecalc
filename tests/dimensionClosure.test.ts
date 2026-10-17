import {describe,expect,it} from 'vitest';
import {runwayTemplates,templateProject} from '../src/engine/templates';
import {calculate} from '../src/engine/calculate';
import {planSheetGeometry,drawingSheetSet} from '../src/components/planSheet';
import {dimensionLength} from '../src/components/drawingFormat';
import {sheetEntities} from '../src/components/svgEntities';

/** Inches of a printed US length (feet and inches, 1'-2 1/4"). */
const inches=(t:string)=>{const m=/(\d+)'-(\d+)(?: (\d+)\/(\d+))?"/.exec(t);if(!m)throw Error(`not a length: ${t}`);return Number(m[1])*12+Number(m[2])+(m[3]?Number(m[3])/Number(m[4]):0);};

/**
 * The transverse dimension string of the typical runway section (4/S-01): grid A to rail C/L, the crane span and rail
 * C/L to grid B add up to the grids A-B dimension as printed, and the span drawn is the crane span configured.
 */
describe('typical section dimension string closes',()=>{
 for(const t of runwayTemplates)it(`${t.id}: parts add up to grids A-B, span = configured crane span`,()=>{
  const p=templateProject(t.id),m=planSheetGeometry(p),d=(meters:number)=>dimensionLength(meters*1000,p.units);
  const parts=[m.columnOffset-m.railZ,m.width+2*m.railZ,m.columnOffset-m.railZ].filter(v=>Math.abs(v)>1e-6);
  if(p.units!=='US')return;
  expect(parts.reduce((s,v)=>s+inches(d(v)),0)).toBeCloseTo(inches(d(m.width+2*m.columnOffset)),6);
  expect(m.width*1000).toBeCloseTo((p.details?.criteria.railGauge??t.config.craneSpan*304.8),3);
 });
 it('prints a closed string on the analysis-only template sheet',()=>{
  const t=runwayTemplates.find(v=>v.config.scope==='analysis')!,s=calculate(templateProject(t.id));
  const texts=sheetEntities(drawingSheetSet(s).find(v=>v.number==='S-01')!.svg,'US').flatMap(e=>e.type==='text'?[e.value as string]:[]);
  const i=texts.findIndex(v=>v.endsWith('CRANE SPAN (RAIL C/L TO C/L)')),total=texts.slice(i).find(v=>v.includes('GRIDS A-B'))!;
  expect(inches(texts[i])).toBe(t.config.craneSpan*12);
  expect(inches(texts[i-1])+inches(texts[i])+inches(texts[i+1])).toBe(inches(total));
 });
});

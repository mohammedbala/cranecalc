import { beforeAll, describe, expect, it } from 'vitest';
import { calculate } from '../src/engine/calculate';
import { exampleProject } from '../src/engine/defaults';
import type { CalculationSnapshot } from '../src/engine/types';
import { appendPlanSheet, planSheetGeometry, planSheetSvg, connectionSheetSvg, drawingSheetSet } from '../src/components/planSheet';
import { defaultFraming, framingSchema } from '../src/components/framingSettings';
import { reportHtml } from '../server/report';
import {feetInches,plateInches,drawingScale} from '../src/components/drawingFormat';
import {structuralGeneralNotes} from '../src/components/structuralNotes';
import {demonstrationProject} from '../src/engine/demonstration';
import {sheetDrawingScale,sheetFormat} from '../src/components/sheetGraphics';

let snapshot: CalculationSnapshot;
beforeAll(() => { const p = structuredClone(exampleProject); p.scope = 'analysis'; snapshot = calculate(p); });
describe('ARCH D arrangement sheet', () => {
  it('preserves physical girder geometry and cumulative support stations for six unequal bays', () => {
    const input = structuredClone(snapshot.input);
    input.system = 'continuous'; input.spans = [6000, 7620, 9000, 6000, 7620, 9000];
    const m = planSheetGeometry(input);
    expect(m.membersPerRunway).toBe(1);
    expect(m.supports).toHaveLength(7);
    m.supports.slice(1).forEach((x, i) => expect((x - m.supports[i]) * 1000).toBeCloseTo(input.spans[i], 8));
    const pts = m.runwayLines.flat();
    expect(Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0]))).toBeCloseTo(45.24, 5);
    expect(Math.min(...pts.map(p => p[1]))).toBeCloseTo(-input.section.d / 2000, 6);
    expect(planSheetGeometry({ ...input, system: 'simple' }).membersPerRunway).toBe(6);
  });
  it('keeps reference framing dashed, runway outlines solid, and all three views vector based', () => {
    const svg = planSheetSvg(snapshot);
    expect(svg).toContain('width="36in" height="24in" viewBox="0 0 2592 1728"');
    for (const view of ['isometric', 'plan', 'elevation']) expect(svg).toContain(`data-view="${view}"`);
    expect(svg).toMatch(/\.reference-line\{[^}]+stroke-dasharray:3\.6 2\.4/);
    expect(svg).toMatch(/\.runway-line\{[^}]+stroke-dasharray:none/);
    expect(svg).not.toMatch(/NaN|Infinity|<image|<script/);
    expect(svg).toContain(snapshot.revision);
    expect(svg).toContain('GRID B RUNWAY IS IDENTICAL AND OPPOSITE HAND TO GRID A U.N.O.');
    const cover=[...drawingSheetSet(snapshot)[0].svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1]).join(' ');
    expect(cover).toContain('OPPOSITE RUNWAY SHOWN FOR CONTEXT;');
  });
  it('uses selected viewer dimensions and validates reference settings without changing calculations', () => {
    const framing = { ...defaultFraming, width: 12192, height: 4572, roofSlope: 4 };
    const before = JSON.stringify(snapshot), m = planSheetGeometry(snapshot.input, framing);
    expect(m.width).toBe(12.192);
    expect(m.referenceLines.length).toBeGreaterThan(100);
    expect(planSheetSvg(snapshot, framing)).not.toEqual(planSheetSvg(snapshot));
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(framingSchema.safeParse({ ...framing, width: -1 }).success).toBe(false);
    expect(() => planSheetGeometry({ ...snapshot.input, spans: [NaN] })).toThrow('Correct project');
  });
  it('appends two named landscape pages after every report section, including the appendix', () => {
    const html = reportHtml(snapshot), sheetIndex = html.indexOf('<section class="runway-plan-sheet-page">');
    expect(html.match(/<section class="runway-plan-sheet-page">/g)).toHaveLength(drawingSheetSet(snapshot).length);
    expect(html.slice(sheetIndex)).toContain('SHEET S-00');
    expect(sheetIndex).toBeGreaterThan(html.indexOf('Appendix · Reproducible project inputs'));
    expect(html).toContain('@page runwayArrangement{size:36in 24in;margin:0}');
    expect(() => reportHtml({ ...snapshot, eligible: false })).toThrow('eligible');
    const unsafe = structuredClone(snapshot); unsafe.input.title = '<script>alert(1)</script>';
    expect(appendPlanSheet('<html><head></head><body></body></html>', unsafe)).not.toContain('<script>');
  });
  it('formats architectural dimensions with fractional carry and signed datums',()=>{
    expect(feetInches(7620)).toBe(`25'-0"`);
    expect(feetInches(25.4*11.999)).toBe(`1'-0"`);
    expect(feetInches(-25.4*12.5)).toBe(`-1'-0 1/2"`);
    expect(plateInches(25.4*.75,'US')).toBe(`3/4"`);
    expect(plateInches(19.05,'SI')).toBe('19.1 mm');
    const us=drawingScale(.24,'US'),si=drawingScale(.24,'SI');
    expect(us.label).toBe(`SCALE: 1" = 1'-0"`);
    expect(us.pointsPerMm*304.8).toBeCloseTo(72,8);
    expect(si.label).toBe('SCALE: 1:20');
    expect(si.pointsPerMm*1000).toBeCloseTo(72/25.4*50,8);
    const archUs=sheetDrawingScale(.24,'US'),archSi=sheetDrawingScale(.24,'SI');
    expect(archUs.label).toBe(`SCALE: 1 1/2" = 1'-0"`);
    expect(archUs.pointsPerMm*sheetFormat.contentScale*304.8).toBeCloseTo(108,8);
    expect(archSi.label).toBe('SCALE: 1:10');
    expect(archSi.pointsPerMm*sheetFormat.contentScale*1000).toBeCloseTo(72/25.4*100,8);
  });
  it('labels reference attachments, datum, runway member sizes and blank stamp fields on a three-bay example',()=>{
    const p=demonstrationProject();expect(p.spans).toEqual([7620,7620,7620]);expect(p.cranes[0].travelEnd).toBe(22860);
    p.drawing!.originator='<script>ORIGINATOR</script>';p.drawing!.checker='Checker name';
    const sample={...snapshot,input:p,eligible:false};
    const arrangement=planSheetSvg(sample),connections=connectionSheetSvg(sample);
    expect(arrangement).toContain('T.O.S. EL.');for(const mark of ['RG1','RG2','RG3'])expect(arrangement).toContain(`data-girder-mark="${mark}"`);expect(arrangement).toContain('RUNWAY GIRDER SCHEDULE');expect(arrangement).toContain('W24X229');
    expect(arrangement).toContain(`75&#39;-0&quot; OVERALL`);expect(arrangement).toContain('REFERENCE FINISHED FLOOR');
    expect(connections).toContain('COLUMN BRACKET (REF.)');expect(connections).toContain('EXISTING TAPERED COLUMN (REF.)');
    expect(arrangement).toContain('SEE S-00 FOR GENERAL NOTES');expect(connections).not.toContain('TF 0.71&quot;');expect(connections).not.toContain('W12X40');
    expect(structuralGeneralNotes(sample).every(note=>note===note.toUpperCase())).toBe(true);
    expect(arrangement).not.toContain('DRAWING BASIS');expect(connections).not.toContain('BASIS:');
    expect(connections.match(/data-view-title="below"/g)).toHaveLength(4);
    expect(arrangement.match(/data-view-title="below"/g)).toHaveLength(3);
    expect(arrangement.split('<g data-view="isometric">')[1].split('</g>')[0]).not.toContain('W24X229');
    expect(connections.match(/data-multileader="weld"/g)).toHaveLength(4);
    expect(connections).toContain('FITTED BEARING STIFFENERS');
    for(const sheet of [arrangement,connections]){
      const titles=[...sheet.matchAll(/<g data-view-title="below" data-detail-title="[^"]*">(.*?)<\/g>/g)];
      expect(titles.length).toBeGreaterThan(2);
      expect(titles.every(t=>/SCALE:|NOT TO SCALE/.test(t[1])&&t[1].includes('<circle'))).toBe(true);
      const header=sheet.split('<g data-view=')[0];
      expect(header).not.toContain('11 x 17 IN / LANDSCAPE');
      expect(sheet).toContain('PAGE SIZE: ARCH D / 36 X 24 IN');
      expect(sheet).toContain('data-title-block="bottom-band"');
      for(const panel of ['revisions','originator','approvals','project','sheet'])expect(sheet).toContain(`data-title-panel="${panel}"`);
    }
    expect(arrangement).toContain('data-elevation-datum="top-of-steel"');
    expect(connections).not.toContain('EDGE DISTANCE');expect(connections).not.toContain('GAGE / PITCH');
    const leaders=[...connections.matchAll(/<g data-multileader="component">(.*?)<\/g>/gs)];
    expect(leaders.every(l=>!l[1].includes('ROWS @')&&!l[1].includes('PAIRS @'))).toBe(true);
    expect(connections).toContain('KEEPER SPACING / LONGITUDINAL VIEW');
    for(const sheet of [arrangement,connections]){
      expect(sheet).toContain('data-stamp="blank"');expect(sheet).toContain('CHECKER');expect(sheet).toContain('Checker name');
      expect(sheet).toContain('&lt;script&gt;ORIGINATOR&lt;/script&gt;');expect(sheet).not.toContain('<script>');
      expect(sheet).not.toMatch(/NaN|Infinity/);
    }
  });

});

import { beforeAll, describe, expect, it } from 'vitest';
import { calculate } from '../src/engine/calculate';
import { exampleProject } from '../src/engine/defaults';
import type { CalculationSnapshot } from '../src/engine/types';
import { drawingSvg, engineeringSketches, lineworkDxf } from '../src/components/drafting';

let snapshot: CalculationSnapshot;
beforeAll(() => { const p = structuredClone(exampleProject); p.scope = 'analysis'; snapshot = calculate(p); });
// Read entity tags independently of the serializer to check actual drawing-unit distances.
function entities(dxf: string) {
  const lines = dxf.trimEnd().split('\n'), result: Map<number,string>[] = [];
  let active = false, current: Map<number,string>|undefined;
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(lines[i]), value = lines[i + 1];
    if (code === 2 && value === 'ENTITIES') active = true;
    if (!active) continue;
    if (code === 0) { if (current) result.push(current); current = new Map(); }
    current?.set(code, value);
  }
  return result.filter(e => ['LINE','CIRCLE','TEXT'].includes(e.get(0)!));
}
describe('CAD engineering sketch export', () => {
  it('exports exact span and section dimensions in inches and millimeters', () => {
    for (const [units, span, depth, width] of [['US',300,24.1,9.02],['SI',7620,612.14,229.108]] as const) {
      const s = structuredClone(snapshot); s.input.units = units;
      const dxf = lineworkDxf(s), lines = entities(dxf).filter(e => e.get(0) === 'LINE' && e.get(8) === 'OUTLINE');
      const dx = lines.map(e => Math.abs(Number(e.get(11)) - Number(e.get(10))));
      const dy = lines.map(e => Math.abs(Number(e.get(21)) - Number(e.get(20))));
      expect(dx.some(v => Math.abs(v - span) < 1e-5)).toBe(true);
      expect(dx.some(v => Math.abs(v - width) < 1e-5)).toBe(true);
      expect(dy.some(v => Math.abs(v - depth) < 1e-5)).toBe(true);
      expect(dxf).toContain(`$INSUNITS\n70\n${units === 'US' ? 1 : 4}\n`);
    }
  });
  it('shares unfilled, layered vector geometry with SVG and blocks unvalidated exports', () => {
    const drawings = engineeringSketches(snapshot); expect(drawings).toHaveLength(3);
    const svg = drawingSvg(drawings[1]); expect(svg).toContain('data-layer="DIMENSION"'); expect(svg).toContain('stroke-dasharray:14 3 2 3'); expect(svg).toContain('fill:none');
    expect(() => lineworkDxf({ ...snapshot, eligible: false })).toThrow('validated');
    const invalid = structuredClone(snapshot); invalid.input.section.d = 0;
    expect(engineeringSketches(invalid)).toEqual([]); expect(() => lineworkDxf(invalid)).toThrow('Invalid geometry');
  });
  it('keeps continuous multi-span and cap-channel geometry finite and dimensionally correct', () => {
    const s = structuredClone(snapshot); s.input.system = 'continuous'; s.input.spans = [7620,6000]; s.input.section.kind = 'cap'; delete s.input.section.catalogueId; s.input.railEccentricity = -40;
    const drawings = engineeringSketches(s), svg = drawings.map(drawingSvg).join('');
    expect(svg).toContain('L2 ='); expect(svg).toContain('CAP WIDTH'); expect(svg).toContain('e = -0&#39;-1 9/16&quot;');
    expect(svg).not.toMatch(/NaN|Infinity/);
    const dxf = lineworkDxf(s); expect(entities(dxf).filter(e => e.get(8) === 'RAIL').length).toBeGreaterThan(10);
  });
  it('escapes project metadata without permitting SVG or DXF tag injection', () => {
    const s = structuredClone(snapshot); s.input.title = '<script>CAD</script>\n0\nEOF';
    const svg = drawingSvg(engineeringSketches(s)[0]); expect(svg).not.toContain('<script>'); expect(svg).toContain('&lt;script&gt;');
    const dxf = lineworkDxf(s); expect(dxf.match(/\n0\nEOF\n/g)).toHaveLength(1);
    const tags = dxf.trimEnd().split('\n'); expect(tags.length % 2).toBe(0); expect(tags.every((v,i) => i % 2 || /^\d+$/.test(v))).toBe(true);
  });
});

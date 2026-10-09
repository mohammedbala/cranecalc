import { describe, expect, it } from 'vitest';
import { permitInputs, runPermitBenchmarks } from '../benchmarks/permitPackages';
import { exampleProject } from '../src/engine/defaults';
import { loadAiscSection } from '../src/data/aiscSections';
import { concentratedResistance, girderStrength } from '../src/engine/aiscStrength';
import { sectionProperties } from '../src/engine/section';
import { toDisplay } from '../src/engine/units';

describe('Everett permit calculation comparisons', () => {
  const rows = runPermitBenchmarks();
  for (const id of ['lrfd-2b', 'lrfd-2c', 'end-yielding', 'fatigue-A']) {
    it(`matches the published ${id} check within its documented tolerance`, () => {
      const row = rows.find(r => r.id === id)!;
      expect(row.status).toBe('match');
      expect(row.relativeDifference).toBeLessThanOrEqual(row.tolerance);
    });
  }
  it('uses the same W24X76 local geometry printed in the permit', () => {
    const p = structuredClone(exampleProject);
    p.section = loadAiscSection(p.section, permitInputs.shape);
    const s = girderStrength(p, sectionProperties(p.section));
    for (const k of ['d', 'tw', 'tf'] as const) expect(p.section[k] / 25.4).toBeCloseTo(permitInputs[k], 10);
    expect(s.k / 25.4).toBeCloseTo(permitInputs.k, 10);
    expect(s.h / 25.4).toBeCloseTo(permitInputs.h, 10);
  });
  it('reports the crippling discrepancy and agrees with independent US-unit J10-5b substitution', () => {
    const { E, Fy, tw, tf, d, bearing } = permitInputs;
    // Independent US-unit substitution; no engine helpers or converted inputs.
    const nominal = .4 * tw ** 2 * (1 + (4 * bearing / d - .2) * (tw / tf) ** 1.5) * Math.sqrt(E * Fy * tf / tw);
    const row = rows.find(r => r.id === 'end-crippling')!;
    expect(row.computed).toBeCloseTo(.75 * nominal, 6);
    expect(row.status).toBe('difference');
    expect(row.relativeDifference).toBeGreaterThan(.04);
    expect(row.relativeDifference).toBeLessThan(.05);
  });
  it('retains the end reduction and distinguishes it from the published unreduced buckling value', () => {
    const p = structuredClone(exampleProject); p.method = 'LRFD';
    p.section = loadAiscSection(p.section, permitInputs.shape);
    p.section.E = permitInputs.E * 6.894757293; p.section.Fy = permitInputs.Fy * 6.894757293;
    const s = girderStrength(p, sectionProperties(p.section));
    const interior = toDisplay(concentratedResistance(p, s, permitInputs.bearing * 25.4, false).compressionBuckling, 'force', 'US');
    const row = rows.find(r => r.id === 'end-compression')!;
    expect(interior).toBeCloseTo(permitInputs.published.compressionBuckling, 2);
    expect(row.computed).toBeCloseTo(interior / 2, 8);
    expect(row.status).toBe('difference');
  });
});

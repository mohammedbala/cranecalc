import { describe, expect, it } from 'vitest';
import { beamCases, permitSources, strengthCases } from '../benchmarks/permitCases';
import { comparePermitRow, runAllPermitBenchmarks } from '../benchmarks/runPermitSuite';

const results = runAllPermitBenchmarks();
const row = (id: string) => {
  const result = results.find(r => r.id === id);
  if (!result) throw Error(`Missing benchmark ${id}`);
  return result;
};

describe('twelve distinct municipal permit reports', () => {
  it('pins unique report identities and primary sources with an executed check for each', () => {
    expect(permitSources).toHaveLength(12);
    for (const key of ['id', 'url', 'document'] as const) {
      expect(new Set(permitSources.map(s => s[key])).size).toBe(12);
    }
    const hashes = permitSources.flatMap(s => s.sha256 ? [s.sha256] : []);
    expect(hashes).toHaveLength(11);
    expect(new Set(hashes).size).toBe(11);
    expect(hashes.every(hash => /^[a-f0-9]{64}$/.test(hash))).toBe(true);
    expect(permitSources.filter(s => s.category === 'crane')).toHaveLength(2);
    expect(permitSources.filter(s => s.category === 'steel')).toHaveLength(8);
    expect(permitSources.filter(s => s.category === 'beam-mechanics')).toHaveLength(2);
    for (const source of permitSources) {
      expect(new URL(source.url).hostname).toMatch(/(everettwa|puyallupwa|mercerisland)\.gov$/);
      expect(results.some(r => r.sourceId === source.id)).toBe(true);
    }
    expect(new Set(results.map(r => r.id)).size).toBe(50);
  });

  for (const source of permitSources) {
    it(`replays ${source.document} and preserves its documented comparison outcomes`, () => {
      const rows = results.filter(r => r.sourceId === source.id);
      expect(rows.length).toBeGreaterThan(0);
      for (const result of rows) {
        expect(result.status).toBe(result.expectation === 'agreement' ? 'match' : 'difference');
        expect(Number.isFinite(result.relativeDifference)).toBe(true);
        expect(result.note.length).toBeGreaterThan(0);
        if (result.expectation === 'conservative') {
          expect(result.computed).toBeLessThan(result.published as number);
        }
      }
    });
  }

  it('keeps supplied channel and timber stiffness cases outside W-section resistance claims', () => {
    for (const id of ['henne', 'macintyre', 'falkner']) {
      expect(strengthCases.some(c => c.sourceId === id)).toBe(false);
      expect(beamCases.find(c => c.sourceId === id)?.I).toBeGreaterThan(0);
    }
  });

  it('reports true relative deflection errors without hiding the differences', () => {
    const fused = row('fused-totalDeflection');
    expect(fused.relativeDifference).toBeCloseTo(Math.abs((fused.computed as number) - .4451) / .4451, 12);
    expect(fused.relativeDifference).toBeGreaterThan(.004);
    expect(fused.relativeDifference).toBeLessThan(.005);
    expect(results.filter(r => r.status === 'match')).toHaveLength(36);
    expect(results.filter(r => r.status === 'difference')).toHaveLength(14);
  });
});

describe('independent beam and resistance checks', () => {
  for (const test of [
    { id: 'intrachat-totalDeflection', q: .858, L: 21.33, I: 301 },
    { id: 'fused-totalDeflection', q: .72692, L: 18.34, I: 144 },
    { id: 'yusen-liveDeflection', q: .710, L: 18.25, I: 238 },
  ]) {
    it(`agrees with the closed-form uniform-load deflection for ${test.id}`, () => {
      // US-unit closed form, independent of the shared finite-element solver.
      const delta = 5 * (test.q / 12) * (test.L * 12) ** 4 / (384 * 29000 * test.I);
      expect(row(test.id).computed).toBeCloseTo(delta, 6);
    });
  }

  it('agrees with independent point-load superposition for the Dish service case', () => {
    const L = 16.333 * 12, E = 29000, I = 29.1, x = L / 2;
    const deltaPoint = (a: number, P: number) => x <= a
      ? P * (L - a) * x * (L * L - (L - a) ** 2 - x * x) / (6 * L * E * I)
      : P * a * (L - x) * (L * L - a * a - (L - x) ** 2) / (6 * L * E * I);
    const delta = 5 * (.015 / 12) * L ** 4 / (384 * E * I)
      + deltaPoint(4.250 * 12, .314 + .6 * .334)
      + deltaPoint(8.167 * 12, .6 * .772)
      + deltaPoint(12.084 * 12, .314 + .6 * .334);
    expect(row('dish-totalDeflection').computed).toBeCloseTo(delta, 6);
  });

  it('keeps the rounded-radius and Cb differences explicit', () => {
    const roundedLp = 1.76 * 2.460 * Math.sqrt(29000 / 50);
    expect(roundedLp).toBeCloseTo(104.27, 2);
    expect(row('zimmer-Lp').computed).toBeCloseTo(104.44126, 4);
    expect(row('zimmer-major').computed).toBeCloseTo(4649.65574, 3);
    expect(row('dish-major').computed).toBeCloseTo(25.67773, 4);
  });

  it('rejects invalid and mismatched numeric comparisons', () => {
    const base = row('lrfd-2b');
    expect(() => comparePermitRow({ ...base, computed: [1] })).toThrow('Invalid benchmark');
    expect(() => comparePermitRow({ ...base, published: NaN, computed: 1 })).toThrow('Invalid benchmark');
  });
});

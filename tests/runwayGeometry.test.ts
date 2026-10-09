import { describe, expect, it } from 'vitest';
import { exampleProject } from '../src/engine/defaults';
import { calculate, validateProject } from '../src/engine/calculate';
import { spansForBayCount, withRunwaySpans } from '../src/engine/runwayGeometry';

describe('Runway bay editing', () => {
  it('retains unequal bay lengths and extends with the last length within the supported count', () => {
    expect(spansForBayCount([7620, 6096], 4)).toEqual([7620, 6096, 6096, 6096]);
    expect(spansForBayCount([7620, 6096, 9144], 2)).toEqual([7620, 6096]);
    for (const count of [0, 7, 1.5]) expect(() => spansForBayCount([7620], count)).toThrow(RangeError);
  });

  it('extends full-runway travel and preserves valid custom ranges and entering wheel trains', () => {
    const p = structuredClone(exampleProject);
    p.cranes[0].travelStart = -p.cranes[0].wheels.at(-1)!.offset;
    const next = withRunwaySpans(p, [7620, 6096, 7620]);
    expect(next.cranes[0].travelEnd).toBe(21336);
    expect(next.cranes[0].travelStart).toBe(p.cranes[0].travelStart);
    expect(p.spans).toEqual([7620]);
    expect(p.cranes[0].travelEnd).toBe(7620);
    p.cranes[0].travelEnd = 6000;
    expect(withRunwaySpans(p, [7620, 7620]).cranes[0].travelEnd).toBe(6000);
    expect(validateProject(next)).toEqual([]);
  });

  it('clips travel at a shortened runway and resets a range entirely in removed bays', () => {
    const p = withRunwaySpans(exampleProject, [7620, 7620, 7620]);
    p.cranes[0].travelStart = 16000;
    p.cranes[0].travelEnd = 20000;
    const next = withRunwaySpans(p, [7620]);
    expect(next.cranes[0].travelStart).toBe(0);
    expect(next.cranes[0].travelEnd).toBe(7620);
    expect(validateProject(next)).toEqual([]);
    p.cranes[0].travelStart = -1000;
    expect(withRunwaySpans(p, [7620]).cranes[0].travelStart).toBe(-1000);
  });

  it('leaves explicit design restraints and invalid numeric fields for validation', () => {
    const next = withRunwaySpans(exampleProject, [3000]);
    expect(next.unbracedLength).toBe(exampleProject.unbracedLength);
    expect(next.fatigue.location).toBe(exampleProject.fatigue.location);
    expect(validateProject(next)).toEqual(expect.arrayContaining([
      expect.stringContaining('unbracedLength'), expect.stringContaining('fatigue.location')
    ]));
    const invalid = withRunwaySpans(exampleProject, [NaN]);
    expect(invalid.cranes[0].travelEnd).toBe(exampleProject.cranes[0].travelEnd);
    expect(validateProject(invalid).length).toBeGreaterThan(0);
  });

  it('analyzes three unequal continuous bays at all four support stations', () => {
    const p = withRunwaySpans(exampleProject, [7620, 6096, 7620]);
    p.system = 'continuous'; p.scope = 'analysis';
    const snapshot = calculate(p);
    expect(snapshot.errors).toEqual([]);
    expect(snapshot.analysis!.demand.reactions).toHaveLength(4);
    expect(snapshot.analysis!.envelope.at(-1)!.x).toBe(21336);
    expect(snapshot.analysis!.envelope.some(point => point.momentMin < 0)).toBe(true);
    expect(snapshot.checks.filter(c => c.group === 'Analysis').every(c => c.status === 'pass')).toBe(true);
  }, 15000);
});

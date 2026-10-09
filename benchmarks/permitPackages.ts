import { exampleProject } from '../src/engine/defaults';
import { loadAiscSection } from '../src/data/aiscSections';
import { sectionProperties } from '../src/engine/section';
import { concentratedResistance, girderStrength } from '../src/engine/aiscStrength';
import { fatigueResistance } from '../src/engine/aistChecks';
import { craneCombinations } from '../src/engine/aistLoads';
import { toDisplay } from '../src/engine/units';

// Numeric facts from the municipal scan, not a reproduction of its report.
// These are isolated check benchmarks, not an imported or validated building.
export const permitSource = {
  title: 'Runway Design Report · DeShazo — Everett, WA',
  document: 'SE-DS-RPT-17691, revision 1',
  reportDate: '2023-07-25',
  accessed: '2026-10-05',
  url: 'https://lfportal.everettwa.gov/WebLink/DocView.aspx?dbid=0&id=2096929&page=1',
  evidence: 'Municipal permit set; scanned report cover has City of Everett receipt stamps. Calculation tables visually checked in the in-app browser.',
  pages: { combinations: 20, fatigue: 24, local: 25 },
  viewerPages: { combinations: 39, fatigue: 43, local: 44 },
} as const;

export const permitInputs = {
  shape: 'W24X76', d: 23.9, tw: .44, tf: .68, k: 1.18, h: 21.54,
  bearing: 13.45, Fy: 50, E: 29000, cycles: 500000,
  // Fy=50 reproduces the sheet's J10-3 strength; E=29,000 is the AISC
  // steel modulus. Neither value is explicitly repeated on the local sheet.
  materialBasis: '50 ksi steel replay; AISC E=29,000 ksi. Local-sheet material values are not independently repeated.',
  factorKeys: ['d', 'cd', 'cv', 'h', 'l', 'i'] as const,
  factors: { '2b': [1.2, 1.2, 1.6, 1.6, 1.6, 0], '2c': [1.2, 1.2, 1.6, 0, 1.6, 1.6] },
  published: { yielding: 360.80, crippling: 187.91, compressionBuckling: 102.86, fatigueA: 36.84 },
} as const;

export interface PermitBenchmarkResult {
  id: string;
  check: string;
  page: number;
  unit: string;
  published: number | readonly number[];
  computed: number | readonly number[];
  relativeDifference: number;
  tolerance: number;
  status: 'match' | 'difference';
  note: string;
}

export function runPermitBenchmarks(): PermitBenchmarkResult[] {
  const p = structuredClone(exampleProject);
  p.method = 'LRFD';
  p.section = loadAiscSection(p.section, permitInputs.shape);
  p.section.Fy = permitInputs.Fy * 6.894757293;
  p.section.E = permitInputs.E * 6.894757293;
  const strength = girderStrength(p, sectionProperties(p.section));
  const end = concentratedResistance(p, strength, permitInputs.bearing * 25.4, true);
  const force = (v: number) => toDisplay(v, 'force', 'US');
  const combinations = craneCombinations('LRFD');
  const rows: Omit<PermitBenchmarkResult, 'relativeDifference' | 'status'>[] = [
    ...(['2b', '2c'] as const).map(id => ({
      id: `lrfd-${id}`, check: `LRFD ${id} factor vector`, page: 20, unit: 'D, Cd, Cv, H, Ls, I',
      published: permitInputs.factors[id],
      computed: permitInputs.factorKeys.map(k => combinations.find(c => c.id === id)![k]),
      tolerance: 0,
      note: 'Runway/crane terms only. This comparison excludes building, roof and seismic actions.',
    })),
    { id: 'end-yielding', check: 'End web local yielding', page: 25, unit: 'kip',
      published: permitInputs.published.yielding, computed: force(end.yielding), tolerance: .001,
      note: 'AISC 360-16 J10-3, phi=1.00; base W-section web only.' },
    { id: 'end-crippling', check: 'End web crippling', page: 25, unit: 'kip',
      published: permitInputs.published.crippling, computed: force(end.crippling), tolerance: .001,
      note: 'Unresolved difference using the printed dimensions and stated replay material basis. Independent US-unit J10-5b substitution agrees with the app. Do not raise capacity to the permit value.' },
    { id: 'end-compression', check: 'End web compression buckling', page: 25, unit: 'kip',
      published: permitInputs.published.compressionBuckling, computed: force(end.compressionBuckling), tolerance: .001,
      note: 'Published value matches unreduced J10-8. The app applies the 50% reduction for an opposing load pair within d/2 of the member end. Actual load location/stiffeners need separate verification.' },
    { id: 'fatigue-A', check: 'Category A fatigue resistance, 500,000 cycles', page: 24, unit: 'ksi',
      published: permitInputs.published.fatigueA,
      computed: toDisplay(fatigueResistance('A', permitInputs.cycles).FSR, 'stress', 'US'), tolerance: .001,
      note: 'Resistance curve only, not composite-girder stress range or detail selection. AISC rounded SI coefficient 6900 versus US coefficient 1000 explains the small conversion difference.' },
  ];
  return rows.map(row => {
    const published = typeof row.published === 'number' ? [row.published] : row.published;
    const computed = typeof row.computed === 'number' ? [row.computed] : row.computed;
    const relativeDifference = Math.max(...published.map((v, i) => Math.abs(computed[i] - v) / Math.max(Math.abs(v), 1)));
    return { ...row, relativeDifference, status: relativeDifference <= row.tolerance ? 'match' : 'difference' };
  });
}

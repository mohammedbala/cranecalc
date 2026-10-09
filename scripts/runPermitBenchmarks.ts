import { writeFile } from 'node:fs/promises';
import { permitSources, strengthCases, beamCases } from '../benchmarks/permitCases';
import { runAllPermitBenchmarks } from '../benchmarks/runPermitSuite';
import { referenceVersion } from '../src/engine/references';

const results = runAllPermitBenchmarks();
const summary = {
  reports: permitSources.length,
  comparisons: results.length,
  matches: results.filter(r => r.status === 'match').length,
  differences: results.filter(r => r.status === 'difference').length,
};
const format = (value: number | readonly number[]) => typeof value === 'number'
  ? value.toFixed(5).replace(/0+$/, '').replace(/\.$/, '') : value.join(', ');
const sourceSections = permitSources.map(source => {
  const rows = results.filter(r => r.sourceId === source.id);
  const table = rows.map(r => `| ${r.check} | ${r.page}${r.printedPage ? ` (${r.printedPage})` : ''} | ${r.unit} | ${format(r.published)} | ${format(r.computed)} | ${(100 * r.relativeDifference).toFixed(3)}% | ${r.status.toUpperCase()} |`).join('\n');
  const differences = rows.filter(r => r.status === 'difference');
  return `## ${source.title}

[Municipal permit source](${source.url}) · permit ${source.permit} · ${source.document} · report ${source.reportDate}.

Basis: ${source.basis}. Source pages: ${source.pages}. Category: ${source.category}.

${source.scope}

| Check | PDF page (printed label) | Unit | Permit | App | Difference | Result |
| --- | --- | --- | --- | --- | --- | --- |
${table}

${differences.length ? differences.map(r => `- **${r.check} — ${r.expectation}:** ${r.note}`).join('\n') : 'All listed comparisons meet the recorded tolerances.'}

${source.sha256 ? `Downloaded source SHA-256: \`${source.sha256}\`.` : 'Municipal scan inspected in its image viewer; no downloaded PDF hash is claimed.'}
`;
}).join('\n');

const report = `# Twelve permit calculation benchmarks

**${summary.reports} distinct reports, ${summary.comparisons} comparisons: ${summary.matches} match and ${summary.differences} differ.**

Engine reference version: ${referenceVersion}. Sources inspected 2026-10-06; Everett was first inspected 2026-10-05. Reproduce the comparisons with \`npm run test:permits\`; run the regression checks with \`npm test\`.

## Coverage and interpretation

The set contains **2 crane reports, 8 other steel reports, and 2 timber reports used only for shared beam mechanics**. Each report is counted once. Duplicate Red Dot postings and later Fused Elements submittals are excluded from the count. These are isolated published calculations, not twelve complete crane designs or reproduced permit packages.

Eight reports exercise W-section strength, seven exercise the shared elastic beam solver, and Everett also exercises crane-term factors, local web resistance and fatigue. The categories overlap. Channel and timber cases use the source's E and I; no channel or timber strength capability is claimed. Whole-building frames, capped/composite runways, support connections, wind/snow/seismic generation and complete permit approval remain outside these replays.

Numeric pages were checked against the rendered PDF or municipal image viewer. All table page numbers are one-based PDF pages except Everett, where the values are printed report pages 20/24/25 (municipal viewer 39/43/44). Report identity, date, source URL and downloaded-file hash are recorded per case. The numeric extracts and provenance are versioned; complete third-party reports remain in ignored \`tmp/permit-calculations/\`.

## Replay assumptions and tolerances

- Inputs are in the source's US units and converted to the same engine used by the app. Strength cases retain **Cb=1**, the app's conservative moment-gradient assumption. Fully braced members use Lb=0. Illustrative example bolt-hole data are cleared for gross-section capacity comparisons.
- Beam cases use simple supports and explicit published load combinations. They do not test a general ASCE building load generator. Henne's partial uniform load uses exact two-point Gauss integration of the existing cubic beam load shapes; this fixture adapter adds no app input capability.
- Beam displacement uses 160 intervals. Moment extrema are evaluated at load discontinuities and exact zero-shear stations. Every replay checks reaction equilibrium. Independent closed-form uniform-load and point-load superposition tests check the elastic solver separately from the permit comparisons.
- Intrachat and Fused Elements use nominal 26 plf self weight once; Dish uses nominal 15 plf once. Where the source enables calculated self weight without printing its value, nominal weight is an explicit replay assumption. Yusen's printed D line load is used directly without adding weight; the source D reactions confirm this interpretation. Henne's self weight and Falkner's supplied density are also included once.
- Scalar relative tolerance is 0.1%; crane factor vectors are exact. Relative error divides by the actual published value, including deflections smaller than one inch. For rounded deflections, absolute tolerance is 0.0006 in, except Falkner's four-decimal total (0.0001 in) and Macintyre's two-decimal values (0.005 in). Henne's dead reaction has a 0.0006 kip rounding allowance. No tolerance was widened to convert a discrepancy into a match.
- Source code editions are stated individually. Red Dot uses AISC 360-10; its F2 yielding comparison does not validate all 2010 provisions. Everett cites AIST Technical Report 13 (2021), whereas the app's supplied AIST source is the February 2020 document recorded in SOURCE_REGISTER.md. This suite does not establish agreement across every edition or every AIST provision.

## Findings that remain visible

Everett has two local-check differences. For the stated W24X76 dimensions, AISC 360-16 J10-5b gives 179.7613 kip versus the printed 187.91 kip. J10-8 gives 102.8608 kip before the end reduction, and the app applies the J10.5 end-case reduction to obtain 51.4304 kip versus the printed 102.86 kip. Actual load distance and stiffener contribution must be established before resolving the second comparison. Neither difference establishes that the permit structure is unsafe.

Zimmer's printed Lp uses rounded ry=2.460 in; the engine derives ry from the catalogue Iy/A, producing 104.4413 in versus 104.27 in. Substitution of the printed radius in F2-5 independently reproduces 104.2735 in. Zimmer's flexural capacity benefits from Cb=2.19, while the engine retains Cb=1. Dish also has a higher printed flexural capacity; a moment-gradient benefit is the likely explanation, but the source page does not print Cb, so that explanation remains an inference.

Nine deflection outputs across Intrachat, Dish, Yusen, Fused Elements and Falkner differ by about **0.26–0.81%**. The permit values are higher than the bending-only replay. Independent Euler–Bernoulli closed-form checks agree with the engine for the applicable uniform and point loads. The source analysis details are insufficient to establish the cause of the residual differences; they remain unresolved. Source self-weight assumptions and analysis formulation should be established before using these cases as full deflection validation.

No application capacity, source verification flag or export gate was changed to fit the permit results. Passing regression tests preserve both demonstrated agreement and the documented differences; they do not mean all permit calculations match.

${sourceSections}
## Reproducible files

- [Source metadata and explicit replay inputs](../benchmarks/permitCases.ts)
- [Shared-engine suite runner](../benchmarks/runPermitSuite.ts)
- [Machine-readable results, sources and inputs](../benchmarks/permit-results.json)
- [Twelve-report regression tests](../tests/permitSuite.test.ts)
- [Original Everett fixtures](../benchmarks/permitPackages.ts)
`;
await writeFile(new URL('../references/PERMIT_BENCHMARKS.md', import.meta.url), report);
await writeFile(new URL('../benchmarks/permit-results.json', import.meta.url), JSON.stringify({ referenceVersion, accessed: '2026-10-06', summary, sources: permitSources, inputs: { strength: strengthCases, beam: beamCases }, results }, null, 2) + '\n');
console.table(permitSources.map(source => {
  const rows = results.filter(r => r.sourceId === source.id);
  return { report: source.title, category: source.category, comparisons: rows.length, matches: rows.filter(r => r.status === 'match').length, differences: rows.filter(r => r.status === 'difference').length };
}));
console.log(summary);
console.log('Saved references/PERMIT_BENCHMARKS.md and benchmarks/permit-results.json');

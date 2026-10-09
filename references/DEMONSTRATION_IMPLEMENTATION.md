# Representative website calculation report

Objective: complete the applicable runway-girder calculation and detailing models so the website can generate a compact, readable demonstration report from realistic, explicitly fictitious input. Supporting building framing and foundations are excluded; report the forces delivered to their interfaces. Do not override calculation or export gates to create the example.

## Required deliverables and completion evidence

- [x] Explicit demonstration purpose and load-source labels, without claiming manufacturer verification; project mode retains actual-data requirements.
- [x] Restraint-dependent Saint-Venant/warping torsion, rail-head displacement and above-centroid loading stability; independent mechanics benchmarks and mesh checks.
- [x] Both-flange brace strength and stiffness, including member and connection flexibility, axial stability and concurrent lateral actions.
- [x] Defined girder bearing/hold-down, tieback and longitudinal connection templates: bolts, pretension/slip, bearing/tearout, plates, net section/block shear, weld groups, bearing stiffeners and fatigue.
- [x] Rail clips, local rail/flange load transfer and rail joints; group close wheels for rail components. Separate full-speed building-stop force reported (stop capacity excluded). Overlapping girder-web wheel patches remain an applicability gate.
- [x] Multiple fatigue details and duty spectrum; elastic peak stresses including warping; owner serviceability and camber/alignment criteria.
- [x] Simultaneous signed support/interface force records with combination, crane positions and direction, without assessing the excluded building/foundation.
- [x] Dimensioned model-derived detail sheets, materials/bolt/weld schedules and erection/inspection/alignment notes, linked to the calculations.
- [x] Website loads the fictional example, edits inputs with live checks and generates the current revision through normal server validation.
- [x] Compact plan-review PDF with input/basis summary, governing calculations/equations/references, details and scope. Detailed worksheet/project file remain available separately.
- [x] Representative PDF rendering/inspection and independent tests, integration/export gates, build and website workflow: see evidence below.

## Implementation scope

Use explicitly defined symmetric rolled I-girder and connection templates for the representative package. Applicability checks must continue to reject geometries or load paths outside those models. A fictional supplier schedule is permitted only for a clearly identified demonstration report; numerical checks and model completeness are unchanged. No supporting PEMB frame, column bracket member, anchor or foundation capacity is claimed.

## Source work

- AISC 360-16 original text: H3.3 (non-HSS combined torsion); J2–J4 and J10.8 (connections/stiffeners); Appendix 3 (fatigue); Appendix 6 (bracing). Existing pinned source in SOURCE_REGISTER.md.
- Moore and Mueller, *Torsional Analysis of Steel Sections*, AISC Engineering Journal 39(4), 2002, pp. 182–188: https://ej.aisc.org/index.php/engj/article/download/789/788
- Nayak, Anilkumar and Subramanian, *Lateral-Torsional Buckling Modification Factors in Steel I-Shaped Members: Recommendations Using Energy-Based Formulations*, AISC Engineering Journal 61(3), 2024, pp. 141–158: https://ej.aisc.org/index.php/engj/article/download/1328/1321/1342. This provides mechanics validation; it does not change the selected AISC 360-16 design edition.

Progress is recorded here as implementation and direct verification are completed. A checked item requires code and runtime/test evidence, not a proposal.


## Completion evidence

- Three-bay example: 293 checks, 287 pass, 6 not applicable; no invalid/unsupported/incomplete/source-pending checks. The example has three 25-ft simply supported bays, a 40-ft reference runway spacing, and a 100-ft floor datum. The selected W24X229 is the lightest passing of seven W24 trials at the original 25-ft restraint spacing after correcting keeper fatigue to unfactored duty-bin loads. It is 8.4% lighter than the former W24X250, not a catalogue-wide optimum. All owner criteria and connection inputs remain unchanged.
- Baseline engineering regression: `npx vitest run --maxWorkers=2` passed 115/115 across 16 files before the drawing-only changes. This includes the twelve-case comparison suite (78 comparisons, 72 matches, six documented differences), independent torsion/stability/connection mechanics and detailed-package integration. Tests are not twelve independent published runway permit designs.
- Build and TypeScript checks pass. A final geometry guard limits automatic keeper intervals to 200 to prevent unbounded analysis work.
- Actual built-in-browser workflow: Load demonstration, select compact report, wait for current ready state, Generate output; the Generated output dialog shows the immutable current revision, PDF, seven drawing sheets, DXF, JSON and interface CSV. An initial download-event listener timed out; exact-tab rebinding recovered, and a normal click plus modal read-back succeeded.
- Report service verification: normal PDF is recomputed from raw inputs; stale revision 409, invalid geometry 422, incomplete model 422. Client-supplied eligible flags are ignored.
- Deliverables: `output/pdf/crane-runway-demonstration.pdf`, `output/demonstration/project.json`, `snapshot.json`, `interface-forces.csv`, seven SVG geometry/detail sheets, S-01 arrangement and S-02 connections, plus envelopes, `runway-details.dxf`, and API verification record. Final PDF: 14 pages, revision 61c8d54fad86191f: twelve Letter calculation pages and two 11 x 17 landscape drawing sheets. The three independent 25-ft bays include a separate fatigue register and labeled interface-force continuation. All calculation pages and both drawing sheets are rendered for visual review. SHA-256 and evidence in output/demonstration/delivery-verification.json.

This closes the applicable representative-template package. It does not claim all possible runway systems are supported. Built-up/cap sections, unsupported guide-roller actions, overlapping local web patches, long-span profiles and girder-mounted eccentric bumpers retain model gates. Supporting building framing, brackets, anchors, building stops and foundations are outside the requested scope. 3D reference hardware is not substituted for the calculated detail sheets.

## Final drawing arrangement

S-01: building grids, unlabeled isometric members, section sizes without member IDs on plan/elevation, top-of-steel elevation and feet/inches dimensions. Plain view titles and conventional scales are centered below the views. The lower-right panel holds conventional all-caps structural general notes; the former drawing-basis narrative and title-block basis are removed.

S-02: actual entered girder sections and connection geometry with dashed receiving building members. Branched leaders point to stiffeners, bearing plates, cover plates and bolts, paired flange ties/gussets, and rail keepers. Fillet-weld symbols identify the specified root welds; receiving reference brackets/columns retain section-size callouts. Both sheets retain originator/checker fields and an empty stamp box. Section-size callouts for fabricated columns describe their dimensions rather than assigning them rolled AISC names.


## 8 October 2026 fatigue and cap review

Corrected local keeper fatigue to the unfactored wheel groups for each duty bin, with no impact or strength factors, retaining empty-crane weight, reversed half side thrust, full local range superposition and the largest-range/all-cycle bound. Live equations and the compact PDF expose bin forces and flange/weld ranges. Selected W24X229 passes 287 applicable checks (6 not applicable), with rail twist D/C 0.958 and major bending D/C 0.150. W14X211 also passes the tested alternative but changes girder depth; it is not the default.

Catalogue cap channels now have verified elastic property transformation and first-order flange-couple mechanics. Full capped-section design remains blocked; the research Cw/J estimates are not used for resistance. See `CAP_AND_KEEPER_VALIDATION.md` for exact scope and retained source discrepancies.

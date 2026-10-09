# Twelve permit calculation benchmarks

**12 distinct reports, 50 comparisons: 36 match and 14 differ.**

Engine reference version: 2026-10-06.aist-tr13-2. Sources inspected 2026-10-06; Everett was first inspected 2026-10-05. Reproduce the comparisons with `npm run test:permits`; run the regression checks with `npm test`.

## Coverage and interpretation

The set contains **2 crane reports, 8 other steel reports, and 2 timber reports used only for shared beam mechanics**. Each report is counted once. Duplicate Red Dot postings and later Fused Elements submittals are excluded from the count. These are isolated published calculations, not twelve complete crane designs or reproduced permit packages.

Eight reports exercise W-section strength, seven exercise the shared elastic beam solver, and Everett also exercises crane-term factors, local web resistance and fatigue. The categories overlap. Channel and timber cases use the source's E and I; no channel or timber strength capability is claimed. Whole-building frames, capped/composite runways, support connections, wind/snow/seismic generation and complete permit approval remain outside these replays.

Numeric pages were checked against the rendered PDF or municipal image viewer. All table page numbers are one-based PDF pages except Everett, where the values are printed report pages 20/24/25 (municipal viewer 39/43/44). Report identity, date, source URL and downloaded-file hash are recorded per case. The numeric extracts and provenance are versioned; complete third-party reports remain in ignored `tmp/permit-calculations/`.

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

## DeShazo runway design — Boeing, Everett

[Municipal permit source](https://lfportal.everettwa.gov/WebLink/DocView.aspx?dbid=0&id=2096929&page=1) · permit B2306-034 · SE-DS-RPT-17691 rev. 1 · report 2023-07-25.

Basis: AIST TR 13 (2021); AISC 360-16; LRFD. Source pages: Printed 20, 24, 25; viewer 39, 43, 44. Category: crane.

Base W24X76 local web checks, fatigue resistance and crane load factors. C15X33.9 cap, complete frame and stress demand excluded. Municipal scan visually inspected; no downloaded PDF hash.

| Check | PDF page (printed label) | Unit | Permit | App | Difference | Result |
| --- | --- | --- | --- | --- | --- | --- |
| LRFD 2b factor vector | 20 | D, Cd, Cv, H, Ls, I | 1.2, 1.2, 1.6, 1.6, 1.6, 0 | 1.2, 1.2, 1.6, 1.6, 1.6, 0 | 0.000% | MATCH |
| LRFD 2c factor vector | 20 | D, Cd, Cv, H, Ls, I | 1.2, 1.2, 1.6, 0, 1.6, 1.6 | 1.2, 1.2, 1.6, 0, 1.6, 1.6 | 0.000% | MATCH |
| End web local yielding | 25 | kip | 360.8 | 360.8 | 0.000% | MATCH |
| End web crippling | 25 | kip | 187.91 | 179.7613 | 4.336% | DIFFERENCE |
| End web compression buckling | 25 | kip | 102.86 | 51.43042 | 50.000% | DIFFERENCE |
| Category A fatigue resistance, 500,000 cycles | 24 | ksi | 36.84 | 36.86833 | 0.077% | MATCH |

- **End web crippling — unresolved:** Unresolved difference using the printed dimensions and stated replay material basis. Independent US-unit J10-5b substitution agrees with the app. Do not raise capacity to the permit value.
- **End web compression buckling — unresolved:** Published value matches unreduced J10-8. The app applies the 50% reduction for an opposing load pair within d/2 of the member end. Actual load location/stiffeners need separate verification.

Municipal scan inspected in its image viewer; no downloaded PDF hash is claimed.

## Red Dot Corporation bridge crane evaluation

[Municipal permit source](https://permits.puyallupwa.gov/Portal/Permit/GetFile?docId=107692) · permit PRCTI20230447 · AHBL 2220760.20 · report 2022-10-26.

Basis: RISA-2D 20; AISC 360-10 ASD; site IBC 2018. Source pages: PDF 25, 27, 51; RISA 1, 3, 27. Category: crane.

M4 W18X76 support-frame beam flexural resistance only. Lb replayed as member length 4.75 ft; yielding governs even with Cb=1. The capped W30 runway and frame analysis are excluded. Same AHBL report in PRCTI20221709 is not a second case.

| Check | PDF page (printed label) | Unit | Permit | App | Difference | Result |
| --- | --- | --- | --- | --- | --- | --- |
| W18X76 available major-axis flexure | 51 (RISA 27) | kip-ft | 406.687 | 406.68663 | 0.000% | MATCH |

All listed comparisons meet the recorded tolerances.

Downloaded source SHA-256: `3b936d0731a824ffbd6d90d8386b709e315e58606df379ac5f75b18e8bfd99b8`.

## Headrick Residence

[Municipal permit source](https://permitbulletin.mercerisland.gov/public/2022/2202-128/SUB1/structural%20calculations.pdf) · permit 2202-128 · Quantum 21271.01 · report 2022-02-04.

Basis: ForteWEB; AISC 360-16 ASD; A992. Source pages: PDF 48; C-23. Category: steel.

L2B1 W12X50 continuously braced flexure and shear capacities. Fy=50 ksi from A992 designation, E=29,000 ksi standard steel replay; bearing offsets and load bypass are not reconstructed.

| Check | PDF page (printed label) | Unit | Permit | App | Difference | Result |
| --- | --- | --- | --- | --- | --- | --- |
| W12X50 available major-axis flexure | 48 (C-23) | kip-ft | 179.391 | 179.39122 | 0.000% | MATCH |
| W12X50 available web shear | 48 (C-23) | kip | 90.28 | 90.28 | 0.000% | MATCH |

All listed comparisons meet the recorded tolerances.

Downloaded source SHA-256: `b2d67ffd038a229c62d98a1c9a4bb082206d86720525d574247d4a830b8a18a3`.

## Intrachat Hoang Residence

[Municipal permit source](https://permitbulletin.mercerisland.gov/public/2022/2211-165/SUB1/structural%20calcs%20-%2022-09-15%20-%20intrachat%20hoang%20structural%20calculations.pdf) · permit 2211-165 · Quantum 22252.01 · report 2022-09-15.

Basis: ENERCALC; AISC 360-16 ASD; ASCE 7-16. Source pages: PDF 168; printed 166. Category: steel.

Grid 8 W16X26, simple 21.33 ft span: D+L forces, live/total deflections and fully braced strengths. Dead line load includes 26 plf self weight exactly once.

| Check | PDF page (printed label) | Unit | Permit | App | Difference | Result |
| --- | --- | --- | --- | --- | --- | --- |
| W16X26 available major-axis flexure | 168 (166) | kip-ft | 110.279 | 110.27944 | 0.000% | MATCH |
| W16X26 available web shear | 168 (166) | kip | 70.509 | 70.50898 | 0.000% | MATCH |
| Applied peak bending moment | 168 (166) | kip-ft | 48.804 | 48.79541 | 0.018% | MATCH |
| Peak support reaction / shear | 168 (166) | kip | 9.152 | 9.15057 | 0.016% | MATCH |
| Total service deflection | 168 (166) | in | 0.46 | 0.45779 | 0.480% | DIFFERENCE |
| Transient/live deflection | 168 (166) | in | 0.343 | 0.34148 | 0.444% | DIFFERENCE |

- **Total service deflection — unresolved:** Shared Euler–Bernoulli solver; simple 21.33 ft span, E=29000 ksi, I=301 in4. Explicit published loading; extrema use 160 displacement intervals and exact moment stations. Published displacement is slightly higher than the bending-only replay; source analysis details are insufficient to establish why. Independent uniform-load closed-form checks agree with this engine; do not relabel this comparison matched. No building-code load generation or whole-building analysis.
- **Transient/live deflection — unresolved:** Shared Euler–Bernoulli solver; simple 21.33 ft span, E=29000 ksi, I=301 in4. Explicit published loading; extrema use 160 displacement intervals and exact moment stations. Published displacement is slightly higher than the bending-only replay; source analysis details are insufficient to establish why. Independent uniform-load closed-form checks agree with this engine; do not relabel this comparison matched. No building-code load generation or whole-building analysis.

Downloaded source SHA-256: `85316e781cbf5ec454dd80948423cc2f8a8abada9595ac735f3d3c1d4355b232`.

## Zimmer Residence

[Municipal permit source](https://permitbulletin.mercerisland.gov/public/CAO24-037/SUB1/zimmer%20residence%20-%20structural%20calcualtions%20-%2011-13-24.pdf) · permit CAO24-037 · Buker Engineering; Yield-Link beam 1001 · report 2024-11-11.

Basis: Simpson Yield-Link V4.1.2; AISC 360-16 LRFD. Source pages: PDF 57, 58, 61; L55, L56, L59 (11/13/2024 sheets). Category: steel.

W16X67 compactness, LTB limits, flexural and shear resistance at Lb=220 in. Source Cb=2.19; app retains Cb=1. No moment connection, seismic system or full H1 interaction validation.

| Check | PDF page (printed label) | Unit | Permit | App | Difference | Result |
| --- | --- | --- | --- | --- | --- | --- |
| W16X67 flange width/thickness ratio | 57 (L55) | ratio | 7.67 | 7.66917 | 0.011% | MATCH |
| W16X67 Lp | 58 (L56) | in | 104.27 | 104.44126 | 0.164% | DIFFERENCE |
| W16X67 Lr | 58 (L56) | in | 312.8 | 312.82055 | 0.007% | MATCH |
| W16X67 available major-axis flexure | 59 (L57) | kip-in | 5850 | 4649.65574 | 20.519% | DIFFERENCE |
| W16X67 available web shear | 61 (L59) | kip | 193.2 | 193.155 | 0.023% | MATCH |

- **W16X67 Lp — rounding:** Sheet uses rounded ry=2.460 in; catalogue/engine uses sqrt(Iy/A). Independent F2-5 substitution with 2.460 reproduces 104.273 in. Difference remains visible.
- **W16X67 available major-axis flexure — conservative:** Source Cb=2.19 reaches Mp; app Cb=1 reduces available LTB resistance. The comparison retains that conservative assumption.

Downloaded source SHA-256: `c01976f929ca1b6df6c32a1f841edf9838d3f051c80e9026d485683870ef4d48`.

## Dish Wireless rooftop — SESEA00351A

[Municipal permit source](https://permitbulletin.mercerisland.gov/public/WCF23-004/SUB1/sesea00351adishsarev0stamped.pdf) · permit WCF23-004 · SESEA00351A structural calculations · report 2023-04-27.

Basis: ENERCALC; AISC 360-16 LRFD; ASCE 7-16. Source pages: PDF 65. Category: steel.

Beta sector W6X15, simple 16.333 ft span: 1.2D+W forces, D+0.6W deflection and shear/flexure strength. Printed flexural capacity exceeds the Cb=1 replay; source Cb is not printed. Wind generation, antenna mount and connections excluded.

| Check | PDF page (printed label) | Unit | Permit | App | Difference | Result |
| --- | --- | --- | --- | --- | --- | --- |
| W6X15 available major-axis flexure | 65 | kip-ft | 29.529 | 25.67773 | 13.042% | DIFFERENCE |
| W6X15 available web shear | 65 | kip | 41.331 | 41.331 | 0.000% | MATCH |
| Applied peak bending moment | 65 | kip-ft | 6.773 | 6.77304 | 0.001% | MATCH |
| Peak support reaction / shear | 65 | kip | 1.244 | 1.24386 | 0.011% | MATCH |
| Total service deflection | 65 | in | 0.251 | 0.25034 | 0.263% | DIFFERENCE |

- **W6X15 available major-axis flexure — conservative:** App Cb=1 gives a lower available resistance. A source moment-gradient benefit is likely but unconfirmed because actual source Cb is not printed on this page.
- **Total service deflection — unresolved:** Shared Euler–Bernoulli solver; simple 16.333 ft span, E=29000 ksi, I=29.1 in4. Explicit published loading; extrema use 160 displacement intervals and exact moment stations. Published displacement is slightly higher than the bending-only replay; source analysis details are insufficient to establish why. Independent uniform-load closed-form checks agree with this engine; do not relabel this comparison matched. No building-code load generation or whole-building analysis.

Downloaded source SHA-256: `59d7c3b1f8c5d941aea95609d3d1f25fda343cf08b1f6a56dd6d50da964e3609`.

## Seifert Residence Remodel

[Municipal permit source](https://permitbulletin.mercerisland.gov/public/SHL24-005/SUB1/structural%20calculation%20package.pdf) · permit SHL24-005 · Dibble 24-005 · report 2024-03-07.

Basis: ENERCALC; AISC 360-16 ASD; IBC 2021 combinations. Source pages: PDF 52. Category: steel.

UBM2 W8X40 fully braced flexure and shear resistance. Partial tributary loads, lateral/seismic cases and supports excluded from this resistance-only case.

| Check | PDF page (printed label) | Unit | Permit | App | Difference | Result |
| --- | --- | --- | --- | --- | --- | --- |
| W8X40 available major-axis flexure | 52 | kip-ft | 99.301 | 99.3014 | 0.000% | MATCH |
| W8X40 available web shear | 52 | kip | 59.4 | 59.4 | 0.000% | MATCH |

All listed comparisons meet the recorded tolerances.

Downloaded source SHA-256: `42a3bea453637f4270aecc1a2dbbb0d6c03a14feea561df8061947b507ba2f77`.

## Yusen Residence

[Municipal permit source](https://permitbulletin.mercerisland.gov/public/2601-016/SUB1/25014_yusen_struct%20permit%20calcs_122225.pdf) · permit 2601-016 · O.G. Engineering 25014 — permit submission · report 2025-12-22.

Basis: ENERCALC; AISC 360-16 ASD; IBC 2021 combinations. Source pages: PDF/printed 35. Category: steel.

UFB11 W12X30, simple 18.25 ft span. Published D line load 0.440 kip/ft is used without adding weight again; source D reactions confirm it. D+0.75L+0.75S demand, D+L/live deflection and fully braced strengths only.

| Check | PDF page (printed label) | Unit | Permit | App | Difference | Result |
| --- | --- | --- | --- | --- | --- | --- |
| W12X30 available major-axis flexure | 35 | kip-ft | 107.535 | 107.53493 | 0.000% | MATCH |
| W12X30 available web shear | 35 | kip | 63.96 | 63.96 | 0.000% | MATCH |
| Applied peak bending moment | 35 | kip-ft | 58.231 | 58.23117 | 0.000% | MATCH |
| Peak support reaction / shear | 35 | kip | 18.841 | 18.84077 | 0.001% | MATCH |
| Total service deflection | 35 | in | 0.51 | 0.50738 | 0.513% | DIFFERENCE |
| Transient/live deflection | 35 | in | 0.258 | 0.25675 | 0.483% | DIFFERENCE |

- **Total service deflection — unresolved:** Shared Euler–Bernoulli solver; simple 18.25 ft span, E=29000 ksi, I=238 in4. Explicit published loading; extrema use 160 displacement intervals and exact moment stations. Published displacement is slightly higher than the bending-only replay; source analysis details are insufficient to establish why. Independent uniform-load closed-form checks agree with this engine; do not relabel this comparison matched. No building-code load generation or whole-building analysis.
- **Transient/live deflection — unresolved:** Shared Euler–Bernoulli solver; simple 18.25 ft span, E=29000 ksi, I=238 in4. Explicit published loading; extrema use 160 displacement intervals and exact moment stations. Published displacement is slightly higher than the bending-only replay; source analysis details are insufficient to establish why. Independent uniform-load closed-form checks agree with this engine; do not relabel this comparison matched. No building-code load generation or whole-building analysis.

Downloaded source SHA-256: `97d9b78fcfbf6e6f188a4be265bdd12b28e13b4b0030f44521d29ad4ce2e094a`.

## Fused Elements Residence

[Municipal permit source](https://permitbulletin.mercerisland.gov/public/2309-118/SUB1/structural%20calculations.pdf) · permit 2309-118 · KPFF 2200638 — permit submittal · report 2023-07-19.

Basis: ENERCALC; AISC 360-16 LRFD; IBC 2021 combinations. Source pages: PDF 61–62; B42–B43. Category: steel.

UL-B5 W10X26, simple 18.34 ft span: 1.2D+1.6L forces, live/total deflections and fully braced strengths. Dead load includes 26 plf once. Other submittals are not additional independent reports.

| Check | PDF page (printed label) | Unit | Permit | App | Difference | Result |
| --- | --- | --- | --- | --- | --- | --- |
| W10X26 available major-axis flexure | 61 (B42) | kip-ft | 117.375 | 117.375 | 0.000% | MATCH |
| W10X26 available web shear | 61 (B42) | kip | 80.34 | 80.34 | 0.000% | MATCH |
| Applied peak bending moment | 61 (B42) | kip-ft | 44.667 | 44.66735 | 0.001% | MATCH |
| Peak support reaction / shear | 61 (B42) | kip | 9.742 | 9.74206 | 0.001% | MATCH |
| Total service deflection | 62 | in | 0.4451 | 0.4431 | 0.448% | DIFFERENCE |
| Transient/live deflection | 61 (B42) | in | 0.291 | 0.28966 | 0.459% | DIFFERENCE |

- **Total service deflection — unresolved:** Shared Euler–Bernoulli solver; simple 18.34 ft span, E=29000 ksi, I=144 in4. Explicit published loading; extrema use 160 displacement intervals and exact moment stations. Published displacement is slightly higher than the bending-only replay; source analysis details are insufficient to establish why. Independent uniform-load closed-form checks agree with this engine; do not relabel this comparison matched. No building-code load generation or whole-building analysis.
- **Transient/live deflection — unresolved:** Shared Euler–Bernoulli solver; simple 18.34 ft span, E=29000 ksi, I=144 in4. Explicit published loading; extrema use 160 displacement intervals and exact moment stations. Published displacement is slightly higher than the bending-only replay; source analysis details are insufficient to establish why. Independent uniform-load closed-form checks agree with this engine; do not relabel this comparison matched. No building-code load generation or whole-building analysis.

Downloaded source SHA-256: `52b9252c4c1c9c1ba305067356aac6c609ada95fde060e19d4f329ce9c2eaf3b`.

## Henne Residence Addition

[Municipal permit source](https://permitbulletin.mercerisland.gov/public/2505-033/SUB1/structural%20calcs.pdf) · permit 2505-033 · L120 S250130-2 · report 2025-04-11.

Basis: StruCalc Plus; AISC 360-16 ASD (04/10/2025 member sheet). Source pages: PDF 53. Category: steel.

C10X20, simple 17.5 ft span: beam mechanics only using supplied Ix=78.9 in4. Partial 180 plf dead load and 20 plf self weight, source D+0.7S demand and snow deflection. Channel strength, Cb and the choice of snow factor are not validated.

| Check | PDF page (printed label) | Unit | Permit | App | Difference | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Applied peak bending moment | 53 | kip-ft | 15.6841 | 15.68406 | 0.000% | MATCH |
| Peak support reaction / shear | 53 | kip | 3.5862 | 3.58621 | 0.000% | MATCH |
| Transient/live deflection | 53 | in | 0.277 | 0.27668 | 0.115% | MATCH |
| Peak dead-load support reaction | 53 | kip | 1.749 | 1.74871 | 0.016% | MATCH |

All listed comparisons meet the recorded tolerances.

Downloaded source SHA-256: `a576571be714ba0ee39ec454130105db91b930e7fa0dfbd8f9e7a1b47ca48071`.

## Macintyre addition and remodel

[Municipal permit source](https://permitbulletin.mercerisland.gov/public/2402-026/SUB1/structural%20calcs.pdf) · permit 2402-026 · CSES 2023.102 · report 2024-01-26.

Basis: IBC 2018; NDS 2018. Source pages: PDF 2; R1. Category: beam-mechanics.

Timber roof rafter, simple 14 ft span: material-independent beam forces and deflections only, using supplied E and I. No timber/NDS strength or crane design check is claimed.

| Check | PDF page (printed label) | Unit | Permit | App | Difference | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Applied peak bending moment | 2 (R1) | kip-ft | 1.96 | 1.96 | 0.000% | MATCH |
| Peak support reaction / shear | 2 (R1) | kip | 0.56 | 0.56 | 0.000% | MATCH |
| Total service deflection | 2 (R1) | in | 0.3 | 0.29886 | 0.379% | MATCH |
| Transient/live deflection | 2 (R1) | in | 0.19 | 0.18679 | 1.690% | MATCH |

All listed comparisons meet the recorded tolerances.

Downloaded source SHA-256: `8f0f3337f982a9d3f4aed94c4c6a77d8d6ceadd7a4f5abe738d60d378d41e994`.

## Falkner Residence Carport

[Municipal permit source](https://permitbulletin.mercerisland.gov/public/2412-283/SUB1/structural%20calcs.pdf) · permit 2412-283 · CK Engineering 24-031 · report 2024-11-15.

Basis: ENERCALC; NDS 2018; IBC 2021. Source pages: PDF 23–24; printed 9–10. Category: beam-mechanics.

Timber BM3 4x12, simple 13 ft span: material-independent beam reactions and elastic deflections only. Density 30.59 pcf; actual 3.5x11.25 in rectangular section. NDS resistance and shear stress reductions excluded.

| Check | PDF page (printed label) | Unit | Permit | App | Difference | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Peak support reaction / shear | 24 | kip | 1.614 | 1.61437 | 0.023% | MATCH |
| Total service deflection | 24 | in | 0.2974 | 0.29564 | 0.593% | DIFFERENCE |
| Transient/live deflection | 23 (9) | in | 0.18 | 0.17855 | 0.806% | DIFFERENCE |

- **Total service deflection — unresolved:** Shared Euler–Bernoulli solver; simple 13 ft span, E=1300 ksi, I=415.283203125 in4. Explicit published loading; extrema use 160 displacement intervals and exact moment stations. Published displacement is slightly higher than the bending-only replay; source analysis details are insufficient to establish why. Independent uniform-load closed-form checks agree with this engine; do not relabel this comparison matched. No building-code load generation or whole-building analysis.
- **Transient/live deflection — unresolved:** Shared Euler–Bernoulli solver; simple 13 ft span, E=1300 ksi, I=415.283203125 in4. Explicit published loading; extrema use 160 displacement intervals and exact moment stations. Published displacement is slightly higher than the bending-only replay; source analysis details are insufficient to establish why. Independent uniform-load closed-form checks agree with this engine; do not relabel this comparison matched. No building-code load generation or whole-building analysis.

Downloaded source SHA-256: `6a78d4783e46b00a7a6faa8d29bc35b340309e10c38bf0fd64bbd6430dcfcf29`.

## Reproducible files

- [Source metadata and explicit replay inputs](../benchmarks/permitCases.ts)
- [Shared-engine suite runner](../benchmarks/runPermitSuite.ts)
- [Machine-readable results, sources and inputs](../benchmarks/permit-results.json)
- [Twelve-report regression tests](../tests/permitSuite.test.ts)
- [Original Everett fixtures](../benchmarks/permitPackages.ts)

# Actual crane permit sizing review — 8 October 2026

This is a sizing-reasonableness review using **two independent municipal crane permit packages**, with three runway assemblies. It is not twelve actual runway permits, a complete analytical reproduction of either project, or verification of an economical default member. The application demonstration and calculation formulas remain unchanged.

## Everett / Boeing / DeShazo

- [Municipal Laserfiche scan](https://lfportal.everettwa.gov/WebLink/DocView.aspx?dbid=0&id=2096929&page=1), permit B2306-034, Boeing Building 40-58.
- Smithwick report SE-DS-RPT-17691, revision 1, July 25, 2023; job SE-DS-ST-1769.
- Printed report pp. 7, 19, 20 and 24 are viewer pages 26, 38, 39 and 43. Viewer images verified the values; OCR lazily includes adjacent pages and misread trolley weight as 2,700 lb. The image shows **1,700 lb**.
- W24X76 + C15X33.9, 25.5-ft column spacing, runway ends pinned at columns, 120-ft bridge, seven 1/4-ton trolleys, 48,200-lb bridge, two wheels/truck at 16-ft spacing, 60-lb/yd rail.
- Static wheel load 16.92 kip dead + 1.44 kip lifted = 18.36 kip. Impact 25%, side thrust 3.08 kip, skew 3.06 kip, longitudinal 3.67 kip. AIST building Class B, 500,000 fatigue cycles.
- Source runway global utilization 36%; fatigue category A check 7.01 ksi / 36.84 ksi. Those global checks are not the application's welded-keeper check.
- Source scan accessed through the interactive browser; no complete local source PDF was downloaded. Research images and OCR are in `tmp/permit-sizing/everett-*`.

## Puyallup / Red Dot

- [Municipal accepted permit PDF](https://permits.puyallupwa.gov/Portal/Permit/GetFile?docId=107692), permit PRCTI20230447, AHBL 2220760.20, October 2022, city accepted May 3, 2023 on PDF p. 1.
- Local downloaded original: `tmp/permit-calculations/dozen/red-dot.pdf`.
- SHA-256: `3b936d0731a824ffbd6d90d8386b709e315e58606df379ac5f75b18e8bfd99b8`.
- PDF p. 8 / sheet S2: 10-ton crane, 40-ft gauge; existing W18X76 + C15X33.9 at a 29-ft column bay; extension W30X99 + C15X33.9 at a 44.5-ft column bay. These are **two assemblies in one permit**.
- PDF p. 14 / sheet B1 confirms W30X99 and C15X33.9 in the bill of materials. Overall cut length is not the analysis span.
- PDF pp. 26–27 RISA connectivity/coordinates: existing principal W18 segment 22 ft, W30 principal segment 41.5 ft, with support knee regions and overhang. Do not substitute overall column bay for the calculation segment.
- PDF p. 28: moving load `10TBRIDGE` is **one 24.8-kip point**, with 1.1 combination multiplier; the complete manufacturer wheel schedule was not established from the reviewed pages. Do not invent two 24.8-kip wheels.
- Source discrepancy: p. 26 RISA W30 section Ix 5,269.516 in^4 / Iy 346.179 in^4 / area 36.2 in^2 differs from p. 54 composite worksheet Ix 5,537.70 / Iy 443.002 / area 38.717. The drawing establishes the selected assembly, but the discrepancy prevents claiming exact model equivalence.

## App trials and interpretation

- `scripts/reviewPermitSizing.ts` runs seven W24 sections from 104 to 250 lb/ft, plus three W24X131 brace/eccentricity sensitivities. Ten complete snapshots and the summary are in `output/permit-sizing/`.
- Identical baseline: three independent 25-ft bays, 2 × 20-kip static wheels at 10-ft spacing, 25% impact, 2-kip lateral wheel load, 1-million-cycle supplied spectrum, 25-ft both-flange restraints, 1/4-in rail eccentricity, fictitious plate rail and welded keepers, 0.005-rad owner twist limit.
- W24X250 passes, with major bending D/C 0.134, vertical deflection 0.072 in / 0.500 in and twist D/C 0.780. W24X229 passes twist but fails keeper fatigue. This is a seven-member search, not catalogue-wide optimization.
- `detailAnalysis.ts` adds the **factored strength-envelope** local keeper stress with full reversal to every fatigue bin and both edges. W24X131 local range alone is approximately 27.633 ksi before global stresses, against the Category D 1-million-cycle bound of approximately 13.015 ksi. That conservative superposition is not validated by these permit examples.
- Both public permits use cap channels. The application's detailed bare symmetric I-section model does not establish full capped-section torsion/fatigue/attachment adequacy. No lighter default was substituted merely to resemble drawings.
- Nominal assembly weights exclude rail/stiffeners/connections: 109.9 lb/ft for W24X76+C15X33.9 or W18X76+C15X33.9; 132.9 lb/ft for W30X99+C15X33.9; 250 lb/ft for the bare demo. The demo is 2.27× and 1.88× these respective assembly weights.

## Reproduction

1. `npx tsx scripts/reviewPermitSizing.ts`
2. Run `scripts/verifyPermitSizing.py` with Python. This imports no app calculation code, checks all ten vertical deflections within 0.000001 in, and checks the independent simple-span wheel moments by exact candidate placements plus a 200,001-position sweep.
3. Run `scripts/renderPermitSizing.py` with ReportLab installed to create `output/pdf/crane-runway-actual-permit-sizing-review.pdf`.

Static wheel-only moments: demo 160.000 kip-ft; Everett 117.045 kip-ft (one wheel at midspan governs). Always check wheels entering/leaving the span: using only the two-wheel maximum would understate Everett's maximum. These screens exclude impact, factoring, distributed loads and frame action.

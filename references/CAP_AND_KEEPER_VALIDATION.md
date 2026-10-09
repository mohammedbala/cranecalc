# Cap-channel and keeper-fatigue validation

8 October 2026. This review contains 18 fictitious sizing scenarios, three DG7 elastic-property assemblies and comparisons with two actual crane permit packages. It is not 18 independent permits or a complete validation of capped runway design.

## Completed changes

- Keeper fatigue now uses each bin's unfactored empty-plus-lift wheel groups and half side thrust, without impact or strength factors (Reference AIST Technical Report 13 §3.10.2.3). Full local reversal, no sharing/compression credit, all-cycle bounds and normal strength checks remain.
- Both the live worksheet and compact report show duty-bin forces and local stress ranges. A pure local-response function separates force selection from keeper mechanics.
- 72 pinned AISC C/MC sections use actual component centroid/axis transformations for elastic properties. Catalogue claims are checked on import/export. A nominal fit screen does not establish fillet clearance or fit-up gap.
- Three DG7 Table A-1 assemblies agree within 0.5% for 15 rounded elastic properties. An independent central-point-load solution verifies the capped top-flange force couple and deflection.
- The fictitious sample is now W24X229: 8.4% lighter than W24X250, unchanged 25-ft restraints, owner criteria, load schedule and connection inputs. 287 applicable checks pass; 6 not applicable. Twist D/C 0.958; vertical deflection 0.080 in; major bending D/C 0.150. This is not a catalogue-wide optimum.

## Remaining cap design limitations

Complete capped-section design/export remains blocked. A full implementation still needs verified monosymmetric flexure/stability, shear-center and warping stress recovery, rail-head twist, cap attachment shear transfer/fit-up and fatigue, channel material and CMAA duty input. Published approximate Cw/J values are research-only and never enter design resistance. See SOURCE_REGISTER.md for Eq.11/18 inconsistency and range limits. DG7 advises against cap channels for CMAA E/F duty. AIST building class is a different classification.

## Sizing scenarios

| Shape | Brace ft | Eccentricity in | Major D/C | Twist D/C | Failed checks |
| --- | ---: | ---: | ---: | ---: | ---: |
| W24X104 | 25 | 0.25 | 0.400 | 4.877 | 165 |
| W24X131 | 25 | 0.25 | 0.300 | 3.169 | 130 |
| W24X162 | 25 | 0.25 | 0.227 | 2.023 | 35 |
| W24X192 | 25 | 0.25 | 0.186 | 1.416 | 1 |
| W24X207 | 25 | 0.25 | 0.169 | 1.201 | 1 |
| W24X229 | 25 | 0.25 | 0.150 | 0.958 | 0 |
| W24X250 | 25 | 0.25 | 0.134 | 0.780 | 0 |
| W24X131 | 12.5 | 0.25 | 0.231 | 0.277 | 116 |
| W24X131 | 25 | 0 | 0.300 | 2.787 | 117 |
| W24X131 | 12.5 | 0 | 0.231 | 0.244 | 50 |
| W14X176 | 25 | 0.25 | 0.281 | 1.489 | 4 |
| W14X193 | 25 | 0.25 | 0.253 | 1.196 | 1 |
| W14X211 | 25 | 0.25 | 0.230 | 0.975 | 0 |
| W18X175 | 25 | 0.25 | 0.251 | 1.488 | 1 |
| W18X192 | 25 | 0.25 | 0.223 | 1.173 | 1 |
| W21X182 | 25 | 0.25 | 0.213 | 1.502 | 1 |
| W21X201 | 25 | 0.25 | 0.189 | 1.194 | 1 |
| W24X162 | 12.5 | 0.25 | 0.183 | 0.201 | 1 |

The W14X211 alternative passes with the original restraints but changes girder depth; it is not the default. W24X162 at 12.5-ft restraints fails the end-connection gross plate shear check (1.0255). Failed-check counts include repeated material points, not distinct failure modes.

## Actual permit context

- Everett B2306-034: W24X76 + C15X33.9, 25.5-ft bays, two 18.36-kip wheels 16 ft apart. Nominal assembly 109.9 lb/ft. [Municipal record](https://lfportal.everettwa.gov/WebLink/DocView.aspx?dbid=0&id=2096929&page=1), Smithwick SE-DS-RPT-17691 Rev.1, printed pp.7,19,20,24.
- Puyallup PRCTI20230447, Red Dot: W18X76 + C15X33.9 in a 29-ft knee-braced bay and W30X99 + C15X33.9 in a 44.5-ft bay. Nominal assemblies 109.9 and 132.9 lb/ft. [Accepted report](https://permits.puyallupwa.gov/Portal/Permit/GetFile?docId=107692), AHBL 2220760.20, PDF pp.8,14,26-28,53-54.
- The sample remains heavier than these assemblies. Wheel arrangement, rail/keeper details, cyclic duty, restraints and owner twist limit differ; component agreement does not authorize copying a permit section.

| Red Dot assembly/property | Permit | v16 transform | Difference |
| --- | ---: | ---: | ---: |
| W18X76 + C15X33.9 / A | 32.017 | 32.300 | +0.884% |
| W18X76 + C15X33.9 / Ix | 1841.400 | 1862.078 | +1.123% |
| W18X76 + C15X33.9 / Iy | 464.356 | 467.000 | +0.569% |
| W18X76 + C15X33.9 / Sbottom | 156.311 | 157.841 | +0.979% |
| W18X76 + C15X33.9 / Stop | 266.869 | 273.723 | +2.568% |
| W30X99 + C15X33.9 / A | 38.717 | 39.000 | +0.731% |
| W30X99 + C15X33.9 / Ix | 5537.700 | 5553.284 | +0.281% |
| W30X99 + C15X33.9 / Iy | 443.002 | 443.000 | -0.000% |
| W30X99 + C15X33.9 / Sbottom | 297.920 | 299.236 | +0.442% |
| W30X99 + C15X33.9 / Stop | 469.598 | 481.146 | +2.459% |

Units: in², in⁴, in³. Source component areas and centroids differ from v16; values were not backfitted. Red Dot RISA W30 properties also differ from its composite worksheet (Ix 5269.516 vs 5537.70; Iy 346.179 vs 443.002 in⁴). Its moving-load schedule shows one 24.8-kip point with 1.1 multiplier; no second wheel is inferred. These discrepancies remain unresolved for a complete replay.

## Verification and artifacts

- Engine regression suite: 136 tests passed before the final additional force-couple test; that additional test and all five cap tests passed. After changing the demonstration, 11 detailed-package/drawing tests passed in a single worker and plan-sheet tests passed. Two earlier concurrent runs hit timeouts; no check tolerances were changed.
- Production build passed. Browser verified duty-bin table, channel selection, disabled capped export, and restored the new demonstration.
- Independent numerical record: `output/cap-keeper-validation/evidence.json`; full snapshots under `output/keeper-fatigue-revision/` and `output/keeper-fatigue-alternatives/`. Prior pre-correction output remains under `output/permit-sizing/`.
- Reproduce source comparisons: `npx tsx scripts/reviewCapAndKeeper.ts`; PDF review: `scripts/renderCapAndKeeper.py`.
- Final PDFs: `output/pdf/crane-runway-demonstration.pdf` and `output/pdf/crane-runway-cap-and-fatigue-validation.pdf`. The demonstration PDF includes twelve Letter calculation pages and two 11×17 sheets.

# Source audit · October 6, 2026

Runtime register: `src/engine/references.ts`. Project inputs cannot alter source verification. Source applicability and completed engineering models remain separate gates; see [AIST_CHECKS.md](AIST_CHECKS.md).

| Source | Identity, evidence and implementation |
| --- | --- |
| User TR13 DOCX | `00-TR1319-EDITED-02242020.docx`. Core modification February 24, 2020; visible foreword Revised2020. [Official AIST committee listing](https://www.aist.org/technology-committees/find-a-committee/cranes/tr-13-guide-files) identifies the exact linked filename as TR13 ballot draft. Explicit user authorization supplies this draft as the worksheet basis; it is not relabeled published 2003/2021. Extracted OOXML and rendered using bundled LibreOffice; relevant rendered pages visually checked. SHA-256 `700db898ff8d9ffce17d182947cfa2720c1618f14e09c132b225bde50a59b1df`. |
| User DG7 PDF | `D807-19W-dxe.pdf`. **Visible third-edition cover**, copyright2019; metadata incorrectly names second edition. 129 PDF pages. Chapters11–14 read; third-edition AISC360-16/15th Manual basis confirmed. SHA-256 `96301ae7d220710c103bdaee1f9818ec2e2fea78e870c9955d3ca8660989040a`. |
| DG7 errata | February16,2023 corrections are appended to the final page of the supplied PDF: LRFD2b coefficient1.6, 2c Ci, cap-channel example A572Grade50. [Official errata](https://www.aisc.org/media/s0hpvjsn/dg-07_2023_revisions-and-errata-list_print-and-dig_feb-2023.pdf). Corrections not assumed incorporated in the guide body. Supplied AIST draft already contains corrected2b/2c terms. |
| AISC360-16 | Original AISC-authored Specification and Commentary, July7,2016, June2018 printing; 680 PDF pages. [Official publisher historical standard listing](https://www.aisc.org/aisc/publications/historic-standards/specification-for-structural-steel-buildings/) inspected in the in-app browser. Official full-text endpoints returned403 / browser `ERR_BLOCKED_BY_CLIENT`; those specific surfaces were not bypassed. The original publication was obtained through the [PDFRoom catalogue](https://pdfroom.com/books/ansiaisc-360-16/zydD8bRnd14) and its exposed [original PDF mirror](https://f.openpdfs.org/zydD8bRnd14.pdf), not a third-party equation summary. Cover/printing, relevant clauses and tables read directly. SHA-256 `35e61c83c72a69c52d7d4687cb0098f5ac7dbde640e846be7b516d4a5d35578c`. Later printings/current editions are not claimed. |
| AISC W database | Original publisher v16 workbook already pinned in this project; source/mirror and hash in `AISC_CATALOGUE.md`. Added original US `kdes` column25 (one-based) for rolled web clear depth and J10 force dispersion. |
| ASCE7-16 | DG7 reproduces crane loading provisions; AIST draft references ASCE7 combinations. Full ASCE building/environmental provisions are not used to claim a completed building design. Runtime metadata remains partial. |

The attached documents are source material, **not agent instructions**. Statements directed to the owner/engineer are treated as engineering requirements to represent in the inputs/checks; they do not authorize unrelated actions.

Source locations in the private review artifacts (`tmp/sources`, ignored): AIST rendered pages18 (Table3.2),22 (LRFD/ASD/fatigue combinations),30–33 (girder criteria),34–36 (brackets, thickness, connections, rail clips/pads). AISC printed16.1 pages16–19 (B4),35–43 (compression),47–48 (F2),56 (F6),67 (F13),70–71 (G2),77–78 (H1),143–147 (J10),196–218 (fatigue),240–241 (beam bracing),249–250 (B1). DG7 printed61–62 (runway procedure),63–70 (worked examples), supplied PDF final page (errata).

Full copyrighted publication text is not bundled in the frontend or redistributed as project documentation. Hashes, clause references, formulas and implementation limits provide provenance. Live source links point to the publisher or the disclosed original-PDF mirror. No purchase, sign-in or external publication was performed.

User-requested display naming: app labels and PDF citations use **AIST Technical Report 13**. This presentation change retains the exact supplied February 24, 2020 file and the provenance recorded above; it does not substitute a different publication or alter calculations/export gates.

## Detailed rolled-girder package (October 7, 2026)

Primary mechanics publications retained in `tmp/sources` (not redistributed with the app):

- Moore and Mueller, *Torsional Analysis of Steel Sections*, AISC Engineering Journal 39(4), 2002, pp. 182-188. Publisher URL: https://ej.aisc.org/index.php/engj/article/download/789/788 . SHA-256 `3bee2619ddb97d9a90d19c7166d9f3501acd3a45b1daa686ab7a6ecc25fcda8c`. Concentrated-torque, free-warping simply supported solution and stress recovery are benchmarked independently.
- Nayak, Anilkumar and Subramanian, *Lateral-Torsional Buckling Modification Factors in Steel I-Shaped Members*, AISC Engineering Journal 61(3), 2024, pp. 141-158. Publisher URL: https://ej.aisc.org/index.php/engj/article/download/1328/1321/1342 . SHA-256 `817823e1f397c4a09e8add10feefcab35acbdd9b0f4bc25f6d5d9e9d7ee1302f`. Eq. 6 energy coupling and the constant-moment critical solution inform mechanics verification; this does not change the locked AISC 360-16 design edition.

Additional clauses read directly in the pinned AISC 360-16 text: H3.3 normal/shear/buckling limits; J2.2/J2.4 weld geometry and resistance; Tables J3.1-J3.4 pretension, fastener stress and standard holes; J3.7-J3.10 combined actions, slip and slot bearing; J4 net-section and block-shear resistance; J7 steel bearing; J10.8 stiffener geometry/effective web strip; Appendix 3.1 temperature/corrosion/peak limits, A-3-2M Category F, A-3-5M/A-3-6M Category C-double-prime roots and Table A-3.1 attachment classes; Appendix 6.3 both-flange brace requirements. The root check uses plate stress and has no fatigue threshold when RFIL < 1.

Variable-amplitude damage is supplementary: all bins count without threshold credit, and the largest range is independently applied to the total cycle count. This conservative all-cycle bound avoids reliance on an unverified variable-amplitude endurance extrapolation. The connection and rail checks use conservative force/range bounds and explicit model geometry; no capacity is inferred from the 3D reference building.

## Additional published component benchmarks — 7 October 2026

Official [AISC v15.1 Companion, Volume 1](https://www.aisc.org/media/q5fcgxxu/v151_vol-1_design-examples.pdf), linked from the [15th-edition Manual companion page](https://www.aisc.org/aisc/publications/steel-construction-manual/15th-ed-steel-construction-manual/), was retrieved through the native browser download link. SHA-256: `2f50ed10e0c74adbc0ee77f79aa97785652f11cfb664a94c44580c339dd3ef65`. The specification basis is AISC 360-16.

Twelve distinct examples: E.1A, E.1D, F.1-1, F.1-2, F.1-3, F.5, G.1, J.1, J.2, J.3, J.4A and J.5. Their exact printed/PDF page locations, supplied inputs, tolerances and engine calls are recorded in `benchmarks/publishedExamples.ts`. LRFD/ASD outputs and subparts are not counted as separate cases. Source fractions and critical results were checked visually on the original pages.

The 37 comparisons retain 24 matches and 13 differences: six conservative-basis differences (Cb = 1.0 and omitted directional weld enhancement) and seven publication-rounding differences reproduced by independent US-unit substitutions. These are shared component checks, not twelve full crane designs or additional permit packages. Earlier review findings remain separate. Full source text stays in ignored temporary storage; the review reproduces numerical facts and original analysis only.


## Cap-channel and keeper-fatigue audit — 8 October 2026

- Keeper fatigue: supplied Reference AIST Technical Report 13 §3.10.2.3, extracted paragraph 836, requires Cds + Cvs + 0.5Css without impact or load factors. Duty-level lift fractions are project assumptions; the empty crane remains in every bin. The implementation conservatively adds a full reversed local stress bound to global stress extrema, counts every bin, and separately checks the largest range at all cycles. No load-sharing or stabilizing compression credit is taken.
- Cap bending: supplied DG7 §14.1, Example 14.1.3 and Appendix Table A-1 (printed pp.70,115). Three table assemblies benchmark component centroid/axis transformations. DG7 printed p.50 identifies fit-up gaps and attachment fatigue, recommends continuous welds, and advises against channel caps for CMAA E/F duty. The appended February 2023 erratum changes the example channel material to ASTM A572 Grade 50.
- Ellifritt and Lue, *Design of Crane Runway Beam with Channel Cap*, AISC Engineering Journal 35(2), 1998, pp.41–49. [Publisher article](https://ej.aisc.org/index.php/engj/article/view/699), [original PDF](https://ej.aisc.org/index.php/engj/article/download/699/698/698). SHA-256 `318c8f39614de3e0dbb202e6b00b9bcbddb290f461cbb037a4b1584758960975`. Printed pp.42–43 visually inspected: Eq.12 includes the square root of Ac/Aw; supported ratios 0.20–0.95. The paper concerns CMAA A/B/C, not AIST building classes. Eq.18 repeats the monosymmetry expression with an inconsistent definition of R relative to Eq.11; the diagnostic uses Eq.11 only. The reported Cw fit is approximate (most sections within -3%/+5%); J estimates can exceed tabulated values by 2.1–8.2%. These are not blanket accuracy guarantees. The estimates remain outside design resistance and do not supply a complete torsion/weld/fatigue model.

The cap-channel assessment is limited to elastic properties. It does not validate the complete designs in the Everett or Red Dot permit packages. Source-vs-catalogue discrepancies are retained in `CAP_AND_KEEPER_VALIDATION.md`; component properties are not backfitted to reproduce historical software output.


## Capped design implementation - 8 October 2026

The elastic-only limitation in the preceding audit is superseded by the bounded capped design implementation in `CAPPED_DESIGN.md`. This does not constitute a replay of either full permit design.

- Additional AISC 360-16 clauses read directly: F4 User Note permits F5 for singly symmetric members; F4.2 definition of rt; F5-1 through F5-10; E4-3; F13.3 cap attachment; J2/J4 and Appendix 3 longitudinal weld, termination and Category F provisions. F5 Lr is used consistently with the selected conservative resistance branch. Both compression directions are checked.
- The 1998 Ellifritt/Lue paper's basic monosymmetric critical moment equations (1-6) support independent mechanics checks. The design now integrates sectorial properties from a median-line model. Empirical fits remain outside design resistance.
- Lue and Ellifritt, *The Warping Constant for the W-Section with a Channel Cap*, AISC Engineering Journal 30(1), 1993, pp.31-33. [Publisher article](https://ej.aisc.org/index.php/engj/article/view/604); [publisher PDF](https://ej.aisc.org/index.php/engj/article/download/604/603/603). SHA-256 `f67dd329de95d843c39d814f115d459e328313c9aacde729ad6c6c87c7220187`. Original Table 1 on printed p.32 visually read. Twelve Cw values are retained in `scripts/reviewCappedProperties.ts`. Present catalogue/median-line results are 7.09-10.89% below the historical table; the exact cause is unresolved. These are model/data differences, not twelve permit-package validations. Lower Cw alone does not establish conservative recovered stresses.

## Welded column bracket - 8 October 2026

Pinned AISC 360-16 source rechecked for F11 rectangular bars, J10.4 unrestrained-flange sidesway, J10.6(a) panel shear/axial reduction and Appendix 3 Category F A-3-2M. Supplied Reference AIST Technical Report 13 §5.9.2 and its Commentary supply the bracket applicability and rotation/fatigue considerations. Full implementation assumptions, conservative bounds, tests and remaining building-interface exclusions are in [BRACKET_DESIGN.md](BRACKET_DESIGN.md). Runtime source version: `2026-10-08.welded-bracket-1`.


## Connection-practice and hardware-coordination audit - 8 October 2026

Supplied DG7 §§11.2 and 14.5, Fig.11-1, and Reference AIST Technical Report 13 §§5.8.5 and 5.9.2 were compared with the actual model. Bracket support and full-depth stiffening are recognized arrangements; the exact rectangular-rib bracket, generic ties and keeper are not prequalified or proprietary standard details. Tieback articulation, column-side attachments and rail movement remain project-specific.

- Fisher and Van de Pas, *New Fatigue Provisions for the Design of Crane Runway Girders*, AISC Engineering Journal 39(2), 2002, printed pp.65-73; connection discussion pp.68-70. [Publisher PDF](https://ej.aisc.org/index.php/engj/article/download/777/776). Historical detailing comparison only, not a replacement for the pinned design specification.
- [Gantrail weldable rail clips](https://www.gantrail.com/products/crane-rail-fixing-clips/welded-rail-fixing-clips/), official manufacturer description consulted for fit/adjustability/product distinctions; no supplier capacities are assigned to the generic keeper.

The original capped example had actual tie-bolt intersections with web/stiffeners/welds despite 536 passing calculation rows. The revised flange-saddle example resolves the detected static intersections and has 601 passing / 7 not-applicable rows. Neither count establishes movement compatibility. Read [CONNECTION_PRACTICE_REVIEW.md](CONNECTION_PRACTICE_REVIEW.md) for counts, repeat patterns, actual-size weld representation, static sampling limits and exclusions. Both demonstration models were scanned with shared viewer constructors; the scan is separate from resistance checks.


## Flange-saddle redesign - 8 October 2026

Runtime source register `2026-10-08.flange-saddle-1` identifies the custom local component model separately from the standard provisions. AISC 360-16 J2/J3/J4 resistance and Appendix 3 fatigue use the pinned sources. Local saddle/flange/receiver strips and series compliance are explicit mechanics assumptions, not formulas attributed to DG7. Independent algebra/regression tests check their implementation. Supplied DG7 §11.2, printed pp.49-50, favors direct flange attachment and requires end-rotation, longitudinal and differential vertical movement compatibility; that compatibility remains unverified in this custom detail. Geometry, revised dimensions, initial failure corrections and scan limits are recorded in CONNECTION_PRACTICE_REVIEW.md.

## Existing I-bracket supports — 9 October 2026

Great Falls International Airport, [RFP for purchase and installation of bridge crane and runway](https://flygtf.com/wp-content/uploads/2025/09/RFPbridgecrane082925.pdf#page=3), issued August 2025, retrieved 9 October 2026. SHA-256: `587da3215058bdd954700b9aebd3fd2b9d760d9c14a05ffcf5d685fe58f578e2`. PDF page 3 shows an existing built-up I-stub and column continuity plates; pages 19–22 show building/crane arrangement and coordination information. The RFP calls for the new runway to be bolted to the existing brackets. It does not establish bracket dimensions, weld sizes, material grades or available resistance. The supplier's W18X86 bridge girder is not a prescribed runway girder. These are arrangement references, not bracket calculation benchmarks.

The `existing-corbel` option models surveyed existing steel and a new bolted spreader. The existing bracket, original root welds, continuity plates and receiving column use recorded engineer-assessed available vertical and two-axis moment resistances. A conservative linear interaction is evaluated on concurrent load cases and must be permitted by that assessment. Separate recorded fatigue-range capacities and cycle coverage are required. Survey, condition, local contact, service/movement and attachment confirmations remain export gates; no existing capacity is inferred from the image. Full building, foundations and movement-compatible locating/sliding attachments remain separate.

New spreader checks use a simply supported elastic strip with actual end-bearing patches and overhangs; this is an explicit mechanics idealization rather than a formula attributed to the RFP or TR13. Self-weight is conservatively included at 1.4 for LRFD and 1.0 for ASD. Two times each peak absolute unfactored response bounds fatigue reversal. New-seat fatigue uses the existing conservative E-prime model with no endurance credit. Four plate-retention bolts have dimensional fit checks; their force resistance and hole effects require the attachment assessment. They are not credited as girder hold-downs or sliding guides.

S-05 uses the same bracket geometry as the 3D viewer, with dashed existing steel and solid new work. Original root welds are not given invented sizes or labeled new field welds. Source version: `2026-10-09.existing-brackets-1`.


### Bracket type library — 2026-10-09

The bracket selector distinguishes welded twin-rib seats, welded haunched seats, new wide-flange stubs, existing wide-flange stubs (RFP-style), and existing built-up plate I-brackets. The existing W-section option uses the local AISC Shapes Database dimensions and area, independently of the runway girder and built-up plate inputs. W12X65 is an editable initial placeholder, not a section identified in the RFP. The supplier W18X86 in that RFP describes the bridge girder and is not assigned to this support. Changing the selected existing W-section invalidates its prior survey confirmations and assessed resistances. New-seat mechanics and external-assessment gates remain in force; alternative haunched/new-W families still require their own design model and block final export.


### Angle tieback reference models — 2026-10-09

AISC L-section geometry is extracted from the existing hash-verified Shapes Database v16.0 workbook; source row and original US fields are preserved. Rechecked Fisher / Van de Pas (2002), publisher PDF https://ej.aisc.org/index.php/engj/article/download/777/776, and the supplied DG7 §11.2 tieback discussion. These support lateral-restraint/movement/fatigue requirements, not approval of a specific angle arrangement. The angle options are original welded-gusset concepts with no assigned resistance or stiffness; the paired-flat-bar design model is not reused.

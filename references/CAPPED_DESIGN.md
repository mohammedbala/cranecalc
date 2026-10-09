# Capped runway implementation — 8 October 2026

This supersedes the earlier elastic-only cap assessment. The original 10-ton rolled example is retained. A separate fictitious 2-ton, three-bay W24X94 + C15X33.9 example demonstrates the complete capped branch. It is not a resized solution for the original crane.

## Supported configuration

Centered catalogue W + inverted C/MC, full-length cap, dual continuous longitudinal fillets at W flange edges, full bearing contact, no top-flange or channel holes, compact compression elements, and the entire channel above the elastic neutral axis. Enter independent channel Fy/Fu, electrode strength, fillet size, development length, CMAA class, material/duty provenance and fit-up requirements. CMAA A-D is supported; DG7 excludes E/F. AIST building classes remain separate. Bearing stiffeners require a CJP connection to the W top flange and fitted bottom ends.

Partial caps, intermittent welds, fit-up gaps, perforated top elements, distortion, deep caps crossing the neutral axis and custom/noncompact configurations are gated. Optional welded gravity brackets and local column effects are now checked when enabled; see BRACKET_DESIGN.md. Global existing framing, foundations, anchors, separate horizontal receiving attachments and building-mounted stops remain separate designs.

## Resistance and mechanics

- Catalogue component area/centroid/inertia transformations, with the channel axes rotated. Full composite longitudinal action depends on the checked attachment.
- Conservative AISC 360-16 F5 by the F4 User Note. Both compression-flange branches are computed; the lower available major resistance governs all positions. This intentionally also limits simple spans by the adverse sign. No plastic reserve or Cb increase. F5 Lr is used consistently, rather than mixing the F4 Lr tabulated in DG7 A-2 with F5 stresses. The compression rt includes one-third of compressed web area. The lower steel grade governs combined resistance.
- Independent elastic lateral resistances for top flange plus channel and bottom W flange. H1 uses simultaneous axial/major/top/bottom actions, with conservative B1. F13 uses the entered bottom net area and unperforated top confirmation.
- E4-3 flexural-torsional compression includes centroid/shear-center offset. E7 applies the least element effective-width ratio to the entire gross area conservatively.
- The open median-line tree merges contacting top plates, omits fillets, and joins offset plate centrelines with zero-area links. Sectorial projection removes axial and lateral-bending components. Cw and shear-center position follow integration; beta and sectorial shear flow are recovered from the same tree. J is only the sum of tabulated component constants: the favorable overlap term is omitted. Elastic catalogue Ix governs major bending. The smaller of integrated/catalogue Iy governs the torsion model.
- Four-DOF Vlasov elements include actual unequal spring offsets, rail height above shear center, signed monosymmetry and axial-offset geometric stiffness. Independent closed forms verify both moment signs and E4-3 axial instability. Strength uses 0.8 elastic stiffness; no material nonlinear or distortion credit.
- The normal-stress bound includes extreme cap and W fibres; signed fatigue recovery uses sectorial coordinates. Base metal beside continuous cap welds is Category B; cap-end terminations conservatively Category E. Both are automatic, in addition to entered points and rail keepers.
- Each cap weld receives VQc/(2Ix), lateral half-channel first-moment flow, a conservative sectorial first-moment bound, local rail transverse/overturning demand over a two-rail-depth patch, and the factored axial envelope's channel share transferred over reduced effective end-development length. No local sharing or stabilizing wheel compression. Strength checks weld metal and connected-metal yielding/rupture. End development conservatively develops the entire channel yield force, including end-loaded weld reduction. Category F throat fatigue uses full reversed bounds and adds full traction reversal into the channel share.
- Local keeper bending uses the channel web thickness alone, not W flange plus cap thickness. Rail bearing footprint must remain over the W flange. Existing rail, brace, end, stiffener, fatigue and serviceability checks continue to apply.
- Single-crane travel refinement now permits up to 640 uniform positions when required, in addition to exact wheel crossings. The 1% limit remains unchanged; unconverged results still cannot export.

## Verification and published differences

`tests/cappedDesign.test.ts` verifies unequal-flange shear center/Cw, coordinate and scale invariance, symmetric warping shear, signed monosymmetric critical moments, E4-3 compression, eccentric spring equilibrium, F5 limits, DG7 weld shear flow, cap applicability and weld development. `tests/cappedPackage.test.ts` exercises complete three-bay LRFD simple and ASD continuous cases, report equations/sheet creation, genuine weld failure and revision changes. Existing bare-W tests remain required.

Three DG7 A-1 assemblies reproduce Ix, top lateral inertia, centroid and both section moduli within 0.5% of rounded source values. W30X99 + C15X33.9 gives rt about 4.50 in, Lp about 119 in and **F5 Lr about 407 in**, versus **457 in for the F4 table**. DG7's 77.7-kip shear gives about 0.756 kip/in per longitudinal weld. The application does not back-fit source rounding or substitute the F4 Lr.

An additional comparison records 12 Cw values from Lue/Ellifritt (1993), Table 1. The app's present v16 median-line model gives Cw 7.09–10.89% lower than that historical table. These are **model/data differences, not exact-match validation and not permit calculations**. The source does not provide all original plate coordinates needed to isolate the discrepancy. No multiplier is used to force agreement, and no fitted research Cw enters design. Lower Cw alone does not certify every recovered stress. Independent closed-form tests establish the implemented idealization, while the historical discrepancy remains visible for engineering review.

## Source provenance

- User-supplied AISC Design Guide 7, third edition (2019), §13.3, §14.1, Examples 14.1.3/14.1.4 and Tables A-1/A-2; appended 2023 errata. Source identification in SOURCE_REGISTER.md.
- User-supplied AIST Technical Report 13, dated February 24, 2020; cited in product as Reference AIST Technical Report 13.
- AISC 360-16 original specification: F4/F5, E3/E4/E7, F13, H1/H3, J2/J4 and Appendix 3. Relevant F5 and rt source pages read directly.
- Ellifritt & Lue (1998), publisher PDF https://ej.aisc.org/index.php/engj/article/download/699/698/698, Eqs.1–6; original figure/equations visually checked. Empirical fits stay research-only.
- Lue & Ellifritt (1993), publisher PDF https://ej.aisc.org/index.php/engj/article/download/604/603/603. Original Table 1 visually checked. Local `tmp/sources/ej-cap-warping-1993.pdf`.

## Reproduction and outputs

Start the local app, run `npx vitest run --maxWorkers=1`, `npm run build`, then `npx tsx scripts/generateCappedDemonstration.ts`. The PDF endpoint recomputes and checks the same revision before generating. Run `npx tsx scripts/reviewCappedProperties.ts` to regenerate historical Cw comparisons. `scripts/renderCappedDesign.py` produces the review memo from saved evidence.

`output/capped-demonstration/` contains the project, complete snapshot, signed shear-center interface CSV, editable DXF and S-01 through S-05 SVGs. The current example PDF contains Letter calculations followed by five ARCH D (36 by 24-inch) sheets. New S-03 shows the actual cap section, weld symbols, contact requirements and scaled end development. All numerical/applicability gates must resolve; engineering failures remain visible in a review export and do not become acceptable merely through export.

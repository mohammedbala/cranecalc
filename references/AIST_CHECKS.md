# AIST runway worksheet implementation

Reference: **AIST Technical Report 13**, using the user's supplied source dated February 24, 2020; AISC 360-16 (June 2018 printing); and DG7 third edition with its appended February 2023 corrections. Source verification is distinct from project applicability. Exact file identity and provenance are retained in SOURCE_REGISTER.md.

| Check | Implementation / limits |
| --- | --- |
| Building classification | Owner A–D class and building load repetitions, Table 1.1. Fatigue stress fluctuations are entered separately. |
| Impact, side thrust, traction | §3.6.2/Table 3.2 cab/radio/pendant/type rules and greatest-of side thrust, enveloped with ASCE 7 §§4.9.3–4.9.5 (25% cab/remote or 10% pendant impact; 0.2(Q+T) lateral; 10% of maximum static wheel loads longitudinal). Design adopts the greatest of AIST, ASCE 7 and supplied forces; runway side-thrust share is not taken below 0.5; lateral wheel pattern is proportionally scaled, never reduced. A zero pattern requires input. |
| Crane load split | Static loaded wheel minus unloaded wheel is lifted contribution. Manufacturer must confirm the same trolley position; impact normalized once. |
| LRFD / ASD | §3.10.2 runway-only projections; crane bridge/trolley dead weight and lifted loads separately factored. Single-crane Css/Cls/Ci/Cbs; empty, loaded and absent states; minimum lift conservatively zero. Project must exclude environmental/building actions on this girder. Nonnegative uniform runway occupancy L may be entered. |
| Serviceability | §5.8.7 one crane, static vertical, no impact; A/B L/1000, C/D L/600, lateral L/400 or stricter owner criterion. Shortest bay governs conservatively. Lateral result is independent flange bending, with rail-head force couple, not complete rail twist. |
| Compactness | AISC B4.1b; AIST requires compact top flange/web. Catalogue kdes determines clear web depth. Custom sections receive no fillet credit. Noncompact and cap-channel flexure remain unsupported. |
| Major flexure | AISC F2, Cb=1.0, phi=.90/Omega=1.67, all three Lb branches, only compact symmetric I-section. Actual bracing and rail load-height stability remain separate. Approximate welded thin-plate J receives no favorable resistance credit (J=0 in F2/E4 strength). |
| Tension flange rupture | F13.1/B4.3, entered least actual net flange area across both flanges. Where required, the F13 strength cap also controls major flexure and H1. No viewer hole dimensions are inferred. Zero is missing input. |
| Lateral flexure | DG7 §14.1 rail-head force couple to both flange centroids. Flange-only rectangular plate resistance, without web contribution. This is more conservative than substituting the whole-section Manual minor strength appearing in the DG7 worked example. |
| Axial / interaction | E3/E4/E7 with supplied effective lengths, H1 at concurrent stations/cases, conservative Appendix 8 B1 with Cm=1.0. No frame sidesway analysis. Flange moment/resistance used conservatively with the unresolved torsion check kept visible. |
| Web shear | G2.1, kv=5.34 without stiffener credit; stocky rolled-web phi=1/Omega=1.5 where applicable. AIST prohibits tension field action. |
| Wheel / bearing | AIST lb=2(rail depth+tf). J10 web yielding, crippling, sidesway and compression buckling; end-zone and support checks conservative. Overlapping bearing patches require a grouped patch-load model. No stiffener resistance credit. |
| Fatigue | Appendix 3 category constants/thresholds; selected outer flange edge at entered x; complete empty/loaded/absent/reversed-side envelope; Cds+Cvs+0.5Css, no impact/factors. All-crane superposition is included conservatively. Owner must specify equivalent full-range stress fluctuations and actual detail classification/fabrication. The exact cube-root power is conservatively used in place of the rounded 0.333 exponent. Local stress concentration, local weld/connection fatigue, thermal/corrosive exclusions and variable-amplitude spectrum verification require the actual detail. |
| Peak cyclic stress | 0.66Fy at the same selected material point; includes dead-load major/flange bending, eccentric rail weight and possible occupancy live load. Warping stress remains unresolved. |
| Detailing | Minimum thickness; paired rail-clip spacing/pads; hook-bolt restrictions; bracket support below 50 kip total unfactored reactions, including impact; long-span camber and backup bracing flags. Bracket rule is suitability, not a capacity calculation. |
| Brace requirements | Appendix 6 point-brace flexural strength/stiffness displayed; Cd=2 for continuous members conservatively. Actual axial/lateral effects, connections and flexibility require a full brace-system model. |
| Connection screening | Minimum bolt pitch and one effective fillet weld line in direct shear. No bolt-group, plate, block-shear, slip, prying, local weld fatigue, eccentric weld-group or bearing-stiffener capacity is implied. |

## Remaining models and export gates

Saint-Venant/warping torsion, rail twist and above-centroid load stability; actual stability brace system; actual girder bearing/end/tieback/longitudinal connections and required bearing stiffeners are **not solved by the generic source provisions or representative 3D details**. These remain explicit input/design/model blockers. Disabling connection templates does not waive required design checks. The supporting prefab building, brackets, columns, roof, knee bolts and other viewer hardware are not designed by this girder worksheet.

The supplied-load analysis report remains available in analysis scope. A complete design report stays blocked while any applicable model/input/source requirement is unresolved. Verified engineering failures remain reportable only after numerical and completeness gates pass; no source checkbox bypasses the engine. Server and browser share the calculation engine.

## Verification

- DG7 Example 14.1.1: W24×131 ASD available major strength 605 kip-ft and whole-section minor strength 203 kip-ft; Example 14.1.2 LRFD major strength 909 kip-ft. Flange-only resistance is checked separately, about 99.65 kip-ft ASD.
- Two 38.1-kip static wheels at 12-ft spacing on 30 ft: the concurrent exact UDL/wheel moment agrees within 1% with DG7's conservative 478-kip-ft impact and 386-kip-ft static sums. DG7 adds independent UDL/wheel maxima; our calculation retains concurrency. Web sidesway agrees within 2% after tabulated rounding.
- Hand substitution checks for end yielding/crippling, F13 rupture strength cap, conservative welded torsional-property treatment, split load factors, minimum force rules, fatigue constants/thresholds, impact normalization, unit invariance, continuous multiple cranes, single-crane deflection, zero-data gates, every catalogue shape's finite primitives and KaTeX rendering.

## Optional detailed rolled-girder package

The preceding table describes the original general worksheet. Projects containing `details` now have an additional explicitly defined package. It replaces the legacy torsion, brace, bearing and connection blockers only when the detailed model actually runs. Catalogue rolled symmetric W-sections are required; existing gates for other sections, overlapping local web bearing patches, guide rollers, long spans and missing owner/supplier information remain. A girder-mounted eccentric bumper is outside this template; a stated full-speed force is delivered to a separate building-mounted stop.

Implemented additions:

- Coupled lateral/Vlasov warping response with finite both-flange springs, load-height geometric stiffness, normal/shear stress bounds, critical-load factor, rail-head movement and twist. Independent analytical torsion/LTB/Pz/axial benchmarks, force residual and separate travel/mesh refinements.
- Paired flat-bar ties with E3 compression, net tension, Appendix 6 imperfection loads and member/gusset/bolt/weld stiffness in series. Symmetric double-cover end and tie templates evaluate elastic bolt groups, slip, bearing, net section/block shear, plate flexure/compression and eccentric weld groups. The in-plane template excludes prying, rather than assuming a capacity for an arbitrary out-of-plane load path.
- Fitted bearing stiffener pairs and seat plate, including lateral diaphragm strength, full reaction/lateral weld transfer, dimensions, end rotation allowance and connection fatigue.
- Idealized rail bending and pad pressure, integral stepped keepers and local girder flange response, rail-joint bars/slots/thermal travel and cyclic checks. Close wheels are grouped for rail components; overlapping girder-web wheel patches still block design export.
- Multiple signed fatigue points, automatic keeper locations, duty bins, local/warping stress, dead-load peak bound, all-cycle conservative check, C-double-prime weld roots and Category F throats. Environmental applicability is validated.
- Signed simultaneous interface forces and bumper bypass demand, dimensioned SVG/DXF sheets, fabrication/inspection notes, project JSON and compact/detailed PDF formats. Supporting building/frame/bracket/anchor/foundation capacities remain excluded.

`demonstrationProject()` supplies a clearly marked fictitious 10-ton example. Fictional data are permitted only for demonstration purpose; project purpose retains manufacturer-data gates. Numerical/engineering checks do not change with report purpose. No source certification checkbox or forged eligibility flag is accepted by the report endpoint.


## Audit corrections — 9 October 2026

Changes from the full-application audit (Phase 0 safety fixes):

- **ASCE 7 §4.9 floors.** Minimum impact, side thrust and longitudinal force are the greater of AIST TR-13 and ASCE 7 §4.9. Minimum-load rows report the adopted design value with the AIST, ASCE 7 and supplied values; a missing wheel side-force pattern still fails.
- **Per-flange bracing.** Top and bottom flanges are restrained only at their own brace stations (both at supports) in the detailed lateral/torsional model. Lb must be at least the compression-flange restraint gap (top flange on simple spans, either flange on continuous spans); torsional effective length is checked against stations restraining both flanges.
- **Fatigue fibre and ASD panel zone.** Detailed rolled-girder fatigue takes major-axis stress at the outer flange face (d/2). J10.6 uses alpha = 1.6 for ASD.
- **Rail inputs.** Design rail height above the flange must equal the AIST rail depth. Detailed projects design for a rail eccentricity of at least the rail setting allowance on the drawings.
- **BY OTHERS status.** Confirmations of adequacy this calculation does not compute (bracket column-side horizontal load paths; existing-bracket contact, stiffness/movement and horizontal attachments) report BY OTHERS rather than PASS. Every design states that the existing columns, frame, longitudinal bracing and stops, anchors and foundations are not checked and must be verified by the EOR with ASCE 7 building loads. BY OTHERS never blocks export and is never counted as a pass.
- **Detail clashes.** Validation rejects a rail keeper whose inner fillet (plus 1/16 in fit-up) does not fit between keeper and rail foot, and girder-end cover plates that overlap the bearing stiffeners. Both examples were revised to buildable details and remain all-pass.
- **Drawings.** Sheets and sketches state the number of failed calculation checks.

Remaining audit items (existing-column module, interface load-type breakdown with ASCE 7 combinations, longitudinal load path, tieback movement compatibility, drawings driven only by project inputs, engine-side clash/clearance rules, package issuance) are tracked in the audit report.

## Existing building checks — 9 October 2026

For adding or replacing runway supports on an existing building.

- **Support reactions by load type** (worksheet 05, report page 06A, CSV): unfactored D, occupancy L, crane empty Cd, lifted Cv and impact Ci for the crane arrangement maximizing them at each support (order, separation and absent cranes enumerated), the largest single-crane side thrust Css at the support and the runway longitudinal force Cls. Governing AIST/ASCE 7 minimums apply. Verified against the closed-form shared-support reaction and the moving-load envelope.
- **Existing column** (report page 06B): the bracket's surveyed receiving column (or an AISC W shape, or plates) under ASCE 7 §2.3 LRFD / §2.4 ASD combinations with every crane component as live load L (§4.9), W and E in both directions, and entered unfactored existing P/Mx/My/V for D, L, Lr, S, R, W and E. Crane effects come from a single-column elastic model per axis (pinned or fixed base, braced or free top): eccentric reaction at the seat, side thrust at the rail head, longitudinal force on the weak axis when the column resists it. AISC 360-16 E3/E4/E7, F2 with F3 flange local buckling, F6, G2 and H1 with B1 (Cm = 1); effective lengths may not be below the AISC Commentary Table C-A-7.1 K for the end conditions. Every support is evaluated and the worst governs. Runway-level drift is compared with h/n (DG7 guidance about h/240 cab, h/100 pendant). W14X90 reproduces AISC Manual Table 3-2 phi*Mpx = 574 kip-ft.
- **Limits:** existing effects are added to the crane peaks without sign or location credit (conservative). Frame action, base flexibility, a direct-analysis stability model, column-side bracket and tie connections, crane-level longitudinal bracing and stops, anchors and foundations remain BY OTHERS. Noncompact or slender column webs (AISC F4/F5) are not implemented and report MODEL REQUIRED.

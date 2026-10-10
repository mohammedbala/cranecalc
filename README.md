# CraneCalc

Crane runway calculation workspace with a moving-wheel-load beam solver, live LaTeX worksheets, source verification register, project files, and validated report/SVG/DXF export.

## GitHub Pages

The static build runs calculations and creates reports entirely in the browser. Project inputs remain in browser storage on the current device; export a project JSON file to move between devices or between the local and hosted versions. The site is public, but saved project inputs are not uploaded to GitHub.

```sh
npm ci
npm run build:pages
npm run preview:pages
```

Open http://127.0.0.1:4175. After validation, **Generate output** recalculates the captured inputs in a separate worker and opens the output panel. Select **Open report · Print / Save PDF**, then use the report's print control. Use Chrome or Edge, 100% scale, background graphics enabled, and browser headers/footers off. Reports retain Letter calculation pages and ARCH D drawing page definitions; verify the saved PDF's page sizes because browser print capabilities vary. Printable HTML includes embedded equation fonts and can also be downloaded for offline review. SVG, DXF, JSON and interface CSV downloads remain available.

`.github/workflows/pages.yml` tests and builds the static site on pushes to `main`, then deploys it to GitHub Pages. Set the repository's **Settings → Pages → Source** to **GitHub Actions**. No API key, server, database, or secrets are required. Relative asset paths support both repository Pages URLs and custom domains. Only `dist` is published; source reference files, generated local reports, and private attachments are not web assets.

The static and local versions use the same calculation engine and report renderer. Invalid, incomplete, unverified and unsupported results block export; verified failed checks remain visible in exportable reports. Publishing the application does not expand its engineering scope or certify a design.

## Run

Requires Node.js 22 or newer.

```sh
npm ci
npx playwright install chromium
npm run dev
```

Open http://127.0.0.1:5173. The report service binds to 127.0.0.1:4174. For the built application, run `npm run build` then `npm start` and open http://127.0.0.1:4174. Stop either with Ctrl+C. No cloud account or deployment is required. Fonts and report assets are bundled locally.

## Current calculation capability

The app now includes an **AIST runway girder design worksheet** referenced to **AIST Technical Report 13** using the user's supplied source dated February 24, 2020, DG7 third edition (2019, appended 2023 corrections), and directly verified AISC 360-16 provisions. Exact source provenance is retained in the source audit; the reference building requires its own design.

- One to six simple/continuous bays, one to three ordered crane trains, manufacturer wheel schedules, refined moving-load analysis, US/SI conversion and AISC W-shape catalogue.
- AIST LRFD/ASD runway combinations, separate crane dead/lift/impact components, absent/empty/loaded crane states, single-crane horizontal actions, minimum impact/side-thrust/traction rules and manufacturer bumpers.
- Compactness, compact symmetric I-girder F2 LTB/flexure, rail-head flange force couple, longitudinal compression and concurrent H1 interaction, F13 actual net-flange rupture, G2 web shear without tension field action.
- Local wheel/support yielding, crippling, sidesway/compression buckling; actual bearing inputs; one selected girder fatigue material point and resistance; single-crane AIST deflections; minimum thickness, clip/pad spacing, hook-bolt and bracket suitability.
- Brace strength/stiffness requirements and connection bolt-pitch/weld direct-shear screening, with full system/connection models explicitly distinguished.
- Server-revalidated PDF/SVG/DXF exports from an immutable revision. Supplied-load analysis reports remain available.

**Complete design export remains gated** by actual torsion/warping/load-height stability, brace-system adequacy and complete bearing/end/tieback/longitudinal connection models. Generic source equations and representative 3D bolts cannot verify these. Noncompact flexure and special long-span/guide-roller/overlapping-wheel cases remain unsupported. Catalogue capped W girders now have the separate bounded design branch described below. Disabling connection templates does not waive required checks.

See [implementation and limitations](references/AIST_CHECKS.md) and [source identities, hashes and clause locations](references/SOURCE_REGISTER.md). Source status reflects the supplied full texts; unresolved project inputs/models are not mislabeled unavailable sources.

## Generating output

1. Replace the illustrative geometry, crane schedule and criteria with project inputs.
2. Choose **Criteria → Report scope → Supplied-load analysis & user criteria** for an analysis-only report. AIST design scope requires actual project data and all applicable engineering models before design export.
3. Resolve input errors and ensure equilibrium and both refinement checks pass. Failed user serviceability checks may be exported and are identified in the report.
4. Click **Generate output**. The local service downloads the PDF; GitHub Pages offers a printable report with **Print / Save PDF**. Both versions offer individual SVG downloads and layered CAD linework DXF. Live diagram previews are available before export.
5. Changing inputs triggers recalculation and retains an existing generated report as an explicitly identified previous revision.

Analysis reports explicitly exclude code compliance, strength, torsion/warping, fatigue, bracing and connection adequacy. Lateral bending deflection is not rail displacement including twist. Code load factors are not applied even when the project method selector is LRFD or ASD. The shortest-span deflection limit is applied conservatively to a global multi-span deflection envelope. Continuous supports are assumed to resist any calculated uplift; actual hold-down design is excluded.

## Engineering implementation

Canonical units are mm, N, MPa and kg/m³. `src/engine` holds the shared project schema, solver, validation, properties, reference register and immutable snapshot types. The UI calculates in a cancellable Web Worker; `server` independently checks the same engine before rendering escaped HTML to PDF in a network-isolated Chromium page.

Beam elements use exact elastic stiffness, consistent arbitrary-position point-load vectors and uniform-load vectors. Nodal deflections are recovered by Cholesky solution. Point-load moments and shear discontinuities are also evaluated at wheel locations. Moving-load positions are sampled and refined, with exact axle/support crossing positions added; the result is a converged sampled envelope, not proof of an exact multidimensional global maximum. Lateral restraints are rigid, not springs. Shear deformation and nonlinear effects are excluded. The default allowable refinement change is 1%; equilibrium tolerance is 1e-7 relative to applied loads.

Analysis-scope longitudinal demand is descriptive. AIST design applies the single-crane traction or bumper term; actual longitudinal connections/load paths remain separate.

## Verification

```sh
npm test
npm run build
npm run test:e2e
```

Tests cover analytical central/off-node point loads, uniform loads, equal two-span continuous behavior, moment releases, shared-support load accounting, section integration, unit invariance, impact provenance, source and export gates, failed-serviceability export, ordered multiple cranes, immutable revisions, input escaping and desktop/mobile workflows. PDF smoke artifacts and rendered inspections are temporary files under `tmp/pdfs`.

Public permit comparisons can be rerun with `npm run test:permits`. [Permit benchmark results](references/PERMIT_BENCHMARKS.md) record **50 comparisons from 12 distinct municipal reports: 36 match and 14 differ**. Coverage is 2 crane reports, 8 other steel reports and 2 timber reports used only for shared beam mechanics. Sources, page references, hashes, explicit inputs and remaining differences are recorded in the report and `benchmarks/permit-results.json`. The regression suite checks demonstrated agreement and preserves the documented discrepancies; these isolated checks do not reproduce twelve complete crane designs or validate entire permit models.

The additional runway review suite runs with `npm run review:runway` while `npm run dev` is active. It executes **12 runway-focused cases and 78 comparisons (72 matches, 6 recorded differences)**, reruns the earlier permit suite, exports analysis PDFs for the four-wheel and two-crane cases through the normal server, and verifies that incomplete design export returns 422. Review inputs and results are saved under `output/runway-review/`; original app PDFs are intermediate files in `tmp/runway-review/`. `scripts/renderRunwayReview.py` uses ReportLab, pypdf, Pillow and matplotlib to create the two final review PDFs under `output/pdf/`, including the actual app reports as appendices. The cases and independent reference equations are in `benchmarks/runwayReview.ts`. PDF review findings describe calculation and drawing gaps without changing design capacities or export eligibility.

An additional AISC component suite runs with `npm run review:published`: **12 distinct published examples, 37 comparisons, 24 matches and 13 retained differences**. Six differences follow conservative app assumptions; seven printed-rounding differences are independently reconciled by `scripts/reconcilePublishedExamples.py`. The examples come from one official AISC v15.1 companion publication, not twelve new permit packages. `scripts/renderPublishedExamples.py` produces `output/pdf/crane-runway-additional-aisc-review.pdf`; numerical inputs, locations and tolerances are in `benchmarks/publishedExamples.ts`. Source design demands that fail under the app assumptions remain visible.

To release a code-design capability, obtain authoritative full provision text, record exact applicability/clauses/errata, implement each required limit state and load combination, and add independently checked published benchmarks. Do not change a source status to verified merely to enable export. Enabling source flags alone does not implement missing calculations.

## Interactive 3D viewer

The overview includes a compact 3D model with a 2D elevation toggle. Open **3D viewer** for a larger inspection area. Drag to orbit, scroll/pinch to zoom, and Shift-drag to pan. Camera presets (isometric, front, end and top), zoom/reset buttons, wireframe mode and governing wheel-position selection are available. The camera fits the current model on resize. Geometry follows input dimensions in canonical units; rail, wheels and connection details are schematic. Invalid inputs disable the model, and missing WebGL 2 produces an explicit 2D fallback. The viewer does not change calculation scope or export eligibility.

## CAD engineering sketches

Open **Diagrams** for dimensioned elevation, plan and section views. **CAD** uses a dark model-space grid with layer colors; **Paper** previews monochrome print linework. Zoom and drag to inspect details, or use Fit to reset the view. Sketches include outline and hidden lines, dash-dot centerlines, open dimension arrows, section hatching, leaders and a revision title block.

After **Generate output**, download **Drawing set (.dxf)**: every issued ARCH D sheet at full paper size, side by side in sheet order, as one AutoCAD 2000 (AC1015) DXF with named layers (new steel, hidden steel, rail, existing/reference, grids, annotation, title block), lineweights, DASHED/HIDDEN/CENTER linetypes and Arial text styles. Plot at 1:1 in inches (US) or millimeters (SI). The engineering-sketch DXF (elevation, plan and section at true size) remains available. Dimensions are exploded linework and labels, not associative CAD dimensions. The DXF follows the [Autodesk DXF entity reference](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-7D07C886-FD1D-4A0C-A7AB-B4D21F18E484.htm).

Rail, wheel and support symbols are schematic. Rail cross-section geometry was not supplied; the plan shows its centerline and entered eccentricity. Rolled-section fillets are omitted. Connection templates remain illustrative and are excluded from DXF. Sketches document the analysis model and are not fabrication drawings. All exported files retain the generated calculation revision and the existing validation gates.

The PDF ends with the ARCH D (36 × 24 in) drawing set, numbered *N OF M*. **S-00** is the cover: scope of work, general and existing-building notes, crane runway installation notes, codes and standards, crane data, runway design criteria, unfactored support reactions, sheet index, materials, special inspections, submittals, deferred submittals / items by others, abbreviations and issue status. **S-01** contains an isometric (not to scale), a runway plan and a girder elevation with T.O.R./T.O.S. elevations from the surveyed column seat or the entered top of rail, girder marks and a runway girder schedule. Every view title carries a detail bubble; references between sheets resolve to *detail/sheet* when the set is assembled. Existing and reference construction is dashed; new steel is solid.

**S-02** contains bracket bearing, end connection, flange tie, rail keeper and rail joint views with branched component leaders and AWS fillet-weld symbols; **S-03** to **S-06** cover the cap channel, independent supports, column brackets and direct flange ties when they apply. **S-07** details the bolted runway end stops when a crane stop force reaches the girder: elevation, plan, section at the face and design data. Leaders land on the label end facing their target and are ordered so they do not cross. The title block carries the engineer of record, revisions and the issue status; sheets read PRELIMINARY - NOT FOR CONSTRUCTION until the calculation validates with no failed checks, the engineer of record is entered and an issue purpose is selected.

Drawing dimensions use feet and fractional inches in US mode, with small plate/bolt sizes in fractional inches; SI drawings use millimeters. Under **Project**, enter the originator, checker, floor datum, top-of-rail elevation (unless the existing column survey sets it), engineer of record, issue purpose and revision rows. Preview the sheets under **Drawings**, or download their individual SVGs from Generated output. Calculation pages remain Letter size.

## Reference support framing in 3D

The default full bay is an open prefab metal building with continuous tapered fabricated I-columns, haunched gable rafters, bolted moment-frame knees and ridge splices, lipped Z roof purlins, C wall girts/eave struts and sidewall/roof bracing. W12X40 runway brackets bear off these building columns. Both runway lines and the schematic bridge crane remain visible. The arrangement follows the tapered clear-span framing illustrated in [MBMA's guide](https://www.mbmaeducation.org/wp-content/uploads/2023/06/MBMA_Student-Design-Competition_Quickstart_Guide.pdf), with illustrative member/connection dimensions.

Open **Reference structure** to change the frame type, bracket shape, height below the bracket, bay width, roof clearance, 2:12–4:12 roof pitch and labels. **Rolled AISC reference frame** retains the earlier W-column/flat-roof arrangement and its column selector. Preferences are independent of engineering project inputs.

The bracket member/column geometry and source cells are documented in [references/REFERENCE_FRAMING.md](references/REFERENCE_FRAMING.md). Connections and framing are illustrative and excluded from the calculation. The final arrangement sheet includes them in dashed reference linework.

With **Bolts & connections** enabled, select a fastener and open **Fastener detail**. The isolated viewer has assembled/exploded modes, camera presets and orbit/zoom controls. Distinct component colors identify the beveled hex head, hollow washers, hex nut, shank and continuous helical threads. Anchor rods show the exposed nut, washer and threaded end with the embedded rod cut away.

Enable **Show bolt holes** to hide fasteners, fade surrounding undrilled members and highlight the real plate-hole edges. Use **Inspect** for support seats, bases, rail clips, frame knees and ridge splices; the part picker can select and zoom to exposed plates. Turning the mode off restores installed hardware.

## Rolled girder selection

The example now defaults to **W24X84**. Under **Geometry**, choose **Rolled W-section · AISC catalogue**, then select any of the 289 AISC W-shapes. The app loads d, bf, tf, tw, A, Ix, Iy, Sx, Sy, Zx, Zy, J and Cw together. Expand **Tabulated section properties** for the compact property table and source row. Switching US/SI preserves the exact canonical properties; selecting a shape preserves the material grade, loads and criteria. Catalogue dimensions are read-only. **Custom supplied properties** permits documented manual input.

Dataset provenance, workbook hash, cell mapping, unit conversions and extraction instructions are recorded in [references/AISC_CATALOGUE.md](references/AISC_CATALOGUE.md). Source claims are checked again on import and PDF generation. Only the former untouched example section is migrated in saved projects; customized geometry is retained. Catalogue selection does not establish section or connection adequacy or remove design verification gates.

On macOS, the local report service and browser tests use installed Google Chrome when available, in an isolated profile. Other environments use the Playwright browser installation. Set `CRANECALC_CHROMIUM_CHANNEL` to override the browser channel if needed.

### Representative demonstration

To design a real project, enter the crane, girder and spans, then click **Start detailed design** under **Connections**. It adds neutral detailed inputs sized from the girder and spans: bearings and stiffeners, flange ties, bolted end bearings, end stops where a stop force reaches the girder, rail keepers and joints, a fatigue register (midspans, supports and the longest-bay top flange), a single-bin duty spectrum and generic fabrication notes. Rail, pad and supplier items are marked *TO BE ENTERED*, and every generated value must be reviewed and confirmed before export. Demonstration or fictitious wording in any printed field blocks a project package until it is replaced. The demonstration buttons ask before replacing the current project.

Click **Load demonstration** to load the fictitious 10-ton example with three simply supported 25-ft W24X229 bays (75 ft overall), a 40-ft reference runway spacing and a 100-ft reference floor datum. **Connections** contains editable detailed geometry, rail/keeper/joint inputs, owner criteria, duty bins, fatigue points and fabrication notes. **Project** selects compact plan-review or complete equation worksheet. Once current inputs and numerical/model gates pass, **Generate output** recomputes on the server and produces the PDF; the output dialog also offers project JSON, signed interface CSV, SVG sheets and layered DXF.

The package covers the defined girder-side templates. Supporting building framing, column brackets, anchors, building-mounted stops and foundations are excluded; their interface forces are provided. The 3D hardware remains representative. See `references/AIST_CHECKS.md` and `references/DEMONSTRATION_IMPLEMENTATION.md` for scope and evidence. To regenerate the saved example through the running report service: `npx tsx scripts/generateDemonstration.ts`.

For predictable local test resource use: `npx vitest run --maxWorkers=2`. The development report service now watches shared/server files so report changes are picked up along with frontend changes.


### Keeper fatigue and cap-channel assessment (8 October 2026)

Keeper fatigue uses each duty bin's unfactored wheel groups per Reference AIST Technical Report 13 §3.10.2.3: empty-crane load plus the bin fraction of lift, and reversed half side thrust, without impact. The live worksheet and compact PDF show these forces and local stress ranges. Full local reversal, all-cycle fatigue bounds, and normal strength checks remain. The revised three-bay demonstration uses W24X229, 8.4% lighter than its previous W24X250, with unchanged crane loads, owner twist limit, restraint spacing and connection inputs. It is a tested W24 choice, not a catalogue-wide optimum or a site design.

The cap-channel dropdown contains 72 AISC v16 C/MC sections. Elastic properties use the tabulated components, channel centroid and rotated axes. Three DG7 table assemblies verify this transformation. Published approximate torsional properties are shown separately for research and are never credited to resistance. The earlier elastic-only restriction is superseded by the bounded capped design branch described below; missing applicability and attachment inputs still block design export. See `references/CAP_AND_KEEPER_VALIDATION.md` for the sizing trials, actual permit comparisons and model limits.


## Existing building checks

**Bolted end bearings** (Connections, simple spans): each girder end is bolted through its bottom flange, bearing plate and bracket seat with four bolts in two rows at the bearing plate ends. The left end of each bay locates with standard holes and pretensioned slip-critical bolts that carry the factored longitudinal force, the bottom-flange tie force and uplift. The right end slides in slots in the girder flange under plate washers. Its bolts are pretensioned against steel sleeves that pass through the slots, so the flange is not clamped and still slides: AISC J1.10(c) requires pretensioned bolts at crane supports in buildings with cranes over 5 tons. The sleeves carry the transverse force in bearing on the slot sides and the washers take uplift into the bolts. Snug-tight bolts with jam nuts (long slots within the J3.2 2.5d limit) remain selectable for cranes of 5 tons or less and are checked against that limit. Checks cover bolt slip, shear, tension and bearing, sleeve installation load and length, flange bearing on the sleeves, washer bending, flange and seat prying, edge distances and spacing, and nut clearance to the web fillet, bearing stiffeners and bracket ribs. The bolted bearing replaces the girder-end cover plates and restrains the bottom flange laterally, so the paired-bar tie is needed at the top flange only; the analysis models that bottom restraint through the bolts' shear stiffness. Drawn on S-02 (shared support elevation and bottom-flange hole plan) and SK-05. Continuous runways keep the girder-end connection.

**Tie movement** (paired flat-bar ties): the bars are fixed in the girder bolt group and must follow the girder. Single-crane support rotation moves each bar along the runway by up to θ·d every cycle; factored rotation plus thermal travel α·L·ΔT at sliding ends sets the static movement. The checks cover Category B fatigue at the bolt groups with that cyclic out-of-plane bending, AISC H1-1 for each bar under the tie force with the imposed-movement moments (thermal as a self-straining load, factor 1.0), out-of-plane bending of both gussets and their root welds, root fatigue, and bar slenderness (K = 0.8 between the inner bolt rows). At the column end each bolt can be pretensioned against a steel sleeve passing through a vertical slot in the column gusset, which releases support deflection without clamping the gusset; slot travel, sleeve load and length, gusset bearing, net section, block shear and edge distances are checked. Direct flange saddles also work where the bracket is by others: enter the column face distance, and the package states the bracket deflection limit that the slots permit as a deferred-submittal criterion. Runway end stops sit inboard of the runway-end tie saddle and are checked for nut clearance to it.

**Runway end stops** (Connections): when a crane stop force reaches the girder, design bolted stops near the girder ends, inboard of the top tie saddle, for the factored bumper force at the bumper height. The checks cover front-bolt tension with shear and slip, bolt bearing, no-prying thickness of the base plate and girder flange, stop flexure, shear, face bending and welds, the bumper couple on the girder end span and far-support uplift, web local yielding and crippling under the heel, Category B fatigue at the stop holes, and the nut clearances to the bearing stiffeners, the top tie saddle, the face plate, stiffeners and web fillet. Rail keepers start beyond the stops. Building-mounted stops remain by others.

Worksheet section **05 Existing building & supports** is for adding or replacing runway supports on an existing building. It lists unfactored support reactions by load type (D, L, crane Cd/Cv/Ci, side thrust Css, longitudinal Cls), downloadable as CSV. Enable **Check the existing column** to check the receiving column for those crane reactions plus its existing D, L, Lr, S, R, W and E effects under ASCE 7 combinations and AISC 360 compression, flexure, shear and H1 interaction, with a runway-level drift check. With a column bracket, the column section, eccentricity and flange unbraced length come from the bracket's surveyed receiving column. Enable **Check the bracing that carries crane traction and stop forces** to check the crane-level longitudinal braced bays (tension-only rod X, angle X or single angle) for crane traction or the crane stop force with the building's own wind and seismic forces. Frame action, collectors, brace connections, anchors and foundations remain by others. See [references/AIST_CHECKS.md](references/AIST_CHECKS.md).

## Capped runway design

Choose **I-girder with cap channel** under Geometry, select the AISC W and C/MC shapes, and complete **Cap material & attachment**. Live checks include conservative F5 flexure for both bending signs, separate flange lateral resistance, E4/E7 compression, shear-center-based torsion/warping, cap weld shear flow and end development, and weld/base-metal fatigue. The channel web alone carries the local keeper bending check. Full contact, continuous full-length welds and unperforated top elements are required; CMAA E/F and unsupported geometries stay gated.

**Load capped example** opens a separate fictitious 2-ton, three-bay W24X94 + C15X33.9 example. It is not a replacement section for the 10-ton rolled example. Generate output includes eight ARCH D (36 x 24 in) sheets, including the cover, cap attachment, independent supports, welded brackets, direct flange ties and runway end stops, with the drawing set DXF. The revised tie layout and local saddle checks resolve the detected static hardware clashes, and the tie movement checks cover end rotation, thermal travel and support deflection; the global building interface remains separate. See [capped design basis and verification](references/CAPPED_DESIGN.md), including the explicit difference from the historical published Cw table.

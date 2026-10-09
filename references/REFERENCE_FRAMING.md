# AISC geometry for the 3D reference framing

The viewer's rolled framing option and runway brackets use six W-shapes from **AISC Shapes Database v16.0**, `Database v16.0` worksheet. Only nominal `d`, `bf`, `tw`, and `tf` dimensions are included. Values are in inches and converted by exactly 0.0254 m/in. Rolled fillets are omitted from the idealized geometry. The default tapered metal building uses fabricated plate members and cold-formed secondary sections with illustrative dimensions, without an AISC rolled-section designation. These models do not change the calculation's DG7/AISC/ASCE edition basis and are not selected by strength or stiffness checks.

Publisher: [AISC Shapes Database v16.0](https://www.aisc.org/aisc/publications/steel-construction-manual/aisc-shapes-database-v160/).

The publisher's page returned HTTP 403 and its workbook download failed. The AISC-authored workbook was retrieved on October 5, 2026 from [Purdue's steel design course](https://web.ics.purdue.edu/~jhunjhu0/Steel%20Design/), [workbook download](https://web.ics.purdue.edu/~jhunjhu0/Steel%20Design/aisc-shapes-database-v16.0.xlsx). The workbook includes a `Readme` and the `Database v16.0` sheet (plus additional course worksheets). Its SHA-256 is `dec6202f8c2055bdefee9e13cb3d38e9110664c61dcf91d09604296ef2dcf660`. The source workbook is retained as a temporary verification file, not shipped as a workbook. A separate 289-entry W-section property extract now supports the calculation dropdown; see [AISC_CATALOGUE.md](AISC_CATALOGUE.md).

Column headers: B = `EDI_Std_Nomenclature`, G = `d`, L = `bf`, Q = `tw`, T = `tf`. Values below are the numeric cell values with insignificant Excel binary rounding removed.

| Role | Shape | Row | d (in) | bf (in) | tw (in) | tf (in) |
| --- | --- | --- | --- | --- | --- | --- |
| Column | W14X90 | 208 | 14 | 14.5 | 0.44 | 0.71 |
| Column | W12X65 | 237 | 12.1 | 12 | 0.39 | 0.605 |
| Column | W10X49 | 257 | 10 | 10 | 0.34 | 0.56 |
| Bracket / roof | W12X40 | 242 | 11.9 | 8.01 | 0.295 | 0.515 |
| Bracket / roof | W10X33 | 260 | 9.73 | 7.96 | 0.29 | 0.435 |
| Bracket / roof | W16X50 | 177 | 16.3 | 7.07 | 0.38 | 0.63 |

Reference columns occur at the runway support X coordinates, offset outboard of each runway line. Each continuous column extends from its foundation to the roof joint and carries an inward-facing W-section bracket, bearing seat, end plate and paired triangular bracket knee plates. The girder bottom flange contacts the seat; the bracket reaches its end plate, which contacts the column's inner flange. The opposite assembly is mirrored into the bay.

The 10, 15 or 20 ft viewer height sets the column length below the bracket. Roof clearance determines its extension above the runway. The member arrangement, lengths, plates, pads and connections are illustrative and excluded from the beam analysis, PDF sketches, DXF and design checks. Viewer settings persist separately from engineering project inputs.

## Connection visualization

The bolt-detail view adds girder-to-seat bolts, seat mounting bolts, horizontal bracket-to-column bolts, base anchor rods, stepped rail clips, bearing stiffeners, weld beads, and wheel-hub fasteners. Bolt assemblies contain a shaft, beveled hex head, hollow hex nut, two hollow washers, and continuous V-profile helical threads. Anchor rods contain a nut and washer above the base plate. Component colors identify the pieces on the installed hardware. **Fastener detail** opens an isolated assembled/exploded viewer with head, side and nut/thread camera presets; embedded anchor rods are cut away. Thread pitch is representative and is not a specified thread standard. Seat, bracket end plate, column inner flange, base, rail clip, bracket top flange and runway flange holes align with modeled fastener axes. Bracket attachment bolts pass through the vertical end plate and column flange.

The template uses representative 3/4-inch connection bolts and 1-inch anchor rods, with visualization proportions for heads/nuts/washers. Bolt sizes, layout, hole diameters, rail-clip spacing, stiffeners, and welds are not sourced AISC connection designs, are not derived from the project's connection-check inputs, and are not fabrication details. Rail clips are omitted when the schematic rail has insufficient flange clearance. Support/rail close-ups use local cutaways to avoid obstruction by surrounding members; individual part selection and zoom are available. Picking ignores surfaces outside the active cutaway. Hardware geometry is shared by size/grip to reduce rendering and memory costs.

**Show bolt holes** hides installed fasteners and fades undrilled members that obstruct the view, retaining opaque drilled plates with highlighted hole rims. These are actual geometry openings, including column bracket, knee, ridge and bracing connections. Holes in stacked plates align along fastener axes. The count denotes holes in individual plates/flanges, rather than distinct bolt axes. Faded surfaces do not intercept pointer picking. Knees and ridge splices have dedicated inspection cutaways and selectable plate/fastener IDs.

## Whole reference structure

The default overview includes two matching runway lines inside an open tapered metal building. The layout is informed by [MBMA's QuickStart Guide](https://www.mbmaeducation.org/wp-content/uploads/2023/06/MBMA_Student-Design-Competition_Quickstart_Guide.pdf), pp. 14, 17 and 25: rigid frames, clear-span tapered primary members and C/Z secondary framing. The chosen gable frame represents the arch-like behavior of a moment frame with a pitched ridge; it is not a curved-arch model.

The fabricated I-columns deepen toward the eave to 0.75 m; their inner flange remains vertical for runway bracket attachment. Rafters have 0.80 m knee depth reducing through a haunch to 0.35 m at the ridge, with representative 0.30 m flanges, 18 mm flange plates and 10 mm webs. These proportions, lipped 200 mm Z purlins / 180 mm C girts, stand-off clips, end plates, stiffeners and bolt layouts are visualization templates, not manufacturer-supplied geometry or checked designs. Knee and ridge joints show paired bolt rows, nuts, washers, threads and matching openings. Sidewall and roof-slope X bracing remain visible.

The optional rolled frame retains W16X50 transverse roof beams, W12X40 eave beams and W10X33 purlins. Both arrangements include base plates, anchors and concrete pads. A schematic double-girder crane bridge, end trucks, trolley, cable and hook span the rails at the displayed governing crane position; bridge members use W12X40 geometry as a stand-in for manufacturer construction.

Bay width is a viewer-only 20, 30, or 40 ft setting; roof clearance from the rail to the underside of the eave haunch is 6, 8, or 10 ft. Gable pitches are 2:12, 3:12 or 4:12. These are not crane manufacturer dimensions or building-design inputs. The second runway shares the primary runway's mesh geometry for context, with unique `F-` part IDs and world-coordinate inspection. Mirrored load arrows are omitted because opposite-runway loads are not calculated. Frame type and pitch persist separately from project inputs; older preferences adopt the tapered default while retaining their bracket, height and bay settings.

The Whole structure control clears cutaways and frames the complete building. Connection cutaways are used only when explicitly selected. Existing viewer preferences migrate to the whole-structure default while preserving selected shapes and column height. All added framing, the opposite runway, the crane bridge, and their hardware are excluded from analysis and PDF/DXF output. No building, foundation, roof, crane-bridge, connection, or bracing adequacy checks are implied.

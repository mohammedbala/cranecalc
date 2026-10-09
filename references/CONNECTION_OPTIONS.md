# Connection arrangement options

The Connections worksheet has independent bracket and tieback selectors. Selections and reference geometry are saved in the project and included in its fingerprint. Missing selection fields in older projects retain the existing rectangular twin-rib and paired-flat-bar models.

| Family | Display and calculation status |
| --- | --- |
| Welded twin-rib seat | Existing rectangular-rib component checks. Its movement and whole-building limitations remain. |
| Welded haunched seat | Actual tapered rib geometry with editable tip depth. Separate variable-depth, weld, column and fatigue design required. |
| Rolled W-section corbel | Actual selected AISC v16 W dimensions. Corbel, seat, full root weld group, receiving column and fatigue design required. |
| Paired flat-bar ties | Existing double-cover bar model and enabled flange-saddle checks. Movement compatibility remains separate. |
| Single-angle tieback | AISC L-section with a welded vertical leg at girder/column gussets. Eccentricity, buckling, shear lag, strength, stiffness, movement and fatigue remain unverified. |
| Double-angle tieback | Mirrored AISC angles on opposite faces of a gusset. Paired-member load sharing, attachments, restraint stiffness, movement and fatigue remain unverified. |
| Flexible plate tieback | Generic vertical flexible plate with lap attachments. Imposed movement, strength, stability, stiffness and fatigue require a new model. |
| Single articulated bearing link | Generic link, open bearing eyes, pins, collars and drilled clevises. No manufacturer rating is assigned. |
| Double articulated tieback | Adjacent independent girder links to a shared column attachment. Available for simple spans; an end support has one active link. |

The articulated concepts are shown at both flange levels to expose the application's previous restraint locations. Published single/double tieback descriptions do not validate that exact placement, lower-flange load path, clevis geometry or articulation. A supplier/project package must establish those details.

## Source evidence

- Reference AIST Technical Report 13, user-supplied source, §5.9.2 and Commentary 5.9.2: column brackets, impact, offset reactions, support rotation, fatigue and the 50-kip recommendation. The exact source identity remains in SOURCE_REGISTER.md. This establishes a support family; it does not prescribe the new haunched or rolled-corbel proportions.
- Supplied AISC Design Guide 7, §11.2, Fig. 11-1 and §14.5: transfer lateral forces while accommodating end rotation and differential column shortening; direct flange attachments preferred. The welded light-duty detail in Fig.14-10 is restricted to CMAA A/B. The app does not claim its generic plate preview reproduces or qualifies that detail.
- Fisher & Van de Pas (2002), printed p.68 / Fig.1, [AISC Engineering Journal](https://ej.aisc.org/index.php/engj/article/view/777): independent published discussion of tieback flexibility and fatigue. This is detailing evidence, not a replacement for the pinned AISC design edition.
- [Gantrex tieback assemblies](https://www.gantrex.com/products/tieback-assemblies/), accessed 2026-10-08: bearing-ended steel links; single tiebacks for limited space/end/continuous conditions; double links from adjacent girder ends to a shared column attachment. Products are custom designed for crane loads and building configuration.
- [Molyneux PFSL / TBL tiebacks](https://www.molyneuxindustries.com/TieBacks.html), accessed 2026-10-08: bearing-link families and varied connection assemblies. No supplier rating or dimension was copied into the model.

## Design and output boundaries

Alternative arrangements produce unsupported checks with no capacity or utilization. The existing detailed spring/warping/connection analysis is not run under an incompatible arrangement; it cannot certify the new link stiffness or bracket resistance. The independent supplied-load beam analysis remains available. Project and demonstration reports remain blocked; changing report scope is not an override.

The existing generated report stays tied to its original revision. The new drawing preview projects the selected bracket and tie solids into a clearly labeled ARCH D reference sheet. Old bracket/flange-tie fabrication details are suppressed for alternatives. The installed-bolt clash audit is disabled because its scope does not validate articulated pins, bearing motion or access envelopes.

Selection does not reset crane loads, duty cycles, criteria, existing plate dimensions or material strengths. The selectors enable the bracket when needed to locate the column face. Link and plate preview dimensions are separate from the retained paired-bar design dimensions.

## Field welds to existing building steel

Bracket rib/corbel root welds and column-side tie-gusset welds are identified as field welds to the existing column. The flag sits at the arrow/reference-line junction; fillet size remains left of the triangle, without an inch mark. The same execution designation appears in the 3D inspection information for modeled column-root welds. New bracket seat-to-rib/corbel fabrication welds remain shop welds.

Symbol convention: [AWS welding-symbol chart, AWS A2.4:2007](https://app.aws.org/mwf/attachments/64/225364/AWSWeldSymbolchart.pdf), supplementary field-weld symbol. This symbol reference does not select the governing welding-code edition or qualify a connection.

Reference tieback families show an unsized field-weld intent at the existing column. Their weld size, extent, fatigue resistance and receiving steel still require the connection design; the report gate remains in place. Existing weld-size inputs and calculation capacities are unchanged by the field/shop designation. Confirm existing-steel weldability, qualified procedures, surface preparation and inspection in the project specifications.


## Angle options added 2026-10-09

Single and paired angle ties are separate selectable profiles, with independent section, lateral end setback, offset toward the girder end, saddle length, lap, gusset thickness and reference lap-weld size. The dropdown includes 137 AISC L-sections; catalogue dimensions are read-only. Initial L3X3X1/4 and paired L2-1/2X2-1/2X1/4 sections are placeholders, not recommended or source-specified designs. Changing ties preserves the bracket, crane, runway section and other tie profiles.

The angles are custom welded assembly previews, not claimed reproductions of DG7 or a standard installation. DG7 §11.2 and Fisher / Van de Pas, printed p.68, establish the movement and fatigue obligations; they do not verify the custom single/double-angle arrangement or both-flange placement. Angle load eccentricity, buckling, shear lag, paired-member load sharing, gusset/root welds, cyclic stress and imposed movement need a separate model. Selecting these options blocks final reports in both scopes and suppresses incompatible flat-bar results.

The 3D model and ARCH D reference sheet use the same L-shaped solids. Girder gussets drop inside the flange edge to clear downturned cap-channel legs. Geometry validation checks attachment lap, nominal weld/plate fit, clear length, top/bottom separation, own-end saddle extent, column-face fit and separation between adjacent ties. These screens do not establish full hardware/tool-access or movement clearance. Column root welds remain unsized field-attachment intent.

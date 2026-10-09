# AISC rolled W-section catalogue

The girder dropdown contains all **289 W-shapes** in the AISC Shapes Database v16.0, `Database v16.0` worksheet, rows 2–290. The default example is **W24X84** (row 123). This is an illustrative starting section, not an automatically engineered selection.

Publisher: [AISC Shapes Database v16.0](https://www.aisc.org/aisc/publications/steel-construction-manual/aisc-shapes-database-v160/). The AISC-authored workbook and its August 2023 Readme were retrieved on October 5, 2026 from [Purdue's steel design course mirror](https://web.ics.purdue.edu/~jhunjhu0/Steel%20Design/aisc-shapes-database-v16.0.xlsx). Workbook SHA-256: `dec6202f8c2055bdefee9e13cb3d38e9110664c61dcf91d09604296ef2dcf660`.

The shipped extract is `src/data/aiscWShapes.json`. Each record retains its original US values and source row. `scripts/extract-aisc.py` reproduces the extract from the pinned workbook using openpyxl and verifies the hash before extraction. The bare rolled-section design input represents a doubly symmetric I-section. A separate C/MC extract supports the limited elastic cap-channel assessment below.

| Fields | Source columns | Original units | Internal conversion |
| --- | --- | --- | --- |
| Designation, nominal weight | B, E | lb/ft for weight | Weight retained for dropdown label |
| kdes · design fillet depth | Y | in | ×25.4 to mm; B4/J10 calculations |
| d, bf, tw, tf | G, L, Q, T | in | ×25.4 to mm |
| A | F | in² | ×25.4² to mm² |
| Ix, Iy, J | AM, AQ, AX | in⁴ | ×25.4⁴ to mm⁴ |
| Sx, Sy, Zx, Zy | AO, AS, AN, AR | in³ | ×25.4³ to mm³ |
| Cw | AY | in⁶ | ×25.4⁶ to mm⁶ |

US nominal dimensions, not detailing dimensions, are used. Metric workbook property columns have scaling factors; the app instead converts US values directly to avoid double scaling or intermediate rounding. Selected properties are used directly rather than recalculated from the rectangular display geometry. Fillets are omitted in the 2D/3D visualizations. Self-weight follows the entered steel density and tabulated area; nominal weight is descriptive catalogue data.

Selecting a shape replaces the four dimensions and all nine properties together, with a traceable source string. Fy, Fu, E, density, crane loads and project criteria remain project inputs. Catalogue dimensions are read-only; the compact property table is expandable. Choosing **Custom supplied properties** detaches the catalogue identity and requires a documented source before calculation can proceed.

Import and server-side report validation check catalogue claims against the pinned dataset. Edited or mismatched catalogue geometry/properties/source are rejected. Existing customized sections remain unchanged when loading stored projects; only the former untouched welded example geometry is upgraded to the new rolled default. The database version does not change the calculation's locked DG7/AISC 360-16/ASCE 7-16 basis or clear the existing design verification gates.


## Cap-channel component catalogue

`src/data/aiscChannels.json` includes all 72 C/MC shapes from the same pinned workbook, with original US values and exact source rows. `scripts/extract-aisc-channels.py` verifies the workbook hash and extracts W, A, d, bf, tw, tf, x, Ix, Iy, Sx, Sy, Zx, Zy, J, Cw and kdes by original column header. The channel is rotated over the W top flange; its x centroid becomes the vertical offset from the back of the web. Catalogue identity validates both components and all adopted dimensions. Choices that cannot clear the W flange are disabled. This is a nominal geometric fit screen, not a weld-gap or fillet-clearance check.

The component areas and inertias are transformed using the parallel-axis theorem. Tabulated component area carries fillets into the elastic calculation, unlike rectangular display geometry. Composite weld action is assumed for this assessment. Approximate plastic moduli and rectangular J are not verified capped design properties; Cw remains zero in resistance properties. Separate published research estimates never enable capped design exports.


## Angle tieback geometry catalogue

`src/data/aiscAngles.json` contains all 137 L-sections from the same pinned v16.0 workbook. `scripts/extract-aisc-angles.py` verifies the workbook SHA-256 before extracting the original US designation, source row, W, A, d, b, t and kdes. For the tie preview, d is the vertical leg, b the outstanding leg, and t the thickness; nominal rolled fillets are omitted. No section or connection resistance is derived from this geometry catalogue.

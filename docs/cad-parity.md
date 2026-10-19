# CAD editor: parity with AutoCAD (and Revit, where it fits)

This is the gap analysis and the ordered plan for bringing the in-browser CAD editor (`src/cad/`,
`src/components/CadEditor.tsx`) to working parity with AutoCAD 2D drafting and sheet production, and with
Revit's model-to-sheet associativity where that makes sense for a crane runway design app. Each increment ships
with unit tests (vitest), a browser check where it matters (Playwright), and README updates. The status column is
kept current as increments land.

## Where the editor started (audit, branch point `claude/focus-revb` @ 3b0550c)

About 1,600 lines. A drawing (`CadDoc`) is a flat list of entities on layers, in paper inches / millimeters
(sheets) or sketch units (sketches), y up.

| Area | What exists | Notes |
| --- | --- | --- |
| Entities | line, polyline (straight segments only), solid, circle, arc, single-line text, dimension (horizontal, vertical, aligned) | No per-object color, linetype or lineweight (always ByLayer); no ellipse, spline, construction line, hatch, block, multiline text, leader or table |
| Draw | LINE, PLINE, RECTANG, CIRCLE (radius/diameter), ARC (3-point only), TEXT, DIMLINEAR, DIMALIGNED | |
| Modify | MOVE, COPY, ROTATE, SCALE, MIRROR, OFFSET, TRIM, EXTEND, EXPLODE, ERASE, grips, Properties edits | No FILLET, CHAMFER, STRETCH, ARRAY, BREAK, JOIN, LENGTHEN, ALIGN, PEDIT, MATCHPROP |
| Precision | Osnaps end/mid/cen/qua/int/per/ins, grid snap, ortho, typed `x,y`, `@dx,dy`, `@d<a`, direct distance, feet-inch input | No tangent, nearest, extension, parallel, apparent intersection; no polar tracking, object snap tracking or dynamic input |
| Selection | pick, window, crossing, Shift remove, Ctrl+A | No fence/previous/last, selection filters, QSELECT or groups |
| Annotation | text height, dimension text override, scale-aware dimension values | No text or dimension styles, MTEXT, angular/radius/diameter/ordinate dims, baseline/continue, leaders, tables, annotative scaling, revision clouds |
| Linetypes and plot | four linetypes by layer, lineweight display toggle, SVG plot in black ink | No per-object overrides, linetype scale, plot style table, PDF plot at true scale |
| Blocks | none | Generated sheets arrive as primitives; bolts, weld symbols, bubbles and the title block are exploded geometry |
| Layouts | the sheet is the only space | No model space, viewports, page setup |
| Interchange | DXF export of the drawing (AC1015, primitives, dimensions exploded); SVG export | No DXF import; no blocks, styles, hatches, ellipses or splines in DXF; no DWG |
| Associativity | the edit is stored with the design it was made for; after a design change the generated sheet shows and the edit "waits for review" (keep / start over / underlay) | All or nothing: edits cannot be carried onto the regenerated sheet; no schedules from the model |
| Performance | layer-batched Canvas 2D, per-entity bounding-box cache, view culling, greeked small text | Linear scans for picking and snapping; no spatial index |
| UX | left tool bar, command line with aliases, status toggles, Properties and Layers panels, F1 help | No ribbon tabs, no command auto-complete, limited AutoCAD key parity (F8/F3/F7/F9 only) |

## Gap analysis and plan, in delivery order

Each increment is self-contained and pushed when its tests pass. "Done" means implemented, tested and documented
in the README.

### Increment 1: drafting core (parity item 1)

*Model.* Per-object color, linetype and lineweight (ByLayer when unset); polyline bulges (arc segments); new
entities `ellipse` (full or elliptical arc), `spline` (cubic B-spline with fit points), `xline` and `ray`;
groups in the drawing. Every geometric service (extents, picking, window tests, snaps, intersections, transforms,
grips, trim/extend boundaries, rendering, SVG, DXF, validation) handles them; curves without closed forms are
tessellated for intersection and picking.

*Draw.* ARC with the AutoCAD variants (3-point, start-center-end, start-center-angle, start-end-radius,
center-start-end, continue tangent), ELLIPSE (axis-end, center, arc), SPLINE (fit points, close), XLINE (point,
horizontal, vertical, angle, offset), RAY, POLYGON (inscribed, circumscribed, edge), DONUT.

*Modify.* FILLET (radius, trim/no-trim, polyline), CHAMFER (distances, angle), STRETCH (crossing window), ARRAY
(rectangular, polar, path), BREAK (two points, at point), JOIN (lines, arcs, polylines), LENGTHEN (delta,
percent, total, dynamic), ALIGN (one or two point pairs, optional scale), PEDIT (close/open, join, width-free
fit/decurve, add arc segments), EXPLODE for the new types, MATCHPROP.

### Increment 2: precision and selection (parity item 1)

Snaps: tangent, nearest, extension, parallel, apparent intersection, node, with a per-snap settings menu
(OSNAP). Polar tracking (F10, increment angle) and object snap tracking (F11, acquired points with alignment
paths). Dynamic input at the cursor (F12): length and angle fields that accept typed values. Selection: fence,
previous, last, add/remove keywords, selection filters by type/layer/color, QSELECT, SELECTSIMILAR, GROUP and
UNGROUP (picking one member selects the group).

### Increment 3: hatching (parity items 1 and 2)

HATCH with boundary detection: pick an internal point and the editor finds the smallest closed region from
lines, arcs, circles, polylines, ellipses and splines (with islands), or select closed objects. Patterns:
SOLID, ANSI31, ANSI32, ANSI33, ANSI37, ANSI38, STEEL, NET, LINE, BRICK, EARTH, AR-CONC, AR-SAND, GRAVEL, DOTS, HONEY,
INSUL; scale, angle and origin, edited in Properties. Hatches are not associative (they keep their loops when the
boundary objects change), as AutoCAD's HPASSOC=0.

### Increment 4: annotation (parity item 2)

Text styles (font, width factor, oblique, fixed height) and MTEXT (wrapped paragraphs, attachment, `\P`
breaks, bold). Dimension styles (text height, arrow size and type, offsets, gap, precision, overall scale,
architectural / decimal units) and the dimension family: linear, aligned, angular, radius, diameter, ordinate,
baseline and continue (DIMBASELINE, DIMCONTINUE). Leaders (LEADER, MLEADER with text). Tables (TABLE with rows,
columns and cell text, also used by the schedules). Revision clouds (REVCLOUD freehand, rectangular, object).
Linetypes: more definitions, LTSCALE and per-object linetype scale; lineweights with a monochrome plot style
(by color or by layer) used for screen paper view, SVG and PDF.

### Increment 5: blocks (parity item 3)

Named block definitions with attribute definitions; INSERT (scale, rotation, attribute prompts), BLOCK / WBLOCK
from a selection, BEDIT-lite (edit in place, all references update), ATTEDIT, EXPLODE of a reference, and a
block library for crane runway details: high-strength bolt (plan / elevation), anchor rod, fillet and groove weld
symbols per AWS A2.4 (arrow / other side, all-around, field weld, tail), section marks, detail callouts, grid
bubbles, north arrow, revision triangle and an ARCH D title block with attributes. External references: attach
another drawing of the same project (an edited or generated sheet) as an overlay reference that updates when
that drawing changes.

### Increment 6: layouts (parity item 4)

Model space and paper space layouts: a drawing has model space (real units) and one or more layouts (paper
units) holding viewports onto model space at a scale (1/4" = 1'-0", 1:50 ...), with frozen-in-viewport layers,
locked viewports, MSPACE/PSPACE by double-click, annotative objects that size to the viewport scale, page setup
(sheet size, plot area, plot scale, plot style) and PLOT to PDF and SVG at true scale with lineweights.

### Increment 7: interchange (parity item 5)

A complete DXF writer and reader of our own (client-side, no server): LINE, LWPOLYLINE with bulges, CIRCLE,
ARC, ELLIPSE, SPLINE, XLINE, RAY, SOLID, TEXT, MTEXT, DIMENSION (with its anonymous block), LEADER, HATCH,
INSERT with ATTRIB, the LAYER, LTYPE, STYLE, DIMSTYLE and BLOCK_RECORD tables, and BLOCKS; tested by
roundtrip (export, import, compare). DXF import opens a file as a new drawing or inserts it as a block.

DWG: the well-maintained open-source browser option is LibreDWG compiled to WebAssembly
(`@mlightcad/libredwg-web`), which is GPL-3.0. Bundling it would place the app under the GPL, which is the
owner's licensing decision, not a technical one; it is therefore not bundled. The DXF reader is written so that a
DWG reader producing the same entity records could feed it, and the README explains the DXF route (DWG to DXF
in any CAD program) meanwhile.

### Increment 8: Revit-style associativity (parity item 6)

* Edits as a change set over the generated drawing, so they can be carried forward: each generated entity gets a
  stable key; the record keeps what was added, what was deleted and what was modified relative to the generated
  drawing. When the design changes, the edit is replayed on the newly generated drawing: additions carry over,
  deletions and modifications apply where the generated entity still exists, and conflicts (the generated entity
  changed or disappeared) are flagged in a review list instead of the all-or-nothing choice.
* Schedules generated from the design model: members, bolts and welds, placed as live tables that refresh when
  the design changes (the generated content is replaced; manual cell overrides are flagged).
* Model views on sheets stay live: generated views (elevation, plan, sections) are regenerated from the design
  each time, and the user's drafting sits on top through the change set above.

### Increment 9: performance and UX (parity item 7)

A spatial index (uniform grid over entity extents) for picking, snapping, window selection and culling; canvas
rendering with cached layer paths for smooth pan and zoom with tens of thousands of entities. Ribbon-style tabs
(Home, Annotate, Insert, Layout, View) over the existing tool bar, command auto-complete, AutoCAD default keys
(F2 history, F3, F7–F12, Ctrl+1 properties, Ctrl+9 command line, Ctrl+Shift+C copy with base point, Ctrl+Z/Y),
and accessible panels (labels, focus order, keyboard reachable).

## Status

| Increment | Status |
| --- | --- |
| 1 Drafting core | done: model, draw and modify commands; tests in `tests/cadDrafting.test.ts`, browser check in `tests/e2e/cad.spec.ts` |
| 2 Precision and selection | done: `src/cad/snap.ts`, `src/cad/select.ts`; tests in `tests/cadPrecision.test.ts` and `tests/e2e/cad.spec.ts` |
| 3 Hatching | done: `src/cad/hatch.ts` (patterns, even-odd clipping, solid fills, boundary detection with islands); tests in `tests/cadHatch.test.ts` |
| 4 Annotation | done: `src/cad/annotation.ts`, `src/cad/annotateCommands.ts`, `src/cad/StylesDialog.tsx`; tests in `tests/cadAnnotation.test.ts`; the ribbon replaced the vertical tool bar |
| 5 Blocks | done: `src/cad/blocks.ts`, `src/cad/blockLibrary.ts`, `src/cad/blockCommands.ts`; tests in `tests/cadBlocks.test.ts`. References scale uniformly (with a mirror flag), as most drafting blocks do; WBLOCK arrives with DXF interchange |
| 6 Layouts | done: `src/cad/layout.ts`, `src/cad/layoutCommands.ts`, `src/cad/pdf.ts`; tests in `tests/cadLayout.test.ts`. One layout per sheet (the sheet itself); several layouts per drawing are not needed by the sheet set |
| 7 Interchange | planned |
| 8 Associativity | planned |
| 9 Performance and UX | planned |

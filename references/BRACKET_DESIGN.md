# Welded column bracket implementation - 8 October 2026

The optional bracket design uses two rectangular cantilever plate ribs welded directly to a receiving column flange, with a continuous spreader seat. Enable it under Connections / Welded column bracket. The same entered dimensions drive calculations, the selectable 3D parts, DXF sketch SK-10 and ARCH D sheet S-05. Older projects retain their prior scope until the bracket is enabled.

## Loads and model

Every sampled strength, service and fatigue case is evaluated at every support. Independent girder ends retain their concurrent vertical reactions and longitudinal bearing offsets; a shared bracket is not designed from independently summed reaction maxima. Rib reactions are V/2 ± sum(V_i x_i)/g and can have opposite signs. Continuous members use the actual support reaction at the centered bearing.

The seat is a simply supported strip between ribs with free overhangs and uniform patches at the entered bearing locations. Exact piecewise shear/moment is evaluated at each patch/support edge and interior zero-shear point. Its effective strip width is only the transverse bearing width. Both ribs take their full load at the far transverse edge of the bearing patch. All bracket self-weight is conservatively added to this load path with factor 1.4 for LRFD and 1.0 for ASD. No composite action or lateral bracing from the seat is credited to rib flexure.

The service check includes rib bending, shear deformation and a seat curvature bound, with owner-entered deflection/rotation limits. It measures incremental single-crane service deformation with a fixed column interface. Building deformation and dead-load setting are separate. Strength, service and fatigue bracket responses participate in numerical refinement checks.

## Limit states and source basis

- AISC 360-16 F11: all three rectangular-bar flexure/LTB branches, Cb = 1 and conservative effective unbraced length twice the cantilever projection. G4/elastic peak shear and conservative linear elastic bending/shear interaction are checked separately.
- Seat first-yield bending and peak strip shear; no plastic redistribution.
- J2/J4: elastic eccentric two-line rib-root weld groups, connected-metal yielding/rupture, seat-to-rib welds, minimum fillet sizes and plate-edge limits. Root stress includes the vertical reaction and its eccentric moment. Only a bearing-width length of each seat weld is credited.
- J10.1, J10.2 and J10.3: receiving-column flange bending, web local yielding and crippling. Both rib tension zones are combined. End-region reductions and k = flange thickness are used throughout; no rolled fillet or continuity-plate credit.
- J10.4: unrestrained compression-flange rotation branch with entered largest flange unbraced length and lower Cr = 3.3 million MPa. The code's ratio-based non-applicability remains explicit.
- J10.6(a): panel shear with entered other column axial force plus bracket vertical force; no inelastic panel-zone reserve. The root couple bound is used conservatively as panel demand. These local checks do not verify global column strength or stability.
- Appendix 3: conservative E-prime base-metal fatigue bound plus transverse fillet-root reduction for rib and seat; all bins count without endurance credit. Weld throat fatigue uses Category F Eq. A-3-2M (sixth-power form), with the largest range assigned to all project cycles. Unfactored duty-bin loads omit impact; twice the maximum absolute response bounds full reversal. Strength-envelope normal peak also checks 0.66Fy.
- Reference AIST Technical Report 13 §5.9.2 and Commentary: impact, eccentricity, rotation/fatigue considerations and the 50-kip column-bracket recommendation. The implementation conservatively compares both strength and static reactions against 50 kip.

Source text and provenance are the pinned publications in SOURCE_REGISTER.md. AISC F11, J10.4/J10.6 and Appendix 3 expressions were checked directly against that original specification. These are not comparisons to twelve permit packages.

## Applicability and remaining interfaces

Receiving-column geometry/material and their source must be entered and confirmed; representative building shapes never supply capacity. Geometry checks require complete bearing contact, room for both ribs/root fillets, valid column proportions and sufficient weld length. Undefined receiver data or horizontal load paths remain unverified and block normal generation. Uplift over the numerical tolerance fails this gravity-bearing arrangement.

Separate horizontal ties, longitudinal locating/sliding attachments and any hold-downs must deliver their forces independently to the column. Their column-side design, receiving-building fatigue, global frame/foundation/anchor capacity, end stops, erection and movement-compatible installation remain outside this bracket calculation. Enabling the bracket does not verify those systems. The mirrored runway is context geometry only.

## Verification and demonstration

Nine dedicated independent tests cover centered/overhanging patch statics, signed rib reactions, eccentric weld endpoint stress, all F11 branches with LRFD/ASD, concurrent governing-case retention, unfactored fatigue loading, missing-input gates, failure cases and actual 3D plate dimensions. The complete regression suite also exercises capped LRFD simple and ASD continuous arrangements and backward-compatible projects.

The fictitious 2-ton capped demonstration includes a 26 by 28 by 2-inch seat, two 24 by 28 by 1.5-inch rectangular ribs at 8-inch centers, 1/2-inch root fillets and 5/8-inch seat fillets. The increased seat fillet addresses the weld-root fatigue bound with revised 12-inch bearings. These are a passing capability example, not an optimized bracket or a project-approved design. Its report includes 24 Letter calculation pages followed by six ARCH D sheets. Sheet S-05 includes scaled side, plan and front views, weld symbols, dimensions, concurrent reactions and structural notes. Bearing stiffeners touch both girder flanges, with local corner copes only.

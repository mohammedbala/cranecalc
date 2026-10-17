import {z} from 'zod';
const pos=z.number().finite().positive(),num=z.number().finite();
/** Existing load effect at the column's governing section: axial (compression positive), strong- and weak-axis moments, strong-axis shear. */
const effect=z.object({P:num,Mx:num,My:num,V:num});
const support=z.object({base:z.enum(['pinned','fixed']),top:z.enum(['braced','free'])});
export const existingLoadKeys=['D','L','Lr','S','R','W','E'] as const;
export type ExistingLoadKey=typeof existingLoadKeys[number];
/**
 * A surveyed existing building column line beside one runway grid line of new freestanding columns, in plan.
 * Across the runway the offset is measured from the runway grid line, positive away from the crane span; along
 * it stations are from runway grid 1, positive toward grid 2. The existing column's depth runs across the runway.
 */
export const existingLineSchema=z.object({
 offset:num,
 /** Existing column spacing along the runway; zero puts an existing column at every runway grid. */
 spacing:z.number().finite().nonnegative(),
 /** First existing column from grid 1; with zero spacing, each existing column's offset from its runway grid. */
 start:num,
 shape:z.string().max(30),
 d:pos,bf:pos,
 /** Existing footing across (L) and along (B) the runway, concentric with the column; zero where not known. */
 footing:z.object({L:z.number().finite().nonnegative(),B:z.number().finite().nonnegative()})
});
export type ExistingLineInput=z.infer<typeof existingLineSchema>;
/** The existing building next to a new freestanding runway, from survey: its column lines beside grids A and B. */
export const adjacentBuildingSchema=z.object({
 enabled:z.boolean(),
 A:existingLineSchema.optional(),B:existingLineSchema.optional(),
 /** Least clear distance in plan between a new and an existing footing. */
 footingClear:z.number().finite().nonnegative(),
 source:z.string().max(300)
});
export type AdjacentBuildingInput=z.infer<typeof adjacentBuildingSchema>;
/**
 * A surveyed existing building column that receives a runway support. The
 * column section is the bracket's receiving column when a bracket is
 * enabled, otherwise the catalog shape, otherwise the entered plates.
 * Elevations are measured from the column base. Canonical units mm, N, MPa.
 */
/**
 * Field welding of new steel to an existing column: how its base metal is identified, its carbon equivalent, the
 * specified minimum preheat (stored in °C) and whether the column carries dead load only while it is welded.
 */
export const existingWeldingSchema=z.object({
 basis:z.enum(['mill-certificates','chemical-analysis','original-documents','not-established']),
 grade:z.string().max(80),
 carbonEquivalent:z.number().finite().nonnegative().max(2).optional(),
 /** Mill or laboratory chemistry, percent by weight: the carbon equivalent is then computed by the AWS D1.1 Annex B formula (with Si). */
 chemistry:z.object({C:z.number().finite().nonnegative().max(2),Mn:z.number().finite().nonnegative().max(5),Si:z.number().finite().nonnegative().max(5),Cr:z.number().finite().nonnegative().max(5).optional(),Mo:z.number().finite().nonnegative().max(5).optional(),V:z.number().finite().nonnegative().max(5).optional(),Ni:z.number().finite().nonnegative().max(5).optional(),Cu:z.number().finite().nonnegative().max(5).optional()}).optional(),
 preheat:z.number().finite().min(-40).max(400),
 deadLoadOnly:z.boolean(),
 source:z.string().max(300)
});
export type ExistingWeldingInput=z.infer<typeof existingWeldingSchema>;
export const defaultExistingWelding:ExistingWeldingInput={basis:'not-established',grade:'',preheat:10,deadLoadOnly:false,source:''};
export const existingColumnSchema=z.object({
 enabled:z.boolean(),
 /** A new column designed here, with its base and footing; it carries no existing building loads. */
 isNew:z.boolean().optional(),
 shape:z.string().max(30),
 d:pos,bf:pos,tf:pos,tw:pos,Fy:pos,Fu:pos,
 height:pos,seatElevation:pos,eccentricity:pos,
 strong:support,weak:support,
 Lcx:pos,Lcy:pos,Lcz:pos,Lb:pos,
 longitudinal:z.enum(['bracing','column']),
 driftLimit:pos,
 /** New freestanding columns: seismic design as a cantilever column system (ASCE 7 §12.2.5.2). */
 seismic:z.object({enabled:z.boolean(),sdc:z.enum(['A','B','C','D','E','F']),SDS:z.number().finite().nonnegative(),system:z.enum(['ordinary','special']),Ie:pos,rho:pos,source:z.string().max(300),
  /** Site data stated on the construction documents (IBC 1603.1.5): risk category, mapped Ss and S1, site class and SD1. */
  riskCategory:z.enum(['I','II','III','IV']).optional(),Ss:z.number().finite().nonnegative().optional(),S1:z.number().finite().nonnegative().optional(),
  siteClass:z.enum(['A','B','C','D','E','F','default']).optional(),SD1:z.number().finite().nonnegative().optional(),
  /** Maximum inelastic displacement δM of the existing building at the runway, for the §12.12.3 separation; zero when not known. */
  building:z.object({drift:z.number().finite().nonnegative(),source:z.string().max(300)}).optional()}).optional(),
 /** New freestanding columns: the surveyed existing building beside the runway, drawn and checked for clearance. */
 adjacent:adjacentBuildingSchema.optional(),
 existing:z.object({D:effect,L:effect,Lr:effect,S:effect,R:effect,W:effect,E:effect}),
 /**
  * Where the crane longitudinal force leaves the column (review B7/B8): a crane-level strut on the girder line (no
  * column bending or torsion from it), a crane-level strut at the column centerline (no weak-axis bending, torsion
  * from the girder offset), or the eave strut / roof at the column top (weak-axis bending from the seat to the top,
  * and torsion). Not entered: the eave-strut path is assumed and the column check is flagged.
  */
 longitudinalExit:z.enum(['girder-strut','column-strut','eave-strut']).optional(),
 /**
  * Warping at the column base in the torsion check. 'warping-free' (default): the torque is carried in Saint-Venant
  * torsion with no warping restraint relied on at the base (a lower-bound equilibrium solution, AISC Design Guide 9
  * §4.2); 'warping-restrained': the base is fixed against warping, so warping stresses develop above it and the new
  * column base is designed for the bimoment B = T a tanh(z/a).
  */
 torsionBase:z.enum(['warping-free','warping-restrained']).optional(),
 /**
  * New braced columns: the engineer of record's acceptance of the column twist at the seat from the girder's offset
  * longitudinal force and the bearing and rail movement it causes (column-twist-basis), with its source; no twist
  * limit is applied in the calculation.
  */
 twistAcceptance:z.string().max(300).optional(),
 /**
  * Frame type of the building at this column line across the runway (review B9). A sway (portal) frame needs the
  * frame's sway amplification B2 (AISC Appendix 8) from its analysis; without it the column check is provisional.
  */
 frame:z.object({type:z.enum(['braced','sway']),B2:z.number().finite().min(1).optional(),source:z.string().max(300)}).optional(),
 /**
  * Serviceability data from the building frame analysis at this column line (review B10, TR-13 §5.3): the
  * displacement at the top of the crane girder under the 10-year wind, and the outward rail displacement under
  * the frame's dead load and its full roof snow load, with the roof snow pressure for the TR-13 gauge reduction.
  */
 service:z.object({wind10:z.number().finite().nonnegative().optional(),spreadD:z.number().finite().optional(),spreadS:z.number().finite().optional(),roofSnow:z.number().finite().nonnegative().optional(),source:z.string().max(300)}).optional(),
 /**
  * Site seismic data for a runway added to an existing building (review B11): SDS, SDC, Ie and the existing
  * lateral system's R give Cs = SDS·Ie/R for the runway and crane masses; TR-13 combinations 5a and 7a are then
  * added to the runway checks. The lifted load is a seismic mass only when it is rigidly secured; the crane's
  * inertia along the runway is capped by wheel friction μ. `alteration` records the evaluation of the existing
  * lateral system under the building code's alteration provisions: the largest increase of an element's
  * demand-capacity ratio from the added mass, as a fraction (0.10 = 10%).
  */
 siteSeismic:z.object({enabled:z.boolean(),SDS:z.number().finite().nonnegative(),sdc:z.enum(['A','B','C','D','E','F']),Ie:pos,R:pos,
  liftedLoadSecured:z.boolean(),friction:z.number().finite().positive().max(1),source:z.string().max(300),
  alteration:z.object({dcrIncrease:z.number().finite().nonnegative(),source:z.string().max(300)}).optional()}).optional(),
 /** Welding new brackets, gussets or plates to this existing column. */
 welding:existingWeldingSchema.optional(),
 source:z.string().max(500),confirmed:z.boolean()
});
export type ExistingColumnInput=z.infer<typeof existingColumnSchema>;
const zero={P:0,Mx:0,My:0,V:0},inch=25.4,foot=304.8,ksi=6.894757293;
// W14X90 in A992: an illustrative starting point only; zero existing loads are missing data until entered.
export const defaultExistingColumn:ExistingColumnInput={enabled:false,shape:'W14X90',d:14*inch,bf:14.5*inch,tf:.71*inch,tw:.44*inch,Fy:50*ksi,Fu:65*ksi,
 height:24*foot,seatElevation:16*foot,eccentricity:18*inch,strong:{base:'pinned',top:'braced'},weak:{base:'pinned',top:'braced'},
 Lcx:24*foot,Lcy:8*foot,Lcz:8*foot,Lb:8*foot,longitudinal:'bracing',driftLimit:240,
 existing:{D:{...zero},L:{...zero},Lr:{...zero},S:{...zero},R:{...zero},W:{...zero},E:{...zero}},source:'',confirmed:false};
export const defaultRunwaySeismic:NonNullable<ExistingColumnInput['seismic']>={enabled:false,sdc:'B',SDS:.25,system:'ordinary',Ie:1,rho:1,source:''};
// W12X40 existing columns 6 ft outboard of the runway grid on 4 ft square footings: an illustrative start for the survey.
export const defaultExistingLine:ExistingLineInput={offset:6*foot,spacing:0,start:0,shape:'W12X40',d:11.9*inch,bf:8.01*inch,footing:{L:4*foot,B:4*foot}};
export const defaultAdjacentBuilding:AdjacentBuildingInput={enabled:false,A:{...defaultExistingLine,footing:{...defaultExistingLine.footing}},B:{...defaultExistingLine,footing:{...defaultExistingLine.footing}},footingClear:6*inch,source:''};

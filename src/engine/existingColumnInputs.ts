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
 * enabled, otherwise the catalogue shape, otherwise the entered plates.
 * Elevations are measured from the column base. Canonical units mm, N, MPa.
 */
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

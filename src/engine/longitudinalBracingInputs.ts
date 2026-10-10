import {z} from 'zod';
const pos=z.number().finite().positive(),nn=z.number().finite().nonnegative();
/**
 * Crane-level longitudinal bracing of one runway column line: identical braced
 * bays share the line's longitudinal force. Each bay is braced from the base
 * to the brace work point in equal tiers. Canonical units mm, N, MPa.
 */
export const longitudinalBracingSchema=z.object({
 enabled:z.boolean(),
 system:z.enum(['rod-x','angle-x','angle-single']),
 bays:z.number().int().min(1).max(6),
 bayWidth:pos,height:pos,tiers:z.number().int().min(1).max(4),
 rod:z.object({diameter:pos,Fy:pos,Fu:pos}),
 angle:z.object({shape:z.string().max(30),Fy:pos,Fu:pos,bolts:z.number().int().min(3).max(12),boltDiameter:pos}),
 /** Unfactored horizontal force on this braced line from the building: wind and seismic along the runway. */
 existing:z.object({W:nn,E:nn}),
 /** Building-mounted crane stops on this line deliver the bumper force to the bracing. */
 bumperToBracing:z.boolean(),
 driftLimit:pos,
 source:z.string().max(500),confirmed:z.boolean(),
 /**
  * New freestanding columns: the braced runway spans (1-based), the clevis pin and gusset at each rod end, the
  * fillets of the gussets to the column web, the crane-level strut that collects the longitudinal force from
  * every column, and the fillet of each bracket seat to its column flange that delivers it from the girder.
  */
 design:z.object({
  spans:z.array(z.number().int().min(1).max(20)).min(1).max(6),
  pin:z.object({diameter:pos,Fu:pos}),
  gusset:z.object({thickness:pos,Fy:pos,Fu:pos}),
  weld:pos,
  strut:z.object({shape:z.string().max(30),Fy:pos,Fu:pos,boltDiameter:pos,grade:z.enum(['A325','A490'])}),
  seatWeld:pos
 }).optional()
});
export type LongitudinalBracingInput=z.infer<typeof longitudinalBracingSchema>;
export type BracingDesignInput=NonNullable<LongitudinalBracingInput['design']>;
const inch=25.4,foot=304.8,ksi=6.894757293;
// Illustrative starting point (PEMB-style 3/4 in A36 rod X-bracing); replace with the surveyed bracing.
export const defaultLongitudinalBracing:LongitudinalBracingInput={enabled:false,system:'rod-x',bays:1,bayWidth:25*foot,height:20*foot,tiers:1,
 rod:{diameter:.75*inch,Fy:36*ksi,Fu:58*ksi},angle:{shape:'L3X3X1/4',Fy:36*ksi,Fu:58*ksi,bolts:3,boltDiameter:.75*inch},
 existing:{W:0,E:0},bumperToBracing:true,driftLimit:240,source:'',confirmed:false};
// Clevis pin ASTM A36 minimum, A572 Grade 50 gussets, A992 W strut with 3/4 in A325 bolts. The span here is a
// placeholder: without a design the middle span of the runway is braced (bracingDesign).
export const defaultBracingDesign:BracingDesignInput={spans:[1],pin:{diameter:inch,Fu:58*ksi},gusset:{thickness:.5*inch,Fy:50*ksi,Fu:65*ksi},
 weld:.3125*inch,strut:{shape:'W8X24',Fy:50*ksi,Fu:65*ksi,boltDiameter:.75*inch,grade:'A325'},seatWeld:.3125*inch};

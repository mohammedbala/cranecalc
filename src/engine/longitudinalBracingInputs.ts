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
 source:z.string().max(500),confirmed:z.boolean()
});
export type LongitudinalBracingInput=z.infer<typeof longitudinalBracingSchema>;
const inch=25.4,foot=304.8;
// Illustrative starting point (PEMB-style 3/4 in A36 rod X-bracing); replace with the surveyed bracing.
export const defaultLongitudinalBracing:LongitudinalBracingInput={enabled:false,system:'rod-x',bays:1,bayWidth:25*foot,height:20*foot,tiers:1,
 rod:{diameter:.75*inch,Fy:250,Fu:400},angle:{shape:'L3X3X1/4',Fy:250,Fu:400,bolts:3,boltDiameter:.75*inch},
 existing:{W:0,E:0},bumperToBracing:true,driftLimit:240,source:'',confirmed:false};

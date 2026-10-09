import {z} from 'zod';
import {existingBracketSchema} from './existingBracketInputs';
const pos=z.number().finite().positive();
/** Dimensions are calculation inputs in mm, never reference-view preferences. */
export const bracketSchema=z.object({
 arrangement:z.enum(['twin-rib','haunched-seat','rolled-corbel','existing-corbel','existing-w-corbel']).optional(),
 existing:existingBracketSchema.optional(),
 wideFlange:existingBracketSchema.extend({shape:z.string().min(1).max(30)}).optional(),
 tipDepth:pos.optional(),corbelShape:z.string().min(1).max(30).optional(),
 enabled:z.boolean(),reach:pos,seatLength:pos,seatProjection:pos,seatThickness:pos,
 ribDepth:pos,ribThickness:pos,ribSpacing:pos,rootWeld:pos,seatWeld:pos,
 deflectionLimit:pos,rotationLimit:pos,
 receiver:z.object({depth:pos,width:pos,flangeThickness:pos,webThickness:pos,Fy:pos,Fu:pos,unbracedLength:pos,axialDemand:z.number().finite().nonnegative(),confirmed:z.boolean(),source:z.string().max(500)}),
 loadPathConfirmed:z.boolean()
});
export type BracketInput=z.infer<typeof bracketSchema>;
export const defaultBracket:BracketInput={enabled:false,reach:508,seatLength:660.4,seatProjection:711.2,seatThickness:50.8,ribDepth:609.6,ribThickness:38.1,ribSpacing:203.2,rootWeld:12.7,seatWeld:9.525,deflectionLimit:1.5875,rotationLimit:.002,
 receiver:{depth:609.6,width:355.6,flangeThickness:25.4,webThickness:19.05,Fy:345,Fu:450,unbracedLength:3048,axialDemand:0,confirmed:false,source:''},loadPathConfirmed:false};

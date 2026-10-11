import {z} from 'zod';
import {existingBracketSchema} from './existingBracketInputs';
import {rolledBracketSchema} from './rolledBracketInputs';
import {taperedHaunchSchema} from './taperedHaunchInputs';
import {columnStiffenerSchema} from './columnStiffenerInputs';
const pos=z.number().finite().positive();
/** Dimensions are calculation inputs in mm, never reference-view preferences. */
export const bracketSchema=z.object({
 arrangement:z.enum(['twin-rib','haunched-seat','rolled-corbel','tapered-haunch','existing-corbel','existing-w-corbel']).optional(),
 existing:existingBracketSchema.optional(),
 wideFlange:existingBracketSchema.extend({shape:z.string().min(1).max(30)}).optional(),
 tipDepth:pos.optional(),corbelShape:z.string().min(1).max(30).optional(),
 /** New rolled wide-flange bracket ('rolled-corbel'): stub steel, welds and bearing stiffeners. */
 rolled:rolledBracketSchema.optional(),
 /** New built-up tapered I haunch ('tapered-haunch'): plates, stiffeners and welds; reach, seatProjection (its length) and rootWeld (web-to-column fillet) are the bracket fields above. */
 haunch:taperedHaunchSchema.optional(),
 /** Column stiffeners (continuity plates) in the receiving column at the bracket's force levels; twin-rib, haunched and W-stub brackets. */
 columnStiffeners:columnStiffenerSchema.optional(),
 enabled:z.boolean(),reach:pos,seatLength:pos,seatProjection:pos,seatThickness:pos,
 ribDepth:pos,ribThickness:pos,ribSpacing:pos,rootWeld:pos,seatWeld:pos,
 deflectionLimit:pos,rotationLimit:pos,
 receiver:z.object({depth:pos,width:pos,flangeThickness:pos,webThickness:pos,Fy:pos,Fu:pos,unbracedLength:pos,axialDemand:z.number().finite().nonnegative(),confirmed:z.boolean(),source:z.string().max(500)}),
 loadPathConfirmed:z.boolean()
});
export type BracketInput=z.infer<typeof bracketSchema>;
// The receiving column defaults to a W14X90, the default existing column: d 14.0 in, bf 14.5 in, tf 0.710 in,
// tw 0.440 in, ASTM A992 / A572 Grade 50.
export const defaultBracket:BracketInput={enabled:false,reach:508,seatLength:660.4,seatProjection:711.2,seatThickness:50.8,ribDepth:609.6,ribThickness:38.1,ribSpacing:203.2,rootWeld:12.7,seatWeld:9.525,deflectionLimit:1.5875,rotationLimit:.002,
 receiver:{depth:14*25.4,width:14.5*25.4,flangeThickness:.71*25.4,webThickness:.44*25.4,Fy:50*6.894757293168,Fu:65*6.894757293168,unbracedLength:3048,axialDemand:0,confirmed:false,source:''},loadPathConfirmed:false};

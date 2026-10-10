import {z} from 'zod';
const pos=z.number().finite().positive(),nn=z.number().finite().nonnegative();
/** Surveyed geometry and documented available resistances; no capacity is
 * inferred from a photograph, section name, or the existence of a bracket. */
export const existingBracketSchema=z.object({
 depth:pos,width:pos,projection:pos,flangeThickness:pos,webThickness:pos,
 continuityThickness:pos,continuityAbove:pos,tipStiffenerThickness:pos,
 Fy:pos,Fu:pos,geometrySource:z.string().max(700),surveyConfirmed:z.boolean(),conditionConfirmed:z.boolean(),
 bolts:z.object({diameter:pos,grade:z.enum(['A325','A490']),pitch:pos,gauge:pos,edge:pos}),
 rating:z.object({method:z.enum(['LRFD','ASD']),vertical:nn,rootMoment:nn,seatMoment:nn,fatigueRange:nn,fatigueRootMoment:nn,fatigueSeatMoment:nn,cycles:nn,
  source:z.string().max(1000),confirmed:z.boolean(),contactConfirmed:z.boolean(),serviceConfirmed:z.boolean(),attachmentConfirmed:z.boolean()})
});
export type ExistingBracketInput=z.infer<typeof existingBracketSchema>;
export const defaultExistingBracket:ExistingBracketInput={
 depth:450,width:360,projection:800,flangeThickness:25,webThickness:16,continuityThickness:20,continuityAbove:250,tipStiffenerThickness:16,
 Fy:50*6.894757293168,Fu:65*6.894757293168,geometrySource:'',surveyConfirmed:false,conditionConfirmed:false,
 bolts:{diameter:19.05,grade:'A325',pitch:220,gauge:400,edge:40},
 rating:{method:'LRFD',vertical:0,rootMoment:0,seatMoment:0,fatigueRange:0,fatigueRootMoment:0,fatigueSeatMoment:0,cycles:0,source:'',confirmed:false,contactConfirmed:false,serviceConfirmed:false,attachmentConfirmed:false}
};

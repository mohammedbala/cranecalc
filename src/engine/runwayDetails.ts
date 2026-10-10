import { z } from 'zod';
import {bracketSchema} from './bracketInputs';
import {angleTieSchema} from './angleTie';
import {endStopSchema} from './endStopInputs';
import type {BracketResults} from './bracketDesign';
import type {ExistingBracketResults} from './existingBracket';
const pos=z.number().finite().positive(),nn=z.number().finite().nonnegative();
const material=z.object({Fy:pos,Fu:pos,Fexx:pos});
export const simpleSupportSchema=z.object({endGap:pos,guideTravel:pos,temperatureRise:nn,temperatureFall:nn,settingTolerance:nn});
export const lapConnectionSchema=z.object({
 rows:z.number().int().min(2).max(6),gauge:pos,pitch:pos,edge:pos,thickness:pos,
 diameter:pos,grade:z.enum(['A325','A490']),surface:z.enum(['A','B']),projection:nn,
 weldSize:pos,weldLength:pos
});
export const runwayDetailsSchema=z.object({
 bracket:bracketSchema.optional(),
 material,
 simpleSupport:simpleSupportSchema.optional(),
 endStop:endStopSchema.optional(),
 // Two identical flat bars, one each side of the gusset, at EACH flange.
 brace:z.object({arrangement:z.enum(['paired-bars','flexible-plate','bearing-link','paired-links','single-angle','double-angle']).optional(),
  singleAngle:angleTieSchema.optional(),doubleAngle:angleTieSchema.optional(),
  referenceDetail:z.object({plateWidth:pos,plateThickness:pos,pinDiameter:pos,eyeDiameter:pos,eyeThickness:pos,linkDiameter:pos,forkThickness:pos,pinSetback:pos,linkSpacing:pos}).optional(),
  flangeAttachment:z.object({enabled:z.boolean(),longitudinalSetback:pos,saddleLength:pos,saddleThickness:pos,webGap:pos,clearance:pos,weldSize:pos}).optional(),width:pos,thickness:pos,length:pos,reach:pos,gussetThickness:pos,connectionLength:pos,connection:lapConnectionSchema}),
 end:lapConnectionSchema,
 bearing:z.object({width:pos,length:pos,thickness:pos,stiffenerWidth:pos,stiffenerThickness:pos,cope:nn,weldSize:pos}),
 rail:z.object({name:z.string().min(1).max(100),headWidth:pos,headThickness:pos,baseWidth:pos,baseThickness:pos,webThickness:pos,Fy:pos,Fu:pos,padAllowable:pos,padSource:z.string().min(1).max(300),
  clipWidth:pos,clipThickness:pos,clipProjection:pos,clipWeld:pos,jointGap:nn,jointPlateThickness:pos,jointPlateHeight:pos,jointBoltDiameter:pos,jointPitch:pos,jointEdge:pos,temperatureRange:nn}),
 criteria:z.object({twistLimit:pos,railLateralLimit:pos,railGauge:pos,alignmentTolerance:pos,levelTolerance:pos,rotationClearance:pos,temperatureMaximum:z.number().finite(),corrosionProtected:z.boolean()}),
 fatigueDetails:z.array(z.object({id:z.string().min(1).max(40),name:z.string().min(1).max(120),x:nn,point:z.enum(['top-left','top-right','bottom-left','bottom-right']),category:z.enum(['A','B','B1','C','D','E','E1']),reference:z.string().min(1).max(300)})).min(1).max(16),
 spectrum:z.array(z.object({name:z.string().min(1).max(80),liftFraction:nn.max(1),cycles:pos})).min(1).max(8),
 fabrication:z.object({steel:z.string().min(1).max(200),bolting:z.string().min(1).max(400),welding:z.string().min(1).max(400),inspection:z.string().min(1).max(700),erection:z.string().min(1).max(700),railAlignment:z.string().min(1).max(700)})
});
export type RunwayDetails=z.infer<typeof runwayDetailsSchema>;
export type LapConnection=z.infer<typeof lapConnectionSchema>;
export interface InterfaceAction {
 id:string;combination:string;x:number;vertical:number;top:number;bottom:number;longitudinal:number;torque:number;
 cranes:{index:number;origin:number;loaded:boolean}[];lateralSign:number;controls:string[];
 ends?:{x:number;bay:number;end:'left'|'right';vertical:number;top:number;bottom:number;longitudinal:number;offset:number}[];
 seatMoment?:number;
}
export interface FatigueDetailResult {
 id:string;name:string;x:number;category:string;reference:string;
 bins:{name:string;cycles:number;minimum:number;maximum:number;range:number;allowable:number;damage:number}[];
 damage:number;range:number;peak:number;
}
export interface RunwayDetailResults {
 bracket?:BracketResults;
 existingBracket?:ExistingBracketResults;
 cap?:{longitudinalFlow:number;fatigueFlows:number[]};
 normalStress:number;shearStress:number;railDisplacement:number;twist:number;criticalMultiplier:number;
 residual:number;meshChange:number;travelChange:number;cases:number;braceStiffness:number;braceForce:number;
 fatigue:FatigueDetailResult[];interfaces:InterfaceAction[];
 railFatigueBins:{name:string;cycles:number;vertical:number;lateral:number;flangeStress:number;plateStress:number;weldStress:number}[];
 demands:{brace:number;braceFatigue:number;verticalFatigue:number;endLongitudinal:number;railLateral:number;railVertical:number;railFatigueVertical:number;railFatigueLateral:number};
 governing:Record<string,{id:string;combination:string;x:number;value:number}>;
}

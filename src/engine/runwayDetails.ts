import { z } from 'zod';
import {bracketSchema} from './bracketInputs';
import {angleTieSchema} from './angleTie';
import {capAngleSchema} from './capAngleInputs';
import {endStopSchema} from './endStopInputs';
import {endBearingSchema} from './endBearingInputs';
import type {RolledBracketResults} from './rolledBracket';
import type {TaperedHaunchResults} from './taperedHaunch';
import type {BracketResults} from './bracketDesign';
import type {ExistingBracketResults} from './existingBracket';
import type {SupportForceEnvelope} from './bracketForces';
import type {ColumnCapResults} from './columnCap';
const pos=z.number().finite().positive(),nn=z.number().finite().nonnegative();
const material=z.object({Fy:pos,Fu:pos,Fexx:pos});
/**
 * endGridBearing (review item E35): where the girder end bears at a runway-end grid on simple spans. 'on-grid' (the
 * default when absent): the girder end is on the grid and its bearing runs inboard, the reaction eccentric to the
 * support web. 'centered': the end-bay girder runs past the grid by half the bearing length and its bearing is
 * centered on the support web (the haunch or bracket web line at the grid).
 */
export const simpleSupportSchema=z.object({endGap:pos,guideTravel:pos,temperatureRise:nn,temperatureFall:nn,settingTolerance:nn,endGridBearing:z.enum(['on-grid','centered']).optional()});
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
 endBearing:endBearingSchema.optional(),
 /** False while template-generated inputs await the engineer's review. */
 reviewed:z.boolean().optional(),
 // Two identical flat bars, one each side of the gusset, at EACH flange.
 brace:z.object({arrangement:z.enum(['paired-bars','flexible-plate','bearing-link','paired-links','single-angle','double-angle','cap-angle']).optional(),
  /** Cap tieback angle bolted to the cap channel flange ('cap-angle'). */
  capAngle:capAngleSchema.optional(),
  singleAngle:angleTieSchema.optional(),doubleAngle:angleTieSchema.optional(),
  referenceDetail:z.object({plateWidth:pos,plateThickness:pos,pinDiameter:pos,eyeDiameter:pos,eyeThickness:pos,linkDiameter:pos,forkThickness:pos,pinSetback:pos,linkSpacing:pos}).optional(),
  flangeAttachment:z.object({enabled:z.boolean(),longitudinalSetback:pos,saddleLength:pos,saddleThickness:pos,webGap:pos,clearance:pos,weldSize:pos,
   /** Girder web centerline to the column face where the bracket is by others; a designed bracket sets it from its reach. */
   columnFace:pos.optional()}).optional(),
  /** Column-end movement release: bolts pretensioned against steel sleeves in vertical slots of the column gusset. */
  release:z.object({enabled:z.boolean(),travel:pos,sleeveWall:pos,clearance:pos}).optional(),width:pos,thickness:pos,length:pos,reach:pos,gussetThickness:pos,connectionLength:pos,connection:lapConnectionSchema}),
 end:lapConnectionSchema,
 bearing:z.object({width:pos,length:pos,thickness:pos,stiffenerWidth:pos,stiffenerThickness:pos,cope:nn,weldSize:pos}),
 // Keeper: a lip clipThickness thick projecting clipProjection past a body clipBodyWidth wide (default the lip
 // thickness), clipClearance clear of the rail-base toe, clipWidth long along the rail, fillet welded clipWeld on
 // its outer face and both ends. The pad (when aist.railPad) lies under the rail; anchorNotch is the depth of the
 // rail-base notch that the anchor keepers engage at mid-length of each rail piece. Later fields are optional so
 // earlier project files load with the defaults in railSeat.ts.
 rail:z.object({name:z.string().min(1).max(100),headWidth:pos,headThickness:pos,baseWidth:pos,baseThickness:pos,webThickness:pos,Fy:pos,Fu:pos,padAllowable:pos,padSource:z.string().min(1).max(300),
  padThickness:pos.optional(),padWidth:pos.optional(),
  clipWidth:pos,clipThickness:pos,clipProjection:pos,clipWeld:pos,clipBodyWidth:pos.optional(),clipClearance:pos.optional(),anchorNotch:pos.optional(),
  jointGap:nn,jointPlateThickness:pos,jointPlateHeight:pos,jointBoltDiameter:pos,jointPitch:pos,jointEdge:pos,temperatureRange:nn,
  // Bolted rail joints: 'tight' (default, AIST TR-13 §5.16.1: gap 1/16 in or less, the rail string slides in the keepers and
  // the end-stop gap takes the thermal movement) or 'open' (expansion gap jointGap, each piece anchored at mid-length).
  jointType:z.enum(['tight','open']).optional()}),
 criteria:z.object({twistLimit:pos.optional(),railLateralLimit:pos,railGauge:pos,alignmentTolerance:pos,levelTolerance:pos,rotationClearance:pos,temperatureMaximum:z.number().finite(),corrosionProtected:z.boolean()}),
 fatigueDetails:z.array(z.object({id:z.string().min(1).max(40),name:z.string().min(1).max(120),x:nn,point:z.enum(['top-left','top-right','bottom-left','bottom-right']),category:z.enum(['A','B','B1','C','D','E','E1']),reference:z.string().min(1).max(300)})).min(1).max(16),
 spectrum:z.array(z.object({name:z.string().min(1).max(80),liftFraction:nn.max(1),cycles:pos})).min(1).max(8),
 fabrication:z.object({steel:z.string().min(1).max(200),bolting:z.string().min(1).max(400),welding:z.string().min(1).max(400),inspection:z.string().min(1).max(700),erection:z.string().min(1).max(700),railAlignment:z.string().min(1).max(700)})
});
export type RunwayDetails=z.infer<typeof runwayDetailsSchema>;
export type LapConnection=z.infer<typeof lapConnectionSchema>;
export interface InterfaceAction {
 id:string;combination:string;x:number;vertical:number;top:number;bottom:number;longitudinal:number;torque:number;
 cranes:{index:number;origin:number;loaded:boolean}[];lateralSign:number;controls:string[];
 /** Girder ends at the support; `existing` marks an adjacent existing girder beyond a continued model end. */
 ends?:{x:number;bay:number;end:'left'|'right';vertical:number;top:number;bottom:number;longitudinal:number;offset:number;existing?:boolean}[];
 seatMoment?:number;
}
export interface FatigueDetailResult {
 id:string;name:string;x:number;category:string;reference:string;
 /** AISC 360-16 Table A-3.1 threshold stress range F_TH of the category, MPa. */
 threshold:number;
 bins:{name:string;cycles:number;minimum:number;maximum:number;range:number;allowable:number;damage:number}[];
 damage:number;range:number;peak:number;
}
export interface RunwayDetailResults {
 bracket?:BracketResults;
 existingBracket?:ExistingBracketResults;
 /** New rolled wide-flange bracket ('rolled-corbel'). */
 rolledBracket?:RolledBracketResults;
 /** New built-up tapered I haunch ('tapered-haunch'). */
 taperedHaunch?:TaperedHaunchResults;
 /** Factored strength envelope of the girder end forces at each support, for the bracket and its attachments. */
 bracketForces?:SupportForceEnvelope[];
 /** Column cap on new freestanding columns: per-grid cap, stiffener, bolt and weld demands, and the fork restraint. */
 columnCap?:ColumnCapResults;
 cap?:{longitudinalFlow:number;fatigueFlows:number[]};
 /** Major flexure with the load-height elastic critical moment: Cb = Mcr / Mocr in F2 / F4 / F5 (never above 1), with the
  * AISC 360-16 Commentary F1 load-height Cb of the same case for comparison. */
 loadHeight?:{utilization:number;demand:number;capacity:number;length:number;critical:number;id:string;combination:string;x:number;
  /** Cb = Mcr / Mocr (1 when the eigenvalue does not reduce the strength); Mocr the uniform-moment F2-4 / F4-5 / F5-4 moment at Lb. */
  cb:number;mocr:number;sign?:number;
  /** Height of the rail head above the shear center (load height in the eigen model). */
  height:number;
  /** Commentary F1: Cb (F1-1) of the case over the unbraced segment, times 1.4^(2y/h); its available strength. */
  commentary?:{segment:[number,number];mmax:number;quarter:[number,number,number];gradient:number;y:number;h:number;factor:number;cb:number;capacity:number}};
 /** Combined normal stress at each flange's extreme fibres (top: cap tips; bottom: W bottom flange tips). */
 flangeNormal?:{top:number;bottom:number};
 /** Normalized warping function W_no at the tips of each flange. */
 flangeWarping?:{top:number;bottom:number};
 /** The terms of each flange's governing combined normal stress: axial P, major M_x, lateral bending M_y = E I_y v'',
  * theta M_x and the warping stress sigma_ws at that flange's tips. */
 flangeParts?:{top:{P:number;M:number;My:number;thetaM:number;warping:number};bottom:{P:number;M:number;My:number;thetaM:number;warping:number}};
 /** H1 at each flange with the governing major-axis strength M_cx (load height included): governing concurrent actions. */
 interaction?:{mcx:number;top:number;bottom:number;topCase?:import('./types').DesignCaseSummary;bottomCase?:import('./types').DesignCaseSummary;
  /** H1 of each combination with this M_cx (the larger flange). */ combinations?:{id:string;interaction:number}[]};
 /** Strength cases whose girder bay is unstable at the applied load; their response is not recovered. */
 unstableCases?:number;
 normalStress:number;shearStress:number;railDisplacement:number;twist:number;criticalMultiplier:number;
 residual:number;meshChange:number;travelChange:number;cases:number;braceStiffness:number;braceForce:number;
 fatigue:FatigueDetailResult[];interfaces:InterfaceAction[];
 railFatigueBins:{name:string;cycles:number;vertical:number;lateral:number;flangeStress:number;plateStress:number;weldStress:number}[];
 demands:{brace:number;braceFatigue:number;verticalFatigue:number;endLongitudinal:number;railLateral:number;railVertical:number;railFatigueVertical:number;railFatigueLateral:number;
  /** Top-flange restraint force of one girder end (strength) and its range over the duty bins: the force on one tie. `brace` is all the girder ends at a grid. */
  braceEnd?:number;braceEndFatigue?:number};
 governing:Record<string,{id:string;combination:string;x:number;value:number}>;
}

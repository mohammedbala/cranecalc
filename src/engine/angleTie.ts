import {z} from 'zod';
import {aiscAngleByName} from '../data/aiscAngles';
import type {RunwayDetails} from './runwayDetails';
const pos=z.number().finite().positive();
export const topFlangeAngleSchema=z.object({shape:z.string().min(1).max(35),endSetback:pos,width:pos,plateThickness:pos,lap:pos,boltDiameter:pos,boltPitch:pos,slotLength:pos,shimThickness:z.number().finite().nonnegative(),washerThickness:pos,weldSize:pos});
export const defaultTopFlangeAngle={shape:'L4X4X3/8',endSetback:69.85,width:152.4,plateThickness:12.7,lap:50.8,boltDiameter:15.875,boltPitch:76.2,slotLength:38.1,shimThickness:6.35,washerThickness:6.35,weldSize:6.35};
export const angleTieSchema=z.object({shape:z.string().min(1).max(35),setback:pos,endSetback:pos,saddleLength:pos,lap:pos,gussetThickness:pos,weldSize:pos,connectionStyle:z.enum(['gusseted','top-flange-angle']).optional(),topFlange:topFlangeAngleSchema.optional()});
export const defaultSingleAngle={shape:'L3X3X1/4',setback:101.6,endSetback:76.2,saddleLength:152.4,lap:50.8,gussetThickness:12.7,weldSize:4.7625,connectionStyle:'top-flange-angle' as const};
export const defaultDoubleAngle={...defaultSingleAngle,shape:'L2-1/2X2-1/2X1/4'};
export const isAngleTie=(kind?:string)=>kind==='single-angle'||kind==='double-angle';
export function angleTie(d:RunwayDetails){
 const paired=d.brace.arrangement==='double-angle';
 const input:z.infer<typeof angleTieSchema>=paired?(d.brace.doubleAngle??defaultDoubleAngle):(d.brace.singleAngle??defaultSingleAngle);
 const connectionStyle=input.connectionStyle??'gusseted',topFlange=input.topFlange??defaultTopFlangeAngle;
 const shape=aiscAngleByName(connectionStyle==='top-flange-angle'?topFlange.shape:input.shape),depth=(shape?.d??3)*25.4,leg=(shape?.b??3)*25.4,thickness=(shape?.t??.25)*25.4;
 const halfGusset=input.gussetThickness/2;
 return {...input,connectionStyle,topFlange,shape,paired,depth,leg,thickness,
  left:paired?-halfGusset-leg:-halfGusset,right:halfGusset+leg,
  rise:depth+2*Math.max(6.35,input.weldSize)};
}
export function topFlangeAngleData(p:{section:{d:number;bf:number;kind:string;capWidth:number;capTw:number};details?:RunwayDetails}){
 if(!p.details)return null;const a=angleTie(p.details);
 if(!isAngleTie(p.details.brace.arrangement)||a.connectionStyle!=='top-flange-angle')return null;
 const t=a.topFlange,face=p.details.bracket?.reach??508;
 return {...t,depth:a.depth,leg:a.leg,thickness:a.thickness,paired:a.paired,shape:a.shape,
  top:p.section.d/2+(p.section.kind==='cap'?p.section.capTw:0),edge:p.section.kind==='cap'?p.section.capWidth/2:p.section.bf/2,
  columnFace:face,holeDiameter:t.boltDiameter+1.5875,boltLevel:a.depth*.65,boltZ:face-t.shimThickness-a.leg*.65,
  columnEnd:face-t.shimThickness-a.thickness-6.35,washerLength:t.slotLength+25.4,washerWidth:t.boltDiameter*2,
  nominalTravel:Math.max(0,(t.slotLength-t.boltDiameter)/2)};
}

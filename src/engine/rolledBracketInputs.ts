import {z} from 'zod';
import {aiscShapeByName} from '../data/aiscSections';
import {existingBracketProfile} from './bracketProfiles';
import {isTaperedHaunch,haunchInput,type TaperedHaunchInput} from './taperedHaunchInputs';

const pos=z.number().finite().positive(),inch=25.4,ksi=6.894757293168;
/**
 * New rolled wide-flange bracket: a W-section cantilever stub welded to the column flange. The runway bearing plates
 * and their bolts land directly on its top flange; bearing stiffeners under the girder web line are optional.
 * Canonical units mm, MPa.
 */
export const rolledBracketSchema=z.object({
 /** Stub steel (ASTM A992 unless noted). */
 Fy:pos,Fu:pos,
 /** Stub flanges to the column flange: a fillet on each face of each flange, or CJP groove welds. */
 flangeJoint:z.enum(['fillet','cjp']),
 /** Fillet leg on both faces of each flange (fillet joint), and on both sides of the web. */
 flangeWeld:pos,webWeld:pos,
 /** A pair of full-depth bearing stiffeners in the stub under the girder web line. */
 stiffeners:z.boolean(),stiffenerThickness:pos,stiffenerWeld:pos,
 /**
  * Bearings on a welded spreader seat plate across the stub top flange (seat length and thickness and the
  * seat-to-flange fillet are the bracket's seat inputs), for independent girder bearings longer than the flange
  * width; otherwise the bearings land directly on the top flange.
  */
 seatPlate:z.boolean()
});
export type RolledBracketInput=z.infer<typeof rolledBracketSchema>;
export const defaultRolledShape='W14X90';
export const defaultRolledBracket:RolledBracketInput={Fy:50*ksi,Fu:65*ksi,flangeJoint:'fillet',flangeWeld:3/8*inch,webWeld:5/16*inch,stiffeners:true,stiffenerThickness:inch/2,stiffenerWeld:inch/4,seatPlate:true};
type Bracket={arrangement?:string;corbelShape?:string;rolled?:Partial<RolledBracketInput>;haunch?:TaperedHaunchInput;seatThickness:number;seatLength:number;seatProjection:number;ribDepth:number;seatWeld:number;receiver?:{width:number;flangeThickness:number}};
export const isRolledBracket=(b?:{arrangement?:string;enabled?:boolean})=>b?.arrangement==='rolled-corbel';
export const rolledInput=(b:Bracket):RolledBracketInput=>({...defaultRolledBracket,...b.rolled});
const floorTo=(v:number,step:number)=>Math.floor(v/step+1e-9)*step,ceilTo=(v:number,step:number)=>Math.ceil(v/step-1e-9)*step;
/**
 * Catalogue geometry of the rolled stub in mm: depth, flange and web, the design fillet toe k (kdes) and its
 * offset from the web centerline k1, and the bearing stiffener plates (outstand to 1/4 in inside the flange tip,
 * corners clipped clear of the rolled fillet). L is the stub length from the column face.
 */
export function rolledStub(b:Bracket){
 const s=aiscShapeByName(b.corbelShape??defaultRolledShape);if(!s)return undefined;
 const r=rolledInput(b),d=s.d*inch,bf=s.bf*inch,tf=s.tf*inch,tw=s.tw*inch,k=s.kdes*inch,k1=tw/2+Math.max(0,k-tf);
 const width=floorTo((bf-tw)/2-inch/4,inch/8),clip=ceilTo(Math.max(k-tf,0)+inch/8,inch/8);
 // Spreader seat: across the flange, 1/4 in clear of the top flange-to-column fillet (or CJP reinforcement), to the stub tip.
 const y0=(r.flangeJoint==='fillet'?r.flangeWeld:5/16*inch)+inch/4;
 const seat=r.seatPlate?{t:b.seatThickness,length:b.seatLength,weld:b.seatWeld,y0,y1:b.seatProjection}:undefined;
 return {name:s.name,d,bf,tf,tw,k,k1,h0:d-tf,hw:d-2*tf,h:d-2*k,L:b.seatProjection,seat,
  A:s.A*inch**2,Ix:s.Ix*inch**4,Iy:s.Iy*inch**4,Sx:s.Sx*inch**3,Sy:s.Sy*inch**3,Zx:s.Zx*inch**3,Zy:s.Zy*inch**3,J:s.J*inch**4,Cw:s.Cw*inch**6,
  weight:s.weight*0.0145939,
  stiffener:r.stiffeners?{t:r.stiffenerThickness,weld:r.stiffenerWeld,width,clip,height:d-2*tf}:undefined,input:r};
}
export type RolledStub=NonNullable<ReturnType<typeof rolledStub>>;
/**
 * The plate the runway bearings land on, for drawings and the bearing-bolt grip: the welded seat plate of a plate
 * bracket, the top flange of a rolled stub. `depth` is the bracket below that plate.
 */
export function bracketSeat(b:Bracket){
 if(isRolledBracket(b)){const s=rolledStub(b);if(s)return s.seat?{thickness:s.seat.t,length:s.seat.length,projection:b.seatProjection,depth:s.d,rolled:true}:{thickness:s.tf,length:s.bf,projection:b.seatProjection,depth:s.d-s.tf,rolled:true};}
 // A tapered I haunch: its top flange is the seat; the depth below it is the root's.
 if(isTaperedHaunch(b)&&b.receiver){const h=haunchInput({...b,receiver:b.receiver});return {thickness:h.topThickness,length:h.topWidth,projection:b.seatProjection,depth:h.rootDepth-h.topThickness,rolled:false};}
 const existing=b.arrangement==='existing-corbel'||b.arrangement==='existing-w-corbel';
 return {thickness:b.seatThickness,length:b.seatLength,projection:b.seatProjection,depth:existing?existingBracketProfile(b as never).depth:b.ribDepth,rolled:false};
}

import {demonstrationProject} from '../../src/engine/demonstration';
import type {ProjectInput} from '../../src/engine/types';

const inch=25.4;
/**
 * The 10-ton demonstration with its top-flange tie on the direct flange saddle instead of the bearing stiffener: paired
 * 3/8 x 5 1/4 in bars to the 28 in column face, 7/8 in gussets, 5/8 in bolts at 2 1/4 in pitch, 1/8 in release travel,
 * on the demonstration details' 4 x 2 in saddle, set back 3 3/4 in (its 1/2 in end fillet clear of the stiffener). For the saddle mechanics, drawings and checks; the demonstration itself
 * ties at its stiffener (the saddle, 5 in below the flange, leaves the rail twist over its limit with the restraint at
 * the tie line).
 */
export function saddleDemonstration():ProjectInput{
 const p=demonstrationProject(),t=p.details!.brace;
 Object.assign(t,{width:5.25*inch,thickness:.375*inch,length:25.5*inch,reach:25.5*inch,gussetThickness:.875*inch,connectionLength:5.75*inch});
 Object.assign(t.connection,{pitch:2.25*inch,edge:1.25*inch,thickness:.375*inch});
 t.release={...t.release!,travel:.125*inch};t.flangeAttachment={...t.flangeAttachment!,enabled:true,longitudinalSetback:3.75*inch};
 return p;
}

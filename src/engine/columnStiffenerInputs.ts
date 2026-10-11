import {z} from 'zod';
import {aiscShapeByName} from '../data/aiscSections';

const pos=z.number().finite().positive(),inch=25.4;
/**
 * Column stiffeners (continuity plates) at a welded column bracket: a pair of plates, one each side of the receiving
 * column web, at the upper force level of the bracket (the seat, or the W stub's top flange) and a pair at its lower
 * force level (the rib bottom at the column face, or the stub's bottom flange). Each plate is welded to the loaded
 * flange and to the web, and to the far flange when full depth. Canonical units mm.
 */
export const columnStiffenerSchema=z.object({
 enabled:z.boolean(),
 /** Plate thickness, and width from the web face toward the flange tip. */
 thickness:pos,width:pos,
 /** Along the column depth: full depth between the flanges, or half depth from the loaded flange (AISC J10.8(3)). */
 length:z.enum(['full','half']),
 /** Corner clip, both legs, clear of the web-to-flange fillet. */
 clip:pos,
 /** Fillet legs, both faces of each plate: to the flange(s) and to the web. */
 flangeWeld:pos,webWeld:pos,
 /** Offsets of the upper and lower pairs from their default levels, up positive. */
 upperOffset:z.number().finite().optional(),lowerOffset:z.number().finite().optional(),
 /** k_des of the receiving column where no AISC shape identifies it (built-up or unidentified column): from the survey. */
 columnK:pos.optional()
});
export type ColumnStiffenerInput=z.infer<typeof columnStiffenerSchema>;
type Receiver={depth:number;width:number;flangeThickness:number;webThickness:number};
type Bracket={enabled:boolean;columnStiffeners?:ColumnStiffenerInput;receiver:Receiver};
/** The stiffeners of a bracket when enabled. */
export const activeColumnStiffeners=(b?:Bracket)=>b?.enabled&&b.columnStiffeners?.enabled?b.columnStiffeners:undefined;
/** AISC Table J2.4 minimum fillet for the thicker part, as connectionStrength.minimumFillet (kept here to stay free of engine imports). */
const minimumFillet=(t:number)=>(t<=6.35?1/8:t<=12.7?3/16:t<=19.05?1/4:5/16)*inch;
const floorTo=(v:number,step:number)=>Math.floor(v/step+1e-9)*step,ceilTo=(v:number,step:number)=>Math.ceil(v/step-1e-9)*step;
/** Clearance of the corner clip beyond the rolled fillet (k1 - tw/2 + margin, with k1 - tw/2 = k - tf). */
export const clipMargin=inch/8;
/**
 * k_des of the receiving column: the entered survey value, else the AISC shape of a new column, else the AISC shape
 * entered for the existing column when its d, bf, tf and tw match the surveyed receiver within 1/16 in.
 */
export function receiverK(b:Bracket,column?:{enabled:boolean;isNew?:boolean;shape:string}){
 const s=b.columnStiffeners,c=b.receiver;
 if(s?.columnK)return {k:s.columnK,source:'entered (survey)' as const};
 const shape=column?.enabled?aiscShapeByName(column.shape??''):undefined;
 if(shape&&(column!.isNew||[[shape.d,c.depth],[shape.bf,c.width],[shape.tf,c.flangeThickness],[shape.tw,c.webThickness]].every(([a,v])=>Math.abs(a*inch-v)<=inch/16)))return {k:shape.kdes*inch,source:`AISC ${shape.name}` as string};
 return undefined;
}
/**
 * Starting values for a receiving column: plates 1/4 in inside the flange tips, the thickness of the larger of the
 * J10.8 minimums for a delivering plate of thickness tp, the corner clip 1/8 in clear of the fillet (a 7/8 in
 * fillet where k is not yet known), the J2.4 minimum fillets, half depth.
 */
export function initialColumnStiffeners(c:Receiver,k:number|undefined,tp:number):ColumnStiffenerInput{
 const width=floorTo((c.width-c.webThickness)/2-inch/4,inch/8),thickness=ceilTo(Math.max(tp/2,width/16,3/8*inch),inch/8);
 const clip=ceilTo(Math.max((k??c.flangeThickness+7*inch/8)-c.flangeThickness,0)+clipMargin,inch/8);
 return {enabled:true,thickness,width,length:'half',clip,flangeWeld:minimumFillet(Math.max(thickness,c.flangeThickness)),webWeld:minimumFillet(Math.max(thickness,c.webThickness))};
}

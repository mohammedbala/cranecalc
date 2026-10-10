import {z} from 'zod';
const pos=z.number().finite().positive(),nn=z.number().finite().nonnegative();
export const anchorGrades=['F1554-36','F1554-55','F1554-105'] as const;
export const barSizes=['#4','#5','#6','#7','#8','#9','#10','#11'] as const;
/**
 * Base plate, anchor rods and spread footing for a NEW runway column with a fixed base. N is the plate
 * dimension along the column depth (strong-axis bending), B across it; the footing is concentric, L along N.
 * Anchors are headed cast-in F1554 rods in two rows, one at each N edge. The plate sits on grout on the
 * top of the footing, `soil` below the finished floor (zero for a footing poured flush with the existing
 * slab after saw cutting it). Canonical units mm, N, MPa.
 */
export const columnBaseSchema=z.object({
 enabled:z.boolean(),
 /** Fillet weld of each column flange and the web to the plate, both sides. */
 plate:z.object({N:pos,B:pos,thickness:pos,Fy:pos,weld:pos}),
 anchors:z.object({grade:z.enum(anchorGrades),diameter:pos,perRow:z.number().int().min(2).max(4),edge:pos,gauge:pos,embedment:pos}),
 grout:nn,
 concrete:z.object({fc:pos}),
 /** soil: top of footing below the finished floor, with soil or slab over it; slab: existing slab thickness, saw cut for the footing. */
 footing:z.object({L:pos,B:pos,thickness:pos,cover:pos,soil:nn,slab:nn,bar:z.enum(barSizes),spacing:pos,fy:pos}),
 /** Allowable (service) soil bearing pressure, base friction coefficient, soil unit weight and frost depth below the floor (zero for an interior footing protected from frost), from the geotechnical report and the building code. */
 soil:z.object({allowable:pos,friction:pos,unitWeight:pos,frost:nn}),
 source:z.string().max(300),confirmed:z.boolean()
});
export type ColumnBaseInput=z.infer<typeof columnBaseSchema>;
const inch=25.4,foot=304.8,ksi=6.894757293168,psf=0.04788025898e-3,pcf=1.570874638e-7;
// Illustrative starting point for a light runway column; size it for the actual reactions and soil report.
export const defaultColumnBase:ColumnBaseInput={enabled:false,
 plate:{N:22*inch,B:18*inch,thickness:1.5*inch,Fy:50*ksi,weld:.3125*inch},
 anchors:{grade:'F1554-36',diameter:1.25*inch,perRow:2,edge:2*inch,gauge:12*inch,embedment:18*inch},
 grout:1.5*inch,concrete:{fc:4*ksi},
 footing:{L:8*foot,B:8*foot,thickness:30*inch,cover:3*inch,soil:0,slab:6*inch,bar:'#7',spacing:10*inch,fy:60*ksi},
 soil:{allowable:3000*psf,friction:.35,unitWeight:120*pcf,frost:0},source:'',confirmed:false};
/** Column base (top of base plate) above the finished floor: plate and grout on the footing, its top `soil` below the floor. */
export const columnBaseElevation=(b:ColumnBaseInput)=>b.plate.thickness+b.grout-b.footing.soil;
/** AISC Design Guide 1 Table 2.3: base plate hole diameter and plate washer size and thickness for a rod diameter. */
export function anchorHardware(d:number){
 const t:[number,number,number,number][]=[[.75,1.3125,2,.25],[.875,1.5625,2.5,.3125],[1,1.8125,3,.375],[1.25,2.0625,3,.5],[1.5,2.3125,3.5,.5],[1.75,2.75,4,.625],[2,3.25,5,.75],[2.5,3.75,5.5,.875]];
 const di=d/25.4,row=t.find(r=>r[0]>=di-1e-6)??t.at(-1)!;
 return {hole:row[1]*25.4,washer:row[2]*25.4,washerThickness:row[3]*25.4};
}

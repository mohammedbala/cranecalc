import {z} from 'zod';
const pos=z.number().finite().positive(),num=z.number().finite();
/** Existing load effect at the column's governing section: axial (compression positive), strong- and weak-axis moments, strong-axis shear. */
const effect=z.object({P:num,Mx:num,My:num,V:num});
const support=z.object({base:z.enum(['pinned','fixed']),top:z.enum(['braced','free'])});
export const existingLoadKeys=['D','L','Lr','S','R','W','E'] as const;
export type ExistingLoadKey=typeof existingLoadKeys[number];
/**
 * A surveyed existing building column that receives a runway support. The
 * column section is the bracket's receiving column when a bracket is
 * enabled, otherwise the catalogue shape, otherwise the entered plates.
 * Elevations are measured from the column base. Canonical units mm, N, MPa.
 */
export const existingColumnSchema=z.object({
 enabled:z.boolean(),
 shape:z.string().max(30),
 d:pos,bf:pos,tf:pos,tw:pos,Fy:pos,Fu:pos,
 height:pos,seatElevation:pos,eccentricity:pos,
 strong:support,weak:support,
 Lcx:pos,Lcy:pos,Lcz:pos,Lb:pos,
 longitudinal:z.enum(['bracing','column']),
 driftLimit:pos,
 existing:z.object({D:effect,L:effect,Lr:effect,S:effect,R:effect,W:effect,E:effect}),
 source:z.string().max(500),confirmed:z.boolean()
});
export type ExistingColumnInput=z.infer<typeof existingColumnSchema>;
const zero={P:0,Mx:0,My:0,V:0},inch=25.4,foot=304.8;
// W14X90 in A992: an illustrative starting point only; zero existing loads are missing data until entered.
export const defaultExistingColumn:ExistingColumnInput={enabled:false,shape:'W14X90',d:14*inch,bf:14.5*inch,tf:.71*inch,tw:.44*inch,Fy:345,Fu:450,
 height:24*foot,seatElevation:16*foot,eccentricity:18*inch,strong:{base:'pinned',top:'braced'},weak:{base:'pinned',top:'braced'},
 Lcx:24*foot,Lcy:8*foot,Lcz:8*foot,Lb:8*foot,longitudinal:'bracing',driftLimit:240,
 existing:{D:{...zero},L:{...zero},Lr:{...zero},S:{...zero},R:{...zero},W:{...zero},E:{...zero}},source:'',confirmed:false};

import {seatSettingTolerance} from './fitTolerances';
import {z} from 'zod';
import {minimumFillet} from './connectionStrength';

const pos=z.number().finite().positive(),inch=25.4;
/**
 * New built-up tapered I haunch welded to the column flange ('tapered-haunch'): one vertical tapered web plate in
 * the plane of the grid, a horizontal top flange that is the seat of both girder bearings, a sloping bottom flange
 * from the bottom of the root to the bottom of the tip, a pair of full-depth bearing stiffeners under the girder web
 * line and an optional tip end plate. Where the seat is wider than the bottom flange, each stiffener carries a wing:
 * it widens from its outstand on the bottom flange to the seat edge under the top flange, with a straight sloped free
 * edge, so the girder reactions bear on the stiffeners instead of bending the top flange outstand. The bracket reach (column face to the runway centerline), the projection
 * (seatProjection = L) and the web-to-column fillet (rootWeld) are the bracket's own inputs. Canonical mm, MPa.
 *
 * Both flanges are welded to the column flange at a width that fits it with the weld run-out. Two girder bearings
 * and their end gap usually need more length along the runway than a W14 column flange gives: the top flange is
 * then cut wider beyond the root, flaring at 45 degrees from its root width to the seat width ahead of the bearing
 * plate, with a 1 in radius at the re-entrant corner. Only the root width is credited in the section.
 */
export const taperedHaunchSchema=z.object({
 /** Overall depth at the column face (root) and at the tip; the top flange is level, the bottom flange slopes. */
 rootDepth:pos,tipDepth:pos,
 webThickness:pos,
 /** Top flange (the seat): its width along the runway under the bearings, and thickness. */
 topWidth:pos,topThickness:pos,
 /** Top flange width at the column face (welded); the seat width where omitted. */
 rootWidth:pos.optional(),
 /** Sloping bottom flange: width along the runway and thickness normal to its plane. */
 bottomWidth:pos,bottomThickness:pos,
 /**
  * Pair of full-depth bearing stiffeners at the girder web line: thickness, outstand from the web face on the bottom
  * flange, fillet; topWidth, the outstand under the top flange where it is wider (a wing plate with a sloped free edge).
  */
 stiffener:z.object({thickness:pos,width:pos,weld:pos,topWidth:pos.optional()}),
 /** Flanges to the column flange: CJP groove welds, or a fillet on each face. */
 flangeJoint:z.enum(['cjp','fillet']),
 /** Fillet leg of the flange-to-column fillets (fillet joint only). */
 flangeWeld:pos,
 /** Flange-to-web fillets, both sides, shop. */
 flangeWebWeld:pos,
 /** Tip end plate closing the haunch (stiffener thickness, stiffener fillets). */
 endPlate:z.boolean().optional()
});
export type TaperedHaunchInput=z.infer<typeof taperedHaunchSchema>;
export const isTaperedHaunch=(b?:{arrangement?:string})=>b?.arrangement==='tapered-haunch';
/** Weld run-out each side of a bracket flange on the column flange: CJP groove welds stop 1/4 in inside the column flange tips; fillets their leg plus 1/4 in. */
export const flangeRunout=(h:Pick<TaperedHaunchInput,'flangeJoint'|'flangeWeld'>)=>h.flangeJoint==='cjp'?inch/4:h.flangeWeld+inch/4;
/** Accepted range of the bottom-flange slope from the horizontal, degrees. */
export const haunchSlopeLimit=45;
/** Radius at the re-entrant corner where the top flange starts to flare (AISC Table A-3.1 item 1.3, R >= 1 in). */
export const flareRadius=inch;
const floorTo=(v:number,step:number)=>Math.floor(v/step+1e-9)*step,ceilTo=(v:number,step:number)=>Math.ceil(v/step-1e-9)*step;

type Bracket={arrangement?:string;haunch?:TaperedHaunchInput;reach:number;seatProjection:number;rootWeld:number;receiver:{width:number;flangeThickness:number}};
/**
 * Starting sizes from the bracket's projection and the receiving column flange: both flanges welded as wide as the
 * column flange less the CJP run-out (in 1/4 in), the top flange flared to the seat width that holds the bearings,
 * root depth max(12 in, 0.6 L) and tip depth half of it (whole inches), a 3/8 in web, 1 in flanges, stiffeners 1/4 in
 * inside the narrower welded flange, winged to 1/4 in inside the seat edge where the seat is wider. `sizeTaperedHaunch`
 * grows the plates for the project's reactions.
 */
export function defaultTaperedHaunch(b:{seatProjection:number;receiver:{width:number}},seatWidth=0):TaperedHaunchInput{
 const L=b.seatProjection,width=Math.max(6*inch,floorTo(b.receiver.width-2*inch/4,inch/4)),root=ceilTo(Math.max(12*inch,.6*L),inch);
 const tw=3/8*inch,tf=inch,w=wing(Math.max(width,ceilTo(seatWidth,inch/4)),width,tw);
 // A wing's outstand within 0.56 sqrt(E/Fy) t at Fy = 50 ksi (stiffened seat); the sizing rechecks with the project's steel.
 const ts=ceilTo(Math.max(tf/2,3/8*inch,(w.topWidth??0)/(.56*Math.sqrt(29000/50))),inch/8);
 return {rootDepth:root,tipDepth:ceilTo(Math.max(root/2,6*inch),inch),webThickness:tw,topWidth:Math.max(width,ceilTo(seatWidth,inch/4)),rootWidth:width,topThickness:tf,bottomWidth:width,bottomThickness:tf,
  stiffener:{thickness:ts,width:floorTo((width-tw)/2-inch/4,inch/8),weld:minimumFillet(Math.max(ts,tw,tf)),...w},
  flangeJoint:'cjp',flangeWeld:5/16*inch,flangeWebWeld:Math.max(minimumFillet(Math.max(tf,tw)),inch/4),endPlate:true};
}
/** A stiffener wing to 1/4 in inside the seat edge, where the seat is wider than the bottom flange (1/8 in steps). */
export function wing(seat:number,bottom:number,tw:number){
 const width=floorTo((bottom-tw)/2-inch/4,inch/8),top=floorTo((seat-tw)/2-inch/4,inch/8);
 return top>width+1e-6?{topWidth:top}:{};
}
/** The haunch inputs of a bracket, defaulted from its geometry where none are entered. */
export const haunchInput=(b:{haunch?:TaperedHaunchInput;seatProjection:number;receiver:{width:number}}):TaperedHaunchInput=>b.haunch??defaultTaperedHaunch(b);

/**
 * Plate geometry of the haunch in mm. y is measured from the column face along the haunch, z up from the bottom of
 * the root; h(y) = h_r - (h_r - h_t) y / L is the overall depth, the top flange level at z = h_r. The sloping bottom
 * flange is tb thick normal to its plane, tb / cos(alpha) on a vertical section. W, the bearing plate width across
 * the runway, places the top flange flare: it reaches the full seat width at the bearing plate edge, y = a - W/2.
 */
export function haunchGeometry(b:Bracket,W=0){
 const h=haunchInput(b),L=b.seatProjection,s=(h.rootDepth-h.tipDepth)/L,alpha=Math.atan(s),cos=Math.cos(alpha),tbv=h.bottomThickness/cos;
 const depth=(y:number)=>h.rootDepth-s*Math.min(Math.max(y,0),L);
 const a=b.reach,st=h.stiffener,bt=h.topWidth,btr=Math.min(h.rootWidth??bt,bt);
 const flare=bt>btr+1e-6?{y1:a-W/2,y0:a-W/2-(bt-btr)/2,radius:flareRadius}:undefined;
 // Stiffener corner clips clear the flange-to-web fillets by 1/8 in, in 1/8 in.
 const clip=ceilTo(h.flangeWebWeld+inch/8,inch/8);
 return {input:h,L,a,hr:h.rootDepth,ht:h.tipDepth,s,alpha,cos,degrees:alpha*180/Math.PI,
  tw:h.webThickness,bt,btr,flare,tt:h.topThickness,bb:h.bottomWidth,tb:h.bottomThickness,tbv,
  joint:h.flangeJoint,flangeWeld:h.flangeWeld,webWeld:b.rootWeld,flangeWebWeld:h.flangeWebWeld,endPlate:h.endPlate??false,
  depth,
  /** Width of the top flange at y: the welded root width, flaring at 45 degrees to the seat width. */
  topWidthAt:(y:number)=>!flare||y<=flare.y0?btr:y>=flare.y1?bt:btr+2*(y-flare.y0),
  /** Clear web depth between the flanges on a vertical section. */
  clear:(y:number)=>depth(y)-h.topThickness-tbv,
  /** Length of the sloping bottom flange. */
  bottomLength:L/cos,
  stiffener:{t:st.thickness,width:st.width,weld:st.weld,clip,y:a,
   /** Outstand under the top flange (the wing reaches the seat where it exceeds the bottom outstand `width`). */
   top:Math.max(st.width,st.topWidth??0),wing:(st.topWidth??0)>st.width+1e-6,
   /** Height between the flanges at the stiffener and the fitted length on each flange beyond the clip. */
   height:depth(a)-h.topThickness-tbv,flangeLength:st.width-clip,topLength:Math.max(st.width,st.topWidth??0)-clip}};
}
export type HaunchGeometry=ReturnType<typeof haunchGeometry>;

type Rect={b:number;y0:number;y1:number};
/** Elastic and plastic strong-axis properties of stacked rectangles (z up). */
function rectangles(parts:Rect[]){
 const A=parts.reduce((s,r)=>s+r.b*(r.y1-r.y0),0),ybar=parts.reduce((s,r)=>s+r.b*(r.y1-r.y0)*(r.y0+r.y1)/2,0)/A;
 const I=parts.reduce((s,r)=>s+r.b*(r.y1-r.y0)**3/12+r.b*(r.y1-r.y0)*((r.y0+r.y1)/2-ybar)**2,0);
 // Plastic neutral axis: equal areas above and below.
 let below=0,yp=parts[0].y0;
 for(const r of [...parts].sort((u,v)=>u.y0-v.y0)){const a=r.b*(r.y1-r.y0);if(below+a>=A/2){yp=r.y0+(A/2-below)/r.b;break;}below+=a;}
 const Z=parts.reduce((s,r)=>{const lo=Math.min(r.y1,Math.max(r.y0,yp)),hi=Math.max(r.y0,Math.min(r.y1,yp));
  // Part below yp: from y0 to lo; part above: from hi to y1.
  return s+r.b*(lo-r.y0)*(yp-(r.y0+lo)/2)+r.b*(r.y1-hi)*((hi+r.y1)/2-yp);},0);
 return {A,ybar,I,yp,Z};
}
/**
 * Properties of the vertical section at y: top flange at its welded root width btr x tt at the top (the flared seat
 * width beyond is not credited, or the full width where `full`), web tw over the clear depth, bottom flange bb x tb
 * (its normal thickness: the larger vertical cut tb / cos(alpha) is not credited) centered in its vertical cut.
 * Compression is in the bottom flange under gravity. hc and hp per AISC F4 (no fillet: welded section).
 */
export function haunchSection(g:HaunchGeometry,y:number,full=false){
 const h=g.depth(y),hw=g.clear(y),zb=g.tbv/2,bt=full?g.topWidthAt(y):g.btr;
 const r=rectangles([{b:g.bb,y0:zb-g.tb/2,y1:zb+g.tb/2},{b:g.tw,y0:g.tbv,y1:h-g.tt},{b:bt,y0:h-g.tt,y1:h}]);
 const Sxt=r.I/(h-r.ybar),Sxc=r.I/r.ybar,h0=h-g.tt/2-zb;
 const Iyt=g.tt*bt**3/12,Iyc=g.tb*g.bb**3/12,Iy=Iyt+Iyc+hw*g.tw**3/12;
 const J=(bt*g.tt**3+g.bb*g.tb**3+hw*g.tw**3)/3,Cw=h0**2*Iyt*Iyc/(Iyt+Iyc);
 // Shear center above the bottom flange centroid, and its height above the bottom of the section.
 const sc=zb+h0*Iyt/(Iyt+Iyc);
 const Zy=(g.tt*bt**2+g.tb*g.bb**2+hw*g.tw**2)/4,Sy=Iy/(Math.max(bt,g.bb)/2);
 return {y,h,hw,bt,A:r.A,ybar:r.ybar,Ix:r.I,Sxt,Sxc,Zx:r.Z,yp:r.yp,h0,Iyt,Iyc,Iy,J,Cw,sc,Zy,Sy,
  /** Web area for shear: the overall depth times the web thickness (G2.1); its clear area for shear deformation. */
  Aw:h*g.tw,Awc:hw*g.tw,
  /** Twice the distances from the elastic and plastic neutral axes to the inside face of the compression flange. */
  hc:2*(r.ybar-g.tbv),hp:2*(r.yp-g.tbv),
  /** First moments of the top and bottom flanges about the elastic neutral axis (flange-to-web shear flow). */
  Qt:bt*g.tt*(h-g.tt/2-r.ybar),Qb:g.bb*g.tb*(r.ybar-zb)};
}
export type HaunchSection=ReturnType<typeof haunchSection>;

/** Self-weight of the haunch plates (flanges, web, stiffeners, end plate) in N. */
export function haunchWeight(g:HaunchGeometry,density:number){
 const f=g.flare,flareArea=f?(g.bt-g.btr)*(f.y1-f.y0)/2+(g.bt-g.btr)*(g.L-f.y1):0;
 const web=(g.clear(0)+g.clear(g.L))/2*g.L*g.tw,flanges=(g.btr*g.L+flareArea)*g.tt+g.bb*g.tb*g.bottomLength,s=g.stiffener;
 const stiffeners=2*(s.width+s.top)/2*s.height*s.t,end=g.endPlate?Math.max(g.bt,g.bb)*g.ht*s.t:0;
 return (web+flanges+stiffeners+end)*density*9.80665/1e9;
}

/**
 * First selection of the tapered haunch: start the plates from the bracket geometry with the seat width that holds
 * the girder bearings with their 1/8 in setting tolerance each side and the end gap (simple spans) or the runway-end bearing on one side of the web (continuous),
 * size the web-to-column fillet (the bracket's rootWeld) for the thicker of the web and the column flange, and make
 * the haunch reach 1 in past the bearing plate. Entered haunch inputs are kept.
 */
export function selectTaperedHaunch<B extends {haunch?:TaperedHaunchInput;seatProjection:number;reach:number;rootWeld:number;receiver:{width:number;flangeThickness:number}}>(
 d:{bearing:{width:number;length:number};simpleSupport?:{endGap:number}},b:B,system:'simple'|'continuous'='simple'):B{
 if(b.haunch)return b;
 const W=d.bearing.width,L=Math.max(b.seatProjection,ceilTo(b.reach+W/2+inch,inch)),seat=(system==='simple'?(d.simpleSupport?.endGap??inch)+2*d.bearing.length:2*d.bearing.length)+2*seatSettingTolerance;
 const haunch=defaultTaperedHaunch({...b,seatProjection:L},seat);
 return {...b,seatProjection:L,haunch,rootWeld:minimumFillet(Math.max(haunch.webThickness,b.receiver.flangeThickness))};
}

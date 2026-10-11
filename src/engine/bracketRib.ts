import type {BracketInput} from './bracketInputs';
import type {ProjectInput} from './types';
import {available} from './aiscStrength';

/**
 * Plate ribs of the welded column brackets designed here. A rectangular twin rib has the same depth from the column
 * face to the seat edge; a haunched rib tapers linearly from its root depth at the column flange to its tip depth at
 * the seat edge, with a straight sloping free edge below a horizontal top edge welded to the seat. Both are
 * cantilevers from the column flange; the same functions serve both, the rectangular rib with zero slope.
 */
export const haunchedBracket=(b?:BracketInput)=>b?.arrangement==='haunched-seat';
/** Welded rib brackets with component checks: the rectangular twin rib and the tapered (haunched) rib. */
export const weldedRibBracket=(b?:BracketInput)=>!!b&&((b.arrangement??'twin-rib')==='twin-rib'||b.arrangement==='haunched-seat');
/** Haunch tip depth: the entered value, or a quarter of the root depth where none is entered yet. */
export const haunchTipDepth=(b:BracketInput)=>b.tipDepth??b.ribDepth/4;
/** Free-edge slope from the horizontal accepted by the tapered-rib model, degrees. */
export const haunchAngleLimits={min:10,max:45} as const;
/** Bracket-plate proportions of the Salmon and Johnson triangular-bracket tests: projection / root depth. */
export const haunchProportionLimits={min:.5,max:2} as const;

export interface RibGeometry {
 /** Depth at the column flange (root) and at the seat edge (tip); projection from the column face; thickness. */
 root:number;tip:number;length:number;thickness:number;tapered:boolean;
 /** Fall of the free edge per unit projection (tan of its angle from the horizontal), the angle in radians and the free-edge length. */
 slope:number;angle:number;edgeLength:number;
 /** Elevation area of one rib plate. */
 area:number;
}
export function ribGeometry(b:BracketInput):RibGeometry{
 const tapered=haunchedBracket(b),root=b.ribDepth,tip=tapered?haunchTipDepth(b):root,length=b.seatProjection,slope=(root-tip)/length;
 return {root,tip,length,thickness:b.ribThickness,tapered,slope,angle:Math.atan(slope),edgeLength:Math.hypot(length,root-tip),area:(root+tip)/2*length};
}
/** Rib depth at x from the column face. */
export const ribDepthAt=(g:RibGeometry,x:number)=>g.root-g.slope*Math.min(Math.max(x,0),g.length);
const simpson=(f:(x:number)=>number,a:number,b:number,n=256)=>{if(b<=a)return 0;const h=(b-a)/n;let s=f(a)+f(b);for(let i=1;i<n;i++)s+=(i%2?4:2)*f(a+i*h);return s*h/3;};
/**
 * Response of one rib to a unit force at e from the column face (the far edge of the bearing patch), as factors on
 * the rib reaction. Elementary beam theory on vertical sections of depth h(x) = h_r - (h_r - h_t)x/L:
 * - `critical`: the section of greatest bending stress (e - x)/S(x), at x = 2e - h_r/s when that lies between the root
 *   and the load, else the root; for a rectangular rib, the root;
 * - `edge`: the stress along the sloping free edge there. The edge is traction free, so its stress is uniaxial along
 *   the edge and the bending stress on the vertical section is its component sigma_e cos^2(alpha);
 * - `shear`: peak elastic shear 1.5/(t h) at the shallowest section carrying the whole reaction (at the load);
 * - `delta` / `theta`: deflection and rotation at the load by virtual work over the variable section, bending plus
 *   shear (kappa = 5/6). The Resal relief of web shear by the inclined edge force is not credited.
 */
export function ribResponse(g:RibGeometry,e:number,E:number,G:number){
 const t=g.thickness,xe=Math.min(Math.max(e,0),g.length),h=(x:number)=>ribDepthAt(g,x),S=(x:number)=>t*h(x)**2/6;
 const x=g.slope>0?Math.min(xe,Math.max(0,2*e-g.root/g.slope)):0,cos2=Math.cos(g.angle)**2;
 const bending=(at:number)=>(e-at)/S(at);
 const I=(at:number)=>t*h(at)**3/12,A=(at:number)=>t*h(at),kappa=5/6;
 const delta=g.slope>0?simpson(v=>(e-v)**2/(E*I(v)),0,xe)+simpson(v=>1/(kappa*G*A(v)),0,xe):e**3/(3*E*I(0))+e/(kappa*G*A(0));
 const theta=g.slope>0?simpson(v=>(e-v)/(E*I(v)),0,xe):e**2/(2*E*I(0));
 // Sample points for the combined elastic stress; both terms are smooth in x.
 const samples=[...Array.from({length:65},(_,i)=>xe*i/64),x];
 return {e,xe,t,cos2,
  root:{x:0,depth:g.root,S:S(0),A:A(0),I:I(0),bending:bending(0),edge:bending(0)/cos2,shear:1.5/A(0)},
  critical:{x,depth:h(x),S:S(x),moment:e-x,bending:bending(x),edge:bending(x)/cos2},
  load:{x:xe,depth:h(xe),shear:1.5/A(xe)},
  /** Largest f_b/F_b + f_v/F_v over the sections between the root and the load, per unit force. */
  interaction:(Fb:number,Fv:number)=>Math.max(...samples.map(v=>bending(v)/Fb+1.5/A(v)/Fv)),
  delta,theta};
}
/**
 * AISC 360 F11 rectangular-bar flexure at the section x of a rib: yielding (Mp = Fy Z <= 1.6 My) and lateral-torsional
 * buckling with Lb = 2L for the cantilever (Cb = 1) and the slenderness Lb d / t^2 of the root depth, the deepest
 * section, so the critical stress applies to every section of a tapered rib.
 */
export function ribFlexure(b:BracketInput,E:number,Fy:number,method:ProjectInput['method'],x=0){
 const g=ribGeometry(b),t=g.thickness,d=ribDepthAt(g,x),S=t*d**2/6,Mp=Fy*t*d**2/4;
 const slenderness=2*g.length*g.root/t**2,ratio=slenderness*Fy/E;
 const nominal=ratio<=.08?Mp:ratio<=1.9?Math.min(Mp,(1.52-.274*ratio)*Fy*S):Math.min(Mp,1.9*E/slenderness*S);
 return {slenderness,nominal,capacity:available(nominal,method,.9,1.67),depth:d,S};
}
/**
 * Free (sloping) edge of a haunched rib, after the triangular bracket-plate rules of AISC Manual Part 15 (Salmon and
 * Johnson; Salmon, Buettner and O'Sheridan 1964): the free edge reaches yield when b/t <= 250/sqrt(Fy [ksi]) for
 * b/a <= 1 and b/t <= 250(b/a)/sqrt(Fy) for 1 < b/a <= 2, that is min(a, b)/t <= 1.47 sqrt(E/Fy), with b the
 * projection and a the root depth (the full root depth bounds the edge's vertical extent conservatively). Beyond
 * that slenderness the edge stress is limited to the elastic plate value Fy (lambda_p / lambda)^2.
 */
export function ribFreeEdge(g:RibGeometry,E:number,Fy:number,method:ProjectInput['method']){
 const limit=1.47*Math.sqrt(E/Fy),width=Math.min(g.length,g.root),slenderness=width/g.thickness;
 const Fcr=Fy*Math.min(1,(limit/slenderness)**2);
 return {limit,width,slenderness,proportion:g.length/g.root,minimumThickness:width/limit,Fcr,capacity:available(Fcr,method,.9,1.67)};
}
/**
 * Root fillet stress at the bottom of a haunched rib's root: the sloping free edge meets the column face there, and the
 * traction-free edge makes the plate shear on the vertical section equal to the bending stress times tan(alpha).
 * That shear adds to the uniform weld-group shear (conservatively) with the elastic bending stress at the weld end.
 */
export const rootCornerStress=(bending:number,shear:number,slope:number)=>Math.hypot(bending,Math.abs(shear)+Math.abs(bending)*slope);
/**
 * Geometry limits of the haunched rib model: a real taper (tip shallower than the root), a free-edge slope within the
 * range where plane vertical sections with the edge correction represent the plate, and the projection-to-depth range
 * of the bracket-plate tests behind the free-edge rule.
 */
export function haunchedRibErrors(b:BracketInput):string[]{
 if(!haunchedBracket(b))return [];
 const g=ribGeometry(b),deg=g.angle*180/Math.PI,errors:string[]=[],add=(bad:boolean,message:string)=>{if(bad)errors.push('details.bracket: '+message);};
 add(g.tip>=g.root,'haunch tip depth must be less than the root depth (a rib of constant depth is the welded twin-rib seat).');
 add(g.tip<g.root&&(deg<haunchAngleLimits.min-1e-9||deg>haunchAngleLimits.max+1e-9),`haunch free-edge slope ${deg.toFixed(1)}° is outside ${haunchAngleLimits.min}°–${haunchAngleLimits.max}° from the horizontal: below it use the twin-rib seat; above it the plate is a strut-and-tie bracket outside this model.`);
 add(g.length/g.root<haunchProportionLimits.min-1e-9||g.length/g.root>haunchProportionLimits.max+1e-9,`haunched rib projection / root depth ${(g.length/g.root).toFixed(2)} is outside the ${haunchProportionLimits.min}–${haunchProportionLimits.max} range of the bracket-plate free-edge rule.`);
 return errors;
}

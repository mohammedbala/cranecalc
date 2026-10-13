import type {ProjectInput} from './types';
import type {RunwayDetails,RailClipInput} from './runwayDetails';

const inch=25.4;
type Rail=RunwayDetails['rail'];

/** Values that earlier project files do not carry: a 1/4 in rail pad. */
export const railSeatDefaults={padThickness:.25*inch} as const;
/** Supplier text that marks rail clip data as not yet entered. */
export const clipNotEntered='TO BE ENTERED:';
/**
 * Rail clip of a project that has not entered its manufacturer data (earlier project files, new templates): a weld-on
 * floating clip of typical base size, so stations, the fatigue register and the drawings can be laid out. Its rated
 * capacities are placeholders; every rail clip check is unverified until the manufacturer's data are entered.
 */
export const defaultRailClip:RailClipInput={type:'weld-on',product:`${clipNotEntered} rail clip manufacturer and series (or equal)`,basis:'allowable',
 lateral:4448.2216152605,uplift:4448.2216152605,baseLength:3.75*inch,baseWidth:2.5*inch,baseThickness:.75*inch,weld:.3125*inch,weldLength:2.5*inch};

/**
 * The rail pad, when the project specifies one (aist.railPad): a continuous strip under the rail base,
 * centered on the rail, with its rated allowable compression and product basis.
 */
export function railPad(p:ProjectInput){
 if(!p.aist?.railPad)return undefined;
 const r=p.details?.rail;
 return {thickness:r?.padThickness??railSeatDefaults.padThickness,width:r?.padWidth??r?.baseWidth??0,allowable:r?.padAllowable,source:r?.padSource};
}
export const railPadThickness=(p:ProjectInput)=>railPad(p)?.thickness??0;
/**
 * Top of rail above the steel it bears on (the W top flange or the cap web): the rail height plus any pad.
 * Load heights, rail-head levers and T.O.R. elevations use this, never the rail depth alone.
 */
export const railTopAboveSteel=(p:ProjectInput)=>p.railHeight+railPadThickness(p);
/** The plate the rail clips are welded to: the cap channel web (the top plate of a capped girder) or the W top flange. */
export const clipSeatThickness=(p:ProjectInput)=>p.section.kind==='cap'?p.section.capTw:p.section.tf;
/** The rail clip inputs, or the placeholder clip when the project has none. */
export const railClipInput=(rail:Rail|undefined):RailClipInput=>rail?.clip??defaultRailClip;
/** True once the manufacturer's clip data are entered (not the placeholder text). */
export const clipEntered=(rail:Rail|undefined)=>!!rail?.clip&&!rail.clip.product.trim().toUpperCase().startsWith(clipNotEntered);

/**
 * Rail clip in section, offsets across the runway from the rail centerline (rail on its design line). The clip
 * base, `baseWidth` across the rail and `baseLength` along it, stands on the girder against the rail-base toe; its
 * nose bears on the top of the rail base over `overlap` (a drawing value: the clip itself is per manufacturer). The
 * base is fillet welded at both ends (two welds across the rail, `weldLength` each, `baseLength` apart).
 */
export function clipGeometry(rail:Rail,pad=0){
 const c=railClipInput(rail),toe=rail.baseWidth/2,overlap=Math.min(.5*inch,(rail.baseWidth-rail.webThickness)/4);
 return {...c,toe,inner:toe,outer:toe+c.baseWidth,tip:toe-overlap,overlap,
  /** Height of the rail-base top above the steel (pad plus base), where the nose bears. */
  noseHeight:pad+rail.baseThickness,pad,
  /** Lateral force at mid-height of the rail-base edge, where the rail bears on the clip. */
  lateralHeight:pad+rail.baseThickness/2};
}
export type ClipGeometry=ReturnType<typeof clipGeometry>;

/** Rail inputs with the optional pad and clip values filled from their defaults, in input order. */
export function railInputsWithDefaults(rail:Rail):Rail{
 const {padThickness,padWidth,clip,jointType,...rest}=rail,out:Record<string,unknown>={};
 for(const [key,value] of Object.entries(rest)){
  out[key]=value;
  if(key==='padSource')Object.assign(out,{padThickness:padThickness??railSeatDefaults.padThickness,padWidth:padWidth??rail.baseWidth,clip:clip??structuredClone(defaultRailClip)});
  // Rail joints: AIST TR-13 §5.16.1 tight joints unless open joints are chosen.
  if(key==='temperatureRange')out.jointType=jointType??'tight';
 }
 return out as Rail;
}
/** The pad and the rail clip of a project. */
export function railSeat(p:ProjectInput){
 const r=p.details!.rail;
 return {pad:railPad(p),clip:clipGeometry(r,railPadThickness(p)),entered:clipEntered(r)};
}
/**
 * Schematic outline of a rail clip in section for the drawings, [across, up] from the rail centerline and the top of
 * the steel, on the side `side` (+1 / -1): the base plate from the rail-base toe outward, a body rising beside the rail
 * base and a nose over its top. Only the base footprint is a design value; the shape is the manufacturer's.
 */
export function clipOutline(c:ClipGeometry,side:1|-1):[number,number][]{
 // Schematic proportions: a base flange lower than the rail base, a body beside the rail base and a nose 5/8 in thick.
 const nose=.625*inch,top=c.noseHeight+nose,base=Math.min(c.baseThickness,.6*c.noseHeight),body=c.inner+Math.min(c.baseWidth*.4,1.25*inch);
 return ([[c.inner,0],[c.outer,0],[c.outer,base],[body,base],[body,top],[c.tip,top],[c.tip,c.noseHeight],[c.inner,c.noseHeight]] as [number,number][]).map(([x,z])=>[side*x,z]);
}

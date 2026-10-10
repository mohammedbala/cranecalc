import type {ProjectInput} from './types';
import type {RunwayDetails} from './runwayDetails';

const inch=25.4;
type Rail=RunwayDetails['rail'];

/** Values that earlier project files do not carry: a 1/4 in pad, 1/16 in keeper clearance and a 1/2 in anchor notch. */
export const railSeatDefaults={padThickness:.25*inch,clipClearance:inch/16,anchorNotch:.5*inch} as const;
/** Fit-up clearance between an anchor keeper and each end of its rail-base notch. */
export const anchorEndClearance=inch/16;

/**
 * The rail pad, when the project specifies one (aist.railPad): a continuous strip under the rail base,
 * centred on the rail, with its rated allowable compression and product basis.
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
/** The plate the keepers are welded to: the cap channel web or the W top flange. */
export const keeperSeatThickness=(p:ProjectInput)=>p.section.kind==='cap'?p.section.capTw:p.section.tf;

/**
 * Integral keeper in section, with offsets across the runway from the rail centreline (rail set on its
 * design line). The body stands on the girder `clearance` clear of the rail-base toe; the lip, `lip`
 * thick, projects `projection` past the body face and bears on the rail base over `overlap`. The body
 * height under the lip is the pad plus the rail base. Welds: a fillet on the outer face, full length, and
 * one across each end, stopped one weld size short of the rail-side face. The rail-side face is not
 * welded, so the keeper is welded after the rail is set and the clearance gap stays open.
 */
export function keeperGeometry(rail:Rail,pad=0){
 const length=rail.clipWidth,lip=rail.clipThickness,bodyWidth=rail.clipBodyWidth??rail.clipThickness,clearance=rail.clipClearance??railSeatDefaults.clipClearance;
 const projection=rail.clipProjection,overlap=projection-clearance,weld=rail.clipWeld;
 const toe=rail.baseWidth/2,inner=toe+clearance,outer=inner+bodyWidth,tip=inner-projection;
 const bodyHeight=pad+rail.baseThickness,height=bodyHeight+lip;
 return {length,lip,bodyWidth,clearance,projection,overlap,weld,endWeld:bodyWidth-weld,holdback:weld,toe,inner,outer,tip,bodyHeight,height,pad};
}
export type KeeperGeometry=ReturnType<typeof keeperGeometry>;

/**
 * Rail anchor: at mid-length of each rail piece both rail-base toes are notched `notch` deep and the
 * keeper pair there is set into the notches, 1/16 in clear of each notch end, so the rail bears on the
 * keeper ends longitudinally. The anchor keepers are the typical keeper moved toward the rail by the
 * notch depth; their end fillets stop 1/16 in outside the un-notched toe.
 */
export function anchorGeometry(rail:Rail,pad=0){
 const k=keeperGeometry(rail,pad),notch=rail.anchorNotch??railSeatDefaults.anchorNotch,engagement=notch-k.clearance;
 const endWeld=k.bodyWidth-Math.max(k.weld,engagement+anchorEndClearance);
 return {...k,notch,notchLength:k.length+2*anchorEndClearance,engagement,endWeld,inner:k.inner-notch,outer:k.outer-notch,tip:k.tip-notch};
}
export type AnchorGeometry=ReturnType<typeof anchorGeometry>;

/** Rail inputs with the optional pad, keeper and anchor values filled from their defaults, in input order. */
export function railInputsWithDefaults(rail:Rail):Rail{
 const {padThickness,padWidth,clipBodyWidth,clipClearance,anchorNotch,...rest}=rail,out:Record<string,unknown>={};
 for(const [key,value] of Object.entries(rest)){
  out[key]=value;
  if(key==='padSource')Object.assign(out,{padThickness:padThickness??railSeatDefaults.padThickness,padWidth:padWidth??rail.baseWidth});
  if(key==='clipThickness')out.clipBodyWidth=clipBodyWidth??rail.clipThickness;
  if(key==='clipWeld')Object.assign(out,{clipClearance:clipClearance??railSeatDefaults.clipClearance,anchorNotch:anchorNotch??railSeatDefaults.anchorNotch});
 }
 return out as Rail;
}
/** The keeper and anchor geometry of a project, with its pad. */
export function railSeat(p:ProjectInput){
 const r=p.details!.rail,pad=railPadThickness(p);
 return {pad:railPad(p),keeper:keeperGeometry(r,pad),anchor:anchorGeometry(r,pad)};
}

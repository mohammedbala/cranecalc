import {flangeTieGeometry,flangeTieFamily,stiffenerTieGeometry} from './tieGeometry';
import {girderEndFork} from './craneColumnInputs';
import {connectionOptionChecks} from './connectionOptions';
import {capAngleGeometry,capBoltNutEnvelope,type CapAngleBox} from './capAngle';
import {railLayout,railLayoutCriteria} from './railLayout';
import {latexNumber,withinLimit} from './math';
import {format} from './units';
import type {CheckResult,ProjectInput} from './types';

/** Group of the model coordination checks: clashes and layout conflicts that block fabrication until resolved. */
export const coordinationGroup='Coordination';
const inch=25.4;
/**
 * Clear distance kept between parts of different shop assemblies that meet in the field: 1/16 in location tolerance on
 * each part (AISC 303-16 §6.4 order of magnitude for attachments), so 1/8 in in all. A CraneCalc project allowance.
 */
export const coordinationAllowance=inch/8;

/** Signed clear distance between two axis-aligned boxes: the gap where they are apart, minus the overlap depth where they intersect. */
export function boxClearance(a:{min:number[];max:number[]},b:{min:number[];max:number[]}){
 const gaps=[0,1,2].map(i=>Math.max(a.min[i]-b.max[i],b.min[i]-a.max[i]));
 if(gaps.some(g=>g>0))return Math.hypot(...gaps.map(g=>Math.max(0,g)));
 return Math.max(...gaps);
}

const gridName=(p:ProjectInput,station:number)=>{let x=0;const grids=[0,...p.spans.map(s=>x+=s)];const i=grids.findIndex(g=>Math.abs(g-station)<1);return i>=0?`grid ${i+1}`:`station ${format(station,'length',p.units,3)}`;};

/**
 * A clearance record: met or not, never a ratio (a used-up clearance is not a D/C). A clash states the overlap, or the
 * clear distance and its shortfall, and the clearance required; an overlap is a geometry conflict (checkIntegrity.ts).
 */
function check(p:ProjectInput,id:string,title:string,required:number,clear:number,equation:string,note:string,referenceIds:string[]):CheckResult{
 const pass=withinLimit(required,clear),len=(v:number)=>format(v,'length',p.units,3);
 const lead=clear<0?`Invalid geometry: clear distance = −${len(-clear)}: the parts overlap by ${len(-clear)}; ${len(required)} clear required. `:pass?'':`Clear ${len(clear)} against ${len(required)} required: short by ${len(required-clear)}. `;
 return {id,group:coordinationGroup,title,status:pass?'pass':'fail',demand:required,capacity:clear,quantity:'length',equation,...(clear<0?{geometry:true}:{}),
  substitution:`${latexNumber(required)}\\le${latexNumber(clear)}`,note:lead+(pass?'':`${openItemLead} `)+note,referenceIds};
}
const openItemLead='OPEN ITEM: CONNECTION LAYOUT REQUIRES REDESIGN; do not fabricate this arrangement.';

/**
 * Cap tieback angle: the cap bolt nuts, their washers and the bolt ends inside the girder against the girder's
 * bearing stiffeners (plates and their fillets) at every tie, and the two ties of adjacent girders at a shared column.
 */
function capAngleCoordination(p:ProjectInput):CheckResult[]{
 const g=capAngleGeometry(p),d=p.details;if(!g||!d)return [];
 const s=p.section,bs=d.bearing,u=p.units,len=(v:number)=>format(v,'length',u,3),out:CheckResult[]=[];
 // Stiffener envelope in tie coordinates (x along the runway from the tie centerline, y from the web centerline,
 // z down from the top of the cap): the plate between the W flanges with its fillets on both faces, from the web out
 // to its outstand; one pair at the center of each girder bearing (the side toward the column is the one that matters).
 const zTop=-(s.capTw+s.tf),zBot=-(s.capTw+s.d-s.tf),half=bs.stiffenerThickness/2+bs.weldSize;
 const nuts=capBoltNutEnvelope(g);
 let worst:{clear:number;grid:string;end:string;bay:number;part:string;dx:number}|undefined;
 for(const st of g.stations){
  const xs=st.bearingCenter-st.x,stiff={min:[xs-half,s.tw/2,zBot],max:[xs+half,s.tw/2+bs.stiffenerWidth,zTop]};
  for(const n of nuts)for(const part of n.parts){
   const clear=boxClearance(part,stiff);
   if(!worst||clear<worst.clear)worst={clear,grid:gridName(p,st.station),end:st.end,bay:st.bay,part:part.name,dx:Math.abs(xs-n.x)};
  }
 }
 if(worst){
  const nut=nuts[0].parts,seat=g.cap.seat,stiffOut=s.tw/2+bs.stiffenerWidth,nutEnd=Math.min(...nut.map((b:CapAngleBox)=>b.min[1]));
  out.push(check(p,'coord-cap-tie-stiffener','Cap tie bolt hardware clear of the girder bearing stiffeners',coordinationAllowance,worst.clear,
   'c\\ge1/8\\,\\mathrm{in}\\ \\ \\text{(tie nut, washer, bolt end to stiffener weld)}',
   `${worst.clear<0?`Interference ${len(-worst.clear)}`:`Clear ${len(worst.clear)}`} at the ${worst.end} end of bay ${worst.bay} (${worst.grid}), governing part: ${worst.part}. The cap bolts are ${len(g.cap.gauge)} below the top of the cap at ${len(g.cap.pitch)} pitch, the tie centered ${len(g.input.setback)} from each girder end; the bearing stiffener pair (${len(bs.stiffenerThickness)} plate, ${len(bs.weldSize)} fillets, outstand to ${len(stiffOut)} from the web centerline) is at the bearing center, ${len(worst.dx)} along the runway from the nearer cap bolt. Inside the channel the ${seat.washer.kind==='beveled'?'F436 1:6 beveled washer':'F436 washer'}, nut and bolt end reach ${len(nutEnd)} from the web centerline (channel flange ${len(seat.thickness)} thick at the bolt line). Required clear distance ${len(coordinationAllowance)}: 1/16 in location tolerance on each part.`,
   ['cap-angle-basis','aisc-connections']));
 }
 // Ties of two girder ends at one column: their end plates side by side on the same column flange.
 const shared=g.stations.filter(a=>g.stations.some(b=>b!==a&&Math.abs(b.station-a.station)<1e-6));
 if(shared.length){
  const gap=Math.min(...shared.map(a=>Math.abs(a.offset)))*2-g.endPlate.width;
  const at=shared.reduce((a,v)=>Math.abs(v.offset)<Math.abs(a.offset)?v:a,shared[0]);
  out.push(check(p,'coord-cap-tie-adjacent','Adjacent cap ties at a shared column clear of each other',coordinationAllowance,gap,'2e_x-b_{ep}\\ge1/8\\,\\mathrm{in}',
   `The end plates (${len(g.endPlate.width)} wide) of the two girder ends at ${gridName(p,at.station)} are centered ${len(Math.abs(at.offset))} each side of the column centerline: clear ${len(gap)} between them.`,['cap-angle-basis','aisc-connections']));
 }
 return out;
}

/** Ties of the direct flange-tie family and the generic tie template, against the girder bearing stiffeners. */
function flangeTieCoordination(p:ProjectInput):CheckResult[]{
 const d=p.details,b=d?.bracket;if(!d||p.system!=='simple'||!b?.enabled||!flangeTieFamily(d))return [];
 const len=(v:number)=>format(v,'length',p.units,3),layout=flangeTieGeometry(p);
 if(layout){
  const a=layout.attachment,need=a.saddleLength/2+a.weldSize+d.bearing.stiffenerThickness/2+d.bearing.weldSize;
  return [check(p,'coord-tie-saddle','Flange saddle weld envelope clear of the bearing stiffener',need+a.clearance,a.longitudinalSetback,'s\\ge L_s/2+w_s+t_{st}/2+w_{st}+c',
   `The flange saddle (${len(a.saddleLength)} long, ${len(a.weldSize)} end fillets) is set back ${len(a.longitudinalSetback)} from the bearing stiffener (${len(d.bearing.stiffenerThickness)} plate, ${len(d.bearing.weldSize)} fillets); with the ${len(a.clearance)} clearance it needs ${len(need+a.clearance)} at every girder end. Increase the tie setback and recheck its end region where short.`,['flange-saddle-mechanics','aisc-connections'])];
 }
 // Girder-side bolt rows of the tie, across the runway from the web centerline, against the zone of the bearing
 // stiffeners and their fillets each side of the web.
 const c=d.brace.connection,start=b.reach-d.brace.length,zone=p.section.tw/2+d.bearing.stiffenerWidth+d.bearing.weldSize;
 const rows=Array.from({length:c.rows},(_,i)=>start+c.edge+i*c.pitch);
 const clear=Math.min(...rows.map(z=>Math.max(z-c.diameter-zone,-zone-(z+c.diameter))));
 return [check(p,'coord-tie-stiffener','Tie girder-side bolt hardware clear of the bearing stiffeners',0,clear,'\\min_i\\big(|y_i|-d_b-y_{st}\\big)\\ge0',
  `The tie (${len(d.brace.length)} long, column face ${len(b.reach)} from the web centerline) places its girder-side bolt rows ${rows.map(len).join(', ')} from the web centerline; with the hardware taken d_b each side of a bolt they must stay outside the bearing-stiffener zone, ${len(zone)} each side of the web centerline (outstand ${len(d.bearing.stiffenerWidth)} plus ${len(d.bearing.weldSize)} fillets): ${clear<0?`interference ${len(-clear)}`:`clear ${len(clear)}`}. Run the hardware clash scan for individual conflicts.`,['connection-options','aisc-connections'])];
}

/**
 * Rail joints kept clear of the girder joints and staggered across the runway: the layout keeps each joint 2 ft clear
 * of every girder joint and of the joints of the opposite rail at every wheel spacing of a crane (AIST TR-13 §5.16.1:
 * joints staggered across the runway). A joint that cannot be placed so is an open item.
 */
function railJointCoordination(p:ProjectInput):CheckResult[]{
 if(!p.details)return [];
 const layout=railLayout(p),len=(v:number)=>format(v,'length',p.units,3);
 const joints=layout.rails.flatMap(r=>r.joints.map(j=>({side:r.side,j})));if(!joints.length)return [];
 const opposite=(side:'A'|'B')=>layout.rails.find(r=>r.side!==side)!.joints;
 const clearOf=(x:number,side:'A'|'B')=>Math.min(...layout.girderJoints.map(g=>Math.abs(x-g)),...opposite(side).flatMap(o=>layout.wheelSteps.map(w=>Math.abs(Math.abs(x-o)-w))),Infinity);
 const worst=joints.map(v=>({...v,clear:clearOf(v.j,v.side)})).reduce((a,v)=>v.clear<a.clear?v:a);
 const r=check(p,'coord-rail-joints','Rail joints staggered and clear of girder joints',railLayoutCriteria.clear,worst.clear,'|x_j-x_g|,\\ \\big||x_j-x_j^{\\prime}|-s\\big|\\ge2\\,\\mathrm{ft}',
  `${joints.length} rail joints on the two runways. The closest is on rail ${worst.side} at ${len(worst.j)} from grid 1, ${len(worst.clear)} from the nearest girder joint or opposite-rail joint at a crane wheel spacing.${layout.conflicts.length?` Joints that could not be placed clear: ${layout.conflicts.map(len).join(', ')}.`:''} AIST TR-13 §5.16.1: joints staggered across the runway so the wheels of one end truck do not cross both rails' joints together; rail pieces are cut from ${len(railLayoutCriteria.stock)} mill lengths, none shorter than ${len(railLayoutCriteria.minPiece)}.`,['tr13-rail-joints']);
 return [r];
}

/** Model coordination checks: clashes and layout conflicts, status 'fail' (an open item) while unresolved. */
export function coordinationChecks(p:ProjectInput):CheckResult[]{
 if(connectionOptionChecks(p).length||!p.details)return [];
 return [...capAngleCoordination(p),...flangeTieCoordination(p),...stiffenerGussetCoordination(p),...railJointCoordination(p)];
}
/**
 * Paired bars on the bearing stiffeners of simple spans: each girder end's tie has its column gusset on the receiving
 * column flange at the bearing center's offset from the grid, so the gusset with its root fillets must lie on the flange,
 * |x| + t_g/2 + w ≤ b_f/2. Where it does not (long bearings, a narrow column flange), the worst station; else undefined.
 */
export function stiffenerGussetMisfit(p:ProjectInput){
 const st=girderEndFork(p)?undefined:stiffenerTieGeometry(p),b=p.details?.brace;
 if(!st||!b||p.system!=='simple'||!st.receiver)return undefined;
 const offset=Math.max(...st.stations.map(v=>Math.abs(v.offset))),required=offset+b.gussetThickness/2+b.connection.weldSize,clear=st.receiver.width/2;
 return required>clear+1e-6?{offset,required,clear,width:st.receiver.width}:undefined;
}
/** The column tie gussets at the bearing stiffeners off the receiving column flange: an open clash item (listed only when it fails). */
function stiffenerGussetCoordination(p:ProjectInput):CheckResult[]{
 const m=stiffenerGussetMisfit(p);if(!m)return [];
 const len=(v:number)=>format(v,'length',p.units,3);
 return [check(p,'coord-tie-gusset-flange','Column tie gussets · on the receiving column flange',m.required,m.clear,'|x|+t_g/2+w\le b_f/2',
  `Each girder end's tie bolts to its bearing stiffener, its column gusset welded to the receiving column flange at the bearing center, ${len(m.offset)} from the grid: with half the gusset and its root fillet it reaches ${len(m.required)} from the column centerline, past the ${len(m.width)} flange's half width. Shorten the bearings or the girder end gap, widen the column flange, or tie the girder ends another way.`,['mechanics'])];
}

/**
 * Open coordination items, one sentence each, from the failing coordination checks: the report, viewer and export
 * strip show these. Derived from coordinationChecks so the text and the check never disagree.
 */
export function connectionCoordination(p:ProjectInput):string[]{
 return coordinationChecks(p).filter(c=>c.status==='fail').map(c=>`${c.title}: ${c.note.replace(`${openItemLead} `,'')}`);
}

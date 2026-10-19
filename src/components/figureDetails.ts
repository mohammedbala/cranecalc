import {deflectionCriteria} from '../engine/aistChecks';
import {effectiveBuildingClass} from '../engine/buildingClass';
import type {ProjectInput} from '../engine/types';
import {format} from '../engine/units';
import {drawingLength,plateInches,dimensionLength} from './drawingFormat';
import {ribGeometry} from '../engine/bracketRib';
import {rolledStub} from '../engine/rolledBracketInputs';
import {haunchGeometry} from '../engine/taperedHaunchInputs';
import {existingBracketLabel} from '../engine/bracketProfiles';
import {stepGeometry} from '../engine/steppedColumn';
import {activeEndBearing} from '../engine/endBearingInputs';
import {activeColumnCap} from '../engine/columnCapInputs';
import {capAngleGeometry} from '../engine/capAngle';
import {activeEndStop} from '../engine/endStopInputs';
import {railJointDetail,supplierRailJoint} from '../engine/railLayout';
import {activeSplices,spliceStations} from '../engine/spliceInputs';

/**
 * The specified detail of each runway component, in words, from the project inputs: what a figure or a summary
 * row refers to. Sizes print as on the drawings (fractions of an inch, or mm).
 */
export type Component='girder'|'splice'|'rail'|'bearing'|'tie'|'support'|'column'|'base'|'bracing'|'end-stop'|'crane'|'criteria'|'duty'|'limits';

const plate=(p:ProjectInput,...v:number[])=>`PL ${v.map(x=>plateInches(x,p.units)).join(' × ')}`;
const len=(p:ProjectInput,v:number)=>dimensionLength(v,p.units);
const bolt=(p:ProjectInput,d:number,grade:string)=>`${plateInches(d,p.units)} ${grade}`;
const fillet=(p:ProjectInput,w:number)=>`${plateInches(w,p.units)} fillets`;

function girder(p:ProjectInput){
 const spans=[...new Set(p.spans.map(v=>len(p,v)))];
 return `${p.section.name}, Fy ${format(p.section.Fy,'stress',p.units,0)}; ${p.spans.length} ${p.system==='continuous'?'continuous':'simple'} span${p.spans.length>1?'s':''} of ${spans.join(' / ')}`;
}
function rail(p:ProjectInput){
 const r=p.details?.rail;if(!r)return `Rail ${format(p.railWeight,'lineLoad',p.units,2)}, head ${len(p,p.railHeight)} above the flange`;
 return `${r.name.split(' · ')[0]}; ${r.clip?`${r.clip.type} rail clips per manufacturer, base welds ${fillet(p,r.clip.weld)}`:'rail clips per manufacturer'}${(()=>{const j=railJointDetail(p);return j==='none'?'; one-piece rail, no joints':j==='welded'?'; welded rail joints by the rail supplier':supplierRailJoint(p)?'; rail joint bars and bolts by the rail supplier (deferred submittal)':`; joint bars 2-${plate(p,r.jointPlateThickness,r.jointPlateHeight)}, ${plateInches(r.jointBoltDiameter,p.units)} bolts`;})()}`;
}
function bearing(p:ProjectInput){
 const d=p.details;if(!d)return 'Girder bearing on its support';
 const b=d.bearing,eb=activeEndBearing(p);
 return `Bearing ${plate(p,b.thickness,b.width,b.length)}; stiffeners 2-${plate(p,b.stiffenerThickness,b.stiffenerWidth)}, ${fillet(p,b.weldSize)}`+
  (eb?`; 4-${bolt(p,eb.bolts.diameter,eb.bolts.grade)} bolts each end (locating slip-critical, sliding ${eb.sliding==='snug-tight'?'snug-tight':'sleeved'} in slots)`:'');
}
function tie(p:ProjectInput){
 const d=p.details;if(!d)return 'Lateral restraint at each support';
 const t=d.brace,c=t.connection,kind=t.arrangement??'paired-bars',bolts=`${c.rows*2}-${bolt(p,c.diameter,c.grade)} bolts`;
 const saddle=t.flangeAttachment?.enabled?`; saddle ${plate(p,t.flangeAttachment.saddleThickness,t.flangeAttachment.saddleLength)} welded to the flange, ${fillet(p,t.flangeAttachment.weldSize)}`:'';
 const release=t.release?.enabled?`; column end sleeved in vertical slots${t.release.slide&&kind==='paired-bars'?`, sliding ${plateInches(t.release.slide,p.units)} each way along the runway`:''}`:'';
 const flanges=activeEndBearing(p)?'top flange':'each flange';
 if(kind==='flexible-plate')return `Flexible ${plate(p,t.thickness,t.width,t.length)} at the ${flanges}, single shear; gusset PL ${plateInches(t.gussetThickness,p.units)}${saddle}${release}`;
 if(kind==='cap-angle'){const g=capAngleGeometry(p);if(!g)return 'Cap tieback angle at the top flange';
  return `${g.input.shape} × ${plateInches(g.input.length,p.units)} cap angle with 2-${bolt(p,g.cap.diameter,g.cap.grade)} bolts in ${g.cap.sleeved?'sleeved ':''}horizontal slots; tie ${plate(p,g.plate.thickness,g.plate.width,g.plate.length)} with 2-${bolt(p,g.lap.diameter,g.lap.grade)} slip-critical bolts; end ${plate(p,g.endPlate.thickness,g.endPlate.width,g.endPlate.height)}, ${fillet(p,g.weld)} both faces; 2-${bolt(p,g.column.diameter,g.column.grade)} bolts through shims to the column flange (field-drilled)`;}
 if(kind==='single-angle'||kind==='double-angle'){const a=kind==='single-angle'?t.singleAngle:t.doubleAngle;return `${kind==='double-angle'?'2-':''}${a?.shape??'L'} tie${a?.connectionStyle==='top-flange-angle'?' at the top flange':''}`;}
 if(kind==='bearing-link'||kind==='paired-links')return `${kind==='paired-links'?'Paired articulated links':'Articulated bearing link'} (supplier design)`;
 return `2-${plate(p,t.thickness,t.width,t.length)} bars at the ${flanges}, gusset PL ${plateInches(t.gussetThickness,p.units)}, ${bolts}${saddle}${release}`;
}
function support(p:ProjectInput){
 const cap=activeColumnCap(p);
 if(cap)return `Column cap ${plate(p,cap.plate.thickness,cap.plate.width,cap.plate.length)}, ${plateInches(cap.weld,p.units)} fillet all around; cap stiffeners PL ${plateInches(cap.stiffener.thickness,p.units)}`;
 const st=stepGeometry(p);if(st)return `Girder on the existing step cap ${plate(p,st.cap.thickness,st.cap.width,st.cap.length)} over the lower shaft's crane-side flange, web ${len(p,st.girderWeb)} from the lower centroid${st.stiffener?`; step stiffeners 2-PL ${plateInches(st.stiffener.thickness,p.units)} × ${plateInches(st.stiffener.width,p.units)}`:''}`;
 const b=p.details?.bracket;if(!b?.enabled)return 'Girder seat by others (support reactions are reported for its design)';
 const kind=b.arrangement??'twin-rib';
 if(kind==='existing-corbel'||kind==='existing-w-corbel')return `Existing ${existingBracketLabel(b).toLowerCase()} with new seat ${plate(p,b.seatThickness,b.seatProjection,b.seatLength)}`;
 if(kind==='rolled-corbel'){const st=rolledStub(b);return st?`${st.name} stub ${len(p,st.L)} long welded to the column flange${st.seat?`, seat ${plate(p,st.seat.t,st.seat.length)}`:''}${st.stiffener?`, stiffeners 2-PL ${plateInches(st.stiffener.t,p.units)}`:''}`:'Wide-flange stub bracket';}
 if(kind==='tapered-haunch'){const h=haunchGeometry(b,p.details!.bearing.width);return `Tapered I haunch ${len(p,h.L)} long, ${len(p,h.hr)} to ${len(p,h.ht)} deep: web PL ${plateInches(h.tw,p.units)}, top flange ${plate(p,h.tt,h.bt)}, bottom flange ${plate(p,h.tb,h.bb)}, ${h.stiffener.wing?'wing stiffeners':'stiffeners'} 2-PL ${plateInches(h.stiffener.t,p.units)}; flanges ${h.joint==='cjp'?'CJP':`${fillet(p,h.flangeWeld)}`} and web ${fillet(p,h.webWeld)} to the column`;}
 const g=ribGeometry(b);
 return `${g.tapered?'Haunched':'Twin-rib'} bracket: 2 ribs PL ${plateInches(b.ribThickness,p.units)} × ${g.tapered?`${len(p,g.root)} to ${len(p,g.tip)}`:len(p,b.ribDepth)} at ${len(p,b.ribSpacing)}; seat ${plate(p,b.seatThickness,b.seatProjection,b.seatLength)}; root ${fillet(p,b.rootWeld)}`;
}
function column(p:ProjectInput){
 const c=p.existingColumn;if(!c?.enabled)return 'Supporting column by others';
 const st=stepGeometry(p);if(st)return `Existing stepped column: lower ${st.lower.shape||'shaft'} base to step ${len(p,c.seatElevation)}, upper ${st.upper.shape||'shaft'} to the top ${len(p,c.height)}, Fy ${format(c.Fy,'stress',p.units,0)}`;
 return `${c.isNew?'New':'Existing'} ${c.shape||'column'}, Fy ${format(c.Fy,'stress',p.units,0)}, ${len(p,c.height)} base to top support`;
}
function base(p:ProjectInput){
 const b=p.columnBase;if(!b?.enabled)return 'Existing foundation by others';
 const a=b.anchors,f=b.footing;
 return `Base ${plate(p,b.plate.thickness,b.plate.N,b.plate.B)}; ${2*a.perRow}-${bolt(p,a.diameter,a.grade)} rods, ${len(p,a.embedment)} embedment; footing ${len(p,f.L)} × ${len(p,f.B)} × ${len(p,f.thickness)}`;
}
function bracing(p:ProjectInput){
 const b=p.longitudinalBracing;if(!b?.enabled)return 'Longitudinal force to the building bracing (by others)';
 const member=b.system==='rod-x'?`${plateInches(b.rod.diameter,p.units)} rod X`:`${b.angle.shape} ${b.system==='angle-x'?'X':'single diagonal'}`;
 return `${member} bracing, ${b.bays} braced bay${b.bays>1?'s':''}, ${b.tiers} tier${b.tiers>1?'s':''}`;
}
function endStop(p:ProjectInput){
 const s=activeEndStop(p);if(!s)return 'Crane stops by others';
 return `Bolted stop: base ${plate(p,s.base.thickness,s.base.width,s.base.length)}, face PL ${plateInches(s.face.thickness,p.units)}, stiffeners PL ${plateInches(s.stiffener.thickness,p.units)}, ${bolt(p,s.bolts.diameter,s.bolts.grade)} bolts`;
}
/** Girder field splices: where they are, the bolts and the plates; or the one-piece girder. */
function splice(p:ProjectInput){
 const sp=activeSplices(p),n=sp&&p.details?spliceStations(p).length:0,len=(v:number)=>drawingLength(v,p.units),L=p.spans.reduce((a,b)=>a+b,0);
 if(!sp||!n)return `No field splice: each girder furnished in one piece, ${len(p.system==='continuous'?L:Math.max(...p.spans))} long`;
 const t=(v:number)=>plateInches(v,p.units);
 return `${n} bolted slip-critical field splice${n>1?'s':''} per runway, ${bolt(p,sp.diameter,sp.grade)} bolts, Class ${sp.surface}; top flange ${2*sp.top.rows*sp.top.lines} bolts each side on inner PL ${t(sp.top.innerThickness)}, bottom flange ${2*sp.bottom.rows*sp.bottom.lines}${sp.bottom.plates!=='inner'?` on outer PL ${t(sp.bottom.outerThickness)}`:''}${sp.bottom.plates!=='outer'?` and inner PL ${t(sp.bottom.innerThickness)}`:''}, web ${sp.web.rows*sp.web.columns} on 2 PL ${t(sp.web.thickness)}`;
}
function crane(p:ProjectInput){
 return p.cranes.map(c=>{const max=Math.max(...c.wheels.map(w=>w.loaded));return `${c.name}: ${c.wheels.length} wheels per runway; per wheel ${format(max,'force',p.units,1)} maximum, ${format(Math.max(...c.wheels.map(w=>w.lateral)),'force',p.units,2)} side thrust`;}).join('; ');
}
/** Fatigue duty: the building class and the design cycle count. */
const duty=(p:ProjectInput)=>`Class ${p.aist?effectiveBuildingClass(p):'-'}, ${p.fatigue.cycles.toLocaleString()} cycles`;
/** Deflection limits: vertical and rail-head lateral. */
const limits=(p:ProjectInput)=>`Vertical L/${p.aist?deflectionCriteria(p).nv:p.verticalLimit}, lateral L/${p.details?.criteria.railLateralLimit??p.lateralLimit}`;
function criteria(p:ProjectInput){return `${duty(p)}; ${limits(p).replace(/^V/,'v')}`;}
export function componentDetail(kind:Component,p:ProjectInput):string{
 switch(kind){
  case 'girder':return girder(p);case 'splice':return splice(p);case 'rail':return rail(p);case 'bearing':return bearing(p);case 'tie':return tie(p);
  case 'support':return support(p);case 'column':return column(p);case 'base':return base(p);case 'bracing':return bracing(p);
  case 'end-stop':return endStop(p);case 'crane':return crane(p);case 'criteria':return criteria(p);case 'duty':return duty(p);case 'limits':return limits(p);
 }
}

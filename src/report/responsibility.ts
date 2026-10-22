import type {CalculationSnapshot,CheckResult,ProjectInput} from '../engine/types';
import {activeEndBearing} from '../engine/endBearingInputs';
import {activeEndStop} from '../engine/endStopInputs';
import {activeColumnCap} from '../engine/columnCapInputs';
import {activeStep} from '../engine/steppedColumnInputs';
import {stepGeometry} from '../engine/steppedColumn';
import {usesExistingBracket} from '../engine/existingBracket';
import {usesTaperedHaunch} from '../engine/taperedHaunch';
import {usesRolledBracket} from '../engine/rolledBracket';
import {columnStiffenerGeometry} from '../engine/columnStiffeners';
import {capAngleGeometry} from '../engine/capAngle';
import {simpleSupportInput} from '../engine/simpleSupports';
import type {Taxonomy} from '../engine/checkTaxonomy';
import {deliveredForces,girderTieColumnScope} from '../engine/forcesDelivered';
import {runwayMass,runwaySeismicBound} from '../engine/columnSupport';
import {drawingElevation} from '../components/drawingFormat';
import {caseLabel,sig3,tidyNumbers} from './reportParts';
import {supplierRailJointText} from '../engine/railChecks';
import {tiedToBuilding} from '../engine/craneColumnInputs';

/**
 * The responsibility matrix (M10): every item this package needs from others, what is needed, the acceptance
 * criterion, the force and location delivered to it, and who is responsible. Rows come from the checks the
 * calculation leaves to others (status excluded, by-others type) and from the project-level confirmations a runway
 * package rests on (crane data, rail, opposite runway, the surveyed column, the load test).
 */
export interface ResponsibilityRow {item:string;needed:string;criterion:string;forces:string;party:string;check?:CheckResult}
const EOR='Building engineer of record';
const esc=(v:unknown)=>caseLabel(tidyNumbers(String(v??''))).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** An item name as a heading: separators as commas, "and" for "&". */
const itemName=(v:string)=>v.replace(/\s*&\s*/g,' and ').replace(/\s+·\s+/g,', ');
const sentences=(v:string)=>v.split(/(?<=[.;])\s+(?=[A-Z])/).map(t=>t.trim()).filter(Boolean);
const list=(v:number[])=>v.length>2?`${v.slice(0,-1).join(', ')} and ${v.at(-1)}`:v.join(' and ');
const gridList=(v:number[])=>v.length?`grid${v.length>1?'s':''} ${v.length>2&&v.every((g,i)=>!i||g===v[i-1]+1)?`${v[0]}–${v.at(-1)}`:list(v)}`:'';
/** The parts of one runway as this project builds them: girders, bearings, the support parts it designs, ties and end stops. */
export function runwayParts(p:ProjectInput){
 const b=p.details?.bracket,out=['girders',activeEndBearing(p)?'bolted end bearings':'bearings'];
 if(activeColumnCap(p))out.push('column caps');
 else if(b?.enabled)out.push(usesExistingBracket(p)?'new seats on the existing brackets':usesTaperedHaunch(p)?'haunches':usesRolledBracket(p)?'W-stub brackets':'brackets');
 if(columnStiffenerGeometry(p))out.push('column stiffeners');
 if(stepGeometry(p)?.stiffener)out.push('step stiffeners');
 if(!activeColumnCap(p)||tiedToBuilding(p))out.push(capAngleGeometry(p)?'cap tiebacks':'ties');
 // A crane column tied to the building column: its column tie (craneColumn.ts).
 if(tiedToBuilding(p))out.push('column ties');
 if(activeEndStop(p))out.push('end stops');
 return `${out.slice(0,-1).join(', ')} and ${out.at(-1)}`;
}

export function responsibilityMatrix(tax:Taxonomy,s:CalculationSnapshot):ResponsibilityRow[]{
 const p=s.input,u=p.units,f=(v:number|undefined)=>sig3(v,'force',u),len=(v:number|undefined)=>sig3(v,'length',u),m=(v:number|undefined)=>sig3(v,'moment',u);
 const dl=deliveredForces(s),z=s.existingColumn?.support,col=p.existingColumn;
 const el=(v?:number)=>v===undefined?'':` El. ${drawingElevation(v,u)}`;
 // V with its eccentricity and moment as the forces-delivered table states them: from the column centerline, from the
 // column face where the seat is by others, or to be taken from the surveyed seat where neither is known.
 const vAt=!dl?'':dl.e===undefined?'V on the seat with Mx = V·e, e from the surveyed seat position (not established here)':dl.eFrom==='face'?`V at e = ${len(dl.e)} from the column face, Mx = V·e at the face plus V times half the column depth at its centerline`:`V at e = ${len(dl.e)} from the column centerline with Mx = V·e`;
 const tieAt=dl?`lateral at the tie line${el(dl.elevation?.tie)}${dl.elevation?.tieBars!==undefined?`, entering the column at the tie centerline${el(dl.elevation.tieBars)}`:''}, up to the tie design force ${f(dl.tie.design)}`:'';
 const where=dl?`per-grid concurrent sets, section @@ref:interfaces@@ and S-00: ${vAt}, and the weak-axis seat moment My at the seat${el(dl.elevation?.seat)}; ${tieAt}; longitudinal at the seat on the girder line`:'section @@ref:interfaces@@';
 const longitudinal=dl&&(dl.stop||dl.traction)?`longitudinal at the seat on the girder line: ${dl.stop?`crane stop ${f(dl.stop)} at ${gridList(dl.stopGrids)}`:''}${dl.stop&&dl.traction?', ':''}${dl.traction?`traction ${f(dl.traction)} at ${gridList(dl.tractionGrids)}`:''} (factored)`:'';
 const rows:ResponsibilityRow[]=[];
 const byId=new Map(tax.byOthers.map(t=>[t.check.id,t.check]));
 const take=(id:string,row:Omit<ResponsibilityRow,'check'>)=>{const c=byId.get(id);if(!c)return;byId.delete(id);rows.push({...row,check:c});};
 const sup=byId.get('supporting-structure');
 // The column member is checked here only where the project models it; otherwise it is part of what is needed.
 const columnText=col?.enabled?activeStep(p)?'the existing stepped column, both shafts and the step, is checked in sections @@ref:column@@ to @@ref:step@@ (braced frame assumed)':`the ${col.isNew?'new':'existing'} column member is checked in section @@ref:column@@${col.isNew?'':' (braced frame assumed)'}`:'the columns themselves are not checked in this package: check them for the forces delivered, with the reaction eccentricity and its moment';
 if(sup)take('supporting-structure',{item:sup.title,needed:`Check the building frame, roof and wall framing, the column-to-foundation connections, anchors and foundations for the crane forces combined with the building loads; ${columnText}.`,
  criterion:'AISC 360-16 and ACI 318 strength under the ASCE 7-16 §2.3 combinations, crane loads as L (§4.9); IEBC alteration provisions.',forces:`Factored ${where}. Unfactored reactions by load type: section @@ref:reactions@@.`,party:EOR});
 take('column-frame',{item:'Existing column · frame type and second-order effects',needed:`Confirm that the column line is braced (non-sway) across the runway, or give the frame's B2 from its analysis. The existing column check (section @@ref:column@@) is conditional on a braced frame: ${col?`${col.strong.base} base, ${col.strong.top} top, B1 only`:'B1 only'}.`,
  criterion:'AISC 360-16 Chapter C and Appendix 8 (B2 for a sway frame); repeat the H1 check with B2.',forces:'Column check combinations and moments, section @@ref:column@@.',party:EOR});
 take('column-drift-wind',{item:'Existing column · drift under the 10-year wind (TR-13 §5.3)',needed:'Frame displacement at the top of the crane girder under the 10-year wind, from the frame analysis.',
  criterion:`AIST TR-13 §5.3: H/400 or 2 in, whichever is less${z?`; H = ${len(z.girderTop)} (column base to the top of the girder), limit ${len(z.driftLimit)}`:''}.`,forces:'—',party:EOR});
 const gauge=byId.get('column-rail-gauge');
 if(gauge)take('column-rail-gauge',{item:gauge.title,needed:'Outward displacement of each column at the rail under D and under the roof snow (snow reduced 50% if ≤ 30 psf, else 25%), from the frame analysis.',
  criterion:'AIST TR-13 §5.3: gauge change +1 in / −1/2 in.',forces:z?`Column alone, runway dead load plus static crane: ${z.gauge.crane>=0?'+':'−'}${len(Math.abs(z.gauge.crane))} (${Math.round(100*Math.abs(z.gauge.crane)/(z.gauge.crane>=0?25.4:12.7))}% of the limit). Frame spread: by others.`:'—',party:EOR});
 const mass=col?.enabled&&!col.isNew?runwayMass(p,!!col.siteSeismic?.liftedLoadSecured):undefined,weight=mass?`Seismic weight added at the runway level ${f(mass.total)}: ${f(mass.runways)} of new steel for the two runways (girders, rails, clips and joint bars, bearings, end stops, cap tiebacks and support steel, the takeoff in section @@ref:combinations@@), the crane ${f(mass.crane)}.`:'—';
 const sb=s.supportReactions?runwaySeismicBound(p,s.supportReactions):undefined;
 take('building-seismic-runway',{item:'Runway seismic · seismic design category, TR-13 combinations 5a and 7a',needed:`SDS, the seismic design category, Ie and the existing lateral system's R with their source, or a record that seismic design of the runway is not required at the site (ASCE 7 §1.4.2 for SDC A).${sb?` Confirm Cs ≤ ${sb.across.toFixed(2)} across and ≤ ${sb.along.toFixed(2)} along the runway, or have the runway's seismic forces checked.`:''}`,
  criterion:`ASCE 7-16 Chapter 12; AIST TR-13 §3.10 combinations 5a and 7a on the girder, bearings, ties and bracket.${sb?` The members and connections checked here carry the runway's own seismic forces up to Cs = ${sb.across.toFixed(2)} across (the side thrust at each grid, ${p.method==='LRFD'?'factored 1.6 against 1.0E':'against 0.7E'}, over its dead and empty-crane reaction) and ${sb.along.toFixed(2)} along (the traction at a locating bearing over the longest bay and the empty crane): the crane forces act at the rail head, above the masses, so they also bound the tie and torsion effects.`:''}`,forces:weight,party:`${EOR} (site seismic data)`});
 take('building-seismic-alteration',{item:'Existing lateral system · alteration evaluation (IEBC)',needed:'Evaluate the existing lateral force-resisting system for the added runway mass and crane forces.',
  criterion:'IEBC §503.4 / §805.3: demand-capacity ratio of existing lateral elements not more than 10% above that without the alteration (verify against the adopted edition).',forces:rows.some(r=>r.forces===weight)&&weight!=='—'?'Seismic weight as above.':weight,party:EOR});
 take('brace-drift-wind',{item:'Longitudinal bracing · displacement under the 10-year wind',needed:'Crane-level displacement of the braced line along the runway under the 10-year wind.',
  criterion:'AIST TR-13 §5.5: H/400 or 2 in, whichever is less.',forces:'—',party:EOR});
 // The crane-level strut the existing-column check relies on: its location, stiffness and forces.
 const cls=byId.get('crane-level-strut');
 if(cls)take('crane-level-strut',{item:cls.title,needed:`${sentences(cls.note.replace(/^Not checked here:\s*/,'')).slice(0,1).join(' ').replace(/^./,c=>c.toUpperCase()).replace(/\.$/,'')}; the existing column check relies on it.`,
  criterion:`AISC 360-16 strength for the line force; on the girder line, an axial stiffness at each seat at least ${z?.strut?.ratio??10} times the column's own (the column check keeps 1/${(z?.strut?.ratio??10)+1} of the force).`,
  forces:[longitudinal&&longitudinal.charAt(0).toUpperCase()+longitudinal.slice(1)+'.',...sentences(cls.note).filter(x=>/\d\s*(kip|kN)/.test(x))].filter(Boolean).join(' ')||'See section @@ref:interfaces@@.',party:EOR});
 const strut=byId.get('brace-by-others')??byId.get('column-longitudinal');
 if(strut){const force=sentences(strut.note).find(x=>/\d\s*(kip|kN)\b/.test(x));
  const designed=!!s.existingColumn?.support?.strut?.designed;
  if(designed)take(strut.id,{item:'Existing braced bay · receives the new crane-level strut force at the girder line',
   needed:'The crane-level strut on the girder line and its connections to every column are designed here. Confirm the existing braced bay takes the strut force delivered at the girder line: the bracing\'s connection to the strut (its top work point on the girder line, or a member in plan to it), the brace end connections, the braced-bay columns (with the torque of the force about their centerline where the bracing works on it), anchors and foundation.',
   criterion:'AISC 360-16 and ACI 318 strength for the delivered force; the bracing\'s crane-level stiffness as used in the twist checks (brace-drift).',forces:[longitudinal&&longitudinal.charAt(0).toUpperCase()+longitudinal.slice(1)+'.',force].filter(Boolean).join(' ')||'See section @@ref:interfaces@@.',party:EOR});
  else take(strut.id,{item:'Crane-level strut on the girder line, collector, brace connections, braced-bay columns and foundation',
   needed:`Design the crane-level strut at each locating column on the girder line${col?.longitudinalExit==='girder-strut'?' (the existing column check relies on it: the longitudinal force leaves the column at the seat with no column torsion or weak-axis bending)':''}, the collector to the braced bay, the brace end connections (gussets, clevises, bolts, welds), the braced-bay columns, anchors and foundation.`,
   criterion:'AISC 360-16 and ACI 318 strength; the strut stiff enough to hold the girder line at the seat.',forces:[longitudinal&&longitudinal.charAt(0).toUpperCase()+longitudinal.slice(1)+'.',force].filter(Boolean).join(' ')||'See section @@ref:interfaces@@.',party:EOR});}
 // A seat by others: the plan it must give the bearings (two plates and the joint gap at a shared grid), with the holes.
 const bs=p.details?.bearing,gap=p.system==='simple'?simpleSupportInput(p).endGap:0;
 if(bs&&byId.has('end-bearing-seat'))take('end-bearing-seat',{item:'Bracket seat by others: plan, holes and nut clearance',
  needed:`A seat at least ${len(p.system==='simple'?2*bs.length+gap:bs.length)} along the runway${p.system==='simple'?` at a shared grid (two bearing plates ${len(bs.length)} long and the ${len(gap)} joint gap; ${len(bs.length)} at a runway end)`:''} by ${len(bs.width)} across, with standard holes matching the bearing bolts and nut clearance below the seat; it carries the bolt forces reported here.`,
  criterion:'Seat plan position and elevation within ±1/8 in (AIST TR-13 §5.18); holes matching the bearing plate holes; seat strength and stiffness by the building engineer of record.',
  forces:`V, H seat and F per grid at the seat${el(dl?.elevation?.seat)}, section @@ref:interfaces@@.`,party:EOR});
 // The rail supplier's joint bars and bolts: one deferred-submittal row for all their checks, by the rail supplier.
 const jointText=supplierRailJointText(s),joint=[...byId.values()].filter(c=>/^rail-joint-/.test(c.id));
 if(jointText&&joint.length){for(const c of joint)byId.delete(c.id);
  rows.push({item:'Rail joint bars and bolts (deferred submittal)',needed:'Joint bars and bolts fitted to the rail fishing surfaces, with their holes in the rail web, designed by the rail supplier; the joint detail on the drawings is schematic.',
   criterion:'AISC 360-16 Chapter J (bolts, bars, block shear) and Appendix 3 fatigue of the bars and bolts at the stated range and cycles; tight joint, gap 1/16 in or less (AIST TR-13 §5.16.1).',forces:jointText.charAt(0).toUpperCase()+jointText.slice(1)+'.',party:'Rail supplier',check:joint[0]});}
 // Any other check left to others.
 for(const c of byId.values()){const rest=sentences(c.note.replace(/^Not checked here:\s*/,''))[0]??'';const force=sentences(c.note).find(x=>/\d\s*(kip|kN)\b/.test(x));
  rows.push({item:c.title,needed:rest.charAt(0).toUpperCase()+rest.slice(1),criterion:'As stated in the check (Appendix A).',forces:force?.trim()??'See section @@ref:interfaces@@.',party:EOR,check:c});}
 // A crane column tied to the building column (craneColumn.ts): the tie connections to the building column, its survey
 // and the footing coordination are needed from others.
 const cc=tiedToBuilding(p)?s.craneColumn:undefined;
 if(cc&&p.craneColumn){const k=p.craneColumn,g=cc.layout,dc=dl?.craneColumn,datum=(z:number)=>el((p.drawing?.datumElevation??0)+(p.columnBase?.enabled?p.columnBase.plate.thickness+p.columnBase.grout-p.columnBase.footing.soil:0)+z);
  const sc=girderTieColumnScope(s);
  rows.push({item:sc.flange?'Building column · web at the girder tie':'Building column · flange and web at the girder tie',needed:sc.flange?`Check each existing ${g.buildingColumn.shape} building column web at the girder tie for the local girder tie force${sc.stiffened?' the stiffeners deliver':' through its flange'} (${sc.designed}, the gusset or end plate with its welds or bolts, and the column tie's tab with its field welds and the column web under it, are designed in this calculation).`:`Check each existing ${g.buildingColumn.shape} building column flange and web for the local girder tie force at its column gusset or end plate (the gusset or end plate with its welds or bolts, and the column tie's tab with its field welds and the column web under it, are designed in this calculation).`,
   criterion:'AISC 360-16 J10 (or a yield-line flange model) for the girder tie design force in either direction.',
   forces:`Horizontal only, either direction: girder tie ${f(dl?.tie.design)} at${datum(g.girderTie.elevation)}, column tie ${f(dc?.columnTie)} at${datum(g.columnTie.elevation)} (per grid: S-00 and section @@ref:interfaces@@).`,party:EOR});
  rows.push({item:'Building column survey',needed:`Field-verify every building column beside the crane columns before fabrication: ${g.buildingColumn.shape}, plumb, its face ${len(g.girderTie.face)} from the girder web and ${len(g.gap)} clear of the crane column, the column top and base, and its footing (${k.building.source||'source not entered'}).`,
   criterion:'Surveyed dimensions within the ASTM A6 and AISC Code of Standard Practice tolerances of the values used; the tie lengths are cut to the surveyed faces.',forces:'—',party:'Contractor (survey), reviewed by the engineer of record'});
  if(cc.footing&&cc.footing.clear<cc.footing.required)rows.push({item:'Crane column footing beside the existing building footing',needed:`The concentric footings overlap ${len(-Math.min(0,cc.footing.clear))||'less than the minimum clear distance'}: a combined or enlarged footing by the foundation engineer for the crane column base reactions given (open item, unverified until it is referenced), before excavation.`,
   criterion:`ACI 318-19 Chapter 13 and the geotechnical bearing pressure; no undermining of the existing footing; ${len(cc.footing.required)} clear between separate footings.`,forces:'Crane column base actions: S-00 and section @@ref:base@@; the building column reactions by the engineer of record.',party:`${EOR} (foundation engineer)`});
 }
 // Confirmations a runway package rests on.
 for(const c of p.cranes){const d=c.design,max=Math.max(...c.wheels.map(w=>w.loaded)),empty=Math.max(...c.wheels.map(w=>w.unloaded)),spacing=c.wheels.length>1?Math.max(...c.wheels.map(w=>w.offset))-Math.min(...c.wheels.map(w=>w.offset)):0;
  rows.push({item:`Crane data · ${c.name}`,needed:`Signed confirmation of the data used: wheel loads ${f(max)} maximum / ${f(empty)} empty per wheel${d?.minWheelLoad?`, ${f(d.minWheelLoad)} minimum on the far runway`:''}, ${c.wheels.length} wheels${spacing?` at ${len(spacing)}`:''}; side thrust share s = ${d?.sideShare??0.5} to this runway; driven-wheel load ${f(d?.drivenWheelLoad)}; bumper force ${f(d?.bumperForce)} and its height above the rail; bridge speed; the 0.9 trolley factor in the bumper energy.`,
   criterion:'The values used in sections 1.4 and 2.2; any increase requires a re-check.',forces:'—',party:'Crane supplier'});}
 if(p.details?.rail)rows.push({item:'Rail and crane wheels',needed:`Confirm that the ${p.details.rail.name.split(' · ')[0]} suits the crane wheels (tread width, flange clearance, wheel load) and the rail joints and rail clips specified.`,criterion:'Crane supplier wheel and rail requirements.',forces:'—',party:'Crane supplier'});
 rows.push({item:'Opposite runway',needed:`Build the opposite runway identical to this one, opposite hand (S-00, S-01): ${runwayParts(p)}; survey its column line as this one.`,criterion:'This calculation applies where the opposite columns, seat elevation and frame match those used here; otherwise a separate check.',forces:'As this runway (section @@ref:interfaces@@).',party:'Engineer of record for the runway; contractor survey'});
 if(col?.enabled&&!col.isNew){const r=p.details?.bracket?.receiver;
  rows.push({item:'Existing column survey',needed:`Field-verify every existing column before fabrication: ${col.shape??'section'}${r?` d = ${len(r.depth)}, bf = ${len(r.width)}, tf = ${len(r.flangeThickness)}, tw = ${len(r.webThickness)}`:''}, plumb, and nothing attached inside the flanges at the ${usesTaperedHaunch(p)?'haunch':p.details?.bracket?.enabled?'bracket':'seat'}${columnStiffenerGeometry(p)?' and column stiffener':''} levels; base metal per the mill certificates.`,
   criterion:'Surveyed dimensions within the ASTM A6 tolerances of the values used here; any difference to the engineer of record before fabrication.',forces:'—',party:'Contractor (survey), reviewed by the engineer of record'});}
 const a=s.designAnalysis;
 if(a&&p.cranes.length){const c=p.cranes[0],max=Math.max(...c.wheels.map(w=>w.loaded)),empty=Math.max(...c.wheels.map(w=>w.unloaded)),lrfd=p.method==='LRFD',test=(lrfd?1.2:1)*empty+(lrfd?1.6:1)*1.25*(max-empty);
  rows.push({item:'Load test at 125% of the rated load (S-00)',needed:'Load test the crane and runway per ASME B30.2 and the crane supplier before service.',
   criterion:`${lrfd?`1.2 × empty-crane wheel load + 1.6 × 1.25 × (loaded − empty) = 1.2 × ${f(empty)} + 1.6 × 1.25 × ${f(max-empty)}`:`empty-crane wheel load + 1.25 × (loaded − empty)`} = ${f(test)} per wheel ${test<=a.wheelLoad*(1+1e-9)?`≤ the design wheel load ${f(a.wheelLoad)} with impact: the runway checks cover the test`:`> the design wheel load ${f(a.wheelLoad)}: limit the test load`}.`,forces:'—',party:'Owner and crane supplier (perform); engineer of record (witness)'});}
 return rows;
}

/** The matrix as printed: compact on page 1 (item, what is needed, responsible party), complete in the items-by-others section. */
export function responsibilityBlock(tax:Taxonomy,s:CalculationSnapshot,compact=false){
 const rows=responsibilityMatrix(tax,s);if(!rows.length)return '';
  // Page 1: item and responsible party, two items to a row.
 if(compact){const half=Math.ceil(rows.length/2),cell=(v?:ResponsibilityRow)=>v?`<td><b>${esc(v.item)}</b></td><td>${esc(v.party)}</td>`:'<td></td><td></td>';
  return `<h3>Not checked in this package: responsibility matrix</h3><table class="by-others compact"><thead><tr><th>Item</th><th>Responsible party</th><th>Item</th><th>Responsible party</th></tr></thead><tbody>${rows.slice(0,half).map((v,i)=>`<tr>${cell(v)}${cell(rows[half+i])}</tr>`).join('')}</tbody></table><p class="counts">What is needed, the acceptance criterion and the force and location delivered to each item: responsibility matrix, section @@ref:by-others@@.</p>`;}
 return `<table class="by-others matrix"><thead><tr><th>Item</th><th>What is needed</th><th>Acceptance criterion</th><th>Force and location delivered</th><th>Responsible party</th></tr></thead><tbody>${rows.map(v=>`<tr><td><b>${esc(itemName(v.item))}</b></td><td>${esc(v.needed)}</td><td>${esc(v.criterion)}</td><td>${esc(v.forces)}</td><td>${esc(v.party)}</td></tr>`).join('')}</tbody></table>`;
}

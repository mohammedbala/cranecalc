import type {CalculationSnapshot,CheckResult} from '../engine/types';
import type {Taxonomy} from '../engine/checkTaxonomy';
import {deliveredForces} from '../engine/forcesDelivered';
import {runwayMass,runwaySeismicBound} from '../engine/columnSupport';
import {drawingElevation} from '../components/drawingFormat';
import {caseLabel,sig3,tidyNumbers} from './reportParts';

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

export function responsibilityMatrix(tax:Taxonomy,s:CalculationSnapshot):ResponsibilityRow[]{
 const p=s.input,u=p.units,f=(v:number|undefined)=>sig3(v,'force',u),len=(v:number|undefined)=>sig3(v,'length',u),m=(v:number|undefined)=>sig3(v,'moment',u);
 const dl=deliveredForces(s),z=s.existingColumn?.support,col=p.existingColumn;
 const el=(v?:number)=>v===undefined?'':` El. ${drawingElevation(v,u)}`;
 const where=dl?`per-grid concurrent sets, section @@ref:interfaces@@ and S-00: V at e = ${len(dl.e)} from the column centerline with Mx = V·e and the weak-axis seat moment My at the seat${el(dl.elevation?.seat)}; lateral at the tie line${el(dl.elevation?.tie)}, up to the tie design force ${f(dl.tie.design)}; longitudinal at the seat on the girder line`:'section @@ref:interfaces@@';
 const longitudinal=dl&&(dl.stop||dl.traction)?`longitudinal at the seat on the girder line: ${dl.stop?`crane stop ${f(dl.stop)} at ${gridList(dl.stopGrids)}`:''}${dl.stop&&dl.traction?', ':''}${dl.traction?`traction ${f(dl.traction)} at ${gridList(dl.tractionGrids)}`:''} (factored)`:'';
 const rows:ResponsibilityRow[]=[];
 const byId=new Map(tax.byOthers.map(t=>[t.check.id,t.check]));
 const take=(id:string,row:Omit<ResponsibilityRow,'check'>)=>{const c=byId.get(id);if(!c)return;byId.delete(id);rows.push({...row,check:c});};
 const sup=byId.get('supporting-structure');
 if(sup)take('supporting-structure',{item:sup.title,needed:'Check the building frame, roof and wall framing, the column-to-foundation connections, anchors and foundations for the crane forces combined with the building loads; the existing column member is checked in section @@ref:column@@ (braced frame assumed).',
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
 const strut=byId.get('brace-by-others')??byId.get('column-longitudinal');
 if(strut){const force=sentences(strut.note).find(x=>/\d\s*(kip|kN)\b/.test(x));
  take(strut.id,{item:'Crane-level strut on the girder line, collector, brace connections, braced-bay columns and foundation',
   needed:`Design the crane-level strut at each locating column on the girder line${col?.longitudinalExit==='girder-strut'?' (the existing column check relies on it: the longitudinal force leaves the column at the seat with no column torsion or weak-axis bending)':''}, the collector to the braced bay, the brace end connections (gussets, clevises, bolts, welds), the braced-bay columns, anchors and foundation.`,
   criterion:'AISC 360-16 and ACI 318 strength; the strut stiff enough to hold the girder line at the seat.',forces:[longitudinal&&longitudinal.charAt(0).toUpperCase()+longitudinal.slice(1)+'.',force].filter(Boolean).join(' ')||'See section @@ref:interfaces@@.',party:EOR});}
 // Any other check left to others.
 for(const c of byId.values()){const rest=sentences(c.note.replace(/^Not checked here:\s*/,''))[0]??'';const force=sentences(c.note).find(x=>/\d\s*(kip|kN)\b/.test(x));
  rows.push({item:c.title,needed:rest.charAt(0).toUpperCase()+rest.slice(1),criterion:'As stated in the check (Appendix A).',forces:force?.trim()??'See section @@ref:interfaces@@.',party:EOR,check:c});}
 // Confirmations a runway package rests on.
 for(const c of p.cranes){const d=c.design,max=Math.max(...c.wheels.map(w=>w.loaded)),empty=Math.max(...c.wheels.map(w=>w.unloaded)),spacing=c.wheels.length>1?Math.max(...c.wheels.map(w=>w.offset))-Math.min(...c.wheels.map(w=>w.offset)):0;
  rows.push({item:`Crane data · ${c.name}`,needed:`Signed confirmation of the data used: wheel loads ${f(max)} maximum / ${f(empty)} empty per wheel${d?.minWheelLoad?`, ${f(d.minWheelLoad)} minimum on the far runway`:''}, ${c.wheels.length} wheels${spacing?` at ${len(spacing)}`:''}; side thrust share s = ${d?.sideShare??0.5} to this runway; driven-wheel load ${f(d?.drivenWheelLoad)}; bumper force ${f(d?.bumperForce)} and its height above the rail; bridge speed; the 0.9 trolley factor in the bumper energy.`,
   criterion:'The values used in sections 1.4 and 2.2; any increase requires a re-check.',forces:'—',party:'Crane supplier'});}
 if(p.details?.rail)rows.push({item:'Rail and crane wheels',needed:`Confirm that the ${p.details.rail.name.split(' · ')[0]} suits the crane wheels (tread width, flange clearance, wheel load) and the rail joints and rail clips specified.`,criterion:'Crane supplier wheel and rail requirements.',forces:'—',party:'Crane supplier'});
 rows.push({item:'Opposite runway',needed:'Build the opposite runway identical to this one, opposite hand (S-00, S-01): girders, bearings, haunches, column stiffeners, ties and end stops; survey its column line as this one.',criterion:'This calculation applies where the opposite columns, seat elevation and frame match those used here; otherwise a separate check.',forces:'As this runway (section @@ref:interfaces@@).',party:'Engineer of record for the runway; contractor survey'});
 if(col?.enabled&&!col.isNew){const r=p.details?.bracket?.receiver;
  rows.push({item:'Existing column survey',needed:`Field-verify every existing column before fabrication: ${col.shape??'section'}${r?` d = ${len(r.depth)}, bf = ${len(r.width)}, tf = ${len(r.flangeThickness)}, tw = ${len(r.webThickness)}`:''}, plumb, and nothing attached inside the flanges at the haunch and column stiffener levels; base metal per the mill certificates.`,
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

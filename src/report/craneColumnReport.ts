import type {CalculationSnapshot,CheckResult} from '../engine/types';
import type {Quantity} from '../engine/units';
import {tiedToBuilding} from '../engine/craneColumnInputs';
import {columnTieCapacities,columnTieGeometry,columnTieEndClearance} from '../engine/craneColumn';
import {deliveredForces} from '../engine/forcesDelivered';
import type {ExistingColumnCombination} from '../engine/existingColumn';

/** The report's own helpers (compactReport.ts), handed in so these sections print as the others do. */
export interface ReportKit {
 sec:(name:string,key?:string,...aliases:string[])=>string;
 page:(title:string,body:string,figures?:string[])=>string;
 worked:(checks:CheckResult[])=>string;
 numeric:(checks:CheckResult[])=>string;
 selected:(groups:string[])=>CheckResult[];
 basis:(text:string)=>string;
 table:(headers:string[],rows:(string|number)[][],cls?:string)=>string;
 f:(v:number|undefined,q?:Quantity)=>string;
 q3:(v:number|undefined,q?:Quantity)=>string;
 e:(v:string)=>string;
 ref:(key:string)=>string;
 sheet:(topic:string)=>string;
}

/**
 * Report sections of a crane column tied to the existing building column (craneColumn.ts; AISC Design Guide 7 separate
 * crane column, AIST TR-13 §5.9.2): "Crane column and ties" (the crane column member, the Appendix 6 nodal brace at its
 * top worked with numbers, the column tie and its slot travel) and "Building column (lateral from ties)" (the existing
 * column under the tie forces with its own effects). Empty unless the project is tied to the building.
 */
export function craneColumnPages(s:CalculationSnapshot,k:ReportKit):string[]{
 const p=s.input,cr=s.craneColumn,c=p.existingColumn;if(!tiedToBuilding(p)||!cr||!c||!p.craneColumn)return [];
 const {sec,page,worked,numeric,selected,basis,table,f,q3,e,ref,sheet}=k,kc=p.craneColumn,t=kc.columnTie,g=cr.layout,lrfd=p.method==='LRFD';
 const combos=(list:ExistingColumnCombination[]|undefined)=>{const top=[...(list??[])].sort((a,b)=>b.U-a.U).slice(0,3);
  return top.length?table(['Case','Combination','P<sub>r</sub>','M<sub>rx</sub>','M<sub>ry</sub>','B<sub>1x</sub>','H1'],top.map(v=>[e(v.id),e(v.equation),q3(v.P,'force'),q3(v.Mx,'moment'),q3(v.My,'moment'),v.B1x.toFixed(2),v.U.toFixed(2)]),'data'):'';};
 const x=s.existingColumn,tg=columnTieGeometry(p),cap=columnTieCapacities(p),b=cr.brace,st=b.stiffness,sl=cr.slot,ties=cr.ties;
 const el=1/(1/st.building+1/st.tie),phi=lrfd?'1/φ = 1/0.75':'Ω = 2.00',dl=deliveredForces(s);
 const crane=page(sec('Crane column and ties','column','crane-column'),
  `<p>A new ${e(g.craneColumn.shape)} crane column at each grid carries the girder on its column cap to its own ${kc.base} base and footing (AISC Design Guide 7, separate crane column; AIST TR-13 §5.9.2 direct column bearing). Its top is braced across the runway by the column tie to the existing ${e(g.buildingColumn.shape)} building column ${f(g.buildingColumn.x)} away (centerlines, ${f(g.gap)} clear between flanges), and along the runway by the crane-level bracing. The girder top-flange tie reaches the building column face ${f(g.girderTie.face)} from the girder web. Details: sheet ${sheet('crane-column')}.</p>`
  +basis(`The crane column takes the girder vertical reactions with the rail eccentricity on the cap (the side thrust C<sub>ss</sub> leaves through the ties: none on the crane column); ASCE 7-16 ${p.method} combinations with the crane as live load L; L<sub>cx</sub> = ${f(c.Lcx)}, base to the braced top. Governing axial force P<sub>r</sub> = ${q3(b.Pr,'force')} (${e(b.case)}).`)
  +table(['Item','Value','Item','Value'],[
   ['Crane column',e(`${g.craneColumn.shape}, ${kc.base} base`),'Height (base to cap)',f(c.height)],
   ['Column tie elevation, L<sub>br</sub>',f(b.L),'Girder tie elevation',f(g.girderTie.elevation)],
   ['Building column',e(`${g.buildingColumn.shape} (existing, surveyed)`),'Centerlines / clear gap',`${f(g.buildingColumn.x)} / ${f(g.gap)}`],
   ['Column tie plate',e(`${f(t.plate.thickness)} × ${f(t.plate.width)}, Fy ${f(t.plate.Fy,'stress')}`),'Bolts',e(`${t.bolts.count} × ${f(t.bolts.diameter)} ${t.bolts.grade} at ${f(t.bolts.pitch)}, in ${f(t.slot.width)} × ${f(t.slot.length)} vertical slots`)]])
  +(x?`<h3>Crane column member (H1)</h3>${combos(x.combinations)}<p>The governing combination and the next two (every combination is in Appendix A).</p>`:'')
  +`<h3>Nodal brace at the crane-column top (AISC 360-16 Appendix 6 §6.2.2)</h3>`
  +`<p>The column tie, in series with the building column, is the nodal brace of the crane column at L<sub>br</sub> = ${f(b.L)} from its ${kc.base} base. Required strength P<sub>br</sub> = 0.01P<sub>r</sub> = 0.01 × ${q3(b.Pr,'force')} = ${q3(b.strength.required,'force')}. Required stiffness β<sub>br</sub> = (${phi})(8P<sub>r</sub>/L<sub>br</sub>) = ${q3(st.required,'stiffness')} (Eq. A-6-4, column nodal brace; P<sub>br</sub> from Eq. A-6-3).</p>`
  +`<p>Provided: the building column at the tie under a unit force, k<sub>b</sub> = ${q3(st.building,'stiffness')} (its own end conditions and section), in series with the column tie (plate over the gap and bolt shear), k<sub>t</sub> = ${q3(st.tie,'stiffness')}: elastic (1/k<sub>b</sub> + 1/k<sub>t</sub>)<sup>−1</sup> = ${q3(el,'stiffness')}; with the sleeve play g = ${f(st.play)} taken up at P<sub>br</sub>, the secant stiffness (1/k<sub>b</sub> + 1/k<sub>t</sub> + g/P<sub>br</sub>)<sup>−1</sup> = ${q3(st.provided,'stiffness')} ≥ ${q3(st.required,'stiffness')}, D/C = ${(st.required/Math.max(st.provided,1e-9)).toFixed(2)}. The strength P<sub>br</sub> is carried with the concurrent tie forces below, against the governing strength of the column tie ${q3(b.strength.provided,'force')}.</p>`
  +`<h3>Column tie</h3><p>Design force F = H<sub>b</sub> + P<sub>r</sub>e/H + P<sub>br</sub> = ${q3(ties.bottom,'force')} (girder bottom-flange restraint through the bearing bolts and cap${ties.case?`, ${e(ties.case)}`:''}) + ${q3(ties.eccentric,'force')} (the crane column's eccentric top reaction) + ${q3(ties.braceForce,'force')} (Appendix 6) = ${q3(ties.columnTie,'force')}, in either direction. One plate shop welded to the crane column flange (${f(tg.weld)} fillets both faces, full depth), lapping a ${f(tg.tab.thickness)} × ${f(tg.tab.depth)} × ${f(tg.tab.length)} tab field welded to the building column flange on its web line (${f(tg.tab.weld)} fillets both faces; standard holes) with ${t.bolts.count} bolts pretensioned against steel sleeves (${f(tg.od)} OD) through vertical long slots, the slots perpendicular to the force (J3.10(b)); the plate ends ${f(columnTieEndClearance)} clear of the building column.</p>`
  +table(['Limit state','Available strength','Basis'],[
   ['Tension, gross and net section',q3(cap.tension,'force'),`D2; A<sub>n</sub> through a slot = ${q3(cap.An,'area')}`],
   ['Compression over the gap',q3(cap.comp.capacity,'force'),`E3, K = 1.2, KL/r = ${cap.comp.slenderness.toFixed(1)}`],
   ['Bolt shear',q3(cap.bolts,'force'),`J3.6, ${t.bolts.count} bolts, single plane`],
   ['Bearing and tearout at the slots',q3(cap.bearing,'force'),'J3.10(b), long slots perpendicular to the force'],
   ['Shop fillets',q3(cap.weldForce,'force'),`J2.4, ${f(tg.weld)} both faces over ${f(t.plate.width)}`],
   ['Tab: bearing and tearout, standard holes',q3(cap.tab.bearing,'force'),'J3.10(a)'],
   ['Tab: tension, gross and net section',q3(cap.tab.tension,'force'),`D2; A<sub>n</sub> through a hole = ${q3(cap.tab.An,'area')}`],
   ['Tab: field fillets to the existing flange',q3(cap.tab.weldForce,'force'),`J2.4, ${f(tg.tab.weld)} both faces over ${f(tg.tab.depth)}`],
   ['Building column web under the tab',q3(cap.tab.webYield,'force'),`J10.2, l<sub>b</sub> = ${f(tg.tab.depth)}, k = ${f(cap.tab.k)}`]])
  +`<h3>Vertical slot travel</h3><p>The slots let the two columns shorten independently. Crane column δ<sub>c</sub> = PL/EA = ${f(sl.crane)} (runway dead load, crane with impact at the most loaded support and its own weight, base to the tie); building column δ<sub>b</sub> = ${f(sl.building)} (its existing L and the largest of L<sub>r</sub>, S and R); the larger plus the erection tolerance ${f(sl.tolerance)} = ${f(sl.demand)} each way against (l<sub>s</sub> − D<sub>s</sub>)/2 = ${f(sl.capacity)}.${(()=>{const gt=s.checks.find(v=>v.id==='tie-release-travel'||v.id==='cap-angle-endplate-travel');return gt?` The girder tie's column-end slots at the building column take the same differential shortening and tolerance at the girder tie, with its end rotation and positioning allowance: ${f(gt.demand)} required against ${f(gt.capacity)} each way (${e(gt.title.replace(/\s*·\s*/g,', '))}, D/C ${(gt.utilization??0).toFixed(2)}).`:` The girder tie's column end has no vertical slots: the differential shortening is taken by the tie itself.`;})()}</p>`
  +(cr.footing?`<p>Footings: the crane column footing ${f(cr.footing.crane.L)} × ${f(cr.footing.crane.B)} and the existing building column footing ${f(cr.footing.building.L)} × ${f(cr.footing.building.B)}, concentric with their columns, ${cr.footing.clear<0?`overlap ${f(-cr.footing.clear)}`:`are ${f(cr.footing.clear)} apart`} (${f(cr.footing.required)} clear required): ${cr.footing.clear<cr.footing.required?`a foundation coordination open item (unverified), a combined or enlarged footing by the foundation engineer for the reactions given (section ${ref('by-others')})`:'clear'}.</p>`:'')
  +worked(selected(['Crane column']))+numeric(selected(['Crane column']))
  +`<p>The base plate, anchor rods and footing are designed in section ${ref('base')}${s.bracingSystem?`, the crane-level bracing in section ${ref('bracing')}`:''}. Across the runway the crane column takes no side thrust and no seismic force: both reach the building column through the ties.</p>`,[]);
 const bc=s.buildingColumn,bk=kc.building;
 const at=(z:number)=>f(z);
 const building=page(sec('Building column (lateral from ties)','building-column'),
  `<p>The existing ${e(g.buildingColumn.shape)} building column takes only horizontal forces from the runway: the girder tie at ${at(g.girderTie.elevation)} and the column tie at ${at(g.columnTie.elevation)} above the crane-column base, in either direction (no runway vertical load), with its own existing effects as surveyed (${e(bk.source)}). It is also the nodal brace of the crane column (section ${ref('crane-column')}): its stiffness at the column tie is k<sub>b</sub> = ${q3(st.building,'stiffness')}.</p>`
  +basis(`Side thrust C<sub>ss</sub> at the rail head, resolved into the girder tie and the bottom-flange (column tie) forces of the girder model, plus at the column tie the crane column's eccentric top reaction and the Appendix 6 brace force, and at the girder tie the girder's own Appendix 6 brace force; the runway mass across the runway in the seismic combinations. ASCE 7-16 ${p.method} combinations with the building's D, L, L<sub>r</sub>, S, R, W and E as entered.${dl?.craneColumn?` Design tie forces: girder tie ${q3(dl.tie.design,'force')}, column tie ${q3(dl.craneColumn.columnTie,'force')} (section ${ref('interfaces')}).`:''}`)
  +table(['Item','Value','Item','Value'],[
   ['Section',e(`${bk.shape||'plates'} (surveyed)`),'F<sub>y</sub>',f(bk.Fy,'stress')],
   ['Height',f(bk.height),'L<sub>cx</sub> / L<sub>cy</sub>',`${f(bk.Lcx)} / ${f(bk.Lcy)}`],
   ['Ends (strong axis)',e(`${bk.strong.base} base, ${bk.strong.top} top`),'Frame',e(bk.frame?.type??'not entered')]])
  +(bc?`<h3>Governing combinations (H1)</h3>${combos(bc.combinations)}`:'')
  +worked(selected(['Building column']))+numeric(selected(['Building column']))
  +`<p>The column tie's tab on the building column (its bolts, field fillets and the column web under it) is checked in section ${ref('crane-column')}, and the girder tie's column gusset or end plate with the tie. The building column flange and web at the girder tie, the building frame, its foundations and the lateral system for the added runway mass are by others for the forces of section ${ref('interfaces')} (section ${ref('by-others')}).</p>`,[]);
 return [crane,building];
}

import type {CalculationSnapshot,CheckResult} from '../engine/types';
import type {Quantity} from '../engine/units';
import {sig3} from './reportParts';
import {capAngleResult,capAngleGroup,capAngleMovementGroup} from '../engine/capAngleTie';
import {deliveredForces} from '../engine/forcesDelivered';
import {capTieLine} from '../engine/capAngle';

/**
 * The tie design force on the page (M6): the top-flange restraint force of the analysis (all girder ends at a grid,
 * and one girder end) plus the AISC Appendix 6 brace force, with the brace stiffness check and the fatigue range.
 */
export function tieForceDerivation(s:CalculationSnapshot,F:number,range:number){
 const p=s.input,u=p.units,r=s.detailResults!,a=s.designAnalysis!,d=deliveredForces(s),f=(v:number|undefined)=>sig3(v,'force',u),L=(v:number|undefined)=>sig3(v,'length',u),M=(v:number|undefined)=>sig3(v,'moment',u),k=(v:number|undefined)=>sig3(v,'stiffness',u);
 const pos=(x?:number)=>x===undefined?'—':u==='US'?`${(x/304.8).toFixed(1)} ft`:`${(x/1000).toFixed(2)} m`,gv=r.governing.brace,ge=r.governing.braceEnd,tie=capTieLine(p);
 if(!d)return `Pull and push F = ${f(F)} on each tie, fatigue range ΔF = ${f(range)}.`;
 const b=d.brace,phi=p.method==='LRFD'?'1/0.75':'2.00';
 return `Tie design force, each tie: F = H + P<sub>br</sub> = ${f(r.demands.brace)} + ${f(b.force)} = <b>${f(F)}</b>, pull and push. `+
  `H = ${f(r.demands.brace)} is the largest top-flange restraint force of the lateral/torsional analysis (support, bracket and restraint forces; ${gv?`${gv.combination} at grid x = ${pos(gv.x)}`:''}), all girder ends at a grid together; one girder end alone reaches ${f(r.demands.braceEnd)}${ge?` (${ge.combination}, x = ${pos(ge.x)})`:''}, and every tie is designed for the larger. `+
  `The restraint acts at the tie line, the tie plate centerline${tie!==undefined?` ${L(tie)} above the bottom of the W`:''}, where the tie's pull or push acts on the girder by statics (not at the cap bolts or the W top flange). `+
  `P<sub>br</sub> = 0.02M<sub>r</sub>C<sub>d</sub>/h<sub>o</sub> + 0.01P<sub>r</sub> = 0.02 × ${M(a.moment)}${u==='US'?' × 12 in/ft':''} × ${b.Cd}/${L(s.properties!.h0)} + 0.01 × ${f(a.axial)} = ${f(b.flexure)} + ${f(b.axial)} = ${f(b.force)} (AISC 360-16 Appendix 6.3.2a point bracing for the girder's largest moment M<sub>r</sub>, and 6.2.2 for its axial force P<sub>r</sub>). `+
  `Stiffness: β<sub>br</sub> = (${phi})(10M<sub>r</sub>C<sub>d</sub>/(L<sub>br</sub>h<sub>o</sub>) + 8P<sub>r</sub>/L<sub>br</sub>) = ${k(b.stiffness)} with L<sub>br</sub> = ${L(b.Lbr)}, against the tie stiffness β = ${k(r.braceStiffness)}, its elements in series (compliance shares with the tie fatigue checks). `+
  `Fatigue range ΔF = ${f(range)}: the largest range of the restraint force over the duty bins (unfactored, without impact); the side thrust reverses, so the range is the full reversal of the force (one girder end: ${f(r.demands.braceEndFatigue)}).`;
}

/** The compact report's page builders, passed in so this module adds pages without its own layout. */
export interface ReportKit {
 page:(title:string,body:string,topics?:string[])=>string;numeric:(checks:CheckResult[])=>string;selected:(groups:string[])=>CheckResult[];
 sec:(name:string,key?:string)=>string;basis:(text:string)=>string;worked:(checks:CheckResult[],steps?:string[],also?:string[])=>string;
 table:(headers:string[],rows:(string|number)[][],cls?:string)=>string;f:(v:number|undefined,q?:Quantity)=>string;e:(v:unknown)=>string;sheet:(topic:string)=>string;
}
/**
 * Report pages of the cap tieback angle, in the connection checks: the detail and its inputs with the
 * strength checks, the fatigue checks with the stiffness used in the girder model, and the movement checks.
 */
export function capAngleReportPages(s:CalculationSnapshot,k:ReportKit):string[]{
 const res=capAngleResult(s);if(!res)return [];
 const p=s.input,{g,design:x,loads}=res,c=g.input,{page,numeric,selected,table,f,e,sec,basis,worked}=k,col=g.column.receiver;
 const all=selected([capAngleGroup]),fatigue=all.filter(v=>v.id.includes('fatigue')),strength=all.filter(v=>!v.id.includes('fatigue'));
 const sheet=k.sheet('cap-angle-tie');
 const intro=`<p>One cap tieback angle (AISC DG7, top flange connected directly to the column) at each girder end, ${f(c.setback)} from the girder end to its centerline. The ${e(c.shape)} angle is bolted through the column-side flange of the ${e(p.section.capCatalogueId??'cap')} channel with its long leg level with the top of the cap; ${g.cap.sleeved?`its bolts are pretensioned against steel sleeves (${f(g.cap.sleeve!.od)} OD) in`:'its snug-tight bolts sit in'} ${f(g.cap.slotWidth)} × ${f(g.cap.slotLength)} horizontal slots, so the girder slides ${f(c.travel)} each way along the runway with end rotation and thermal travel while the angle stays with the column. A ${f(g.plate.thickness)} × ${f(g.plate.width)} tie plate is lapped on the angle with two slip-critical bolts in short slots across the runway, spans the ${f(g.plate.gap)} clear gap and is shop welded to a ${f(c.endPlate.thickness)} end plate, bolted through finger shims to the ${col?`${e(col.shape??'')} column flange (${e(col.source)})`:'column flange'} with one bolt above and one below the tie plate in field-drilled holes. The bolted end bearings restrain the bottom flange. Pull is the critical direction (bolts in tension with prying); push bears on the channel flange and shims and buckles the tie plate. See ARCH D ${e(sheet)}.</p>`;
 const inputs=table(['Input','Value','Input','Value'],[
  ['Angle / length',`${e(c.shape)} / ${f(c.length)}`,'Setback from girder end',f(c.setback)],
  ['Cap bolts',`2 - ${f(c.capBolts.diameter)} ${c.capBolts.grade}, ${f(c.capBolts.gauge)} below top, ${f(c.capBolts.pitch)} pitch`,'Slots / travel',`${f(g.cap.slotWidth)} × ${f(g.cap.slotLength)} / ${f(c.travel)} each way`],
  ['Tie plate',`${f(c.plateThickness)} × ${f(c.plateWidth)} × ${f(g.plate.length)}`,'Lap bolts',`2 - ${f(c.lapBolts.diameter)} ${c.lapBolts.grade}, Class ${c.lapBolts.surface}, ${f(c.lapBolts.pitch)} pitch`],
  ['End plate',`${f(c.endPlate.thickness)} × ${f(c.endPlate.width)} × ${f(c.endPlate.height)}`,'Column bolts',`2 - ${f(c.columnBolts.diameter)} ${c.columnBolts.grade}, ${f(c.columnBolts.gauge)} each side`],
  ['Shims',`0 to ${f(c.shimMax)}`,'End plate fillets',`${f(c.weldSize)}, both faces`],
  ['Tie force F (pull / push)',f(x.F,'force'),'Fatigue range ΔF',f(loads.range,'force')],
  ['Column stiffener at the tie',res.stiffener.provided?'provided':res.stiffener.required?'required':'not needed','Tie stiffness k',f(x.stiffness,'stiffness')]]);
 const stiffness=table(['Compliance (pull, in series)','Share'],Object.entries(x.compliance).map(([name,v])=>[e(name.replace(/([A-Z])/g,' $1').toLowerCase()),`${(100*v*x.stiffness).toFixed(1)}%`]));
 return [
  page(sec('Cap tieback angle','cap-angle'),intro+inputs+basis(tieForceDerivation(s,x.F,loads.range))+worked(strength,[],['cap-angle-cap-bolt','cap-angle-col-bolt'])+numeric(strength),['Cap tieback']),
  page(sec('Cap tieback fatigue & stiffness'),numeric(fatigue)+`<p>The holes in the column-side channel flange at each tie are in the girder fatigue register (CA) under the longitudinal stress range at the top of the channel, Category ${g.cap.sleeved?'B (clamped by pretensioned bolts)':'D (snug-tight bolts)'}. The tie's lateral stiffness ${f(x.stiffness,'stiffness')} is the top-flange restraint of the lateral/torsional model and of the Appendix 6 brace stiffness check:</p>`+stiffness,['Fatigue']),
  page(sec('Cap tieback movement'),numeric(selected([capAngleMovementGroup]))+`<p>Girder end rotation moves the top of the girder along the runway by θ times the height of the cap bolts above the bearing (${f(g.boltHeight)}); at sliding ends the thermal travel adds; the slots in the angle take both. Vertical movement of the girder at the tie (support deflection with impact and end rotation over the tie's distance from the bearing, ${f(loads.vertical)} factored) bends the tie plate about its weak axis between the lap and the end plate.</p>`)
 ];
}

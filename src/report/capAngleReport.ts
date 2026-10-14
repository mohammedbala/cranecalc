import type {CalculationSnapshot,CheckResult} from '../engine/types';
import type {Quantity} from '../engine/units';
import {sig3} from './reportParts';
import {capAngleResult,capAngleGroup,capAngleMovementGroup} from '../engine/capAngleTie';
import {braceImperfection,deliveredForces} from '../engine/forcesDelivered';
import {capTieLine} from '../engine/capAngle';
import {clearanceEffects,secantStiffness} from '../engine/restraintClearance';
import {railTopAboveSteel} from '../engine/railSeat';

/**
 * The tie design force on the page (M6): the top-flange restraint force of the analysis (all girder ends at a grid,
 * and one girder end) plus the AISC Appendix 6 brace force, with the brace stiffness check and the fatigue range.
 */
export function tieForceDerivation(s:CalculationSnapshot,F:number,range:number){
 const p=s.input,u=p.units,r=s.detailResults!,a=s.designAnalysis!,d=deliveredForces(s),f=(v:number|undefined)=>sig3(v,'force',u),M=(v:number|undefined)=>sig3(v,'moment',u),k=(v:number|undefined)=>sig3(v,'stiffness',u);
 const gv=r.governing.brace,grid=(x?:number)=>{if(x===undefined)return '';let g=0;const grids=[0,...p.spans.map(v=>g+=v)],i=grids.findIndex(v=>Math.abs(v-x)<1);return i>=0?`grid ${i+1}`:`x = ${u==='US'?`${(x/304.8).toFixed(1)} ft`:`${(x/1000).toFixed(2)} m`}`;};
 if(!d)return `Pull and push F = ${f(F)} on each tie, fatigue range ΔF = ${f(range)}.`;
 const b=d.brace;
 return `tie design force F = H + P<sub>br</sub> = ${f(r.demands.brace)} + ${f(b.force)} = <b>${f(F)}</b>, pull or push. `+
  `H: largest top-flange restraint force at a grid${gv?` (${gv.combination}, ${grid(gv.x)})`:''}${(r.demands.braceEnd??0)>r.demands.brace?`; one girder end alone ${f(r.demands.braceEnd)}`:''}. `+
  `P<sub>br</sub>: AISC 360-16 Appendix 6.3.1b with M<sub>r</sub> = ${M(a.moment)}, plus 6.2.2 with P<sub>r</sub> = ${f(a.axial)}. `+
  (()=>{const bs=s.checks.find(c=>c.id==='brace-stiffness'),provided=bs?.capacity??r.braceStiffness,secant=Math.abs(provided-r.braceStiffness)>1e-6*r.braceStiffness;
   return `Required brace stiffness ${k(b.stiffness)} vs ${k(provided)} provided${secant?` (the secant stiffness with the tie's play; ${k(r.braceStiffness)} after contact)`:''}. Fatigue range ΔF = ${f(range)}.`;})();
}

/**
 * How the play of the girder restraints is represented (restraintClearances): buckling at the secant stiffness, stresses
 * after contact with the rigid-body and differential-twist bounds, and the rail-head movement with the take-up.
 */
export function playParagraph(s:CalculationSnapshot,f:(v:number|undefined,q?:Quantity)=>string){
 const p=s.input,a=s.designAnalysis,props=s.properties,r=s.detailResults;if(!a||!props||!r)return '';
 const sec=p.section,play=clearanceEffects(p,props,capTieLine(p),(sec.kind==='cap'?sec.d+sec.capTw:sec.d)+railTopAboveSteel(p));if(!play.any)return '';
 const P=braceImperfection(p,a,props).force,k=r.braceStiffness,ks=secantStiffness(k,play.gt,P);
 const top=play.top.source==='cap-angle'?`the angle is not clamped: it slides on its sleeves between the channel flange and the plate washers, so a reversal of the tie force first takes up g<sub>t</sub> = L<sub>sleeve</sub> − t<sub>a</sub> = ${f(play.gt)}`:play.top.source==='gusset-slot'?`the sleeves bear across the column gusset slots after g<sub>t</sub> = ${f(play.gt)}`:'the top tie is clamped (g<sub>t</sub> = 0)';
 const bottom=play.gb>0?`the sliding bearing bears across its slot after g<sub>b</sub> = ${f(play.gb)} (${f(play.gb/2)} each way when centered); the locating bearing is clamped by its pretensioned bolts`:'the bottom flange restraint is clamped (g<sub>b</sub> = 0)';
 return `<h3>Play at the restraints</h3><p>The stiffnesses above act after contact. At the top ${top}; at the bottom ${bottom}. The analysis represents the play as follows. `+
  `<b>Strength and buckling:</b> each restraint with play enters the strength cases, their stresses and the buckling eigenvalue (load-height lateral-torsional buckling and torsional stability), at its secant stiffness, the play taken up at the Appendix 6 brace force P<sub>br</sub> = ${f(P,'force')}: k<sub>sec</sub> = (1/k + g/P<sub>br</sub>)<sup>−1</sup>${play.gt>0?` = ${f(ks,'stiffness')} for the tie, which the brace stiffness check also uses`:''}. `+
  `<b>Uneven take-up:</b> each bay is restrained only at its ends, so the play moves it as a rigid body; ends that take up differently twist the bay uniformly by at most Δθ = (g<sub>t</sub> + g<sub>b</sub>)/h<sub>r</sub> = ${play.theta.toFixed(4)} rad (h<sub>r</sub> = ${f(play.hr)} from the tie line to the bottom flange), a St Venant torque GJΔθ/L = ${f(play.torque,'moment')} with shear stress ${f(play.tau,'stress')} and no warping stress (φ″ = 0). `+
  `<b>Movement:</b> the rail-head movement check adds the rigid-body take-up g<sub>t</sub> + Δθ(y<sub>r</sub> − y<sub>t</sub>) = ${f(play.rail)}. `+
  `<b>Cyclic:</b> each reversal of side thrust slides the restraint across its play under pretensioned bolts that are not themselves cycled; the tie fatigue range is the full force reversal, and the play is reinspected with the rail ends at each periodic crane inspection.</p>`;
}
/** The compact report's page builders, passed in so this module adds pages without its own layout; `extra` holds the tie's rows from other tables (classification, fatigue details, the tie member). */
export interface ReportKit {
 extra?:{classification?:string;fatigue?:string;checks?:CheckResult[]};
 page:(title:string,body:string,topics?:string[])=>string;numeric:(checks:CheckResult[])=>string;selected:(groups:string[])=>CheckResult[];
 sec:(name:string,key?:string,...aliases:string[])=>string;basis:(text:string)=>string;worked:(checks:CheckResult[],steps?:string[],also?:string[])=>string;
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
 const intro=`<p>One cap tieback angle (AISC DG7, top flange connected directly to the column) at each girder end, ${f(c.setback)} from the girder end to its centerline. The ${e(c.shape)} angle is bolted through the column-side flange of the ${e(p.section.capCatalogueId??'cap')} channel with ${g.dv===g.bh?'one leg':'its long leg'} level with the top of the cap; ${g.cap.sleeved?`its bolts are pretensioned against steel sleeves (${f(g.cap.sleeve!.od)} OD) in`:'its snug-tight bolts sit in'} ${f(g.cap.slotWidth)} × ${f(g.cap.slotLength)} horizontal slots, so the girder slides ${f(c.travel)} each way along the runway with end rotation and thermal travel while the angle stays with the column. A ${f(g.plate.thickness)} × ${f(g.plate.width)} tie plate is lapped on the angle with two slip-critical bolts in short slots across the runway, spans the ${f(g.plate.gap)} clear gap and is shop welded to a ${f(c.endPlate.thickness)} end plate, bolted through finger shims to the ${col?.shape?`${e(col.shape)} `:''}column flange with one bolt above and one below the tie plate in field-drilled holes. The bolted end bearings restrain the bottom flange. Pull governs the bolts (tension with prying); push is checked for bearing and tie-plate buckling. Sheet ${e(sheet)}.</p>`;
 const inputs=table(['Input','Value','Input','Value'],[
  ['Angle / length',`${e(c.shape)} / ${f(c.length)}`,'Setback from girder end',f(c.setback)],
  ['Cap bolts',`2 - ${f(c.capBolts.diameter)} ${c.capBolts.grade}, ${f(c.capBolts.gauge)} below top, ${f(c.capBolts.pitch)} pitch`,'Slots / travel',`${f(g.cap.slotWidth)} × ${f(g.cap.slotLength)} / ${f(c.travel)} each way`],
  ['Tie plate',`${f(c.plateThickness)} × ${f(c.plateWidth)} × ${f(g.plate.length)}`,'Lap bolts',`2 - ${f(c.lapBolts.diameter)} ${c.lapBolts.grade}, Class ${c.lapBolts.surface}, ${f(c.lapBolts.pitch)} pitch`],
  ['End plate',`${f(c.endPlate.thickness)} × ${f(c.endPlate.width)} × ${f(c.endPlate.height)}`,'Column bolts',`2 - ${f(c.columnBolts.diameter)} ${c.columnBolts.grade}, ${f(c.columnBolts.gauge)} each side`],
  ['Shims',`0 to ${f(c.shimMax)}`,'End plate fillets',`${f(c.weldSize)}, both faces`],
  ['Tie force F (pull / push)',f(x.F,'force'),'Fatigue range ΔF',f(loads.range,'force')],
  ['Column stiffener at the tie',res.stiffener.provided?'provided':res.stiffener.required?'required':'not needed','Tie stiffness k',f(x.stiffness,'stiffness')]]);
 const share=Object.entries(x.compliance).map(([name,v])=>[name,100*v*x.stiffness] as const),word=(n:string)=>{const t=n.replace(/([A-Z])/g,' $1').toLowerCase();return t.charAt(0).toUpperCase()+t.slice(1);};
 const stiffness=table(['Compliance (pull, in series)','Share'],[...share.map(([name,v])=>[e(word(name)),`${v.toFixed(1)}%`]),['<b>Total</b>',`<b>${share.reduce((t,[,v])=>t+v,0).toFixed(0)}%</b>`]]);
 const x2=k.extra??{},strengthAll=[...strength,...(x2.checks??[])],moves=selected([capAngleMovementGroup]);
 return [
  page(sec('Cap tieback','cap-angle','cap-angle-movement'),intro+inputs+(x2.classification??'')+basis(tieForceDerivation(s,x.F,loads.range))
   +`<h3>Strength</h3>`+worked(strengthAll,[],['cap-angle-cap-bolt','cap-angle-col-bolt'])+numeric(strengthAll)
   +`<h3>Stiffness and fatigue</h3><p>The tie stiffness ${f(x.stiffness,'stiffness')} is the top-flange restraint of the lateral-torsional model and of the Appendix 6 brace stiffness check. The bolt holes in the channel flange at each tie are Category ${g.cap.sleeved?'B details (pretensioned bolts)':'D details (snug-tight bolts)'}, screened in Appendix A.</p>`+stiffness+playParagraph(s,f)+numeric(fatigue)+(x2.fatigue??'')
   +`<h3>Movement</h3>`+worked(moves,[],['cap-angle-slot-travel','cap-angle-sleeve'])+numeric(moves)+`<p>End rotation moves the girder top along the runway by θ·h<sub>b</sub> (h<sub>b</sub> = ${f(g.boltHeight)}); at sliding ends thermal travel adds to it. The angle slots take both. Vertical girder movement at the tie (${f(loads.vertical)}, factored) bends the tie plate about its weak axis.</p>`,['Cap tieback'])
 ];
}


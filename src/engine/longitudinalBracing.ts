import {available} from './aiscStrength';
import {aiscAngleByName} from '../data/aiscAngles';
import {asceCombinations} from './asceCombinations';
import {format,noteLength} from './units';
import {latexNumber} from './math';
import type {SupportReactionSet} from './supportReactions';
import type {CheckResult,ProjectInput,Section} from './types';
import {aiscShapeByName} from '../data/aiscSections';
import {alongSeismic,bracingDesign,bracingLayout,braceCases,designsBracing} from './newColumnBracing';
import {rodStressArea} from './columnSupport';
import {activeStepStrut} from './craneLevelStrut';

const inch=25.4;
/** Angle about the geometric axis parallel to the connected (longer) leg, from leg rectangles without fillets. */
export function angleGeometry(d:number,b:number,t:number){
 const long=Math.max(d,b),short=Math.min(d,b),A1=long*t,A2=(short-t)*t,A=A1+A2,y1=t/2,y2=t+(short-t)/2,ybar=(A1*y1+A2*y2)/A;
 const I=long*t**3/12+A1*(y1-ybar)**2+t*(short-t)**3/12+A2*(y2-ybar)**2;
 return {A,ra:Math.sqrt(I/A),long,short};
}
export interface BracingMember {area:number;tension:number;compression?:number;slenderness?:number;net?:{An:number;U:number};description:string;}
/** Available strengths of one diagonal with unbraced length `length`. */
export function bracingMember(p:ProjectInput,length:number):BracingMember{
 const b=p.longitudinalBracing!,E=p.section.E;
 if(b.system==='rod-x'){
  const Ab=Math.PI*b.rod.diameter**2/4;
  // AISC 360-16 J3.6/Table J3.2 threaded rod Fnt = 0.75Fu (phi 0.75, Omega 2.00); D2 yielding of the rod body.
  return {area:Ab,tension:Math.min(available(.75*b.rod.Fu*Ab,p.method,.75,2),available(b.rod.Fy*Ab,p.method,.9,1.67)),description:`${noteLength(b.rod.diameter,p.units)} diameter rod`};
 }
 const shape=aiscAngleByName(b.angle.shape)!,Ag=shape.A*inch**2,t=shape.t*inch,g=angleGeometry(shape.d*inch,shape.b*inch,t),Fy=b.angle.Fy;
 // D3: standard hole plus 1/16 in; Table D3.1 case 8 shear lag for single angles (U = 0.80 with 4+ bolts in line, else 0.60).
 const An=Ag-(b.angle.boltDiameter+inch/8)*t,U=b.angle.bolts>=4?.8:.6;
 const tension=Math.min(available(Fy*Ag,p.method,.9,1.67),available(b.angle.Fu*U*An,p.method,.75,2));
 // E5(a): single angle connected through the longer leg; E7 effective width for slender legs.
 const Lr=length/g.ra,slenderness=Lr<=80?72+.75*Lr:32+1.25*Lr,Fe=Math.PI**2*E/slenderness**2,Fcr=Fy/Fe<=2.25?Fy*.658**(Fy/Fe):.877*Fe;
 const limit=.45*Math.sqrt(E/Fy),effective=(w:number)=>{const lambda=w/t;if(lambda<=limit*Math.sqrt(Fy/Fcr))return w;const Fel=(1.49*limit/lambda)**2*Fy;return w*(1-.22*Math.sqrt(Fel/Fcr))*Math.sqrt(Fel/Fcr);};
 const Ae=Ag-(g.long-effective(g.long))*t-(g.short-effective(g.short))*t;
 return {area:Ag,tension,compression:available(Fcr*Ae,p.method,.9,1.67),slenderness,net:{An,U},description:`${b.angle.shape} connected through the longer leg with ${b.angle.bolts} bolts`};
}

export function validateLongitudinalBracing(p:ProjectInput):string[]{
 const b=p.longitudinalBracing;if(!b?.enabled)return [];
 const errors:string[]=[],add=(test:boolean,m:string)=>{if(test)errors.push(`longitudinalBracing.${m}`);};
 add(p.scope!=='design','enabled: the longitudinal bracing check applies to design reports.');
 add(b.system!=='rod-x'&&!aiscAngleByName(b.angle.shape),'angle.shape: select an AISC angle.');
 add(b.rod.Fu<b.rod.Fy||b.angle.Fu<b.angle.Fy,'Fu: ultimate strength cannot be less than yield strength.');
 add(p.existingColumn?.enabled===true&&p.existingColumn.longitudinal==='column','enabled: the existing column is set to resist the crane longitudinal force; choose one longitudinal path.');
 if(designsBracing(p)){
  // Rods, their connections and the strut between new columns are designed here.
  const d=bracingDesign(p),n=p.spans.length;
  add(b.system!=='rod-x','system: between new freestanding columns the bracing is designed as clevis rod X-bracing; select Rod X.');
  add(b.tiers!==1,'tiers: new columns are braced in one tier from the base plate to the crane-level strut.');
  add(b.existing.W>0||b.existing.E>0,'existing: new freestanding columns take no building wind or seismic; seismic along the runway is calculated from the runway itself.');
  add(d.spans.some(i=>i<1||i>n)||new Set(d.spans).size!==d.spans.length,`design.spans: braced spans are distinct runway spans 1 to ${n}.`);
  add(new Set(d.spans.filter(i=>i>=1&&i<=n).map(i=>Math.round(p.spans[i-1]))).size>1,'design.spans: braced spans must have the same length.');
  add(!aiscShapeByName(d.strut.shape),'design.strut.shape: select an AISC W shape for the crane-level strut.');
  add(d.pin.diameter<b.rod.diameter,'design.pin.diameter: the clevis pin must be at least the rod diameter.');
  add(d.strut.Fu<d.strut.Fy||d.gusset.Fu<d.gusset.Fy,'design: ultimate strength cannot be less than yield strength.');
  add(![.5,.625,.75,.875,1,1.125,1.25].some(v=>Math.abs(v*inch-d.strut.boltDiameter)<1e-6),'design.strut.boltDiameter: use a standard 1/2 to 1-1/4 in bolt.');
 }
 return errors;
}

export interface BracingCombination {id:string;equation:string;H:number;force:number;}
export interface LongitudinalBracingResult {
 Cls:number;Cbs:number;length:number;cos:number;diagonals:number;member:BracingMember;
 /** Bays, width, work point height and tiers as analyzed: from the runway spans and column seat for new columns. */
 geometry:{bays:number;bayWidth:number;height:number;tiers:number;spans?:number[]};
 combinations:BracingCombination[];governing:BracingCombination;
 deflection:{value:number;limit:number};foundation:{shear:number;axial:number};
 /** TR-13 §5.5 (existing buildings): limit basis, the drift under the 10-year wind, and the rod fatigue range per diagonal. */
 tr13?:{height:number;wind10?:number};
 rodFatigue?:{force:number;area:number;range:number;cycles:number;allowable:number;threshold:number};
}
export function longitudinalBracingAnalysis(p:ProjectInput,reactions:SupportReactionSet,column?:Section):LongitudinalBracingResult{
 const b=p.longitudinalBracing!,Cls=reactions.Cls,Cbs=b.bumperToBracing?Math.max(0,...p.cranes.map(c=>c.design?.bumperForce??0)):0;
 const designed=designsBracing(p)&&column?bracingLayout(p):undefined;
 const geometry=designed?{bays:designed.spans.length,bayWidth:designed.width,height:designed.height,tiers:1,spans:designed.spans}:{bays:b.bays,bayWidth:b.bayWidth,height:b.height,tiers:b.tiers};
 const length=Math.hypot(geometry.bayWidth,geometry.height/geometry.tiers),cos=geometry.bayWidth/length,diagonals=b.system==='angle-x'?2:1;
 // X angles share the bay shear and brace each other at the crossing; one rod of an X acts in tension.
 const member=bracingMember(p,b.system==='angle-x'?length/2:length),force=(H:number)=>H/geometry.bays/diagonals/cos;
 // Every crane component is live load L (ASCE 7 §4.9); W and E are the building's own longitudinal forces on this line.
 const combinations:BracingCombination[]=asceCombinations(p.method).filter(k=>k.factors.L||k.factors.W||k.factors.E).map(k=>{
  const H=Math.abs(k.factors.L)*Cls+Math.abs(k.factors.W)*b.existing.W+Math.abs(k.factors.E)*b.existing.E;return {id:`${p.method} ${k.id}`,equation:k.equation,H,force:force(H)};});
 // AIST TR-13 crane stop case: LRFD 1.0Cbs, ASD 0.67Cbs, not combined with wind or seismic.
 if(Cbs){const H=(p.method==='LRFD'?1:.67)*Cbs;combinations.push({id:`${p.method} AIST bumper`,equation:p.method==='LRFD'?'1.0Cbs':'0.67Cbs',H,force:force(H)});}
 // New columns: the runway's own seismic force along it, with traction as live load (overstrength cases are for collectors).
 if(designed)for(const k of braceCases(p,reactions,p.method,alongSeismic(p,reactions,column!)))if(k.seismic&&!k.overstrength)combinations.push({id:k.id,equation:k.equation,H:k.H,force:force(k.H)});
 const governing=combinations.reduce((a,c)=>c.force>a.force?c:a);
 // Service: unfactored single-crane traction; axial elongation of the active diagonal in every tier.
 const service=force(Cls),elongation=(F:number)=>geometry.tiers*F*length/(member.area*p.section.E)/cos,deflection=elongation(service);
 // Existing building lines (review B10/B13): TR-13 §5.5 takes the frame criterion, H/400 or 2 in, H from the column
 // base to the top of the crane girder, under crane traction and under the 10-year wind; threaded rods take the
 // unfactored traction range on their tensile stress area (AISC Table A-3.1 item 8.5, Cf = 3.9 × 10^8, 7 ksi threshold).
 const review=!designed&&!!p.aist,c=p.existingColumn,top=c?.enabled?c.seatElevation+(p.details?.bearing.thickness??0)+p.section.d+(p.section.kind==='cap'?p.section.capTw:0):geometry.height+p.section.d;
 const tr13=review?{height:top,...(b.wind10!==undefined?{wind10:elongation(force(b.wind10))}:{})}:undefined,limit=tr13?Math.min(top/400,2*25.4,b.driftLimit>400?geometry.height/b.driftLimit:Infinity):geometry.height/b.driftLimit;
 // New-column rod bracing designed here takes the same rod-thread fatigue check (its turnbuckle and clevis threads).
 const rodFatigue=(review||!!designed)&&b.system==='rod-x'?(()=>{const area=rodStressArea(b.rod.diameter),range=service/area,cycles=p.fatigue.cycles;return {force:service,area,range,cycles,allowable:6900*(.39/cycles)**(1/3),threshold:7*6.894757293};})():undefined;
 return {Cls,Cbs,length,cos,diagonals,member,geometry,combinations,governing,deflection:{value:deflection,limit},...(tr13?{tr13}:{}),...(rodFatigue?{rodFatigue}:{}),
  foundation:{shear:governing.H/geometry.bays,axial:governing.H/geometry.bays*geometry.height/geometry.bayWidth}};
}

export function longitudinalBracingChecks(p:ProjectInput,r:LongitudinalBracingResult):CheckResult[]{
 const b=p.longitudinalBracing!,u=p.units,refs=['asce','aisc-brace-member','tr13-crane'],checks:CheckResult[]=[];
 const add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,caseId?:string)=>checks.push({id:'brace-'+id,group:'Longitudinal bracing',title,demand,capacity,quantity,utilization:demand/capacity,status:demand<=capacity*(1+1e-9)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(demand/capacity).toFixed(4)}`,note,caseId,referenceIds:refs});
 const g=r.governing,G=r.geometry,basis=`${G.bays} braced bay(s) of ${format(G.bayWidth,'length',u,3)} by ${format(G.height,'length',u,3)} in ${G.tiers} tier(s)${G.spans?` (runway span${G.spans.length>1?'s':''} ${G.spans.join(', ')})`:''}; diagonal ${format(r.length,'length',u,3)}. Crane traction Cls ${format(r.Cls,'force',u,3)}${r.Cbs?`, crane stop Cbs ${format(r.Cbs,'force',u,3)}`:''}; existing W ${format(b.existing.W,'force',u,3)}, E ${format(b.existing.E,'force',u,3)}. Governing ${g.equation}: line force ${format(g.H,'force',u,3)}.`;
 checks.push({id:'brace-basis',group:'Longitudinal bracing',title:'Longitudinal bracing · survey and existing forces',status:b.confirmed&&b.source.trim()?'pass':'unverified',equation:'',note:b.confirmed&&b.source.trim()?`Bracing: ${r.member.description}. Existing forces: ${b.source}.`:'Enter the surveyed bracing members and the existing wind and seismic forces on this line with their source, then confirm.',referenceIds:refs});
 add('tension','Longitudinal bracing · diagonal tension',g.force,r.member.tension,'force',b.system==='rod-x'?'T=\\frac{H}{n\\cos\\theta}\\le\\min(\\phi F_{nt}A_b,\\ \\phi_tF_yA_g),\\ F_{nt}=0.75F_u':'T=\\frac{H}{nn_d\\cos\\theta}\\le\\min(\\phi_tF_yA_g,\\ \\phi_tF_uA_e)',`${basis}${r.member.net?` An = ${format(r.member.net.An,'area',u,3)}, U = ${r.member.net.U} (Table D3.1 case 8).`:' Threaded rod (J3.6: F_nt = 0.75F_u, φ = 0.75 / Ω = 2.00) and rod body yielding (D2: φ_t = 0.90 / Ω_t = 1.67).'}${b.system==='rod-x'?' Tension-only rods can loosen under repeated reversal; confirm they are tightened and suitable for the crane duty.':''}`,g.id);
 if(r.member.compression!==undefined){
  add('compression','Longitudinal bracing · diagonal compression',g.force,r.member.compression,'force','P_n=F_{cr}A_e;\\;\\left(\\frac{L_c}{r}\\right)_{E5}',`AISC E5(a) single angle connected through the longer leg, E7 slender legs. ${b.system==='angle-x'?'Crossing diagonals brace each other: L = half the diagonal.':'Single diagonal: L = full diagonal.'} ${basis}`,g.id);
  add('slenderness','Longitudinal bracing · compression slenderness',r.member.slenderness!,200,'ratio','(L_c/r)_{E5}\\le200','AISC E5: the modified slenderness may not exceed 200.');
 }
 add('drift','Longitudinal bracing · crane-level displacement',r.deflection.value,r.deflection.limit,'length',r.tr13?'\\Delta=n_t\\frac{TL}{AE\\cos\\theta}\\le\\min(H/400,\\;2\\,\\mathrm{in})':'\\Delta=n_t\\frac{TL}{AE\\cos\\theta}\\le h/n',r.tr13?`Unfactored single-crane traction, axial elongation of the active diagonals only (connections, columns and foundation flexibility excluded). AIST TR-13 §5.5 with the §5.3 criterion: H/400 or 2 in, whichever is less, H = ${format(r.tr13.height,'length',u,3)} from the column base to the top of the crane girder.`:`Unfactored single-crane traction, axial elongation of the active diagonals only (connections, columns and foundation flexibility excluded). Limit h/${b.driftLimit}.`);
 if(r.tr13){
  if(r.tr13.wind10!==undefined)add('drift-wind','Longitudinal bracing · displacement under the 10-year wind',r.tr13.wind10,r.deflection.limit,'length','\\Delta\\le\\min(H/400,\\;2\\,\\mathrm{in})\\ \\ \\text{(10-yr wind)}',`AIST TR-13 §5.5: the entered 10-year wind force along the runway, ${format(b.wind10!,'force',u,3)}, on the braced line; axial elongation of the active diagonals only.`);
  else checks.push({id:'brace-drift-wind',group:'Longitudinal bracing',title:'Longitudinal bracing · displacement under the 10-year wind',status:'unverified',equation:'\\Delta\\le\\min(H/400,\\;2\\,\\mathrm{in})\\ \\ \\text{(10-yr wind)}',note:`Not established: enter the 10-year wind force along the runway on this braced line (AIST TR-13 §5.5). Limit ${format(r.deflection.limit,'length',u,3)}.`,referenceIds:['tr13-service',...refs]});
 }
 if(r.rodFatigue){
  const f=r.rodFatigue,below=f.range<=f.threshold,stress=(v:number)=>format(v,'stress',u,3);
  add('rod-fatigue','Longitudinal bracing · threaded rod fatigue (A-3.1 item 8.5)',f.range,Math.max(f.allowable,f.threshold),'stress','f_{sr}=\\frac{\\Delta T}{A_t}\\le F_{SR}=\\left(\\frac{C_f}{n_{SR}}\\right)^{0.333}\\ge F_{TH}',
   `AISC 360-16 Table A-3.1 item 8.5 (threaded rods, Cf = 3.9 × 10^8 ksi³, threshold ${stress(f.threshold)}): unfactored single-crane traction ${format(r.Cls,'force',u,3)} gives ${format(f.force,'force',u,3)} in one tension-only rod each time the crane starts or stops (0 to T), on the tensile stress area ${format(f.area,'area',u,3)} of the threaded end and its nut${G.spans?' (the clevis and turnbuckle threads alike)':''}. Stress range f_sr = ${stress(f.range)} against F_TH = ${stress(f.threshold)}: ${below?'below the threshold, no cycle limit (constant amplitude).':'above the threshold, so the cycle count matters.'} ${f.cycles.toExponential(2)} cycles (the runway fatigue count) give F_SR = ${stress(f.allowable)}. Tighten the rods and keep them tight; loose tension-only rods take impact.`);
 }
 // An existing brace that fails: reinforce or replace it (by the engineer of record), with the rod the forces need.
 if(!G.spans){
  const rodFor=(area:number)=>{const d=Math.sqrt(4*area/Math.PI),e=Math.ceil(d/(inch/8)-1e-9)*inch/8;return e;};
  const need=(c:CheckResult|undefined,area:number,what:string)=>{if(!c||c.status!=='fail')return;
   c.note+=` REINFORCE OR REPLACE (engineer of record): ${b.system==='rod-x'?`a rod of at least ${noteLength(rodFor(area),u)} diameter (${format(area,'area',u,3)} ${what})`:`a diagonal of at least ${format(area,'area',u,3)} ${what}`}, with its connections and the braced-bay columns and foundation for the forces here; drawn on S-01 as the (E) braced bay.`;};
  const t=checks.find(c=>c.id==='brace-tension'),phiFnt=available(.75*b.rod.Fu,p.method,.75,2),phiFy=available(b.rod.Fy,p.method,.9,1.67);
  if(b.system==='rod-x')need(t,g.force/Math.min(phiFnt,phiFy),'gross area for 0.75Fu and Fy');else need(t,r.member.area*g.force/r.member.tension,'gross area');
  const fat=checks.find(c=>c.id==='brace-rod-fatigue');
  // Threaded rod fatigue on its tensile stress area, A_t ≈ 0.75 A_b for the sizes used: the gross area that brings f_sr to F_SR.
  if(r.rodFatigue)need(fat,r.rodFatigue.force/Math.max(r.rodFatigue.allowable,r.rodFatigue.threshold)/.75,'gross area, its threaded area at about 0.75 of it for the fatigue range');
 }
 // Between new columns the collector, connections, columns and foundation are designed here (Brace connections, Crane-level strut, New column).
 if(!G.spans)checks.push({id:'brace-by-others',group:'Longitudinal bracing',title:'Collector, brace connections, braced-bay columns & foundation',status:'excluded',equation:'',note:`Not checked here: ${activeStepStrut(p)?`the existing braced bay that the new crane-level strut on the girder line (designed here, Crane-level strut) delivers the line force to, at the girder line over the lower crane-side flange: the connection of the existing bracing to the strut there (its top work point on the girder line, or a member in plan from the strut to it), the brace end connections, the braced-bay columns (with the torque of the line force about their centerline where the bracing works on it), anchors and foundation`:'the crane-level strut or collector from each locating support to the braced bay, the brace end connections (gussets, clevises, bolts, welds), and the braced-bay columns, anchors and foundation'}. Per braced bay under ${g.equation}: base shear ${format(r.foundation.shear,'force',u,3)} and column axial ±${format(r.foundation.axial,'force',u,3)} from overturning, in addition to the columns' other loads.`,referenceIds:refs});
 return checks;
}

import {available} from './aiscStrength';
import {aiscAngleByName} from '../data/aiscAngles';
import {asceCombinations} from './asceCombinations';
import {format} from './units';
import {latexNumber} from './math';
import type {SupportReactionSet} from './supportReactions';
import type {CheckResult,ProjectInput,Section} from './types';
import {aiscShapeByName} from '../data/aiscSections';
import {alongSeismic,bracingDesign,bracingLayout,braceCases,designsBracing} from './newColumnBracing';

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
  return {area:Ab,tension:Math.min(available(.75*b.rod.Fu*Ab,p.method,.75,2),available(b.rod.Fy*Ab,p.method,.9,1.67)),description:`${format(b.rod.diameter,'length',p.units,3)} diameter rod`};
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
 /** Bays, width, work point height and tiers as analysed: from the runway spans and column seat for new columns. */
 geometry:{bays:number;bayWidth:number;height:number;tiers:number;spans?:number[]};
 combinations:BracingCombination[];governing:BracingCombination;
 deflection:{value:number;limit:number};foundation:{shear:number;axial:number};
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
 const service=force(Cls),deflection=geometry.tiers*service*length/(member.area*p.section.E)/cos;
 return {Cls,Cbs,length,cos,diagonals,member,geometry,combinations,governing,deflection:{value:deflection,limit:geometry.height/b.driftLimit},
  foundation:{shear:governing.H/geometry.bays,axial:governing.H/geometry.bays*geometry.height/geometry.bayWidth}};
}

export function longitudinalBracingChecks(p:ProjectInput,r:LongitudinalBracingResult):CheckResult[]{
 const b=p.longitudinalBracing!,u=p.units,refs=['asce','aisc-brace-member','tr13-crane'],checks:CheckResult[]=[];
 const add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,caseId?:string)=>checks.push({id:'brace-'+id,group:'Longitudinal bracing',title,demand,capacity,quantity,utilization:demand/capacity,status:demand<=capacity*(1+1e-9)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(demand/capacity).toFixed(4)}`,note,caseId,referenceIds:refs});
 const g=r.governing,G=r.geometry,basis=`${G.bays} braced bay(s) of ${format(G.bayWidth,'length',u,3)} by ${format(G.height,'length',u,3)} in ${G.tiers} tier(s)${G.spans?` (runway span${G.spans.length>1?'s':''} ${G.spans.join(', ')})`:''}; diagonal ${format(r.length,'length',u,3)}. Crane traction Cls ${format(r.Cls,'force',u,3)}${r.Cbs?`, crane stop Cbs ${format(r.Cbs,'force',u,3)}`:''}; existing W ${format(b.existing.W,'force',u,3)}, E ${format(b.existing.E,'force',u,3)}. Governing ${g.equation}: line force ${format(g.H,'force',u,3)}.`;
 checks.push({id:'brace-basis',group:'Longitudinal bracing',title:'Longitudinal bracing · survey and existing forces',status:b.confirmed&&b.source.trim()?'pass':'unverified',equation:'',note:b.confirmed&&b.source.trim()?`Bracing: ${r.member.description}. Existing forces: ${b.source}.`:'Enter the surveyed bracing members and the existing wind and seismic forces on this line with their source, then confirm.',referenceIds:refs});
 add('tension','Longitudinal bracing · diagonal tension',g.force,r.member.tension,'force',b.system==='rod-x'?'T=\\frac{H}{n_{bays}\\cos\\theta}\\le\\min(0.75F_uA_b\\,\\phi_{0.75},\\;F_yA_b\\,\\phi_{0.9})':'T=\\frac{H}{n_{bays}n_{d}\\cos\\theta}\\le\\min(F_yA_g\\,\\phi_{0.9},\\;F_uUA_n\\,\\phi_{0.75})',`${basis}${r.member.net?` An = ${format(r.member.net.An,'area',u,3)}, U = ${r.member.net.U} (Table D3.1 case 8).`:' Threaded rod (J3.6) and rod body yielding (D2).'}${b.system==='rod-x'?' Tension-only rods can loosen under repeated reversal; confirm they are tightened and suitable for the crane duty.':''}`,g.id);
 if(r.member.compression!==undefined){
  add('compression','Longitudinal bracing · diagonal compression',g.force,r.member.compression,'force','P_n=F_{cr}A_e;\\;\\left(\\frac{L_c}{r}\\right)_{E5}',`AISC E5(a) single angle connected through the longer leg, E7 slender legs. ${b.system==='angle-x'?'Crossing diagonals brace each other: L = half the diagonal.':'Single diagonal: L = full diagonal.'} ${basis}`,g.id);
  add('slenderness','Longitudinal bracing · compression slenderness',r.member.slenderness!,200,'ratio','(L_c/r)_{E5}\\le200','AISC E5: the modified slenderness may not exceed 200.');
 }
 add('drift','Longitudinal bracing · crane-level displacement',r.deflection.value,r.deflection.limit,'length','\\Delta=n_t\\frac{T_sL_d}{AE\\cos\\theta}\\le h/n',`Unfactored single-crane traction, axial elongation of the active diagonals only (connections, columns and foundation flexibility excluded). Limit h/${b.driftLimit}.`);
 // Between new columns the collector, connections, columns and foundation are designed here (Brace connections, Crane-level strut, New column).
 if(!G.spans)checks.push({id:'brace-by-others',group:'Longitudinal bracing',title:'Collector, brace connections, braced-bay columns & foundation',status:'excluded',equation:'',note:`Not checked here: the crane-level strut or collector from each locating support to the braced bay, the brace end connections (gussets, clevises, bolts, welds), and the braced-bay columns, anchors and foundation. Per braced bay under ${g.equation}: base shear ${format(r.foundation.shear,'force',u,3)} and column axial ±${format(r.foundation.axial,'force',u,3)} from overturning, in addition to the columns' other loads.`,referenceIds:refs});
 return checks;
}

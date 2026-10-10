import {format} from './units';
import {flangeTieChecks} from './flangeTieDesign';
import {connectionOptionChecks} from './connectionOptions';
import {capReady,capAttachmentChecks} from './capChecks';
import type { CalculationSnapshot,CheckResult,ProjectInput } from './types';
import type { LapConnection,RunwayDetailResults } from './runwayDetails';
import { available,girderStrength } from './aiscStrength';
import { bearingStiffener,blockShear,boltCapacity,boltProperties,elasticBoltGroup,parallelWeldGroup,plateBearing,compressionResistance,minimumFillet,transverseFilletFatigue } from './connectionStrength';
import { braceSystem,createDetailCollector,restraintStations,fatigueSpectrumBin } from './detailAnalysis';
import { runwayDesignAnalysis } from './designAnalysis';
import { latexNumber,withinLimit } from './math';
import { railChecks } from './railChecks';
import {simpleSupportChecks} from './simpleSupports';
import {bracketChecks} from './bracketDesign';
import {existingBracketChecks} from './existingBracket';
import {endStopChecks} from './endStop';
import {endBearingChecks,activeEndBearing} from './endBearing';

const compared=(id:string,group:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds=['aisc-connections']):CheckResult=>({id,group,title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds});
const resolved=(id:string,title:string,note:string,referenceIds=['aisc-connections']):CheckResult=>({id,group:'Connections',title,status:'not-applicable',equation:'',note,referenceIds});
function lapChecks(p:ProjectInput,c:LapConnection,id:string,title:string,fx:number,fy:number,centralThickness:number,centralFy:number,centralFu:number){
 const m=p.details!.material,method=p.method,n=2*c.rows,points=Array.from({length:c.rows},(_,i)=>[-1,1].map(sign=>({x:sign*c.gauge/2,y:(i-(c.rows-1)/2)*c.pitch}))).flat();
 const M=fy*c.projection,forces=elasticBoltGroup(points,{x:fx,y:fy,moment:M}),demand=Math.max(...forces.map(f=>f.resultant));
 const bolt=boltCapacity({grade:c.grade,diameter:c.diameter,planes:2,surface:c.surface,shear:demand,tension:0,method,patternLength:(c.rows-1)*c.pitch});
 const t=Math.min(centralThickness,2*c.thickness),Fy=Math.min(m.Fy,centralFy),Fu=Math.min(m.Fu,centralFu),width=c.gauge+2*c.edge,height=(c.rows-1)*c.pitch+2*c.edge,dh=bolt.hole+1.5875;
 const A=t*Math.min(width,height),An=t*Math.min(width-2*dh,height-c.rows*dh),S=2*c.thickness*height**2/6;
 const equivalent=Math.hypot(fx,fy)+2*Math.abs(M)/Math.min(c.gauge,(c.rows-1)*c.pitch);
 const shearPath=(c.edge+(c.rows-1)*c.pitch),Agv=2*shearPath*t,Anv=2*(shearPath-(c.rows-.5)*dh)*t,Ant=(c.gauge-dh)*t;
 const transverseAgv=2*(c.edge+c.gauge)*t,transverseAnv=2*(c.edge+c.gauge-1.5*dh)*t,transverseAnt=((c.rows-1)*c.pitch-(c.rows-1)*dh)*t;
 const bearing=plateBearing(c.diameter,bolt.hole,t,Fu,c.edge,Math.min(c.gauge,c.pitch),method);
 const weld=parallelWeldGroup({length:c.weldLength,gauge:centralThickness+c.thickness,size:c.weldSize,Fexx:m.Fexx,method,vx:0,vy:fy,normal:fx,mx:M,my:0,mz:0});
 const note=`Symmetric double-cover connection; ${n} ${c.grade} bolts, two shear/slip planes, threads included, Class ${c.surface} surfaces. Entered geometry governs both plies. Elastic bolt-group eccentricity and full resultant are included; no tension/prying load path is assumed.`;
 return [
  compared(`${id}-pitch`,'Connections',`${title} · pitch`,8/3*c.diameter,Math.min(c.pitch,c.gauge),'length','s\\ge(8/3)d_b',note),
  // 1.5db exceeds Table J3.4 rolled/machine-cut standard-hole minima for the
  // supported 1/2–1-1/2 inch bolts; bearing/tearout is also explicitly checked.
  compared(`${id}-edge`,'Connections',`${title} · edge distance`,1.5*c.diameter,c.edge,'length','e\\ge1.5d_b','Conservative standard-hole edge distance; machine-cut plate edges.'),
  compared(`${id}-bolt`,'Connections',`${title} · bolt-group shear`,demand,bolt.shear,'force','V_i=\\left|\\frac{\\mathbf V}{n}+\\frac{M_z}{\\sum r_j^2}(-y_i,x_i)\\right|',note),
  compared(`${id}-slip`,'Connections',`${title} · cyclic slip resistance`,demand,bolt.slip,'force','R_{n,slip}=\\mu(1.13)T_b n_s',`${note} Pretension ${format(bolt.pretension,'force',p.units,3)} per bolt; applied bolt tension is zero in the defined in-plane double-lap template.`),
  compared(`${id}-bearing`,'Connections',`${title} · hole bearing / tearout`,demand,bearing.capacity,'force','R_n=\\min(1.2l_ctF_u,2.4d_btF_u)',`Deformation at bolt holes is a design consideration. Smallest connected effective ply thickness ${format(t,'length',p.units,3)}; clear distance ${format(bearing.clear,'length',p.units,3)}.`),
  compared(`${id}-net`,'Connections',`${title} · plate net section`,equivalent,available(Fu*An,method,.75,2),'force','R_n=F_uA_n;\\quad A_n=t(b-\\sum d_h)',`Conservative resultant plus eccentric force pair on the least orthogonal net path. Hole deductions include ${format(1.5875,'length',p.units,4)} beyond the nominal hole.`),
  compared(`${id}-gross`,'Connections',`${title} · gross plate shear`,equivalent,available(.6*Fy*A,method,1,1.5),'force','R_n=0.6F_yA_g','Conservative least gross section; includes the eccentric force pair.'),
  compared(`${id}-block`,'Connections',`${title} · block shear`,equivalent,Math.min(blockShear(Agv,Anv,Ant,Fy,Fu,method),blockShear(transverseAgv,transverseAnv,transverseAnt,Fy,Fu,method)),'force','R_n=\\min(0.6F_uA_{nv},0.6F_yA_{gv})+0.5F_uA_{nt}','Checks orthogonal enclosing block paths with Ubs=0.5. Actual double-cover/central-ply geometry; no viewer dimensions are used.'),
  compared(`${id}-plate`,'Connections',`${title} · elastic plate bending`,Math.abs(fx)/(2*c.thickness*height)+Math.abs(M)/S,available(m.Fy,method,.9,1.67),'stress','f=|N|/A+|M|/S','Symmetric cover plates; elastic first yield. Projection is the distance from the bolt group/load transfer line to the supporting weld line.'),
  compared(`${id}-weld`,'Connections',`${title} · eccentric weld group`,weld.demand,weld.capacity,'stress','f_w=\\sqrt{(V_x/A_w-M_zy/J_w)^2+(V_y/A_w+M_zx/J_w)^2+(N/A_w+M_xy/I_x-M_yx/I_y)^2}','Two continuous parallel fillets; all four endpoint stresses evaluated. No directional increase; long-weld reduction is included.'),
  compared(`${id}-weld-base`,'Connections',`${title} · connected metal at weld`,weld.demand*weld.A/(2*c.weldLength*t),available(.6*Fy,method,1,1.5),'stress','f_{base}=f_w A_w/A_{base}','Conservative local connected-metal shear yielding using the same resultant stress distribution.'),
  compared(`${id}-weld-size`,'Connections',`${title} · fillet edge limit`,c.weldSize,Math.min(c.thickness,centralThickness)-1.5875,'length','w\\le t_{min}-1/16\\,in','Weld along a plate edge; full-throat edge buildup is not credited.'),
  compared(`${id}-weld-minimum`,'Connections',`${title} · minimum fillet`,minimumFillet(Math.max(c.thickness,centralThickness)),c.weldSize,'length','w\\ge w_{min,J2.4}','Thicker joined part controls minimum fillet leg size.'),
  compared(`${id}-plate-compression`,'Connections',`${title} · plate compression`,Math.abs(fx),compressionResistance(2*c.thickness*height,c.thickness/Math.sqrt(12),Math.max(2*c.projection,c.thickness),p.section.E,Fy,method).capacity,'force','P_n=F_{cr}A;\\quad L_c=2e','Cover plate projection treated as an unbraced cantilever; no postbuckling strength is credited.'),
  resolved(`${id}-prying`,`${title} · bolt tension / prying`,'Defined symmetric double-lap forces lie in the connected plate plane. Bolt tension and prying do not arise in this template. Out-of-plane connection actions require a different model.')
 ];
}
const differences=(a:RunwayDetailResults,b:RunwayDetailResults)=>Math.max(
 ...(b.existingBracket&&a.existingBracket?(['strength','service'] as const).flatMap(kind=>Object.entries(b.existingBracket![kind]).map(([key,v])=>Math.abs(v.value-(a.existingBracket![kind][key]?.value??0))/Math.max(v.value,key==='seatDeflection'?1e-3:1))):[]),
 ...(b.existingBracket&&a.existingBracket?b.existingBracket.fatigue.flatMap((f,i)=>(['seatStress','vertical','rootMoment','seatMoment'] as const).map(k=>Math.abs(f[k]-a.existingBracket!.fatigue[i][k])/Math.max(f[k],1))):[]),
 ...(['normalStress','shearStress','railDisplacement','twist','criticalMultiplier','braceForce'] as const).map(k=>Math.abs(a[k]-b[k])/Math.max(Math.abs(b[k]),k==='twist'?1e-5:1)),
 ...(b.bracket&&a.bracket?Object.entries(b.bracket.strength).map(([key,v])=>Math.abs(v.value-(a.bracket!.strength[key]?.value??0))/Math.max(v.value,1)):[]),
 ...(b.bracket&&a.bracket?Object.entries(b.bracket.service).map(([key,v])=>Math.abs(v.value-(a.bracket!.service[key]?.value??0))/Math.max(v.value,key==='rotation'?1e-6:key==='deflection'?1e-3:1)):[]),
 ...(b.bracket&&a.bracket?b.bracket.fatigue.flatMap((f,i)=>(['rib','seat','rootWeld','seatWeld'] as const).map(k=>Math.abs(f[k]-a.bracket!.fatigue[i][k])/Math.max(f[k],1))):[]),
 ...b.fatigue.map((f,i)=>Math.abs(a.fatigue[i].range-f.range)/Math.max(f.range,1)),
 ...(b.cap&&a.cap?[Math.abs(a.cap.longitudinalFlow-b.cap.longitudinalFlow)/Math.max(b.cap.longitudinalFlow,1),...b.cap.fatigueFlows.map((q,i)=>Math.abs(a.cap!.fatigueFlows[i]-q)/Math.max(q,1))]:[])
);
export function completeRunwayChecks(s:CalculationSnapshot):CheckResult[]{
 const p=s.input,d=p.details,props=s.properties!,a=s.designAnalysis!;
 if(!d||!a)return [];
 // A different connection cannot inherit the stiffness, fatigue or resistance
 // of the existing pair-of-flat-bars / rectangular-rib model.
 if(connectionOptionChecks(p).length)return [];
 const checks:CheckResult[]=[];
 if((p.section.kind!=='rolled'&&!capReady(p))||!p.section.catalogueId){checks.push({id:'detail-applicability',group:'Strength',title:'Detailed runway model applicability',status:'unsupported',equation:'',referenceIds:['vlasov'],note:'Requires a catalogue rolled W or a capped W with complete channel material, service-class and continuous-attachment inputs.'});return checks;}
 if(!p.aist||!p.aist.runwayOnly||!p.connections.enabled)return [];
 const designFy=p.section.kind==='cap'?Math.min(p.section.Fy,p.capDesign!.Fy):p.section.Fy;
 const strength=girderStrength(p,props),steps=p.cranes.length===1?40:p.cranes.length===2?12:6;
 const run=(travel:number,mesh:number)=>{const c=createDetailCollector(p,props,mesh);runwayDesignAnalysis(p,props,strength,travel,20,c.observe);return c.finish();};
 let coarse=run(steps,20),fine=run(steps*2,20),travel=steps*2;
 let travelChange=differences(coarse,fine);
 while(travelChange>.01&&travel<steps*(p.cranes.length===1?16:4)){coarse=fine;travel*=2;fine=run(travel,20);travelChange=differences(coarse,fine);}
 let spatial=run(travel,40),meshChange=differences(fine,spatial);
 if(meshChange>.01){fine=spatial;spatial=run(travel,80);meshChange=differences(fine,spatial);}
 const r=spatial;r.travelChange=travelChange;r.meshChange=meshChange;s.detailResults=r;
 if(r.bracket)checks.push(...bracketChecks(p,r.bracket));
 if(r.existingBracket)checks.push(...existingBracketChecks(p,r.existingBracket));
 const add=(...args:Parameters<typeof compared>)=>checks.push(compared(...args));
 add('detail-equilibrium','Analysis','Lateral / torsional equation residual',r.residual,1e-7,'ratio','\\epsilon_K=\\|Ku-f\\|_{scaled}','Banded finite-element solution; all sampled strength, single-crane service and fatigue-bin states.',['vlasov']);
 add('detail-travel','Analysis','Detailed load-position refinement',travelChange,.01,'ratio','\\epsilon_{travel}\\le0.01','Includes combined normal/shear stresses, rail movement, twist, elastic critical factor, brace force and all fatigue details.',['mechanics','vlasov']);
 add('detail-mesh','Analysis','Lateral / warping mesh refinement',meshChange,.01,'ratio','\\epsilon_{mesh}\\le0.01','Each wheel, support and brace is an exact mesh node. Checks both sides of element boundaries and interior stations.',['vlasov']);
 const normalEquation=p.section.kind==='cap'?'f_n\\le |N|/A+|M_x|/S_{x,min}+E|v^{\\prime\\prime}|b_{cap}/2+|M_x\\theta|/S_y+E|\\theta^{\\prime\\prime}|\\omega_{max}':'f_n\\le |P|/A+|M_x|/S_x+E|v^{\\prime\\prime}|b_f/2+|M_x\\theta|/S_y+E|\\theta^{\\prime\\prime}|h_0b_f/4';
 add('torsion-normal','Strength','Combined normal stress including warping',r.normalStress,available(designFy,p.method,.9,1.67),'stress',normalEquation,'Conservative sum of component magnitudes. Coupled second-order response includes above-shear-center load effects and finite brace stiffness; 0.8 elastic stiffness used for strength response. F2 or capped F5/H1 remain separate checks. Capped normal stresses use actual extreme fibres and integrated sectorial coordinates, with the shear-center offset in loads and restraint springs.',['aisc-h3','vlasov','ltb-energy']);
 add('torsion-shear','Strength','Combined shear including Saint-Venant / warping',r.shearStress,available(.6*designFy,p.method,.9,1.67),'stress','\\tau_t=Gt\\theta^{\\prime};\\quad\\tau_w=-E(S_\\omega/t)\\theta^{\\prime\\prime\\prime}','Checks flange and web shear bounds, adding direct shear and torsional components by magnitude. No torsional plastic redistribution.',['aisc-h3','vlasov']);
 add('torsion-stability','Strength','Load-height / lateral-torsional stability',p.method==='LRFD'?1/.9:1.67,r.criticalMultiplier,'ratio','\\det[K_e+\\lambda K_g(M,N,Pz)]=0','Lowest sampled elastic critical load multiplier with 0.8 member and brace stiffness. Major-moment coupling, axial geometric stiffness, above-shear-center wheel forces and conservatively elevated UDL are included. AISC F2/H1 resistances also control.',['aisc-h3','ltb-energy']);
 add('rail-head','Serviceability','Rail-head lateral movement including twist',r.railDisplacement,Math.min(...p.spans)/Math.max(400,p.lateralLimit,d.criteria.railLateralLimit),'length','u_{rail}=v+(y_{rail}-y_s)\\theta','Single static crane; finite girder-side tie/connection flexibility. Building interfaces are assumed fixed and their framing/foundations are excluded.',['tr13-girder','criteria','vlasov']);
 add('rail-twist','Serviceability','Rail rotation',r.twist,d.criteria.twistLimit,'ratio','|\\theta_{rail}|\\le\\theta_{owner}','Entered owner/supplier twist criterion in radians. This is distinct from girder lateral bending deflection.',['criteria','vlasov']);
 const brace=braceSystem(p),Cd=p.system==='continuous'?2:1,spacing=Math.min(p.lateralBraceSpacing,p.aist.bottomBraceSpacing),imperfection=.02*a.moment*Cd/props.h0+.01*a.axial,requiredK=(p.method==='LRFD'?1/.75:2)*(10*a.moment*Cd/props.h0+8*a.axial)/spacing;
 add('brace-member','Bracing','Both-flange tie strength',r.demands.brace+imperfection,brace.capacity,'force','P_{br}=|H_{flange}|+0.02M_rC_d/h_0+0.01P_r','Two symmetric flat bars at each flange. Checks member compression buckling and net-section tension; full concurrent horizontal reaction plus conservative flexural/axial imperfection demands.',['aisc-brace','aisc-e']);
 add('brace-stiffness','Bracing','Brace and connection stiffness in series',requiredK,brace.stiffness,'stiffness','k_{eff}=c^2\\left[L/(2EA)+2/k_{connection}+c_{local}\\right]^{-1}','Gusset axial strain and bolt shear deformation are included at both ends. Direct flange saddles additionally include local flange, saddle, gusset and receiving-flange flexibility. Building deformation is excluded at the stated interface. Top-flange load amplification is included in Appendix 6 requirements.',['aisc-brace']);
 checks.push(...lapChecks(p,d.brace.connection,'tie','Flange tie connection',(r.demands.brace+imperfection)/brace.cos,0,d.brace.gussetThickness,d.material.Fy,d.material.Fu));
 const bearingBolts=activeEndBearing(p);
 if(bearingBolts)checks.push(...endBearingChecks(p,bearingBolts,{analysis:a,lateral:r.demands.brace+imperfection}));
 else checks.push(...lapChecks(p,d.end,'end','Girder end / longitudinal connection',a.axial,Math.max(a.reaction,a.uplift),p.section.tw,p.section.Fy,p.section.Fu));
 const bs=d.bearing,m=d.material,stiffener=bearingStiffener({width:bs.stiffenerWidth,thickness:bs.stiffenerThickness,cope:bs.cope,webThickness:p.section.tw,webDepth:strength.h,flangeThickness:p.section.tf,loadedWidth:p.section.bf,E:p.section.E,Fy:Math.min(m.Fy,p.section.Fy),method:p.method});
 add('stiffener-column','Local forces','Paired full-depth bearing stiffeners',a.reaction,stiffener.compression.capacity,'force','L_c=0.75h;\\quad A=2b_st_s+12t_w^2;\\quad P_n=F_{cr}A','Uses the smaller end effective web strip at every support. Fitted stiffeners, full-depth web welds; no reliance on the bare web strength.',['aisc-connections','aisc-e']);
 add('stiffener-bearing','Local forces','Fitted stiffener-end bearing',a.reaction,stiffener.bearing,'force','R_n=1.8F_y A_{pb}','Actual cope deducted from both fitted bearing areas; requires milled/fitted contact to the loaded flange.',['aisc-connections']);
 add('stiffener-width','Detailing','Stiffener minimum width',stiffener.minimumWidth,bs.stiffenerWidth,'length','b_s+t_w/2\\ge b_f/3','J10.8 additional stiffener geometry.');
 add('stiffener-thickness','Detailing','Stiffener minimum thickness',stiffener.minimumThickness,bs.stiffenerThickness,'length','t_s\\ge\\max(t_f/2,b_s/16)','J10.8 additional stiffener geometry.');
 const stiffWeld=available(.6*m.Fexx*(bs.weldSize/Math.sqrt(2))*4*(strength.h-2*bs.cope),p.method,.75,2);
 add('stiffener-weld','Connections','Stiffener-to-web load transfer',a.reaction,stiffWeld,'force','R_n=0.6F_{EXX}(0.707w)(4h)','Four continuous full-depth fillet lines transfer the full support reaction conservatively, without reducing demand by web resistance.');
 const diaphragmForce=r.demands.brace+imperfection,diaphragmMoment=diaphragmForce*strength.h;
 add('stiffener-lateral-flexure','Local forces','Restraint diaphragm lateral flexure',diaphragmMoment/(2*bs.stiffenerThickness*bs.stiffenerWidth**2/6),available(m.Fy,p.method,.9,1.67),'stress','M_d=H_{brace}h;\\quad S_d=2t_sb_s^2/6','Paired full-depth plates at every flange-restraint station. Conservative full-height cantilever for the larger flange reaction plus imperfection, with no web participation.');
 add('stiffener-combined-weld','Connections','Diaphragm combined reaction / lateral welds',a.reaction+8*diaphragmForce,stiffWeld,'force','R_{eq}=R+2H+6(Hh)/h','Conservative direct-plus-moment stress bound on the four web weld lines, including the full vertical reaction and both lateral flange actions. Fitted ends also require continuous flange fillets.');
 const bearingPressure=a.reaction/(bs.width*bs.length),cantilever=Math.max((bs.width-(2*bs.stiffenerWidth+p.section.tw))/2,(bs.length-bs.stiffenerThickness)/2);
 add('bearing-plate','Connections','Bearing plate flexure',6*(bearingPressure*cantilever**2/2)/bs.thickness**2,available(m.Fy,p.method,.9,1.67),'stress','m=qa^2/2;\\quad f=6m/t_p^2','Uniform contact over the entered steel seat plate; conservative longest cantilever from the stiffener load footprint. Enabled welded brackets have a separate Column bracket check group; full frame capacity is outside scope.');
 add('bearing-contact','Connections','Steel bearing contact',bearingPressure,available(1.8*Math.min(m.Fy,p.section.Fy),p.method,.75,2),'stress','f_b=R/(b_p l_p)\\le1.8F_y','Fitted steel-to-steel contact. No concrete/foundation resistance is evaluated.');
 if(bearingBolts)add('hold-down-model','Connections','End bearing uplift resistance',a.uplift,4*Math.min(...checks.filter(c=>['end-bearing-locating-tension'].includes(c.id)).map(c=>c.capacity??0)),'force','R_{uplift}\\le4\\phi R_{nt}','Four bolts through the bottom flange, bearing plate and seat at each girder end resist uplift; see End bearings.');
 else add('hold-down-model','Connections','End connection uplift resistance',a.uplift,Math.min(...checks.filter(c=>['end-bolt','end-slip','end-bearing','end-net','end-block'].includes(c.id)).map(c=>c.capacity??0)),'force','R_{uplift}\\le R_{end}','Uplift uses the same in-plane double-cover end connection; that connection is also checked conservatively for the full maximum reaction plus longitudinal action.');
 add('rotation-clearance','Detailing','Simple-end rotation clearance',p.section.d*a.endRotation,d.criteria.rotationClearance,'length','g_{required}=\\theta_{end,max}d','Maximum exact nodal rotation from all factored vertical load combinations, including dead load and impact, bounds the end rotation allowance. Clear flange ends and flexible end plates are required; the connection must not impose a moment fixity.',['mechanics','criteria']);
 for(const f of r.fatigue)add(`detail-fatigue-${f.id}`,'Fatigue',f.name,f.damage,1,'ratio','D=\\sum_i n_i/N_i(\\Delta f_i)\\le1',`${f.reference}. Each duty bin is analyzed with its lift fraction; empty and absent states and reversed half side thrust are included. Stress includes major/minor bending and warping.${f.id.startsWith('RC')?' Local keeper bending uses that bin\'s unfactored Cds + lift fraction × Cvs + 0.5 Css forces, with no impact. Full local reversal is conservatively superposed on the global range.':''}`,['aisc-fatigue','tr13-load','vlasov']);
 add('fatigue-peak-detailed','Fatigue','Elastic peak stress including warping and dead load',Math.max(r.normalStress,...r.fatigue.map(f=>f.peak)),.66*designFy,'stress','f_{peak}\\le0.66F_y','Includes dead load, entered uniform live load, signed cyclic extrema and warping. The factored strength stress envelope is also used as a conservative peak bound.',['aisc-fatigue']);
 // In addition to the spectrum, bound all cycles by the largest detail range.
 // This check avoids reliance on a cumulative-damage/endurance extrapolation.
 for(const f of r.fatigue)add(`detail-full-cycle-${f.id}`,'Fatigue',`${f.name} · all-cycle bound`,f.range,fatigueSpectrumBin(f.category as 'A',f.range,p.fatigue.cycles).allowable,'stress','\\Delta f_{max}\\le6900(C_f/n_{total})^{1/3}','Largest duty-bin range assigned to all cycles, without endurance-threshold credit; keeper details include local flange bending.',['aisc-fatigue']);
 const totalCycles=d.spectrum.reduce((n,b)=>n+b.cycles,0),weldRange=Math.max(55,690*(1.5/totalCycles)**.167);
 const tieArea=2*d.brace.connection.weldLength*d.brace.connection.weldSize/Math.sqrt(2),endArea=2*d.end.weldLength*d.end.weldSize/Math.sqrt(2);
 add('tie-weld-fatigue','Fatigue','Flange-tie weld throat fatigue',r.demands.braceFatigue/(brace.cos*tieArea),weldRange,'stress','F_{SR}=\\max[55,690(1.5/n_{SR})^{0.167}]','Category F, AISC Table A-3.1 item 8.2. Full envelope range applied to every duty cycle conservatively; no fractional-duty reduction.',['aisc-fatigue']);
 const root=(id:string,title:string,range:number,t:number,w:number)=>{const cap=transverseFilletFatigue(t,w,totalCycles);add(id,'Fatigue',title,range,cap.capacity,'stress','R_{FIL}=\\min[1,(0.103+1.24w/t_p)/t_p^{0.167}];\\quad F_{SR}=6900R_{FIL}(4.4/n)^{0.333}',`Plate stress at the paired transverse fillet root; RFIL=${cap.reduction.toFixed(4)}. No threshold for RFIL<1. Category C toe also bounds the root model.`,['aisc-fatigue']);};
 if(!bearingBolts){
 add('end-weld-fatigue','Fatigue','End weld-group fatigue',r.demands.verticalFatigue/endArea*(1+6*d.end.projection/d.end.weldLength),weldRange,'stress','\\Delta f_w\\le F_{SR,F}','Conservative direct-plus-eccentric full reaction range applied to every duty cycle. Longitudinal force is separately checked for full reversal below.',['aisc-fatigue']);
 add('longitudinal-fatigue','Fatigue','Combined end-reaction / traction weld fatigue',(r.demands.verticalFatigue*(1+6*d.end.projection/d.end.weldLength)+2*Math.max(...p.cranes.map(c=>c.longitudinal)))/endArea,weldRange,'stress','\\Delta f_w\\le[\\Delta R(1+6e/L_w)+2C_{ls}]/A_w','Conservative sum of full reaction range including eccentricity and full traction reversal for every duty cycle. Category F; no concurrency or spectrum reduction credit.',['aisc-fatigue']);
 const endPlateRange=(2*Math.max(...p.cranes.map(c=>c.longitudinal)))/(2*d.end.thickness*d.end.weldLength)+6*r.demands.verticalFatigue*d.end.projection/(2*d.end.thickness*d.end.weldLength**2);
 root('end-root-fatigue','End plates · weld-root normal fatigue',endPlateRange,d.end.thickness,d.end.weldSize);
 }
 root('tie-root-fatigue','Tie gusset · weld-root normal fatigue',r.demands.braceFatigue/(brace.cos*d.brace.gussetThickness*d.brace.connection.weldLength),d.brace.gussetThickness,d.brace.connection.weldSize);
 add('stiffener-fatigue','Fatigue','Bearing stiffeners · plate fatigue',r.demands.verticalFatigue/(2*(bs.stiffenerWidth-bs.cope)*bs.stiffenerThickness)+r.demands.braceFatigue*strength.h/(2*bs.stiffenerThickness*bs.stiffenerWidth**2/6),fatigueSpectrumBin('C',1,totalCycles).allowable,'stress','\\Delta f=\\Delta R/A_{st};\\quad F_{SR,C}=6900(4.4/n)^{1/3}','Sum of full reaction axial range and full lateral-brace bending range through the stiffener pair, applied to every cycle.',['aisc-fatigue']);
 add('stiffener-weld-fatigue','Fatigue','Bearing stiffeners · weld throat fatigue',(r.demands.verticalFatigue+8*r.demands.braceFatigue)/(4*(strength.h-2*bs.cope)*bs.weldSize/Math.sqrt(2)),weldRange,'stress','\\Delta f_w=\\Delta R/A_w','Effective weld length excludes both end copes; full reaction range for all cycles.',['aisc-fatigue']);
 add('stiffener-weld-minimum','Detailing','Bearing stiffener minimum fillet',minimumFillet(Math.max(bs.stiffenerThickness,p.section.tw)),bs.weldSize,'length','w\\ge w_{min,J2.4}','Continuous welds both sides of both plates.');
 add('stiffener-weld-maximum','Detailing','Bearing stiffener fillet edge limit',bs.weldSize,Math.min(bs.stiffenerThickness,p.section.tw)-1.5875,'length','w\\le t_{min}-1/16\\,in','Full-throat edge buildup not credited.');
 const gusset=d.brace.gussetThickness,gwidth=d.brace.connection.gauge+2*d.brace.connection.edge;
 add('tie-gusset-compression','Bracing','Tie gusset compression buckling',(r.demands.brace+imperfection)/brace.cos,compressionResistance(gwidth*gusset,gusset/Math.sqrt(12),2*d.brace.connectionLength,p.section.E,m.Fy,p.method).capacity,'force','P_n=F_{cr}A;\\quad L_c=2L_g','Unsupported gusset treated as a cantilever; full central-plate force, no beneficial load spreading.',['aisc-e']);
 checks.push(...flangeTieChecks(s,(r.demands.brace+imperfection)/brace.cos));
 checks.push(...railChecks(s),...capAttachmentChecks(s),...simpleSupportChecks(p,a.endRotation),...endStopChecks(p,{analysis:a,strength,props,holdDown:checks.find(c=>c.id==='hold-down-model')?.capacity??0}));

 return checks;
}

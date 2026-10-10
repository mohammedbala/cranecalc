import type {ProjectInput,CheckResult,CalculationSnapshot} from './types';
import {flangeTieGeometry} from './tieGeometry';
import {format} from './units';
import {available} from './aiscStrength';
import {minimumFillet,parallelWeldGroup,transverseFilletFatigue} from './connectionStrength';
import {aiscShapeByName} from '../data/aiscSections';
/** Elastic local-component bounds. No yield-line redistribution, contact
 * spreading beyond the saddle length, or global receiver stiffness is credited. */
export function flangeTieResponse(p:ProjectInput,F:number){
 const g=flangeTieGeometry(p)!;const d=p.details!,t=d.brace,a=g.attachment,E=p.section.E;
 const h=g.sides.includes(-1)?Math.max(g.topDrop,g.bottomDrop):g.topDrop,H=h-a.saddleThickness,L=g.rootLength,B=a.saddleLength,w=a.weldSize;
 const M=F*H,flangeM=F*h;
 const weld=(gauge:number,moment:number)=>parallelWeldGroup({length:L,gauge,size:w,Fexx:d.material.Fexx,method:p.method,vx:0,vy:F,normal:0,mx:moment,my:0,mz:0});
 const gusset=6*M/(t.gussetThickness*L**2)+1.5*F/(t.gussetThickness*L);
 // Vertical line load at the gusset is bounded by 6M/L^2. Simply supported
 // saddle strips span B, with center load q: m=qB/4. Add direct shear.
 const saddle=9*M*B/(L**2*a.saddleThickness**2)+1.5*F/(L*a.saddleThickness);
 const flange=6*flangeM/(B*p.section.tf**2)+1.5*F/(B*p.section.tf);
 const r=g.receiver,hg=g.columnGusset,e=Math.max(...g.stations.map(v=>Math.abs(v.tieX-v.station)))+t.gussetThickness/2;
 // Each root gets its own full-height column flange strip; adjacent strips
 // cannot overlap (separate geometry check). Other frame loads excluded. A
 // column by others has no local strip here; its flexibility is excluded with the building.
 const column=r?6*F*e/(hg*r.flangeThickness**2)+1.5*F/(hg*r.flangeThickness):0;
 const rootWeld=F/(2*hg*t.connection.weldSize/Math.sqrt(2));
 const flangeI=B*p.section.tf**3/12,columnI=r?hg*r.flangeThickness**3/12:Infinity;
 // The gusset delivers F·h to the flange as a linear couple along the saddle root (the same distribution as
 // its weld group): the strip moment is F·h across the web gap, then (1-ξ)²(1+2ξ) along the root, giving
 // rotational compliance [g_web + (13/35)L]/(EI_strip). No composite saddle or bearing stiffener credit.
 const compliance=h*h*((g.rootStart-p.section.tw/2)+13/35*L)/(E*flangeI)+3*H*H*B**3/(E*a.saddleThickness**3*L**3)+4*H**3/(E*t.gussetThickness*L**3)+e**3/(3*E*columnI);
 return {gusset,saddle,flange,column,rootWeld,gussetWeld:weld(t.gussetThickness,M),saddleWeld:weld(B,flangeM),compliance,h,H,L,B};
}
export function flangeTieChecks(s:CalculationSnapshot,force:number):CheckResult[]{
 const p=s.input,g=flangeTieGeometry(p),d=p.details;if(!g||!d||!s.detailResults)return [];
 const a=g.attachment,t=d.brace,c=t.connection,m=d.material,r=flangeTieResponse(p,force),cyc=p.fatigue.cycles;
 const f=flangeTieResponse(p,s.detailResults.demands.braceFatigue),out:CheckResult[]=[];
 const add=(id:string,title:string,demand:number,capacity:number,equation:string,note:string,quantity:CheckResult['quantity']='stress')=>out.push({id:`flange-tie-${id}`,group:'Flange attachment',title,demand,capacity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&demand<=capacity*(1+1e-9)?'pass':'fail',quantity,equation,note,referenceIds:['aisc-connections','aisc-fatigue','flange-saddle-mechanics']});
 const note='Direct flange saddle; elastic strip bounds with no composite saddle/flange credit. Full tie force including bracing imperfection. Local attachment only; imposed movement is checked under Tie movement and the building frame is excluded.';
 const byOthers=(id:string,title:string)=>out.push({id:`flange-tie-${id}`,group:'Flange attachment',title,status:'excluded',equation:'',note:`The receiving column is by others. Its flange must take the tie root force ${format(force,'force',p.units,3)} (strength) and range ${format(s.detailResults!.demands.braceFatigue,'force',p.units,3)} (fatigue) at each gusset; see the interface forces.`,referenceIds:['aisc-connections']});
 add('gusset','Flange gusset · elastic stress',r.gusset,available(m.Fy,p.method,.9,1.67),'f_g=6FH/(t_gL_w^2)+1.5F/(t_gL_w)',note);
 add('saddle','Saddle plate · elastic strip stress',r.saddle,available(m.Fy,p.method,.9,1.67),'f_s=9FHB/(L_w^2t_s^2)+1.5F/(L_wt_s)',note+' Transverse strips simply supported at the two outer weld lines.');
 add('flange','Girder flange · local elastic stress',r.flange,available(p.section.Fy,p.method,.9,1.67),'f_f=6Fh/(Bt_f^2)+1.5F/(Bt_f)',note+' Strip width is only the actual saddle length along the runway.');
 if(g.receiver)add('column','Column flange at tie · local elastic stress',r.column,available(g.receiver.Fy,p.method,.9,1.67),'f_c=6Fe/(h_gt_c^2)+1.5F/(h_gt_c)',note+` Receiving flange: ${g.receiver.source}. Outstand e includes half the gusset thickness; no global axial/lateral interaction approval.`);
 else byOthers('column','Column flange at tie · local elastic stress');
 for(const [id,title,weld] of [['gusset-weld','Gusset-to-saddle weld',r.gussetWeld],['saddle-weld','Saddle-to-flange weld',r.saddleWeld]] as const)add(id,title,weld.demand,weld.capacity,'f_w=\\max\\sqrt{(F/A_w)^2+(My/I_w)^2}',note+' Four weld endpoints; no directional strength increase.');
 add('column-weld','Column tie root weld',r.rootWeld,available(.6*m.Fexx,p.method,.75,2),'f_w=F/(2h_gw/\\sqrt2)',note+' Weld length is the full column gusset height.');
 const E1=6900*(.39/cyc)**(1/3),C=6900*(4.4/cyc)**(1/3),weldF=Math.max(55,690*(1.5/cyc)**.167);
 add('saddle-fatigue','Saddle plate · all-cycle fatigue bound',f.saddle,E1,'\\Delta f_s\\le6900(0.39/N)^{1/3}','Conservative Category E-prime for welded attachment; full tie range at all cycles, no endurance credit.');
 add('gusset-fatigue','Flange gusset · weld-root fatigue',f.gusset,transverseFilletFatigue(t.gussetThickness,a.weldSize,cyc).capacity,'\\Delta f_g\\le F_{SR,C^{\\prime\\prime}}','Transverse fillet root at the saddle; includes eccentric bending and direct shear by addition.');
 if(g.receiver)add('column-fatigue','Column flange at tie · local fatigue',f.column,E1,'\\Delta f_c\\le6900(0.39/N)^{1/3}','Conservative Category E-prime local tie action only. Cyclic building-frame stresses require separate combination.');
 else byOthers('column-fatigue','Column flange at tie · local fatigue');
 add('weld-fatigue','Flange attachment welds · all-cycle fatigue',Math.max(f.gussetWeld.demand,f.saddleWeld.demand,f.rootWeld),weldF,'\\Delta f_w\\le F_{SR,F}','Largest elastic weld range from the full brace-force range, applied to every cycle.');
 add('column-root-fatigue','Column gusset root · normal fatigue',s.detailResults.demands.braceFatigue/(t.gussetThickness*g.columnGusset),Math.min(C,transverseFilletFatigue(t.gussetThickness,c.weldSize,cyc).capacity),'\\Delta f_p=\\Delta F/(t_gb_g)','Column-side paired fillet root; no threshold credit for RFIL below one.');
 const required=minimumFillet(Math.max(a.saddleThickness,t.gussetThickness,p.section.tf));
 add('weld-minimum','Flange attachment · minimum weld',required,a.weldSize,'w\\ge w_{min,J2.4}','Thickest joined plate.', 'length');
 add('weld-maximum','Flange attachment · weld edge limit',a.weldSize,Math.min(a.saddleThickness,t.gussetThickness,p.section.tf)-1.5875,'w\\le t_{min}-1/16\\,in','No edge buildup credited.','length');
 const shape=aiscShapeByName(p.section.catalogueId??''),fillet=(shape?shape.kdes*25.4-p.section.tf:0)+a.clearance;
 add('root-clearance','Saddle · rolled-root clearance',fillet,a.webGap,'g_{web}\\ge(k_{des}-t_f)+c','Nominal design fillet bound plus entered clearance; verify actual rolling tolerances.','length');
 add('stiffener-clearance','Saddle weld · bearing-stiffener clearance',a.saddleLength/2+a.weldSize+d.bearing.stiffenerThickness/2+d.bearing.weldSize+a.clearance,a.longitudinalSetback,'s_x\\ge B/2+w_s+t_{st}/2+w_{st}+c','Conservative orthogonal material/weld envelope.','length');
 const need=2*t.thickness+t.gussetThickness+2*c.diameter,clear=2*Math.min(...g.stations.filter(v=>v.station>0&&v.station<p.spans.reduce((a,b)=>a+b,0)).map(v=>Math.abs(v.tieX-v.station)));
 if(Number.isFinite(clear))add('adjacent-hardware','Adjacent ties · exposed hardware separation',need+a.clearance,clear,'s_{ties}\\ge2t_b+t_g+2d_b+c','Both independent end bolt assemblies, including projected heads/nuts/washers.','length');
 return out;
}

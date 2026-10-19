import {categoryF,finiteLife} from './fatigueConstants';
import {stepTieColumn} from './steppedColumnInputs';
import type {ProjectInput,CheckResult,CalculationSnapshot} from './types';
import {flangeTieGeometry,stiffenerTieGeometry,stiffenerTieJoint,gussetRotation} from './tieGeometry';
import {format} from './units';
import {available} from './aiscStrength';
import {filletMinimum,parallelWeldGroup,transverseFilletFatigue} from './connectionStrength';
import {aiscShapeByName} from '../data/aiscSections';
import {tieColumn} from './craneColumnInputs';
/**
 * Width of the tied girder flange that carries the saddle couple F·h to the web in elastic plate bending: the saddle
 * length B, a 45° spread toward the bearing stiffener over the distance a from the toe of the web fillet (k₁) to the
 * centroid of the saddle end fillets across the flange, and toward the girder end as far as the free flange beyond the
 * end fillet toe, s_e: b_e = B + a + min(a, s_e). Basis: the elastic dispersion of a load on a cantilever plate to its
 * clamped edge (an effective width of about twice the load distance for a concentrated load at the free edge of a long
 * cantilever plate, Jaramillo 1950), stopped by the free girder end. Checked against a Reissner-Mindlin plate model of
 * the flange outstand, clamped at the fillet toe, free at the flange tip and at the girder end and held on the bearing
 * stiffener line, under the couple on the two end fillets or bearing on the saddle footprint (W12X40 to W36X247,
 * saddles 3 to 4 in long, from the default setback to the end fillet at the girder end): the root moment, averaged
 * over t_f along the flange, is below F·h/b_e, by 1.5% where the end fillet reaches the girder end of an 8 in flange
 * and by 15% to 55% at the default setback; the end-fillet toes see a much smaller longitudinal bending.
 * The strip of width B alone, with no spread through the continuous flange, is the screening bound.
 */
export function flangeEffectiveWidth(p:ProjectInput,g=flangeTieGeometry(p)!){
 const b=p.section,at=g.attachment,shape=aiscShapeByName(b.catalogueId??''),k1=b.tw/2+(shape?shape.kdes*25.4-b.tf:0),B=at.saddleLength;
 const a=Math.max(0,(g.rootStart+g.rootEnd)/2-k1);
 // Free flange from the toe of the saddle end fillet to the girder end, the nearer end of every saddle.
 const end=Math.max(0,Math.min(...g.stations.map(v=>v.end==='left'?v.tieX-B/2-v.start:v.finish-v.tieX-B/2))-at.weldSize);
 return {B,a,k1,end,width:B+a+Math.min(a,end)};
}
/**
 * Width of the receiving column flange that carries the tie root force, e from the column web, to the toe of the column
 * web fillet in elastic plate bending: the column gusset height h_g plus a spread along the column over the distance x
 * from the fillet toe to the gusset (x/2 each way), stopped by a column top less than x above the gusset:
 * b_c = h_g + min(x, s_top). Checked against a Reissner-Mindlin plate model of the column flange outstand (clamped at
 * the fillet toe, free at the flange tip, the column continuing or ending 1 to 2 1/2 in above the gusset; W14X61 to
 * W14X257, gussets 5 3/4 to 8 in tall, the force on the two gusset root fillets): the root moment averaged over t_f is
 * at most 2.5% above F·x/b_c (the narrow W14X61 with an 8 in gusset) and up to 22% below it on the wider flanges; the
 * check takes the lever e from the web centerline, 1.5 to 1.9 times x. The column top above the gusset: the surveyed
 * or new column's height, else the girder top. With ties at both girder flanges the spread toward the other gusset
 * stops at half the clear gap between them.
 */
export function columnFlangeWidth(p:ProjectInput,g=flangeTieGeometry(p)!){
 const d=p.details!,b=d.bracket,tc=tieColumn(p),col=tc?.enabled?{...tc,...stepTieColumn(p)}:tc,hg=g.columnGusset,s=p.section;
 const flange=g.receiver?.flangeThickness??0,web=b?.enabled?b.receiver.webThickness:col?.enabled?col.tw:0,shape=aiscShapeByName(col?.shape??'');
 // Fillet toe from the catalogue shape when it is the receiving section, else the web face.
 const k1=web/2+(shape&&Math.abs(shape.tf*25.4-flange)<=1.5875?Math.max(0,shape.kdes-shape.tf)*25.4:0);
 const x=Math.max(0,Math.max(...g.stations.map(v=>Math.abs(v.tieX-v.station)))-k1);
 // Column above the top of the gusset: tie line from the seat, the bearing plate under the girder.
 const gussetTop=d.bearing.thickness+s.d/2+g.topCenter+hg/2;
 const top=col?.enabled&&col.height>col.seatElevation?col.height-col.seatElevation-gussetTop:s.d/2-g.topCenter-hg/2;
 const sTop=Math.max(0,top);
 // Ties at both flanges: each spreads at most half the clear gap toward the other.
 const gap=g.sides.includes(-1)?Math.max(0,g.topCenter-g.bottomCenter-hg):Infinity;
 return {hg,k1,x,top:sTop,gap,width:hg+Math.min(x,sTop,gap)};
}
/** Elastic local-component bounds. No yield-line redistribution, composite saddle/flange action or global receiver
 * stiffness is credited; the girder flange spreads the saddle couple over its effective width (flangeEffectiveWidth)
 * and the column flange the root force over its own (columnFlangeWidth). */
export function flangeTieResponse(p:ProjectInput,F:number){
 const g=flangeTieGeometry(p)!;const d=p.details!,t=d.brace,a=g.attachment,E=p.section.E;
 const h=g.sides.includes(-1)?Math.max(g.topDrop,g.bottomDrop):g.topDrop,H=h-a.saddleThickness,L=g.rootLength,B=a.saddleLength,w=a.weldSize;
 const M=F*H,flangeM=F*h;
 // A single flexible plate laps one gusset face: the lap couple F·e about the vertical axis twists the gusset-to-saddle
 // and saddle-to-flange weld groups and bends the column gusset root and column flange. Zero for the symmetric bars.
 const twist=F*g.eccentricity;
 // Two fillet lines along the tie, length L: the gusset-to-saddle fillets on each gusset face (gauge t_g), and the
 // saddle-to-flange transverse end fillets across the flange at the two saddle ends (gauge B). The tie force runs
 // along each line; its moment about the runway axis is throat normal stress varying along the line.
 const weld=(gauge:number,moment:number,length=L)=>parallelWeldGroup({length,gauge,size:w,Fexx:d.material.Fexx,method:p.method,vx:0,vy:F,normal:0,mx:moment,my:0,mz:twist});
 const gusset=6*M/(t.gussetThickness*L**2)+1.5*F/(t.gussetThickness*L);
 // Vertical line load at the gusset is bounded by 6M/L^2. Simply supported
 // saddle strips span B, with center load q: m=qB/4. Add direct shear.
 const saddle=9*M*B/(L**2*a.saddleThickness**2)+1.5*F/(L*a.saddleThickness);
 // Girder flange: the couple F·h and the force F over the effective width (flangeEffectiveWidth); the strip of the saddle
 // length alone is the screening bound.
 const tf=p.section.tf,effective=flangeEffectiveWidth(p,g),strip=(b:number)=>6*flangeM/(b*tf**2)+1.5*F/(b*tf);
 const flange=strip(effective.width),flangeScreen=strip(B);
 const r=g.receiver,hg=g.columnGusset,e=Math.max(...g.stations.map(v=>Math.abs(v.tieX-v.station)))+t.gussetThickness/2;
 // Each root bends its own column flange outstand over the effective width b_c (columnFlangeWidth); the gusset-height
 // strip alone is the screening bound. Other frame loads excluded. A column by others has no local check here; its
 // flexibility is excluded with the building.
 const columnWidth=r?columnFlangeWidth(p,g):undefined,columnStrip=(w:number)=>r?6*(F*e+twist)/(w*r.flangeThickness**2)+1.5*F/(w*r.flangeThickness):0;
 const column=columnStrip(columnWidth?.width??hg),columnScreen=columnStrip(hg);
 // Column flange at the toes of the gusset root fillets (the welded detail): the cantilever moment there, F(t_g/2 + w)
 // with the lap couple, over the gusset height alone, no spread credited. On the plate model of the column flange
 // outstand (W14X61 to W14X257, gussets 5 3/4 and 8 in tall, the column continuing or ending 1 in above the gusset)
 // the moment across the gusset toes is at most 0.8 of it and the moment along the column at the gusset ends 0.3.
 const columnToe=r?6*(F*(t.gussetThickness/2+t.connection.weldSize)+twist)/(hg*r.flangeThickness**2)+1.5*F/(hg*r.flangeThickness):0;
 const rootWeld=(F/(2*hg)+twist/(t.gussetThickness*hg))/(t.connection.weldSize/Math.sqrt(2));
 const flangeI=B*p.section.tf**3/12,columnI=r?hg*r.flangeThickness**3/12:Infinity;
 // The gusset delivers F·h to the flange as a linear couple along the saddle root (the same distribution as
 // its weld group): the strip moment is F·h across the web gap, then (1-ξ)²(1+2ξ) along the root, giving
 // rotational compliance [g_web + (13/35)L]/(EI_strip). No composite saddle or bearing stiffener credit.
 // The single plate's lap couple rotates both gussets about the vertical axis: the plate ends then move apart along
 // the tie by e times the rotations.
 const k=gussetRotation(p,g.columnGussetLength,L,H),lapCompliance=g.eccentricity**2*(1/k.column+1/k.girder)/E;
 const compliance=h*h*((g.rootStart-p.section.tw/2)+13/35*L)/(E*flangeI)+3*H*H*B**3/(E*a.saddleThickness**3*L**3)+4*H**3/(E*t.gussetThickness*L**3)+e**3/(3*E*columnI)+lapCompliance;
 return {gusset,saddle,flange,flangeScreen,effective,column,columnScreen,columnWidth,columnToe,rootWeld,gussetWeld:weld(t.gussetThickness,M),saddleWeld:weld(B,flangeM,g.endWeldLength),compliance,h,H,L,B,twist};
}
/** Minimum clear distance of the girder gusset to a cap channel flange, mm (1/2 in). */
export const capClearance=12.7;
export function flangeTieChecks(s:CalculationSnapshot,force:number):CheckResult[]{
 const p=s.input,g=flangeTieGeometry(p),d=p.details;if(!g||!d||!s.detailResults)return [];
 const a=g.attachment,t=d.brace,c=t.connection,m=d.material,r=flangeTieResponse(p,force),cyc=p.fatigue.cycles;
 const f=flangeTieResponse(p,s.detailResults.demands.braceFatigue),out:CheckResult[]=[],single=g.plies===1,len=(v:number)=>format(v,'length',p.units,3);
 const add=(id:string,title:string,demand:number,capacity:number,equation:string,note:string,quantity:CheckResult['quantity']='stress')=>out.push({id:`flange-tie-${id}`,group:'Flange attachment',title,demand,capacity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&demand<=capacity*(1+1e-9)?'pass':'fail',quantity,equation,note,referenceIds:['aisc-connections','aisc-fatigue','flange-saddle-mechanics']});
 const note='Direct flange saddle; elastic strip bounds with no composite saddle/flange credit. Full tie force including bracing imperfection. Local attachment only; imposed movement is checked under Tie movement and the building frame is excluded.';
 const byOthers=(id:string,title:string)=>out.push({id:`flange-tie-${id}`,group:'Flange attachment',title,status:'excluded',equation:'',note:`The receiving column is by others. Its flange must take the tie root force ${format(force,'force',p.units,3)} (strength) and range ${format(s.detailResults!.demands.braceFatigue,'force',p.units,3)} (fatigue) at each gusset; see the interface forces.`,referenceIds:['aisc-connections']});
 add('gusset','Flange gusset · elastic stress',r.gusset,available(m.Fy,p.method,.9,1.67),'f_g=6FH/(t_gL_w^2)+1.5F/(t_gL_w)',note);
 add('saddle','Saddle plate · elastic strip stress',r.saddle,available(m.Fy,p.method,.9,1.67),'f_s=9FHB/(L_w^2t_s^2)+1.5F/(L_wt_s)',note+' Transverse strips simply supported at the two outer weld lines.');
 // Girder flange over its effective width; the saddle-length strip is printed as the screening bound.
 {const fe=r.effective,phiFy=available(p.section.Fy,p.method,.9,1.67);
  add('flange','Girder flange · local elastic stress',r.flange,phiFy,'f_f=\\frac{6Fh}{b_et_f^2}+\\frac{1.5F}{b_et_f};\\quad b_e=B+a+\\min(a,s_e)',
   `Direct flange saddle, full tie force including bracing imperfection, no composite saddle/flange credit. The couple F·h (h = ${len(r.h)} from the flange to the tie line) and the force F spread through the continuous flange in elastic plate bending to the toe of the web fillet (k₁ = ${len(fe.k1)} from the web centerline): effective width b_e = B + a + min(a, s_e) = ${len(fe.width)}, with the saddle length B = ${len(fe.B)}, a = ${len(fe.a)} from the fillet toe to the centroid of the saddle end fillets across the flange (45° spread toward the bearing stiffener, which holds the flange beside the saddle) and s_e = ${len(fe.end)} of free flange from the end fillet toe to the girder end (the spread toward the girder end stops there). Checked against an elastic plate model of the flange outstand between the free girder end and the bearing stiffener. Screening bound with the saddle-length strip alone (b = B): ${format(r.flangeScreen,'stress',p.units,3)}, D/C ${(r.flangeScreen/phiFy).toFixed(2)}. The same local stress is the local range at the saddle end-fillet toes in the fatigue register.`);}
 // Column flange over its effective width; the gusset-height strip is printed as the screening bound.
 const columnBasis=(w:NonNullable<typeof r.columnWidth>)=>` The root force spreads along the column in elastic plate bending to the toe of the column web fillet (k₁ = ${len(w.k1)} from the web centerline): effective width b_c = h_g + min(x, s_top) = ${len(w.width)}, with the column gusset height h_g = ${len(w.hg)}, x = ${len(w.x)} from the fillet toe to the gusset and s_top = ${len(w.top)} of column above the gusset${Number.isFinite(w.gap)?`, and no more than the clear gap ${len(w.gap)} to the other flange's gusset`:''}. Checked against an elastic plate model of the column flange outstand.`;
 if(g.receiver&&r.columnWidth){const phiFy=available(g.receiver.Fy,p.method,.9,1.67);
  add('column','Column flange at tie · local elastic stress',r.column,phiFy,(single?'f_c=\\frac{6F(e+e_l)}{b_ct_c^2}+\\frac{1.5F}{b_ct_c}':'f_c=\\frac{6Fe}{b_ct_c^2}+\\frac{1.5F}{b_ct_c}')+';\\quad b_c=h_g+\\min(x,s_{top})',note+` Receiving flange: ${g.receiver.source}. Outstand e includes half the gusset thickness; no global axial/lateral interaction approval.${single?' The single plate\'s lap couple F·e bends the same flange.':''}${columnBasis(r.columnWidth)} Screening bound with the gusset-height strip alone (b = h_g): ${format(r.columnScreen,'stress',p.units,3)}, D/C ${(r.columnScreen/phiFy).toFixed(2)}.`);}
 else byOthers('column','Column flange at tie · local elastic stress');
 // The single flexible plate laps one face of each gusset: its couple F·e about the vertical axis.
 const lap=single?` The single plate laps one gusset face: its couple F·e = ${format(r.twist,'moment',p.units,3)} (e_l = ${len(g.eccentricity)}, plate centroid to gusset mid-plane) about the vertical axis is included.`:'';
 add('gusset-weld','Gusset-to-saddle fillets, both gusset faces',r.gussetWeld.demand,r.gussetWeld.capacity,'f_w=\\sqrt{(F/A_{we})^2+(My/I_w)^2}',note+` Two fillets ${len(a.weldSize)} × ${len(r.L)}, one each face of the gusset along the saddle; tie force along the welds, moment F·H as normal stress along them. Four weld endpoints; no directional strength increase.${lap}`);
 add('saddle-weld','Saddle-to-flange transverse end fillets',r.saddleWeld.demand,r.saddleWeld.capacity,'f_w=\\sqrt{(F/A_{we})^2+(My/I_w)^2}',note+` The only welds of the saddle to the flange: two transverse end fillets ${len(a.weldSize)} × ${len(g.endWeldLength)} across the flange, one at each saddle end, ${len(r.B)} apart. The saddle edges along the runway are not welded (flush with the flange tip; near the rolled root). Tie force along each weld (no directional increase); moment F·h about the runway axis as throat normal stress varying along each weld. Four weld endpoints.${lap}`);
 add('column-weld','Column tie root weld',r.rootWeld,available(.6*m.Fexx,p.method,.75,2),single?'f_w=[F/(2h_g)+Fe/(t_gh_g)]/(0.707w)':'f_w=F/(2h_g\\,0.707w)',note+' Weld length is the full column gusset height.'+(single?' The lap couple F·e acts as a force pair across the gusset thickness.':''));
 const E1=finiteLife(.39,cyc),C=finiteLife(4.4,cyc),weldF=categoryF(cyc);
 add('saddle-fatigue','Saddle plate · all-cycle fatigue bound',f.saddle,E1,'f_{sr}\\le6900(0.39/n_{SR})^{0.333}\\ \\ \\text{(Cat. E}^{\\prime}\\text{)}','Category E-prime for welded attachment; full tie range at all cycles, no endurance credit.');
 add('gusset-fatigue','Flange gusset · weld-root fatigue',f.gusset,transverseFilletFatigue(t.gussetThickness,a.weldSize,cyc).capacity,'f_{sr}\\le F_{SR}\\ \\ \\text{(Cat. C}^{\\prime\\prime}\\text{)}','Transverse fillet root at the saddle; includes eccentric bending and direct shear by addition.');
 // Two details of the column flange under the full tie range at all cycles: the base metal at the toes of the gusset
 // root fillets (Category E', the stress there), and the rolled base metal at the toe of the column web fillet, where
 // the flange bending peaks (Category A, the stress over b_c).
 if(g.receiver&&f.columnWidth){
  const A=finiteLife(250,cyc),toe=f.columnToe/E1,root=f.column/A,stress=(v:number)=>format(v,'stress',p.units,3);
  add('column-fatigue','Column flange at tie · local fatigue',toe>=root?f.columnToe:f.column,toe>=root?E1:A,
   (single?'f_{sr,toe}=\\frac{6\\Delta F(t_g/2+w+e_l)}{h_gt_c^2}+\\frac{1.5\\Delta F}{h_gt_c}':'f_{sr,toe}=\\frac{6\\Delta F(t_g/2+w)}{h_gt_c^2}+\\frac{1.5\\Delta F}{h_gt_c}')+'\\le F_{SR}\\ \\text{(Cat. E}^{\\prime}\\text{)};\\quad f_{sr,root}=\\frac{6\\Delta Fe}{b_ct_c^2}+\\frac{1.5\\Delta F}{b_ct_c}\\le F_{SR}\\ \\text{(Cat. A)}',
   `Local tie action only, the full tie range at all cycles, no endurance credit; two details of the column flange. At the toes of the gusset root fillets (Category E-prime, AISC Table A-3.1 item 7.1, an attachment longer than 4 in along the column): the cantilever moment at the toe, the range times t_g/2 + w = ${len(t.gussetThickness/2+c.weldSize)}${single?' with the lap couple':''}, over the gusset height h_g = ${len(g.columnGusset)} alone: ${stress(f.columnToe)}, D/C ${toe.toFixed(2)}; an elastic plate model of the column flange outstand gives at most 0.8 of it across the gusset toes and 0.3 along the column at the gusset ends. At the toe of the column web fillet, where the flange bending peaks, rolled base metal (Category A, item 1.1): the range over the effective width b_c = ${len(f.columnWidth.width)} (Column flange at tie · local elastic stress): ${stress(f.column)}, D/C ${root.toFixed(2)}. Screening bound with that root stress against Category E-prime: D/C ${(f.column/E1).toFixed(2)}. Cyclic building-frame stresses require separate combination.`);
 }
 else byOthers('column-fatigue','Column flange at tie · local fatigue');
 add('weld-fatigue','Flange attachment welds · all-cycle fatigue',Math.max(f.gussetWeld.demand,f.saddleWeld.demand,f.rootWeld),weldF,'f_{sr}\\le F_{SR}\\ \\ \\text{(Cat. F)}','Largest elastic weld throat range (gusset-to-saddle fillets, saddle transverse end fillets, column root fillets) from the full brace-force range, applied to every cycle. The base metal at the toe of the transverse end fillets on the girder flange is a fatigue detail (AISC Table A-3.1 item 7.1, Appendix A).');
 const rootRange=s.detailResults.demands.braceFatigue*(1/(t.gussetThickness*g.columnGusset)+6*g.eccentricity/(g.columnGusset*t.gussetThickness**2));
 add('column-root-fatigue','Column gusset root · normal fatigue',rootRange,Math.min(C,transverseFilletFatigue(t.gussetThickness,c.weldSize,cyc).capacity),single?'f_{sr}=\\Delta F/(t_gb_g)+6\\Delta Fe/(b_gt_g^2)':'f_{sr}=\\Delta F/(t_gb_g)','Column-side paired fillet root; no threshold credit for RFIL below one.'+(single?' Includes the single plate\'s lap couple range.':''));
 const required=filletMinimum([a.saddleThickness,p.section.tf],[t.gussetThickness,a.saddleThickness]);
 add('weld-minimum','Flange attachment · minimum weld',required,a.weldSize,'w\\ge w_{min}','AISC 360-16 Table J2.4, by the thinner part joined, for each joint (saddle to flange, gusset to saddle).', 'length');
 // AISC J2.2b limits a fillet along the edge of material: the saddle end fillets lie along the saddle's end edges (a lap
 // edge), so the saddle thickness sets the limit; on the flange they lie on its face, not along its edge, and the
 // gusset-to-saddle fillets are T-joint fillets with no edge limit.
 add('weld-maximum','Flange attachment · saddle end fillet edge limit (J2.2b)',a.weldSize,a.saddleThickness<6.35?a.saddleThickness:a.saddleThickness-1.5875,'w\\le t_s-1/16\\,in','AISC J2.2b: the transverse end fillets run along the saddle end edges, so the saddle thickness t_s sets the maximum size; no edge buildup credited. On the girder flange the fillets lie on its face, not along an edge, and the gusset-to-saddle fillets are T-joint fillets, which J2.2b does not limit.','length');
 // AISC J2.4 base metal at the fusion face of the end fillets on the girder flange (shear rupture, J4.2).
 add('flange-fusion-weld','Girder flange · base metal at the saddle end fillets (J2.4)',r.saddleWeld.demand/Math.SQRT2,available(.6*p.section.Fu,p.method,.75,2),'f_{BM}=f_w\\,(0.707w)/w\\le\\phi0.60F_u',`AISC J2.4 and J4.2: the end fillet resultant on its leg along the flange (the throat stress f_w times 0.707), against shear rupture of the ${len(p.section.tf)} girder flange; the throat check is the saddle-to-flange fillet check.`);
 const shape=aiscShapeByName(p.section.catalogueId??''),fillet=(shape?shape.kdes*25.4-p.section.tf:0)+a.clearance;
 add('root-clearance','Saddle · rolled-root clearance',fillet,a.webGap,'g_{web}\\ge(k_{des}-t_f)+c','Nominal design fillet bound plus entered clearance; verify actual rolling tolerances.','length');
 add('stiffener-clearance','Saddle weld · bearing-stiffener clearance',a.saddleLength/2+a.weldSize+d.bearing.stiffenerThickness/2+d.bearing.weldSize+a.clearance,a.longitudinalSetback,'s_x\\ge B/2+w_s+t_{st}/2+w_{st}+c','Orthogonal material/weld envelope.','length');
 // Capped girder: the girder gusset stays clear of the turned-down cap channel flange (out-of-square and fillet tolerance).
 if(g.capClear!==undefined)add('cap-clearance','Girder gusset · clear of the cap channel flange',capClearance,g.capClear,'c_{cap}\\ge1/2\\,in',`Clear distance from the outer top corner of the girder gusset to the turned-down channel flange (inner face ${len(g.capFlange!)} from the web centerline). Covers channel out-of-square and the cap fillet at the flange tip.`,'length');
 add('bar-saddle-clearance',single?'Tie plate · clear of the saddle and gusset fillets':'Tie bars · clear of the saddle and gusset fillets',a.weldSize+1.5875,Math.min(...g.sides.map(v=>(v>0?g.topDrop:g.bottomDrop)-t.width/2-a.saddleThickness)),'c_{bar}\\ge w+1/16\\,in',single?'The plate lies against one gusset face below the saddle; it stops below the toe of the gusset-to-saddle fillets.':'The bars lie against the gusset faces below the saddle; they stop below the toe of the gusset-to-saddle fillets.','length');
 // Each assembly projects its plies, the gusset and the bolt head and nut; a single plate adds the F436 washer under the nut.
 const need=g.plies*t.thickness+t.gussetThickness+2*c.diameter+(single?3.97:0),clear=2*Math.min(...g.stations.filter(v=>v.station>0&&v.station<p.spans.reduce((a,b)=>a+b,0)).map(v=>Math.abs(v.tieX-v.station)));
 if(Number.isFinite(clear))add('adjacent-hardware','Adjacent ties · exposed hardware separation',need+a.clearance,clear,single?'s\\ge t_p+t_g+2d_b+t_w+c':'s\\ge2t_b+t_g+2d_b+c','Both independent end bolt assemblies, including projected heads/nuts/washers.','length');
 return out;
}
/**
 * Girder-side gusset of a paired-bar tie on the bearing stiffener (no flange saddle): the CJP joint to the
 * stiffener edge, its fatigue, and the fit of the gussets and bars inside the girder. The stiffener pair as
 * the restraint diaphragm and its welds are checked with the bearing stiffeners.
 */
export function stiffenerTieChecks(s:CalculationSnapshot,force:number):CheckResult[]{
 const p=s.input,g=stiffenerTieGeometry(p),d=p.details;if(!g||!d||!s.detailResults)return [];
 const t=d.brace,bs=d.bearing,m=d.material,f=(v:number)=>format(v,'length',p.units,3),tMin=Math.min(t.gussetThickness,bs.stiffenerThickness),A=tMin*g.height;
 const cycles=d.spectrum.reduce((n,v)=>n+v.cycles,0),range=s.detailResults.demands.braceFatigue;
 const out:CheckResult[]=[],add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string)=>out.push({id:`tie-stiffener-${id}`,group:'Connections',title,demand,capacity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&demand<=capacity*(1+1e-9)?'pass':'fail',quantity,equation,note,referenceIds:['aisc-connections','aisc-fatigue']});
 if(stiffenerTieJoint(p)==='integral'){
  // One plate: the tie-side stiffener cut with the gusset as its extension past the flange tip, no weld at the gusset.
  const note=`Tie-side bearing stiffener PL ${f(bs.stiffenerThickness)} extended past its outer edge ${f(g.root)} from the web centerline as the girder gusset, ${f(g.height)} high (one plate, no weld); the bars start ${f(g.start)} from the web centerline. Full tie force including bracing imperfection.`;
  add('cjp','Girder gusset · stiffener extension at the stiffener edge',force,available(m.Fy*A,p.method,.9,1.67),'force','R_n=F_yth_g',`${note} AISC J4.1(a) and J4.4 (gross section yielding in tension, compression with KL/r ≤ 25) of the extension at the stiffener's outer edge.`);
  add('cjp-fatigue','Girder gusset · re-entrant corner of the stiffener extension, all-cycle fatigue bound',range/A,finiteLife(4.4,cycles),'stress','f_{sr}=\\Delta F/(th_g)\\le6900(4.4/n_{SR})^{0.333}','AISC Table A-3.1 item 1.3, Category C: re-entrant corner of the cut plate with a radius of at least 1 in, thermally cut and ground to bright metal (J1.6). Full tie force range at all cycles, no threshold credit.');
 }else{
 const note=`Girder gusset PL ${f(t.gussetThickness)} × ${f(g.height)} in the plane of the tie-side bearing stiffener, CJP to its outer edge ${f(g.root)} from the web centerline; the bars start ${f(g.start)} from it. Full tie force including bracing imperfection, on the thinner of the gusset and stiffener.${t.gussetThickness>bs.stiffenerThickness+1e-6?` The entered gusset is thicker than the ${f(bs.stiffenerThickness)} stiffener: the joint needs the AWS D1.1 thickness transition (1 in 2.5 taper); a gusset of the stiffener's thickness, cut as one plate with it, needs no weld.`:''}`;
 add('cjp','Girder gusset · CJP to bearing stiffener',force,available(m.Fy*A,p.method,.9,1.67),'force','R_n=F_yt_{min}h_g',`${note} AISC J2.6: CJP groove weld in tension or compression normal to its axis; the base metal governs.`);
 add('cjp-fatigue','Girder gusset CJP · all-cycle fatigue bound',range/A,finiteLife(4.4,cycles),'stress','f_{sr}=\\Delta F/(th_g)\\le6900(4.4/n_{SR})^{0.333}','AISC Table A-3.1 item 5.4, Category C: transverse CJP with the reinforcement left in place. Full tie force range at all cycles, no threshold credit.');
 }
 add('fit','Girder gussets fit between the flanges',g.sides.length*(g.height+g.clear),p.section.d-2*p.section.tf,'length','n(h_g+c)\\le d-2t_f',`${g.sides.length>1?'Top and bottom gussets each sit':'The gusset sits'} ${f(g.clear)} inside the tied flange, clear of the stiffener-to-flange fillets.`);
 add('bar-clearance','Tie bars clear the bearing stiffener',g.clear,g.start-g.root,'length','x_{bar}-x_{st}\\ge c',`Bars and their bolt heads stay outboard of the stiffener${stiffenerTieJoint(p)==='integral'?' and of the corner radius of its extension':' and of the CJP reinforcement'}.`);
 add('gusset-length','Unbraced gusset length covers the stiffener extension',g.gussetLength,t.connectionLength,'length','L_g\\ge x_{end}-x_{st}','The gusset compression check uses the entered unbraced gusset length; it must reach from the CJP to the last bolt row edge.');
 return out;
}

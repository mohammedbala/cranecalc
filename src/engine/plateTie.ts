import {finiteLife} from './fatigueConstants';
import type {CalculationSnapshot,CheckResult,ProjectInput} from './types';
import {available} from './aiscStrength';
import {boltCapacity,boltProperties,elasticBoltGroup,plateBearing,blockShear,parallelWeldGroup,minimumFillet} from './connectionStrength';
import {flangeTieGeometry,tieRelease,tieEccentricity,columnGussetExtension} from './tieGeometry';
import {flangeTieResponse} from './flangeTieDesign';
import {railKeeperResponse} from './railKeeper';
import {tieMovements} from './tieMovement';
import {railKeeperStations} from './simpleSupports';
import {wrenchClearance} from './endStop';
import {tieArrangement} from './connectionOptions';
import {format} from './units';
import {latexNumber,withinLimit} from './math';

/**
 * Flexible plate tieback (AISC DG7 §11.2 / Fig. 11-1; Fisher & Van de Pas 2002): one thin vertical plate, its plane
 * across the runway, bolted in single shear to one face of the girder gusset (hung from the direct flange saddle)
 * and of the column gusset. It carries the flange lateral force axially and flexes about its weak axis with the
 * girder end rotation and thermal travel; sleeved bolts in vertical slots of the column gusset release support
 * deflection. Geometry, saddle, gussets and release are the direct flange-tie family (tieGeometry.ts); this module
 * adds the plate member, its single-shear lap connections, bolt tension with prying, hardware fit and the keeper
 * interaction at the saddle. Imposed movement and gusset/saddle checks are in tieMovement.ts and flangeTieDesign.ts.
 */
export const isPlateTie=(p:ProjectInput)=>tieArrangement(p.details)==='flexible-plate';

const inch=25.4;
const compared=(id:string,group:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds=['aisc-connections','flexible-plate-basis']):CheckResult=>({id,group,title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds});

/** Fit-up offset the plate takes up by flexure: the 1/16 in column gusset position and, with release, the sleeve projection (half its clearance). */
export const plateFitOffset=(p:ProjectInput)=>inch/16+(tieRelease(p)?.clearance??0)/2;

/**
 * Bolt actions in one single-shear lap of the flexible plate, per bolt: in-plane shear from the tie force and any
 * unreleased vertical movement, and tension from the out-of-plane moment at the bolt group (lap couple F·e, the
 * plate end moment and shear from the imposed longitudinal movement) by the elastic row distribution, plus the
 * movement shear pulling the plate off the gusset. `arm` is the bolt-group centroid from the lap inner edge.
 */
function lapBolts(p:ProjectInput,force:number,longitudinal:number,vertical:number,arm:number){
 const d=p.details!,t=d.brace,c=t.connection,E=p.section.E;
 const free=t.length-2*((c.rows-1)*c.pitch+2*c.edge)-columnGussetExtension(p),w=t.width,tp=t.thickness,Iy=w*tp**3/12,Ix=tp*w**3/12;
 const Mmv=6*E*Iy*longitudinal/free**2,Vmv=12*E*Iy*longitudinal/free**3,Mv=6*E*Ix*vertical/free**2,Vv=12*E*Ix*vertical/free**3;
 const points=Array.from({length:c.rows},(_,i)=>[-1,1].map(sign=>({x:(i-(c.rows-1)/2)*c.pitch,y:sign*c.gauge/2}))).flat(),n=points.length;
 const shear=Math.max(...elasticBoltGroup(points,{x:force,y:Vv,moment:Mv+Vv*arm}).map(v=>v.resultant));
 const sum=points.reduce((a,v)=>a+v.x**2,0),zmax=Math.max(...points.map(v=>Math.abs(v.x))),moment=Math.abs(force)*tieEccentricity(p)+Mmv+Vmv*arm;
 const tension=moment*zmax/sum+Vmv/n;
 return {shear,tension,moment,Mmv,Vmv,Mv,Vv,n};
}

export function plateTieChecks(s:CalculationSnapshot,ctx:{force:number;cos:number;member:{compression:{capacity:number};bucklingLength:number}}):CheckResult[]{
 const p=s.input,d=p.details,g=flangeTieGeometry(p);if(!d||!g||!s.detailResults||!isPlateTie(p))return [];
 const t=d.brace,c=t.connection,m=d.material,u=p.units,method=p.method,rel=tieRelease(p),r=s.detailResults;
 const F=ctx.force,range=r.demands.braceFatigue/ctx.cos,e=tieEccentricity(p),tp=t.thickness,tg=t.gussetThickness,w=t.width;
 const fmt=(v:number)=>format(v,'length',u,3),force=(v:number)=>format(v,'force',u,3);
 const bolt=boltProperties(c.grade,c.diameter),dh=bolt.hole,dn=dh+1.5875,connection=(c.rows-1)*c.pitch+2*c.edge,extension=columnGussetExtension(p);
 const mv=tieMovements(s),fit=plateFitOffset(p),checks:CheckResult[]=[];
 const add=(...args:Parameters<typeof compared>)=>checks.push(compared(...args));
 const plateName=`PL ${fmt(tp)} × ${fmt(w)} × ${fmt(t.length)}`;
 // Plate member: AISC D2 and E3. The plate is bolted across its full depth at both ends (Table D3.1 case 1, U = 1).
 const Ag=w*tp,An=(w-2*dn)*tp;
 add('plate-tie-tension-yield','Bracing','Flexible plate · tension yielding',F,available(m.Fy*Ag,method,.9,1.67),'force','P_n=F_yA_g',`AISC D2(a) on the gross plate ${plateName}. Full flange tie force including the bracing imperfection force, divided by the tie direction cosine.`,['aisc-d','flexible-plate-basis']);
 add('plate-tie-tension-rupture','Bracing','Flexible plate · tension rupture at the bolt holes',F,available(m.Fu*An,method,.75,2),'force','P_n=F_uA_e;\\quad A_e=UA_n=(w-2d_h^{\\prime})t,\\;U=1',`AISC D2(b) and D3: two holes of ${fmt(dh)} plus 1/16 in deducted across the plate depth; U = 1.0 (Table D3.1 case 1, the plate is bolted across its full depth).`,['aisc-d','flexible-plate-basis']);
 add('plate-tie-compression','Bracing','Flexible plate · compression buckling',F,ctx.member.compression.capacity,'force','P_n=F_{cr}A_g;\\quad L_c=0.8L;\\ r=t/\\sqrt{12}',`AISC E3 about the weak axis, over ${fmt(ctx.member.bucklingLength)} = 0.8 × the length between the innermost bolt rows: fixed in the pretensioned girder bolt group and pinned at the sleeved column end (Commentary Table C-A-7.1). The girder top flange does not sway along the runway: the girder holds it through its locating end. The lap couple and imposed movement are combined with this force under Tie movement (H1-1).`,['aisc-e','flexible-plate-basis']);
 // Lap connections at both ends: single shear, pretensioned bolts. The girder end is slip-critical in standard holes;
 // the column end is slip-critical too, or bears through the steel sleeves in the vertical slots when released.
 const ends=[{name:'girder end',arm:connection/2,slip:true,vertical:rel?0:mv.vertical},{name:'column end',arm:connection/2+extension,slip:!rel,vertical:rel?0:mv.vertical}];
 const strength=ends.map(v=>({...v,...lapBolts(p,F,mv.longitudinal+fit,v.vertical,v.arm)}));
 const pattern=(c.rows-1)*c.pitch;
 const capacity=(v:typeof strength[number])=>boltCapacity({grade:c.grade,diameter:c.diameter,planes:1,surface:c.surface,shear:v.shear,tension:2*v.tension,method,patternLength:pattern});
 const worst=<T>(list:T[],ratio:(v:T)=>number)=>list.reduce((a,v)=>ratio(v)>ratio(a)?v:a,list[0]);
 const lapNote=`Single-shear lap of the plate on one gusset face; ${2*c.rows} - ${fmt(c.diameter)} ${c.grade} bolts each end, pretensioned, Class ${c.surface} faying surfaces, standard holes in the plate${rel?' and girder gusset; sleeved in vertical slots of the column gusset':' and both gussets'}. Tie force ${force(F)}; out-of-plane movement ${fmt(mv.longitudinal+fit)} (factored rotation × d, thermal travel and fit-up).`;
 add('tie-pitch','Connections','Flexible plate laps · bolt spacing',8/3*c.diameter,Math.min(c.pitch,c.gauge),'length','s\\ge2\\tfrac23d_b','AISC J3.3 minimum spacing in the plate and gussets.');
 add('tie-edge','Connections','Flexible plate laps · edge distance',1.5*c.diameter,c.edge,'length','e\\ge1.5d_b','Conservative standard-hole edge distance (exceeds AISC Table J3.4 for these bolts) at the plate ends and the girder gusset end; the slotted column gusset edges are checked under Tie movement.');
 const sh=worst(strength,v=>v.shear/capacity(v).shear);
 add('tie-bolt','Connections','Flexible plate laps · bolt shear, single plane',sh.shear,capacity(sh).shear,'force','V_i=\\left|\\frac{\\mathbf V}{n}+\\frac{M_z}{\\sum r_j^2}(-y_i,x_i)\\right|\\le\\phi F_{nv}A_b',`${lapNote} Governing ${sh.name}: elastic bolt-group shear${rel?'':' including the in-plane vertical-movement shear and moment'}; threads included, one shear plane.`);
 const ty=worst(strength,v=>2*v.tension/capacity(v).tension);
 add('tie-prying','Connections','Flexible plate laps · bolt tension with prying',2*ty.tension,capacity(ty).tension,'force','T_u=2\\left[\\frac{(Fe+M+Va)z_{max}}{\\sum z^2}+\\frac Vn\\right]\\le\\phi F^{\\prime}_{nt}A_b',`Governing ${ty.name}. The out-of-plane moment at the bolt group (lap couple F·e = ${format(Math.abs(F)*e,'moment',u,3)} with e = ${fmt(e)}, plate end moment ${format(ty.Mmv,'moment',u,3)} and shear ${force(ty.Vmv)} from the imposed movement at ${fmt(ty.arm)} from the lap edge) is resisted by bolt tension over the rows; the shear also pulls the plate off the gusset. Prying is bounded by doubling the applied tension (Q ≤ T, AISC Manual Part 9 with α ≤ 1 and b'/a' ≤ 2). AISC J3.7 tension reduced for the concurrent shear.`);
 const slips=strength.filter(v=>v.slip);
 if(slips.length){const sl=worst(slips,v=>v.shear/capacity(v).slip);
  add('tie-slip','Connections','Flexible plate laps · slip resistance with tension',sl.shear,capacity(sl).slip,'force','R_n=\\mu D_uh_fT_bn_sk_{sc};\\quad k_{sc}=1-\\frac{T_u}{D_uT_bn_b}',`Governing ${sl.name}: one slip plane, standard holes, Class ${c.surface}; k_sc = ${capacity(sl).slipReduction.toFixed(3)} for the bolt tension with prying (AISC J3.8, J3.9). Slip-critical so the plate stays fixed in the bolt group and the bolts do not take fatigue shear.`);}
 const tMin=Math.min(tp,tg),bearing=plateBearing(c.diameter,dh,tMin,m.Fu,c.edge,Math.min(c.gauge,c.pitch),method);
 add('tie-bearing','Connections','Flexible plate laps · hole bearing / tearout',sh.shear,bearing.capacity,'force','R_n=\\min(1.2l_ctF_u,2.4d_btF_u)',`AISC J3.10 on the thinner ply ${fmt(tMin)}; clear distance ${fmt(bearing.clear)} at the plate end. Deformation at the holes is a design consideration.`);
 // Gusset net sections: the girder gusset depth below the saddle, the column gusset height (the slotted column gusset is checked under Tie movement).
 const girderDepth=g.topDrop+w/2-g.attachment.saddleThickness,gussets=[{name:'girder gusset',An:(girderDepth-2*dn)*tg,Ag:girderDepth*tg},...(rel?[]:[{name:'column gusset',An:(g.columnGusset-2*dn)*tg,Ag:g.columnGusset*tg}])];
 const net=(v:typeof gussets[number])=>Math.min(available(m.Fu*v.An,method,.75,2),available(m.Fy*v.Ag,method,.9,1.67)),gn=worst(gussets,v=>F/net(v));
 add('tie-net','Connections','Tie gussets · tension yielding and net rupture',F,net(gn),'force','R_n=\\min(F_yA_g,\\,F_uA_n)',`AISC J4.1 at the bolt line of the ${gn.name}, ${fmt(tg)} thick; holes deducted with 1/16 in.`);
 // Block shear: the plate end (both ends), the girder gusset toward its free end and, in standard holes, the column gusset toward its girder-side end.
 const block=(t0:number,edge:number)=>{const along=edge+(c.rows-1)*c.pitch,Agv=2*along*t0,Anv=2*(along-(c.rows-.5)*dn)*t0;
  return Math.min(blockShear(Agv,Anv,(c.gauge-dn)*t0,m.Fy,m.Fu,method),blockShear(Agv,Anv,Math.max(1e-6,(w-c.gauge-dn))*t0,m.Fy,m.Fu,method));};
 const blocks=[{name:'plate end',capacity:block(tp,c.edge)},{name:'girder gusset end',capacity:block(tg,c.edge)},...(rel?[]:[{name:'column gusset end',capacity:block(tg,c.edge+extension)}])],bl=worst(blocks,v=>F/v.capacity);
 add('tie-block','Connections','Flexible plate laps · block shear',F,bl.capacity,'force','R_n=\\min(0.6F_uA_{nv},0.6F_yA_{gv})+0.5F_uA_{nt}',`Governing ${bl.name}: the block between the gauge lines and the two outer blocks to the plate edges, shear planes along the bolt lines to the end edge; U_bs = 0.5 conservatively. The slotted column gusset is checked under Tie movement.`);
 // Column gusset root fillets: the tie force normal to the welds, the out-of-plane moment as a couple across the
 // gusset thickness and, unreleased, the vertical-movement shear and moment in the gusset plane.
 const cb=strength[1],root=parallelWeldGroup({length:g.columnGusset,gauge:tg,size:c.weldSize,Fexx:m.Fexx,method,vx:cb.Vmv,vy:cb.Vv,normal:F,mx:cb.Mv+cb.Vv*g.columnGussetLength,my:Math.abs(F)*e+cb.Mmv+cb.Vmv*g.columnGussetLength,mz:0});
 add('tie-weld','Connections','Column gusset root fillets · tie force with lap couple and movement',root.demand,root.capacity,'stress','f_w=\\sqrt{(V_x/A_w)^2+(V_y/A_w)^2+(N/A_w+M_xy/I_x-M_yx/I_y)^2}',`Two ${fmt(c.weldSize)} fillets × ${fmt(g.columnGusset)}, one each face of the column gusset. The tie force is normal to the welds; the out-of-plane moment F·e + M + V·a (a = ${fmt(g.columnGussetLength)}, the gusset projection) is a couple across the gusset thickness${rel?'':'; the unreleased vertical movement adds in-plane shear and moment'}. All four weld endpoints; no directional increase.`);
 add('tie-weld-size','Connections','Column gusset root fillets · fillet edge limit',c.weldSize,tg-1.5875,'length','w\\le t_g-1/16\\,in','Root fillets along the column gusset edge; full-throat edge buildup is not credited.');
 add('tie-weld-minimum','Connections','Column gusset root fillets · minimum fillet',minimumFillet(Math.max(tg,g.receiver?.flangeThickness??tg)),c.weldSize,'length','w\\ge w_{min}','Thicker joined part (gusset or receiving column flange) controls the minimum fillet leg size.');
 // Hardware fit: socket clearance (AISC Manual Table 7-15 C1) from the girder-end bolts to the saddle above them, and
 // from the column-end bolts to the column flange and its root fillet toe.
 const C1=wrenchClearance(c.diameter),saddleClear=g.topDrop-c.gauge/2-g.attachment.saddleThickness,columnClear=g.barGap+c.edge-c.weldSize;
 add('plate-tie-wrench','Detailing','Flexible plate bolts · tightening clearance',C1,Math.min(saddleClear,columnClear),'length','C_1\\le\\text{clearance to the saddle and the column}',`AISC Manual Table 7-15 socket clearance C1 = ${fmt(C1)}: top girder-end bolt row ${fmt(saddleClear)} below the saddle; column-end bolt row ${fmt(columnClear)} from the toe of the column root fillet. Nothing of the tie is above the girder top flange: rail, keepers and the top flange surface are untouched.`);
 // Fatigue of the pretensioned bolts in tension (AISC A-3.4): 20% of the service tension range including prying, on the
 // tensile stress area, against the bolt-tension curve (C_f = 3.9 × 10^8 ksi³) without threshold credit.
 const cycles=d.spectrum.reduce((a,v)=>a+v.cycles,0),fatigueEnds=ends.map(v=>({...v,...lapBolts(p,range,mv.cyclicLongitudinal,rel?0:mv.cyclicVertical,v.arm)})),fb=worst(fatigueEnds,v=>v.tension);
 const At=.75*bolt.area,boltRange=.2*2*fb.tension/At,boltAllowable=finiteLife(.39,cycles);
 add('plate-tie-bolt-fatigue','Fatigue','Flexible plate lap bolts · tension fatigue',boltRange,boltAllowable,'stress','f_{sr}=0.2(2\\Delta T)/A_t\\le(C_f/n_{SR})^{0.333}',`AISC Appendix 3.4: pretensioned bolts with steel in the grip take 20% of the applied tension range including prying (doubled). Governing ${fb.name}: tension range ${force(2*fb.tension)} from the tie force range ${force(range)} (lap couple) and the single-crane rotation movement, on A_t ≈ 0.75A_b; ${cycles.toExponential(2)} cycles, no threshold credit.`,['aisc-fatigue','flexible-plate-basis']);
 checks.push(keeperInteraction(s,F));
 return checks;
}

/**
 * Girder-side attachment against the rail and its keepers. Every tie part (saddle, end fillets, gussets, plate and
 * bolts) is below the tied flange, so nothing reaches the rail, keepers or top flange surface. Where a rail keeper
 * stands over the saddle (keeper length, its end fillets and a spread through the flange thickness), the flange strip
 * there carries both transverse local bending stresses: the saddle strip stress from the tie force and the keeper
 * strip stress under the factored wheel group, added by magnitude.
 */
export function keeperInteraction(s:CalculationSnapshot,force:number):CheckResult{
 const p=s.input,d=p.details!,g=flangeTieGeometry(p)!,r=s.detailResults!,a=g.attachment,tf=p.section.tf;
 const reach=d.rail.clipWidth/2+d.rail.clipWeld+tf,keepers=railKeeperStations(p),stations=g.sides.includes(1)?g.stations:[];
 const half=a.saddleLength/2+a.weldSize,hits=stations.filter(v=>keepers.some(k=>Math.abs(k-v.tieX)<=reach+half+1e-6));
 const base={id:'plate-tie-keeper-flange',group:'Flange attachment',title:'Top flange at saddle and rail keeper · combined local bending',equation:'f=f_{saddle}+f_{keeper}\\le\\phi F_y',referenceIds:['aisc-connections','flange-saddle-mechanics','flexible-plate-basis']};
 const clear='All tie parts are below the tied flange: the rail, keepers and top flange surface are untouched.';
 if(p.section.kind==='cap')return {...base,status:'not-applicable',note:`${clear} The keepers stand on the cap channel web and the saddle is welded under the W flange, so their local bending is in separate plates.`};
 if(!hits.length)return {...base,status:'not-applicable',note:`${clear} No rail keeper (with its end fillets and a ${format(tf,'length',p.units,3)} spread through the flange) stands over a top saddle and its end fillets.`};
 const saddle=flangeTieResponse(p,force).flange,keeper=railKeeperResponse(p,r.demands.railVertical,r.demands.railLateral).flangeStress,capacity=available(p.section.Fy,p.method,.9,1.67);
 const ratio=(saddle+keeper)/capacity;
 return {...base,demand:saddle+keeper,capacity,quantity:'stress',utilization:ratio,status:withinLimit(saddle+keeper,capacity)?'pass':'fail',substitution:`\\frac{${latexNumber(saddle+keeper)}}{${latexNumber(capacity)}}=${ratio.toFixed(4)}`,
  note:`${clear} At ${hits.length} tie${hits.length>1?'s':''} a rail keeper stands over the saddle (keeper ends, fillets and a ${format(tf,'length',p.units,3)} spread through the flange): the saddle strip stress ${format(saddle,'stress',p.units,3)} (full tie force) and the keeper strip stress ${format(keeper,'stress',p.units,3)} (factored wheel group) are added by magnitude on the same flange strip, though their peaks lie at the web root and at the keeper weld. Fatigue: the saddle toes (SA) and keepers (RC) are separate register details, each with its own local range on the global range.`};
}

/** Geometry and fit of the flexible plate tieback beyond the shared direct flange-tie validation. */
export function validatePlateTie(p:ProjectInput):string[]{
 const d=p.details;if(!d||!isPlateTie(p))return [];
 const t=d.brace,errors:string[]=[],add=(bad:boolean,note:string)=>{if(bad)errors.push('details.brace: '+note);};
 if(!t.flangeAttachment?.enabled||p.system!=='simple'){add(true,'a flexible plate tieback attaches to the girder flange through the direct flange saddle: enable the direct flange saddle attachment on independent simple spans.');return errors;}
 const g=flangeTieGeometry(p);if(!g)return errors;
 const c=t.connection,db=c.diameter,head=.625*db,nut=db-inch/64,washer=inch*5/32;
 add(t.thickness<inch/4,'flexible plate must be at least 1/4 in thick.');
 add(t.width<4*t.thickness,'flexible plate depth must be at least four times its thickness: a thicker member is a bar, not a flexible plate.');
 add(g.freeLength<8*t.thickness,'flexible plate clear length between the gussets must be at least eight plate thicknesses so it can flex with the girder end.');
 // The plate and bolt heads lie toward the girder end; the washers and nuts toward the bearing stiffener.
 for(const v of g.stations){
  const plateSide=v.tieX+v.plateSide*(t.gussetThickness/2+t.thickness+head),nutSide=Math.abs(v.tieX-v.center)-(t.gussetThickness/2+washer+nut+.4*db);
  add(plateSide<v.start-1e-6||plateSide>v.finish+1e-6,'flexible plate and bolt heads must stay within their own girder end.');
  add(g.start+c.edge<p.section.tw/2+d.bearing.stiffenerWidth+d.bearing.weldSize&&nutSide<d.bearing.stiffenerThickness/2+d.bearing.weldSize,'girder-end nuts and washers must clear the bearing stiffener and its welds: increase the tie setback.');
 }
 return errors;
}

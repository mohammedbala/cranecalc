/**
 * New crane-level strut on the girder line of a stepped-column runway (existingColumn.step.strut, exit 'girder-strut').
 *
 * Why. The longitudinal crane force (traction at every locating step, the crane stop at the stop ends) reaches each
 * locating stepped column at the girder line, over the lower shaft's crane-side flange, e ≈ h0/2 from its shear center.
 * An open lower shaft carries that offset force mostly in torsion (Saint-Venant GJ/h of a W30 to W33 over 6 to 9 m is a
 * few 10⁷ N·mm/rad), so the column alone twists 0.1 to 0.8 rad under it: the girder line must be held along the runway at
 * the step by a strut on that line, which carries the force to the existing crane-level bracing in the braced bay.
 *
 * Arrangement (drawn on the stepped-column sheet): a rolled W strut along the runway, web vertical, its web centerline
 * y_s = d_l/2 + t_p + t_ws/2 from the lower-shaft centroid, its top below the bearing-bolt nuts under the step cap. At
 * every column a plate t_p on the crane-side flange face, bolted through the existing flange with `columnRows` pairs
 * either side of the web (field-drilled standard holes, pretensioned, slip-critical, Class A at the existing flange), runs
 * past both flange tips; each strut segment stops 1/2 in past the flange tip, its flanges coped over the lap, and its web
 * laps the plate with `strutBolts` bolts in line (slip-critical Class B). The strut is continuous in force from grid to
 * grid through the plates (AIST TR-13 §5.14 reversing crane forces: slip-critical joints; RCSC 2014 §4.3).
 *
 * Checks (AISC 360-16): the strut in compression (E3, L_c = the bay, both axes, nonslender elements per B4.1a) with
 * its self-weight bending (H1-1, B1 on the strong axis), L_c/r ≤ 200 (E2 user note), tension yielding (D2) and rupture
 * of the coped web at its bolts (D2, D3 with U = 1 for the web plate alone); the strut-end bolts in shear, slip (J3.8)
 * and bearing / tearout (J3.10) on the web and the plate (block shear of the single bolt line equals the tearout sum, J4.3); the plate in tension yielding,
 * net-section rupture through a row of column bolts and compression (J4.1, J4.4); the column bolts in shear, slip
 * (Class A) and bearing / tearout on the existing flange and the plate; the column bolts' fit on the flange (J3.3, J3.4)
 * and nut clearance inside it; and F13.1 for the holes in the existing flange. The force is the line force
 * max(traction, crane stop) as factored in the column check, times the largest share of it the strut takes at a column.
 * Clause numbers beyond the AISC chapter letters are not re-verified against the printed specification here.
 * Canonical units N, mm, MPa.
 */
import {aiscShapeByName,loadAiscSection} from '../data/aiscSections';
import {available} from './aiscStrength';
import {boltCapacity,boltProperties,compressionResistance,plateBearing} from './connectionStrength';
import {wrenchClearance} from './endStop';
import {activeEndBearing} from './endBearingInputs';
import {sectionProperties} from './section';
import {activeStep} from './steppedColumnInputs';
import {supportStations} from './supportReactions';
import {latexNumber} from './math';
import {format} from './units';
import type {CheckResult,ProjectInput,Section} from './types';
import type {StepGeometry} from './steppedColumn';

const inch=25.4;
const up=(v:number,step=inch/4)=>Math.ceil(v/step-1e-9)*step;
const down=(v:number,step=inch/4)=>Math.floor(v/step+1e-9)*step;
export type StepStrutInput=NonNullable<NonNullable<ReturnType<typeof activeStep>>['strut']>;

/** The strut is designed here: a stepped column with the girder-line exit and the strut entered. */
export function activeStepStrut(p:ProjectInput){const s=activeStep(p);return s?.strut&&p.existingColumn?.longitudinalExit==='girder-strut'&&p.existingColumn.longitudinal==='bracing'?s.strut:undefined;}
export const stepStrutSection=(p:ProjectInput,st:StepStrutInput):Section=>({...loadAiscSection({...p.section,kind:'rolled'},st.shape),Fy:st.Fy,Fu:st.Fu});

/**
 * Geometry of the strut and its column plate, mm. Across the runway y from the lower-shaft centroid toward the crane;
 * along it x from the column centerline; elevations z from the column base.
 */
export function stepStrutGeometry(p:ProjectInput,g:StepGeometry){
 const st=activeStepStrut(p),shape=st?aiscShapeByName(st.shape):undefined;if(!st||!shape)return undefined;
 const sd=shape.d*inch,sbf=shape.bf*inch,stf=shape.tf*inch,stw=shape.tw*inch,sk=shape.kdes*inch,tp=st.plate.thickness,db=st.bolts.diameter,bolt=boltProperties(st.bolts.grade,db);
 const edge=up(1.5*db),pitch=up(3*db,inch/2),face=g.lower.d/2,ys=face+tp+stw/2;
 // Plate height: the strut's flat web between its fillets; the column rows centered on the strut.
 const half=Math.max(edge,down(sd/2-sk)),height=2*half;
 // Below the cap: clear of the bearing-bolt nuts and washers under it (the bolt, nut, washer and stick-through plus 1/2 in).
 const eb=activeEndBearing(p),nutDrop=up((eb?.bolts.diameter??.75*inch)*1.6+inch/2),top=g.cap.bottom-nutDrop,z=top-sd/2;
 // Column bolts: pairs either side of the lower web at the gauge g_c: 5 1/2 in, or wider where the nuts inside the flange
 // need it to clear the web fillet (k1 + C1 each side), within the flange edge distance.
 const k1=g.lower.tw/2+Math.max(0,(aiscShapeByName(g.lower.shape)?.kdes??g.lower.tf/inch)*inch-g.lower.tf),wrench=wrenchClearance(db);
 const gauge=Math.min(Math.max(5.5*inch,up(2*(k1+wrench))),down(g.lower.bf-2*edge)),rows=Array.from({length:st.columnRows},(_,i)=>(i-(st.columnRows-1)/2)*pitch);
 // Strut ends 1/2 in past the column flange tips, the strut bolts in line along its web, the plate to the last bolt's edge.
 const end=g.lower.bf/2+inch/2,bolts=Array.from({length:st.strutBolts},(_,i)=>end+edge+i*pitch),plateEnd=bolts.at(-1)!+edge,cope=plateEnd-end+inch/2;
 return {shape:st.shape,d:sd,bf:sbf,tf:stf,tw:stw,kdes:sk,ys,z,top,face,tp,height,half,edge,pitch,db,bolt,hole:bolt.hole,gauge,rows,end,bolts,plateEnd,cope,
  /** Plate length along the runway, both sides of the column. */
  plateLength:2*plateEnd,
  /** Nut clearance of the column bolts inside the flange to the lower web's fillet (k1 taken as t_w/2 + (k_des − t_f)). */
  nutClear:gauge/2-k1,wrench};
}
export type StepStrutGeometry=NonNullable<ReturnType<typeof stepStrutGeometry>>;
export type StepStrutLayout=ReturnType<typeof stepStrutLayout>;

/** Grids the strut connects: from the first to the last of the locating grids and the braced-bay grids; the braced-bay grids. */
export function stepStrutLayout(p:ProjectInput,locating:number[]){
 const stations=supportStations(p),b=p.longitudinalBracing,spans=b?.enabled?(b.spans??[]).filter(i=>i>=1&&i<stations.length):[];
 const braced=[...new Set(spans.flatMap(i=>[i-1,i]))].sort((a,c)=>a-c),all=[...locating,...braced],first=Math.min(...all),last=Math.max(...all);
 // Distance along the strut from each grid to the nearest braced-bay grid; without surveyed braced spans, the whole runway (bound).
 const total=stations.at(-1)!,distance=stations.map(x=>braced.length?Math.min(...braced.map(j=>Math.abs(stations[j]-x))):total);
 return {stations,braced,first,last,distance,spans:Array.from({length:Math.max(0,last-first)},(_,i)=>first+i+1),length:stations[last]-stations[first],
  bay:Math.max(...p.spans.filter((_,i)=>i>=first&&i<last),0)};
}

/**
 * The column with the strut at one grid, two degrees of freedom at the step (weak-axis translation u of the shear center,
 * twist θ): the column's own springs k_y and K_θ, the strut k_s at y_s and the force F at the girder line y_g,
 *   [k_y + k_s, k_s y_s; k_s y_s, K_θ + k_s y_s²] {u, θ} = F {1, y_g}.
 * Per unit F: the column's weak-axis share k_y u, its torque K_θ θ, the strut's share k_s(u + y_sθ) and the girder line's
 * movement u + y_gθ.
 */
export function strutShare(kY:number,Ktheta:number,ks:number,ys:number,yg:number){
 const a=kY+ks,b=ks*ys,c=Ktheta+ks*ys*ys,det=a*c-b*b,u=(c-b*yg)/det,theta=(a*yg-b)/det;
 return {u,theta,keep:kY*u,torque:Ktheta*theta,strut:ks*(u+ys*theta),move:u+yg*theta};
}
/** Axial stiffness of the strut path at a grid: the strut over the distance to the braced bay in series with the existing bracing. */
export function strutPathStiffness(EA:number,distance:number,kb:number){const f=distance/EA+(Number.isFinite(kb)&&kb>0?1/kb:0);return f>0?1/f:1e12;}

export interface StepStrutForces {
 /** Factored line force (max of traction and crane stop, the column check's factors), its case, and the largest strut share at a column. */
 F:number;caseId:string;share:number;
 /** Unfactored single-crane traction, for the slip at service. */
 service:number;
}
/** The strut's checks for the factored line force. */
export function stepStrutChecks(p:ProjectInput,g:StepGeometry,x:StepStrutForces,layout:StepStrutLayout):CheckResult[]{
 const st=activeStepStrut(p),q=stepStrutGeometry(p,g);if(!st||!q)return [];
 const u=p.units,m=p.method,c=p.existingColumn!,E=p.section.E,L=(v:number)=>format(v,'length',u,3),F=(v:number)=>format(v,'force',u,3),S=(v:number)=>format(v,'stress',u,3),Mf=(v:number)=>format(v,'moment',u,3);
 const group='Crane-level strut',refs=['tr13-column-path','aisc-e','aisc-d','aisc-h','aisc-connections'],checks:CheckResult[]=[];
 const add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,more:string[]=[])=>{
  const ok=Number.isFinite(demand)&&capacity>0&&demand<=capacity*(1+1e-9);
  checks.push({id,group,title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:ok?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,caseId:x.caseId,referenceIds:[...refs,...more]});};
 const sec=stepStrutSection(p,st),s=sectionProperties(sec),P=x.F*Math.max(1,x.share),Lc=layout.bay,rx=Math.sqrt(s.Ix/s.A),ry=Math.sqrt(s.Iy/s.A);
 const head=`${st.shape} (F_y = ${S(st.Fy)}) on the girder line ${L(q.ys)} from the lower-shaft centroid, top ${L(g.cap.bottom-q.top)} below the step cap; line force ${F(x.F)} (${x.caseId})${x.share>1+1e-6?`, × ${x.share.toFixed(3)} the largest share the strut takes at a column`:''}: P = ${F(P)}.`;
 // Compression with self-weight bending: E3 about both axes over the bay (nonslender elements, B4.1a), H1-1 with B1 on the strong axis.
 const lf=Math.max(sec.bf/(2*sec.tf)/(.56*Math.sqrt(E/st.Fy)),(sec.d-2*q.kdes)/sec.tw/(1.49*Math.sqrt(E/st.Fy)));
 const Pc=compressionResistance(s.A,Math.min(rx,ry),Lc,E,st.Fy,m).capacity,w=s.weight,Mu=(m==='LRFD'?1.2:1)*w*Lc**2/8,Pe=Math.PI**2*E*s.Ix/Lc**2,alpha=m==='LRFD'?1:1.6,B1=alpha*P<Pe?1/(1-alpha*P/Pe):Infinity;
 // F2 lateral-torsional buckling of the strut over the bay under its self-weight (C_b = 1.0, conservative).
 const ho=sec.d-sec.tf,rts=Math.sqrt(Math.sqrt(s.Iy*s.Cw)/s.Sx),jc=s.J/(s.Sx*ho),Lp=1.76*ry*Math.sqrt(E/st.Fy),Lr=1.95*rts*E/(.7*st.Fy)*Math.sqrt(jc+Math.sqrt(jc**2+6.76*(.7*st.Fy/E)**2)),Mp=st.Fy*s.Zx;
 const Mn=Lc<=Lp?Mp:Lc<=Lr?Math.min(Mp,Mp-(Mp-.7*st.Fy*s.Sx)*(Lc-Lp)/(Lr-Lp)):Math.min(Mp,Math.PI**2*E/(Lc/rts)**2*Math.sqrt(1+.078*jc*(Lc/rts)**2)*s.Sx);
 const Mc=available(Mn,m,.9,1.67),Mr=B1*Mu,ratioP=P/Pc,H1=ratioP>=.2?ratioP+8/9*Mr/Mc:ratioP/2+Mr/Mc;
 add('step-strut-compression','Crane-level strut · compression with self-weight bending (E3, H1-1)',lf>1?Math.max(H1,lf):H1,1,'ratio','\\frac{P_r}{P_c}+\\frac89\\frac{B_1M_u}{M_c}\\le1;\\ P_c=F_{cr}A_g\\ (L_c=L_{bay})',
  `${head} Compression over the longest bay L_c = ${L(Lc)} about both axes (the strut is unbraced between the columns), L_c/r_y = ${(Lc/ry).toFixed(0)}: φP_n = ${F(Pc)}. Self-weight ${format(w,'lineLoad',u,3)} as a simple span, M_u = ${Mf(Mu)} (${m==='LRFD'?'1.2D':'D'}), B1 = ${B1.toFixed(3)}, φM_n = ${Mf(Mc)} (F2 lateral-torsional buckling over L_b = L_c, C_b = 1.0). Elements nonslender for compression (B4.1a, ratio ${lf.toFixed(2)}).`,['aisc-b']);
 add('step-strut-slenderness','Crane-level strut · slenderness L_c/r ≤ 200 (E2 user note)',Lc/ry,200,'ratio','L_c/r\\le200',`Longest bay ${L(Lc)}, r_y = ${L(ry)}: the strut reverses between tension and compression at every crane start, stop and stop impact.`);
 // Tension: gross yielding; rupture of the coped web (the web alone at the lap, one hole in the bolt line).
 const webDepth=sec.d-2*sec.tf,An=(webDepth-(q.hole+inch/16))*sec.tw,tension=Math.min(available(st.Fy*s.A,m,.9,1.67),available(st.Fu*An,m,.75,2));
 add('step-strut-tension','Crane-level strut · tension yielding and rupture of the coped web (D2)',P,tension,'force','\\min(\\phi F_yA_g,\\ \\phi F_uA_e),\\ A_e=A_n=(d-2t_f-d_h)t_w',
  `${head} The flanges are coped over the lap: the web plate alone at the bolts, U = 1 (D3, a plate connected through its whole element), one ${L(q.hole+inch/16)} hole (standard hole plus 1/16 in) in the line: A_n = ${format(An,'area',u,3)}; gross yielding ${F(available(st.Fy*s.A,m,.9,1.67))}.`,['aisc-d']);
 // Strut-end bolts: single shear through the web and the plate; slip at the factored force (Class B); bearing and tearout.
 const nb=st.strutBolts,bc=boltCapacity({grade:st.bolts.grade,diameter:q.db,planes:1,surface:'B',shear:P/nb,tension:0,method:m}),perBolt=P/nb;
 const clearEnd=q.edge,web=plateBearing(q.db,q.hole,sec.tw,st.Fu,clearEnd,q.pitch,m).capacity,plateB=plateBearing(q.db,q.hole,q.tp,st.plate.Fu,q.plateEnd-q.bolts.at(-1)!,q.pitch,m).capacity;
 add('step-strut-bolts','Crane-level strut · end bolts in shear, slip and bearing (J3.6, J3.8, J3.10)',Math.max(perBolt/bc.shear,perBolt/bc.slip,perBolt/Math.min(web,plateB)),1,'ratio','\\frac{P}{n}\\le\\min(\\phi r_{nv},\\ \\phi r_{slip},\\ \\phi r_{bearing})',
  `${nb} - ${L(q.db)} ${st.bolts.grade} in line in the strut web at ${L(q.pitch)}, edge ${L(q.edge)}, single shear through the web and the ${L(q.tp)} plate: ${F(perBolt)} per bolt against shear ${F(bc.shear)} (threads included), slip ${F(bc.slip)} (pretensioned, Class B, standard holes, h_f = 1, D_u = 1.13; reversing load, slip-critical at the factored force) and bearing / tearout ${F(Math.min(web,plateB))} (web ${L(sec.tw)}, ${F(web)}; plate ${F(plateB)}). Block shear of the single bolt line (two shear planes to the coped end, no tension plane) equals the tearout sum (J4.3).`);
 // The plate: tension yielding over its height, rupture through a row of column bolts (the line force passing the column), compression over its free length.
 const tp=q.tp,hp=q.height,yieldP=available(st.plate.Fy*hp*tp,m,.9,1.67),Anp=(hp-st.columnRows*(q.hole+inch/16))*tp,ruptP=available(st.plate.Fu*Math.max(0,Anp),m,.75,2);
 const free=Math.max(inch/4,q.bolts[0]-g.lower.bf/2),KLr=1.2*free/(tp/Math.sqrt(12)),fp=KLr<=25?yieldP:compressionResistance(hp*tp,tp/Math.sqrt(12),1.2*free,E,st.plate.Fy,m).capacity;
 add('step-strut-plate','Column plate · tension, net rupture and compression (J4.1, J4.4)',Math.max(P/yieldP,P/ruptP,P/fp),1,'ratio','P\\le\\min(\\phi F_yh_pt_p,\\ \\phi F_uA_n,\\ \\phi P_n)',
  `PL ${L(tp)} × ${L(hp)} × ${L(q.plateLength)} (F_y = ${S(st.plate.Fy)}) on the crane-side flange face: the whole line force through it past the column (conservative: the force a column delivers is less). Yielding ${F(yieldP)}; rupture through a vertical row of ${st.columnRows} column bolts, A_n = ${format(Anp,'area',u,3)}: ${F(ruptP)}; compression of the plate beyond the flange tip to the first strut bolt, ${L(free)} free, K = 1.2 (J4.4 where KL/r ≤ 25, else E3): ${F(fp)}.`,['aisc-d']);
 // Column bolts: through the plate and the existing lower crane-side flange, single shear; slip Class A (existing flange cleaned, mill scale).
 const nc=2*st.columnRows,cc=boltCapacity({grade:st.bolts.grade,diameter:q.db,planes:1,surface:'A',shear:P/nc,tension:0,method:m}),pc=P/nc;
 const flangeB=plateBearing(q.db,q.hole,g.lower.tf,c.Fu,q.edge+(q.height/2-q.half),q.pitch,m).capacity,plateC=plateBearing(q.db,q.hole,tp,st.plate.Fu,(q.plateLength/2-q.gauge/2),q.pitch,m).capacity;
 add('step-strut-column-bolts','Column plate bolts to the existing crane-side flange · shear, slip and bearing',Math.max(pc/cc.shear,pc/cc.slip,pc/Math.min(flangeB,plateC)),1,'ratio','\\frac{P}{2n_r}\\le\\min(\\phi r_{nv},\\ \\phi r_{slip,A},\\ \\phi r_{bearing})',
  `${st.columnRows} rows of bolt pairs at ${L(q.gauge)} gauge either side of the lower web, ${L(q.pitch)} pitch, field-drilled standard holes in the existing flange (t_f = ${L(g.lower.tf)}, F_u = ${S(c.Fu)}): ${F(pc)} per bolt (the whole line force on the group, conservative) against shear ${F(cc.shear)}, slip ${F(cc.slip)} (Class A: clean mill scale on the existing flange, μ = 0.30) and bearing / tearout ${F(Math.min(flangeB,plateC))} (existing flange ${F(flangeB)}, plate ${F(plateC)}).`);
 // Fit: rows within the plate height, the gauge within the flange with edge distance, nuts inside the flange clear of the web fillet.
 const rowsNeed=(st.columnRows-1)*q.pitch+2*q.edge;
 add('step-strut-fit','Column plate bolts · fit in the plate and on the flange (J3.3, J3.4), nut clearance',Math.max(rowsNeed/hp,(q.gauge+2*q.edge)/g.lower.bf,q.wrench/Math.max(q.nutClear,1e-6),(3*q.db)/q.gauge),1,'ratio','(n_r-1)s+2e\\le h_p;\\ g_c+2e\\le b_f;\\ g_c/2-k_1\\ge C_1;\\ g_c\\ge3d_b',
  `Rows ${L(rowsNeed)} within the plate ${L(hp)}; gauge ${L(q.gauge)} plus edges within the flange ${L(g.lower.bf)}; the nuts inside the flange clear the web fillet by ${L(q.nutClear)} against the wrench clearance ${L(q.wrench)}; spacing at least 3d.`);
 // F13.1: holes in the existing flange (two per row).
 const Afg=g.lower.bf*g.lower.tf,Afn=(g.lower.bf-2*(q.hole+inch/16))*g.lower.tf,Yt=c.Fy/c.Fu<=.8?1:1.1;
 add('step-strut-flange-holes','Existing crane-side flange · bolt holes (F13.1)',Yt*c.Fy*Afg,c.Fu*Afn,'force','Y_tF_yA_{fg}\\le F_uA_{fn}',
  `Two field-drilled holes per row across the existing lower crane-side flange: A_fn = ${format(Afn,'area',u,3)} of A_fg = ${format(Afg,'area',u,3)}. Where F_uA_fn ≥ Y_tF_yA_fg the holes do not reduce the lower shaft's flexural strength (F13.1); compression members take the gross section (B4.3). Drill or ream; no flame-cut holes in existing steel.`,['aisc-f13']);
 return checks;
}

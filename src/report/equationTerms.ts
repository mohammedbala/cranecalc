import type {CheckResult} from '../engine/types';
import {equationSymbols,entrySymbol,notationGroups} from './notation';

/**
 * Symbols local to one check, defined under its equation ("where …"). Standard AISC 360-16 / AISC Manual / AISC DG9
 * symbols and the crane-girder symbols of the notation section are not repeated; only the symbols an equation uses
 * are printed. Keyed by check id (pattern); the same symbol may mean different things in different details.
 */
type Term=[tex:string,meaning:string];
const terms:[RegExp,Term[]][]=[
 // Solution checks.
 [/^(convergence|mesh|design-travel|design-mesh|detail-travel|detail-mesh)$/,[['D_n','each governing demand with n crane positions, stations or elements'],['D_{2n}','the same with twice as many']]],
 [/^(equilibrium|design-equilibrium)$/,[['R','support reactions'],['w','dead load per unit length']]],
 // AWS D1.1 carbon equivalent: element contents in percent by mass (mill certificate).
 [/^column-weld-ce$/,[['\\mathrm{CE}','carbon equivalent, AWS D1.1 Annex B; element contents in percent by mass from the mill certificate']]],
 // Crane loads and bumper.
 [/^crane-\d+-side$/,[['s','share of the whole-crane side thrust taken by this runway']]],
 [/^crane-\d+-bumper-(decel|energy)$/,[['v','rated bridge speed'],['s','bumper stroke'],['g','acceleration of gravity'],['a','deceleration'],['F','peak bumper force']]],
 [/^crane-\d+-bumper-stop$/,[['F','peak bumper force']]],
 [/^building-class$/,[['N_{max}','largest cycle count of the building class']]],
 [/^rail-clip-weld-fatigue$/,[['Q_i','lifted load of duty bin i'],['f_w','clip base weld stress per unit force set']]],
 // Girder.
 [/^major$/,[['M_{n,LTB}','lateral-torsional buckling strength, F4-2 or F4-3']]],
 [/^torsion-normal(-bottom)?$/,[['P','axial force'],['M_y','lateral bending moment of the section'],['S_{xc}','section modulus to the top fiber (cap)'],['S_{xt}','section modulus to the bottom fiber'],['S_y','I_y over half the cap width'],['W_{no}','normalized warping function at the tips of this flange']]],
 [/^vertical$/,[['L','span']]],
 [/^torsion-shear$/,[['\\tau_b','shear stress from flexural shear, VQ/(It)']]],
 [/^torsion-stability$/,[['\\lambda','elastic buckling load factor of the strength case (0.8 stiffness)']]],
 [/^flexure-load-height$/,[['M_{cr}','elastic critical moment from the buckling analysis with the wheels at the rail head'],['F_{cr}','F4-5 (F2-4) elastic stress at Lb with Cb = 1'],['M_{n,LTB}','F4-2 / F4-3 (F2-2 / F2-3) moment with Cb = 1']]],
 [/^rail-head$/,[['y_r','height of the rail head'],['y_o','height of the shear center']]],
 [/^brace-member$/,[['H','horizontal reaction at the flange restraint']]],
 [/^brace-stiffness$/,[['\\beta','stiffness of the restraint provided'],['k_i','stiffness of each element of the restraint in series (tabulated)']]],
 [/^stiffener-(fatigue|weld-fatigue)$/,[['\\Delta R','support reaction range']]],
 [/^stiffener-combined-weld$/,[['R_{eq}','equivalent reaction on the four web weld lines'],['R','support reaction'],['H','lateral flange force at the restraint']]],
 [/^stiffener-lateral-flexure$/,[['H','lateral flange force at the restraint']]],
 [/^bearing-plate$/,[['m','moment per unit width'],['f_p','bearing pressure'],['a','cantilever from the stiffener footprint']]],
 [/^bearing-contact$/,[['R','support reaction']]],
 [/^(hold-down-model|haunch-uplift)$/,[['R_{up}','uplift reaction at the girder end']]],
 [/^rotation-clearance$/,[['g','clearance at the girder end'],['\\theta','end rotation']]],
 // Cap channel.
 [/^cap-weld-strength$/,[['Q_y','first moment of half the cap about the vertical axis'],['q_r','shear flow from the wheel loads (TR-13 §5.8.6 spread)'],['A','area of the capped section'],['\\beta','end-loaded weld factor, J2.2b']]],
 [/^cap-development$/,[['F_c','force the cap welds deliver to the channel between its end and the section at x'],['x','distance from the cap end']]],
 [/^cap-development-full-force$/,[['c','fraction of the channel yield force to be developed'],['\\beta','end-loaded weld factor, J2.2b']]],
 [/^cap-rail-footprint$/,[['b_r','rail base width']]],
 [/^cap-weld-fatigue$/,[['\\Delta q','range of the shear flow on one weld']]],
 // Rail, rail clips, joints.
 [/^rail-flexure$/,[['H','lateral wheel force'],['s','rail clip spacing']]],
 [/^rail-web$/,[['t_h','rail head thickness']]],
 [/^rail-clip-(lateral|uplift)$/,[['H_c','side thrust on one clip: the wheel group at the clip station, service or factored as the rating basis'],['R_c','manufacturer’s rated lateral capacity of one clip'],['T_c','uplift on the hold-down clip'],['R_t','manufacturer’s rated uplift capacity of one clip'],['b_r','rail base width']]],
 [/^rail-clip-weld$/,[['l_w','length of each of the two base welds (across the rail)'],['V','lateral force on the clip'],['T','uplift on the clip'],['M','moment about the weld centroid (V at mid-height of the rail base, or T at the clip nose)']]],
 [/^rail-joint-plate$/,[['a','distance from the joint centerline to the first bolt line']]],
 [/^rail-joint-fit$/,[['h_j','joint bar height'],['t_h','rail head thickness'],['t_b','rail base thickness']]],
 [/^rail-anchorage$/,[['F','factored crane longitudinal force (traction and braking)'],['R_a','manufacturer’s rated longitudinal resistance of one anchor clip pair']]],
 [/^rail-(end-gap|expansion-gap)$/,[['g','gap'],['L','rail length that grows toward the gap'],['L_1','anchor-to-joint lengths of the two pieces']]],
 [/^rail-joint-(fatigue|shear-fatigue)$/,[['\\Delta M','moment range in the joint bars'],['\\Delta P','wheel load range']]],
 [/^coord-rail-joints$/,[['x_j','rail joint position'],['x_g','girder joint position'],['x_j^{\\prime}','joint on the opposite rail'],['s','wheel spacing of the end truck']]],
 // Column and bracing.
 [/^column-(flexure|flexure-y)$/,[['M_x','strong-axis moment of each factored load (crane eccentric reaction and existing loads)'],['M_y','weak-axis moment of each factored load']]],
 [/^column-longitudinal-path$/,[['M_s','seat moment of the girder reactions about the haunch web'],['F','longitudinal force at the seat'],['m_M','weak-axis moment at height z per unit seat moment'],['m_F','weak-axis moment at height z per unit force at the seat'],['z','height above the base']]],
 [/^column-drift/,[['H','height from the column base to the top of the crane girder']]],
 [/^column-rail-gauge$/,[['\\Delta_g','change in rail gauge']]],
 [/^column-weld-preheat$/,[['T','preheat and interpass temperature'],['T_{min}','minimum preheat, AWS D1.1 Table 5.8'],['t_{cf}','column flange thickness']]],
 [/^brace-(tension|drift)/,[['H','longitudinal force on the braced line'],['n','braced bays'],['n_d','diagonals sharing the force'],['n_t','tiers'],['L','diagonal length'],['T','diagonal force'],['\\theta','diagonal angle from horizontal']]],
 [/^brace-rod-fatigue$/,[['\\Delta T','rod force range (crane traction, unfactored)'],['A_t','tensile stress area']]],
 // Tapered haunch.
 [/^haunch-flexure$/,[['f_{bc}','compression flange stress'],['V','vertical reaction'],['e','distance of the reaction from the column face'],['y','station from the column face'],['H','lateral force'],['z_t','level of the haunch top flange, where H acts'],['M_{n,FLB}','flange local buckling strength, F4-13']]],
 [/^haunch-flange-shear$/,[['V_f','lateral shear in one flange'],['I_{yf}','moment of inertia of that flange about the vertical axis'],['F','longitudinal force at the girder web line'],['V_i','girder reaction'],['x_i','its distance from the haunch web'],['z_t','level of the top flange, where F acts'],['z_{sc}','shear center level'],['T','torque on the haunch']]],
 [/^haunch-(combined|bottom-flange|top-flange|top-flange-net|interaction)$/,[['f','flange stress'],['P','axial force along the haunch'],['C','sloping bottom flange force'],['T','top flange force'],['A_f','flange area'],['M_f','flange bending from torsion and the longitudinal force']]],
 [/^haunch-seat-strip$/,[['m_u','required moment per unit width of the top flange'],['P','bearing force'],['c','flange cantilever from the stiffener face'],['l','bearing patch length'],['W','bearing width'],['x','load position from the web plane'],['x_s','stiffener tip'],['b_e','bearing width spread at 45° to the stiffener tip']]],
 [/^haunch-stiffener-(column|weld)$/,[['e','eccentricity of the reaction from the stiffener centroid']]],
 [/^haunch-stiffener-weld$/,[['M','moment of the reaction about the weld group centroid'],['c_x','distance of the critical point from the centroid, along the stiffener'],['c_y','distance across it']]],
 [/^haunch-flange-web-weld$/,[['R','bearing force over the web between the stiffener clips']]],
 [/^haunch-(top|bottom)-flange-cjp$/,[['f','flange normal stress'],['V_f','lateral shear in the flange'],['A_f','flange area'],['\\alpha','bottom flange slope']]],
 [/^haunch-web-weld$/,[['f_b','web normal stress at the weld'],['t_e','effective throat'],['V','vertical shear'],['h','weld length']]],
 [/^haunch-web-base$|^haunch-flange-base$/,[['f_{BM}','base metal stress at the fillet fusion faces'],['t_e','effective throat'],['t_{cf}','column flange thickness']]],
 [/^haunch-column-(flange|yield-top|yield-bottom|crippling|sidesway)$/,[['R_u','equivalent concentrated force of the haunch flange at this level, the same in every J10 limit state there'],['T','top flange tension at the column face'],['C','horizontal component of the bottom flange compression, C cos α'],['M_f','lateral moment of that flange at the column face (torsion as flange bending, and the longitudinal force)'],['b','welded flange width'],['k','column flange thickness (no fillet credit)'],['l_b','bearing length of the flange force on the column, the flange thickness']]],
 [/^haunch-deflection$/,[['\\Delta_b','bending deflection over the taper'],['\\Delta_s','shear deformation over the taper'],['\\theta','twist at the bearing'],['x','distance to the outer bearing edge']]],
 [/^haunch-rotation$/,[['M','moment along the taper'],['e','distance of the reaction from the column face'],['y','station from the column face']]],
 [/^haunch-fatigue-column$/,[['\\Delta V','reaction range'],['e_c','eccentricity of the reaction from the column centroid'],['S_c','column section modulus']]],
 [/^haunch-colstiff-(upper|lower|flange-weld|web-weld|web-shear)$/,[['R_{st}','force on one column stiffener plate'],['T','haunch top flange tension at the column face'],['C','haunch bottom flange compression at the column face, C cos α'],['M_f','lateral moment of that flange at the column face'],['g','distance between the centroids of the two plates, t_w + b_s'],['b_s','stiffener width'],['c','corner clip'],['t_s','stiffener thickness'],['P_n','nominal strength of the pair as a J10.8 column with a 25t_w web strip']]],
 [/^haunch-colstiff-proportions$/,[['b_p','width of the haunch flange delivering the force'],['t_p','its thickness']]],
 [/^haunch-colstiff-length$/,[['L_s','stiffener length']]],
 [/^haunch-colstiff-fatigue-plate$/,[['P_i','stiffener force of duty bin i (ΔP<sub>i</sub> its range)']]],
 // W stub at the column face (C2): one force system per stub flange, the same R_u in every J10 limit state at a level.
 [/^wbracket-column-(flange|yield-top|yield-bottom|crippling|sidesway)$/,[['R_u','equivalent concentrated force of the stub flange at this level, the same in every J10 limit state there'],['T','top flange tension at the column face, M/(d − t_f) + N/2'],['C','bottom flange compression at the column face, M/(d − t_f) − N/2'],['M_f','lateral moment of that flange at the column face (torsion as flange bending, and the lateral force)'],['b','stub flange width'],['k','column flange thickness (no fillet credit)'],['l_b','bearing length of the flange force on the column, the stub flange thickness']]],
 [/^wbracket-colstiff-(upper|lower|flange-weld|web-weld|web-shear)$/,[['R_{st}','force on one column stiffener plate'],['T','stub top flange tension at the column face'],['C','stub bottom flange compression at the column face'],['M_f','lateral moment of that flange at the column face'],['g','distance between the centroids of the two plates, t_w + b_s'],['b_s','stiffener width'],['c','corner clip'],['t_s','stiffener thickness'],['P_n','nominal strength of the pair as a J10.8 column with a 25t_w web strip']]],
 [/^wbracket-colstiff-proportions$/,[['b_p','width of the stub flange delivering the force'],['t_p','its thickness']]],
 [/^(wbracket|bracket)-colstiff-length$/,[['L_s','stiffener length']]],
 [/^(wbracket|bracket)-colstiff-fatigue-plate$/,[['P_i','stiffener force of duty bin i (ΔP<sub>i</sub> its range)']]],
 // Welded rib brackets: each plate of a column stiffener pair takes the rib over it.
 [/^bracket-colstiff-(upper|lower|flange-weld|web-weld|web-shear)$/,[['R_{st}','force on one column stiffener plate: the rib over it, its root couple 1.5Pe/h_r (with half the lateral force at the seat)'],['b_s','stiffener width'],['c','corner clip'],['t_s','stiffener thickness'],['P_n','nominal strength of the pair as a J10.8 column with a 25t_w web strip']]],
 [/^bracket-colstiff-proportions$/,[['b_p','width of the seat plate or the ribs delivering the force'],['t_p','its thickness']]],
 [/^haunch-slope$/,[['h(0)','depth at the column face'],['h(L)','depth at the tip']]],
 // Bearings and end connections.
 [/^end-bearing-locating-shear$/,[['P','longitudinal force at the girder end'],['H','lateral force at the bottom flange']]],
 [/^end-bearing-(locating-tension|uplift)$/,[['R_{up}','uplift reaction']]],
 [/^end-bearing-(wrench-stiffener|washer-stiffener)$|^end-stop-wrench-bearing$/,[['x_b','bolt row position along the girder'],['x_{st}','bearing stiffener position'],['t_{st}','stiffener thickness'],['b','plate washer length']]],
 [/^end-bearing-washer-fit$/,[['w_w','plate washer width']]],
 [/^end-bearing-wrench-haunch-(column|depth)$/,[['y_b','bolt row from the column face'],['h(y_b)','clear depth of the haunch at that row']]],
 [/^end-bearing-wrench-haunch-web$/,[['x_b','bolt from the web plane']]],
 [/^end-bearing-seat-fit(-end)?$/,[['N','bearing plate length'],['b_t','width of the haunch top flange (seat)'],['g','gap between the girder ends']]],
 [/^end-bearing-(sleeve-bearing)$|^cap-angle-sleeve-bearing$/,[['d_s','sleeve outside diameter']]],
 [/^end-bearing-(flange-edge|end-edge)$|^cap-angle-(slot-toe|washer-bending)$|^end-bearing-washer-bending$/,[['w_{slot}','slot width'],['L_{slot}','slot length']]],
 // Cap tieback angle.
 [/^cap-angle-/,[['F','tie force (pull or push)'],['g_v','cap bolt line below the top of the cap'],['g_h','lap bolt line from the back of the short leg'],['t_a','angle thickness'],['M_v','moment from the support movement'],['V_v','end shear from the support movement'],['q_{ep}','end plate prying force'],['q_c','column flange prying force'],['e','lever arm to the toe of the long leg'],
  ['b_{f,c}','channel flange depth below the top of the cap'],['L_a','angle length'],['l_{slot}','slot length'],['w_{slot}','slot width'],['d_a','short leg of the angle'],['h_w','plate washer height'],['k_a','k of the angle'],['k_c','k of the channel'],['e_{min}','minimum edge distance, Table J3.4'],['e_x','tie bolts from the column centerline'],
  ['z_b','lower column bolt above the bracket seat'],['z_{st}','top of the bracket column stiffener'],['z_{max}','top of the tie hardware above the cap'],['h_b','height of the cap bolts above the bearing'],['\\theta','end rotation'],['\\Delta M','moment range at the section'],['b','width of the fillet-welded plate'],['L','tie plate clear span'],['\\Delta_v','support movement']]],
 [/^coord-cap-tie-adjacent$/,[['e_x','tie offset from the column centerline'],['b_{ep}','end plate width']]],
 // End stops.
 [/^end-stop-/,[['P','bumper force'],['t_b','base plate thickness'],['D','bumper contact diameter'],['e','bumper height above the base plate'],['H','face plate height'],['W','face and base plate width'],['N','base plate length'],['a','lip in front of the face plate'],['L_s','stiffener length'],['c_f','front bolt line behind the face plate'],['e_r','offset of the bumper from the stop center'],['R_s','force on the more loaded stiffener'],['R_{up}','uplift at the far support'],['y','bumper height above the girder centroid'],['w','girder dead load per unit length']]],
 // Simple supports and movement.
 [/^simple-(guide-travel|joint-gap)$/,[['L','distance from the locating support'],['\\Delta T','temperature change'],['\\theta','end rotation'],['g','joint gap'],['u','slot travel each way']]],
 [/^end-bearing-travel$/,[['L','distance of the farthest sliding support from the locating support'],['\\Delta T','temperature change'],['\\theta','end rotation'],['u','slot travel each way']]],
];
/** Standard symbols (AISC 360-16, AISC Manual, AISC DG9) that need no definition in the report. */
export const standardSymbols=new Set(`A A_{b} A_{e} A_{g} A_{n} A_{nt} A_{nv} A_{gv} A_{pb} A_{st} A_{t} A_{w} A_{we} A_{fg} A_{fn} A_{f} B_{1} C_{b} C_{f} C_{r} C_{v1} C_{2} C_{1} D_{u} E F_{cr} F_{e} F_{ex} F_{ey} F_{ez} F_{EXX} F_{n} F_{nt} F'_{nt} F_{nv} F_{SR} F_{TH} F_{u} F_{y} F_{yf} F_{yw} F_{L} G I I_{x} I_{y} I_{yc} I_{p} I_{w} J K L L_{b} L_{c} L_{p} L_{r} L_{w} M M_{cx} M_{cy} M_{n} M_{p} M_{r} M_{rx} M_{ry} M_{u} M_{y} M_{yc} M_{yt} M_{cr} M_{nt} M_{x} P P_{c} P_{n} P_{r} P_{u} P_{y} P_{br} R_{FIL} R_{n} R_{nt} R_{nv} R_{pc} R_{pt} R_{pg} R_{u} S S_{x} S_{xc} S_{xt} S_{y} S_{n} S_{w} T_{b} T_{u} U U_{bs} V V_{n} V_{u} V_{x} V_{y} W_{no} Y_{t} Z Z_{x} Z_{y} b_{f} b_{s} b' c d d_{b} d_{h} d_{c} f_{rv} f_{sr} f_{v} f_{w} f_{b} f_{r} h h_{c} h_{f} h_{o} h_{p} k k_{1} k_{c} k_{sc} k_{v} l_{b} l_{c} n_{b} n_{s} n_{SR} n_{i} N_{i} p q r r_{ts} t t_{f} t_{p} t_{w} t_{s} t_{min} t_{e} w w_{min} \\alpha \\beta_{br} \\delta \\rho \\lambda_{pf} \\lambda_{pw} \\lambda_{rw} \\lambda_{r} \\phi \\phi_{b} \\phi_{v} \\phi_{t} \\Omega \\Omega_{b} \\theta \\theta' \\theta'' \\theta''' \\mu \\sigma_{ws} \\tau_{t} \\tau_{ws} F_{SR,i} y_{o} B_{1} C_{d} \\gamma_{D} D L R a b e g l s u x y z f_{p} \\Delta`.split(' '));
/** Crane-girder symbols defined in the notation section (with the variants defined in its entries). */
export function notationSymbols(){
 return new Set([...notationGroups.flatMap(([,l])=>l.map(([t])=>entrySymbol(t))),'C_{dm}','C_{ds}','C_{vm}','C_{vs}','C_{vs,min}','F_{SR,i}','E']);
}
/**
 * Does the equation use this defined term? Whole symbols only: a one-symbol term (e, b, L, q_{ep}) must be one of the
 * equation's symbols, never a letter inside \\le, T_b or \\mathrm{sleeve}; a compound term (\\Delta M) needs every symbol
 * and the term itself in the equation; a term that is not a symbol (\\mathrm{CE}) must appear as written.
 */
function usesTerm(equation:string,used:Set<string>,tex:string){
 const own=[...equationSymbols(tex)];
 if(!own.length){const at=equation.indexOf(tex);return at>=0&&!/[A-Za-z]/.test(equation[at+tex.length]??'');}
 if(own.length===1)return used.has(own[0]);
 const flat=(v:string)=>v.replace(/\s+/g,'');
 return own.every(v=>used.has(v))&&new RegExp(`${flat(tex).replace(/[\\^$.*+?()[\]{}|]/g,'\\$&')}(?![A-Za-z])`).test(flat(equation));
}
/** The definitions to print under a check's equation: local symbols the equation uses. */
export function termsFor(c:CheckResult):Term[]{
 if(!c.equation)return [];
 const used=equationSymbols(c.equation),seen=new Set<string>(),out:Term[]=[];
 // Keyed by the definition's TeX: x_j and x_j′, h(0) and h(L) are separate entries.
 for(const [re,list] of terms)if(re.test(c.id))for(const [tex,meaning] of list){
  if(seen.has(tex))continue;
  if(usesTerm(c.equation,used,tex)){seen.add(tex);out.push([tex,meaning]);}
 }
 return out;
}

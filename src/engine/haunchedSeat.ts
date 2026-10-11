import type {CheckResult,ProjectInput} from './types';
import type {BracketResults} from './bracketDesign';
import {available} from './aiscStrength';
import {format} from './units';
import {ribGeometry,ribResponse,ribFlexure,ribFreeEdge} from './bracketRib';

type Add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,caseId?:string,refs?:string[])=>void;
/** Category A constant of AISC Table A-3.1 in the app's 10^8 units, as fatigueSpectrumBin uses. */
const categoryA=25;
const refs=['bracket-basis','haunched-bracket','tr13-bracket'];
/** Geometry of the haunched rib of a project as the checks and drawings state it. */
export function haunchedRibData(p:ProjectInput){
 const b=p.details!.bracket!,g=ribGeometry(b),E=p.section.E,e=b.reach+p.details!.bearing.width/2,rib=ribResponse(g,e,E,E/2.6),edge=ribFreeEdge(g,E,p.details!.material.Fy,p.method);
 return {b,g,e,rib,edge,degrees:g.angle*180/Math.PI};
}
/**
 * The checks a tapered rib adds to the welded-rib bracket checks: flexure and shear at the root (the critical
 * section is checked by the common rib checks), the sloping free edge for yield / local buckling and its minimum
 * thickness, and fatigue of the free edge at the critical section.
 */
export function haunchedRibChecks(p:ProjectInput,r:BracketResults,add:Add,common:string){
 const {b,g,rib,edge,degrees}=haunchedRibData(p),m=p.details!.material,E=p.section.E,f=(v:number)=>format(v,'length',p.units,3);
 const peak=(key:string)=>r.strength[key];
 const from=(key:string,id:string,title:string,capacity:number,q:CheckResult['quantity'],eq:string,note:string)=>{const v=peak(key);add(id,title,v?.value??0,capacity,q,eq,note,v?.caseId,refs);};
 from('ribRootMoment','rib-flexure-root','Haunched ribs · flexure / lateral buckling at the root',ribFlexure(b,E,m.Fy,p.method,0).capacity,'moment','M_r=|P_\\pm|e;\\quad M_n=\\min(F_yZ,\\,F_{cr}S)\\big|_{h_r};\\quad F_{cr}=F_{11}(L_b=2L,\\,d=h_r)',`${common} Root section, depth ${f(g.root)}, at the column face; the critical section along the taper is checked above.`);
 from('ribRootShear','rib-shear-root','Haunched ribs · shear at the root',available(.6*m.Fy,p.method,.9,1.67),'stress','\\tau=1.5|P|/(h_rt)',`${common} Root section, depth ${f(g.root)}. Elastic peak shear; no plastic shear distribution.`);
 from('ribEdge','rib-edge','Haunched ribs · sloping free edge, yield / local buckling',edge.capacity,'stress','f_e=\\frac{|P_\\pm|(e-x_c)}{S(x_c)\\cos^2\\alpha};\\quad F_{cr}=F_y\\min\\left[1,\\left(\\frac{1.47\\sqrt{E/F_y}}{\\min(a,b)/t}\\right)^2\\right]',
  `${common} The free edge is traction free, so its stress is uniaxial along the edge and the bending stress on a vertical section is its component f_e cos²α; α = ${degrees.toFixed(1)}° from the horizontal, edge ${f(g.edgeLength)} long. Greatest at the critical section, ${f(rib.critical.x)} from the column face (depth ${f(rib.critical.depth)}). The edge reaches yield for min(a, b)/t ≤ 1.47√(E/Fy) (the triangular bracket-plate rule, 250/√Fy in ksi), with a = root depth ${f(g.root)} and b = projection ${f(g.length)}: here ${edge.slenderness.toFixed(2)} against ${edge.limit.toFixed(2)}${edge.Fcr<m.Fy?'; beyond it the elastic plate value applies':''}.`);
 add('rib-edge-thickness','Haunched ribs · minimum thickness for the free-edge slenderness',edge.minimumThickness,g.thickness,'length','t\\ge t_{min}=\\frac{\\min(a,b)}{1.47\\sqrt{E/F_y}}\\;\\left(b/t\\le\\frac{250}{\\sqrt{F_y}}\\max\\left(1,\\frac{b}{a}\\right),\\;0.5\\le\\frac{b}{a}\\le2\\right)',
  `Triangular bracket-plate free-edge rule (AISC Manual Part 15 after Salmon and Johnson; Salmon, Buettner and O'Sheridan): b/t ≤ 250/√Fy for b/a ≤ 1 and 250(b/a)/√Fy for 1 < b/a ≤ 2, Fy in ksi. Applied to the trapezoidal rib with b = projection ${f(g.length)} and a = root depth ${f(g.root)} (b/a = ${edge.proportion.toFixed(2)}), the full root depth bounding the edge's vertical extent; the ${f(g.tip)} tip only shortens the free edge.`,undefined,refs);
 // Free edge base metal: a thermally cut plate edge without re-entrant corners, AISC Table A-3.1 item 1.1.
 const damage=r.fatigue.reduce((sum,v)=>{const limit=6900*(categoryA/v.cycles)**(1/3);return sum+((v.ribEdge??0)/limit)**3;},0);
 add('fatigue-rib-edge','Haunched rib free edge · fatigue',damage,1,'ratio','D=\\sum_i(\\Delta f_i/F_{SR,A})^3\\le1;\\quad\\Delta f=\\frac{\\Delta P(e-x_c)}{S(x_c)\\cos^2\\alpha}',
  `AISC Table A-3.1 item 1.1, Category A: plain plate with a thermally cut edge of surface roughness of 1,000 microinches (25 micrometers) or less and no re-entrant corners, as the bracket notes require. Range over each duty bin of the unfactored edge stress at the critical section, ${f(rib.critical.x)} from the column face, without impact; Miner summation with no endurance-limit credit. The root corner, at the root fillet, is checked as the rib root above.`,undefined,['bracket-basis','haunched-bracket','aisc-fatigue']);
}

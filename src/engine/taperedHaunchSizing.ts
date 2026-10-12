import {categoryF,fatigueCoefficient} from './fatigueConstants';
/**
 * Template sizing of the tapered I haunch for the project's support reactions. The largest reaction at a grid is put
 * on one girder end at its bearing offset (the torsion of a runway-end grid or of one loaded bay), with one crane's
 * side thrust and longitudinal force, and checked with the haunch's own functions:
 * - strength, factored: flexure and shear on the stations, flange forces, top flange strip, stiffeners and welds and
 *   CJP flanges;
 * - the receiving column (J10.1-J10.4) under the two flange forces: where the unstiffened column does not carry them,
 *   column stiffeners (continuity plates) at both flange levels, sized with the column stiffener checks;
 * - fatigue, the crane reaction without impact on either girder end, scaled per duty bin: flange tips at the column
 *   welds (Category C, Miner sum) and the stiffener fillets (Category F, full range at all cycles);
 * - service: deflection of the outer bearing edge with the twist, against the bracket limit.
 * Plates grow in standard increments until every ratio is at most the target; the full analysis then checks every
 * concurrent case. Canonical units N, mm.
 */
import type {ProjectInput} from './types';
import type {BracketLoads} from './bracketDesign';
import {available} from './aiscStrength';
import {sectionProperties} from './section';
import {supportReactions} from './supportReactions';
import {minimumFillet} from './connectionStrength';
import {simpleSupportInput} from './simpleSupports';
import {seatOffset} from './bracketForces';
import {haunchGeometry,isTaperedHaunch,selectTaperedHaunch,haunchSlopeLimit,type TaperedHaunchInput} from './taperedHaunchInputs';
import {haunchStations,haunchActions,haunchWebShear,haunchStiffener,haunchStiffenerWeldStress,haunchWeldGroup,haunchWeldStress,haunchCjpRatios,topFlangeStrip,stationMoment,haunchTipStresses,haunchColumnForces,haunchColumnStrengths,haunchService,stiffenerLoadPoint,receiverModulus} from './taperedHaunch';
import {activeColumnStiffeners,initialColumnStiffeners,receiverK} from './columnStiffenerInputs';
import {columnStiffenerChecks,columnStiffenerGeometry,stiffenerGauge} from './columnStiffeners';

const inch=25.4,up=(v:number,step:number)=>Math.ceil(v/step-1e-9)*step;

/**
 * Sizing sets: factored strength with the side thrust and traction (AIST C1), and with the crane stop force (AIST 8 /
 * 9, the bumper factor 1.0 LRFD, 0.67 ASD); the crane reaction without impact on either side of the web (fatigue,
 * the warping stress reverses as the crane crosses the grid) and with impact (service).
 */
export function haunchSizingSet(p:ProjectInput){
 const r=supportReactions(p,sectionProperties(p.section)),lrfd=p.method==='LRFD',Lbr=p.details!.bearing.length,max=(f:(s:typeof r.supports[number])=>number)=>Math.max(...r.supports.map(f));
 const R=max(s=>(lrfd?1.2:1)*s.D+(lrfd?1.6:1)*(s.Cd+s.Cv+s.Ci)),H=(lrfd?1.6:1)*max(s=>s.Css),F=(lrfd?1.6:1)*r.Cls;
 const stop=Math.max(0,...p.cranes.map(c=>c.design&&!c.design.bumperBypassesGirder?c.design.bumperForce:0)),Rstop=max(s=>(lrfd?1.2:1)*(s.D+s.Cd)+s.Cv);
 const fatigue=max(s=>s.Cd+s.Cv),dead=max(s=>s.Cd),service=max(s=>s.Cd+s.Cv+s.Ci);
 // Each duty bin's reaction: the crane's own weight plus its lifted fraction of the live reaction.
 const bins=p.details!.spectrum.map(v=>({cycles:v.cycles,scale:fatigue>0?(dead+v.liftFraction*(fatigue-dead))/fatigue:0}));
 const gap=p.system==='simple'?simpleSupportInput(p).endGap:0,offset=seatOffset({end:'left',offset:gap/2+Lbr/2},Lbr),at=(V:number,x=offset):BracketLoads=>[{vertical:V,offset:x,length:.4*Lbr}];
 return {offset,strength:[{loads:at(R),H,F},{loads:at(Rstop),H:0,F:(lrfd?1:.67)*stop}],fatigue:[at(fatigue),at(fatigue,-offset)],bins,service:at(service)};
}
/**
 * Sizing ratios of the haunch under the sizing sets, with the column stiffener checks where stiffeners are provided;
 * the unstiffened column's J10.1-J10.4 ratios and its J10.6 panel are the non-enumerable `column`.
 */
export function haunchSizingRatios(p:ProjectInput,set=haunchSizingSet(p)){
 const d=p.details!,b=d.bracket!,c=b.receiver,g=haunchGeometry(b,d.bearing.width),E=p.section.E,Fy=d.material.Fy,m=p.method,W=d.bearing.width,e=b.reach+W/2;
 const stations=haunchStations(g,E,Fy,e,W,24),root=stations[0].s,sf=haunchStiffener(g,E,Fy,m),grp=haunchWeldGroup(g),phiW=available(.6*d.material.Fexx,m,.75,2),phiFy=available(Fy,m,.9,1.67);
 const ratios:Record<string,number>={},column:Record<string,number>={};const put=(k:string,v:number)=>{ratios[k]=Math.max(ratios[k]??0,v);},info=(k:string,v:number)=>{column[k]=Math.max(column[k]??0,v);};
 const J=haunchColumnStrengths(p,g),cs=activeColumnStiffeners(b),demand:Record<string,{value:number;caseId:string;x:number;P?:number;M?:number}>={};
 const csg=cs?columnStiffenerGeometry(p):undefined,gauge=csg?stiffenerGauge(csg):undefined;
 const peak=(k:string,v:number,sys?:{P:number;M:number})=>{if(!demand[k]||v>demand[k].value)demand[k]={value:v,caseId:'sizing',x:0,...sys};};
 for(const v of set.strength)for(const H of [v.H,-v.H]){
  const f=haunchActions(g,root,e,v.loads,{longitudinal:v.F,bottom:H,offset:set.offset});
  for(const st of stations){const M=stationMoment(f,st.s,g.a),fl=M>=0?st.pos:st.neg;put('flexure',Math.abs(M)/available(fl.Mn,m,.9,1.67));put('shear',Math.abs(f.V)/haunchWebShear(g,st.s,E,Fy,m).capacity);
   put('flangeWeb',Math.abs(f.V)*Math.max(st.s.Qt,st.s.Qb)/st.s.Ix/(2*g.flangeWebWeld/Math.SQRT2)/phiW);}
  put('topFlange',(Math.max(0,f.Tt)/(g.btr*g.tt)+Math.abs(f.Mtop)/(g.tt*g.btr**2/6))/phiFy);
  put('bottomFlange',(Math.max(0,f.C)/(g.bb*g.tb)+Math.abs(f.Mbot)/(g.tb*g.bb**2/6))/phiFy);
  put('strip',topFlangeStrip(g,v.loads,W,d.bearing.thickness,d.bearing.length).moment/available(Fy*g.tt**2/4,m,.9,1.67));
  for(const s of f.sides){const P=Math.abs(s.P);if(!P)continue;const x=stiffenerLoadPoint(g,s.x),Pr=P/sf.half,Mr=P*Math.abs(x-sf.xc)/available(Fy*sf.Z,m,.9,1.67);put('stiffener',Pr>=.2?Pr+8/9*Mr:Pr/2+Mr);put('stiffenerWeld',haunchStiffenerWeldStress(g,sf,P,x)/phiW);}
  put('webWeld',haunchWeldStress(g,grp,root,f).web/phiW);
  if(grp.cjp){const r=haunchCjpRatios(g,root,f,m,Fy);put('cjp',Math.max(r.top,r.bottom));}
  // The receiving column under the two flange forces, unstiffened, and the stiffener forces at both levels.
  // One force system per flange: the same equivalent concentrated force in every unstiffened J10 limit state at a
  // level; the stiffener pair (where provided) carries it with the lateral moment as a couple between the plates.
  const col=haunchColumnForces(g,f,gauge),fl=col.flanges;
  info('J10',Math.max(col.pull/Math.min(J.flange,J.yieldTop),col.push/Math.min(J.yieldBottom,J.crippling),J.sidesway?col.push/J.sidesway:0));
  for(const [k,v,sys] of [['upperT',col.stiffeners.upperT,fl.upper],['upperC',col.stiffeners.upperC,fl.upper],['lowerT',col.stiffeners.lowerT,fl.lower],['lowerC',col.stiffeners.lowerC,fl.lower]] as const)peak(k,v,sys);
 }
 // Fatigue: the crane reaction without impact on one girder end, then the other (the warping stress reverses), each
 // duty bin scaled by its lift; the Category C Miner sum as an equivalent stress ratio D^(1/3). Fillet throats
 // (Category F) take the full range at all cycles.
 const N=d.spectrum.reduce((n,v)=>n+v.cycles,0),Fw=categoryF(N),miner=(range:number)=>Math.cbrt(set.bins.reduce((sum,v)=>sum+v.cycles*(range*v.scale)**3,0)/(fatigueCoefficient**3*4.4));
 const [fa,fb]=set.fatigue.map(loads=>haunchActions(g,root,e,loads,{longitudinal:0,bottom:0,offset:0})),ta=haunchTipStresses(g,root,fa),tb=haunchTipStresses(g,root,fb);
 const tipRange=(i:number)=>Math.max(Math.abs(ta[i]),Math.abs(tb[i]),Math.abs(ta[i]-tb[i]));
 put('fatigueTop',miner(Math.max(tipRange(0),tipRange(1))));put('fatigueBottom',miner(Math.max(tipRange(2),tipRange(3))));
 for(const s of fa.sides)if(s.P)put('stiffenerFatigue',haunchStiffenerWeldStress(g,sf,Math.abs(s.P),stiffenerLoadPoint(g,s.x))/Fw);
 // Column stiffeners: their own checks (J10.8, J4, Appendix 3) under the sizing peaks and the per-bin ranges of the
 // force on one plate (either girder end loaded), without the geometric checks a selection sets once.
 if(cs){
  const [qa,qb]=[fa,fb].map(f=>haunchColumnForces(g,f,gauge).stiffeners.plates),range=(level:'upper'|'lower')=>Math.max(...[0,1].map(i=>Math.max(Math.abs(qa[level][i]),Math.abs(qb[level][i]),Math.abs(qa[level][i]-qb[level][i]))));
  const column=Math.abs(fa.V)*(e+c.depth/2)/receiverModulus(c);
  const checks=columnStiffenerChecks(p,{prefix:'haunch',refs:['haunch-basis'],demand:{upperT:demand.upperT,upperC:demand.upperC,lowerT:demand.lowerT,lowerC:demand.lowerC},
   couple:{gauge:gauge!,flange:Object.fromEntries((['upperT','upperC','lowerT','lowerC'] as const).filter(k=>demand[k]).map(k=>[k,{P:demand[k].P??0,M:demand[k].M??0}])),symbol:{upper:'T',lower:'C'}},
   fatigue:set.bins.map(v=>({cycles:v.cycles,upper:range('upper')*v.scale,lower:range('lower')*v.scale,column:column*v.scale})),columnStressNote:''});
  for(const v of checks)if(v.utilization!==undefined&&!/-(fit|length|weld-minimum|weld-length|fatigue-toe)$/.test(v.id))put(v.id.replace('haunch-colstiff-','colstiff-'),v.utilization);
 }
 // Service deflection with the twist.
 const fs=haunchActions(g,root,e,set.service,{longitudinal:0,bottom:0,offset:0});
 put('deflection',haunchService(g,E,e)(fs,set.service).deflection/b.deflectionLimit);
 // The existing column's J10.1 ratio rides along, not enumerable, so it never drives the plates.
 Object.defineProperty(ratios,'column',{value:column,enumerable:false});
 return ratios;
}
/**
 * The project with its tapered haunch sized for the reactions: the selection's starting plates, then 1/8 in steps on
 * the flanges (the top flange alone where its seat bending governs), 1/16 in on the web, stiffeners and fillets, and
 * 1 in on the root and tip depths where the deflection or the flanges (once 2 in thick) govern;
 * the tip follows the root at half its depth. Where the unstiffened receiving column does not carry the flange forces,
 * column stiffeners start from the stiffener module's sizes (initialColumnStiffeners) and grow: the plates 1/8 in (to
 * 1 in), the fillets 1/16 in (to 5/8 in, below the plate thickness), full depth where the web shear along the plates
 * governs; past those field-welded sizes inside the column, a deeper haunch (shop steel) lowers the flange forces. Stops when every ratio is at most `target`,
 * or after 160 steps.
 */
export function sizeTaperedHaunch(p:ProjectInput,target=.9):ProjectInput{
 const q=structuredClone(p),d=q.details!,b=d.bracket;
 if(!b?.enabled||!isTaperedHaunch(b))return q;
 if(!b.haunch)Object.assign(b,selectTaperedHaunch(d,b,q.system));
 // Deeper, never past the model's 45° bottom flange slope (the tip follows the root at half its depth): at the
 // limit the sizing stops and the checks report what remains.
 let atSlopeLimit=false;
 const h=b.haunch!,grow=(patch:Partial<TaperedHaunchInput>)=>Object.assign(h,patch),deeper=()=>{const rootDepth=h.rootDepth+inch,tipDepth=Math.max(h.tipDepth,up(rootDepth/2,inch));
  if(Math.atan((rootDepth-tipDepth)/b.seatProjection)*180/Math.PI>haunchSlopeLimit+1e-9){atSlopeLimit=true;return;}grow({rootDepth,tipDepth});};
 for(let i=0;i<160;i++){
  const r=haunchSizingRatios(q),[key,worst]=Object.entries(r).sort((x,y)=>y[1]-x[1])[0],column=(r as unknown as {column:Record<string,number>}).column;
  // Column stiffeners where the unstiffened column (J10.1-J10.4) does not take the flange forces.
  if(!activeColumnStiffeners(b)&&(column.J10??0)>target){
   b.columnStiffeners=initialColumnStiffeners(b.receiver,receiverK(b,q.existingColumn)?.k,Math.max(h.topThickness,h.bottomThickness));continue;
  }
  if(worst<=target||atSlopeLimit)break;
  const thick=Math.max(h.topThickness,h.bottomThickness)>=2*inch;
  if(key.startsWith('colstiff-')){
   const s=b.columnStiffeners!,thicker=()=>{if(s.thickness<inch-1e-6)s.thickness+=inch/8;else deeper();};
   const weld=(k:'flangeWeld'|'webWeld')=>{if(s[k]+inch/16<=Math.min(5/8*inch,s.thickness-inch/16)+1e-6){s[k]+=inch/16;return true;}return false;};
   if(key==='colstiff-web-shear'){if(s.length==='half')s.length='full';else deeper();}
   else if(key==='colstiff-flange-weld'||key==='colstiff-fatigue-plate'){if(!weld('flangeWeld'))thicker();}
   else if(key==='colstiff-web-weld'){if(!weld('webWeld'))thicker();}
   else if(key==='colstiff-fatigue-weld'){const a=weld('flangeWeld'),w=weld('webWeld');if(!a&&!w)thicker();}
   else thicker();
  }
  else if(key==='shear')grow({webThickness:h.webThickness+inch/16});
  else if(key==='strip')grow({topThickness:h.topThickness+inch/8});
  else if(key==='stiffener'||key==='stiffenerWeld'||key==='stiffenerFatigue'){h.stiffener.thickness+=h.stiffener.thickness<inch/2?inch/16:inch/8;if(key!=='stiffener')h.stiffener.weld+=inch/16;}
  else if(key==='flangeWeb')grow({flangeWebWeld:h.flangeWebWeld+inch/16});
  else if(key==='webWeld'){if(b.rootWeld+inch/16<=h.webThickness-inch/16)b.rootWeld+=inch/16;else grow({webThickness:h.webThickness+inch/16});}
  else if(key==='deflection'||thick)deeper();
  else if(key==='fatigueTop'||key==='topFlange')grow({topThickness:h.topThickness+inch/8});
  else if(key==='fatigueBottom'||key==='bottomFlange')grow({bottomThickness:h.bottomThickness+inch/8});
  else grow({topThickness:h.topThickness+inch/8,bottomThickness:h.bottomThickness+inch/8});
  // Keep the J10.8 stiffener thickness, the fillet minimums and the web slenderness with the plates.
  h.stiffener.thickness=Math.max(h.stiffener.thickness,up(h.topThickness/2,inch/8));
  h.stiffener.weld=Math.max(h.stiffener.weld,minimumFillet(Math.max(h.stiffener.thickness,h.webThickness,h.bottomThickness)));
  h.flangeWebWeld=Math.max(h.flangeWebWeld,minimumFillet(Math.max(h.webThickness,h.topThickness,h.bottomThickness)));
  b.rootWeld=Math.max(b.rootWeld,minimumFillet(Math.max(h.webThickness,b.receiver.flangeThickness)));
  const s=b.columnStiffeners;
  if(s?.enabled){s.flangeWeld=Math.max(s.flangeWeld,minimumFillet(Math.max(s.thickness,b.receiver.flangeThickness)));s.webWeld=Math.max(s.webWeld,minimumFillet(Math.max(s.thickness,b.receiver.webThickness)));}
 }
 return q;
}

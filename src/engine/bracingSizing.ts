/**
 * Template sizing of the crane-level rod X-bracing between new freestanding columns (newColumnBracing.ts) for the
 * project's forces, with the bracing's own checks (longitudinalBracingChecks, bracingSystemChecks), so every ratio is
 * the one the full calculation reports. Each member grows from the entered one in standard increments, the governing
 * ratio first, until every ratio is at most `target` or nothing helps it:
 * - rod: the next diameter, 1/4 in (to 2 in), for the diagonal tension and the thread fatigue range; the clevis pin stays at least the rod;
 * - clevis pin: 1/8 in larger for its double shear, and for the gusset's pin bearing once the gusset is at 1 1/4 in;
 * - gusset: 1/8 in thicker (to 1 1/4 in) for pin bearing, rupture, tear-out, yield, the offset gusset's strut lap
 *   eccentricity H e, the strut bolts' bearing and block shear, and the fillets' base metal;
 * - fillets of the gussets and tabs: from the AISC J2.4 minimum for the thinner part (gusset or web), 1/16 in larger only
 *   while the weld metal governs the line (a larger fillet does nothing for the gusset or web base metal, J4.2), up to the
 *   gusset thickness less 1/16 in (J2.2b) and 5/8 in, a practical multi-pass limit;
 * - column web stiffeners (design.stiffeners) where the force normal to the web governs at the gusset or a strut tab
 *   (brace-column-web, the web part of brace-strut-tab): a pair of plates welded to the gusset or tab, the web and both
 *   flanges (webStiffeners), from 1/2 in and the J10.8 width-thickness limit with the J2.4 minimum fillet, then the fillet
 *   1/16 in larger (to 5/8 in and the plate less 1/16 in) where a weld governs, else the plate 1/8 in thicker (to 1 in);
 * - strut: the next heavier W8 to W12 for compression with its own weight and tension, and for the slenderness the
 *   lightest heavier one with a larger r_y;
 * - strut bolts (pretensioned slip-critical): a third, fourth and fifth bolt in line for slip, shear and bearing, then
 *   the next diameter (7/8, 1 in);
 * - bracket seat collector fillet (the welded seat): 1/16 in larger, to 5/8 in;
 * - torsion brace (design.torsionBrace, a bracket seat on new columns): its plates 1/8 in thicker (to 1 1/4 in) for their
 *   flexure and fillet base metal, a further row of bolt pairs (to 5) then the plates thicker for the bolts, the fillets
 *   1/16 in larger (to 5/8 in and the plate less 1/16 in); the strut, for its moment in plan (brace-torsion-strut) and for
 *   the column's twist limits it holds (column-twist-rotation, column-twist), the lightest heavier W with a larger I_y.
 * The rod starts where the project has it: a configuration starts it at the 1 in minimum, so it is sized by demand.
 * The column (torsion with the offset rod, and the web only where its stiffeners cannot carry the force) is the column
 * choice's, left to the configurator.
 * Canonical units N, mm.
 */
import type {CheckResult,ProjectInput} from './types';
import {aiscWShapes} from '../data/aiscSections';
import {sectionProperties} from './section';
import {supportReactions,type SupportReactionSet} from './supportReactions';
import {existingColumnAnalysis,existingColumnSection,twistMovementLimit} from './existingColumn';
import {longitudinalBracingAnalysis,longitudinalBracingChecks} from './longitudinalBracing';
import {bracingDesign,bracingGeometry,bracingSystemAnalysis,bracingSystemChecks,connectionCapacities,designsBracing,torsionBraceActive,webStiffeners,webYieldLine} from './newColumnBracing';
import {twistMovement,twistRotationLimit} from './columnTwistLimit';
import {filletMinimum} from './connectionStrength';

const inch=25.4,eighth=inch/8,sixteenth=inch/16,next=(v:number,step:number)=>(Math.floor(v/step+1e-6)+1)*step;
const rods=[.75,1,1.25,1.5,1.75,2].map(v=>v*inch),boltSizes=[.75,.875,1].map(v=>v*inch);
/** Strut candidates: W8 to W12 up to 65 lb/ft, lightest first. */
const struts=aiscWShapes.filter(s=>/^W(8|10|12)X/.test(s.name)&&s.weight<=65&&s.bf>=5.25).sort((a,b)=>a.weight-b.weight);
const ry=(name:string)=>{const s=aiscWShapes.find(v=>v.name===name);return s?Math.sqrt(s.Iy/s.A):0;};

/** The bracing checks as the calculation forms them, and the column torsion ratios they include. */
export function bracingChecks(p:ProjectInput,reactions:SupportReactionSet=supportReactions(p,sectionProperties(p.section))):CheckResult[]{
 const column=existingColumnSection(p).section,lb=longitudinalBracingAnalysis(p,reactions,column),c=existingColumnAnalysis(p,reactions);
 return [...longitudinalBracingChecks(p,lb),...bracingSystemChecks(p,bracingSystemAnalysis(p,reactions,lb,column,c),column),...twistRatios(p,c)];
}
/**
 * With a torsion brace, the column's twist limits it holds (columnTwistLimit.ts), as sizing ratios: the factored twist
 * against the small-rotation limit and the service movement (without the bracing displacement in series, which the
 * calculation adds) against the runway-level limit; and a configurator target, not a code limit: the girder's movement
 * from the twist under the factored traction (twistMovement, what the tie takes) within 1/8 in, the AIST TR-13 alignment tolerance class, so the tie, the bearing slots
 * and the stop gaps that take it (tieMovements, simpleSupportChecks, railChecks) are not sized by it.
 */
function twistRatios(p:ProjectInput,c:ReturnType<typeof existingColumnAnalysis>):CheckResult[]{
 const t=c.torsion;if(!torsionBraceActive(p)||!t)return [];
 const row=(id:string,v:number):CheckResult=>({id,group:'Torsion brace',title:id,status:v<=1?'pass':'fail',equation:'',note:'',referenceIds:[],utilization:v});
 return [row('column-twist-rotation',Math.abs(t.twist)/twistRotationLimit),row('column-twist',Math.abs(t.service.slip)/twistMovementLimit(p,c)),row('torsion-brace-movement',twistMovement(c,p.method).factored/movementTarget)];
}
/**
 * Configurator target on the girder's twist movement at the seat under the factored traction with a torsion brace
 * (twistRatios): 1/8 in, tightened by the configurator (withTwistMovementTarget) where the tie cannot take the movement.
 */
let movementTarget=inch/8;
export const twistMovementTarget=()=>movementTarget;
export function withTwistMovementTarget<T>(v:number,f:()=>T):T{const was=movementTarget;movementTarget=v;try{return f();}finally{movementTarget=was;}}
/**
 * The strut of a torsion brace (design.torsionBrace) for the twist ratios (twistRatios), before the tie and the bearings
 * are laid out for the twist movement: the lightest strut from the entered one up whose I_y holds them within `target`,
 * else the stiffest tried. The bracing sizing (sizeBracing) may grow it further for its own checks.
 */
export function sizeTorsionStrut(p:ProjectInput,target=.9){
 const d=p.longitudinalBracing?.design;if(!d||!torsionBraceActive(p))return;
 const reactions=supportReactions(p,sectionProperties(p.section)),now=struts.find(v=>v.name===d.strut.shape);
 const worst=()=>Math.max(...twistRatios(p,existingColumnAnalysis(p,reactions)).map(v=>v.utilization!));
 if(worst()<=target)return;
 let best={name:d.strut.shape,Iy:now?.Iy??0};
 for(const s of struts.filter(v=>v.weight>(now?.weight??0)+1e-9&&v.Iy>(now?.Iy??0)+1e-9)){
  d.strut.shape=s.name;if(worst()<=target)return;if(s.Iy>best.Iy)best={name:s.name,Iy:s.Iy};
 }
 d.strut.shape=best.name;
}
/**
 * Torsion of a braced new column: the column check with the girder's longitudinal force at its bracket offset
 * (column-torsion) and with the offset rod's torque added (brace-rod-torsion), the larger ratio.
 */
export function columnTorsionRatio(p:ProjectInput,reactions:SupportReactionSet=supportReactions(p,sectionProperties(p.section))):number{
 if(!designsBracing(p))return 0;
 const column=existingColumnSection(p).section,lb=longitudinalBracingAnalysis(p,reactions,column),c=existingColumnAnalysis(p,reactions),t=c.torsion;
 const rod=bracingSystemAnalysis(p,reactions,lb,column,c).rodTorsion;
 return Math.max(t?Math.max(t.U,t.shear/t.shearCapacity):0,rod?.U??0);
}
export function bracingRatios(p:ProjectInput,reactions?:SupportReactionSet):Record<string,number>{
 const out:Record<string,number>={};
 for(const c of bracingChecks(p,reactions))if(c.utilization!==undefined)out[c.id]=Number.isNaN(c.utilization)?Infinity:c.utilization;
 return out;
}

export function sizeBracing(p:ProjectInput,target=.9):ProjectInput{
 const q=structuredClone(p);
 if(!designsBracing(q))return q;
 const b=q.longitudinalBracing!;b.design=structuredClone(b.design??bracingDesign(q));
 const d=b.design,reactions=supportReactions(q,sectionProperties(q.section));
 d.strut.bolts=d.strut.bolts??2;
 const gusset=()=>{const t=next(d.gusset.thickness,eighth);if(t>1.25*inch+1e-6)return false;d.gusset.thickness=t;minimumWelds();return true;};
 const pin=()=>{const v=next(d.pin.diameter,eighth);if(v>3*inch+1e-6)return false;d.pin.diameter=v;return true;};
 // The fillets: larger only while the weld metal limits the line; the gusset where its base metal does; never past
 // 5/8 in or the gusset less 1/16 in (the web's base metal is the column's).
 const column=()=>existingColumnSection(q).section;
 const weld=()=>{const c=connectionCapacities(q,{t:d.gusset.thickness},column());
  if(c.governs==='gusset')return gusset();if(c.governs==='web')return false;
  const w=next(d.weld,sixteenth);if(w>Math.min(5/8*inch,d.gusset.thickness-sixteenth)+1e-6)return gusset();d.weld=w;return true;};
 const minimumWelds=()=>{const c=column();d.weld=Math.max(d.weld,filletMinimum([d.gusset.thickness,c.tw]));
  const s=d.stiffeners;if(s)s.weld=Math.max(s.weld,filletMinimum([s.thickness,c.tf],[s.thickness,d.gusset.thickness]));};
 // The strut tab's ratio is its fillets' or the web's (or its stiffeners'), both linear in the strut force.
 const tabWebGoverns=()=>{const c=column(),g=bracingGeometry(q,c),cap=connectionCapacities(q,g,c),st=webStiffeners(q,c,g.t,1);
  return (st?1/st.capacity:1/webYieldLine(c,2*g.strut.half,q.method))>=1/(4*g.strut.half*cap.weld);};
 // The stiffener pair at the gussets and tabs: added at 1/2 in (and its J10.8 width-thickness limit), then the governing part.
 const stiffen=()=>{
  const c=column(),Fy=d.gusset.Fy,w=(c.bf-c.tw)/2,s=d.stiffeners;
  if(!s){d.stiffeners={thickness:Math.max(inch/2,Math.ceil(w/(.56*Math.sqrt(c.E/Fy))/eighth-1e-6)*eighth),weld:sixteenth*3,Fy,Fu:d.gusset.Fu};minimumWelds();return true;}
  const part=webStiffeners(q,c,d.gusset.thickness,1)!.governing;
  if(part==='gussetWeld'||part==='flangeWeld'){const v=next(s.weld,sixteenth);if(v<=Math.min(5/8*inch,s.thickness-sixteenth)+1e-6){s.weld=v;return true;}}
  if(part==='gussetMetal')return gusset();
  const t=next(s.thickness,eighth);if(t>inch+1e-6)return false;s.thickness=t;minimumWelds();return true;
 };
 const strut=(slender:boolean)=>{
  const now=struts.find(s=>s.name===d.strut.shape),w=now?.weight??0,r=ry(d.strut.shape);
  const s=struts.find(v=>v.weight>w+1e-9&&(!slender||Math.sqrt(v.Iy/v.A)>r+1e-6));if(!s)return false;d.strut.shape=s.name;return true;
 };
 const bolts=()=>{
  if(d.strut.bolts!<4){d.strut.bolts!++;return true;}
  const db=boltSizes.find(v=>v>d.strut.boltDiameter+1e-6);if(db){d.strut.boltDiameter=db;d.strut.bolts=Math.max(2,d.strut.bolts!-1);return true;}
  if(d.strut.bolts!<5){d.strut.bolts!++;return true;}return false;
 };
 // The torsion brace: the strut's weak-axis stiffness and strength (I_y), the plates, their bolt rows and fillets.
 const stiffStrut=()=>{const now=aiscWShapes.find(v=>v.name===d.strut.shape),s=struts.find(v=>v.weight>(now?.weight??0)+1e-9&&v.Iy>(now?.Iy??0)+1e-9);if(!s)return false;d.strut.shape=s.name;return true;};
 const torsionPlate=()=>{const tb=d.torsionBrace;if(!tb)return false;const t=next(tb.thickness,eighth);if(t>1.25*inch+1e-6)return false;tb.thickness=t;tb.weld=Math.max(tb.weld,filletMinimum([t,column().tf]));return true;};
 const torsionRows=()=>{const tb=d.torsionBrace;if(!tb||tb.rows>=5)return false;tb.rows++;return true;};
 const torsionWeld=()=>{const tb=d.torsionBrace;if(!tb)return false;const w=next(tb.weld,sixteenth);if(w>Math.min(5/8*inch,tb.thickness-sixteenth)+1e-6)return torsionPlate();tb.weld=w;return true;};
 const rod=()=>{const v=rods.find(x=>x>b.rod.diameter+1e-6);if(!v)return false;b.rod.diameter=v;d.pin.diameter=Math.max(d.pin.diameter,v);return true;};
 const grow=(key:string):boolean=>{
  switch(key){
   case 'brace-tension':case 'brace-rod-fatigue':return rod();
   case 'brace-pin':return pin();
   case 'brace-pin-bearing':return gusset()||pin();
   case 'brace-gusset-rupture':case 'brace-gusset-tearout':case 'brace-gusset-yield':case 'brace-offset-gusset':return gusset();
   case 'brace-gusset-weld':return weld();
   // The tab's welds, or the force normal to the web (its stiffeners).
   case 'brace-strut-tab':return tabWebGoverns()?stiffen():weld();
   case 'brace-column-web':return stiffen();
   case 'brace-strut':case 'brace-strut-tension':return strut(false);
   case 'brace-strut-slenderness':return strut(true);
   case 'brace-strut-slip':case 'brace-strut-bolts':return bolts();
   case 'brace-strut-bearing':case 'brace-strut-block':return bolts()||gusset();
   case 'brace-torsion-strut':case 'column-twist-rotation':case 'column-twist':case 'torsion-brace-movement':return stiffStrut();
   case 'brace-torsion-plate':return torsionPlate();
   case 'brace-torsion-bolts':return torsionRows()||torsionPlate();
   case 'brace-torsion-weld':return torsionWeld();
   case 'brace-seat-weld':{const br=q.details?.bracket;if(!br?.enabled||br.arrangement==='rolled-corbel'||br.arrangement==='tapered-haunch')return false;
    const w=next(d.seatWeld,sixteenth);if(w>.625*inch+1e-6)return false;d.seatWeld=w;return true;}
  }
  return false;
 };
 minimumWelds();
 const stuck=new Set<string>(['brace-rod-torsion','brace-rod-crossing','brace-separation','brace-seismic-drift','brace-drift','brace-collector-bearing']);
 for(let i=0;i<120;i++){
  const r=bracingRatios(q,reactions),open=Object.entries(r).filter(([k,v])=>!stuck.has(k)&&v>target).sort((x,y)=>y[1]-x[1]);
  if(!open.length)break;
  if(!grow(open[0][0]))stuck.add(open[0][0]);
 }
 return q;
}

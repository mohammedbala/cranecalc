/**
 * Template sizing of the crane-level rod X-bracing between new freestanding columns (newColumnBracing.ts) for the
 * project's forces, with the bracing's own checks (longitudinalBracingChecks, bracingSystemChecks), so every ratio is
 * the one the full calculation reports. Each member grows from the entered one in standard increments, the governing
 * ratio first, until every ratio is at most `target` or nothing helps it:
 * - rod: the next diameter, 1/4 in (to 2 in), for the diagonal tension and the thread fatigue range; the clevis pin stays at least the rod;
 * - clevis pin: 1/8 in larger for its double shear, and for the gusset's pin bearing once the gusset is at 1 1/4 in;
 * - gusset: 1/8 in thicker (to 1 1/4 in) for pin bearing, rupture, tear-out, yield, the offset gusset's strut lap
 *   eccentricity H e, the strut bolts' bearing and block shear, and the fillets' base metal;
 * - fillets of the gussets and tabs: 1/16 in larger, up to the gusset thickness less 1/16 in;
 * - strut: the next heavier W8 to W12 for compression with its own weight and tension, and for the slenderness the
 *   lightest heavier one with a larger r_y;
 * - strut bolts (pretensioned slip-critical): a third, fourth and fifth bolt in line for slip, shear and bearing, then
 *   the next diameter (7/8, 1 in);
 * - bracket seat collector fillet (the welded seat): 1/16 in larger, to 5/8 in.
 * The column (web yield line, torsion with the offset rod) is the column choice's, left to the configurator.
 * Canonical units N, mm.
 */
import type {CheckResult,ProjectInput} from './types';
import {aiscWShapes} from '../data/aiscSections';
import {sectionProperties} from './section';
import {supportReactions,type SupportReactionSet} from './supportReactions';
import {existingColumnAnalysis,existingColumnSection} from './existingColumn';
import {longitudinalBracingAnalysis,longitudinalBracingChecks} from './longitudinalBracing';
import {bracingDesign,bracingSystemAnalysis,bracingSystemChecks,designsBracing} from './newColumnBracing';

const inch=25.4,eighth=inch/8,sixteenth=inch/16,next=(v:number,step:number)=>(Math.floor(v/step+1e-6)+1)*step;
const rods=[.75,1,1.25,1.5,1.75,2].map(v=>v*inch),boltSizes=[.75,.875,1].map(v=>v*inch);
/** Strut candidates: W8 to W12 up to 65 lb/ft, lightest first. */
const struts=aiscWShapes.filter(s=>/^W(8|10|12)X/.test(s.name)&&s.weight<=65&&s.bf>=5.25).sort((a,b)=>a.weight-b.weight);
const ry=(name:string)=>{const s=aiscWShapes.find(v=>v.name===name);return s?Math.sqrt(s.Iy/s.A):0;};

/** The bracing checks as the calculation forms them, and the column torsion ratios they include. */
export function bracingChecks(p:ProjectInput,reactions:SupportReactionSet=supportReactions(p,sectionProperties(p.section))):CheckResult[]{
 const column=existingColumnSection(p).section,lb=longitudinalBracingAnalysis(p,reactions,column),c=existingColumnAnalysis(p,reactions);
 return [...longitudinalBracingChecks(p,lb),...bracingSystemChecks(p,bracingSystemAnalysis(p,reactions,lb,column,c),column)];
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
 const gusset=()=>{const t=next(d.gusset.thickness,eighth);if(t>1.25*inch+1e-6)return false;d.gusset.thickness=t;return true;};
 const pin=()=>{const v=next(d.pin.diameter,eighth);if(v>3*inch+1e-6)return false;d.pin.diameter=v;return true;};
 const weld=()=>{const w=next(d.weld,sixteenth);if(w>d.gusset.thickness-sixteenth+1e-6)return gusset();d.weld=w;return true;};
 const strut=(slender:boolean)=>{
  const now=struts.find(s=>s.name===d.strut.shape),w=now?.weight??0,r=ry(d.strut.shape);
  const s=struts.find(v=>v.weight>w+1e-9&&(!slender||Math.sqrt(v.Iy/v.A)>r+1e-6));if(!s)return false;d.strut.shape=s.name;return true;
 };
 const bolts=()=>{
  if(d.strut.bolts!<4){d.strut.bolts!++;return true;}
  const db=boltSizes.find(v=>v>d.strut.boltDiameter+1e-6);if(db){d.strut.boltDiameter=db;d.strut.bolts=Math.max(2,d.strut.bolts!-1);return true;}
  if(d.strut.bolts!<5){d.strut.bolts!++;return true;}return false;
 };
 const rod=()=>{const v=rods.find(x=>x>b.rod.diameter+1e-6);if(!v)return false;b.rod.diameter=v;d.pin.diameter=Math.max(d.pin.diameter,v);return true;};
 const grow=(key:string):boolean=>{
  switch(key){
   case 'brace-tension':case 'brace-rod-fatigue':return rod();
   case 'brace-pin':return pin();
   case 'brace-pin-bearing':return gusset()||pin();
   case 'brace-gusset-rupture':case 'brace-gusset-tearout':case 'brace-gusset-yield':case 'brace-offset-gusset':return gusset();
   case 'brace-gusset-weld':case 'brace-strut-tab':return weld();
   case 'brace-strut':case 'brace-strut-tension':return strut(false);
   case 'brace-strut-slenderness':return strut(true);
   case 'brace-strut-slip':case 'brace-strut-bolts':return bolts();
   case 'brace-strut-bearing':case 'brace-strut-block':return bolts()||gusset();
   case 'brace-seat-weld':{const br=q.details?.bracket;if(!br?.enabled||br.arrangement==='rolled-corbel'||br.arrangement==='tapered-haunch')return false;
    const w=next(d.seatWeld,sixteenth);if(w>.625*inch+1e-6)return false;d.seatWeld=w;return true;}
  }
  return false;
 };
 const stuck=new Set<string>(['brace-column-web','brace-rod-torsion','brace-rod-crossing','brace-separation','brace-seismic-drift','brace-drift','brace-collector-bearing']);
 for(let i=0;i<120;i++){
  const r=bracingRatios(q,reactions),open=Object.entries(r).filter(([k,v])=>!stuck.has(k)&&v>target).sort((x,y)=>y[1]-x[1]);
  if(!open.length)break;
  if(!grow(open[0][0]))stuck.add(open[0][0]);
 }
 return q;
}

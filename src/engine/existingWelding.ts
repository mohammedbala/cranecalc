import type {CheckResult,ProjectInput} from './types';
import type {ExistingWeldingInput} from './existingColumnInputs';
import {format} from './units';
import {rolledStub} from './rolledBracketInputs';
import {activeColumnStiffeners} from './columnStiffenerInputs';
import {haunchInput} from './taperedHaunchInputs';

/**
 * Welding new steel to an existing column: the base metal must be identified, its carbon equivalent known, the
 * preheat set for the thickest part at the weld, and the column relieved of crane load while it is welded.
 */
const refs=['existing-steel-welding','aisc-app5'];
const inch=25.4;
export const weldingBasisLabel:Record<ExistingWeldingInput['basis'],string>={'mill-certificates':'mill certificates','chemical-analysis':'chemical analysis of a sample','original-documents':'original construction documents','not-established':'not established'};

/** New plates welded to the existing column face, each with its thickness at the weld. */
export function weldedAttachments(p:ProjectInput):{name:string;t:number}[]{
 const d=p.details;if(!d)return [];
 const out:{name:string;t:number}[]=[];
 const b=d.bracket;
 if(b?.enabled&&!(b.arrangement??'twin-rib').startsWith('existing-')){
  if(b.arrangement==='rolled-corbel'){const st=rolledStub(b);if(st)out.push({name:`${st.name} bracket flange`,t:st.tf});}
  else if(b.arrangement==='tapered-haunch'){const h=haunchInput(b);out.push({name:'haunch top flange',t:h.topThickness},{name:'haunch bottom flange',t:h.bottomThickness},{name:'haunch web',t:h.webThickness});}
  else out.push({name:'bracket rib',t:b.ribThickness},{name:'bracket seat plate',t:b.seatThickness});
 }
 // Continuity plates are fillet welded to the existing column's flanges and web.
 const cs=activeColumnStiffeners(b);if(cs)out.push({name:'column stiffener',t:cs.thickness});
 // Every gusseted tie reaches the column through a gusset welded to its flange; the cap tieback angle is bolted to the
 // column (field-drilled holes) and welds only its column stiffener at the tie level, when one is provided.
 const capStiffener=d.brace.arrangement==='cap-angle'&&d.brace.capAngle?.stiffener?.enabled?d.brace.capAngle.stiffener:undefined;
 if(capStiffener)out.push({name:'column stiffener at the cap angle tie',t:capStiffener.thickness});
 if(d.brace.arrangement!=='cap-angle')out.push({name:'tie gusset',t:d.brace.gussetThickness});
 return out;
}
/** True where this calculation specifies welds to an existing (not new) column. */
export const weldsToExistingColumn=(p:ProjectInput)=>!!p.existingColumn?.enabled&&!p.existingColumn.isNew&&weldedAttachments(p).length>0;

/**
 * AWS D1.1 prequalified minimum preheat and interpass temperature, Category B (low-hydrogen SMAW, SAW, GMAW and
 * FCAW on ASTM A36, A572 Grade 50 and A992 steels), by the thickest part at the point of welding. In °C.
 */
export function categoryBPreheat(t:number,units:ProjectInput['units']='SI'){
 // The code tabulates °F and °C separately (150 °F beside 65 °C): use the table of the project's unit system.
 const i=t<=.75*inch+1e-9?0:t<=1.5*inch+1e-9?1:t<=2.5*inch+1e-9?2:3;
 return units==='US'?([32,50,150,225][i]-32)*5/9:[0,10,65,110][i];
}

/** The thickest part at the field welds to the existing column and the preheat it needs (°C). */
export function existingWeldingDemand(p:ProjectInput,columnFlange:number){
 const parts=weldedAttachments(p),thickest=parts.reduce((a,v)=>v.t>a.t?v:a,{name:'existing column flange',t:columnFlange});
 const t=Math.max(columnFlange,thickest.t);
 return {parts,thickest:t===columnFlange?{name:'existing column flange',t}:thickest,t,need:categoryBPreheat(t,p.units)};
}
/** Carbon equivalent of the existing steel: computed from the entered chemistry by the AWS D1.1 Annex B formula, else the entered value. */
export function carbonEquivalent(w?:ExistingWeldingInput){
 const c=w?.chemistry;
 if(c)return {value:c.C+(c.Mn+c.Si)/6+((c.Cr??0)+(c.Mo??0)+(c.V??0))/5+((c.Ni??0)+(c.Cu??0))/15,computed:true};
 return w?.carbonEquivalent!==undefined?{value:w.carbonEquivalent,computed:false}:undefined;
}
export function existingWeldingChecks(p:ProjectInput,columnFlange:number):CheckResult[]{
 if(!weldsToExistingColumn(p))return [];
 const w=p.existingColumn!.welding,u=p.units,{parts,thickest,t,need}=existingWeldingDemand(p,columnFlange),len=(v:number)=>format(v,'length',u,3),temp=(v:number)=>format(v,'temperature',u,0);
 const welded=parts.map(v=>`${v.name} ${len(v.t)}`).join(', ');
 const known=!!w&&w.basis!=='not-established'&&!!w.grade.trim()&&!!w.source.trim();
 const checks:CheckResult[]=[{id:'column-weld-base-metal',group:'Existing column',title:'Existing column · base metal identified for welding',status:known?'pass':'unverified',equation:'',referenceIds:refs,
  note:known?`${w!.grade} from ${weldingBasisLabel[w!.basis]}: ${w!.source}. New steel welded to the existing flange (${len(columnFlange)}): ${welded}. AISC 360-16 Appendix 5.2.3 requires the chemical composition of existing steel where welding is anticipated; AWS D1.1 Clause 11 governs welding to existing structures.`
   :`Identify the existing column steel (grade, and mill certificates or a chemical analysis of a sample) before welding to it: AISC 360-16 Appendix 5.2.3, AWS D1.1 Clause 11. New steel to be welded to the existing flange (${len(columnFlange)}): ${welded}.`}];
 // Carbon equivalent: information for the WPS (AWS D1.1 Annex B hydrogen-control preheat), not a code limit for
 // prequalified A572 Grade 50 / A992 steel. What is required: the base metal confirmed (AISC 360-16 Appendix 5.2.3), an
 // approved WPS and the preheat of AWS D1.1 Table 5.8 (the checks above and below).
 const ce=carbonEquivalent(w);
 checks.push({id:'column-weld-ce',group:'Existing column',title:'Existing column · carbon equivalent (information)',status:'pass',...(ce?{demand:ce.value,quantity:'ratio' as const}:{}),
  equation:'\\mathrm{CE}=\\mathrm{C}+\\frac{\\mathrm{Mn}+\\mathrm{Si}}{6}+\\frac{\\mathrm{Cr}+\\mathrm{Mo}+\\mathrm{V}}{5}+\\frac{\\mathrm{Ni}+\\mathrm{Cu}}{15}',referenceIds:['existing-steel-welding','aws-d11-cyclic','aisc-app5'],
  note:`${ce?`Carbon equivalent ${ce.value.toFixed(2)} ${ce.computed?'by the AWS D1.1 Annex B formula from the entered chemistry':'as entered (formula and chemistry not stated; the Annex B formula includes Si)'}, from ${weldingBasisLabel[w!.basis]}.`:'Carbon equivalent not entered.'} Information only: AWS D1.1 sets no carbon equivalent limit for prequalified A572 Grade 50 / A992 steel; it is used with the Annex B hydrogen-control method where the WPS needs it${ce&&ce.value>.45?' (above 0.45 that method can require more than the Table 5.8 preheat: set it in the WPS)':''}. Required: the base metal confirmed (AISC 360-16 Appendix 5.2.3), a WPS approved for that steel, and the preheat of AWS D1.1 Table 5.8.`});
 const specified=w?.preheat;
 checks.push({id:'column-weld-preheat',group:'Existing column',title:'Existing column · preheat for field welds',status:specified===undefined?'unverified':specified>=need-1e-6?'pass':'fail',demand:need,capacity:specified,quantity:'temperature',
  equation:'T\\ge T_{min}(t);\\quad t=\\max(t_{cf},\\,t_p)',referenceIds:refs,
  note:`${specified===undefined?'Preheat not entered;':`Preheat and interpass temperature ${temp(specified)} minimum${specified>need+1e-6?' (project requirement on the drawings), above':specified<need-1e-6?', below':', equal to'}`} the AWS D1.1:2020 Table 5.8 prequalified minimum of ${temp(need)} for the thickest part at the weld, ${len(t)} (${thickest.name}). Table 5.8 Category B: low-hydrogen processes; A36, A572 Grade 50, A992${need===0?'; at least 20 °C (70 °F) when the steel is below 0 °C (32 °F)':''}. Maintain it as the interpass temperature.`});
 checks.push({id:'column-weld-load',group:'Existing column',title:'Existing column · load while it is welded',status:w?.deadLoadOnly?'pass':'unverified',equation:'',referenceIds:refs,
  note:w?.deadLoadOnly?'The crane stays out of service and the column carries its dead load only while the field welds are made; welds are sequenced to limit heat input. AWS D1.1 Clause 11: the Engineer determines the load a member may carry while it is heated or welded.'
   :'State the load the existing column may carry while it is welded (AWS D1.1 Clause 11). The heated zone loses strength: weld with the crane out of service and the column under dead load only, or justify the load carried.'});
 return checks;
}

import {connectionCoordination} from './connectionCoordination';
import {presentCheck} from './checkPresentation';
import {connectionOptionChecks} from './connectionOptions';
import {capInputChecks} from './capChecks';
import { projectSchema, type CalculationSnapshot, type CheckResult, type ProjectInput } from './types';
import { matchesAiscSection } from '../data/aiscSections';
import { matchesCappedSection } from '../data/aiscChannels';
import { sectionProperties } from './section';
import { movingAnalysis } from './analysis';
import { referenceVersion } from './references';
import { aistChecks } from './aistChecks';
import { latexNumber,withinLimit } from './math';
import { validateRunwayDetails } from './detailValidation';
import { completeRunwayChecks } from './detailChecks';
import { compressionFlangeGap } from './detailAnalysis';
import { supportReactions } from './supportReactions';
import { runwayElevations } from './drawingData';
import { existingColumnAnalysis,existingColumnChecks,validateExistingColumn } from './existingColumn';
import { longitudinalBracingAnalysis,longitudinalBracingChecks,validateLongitudinalBracing } from './longitudinalBracing';
export function fingerprint(input:unknown):string {const text=JSON.stringify(input);let a=2166136261,b=0x9e3779b9;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),2246822519);}return `${(a>>>0).toString(16).padStart(8,'0')}${(b>>>0).toString(16).padStart(8,'0')}`;}
export function validateProject(input:unknown):string[]{
 const parsed=projectSchema.safeParse(input);if(!parsed.success)return parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`);
 const p=parsed.data,s=p.section,errors:string[]=[];const L=p.spans.reduce((a,b)=>a+b,0);
 if(s.d<=2*s.tf)errors.push('section.d: depth must exceed twice the flange thickness.');
 if(s.tw>=s.bf)errors.push('section.tw: web must be thinner than the flange width.');
 if(p.capDesign&&p.capDesign.Fu<p.capDesign.Fy)errors.push('capDesign.Fu: ultimate strength cannot be less than channel yield strength.');
 if(s.Fu<s.Fy)errors.push('section.Fu: ultimate strength cannot be less than yield strength.');
 if(s.E<10*s.Fy)errors.push('section.E: modulus is inconsistent with a steel material.');
 if(s.kind==='cap'&&(s.capWidth<s.bf+2*s.capTf||s.capDepth<=s.capTw||s.capDepth>=s.d))errors.push('section.cap: channel legs must clear the beam flanges and have valid depth.');
 if(s.kind==='rolled'&&(!s.propertySource.trim()||Math.min(s.Ix,s.Iy,s.A,s.Sx,s.Sy,s.Zx,s.Zy,s.J,s.Cw)<1))errors.push('section: rolled sections require supplied positive catalogue properties and their source.');
 if((s.catalogueId||s.capCatalogueId)&&!(s.kind==='cap'?matchesCappedSection(s):!s.capCatalogueId&&matchesAiscSection(s)))errors.push('section: selected AISC catalogue dimensions, properties and source must match the database.');
 if(s.kind==='rolled'&&!s.catalogueId){
  const rectangularArea=2*s.bf*s.tf+(s.d-2*s.tf)*s.tw;
  if(s.A<rectangularArea*0.98||s.A>rectangularArea*1.25)errors.push('section.A: catalogue area is inconsistent with supplied dimensions.');
  if(Math.abs(s.Sx-s.Ix/(s.d/2))/s.Sx>0.02||Math.abs(s.Sy-s.Iy/(s.bf/2))/s.Sy>0.02)errors.push('section: catalogue elastic moduli are inconsistent with inertia and dimensions.');
  if(s.Zx<s.Sx||s.Zx>1.6*s.Sx||s.Zy<s.Sy||s.Zy>1.6*s.Sy)errors.push('section: catalogue plastic moduli are inconsistent with a rolled I-section.');
 }
 if(s.density<7000||s.density>8500)errors.push(`section.density: expected a steel density between ${p.units==='US'?'437 and 531 lb/ft³':'7000 and 8500 kg/m³'}.`);
 if(p.unbracedLength>L)errors.push('unbracedLength: cannot exceed the runway length.');
 if(p.lateralBraceSpacing>L)errors.push('lateralBraceSpacing: cannot exceed the runway length.');
 if(p.lateralBraceSpacing<L/100)errors.push('lateralBraceSpacing: model supports at most 100 lateral brace intervals.');
 // Lb is the compression-flange brace spacing; bracing the other flange does not shorten it.
 const spacingValid=p.lateralBraceSpacing>=L/100&&p.lateralBraceSpacing<=L&&!(p.aist&&p.aist.bottomBraceSpacing>0&&p.aist.bottomBraceSpacing<L/100);
 if((p.scope==='design'||p.details)&&spacingValid){const gap=compressionFlangeGap(p);if(p.unbracedLength+1e-6<gap)errors.push(`unbracedLength: cannot be shorter than the ${p.system==='continuous'?'larger top- or bottom-flange':'top (compression) flange'} restraint spacing of the modeled supports and braces.`);}
 // One rail depth drives both the wheel bearing length and the rail-head force couple.
 if(p.scope==='design'&&p.aist&&p.aist.railDepth>0&&Math.abs(p.railHeight-p.aist.railDepth)>.5)errors.push('railHeight: rail height above the flange must equal the actual rail depth (aist.railDepth) used for wheel bearing.');
 if(p.details&&Math.abs(p.railEccentricity)+1e-9<p.details.criteria.alignmentTolerance)errors.push('railEccentricity: design rail eccentricity cannot be less than the rail setting allowance permitted on the drawings (details.criteria.alignmentTolerance).');
 if(p.aist){for(const key of ['bottomBraceSpacing','axialLength','torsionalLength'] as const)if(p.aist[key]>L)errors.push(`aist.${key}: cannot exceed the modeled runway length.`);if(p.aist.bottomBraceSpacing>0&&p.aist.bottomBraceSpacing<L/100)errors.push('aist.bottomBraceSpacing: model supports at most 100 brace intervals.');}
 if((p.aist?.netFlangeArea??0)>s.bf*s.tf*(1+1e-9))errors.push('aist.netFlangeArea: cannot exceed the gross area bf × tf of one flange.');
 if(p.fatigue.location>L)errors.push('fatigue.location: detail location must be on the runway.');
 p.cranes.forEach((c,i)=>{if(c.wheels[0].offset!==0)errors.push(`cranes.${i}.wheels: first wheel offset must be zero.`);for(let j=0;j<c.wheels.length;j++){const w=c.wheels[j];if(j&&w.offset<=c.wheels[j-1].offset)errors.push(`cranes.${i}.wheels.${j}: offsets must increase.`);const loaded=c.includesImpact?w.loaded/(1+c.impact):w.loaded;if(w.unloaded>loaded)errors.push(`cranes.${i}.wheels.${j}: unloaded load exceeds the loaded static load.`);}if(c.travelStart>=c.travelEnd||c.travelStart< -c.wheels.at(-1)!.offset||c.travelEnd>L)errors.push(`cranes.${i}.travel: origin range must intersect the runway and end no later than its length.`);if(!c.loadSource.trim())errors.push(`cranes.${i}.loadSource: identify the manufacturer load schedule.`);});
 return [...errors,...validateRunwayDetails(p),...validateExistingColumn(p),...validateLongitudinalBracing(p)];
}
export function calculate(input:ProjectInput):CalculationSnapshot {
 const p=structuredClone(input),errors=validateProject(p);const snapshot:CalculationSnapshot={revision:fingerprint(p),createdAt:new Date().toISOString(),input:p,errors,warnings:[],properties:null,analysis:null,checks:[],eligible:false,referenceVersion};
 if(errors.length)return snapshot;
 const props=sectionProperties(p.section);snapshot.properties=props;
 if(Object.values(props).some(v=>!Number.isFinite(v))||Math.min(props.A,props.Ix,props.Iy,props.Sx,props.Sy)<=0){snapshot.errors.push('Section properties are not finite and positive.');return snapshot;}
 try{
  let coarse=movingAnalysis(p,props,20),fine=movingAnalysis(p,props,40);
  const compare=(a:typeof fine,b:typeof fine)=>Math.max(...(['moment','shear','reaction','deflection','lateralMoment','lateralDeflection'] as const).map(k=>Math.abs(a.demand[k]-b.demand[k])/Math.max(b.demand[k],1)));
  let meshConvergence=compare(coarse,fine);
  if(meshConvergence>0.01){coarse=fine;fine=movingAnalysis(p,props,80);meshConvergence=compare(coarse,fine);}
  snapshot.analysis={...fine,meshConvergence};
 }catch(e){snapshot.errors.push(e instanceof Error?e.message:'Analysis failed.');return snapshot;}
 const a=snapshot.analysis,d=a.demand;
 const check=(id:string,group:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,caseId?:string,referenceIds=['mechanics']):CheckResult=>({id,group,title,demand,capacity,utilization:demand/capacity,quantity,equation,note,caseId,referenceIds,status:withinLimit(demand,capacity)?'pass':'fail',substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}} = ${(demand/capacity).toFixed(4)}`});
 // For varying spans use the strictest limit; this is explicitly conservative for the global envelope.
 const shortest=Math.min(...p.spans);
 snapshot.checks=[
 check('equilibrium','Analysis','Force equilibrium',a.equilibriumError,1e-7,'ratio','\\epsilon_R = \\frac{|\\sum R-\\sum P-wL|}{\\max(|\\sum P+wL|,1)}','Residual of every computed crane response and dead-load model.'),
 check('convergence','Analysis','Moving-load refinement',a.convergence,0.01,'ratio','\\epsilon = \\max\\left|\\frac{D_{fine}-D_{coarse}}{\\max(|D_{fine}|,1)}\\right|','Governing envelope demands must change by no more than 1% on travel-grid refinement. Sampled envelopes are not an exact analytical global optimization.'),
 check('mesh','Analysis','Spatial sampling refinement',a.meshConvergence,0.01,'ratio','\\epsilon_{mesh} = \\max\\left|\\frac{D_{2n}-D_n}{\\max(|D_{2n}|,1)}\\right|','Governing demands must change by no more than 1% when doubling spatial sampling. Point-load moments and nodal deflections use exact elastic element solutions.'),
 check('vertical','Serviceability','Vertical crane-load deflection',d.deflection,shortest/p.verticalLimit,'length','\\delta_{v,crane} \\le \\frac{L_{min}}{n_v}',`User criterion: ${p.criteriaSource}. Crane static wheel loads only; impact and dead load excluded. Shortest-span limit used conservatively.`,d.governing.deflection?.id,['mechanics','criteria']),
 check('lateral','Serviceability','Lateral bending deflection',d.lateralDeflection,shortest/p.lateralLimit,'length','\\delta_h \\le \\frac{L_{min}}{n_h}',`User criterion: ${p.criteriaSource}. Lateral braces modeled as rigid translational supports. This is flexural deflection of the section, not rail displacement including twist.`,d.governing.lateralDeflection?.id,['mechanics','criteria'])
 ];
 if(p.scope==='design'){
  snapshot.checks=snapshot.checks.filter(c=>c.group!=='Serviceability');
  try {
   snapshot.checks.push(...aistChecks(snapshot),...capInputChecks(p));
   // Unfactored reactions by load type for the building that carries the runway.
   snapshot.supportReactions=supportReactions(p,props);
   if(p.existingColumn?.enabled){snapshot.existingColumn=existingColumnAnalysis(p,snapshot.supportReactions);snapshot.checks.push(...existingColumnChecks(p,snapshot.existingColumn));}
   // Drawings print elevations from project data only.
   if(p.details&&!runwayElevations(p))snapshot.checks.push({id:'drawing-elevation',group:'Detailing',title:'Runway elevation for drawings',status:'incomplete',equation:'',note:'Enter the top-of-rail elevation above the datum under Project, or check the existing column with its surveyed seat elevation. Drawing elevations are never taken from the 3D reference model.',referenceIds:['criteria']});
   if(p.longitudinalBracing?.enabled){snapshot.longitudinalBracing=longitudinalBracingAnalysis(p,snapshot.supportReactions);snapshot.checks.push(...longitudinalBracingChecks(p,snapshot.longitudinalBracing));}
   if(p.details){
    const detailed=completeRunwayChecks(snapshot);
    if(snapshot.detailResults){
     const replaced=new Set(['torsion','brace','hold-down','connection-end','connection-stiffener','connection-restraint','weld-screen','bolt-spacing','support-yield','support-cripple','web-compression']);
     snapshot.checks=snapshot.checks.filter(c=>!replaced.has(c.id));
    }
    snapshot.checks.push(...detailed);
   }
  } catch(e) {snapshot.errors.push(e instanceof Error?e.message:'AIST design analysis failed.');}
  snapshot.warnings.push('Reference: AIST Technical Report 13, supplied source dated February 24, 2020. The 3D building is reference geometry. Enabled bracket geometry uses project inputs. Existing brackets require surveyed data and a recorded capacity assessment; whole-building adequacy is not established.');
  snapshot.warnings.push('Design combinations are runway-only projections. Roof, wind, seismic and other building actions require a separate design where applicable. The displayed supplied-load diagram envelopes remain separate from factored AIST design demands.');
 }else{
 snapshot.warnings.push('ANALYSIS REPORT ONLY: supplied-load bending and user serviceability criteria. This report does not establish AISC/DG7/TR-13/ASCE compliance or validate strength, fatigue, torsion, bracing or connections.');
 }
 if(d.uplift>1)snapshot.warnings.push('Uplift occurs in a governing position. The linear model assumes supports can resist uplift; hold-down design is required.');
 if(p.section.kind==='cap')snapshot.warnings.push(p.section.capCatalogueId?'Capped design uses catalogue transformed bending properties, conservative F5 resistance for both moment signs, E4/E7 compression, integrated open-section warping and J of the two separate components without overlap credit. Full bearing contact and continuous attachment are required; cap distortion from fit-up gaps is outside the model.':'Cap-channel properties use idealized rectangular plates and full composite action. Warping constant and attachment adequacy are not established.');
 if(p.reportPurpose==='demonstration')snapshot.warnings.push('DEMONSTRATION: geometry, supplier data and duty assumptions are fictitious. Calculations are executed normally; this report demonstrates software capabilities and is not a site-specific construction design.');
 else if(p.cranes.some(c=>/illustrative|example|fictitious|fictional|\bdemo\b/i.test(c.loadSource)))snapshot.warnings.push('Illustrative crane data are in use. Replace with the actual manufacturer schedule.');
 if(p.scope==='analysis')snapshot.warnings.push('Envelopes use each crane’s loaded wheel schedule. Unloaded schedules are retained but are not evaluated as separate operating or fatigue cases.');
 snapshot.warnings.push(...connectionCoordination(p));
 snapshot.warnings.push(snapshot.detailResults?'The detailed rail-head check includes lateral bending, Saint-Venant/warping torsion and girder-side tie flexibility. Supplied-load diagram envelopes remain a separate first-order display.':'Supplied-load diagram lateral results represent weak-axis section bending under supplied forces. Rail displacement from twist and top-flange force distribution is not established.');
 snapshot.warnings.push(snapshot.detailResults?'Vertical bending uses Euler-Bernoulli theory. Detailed lateral/torsion response includes geometric stiffness and girder-side connection flexibility; material nonlinearity, section distortion, shear deformation and building-interface flexibility are excluded.':'Euler-Bernoulli small-deflection analysis; shear deformation, nonlinear behavior and support flexibility are excluded.');
 const optionChecks=connectionOptionChecks(p);
 snapshot.checks.push(...optionChecks);
 if(optionChecks.length)snapshot.warnings.push('Selected bracket / tieback alternatives are arrangement previews. Connection resistance, stiffness, movement and fatigue need a project-specific model or supplier package. Existing detailed connection results are not reused; generation is blocked in either report scope.');
 const blocking=snapshot.checks.some(c=>['incomplete','unsupported','unverified'].includes(c.status));
 // Failed engineering criteria can export; failed numerical verification cannot.
 snapshot.eligible=!blocking&&!snapshot.errors.length&&snapshot.checks.filter(c=>c.group==='Analysis').every(c=>c.status==='pass');
 snapshot.checks=snapshot.checks.map(c=>presentCheck(c,p.units));
 return snapshot;
}

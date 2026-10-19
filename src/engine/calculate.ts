import {caseBase,caseIdPattern} from './caseNames';
import type {RunwayCaseRecord} from './runwayDetails';
import {withDesignCache,type DesignProgress} from './designAnalysis';
import {packageContentChecks} from './detailTemplate';
import {connectionCoordination,coordinationChecks} from './connectionCoordination';
import {constructionNoteChecks} from './constructionNotes';
import {presentCheck} from './checkPresentation';
import {connectionOptionChecks} from './connectionOptions';
import {capInputChecks} from './capChecks';
import { projectSchema, type CalculationSnapshot, type CheckResult, type ProjectInput } from './types';
import { matchesAiscSection } from '../data/aiscSections';
import { matchesCappedSection } from '../data/aiscChannels';
import { sectionProperties } from './section';
import { girderStrength } from './aiscStrength';
import { cappedElasticProperties } from './capChannel';
import { format } from './units';
import { movingAnalysis } from './analysis';
import { referenceVersion } from './references';
import { aistChecks } from './aistChecks';
import { latexNumber,withinLimit } from './math';
import { validateRunwayDetails } from './detailValidation';
import { completeRunwayChecks } from './detailChecks';
import { gateCheck } from './checkTaxonomy';
import { normalizeChecks } from './checkIntegrity';
import { compressionFlangeGap } from './detailAnalysis';
import { travelLimits } from './continuation';
import {craneTravel,stopContacts} from './craneTravel';
import { supportReactions } from './supportReactions';
import { runwayElevations } from './drawingData';
import { existingColumnAnalysis,existingColumnChecks,existingColumnSection,validateExistingColumn } from './existingColumn';
import { bracingSystemAnalysis,bracingSystemChecks,designsBracing } from './newColumnBracing';
import { columnBaseAnalysis,columnBaseChecks,validateColumnBase } from './columnBase';
import { longitudinalBracingAnalysis,longitudinalBracingChecks,validateLongitudinalBracing } from './longitudinalBracing';
import { existingLayoutChecks,validateAdjacentBuilding } from './existingLayout';
import { validateColumnCap } from './columnCap';
import { bumperSelectionChecks,craneInputChecks,craneInputWarnings } from './craneInput';
import { girderPieceChecks } from './girderPieces';
import { validateSplices } from './spliceInputs';
import { craneColumnCalculation,validateCraneColumn } from './craneColumn';
import { steppedColumnCalculation,validateSteppedColumn } from './steppedColumn';
import { activeStep } from './steppedColumnInputs';
import { fatigueCycleCheck } from './buildingClass';
import { fatigueCycleFamilies } from './railChecks';
import { tiedToBuilding } from './craneColumnInputs';
export function fingerprint(input:unknown):string {const text=JSON.stringify(input);let a=2166136261,b=0x9e3779b9;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),2246822519);}return `${(a>>>0).toString(16).padStart(8,'0')}${(b>>>0).toString(16).padStart(8,'0')}`;}
export function validateProject(input:unknown):string[]{
 const parsed=projectSchema.safeParse(input);if(!parsed.success)return parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`);
 const p=parsed.data,s=p.section,errors:string[]=[];const L=p.spans.reduce((a,b)=>a+b,0);
 // The configurator's stop: a member beyond the catalog, while the project still has the member it could not size.
 for(const v of p.configurator?.beyondCatalog??[])if(v.member==='girder'?s.name===v.shape:v.member==='tie'?(p.details?.brace.arrangement??'paired-bars')===v.shape:p.existingColumn?.shape===v.shape)errors.push(`configurator: ${v.reason}`);
 if(s.d<=2*s.tf)errors.push('section.d: depth must exceed twice the flange thickness.');
 if(s.tw>=s.bf)errors.push('section.tw: web must be thinner than the flange width.');
 if(p.capDesign&&p.capDesign.Fu<p.capDesign.Fy)errors.push('capDesign.Fu: ultimate strength cannot be less than channel yield strength.');
 if(s.Fu<s.Fy)errors.push('section.Fu: ultimate strength cannot be less than yield strength.');
 if(s.E<10*s.Fy)errors.push('section.E: modulus is inconsistent with a steel material.');
 if(s.kind==='cap'&&(s.capWidth<s.bf+2*s.capTf||s.capDepth<=s.capTw||s.capDepth>=s.d))errors.push('section.cap: channel legs must clear the beam flanges and have valid depth.');
 if(s.kind==='rolled'&&(!s.propertySource.trim()||Math.min(s.Ix,s.Iy,s.A,s.Sx,s.Sy,s.Zx,s.Zy,s.J,s.Cw)<1))errors.push('section: rolled sections require supplied positive catalog properties and their source.');
 if((s.catalogueId||s.capCatalogueId)&&!(s.kind==='cap'?matchesCappedSection(s):!s.capCatalogueId&&matchesAiscSection(s)))errors.push('section: selected AISC catalog dimensions, properties and source must match the database.');
 if(s.kind==='rolled'&&!s.catalogueId){
  const rectangularArea=2*s.bf*s.tf+(s.d-2*s.tf)*s.tw;
  if(s.A<rectangularArea*0.98||s.A>rectangularArea*1.25)errors.push('section.A: catalog area is inconsistent with supplied dimensions.');
  if(Math.abs(s.Sx-s.Ix/(s.d/2))/s.Sx>0.02||Math.abs(s.Sy-s.Iy/(s.bf/2))/s.Sy>0.02)errors.push('section: catalog elastic moduli are inconsistent with inertia and dimensions.');
  if(s.Zx<s.Sx||s.Zx>1.6*s.Sx||s.Zy<s.Sy||s.Zy>1.6*s.Sy)errors.push('section: catalog plastic moduli are inconsistent with a rolled I-section.');
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
 const travel=travelLimits(p);
 if(p.continuation&&(p.continuation.left>0||p.continuation.right>0)){
  if(p.system!=='simple')errors.push('continuation: model a continuous girder to its true runway ends; adjacent existing bays apply to simple spans only.');
  if(!p.continuation.source.trim())errors.push('continuation.source: identify the existing adjacent girders and how their spans were verified.');
 }
 p.cranes.forEach((c,i)=>{if(c.wheels[0].offset!==0)errors.push(`cranes.${i}.wheels: first wheel offset must be zero.`);for(let j=0;j<c.wheels.length;j++){const w=c.wheels[j];if(j&&w.offset<=c.wheels[j-1].offset)errors.push(`cranes.${i}.wheels.${j}: offsets must increase.`);const loaded=c.includesImpact?w.loaded/(1+c.impact):w.loaded;if(w.unloaded>loaded)errors.push(`cranes.${i}.wheels.${j}: unloaded load exceeds the loaded static load.`);}if(c.travelStart>=c.travelEnd||c.travelStart<travel.start-c.wheels.at(-1)!.offset||c.travelEnd>travel.end)errors.push(`cranes.${i}.travel: origin range must intersect the runway and end no later than ${travel.end>L?'the far end of the adjacent bay':'its length'}.`);if(!c.loadSource.trim())errors.push(`cranes.${i}.loadSource: identify the manufacturer load schedule.`);
  // At stop contact (bumper overhang less stroke from the stop face) the end wheel must still stand on the rail.
  for(const v of stopContacts(p,i))if(v.railEnd!==undefined&&(v.end==='left'?v.wheel<v.railEnd:v.wheel>v.railEnd))errors.push(`cranes.${i}.design.bumperOverhang: at the ${v.end} stop the bumper overhang less the stroke leaves the end wheel off the rail; check the end-truck geometry and the stop and rail-end layout.`);
  const reach=craneTravel(p,i);if(reach.start>=reach.end)errors.push(`cranes.${i}.design.bumperOverhang: the stop contacts leave the crane no travel between the stops.`);});
 return [...errors,...validateRunwayDetails(p),...validateExistingColumn(p),...validateColumnBase(p),...validateLongitudinalBracing(p),...validateAdjacentBuilding(p),...validateColumnCap(p),...validateSplices(p),...validateCraneColumn(p),...validateSteppedColumn(p)];
}
/**
 * After every module: each check tells the truth about its own status (checkIntegrity.ts: impossible geometry fails as a
 * geometry conflict without a ratio, a part with no capacity fails with an infinite ratio, the results of a ply its holes
 * lie outside of are not valid), then the taxonomy gates. A rule that does not apply to this arrangement is not a failure
 * (J2.2b maximum fillets in T-joints, J10.8 proportions of stiffeners that J10.1-J10.4 do not require, full-force
 * development of a full-length cap, the F13.1 hole test as a capacity modifier, an owner criterion not given, advisory
 * rules such as the E2 user note and the fatigue ratio that is not the project's method, fatigue at fewer than 20,000
 * cycles): not-applicable, with the reason. A failing check that its largest range would screen below F_TH contradicts
 * itself: it stays failed and a warning names it.
 */
export function integrityAndGates(snapshot:CalculationSnapshot){
 normalizeChecks(snapshot);
 if(snapshot.geometryConflicts?.length)snapshot.warnings.push(`GEOMETRY CONFLICT: ${snapshot.geometryConflicts.map(c=>c.title).join('; ')}. These parts cannot be built as dimensioned; the drawings mark them NOT DETAILED until the arrangement is revised.`);
 const contradictions:string[]=[];
 snapshot.checks=snapshot.checks.map(c=>{if(c.status!=='fail')return c;const g=gateCheck(snapshot,c);if(g.gate==='evaluated')return c;
  if(g.gate==='screened'&&g.screen==='threshold'){contradictions.push(`${c.title} (${c.id}): ${g.reason}`);return c;}
  return {...c,status:'not-applicable',note:`${g.reason??'Not applicable to this arrangement.'} ${c.note}`.trim()};});
 if(contradictions.length)snapshot.warnings.push(`FATIGUE: ${contradictions.length} failing check${contradictions.length>1?'s':''} would be screened below the threshold, which contradicts the check's own allowable; kept as failures: ${contradictions.join('; ')}`);
}
export interface CalculateOptions {
 /** Progress of the moving-load searches (DesignProgress), at most four times a second. */
 onProgress?:(progress:DesignProgress)=>void;
}
/** One calculation; its moving-load searches share their crane-position responses (withDesignCache) until it returns. */
export function calculate(input:ProjectInput,options:CalculateOptions={}):CalculationSnapshot {return withDesignCache(()=>calculateSnapshot(input),options.onProgress);}
function calculateSnapshot(input:ProjectInput):CalculationSnapshot {
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
 const shortest=Math.min(...p.spans),supports=p.spans.reduce((list,v)=>[...list,list.at(-1)!+v],[0]);
 // Each bay against its own span: the governing envelope point over its bay limit.
 const byBay=(value:(v:typeof a.envelope[number])=>number,n:number,overall:number)=>{
  let best={demand:overall,limit:shortest/n,bay:-1,ratio:-1};
  for(const v of a.envelope){const i=supports.findIndex(x=>x>v.x+1e-6),bay=i<0?p.spans.length-1:Math.max(0,i-1),d=value(v),ratio=d*n/p.spans[bay];if(ratio>best.ratio)best={demand:d,limit:p.spans[bay]/n,bay,ratio};}
  return best;
 };
 // Lateral deflection (AISC DG7): the lateral wheel loads act at the top flange and are resisted by the top flange
 // (with the cap channel) alone, not by the full section. The analysis model uses the full-section Iy; with rigid
 // lateral supports the displacements scale exactly with 1/EI, so they are converted by Iy / I_top.
 const capped=cappedElasticProperties(p.section),topI=capped?.topI??p.section.tf*p.section.bf**3/12,flangeScale=props.Iy/topI;
 const vb=byBay(v=>Math.max(Math.abs(v.deflectionMax),Math.abs(v.deflectionMin)),p.verticalLimit,d.deflection),lb=byBay(v=>flangeScale*Math.max(Math.abs(v.lateralDeflectionMax),Math.abs(v.lateralDeflectionMin)),p.lateralLimit,flangeScale*d.lateralDeflection);
 const bayNote=(g:{bay:number})=>g.bay<0?'Shortest-span limit used for every bay.':`Governing bay ${g.bay+1}; every bay is checked against its own span.`;
 snapshot.checks=[
 check('equilibrium','Analysis','Force equilibrium',a.equilibriumError,1e-7,'ratio','\\frac{|\\Sigma R-\\Sigma P-wL|}{\\Sigma P+wL}','Residual of every crane response and dead-load model.'),
 check('convergence','Analysis','Moving-load refinement',a.convergence,0.01,'ratio','\\max|D_{2n}/D_n-1|\\ \\ \\text{(crane positions)}','Governing envelope demands must change by no more than 1% on travel-grid refinement. Sampled envelopes are not an exact analytical global optimization.'),
 check('mesh','Analysis','Spatial sampling refinement',a.meshConvergence,0.01,'ratio','\\max|D_{2n}/D_n-1|\\ \\ \\text{(stations)}','Governing demands must change by no more than 1% when doubling spatial sampling. Point-load moments and nodal deflections use exact elastic element solutions.'),
 check('vertical','Serviceability','Vertical crane-load deflection',vb.demand,vb.limit,'length','\\Delta_v\\le L/n_v',`User criterion: ${p.criteriaSource}. Crane static wheel loads only; impact and dead load excluded. ${bayNote(vb)}`,d.governing.deflection?.id,['mechanics','criteria']),
 check('lateral','Serviceability','Lateral bending deflection',lb.demand,lb.limit,'length','\\Delta_h\\le L/n_h',`User criterion: ${p.criteriaSource}. ${bayNote(lb)} Top-flange bending (AISC DG7): the lateral wheel loads are resisted by the ${capped?'top flange and cap channel':'top flange'} alone, I = ${format(topI,'inertia',p.units,3)} (full-section Iy = ${format(props.Iy,'inertia',p.units,3)} would give ${format(lb.demand/flangeScale,'length',p.units,3)}). Lateral braces modeled as rigid translational supports. Rail displacement from girder twist is not included.`,d.governing.lateralDeflection?.id,['mechanics','dg7','criteria'])
 ];
 if(p.scope==='design'){
  snapshot.checks=snapshot.checks.filter(c=>c.group!=='Serviceability');
  try {
   snapshot.checks.push(...aistChecks(snapshot),...capInputChecks(p));
   // Statics and required data of the crane input: open items, never validation errors.
   const craneInput=craneInputChecks(p);snapshot.checks.push(...craneInput);snapshot.warnings.push(...craneInputWarnings(craneInput));
   // Unfactored reactions by load type for the building that carries the runway.
   snapshot.supportReactions=supportReactions(p,props);
   // Bracing between new columns is analyzed first: its forces load the braced columns and their bases.
   const column=p.existingColumn?.enabled?existingColumnSection(p).section:undefined;
   if(p.longitudinalBracing?.enabled)snapshot.longitudinalBracing=longitudinalBracingAnalysis(p,snapshot.supportReactions,column);
   // A stepped column is analyzed by its own model (steppedColumnCalculation below), not as a prismatic column.
   if(p.existingColumn?.enabled&&!activeStep(p)){snapshot.existingColumn=existingColumnAnalysis(p,snapshot.supportReactions);snapshot.checks.push(...existingColumnChecks(p,snapshot.existingColumn,{...(tiedToBuilding(p)?{label:'Crane column'}:{}),braceMove:snapshot.longitudinalBracing?.deflection.value??0}));}
   if(p.existingColumn?.enabled&&p.existingColumn.isNew&&p.columnBase?.enabled){snapshot.columnBase=columnBaseAnalysis(p,snapshot.supportReactions);snapshot.checks.push(...columnBaseChecks(p,snapshot.columnBase,snapshot.existingColumn));}
   // Stepped column (WP-2): sets snapshot.existingColumn (compatible summary) and snapshot.steppedColumn, and its checks.
   steppedColumnCalculation(snapshot);
   // Drawings print elevations from project data only.
   // A continuous girder longer than a practical piece: shipping and erection, or field splices (open until confirmed).
   snapshot.checks.push(...girderPieceChecks(p));
   if(p.details&&!runwayElevations(p))snapshot.checks.push({id:'drawing-elevation',group:'Detailing',title:'Runway elevation for drawings',status:'incomplete',equation:'',note:'Enter the top-of-rail elevation above the datum under Project, or check the existing column with its surveyed seat elevation. Drawing elevations are not taken from the 3D reference model.',referenceIds:['criteria']});
   if(snapshot.longitudinalBracing){
    snapshot.checks.push(...longitudinalBracingChecks(p,snapshot.longitudinalBracing));
    if(designsBracing(p)&&column){snapshot.bracingSystem=bracingSystemAnalysis(p,snapshot.supportReactions,snapshot.longitudinalBracing,column,snapshot.existingColumn,snapshot.columnBase);snapshot.checks.push(...bracingSystemChecks(p,snapshot.bracingSystem,column));}
   }
   // The surveyed existing building beside new columns: clear distances from the new steel and footings.
   if(snapshot.columnBase)snapshot.checks.push(...existingLayoutChecks(p,snapshot.bracingSystem?.separation));
   if(p.details){
    const detailed=completeRunwayChecks(snapshot);
    if(snapshot.detailResults){
     const replaced=new Set(['torsion','brace','hold-down','connection-end','connection-stiffener','connection-restraint','weld-screen','bolt-spacing','support-yield','support-cripple','web-compression',...(detailed.some(c=>c.id==='combined')?['combined','combined-bottom']:[])]);
     snapshot.checks=snapshot.checks.filter(c=>!replaced.has(c.id));
    }
    snapshot.checks.push(...detailed);
   }
   // Crane column tied to the building column (craneColumn.ts): the building column, the ties, the brace and the slot,
   // after the crane column, its base and the runway details (the girder restraint forces the ties deliver).
   craneColumnCalculation(snapshot);
   // Bumper selection against the stop design strength, after the end-stop checks.
   snapshot.checks.push(...bumperSelectionChecks(p,snapshot.checks));
  } catch(e) {snapshot.errors.push(e instanceof Error?e.message:'AIST design analysis failed.');}
  snapshot.warnings.push('Reference: AIST Technical Report 13 (2021). The 3D building is reference geometry. Enabled bracket geometry uses project inputs. Existing brackets require surveyed data and a capacity assessment; whole-building adequacy is not established.');
  snapshot.warnings.push('Design combinations are runway-only projections. Roof, wind, seismic and other building actions require a separate design where applicable. The displayed supplied-load diagram envelopes remain separate from factored AIST design demands.');
 }else{
 snapshot.warnings.push('ANALYSIS REPORT ONLY: supplied-load bending and user serviceability criteria. This report does not establish AISC/DG7/TR-13/ASCE compliance or validate strength, fatigue, torsion, bracing or connections.');
 }
 if(d.uplift>1)snapshot.warnings.push('Uplift occurs in a governing position. The linear model assumes supports can resist uplift; hold-down design is required.');
 if(p.section.kind==='cap')snapshot.warnings.push(p.section.capCatalogueId?`Capped design uses catalog transformed bending properties, ${(()=>{try{const d=girderStrength(p,props).capDirections??[],cl=[...new Set(d.map(v=>v.clause))];return cl.length===1?`${cl[0]} resistance for both moment signs`:cl.length?`${d.map(v=>v.clause).join(' / ')} resistance for positive / negative moment`:'F4 or F5 resistance by the web class';}catch{return 'F4 or F5 resistance by the web class';}})()}, E4/E7 compression, integrated open-section warping and J of the two separate components without overlap credit. Full bearing contact and continuous attachment are required; cap distortion from fit-up gaps is outside the model.`:'Cap-channel properties use idealized rectangular plates and full composite action. Warping constant and attachment adequacy are not established.');
 if(p.reportPurpose==='demonstration')snapshot.warnings.push('DEMONSTRATION: geometry, supplier data and duty assumptions are fictitious. Calculations are executed normally; this report demonstrates software capabilities and is not a site-specific construction design.');
 else if(p.cranes.some(c=>/illustrative|example|fictitious|fictional|\bdemo\b/i.test(c.loadSource)))snapshot.warnings.push('Illustrative crane data are in use. Replace with the actual manufacturer schedule.');
 if(p.scope==='analysis')snapshot.warnings.push('Envelopes use each crane’s loaded wheel schedule. Unloaded schedules are retained but are not evaluated as separate operating or fatigue cases.');
 snapshot.warnings.push(...connectionCoordination(p));
 snapshot.warnings.push(snapshot.detailResults?'The detailed rail-head check includes lateral bending, Saint-Venant/warping torsion and girder-side tie flexibility. Supplied-load diagram envelopes remain a separate first-order display.':'Supplied-load diagram lateral results represent weak-axis section bending under supplied forces. Rail displacement from twist and top-flange force distribution is not established.');
 snapshot.warnings.push(snapshot.detailResults?'Vertical bending uses Euler-Bernoulli theory. Detailed lateral/torsion response includes geometric stiffness and girder-side connection flexibility; material nonlinearity, section distortion, shear deformation and building-interface flexibility are excluded.':'Euler-Bernoulli small-deflection analysis; shear deformation, nonlinear behavior and support flexibility are excluded.');
 snapshot.checks.push(...packageContentChecks(p));
 // Clashes and layout conflicts: open items (status 'fail') until the arrangement is revised.
 snapshot.checks.push(...coordinationChecks(p),...constructionNoteChecks(snapshot));
 const optionChecks=connectionOptionChecks(p);
 snapshot.checks.push(...optionChecks);
 if(optionChecks.length)snapshot.warnings.push('Selected bracket / tieback alternatives are arrangement previews. Connection resistance, stiffness, movement and fatigue need a project-specific model or supplier package. Existing detailed connection results are not reused; generation is blocked in either report scope.');
 // Project option: a check left unverified only for missing data is omitted from this package (listed as not checked,
 // by others) instead of blocking it. Incomplete or unsupported results still block.
 if(p.omitUnverified)snapshot.checks=snapshot.checks.map(c=>c.status==='unverified'?{...c,status:'excluded',note:`Not checked here: ${c.note.trim()} Omitted from this package until these data are provided (by others).`}:c);
 // A by-others or deferred-submittal check whose reference estimate exceeds its limit is never left excluded: it is an open
 // item (unverified, adequacy not established) until the responsible party demonstrates it, so the package cannot read as
 // passing while this calculation's own estimate says the item does not (reopenedByOthers).
 snapshot.checks=snapshot.checks.map(reopenedByOthers);
 // The one-count check names the cycles of every wheel-local detail family, derived from the one count (fatigueCycleFamilies).
 if(p.details)snapshot.checks=snapshot.checks.map(c=>c.id==='fatigue-cycles'?fatigueCycleCheck(p,fatigueCycleFamilies(p)):c);
 integrityAndGates(snapshot);
 const blocking=snapshot.checks.some(c=>['incomplete','unsupported','unverified'].includes(c.status));
 // Failed engineering criteria can export; failed numerical verification cannot.
 snapshot.eligible=!blocking&&!snapshot.errors.length&&snapshot.checks.filter(c=>c.group==='Analysis').every(c=>c.status==='pass');
 snapshot.checks=snapshot.checks.map(c=>presentCheck(c,p.units));
 // The analysis cases a printed result names, with their combination and crane positions: the report prints these
 // names, not the case ids (the CSV keeps the ids).
 const registry=(snapshot.detailResults as {caseRegistry?:{get(id:string):RunwayCaseRecord|undefined}}|undefined)?.caseRegistry;
 if(snapshot.detailResults&&registry){
  const index:Record<string,RunwayCaseRecord>={},text=JSON.stringify([snapshot.checks,snapshot.detailResults,snapshot.designAnalysis?.governing]);
  for(const m of text.matchAll(caseIdPattern)){const base=caseBase(m[0]),r=registry.get(base);if(r)index[base]=r;}
  snapshot.detailResults.caseIndex=index;
 }
 return snapshot;
}

/**
 * An excluded (by others, deferred submittal) check whose reference D/C exceeds 1.00, reopened as 'unverified' with the
 * flag byOthers: listed with the open items and on the drawings, never read as passing. Its demand and capacity stay for
 * the reader; the note says what the responsible party must demonstrate.
 */
export function reopenedByOthers(c:CheckResult):CheckResult{
 const u=c.utilization;
 if(c.status!=='excluded'||u===undefined||!Number.isFinite(u)||u<=1+1e-9)return c;
 return {...c,status:'unverified',byOthers:true,note:`APP ESTIMATE EXCEEDS THE LIMIT (D/C ${u.toFixed(2)}): this item is by others, and this calculation's reference estimate for it does not pass. The responsible party (supplier or engineer of record) shall demonstrate it before fabrication, or the detail shall be changed (heavier parts, another joint type or a reduced stress range); until then it is an open item. ${c.note}`};
}

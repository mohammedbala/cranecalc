import {adjacentBays} from '../engine/continuation';
import type {CalculationSnapshot} from '../engine/types';
import {format} from '../engine/units';
import {craneDesignMinimum} from '../engine/aistLoads';
import {runwayElevations,issueStatus} from '../engine/drawingData';
import {activeEndStop,stopLocation} from '../engine/endStopInputs';
import {activeEndBearing} from '../engine/endBearingInputs';
import {usesExistingBracket} from '../engine/existingBracket';
import {drawingLength} from './drawingFormat';
import {line,sheetStart,titleBlock} from './sheetGraphics';
import {heading,paragraph,numbered,table,capsFor,type Block,type Style} from './noteBlocks';
import {structuralGeneralNotes} from './structuralNotes';
import {tieRelease} from '../engine/tieGeometry';

export interface SheetEntry {number:string;title:string;}
// Content coordinates inside the ARCH D drawing region (scaled by sheetFormat.contentScale).
// The third column stops above the seal and issue labels at the lower right.
const columns=[24,436,848],columnWidth=388,top=26,limits=[748,748,654];
/** Greedy column flow; a heading stays with the block after it. Returns undefined when the blocks do not fit. */
function flow(blocks:Block[],limit:number,overflow=false){
 const placed:{x:number;y:number;b:Block}[]=[];let column=0,y=top;
 for(let i=0;i<blocks.length;i++){
  const b=blocks[i],need=b.height+(b.keep&&blocks[i+1]?blocks[i+1].height:0),bottom=Math.min(limit,limits[column]);
  if(y>top&&y+need>bottom&&column<columns.length-1){column++;y=top;}
  else if(y>top&&y+need>bottom&&!overflow)return undefined;
  if(y+b.height>Math.min(limit,limits[column])&&!overflow)return undefined;
  placed.push({x:columns[column],y,b});y+=b.height+2.4;
 }
 return placed;
}

export function coverSheetSvg(s:CalculationSnapshot,sheets:SheetEntry[]){
 const p=s.input,u=p.units,d=p.details,f=(v:number|undefined,q:Parameters<typeof format>[1]='force')=>format(v,q,u,3),len=(mm:number)=>drawingLength(mm,u);
 const ksi=(v:number)=>format(v,'stress',u,3),status=issueStatus(s),elevations=runwayElevations(p);
 const capacity=(N:number)=>u==='US'?`${+(N/8896.443).toFixed(2)} ton (${f(N)})`:`${+(N/9806.65).toFixed(2)} t (${f(N)})`;
 const length=p.spans.reduce((a,b)=>a+b,0),cranes=p.cranes.map(c=>c.design?`${capacity(c.design.ratedLoad)} ${c.design.type} crane`:c.name).join(' and ');
 const supports=d?.bracket?.enabled?(usesExistingBracket(p)?'existing column brackets with new bolted seats':'new brackets welded to the existing building columns'):p.aist?.supportType==='column'?'independent runway columns':'the building columns';
 const scope=`Furnish and install one crane runway line, ${len(length)} long in ${p.spans.length} ${p.system==='continuous'?'continuous':'simple'} span${p.spans.length>1?'s':''}, for ${cranes}: ${p.section.name}${p.section.kind==='cap'?' capped':''} runway girders, rail, rail attachments, end stops and connections, supported on ${supports}.${p.existingColumn?.enabled?' The existing column receiving the runway is checked for the added crane reactions.':''}${p.longitudinalBracing?.enabled?' The existing crane-level longitudinal bracing is checked for crane traction and stop forces.':''} The opposite runway is identical unless noted.`;
 const build=(t:Style)=>{
 const H=(v:string)=>heading(t,v),N=(v:string[])=>numbered(t,v),P=(v:string)=>paragraph(t,v),T=(h:string[],r:string[][],w:number[])=>table(t,h,r,w);
 const blocks:Block[]=[];
 blocks.push(H('SCOPE OF WORK'),P(scope));
 blocks.push(H('GENERAL NOTES'),...N([
  ...structuralGeneralNotes(s),
  'THESE DRAWINGS AND THE CALCULATION REPORT OF THE SAME REVISION FORM ONE PACKAGE. WHERE THEY DIFFER, THE MORE STRINGENT REQUIREMENT GOVERNS UNTIL CLARIFIED BY THE ENGINEER OF RECORD.',
  'ALL WORK SHALL CONFORM TO THE BUILDING CODE ADOPTED BY THE AUTHORITY HAVING JURISDICTION AND THE STANDARDS LISTED UNDER DESIGN CRITERIA.'
 ]));
 const existing=p.existingColumn?.enabled||p.longitudinalBracing?.enabled||d?.bracket?.enabled||p.aist?.supportType==='bracket';
 if(existing)blocks.push(H('EXISTING BUILDING NOTES'),...N([
  'EXISTING CONSTRUCTION IS SHOWN DASHED AND IS BASED ON THE SURVEY AND SOURCES LISTED BELOW. FIELD VERIFY MEMBER SIZES, CONDITION, PLUMBNESS AND ELEVATIONS BEFORE FABRICATION AND REPORT DIFFERENCES TO THE ENGINEER OF RECORD.',
  'DO NOT CUT, DRILL OR WELD EXISTING STEEL UNTIL ITS MATERIAL AND WELDABILITY ARE CONFIRMED (MILL DATA OR CHEMICAL ANALYSIS AND CARBON EQUIVALENT PER AWS D1.1). REMOVE COATINGS AND PREHEAT AS REQUIRED BY THE APPROVED WPS.',
  'SHORE OR UNLOAD EXISTING MEMBERS AS REQUIRED BY THE ERECTION PROCEDURE. DO NOT REMOVE EXISTING BRACING WITHOUT A TEMPORARY REPLACEMENT APPROVED BY THE ENGINEER.',
  ...(p.existingColumn?.enabled?[`EXISTING COLUMN: ${p.existingColumn.source||'SOURCE NOT ENTERED'}.`]:[]),
  ...(p.longitudinalBracing?.enabled?[`EXISTING LONGITUDINAL BRACING: ${p.longitudinalBracing.source||'SOURCE NOT ENTERED'}.`]:[]),
  ...(usesExistingBracket(p)?['EXISTING BRACKETS ARE REUSED ONLY WITH THE DOCUMENTED ASSESSMENT IN THE CALCULATION REPORT.']:[]),
  'ITEMS MARKED BY OTHERS IN THE CALCULATION REPORT (FRAME, CONNECTIONS TO EXISTING MEMBERS, ANCHORS AND FOUNDATIONS NOT CHECKED HERE) SHALL BE VERIFIED BY THE ENGINEER OF RECORD FOR THE REPORTED FORCES.'
 ].map(v=>v.toUpperCase())));
 if(d)blocks.push(H('CRANE RUNWAY INSTALLATION'),...N([
  `RAIL: ${d.rail.name}. SET RAIL WITHIN ${len(d.criteria.alignmentTolerance)} OF THE THEORETICAL LINE AND ${len(d.criteria.levelTolerance)} OF THE THEORETICAL ELEVATION; DESIGN RAIL-TO-WEB ECCENTRICITY ${len(Math.abs(p.railEccentricity))}.`,
  `RAIL GAUGE (CRANE SPAN) ${len(d.criteria.railGauge)}. VERIFY WITH THE CRANE MANUFACTURER BEFORE SETTING RAILS.`,
  d.fabrication.railAlignment,
  'SURVEY RAIL ALIGNMENT, GAUGE AND ELEVATION AFTER ERECTION AND BEFORE THE LOAD TEST; SUBMIT THE SURVEY.',
  ...(activeEndStop(p)?[`INSTALL THE RUNWAY END STOPS (S-07) AT ${stopLocation(p).toUpperCase()} BEFORE THE CRANE IS OPERATED OR LOAD TESTED.`]:[]),
  'LOAD TEST THE CRANE PER ASME B30.2 AND THE MANUFACTURER. THE TEST LOAD SHALL NOT EXCEED 125% OF THE RATED LOAD; COORDINATE ANY TEST LOAD ABOVE THE RATED LOAD WITH THE ENGINEER OF RECORD BEFORE TESTING.'
 ].map(v=>v.toUpperCase())));
 // Column 2: criteria.
 blocks.push(H('DESIGN CRITERIA · CODES AND STANDARDS'),T(['STANDARD','EDITION / SCOPE'],[
  ['BUILDING CODE','AS ADOPTED BY THE AUTHORITY HAVING JURISDICTION'],
  ['ASCE/SEI 7','2016 (§4.9 UNCHANGED IN 7-22): CRANE LOADS, COMBINATIONS'],
  ['AISC 360','2016: STEEL DESIGN, '+p.method],
  ['AIST TECH. REPORT 13','SUPPLIED 2020 REFERENCE: RUNWAY LOADS AND CRITERIA'],
  ['AISC DESIGN GUIDE 7','3RD ED. (2019) WITH 2023 ERRATA'],
  ['AWS D1.1','STRUCTURAL WELDING CODE - STEEL (CYCLICALLY LOADED)'],
  ['RCSC','2020 SPECIFICATION FOR STRUCTURAL JOINTS'],
  ['ASME B30.2','CRANE INSPECTION, TESTING AND OPERATION']
 ],[1.2,2.8]));
 for(const c of p.cranes){
  const m=craneDesignMinimum(c),dd=c.design,max=Math.max(...c.wheels.map(w=>w.loaded/(c.includesImpact?1+c.impact:1)));
  blocks.push(H(`CRANE DATA · ${c.name.toUpperCase()}`),T(['ITEM','VALUE'],[
   ['RATED CAPACITY',dd?capacity(dd.ratedLoad):'NOT ENTERED'],
   ['TYPE / CONTROL',dd?`${dd.type.toUpperCase()} / ${dd.control.toUpperCase()}`:'NOT ENTERED'],
   ['SERVICE',c.operatingClass.toUpperCase()],
   ['WHEELS ON RUNWAY',`${c.wheels.length} AT ${c.wheels.slice(1).map((w,i)=>len(w.offset-c.wheels[i].offset)).join(', ')}`],
   ['MAX STATIC WHEEL LOAD',f(max)],
   ['VERTICAL IMPACT (ADOPTED)',`${+(Math.max(c.impact,m.impact)*100).toFixed(1)}% (AIST / ASCE 7 MIN. ${+(m.impact*100).toFixed(1)}%)`],
   ['SIDE THRUST, THIS RUNWAY',f(Math.max(c.wheels.reduce((a,w)=>a+w.lateral,0),m.runwaySide))],
   ['LONGITUDINAL TRACTION',f(Math.max(c.longitudinal,m.traction))],
   ['BUMPER (STOP) FORCE',dd?.bumperForce?`${f(dd.bumperForce)}${dd.bumperBypassesGirder?' TO BUILDING-MOUNTED STOP':''}`:'NOT ENTERED'],
   ['LOAD SOURCE',c.loadSource.toUpperCase()]
  ],[1.4,2.6]));
 }
 const a=p.aist,vertical=s.checks.find(c=>c.id==='vertical'),lateral=s.checks.find(c=>c.id==='lateral'),shortest=Math.min(...p.spans);
 const ratio=(c:typeof vertical)=>c?.capacity?`L/${Math.round(shortest/c.capacity)}`:'-';
 blocks.push(H('DESIGN CRITERIA · RUNWAY'),T(['ITEM','VALUE'],[
  ['RUNWAY GIRDER',`${p.section.name}${p.section.kind==='cap'?' (CAPPED)':''}, Fy = ${ksi(p.section.Fy)}`],
  ['SPANS',`${p.spans.map(len).join(' + ')} ${p.system==='continuous'?'CONTINUOUS':'SIMPLE SPANS'}`],
  ['DESIGN METHOD',`${p.method}; RUNWAY: AIST TR-13 §3.10; BUILDING CHECKS: ASCE 7 §2.3/§2.4`],
  ['BUILDING CLASS / CYCLES',a?`AIST CLASS ${a.buildingClass}, ${a.buildingCycles.toLocaleString()} REPETITIONS`:'-'],
  ['VERTICAL / LATERAL DEFLECTION',`${ratio(vertical)} / ${ratio(lateral)} (ONE CRANE, NO IMPACT)`],
  ['FATIGUE',d?`${d.spectrum.reduce((sum,b)=>sum+b.cycles,0).toLocaleString()} CYCLES IN ${d.spectrum.length} DUTY BINS`:`${p.fatigue.cycles.toLocaleString()} CYCLES, CATEGORY ${p.fatigue.category}`],
  ['ELEVATIONS',elevations?`T.O.R. ${len(elevations.tor)}, T.O.S. ${len(elevations.tos)} (DATUM ${len(elevations.datum)})`:'NOT ENTERED']
 ],[1.4,2.6]));
 const r=s.supportReactions;
 if(r)blocks.push(H('SUPPORT REACTIONS · UNFACTORED, PER SUPPORT'),T(['STATION','D','Cd','Cv','Ci','Css'],r.supports.map(v=>[len(v.x),f(v.D),f(v.Cd),f(v.Cv),f(v.Ci),f(v.Css)]),[1.25,1,1,1,1,1]),P(`Cd CRANE EMPTY, Cv LIFTED, Ci IMPACT, Css SIDE THRUST AT RAIL HEAD (ONE CRANE). RUNWAY LONGITUDINAL FORCE Cls = ${f(r.Cls)}. ALL CRANE COMPONENTS ARE LIVE LOAD L (ASCE 7 §4.9).${adjacentBays(p).map(b=>` AT ${len(b.station)} THE REACTIONS INCLUDE THE EXISTING ADJACENT ${len(b.length)} BAY (SAME GIRDER, RAIL AND DEAD LOAD ASSUMED).`).join('')} FACTORED INTERFACE FORCES: SEE CALCULATION REPORT.`));
 // Column 3: index, materials, inspection.
 blocks.push(H('SHEET INDEX'),T(['SHEET','TITLE'],sheets.map(v=>[v.number,v.title]),[.7,3.3]));
 const bolt=d?.end.grade==='A490'?'ASTM F3125 GRADE A490 (GROUP 150)':'ASTM F3125 GRADE A325 (GROUP 120)';
 blocks.push(H('MATERIALS'),T(['ITEM','SPECIFICATION'],[
  ['RUNWAY GIRDER',p.section.kind==='welded'?`PLATE, Fy = ${ksi(p.section.Fy)}`:`ASTM A992, Fy = ${ksi(p.section.Fy)}`],
  ...(p.capDesign&&p.section.kind==='cap'?[['CAP CHANNEL',`Fy = ${ksi(p.capDesign.Fy)}; ${p.capDesign.materialSource}`]]:[]),
  ...(d?[['PLATES, BARS, TIES',`Fy = ${ksi(d.material.Fy)}, Fu = ${ksi(d.material.Fu)}`],['BOLTS',`${bolt}, PRETENSIONED; SLIP-CRITICAL CLASS ${d.end.surface}`],['WELD METAL',`E${Math.round(d.material.Fexx/6.894757293)}XX, AWS D1.1`],['CRANE RAIL',`${d.rail.name}; Fy = ${ksi(d.rail.Fy)}`]]:[]),
  ...(p.longitudinalBracing?.enabled?[['BRACING',p.longitudinalBracing.system==='rod-x'?`RODS Fy = ${ksi(p.longitudinalBracing.rod.Fy)}, Fu = ${ksi(p.longitudinalBracing.rod.Fu)}`:`${p.longitudinalBracing.angle.shape}, Fy = ${ksi(p.longitudinalBracing.angle.Fy)}`]]:[])
 ],[1.2,2.8]));
 if(d)blocks.push(P(`STEEL: ${d.fabrication.steel}`),P(`BOLTING: ${d.fabrication.bolting}`),P(`WELDING: ${d.fabrication.welding}`));
 blocks.push(H('SPECIAL INSPECTIONS (IBC 1705.2 / AISC 360 CHAPTER N)'),T(['ITEM','REQUIREMENT'],[
  ['MATERIAL','MILL CERTIFICATES: STEEL, BOLTS, NUTS, WASHERS, WELD FILLER'],
  ['WELDING','OBSERVE / PERFORM PER AISC N5.4; QUALIFIED WPS AND WELDERS'],
  ['NDT','UT ALL CJP GROOVE WELDS; MT FILLETS ON CYCLIC DETAILS AS NOTED'],
  ['BOLTING',`PRETENSION VERIFICATION PER RCSC; FAYING SURFACE CLASS${d&&(tieRelease(p)||activeEndBearing(p))?'; SLEEVE LENGTHS AND SLOT TRAVEL AT SLEEVED BOLTS':''}`],
  ['EXISTING STEEL','FIELD-VERIFY SIZES AND WELDABILITY BEFORE WORK'],
  ['RAIL / RUNWAY','ALIGNMENT, GAUGE AND LEVEL SURVEY AFTER ERECTION']
 ],[1.2,2.8]));
 if(d)blocks.push(P(`INSPECTION: ${d.fabrication.inspection}`));
 blocks.push(H('SUBMITTALS'),...N([
  'SHOP AND ERECTION DRAWINGS FOR ALL NEW STEEL, SHOWING HOLES, SLOTS, WELDS AND FIELD WORK.',
  'CRANE MANUFACTURER WHEEL LOADS, WHEEL SPACING, BUMPER FORCE AND RAIL REQUIREMENTS, SIGNED BY THE MANUFACTURER.',
  'WELDING PROCEDURE SPECIFICATIONS, WELDER QUALIFICATIONS AND BOLT CERTIFICATIONS.',
  'RAIL SURVEY AND CRANE LOAD-TEST REPORT.'
 ]));
 // Items this package does not design are listed for the building official as deferred or by others.
 const bypass=p.cranes.some(c=>c.design?.bumperBypassesGirder),support=s.checks.find(c=>c.id==='tie-move-support');
 const deferred=[
  'CRANE, END TRUCKS, CRANE-MOUNTED BUMPERS, CONDUCTOR BARS AND ELECTRIFICATION: CRANE SUPPLIER.',
  ...(bypass?['BUILDING-MOUNTED CRANE END STOPS AND THEIR SUPPORT FOR THE BUMPER FORCE IN THE CRANE DATA.']:[]),
  ...(!bypass&&!activeEndStop(p)?['RUNWAY END STOPS AT EACH END OF EACH RUNWAY FOR THE BUMPER FORCE IN THE CRANE DATA.']:[]),
  ...(!d?.bracket?.enabled?[`COLUMN BRACKETS AND THEIR ATTACHMENT TO THE BUILDING COLUMNS FOR THE SUPPORT REACTIONS LISTED${support?.capacity!==undefined?`, WITH VERTICAL DEFLECTION AT THE BEARING UNDER CRANE LOADS ${len(support.capacity)} MAX.`:'.'}`]:[]),
  ...(p.system==='simple'&&d&&!activeEndBearing(p)?['COLUMN-SIDE LOCATING AND GUIDED HOLD-DOWN ATTACHMENTS AT GIRDER ENDS (S-04) FOR THE INTERFACE FORCES IN THE CALCULATION REPORT.']:[]),
  ...s.checks.filter(c=>c.status==='excluded'&&c.id!=='bracket-load-path'&&c.id!=='tie-move-support').map(c=>`${c.title}: BY OTHERS FOR THE REPORTED FORCES.`)
 ];
 blocks.push(H('DEFERRED SUBMITTALS / BY OTHERS'),P('SUBMIT THE FOLLOWING TO THE ENGINEER OF RECORD FOR REVIEW AND TO THE BUILDING OFFICIAL FOR APPROVAL BEFORE INSTALLATION:'),...N(deferred));
 blocks.push(H('ABBREVIATIONS'),P('(E) EXISTING · (N) NEW · C/L CENTERLINE · EL. ELEVATION · T.O.S. TOP OF STEEL · T.O.R. TOP OF RAIL · TYP. TYPICAL · U.N.O. UNLESS NOTED OTHERWISE · SC SLIP-CRITICAL · STD STANDARD HOLE · SSL / LSL SHORT / LONG SLOT · CJP COMPLETE JOINT PENETRATION · FW FIELD WELD · REF. REFERENCE (EXISTING OR BY OTHERS)'));
 blocks.push(H('ISSUE'),P(`${status.label}${status.reasons.length?`: ${status.reasons.join('; ')}.`:'.'} CALCULATION REVISION ${s.revision}.`));
 return blocks;};
 // Largest legible text that fits, with the columns balanced to the shortest height that still fits.
 let placed:ReturnType<typeof flow>;
 for(const k of [1.25,1.18,1.1,1,.92,.85,.8]){
  const t:Style={width:columnWidth,body:5.4*k,leading:7.1*k,heading:7*k,caps:capsFor(u)},blocks=build(t);
  for(let h=Math.max(...blocks.map(b=>b.height))+top;h<=limits[0]+.01&&!placed;h+=4)placed=flow(blocks,h);
  if(placed)break;
 }
 let svg=sheetStart(s,'S-00','COVER, GENERAL NOTES & DESIGN CRITERIA')+`<g data-view="cover">`;
 // Content that cannot fit is drawn at the smallest size and marked so set checks report it.
 if(!placed){placed=flow(build({width:columnWidth,body:5.4*.8,leading:7.1*.8,heading:7*.8,caps:capsFor(u)}),limits[0],true)!;svg+='<g data-overflow="cover"/>';}
 for(const v of placed)svg+=v.b.render(v.x,v.y);
 for(const x of [430,842])svg+=line([x,18],[x,limits[0]+4],'divider');
 svg+=`</g>`;
 return svg+titleBlock(s,'S-00','COVER, GENERAL NOTES & DESIGN CRITERIA')+'</svg>';
}

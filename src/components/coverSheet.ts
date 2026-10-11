import {cantileverSystems,seismicBasis} from '../engine/runwaySeismic';
import {codeBasis} from '../engine/drawingData';
import {adjacentBays} from '../engine/continuation';
import type {CalculationSnapshot,Crane,ProjectInput} from '../engine/types';
import {existingWeldingDemand,weldingBasisLabel,weldsToExistingColumn} from '../engine/existingWelding';
import {existingColumnSection} from '../engine/existingColumn';
import {format} from '../engine/units';
import {craneDesignMinimum,craneCombinations} from '../engine/aistLoads';
import {deflectionCriteria} from '../engine/aistChecks';
import {runwayElevations,issueStatus,supportColumn,delegatedChecks,unevaluatedStructure} from '../engine/drawingData';
import {activeEndStop,stopLocation} from '../engine/endStopInputs';
import {activeEndBearing} from '../engine/endBearingInputs';
import {usesExistingBracket} from '../engine/existingBracket';
import {usesRolledBracket,projectStub} from '../engine/rolledBracket';
import {columnStiffenerGeometry} from '../engine/columnStiffeners';
import {activeColumnCap} from '../engine/columnCapInputs';
import {drawingLength,drawingElevation,electrodeClass,plateInches} from './drawingFormat';
import {railPad} from '../engine/railSeat';
import {line,text,circle,rect,bubble,filletLeader,fieldFilletLeader,dimH,n,sheetStart,titleBlock,detailRef,detailTitles,wrapToWidth,textWidth} from './sheetGraphics';
import {heading,paragraph,numbered,table,capsFor,type Block,type Style} from './noteBlocks';
import {structuralGeneralNotes} from './structuralNotes';
import {existingLayout} from '../engine/existingLayout';
import {tieRelease,stiffenerTieGeometry,flangeTieGeometry} from '../engine/tieGeometry';
import {designsBracing,bracingDesign,bracedSeismicSystem} from '../engine/newColumnBracing';
import {bracketForceBlocks,bracketForceTopic,bracketForcesAt} from './bracketForceTable';

/** A sheet of the set as the cover indexes it, with the titles of its details in drawing order. */
export interface SheetEntry {number:string;title:string;details?:readonly string[];}
// Four note columns in the ARCH D drawing area at content scale 1 (layout units print at 1/72 in).
// The last column stops above the seal and issue labels at the lower right.
const columnWidth=594,columns=[0,1,2,3].map(i=>14+i*(columnWidth+40)),top=18,limits=[1494,1494,1494,1318];
/** Symbols and line types used on the sheets, each drawn as it appears with its meaning. */
function legend(t:Style,units:'US'|'SI'):Block{
 // A sample fillet size as the details print it: 1/4 (inches), or 6 mm.
 const leg=units==='SI'?'6 mm':'1/4';
 const sample=150,row=Math.max(22,t.leading*2.2);
 const items:[(x:number,y:number)=>string,string][]=[
  [(x,y)=>line([x,y],[x+sample-20,y],'runway-line'),'NEW STEEL, PLATES AND WELDS (SOLID)'],
  [(x,y)=>line([x,y],[x+sample-20,y],'reference-line'),'EXISTING OR REFERENCE CONSTRUCTION, BY OTHERS (DASHED)'],
  [(x,y)=>line([x,y],[x+sample-20,y],'hidden-line'),'HIDDEN EDGES'],
  [(x,y)=>line([x,y],[x+sample-20,y],'grid-line'),'GRID LINES AND CENTERLINES'],
  [(x,y)=>rect(x,y-3,sample-20,6,'rail-line'),'CRANE RAIL'],
  [(x,y)=>bubble(x+12,y,'A',10),'GRID DESIGNATION'],
  [(x,y)=>`${circle(x+14,y,13,'divider')}${line([x+1,y],[x+27,y],'annotation')}${text(x+14,y-3,'1',10,'middle',700)}${text(x+14,y+8.5,'S-02',7,'middle')}`,'DETAIL NUMBER OVER THE SHEET WHERE IT IS DRAWN; REFERENCES READ 1/S-02'],
  [(x,y)=>filletLeader([[x+2,y+8]],[x+22,y+3],leg,[],false),'FILLET WELD, ARROW SIDE; SIZE LEFT OF THE SYMBOL'],
  [(x,y)=>filletLeader([[x+2,y+8]],[x+22,y+3],leg,[],true),'FILLET WELD, BOTH SIDES'],
  [(x,y)=>fieldFilletLeader([[x+2,y+8]],[x+22,y+3],leg,[],true),'FIELD WELD (FLAG); SHOP WELD U.N.O.'],
  [(x,y)=>`${line([x,y],[x+40,y])}<path class="leader-arrow" d="M${n(x+40)},${n(y)}l-2.4,-3.2h4.8z"/>${line([x+40,y],[x+50,y-6])}${line([x+50,y-6],[x+56,y-6])}${text(x+60,y-3,'EL.',7.5)}`,'ELEVATION DATUM']
 ];
 const head=heading(t,'SYMBOLS AND LINE TYPES');
 // Labels wrap within the column so no line runs past it at the larger note sizes.
 const lines=items.map(([,label])=>wrapToWidth(t.caps(label),t.width-sample-10,t.body)),rows=lines.map(l=>Math.max(row,(l.length-1)*t.leading+row));
 return {height:head.height+rows.reduce((a,b)=>a+b,0),keep:true,render:(x,y)=>{
  let svg=head.render(x,y),yy=y+head.height+row*.55;
  items.forEach(([draw],i)=>{svg+=draw(x+4,yy)+lines[i].map((v,j)=>text(x+sample+10,yy+t.body*.36+j*t.leading,v,t.body)).join('');yy+=rows[i];});
  return `<g data-legend="symbols">${svg}</g>`;
 }};
}
/**
 * Wheel load diagram: the end truck on the rail with each wheel's maximum load without impact, the wheel
 * spacing, and the traction and bumper forces along the rail. Crane, end truck and wheels are the crane
 * supplier's and drawn dashed; spacing is to scale across the column.
 */
function wheelDiagram(t:Style,c:Crane,o:{force:(v:number)=>string;length:(mm:number)=>string;impact:number;lateral:number;traction:number;bumper?:number}):Block{
 const size=Math.max(7,t.body*.8),offsets=c.wheels.map(w=>w.offset-c.wheels[0].offset),span=Math.max(1,offsets[offsets.length-1]);
 const margin=130,k=(t.width-2*margin)/span,load=(v:number)=>t.caps(o.force(v/(c.includesImpact?1+c.impact:1)));
 const gaps=offsets.slice(1).map((v,i)=>(v-offsets[i])*k),each=!gaps.length||Math.min(...gaps)>Math.max(...c.wheels.map(w=>textWidth(load(w.loaded),size)))+10;
 const note=wrapToWidth(t.caps(`${each?'Wheel loads':`Wheel loads, max. ${load(Math.max(...c.wheels.map(w=>w.loaded)))} each`}: maximum without impact, per the crane supplier; add ${+(o.impact*100).toFixed(1)}% vertical impact. Side thrust ${o.force(o.lateral)} on this runway and traction act at the rail head. Crane, end trucks and bumpers by the crane supplier.`),t.width,t.body);
 // Wheels at their spacing, never overlapping where a bogie puts them close together.
 const r=Math.min(11,...gaps.map(g=>g*.45)),top=size+4,truck=top+44,wheelY=truck+45-r,rail=wheelY+r,dimY=rail+38;
 return {height:dimY+16+note.length*t.leading,render:(x,y)=>{
  const X=(v:number)=>x+margin+v*k,arrow=(tip:[number,number],dx:number,dy:number)=>`<path class="leader-arrow" d="M${n(tip[0])},${n(tip[1])}l${n(-dx*6+dy*2.4)},${n(-dy*6-dx*2.4)}l${n(-dy*4.8)},${n(dx*4.8)}z"/>`;
  let svg=`<g data-wheel-diagram="${c.id}">`;
  svg+=rect(x+18,y+rail,t.width-36,6,'rail-line')+line([x+18,y+rail+12],[x+t.width-18,y+rail+12],'runway-line');
  svg+=rect(X(0)-42,y+truck,span*k+84,22,'reference-line');
  c.wheels.forEach((w,i)=>{const wx=X(offsets[i]);svg+=circle(wx,y+wheelY,r,'reference-line')+line([wx,y+top+4],[wx,y+truck-2])+arrow([wx,y+truck-2],0,1);
   if(each)svg+=text(wx,y+top,load(w.loaded),size,'middle',700);});
  for(let i=1;i<offsets.length;i++)svg+=dimH(X(offsets[i-1]),X(offsets[i]),y+rail+16,y+dimY,o.length(offsets[i]-offsets[i-1]));
  // Traction along the rail at the head, ahead of the truck; the bumper force on the truck end behind it.
  const ahead=X(span)+56;svg+=line([ahead,y+rail-3],[ahead+52,y+rail-3])+arrow([ahead+52,y+rail-3],1,0)+text(ahead,y+rail-9,t.caps(o.force(o.traction)),size,'start');
  svg+=text(ahead,y+rail-9-size*1.2,'TRACTION',size,'start');
  if(o.bumper){const back=X(0)-42;svg+=line([back,y+truck+11],[back-60,y+truck+11])+arrow([back-60,y+truck+11],-1,0)+text(back-4,y+truck+5,t.caps(o.force(o.bumper)),size,'end')+text(back-4,y+truck+5-size*1.2,'BUMPER',size,'end');}
  note.forEach((v,i)=>{svg+=text(x,y+dimY+16+(i+.75)*t.leading,v,t.body);});
  return svg+'</g>';
 }};
}
/**
 * Greedy column flow; a heading stays with the block after it, and a section carried into the next column
 * restarts under its heading marked continued. Returns undefined when the blocks do not fit.
 */
function flow(blocks:Block[],limit:number,overflow=false){
 const placed:{x:number;y:number;b:Block}[]=[];let column=0,y=top,section:Block|undefined;
 for(let i=0;i<blocks.length;i++){
  // A kept block needs room for the block after it, and a heading over a kept table also for the table's key,
  // so the heading never stays behind alone; a chain taller than a column falls back to the next block only.
  const b=blocks[i],next=b.keep?blocks[i+1]:undefined,after=b.continued&&next?.keep?blocks[i+2]:undefined,bottom=Math.min(limit,limits[column]);
  const pair=b.height+(next?2.4+next.height:0),chain=pair+(after?2.4+after.height:0),need=chain<=Math.min(limit,limits[column])-top?chain:pair;
  if(b.continued)section=b;
  if(y>top&&y+need>bottom&&column<columns.length-1){column++;y=top;if(!b.continued&&section){const c=section.continued!();placed.push({x:columns[column],y,b:c});y+=c.height+2.4;}}
  else if(y>top&&y+need>bottom&&!overflow)return undefined;
  if(y+b.height>Math.min(limit,limits[column])&&!overflow)return undefined;
  placed.push({x:columns[column],y,b});y+=b.height+2.4;
 }
 return placed;
}

export const coverSheetTitle='COVER, GENERAL NOTES & DESIGN CRITERIA';
/** The specified field-welding requirements for the existing columns, from the calculation's welding checks. */
function existingWeldNote(p:ProjectInput){
 if(!weldsToExistingColumn(p))return [];
 const w=p.existingColumn!.welding,{t,need}=existingWeldingDemand(p,existingColumnSection(p).section.tf),temp=(v:number)=>format(v,'temperature',p.units,0).toUpperCase();
 const steel=w&&w.basis!=='not-established'&&w.grade.trim()?`${w.grade.toUpperCase()} (${weldingBasisLabel[w.basis].toUpperCase()}${w.carbonEquivalent!==undefined?`, CARBON EQUIVALENT ${w.carbonEquivalent.toFixed(2)}`:''})`:'TO BE IDENTIFIED BEFORE WELDING';
 return [`FIELD WELDS TO THE EXISTING COLUMNS: EXISTING STEEL ${steel}. LOW-HYDROGEN PROCESSES ONLY. PREHEAT AND INTERPASS AT LEAST ${temp(Math.max(need,w?.preheat??need))} (AWS D1.1 TABLE 5.8, CATEGORY B, THICKEST PART ${format(t,'length',p.units,3).toUpperCase()}). WELD WITH THE CRANE OUT OF SERVICE AND THE COLUMN UNDER DEAD LOAD ONLY; SEQUENCE THE WELDS TO LIMIT HEAT INPUT.`];
}
export function coverSheetSvg(s:CalculationSnapshot,sheets:SheetEntry[]){
 const p=s.input,u=p.units,d=p.details,f=(v:number|undefined,q:Parameters<typeof format>[1]='force')=>format(v,q,u,2),len=(mm:number)=>drawingLength(mm,u);
 const ksi=(v:number)=>format(v,'stress',u,u==='SI'?0:3),status=issueStatus(s),elevations=runwayElevations(p);
 const capacity=(N:number)=>u==='US'?`${+(N/8896.443).toFixed(2)} ton (${f(N)})`:`${+(N/9806.65).toFixed(2)} TONNES (${f(N)})`;
 const length=p.spans.reduce((a,b)=>a+b,0),cranes=(()=>{
  // Identical cranes read once with their count: "two 5 ton (10 kip) maintenance cranes".
  const counts=new Map<string,number>();for(const c of p.cranes){const k=c.design?`${capacity(c.design.ratedLoad)} ${c.design.type} crane`:c.name;counts.set(k,(counts.get(k)??0)+1);}
  return [...counts].map(([k,n])=>n===1?k:`${['','','two','three'][n]??n} ${k.endsWith('crane')?`${k}s`:`× ${k}`}`).join(' and ');})();
const isNew=!!(p.existingColumn?.enabled&&p.existingColumn.isNew);
 const supports=isNew?`new freestanding ${p.existingColumn!.shape||'built-up'} runway columns${d?.bracket?.enabled?' with welded brackets':activeColumnCap(p)?' with column caps, the girders bearing directly on the columns':''}${p.columnBase?.enabled?', base plates, anchor rods and spread footings':''}`:d?.bracket?.enabled?(usesExistingBracket(p)?'existing column brackets with new bolted seats':'new brackets welded to the existing building columns'):p.aist?.supportType==='column'?'independent runway columns':'the building columns';
 const scope=`Furnish and install one crane runway line, ${len(length)} long in ${p.spans.length} ${p.system==='continuous'?'continuous':'simple'} span${p.spans.length>1?'s':''}, for ${cranes}: ${p.section.name}${p.section.kind==='cap'?' capped':''} runway girders, rail, rail attachments, end stops and connections, supported on ${supports}.${isNew?' The new columns carry only the crane and runway; the existing building carries no crane load.':p.existingColumn?.enabled?' The existing column receiving the runway is checked for the added crane reactions.':''}${p.longitudinalBracing?.enabled?(designsBracing(p)?' The new crane-level rod X-bracing, its strut, gussets, pins and the braced columns and footings are designed for crane traction, stop and seismic forces along the runway.':` The ${isNew?'new':'existing'} crane-level longitudinal bracing is checked for crane traction and stop forces.`):''} The opposite runway is identical unless noted.`;
 const build=(t:Style)=>{
 const H=(v:string)=>heading(t,v),N=(v:string[])=>numbered(t,v),P=(v:string)=>paragraph(t,v),T=(h:string[],r:string[][],w:number[])=>table(t,h,r,w);
 const blocks:Block[]=[];
 blocks.push(H('SCOPE OF WORK'),P(scope));
 blocks.push(H('GENERAL NOTES'),...N([
  ...structuralGeneralNotes(s),
  'THESE DRAWINGS AND THE CALCULATION REPORT OF THE SAME REVISION FORM ONE PACKAGE. WHERE THEY DIFFER, THE MORE STRINGENT REQUIREMENT GOVERNS UNTIL CLARIFIED BY THE ENGINEER OF RECORD.',
  'ALL WORK SHALL CONFORM TO THE BUILDING CODE ADOPTED BY THE AUTHORITY HAVING JURISDICTION AND THE STANDARDS LISTED UNDER DESIGN CRITERIA.',
  // Millimetre values of imperial products are conversions, not metric product sizes.
  ...(u==='SI'?['DIMENSIONS ARE IN MILLIMETRES AND ELEVATIONS IN METRES. BOLT, PLATE, WELD AND SECTION SIZES ARE THOSE OF THE DESIGN; WHERE A SIZE IS AN IMPERIAL PRODUCT SHOWN IN MILLIMETRES (FOR EXAMPLE A 3/4 IN BOLT SHOWN AS 19 MM), FURNISH THAT PRODUCT. SUBSTITUTE METRIC PRODUCTS ONLY AFTER THE ENGINEER OF RECORD RECALCULATES WITH THEIR SIZES.']:[])
 ]));
 const existing=p.existingColumn?.enabled||p.longitudinalBracing?.enabled||d?.bracket?.enabled||p.aist?.supportType==='bracket';
 // Notes on cutting, welding and shoring existing steel apply where the runway attaches to the building.
 const onExisting=!supportColumn(p).isNew;
 const surveyed=existingLayout(p);
 if(existing)blocks.push(H('EXISTING BUILDING NOTES'),...N([
  'EXISTING CONSTRUCTION IS SHOWN DASHED AND IS BASED ON THE SURVEY AND SOURCES LISTED BELOW. FIELD VERIFY MEMBER SIZES, CONDITION, PLUMBNESS AND ELEVATIONS BEFORE FABRICATION AND REPORT DIFFERENCES TO THE ENGINEER OF RECORD.',
  ...(onExisting?['DO NOT CUT, DRILL OR WELD EXISTING STEEL UNTIL ITS MATERIAL AND WELDABILITY ARE CONFIRMED (MILL DATA OR CHEMICAL ANALYSIS AND CARBON EQUIVALENT PER AWS D1.1). REMOVE COATINGS AND PREHEAT AS REQUIRED BY THE APPROVED WPS.',
  ...existingWeldNote(p),
  'SHORE OR UNLOAD EXISTING MEMBERS AS REQUIRED BY THE ERECTION PROCEDURE. DO NOT REMOVE EXISTING BRACING WITHOUT A TEMPORARY REPLACEMENT APPROVED BY THE ENGINEER.']:[
   `${surveyed?`THE EXISTING COLUMNS AND FOOTINGS ON S-01 ARE FROM ${surveyed.source||'A SURVEY NOT YET IDENTIFIED'}. CONFIRM THEM AND LOCATE SLABS`:'LOCATE THE EXISTING COLUMNS, FOOTINGS, SLABS'} AND BURIED UTILITIES BY SURVEY BEFORE LAYOUT. KEEP THE NEW FOOTINGS ${surveyed?`${len(surveyed.footingClear)} MIN. `:''}CLEAR OF EXISTING FOOTINGS AND THE NEW STEEL CLEAR OF THE EXISTING BUILDING BY THE SEPARATION SHOWN ON S-01; REPORT CONFLICTS TO THE ENGINEER OF RECORD BEFORE EXCAVATION.`]),
  ...(p.existingColumn?.enabled&&!p.existingColumn.isNew?[`EXISTING COLUMN: ${p.existingColumn.source||'SOURCE NOT ENTERED'}.`]:[]),
  ...(p.existingColumn?.enabled&&p.existingColumn.isNew?[`NEW RUNWAY COLUMNS ARE INDEPENDENT OF THE EXISTING BUILDING${p.columnBase?.enabled?` AND BEAR ON NEW FOOTINGS${supportColumn(p).detailed?` (${detailRef(detailTitles.newColumn)})`:''}`:''}. SAW CUTTING AND EXCAVATION OF THE EXISTING SLAB SHALL NOT UNDERMINE EXISTING FOOTINGS; REPORT CONFLICTS TO THE ENGINEER OF RECORD.`]:[]),
  ...(p.longitudinalBracing?.enabled?[`${p.existingColumn?.isNew&&p.existingColumn.enabled?'CRANE-LEVEL':'EXISTING'} LONGITUDINAL BRACING: ${p.longitudinalBracing.source||'SOURCE NOT ENTERED'}.`]:[]),
  ...(usesExistingBracket(p)?['EXISTING BRACKETS ARE REUSED ONLY WITH THE DOCUMENTED ASSESSMENT IN THE CALCULATION REPORT.']:[]),
  ...(unevaluatedStructure(s).length?['ITEMS MARKED BY OTHERS IN THE CALCULATION REPORT (FRAME, CONNECTIONS TO EXISTING MEMBERS, ANCHORS AND FOUNDATIONS NOT CHECKED HERE) SHALL BE VERIFIED BY THE ENGINEER OF RECORD FOR THE REPORTED FORCES.']:[])
 ].map(v=>v.toUpperCase())));
 if(d)blocks.push(H('CRANE RUNWAY INSTALLATION'),...N([
  `RAIL: ${d.rail.name}. SET THE RAIL C/L ON THE GIRDER WEB C/L WITHIN ${len(d.criteria.alignmentTolerance)} AND THE RAIL TOP WITHIN ${len(d.criteria.levelTolerance)} OF THE THEORETICAL ELEVATION. THE DESIGN ALLOWS A RAIL-TO-WEB ECCENTRICITY OF ${len(Math.abs(p.railEccentricity))} FOR SETTING AND WEAR; IT IS NOT A SETTING DIMENSION.`,
  `RAIL GAUGE (CRANE SPAN) ${len(d.criteria.railGauge)} ± ${len(2*d.criteria.alignmentTolerance)}, THE TOTAL OF THE SETTING TOLERANCES OF THE TWO RAILS, UNLESS THE CRANE MANUFACTURER REQUIRES LESS. VERIFY WITH THE CRANE MANUFACTURER BEFORE SETTING RAILS.`,
  d.fabrication.railAlignment,
  'SURVEY RAIL ALIGNMENT, GAUGE AND ELEVATION AFTER ERECTION AND BEFORE THE LOAD TEST; SUBMIT THE SURVEY.',
  ...(activeEndStop(p)?[`INSTALL THE RUNWAY END STOPS (${detailRef(detailTitles.endStop)}) AT ${stopLocation(p).toUpperCase()} BEFORE THE CRANE IS OPERATED OR LOAD TESTED.`]:[]),
  // The flexible plate tie works only while it can flex: no forced fit, no welds or stiffeners on its clear length.
  ...(flangeTieGeometry(p)?.plies===1?[`FLEXIBLE PLATE TIES (${detailRef(detailTitles.flangeTie)}): BOLT THE PLATE WITHOUT JACKING, HEATING OR SHIMMING TO FORCE FIT; DO NOT WELD, DRILL OR STIFFEN IT BETWEEN ITS BOLT GROUPS. INSPECT THE PLATE AND ITS BOLTS AT THE CRANE INSPECTION INTERVALS.`]:[]),
  'LOAD TEST THE CRANE PER ASME B30.2 AND THE MANUFACTURER. THE TEST LOAD SHALL NOT EXCEED 125% OF THE RATED LOAD; COORDINATE ANY TEST LOAD ABOVE THE RATED LOAD WITH THE ENGINEER OF RECORD BEFORE TESTING.'
 ].map(v=>v.toUpperCase())));
 // Column 2: criteria.
 const code=codeBasis(p);
 // New cantilever columns designed for seismic in SDC B to F fall under AISC 341 (§E5 ordinary, §E6 special).
 const seismic341=(()=>{const z=seismicBasis(p);return z&&!z.integrityOnly?{clause:z.system==='special'?'§E6 SPECIAL CANTILEVER COLUMN SYSTEM':'§E5 ORDINARY CANTILEVER COLUMN SYSTEM'}:undefined;})();
 blocks.push(H('DESIGN CRITERIA · CODES AND STANDARDS'),T(['STANDARD','EDITION / SCOPE'],[
  ['BUILDING CODE',code.building.toUpperCase()],
  // Work on an existing building is an alteration under the existing building code adopted with it.
  ['EXISTING BUILDING CODE',`${code.entered?'IEBC OF THE SAME EDITION AS THE BUILDING CODE':'NOT ENTERED: IEBC EDITION ADOPTED WITH THE BUILDING CODE'}: ALTERATION; ${p.existingColumn?.isNew?'THE EXISTING STRUCTURE CARRIES NO CRANE LOAD':'EXISTING STRUCTURE EVALUATED FOR THE ADDED CRANE LOADS, SEE EXISTING STRUCTURE EVALUATION'}`],
  ['ASCE/SEI 7',code.asce],
  ['AISC 360',code.aisc+', '+p.method],
  ['AIST TECH. REPORT 13','GUIDE FOR THE DESIGN AND CONSTRUCTION OF MILL BUILDINGS, COPY DATED FEBRUARY 24, 2020: RUNWAY LOADS AND CRITERIA'],
  ['AISC DESIGN GUIDE 7','3RD ED. (2019) WITH 2023 ERRATA'],
  // Welding and bolting standards are the editions the cited AISC 360 references.
  ['AWS D1.1/D1.1M',`${code.adopted2022?'2020':'2015'}: STRUCTURAL WELDING CODE - STEEL (CYCLICALLY LOADED), AS REFERENCED BY AISC 360-${code.adopted2022?'22':'16'}`],
  ['RCSC',`${code.adopted2022?'2020':'2014'} SPECIFICATION FOR STRUCTURAL JOINTS, AS REFERENCED BY AISC 360-${code.adopted2022?'22':'16'}`],
  // ASCE 7 §14.1.2.2.1: a cantilever column system in SDC B to F is designed and detailed to AISC 341; the R = 3
  // exemption excludes cantilever columns. The crane-level rod bracing (R = 3) stays under AISC 360.
  ...(seismic341?[['AISC 341',`${code.adopted2022?'2022':'2016'}: SEISMIC PROVISIONS, ${seismic341.clause} (NEW COLUMNS ACROSS THE RUNWAY); CRANE-LEVEL BRACING EXEMPT (R = 3)`],['AWS D1.8/D1.8M',`${code.adopted2022?'2021':'2016'}: STRUCTURAL WELDING CODE - SEISMIC SUPPLEMENT, AS REFERENCED BY AISC 341-${code.adopted2022?'22':'16'}`]]:[]),
  ...(p.columnBase?.enabled&&p.existingColumn?.isNew?[['ACI 318','2019: FOOTINGS (CH. 13) AND ANCHORING TO CONCRETE (CH. 17)'],['AISC DESIGN GUIDE 1','2ND ED. (2006): BASE PLATES AND ANCHOR RODS']]:[]),
  ['ASME B30.2','2022: OVERHEAD AND GANTRY CRANES; INSPECTION, TESTING AND OPERATION']
 ],[1.2,2.8]));
 for(const c of p.cranes){
  const m=craneDesignMinimum(c),dd=c.design,max=Math.max(...c.wheels.map(w=>w.loaded/(c.includesImpact?1+c.impact:1)));
  blocks.push(H(`CRANE DATA · ${c.name.toUpperCase()}`),T(['ITEM','VALUE'],[
   ['RATED CAPACITY',dd?capacity(dd.ratedLoad):'NOT ENTERED'],
   // AIST TR-13 crane type sets the side-thrust factors; it is not the CMAA service class.
   ['AIST CRANE TYPE / CONTROL',dd?`${dd.type.toUpperCase()} / ${dd.control.toUpperCase()}`:'NOT ENTERED'],
   ['SERVICE',c.operatingClass.toUpperCase()],
   ['WHEELS ON RUNWAY',`${c.wheels.length} AT ${c.wheels.slice(1).map((w,i)=>len(w.offset-c.wheels[i].offset)).join(', ')}`],
   ['MAX STATIC WHEEL LOAD',f(max)],
   ['VERTICAL IMPACT (ADOPTED)',`${+(Math.max(c.impact,m.impact)*100).toFixed(1)}% (AIST / ASCE 7 MIN. ${+(m.impact*100).toFixed(1)}%)`],
   ['SIDE THRUST, THIS RUNWAY',f(Math.max(c.wheels.reduce((a,w)=>a+w.lateral,0),m.runwaySide))],
   ['LONGITUDINAL TRACTION',f(Math.max(c.longitudinal,m.traction))],
   ['BUMPER (STOP) FORCE',dd?.bumperForce?`${f(dd.bumperForce)}${dd.bumperBypassesGirder?' TO BUILDING-MOUNTED STOP':''}`:'NOT ENTERED'],
   ['LOAD SOURCE',c.loadSource.toUpperCase()]
  ],[1.4,2.6]));
  blocks.push(H(`WHEEL LOADS · ${c.name.toUpperCase()}`),wheelDiagram(t,c,{force:v=>f(v),length:len,impact:Math.max(c.impact,m.impact),
   lateral:Math.max(c.wheels.reduce((a,w)=>a+w.lateral,0),m.runwaySide),traction:Math.max(c.longitudinal,m.traction),bumper:dd?.bumperForce||undefined}));
 }
 const a=p.aist,vertical=s.checks.find(c=>c.id==='vertical'),lateral=s.checks.find(c=>c.id==='lateral'),shortest=Math.min(...p.spans);
 const criteria=deflectionCriteria(p),ratio=(c:typeof vertical,n:number)=>c?`L/${n}`:'-';
 blocks.push(H('DESIGN CRITERIA · RUNWAY'),T(['ITEM','VALUE'],[
  ['RUNWAY GIRDER',`${p.section.name}${p.section.kind==='cap'?' (CAPPED)':''}, Fy = ${ksi(p.section.Fy)}`],
  ['SPANS',`${p.spans.map(len).join(' + ')} ${p.system==='continuous'?'CONTINUOUS':'SIMPLE SPANS'}`],
  ['DESIGN METHOD',`${p.method}; RUNWAY: AIST TR-13 §3.10; BUILDING CHECKS: ASCE 7 §2.3/§2.4`],
  ['AIST BUILDING CLASS',a?`CLASS ${a.buildingClass} FOR ${a.buildingCycles.toLocaleString()} OWNER FULL-LOAD REPETITIONS`:'-'],
  // AIST TR-13 multiple cranes: every loaded / empty arrangement, closest approach included; one crane's side thrust.
  ...(p.cranes.length>1?[['CRANES ON THE RUNWAY',`${p.cranes.length} CRANES, MIN. ${len(Math.max(...p.cranes.map(c=>c.minSeparation)))} WHEEL TO WHEEL. STRENGTH: EVERY LOADED AND EMPTY ARRANGEMENT AT ALL POSITIONS, CLOSEST APPROACH INCLUDED, WITH IMPACT ON EACH CRANE AND SIDE THRUST FROM ONE CRANE AT A TIME. FATIGUE: ${p.aist?.fatigueCranes==='single'?'ONE CRANE AT A TIME':'ALL CRANES TOGETHER, SIDE THRUST FROM ONE'}.`]]:[]),
  ['VERTICAL / LATERAL DEFLECTION',`${ratio(vertical,criteria.nv)} / ${ratio(lateral,criteria.nh)} OF EACH BAY (ONE CRANE, NO IMPACT)`],
  // The owner / crane supplier rail criteria the serviceability checks use (one static crane).
  ...(d?[['RAIL TWIST / HEAD MOVEMENT',`ROTATION ${d.criteria.twistLimit} RAD; RAIL-HEAD LATERAL MOVEMENT L/${Math.max(400,p.lateralLimit,d.criteria.railLateralLimit)} OF THE SHORTEST BAY, TWIST INCLUDED (OWNER / CRANE SUPPLIER CRITERIA, ONE STATIC CRANE)`]]:[]),
  ['FATIGUE SPECTRUM',d?(()=>{const rated=d.spectrum.filter(b=>b.liftFraction>=1).reduce((sum,b)=>sum+b.cycles,0),perPass=a&&a.buildingCycles>0?rated/a.buildingCycles:0;
   // The rated-lift bin relates to the owner's full-load repetitions by the stress cycles per crane pass.
   return `${d.spectrum.reduce((sum,b)=>sum+b.cycles,0).toLocaleString()} STRESS CYCLES AT EACH DETAIL IN ${d.spectrum.length} DUTY BINS (${rated.toLocaleString()} AT RATED LIFT${perPass>0?`: ${Number(perPass.toFixed(2))} STRESS CYCLE${perPass===1?'':'S'} PER FULL-LOAD REPETITION`:''})`;})():`${p.fatigue.cycles.toLocaleString()} CYCLES, CATEGORY ${p.fatigue.category}`],
  // IBC 1603.1.5: the seismic data for the new structure, and the design base shear each way.
  ...(()=>{const z=seismicBasis(p),e=p.existingColumn?.seismic;if(!z||!e)return [];
   const v=(x:number|undefined)=>x===undefined?'NOT ENTERED':String(x),across=s.existingColumn?.seismic?.QE,along=s.bracingSystem?.seismic?.QE;
   return [['SEISMIC DATA (NEW COLUMNS)',`RISK CATEGORY ${e.riskCategory??'NOT ENTERED'}, IE ${z.Ie}; SS ${v(e.Ss)}, S1 ${v(e.S1)}; SITE CLASS ${e.siteClass==='default'?'D (DEFAULT, §11.4.3)':e.siteClass??'NOT ENTERED'}; SDS ${z.SDS}, SD1 ${v(e.SD1)}; SEISMIC DESIGN CATEGORY ${z.sdc}`],
    ['SEISMIC (NEW COLUMNS)',`ASCE 7 EQUIVALENT LATERAL FORCE PROCEDURE. ACROSS THE RUNWAY: ${cantileverSystems[z.system].label.toUpperCase()}, R ${z.R}, ΩO ${z.Omega0}, CD ${z.Cd}, REDUNDANCY ${z.rho}; CS ${z.Cs.toFixed(3)}${z.integrityOnly?' (SDC A, §1.4.2)':''}${across!==undefined?`, V = ${f(across)} PER COLUMN`:''}. ALONG THE RUNWAY: CRANE-LEVEL BRACING${designsBracing(p)?`, ${bracedSeismicSystem.label.toUpperCase()}, R ${bracedSeismicSystem.R}, ΩO ${bracedSeismicSystem.Omega0}, CD ${bracedSeismicSystem.Cd}`:''}${along!==undefined?`, V = ${f(along)} PER RUNWAY LINE`:''}. ${seismic341?`COLUMNS (AISC 341 ${seismic341.clause.slice(0,3)}.4a), BASE PLATES`:'BASE PLATES'}, ANCHORS AND FOOTINGS FOR OVERSTRENGTH`],
    ['WIND (NEW COLUMNS)','NONE: THE RUNWAY STRUCTURE IS INSIDE THE ENCLOSED EXISTING BUILDING']];})(),
  ...(p.columnBase?.enabled&&p.existingColumn?.isNew?[['FOUNDATIONS',`SPREAD FOOTINGS; ${format(p.columnBase.soil.allowable,'pressure',u,u==='SI'?0:3).toUpperCase()} ALLOWABLE BEARING, BASE FRICTION ${p.columnBase.soil.friction}; OVERTURNING AND SLIDING FS 1.5 (DEAD LOAD ONLY RESISTING), 1.0 IN THE ASCE 7 SEISMIC COMBINATIONS`]]:[]),
  ['ELEVATIONS',elevations?`T.O.R. ${drawingElevation(elevations.tor,u)}, T.O.S. ${drawingElevation(elevations.tos,u)} (DATUM ${drawingElevation(elevations.datum,u)})`:'NOT ENTERED']
 ],[1.4,2.6]));
 const r=s.supportReactions;
 // The combinations the runway girder is designed for, as the calculation applies them.
 const combos=craneCombinations(p.method,p.aist?.concurrency==='full'),plain=(v:string)=>v.replace(/C_\{([^}]*)\}/g,'C$1').replace(/C_([a-z]+)/g,'C$1');
 // The table keeps with its key below it.
 blocks.push(H(`LOAD COMBINATIONS · RUNWAY GIRDER (${p.method})`),{...T(['NO.','COMBINATION','NO.','COMBINATION'],Array.from({length:Math.ceil(combos.length/2)},(_,i)=>{const a=combos[i],b=combos[i+Math.ceil(combos.length/2)];return [a.id,plain(a.equation),b?.id??'',b?plain(b.equation):''];}),[.45,1.55,.45,1.55]),keep:true},
  P(`AIST TECHNICAL REPORT 13 WITH ASCE 7 §2.${p.method==='LRFD'?'3':'4'}. Cd CRANE DEAD, Cv VERTICAL, Css SIDE THRUST, Cls LONGITUDINAL, Ci IMPACT, Cbs BUMPER; SUFFIX m MULTIPLE CRANES, s ONE CRANE, min MINIMUM LIFTED LOAD. D DEAD, L LIVE.${p.aist?.concurrency==='full'?' C1: ALL CRANE LOADS CONCURRENT AS L.':''}`));
 if(r)blocks.push(H('SUPPORT REACTIONS · UNFACTORED, PER SUPPORT'),T(['STATION','D','Cd','Cv','Ci','Css','Cls·e/L'],r.supports.map(v=>[len(v.x),f(v.D),f(v.Cd),f(v.Cv),f(v.Ci),f(v.Css),'±'+f(v.Clv)]),[1.25,1,1,1,1,1,1.05]),P(`Cd CRANE EMPTY, Cv LIFTED, Ci IMPACT${p.cranes.length>1?' (ALL CRANES, ANY ARRANGEMENT)':''}, Css SIDE THRUST AT RAIL HEAD (ONE CRANE). RUNWAY LONGITUDINAL FORCE Cls = ${f(r.Cls)} AT THE RAIL HEAD; Cls·e/L IS ITS END COUPLE AT THE BEARINGS OF THE BAY THAT CARRIES IT. ALL CRANE COMPONENTS ARE LIVE LOAD L (ASCE 7 §4.9).${adjacentBays(p).map(b=>` AT ${len(b.station)} THE REACTIONS INCLUDE THE EXISTING ADJACENT ${len(b.length)} BAY (SAME GIRDER, RAIL AND DEAD LOAD ASSUMED).`).join('')} FACTORED: ${bracketForcesAt(s,'cover')}.`));
 // Without bracket or support details the cover carries the factored bracket design forces.
 if(d&&s.detailResults&&!bracketForceTopic(s))blocks.push(...bracketForceBlocks(s,t));
 // Column 3: index, materials, inspection.
 blocks.push(H('SHEET INDEX'),T(['SHEET','TITLE'],[['S-00',coverSheetTitle],...sheets.map(v=>[v.number,v.title])],[.7,3.3]));
 // Every detail by number and sheet; references resolve when the set is assembled.
 const details=sheets.flatMap(v=>(v.details??[]).map(t=>[detailRef(t),t]));
 if(details.length)blocks.push(H('DETAIL INDEX'),T(['DETAIL','TITLE'],details,[.7,3.3]));
 const bolt=d?.end.grade==='A490'?'ASTM F3125 GRADE A490 (GROUP 150)':'ASTM F3125 GRADE A325 (GROUP 120)';
 blocks.push(H('MATERIALS'),T(['ITEM','SPECIFICATION'],[
  ['RUNWAY GIRDER',p.section.kind==='welded'?`PLATE, Fy = ${ksi(p.section.Fy)}`:`ASTM A992, Fy = ${ksi(p.section.Fy)}`],
  ...(p.capDesign&&p.section.kind==='cap'?[['CAP CHANNEL',`Fy = ${ksi(p.capDesign.Fy)}; ${p.capDesign.materialSource}`]]:[]),
  ...(d?[['PLATES, BARS, TIES',`Fy = ${ksi(d.material.Fy)}, Fu = ${ksi(d.material.Fu)}`],['BOLTS',`${bolt}, PRETENSIONED; SLIP-CRITICAL CLASS ${d.end.surface}`],['NUTS AND WASHERS','ASTM A563 GRADE DH HEAVY HEX NUTS; ASTM F436 HARDENED WASHERS; PLATE WASHERS ASTM A572 GR. 50'],['BOLT SLEEVES',`ASTM A513 OR A500 GR. C STEEL TUBE, Fy = ${ksi(50*6.894757)} MIN.`],['WELD METAL',`${electrodeClass(d.material.Fexx,u)}, AWS D1.1`],...(seismic341?[['SEISMIC WELDS',`NEW COLUMN TO BASE PLATE, AND BRACKETS AND TIES TO THE NEW COLUMNS: FILLER METAL WITH CVN TOUGHNESS PER AWS D1.8 CLAUSE 6.3 (AISC 341 §A3.4a); ALSO THE ANCHOR ROD PLATE WASHER WELDS`]]:[]),['CRANE RAIL',`${d.rail.name}; Fy = ${ksi(d.rail.Fy)}`],...(railPad(p)?[['RAIL PAD',`${d.rail.padSource}; ${plateInches(railPad(p)!.thickness,u)} THICK X ${plateInches(railPad(p)!.width,u)} WIDE, CONTINUOUS UNDER THE RAIL BASE; ALLOWABLE COMPRESSION ${ksi(d.rail.padAllowable)}; SEE ${detailRef(detailTitles.railKeeper)}`]]:[])]:[]),
  ...(usesRolledBracket(p)?(()=>{const w=projectStub(p);return [['COLUMN BRACKETS',`ASTM A992 ${w.name}, Fy = ${ksi(w.input.Fy)}, Fu = ${ksi(w.input.Fu)}; ${w.seat?'SEAT PL AND ':''}STIFFENERS AS PLATES`]];})():[]),
  ...(d&&columnStiffenerGeometry(p)?[['COLUMN STIFFENERS',`PLATES AS ABOVE, Fy = ${ksi(d.material.Fy)}; ${supportColumn(p).field?'FIELD WELDED INSIDE THE EXISTING COLUMNS':'SHOP WELDED INSIDE THE NEW COLUMNS'} AT THE BRACKETS`]]:[]),
  ...(p.existingColumn?.enabled&&p.existingColumn.isNew?[['NEW COLUMNS',`ASTM A992${p.existingColumn.shape?` ${p.existingColumn.shape}`:''}, Fy = ${ksi(p.existingColumn.Fy)}`]]:[]),
  ...(p.columnBase?.enabled&&p.existingColumn?.isNew?[['BASE PLATES',`ASTM A572 GR. 50, Fy = ${ksi(p.columnBase.plate.Fy)}`],['ANCHOR RODS',`ASTM F1554 GR. ${p.columnBase.anchors.grade.split('-')[1]}, A563 HEAVY HEX NUTS; DG1 HOLES AND PLATE WASHERS`],['CONCRETE / REBAR',`f'c = ${ksi(p.columnBase.concrete.fc)}; EXPOSURE F0, S0, W1, C1 (ACI 318-19 TABLE 19.3.1.1: INTERIOR FOOTING IN SOIL; CONFIRM THE SULFATE CLASS WITH THE GEOTECHNICAL REPORT); ASTM A615 Fy = ${ksi(p.columnBase.footing.fy)}; NON-SHRINK GROUT ASTM C1107`]]:[]),
  // Only new bracing is furnished; existing bracing is checked and described in the existing building notes.
  ...(designsBracing(p)?(()=>{const g=bracingDesign(p);return [['BRACING STRUT',`ASTM A992 ${g.strut.shape}, Fy = ${ksi(g.strut.Fy)}`],['BRACE GUSSETS',`ASTM A572 GR. 50, Fy = ${ksi(g.gusset.Fy)}, Fu = ${ksi(g.gusset.Fu)}`],['CLEVIS PINS',`STEEL PIN, Fu = ${ksi(g.pin.Fu)} MIN.; FORGED CLEVISES RATED FOR THE ROD STRENGTH`]];})():[]),
  ...(p.longitudinalBracing?.enabled&&p.existingColumn?.isNew?[[p.longitudinalBracing.system==='rod-x'?'BRACING RODS':'BRACING',p.longitudinalBracing.system==='rod-x'?`RODS Fy = ${ksi(p.longitudinalBracing.rod.Fy)}, Fu = ${ksi(p.longitudinalBracing.rod.Fu)}`:`${p.longitudinalBracing.angle.shape}, Fy = ${ksi(p.longitudinalBracing.angle.Fy)}`]]:[])
 ],[1.2,2.8]));
 // Numbered under their own heading, so one carried to the next column still reads in context.
 if(d)blocks.push(H('MATERIAL NOTES'),...N([`STEEL: ${d.fabrication.steel}`,`BOLTING: ${d.fabrication.bolting}`,`WELDING: ${d.fabrication.welding}`]));
 // AISC 360 Chapter N assigns steel tasks to observe (O) or perform (P); IBC Table 1705.3 rates concrete
 // tasks continuous (C) or periodic (P).
 // CJP joints in the set: capped-girder bearing stiffeners to the W top flange, and the paired-bar tie gusset to its stiffener.
 const cjpWelds=!!d&&(p.section.kind==='cap'||!!stiffenerTieGeometry(p));
 const fieldWelds=!!d&&supportColumn(p).field&&(!!d.brace.flangeAttachment?.enabled||!!d.bracket?.enabled);
 blocks.push(H('SPECIAL INSPECTIONS (IBC 1704, 1705 / AISC 360 CHAPTER N)'),T(['ITEM','REQUIREMENT','FREQ.'],[
  ['STATEMENT','STATEMENT OF SPECIAL INSPECTIONS BY THE ENGINEER OF RECORD (IBC 1704.3); APPROVED AGENCY RETAINED BY THE OWNER (IBC 1704.2)','-'],
  ['FABRICATOR','AISC-CERTIFIED FABRICATOR, OR SHOP INSPECTION BY THE APPROVED AGENCY (IBC 1704.2.5)','-'],
  ['MATERIAL','MILL CERTIFICATES: STEEL, BOLTS, NUTS, WASHERS, WELD FILLER','P'],
  ['WELDING','AISC N5.4 TASKS BEFORE, DURING AND AFTER WELDING; QUALIFIED WPS AND WELDERS','O / P'],
  ['NDT',`${cjpWelds?'UT ALL CJP GROOVE WELDS; ':''}MT FILLETS ON CYCLIC DETAILS AS NOTED`,'P'],
  ['BOLTING',`AISC N5.6 TASKS; PRETENSION VERIFICATION PER RCSC; FAYING SURFACE CLASS${d&&(tieRelease(p)||activeEndBearing(p))?'; SLEEVE LENGTHS AND SLOT TRAVEL AT SLEEVED BOLTS':''}`,'O / P'],
  ...(p.existingColumn?.isNew&&p.existingColumn.enabled?[]:[['EXISTING STEEL','FIELD-VERIFY SIZES, CONDITION AND WELDABILITY BEFORE WORK','P']]),
  ...(fieldWelds?[['FIELD WELDS TO EXISTING STEEL',`CARBON EQUIVALENT AND PREHEAT PER THE APPROVED WPS; VISUAL AND MT OF EVERY FIELD WELD TO EXISTING STEEL${columnStiffenerGeometry(p)?', INCLUDING THE COLUMN STIFFENER WELDS':''}`,'P']]:[]),
  ...(d&&columnStiffenerGeometry(p)?[['COLUMN STIFFENERS',`FIT-UP AT THE BRACKET FORCE LEVELS WITH THE CORNER CLIPS CLEAR OF THE COLUMN FILLETS${supportColumn(p).field?' (SURVEY THE COLUMN AT BOTH LEVELS FIRST)':''}; VISUAL OF EVERY STIFFENER WELD, MT OF THE FLANGE FILLETS`,'P']]:[]),
  ...(d?[['FIELD WELDS',`RAIL KEEPERS AND ANCHORS${p.columnBase?.enabled&&p.existingColumn?.isNew?', ANCHOR ROD PLATE WASHERS':''}: VISUAL OF EVERY WELD; MT AT THE KEEPER WELD ENDS`,'P']]:[]),
  ...(seismic341?[['SEISMIC (IBC 1705.12.1.1, 1705.13.1.1)','NEW COLUMNS, BASE PLATES AND THEIR WELDS: QUALITY ASSURANCE PER AISC 341 CHAPTER J; CRANE-LEVEL ROD BRACING EXEMPT (R = 3)','O / P']]:[]),
  ...(p.columnBase?.enabled&&p.existingColumn?.isNew?[['FOUNDATIONS (IBC 1705.3, 1705.6)','REINFORCEMENT AND ANCHOR ROD PLACEMENT; BEARING SOIL VERIFIED BEFORE CONCRETE','P'],['CONCRETE (IBC 1705.3)','SAMPLING AND TESTING OF FRESH CONCRETE; PLACEMENT','C']]:[]),
  ['RAIL / RUNWAY','ALIGNMENT, GAUGE AND LEVEL SURVEY AFTER ERECTION','P'],
  ...(d?[['PROJECT REQUIREMENTS',d.fabrication.inspection.toUpperCase(),'-']]:[])
 ],[1.05,2.45,.5]),P('STEEL: O OBSERVE, P PERFORM (AISC 360 N5). CONCRETE AND SOILS: C CONTINUOUS, P PERIODIC (IBC TABLE 1705.3).'));
 blocks.push(H('SUBMITTALS'),...N([
  'SHOP AND ERECTION DRAWINGS FOR ALL NEW STEEL, SHOWING HOLES, SLOTS, WELDS AND FIELD WORK.',
  'CRANE MANUFACTURER WHEEL LOADS, WHEEL SPACING, BUMPER FORCE AND RAIL REQUIREMENTS, SIGNED BY THE MANUFACTURER.',
  'WELDING PROCEDURE SPECIFICATIONS, WELDER QUALIFICATIONS AND BOLT CERTIFICATIONS.',
  'RAIL SURVEY AND CRANE LOAD-TEST REPORT.',
  // IBC 1704.4: each contractor responsible for a main seismic force-resisting system submits a statement.
  ...(seismic341?['CONTRACTOR STATEMENT OF RESPONSIBILITY (IBC 1704.4) FOR THE NEW COLUMNS, BASE PLATES AND THEIR WELDS, THE SEISMIC FORCE-RESISTING SYSTEM ACROSS THE RUNWAY.']:[])
 ]));
 // Items this package does not design are listed for the building official as deferred or by others.
 const bypass=p.cranes.some(c=>c.design?.bumperBypassesGirder),support=s.checks.find(c=>c.id==='tie-move-support');
 const deferred=[
  'CRANE, END TRUCKS, CRANE-MOUNTED BUMPERS, CONDUCTOR BARS AND ELECTRIFICATION: CRANE SUPPLIER.',
  ...(bypass?['BUILDING-MOUNTED CRANE END STOPS AND THEIR SUPPORT FOR THE BUMPER FORCE IN THE CRANE DATA.']:[]),
  ...(!bypass&&!activeEndStop(p)?['RUNWAY END STOPS AT EACH END OF EACH RUNWAY FOR THE BUMPER FORCE IN THE CRANE DATA.']:[]),
  ...(!d?.bracket?.enabled&&!activeColumnCap(p)?[`COLUMN BRACKETS AND THEIR ATTACHMENT TO THE BUILDING COLUMNS FOR THE ${d&&s.detailResults?`${bracketForcesAt(s,'cover','ON THIS SHEET')} AND THE UNFACTORED SUPPORT REACTIONS LISTED`:'SUPPORT REACTIONS LISTED'}${support?.capacity!==undefined?`, WITH VERTICAL DEFLECTION AT THE BEARING UNDER CRANE LOADS ${len(support.capacity)} MAX.`:'.'}`]:[]),
  ...(p.system==='simple'&&d&&!activeEndBearing(p)?[`COLUMN-SIDE LOCATING AND GUIDED HOLD-DOWN ATTACHMENTS AT GIRDER ENDS (${detailRef(detailTitles.movement)}) FOR THE LONGITUDINAL, LATERAL AND UPLIFT FORCES IN THE ${bracketForcesAt(s,'cover','ON THIS SHEET')}.`]:[]),
  ...s.checks.filter(c=>c.status==='excluded'&&delegatedChecks.has(c.id)&&c.id!=='bracket-load-path'&&c.id!=='tie-move-support').map(c=>`${c.title}: BY THE BRACKET DESIGNER FOR THE REPORTED FORCES.`)
 ];
 blocks.push(H('DEFERRED SUBMITTALS / BY OTHERS'),P('SUBMIT THE FOLLOWING TO THE ENGINEER OF RECORD FOR REVIEW AND TO THE BUILDING OFFICIAL FOR APPROVAL BEFORE INSTALLATION:'),...N(deferred));
 // Structure the calculation does not check is evaluated for the permit; it is not a deferred submittal.
 const unchecked=unevaluatedStructure(s),isNew=!!p.existingColumn?.isNew,reference=p.drawing?.existingEvaluation?.trim();
 if(unchecked.length){
  const checked=[...(p.existingColumn?.enabled?[isNew?'THE NEW RUNWAY COLUMNS':'THE EXISTING RUNWAY COLUMN']:[]),...(p.longitudinalBracing?.enabled?['THE LONGITUDINAL BRACING RODS']:[]),...(usesExistingBracket(p)?['THE REUSED EXISTING BRACKETS']:[])];
  blocks.push(H(isNew?'STRUCTURE NOT CHECKED HERE · WITH THE PERMIT SUBMITTAL':'EXISTING STRUCTURE EVALUATION · WITH THE PERMIT SUBMITTAL'),
   P(`${checked.length?`THE CALCULATION REPORT CHECKS ${checked.join(', ').replace(/, ([^,]*)$/,' AND $1')} FOR THE ADDED CRANE LOADS. `:''}THE ENGINEER OF RECORD SHALL EVALUATE THE FOLLOWING FOR THE FORCES IN THE CALCULATION REPORT AND INCLUDE THE EVALUATION IN THE PERMIT SUBMITTAL; THEY ARE NOT DEFERRED SUBMITTALS. EVALUATION: ${reference?reference.toUpperCase():'NOT REFERENCED; THE SET IS NOT ISSUED UNTIL IT IS'}.`),
   ...N(unchecked.map(c=>c.title.toUpperCase()+'.')));
 }
 blocks.push(legend(t,p.units));
 blocks.push(H('ABBREVIATIONS'),P('(E) EXISTING · (N) NEW · C/L CENTERLINE · EL. ELEVATION · T.O.S. TOP OF STEEL · T.O.R. TOP OF RAIL · TYP. TYPICAL · U.N.O. UNLESS NOTED OTHERWISE · SC SLIP-CRITICAL · STD STANDARD HOLE · SSL / LSL SHORT / LONG SLOT · CJP COMPLETE JOINT PENETRATION · FW FIELD WELD · REF. REFERENCE (EXISTING OR BY OTHERS)'));
 blocks.push(H('ISSUE'),P(`${status.label}${status.reasons.length?`: ${status.reasons.join('; ')}.`:'.'} CALCULATION REVISION ${s.revision}.`));
 return blocks;};
 // Largest legible text that fits (body 5/32 in down to 0.09 in), with the columns balanced to the
 // shortest height that still fits.
 let placed:ReturnType<typeof flow>;
 const style=(body:number):Style=>({width:columnWidth,body,leading:body*1.31,heading:body*1.3,caps:capsFor(u)});
 for(const body of [11.25,10.5,9.75,9,8.6,8.2,7.8,7.4,7,6.6]){
  const blocks=build(style(body));
  for(let h=Math.max(...blocks.map(b=>b.height))+top;h<=limits[0]+.01&&!placed;h+=4)placed=flow(blocks,h);
  if(placed)break;
 }
 let svg=sheetStart(s,'S-00','COVER, GENERAL NOTES & DESIGN CRITERIA')+`<g data-view="cover">`;
 // Content that cannot fit is drawn at the smallest size and marked so set checks report it.
 if(!placed){placed=flow(build(style(6.6)),limits[0],true)!;svg+='<g data-overflow="cover"/>';}
 for(const v of placed)svg+=v.b.render(v.x,v.y);
 // Column rules run to the foot of the longest column.
 const foot=Math.max(...placed.map(v=>v.y+v.b.height))+10;
 for(const x of columns.slice(1))if(placed.some(v=>v.x===x))svg+=line([x-18,top-6],[x-18,foot],'divider');
 svg+=`</g>`;
 return svg+titleBlock(s,'S-00','COVER, GENERAL NOTES & DESIGN CRITERIA')+'</svg>';
}

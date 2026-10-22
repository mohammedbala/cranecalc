import {haunchInput,isTaperedHaunch} from '../engine/taperedHaunchInputs';
import {cantileverSystems,seismicBasis,acrossRunwaySeismic} from '../engine/runwaySeismic';
import {tiedToBuilding} from '../engine/craneColumnInputs';
import {buildingColumnProject} from '../engine/craneColumn';
import {craneColumnCoverBlocks,craneColumnTitles} from './craneColumnSheet';
import {astmSpec,boltSpec,sleeveSpec} from '../engine/materialSpecs';
import {boltGrades,preheatBasis,constructionRequirements,enteredFabricationNote,addedSentences,cjpWelds,awsEdition} from '../engine/constructionNotes';
import {codeBasis} from '../engine/drawingData';
import {adjacentBays} from '../engine/continuation';
import type {CalculationSnapshot,Crane,ProjectInput} from '../engine/types';
import {weldingBasisLabel,weldsToExistingColumn} from '../engine/existingWelding';
import {format,toDisplay,unit} from '../engine/units';
import {craneDesignMinimum,craneCombinations,combinationLabel,combinationOmissions} from '../engine/aistLoads';
import {deflectionCriteria} from '../engine/aistChecks';
import {buildingClassBasis} from '../engine/buildingClass';
import {runwayElevations,issueStatus,revisionIdentity,supportColumn,delegatedChecks,unevaluatedStructure} from '../engine/drawingData';
import {activeEndStop,stopLocation} from '../engine/endStopInputs';
import {railJointType} from '../engine/railLayout';
import {supplierRailJointText,fatigueCycleFamilies} from '../engine/railChecks';
import {selectionFinal,selectionView} from '../report/designSummary';
import {activeEndBearing} from '../engine/endBearingInputs';
import {usesExistingBracket} from '../engine/existingBracket';
import {usesRolledBracket,projectStub} from '../engine/rolledBracket';
import {usesTaperedHaunch} from '../engine/taperedHaunch';
import {columnStiffenerGeometry} from '../engine/columnStiffeners';
import {activeColumnCap} from '../engine/columnCapInputs';
import {activeStep} from '../engine/steppedColumnInputs';
import {stepGeometry} from '../engine/steppedColumn';
import {stepStiffenerHeight} from '../engine/stepSeat';
import {steppedColumnTitles} from './steppedColumnSheet';
import {spliceLayout,activeSplices} from '../engine/spliceInputs';
import {spliceTitles} from './spliceSheet';
import {drawingLength,drawingElevation,electrodeClass,plateInches,dimensionLength,specGrade,limitLength} from './drawingFormat';
import {railPad} from '../engine/railSeat';
import {line,text,circle,rect,bubble,filletLeader,fieldFilletLeader,dimH,n,sheetStart,titleBlock,detailRef,detailTitles,wrapToWidth,textWidth,lettering} from './sheetGraphics';
import {heading,paragraph,numbered,table,capsFor,flowBlocks,fitColumns,type Block,type Style} from './noteBlocks';
import {structuralGeneralNotes} from './structuralNotes';
import {existingLayout} from '../engine/existingLayout';
import {tieRelease,stiffenerTieGeometry,stiffenerTieJoint,flangeTieGeometry} from '../engine/tieGeometry';
import {bearingSurface} from '../engine/endBearing';
import {designsBracing,bracingDesign,bracedSeismicSystem} from '../engine/newColumnBracing';
import {bracketForceBlocks,bracketForceTopic,bracketForcesAt} from './bracketForceTable';
import {deliveredRows,deliveredHeadersOf,deliveredNote} from '../report/deliveredTable';
import {blockedPackage,verificationFailures} from './sheetRatios';
import {unplacedHolds} from './detailHolds';
import {sig3} from '../report/reportParts';
import {supportReactions} from '../engine/supportReactions';
import {footingReactionText} from '../engine/craneColumn';

/** A sheet of the set as the cover indexes it, with the titles of its details in drawing order. */
export interface SheetEntry {number:string;title:string;details?:readonly string[];render?:()=>string}
/** Abbreviations the set may use; the cover lists those its sheets use. */
const abbreviationList:[RegExp,string][]=[
 [/\(E\)/,'(E) EXISTING'],[/\(N\)/,'(N) NEW'],[/\bBOT\./,'BOT. BOTTOM'],[/\bBRG\./,'BRG. BEARING'],[/\bC\/L\b/,'C/L CENTERLINE'],
 [/\bCJP\b/,'CJP COMPLETE JOINT PENETRATION'],[/\bCLR\./,'CLR. CLEAR'],[/\bCOL\./,'COL. COLUMN'],[/\bCOMB\./,'COMB. LOAD COMBINATION'],
 [/\bCONT\./,'CONT. CONTINUOUS'],[/\bD\/C\b/,'D/C DEMAND / CAPACITY RATIO'],[/\bEA\./,'EA. EACH'],[/\bED\./,'ED. EDITION'],[/\bEL\./,'EL. ELEVATION'],[/\bFIG\./,'FIG. FIGURE'],
 [/\bFB\b/,'FB FLAT BAR'],[/\bFL\./,'FL. FLANGE'],[/\bFREQ\./,'FREQ. FREQUENCY'],[/\bFW\b/,'FW FIELD WELD'],[/\bGR\./,'GR. GRADE'],[/\bHORIZ\./,'HORIZ. HORIZONTAL'],
 [/\bLONG\.(?!\w)/,'LONG. LONGITUDINAL'],[/\bLSL\b/,'LSL LONG-SLOTTED HOLE'],[/\bMAX\./,'MAX. MAXIMUM'],[/\bMIN\./,'MIN. MINIMUM'],
 [/\bMT\b/,'MT MAGNETIC PARTICLE TESTING'],[/\bNDT\b/,'NDT NONDESTRUCTIVE TESTING'],[/\bO\.C\./,'O.C. ON CENTER'],[/\bOD\b/,'OD OUTSIDE DIAMETER'],[/\bPL\b/,'PL PLATE'],[/\bQTY\b/,'QTY QUANTITY'],
 [/\bREF\./,'REF. REFERENCE (EXISTING OR BY OTHERS)'],[/\bSC\b/,'SC SLIP-CRITICAL'],[/\bSSL\b/,'SSL SHORT-SLOTTED HOLE'],[/\bSTD\b/,'STD STANDARD HOLE'],
 [/\bSTIFF\./,'STIFF. STIFFENER'],[/\bT\.O\.(?= )/,'T.O. TOP OF'],[/\bT\.O\.R\./,'T.O.R. TOP OF RAIL'],[/\bT\.O\.S\./,'T.O.S. TOP OF STEEL'],
 [/\bTHRU\b/,'THRU THROUGH'],[/\bTYP\./,'TYP. TYPICAL'],[/\bU\.N\.O\./,'U.N.O. UNLESS NOTED OTHERWISE'],[/\bUT\b/,'UT ULTRASONIC TESTING'],
 [/\bWPS\b/,'WPS WELDING PROCEDURE SPECIFICATION']];
/** The words of a sheet: its text elements, with detail and sheet references decoded. */
const sheetWords=(svg:string)=>[...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(m=>m[1].replace(/<[^>]+>/g,'')).join(' ')
 .replace(/\{\{(?:REF|SHEET):([^}]*)\}\}/g,(_,v:string)=>decodeURIComponent(v)).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
// Four note columns in the ARCH D drawing area at content scale 1 (layout units print at 1/72 in).
// The last column stops above the seal and issue labels at the lower right.
const columnWidth=594,columns=[0,1,2,3].map(i=>14+i*(columnWidth+40)),top=18,limits=[1494,1494,1494,1318];
/** Symbols and line types used on the sheets, each drawn as it appears with its meaning. */
function legend(t:Style,units:'US'|'SI',referenceDims=false,welds=true):Block{
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
  ...(welds?[[(x:number,y:number)=>filletLeader([[x+2,y+8]],[x+22,y+3],leg,[],false),'FILLET WELD, ARROW SIDE; SIZE LEFT OF THE SYMBOL'],
  [(x:number,y:number)=>filletLeader([[x+2,y+8]],[x+22,y+3],leg,[],true),'FILLET WELD, BOTH SIDES'],
  [(x:number,y:number)=>fieldFilletLeader([[x+2,y+8]],[x+22,y+3],leg,[],true),'FIELD WELD (FLAG); SHOP WELD U.N.O.']] as [(x:number,y:number)=>string,string][]:[]),
  [(x,y)=>`${line([x,y],[x+40,y])}<path class="leader-arrow" d="M${n(x+40)},${n(y)}l-2.4,-3.2h4.8z"/>${line([x+40,y],[x+50,y-6])}${line([x+50,y-6],[x+56,y-6])}${text(x+60,y-3,'EL.',7.5)}`,'ELEVATION DATUM'],
  ...(referenceDims?[[(x:number,y:number)=>text(x+4,y+3,units==='SI'?'(350 mm)':'(1\'-2")',9),'REFERENCE DIMENSION (SECTION DEPTH OR A SIZE SET BY OTHER DIMENSIONS); NOT A SETTING-OUT DIMENSION'] as [(x:number,y:number)=>string,string]]:[])
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
 * Greedy column flow over the four columns of each of `pages` sheets (flowBlocks): a heading stays with the block after
 * it, and a section carried into the next column restarts under its heading marked continued. Returns undefined when the
 * blocks do not fit.
 */
function flow(blocks:Block[],limit:number,overflow=false,pages=1){
 const lanes=Array.from({length:4*pages},(_,i)=>({x:columns[i%4],top,bottom:limits[i%4]}));
 return flowBlocks(blocks,lanes,limit,overflow)?.map(v=>({...v,page:Math.floor(v.lane/4)}));
}

/** The girder is spliced in the field: splices are active and placed. */
const spliced=(p:ProjectInput)=>{const l=spliceLayout(p);return !l.errors.length&&l.stations.length>0;};
export const coverSheetTitle='COVER, GENERAL NOTES & DESIGN CRITERIA';
/** The cover's title: an analysis-only set has no general notes or design criteria. */
export const coverTitleFor=(p:ProjectInput)=>p.scope==='analysis'?'COVER, ANALYSIS BASIS & INTERFACE REQUIREMENTS':coverSheetTitle;
/** The specified field-welding requirements for the existing columns, from the calculation's welding checks. */
/** Existing-building notes of a stepped column: the step's survey source and the items to survey at every step. */
function stepSurvey(p:ProjectInput){
 const st=activeStep(p);if(!st)return [];
 return [`EXISTING STEP: ${st.source||'SOURCE NOT ENTERED'}.`,
  `SURVEY AT EVERY STEPPED COLUMN BEFORE FABRICATION (${detailRef(steppedColumnTitles.elevation)}): LOWER AND UPPER SHAFT SIZES AND PLATE THICKNESSES, THE STEP ELEVATION, THE STEP CAP THICKNESS, LEVEL AND FLATNESS UNDER THE BEARING, THE CAP-TO-SHAFT WELDS, THE UPPER SHAFT POSITION ON THE CAP AND ITS PLUMB, AND THE LOWER WEB${stepGeometry(p)?.stiffener?' AT THE STEP STIFFENERS':''}; REPORT DIFFERENCES TO THE ENGINEER OF RECORD.`];
}
/** The stepped column schedule: one row, every grid on both runways (the configurator's columns are alike). */
function stepSchedule(p:ProjectInput){
 const g=stepGeometry(p),c=p.existingColumn;if(!g||!c)return undefined;
 const u=p.units,dim=(v:number)=>dimensionLength(v,u),size=(v:number)=>plateInches(v,u),datum=p.drawing?.datumElevation??0,el=(v:number)=>drawingElevation(datum+v,u);
 const sf=g.stiffener;
 // One mark: the configurator's columns are alike at every grid of both runways.
 return [['MARK / GRIDS',`SC1: GRIDS 1-${p.spans.length+1}, BOTH RUNWAYS (A, B)`],['LOWER SHAFT (E)',g.lower.shape||`${size(g.lower.d)} X ${size(g.lower.bf)} PLATES`],['UPPER SHAFT (E)',`${g.upper.shape||`${size(g.upper.d)} X ${size(g.upper.bf)} PLATES`}, OUTER FLANGES FLUSH`],
  ['STEP / TOP EL. (E)',`${el(c.seatElevation)} / ${el(c.height)}`],['STEP CAP (E)',`PL ${size(g.cap.thickness)} X ${dim(g.cap.width)} X ${dim(g.cap.length)}`],
  ['GIRDER WEB (e)',`${dim(g.girderWeb)} FROM THE LOWER C/L, OVER THE CRANE-SIDE FLANGE`],['STEP STIFFENERS (NEW)',sf?`2 PL ${size(sf.thickness)} X ${size(sf.width)} X ${dim(stepStiffenerHeight(g))}, FIELD WELDED TO THE (E) WEB`:'NONE REQUIRED']];
}
function existingWeldNote(p:ProjectInput){
 if(!weldsToExistingColumn(p))return [];
 const w=p.existingColumn!.welding,heat=preheatBasis(p)!;
 const steel=w&&w.basis!=='not-established'&&w.grade.trim()?`${specGrade(w.grade.toUpperCase())} (${weldingBasisLabel[w.basis].toUpperCase()})`:'TO BE IDENTIFIED BEFORE WELDING';
 // One thickness basis with the calculation and the bracket sheet: the thickest part at the weld (preheatBasis).
 return [`FIELD WELDS TO THE EXISTING COLUMNS: EXISTING STEEL ${steel}. WELD ONLY TO A WPS APPROVED BY THE ENGINEER OF RECORD FOR THAT STEEL; LOW-HYDROGEN PROCESSES ONLY. ${heat.text.toUpperCase()}. WELD WITH THE CRANE OUT OF SERVICE AND THE COLUMN UNDER DEAD LOAD ONLY; SEQUENCE THE WELDS TO LIMIT HEAT INPUT.`];
}
/**
 * Sheets that continue the cover's notes when they do not fit the cover at the lettering size: S-00A, S-00B, numbered
 * after the cover so the sheet numbers the notes and details refer to stay as they are.
 */
export const coverContinuation=(page:number)=>({number:`S-00${String.fromCharCode(64+page)}`,title:'GENERAL NOTES & DESIGN CRITERIA (CONT.)'});
/** The cover sheet (S-00): general notes, design criteria, the crane data, the sheet and detail indexes. */
export function coverSheetSvg(s:CalculationSnapshot,sheets:SheetEntry[]){return coverSheetSvgs(s,sheets)[0];}
/**
 * Sheets the cover's notes take at the lettering size: one, or more when they do not fit it. Counted without drawing the
 * other sheets, with every abbreviation and symbol the set may use, so it is never fewer than the notes need.
 */
export function coverSheetCount(s:CalculationSnapshot,sheets:SheetEntry[]){
 for(let pages=1;;pages++){
  const blocks=coverBlocks(s,sheets,undefined,true,pages)(coverStyle(s.input.units,lettering.text));
  if(pages>=4||flow(blocks,Infinity,false,pages))return pages;
 }
}
const coverStyle=(u:'US'|'SI',body:number):Style=>({width:columnWidth,body,leading:body*1.31,heading:body*1.3,caps:capsFor(u)});
/**
 * The cover and the sheets continuing its notes: the notes at the largest text size that fits (body 5/32 in down to the
 * 3/32 in lettering minimum), on one sheet with its columns balanced to the shortest height that still fits; notes that
 * do not fit the cover at the minimum continue on the next sheets, never smaller, filling the cover first.
 */
export function coverSheetSvgs(s:CalculationSnapshot,sheets:SheetEntry[],pages=coverSheetCount(s,sheets)){
 const otherWords=sheets.map(v=>v.render?sheetWords(v.render()):'').join(' '),referenceDims=sheets.some(v=>v.render&&v.render().includes('data-dim="ref"'));
 const build=coverBlocks(s,sheets,otherWords,referenceDims,pages),u=s.input.units;
 let placed:ReturnType<typeof flow>;
 for(const body of [11.25,10.5,9.75,lettering.text]){
  const blocks=build(coverStyle(u,body));
  // One sheet: its columns balanced; notes continued on further sheets fill the cover first.
  if(pages>1)placed=flow(blocks,limits[0],false,pages);
  else for(let h=Math.max(...blocks.map(b=>b.height))+top;h<=limits[0]+.01&&!placed;h+=4)placed=flow(blocks,h,false,pages);
  if(placed)break;
 }
 // Content that cannot fit is drawn at the minimum size and marked so set checks report it.
 let overflow=false;
 if(!placed){placed=flow(build(coverStyle(u,lettering.text)),limits[0],true,pages)!;overflow=true;}
 return Array.from({length:pages},(_,page)=>{
  const number=page?coverContinuation(page).number:'S-00',title=page?coverContinuation(page).title:coverTitleFor(s.input),here=placed!.filter(v=>v.page===page);
  let svg=sheetStart(s,number,page?`CRANE RUNWAY / ${title}`:title)+`<g data-view="${page?'cover-continued':'cover'}">`;
  if(overflow&&page===pages-1)svg+='<g data-overflow="cover"/>';
  for(const v of here)svg+=v.b.render(v.x,v.y);
  // Column rules run to the foot of the longest column.
  const foot=Math.max(top,...here.map(v=>v.y+v.b.height))+10;
  for(const x of columns.slice(1))if(here.some(v=>v.x===x))svg+=line([x-18,top-6],[x-18,foot],'divider');
  // Notes continued on the next sheet say so at the foot of the last column.
  if(page<pages-1)svg+=text(columns[3],limits[3]+18,`GENERAL NOTES CONTINUE ON SHEET ${coverContinuation(page+1).number}.`,lettering.text,'start',700);
  svg+=`</g>`;
  // No scaled view on the cover.
  return svg+titleBlock(s,number,title,'NONE')+'</svg>';
 });
}
/** The cover's note blocks at a style; `otherWords` are the words of the other sheets (undefined: every abbreviation). */
function coverBlocks(s:CalculationSnapshot,sheets:SheetEntry[],otherWords:string|undefined,referenceDims:boolean,pages:number){
 const p=s.input,u=p.units,d=p.details,f=(v:number|undefined,q:Parameters<typeof format>[1]='force')=>format(v,q,u,2),len=(mm:number)=>dimensionLength(mm,u),tol=(mm:number)=>plateInches(mm,u);// tolerances in inches (1/8"), not feet and inches
 const ksi=(v:number)=>format(v,'stress',u,u==='SI'?0:3),status=issueStatus(s),elevations=runwayElevations(p);
 const capacity=(N:number)=>u==='US'?`${+(N/8896.443).toFixed(2)} ton (${f(N)})`:`${+(N/9806.65).toFixed(2)} TONNES (${f(N)})`;
 const length=p.spans.reduce((a,b)=>a+b,0),cranes=(()=>{
  // Identical cranes read once with their count: "two 5 ton (10 kip) maintenance cranes".
  const counts=new Map<string,number>();for(const c of p.cranes){const k=c.design?`${capacity(c.design.ratedLoad)} ${c.design.type} crane`:c.name;counts.set(k,(counts.get(k)??0)+1);}
  return [...counts].map(([k,n])=>n===1?k:`${['','','two','three'][n]??n} ${k.endsWith('crane')?`${k}s`:`× ${k}`}`).join(' and ');})();
const isNew=!!(p.existingColumn?.enabled&&p.existingColumn.isNew),tied=tiedToBuilding(p);
 // A crane column tied to the building column (craneColumn.ts): the building column receives the tie forces; welds to it are
 // checked on its projection (buildingColumnProject).
 const onBuilding=tied?buildingColumnProject(p):p;
 const supports=isNew?`new ${tied?'':'freestanding '}${p.existingColumn!.shape||'built-up'} ${tied?'crane':'runway'} columns${d?.bracket?.enabled?' with welded brackets':activeColumnCap(p)?' with column caps, the girders bearing directly on the columns':''}${p.columnBase?.enabled?', base plates, anchor rods and spread footings':''}${tied?', each tied across the runway to the existing building column beside it by the girder tie and a column tie':''}`:d?.bracket?.enabled?(usesExistingBracket(p)?'existing column brackets with new bolted seats':'new brackets welded to the existing building columns'):p.aist?.supportType==='column'?'independent runway columns':'the building columns';
 const scope=`Furnish and install one crane runway, two identical girder lines (grid B opposite hand to grid A), each ${len(length)} long in ${p.spans.length} ${p.system==='continuous'?'continuous':'simple'} span${p.spans.length>1?'s':''}, for ${cranes}: ${p.section.name}${p.section.kind==='cap'?' capped':''} runway girders, rail, rail attachments, end stops and connections, supported on ${supports}.${tied?' The crane columns carry the runway vertical loads; the existing building columns take only the horizontal forces of the ties, checked in the calculation as the building column.':isNew?' The new columns carry only the crane and runway; the existing building carries no crane load.':p.existingColumn?.enabled?' The existing column receiving the runway is checked for the added crane reactions.':''}${p.longitudinalBracing?.enabled?(designsBracing(p)?' The new crane-level rod X-bracing, its strut, gussets, pins and the braced columns and footings are designed for crane traction, stop and seismic forces along the runway.':` The ${isNew?'new':'existing'} crane-level longitudinal bracing is checked for crane traction and stop forces.`):''}`;
 const build=(t:Style)=>{
 const written:string[]=[],H=(v:string)=>{written.push(v);return heading(t,v);},N=(v:string[])=>{written.push(...v);return numbered(t,v);},P=(v:string)=>{written.push(v);return paragraph(t,v);},T=(h:string[],r:string[][],w:number[])=>{written.push(...h,...r.flat());return table(t,h,r,w);};
 const blocks:Block[]=[];
 if(p.scope==='analysis'){
  blocks.push(...analysisBlocks(s,{t,H,N,P,T,len,f}));
  blocks.push(H('SHEET INDEX'),T(['SHEET','TITLE'],[['S-00',coverTitleFor(p)],...Array.from({length:pages-1},(_,i)=>[coverContinuation(i+1).number,coverContinuation(i+1).title]),...sheets.map(v=>[v.number,v.title])],[.7,3.3]));
  const details=sheets.flatMap(v=>(v.details??[]).map(t=>[detailRef(t),t]));
  if(details.length)blocks.push(H('DETAIL INDEX'),T(['DETAIL','TITLE'],details,[.7,3.3]));
  blocks.push(legend(t,p.units,referenceDims,false));
  const used=`${written.join(' ')} ${otherWords}`,abbreviations=abbreviationList.filter(([re])=>otherWords===undefined||re.test(used)).map(([,v])=>v);
  if(abbreviations.length)blocks.push(H('ABBREVIATIONS'),P(abbreviations.join(' · ')));
  blocks.push(H('ISSUE'),P(`${status.label}${status.reasons.length?`: ${status.reasons.join('; ')}.`:'.'} ${revisionIdentity(s).heading}.`.toUpperCase()));
  return blocks;
 }
 blocks.push(H('SCOPE OF WORK'),P(scope));
 blocks.push(H('GENERAL NOTES'),...N([
  ...structuralGeneralNotes(s),
  // A package whose analysis did not verify has no calculation report: the drawings point at the diagnostic report.
  blockedPackage(s)?'NO CALCULATION REPORT IS ISSUED FOR THESE DRAWINGS: THE ANALYSIS DID NOT VERIFY (SEE THE DIAGNOSTIC REPORT OF THE SAME REVISION). NO SIZE OR RATIO SHOWN IS CONFIRMED BY CALCULATION; DO NOT FABRICATE.':'THESE DRAWINGS AND THE CALCULATION REPORT OF THE SAME REVISION FORM ONE PACKAGE. WHERE THEY DIFFER, THE MORE STRINGENT REQUIREMENT GOVERNS UNTIL CLARIFIED BY THE ENGINEER OF RECORD.',
  'ALL WORK SHALL CONFORM TO THE BUILDING CODE ADOPTED BY THE AUTHORITY HAVING JURISDICTION AND THE STANDARDS LISTED UNDER DESIGN CRITERIA.',
  // Millimeter values of imperial products are conversions, not metric product sizes.
  ...(u==='SI'?['DIMENSIONS ARE IN MILLIMETERS AND ELEVATIONS IN METERS. BOLT, PLATE, WELD AND SECTION SIZES ARE THOSE OF THE DESIGN; WHERE A SIZE IS AN IMPERIAL PRODUCT SHOWN IN MILLIMETERS (FOR EXAMPLE A 3/4 IN BOLT SHOWN AS 19 MM), FURNISH THAT PRODUCT. SUBSTITUTE METRIC PRODUCTS ONLY AFTER THE ENGINEER OF RECORD RECALCULATES WITH THEIR SIZES.']:[])
 ]));
 const existing=p.existingColumn?.enabled||p.longitudinalBracing?.enabled||d?.bracket?.enabled||p.aist?.supportType==='bracket';
 // Notes on cutting, welding and shoring existing steel apply where the runway attaches to the building.
 const onExisting=!supportColumn(p).isNew;
 const surveyed=existingLayout(p);
 if(existing)blocks.push(H('EXISTING BUILDING NOTES'),...N([
  'EXISTING CONSTRUCTION IS SHOWN DASHED AND IS BASED ON THE SURVEY AND SOURCES LISTED BELOW. FIELD VERIFY MEMBER SIZES, CONDITION, PLUMBNESS AND ELEVATIONS BEFORE FABRICATION AND REPORT DIFFERENCES TO THE ENGINEER OF RECORD.',
  ...(onExisting||tied?[`DO NOT CUT, DRILL OR WELD EXISTING STEEL UNTIL ITS MATERIAL IS CONFIRMED (MILL CERTIFICATES OR CHEMICAL ANALYSIS, AISC 360-16 APPENDIX 5.2.3)${existingWeldNote(onBuilding).length?'.':' AND THE WPS FOR IT IS APPROVED. REMOVE COATINGS AND PREHEAT AS REQUIRED BY THE APPROVED WPS.'}`,
  ...existingWeldNote(onBuilding),
  'SHORE OR UNLOAD EXISTING MEMBERS AS REQUIRED BY THE ERECTION PROCEDURE. DO NOT REMOVE EXISTING BRACING WITHOUT A TEMPORARY REPLACEMENT APPROVED BY THE ENGINEER.',
  ...(tied?[`${surveyed?`THE EXISTING BUILDING COLUMNS AND FOOTINGS ON S-01 ARE FROM ${surveyed.source||'A SURVEY NOT YET IDENTIFIED'}. CONFIRM THEM`:'LOCATE THE EXISTING BUILDING COLUMNS AND FOOTINGS'} AND LOCATE SLABS AND BURIED UTILITIES BY SURVEY BEFORE LAYOUT. THE CRANE COLUMN FOOTINGS ARE COORDINATED WITH THE EXISTING FOOTINGS (${detailRef('FOOTING / PLAN')}); DO NOT UNDERMINE OR CUT AN EXISTING FOOTING.`]:[])]:[
   `${surveyed?`THE EXISTING COLUMNS AND FOOTINGS ON S-01 ARE FROM ${surveyed.source||'A SURVEY NOT YET IDENTIFIED'}. CONFIRM THEM AND LOCATE SLABS`:'LOCATE THE EXISTING COLUMNS, FOOTINGS, SLABS'} AND BURIED UTILITIES BY SURVEY BEFORE LAYOUT. KEEP THE NEW FOOTINGS ${surveyed?`${len(surveyed.footingClear)} MIN. `:''}CLEAR OF EXISTING FOOTINGS AND THE NEW STEEL CLEAR OF THE EXISTING BUILDING BY THE SEPARATION SHOWN ON S-01; REPORT CONFLICTS TO THE ENGINEER OF RECORD BEFORE EXCAVATION.`]),
  ...(p.existingColumn?.enabled&&!p.existingColumn.isNew?[`EXISTING COLUMN: ${p.existingColumn.source||'SOURCE NOT ENTERED'}.`]:[]),
  ...(tied?[`EXISTING BUILDING COLUMNS: ${p.craneColumn!.building.source||'SOURCE NOT ENTERED'}. THEY TAKE THE GIRDER TIE AND COLUMN TIE FORCES ONLY (${detailRef(craneColumnTitles.elevation)}); THE NEW CRANE COLUMNS BEAR ON NEW FOOTINGS${supportColumn(p).detailed?` (${detailRef(detailTitles.newColumn)})`:''}. SAW CUTTING AND EXCAVATION OF THE EXISTING SLAB SHALL NOT UNDERMINE EXISTING FOOTINGS; REPORT CONFLICTS TO THE ENGINEER OF RECORD.`]:[]),
  ...stepSurvey(p),
  ...(p.existingColumn?.enabled&&p.existingColumn.isNew&&!tied?[`NEW RUNWAY COLUMNS ARE INDEPENDENT OF THE EXISTING BUILDING${p.columnBase?.enabled?` AND BEAR ON NEW FOOTINGS${supportColumn(p).detailed?` (${detailRef(detailTitles.newColumn)})`:''}`:''}. SAW CUTTING AND EXCAVATION OF THE EXISTING SLAB SHALL NOT UNDERMINE EXISTING FOOTINGS; REPORT CONFLICTS TO THE ENGINEER OF RECORD.`]:[]),
  ...(p.longitudinalBracing?.enabled?[`${p.existingColumn?.isNew&&p.existingColumn.enabled?'CRANE-LEVEL':'EXISTING'} LONGITUDINAL BRACING: ${p.longitudinalBracing.source||'SOURCE NOT ENTERED'}.`]:[]),
  ...(usesExistingBracket(p)?['EXISTING BRACKETS ARE REUSED ONLY WITH THE DOCUMENTED ASSESSMENT IN THE CALCULATION REPORT.']:[]),
  ...(unevaluatedStructure(s).length?['ITEMS MARKED BY OTHERS IN THE CALCULATION REPORT (FRAME, CONNECTIONS TO EXISTING MEMBERS, ANCHORS AND FOUNDATIONS NOT CHECKED HERE) SHALL BE VERIFIED BY THE ENGINEER OF RECORD FOR THE REPORTED FORCES.']:[])
 ].map(v=>v.toUpperCase())));
 const schedule=stepSchedule(p);
 if(schedule)blocks.push(H('STEPPED COLUMN SCHEDULE'),{...T(['ITEM','VALUE'],schedule,[1.25,1.75]),keep:true},P(`EXISTING STEEL (E) PER SURVEY; SEE ${detailRef(steppedColumnTitles.elevation)}.`));
 if(d)blocks.push(H('CRANE RUNWAY INSTALLATION'),...N([
  `RAIL: ${d.rail.name.split(" · ")[0]}; GAUGE (CRANE SPAN) ${len(d.criteria.railGauge)} ± ${tol(2*d.criteria.alignmentTolerance)}, THE TOTAL OF THE SETTING TOLERANCES OF THE TWO RAILS. SET EACH RAIL C/L ON ITS GIRDER WEB C/L WITHIN ${tol(d.criteria.alignmentTolerance)} AND THE RAIL TOP WITHIN ${tol(d.criteria.levelTolerance)} OF THE THEORETICAL ELEVATION. THE DESIGN ALLOWS A RAIL-TO-WEB ECCENTRICITY OF ${tol(Math.abs(p.railEccentricity))} FOR SETTING AND WEAR; IT IS NOT A SETTING DIMENSION; IN SERVICE ${limitLength(Math.abs(p.railEccentricity)>0?Math.min(Math.abs(p.railEccentricity),.75*p.section.tw):.75*p.section.tw,u,'max')} MAX. (TR-13 §5.18). VERIFY THE GAUGE AND TOLERANCES WITH THE CRANE MANUFACTURER BEFORE SETTING RAILS.`,
  ...addedSentences(enteredFabricationNote(p,'railAlignment'),[...written,...(constructionRequirements(p).find(v=>v.key==='tolerances')?.items??[])]),
  // The rail setting clause of the TR-13 list is the note above.
  ...constructionRequirements(p).filter(v=>v.key==='tolerances').map(v=>v.items.filter(i=>!/^rail centerline set on/i.test(i)).join(' ').replace(/; (Survey)/,'. $1')),
  ...(constructionRequirements(p).find(v=>v.key==='erection')?.items.slice(1)??[]),
  ...(spliced(p)?[`COMPLETE THE GIRDER FIELD SPLICES (${detailRef(spliceTitles.elevation)}) WITH EVERY BOLT PRETENSIONED BEFORE THE RAIL IS SET; WELD THE RAIL CLIPS AT THE SPLICES AFTERWARD AND RE-VERIFY THE PRETENSION OF THE TOP FLANGE BOLTS NEAREST THE WELDS.`]:[]),
  ...(activeEndStop(p)?[`INSTALL THE RUNWAY END STOPS (${detailRef(detailTitles.endStop)}) AT ${stopLocation(p).toUpperCase()} BEFORE THE CRANE IS OPERATED OR LOAD TESTED.`]:[]),
  // The flexible plate tie works only while it can flex: no forced fit, no welds or stiffeners on its clear length.
  ...(flangeTieGeometry(p)?.plies===1?[`FLEXIBLE PLATE TIES (${detailRef(detailTitles.flangeTie)}): BOLT THE PLATE WITHOUT JACKING, HEATING OR SHIMMING TO FORCE FIT; DO NOT WELD, DRILL OR STIFFEN IT BETWEEN ITS BOLT GROUPS. INSPECT THE PLATE AND ITS BOLTS AT THE CRANE INSPECTION INTERVALS.`]:[]),
  'LOAD TEST THE CRANE PER ASME B30.2 AND THE MANUFACTURER. THE TEST LOAD SHALL NOT EXCEED 125% OF THE RATED LOAD; COORDINATE ANY TEST LOAD ABOVE THE RATED LOAD WITH THE ENGINEER OF RECORD BEFORE TESTING.'
 ].map(v=>v.toUpperCase())));
 // Column 2: criteria.
 const code=codeBasis(p);
 // New cantilever columns designed for seismic in SDC B to F fall under AISC 341 (§E5 ordinary, §E6 special).
 const seismic341=(()=>{const z=acrossRunwaySeismic(p);return z&&!z.integrityOnly?{clause:z.system==='special'?'§E6 SPECIAL CANTILEVER COLUMN SYSTEM':'§E5 ORDINARY CANTILEVER COLUMN SYSTEM'}:undefined;})();
 blocks.push(H('DESIGN CRITERIA · CODES AND STANDARDS'),T(['STANDARD','EDITION / SCOPE'],[
  ['BUILDING CODE',code.building.toUpperCase()],
  // Work on an existing building is an alteration under the existing building code adopted with it.
  ['EXISTING BUILDING CODE',`${code.entered?'IEBC OF THE SAME EDITION AS THE BUILDING CODE':'NOT ENTERED: IEBC EDITION ADOPTED WITH THE BUILDING CODE'}: ALTERATION; ${tied?'THE EXISTING BUILDING COLUMNS EVALUATED FOR THE ADDED TIE FORCES (H ONLY), SEE EXISTING STRUCTURE EVALUATION':p.existingColumn?.isNew?'THE EXISTING STRUCTURE CARRIES NO CRANE LOAD':'EXISTING STRUCTURE EVALUATED FOR THE ADDED CRANE LOADS, SEE EXISTING STRUCTURE EVALUATION'}`],
  ['ASCE/SEI 7',code.asce],
  ['AISC 360',code.aisc+', '+p.method],
  ['AIST TECHNICAL REPORT 13 (2021)','GUIDE FOR THE DESIGN AND CONSTRUCTION OF MILL BUILDINGS: RUNWAY LOADS AND CRITERIA'],
  ['AISC DESIGN GUIDE 7','3RD ED. (2019) WITH 2023 ERRATA'],
  // Welding and bolting standards are the editions the cited AISC 360 references.
  // One AWS D1.1 edition throughout: the 2020 edition, whose clause and table numbers the calculation cites.
  ['AWS D1.1/D1.1M',`${awsEdition}: STRUCTURAL WELDING CODE - STEEL (CYCLICALLY LOADED); CLAUSE AND TABLE NUMBERS CITED ARE OF THIS EDITION${code.adopted2022?'':' (AISC 360-16 REFERENCES THE 2015 EDITION)'}`],
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
  ['AIST BUILDING CLASS',a?(()=>{const k=buildingClassBasis(p);return `CLASS ${k.effective} (TR-13 TABLE 1.1, ${k.basis==='full-load'?`${k.repetitions.toLocaleString()} FULL-LOAD REPETITIONS COUNTED`:`ALL ${k.counted.toLocaleString()} LOAD CYCLES COUNTED`}${k.effective!==k.entered?`; ENTERED CLASS ${k.entered}`:''}). RUNWAY INSPECTION AT THE TR-13 APPENDIX C INTERVAL FOR CLASS ${k.effective}`;})():'-'],
  // AIST TR-13 multiple cranes: every loaded / empty arrangement, closest approach included; one crane's side thrust.
  ...(p.cranes.length>1?[['CRANES ON THE RUNWAY',`${p.cranes.length} CRANES, MIN. ${len(Math.max(...p.cranes.map(c=>c.minSeparation)))} WHEEL TO WHEEL. STRENGTH: EVERY LOADED AND EMPTY ARRANGEMENT AT ALL POSITIONS, CLOSEST APPROACH INCLUDED, WITH IMPACT ON EACH CRANE AND SIDE THRUST FROM ONE CRANE AT A TIME. FATIGUE: ${p.aist?.fatigueCranes==='single'?'ONE CRANE AT A TIME':'ALL CRANES TOGETHER, SIDE THRUST FROM ONE'}.`]]:[]),
  ['VERTICAL / LATERAL DEFLECTION',`${ratio(vertical,criteria.nv)} / ${ratio(lateral,criteria.nh)} OF EACH BAY (ONE CRANE, NO IMPACT)`],
  // The owner / crane supplier rail criteria the serviceability checks use (one static crane).
  ...(d?[['RAIL TWIST / HEAD MOVEMENT',`${d.criteria.twistLimit?`ROTATION ${d.criteria.twistLimit} RAD (OWNER / CRANE SUPPLIER)`:'NO ROTATION LIMIT ENTERED (OWNER / CRANE SUPPLIER), ROTATION NOT CHECKED'}; RAIL-HEAD LATERAL MOVEMENT L/${Math.max(400,p.lateralLimit,d.criteria.railLateralLimit)} OF THE SHORTEST BAY, TWIST INCLUDED (OWNER / CRANE SUPPLIER CRITERIA, ONE STATIC CRANE)`]]:[]),
  ['FATIGUE SPECTRUM',d?(()=>{const rated=d.spectrum.filter(b=>b.liftFraction>=1).reduce((sum,b)=>sum+b.cycles,0),perPass=a&&a.buildingCycles>0?rated/a.buildingCycles:0;
   // The rated-lift bin relates to the owner's full-load repetitions by the stress cycles per crane pass.
   // Wheel-local details count each wheel group passing (fatigueCycleFamilies), as the checks and submittals do.
   const local=fatigueCycleFamilies(p);
   return `${d.spectrum.reduce((sum,b)=>sum+b.cycles,0).toLocaleString()} STRESS CYCLES AT EACH GIRDER DETAIL (ONE PER CRANE PASSAGE) IN ${d.spectrum.length} DUTY BINS (${rated.toLocaleString()} AT RATED LIFT${perPass>0?`: ${Number(perPass.toFixed(2))} STRESS CYCLE${perPass===1?'':'S'} PER FULL-LOAD REPETITION`:''})${local.length?`; WHEEL-LOCAL DETAILS, ONE CYCLE PER WHEEL GROUP: ${local.map(f=>`${f.label.toUpperCase()} ${f.cycles.toLocaleString()}`).join(', ')}`:''}`;})():`${p.fatigue.cycles.toLocaleString()} CYCLES, CATEGORY ${p.fatigue.category}`],
  // IBC 1603.1.5: the seismic data for the new structure, and the design base shear each way.
  ...(()=>{const z=seismicBasis(p),e=p.existingColumn?.seismic;if(!z||!e)return [];
   const v=(x:number|undefined)=>x===undefined?'NOT ENTERED':String(x),across=s.existingColumn?.seismic?.QE,along=s.bracingSystem?.seismic?.QE;
   return [['SEISMIC DATA (NEW COLUMNS)',`RISK CATEGORY ${e.riskCategory??'NOT ENTERED'}, IE ${z.Ie}; SS ${v(e.Ss)}, S1 ${v(e.S1)}; SITE CLASS ${e.siteClass==='default'?'D (DEFAULT, §11.4.3)':e.siteClass??'NOT ENTERED'}; SDS ${z.SDS}, SD1 ${v(e.SD1)}; SEISMIC DESIGN CATEGORY ${z.sdc}`],
    ['SEISMIC (NEW COLUMNS)',`ASCE 7 EQUIVALENT LATERAL FORCE PROCEDURE. ACROSS THE RUNWAY: ${tied?`THE RUNWAY MASS TO THE EXISTING BUILDING'S LATERAL SYSTEM THROUGH THE TIES (CHECKED WITH THE BUILDING COLUMN; THE BUILDING FRAME BY THE ENGINEER OF RECORD)`:`${cantileverSystems[z.system].label.toUpperCase()}, R ${z.R}, ΩO ${z.Omega0}, CD ${z.Cd}, REDUNDANCY ${z.rho}; CS ${z.Cs.toFixed(3)}${z.integrityOnly?' (SDC A, §1.4.2)':''}${across!==undefined?`, V = ${f(across)} PER COLUMN`:''}`}. ALONG THE RUNWAY: CRANE-LEVEL BRACING${designsBracing(p)?`, ${bracedSeismicSystem.label.toUpperCase()}, R ${bracedSeismicSystem.R}, ΩO ${bracedSeismicSystem.Omega0}, CD ${bracedSeismicSystem.Cd}`:''}${along!==undefined?`, V = ${f(along)} PER RUNWAY LINE`:''}. ${seismic341?`COLUMNS (AISC 341 ${seismic341.clause.slice(0,3)}.4a), BASE PLATES`:'BASE PLATES'}, ANCHORS AND FOOTINGS FOR OVERSTRENGTH`],
    ['WIND (NEW COLUMNS)','NONE: THE RUNWAY STRUCTURE IS INSIDE THE ENCLOSED EXISTING BUILDING']];})(),
  ...(p.columnBase?.enabled&&p.existingColumn?.isNew?[['FOUNDATIONS',`SPREAD FOOTINGS; ${format(p.columnBase.soil.allowable,'pressure',u,u==='SI'?0:3).toUpperCase()} ALLOWABLE BEARING, BASE FRICTION ${p.columnBase.soil.friction}; OVERTURNING AND SLIDING FS 1.5 (DEAD LOAD ONLY RESISTING), 1.0 IN THE ASCE 7 SEISMIC COMBINATIONS`]]:[]),
  ['ELEVATIONS',elevations?`T.O.R. ${drawingElevation(elevations.tor,u)}, T.O.S. ${drawingElevation(elevations.tos,u)} (DATUM ${drawingElevation(elevations.datum,u)})`:'NOT ENTERED']
 ],[1.4,2.6]));
 // The configurator's selections (configurator.selections), compactly: as entered, as designed and the governing reason
 // in its first clause without the parentheses (the full reasons are in the calculation's design summary).
 const picks=p.configurator?.selections??[];
 if(picks.length)blocks.push(H('CONFIGURATOR SELECTIONS'),T(['ITEM','AS ENTERED → AS DESIGNED','GOVERNING REASON'],
  // A reason quoting screening estimates carries the final calculated ratios beside them (selectionFinal).
  picks.map(v0=>{const f=selectionFinal(s,v0.item,v0.entered),v=selectionView(s,v0);return [strip(v.item),strip(`${v.entered} → ${v.designed}`),`${governingClause(v.reason)}${f?`: SCREENING ESTIMATE. ${f.replace(/\.$/,'')}`:''}`].map(x=>x.toUpperCase());}),[.8,1.3,1.9]));
 const r=s.supportReactions;
 // The runway seismic combinations are evaluated by the engineer of record: their item in the existing structure evaluation.
 const runwaySeismic=unevaluatedStructure(s).findIndex(c=>c.id==='building-seismic-runway')+1;
 // The combinations the runway girder is designed for, as the calculation applies them.
 // The combinations as the calculation lists them: TR-13 case labels, without the cases that equal or are bounded by another.
 const omitted=combinationOmissions(p.method),combos=craneCombinations(p.method,p.aist?.concurrency==='full').filter(c=>!omitted.some(o=>o.id===c.id)),plain=(v:string)=>v.replace(/C_\{([^}]*)\}/g,'C$1').replace(/C_([a-z]+)/g,'C$1');
 // The table keeps with its key below it.
 blocks.push(H(`LOAD COMBINATIONS · RUNWAY GIRDER (${p.method})`),{...T(['NO.','COMBINATION','NO.','COMBINATION'],Array.from({length:Math.ceil(combos.length/2)},(_,i)=>{const a=combos[i],b=combos[i+Math.ceil(combos.length/2)];return [combinationLabel(a.id),plain(a.equation),b?combinationLabel(b.id):'',b?plain(b.equation):''];}),[.6,1.4,.6,1.4]),keep:true},
  P(`AIST TECHNICAL REPORT 13 WITH ASCE 7 §2.${p.method==='LRFD'?'3':'4'}. Cd CRANE DEAD, Cv VERTICAL, Css SIDE THRUST, Cls LONGITUDINAL, Ci IMPACT, Cbs BUMPER; SUFFIX m MULTIPLE CRANES, s ONE CRANE, min MINIMUM LIFTED LOAD. D DEAD, L LIVE. IMPACT AND SIDE THRUST ARE IN SEPARATE COMBINATIONS (${p.method==='LRFD'?'2b AND 2c':'2a AND 2b'}; AISC DG7 3RD ED. WITH ERRATA 2/16/2023)${p.existingColumn?.enabled?`, ONE RULE FOR THE GIRDERS, SUPPORTS, ${p.existingColumn.isNew?'NEW COLUMNS AND THEIR BASES':'AND THE EXISTING COLUMNS'}`:''}. ALSO EVALUATED: ${omitted.map(o=>combinationLabel(o.id)).join(', ')} (EQUAL TO OR BOUNDED BY THE CASES LISTED).${p.aist?.concurrency==='full'?' C1: ALL CRANE LOADS CONCURRENT AS L.':''}${runwaySeismic>0&&combos.some(c=>c.id==='7a')?` 7A IS EVALUATED HERE WITHOUT THE SEISMIC LOAD E; 5A AND 7A WITH E ARE BY THE ENGINEER OF RECORD (EXISTING STRUCTURE EVALUATION, ITEM ${runwaySeismic}).`:''}`));
 // Supports by grid, as every other table on the set, with the station; the traction couple's lever is the rail head height
 // above the bearing, hr (e is the column eccentricity of the delivered forces).
 // Forces to three significant figures, as the forces delivered to the columns below and the force table on S-02.
 const f3=(v:number)=>Math.abs(toDisplay(v,'force',u))<.1?`${Math.abs(toDisplay(v,'force',u)).toFixed(2)} ${unit('force',u)}`:sig3(v,'force',u);
 const gridAt=(x:number)=>{let at=0;const i=[0,...p.spans.map(v=>at+=v)].findIndex(g=>Math.abs(g-x)<1);return i<0?len(x):`${i+1} (${len(x)})`;};
 if(r)blocks.push(H('SUPPORT REACTIONS · UNFACTORED, PER SUPPORT'),T(['GRID (STATION)','D','Cd','Cv','Ci','Css','Cls·hr/L'],r.supports.map(v=>[gridAt(v.x),...[v.D,v.Cd,v.Cv,v.Ci,v.Css].map(f3),'±'+f3(v.Clv)]),[1.4,1,1,1,1,1,1.05]),P(`Cd CRANE EMPTY, Cv LIFTED, Ci IMPACT${p.cranes.length>1?' (ALL CRANES, ANY ARRANGEMENT)':''}, Css SIDE THRUST AT RAIL HEAD (ONE CRANE). RUNWAY LONGITUDINAL FORCE Cls = ${f(r.Cls)} AT THE RAIL HEAD; Cls·hr/L IS ITS END COUPLE AT THE BEARINGS OF THE BAY THAT CARRIES IT, hr THE HEIGHT OF THE RAIL HEAD ABOVE THE BEARING AND L THE SPAN. ALL CRANE COMPONENTS ARE LIVE LOAD L (ASCE 7 §4.9).${adjacentBays(p).map(b=>` AT ${len(b.station)} THE REACTIONS INCLUDE THE EXISTING ADJACENT ${len(b.length)} BAY (SAME GIRDER, RAIL AND DEAD LOAD ASSUMED).`).join('')} FACTORED: ${bracketForcesAt(s,'cover')}.`));
 // The forces delivered to the building columns: the same concurrent sets as the calculation (page 1 and section 3.5),
 // each column as wide as its widest value so the values stay on one line (the set names wrap where the table is tight).
 const delivered=deliveredRows(s);
 // H tie (H top at a column cap's end fork) is the design force (restraint plus the Appendix 6 brace force); the S-02 force table prints the restraint alone.
 const deliveredHeads=deliveredHeadersOf(p).map(v=>/^H (tie|top)$/.test(v)?`${v.toUpperCase()} (DESIGN)`:v.toUpperCase());
 if(delivered.length)blocks.push(H(`${tied?'FORCES DELIVERED TO THE BUILDING COLUMNS (H ONLY: GIRDER TIE AND COLUMN TIE)':p.existingColumn?.enabled&&p.existingColumn.isNew?'FORCES ON THE NEW RUNWAY COLUMNS (DESIGNED IN THE CALCULATION REPORT, NEW COLUMN)':activeStep(p)?'FORCES DELIVERED TO THE STEPPED BUILDING COLUMNS (V ON THE STEP, H TIE AT THE UPPER SHAFT)':'FORCES DELIVERED TO THE BUILDING COLUMNS'} · FACTORED ${p.method}, CONCURRENT SETS PER GRID`),{...T(deliveredHeads,delivered,fitColumns(t,deliveredHeads,delivered,[1])),keep:true},P(deliveredNote(s)));
 // A crane column: its reactions to its own footing (the base actions the column base is designed for).
 if(tied)blocks.push(...craneColumnCoverBlocks(s,t,H,P,T));
 // Without bracket or support details the cover carries the factored bracket design forces.
 if(d&&s.detailResults&&!bracketForceTopic(s))blocks.push(...bracketForceBlocks(s,t));
 // Column 3: index, materials, inspection.
 blocks.push(H('SHEET INDEX'),T(['SHEET','TITLE'],[['S-00',coverSheetTitle],...Array.from({length:pages-1},(_,i)=>[coverContinuation(i+1).number,coverContinuation(i+1).title]),...sheets.map(v=>[v.number,v.title])],[.7,3.3]));
 // Every detail by number and sheet; references resolve when the set is assembled.
 const details=sheets.flatMap(v=>(v.details??[]).map(t=>[detailRef(t),t]));
 if(details.length)blocks.push(H('DETAIL INDEX'),T(['DETAIL','TITLE'],details,[.7,3.3]));
 // AISC 360-16 Table J3.2 bolt groups: Group A (A325) and Group B (A490); 'Group 120 / 150' is AISC 360-22 terminology.
 // Every bolt grade the model uses (boltGrades): one grade alone, or each with the joints that use it.
 const grades=boltGrades(p),bolt=grades.length>1?grades.map((v,i)=>`${boltSpec(v.grade)} ${i?'ELSEWHERE':`AT THE ${v.where.join(', ')}`}`).join('; ').toUpperCase():(grades[0]?.grade??d?.end.grade)==='A490'?'ASTM F3125 GRADE A490 (GROUP B)':'ASTM F3125 GRADE A325 (GROUP A)';
 const materialsFrom=written.length;
 // Bolts in slotted sliding plies (end bearings, cap tiebacks) bear against sleeves: those plies are not clamped.
 const sleeved=!!d&&constructionRequirements(p).find(v=>v.key==='bolting')!.items.some(v=>/against steel sleeves/i.test(v));
 // ASTM grades in one form (GR.), as the abbreviation list and the calculation give them.
 const gradeRows=(rows:string[][])=>rows.map(r=>r.map(specGrade));
 blocks.push(H('MATERIALS'),T(['ITEM','SPECIFICATION'],gradeRows([
  ['RUNWAY GIRDER',`${astmSpec(p.section.kind==='welded'?'plate':'w-shape',p.section.Fy,p.section.Fu).toUpperCase()}${p.section.kind==='welded'?' PLATE':''}, Fy = ${ksi(p.section.Fy)}`],
  ...(p.capDesign&&p.section.kind==='cap'?[['CAP CHANNEL',`${astmSpec('channel',p.capDesign.Fy,p.capDesign.Fu,p.capDesign.materialSource).toUpperCase()}, Fy = ${ksi(p.capDesign.Fy)}`]]:[]),
  ...(d?[[activeColumnCap(p)&&!tied?'PLATES, BARS, ANGLES':'PLATES, BARS, ANGLES, TIES',`${astmSpec('plate',d.material.Fy,d.material.Fu).toUpperCase()}, Fy = ${ksi(d.material.Fy)}, Fu = ${ksi(d.material.Fu)}`],['CRANE RAIL',`${astmSpec('rail',d.rail.Fy,d.rail.Fu)} ${d.rail.name.split(" · ")[0]}, Fy = ${ksi(d.rail.Fy)}`.toUpperCase()],['BOLTS',`${bolt}, PRETENSIONED; SLIP-CRITICAL CLASS ${d.end.surface} FAYING SURFACES AT CLAMPED PLIES${activeEndBearing(p)&&bearingSurface(p)==='A'?'; CLASS A AT THE BEARING PLATES, SHIMS AND SEATS':''}${sleeved?'; BOLTS IN SLOTTED SLIDING PLIES PRETENSIONED AGAINST STEEL SLEEVES, THE SLOTTED PLY NOT CLAMPED (MATERIAL NOTE 1)':''}${grades.some(v=>v.grade==='A490')?'; A490 BOLTS NOT GALVANIZED AND NOT REUSED; DO NOT SUBSTITUTE A325 FOR A490':''}`],['NUTS AND WASHERS','ASTM A563 GRADE DH HEAVY HEX NUTS; ASTM F436 HARDENED WASHERS; PLATE WASHERS ASTM A572 GR. 50'],['BOLT SLEEVES',`${sleeveSpec.toUpperCase()}; Fy = ${ksi(50*6.894757)} MIN. BY MILL TEST REPORT`],['WELD METAL',`${electrodeClass(d.material.Fexx,u)}, AWS D1.1`],...(seismic341?[['SEISMIC WELDS',`NEW COLUMN TO BASE PLATE, AND ${activeColumnCap(p)?'CAP PLATES':'BRACKETS AND TIES'} TO THE NEW COLUMNS: FILLER METAL WITH CVN TOUGHNESS PER AWS D1.8 CLAUSE 6.3 (AISC 341 §A3.4a); ALSO THE ANCHOR ROD PLATE WASHER WELDS`]]:[]),...(railPad(p)?[['RAIL PAD',`${d.rail.padSource}; ${plateInches(railPad(p)!.thickness,u)} THICK X ${plateInches(railPad(p)!.width,u)} WIDE, CONTINUOUS UNDER THE RAIL BASE; ALLOWABLE COMPRESSION ${ksi(d.rail.padAllowable)}; SEE ${detailRef(detailTitles.railKeeper)}`]]:[]),...(d.rail.clip?[['RAIL CLIPS',`${d.rail.clip.product.toUpperCase()}${new RegExp(`${d.rail.clip.type==='weld-on'?'WELD-ON':'BOLTED'}.*FLOATING`,'i').test(d.rail.clip.product)?'':`; ${d.rail.clip.type==='weld-on'?'WELD-ON':'BOLTED'}, FLOATING`}, PER MANUFACTURER; SEE ${detailRef(detailTitles.railKeeper)}`]]:[])]:[]),
  // Bolted field splices of the runway girder (spliceSheet.ts).
  ...(d&&spliced(p)?(()=>{const sp=activeSplices(p)!;return [['GIRDER SPLICE PLATES',`${astmSpec('plate',d.material.Fy,d.material.Fu).toUpperCase()}, Fy = ${ksi(d.material.Fy)}; FAYING SURFACES CLASS ${sp.surface}${sp.surface==='B'?', BLAST-CLEANED AND UNCOATED':', CLEAN MILL SCALE'}`],['GIRDER SPLICE BOLTS',`${boltSpec(sp.grade).toUpperCase()}, ${plateInches(sp.diameter,u)} DIA., PRETENSIONED, SLIP-CRITICAL; ASTM A563 DH HEAVY HEX NUTS, F436 WASHERS; ${detailRef(spliceTitles.elevation)}`]];})():[]),
  ...(usesRolledBracket(p)?(()=>{const w=projectStub(p);return [['COLUMN BRACKETS',`ASTM A992 ${w.name}, Fy = ${ksi(w.input.Fy)}, Fu = ${ksi(w.input.Fu)}; ${w.seat?'SEAT PL AND ':''}STIFFENERS AS PLATES`]];})():[]),
  ...(usesTaperedHaunch(p)&&d?[['COLUMN BRACKETS',`BUILT-UP TAPERED I HAUNCH PLATES, ${astmSpec('plate',d.material.Fy,d.material.Fu).toUpperCase()}, Fy = ${ksi(d.material.Fy)}, Fu = ${ksi(d.material.Fu)}; ${p.existingColumn?.enabled&&!p.existingColumn.isNew?'FIELD WELDED TO EXISTING COLUMNS: VERIFY WELDABILITY':'SHOP WELDED'}`]]:[]),
  ...(d&&columnStiffenerGeometry(p)?[['COLUMN STIFFENERS',`${astmSpec('plate',d.material.Fy,d.material.Fu).toUpperCase()} PLATES, Fy = ${ksi(d.material.Fy)}; ${supportColumn(p).field?'FIELD WELDED INSIDE THE EXISTING COLUMNS':'SHOP WELDED INSIDE THE NEW COLUMNS'} AT THE BRACKETS`]]:[]),
  ...(p.existingColumn?.enabled&&p.existingColumn.isNew?[[tied?'NEW CRANE COLUMNS':'NEW COLUMNS',`ASTM A992${p.existingColumn.shape?` ${p.existingColumn.shape}`:''}, Fy = ${ksi(p.existingColumn.Fy)}`]]:[]),
  ...(p.columnBase?.enabled&&p.existingColumn?.isNew?[['BASE PLATES',`ASTM A572 GR. 50, Fy = ${ksi(p.columnBase.plate.Fy)}`],['ANCHOR RODS',`ASTM F1554 GR. ${p.columnBase.anchors.grade.split('-')[1]}, A563 HEAVY HEX NUTS; DG1 HOLES AND PLATE WASHERS`],['CONCRETE / REBAR',`f'c = ${ksi(p.columnBase.concrete.fc)}; EXPOSURE F0, S0, W1, C1 (ACI 318-19 TABLE 19.3.1.1: INTERIOR FOOTING IN SOIL; CONFIRM THE SULFATE CLASS WITH THE GEOTECHNICAL REPORT); ASTM A615 Fy = ${ksi(p.columnBase.footing.fy)}; NON-SHRINK GROUT ASTM C1107`]]:[]),
  // Only new bracing is furnished; existing bracing is checked and described in the existing building notes.
  ...(designsBracing(p)?(()=>{const g=bracingDesign(p);return [['BRACING STRUT',`ASTM A992 ${g.strut.shape}, Fy = ${ksi(g.strut.Fy)}`],['BRACE GUSSETS',`ASTM A572 GR. 50, Fy = ${ksi(g.gusset.Fy)}, Fu = ${ksi(g.gusset.Fu)}`],['CLEVIS PINS',`ASTM A36 MIN. STEEL PIN (ASTM A108 / A434 AS SPECIFIED), Fu = ${ksi(g.pin.Fu)} MIN.; FORGED CLEVISES RATED FOR THE ROD STRENGTH`]];})():[]),
  ...(p.longitudinalBracing?.enabled&&p.existingColumn?.isNew?[[p.longitudinalBracing.system==='rod-x'?'BRACING RODS':'BRACING',p.longitudinalBracing.system==='rod-x'?`${astmSpec('rod',p.longitudinalBracing.rod.Fy,p.longitudinalBracing.rod.Fu).toUpperCase()} RODS, Fy = ${ksi(p.longitudinalBracing.rod.Fy)}, Fu = ${ksi(p.longitudinalBracing.rod.Fu)}`:`${astmSpec('angle',p.longitudinalBracing.angle.Fy,p.longitudinalBracing.angle.Fu).toUpperCase()} ${p.longitudinalBracing.angle.shape}, Fy = ${ksi(p.longitudinalBracing.angle.Fy)}`]]:[])
 ]),[1.2,2.8]));
 // Numbered under their own heading, so one carried to the next column still reads in context.
 // Bolting and welding requirements are generated from the calculation; entered notes that contradict them are dropped
 // here and reported as an open item in the calculation.
 const req=constructionRequirements(p),items=(k:string)=>req.find(v=>v.key===k)?.items??[];
 // Each note says a thing once: the field-weld requirement is the existing building note, and an entered sentence that
 // the sheet already states (materials table, general notes, the generated requirement) is left out.
 if(d){
  const steel=addedSentences(enteredFabricationNote(p,'steel'),written.slice(materialsFrom),true).join(' ');
  const welding=items('welding').filter(v=>!(existing&&onExisting&&existingWeldNote(p).length&&/^Field welds to the existing column/.test(v))&&!/^Haunch flange CJPs/.test(v));
  // The rail joints and the rail anchorage are stated in full once, on their details; the bolting note points there.
  const bolting=items('bolting').map(v=>/^Rail joints:/.test(v)?`Rail joints: ${railJointType(p)==='tight'?'tight':'open'} joints, bolts pretensioned and re-tightened per ${detailRef(detailTitles.railJoint)}; rail anchorage per ${detailRef(detailTitles.railLayout)}.`:v);
  // An entered sentence whose words the bolting statements on this sheet (this note, the general notes and the
  // materials table) already hold, taken together, repeats them and is left out.
  const boltingSaid=[...items('bolting'),...written.filter(v=>/\b(BOLTS?|PRETENSION(ED)?|SLIP-CRITICAL)\b/i.test(v))];
  const enteredBolting=addedSentences(enteredFabricationNote(p,'bolting'),[...written,...items('bolting')]).filter(v=>addedSentences(v,boltingSaid,true).length);
  blocks.push(H('MATERIAL NOTES'),...N([...(steel?[`STEEL: ${steel}`.toUpperCase()]:[]),
   `BOLTING: ${[...bolting,...enteredBolting].join(' ')}`.toUpperCase(),
   `WELDING: ${[...welding,...addedSentences(enteredFabricationNote(p,'welding'),[...written,...items('welding')])].join(' ')}`.toUpperCase()]));
 }
 // AISC 360 Chapter N assigns steel tasks to observe (O) or perform (P); IBC Table 1705.3 rates concrete
 // tasks continuous (C) or periodic (P).
 // CJP joints in the set: capped-girder bearing stiffeners to the W top flange, and the paired-bar tie gusset to its stiffener.
 const cjpList=cjpWelds(p),cjpPresent=!!d&&(cjpList.length>0||stiffenerTieJoint(p)==='cjp');
 const fieldWelds=!!d&&(tied?weldsToExistingColumn(onBuilding):supportColumn(p).field&&(!!d.brace.flangeAttachment?.enabled||!!d.bracket?.enabled||!!stepGeometry(p)?.stiffener));
 // The project's own inspection requirements, less what the table and the notes already require.
 const withProject=(rows:string[][])=>{const extra=d?addedSentences(enteredFabricationNote(p,'inspection'),[...written,...rows.flat()]):[];return extra.length?[...rows,['PROJECT REQUIREMENTS',extra.join(' ').toUpperCase(),'-']]:rows;};
 blocks.push(H('SPECIAL INSPECTIONS (IBC 1704, 1705 / AISC 360 CHAPTER N)'),T(['ITEM','REQUIREMENT','FREQ.'],withProject([
  ['STATEMENT','STATEMENT OF SPECIAL INSPECTIONS BY THE ENGINEER OF RECORD (IBC 1704.3); APPROVED AGENCY RETAINED BY THE OWNER (IBC 1704.2)','-'],
  ['FABRICATOR','AISC-CERTIFIED FABRICATOR, OR SHOP INSPECTION BY THE APPROVED AGENCY (IBC 1704.2.5)','-'],
  ['MATERIAL','MILL CERTIFICATES: STEEL, BOLTS, NUTS, WASHERS, WELD FILLER','P'],
  ['WELDING','AISC N5.4 TASKS BEFORE, DURING AND AFTER WELDING; QUALIFIED WPS AND WELDERS','O / P'],
  ['NDT',`${cjpPresent?`UT 100% OF CJP GROOVE WELDS${cjpList.length?` (${cjpList.join('; ')})`:''}; `:''}MT AT FILLET TERMINATIONS ON CYCLIC DETAILS; AWS D1.1:${awsEdition} CLAUSE 8 ACCEPTANCE CRITERIA FOR CYCLICALLY LOADED CONNECTIONS FOR THE RUNWAY GIRDER WELDS${fieldWelds?' AND THE WELDS TO THE EXISTING COLUMN':''} (AIST TR-13 §5.17)`.toUpperCase(),'P'],
  ['BOLTING',`AISC N5.6 TASKS; PRETENSION VERIFICATION PER RCSC; FAYING SURFACE CLASS${d&&(tieRelease(p)||activeEndBearing(p))?'; SLEEVE LENGTHS AND SLOT TRAVEL AT SLEEVED BOLTS':''}`,'O / P'],
  ...(p.existingColumn?.isNew&&p.existingColumn.enabled&&!tied?[]:[['EXISTING STEEL',`FIELD-VERIFY SIZES, CONDITION AND WELDABILITY BEFORE WORK${cjpToExisting(p)?'; UT THE COLUMN FLANGE FOR LAMINATIONS UNDER THE HAUNCH FLANGE CJP WELDS BEFORE WELDING (LOADED THROUGH ITS THICKNESS)':''}`,'P']]),
  ...(fieldWelds?[['FIELD WELDS TO EXISTING STEEL',`BASE METAL CONFIRMED, WPS APPROVED, PREHEAT ${(preheatBasis(onBuilding)?format(preheatBasis(onBuilding)!.governing,'temperature',u,0).toUpperCase()+' MIN.':'PER THE APPROVED WPS')}; VISUAL AND MT OF EVERY FIELD WELD TO EXISTING STEEL${columnStiffenerGeometry(p)?', INCLUDING THE COLUMN STIFFENER WELDS':stepGeometry(p)?.stiffener?', INCLUDING THE STEP STIFFENER WELDS':''}`,'P']]:[]),
  ...(d&&columnStiffenerGeometry(p)?[['COLUMN STIFFENERS',`FIT-UP AT THE BRACKET FORCE LEVELS WITH THE CORNER CLIPS CLEAR OF THE COLUMN FILLETS${supportColumn(p).field?' (SURVEY THE COLUMN AT BOTH LEVELS FIRST)':''}; VISUAL OF EVERY STIFFENER WELD, MT OF THE FLANGE FILLETS`,'P']]:[]),
  // The rail clip base welds are cyclic attachments on the girder top plate: MT at their terminations, as the NDT row.
  ...(d?[['FIELD WELDS',`RAIL CLIP BASE WELDS${p.columnBase?.enabled&&p.existingColumn?.isNew?', ANCHOR ROD PLATE WASHERS':''}: VISUAL OF EVERY WELD${d.rail.clip?.type==='bolted'?'':`; MT AT THE RAIL CLIP WELD TERMINATIONS (CYCLIC ATTACHMENTS ON THE ${p.section.kind==='cap'?'CAP CHANNEL':'GIRDER TOP FLANGE'}, NDT ABOVE)`}`,'P']]:[]),
  ...(seismic341?[['SEISMIC (IBC 1705.12.1.1, 1705.13.1.1)','NEW COLUMNS, BASE PLATES AND THEIR WELDS: QUALITY ASSURANCE PER AISC 341 CHAPTER J; CRANE-LEVEL ROD BRACING EXEMPT (R = 3)','O / P']]:[]),
  ...(p.columnBase?.enabled&&p.existingColumn?.isNew?[['FOUNDATIONS (IBC 1705.3, 1705.6)','REINFORCEMENT AND ANCHOR ROD PLACEMENT; BEARING SOIL VERIFIED BEFORE CONCRETE','P'],['CONCRETE (IBC 1705.3)','SAMPLING AND TESTING OF FRESH CONCRETE; PLACEMENT','C']]:[]),
  ...(d&&spliced(p)?[['SLIP-CRITICAL GIRDER SPLICES',`PRE-INSTALLATION VERIFICATION OF THE BOLT ASSEMBLIES AND PRETENSIONING METHOD (RCSC §7); FAYING SURFACES BEFORE ASSEMBLY; ROUTINE OBSERVATION OF PRETENSIONING, EVERY BOLT MATCH-MARKED OR DTI CHECKED (AISC 360 N5.6); ${detailRef(spliceTitles.elevation)}`,'P']]:[]),
  ['RAIL / RUNWAY','ALIGNMENT, GAUGE AND LEVEL SURVEY AFTER ERECTION','P']
 ]),[1.05,2.45,.5]),P(`STEEL: O OBSERVE, P PERFORM (AISC 360 N5).${p.columnBase?.enabled&&p.existingColumn?.isNew?' CONCRETE AND SOILS: C CONTINUOUS, P PERIODIC (IBC TABLE 1705.3).':''}`));
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
  ...(!d?.bracket?.enabled&&!activeColumnCap(p)&&!activeStep(p)?[`COLUMN BRACKETS AND THEIR ATTACHMENT TO THE BUILDING COLUMNS FOR THE ${d&&s.detailResults?`${bracketForcesAt(s,'cover','ON THIS SHEET')} AND THE UNFACTORED SUPPORT REACTIONS LISTED`:'SUPPORT REACTIONS LISTED'}${support?.capacity!==undefined?`, WITH VERTICAL DEFLECTION AT THE BEARING UNDER CRANE LOADS ${limitLength(support.capacity,u,'max')} MAX.`:'.'}`]:[]),
  // A crane column tied to the building column (craneColumn.ts): the tie connections to the existing column are by others.
  ...(tied?['THE EXISTING BUILDING COLUMN FLANGE AND WEB AT THE GIRDER TIES, FOR THE FORCES DELIVERED TO THE BUILDING COLUMNS ON THIS SHEET: BUILDING ENGINEER OF RECORD (THE GIRDER TIE CONNECTIONS AND THE COLUMN TIE TABS WITH THEIR FIELD WELDS ARE DESIGNED AND DETAILED IN THIS SET).']:[]),
  ...(p.system==='simple'&&d&&!activeEndBearing(p)?[`COLUMN-SIDE LOCATING AND GUIDED HOLD-DOWN ATTACHMENTS AT GIRDER ENDS (${detailRef(detailTitles.movement)}) FOR THE LONGITUDINAL, LATERAL AND UPLIFT FORCES IN THE ${bracketForcesAt(s,'cover','ON THIS SHEET')}.`]:[]),
  ...s.checks.filter(c=>c.status==='excluded'&&delegatedChecks.has(c.id)&&c.id!=='bracket-load-path'&&c.id!=='tie-move-support').map(c=>activeStep(p)?`${c.title}: FIELD SURVEY AND FIT-UP AT THE EXISTING STEP, REPORTED TO THE ENGINEER OF RECORD (${detailRef(steppedColumnTitles.section)}).`:`${c.title}: BY THE BRACKET DESIGNER FOR THE REPORTED FORCES.`),
  ...(()=>{const t=supplierRailJointText(s);return t?[`RAIL JOINT BARS AND BOLTS: RAIL SUPPLIER, FITTED TO THE RAIL FISHING SURFACES (${detailRef(detailTitles.railJoint)}), DESIGNED FOR THE ${t.toUpperCase()}.`]:[];})(),
  // Crane-column footings that overlap the existing building-column footings: an open foundation coordination item.
  ...(()=>{const c=s.checks.find(v=>v.id==='crane-column-footing-clearance'&&v.status==='unverified'),r=s.craneColumn?.footing?.reactions;
   return c?[`OPEN ITEM, FOUNDATION COORDINATION: THE CRANE-COLUMN FOOTINGS OVERLAP THE EXISTING BUILDING-COLUMN FOOTINGS. COMBINED OR ENLARGED FOOTINGS BY THE FOUNDATION ENGINEER FOR THE REACTIONS GIVEN${r?` (${footingReactionText(r,u).toUpperCase()})`:''}; THE ISOLATED FOOTINGS SHOWN ARE NOT BUILT UNTIL THEN.`]:[];})()
 ];
 blocks.push(H('DEFERRED SUBMITTALS / BY OTHERS'),P('SUBMIT THE FOLLOWING TO THE ENGINEER OF RECORD FOR REVIEW AND TO THE BUILDING OFFICIAL FOR APPROVAL BEFORE INSTALLATION:'),...N(deferred));
 // Structure the calculation does not check is evaluated for the permit; it is not a deferred submittal.
 const unchecked=unevaluatedStructure(s),isNew=!!p.existingColumn?.isNew,reference=p.drawing?.existingEvaluation?.trim();
 if(unchecked.length){
  const checked=[...(p.existingColumn?.enabled?[isNew?'THE NEW RUNWAY COLUMNS':activeStep(p)?'THE EXISTING STEPPED COLUMNS (BOTH SHAFTS AND THE STEP)':'THE EXISTING RUNWAY COLUMN']:[]),...(p.longitudinalBracing?.enabled?['THE LONGITUDINAL BRACING RODS']:[]),...(usesExistingBracket(p)?['THE REUSED EXISTING BRACKETS']:[])];
  blocks.push(H(isNew?'STRUCTURE NOT CHECKED HERE · WITH THE PERMIT SUBMITTAL':'EXISTING STRUCTURE EVALUATION · WITH THE PERMIT SUBMITTAL'),
   P(`${checked.length?`THE CALCULATION REPORT CHECKS ${checked.join(', ').replace(/, ([^,]*)$/,' AND $1')} FOR THE ADDED CRANE LOADS. `:''}THE ENGINEER OF RECORD SHALL EVALUATE THE FOLLOWING FOR THE FORCES IN THE CALCULATION REPORT AND INCLUDE THE EVALUATION IN THE PERMIT SUBMITTAL; THEY ARE NOT DEFERRED SUBMITTALS. EVALUATION: ${reference?reference.toUpperCase():'NOT REFERENCED; THE SET IS NOT ISSUED UNTIL IT IS'}.`),
   ...N(unchecked.map(c=>c.title.toUpperCase()+'.')));
 }
 // Open items with a failing check that no detail of the set draws: listed here, as the details' HOLD tags list theirs.
 const unplaced=unplacedHolds(s,sheets.flatMap(v=>[...(v.details??[])]));
 if(unplaced.length&&!blockedPackage(s))blocks.push(H('OPEN ITEMS - NOT FOR FABRICATION'),P(`FAILING CHECKS NOT TAGGED AT A DETAIL (SEE CALCULATION, OPEN ITEMS): ${unplaced.map(h=>`${h.text.replace(/^NG /,'')}${h.group.locations>1?` (${h.group.locations} LOCATIONS)`:''}`).join('; ')}.`));
 blocks.push(legend(t,p.units,referenceDims));
 // Only the abbreviations used on this sheet or the others.
 const used=`${written.join(' ')} ${otherWords}`,abbreviations=abbreviationList.filter(([re])=>otherWords===undefined||re.test(used)).map(([,v])=>v);
 if(abbreviations.length)blocks.push(H('ABBREVIATIONS'),P(abbreviations.join(' · ')));
 blocks.push(H('ISSUE'),P(`${blockedPackage(s)?`NOT ISSUABLE: THE ANALYSIS DID NOT VERIFY (${verificationFailures(s).join(', ')}); SEE THE DIAGNOSTIC REPORT. `:''}${status.label}${status.reasons.length?`: ${status.reasons.join('; ')}.`:'.'} ${revisionIdentity(s).letter?`DRAWINGS AND CALCULATION REPORT REVISION ${revisionIdentity(s).letter!.toUpperCase()}, ${revisionIdentity(s).date}.`:`CALCULATION ${s.revision}.`}`));
 return blocks;};
 return build;
}
/**
 * The cover of a supplied-load analysis: what was analyzed and found, and what the analysis assumed of the work by
 * others (support reactions, lateral restraint, rail), with no construction notes, code design criteria, load
 * combinations, materials beyond the girder analyzed, inspections or submittals: nothing else was designed.
 */
function analysisBlocks(s:CalculationSnapshot,o:{t:Style;H:(v:string)=>Block;N:(v:string[])=>Block[];P:(v:string)=>Block;T:(h:string[],r:string[][],w:number[])=>Block;len:(mm:number)=>string;f:(v:number|undefined,q?:Parameters<typeof format>[1])=>string}){
 const p=s.input,u=p.units,{H,N,P,T,len,f}=o,blocks:Block[]=[];
 const f3=(v:number)=>Math.abs(toDisplay(v,'force',u))<.1?`${Math.abs(toDisplay(v,'force',u)).toFixed(2)} ${unit('force',u)}`:sig3(v,'force',u);
 const check=(id:string)=>s.checks.find(c=>c.id===id),ratio=(id:string,n:number)=>{const c=check(id);return c?.demand!==undefined&&c.capacity!==undefined?`${format(c.demand,'length',u,u==='US'?3:1).toUpperCase()} VS L/${n} = ${format(c.capacity,'length',u,u==='US'?3:1).toUpperCase()} (D/C ${(c.utilization??0).toFixed(2)}, ${c.status.toUpperCase()})`:'NOT EVALUATED';};
 const restraint=p.lateralBraceSpacing>0&&p.lateralBraceSpacing<Math.max(...p.spans)-1?` AND AT LATERAL BRACES ${len(p.lateralBraceSpacing)} O.C. MAX.`:'';
 blocks.push(H('ANALYSIS ONLY - NOT FOR CONSTRUCTION'),P(`SUPPLIED-LOAD ELASTIC ANALYSIS OF THE RUNWAY GIRDERS ONLY. NO GIRDER, CONNECTION, BEARING, STIFFENER, TIE, BRACKET, COLUMN, RAIL ATTACHMENT OR END STOP IS DESIGNED, AND STRENGTH, STABILITY, FATIGUE AND CODE COMPLIANCE ARE NOT EVALUATED (LOAD FACTORS NOT APPLIED). THESE SHEETS RECORD THE GEOMETRY ANALYZED AND THE CONDITIONS THE ANALYSIS ASSUMED OF THE WORK BY OTHERS; THEY ARE NOT CONSTRUCTION DOCUMENTS.`));
 blocks.push(H('DRAWING NOTES'),...N([
  'DASHED BUILDING FRAMING, COLUMNS AND BRACKETS ARE REFERENCE ONLY (ASSUMED, NOT SURVEYED OR CHECKED). OPPOSITE RUNWAY SHOWN FOR CONTEXT; THE RUNWAY AT GRID B IS TAKEN IDENTICAL AND OPPOSITE HAND.',
  'SEE THE CALCULATION REPORT OF THE SAME CALC ID FOR THE ANALYSIS.'
 ]));
 blocks.push(H('ANALYSIS BASIS AND RESULTS'),T(['ITEM','VALUE'],[
  ['GIRDER ANALYZED',specGrade(`${p.section.name}${p.section.kind==='cap'?' (CAPPED)':''}, ${astmSpec(p.section.kind==='welded'?'plate':'w-shape',p.section.Fy,p.section.Fu)}, E = ${format(p.section.E,'stress',u,0)}`.toUpperCase())],
  ['SPANS',`${p.spans.map(len).join(' + ')} ${p.system==='continuous'?'CONTINUOUS':'SIMPLE SPANS'}`],
  ['MODEL',`LINEAR ELASTIC BEAM; RIGID VERTICAL SUPPORT AT EACH GRID${p.system==='continuous'?', CONTINUOUS OVER INTERIOR SUPPORTS':', PINNED ENDS'}; TOP FLANGE RIGIDLY RESTRAINED LATERALLY AT EACH SUPPORT${restraint}`],
  ['LOADS',`CRANE WHEEL LOADS AS SUPPLIED (BELOW), MOVED ALONG THE RUNWAY; GIRDER SELF WEIGHT, RAIL ${railWeight(p.railWeight,u)}${p.deadLoad>0?` AND ${f(p.deadLoad,'lineLoad')} SUPERIMPOSED`:''}. UNFACTORED.`],
  ['VERTICAL DEFLECTION',`ONE CRANE, STATIC WHEEL LOADS, NO IMPACT: ${ratio('vertical',p.verticalLimit)}`],
  ['LATERAL DEFLECTION',`TOP FLANGE ALONE UNDER THE SIDE THRUST: ${ratio('lateral',p.lateralLimit)}`],
  ['CRITERIA SOURCE',p.criteriaSource.toUpperCase()]
 ],[1.3,2.7]));
 for(const c of p.cranes){
  const max=Math.max(...c.wheels.map(w=>w.loaded)),side=c.wheels.reduce((a,w)=>a+w.lateral,0);
  blocks.push(H(`CRANE DATA AS SUPPLIED · ${c.name.toUpperCase()}`),T(['ITEM','VALUE'],[
   ['WHEELS ON RUNWAY',`${c.wheels.length} AT ${c.wheels.slice(1).map((w,i)=>len(w.offset-c.wheels[i].offset)).join(', ')}`],
   ['MAX LOADED WHEEL',`${f(max)}${c.includesImpact?' INCLUDING IMPACT':''}`],
   ['VERTICAL IMPACT',`${+(c.impact*100).toFixed(1)}%${c.includesImpact?' (INCLUDED IN THE WHEEL LOADS)':''}`],
   ['SIDE THRUST, THIS RUNWAY',f(side)],
   ['LONGITUDINAL TRACTION',f(c.longitudinal)],
   ['LOAD SOURCE',c.loadSource.toUpperCase()]
  ],[1.4,2.6]));
  blocks.push(H(`WHEEL LOADS · ${c.name.toUpperCase()}`),wheelDiagram(o.t,c,{force:v=>f(v),length:len,impact:c.impact,lateral:side,traction:c.longitudinal}));
 }
 // Each support's own maximum (not one crane position for all), unfactored, as the analysis loads them.
 const r=s.properties?supportReactions(p,s.properties,40,true):undefined;
 const gridAt=(x:number)=>{let at=0;const i=[0,...p.spans.map(v=>at+=v)].findIndex(g=>Math.abs(g-x)<1);return i<0?len(x):`${i+1}`;};
 if(r)blocks.push(H('SUPPORT REACTIONS · UNFACTORED, SUPPLIED LOADS, PER SUPPORT'),T(['GRID','D','Cd','Cv','Ci','Css (TOP FL.)'],r.supports.map(v=>[gridAt(v.x),...[v.D,v.Cd,v.Cv,v.Ci].map(f3),'±'+f3(v.Css)]),[.6,1,1,1,1,1.2]),
  P(`D GIRDER, RAIL${p.deadLoad>0?' AND SUPERIMPOSED':''} DEAD LOAD; Cd CRANE EMPTY, Cv LIFTED LOAD, Ci IMPACT, AT THE CRANE POSITION GIVING THE LARGEST Cd + Cv + Ci AT THAT SUPPORT; Css LATERAL REACTION AT THE TOP FLANGE, EITHER DIRECTION, LARGEST AT THAT SUPPORT. MAXIMA ARE NOT CONCURRENT FROM SUPPORT TO SUPPORT. LONGITUDINAL TRACTION ${f(r.Cls)} PER RUNWAY AT THE TOP OF RAIL; BUMPER FORCE NOT ANALYZED.${r.supports.some(v=>v.craneMinimum<0)?` CRANE UPLIFT UP TO ${f3(-Math.min(...r.supports.map(v=>v.craneMinimum)))} AT A SUPPORT.`:''}`));
 const cfg=p.configurator,chosen=cfg&&cfg.structure!=='new'&&cfg.support&&cfg.tie?` THE SUPPORT (${cfg.support.toUpperCase()}) AND TIE (${cfg.tie.toUpperCase()}) SELECTED IN THE CONFIGURATOR WERE NOT USED OR DESIGNED BY THIS ANALYSIS.`:'';
 blocks.push(H('CONNECTIONS AND SUPPORTS BY OTHERS · REQUIREMENTS OF THE ANALYSIS'),...N([
  `GIRDER END BEARINGS, BEARING STIFFENERS, TOP-FLANGE TIES, BRACKETS OR COLUMNS AND THEIR CONNECTIONS ARE BY OTHERS. DESIGN THEM FOR THE SUPPORT REACTIONS ABOVE WITH THE LOAD FACTORS AND COMBINATIONS OF THE GOVERNING CODE.${chosen}`,
  `THE ANALYSIS ASSUMES A RIGID VERTICAL SUPPORT AT EACH GRID${p.system==='continuous'?' WITH THE GIRDER CONTINUOUS OVER THE INTERIOR SUPPORTS':' WITH EACH GIRDER FREE TO ROTATE AT ITS ENDS'}.`,
  `RESTRAIN THE TOP FLANGE LATERALLY AT EACH SUPPORT${restraint} FOR THE LATERAL REACTION Css LISTED, WITHOUT RESTRAINING THE GIRDER'S LONGITUDINAL MOVEMENT AND END ROTATION (AISC DESIGN GUIDE 7 §11.2). THE LATERAL DEFLECTION ABOVE IS VALID ONLY WITH THIS RESTRAINT.`,
  `CARRY THE LONGITUDINAL TRACTION AND THE BUMPER FORCE FROM THE GIRDERS TO THE BUILDING BY OTHERS.`
 ]));
 blocks.push(H('CRANE RAIL · BY OTHERS, AS ANALYZED'),P(`RAIL SIZE, CLIPS, SPLICES AND END STOPS ARE BY OTHERS. THE ANALYSIS ASSUMED A RAIL ${len(p.railHeight).replace(/^0'-/,'')} HIGH WEIGHING ${railWeight(p.railWeight,u)}, ITS C/L WITHIN ${plateInches(Math.abs(p.railEccentricity),u)} OF THE GIRDER WEB C/L, AND THE SIDE THRUST AT THE TOP FLANGE; THE RAIL FURNISHED SHALL NOT BE HEAVIER OR TALLER WITHOUT REANALYSIS.`));
 return blocks;
}
/** A rail weight as it is specified: lb/ft or kg/m. */
const railWeight=(Npmm:number,u:'US'|'SI')=>u==='US'?`${+(Npmm/0.01459390294).toFixed(1)} LB/FT`:`${+(Npmm*1000/9.80665).toFixed(1)} KG/M`;
/** A tapered haunch whose flanges are CJP groove welded to an existing column flange (through-thickness loading). */
function cjpToExisting(p:CalculationSnapshot['input']){
 const b=p.details?.bracket;
 return !!b?.enabled&&isTaperedHaunch(b)&&haunchInput(b).flangeJoint==='cjp'&&!(p.existingColumn?.isNew&&p.existingColumn.enabled);
}

/** Text without its parenthetical remarks, nested ones included. */
const strip=(x:string)=>{let v=x,w='';while(w!==v){w=v;v=v.replace(/\s*\([^()]*\)/g,'');}return v;};
/**
 * The governing reason of a selection, compactly: its first clause (to the first "; " outside parentheses, so a
 * parenthetical with a semicolon is never cut), without the parentheses, and its recommendation where that comes later.
 */
export function governingClause(reason:string){
 let depth=0,end=reason.length;
 for(let i=0;i<reason.length;i++){const c=reason[i];if(c==='(')depth++;else if(c===')')depth=Math.max(0,depth-1);else if(!depth&&reason.startsWith('; ',i)){end=i;break;}}
 const head=strip(reason.slice(0,end)).replace(/\.$/,''),rec=/Recommended:/.test(head)?undefined:reason.slice(end).match(/Recommended:[^;.]*/)?.[0];
 return rec?`${head}. ${strip(rec)}`:head;
}

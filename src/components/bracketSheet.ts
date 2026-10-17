import {supportColumn} from '../engine/drawingData';
import {heading,numbered,type Style} from './noteBlocks';
import type {CalculationSnapshot} from '../engine/types';
import {drawingLength,electrodeClass,plateInches,dimensionLength,onDimensionGrid} from './drawingFormat';
import {sheetDrawingScale,line,rect,text,circle,dimH,dimV,multiLeader,filletLeader,fieldFilletLeader,detailRef,detailTitles,columnReference,sectionCut,bearingBoltsTitle,labelColumn,textWidth,lettering,type XY} from './sheetGraphics';
import {topicSheetSvg,type DetailTopic,type DetailView} from './detailSheet';
import {format} from '../engine/units';
import {usesExistingBracket} from '../engine/existingBracket';
import {existingBracketTopic} from './existingBracketSheet';
import {rolledBracketTopic} from './rolledBracketSheet';
import {taperedHaunchTopic} from './taperedHaunchSheet';
import {usesTaperedHaunch} from '../engine/taperedHaunch';
import {usesRolledBracket} from '../engine/rolledBracket';
import {bracketForceBlocks} from './bracketForceTable';
import {designsBracing} from '../engine/newColumnBracing';
import {seatColumnWeld} from '../engine/bracketDesign';
import {activeEndBearing} from '../engine/endBearingInputs';
import {endBearingGeometry} from '../engine/endBearing';
import {simpleSupportInput,endGridBearingNote} from '../engine/simpleSupports';
import {ribGeometry} from '../engine/bracketRib';
import {haunchedRibView,haunchedFaceRibs,haunchedRibCallout,haunchedRibNotes} from './haunchedBracketDrawing';
import {stiffenerDrawing,stiffenerSideEdges,lowerEdgeTarget,stiffenerPlan,stiffenerFaceHidden,columnStiffenerView,columnStiffenerTitle,stiffenerNotes} from './columnStiffenerDrawing';
import {topFlangeRestraint} from './tieNames';
/** Column bracket details on their own sheet. */
export function bracketSheetSvg(s:CalculationSnapshot,number='S-05'){
 const topic=bracketTopic(s);return topic?topicSheetSvg(s,topic,number,usesExistingBracket(s.input)?'EXISTING BRACKETS / NEW BOLTED SEATS':'WELDED COLUMN BRACKETS'):'';
}
/** Elevation of the bracket seen from the runway; also keyed on the plan. */
export const bracketElevationTitle='BRACKET ELEVATION / LOOKING AT COLUMN';
const bracketPlanTitle='WELDED BRACKET / PLAN';
/** Welded column bracket section, plan and elevation with the bracket notes and reactions, or the existing bracket details. */
export function bracketTopic(s:CalculationSnapshot):DetailTopic|undefined{
 if(usesExistingBracket(s.input))return existingBracketTopic(s);
 if(usesRolledBracket(s.input))return rolledBracketTopic(s);
 if(usesTaperedHaunch(s.input))return taperedHaunchTopic(s);
 const p=s.input,d=p.details,b=d?.bracket;if(!d||!b?.enabled)return undefined;
 const dim=(v:number)=>dimensionLength(v,p.units),size=(v:number)=>plateInches(v,p.units);
 const sc=supportColumn(p),cw=seatColumnWeld(p,s.detailResults?.bracket),collector=designsBracing(p);
 const eb=activeEndBearing(p),g=eb?endBearingGeometry(p,eb):undefined,gap=p.system==='simple'?simpleSupportInput(p).endGap:0;
 const views:DetailView[]=[],rg=ribGeometry(b),cs=stiffenerDrawing(p);
 // Transverse section: true input projection, receiver face, full rib (rectangular, or tapered to the tip depth).
 views.push({title:detailTitles.weldedBracket,render:()=>{
  let svg='';
  const scale=sheetDrawingScale(Math.min(.25,180/(b.ribDepth+b.seatThickness+d.bearing.thickness),cs?310/(b.seatProjection+b.receiver.depth):1),p.units),k=scale.pointsPerMm;
  // With column stiffeners the whole column depth is drawn beyond the flange, left of the callouts.
  const face=cs?Math.min(319,366-b.receiver.depth*k):319,tip=face-b.seatProjection*k,seatY=144,rootY=seatY+b.seatThickness*k,bot=rootY+b.ribDepth*k,center=face-b.reach*k;
  svg+='<g data-view="welded-bracket-side">';
  svg+=rect(face,111,b.receiver.flangeThickness*k,bot-85,sc.isNew?'runway-line':'reference-line');
  if(cs){const Y=(z:number)=>seatY-z*k;svg+=stiffenerSideEdges(cs.g,{face,k,Y,top:111,bottom:bot+26,cls:sc.isNew?'runway-line':'reference-line'});svg+=multiLeader([lowerEdgeTarget(cs.g,{face,k,Y})],[398,Math.max(bot+16,300)],cs.callout);}
  svg+=rect(tip,seatY,b.seatProjection*k,b.seatThickness*k,'runway-line')+(rg.tapered?'':rect(tip,rootY,b.seatProjection*k,b.ribDepth*k,'runway-line'));
  svg+=rect(center-d.bearing.width*k/2,seatY-d.bearing.thickness*k,d.bearing.width*k,d.bearing.thickness*k,'runway-line');
  svg+=line([center,101],[center,bot+9],'grid-line');
  svg+=dimH(center,face,seatY,103,dim(b.reach));
  if(rg.tapered)svg+=haunchedRibView(rg,{tip,face,rootY,bot,k},dim);
  else{svg+=dimH(tip,face,bot,bot+22,dim(b.seatProjection));
  svg+=dimV(rootY,bot,tip,tip-22,dim(b.ribDepth));}
  svg+=multiLeader([[center,seatY-d.bearing.thickness*k]],[48,87],[`RUNWAY BEARING PLATE / ${detailRef(detailTitles.bearing)}`]);
  svg+=multiLeader([[face+3,116]],[398,116],[columnReference(p),sc.isNew?'CHECKED UNDER NEW COLUMN':'LOCAL CHECKS PER ENTERED DATA']);
  svg+=multiLeader([[tip+20,seatY+b.seatThickness*k/2]],[398,202],[`SEAT PL ${size(b.seatThickness)}`]);
  // The seat delivers the locating bearing's longitudinal force and H BOTTOM from the bearing bolts to the column
  // flange (and, with crane-level bracing, to the strut); the weld length reads right of the symbol.
  svg+=(sc.field?fieldFilletLeader:filletLeader)([[face,seatY]],[398,150],size(cw.size),[`SEAT PL TO COL. FLANGE, TOP, ${sc.field?'FIELD':'SHOP'}`,collector?`COLLECTOR; SEE ${detailRef(detailTitles.strutPlan)}`:'LONG. AND LATERAL FORCE']);
  svg+=text(398+53,150-3+7,dim(cw.length),8);
  svg+=(sc.field?fieldFilletLeader:filletLeader)([[face,rootY+b.ribDepth*k*.56]],[398,242],size(b.rootWeld),[`${sc.weld} TO ${sc.name}`,'BOTH SIDES OF EACH RIB',rg.tapered?'CONT. FULL ROOT DEPTH':'CONT. FULL RIB DEPTH'],true);
  return {svg:svg+'</g>',scale:scale.label};
 }});
 // Plan: the bearing plates and their bolt holes on the seat at an interior grid, the ribs under it hidden.
 views.push({title:bracketPlanTitle,render:()=>{
  let svg='';
  const scale=sheetDrawingScale(Math.min(.24,165/b.seatProjection,280/b.seatLength),p.units),k=scale.pointsPerMm,cx=821,face=120,tip=face+b.seatProjection*k;
  // x along the runway from the grid, + toward the next grid; y from the column face toward the runway.
  const X=(x:number)=>cx+x*k,Y=(y:number)=>face+y*k,half=b.seatLength/2,left=X(-half),right=X(half);
  svg+='<g data-view="welded-bracket-plan">';
  svg+=rect(cx-b.receiver.width*k/2,face-b.receiver.flangeThickness*k,b.receiver.width*k,b.receiver.flangeThickness*k,sc.isNew?'runway-line':'reference-line');
  svg+=rect(left,face,b.seatLength*k,b.seatProjection*k,'runway-line');
  for(const sign of [-1,1]){const x=sign*b.ribSpacing/2;for(const edge of [-1,1])svg+=line([X(x+edge*b.ribThickness/2),face],[X(x+edge*b.ribThickness/2),tip],'hidden-line');}
  // Bearing plates: simple spans, the sliding end of the lower bay and the locating end of the higher bay, each
  // girder end half the joint gap from the grid; a continuous girder, one plate centered on the grid.
  const L=d.bearing.length,W=d.bearing.width;
  const plates=p.system==='simple'?[{end:-gap/2,dir:-1,label:'SLIDING'},{end:gap/2,dir:1,label:'LOCATING'}]:[{end:-L/2,dir:1,label:''}];
  const rowsY=g&&eb?[b.reach-eb.bolts.gauge/2,b.reach+eb.bolts.gauge/2]:[],holesX:number[]=[];
  for(const v of plates){
   const x0=Math.min(v.end,v.end+v.dir*L);
   svg+=rect(X(x0),Y(b.reach-W/2),L*k,W*k,'runway-line');
   if(g)for(const row of g.rows){const x=v.end+v.dir*row;holesX.push(x);for(const y of rowsY)svg+=circle(X(x),Y(y),g.hole/2*k,'runway-line')+line([X(x)-2.5,Y(y)],[X(x)+2.5,Y(y)])+line([X(x),Y(y)-2.5],[X(x),Y(y)+2.5]);}
  }
  // The hole ordinates read down from the seat tip; the end labels and the notes stand below the longest of them.
  // Two hole columns centered on the grid whose half spacing is off the dimension grid read EQ, with their spacing in the
  // note: the same value as the bearing plate on the girder sheet and the calculation.
  const ordinates=g&&eb?[0,...holesX].sort((a,c)=>a-c):[],centered=holesX.length===2&&Math.abs(holesX[0]+holesX[1])<.01&&!onDimensionGrid(Math.abs(holesX[0]),p.units);
  const ordinateText=(x:number)=>x?centered?'EQ':dim(Math.abs(x)):'0',ordinateFoot=tip+14+Math.max(0,...ordinates.map(x=>textWidth(ordinateText(x),lettering.text)));
  let notesY=ordinateFoot+lettering.leading;
  for(const v of plates){
   // Each label centered under its plate, on two lines when the pair would run together on one.
   if(v.label&&g){const one=(L+gap)*k>1.1*(textWidth('SLIDING END',lettering.text,true)+textWidth('LOCATING END',lettering.text,true))/2+6,y=ordinateFoot+lettering.text+6;
    svg+=one?text(X(v.end+v.dir*L/2),y,`${v.label} END`,lettering.text,'middle',700):text(X(v.end+v.dir*L/2),y,v.label,lettering.text,'middle',700)+text(X(v.end+v.dir*L/2),y+lettering.leading,'END',lettering.text,'middle',700);
    notesY=Math.max(notesY,y+(one?0:lettering.leading)+lettering.leading+4);}
  }
  // Column stiffeners at the seat: the column broken just beyond the flange, the plates cut.
  if(cs)svg+=stiffenerPlan(cs.g,{cx,face,k,cls:sc.isNew?'runway-line':'reference-line',stub:10}).svg;
  svg+=line([cx,face-b.receiver.flangeThickness*k-14],[cx,tip+8],'grid-line');
  svg+=line([left-10,Y(b.reach)],[right+10,Y(b.reach)],'grid-line');
  svg+=dimH(left,right,face,87,dim(b.seatLength));
  // The girder C/L from the column face and the projection beyond it, extension lines clear of the seat edge;
  // the hole columns as ordinates from the grid below the seat, the rows at the gauge on the girder C/L.
  svg+=dimV(face,Y(b.reach),left-2,left-16,dim(b.reach))+dimV(face,tip,left-2,left-34,dim(b.seatProjection));
  if(g&&eb){
   for(const x of ordinates)svg+=line([X(x),tip+3],[X(x),tip+12])+text(X(x)+3,tip+14,ordinateText(x),lettering.text,'end',400,-90);
   svg+=text(left,notesY,`HOLES: ${centered?`${dim(Math.abs(holesX[1]-holesX[0]))} APART, CENTERED ON THE GRID`:'ORDINATES FROM THE GRID'}; ROWS AT ${dim(eb.bolts.gauge)} GAUGE ON THE GIRDER C/L.`,lettering.text);
   svg+=text(left,notesY+lettering.noteLeading,p.system==='simple'?endGridBearingNote(p,g.rows,dim):`AT A RUNWAY-END GRID: THE GIRDER END ON THE GRID, ITS BEARING INBOARD; HOLES ${dim(g.rows[0])} AND ${dim(g.rows[1])} FROM IT.`,lettering.text);
  }
  // Keys: the transverse section between the rib and the outer hole column, the elevation from the runway side.
  const cut=X(g?(b.ribSpacing/2+b.ribThickness/2+g.rows[1]+gap/2)/2:(b.ribSpacing/2+half)/2);
  svg+=sectionCut([cut,face-3],[cut,tip+3],[-1,0],detailTitles.weldedBracket,['a'],'over');
  svg+=sectionCut([left-4,tip+6],[right+4,tip+6],[0,-1],bracketElevationTitle,['b']);
  const plate=plates[plates.length-1],items:{at:XY;labels:string[];weld?:string}[]=[
   {at:[X(b.ribSpacing/2+b.ribThickness/2),Y(b.seatProjection*.1)],labels:['CONT. SEAT-TO-RIB','BOTH SIDES / EACH RIB'],weld:size(b.seatWeld)},
   {at:[right,Y(b.seatProjection*.3)],labels:[`SEAT PL ${size(b.seatThickness)}`,`${dim(b.seatLength)} X ${dim(b.seatProjection)}`]},
   {at:[X(plate.end+plate.dir*L*.8),Y(b.reach-W/2)],labels:[`BEARING PL ${size(d.bearing.thickness)} X ${dim(W)} X ${dim(L)}`,`EACH GIRDER END; SEE ${detailRef(bearingBoltsTitle(p))}`]},
   ...(g&&eb?[{at:[X(plate.end+plate.dir*g.rows[1])+g.hole/2*k,Y(rowsY[1])] as XY,labels:[`${plates.length*4} - ${size(g.hole)} STD HOLES IN SEAT`,`FOR ${size(eb.bolts.diameter)} ${eb.bolts.grade} BEARING BOLTS`]}]:[])
  ];
  svg+=labelColumn(items,right+40,cs?face-20:face+10,cs?tip-10:tip);
  return {svg:svg+'</g>',scale:scale.label};
 }});
 views.push({title:bracketElevationTitle,render:()=>{
  let svg='';
  const scale=sheetDrawingScale(Math.min(.24,175/(b.ribDepth+b.seatThickness),290/b.seatLength),p.units),k=scale.pointsPerMm,cx=224,top=435,bot=top+(b.seatThickness+b.ribDepth)*k;
  svg+='<g data-view="welded-bracket-face">';
  svg+=rect(cx-b.receiver.width*k/2,409,b.receiver.width*k,bot-397,sc.isNew?'runway-line':'reference-line');
  svg+=rect(cx-b.seatLength*k/2,top,b.seatLength*k,b.seatThickness*k,'runway-line');
  for(const side of [-1,1])svg+=rect(cx+(side*b.ribSpacing-b.ribThickness)*k/2,top+b.seatThickness*k,b.ribThickness*k,b.ribDepth*k,'runway-line');
  svg+=dimH(cx-b.ribSpacing*k/2,cx+b.ribSpacing*k/2,bot,bot+30,dim(b.ribSpacing));
  if(cs){const Y=(z:number)=>top-z*k;svg+=stiffenerFaceHidden(cs.g,{cx,k,Y});svg+=multiLeader([[cx+(cs.g.tw/2+cs.g.width*.8)*k,Y(cs.g.levels[1].z)-cs.g.t*k/2]],[396,Math.max(520,Y(cs.g.levels[1].z)-50)],['COL. STIFFENERS BEYOND',`(HIDDEN); SEE ${detailRef(columnStiffenerTitle)}`]);}
  if(rg.tapered)svg+=haunchedFaceRibs(rg,b.ribSpacing,{cx,ribTop:top+b.seatThickness*k,bot,k},dim);
  else svg+=dimV(top+b.seatThickness*k,bot,cx-b.ribSpacing*k/2,106,dim(b.ribDepth));
  svg+=multiLeader([[-1,1].map(sign=>cx+sign*b.ribSpacing*k/2).map(x=>[x,top+b.seatThickness*k+b.ribDepth*k*.5] as [number,number])].flat(),[396,472],rg.tapered?haunchedRibCallout(rg,size(b.ribThickness),dim):[`2 RIB PL ${size(b.ribThickness)}`,`${dim(b.ribDepth)} DEEP`,`X ${dim(b.seatProjection)} PROJ.`]);
  svg+=text(42,Math.max(633,bot+52),rg.tapered?'HAUNCHED RIBS: STRAIGHT SLOPING FREE EDGE; DO NOT NOTCH, COPE OR WELD TO IT.':'RECTANGULAR RIBS: DO NOT TAPER OR COPE WITHOUT REANALYSIS.',7.5);
  return {svg:svg+'</g>',scale:scale.label};
 }});
 {
  const ties=topFlangeRestraint(p);
  const notes=[
   `${rg.tapered?`TWO HAUNCHED RIB PLATES, ${dim(rg.root)} DEEP AT THE COLUMN TAPERING STRAIGHT TO ${dim(rg.tip)} AT THE SEAT EDGE, AND A SEAT PLATE`:'TWO RECTANGULAR RIBS AND A SEAT PLATE'}. THE RIBS CARRY THE GRAVITY BEARINGS; NO CREDIT FOR BOLTS, KNEE PLATES OR COMPOSITE RIB/SEAT ACTION. ${sc.field?'FIELD':'SHOP'} WELD THE SEAT TO THE COLUMN FLANGE WITH A ${size(cw.size)} TOP FILLET ${dim(cw.length)} LONG: ${eb?'THE BEARING BOLTS BRING THE GIRDER\'S LONGITUDINAL FORCE (LOCATING END) AND H BOTTOM INTO THE SEAT, AND THE FILLET DELIVERS THEM TO THE COLUMN':'IT DELIVERS THE GIRDER\'S LONGITUDINAL FORCE AND H BOTTOM FROM THE BEARING TO THE COLUMN'}${collector?` AND THE STRUT (${detailRef(detailTitles.strutPlan)})`:''}.`,
   `PLATES: ${format(d.material.Fy,'stress',p.units,p.units==='SI'?0:3)} MIN. YIELD. WELDS: ${electrodeClass(d.material.Fexx,p.units)} ELECTRODE. CONTINUOUS FILLETS AS SHOWN.`,
   ...(rg.tapered?haunchedRibNotes(p.units):[]),
   sc.isNew?`SHOP WELD THE SEAT TO THE RIBS, AND THE RIB ROOTS AND SEAT TO THE ${sc.name}, BEFORE ERECTION; INSPECT STARTS, STOPS AND TOES.`:'SHOP WELD THE SEAT TO THE RIBS. FIELD WELD THE RIB ROOTS AND SEAT TO THE EXISTING COLUMN AS FLAGGED. PROVIDE ACCESS TO BOTH ROOT WELDS BEFORE PLACING THE RUNWAY; INSPECT STARTS, STOPS AND TOES.',
   `KEEP GIRDER ENDS AND BEARINGS INDEPENDENT. DO NOT WELD THE SLIDING BEARING TO THE GIRDER. ${eb?`THE BEARING BOLTS LOCATE, GUIDE AND HOLD DOWN THE GIRDER ON THIS SEAT (${detailRef(bearingBoltsTitle(p))}); ${sc.isNew?`DRILL THE SEAT TO MATCH (${detailRef(bracketPlanTitle)})`:`SURVEY THE SEATS; SHIM TO THE THEORETICAL ELEVATION; FIELD DRILL OR REAM THE SEAT HOLES (${detailRef(bracketPlanTitle)}) AFTER THE GIRDER IS LINED AND LEVELED`}. `:''}ONLY ${ties} CONNECT TO THE COLUMN SEPARATELY; H TOP DOES NOT ENTER THE BRACKET.`,
   sc.isNew?`THE ${sc.name} IS DESIGNED FOR AXIAL FORCE AND BENDING UNDER ASCE 7 COMBINATIONS IN THE CALCULATION REPORT${p.columnBase?.enabled?`; BASE PLATE, ANCHOR RODS AND FOOTING: ${detailRef(detailTitles.newColumn)}`:'; ITS BASE AND FOUNDATION ARE BY OTHERS'}.`:p.existingColumn?.enabled?'VERIFY EXISTING COLUMN DIMENSIONS, STEEL GRADE AND WELDABILITY BEFORE FABRICATION. THE EXISTING COLUMN IS CHECKED FOR AXIAL FORCE AND BENDING UNDER ASCE 7 COMBINATIONS IN THE CALCULATION REPORT; FRAME, ANCHORS AND FOUNDATIONS ARE BY OTHERS.':'VERIFY EXISTING COLUMN DIMENSIONS, STEEL GRADE AND WELDABILITY BEFORE FABRICATION. LOCAL COLUMN CHECKS DO NOT VERIFY THE COMPLETE FRAME, COLUMN AXIAL/BENDING INTERACTION OR FOUNDATIONS.',
   `THE BRACKET IS DESIGNED FOR EVERY CONCURRENT CASE OF THE BRACKET DESIGN FORCES BELOW, WITH ITS SELF-WEIGHT; RIB FORCE MAY REVERSE UNDER AN OFFSET BEARING. FOR THE LONGITUDINAL FORCE AND H BOTTOM THE CALCULATION CHECKS ${eb?'THE BEARING BOLTS IN BEARING ON THE SEAT AND THE SEAT FOR PRYING; ':''}THE SEAT FILLET AND RIB ROOT FILLETS AS ONE WELD GROUP WITH THE CONCURRENT VERTICAL LOAD, AND THE SEAT FILLET FOR FATIGUE; AND THE COLUMN FLANGE (LOCAL BENDING) AND WEB (LOCAL YIELDING) UNDER THE SEAT${collector?'; WITH THE BRACING, ALSO THE COLLECTOR FORCE THROUGH THE SEAT FILLET':''}.`
  ];
  const stiffView=columnStiffenerView(s);if(stiffView)views.push(stiffView);
  return {key:'bracket',name:'BRACKETS',views,notes:(t:Style)=>[heading(t,'BRACKET FABRICATION & DESIGN NOTES'),...numbered(t,[...notes,...stiffenerNotes(p)]),...bracketForceBlocks(s,t)]};
 }
}

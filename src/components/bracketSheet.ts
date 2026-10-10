import {supportColumn} from '../engine/drawingData';
import {heading,numbered,table,type Style} from './noteBlocks';
import type {CalculationSnapshot} from '../engine/types';
import {drawingLength,plateInches} from './drawingFormat';
import {sheetDrawingScale,line,rect,text,dimH,dimV,multiLeader,filletLeader,fieldFilletLeader,detailRef,detailTitles,columnReference} from './sheetGraphics';
import {topicSheetSvg,type DetailTopic,type DetailView} from './detailSheet';
import {format} from '../engine/units';
import {usesExistingBracket} from '../engine/existingBracket';
import {existingBracketTopic} from './existingBracketSheet';
/** Column bracket details on their own sheet. */
export function bracketSheetSvg(s:CalculationSnapshot,number='S-05'){
 const topic=bracketTopic(s);return topic?topicSheetSvg(s,topic,number,usesExistingBracket(s.input)?'EXISTING BRACKETS / NEW BOLTED SEATS':'WELDED COLUMN BRACKETS'):'';
}
/** Welded column bracket section, plan and elevation with the bracket notes and reactions, or the existing bracket details. */
export function bracketTopic(s:CalculationSnapshot):DetailTopic|undefined{
 if(usesExistingBracket(s.input))return existingBracketTopic(s);
 const p=s.input,d=p.details,b=d?.bracket;if(!d||!b?.enabled)return undefined;
 const dim=(v:number)=>drawingLength(v,p.units),size=(v:number)=>plateInches(v,p.units);
 const views:DetailView[]=[];
 // Transverse section: true input projection, receiver face, full rectangular rib.
 views.push({title:detailTitles.weldedBracket,render:()=>{
  let svg='';
  const scale=sheetDrawingScale(Math.min(.25,180/(b.ribDepth+b.seatThickness+d.bearing.thickness)),p.units),k=scale.pointsPerMm;
  const face=319,tip=face-b.seatProjection*k,seatY=144,rootY=seatY+b.seatThickness*k,bot=rootY+b.ribDepth*k,center=face-b.reach*k;
  svg+='<g data-view="welded-bracket-side">';
  const colLine=supportColumn(p).isNew?'runway-line':'reference-line';
  svg+=rect(face,111,b.receiver.flangeThickness*k,bot-85,colLine)+line([face+b.receiver.flangeThickness*k,rootY+b.ribDepth*k/2],[face+56,rootY+b.ribDepth*k/2],'reference-line');
  svg+=rect(tip,seatY,b.seatProjection*k,b.seatThickness*k,'runway-line')+rect(tip,rootY,b.seatProjection*k,b.ribDepth*k,'runway-line');
  svg+=rect(center-d.bearing.width*k/2,seatY-d.bearing.thickness*k,d.bearing.width*k,d.bearing.thickness*k,'runway-line');
  svg+=line([center,101],[center,bot+9],'grid-line');
  svg+=dimH(center,face,seatY,103,dim(b.reach));
  svg+=dimH(tip,face,bot,bot+22,dim(b.seatProjection));
  svg+=dimV(rootY,bot,tip,tip-22,dim(b.ribDepth));
  svg+=multiLeader([[center,seatY-d.bearing.thickness*k]],[48,87],[`RUNWAY BEARING PLATE / ${detailRef(detailTitles.bearing)}`]);
  const sc=supportColumn(p);
  svg+=multiLeader([[face+3,116]],[398,116],[columnReference(p),sc.isNew?'CHECKED UNDER NEW COLUMN':'LOCAL CHECKS PER ENTERED DATA']);
  svg+=multiLeader([[tip+20,seatY+b.seatThickness*k/2]],[398,163],[`SEAT PL ${size(b.seatThickness)}`]);
  svg+=(sc.field?fieldFilletLeader:filletLeader)([[face,rootY+b.ribDepth*k*.56]],[398,238],size(b.rootWeld),[`${sc.weld} TO ${sc.name}`,'BOTH SIDES OF EACH RIB','CONT. FULL RIB DEPTH'],true);
  return {svg:svg+'</g>',scale:scale.label};
 }});
 // Plan: no bolts in the welded bracket. Ribs under seat dashed as hidden edges.
 views.push({title:'WELDED BRACKET / PLAN',render:()=>{
  let svg='';
  const scale=sheetDrawingScale(Math.min(.24,165/b.seatProjection,280/b.seatLength),p.units),k=scale.pointsPerMm,cx=821,face=120,tip=face+b.seatProjection*k;
  svg+='<g data-view="welded-bracket-plan">';
  svg+=rect(cx-b.receiver.width*k/2,face-b.receiver.flangeThickness*k,b.receiver.width*k,b.receiver.flangeThickness*k,supportColumn(p).isNew?'runway-line':'reference-line');
  svg+=rect(cx-b.seatLength*k/2,face,b.seatLength*k,b.seatProjection*k,'runway-line');
  for(const sign of [-1,1]){const x=cx+sign*b.ribSpacing*k/2;for(const edge of [-1,1])svg+=line([x+edge*b.ribThickness*k/2,face],[x+edge*b.ribThickness*k/2,tip],'reference-line');}
  svg+=line([cx-b.seatLength*k/2-10,face+b.reach*k],[cx+b.seatLength*k/2+10,face+b.reach*k],'grid-line');
  svg+=dimH(cx-b.seatLength*k/2,cx+b.seatLength*k/2,face,87,dim(b.seatLength));
  svg+=dimH(cx-b.ribSpacing*k/2,cx+b.ribSpacing*k/2,tip,tip+25,dim(b.ribSpacing));
  svg+=dimV(face,tip,cx-b.seatLength*k/2,659,dim(b.seatProjection));
  svg+=multiLeader([[cx+b.seatLength*k/2,face+25]],[1004,150],[`SEAT PL ${size(b.seatThickness)}`,`${dim(b.seatLength)} X ${dim(b.seatProjection)}`]);
  svg+=filletLeader([[cx+b.ribSpacing*k/2,face+b.seatProjection*k*.55]],[1004,238],size(b.seatWeld),['CONT. SEAT-TO-RIB','BOTH SIDES / EACH RIB'],true);
  return {svg:svg+'</g>',scale:scale.label};
 }});
 views.push({title:'BRACKET ELEVATION / LOOKING AT COLUMN',render:()=>{
  let svg='';
  const scale=sheetDrawingScale(Math.min(.24,175/(b.ribDepth+b.seatThickness),290/b.seatLength),p.units),k=scale.pointsPerMm,cx=224,top=435,bot=top+(b.seatThickness+b.ribDepth)*k;
  svg+='<g data-view="welded-bracket-face">';
  svg+=rect(cx-b.receiver.width*k/2,409,b.receiver.width*k,bot-397,supportColumn(p).isNew?'runway-line':'reference-line');
  svg+=rect(cx-b.seatLength*k/2,top,b.seatLength*k,b.seatThickness*k,'runway-line');
  for(const side of [-1,1])svg+=rect(cx+(side*b.ribSpacing-b.ribThickness)*k/2,top+b.seatThickness*k,b.ribThickness*k,b.ribDepth*k,'runway-line');
  svg+=dimH(cx-b.ribSpacing*k/2,cx+b.ribSpacing*k/2,bot,bot+23,dim(b.ribSpacing));
  svg+=dimV(top+b.seatThickness*k,bot,cx-b.ribSpacing*k/2,106,dim(b.ribDepth));
  svg+=multiLeader([[-1,1].map(sign=>cx+sign*b.ribSpacing*k/2).map(x=>[x,top+b.seatThickness*k+b.ribDepth*k*.5] as [number,number])].flat(),[396,472],[`2 RIB PL ${size(b.ribThickness)}`,`${dim(b.ribDepth)} DEEP`,`X ${dim(b.seatProjection)} PROJ.`]);
  svg+=text(42,633,'RECTANGULAR RIBS: DO NOT TAPER OR COPE WITHOUT REANALYSIS.',7.5);
  return {svg:svg+'</g>',scale:scale.label};
 }});
 {
  const notes=[
   'TWO RECTANGULAR RIBS AND SEAT PLATE. GRAVITY BEARINGS ONLY. NO CREDIT FOR BOLTS, KNEE PLATES OR COMPOSITE RIB/SEAT ACTION.',
   `PLATES: ${format(d.material.Fy,'stress',p.units)} MIN. YIELD. WELDS: ${format(d.material.Fexx,'stress',p.units)} ELECTRODE. CONTINUOUS FILLETS AS SHOWN.`,
   supportColumn(p).isNew?`SHOP WELD SEAT TO RIBS AND RIB ROOTS TO THE ${supportColumn(p).name} BEFORE ERECTION; INSPECT STARTS, STOPS AND TOES.`:'SHOP WELD SEAT TO RIBS. FIELD WELD RIB ROOTS TO EXISTING COLUMN AS FLAGGED. PROVIDE ACCESS TO BOTH ROOT WELDS BEFORE PLACING THE RUNWAY; INSPECT STARTS, STOPS AND TOES.',
   'KEEP GIRDER ENDS AND BEARINGS INDEPENDENT. DO NOT WELD THE SLIDING BEARING TO THE GIRDER. LATERAL TIES, LOCATING GUIDES AND HOLD-DOWNS HAVE SEPARATE COLUMN LOAD PATHS.',
   supportColumn(p).isNew?`THE ${supportColumn(p).name} IS DESIGNED FOR AXIAL FORCE AND BENDING UNDER ASCE 7 COMBINATIONS IN THE CALCULATION REPORT${p.columnBase?.enabled?`; BASE PLATE, ANCHOR RODS AND FOOTING: ${detailRef(detailTitles.newColumn)}`:'; ITS BASE AND FOUNDATION ARE BY OTHERS'}.`:p.existingColumn?.enabled?'VERIFY EXISTING COLUMN DIMENSIONS, STEEL GRADE AND WELDABILITY BEFORE FABRICATION. THE EXISTING COLUMN IS CHECKED FOR AXIAL FORCE AND BENDING UNDER ASCE 7 COMBINATIONS IN THE CALCULATION REPORT; FRAME, ANCHORS AND FOUNDATIONS ARE BY OTHERS.':'VERIFY EXISTING COLUMN DIMENSIONS, STEEL GRADE AND WELDABILITY BEFORE FABRICATION. LOCAL COLUMN CHECKS DO NOT VERIFY THE COMPLETE FRAME, COLUMN AXIAL/BENDING INTERACTION OR FOUNDATIONS.',
   'REACTIONS BELOW ARE CONCURRENT AT THE CASE OF MAXIMUM RIB FORCE AT EACH GRID. DO NOT ADD ALTERNATIVE CASES. RIB FORCE MAY REVERSE UNDER AN OFFSET BEARING.'
  ];
  const rows=(s.detailResults?.bracket?.stations??[]).map((r,i)=>[String(i+1),...[r.vertical,r.leftRib,r.rightRib].map(v=>format(v,'force',p.units,3))]);
   return {key:'bracket',name:'BRACKETS',views,notes:(t:Style)=>[heading(t,'BRACKET FABRICATION & DESIGN NOTES'),...numbered(t,notes),heading(t,'BRACKET REACTIONS / FACTORED, CONCURRENT'),table(t,['GRID','V','LEFT RIB','RIGHT RIB'],rows,[.6,1,1,1])]};
 }
}

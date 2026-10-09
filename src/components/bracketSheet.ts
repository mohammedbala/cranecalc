import type {CalculationSnapshot} from '../engine/types';
import {drawingLength,plateInches} from './drawingFormat';
import {sheetDrawingScale,sheetStart,titleBlock,line,rect,text,dimH,dimV,viewTitle,multiLeader,filletLeader,fieldFilletLeader,wrappedText} from './sheetGraphics';
import {format} from '../engine/units';
import {usesExistingBracket} from '../engine/existingBracket';
import {existingBracketSheetSvg} from './existingBracketSheet';
export function bracketSheetSvg(s:CalculationSnapshot){
 if(usesExistingBracket(s.input))return existingBracketSheetSvg(s);
 const p=s.input,d=p.details,b=d?.bracket;if(!d||!b?.enabled)return '';
 const dim=(v:number)=>drawingLength(v,p.units),size=(v:number)=>plateInches(v,p.units);
 let svg=sheetStart(s,'S-05','WELDED COLUMN BRACKET');
 svg+=line([612,76],[612,680],'divider')+line([24,379],[1200,379],'divider');
 // Transverse section: true input projection, receiver face, full rectangular rib.
 {
  const scale=sheetDrawingScale(Math.min(.25,180/(b.ribDepth+b.seatThickness+d.bearing.thickness)),p.units),k=scale.pointsPerMm;
  const face=319,tip=face-b.seatProjection*k,seatY=144,rootY=seatY+b.seatThickness*k,bot=rootY+b.ribDepth*k,center=face-b.reach*k;
  svg+='<g data-view="welded-bracket-side">';
  svg+=rect(face,111,b.receiver.flangeThickness*k,bot-85,'reference-line')+line([face+b.receiver.flangeThickness*k,rootY+b.ribDepth*k/2],[face+56,rootY+b.ribDepth*k/2],'reference-line');
  svg+=rect(tip,seatY,b.seatProjection*k,b.seatThickness*k,'runway-line')+rect(tip,rootY,b.seatProjection*k,b.ribDepth*k,'runway-line');
  svg+=rect(center-d.bearing.width*k/2,seatY-d.bearing.thickness*k,d.bearing.width*k,d.bearing.thickness*k,'runway-line');
  svg+=line([center,101],[center,bot+9],'grid-line');
  svg+=dimH(center,face,seatY,103,dim(b.reach));
  svg+=dimH(tip,face,bot,bot+22,dim(b.seatProjection));
  svg+=dimV(rootY,bot,tip,tip-22,dim(b.ribDepth));
  svg+=multiLeader([[center,seatY-d.bearing.thickness*k]],[48,87],['RUNWAY BEARING PLATE / S-02']);
  svg+=multiLeader([[face+3,116]],[398,116],['EXISTING COLUMN (REF.)','LOCAL CHECKS PER ENTERED DATA']);
  svg+=multiLeader([[tip+20,seatY+b.seatThickness*k/2]],[398,163],[`SEAT PL ${size(b.seatThickness)}`]);
  svg+=fieldFilletLeader([[face,rootY+b.ribDepth*k*.56]],[398,238],size(b.rootWeld),['FIELD WELD TO EXISTING COLUMN','BOTH SIDES OF EACH RIB','CONT. FULL RIB DEPTH'],true);
  svg+=viewTitle(318,350,'COLUMN BRACKET / TRANSVERSE SECTION',scale.label)+'</g>';
 }
 // Plan: no bolts in the welded bracket. Ribs under seat dashed as hidden edges.
 {
  const scale=sheetDrawingScale(Math.min(.24,165/b.seatProjection,280/b.seatLength),p.units),k=scale.pointsPerMm,cx=821,face=120,tip=face+b.seatProjection*k;
  svg+='<g data-view="welded-bracket-plan">';
  svg+=rect(cx-b.receiver.width*k/2,face-b.receiver.flangeThickness*k,b.receiver.width*k,b.receiver.flangeThickness*k,'reference-line');
  svg+=rect(cx-b.seatLength*k/2,face,b.seatLength*k,b.seatProjection*k,'runway-line');
  for(const sign of [-1,1]){const x=cx+sign*b.ribSpacing*k/2;for(const edge of [-1,1])svg+=line([x+edge*b.ribThickness*k/2,face],[x+edge*b.ribThickness*k/2,tip],'reference-line');}
  svg+=line([cx-b.seatLength*k/2-10,face+b.reach*k],[cx+b.seatLength*k/2+10,face+b.reach*k],'grid-line');
  svg+=dimH(cx-b.seatLength*k/2,cx+b.seatLength*k/2,face,87,dim(b.seatLength));
  svg+=dimH(cx-b.ribSpacing*k/2,cx+b.ribSpacing*k/2,tip,tip+25,dim(b.ribSpacing));
  svg+=dimV(face,tip,cx-b.seatLength*k/2,659,dim(b.seatProjection));
  svg+=multiLeader([[cx+b.seatLength*k/2,face+25]],[1004,150],[`SEAT PL ${size(b.seatThickness)}`,`${dim(b.seatLength)} X ${dim(b.seatProjection)}`]);
  svg+=filletLeader([[cx+b.ribSpacing*k/2,face+b.seatProjection*k*.55]],[1004,238],size(b.seatWeld),['CONT. SEAT-TO-RIB','BOTH SIDES / EACH RIB'],true);
  svg+=viewTitle(906,350,'WELDED BRACKET / PLAN',scale.label)+'</g>';
 }
 {
  const scale=sheetDrawingScale(Math.min(.24,175/(b.ribDepth+b.seatThickness),290/b.seatLength),p.units),k=scale.pointsPerMm,cx=224,top=435,bot=top+(b.seatThickness+b.ribDepth)*k;
  svg+='<g data-view="welded-bracket-face">';
  svg+=rect(cx-b.receiver.width*k/2,409,b.receiver.width*k,bot-397,'reference-line');
  svg+=rect(cx-b.seatLength*k/2,top,b.seatLength*k,b.seatThickness*k,'runway-line');
  for(const side of [-1,1])svg+=rect(cx+(side*b.ribSpacing-b.ribThickness)*k/2,top+b.seatThickness*k,b.ribThickness*k,b.ribDepth*k,'runway-line');
  svg+=dimH(cx-b.ribSpacing*k/2,cx+b.ribSpacing*k/2,bot,bot+23,dim(b.ribSpacing));
  svg+=dimV(top+b.seatThickness*k,bot,cx-b.ribSpacing*k/2,106,dim(b.ribDepth));
  svg+=multiLeader([[-1,1].map(sign=>cx+sign*b.ribSpacing*k/2).map(x=>[x,top+b.seatThickness*k+b.ribDepth*k*.5] as [number,number])].flat(),[396,472],[`2 RIB PL ${size(b.ribThickness)}`,`${dim(b.ribDepth)} DEEP`,`X ${dim(b.seatProjection)} PROJ.`]);
  svg+=text(42,633,'RECTANGULAR RIBS: DO NOT TAPER OR COPE WITHOUT REANALYSIS.',7.5);
  svg+=viewTitle(318,655,'BRACKET ELEVATION / LOOKING AT COLUMN',scale.label)+'</g>';
 }
 {
  svg+=text(906,408,'BRACKET FABRICATION & DESIGN NOTES',11,'middle',700);
  const notes=[
   'TWO RECTANGULAR RIBS AND SEAT PLATE. GRAVITY BEARINGS ONLY. NO CREDIT FOR BOLTS, KNEE PLATES OR COMPOSITE RIB/SEAT ACTION.',
   `PLATES: ${format(d.material.Fy,'stress',p.units).toUpperCase()} MIN. YIELD. WELDS: ${format(d.material.Fexx,'stress',p.units).toUpperCase()} ELECTRODE. CONTINUOUS FILLETS AS SHOWN.`,
   'SHOP WELD SEAT TO RIBS. FIELD WELD RIB ROOTS TO EXISTING COLUMN AS FLAGGED. PROVIDE ACCESS TO BOTH ROOT WELDS BEFORE PLACING THE RUNWAY; INSPECT STARTS, STOPS AND TOES.',
   'KEEP GIRDER ENDS AND BEARINGS INDEPENDENT. DO NOT WELD THE SLIDING BEARING TO THE GIRDER. LATERAL TIES, LOCATING GUIDES AND HOLD-DOWNS HAVE SEPARATE COLUMN LOAD PATHS.',
   'VERIFY EXISTING COLUMN DIMENSIONS, STEEL GRADE AND WELDABILITY BEFORE FABRICATION. LOCAL COLUMN CHECKS DO NOT VERIFY THE COMPLETE FRAME, COLUMN AXIAL/BENDING INTERACTION OR FOUNDATIONS.',
   'REACTIONS BELOW ARE CONCURRENT AT THE CASE OF MAXIMUM RIB FORCE AT EACH GRID. DO NOT ADD ALTERNATIVE CASES. RIB FORCE MAY REVERSE UNDER AN OFFSET BEARING.'
  ];let y=428;
  for(const [i,n] of notes.entries()){const w=wrappedText(635,y,`${i+1}. ${n}`,111,7.5,10);svg+=w.svg;y+=w.height+6;}
  const rows=s.detailResults?.bracket?.stations??[];
  svg+=line([637,y],[1181,y])+text(645,y+14,'GRID / V / LEFT RIB / RIGHT RIB',8,'start',700);y+=28;
  rows.slice(0,7).forEach((r,i)=>{svg+=text(645,y+i*12,`${i+1}     ${[r.vertical,r.leftRib,r.rightRib].map(v=>format(v,'force',p.units,2)).join('     ')}`,8);});
 }
 return svg+titleBlock(s,'S-05','WELDED COLUMN BRACKETS')+'</svg>';
}

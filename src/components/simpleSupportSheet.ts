import {activeEndBearing,slidingPhrase} from '../engine/endBearingInputs';
import {flangeTieGeometry,tieRelease,tieSides} from '../engine/tieGeometry';
import type {CalculationSnapshot} from '../engine/types';
import {simpleSupportInput} from '../engine/simpleSupports';
import {referenceColumns,shapeMeters} from '../data/aiscReferenceShapes';
import {defaultFraming,type FramingSettings} from './framingSettings';
import {drawingLength,plateInches} from './drawingFormat';
import {sheetDrawingScale as drawingScale,sheetStart,titleBlock,line,rect,text,dimH,viewTitle,multiLeader,filletLeader,bubble,wrappedText,detailRef} from './sheetGraphics';
import {format} from '../engine/units';
import {usesExistingBracket} from '../engine/existingBracket';

export function sharedSupportRows(s:CalculationSnapshot){
 let x=0;return [0,...s.input.spans].map((length,i)=>{
  x+=length;const at=x,rows=s.detailResults?.interfaces.filter(r=>Math.abs(r.x-at)<1e-6)??[];
  const row=rows.reduce<typeof rows[number]|undefined>((a,b)=>!a||b.vertical>a.vertical?b:a,undefined);
  return {grid:i+1,x:at,row};
 });
}
export function simpleSupportSheetSvg(s:CalculationSnapshot,f:FramingSettings=defaultFraming){
 const p=s.input,d=p.details;if(p.system!=='simple'||!d)return '';
 const c=simpleSupportInput(p),b=p.section,m={column:shapeMeters(referenceColumns.find(v=>v.name===f.column)!)},bs=d.bearing,dim=(v:number)=>drawingLength(v,p.units),size=(v:number)=>plateInches(v,p.units);
 const wb=d.bracket?.enabled?d.bracket:undefined;
 const joint=p.spans.length>1,sides=joint?[-1,1]:[1];
 // The detail is typical: interior grids for adjacent ends, both grids of a single span.
 const gridLabel=joint?'2':'1',gridNote=joint?(p.spans.length>2?`TYP. GRIDS 2 TO ${p.spans.length}`:'GRID 2'):'TYP. GRIDS 1 AND 2';
 let svg=sheetStart(s,'S-04','CRANE RUNWAY / INDEPENDENT GIRDER SUPPORTS');
 svg+=line([612,76],[612,680],'divider')+line([24,379],[1200,379],'divider');
 const scale=drawingScale(Math.min(.28,142/b.d,350/(4*bs.length+c.endGap)),p.units),k=scale.pointsPerMm;
 const cx=250,top=125,bottom=top+b.d*k,g=joint?c.endGap*k/2:0,l=bs.length*k,st=bs.stiffenerThickness*k,extent=2*l+g;
 svg+='<g data-view="independent-end-elevation">';
 svg+=rect(cx-m.column.bf*1000*k/2,99,m.column.bf*1000*k,223,'reference-line');
 svg+=line([cx,90],[cx,323],'grid-line')+bubble(cx,86,gridLabel)+text(cx-12,89,gridNote,7.2,'end');
 const spread=(2*bs.length+c.endGap+2*c.guideTravel)*k;
 if(wb){svg+=rect(cx-wb.seatLength*k/2,bottom+bs.thickness*k,wb.seatLength*k,wb.seatThickness*k,'runway-line');}else{
 svg+=rect(cx-spread/2,bottom+bs.thickness*k,spread,25.4*k,'reference-line');
 svg+=rect(cx-spread/2,bottom+(bs.thickness+25.4)*k,spread,25,'reference-line');
 svg+=line([cx-spread/2,bottom+(bs.thickness+25.4)*k+20],[cx+spread/2,bottom+(bs.thickness+25.4)*k+27],'reference-line');
 }
 for(const side of sides){
  const x=side<0?cx-extent:cx+g,w=extent-g,bc=cx+side*(g+l/2);
  svg+=rect(x,top,w,b.d*k,'runway-line')+line([x,top+b.tf*k],[x+w,top+b.tf*k],'runway-line')+line([x,bottom-b.tf*k],[x+w,bottom-b.tf*k],'runway-line');
  if(b.kind==='cap')svg+=rect(x,top-b.capTw*k,w,b.capTw*k,'runway-line');
  svg+=`<g data-stiffener="full-depth">${rect(bc-st/2,top+b.tf*k,st,(b.d-2*b.tf)*k,'runway-line')}</g>`;
  svg+=rect(bc-l/2,bottom,l,bs.thickness*k,'runway-line');
  svg+=dimH(bc-l/2,bc+l/2,bottom+bs.thickness*k,309,dim(bs.length));
  svg+=text(cx+side*84,334,b.name,8.5,'middle',700);
 }
 if(joint)svg+=dimH(cx-g,cx+g,top,111,dim(c.endGap));
 svg+=line([cx+extent,top],[440,top])+text(445,top+3,'T.O.S. = S-01',8);
 svg+=multiLeader([[cx+g+l/2,top+b.d*k*.46]],[445,184],['PAIRED FITTED STIFFENERS',`PL ${size(bs.stiffenerThickness)} X ${size(bs.stiffenerWidth)}`,'EACH GIRDER END / SEE S-02']);
 svg+=multiLeader([[cx+g+l,bottom+bs.thickness*k/2]],[445,249],[`SEPARATE BEARING PL ${size(bs.thickness)}`,`${dim(bs.width)} W X ${dim(bs.length)} L`]);
 if(joint)svg+=filletLeader([[cx-g-l/2,top+b.d*k*.66]],[47,250],size(bs.weldSize),['STIFFENER WEB FILLETS','FLANGE ATTACHMENT: S-02'],true);
 svg+=text(44,343,usesExistingBracket(p)?'EXISTING BRACKET / NEW BOLTED SEAT: S-05. KEEP GIRDER AND CAP ENDS SEPARATE.':wb?`WELDED COLUMN BRACKET BELOW / S-05. DO NOT BRIDGE GIRDER OR CAP ENDS.${joint?' END GRIDS: ONE GIRDER END, SIMILAR.':''}`:'SHARED COLUMN BRACKET / SPREADER BELOW (REF.). DO NOT BRIDGE GIRDER OR CAP ENDS.',7.8);
 svg+=viewTitle(318,364,joint?'ADJACENT GIRDER ENDS AT COLUMN':'GIRDER END AT COLUMN',scale.label)+'</g>';

 // True-scale plan: each end has its OWN transverse tie to the same column.
 svg+='<g data-view="independent-tie-plan">';
 const tieLayout=flangeTieGeometry(p),tieStart=tieLayout?.start??0,tieReach=tieLayout?.face??d.brace.length,flanges=tieSides(p).length>1?'TOP & BOTTOM':'TOP FLANGE';
 // The column outline and its label stay above the view note at y = 335.
 const ps=drawingScale(Math.min(.24,175/(b.bf/2+d.brace.length+150),335/(4*bs.length+c.endGap),118/tieReach),p.units),pk=ps.pointsPerMm,px=895,py=155,pg=joint?c.endGap*pk/2:0,pl=bs.length*pk,span=2*pl+pg;
 const colY=py+tieReach*pk,bar=d.brace.thickness*pk,gus=d.brace.gussetThickness*pk;
 svg+=rect(px-m.column.bf*1000*pk/2,colY,m.column.bf*1000*pk,37,'reference-line');
 svg+=line([px,93],[px,colY+45],'grid-line')+bubble(px,86,gridLabel)+text(px-12,89,gridNote,7.2,'end');
 for(const side of sides){
  const x=side<0?px-span:px+pg,at=px+side*(pg+pl/2-(tieLayout?.attachment.longitudinalSetback??0)*pk);
  svg+=rect(x,py-b.bf*pk/2,span-pg,b.bf*pk,'runway-line');
  if(tieLayout)svg+=rect(at-tieLayout.attachment.saddleLength*pk/2,py+tieLayout.rootStart*pk,tieLayout.attachment.saddleLength*pk,tieLayout.rootLength*pk,'runway-line');
  // Paired bars on opposite sides of each independent receiving gusset.
  for(const ply of [-1,1])svg+=rect(at+ply*(gus+bar)/2-bar/2,py+tieStart*pk,bar,d.brace.length*pk,'runway-line');
  svg+=rect(at-gus/2,py+(tieLayout?.rootStart??0)*pk,gus,(tieLayout?tieLayout.gussetEnd-tieLayout.rootStart:d.brace.connectionLength)*pk,'runway-line')+rect(at-gus/2,colY-(tieLayout?.connection??d.brace.connectionLength)*pk,gus,(tieLayout?.connection??d.brace.connectionLength)*pk,'reference-line');
 }
 if(joint)svg+=dimH(px-pg,px+pg,py-b.bf*pk/2,111,dim(c.endGap));
 if(joint)svg+=multiLeader([[px-pg-pl/2+(tieLayout?.attachment.longitudinalSetback??0)*pk,py+(tieStart+d.brace.length*.55)*pk]],[643,247],['LEFT GIRDER: SEPARATE TIE',`${flanges} / SEE ${tieLayout?'S-06':'S-02'}`],8.5,[[[629,py+d.brace.length*pk*.55]]]);
 svg+=multiLeader([[px+pg+pl/2-(tieLayout?.attachment.longitudinalSetback??0)*pk,py+(tieStart+d.brace.length*.55)*pk]],[1025,247],['RIGHT GIRDER: SEPARATE TIE',`${flanges} / SEE ${tieLayout?'S-06':'S-02'}`]);
 svg+=text(918,colY+48,'BUILDING COLUMN (REF.)',8,'middle');
 svg+=text(635,335,tieRelease(p)?'COLUMN GUSSETS: SLEEVED BOLTS IN VERTICAL SLOTS. BARS FLEX WITH END ROTATION AND THERMAL TRAVEL.':'COLUMN-SIDE ATTACHMENTS: BARS FLEX WITH END ROTATION, THERMAL TRAVEL AND SUPPORT DEFLECTION.',7.6);
 svg+=viewTitle(906,364,'INDEPENDENT FLANGE TIES / PLAN',ps.label)+'</g>';

 svg+='<g data-view="bearing-movement">';
 const ms=drawingScale(Math.min(.30,190/(bs.length+2*c.guideTravel)),p.units),mk=ms.pointsPerMm;
 for(const [i,at] of [170,460].entries()){
  const y=457,bl=bs.length*mk,bt=bs.thickness*mk,travel=c.guideTravel*mk;
  svg+=rect(at-bl/2,y-42,bl,42,'runway-line')+line([at-bl/2,y-b.tf*mk],[at+bl/2,y-b.tf*mk],'runway-line');
  svg+=rect(at-bl/2,y,bl,bt,'runway-line');
  svg+=rect(at-bl/2-travel,y+bt,bl+2*travel,25.4*mk,'reference-line');
  svg+=line([at,y-50],[at,y+45],'grid-line');
  svg+=text(at,400,i?'RIGHT END / SLIDING':'LEFT END / LOCATING',9,'middle',700);
  svg+=dimH(at-bl/2,at+bl/2,y+bt,514,dim(bs.length));
  if(i){svg+=dimH(at+bl/2,at+bl/2+travel,y+bt,493,'')+text(at+bl/2+travel+5,496,`${size(c.guideTravel)} TRAVEL EA. WAY`,8);}
  svg+=text(at,543,i?'ALLOW LONGITUDINAL TRAVEL':'TRANSFER LONGITUDINAL FORCE',8,'middle');
  svg+=text(at,557,'PERMIT END ROTATION',8,'middle');
 }
 const moveRef=activeEndBearing(p)?detailRef('GIRDER END BEARINGS / LOCATING AND SLIDING'):'';
 const note=wrappedText(44,588,moveRef?`BOLT EACH BEARING PER ${moveRef}: STANDARD HOLES AND PRETENSIONED BOLTS AT THE LOCATING END; SLOTS IN THE GIRDER FLANGE, PLATE WASHERS AND ${slidingPhrase(activeEndBearing(p)!)} AT THE SLIDING END. DO NOT CLAMP THE GIRDER FLANGE AT THE SLIDING END. MAINTAIN FULL BEARING THROUGHOUT THE TRAVEL.`:'LOCATING AND GUIDED HOLD-DOWN ATTACHMENTS SHALL BE DESIGNED AT THE BUILDING INTERFACE. DO NOT CLAMP THE SLIDING END AGAINST MOVEMENT OR DRILL UNDETAILED FLANGE HOLES. MAINTAIN FULL BEARING THROUGHOUT THE REQUIRED TRAVEL.',102,8.2,12);svg+=note.svg;
 if(!moveRef)svg+=text(44,640,'SYMBOLS DEFINE RESTRAINT / MOVEMENT; THEY DO NOT SIZE THE RECEIVING ATTACHMENTS.',7.6);
 svg+=viewTitle(318,656,'BEARING MOVEMENT REQUIREMENTS',ms.label)+'</g>';

 svg+='<g data-view="shared-support-reactions">';
 svg+=text(637,402,'SHARED BRACKET / CONCURRENT VERTICAL REACTIONS',10,'start',700);
 const columns=[641,691,809,927,1060];['GRID','LEFT V','RIGHT V','COMBINED V','SEAT M'].forEach((v,i)=>svg+=text(columns[i],422,v,8,'start',700));
 let y=435;
 for(const {grid,row} of sharedSupportRows(s)){
  const up=(v:string)=>p.units==='US'?v.toUpperCase():v;
  const vf=(end:'left'|'right')=>row?.ends?up(format(row.ends.filter(v=>v.end===end).reduce((a,v)=>a+v.vertical,0),'force',p.units)):'—';
  [String(grid),vf('right'),vf('left'),row?up(format(row.vertical,'force',p.units)):'PENDING',row?.seatMoment!==undefined?up(format(row.seatMoment,'moment',p.units)):'—'].forEach((v,i)=>svg+=text(columns[i],y,v,8.5));y+=14;
 }
 svg+=text(638,y+2,'AT MAXIMUM COMBINED DOWNWARD REACTION / EACH GRID.',7.5);
 svg+=text(638,y+13,'SEAT M = SUM V X OFFSET FROM GRID; POSITIVE TOWARD NEXT GRID.',7.5);
 const bearingRef=activeEndBearing(p)?detailRef('GIRDER END BEARINGS / LOCATING AND SLIDING'):'';
 const notes=bearingRef?[
  `${usesExistingBracket(p)?'EXISTING BRACKET AND NEW BOLTED SEAT: S-05':wb?'WELDED GRAVITY BRACKET: S-05':'BRACKET BY OTHERS'}. BOLTED END BEARINGS TRANSFER LONGITUDINAL FORCE AND UPLIFT (${bearingRef}); FLANGE TIES TRANSFER LATERAL FORCE. INTERFACE FORCES: SEE CALCULATION REPORT.`,
  'LEFT END OF EACH BAY LOCATES LONGITUDINALLY. FULL CRANE TRACTION IS ASSIGNED TO EACH OCCUPIED BAY IN SEPARATE BOUNDING CASES; DO NOT ADD THESE CASES.',
  `GIRDER ANALYSIS SPANS ARE GRID-TO-GRID; BEARINGS ARE INSET AS SHOWN. LOCATING ENDS: STANDARD HOLES, PRETENSIONED. SLIDING ENDS: SLOTS, ${slidingPhrase(activeEndBearing(p)!)} (${bearingRef}).`,
  'REFERENCE AIST TECHNICAL REPORT 13 §5.8.1. GIRDER AND CAP ENDS REMAIN SEPARATE. RAIL JOINTS ARE DETAILED INDEPENDENTLY.'
 ]:[
  usesExistingBracket(p)?'EXISTING BRACKET AND NEW BOLTED SEAT: S-05. SEPARATE TIES AND LOCATING ATTACHMENTS TRANSFER HORIZONTAL FORCES.':wb?'WELDED GRAVITY BRACKET: S-05. SEPARATE HORIZONTAL CONNECTIONS TRANSFER LATERAL AND LONGITUDINAL FORCES. INTERFACE FORCES: SEE CALCULATION REPORT.':'DESIGN EACH BRACKET FOR THE SIMULTANEOUS GIRDER REACTIONS, LATERAL FORCES AND ECCENTRICITY TO THE COLUMN. INTERFACE FORCES: SEE CALCULATION REPORT.',
  'LEFT END OF EACH BAY LOCATES LONGITUDINALLY. FULL CRANE TRACTION IS ASSIGNED TO EACH OCCUPIED BAY IN SEPARATE BOUNDING CASES; DO NOT ADD THESE CASES.',
  usesExistingBracket(p)?'GIRDER SPANS ARE GRID-TO-GRID. BEARINGS ARE INSET; EXISTING SUPPORT ASSESSMENT AND MOVEMENT COMPATIBILITY ARE REQUIRED.':wb?'GIRDER ANALYSIS SPANS ARE GRID-TO-GRID; BEARINGS ARE INSET AS SHOWN. WELDED BRACKET S-05; COLUMN-SIDE MOVEMENT ATTACHMENTS REQUIRE PROJECT DESIGN.':'GIRDER SPANS IN ANALYSIS ARE GRID-TO-GRID. BEARINGS ARE INSET AS SHOWN; BRACKET SPREADER AND COLUMN-SIDE CONNECTIONS REQUIRE PROJECT DESIGN.',
  'REFERENCE AIST TECHNICAL REPORT 13 §5.8.1. GIRDER AND CAP ENDS REMAIN SEPARATE. RAIL JOINTS ARE DETAILED INDEPENDENTLY.'
 ];
 let ny=Math.max(533,y+32);for(const note of notes){const w=wrappedText(638,ny,note,110,7.5,10);svg+=w.svg;ny+=w.height+7;}
 svg+='</g>';
 return svg+titleBlock(s,'S-04','INDEPENDENT GIRDER SUPPORTS')+'</svg>';
}

import {supportColumn} from '../engine/drawingData';
import {activeEndBearing,slidingPhrase} from '../engine/endBearingInputs';
import {flangeTieGeometry,tieRelease,tieSides} from '../engine/tieGeometry';
import type {CalculationSnapshot} from '../engine/types';
import {simpleSupportInput} from '../engine/simpleSupports';
import {referenceColumns,shapeMeters} from '../data/aiscReferenceShapes';
import {defaultFraming,type FramingSettings} from './framingSettings';
import {drawingLength,plateInches} from './drawingFormat';
import {sheetDrawingScale as drawingScale,line,rect,text,dimH,multiLeader,filletLeader,bubble,wrappedText,detailRef,detailTitles,columnReference} from './sheetGraphics';
import {heading,numbered,paragraph,table,type Style} from './noteBlocks';
import {topicSheetSvg,type DetailTopic,type DetailView} from './detailSheet';
import {format} from '../engine/units';
import {usesExistingBracket} from '../engine/existingBracket';

export function sharedSupportRows(s:CalculationSnapshot){
 let x=0;return [0,...s.input.spans].map((length,i)=>{
  x+=length;const at=x,rows=s.detailResults?.interfaces.filter(r=>Math.abs(r.x-at)<1e-6)??[];
  const row=rows.reduce<typeof rows[number]|undefined>((a,b)=>!a||b.vertical>a.vertical?b:a,undefined);
  return {grid:i+1,x:at,row};
 });
}
/** Independent girder support details on their own sheet. */
export function simpleSupportSheetSvg(s:CalculationSnapshot,f:FramingSettings=defaultFraming,number='S-04'){
 const topic=simpleSupportTopic(s,f);return topic?topicSheetSvg(s,topic,number,'INDEPENDENT GIRDER SUPPORTS'):'';
}
/** Independent girder ends at a shared support: end elevation, tie plan and bearing movement, with the shared bracket reactions. */
export function simpleSupportTopic(s:CalculationSnapshot,f:FramingSettings=defaultFraming):DetailTopic|undefined{
 const p=s.input,d=p.details;if(p.system!=='simple'||!d)return undefined;
 const c=simpleSupportInput(p),b=p.section,m={column:shapeMeters(referenceColumns.find(v=>v.name===f.column)!)},bs=d.bearing,dim=(v:number)=>drawingLength(v,p.units),size=(v:number)=>plateInches(v,p.units);
 const wb=d.bracket?.enabled?d.bracket:undefined;
 const joint=p.spans.length>1,sides=joint?[-1,1]:[1];
 // The detail is typical: interior grids for adjacent ends, both grids of a single span.
 const gridLabel=joint?'2':'1',gridNote=joint?(p.spans.length>3?`TYP. GRIDS 2 THRU ${p.spans.length}`:p.spans.length>2?'TYP. GRIDS 2 AND 3':'GRID 2'):'TYP. GRIDS 1 AND 2';
 const bracketRef=detailRef(usesExistingBracket(p)?detailTitles.existingBracket:detailTitles.weldedBracket),views:DetailView[]=[];
 views.push({title:detailTitles.supportEnd(joint),render:()=>{
 let svg='';
 const scale=drawingScale(Math.min(.28,142/b.d,350/(4*bs.length+c.endGap)),p.units),k=scale.pointsPerMm;
 const cx=250,top=125,bottom=top+b.d*k,g=joint?c.endGap*k/2:0,l=bs.length*k,st=bs.stiffenerThickness*k,extent=2*l+g;
 // Rows below the lowest steel and a label column right of the girders follow the drawn size, so the
 // detail stays clear at any scale.
 const lowest=bottom+bs.thickness*k+(wb?wb.seatThickness*k:25.4*k+27),dimY=lowest+31,nameY=dimY+18,lx=cx+extent+85;
 const stiffY=top+Math.max(59,(bottom-top)*.3),bearingY=Math.max(stiffY+(joint?99:46),bottom+7),noteY=Math.max(nameY+16,bearingY+27);
 svg+='<g data-view="independent-end-elevation">';
 // The column beyond runs between the end gap dimension above and the bearing length dimensions below.
 svg+=rect(cx-m.column.bf*1000*k/2,top-11,m.column.bf*1000*k,lowest+14-(top-11),'reference-line');
 svg+=line([cx,90],[cx,nameY-4],'grid-line')+bubble(cx,86,gridLabel)+text(cx-12,89,gridNote,7.2,'end');
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
  svg+=dimH(bc-l/2,bc+l/2,bottom+bs.thickness*k,dimY,dim(bs.length));
  svg+=text(cx+side*(g+l),nameY,b.name,8.5,'middle',700);
 }
 if(joint)svg+=dimH(cx-g,cx+g,top,111,dim(c.endGap));
 svg+=line([cx+extent,top],[lx-5,top])+text(lx,top+3,'T.O.S. EL., SEE S-01',8);
 svg+=multiLeader([[cx+g+l/2,top+b.d*k*.46]],[lx,stiffY],['PAIRED FITTED STIFFENERS',`PL ${size(bs.stiffenerThickness)} X ${size(bs.stiffenerWidth)}`,`EACH GIRDER END / SEE ${detailRef(detailTitles.bearing)}`]);
 svg+=multiLeader([[cx+g+l,bottom+bs.thickness*k/2]],[lx,bearingY],[`SEPARATE BEARING PL ${size(bs.thickness)}`,`${dim(bs.width)} W X ${dim(bs.length)} L`]);
 // Both girder ends are alike, so the stiffener welds are called out on the right one with the others.
 if(joint)svg+=filletLeader([[cx+g+l/2+st/2,top+b.d*k*.66]],[lx,stiffY+53],size(bs.weldSize),['STIFFENER WEB FILLETS, TYP. BOTH ENDS',`FLANGE ATTACHMENT: ${detailRef(detailTitles.bearing)}`],true);
 svg+=text(Math.min(44,cx-extent),noteY,usesExistingBracket(p)?`EXISTING BRACKET / NEW BOLTED SEAT: ${bracketRef}. KEEP GIRDER AND CAP ENDS SEPARATE.`:wb?`WELDED COLUMN BRACKET BELOW / ${bracketRef}. DO NOT BRIDGE GIRDER OR CAP ENDS.${joint?' END GRIDS: ONE GIRDER END, SIMILAR.':''}`:'SHARED COLUMN BRACKET / SPREADER BELOW (REF.). DO NOT BRIDGE GIRDER OR CAP ENDS.',7.8);
 return {svg:svg+'</g>',scale:scale.label};
 }});

 // True-scale plan: each end has its OWN transverse tie to the same column.
 views.push({title:detailTitles.supportTies,render:()=>{
 let svg='<g data-view="independent-tie-plan">';
 const tieLayout=flangeTieGeometry(p),tieRef=detailRef(tieLayout?detailTitles.flangeTie:detailTitles.tie),tieStart=tieLayout?.start??0,tieReach=tieLayout?.face??d.brace.length,flanges=tieSides(p).length>1?'TOP & BOTTOM':'TOP FLANGE';
 // The column outline and its label stay above the view note at y = 335.
 const ps=drawingScale(Math.min(.24,175/(b.bf/2+d.brace.length+150),335/(4*bs.length+c.endGap),118/tieReach),p.units),pk=ps.pointsPerMm,px=895,py=155,pg=joint?c.endGap*pk/2:0,pl=bs.length*pk,span=2*pl+pg;
 const colY=py+tieReach*pk,bar=d.brace.thickness*pk,gus=d.brace.gussetThickness*pk;
 const sc=supportColumn(p),colLine=sc.isNew?'runway-line':'reference-line';
 svg+=rect(px-m.column.bf*1000*pk/2,colY,m.column.bf*1000*pk,37,colLine);
 svg+=line([px,93],[px,colY+37],'grid-line')+bubble(px,86,gridLabel)+text(px-12,89,gridNote,7.2,'end');
 for(const side of sides){
  const x=side<0?px-span:px+pg,at=px+side*(pg+pl/2-(tieLayout?.attachment.longitudinalSetback??0)*pk);
  svg+=rect(x,py-b.bf*pk/2,span-pg,b.bf*pk,'runway-line');
  if(tieLayout)svg+=rect(at-tieLayout.attachment.saddleLength*pk/2,py+tieLayout.rootStart*pk,tieLayout.attachment.saddleLength*pk,tieLayout.rootLength*pk,'runway-line');
  // Paired bars on opposite sides of each independent receiving gusset.
  for(const ply of [-1,1])svg+=rect(at+ply*(gus+bar)/2-bar/2,py+tieStart*pk,bar,d.brace.length*pk,'runway-line');
  svg+=rect(at-gus/2,py+(tieLayout?.rootStart??0)*pk,gus,(tieLayout?tieLayout.gussetEnd-tieLayout.rootStart:d.brace.connectionLength)*pk,'runway-line')+rect(at-gus/2,colY-(tieLayout?.connection??d.brace.connectionLength)*pk,gus,(tieLayout?.connection??d.brace.connectionLength)*pk,colLine);
 }
 if(joint)svg+=dimH(px-pg,px+pg,py-b.bf*pk/2,111,dim(c.endGap));
 if(joint)svg+=multiLeader([[px-pg-pl/2+(tieLayout?.attachment.longitudinalSetback??0)*pk,py+(tieStart+d.brace.length*.55)*pk]],[643,247],['LEFT GIRDER: SEPARATE TIE',`${flanges} / SEE ${tieRef}`],8.5,[[[629,py+d.brace.length*pk*.55]]]);
 svg+=multiLeader([[px+pg+pl/2-(tieLayout?.attachment.longitudinalSetback??0)*pk,py+(tieStart+d.brace.length*.55)*pk]],[1025,247],['RIGHT GIRDER: SEPARATE TIE',`${flanges} / SEE ${tieRef}`]);
 svg+=text(918,colY+48,sc.isNew?columnReference(p):'BUILDING COLUMN (REF.)',8,'middle');
 svg+=text(635,Math.max(335,colY+62),tieRelease(p)?'COLUMN GUSSETS: SLEEVED BOLTS IN VERTICAL SLOTS. BARS FLEX WITH END ROTATION AND THERMAL TRAVEL.':'COLUMN-SIDE ATTACHMENTS: BARS FLEX WITH END ROTATION, THERMAL TRAVEL AND SUPPORT DEFLECTION.',7.6);
 return {svg:svg+'</g>',scale:ps.label};
 }});

 views.push({title:detailTitles.movement,render:()=>{
 let svg='<g data-view="bearing-movement">';
 const ms=drawingScale(Math.min(.30,190/(bs.length+2*c.guideTravel)),p.units),mk=ms.pointsPerMm;
 for(const [i,at] of [170,460].entries()){
  const y=457,bl=bs.length*mk,bt=bs.thickness*mk,travel=c.guideTravel*mk;
  svg+=rect(at-bl/2,y-42,bl,42,'runway-line')+line([at-bl/2,y-b.tf*mk],[at+bl/2,y-b.tf*mk],'runway-line');
  svg+=rect(at-bl/2,y,bl,bt,'runway-line');
  svg+=rect(at-bl/2-travel,y+bt,bl+2*travel,25.4*mk,'reference-line');
  svg+=line([at,y-50],[at,y+45],'grid-line');
  svg+=text(at,400,i?'RIGHT END / SLIDING':'LEFT END / LOCATING',9,'middle',700);
  svg+=dimH(at-bl/2,at+bl/2,y+bt,514,dim(bs.length));
  if(i)svg+=dimH(at+bl/2,at+bl/2+travel,y+bt,493,`${size(c.guideTravel)} TRAVEL EA. WAY`,'right');
  svg+=text(at,543,i?'ALLOW LONGITUDINAL TRAVEL':'TRANSFER LONGITUDINAL FORCE',8,'middle');
  svg+=text(at,557,'PERMIT END ROTATION',8,'middle');
 }
 const moveRef=activeEndBearing(p)?detailRef(detailTitles.endBearing):'';
 const note=wrappedText(44,588,moveRef?`BOLT EACH BEARING PER ${moveRef}: STANDARD HOLES AND PRETENSIONED BOLTS AT THE LOCATING END; SLOTS IN THE GIRDER FLANGE, PLATE WASHERS AND ${slidingPhrase(activeEndBearing(p)!)} AT THE SLIDING END. DO NOT CLAMP THE GIRDER FLANGE AT THE SLIDING END. MAINTAIN FULL BEARING THROUGHOUT THE TRAVEL.`:'LOCATING AND GUIDED HOLD-DOWN ATTACHMENTS SHALL BE DESIGNED AT THE BUILDING INTERFACE. DO NOT CLAMP THE SLIDING END AGAINST MOVEMENT OR DRILL UNDETAILED FLANGE HOLES. MAINTAIN FULL BEARING THROUGHOUT THE REQUIRED TRAVEL.',102,8.2,12);svg+=note.svg;
 if(!moveRef)svg+=text(44,640,'SYMBOLS DEFINE RESTRAINT / MOVEMENT; THEY DO NOT SIZE THE RECEIVING ATTACHMENTS.',7.6);
 return {svg:svg+'</g>',scale:ms.label};
 }});

 const reactions=sharedSupportRows(s).map(({grid,row})=>{
  const vf=(end:'left'|'right')=>row?.ends?format(row.ends.filter(v=>v.end===end).reduce((a,v)=>a+v.vertical,0),'force',p.units):'—';
  return [String(grid),vf('right'),vf('left'),row?format(row.vertical,'force',p.units):'PENDING',row?.seatMoment!==undefined?format(row.seatMoment,'moment',p.units):'—'];
 });
 const bearingRef=activeEndBearing(p)?detailRef(detailTitles.endBearing):'';
 const notes=bearingRef?[
  `${usesExistingBracket(p)?`EXISTING BRACKET AND NEW BOLTED SEAT: ${bracketRef}`:wb?`WELDED GRAVITY BRACKET: ${bracketRef}`:'BRACKET BY OTHERS'}. BOLTED END BEARINGS TRANSFER LONGITUDINAL FORCE AND UPLIFT (${bearingRef}); FLANGE TIES TRANSFER LATERAL FORCE. INTERFACE FORCES: SEE CALCULATION REPORT.`,
  'LEFT END OF EACH BAY LOCATES LONGITUDINALLY. FULL CRANE TRACTION IS ASSIGNED TO EACH OCCUPIED BAY IN SEPARATE BOUNDING CASES; DO NOT ADD THESE CASES.',
  `GIRDER ANALYSIS SPANS ARE GRID-TO-GRID; BEARINGS ARE INSET AS SHOWN. LOCATING ENDS: STANDARD HOLES, PRETENSIONED. SLIDING ENDS: SLOTS, ${slidingPhrase(activeEndBearing(p)!)} (${bearingRef}).`,
  'REFERENCE AIST TECHNICAL REPORT 13 §5.8.1. GIRDER AND CAP ENDS REMAIN SEPARATE. RAIL JOINTS ARE DETAILED INDEPENDENTLY.'
 ]:[
  usesExistingBracket(p)?`EXISTING BRACKET AND NEW BOLTED SEAT: ${bracketRef}. SEPARATE TIES AND LOCATING ATTACHMENTS TRANSFER HORIZONTAL FORCES.`:wb?`WELDED GRAVITY BRACKET: ${bracketRef}. SEPARATE HORIZONTAL CONNECTIONS TRANSFER LATERAL AND LONGITUDINAL FORCES. INTERFACE FORCES: SEE CALCULATION REPORT.`:'DESIGN EACH BRACKET FOR THE SIMULTANEOUS GIRDER REACTIONS, LATERAL FORCES AND ECCENTRICITY TO THE COLUMN. INTERFACE FORCES: SEE CALCULATION REPORT.',
  'LEFT END OF EACH BAY LOCATES LONGITUDINALLY. FULL CRANE TRACTION IS ASSIGNED TO EACH OCCUPIED BAY IN SEPARATE BOUNDING CASES; DO NOT ADD THESE CASES.',
  usesExistingBracket(p)?'GIRDER SPANS ARE GRID-TO-GRID. BEARINGS ARE INSET; EXISTING SUPPORT ASSESSMENT AND MOVEMENT COMPATIBILITY ARE REQUIRED.':wb?`GIRDER ANALYSIS SPANS ARE GRID-TO-GRID; BEARINGS ARE INSET AS SHOWN. WELDED BRACKET ${bracketRef}; COLUMN-SIDE MOVEMENT ATTACHMENTS REQUIRE PROJECT DESIGN.`:'GIRDER SPANS IN ANALYSIS ARE GRID-TO-GRID. BEARINGS ARE INSET AS SHOWN; BRACKET SPREADER AND COLUMN-SIDE CONNECTIONS REQUIRE PROJECT DESIGN.',
  'REFERENCE AIST TECHNICAL REPORT 13 §5.8.1. GIRDER AND CAP ENDS REMAIN SEPARATE. RAIL JOINTS ARE DETAILED INDEPENDENTLY.'
 ];
 return {key:'support',name:'SUPPORTS',views,notes:(t:Style)=>[
  heading(t,'SHARED BRACKET / CONCURRENT VERTICAL REACTIONS'),table(t,['GRID','LEFT V','RIGHT V','COMBINED V','SEAT M'],reactions,[.55,1,1,1.1,1.1]),
  paragraph(t,'AT MAXIMUM COMBINED DOWNWARD REACTION AT EACH GRID. SEAT M = SUM V X OFFSET FROM GRID; POSITIVE TOWARD THE NEXT GRID.'),
  heading(t,'INDEPENDENT SUPPORT NOTES'),...numbered(t,notes)]};
}

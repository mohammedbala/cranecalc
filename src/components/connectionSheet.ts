import {existingBracketLabel} from '../engine/bracketProfiles';
import {usesExistingBracket,existingBracket} from '../engine/existingBracket';
import {flangeTieSection} from './flangeTieSheet';
import type { CalculationSnapshot } from '../engine/types';
import { referenceCrossheads } from '../data/aiscReferenceShapes';
import { bearingStiffenerProfile } from './bearingStiffenerGeometry';
import { boltProperties } from '../engine/connectionStrength';
import { defaultFraming, type FramingSettings } from './framingSettings';
import { planSheetGeometry } from './planSheetGeometry';
import { drawingLength, plateInches } from './drawingFormat';
import { sheetDrawingScale as drawingScale, sheetStart, titleBlock, text, line, rect, circle, dimH, dimV, viewTitle, multiLeader, filletLeader, fieldFilletLeader, type XY } from './sheetGraphics';

export function connectionSheetSvg(s:CalculationSnapshot,f:FramingSettings=defaultFraming){
 const p=s.input,d=p.details,m=planSheetGeometry(p,f),b=p.section;
 const wb=d?.bracket?.enabled?d.bracket:undefined;
 const dim=(v:number)=>drawingLength(v,p.units),size=(v:number)=>plateInches(v,p.units);
 const nominal=(v:number)=>p.units==='US'?`${Number((v/25.4).toFixed(3))}"`:`${Number(v.toFixed(2))} MM`;
 const colName=f.frameStyle==='tapered'?'EXISTING TAPERED COLUMN':'EXISTING BUILDING COLUMN';
 const bracket=referenceCrossheads.find(v=>v.name===f.crosshead)!;
 const colAt=(y:number)=>f.frameStyle==='tapered'?m.columnDepthAt(y):m.column.d;

 const hole=(x:number,y:number,r:number)=>circle(x,y,r,'runway-line')+line([x-r-3,y],[x+r+3,y],'grid-line')+line([x,y-r-3],[x,y+r+3],'grid-line');
 const wSection=(x:number,y:number,bf:number,depth:number,tf:number,tw:number,cls='runway-line')=>rect(x-bf/2,y,bf,tf,cls)+rect(x-tw/2,y+tf,tw,depth-2*tf,cls)+rect(x-bf/2,y+depth-tf,bf,tf,cls);
 let svg=sheetStart(s,'S-02','CRANE RUNWAY / BRACKETS & CONNECTIONS');
 svg+=line([612,76],[612,680],'divider')+line([24,378],[1200,378],'divider');
 if(!d){
  svg+=text(612,260,'GIRDER-SIDE CONNECTION GEOMETRY HAS NOT BEEN ENTERED.',12,'middle',700);
  svg+=text(612,283,`REFERENCE COLUMN BRACKET / ${colName}.`,10,'middle');
  return svg+titleBlock(s,'S-02','BRACKETS & CONNECTIONS')+'</svg>';
 }

 // 1: Actual girder transverse section, fitted stiffeners and bearing plate.
 // Receiving bracket and building-column profile remain dashed reference geometry.
 {
  svg+='<g data-view="bracket-connection">';
  const scale=drawingScale(Math.min(.14,150/(b.d+d.bearing.thickness+m.bracketDepth*1000)),p.units),k=scale.pointsPerMm*1000,cx=166,top=137,bottom=top+m.d*k,cy=(top+bottom)/2,inner=wb?cx+wb.reach/1000*k:266;
  const C=(y:number)=>colAt((cy-y)/k)*k;
  svg+=line([inner,98],[inner,326],'reference-line')+line([inner+C(98),98],[inner+C(326),326],'reference-line');
  svg+=line([inner+m.column.tf*k,98],[inner+m.column.tf*k,326],'reference-line')+line([inner+C(98)-m.column.tf*k,98],[inner+C(326)-m.column.tf*k,326],'reference-line');
  const pw=d.bearing.width/1000*k,pt=d.bearing.thickness/1000*k,bt=bottom+pt,bb=bt+m.bracketDepth*k;
  if(wb){const wx=inner-wb.seatProjection/1000*k;svg+=rect(wx,bt,wb.seatProjection/1000*k,wb.seatThickness/1000*k,'runway-line');if(usesExistingBracket(p)){const e=existingBracket(p),ex=inner-e.projection/1000*k,y=bt+wb.seatThickness/1000*k;svg+=rect(ex,y,e.projection/1000*k,e.depth/1000*k,'reference-line');for(const off of [e.flangeThickness,e.depth-e.flangeThickness])svg+=line([ex,y+off/1000*k],[inner,y+off/1000*k],'reference-line');}else svg+=rect(wx,bt+wb.seatThickness/1000*k,wb.seatProjection/1000*k,wb.ribDepth/1000*k,'runway-line');}else{
  svg+=rect(cx-pw/2-8,bt,inner-(cx-pw/2-8),bb-bt,'reference-line');
  svg+=line([cx-pw/2-8,bt+bracket.tf*25.4/1000*k],[inner,bt+bracket.tf*25.4/1000*k],'reference-line')+line([cx-pw/2-8,bb-bracket.tf*25.4/1000*k],[inner,bb-bracket.tf*25.4/1000*k],'reference-line');
  svg+=line([cx-10,bb],[inner,bb+26],'reference-line');
  }
  svg+=wSection(cx,top,m.bf*k,m.d*k,m.tf*k,b.tw/1000*k);
  if(b.kind==='cap'){svg+=rect(cx-b.capWidth/2000*k,top-b.capTw/1000*k,b.capWidth/1000*k,b.capTw/1000*k,'runway-line');for(const sign of [-1,1])svg+=rect(cx+sign*b.capWidth/2000*k-(sign>0?b.capTf/1000*k:0),top,b.capTf/1000*k,(b.capDepth-b.capTw)/1000*k,'runway-line');}
  const stiffPts:XY[]=[],weldPts:XY[]=[];
  for(const sign of [-1,1]){
   const y=top+b.tf/1000*k,h=(b.d-2*b.tf)/1000*k;
   const profile=bearingStiffenerProfile(d.bearing.stiffenerWidth,b.d-2*b.tf,d.bearing.cope).map(([z,v])=>[cx+sign*(b.tw/2+z)/1000*k,y+v/1000*k]);
   svg+=`<path data-stiffener="full-depth" class="runway-line" d="${profile.map(([x,y],i)=>`${i?'L':'M'}${x},${y}`).join('')}Z"/>`;
   stiffPts.push([cx+sign*(b.tw/2+d.bearing.stiffenerWidth/2)/1000*k,y+h*.45]);
   weldPts.push([cx+sign*b.tw/2000*k,y+h*.76]);
  }
  svg+=rect(cx-pw/2,bottom,pw,pt,'runway-line');
  svg+=multiLeader([[cx-m.bf*k/2+8,top]],[43,112],[b.name+' RUNWAY GIRDER']);
  svg+=dimV(top,bottom,cx-m.bf*k/2,87,dim(b.d));
  svg+=multiLeader([[inner+C(110),110]],[355,100],[colName+' (REF.)']);
  svg+=multiLeader(stiffPts,[355,165],[`2 PL ${size(d.bearing.stiffenerThickness)} X ${size(d.bearing.stiffenerWidth)}`,`FULL-DEPTH FITTED BEARING STIFFENERS`,`${size(d.bearing.cope)} WEB-SIDE CORNER COPES`],8,stiffPts.map(()=>[[215,160]]));
  svg+=filletLeader([weldPts[1]],[355,218],size(d.bearing.weldSize),['TYP. BOTH STIFFENERS',b.kind==='cap'?'WEB FILLETS / TOP CJP':'CONT. WEB & FLANGE FILLETS','FIT / MILL STIFFENER ENDS'],true);
  svg+=multiLeader([[230,(bt+bb)/2]],[355,287],usesExistingBracket(p)?[`EXISTING ${existingBracketLabel(d.bracket)}`,'NEW BOLTED SEAT: S-05']:wb?['WELDED COLUMN BRACKET','SEAT / RIBS / WELDS: S-05']:['COLUMN BRACKET (REF.)','COLUMN ATTACHMENT BY','BUILDING DESIGNER']);
  svg+=multiLeader([[cx,bottom+pt]],[111,332],[`BEARING PL ${size(d.bearing.thickness)} X ${size(d.bearing.width)} X ${size(d.bearing.length)}`]);
  svg+=viewTitle(318,352,'GIRDER BEARING / COLUMN BRACKET',scale.label)+'</g>';
 }

 // 2: Cover plates are placed on the actual girder web; column beyond and
 // transverse bracket section show where the connection transfers its loads.
 {
  svg+='<g data-view="end-connection">';
  const c=d.end,scale=drawingScale(Math.min(.24,240/(b.d+d.bearing.thickness+m.bracketDepth*1000)),p.units),k=scale.pointsPerMm,left=646,right=877,top=90,bottom=top+b.d*k;
  const colB=m.column.bf*1000*k,colX=853,brB=bracket.bf*25.4*k,brD=m.bracketDepth*1000*k;
  svg+=rect(colX-colB/2,94,colB,226,'reference-line');
  svg+=line([colX-colB/2+5,94],[colX-colB/2+5,320],'reference-line')+line([colX+colB/2-5,94],[colX+colB/2-5,320],'reference-line');
  if(wb){const y=bottom+d.bearing.thickness*k;svg+=rect(colX-wb.seatLength*k/2,y,wb.seatLength*k,wb.seatThickness*k,'runway-line');if(usesExistingBracket(p)){const e=existingBracket(p);svg+=wSection(colX,y+wb.seatThickness*k,e.width*k,e.depth*k,e.flangeThickness*k,e.webThickness*k,'reference-line');}else for(const side of [-1,1])svg+=rect(colX+(side*wb.ribSpacing-wb.ribThickness)*k/2,y+wb.seatThickness*k,wb.ribThickness*k,wb.ribDepth*k,'runway-line');}else svg+=wSection(colX,bottom+d.bearing.thickness*k,brB,brD,bracket.tf*25.4*k,bracket.tw*25.4*k,'reference-line');
  svg+=rect(left,top,right-left,b.d*k,'runway-line')+line([left,top+b.tf*k],[right,top+b.tf*k],'runway-line')+line([left,bottom-b.tf*k],[right,bottom-b.tf*k],'runway-line');
  // A break at the left indicates the girder continues beyond this detail.
  svg+=line([left-4,top-5],[left+4,top+7])+line([left+4,top+7],[left-4,top+19]);
  const w=c.gauge+2*c.edge,h=(c.rows-1)*c.pitch+2*c.edge,x=right-w*k-11,y=(top+bottom-h*k)/2;
  svg+=rect(x,y,w*k,h*k,'runway-line');
  const pts:XY[]=[];
  for(let row=0;row<c.rows;row++)for(let col=0;col<2;col++){
   const at:XY=[x+(c.edge+col*c.gauge)*k,y+(c.edge+row*c.pitch)*k];pts.push(at);svg+=hole(...at,boltProperties(c.grade,c.diameter).hole*k/2);
  }
  svg+=text(709,(top+bottom)/2,b.name,10,'middle',700);
  svg+=dimH(x,x+w*k,y+h*k,y+h*k+24,dim(w));
  // Separate dimension strings keep tight edge distances legible.
  svg+=dimH(x,pts[0][0],y,y-29,size(c.edge));
  svg+=dimH(pts[0][0],pts[1][0],y,y-13,size(c.gauge));
  svg+=dimV(y,pts[0][1],x,x-16,size(c.edge));
  svg+=dimV(pts[0][1],pts.at(-1)![1],x,x-42,`${c.rows-1} @ ${size(c.pitch)} = ${dim((c.rows-1)*c.pitch)}`);
  svg+=dimV(pts.at(-1)![1],y+h*k,x,x-16,size(c.edge));
  svg+=multiLeader([pts[1]],[958,100],[`${2*c.rows} - ${size(c.diameter)} ${c.grade} BOLTS`,`${size(boltProperties(c.grade,c.diameter).hole)} STD. HOLES`]);
  svg+=multiLeader([[x+w*k,y+h*k*.5]],[958,163],[`2 COVER PL ${size(c.thickness)}`,`${dim(w)} W X ${dim(h)} H`,`CENTRAL WEB ${nominal(b.tw)}`,`CLASS ${c.surface} FAYING SURFACES`]);
  svg+=filletLeader([[x+w*k,y+h*k-6]],[958,222],size(c.weldSize),[`TYP. 2 FILLET LINES X ${dim(c.weldLength)}`,`ROOT OFFSET ${size(c.projection)}`]);
  svg+=multiLeader([[colX,bottom+brD*.6]],[958,284],[usesExistingBracket(p)?'EXISTING BRACKET / S-05':wb?'WELDED BRACKET / S-05':'COLUMN BRACKET (REF.)',`ROTATION CLEARANCE ${size(d.criteria.rotationClearance)}`]);
  svg+=text(638,332,p.system==='simple'?'SEPARATE COLUMN-SIDE MOVEMENT ATTACHMENT REQUIRED; SEE S-04.':`${colName} BEYOND (REF.); ROOT ATTACHMENT BY BUILDING DESIGNER.`,7.8);
  svg+=viewTitle(906,352,p.system==='simple'?'GIRDER-SIDE END TEMPLATE / SEE S-04':'GIRDER WEB / END CONNECTION',scale.label)+'</g>';
 }

 // 3: Plan of an actual flange-to-column tie. The symmetric pair of bars is
 // represented by front/back outlines; arrows identify both end bolt groups.
 {
  if(d.brace.flangeAttachment?.enabled){svg+=flangeTieSection(s,105,436,true);}else{
  svg+='<g data-view="tie-connection">';
  const c=d.brace.connection,scale=drawingScale(Math.min(.17,205/(b.bf+d.brace.length+colAt(0)*1000)),p.units),k=scale.pointsPerMm,cx=181,top=430,bottom=top+b.bf*k;
  svg+=rect(60,top,241,b.bf*k,'runway-line');
  svg+=line([60,top+b.bf*k/2],[301,top+b.bf*k/2],'grid-line');
  const y=bottom-8,l=d.brace.length*k,w=d.brace.width*k,x=cx-w/2;
  const colY=y+l-13,colD=colAt(0)*1000*k,colW=m.column.bf*1000*k;
  svg+=wSection(cx,colY,colW,colD,m.column.tf*1000*k,m.column.tw*1000*k,'reference-line');
  const gussetY=y+l-26;
  svg+=rect(x-6,y-6,w+12,32,'runway-line')+rect(x-6,gussetY,w+12,32,'runway-line');
  svg+=rect(x+3,y+3,w,l,'reference-line')+rect(x,y,w,l,'runway-line');
  const end=(c.rows-1)*c.pitch+2*c.edge,pts:XY[]=[];
  for(const offset of [0,d.brace.length-end])for(let row=0;row<c.rows;row++)for(let col=0;col<2;col++){
   const at:XY=[x+(c.edge+col*c.gauge)*k,y+(offset+c.edge+row*c.pitch)*k];pts.push(at);svg+=hole(...at,boltProperties(c.grade,c.diameter).hole*k/2);
  }
  svg+=dimV(y,y+l,x,77,dim(d.brace.length));
  svg+=dimV(y,pts[0][1],x,144,size(c.edge));
  svg+=dimV(pts[0][1],pts[(c.rows-1)*2][1],x,119,`${c.rows-1} @ ${size(c.pitch)}`);
  svg+=dimV(pts.at(-1)![1],y+l,x,144,size(c.edge));
  svg+=dimH(pts[0][0],pts[1][0],y,y-14,size(c.gauge));
  svg+=dimH(x,pts[0][0],y,y-31,size(c.edge));
  svg+=multiLeader([[252,top]],[351,420],[b.name+' RUNWAY GIRDER','PLAN AT FLANGE; TIE AT BOTH FLANGES']);
  svg+=multiLeader([[x+w,y+l/2]],[351,526],[`2 FL ${size(d.brace.thickness)} X ${size(d.brace.width)}`,`${dim(d.brace.length)} LONG / EACH FLANGE`,'SYMMETRIC BARS; ONE EACH SIDE OF GUSSET']);
  svg+=multiLeader([pts[3]],[351,463],[`EACH END: ${2*c.rows} - ${size(c.diameter)} ${c.grade}`,`${size(boltProperties(c.grade,c.diameter).hole)} HOLES; CLASS ${c.surface}`,`GUSSET PL ${size(d.brace.gussetThickness)}`]);
  svg+=fieldFilletLeader([[x+w+6,colY]],[351,573],size(c.weldSize),[`2 ROOT FILLETS X ${dim(c.weldLength)}`,'FIELD WELD COLUMN-SIDE GUSSET'],true);
  svg+=multiLeader([[cx,colY+colD*.75]],[351,615],[colName+' (REF.)'],7.8);
  svg+=viewTitle(318,655,'FLANGE TIE / COLUMN CONNECTION',scale.label)+'</g>';}
 }

 // 4: The receiving surface is the cap web or the bare W top flange.
 {
  svg+='<g data-view="rail-connection">';
  const r=d.rail,depth=p.aist!.railDepth,capped=b.kind==='cap',receivingWidth=capped?b.capWidth:b.bf,capT=capped?b.capTw:0;
  const scale=drawingScale(Math.min(.36,250/receivingWidth,95/(depth+(capped?b.capDepth:b.tf))),p.units),k=scale.pointsPerMm,x=774,y=420,base=y+depth*k,wTop=base+capT*k;
  svg+=rect(x-r.headWidth*k/2,y,r.headWidth*k,r.headThickness*k,'rail-line')+rect(x-r.webThickness*k/2,y+r.headThickness*k,r.webThickness*k,(depth-r.headThickness-r.baseThickness)*k,'rail-line')+rect(x-r.baseWidth*k/2,y+(depth-r.baseThickness)*k,r.baseWidth*k,r.baseThickness*k,'rail-line');
  svg+=rect(x-b.bf*k/2,wTop,b.bf*k,b.tf*k,'runway-line')+rect(x-b.tw*k/2,wTop+b.tf*k,b.tw*k,34,'runway-line');
  if(capped){svg+=rect(x-b.capWidth*k/2,base,b.capWidth*k,b.capTw*k,'runway-line');for(const sign of [-1,1])svg+=rect(x+sign*b.capWidth*k/2-(sign>0?b.capTf*k:0),wTop,b.capTf*k,(b.capDepth-b.capTw)*k,'runway-line');}
  svg+=line([x-b.tw*k/2-5,wTop+b.tf*k+28],[x+b.tw*k/2+5,wTop+b.tf*k+37]);
  const keepers:XY[]=[],welds:XY[]=[];
  for(const sign of [-1,1]){
   const edge=x+sign*r.baseWidth*k/2,root=edge+sign*r.clipProjection*k/2;
   svg+=rect(sign<0?root-r.clipThickness*k:root,y+(depth-r.baseThickness-r.clipThickness)*k,r.clipThickness*k,(r.baseThickness+r.clipThickness)*k,'runway-line');
   svg+=rect(sign<0?root:root-r.clipProjection*k,y+(depth-r.baseThickness-r.clipThickness)*k,r.clipProjection*k,r.clipThickness*k,'runway-line');
   keepers.push([root+sign*r.clipThickness*k/2,base-r.clipThickness*k/2]);welds.push([root+sign*r.clipThickness*k,base]);
  }
  svg+=multiLeader([[x,y+8]],[957,412],[`${size(depth)} RAIL`, `HEAD ${size(r.headWidth)} X ${size(r.headThickness)}`,`BASE ${size(r.baseWidth)} X ${size(r.baseThickness)}`]);
  svg+=multiLeader([keepers[1]],[957,467],[`KEEPER PL ${size(r.clipThickness)} THICK`,`X ${size(r.clipWidth)} ALONG RAIL`,`PROJECTION ${size(r.clipProjection)}`]);
  svg+=filletLeader([welds[1]],[957,539],size(r.clipWeld),['TYP. BOTH KEEPERS','2 CONT. ROOT FILLETS','KEEP RAIL FREE TO SLIDE'],false,[[[x+receivingWidth*k/2+12,base]]]);
  // Use the bottom flange corner so this leader stays below the keeper-weld
  // route even for very wide or thin catalogue flanges.
  svg+=multiLeader([[x+b.bf*k/2,wTop+b.tf*k]],[957,601],[b.name+' RUNWAY GIRDER',capped?'CAP ATTACHMENT: SEE S-03':'PARTIAL SECTION SHOWN']);
  // Longitudinal inset dimensions the out-of-plane keeper spacing at its own
  // stated physical scale, rather than putting a spacing note on a section.
  const spacing=p.aist!.clipSpacing,ss=drawingScale(Math.min(.36,230/(spacing+r.clipWidth)),p.units),sk=ss.pointsPerMm;
  const a=774-spacing*sk/2,z=774+spacing*sk/2,sy=594;
  svg+=line([a-r.clipWidth*sk/2-6,sy],[z+r.clipWidth*sk/2+6,sy],'runway-line');
  for(const center of [a,z]){
   svg+=rect(center-r.clipWidth*sk/2,sy-r.clipThickness*sk,r.clipWidth*sk,r.clipThickness*sk,'runway-line');
   svg+=line([center,sy-17],[center,sy+3],'grid-line');
  }
  svg+=dimH(a,z,sy-r.clipThickness*sk,sy-28,`${dim(spacing)} MAX.`);
  svg+=text(774,615,'KEEPER SPACING / LONGITUDINAL VIEW',8,'middle',700)+text(774,627,ss.label,7.5,'middle');
  svg+=text(958,629,'RAIL JOINT: SEE SK-07.',8);
  svg+=viewTitle(906,658,'RAIL KEEPER / GIRDER ATTACHMENT',scale.label)+'</g>';
 }
 return svg+titleBlock(s,'S-02','BRACKETS & CONNECTIONS')+'</svg>';
}

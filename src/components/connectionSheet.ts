import {supportColumn} from '../engine/drawingData';
import {existingBracketLabel} from '../engine/bracketProfiles';
import {activeEndBearing} from '../engine/endBearingInputs';
import {endBearingView} from './endBearingDetail';
import {usesExistingBracket,existingBracket} from '../engine/existingBracket';
import {flangeTieSection} from './flangeTieSheet';
import {tieSides} from '../engine/tieGeometry';
import type { CalculationSnapshot } from '../engine/types';
import { referenceCrossheads } from '../data/aiscReferenceShapes';
import { bearingStiffenerProfile } from './bearingStiffenerGeometry';
import { boltProperties } from '../engine/connectionStrength';
import { defaultFraming, type FramingSettings } from './framingSettings';
import { planSheetGeometry } from './planSheetGeometry';
import { drawingLength, plateInches } from './drawingFormat';
import { sheetDrawingScale as drawingScale, text, line, rect, circle, dimH, dimV, multiLeader, filletLeader, fieldFilletLeader, detailRef, detailTitles, columnReference, breakLine, type XY } from './sheetGraphics';
import { topicSheetSvg, type DetailTopic, type DetailView } from './detailSheet';

/** Girder bearing, end connection, flange tie and rail keeper details on their own sheet. */
export function connectionSheetSvg(s:CalculationSnapshot,f:FramingSettings=defaultFraming,number='S-02'){
 return topicSheetSvg(s,connectionTopic(s,f),number,'BRACKETS & CONNECTIONS');
}
/**
 * Girder-side connection details. The direct flange tie section is left to the flange tie details
 * when they are in the same set (`withFlangeTie` false), so no detail is drawn twice.
 */
export function connectionTopic(s:CalculationSnapshot,f:FramingSettings=defaultFraming,withFlangeTie=true):DetailTopic{
 const p=s.input,d=p.details,b=p.section;
 // Reference framing geometry is computed when a detail is first drawn, not when the set is planned.
 let framing:ReturnType<typeof planSheetGeometry>|undefined;const m=()=>framing??=planSheetGeometry(p,f);
 const wb=d?.bracket?.enabled?d.bracket:undefined;
 const dim=(v:number)=>drawingLength(v,p.units),size=(v:number)=>plateInches(v,p.units);
 const nominal=(v:number)=>p.units==='US'?`${Number((v/25.4).toFixed(3))}"`:`${Number(v.toFixed(2))} MM`;
 const sc=supportColumn(p),colName=sc.isNew?sc.name:f.frameStyle==='tapered'?'EXISTING TAPERED COLUMN':'EXISTING BUILDING COLUMN',colRef=sc.isNew?columnReference(p):`${colName} (REF.)`;
 const bracket=referenceCrossheads.find(v=>v.name===f.crosshead)!;
 const colAt=(y:number)=>f.frameStyle==='tapered'&&!sc.isNew?m().columnDepthAt(y):m().column.d,colLine=sc.isNew?'runway-line':'reference-line';
 const bracketRef=detailRef(usesExistingBracket(p)?detailTitles.existingBracket:detailTitles.weldedBracket);

 const hole=(x:number,y:number,r:number)=>circle(x,y,r,'runway-line')+line([x-r-3,y],[x+r+3,y],'grid-line')+line([x,y-r-3],[x,y+r+3],'grid-line');
 const wSection=(x:number,y:number,bf:number,depth:number,tf:number,tw:number,cls='runway-line')=>rect(x-bf/2,y,bf,tf,cls)+rect(x-tw/2,y+tf,tw,depth-2*tf,cls)+rect(x-bf/2,y+depth-tf,bf,tf,cls);
 const topic:DetailTopic={key:'connection',name:'CONNECTIONS',views:[]};
 if(!d)return {...topic,message:['GIRDER-SIDE CONNECTION GEOMETRY HAS NOT BEEN ENTERED.',`REFERENCE COLUMN BRACKET / ${colName}.`]};
 const views:DetailView[]=topic.views;

 // 1: Actual girder transverse section, fitted stiffeners and bearing plate.
 // Receiving bracket and building-column profile remain dashed reference geometry.
 views.push({title:detailTitles.bearing,render:()=>{
  let svg='<g data-view="bracket-connection">';
  // Depth drawn below the bearing: the bracket designed here, or the reference bracket. The section is
  // drawn up to 240 deep, its callouts placed against the girder and bracket.
  const below=wb?wb.seatThickness+(usesExistingBracket(p)?existingBracket(p).depth:wb.ribDepth):m().bracketDepth*1000;
  const scale=drawingScale(Math.min(.18,240/(b.d+d.bearing.thickness+below)),p.units),k=scale.pointsPerMm*1000,cx=166,top=120,bottom=top+m().d*k,cy=(top+bottom)/2,inner=wb?cx+wb.reach/1000*k:266;
  const pw=d.bearing.width/1000*k,pt=d.bearing.thickness/1000*k,bt=bottom+pt,bb=bt+below/1000*k,colBot=bb+18;
  const C=(y:number)=>colAt((cy-y)/k)*k;
  // Callouts right of the column outline, which widens downward on a tapered column.
  const lx=Math.max(355,inner+Math.max(C(98),C(colBot))+24);
  svg+=line([inner,98],[inner,colBot],colLine)+line([inner+C(98),98],[inner+C(colBot),colBot],colLine);
  svg+=line([inner+m().column.tf*k,98],[inner+m().column.tf*k,colBot],colLine)+line([inner+C(98)-m().column.tf*k,98],[inner+C(colBot)-m().column.tf*k,colBot],colLine);
  if(wb){const wx=inner-wb.seatProjection/1000*k;svg+=rect(wx,bt,wb.seatProjection/1000*k,wb.seatThickness/1000*k,'runway-line');if(usesExistingBracket(p)){const e=existingBracket(p),ex=inner-e.projection/1000*k,y=bt+wb.seatThickness/1000*k;svg+=rect(ex,y,e.projection/1000*k,e.depth/1000*k,'reference-line');for(const off of [e.flangeThickness,e.depth-e.flangeThickness])svg+=line([ex,y+off/1000*k],[inner,y+off/1000*k],'reference-line');}else svg+=rect(wx,bt+wb.seatThickness/1000*k,wb.seatProjection/1000*k,wb.ribDepth/1000*k,'runway-line');}else{
  svg+=rect(cx-pw/2-8,bt,inner-(cx-pw/2-8),bb-bt,'reference-line');
  svg+=line([cx-pw/2-8,bt+bracket.tf*25.4/1000*k],[inner,bt+bracket.tf*25.4/1000*k],'reference-line')+line([cx-pw/2-8,bb-bracket.tf*25.4/1000*k],[inner,bb-bracket.tf*25.4/1000*k],'reference-line');
  svg+=line([cx-10,bb],[inner,bb+26],'reference-line');
  }
  svg+=wSection(cx,top,m().bf*k,m().d*k,m().tf*k,b.tw/1000*k);
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
  svg+=multiLeader([[cx-m().bf*k/2+8,top]],[40,96],[b.name,'RUNWAY GIRDER']);
  svg+=dimV(top,bottom,cx-m().bf*k/2,87,dim(b.d));
  svg+=multiLeader([[inner+C(110),110]],[lx,100],[colRef]);
  svg+=multiLeader(stiffPts,[lx,165],[`2 PL ${size(d.bearing.stiffenerThickness)} X ${size(d.bearing.stiffenerWidth)}`,`FULL-DEPTH FITTED BEARING STIFFENERS`,`${size(d.bearing.cope)} WEB-SIDE CORNER COPES`],8,stiffPts.map(()=>[[215,160]]));
  svg+=filletLeader([weldPts[1]],[lx,218],size(d.bearing.weldSize),['TYP. BOTH STIFFENERS',b.kind==='cap'?'WEB FILLETS / TOP CJP':'CONT. WEB & FLANGE FILLETS','FIT / MILL STIFFENER ENDS'],true);
  svg+=multiLeader([[230,(bt+bb)/2]],[lx,287],usesExistingBracket(p)?[`EXISTING ${existingBracketLabel(d.bracket)}`,`NEW BOLTED SEAT: ${bracketRef}`]:wb?['WELDED COLUMN BRACKET',`SEAT / RIBS / WELDS: ${bracketRef}`]:['COLUMN BRACKET (REF.)','COLUMN ATTACHMENT BY','BUILDING DESIGNER']);
  // Below the bracket and the broken column, clear of the reference bracket's sloped soffit.
  svg+=multiLeader([[cx,bottom+pt]],[111,bb+(wb?32:40)],[`BEARING PL ${size(d.bearing.thickness)} X ${size(d.bearing.width)} X ${size(d.bearing.length)}`]);
  return {svg:svg+'</g>',scale:scale.label};
 }});

 // 2: Bolted end bearings replace the girder-end cover plates on independent spans.
 if(activeEndBearing(p))views.push({title:detailTitles.endBearing,render:()=>endBearingView(s)});
 // 2: Cover plates are placed on the actual girder web; column beyond and
 // transverse bracket section show where the connection transfers its loads.
 else views.push({title:p.system==='simple'?'GIRDER-SIDE END TEMPLATE':detailTitles.endTemplate,render:()=>{
  let svg='<g data-view="end-connection">';
  // The girder depth sets the scale; only the head of the bracket is drawn, broken off below, since the
  // bracket has its own detail.
  const c=d.end,stub=40,scale=drawingScale(Math.min(.3,200/(b.d+d.bearing.thickness)),p.units),k=scale.pointsPerMm,left=646,right=877,top=90,bottom=top+b.d*k;
  const colB=m().column.bf*1000*k,colX=853,brB=bracket.bf*25.4*k,yb=bottom+d.bearing.thickness*k,existing=wb&&usesExistingBracket(p)?existingBracket(p):undefined;
  const brD=wb?wb.seatThickness*k+(existing?existing.depth*k:wb.ribDepth*k):m().bracketDepth*1000*k,cut=yb+Math.min(brD+8,stub);
  const clipRect=(x:number,y:number,w:number,h:number,cls:string)=>y+h<=cut?rect(x,y,w,h,cls):line([x,y],[x+w,y],cls)+line([x,y],[x,cut],cls)+line([x+w,y],[x+w,cut],cls);
  const clipW=(x:number,y:number,bf:number,depth:number,tf:number,tw:number)=>y+depth<=cut?wSection(x,y,bf,depth,tf,tw,'reference-line'):rect(x-bf/2,y,bf,tf,'reference-line')+clipRect(x-tw/2,y+tf,tw,depth,'reference-line');
  svg+=line([colX-colB/2,top+4],[colX+colB/2,top+4],'reference-line')+[-colB/2,5-colB/2,colB/2-5,colB/2].map(dx=>line([colX+dx,top+4],[colX+dx,cut],'reference-line')).join('');
  if(wb){svg+=rect(colX-wb.seatLength*k/2,yb,wb.seatLength*k,wb.seatThickness*k,'runway-line');const y=yb+wb.seatThickness*k;if(existing)svg+=clipW(colX,y,existing.width*k,existing.depth*k,existing.flangeThickness*k,existing.webThickness*k);else for(const side of [-1,1])svg+=clipRect(colX+(side*wb.ribSpacing-wb.ribThickness)*k/2,y,wb.ribThickness*k,wb.ribDepth*k,'runway-line');}else svg+=clipW(colX,yb,brB,brD,bracket.tf*25.4*k,bracket.tw*25.4*k);
  const half=Math.max(colB,brB,wb?wb.seatLength*k:0)/2+6;
  svg+=breakLine([colX-half,cut],[colX+half,cut]);
  // The girder end is drawn solid at the right; a full-depth break at the left shows it continues.
  svg+=[top,top+b.tf*k,bottom-b.tf*k,bottom].map(yy=>line([left,yy],[right,yy],'runway-line')).join('')+line([right,top],[right,bottom],'runway-line');
  svg+=breakLine([left,top-6],[left,bottom+6]);
  const w=c.gauge+2*c.edge,h=(c.rows-1)*c.pitch+2*c.edge,x=right-w*k-11,y=(top+bottom-h*k)/2;
  svg+=rect(x,y,w*k,h*k,'runway-line');
  const pts:XY[]=[];
  for(let row=0;row<c.rows;row++)for(let col=0;col<2;col++){
   const at:XY=[x+(c.edge+col*c.gauge)*k,y+(c.edge+row*c.pitch)*k];pts.push(at);svg+=hole(...at,boltProperties(c.grade,c.diameter).hole*k/2);
  }
  svg+=text(709,(top+bottom)/2,b.name,10,'middle',700);
  // Bolt pattern dimensioned in clear space: across the plate above the girder, down the plate to the
  // left of the column beyond, so no dimension text sits on the flanges or the hidden column lines.
  // The edge distance, equal both ways, is called out with the bolts.
  svg+=dimH(pts[0][0],pts[1][0],y,top-14,size(c.gauge),'left',x);
  svg+=dimH(x,x+w*k,y,top-32,size(w),'left');
  const xd=Math.min(x,colX-colB/2)-12;
  svg+=dimV(pts[0][1],pts.at(-1)![1],x-2,xd,`${c.rows-1} @ ${size(c.pitch)}`);
  svg+=dimV(y,y+h*k,x-2,xd-18,size(h));
  svg+=multiLeader([pts[1]],[958,100],[`${2*c.rows} - ${size(c.diameter)} ${c.grade} BOLTS`,`${size(boltProperties(c.grade,c.diameter).hole)} STD. HOLES`,`${size(c.edge)} EDGE DIST. TYP.`]);
  svg+=multiLeader([[x+w*k,y+h*k*.5]],[958,163],[`2 COVER PL ${size(c.thickness)} X ${size(w)} X ${size(h)}`,`CENTRAL WEB ${nominal(b.tw)}`,`CLASS ${c.surface} FAYING SURFACES`]);
  svg+=filletLeader([[x+w*k,y+h*k-6]],[958,222],size(c.weldSize),[`TYP. 2 FILLET LINES X ${size(c.weldLength)}`,`ROOT OFFSET ${size(c.projection)}`]);
  svg+=multiLeader([[colX,wb&&!existing?yb+wb.seatThickness*k/2:yb+Math.min(brD,stub)*.6]],[958,284],[usesExistingBracket(p)?`EXISTING BRACKET / ${bracketRef}`:wb?`WELDED BRACKET / ${bracketRef}`:'COLUMN BRACKET (REF.)',`ROTATION CLEARANCE ${size(d.criteria.rotationClearance)}`]);
  svg+=text(638,Math.max(cut+16,322),p.system==='simple'?`SEPARATE COLUMN-SIDE MOVEMENT ATTACHMENT REQUIRED; SEE ${detailRef(detailTitles.movement)}.`:`${colName} BEYOND (REF.); ROOT ATTACHMENT BY BUILDING DESIGNER.`,7.8);
  return {svg:svg+'</g>',scale:scale.label};
 }});

 // 3: Plan of an actual flange-to-column tie. The symmetric pair of bars is
 // represented by front/back outlines; arrows identify both end bolt groups.
 if(d.brace.flangeAttachment?.enabled){if(withFlangeTie)views.push({title:detailTitles.flangeTie,render:()=>flangeTieSection(s,48,436)});}
 else views.push({title:detailTitles.tie,render:()=>{
  let svg='<g data-view="tie-connection">';
  const c=d.brace.connection,scale=drawingScale(Math.min(.17,205/(b.bf+d.brace.length+colAt(0)*1000)),p.units),k=scale.pointsPerMm,cx=181,top=430,bottom=top+b.bf*k;
  svg+=rect(60,top,241,b.bf*k,'runway-line');
  svg+=line([60,top+b.bf*k/2],[301,top+b.bf*k/2],'grid-line');
  // Vertical bars seen edge-on: two bars each side of the central gusset; bolts run along the runway.
  const y=bottom-8,l=d.brace.length*k,tb=d.brace.thickness*k,tg=d.brace.gussetThickness*k,x=cx-tg/2-tb;
  const colY=y+l-13,colD=colAt(0)*1000*k,colW=m().column.bf*1000*k;
  svg+=wSection(cx,colY,colW,colD,m().column.tf*1000*k,m().column.tw*1000*k,'reference-line');
  const end=(c.rows-1)*c.pitch+2*c.edge;
  for(const offset of [0,d.brace.length-end])svg+=rect(cx-tg/2,y+offset*k,tg,end*k,'runway-line');
  for(const side of [-1,1])svg+=rect(side<0?x:cx+tg/2,y,tb,l,'runway-line');
  const pts:XY[]=[],head=boltProperties(c.grade,c.diameter).hole*k*.9;
  for(const offset of [0,d.brace.length-end])for(let row=0;row<c.rows;row++){
   const yy=y+(offset+c.edge+row*c.pitch)*k;pts.push([cx+tg/2+tb,yy]);
   svg+=line([x-3,yy],[cx+tg/2+tb+3,yy],'runway-line')+rect(x-5,yy-head/2,2,head,'runway-line')+rect(cx+tg/2+tb+3,yy-head/2,2,head,'runway-line');
  }
  svg+=dimV(y,y+l,x,77,dim(d.brace.length));
  // Pitch nearest the bars, edge distances outside it, so no extension line crosses dimension text.
  svg+=dimV(y,pts[0][1],x,119,size(c.edge));
  if(c.rows>1)svg+=dimV(pts[0][1],pts[c.rows-1][1],x,144,`${c.rows-1} @ ${size(c.pitch)}`);
  svg+=dimV(pts.at(-1)![1],y+l,x,119,size(c.edge));
  svg+=multiLeader([[252,top]],[351,420],[b.name+' RUNWAY GIRDER',`PLAN; TIE AT ${tieSides(p).length>1?'BOTH FLANGES':'TOP FLANGE'}`]);
  svg+=multiLeader([[cx+tg/2+tb,y+l/2]],[351,526],[`2 FL ${size(d.brace.thickness)} X ${size(d.brace.width)} (VERTICAL)`,`${dim(d.brace.length)} LONG`,'SYMMETRIC BARS; ONE EACH SIDE OF GUSSET']);
  svg+=multiLeader([pts[c.rows-1]],[351,463],[`EACH END: ${2*c.rows} - ${size(c.diameter)} ${c.grade}, ${c.rows} ROWS`,`X 2 AT ${size(c.gauge)} VERT. GAUGE; CLASS ${c.surface}`,`GUSSET PL ${size(d.brace.gussetThickness)}`]);
  svg+=(sc.field?fieldFilletLeader:filletLeader)([[cx+tg/2,colY]],[351,573],size(c.weldSize),[`2 ROOT FILLETS X ${dim(c.weldLength)}`,`${sc.weld} COLUMN-SIDE GUSSET`],true);
  svg+=multiLeader([[cx,colY+colD*.75]],[351,615],[colRef],7.8);
  return {svg:svg+'</g>',scale:scale.label};
 }});

 // 4: The receiving surface is the cap web or the bare W top flange.
 views.push({title:detailTitles.railKeeper,render:()=>{
  let svg='<g data-view="rail-connection">';
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
  svg+=multiLeader([[x+b.bf*k/2,wTop+b.tf*k]],[957,601],[b.name+' RUNWAY GIRDER',capped?p.capDesign?`CAP ATTACHMENT: SEE ${detailRef(detailTitles.capSection)}`:'CAP ATTACHMENT BY OTHERS':'PARTIAL SECTION SHOWN']);
  // Longitudinal inset dimensions the out-of-plane keeper spacing at its own
  // stated physical scale, rather than putting a spacing note on a section.
  const spacing=p.aist!.clipSpacing,ss=drawingScale(Math.min(.36,150/(spacing+r.clipWidth)),p.units),sk=ss.pointsPerMm;
  const a=705-spacing*sk/2,z=705+spacing*sk/2,sy=594;
  svg+=line([a-r.clipWidth*sk/2-6,sy],[z+r.clipWidth*sk/2+6,sy],'runway-line');
  for(const center of [a,z]){
   svg+=rect(center-r.clipWidth*sk/2,sy-r.clipThickness*sk,r.clipWidth*sk,r.clipThickness*sk,'runway-line');
   svg+=line([center,sy-17],[center,sy+3],'grid-line');
  }
  svg+=dimH(a,z,sy-r.clipThickness*sk,sy-28,`${dim(spacing)} MAX.`);
  svg+=text(705,612,'KEEPER SPACING / LONGITUDINAL VIEW',7.5,'middle',700)+text(705,622,ss.label,7,'middle');
  // Bolted rail joint: joint bars each side of the web, slots along the rail for thermal movement.
  const bar=2*(2*r.jointEdge+r.jointPitch)+r.jointGap,js=drawingScale(Math.min(.36,140/bar,34/depth),p.units),jk=js.pointsPerMm,hole=boltProperties('A325',r.jointBoltDiameter).hole;
  const jc=858,top=600-depth*jk,jl=jc-bar*jk/2,web=top+(r.headThickness+(depth-r.headThickness-r.baseThickness-r.jointPlateHeight)/2)*jk;
  svg+='<g data-view="rail-joint">';
  for(const side of [-1,1]){const end=jc+side*r.jointGap*jk/2,far=jc+side*(bar/2*jk+10);
   svg+=line([end,top],[end,600],'rail-line')+line([end,top],[far,top],'rail-line')+line([end,top+r.headThickness*jk],[far,top+r.headThickness*jk],'rail-line')+line([end,600-r.baseThickness*jk],[far,600-r.baseThickness*jk],'rail-line')+line([end,600],[far,600],'rail-line');}
  svg+=rect(jl,web,bar*jk,r.jointPlateHeight*jk,'runway-line');
  for(const at of [r.jointEdge,r.jointEdge+r.jointPitch,bar-r.jointEdge-r.jointPitch,bar-r.jointEdge])svg+=rect(jl+(at-.75*r.jointBoltDiameter)*jk,web+(r.jointPlateHeight-hole)*jk/2,1.5*r.jointBoltDiameter*jk,hole*jk,'reference-line')+circle(jl+at*jk,web+r.jointPlateHeight*jk/2,r.jointBoltDiameter*jk/2,'runway-line');
  svg+=dimH(jl,jl+bar*jk,web,top-8,dim(bar),'left');
  svg+=text(jc,612,'RAIL JOINT / ELEVATION',7.5,'middle',700)+text(jc,622,js.label,7,'middle');
  svg+=text(jc,632,`2 BARS ${size(r.jointPlateThickness)} X ${size(r.jointPlateHeight)}; 4 - ${size(r.jointBoltDiameter)} A325 SNUG-TIGHT`,6.6,'middle')+text(jc,640.5,`SLOTS ${size(1.5*r.jointBoltDiameter)} X ${size(hole)} ALONG RAIL; GAP ${size(r.jointGap)}`,6.6,'middle')+'</g>';
  return {svg:svg+'</g>',scale:scale.label};
 }});
 return topic;
}

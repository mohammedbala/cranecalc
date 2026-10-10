import {supportColumn} from '../engine/drawingData';
import {existingBracketLabel} from '../engine/bracketProfiles';
import {activeEndBearing} from '../engine/endBearingInputs';
import {endBearingView} from './endBearingDetail';
import {usesExistingBracket,existingBracket} from '../engine/existingBracket';
import {flangeTieSection} from './flangeTieSheet';
import {tieSides,tieRelease,columnGussetHeight,stiffenerTieGeometry} from '../engine/tieGeometry';
import type { CalculationSnapshot } from '../engine/types';
import { referenceCrossheads } from '../data/aiscReferenceShapes';
import { bearingStiffenerProfile } from './bearingStiffenerGeometry';
import { boltProperties } from '../engine/connectionStrength';
import { defaultFraming, type FramingSettings } from './framingSettings';
import { planSheetGeometry } from './planSheetGeometry';
import { drawingLength, plateInches } from './drawingFormat';
import { sheetDrawingScale as drawingScale, text, line, rect, circle, dimH, dimV, multiLeader, filletLeader, fieldFilletLeader, detailRef, detailTitles, bearingBoltsTitle, columnReference, breakLine, labelCaps, type XY } from './sheetGraphics';
import { topicSheetSvg, type DetailTopic, type DetailView } from './detailSheet';
import { railLayoutView } from './railLayoutView';
import { slidingBoltView } from './slidingBoltSection';

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
 const sc=supportColumn(p),colName=sc.isNew?sc.name:f.frameStyle==='tapered'?'EXISTING TAPERED COLUMN':'EXISTING BUILDING COLUMN',colRef=sc.isNew?columnReference(p):`${colName} (REF.)`;
 const bracket=referenceCrossheads.find(v=>v.name===f.crosshead)!;
 const colAt=(y:number)=>f.frameStyle==='tapered'&&!sc.isNew?m().columnDepthAt(y):m().column.d,colLine=sc.isNew?'runway-line':'reference-line';
 const bracketRef=detailRef(usesExistingBracket(p)?detailTitles.existingBracket:detailTitles.weldedBracket);

 const hole=(x:number,y:number,r:number)=>circle(x,y,r,'runway-line')+line([x-r-3,y],[x+r+3,y],'grid-line')+line([x,y-r-3],[x,y+r+3],'grid-line');
 const wSection=(x:number,y:number,bf:number,depth:number,tf:number,tw:number,cls='runway-line')=>rect(x-bf/2,y,bf,tf,cls)+rect(x-tw/2,y+tf,tw,depth-2*tf,cls)+rect(x-bf/2,y+depth-tf,bf,tf,cls);
 // AWS A2.4 single-bevel groove on the arrow side, CJP in the tail; laid out like the fillet callouts.
 const grooveLeader=(point:XY,at:XY,labels:string[],via:XY[]=[])=>{
  const y=at[1]-3,x=at[0]+41,right=point[0]>at[0]+89,tail=right?at[0]-3:at[0]+92,dir=right?-1:1;
  return `<g data-multileader="weld" data-weld="cjp">${multiLeader([point],at,[],8,via.length?[via]:[],89)}${line([at[0]-3,y],[at[0]+92,y])}${line([x,y],[x,y+8])}${line([x,y+8],[x+8,y])}${line([tail,y],[tail+dir*6,y-5])}${line([tail,y],[tail+dir*6,y+5])}${text(tail+dir*8,y+3,'CJP',8,right?'end':'start')}${labels.map((v,i)=>text(at[0],at[1]+17+i*11,labelCaps(v),8)).join('')}</g>`;
 };
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
  // Capped girders: stiffeners CJP to the W top flange (its own groove callout), fitted at the bottom only.
  const cjp=b.kind==='cap',stiffY=cjp?170:165;
  if(cjp)svg+=grooveLeader([cx+(b.tw/2+d.bearing.stiffenerWidth*.6)/1000*k,top+b.tf/1000*k+1],[lx,128],['CJP TO W TOP FLANGE','BOTH STIFFENERS'],[[215,150]]);
  svg+=multiLeader(stiffPts,[lx,stiffY],[`2 PL ${size(d.bearing.stiffenerThickness)} X ${size(d.bearing.stiffenerWidth)}`,`FULL-DEPTH FITTED BEARING STIFFENERS`,`${size(d.bearing.cope)} WEB-SIDE CORNER COPES`],8,stiffPts.map(()=>[[215,stiffY-5]]));
  svg+=filletLeader([weldPts[1]],[lx,218],size(d.bearing.weldSize),['TYP. BOTH STIFFENERS',cjp?'CONT. WEB FILLETS':'CONT. WEB & FLANGE FILLETS',cjp?'FIT BOTTOM END':'FIT / MILL STIFFENER ENDS'],true);
  svg+=multiLeader([[230,(bt+bb)/2]],[lx,287],usesExistingBracket(p)?[`EXISTING ${existingBracketLabel(d.bracket)}`,`NEW BOLTED SEAT: ${bracketRef}`]:wb?['WELDED COLUMN BRACKET',`SEAT / RIBS / WELDS: ${bracketRef}`]:['COLUMN BRACKET (REF.)','COLUMN ATTACHMENT BY','BUILDING DESIGNER']);
  // Below the bracket and the broken column, clear of the reference bracket's sloped soffit.
  svg+=multiLeader([[cx,bottom+pt]],[111,bb+(wb?32:40)],[`BEARING PL ${size(d.bearing.thickness)} X ${size(d.bearing.width)} X ${size(d.bearing.length)}`]);
  return {svg:svg+'</g>',scale:scale.label};
 }});

 // 2: Bolted bearings replace the girder-end cover plates: girder ends of simple spans, every support of a continuous girder.
 if(activeEndBearing(p)){views.push({title:bearingBoltsTitle(p),render:()=>endBearingView(s)});const bolt=slidingBoltView(s);if(bolt)views.push(bolt);}
 // 2: Cover plates bolted to both sides of the girder web project past the girder end to a column-side end
 // plate; the column beyond and the bracket head show where the connection transfers its loads.
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
  // The root weld line is the end plate face, the rotation clearance beyond the girder end; the outer bolts
  // are the load-to-weld eccentricity inside it. The girder end is hidden behind the near cover plate.
  const gap=d.criteria.rotationClearance,xr=right+gap*k,w=c.edge+c.gauge+c.projection,h=(c.rows-1)*c.pitch+2*c.edge,x=xr-w*k,y=(top+bottom-h*k)/2;
  svg+=[top,top+b.tf*k,bottom-b.tf*k,bottom].map(yy=>line([left,yy],[right,yy],'runway-line')).join('')+line([right,top],[right,y],'runway-line')+line([right,y],[right,y+h*k],'hidden-line')+line([right,y+h*k],[right,bottom],'runway-line');
  svg+=breakLine([left,top-6],[left,bottom+6]);
  svg+=rect(x,y,w*k,h*k,'runway-line');
  const ep=Math.max(c.thickness,c.weldSize)*k;svg+=rect(xr,y-12,ep,h*k+24,'reference-line');
  const pts:XY[]=[];
  for(let row=0;row<c.rows;row++)for(let col=0;col<2;col++){
   const at:XY=[x+(c.edge+col*c.gauge)*k,y+(c.edge+row*c.pitch)*k];pts.push(at);svg+=hole(...at,boltProperties(c.grade,c.diameter).hole*k/2);
  }
  svg+=text(709,(top+bottom)/2,b.name,10,'middle',700);
  // Bolt pattern dimensioned in clear space: across the plate above the girder, down the plate to the
  // left of the column beyond, so no dimension text sits on the flanges or the hidden column lines.
  // The edge distance, equal both ways, is called out with the bolts.
  svg+=dimH(pts[0][0],pts[1][0],y,top-14,size(c.gauge),'left',x)+dimH(pts[1][0],xr,y,top-14,size(c.projection),'right',xr+ep);
  svg+=dimH(x,xr,y,top-32,size(w),'left')+dimH(right,xr,top,top-50,size(gap),'right',xr+ep);
  const xd=Math.min(x,colX-colB/2)-12;
  svg+=dimV(pts[0][1],pts.at(-1)![1],x-2,xd,`${c.rows-1} @ ${size(c.pitch)}`);
  svg+=dimV(y,y+h*k,x-2,xd-18,size(h));
  const lx=Math.max(958,xr+ep+70);
  svg+=multiLeader([pts[1]],[lx,100],[`${2*c.rows} - ${size(c.diameter)} ${c.grade} BOLTS THRU GIRDER WEB`,`${size(boltProperties(c.grade,c.diameter).hole)} STD. HOLES, CLASS ${c.surface} SURFACES`,`${size(c.edge)} EDGE DIST. TYP.`]);
  svg+=multiLeader([[x+w*k*.3,y+h*k*.15]],[lx,148],[`2 COVER PL ${size(c.thickness)} X ${size(w)} X ${size(h)}`,'ONE EACH SIDE OF GIRDER WEB']);
  svg+=filletLeader([[xr,y+h*k-6]],[lx,192],size(c.weldSize),['EACH COVER PL TO END PL, OUTER FACE',`${size(c.weldLength)} LONG, ${size(c.projection)} FROM BOLTS`]);
  svg+=multiLeader([[xr+ep,y-6]],[lx,239],['COLUMN-SIDE END PL (REF.); END PL AND','ITS ATTACHMENT TO THE COLUMN BY THE','BUILDING DESIGNER']);
  svg+=multiLeader([[colX,wb&&!existing?yb+wb.seatThickness*k/2:yb+Math.min(brD,stub)*.6]],[lx,284],[usesExistingBracket(p)?`EXISTING BRACKET / ${bracketRef}`:wb?`WELDED BRACKET / ${bracketRef}`:'COLUMN BRACKET (REF.)',`ROTATION CLEARANCE ${size(gap)}`]);
  svg+=text(638,Math.max(cut+16,322),p.system==='simple'?`THE END PL IS THE COLUMN-SIDE MOVEMENT ATTACHMENT; SEE ${detailRef(detailTitles.movement)}.`:`${colName} BEYOND (REF.). END PL ATTACHMENT, WITH A THERMAL RELEASE AT ONE RUNWAY END, BY BUILDING DESIGNER.`,7.8);
  return {svg:svg+'</g>',scale:scale.label};
 }});

 // 3: Plan of an actual flange-to-column tie. The symmetric pair of bars is
 // represented by front/back outlines; arrows identify both end bolt groups.
 if(d.brace.flangeAttachment?.enabled){if(withFlangeTie)views.push({title:detailTitles.flangeTie,render:()=>flangeTieSection(s,48,436)});}
 else views.push({title:detailTitles.tie,render:()=>{
  let svg='<g data-view="tie-connection">';
  // Across the runway (down the sheet) from the web centerline; along the runway from the tie-side bearing stiffener.
  const c=d.brace.connection,t=d.brace,bs=d.bearing,g=stiffenerTieGeometry(p)!,rel=tieRelease(p),hg=columnGussetHeight(p),hole=boltProperties(c.grade,c.diameter).hole;
  const colW=m().column.bf*1000,colT=m().column.tf*1000,tb=t.thickness,tg=t.gussetThickness,inch=25.4;
  // The bars are broken between their bolt groups, and the column below its inner flange, so both ends draw large.
  const z1=g.gussetEnd+1.5*inch,z2=g.face-g.connection-1.5*inch,cut=z2-z1>2*inch?z2-z1:0,gap=14,below=colT+2*inch;
  const scale=drawingScale(Math.min(.36,(250-(cut?gap:0))/(b.bf/2+g.face+below-cut)),p.units),k=scale.pointsPerMm,cx=181,top=430;
  const X=(x:number)=>cx+x*k,Z=(z:number)=>top+(b.bf/2+z)*k-(cut&&z>=z2-1e-6?cut*k-gap:0),edge=Z(b.bf/2),half=Math.max(bs.length/2,b.bf/2),tbk=tb*k,tgk=tg*k;
  // Only what lies under the top flange is hidden: the web, stiffeners and the inner ends of the gusset and bars.
  const plate=(x:number,z0:number,w:number,z1:number)=>(z0<b.bf/2?rect(x,Z(z0),w,Z(Math.min(z1,b.bf/2))-Z(z0),'hidden-line'):'')+(z1>b.bf/2?rect(x,Z(Math.max(z0,b.bf/2)),w,Z(z1)-Z(Math.max(z0,b.bf/2)),'runway-line'):'');
  svg+=line([X(-half),Z(-b.bf/2)],[X(half),Z(-b.bf/2)],'runway-line')+line([X(-half),edge],[X(half),edge],'runway-line');
  svg+=breakLine([X(-half),Z(-b.bf/2)-4],[X(-half),edge+4])+breakLine([X(half),Z(-b.bf/2)-4],[X(half),edge+4]);
  svg+=line([X(-half)-10,Z(0)],[X(half)+10,Z(0)],'grid-line');
  for(const side of [-1,1])svg+=line([X(-half),Z(side*b.tw/2)],[X(half),Z(side*b.tw/2)],'hidden-line')+rect(X(-bs.stiffenerThickness/2),side<0?Z(-g.root):Z(b.tw/2),bs.stiffenerThickness*k,bs.stiffenerWidth*k,'hidden-line');
  svg+=plate(X(-tg/2),g.root,tgk,g.gussetEnd);
  const bars=(z0:number,z1:number)=>[-1,1].map(side=>plate(side<0?X(-tg/2)-tbk:X(tg/2),z0,tbk,z1)).join('');
  if(cut)svg+=bars(g.start,z1)+bars(z2,g.face)+[Z(z1),Z(z2)].map(y=>breakLine([X(-tg/2)-tbk-6,y],[X(tg/2)+tbk+6,y])).join('');
  else svg+=bars(g.start,g.face);
  // Column inner flange at the face, its web broken below.
  const colZ=Z(g.face),colB=colZ+below*k;
  svg+=rect(cx-colW*k/2,colZ,colW*k,colT*k,colLine)+line([cx-m().column.tw*500*k,colZ+colT*k],[cx-m().column.tw*500*k,colB],colLine)+line([cx+m().column.tw*500*k,colZ+colT*k],[cx+m().column.tw*500*k,colB],colLine)+breakLine([cx-colW*k/4,colB],[cx+colW*k/4,colB]);
  svg+=rect(X(-tg/2),Z(g.face-g.connection),tgk,g.connection*k,'runway-line');
  // Bolts run along the runway through bar, gusset and bar; heads and nuts outside the bars.
  const rows=(z0:number)=>Array.from({length:c.rows},(_,i)=>z0+c.edge+i*c.pitch),girderRows=rows(g.start),columnRows=rows(g.face-g.connection);
  for(const z of [...girderRows,...columnRows]){const cls=z<b.bf/2?'hidden-line':'runway-line',head=hole*k*.9,y=Z(z);
   svg+=line([X(-tg/2)-tbk-3,y],[X(tg/2)+tbk+3,y],cls)+rect(X(-tg/2)-tbk-5,y-head/2,2,head,cls)+rect(X(tg/2)+tbk+3,y-head/2,2,head,cls);}
  // Girder-end bolt group, bar length and centerline to column face left of the bars, each on its own line.
  const xb=X(-tg/2)-tbk-8;
  // Pitch nearest the bars and the edge outside it, so neither carried text crosses the other's extension lines.
  if(c.rows>1)svg+=dimV(Z(girderRows[0]),Z(girderRows.at(-1)!),xb,xb-24,c.rows>2?`${c.rows-1} @ ${size(c.pitch)}`:size(c.pitch));
  svg+=dimV(Z(g.start),Z(girderRows[0]),xb,xb-46,size(c.edge));
  svg+=dimV(Z(g.start),colZ,xb,xb-70,dim(t.length))+dimV(Z(0),colZ,xb,xb-94,dim(g.face));
  // Callouts in a column right of the girder, in the order of their targets down the sheet.
  const lx=X(half)+50,items:{at:XY;labels:string[];weld?:'cjp'|'fillet'}[]=[
   {at:[X(half*.6),Z(-b.bf/2)],labels:[`${b.name} RUNWAY GIRDER`,`PLAN; TIE AT ${g.sides.length>1?'BOTH FLANGES':'TOP FLANGE'}`]},
   {at:[X(tg/2),Z(g.root)],labels:['GIRDER GUSSET TO TIE-SIDE BEARING','STIFFENER, EACH TIED FLANGE'],weld:'cjp'},
   {at:[X(tg/2),Z((Math.max(b.bf/2,g.root)+g.gussetEnd)/2)],labels:[`GIRDER GUSSET PL ${size(tg)} X ${size(g.height)} X ${size(g.gussetLength)}`,`${size(g.clear)} INSIDE FLANGE; BARS ${size(g.clear)} CLEAR`,'OF STIFFENER']},
   {at:[X(tg/2)+tbk+3,Z(girderRows.at(-1)!)],labels:[`EACH END: ${2*c.rows} - ${size(c.diameter)} ${c.grade}, ${c.rows} ROWS`,`X 2 AT ${size(c.gauge)} VERT. GAUGE; CLASS ${c.surface}`,`${size(hole)} STD HOLES${rel?' AT THE GIRDER END':''}`]},
   {at:[X(tg/2)+tbk,Z(cut?z1:(g.gussetEnd+g.face-g.connection)/2)-4],labels:[`2 FL ${size(tb)} X ${size(t.width)} (VERTICAL) X ${dim(t.length)}`,'ONE EACH SIDE OF THE GUSSETS']},
   ...(rel?[{at:[X(tg/2)+tbk+3,Z(columnRows[0])] as XY,labels:[`COLUMN END: SLEEVED BOLTS IN ${size(rel.width)} X`,`${size(rel.slot)} VERT. SLOTS; ${size(rel.clearance)} FILLER AT GIRDER GUSSET`]}]:[]),
   {at:[X(tg/2),colZ],labels:[`COLUMN GUSSET PL ${size(tg)} X ${size(hg)} X ${size(g.connection)}`,`2 ROOT FILLETS X ${dim(c.weldLength)}, ${sc.weld}`],weld:'fillet'},
   {at:[cx+colW*k*.3,colZ+colT*k],labels:[colRef]}
  ];
  const height=(v:typeof items[number])=>(v.weld?17:0)+v.labels.length*11,y0=Z(-b.bf/2)-10,y1=colB+6,total=items.reduce((a,v)=>a+height(v),0),space=Math.max(8,(y1-y0-total)/(items.length-1));
  let ly=y0;
  for(const v of items){
   if(v.weld==='cjp')svg+=grooveLeader(v.at,[lx,ly+3],v.labels);
   else if(v.weld)svg+=(sc.field?fieldFilletLeader:filletLeader)([v.at],[lx,ly+3],size(c.weldSize),v.labels,true);
   else svg+=multiLeader([v.at],[lx,ly],v.labels,8.5);
   ly+=height(v)+space;
  }
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
  // Left keeper, clear of the callout leaders: lip over the rail base and clear gap to the rail base edge,
  // stacked above the toe with the text outboard.
  {const xe=x-r.baseWidth*k/2,xi=xe-r.clipProjection*k/2,xt=xi+r.clipProjection*k,xo=xi-r.clipThickness*k,toe=y+(depth-r.baseThickness-r.clipThickness)*k;
   svg+=dimH(xe,xt,toe,toe-9,`${size(r.clipProjection/2)} LIP`,'left',xo)+dimH(xi,xe,toe,toe-21,`${size(r.clipProjection/2)} CLEAR`,'left',xo);}
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
  svg+=dimH(a,z,sy-r.clipThickness*sk,sy-28,`${dim(spacing)} MAX.`)+dimH(a-r.clipWidth*sk/2,a+r.clipWidth*sk/2,sy-r.clipThickness*sk,sy-14,`${size(r.clipWidth)} KEEPER`,'left');
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
  svg+=text(jc,632,`2 BARS ${size(r.jointPlateThickness)} X ${size(r.jointPlateHeight)}; 4 - ${size(r.jointBoltDiameter)} A325 SNUG-TIGHT`,7.2,'middle')+text(jc,640.5,`SLOTS ${size(1.5*r.jointBoltDiameter)} X ${size(hole)} ALONG RAIL; GAP ${size(r.jointGap)}`,7.2,'middle')+'</g>';
  return {svg:svg+'</g>',scale:scale.label};
 }});
 views.push(railLayoutView(s));
 return topic;
}

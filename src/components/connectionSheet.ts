import {supportColumn} from '../engine/drawingData';
import {stiffenerTopCjp} from '../engine/constructionNotes';
import {bracketSeat} from '../engine/rolledBracketInputs';
import {rolledUnderSeat} from './rolledBracketSheet';
import {haunchUnderSeat} from './taperedHaunchSheet';
import {existingBracketLabel} from '../engine/bracketProfiles';
import {activeEndBearing} from '../engine/endBearingInputs';
import {activeColumnCap} from '../engine/columnCapInputs';
import {endBearingView} from './endBearingDetail';
import {usesExistingBracket,existingBracket} from '../engine/existingBracket';
import {flangeTieSection} from './flangeTieSheet';
import {tieSides,tieRelease,columnGussetHeight,stiffenerTieGeometry,stiffenerTieJoint} from '../engine/tieGeometry';
import type { CalculationSnapshot } from '../engine/types';
import { referenceCrossheads } from '../data/aiscReferenceShapes';
import { bearingStiffenerProfile } from './bearingStiffenerGeometry';
import { boltProperties } from '../engine/connectionStrength';
import { defaultFraming, drawnFrameStyle, type FramingSettings } from './framingSettings';
import { planSheetGeometry } from './planSheetGeometry';
import { drawingLength, plateInches,dimensionLength,limitLength} from './drawingFormat';
import {viewConflict,conflictView} from './detailHolds';
import {supportFace} from '../engine/runwayGeometry';
import {refDim, lettering, textWidth, wrapToWidth, sheetDrawingScale as drawingScale, text, line, rect, circle, dimH, dimV, multiLeader, filletLeader, fieldFilletLeader, detailRef, detailTitles, bearingBoltsTitle, columnReference, breakLine, labelCaps, capChannelSection,type XY } from './sheetGraphics';
import { topicSheetSvg, type DetailTopic, type DetailView } from './detailSheet';
import { railLayoutView } from './railLayoutView';
import { railKeeperView } from './railKeeperView';
import { AnnotationSpace, dimVClear } from './annotationSpace';
import {ribGeometry} from '../engine/bracketRib';
import {haunchedRibOutline} from './haunchedBracketDrawing';
import { slidingBoltView } from './slidingBoltSection';
import {isCapAngleTie} from '../engine/capAngle';
import {tiedToBuilding} from '../engine/craneColumnInputs';
import {columnPlates} from '../engine/craneColumn';
import {activeStep} from '../engine/steppedColumnInputs';

/** Girder bearing, end connection, flange tie and rail clip details on their own sheet. */
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
 const dim=(v:number)=>dimensionLength(v,p.units),size=(v:number)=>plateInches(v,p.units);
 // A surveyed existing column is named and drawn as surveyed; only an unsurveyed one takes the reference framing style.
 const sc=supportColumn(p),surveyed=!sc.isNew&&!!p.existingColumn?.enabled,tapered=drawnFrameStyle(p,f)==='tapered';
 // A stepped column receives the tie on its upper shaft.
 const upper=activeStep(p)?.upper;
 const colName=sc.isNew?sc.name:upper?`EXISTING ${upper.shape||'BUILT-UP'} UPPER SHAFT`:surveyed?`EXISTING ${p.existingColumn!.shape||'BUILT-UP'} COLUMN`:tapered?'EXISTING TAPERED COLUMN':'EXISTING BUILDING COLUMN',colRef=sc.isNew?columnReference(p):`${colName} (REF.)`;
 const bracket=referenceCrossheads.find(v=>v.name===f.crosshead)!;
 const colAt=(y:number)=>tapered?m().columnDepthAt(y):m().column.d,colLine=sc.isNew?'runway-line':'reference-line';
 // A crane column tied to the building column (craneColumn.ts): the girder tie lands on the existing building column.
 const tied=tiedToBuilding(p),bcol=tied?columnPlates(p.craneColumn!.building):undefined;
 const tieCol=()=>bcol?{bf:bcol.bf/1000,tf:bcol.tf/1000,tw:bcol.tw/1000}:m().column;
 const tieColRef=bcol?`(E) ${bcol.shape} BUILDING COLUMN (REF.)`:colRef,tieColLine=bcol?'reference-line':colLine,tieField=bcol?true:sc.field,tieWeld=bcol?'FIELD WELD':sc.weld,tieNew=bcol?false:sc.isNew;
 const bracketRef=detailRef(usesExistingBracket(p)?detailTitles.existingBracket:detailTitles.weldedBracket);

 const hole=(x:number,y:number,r:number)=>circle(x,y,r,'runway-line')+line([x-r-3,y],[x+r+3,y],'grid-line')+line([x,y-r-3],[x,y+r+3],'grid-line');
 const wSection=(x:number,y:number,bf:number,depth:number,tf:number,tw:number,cls='runway-line')=>rect(x-bf/2,y,bf,tf,cls)+rect(x-tw/2,y+tf,tw,depth-2*tf,cls)+rect(x-bf/2,y+depth-tf,bf,tf,cls);
 // AWS A2.4 single-bevel groove on the arrow side, CJP in the tail; laid out like the fillet callouts. The
 // perpendicular leg and the 45 degree leg both start at the root on the reference line and open away from it (a
 // closed triangle would be the fillet symbol). The joints are T-joints, so the abutting stiffener or gusset is
 // the beveled member and the arrow needs no break.
 const grooveLeader=(point:XY,at:XY,labels:string[],via:XY[]=[])=>{
  const y=at[1]-3,x=at[0]+41,right=point[0]>at[0]+89,tail=right?at[0]-3:at[0]+92,dir=right?-1:1;
  return `<g data-multileader="weld" data-weld="cjp">${multiLeader([point],at,[],8,via.length?[via]:[],89)}${line([at[0]-3,y],[at[0]+92,y])}${line([x,y],[x,y+8])}${line([x,y],[x+8,y+8])}${line([tail,y],[tail+dir*6,y-5])}${line([tail,y],[tail+dir*6,y+5])}${text(tail+dir*8,y+3,'CJP',8,right?'end':'start')}${labels.map((v,i)=>text(at[0],at[1]+17+i*11,labelCaps(v),8)).join('')}</g>`;
 };
 const topic:DetailTopic={key:'connection',name:'CONNECTIONS',views:[]};
 if(!d)return {...topic,message:['GIRDER-SIDE CONNECTION GEOMETRY HAS NOT BEEN ENTERED.',`REFERENCE COLUMN BRACKET / ${colName}.`]};
 const views:DetailView[]=topic.views;

 // 1: Actual girder transverse section, fitted stiffeners and bearing plate.
 // Receiving bracket and building-column profile remain dashed reference geometry.
 // A column cap carries the girder on the column (column cap details); there is no bracket or flange tie.
 // On a stepped column the girder bears on the step (stepped column details, STEP / SECTION): no bracket.
 const capped=!!activeColumnCap(p);
 if(!capped&&!activeStep(p))views.push({title:detailTitles.bearing,render:()=>{
  let svg='<g data-view="bracket-connection">';
  // Depth drawn below the bearing: the bracket designed here, or the reference bracket. The section is
  // drawn up to 240 deep, its callouts placed against the girder and bracket.
  const ws=wb?rolledUnderSeat(p):undefined,hu=wb?haunchUnderSeat(p)?.g:undefined,seat=wb?bracketSeat(wb):undefined,below=seat?seat.thickness+seat.depth:m().bracketDepth*1000;
  const scale=drawingScale(Math.min(.18,240/(b.d+d.bearing.thickness+below)),p.units),k=scale.pointsPerMm*1000,cx=166,top=120,bottom=top+m().d*k,cy=(top+bottom)/2,face=supportFace(p),inner=wb?cx+wb.reach/1000*k:face!==undefined?cx+face/1000*k:266;
  const pw=d.bearing.width/1000*k,pt=d.bearing.thickness/1000*k,bt=bottom+pt,bb=bt+below/1000*k,colBot=bb+18;
  const C=(y:number)=>colAt((cy-y)/k)*k;
  // Callouts right of the column outline, which widens downward on a tapered column.
  const lx=Math.max(355,inner+Math.max(C(98),C(colBot))+24);
  svg+=line([inner,98],[inner,colBot],colLine)+line([inner+C(98),98],[inner+C(colBot),colBot],colLine);
  svg+=line([inner+m().column.tf*k,98],[inner+m().column.tf*k,colBot],colLine)+line([inner+C(98)-m().column.tf*k,98],[inner+C(colBot)-m().column.tf*k,colBot],colLine);
  if(ws){const wx=inner-ws.L/1000*k,sy=bt+(ws.hasSeat?ws.seat!.t/1000*k:0);if(ws.seat)svg+=rect(inner-ws.seat.y1/1000*k,bt,(ws.seat.y1-ws.seat.y0)/1000*k,ws.seat.t/1000*k,'runway-line');
   svg+=rect(wx,sy,ws.L/1000*k,ws.d/1000*k,'runway-line')+line([wx,sy+ws.tf/1000*k],[inner,sy+ws.tf/1000*k],'runway-line')+line([wx,sy+(ws.d-ws.tf)/1000*k],[inner,sy+(ws.d-ws.tf)/1000*k],'runway-line');}
  else if(hu){
   // Tapered I haunch: the level top flange (the seat), the sloping bottom flange, stiffeners at the girder web line.
   const K=k/1000,Hx=(y:number)=>inner-y*K,Hz=(z:number)=>bt-z*K,inn=(y:number)=>-hu.depth(y)+hu.tbv;
   svg+=rect(Hx(hu.L),Hz(0),hu.L*K,hu.tt*K,'runway-line');
   svg+=`<path class="runway-line" d="M${[[Hx(0),Hz(-hu.hr)],[Hx(hu.L),Hz(-hu.ht)],[Hx(hu.L),Hz(inn(hu.L))],[Hx(0),Hz(inn(0))]].map(q=>q.map(v=>v.toFixed(3)).join(',')).join('L')}Z"/>`;
   svg+=line([Hx(hu.L),Hz(-hu.tt)],[Hx(hu.L),Hz(inn(hu.L))],'runway-line')+rect(Hx(hu.a+hu.stiffener.t/2),Hz(-hu.tt),hu.stiffener.t*K,hu.stiffener.height*K,'runway-line');
  }
  else if(wb){const wx=inner-wb.seatProjection/1000*k;svg+=rect(wx,bt,wb.seatProjection/1000*k,wb.seatThickness/1000*k,'runway-line');if(usesExistingBracket(p)){const e=existingBracket(p),ex=inner-e.projection/1000*k,y=bt+wb.seatThickness/1000*k;svg+=rect(ex,y,e.projection/1000*k,e.depth/1000*k,'reference-line');for(const off of [e.flangeThickness,e.depth-e.flangeThickness])svg+=line([ex,y+off/1000*k],[inner,y+off/1000*k],'reference-line');}else svg+=ribGeometry(wb).tapered?haunchedRibOutline(ribGeometry(wb),wx,inner,bt+wb.seatThickness/1000*k,k/1000):rect(wx,bt+wb.seatThickness/1000*k,wb.seatProjection/1000*k,wb.ribDepth/1000*k,'runway-line');}else{
  svg+=rect(cx-pw/2-8,bt,inner-(cx-pw/2-8),bb-bt,'reference-line');
  svg+=line([cx-pw/2-8,bt+bracket.tf*25.4/1000*k],[inner,bt+bracket.tf*25.4/1000*k],'reference-line')+line([cx-pw/2-8,bb-bracket.tf*25.4/1000*k],[inner,bb-bracket.tf*25.4/1000*k],'reference-line');
  svg+=line([cx-10,bb],[inner,bb+26],'reference-line');
  }
  svg+=wSection(cx,top,m().bf*k,m().d*k,m().tf*k,b.tw/1000*k);
  if(b.kind==='cap')svg+=capChannelSection(b,(x,z)=>[cx+x/1000*k,top-z/1000*k]);
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
  svg+=refDim(dimV(top,bottom,cx-m().bf*k/2,87,drawingLength(b.d,p.units)));
  svg+=multiLeader([[inner+C(110),110]],[lx,100],[colRef]);
  // Capped girders: stiffeners CJP to the W top flange (its own groove callout), fitted at the bottom only.
  const cjp=stiffenerTopCjp(p),stiffY=cjp?170:165;
  if(cjp)svg+=grooveLeader([cx+(b.tw/2+d.bearing.stiffenerWidth*.6)/1000*k,top+b.tf/1000*k+1],[lx,128],['CJP TO W TOP FLANGE','BOTH STIFFENERS'],[[215,150]]);
  svg+=multiLeader(stiffPts,[lx,stiffY],[`2 PL ${size(d.bearing.stiffenerThickness)} X ${size(d.bearing.stiffenerWidth)}`,`FULL-DEPTH FITTED BEARING STIFFENERS`,`${size(d.bearing.cope)} WEB-SIDE CORNER COPES`],8,stiffPts.map(()=>[[215,stiffY-5]]));
  svg+=filletLeader([weldPts[1]],[lx,218],size(d.bearing.weldSize),['TYP. BOTH STIFFENERS',cjp?'CONT. WEB FILLETS':'CONT. WEB & FLANGE FILLETS',cjp?'FIT BOTTOM END':'FIT / MILL STIFFENER ENDS'],true);
  svg+=multiLeader([hu?[inner-hu.L*.15*k/1000,bt+hu.hr*.55*k/1000]:[230,(bt+bb)/2]],[lx,287],usesExistingBracket(p)?[`EXISTING ${existingBracketLabel(d.bracket)}`,`NEW BOLTED SEAT: ${bracketRef}`]:hu?['WELDED TAPERED I HAUNCH',`STIFFENERS: ${detailRef(detailTitles.haunchSection)}; WELDS: ${bracketRef}`]:ws?[`WELDED ${ws.name} COLUMN BRACKET`,`${ws.seat?'SEAT / ':''}STIFFENERS / WELDS: ${bracketRef}`]:wb?['WELDED COLUMN BRACKET',`SEAT / RIBS / WELDS: ${bracketRef}`]:['COLUMN BRACKET (REF.)','COLUMN ATTACHMENT BY','BUILDING DESIGNER']);
  // Below the bracket and the broken column, clear of the reference bracket's sloped soffit and of the bracket callout's
  // leader (a long plate size in SI): lower or farther left where the leader would cross it.
  const plate=[`BEARING PL ${size(d.bearing.thickness)} X ${size(d.bearing.width)} X ${size(d.bearing.length)}`],plateY=bb+(wb?32:40),drawn=new AnnotationSpace(svg);
  svg+=drawn.pick([[111,plateY],[111,plateY+14],[60,plateY],[60,plateY+14],[111,plateY+28]].map(([x,y])=>multiLeader([[cx,bottom+pt]],[x,y],plate)));
  // Without a designed bracket the column face is where the survey or the tie puts it (supportFace): dimensioned, to verify.
  if(!wb&&face!==undefined)svg+=drawn.pick([plateY+40,plateY+54,plateY+68].map(y=>line([cx,y-10],[cx,y+4],'annotation')+line([inner,y-10],[inner,y+4],'annotation')+dimH(cx,inner,y-4,y,dimensionLength(face,p.units))+text((cx+inner)/2,y+14,'GIRDER C/L TO COLUMN FACE (FIELD VERIFY; ADJUST TIE LENGTH)',lettering.text,'middle')));
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
  const seatEnd=wb?bracketSeat(wb):undefined,ws=wb?rolledUnderSeat(p):undefined,brD=seatEnd?(seatEnd.thickness+seatEnd.depth)*k:m().bracketDepth*1000*k,cut=yb+Math.min(brD+8,stub);
  const clipRect=(x:number,y:number,w:number,h:number,cls:string)=>y+h<=cut?rect(x,y,w,h,cls):line([x,y],[x+w,y],cls)+line([x,y],[x,cut],cls)+line([x+w,y],[x+w,cut],cls);
  const clipW=(x:number,y:number,bf:number,depth:number,tf:number,tw:number)=>y+depth<=cut?wSection(x,y,bf,depth,tf,tw,'reference-line'):rect(x-bf/2,y,bf,tf,'reference-line')+clipRect(x-tw/2,y+tf,tw,depth,'reference-line');
  svg+=line([colX-colB/2,top+4],[colX+colB/2,top+4],'reference-line')+[-colB/2,5-colB/2,colB/2-5,colB/2].map(dx=>line([colX+dx,top+4],[colX+dx,cut],'reference-line')).join('');
  if(ws){const y=yb+(ws.seat?ws.seat.t*k:0);if(ws.seat)svg+=rect(colX-ws.seat.length*k/2,yb,ws.seat.length*k,ws.seat.t*k,'runway-line');svg+=rect(colX-ws.bf*k/2,y,ws.bf*k,ws.tf*k,'runway-line')+clipRect(colX-ws.tw*k/2,y+ws.tf*k,ws.tw*k,(ws.d-ws.tf)*k,'runway-line');}
  else if(wb&&haunchUnderSeat(p)){const h=haunchUnderSeat(p)!.g;svg+=rect(colX-h.bt*k/2,yb,h.bt*k,h.tt*k,'runway-line')+clipRect(colX-h.tw*k/2,yb+h.tt*k,h.tw*k,(h.hr-h.tt)*k,'runway-line');}
  else if(wb){svg+=rect(colX-wb.seatLength*k/2,yb,wb.seatLength*k,wb.seatThickness*k,'runway-line');const y=yb+wb.seatThickness*k;if(existing)svg+=clipW(colX,y,existing.width*k,existing.depth*k,existing.flangeThickness*k,existing.webThickness*k);else for(const side of [-1,1])svg+=clipRect(colX+(side*wb.ribSpacing-wb.ribThickness)*k/2,y,wb.ribThickness*k,wb.ribDepth*k,'runway-line');}else svg+=clipW(colX,yb,brB,brD,bracket.tf*25.4*k,bracket.tw*25.4*k);
  const half=Math.max(colB,brB,seatEnd?seatEnd.length*k:0)/2+6;
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
  svg+=multiLeader([pts[1]],[lx,100],[`${2*c.rows} - ${size(c.diameter)} ${c.grade} BOLTS THRU GIRDER WEB`,`${size(boltProperties(c.grade,c.diameter).hole)} STD HOLES, CLASS ${c.surface} SURFACES`,`${size(c.edge)} EDGE DIST. TYP.`]);
  svg+=multiLeader([[x+w*k*.3,y+h*k*.15]],[lx,148],[`2 COVER PL ${size(c.thickness)} X ${size(w)} X ${size(h)}`,'ONE EACH SIDE OF GIRDER WEB']);
  svg+=filletLeader([[xr,y+h*k-6]],[lx,192],size(c.weldSize),['EACH COVER PL TO END PL, OUTER FACE',`${size(c.weldLength)} LONG, ${size(c.projection)} FROM BOLTS`]);
  svg+=multiLeader([[xr+ep,y-6]],[lx,239],['COLUMN-SIDE END PL (REF.); END PL AND','ITS ATTACHMENT TO THE COLUMN BY THE','BUILDING DESIGNER']);
  svg+=multiLeader([[colX,wb&&!existing?yb+(ws?.seat?.t??seatEnd?.thickness??0)*k/2:yb+Math.min(brD,stub)*.6]],[lx,284],[usesExistingBracket(p)?`EXISTING BRACKET / ${bracketRef}`:wb?`WELDED BRACKET / ${bracketRef}`:'COLUMN BRACKET (REF.)',`ROTATION CLEARANCE ${size(gap)}`]);
  svg+=text(638,Math.max(cut+16,322),p.system==='simple'?`THE END PL IS THE COLUMN-SIDE MOVEMENT ATTACHMENT; SEE ${detailRef(detailTitles.movement)}.`:`${colName} BEYOND (REF.). END PL ATTACHMENT, WITH A THERMAL RELEASE AT ONE RUNWAY END, BY BUILDING DESIGNER.`,7.8);
  return {svg:svg+'</g>',scale:scale.label};
 }});

 // 3: Plan of an actual flange-to-column tie. The symmetric pair of bars is
 // represented by front/back outlines; arrows identify both end bolt groups.
 // The cap tieback angle has its own details (capAngleSheet.ts).
 if(isCapAngleTie(p)){}
 else if(d.brace.flangeAttachment?.enabled){if(withFlangeTie)views.push({title:detailTitles.flangeTie,render:()=>flangeTieSection(s,48,436)});}
 else if(!capped||tied)views.push({title:detailTitles.tie,render:()=>{
  let svg='<g data-view="tie-connection">';
  // Across the runway (down the sheet) from the web centerline; along the runway from the tie-side bearing stiffener.
  const c=d.brace.connection,t=d.brace,bs=d.bearing,g=stiffenerTieGeometry(p)!,integral=stiffenerTieJoint(p)==='integral',rel=tieRelease(p),hg=columnGussetHeight(p),hole=boltProperties(c.grade,c.diameter).hole;
  // A part that cannot be built as dimensioned is not drawn (detailHolds.viewConflict).
  const conflict=viewConflict(s,{sizes:[g.gussetLength,g.columnGussetLength,g.clear,t.length,g.face,hg],fits:/^tie-stiffener-(bar-clearance|fit)$/,checks:/^tie-/});
  if(conflict)return conflictView(conflict);
  const colW=tieCol().bf*1000,colT=tieCol().tf*1000,tb=t.thickness,tg=t.gussetThickness,inch=25.4;
  // The bars are broken between their bolt groups, and the column below its inner flange, so both ends draw large.
  const z1=Math.max(g.gussetEnd,b.bf/2)+1.5*inch,z2=g.face-g.connection-1.5*inch,cut=z2-z1>2*inch?z2-z1:0,gap=14,below=colT+2*inch;
  const scale=drawingScale(Math.min(.36,(250-(cut?gap:0))/(b.bf/2+g.face+below-cut)),p.units),k=scale.pointsPerMm,cx=181,top=430;
  const X=(x:number)=>cx+x*k,Z=(z:number)=>top+(b.bf/2+z)*k-(cut&&z>=z2-1e-6?cut*k-gap:0),edge=Z(b.bf/2),half=Math.max(bs.length/2,b.bf/2),tbk=tb*k,tgk=tg*k;
  // Only what lies under the top flange is hidden: the web, stiffeners and the inner ends of the gusset and bars.
  const plate=(x:number,z0:number,w:number,z1:number)=>(z0<b.bf/2?rect(x,Z(z0),w,Z(Math.min(z1,b.bf/2))-Z(z0),'hidden-line'):'')+(z1>b.bf/2?rect(x,Z(Math.max(z0,b.bf/2)),w,Z(z1)-Z(Math.max(z0,b.bf/2)),'runway-line'):'');
  svg+=line([X(-half),Z(-b.bf/2)],[X(half),Z(-b.bf/2)],'runway-line')+line([X(-half),edge],[X(half),edge],'runway-line');
  svg+=breakLine([X(-half),Z(-b.bf/2)-4],[X(-half),edge+4])+breakLine([X(half),Z(-b.bf/2)-4],[X(half),edge+4]);
  svg+=line([X(-half)-10,Z(0)],[X(half)+10,Z(0)],'grid-line');
  for(const side of [-1,1])svg+=line([X(-half),Z(side*b.tw/2)],[X(half),Z(side*b.tw/2)],'hidden-line')+rect(X(-bs.stiffenerThickness/2),side<0?Z(-g.root):Z(b.tw/2),bs.stiffenerThickness*k,bs.stiffenerWidth*k,'hidden-line');
  svg+=plate(X(-tg/2),g.root,tgk,g.gussetEnd);
  // With the column-end slide the bars stand off both gusset faces by the filler at the girder gusset.
  const off=rel?.barOffset??0,offk=off*k;
  const bars=(z0:number,z1:number)=>[-1,1].map(side=>plate(side<0?X(-tg/2)-offk-tbk:X(tg/2)+offk,z0,tbk,z1)).join('');
  if(off)for(const side of [-1,1])svg+=plate(side<0?X(-tg/2)-offk:X(tg/2),g.start,offk,g.gussetEnd);
  if(cut)svg+=bars(g.start,z1)+bars(z2,g.face)+[Z(z1),Z(z2)].map(y=>breakLine([X(-tg/2)-offk-tbk-6,y],[X(tg/2)+offk+tbk+6,y])).join('');
  else svg+=bars(g.start,g.face);
  // Column inner flange at the face, its web broken below.
  const colZ=Z(g.face),colB=colZ+below*k;
  svg+=rect(cx-colW*k/2,colZ,colW*k,colT*k,tieColLine)+line([cx-tieCol().tw*500*k,colZ+colT*k],[cx-tieCol().tw*500*k,colB],tieColLine)+line([cx+tieCol().tw*500*k,colZ+colT*k],[cx+tieCol().tw*500*k,colB],tieColLine)+breakLine([cx-colW*k/4,colB],[cx+colW*k/4,colB]);
  svg+=rect(X(-tg/2),Z(g.columnGussetStart),tgk,g.columnGussetLength*k,'runway-line');
  // Bolts run along the runway through bar, gusset and bar; heads and nuts outside the bars.
  const rows=(z0:number)=>Array.from({length:c.rows},(_,i)=>z0+c.edge+i*c.pitch),girderRows=rows(g.start),columnRows=rows(g.face-g.connection);
  for(const z of [...girderRows,...columnRows]){const cls=z<b.bf/2?'hidden-line':'runway-line',head=hole*k*.9,y=Z(z);
   svg+=line([X(-tg/2)-offk-tbk-3,y],[X(tg/2)+offk+tbk+3,y],cls)+rect(X(-tg/2)-offk-tbk-5,y-head/2,2,head,cls)+rect(X(tg/2)+offk+tbk+3,y-head/2,2,head,cls);}
  // Girder-end bolt group, bar length and centerline to column face left of the bars, each on its own line.
  const xb=X(-tg/2)-offk-tbk-8;
  // Pitch nearest the bars and the edge outside it, so neither carried text crosses the other's extension lines.
  // A value too long for its dimension reads where it is clear of the drawn girder and ties.
  const drawn=new AnnotationSpace(svg);
  if(c.rows>1)svg+=dimVClear(drawn,Z(girderRows[0]),Z(girderRows.at(-1)!),xb,xb-24,c.rows>2?`${c.rows-1} @ ${size(c.pitch)}`:size(c.pitch));
  svg+=dimVClear(drawn,Z(g.start),Z(girderRows[0]),xb,xb-46,size(c.edge));
  svg+=dimVClear(drawn,Z(g.start),colZ,xb,xb-70,dim(t.length))+dimVClear(drawn,Z(0),colZ,xb,xb-94,dim(g.face));
  // Callouts in a column right of the girder, in the order of their targets down the sheet.
  const lx=X(half)+50,items:{at:XY;labels:string[];weld?:'cjp'|'fillet'}[]=[
   {at:[X(half*.6),Z(-b.bf/2)],labels:[`${b.name} RUNWAY GIRDER`,`PLAN; TIE AT ${g.sides.length>1?'BOTH FLANGES':'TOP FLANGE'}`]},
   integral?{at:[X(tg/2),Z(g.root)],labels:['TIE-SIDE BEARING STIFFENER AND GIRDER','GUSSET CUT FROM ONE PLATE, EACH TIED',`FLANGE; ${size(inch)} R GROUND AT THE CORNER`]}
    :{at:[X(tg/2),Z(g.root)],labels:['GIRDER GUSSET TO TIE-SIDE BEARING','STIFFENER, EACH TIED FLANGE'],weld:'cjp'},
   {at:[X(tg/2),Z((Math.max(b.bf/2,g.root)+g.gussetEnd)/2)],labels:[`${integral?'STIFFENER EXTENSION':'GIRDER GUSSET PL'} ${size(tg)} X ${size(g.height)} X ${size(g.gussetLength)}`,`${size(g.clear)} INSIDE FLANGE; BARS ${size(g.clear)} CLEAR`,'OF STIFFENER']},
   {at:[X(tg/2)+offk+tbk+3,Z(girderRows.at(-1)!)],labels:[`EACH END: ${2*c.rows} - ${size(c.diameter)} ${c.grade}, ${c.rows} ROW${c.rows>1?"S":""}`,`X 2 AT ${size(c.gauge)} VERT. GAUGE; CLASS ${c.surface}`,`${size(hole)} STD HOLES${rel?' AT THE GIRDER END':''}`]},
   {at:[X(tg/2)+offk+tbk,Z(cut?z1:(g.gussetEnd+g.face-g.connection)/2)-4],labels:[`2 FB ${size(tb)} X ${size(t.width)} (VERTICAL) X ${dim(t.length)}`,'ONE EACH SIDE OF THE GUSSETS']},
   ...(rel?[{at:[X(tg/2)+offk+tbk+3,Z(columnRows[0])] as XY,labels:[`COLUMN END: SLEEVED BOLTS IN ${size(rel.width)} X`,...(rel.slide?[`${size(rel.slot)} VERT. SLOTS; GUSSET SLIDES ${size(rel.slide)}`,`EACH WAY ALONG THE RUNWAY; ${size(rel.barOffset)} FILLER`,'EACH FACE AT GIRDER GUSSET']:[`${size(rel.slot)} VERT. SLOTS; ${size(rel.clearance)} FILLER AT GIRDER GUSSET`]),
    // The slots take the support's deflection limit handed to its designer (S-00): the same words as there.
    ...(()=>{const lim=s.checks.find(v=>v.id==='tie-move-support')?.capacity;return lim!==undefined&&lim>0?[activeStep(p)?'SLOTS TAKE THE STEP\'S VERTICAL':'SLOTS TAKE THE BRACKET\'S VERTICAL','DEFLECTION AT THE BEARING UNDER CRANE',`LOADS ${limitLength(lim,p.units,'max')} MAX.`]:[];})()]}]:[]),
   {at:[X(tg/2),colZ],labels:[`COLUMN GUSSET PL ${size(tg)} X ${size(hg)} X ${size(g.columnGussetLength)}`,`2 ROOT FILLETS X ${dim(c.weldLength)}, ${tieWeld}`],weld:'fillet'},
   {at:[cx+colW*k*.3,colZ+colT*k],labels:[tieColRef]}
  ];
  const height=(v:typeof items[number])=>(v.weld?17:0)+v.labels.length*11,y0=Z(-b.bf/2)-10,y1=colB+6,total=items.reduce((a,v)=>a+height(v),0),space=Math.max(8,(y1-y0-total)/(items.length-1));
  // In the order of their targets down the sheet; two neighbours whose straight leaders would still cross (targets at
  // nearly one depth, far apart across the sheet: a wide column flange beside the gusset root weld) swap places.
  items.sort((u,v)=>u.at[1]-v.at[1]);
  {const side=(p:XY,q:XY,o:XY)=>Math.sign((q[0]-p[0])*(o[1]-p[1])-(q[1]-p[1])*(o[0]-p[0]));
   const crosses=(a:[XY,XY],r:[XY,XY])=>side(a[0],a[1],r[0])*side(a[0],a[1],r[1])<0&&side(r[0],r[1],a[0])*side(r[0],r[1],a[1])<0;
   // Crossing pairs of straight leaders, each from its target to its label in the column.
   const count=()=>{const ys=items.map((_,j)=>y0+items.slice(0,j).reduce((a,v)=>a+height(v)+space,0)),seg=items.map((v,j):[XY,XY]=>[v.at,[lx-14,ys[j]+(v.weld?3:0)]]);
    let n=0;for(let i=0;i<seg.length;i++)for(let j=i+1;j<seg.length;j++)if(crosses(seg[i],seg[j]))n++;return n;};
   // A neighbour swap is kept only where it leaves fewer crossings.
   for(let n=count(),pass=0;n>0&&pass<items.length;pass++)for(let i=0;i+1<items.length;i++){
    [items[i],items[i+1]]=[items[i+1],items[i]];const m=count();if(m<n)n=m;else [items[i],items[i+1]]=[items[i+1],items[i]];}}
  let ly=y0;
  for(const v of items){
   if(v.weld==='cjp')svg+=grooveLeader(v.at,[lx,ly+3],v.labels);
   else if(v.weld)svg+=(tieField?fieldFilletLeader:filletLeader)([v.at],[lx,ly+3],size(c.weldSize),v.labels,true);
   else svg+=multiLeader([v.at],[lx,ly],v.labels,8.5);
   ly+=height(v)+space;
  }
  return {svg:svg+'</g>',scale:scale.label};
 }});

 // 3a: Elevation of the stiffener tie looking along the runway: the tie line below the top of steel, the gusset, bars,
 // bolt gauge, the column gusset with its vertical slots and sleeves, and where the tie sits at the runway-end grids.
 if((!capped||tied)&&!isCapAngleTie(p)&&!d.brace.flangeAttachment?.enabled&&stiffenerTieGeometry(p))views.push({title:detailTitles.tieElevation,render:()=>tieElevation()});
 function tieElevation(){
  const c=d!.brace.connection,t=d!.brace,bs=d!.bearing,g=stiffenerTieGeometry(p)!,rel=tieRelease(p),hg=columnGussetHeight(p),integral=stiffenerTieJoint(p)==='integral',inch=25.4;
  const conflict=viewConflict(s,{sizes:[g.gussetLength,g.columnGussetLength,g.clear,t.length,g.face,hg],fits:/^tie-stiffener-(bar-clearance|fit)$/,checks:/^tie-/});
  if(conflict)return conflictView(conflict);
  const colT=tieCol().tf*1000,drop=b.d/2-g.topCenter,low=Math.max(drop+Math.max(hg,t.width)/2,drop+t.width/2)+2*inch;
  const scale=drawingScale(Math.min(.36,250/(b.bf/2+g.face+colT+inch),200/low),p.units),k=scale.pointsPerMm,cx=120,top=60;
  // Across the runway (right) from the web centerline; down the sheet from the top of steel.
  const X=(y:number)=>cx+y*k,Z=(z:number)=>top+z*k;
  let svg='<g data-view="tie-elevation">';
  // Girder top flange, web and the tie-side bearing stiffener, broken below the tie.
  svg+=rect(X(-b.bf/2),Z(0),b.bf*k,b.tf*k,'runway-line')+rect(X(-b.tw/2),Z(b.tf),b.tw*k,(low-b.tf)*k,'runway-line');
  svg+=rect(X(b.tw/2),Z(b.tf),bs.stiffenerWidth*k,(low-b.tf)*k,'runway-line')+breakLine([X(-b.tw/2)-6,Z(low)],[X(g.root)+6,Z(low)]);
  // Girder gusset (the stiffener's own extension, or a CJP gusset), bars, column gusset and the column flange.
  const z0=drop-g.height/2,zb0=drop-t.width/2,zc0=drop-hg/2;
  svg+=rect(X(g.root),Z(z0),(g.start-g.root)*k,g.height*k,'runway-line')+rect(X(g.start),Z(z0),(g.gussetEnd-g.start)*k,g.height*k,'hidden-line');
  svg+=rect(X(g.start),Z(zb0),(g.face-g.start)*k,t.width*k,'runway-line');
  svg+=rect(X(g.columnGussetStart),Z(zc0),g.columnGussetLength*k,hg*k,'hidden-line');
  const colTop=Math.min(0,zc0)-inch,colBot=Math.max(low,zc0+hg+inch);
  svg+=rect(X(g.face),Z(colTop),colT*k,(colBot-colTop)*k,tieNew?'runway-line':'reference-line')+breakLine([X(g.face)-4,Z(colTop)],[X(g.face+colT)+4,Z(colTop)])+breakLine([X(g.face)-4,Z(colBot)],[X(g.face+colT)+4,Z(colBot)]);
  // Bolts: two at the vertical gauge in each row; at the column end in vertical slots with their sleeves.
  const rows=(y0:number)=>Array.from({length:c.rows},(_,i)=>y0+c.edge+i*c.pitch),girderRows=rows(g.start),columnRows=rows(g.face-g.connection),zs=[drop-c.gauge/2,drop+c.gauge/2];
  for(const y of girderRows)for(const z of zs)svg+=circle(X(y),Z(z),c.diameter*k/2,'runway-line');
  for(const y of columnRows)for(const z of zs){
   svg+=circle(X(y),Z(z),(rel?rel.od:c.diameter)*k/2,'runway-line');
   if(rel)svg+=rect(X(y-rel.width/2),Z(z-rel.slot/2),rel.width*k,rel.slot*k,'hidden-line');
  }
  // Dimensions left of the girder: the tie centerline below the top of steel; right of the column: the gauge and the
  // column gusset height.
  const xl=X(-b.bf/2)-10,xr=X(g.face+colT)+18;
  svg+=line([X(-b.bf/2)-4,Z(drop)],[X(g.face)+2,Z(drop)],'grid-line');
  svg+=dimV(Z(0),Z(drop),X(-b.bf/2),xl,`${size(drop)} TIE C/L`);
  // Callouts below the view, in the order of their targets across the sheet.
  const ends=g.stations.filter(v=>v.station===0||Math.abs(v.station-p.spans.reduce((a,v)=>a+v,0))<1e-6).map(v=>Math.abs(v.offset)),inner=g.stations.filter(v=>!ends.includes(Math.abs(v.offset))).map(v=>Math.abs(v.offset));
  const items:{at:XY;labels:string[]}[]=[
   {at:[X((g.root+b.tw/2)/2),Z(low-inch)],labels:integral?['TIE-SIDE BEARING STIFFENER, EXTENDED',`AS THE GIRDER GUSSET ${size(g.height)} HIGH`]:[`GIRDER GUSSET PL ${size(t.gussetThickness)} X ${size(g.height)},`,'CJP TO THE TIE-SIDE BEARING STIFFENER']},
   {at:[X((g.start+g.gussetEnd)/2),Z(zb0+t.width)],labels:[`2 FB ${size(t.thickness)} X ${size(t.width)} (VERTICAL),`,`${size(g.clear)} BELOW THE FLANGE`]},
   {at:[X(girderRows[0]),Z(zs[1])],labels:[`${size(c.diameter)} ${c.grade} AT ${size(c.gauge)} VERT. GAUGE`]},
   {at:[X(columnRows.at(-1)!),Z(zs[1])],labels:rel?[`SLEEVES ${size(rel.od)} OD X ${size(rel.hole)} BORE X ${size(rel.sleeveLength)}`,`IN ${size(rel.width)} X ${size(rel.slot)} VERT. SLOTS`]:[`${size(boltProperties(c.grade,c.diameter).hole)} STD HOLES`]}];
  // Callouts in a column right of the dimensions, in the order of their targets down the sheet, each level with its
  // target where the column has room.
  const lx=xr+48;let ly=Z(colTop);
  items.sort((u,v)=>u.at[1]-v.at[1]||u.at[0]-v.at[0]);
  for(const v of items){const y=Math.max(ly,v.at[1]-4);svg+=multiLeader([v.at],[lx,y],v.labels,8.5);ly=y+v.labels.length*11+10;}
  // The gauge and column gusset height read where they are clear of the leaders drawn.
  const drawn=new AnnotationSpace(svg);
  svg+=dimVClear(drawn,Z(zc0),Z(zc0+hg),X(g.face+colT),xr,size(hg))+dimVClear(drawn,Z(zs[0]),Z(zs[1]),X(columnRows.at(-1)!)+6,xr+22,size(c.gauge));
  const yL=Math.max(ly,Z(colBot))+6,lw=lx+Math.max(...items.flatMap(v=>v.labels.map(l=>textWidth(l,8.5))))-X(-b.bf/2);
  // Where the tie sits along the runway: on the tie-side stiffener at the bearing center, the column gusset with it.
  const note=wrapToWidth(labelCaps(`Column gusset on the column flange in line with the tie-side bearing stiffener, at the bearing center: ${ends.length?Math.max(...ends)<1?'on the grid line at the runway-end grids':`${dim(Math.max(...ends))} inboard of the grid at the runway-end grids`:''}${ends.length&&inner.length?', ':''}${inner.length?`${dim(Math.max(...inner))} each side of the shared grids`:''}. The tie centerline is ${size(drop)} below the top of steel.`),Math.max(260,lw),lettering.text);
  note.forEach((v,i)=>{svg+=text(X(-b.bf/2),yL+14+i*lettering.noteLeading,v,lettering.text);});
  return {svg:svg+'</g>',scale:scale.label};
 }

 // 4: Rail clips and pad on the cap web or the bare W top flange; the bolted rail joint; the rail layout.
 views.push(railKeeperView(s));
 views.push(railLayoutView(s));
 return topic;
}

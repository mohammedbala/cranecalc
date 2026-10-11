import {preheatBasis} from '../engine/constructionNotes';
import {supportColumn} from '../engine/drawingData';
import {heading,numbered,type Style} from './noteBlocks';
import type {CalculationSnapshot} from '../engine/types';
import {drawingLength,electrodeClass,plateInches} from './drawingFormat';
import {sheetDrawingScale,textWidth,line,rect,text,circle,dimH,dimV,multiLeader,filletLeader,fieldWeldFlag,labelCaps,detailRef,detailTitles,columnReference,sectionCut,bearingBoltsTitle,type XY} from './sheetGraphics';
import type {DetailTopic,DetailView} from './detailSheet';
import {format} from '../engine/units';
import {bracketForceBlocks} from './bracketForceTable';
import {designsBracing} from '../engine/newColumnBracing';
import {activeEndBearing} from '../engine/endBearingInputs';
import {endBearingGeometry} from '../engine/endBearing';
import {simpleSupportInput} from '../engine/simpleSupports';
import {flangeTieGeometry} from '../engine/tieGeometry';
import {projectStub,stubBoltLayout,stubWeldGroup,usesRolledBracket} from '../engine/rolledBracket';
import {stiffenerDrawing,stiffenerSideEdges,lowerEdgeTarget,stiffenerPlan,stiffenerFaceHidden,columnStiffenerView,columnStiffenerTitle,stiffenerNotes} from './columnStiffenerDrawing';

/** Elevation of the bracket seen from the runway; also keyed on the plan (same title as the plate brackets). */
export const rolledElevationTitle='BRACKET ELEVATION / LOOKING AT COLUMN';
const rolledPlanTitle='WIDE-FLANGE BRACKET / PLAN';
type Item={at:XY;labels:string[];weld?:string;both?:boolean;field?:boolean;groove?:boolean};
/**
 * AWS A2.4 single-bevel groove symbol, CJP in the tail, laid out like the fillet callouts (the bevel opens away from
 * the reference line on the arrow side); a field flag stands at the reference-line junction for a field weld.
 */
export function grooveLeader(points:XY[],at:XY,labels:string[],field=false){
 const y=at[1]-3,x=at[0]+41,right=points.every(p=>p[0]>at[0]+89),tail=right?at[0]-3:at[0]+92,dir=right?-1:1;
 return `<g data-multileader="weld" data-weld="cjp"${field?' data-weld-location="field"':''}>${multiLeader(points,at,[],8,[],89)}${line([at[0]-3,y],[at[0]+92,y])}${line([x,y],[x,y+8])}${line([x,y],[x+8,y+8])}${line([tail,y],[tail+dir*6,y-5])}${line([tail,y],[tail+dir*6,y+5])}${text(tail+dir*8,y+3,'CJP',8,right?'end':'start')}${labels.map((v,i)=>text(at[0],at[1]+17+i*11,labelCaps(v),8)).join('')}${field?fieldWeldFlag(right?[at[0]+117,at[1]]:at):''}</g>`;
}
/** Callouts in a column at x, ordered by target height between top and bottom: plain, fillet or CJP groove. */
function calloutColumn(items:Item[],x:number,top:number,bottom:number){
 const sorted=[...items].sort((a,b)=>a.at[1]-b.at[1]),height=(v:Item)=>(v.weld||v.groove?17:0)+v.labels.length*11;
 const total=sorted.reduce((a,v)=>a+height(v),0),gap=Math.max(8,(bottom-top-total)/Math.max(1,sorted.length-1));
 let y=top,svg='';
 for(const v of sorted){
  svg+=v.groove?grooveLeader([v.at],[x,y+3],v.labels,v.field):v.weld?filletLeader([v.at],[x,y+3],v.weld,v.labels,!!v.both,[],!!v.field):multiLeader([v.at],[x,y],v.labels);
  y+=height(v)+gap;
 }
 return svg;
}
/** Rolled wide-flange bracket: transverse section, plan and elevation with the bracket notes and design forces. */
export function rolledBracketTopic(s:CalculationSnapshot):DetailTopic|undefined{
 const p=s.input,d=p.details,b=d?.bracket;if(!d||!b?.enabled||!usesRolledBracket(p))return undefined;
 const st=projectStub(p),r=st.input,seat=st.seat,sf=st.stiffener,g=stubWeldGroup(st);
 const dim=(v:number)=>drawingLength(v,p.units),size=(v:number)=>plateInches(v,p.units);
 const sc=supportColumn(p),collector=designsBracing(p),eb=activeEndBearing(p),eg=eb?endBearingGeometry(p,eb):undefined,gap=p.system==='simple'?simpleSupportInput(p).endGap:0;
 const a=b.reach,W=d.bearing.width,tb=d.bearing.thickness,ts=seat?.t??0,where=sc.isNew?'SHOP':'FIELD';
 const plate=seat?{length:seat.length,label:`SEAT PL ${size(seat.t)}`}:{length:st.bf,label:`${st.name} TOP FLANGE`};
 const stubLabel=`${st.name} X ${dim(st.L)} LONG`,stiffLabel=sf?`2 STIFF. PL ${size(sf.t)} X ${size(sf.width)}`:'';
 const flangeWeld:Item=g.cjp?{at:[0,0],labels:['TOP AND BOTTOM FLANGES',`TO ${sc.name}, ${where}`],groove:true,field:sc.field}:{at:[0,0],labels:['TOP AND BOTTOM FLANGES, BOTH',`FACES, TO ${sc.name}, ${where}`],weld:size(r.flangeWeld),both:true,field:sc.field};
 const webWeld:Item={at:[0,0],labels:['WEB, BOTH SIDES, BETWEEN',`ROLLED FILLETS, ${where}`],weld:size(r.webWeld),both:true,field:sc.field};
 const views:DetailView[]=[],cs=stiffenerDrawing(p),colCls=sc.isNew?'runway-line':'reference-line';
 // Transverse section beyond the flange tip, looking at the stub web: the stub, seat, stiffener edge-on and welds.
 views.push({title:detailTitles.weldedBracket,render:()=>{
  const scale=sheetDrawingScale(Math.min(cs?.29:.25,175/(st.d+ts+tb),250/st.L,cs?310/(st.L+b.receiver.depth):1),p.units),k=scale.pointsPerMm;
  // With column stiffeners the whole column depth is drawn beyond the flange, left of the callouts.
  const face=cs?Math.min(319,366-b.receiver.depth*k):319,tip=face-st.L*k,top=150,ft=top+ts*k,bot=ft+st.d*k,center=face-a*k,X=(y:number)=>face-y*k;
  let svg='<g data-view="rolled-bracket-side">';
  svg+=rect(face,top-34,b.receiver.flangeThickness*k,bot-top+60,colCls);
  const Ys=(z:number)=>top-z*k;
  if(cs)svg+=stiffenerSideEdges(cs.g,{face,k,Y:Ys,top:top-34,bottom:bot+26,cls:colCls});
  if(seat)svg+=rect(X(seat.y1),top,(seat.y1-seat.y0)*k,ts*k,'runway-line');
  svg+=rect(tip,ft,st.L*k,st.d*k,'runway-line')+line([tip,ft+st.tf*k],[face,ft+st.tf*k],'runway-line')+line([tip,bot-st.tf*k],[face,bot-st.tf*k],'runway-line');
  if(sf)svg+=rect(center-sf.t*k/2,ft+st.tf*k,sf.t*k,(st.d-2*st.tf)*k,'runway-line');
  svg+=rect(center-W*k/2,top-tb*k,W*k,tb*k,'runway-line');
  svg+=line([center,top-tb*k-14],[center,bot+9],'grid-line');
  svg+=dimH(center,face,top-tb*k,top-tb*k-22,dim(a));
  svg+=dimH(tip,face,bot,bot+22,dim(st.L));
  svg+=dimV(ft,bot,tip,tip-20,dim(st.d));
  svg+=multiLeader([[center-W*k*.3,top-tb*k]],[tip-10,top-tb*k-40],[`RUNWAY BEARING PLATE / ${detailRef(detailTitles.bearing)}`]);
  const items:Item[]=[
   {at:[face+3,top-20],labels:[columnReference(p),sc.isNew?'CHECKED UNDER NEW COLUMN':'LOCAL CHECKS PER ENTERED DATA']},
   {...flangeWeld,at:[face,ft+st.tf*k]},
   {...webWeld,at:[face,(ft+bot)/2-st.d*k*.2]},
   {at:[face-st.L*k*.12,(ft+bot)/2-st.d*k*.05],labels:[stubLabel,'ASTM A992']},
   ...(sf?[{at:[center+sf.t*k/2,(ft+bot)/2+st.d*k*.15] as XY,labels:[stiffLabel,'EACH SIDE OF WEB, FITTED TO','TOP FLANGE; SEE ELEVATION']}]:[]),
   ...(seat?[{at:[X((seat.y0+seat.y1)/2-W*.6),top+ts*k/2] as XY,labels:[`${plate.label} X ${dim(seat.length)}`,`X ${dim(seat.y1-seat.y0)}, ${size(seat.y0)} CLEAR OF COL.`]}]:[]),
   ...(cs?[{at:lowerEdgeTarget(cs.g,{face,k,Y:Ys}),labels:cs.callout}]:[])
  ];
  svg+=calloutColumn(items,398,top-40,bot+(cs?60:30));
  return {svg:svg+'</g>',scale:scale.label};
 }});
 // Plan: the bearing plates and their holes on the seat (or flange) at an interior grid, the stub below hidden.
 views.push({title:rolledPlanTitle,render:()=>{
  const half=plate.length/2,scale=sheetDrawingScale(Math.min(.24,165/st.L,280/plate.length),p.units),k=scale.pointsPerMm,cx=821,face=120,tip=face+st.L*k;
  const X=(x:number)=>cx+x*k,Y=(y:number)=>face+y*k,left=X(-half),right=X(half),y0=seat?.y0??0;
  let svg='<g data-view="rolled-bracket-plan">';
  svg+=rect(cx-b.receiver.width*k/2,face-b.receiver.flangeThickness*k,b.receiver.width*k,b.receiver.flangeThickness*k,sc.isNew?'runway-line':'reference-line');
  svg+=rect(left,Y(y0),plate.length*k,(st.L-y0)*k,'runway-line');
  // The stub below the seat: flange tips (with a seat), web faces and the bearing stiffeners, hidden.
  if(seat)for(const sx of [-1,1])svg+=line([X(sx*st.bf/2),face],[X(sx*st.bf/2),tip],'hidden-line');
  else svg+=line([left,face],[right,face],'runway-line');
  for(const sx of [-1,1])svg+=line([X(sx*st.tw/2),face],[X(sx*st.tw/2),tip],'hidden-line');
  if(sf)for(const sx of [-1,1]){const x0=sx*st.tw/2,x1=sx*(st.tw/2+sf.width);svg+=line([X(x0),Y(a-sf.t/2)],[X(x1),Y(a-sf.t/2)],'hidden-line')+line([X(x0),Y(a+sf.t/2)],[X(x1),Y(a+sf.t/2)],'hidden-line')+line([X(x1),Y(a-sf.t/2)],[X(x1),Y(a+sf.t/2)],'hidden-line');}
  const L=d.bearing.length,plates=p.system==='simple'?[{end:-gap/2,dir:-1,label:'SLIDING'},{end:gap/2,dir:1,label:'LOCATING'}]:[{end:-L/2,dir:1,label:''}];
  const rowsY=eg&&eb?[a-eb.bolts.gauge/2,a+eb.bolts.gauge/2]:[],holesX:number[]=[];
  for(const v of plates){
   const x0=Math.min(v.end,v.end+v.dir*L);
   svg+=rect(X(x0),Y(a-W/2),L*k,W*k,'runway-line');
   if(eg)for(const row of eg.rows){const x=v.end+v.dir*row;holesX.push(x);for(const y of rowsY)svg+=circle(X(x),Y(y),eg.hole/2*k,'runway-line')+line([X(x)-2.5,Y(y)],[X(x)+2.5,Y(y)])+line([X(x),Y(y)-2.5],[X(x),Y(y)+2.5]);}
   // Labels too wide for a short bearing stagger, the locating end below.
   if(v.label&&eg)svg+=text(X(v.end+v.dir*L/2),tip+60+(v.dir>0&&L*k<textWidth('LOCATING END',7,true)+6?9:0),`${v.label} END`,7,'middle',700);
  }
  // Column stiffeners at the stub top flange: the column broken just beyond the flange, the plates cut.
  if(cs)svg+=stiffenerPlan(cs.g,{cx,face,k,cls:colCls,stub:10}).svg;
  svg+=line([cx,face-b.receiver.flangeThickness*k-14],[cx,tip+8],'grid-line');
  svg+=line([left-10,Y(a)],[right+10,Y(a)],'grid-line');
  svg+=dimH(left,right,face-b.receiver.flangeThickness*k,87,dim(plate.length));
  svg+=dimV(face,Y(a),left-2,left-16,dim(a))+dimV(face,tip,left-2,left-34,dim(st.L));
  if(eg&&eb){
   for(const x of [0,...holesX].sort((u,v)=>u-v))svg+=line([X(x),tip+3],[X(x),tip+12])+text(X(x)+3,tip+14,x?dim(Math.abs(x)):'0',7.5,'end',400,-90);
   svg+=text(left,tip+80,`HOLES: ORDINATES FROM THE GRID; ROWS AT ${dim(eb.bolts.gauge)} GAUGE ON THE GIRDER C/L.`,7.5);
   if(p.system==='simple')svg+=text(left,tip+90,`AT A RUNWAY-END GRID: ONE BEARING, ITS GIRDER END ON THE GRID; HOLES ${dim(eg.rows[0])} AND ${dim(eg.rows[1])} FROM IT.`,7.5);
   else svg+=text(left,tip+90,`AT A RUNWAY-END GRID THE GIRDER END IS ON THE GRID; HOLES ${dim(eg.rows[0])} AND ${dim(eg.rows[1])} FROM IT.`,7.5);
  }
  // Keys: the transverse section beyond the flange tip, the elevation from the runway side.
  const lay=eb?stubBoltLayout(p,eb):undefined,beyond=(lay?.xs.filter(x=>x>st.bf/2)??[]).sort((u,v)=>u-v)[0];
  const cut=X(beyond!==undefined?(st.bf/2+beyond)/2:Math.min(half,st.bf/2+12));
  svg+=sectionCut([cut,face-3],[cut,tip+3],[-1,0],detailTitles.weldedBracket,['a'],cs?'over':'tail');
  svg+=sectionCut([left-4,tip+6],[right+4,tip+6],[0,-1],rolledElevationTitle,['b']);
  const pl=plates[plates.length-1],items:{at:XY;labels:string[]}[]=[
   {at:[right,Y(st.L*.62)],labels:seat?[`${plate.label} X ${dim(seat.length)}`,`${st.name} BELOW (HIDDEN)`]:[`${st.name} TOP FLANGE`,'STUB WEB HIDDEN']},
   {at:[X(pl.end+pl.dir*L*.8),Y(a-W/2)],labels:[`BEARING PL ${size(tb)} X ${dim(W)} X ${dim(L)}`,`EACH GIRDER END; SEE ${detailRef(bearingBoltsTitle(p))}`]},
   ...(eg&&eb?[{at:[X(pl.end+pl.dir*eg.rows[1])+eg.hole/2*k,Y(rowsY[1])] as XY,labels:[`${plates.length*4} - ${size(eg.hole)} STD. HOLES IN ${seat?'SEAT':'FLANGE'}`,...(seat&&lay?.xs.some(x=>x<st.bf/2)?[`ALSO THROUGH THE ${st.name} FLANGE WHERE OVER IT`]:[]),`FOR ${size(eb.bolts.diameter)} ${eb.bolts.grade} BEARING BOLTS`]}]:[]),
   ...(sf?[{at:[X(st.tw/2+sf.width*.7),Y(a+sf.t/2)] as XY,labels:['BEARING STIFFENERS AT','GIRDER C/L (HIDDEN)']}]:[])
  ];
  svg+=calloutColumn(items,right+40,cs?face-20:face+4,tip+20);
  return {svg:svg+'</g>',scale:scale.label};
 }});
 // Elevation from the runway side: the stub end, seat, stiffeners and the column flange beyond.
 views.push({title:rolledElevationTitle,render:()=>{
  const wide=Math.max(plate.length,b.receiver.width),scale=sheetDrawingScale(Math.min(cs?.29:.24,190/(st.d+ts),280/wide),p.units),k=scale.pointsPerMm,cx=224,top=435;
  const X=(x:number)=>cx+x*k,ft=top+ts*k,bot=ft+st.d*k,fi=ft+st.tf*k,bi=bot-st.tf*k;
  let svg='<g data-view="rolled-bracket-face">';
  svg+=rect(cx-b.receiver.width*k/2,top-26,b.receiver.width*k,bot-top+66,sc.isNew?'runway-line':'reference-line');
  if(seat)svg+=rect(X(-seat.length/2),top,seat.length*k,ts*k,'runway-line');
  svg+=rect(X(-st.bf/2),ft,st.bf*k,st.tf*k,'runway-line')+rect(X(-st.tw/2),fi,st.tw*k,bi-fi,'runway-line')+rect(X(-st.bf/2),bi,st.bf*k,st.tf*k,'runway-line');
  if(sf)for(const sx of [-1,1]){
   const x0=sx*st.tw/2,x1=sx*(st.tw/2+sf.width),c=sx*sf.clip,pts:XY[]=[[X(x0+c),fi],[X(x1),fi],[X(x1),bi],[X(x0+c),bi],[X(x0),bi-sf.clip*k],[X(x0),fi+sf.clip*k]];
   svg+=`<path class="runway-line" d="M${pts.map(q=>q.map(v=>Number(v.toFixed(3))).join(',')).join('L')}Z"/>`;
  }
  svg+=dimH(X(-st.bf/2),X(st.bf/2),bot,bot+18,dim(st.bf));
  if(seat)svg+=dimH(X(-seat.length/2),X(seat.length/2),top,top-38,dim(seat.length));
  if(cs)svg+=stiffenerFaceHidden(cs.g,{cx,k,Y:(z:number)=>top-z*k});
  const items:Item[]=[
   ...(cs?[{at:[X(cs.g.tw/2+cs.g.width*.9),top-cs.g.levels[1].z*k-cs.g.t*k/2] as XY,labels:['COL. STIFFENERS BEYOND',`(HIDDEN); SEE ${detailRef(columnStiffenerTitle)}`]}]:[]),
   ...(sf?[{at:[X(-st.tw/2),(fi+bi)/2] as XY,labels:[stiffLabel,`${size(sf.clip)} CORNER CLIPS; FIT TO`,'TOP FLANGE, WELD TO WEB','AND BOTH FLANGES, SHOP'],weld:size(sf.weld),both:true}]:[]),
   ...(seat?[{at:[X(st.bf/2),ft] as XY,labels:['SEAT PL TO EACH FLANGE TIP,','FULL STUB LENGTH, SHOP'],weld:size(seat.weld)}]:[]),
   {at:[X(st.bf/2),bot-st.tf*k/2],labels:[stubLabel,`${size(st.tw)} WEB / ${size(st.tf)} FLANGES`]}
  ];
  svg+=calloutColumn(items,X(Math.max(st.bf,seat?.length??0,b.receiver.width)/2)+40,top-10,bot+20);
  // Below the callouts, which can run past the stub at small scales.
  const stack=top-10+items.reduce((h,v)=>h+(v.weld||v.groove?17:0)+v.labels.length*11+8,0);
  svg+=text(X(-wide/2),cs?Math.max(bot+60,stack+12):bot+60,'CUT THE STUB SQUARE; KEEP THE ROLLED FILLETS. STIFFENERS UNDER THE GIRDER WEB LINE ONLY.',7.5);
  return {svg:svg+'</g>',scale:scale.label};
 }});
 const tie=flangeTieGeometry(p),ties=tie?`${tie.sides.length===1&&tie.sides[0]>0?'THE TOP FLANGE TIES':'THE FLANGE TIES'} (${detailRef(detailTitles.flangeTie)})`:'THE FLANGE TIES';
 const notes=[
  `A ROLLED ${st.name} STUB ${dim(st.L)} LONG, ASTM A992 (${format(r.Fy,'stress',p.units,p.units==='SI'?0:3)} MIN. YIELD), ${where} WELDED TO THE COLUMN FLANGE: ${g.cjp?'CJP GROOVE WELDS AT BOTH FLANGES':`${size(r.flangeWeld)} FILLETS ON BOTH FACES OF BOTH FLANGES`} AND ${size(r.webWeld)} FILLETS BOTH SIDES OF THE WEB.${seat?` THE BEARINGS LAND ON A ${size(seat.t)} SPREADER SEAT PL SHOP WELDED ALONG BOTH FLANGE TIPS WITH ${size(seat.weld)} FILLETS.`:' THE BEARINGS LAND DIRECTLY ON ITS TOP FLANGE.'}`,
  ...(sf?[`BEARING STIFFENERS: A PAIR OF ${size(sf.t)} PLATES UNDER THE GIRDER WEB LINE, ${size(sf.width)} OUTSTAND, ${size(sf.clip)} CORNER CLIPS, FITTED TO BEAR ON THE TOP FLANGE AND SHOP WELDED TO THE WEB AND BOTH FLANGES WITH ${size(sf.weld)} FILLETS BOTH SIDES.`]:[]),
  `PLATES: ${format(d.material.Fy,'stress',p.units,p.units==='SI'?0:3)} MIN. YIELD. WELDS: ${electrodeClass(d.material.Fexx,p.units)} ELECTRODE${g.cjp?', MATCHING FILLER FOR THE CJP WELDS: BACKGOUGE OR BACKING REMOVED, UT PER S-00':''}. CONTINUOUS WELDS AS SHOWN; NO INTERMITTENT WELDS.`,
  sc.isNew?`SHOP WELD THE STUB TO THE ${sc.name} BEFORE ERECTION; INSPECT STARTS, STOPS AND TOES.`:`FIELD WELD THE STUB TO THE EXISTING COLUMN AS FLAGGED, WITH ITS STIFFENERS${seat?' AND SEAT':''} SHOP WELDED. ${preheatBasis(p)?preheatBasis(p)!.text.toUpperCase():'PREHEAT PER AWS D1.1:2020 TABLE 5.8 FOR THE THICKEST PART AT THE WELD'}; INSPECT STARTS, STOPS AND TOES.`,
  `KEEP GIRDER ENDS AND BEARINGS INDEPENDENT. DO NOT WELD THE SLIDING BEARING TO THE GIRDER. ${eb?`THE BEARING BOLTS LOCATE, GUIDE AND HOLD DOWN THE GIRDER ON THE ${seat?'SEAT':'STUB FLANGE'} (${detailRef(bearingBoltsTitle(p))}); DRILL TO MATCH (${detailRef(rolledPlanTitle)}). `:''}ONLY ${ties} CONNECT TO THE COLUMN SEPARATELY; H TOP DOES NOT ENTER THE BRACKET.`,
  sc.isNew?`THE ${sc.name} IS DESIGNED FOR AXIAL FORCE AND BENDING UNDER ASCE 7 COMBINATIONS IN THE CALCULATION REPORT${p.columnBase?.enabled?`; BASE PLATE, ANCHOR RODS AND FOOTING: ${detailRef(detailTitles.newColumn)}`:'; ITS BASE AND FOUNDATION ARE BY OTHERS'}.`:p.existingColumn?.enabled?'VERIFY EXISTING COLUMN DIMENSIONS, STEEL GRADE AND WELDABILITY BEFORE FABRICATION. THE EXISTING COLUMN IS CHECKED FOR AXIAL FORCE AND BENDING UNDER ASCE 7 COMBINATIONS IN THE CALCULATION REPORT; FRAME, ANCHORS AND FOUNDATIONS ARE BY OTHERS.':'VERIFY EXISTING COLUMN DIMENSIONS, STEEL GRADE AND WELDABILITY BEFORE FABRICATION. LOCAL COLUMN CHECKS DO NOT VERIFY THE COMPLETE FRAME, COLUMN AXIAL/BENDING INTERACTION OR FOUNDATIONS.',
  `THE BRACKET IS DESIGNED FOR EVERY CONCURRENT CASE OF THE BRACKET DESIGN FORCES BELOW, WITH ITS SELF-WEIGHT: STUB FLEXURE, SHEAR AND TORSION FROM THE OFFSET BEARINGS, WEB YIELDING AND CRIPPLING UNDER THE BEARING${sf?' AND THE STIFFENERS':''}, THE STUB-TO-COLUMN WELDS WITH THE LONGITUDINAL FORCE AND H BOTTOM, THE COLUMN FLANGE AND WEB LOCAL EFFECTS, DEFLECTION AND FATIGUE${collector?'; WITH THE BRACING, ALSO THE COLLECTOR FORCE THROUGH THE STUB WELDS':''}.`
 ];
 const stiffView=columnStiffenerView(s);if(stiffView)views.push(stiffView);
 return {key:'bracket',name:'BRACKETS',views,notes:(t:Style)=>[heading(t,'BRACKET FABRICATION & DESIGN NOTES'),...numbered(t,[...notes,...stiffenerNotes(p)]),...bracketForceBlocks(s,t)]};
}
/**
 * The rolled stub under a bearing section along the runway: its top flange under the seat (or the flange as the
 * seat) and its web, and the drop of a nut below the seat for a bolt through the seat and the flange.
 */
export function rolledUnderSeat(p:CalculationSnapshot['input']){
 if(!usesRolledBracket(p))return undefined;
 const st=projectStub(p),seat=!!st.seat;
 return {...st,hasSeat:seat,drop:(x:number)=>seat&&Math.abs(x)<st.bf/2?st.tf:0,
  label:seat?undefined:[`${st.name} BRACKET TOP FLANGE`,`SEE ${detailRef(detailTitles.weldedBracket)}`],
  /** Flange (under a seat) and web stub between x0 and x1 at the seat underside y, drawn depth below it. */
  draw:(X:(x:number)=>number,y:number,kk:number,x0:number,x1:number,depth:number)=>{
   let svg='';const a=Math.max(x0,-st.bf/2),b=Math.min(x1,st.bf/2),t=seat?st.tf*kk:0;
   if(seat&&b>a)svg+=rect(X(a),y,(b-a)*kk,t,'runway-line');
   if(st.tw/2>x0&&-st.tw/2<x1)svg+=rect(X(-st.tw/2),y+t,st.tw*kk,depth*kk-t,'runway-line');
   return svg;}};
}

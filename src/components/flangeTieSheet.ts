import {supportColumn} from '../engine/drawingData';
import type {CalculationSnapshot} from '../engine/types';
import {flangeTieGeometry,tieRelease} from '../engine/tieGeometry';
import {activeEndBearing} from '../engine/endBearingInputs';
import {activeEndStop} from '../engine/endStopInputs';
import {boltProperties} from '../engine/connectionStrength';
import {drawingLength,plateInches} from './drawingFormat';
import {sheetDrawingScale as drawingScale,line,rect,circle,text,dimH,dimV,filletLeader,fieldFilletLeader,detailRef,detailTitles,columnReference,labelColumn,breakLine,textWidth,n,sectionCut,type XY} from './sheetGraphics';
import {heading,numbered,paragraph,type Style} from './noteBlocks';
import {topicSheetSvg,type DetailTopic,type ViewRender} from './detailSheet';
/** Rounded slot outline along y (vertical on the sheet). */
function verticalSlot(cx:number,cy:number,length:number,width:number,cls:string){const r=width/2,a=cy-length/2+r,b=cy+length/2-r;return `<path class="${cls}" d="M${n(cx-r)},${n(a)}A${n(r)},${n(r)} 0 0 1 ${n(cx+r)},${n(a)}L${n(cx+r)},${n(b)}A${n(r)},${n(r)} 0 0 1 ${n(cx-r)},${n(b)}Z"/>`;}
/** Transverse elevation of the top-flange tie, projected along the installed bolt axes. */
export function flangeTieSection(s:CalculationSnapshot,x:number,y:number,saddleCut=false):ViewRender{
 const p=s.input,g=flangeTieGeometry(p)!;const b=p.section,t=p.details!.brace,a=g.attachment,c=t.connection,rel=tieRelease(p);
 // x is the left edge of the view: fit the girder half-width and the tie span ahead of a 215-unit label column.
 const scale=drawingScale(Math.min(.38,(605-215-24-x)/(g.face+b.bf/2+40)),p.units),k=scale.pointsPerMm,xc=x+b.bf/2*k,X=(z:number)=>xc+z*k,Y=(v:number)=>y+v*k;
 const drop=g.topDrop,dim=(v:number)=>drawingLength(v,p.units),sz=(v:number)=>plateInches(v,p.units),hole=boltProperties(c.grade,c.diameter).hole;
 let svg=`<g data-view="flange-saddle-section">`;
 svg+=rect(X(-b.bf/2),Y(-b.tf),b.bf*k,b.tf*k,'runway-line');
 svg+=rect(X(-b.tw/2),Y(0),b.tw*k,(drop+t.width/2+25.4)*k,'runway-line');
 if(b.kind==='cap'){
  svg+=rect(X(-b.capWidth/2),Y(-b.tf-b.capTw),b.capWidth*k,b.capTw*k,'runway-line');
  for(const side of [-1,1])svg+=rect(X(side*b.capWidth/2-(side>0?b.capTf:0)),Y(-b.tf),b.capTf*k,(b.capDepth-b.capTw)*k,'runway-line');
 }
 svg+=rect(X(g.rootStart),Y(0),g.rootLength*k,a.saddleThickness*k,'runway-line');
 svg+=rect(X(g.rootStart),Y(a.saddleThickness),(g.gussetEnd-g.rootStart)*k,(drop+t.width/2-a.saddleThickness)*k,'runway-line');
 svg+=rect(X(g.start),Y(drop-t.width/2),t.length*k,t.width*k,'runway-line');
 // Column gusset: as tall as the bars, or taller to contain the release slots.
 const hg=g.columnGusset;
 svg+=rect(X(g.face-g.connection),Y(drop-hg/2),g.connection*k,hg*k,'runway-line');
 svg+=line([X(g.face),Y(-35)],[X(g.face),Y(drop+hg/2+40)],'reference-line');
 for(const [end,offset] of [[0,0],[1,t.length-g.connection]] as const)for(let row=0;row<c.rows;row++)for(const sign of [-1,1]){
  const cx=X(g.start+offset+c.edge+row*c.pitch),cy=Y(drop+sign*c.gauge/2);
  svg+=circle(cx,cy,hole*k/2,'runway-line');
  if(end&&rel)svg+=verticalSlot(cx,cy,rel.slot*k,rel.width*k,'hidden-line')+circle(cx,cy,rel.od*k/2,'hidden-line');
 }
 // Release filler between a bar and the girder gusset, behind the near bar, so the bars stay parallel.
 if(rel)svg+=rect(X(g.start)+1.5,Y(drop-t.width/2)+1.5,g.connection*k-3,t.width*k-3,'hidden-line');
 // Edge and pitch of the girder-end holes chained under the bars, clear of the web stub; overall length below.
 const under=Y(drop+Math.max(t.width,hg)/2),rowEnd=g.start+c.edge+(c.rows-1)*c.pitch,chain=Math.max(under+20,Y(drop+t.width/2+25.4)+16);
 svg+=dimH(X(g.start),X(g.start+c.edge),Y(drop+t.width/2),chain,sz(c.edge),'left');
 if(c.rows>1)svg+=dimH(X(g.start+c.edge),X(rowEnd),Y(drop+t.width/2),chain,c.rows>2?`${c.rows-1} @ ${sz(c.pitch)}`:sz(c.pitch),'right');
 svg+=dimH(X(g.start),X(g.face),under,chain+22,dim(t.length));
 // Vertical bolt pitch in the free length of the bars, beyond the chained pitch text; the value reads
 // across the bar beside its dimension line, which is too short to hold it.
 {const w=textWidth(sz(c.gauge),9),gx=Math.max(X(g.gussetEnd)+12,(X(g.gussetEnd)+X(g.face-g.connection)-w)/2-2),ya=Y(drop-c.gauge/2),yb=Y(drop+c.gauge/2),fx=X(rowEnd)+hole*k/2+2;
  svg+=line([fx,ya],[gx+5,ya])+line([fx,yb],[gx+5,yb])+line([gx,ya],[gx,yb])+[ya,yb].map(v=>line([gx-3,v+2.5],[gx+3,v-2.5])).join('')+text(gx+4,(ya+yb)/2+3,sz(c.gauge),9);}
 // The column gusset height (weld length) and the bar width are stated in their callouts, clear of the
 // callout leaders that cross the column face.
 const nx=Math.max(X(g.face)+44,605-215),top=y-44,bottom=Math.max(y+170,chain+40),girderGusset=drop+t.width/2-a.saddleThickness;
 const items:{at:XY;labels:string[];weld?:string;field?:boolean}[]=[
  {at:[X(g.rootStart+g.rootLength*.4),Y(a.saddleThickness/2)],labels:[`SADDLE PL ${sz(a.saddleThickness)}`,`${dim(a.saddleLength)} LONG X ${dim(g.rootLength)} W`]},
  {at:[X(g.rootStart+g.rootLength*.5),Y(a.saddleThickness)],labels:['GUSSET / SADDLE AND','SADDLE / FLANGE: BOTH SIDES'],weld:sz(a.weldSize)},
  {at:[X(g.start+t.length/2),Y(drop-t.width/2)],labels:[`2 FL ${sz(t.thickness)} X ${sz(t.width)}; GIRDER END: ${2*c.rows} - ${sz(c.diameter)}`,`${c.grade} SC, ${sz(hole)} STD HOLES; GIRDER GUSSET`,`PL ${sz(t.gussetThickness)} X ${sz(girderGusset)} X ${sz(g.gussetEnd-g.rootStart)}${rel?`; ${sz(rel.clearance)} FILLER (HIDDEN)`:''}`]},
  {at:[X(g.face),Y(drop+hg/2-3)],labels:[`${supportColumn(p).isNew?'SHOP WELD NEW ':g.receiver?'EXISTING ':''}COLUMN GUSSET ROOT, BOTH SIDES`,`X ${dim(hg)}; ${detailRef(detailTitles.tiePlan)}`],weld:sz(c.weldSize),field:!supportColumn(p).isNew},
  {at:[X(g.face-g.connection*.5),Y(drop+hg/2)],labels:[...(rel?[`COLUMN END: ${2*c.rows} - ${sz(c.diameter)} ${c.grade} PRETENSIONED`,`AGAINST STEEL SLEEVES ${sz(rel.od)} OD X ${sz(rel.sleeveLength)};`,`${sz(rel.width)} X ${sz(rel.slot)} VERT. SLOTS IN GUSSET`]:[`COLUMN END: ${2*c.rows} - ${sz(c.diameter)} ${c.grade} SC,`,`${sz(hole)} STD HOLES`]),`COLUMN GUSSET PL ${sz(t.gussetThickness)} X ${sz(hg)} X ${sz(g.connection)}`]}
 ];
 svg+=labelColumn(items,nx,top,bottom);
 // Longitudinal section through the saddle, looking from the column.
 if(saddleCut){const xs=X(g.rootStart+g.rootLength/2);svg+=sectionCut([xs,Y(-b.tf-(b.kind==='cap'?b.capTw:0))-4],[xs,Y(drop+t.width/2)+4],[-1,0],detailTitles.saddle,['a']);}
 svg+=text(x,bottom+17,rel?`SLOTS GIVE ${sz(rel.travel)} VERTICAL TRAVEL EACH WAY; DO NOT CLAMP THE COLUMN GUSSET`:'COLUMN END BOLTS PRETENSIONED IN STANDARD HOLES',8);
 svg+=text(x,bottom+33,b.kind==='cap'?`TOP BAR CLEAR OF CAP BY ${sz(a.clearance)} MIN. / NO CAP HOLES OR CUTS AT THE TIE`:`TOP BAR CLEAR OF SADDLE BY ${sz(a.clearance)} MIN. / NO FLANGE HOLES OR CUTS AT THE TIE`,8);
 return {svg:svg+'</g>',scale:scale.label};
}
/** Direct flange tie details on their own sheet. */
export function flangeTieSheetSvg(s:CalculationSnapshot,number='S-06'){
 const topic=flangeTieTopic(s);return topic?topicSheetSvg(s,topic,number,'DIRECT FLANGE TIES'):'';
}
/** Direct flange tie section, tie plan at a support, saddle section, and the tie notes. */
export function flangeTieTopic(s:CalculationSnapshot):DetailTopic|undefined{
 const p=s.input,g=flangeTieGeometry(p);if(!g)return undefined;const d=p.details!,b=p.section,a=g.attachment,t=d.brace,sz=(v:number)=>plateInches(v,p.units),dim=(v:number)=>drawingLength(v,p.units);
 const plan=():ViewRender=>{
 const scale=drawingScale(.30,p.units),k=scale.pointsPerMm,cx=890,cy=150;
 const pair=g.stations.filter(v=>v.station===p.spans[0]),grid=p.spans[0];
 let svg='<g data-view="flange-tie-plan">';
 // Parts under the top flange are hidden; a plate running out past the flange tip is solid beyond it.
 const Z=(z:number)=>cy+z*k,plate=(x:number,w:number,z0:number,z1:number)=>(z0<b.bf/2?rect(x,Z(z0),w,Z(Math.min(z1,b.bf/2))-Z(z0),'hidden-line'):'')+(z1>b.bf/2?rect(x,Z(Math.max(z0,b.bf/2)),w,Z(z1)-Z(Math.max(z0,b.bf/2)),'runway-line'):'');
 // Extension lines start a gap clear of the part they locate.
 const located=(x1:number,from1:number,x2:number,from2:number,y:number,label:string,outside:'left'|'right')=>line([x1,from1-2],[x1,y+5])+line([x2,from2-2],[x2,y+5])+dimH(x1,x2,y+5,y,label,outside);
 const flange=Z(-b.bf/2),tier=flange-14,stiffTop=Z(-b.tw/2-d.bearing.stiffenerWidth);
 for(const e of pair){const tx=cx+(e.tieX-grid)*k,sx=cx+(e.center-grid)*k,end=cx+((e.end==='left'?e.start:e.finish)-grid)*k,far=cx+((e.end==='left'?e.finish:e.start)-grid)*k,out=e.end==='left'?'right':'left';
  // Girder end at the gap, broken away from it.
  svg+=line([end,flange],[far,flange],'runway-line')+line([end,Z(b.bf/2)],[far,Z(b.bf/2)],'runway-line')+line([end,flange],[end,Z(b.bf/2)],'runway-line')+breakLine([far,flange-4],[far,Z(b.bf/2)+4]);
  for(const side of [-1,1])svg+=rect(sx-d.bearing.stiffenerThickness*k/2,side<0?stiffTop:Z(b.tw/2),d.bearing.stiffenerThickness*k,d.bearing.stiffenerWidth*k,'hidden-line');
  svg+=rect(tx-a.saddleLength*k/2,Z(g.rootStart),a.saddleLength*k,g.rootLength*k,'hidden-line');
  for(const sign of [-1,1])svg+=plate(tx+(sign*(t.gussetThickness+t.thickness)/2-t.thickness/2)*k,t.thickness*k,g.start,g.face);
  svg+=plate(tx-t.gussetThickness*k/2,t.gussetThickness*k,g.rootStart,g.gussetEnd);
  svg+=rect(tx-t.gussetThickness*k/2,Z(g.face-g.connection),t.gussetThickness*k,g.connection*k,'runway-line');
  // Tie from the stiffener, and the stiffener from the girder end, each from the parts themselves.
  svg+=located(sx,stiffTop,tx,Z(g.rootStart),tier,dim(a.longitudinalSetback),out);
  svg+=located(sx,stiffTop,end,flange,tier-16,dim(Math.abs(e.center-(e.end==='left'?e.start:e.finish))),out);
 }
 const rw=g.receiver?.width??14*25.4,rt=g.receiver?.flangeThickness??25.4;
 svg+=rect(cx-rw*k/2,cy+g.face*k,rw*k,rt*k,supportColumn(p).isNew?'runway-line':'reference-line');
 const rootX=cx+((pair.at(-1)?.tieX??grid)-grid)*k;
 const sc=supportColumn(p);svg+=(sc.field?fieldFilletLeader:filletLeader)([[rootX,cy+g.face*k]],[1027,285],sz(t.connection.weldSize),[sc.isNew?`SHOP WELD TO ${sc.name}`:g.receiver?'FIELD WELD TO EXISTING COLUMN':'FIELD WELD TO COLUMN',`BOTH SIDES X ${dim(g.columnGusset)} / EACH GUSSET`],true);
 // The grid line stops above the column note, which sits below the column flange.
 const noteY=cy+(g.face+rt)*k+14;
 // Transverse section along the tie of the right girder, looking along the runway, cut below the column
 // beside the column note.
 const tx=cx+((pair.at(-1)?.tieX??grid)-grid)*k;svg+=sectionCut([tx,tier],[tx,noteY-10],[1,0],detailTitles.flangeTie,['b'],'tip');
 svg+=line([cx,116],[cx,noteY-10],'grid-line');
 svg+=text(tx-8,noteY,sc.isNew?`${columnReference(p)} / SEPARATE TIES EACH GIRDER`:g.receiver?'EXISTING COLUMN / SEPARATE TIES EACH GIRDER':'COLUMN BY OTHERS (REF.) / SEPARATE TIES EACH GIRDER',8,'end');
 return {svg:svg+'</g>',scale:scale.label};};
 const saddle=():ViewRender=>{
 const bs=drawingScale(1.25,p.units),bk=bs.pointsPerMm,bx=200,by=462;
 let svg='<g data-view="saddle-longitudinal-section">';
 svg+=rect(bx-a.saddleLength*bk/2-25,by-b.tf*bk,a.saddleLength*bk+50,b.tf*bk,'runway-line');
 svg+=rect(bx-a.saddleLength*bk/2,by,a.saddleLength*bk,a.saddleThickness*bk,'runway-line');
 svg+=rect(bx-t.gussetThickness*bk/2,by+a.saddleThickness*bk,t.gussetThickness*bk,90,'runway-line');
 svg+=dimH(bx-a.saddleLength*bk/2,bx+a.saddleLength*bk/2,by,Math.min(by-52,by-b.tf*bk-16),dim(a.saddleLength));
 svg+=filletLeader([[bx+a.saddleLength*bk/2,by]],[420,482],sz(a.weldSize),['SADDLE TO FLANGE','BOTH EDGES']);
 svg+=filletLeader([[bx+t.gussetThickness*bk/2,by+a.saddleThickness*bk]],[420,548],sz(a.weldSize),['GUSSET TO SADDLE','CONTINUOUS'],true);
 svg+=text(42,620,'SADDLE STOPS CLEAR OF ROLLED ROOT AND BEARING STIFFENER WELDS.',8);
 return {svg:svg+'</g>',scale:bs.label};};
 const rel=tieRelease(p),support=s.checks.find(c=>c.id==='tie-move-support'),bottom=g.sides.includes(-1);
 // Flange holes the set does detail: bearing bolts through the bottom flange, stop bolts through the top flange.
 const drilled=[...(activeEndBearing(p)?['END BEARINGS']:[]),...(activeEndStop(p)?['END STOPS']:[])];
 const notes=[`TIES: ${dim(t.length)} LONG, ${bottom?'AT BOTH FLANGES':`AT THE TOP FLANGE. THE BOTTOM FLANGE IS BOLTED TO THE SEAT (${detailRef(detailTitles.endBearing)})`}. SET BACK ${dim(a.longitudinalSetback)} FROM BEARING CENTERS TOWARD GIRDER ENDS.`,
  'GIRDER FORCE TRANSFERS THROUGH THE GUSSET AND SADDLE DIRECTLY TO THE FLANGE. DO NOT WELD THE GUSSET TO THE WEB.',
  supportColumn(p).isNew?`SHOP WELD COLUMN GUSSET TO THE ${supportColumn(p).name}: TWO ${sz(t.connection.weldSize).replaceAll('"','')} CONTINUOUS FILLETS X ${dim(g.columnGusset)}.`:`FIELD WELD COLUMN GUSSET TO ${g.receiver?'EXISTING COLUMN':'THE COLUMN'}: TWO ${sz(t.connection.weldSize).replaceAll('"','')} CONTINUOUS FILLETS X ${dim(g.columnGusset)}. VERIFY STEEL GRADE, WELDABILITY AND SURFACE CONDITION.`,
  rel?`COLUMN END: PRETENSION THE BOLTS AGAINST STEEL SLEEVES ${sz(rel.od)} OD X ${sz(rel.sleeveLength)} LONG (FY 50 KSI MIN.) PASSING THROUGH ${sz(rel.width)} X ${sz(rel.slot)} VERTICAL SLOTS IN THE COLUMN GUSSET. CENTER THE SLEEVES IN THE SLOTS AT ERECTION. THE GUSSET IS NOT CLAMPED. PROVIDE A ${sz(rel.clearance)} FILLER (CLASS B SURFACES) AT THE GIRDER GUSSET SO THE BARS STAY PARALLEL.`:'COLUMN END: STANDARD HOLES; THE BARS ALSO FLEX WITH SUPPORT DEFLECTION.',
  `TIE BARS FLEX OUT OF PLANE WITH GIRDER END ROTATION AND, AT SLIDING ENDS, THERMAL TRAVEL; SEE THE TIE MOVEMENT CHECKS.${support?.capacity!==undefined?` BRACKET BY OTHERS: VERTICAL DEFLECTION AT THE BEARING UNDER CRANE LOADS ${dim(support.capacity)} MAX.`:''}`,
  `GIRDER END: STANDARD HOLES, PRETENSIONED A325 BOLTS, CLASS B FAYING SURFACES. NO HOLES OR CUTS THROUGH THE ${b.kind==='cap'?'CAP OR ':''}W FLANGES${drilled.length?` EXCEPT THOSE DETAILED FOR THE ${drilled.join(' AND ')}`:''}.` ];
 const checks=s.checks.filter(c=>(c.group==='Flange attachment'||c.group==='Tie movement')&&c.status!=='excluded'),max=Math.max(0,...checks.map(c=>c.utilization??0));
 return {key:'flange-tie',name:'FLANGE TIES',views:[
  {title:detailTitles.flangeTie,render:()=>flangeTieSection(s,48,128,true)},
  {title:detailTitles.tiePlan,render:plan},
  {title:detailTitles.saddle,render:saddle}
 ],notes:(st:Style)=>[heading(st,'FLANGE TIE CONNECTION NOTES / LOCAL CHECKS'),...numbered(st,notes),paragraph(st,`TIE LOCAL AND MOVEMENT CHECKS: SEE CALCULATION REPORT${checks.length?` (MAX. D/C ${max.toFixed(2)})`:''}.`)]};
}

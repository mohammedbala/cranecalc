import type {CalculationSnapshot} from '../engine/types';
import {flangeTieGeometry,tieRelease} from '../engine/tieGeometry';
import {boltProperties} from '../engine/connectionStrength';
import {drawingLength,plateInches} from './drawingFormat';
import {sheetStart,titleBlock,sheetDrawingScale as drawingScale,line,rect,circle,text,dimH,dimV,filletLeader,fieldFilletLeader,viewTitle,wrappedText,detailRef,labelColumn,n,type XY} from './sheetGraphics';
import {noteStack,numbered,paragraph,type Style} from './noteBlocks';
/** Rounded slot outline along y (vertical on the sheet). */
function verticalSlot(cx:number,cy:number,length:number,width:number,cls:string){const r=width/2,a=cy-length/2+r,b=cy+length/2-r;return `<path class="${cls}" d="M${n(cx-r)},${n(a)}A${n(r)},${n(r)} 0 0 1 ${n(cx+r)},${n(a)}L${n(cx+r)},${n(b)}A${n(r)},${n(r)} 0 0 1 ${n(cx-r)},${n(b)}Z"/>`;}
/** Transverse elevation of the top-flange tie, projected along the installed bolt axes. */
export function flangeTieSection(s:CalculationSnapshot,x:number,y:number,compact=false){
 const p=s.input,g=flangeTieGeometry(p)!;if(!g)return '';const b=p.section,t=p.details!.brace,a=g.attachment,c=t.connection,rel=tieRelease(p);
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
 // Edge and pitch chained under the bars at the girder end; overall length below them.
 const under=Y(drop+Math.max(t.width,hg)/2);
 // Edge and pitch of the girder-end holes as one string under the bars.
 svg+=dimH(X(g.start),X(g.start+c.edge+c.pitch),Y(drop+t.width/2),under+16,`${sz(c.edge)} + ${sz(c.pitch)}`)+line([X(g.start+c.edge),Y(drop+t.width/2)],[X(g.start+c.edge),under+21])+line([X(g.start+c.edge)-2.5,under+19],[X(g.start+c.edge)+2.5,under+13]);
 svg+=dimH(X(g.start),X(g.face),under,under+42,dim(t.length));
 // The column gusset (weld length) is dimensioned beyond the column face, clear of the bars; the bar
 // width is in the bar callout.
 svg+=dimV(Y(drop-hg/2),Y(drop+hg/2),X(g.face),X(g.face)+16,dim(hg));
 const nx=Math.max(X(g.face)+44,605-215),top=y-44,bottom=y+158;
 const items:{at:XY;labels:string[];weld?:string;field?:boolean}[]=[
  {at:[X(g.rootStart+g.rootLength*.4),Y(a.saddleThickness/2)],labels:[`SADDLE PL ${sz(a.saddleThickness)}`,`${dim(a.saddleLength)} LONG X ${dim(g.rootLength)} W`]},
  {at:[X(g.rootStart+g.rootLength*.5),Y(a.saddleThickness)],labels:['GUSSET / SADDLE AND','SADDLE / FLANGE: BOTH SIDES'],weld:sz(a.weldSize)},
  {at:[X(g.start+t.length/2),Y(drop-t.width/2)],labels:[`2 FL ${sz(t.thickness)} X ${sz(t.width)}`,`GIRDER END: ${2*c.rows} - ${sz(c.diameter)} ${c.grade} SC,`,`${sz(hole)} STD HOLES; PL ${sz(t.gussetThickness)} GUSSETS`]},
  {at:[X(g.face),Y(drop+hg/2-3)],labels:[`${g.receiver?'EXISTING ':''}COLUMN GUSSET ROOT, BOTH SIDES`,`X ${dim(hg)}; ${detailRef('TIE AND STIFFENER LOCATIONS / PLAN')}`],weld:sz(c.weldSize),field:true},
  {at:[X(g.face-g.connection*.5),Y(drop+hg/2)],labels:rel?[`COLUMN END: ${2*c.rows} - ${sz(c.diameter)} ${c.grade} PRETENSIONED`,`AGAINST STEEL SLEEVES ${sz(rel.od)} OD X ${sz(rel.sleeveLength)};`,`${sz(rel.width)} X ${sz(rel.slot)} VERT. SLOTS IN GUSSET`]:[`COLUMN END: ${2*c.rows} - ${sz(c.diameter)} ${c.grade} SC,`,`${sz(hole)} STD HOLES`]}
 ];
 svg+=labelColumn(items,nx,top,bottom);
 svg+=text(x,y+175,rel?`SLOTS GIVE ${sz(rel.travel)} VERTICAL TRAVEL EACH WAY; DO NOT CLAMP THE COLUMN GUSSET`:'COLUMN END BOLTS PRETENSIONED IN STANDARD HOLES',8);
 svg+=text(x,y+191,b.kind==='cap'?`TOP BAR CLEAR OF CAP BY ${sz(a.clearance)} MIN. / NO CAP HOLES OR CUTS`:`TOP BAR CLEAR OF SADDLE BY ${sz(a.clearance)} MIN. / NO FLANGE HOLES OR CUTS`,8);
 svg+=viewTitle(compact?318:318,y+215,'DIRECT FLANGE TIE / TOP TRANSVERSE SECTION',scale.label)+'</g>';
 return svg;
}
export function flangeTieSheetSvg(s:CalculationSnapshot){
 const p=s.input,g=flangeTieGeometry(p);if(!g)return '';const d=p.details!,b=p.section,a=g.attachment,t=d.brace,sz=(v:number)=>plateInches(v,p.units),dim=(v:number)=>drawingLength(v,p.units);
 let svg=sheetStart(s,'S-06','CRANE RUNWAY / DIRECT FLANGE TIE ATTACHMENTS');
 svg+=line([612,76],[612,680],'divider')+line([24,379],[1200,379],'divider');
 svg+=flangeTieSection(s,48,128);
 const scale=drawingScale(.30,p.units),k=scale.pointsPerMm,cx=890,cy=150;
 const pair=g.stations.filter(v=>v.station===p.spans[0]),grid=p.spans[0];
 svg+='<g data-view="flange-tie-plan">';
 svg+=line([cx,90],[cx,335],'grid-line');
 for(const e of pair){const tx=cx+(e.tieX-grid)*k,sx=cx+(e.center-grid)*k;
  svg+=rect(sx-d.bearing.length*k/2,cy-b.bf*k/2,d.bearing.length*k,b.bf*k,'runway-line');
  svg+=rect(sx-d.bearing.stiffenerThickness*k/2,cy+b.tw*k/2,d.bearing.stiffenerThickness*k,d.bearing.stiffenerWidth*k,'runway-line');
  svg+=rect(tx-a.saddleLength*k/2,cy+g.rootStart*k,a.saddleLength*k,g.rootLength*k,'runway-line');
  for(const sign of [-1,1])svg+=rect(tx+(sign*(t.gussetThickness+t.thickness)/2-t.thickness/2)*k,cy+g.start*k,t.thickness*k,t.length*k,'runway-line');
  svg+=rect(tx-t.gussetThickness*k/2,cy+g.rootStart*k,t.gussetThickness*k,(g.gussetEnd-g.rootStart)*k,'runway-line');
  svg+=rect(tx-t.gussetThickness*k/2,cy+(g.face-g.connection)*k,t.gussetThickness*k,g.connection*k,'runway-line');
  svg+=dimH(Math.min(tx,sx),Math.max(tx,sx),cy-b.bf*k/2,105,dim(a.longitudinalSetback));
 }
 const rw=g.receiver?.width??14*25.4,rt=g.receiver?.flangeThickness??25.4;
 svg+=rect(cx-rw*k/2,cy+g.face*k,rw*k,rt*k,'reference-line');
 const rootX=cx+((pair.at(-1)?.tieX??grid)-grid)*k;
 svg+=fieldFilletLeader([[rootX,cy+g.face*k]],[1027,285],sz(t.connection.weldSize),[g.receiver?'FIELD WELD TO EXISTING COLUMN':'FIELD WELD TO COLUMN',`BOTH SIDES X ${dim(g.columnGusset)} / EACH GUSSET`],true);
 svg+=text(cx-20,325,g.receiver?'EXISTING COLUMN / SEPARATE TIES EACH GIRDER':'COLUMN BY OTHERS (REF.) / SEPARATE TIES EACH GIRDER',8,'middle');
 svg+=viewTitle(906,351,'TIE AND STIFFENER LOCATIONS / PLAN',scale.label)+'</g>';
 const bs=drawingScale(1.25,p.units),bk=bs.pointsPerMm,bx=200,by=462;
 svg+='<g data-view="saddle-longitudinal-section">';
 svg+=rect(bx-a.saddleLength*bk/2-25,by-b.tf*bk,a.saddleLength*bk+50,b.tf*bk,'runway-line');
 svg+=rect(bx-a.saddleLength*bk/2,by,a.saddleLength*bk,a.saddleThickness*bk,'runway-line');
 svg+=rect(bx-t.gussetThickness*bk/2,by+a.saddleThickness*bk,t.gussetThickness*bk,90,'runway-line');
 svg+=dimH(bx-a.saddleLength*bk/2,bx+a.saddleLength*bk/2,by,by-52,dim(a.saddleLength));
 svg+=filletLeader([[bx+a.saddleLength*bk/2,by]],[420,465],sz(a.weldSize),['SADDLE TO FLANGE','TWO CONTINUOUS LINES']);
 svg+=filletLeader([[bx+t.gussetThickness*bk/2,by+a.saddleThickness*bk]],[420,548],sz(a.weldSize),['GUSSET TO SADDLE','TWO CONTINUOUS LINES']);
 svg+=text(42,620,'SADDLE STOPS CLEAR OF ROLLED ROOT AND BEARING STIFFENER WELDS.',8);
 svg+=viewTitle(318,653,'SADDLE / LONGITUDINAL SECTION',bs.label)+'</g>';
 svg+=text(637,402,'CONNECTION NOTES / LOCAL CHECKS',11,'start',700);
 const rel=tieRelease(p),support=s.checks.find(c=>c.id==='tie-move-support'),bottom=g.sides.includes(-1);
 const notes=[`TIES: ${dim(t.length)} LONG, ${bottom?'AT BOTH FLANGES':`AT THE TOP FLANGE. THE BOTTOM FLANGE IS BOLTED TO THE SEAT (${detailRef('GIRDER END BEARINGS / LOCATING AND SLIDING')})`}. SET BACK ${dim(a.longitudinalSetback)} FROM BEARING CENTERS TOWARD GIRDER ENDS.`,
  'GIRDER FORCE TRANSFERS THROUGH THE GUSSET AND SADDLE DIRECTLY TO THE FLANGE. DO NOT WELD THE GUSSET TO THE WEB.',
  `FIELD WELD COLUMN GUSSET TO ${g.receiver?'EXISTING COLUMN':'THE COLUMN'}: TWO ${sz(t.connection.weldSize).replaceAll('"','')} CONTINUOUS FILLETS X ${dim(g.columnGusset)}. VERIFY STEEL GRADE, WELDABILITY AND SURFACE CONDITION.`,
  rel?`COLUMN END: PRETENSION THE BOLTS AGAINST STEEL SLEEVES ${sz(rel.od)} OD X ${sz(rel.sleeveLength)} LONG (FY 50 KSI MIN.) PASSING THROUGH ${sz(rel.width)} X ${sz(rel.slot)} VERTICAL SLOTS IN THE COLUMN GUSSET. CENTER THE SLEEVES IN THE SLOTS AT ERECTION. THE GUSSET IS NOT CLAMPED. PROVIDE A ${sz(rel.clearance)} FILLER (CLASS B SURFACES) AT THE GIRDER GUSSET SO THE BARS STAY PARALLEL.`:'COLUMN END: STANDARD HOLES; THE BARS ALSO FLEX WITH SUPPORT DEFLECTION.',
  `TIE BARS FLEX OUT OF PLANE WITH GIRDER END ROTATION AND, AT SLIDING ENDS, THERMAL TRAVEL; SEE THE TIE MOVEMENT CHECKS.${support?.capacity!==undefined?` BRACKET BY OTHERS: VERTICAL DEFLECTION AT THE BEARING UNDER CRANE LOADS ${dim(support.capacity)} MAX.`:''}`,
  `GIRDER END: STANDARD HOLES, PRETENSIONED A325 BOLTS, CLASS B FAYING SURFACES. NO HOLES OR CUTS THROUGH THE ${b.kind==='cap'?'CAP OR ':''}W FLANGES.` ];
 const checks=s.checks.filter(c=>(c.group==='Flange attachment'||c.group==='Tie movement')&&c.status!=='excluded'),max=Math.max(0,...checks.map(c=>c.utilization??0));
 svg+='<g data-view="flange-tie-notes">'+noteStack([(st:Style)=>[...numbered(st,notes),paragraph(st,checks.length?`LOCAL AND MOVEMENT CHECKS: ${checks.filter(c=>c.status==='pass').length} / ${checks.length} PASS; MAX D/C ${max.toFixed(3)}.`:'LOCAL CHECKS: PENDING.')]],p.units,{x:637,y:416,width:550,height:250})+'</g>';
 return svg+titleBlock(s,'S-06','DIRECT FLANGE TIES')+'</svg>';
}

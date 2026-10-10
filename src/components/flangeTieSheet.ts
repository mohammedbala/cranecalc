import type {CalculationSnapshot} from '../engine/types';
import {flangeTieGeometry} from '../engine/tieGeometry';
import {boltProperties} from '../engine/connectionStrength';
import {drawingLength,plateInches} from './drawingFormat';
import {sheetStart,titleBlock,sheetDrawingScale as drawingScale,line,rect,circle,text,dimH,dimV,multiLeader,filletLeader,fieldFilletLeader,viewTitle,wrappedText,detailRef} from './sheetGraphics';
/** Transverse elevation, projected along the installed bolt axes. */
export function flangeTieSection(s:CalculationSnapshot,x:number,y:number,compact=false){
 const p=s.input,g=flangeTieGeometry(p)!;if(!g)return '';const b=p.section,t=p.details!.brace,a=g.attachment,c=t.connection;
 const scale=drawingScale(compact?.28:.38,p.units),k=scale.pointsPerMm,X=(z:number)=>x+z*k,Y=(v:number)=>y+v*k;
 const drop=g.topDrop,dim=(v:number)=>drawingLength(v,p.units),sz=(v:number)=>plateInches(v,p.units);
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
 svg+=rect(X(g.face-g.connection),Y(drop-t.width/2),g.connection*k,t.width*k,'runway-line');
 svg+=line([X(g.face),Y(-35)],[X(g.face),Y(drop+t.width/2+40)],'reference-line');
 for(const offset of [0,t.length-g.connection])for(let row=0;row<c.rows;row++)for(const sign of [-1,1])svg+=circle(X(g.start+offset+c.edge+row*c.pitch),Y(drop+sign*c.gauge/2),boltProperties(c.grade,c.diameter).hole*k/2,'runway-line');
 svg+=dimH(X(g.start),X(g.face),Y(drop+t.width/2),Y(drop+t.width/2)+25,dim(t.length));
 svg+=dimV(Y(drop-t.width/2),Y(drop+t.width/2),X(g.face),X(g.face)+25,dim(t.width));
 svg+=dimH(X(g.start),X(g.start+c.edge),Y(drop-t.width/2),Y(drop-t.width/2)-35,sz(c.edge));
 svg+=dimH(X(g.start+c.edge),X(g.start+c.edge+c.pitch),Y(drop-t.width/2),Y(drop-t.width/2)-18,sz(c.pitch));
 const nx=compact?x+190:x+245;
 svg+=multiLeader([[X(g.rootStart+g.rootLength*.4),Y(a.saddleThickness/2)]],[nx,y-35],[`SADDLE PL ${sz(a.saddleThickness)}`,`${dim(a.saddleLength)} LONG X ${dim(g.rootLength)} W`],8);
 svg+=filletLeader([[X(g.rootStart+g.rootLength*.5),Y(a.saddleThickness)]],[nx,y+28],sz(a.weldSize),['GUSSET / SADDLE AND','SADDLE / FLANGE: BOTH SIDES'],true);
 svg+=multiLeader([[X(g.start+t.length*.5),Y(drop+t.width/2)]],[nx,y+88],[`2 FL ${sz(t.thickness)} X ${sz(t.width)}`,`PL ${sz(t.gussetThickness)} CENTRAL GUSSETS`,`COLUMN ROOT FIELD WELDS: ${detailRef('TIE AND STIFFENER LOCATIONS / PLAN')}`],8);
 svg+=text(x-30,y+175,`4 - ${sz(c.diameter)} ${c.grade} EACH END / ${sz(boltProperties(c.grade,c.diameter).hole)} HOLES`,8);
 svg+=text(x-30,y+191,`TOP BAR CLEAR OF CAP BY ${sz(a.clearance)} MIN. / NO CAP HOLES OR CUTS`,8);
 svg+=viewTitle(compact?318:318,y+215,'DIRECT FLANGE TIE / TOP TRANSVERSE SECTION',scale.label)+'</g>';
 return svg;
}
export function flangeTieSheetSvg(s:CalculationSnapshot){
 const p=s.input,g=flangeTieGeometry(p);if(!g)return '';const d=p.details!,b=p.section,a=g.attachment,t=d.brace,sz=(v:number)=>plateInches(v,p.units),dim=(v:number)=>drawingLength(v,p.units);
 let svg=sheetStart(s,'S-06','CRANE RUNWAY / DIRECT FLANGE TIE ATTACHMENTS');
 svg+=line([612,76],[612,680],'divider')+line([24,379],[1200,379],'divider');
 svg+=flangeTieSection(s,130,128);
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
 svg+=rect(cx-d.bracket!.receiver.width*k/2,cy+g.face*k,d.bracket!.receiver.width*k,d.bracket!.receiver.flangeThickness*k,'reference-line');
 const rootX=cx+((pair.at(-1)?.tieX??grid)-grid)*k;
 svg+=fieldFilletLeader([[rootX,cy+g.face*k]],[1027,285],sz(t.connection.weldSize),['FIELD WELD TO EXISTING COLUMN','BOTH SIDES / EACH GUSSET'],true);
 svg+=text(cx-20,325,'EXISTING COLUMN / SEPARATE TIES EACH GIRDER',8,'middle');
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
 svg+=text(637,406,'CONNECTION NOTES / LOCAL CHECKS',11,'start',700);
 const notes=[`TIES: ${dim(t.length)} LONG, AT BOTH FLANGES. SET BACK ${dim(a.longitudinalSetback)} FROM BEARING CENTERS TOWARD GIRDER ENDS.`,
  'GIRDER FORCE TRANSFERS THROUGH THE GUSSET AND SADDLE DIRECTLY TO THE FLANGE. DO NOT WELD THE GUSSET TO THE WEB.',
  `FIELD WELD COLUMN GUSSET TO EXISTING COLUMN: TWO ${sz(t.connection.weldSize).replaceAll('"','')} CONTINUOUS FILLETS X ${dim(t.width)}. VERIFY STEEL GRADE, WELDABILITY AND SURFACE CONDITION.`,
  'THIS DETAIL CHECKS LOCAL STRENGTH, STIFFNESS AND FATIGUE. GLOBAL BUILDING FORCES AND MOVEMENT COMPATIBILITY REQUIRE PROJECT REVIEW.',
  'CONFIRM END ROTATION, THERMAL TRAVEL AND COLUMN SHORTENING BEFORE FABRICATION. DO NOT ASSUME RIGID TIE ROOTS PROVIDE A MOVEMENT RELEASE.',
  'STANDARD HOLES; PRETENSIONED A325 BOLTS; CLASS B FAYING SURFACES. NO HOLES OR CUTS THROUGH THE CAP OR W FLANGES.' ];
 let y=429;for(const [i,n] of notes.entries()){const q=wrappedText(639,y,`${i+1}. ${n}`,93,8,12);svg+=q.svg;y+=q.height+9;}
 const checks=s.checks.filter(c=>c.group==='Flange attachment'),max=Math.max(0,...checks.map(c=>c.utilization??0));
 svg+=text(639,643,checks.length?`LOCAL CHECKS: ${checks.filter(c=>c.status==='pass').length} / ${checks.length} PASS; MAX D/C ${max.toFixed(3)}`:'LOCAL CHECKS: PENDING',9,'start',700);
 return svg+titleBlock(s,'S-06','DIRECT FLANGE TIES')+'</svg>';
}

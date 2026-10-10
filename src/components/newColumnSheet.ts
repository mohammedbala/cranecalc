import type {CalculationSnapshot} from '../engine/types';
import {format} from '../engine/units';
import {existingColumnSection} from '../engine/existingColumn';
import {anchorHardware,columnBaseElevation} from '../engine/columnBaseInputs';
import {barDiameter} from '../engine/columnBase';
import {runwayElevations} from '../engine/drawingData';
import {flangeTieGeometry} from '../engine/tieGeometry';
import {drawingLength,plateInches} from './drawingFormat';
import {sheetDrawingScale as drawingScale,sheetStart,titleBlock,text,line,rect,circle,dimH,dimV,viewTitle,multiLeader,filletLeader,detailRef,labelColumn,n,breakLine,textWidth,type XY} from './sheetGraphics';
import {heading,numbered,table,noteStack,type Style} from './noteBlocks';

const inch=25.4;

/** Concrete in section: a fixed stipple of dots and small aggregate triangles inside the outline. */
function concrete(x:number,y:number,w:number,h:number,density=1){
 let svg='',seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 const count=Math.round(w*h/110*density);
 for(let i=0;i<count;i++){
  const px=x+2+rnd()*(w-4),py=y+2+rnd()*(h-4);
  if(i%3===0){const r=.8+rnd()*.5,a=rnd()*Math.PI;svg+=`<polyline class="hatch" points="${[0,1,2,0].map(k=>`${n(px+r*Math.cos(a+k*2.0944))},${n(py+r*Math.sin(a+k*2.0944))}`).join(' ')}"/>`;}
  else svg+=circle(px,py,.22,'hatch-dot');
 }
 return `<g data-hatch="concrete">${svg}</g>`;
}
/** Undisturbed earth below a line: groups of three short diagonals. */
function earth(x1:number,x2:number,y:number){
 let svg='';for(let x=x1+3;x<x2-6;x+=11)for(let j=0;j<3;j++)svg+=line([x+j*2,y+.6],[x+j*2-3.2,y+4],'hatch');
 return `<g data-hatch="earth">${svg}</g>`;
}
/** Elevation datum: triangle on the extension line and the label beside it, spread to clear its neighbours. */
function elevationMarks(marks:{y:number;label:string}[],x:number,side:'left'|'right',from:(y:number)=>number){
 const sorted=[...marks].sort((a,b)=>a.y-b.y),placed:number[]=[];
 for(const [i,m] of sorted.entries())placed.push(Math.max(m.y,i?placed[i-1]+10:-Infinity));
 return sorted.map((m,i)=>{
  const dir=side==='right'?1:-1,x0=from(m.y),tip=x+dir*10,ly=placed[i];
  return `<g data-elevation-mark="${m.label.split(' ')[0]}">${line([x0,m.y],[x,m.y],'annotation')}<path class="leader-arrow" d="M${n(x)},${n(m.y)}l-2.4,-3.2h4.8z"/>${line([x,m.y],[tip,ly])}${line([tip,ly],[tip+dir*4,ly])}${text(tip+dir*6,ly+3,m.label,7.5,side==='right'?'start':'end')}</g>`;
 }).join('');
}
/** W shape in plan: flanges parallel to the runway, depth across it. */
function wPlan(cx:number,cy:number,d:number,bf:number,tf:number,tw:number,k:number,cls='runway-line'){
 const x=(z:number)=>cx+z*k,y=(v:number)=>cy+v*k;
 return `<path class="${cls}" d="M${n(x(-d/2))},${n(y(-bf/2))}H${n(x(-d/2+tf))}V${n(y(-tw/2))}H${n(x(d/2-tf))}V${n(y(-bf/2))}H${n(x(d/2))}V${n(y(bf/2))}H${n(x(d/2-tf))}V${n(y(tw/2))}H${n(x(-d/2+tf))}V${n(y(bf/2))}H${n(x(-d/2))}Z"/>`;
}

/** S-08: new freestanding runway column, its base plate, anchor rods and spread footing. */
export function newColumnSheetSvg(s:CalculationSnapshot){
 const p=s.input,u=p.units,col=p.existingColumn!,b=p.columnBase!,d=p.details!,br=d.bracket?.enabled?d.bracket:undefined,g=p.section,r=s.columnBase;
 const dim=(v:number)=>drawingLength(v,u),size=(v:number)=>plateInches(v,u),force=(v:number,q:Parameters<typeof format>[1]='force')=>{const t=format(v,q,u,q==='pressure'?0:3);return u==='US'?t.toUpperCase():t;};
 const c=existingColumnSection(p).section,name=col.shape||`BUILT-UP ${size(c.d)} X ${size(c.bf)}`;
 const tb=b.plate.thickness,gr=b.grout,ft=b.footing,hf=ft.thickness,a=b.anchors,hw=anchorHardware(a.diameter),row=b.plate.N/2-a.edge;
 const bt=d.bearing.thickness,seat=col.seatElevation,H=col.height,cap=g.kind==='cap'?g.capTw:0,railDepth=p.aist?.railDepth??p.railHeight,rl=d.rail;
 const girderZ=br?c.d/2+br.reach:col.eccentricity,y0=seat+bt,tos=y0+g.d,railZ=girderZ-p.railEccentricity;
 const xs=Array.from({length:a.perRow},(_,i)=>a.perRow>1?-a.gauge/2+i*a.gauge/(a.perRow-1):0);
 const db=barDiameter[ft.bar],ftgTop=-(tb+gr),ftgBot=ftgTop-hf,floor=ftgTop+ft.soil,ext=Math.max(12*inch,ft.L*.12);
 const el=runwayElevations(p),datum=p.drawing?.datumElevation??0,elev=(y:number)=>`EL. ${dim(datum+columnBaseElevation(b)+y)}`;
 const anchorLabel=`${2*a.perRow} - ${size(a.diameter)} DIA. ASTM F1554 GR. ${a.grade.split('-')[1]}`;
 const barLabel=`${ft.bar} @ ${dim(ft.spacing)} E.W. BOTTOM`;
 const tie=flangeTieGeometry(p);
 let svg=sheetStart(s,'S-08','CRANE RUNWAY / NEW RUNWAY COLUMN, BASE PLATE & FOOTING');
 svg+=line([560,76],[560,680],'divider')+line([850,76],[850,680],'divider')+line([560,379],[1200,379],'divider');

 // 1: Elevation across the runway at a support, looking along the runway. A long column is broken between
 // the base and the bracket so both ends draw at a legible scale; dimensions govern.
 {
  const top=Math.max(H,tos+cap+railDepth),bottom=ftgBot-4*inch,upperFrom=seat-(br?br.seatThickness+br.ribDepth:0)-9*inch,lowerTo=Math.max(14*inch,ft.soil+8*inch);
  const broken=upperFrom-lowerTo>18*inch,gap=broken?22:0,shown=broken?(top-upperFrom)+(lowerTo-bottom):top-bottom;
  const zMin=-ft.L/2-ext*.55,zMax=Math.max(ft.L/2+ext*.55,girderZ+Math.max(g.bf,g.kind==='cap'?g.capWidth:0)/2);
  const k=drawingScale(Math.min((540-gap)/shown,220/(zMax-zMin)),u),kk=k.pointsPerMm,cx=124+(-zMin)*kk,X=(z:number)=>cx+z*kk;
  // Centered between the sheet top and the view title.
  const base=640-Math.max(0,(540-gap-shown*kk)/2)*.8;
  const Y=(y:number)=>!broken||y<=lowerTo?base-(y-bottom)*kk:base-(lowerTo-bottom)*kk-gap-(Math.max(y,upperFrom)-upperFrom)*kk;
  const brk=(y:number)=>broken&&y>lowerTo&&y<upperFrom;
  svg+='<g data-view="new-column-elevation">';
  // Column, flange inner faces seen edge-on; broken between the base and the bracket.
  const colPart=(y1:number,y2:number)=>rect(X(-c.d/2),Y(y2),c.d*kk,Y(y1)-Y(y2),'runway-line').replace(/<rect([^>]*)\/>/,(m)=>m)+line([X(-c.d/2+c.tf),Y(y2)],[X(-c.d/2+c.tf),Y(y1)],'runway-line')+line([X(c.d/2-c.tf),Y(y2)],[X(c.d/2-c.tf),Y(y1)],'runway-line');
  if(broken){
   const yb=Y(lowerTo),yt=Y(upperFrom);
   svg+=line([X(-c.d/2),Y(0)],[X(-c.d/2),yb],'runway-line')+line([X(c.d/2),Y(0)],[X(c.d/2),yb],'runway-line')+line([X(-c.d/2),Y(H)],[X(c.d/2),Y(H)],'runway-line')+line([X(-c.d/2),yt],[X(-c.d/2),Y(H)],'runway-line')+line([X(c.d/2),yt],[X(c.d/2),Y(H)],'runway-line');
   for(const [y1,y2] of [[0,lowerTo],[upperFrom,H]] as const)for(const z of [-c.d/2+c.tf,c.d/2-c.tf])svg+=line([X(z),Y(y2)],[X(z),Y(y1)],'runway-line');
   svg+=breakLine([X(-c.d/2)-6,yb],[X(c.d/2)+6,yb])+breakLine([X(-c.d/2)-6,yt],[X(c.d/2)+6,yt]);
  }else svg+=colPart(0,H);
  svg+=line([X(0),Y(top)-8],[X(0),Y(bottom)+6],'grid-line');
  // Bracket seat and ribs on the girder-side flange.
  if(br){svg+=rect(X(c.d/2),Y(seat),br.seatProjection*kk,br.seatThickness*kk,'runway-line')+rect(X(c.d/2),Y(seat-br.seatThickness),br.seatProjection*kk,br.ribDepth*kk,'runway-line');}
  // Bearing plate, girder section with the cap channel, and the rail.
  svg+=rect(X(girderZ-d.bearing.width/2),Y(y0),d.bearing.width*kk,bt*kk,'runway-line');
  svg+=`<path class="runway-line" d="M${n(X(girderZ-g.bf/2))},${n(Y(y0))}H${n(X(girderZ+g.bf/2))}V${n(Y(y0+g.tf))}H${n(X(girderZ+g.tw/2))}V${n(Y(tos-g.tf))}H${n(X(girderZ+g.bf/2))}V${n(Y(tos))}H${n(X(girderZ-g.bf/2))}V${n(Y(tos-g.tf))}H${n(X(girderZ-g.tw/2))}V${n(Y(y0+g.tf))}H${n(X(girderZ-g.bf/2))}Z"/>`;
  if(g.kind==='cap'){const w=g.capWidth/2,leg=g.capDepth-g.capTw;svg+=`<path class="runway-line" d="M${n(X(girderZ-w))},${n(Y(tos+cap))}H${n(X(girderZ+w))}V${n(Y(tos-leg))}H${n(X(girderZ+w-g.capTf))}V${n(Y(tos))}H${n(X(girderZ-w+g.capTf))}V${n(Y(tos-leg))}H${n(X(girderZ-w))}Z"/>`;}
  const rb=tos+cap;svg+=`<path class="rail-line" d="M${n(X(railZ-rl.baseWidth/2))},${n(Y(rb))}H${n(X(railZ+rl.baseWidth/2))}V${n(Y(rb+rl.baseThickness))}H${n(X(railZ+rl.webThickness/2))}V${n(Y(rb+railDepth-rl.headThickness))}H${n(X(railZ+rl.headWidth/2))}V${n(Y(rb+railDepth))}H${n(X(railZ-rl.headWidth/2))}V${n(Y(rb+railDepth-rl.headThickness))}H${n(X(railZ-rl.webThickness/2))}V${n(Y(rb+rl.baseThickness))}H${n(X(railZ-rl.baseWidth/2))}Z"/>`;
  svg+=line([X(girderZ),Y(top)-8],[X(girderZ),Y(y0)+8],'grid-line');
  // Ties from the girder flange saddles to the column face.
  const ties=(tie?.sides??[]).map(side=>{const yc=y0+g.d/2+(side>0?tie!.topCenter:tie!.bottomCenter),w=d.brace.width;return {side,yc,z1:c.d/2,z2:girderZ-tie!.start,w};});
  for(const t of ties)svg+=rect(X(t.z1),Y(t.yc+t.w/2),(t.z2-t.z1)*kk,t.w*kk,'runway-line');
  // Base plate, grout, anchor rods, footing and the floor.
  svg+=rect(X(-b.plate.N/2),Y(0),b.plate.N*kk,tb*kk,'runway-line')+rect(X(-b.plate.N/2-inch),Y(-tb),(b.plate.N+2*inch)*kk,gr*kk,'annotation');
  svg+=rect(X(-ft.L/2),Y(ftgTop),ft.L*kk,hf*kk,'runway-line')+concrete(X(-ft.L/2),Y(ftgTop),ft.L*kk,hf*kk,.8);
  for(const z of [-row,row]){
   const head=ftgTop-a.embedment,nut=1.5*a.diameter;
   svg+=line([X(z),Y(hw.washerThickness+a.diameter*1.6)],[X(z),Y(head)],'runway-line');
   svg+=rect(X(z-hw.washer/2),Y(hw.washerThickness),hw.washer*kk,hw.washerThickness*kk,'runway-line')+rect(X(z-nut/2),Y(hw.washerThickness+a.diameter),nut*kk,a.diameter*kk,'runway-line')+rect(X(z-nut/2),Y(head),nut*kk,a.diameter*kk,'runway-line');
  }
  // Existing slab saw cut to the footing outline, isolation joint each side.
  const slabTop=floor,slabBot=floor-ft.slab;
  for(const sign of [-1,1]){
   const zi=sign*(ft.soil>0?b.plate.N/2+12*inch:ft.L/2),zo=sign*(ft.L/2+ext*.55),x1=X(Math.min(zi,zo)),w=Math.abs(zo-zi)*kk;
   if(ft.slab>0)svg+=rect(x1,Y(slabTop),w,ft.slab*kk,'reference-line')+concrete(x1,Y(slabTop),w,ft.slab*kk,.8)+breakLine([X(zo),Y(slabTop)-4],[X(zo),Y(slabBot)+4])+line([X(zi)+sign*1.2,Y(slabTop)],[X(zi)+sign*1.2,Y(slabBot)],'annotation');
  }
  svg+=earth(X(-ft.L/2),X(ft.L/2),Y(ftgBot));
  // Elevations: runway beside the girder, base and footing on the left.
  const girderRight=X(girderZ+(g.kind==='cap'?g.capWidth:g.bf)/2),right=Math.max(girderRight,X(c.d/2+(br?.seatProjection??0)))+8,left=X(zMin)-6;
  // Runway elevations beside the column on the left, clear of the component leaders on the right.
  svg+=elevationMarks([
   {y:Y(rb+railDepth),label:`T.O.R. ${el?`EL. ${dim(el.tor)}`:''}`},{y:Y(tos),label:`T.O.S. ${el?`EL. ${dim(el.tos)}`:''}`},{y:Y(seat),label:`BRG. SEAT ${el?`EL. ${dim(el.seat)}`:''}`}
  ],X(-c.d/2)-48,'left',yy=>yy===Y(rb+railDepth)?X(railZ-rl.headWidth/2)-2:X(-c.d/2)-2);
  svg+=elevationMarks([
   {y:Y(0),label:`T/BASE PL ${elev(0)}`},{y:Y(ftgTop),label:`T/FTG ${ft.soil>0?'':'= T/SLAB '}${elev(ftgTop)}`},{y:Y(ftgBot),label:`B/FTG ${elev(ftgBot)}`}
  ],left,'left',yy=>yy===Y(0)?X(-b.plate.N/2)-2:X(-ft.L/2)-2);
  // Column and seat heights from the base (across the break), footing width.
  svg+=dimV(Y(H),Y(0),X(-c.d/2),X(-c.d/2)-18,dim(H))+dimV(Y(seat),Y(0),X(-c.d/2),X(-c.d/2)-36,dim(seat));
  svg+=dimH(X(-ft.L/2),X(ft.L/2),Y(ftgBot),Y(ftgBot)+20,dim(ft.L));
  if(br)svg+=dimH(X(c.d/2),X(girderZ),Y(top),Y(top)-8,dim(br.reach));
  void brk;
  const lx=right+14;
  svg+=labelColumn([
   ...ties.map(t=>({at:[X((t.z1+t.z2)/2),Y(t.yc-t.w/2)] as XY,labels:[`${t.side>0?'TOP':'BOTTOM'} FLANGE TIE`,`SEE ${detailRef('DIRECT FLANGE TIE / TOP TRANSVERSE SECTION')}`]})),
   {at:[X(girderZ+g.bf/2),Y(y0+g.tf/2)],labels:[`${g.name}`,'GIRDER, SEE S-01']},
   ...(br?[{at:[X(c.d/2+br.seatProjection*.7),Y(seat-br.seatThickness-br.ribDepth*.5)] as XY,labels:['WELDED BRACKET',`SEE ${detailRef('COLUMN BRACKET / TRANSVERSE SECTION')}`]}]:[]),
   {at:[X(c.d/2),Y(broken?upperFrom+(seat-upperFrom)*.25:H*.5)],labels:[`NEW ${name}`,'COLUMN, ASTM A992']},
   {at:[X(row+hw.washer/2),Y(hw.washerThickness/2)],labels:[`PL ${size(tb)} BASE PL`,`SEE ${detailRef('BASE PLATE / PLAN')}`]},
   {at:[X(b.plate.N/2+inch),Y(-tb-gr/2)],labels:[`${size(gr)} NON-SHRINK GROUT`]},
   ...(ft.slab>0?[{at:[X(ft.L/2+ext*.4),Y(slabTop-ft.slab/2)] as XY,labels:[`(E) ${size(ft.slab)} SLAB, SAW CUT,`,'ISOLATION JOINT']}]:[]),
   {at:[X(row),Y(ftgTop-a.embedment*.6)],labels:[anchorLabel.replace(' ASTM',''),`HEADED, HEF ${dim(a.embedment)}`]},
   {at:[X(ft.L/2),Y(ftgTop-hf*.75)],labels:[`FTG ${dim(ft.L)} X ${dim(ft.B)} X ${dim(hf)}`,`SEE ${detailRef('FOOTING / SECTION')}`]}
  ],lx,Y(top)+6,Y(bottom)-6);
  svg+=viewTitle(292,666,'NEW RUNWAY COLUMN / ELEVATION',k.label)+'</g>';
 }
 // 2: Base plate plan.
 {
  const k=drawingScale(Math.min(.5,120/b.plate.N,130/b.plate.B),u),kk=k.pointsPerMm,cx=846-46-b.plate.N/2*kk,cy=214,X=(z:number)=>cx+z*kk,Y=(x:number)=>cy+x*kk;
  svg+='<g data-view="base-plate-plan">';
  svg+=rect(X(-b.plate.N/2),Y(-b.plate.B/2),b.plate.N*kk,b.plate.B*kk,'runway-line')+wPlan(cx,cy,c.d,c.bf,c.tf,c.tw,kk);
  svg+=line([X(-b.plate.N/2)-12,cy],[X(b.plate.N/2)+12,cy],'grid-line')+line([cx,Y(-b.plate.B/2)-12],[cx,Y(b.plate.B/2)+12],'grid-line');
  for(const z of [-row,row])for(const x of xs){const hc:XY=[X(z),Y(x)];svg+=rect(X(z-hw.washer/2),Y(x-hw.washer/2),hw.washer*kk,hw.washer*kk,'runway-line')+circle(hc[0],hc[1],hw.hole/2*kk,'runway-line')+circle(hc[0],hc[1],a.diameter/2*kk,'annotation');}
  const yb=Y(b.plate.B/2),xr=X(b.plate.N/2);
  svg+=dimH(X(-b.plate.N/2),X(b.plate.N/2),yb,yb+34,dim(b.plate.N))+dimH(X(-row),X(row),Y(Math.max(...xs)),yb+18,dim(2*row));
  svg+=dimH(X(row),X(b.plate.N/2),Y(Math.max(...xs)),yb+18,size(a.edge),'right');
  svg+=dimV(Y(-b.plate.B/2),Y(b.plate.B/2),xr,xr+40,dim(b.plate.B))+dimV(Y(xs[0]),Y(xs.at(-1)!),X(row),xr+20,dim(a.gauge));
  svg+=multiLeader([[X(-row-hw.washer/2),Y(xs[0]-hw.washer/2)]],[576,96],[anchorLabel,`${size(hw.hole)} DIA. HOLES, PL WASHERS`,`${size(hw.washer)} X ${size(hw.washer)} X ${size(hw.washerThickness)}, TYP.`],8);
  svg+=filletLeader([[X(-c.d/2+c.tf),Y(c.bf/4)]],[576,cy+14],size(b.plate.weld),['COLUMN TO BASE PL,','BOTH SIDES OF FLANGES','AND WEB'],true);
  const ay=Y(-b.plate.B/2)-12;svg+=text(X(b.plate.N/2)-40,ay-5,'TO GIRDER',7.5,'start',700)+line([X(b.plate.N/2)-40,ay],[X(b.plate.N/2),ay])+`<path class="leader-arrow" d="M${n(X(b.plate.N/2)+4)},${n(ay)}l-5,-1.6v3.2z"/>`;
  svg+=text(cx,Y(b.plate.B/2)+56,`PL ${size(tb)} X ${dim(b.plate.B)} X ${dim(b.plate.N)}, ASTM A572 GR. 50`,8.5,'middle',700);
  svg+=viewTitle(705,362,'BASE PLATE / PLAN',k.label)+'</g>';
 }
 // 3: Footing plan with the bottom bars each way.
 {
  const k=drawingScale(Math.min(220/ft.L,180/ft.B),u),kk=k.pointsPerMm,cx=1010,cy=226,X=(z:number)=>cx+z*kk,Y=(x:number)=>cy+x*kk;
  svg+='<g data-view="footing-plan">';
  svg+=rect(X(-ft.L/2),Y(-ft.B/2),ft.L*kk,ft.B*kk,'runway-line');
  const along=r?.footing.strength.along.bars??Math.floor((ft.B-2*ft.cover)/ft.spacing)+1,across=r?.footing.strength.across.bars??Math.floor((ft.L-2*ft.cover)/ft.spacing)+1;
  const spread=(count:number,span:number)=>Array.from({length:count},(_,i)=>-span/2+ft.cover+(count>1?i*(span-2*ft.cover)/(count-1):(span-2*ft.cover)/2));
  for(const x of spread(along,ft.B))svg+=line([X(-ft.L/2+ft.cover),Y(x)],[X(ft.L/2-ft.cover),Y(x)],'hidden-line');
  for(const z of spread(across,ft.L))svg+=line([X(z),Y(-ft.B/2+ft.cover)],[X(z),Y(ft.B/2-ft.cover)],'hidden-line');
  svg+=rect(X(-b.plate.N/2),Y(-b.plate.B/2),b.plate.N*kk,b.plate.B*kk,'runway-line')+wPlan(cx,cy,c.d,c.bf,c.tf,c.tw,kk);
  svg+=line([X(-ft.L/2)-14,cy],[X(ft.L/2)+14,cy],'grid-line')+line([cx,Y(-ft.B/2)-14],[cx,Y(ft.B/2)+14],'grid-line');
  svg+=dimH(X(-ft.L/2),X(ft.L/2),Y(ft.B/2),Y(ft.B/2)+20,dim(ft.L))+dimV(Y(-ft.B/2),Y(ft.B/2),X(ft.L/2),X(ft.L/2)+22,dim(ft.B));
  const barText=Math.abs(ft.L-ft.B)<1&&along===across?[`${2*along} ${ft.bar} X ${dim(ft.L-2*ft.cover)} (${along} EACH WAY)`]:[`${along} ${ft.bar} X ${dim(ft.L-2*ft.cover)} ALONG L`,`${across} ${ft.bar} X ${dim(ft.B-2*ft.cover)} ACROSS`];
  svg+=multiLeader([[X(ft.L/2-ft.cover-ft.spacing*.5),Y(spread(along,ft.B)[0])]],[cx+12,90],[barText[0],...barText.slice(1),barLabel,`${size(ft.cover)} CLEAR, STRAIGHT`],7.5);
  svg+=multiLeader([[X(-c.d/2),cy-2]],[866,90],['COLUMN C/L ON GRID,','FOOTING CONCENTRIC'],7.5);
  svg+=viewTitle(1025,360,'FOOTING / PLAN',k.label)+'</g>';
 }
 // 4: Footing section through the column along L.
 {
  const stub=10*inch,top=Math.max(stub,floor+2*inch),bottom=ftgBot-3*inch,span=ft.L+2*ext*.5;
  const k=drawingScale(Math.min(215/span,110/(top-bottom)),u),kk=k.pointsPerMm,cx=568+58+ext*.5*kk+ft.L/2*kk,X=(z:number)=>cx+z*kk,Y=(y:number)=>630-(y-bottom)*kk;
  svg+='<g data-view="footing-section">';
  svg+=rect(X(-ft.L/2),Y(ftgTop),ft.L*kk,hf*kk,'runway-line')+concrete(X(-ft.L/2),Y(ftgTop),ft.L*kk,hf*kk);
  // Lower layer across the section (bars cut), upper layer along it.
  const upper=ftgBot+ft.cover+1.5*db,lower=ftgBot+ft.cover+db/2;
  svg+=line([X(-ft.L/2+ft.cover),Y(upper)],[X(ft.L/2-ft.cover),Y(upper)],'runway-line');
  const cut=Math.floor((ft.L-2*ft.cover)/ft.spacing)+1;
  for(let i=0;i<cut;i++){const z=-ft.L/2+ft.cover+(cut>1?i*(ft.L-2*ft.cover)/(cut-1):0);svg+=circle(X(z),Y(lower),Math.max(1,db/2*kk),'dot');}
  // Column stub, plate, grout and rods to their heads.
  svg+=rect(X(-c.d/2),Y(stub),c.d*kk,stub*kk,'runway-line')+line([X(-c.d/2+c.tf),Y(stub)],[X(-c.d/2+c.tf),Y(0)],'runway-line')+line([X(c.d/2-c.tf),Y(stub)],[X(c.d/2-c.tf),Y(0)],'runway-line');
  svg+=breakLine([X(-c.d/2)-6,Y(stub)],[X(c.d/2)+6,Y(stub)]);
  svg+=rect(X(-b.plate.N/2),Y(0),b.plate.N*kk,tb*kk,'runway-line')+rect(X(-b.plate.N/2-inch),Y(-tb),(b.plate.N+2*inch)*kk,gr*kk,'annotation');
  const head=ftgTop-a.embedment,nut=1.5*a.diameter;
  for(const z of [-row,row]){
   svg+=line([X(z-a.diameter/2),Y(hw.washerThickness+a.diameter*1.6)],[X(z-a.diameter/2),Y(head)],'runway-line')+line([X(z+a.diameter/2),Y(hw.washerThickness+a.diameter*1.6)],[X(z+a.diameter/2),Y(head)],'runway-line');
   svg+=rect(X(z-hw.washer/2),Y(hw.washerThickness),hw.washer*kk,hw.washerThickness*kk,'runway-line')+rect(X(z-nut/2),Y(hw.washerThickness+a.diameter),nut*kk,a.diameter*kk,'runway-line')+rect(X(z-nut/2),Y(head),nut*kk,a.diameter*kk,'runway-line');
  }
  const slabTop=floor,slabBot=floor-ft.slab;
  for(const sign of [-1,1]){
   const zi=sign*(ft.soil>0?b.plate.N/2+12*inch:ft.L/2),zo=sign*(ft.L/2+ext*.5),x1=X(Math.min(zi,zo)),w=Math.abs(zo-zi)*kk;
   if(ft.slab>0)svg+=rect(x1,Y(slabTop),w,ft.slab*kk,'reference-line')+concrete(x1,Y(slabTop),w,ft.slab*kk)+breakLine([X(zo),Y(slabTop)-4],[X(zo),Y(slabBot)+4])+line([X(zi)+sign*1.5,Y(slabTop)],[X(zi)+sign*1.5,Y(slabBot)],'annotation');
  }
  svg+=earth(X(-ft.L/2-ext*.5),X(ft.L/2+ext*.5),Y(ftgBot))+line([X(-ft.L/2-ext*.5),Y(ftgBot)],[X(-ft.L/2),Y(ftgBot)],'annotation')+line([X(ft.L/2),Y(ftgBot)],[X(ft.L/2+ext*.5),Y(ftgBot)],'annotation');
  // Dimensions: thickness, embedment and cover on the left; rod spacing above.
  const lx=X(-ft.L/2);
  svg+=dimV(Y(ftgTop),Y(ftgBot),lx,lx-16,dim(hf))+dimV(Y(ftgTop),Y(head),X(-row-nut/2),lx-34,`HEF ${dim(a.embedment)}`)+dimV(Y(ftgBot),Y(ftgBot+ft.cover),lx,lx-52,size(ft.cover));
  svg+=dimH(X(-row),X(row),Y(hw.washerThickness+a.diameter*1.6),Y(stub)-6,dim(2*row));
  svg+=labelColumn([
   {at:[X(c.d/2),Y(stub*.8)],labels:[`${name} COLUMN`]},
   {at:[X(row+nut/2),Y(hw.washerThickness+a.diameter/2)],labels:['HVY HEX NUT AND PL','WASHER WELDED TO PL']},
   {at:[X(b.plate.N/2+inch),Y(-tb-gr/2)],labels:[`${size(gr)} NON-SHRINK GROUT`]},
   ...(ft.slab>0?[{at:[X(-ft.L/2-ext*.3),Y(slabTop)] as XY,labels:[`(E) ${size(ft.slab)} SLAB, SAW CUT,`,'1/2" ISOLATION JT.']}]:[]),
   {at:[X(row+nut/2),Y(head+a.diameter/2)],labels:['HVY HEX NUT HEAD,','TACK WELDED']},
   {at:[X(ft.L/2-ft.cover-ft.spacing),Y(upper)],labels:[barLabel.replace(' BOTTOM',''),'BOTTOM']},
   {at:[X(ft.L/2-ft.cover),Y(lower)],labels:['UNDISTURBED SOIL','OR APPROVED FILL']}
  ],576,398,Y(top)-12);
  svg+=viewTitle(705,662,'FOOTING / SECTION',k.label)+'</g>';
 }
 // 5: Design data and notes.
 {
  const check=(id:string)=>s.checks.find(v=>v.id===id),ratio=(id:string)=>{const v=check(id);return v?.utilization!==undefined?`${v.status==='fail'?'FAILS ':''}${v.utilization.toFixed(2)}`:'-';};
  const act=r?.plate.action,anchorAct=r?.anchors.action;
  const rows=[
   ['COLUMN',`${name}, ${dim(H)} BASE TO TOP, SEAT ${dim(seat)}`],
   ['BASE PLATE',`PL ${size(tb)} X ${dim(b.plate.B)} X ${dim(b.plate.N)}, FY ${force(b.plate.Fy,'stress')}`],
   ['ANCHOR RODS',`${anchorLabel}, HEF ${dim(a.embedment)}`],
   ['FOOTING',`${dim(ft.L)} X ${dim(ft.B)} X ${dim(hf)}, ${barLabel}`],
   [`GOVERNING BASE ACTION (${p.method})`,act?`${act.id}: P ${force(act.P)}, M ${force(act.Mx,'moment')}, V ${force(act.Vx)}`:'-'],
   ['ANCHOR TENSION / SHEAR (LRFD)',r&&anchorAct?`${force(r.anchors.T)} / ${force(r.anchors.V)} (${anchorAct.id})`:'-'],
   ['SOIL: ALLOWABLE / MAX. SERVICE',r?`${force(b.soil.allowable,'pressure')} / ${force(r.footing.qMax,'pressure')}`:'-'],
   ['RATIOS: PLATE / RODS / SOIL / OVERTURNING / DRIFT',`${ratio('base-plate')} / ${ratio('base-anchor-interaction')} / ${ratio('base-soil')} / ${ratio('base-overturning')} / ${ratio('base-drift')}`],
   ['DATA SOURCE',b.source||'NOT ENTERED']
  ];
  const notes=[
   `NEW COLUMNS: ASTM A992 ${name}, ONE AT EACH SUPPORT OF BOTH RUNWAYS. FIXED BASE, FREE TOP ACROSS THE RUNWAY; ALONG THE RUNWAY BY THE CRANE-LEVEL BRACING. COLUMN TOP AT OR BELOW THE TOP OF THE GIRDER, CLEAR OF THE CRANE END TRUCKS; VERIFY CLEARANCE WITH THE CRANE SUPPLIER.`,
   `BASE PLATE ASTM A572 GR. 50, SHOP WELDED TO THE COLUMN, ${size(b.plate.weld)} FILLETS BOTH SIDES OF FLANGES AND WEB. HOLES ${size(hw.hole)} DIA. (AISC DG1 TABLE 2.3) WITH ${size(hw.washer)} X ${size(hw.washer)} X ${size(hw.washerThickness)} PLATE WASHERS; WELD WASHERS TO THE PLATE AFTER THE NUTS ARE SNUG SO ALL RODS SHARE THE SHEAR.`,
   `ANCHOR RODS ASTM F1554 GR. ${a.grade.split('-')[1]} WITH ASTM A563 HEAVY HEX NUTS; EMBEDDED HEAVY HEX NUT TACK WELDED TO THE ROD. SET WITH A TEMPLATE TO AISC CODE OF STANDARD PRACTICE §7.5 TOLERANCES. DO NOT FIELD BEND OR HEAT RODS.`,
   `SET THE PLATE ON SHIM STACKS OR LEVELING NUTS AND FILL ${size(gr)} OF NON-SHRINK, NON-METALLIC GROUT (ASTM C1107, 5,000 PSI MINIMUM) TO FULL BEARING BEFORE THE GIRDER IS SET.`,
   `FOOTING CONCRETE f'c = ${force(b.concrete.fc,'stress')} AT 28 DAYS, NORMALWEIGHT; REINFORCEMENT ASTM A615 GR. ${Math.round(b.footing.fy/6.894757293168)}, ${size(ft.cover)} CLEAR COVER CAST AGAINST EARTH, STRAIGHT BARS EACH WAY.`,
   `${ft.soil>0?`TOP OF FOOTING ${dim(ft.soil)} BELOW THE FLOOR; BACKFILL AND REPLACE THE SLAB OVER IT AFTER THE COLUMN IS ERECTED.`:'SAW CUT AND REMOVE THE EXISTING SLAB TO THE FOOTING OUTLINE, EXCAVATE TO BEARING AND POUR THE FOOTING TO THE TOP OF SLAB WITH A 1/2" PREFORMED ISOLATION JOINT AT THE PERIMETER.'} LOCATE UNDERGROUND UTILITIES BEFORE CUTTING OR EXCAVATING.`,
   `BEAR FOOTINGS ON UNDISTURBED SOIL OR COMPACTED FILL APPROVED BY THE GEOTECHNICAL ENGINEER: ${force(b.soil.allowable,'pressure')} ALLOWABLE. BOTTOM OF FOOTING ${dim(ft.soil+hf)} BELOW THE FLOOR${b.soil.frost>0?`, BELOW THE ${dim(b.soil.frost)} FROST DEPTH`:', INTERIOR FOOTING PROTECTED FROM FROST'}.`,
   'SPECIAL INSPECTION PER IBC 1705.3 AND THE STATEMENT OF SPECIAL INSPECTIONS: ANCHOR ROD PLACEMENT, REINFORCEMENT, CONCRETE SAMPLING AND PLACEMENT, AND THE COLUMN-TO-PLATE AND BRACKET WELDS.'
  ];
  svg+='<g data-view="new-column-notes">'+noteStack([(t:Style)=>[heading(t,'NEW COLUMN DESIGN DATA'),table(t,['ITEM','VALUE'],rows,[1.25,1.75]),heading(t,'NEW COLUMN AND FOUNDATION NOTES'),...numbered(t,notes)]],u,{x:866,y:394,width:322,height:280})+'</g>';
 }
 return svg+titleBlock(s,'S-08','NEW RUNWAY COLUMNS & FOOTINGS')+'</svg>';
}

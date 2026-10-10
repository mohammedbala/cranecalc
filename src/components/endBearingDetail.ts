import type {CalculationSnapshot} from '../engine/types';
import {activeEndBearing,endBearingGeometry,continuousBearings} from '../engine/endBearing';
import {simpleSupportInput} from '../engine/simpleSupports';
import {bracketArrangement} from '../engine/connectionOptions';
import {usesExistingBracket} from '../engine/existingBracket';
import {drawingLength,plateInches} from './drawingFormat';
import {sheetDrawingScale as drawingScale,text,line,rect,circle,dimH,dimV,bubble,detailRef,detailTitles,labelColumn,sectionCut,wrapToWidth,textWidth,n,type XY} from './sheetGraphics';
import {heavyHex,hexSide} from './heavyHex';
import type {ViewRender} from './detailSheet';

const inch=25.4;
const breakX=(x:number,y1:number,y2:number)=>{const m=(y1+y2)/2;return `<polyline class="annotation" points="${[[x,y1],[x,m-3],[x-3,m-1],[x+3,m+1],[x,m+3],[x,y2]].map(p=>`${n(p[0])},${n(p[1])}`).join(' ')}"/>`;};
const breakY=(y:number,x1:number,x2:number)=>{const m=(x1+x2)/2;return `<polyline class="annotation" points="${[[x1,y],[m-3,y],[m-1,y-3],[m+1,y+3],[m+3,y],[x2,y]].map(p=>`${n(p[0])},${n(p[1])}`).join(' ')}"/>`;};
/** Rounded slot outline along x. */
function slot(cx:number,cy:number,length:number,width:number,cls:string){const r=width/2,a=cx-length/2+r,b=cx+length/2-r;return `<path class="${cls}" d="M${n(a)},${n(cy-r)}L${n(b)},${n(cy-r)}A${n(r)},${n(r)} 0 0 1 ${n(b)},${n(cy+r)}L${n(a)},${n(cy+r)}A${n(r)},${n(r)} 0 0 1 ${n(a)},${n(cy-r)}Z"/>`;}

/**
 * Connection detail with bolted end bearings: a shared interior support with the
 * sliding right end of one bay and the locating left end of the next, in
 * elevation and in plan on the bottom flange.
 */
export function endBearingView(s:CalculationSnapshot):ViewRender{
 if(s.input.system==='continuous')return continuousBearingView(s);
 const p=s.input,d=p.details!,e=activeEndBearing(p)!,b=p.section,bs=d.bearing,g=endBearingGeometry(p,e),ss=simpleSupportInput(p);
 const dim=(v:number)=>drawingLength(v,p.units),size=(v:number)=>plateInches(v,p.units),db=e.bolts.diameter,gauge=e.bolts.gauge,gap=ss.endGap,hx=heavyHex(db);
 const wb=d.bracket?.enabled?d.bracket:undefined,twin=wb&&bracketArrangement(wb)==='twin-rib',seatT=wb?.seatThickness??bs.thickness,seatL=wb?.seatLength??(2*bs.length+gap+2*inch);
 const extent=gap/2+bs.length+2.5*inch,k=drawingScale(Math.min(.36,290/(2*extent),80/(b.tf+2.5*inch+bs.thickness+seatT+1.5*inch),125/Math.max(b.bf,bs.width)),p.units),kk=k.pointsPerMm;
 const X0=770,X=(x:number)=>X0+x*kk,yB=118+(b.tf+2.5*inch)*kk,Y=(h:number)=>yB-h*kk;
 const yTop=Y(b.tf+2.5*inch),yBearing=yB+bs.thickness*kk,ySeat=yBearing+seatT*kk;
 let svg='<g data-view="end-bearing">';
 // Grid at the shared support.
 svg+=line([X0,yTop-14],[X0,ySeat+20],'grid-line')+bubble(X0,yTop-22,'2');
 const ends=[{side:-1,role:'SLIDING'},{side:1,role:'LOCATING'}] as const;
 for(const {side} of ends){
  const near=side*gap/2,far=side*extent,lo=Math.min(X(near),X(far)),hi=Math.max(X(near),X(far));
  // Girder bottom flange and web stub, broken above and away from the support.
  svg+=line([lo,yB],[hi,yB],'runway-line')+line([lo,Y(b.tf)],[hi,Y(b.tf)],'runway-line')+line([X(near),yB],[X(near),yTop],'runway-line');
  svg+=breakX(X(far),yTop-4,yB+4)+breakY(yTop,lo,hi);
  // Bearing plate and bearing stiffener.
  const b0=near,b1=near+side*bs.length;svg+=rect(Math.min(X(b0),X(b1)),yB,bs.length*kk,bs.thickness*kk,'runway-line');
  const xs=near+side*g.stiffener;svg+=rect(X(xs)-bs.stiffenerThickness*kk/2,yTop,bs.stiffenerThickness*kk,Y(b.tf)-yTop,'runway-line');
  // Heavy hex bolts: heads above the flange, nuts below the seat; plate washers at the sliding end.
  for(const r of g.rows){
   const x=X(near+side*r),lift=side<0&&g.sleeve?(g.sleeve.length-b.tf)*kk:0;
   // Sleeved sliding bolts: the sleeve passes through the flange slot and holds the washer just clear of the flange.
   if(side<0&&g.sleeve)svg+=rect(x-g.sleeve.od*kk/2,yB-g.sleeve.length*kk,g.sleeve.od*kk,g.sleeve.length*kk,'hidden-line');
   if(side<0)svg+=rect(x-g.washer.length*kk/2,Y(b.tf)-lift-e.washerThickness*kk,g.washer.length*kk,e.washerThickness*kk,'runway-line');
   const top=Y(b.tf)-(side<0?e.washerThickness*kk+lift:0);
   svg+=hexSide(x,top,hx.corners*kk,hx.head*kk,-1)+hexSide(x,ySeat,hx.corners*kk,hx.nut*kk,1)+line([x,top-hx.head*kk-3],[x,ySeat+hx.nut*kk+3],'grid-line');
  }
 }
 // Bracket seat and ribs under the bearings.
 svg+=rect(X(-seatL/2),yBearing,seatL*kk,seatT*kk,wb?'runway-line':'reference-line');
 if(twin)for(const side of [-1,1]){const x=X(side*wb!.ribSpacing/2);svg+=rect(x-wb!.ribThickness*kk/2,ySeat,wb!.ribThickness*kk,1.5*inch*kk,'runway-line');}
 svg+=breakY(ySeat+1.5*inch*kk,X(-seatL/2),X(seatL/2));
 // Plan on the bottom flange: standard holes at the locating end, slots under plate washers at the sliding end.
 const Z0=ySeat+1.5*inch*kk+16+Math.max(b.bf,bs.width)/2*kk,Z=(z:number)=>Z0+z*kk;
 svg+='<g data-view="end-bearing-plan">';
 for(const {side} of ends){
  const near=side*gap/2,far=side*extent,lo=Math.min(X(near),X(far)),hi=Math.max(X(near),X(far));
  svg+=line([lo,Z(-b.bf/2)],[hi,Z(-b.bf/2)],'runway-line')+line([lo,Z(b.bf/2)],[hi,Z(b.bf/2)],'runway-line')+line([X(near),Z(-b.bf/2)],[X(near),Z(b.bf/2)],'runway-line')+breakX(X(far),Z(-b.bf/2)-4,Z(b.bf/2)+4);
  svg+=rect(lo,Z(-b.tw/2),hi-lo,b.tw*kk,'runway-line');
  const xs=near+side*g.stiffener;for(const zs of [-1,1])svg+=rect(X(xs)-bs.stiffenerThickness*kk/2,zs<0?Z(-b.tw/2-bs.stiffenerWidth):Z(b.tw/2),bs.stiffenerThickness*kk,bs.stiffenerWidth*kk,'runway-line');
  svg+=rect(Math.min(X(near),X(near+side*bs.length)),Z(-bs.width/2),bs.length*kk,bs.width*kk,'hidden-line');
  for(const r of g.rows)for(const zs of [-1,1]){
   const c:XY=[X(near+side*r),Z(zs*gauge/2)];
   if(side<0)svg+=rect(c[0]-g.washer.length*kk/2,c[1]-g.washer.width*kk/2,g.washer.length*kk,g.washer.width*kk,'runway-line')+slot(c[0],c[1],g.slot*kk,g.slotWidth*kk,'hidden-line')+(g.sleeve?circle(c[0],c[1],g.sleeve.od*kk/2,'hidden-line'):'');
   else svg+=circle(c[0],c[1],g.hole*kk/2,'runway-line');
   svg+=line([c[0]-db*kk*.7,c[1]],[c[0]+db*kk*.7,c[1]])+line([c[0],c[1]-db*kk*.7],[c[0],c[1]+db*kk*.7]);
  }
 }
 svg+=line([X0,Z(-b.bf/2)-10],[X0,Z(b.bf/2)+10],'grid-line');
 // Dimensions: bolt positions from each girder end, gauge, slot and girder gap.
 const zb=Z(Math.max(b.bf,bs.width)/2);
 // Baseline dimensions from the locating girder end; each label sits past the end of its own line. The bolt
 // extension lines start just clear of the holes.
 [[g.rows[0],'BOLTS'],[g.rows[1],'BOLTS']].forEach(([x,label],i)=>{const y=zb+9+9*i,xb=X(gap/2+(x as number));svg+=line([xb,Z(gauge/2)+g.hole*kk/2+2],[xb,zb])+dimH(X(gap/2),xb,zb,y,'')+text(xb+4,y+3,`${dim(x as number)} ${label}`,7.2);});
 const zt=Z(-Math.max(b.bf,bs.width)/2);svg+=dimH(X(-gap/2),X(gap/2),zt,zt-7,'')+text(X(gap/2)+4,zt-4,`${dim(gap)} GAP`,7.2);
 // Gauge beyond the locating end, so the sliding end carries the cut for the sliding bolt section.
 const gx=Math.max(X(extent)+22,X(gap/2+g.rows[1])+4+textWidth(`${dim(g.rows[1])} BOLTS`,7.2)+12);
 svg+=dimV(Z(-gauge/2),Z(gauge/2),X(gap/2+g.rows[1])+g.hole*kk/2+2,gx,dim(gauge));
 // Section along the runway through the far-side sliding bolts, looking outboard: x reads as on this plan.
 if(g.sleeve)svg+=sectionCut([X(-gap/2),Z(-gauge/2)],[X(-extent)-4,Z(-gauge/2)],[0,-1],detailTitles.slidingBolt,['b']);
 svg+='</g>';
 for(const {side,role} of ends){const cx=X(side*(gap/2+bs.length/2));svg+=text(cx,yTop-6,`${role} END`,8,'middle',700);}
 const lx=gx+34;
 // The sliding callout sits above the far-side bolt line, so its leader passes over the gauge dimension.
 const slideAt:XY=[X(-gap/2-g.rows[0])+g.washer.length*kk/2-3,Z(-gauge/2)-g.washer.width*kk/2],slideY=slideAt[1]-2;
 svg+=labelColumn([
  {at:[X(gap/2+g.stiffener)+bs.stiffenerThickness*kk/2,(yTop+Y(b.tf))/2],labels:['BEARING STIFFENERS',`SEE ${detailRef(detailTitles.bearing)}`]},
  {at:[X(gap/2+g.rows[1])+hx.corners*kk/2,Y(b.tf)-hx.head*kk/2],labels:[`LOCATING: 4 - ${size(db)} ${e.bolts.grade} SC,`,`PRETENSIONED; ${size(g.hole)} STD HOLES`]},
  {at:[X(gap/2+bs.length*.85),yB+bs.thickness*kk/2],labels:[`BEARING PL ${size(bs.thickness)} X ${size(bs.width)} X ${size(bs.length)}`]},
  {at:[X(seatL/2)-4,yBearing+seatT*kk/2],labels:wb?[`BRACKET SEAT PL ${size(seatT)}`,`SEE ${detailRef(usesExistingBracket(p)?detailTitles.existingBracket:detailTitles.weldedBracket)}`]:['BRACKET SEAT BY OTHERS:','MATCH HOLES, NUT CLEARANCE']}
 ],lx,Math.min(92,slideY-38-79),Math.min(200,slideY-38));
 svg+=labelColumn([
  {at:slideAt,labels:g.sleeve?[`SLIDING: 4 - ${size(db)} ${e.bolts.grade} PRETENSIONED AGAINST`,`STEEL SLEEVES ${size(g.sleeve.od)} OD X ${size(g.sleeve.length)}; ${size(g.slotWidth)} X`,`${size(g.slot)} SLOT IN FLANGE FOR ${size(g.travel)} EA. WAY`,`PL WASHER ${size(e.washerThickness)} X ${size(g.washer.width)} X ${size(g.washer.length)}`]:[`SLIDING: 4 - ${size(db)} ${e.bolts.grade} SNUG-TIGHT`,`+ JAM NUTS, DO NOT PRETENSION; ${size(g.hole)} X`,`${size(g.slot)} LSL IN FLANGE FOR ${size(g.travel)} EA. WAY`,`PL WASHER ${size(e.washerThickness)} X ${size(g.washer.width)} X ${size(g.washer.length)}`]}
 ],lx,slideY,slideY);
 return {svg:svg+'</g>',scale:k.label};
}

/**
 * Bolted bearings of a continuous girder, in elevation and in plan on the bottom flange: the sliding support at
 * the runway end (grid 1), with the girder ending at the grid and the bearing plate starting at the girder end,
 * and the locating support with the girder running through, in grid order. Notes state the other sliding grids.
 */
function continuousBearingView(s:CalculationSnapshot):ViewRender{
 const p=s.input,d=p.details!,e=activeEndBearing(p)!,b=p.section,bs=d.bearing,g=endBearingGeometry(p,e),all=continuousBearings(p);
 const dim=(v:number)=>drawingLength(v,p.units),size=(v:number)=>plateInches(v,p.units),db=e.bolts.diameter,gauge=e.bolts.gauge,hx=heavyHex(db);
 const wb=d.bracket?.enabled?d.bracket:undefined,twin=wb&&bracketArrangement(wb)==='twin-rib',seatT=wb?.seatThickness??bs.thickness,seatL=wb?.seatLength??(bs.length+2*inch);
 const locating=all.find(v=>v.role==='LOCATING')!,sliding=all.filter(v=>v.role==='SLIDING'),last=all.length,isEnd=(grid:number)=>grid===1||grid===last;
 const ends=sliding.filter(v=>isEnd(v.grid)),interior=sliding.filter(v=>!isEnd(v.grid)),shown=ends[0]??sliding[0];
 // Girder direction from the drawn sliding grid: +1 runs on from a left runway end, -1 from a right one, 0 runs through.
 const dir=shown.grid===1?1:shown.grid===last?-1:0;
 // At a runway end the bracket seat, centered on the grid, is broken just beyond the girder end.
 const half=Math.max(bs.length,seatL)/2+1.5*inch,sep=2*inch,endLength=bs.length+2.5*inch,seatOut=Math.min(seatL/2,1.5*inch),overhang=seatOut+.5*inch;
 // Extents along the runway from each grid: the girder through an interior support, or from its end at a runway end.
 const supports=[{grid:shown.grid,slide:true,dir,lo:dir>0?-overhang:dir<0?-endLength:-half,hi:dir>0?endLength:dir<0?overhang:half},{grid:locating.grid,slide:false,dir:0,lo:-half,hi:half}];
 const total=supports.reduce((a,v)=>a+v.hi-v.lo,sep);
 const k=drawingScale(Math.min(.36,290/total,80/(b.tf+2.5*inch+bs.thickness+seatT+1.5*inch),125/Math.max(b.bf,bs.width)),p.units),kk=k.pointsPerMm;
 const X0=770,left=X0-total/2*kk,at=[left-supports[0].lo*kk,left+(supports[0].hi-supports[0].lo+sep-supports[1].lo)*kk];
 const yB=118+(b.tf+2.5*inch)*kk,Y=(h:number)=>yB-h*kk,yTop=Y(b.tf+2.5*inch),yBearing=yB+bs.thickness*kk,ySeat=yBearing+seatT*kk,ySeatBot=ySeat+1.5*inch*kk;
 const Z0=ySeatBot+16+Math.max(b.bf,bs.width)/2*kk,Z=(z:number)=>Z0+z*kk,zb=Z(Math.max(b.bf,bs.width)/2);
 // Girder, bearing plate, stiffener and bolt rows from each grid: centered on an interior grid, from the girder end at a runway end.
 const frame=(dir:number)=>dir===0?{g0:-half,g1:half,p0:-bs.length/2,stiffener:0,rows:g.rows.map(r=>r-bs.length/2)}
  :dir>0?{g0:0,g1:endLength,p0:0,stiffener:g.stiffener,rows:g.rows}:{g0:-endLength,g1:0,p0:-bs.length,stiffener:-g.stiffener,rows:g.rows.map(r=>-r).reverse()};
 let svg='<g data-view="end-bearing">';
 supports.forEach((v,i)=>{
  const X=(x:number)=>at[i]+x*kk,f=frame(v.dir),lo=X(f.g0),hi=X(f.g1);
  // Grid, girder bottom flange and web stub, broken above and wherever the girder continues; a girder end at a runway end.
  const end=(x:number,y0:number,y1:number,here:boolean)=>here?line([x,y0+4],[x,y1-4],'runway-line'):breakX(x,y0,y1);
  svg+=line([at[i],yTop-14],[at[i],ySeat+20],'grid-line')+bubble(at[i],yTop-22,String(v.grid));
  svg+=line([lo,yB],[hi,yB],'runway-line')+line([lo,Y(b.tf)],[hi,Y(b.tf)],'runway-line');
  svg+=end(lo,yTop-4,yB+4,v.dir>0)+end(hi,yTop-4,yB+4,v.dir<0)+breakY(yTop,lo,hi);
  svg+=rect(X(f.p0),yB,bs.length*kk,bs.thickness*kk,'runway-line');
  svg+=rect(X(f.stiffener)-bs.stiffenerThickness*kk/2,yTop,bs.stiffenerThickness*kk,Y(b.tf)-yTop,'runway-line');
  for(const r of f.rows){
   const x=X(r),lift=v.slide&&g.sleeve?(g.sleeve.length-b.tf)*kk:0;
   if(v.slide&&g.sleeve)svg+=rect(x-g.sleeve.od*kk/2,yB-g.sleeve.length*kk,g.sleeve.od*kk,g.sleeve.length*kk,'hidden-line');
   if(v.slide)svg+=rect(x-g.washer.length*kk/2,Y(b.tf)-lift-e.washerThickness*kk,g.washer.length*kk,e.washerThickness*kk,'runway-line');
   const top=Y(b.tf)-(v.slide?e.washerThickness*kk+lift:0);
   svg+=hexSide(x,top,hx.corners*kk,hx.head*kk,-1)+hexSide(x,ySeat,hx.corners*kk,hx.nut*kk,1)+line([x,top-hx.head*kk-3],[x,ySeat+hx.nut*kk+3],'grid-line');
  }
  const s0=v.dir>0?-seatOut:-seatL/2,s1=v.dir<0?seatOut:seatL/2,seatCls=wb?'runway-line':'reference-line';
  svg+=line([X(s0),yBearing],[X(s1),yBearing],seatCls)+line([X(s0),ySeat],[X(s1),ySeat],seatCls);
  for(const [x,cut] of [[s0,v.dir>0],[s1,v.dir<0]] as const)svg+=cut?breakX(X(x),yBearing-3,ySeat+3):line([X(x),yBearing],[X(x),ySeat],seatCls);
  if(twin)for(const side of [-1,1]){const r=side*wb!.ribSpacing/2;if(r<s0||r>s1)continue;const x=X(r);svg+=rect(x-wb!.ribThickness*kk/2,ySeat,wb!.ribThickness*kk,1.5*inch*kk,'runway-line');}
  svg+=breakY(ySeatBot,X(s0),X(s1));
  svg+=text(at[i],yTop-40,v.slide?`SLIDING${v.dir?' END':''}, GRID ${v.grid}`:`LOCATING, GRID ${v.grid}`,8,'middle',700);
  // Plan on the bottom flange: standard holes at the locating support, slots under plate washers at the others.
  svg+='<g data-view="end-bearing-plan">';
  svg+=line([lo,Z(-b.bf/2)],[hi,Z(-b.bf/2)],'runway-line')+line([lo,Z(b.bf/2)],[hi,Z(b.bf/2)],'runway-line');
  svg+=(v.dir>0?line([lo,Z(-b.bf/2)],[lo,Z(b.bf/2)],'runway-line'):breakX(lo,Z(-b.bf/2)-4,Z(b.bf/2)+4))+(v.dir<0?line([hi,Z(-b.bf/2)],[hi,Z(b.bf/2)],'runway-line'):breakX(hi,Z(-b.bf/2)-4,Z(b.bf/2)+4));
  svg+=rect(lo,Z(-b.tw/2),hi-lo,b.tw*kk,'runway-line');
  for(const zs of [-1,1])svg+=rect(X(f.stiffener)-bs.stiffenerThickness*kk/2,zs<0?Z(-b.tw/2-bs.stiffenerWidth):Z(b.tw/2),bs.stiffenerThickness*kk,bs.stiffenerWidth*kk,'runway-line');
  svg+=rect(X(f.p0),Z(-bs.width/2),bs.length*kk,bs.width*kk,'hidden-line');
  for(const r of f.rows)for(const zs of [-1,1]){
   const c:XY=[X(r),Z(zs*gauge/2)];
   if(v.slide)svg+=rect(c[0]-g.washer.length*kk/2,c[1]-g.washer.width*kk/2,g.washer.length*kk,g.washer.width*kk,'runway-line')+slot(c[0],c[1],g.slot*kk,g.slotWidth*kk,'hidden-line')+(g.sleeve?circle(c[0],c[1],g.sleeve.od*kk/2,'hidden-line'):'');
   else svg+=circle(c[0],c[1],g.hole*kk/2,'runway-line');
   svg+=line([c[0]-db*kk*.7,c[1]],[c[0]+db*kk*.7,c[1]])+line([c[0],c[1]-db*kk*.7],[c[0],c[1]+db*kk*.7]);
  }
  svg+=line([at[i],Z(-b.bf/2)-10],[at[i],Z(b.bf/2)+6],'grid-line');
  // Section along the runway through the far-side sliding bolts, looking outboard: x reads as on this plan.
  if(v.slide&&g.sleeve)svg+=sectionCut([X(Math.max(...f.rows)),Z(-gauge/2)],[lo-4,Z(-gauge/2)],[0,-1],detailTitles.slidingBolt,['b']);
  svg+='</g>';
 });
 // Bolt rows, centered on the grid, and bearing plate at the locating support; the gauge beyond it.
 const L=at[1],XL=(x:number)=>L+x*kk,rows=frame(0).rows,XS=(x:number)=>at[0]+x*kk,slideRows=frame(dir).rows;
 svg+=dimH(XL(rows[0]),XL(rows[1]),zb,zb+20,dim(rows[1]-rows[0]))+dimH(XL(-bs.length/2),XL(bs.length/2),zb,zb+36,dim(bs.length));
 svg+=line([XL(rows[0]),Z(gauge/2)+g.hole*kk/2+2],[XL(rows[0]),zb])+line([XL(rows[1]),Z(gauge/2)+g.hole*kk/2+2],[XL(rows[1]),zb]);
 // First bolt row from the girder end at a left runway end.
 if(dir>0)svg+=line([XS(slideRows[0]),Z(gauge/2)+g.washer.width*kk/2+2],[XS(slideRows[0]),zb])+dimH(XS(0),XS(slideRows[0]),zb,zb+14,dim(slideRows[0]),'left');
 const gx=L+half*kk+18;
 svg+=dimV(Z(-gauge/2),Z(gauge/2),XL(rows[1])+g.hole*kk/2+2,gx,dim(gauge));
 // Every sliding support and the runway-end condition, stated under the plans.
 const grids=(v:{grid:number}[])=>v.map(x=>x.grid).join(', ').replace(/, (\d+)$/,' AND $1'),plural=(v:unknown[])=>v.length>1?'S':'';
 const other=ends.filter(v=>v!==shown);
 const note=[`SLIDING AT GRID${plural(sliding)} ${grids(sliding)}; LOCATING AT GRID ${locating.grid}.`,
  dir?`AT THE RUNWAY END${plural(ends)} THE GIRDER ENDS AT THE GRID AND THE BEARING PL STARTS AT THE GIRDER END, AS SHOWN AT GRID ${shown.grid}${other.length?`, OPPOSITE HAND AT GRID ${grids(other)}`:''}.`:'',
  interior.length&&dir?`AT GRID${plural(interior)} ${grids(interior)} THE BEARING PL IS CENTERED ON THE GRID AS AT GRID ${locating.grid}, WITH THE SLIDING BOLTS AS AT GRID ${shown.grid}.`:'',
  `BOLT ROWS ${dim(e.bolts.edge)} FROM THE BEARING PL ENDS.`].filter(Boolean).join(' ');
 const noteTop=zb+54;
 wrapToWidth(note,400,7.5).forEach((row,j)=>{svg+=text(X0,noteTop+j*10,row,7.5,'middle');});
 const lx=gx+30;
 // The sliding callout sits above the far-side bolt line, so its leader passes over the gauge dimension; the
 // locating column above it starts high enough to stay clear.
 const slideAt:XY=[XS(Math.max(...slideRows))+g.washer.length*kk/2-3,Z(-gauge/2)-g.washer.width*kk/2],slideY=slideAt[1]-2,colBottom=Math.min(ySeatBot+6,slideY-36);
 svg+=labelColumn([
  {at:[XL(0)+bs.stiffenerThickness*kk/2,(yTop+Y(b.tf))/2],labels:['BEARING STIFFENERS',`SEE ${detailRef(detailTitles.bearing)}`]},
  {at:[XL(rows[1])+hx.corners*kk/2,Y(b.tf)-hx.head*kk/2],labels:[`LOCATING: 4 - ${size(db)} ${e.bolts.grade} SC,`,`PRETENSIONED; ${size(g.hole)} STD HOLES`]},
  {at:[XL(bs.length*.4),yB+bs.thickness*kk/2],labels:[`BEARING PL ${size(bs.thickness)} X ${size(bs.width)} X ${size(bs.length)}`,'EACH SUPPORT']},
  {at:[XL(seatL/2)-4,yBearing+seatT*kk/2],labels:wb?[`BRACKET SEAT PL ${size(seatT)}`,`SEE ${detailRef(usesExistingBracket(p)?detailTitles.existingBracket:detailTitles.weldedBracket)}`]:['BRACKET SEAT BY OTHERS:','MATCH HOLES, NUT CLEARANCE']}
 ],lx,Math.min(yTop-30,colBottom-3*22-3*8),colBottom);
 svg+=labelColumn([
  {at:slideAt,labels:g.sleeve?[`SLIDING: 4 - ${size(db)} ${e.bolts.grade} PRETENSIONED AGAINST`,`STEEL SLEEVES ${size(g.sleeve.od)} OD X ${size(g.sleeve.length)}; ${size(g.slotWidth)} X`,`${size(g.slot)} SLOT IN FLANGE FOR ${size(g.travel)} EA. WAY`,`PL WASHER ${size(e.washerThickness)} X ${size(g.washer.width)} X ${size(g.washer.length)}`]:[`SLIDING: 4 - ${size(db)} ${e.bolts.grade} SNUG-TIGHT`,`+ JAM NUTS, DO NOT PRETENSION; ${size(g.hole)} X`,`${size(g.slot)} LSL IN FLANGE FOR ${size(g.travel)} EA. WAY`,`PL WASHER ${size(e.washerThickness)} X ${size(g.washer.width)} X ${size(g.washer.length)}`]}
 ],lx,slideY,slideY);
 return {svg:svg+'</g>',scale:k.label};
}

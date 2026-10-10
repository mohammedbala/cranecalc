import type {CalculationSnapshot} from '../engine/types';
import {activeEndBearing,endBearingGeometry} from '../engine/endBearing';
import {simpleSupportInput} from '../engine/simpleSupports';
import {bracketArrangement} from '../engine/connectionOptions';
import {usesExistingBracket} from '../engine/existingBracket';
import {drawingLength,plateInches} from './drawingFormat';
import {sheetDrawingScale as drawingScale,text,line,rect,circle,dimH,dimV,bubble,detailRef,detailTitles,labelColumn,n,type XY} from './sheetGraphics';
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
 const p=s.input,d=p.details!,e=activeEndBearing(p)!,b=p.section,bs=d.bearing,g=endBearingGeometry(p,e),ss=simpleSupportInput(p);
 const dim=(v:number)=>drawingLength(v,p.units),size=(v:number)=>plateInches(v,p.units),db=e.bolts.diameter,gauge=e.bolts.gauge,gap=ss.endGap;
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
  // Bolts: heads above the flange, nuts below the seat; plate washers at the sliding end.
  for(const r of g.rows){
   const x=X(near+side*r),hw=.8*db*kk,lift=side<0&&g.sleeve?(g.sleeve.length-b.tf)*kk:0;
   // Sleeved sliding bolts: the sleeve passes through the flange slot and holds the washer just clear of the flange.
   if(side<0&&g.sleeve)svg+=rect(x-g.sleeve.od*kk/2,yB-g.sleeve.length*kk,g.sleeve.od*kk,g.sleeve.length*kk,'hidden-line');
   if(side<0)svg+=rect(x-g.washer.length*kk/2,Y(b.tf)-lift-e.washerThickness*kk,g.washer.length*kk,e.washerThickness*kk,'runway-line');
   const top=Y(b.tf)-(side<0?e.washerThickness*kk+lift:0);
   svg+=rect(x-hw,top-.65*db*kk,2*hw,.65*db*kk,'runway-line')+rect(x-hw,ySeat,2*hw,.9*db*kk,'runway-line')+line([x,top-.65*db*kk-3],[x,ySeat+.9*db*kk+3],'grid-line');
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
 // Baseline dimensions from the locating girder end; each label sits past the end of its own line.
 [[g.rows[0],'BOLTS'],[g.rows[1],'BOLTS']].forEach(([x,label],i)=>{const y=zb+9+9*i;svg+=dimH(X(gap/2),X(gap/2+(x as number)),zb,y,'')+text(X(gap/2+(x as number))+4,y+3,`${dim(x as number)} ${label}`,7.2);});
 const zt=Z(-Math.max(b.bf,bs.width)/2);svg+=dimH(X(-gap/2),X(gap/2),zt,zt-7,'')+text(X(gap/2)+4,zt-4,`${dim(gap)} GAP`,7.2);
 svg+=dimV(Z(-gauge/2),Z(gauge/2),X(-gap/2-g.rows[1]),X(-extent)-24,dim(gauge));
 svg+='</g>';
 for(const {side,role} of ends){const cx=X(side*(gap/2+bs.length/2));svg+=text(cx,yTop-6,`${role} END`,8,'middle',700);}
 const lx=X(extent)+44;
 svg+=labelColumn([
  {at:[X(gap/2+g.stiffener)+bs.stiffenerThickness*kk/2,(yTop+Y(b.tf))/2],labels:['BEARING STIFFENERS',`SEE ${detailRef(detailTitles.bearing)}`]},
  {at:[X(gap/2+g.rows[1])+.8*db*kk,Y(b.tf)-.3*db*kk],labels:[`LOCATING: 4 - ${size(db)} ${e.bolts.grade} SC,`,`PRETENSIONED; ${size(g.hole)} STD HOLES`]},
  {at:[X(gap/2+bs.length*.85),yB+bs.thickness*kk/2],labels:[`BEARING PL ${size(bs.thickness)} X ${size(bs.width)} X ${size(bs.length)}`]},
  {at:[X(seatL/2)-4,yBearing+seatT*kk/2],labels:wb?[`BRACKET SEAT PL ${size(seatT)}`,`SEE ${detailRef(usesExistingBracket(p)?detailTitles.existingBracket:detailTitles.weldedBracket)}`]:['BRACKET SEAT BY OTHERS:','MATCH HOLES, NUT CLEARANCE']}
 ],lx,92,200);
 svg+=labelColumn([
  {at:[X(-gap/2-g.rows[0])+g.washer.length*kk/2,Z(-gauge/2)],labels:g.sleeve?[`SLIDING: 4 - ${size(db)} ${e.bolts.grade} PRETENSIONED AGAINST`,`STEEL SLEEVES ${size(g.sleeve.od)} OD X ${size(g.sleeve.length)}; ${size(g.slotWidth)} X`,`${size(g.slot)} SLOT IN FLANGE FOR ${size(g.travel)} EA. WAY`,`PL WASHER ${size(e.washerThickness)} X ${size(g.washer.width)} X ${size(g.washer.length)}`]:[`SLIDING: 4 - ${size(db)} ${e.bolts.grade} SNUG-TIGHT`,`+ JAM NUTS, DO NOT PRETENSION; ${size(g.hole)} X`,`${size(g.slot)} LSL IN FLANGE FOR ${size(g.travel)} EA. WAY`,`PL WASHER ${size(e.washerThickness)} X ${size(g.washer.width)} X ${size(g.washer.length)}`]}
 ],lx,252,252);
 return {svg:svg+'</g>',scale:k.label};
}

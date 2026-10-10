import type {CalculationSnapshot} from '../engine/types';
import {activeEndBearing,endBearingGeometry} from '../engine/endBearing';
import {slidingBolts} from '../engine/endBearingInputs';
import {usesExistingBracket} from '../engine/existingBracket';
import {drawingLength,plateInches} from './drawingFormat';
import {sheetDrawingScale as drawingScale,line,rect,text,dimH,dimV,breakLine,labelColumn,wrappedText,detailRef,detailTitles,bearingBoltsTitle,type XY} from './sheetGraphics';
import type {DetailView} from './detailSheet';

const inch=25.4;
/**
 * Section along the runway through one sleeved sliding bearing bolt: the sleeve passes through the slot in
 * the girder flange and stands on the bearing plate, so the bolt is pretensioned against the sleeve and the
 * plate washer holds the flange down without clamping it.
 */
export function slidingBoltView(s:CalculationSnapshot):DetailView|undefined{
 const p=s.input,e=activeEndBearing(p),d=p.details;if(!e||!d)return undefined;
 const g=endBearingGeometry(p,e);if(!g.sleeve)return undefined;
 return {title:detailTitles.slidingBolt,render:()=>{
  const b=p.section,bs=d.bearing,sl=slidingBolts(e),db=e.bolts.diameter,wb=d.bracket?.enabled?d.bracket:undefined,seatT=wb?.seatThickness??bs.thickness;
  const size=(v:number)=>plateInches(v,p.units),dim=(v:number)=>drawingLength(v,p.units);
  const nutH=db,nutW=1.5*db+inch/8,washer={t:inch*5/32,od:2*db+inch/8};
  const half=g.washer.length/2+1.25*inch,stack=nutH+washer.t+e.washerThickness+g.sleeve!.length+bs.thickness+seatT+washer.t+nutH;
  const sc=drawingScale(Math.min(1.45,222/stack,300/(2*half)),p.units),k=sc.pointsPerMm;
  const cx=240,yBear=150,Y=(h:number)=>yBear-h*k,X=(x:number)=>cx+x*k;
  const yFlange=Y(0),yFlangeTop=Y(b.tf),ySleeveTop=Y(g.sleeve!.length),yWasher=ySleeveTop-e.washerThickness*k;
  const yBearBot=yBear+bs.thickness*k,ySeatBot=yBearBot+seatT*k;
  let svg='<g data-view="sliding-bolt">';
  // Girder bottom flange, broken both ends, with the slot cut through it.
  const slot=g.slot/2;
  for(const side of [-1,1]){
   const near=X(side*slot),far=X(side*half);
   svg+=line([near,yFlangeTop],[far,yFlangeTop],'runway-line')+line([near,yFlange],[far,yFlange],'runway-line')+line([near,yFlangeTop],[near,yFlange],'runway-line');
   svg+=breakLine([far,yFlangeTop-5],[far,yFlange+5]);
  }
  // Bearing plate and bracket seat, broken both ends, each with a standard hole.
  for(const [top,t,cls] of [[yBear,bs.thickness,'runway-line'],[yBearBot,seatT,wb?'runway-line':'reference-line']] as const)for(const side of [-1,1]){
   const near=X(side*g.hole/2),far=X(side*(half-.25*inch));
   svg+=line([near,top],[far,top],cls)+line([near,top+t*k],[far,top+t*k],cls)+line([near,top],[near,top+t*k],cls);
   svg+=breakLine([far,top-3],[far,top+t*k+3]);
  }
  // Sleeve walls in the slot, standing on the bearing plate.
  const od=g.sleeve!.od,wall=sl.wall;
  for(const side of [-1,1])svg+=rect(Math.min(X(side*od/2),X(side*(od/2-wall))),ySleeveTop,wall*k,yBear-ySleeveTop,'runway-line');
  // Plate washer on the sleeve, F436 washers and heavy hex nuts, bolt shank through the stack.
  svg+=rect(X(-g.washer.length/2),yWasher,g.washer.length*k,e.washerThickness*k,'runway-line');
  const top=yWasher-washer.t*k,bottom=ySeatBot+washer.t*k;
  svg+=rect(X(-washer.od/2),top,washer.od*k,washer.t*k,'runway-line')+rect(X(-nutW/2),top-nutH*k,nutW*k,nutH*k,'runway-line');
  svg+=rect(X(-washer.od/2),ySeatBot,washer.od*k,washer.t*k,'runway-line')+rect(X(-nutW/2),bottom,nutW*k,nutH*k,'runway-line');
  const slotDim=Y(b.tf)-14-nutH*k-washer.t*k-e.washerThickness*k;
  // Bolt shank, not sectioned: beyond each nut and through the plies between the washers.
  const tail=.35*db*k,shank=(y0:number,y1:number)=>rect(X(-db/2),y0,db*k,y1-y0,'runway-line');
  svg+=shank(top-nutH*k-tail,top-nutH*k)+shank(top,ySeatBot)+shank(bottom+nutH*k,bottom+nutH*k+tail)+line([cx,Math.max(top-nutH*k-tail-8,slotDim+3)],[cx,bottom+nutH*k+tail+8],'grid-line');
  // Travel: the slot clears the sleeve by the sliding allowance each way.
  svg+=dimH(X(-slot),X(slot),yFlangeTop,slotDim,`SLOT ${size(g.slotWidth)} X ${size(g.slot)}`);
  svg+=dimH(X(-slot),X(-od/2),yFlange,ySeatBot+washer.t*k+nutH*k+20,`${size(g.travel)} TRAVEL`,'left');
  svg+=dimV(yWasher+e.washerThickness*k,yFlangeTop,X(-g.washer.length/2)-2,X(-half)-14,`${size(sl.clearance)} CLR.`);
  const lx=X(half)+44,at=(x:number,y:number):XY=>[x,y];
  const labels=[
   {at:at(X(nutW/2),top-nutH*k/2),labels:['HEAVY HEX NUT AND F436 WASHER','EACH END OF BOLT']},
   {at:at(X(g.washer.length/2)-3,yWasher+e.washerThickness*k/2),labels:[`PL WASHER ${size(e.washerThickness)} X ${size(g.washer.width)} X ${size(g.washer.length)}`]},
   {at:at(X(od/2),(ySleeveTop+yBear)/2-4),labels:[`STEEL SLEEVE ${size(od)} OD X ${size(g.hole)} BORE`,`X ${size(g.sleeve!.length)} (FLANGE + ${size(sl.clearance)}), FY 50 KSI`]},
   {at:at(X(half*.7),yFlangeTop+2),labels:[`GIRDER BOTTOM FLANGE, ${size(b.tf)}`,`SLOTTED; SEE ${detailRef(bearingBoltsTitle(p))}`]},
   {at:at(X(half*.75),yBear+bs.thickness*k/2),labels:[`BEARING PL ${size(bs.thickness)}, ${size(g.hole)} STD HOLE`]},
   {at:at(X(half*.75),yBearBot+seatT*k/2),labels:wb?[`BRACKET SEAT PL ${size(seatT)}`,`SEE ${detailRef(usesExistingBracket(p)?detailTitles.existingBracket:detailTitles.weldedBracket)}`]:['BRACKET SEAT BY OTHERS']},
  ],labelBottom=top-nutH*k+labels.reduce((a,v)=>a+v.labels.length*11+8,-8);
  svg+=labelColumn(labels,lx,top-nutH*k,Math.max(bottom+nutH*k,labelBottom));
  const note=wrappedText(cx-160,Math.max(bottom+nutH*k+36,labelBottom+18),`${size(db)} ${e.bolts.grade} BOLT PRETENSIONED AGAINST THE SLEEVE. THE PLATE WASHER CLEARS THE FLANGE, SO THE FLANGE SLIDES ${size(g.travel)} EACH WAY UNCLAMPED. CENTER THE SLEEVE IN THE SLOT AT ERECTION. TYP. EACH SLIDING BOLT${p.system==='continuous'?' AT THE SLIDING SUPPORTS':''}.`,118,8,11);
  return {svg:svg+note.svg+'</g>',scale:sc.label};
 }};
}

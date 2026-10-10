import type {CalculationSnapshot} from '../engine/types';
import {activeEndBearing,endBearingGeometry} from '../engine/endBearing';
import {slidingBolts} from '../engine/endBearingInputs';
import {usesExistingBracket} from '../engine/existingBracket';
import {format} from '../engine/units';
import {plateInches} from './drawingFormat';
import {sheetDrawingScale as drawingScale,line,rect,dimH,breakLine,labelColumn,multiLeader,labelCaps,textWidth,wrappedText,detailRef,detailTitles,bearingBoltsTitle,type XY} from './sheetGraphics';
import {heavyHex,hexSide,boltLength} from './heavyHex';
import type {DetailView} from './detailSheet';

const inch=25.4;
/**
 * Section along the runway through one sleeved sliding bearing bolt: the sleeve passes through the slot in
 * the girder flange and stands on the bearing plate, so the bolt is pretensioned against the sleeve and the
 * plate washer holds the flange down without clamping it. The bolt is a headed F3125 bolt set from above,
 * head on the plate washer, with its nut and F436 washer below the seat as the turned element.
 */
export function slidingBoltView(s:CalculationSnapshot):DetailView|undefined{
 const p=s.input,e=activeEndBearing(p),d=p.details;if(!e||!d)return undefined;
 const g=endBearingGeometry(p,e);if(!g.sleeve)return undefined;
 return {title:detailTitles.slidingBolt,render:()=>{
  const b=p.section,bs=d.bearing,sl=slidingBolts(e),db=e.bolts.diameter,wb=d.bracket?.enabled?d.bracket:undefined,seatT=wb?.seatThickness??bs.thickness;
  const size=(v:number)=>plateInches(v,p.units),hx=heavyHex(db),washer=hx.washer,sleeve=g.sleeve!;
  // Grip: plate washer, sleeve, bearing plate and seat, from under the head to under the F436 washer.
  const plies=e.washerThickness+sleeve.length+bs.thickness,grip=wb?`LENGTH ${size(boltLength(db,plies+seatT,p.units))}, GRIP ${size(plies+seatT)}`:`LENGTH TO SUIT SEAT, GRIP = ${size(plies)} + SEAT`;
  const tail=.35*db,half=g.washer.length/2+1.25*inch,stack=hx.head+e.washerThickness+sleeve.length+bs.thickness+seatT+washer.t+hx.nut+tail;
  const sc=drawingScale(Math.min(1.45,222/stack,300/(2*half)),p.units),k=sc.pointsPerMm;
  const cx=240,yBear=150,Y=(h:number)=>yBear-h*k,X=(x:number)=>cx+x*k;
  const yFlange=Y(0),yFlangeTop=Y(b.tf),ySleeveTop=Y(sleeve.length),yWasher=ySleeveTop-e.washerThickness*k,yHead=yWasher-hx.head*k;
  const yBearBot=yBear+bs.thickness*k,ySeatBot=yBearBot+seatT*k,yNut=ySeatBot+washer.t*k,yEnd=yNut+hx.nut*k;
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
  const od=sleeve.od,wall=sl.wall;
  for(const side of [-1,1])svg+=rect(Math.min(X(side*od/2),X(side*(od/2-wall))),ySleeveTop,wall*k,yBear-ySleeveTop,'runway-line');
  // Plate washer on the sleeve and the F436 washer below the seat, cut at their holes.
  for(const side of [-1,1]){
   const piece=(r0:number,r1:number,y:number,t:number)=>rect(Math.min(X(side*r0),X(side*r1)),y,Math.abs(r1-r0)*k,t*k,'runway-line');
   svg+=piece(g.hole/2,g.washer.length/2,yWasher,e.washerThickness)+piece(g.hole/2,washer.od/2,ySeatBot,washer.t);
  }
  // Heavy hex head on the plate washer, heavy hex nut below the F436 washer; shank through the plies and past the nut.
  svg+=hexSide(cx,yWasher,hx.corners*k,hx.head*k,-1)+hexSide(cx,yNut,hx.corners*k,hx.nut*k,1);
  const shank=(y0:number,y1:number)=>rect(X(-db/2),y0,db*k,y1-y0,'runway-line');
  const slotDim=yHead-14;
  svg+=shank(yWasher,yNut)+shank(yEnd,yEnd+tail*k)+line([cx,Math.max(yHead-8,slotDim+3)],[cx,yEnd+tail*k+8],'grid-line');
  // Slot in the flange: the sleeve slides the travel each way inside it.
  svg+=dimH(X(-slot),X(slot),yWasher-2,slotDim,`SLOT ${size(g.slotWidth)} X ${size(g.slot)}`);
  // The plate washer stands clear of the flange by the sleeve projection: a leader note for the small clearance.
  {const label=`${size(sl.clearance)} CLR.`,w=textWidth(labelCaps(label),8.5);
   svg+=multiLeader([[X(-g.washer.length/2)+4,(ySleeveTop+yFlangeTop)/2]],[X(-half)-18-w,yWasher-8],[label]);}
  const lx=X(half)+44,at=(x:number,y:number):XY=>[x,y],Fy=format(d.material.Fy,'stress',p.units,0);
  const labels=[
   {at:at(X(hx.corners/2),yHead+hx.head*k/2),labels:[`${size(db)} HEAVY HEX BOLT, ASTM F3125 GR ${e.bolts.grade},`,'HEAD ON PL WASHER',grip]},
   {at:at(X(g.washer.length/2)-3,yWasher+e.washerThickness*k/2),labels:[`PL WASHER ${size(e.washerThickness)} X ${size(g.washer.width)} X ${size(g.washer.length)}`]},
   {at:at(X(od/2),(ySleeveTop+yBear)/2-4),labels:[`STEEL SLEEVE ${size(od)} OD X ${size(g.hole)} BORE`,`X ${size(sleeve.length)} (FLANGE + ${size(sl.clearance)}), FY ${Fy}`]},
   {at:at(X(half*.7),yFlangeTop+2),labels:[`GIRDER BOTTOM FLANGE, ${size(b.tf)}`,`SLOTTED; SEE ${detailRef(bearingBoltsTitle(p))}`]},
   {at:at(X(half*.75),yBear+bs.thickness*k/2),labels:[`BEARING PL ${size(bs.thickness)}, ${size(g.hole)} STD HOLE`]},
   {at:at(X(half*.75),yBearBot+seatT*k/2),labels:wb?[`BRACKET SEAT PL ${size(seatT)}`,`SEE ${detailRef(usesExistingBracket(p)?detailTitles.existingBracket:detailTitles.weldedBracket)}`]:['BRACKET SEAT BY OTHERS']},
   {at:at(X(hx.corners/2),yNut+hx.nut*k/2),labels:['HEAVY HEX NUT, A563 DH, AND F436','WASHER BELOW SEAT: TURN THE NUT']}
  ],labelBottom=yHead+labels.reduce((a,v)=>a+v.labels.length*11+8,-8);
  svg+=labelColumn(labels,lx,yHead,Math.max(yEnd+tail*k,labelBottom));
  const note=wrappedText(cx-160,Math.max(yEnd+tail*k+28,labelBottom+18),`SET THE SLEEVE AND PLATE WASHER, INSERT THE BOLT FROM ABOVE AND PRETENSION IT AGAINST THE SLEEVE BY TURNING THE NUT, HEAD HELD. THE PLATE WASHER CLEARS THE FLANGE, SO THE FLANGE SLIDES ${size(g.travel)} EACH WAY IN THE SLOT UNCLAMPED. CENTER THE SLEEVE IN THE SLOT AT ERECTION. TYP. EACH SLIDING BOLT${p.system==='continuous'?' AT THE SLIDING SUPPORTS':''}.`,118,8,11);
  return {svg:svg+note.svg+'</g>',scale:sc.label};
 }};
}

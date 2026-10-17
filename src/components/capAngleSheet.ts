import {elementSummary,inElements,summaryNote,calculationRef} from './sheetRatios';
import {viewConflict,conflictView} from './detailHolds';
import type {CalculationSnapshot} from '../engine/types';
import {capAngleGeometry,boltHardware,capAngleStiffenerGeometry,type CapAngleGeometry} from '../engine/capAngle';
import {capAngleResult} from '../engine/capAngleTie';
import {clipGeometry,clipOutline,railPadThickness} from '../engine/railSeat';
import {supportColumn} from '../engine/drawingData';
import {capChannelProfile} from '../engine/channelProfile';
import {sheetDrawingScale as drawingScale,line,rect,text,dimH,dimV,multiLeader,breakLine,textWidth,labelCaps,bubble,n,detailRef,capChannelSection,capAngleTitles,type XY} from './sheetGraphics';
import {tieSize,tieDim,weldLength,weldLeader,type Weld} from './flangeTieSheet';
import {heading,numbered,paragraph,type Style} from './noteBlocks';
import type {DetailTopic,ViewRender} from './detailSheet';

/** Detail titles of the cap tieback angle; each is drawn by one detail. */
export {capAngleTitles};
type Callout={at:XY;labels:string[];weld?:Weld;points?:XY[]};
const calloutHeight=(v:Callout)=>(v.weld?17:0)+v.labels.length*11;
/** A column of callouts from `top`, ordered by target height so the leaders do not cross. */
function callouts(items:Callout[],x:number,top:number){
 const sorted=[...items].sort((a,b)=>a.at[1]-b.at[1]);let y=top,svg='';
 for(const v of sorted){svg+=v.weld?weldLeader([v.at],[x,y+3],v.weld,v.labels):multiLeader(v.points??[v.at],[x,y],v.labels);y+=calloutHeight(v)+8;}
 return {svg,bottom:y-8};
}
const columnHeight=(items:Callout[])=>items.reduce((a,v)=>a+calloutHeight(v),0)+8*Math.max(0,items.length-1);
/** A closed outline through the given points. */
const poly=(pts:XY[],cls='runway-line')=>`<path class="${cls}" d="M${pts.map(p=>`${n(p[0])},${n(p[1])}`).join('L')}Z"/>`;
/** Whether the cap bolt nuts need a beveled washer: the RCSC Specification calls for one where a bolted face slopes more than 1:20 (C shape flanges slope 1:6). */
export const beveledCapWasher=(b:Parameters<typeof capChannelProfile>[0])=>capChannelProfile(b,1).slope>1/20+1e-9;
// The engine's capBoltSeat (src/engine/capAngle.ts) uses the same 1:20 rule for the washer in the checks and hardware envelopes.
/** The column the end plates bolt to, as drawn and named. */
function tieColumn(s:CalculationSnapshot,g:CapAngleGeometry){
 const col=g.column.receiver,sc=supportColumn(s.input);
 return {col,isNew:sc.isNew,cls:sc.isNew?'runway-line':'reference-line',label:sc.isNew?sc.name:col?`EXISTING ${col.shape??'COLUMN'}${col.shape?' COLUMN':''}`:'COLUMN BY OTHERS',tf:col?.tf??19.05};
}

/** Section at a support looking along the runway: the girder with cap, rail and rail clip, the cap angle, tie plate, end plate, shims and column flange. */
/** Whether two girder ends share a column, so the plan of the ties at it is drawn (and dimensions the bolt pitches). */
const sharedColumn=(g:CapAngleGeometry)=>g.stations.some(v=>g.stations.some(o=>o!==v&&Math.abs(o.station-v.station)<1e-6));
/** The cap tieback cannot be built as dimensioned: a failing fit or clearance rule, or a geometry conflict among its checks. */
export const capAngleConflict=(s:CalculationSnapshot)=>viewConflict(s,{fits:/^cap-angle-.*-(fit|clear|clearance)$/,checks:/^cap-angle-/});
export function capAngleSection(s:CalculationSnapshot):ViewRender{
 const conflict=capAngleConflict(s);if(conflict)return conflictView(conflict);
 const p=s.input,u=p.units,g=capAngleGeometry(p)!,d=p.details!,b=p.section,c=g.input,res=capAngleResult(s);
 const sz=(v:number)=>tieSize(v,u),dim=(v:number)=>tieDim(v,u),tc=tieColumn(s,g);
 // The bolt pitches along the runway are dimensioned on the plan; without a plan the callouts give them.
 const pitch=(v:number)=>sharedColumn(g)?'':` AT ${sz(v)}`;
 const rail=d.rail,pad=railPadThickness(p),clip=clipGeometry(rail,pad),railTop=pad+(p.aist?.railDepth??p.railHeight);
 const yL=-rail.baseWidth/2-12.7,colBack=g.face+tc.tf,hw=boltHardware(g.column.diameter);
 // The tie plate is short and dimensioned across its length: drawn whole, never broken.
 const yR=colBack+hw.washer.t+hw.nut+hw.stick+12.7;
 const span=yR-yL,scale=drawingScale(Math.min(.72,380/span),u),k=scale.pointsPerMm;
 const x0=40,X=(y:number)=>x0+(y-yL)*k,Z=(z:number)=>150-z*k;
 let svg='<g data-view="cap-angle-section">';
 // Girder: W top flange and web (broken), cap channel web and column-side flange; rail, pad and rail clip (context).
 const wTop=-b.capTw,wBot=wTop-b.tf,webEnd=Math.min(-b.capDepth,g.endPlate.z0,-g.dv)-25.4;
 svg+=poly([[X(yL),Z(wTop)],[X(b.bf/2),Z(wTop)],[X(b.bf/2),Z(wBot)],[X(b.tw/2),Z(wBot)],[X(b.tw/2),Z(webEnd)],[X(-b.tw/2),Z(webEnd)],[X(-b.tw/2),Z(wBot)],[X(yL),Z(wBot)]]);
 // The cap channel in true section (2:12 sloped flange, root fillet), broken left of the rail.
 const chan=capChannelProfile(b),channelFace=chan.innerFace;
 svg+=poly([[X(yL),Z(0)],...chan.side.map(([x,z]):XY=>[X(x),Z(z+wTop)]),[X(yL),Z(wTop)]]);
 svg+=breakLine([X(yL)-4,Z(0)-2],[X(yL)-4,Z(wBot)+2])+breakLine([X(-b.tw/2)-4,Z(webEnd)+4],[X(b.tw/2)+4,Z(webEnd)+4]);
 const rb=rail.baseWidth/2,rt=rail.webThickness/2,rh=rail.headWidth/2,z1=pad+rail.baseThickness,z3=railTop-rail.headThickness;
 if(pad)svg+=rect(X(-rb),Z(pad),2*rb*k,pad*k,'runway-line');
 svg+=poly([[X(-rb),Z(pad)],[X(rb),Z(pad)],[X(rb),Z(z1)],[X(rt),Z(z1)],[X(rt),Z(z3)],[X(rh),Z(z3)],[X(rh),Z(railTop)],[X(-rh),Z(railTop)],[X(-rh),Z(z3)],[X(-rt),Z(z3)],[X(-rt),Z(z1)],[X(-rb),Z(z1)]]);
 svg+=poly(clipOutline(clip,1).map(([y,z]):XY=>[X(y),Z(z)]));
 // Cap angle: short leg on the channel flange, long leg level with the top of the cap.
 svg+=poly([[X(g.y0),Z(0)],[X(g.toe),Z(0)],[X(g.toe),Z(-g.ta)],[X(g.y0+g.ta),Z(-g.ta)],[X(g.y0+g.ta),Z(-g.dv)],[X(g.y0),Z(-g.dv)]]);
 // Cap bolt: plate washer and head outside (the sleeve and slot hidden); F436 washer and nut inside the channel. On a
 // flange sloped steeper than 1:20 the washer is an F436 beveled washer (1:6, 5/16 in mean thickness) seated on the slope.
 const cb=g.cap,ch=boltHardware(cb.diameter),zc=cb.z,outer=g.y0+g.ta+(cb.sleeve?c.sleeveClearance:0),headEnd=outer+cb.washer.thickness+ch.head;
 const face=(z:number)=>channelFace(z+b.capTw),inner=face(zc),wt=g.cap.seat.washer.t,wr=g.cap.seat.washer.width/2;
 svg+=rect(X(outer),Z(zc+cb.washer.height/2),cb.washer.thickness*k,cb.washer.height*k,'runway-line');
 svg+=rect(X(outer+cb.washer.thickness),Z(zc+ch.corners/2),ch.head*k,ch.corners*k,'runway-line');
 svg+=poly([[X(face(zc+wr)),Z(zc+wr)],[X(inner-wt),Z(zc+wr)],[X(inner-wt),Z(zc-wr)],[X(face(zc-wr)),Z(zc-wr)]])+rect(X(inner-wt-ch.nut),Z(zc+ch.corners/2),ch.nut*k,ch.corners*k,'runway-line');
 svg+=rect(X(inner-wt-ch.nut-ch.stick),Z(zc+cb.diameter/2),ch.stick*k,cb.diameter*k,'runway-line');
 for(const e of [-1,1])svg+=line([X(inner),Z(zc+e*cb.diameter/2)],[X(outer+cb.washer.thickness),Z(zc+e*cb.diameter/2)],'hidden-line')+line([X(g.y0),Z(zc+e*cb.slotWidth/2)],[X(g.y0+g.ta),Z(zc+e*cb.slotWidth/2)],'hidden-line');
 // Tie plate on the long leg; lap bolt heads on the plate, nuts under the leg.
 const tp=g.plate.thickness,lh=boltHardware(g.lap.diameter),yl=g.lap.y,lapTop=tp+lh.washer.t+lh.head,lapBottom=-g.ta-lh.washer.t-lh.nut-lh.stick;
 svg+=rect(X(g.plate.start),Z(tp),(g.plate.end-g.plate.start)*k,tp*k,'runway-line');
 svg+=rect(X(yl-lh.washer.od/2),Z(tp+lh.washer.t),lh.washer.od*k,lh.washer.t*k,'runway-line')+rect(X(yl-lh.corners/2),Z(lapTop),lh.corners*k,lh.head*k,'runway-line');
 svg+=rect(X(yl-lh.washer.od/2),Z(-g.ta),lh.washer.od*k,lh.washer.t*k,'runway-line')+rect(X(yl-lh.corners/2),Z(-g.ta-lh.washer.t),lh.corners*k,lh.nut*k,'runway-line');
 svg+=rect(X(yl-g.lap.diameter/2),Z(-g.ta-lh.washer.t-lh.nut),g.lap.diameter*k,lh.stick*k,'runway-line');
 for(const e of [-1,1])svg+=line([X(yl+e*g.lap.diameter/2),Z(tp)],[X(yl+e*g.lap.diameter/2),Z(-g.ta)],'hidden-line');
 // End plate, shims and the column flange (existing: dashed), broken above and below.
 const ep=g.endPlate,fz0=ep.z0-31.75,fz1=ep.z1+31.75;
 svg+=rect(X(ep.y0),Z(ep.z1),ep.thickness*k,ep.height*k,'runway-line')+rect(X(g.shim.y0),Z(ep.z1),(g.shim.y1-g.shim.y0)*k,ep.height*k,'runway-line');
 svg+=line([X(g.face),Z(fz1)],[X(g.face),Z(fz0)],tc.cls)+line([X(colBack),Z(fz1)],[X(colBack),Z(fz0)],tc.cls);
 svg+=breakLine([X(g.face)-4,Z(fz1)],[X(colBack)+4,Z(fz1)])+breakLine([X(g.face)-4,Z(fz0)],[X(colBack)+4,Z(fz0)]);
 // Column bolts: heads on the end plate, nuts inside the column flange.
 const cl=g.column,nutEnd=colBack+hw.washer.t+hw.nut+hw.stick;
 for(const zb of cl.zs){
  svg+=rect(X(ep.y0-hw.washer.t),Z(zb+hw.washer.od/2),hw.washer.t*k,hw.washer.od*k,'runway-line')+rect(X(ep.y0-hw.washer.t-hw.head),Z(zb+hw.corners/2),hw.head*k,hw.corners*k,'runway-line');
  svg+=rect(X(colBack),Z(zb+hw.washer.od/2),hw.washer.t*k,hw.washer.od*k,'runway-line')+rect(X(colBack+hw.washer.t),Z(zb+hw.corners/2),hw.nut*k,hw.corners*k,'runway-line')+rect(X(colBack+hw.washer.t+hw.nut),Z(zb+cl.diameter/2),hw.stick*k,cl.diameter*k,'runway-line');
  for(const e of [-1,1])svg+=line([X(ep.y0),Z(zb+e*cl.diameter/2)],[X(colBack),Z(zb+e*cl.diameter/2)],'hidden-line');
  // A released end plate: the vertical slot ends in the end plate (hidden), the sleeve through it.
  if(cl.slot)for(const e of [-1,1])svg+=line([X(ep.y0),Z(zb+e*cl.slot.length/2)],[X(ep.y1),Z(zb+e*cl.slot.length/2)],'hidden-line');
 }
 // Shop fillets, end plate to tie plate, on both faces of the tie plate.
 const w=g.weld;
 svg+=poly([[X(ep.y0),Z(tp)],[X(ep.y0-w),Z(tp)],[X(ep.y0),Z(tp+w)]])+poly([[X(ep.y0),Z(0)],[X(ep.y0-w),Z(0)],[X(ep.y0),Z(-w)]]);
 // Column stiffener at the tie level when provided: inside the column, seen edge on, broken beyond the flange.
 const stiff=res?.stiffener.provided?capAngleStiffenerGeometry(g):undefined;
 if(stiff){const ts=stiff.thickness,ye=colBack+Math.min(stiff.length,25.4);svg+=line([X(colBack),Z(g.plate.zc+ts/2)],[X(ye),Z(g.plate.zc+ts/2)],tc.cls)+line([X(colBack),Z(g.plate.zc-ts/2)],[X(ye),Z(g.plate.zc-ts/2)],tc.cls)+breakLine([X(ye),Z(g.plate.zc+ts/2)-4],[X(ye),Z(g.plate.zc-ts/2)+4]);}
 // Dimensions above, in tiers clear of the end plate and column flange tops: the lap edge, then the lap gauge from
 // the back of the angle with the clear gap from the angle toe to the end plate, then the tie plate length, and
 // above the rail the column face from the web centerline.
 const t2=Math.min(Z(lapTop)-12,Z(fz1)-10),t1=t2-16,t0=Math.min(t1-16,Z(railTop)-12);
 const up=(y:number,from:number,to:number)=>line([X(y),from-2],[X(y),to-4]);
 svg+=up(g.y0,Z(0),t2)+up(yl,Z(lapTop),t2)+dimH(X(g.y0),X(yl),t2-4,t2,sz(g.lap.gauge),'left');
 // Below the tie plate: the clear gap from the angle toe to the end plate.
 const gy=Z(ep.z0)+14;
 svg+=line([X(g.toe),Z(-g.ta)+2],[X(g.toe),gy+5])+line([X(ep.y0),Z(ep.z0)+2],[X(ep.y0),gy+5])+dimH(X(g.toe),X(ep.y0),gy+5,gy,sz(g.plate.gap),'right');
 svg+=line([X(0),Z(railTop)-3],[X(0),t0-4],'grid-line')+line([X(g.face),Z(fz1)-2],[X(g.face),t0-4])+dimH(X(0),X(g.face),t0-4,t0,dim(g.face),'left');
 // Right of the column: the column bolts at their gauge from the tie plate centerline, one above and one below.
 const dx=X(nutEnd)+14;
 // Equal gauges about the tie plate centerline (the gauge is in the column bolt callout).
 // Where the two EQ texts would not fit between their ends (a small scale), one dimension bolt to bolt instead.
 const eqFits=textWidth('EQ',9)+6<=Math.abs(Z(cl.zs[0])-Z(g.plate.zc));
 svg+=eqFits?dimV(Z(cl.zs[0]),Z(g.plate.zc),X(nutEnd)+2,dx,'EQ')+dimV(Z(g.plate.zc),Z(cl.zs[1]),X(nutEnd)+2,dx,'EQ'):dimV(Z(cl.zs[0]),Z(cl.zs[1]),X(nutEnd)+2,dx,sz(Math.abs(cl.zs[0]-cl.zs[1])));
 // Column-side callouts right of the column, in a group above the upper bolt, the weld level with the tie plate and a
 // group below the lower bolt, so no leader crosses the gauge values; cap-side callouts below the girder, their
 // leaders rising into the open space under the angle and the tie plate.
 const cx=dx+24,upper=Z(cl.zs[0])-hw.corners*k/2,lower=Z(cl.zs[1])+hw.corners*k/2;
 const above:Callout[]=[{at:[X((g.shim.y0+g.shim.y1)/2),Z(ep.z1)+4],labels:[`FINGER SHIMS 0 TO ${sz(c.shimMax)}`]},
  {at:[X(ep.y0+ep.thickness/2),Z(ep.z1)+3],labels:[`END PL ${sz(ep.thickness)} X ${sz(ep.width)} X ${sz(ep.height)}`]},
  {at:[X(colBack),Z(fz1)+10],labels:[`${tc.label}${tc.isNew?'':' (DASHED)'}`]}];
 // The end plate weld symbol tops the column-side group: its leader passes above the column callout leaders and over
 // the end plate, then drops to the top fillet left of the bolt heads, clear of the gauge dimension between the bolts.
 const weldItem:Callout={at:[X(ep.y0-w/3),Z(tp+w/3)],weld:{size:sz(w),length:weldLength(g.plate.width,u),both:true},labels:['END PL TO TIE PL (SHOP)']};
 const belowRight:Callout[]=[
  {at:[X(colBack+hw.washer.t+hw.nut/2),lower],labels:[`2 - ${sz(cl.diameter)} ${cl.grade} BOLTS, PRETENSIONED,`,`${sz(cl.gauge)} EACH SIDE OF TIE PL; FIELD-`,`DRILL ${sz(cl.hole)} HOLES IN COLUMN FLANGE`,...(cl.slot?[`SLEEVED IN ${sz(cl.slot.width)} X ${sz(cl.slot.length)} VERT. SLOTS IN END PL`]:[])]}];
 const aboveTop=Math.min(upper-14,Z(ep.z1)+10)-columnHeight(above)+11;
 svg+=callouts(above,cx,aboveTop).svg;
 if(stiff)svg+=weldLeader([[X(colBack+12),Z(g.plate.zc-stiff.thickness/2)]],[cx,Z(g.plate.zc)+40],{size:sz(stiff.flangeWeld),length:weldLength(stiff.contact,u),both:true,field:!tc.isNew},[`STIFFENER PL ${sz(stiff.thickness)} X ${sz(stiff.width)} X ${sz(stiff.length)}`]);
 // Down past the upper bolt head on its far side, then in under it to the fillet.
 const headLeft=X(ep.y0-hw.washer.t-hw.head)-8,headBottom=Z(cl.zs[0]-hw.corners/2)+3;
 svg+=weldLeader([weldItem.at],[cx,aboveTop-calloutHeight(weldItem)-8+3],weldItem.weld!,weldItem.labels,[[[headLeft,headBottom],[headLeft,Z(ep.z1)-8]]]);
 const lowRight=callouts(belowRight,cx,stiff?Math.max(lower+14,Z(g.plate.zc)+72):lower+14);svg+=lowRight.svg;
 const below=Math.max(Z(webEnd),Z(lapBottom))+18,bx=X(-b.tw/2)-4,rightStart=Math.max(bx+60,X(headEnd)+14);
 const leftCol:Callout[]=[
  {at:[X(g.y0+g.ta/2),Z(-g.dv)],labels:[`${c.shape} X ${dim(c.length)} CAP ANGLE,`,`${g.dv===g.bh?'ONE LEG':'LONG LEG'} LEVEL WITH TOP OF CAP`]},
  {at:[X(headEnd-ch.head/2),Z(zc-ch.corners/2)],labels:[`2 - ${sz(cb.diameter)} ${cb.grade} BOLTS${pitch(cb.pitch)} ${sz(cb.gauge)} BELOW TOP;`,`${sz(cb.slotWidth)} X ${sz(cb.slotLength)} HORIZ. SLOTS, ${cb.sleeved?'SLEEVED':'SNUG-TIGHT'}`]}];
 const rightCol:Callout[]=[
  {at:[X(yl),Z(lapBottom)],points:[[X(yl),Z(lapBottom)],[X((g.toe+ep.y0)/2),Z(0)]],labels:[`TIE PL ${sz(tp)} X ${sz(g.plate.width)} X ${dim(g.plate.length)} WITH`,`2 - ${sz(g.lap.diameter)} ${g.lap.grade} SC BOLTS${pitch(g.lap.pitch)}, CLASS ${g.lap.surface},`,`${sz(g.lap.slot.width)} X ${sz(g.lap.slot.length)} SHORT SLOTS IN TIE PL,`,`${sz(g.lap.edge)} TO TIE PL END`]}];
 svg+=callouts(leftCol,bx-textWidth(labelCaps(leftCol[1].labels[0]),8.5)+40,below).svg;
 // The cap-side column ends clear of the leaders that rise to the column flange.
 const rightWidth=Math.max(...rightCol.flatMap(v=>v.labels.map(l=>textWidth(labelCaps(l),8.5))));
 // Right of the cap bolt heads, so the angle and cap bolt leaders pass left of it, and below the column bolt callout.
 svg+=callouts(rightCol,rightStart,rightStart+rightWidth>cx-10?Math.max(below,lowRight.bottom+20):below).svg;
 return {svg:svg+'</g>',scale:scale.label};
}

/** Plan at a shared column: both girder ends with their ties side by side, the slots along the runway, the end plates on the column flange. */
export function capAngleSharedPlan(s:CalculationSnapshot):ViewRender{
 const p=s.input,u=p.units,g=capAngleGeometry(p)!,b=p.section,c=g.input,sz=(v:number)=>tieSize(v,u),dim=(v:number)=>tieDim(v,u),tc=tieColumn(s,g);
 const shared=g.stations.find(v=>g.stations.some(o=>o!==v&&Math.abs(o.station-v.station)<1e-6))?.station??g.stations[0].station;
 const pair=g.stations.filter(v=>Math.abs(v.station-shared)<1e-6),col=tc.col,bf=col?.width??355.6,ep=g.endPlate;
 const half=Math.max(bf/2,...pair.map(v=>Math.abs(v.offset)+c.length/2))+50.8;
 // Across the runway from the channel flange inner face to beyond the column flange, the tie plates whole.
 const toeInner=capChannelProfile(b).toeInner,yTop=b.capWidth/2-b.capTf-25.4,yBot=g.face+tc.tf+38.1;
 const depth=yBot-yTop;
 const scale=drawingScale(Math.min(.72,360/(2*half),380/depth),u),k=scale.pointsPerMm,cx=40+half*k,X=(x:number)=>cx+(x-shared)*k;
 const Y=(y:number)=>110+(y-yTop)*k;
 const res=capAngleResult(s),stiff=res?.stiffener.provided&&col?capAngleStiffenerGeometry(g):undefined;
 let svg='<g data-view="cap-angle-plan">';
 for(const v of pair){
  // Girder end: the cap's column-side edge and its flange inner face (hidden), broken away from the joint.
  const a=X(v.girderEnd),f=X(v.end==='left'?shared+half-6:shared-half+6);
  svg+=line([a,Y(yTop)],[a,Y(b.capWidth/2)],'runway-line')+line([a,Y(b.capWidth/2)],[f,Y(b.capWidth/2)],'runway-line')+line([a,Y(toeInner)],[f,Y(toeInner)],'hidden-line');
  svg+=breakLine([f,Y(yTop)-2],[f,Y(b.capWidth/2)+4]);
  // Angle long leg, its short leg below it (hidden) with the slots along the runway; tie plate with the lap bolt slots.
  const x0=v.x-c.length/2,pw=g.plate.width;
  svg+=rect(X(x0),Y(g.y0),c.length*k,(g.toe-g.y0)*k,'runway-line')+line([X(x0),Y(g.y0+g.ta)],[X(x0+c.length),Y(g.y0+g.ta)],'hidden-line');
  for(const sx of [-1,1]){const bx=v.x+sx*g.cap.pitch/2;svg+=rect(X(bx-g.cap.slotLength/2),Y(g.y0),g.cap.slotLength*k,g.ta*k,'hidden-line');}
  const plate=(y0:number,y1:number)=>rect(X(v.x-pw/2),Y(y0),pw*k,Y(y1)-Y(y0),'runway-line');
  svg+=plate(g.plate.start,g.plate.end);
  for(const sx of [-1,1]){const bx=v.x+sx*g.lap.pitch/2,r=g.lap.slot.width/2,L=g.lap.slot.length;svg+=`<path class="runway-line" d="M${n(X(bx-r))},${n(Y(g.lap.y-L/2+r))}A${n(r*k)},${n(r*k)} 0 0 1 ${n(X(bx+r))},${n(Y(g.lap.y-L/2+r))}L${n(X(bx+r))},${n(Y(g.lap.y+L/2-r))}A${n(r*k)},${n(r*k)} 0 0 1 ${n(X(bx-r))},${n(Y(g.lap.y+L/2-r))}Z"/>`;}
  // End plate and shims on the column flange.
  svg+=rect(X(v.x-ep.width/2),Y(ep.y0),ep.width*k,ep.thickness*k,'runway-line')+rect(X(v.x-ep.width/2),Y(g.shim.y0),ep.width*k,(g.shim.y1-g.shim.y0)*k,'runway-line');
  // Stiffener at the tie level inside the column, on this tie's side of the web.
  if(stiff&&col){const side=Math.sign(v.offset)||1,web=shared+side*col.tw/2,tip=web+side*stiff.width;svg+=rect(X(Math.min(web,tip)),Y(g.face+col.tf),stiff.width*k,Math.min(stiff.length,yBot-g.face-col.tf)*k,tc.cls);}
 }
 // Column flange and web (existing: dashed), the web broken below.
 if(col)svg+=rect(X(shared-bf/2),Y(g.face),bf*k,col.tf*k,tc.cls)+line([X(shared-col.tw/2),Y(g.face+col.tf)],[X(shared-col.tw/2),Y(yBot)],tc.cls)+line([X(shared+col.tw/2),Y(g.face+col.tf)],[X(shared+col.tw/2),Y(yBot)],tc.cls);
 // Dimensions above: the tie centerline from its girder end, and from the column centerline (the grid).
 const d1=Y(yTop)-12,d2=d1-18;
 for(const v of pair){
  const out=v.end==='left'?'right':'left';
  svg+=line([X(v.girderEnd),Y(yTop)-2],[X(v.girderEnd),d1+5])+line([X(v.x),Y(g.y0)-2],[X(v.x),d2+5])+dimH(X(v.girderEnd),X(v.x),d1+5,d1,dim(c.setback),out);
  svg+=dimH(X(shared),X(v.x),d2+5,d2,dim(Math.abs(v.offset)),out);
 }
 const gridTop=d2-24;
 svg+=line([X(shared),gridTop+9],[X(shared),Y(yBot)+6],'grid-line')+bubble(X(shared),gridTop,String(1+[0,...p.spans].map((_,i)=>p.spans.slice(0,i).reduce((a,v)=>a+v,0)).findIndex(x=>Math.abs(x-shared)<1e-6)));
 // Below the column: the end plate width of the left tie.
 const left=pair.reduce((a,v)=>v.x<a.x?v:a,pair[0]),right=pair.reduce((a,v)=>v.x>a.x?v:a,pair[0]),by=Y(yBot)+12;
 svg+=line([X(left.x-ep.width/2),Y(g.shim.y1)+2],[X(left.x-ep.width/2),by+5])+line([X(left.x+ep.width/2),Y(g.shim.y1)+2],[X(left.x+ep.width/2),by+5])+dimH(X(left.x-ep.width/2),X(left.x+ep.width/2),by+5,by,sz(ep.width),'left');
 // Bolt pitches along the runway on the left tie, each just past its bolts in the open plate: the cap bolts (slots
 // hidden in the short leg) below the leg, the lap bolts below the angle toe on the tie plate.
 {const capY=Y(g.y0+g.ta)+2,lapY=Y(g.lap.y+g.lap.slot.length/2)+2,lapDim=Math.max(Y(g.toe)+16,lapY+16);
  svg+=dimH(X(left.x-g.cap.pitch/2),X(left.x+g.cap.pitch/2),capY,Math.min(capY+16,Y(g.plate.start)-7),sz(g.cap.pitch));
  svg+=dimH(X(left.x-g.lap.pitch/2),X(left.x+g.lap.pitch/2),lapY,lapDim,sz(g.lap.pitch));}
 const items:Callout[]=[
  {at:[X(right.x+g.cap.pitch/2+g.cap.slotLength/2),Y(g.y0+g.ta/2)],labels:[`${sz(g.cap.slotLength)} SLOTS ALONG RUNWAY (HIDDEN),`,`${sz(c.travel)} TRAVEL EACH WAY`]},
  {at:[X(right.x+c.length/2),Y((g.lap.y+g.toe)/2)],labels:[`${c.shape} X ${dim(c.length)}, EACH GIRDER END`]},
  {at:[X(right.x+g.plate.width/2),Y((g.toe+ep.y0)/2)],labels:[`TIE PL ${sz(g.plate.thickness)} X ${sz(g.plate.width)}`]},
  {at:[X(right.x+ep.width/2),Y(ep.y0+ep.thickness/2)],labels:['END PL ON SHIMS, 2 BOLTS (ONE','ABOVE, ONE BELOW THE TIE PL)']},
  {at:[X(shared+bf/2-8),Y(g.face+tc.tf/2)],labels:[`${tc.label} FLANGE${tc.isNew?'':' (DASHED)'}`]}];
 if(stiff)items.push({at:[X(right.x),Y(g.face+tc.tf+Math.min(stiff.length,yBot-g.face-tc.tf)/2)],labels:[`STIFFENER AT TIE LEVEL, EACH TIE`]});
 svg+=callouts(items,X(shared+half)+20,Math.min(Y(yTop),Y(yBot)-columnHeight(items))).svg;
 svg+=text(X(shared-half),by+28,'SEPARATE TIE AND END PLATE AT EACH GIRDER END.',8);
 return {svg:svg+'</g>',scale:scale.label};
}

/** The cap tieback angle details and notes, for the detail sheets. */
export function capAngleTopic(s:CalculationSnapshot):DetailTopic|undefined{
 const p=s.input,g=capAngleGeometry(p);if(!g)return undefined;
 const u=p.units,c=g.input,sz=(v:number)=>tieSize(v,u),dim=(v:number)=>tieDim(v,u),tc=tieColumn(s,g),res=capAngleResult(s),cb=g.cap;
 const shared=sharedColumn(g);
 const notes=[
  `CAP TIEBACK ANGLES (AISC DG7, TOP FLANGE CONNECTED DIRECTLY TO THE COLUMN): ONE AT EACH GIRDER END, ${dim(c.setback)} FROM THE GIRDER END TO ITS CENTERLINE, ON THE COLUMN-SIDE CHANNEL FLANGE. THE BOTTOM FLANGE IS RESTRAINED BY THE BOLTED END BEARINGS.`,
  cb.sleeved?`CAP BOLTS: PRETENSION AGAINST STEEL SLEEVES ${sz(cb.sleeve!.od)} OD X ${sz(cb.sleeve!.bore)} BORE X ${sz(cb.sleeve!.length)} LONG THROUGH ${sz(cb.slotWidth)} X ${sz(cb.slotLength)} HORIZONTAL SLOTS IN THE ANGLE, UNDER ${sz(cb.washer.thickness)} X ${sz(cb.washer.height)} X ${sz(cb.washer.length)} PLATE WASHERS. CENTER THE SLEEVES IN THE SLOTS AT ERECTION. THE ANGLE IS NOT CLAMPED: THE GIRDER SLIDES ${sz(c.travel)} EACH WAY.`
   :`CAP BOLTS: SNUG-TIGHT WITH JAM NUTS IN ${sz(cb.slotWidth)} X ${sz(cb.slotLength)} HORIZONTAL SLOTS IN THE ANGLE, UNDER ${sz(cb.washer.thickness)} PLATE WASHERS (NOT PERMITTED: PRETENSIONED BOLTS REQUIRED, AIST TR-13 §5.14; SEE CALCULATION). THE GIRDER SLIDES ${sz(c.travel)} EACH WAY.`,
  `DRILL STANDARD HOLES IN THE CAP CHANNEL FLANGE AT THE TIE ONLY; DO NOT WELD THE TIE TO THE CAP OR GIRDER.${beveledCapWasher(p.section)?' F436 1:6 BEVELED WASHERS UNDER THE CAP BOLT NUTS ON THE SLOPED INSIDE FACE OF THE CHANNEL FLANGE.':''} INSTALL AND TENSION THE CAP BOLTS BEFORE THE TIE PLATE AND LAP BOLTS.`,
  `LAP BOLTS: PRETENSIONED, SLIP-CRITICAL, CLASS ${g.lap.surface} FAYING SURFACES, IN SHORT SLOTS ACROSS THE RUNWAY IN THE TIE PLATE FOR FIT-UP; F436 WASHERS OVER THE SLOTS.`,
  ...(g.column.slot?[`END PLATE RELEASED VERTICALLY: COLUMN BOLTS PRETENSIONED AGAINST STEEL SLEEVES ${sz(g.column.slot.sleeve.od)} OD X ${sz(g.column.slot.sleeve.bore)} BORE X ${sz(g.column.slot.sleeve.length)} LONG THROUGH ${sz(g.column.slot.width)} X ${sz(g.column.slot.length)} VERTICAL SLOTS IN THE END PLATE (${sz(g.column.slot.travel)} TRAVEL EACH WAY), UNDER ${sz(g.column.slot.washer.thickness)} X ${sz(g.column.slot.washer.width)} X ${sz(g.column.slot.washer.length)} PLATE WASHERS; THE END PLATE SLIDES WITH THE GIRDER'S VERTICAL MOVEMENT. CENTER THE SLEEVES IN THE SLOTS AT ERECTION.`]:[]),
  `END PLATE: SHOP WELD TO THE TIE PLATE. FIELD-DRILL ${sz(g.column.hole)} HOLES IN THE ${tc.isNew?'COLUMN':'EXISTING COLUMN'} FLANGE TO MATCH; NO FIELD WELDING TO THE COLUMN FOR THE TIE. FINGER SHIMS 0 TO ${sz(c.shimMax)} TAKE UP THE FIT-UP; PRETENSION THE COLUMN BOLTS.`,
  ...(res?.stiffener.provided?[`COLUMN STIFFENER AT THE TIE LEVEL, ON THE TIE SIDE OF THE COLUMN WEB: ${tc.isNew?'SHOP':'FIELD'} WELD TO THE COLUMN FLANGE AND WEB (SEE EXISTING COLUMN WELDING).`]:[]),
  ...(shared?['AT A SHARED COLUMN THE TWO TIES SIT SIDE BY SIDE ON THE COLUMN FLANGE, EACH WITH ITS OWN END PLATE.']:[])];
 // Every evaluated DESIGN check of the tie, failing or not, as the calculation reports its largest D/C, by its kind
 // (check taxonomy): strength, movement capacity (slot travel, a length check) and fatigue each labelled as what it is;
 // failing checks and rules named (sheetRatios.elementSummary).
 const tie=elementSummary(s,inElements(['tie'],/^cap-angle-/),{movement:true});
 const travel=tie.movement&&/slot-travel$/.test(tie.movement.check.id)?'SLOT TRAVEL':'MOVEMENT';
 const summary=summaryNote(s,tie,{movement:travel,fatigueBelow:'FATIGUE BELOW THRESHOLD'});
 return {key:'cap-angle-tie',name:'CAP TIEBACK ANGLES',views:[
  {title:capAngleTitles.section,render:()=>capAngleSection(s)},
  ...(shared?[{title:capAngleTitles.plan,render:()=>{const c=capAngleConflict(s);return c?conflictView(c):capAngleSharedPlan(s);}}]:[])
 ],notes:(st:Style)=>[heading(st,'CAP TIEBACK ANGLE NOTES'),...numbered(st,notes),paragraph(st,`CAP TIEBACK CHECKS: ${calculationRef(s)}${tie.checks.length&&summary?` (${summary})`:''}.`)]};
}
export const capAngleLabelWidth=(v:string)=>textWidth(labelCaps(v),8.5);

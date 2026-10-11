import type {CalculationSnapshot} from '../engine/types';
import {capAngleGeometry,boltHardware,capAngleStiffenerGeometry,type CapAngleGeometry} from '../engine/capAngle';
import {capAngleResult} from '../engine/capAngleTie';
import {keeperGeometry,railPadThickness} from '../engine/railSeat';
import {supportColumn} from '../engine/drawingData';
import {sheetDrawingScale as drawingScale,line,rect,text,dimH,dimV,multiLeader,breakLine,textWidth,labelCaps,bubble,n,detailRef,type XY} from './sheetGraphics';
import {tieSize,tieDim,weldLength,weldLeader,type Weld} from './flangeTieSheet';
import {heading,numbered,paragraph,type Style} from './noteBlocks';
import type {DetailTopic,ViewRender} from './detailSheet';

/** Detail titles of the cap tieback angle; each is drawn by one detail. */
export const capAngleTitles={section:'CAP TIEBACK ANGLE / SECTION AT SUPPORT',plan:'CAP TIEBACK ANGLES / PLAN AT SHARED COLUMN'} as const;
type Callout={at:XY;labels:string[];weld?:Weld};
const calloutHeight=(v:Callout)=>(v.weld?17:0)+v.labels.length*11;
/** A column of callouts from `top`, ordered by target height so the leaders do not cross. */
function callouts(items:Callout[],x:number,top:number){
 const sorted=[...items].sort((a,b)=>a.at[1]-b.at[1]);let y=top,svg='';
 for(const v of sorted){svg+=v.weld?weldLeader([v.at],[x,y+3],v.weld,v.labels):multiLeader([v.at],[x,y],v.labels);y+=calloutHeight(v)+8;}
 return {svg,bottom:y-8};
}
const columnHeight=(items:Callout[])=>items.reduce((a,v)=>a+calloutHeight(v),0)+8*Math.max(0,items.length-1);
/** A closed outline through the given points. */
const poly=(pts:XY[],cls='runway-line')=>`<path class="${cls}" d="M${pts.map(p=>`${n(p[0])},${n(p[1])}`).join('L')}Z"/>`;
/** The column the end plates bolt to, as drawn and named. */
function tieColumn(s:CalculationSnapshot,g:CapAngleGeometry){
 const col=g.column.receiver,sc=supportColumn(s.input);
 return {col,isNew:sc.isNew,cls:sc.isNew?'runway-line':'reference-line',label:sc.isNew?sc.name:col?`EXISTING ${col.shape??'COLUMN'}${col.shape?' COLUMN':''}`:'COLUMN BY OTHERS',tf:col?.tf??19.05};
}

/** Section at a support looking along the runway: the girder with cap, rail and keeper, the cap angle, tie plate, end plate, shims and column flange. */
export function capAngleSection(s:CalculationSnapshot):ViewRender{
 const p=s.input,u=p.units,g=capAngleGeometry(p)!,d=p.details!,b=p.section,c=g.input,res=capAngleResult(s);
 const sz=(v:number)=>tieSize(v,u),dim=(v:number)=>tieDim(v,u),tc=tieColumn(s,g);
 const rail=d.rail,pad=railPadThickness(p),keeper=keeperGeometry(rail,pad),railTop=pad+(p.aist?.railDepth??p.railHeight);
 const yL=-rail.baseWidth/2-12.7,brk1=g.toe+25.4,brk2=g.endPlate.y0-19.05,colBack=g.face+tc.tf,hw=boltHardware(g.column.diameter);
 const yR=colBack+hw.washer.t+hw.nut+hw.stick+12.7,broken=brk2-brk1>38.1;
 const span=(broken?brk1-yL+yR-brk2:yR-yL),scale=drawingScale(Math.min(.72,330/span),u),k=scale.pointsPerMm,gap=broken?16:0;
 const x0=40,X=(y:number)=>x0+(!broken||y<=brk1+1e-9?(y-yL)*k:(brk1-yL)*k+gap+(y-brk2)*k),Z=(z:number)=>150-z*k;
 let svg='<g data-view="cap-angle-section">';
 // Girder: W top flange and web (broken), cap channel web and column-side flange; rail, pad and keeper (context).
 const wTop=-b.capTw,wBot=wTop-b.tf,webEnd=Math.min(-b.capDepth,g.endPlate.z0,-g.dv)-25.4;
 svg+=poly([[X(yL),Z(wTop)],[X(b.bf/2),Z(wTop)],[X(b.bf/2),Z(wBot)],[X(b.tw/2),Z(wBot)],[X(b.tw/2),Z(webEnd)],[X(-b.tw/2),Z(webEnd)],[X(-b.tw/2),Z(wBot)],[X(yL),Z(wBot)]]);
 svg+=poly([[X(yL),Z(0)],[X(b.capWidth/2),Z(0)],[X(b.capWidth/2),Z(-b.capDepth)],[X(b.capWidth/2-b.capTf),Z(-b.capDepth)],[X(b.capWidth/2-b.capTf),Z(wTop)],[X(yL),Z(wTop)]]);
 svg+=breakLine([X(yL)-4,Z(0)-2],[X(yL)-4,Z(wBot)+2])+breakLine([X(-b.tw/2)-4,Z(webEnd)+4],[X(b.tw/2)+4,Z(webEnd)+4]);
 const rb=rail.baseWidth/2,rt=rail.webThickness/2,rh=rail.headWidth/2,z1=pad+rail.baseThickness,z3=railTop-rail.headThickness;
 if(pad)svg+=rect(X(-rb),Z(pad),2*rb*k,pad*k,'runway-line');
 svg+=poly([[X(-rb),Z(pad)],[X(rb),Z(pad)],[X(rb),Z(z1)],[X(rt),Z(z1)],[X(rt),Z(z3)],[X(rh),Z(z3)],[X(rh),Z(railTop)],[X(-rh),Z(railTop)],[X(-rh),Z(z3)],[X(-rt),Z(z3)],[X(-rt),Z(z1)],[X(-rb),Z(z1)]]);
 svg+=poly([[X(keeper.inner),Z(0)],[X(keeper.outer),Z(0)],[X(keeper.outer),Z(keeper.height)],[X(keeper.tip),Z(keeper.height)],[X(keeper.tip),Z(keeper.bodyHeight)],[X(keeper.inner),Z(keeper.bodyHeight)]]);
 // Cap angle: short leg on the channel flange, long leg level with the top of the cap.
 svg+=poly([[X(g.y0),Z(0)],[X(g.toe),Z(0)],[X(g.toe),Z(-g.ta)],[X(g.y0+g.ta),Z(-g.ta)],[X(g.y0+g.ta),Z(-g.dv)],[X(g.y0),Z(-g.dv)]]);
 // Cap bolt: plate washer, head and sleeve outside; F436 washer and nut inside the channel. The slot and sleeve are hidden.
 const cb=g.cap,ch=boltHardware(cb.diameter),zc=cb.z,outer=g.y0+g.ta+(cb.sleeve?c.sleeveClearance:0),inner=g.y0-b.capTf;
 svg+=rect(X(outer),Z(zc+cb.washer.height/2),cb.washer.thickness*k,cb.washer.height*k,'runway-line');
 svg+=rect(X(outer+cb.washer.thickness),Z(zc+ch.corners/2),ch.head*k,ch.corners*k,'runway-line');
 svg+=rect(X(inner-ch.washer.t),Z(zc+ch.washer.od/2),ch.washer.t*k,ch.washer.od*k,'runway-line')+rect(X(inner-ch.washer.t-ch.nut),Z(zc+ch.corners/2),ch.nut*k,ch.corners*k,'runway-line');
 svg+=rect(X(inner-ch.washer.t-ch.nut-ch.stick),Z(zc+cb.diameter/2),ch.stick*k,cb.diameter*k,'runway-line');
 for(const e of [-1,1])svg+=line([X(inner),Z(zc+e*cb.diameter/2)],[X(outer+cb.washer.thickness),Z(zc+e*cb.diameter/2)],'hidden-line')+line([X(g.y0),Z(zc+e*cb.slotWidth/2)],[X(g.y0+g.ta),Z(zc+e*cb.slotWidth/2)],'hidden-line');
 // Tie plate on the long leg; lap bolt heads on the plate, nuts under the leg.
 const tp=g.plate.thickness,lh=boltHardware(g.lap.diameter),yl=g.lap.y,zTop=tp;
 if(broken)svg+=poly([[X(g.plate.start),Z(tp)],[X(brk1),Z(tp)],[X(brk1),Z(0)],[X(g.plate.start),Z(0)]])+poly([[X(brk2),Z(tp)],[X(g.plate.end),Z(tp)],[X(g.plate.end),Z(0)],[X(brk2),Z(0)]])
  +breakLine([X(brk1)+2,Z(tp)-5],[X(brk1)+2,Z(0)+5])+breakLine([X(brk2)-2,Z(tp)-5],[X(brk2)-2,Z(0)+5]);
 else svg+=rect(X(g.plate.start),Z(tp),(g.plate.end-g.plate.start)*k,tp*k,'runway-line');
 svg+=rect(X(yl-lh.washer.od/2),Z(zTop+lh.washer.t),lh.washer.od*k,lh.washer.t*k,'runway-line')+rect(X(yl-lh.corners/2),Z(zTop+lh.washer.t+lh.head),lh.corners*k,lh.head*k,'runway-line');
 svg+=rect(X(yl-lh.washer.od/2),Z(-g.ta),lh.washer.od*k,lh.washer.t*k,'runway-line')+rect(X(yl-lh.corners/2),Z(-g.ta-lh.washer.t),lh.corners*k,lh.nut*k,'runway-line');
 svg+=rect(X(yl-g.lap.diameter/2),Z(-g.ta-lh.washer.t-lh.nut),g.lap.diameter*k,lh.stick*k,'runway-line');
 for(const e of [-1,1])svg+=line([X(yl+e*g.lap.diameter/2),Z(zTop)],[X(yl+e*g.lap.diameter/2),Z(-g.ta)],'hidden-line');
 // End plate, shims and the column flange (existing: dashed), broken above and below.
 const ep=g.endPlate,fz0=ep.z0-31.75,fz1=ep.z1+31.75;
 svg+=rect(X(ep.y0),Z(ep.z1),ep.thickness*k,ep.height*k,'runway-line')+rect(X(g.shim.y0),Z(ep.z1),(g.shim.y1-g.shim.y0)*k,ep.height*k,'runway-line');
 svg+=line([X(g.face),Z(fz1)],[X(g.face),Z(fz0)],tc.cls)+line([X(colBack),Z(fz1)],[X(colBack),Z(fz0)],tc.cls);
 svg+=breakLine([X(g.face)-4,Z(fz1)],[X(colBack)+4,Z(fz1)])+breakLine([X(g.face)-4,Z(fz0)],[X(colBack)+4,Z(fz0)]);
 // Column bolts: heads on the end plate, nuts inside the column flange.
 const cl=g.column;
 for(const zb of cl.zs){
  svg+=rect(X(ep.y0-hw.washer.t),Z(zb+hw.washer.od/2),hw.washer.t*k,hw.washer.od*k,'runway-line')+rect(X(ep.y0-hw.washer.t-hw.head),Z(zb+hw.corners/2),hw.head*k,hw.corners*k,'runway-line');
  svg+=rect(X(colBack),Z(zb+hw.washer.od/2),hw.washer.t*k,hw.washer.od*k,'runway-line')+rect(X(colBack+hw.washer.t),Z(zb+hw.corners/2),hw.nut*k,hw.corners*k,'runway-line')+rect(X(colBack+hw.washer.t+hw.nut),Z(zb+cl.diameter/2),hw.stick*k,cl.diameter*k,'runway-line');
  for(const e of [-1,1])svg+=line([X(ep.y0),Z(zb+e*cl.diameter/2)],[X(colBack),Z(zb+e*cl.diameter/2)],'hidden-line');
 }
 // Shop fillets, end plate to tie plate, on both faces of the tie plate.
 const w=g.weld;
 svg+=poly([[X(ep.y0),Z(tp)],[X(ep.y0-w),Z(tp)],[X(ep.y0),Z(tp+w)]])+poly([[X(ep.y0),Z(0)],[X(ep.y0-w),Z(0)],[X(ep.y0),Z(-w)]]);
 // Column stiffener at the tie level when provided: inside the column, seen edge on, broken beyond the flange.
 const stiff=res?.stiffener.provided?capAngleStiffenerGeometry(g):undefined;
 if(stiff){const ts=stiff.thickness,ye=colBack+Math.min(stiff.length,25.4);svg+=line([X(colBack),Z(g.plate.zc+ts/2)],[X(ye),Z(g.plate.zc+ts/2)],tc.cls)+line([X(colBack),Z(g.plate.zc-ts/2)],[X(ye),Z(g.plate.zc-ts/2)],tc.cls)+breakLine([X(ye),Z(g.plate.zc+ts/2)-4],[X(ye),Z(g.plate.zc-ts/2)+4]);}
 // Dimensions. Above: the column face from the web centerline; the lap bolts from the back of the angle and from the tie plate end.
 const topZ=Z(Math.max(railTop,ep.z1+31.75)),lapY=Z(tp+lh.washer.t+lh.head)-14;
 svg+=line([X(0),Z(railTop)-3],[X(0),topZ-22],'grid-line');
 svg+=line([X(g.face),Z(fz1)-3],[X(g.face),topZ-14+5])+dimH(X(0),X(g.face),topZ-14+5,topZ-14,dim(g.face),'left');
 svg+=line([X(g.y0),Z(0)-2],[X(g.y0),lapY+5])+line([X(yl),Z(tp+lh.washer.t+lh.head)-2],[X(yl),lapY+5])+dimH(X(g.y0),X(yl),lapY+5,lapY,sz(g.lap.gauge),'left');
 // The lap edge, from the tie plate end to the lap bolts, one tier above the lap gauge.
 svg+=line([X(g.plate.start),Z(tp)-2],[X(g.plate.start),lapY-16+5])+line([X(yl),lapY-2],[X(yl),lapY-16+5])+dimH(X(g.plate.start),X(yl),lapY-16+5,lapY-16,sz(g.lap.edge),'left');
 const lowY=Z(-g.dv)+16;
 // Below: the angle toe to the end plate (the clear gap) and the tie plate length.
 svg+=line([X(g.toe),Z(-g.ta)+2],[X(g.toe),lowY+5])+line([X(ep.y0),Z(ep.z0)+2],[X(ep.y0),lowY+5])+dimH(X(g.toe),X(ep.y0),lowY+5,lowY,`${dim(g.plate.gap)} CLR.`);
 svg+=line([X(g.plate.start),Z(-g.ta)+2],[X(g.plate.start),lowY+21])+line([X(g.plate.end),Z(ep.z0)+2],[X(g.plate.end),lowY+21])+dimH(X(g.plate.start),X(g.plate.end),lowY+21,lowY+16,dim(g.plate.length),'left');
 // The cap bolt line below the top of the cap, left of the channel flange; the end plate height and bolt gauges right of the column.
 const gx=X(b.capWidth/2-b.capTf)-10;
 svg+=line([X(b.capWidth/2-b.capTf-ch.washer.t-ch.nut-ch.stick)-2,Z(zc)],[gx-5,Z(zc)])+dimV(Z(0),Z(zc),X(b.bf/2)+2,gx,sz(cb.gauge));
 const dx=X(colBack+hw.washer.t+hw.nut+hw.stick)+14;
 svg+=dimV(Z(cl.zs[0]),Z(g.plate.zc),X(colBack+hw.washer.t+hw.nut+hw.stick)+2,dx,sz(cl.gauge))+dimV(Z(g.plate.zc),Z(cl.zs[1]),X(colBack+hw.washer.t+hw.nut+hw.stick)+2,dx,sz(cl.gauge));
 svg+=dimV(Z(ep.z1),Z(ep.z0),X(ep.y1)+2,dx+18,sz(ep.height));
 // Callouts, right of the column.
 const items:Callout[]=[
  {at:[X(g.toe-25.4),Z(-g.ta/2)],labels:[`${c.shape} X ${dim(c.length)} CAP ANGLE`,'LONG LEG LEVEL WITH TOP OF CAP']},
  {at:[X(outer+cb.washer.thickness+ch.head),Z(zc)],labels:[`2 - ${sz(cb.diameter)} ${cb.grade} BOLTS IN ${sz(cb.slotWidth)} X ${sz(cb.slotLength)}`,cb.sleeved?'HORIZ. SLOTS, SLEEVED; PL WASHERS':'HORIZ. SLOTS, SNUG-TIGHT; PL WASHERS']},
  {at:[X(yl+lh.corners/2),Z(zTop+lh.washer.t+lh.head/2)],labels:[`2 - ${sz(g.lap.diameter)} ${g.lap.grade} SC BOLTS, CLASS ${g.lap.surface},`,`${sz(g.lap.slot.width)} X ${sz(g.lap.slot.length)} SHORT SLOTS IN TIE PL`]},
  {at:[X(broken?brk2+6:g.plate.end-25.4),Z(tp/2)],labels:[`TIE PL ${sz(tp)} X ${sz(g.plate.width)} X ${dim(g.plate.length)}`]},
  {at:[X(ep.y0-w/2),Z(tp+w/3)],weld:{size:sz(w),length:weldLength(g.plate.width,u),both:true},labels:['END PL TO TIE PL (SHOP)']},
  {at:[X(ep.y0+ep.thickness/2),Z(ep.z0+6)],labels:[`END PL ${sz(ep.thickness)} X ${sz(ep.width)} X ${sz(ep.height)}`]},
  {at:[X((g.shim.y0+g.shim.y1)/2),Z(ep.z1-8)],labels:[`FINGER SHIMS 0 TO ${sz(c.shimMax)}`]},
  {at:[X(colBack+hw.washer.t+hw.nut/2),Z(cl.zs[1]-hw.corners/2)],labels:[`2 - ${sz(cl.diameter)} ${cl.grade} BOLTS; FIELD-DRILL`,`${sz(cl.hole)} HOLES IN COLUMN FLANGE`]},
  {at:[X(colBack),Z(fz0+10)],labels:[`${tc.label}${tc.isNew?'':' (DASHED)'}`]}];
 if(stiff)items.push({at:[X(colBack+12),Z(g.plate.zc)],weld:{size:sz(stiff.flangeWeld),length:weldLength(stiff.contact,u),both:true,field:!tc.isNew},labels:[`STIFFENER PL ${sz(stiff.thickness)} X ${sz(stiff.width)} X ${sz(stiff.length)}`]});
 const cx=dx+44,top=Math.min(topZ-14,(Z(railTop)+Z(webEnd))/2-columnHeight(items)/2);
 svg+=callouts(items,cx,top).svg;
 svg+=text(x0,Math.max(lowY+46,Z(webEnd)+14),'NO WELDING TO THE CAP, GIRDER OR COLUMN AT THE TIE. INSTALL AND TENSION THE CAP BOLTS BEFORE THE TIE PLATE.',8);
 return {svg:svg+'</g>',scale:scale.label};
}

/** Plan at a shared column: both girder ends with their ties side by side, the slots along the runway, the end plates on the column flange. */
export function capAngleSharedPlan(s:CalculationSnapshot):ViewRender{
 const p=s.input,u=p.units,g=capAngleGeometry(p)!,b=p.section,c=g.input,sz=(v:number)=>tieSize(v,u),dim=(v:number)=>tieDim(v,u),tc=tieColumn(s,g);
 const shared=g.stations.find(v=>g.stations.some(o=>o!==v&&Math.abs(o.station-v.station)<1e-6))?.station??g.stations[0].station;
 const pair=g.stations.filter(v=>Math.abs(v.station-shared)<1e-6),col=tc.col,bf=col?.width??355.6;
 const half=Math.max(bf/2,...pair.map(v=>Math.abs(v.offset)+c.length/2))+76.2,yTop=b.capWidth/2-50.8,yBot=g.face+tc.tf+25.4;
 const scale=drawingScale(Math.min(.36,380/(2*half),230/(yBot-yTop)),u),k=scale.pointsPerMm,cx=40+half*k,X=(x:number)=>cx+(x-shared)*k,Y=(y:number)=>80+(y-yTop)*k;
 let svg='<g data-view="cap-angle-plan">';
 // Girder ends: the cap edge (column side) and the channel flange inner face, broken away from the joint.
 for(const v of pair){
  const a=X(v.girderEnd),f=X(v.end==='left'?shared+half-6:shared-half+6);
  svg+=line([a,Y(yTop)],[a,Y(b.capWidth/2)],'runway-line')+line([a,Y(b.capWidth/2)],[f,Y(b.capWidth/2)],'runway-line')+line([a,Y(b.capWidth/2-b.capTf)],[f,Y(b.capWidth/2-b.capTf)],'hidden-line');
  svg+=breakLine([f,Y(yTop)-2],[f,Y(b.capWidth/2)+4]);
  // Angle (long leg seen from above), tie plate, end plate and shims; slots in the short leg below the long leg are hidden.
  const x0=v.x-c.length/2;
  svg+=rect(X(x0),Y(g.y0),c.length*k,(g.toe-g.y0)*k,'runway-line')+line([X(x0),Y(g.y0+g.ta)],[X(x0+c.length),Y(g.y0+g.ta)],'hidden-line');
  for(const sx of [-1,1]){const bx=v.x+sx*g.cap.pitch/2;svg+=rect(X(bx-g.cap.slotLength/2),Y(g.y0),g.cap.slotLength*k,g.ta*k,'hidden-line');}
  const pw=g.plate.width;
  svg+=rect(X(v.x-pw/2),Y(g.plate.start),pw*k,(g.plate.end-g.plate.start)*k,'runway-line');
  for(const sx of [-1,1]){const bx=v.x+sx*g.lap.pitch/2,r=g.lap.slot.width/2,L=g.lap.slot.length;svg+=`<path class="runway-line" d="M${n(X(bx-r))},${n(Y(g.lap.y-L/2+r))}A${n(r*k)},${n(r*k)} 0 0 1 ${n(X(bx+r))},${n(Y(g.lap.y-L/2+r))}L${n(X(bx+r))},${n(Y(g.lap.y+L/2-r))}A${n(r*k)},${n(r*k)} 0 0 1 ${n(X(bx-r))},${n(Y(g.lap.y+L/2-r))}Z"/>`;}
  svg+=rect(X(v.x-g.endPlate.width/2),Y(g.endPlate.y0),g.endPlate.width*k,g.endPlate.thickness*k,'runway-line')+rect(X(v.x-g.endPlate.width/2),Y(g.shim.y0),g.endPlate.width*k,(g.shim.y1-g.shim.y0)*k,'runway-line');
  // The column bolts, one above the other, through the end plate and column flange.
  svg+=line([X(v.x),Y(g.endPlate.y0)-4],[X(v.x),Y(g.face+tc.tf)+4],'grid-line');
 }
 // Column flange and web (existing: dashed).
 if(col){svg+=rect(X(shared-bf/2),Y(g.face),bf*k,col.tf*k,tc.cls)+line([X(shared-col.tw/2),Y(g.face+col.tf)],[X(shared-col.tw/2),Y(yBot)],tc.cls)+line([X(shared+col.tw/2),Y(g.face+col.tf)],[X(shared+col.tw/2),Y(yBot)],tc.cls);}
 // Grid line through the joint.
 svg+=line([X(shared),Y(yTop)-26],[X(shared),Y(yBot)+6],'grid-line')+bubble(X(shared),Y(yTop)-34,String(1+[0,...p.spans].map((_,i)=>p.spans.slice(0,i).reduce((a,v)=>a+v,0)).findIndex(x=>Math.abs(x-shared)<1e-6)));
 // Column stiffeners at the tie level when provided, inside the column on each tie's side of the web.
 const res=capAngleResult(s),stiff=res?.stiffener.provided&&col?capAngleStiffenerGeometry(g):undefined;
 if(stiff&&col)for(const v of pair){const side=Math.sign(v.offset)||1,web=shared+side*col.tw/2,tip=web+side*stiff.width;svg+=rect(X(Math.min(web,tip)),Y(g.face+col.tf),stiff.width*k,Math.min(stiff.length,yBot-g.face-col.tf)*k,tc.cls);}
 // Dimensions above: girder end to tie centerline, and the tie centerline from the column centerline.
 const dy=Y(yTop)-12;
 for(const v of pair){
  const out=v.end==='left'?'right':'left';
  svg+=line([X(v.girderEnd),Y(yTop)-2],[X(v.girderEnd),dy+5])+line([X(v.x),Y(g.y0)-2],[X(v.x),dy-19])+dimH(X(v.girderEnd),X(v.x),dy+5,dy,dim(c.setback),out);
  svg+=line([X(shared),dy-14],[X(shared),dy-19])+dimH(X(shared),X(v.x),dy-19,dy-24,dim(Math.abs(v.offset)),out);
 }
 // Below the column: the angle length and slot travel on the right tie; the end plate width on the left.
 const right=pair.reduce((a,v)=>v.x>a.x?v:a,pair[0]),left=pair.reduce((a,v)=>v.x<a.x?v:a,pair[0]),by=Y(yBot)+14;
 const callout:Callout[]=[
  {at:[X(right.x+c.length/2-6),Y((g.y0+g.toe)/2)],labels:[`${c.shape} X ${dim(c.length)}, EACH GIRDER END`]},
  {at:[X(right.x+g.cap.pitch/2+g.cap.slotLength/2),Y(g.y0+g.ta/2)],labels:[`${sz(g.cap.slotLength)} SLOTS ALONG RUNWAY (HIDDEN):`,`${sz(c.travel)} TRAVEL EACH WAY`]},
  {at:[X(right.x+g.plate.width/2),Y((g.lap.y+g.endPlate.y0)/2)],labels:[`TIE PL ${sz(g.plate.thickness)} X ${sz(g.plate.width)}`]},
  {at:[X(right.x+g.endPlate.width/2),Y(g.endPlate.y0+g.endPlate.thickness/2)],labels:['END PL ON SHIMS, 2 BOLTS',`(ONE ABOVE, ONE BELOW TIE PL)`]},
  {at:[X(shared+bf/2-12),Y(g.face+tc.tf/2)],labels:[`${tc.label} FLANGE${tc.isNew?'':' (DASHED)'}`]}];
 svg+=callouts(callout,X(shared+half)+16,Y(yTop)).svg;
 svg+=line([X(left.x-g.endPlate.width/2),Y(g.shim.y1)+2],[X(left.x-g.endPlate.width/2),by+5])+line([X(left.x+g.endPlate.width/2),Y(g.shim.y1)+2],[X(left.x+g.endPlate.width/2),by+5])+dimH(X(left.x-g.endPlate.width/2),X(left.x+g.endPlate.width/2),by+5,by,sz(g.endPlate.width),'left');
 svg+=text(X(shared-half),by+30,'SEPARATE TIE AND END PLATE AT EACH GIRDER END; GIRDER ENDS NOT CONNECTED ACROSS THE JOINT.',8);
 return {svg:svg+'</g>',scale:scale.label};
}

/** The cap tieback angle details and notes, for the detail sheets. */
export function capAngleTopic(s:CalculationSnapshot):DetailTopic|undefined{
 const p=s.input,g=capAngleGeometry(p);if(!g)return undefined;
 const u=p.units,c=g.input,sz=(v:number)=>tieSize(v,u),dim=(v:number)=>tieDim(v,u),tc=tieColumn(s,g),res=capAngleResult(s),cb=g.cap;
 const shared=g.stations.some(v=>g.stations.some(o=>o!==v&&Math.abs(o.station-v.station)<1e-6));
 const notes=[
  `CAP TIEBACK ANGLES (AISC DG7, TOP FLANGE CONNECTED DIRECTLY TO THE COLUMN): ONE AT EACH GIRDER END, ${dim(c.setback)} FROM THE GIRDER END TO ITS CENTERLINE, ON THE COLUMN-SIDE CHANNEL FLANGE. THE BOTTOM FLANGE IS RESTRAINED BY THE BOLTED END BEARINGS.`,
  cb.sleeved?`CAP BOLTS: PRETENSION AGAINST STEEL SLEEVES ${sz(cb.sleeve!.od)} OD X ${sz(cb.sleeve!.length)} LONG THROUGH ${sz(cb.slotWidth)} X ${sz(cb.slotLength)} HORIZONTAL SLOTS IN THE ANGLE, UNDER ${sz(cb.washer.thickness)} X ${sz(cb.washer.height)} X ${sz(cb.washer.length)} PLATE WASHERS. CENTER THE SLEEVES IN THE SLOTS AT ERECTION. THE ANGLE IS NOT CLAMPED: THE GIRDER SLIDES ${sz(c.travel)} EACH WAY.`
   :`CAP BOLTS: SNUG-TIGHT WITH JAM NUTS IN ${sz(cb.slotWidth)} X ${sz(cb.slotLength)} HORIZONTAL SLOTS IN THE ANGLE, UNDER ${sz(cb.washer.thickness)} PLATE WASHERS (AISC J1.10, CRANES OF 5 TONS OR LESS). THE GIRDER SLIDES ${sz(c.travel)} EACH WAY.`,
  `DRILL STANDARD HOLES IN THE CAP CHANNEL FLANGE ONLY AT THE TIE; NO OTHER HOLES, CUTS OR WELDS IN THE CAP OR GIRDER. INSTALL AND TENSION THE CAP BOLTS BEFORE THE TIE PLATE AND LAP BOLTS.`,
  `LAP BOLTS: PRETENSIONED, SLIP-CRITICAL, CLASS ${g.lap.surface} FAYING SURFACES, IN SHORT SLOTS ACROSS THE RUNWAY IN THE TIE PLATE FOR FIT-UP; F436 WASHERS OVER THE SLOTS.`,
  `END PLATE: SHOP WELD TO THE TIE PLATE. FIELD-DRILL ${sz(g.column.hole)} HOLES IN THE ${tc.isNew?'COLUMN':'EXISTING COLUMN'} FLANGE TO MATCH; NO FIELD WELDING TO THE COLUMN FOR THE TIE. FINGER SHIMS 0 TO ${sz(c.shimMax)} TAKE UP THE FIT-UP; PRETENSION THE COLUMN BOLTS.`,
  ...(res?.stiffener.provided?[`COLUMN STIFFENER AT THE TIE LEVEL, ON THE TIE SIDE OF THE COLUMN WEB: ${tc.isNew?'SHOP':'FIELD'} WELD TO THE COLUMN FLANGE AND WEB (SEE EXISTING COLUMN WELDING).`]:[]),
  ...(shared?['AT A SHARED COLUMN THE TWO TIES SIT SIDE BY SIDE ON THE COLUMN FLANGE, EACH WITH ITS OWN END PLATE.']:[])];
 const checks=s.checks.filter(v=>v.id.startsWith('cap-angle-')&&v.utilization!==undefined&&v.quantity!=='length'&&v.status==='pass');
 const most=(list:typeof checks)=>Math.max(0,...list.map(v=>v.utilization??0));
 const strength=most(checks.filter(v=>!v.id.includes('fatigue')&&v.quantity!=='ratio'||v.id==='cap-angle-plate-movement'||v.id==='cap-angle-heel')),fatigue=most(checks.filter(v=>v.id.includes('fatigue')));
 return {key:'cap-angle-tie',name:'CAP TIEBACK ANGLES',views:[
  {title:capAngleTitles.section,render:()=>capAngleSection(s)},
  ...(shared?[{title:capAngleTitles.plan,render:()=>capAngleSharedPlan(s)}]:[])
 ],notes:(st:Style)=>[heading(st,'CAP TIEBACK ANGLE NOTES'),...numbered(st,notes),paragraph(st,`CAP TIEBACK CHECKS: SEE CALCULATION REPORT${checks.length?` (MAX. D/C ${strength.toFixed(2)} STRENGTH, ${fatigue.toFixed(2)} FATIGUE)`:''}. ${detailRef(capAngleTitles.section)}.`)]};
}
export const capAngleLabelWidth=(v:string)=>textWidth(labelCaps(v),8.5);

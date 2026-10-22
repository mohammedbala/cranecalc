import type {CalculationSnapshot} from '../engine/types';
import {dcText} from '../engine/checkPresentation';
import {format} from '../engine/units';
import {activeSplices,spliceGeometry,spliceLayout,spliceMark,spliceRules,type FlangeSpliceGeometry} from '../engine/spliceInputs';
import {spliceBasis} from '../engine/girderSplice';
import {railPad,railPadThickness,clipGeometry,clipOutline} from '../engine/railSeat';
import {railClipStations} from '../engine/simpleSupports';
import {railLayoutCriteria} from '../engine/railLayout';
import {drawingLength,plateInches,holeInches} from './drawingFormat';
import {sheetDrawingScale as drawingScale,text,line,rect,dimH,dimV,labelColumn,textWidth,labelCaps,breakLine,sectionCut,detailRef,detailTitles,n,lettering,type XY} from './sheetGraphics';
import {heading,numbered,table,type Style} from './noteBlocks';
import type {DetailTopic,DetailView} from './detailSheet';
import {heavyHex,hexSide,hexPlan,boltLength} from './heavyHex';

const inch=25.4;
/** Detail titles of the girder field splice, referenced from the general arrangement. */
export const spliceTitles={elevation:'GIRDER FIELD SPLICE / ELEVATION',section:'GIRDER FIELD SPLICE / SECTION AT JOINT',plan:'TOP FLANGE SPLICE / PLAN',webPlate:'WEB SPLICE PLATE / DETAIL'} as const;

const path=(pts:XY[],cls:string,close=true)=>`<path class="${cls}" d="${pts.map(([x,y],i)=>`${i?'L':'M'}${n(x)},${n(y)}`).join('')}${close?'Z':''}"/>`;
/** Head or nut seen from the side with its axis horizontal: `face` is the bearing face, rising toward dir. */
function hexSideH(face:number,cy:number,corners:number,height:number,dir:1|-1,cls='runway-line'){
 const x0=Math.min(face,face+dir*height),q=corners/4;
 return rect(x0,cy-corners/2,height,corners,cls)+[-q,q].map(y=>line([x0,cy+y],[x0+height,cy+y],cls)).join('');
}
/**
 * Chained dimension with its own extension line origins: horizontal ('h') at `pos` below or above the origins,
 * or vertical ('v'). Text too long for its segment reads beyond the chain end (end segments) or below the chain.
 */
function chain(dir:'h'|'v',at:number[],from:number[],pos:number,labels:string[]){
 let svg='';
 at.forEach((v,i)=>{const s=Math.sign(pos-from[i])||1;svg+=dir==='h'?line([v,from[i]+2*s],[v,pos+4*s]):line([from[i]+2*s,v],[pos+4*s,v]);});
 svg+=dir==='h'?line([at[0],pos],[at.at(-1)!,pos]):line([pos,at[0]],[pos,at.at(-1)!]);
 svg+=at.map(v=>dir==='h'?line([v-2.5,pos+3],[v+2.5,pos-3]):line([pos-3,v+2.5],[pos+3,v-2.5])).join('');
 // Middle labels too long for their segment read below the chain, a second row down where they would meet.
 const carried:{x0:number;x1:number;row:number}[]=[];
 labels.forEach((label,i)=>{
  const a=at[i],b=at[i+1],w=textWidth(label,lettering.text),fits=w+6<=Math.abs(b-a),first=i===0,last=i===labels.length-1;
  if(dir==='h'){
   if(fits)svg+=text((a+b)/2,pos-4,label,lettering.text,'middle');
   else if(first||last)svg+=text(first?Math.min(a,b)-4:Math.max(a,b)+4,pos+3,label,lettering.text,first?'end':'start');
   else{const c=(a+b)/2,x0=c-w/2-3,x1=c+w/2+3,row=carried.some(v=>v.row===1&&v.x0<x1&&x0<v.x1)?2:1;carried.push({x0,x1,row});svg+=text(c,pos+12*row,label,lettering.text,'middle');}
  }
  else svg+=fits?text(pos-5,(a+b)/2,label,lettering.text,'middle',400,-90):text(pos-5,first?Math.min(a,b)-4:Math.max(a,b)+10,label,lettering.text,'end');
 });
 return svg;
}
/** Depth below a horizontal chain taken by its carried middle labels. */
function chainDepth(at:number[],labels:string[]){
 const carried:{x0:number;x1:number;row:number}[]=[];
 labels.forEach((label,i)=>{const a=at[i],b=at[i+1],w=textWidth(label,lettering.text);if(w+6<=Math.abs(b-a)||i===0||i===labels.length-1)return;const c=(a+b)/2,x0=c-w/2-3,x1=c+w/2+3;carried.push({x0,x1,row:carried.some(v=>v.row===1&&v.x0<x1&&x0<v.x1)?2:1});});
 return 12*Math.max(0,...carried.map(v=>v.row));
}
/** Girder field splice details: the elevation, the section at the joint and the top flange plan, with design data and notes. */
export function spliceTopic(s:CalculationSnapshot):DetailTopic{
 const p=s.input,u=p.units,sp=activeSplices(p)!,layout=spliceLayout(p),g=spliceGeometry(p,sp),b=p.section,d=p.details!;
 const dim=(v:number)=>drawingLength(v,u),size=(v:number)=>plateInches(v,u),db=sp.diameter,hx=heavyHex(db),hole=g.hole;
 const pad=railPadThickness(p),kg=clipGeometry(d.rail,pad),railDepth=p.aist?.railDepth??p.railHeight,r=d.rail,railTop=b.d+pad+railDepth,clipH=kg.noseHeight+.625*inch;
 const marks=layout.stations.map((_,i)=>spliceMark(i)),T=g.top,B=g.bottom,W=g.web,wi=sp.web;
 const boltName=`${size(db)} DIA. ${sp.grade}`;
 const plateLabel=(f:FlangeSpliceGeometry,outer:boolean)=>outer?`PL ${size(f.input.outerThickness)} X ${size(f.input.outerWidth)} X ${dim(f.length)}`:`2 PL ${size(f.input.innerThickness)} X ${size(f.input.innerWidth)} X ${dim(f.length)}`;
 const webLabel=`2 PL ${size(wi.thickness)} X ${dim(wi.height)} X ${dim(W.length)}`;
 // Clips at the first splice, measured from its joint.
 const s0=layout.stations[0],clips=railClipStations(p).map(x=>x-s0);
 const grip={top:b.tf+(T.inner?T.input.innerThickness:0)+(T.outer?T.input.outerThickness:0),bottom:b.tf+(B.inner?B.input.innerThickness:0)+(B.outer?B.input.outerThickness:0),web:b.tw+2*wi.thickness};
 const views:DetailView[]=[];
 /** Pattern labels of a bolt chain along the runway, plate end to plate end: edge, rows, joint, rows, edge. */
 const pattern=(f:{rows:number[];pitch:number;half:number;first:number})=>{
  const at=[-f.half,...[...f.rows].reverse().map(x=>-x),...f.rows,f.half],n=f.rows.length,group=n>1?(n>2?`${n-1} @ ${size(f.pitch)}`:size(f.pitch)):'';
  const labels=[size(sp.edge),...(n>1?[group]:[]),size(2*f.first+sp.gap),...(n>1?[group]:[]),size(sp.edge)];
  const stations=n>1?[at[0],at[1],at[n],at[n+1],at[2*n],at[2*n+1]]:at;
  return {stations,labels};
 };

 // 1: Elevation of the splice from the near side, symmetric about the joint.
 views.push({title:spliceTitles.elevation,rows:2,render:()=>{
  const shown=g.half+1.5*inch;
  const below=(B.outer?B.input.outerThickness:0)+hx.head+hx.washer.t;
  const k=drawingScale(Math.min(420/(2*shown),520/(railTop+below+2*inch)),u),kk=k.pointsPerMm,X=(x:number)=>x*kk,Y=(y:number)=>-y*kk;
  let svg='<g data-view="girder-splice-elevation">';
  const tf=b.tf,dd=b.d,to=B.outer?B.input.outerThickness:0,tiB=B.inner?B.input.innerThickness:0,tiT=T.inner?T.input.innerThickness:0,toT=T.outer?T.input.outerThickness:0;
  // Clips within the view and the bolt heads on the top flange hide the rail base lines behind them.
  const clipBoxes=clips.filter(x=>Math.abs(x)+kg.baseLength/2<shown-.5*inch).map(x=>[x-kg.baseLength/2,x+kg.baseLength/2] as [number,number]);
  const heads=T.rows.flatMap(x=>[-x,x]).map(x=>[x-hx.corners/2,x+hx.corners/2] as [number,number]);
  const broken=(y:number,gaps:[number,number][],cls:string)=>{let from=-shown,out='';for(const [a,c] of [...gaps].sort((u,v)=>u[0]-v[0])){if(a>from)out+=line([X(from),Y(y)],[X(a),Y(y)],cls);from=Math.max(from,c);}if(shown>from)out+=line([X(from),Y(y)],[X(shown),Y(y)],cls);return out;};
  // Rail on its pad, continuous over the joint.
  svg+=(pad>0?broken(dd+pad,[...clipBoxes,...heads],'rail-line'):'')+broken(dd+pad+r.baseThickness,clipBoxes,'rail-line')+line([X(-shown),Y(railTop-r.headThickness)],[X(shown),Y(railTop-r.headThickness)],'rail-line')+line([X(-shown),Y(railTop)],[X(shown),Y(railTop)],'rail-line');
  for(const [a,c] of clipBoxes)svg+=rect(X(a),Y(dd+clipH),(c-a)*kk,clipH*kk,'runway-line');
  // Girder pieces: flanges, ends at the joint and breaks.
  for(const side of [-1,1]){
   const x0=side*sp.gap/2,x1=side*shown;
   for(const y of [0,tf,dd-tf,dd])svg+=line([X(x0),Y(y)],[X(x1),Y(y)],'runway-line');
   // The girder end: visible between the splice plates, hidden behind the near-side plates.
   const cover=[...(B.inner?[[tf,tf+tiB]]:[]),[dd/2-wi.height/2,dd/2+wi.height/2],...(T.inner?[[dd-tf-tiT,dd-tf]]:[])].sort((a,c)=>a[0]-c[0]);
   let y=0;for(const [a,c] of cover){if(a>y)svg+=line([X(x0),Y(y)],[X(x0),Y(a)],'runway-line');svg+=line([X(x0),Y(a)],[X(x0),Y(c)],'hidden-line');y=c;}
   if(dd>y)svg+=line([X(x0),Y(y)],[X(x0),Y(dd)],'runway-line');
   svg+=breakLine([X(x1),Y(railTop)-5],[X(x1),Y(-to)+5]);
  }
  // Splice plates on the near side.
  if(T.inner)svg+=rect(X(-T.half),Y(dd-tf),2*T.half*kk,tiT*kk,'runway-line');
  if(T.outer)svg+=rect(X(-T.half),Y(dd+toT),2*T.half*kk,toT*kk,'runway-line');
  if(B.inner)svg+=rect(X(-B.half),Y(tf+tiB),2*B.half*kk,tiB*kk,'runway-line');
  if(B.outer)svg+=rect(X(-B.half),Y(0),2*B.half*kk,to*kk,'runway-line');
  svg+=rect(X(-W.half),Y(dd/2+wi.height/2),2*W.half*kk,wi.height*kk,'runway-line');
  // Flange bolts: heads on the outer faces, nuts and washers inside the section.
  const topHead=dd+toT,topNut=dd-tf-tiT,bottomHead=-to,bottomNut=tf+tiB;
  for(const x of T.rows.flatMap(v=>[-v,v])){
   svg+=hexSide(X(x),Y(topHead),hx.corners*kk,hx.head*kk,-1)+rect(X(x-hx.washer.od/2),Y(topNut),hx.washer.od*kk,hx.washer.t*kk)+hexSide(X(x),Y(topNut-hx.washer.t),hx.corners*kk,hx.nut*kk,1);
   svg+=line([X(x),Y(topHead+hx.head)-3],[X(x),Y(topNut-hx.washer.t-hx.nut)+3],'grid-line');
  }
  for(const x of B.rows.flatMap(v=>[-v,v])){
   svg+=hexSide(X(x),Y(bottomHead),hx.corners*kk,hx.head*kk,1)+rect(X(x-hx.washer.od/2),Y(bottomNut+hx.washer.t),hx.washer.od*kk,hx.washer.t*kk)+hexSide(X(x),Y(bottomNut+hx.washer.t),hx.corners*kk,hx.nut*kk,-1);
   svg+=line([X(x),Y(bottomHead-hx.head)+3],[X(x),Y(bottomNut+hx.washer.t+hx.nut)-3],'grid-line');
  }
  // Web bolts end-on: the near-side heads with center marks.
  const webPts:XY[]=[];
  for(const x of W.columns.flatMap(v=>[-v,v]))for(const y of W.rows){const at:XY=[X(x),Y(dd/2+y)];webPts.push(at);svg+=hexPlan(at[0],at[1],hx.flats*kk)+line([at[0]-hx.flats*kk/2-2,at[1]],[at[0]+hx.flats*kk/2+2,at[1]],'grid-line')+line([at[0],at[1]-hx.flats*kk/2-2],[at[0],at[1]+hx.flats*kk/2+2],'grid-line');}
  // Joint C/L and the section at the joint.
  svg+=line([X(0),Y(railTop)-10],[X(0),Y(bottomHead-hx.head)+4],'grid-line');
  svg+=sectionCut([X(0),Y(railTop)-12],[X(0),Y(bottomHead-hx.head)+12],[-1,0],spliceTitles.section,['a'],'tip');
  // Bottom flange hole pattern below the plates; the web pattern between its middle rows.
  const pb=pattern({rows:B.rows,pitch:B.input.pitch,half:B.half,first:B.input.endDistance}),yb=Y(bottomHead-hx.head)+18;
  svg+=chain('h',pb.stations.map(X),pb.stations.map(x=>Math.abs(x)>=B.half-1?Y(-to):Y(bottomHead-hx.head)),yb,pb.labels);
  svg+=dimH(X(-B.half),X(B.half),Y(-to),yb+24+chainDepth(pb.stations.map(X),pb.labels),dim(B.length));
  // Callouts at the right.
  const nT=T.boltsPerSide,nB=B.boltsPerSide,nW=W.boltsPerSide,firstClip=clips.filter(x=>x>0).sort((a,c)=>a-c)[0];
  const items:{at:XY;labels:string[]}[]=[
   {at:[X(shown*.82),Y(railTop-r.headThickness/2)],labels:['CRANE RAIL CONTINUOUS OVER THE JOINT;',`RAIL JOINTS ${dim(railLayoutCriteria.clear)} MIN. FROM THE JOINT`]},
   ...(firstClip!==undefined&&firstClip<shown?[{at:[X(firstClip+kg.baseLength/2),Y(dd+clipH*.6)] as XY,labels:['RAIL CLIP EACH SIDE OF THE JOINT,',`SEE ${detailRef(detailTitles.railKeeper)} AND ${detailRef(spliceTitles.plan)}`]}]:[]),
   {at:[X(T.rows.at(-1)!+hx.corners/2),Y(topHead+hx.head*.5)],labels:[`${nT} - ${boltName} SC EACH SIDE,`,'TOP FLANGE, HEADS UP']},
   ...(T.inner?[{at:[X(T.half*.92),Y(dd-tf-tiT/2)] as XY,labels:[plateLabel(T,false),'INNER, TOP FLANGE']}]:[]),
   {at:[X(W.half),Y(dd/2+wi.height*.32)],labels:[webLabel,'WEB, BOTH SIDES']},
   {at:webPts.reduce((a,v)=>v[0]>a[0]||v[0]===a[0]&&v[1]<a[1]?v:a).map((v,i)=>v+(i?-hx.flats*kk/2:hx.flats*kk/2)) as XY,labels:[`${nW} - ${boltName} SC EACH SIDE,`,'WEB']},
   {at:[X(sp.gap/2),Y((bottomNut+hx.washer.t+hx.nut+dd/2-wi.height/2)/2)],labels:['GIRDER ENDS SAW CUT SQUARE,',`${size(sp.gap)} GAP AT THE JOINT C/L`]},
   ...(B.inner?[{at:[X(B.half*.92),Y(tf+tiB/2)] as XY,labels:[plateLabel(B,false),'INNER, BOTTOM FLANGE']}]:[]),
   ...(B.outer?[{at:[X(B.half*.92),Y(-to/2)] as XY,labels:[plateLabel(B,true),'OUTER, BOTTOM FLANGE']}]:[]),
   {at:[X(B.rows.at(-1)!+hx.corners/2),Y(bottomHead-hx.head*.5)],labels:[`${nB} - ${boltName} SC EACH SIDE,`,'BOTTOM FLANGE, HEADS DOWN']}
  ];
  svg+=labelColumn(items,X(shown)+34,Y(railTop)-8,Y(bottomHead-hx.head)+8);
  return {svg:svg+'</g>',scale:k.label};
 }});

 // 2: Section at the joint looking along the runway: the cut plates, the girder beyond and the bolts.
 views.push({title:spliceTitles.section,rows:2,render:()=>{
  const tf=b.tf,dd=b.d,to=B.outer?B.input.outerThickness:0,tiB=B.inner?B.input.innerThickness:0,tiT=T.inner?T.input.innerThickness:0,toT=T.outer?T.input.outerThickness:0;
  const below=to+hx.head+hx.washer.t,height=railTop+below,width=Math.max(b.bf,2*(b.tw/2+wi.thickness+hx.washer.t+hx.nut+g.hex.stickout));
  const k=drawingScale(Math.min(560/height,260/width),u),kk=k.pointsPerMm,Z=(z:number)=>z*kk,Y=(y:number)=>-y*kk;
  let svg='<g data-view="girder-splice-section">';
  const rf=Math.max(0,g.kdes-tf);
  // Girder end beyond: flanges, web and the web-to-flange fillets.
  svg+=rect(Z(-b.bf/2),Y(dd),b.bf*kk,tf*kk,'runway-line')+rect(Z(-b.bf/2),Y(tf),b.bf*kk,tf*kk,'runway-line');
  svg+=line([Z(-b.tw/2),Y(tf+rf)],[Z(-b.tw/2),Y(dd-tf-rf)],'runway-line')+line([Z(b.tw/2),Y(tf+rf)],[Z(b.tw/2),Y(dd-tf-rf)],'runway-line');
  for(const sz of [-1,1])for(const [yc,sy] of [[dd-tf,-1],[tf,1]] as const)svg+=`<path class="runway-line" d="M${n(Z(sz*b.tw/2))},${n(Y(yc+sy*rf))}A${n(rf*kk)},${n(rf*kk)} 0 0 ${sz*sy>0?0:1} ${n(Z(sz*(b.tw/2+rf)))},${n(Y(yc))}"/>`;
  // Cut splice plates.
  const cutPlates:{z0:number;z1:number;y0:number;y1:number}[]=[];
  if(T.inner)for(const sz of [-1,1])cutPlates.push({z0:sz*T.innerFrom,z1:sz*T.innerTo,y0:dd-tf-tiT,y1:dd-tf});
  if(T.outer)cutPlates.push({z0:-T.input.outerWidth/2,z1:T.input.outerWidth/2,y0:dd,y1:dd+toT});
  if(B.inner)for(const sz of [-1,1])cutPlates.push({z0:sz*B.innerFrom,z1:sz*B.innerTo,y0:tf,y1:tf+tiB});
  if(B.outer)cutPlates.push({z0:-B.input.outerWidth/2,z1:B.input.outerWidth/2,y0:-to,y1:0});
  for(const sz of [-1,1])cutPlates.push({z0:sz*b.tw/2,z1:sz*(b.tw/2+wi.thickness),y0:dd/2-wi.height/2,y1:dd/2+wi.height/2});
  for(const c of cutPlates){const z0=Math.min(c.z0,c.z1),z1=Math.max(c.z0,c.z1);svg+=rect(Z(z0),Y(c.y1),(z1-z0)*kk,(c.y1-c.y0)*kk,'runway-line');}
  // Rail on its pad and the clips each side, beyond.
  const rb=r.baseWidth/2,rh=r.headWidth/2,rw=r.webThickness/2,y0=dd+pad;
  if(pad>0){const pw=(railPad(p)?.width??r.baseWidth)/2;svg+=rect(Z(-pw),Y(y0),2*pw*kk,pad*kk,'rail-line');}
  svg+=path([[Z(-rb),Y(y0)],[Z(rb),Y(y0)],[Z(rb),Y(y0+r.baseThickness)],[Z(rw),Y(y0+r.baseThickness)],[Z(rw),Y(railTop-r.headThickness)],[Z(rh),Y(railTop-r.headThickness)],[Z(rh),Y(railTop)],[Z(-rh),Y(railTop)],[Z(-rh),Y(railTop-r.headThickness)],[Z(-rw),Y(railTop-r.headThickness)],[Z(-rw),Y(y0+r.baseThickness)],[Z(-rb),Y(y0+r.baseThickness)]],'rail-line');
  for(const sz of [-1,1] as const)svg+=path(clipOutline(kg,sz).map(([z,y])=>[Z(z),Y(dd+y)] as XY),'runway-line');
  // Flange bolts beyond the cut: heads out, nuts in.
  const topHead=dd+toT,topNut=dd-tf-tiT,bottomHead=-to,bottomNut=tf+tiB;
  // A clip between the girder end and the first bolt row stands nearer the cut than the heads: they are hidden behind it.
  const pocket=clips.some(x=>x<0&&x>-T.rows[0]),zk=[kg.inner,kg.outer];
  for(const z of T.lines.flatMap(v=>[-v,v])){
   const behind=pocket&&Math.abs(z)+hx.corners/2>zk[0]&&Math.abs(z)-hx.corners/2<zk[1];
   svg+=hexSide(Z(z),Y(topHead),hx.corners*kk,hx.head*kk,-1,behind?'hidden-line':'runway-line')+rect(Z(z-hx.washer.od/2),Y(topNut),hx.washer.od*kk,hx.washer.t*kk)+hexSide(Z(z),Y(topNut-hx.washer.t),hx.corners*kk,hx.nut*kk,1);
   svg+=line([Z(z),Y(topHead+hx.head)-3],[Z(z),Y(topNut-hx.washer.t-hx.nut)+3],'grid-line');
  }
  for(const z of B.lines.flatMap(v=>[-v,v])){
   svg+=hexSide(Z(z),Y(bottomHead),hx.corners*kk,hx.head*kk,1)+rect(Z(z-hx.washer.od/2),Y(bottomNut+hx.washer.t),hx.washer.od*kk,hx.washer.t*kk)+hexSide(Z(z),Y(bottomNut+hx.washer.t),hx.corners*kk,hx.nut*kk,-1);
   svg+=line([Z(z),Y(bottomHead-hx.head)+3],[Z(z),Y(bottomNut+hx.washer.t+hx.nut)-3],'grid-line');
  }
  // Web bolts: heads on the far (+) side, nuts on the near side.
  const face=b.tw/2+wi.thickness;
  for(const y of W.rows){const yy=Y(dd/2+y);svg+=hexSideH(Z(face),yy,hx.corners*kk,hx.head*kk,1)+rect(Z(-face-hx.washer.t),yy-hx.washer.od*kk/2,hx.washer.t*kk,hx.washer.od*kk)+hexSideH(Z(-face-hx.washer.t),yy,hx.corners*kk,hx.nut*kk,-1)+line([Z(-face-hx.washer.t-hx.nut)-3,yy],[Z(face+hx.head)+3,yy],'grid-line');}
  svg+=line([Z(0),Y(railTop)-4],[Z(0),Y(bottomHead-hx.head)+4],'grid-line');
  // Dimensions: top gauge and flange width above the rail; bottom gauge and outer plate below; web plate and bolts at the left.
  const yTop=Y(railTop)-20;
  svg+=dimH(Z(-T.lines[0]),Z(T.lines[0]),Y(topHead+hx.head)-2,yTop,size(2*T.lines[0]));
  svg+=dimH(Z(-b.bf/2),Z(b.bf/2),Y(dd)-2,yTop-18,size(b.bf));
  const yBot=Y(bottomHead-hx.head)+20;
  svg+=dimH(Z(-B.lines[0]),Z(B.lines[0]),Y(bottomHead-hx.head)+2,yBot,size(2*B.lines[0]));
  if(B.outer)svg+=dimH(Z(-B.input.outerWidth/2),Z(B.input.outerWidth/2),Y(-to)+2,yBot+18,size(B.input.outerWidth));
  const xl=Z(-b.bf/2)-16,rows=[...W.rows].sort((a,c)=>c-a);
  svg+=chain('v',[Y(dd/2+wi.height/2),...rows.map(y=>Y(dd/2+y)),Y(dd/2-wi.height/2)],[Z(-face),...rows.map(()=>Z(-face-hx.washer.t-hx.nut)-2),Z(-face)],xl,[size(W.verticalEdge),...rows.slice(1).map(()=>size(wi.pitch)),size(W.verticalEdge)]);
  svg+=dimV(Y(dd/2+wi.height/2),Y(dd/2-wi.height/2),Z(-face),xl-26,dim(wi.height));
  // Callouts: plates and bolts at the right, rail, clips and web at the left.
  const items:{at:XY;labels:string[]}[]=[
   ...(T.inner?[{at:[Z(T.innerTo),Y(dd-tf-tiT/2)] as XY,labels:[plateLabel(T,false).replace(/ X [^X]*$/,''),'INNER, FLUSH WITH FLANGE TIPS']}]:[]),
   {at:[Z(T.lines[0]+hx.corners/2),Y(topHead+hx.head*.5)],labels:[`${boltName} SC, STD. ${holeInches(hole,u)} HOLES`,`L = ${dim(boltLength(db,grip.top,u))}, HEADS UP`]},
   {at:[Z(face+hx.head),Y(dd/2+rows[0])],labels:[`${boltName} SC, WEB,`,`L = ${dim(boltLength(db,grip.web,u))}`]},
   {at:[Z(b.tw/2+wi.thickness),Y(dd/2-wi.height*.35)],labels:[webLabel.replace(/ X [^X]*$/,''),'WEB, BOTH SIDES']},
   ...(B.inner?[{at:[Z(B.innerTo),Y(tf+tiB/2)] as XY,labels:[plateLabel(B,false).replace(/ X [^X]*$/,''),'INNER, FLUSH WITH FLANGE TIPS']}]:[]),
   ...(B.outer?[{at:[Z(B.input.outerWidth/2),Y(-to/2)] as XY,labels:[plateLabel(B,true).replace(/ X [^X]*$/,''),'OUTER, BOTTOM FLANGE']}]:[]),
   {at:[Z(B.lines[0]+hx.corners/2),Y(bottomHead-hx.head*.5)],labels:[`${boltName} SC,`,`L = ${dim(boltLength(db,grip.bottom,u))}, HEADS DOWN`]}
  ];
  const left:{at:XY;labels:string[]}[]=[
   {at:[Z(-rh),Y(railTop-r.headThickness/2)],labels:['CRANE RAIL ON ITS PAD,','BEARING ON THE GIRDER FLANGE']},
   {at:[Z(-kg.outer),Y(dd+clipH*.5)],labels:['RAIL CLIP BEYOND,',`SEE ${detailRef(detailTitles.railKeeper)}`]},
   {at:[Z(-b.bf/2),Y(dd-tf/2)],labels:[`${b.name} GIRDER BEYOND,`,'END SAW CUT SQUARE']}
  ];
  const right=Math.max(Z(b.bf/2),Z(face+hx.head))+34,lw=Math.max(...left.flatMap(v=>v.labels.map(l=>textWidth(labelCaps(l),lettering.text))));
  svg+=labelColumn(items,right,Y(railTop),Y(bottomHead-hx.head));
  svg+=labelColumn(left,xl-52-lw,Y(railTop)-4,Y(dd/2+wi.height/2)-30);
  return {svg:svg+'</g>',scale:k.label};
 }});

 // 3: Top flange plan: the bolt heads beside the rail and the clips clear of them and of the joint.
 views.push({title:spliceTitles.plan,render:()=>{
  const near=clips.filter(x=>Math.abs(x)<T.half+kg.baseLength),shown=Math.max(T.half,...near.map(x=>Math.abs(x)+kg.baseLength/2))+1.5*inch;
  const k=drawingScale(Math.min(400/(2*shown),150/b.bf),u),kk=k.pointsPerMm,X=(x:number)=>x*kk,Zp=(z:number)=>z*kk;
  let svg='<g data-view="top-flange-splice-plan">';
  for(const side of [-1,1]){
   const x0=side*sp.gap/2,x1=side*shown;
   for(const z of [-b.bf/2,b.bf/2])svg+=line([X(x0),Zp(z)],[X(x1),Zp(z)],'runway-line');
   svg+=line([X(x0),Zp(-b.bf/2)],[X(x0),Zp(b.bf/2)],'runway-line')+breakLine([X(x1),Zp(-b.bf/2)-5],[X(x1),Zp(b.bf/2)+5]);
  }
  // Inner plates below the flange, hidden.
  if(T.inner)for(const sz of [-1,1]){const z0=Math.min(sz*T.innerFrom,sz*T.innerTo),z1=Math.max(sz*T.innerFrom,sz*T.innerTo);svg+=rect(X(-T.half),Zp(z0),2*T.half*kk,(z1-z0)*kk,'hidden-line');}
  // Rail base and head over the joint.
  const rb=r.baseWidth/2,rh=r.headWidth/2;
  for(const z of [-rb,rb,-rh,rh])svg+=line([X(-shown),Zp(z)],[X(shown),Zp(z)],'rail-line');
  // Clips each side of the rail.
  for(const x of near)for(const sz of [-1,1]){const z0=Math.min(sz*kg.inner,sz*kg.outer),z1=Math.max(sz*kg.inner,sz*kg.outer);svg+=rect(X(x-kg.baseLength/2),Zp(z0),kg.baseLength*kk,(z1-z0)*kk,'runway-line');}
  // Bolt heads.
  const heads:XY[]=[];
  for(const x of T.rows.flatMap(v=>[-v,v]))for(const z of T.lines.flatMap(v=>[-v,v])){const at:XY=[X(x),Zp(z)];heads.push(at);svg+=hexPlan(at[0],at[1],hx.flats*kk);}
  svg+=line([X(0),Zp(-b.bf/2)-4],[X(0),Zp(b.bf/2)+4],'grid-line')+line([X(-shown)-6,Zp(0)],[X(shown)+6,Zp(0)],'grid-line');
  // Hole pattern below; clip centers from the joint above.
  const pt=pattern({rows:T.rows,pitch:T.input.pitch,half:T.half,first:T.input.endDistance}),yb=Zp(b.bf/2)+18;
  svg+=chain('h',pt.stations.map(X),pt.stations.map(x=>Math.abs(x)>=T.half-1?Zp(T.innerTo):Zp(T.lines.at(-1)!)+hx.flats*kk/2),yb,pt.labels);
  const right=near.filter(x=>x>0).sort((a,c)=>a-c);
  if(right.length){const at=[0,...right],len=(v:number)=>v<12*inch?size(v):dim(v);svg+=chain('h',at.map(X),at.map((x,i)=>i?Zp(-kg.outer)-2:Zp(-b.bf/2)-12),Zp(-b.bf/2)-18,right.map((x,i)=>len(x-(i?right[i-1]:0))));}
  const xl=X(-shown)-14;
  svg+=dimV(Zp(-T.lines[0]),Zp(T.lines[0]),X(-T.rows.at(-1)!)-hx.flats*kk/2,xl,size(2*T.lines[0]));
  // Callouts at the right.
  const items:{at:XY;labels:string[]}[]=[
   {at:[X(shown*.9),Zp(-rh)],labels:['CRANE RAIL HEAD AND BASE']},
   ...(right.length?[{at:[X(right[0]+kg.baseLength/2),Zp(-kg.outer)] as XY,labels:['RAIL CLIPS EACH SIDE OF THE JOINT,',`${size(spliceRules.clipClear)} CLEAR OF GIRDER ENDS AND HEADS`]}]:[]),
   {at:heads.reduce((a,v)=>v[0]>a[0]||v[0]===a[0]&&v[1]>a[1]?v:a).map((v,i)=>v+(i?hx.flats*kk/2:0)) as XY,labels:[`${T.boltsPerSide} HEADS EACH SIDE, ${size(2*T.lines[0])} GAUGE,`,'CLEAR OF THE RAIL BASE']},
   ...(T.inner?[{at:[X(T.half),Zp((T.innerFrom+T.innerTo)/2)] as XY,labels:['INNER PLATES BELOW (HIDDEN)']}]:[])
  ];
  svg+=labelColumn(items,X(shown)+30,Zp(-b.bf/2)-24,Zp(b.bf/2)+30);
  return {svg:svg+'</g>',scale:k.label};
 }});


 // 4: Web splice plate, with its holes and the matching holes of the girder webs.
 views.push({title:spliceTitles.webPlate,render:()=>{
  const L=W.length,H=wi.height,k=drawingScale(Math.min(380/L,200/H),u),kk=k.pointsPerMm,X=(x:number)=>x*kk,Y=(y:number)=>-y*kk;
  let svg='<g data-view="web-splice-plate">'+rect(X(-L/2),Y(H/2),L*kk,H*kk,'runway-line');
  const holes:XY[]=[];
  for(const x of W.columns.flatMap(v=>[-v,v]))for(const y of W.rows){const at:XY=[X(x),Y(y)];holes.push(at);svg+=`<circle class="runway-line" cx="${n(at[0])}" cy="${n(at[1])}" r="${n(hole/2*kk)}"/>`+line([at[0]-hole/2*kk-2.5,at[1]],[at[0]+hole/2*kk+2.5,at[1]],'grid-line')+line([at[0],at[1]-hole/2*kk-2.5],[at[0],at[1]+hole/2*kk+2.5],'grid-line');}
  svg+=line([X(0),Y(H/2)-12],[X(0),Y(-H/2)+4],'grid-line')+text(X(0),Y(H/2)-15,'C/L JOINT',lettering.text,'middle',700);
  const pw=pattern({rows:W.columns,pitch:wi.spacing,half:W.half,first:wi.endDistance}),yb=Y(-H/2)+18;
  svg+=chain('h',pw.stations.map(X),pw.stations.map(x=>Math.abs(x)>=W.half-1?Y(-H/2):Y(Math.min(...W.rows))+hole/2*kk),yb,pw.labels);
  svg+=dimH(X(-L/2),X(L/2),Y(-H/2),yb+24+chainDepth(pw.stations.map(X),pw.labels),dim(L));
  const rows=[...W.rows].sort((a,c)=>c-a),xl=X(-L/2)-14;
  // Equal pitches as one group, the rows' ends at the outer bolts.
  const ends=rows.length>1?[rows[0],rows.at(-1)!]:[rows[0]],group=rows.length>2?`${rows.length-1} @ ${size(wi.pitch)}`:size(wi.pitch);
  svg+=chain('v',[Y(H/2),...ends.map(Y),Y(-H/2)],[X(-L/2),...ends.map(()=>X(-W.half+sp.edge)-hole/2*kk),X(-L/2)],xl,[size(W.verticalEdge),...(rows.length>1?[group]:[]),size(W.verticalEdge)]);
  svg+=dimV(Y(H/2),Y(-H/2),X(-L/2),xl-28,dim(H));
  const items:{at:XY;labels:string[]}[]=[
   {at:[X(L/2),Y(H*.3)],labels:[`${webLabel},`,'ASTM A572 GR. 50, ONE EACH SIDE OF THE WEB']},
   {at:holes.reduce((a,v)=>v[0]>a[0]||v[0]===a[0]&&v[1]>a[1]?v:a).map((v,i)=>v+(i?hole/2*kk*.7:hole/2*kk*.7)) as XY,labels:[`${2*W.boltsPerSide} - ${holeInches(hole,u)} STD. HOLES,`,`MATCHING HOLES IN EACH GIRDER WEB, ${size(wi.endDistance)}`,'FROM THE GIRDER END TO THE FIRST COLUMN']}
  ];
  svg+=labelColumn(items,X(L/2)+30,Y(H/2),Y(-H/2)+20);
  return {svg:svg+'</g>',scale:k.label};
 }});

 // Notes and design data.
 const results=s.detailResults?.splices,props=s.properties!,basis=spliceBasis(p,props,sp,g),force=(v:number,q:Parameters<typeof format>[1]='force')=>{const t=format(v,q,u,u==='SI'?1:2);return u==='US'?t.toUpperCase():t;};
 const ratio=(id:string)=>{const c=s.checks.find(v=>v.id===id);return c?.utilization!==undefined?`${c.status==='fail'?'FAILS ':''}${dcText(c.utilization,2,'-',c.status)}`:'-';};
 const grids=p.spans.reduce((a,v)=>[...a,a.at(-1)!+v],[0]),from=(x:number)=>{const i=grids.reduce((best,gx,j)=>Math.abs(gx-x)<Math.abs(grids[best]-x)?j:best,0);return `${dim(Math.abs(x-grids[i]))} ${x<grids[i]?'BEFORE':'PAST'} GRID ${i+1}`;};
 const env=results?.stations??[];
 const rows=[
  ['SPLICES',layout.stations.map((x,i)=>`${marks[i]}: ${from(x)}`).join('; ')],
  ['DESIGN BASIS',sp.basis==='full'?'FULL AVAILABLE FLANGE STRENGTH (DG7)':'LARGER OF THE FACTORED FORCES AND 50% OF THE FLANGE STRENGTH (AISC 360 J6; DG7)'],
  ['FLANGE STRENGTH / MINIMUM',`${force(basis.top.strength)} / ${force(basis.minimum.top)} EACH FLANGE`],
  ['WEB SHEAR STRENGTH / MINIMUM',`${force(basis.web)} / ${force(basis.minimum.web)}`],
  ...env.map(v=>[`${v.mark} FACTORED (${p.method})`,`M ${force(v.momentMax,'moment')} / ${force(v.momentMin,'moment')}; V ${force(v.shear)}; P ${force(v.axial)}; TOP FL. LAT. M ${force(v.topLateral,'moment')}`]),
  ['BOLTS',`${boltName} (ASTM F3125), SC CLASS ${sp.surface}, STD. HOLES; ${T.boltsPerSide} TOP, ${B.boltsPerSide} BOTTOM, ${W.boltsPerSide} WEB EACH SIDE`],
  ['RATIOS: BOLTS TOP / BOTTOM / WEB',`${ratio('splice-top-bolt-shear')} / ${ratio('splice-bottom-bolt-shear')} / ${ratio('splice-web-bolt-shear')}`],
  ['RATIOS: PLATES / SLIP / FATIGUE',`${ratio('splice-top-plate-rupture')} / ${ratio('splice-top-slip')} / ${ratio('splice-fatigue-girder')}`]
 ];
 const notes=[
  `GIRDER FIELD SPLICES ${marks.join(', ')} ONLY WHERE SHOWN ON S-01. GIRDER PIECES ${dim(sp.maxPiece)} MAX. NO OTHER SPLICES WITHOUT THE ENGINEER OF RECORD'S APPROVAL.`,
  `SPLICE PLATES ASTM A572 GR. 50. SAW CUT THE GIRDER ENDS SQUARE; ${size(sp.gap)} GAP AT THE JOINT. DRILL OR SUB-PUNCH AND REAM THE ${holeInches(hole,u)} STANDARD HOLES IN THE PLATES AND GIRDER TO A COMMON TEMPLATE; SHOP ASSEMBLE THE SPLICE TO MATCH-MARK THE PIECES.`,
  `SLIP-CRITICAL JOINTS: ${boltName} BOLTS, ASTM A563 DH HEAVY HEX NUTS AND F436 WASHERS UNDER THE TURNED ELEMENT. FAYING SURFACES CLASS ${sp.surface} (${sp.surface==='B'?'BLAST-CLEANED, UNCOATED, MU 0.50':'CLEAN MILL SCALE, MU 0.30'}), FREE OF PAINT, OIL AND LOOSE SCALE; MASK THE FAYING SURFACES OF COATED MEMBERS.`,
  'DRAW THE PLIES INTO FIRM CONTACT, THEN PRETENSION EVERY BOLT BY TURN-OF-NUT OR DIRECT-TENSION-INDICATOR METHOD PER RCSC SECTION 8, FROM THE MIDDLE OF EACH BOLT GROUP OUTWARD; BOLTS LEFT SNUG-TIGHT ARE NOT PERMITTED. NUTS INSIDE THE SECTION ARE TURNED; HOLD THE HEADS.',
  'SPECIAL INSPECTION: PRE-INSTALLATION VERIFICATION OF THE BOLT ASSEMBLIES AND THE PRETENSIONING METHOD (RCSC SECTION 7), FAYING SURFACE CONDITION BEFORE ASSEMBLY, AND ROUTINE OBSERVATION OF PRETENSIONING (AISC 360 N5.6, PERFORM).',
  `THE TOP FLANGE IS SPLICED WITH INNER PLATES ONLY: THE RAIL${pad>0?', ITS PAD':''} AND THE CLIPS BEAR ON THE GIRDER FLANGE ACROSS THE JOINT. SET THE CLIPS AT THE SPLICE ${size(spliceRules.clipClear)} CLEAR OF THE GIRDER ENDS AND BOLT HEADS, AS DIMENSIONED, AND WELD THEM AFTER THE SPLICE BOLTS ARE PRETENSIONED; THEN VERIFY THE PRETENSION OF THE TOP FLANGE BOLTS NEAREST THE WELDS.`,
  `KEEP RAIL JOINTS ${dim(railLayoutCriteria.clear)} MIN. FROM THE GIRDER SPLICES (${detailRef(detailTitles.railLayout)}).`
 ];
 return {key:'girder-splice',name:'GIRDER SPLICES',views,notes:(t:Style)=>[heading(t,'GIRDER SPLICE DESIGN DATA'),table(t,['ITEM','VALUE'],rows,[1.2,1.8]),heading(t,'GIRDER SPLICE NOTES'),...numbered(t,notes)]};
}

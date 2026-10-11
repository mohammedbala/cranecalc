import {supportColumn,runwayElevations} from '../engine/drawingData';
import {heading,numbered,type Style} from './noteBlocks';
import type {CalculationSnapshot} from '../engine/types';
import {drawingLength,drawingElevation,electrodeClass,plateInches} from './drawingFormat';
import {sheetDrawingScale,textWidth,wrapToWidth,labelCaps,line,rect,text,circle,n,dimH,dimV,breakLine,multiLeader,filletLeader,detailRef,detailTitles,sectionCut,bearingBoltsTitle,capChannelSection,type XY} from './sheetGraphics';
import type {DetailTopic,DetailView} from './detailSheet';
import {format} from '../engine/units';
import {bracketForceBlocks} from './bracketForceTable';
import {designsBracing} from '../engine/newColumnBracing';
import {activeEndBearing} from '../engine/endBearingInputs';
import {flangeTieGeometry} from '../engine/tieGeometry';
import {railTopAboveSteel} from '../engine/railSeat';
import {usesTaperedHaunch,projectHaunch} from '../engine/taperedHaunch';
import {taperedHaunchParts} from '../engine/taperedHaunchParts';
import {grooveLeader} from './rolledBracketSheet';
import {stiffenerDrawing,stiffenerSideEdges,lowerEdgeTarget,stiffenerPlan,stiffenerFaceHidden,columnStiffenerView,columnStiffenerTitle,stiffenerNotes} from './columnStiffenerDrawing';

/** Titles of the haunch's plan and section; its elevation along the runway is the bracket transverse section. */
export const haunchPlanTitle='TAPERED HAUNCH / TOP FLANGE PLAN';
export const haunchSectionTitle='TAPERED HAUNCH / SECTION AT STIFFENERS';
type Item={at:XY;labels:string[];weld?:string;both?:boolean;field?:boolean;groove?:boolean;allAround?:boolean};
/** Callouts in a column at x, ordered by target height (or as given) between top and bottom: plain, fillet or CJP groove. */
function calloutColumn(items:Item[],x:number,top:number,bottom:number,sort=true){
 const sorted=sort?[...items].sort((a,b)=>a.at[1]-b.at[1]):items,height=(v:Item)=>(v.weld||v.groove?17:0)+v.labels.length*11;
 const total=sorted.reduce((a,v)=>a+height(v),0),gap=Math.max(8,(bottom-top-total)/Math.max(1,sorted.length-1));
 let y=top,svg='';
 for(const v of sorted){
  svg+=v.groove?grooveLeader([v.at],[x,y+3],v.labels,v.field):v.weld?filletLeader([v.at],[x,y+3],v.weld,v.labels,!!v.both,[],!!v.field,!!v.allAround):multiLeader([v.at],[x,y],v.labels);
  y+=height(v)+gap;
 }
 return svg;
}
/**
 * Vertical dimension whose two extension lines leave the part at different x (dimV with one origin per end). The
 * text is centered on `at` (the middle by default) where it fits between the ends, else beyond the lower end.
 */
function dimVFrom(y1:number,x1:number,y2:number,x2:number,x:number,label:string,at=(y1+y2)/2){
 const w=textWidth(label,9),lo=Math.min(y1,y2),far=Math.max(y1,y2),fits=at-w/2-3>=lo&&at+w/2+3<=far,ext=(from:number)=>x+(x<from?-4:5);
 return line([x1,y1],[ext(x1),y1])+line([x2,y2],[ext(x2),y2])+line([x,lo],[x,fits?far:far+w+6])+[y1,y2].map(y=>line([x-3,y+2.5],[x+3,y-2.5])).join('')+text(x-6,fits?at:far+4+w/2,label,9,'middle',400,-90);
}
/** Rows of a label no wider than `width`, never breaking a dimension (1'-0 9/16", 12.7 mm). */
const wrapRows=(v:string,width:number,size=8.5)=>wrapToWidth(labelCaps(v).replace(/(\d) (\d+\/\d+|mm\b|m\b)/g,'$1\u00a0$2'),width,size).map(r=>r.replaceAll('\u00a0',' '));
/** Callout lines no wider than a weld reference line, so a leader leaving its far end clears the text. */
const wrapped=(v:string)=>wrapRows(v,90,8);
const poly=(pts:XY[],cls='runway-line')=>`<path class="${cls}" d="M${pts.map(q=>`${n(q[0])},${n(q[1])}`).join('L')}Z"/>`;

/** Built-up tapered I haunch: elevation along the runway, plan of the top flange and section at the stiffeners, with notes. */
export function taperedHaunchTopic(s:CalculationSnapshot):DetailTopic|undefined{
 const p=s.input,d=p.details,b=d?.bracket;if(!d||!b?.enabled||!usesTaperedHaunch(p))return undefined;
 const parts=taperedHaunchParts(p),g=parts.geometry,st=g.stiffener,c=b.receiver;
 const dim=(v:number)=>drawingLength(v,p.units),size=(v:number)=>plateInches(v,p.units);
 const sc=supportColumn(p),collector=designsBracing(p),eb=activeEndBearing(p),W=d.bearing.width,tbp=d.bearing.thickness,where=sc.isNew?'SHOP':'FIELD';
 const {L,a,hr,ht,tt,tbv,tw,bt,btr,bb}=g,tep=g.endPlate?st.t:0,Lw=L-tep,deg=g.degrees.toFixed(1),f=g.flare;
 const under=(y:number)=>-g.depth(y),inner=(y:number)=>-g.depth(y)+tbv;
 const colName=sc.isNew?sc.name:`EXISTING ${p.existingColumn?.enabled&&p.existingColumn.shape?p.existingColumn.shape+' ':''}COLUMN`;
 const topLabel=`TOP FL. PL ${size(tt)} X ${dim(bt)}${f?` (${dim(btr)} AT COLUMN)`:''}`,webLabel=`WEB PL ${size(tw)}`,botLabel=`BOTTOM FL. PL ${size(g.tb)} X ${dim(bb)}`;
 const stiffLabel=`2 STIFF. PL ${size(st.t)} X ${size(st.width)}`;
 const flangeWeld=(target:XY,which:string):Item=>g.joint==='cjp'?{at:target,labels:[`${which} FLANGE TO COLUMN`,`FLANGE, ${where}`],groove:true,field:sc.field}:{at:target,labels:[`${which} FLANGE, BOTH FACES,`,`TO COLUMN FLANGE, ${where}`],weld:size(g.flangeWeld),both:true,field:sc.field};
 const views:DetailView[]=[],cs=stiffenerDrawing(p),colCls=sc.isNew?'runway-line':'reference-line';
 // 1. Elevation looking along the runway: the existing column flange, the haunch with its stiffeners edge-on and its
 // tip end plate, the girder end, bearing plate and rail in phantom on the girder web line.
 views.push({title:detailTitles.weldedBracket,render:()=>{
  // The girder end is drawn with its web broken: 3 in of web above the bottom flange and below the top flange.
  const sec=p.section,cap=sec.kind==='cap'?sec.capTw:0,web=3*25.4,gap=1.5*25.4,shown=2*sec.tf+2*web+gap,above=tbp+shown+cap+railTopAboveSteel(p);
  // Callouts above the haunch at the left: the stiffeners (their welds are on the section) and the end plate weld,
  // its lines no wider than the weld reference line.
  const stiffLabels=wrapRows(`${stiffLabel} AT GIRDER C/L; SEE ${detailRef(haunchSectionTitle)}`,130),endLabels=wrapped(`END PL ${size(tep)}, ALL AROUND, SHOP`);
  const need=11*stiffLabels.length+(g.endPlate?8+17+11*endLabels.length:0);
  // Fit within the detail cell (312 high): the callouts above, the haunch, the dimensions below.
  const scale=sheetDrawingScale(Math.min(.3,205/(hr+above),250/(L+(cs?c.depth:0)),Math.max(40,296-need-60)/hr),p.units),k=scale.pointsPerMm;
  const X=(y:number)=>-y*k,Y=(z:number)=>-z*k,tc=c.flangeThickness*k,topY=Y(above)-14,botY=Y(-hr)+16;
  let svg='<g data-view="tapered-haunch-elevation">';
  // Existing column flange (receiving face at x = 0) and the haunch plates.
  svg+=rect(0,topY,tc,botY-topY,colCls);
  // Column stiffeners edge-on between the flanges at the haunch flange levels, with the far flange.
  if(cs)svg+=stiffenerSideEdges(cs.g,{face:0,k,Y,top:topY,bottom:botY,cls:colCls});
  svg+=rect(X(L),Y(0),L*k,tt*k,'runway-line');
  svg+=poly([[X(0),Y(-hr)],[X(L),Y(-ht)],[X(L),Y(inner(L))],[X(0),Y(inner(0))]]);
  if(g.endPlate)svg+=poly([[X(L),Y(-tt)],[X(Lw),Y(-tt)],[X(Lw),Y(inner(Lw))],[X(L),Y(inner(L))]]);
  else svg+=line([X(L),Y(-tt)],[X(L),Y(inner(L))],'runway-line');
  svg+=poly([[X(a-st.t/2),Y(-tt)],[X(a+st.t/2),Y(-tt)],[X(a+st.t/2),Y(inner(a+st.t/2))],[X(a-st.t/2),Y(inner(a-st.t/2))]]);
  // Bearing plate, and the girder end and rail beyond it in phantom.
  svg+=rect(X(a+W/2),Y(tbp),W*k,tbp*k,'runway-line');
  const gx=(x:number)=>X(a+x),bf=sec.bf,tf=sec.tf,gw=sec.tw,z0=tbp,zw=z0+tf+web,zg=zw+gap,z1=zg+web+tf;
  svg+=rect(gx(bf/2),Y(z0+tf),bf*k,tf*k,'reference-line')+rect(gx(gw/2),Y(zw),gw*k,web*k,'reference-line')+rect(gx(gw/2),Y(z1-tf),gw*k,web*k,'reference-line')+rect(gx(bf/2),Y(z1),bf*k,tf*k,'reference-line');
  for(const z of [zw,zg])svg+=breakLine([gx(bf/2+12),Y(z)],[gx(-bf/2-12),Y(z)]);
  if(cap)svg+=capChannelSection(sec,(x,z)=>[gx(x),Y(z1+z)],'reference-line');
  const r=d.rail,rz=z1+cap+railTopAboveSteel(p)-p.railHeight;
  svg+=rect(gx(r.baseWidth/2),Y(rz+r.baseThickness),r.baseWidth*k,r.baseThickness*k,'reference-line')+rect(gx(r.webThickness/2),Y(rz+p.railHeight-r.headThickness),r.webThickness*k,(p.railHeight-r.headThickness-r.baseThickness)*k,'reference-line')+rect(gx(r.headWidth/2),Y(rz+p.railHeight),r.headWidth*k,r.headThickness*k,'reference-line');
  // Girder web line (runway centerline at the bracket), carried down as the reach extension line.
  svg+=line([X(a),Y(rz+p.railHeight)-10],[X(a),Y(-hr)+23],'grid-line');
  // Dimensions: reach and projection below; tip and root depths beyond the tip; top of the haunch.
  svg+=dimH(X(a),X(0),Y(-hr)+3,Y(-hr)+18,dim(a));
  svg+=line([X(L),Y(-ht)+3],[X(L),Y(-hr)+3])+dimH(X(L),X(0),Y(-hr)+3,Y(-hr)+38,dim(L));
  // The tip depth inside the root depth; where the tip's text does not fit between its ends (it would then sit on the
  // root's long lower extension line), the root depth inside instead, its text clear of the tip's extension line.
  const rw=textWidth(dim(hr),9)/2+4,yt=Y(-ht),mid=(Y(0)+Y(-hr))/2;
  if(textWidth(dim(ht),9)+6<=yt-Y(0)){
   svg+=dimVFrom(Y(0),X(L)-4,Y(-ht),X(L)-4,X(L)-18,dim(ht));
   svg+=dimVFrom(Y(0),X(L)-4,Y(-hr),X(0)-3,X(L)-40,dim(hr));
  }else{
   const rootAt=Math.abs(mid-yt)>=rw?mid:Y(-hr)-yt>=2*rw?(yt+Y(-hr))/2:yt-Y(0)>=2*rw?(Y(0)+yt)/2:Y(-hr)+1e3;
   svg+=dimVFrom(Y(0),X(L)-4,Y(-hr),X(0)-3,X(L)-18,dim(hr),rootAt);
   svg+=dimVFrom(Y(0),X(L)-4,Y(-ht),X(L)-4,X(L)-40,dim(ht));
  }
  const el=runwayElevations(p),elev=el?`T.O. HAUNCH (SEAT) EL. ${drawingElevation(el.seat,p.units)}`:'T.O. HAUNCH (SEAT)';
  svg+=`<g data-elevation-datum="top-of-haunch">${line([X(L)-44,Y(0)],[X(L)-58,Y(0)])}<path class="leader-arrow" d="M${n(X(L)-50)},${n(Y(0))}l-2.4,-2.4h4.8z"/>${text(X(L)-60,Y(0)+3,elev,8.5,'end')}</g>`;
  // Slope of the bottom flange, in the space below it where it fits above the root-depth extension line.
  // Right of the girder web line, clear of it and of the column, where it fits above the root-depth extension line.
  const slope=`SLOPE ${deg}°`,sw=textWidth(slope,8),sx=X(a)+6,sy=Y(under(a-(6+sw)/k))+10;
  if(sy<Y(-hr)-4&&sx+sw<-4)svg+=text(sx,sy,slope,8,'start');
  // Callouts: the column joints and the girder-side parts on the right; the shop welds above the haunch.
  const right:Item[]=[
   {at:[tc+2,topY+8],labels:[colName,sc.isNew?'CHECKED UNDER NEW COLUMN':'SURVEY-VERIFIED SECTION']},
   flangeWeld([0,Y(-tt/2)],'TOP'),
   {at:[0,Y((-tt+inner(0))/2)],labels:['WEB TO COLUMN FLANGE,',`BOTH SIDES, ${where}`],weld:size(g.webWeld),both:true,field:sc.field},
   flangeWeld([0,Y(-hr+tbv/2)],'BOTTOM'),
   {at:[X(a-W*.3),Y(tbp)],labels:[`BEARING PL ${size(tbp)} X ${dim(W)}`,`EACH GIRDER END; ${detailRef(eb?bearingBoltsTitle(p):detailTitles.bearing)}`]},
   {at:[gx(-sec.bf/2),Y(z0+tf/2)],labels:['RUNWAY GIRDER, RAIL (PHANTOM)']},
   ...(cs?[{at:lowerEdgeTarget(cs.g,{face:0,k,Y}),labels:cs.callout.flatMap(v=>wrapRows(v,230))}]:[])
  ];
  svg+=calloutColumn(right,(cs?c.depth*k:tc)+46,topY-6,botY+(cs?60:24));
  // Targets step down and toward the tip, so the leaders nest: the stiffener, the bottom flange-to-web joint near the
  // tip, the end plate.
  // Targets just under the top flange, so the leaders run above the depth dimensions' text; the farther target
  // takes the upper label, so the leaders nest.
  const left:Item[]=[
   {at:[X(a+st.t/2),Y(-tt)+Math.min(6,st.height*k*.3)],labels:stiffLabels},
   ...(g.endPlate?[{at:[X(L-tep/2),Y(-tt)+Math.min(8,(ht-tt)*k*.25)] as XY,labels:endLabels,weld:size(st.weld),allAround:true}]:[])
  ];
  // Each label ends short of its target, so every leader leaves the label's far end toward the haunch.
  const x0=Math.min(X(L)-130,...left.map(v=>v.at[0]-(v.weld?106:Math.max(...v.labels.map(t=>textWidth(labelCaps(t),8.5))))-24));
  svg+=calloutColumn(left,x0,Y(0)-6-need,Y(0)-6,false);
  return {svg:svg+'</g>',scale:scale.label};
 }});
 // 2. Plan of the top flange at an interior grid: its outline with the flare, the bearing plates and their holes,
 // the web, stiffeners and end plate below it (hidden).
 views.push({title:haunchPlanTitle,render:()=>{
  const scale=sheetDrawingScale(Math.min(.24,190/L,300/Math.max(bt,c.width)),p.units),k=scale.pointsPerMm,X=(x:number)=>x*k,Y=(y:number)=>y*k;
  const half=bt/2,left=X(-half),right=X(half),tip=Y(L),cw=c.width;
  let svg='<g data-view="tapered-haunch-plan">';
  svg+=rect(X(-cw/2),-c.flangeThickness*k,cw*k,c.flangeThickness*k,colCls);
  // The column web and the upper column stiffeners beyond the flange, broken.
  if(cs)svg+=stiffenerPlan(cs.g,{cx:0,face:0,k,cls:colCls,stub:10}).svg;
  // Top flange outline; a 1 in radius at each re-entrant corner of the flare (polyline arc).
  // The fillet's center is in the open corner, R from both edges: (btr/2 + R, y0 - R tan 22.5°); the arc runs from
  // the straight root edge (angle 180°) to the 45° flare (angle 135°), y down the haunch.
  const arc=(sx:number):XY[]=>{if(!f)return [];const R=f.radius,cy=f.y0-R*Math.tan(Math.PI/8);
   return Array.from({length:7},(_,i)=>{const th=Math.PI-(i/6)*(Math.PI/4);return [X(sx*(btr/2+R+R*Math.cos(th))),Y(cy+R*Math.sin(th))] as XY;});};
  const outline:XY[]=f?[[X(-btr/2),0],[X(btr/2),0],...arc(1),[X(bt/2),Y(f.y1)],[X(bt/2),tip],[X(-bt/2),tip],[X(-bt/2),Y(f.y1)],...arc(-1).reverse(),[X(-btr/2),Y(f.y0)]]:[[left,0],[right,0],[right,tip],[left,tip]];
  svg+=poly(outline);
  for(const sx of [-1,1])svg+=line([X(sx*tw/2),0],[X(sx*tw/2),Y(Lw)],'hidden-line');
  if(bb<bt-1e-6)for(const sx of [-1,1])svg+=line([X(sx*bb/2),Y(f?f.y0:0)],[X(sx*bb/2),tip],'hidden-line');
  for(const sx of [-1,1]){const x0=sx*tw/2,x1=sx*(tw/2+st.width);svg+=line([X(x0),Y(a-st.t/2)],[X(x1),Y(a-st.t/2)],'hidden-line')+line([X(x0),Y(a+st.t/2)],[X(x1),Y(a+st.t/2)],'hidden-line')+line([X(x1),Y(a-st.t/2)],[X(x1),Y(a+st.t/2)],'hidden-line');}
  if(g.endPlate)svg+=line([X(-Math.min(bt,bb)/2),Y(Lw)],[X(Math.min(bt,bb)/2),Y(Lw)],'hidden-line');
  const plates=parts.bearings.filter(v=>v.grid==='interior'),bolts=parts.bolts.filter(v=>v.grid==='interior');
  for(const v of plates)svg+=rect(X(v.x0),Y(v.y0),(v.x1-v.x0)*k,(v.y1-v.y0)*k,'runway-line');
  for(const h of bolts)svg+=circle(X(h.x),Y(h.y),h.hole/2*k,'runway-line')+line([X(h.x)-2.5,Y(h.y)],[X(h.x)+2.5,Y(h.y)])+line([X(h.x),Y(h.y)-2.5],[X(h.x),Y(h.y)+2.5]);
  // Grid (the haunch axis) and the girder web line.
  svg+=line([0,-c.flangeThickness*k-14-(cs?14:0)],[0,tip+8],'grid-line')+line([left-10,Y(a)],[right+10,Y(a)],'grid-line');
  // Widths at the column (welded) and of the seat; along the haunch the flare, reach and projection.
  const above=cs?14:0;svg+=dimH(X(-btr/2),X(btr/2),-c.flangeThickness*k-2-above,-c.flangeThickness*k-18-above,dim(btr));
  const xs=[...new Set(bolts.map(h=>Math.round(h.x*1e6)/1e6))].sort((u,v)=>u-v);
  if(eb&&xs.length){
   for(const x of [0,...xs].sort((u,v)=>u-v))svg+=line([X(x),tip+3],[X(x),tip+12])+text(X(x)+3,tip+14,x?dim(Math.abs(x)):'0',7.5,'end',400,-90);
   svg+=dimH(left,right,tip,tip+62,dim(bt));
   const lay=bolts.filter(h=>Math.abs(h.x-xs.at(-1)!)<1e-3),endEdge=bt/2-xs.at(-1)!,rows=[...new Set(lay.map(h=>h.y))].sort((u,v)=>u-v),tipEdge=L-tep-rows.at(-1)!;
   svg+=text(left,tip+80,`HOLES: ORDINATES FROM THE GRID; ROWS AT ${dim(eb.bolts.gauge)} GAUGE ON THE GIRDER C/L.`,7.5);
   svg+=text(left,tip+90,`EDGES: FLANGE END ${dim(endEdge)}, TIP ${dim(tipEdge)}${g.endPlate?' (TO END PL)':''}, COLUMN-FACE WELD ${dim(rows[0]-(g.joint==='cjp'?7.9375:g.flangeWeld))}.`,7.5);
   svg+=text(left,tip+100,`AT A RUNWAY-END GRID: ONE BEARING, ITS GIRDER END ON THE GRID; HOLES ${dim(eb.bolts.edge)} AND ${dim(d.bearing.length-eb.bolts.edge)} FROM IT.`,7.5);
  }else svg+=dimH(left,right,tip,tip+20,dim(bt));
  const xl=X(-cw/2)-2;
  svg+=dimVFrom(0,xl,Y(a),left-12,left-34,dim(a))+dimVFrom(0,xl,tip,left-2,left-52,dim(L));
  // Keys: the elevation from beyond the flange tip, the section through the stiffeners looking at the column.
  svg+=sectionCut([right+14,-3],[right+14,tip+3],[-1,0],detailTitles.weldedBracket,['a']);
  svg+=sectionCut([left-70,Y(a+st.t/2+12)],[right+6,Y(a+st.t/2+12)],[0,-1],haunchSectionTitle,['a'],'tip');
  const pl=plates[plates.length-1],last=bolts.filter(h=>Math.abs(h.x-(xs.at(-1)??0))<1e-3).sort((u,v)=>v.y-u.y)[0],items:Item[]=[
   {at:[right,Y(f?(f.y1+L)/2:L*.62)],labels:[topLabel,...(f?[`45° FLARE STARTS ${dim(f.y0)} FROM`,`THE COLUMN FACE, ${size(f.radius)} RADIUS,`,'GRIND SMOOTH']:[]),'WEB, STIFFENERS HIDDEN']},
   {at:[X(pl.x1)-((pl.x1-pl.x0)*k)*.2,Y(pl.y0)],labels:[`BEARING PL ${size(tbp)} X ${dim(W)} X ${dim(d.bearing.length)}`,`EACH GIRDER END; SEE ${detailRef(eb?bearingBoltsTitle(p):detailTitles.bearing)}`]},
   ...(eb&&last?[{at:[X(last.x)+last.hole/2*k,Y(last.y)] as XY,labels:[`${bolts.length} - ${size(last.hole)} STD. HOLES IN THE TOP FL.`,`FOR ${size(eb.bolts.diameter)} ${eb.bolts.grade} BEARING BOLTS`]}]:[])
  ];
  svg+=calloutColumn(items,right+40,4,tip+20);
  return {svg:svg+'</g>',scale:scale.label};
 }});
 // 3. Section through the haunch just beyond the stiffeners, looking at the column: flanges, web, stiffener pair.
 views.push({title:haunchSectionTitle,render:()=>{
  const h=g.depth(a),wide=Math.max(bt,c.width),scale=sheetDrawingScale(Math.min(.24,190/(hr+2*tt),300/wide),p.units),k=scale.pointsPerMm,X=(x:number)=>x*k,Y=(z:number)=>-z*k;
  const zb=inner(a),zu=under(a);
  let svg='<g data-view="tapered-haunch-section">';
  // The column flange face beyond, 3 1/2 in past the haunch above and below.
  const ext=3.5*25.4;
  svg+=rect(X(-c.width/2),Y(ext),c.width*k,(hr+2*ext)*k,colCls);
  if(cs)svg+=stiffenerFaceHidden(cs.g,{cx:0,k,Y});
  // Beyond the cut the underside of the bottom flange is seen sloping down to the root.
  svg+=rect(X(-bb/2),Y(zu),bb*k,(hr+zu)*k,'runway-line');
  svg+=rect(X(-bt/2),Y(0),bt*k,tt*k,'runway-line')+rect(X(-tw/2),Y(-tt),tw*k,(zb+tt)*-k,'runway-line')+rect(X(-bb/2),Y(zb),bb*k,tbv*k,'runway-line');
  for(const sx of [-1,1]){const x0=sx*tw/2,x1=sx*(tw/2+st.width),cl=st.clip;
   svg+=poly([[X(x0+sx*cl),Y(-tt)],[X(x1),Y(-tt)],[X(x1),Y(zb)],[X(x0+sx*cl),Y(zb)],[X(x0),Y(zb+cl)],[X(x0),Y(-tt-cl)]]);}
  svg+=dimH(X(-bt/2),X(bt/2),Y(0)-2,Y(ext)-16,dim(bt));
  svg+=dimH(X(-bb/2),X(bb/2),Y(-hr)+2,Y(-hr-ext)+16,dim(bb));
  svg+=dimV(Y(0),Y(zu),X(-wide/2)-4,X(-wide/2)-18,dim(h));
  const items:Item[]=[
   {at:[X(c.width/2)+2,Y(ext)+8],labels:[colName,'BEYOND']},
   {at:[X(bt*.42),Y(-tt/2)],labels:[topLabel]},
   {at:[X(tw/2),Y(-tt)],labels:['FLANGES TO WEB, BOTH SIDES, SHOP'],weld:size(g.flangeWebWeld),both:true},
   {at:[X(tw/2+st.width*.55),Y((zb-tt)/2)],labels:[`${stiffLabel}, ${size(st.clip)} CLIPS,`,'TO WEB AND BOTH FLANGES, SHOP'],weld:size(st.weld),both:true},
   {at:[X(-tw/2),Y((zb-tt)/2+(zb+tt)*.15)],labels:[webLabel]},
   {at:[X(bb*.4),Y(zb+tbv/2)],labels:[botLabel,`SLOPE ${deg}°; ITS UNDERSIDE BEYOND`]},
   ...(cs?[{at:[X(-(cs.g.tw/2+cs.g.width*.8)),Y(cs.g.levels[1].z)+cs.g.t*k/2] as XY,labels:['COL. STIFFENERS BEYOND',`(HIDDEN); SEE ${detailRef(columnStiffenerTitle)}`]}]:[])
  ];
  svg+=calloutColumn(items,X(wide/2)+40,Y(0)-14,Y(-hr)+16);
  return {svg:svg+'</g>',scale:scale.label};
 }});
 const tie=flangeTieGeometry(p),ties=tie?`${tie.sides.length===1&&tie.sides[0]>0?'THE TOP FLANGE TIES':'THE FLANGE TIES'} (${detailRef(detailTitles.flangeTie)})`:'THE FLANGE TIES';
 const Fy=format(d.material.Fy,'stress',p.units,p.units==='SI'?0:3);
 const notes=[
  `A BUILT-UP TAPERED I HAUNCH ${dim(L)} LONG, ${dim(hr)} DEEP AT THE COLUMN TAPERING TO ${dim(ht)} AT THE TIP (BOTTOM FLANGE AT ${deg}°): ${webLabel}, ${topLabel}, ${botLabel}, ${stiffLabel} AT THE GIRDER C/L${g.endPlate?`, END PL ${size(tep)}`:''}. PLATES ${Fy} MIN. YIELD.`,
  `${where} WELD THE HAUNCH TO THE ${colName} FLANGE: ${g.joint==='cjp'?'CJP GROOVE WELDS AT BOTH FLANGES':`${size(g.flangeWeld)} FILLETS ON BOTH FACES OF BOTH FLANGES`} AND ${size(g.webWeld)} FILLETS BOTH SIDES OF THE WEB. SHOP: ${size(g.flangeWebWeld)} FLANGE-TO-WEB FILLETS BOTH SIDES, CONTINUOUS; STIFFENERS FITTED TO BEAR ON THE TOP FLANGE AND WELDED TO THE WEB AND BOTH FLANGES WITH ${size(st.weld)} FILLETS BOTH SIDES.`,
  `WELDS: ${electrodeClass(d.material.Fexx,p.units)} LOW-HYDROGEN ELECTRODE${g.joint==='cjp'?', MATCHING FILLER FOR THE CJP WELDS WITH STEEL BACKING REMOVED, ROOT BACKGOUGED AND REWELDED, UT PER S-00':''}. CONTINUOUS WELDS AS SHOWN; NO INTERMITTENT WELDS.${f?` CUT THE TOP FLANGE FLARE WITH A ${size(f.radius)} RADIUS AT THE RE-ENTRANT CORNERS AND GRIND SMOOTH.`:''}`,
  ...(sc.isNew?[`SHOP WELD THE HAUNCH TO THE ${sc.name} BEFORE ERECTION; INSPECT STARTS, STOPS AND TOES.`]:[
   'WELDING TO EXISTING STEEL: VERIFY THE WELDABILITY OF THE EXISTING COLUMN BY MILL CERTIFICATES OR COUPON TESTS (CHEMISTRY AND CARBON EQUIVALENT) BEFORE FABRICATION.',
   `PREHEAT AND INTERPASS TEMPERATURE PER AWS D1.1 FOR THE THICKER PART JOINED (EXISTING COLUMN FLANGE ${size(c.flangeThickness)}).`,
   'REMOVE PAINT, COATINGS, MILL SCALE AND RUST FROM THE EXISTING COLUMN FLANGE AT THE WELDS; CLEAN TO BRIGHT METAL.',
   'WELD WITH THE COLUMN CARRYING DEAD LOAD ONLY (NO CRANE IN SERVICE ON THIS COLUMN LINE), PER AWS D1.1 CLAUSE 11, STRENGTHENING AND REPAIR OF EXISTING STRUCTURES.'
  ]),
  `KEEP GIRDER ENDS AND BEARINGS INDEPENDENT. DO NOT WELD THE SLIDING BEARING TO THE GIRDER. ${eb?`THE BEARING BOLTS LOCATE, GUIDE AND HOLD DOWN THE GIRDER THROUGH THE HAUNCH TOP FLANGE (${detailRef(bearingBoltsTitle(p))}); DRILL TO MATCH (${detailRef(haunchPlanTitle)}). `:''}ONLY ${ties} CONNECT TO THE COLUMN SEPARATELY.`,
  `THE HAUNCH IS DESIGNED FOR EVERY CONCURRENT CASE OF THE BRACKET DESIGN FORCES BELOW, WITH ITS SELF-WEIGHT: FLEXURE AND SHEAR ON THE SECTIONS OF THE TAPER, TORSION FROM THE OFFSET BEARINGS, THE STIFFENERS, THE WELD GROUP ON THE COLUMN FACE, FATIGUE AND DEFLECTION${collector?'; WITH THE BRACING, ALSO THE COLLECTOR FORCE THROUGH ITS WELDS':''}. THE ${sc.isNew?'':'EXISTING '}COLUMN FLANGE AND WEB LOCAL CHECKS (J10) ARE IN THE CALCULATION${cs?', WITH THE COLUMN STIFFENERS AT BOTH HAUNCH FLANGE LEVELS':', WITHOUT COLUMN STIFFENERS'}.`
 ];
 const stiffView=columnStiffenerView(s);if(stiffView)views.push(stiffView);
 return {key:'bracket',name:'BRACKETS',views,notes:(t:Style)=>[heading(t,sc.isNew?'HAUNCH FABRICATION NOTES':'HAUNCH FABRICATION & EXISTING-STEEL WELDING NOTES'),...numbered(t,[...notes,...stiffenerNotes(p)]),...bracketForceBlocks(s,t)]};
}

/**
 * The haunch under a bearing section along the runway: its top flange is the seat; below it the web, drawn depth
 * below the seat underside at the girder web line. Bolts through the top flange need no extra drop.
 */
export function haunchUnderSeat(p:CalculationSnapshot['input']){
 if(!usesTaperedHaunch(p))return undefined;
 const g=projectHaunch(p);
 return {g,name:'TAPERED HAUNCH',tf:g.tt,tw:g.tw,bf:g.btr,d:g.hr,L:g.L,seat:undefined,hasSeat:false,
  label:[`HAUNCH TOP FLANGE ${plateInches(g.tt,p.units)}`,`SEE ${detailRef(detailTitles.weldedBracket)}`],
  drop:(_x:number)=>0,
  draw:(X:(x:number)=>number,y:number,kk:number,x0:number,x1:number,depth:number)=>g.tw/2>x0&&-g.tw/2<x1?rect(X(-g.tw/2),y,g.tw*kk,depth*kk,'runway-line'):''};
}

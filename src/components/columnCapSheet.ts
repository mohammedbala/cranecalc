import {checkDcText,elementSummary,failingNote,sheetDc} from './sheetRatios';
import {stiffenerTopCjp} from '../engine/constructionNotes';
import type {CalculationSnapshot} from '../engine/types';
import {format} from '../engine/units';
import {activeEndBearing,endBearingGeometry} from '../engine/endBearing';
import {columnCapGeometry,type CapBearing} from '../engine/columnCap';
import {activeColumnCap,capCjp} from '../engine/columnCapInputs';
import {activeStep} from '../engine/steppedColumnInputs';
import {steppedColumnTitles} from './steppedColumnSheet';
import {boltProperties} from '../engine/connectionStrength';
import {runwayElevations} from '../engine/drawingData';
import {drawingLength,drawingElevation,plateInches,dimensionLength} from './drawingFormat';
import {dimText,sheetDrawingScale as drawingScale,text,line,rect,circle,dimH,dimV,multiLeader,filletLeader,detailRef,textWidth,detailTitles,bearingBoltsTitle,labelColumn,breakLine,capChannelSection,type XY} from './sheetGraphics';
import {heading,numbered,table,type Style} from './noteBlocks';
import {heavyHex,hexSide} from './heavyHex';
import {bearingStiffenerProfile} from './bearingStiffenerGeometry';
import type {DetailTopic,DetailView} from './detailSheet';
import {bracketForceBlocks,bracketForceTopic} from './bracketForceTable';
import {tiedToBuilding} from '../engine/craneColumnInputs';
import {craneColumnTitles} from './craneColumnSheet';

const inch=25.4;
/** Detail titles of the column cap, referenced from the general arrangement and the new column details. */
export const columnCapTitles={section:'GIRDER BEARING / COLUMN CAP',arrangement:(grids:string)=>`COLUMN CAP AT ${grids} / ELEVATION AND PLAN`};
/** The girder bearing section: on the column cap, or on the bracket. */
export const girderBearingTitle=(p:CalculationSnapshot['input'])=>activeColumnCap(p)?columnCapTitles.section:activeStep(p)?steppedColumnTitles.section:detailTitles.bearing;

/**
 * Grids sharing one cap arrangement (bearings, bolts and cap stiffeners), a runway-end grid with the opposite
 * one as its mirror: the arrangements drawn, each once.
 */
export function capArrangements(s:CalculationSnapshot){
 const g=columnCapGeometry(s.input),key=(b:CapBearing[],sign:number)=>JSON.stringify(b.map(v=>[Math.round(sign*(sign>0?v.x0:v.x1)),Math.round(sign*(sign>0?v.x1:v.x0))]).sort((a,c)=>a[0]-c[0]));
 const groups:{grid:number;grids:number[];mirrored:number[]}[]=[];
 for(const v of g.grids){
  const own=key(v.bearings,1),mirror=key(v.bearings,-1),hit=groups.find(o=>key(g.grids[o.grid].bearings,1)===own||key(g.grids[o.grid].bearings,1)===mirror);
  if(!hit)groups.push({grid:v.grid,grids:[v.grid],mirrored:[]});
  else{hit.grids.push(v.grid);if(key(g.grids[hit.grid].bearings,1)!==own)hit.mirrored.push(v.grid);}
 }
 const list=(v:number[])=>v.length>1?`GRIDS ${v.slice(0,-1).map(i=>i+1).join(', ')} AND ${v.at(-1)!+1}`:`GRID ${v[0]+1}`;
 return groups.map((o,i)=>({...o,mark:`CP${i+1}`,label:list(o.grids),title:columnCapTitles.arrangement(list(o.grids))}));
}

/** Column cap details: the section across the runway, and the elevation with the plan of each arrangement. */
export function columnCapTopic(s:CalculationSnapshot):DetailTopic{
 const p=s.input,u=p.units,d=p.details!,b=p.section,bs=d.bearing,eb=activeEndBearing(p)!,g=columnCapGeometry(p),cap=g.cap,col=g.col;
 const dim=(v:number)=>dimensionLength(v,u),size=(v:number)=>plateInches(v,u),weld=(v:number)=>plateInches(v,u).replaceAll('"','');
 const tc=cap.plate.thickness,bt=bs.thickness,db=eb.bolts.diameter,hx=heavyHex(db),hole=boltProperties(eb.bolts.grade,db).hole,ts=cap.stiffener.thickness,hs=cap.stiffener.height;
 const groups=capArrangements(s),eg=endBearingGeometry(p,eb),views:DetailView[]=[];
 const colName=`NEW ${col.name} COLUMN`,capLabel=`CAP PL ${size(tc)} X ${dim(cap.plate.width)} X ${dim(cap.plate.length)}`;
 const braced=!!s.bracingSystem,el=runwayElevations(p);

 // 1: Girder bearing on the cap, section across the runway looking along it: the girder centered on the column,
 // its full-depth bearing stiffeners, the bearing plate, the cap plate and the column top.
 views.push({title:columnCapTitles.section,render:()=>{
  const first=groups.find(o=>g.grids[o.grid].stiffeners.length)??groups[0],grid=g.grids[first.grid],stiff=grid.stiffeners.length>0,web=b.d-2*b.tf,below=(stiff?hs:0)+4*inch;
  const capTop=b.kind==='cap'?b.capTw:0,height=bt+b.d+capTop+tc+below;
  const k=drawingScale(Math.min(262/height,260/Math.max(cap.plate.width,b.kind==='cap'?b.capWidth:b.bf)),u),kk=k.pointsPerMm,cx=300,y0=62+(bt+b.d+capTop)*kk;
  const X=(z:number)=>cx+z*kk,Y=(y:number)=>y0-y*kk;// y up from the cap top
  let svg='<g data-view="column-cap-section">';
  const yb=bt,yt=bt+b.d;
  // Girder: flanges, web and the fitted bearing stiffener pair beyond, coped at the web corners.
  svg+=rect(X(-b.bf/2),Y(yb+b.tf),b.bf*kk,b.tf*kk,'runway-line')+rect(X(-b.tw/2),Y(yt-b.tf),b.tw*kk,web*kk,'runway-line')+rect(X(-b.bf/2),Y(yt),b.bf*kk,b.tf*kk,'runway-line');
  if(b.kind==='cap')svg+=capChannelSection(b,(x,z)=>[X(x),Y(yt+z)]);
  const stiffPts:XY[]=[];
  for(const side of [-1,1]){
   const profile=bearingStiffenerProfile(bs.stiffenerWidth,web,bs.cope).map(([z,v]):XY=>[X(side*(b.tw/2+z)),Y(yb+b.tf+v)]);
   svg+=`<path data-stiffener="full-depth" class="runway-line" d="${profile.map(([x,y],i)=>`${i?'L':'M'}${x},${y}`).join('')}Z"/>`;
   stiffPts.push([X(side*(b.tw/2+bs.stiffenerWidth*.55)),Y(yb+b.tf+web*.42)]);
  }
  // Bearing plate, cap plate, column flanges seen edge-on and broken below.
  svg+=rect(X(-bs.width/2),Y(bt),bs.width*kk,bt*kk,'runway-line')+rect(X(-cap.plate.width/2),Y(0),cap.plate.width*kk,tc*kk,'runway-line');
  const cb=-tc-below;
  for(const z of [-col.d/2,col.d/2-col.tf])svg+=rect(X(z),Y(-tc),col.tf*kk,below*kk,'runway-line');
  svg+=breakLine([X(-col.d/2)-8,Y(cb)],[X(col.d/2)+8,Y(cb)]);
  // A cap stiffener face-on between the flanges, its top corners clipped.
  if(stiff){const c=g.clip,z0=-col.d/2+col.tf,z1=col.d/2-col.tf;svg+=`<path class="runway-line" d="M${X(z0)},${Y(-tc-c)}L${X(z0+c)},${Y(-tc)}L${X(z1-c)},${Y(-tc)}L${X(z1)},${Y(-tc-c)}L${X(z1)},${Y(-tc-hs)}L${X(z0)},${Y(-tc-hs)}Z"/>`;}
  // Bearing bolts through the flange, bearing plate and cap: heads above the flange, nuts below the cap.
  for(const z of [-g.gauge/2,g.gauge/2]){
   svg+=line([X(z),Y(yb+b.tf+hx.head)-3],[X(z),Y(-tc-hx.washer.t-hx.nut)+3],'grid-line');
   svg+=hexSide(X(z),Y(yb+b.tf),hx.corners*kk,hx.head*kk,-1)+rect(X(z-hx.washer.od/2),Y(-tc),hx.washer.od*kk,hx.washer.t*kk,'runway-line')+hexSide(X(z),Y(-tc)+hx.washer.t*kk,hx.corners*kk,hx.nut*kk,1);
  }
  svg+=line([cx,Y(yt+capTop)-12],[cx,Y(cb)-2],'grid-line');
  // Dimensions below: the column depth and the cap width.
  const dy=Y(cb)+22;
  svg+=dimH(X(-col.d/2),X(col.d/2),Y(cb),dy,dim(col.d))+dimH(X(-cap.plate.width/2),X(cap.plate.width/2),Y(-tc),dy+18,dim(cap.plate.width));
  // Callouts in two columns: the girder, its stiffeners, bearing plate and bolts at the left; welds, cap and column at the right.
  const cjp=stiffenerTopCjp(p),half=Math.max(cap.plate.width,b.kind==='cap'?b.capWidth:b.bf)/2;
  type Item={at:XY;labels:string[];weld?:string;allAround?:boolean;arrowSide?:boolean};
  const left:Item[]=[
   {at:[X(-b.bf/2)+4,Y(yt)],labels:[`${b.name} RUNWAY GIRDER,`,'CENTERED ON THE COLUMN']},
   {at:stiffPts[0],labels:[`2 PL ${size(bs.stiffenerThickness)} X ${size(bs.stiffenerWidth)} FULL-DEPTH`,`FITTED BEARING STIFFENERS,`,`${size(bs.cope)} WEB-SIDE CORNER COPES`]},
   {at:[X(-bs.width/2)+3,Y(bt*.5)],labels:[`BEARING PL ${size(bt)} X ${dim(bs.width)}`,`X ${dim(bs.length)}`]},
   {at:[X(-g.gauge/2-hx.corners/2),Y(-tc)+(hx.washer.t+hx.nut*.5)*kk],labels:[`4 - ${size(db)} DIA. ${eb.bolts.grade} EACH GIRDER`,`END, ${size(hole)} STD HOLES IN CAP;`,`SEE ${detailRef(bearingBoltsTitle(p))}`]}
  ];
  const right:Item[]=[
   {at:[X(b.tw/2),Y(yb+b.tf+web*.7)],labels:['TYP. BOTH STIFFENERS',cjp?'CONT. WEB FILLETS, CJP TO TOP FL.':'CONT. WEB & FLANGE FILLETS',cjp?'FIT BOTTOM END':'FIT / MILL STIFFENER ENDS'],weld:size(bs.weldSize)},
   {at:[X(cap.plate.width/2),Y(-tc/2)],labels:[`${capLabel},`,'ASTM A572 GR. 50']},
   {at:[X(col.d/2),Y(-tc)],labels:capCjp(cap)?['CAP TO COLUMN: CJP FLANGES','& WEB, REINF. FILLETS']:['CAP TO COLUMN: FLANGES BOTH','FACES, WEB BOTH SIDES'],weld:size(cap.weld),allAround:true},
   ...(stiff?[{at:[X(col.d/2-col.tf),Y(-tc-hs*.6)] as XY,labels:['CAP STIFFENER TO EACH FLANGE,',`WHERE SHOWN ON ${groups.filter(o=>g.grids[o.grid].stiffeners.length).map(o=>o.mark).join(', ')}`],weld:size(cap.stiffener.weld)}]:[]),
   {at:[X(col.d/2),Y(cb+below*.3)],labels:[`${colName}, ASTM A992,`,'TOP MILLED TO BEAR ON THE CAP']}
  ];
  const lw=Math.max(...left.flatMap(v=>v.labels.map(l=>textWidth(l.toUpperCase(),8.5))));
  svg+=labelColumn(left,X(-half)-36-lw,Y(yt+capTop)-4,Y(cb)+10)+labelColumn(right,X(half)+36,Y(yt+capTop)-4,Y(cb)+10);
  return {svg:svg+'</g>',scale:k.label};
 }});

 // 2: Each arrangement: elevation along the runway with its plan projected below.
 for(const grp of groups)views.push({title:grp.title,rows:2,render:()=>{
  const grid=g.grids[grp.grid],bearings=grid.bearings,web=b.d-2*b.tf,show=Math.min(web,6*inch),stiff=grid.stiffeners.length>0,below=(stiff?hs:0)+5*inch;
  const half=cap.plate.length/2+2.5*inch,k=drawingScale(Math.min(330/(2*half),260/(b.tf+show+bt+tc+below)),u),kk=k.pointsPerMm,cx=330,yRef=150+(b.tf+show+bt)*kk;
  const X=(x:number)=>cx+x*kk,Y=(y:number)=>yRef-y*kk;
  let svg=`<g data-view="column-cap-arrangement" data-cap-mark="${grp.mark}">`;
  const yb=bt,yt=bt+b.tf+show;
  // Girder pieces over the cap: a continuous girder runs through, a girder end stops at its end.
  const pieces=p.system==='continuous'?[bearings[0].end==='left'?[0,half]:bearings[0].end==='right'?[-half,0]:[-half,half]]:bearings.map(v=>v.end==='left'?[v.x0,half]:[-half,v.x1]);
  for(const [a,c] of pieces){
   svg+=line([X(a),Y(yb)],[X(c),Y(yb)],'runway-line')+line([X(a),Y(yb+b.tf)],[X(c),Y(yb+b.tf)],'runway-line');
   for(const x of [a,c])if(Math.abs(Math.abs(x)-half)>1)svg+=line([X(x),Y(yb)],[X(x),Y(yt)],'runway-line');
   for(const x of [a,c])if(Math.abs(Math.abs(x)-half)<=1)svg+=breakLine([X(x),Y(yb)+5],[X(x),Y(yt)-5]);
   svg+=breakLine([X(a)+(Math.abs(Math.abs(a)-half)<=1?6:0),Y(yt)],[X(c)-(Math.abs(Math.abs(c)-half)<=1?6:0),Y(yt)]);
  }
  // Girder bearing stiffeners edge-on, bearing plates, cap plate.
  for(const v of bearings)svg+=rect(X(v.center-bs.stiffenerThickness/2),Y(yt),bs.stiffenerThickness*kk,show*kk,'runway-line')+rect(X(v.x0),Y(bt),(v.x1-v.x0)*kk,bt*kk,'runway-line');
  svg+=rect(X(-cap.plate.length/2),Y(0),cap.plate.length*kk,tc*kk,'runway-line');
  // Column: the near flange face, broken below; cap stiffeners between the flanges behind it.
  const cb=-tc-below;
  for(const x of [-col.bf/2,col.bf/2])svg+=line([X(x),Y(-tc)],[X(x),Y(cb)],'runway-line');
  svg+=breakLine([X(-col.bf/2)-8,Y(cb)],[X(col.bf/2)+8,Y(cb)]);
  for(const x of grid.stiffeners)svg+=rect(X(x-ts/2),Y(-tc),ts*kk,hs*kk,'hidden-line');
  // Bolts: heads above the flange, nuts under the cap (between the flanges behind the near flange).
  const rows=[...new Set(grid.bolts.map(o=>Math.round(o.x*1000)/1000))];
  for(const x of rows){
   const hidden=Math.abs(x)+hx.corners/2<col.bf/2,cls=hidden?'hidden-line':'runway-line';
   svg+=line([X(x),Y(yb+b.tf+hx.head)-4],[X(x),Y(-tc-hx.washer.t-hx.nut)+4],'grid-line')+hexSide(X(x),Y(yb+b.tf),hx.corners*kk,hx.head*kk,-1)+rect(X(x-hx.washer.od/2),Y(-tc),hx.washer.od*kk,hx.washer.t*kk,cls)+hexSide(X(x),Y(-tc)+hx.washer.t*kk,hx.corners*kk,hx.nut*kk,1,cls);
  }
  // Grid line and the strut work point below the cap.
  svg+=line([cx,Y(yt)-30],[cx,Y(cb)+14],'grid-line');
  const ys=Y(yt)-44;svg+=circle(cx,ys,9,'bubble')+text(cx,ys+3.2,String(grp.grid+1),9,'middle',700);
  // Elevation dimensions: cap and bearing plate thicknesses at the left, stiffener depth and the strut work point.
  const xl=X(-cap.plate.length/2)-10;
  svg+=dimV(Y(0),Y(-tc),X(-cap.plate.length/2),xl,size(tc));
  // Plan below: the cap plate with its holes, the column and the cap stiffeners under it.
  const pTop=Y(cb)+70,Zp=(z:number)=>pTop+(cap.plate.width/2+z)*kk;
  svg+=rect(X(-cap.plate.length/2),Zp(-cap.plate.width/2),cap.plate.length*kk,cap.plate.width*kk,'runway-line');
  for(const z of [-1,1]){const zf=z*(col.d/2-col.tf/2);svg+=rect(X(-col.bf/2),Zp(zf-col.tf/2),col.bf*kk,col.tf*kk,'hidden-line');}
  svg+=rect(X(-col.tw/2),Zp(-col.d/2+col.tf),col.tw*kk,(col.d-2*col.tf)*kk,'hidden-line');
  for(const x of grid.stiffeners)svg+=rect(X(x-ts/2),Zp(-col.d/2+col.tf),ts*kk,(col.d-2*col.tf)*kk,'hidden-line');
  const holes:XY[]=[];
  for(const o of grid.bolts){const at:XY=[X(o.x),Zp(o.z)];holes.push(at);svg+=circle(at[0],at[1],hole/2*kk,'runway-line')+line([at[0]-hole/2*kk-3,at[1]],[at[0]+hole/2*kk+3,at[1]],'grid-line')+line([at[0],at[1]-hole/2*kk-3],[at[0],at[1]+hole/2*kk+3],'grid-line');}
  svg+=line([X(-cap.plate.length/2)-6,Zp(0)],[X(cap.plate.length/2)+6,Zp(0)],'grid-line')+line([cx,Zp(-cap.plate.width/2)-10],[cx,Zp(cap.plate.width/2)+2],'grid-line');
  // Plan dimensions: the holes chained from cap end to cap end, the cap centered on the grid; the overall below.
  // A short segment between two others carries its text under the dimension line.
  const zb=Zp(cap.plate.width/2),stations=[-cap.plate.length/2,...rows,cap.plate.length/2].sort((a,c)=>a-c);
  let under=false;
  for(let i=1;i<stations.length;i++){
   const x1=X(stations[i-1]),x2=X(stations[i]),label=size(stations[i]-stations[i-1]),fits=textWidth(label,9)+6<=x2-x1,from=i===1||i===stations.length-1?zb:Zp(g.gauge/2);
   if(fits||i===1||i===stations.length-1)svg+=dimH(x1,x2,i===1?zb:from,zb+18,label,i===1?'left':'right');
   else{under=true;svg+=dimH(x1,x2,from,zb+18,'')+text((x1+x2)/2,zb+30,label,9,'middle');}
  }
  svg+=dimH(X(-cap.plate.length/2),X(cap.plate.length/2),zb,zb+(under?52:46),dim(cap.plate.length));
  if(grid.stiffeners.length){const xs=grid.stiffeners;for(const x of xs)svg+=dimH(cx,X(x),Zp(-col.d/2+col.tf),Zp(-cap.plate.width/2)-14,size(Math.abs(x)),x<0?'left':'right');}
  // A gauge too short for its text reads horizontally beside its dimension line, the cap width beyond that text.
  const xr=X(cap.plate.length/2),xp=X(-cap.plate.length/2),gl=size(g.gauge),gw=textWidth(gl,9),gy1=Zp(-g.gauge/2),gy2=Zp(g.gauge/2),gf=X(Math.min(...rows)),gx=xp-20;
  svg+=gw+6<=gy2-gy1?dimV(gy1,gy2,gf,gx,gl):line([gf,gy1],[gx-4,gy1])+line([gf,gy2],[gx-4,gy2])+line([gx,gy1],[gx,gy2])+[gy1,gy2].map(y=>line([gx-3,y+2.5],[gx+3,y-2.5])).join('')+dimText(gx-5,Zp(0)+3,gl,9,'end');
  svg+=dimV(Zp(-cap.plate.width/2),Zp(cap.plate.width/2),xp,gw+6<=gy2-gy1?xp-38:gx-gw-16,dim(cap.plate.width));
  // Labels at the right of the elevation, then of the plan.
  const lx=xr+(braced?60:56),locating=bearings.some(v=>v.role==='LOCATING');
  const items:{at:XY;labels:string[];weld?:string;allAround?:boolean;arrowSide?:boolean}[]=[
   {at:[X(pieces[0][0]+(pieces[0][1]-pieces[0][0])*.7),Y(yb+b.tf)],labels:[`${b.name} GIRDER`,p.system==='continuous'?(bearings[0].end?'GIRDER END':'CONTINUOUS OVER COLUMN'):'GIRDER ENDS, GAP PER S-01']},
   {at:[X(bearings[0].x1),Y(bt/2)],labels:[`BEARING PL ${size(bt)} X ${dim(bs.width)} X ${dim(bs.length)}`,`${locating?'LOCATING':'SLIDING'}${bearings.length>1?' / SLIDING':''}; SEE ${detailRef(bearingBoltsTitle(p))}`]},
   {at:[X(cap.plate.length/2),Y(-tc/2)],labels:[`${grp.mark}: ${capLabel}`]},
   {at:[X(col.bf/2),Y(-tc)],labels:[capCjp(cap)?'CAP TO COLUMN, CJP + REINF.':'CAP TO COLUMN, ALL AROUND'],weld:size(cap.weld),allAround:true},
   ...(stiff?[{at:[X(grid.stiffeners.at(-1)!+ts/2),Y(-tc-hs*.7)] as XY,labels:[`CAP STIFFENER PL ${size(ts)} X ${size(hs)}`,`X ${dim(g.clear)}, ${size(g.clip)} CLIPS, FIT TO BEAR`,'UNDER GIRDER BRG. STIFFENER']}]:[]),
   {at:[X(col.bf/2),Y(cb+below*.3)],labels:[colName,'MILLED TOP']}
  ];
  svg+=labelColumn(items,lx,Y(yt)-6,Y(cb)+10);
  const pitems:{at:XY;labels:string[]}[]=[
   {at:[holes.at(-1)![0]+hole/2*kk*.7,holes.at(-1)![1]+hole/2*kk*.7],labels:[`${grid.bolts.length} - ${size(hole)} STD HOLES`,`FOR ${size(db)} DIA. ${eb.bolts.grade} BEARING BOLTS`]},
   {at:[X(col.bf/2),Zp(col.d/2-col.tf/2)],labels:[`${col.name} BELOW (HIDDEN)`]},
   ...(stiff?[{at:[X(grid.stiffeners.at(-1)!),Zp(-col.d/4)] as XY,labels:['CAP STIFFENER BELOW']}]:[]),
   {at:[cx,Zp(0)],labels:['GIRDER WEB C/L = COLUMN C/L;','CAP CENTERED ON GRID']}
  ];
  svg+=labelColumn(pitems,lx,Zp(-cap.plate.width/2)-4,Zp(cap.plate.width/2)-4);
  const others=grp.mirrored.length?` GRID${grp.mirrored.length>1?'S':''} ${grp.mirrored.map(i=>i+1).join(', ')} OPPOSITE HAND.`:'';
  svg+=text(X(-cap.plate.length/2),zb+70,`PLAN OF ${grp.mark} (GIRDER REMOVED).${others}`,8,'start');
  void eg;
  return {svg:svg+'</g>',scale:k.label};
 }});

 // Notes and design data.
 const check=(id:string)=>s.checks.find(v=>v.id===id),ratio=(id:string)=>checkDcText(s,check(id));
 const force=(v:number,q:Parameters<typeof format>[1]='force')=>{const t=format(v,q,u,u==='SI'?1:2);return u==='US'?t.toUpperCase():t;};
 const r=s.detailResults?.columnCap,peak=r?Math.max(...r.grids.flatMap(v=>v.bearings.map(x=>x.R.value))):0;
 const rows=[
  ['CAP PLATE',`${groups.map(v=>v.mark).join(', ')}: ${capLabel}, ASTM A572 GR. 50`],
  ['CAP WELD',capCjp(cap)?`CJP GROOVE WELDS, COLUMN FLANGES AND WEB TO THE CAP, ${weld(cap.weld)} REINFORCING FILLETS BOTH FACES; UT`:`${weld(cap.weld)} FILLET ALL AROUND THE COLUMN: FLANGES BOTH FACES, WEB BOTH SIDES`],
  ...(g.stiffened?[['CAP STIFFENERS',`PL ${size(ts)} X ${size(hs)} X ${dim(g.clear)} BETWEEN THE FLANGES, ${weld(cap.stiffener.weld)} FILLETS BOTH FACES TO EACH FLANGE`]]:[]),
  ['BEARING BOLTS',`4 - ${size(db)} DIA. ${eb.bolts.grade} AT EACH GIRDER ${p.system==='continuous'?'BEARING':'END'}, THRU FLANGE, BEARING PL AND CAP`],
  [`LARGEST GIRDER END REACTION (${p.method})`,r?force(peak):'-'],
  ['RATIOS: CAP PL / WELDS / BOLTS / STIFFENER / WEB',`${ratio('column-cap-plate')} / ${ratio('column-cap-weld')} / ${ratio('column-cap-bolt-tension')} / ${g.stiffened?ratio('column-cap-stiffener-weld'):'-'} / ${ratio('column-cap-web-yield')}`],
  // The largest D/C over every check of the column cap, and the failing ones by name (sheetRatios).
  ...(()=>{const e=elementSummary(s,(c,e)=>e==='support'&&c.group==='Column cap'),m=[e.strength,e.fatigue].filter(v=>!!v).sort((a,b)=>b!.dc-a!.dc)[0],f=failingNote(s,e);return m||f?[[`MAX. D/C, ALL COLUMN CAP CHECKS`,`${m?`${sheetDc(s,m.dc)} (${m.check.id})`:'-'}${f?`; ${f}`:''}`]]:[];})(),
  // A crane column tied to the building column: the girder tie, not the end fork, holds the girder top (craneColumn.ts).
  tiedToBuilding(p)?['TOP FLANGE RESTRAINT','GIRDER TIE TO THE BUILDING COLUMN (END FORK NOT RELIED ON)']:['FORK RESTRAINT / REQUIRED',r&&check('column-cap-fork-stiffness')?`${force(r.fork.k,'stiffness')} / ${force(check('column-cap-fork-stiffness')!.demand!,'stiffness')}`:'-']
 ];
 const notes=[
  `THE RUNWAY GIRDERS BEAR DIRECTLY ON THE NEW COLUMNS, CENTERED ON THEM (AIST TR-13 §5.9.2): NO BRACKETS. MILL THE COLUMN TOP SQUARE AND FIT THE CAP PLATE TO FULL BEARING BEFORE WELDING (AISC 360 J1.4).`,
  `CAP PLATE ASTM A572 GR. 50, SHOP WELDED ALL AROUND THE COLUMN WITH ${capCjp(cap)?`CJP GROOVE WELDS (COLUMN FLANGES AND WEB BEVELED, BACKGOUGED OR ON BACKING REMOVED) AND ${weld(cap.weld)} REINFORCING FILLETS`:`${weld(cap.weld)} FILLETS`}, E70XX LOW HYDROGEN. DRILL OR SUB-PUNCH AND REAM THE ${size(hole)} BEARING BOLT HOLES TO A TEMPLATE MATCHING THE GIRDER FLANGE AND BEARING PLATE; ERECTION ADJUSTMENT AT THE COLUMN BASE (S-00, CRANE RUNWAY INSTALLATION); NO OVERSIZED OR SLOTTED HOLES OR SHIMS AT THE CAP.`,
  ...(g.stiffened?[`CAP STIFFENERS UNDER EACH GIRDER BEARING STIFFENER NOT OVER THE COLUMN WEB: FIT TO BEAR AGAINST THE CAP, CLIP THE TOP CORNERS ${size(g.clip)} TO CLEAR THE CAP FILLETS, WELD TO BOTH FLANGES BEFORE THE CAP IS WELDED.`]:[]),
  `THE GIRDER ENDS ARE HELD AGAINST TWIST BY THEIR BEARING STIFFENERS AND THE BOLTED BOTTOM FLANGE; ${tiedToBuilding(p)?`THE TOP FLANGE BY THE GIRDER TIE TO THE BUILDING COLUMN AND THE COLUMN TOP BY THE COLUMN TIE (${detailRef(craneColumnTitles.elevation)})`:'NO TOP FLANGE TIE'}. INSTALL ALL BEARING BOLTS, PRETENSIONED${slidingNote(p)}, BEFORE THE CRANE IS OPERATED.`,
  `KEEP THE AREA UNDER THE CAP AROUND EACH BOLT CLEAR FOR THE WRENCH; INSTALL NUTS FROM BELOW.`,
  `CAP WELDS AND CAP STIFFENER WELDS: VISUAL INSPECTION OF ALL WELDS; PERIODIC SPECIAL INSPECTION PER IBC 1705.2 AND AISC 360 CHAPTER N.`
 ];
 return {key:'column-cap',name:'COLUMN CAPS',views,notes:(t:Style)=>[...(bracketForceTopic(s)==='column-cap'?bracketForceBlocks(s,t):[]),heading(t,'COLUMN CAP DESIGN DATA'),table(t,['ITEM','VALUE'],rows,[1.25,1.75]),heading(t,'COLUMN CAP NOTES'),...numbered(t,notes)]};
}
const slidingNote=(p:CalculationSnapshot['input'])=>{const e=activeEndBearing(p);return e&&(e.sliding??'sleeved')==='sleeved'?' (SLIDING SUPPORTS AGAINST STEEL SLEEVES)':'';};
void detailTitles;void drawingElevation;void multiLeader;void filletLeader;

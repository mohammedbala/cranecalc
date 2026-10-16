import {elementSummary,failingNote,inElements,sheetDc} from './sheetRatios';
import {railPadThickness,clipGeometry} from '../engine/railSeat';
import {girderBearingTitle} from './columnCapSheet';
import {stopEnds,stopLocation,stopStiffeners,stopStiffenerArrangement} from '../engine/endStopInputs';
import type {CalculationSnapshot} from '../engine/types';
import {format} from '../engine/units';
import {endStopGeometry,stopBumperForce,activeEndStop,wrenchClearance} from '../engine/endStop';
import {craneCombinations} from '../engine/aistLoads';
import {boltProperties} from '../engine/connectionStrength';
import {drawingLength,plateInches,dimensionLength} from './drawingFormat';
import {refDim,dimText,sheetDrawingScale as drawingScale,text,line,rect,circle,dimH,dimV,multiLeader,filletLeader,detailRef,detailTitles,labelColumn,labelCaps,textWidth,n,breakLine,sectionCut,capChannelSection,type XY} from './sheetGraphics';
import {heading,numbered,table,type Style} from './noteBlocks';
import {topicSheetSvg,type DetailTopic,type DetailView} from './detailSheet';
import {flangeTieGeometry} from '../engine/tieGeometry';
import {activeEndBearing,continuousBearings} from '../engine/endBearingInputs';
import {heavyHex,hexSide,hexPlan} from './heavyHex';

const inch=25.4;
/**
 * Dimension practice on the stop views, layout units: each extension line starts a small gap off the feature it
 * locates (about 1/32 in printed) and runs just past its dimension line.
 */
const gap=2,over=4;
/** Dimension line ticks: horizontal and vertical dimension lines. */
const tickH=(x:number,y:number)=>line([x-2.5,y+3],[x+2.5,y-3]),tickV=(x:number,y:number)=>line([x-3,y+2.5],[x+3,y-2.5]);
/** Vertical dimension line with its ticks and value (as dimV), for extension lines drawn from their own features. */
function dimLineV(y1:number,y2:number,x:number,label:string){
 const w=textWidth(label,9),fits=w+6<=Math.abs(y2-y1),far=Math.max(y1,y2);
 return line([x,Math.min(y1,y2)],[x,fits?far:far+w+6])+tickV(x,y1)+tickV(x,y2)+dimText(x-6,fits?(y1+y2)/2:far+4+w/2,label,9,'middle',400,-90);
}

/** End stop details on their own sheet. */
export function endStopSheetSvg(s:CalculationSnapshot,number='S-07'){return topicSheetSvg(s,endStopTopic(s),number,'RUNWAY END STOPS');}
/** Bolted runway end stop: elevation, plan and section looking at the face, with design data and notes. */
export function endStopTopic(s:CalculationSnapshot):DetailTopic{
 const p=s.input,d=p.details!,e=activeEndStop(p)!,b=p.section,g=endStopGeometry(p,e),r=d.rail,u=p.units;
 const dim=(v:number)=>dimensionLength(v,u),size=(v:number)=>plateInches(v,u),force=(v:number)=>{const t=format(v,'force',u,1);return u==='US'?t.toUpperCase():t;};
 const tb=e.base.thickness,tp=e.face.thickness,H=e.face.height,ts=e.stiffener.thickness,Ls=e.stiffener.length,sp=e.stiffener.spacing,Wb=e.base.width,gauge=e.bolts.gauge,db=e.bolts.diameter;
 const capped=b.kind==='cap',capT=capped?b.capTw:0,railDepth=p.aist?.railDepth??p.railHeight,stiffTop=g.stiffenerHeight;
 // The rail stands on its pad, where there is one, and the first rail clip pair is the typical clip (schematic).
 const pad=railPadThickness(p),cg=clipGeometry(r,pad),kg={length:cg.baseLength,height:cg.noseHeight+12.7,tip:cg.tip,outer:cg.outer};
 const shown=Math.max(g.railEnd+8*inch,d.bearing.length+4*inch),depthShown=capT+b.tf+6*inch;
 const zs=stopStiffeners(e),arrangement=stopStiffenerArrangement(e),nBolts=2*g.rows.length;
 const stiffenerLabel=arrangement==='center'?`1 PL ${size(ts)} STIFFENER ON STOP C/L`:arrangement==='outer'?`2 PL ${size(ts)} STIFFENERS AT BASE PL EDGES`:`2 PL ${size(ts)} STIFFENERS AT ${dim(sp)} O.C.`;
 const boltLabel=`${nBolts} - ${size(db)} ${e.bolts.grade} PRETENSIONED (SC)`,hole=boltProperties(e.bolts.grade,db).hole,hx=heavyHex(db);
 const keeperRef=detailRef(detailTitles.railKeeper),views:DetailView[]=[];

 // 1: Elevation along the runway at the runway end.
 views.push({title:detailTitles.endStop,render:()=>{
  let svg='';
  const k=drawingScale(Math.min(.36,300/shown,250/(depthShown+tb+H+2*inch)),u),kk=k.pointsPerMm,X=(x:number)=>120+x*kk,ys=112+(tb+H)*kk,Y=(z:number)=>ys-z*kk;
  const wTop=ys+capT*kk,wFl=wTop+b.tf*kk,cut=ys+depthShown*kk,right=X(shown);
  svg+='<g data-view="end-stop-elevation">';
  // Girder top region, broken below the top flange.
  svg+=line([X(0),ys],[right,ys],'runway-line')+line([X(0),wFl],[right,wFl],'runway-line')+line([X(0),ys],[X(0),cut],'runway-line');
  if(capped)svg+=line([X(0),wTop],[right,wTop],'runway-line')+line([X(0),wTop+(b.capDepth-b.capTw)*kk],[right,wTop+(b.capDepth-b.capTw)*kk],'runway-line');
  svg+=breakLine([X(0)-6,cut],[right+6,cut])+breakLine([right,ys-4],[right,cut]);
  // End bearing stiffener (near side) under the top flange.
  const xs=d.bearing.length/2;svg+=rect(X(xs-d.bearing.stiffenerThickness/2),wFl,d.bearing.stiffenerThickness*kk,cut-wFl,'runway-line');
  // Top tie saddle under the flange on the column side, between the girder end and the stop bolts.
  const tie=flangeTieGeometry(p),endTie=tie?.sides.includes(1)?tie.stations.find(v=>v.bay===1&&v.end==='left'):undefined;
  if(tie&&endTie)svg+=rect(X(endTie.tieX-tie.attachment.saddleLength/2),wFl,tie.attachment.saddleLength*kk,tie.attachment.saddleThickness*kk,'hidden-line');
  // Stop: base plate, face plate and stiffener profile.
  const yb=Y(tb);
  svg+=rect(X(g.back),yb,e.base.length*kk,tb*kk,'runway-line')+rect(X(g.faceBack),Y(tb+H),tp*kk,H*kk,'runway-line');
  svg+=`<path class="runway-line" d="M${n(X(g.faceBack))},${n(yb)}L${n(X(g.faceBack))},${n(Y(tb+stiffTop))}L${n(X(g.stiffenerEnd))},${n(Y(tb+inch))}L${n(X(g.stiffenerEnd))},${n(yb)}"/>`;
  // Ordinate dimensions from the girder end, stacked above the stop with the shortest nearest the stop, so no
  // extension line crosses a dimension line. The bolt center lines run up from the bolts to their dimensions.
  const top=Y(tb+H),ordinates:[number,string][]=[...g.rows.map((x,i)=>[x,i===0?'BACK BOLTS':i===g.rows.length-1?'FRONT BOLTS':'MIDDLE BOLTS'] as [number,string]),[g.faceFront,'STOP FACE']],tier=(i:number)=>top-10-12*i;
  // Heavy hex bolts with heads on the base plate and nuts below the flange.
  for(const [i,x] of g.rows.entries()){
   svg+=line([X(x),tier(i)-over],[X(x),wFl+hx.nut*kk+3],'grid-line');
   svg+=hexSide(X(x),Y(tb),hx.corners*kk,hx.head*kk,-1)+hexSide(X(x),wFl,hx.corners*kk,hx.nut*kk,1);
  }
  // Rail from its end, with the first rail clip pair.
  const railTop=Y(pad+railDepth);
  svg+=line([X(g.railEnd),Y(pad)],[X(g.railEnd),railTop],'rail-line');
  for(const z of [0,r.baseThickness,railDepth-r.headThickness,railDepth])svg+=line([X(g.railEnd),Y(pad+z)],[right,Y(pad+z)],'rail-line');
  if(pad>0)svg+=rect(X(g.railEnd),Y(pad),(right-X(g.railEnd)),pad*kk,'runway-line');
  const keeper=g.railEnd+kg.length/2+12.7;svg+=rect(X(keeper-kg.length/2),Y(kg.height),kg.length*kk,kg.height*kk,'runway-line');
  // Crane bumper, by the crane supplier.
  const br=e.bumperDiameter/2,bc:XY=[X(g.faceFront)+br*kk,Y(tb+g.contact)];
  svg+=circle(bc[0],bc[1],br*kk,'reference-line')+line([bc[0]+br*kk,bc[1]],[bc[0]+br*kk+28,bc[1]],'reference-line');
  svg+=line([X(g.faceFront)-4,bc[1]],[bc[0]+br*kk+34,bc[1]],'grid-line');
  // Each label sits outboard of the girder end on its own dimension line, clear of the stop and of the callout
  // leaders. The origin line rises from the top of the girder end and the stop face line from the top of the face
  // plate. The base plate is located on the plan.
  ordinates.forEach(([x,label],i)=>{const yd=tier(i);svg+=line([X(0)-3,yd],[X(x),yd])+tickH(X(0),yd)+tickH(X(x),yd)+dimText(X(0)-5,yd+3,`${label} ${dim(x)}`,7.5,'end');});
  svg+=line([X(0),ys-gap],[X(0),tier(ordinates.length-1)-over])+line([X(g.faceFront),top-gap],[X(g.faceFront),tier(ordinates.length-1)-over]);
  // Face plate height from the top of the base plate, between the girder end and the stop: the upper extension line
  // from the top of the face plate, the lower from the back of the base plate.
  {const xh=X(g.back)-14;svg+=line([X(g.faceBack)-gap,top],[xh-over,top])+line([X(g.back)-gap,yb],[xh-over,yb])+dimLineV(top,yb,xh,dim(H));}
  svg+=dimH(X(0),X(xs),cut+gap,cut+24,`${dim(xs)} TO BEARING STIFFENER C/L`,'left');
  // Labels right of the rail, from above the face plate to below the girder cut, so they follow the drawn size.
  const lx=Math.max(X(shown)+48,bc[0]+br*kk+70);
  svg+=labelColumn([
   {at:[X(g.faceFront),Y(tb+H*.85)],labels:[`PL ${size(tp)} X ${size(Wb)} X ${dim(H)} FACE`]},
   {at:[bc[0]+br*kk*.7,bc[1]-br*kk*.7],labels:['CRANE BUMPER (REF.), BY CRANE SUPPLIER',`C/L ${dim(e.bumperHeight)} ABOVE T.O.R.`]},
   {at:[X(g.faceBack-Ls*.35),Y(tb+inch+(stiffTop-inch)*.65)],labels:[stiffenerLabel,`${dim(Ls)} AT BASE, ${dim(stiffTop)} HIGH AT FACE`]},
   // Stiffeners brace the face plate: welded to it over their full height.
   {at:[X(g.faceBack),Y(tb+stiffTop*.3)],labels:[zs.length>1?'STIFFENERS TO FACE PL,':'STIFFENER TO FACE PL,','BOTH SIDES, FULL HEIGHT'],weld:size(e.weldSize)},
   {at:[X(g.railEnd),Y(railDepth*.6)],labels:[`RAIL ENDS ${dim(g.railClear)} CLEAR OF BASE PL`]},
   {at:[X(g.faceFront)+1,yb],labels:[zs.length>1?'FACE PL AND STIFFENERS TO':'FACE PL AND STIFFENER TO','BASE PL, BOTH SIDES'],weld:size(e.weldSize)},
   {at:[X(g.front),yb+tb*kk/2],labels:[`PL ${size(tb)} X ${size(Wb)} X ${dim(e.base.length)} BASE`]},
   {at:[X(g.frontRow)+hx.corners/2*kk,wFl+hx.nut/2*kk],labels:[boltLabel,`${size(hole)} STD HOLES THRU ${capped?'CAP AND ':''}FLANGE`,'HEADS UP, NUTS BELOW TOP FLANGE']},
   {at:[X(xs+d.bearing.stiffenerThickness/2),cut-8],labels:[`END BEARING STIFFENERS, SEE ${detailRef(girderBearingTitle(p))}`]},
   ...(tie&&endTie?[{at:[X(endTie.tieX),wFl+tie.attachment.saddleThickness*kk] as XY,labels:['TOP TIE SADDLE, FAR SIDE (HIDDEN)',`SEE ${detailRef(detailTitles.flangeTie)}`]}]:[])
  ],lx,Y(tb+H)-54,cut+30);
  // The girder end, led to its end line below the flange.
  {const label='GIRDER END',w=textWidth(label,7.5,true),ty=(wFl+cut)/2,at:XY=[X(0)-22-w,ty+3];svg+=multiLeader([[X(0),ty]],at,[],7.5,[],w)+text(at[0],at[1],label,7.5,'start',700);}
  return {svg:svg+'</g>',scale:k.label};
 }});
 // 2: Plan on the girder top.
 views.push({title:detailTitles.endStopPlan,render:()=>{
  let svg='';
  const width=g.surfaceWidth,k=drawingScale(Math.min(.36,330/shown,190/width),u),kk=k.pointsPerMm,X=(x:number)=>710+x*kk,Z=(z:number)=>212+z*kk,right=X(shown);
  svg+='<g data-view="end-stop-plan">';
  svg+=line([X(0),Z(-width/2)],[right,Z(-width/2)],'runway-line')+line([X(0),Z(width/2)],[right,Z(width/2)],'runway-line')+line([X(0),Z(-width/2)],[X(0),Z(width/2)],'runway-line');
  svg+=breakLine([right,Z(-width/2)-4],[right,Z(width/2)+4]);
  if(capped)for(const z of [-b.bf/2,b.bf/2])svg+=line([X(0),Z(z)],[right,Z(z)],'hidden-line');
  svg+=line([X(0)-14,Z(0)],[right+10,Z(0)],'grid-line')+text(right+14,Z(0)+3,'GIRDER C/L',7.5);
  const rz=p.railEccentricity;
  svg+=line([X(g.railEnd)-6,Z(rz)],[right+10,Z(rz)],'grid-line')+text(right+14,Z(rz)+11,'RAIL C/L',7.5);
  svg+=rect(X(g.railEnd),Z(rz-r.baseWidth/2),(shown-g.railEnd)*kk,r.baseWidth*kk,'rail-line')+rect(X(g.railEnd),Z(rz-r.headWidth/2),(shown-g.railEnd)*kk,r.headWidth*kk,'rail-line');
  // Rail clips seen from above: from the nose over the rail base to the outer edge of the base.
  const keeper=g.railEnd+12.7;for(const side of [-1,1]){const a=Z(rz+side*kg.tip),b2=Z(rz+side*kg.outer);svg+=rect(X(keeper),Math.min(a,b2),kg.length*kk,Math.abs(b2-a),'runway-line');}
  svg+=rect(X(g.back),Z(-Wb/2),e.base.length*kk,Wb*kk,'runway-line')+rect(X(g.faceBack),Z(-Wb/2),tp*kk,Wb*kk,'runway-line');
  for(const z of zs)svg+=rect(X(g.stiffenerEnd),Z(z-ts/2),Ls*kk,ts*kk,'runway-line');
  // Heavy hex heads seen from above, on the bolt centers.
  const hr=hx.corners/2*kk;
  for(const x of g.rows)for(const side of [-1,1]){const c:XY=[X(x),Z(side*gauge/2)],rr=db/2*kk;svg+=hexPlan(c[0],c[1],hx.flats*kk)+line([c[0]-rr-2,c[1]],[c[0]+rr+2,c[1]])+line([c[0],c[1]-rr-2],[c[0],c[1]+rr+2]);}
  // Extension lines start clear of the heads and the base plate edge, and run past the dimension lines.
  {const xg=X(0)-22,xw=X(0)-40;svg+=dimV(Z(-gauge/2),Z(gauge/2),X(g.backRow)-hr-2,xg,dim(gauge))+dimV(Z(-Wb/2),Z(Wb/2),X(g.back)-2,xw,dim(Wb));}
  // Separate dimensions on one line below the girder, none chained across a part it does not measure, each extension
  // line starting just clear of the feature it locates: the base plate from the girder end, the front bolts to the
  // face plate and the rail end to the nearest stop steel, the base plate edge in front of the face. The plates are
  // sized by their callouts. A value too long for its
  // dimension is led off below it, clear of the extension lines.
  // The dimension line stands below the girder edge and below a base plate wider than the girder, clear of the base
  // plate width's extension line.
  const edge=Z(width/2)+2,zd=Z(Math.max(width,Wb)/2)+16,from=(x:number,z:number)=>z+2<edge?line([x,z+2],[x,edge]):'';
  const short=(x1:number,z1:number,x2:number,z2:number,label:string,side:-1|1)=>{const w=textWidth(label,9),mid=(x1+x2)/2;
   return from(x1,z1)+from(x2,z2)+line([x1,edge],[x1,zd+5])+line([x2,edge],[x2,zd+5])+line([x1,zd],[x2,zd])+tickH(x1,zd)+tickH(x2,zd)+multiLeader([[mid,zd]],[side<0?mid-14-w:mid+14,zd+14],[label],9);};
  svg+=dimH(X(0),X(g.back),edge,zd,dim(e.setback))+from(X(g.back),Z(Wb/2));
  // Front bolt C/L to the back of the face plate: the head clears the face plate fillet toe by the socket clearance.
  svg+=short(X(g.frontRow),Z(gauge/2)+hx.flats/2*kk,X(g.faceBack),Z(Wb/2),dim(e.bolts.frontClear),-1);
  svg+=short(X(g.front),Z(Wb/2),X(g.railEnd),Z(rz+r.baseWidth/2),dim(g.railClear),1);
  svg+=multiLeader([[X(keeper)+kg.length*kk,Z(rz-kg.outer)]],[X(shown)+44,Z(-width/2)-14],['FIRST RAIL CLIP PAIR',`SPACING PER ${keeperRef}`]);
  // Bolt callout above the girder at the back of the stop, clear of the section cut and the rail clip callout.
  {const labels=[boltLabel,'HEADS ON BASE PL'],w=Math.max(...labels.map(v=>textWidth(labelCaps(v),8.5))),c:XY=[X(g.backRow),Z(-gauge/2)];
   svg+=multiLeader([[c[0]-hr*.25,c[1]-hx.flats/2*kk]],[c[0]-24-w,Z(-width/2)-26],labels);}
  // Both stiffeners to the face plate, each side of each stiffener.
  svg+=filletLeader([[X(g.faceBack)-1,Z(zs.at(-1)!+ts/2)+1]],[X(shown)+44,Math.max(Z(width/2)-4,Z(-width/2)+50)],size(e.weldSize),[zs.length>1?'TYP. BOTH STIFFENERS TO FACE PL':'STIFFENER TO FACE PL, BOTH SIDES','FULL HEIGHT'],true,[[[X(g.faceFront)+6,Z(width/2)-6]]]);
  svg+=text(X(0)-4,zd+30,'GIRDER END',8,'start',700);
  // Section between the base plate edge and the rail end, looking at the face.
  {const xs=X((g.front+g.railEnd)/2);svg+=sectionCut([xs,Z(-width/2)-4],[xs,Z(width/2)+4],[-1,0],detailTitles.endStopSection,['a']);}
  return {svg:svg+'</g>',scale:k.label};
 }});
 // 3: Section between the rail end and the stop, looking at the face.
 views.push({title:detailTitles.endStopSection,render:()=>{
  let svg='';
  const cutDepth=capT+b.tf+3*inch,k=drawingScale(Math.min(.36,260/Math.max(Wb,g.surfaceWidth),215/(H+tb+cutDepth+2*inch)),u),kk=k.pointsPerMm,cx=250,ys=412+(tb+H)*kk,X=(z:number)=>cx+z*kk,Y=(h:number)=>ys-h*kk;
  const wTop=ys+capT*kk,wFl=wTop+b.tf*kk,cut=ys+cutDepth*kk,yb=Y(tb);
  svg+='<g data-view="end-stop-section">';
  if(capped)svg+=capChannelSection(b,(x,z)=>[X(x),wTop-z*kk]);
  svg+=rect(X(-b.bf/2),wTop,b.bf*kk,b.tf*kk,'runway-line')+line([X(-b.tw/2),wFl],[X(-b.tw/2),cut],'runway-line')+line([X(b.tw/2),wFl],[X(b.tw/2),cut],'runway-line');
  svg+=breakLine([X(-b.tw/2)-10,cut],[X(b.tw/2)+10,cut]);
  svg+=rect(X(-Wb/2),yb,Wb*kk,tb*kk,'runway-line')+rect(X(-Wb/2),Y(tb+H),Wb*kk,H*kk,'runway-line');
  for(const z of zs)svg+=rect(X(z-ts/2),Y(tb+stiffTop),ts*kk,stiffTop*kk,'hidden-line');
  // Heads behind the face plate (hidden) and nuts below the flange.
  for(const side of [-1,1]){const x=X(side*gauge/2);svg+=hexSide(x,yb,hx.corners*kk,hx.head*kk,-1,'hidden-line')+hexSide(x,wFl,hx.corners*kk,hx.nut*kk,1)+line([x,yb-hx.head*kk-3],[x,wFl+hx.nut*kk+3],'grid-line');}
  const tor=Y(pad+railDepth),bc:XY=[X(p.railEccentricity),Y(tb+g.contact)];
  svg+=line([X(-Wb/2)-6,tor],[X(Wb/2)+30,tor],'grid-line')+text(X(Wb/2)+32,tor+3,'T.O.R.',7.5);
  svg+=circle(bc[0],bc[1],e.bumperDiameter/2*kk,'reference-line');
  // Face plate width above it and gauge below the nuts, its text clear of the web break. Face plate height and bumper
  // C/L height left of the plates; the bumper C/L runs across the face plate to its dimension. Extension lines run
  // past their dimension lines.
  const xH=X(-Wb/2)-52,xC=X(-Wb/2)-30,rb=e.bumperDiameter/2*kk;
  svg+=dimH(X(-Wb/2),X(Wb/2),Y(tb+H)-2,Y(tb+H)-14,dim(Wb))+dimH(X(-gauge/2),X(gauge/2),wFl+hx.nut*kk+2,cut+26,dim(gauge));
  svg+=dimV(Y(tb+H),yb,X(-Wb/2)-2,xH,dim(H));
  // The bumper height shares the base plate extension line of the face plate height.
  svg+=line([bc[0]+rb+6,bc[1]],[xC-over,bc[1]],'grid-line')+refDim(dimLineV(bc[1],yb,xC,drawingLength(g.contact,u)));
  const lx=Math.min(X(Math.max(Wb,g.surfaceWidth)/2)+60,420);
  svg+=labelColumn([
   {at:[bc[0]+e.bumperDiameter/2*kk*.7,bc[1]-e.bumperDiameter/2*kk*.7],labels:['CRANE BUMPER (REF.)',`${size(e.bumperDiameter)} CONTACT, ON RAIL C/L`,`C/L ${drawingLength(g.contact,u)} ABOVE BASE PL`]},
   {at:[X(zs.at(-1)!+ts/2),Y(tb+stiffTop*.5)],labels:[zs.length>1?'STIFFENERS BEYOND (HIDDEN),':'STIFFENER BEYOND (HIDDEN),','WELDED TO FACE PL FULL HEIGHT']},
   {at:[X(gauge/2)+hx.corners/2*kk,wFl+hx.nut/2*kk],labels:[boltLabel,'NUTS BELOW TOP FLANGE','CLEAR OF WEB FILLET']},
   {at:[X(b.tw/2),cut-6],labels:[`${b.name} RUNWAY GIRDER`]}
  ],lx,410,620);
  return {svg:svg+'</g>',scale:k.label};
 }});
 // 4: Design data and notes.
 {
  const P=Math.max(...craneCombinations(p.method).map(c=>c.bumper))*stopBumperForce(p),check=(id:string)=>s.checks.find(c=>c.id===id);
  // The governing DESIGN check of the stop, as the calculation reports it (no classification or detailing rule), and
  // the open items of the stop element with a failing check, failing detailing and fit rules named apart (sheetRatios).
  const stop=elementSummary(s,inElements(['stops'])),worst=stop.strength?.check,fails=failingNote(s,stop);
  const T=check('end-stop-bolt-tension')?.demand,V=check('end-stop-bolt-shear')?.demand;
  // Where the bumper force leaves the girder: the one locating support of a continuous girder, else the end bay's locating end.
  const fixed=continuousBearings(p).find(v=>v.role==='LOCATING'),locating=fixed&&activeEndBearing(p)?`THE LOCATING BEARING AT GRID ${fixed.grid}`:p.system==='simple'?'THE LOCATING END OF EACH END BAY':'THE LOCATING END CONNECTION';
  const rows=[
   ['BUMPER FORCE, PER CRANE SUPPLIER',force(stopBumperForce(p))],
   [`FACTORED (${p.method}, AIST STOP COMBINATIONS)`,force(P)],
   ['BUMPER C/L ABOVE T.O.R. / CONTACT DIAMETER',`${dim(e.bumperHeight)} / ${size(e.bumperDiameter)}`],
   ['FRONT BOLT TENSION / BOLT SHEAR',T!==undefined&&V!==undefined?`${force(T)} / ${force(V)}`:'-'],
   // Socket room for the heads beside the stop welds (AISC Manual Table 7-15).
   ['BOLT C/L TO WELD TOE: FACE PL / STIFFENER',`${size(g.toe.face)} / ${size(g.toe.stiffener)}, ${size(wrenchClearance(db))} MIN.`],
   ['GOVERNING STOP CHECK',worst?`${worst.title.replace(/\s*\(ratio t_min\/t\)/,'').toUpperCase()}: D/C ${sheetDc(s,stop.strength!.dc)}${/prying/.test(worst.id)?' (THICKNESS RATIO)':''}`:'-'],
   ...(fails?[['OPEN ITEMS',fails]]:[]),
   ['QUANTITY',`${2*stopEnds(p).length}: ${stopLocation(p).split(';')[0].toUpperCase()}`],
   ['DATA SOURCE',e.source||'NOT ENTERED']
  ];
  const notes=[
   stopEnds(p).length===2?'PROVIDE ONE STOP AT EACH END OF EACH RUNWAY, CENTERED ON THE GIRDER. THE STOP AT THE OPPOSITE END IS THE MIRROR IMAGE.':`PROVIDE ONE STOP AT ${stopLocation(p).split(';')[0].toUpperCase()}, CENTERED ON THE GIRDER. THE RUNWAY CONTINUES BEYOND THE OTHER MODELED END; NO STOP THERE.`,
   `DRILL ${size(hole)} STANDARD HOLES THROUGH ${capped?'THE CAP CHANNEL WEB AND ':''}THE TOP FLANGE ONLY AT THE LOCATIONS SHOWN, ${g.rows.map(dim).join(g.rows.length>2?', ':' AND ').replace(/, ([^,]*)$/,' AND $1')} FROM THE GIRDER END. NO OTHER HOLES IN THE TOP FLANGE.`,
   `BOLTS: ASTM F3125 GR. ${e.bolts.grade} HEAVY HEX, PRETENSIONED, CLASS B FAYING SURFACES (SLIP-CRITICAL); HEADS ON THE BASE PLATE, A563 DH NUTS BELOW THE FLANGE, F436 WASHER UNDER THE TURNED ELEMENT. BOLT CENTERS ARE ${size(wrenchClearance(db))} MIN. CLEAR OF THE STOP WELD TOES FOR THE SOCKET (AISC MANUAL TABLE 7-15). VERIFY NUT CLEARANCE BELOW THE FLANGE AT THE BEARING STIFFENERS${flangeTieGeometry(p)?' AND THE TOP TIE SADDLE':''} BEFORE DRILLING.`,
   `SHOP WELD THE FACE PLATE AND THE ${zs.length>1?'STIFFENERS':'STIFFENER'} TO THE BASE PLATE, AND ${zs.length>1?'EACH STIFFENER':'THE STIFFENER'} TO THE FACE PLATE OVER ITS FULL HEIGHT, WITH CONTINUOUS ${size(e.weldSize)} FILLETS BOTH SIDES. GRIND THE FACE SMOOTH AT THE BUMPER CONTACT.`,
   `TERMINATE THE RAIL ${dim(g.railClear)} CLEAR OF THE STOP BASE PLATE EDGE (${dim(g.railEnd-g.faceFront)} CLEAR OF THE STOP FACE), ${dim(g.railEnd)} FROM THE GIRDER END. THE FIRST RAIL CLIP PAIR IS AT THE RAIL END; CLIP SPACING PER ${keeperRef}. THE RAIL END BEARS ON THE STOP ONLY AFTER CREEP: THE STOPS ANCHOR THE FLOATING RAIL.`,
   'CONFIRM THE BUMPER FORCE, BUMPER HEIGHT AND CONTACT DIAMETER WITH THE CRANE SUPPLIER BEFORE FABRICATION. STOPS SHALL BE INSTALLED BEFORE THE CRANE IS OPERATED.',
   `THE GIRDER AXIAL FORCE AND ${locating} INCLUDE THE BUMPER FORCE; THE END COUPLE IS INCLUDED IN THE GIRDER STOP COMBINATIONS (CALCULATION REPORT, RUNWAY END STOPS).`
  ];
  return {key:'end-stop',name:'END STOPS',views,notes:(t:Style)=>[heading(t,'END STOP DESIGN DATA'),table(t,['ITEM','VALUE'],rows,[1.6,1.4]),heading(t,'END STOP NOTES'),...numbered(t,notes)]};
 }
}

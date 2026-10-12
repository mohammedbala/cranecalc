import type {CalculationSnapshot} from '../engine/types';
import {railSeat,clipOutline} from '../engine/railSeat';
import {boltProperties} from '../engine/connectionStrength';
import {railJointType,railJointGap,railJointBars} from '../engine/railLayout';
import {format} from '../engine/units';
import {drawingLength,dimensionLength,plateInches} from './drawingFormat';
import {refDim,dimText,sheetDrawingScale as drawingScale,text,line,rect,circle,dimH,dimV,multiLeader,filletLeader,breakLine,detailRef,detailTitles,textWidth,labelCaps,wrapToWidth,n,capChannelSection,type XY} from './sheetGraphics';
import {contentBounds,type DetailView} from './detailSheet';

const path=(pts:XY[],cls:string,close=true)=>`<path class="${cls}" d="${pts.map(([x,y],i)=>`${i?'L':'M'}${n(x)},${n(y)}`).join('')}${close?'Z':''}"/>`;
/** Diagonal hatching inside a rectangle, on the pattern layer. */
function hatchRect(x:number,y:number,w:number,h:number,step=4){
 let svg='';
 for(let c=step/2;c<w+h;c+=step){const a:XY=[x+Math.max(0,c-h),y+Math.min(h,c)],b:XY=[x+Math.min(w,c),y+Math.max(0,c-w)];if(Math.hypot(b[0]-a[0],b[1]-a[1])>.4)svg+=line(a,b,'hatch');}
 return svg;
}
/**
 * AWS A2.4 arrow-side fillet symbol with the size left and the length right of the triangle, flagged as a field
 * weld: the keepers and anchors are welded with the rail set and aligned in place.
 */
function fillet(points:XY[],at:XY,size:string,length:string,labels:string[],via:XY[][]=[]){
 return filletLeader(points,at,size,labels,false,via,true).replace(/<\/g>$/,'')+dimText(at[0]+53,at[1]+4,labelCaps(length.replaceAll('"','')),8)+'</g>';
}
/** Vertical dimension from an extension line at yExt to a surface it lands on; the text reads beside a short one. */
function dimToSurface(yExt:number,ySurface:number,fromX:number,x:number,label:string,side:'left'|'right'){
 const w=textWidth(label,9),fits=w+6<=Math.abs(ySurface-yExt),dir=x<fromX?-1:1;
 return line([fromX+dir*2,yExt],[x+dir*5,yExt])+line([x,yExt],[x,ySurface])+[yExt,ySurface].map(y=>line([x-3,y+2.5],[x+3,y-2.5])).join('')
  +(fits?dimText(x-6,(yExt+ySurface)/2,label,9,'middle',400,-90):dimText(side==='left'?x-5:x+5,(yExt+ySurface)/2+3,label,9,side==='left'?'end':'start'));
}
/**
 * Chained dimension: horizontal ('h', below the extension origins) or vertical ('v', left of them). Each
 * station has its own extension origin; text that does not fit its segment reads outside the chain end.
 */
function dimChain(dir:'h'|'v',at:number[],from:number[],pos:number,labels:string[]){
 let svg=at.map((v,i)=>dir==='h'?line([v,from[i]+2],[v,pos+5]):line([from[i]-2,v],[pos-5,v])).join('');
 svg+=dir==='h'?line([at[0],pos],[at.at(-1)!,pos]):line([pos,at[0]],[pos,at.at(-1)!]);
 svg+=at.map(v=>dir==='h'?line([v-2.5,pos+3],[v+2.5,pos-3]):line([pos-3,v+2.5],[pos+3,v-2.5])).join('');
 labels.forEach((label,i)=>{
  const a=at[i],b=at[i+1],w=textWidth(label,9),fits=w+6<=Math.abs(b-a),first=i===0;
  // A middle segment too short for its text carries it centred below the chain.
  if(dir==='h')svg+=fits?dimText((a+b)/2,pos-4,label,9,'middle'):first||i===labels.length-1?dimText(first?a-4:b+4,pos+3,label,9,first?'end':'start'):dimText((a+b)/2,pos+12,label,9,'middle');
  else svg+=fits?dimText(pos-5,(a+b)/2,label,9,'middle',400,-90):dimText(pos-5,(a+b)/2+3,label,9,'end');
 });
 return svg;
}
/** Translate drawn content so its top-left corner sits at (x, y); returns the placed content and its size. */
function place(svg:string,x:number,y:number){const b=contentBounds(svg);return {svg:`<g transform="translate(${n(x-b.x0)} ${n(y-b.y0)})">${svg}</g>`,w:b.x1-b.x0,h:b.y1-b.y0};}
const subTitle=(x:number,y:number,title:string,scale:string)=>text(x,y,title,7.5,'middle',700)+text(x,y+10,scale,7,'middle');
const labelWidth=(labels:string[])=>Math.max(0,...labels.map(v=>textWidth(labelCaps(v),8.5)));

/**
 * Rail clip detail: the section through the rail, a pair of opposing rail clips and the girder top plate, with the
 * clip callout and the base weld symbol (field weld: the clips are welded with the rail set and aligned), the rail
 * clip note in the standard form, and the bolted rail joint. The clip is drawn schematically: its shape, nose and
 * capacity are the manufacturer's.
 */
export function railKeeperView(s:CalculationSnapshot):DetailView{
 return {title:detailTitles.railKeeper,render:()=>{
  const p=s.input,b=p.section,d=p.details!,r=d.rail,u=p.units,depth=p.aist!.railDepth,capped=b.kind==='cap';
  // SI sizes read to the millimetre, and those under 10 mm (clearances, small welds) to the half millimetre:
  // no false precision from converted inch sizes.
  const siMm=(v:number)=>`${v.toLocaleString('en-US')} mm`,siValue=(v:number)=>v<10?Math.round(v*2)/2:Math.round(v),si=(v:number)=>siMm(siValue(v));
  const {pad,clip:C,entered}=railSeat(p),pt=pad?.thickness??0,size=(v:number)=>u==='SI'?si(v):plateInches(v,u),dim=(v:number)=>u==='SI'?si(v):dimensionLength(v,u);
  const recW=capped?b.capWidth:b.bf,below=capped?b.capDepth-b.capTw+b.tf:b.tf,stub=16;

  // ---- 1. Section through a clip pair: rail C/L at x = 0, top of rail at y = 0.
  const scale=drawingScale(Math.min(.75,150/recW,(120-stub)/(depth+pt+below)),u),k=scale.pointsPerMm,X=(mm:number)=>mm*k;
  const yBaseTop=X(depth-r.baseThickness),yBaseBot=X(depth),ySteel=X(depth+pt);
  let sec='<g data-view="rail-section">';
  sec+=rect(X(-r.headWidth/2),0,X(r.headWidth),X(r.headThickness),'rail-line')+rect(X(-r.webThickness/2),X(r.headThickness),X(r.webThickness),X(depth-r.headThickness-r.baseThickness),'rail-line')+rect(X(-r.baseWidth/2),yBaseTop,X(r.baseWidth),X(r.baseThickness),'rail-line');
  if(pad)sec+=rect(X(-pad.width/2),yBaseBot,X(pad.width),X(pt),'rail-line')+hatchRect(X(-pad.width/2),yBaseBot,X(pad.width),X(pt),2.5);
  const wTop=ySteel+(capped?X(b.capTw):0),wBot=wTop+X(b.tf);
  sec+=rect(X(-b.bf/2),wTop,X(b.bf),X(b.tf),'runway-line')+line([X(-b.tw/2),wBot],[X(-b.tw/2),wBot+stub],'runway-line')+line([X(b.tw/2),wBot],[X(b.tw/2),wBot+stub],'runway-line')+breakLine([X(-b.tw/2)-6,wBot+stub],[X(b.tw/2)+6,wBot+stub]);
  if(capped)sec+=capChannelSection(b,(x,z)=>[X(x),wTop-X(z)]);
  // Opposing clips, schematic outline (the manufacturer's shape); the base footprint is the entered one.
  for(const side of [-1,1] as const)sec+=path(clipOutline(C,side).map(([x,z]):XY=>[X(x),ySteel-X(z)]),'runway-line');
  // Top of rail to T.O.S., the top of the W as the T.O.R. / T.O.S. elevations on S-00 and S-01 use it: the rail,
  // the pad and, on a capped girder, the channel web.
  const edge=X(recW/2),xd=edge+10;
  sec+=line([X(r.headWidth/2)+2,0],[xd+5,0])+line([edge+2,wTop],[xd+5,wTop])+line([xd,0],[xd,wTop])+[0,wTop].map(y=>line([xd-3,y+2.5],[xd+3,y-2.5])).join('')+refDim(dimText(xd-6,wTop/2,size(depth+pt+(capped?b.capTw:0)),9,'middle',400,-90))+text(xd+8,3,'T.O.R.',7.5)+text(xd+8,wTop+3,'T.O.S.',7.5);
  // Callouts left of the section, in the order of their targets down the section.
  const productName=r.padSource.split(/[:;]/)[0].trim(),railLabel=`${size(depth)} RAIL: HEAD ${size(r.headWidth)} X ${size(r.headThickness)},`;
  const productLines=wrapToWidth(labelCaps(productName),Math.max(160,labelWidth([railLabel,`RAIL PAD ${size(pt)} X ${size(pad?.width??0)}, CONT.:`,`ALLOWABLE COMPRESSION ${format(r.padAllowable,'stress',u,u==='SI'?1:2)}`])),8.5);
  const noseAt:XY=[X(-(C.tip+C.inner)/2),ySteel-X(C.noseHeight)-X(6.35)];
  const items:{at:XY;labels:string[];via?:XY[];weld?:boolean}[]=[
   {at:[X(-r.headWidth/2)+4,X(r.headThickness)*.5],labels:[railLabel,`BASE ${size(r.baseWidth)} X ${size(r.baseThickness)}`]},
   {at:noseAt,labels:['RAIL CLIP, EACH SIDE (SCHEMATIC):',`${C.type==='weld-on'?'WELD-ON':'BOLTED'}, FLOATING, PER MANUFACTURER`]},
   ...(pad?[{at:[X(-r.baseWidth/2+r.headWidth/4),yBaseBot+X(pt)/2] as XY,via:[[X(-r.baseWidth/2+r.headWidth/4)-10,yBaseTop-12] as XY],labels:[`RAIL PAD ${size(pt)} X ${size(pad.width)}, CONT.:`,...productLines,`ALLOWABLE COMPRESSION ${format(r.padAllowable,'stress',u,u==='SI'?1:2)}`]}]:[]),
   ...(C.type==='weld-on'?[{at:[X(-C.outer)+X(C.baseWidth)*.3,ySteel-1] as XY,labels:['EACH END OF CLIP BASE (MIN.)'],weld:true}]:[]),
   {at:[X(-recW/2)+(capped?0:3),capped?ySteel+X(b.capTw):wBot],labels:capped?[`${b.name} GIRDER`,p.capDesign?`CAP ATTACHMENT: SEE ${detailRef(detailTitles.capSection)}`:'CAP ATTACHMENT BY OTHERS']:[`${b.name} GIRDER, PARTIAL`]}
  ];
  const cw=Math.max(...items.map(v=>v.weld?110:labelWidth(v.labels))),cx=-edge-26-cw;
  let ly=-4;
  for(const v of items){
   // The weld symbol keeps its elbow beyond the widest callout so its leader clears the text above.
   if(v.weld){const x=cx+cw-labelWidth(v.labels);sec+=fillet([v.at],[Math.min(x,cx+cw-92),ly+3],size(C.weld),size(C.weldLength),v.labels);ly+=17+v.labels.length*11+8;}
   else{sec+=multiLeader([v.at],[cx,ly],v.labels,8.5,v.via?[v.via]:[],cw);ly+=v.labels.length*11+8;}
  }
  sec+='</g>';
  const section=place(sec,0,0);

  // ---- 4. Bolted rail joint, elevation; edge distances and pitch on the left half, symmetric about the joint.
  const hole=boltProperties('A325',r.jointBoltDiameter).hole,tight=railJointType(p)==='tight',gap=railJointGap(p),jb0=railJointBars(p),bar=jb0.length;
  // The bar length closes the symmetric string of edge distances, pitches and the gap as they read.
  const barLabel=u==='SI'?siMm(2*(siValue(r.jointEdge)+siValue(r.jointPitch)+siValue(jb0.centerEdge))):dim(bar);
  const js=drawingScale(Math.min(.36,150/bar,60/depth),u),jk=js.pointsPerMm,J=(mm:number)=>mm*jk;
  const jc=J(bar/2)+12,jb=J(depth),jl=jc-J(bar/2),web=J(r.headThickness+(depth-r.headThickness-r.baseThickness-r.jointPlateHeight)/2);
  let jv='<g data-view="rail-joint">';
  for(const side of [-1,1]){const end=jc+side*J(gap)/2,far=jc+side*(J(bar/2)+12);
   jv+=line([end,0],[end,jb],'rail-line')+[0,J(r.headThickness),jb-J(r.baseThickness),jb].map(y=>line([end,y],[far,y],'rail-line')).join('');}
  jv+=rect(jl,web,J(bar),J(r.jointPlateHeight),'runway-line');
  const bolts=jb0.bolts.map(v=>jl+J(v)),by=web+J(r.jointPlateHeight)/2;
  for(const x of bolts)jv+=(tight?circle(x,by,J(hole)/2,'reference-line'):rect(x-J(.75*r.jointBoltDiameter),by-J(hole)/2,J(1.5*r.jointBoltDiameter),J(hole),'reference-line'))+circle(x,by,J(r.jointBoltDiameter)/2,'runway-line');
  const yd=jb+12,pitchFits=textWidth(size(r.jointPitch),9)+6<=J(r.jointPitch);
  // The string closes on the joint centerline: the rail ends stand half the gap either side of it.
  jv+=line([jc,jb+2],[jc,yd+5],'grid-line')+dimChain('h',[jl,bolts[0],bolts[1],jc],[jb,jb,jb,jb],yd,[size(r.jointEdge),size(r.jointPitch),size(jb0.centerEdge)]);
  // The overall string stands clear of the chain's extension lines, which run 5 pt past the chain.
  jv+=dimH(jl,jl+J(bar),jb+2,yd+(pitchFits?22:30),barLabel);
  jv+='</g>';
  const joint=place(jv,0,0);

  // ---- Compose. Top: the section and its callouts, the rail joint at the right with its notes. Below: the rail clip
  // note in the standard form, the anchorage and the rail fabrication note.
  const jx=section.w+24,noteW=Math.max(joint.w,660-jx);
  // Notes wrapped to a width in capitals, an SI value kept on one line with its unit.
  const wrap=(v:string,width:number,size:number)=>wrapToWidth(labelCaps(v).replace(/(\d) mm\b/g,'$1\u0001mm'),width,size).map(row=>row.replaceAll('\u0001',' '));
  // The bars carry the slots (their net section and block shear are checked with them); the rail web is drilled.
  const jointNotes=wrap(tight?`TIGHT JOINT (AIST TR-13 §5.16.1): 2 BARS ${size(r.jointPlateThickness)} X ${size(r.jointPlateHeight)} X ${barLabel}; 4 - ${size(r.jointBoltDiameter)} A325 PRETENSIONED IN ${size(hole)} STANDARD HOLES IN THE BARS AND THE RAIL WEB. RAIL ENDS BUTTED, GAP 1/16 IN. MAX.; RE-TIGHTEN THE BOLTS AFTER 30 AND 90 DAYS OF OPERATION. SYMMETRIC`:`OPEN JOINT: 2 BARS ${size(r.jointPlateThickness)} X ${size(r.jointPlateHeight)} X ${barLabel}, SLOTTED ${size(1.5*r.jointBoltDiameter)} X ${size(hole)} ALONG THE RAIL; 4 - ${size(r.jointBoltDiameter)} A325 IN ${size(hole)} DRILLED HOLES IN THE RAIL WEB. GAP ${size(gap)}. RE-TIGHTEN AFTER 30 AND 90 DAYS. SYMMETRIC`,noteW,7.2);
  const rowY=Math.max(section.h,joint.h+31+jointNotes.length*9)+14;
  let svg='<g data-view="rail-connection">'+section.svg;
  svg+=`<g transform="translate(${n(jx)} 0)">${joint.svg}${subTitle(joint.w/2,joint.h+12,'RAIL JOINT / ELEVATION',js.label)}${jointNotes.map((v,i)=>text(joint.w/2,joint.h+31+i*9,v,7.2,'middle')).join('')}</g>`;
  // The rail clip note: type, manufacturer, rating, spacing, float and the base weld, as the engineer of record specifies them.
  const rated=(v:number)=>format(v,'force',u,u==='SI'?0:1),basis=C.basis==='allowable'?'ALLOWABLE':'LRFD',seat=capped?'CAP CHANNEL':'GIRDER TOP FLANGE';
  const clipNote=`RAIL CLIPS: ${C.type==='weld-on'?'WELD-ON':'BOLTED'}, PER MANUFACTURER (${entered?C.product:'MANUFACTURER AND SERIES TO BE ENTERED'}), RATED ≥ ${rated(C.lateral)} LATERAL AND ≥ ${rated(C.uplift)} UPLIFT PER CLIP (${basis}), IN OPPOSING PAIRS AT ${dim(p.aist!.clipSpacing)} O.C. MAX. AND A PAIR EACH SIDE OF EVERY RAIL JOINT, FLOATING; ${C.type==='weld-on'?`WELD BASE TO ${seat} PER MANUFACTURER (MIN. ${size(C.weld)} FILLET X ${size(C.weldLength)}, EACH END OF THE BASE).`:`BOLT PER MANUFACTURER.`}`;
  const anchorNote=tight?`RAIL ANCHORAGE: THE FLOATING RAIL IS ANCHORED BY THE END STOPS (${detailRef(detailTitles.endStop)}); NO ANCHOR CLIPS OR RAIL NOTCHES. RAIL JOINTS AND CLIP SPACING: ${detailRef(detailTitles.railLayout)}.`
   :`RAIL ANCHORAGE: ONE ANCHOR CLIP PAIR (FIXED CLIPS PER MANUFACTURER) AT MID-LENGTH OF EACH RAIL PIECE (${detailRef(detailTitles.railLayout)}).`;
  // Crane rail is high-carbon steel: heat from flame cutting hardens and cracks it.
  const fabrication='RAIL STEEL: DRILL HOLES AND SAW-CUT ENDS; NO FLAME CUTTING OR PUNCHING. DO NOT WELD TO THE RAIL.';
  const W=Math.max(560,jx+joint.w);
  let my=rowY+4;
  svg+=`<g data-note="rail-clips">${[clipNote,anchorNote,fabrication].map(v=>{const rows=wrap(v,W,8.5),t=rows.map((row,i)=>text(0,my+i*11,row,8.5)).join('');my+=rows.length*11+6;return t;}).join('')}</g>`;
  return {svg:svg+'</g>',scale:scale.label};
 }};
}

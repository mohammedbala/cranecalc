import type {CalculationSnapshot} from '../engine/types';
import {railSeat,anchorEndClearance} from '../engine/railSeat';
import {boltProperties} from '../engine/connectionStrength';
import {format} from '../engine/units';
import {drawingLength,plateInches} from './drawingFormat';
import {sheetDrawingScale as drawingScale,text,line,rect,circle,dimH,dimV,multiLeader,filletLeader,breakLine,detailRef,detailTitles,textWidth,labelCaps,n,type XY} from './sheetGraphics';
import {contentBounds,type DetailView} from './detailSheet';

const path=(pts:XY[],cls:string,close=true)=>`<path class="${cls}" d="${pts.map(([x,y],i)=>`${i?'L':'M'}${n(x)},${n(y)}`).join('')}${close?'Z':''}"/>`;
/** Diagonal hatching inside a rectangle, on the pattern layer. */
function hatchRect(x:number,y:number,w:number,h:number,step=4){
 let svg='';
 for(let c=step/2;c<w+h;c+=step){const a:XY=[x+Math.max(0,c-h),y+Math.min(h,c)],b:XY=[x+Math.min(w,c),y+Math.max(0,c-w)];if(Math.hypot(b[0]-a[0],b[1]-a[1])>.4)svg+=line(a,b,'hatch');}
 return svg;
}
/** AWS A2.4 arrow-side fillet symbol with the size left and the length right of the triangle. */
function fillet(points:XY[],at:XY,size:string,length:string,labels:string[],via:XY[][]=[]){
 return filletLeader(points,at,size,labels,false,via).replace(/<\/g>$/,'')+text(at[0]+53,at[1]+4,labelCaps(length.replaceAll('"','')),8)+'</g>';
}
/** Vertical dimension from an extension line at yExt to a surface it lands on; the text reads beside a short one. */
function dimToSurface(yExt:number,ySurface:number,fromX:number,x:number,label:string,side:'left'|'right'){
 const w=textWidth(label,9),fits=w+6<=Math.abs(ySurface-yExt),dir=x<fromX?-1:1;
 return line([fromX+dir*2,yExt],[x+dir*5,yExt])+line([x,yExt],[x,ySurface])+[yExt,ySurface].map(y=>line([x-3,y+2.5],[x+3,y-2.5])).join('')
  +(fits?text(x-6,(yExt+ySurface)/2,label,9,'middle',400,-90):text(side==='left'?x-5:x+5,(yExt+ySurface)/2+3,label,9,side==='left'?'end':'start'));
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
  if(dir==='h')svg+=fits?text((a+b)/2,pos-4,label,9,'middle'):first||i===labels.length-1?text(first?a-4:b+4,pos+3,label,9,first?'end':'start'):text((a+b)/2,pos+12,label,9,'middle');
  else svg+=fits?text(pos-5,(a+b)/2,label,9,'middle',400,-90):text(pos-5,(a+b)/2+3,label,9,'end');
 });
 return svg;
}
/** Translate drawn content so its top-left corner sits at (x, y); returns the placed content and its size. */
function place(svg:string,x:number,y:number){const b=contentBounds(svg);return {svg:`<g transform="translate(${n(x-b.x0)} ${n(y-b.y0)})">${svg}</g>`,w:b.x1-b.x0,h:b.y1-b.y0};}
const subTitle=(x:number,y:number,title:string,scale:string)=>text(x,y,title,7.5,'middle',700)+text(x,y+10,scale,7,'middle');
const labelWidth=(labels:string[])=>Math.max(0,...labels.map(v=>textWidth(labelCaps(v),8.5)));

/**
 * Rail keeper detail, in three columns: the section through a keeper pair with the rail, pad and girder
 * and its callouts, with the keeper K1 piece below it; the callouts for the plan; and the plan of a
 * typical keeper and an anchor keeper over the bolted rail joint. Keepers are welded on the outer face and
 * both ends after the rail is set, so the rail-side face and the clearance gap stay free of weld.
 */
export function railKeeperView(s:CalculationSnapshot):DetailView{
 return {title:detailTitles.railKeeper,render:()=>{
  const p=s.input,b=p.section,d=p.details!,r=d.rail,u=p.units,depth=p.aist!.railDepth,capped=b.kind==='cap';
  // SI sizes read to the half millimetre below 100 mm and to the millimetre above: no false precision from
  // converted inch sizes, and the part dimensions still add up.
  const si=(v:number)=>`${(v<100?Math.round(v*2)/2:Math.round(v)).toLocaleString('en-US')} mm`;
  const {pad,keeper:K,anchor:A}=railSeat(p),pt=pad?.thickness??0,size=(v:number)=>u==='SI'?si(v):plateInches(v,u),dim=(v:number)=>u==='SI'?si(v):drawingLength(v,u);
  const recW=capped?b.capWidth:b.bf,below=capped?b.capDepth-b.capTw+b.tf:b.tf,stub=16;

  // ---- 1. Section through a keeper pair: rail C/L at x = 0, top of rail at y = 0.
  const scale=drawingScale(Math.min(.75,150/recW,(120-stub)/(depth+pt+below)),u),k=scale.pointsPerMm,X=(mm:number)=>mm*k;
  const yBaseTop=X(depth-r.baseThickness),yBaseBot=X(depth),ySteel=X(depth+pt),yLip=yBaseTop-X(K.lip);
  let sec='<g data-view="rail-section">';
  sec+=rect(X(-r.headWidth/2),0,X(r.headWidth),X(r.headThickness),'rail-line')+rect(X(-r.webThickness/2),X(r.headThickness),X(r.webThickness),X(depth-r.headThickness-r.baseThickness),'rail-line')+rect(X(-r.baseWidth/2),yBaseTop,X(r.baseWidth),X(r.baseThickness),'rail-line');
  if(pad)sec+=rect(X(-pad.width/2),yBaseBot,X(pad.width),X(pt),'rail-line')+hatchRect(X(-pad.width/2),yBaseBot,X(pad.width),X(pt),2.5);
  const wTop=ySteel+(capped?X(b.capTw):0),wBot=wTop+X(b.tf);
  sec+=rect(X(-b.bf/2),wTop,X(b.bf),X(b.tf),'runway-line')+line([X(-b.tw/2),wBot],[X(-b.tw/2),wBot+stub],'runway-line')+line([X(b.tw/2),wBot],[X(b.tw/2),wBot+stub],'runway-line')+breakLine([X(-b.tw/2)-6,wBot+stub],[X(b.tw/2)+6,wBot+stub]);
  if(capped){sec+=rect(X(-b.capWidth/2),ySteel,X(b.capWidth),X(b.capTw),'runway-line');for(const sign of [-1,1])sec+=rect(sign<0?X(-b.capWidth/2):X(b.capWidth/2-b.capTf),ySteel+X(b.capTw),X(b.capTf),X(b.capDepth-b.capTw),'runway-line');}
  for(const sign of [-1,1]){
   sec+=path([[X(sign*K.outer),ySteel],[X(sign*K.outer),yLip],[X(sign*K.tip),yLip],[X(sign*K.tip),yBaseTop],[X(sign*K.inner),yBaseTop],[X(sign*K.inner),ySteel]],'runway-line');
   sec+=path([[X(sign*K.outer),ySteel],[X(sign*(K.outer+K.weld)),ySteel],[X(sign*K.outer),ySteel-X(K.weld)]],'runway-line');
  }
  // Top of rail to the top of the steel it bears on: the rail and the pad, as the T.O.R. elevations use it.
  const edge=X(recW/2),xd=edge+10;
  sec+=line([X(r.headWidth/2)+2,0],[xd+5,0])+line([edge+2,ySteel],[xd+5,ySteel])+line([xd,0],[xd,ySteel])+[0,ySteel].map(y=>line([xd-3,y+2.5],[xd+3,y-2.5])).join('')+text(xd-6,ySteel/2,size(depth+pt),9,'middle',400,-90)+text(xd+8,3,'T.O.R.',7.5)+text(xd+8,ySteel+3,'T.O.S.',7.5);
  // Callouts left of the section, in the order of their targets down the section.
  const productName=r.padSource.split(/[:;]/)[0].trim();
  const items:{at:XY;labels:string[];via?:XY[];weld?:boolean}[]=[
   {at:[X(-r.headWidth/2)+4,X(r.headThickness)*.5],labels:[`${size(depth)} RAIL: HEAD ${size(r.headWidth)} X ${size(r.headThickness)},`,`BASE ${size(r.baseWidth)} X ${size(r.baseThickness)}`]},
   ...(pad?[{at:[X(-r.baseWidth/2+r.headWidth/4),yBaseBot+X(pt)/2] as XY,via:[[X(-r.baseWidth/2+r.headWidth/4)-10,yBaseTop-12] as XY],labels:[`RAIL PAD ${size(pt)} X ${size(pad.width)}, CONT.:`,productName,`ALLOWABLE COMPRESSION ${format(r.padAllowable,'stress',u,u==='SI'?1:2)}`]}]:[]),
   {at:[X(-K.toe-K.clearance/2),yBaseTop+X(r.baseThickness)*.6],via:[[X(-K.outer)-4,yBaseTop+X(r.baseThickness)*.6]],labels:[`K1 ${size(K.clearance)} CLEAR OF RAIL-BASE TOE (${size(Math.max(K.clearance,Math.abs(p.railEccentricity)-d.criteria.alignmentTolerance))} MAX.),`,`LIP BEARS ${size(K.overlap)}; SHIM, WELD, REMOVE SHIM`]},
   {at:[X(-K.outer-K.weld*.4),ySteel-X(K.weld)*.4],labels:['OUTER FACE, EACH KEEPER'],weld:true},
   {at:[X(-recW/2)+3,capped?ySteel+X(b.capTw):wBot],labels:capped?[`${b.name} GIRDER`,p.capDesign?`CAP ATTACHMENT: SEE ${detailRef(detailTitles.capSection)}`:'CAP ATTACHMENT BY OTHERS']:[`${b.name} GIRDER, PARTIAL`]}
  ];
  const cw=Math.max(...items.map(v=>v.weld?110:labelWidth(v.labels))),cx=-edge-26-cw;
  let ly=-4;
  for(const v of items){
   // The weld symbol keeps its elbow beyond the widest callout so its leader clears the text above.
   if(v.weld){const x=cx+cw-labelWidth(v.labels);sec+=fillet([v.at],[Math.min(x,cx+cw-92),ly+3],size(K.weld),size(K.length),v.labels);ly+=17+v.labels.length*11+8;}
   else{sec+=multiLeader([v.at],[cx,ly],v.labels,8.5,v.via?[v.via]:[],cw);ly+=v.labels.length*11+8;}
  }
  sec+='</g>';
  const section=place(sec,0,0);

  // ---- 2. Keeper K1 alone, fully dimensioned: rail side at the left.
  const ps=drawingScale(Math.min(1.5,125/(K.projection+K.bodyWidth),62/K.height),u),pk=ps.pointsPerMm,P=(mm:number)=>mm*pk;
  const pTip=0,pIn=P(K.projection),pOut=pIn+P(K.bodyWidth),pLip=P(K.lip),pBot=P(K.height);
  let pc='<g data-view="keeper-piece">';
  pc+=path([[pOut,pBot],[pOut,0],[pTip,0],[pTip,pLip],[pIn,pLip],[pIn,pBot]],'runway-line');
  pc+=dimH(pTip,pOut,0,-10,size(K.projection+K.bodyWidth));
  // Bottom: lip projection past the body and the body width, from the lip tip and the body corners.
  pc+=dimChain('h',[pTip,pIn,pOut],[pLip,pBot,pBot],pBot+12,[size(K.projection),size(K.bodyWidth)]);
  // Left: lip thickness and body height under the lip, from the lip corners and the body foot.
  pc+=dimChain('v',[0,pLip,pBot],[pTip,pTip,pIn],pTip-10,[size(K.lip),size(K.bodyHeight)]);
  pc+=dimV(0,pBot,pOut,pOut+16,size(K.height));
  pc+='</g>';
  const piece=place(pc,0,0);
  const pieceSvg=piece.svg+subTitle(piece.w/2,piece.h+12,'KEEPER K1 / SECTION',ps.label)+text(piece.w/2,piece.h+31,`${size(K.length)} LONG ALONG THE RAIL`,7.2,'middle');

  // ---- 3. Plan at the right-hand rail-base toe: a typical keeper and the anchor keeper in its notch.
  const ls=drawingScale(Math.min(.75,74/K.length,92/(r.baseWidth/2-r.headWidth/2+K.clearance+K.bodyWidth+K.weld)),u),lk=ls.pointsPerMm,L=(mm:number)=>mm*lk;
  const yHead=-L(r.baseWidth/2-r.headWidth/2),yTip=-L(K.overlap),yIn=L(K.clearance),yOut=L(K.clearance+K.bodyWidth),w=L(K.weld),len=L(K.length);
  const xa=0,brk=len+22,xb=brk+22,xEnd=xb+len+L(anchorEndClearance)+14,notch=L(A.notch),nc=L(anchorEndClearance);
  let pv='<g data-view="keeper-plan">';
  pv+=line([xa-14,yHead],[brk-3,yHead],'rail-line')+line([brk+3,yHead],[xEnd,yHead],'rail-line');
  pv+=line([xa-14,0],[xa,0],'rail-line')+line([xa,0],[xa+len,0],'hidden-line')+line([xa+len,0],[brk-3,0],'rail-line');
  pv+=path([[brk+3,0],[xb-nc,0],[xb-nc,-notch],[xb+len+nc,-notch],[xb+len+nc,0],[xEnd,0]],'rail-line',false)+line([xb-nc,-notch],[xb+len+nc,-notch],'hidden-line');
  pv+=breakLine([brk,yHead-6],[brk,yOut+w+6]);
  const keeperPlan=(x0:number,shift:number,endWeld:number)=>{
   const t=yTip-shift,i=yIn-shift,o=yOut-shift,x1=x0+len,e0=o-L(endWeld);
   return rect(x0,t,len,o-t,'runway-line')+line([x0,i],[x1,i],'hidden-line')+rect(x0,o,len,w,'annotation')+hatchRect(x0,o,len,w,2)
    +[[x0-w,x0],[x1,x1+w]].map(([a,c])=>rect(a,e0,c-a,o-e0,'annotation')+hatchRect(a,e0,c-a,o-e0,2)).join('');
  };
  pv+=keeperPlan(xa,0,K.endWeld)+keeperPlan(xb,notch,A.endWeld);
  pv+=dimH(xa,xa+len,yOut+w,yOut+w+14,size(K.length));
  pv+=dimH(xa,xb,yOut+w+2,yOut+w+30,`${dim(p.aist!.clipSpacing)} MAX.`);
  pv+='</g>';
  const plan=place(pv,0,0),pb=contentBounds(pv),PX=(x:number)=>x-pb.x0,PY=(y:number)=>y-pb.y0;

  // ---- 4. Bolted rail joint, elevation; edge distances and pitch on the left half, symmetric about the joint.
  const hole=boltProperties('A325',r.jointBoltDiameter).hole,bar=2*(2*r.jointEdge+r.jointPitch)+r.jointGap;
  const js=drawingScale(Math.min(.36,150/bar,60/depth),u),jk=js.pointsPerMm,J=(mm:number)=>mm*jk;
  const jc=J(bar/2)+12,jb=J(depth),jl=jc-J(bar/2),web=J(r.headThickness+(depth-r.headThickness-r.baseThickness-r.jointPlateHeight)/2);
  let jv='<g data-view="rail-joint">';
  for(const side of [-1,1]){const end=jc+side*J(r.jointGap)/2,far=jc+side*(J(bar/2)+12);
   jv+=line([end,0],[end,jb],'rail-line')+[0,J(r.headThickness),jb-J(r.baseThickness),jb].map(y=>line([end,y],[far,y],'rail-line')).join('');}
  jv+=rect(jl,web,J(bar),J(r.jointPlateHeight),'runway-line');
  const bolts=[r.jointEdge,r.jointEdge+r.jointPitch,bar-r.jointEdge-r.jointPitch,bar-r.jointEdge].map(v=>jl+J(v)),by=web+J(r.jointPlateHeight)/2;
  for(const x of bolts)jv+=rect(x-J(.75*r.jointBoltDiameter),by-J(hole)/2,J(1.5*r.jointBoltDiameter),J(hole),'reference-line')+circle(x,by,J(r.jointBoltDiameter)/2,'runway-line');
  const yd=jb+12,railEnd=jc-J(r.jointGap)/2,pitchFits=textWidth(size(r.jointPitch),9)+6<=J(r.jointPitch);
  jv+=dimChain('h',[jl,bolts[0],bolts[1],railEnd],[jb,jb,jb,jb],yd,[size(r.jointEdge),size(r.jointPitch),size(r.jointEdge)]);
  jv+=dimH(jl,jl+J(bar),jb+2,yd+(pitchFits?16:26),dim(bar));
  jv+='</g>';
  const joint=place(jv,0,0);
  const jointNotes=[`2 BARS ${size(r.jointPlateThickness)} X ${size(r.jointPlateHeight)} X ${dim(bar)}; 4 - ${size(r.jointBoltDiameter)} A325 SNUG-TIGHT`,`IN SLOTS ${size(1.5*r.jointBoltDiameter)} X ${size(hole)} ALONG RAIL; GAP ${size(r.jointGap)}. SYMMETRIC`];

  // ---- Compose. Top: the section and its callouts, the rail joint at the right. Bottom: K1, the plan
  // callouts and the plan, the callouts landing on their targets in the plan at their right.
  const rowY=Math.max(section.h,joint.h+52)+18,mx=piece.w+30;
  let svg='<g data-view="rail-connection">'+section.svg;
  const jx=Math.max(section.w+30,0);
  svg+=`<g transform="translate(${n(jx)} 8)">${joint.svg}${subTitle(joint.w/2,joint.h+12,'RAIL JOINT / ELEVATION',js.label)}${jointNotes.map((v,i)=>text(joint.w/2,joint.h+31+i*9,v,7.2,'middle')).join('')}</g>`;
  svg+=`<g transform="translate(0 ${n(rowY+8)})">${pieceSvg}</g>`;
  const calloutW=Math.max(110,labelWidth([`RAIL ANCHOR AT MID-LENGTH OF EACH RAIL PIECE`,`END FILLETS ${size(A.endWeld)}. HOLDS TRACTION, BRAKING, CREEP`])),planX=mx+calloutW+30,planY=rowY;
  svg+=`<g transform="translate(${n(planX)} ${n(planY)})">${plan.svg}${subTitle(plan.w/2,plan.h+12,'KEEPERS AND RAIL ANCHOR / PLAN',ls.label)}</g>`;
  const T=(x:number,y:number):XY=>[planX+PX(x),planY+PY(y)];
  let my=rowY+4;
  // The anchor note reaches the notch from above the rail head; the end-weld symbol the near end of a typical keeper.
  svg+=multiLeader([T(xb+len/2,-notch/2)],[mx,my],[`RAIL ANCHOR AT MID-LENGTH OF EACH RAIL PIECE`,`(${detailRef(detailTitles.railLayout)}): K1 IN NOTCHES ${size(A.notch)} X ${size(A.notchLength)} IN`,`BOTH RAIL-BASE TOES${pad?' AND THE PAD':''}; K1 WELDS,`,`END FILLETS ${size(A.endWeld)}. HOLDS TRACTION, BRAKING, CREEP`],8.5,[[T(brk,yHead-10)]],calloutW);
  my+=44+12;
  svg+=fillet([T(xa-w/2,yOut-L(K.endWeld)/2)],[mx,my+3],size(K.weld),size(K.endWeld),['BOTH ENDS OF EACH KEEPER, STOPPED',`${size(K.holdback)} SHORT OF THE RAIL-SIDE FACE`]);
  return {svg:svg+'</g>',scale:scale.label};
 }};
}

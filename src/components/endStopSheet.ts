import type {CalculationSnapshot} from '../engine/types';
import {format} from '../engine/units';
import {endStopGeometry,stopBumperForce,activeEndStop} from '../engine/endStop';
import {craneCombinations} from '../engine/aistLoads';
import {boltProperties} from '../engine/connectionStrength';
import {drawingLength,plateInches} from './drawingFormat';
import {sheetDrawingScale as drawingScale,sheetStart,titleBlock,text,line,rect,circle,dimH,dimV,viewTitle,multiLeader,filletLeader,detailRef,n,type XY} from './sheetGraphics';
import {heading,numbered,table,noteStack,type Style} from './noteBlocks';

const inch=25.4;
/** Zig-zag break line between two points. */
function breakLine(a:XY,b:XY){
 const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2,dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L,px=-uy*4,py=ux*4;
 return `<polyline class="annotation" points="${[a,[mx-ux*3,my-uy*3],[mx-ux*1+px,my-uy*1+py],[mx+ux*1-px,my+uy*1-py],[mx+ux*3,my+uy*3],b].map(p=>`${n(p[0])},${n(p[1])}`).join(' ')}"/>`;
}

/**
 * Leaders to a column of labels, ordered by target height so no two leaders
 * cross; labels are spaced by their line count within [top, bottom].
 */
function labelColumn(items:{at:XY;labels:string[];weld?:string}[],x:number,top:number,bottom:number){
 const sorted=[...items].sort((a,b)=>a.at[1]-b.at[1]),height=(v:typeof items[number])=>(v.weld?17:0)+v.labels.length*11;
 const total=sorted.reduce((a,v)=>a+height(v),0),gap=Math.max(8,(bottom-top-total)/Math.max(1,sorted.length-1));
 let y=top,svg='';
 for(const v of sorted){svg+=v.weld?filletLeader([v.at],[x,y+3],v.weld,v.labels,true):multiLeader([v.at],[x,y],v.labels);y+=height(v)+gap;}
 return svg;
}

/** S-07: bolted runway end stop, elevation, plan and section looking at the face, with design data. */
export function endStopSheetSvg(s:CalculationSnapshot){
 const p=s.input,d=p.details!,e=activeEndStop(p)!,b=p.section,g=endStopGeometry(p,e),r=d.rail,u=p.units;
 const dim=(v:number)=>drawingLength(v,u),size=(v:number)=>plateInches(v,u),force=(v:number)=>{const t=format(v,'force',u,3);return u==='US'?t.toUpperCase():t;};
 const tb=e.base.thickness,tp=e.face.thickness,H=e.face.height,ts=e.stiffener.thickness,Ls=e.stiffener.length,sp=e.stiffener.spacing,Wb=e.base.width,gauge=e.bolts.gauge,db=e.bolts.diameter;
 const capped=b.kind==='cap',capT=capped?b.capTw:0,railDepth=p.aist?.railDepth??p.railHeight,stiffTop=Math.max(H-inch,.5*H);
 const shown=Math.max(g.railEnd+8*inch,d.bearing.length+4*inch),depthShown=capT+b.tf+6*inch;
 const boltLabel=`4 - ${size(db)} ${e.bolts.grade} PRETENSIONED (SC)`,hole=boltProperties(e.bolts.grade,db).hole;
 let svg=sheetStart(s,'S-07','CRANE RUNWAY / RUNWAY END STOPS');
 svg+=line([612,76],[612,680],'divider')+line([24,379],[1200,379],'divider');

 // 1: Elevation along the runway at the runway end.
 {
  const k=drawingScale(Math.min(.36,300/shown,250/(depthShown+tb+H+2*inch)),u),kk=k.pointsPerMm,X=(x:number)=>120+x*kk,ys=112+(tb+H)*kk,Y=(z:number)=>ys-z*kk;
  const wTop=ys+capT*kk,wFl=wTop+b.tf*kk,cut=ys+depthShown*kk,right=X(shown);
  svg+='<g data-view="end-stop-elevation">';
  // Girder top region, broken below the top flange.
  svg+=line([X(0),ys],[right,ys],'runway-line')+line([X(0),wFl],[right,wFl],'runway-line')+line([X(0),ys],[X(0),cut],'runway-line');
  if(capped)svg+=line([X(0),wTop],[right,wTop],'runway-line')+line([X(0),wTop+(b.capDepth-b.capTw)*kk],[right,wTop+(b.capDepth-b.capTw)*kk],'runway-line');
  svg+=breakLine([X(0)-6,cut],[right+6,cut])+breakLine([right,ys-4],[right,cut]);
  // End bearing stiffener (near side) under the top flange.
  const xs=d.bearing.length/2;svg+=rect(X(xs-d.bearing.stiffenerThickness/2),wFl,d.bearing.stiffenerThickness*kk,cut-wFl,'runway-line');
  // Stop: base plate, face plate and stiffener profile.
  const yb=Y(tb);
  svg+=rect(X(g.back),yb,e.base.length*kk,tb*kk,'runway-line')+rect(X(g.faceBack),Y(tb+H),tp*kk,H*kk,'runway-line');
  svg+=`<path class="runway-line" d="M${n(X(g.faceBack))},${n(yb)}L${n(X(g.faceBack))},${n(Y(tb+stiffTop))}L${n(X(g.stiffenerEnd))},${n(Y(tb+inch))}L${n(X(g.stiffenerEnd))},${n(yb)}"/>`;
  // Bolts with heads on the base plate and nuts below the flange.
  for(const x of [g.backRow,g.frontRow]){
   svg+=line([X(x),Y(tb)-.65*db*kk-3],[X(x),wFl+.9*db*kk+3],'grid-line');
   svg+=rect(X(x)-.8*db*kk,Y(tb)-.65*db*kk,1.6*db*kk,.65*db*kk,'runway-line')+rect(X(x)-.8*db*kk,wFl,1.6*db*kk,.9*db*kk,'runway-line');
  }
  // Rail from its end, with the first keeper pair.
  const railTop=Y(railDepth);
  svg+=line([X(g.railEnd),ys],[X(g.railEnd),railTop],'rail-line');
  for(const z of [0,r.baseThickness,railDepth-r.headThickness,railDepth])svg+=line([X(g.railEnd),Y(z)],[right,Y(z)],'rail-line');
  const keeper=g.railEnd+r.clipWidth/2+12.7;svg+=rect(X(keeper-r.clipWidth/2),Y(r.baseThickness+r.clipThickness),r.clipWidth*kk,(r.baseThickness+r.clipThickness)*kk,'runway-line');
  // Crane bumper, by the crane supplier.
  const br=e.bumperDiameter/2,bc:XY=[X(g.faceFront)+br*kk,Y(tb+g.contact)];
  svg+=circle(bc[0],bc[1],br*kk,'reference-line')+line([bc[0]+br*kk,bc[1]],[bc[0]+br*kk+28,bc[1]],'reference-line');
  svg+=line([X(g.faceFront)-4,bc[1]],[bc[0]+br*kk+34,bc[1]],'grid-line');
  // Baseline dimensions from the girder end, stacked above the stop so every label fits.
  const top=Y(tb+H);
  // Longest dimension lowest; each label sits past the end of its own dimension line.
  [[g.front,'BASE PL'],[g.faceFront,'STOP FACE'],[g.frontRow,'FRONT BOLTS'],[g.backRow,'BACK BOLTS']].forEach(([x,label],i)=>{const yd=top-10-12*i;svg+=dimH(X(0),X(x as number),top,yd,'')+text(X(x as number)+4,yd+3,`${dim(x as number)} ${label}`,7.5);});
  svg+=dimV(Y(tb+H),Y(tb),X(g.back),X(0)-22,dim(H));
  svg+=dimV(bc[1],railTop,bc[0]+br*kk+28,bc[0]+br*kk+34,dim(e.bumperHeight));
  svg+=dimH(X(0),X(xs),cut,cut+24,`${dim(xs)} TO BEARING STIFFENER C/L`);
  const lx=Math.max(X(shown)+48,bc[0]+br*kk+70);
  svg+=labelColumn([
   {at:[X(g.faceFront),Y(tb+H*.85)],labels:[`PL ${size(tp)} X ${size(Wb)} X ${dim(H)} FACE`,'STRUCK BY CRANE BUMPER']},
   {at:[bc[0]+br*kk*.7,bc[1]-br*kk*.7],labels:['CRANE BUMPER (REF.), BY CRANE SUPPLIER',`C/L ${dim(e.bumperHeight)} ABOVE T.O.R.`]},
   {at:[X(g.faceBack-Ls*.35),Y(tb+inch+(stiffTop-inch)*.65)],labels:[`2 PL ${size(ts)} STIFFENERS AT ${dim(sp)} CTRS`,`${dim(Ls)} AT BASE, ${dim(stiffTop)} HIGH AT FACE`]},
   {at:[X(g.railEnd),Y(railDepth*.6)],labels:[`RAIL ENDS ${dim(e.railGap)} CLEAR OF FACE`,'FIRST KEEPER PAIR PER S-02']},
   {at:[X(g.faceFront)+1,yb],labels:['FACE PL AND STIFFENERS TO','BASE PL, BOTH SIDES'],weld:size(e.weldSize)},
   {at:[X(g.front),yb+tb*kk/2],labels:[`PL ${size(tb)} X ${size(Wb)} X ${dim(e.base.length)} BASE`]},
   {at:[X(g.frontRow)+.8*db*kk,wFl+.45*db*kk],labels:[boltLabel,`${size(hole)} STD HOLES THRU ${capped?'CAP AND ':''}FLANGE`,'NUTS BELOW TOP FLANGE']},
   {at:[X(xs+d.bearing.stiffenerThickness/2),cut-8],labels:['END BEARING STIFFENERS',`SEE ${detailRef('GIRDER BEARING / COLUMN BRACKET')}`]}
  ],lx,58,338);
  svg+=text(X(0)-6,ys-3,'GIRDER END',7.5,'end',700);
  svg+=viewTitle(318,360,'END STOP / ELEVATION',k.label)+'</g>';
 }
 // 2: Plan on the girder top.
 {
  const width=g.surfaceWidth,k=drawingScale(Math.min(.36,330/shown,190/width),u),kk=k.pointsPerMm,X=(x:number)=>710+x*kk,Z=(z:number)=>212+z*kk,right=X(shown);
  svg+='<g data-view="end-stop-plan">';
  svg+=line([X(0),Z(-width/2)],[right,Z(-width/2)],'runway-line')+line([X(0),Z(width/2)],[right,Z(width/2)],'runway-line')+line([X(0),Z(-width/2)],[X(0),Z(width/2)],'runway-line');
  svg+=breakLine([right,Z(-width/2)-4],[right,Z(width/2)+4]);
  if(capped)for(const z of [-b.bf/2,b.bf/2])svg+=line([X(0),Z(z)],[right,Z(z)],'hidden-line');
  svg+=line([X(0)-14,Z(0)],[right+10,Z(0)],'grid-line')+text(right+14,Z(0)+3,'GIRDER C/L',7.5);
  const rz=p.railEccentricity;
  svg+=line([X(g.railEnd)-6,Z(rz)],[right+10,Z(rz)],'grid-line')+text(right+14,Z(rz)+11,'RAIL C/L',7.5);
  svg+=rect(X(g.railEnd),Z(rz-r.baseWidth/2),(shown-g.railEnd)*kk,r.baseWidth*kk,'rail-line')+rect(X(g.railEnd),Z(rz-r.headWidth/2),(shown-g.railEnd)*kk,r.headWidth*kk,'rail-line');
  const keeper=g.railEnd+12.7;for(const side of [-1,1]){const z0=rz+side*r.baseWidth/2;svg+=rect(X(keeper),side<0?Z(z0-r.clipProjection-r.clipThickness):Z(z0),r.clipWidth*kk,(r.clipProjection+r.clipThickness)*kk,'runway-line');}
  svg+=rect(X(g.back),Z(-Wb/2),e.base.length*kk,Wb*kk,'runway-line')+rect(X(g.faceBack),Z(-Wb/2),tp*kk,Wb*kk,'runway-line');
  for(const side of [-1,1])svg+=rect(X(g.stiffenerEnd),Z(side*sp/2-ts/2),Ls*kk,ts*kk,'runway-line');
  for(const x of [g.backRow,g.frontRow])for(const side of [-1,1]){const c:XY=[X(x),Z(side*gauge/2)],rr=db/2*kk;svg+=circle(c[0],c[1],rr,'runway-line')+line([c[0]-rr-2,c[1]],[c[0]+rr+2,c[1]])+line([c[0],c[1]-rr-2],[c[0],c[1]+rr+2]);}
  svg+=dimV(Z(-gauge/2),Z(gauge/2),X(g.backRow),X(0)-22,dim(gauge))+dimV(Z(-Wb/2),Z(Wb/2),X(g.back),X(0)-40,dim(Wb));
  svg+=dimH(X(0),X(g.back),Z(width/2),Z(width/2)+16,dim(e.setback))+dimH(X(g.back),X(g.front),Z(width/2),Z(width/2)+30,dim(e.base.length));
  svg+=dimH(X(g.faceFront),X(g.railEnd),Z(width/2),Z(width/2)+16,dim(e.railGap));
  svg+=multiLeader([[X(keeper)+r.clipWidth*kk,Z(rz-r.baseWidth/2-r.clipProjection)]],[X(shown)+44,Z(-width/2)-14],['FIRST KEEPER PAIR','SPACING PER S-02']);
  svg+=multiLeader([[X(g.frontRow),Z(-gauge/2)-db/2*kk]],[X(shown)+44,Z(-width/2)+18],[boltLabel],8.5,[[[X(g.frontRow)+24,Z(-width/2)-6]]]);
  svg+=text(X(0)-4,Z(width/2)+46,'GIRDER END',8,'start',700);
  svg+=viewTitle(906,360,'END STOP / PLAN',k.label)+'</g>';
 }
 // 3: Section between the rail end and the stop, looking at the face.
 {
  const cutDepth=capT+b.tf+3*inch,k=drawingScale(Math.min(.36,260/Math.max(Wb,g.surfaceWidth),215/(H+tb+cutDepth+2*inch)),u),kk=k.pointsPerMm,cx=250,ys=412+(tb+H)*kk,X=(z:number)=>cx+z*kk,Y=(h:number)=>ys-h*kk;
  const wTop=ys+capT*kk,wFl=wTop+b.tf*kk,cut=ys+cutDepth*kk,yb=Y(tb);
  svg+='<g data-view="end-stop-section">';
  if(capped){svg+=rect(X(-b.capWidth/2),ys,b.capWidth*kk,capT*kk,'runway-line');for(const side of [-1,1])svg+=rect(side<0?X(-b.capWidth/2):X(b.capWidth/2)-b.capTf*kk,wTop,b.capTf*kk,(b.capDepth-b.capTw)*kk,'runway-line');}
  svg+=rect(X(-b.bf/2),wTop,b.bf*kk,b.tf*kk,'runway-line')+line([X(-b.tw/2),wFl],[X(-b.tw/2),cut],'runway-line')+line([X(b.tw/2),wFl],[X(b.tw/2),cut],'runway-line');
  svg+=breakLine([X(-b.tw/2)-10,cut],[X(b.tw/2)+10,cut]);
  svg+=rect(X(-Wb/2),yb,Wb*kk,tb*kk,'runway-line')+rect(X(-Wb/2),Y(tb+H),Wb*kk,H*kk,'runway-line');
  for(const side of [-1,1])svg+=rect(X(side*sp/2-ts/2),Y(tb+stiffTop),ts*kk,stiffTop*kk,'hidden-line');
  for(const side of [-1,1]){const x=X(side*gauge/2);svg+=rect(x-.8*db*kk,yb-.65*db*kk,1.6*db*kk,.65*db*kk,'hidden-line')+rect(x-.8*db*kk,wFl,1.6*db*kk,.9*db*kk,'runway-line')+line([x,yb-.65*db*kk-3],[x,wFl+.9*db*kk+3],'grid-line');}
  const tor=Y(railDepth),bc:XY=[X(p.railEccentricity),Y(tb+g.contact)];
  svg+=line([X(-Wb/2)-6,tor],[X(Wb/2)+30,tor],'grid-line')+text(X(Wb/2)+32,tor+3,'T.O.R.',7.5);
  svg+=circle(bc[0],bc[1],e.bumperDiameter/2*kk,'reference-line');
  svg+=dimH(X(-Wb/2),X(Wb/2),Y(tb+H),Y(tb+H)-14,dim(Wb))+dimH(X(-gauge/2),X(gauge/2),wFl+.9*db*kk,cut+16,dim(gauge));
  svg+=dimV(Y(tb+H),yb,X(-Wb/2),X(-Wb/2)-52,dim(H))+dimV(bc[1],yb,X(-Wb/2),X(-Wb/2)-30,dim(g.contact));
  const lx=Math.min(X(Math.max(Wb,g.surfaceWidth)/2)+60,420);
  svg+=labelColumn([
   {at:[bc[0]+e.bumperDiameter/2*kk*.7,bc[1]-e.bumperDiameter/2*kk*.7],labels:['CRANE BUMPER (REF.)',`${size(e.bumperDiameter)} CONTACT, ON RAIL C/L`,`C/L ${dim(g.contact)} ABOVE BASE PL`]},
   {at:[X(sp/2+ts/2),Y(tb+stiffTop*.5)],labels:['STIFFENERS BEYOND (HIDDEN)']},
   {at:[X(gauge/2)+.8*db*kk,wFl+.45*db*kk],labels:[boltLabel,'NUTS BELOW TOP FLANGE','CLEAR OF WEB FILLET']},
   {at:[X(b.tw/2),cut-6],labels:[`${b.name} RUNWAY GIRDER`]}
  ],lx,410,620);
  svg+=viewTitle(318,656,'END STOP / SECTION AT FACE',k.label)+'</g>';
 }
 // 4: Design data and notes.
 {
  const P=Math.max(...craneCombinations(p.method).map(c=>c.bumper))*stopBumperForce(p),check=(id:string)=>s.checks.find(c=>c.id===id);
  const stops=s.checks.filter(c=>c.group==='End stops'&&c.utilization!==undefined&&(c.quantity!=='length'||c.id.endsWith('prying'))),worst=[...stops].sort((a,b)=>(b.utilization??0)-(a.utilization??0))[0];
  const T=check('end-stop-bolt-tension')?.demand,V=check('end-stop-bolt-shear')?.demand;
  const rows=[
   ['BUMPER FORCE, PER CRANE SUPPLIER',force(stopBumperForce(p))],
   [`FACTORED (${p.method}, AIST STOP COMBINATIONS)`,force(P)],
   ['BUMPER C/L ABOVE T.O.R. / CONTACT DIAMETER',`${dim(e.bumperHeight)} / ${size(e.bumperDiameter)}`],
   ['FRONT BOLT TENSION / BOLT SHEAR',T!==undefined&&V!==undefined?`${force(T)} / ${force(V)}`:'-'],
   ['GOVERNING STOP CHECK',worst?`${worst.title.toUpperCase()}: ${(worst.utilization??0).toFixed(2)}`:'-'],
   ['QUANTITY','4: BOTH ENDS OF BOTH RUNWAYS'],
   ['DATA SOURCE',e.source||'NOT ENTERED']
  ];
  const notes=[
   'PROVIDE ONE STOP AT EACH END OF EACH RUNWAY, CENTERED ON THE GIRDER. THE STOP AT THE OPPOSITE END IS THE MIRROR IMAGE.',
   `DRILL ${size(hole)} STANDARD HOLES THROUGH ${capped?'THE CAP CHANNEL WEB AND ':''}THE TOP FLANGE ONLY WITHIN THE END BEARING LENGTH (${dim(d.bearing.length)} FROM THE GIRDER END). NO OTHER HOLES IN THE TOP FLANGE.`,
   `BOLTS: ASTM F3125 GRADE ${e.bolts.grade}, PRETENSIONED, CLASS B FAYING SURFACES (SLIP-CRITICAL). HARDENED WASHERS UNDER TURNED ELEMENTS. VERIFY NUT CLEARANCE BELOW THE FLANGE AT THE BEARING STIFFENERS BEFORE DRILLING.`,
   'SHOP WELD THE FACE PLATE AND STIFFENERS TO THE BASE PLATE WITH CONTINUOUS FILLETS BOTH SIDES. GRIND THE FACE SMOOTH AT THE BUMPER CONTACT.',
   `TERMINATE THE RAIL ${dim(e.railGap)} CLEAR OF THE STOP FACE. THE FIRST KEEPER PAIR IS AT THE RAIL END; KEEPER SPACING PER S-02.`,
   'CONFIRM THE BUMPER FORCE, BUMPER HEIGHT AND CONTACT DIAMETER WITH THE CRANE SUPPLIER BEFORE FABRICATION. STOPS SHALL BE INSTALLED BEFORE THE CRANE IS OPERATED.',
   'THE GIRDER AXIAL FORCE AND THE LOCATING END CONNECTION INCLUDE THE BUMPER FORCE; THE END COUPLE IS INCLUDED IN THE GIRDER STOP COMBINATIONS (CALCULATION 05A).'
  ];
  svg+='<g data-view="end-stop-notes">'+noteStack([(t:Style)=>[heading(t,'END STOP DESIGN DATA'),table(t,['ITEM','VALUE'],rows,[1.6,1.4]),heading(t,'END STOP NOTES'),...numbered(t,notes)]],u,{x:635,y:396,width:546,height:262})+'</g>';
 }
 return svg+titleBlock(s,'S-07','RUNWAY END STOPS')+'</svg>';
}

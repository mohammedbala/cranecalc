import type {CalculationSnapshot} from '../engine/types';
import {format} from '../engine/units';
import {existingColumnSection} from '../engine/existingColumn';
import {anchorHardware,columnBaseElevation} from '../engine/columnBaseInputs';
import {bracingDesign,girderOffset} from '../engine/newColumnBracing';
import {seatColumnWeld} from '../engine/bracketDesign';
import {runwayElevations} from '../engine/drawingData';
import {drawingLength,plateInches} from './drawingFormat';
import {sheetDrawingScale as drawingScale,text,line,rect,circle,dimH,dimV,multiLeader,detailRef,detailTitles,labelColumn,n,breakLine,bubble,textWidth,sectionCut,type XY} from './sheetGraphics';
import {heading,numbered,table,type Style} from './noteBlocks';
import type {DetailTopic,DetailView} from './detailSheet';

const inch=25.4;
type Pt=[number,number];
const path=(points:XY[],cls='runway-line',closed=true)=>`<path class="${cls}" d="M${points.map(p=>`${n(p[0])},${n(p[1])}`).join('L')}${closed?'Z':''}"/>`;
/** Polygon edges, split where they pass behind a part spanning |x| < limit (drawn hidden there). */
function behind(points:XY[],limit:[number,number],cls='runway-line'){
 let svg='';
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],cuts=[0,1];
  for(const x of limit){const t=(x-a[0])/(b[0]-a[0]);if(Number.isFinite(t)&&t>0&&t<1)cuts.push(t);}
  cuts.sort((p,q)=>p-q);
  for(let j=1;j<cuts.length;j++){const at=(t:number):XY=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],p=at(cuts[j-1]),q=at(cuts[j]),mid=(p[0]+q[0])/2;
   svg+=line(p,q,mid>Math.min(...limit)+.01&&mid<Math.max(...limit)-.01?'hidden-line':cls);}
 }
 return svg;
}
/** A segment drawn hidden where it passes behind a convex outline (sheet coordinates), visible elsewhere. */
function behindPlate(a:XY,b:XY,outline:XY[],cls='runway-line'){
 // Cyrus-Beck against each edge; the outline's winding sets the inward side.
 let t0=0,t1=1;const area=outline.reduce((s,q,i)=>{const r=outline[(i+1)%outline.length];return s+q[0]*r[1]-r[0]*q[1];},0),sign=area>0?1:-1,d:XY=[b[0]-a[0],b[1]-a[1]];
 for(let i=0;i<outline.length;i++){
  const q=outline[i],r=outline[(i+1)%outline.length],nx=-(r[1]-q[1])*sign,ny=(r[0]-q[0])*sign,num=nx*(a[0]-q[0])+ny*(a[1]-q[1]),den=nx*d[0]+ny*d[1];
  if(Math.abs(den)<1e-12){if(num<0){t0=1;t1=0;}continue;}
  const t=-num/den;if(den>0)t0=Math.max(t0,t);else t1=Math.min(t1,t);
 }
 const at=(t:number):XY=>[a[0]+d[0]*t,a[1]+d[1]*t];
 if(t1-t0<=1e-6)return line(a,b,cls);
 return (t0>1e-6?line(a,at(t0),cls):'')+line(at(t0),at(t1),'hidden-line')+(t1<1-1e-6?line(at(t1),b,cls):'');
}
/** Work point: circle with a cross. */
const workPoint=(x:number,y:number)=>`<g data-work-point="true">${circle(x,y,3.2,'annotation')}${line([x-5,y],[x+5,y])}${line([x,y-5],[x,y+5])}</g>`;
/**
 * Clevis on a rod in elevation along unit vector u (sheet axes): jaws around the pin, a body tapering to the rod,
 * the pin as a circle. Proportions are representative; the clevis is a rated forged part.
 */
function clevis(at:XY,u:XY,dp:number,rod:number,k:number){
 const v:XY=[-u[1],u[0]],p=(s:number,w:number):XY=>[at[0]+(u[0]*s+v[0]*w)*k,at[1]+(u[1]*s+v[1]*w)*k];
 const jaw=.8*dp,body=.55*dp;
 return path([p(-.9*dp,jaw),p(1.1*dp,jaw),p(2.2*dp,body),p(2.6*dp,rod/2),p(2.6*dp,-rod/2),p(2.2*dp,-body),p(1.1*dp,-jaw),p(-.9*dp,-jaw)])+circle(at[0],at[1],dp/2*k,'runway-line');
}
/** Turnbuckle along the rod centered at `at`: an open body with its end nuts. */
function turnbuckle(at:XY,u:XY,rod:number,k:number){
 const v:XY=[-u[1],u[0]],p=(s:number,w:number):XY=>[at[0]+(u[0]*s+v[0]*w)*k,at[1]+(u[1]*s+v[1]*w)*k],L=6*rod,w=rod;
 return `<g data-turnbuckle="true">${path([p(-L/2,w),p(L/2,w),p(L/2,-w),p(-L/2,-w)])}${line(p(-L/2+rod,w),p(L/2-rod,w))}${line(p(-L/2+rod,-w),p(L/2-rod,-w))}${path([p(-L/2+1.2*rod,.45*w),p(L/2-1.2*rod,.45*w),p(L/2-1.2*rod,-.45*w),p(-L/2+1.2*rod,-.45*w)],'annotation')}</g>`;
}
/** Rod between two points (sheet), as two lines `rod` apart, optionally leaving gaps for parts along it. */
function rodLine(a:XY,b:XY,rod:number,k:number,gaps:[number,number][]=[]){
 const L=Math.hypot(b[0]-a[0],b[1]-a[1]),u:XY=[(b[0]-a[0])/L,(b[1]-a[1])/L],v:XY=[-u[1],u[0]],h=rod/2*k;
 const spans:[number,number][]=[];let from=0;for(const [g0,g1] of [...gaps].sort((x,y)=>x[0]-y[0])){if(g0>from)spans.push([from,g0]);from=Math.max(from,g1);}if(from<L)spans.push([from,L]);
 return spans.map(([s0,s1])=>[-h,h].map(w=>line([a[0]+u[0]*s0+v[0]*w,a[1]+u[1]*s0+v[1]*w],[a[0]+u[0]*s1+v[0]*w,a[1]+u[1]*s1+v[1]*w],'runway-line')).join('')).join('');
}

/** Section at mid-bay showing how the two rods of an X pass each other; keyed on the braced bay elevation. */
export const rodCrossingTitle='ROD CROSSING / SECTION AT MID-BAY';
/** Rod X-bracing between the new columns: braced bay elevation, the connections at the work points and the plan at the strut. */
export function bracingTopic(s:CalculationSnapshot):DetailTopic{
 const p=s.input,u=p.units,r=s.bracingSystem!,g=r.geometry,L=r.layout,b=p.longitudinalBracing!,d=bracingDesign(p),col=p.existingColumn!,base=p.columnBase!;
 const c=existingColumnSection(p).section,colName=col.shape||'BUILT-UP',sg=g.strut,dt=p.details!,br=dt.bracket?.enabled?dt.bracket:undefined;
 const dim=(v:number)=>drawingLength(v,u),size=(v:number)=>plateInches(v,u),force=(v:number,q:Parameters<typeof format>[1]='force')=>{const t=format(v,q,u,u==='SI'?1:2);return u==='US'?t.toUpperCase():t;};
 const cr=g.cross,rodName=`${size(b.rod.diameter)} DIA. ROD`,pinName=`${size(g.dp)} DIA. PIN`,gussetName=`PL ${size(g.t)} GUSSET`,boltName=`2 - ${size(d.strut.boltDiameter)} ${d.strut.grade} BOLTS`;
 const grids=(i:number)=>[i,i+1].map(String),spanGrids=L.spans.map(i=>grids(i).join('-')).join(', '),[gridA,gridB]=grids(L.spans[0]);
 const offsetLabel=`${dim(cr.offset)} OFF COLUMN C/L TOWARD GIRDER`;
 const el=runwayElevations(p),datum=p.drawing?.datumElevation??0,elev=(z:number)=>`EL. ${dim(datum+columnBaseElevation(base)+z)}`;
 const weldLabel=size(d.weld),views:DetailView[]=[];
 const turnAt=.25;

 // 1: Braced bay elevation on the column line, looking toward the crane: rods, strut, work points, gussets and columns.
 views.push({title:detailTitles.bracedBay,rows:2,render:()=>{
  const W=L.width,h=L.height,stub=18*inch,top=col.height,ftg=base.footing,slabTop=-(base.plate.thickness+base.grout)+ftg.soil,ftgTop=-(base.plate.thickness+base.grout),ftgBot=ftgTop-ftg.thickness;
  const zMax=top+(p.aist?.railDepth??p.railHeight)+(p.section.kind==='cap'?p.section.capTw:0),zMin=ftgBot-6*inch,xMin=-stub,xMax=W+stub;
  const k=drawingScale(Math.min(490/(xMax-xMin),600/(zMax-zMin)),u),kk=k.pointsPerMm,X=(x:number)=>100+(x-xMin)*kk,Y=(z:number)=>640-(z-zMin)*kk;
  let svg='<g data-view="braced-bay-elevation">';
  // Floor, footings and base plates.
  svg+=line([X(xMin),Y(slabTop)],[X(xMax),Y(slabTop)],'annotation');
  for(const x of [0,W]){
   // Footings beyond the drawn extent end at a break.
   const f0=Math.max(xMin,x-ftg.B/2),f1=Math.min(xMax,x+ftg.B/2);
   svg+=path([[X(f0),Y(ftgTop)],[X(f1),Y(ftgTop)]],'runway-line',false)+path([[X(f0),Y(ftgBot)],[X(f1),Y(ftgBot)]],'runway-line',false);
   for(const [e0,cut] of [[f0,f0>x-ftg.B/2],[f1,f1<x+ftg.B/2]] as const)svg+=cut?breakLine([X(e0),Y(ftgTop)-3],[X(e0),Y(ftgBot)+3]):line([X(e0),Y(ftgTop)],[X(e0),Y(ftgBot)],'runway-line');
   svg+=rect(X(x-base.plate.B/2),Y(0),base.plate.B*kk,base.plate.thickness*kk,'runway-line');
   // Column flange face, the runway girder bearing on the bracket beyond it.
   svg+=rect(X(x-c.bf/2),Y(top),c.bf*kk,top*kk,'runway-line')+line([X(x),Y(zMax)-14],[X(x),Y(zMin)+4],'grid-line');
  }
  // Girder beyond, between the columns, its bottom behind the strut; it continues into the next spans past the breaks.
  const gb=h+dt.bearing.thickness,gt=gb+p.section.d,segs:[number,number][]=[[xMin,-c.bf/2],[c.bf/2,W-c.bf/2],[W+c.bf/2,xMax]];
  for(const [x0,x1] of segs)svg+=line([X(x0),Y(gt)],[X(x1),Y(gt)],'runway-line');
  // Strut on the work points, breaking into the adjacent spans; its flanges cut back at each column.
  const half=sg.d/2;
  for(const [x0,x1] of [[xMin,-sg.end],[sg.end,W-sg.end],[W+sg.end,xMax]] as [number,number][])for(const z of [half,-half])svg+=line([X(x0),Y(h+z)],[X(x1),Y(h+z)],'runway-line');
  for(const x of [sg.end,W-sg.end])svg+=line([X(x),Y(h+half)],[X(x),Y(h-half)],'runway-line');
  for(const x of [-sg.end,W+sg.end])svg+=line([X(x),Y(h+half)],[X(x),Y(h-half)],'runway-line');
  for(const x of [xMin,xMax])svg+=breakLine([X(x),Y(h+half)-4],[X(x),Y(h-half)+4])+breakLine([X(x),Y(gt)-4],[X(x),Y(gb)+4]);
  // Rods pin to pin with a turnbuckle near the lower end; the X crosses at mid-bay without a connection.
  const rods:{from:XY;to:XY}[]=[],rodWidth=Math.max(b.rod.diameter,.6/kk);
  for(const [x0,dir] of [[0,1],[W,-1]] as const){
   const tp:XY=[X(x0+dir*g.top.pin[0]),Y(h+g.top.pin[1])],bp:XY=[X(W-x0-dir*g.bottom.pin[0]),Y(g.bottom.pin[1])];
   const Lr=Math.hypot(bp[0]-tp[0],bp[1]-tp[1]),uu:XY=[(bp[0]-tp[0])/Lr,(bp[1]-tp[1])/Lr],tb:XY=[tp[0]+uu[0]*Lr*(1-turnAt),tp[1]+uu[1]*Lr*(1-turnAt)];
   const cl=2.6*g.dp*kk,tl=3*b.rod.diameter*kk;
   // Rod B, beyond rod A, is hidden where it passes behind it at mid-bay.
   const behindA=dir<0?[[Lr/2-4,Lr/2+4]] as [number,number][]:[];
   svg+=rodLine(tp,bp,rodWidth,kk,[[0,cl],[Lr*(1-turnAt)-tl,Lr*(1-turnAt)+tl],[Lr-cl,Lr],...behindA]);
   for(const [s0,s1] of behindA)for(const w of [-1,1]){const v:XY=[-uu[1],uu[0]],o=w*rodWidth/2*kk;svg+=line([tp[0]+uu[0]*s0+v[0]*o,tp[1]+uu[1]*s0+v[1]*o],[tp[0]+uu[0]*s1+v[0]*o,tp[1]+uu[1]*s1+v[1]*o],'hidden-line');}
   svg+=clevis(tp,uu,g.dp,b.rod.diameter,kk)+clevis(bp,[-uu[0],-uu[1]],g.dp,b.rod.diameter,kk)+turnbuckle(tb,uu,b.rod.diameter,kk);
   // Gussets at both ends, on the side of the web toward the braced span.
   const up=r.outlines.upper.map(([x,z]):XY=>[X(x0+dir*x),Y(h+z)]),lo=r.outlines.lower.map(([x,z]):XY=>[X(W-x0-dir*x),Y(z)]);
   svg+=behind(up,[X(x0-c.bf/2),X(x0+c.bf/2)])+behind(lo,[X(W-x0-c.bf/2),X(W-x0+c.bf/2)]);
   rods.push({from:tp,to:bp});
  }
  for(const x of [0,W])svg+=workPoint(X(x),Y(h))+workPoint(X(x),Y(0));
  for(const [i,x] of [0,W].entries())svg+=bubble(X(x),Y(zMax)-26,grids(L.spans[0])[i],10);
  // Dimensions: bay width below the footings, work point height at the left, rod length along the first rod.
  svg+=dimH(X(0),X(W),Y(ftgBot)+4,Y(ftgBot)+22,dim(W))+dimV(Y(h),Y(0),X(-c.bf/2)-4,X(xMin)-10,`${dim(h)} W.P. TO W.P.`);
  // Where the rods cross: the intersection of their centerlines in the elevation.
  const cross=(()=>{const [a,c]=rods,d1:XY=[a.to[0]-a.from[0],a.to[1]-a.from[1]],d2:XY=[c.to[0]-c.from[0],c.to[1]-c.from[1]],den=d1[0]*d2[1]-d1[1]*d2[0],t=((c.from[0]-a.from[0])*d2[1]-(c.from[1]-a.from[1])*d2[0])/den;
   return [a.from[0]+d1[0]*t,a.from[1]+d1[1]*t] as XY;})();
  const notes=['RODS CROSS, NOT CONNECTED;',`ROD ${gridB}-${gridA} BEYOND, ${dim(cr.offset)} OFF;`,`SEE ${detailRef(rodCrossingTitle)}`],nw=Math.max(...notes.map(v=>textWidth(v,8)));
  svg+=text(cross[0],Y(h*.78),`ROD W.P. TO W.P. ${dim(L.diagonal)}`,8,'middle');
  svg+=multiLeader([[cross[0],cross[1]+2]],[cross[0]-nw/2,Y(h*.2)],notes,8);
  // Section at mid-bay, from above the strut, looking toward the lower-numbered grid.
  svg+=sectionCut([cross[0],Y(h+half)-6],[cross[0],cross[1]+10],[-1,0],rodCrossingTitle,['b']);
  // Callouts in a column at the right, ordered by height.
  const [ra]=rods,at=(t:number):XY=>[ra.from[0]+(ra.to[0]-ra.from[0])*t,ra.from[1]+(ra.to[1]-ra.from[1])*t];
  const lx=X(xMax)+16,items:{at:XY;labels:string[]}[]=[
   {at:[X(W/2+W*.12),Y(gt)+1],labels:['GIRDER BEYOND,','BRACKETS NOT SHOWN']},
   {at:[X(W*.72),Y(h-half)],labels:[`${sg.shape} STRUT, FULL LENGTH`,`SEE ${detailRef(detailTitles.strutPlan)}`]},
   {at:[X(W+c.bf/2),Y(h-(sg.d/2+3*inch))],labels:[`${gussetName}, SEE`,detailRef(detailTitles.braceTop)]},
   {at:at(.33),labels:[`${rodName}, ${spanGrids.includes(',')?'':'GRIDS '+spanGrids}`.replace(/, $/,''),'CLEVIS EACH END, TYP.']},
   {at:at(1-turnAt),labels:['TURNBUCKLE, TYP.']},
   {at:[X(W+c.bf/2),Y(top*.3)],labels:[`NEW ${colName} COLUMN`]},
   {at:[X(W-base.plate.B/2-3*inch),Y(g.bottom.pin[1]+2*inch)],labels:[`${gussetName}, SEE`,detailRef(detailTitles.braceBase)]},
   {at:[X(Math.min(xMax,W+ftg.B/2)-3*inch),Y(ftgTop-ftg.thickness/2)],labels:['FOOTING, SEE',detailRef(detailTitles.footing)]}
  ];
  svg+=labelColumn(items,lx,Y(zMax)+4,Y(zMin));
  return {svg:svg+'</g>',scale:k.label};
 }});

 // Connection elevations: the column flange face with the web and gusset beyond it, the strut, clevis and rod.
 const connection=(lower:boolean)=>()=>{
  const outline=lower?r.outlines.lower:r.outlines.upper,pin=lower?g.bottom.pin:g.top.pin,uu:Pt=lower?[g.cos,g.sin]:[g.cos,-g.sin];
  const rodEnd=(lower?g.bottom.s:g.top.s)+10*inch,zs=outline.map(q=>q[1]),xs=outline.map(q=>q[0]);
  const xMin=-c.bf/2-3*inch,xMax=Math.max(...xs,rodEnd*g.cos,lower?base.plate.B/2:sg.tabEnd+10*inch)+inch;
  const zTop=lower?Math.max(...zs,rodEnd*g.sin)+3*inch:sg.d/2+5*inch,zBot=lower?-(base.plate.thickness+base.grout)-4*inch:Math.min(...zs,-rodEnd*g.sin)-2*inch;
  const k=drawingScale(Math.min(330/(xMax-xMin),250/(zTop-zBot)),u),kk=k.pointsPerMm,X=(x:number)=>100+(x-xMin)*kk,Y=(z:number)=>300-(z-zBot)*kk;
  let svg=`<g data-view="${lower?'brace-base-connection':'brace-top-connection'}">`;
  // Column: near flange face, broken where it continues.
  const c0=lower?0:zBot+inch,c1=zTop-inch;
  svg+=line([X(-c.bf/2),Y(c0)],[X(-c.bf/2),Y(c1)],'runway-line')+line([X(c.bf/2),Y(c0)],[X(c.bf/2),Y(c1)],'runway-line')+breakLine([X(-c.bf/2)-6,Y(c1)],[X(c.bf/2)+6,Y(c1)]);
  if(!lower)svg+=breakLine([X(-c.bf/2)-6,Y(c0)],[X(c.bf/2)+6,Y(c0)]);
  svg+=line([X(0),Y(zTop)],[X(0),Y(zBot)],'grid-line');
  // The web edges, hidden behind the flange.
  for(const x of [-c.tw/2,c.tw/2])svg+=line([X(x),Y(c0)],[X(x),Y(c1)],'hidden-line');
  svg+=behind(outline.map(([x,z]):XY=>[X(x),Y(z)]),[X(-c.bf/2),X(c.bf/2)]);
  if(lower){
   // Base plate on grout on the footing; the near row of anchor rods.
   const pl=base.plate,a=base.anchors,hw=anchorHardware(a.diameter);
   svg+=rect(X(-pl.B/2),Y(0),pl.B*kk,pl.thickness*kk,'runway-line')+rect(X(-pl.B/2-inch),Y(-pl.thickness),(pl.B+2*inch)*kk,base.grout*kk,'annotation');
   svg+=line([X(xMin),Y(-pl.thickness-base.grout)],[X(xMax),Y(-pl.thickness-base.grout)],'runway-line');
   for(const x of Array.from({length:a.perRow},(_,i)=>a.perRow>1?-a.gauge/2+i*a.gauge/(a.perRow-1):0)){
    svg+=rect(X(x-hw.washer/2),Y(hw.washerThickness),hw.washer*kk,hw.washerThickness*kk,'runway-line')+rect(X(x-.75*a.diameter),Y(hw.washerThickness+a.diameter),1.5*a.diameter*kk,a.diameter*kk,'runway-line');
    svg+=line([X(x-a.diameter/2),Y(hw.washerThickness+1.6*a.diameter)],[X(x-a.diameter/2),Y(-pl.thickness-base.grout-inch)],'hidden-line')+line([X(x+a.diameter/2),Y(hw.washerThickness+1.6*a.diameter)],[X(x+a.diameter/2),Y(-pl.thickness-base.grout-inch)],'hidden-line');
   }
  }else{
   // Strut: web lapped on the gusset, flanges coped back; it continues to the next column.
   // The strut web is on the far face of the gusset: hidden where the gusset covers it.
   const h=sg.d/2,f=sg.d/2-sg.tf,web=sg.d/2-sg.kdes,cope=sg.end+sg.cope,far=sg.tabEnd+10*inch,plate=outline.map(([x,z]):XY=>[X(x),Y(z)]);
   const edges:[Pt,Pt][]=[[[sg.end,web],[cope,web]],[[cope,web],[cope,h]],[[cope,h],[far,h]],[[sg.end,-web],[cope,-web]],[[cope,-web],[cope,-h]],[[cope,-h],[far,-h]],[[sg.end,web],[sg.end,-web]],[[cope,f],[far,f]],[[cope,-f],[far,-f]]];
   for(const [a,c2] of edges)svg+=behindPlate([X(a[0]),Y(a[1])],[X(c2[0]),Y(c2[1])],plate);
   svg+=breakLine([X(far),Y(h)+4],[X(far),Y(-h)-4]);
   for(const x of sg.bolts)svg+=circle(X(x),Y(0),sg.bolt.hole/2*kk,'runway-line')+line([X(x)-3,Y(0)],[X(x)+3,Y(0)])+line([X(x),Y(0)-3],[X(x),Y(0)+3]);
  }
  // Clevis on the pin and the rod, broken along its length.
  const P:XY=[X(pin[0]),Y(pin[1])],dir:XY=[uu[0],-uu[1]],end:XY=[X(rodEnd*uu[0]),Y(rodEnd*uu[1])];
  svg+=clevis(P,dir,g.dp,b.rod.diameter,kk)+rodLine(P,end,b.rod.diameter,kk,[[0,2.6*g.dp*kk]])+breakLine([end[0]-dir[1]*8,end[1]+dir[0]*8],[end[0]+dir[1]*8,end[1]-dir[0]*8]);
  svg+=workPoint(X(0),Y(0));
  // Dimensions from the work point to the pin, and the strut end and bolts from the column centerline.
  // The pin sits on the rod line through the work point: its offset across the column and its distance along the rod locate it.
  const dimY=lower?Y(-base.plate.thickness-base.grout-inch)+16:Y(sg.d/2)-14;
  if(lower)svg+=dimH(X(0),X(pin[0]),Y(-base.plate.thickness-base.grout),dimY,dim(pin[0]),'right');
  else{
   // The short edge distance on its own tier, its text beside its segment.
   svg+=dimH(X(0),X(sg.end),Y(sg.d/2),dimY,dim(sg.end),'left')+dimH(X(sg.bolts[0]),X(sg.bolts[1]),Y(sg.d/2),dimY,dim(sg.pitch),'right');
   svg+=dimH(X(sg.end),X(sg.bolts[0]),Y(sg.d/2),dimY-14,dim(sg.edge),'right');
   svg+=dimH(X(0),X(pin[0]),Y(pin[1]),Y(zBot)+6,dim(pin[0]),'right');
  }
  const weld=lower?r.outlines.welds.lower:undefined,upper=r.outlines.welds.upper,welds=lower?`${dim(weld!.web)} TO WEB, ${dim(weld!.plate-g.x0)} TO BASE PL`:`${dim(upper.to-upper.from)} TO COLUMN WEB`;
  const lx=X(xMin)-14;
  const leftLabels=[`NEW ${colName} COLUMN`,...(lower?['BASE PL, SEE',detailRef(detailTitles.basePlate)]:[])];
  svg+=multiLeader([[X(-c.bf/2),Y((c0+c1)/2+(lower?2*inch:0))]],[lx-Math.max(...leftLabels.map(v=>textWidth(v,8.5))),Y(zTop)-6],leftLabels);
  const items:{at:XY;labels:string[];weld?:string}[]=[
   {at:[X(c.bf/2+inch),Y(lower?weld!.web*.6:upper.to-.4*(upper.to-upper.from))],labels:[`SHOP, ${welds}`,`${gussetName}, A572 GR. 50`],weld:weldLabel},
   {at:[P[0]+dir[0]*1.8*g.dp*kk,P[1]+dir[1]*1.8*g.dp*kk+.6*g.dp*kk],labels:[`FORGED CLEVIS, ${pinName}`,`${dim(lower?g.bottom.s:g.top.s)} FROM W.P. ALONG ROD;`,`RATED TO DEVELOP THE ROD`]},
   {at:[end[0]-dir[0]*14,end[1]-dir[1]*14],labels:[rodName,`ASTM F1554 GR. 36`]},
   ...(lower?[]:[{at:[X(sg.bolts[1]),Y(0)] as XY,labels:[boltName,'STD. HOLES, SNUG-TIGHT']},{at:[X(sg.tabEnd+6*inch),Y(sg.d/2)] as XY,labels:[`${sg.shape} STRUT, COPE`,`FLANGES ${dim(sg.cope)}`]}])
  ];
  svg+=labelColumn(items,X(xMax)+40,Y(zTop),Y(zBot));
  const wp=lower?'W.P. AT T/BASE PL':'W.P. AT BRG. SEAT',ww=textWidth(wp,8);
  svg+=multiLeader([[X(0)-2,Y(0)+1]],[X(-c.bf/2)-18-ww,Y(lower?zTop*.45:-sg.d/2-2*inch)],[wp],8);
  // Rod B's end at the other column: the same plates, mirrored and offset toward the girder.
  // As drawn the lower rod rises toward the next grid: rod B's base, at the lower-numbered column.
  const other=lower?[`SHOWN AT GRID ${gridA}, ROD ${gridB}-${gridA}: GUSSET ${offsetLabel}.`,`AT GRID ${gridB}, ROD ${gridA}-${gridB}: MIRRORED, GUSSET ON COLUMN C/L.`]:[`SHOWN AT GRID ${gridA}, ROD ${gridA}-${gridB}. AT GRID ${gridB}, ROD ${gridB}-${gridA}: MIRRORED,`,`GUSSET ${offsetLabel}${cr.filler?`; ${size(cr.filler)} FILLER UNDER THE STRUT WEB`:''}.`];
  other.forEach((v,i)=>{svg+=text(X(xMin),Y(zBot)+(lower?40:30)+i*10,v,7.5);});
  return {svg:svg+'</g>',scale:k.label};
 };
 views.push({title:detailTitles.braceTop,render:connection(false)});
 views.push({title:detailTitles.braceBase,render:connection(true)});

 // 4: Plans at the work point of both columns of a braced span, over two rows. At the lower-numbered column rod A's
 // gusset is on the column centerline with the strut web on its girder face; at the higher-numbered column rod B's
 // gusset is offset toward the girder, the strut web on its other face with the filler between. The strut tab on
 // the other side of each web, the bracket seat welded to the column flange (the collector), the rods below the cut.
 views.push({title:detailTitles.strutPlan,rows:2,render:()=>{
  const e=girderOffset(p),proj=br?.seatProjection??0,len=br?.seatLength??0,ext=sg.tabEnd+8*inch;
  const xMin=-ext,xMax=ext,yMin=-c.d/2-4*inch,yMax=Math.max(e+4*inch,c.d/2+proj+2*inch);
  const k=drawingScale(Math.min(300/(xMax-xMin),280/(yMax-yMin)),u),kk=k.pointsPerMm,gt=g.t,gx=Math.max(...r.outlines.upper.map(q=>q[0])),web=gt/2;
  let svg='<g data-view="strut-plan">';
  // dir: the side of the braced span (+1 toward the next grid); rod: the plane of this column's rod gusset; the
  // plan is drawn over [x0, x1] x [y0, y1] (x toward the braced span) at q points per mm, its top edge at `top`.
  type Range={x0:number;x1:number;y0:number;y1:number};
  const plan=(dir:1|-1,top:number,rod:number,grid:string,name:string,R:Range,q:number,seat:boolean)=>{
   const left=100,X=(x:number)=>left+(dir>0?x-R.x0:R.x1-x)*q,Y=(y:number)=>top+(R.y1-y)*q;
   const box=(x0:number,x1:number,y0:number,y1:number,cls='runway-line')=>rect(Math.min(X(x0),X(x1)),Math.min(Y(y0),Y(y1)),Math.abs(x1-x0)*q,Math.abs(y1-y0)*q,cls);
   let out=text(left,top-8,`AT GRID ${grid}: ${name} UPPER GUSSET`,8.5,'start',700);
   const t=c.tf,w=c.tw;
   out+=path([[X(-c.bf/2),Y(c.d/2)],[X(c.bf/2),Y(c.d/2)],[X(c.bf/2),Y(c.d/2-t)],[X(w/2),Y(c.d/2-t)],[X(w/2),Y(-c.d/2+t)],[X(c.bf/2),Y(-c.d/2+t)],[X(c.bf/2),Y(-c.d/2)],[X(-c.bf/2),Y(-c.d/2)],[X(-c.bf/2),Y(-c.d/2+t)],[X(-w/2),Y(-c.d/2+t)],[X(-w/2),Y(c.d/2-t)],[X(-c.bf/2),Y(c.d/2-t)]]);
   out+=line([X(R.x0),Y(0)],[X(R.x1),Y(0)],'grid-line')+line([X(0),Y(R.y0)],[X(0),Y(R.y1)],'grid-line');
   // Rod gusset on the braced side, the strut tab on the column C/L on the other; strut webs on one line.
   out+=box(g.x0,gx,rod-gt/2,rod+gt/2)+box(-sg.tabEnd,-g.x0,-gt/2,gt/2);
   const fill=rod-gt/2-(web+sg.tw);
   if(fill>1e-6)out+=box(sg.end,sg.tabEnd,web+sg.tw,rod-gt/2);
   for(const side of [1,-1]){
    const x0=side*sg.end,x1=side>0?R.x1-inch:R.x0+inch,f0=side*(sg.end+sg.cope);
    out+=box(x0,x1,web,web+sg.tw);
    // Bottom flange below the cut, beyond the cope.
    out+=box(f0,x1,web+sg.tw/2-sg.bf/2,web+sg.tw/2+sg.bf/2);
    out+=breakLine([X(x1),Y(web+sg.tw/2+sg.bf/2)-4],[X(x1),Y(web+sg.tw/2-sg.bf/2)+4]);
    const plate=side>0?[rod-gt/2,rod+gt/2]:[-gt/2,gt/2],lo=Math.min(plate[0],web),hi=Math.max(plate[1],web+sg.tw);
    for(const x of sg.bolts)out+=line([X(side*x),Y(lo)+.3*inch*q],[X(side*x),Y(hi)-.3*inch*q],'runway-line');
   }
   // Clevis and rod below the cut, in the gusset's plane.
   out+=box(g.top.pin[0]-.9*g.dp,g.top.pin[0]+1.1*g.dp,rod-gt/2-.4*g.dp,rod+gt/2+.4*g.dp,'hidden-line');
   for(const side of [-1,1])out+=line([X(g.top.pin[0]+2.6*g.dp),Y(rod+side*b.rod.diameter/2)],[X(R.x1-inch),Y(rod+side*b.rod.diameter/2)],'hidden-line');
   if(br&&seat){out+=box(-len/2,len/2,c.d/2,c.d/2+proj);out+=line([X(R.x0),Y(e)],[X(R.x1),Y(e)],'grid-line');}
   out+=workPoint(X(0),Y(0));
   return {out,X,Y,fill};
  };
  // Rod A's column in full, with the bracket seat; rod B's around the web at a larger scale for the offset and filler.
  const RA={x0:xMin,x1:xMax,y0:yMin,y1:yMax},spanB=sg.tabEnd+3*inch,RB={x0:-spanB,x1:spanB,y0:-c.d/2-1.5*inch,y1:c.d/2+1.5*inch};
  const scaleB=drawingScale(Math.min(300/(2*spanB),240/(RB.y1-RB.y0)),u),kB=scaleB.pointsPerMm,kBlabel=scaleB.label;
  const height=(yMax-yMin)*kk,A=plan(1,40,0,gridA,`ROD ${gridA}-${gridB}`,RA,kk,true),B=plan(-1,40+height+64,cr.offset,gridB,`ROD ${gridB}-${gridA}`,RB,kB,false);
  svg+=A.out+B.out;
  // Plan A: the girder offset and strut end dimensioned; callouts at the right and the tab at the left.
  {
   const {X,Y}=A;
   svg+=dimV(Y(e),Y(0),X(-len/2),X(xMin)-10,dim(e));
   svg+=dimH(X(0),X(sg.end),Y(web+sg.tw/2-sg.bf/2)-2,Y(yMin)+2,dim(sg.end),'right');
   const items:{at:XY;labels:string[];weld?:string}[]=[
    ...(br?[{at:[X(xMax)-2,Y(e)] as XY,labels:['GIRDER WEB C/L']},{at:[X(c.bf/4),Y(c.d/2)] as XY,labels:[`SEAT PL TO COL. FLANGE, TOP,`,`${dim(seatColumnWeld(p,s.detailResults?.bracket).length)} LONG, SHOP (COLLECTOR)`],weld:size(d.seatWeld)}]:[]),
    {at:[X(sg.bolts[1]),Y(web+sg.tw)],labels:[`${sg.shape} STRUT, WEB ON THE`,'GIRDER FACE, EACH SIDE']},
    {at:[X(gx-inch),Y(-gt/2)],labels:[`${gussetName} (ROD ${gridA}-${gridB})`,`ON COLUMN C/L, SEE ${detailRef(detailTitles.braceTop)}`]}
   ];
   svg+=labelColumn(items,X(xMax)+30,Y(yMax),Y(yMin));
   const tab=[`PL ${size(gt)} STRUT TAB, AT OTHER`,'SIDE AND OTHER COLUMNS'],tw2=Math.max(...tab.map(v=>textWidth(v,8.5)));
   svg+=multiLeader([[X(-sg.tabEnd+inch),Y(-gt/2)]],[X(xMin)-16-tw2,Y(-c.d/2)+8],tab);
  }
  // Plan B: the braced side at the left; the offset gusset and filler called out at the left, the tab at the right.
  {
   const {X,Y,fill}=B;
   const left:{at:XY;labels:string[]}[]=[{at:[X(gx-inch),Y(cr.offset+gt/2)],labels:[`${gussetName} (ROD ${gridB}-${gridA}),`,offsetLabel]},
    ...(fill>1e-6?[{at:[X(sg.tabEnd-inch/2),Y(cr.offset-gt/2-fill/2)] as XY,labels:[`${size(cr.filler)} FILLER UNDER`,'STRUT WEB']}]:[]),
    {at:[X(sg.bolts[1]),Y(web)],labels:[`${boltName}`,'THROUGH WEB, FILLER, GUSSET']}];
   const lw=Math.max(...left.flatMap(v=>v.labels.map(l=>textWidth(l,8.5))));
   svg+=labelColumn(left,X(RB.x1)-30-lw,Y(RB.y1),Y(RB.y0));
   const tab=[`PL ${size(gt)} STRUT TAB`,'ON COLUMN C/L'];
   svg+=multiLeader([[X(-sg.tabEnd+inch),Y(-gt/2)]],[X(RB.x0)+16,Y(RB.y0)+4],tab);
   svg+=text(100,Y(RB.y0)+30,`PLAN AT GRID ${gridB}: ${kBlabel.replace('SCALE: ','SCALE ')}`,7.5);
  }
  return {svg:svg+'</g>',scale:k.label};
 }});

 // 5: Section across the column line at mid-bay: rod A on the column C/L, rod B in its plane offset toward the girder,
 // and the strut cut at the work point above with its web between the two planes.
 views.push({title:rodCrossingTitle,render:()=>{
  const theta=Math.atan2(L.height,L.width),rd=b.rod.diameter,sbf=sg.bf,sd=sg.d,stf=sg.tf,stw=sg.tw,web=g.t/2;
  const k=drawingScale(Math.min(.75,170/sd,170/(sbf+2*inch)),u),kk=k.pointsPerMm,cx=200,Y0=60,X=(y:number)=>cx+y*kk;
  let svg='<g data-view="rod-crossing">';
  // Strut, cut at mid-bay: web vertical on its line, flanges across it.
  const wc=web+stw/2,top=Y0,bot=Y0+sd*kk;
  svg+=path([[X(wc-sbf/2),top],[X(wc+sbf/2),top],[X(wc+sbf/2),top+stf*kk],[X(wc+stw/2),top+stf*kk],[X(wc+stw/2),bot-stf*kk],[X(wc+sbf/2),bot-stf*kk],[X(wc+sbf/2),bot],[X(wc-sbf/2),bot],[X(wc-sbf/2),bot-stf*kk],[X(wc-stw/2),bot-stf*kk],[X(wc-stw/2),top+stf*kk],[X(wc-sbf/2),top+stf*kk]]);
  // Break between the strut and the rods; the rods cross at mid-height of the bay.
  const yb=bot+22,yr=yb+26,ry=rd/Math.cos(theta)/2*kk;
  svg+=breakLine([X(-sbf/2-inch),yb],[X(sbf/2+2*inch),yb]);
  const ellipse=(y:number)=>`<polyline class="runway-line" points="${Array.from({length:25},(_,i)=>{const a=i/24*2*Math.PI;return `${n(X(y)+Math.cos(a)*rd/2*kk)},${n(yr+Math.sin(a)*ry)}`;}).join(' ')}"/>`;
  svg+=ellipse(0)+ellipse(cr.offset);
  // Planes of the gussets through the rods, up through the strut.
  for(const y of [0,cr.offset])svg+=line([X(y),top-10],[X(y),yr+ry+8],'grid-line');
  svg+=dimH(X(0),X(cr.offset),yr+ry+2,yr+ry+18,dim(cr.offset),'left')+dimH(X(rd/2),X(cr.offset-rd/2),yr+ry+2,yr+ry+34,dim(cr.clear)+' CLEAR','left');
  const items:{at:XY;labels:string[]}[]=[
   {at:[X(wc+sbf/2),top+stf*kk/2],labels:[`${sg.shape} STRUT, CUT AT MID-BAY:`,'WEB BETWEEN THE GUSSET PLANES']},
   {at:[X(cr.offset)+rd/2*kk,yr],labels:[`ROD ${gridB}-${gridA}, IN THE PLANE OF ITS`,`GUSSETS, ${dim(cr.offset)} TOWARD GIRDER`,'RODS NOT CONNECTED']}
  ];
  svg+=labelColumn(items,X(sbf/2+2*inch)+24,top,yr+ry+30);
  const rodA=[`ROD ${gridA}-${gridB}, ON`,'COLUMN C/L'],aw=Math.max(...rodA.map(v=>textWidth(v,8.5)));
  svg+=multiLeader([[X(0)-rd/2*kk,yr-ry*.4]],[X(-sbf/2-inch)-aw,yr-ry-6],rodA);
  svg+=text(X(-sbf/2-inch),yr+ry+56,`LOOKING TOWARD GRID ${gridA}; GIRDER TO THE RIGHT.`,7.5);
  return {svg:svg+'</g>',scale:k.label};
 }});
 // Drawing order on the sheet: the braced bay and the plans over two rows each, then the connections and the crossing.
 {const order=[detailTitles.bracedBay,detailTitles.strutPlan,detailTitles.braceTop,detailTitles.braceBase,rodCrossingTitle] as string[];views.sort((x,y)=>order.indexOf(x.title)-order.indexOf(y.title));}

 const check=(id:string)=>s.checks.find(v=>v.id===id),ratio=(...ids:string[])=>ids.map(id=>{const v=check(id);return v?.utilization!==undefined?`${v.status==='fail'?'FAILS ':''}${v.utilization.toFixed(2)}`:'-';}).join(' / ');
 const z=r.seismic,sep=r.separation,lb=s.longitudinalBracing!;
 const rows=[
  ['BRACING',`${rodName} X, TENSION ONLY, GRIDS ${spanGrids}, BOTH RUNWAYS; W.P. ${dim(L.height)} ABOVE T/BASE PL${el?` (BRG. SEAT ${elev(L.height)})`:''}`],
  [`LINE FORCE / ROD FORCE (${p.method})`,`${force(lb.governing.H)} / ${force(lb.governing.force)} (${lb.governing.id})`],
  ['ROD STRENGTH = CONNECTION FORCE',`${force(r.develop)}: CLEVIS, ${pinName}, ${gussetName} AND WELDS DEVELOP THE ROD`],
  ['GUSSET WELDS',`${weldLabel} FILLETS BOTH FACES: ${dim(r.outlines.welds.upper.to-r.outlines.welds.upper.from)} TO WEB AT W.P.; ${dim(r.outlines.welds.lower.web)} TO WEB AND ${dim(r.outlines.welds.lower.plate-g.x0)} TO BASE PL`],
  ['STRUT',`${sg.shape}, ${force(r.strutForce.H)} (${r.strutForce.id}); ${boltName} EACH END`],
  ['ROD CROSSING',`ROD ${gridB}-${gridA} GUSSETS ${offsetLabel}; RODS ${dim(cr.clear)} CLEAR AT MID-BAY`],
  ['COLLECTOR AT EACH COLUMN',`GIRDER LOCATING BOLTS TO SEAT, ${size(d.seatWeld)} SEAT FILLET TO FLANGE: ${force(r.seatForce.F)}`],
  ...(z?[['SEISMIC ALONG RUNWAY',`R ${z.basis.R}, CS ${z.basis.Cs.toFixed(3)}, QE ${force(z.QE)}; DRIFT ${dim(z.drift)}`]]:[]),
  ...(sep?[['SEISMIC SEPARATION',`${dim(specifiedSeparation(sep.required,u))} MIN. CLEAR TO EXISTING BUILDING (ASCE 7 §12.12.3)`]]:[]),
  ['RATIOS: ROD / GUSSET / WELD / WEB / STRUT / COL. TORSION',ratio('brace-tension','brace-pin-bearing','brace-gusset-weld','brace-column-web','brace-strut','column-torsion')]
 ];
 const notes=[
  `RODS: ASTM F1554 GR. 36 (OR A36) ${rodName}, THREADED FOR A FORGED CLEVIS AT EACH END AND A TURNBUCKLE ${Math.round(turnAt*100)}% OF THE LENGTH FROM THE LOWER END (RIGHT- AND LEFT-HAND THREADS). CLEVIS, PIN AND TURNBUCKLE RATED BY THE MANUFACTURER TO DEVELOP THE ROD, ${force(r.develop)}; CLEVIS GRIP TO SUIT THE ${size(g.t)} GUSSET. SUBMIT CATALOG DATA.`,
  `TENSION RODS AFTER THE STRUT IS BOLTED AND THE COLUMNS ARE PLUMB: TAKE OUT THE SAG BY HAND, THEN LOCK THE TURNBUCKLES WITH JAM NUTS. DO NOT USE THE RODS TO PLUMB THE COLUMNS. ROD ${gridB}-${gridA} LIES IN A PLANE ${offsetLabel} SO THE RODS PASS AT MID-BAY ${dim(cr.clear)} CLEAR, NOT CONNECTED (${detailRef(rodCrossingTitle)}); DO NOT BEND A ROD TO CLEAR THE OTHER.`,
  `GUSSETS AND STRUT TABS: ASTM A572 GR. 50, SHOP WELDED TO THE COLUMN WEB WITH ${weldLabel} FILLETS BOTH FACES; THE LOWER GUSSET ALSO TO THE BASE PLATE. ROD ${gridA}-${gridB} GUSSETS ON THE COLUMN C/L; ROD ${gridB}-${gridA} GUSSETS ${offsetLabel}${cr.filler?`, WITH A ${size(cr.filler)} FILLER UNDER THE STRUT WEB AT GRID ${gridB}`:''}. SNIPE GUSSET CORNERS ${size(.75*inch)} TO CLEAR THE COLUMN-TO-PLATE WELDS. PIN HOLES ${size(g.dh)} DIA., DRILLED.`,
  `CRANE-LEVEL STRUT: ASTM A992 ${sg.shape} ON THE COLUMN CENTERLINE AT THE W.P., EVERY SPAN OF BOTH RUNWAYS, FLANGES COPED ${dim(sg.cope)} EACH END, ${boltName} IN STANDARD HOLES, SNUG-TIGHT, TO THE GUSSET OR TAB AT EACH COLUMN. IT COLLECTS THE GIRDERS' LONGITUDINAL FORCE AT EVERY COLUMN AND BRACES THE COLUMNS ALONG THE RUNWAY.`,
  `AT EVERY COLUMN: SHOP WELD THE BRACKET SEAT PLATE TO THE COLUMN FLANGE WITH A ${size(d.seatWeld)} TOP FILLET ACROSS THE FLANGE. THE GIRDER'S LOCATING BEARING BOLTS DELIVER ITS LONGITUDINAL FORCE TO THE SEAT; THE COLUMN TAKES THE TORQUE FROM ITS ${dim(girderOffset(p))} OFFSET (CALCULATION REPORT, NEW COLUMN).`,
  `ERECT THE STRUT AND RODS WITH THE COLUMNS, BEFORE THE GIRDERS ARE SET. THE BRACED COLUMNS AND FOOTINGS ARE DESIGNED FOR THE ROD FORCES, INCLUDING UPLIFT AND SHEAR ALONG THE RUNWAY AT THE BASE.`,
  ...(sep?[`KEEP THE NEW COLUMNS, STRUT, RODS, GIRDERS AND RAILS AT LEAST ${dim(specifiedSeparation(sep.required,u))} CLEAR OF THE EXISTING BUILDING IN EVERY DIRECTION (ASCE 7 §12.12.3); FIELD VERIFY BEFORE SETTING THE FOOTINGS.`]:[])
 ];
 return {key:'bracing',name:'LONGITUDINAL BRACING',views,notes:(t:Style)=>[heading(t,'BRACING DESIGN DATA'),table(t,['ITEM','VALUE'],rows,[1.25,1.75]),heading(t,'BRACING NOTES'),...numbered(t,notes)]};
}
/** Required seismic separation as specified on the drawings, rounded up to 1/8 in or 5 mm. */
export const specifiedSeparation=(required:number,units:'US'|'SI')=>{const q=units==='US'?inch/8:5;return Math.ceil(required/q-1e-9)*q;};

/**
 * The bracing on the general arrangement's girder elevation (sheet units; model metres from the girder mid-depth,
 * x from grid 1): the column stubs run on `stub` below the girder to a break, with the strut at the work point and
 * the rods leaving the upper gussets into the break. The whole braced bay is drawn on the bracing details.
 */
export function bracingOnElevation(s:CalculationSnapshot,o:{EX:(x:number)=>number;EY:(y:number)=>number;ek:number;supports:number[];columnWidth:number;girderBottom:number;stub:number}){
 const p=s.input,r=s.bracingSystem!,g=r.geometry,L=r.layout,dt=p.details!,br=dt.bracket?.enabled?dt.bracket:undefined;
 const mm=.001,wp=-p.section.d/2*mm-dt.bearing.thickness*mm,{EX,EY}=o,end=o.girderBottom+o.stub,half=o.columnWidth/2;
 let svg='<g data-elevation-bracing="true">';
 for(const x of o.supports){const x0=EX(x-half),x1=EX(x+half);svg+=line([x0,o.girderBottom],[x0,end],'runway-line')+line([x1,o.girderBottom],[x1,end],'runway-line')+breakLine([x0-5,end],[x1+5,end]);}
 // Strut: the bottom of its section shows below the girder, between the bracket seats.
 const seat=(br?.seatLength??0)*mm/2,sb=EY(wp-g.strut.d*mm/2);
 for(let i=1;i<o.supports.length;i++)svg+=line([EX(o.supports[i-1]+seat),sb],[EX(o.supports[i]-seat),sb],'runway-line');
 // Rods from each upper pin down into the break at the stub ends.
 const slope=L.height/L.width;
 for(const i of L.spans)for(const [x0,dir] of [[o.supports[i-1],1],[o.supports[i],-1]] as const){
  const px=x0+dir*g.top.pin[0]*mm,py=EY(wp+g.top.pin[1]*mm),drop=(end-py)/o.ek,ex=px+dir*drop/slope;
  svg+=circle(EX(px),py,1.4,'runway-line')+line([EX(px),py],[EX(ex),end],'runway-line')+breakLine([EX(ex)-4*dir,end-3],[EX(ex)+4*dir,end+3]);
 }
 // The callout in the first braced span, below the girder marks and between the rods.
 const i=L.spans[0],cx=(EX(o.supports[i-1])+EX(o.supports[i]))/2,labels=[`${plateInches(p.longitudinalBracing!.rod.diameter,p.units)} DIA. ROD X-BRACING, GRIDS ${L.spans.map(v=>`${v}-${v+1}`).join(', ')}, BOTH RUNWAYS`,`${g.strut.shape} STRUT ON COLUMN LINE, ALL SPANS; SEE ${detailRef(detailTitles.bracedBay)}`];
 const w=Math.max(...labels.map(v=>textWidth(v.toUpperCase(),7.5))),rodX=EX(o.supports[i]-g.top.pin[0]*mm-(end-6-EY(wp+g.top.pin[1]*mm))/o.ek/slope);
 svg+=multiLeader([[rodX,end-6]],[cx-w/2,end-14],labels,7.5);
 return svg+'</g>';
}

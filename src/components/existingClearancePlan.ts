import type {CalculationSnapshot} from '../engine/types';
import {aiscShapeByName} from '../data/aiscSections';
import {existingColumnSection} from '../engine/existingColumn';
import {existingLayout,planClear,type ClearancePair,type ExistingLayout,type PlanBox} from '../engine/existingLayout';
import {specifiedSeparation} from './bracingSheet';
import {drawingLength} from './drawingFormat';
import {sheetDrawingScale,bubble,dimH,labelColumn,line,n,rect,text,textWidth,viewTitle,detailRef,detailTitles,type XY} from './sheetGraphics';

export const existingClearanceTitle='EXISTING BUILDING CLEARANCE / PLAN';
/** The enlarged plan is drawn where an existing column lies within reach of the new runway. */
export function existingClearanceShown(s:CalculationSnapshot){const r=existingLayout(s.input);return r?.steel?r:undefined;}
/** The new column and the existing column of the least clearance, with their footings: the governing utilization. */
export function governingPair(s:CalculationSnapshot,r:ExistingLayout):ClearancePair{
 const required=s.bracingSystem?.separation?.required??0,steel=r.steel!,footing=r.footing;
 return footing&&r.footingClear/Math.max(footing.clear,1e-9)>=required/Math.max(steel.clear,1e-9)?footing:steel;
}
/** Plan W shape with its depth across the runway (sheet y) and flanges along it (sheet x). */
function wAcross(cx:number,cy:number,d:number,bf:number,tf:number,tw:number,k:number,cls:string){
 const x=(v:number)=>n(cx+v*k),y=(v:number)=>n(cy+v*k);
 return `<path class="${cls}" d="M${x(-bf/2)},${y(-d/2)}H${x(bf/2)}V${y(-d/2+tf)}H${x(tw/2)}V${y(d/2-tf)}H${x(bf/2)}V${y(d/2)}H${x(-bf/2)}V${y(d/2-tf)}H${x(-tw/2)}V${y(-d/2+tf)}H${x(-bf/2)}Z"/>`;
}

/**
 * Enlarged plan at the least clearance to the existing building: the new column, base plate and footing at its
 * grid with the nearest surveyed existing column and footing, dimensioned for the steel clear distance against the
 * seismic separation and the footing clear distance against its minimum. Line A draws outboard down the sheet as on
 * the runway plan, line B outboard up.
 */
export function existingClearancePlan(s:CalculationSnapshot,r:ExistingLayout,box:{x:number;y:number;w:number;h:number},contentScale:number){
 const p=s.input,u=p.units,dim=(mm:number)=>drawingLength(mm,u),c=existingColumnSection(p).section,b=p.columnBase!,ft=b.footing;
 const g=governingPair(s,r),l=r.lines.find(v=>v.line===g.line)!,e=l.columns[g.existing],xg=r.grids[g.grid],sg=g.line==='A'?1:-1;
 const col=r.columns[g.grid],ftg=r.footings[g.grid],plate:PlanBox={x0:xg-b.plate.B/2,x1:xg+b.plate.B/2,u0:-b.plate.N/2,u1:b.plate.N/2};
 const boxes=[ftg,col,plate,e.column,...(e.footing?[e.footing]:[])];
 const x0=Math.min(...boxes.map(v=>v.x0)),x1=Math.max(...boxes.map(v=>v.x1)),u0=Math.min(...boxes.map(v=>v.u0)),u1=Math.max(...boxes.map(v=>v.u1));
 // Labels in a column on the left, the geometry, then three dimension strings and the bubble on the right.
 // The footing clear, a short string, reads beside its dimension line: the steel string stands beyond that text.
 const footText=e.footing?textWidth(`${dim(planClear(r.footings[g.grid],e.footing))} CLR.`,8):0,gap1=Math.max(64,footText+28);
 const labelW=124,dimsW=gap1+86,noteH=34,titleH=44;
 const scale=sheetDrawingScale(Math.min((box.w-labelW-dimsW)/(x1-x0),(box.h-noteH-titleH-80)/(u1-u0)),u,contentScale),k=scale.pointsPerMm;
 const gx=box.x+labelW+((box.w-labelW-dimsW)-(x1-x0)*k)/2,X=(x:number)=>gx+(x-x0)*k;
 // Centred in the box from the upper bubble to the view title.
 const along=Math.abs(((e.column.x0+e.column.x1)/2)-xg)>=1,across=(u1-u0)*k,height=32+across+22+(along?18:0)+noteH+titleH;
 const top=box.y+32+Math.max(0,(box.h-height)/2),Y=(v:number)=>sg>0?top+(v-u0)*k:top+(u1-v)*k;
 const ys=(v:PlanBox):[number,number]=>[Math.min(Y(v.u0),Y(v.u1)),Math.max(Y(v.u0),Y(v.u1))];
 const outline=(v:PlanBox,cls:string)=>{const [a,bb]=ys(v);return rect(X(v.x0),a,(v.x1-v.x0)*k,bb-a,cls);};
 let svg=`<g data-view="existing-clearance-plan">`;
 const right=X(x1),left=X(x0),inboard=Y(u0),outboardY=Y(u1);
 // Grid lines: the runway grid line across the plan with its bubble, the runway grid through the new column, the
 // existing column line.
 const gridEnd=right+dimsW-24;
 svg+=line([left-8,Y(0)],[gridEnd,Y(0)],'grid-line')+bubble(gridEnd+11,Y(0),g.line,11);
 svg+=line([X(xg),inboard-sg*8],[X(xg),outboardY+sg*8],'grid-line')+bubble(X(xg),inboard-sg*20,String(g.grid+1),11);
 const ul=l.input.offset;svg+=line([left-8,Y(ul)],[gridEnd,Y(ul)],'grid-line')+text(gridEnd+2,Y(ul)+3,'(E) C/L',7.5);
 // New work: column, base plate (solid) and footing below the slab (hidden); existing column and footing dashed.
 svg+=outline(ftg,'hidden-line')+outline(plate,'runway-line')+wAcross(X(xg),Y(0),c.d,c.bf,c.tf,c.tw,k,'runway-line');
 const shape=aiscShapeByName(l.input.shape),ex=(e.column.x0+e.column.x1)/2;
 svg+=shape?wAcross(X(ex),Y(ul),l.input.d,l.input.bf,shape.tf*25.4,shape.tw*25.4,k,'reference-line'):outline(e.column,'reference-line');
 if(e.footing)svg+=outline(e.footing,'reference-line');
 // Dimensions across the runway, from the plan out: footing clear, steel clear, existing column line from the grid.
 // Each string is shorter than the one beyond it, so no extension line crosses a dimension line.
 const vdim=(a:{u:number;from:number},bb:{u:number;from:number},x:number,label:string)=>{
  const y1=Y(a.u),y2=Y(bb.u),w=textWidth(label,9),fits=w+6<=Math.abs(y2-y1),lo=Math.min(y1,y2),hi=Math.max(y1,y2);
  // A string too short for its text reads horizontally beside its dimension line, clear of the extension lines.
  return line([a.from,y1],[x+5,y1])+line([bb.from,y2],[x+5,y2])+line([x,lo],[x,hi])+[y1,y2].map(y=>line([x-3,y+2.5],[x+3,y-2.5])).join('')
   +(fits?text(x-6,(y1+y2)/2,label,9,'middle',400,-90):text(x+7,(y1+y2)/2+3,label,8));
 };
 // Faces that look at each other across the runway, when the two outlines overlap along it.
 const facing=(a:PlanBox,bb:PlanBox):[number,number]|undefined=>Math.max(a.x0,bb.x0)>=Math.min(a.x1,bb.x1)?undefined:bb.u0>=a.u1?[a.u1,bb.u0]:bb.u1<=a.u0?[a.u0,bb.u1]:undefined;
 const faceNew=g.part==='footing'?col:g.from,steelClear=planClear(faceNew,e.column),footClear=e.footing?planClear(ftg,e.footing):undefined;
 const d1=right+14,d2=d1+gap1,d3=d2+26,fs=facing(faceNew,e.column),ff=e.footing&&facing(ftg,e.footing);
 if(ff)svg+=vdim({u:ff[0],from:X(ftg.x1)+2},{u:ff[1],from:X(e.footing!.x1)+2},d1,`${dim(footClear!)} CLR.`);
 if(fs)svg+=vdim({u:fs[0],from:X(faceNew.x1)+2},{u:fs[1],from:X(e.column.x1)+2},d2,`${dim(steelClear)} CLR.`);
 svg+=vdim({u:0,from:d1+8},{u:ul,from:d1+8},d3,dim(Math.abs(ul)));
 // Along the runway: the existing column from the runway grid where the survey puts it off the grid.
 if(along)svg+=dimH(X(xg),X(ex),outboardY+sg*4,outboardY+sg*22,dim(Math.abs(ex-xg)));
 // Callouts on the left, top to bottom in the order of their targets.
 const size=(L:number,B:number)=>Math.abs(L-B)<1?`${dim(L)} SQ.`:`${dim(L)} X ${dim(B)}`;
 const items:{at:XY;labels:string[]}[]=[
  {at:[X(col.x0),Y(-(c.d/2-c.tf/2))],labels:[`NEW ${p.existingColumn!.shape||'BUILT-UP'} COL.`,`SEE ${detailRef(detailTitles.newColumn)}`]},
  {at:[X(plate.x0),Y(-b.plate.N*.42)],labels:['BASE PL',`SEE ${detailRef(detailTitles.basePlate)}`]},
  {at:[X(ftg.x0),Y(-ft.L*.3)],labels:[`NEW ${size(ft.L,ft.B)} FTG.`,`SEE ${detailRef('FOOTING / PLAN')}`]},
  {at:[X(e.column.x0),Y(ul)],labels:[l.input.shape?`(E) ${l.input.shape} COL.`:'(E) COLUMN']},
  ...(e.footing?[{at:[X(e.footing.x0),Y(e.footing.u1-(e.footing.u1-e.footing.u0)*.25)] as XY,labels:[`(E) ${size(l.input.footing.L,l.input.footing.B)} FTG.`]}]:[])
 ];
 svg+=labelColumn(items,box.x,Math.min(inboard,outboardY)-4,Math.max(inboard,outboardY)+4);
 // The clear distances against their limits, under the plan.
 const sep=s.bracingSystem?.separation,ny=Math.max(inboard,outboardY)+22+(along&&sg>0?18:0)+(sg<0?24:0);
 const cx=(left+right)/2,notes=[
  `STEEL CLR. ${dim(steelClear)}${sep?`, SEISMIC SEP. ${dim(specifiedSeparation(sep.required,u))} MIN.`:''}`,
  ...(footClear!==undefined?[`FOOTING CLR. ${dim(footClear)}, ${dim(r.footingClear)} MIN.`]:[]),
  `LEAST CLEARANCE AT GRID ${g.grid+1}${g.line}; (E) PER SURVEY`
 ];
 notes.forEach((v,i)=>{svg+=text(cx,ny+i*11,v,8,'middle');});
 svg+=viewTitle(cx,ny+notes.length*11+24,existingClearanceTitle,scale.label,contentScale);
 return svg+'</g>';
}

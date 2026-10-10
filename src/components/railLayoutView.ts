import type {CalculationSnapshot} from '../engine/types';
import {railLayout,railLayoutCriteria} from '../engine/railLayout';
import {drawingLength} from './drawingFormat';
import {sheetDrawingScale as drawingScale,line,rect,text,dimH,bubble,wrappedText,textWidth,detailRef,detailTitles} from './sheetGraphics';
import type {DetailView} from './detailSheet';

/**
 * Rail joint layout in plan: both runway rails along the grids with their girder joints, each rail piece
 * and each joint located from its nearest grid. Lengths along the runway are to scale; the runways are
 * drawn closer together than the crane span.
 */
export function railLayoutView(s:CalculationSnapshot):DetailView{
 return {title:detailTitles.railLayout,render:()=>{
  const p=s.input,r=railLayout(p),{stock,clear}=railLayoutCriteria,dim=(v:number)=>drawingLength(v,p.units);
  let x=0;const grids=[0,...p.spans.map(v=>x+=v)];
  const lo=Math.min(0,...r.rails.map(v=>v.start)),hi=Math.max(grids.at(-1)!,...r.rails.map(v=>v.end));
  const scale=drawingScale(Math.min(.06,520/(hi-lo)),p.units),k=scale.pointsPerMm,x0=80,X=(v:number)=>x0+(v-lo)*k;
  // Runway B above runway A, as on the runway plan.
  const yb=0,rows={B:70,A:170} as const,boxes:[number,number,number,number][]=[];
  let svg='<g data-view="rail-layout">';
  // Dimension with its text box kept, so grid lines can be broken around the text.
  const dimension=(x1:number,x2:number,from:number,y:number,label:string,outside:'left'|'right'='right')=>{
   const w=textWidth(label,9),fits=w+6<=Math.abs(x2-x1),a=Math.min(x1,x2),b=Math.max(x1,x2);
   const left=fits?(a+b)/2-w/2:outside==='right'?b+4:a-4-w;
   boxes.push([left-2,left+w+2,y-12,y-2]);
   return dimH(x1,x2,from,y,label,outside);
  };
  for(const rail of r.rails){
   const y=rows[rail.side],up=rail.side==='B',stations=[rail.start,...rail.joints,rail.end];
   svg+=text(x0-12,y+3,`GRID ${rail.side}`,8.5,'end',700);
   // Girders broken at their joints; the rail broken at its own joints with joint bars across.
   const L=grids.at(-1)!,cuts=[0,...(p.system==='simple'?grids.slice(1,-1):[]),L];
   for(let i=1;i<cuts.length;i++)svg+=rect(X(cuts[i-1])+(i>1?1:0),y-4,X(cuts[i])-X(cuts[i-1])-(i>1?1:0)-(i<cuts.length-1?1:0),8,'runway-line');
   // Existing girders of a continued runway, dashed, as far as the new rail runs onto them.
   if(r.existing.left)svg+=rect(X(lo)-6,y-4,X(0)-X(lo)+5,8,'reference-line');
   if(r.existing.right)svg+=rect(X(L)+1,y-4,X(hi)-X(L)+5,8,'reference-line');
   for(let i=1;i<stations.length;i++)svg+=line([X(stations[i-1])+(i>1?1.2:0),y],[X(stations[i])-(i<stations.length-1?1.2:0),y],'rail-line');
   for(const j of rail.joints)svg+=rect(X(j)-4,y-2.2,8,4.4,'runway-line');
   // Pieces on the outer side, joints from the nearest grid on the inner side.
   const outer=up?y-30:y+32,inner=up?y+26:y-24,fromOuter=up?y-6:y+6,fromInner=up?y+6:y-6;
   const chain=[0,...stations,grids.at(-1)!].filter((v,i,a)=>i===0||Math.abs(v-a[i-1])>1);
   for(let i=1;i<chain.length;i++)svg+=dimension(X(chain[i-1]),X(chain[i]),fromOuter,outer,dim(Math.abs(chain[i]-chain[i-1])),i===1?'left':'right');
   for(const j of rail.joints){
    const g=grids.reduce((a,b)=>Math.abs(b-j)<Math.abs(a-j)?b:a);
    svg+=dimension(X(g),X(j),fromInner,inner,dim(Math.abs(j-g)),j<g?'left':'right');
   }
  }
  // Grid lines through both runways, broken where dimension text crosses them.
  for(const [i,g] of grids.entries()){
   const gx=X(g),cuts=boxes.filter(b=>gx>b[0]&&gx<b[1]).map(b=>[b[2],b[3]] as const).sort((a,b)=>a[0]-b[0]);
   let from=yb+8;
   for(const [a,b] of cuts){if(a>from)svg+=line([gx,from],[gx,a],'grid-line');from=Math.max(from,b);}
   svg+=line([gx,from],[gx,rows.A+44],'grid-line')+bubble(gx,yb,String(i+1));
  }
  const steps=r.wheelSteps.filter(v=>v>0).map(dim).join(', ');
  const notes=[
   `RAIL PIECES ${dim(stock)} MAX. (MILL LENGTH); FIELD CUT THE SHORTER PIECES SHOWN. KEEP RAIL JOINTS ${dim(clear)} MIN. FROM GIRDER JOINTS AND FROM THE OPPOSITE RAIL JOINTS, AND OPPOSITE JOINTS ${dim(clear)} MIN. FROM ANY CRANE WHEEL SPACING${steps?` (${steps})`:''}.`,
   `BOLTED RAIL JOINTS AND KEEPERS EACH SIDE OF EVERY JOINT: ${detailRef(detailTitles.railKeeper)}. RUNWAYS ARE DRAWN CLOSER THAN THE CRANE SPAN.`,
   ...(['left','right'] as const).filter(e=>r.existing[e]).map(e=>`AT GRID ${e==='left'?1:grids.length} JOIN THE EXISTING RAIL: CUT IT BACK TO ${dim(clear)} BEYOND THE GRID. FIELD VERIFY ITS SECTION AND JOINTS.`)
  ];
  let y=rows.A+58;
  for(const n of notes){const w=wrappedText(x0-60,y,n,120,8,11);svg+=w.svg;y+=w.height+3;}
  return {svg:svg+'</g>',scale:`${scale.label} ALONG RUNWAY`};
 }};
}

import type {CalculationSnapshot} from '../engine/types';
import {railLayout,railLayoutCriteria,railMovements,railJointMovement,railJointType,railJointGap,railJointDetail} from '../engine/railLayout';
import {railAnchorForce} from '../engine/railClip';
import {railClipStations} from '../engine/simpleSupports';
import {activeEndStop} from '../engine/endStopInputs';
import {format} from '../engine/units';
import {drawingLength,plateInches,dimensionLength} from './drawingFormat';
import {sheetDrawingScale as drawingScale,line,rect,text,dimH,bubble,wrapToWidth,textWidth,detailRef,detailTitles,labelCaps,n,lettering} from './sheetGraphics';
import type {DetailView} from './detailSheet';

/**
 * Rail joint layout in plan: both runway rails along the grids with their girder joints, each rail piece
 * and each joint located from its nearest grid. Lengths along the runway are to scale; the runways are
 * drawn closer together than the crane span.
 */
/** A factored force to 0.1 kip or 0.1 kN. */
const labelForce=(N:number,u:'US'|'SI')=>labelCaps(format(N,'force',u,1));
/** A movement stated as a limit, rounded up: to the next 1/32 in, or the next millimeter. */
export function movementUpTo(mm:number,u:'US'|'SI'){
 if(u==='SI')return `${Math.max(1,Math.ceil(mm-1e-6))} mm`;
 let num=Math.max(1,Math.ceil(mm/25.4*32-1e-6)),den=32;const whole=Math.floor(num/den);num%=den;
 while(num&&num%2===0){num/=2;den/=2;}
 return `${whole?whole:''}${whole&&num?' ':''}${num?`${num}/${den}`:''}"`;
}
export function railLayoutView(s:CalculationSnapshot):DetailView{
 return {title:detailTitles.railLayout,render:()=>{
  const p=s.input,r=railLayout(p),{stock,clear}=railLayoutCriteria,dim=(v:number)=>dimensionLength(v,p.units),moves=p.details?railMovements(p,r):undefined,jointKind=railJointDetail(p,r);
  let x=0;const grids=[0,...p.spans.map(v=>x+=v)];
  const lo=Math.min(0,...r.rails.map(v=>v.start)),hi=Math.max(grids.at(-1)!,...r.rails.map(v=>v.end));
  const scale=drawingScale(Math.min(.06,520/(hi-lo)),p.units),k=scale.pointsPerMm,x0=80,X=(v:number)=>x0+(v-lo)*k;
  // Runway B above runway A, as on the runway plan.
  const rows={B:70,A:170} as const,boxes:[number,number,number,number][]=[];
  let svg='<g data-view="rail-layout">';
  // Dimension with its text box kept, so grid lines can be broken around the text.
  const extensions:[number,number,number][]=[];
  const dimension=(x1:number,x2:number,from:number,y:number,label:string,outside:'left'|'right'='right')=>{
   boxes.push(textBox(x1,x2,y,label,outside));
   for(const x of [x1,x2])extensions.push([x,Math.min(from,y),Math.max(from,y)+5]);
   return dimH(x1,x2,from,y,label,outside);
  };
  // Box of a dimension value: centered between the extension lines where it fits, else carried beyond the far one.
  const textBox=(x1:number,x2:number,y:number,label:string,outside:'left'|'right'):[number,number,number,number]=>{
   const w=textWidth(label,lettering.text),a=Math.min(x1,x2),b=Math.max(x1,x2),left=w+6<=b-a?(a+b)/2-w/2:outside==='right'?b+4:a-4-w;
   return [left-2,left+w+2,y-lettering.text-3,y-2];
  };
  // A value whose text would overlap one already placed reads beyond its other end, or one tier further from its rail
  // where its extension lines pass clear of the values already placed.
  // `stations`: where the chain's other extension lines will stand, which a value carried along the first tier keeps clear of.
  const placed=(x1:number,x2:number,from:number,tiers:number[],label:string,side:'left'|'right',stations:number[]=[])=>{
   // Clear: its value off the values and extension lines already placed, and its extension lines off those values.
   const clear=(y:number,outside:'left'|'right')=>{const [a,b,c,d]=textBox(x1,x2,y,label,outside),lo=Math.min(from,y),hi=Math.max(from,y)+5;
    return !boxes.some(v=>v[0]<b&&a<v[1]&&v[2]<d&&c<v[3])&&!boxes.some(v=>[x1,x2].some(x=>x>v[0]&&x<v[1])&&v[2]<hi&&lo<v[3])
     &&!extensions.some(([x,e0,e1])=>x>a&&x<b&&e0<d&&c<e1)&&!(y===tiers[0]&&stations.some(x=>x>a&&x<b));};
   const flip=side==='left'?'right':'left',options=tiers.flatMap(y=>[[y,side],[y,flip]] as [number,'left'|'right'][]);
   const [y,outside]=options.find(([y,o])=>clear(y,o))??options[0];
   return dimension(x1,x2,from,y,label,outside);
  };
  const tier=lettering.text+4;
  for(const rail of r.rails){
   const y=rows[rail.side],up=rail.side==='B',stations=[rail.start,...rail.joints,rail.end];
   svg+=text(x0-12,y+3,`GRID ${rail.side}`,lettering.text,'end',700);
   // Girders broken at their joints; the rail broken at its own joints with joint bars across.
   const L=grids.at(-1)!,cuts=[0,...(p.system==='simple'?grids.slice(1,-1):[]),L];
   for(let i=1;i<cuts.length;i++)svg+=rect(X(cuts[i-1])+(i>1?1:0),y-4,X(cuts[i])-X(cuts[i-1])-(i>1?1:0)-(i<cuts.length-1?1:0),8,'runway-line');
   // Existing girders of a continued runway, dashed, as far as the new rail runs onto them.
   if(r.existing.left)svg+=rect(X(lo)-6,y-4,X(0)-X(lo)+5,8,'reference-line');
   if(r.existing.right)svg+=rect(X(L)+1,y-4,X(hi)-X(L)+5,8,'reference-line');
   for(let i=1;i<stations.length;i++)svg+=line([X(stations[i-1])+(i>1?1.2:0),y],[X(stations[i])-(i<stations.length-1?1.2:0),y],'rail-line');
   // Joint bars across a bolted joint; a welded joint (by the rail supplier) is the break in the rail line alone.
   if(jointKind==='bars')for(const j of rail.joints)svg+=rect(X(j)-4,y-2.2,8,4.4,'runway-line');
   // Rail clip pairs: a short tick each side of the rail at every clip station.
   const clips=railClipStations(p).filter(v=>v>=rail.start-1e-6&&v<=rail.end+1e-6);
   for(const c of clips)svg+=line([X(c),y-6.5],[X(c),y-2.5],'runway-line')+line([X(c),y+2.5],[X(c),y+6.5],'runway-line');
   // Open joints: an anchor clip pair at mid-length of each rail piece, a solid triangle on the inner side of the rail.
   const anchors=moves?.anchors.find(v=>v.side===rail.side)?.anchors??[];
   for(const a of anchors){const ax=X(a.station),tip=up?y+3.5:y-3.5,base=up?y+10:y-10;svg+=`<path class="annotation" data-rail-anchor="${rail.side}" style="fill:#111" d="M${n(ax)},${n(tip)}L${n(ax-3.5)},${n(base)}L${n(ax+3.5)},${n(base)}Z"/>`;}
   // Pieces on the outer side, joints from the nearest grid on the inner side, each value in the first tier from its rail
   // where it reads clear of the values already placed.
   const outer=up?y-30:y+32,inner=up?y+26:y-24,fromOuter=up?y-6:y+6,fromInner=up?y+6:y-6;
   const chain=[0,...stations,grids.at(-1)!].filter((v,i,a)=>i===0||Math.abs(v-a[i-1])>1);
   for(let i=1;i<chain.length;i++)svg+=placed(X(chain[i-1]),X(chain[i]),fromOuter,[0,1,2,3].map(t=>outer+(up?-tier:tier)*t),dim(Math.abs(chain[i]-chain[i-1])),i===1?'left':'right',chain.map(X));
   for(const j of rail.joints){
    const g=grids.reduce((a,b)=>Math.abs(b-j)<Math.abs(a-j)?b:a);
    svg+=placed(X(g),X(j),fromInner,[0,1,2].map(t=>inner+(up?tier:-tier)*t),dim(Math.abs(j-g)),j<g?'left':'right',rail.joints.flatMap(v=>[X(v),X(grids.reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a))]));
   }
  }
  // Grid lines through both runways, broken where dimension text crosses them; their bubbles above the highest value.
  const yb=Math.min(0,...boxes.map(b=>b[2]-14));
  for(const [i,g] of grids.entries()){
   const gx=X(g),cuts=boxes.filter(b=>gx>b[0]&&gx<b[1]).map(b=>[b[2],b[3]] as const).sort((a,b)=>a[0]-b[0]);
   let from=yb+8;
   for(const [a,b] of cuts){if(a>from)svg+=line([gx,from],[gx,a],'grid-line');from=Math.max(from,b);}
   svg+=line([gx,from],[gx,rows.A+44],'grid-line')+bubble(gx,yb,String(i+1));
  }
  const steps=r.wheelSteps.filter(v=>v>0).map(dim).join(', ');
  const notes=[
   `RAIL PIECES ${dim(stock)} MAX. (MILL LENGTH); ${jointKind==='none'?'EACH RAIL IS ONE PIECE (NO RAIL JOINT); SAW-CUT IT TO LENGTH, NO FLAME CUTTING.':`SAW-CUT THE SHORTER PIECES SHOWN, NO FLAME CUTTING. KEEP RAIL JOINTS ${dim(clear)} MIN. FROM GIRDER JOINTS AND FROM THE OPPOSITE RAIL JOINTS, AND OPPOSITE JOINTS ${dim(clear)} MIN. FROM ANY CRANE WHEEL SPACING${steps?` (${steps})`:''}.`}`,
   `RAIL CLIP PAIRS (TICKS) AT ${dim(p.aist?.clipSpacing??0)} O.C. MAX., ${jointKind==='none'?'':'A PAIR EACH SIDE OF EVERY JOINT; '}CLIPS: ${detailRef(detailTitles.railKeeper)}${jointKind==='bars'?`; JOINTS: ${detailRef(detailTitles.railJoint)}`:jointKind==='welded'?'; JOINTS THERMITE OR FLASH-BUTT WELDED BY THE RAIL SUPPLIER (WELDING NOTES)':''}. RUNWAYS DRAWN CLOSER THAN THE CRANE SPAN.`,
   ...(moves?[(()=>{const F=railAnchorForce(p),stop=activeEndStop(p),u=p.units,gap=railJointGap(p),endMove=Math.max(0,...moves.ends.filter(v=>!v.existing).map(v=>v.movement));
    return railJointType(p)==='tight'
     ?`RAIL ANCHORAGE: FLOATING RAIL CLIPS, NO RAIL-SEAT FRICTION RELIED ON. TRACTION AND BRAKING (${labelForce(F.force,u)} FACTORED) REACH THE GIRDER UNDER THE WHEELS OR, AFTER RAIL CREEP, THROUGH AN END STOP${stop?` (${detailRef(detailTitles.endStop)})`:''}; BOTH PATHS ARE DESIGNED. ${jointKind==='bars'?`TIGHT RAIL JOINTS PER ${detailRef(detailTitles.railJoint)} (GAP AND RE-TIGHTENING THERE), STAGGERED AS SHOWN. `:jointKind==='welded'?'WELDED RAIL JOINTS, STAGGERED AS SHOWN. ':''}THE RAIL STRING MOVES THERMALLY UP TO ${movementUpTo(endMove,u)} INTO THE CLEARANCE GAP AT AN END STOP. AT EACH PERIODIC CRANE INSPECTION CHECK THE RAIL ENDS AT THE STOPS FOR CREEP.`
     :`RAIL ANCHORS, SOLID TRIANGLES: AT MID-LENGTH OF EACH RAIL PIECE AN ANCHOR CLIP PAIR (FIXED CLIPS PER MANUFACTURER, ${detailRef(detailTitles.railKeeper)}) TAKES THE CRANE LONGITUDINAL FORCE (TRACTION AND BRAKING, ${labelForce(F.force,u)} FACTORED) AND RAIL CREEP INTO THE GIRDER. ALL OTHER CLIPS ARE FLOATING; EACH PIECE MOVES THERMALLY FROM ITS ANCHOR, UP TO ${movementUpTo(railJointMovement(moves),u)} AT A JOINT (OPEN JOINTS, ${u==='SI'?`${Math.round(gap*2)/2} mm`:plateInches(gap,u)} GAP). RE-TIGHTEN THE JOINT BOLTS AFTER 30 AND 90 DAYS OF OPERATION. AT EACH PERIODIC CRANE INSPECTION CHECK THE JOINT GAPS AND THE RAIL ENDS AT THE STOPS FOR CREEP.`;})()]:[]),
   ...(['left','right'] as const).filter(e=>r.existing[e]).map(e=>`AT GRID ${e==='left'?1:grids.length} JOIN THE EXISTING RAIL: CUT IT BACK TO ${dim(clear)} BEYOND THE GRID. FIELD VERIFY ITS SECTION AND JOINTS.`)
  ];
  // The notes start below the lowest dimension value.
  let y=Math.max(rows.A+58,...boxes.map(b=>b[3]+lettering.noteLeading+4));
  // Notes wrapped to the measured width of the plan, a value kept on one line with its unit.
  for(const v of notes){const rows=wrapToWidth(labelCaps(v).replace(/(\d) mm\b/g,'$1\u0001mm'),600,lettering.text);svg+=rows.map((row,i)=>text(x0-60,y+i*lettering.noteLeading,row.replaceAll('\u0001',' '),lettering.text)).join('');y+=rows.length*lettering.noteLeading+3;}
  return {svg:svg+'</g>',scale:`${scale.label} ALONG RUNWAY`};
 }};
}

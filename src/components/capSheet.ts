import {girderSegments} from '../engine/simpleSupports';
import type {CalculationSnapshot} from '../engine/types';
import {format} from '../engine/units';
import {drawingLength,plateInches} from './drawingFormat';
import {sheetDrawingScale as drawingScale,sheetStart,titleBlock,rect,line,text,dimH,dimV,viewTitle,multiLeader,filletLeader,wrappedText} from './sheetGraphics';

export function capSheetSvg(s:CalculationSnapshot){
 const p=s.input,b=p.section,c=p.capDesign!,r=p.details!.rail,dim=(v:number)=>drawingLength(v,p.units),size=(v:number)=>plateInches(v,p.units);
 let svg=sheetStart(s,'S-03','CRANE RUNWAY / CAP CHANNEL ATTACHMENT');
 svg+=line([612,76],[612,510],'divider')+line([24,510],[1200,510],'divider');
 const scale=drawingScale(Math.min(270/(b.d+b.capTw+p.aist!.railDepth),190/b.capWidth),p.units),k=scale.pointsPerMm,cx=205,y=195;
 const left=cx-b.bf*k/2,right=cx+b.bf*k/2;
 svg+='<g data-view="cap-section">';
 svg+=rect(left,y,b.bf*k,b.tf*k,'runway-line')+rect(cx-b.tw*k/2,y+b.tf*k,b.tw*k,(b.d-2*b.tf)*k,'runway-line')+rect(left,y+(b.d-b.tf)*k,b.bf*k,b.tf*k,'runway-line');
 svg+=rect(cx-b.capWidth*k/2,y-b.capTw*k,b.capWidth*k,b.capTw*k,'runway-line');
 for(const sign of [-1,1])svg+=rect(cx+sign*b.capWidth*k/2-(sign>0?b.capTf*k:0),y,b.capTf*k,(b.capDepth-b.capTw)*k,'runway-line');
 const ry=y-b.capTw*k-p.aist!.railDepth*k,rx=cx+p.railEccentricity*k;
 svg+=rect(rx-r.headWidth*k/2,ry,r.headWidth*k,r.headThickness*k,'rail-line')+rect(rx-r.webThickness*k/2,ry+r.headThickness*k,r.webThickness*k,(p.aist!.railDepth-r.headThickness-r.baseThickness)*k,'rail-line')+rect(rx-r.baseWidth*k/2,y-(b.capTw+r.baseThickness)*k,r.baseWidth*k,r.baseThickness*k,'rail-line');
 for(const sign of [-1,1]){const wx=cx+sign*b.bf*k/2,w=c.weldSize*k;svg+=`<path class="runway-line" d="M${wx},${y}l${sign*w},0l${-sign*w},${w}Z"/>`;}
 svg+=dimH(cx-b.capWidth*k/2,cx+b.capWidth*k/2,y-b.capTw*k,91,dim(b.capWidth));
 svg+=dimV(y,y+b.d*k,left,72,dim(b.d));
 // Each callout uses its own corridor; one arrow + EACH SIDE avoids crossings.
 svg+=multiLeader([[rx+r.headWidth*k/2,ry+r.headThickness*k/2]],[365,124],['RAIL / KEEPERS PER S-02']);
 svg+=multiLeader([[cx+b.capWidth*k/2,y-b.capTw*k/2]],[365,168],[`${b.capCatalogueId} CAP CHANNEL`,`ASTM GRADE PER CALCULATIONS`]);
 svg+=filletLeader([[right,y]],[365,225],size(c.weldSize),['CONTINUOUS / EACH SIDE','FULL MEMBER LENGTH'],false,[[[right+20,y+17],[338,210]]]);
 svg+=multiLeader([[cx+b.tw*k/2,y+b.d*k*.60]],[365,322],[`${b.catalogueId} RUNWAY GIRDER`]);
 svg+=text(306,443,'CHANNEL WEB TO BEAR FULLY ON W TOP FLANGE',9,'middle',700);
 svg+=text(306,461,'NO INTERMITTENT WELDS / NO UNAPPROVED FIT-UP GAPS',8.5,'middle');
 svg+=viewTitle(306,484,'CAPPED GIRDER SECTION',scale.label)+'</g>';
 const length=Math.min(...girderSegments(p).map(m=>m.end-m.start)),es=drawingScale(Math.min(490/length,160/b.d),p.units),ek=es.pointsPerMm,ex=665,ey=220,end=ex+length*ek;
 svg+='<g data-view="cap-development">';
 svg+=rect(ex,ey,length*ek,b.d*ek,'runway-line')+line([ex,ey+b.tf*ek],[end,ey+b.tf*ek],'runway-line')+line([ex,ey+(b.d-b.tf)*ek],[end,ey+(b.d-b.tf)*ek],'runway-line');
 svg+=rect(ex,ey-b.capTw*ek,length*ek,b.capTw*ek,'runway-line');
 svg+=line([ex,ey+(b.capDepth-b.capTw)*ek],[end,ey+(b.capDepth-b.capTw)*ek],'runway-line');
 svg+=dimH(ex,end,ey+b.d*ek,345,dim(length));
 svg+=dimH(ex,ex+c.developmentLength*ek,ey-8,185,dim(c.developmentLength));
 svg+=dimH(end-c.developmentLength*ek,end,ey-8,185,dim(c.developmentLength));
 svg+=text((ex+end)/2,157,'MINIMUM CAP FORCE DEVELOPMENT / EACH END',9,'middle',700);
 svg+=text((ex+end)/2,ey+b.d*ek+19,b.name,9,'middle',700);
 svg+=text(906,380,p.system==='continuous'?'CAP CONTINUOUS THROUGH INTERIOR SUPPORTS':'REPEAT AT EACH SIMPLY SUPPORTED MEMBER',9,'middle');
 svg+=text(906,398,'CONTINUOUS WELDS EXTEND THROUGH DEVELOPMENT REGIONS',8.5,'middle');
 svg+=viewTitle(906,484,'CAP END DEVELOPMENT',es.label)+'</g>';
 const notes=[
  `PROVIDE ${size(c.weldSize)} CONTINUOUS FILLETS AT BOTH W TOP-FLANGE EDGES. WELD METAL ${format(c.Fexx,'stress',p.units).toUpperCase()}. NO WELD STRENGTH INCREASE FOR DIRECTION IS CREDITED.`,
  'STRAIGHTEN AND FIT CHANNEL BEFORE WELDING. VERIFY FULL CONTACT ALONG THE W TOP FLANGE. DO NOT FORCE A GAPPED CAP INTO SERVICE; REFER FIT-UP DISCREPANCIES TO THE ENGINEER.',
  'CHANNEL AND W TOP FLANGE SHALL BE UNPERFORATED. DO NOT ADD TEMPORARY ATTACHMENTS OR CHANGE KEEPER WELDS WITHOUT FATIGUE REVIEW.',
  'BEARING STIFFENERS: CJP WELD TO W TOP FLANGE; FIT BOTTOM END. CONTINUOUS WEB WELDS AS DETAILED ON S-02. INSPECT CJP WELDS PER PROJECT SPECIFICATION.',
  `CRANE SERVICE CLASS: CMAA ${c.cmaaClass}. CAP CHANNEL DETAILS ARE NOT APPLICABLE TO CMAA E/F SERVICE. REFERENCE AIST TECHNICAL REPORT 13 AND AISC DESIGN GUIDE 7.`,
 ];
 let ny=535;for(const [i,note] of notes.entries()){const w=wrappedText(42,ny,`${i+1}. ${note}`,185,8.5,11);svg+=w.svg;ny+=w.height+5;}
 return svg+titleBlock(s,'S-03','CAP CHANNEL & WELD DEVELOPMENT')+'</svg>';
}

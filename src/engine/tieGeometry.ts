import type {ProjectInput} from './types';
import {independentBearings} from './simpleSupports';
import {tieArrangement} from './connectionOptions';
/** Shared fabrication coordinates, mm. The flange saddle bypasses the web.
 * Flexibility/column movement is a separate interface design, not inferred here. */
export function flangeTieGeometry(p:ProjectInput){
 const d=p.details,a=d?.brace.flangeAttachment;
 if(!d||tieArrangement(d)!=='paired-bars'||!a?.enabled||p.system!=='simple'||!d.bracket?.enabled)return undefined;
 const b=p.section,t=d.brace,c=t.connection,face=d.bracket.reach;
 const start=face-t.length,connection=(c.rows-1)*c.pitch+2*c.edge;
 const rootStart=b.tw/2+a.webGap,rootEnd=b.bf/2,rootLength=rootEnd-rootStart;
 const topClear=Math.max(a.saddleThickness,b.kind==='cap'?b.capDepth-b.capTw-b.tf:0)+a.clearance;
 const bottomClear=a.saddleThickness+a.clearance;
 return {attachment:a,face,start,connection,rootStart,rootEnd,rootLength,
  topDrop:topClear+t.width/2,bottomDrop:bottomClear+t.width/2,
  topCenter:b.d/2-b.tf-topClear-t.width/2,bottomCenter:-b.d/2+b.tf+bottomClear+t.width/2,
  gussetEnd:start+connection,freeLength:t.length-2*connection,
  stations:independentBearings(p).map(e=>({...e,tieX:e.center+(e.end==='left'?-1:1)*a.longitudinalSetback}))};
}

import {boxDistance,inPolygon,partMatches,segmentDistance,segmentHitsBox,segmentsCross,type FigureLayout} from '../../src/report/hairline/scene';

/**
 * What is wrong with a figure's markers: a leader that does not end on the part its marker names, leaders that
 * cross, circles that overlap each other or a label, and leaders through another circle or a label.
 */
export function markerProblems(L:FigureLayout,name:string){
 const out:string[]=[],m=L.markers,d=(a:[number,number],b:[number,number])=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 const edge=(k:typeof m[number])=>{const L2=d(k.anchor,k.center)||1;return [k.center[0]-(k.center[0]-k.anchor[0])*k.radius/L2,k.center[1]-(k.center[1]-k.anchor[1])*k.radius/L2] as [number,number];};
 for(const k of m){
  if(!k.part){out.push(`${name} ${k.n}: marker not tied to a part`);continue;}
  const solids=L.solids.filter(s=>partMatches(k.part!,s.part)),lines=[...L.paths.filter(p=>partMatches(k.part!,p.part)).map(p=>p.pts),...L.arrows.filter(a=>partMatches(k.part!,a.part)).map(a=>[a.from,a.to])];
  const onSolid=solids.some(s=>inPolygon(k.anchor,s.hull)||s.hull.some((a,i)=>segmentDistance(k.anchor,a,s.hull[(i+1)%s.hull.length])<1.5));
  const onLine=lines.some(pts=>pts.some((a,i)=>i+1<pts.length&&segmentDistance(k.anchor,a,pts[i+1])<2));
  if(!onSolid&&!onLine)out.push(`${name} ${k.n}: leader does not end on ${k.part}`);
  if(k.center[0]<k.radius||k.center[0]>L.width-k.radius||k.center[1]<k.radius||k.center[1]>L.height-k.radius)out.push(`${name} ${k.n}: circle outside the figure`);
 }
 for(let i=0;i<m.length;i++)for(let j=i+1;j<m.length;j++){
  const a=m[i],b=m[j];
  if(d(a.center,b.center)<a.radius+b.radius)out.push(`${name} ${a.n}/${b.n}: circles overlap`);
  if(a.leader&&b.leader&&segmentsCross(a.anchor,a.center,b.anchor,b.center))out.push(`${name} ${a.n}/${b.n}: leaders cross`);
 }
 for(const a of m){
  for(const b of m)if(b!==a&&a.leader&&segmentDistance(b.center,a.anchor,edge(a))<b.radius)out.push(`${name} ${a.n}: leader through circle ${b.n}`);
  for(const l of L.labels){
   if(boxDistance(a.center,l.box)<a.radius)out.push(`${name} ${a.n}: circle on label ${l.text}`);
   if(a.leader&&segmentHitsBox(a.anchor,edge(a),l.box))out.push(`${name} ${a.n}: leader through label ${l.text}`);
  }
 }
 return out;
}

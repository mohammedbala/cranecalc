import {describe,expect,it} from 'vitest';
import {calculate,validateProject} from '../src/engine/calculate';
import {demonstrationProject,cappedDemonstrationProject} from '../src/engine/demonstration';
import {endStopChecks,endStopGeometry,stopBumperForce,wrenchClearance} from '../src/engine/endStop';
import {defaultEndStop} from '../src/engine/endStopInputs';
import {endStopTopic,endStopSheetSvg} from '../src/components/endStopSheet';
import {railKeeperStations} from '../src/engine/simpleSupports';
import {boltCapacity} from '../src/engine/connectionStrength';
import {drawingSheetSet,detailReferences} from '../src/components/planSheet';
import {sheetsDxf} from '../src/components/sheetDxf';

const inch=25.4,kip=4448.2216152605;
const texts=(svg:string)=>[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'));
const demo=calculate(demonstrationProject());
type Seg=[[number,number],[number,number]];
const segments=(points:string):Seg[]=>{const p=points.split(' ').map(v=>v.split(',').map(Number) as [number,number]);return p.slice(1).map((q,i)=>[p[i],q]);};
// Least distance between two segments: zero when they cross or touch.
function segmentGap([a,b]:Seg,[c,d]:Seg){
 const o=(p:number[],q:number[],r:number[])=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));
 if(o(a,b,c)*o(a,b,d)<0&&o(c,d,a)*o(c,d,b)<0)return 0;
 const toSeg=(p:number[],[s,e]:Seg)=>{const dx=e[0]-s[0],dy=e[1]-s[1],L=dx*dx+dy*dy,t=L?Math.max(0,Math.min(1,((p[0]-s[0])*dx+(p[1]-s[1])*dy)/L)):0;return Math.hypot(p[0]-s[0]-t*dx,p[1]-s[1]-t*dy);};
 return Math.min(toSeg(a,[c,d]),toSeg(b,[c,d]),toSeg(c,[a,b]),toSeg(d,[a,b]));
}

describe('girder-mounted runway end stops',()=>{
 it('resolves the bumper overturning into front-bolt tension by hand',()=>{
  const p=demo.input,e=p.details!.endStop!,g=endStopGeometry(p,e),checks=Object.fromEntries(demo.checks.filter(c=>c.group==='End stops').map(c=>[c.id,c]));
  expect(stopBumperForce(p)).toBeCloseTo(20*kip,3);
  // LRFD stop combination factor 1.0; contact 6 in rail + 1/8 in pad + 6 in bumper - 1 in base plate.
  expect(g.contact).toBeCloseTo(11.125*inch,9);
  const lever=g.frontRow-g.back-e.base.thickness,T=20*kip*(g.contact+e.base.thickness)/(2*lever);
  expect(lever).toBeCloseTo((12.5-.5625-1-1.75-.5-1)*inch,9);
  expect(checks['end-stop-bolt-tension'].demand).toBeCloseTo(T,3);
  expect(checks['end-stop-bolt-shear'].demand).toBeCloseTo(5*kip,3);
  const bolt=boltCapacity({grade:'A325',diameter:.75*inch,planes:1,surface:'B',shear:5*kip,tension:T,method:'LRFD'});
  expect(checks['end-stop-bolt-tension'].capacity).toBeCloseTo(bolt.tension,3);
  expect(checks['end-stop-slip'].capacity).toBeCloseTo(bolt.slip,3);
  // Face plate between stiffeners: P s / 4 on a 6 in strip, 1 in thick.
  expect(checks['end-stop-face'].demand).toBeCloseTo(20*kip*3*inch/4/(6*inch*inch**2/6),4);
  expect(Object.values(checks).every(c=>c.status==='pass')).toBe(true);
  expect(demo.eligible).toBe(true);
 },240000);
 it('adds the bumper couple to the girder stop combinations',()=>{
  const g=demo.checks.find(c=>c.id==='end-stop-girder')!,lrfd8=demo.designAnalysis!.combinations.find(c=>c.id==='LRFD 8')!;
  expect(g.status).toBe('pass');expect(g.utilization).toBeGreaterThan(lrfd8.interaction);
  expect(lrfd8.axial).toBeCloseTo(20*kip,3);
 });
 it('flags bolts that clash with the bearing stiffeners or the face plate',()=>{
  const p=structuredClone(demo.input),e=p.details!.endStop!;
  // Back bolts moved over the bearing stiffener.
  e.setback=5*inch;
  const checks=endStopChecks(p),bearing=checks.find(c=>c.id==='end-stop-wrench-bearing')!;
  expect(bearing.status).toBe('fail');e.setback=7*inch;
  e.bolts.frontClear=.75*inch;expect(endStopChecks(p).find(c=>c.id==='end-stop-wrench-face')!.status).toBe('fail');
  expect(wrenchClearance(.75*inch)).toBeCloseTo(1.25*inch,9);expect(wrenchClearance(1*inch)).toBeCloseTo(1.6*inch,9);
  // A stop over the runway-end tie saddle puts its back nuts on the saddle.
  e.bolts.frontClear=1.75*inch;e.setback=.5*inch;expect(endStopChecks(p).find(c=>c.id==='end-stop-wrench-saddle')!.status).toBe('fail');
  expect(endStopChecks(p).some(c=>c.id==='end-stop-zone')).toBe(false);
 });
 it('keeps the bolt heads a socket clearance clear of the stop weld toes',()=>{
  const p=structuredClone(demo.input),e=p.details!.endStop!,g=endStopGeometry(p,e),w=e.weldSize,C=wrenchClearance(e.bolts.diameter);
  const ids=['end-stop-wrench-face','end-stop-wrench-stiffener'],check=(id:string)=>endStopChecks(p).find(c=>c.id===id)!;
  // Clearance runs to the toes of the face plate and stiffener fillets, not to the plate faces.
  expect(g.toe.face).toBeCloseTo(e.bolts.frontClear-w,9);expect(g.toe.stiffener).toBeCloseTo((e.bolts.gauge-e.stiffener.spacing-e.stiffener.thickness)/2-w,9);
  for(const id of ids){const c=demo.checks.find(v=>v.id===id)!;expect(c.status,id).toBe('pass');expect(c.demand).toBeCloseTo(C,9);}
  expect(demo.checks.find(c=>c.id==='end-stop-wrench-face')!.capacity).toBeCloseTo(g.toe.face,9);
  // 1 3/4 in behind the face plate, 7 in gauge about 3 in stiffener centers: 1 7/16 and 1 5/16 in to the toes.
  expect(g.toe.face/inch).toBeCloseTo(1.4375,9);expect(g.toe.stiffener/inch).toBeCloseTo(1.3125,9);
  // The layout the plan check found crowded: 1 1/4 in to the face plate and a 6 1/2 in gauge leave the heads
  // 15/16 in and 1 1/16 in from the weld toes.
  e.bolts.frontClear=1.25*inch;e.bolts.gauge=6.5*inch;
  for(const id of ids)expect(check(id).status,id).toBe('fail');
  expect(check('end-stop-wrench-face').capacity!/inch).toBeCloseTo(.9375,9);
  // The default stop and the capped stop pass on their own girders.
  const capped=cappedDemonstrationProject();for(const id of ids)expect(endStopChecks(capped).find(c=>c.id===id)!.status,id).toBe('pass');
  const d=structuredClone(demo.input);d.details!.endStop={...defaultEndStop,enabled:true,setback:7*inch,source:'x'};for(const id of ids)expect(endStopChecks(d).find(c=>c.id===id)!.status,id).toBe('pass');
 });
 it('draws the heavy hex heads, the face plate clearance and an uncrossed bolt callout on the stop plan',()=>{
  const t=endStopTopic(demo),[elevation,plan,section]=t.views.map(v=>v.render().svg);
  // Heads seen from above as hexagons, one per bolt; across corners in elevation and section.
  expect(plan.match(/<path class="runway-line" d="M[^"]*L[^"]*L[^"]*L[^"]*L[^"]*L[^"]*Z"\/>/g)).toHaveLength(4);
  expect(texts(plan)).toContain('0\'-1 3/4"');expect(texts(plan).join(' ')).toContain('HEADS ON BASE PL');
  expect(texts(elevation).join(' ')).toContain('HEADS UP, NUTS BELOW TOP FLANGE');expect(section).toContain('class="hidden-line"');
  // No callout leader crosses another, and none comes within 3 pt of the section cut marker.
  const leaders=[...plan.matchAll(/<g data-multileader="component"[^>]*>(.*?)<\/g>/gs)].map(m=>[...m[1].matchAll(/data-leader-path="true" points="([^"]+)"/g)].flatMap(r=>segments(r[1])));
  const cut=[...(plan.match(/<g data-section-cut="[^"]*">(.*?)<\/g>/s)?.[1]??'').matchAll(/<line[^>]*x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)].map(m=>[[+m[1],+m[2]],[+m[3],+m[4]]] as Seg);
  // Bolt, keeper and stiffener weld callouts, and the leaders to the two short dimensions at the face plate.
  expect(leaders.length).toBe(5);expect(cut.length).toBeGreaterThan(0);
  for(let i=0;i<leaders.length;i++){
   for(let j=i+1;j<leaders.length;j++)for(const a of leaders[i])for(const b of leaders[j])expect(segmentGap(a,b),`leaders ${i}/${j}`).toBeGreaterThan(3);
   for(const a of leaders[i])for(const b of cut)expect(segmentGap(a,b),`leader ${i} / cut`).toBeGreaterThan(3);
  }
  // The section's gauge dimension text clears the web break below the girder cut.
  const breaks=[...section.matchAll(/<polyline class="annotation" points="([^"]+)"/g)].map(m=>m[1].split(' ').map(v=>+v.split(',')[1])),gauge=[...section.matchAll(/<text x="[^"]+" y="([^"]+)"[^>]*>0&#39;-7&quot;<\/text>/g)].map(m=>+m[1]);
  expect(gauge).toHaveLength(1);expect(gauge[0]-6.5-Math.max(...breaks.at(-1)!)).toBeGreaterThan(6);
 });
 it('carries every stop extension line to its feature and leaders the girder end and the short plan dimension',()=>{
  type L={cls:string;x1:number;y1:number;x2:number;y2:number};
  const lines=(svg:string):L[]=>[...svg.matchAll(/<line class="([^"]+)" x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"\/>/g)].map(m=>({cls:m[1],x1:+m[2],y1:+m[3],x2:+m[4],y2:+m[5]}));
  const rects=(svg:string)=>[...svg.matchAll(/<rect class="runway-line" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"\/>/g)].map(m=>({x:+m[1],y:+m[2],w:+m[3],h:+m[4]}));
  const words=(svg:string)=>[...svg.matchAll(/<text x="([^"]+)" y="([^"]+)"[^>]*>([^<]*)<\/text>/g)].map(m=>({x:+m[1],y:+m[2],v:m[3].replace(/&quot;/g,'"').replace(/&#39;/g,"'")}));
  const near=(a:number,b:number,tol=.01)=>Math.abs(a-b)<=tol;
  const vertical=(ls:L[],x:number)=>ls.filter(l=>near(l.x1,x)&&near(l.x2,x)).map(l=>({...l,top:Math.min(l.y1,l.y2),bottom:Math.max(l.y1,l.y2)}));
  const ticks=(ls:L[])=>ls.filter(l=>near(Math.abs(l.x2-l.x1),5)&&near(Math.abs(l.y2-l.y1),6)).map(l=>[(l.x1+l.x2)/2,(l.y1+l.y2)/2]);
  const leaderStarts=(svg:string)=>[...svg.matchAll(/data-leader-path="true" points="([^ "]+)/g)].map(m=>m[1].split(',').map(Number));
  for(const s of [demo,{...demo,input:{...demo.input,units:'SI' as const}}]){
   const [elevation,plan]=endStopTopic(s).views.map(v=>v.render().svg),ls=lines(elevation),all=words(elevation);
   // Elevation: the face plate is the tallest plate; the base plate sits on the girder below it.
   const plates=rects(elevation),face=plates.reduce((a,v)=>v.h>a.h?v:a),base=plates.find(v=>near(v.y,face.y+face.h))!,girderTop=base.y+base.h;
   const tier=(label:string)=>{const t=all.find(v=>v.v.startsWith(label))!,y=t.y-3,dim=ls.find(l=>near(l.y1,y)&&near(l.y2,y)&&l.cls==='annotation')!;return {y,left:Math.min(dim.x1,dim.x2)+3,right:Math.max(dim.x1,dim.x2)};};
   const back=tier('BACK BOLTS'),front=tier('FRONT BOLTS'),stop=tier('STOP FACE');
   // Shortest nearest the stop, so no extension line crosses a dimension line; no base plate ordinate.
   expect(back.y).toBeGreaterThan(front.y);expect(front.y).toBeGreaterThan(stop.y);expect(all.some(v=>v.v.startsWith('BASE PL '))).toBe(false);
   // Each extension line runs past its dimension line and down to a small gap off its feature.
   for(const t of [back,front]){const c=vertical(ls,t.right).find(l=>l.cls==='grid-line')!;expect(c.top).toBeLessThan(t.y-3);expect(c.bottom).toBeGreaterThan(girderTop);}
   const faceLine=vertical(ls,stop.right).find(l=>l.cls==='annotation')!;expect(near(stop.right,face.x+face.w)).toBe(true);
   expect(faceLine.top).toBeLessThan(stop.y-3);expect(face.y-faceLine.bottom).toBeGreaterThan(.5);expect(face.y-faceLine.bottom).toBeLessThanOrEqual(3);
   const origin=vertical(ls,back.left).find(l=>l.cls==='annotation'&&l.top<stop.y)!;expect(origin.top).toBeLessThan(stop.y-3);expect(girderTop-origin.bottom).toBeGreaterThan(.5);expect(girderTop-origin.bottom).toBeLessThanOrEqual(3);
   // The face plate height: its upper extension line starts at the face plate.
   const upper=ls.filter(l=>near(l.y1,face.y)&&near(l.y2,face.y)&&l.cls==='annotation').map(l=>Math.max(l.x1,l.x2));
   expect(upper.some(x=>face.x-x>.5&&face.x-x<=3)).toBe(true);
   // GIRDER END leads to the girder end line, below the girder top.
   const label=all.find(v=>v.v==='GIRDER END')!,arrow=leaderStarts(elevation).find(p=>near(p[0],back.left));
   expect(arrow).toBeDefined();expect(arrow![1]).toBeGreaterThan(girderTop);expect(label.x).toBeLessThan(back.left);
   // Plan: every extension line that meets a dimension line below the girder ends it at a tick, and every segment
   // between ticks is labelled within it or by a leader.
   const pl=lines(plan),girderEdge=Math.max(...pl.filter(l=>l.cls==='runway-line').map(l=>Math.max(l.y1,l.y2))),pt=ticks(pl),pw=words(plan),starts=leaderStarts(plan);
   const dims=pl.filter(l=>l.cls==='annotation'&&near(l.y1,l.y2)&&l.y1>girderEdge+4&&Math.abs(l.x2-l.x1)>3);
   expect(dims.length).toBeGreaterThanOrEqual(2);
   for(const d of dims){
    const y=d.y1,x0=Math.min(d.x1,d.x2),x1=Math.max(d.x1,d.x2),on=pt.filter(t=>near(t[1],y)&&t[0]>=x0-.01&&t[0]<=x1+.01).map(t=>t[0]).sort((a,b)=>a-b);
    for(const v of pl.filter(l=>near(l.x1,l.x2)&&Math.min(l.y1,l.y2)<y-1&&Math.max(l.y1,l.y2)>y+1&&l.x1>x0+1&&l.x1<x1-1))expect(on.some(x=>near(x,v.x1)),`extension at ${v.x1} through ${y}`).toBe(true);
    for(let i=0;i+1<on.length;i++){const a=on[i],b=on[i+1];
     expect(pw.some(t=>t.x>a&&t.x<b&&near(t.y,y-5,1))||starts.some(p=>p[0]>a&&p[0]<b&&near(p[1],y,.5)),`segment ${a}-${b} at ${y}`).toBe(true);}
   }
  }
 });
 it('states the stop data without imperial units or false precision on SI sheets',()=>{
  const si={...demo,input:{...demo.input,units:'SI' as const}},t=endStopTopic(si);
  const all=[...t.views.map(v=>texts(v.render().svg).join(' | ')),texts(endStopSheetSvg(si)).join(' | ')].join(' | ');
  expect(all).not.toMatch(/KIP|KSI|\d[ -]IN\b|"|\d+\.\d{2,} kN/);
  expect(all).toContain('89 kN');expect(texts(endStopSheetSvg(demo)).join(' ')).toContain('1 7/16" / 1 5/16", 1 1/4" MIN.');
 });
 it('requires a stop design whenever a stop force reaches the girder',()=>{
  const p=demonstrationProject();p.details!.endStop!.enabled=false;
  expect(validateProject(p).join(' ')).toContain('design the girder-mounted runway end stops');
  p.details!.endStop!.enabled=true;p.details!.endStop!.source='';
  expect(validateProject(p)).toEqual([]);expect(endStopChecks(p).find(c=>c.id==='end-stop-source')?.status).toBe('incomplete');
  const bypass=demonstrationProject();bypass.cranes[0].design!.bumperBypassesGirder=true;
  expect(validateProject(bypass)).toEqual([]);
  expect(endStopChecks(bypass).map(c=>c.status)).toEqual(['not-applicable']);
 });
 it('starts the rail keepers beyond the stops at both runway ends',()=>{
  const p=demo.input,g=endStopGeometry(p,p.details!.endStop!),stations=railKeeperStations(p),L=p.spans.reduce((a,b)=>a+b,0),half=p.details!.rail.clipWidth/2;
  expect(Math.min(...stations)).toBeCloseTo(g.railEnd+half,6);expect(Math.max(...stations)).toBeCloseTo(L-g.railEnd-half,6);
  const off=structuredClone(p);off.cranes[0].design!.bumperBypassesGirder=true;expect(Math.min(...railKeeperStations(off))).toBeCloseTo(half,6);
 });
 it('draws the end stop details and references them from S-01, the cover and the cap details',()=>{
  const set=drawingSheetSet(demo),s07=set.find(v=>v.svg.includes('data-view="end-stop-elevation"'))!;
  // Cover, general arrangement and one sheet of twelve details.
  expect(set.map(v=>v.number)).toEqual(['S-00','S-01','S-02']);
  expect(s07.svg.match(/data-view-title="below"/g)).toHaveLength(12);
  expect(s07.svg).not.toMatch(/\{\{|NOT IN SET|NaN|undefined|data-overflow/);
  for(const view of ['end-stop-elevation','end-stop-plan','end-stop-section','end-stop-notes'])expect(s07.svg).toContain(`data-view="${view}"`);
  const t=texts(s07.svg).join(' | ');
  expect(t).toContain('4 - 3/4" A325 PRETENSIONED (SC)');expect(t).toContain('PL 1" X 10" X 1\'-3" FACE');expect(t).toContain('20 KIP');
  const s01=texts(set[1].svg).join(' ');expect(s01).toContain(`SEE ${detailReferences(set).get('END STOP / ELEVATION')}`);expect(set[1].svg).toContain('data-end-stop="plan"');
  const cover=texts(set[0].svg).join(' ');expect(cover).toContain('RUNWAY END STOPS');expect(cover).not.toContain('RUNWAY END STOPS AT EACH END OF EACH RUNWAY FOR THE BUMPER FORCE');
  expect(s07.svg).toContain('class="hidden-line"');expect(sheetsDxf([s07],'US')).toContain('S-STEEL-HIDDEN');
 },240000);
 it('permits only the end stop holes in a capped girder, as fatigue points',()=>{
  const s=calculate(cappedDemonstrationProject());
  expect(s.checks.filter(c=>c.group==='End stops').every(c=>c.status==='pass')).toBe(true);
  const plan=detailReferences(drawingSheetSet(s)).get('END STOP / PLAN')!;
  expect(texts(drawingSheetSet(s).find(v=>v.svg.includes('data-view="cap-section"'))!.svg).join(' ')).toContain(`EXCEPT THE END STOP BOLT HOLES (${plan})`);
  expect(s.checks.filter(c=>c.id.startsWith('detail-full-cycle-SH')).every(c=>c.status==='pass')).toBe(true);
 },240000);
});

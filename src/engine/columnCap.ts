import {categoryF} from './fatigueConstants';
import {available} from './aiscStrength';
import {aiscShapeByName} from '../data/aiscSections';
import {boltCapacity,boltProperties,plateBearing,minimumFillet} from './connectionStrength';
import {activeColumnCap,type ColumnCapInput} from './columnCapInputs';
import {activeEndBearing,continuousBearings,type EndBearingInput} from './endBearingInputs';
import {independentBearings} from './simpleSupports';
import {existingColumnSection} from './existingColumn';
import {supportStations} from './supportReactions';
import {bracingDesign,designsBracing} from './newColumnBracing';
import {adjacentBays} from './continuation';
import {format} from './units';
import {latexNumber,withinLimit} from './math';
import type {SupportForceSet} from './bracketForces';
import type {CheckResult,ProjectInput} from './types';
export {activeColumnCap,columnCapSchema,defaultColumnCap,type ColumnCapInput} from './columnCapInputs';

const inch=25.4,up=(v:number,step=inch/8)=>Math.ceil(v/step-1e-9)*step;
/** AISC Table A-3.1 Category F weld throat shear: F_SR = max[8 ksi, (Cf/n)^(1/6)], in MPa. */

/** The new column under the cap: depth across the runway, flange width along it, the catalogue fillet where known. */
export function capColumn(p:ProjectInput){
 const s=existingColumnSection(p).section,shape=aiscShapeByName(p.existingColumn?.shape??''),kdes=shape?shape.kdes*inch:s.tf;
 return {name:p.existingColumn?.shape||'BUILT-UP',d:s.d,bf:s.bf,tf:s.tf,tw:s.tw,kdes,fillet:Math.max(0,kdes-s.tf),Fy:s.Fy,Fu:s.Fu,E:s.E};
}
/** Heavy hex nut, F436 washer and stick-through below the cap plate, to the next 1/8 in. */
export const nutDrop=(db:number)=>up(5/32*inch+db-inch/64+db/2);
/** Top corners of a cap stiffener clipped to clear the cap-to-flange fillet. */
export const stiffenerClip=(c:ColumnCapInput)=>Math.max(inch/2,up(c.weld+inch/8));

export interface CapBearing {grid:number;bay?:number;end?:'left'|'right';x0:number;x1:number;center:number;role:'LOCATING'|'SLIDING';
 /** Girder bearing stiffener line over the column web, or over a cap stiffener between the flanges. */
 line:'web'|'stiffener';
 /** Where the reaction is taken for the cap moments: 0.8 of the bearing length from a girder end, centered on a continuous girder. */
 reaction:number;}
/**
 * Cap plate, cap stiffeners and bearing bolts at every grid, in mm: x along the runway from the grid, positive
 * toward the next grid; z across it from the column centerline, on which the girder web lies.
 */
export function columnCapGeometry(p:ProjectInput){
 const cap=activeColumnCap(p)!,d=p.details!,bs=d.bearing,eb=activeEndBearing(p),col=capColumn(p),stations=supportStations(p),L=bs.length;
 const raw=p.system==='continuous'
  ?continuousBearings(p).map(b=>{const j=b.grid-1,end=j===0?'left' as const:j===stations.length-1?'right' as const:undefined;return {grid:j,bay:undefined as number|undefined,end,x0:b.start-b.station,x1:b.finish-b.station,center:b.center-b.station,role:b.role,girderEnd:!!end};})
  :independentBearings(p).map(b=>({grid:stations.findIndex(x=>Math.abs(x-b.station)<1e-6),bay:b.bay,end:b.end,x0:b.start-b.station,x1:b.finish-b.station,center:b.center-b.station,role:b.role,girderEnd:true}));
 const bearings:CapBearing[]=raw.map(b=>({grid:b.grid,...(b.bay?{bay:b.bay}:{}),...(b.end?{end:b.end}:{}),x0:b.x0,x1:b.x1,center:b.center,role:b.role,
  line:Math.abs(b.center)<=col.tw/2+1e-6?'web' as const:'stiffener' as const,
  // A rotating girder end bears toward its span: the bracket seat convention (bracketForces seatOffset).
  reaction:b.girderEnd&&b.end?b.center+(b.end==='left'?1:-1)*.3*L:b.center}));
 const db=eb?.bolts.diameter??.75*inch,gauge=eb?.bolts.gauge??5.5*inch,edge=eb?.bolts.edge??2*inch;
 const grids=stations.map((x,j)=>{
  const here=bearings.filter(b=>b.grid===j);
  const bolts=here.flatMap(b=>[b.x0+edge,b.x1-edge].flatMap(x=>[-1,1].map(s=>({x,z:s*gauge/2,bearing:b}))));
  return {grid:j,x,bearings:here,stiffeners:[...new Set(here.filter(b=>b.line==='stiffener').map(b=>b.center))],bolts};
 });
 const stiffened=grids.some(g=>g.stiffeners.length),clip=stiffenerClip(cap),clear=col.d-2*col.tf;
 // The strut and its tab stay below the cap stiffeners and the bearing nuts; the drop is to the strut centerline.
 const hang=Math.max(stiffened?cap.stiffener.height:0,nutDrop(db)),strut=aiscShapeByName(bracingDesign(p).strut.shape),sd=(strut?.d??8)*inch;
 const drop=up(cap.plate.thickness+hang+inch/2+sd/2,inch/4);
 // Overturning couple of a girder end: the tension bolt line against bearing one bolt diameter inside the far flange or bearing plate edge.
 const lever=gauge/2+Math.min(p.section.bf,bs.width)/2-db;
 return {cap,col,grids,bearings,db,gauge,edge,lever,clip,clear,stiffened,hang,drop,strutDepth:sd,
  stiffener:{bearing:clear-2*clip,weld:cap.stiffener.height-clip},
  // Height of the top-flange force above the cap top: the bearing plate and the girder to its top flange centroid.
  arms:{top:bs.thickness+p.section.d-p.section.tf/2,bottom:bs.thickness+p.section.tf/2}};
}
/** The cap plate as the seat under the girder bearings, for the bearing details; undefined without a column cap. */
export function capSeat(p:ProjectInput){const c=activeColumnCap(p);return c?{thickness:c.plate.thickness,length:c.plate.length,width:c.plate.width}:undefined;}
/** Drop from the bearing seat (cap top) to the crane-level strut work point: zero without a column cap. */
export function capWorkPointDrop(p:ProjectInput){return activeColumnCap(p)&&designsBracing(p)?columnCapGeometry(p).drop:0;}
/**
 * Along-runway eccentricity of the support reaction at grid j for the column's weak axis: a continuous girder
 * centered on an interior grid has none; a girder end bears at 0.8 of its bearing length from the girder end.
 * All the reaction at the farthest bearing bounds two girder ends on a shared simple-span grid.
 */
export function capAlongEccentricity(p:ProjectInput,j:number){
 if(!activeColumnCap(p))return 0;
 const g=columnCapGeometry(p).grids[j];return g?Math.max(0,...g.bearings.map(b=>Math.abs(b.reaction))):0;
}

/** Elastic all-around weld group, per unit length of line: flanges both faces, web both sides, clear of the root fillets. */
export function capWeldGroup(p:ProjectInput){
 const col=capColumn(p),zf=col.d/2,zi=col.d/2-col.tf,xf=col.bf/2,xw=col.tw/2,xr=col.tw/2+col.fillet,zr=Math.max(0,col.d/2-col.kdes);
 type Seg=[[number,number],[number,number]];
 const segments:Seg[]=[
  ...[-1,1].map(s=>[[-xf,s*zf],[xf,s*zf]] as Seg),
  ...[-1,1].flatMap(s=>[[[xr,s*zi],[xf,s*zi]],[[-xf,s*zi],[-xr,s*zi]]] as Seg[]),
  ...[-1,1].map(s=>[[s*xw,-zr],[s*xw,zr]] as Seg)];
 let A=0,Ix=0,Iy=0;
 for(const [[x1,z1],[x2,z2]] of segments){
  const L=Math.hypot(x2-x1,z2-z1);A+=L;
  if(Math.abs(z2-z1)<1e-9){Ix+=L*z1*z1;Iy+=(x2**3-x1**3)/3;}else{Iy+=L*x1*x1;Ix+=(z2**3-z1**3)/3;}
 }
 const points=segments.flat();
 /** Peak resultant per unit length: every component by magnitude at each line end. */
 const peak=(a:{N:number;Vx:number;Vz:number;Mx:number;My:number;Mz:number})=>Math.max(...points.map(([x,z])=>Math.hypot(Math.max(0,a.N)/A+Math.abs(a.Mx)*Math.abs(z)/Ix+Math.abs(a.My)*Math.abs(x)/Iy,Math.abs(a.Vx)/A+Math.abs(a.Mz)*Math.abs(z)/(Ix+Iy),Math.abs(a.Vz)/A+Math.abs(a.Mz)*Math.abs(x)/(Ix+Iy))));
 return {segments,A,Ix,Iy,peak};
}

/**
 * Fork restraint of a girder end on the cap, as the top-flange lateral spring in the girder's lateral-torsional
 * model: the bearing stiffener pair bends as a cantilever from the bolted bottom flange, and the overturning
 * couple at the bottom flange rotates it through the tension bolts (no pretension credit), the bottom flange
 * between the web and the bolt line and the cap plate between its nearest support and the bolt line.
 */
export function capForkStiffness(p:ProjectInput){
 const g=columnCapGeometry(p),b=p.section,bs=p.details!.bearing,eb=activeEndBearing(p)!,E=b.E,G=E/2.6,cap=g.cap;
 const Lc=b.d-1.5*b.tf,outer=b.tw/2+bs.stiffenerWidth,inner=b.tw/2+bs.cope,I=2*bs.stiffenerThickness*(outer**3-inner**3)/3,Av=2*bs.stiffenerThickness*(bs.stiffenerWidth-bs.cope);
 const bending=Lc**3/(3*E*I),shear=Lc/(G*Av*5/6);
 const Ab=Math.PI*eb.bolts.diameter**2/4,grip=b.tf+bs.thickness+cap.plate.thickness+5/32*inch,kBolts=2*E*Ab/grip;
 const af=Math.max(eb.bolts.gauge/2-b.tw/2,1),kFlange=3*E*(bs.length*b.tf**3/12)/af**3;
 // Nearest cap support to each bolt: the column web, a flange inner face or a cap stiffener face.
 const support=Math.max(...g.grids.flatMap(v=>v.bolts.map(o=>capSupportDistance(p,v.stiffeners,o.x,o.z))));
 const ac=Math.max(support,inch/4),kCap=E*cap.plate.thickness**3/ac**2;
 const arm=g.arms.top,rotation=arm*Lc/g.lever**2*(1/kBolts+1/kFlange+1/kCap);
 const compliance=bending+shear+rotation;
 return {k:1/compliance,parts:{bending,shear,rotation,bolts:1/kBolts,flange:1/kFlange,cap:1/kCap},Lc,I,ac};
}
/** Distance from a bolt under the cap to the nearest cap support line: column web face, flange inner face or cap stiffener face. */
export function capSupportDistance(p:ProjectInput,stiffeners:number[],x:number,z:number){
 const col=capColumn(p),c=activeColumnCap(p)!,within=Math.abs(x)<col.bf/2;
 return Math.min(Math.abs(x)-col.tw/2,...(within?[col.d/2-col.tf-Math.abs(z)]:[]),...stiffeners.map(s=>Math.abs(x-s)-c.stiffener.thickness/2));
}

interface Peak {value:number;id:string;combination:string;grid:number}
const none=(grid:number):Peak=>({value:0,id:'',combination:'',grid});
export interface ColumnCapGridResult {
 grid:number;x:number;
 /** Largest factored reaction of each girder bearing at the grid, with the bearing. */
 bearings:{bearing:CapBearing;R:Peak}[];
 uplift:Peak;lateral:Peak;longitudinal:Peak;fork:Peak;boltTension:Peak;weld:Peak&{actions:{N:number;Vx:number;Vz:number;Mx:number;My:number;Mz:number}};
 /** Unfactored fatigue ranges per duty bin: cap weld peak range per length, and the largest bearing reaction range. */
 fatigue:{weld:number;reaction:number}[];
}
export interface ColumnCapResults {grids:ColumnCapGridResult[];fork:ReturnType<typeof capForkStiffness>;}
/**
 * Every concurrent girder end force set at every grid, strength and fatigue: the cap plate, cap stiffener and web,
 * the bolts and the all-around cap weld take the same sets the bracket design force table lists.
 */
export function createColumnCapCollector(p:ProjectInput){
 if(!activeColumnCap(p))return undefined;
 const g=columnCapGeometry(p),weld=capWeldGroup(p),t=g.cap.plate.thickness,bins=p.details!.spectrum.length;
 const grids=g.grids.map(v=>({bearings:v.bearings.map(b=>({bearing:b,R:none(v.grid)})),uplift:none(v.grid),lateral:none(v.grid),longitudinal:none(v.grid),fork:none(v.grid),boltTension:none(v.grid),
  weld:{...none(v.grid),actions:{N:0,Vx:0,Vz:0,Mx:0,My:0,Mz:0}},
  fatigue:Array.from({length:bins},()=>({lo:{} as Record<string,number>,hi:{} as Record<string,number>}))}));
 const keep=(old:Peak,value:number,f:SupportForceSet)=>value>old.value?{value,id:f.id,combination:f.combination,grid:old.grid}:old;
 /** Each girder end reaction of a set at its bearing. */
 const reactions=(j:number,f:SupportForceSet)=>g.grids[j].bearings.map(b=>{
  if(!f.ends.length)return f.vertical;
  const e=f.ends.find(v=>v.bay===b.bay&&v.end===b.end);return e?e.vertical:0;});
 const actions=(j:number,f:SupportForceSet,R:number[])=>{
  const bs=g.grids[j].bearings,Vz=f.top+f.bottom;
  return {N:Math.max(0,-R.reduce((a,v)=>a+v,0)),Vx:f.longitudinal,Vz,Mx:f.top*(g.arms.top+t)+f.bottom*(g.arms.bottom+t),
   My:R.reduce((a,v,i)=>a+v*bs[i].reaction,0)+f.longitudinal*t,Mz:Math.abs(Vz)*Math.max(0,...bs.map(b=>Math.abs(b.center)))};
 };
 function observe(kind:'strength'|'service'|'fatigue',x:number,f:SupportForceSet,bin=-1){
  const j=g.grids.findIndex(v=>Math.abs(v.x-x)<1e-6);if(j<0||kind==='service')return;
  const R=reactions(j,f),a=actions(j,f,R),s=grids[j];
  if(kind==='strength'){
   s.bearings=s.bearings.map((b,i)=>({...b,R:keep(b.R,R[i],f)}));
   s.uplift=keep(s.uplift,Math.max(0,-Math.min(...R)),f);
   s.lateral=keep(s.lateral,Math.abs(a.Vz),f);s.longitudinal=keep(s.longitudinal,Math.abs(f.longitudinal),f);
   const fork=Math.abs(f.top*(g.arms.top-p.details!.bearing.thickness)+f.bottom*p.section.tf/2);
   s.fork=keep(s.fork,fork,f);
   s.boltTension=keep(s.boltTension,Math.max(0,-Math.min(...R))/4+fork/(2*g.lever),f);
   const peak=weld.peak(a);if(peak>s.weld.value)s.weld={value:peak,id:f.id,combination:f.combination,grid:j,actions:a};
  }else if(bin>=0&&bin<bins){
   const r=s.fatigue[bin],values:Record<string,number>={N:Math.max(0,-R.reduce((u,v)=>u+v,0)),Vx:a.Vx,Vz:a.Vz,Mx:a.Mx,My:a.My,...Object.fromEntries(R.map((v,i)=>[`R${i}`,v]))};
   for(const [k,v] of Object.entries(values)){r.lo[k]=Math.min(r.lo[k]??v,v);r.hi[k]=Math.max(r.hi[k]??v,v);}
  }
 }
 function finish():ColumnCapResults{
  return {fork:capForkStiffness(p),grids:grids.map((s,j)=>({grid:j,x:g.grids[j].x,bearings:s.bearings,uplift:s.uplift,lateral:s.lateral,longitudinal:s.longitudinal,fork:s.fork,boltTension:s.boltTension,weld:s.weld,
   fatigue:s.fatigue.map(r=>{
    const range=(k:string)=>(r.hi[k]??0)-(r.lo[k]??0),Mz=range('Vz')*Math.max(0,...g.grids[j].bearings.map(b=>Math.abs(b.center)));
    // Ranges of every component taken together; compression bears on the milled column end, uplift is welded.
    return {weld:weld.peak({N:range('N'),Vx:range('Vx'),Vz:range('Vz'),Mx:range('Mx'),My:range('My'),Mz}),reaction:Math.max(0,...g.grids[j].bearings.map((_,i)=>range(`R${i}`)))};
   })}))};
 }
 return {observe,finish};
}

/** Geometry and fit of the column cap; the checks cover strength. */
export function validateColumnCap(p:ProjectInput):string[]{
 const c=p.columnCap;if(!c?.enabled)return [];
 const errors:string[]=[],add=(test:boolean,m:string)=>{if(test)errors.push(`columnCap.${m}`);};
 const col=p.existingColumn,d=p.details;
 add(!col?.enabled||!col.isNew,'enabled: a column cap carries the girder on a new freestanding runway column designed here; enable the new column.');
 add(!d,'enabled: the column cap needs the girder bearing and end bearing details; start the detailed design.');
 if(!col?.enabled||!col.isNew||!d)return errors;
 add(!!d.bracket?.enabled,'enabled: choose either the welded bracket or the column cap; a column cap replaces the bracket.');
 add(p.aist?.supportType!=='column','enabled: with a column cap the girder bears directly on the column; set the AIST support load path to direct column bearing.');
 add(!activeEndBearing(p),'enabled: the girder bolts to the cap through its end bearings; enable the bolted end bearings.');
 add(!!d.brace.flangeAttachment?.enabled,'enabled: a column cap has no column face at the top flange for a tie: disable the direct flange ties; the bearing stiffeners and the bolted bottom flange restrain the girder end.');
 add(col.strong.top!=='free'||col.weak.top!=='braced','enabled: a column-cap runway column is a cantilever across the runway (free top) braced along it by the crane-level bracing.');
 add(Math.abs(col.height-col.seatElevation)>.5,'enabled: the column stops at the cap: set the column top equal to the bearing seat (top of the cap plate).');
 add(!!p.continuation&&adjacentBays(p).length>0,'enabled: adjacent existing girders on the end columns are not detailed with a column cap.');
 add(p.lateralBraceSpacing<Math.min(...p.spans)-1e-6||(!!p.aist?.bottomBraceSpacing&&p.aist.bottomBraceSpacing<Math.min(...p.spans)-1e-6),'enabled: a column cap restrains the girder at the columns only; intermediate flange braces need their own bracing system. Set the brace spacings to the span.');
 if(!activeEndBearing(p)||!aiscShapeByName(col.shape??''))return [...errors,...(!aiscShapeByName(col.shape??'')?['columnCap.enabled: select an AISC W shape for the new column.']:[])];
 const g=columnCapGeometry(p),cl=g.col,cap=c,bs=d.bearing,eb=activeEndBearing(p)!,u=p.units,f=(v:number)=>format(v,'length',u,3);
 add(cap.plate.width<cl.d+2*(cap.weld+inch/8)-1e-6,`plate.width: the cap must extend at least the weld size plus 1/8 in beyond each column flange face: ${f(cl.d+2*(cap.weld+inch/8))} minimum.`);
 add(cap.plate.width<bs.width-1e-6,`plate.width: the girder bearing plate (${f(bs.width)}) must sit fully on the cap.`);
 add(cap.plate.length<cl.bf-1e-6,`plate.length: the cap must cover the column flanges (${f(cl.bf)}).`);
 const reach=Math.max(...g.bearings.map(b=>Math.max(Math.abs(b.x0),Math.abs(b.x1))));
 add(cap.plate.length/2<reach+inch/2-1e-6,`plate.length: every girder bearing plate and its bolts must sit on the cap with 1/2 in to spare: ${f(2*(reach+inch/2))} minimum, centered on the column.`);
 add(cap.plate.length/2<Math.max(...g.grids.flatMap(v=>v.bolts.map(o=>Math.abs(o.x))))+1.5*eb.bolts.diameter-1e-6,'plate.length: bearing bolts need 1.5 bolt diameters to the cap ends.');
 add((cap.plate.width-eb.bolts.gauge)/2<1.5*eb.bolts.diameter-1e-6,'plate.width: bearing bolts need 1.5 bolt diameters to the cap edges.');
 for(const v of g.grids)for(const x of v.stiffeners){
  add(Math.abs(x)+cap.stiffener.thickness/2+cap.stiffener.weld>cl.bf/2+1e-6,`stiffener: the cap stiffener under the girder bearing stiffener at ${f(x)} from grid ${v.grid+1} and its fillets must land on the column flanges (flange tips ${f(cl.bf/2)}): shorten the girder bearing or use a wider column.`);
  add(Math.abs(x)-cap.stiffener.thickness/2-cap.stiffener.weld<cl.tw/2+cl.fillet+cap.weld-1e-6,`stiffener: the cap stiffener at ${f(x)} from grid ${v.grid+1} must clear the column web, its fillets and the cap weld.`);
 }
 add(g.stiffened&&cap.stiffener.height<4*cap.stiffener.weld+g.clip,'stiffener.height: each cap stiffener fillet must be at least four weld sizes long below the corner clip (AISC 360-16 J2.2b).');
 add(g.stiffened&&g.stiffener.bearing<=0,'stiffener: the corner clips leave no fitted bearing between the column flanges.');
 // The bearing stiffener pair of each girder end lands on the cap within the column flanges.
 add(2*bs.stiffenerWidth+p.section.tw>cl.d-2*cl.tf+1e-6,'enabled: the girder bearing stiffener pair must land between the column flanges.');
 return errors;
}

const group='Column cap';
/**
 * Checks of the column cap arrangement. `lateral` is the flange restraint force with the brace imperfection
 * force; `imperfection` that force alone; `stiffness` the Appendix 6 required restraint stiffness.
 */
export function columnCapChecks(p:ProjectInput,r:ColumnCapResults,ctx:{imperfection:number;required:number}):CheckResult[]{
 const g=columnCapGeometry(p),cap=g.cap,col=g.col,d=p.details!,bs=d.bearing,m=d.material,eb=activeEndBearing(p)!,method=p.method,u=p.units,b=p.section;
 const f=(v:number,q:Parameters<typeof format>[1]='force')=>format(v,q,u,3),gridName=(j:number)=>`grid ${j+1}`;
 const checks:CheckResult[]=[],refs=['column-cap','aisc-connections'];
 const add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds=refs,caseId?:string)=>checks.push({id:`column-cap-${id}`,group,title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:Number.isFinite(demand)&&capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds,caseId});
 const na=(id:string,title:string,note:string)=>checks.push({id:`column-cap-${id}`,group,title,status:'not-applicable',equation:'',note,referenceIds:refs});
 const t=cap.plate.thickness,Fy=Math.min(m.Fy,col.Fy),Fexx=m.Fexx,where=(k:Peak)=>`${gridName(k.grid)}, ${k.combination}`;
 const lines=g.grids.flatMap(v=>r.grids[v.grid].bearings.map(x=>({...x,grid:v.grid,stiffeners:v.stiffeners})));
 checks.push({id:'column-cap-basis',group,title:'Column cap · arrangement and load path',status:'pass',equation:'',referenceIds:['column-cap','tr13-bracket','aisc-connections'],
  note:`The girder sits centered over each new ${col.name} column on a ${f(t,'length')} cap plate ${f(cap.plate.width,'length')} across by ${f(cap.plate.length,'length')} along the runway, welded all around the milled column top with ${f(cap.weld,'length')} fillets; the end bearing bolts pass through the cap. Vertical: girder bearing stiffeners, bearing plate and cap to the column web directly below a stiffener line, or to a ${f(cap.stiffener.thickness,'length')} cap stiffener between the column flanges, ${f(cap.stiffener.height,'length')} deep, welded to both flanges (AISC J1.4: compression by bearing, the welds hold the parts and carry uplift, shear and moments). Lateral and torsion: a fork at each girder end, the bearing stiffener pair a cantilever from the bolted bottom flange; the bolts take the flange force and the overturning couple into the cap; no top-flange tie. Longitudinal: locating bearing bolts, cap and cap welds to the column top, down the column to the crane-level strut ${f(g.drop,'length')} below the cap top. Column eccentricity across the runway: the rail eccentricity ${f(Math.abs(p.railEccentricity),'length')} only. AIST TR-13 §5.9.2: direct column bearing, as recommended where bracket reactions exceed 50 kip.`});
 // Cap plate: one-way strips along the runway between the column web and the cap stiffeners, cantilevering
 // beyond the outermost line to the bearing plate end, under uniform bearing pressure.
 {let worst={M:0,V:0,kind:'',R:none(0)};
  for(const v of lines){
   const B=v.bearing,q=Math.max(0,v.R.value)/(bs.width*bs.length),S=[0,...v.stiffeners].sort((a,c)=>a-c);
   let M=0,V=0,kind='';
   const take=(m_:number,v_:number,k_:string)=>{if(m_>M){M=m_;kind=k_;}V=Math.max(V,v_);};
   for(let i=0;i+1<S.length;i++){const a=S[i],c=S[i+1];if(B.x1>a+1e-6&&B.x0<c-1e-6)take(q*(c-a)**2/8,q*(c-a)/2,`span ${f(c-a,'length')}`);}
   if(B.x0<S[0]-1e-6)take(q*(S[0]-B.x0)**2/2,q*(S[0]-B.x0),`cantilever ${f(S[0]-B.x0,'length')}`);
   if(B.x1>S.at(-1)!+1e-6)take(q*(B.x1-S.at(-1)!)**2/2,q*(B.x1-S.at(-1)!),`cantilever ${f(B.x1-S.at(-1)!,'length')}`);
   if(M>worst.M)worst={M,V,kind,R:v.R};
  }
  add('plate','Cap plate · flexure under the bearing',4*worst.M/t**2,available(Fy,method,.9,1.67),'stress','m=\\max\\left(\\frac{qs^2}{8},\\frac{qc^2}{2}\\right);\\quad f=\\frac{4m}{t^2}\\le\\phi F_y;\\quad q=\\frac{R}{b_pl_p}',`Uniform pressure of the largest girder end reaction ${f(worst.R.value)} (${where(worst.R)}) over the ${f(bs.width,'length')} × ${f(bs.length,'length')} bearing plate. One-way strips along the runway between the column web and the cap stiffeners, cantilevering beyond the outermost line to the bearing plate end; governing ${worst.kind}. Plastic plate moment Fy t²/4 (AISC F11.1, Z = 1.5S ≤ 1.6S); the column flanges' support across the runway is not credited. The bearing plate on the cap is checked under Steel bearing contact.`,['column-cap','aisc-f2'],worst.R.id);
  add('plate-shear','Cap plate · shear at the support lines',worst.V/t,available(.6*Fy,method,1,1.5),'stress','f_v=\\frac{q\\max(s/2,c)}{t}\\le\\phi0.6F_y\\\ \\text{(J4.2)}','Shear per unit width at the support line from the same strips.',refs,worst.R.id);
 }
 // Reactions directly over the column web: AISC J10.2 and J10.3 at the column end, the cap plate the loaded flange.
 const web=lines.filter(v=>v.bearing.line==='web');
 const lb=2*bs.stiffenerWidth+b.tw,k=t;
 if(web.length){
  const v=web.reduce((a,c)=>c.R.value>a.R.value?c:a),R=v.R.value;
  const yield_=available(col.Fy*col.tw*Math.min(2.5*k+lb,col.d-2*col.kdes),method,1,1.5);
  const term=lb/col.d>.2?4*lb/col.d-.2:3*lb/col.d,cripple=available(.4*col.tw**2*(1+term*(col.tw/t)**1.5)*Math.sqrt(col.E*col.Fy*t/col.tw),method,.75,2);
  add('web-yield','Column web · local yielding under the reaction',R,yield_,'force','R_n=F_yt_w(2.5k+l_b)\\le F_yt_w(d-2k_{des})\\\ \\text{(J10.2)}',`Girder bearing stiffeners over the column web at ${where(v.R)}: largest reaction ${f(R)}. Bearing length lb = 2b_s + t_w = ${f(lb,'length')} under the stiffener pair, k = cap thickness ${f(k,'length')}, the end form (one-sided dispersion) and no more than the web between the fillets. Column end milled to bear.`,['column-cap','aisc-j'],v.R.id);
  add('web-cripple','Column web · crippling under the reaction',R,cripple,'force','R_n=0.40t_w^2\\left[1+\\left(\\frac{4l_b}{d}-0.2\\right)\\left(\\frac{t_w}{t_f}\\right)^{1.5}\\right]\\sqrt{\\frac{EF_yt_f}{t_w}}\\\ \\text{(J10.3b)}',`J10.3 at the member end with the cap plate as the loaded flange (t_f = ${f(t,'length')}), lb = ${f(lb,'length')}, d = ${f(col.d,'length')}.`,['column-cap','aisc-j'],v.R.id);
 }else{
  na('web-yield','Column web · local yielding under the reaction','No girder bearing stiffener line lies over the column web: every reaction reaches the column through a cap stiffener.');
  na('web-cripple','Column web · crippling under the reaction','No girder bearing stiffener line lies over the column web.');
 }
 // Cap stiffeners between the flanges under girder bearing stiffener lines off the web.
 const off=lines.filter(v=>v.bearing.line==='stiffener');
 if(off.length){
  const v=off.reduce((a,c)=>c.R.value>a.R.value?c:a),R=v.R.value,s=cap.stiffener,ts=s.thickness,Lw=g.stiffener.weld,bc=g.clear;
  const at=`Cap stiffener PL ${f(ts,'length')} × ${f(s.height,'length')} deep between the flanges (${f(bc,'length')} clear) at ${f(v.bearing.center,'length')} from the grid, under the girder bearing stiffener, ${where(v.R)}: the whole girder end reaction ${f(R)}`;
  add('stiffener-bearing','Cap stiffener · fitted bearing',R,available(1.8*Math.min(m.Fy,col.Fy)*ts*g.stiffener.bearing,method,.75,2),'force','R_n=1.8F_yA_{pb}\\\ \\text{(J7)}',`${at}. Fitted to bear on the cap over ${f(g.stiffener.bearing,'length')}, the clear width less the ${f(g.clip,'length')} corner clips that clear the cap welds.`,['column-cap','aisc-connections'],v.R.id);
  add('stiffener-shear','Cap stiffener · shear yielding at the flanges',R/2,available(.6*m.Fy*ts*s.height,method,1,1.5),'force','R_n=0.6F_yt_sh_s\\\ \\text{(J4.2)}',`${at}; half to each flange over the full stiffener depth.`,refs,v.R.id);
  const q=R/2/(2*Lw),throat=s.weld/Math.SQRT2;
  add('stiffener-weld','Cap stiffener · fillets to the column flanges',q/throat,available(.6*Fexx,method,.75,2),'stress','f_w=\\frac{R/2}{2L_w(0.707w)}\\le\\phi0.6F_{EXX}\\\ \\text{(J2.4)}',`${at}. ${f(s.weld,'length')} fillets both faces at each flange, ${f(Lw,'length')} long below the clip; no directional increase.`,refs,v.R.id);
  add('stiffener-flange','Column flange · shear rupture at the stiffener',2*q/col.tf,available(.6*col.Fu,method,.75,2),'stress','f_v=\\frac{2q}{t_f}\\le\\phi0.6F_u\\\ \\text{(J4.2)}','Both fillets of one flange line act on the flange; the stiffener plate is checked by its own shear yielding.',refs,v.R.id);
  add('stiffener-slenderness','Cap stiffener · width-to-thickness',bc/ts,1.49*Math.sqrt(b.E/m.Fy),'ratio','b/t\\le1.49\\sqrt{E/F_y}\\\ \\text{(B4.1a)}','Plate held on both edges by the flange fillets and on top by the cap: a stiffened element, nonslender under the edge compression.',['aisc-b','column-cap']);
  add('stiffener-weld-minimum','Cap stiffener · minimum fillet',minimumFillet(Math.max(ts,col.tf)),s.weld,'length','w\\ge w_{min}','Thicker joined part, conservatively.',refs);
 }else for(const [id,title] of [['stiffener-bearing','Cap stiffener · fitted bearing'],['stiffener-weld','Cap stiffener · fillets to the column flanges']] as const)na(id,title,'Every girder bearing stiffener line lies over the column web; no cap stiffeners.');
 // All-around cap weld.
 {const v=r.grids.reduce((a,c)=>c.weld.value>a.weld.value?c:a).weld,throat=cap.weld/Math.SQRT2,wg=capWeldGroup(p),a=v.actions;
  add('weld','Cap plate to column · all-around fillets',v.value/throat,available(.6*Fexx,method,.75,2),'stress','f=\\frac{1}{0.707w}\\sqrt{\\left(\\frac{N}{A}+\\frac{M_xz}{I_x}+\\frac{M_yx}{I_y}\\right)^2+\\left(\\frac{V_x}{A}+\\frac{M_zz}{J}\\right)^2+\\left(\\frac{V_z}{A}+\\frac{M_zx}{J}\\right)^2}',`${f(cap.weld,'length')} fillets on both flange faces and both web faces clear of the root fillets, ${f(wg.A,'length')} of line; elastic method, every component by magnitude at each line end, no directional increase. Governing ${where(v)}: uplift ${f(a.N)}, longitudinal ${f(a.Vx)}, lateral ${f(a.Vz)}, overturning across the runway ${f(a.Mx,'moment')} (fork forces at their heights), along it ${f(a.My,'moment')} (each girder end reaction at 0.8 of its bearing from the girder end), torsion ${f(a.Mz,'moment')}. Compression is carried by bearing on the milled column end and not credited.`,refs,v.id);
  add('weld-base','Column web · base metal at the cap fillets',2*v.value/col.tw,available(.6*col.Fu,method,.75,2),'stress','f_v=\\frac{2q}{t_w}\\le\\phi0.6F_u\\\ \\text{(J4.2)}','Fillets both sides of the web at the peak line force.',refs,v.id);
  add('weld-minimum','Cap fillet · minimum size',minimumFillet(Math.max(t,col.tf)),cap.weld,'length','w\\ge w_{min}','Thicker joined part, conservatively.',refs);
 }
 // Bearing bolts through the cap: tension from uplift and the fork couple with the concurrent shear (J3.7).
 {const db=eb.bolts.diameter,bolt=boltProperties(eb.bolts.grade,db),Tg=r.grids.reduce((a,c)=>c.boltTension.value>a.boltTension.value?c:a).boltTension;
  const forkT=ctx.imperfection*(g.arms.top-bs.thickness)/(2*g.lever),T=Tg.value+forkT,lateral=Math.max(...r.grids.map(v=>v.lateral.value))+ctx.imperfection,long=Math.max(...r.grids.map(v=>v.longitudinal.value));
  const V=Math.hypot(long,lateral)/4,cb=boltCapacity({grade:eb.bolts.grade,diameter:db,planes:1,surface:'B',shear:V,tension:T,method});
  add('bolt-tension','Bearing bolts · tension with the fork couple',T,cb.tension,'force','T=\\frac{R_{up}}{4}+\\frac{M_t}{2e}\\le\\phi F^\\prime_{nt}A_b\\\ \\text{(J3.7)}',`Four ${eb.bolts.grade} bolts at each girder end through the bottom flange, bearing plate and cap. The fork moment of the flange forces about the bearing (${where(Tg)}) is a couple of the tension bolt line and bearing one bolt diameter inside the far flange or bearing plate edge, e = ${f(g.lever,'length')} (gauge ${f(g.gauge,'length')}), with the uplift share and the brace imperfection force ${f(ctx.imperfection)} at the top flange; concurrent shear ${f(V)} per bolt (longitudinal and lateral). Pretension not credited.`,refs,Tg.id);
  add('bolt-slip','Locating bolts · slip with the fork tension',V,cb.slip,'force','R_n=\\mu D_uT_bk_{sc}n_s\\\ \\text{(J3.8, J3.9)}',`Class B, k_sc = ${cb.slipReduction.toFixed(3)} for the tension ${f(T)}; lateral and longitudinal forces taken together on all four bolts conservatively.`,refs,Tg.id);
  const xs=g.grids.flatMap(v=>v.bolts.map(o=>Math.abs(o.x))),edge=Math.min(cap.plate.length/2-Math.max(...xs),(cap.plate.width-g.gauge)/2);
  add('bolt-bearing','Cap plate · bolt bearing and tearout',V,plateBearing(db,bolt.hole,t,m.Fu,edge,Math.min(g.gauge,Math.min(...g.bearings.map(b=>b.x1-b.x0-2*g.edge))),method).capacity,'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)\\\ \\text{(J3.10)}',`Standard holes in the ${f(t,'length')} cap; least edge distance ${f(edge,'length')} to the cap ends and edges; the force reverses.`,refs);
  add('bolt-edge','Cap plate · bolt edge distance',1.5*db,edge,'length','e\\ge1.5d_b','Standard holes; sheared or thermally cut cap edges.',refs);
  // Cap thickness for no prying: the cap bends from its nearest support to each bolt.
  const b_=Math.max(...g.grids.flatMap(v=>v.bolts.map(o=>capSupportDistance(p,v.stiffeners,o.x,o.z)))),pp=Math.min(g.gauge,3.5*b_);
  const tMin=(T_:number,bp:number,pw:number,Fu:number)=>Math.sqrt(4*T_*Math.max(bp,0)/available(pw*Fu,method,.9,1.67));
  add('prying','Cap plate · thickness for no prying',tMin(T,b_-db/2,pp,m.Fu),t,'length','t_{min}=\\sqrt{\\frac{4Tb^\\prime}{\\phi pF_u}}',`Largest distance from a bolt to the nearest cap support (column web, flange or cap stiffener face) b = ${f(b_,'length')}, p = ${f(pp,'length')}.`,refs,Tg.id);
  const fb=g.gauge/2-b.tw/2;
  add('flange-prying','Girder bottom flange · thickness for no prying under the fork',tMin(T,fb-db/2,Math.min(Math.min(...g.bearings.map(v=>v.x1-v.x0-2*g.edge)),3.5*fb),b.Fu),b.tf,'length','t_{min}=\\sqrt{\\frac{4Tb^\\prime}{\\phi pF_u}}',`The bottom flange cantilevers from the web to the bolt line, b = ${f(fb,'length')}, under the bolt tension with the fork couple.`,refs,Tg.id);
  // Nuts below the cap clear the column web, flanges and cap stiffeners, and the fillets on them.
  const C=Math.max(1.25*inch,1.6*db),wrench=(dist:(o:{x:number;z:number},st:number[])=>number)=>Math.min(Infinity,...g.grids.flatMap(v=>v.bolts.map(o=>dist(o,v.stiffeners))));
  const webClear=wrench(o=>Math.abs(o.x)-col.tw/2-cap.weld),flangeClear=wrench(o=>Math.abs(o.x)<col.bf/2+C?col.d/2-col.tf-cap.weld-Math.abs(o.z):Infinity),stiffClear=wrench((o,st)=>Math.min(Infinity,...st.map(x=>Math.abs(o.x-x)-cap.stiffener.thickness/2-cap.stiffener.weld)));
  add('wrench-web','Nuts below the cap · column web',C,webClear,'length','|x_b|-t_w/2-w\\ge C_1','Bolt rows of every bearing clear the column web and the cap fillet on it.',refs);
  add('wrench-flange','Nuts below the cap · column flanges',C,flangeClear,'length','d/2-t_f-w-g/2\\ge C_1',Number.isFinite(flangeClear)?'Bolts between the flanges clear their inner faces and the cap fillets.':'No bolt lies between the column flanges.',refs);
  if(g.stiffened)add('wrench-stiffener','Nuts below the cap · cap stiffeners',C,stiffClear,'length','|x_b-x_s|-t_s/2-w_s\\ge C_1','Each bolt row clears the cap stiffeners and their fillets.',refs);
 }
 // Fork restraint stiffness against the Appendix 6 point-brace requirement used for the flange ties.
 {const k=r.fork,parts=k.parts;
  add('fork-stiffness','Girder end fork restraint · stiffness',ctx.required,k.k,'stiffness','\\beta=\\left[\\frac{L^3}{3EI_s}+\\frac{L}{GA_v}+\\frac{h_{top}L}{e^2}\\left(\\frac{1}{k_b}+\\frac{1}{k_f}+\\frac{1}{k_c}\\right)\\right]^{-1}',`Top-flange lateral spring of each girder end on the cap, used as its top restraint in the lateral-torsional, twist and rail-head models: stiffener pair cantilever L = ${f(k.Lc,'length')} (coped section) plus the overturning couple through the tension bolts (no pretension credit), the bottom flange to the bolt line and the cap plate ${f(k.ac,'length')} from its nearest support. Compliance: stiffener ${(parts.bending*1e3).toExponential(2)} + ${(parts.shear*1e3).toExponential(2)}, rotation ${(parts.rotation*1e3).toExponential(2)} mm/kN. Requirement as for a point brace (AISC Appendix 6.3.1b). The column top is fixed in this model; the column drift is checked under New column.`,['column-cap','aisc-brace'],undefined);
 }
 // Column between the cap and the crane-level strut: the longitudinal force in weak-axis bending and shear.
 if(designsBracing(p)){
  const s=existingColumnSection(p).section,Zy=(2*s.bf**2*s.tf/4+(s.d-2*s.tf)*s.tw**2/4),Sy=2*s.tf*s.bf**2/6,F=Math.max(...r.grids.map(v=>v.longitudinal.value)),arm=g.drop;
  add('column-stub','Column top · longitudinal force to the strut',F*arm,available(Math.min(s.Fy*Zy,1.6*s.Fy*Sy),method,.9,1.67),'moment','M=Pa\\le\\phi M_{ny}\\\ \\text{(F6)}',`The locating girder's longitudinal force ${f(F)} enters at the cap and reaches the strut work point ${f(arm,'length')} below the cap top, bending the column top about its weak axis; flange local buckling of a compact flange does not govern. The bracing checks take the force from the strut on.`,['column-cap','aisc-f6']);
  add('column-stub-shear','Column top · weak-axis shear to the strut',F,available(.6*s.Fy*2*s.bf*s.tf,method,.9,1.67),'force','V_n=0.6F_yb_ft_f(2)\\\ \\text{(G6)}','Both flanges, Cv2 = 1.',['column-cap','aisc-g']);
 }
 // Fatigue: the cap fillets and the cap stiffener fillets, Category F on the throat, full range for every cycle in the bin.
 {const bins=d.spectrum,total=bins.reduce((a,v)=>a+v.cycles,0),range=Math.max(...r.grids.flatMap(v=>v.fatigue.map(x=>x.weld))),Fsr=categoryF(total),throat=cap.weld/Math.SQRT2;
  add('weld-fatigue','Cap fillets · weld throat fatigue',range/throat,Fsr,'stress','F_{SR}=690(1.5/n_{SR})^{0.167}\\ge55\\,\\mathrm{MPa}','Category F, AISC Table A-3.1 item 8.2. Range of the peak line force from every component of the duty-bin sets taken together (uplift, lateral, longitudinal and both moments), applied to all cycles; no fractional-duty reduction. Compression bears on the milled column end.',['column-cap','aisc-fatigue']);
  if(g.stiffened){const R=Math.max(...r.grids.flatMap(v=>v.fatigue.map(x=>x.reaction)));
   add('stiffener-weld-fatigue','Cap stiffener fillets · weld throat fatigue',R/(4*g.stiffener.weld*cap.stiffener.weld/Math.SQRT2),Fsr,'stress','f_{sr}=\\frac{\\Delta R}{4L_w(0.707w)}\\le F_{SR}\\ \\ \\text{(Cat. F)}','Largest girder end reaction range of any duty bin through the four fillet lines of one cap stiffener, every cycle.',['column-cap','aisc-fatigue']);}
 }
 return checks;
}

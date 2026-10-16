import type {ProjectInput} from './types';
import {sectionProperties} from './section';
import {railClipInput} from './railSeat';
import {railLayout,railJointBars,railJointDetail} from './railLayout';
import {independentBearings,railClipStations} from './simpleSupports';
import {activeEndStop,stopEnds} from './endStopInputs';
import {endStopGeometry} from './endStop';
import {capAngleGeometry} from './capAngle';
import {aiscAngleByName} from '../data/aiscAngles';
import {haunchGeometry,haunchWeight,isTaperedHaunch} from './taperedHaunchInputs';
import {columnStiffenerGeometry} from './columnStiffeners';
import {rolledSelfWeight} from './rolledBracket';
import {rolledStub,isRolledBracket} from './rolledBracketInputs';
import {haunchTipDepth,haunchedBracket,weldedRibBracket} from './bracketRib';

const inch=25.4;
/**
 * Where an item's weight goes: `line` along the girder (an equivalent uniform load added to the girder dead load),
 * `grid` onto the seat at a grid through the girder end it is fixed to (added to the dead reaction there), `support`
 * straight into the column (the support steel: not a girder reaction).
 */
export interface SteelItem {name:string;where:'line'|'grid'|'support';count:number;each:number;total:number}
/** Bolts, nuts, washers, sleeves and welds: an allowance on the connection steel. */
export const hardwareAllowance=.05;
/**
 * New-steel dead-load takeoff of one runway line (the other line is its mirror): the girder and rail, the rail clips
 * and joint bars, the bearing plates and stiffeners, the end stops, the cap tiebacks and the support steel (haunch or
 * stub bracket, column stiffeners). `line` is the equivalent uniform load of the attachments along the girder,
 * `grid` the girder-end hardware at each grid (on the seat) and `support` the support steel at each grid (into the
 * column), all with the hardware allowance; `total` is both runway lines.
 */
export function newSteelTakeoff(p:ProjectInput){
 const d=p.details,s=p.section,L=p.spans.reduce((a,b)=>a+b,0),grids=[0];for(const l of p.spans)grids.push(grids.at(-1)!+l);
 const w=(volume:number)=>volume*s.density*9.80665/1e9,items:SteelItem[]=[],props=sectionProperties(s);
 const add=(name:string,where:SteelItem['where'],count:number,each:number)=>{if(count>0&&each>0)items.push({name,where,count,each,total:count*each});};
 const grid=grids.map(()=>0),support=grids.map(()=>0),gridOf=(x:number)=>grids.reduce((k,g,i)=>Math.abs(g-x)<Math.abs(grids[k]-x)?i:k,0);
 add(s.kind==='cap'?'Girder (W and cap channel)':`Girder (${s.kind==='welded'?'welded plate girder':'W shape'})`,'line',1,props.weight*L);add('Rail','line',1,p.railWeight*L);
 if(!d)return {items,line:0,grid,support,perLine:items.reduce((a,v)=>a+v.total,0),total:2*items.reduce((a,v)=>a+v.total,0),allowance:0,perEnd:0,stopEach:0,stops:[] as ('left'|'right')[]};
 // Rail clips in opposing pairs (the clip taken as twice its base plate where the supplier gives no weight) and joint bars.
 const clip=railClipInput(d.rail);
 add('Rail clips (pairs)','line',railClipStations(p).length,2*2*w(clip.baseLength*clip.baseWidth*clip.baseThickness));
 const r=d.rail,bars=railJointBars(p),joints=Math.max(...railLayout(p).rails.map(v=>v.joints.length));
 // Joint bars only where the joints are bolted: welded joints and one-piece rails have none.
 if(railJointDetail(p)==='bars')add('Rail joint bars (pairs)','line',joints,2*w(r.jointPlateThickness*r.jointPlateHeight*bars.length));
 // Bearing plate and the pair of bearing stiffeners at each girder end.
 const b=d.bearing,stiffenerHeight=s.d-2*s.tf,ends=p.system==='simple'?independentBearings(p).map(v=>v.station):grids;
 const end=w(b.length*b.width*b.thickness)+2*w(b.stiffenerWidth*b.stiffenerThickness*stiffenerHeight);
 for(const x of ends)grid[gridOf(x)]+=end;add('Bearing plates and stiffeners (each girder end)','grid',ends.length,end);
 let stopEach=0;
 // End stops: base and face plates and two stiffeners at each runway end that carries one.
 const e=activeEndStop(p);
 if(e){const g=endStopGeometry(p,e),each=w(e.base.length*e.base.width*e.base.thickness)+w(e.base.width*e.face.height*e.face.thickness)+2*w(e.stiffener.length*g.stiffenerHeight*e.stiffener.thickness);
  stopEach=each;for(const end of stopEnds(p))grid[end==='left'?0:grids.length-1]+=each;add('End stops','grid',stopEnds(p).length,each);}
 // Cap tieback at each girder end: angle, tie plate and end plate, into the column.
 const cap=capAngleGeometry(p);
 if(cap){const c=cap.input,angle=aiscAngleByName(c.shape),each=(angle?w(angle.A*inch**2*c.length):0)+w(cap.plate.thickness*cap.plate.width*cap.plate.length)+w(c.endPlate.thickness*c.endPlate.width*c.endPlate.height);
  for(const x of ends)support[gridOf(x)]+=each;add('Cap tiebacks (each girder end)','support',ends.length,each);}
 // Support steel at each grid: the tapered haunch or rolled stub with its plates, and the column stiffeners.
 const br=d.bracket?.enabled?d.bracket:undefined;
 if(br){
  // Welded rib brackets: the seat plate and the two ribs (a haunched rib by its mean depth, root to tip), the plates the
  // bracket check uses.
  const ribs=weldedRibBracket(br)?w(br.seatLength*br.seatProjection*br.seatThickness)+2*w(br.seatProjection*(haunchedBracket(br)?(br.ribDepth+haunchTipDepth(br))/2:br.ribDepth)*br.ribThickness):0;
  const each=isTaperedHaunch(br)?haunchWeight(haunchGeometry(br,b.width),s.density):isRolledBracket(br)&&rolledStub(br)?rolledSelfWeight(p,rolledStub(br)!):ribs;
  if(each){for(let j=0;j<grids.length;j++)support[j]+=each;add(isTaperedHaunch(br)?'Tapered haunch':ribs?(haunchedBracket(br)?'Haunched rib bracket (seat and two ribs)':'Twin-rib bracket (seat and two ribs)'):'Stub bracket','support',grids.length,each);}
  const cs=columnStiffenerGeometry(p);
  if(cs){const plates=2*2*w(cs.length*cs.width*cs.t);for(let j=0;j<grids.length;j++)support[j]+=plates;add('Column stiffeners (four plates)','support',grids.length,plates);}
 }
 // Bolts, washers, sleeves and welds on the connection steel.
 const connection=items.filter(v=>v.where!=='line'||v.name.startsWith('Rail clips')||v.name.startsWith('Rail joint')).reduce((a,v)=>a+v.total,0),allowance=hardwareAllowance*connection;
 for(let j=0;j<grids.length;j++){grid[j]*=1+hardwareAllowance;support[j]*=1+hardwareAllowance;}
 const attachments=items.filter(v=>v.where==='line'&&!/^(Girder|Rail)$/.test(v.name.split(' (')[0])).reduce((a,v)=>a+v.total,0)*(1+hardwareAllowance);
 const perLine=items.reduce((a,v)=>a+v.total,0)+allowance;
 const k=1+hardwareAllowance;
 return {items,line:attachments/L,grid,support,allowance,perLine,total:2*perLine,
  /** Girder-end hardware on the seat: each girder end, and the end stop on a runway-end girder end. */
  perEnd:end*k,stopEach:stopEach*k,stops:stopEnds(p)};
}
/** Dead load along the girder: the entered additional dead load, the rail, the girder and its attachments (newSteelTakeoff). */
export const girderDeadLoad=(p:ProjectInput,weight:number)=>p.deadLoad+p.railWeight+weight+newSteelTakeoff(p).line;

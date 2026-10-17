import type {CalculationSnapshot,CheckResult,ProjectInput,Properties} from './types';
import type {RunwayCaseEvent} from './designAnalysis';
import type {LateralTorsionResult} from './lateralTorsion';
import {activeSplices,spliceGeometry,spliceLayout,spliceMark,spliceStations,spliceZones,clipZones,clipGaps,spliceRules,type FlangeSpliceGeometry,type SpliceGeometry,type SpliceInput} from './spliceInputs';
import {available,girderStrength} from './aiscStrength';
import {blockShear,boltCapacity,compressionResistance,elasticBoltGroup,plateBearing} from './connectionStrength';
import {latexNumber,withinLimit} from './math';
import {format} from './units';
import {railPad} from './railSeat';
import {railLayout,railLayoutCriteria} from './railLayout';
import {railClipStations} from './simpleSupports';

/** The largest value of a splice action with the case and station that set it. */
export interface SpliceGoverning {value:number;id:string;combination:string;station:number}
/** Factored actions at one splice joint over every strength case: signed major moment extremes and magnitudes. */
export interface SpliceStationEnvelope {station:number;mark:string;momentMax:number;momentMin:number;shear:number;axial:number;topLateral:number;bottomLateral:number;topShear:number;bottomShear:number;torque:number}
/** Fatigue stress range by duty bin at one splice, for a material point. */
export interface SpliceFatiguePoint {key:string;station:number;mark:string;bins:{minimum:number;maximum:number;range:number;cycles:number;damage:number;allowable:number}[];range:number;damage:number}
export interface SpliceResults {
 stations:SpliceStationEnvelope[];
 /** Governing demands of the splice components under the factored design forces (before the design-basis minimum). */
 strength:Record<string,SpliceGoverning>;
 fatigue:SpliceFatiguePoint[];
}
const keys=['topBolt','topTension','topCompression','topGirder','bottomBolt','bottomTension','bottomCompression','bottomGirder','webBolt','webMoment','webShear','webAxial','moment'] as const;

const mean=(xs:number[])=>xs.reduce((a,v)=>a+v,0)/xs.length;
/** Bolt coordinates of one side of a flange splice about the group centroid: x along the runway, y across it. */
export function flangeBoltGroup(f:FlangeSpliceGeometry){const cx=mean(f.rows);return f.rows.flatMap(x=>f.lines.flatMap(y=>[{x:x-cx,y},{x:x-cx,y:-y}]));}
/** Bolt coordinates of one side of the web splice about the group centroid: x along the runway, y vertical. */
export function webBoltGroup(g:SpliceGeometry){const cx=mean(g.web.columns);return g.web.columns.flatMap(x=>g.web.rows.map(y=>({x:x-cx,y})));}
/** Centroid of the half plate set (one side of the web) from the web C/L, and its area. */
export function plateHalf(p:ProjectInput,f:FlangeSpliceGeometry){
 const i=f.input,Ao=f.outer?i.outerWidth*i.outerThickness/2:0,Ai=f.inner?i.innerWidth*i.innerThickness:0;
 return {A:Ao+Ai,Ao,Ai,y:(Ao*i.outerWidth/4+Ai*(f.innerFrom+f.innerTo)/2)/Math.max(Ao+Ai,1e-9)};
}
/** Lateral (minor-axis) moment of inertia of a flange's plate set about the web C/L. */
export function plateLateralInertia(f:FlangeSpliceGeometry){
 const i=f.input,yi=(f.innerFrom+f.innerTo)/2;
 return (f.outer?i.outerThickness*i.outerWidth**3/12:0)+(f.inner?2*(i.innerThickness*i.innerWidth**3/12+i.innerThickness*i.innerWidth*yi**2):0);
}

/**
 * Collector of the splice actions in the detailed runway analysis. Each strength case gives, at every joint, the
 * major moment and shear of the vertical model, the axial force, and from the lateral/torsional solution (its
 * 0.8-stiffness second-order response) the lateral bending and warping moment of each flange, the flange lateral
 * shear and the Saint-Venant torque. These load the flange and web bolt groups and plates concurrently. Each
 * fatigue bin gives the stress ranges of the splice plates at the joint and of the girder flanges at the
 * outermost bolt rows (gross section). Nodes at these stations are added to the lateral/torsional mesh.
 */
export function createSpliceCollector(p:ProjectInput,props:Properties){
 const sp=activeSplices(p),stations=spliceStations(p);
 if(!sp||!stations.length||!p.details)return undefined;
 const g=spliceGeometry(p,sp),b=p.section,E=b.E,G=E/2.6,If=props.Iy/2,h0=props.h0,Af=b.bf*b.tf,yf=(b.d-b.tf)/2,Aw=props.A-2*Af;
 const share=Af*yf/props.Ix,webShare=1-2*Af*yf*yf/props.Ix;
 const groups={top:flangeBoltGroup(g.top),bottom:flangeBoltGroup(g.bottom),web:webBoltGroup(g)},eccentric={top:mean(g.top.rows),bottom:mean(g.bottom.rows),web:mean(g.web.columns)};
 const halves={top:plateHalf(p,g.top),bottom:plateHalf(p,g.bottom)},webArm=sp.gap/2+sp.web.endDistance;
 const plates={top:{A:g.top.Ao+g.top.Ai,I:plateLateralInertia(g.top)},bottom:{A:g.bottom.Ao+g.bottom.Ai,I:plateLateralInertia(g.bottom)},webS:2*sp.web.thickness*sp.web.height**2/6};
 const bins=p.details.spectrum;
 const result:SpliceResults={stations:stations.map((x,i)=>({station:x,mark:spliceMark(i),momentMax:0,momentMin:0,shear:0,axial:0,topLateral:0,bottomLateral:0,topShear:0,bottomShear:0,torque:0})),strength:{},fatigue:[]};
 const points=['girder-top-left','girder-top-right','girder-bottom-left','girder-bottom-right','plate-top','plate-bottom','plate-web'];
 const ranges=stations.map(()=>Object.fromEntries(points.map(k=>[k,bins.map(()=>({minimum:0,maximum:0}))])) as Record<string,{minimum:number;maximum:number}[]>);
 const govern=(key:typeof keys[number],value:number,e:RunwayCaseEvent,station:number)=>{const o=result.strength[key];if(!o||value>o.value)result.strength[key]={value,id:e.id,combination:e.combination,station};};
 const resultant=(pts:{x:number;y:number}[],load:{x:number;y:number;moment:number})=>Math.max(...elasticBoltGroup(pts,load).map(v=>v.resultant));
 // Stations where the lateral/torsional solution is recovered: each joint and the outermost flange bolt rows.
 const nodes=stations.flatMap(s=>[s,s-g.top.rows.at(-1)!,s+g.top.rows.at(-1)!,s-g.bottom.rows.at(-1)!,s+g.bottom.rows.at(-1)!]);
 const shearAt=(e:RunwayCaseEvent,x:number)=>e.verticalReactions.reduce((a,v)=>a+(v.x<=x+1e-7?v.r:0),0)-e.wheels.reduce((a,w)=>a+(w.x<=x+1e-7?w.p:0),0)-e.q*x;
 const flangeTip=(st:ReturnType<LateralTorsionResult['at']>,M:number,top:boolean,left:boolean,k:number)=>{
  const y=top?b.d/2:-b.d/2,x=left?-b.bf/2:b.bf/2,omega=x*(top?h0/2:-h0/2);
  return -M*y/props.Ix-E*k*st.curvature*x-E*k*st.warpingCurvature*omega;
 };
 return {nodes,
  observe(e:RunwayCaseEvent,bin:number,r:LateralTorsionResult,start:number,end:number,moment:(x:number)=>number){
   const strength=e.kind==='strength',k=strength?.8:1;
   if(!strength&&e.kind!=='fatigue')return;
   stations.forEach((s,i)=>{
    if(s<start-1e-6||s>end+1e-6)return;
    const st=r.at(s-start),M=moment(s),V=Math.max(Math.abs(shearAt(e,s-.5)),Math.abs(shearAt(e,s+.5)));
    const Mt=E*k*If*(st.curvature+h0/2*st.warpingCurvature),Mb=E*k*If*(st.curvature-h0/2*st.warpingCurvature);
    if(strength){
     const Ht=Math.abs(E*k*If*(st.lateralThird+h0/2*st.warpingThird)),Hb=Math.abs(E*k*If*(st.lateralThird-h0/2*st.warpingThird)),T=Math.abs(G*k*props.J*st.twistRate),P=Math.abs(e.axial);
     const env=result.stations[i];
     env.momentMax=Math.max(env.momentMax,M);env.momentMin=Math.min(env.momentMin,M);env.shear=Math.max(env.shear,V);env.axial=Math.max(env.axial,P);
     env.topLateral=Math.max(env.topLateral,Math.abs(Mt));env.bottomLateral=Math.max(env.bottomLateral,Math.abs(Mb));env.topShear=Math.max(env.topShear,Ht);env.bottomShear=Math.max(env.bottomShear,Hb);env.torque=Math.max(env.torque,T);
     govern('moment',Math.abs(M),e,s);
     const axial=P*Af/props.A;
     for(const [name,Ff,Mf,Hf] of [['top',-M*share,Mt,Ht],['bottom',M*share,Mb,Hb]] as const){
      const f=g[name],h=halves[name],H=Hf+T/h0,lateral=Math.abs(Mf);
      govern(`${name}Bolt`,resultant(groups[name],{x:Math.abs(Ff)+axial,y:H,moment:lateral+H*eccentric[name]}),e,s);
      const tension=Math.max(0,Ff)+axial,compression=Math.max(0,-Ff)+axial;
      govern(`${name}Tension`,tension/2+lateral/(2*h.y),e,s);
      govern(`${name}Compression`,compression/2+lateral/(2*h.y),e,s);
      govern(`${name}Girder`,tension/2+2*lateral/b.bf,e,s);
      void f;
     }
     const Mw=Math.abs(M*webShare),Pw=P*Aw/props.A;
     govern('webBolt',resultant(groups.web,{x:Pw,y:V,moment:Mw+V*eccentric.web}),e,s);
     govern('webMoment',Mw+V*webArm,e,s);govern('webShear',V,e,s);govern('webAxial',Pw,e,s);
    }else{
     const o=ranges[i],put=(key:string,v:number)=>{const c=o[key][bin];c.minimum=Math.min(c.minimum,v);c.maximum=Math.max(c.maximum,v);};
     for(const [name,Ff,Mf] of [['top',-M*share,Mt],['bottom',M*share,Mb]] as const){const pl=plates[name];for(const sign of [-1,1])put(`plate-${name}`,Ff/pl.A+sign*Mf*(b.bf/2)/pl.I);}
     const Mw=M*webShare;for(const sign of [-1,1])put('plate-web',(Mw+sign*shearAt(e,s+.5)*webArm)/plates.webS);
     // Girder flanges at the outermost bolt rows each side of the joint, gross section, both tips.
     for(const [top,reach] of [[true,g.top.rows.at(-1)!],[false,g.bottom.rows.at(-1)!]] as const)for(const x of [s-reach,s+reach]){
      if(x<start-1e-6||x>end+1e-6)continue;
      const at=r.at(x-start),Mx=moment(x);
      for(const left of [true,false])put(`girder-${top?'top':'bottom'}-${left?'left':'right'}`,flangeTip(at,Mx,top,left,1));
     }
    }
   });
  },
  finish():SpliceResults{
   // AISC 360-16 Table A-3.1 item 2.1, Category B: Cf = 120 x 10^8 (ksi), threshold 16 ksi (110 MPa). The S-N curve
   // is used below the threshold too (no endurance credit for the mixed spectrum), as for the other details.
   const cf=12,curve=(range:number,cycles:number)=>({allowable:6900*(cf/cycles)**(1/3),damage:range===0?0:cycles/(cf*(6900/range)**3)});
   result.fatigue=stations.flatMap((s,i)=>points.map(key=>{
    const bs=ranges[i][key].map((v,j)=>{const range=v.maximum-v.minimum;return {...v,range,cycles:bins[j].cycles,...curve(range,bins[j].cycles)};});
    return {key,station:s,mark:spliceMark(i),bins:bs,range:Math.max(...bs.map(v=>v.range)),damage:bs.reduce((a,v)=>a+v.damage,0)};
   }));
   return result;
  }};
}
export type SpliceCollector=NonNullable<ReturnType<typeof createSpliceCollector>>;

/** The design basis: flange strength (D2 on the drilled flange) and web shear strength, and the minimum fraction. */
export function spliceBasis(p:ProjectInput,props:Properties,sp:SpliceInput,g:SpliceGeometry){
 const b=p.section,m=p.method,Afg=b.bf*b.tf;
 const flange=(f:FlangeSpliceGeometry)=>{const Afn=(b.bf-2*f.lines.length*g.deduct)*b.tf;return {Afg,Afn,yield:available(b.Fy*Afg,m,.9,1.67),rupture:available(b.Fu*Afn,m,.75,2),strength:Math.min(available(b.Fy*Afg,m,.9,1.67),available(b.Fu*Afn,m,.75,2))};};
 const fraction=sp.basis==='full'?1:.5,top=flange(g.top),bottom=flange(g.bottom),web=girderStrength(p,props).shear;
 return {fraction,top,bottom,web,minimum:{top:fraction*top.strength,bottom:fraction*bottom.strength,web:fraction*web}};
}

const inch=25.4;
/**
 * Girder field splice checks (AISC 360-16 Chapter J and Appendix 3; DG7 runway girder basis). The design forces are
 * the factored envelopes at each joint with their concurrent lateral flange actions; the strength limit states use
 * the larger of those and the design-basis minimum (50% of the flange strength, or the full flange strength).
 */
export function spliceChecks(s:CalculationSnapshot):CheckResult[]{
 const p=s.input,sp=activeSplices(p),r=s.detailResults?.splices,props=s.properties;
 if(!sp||!p.details||!props)return [];
 const layout=spliceLayout(p);
 if(layout.errors.length)return [];
 const out:CheckResult[]=[],u=p.units,method=p.method,b=p.section,m=p.details.material,f=(v:number,q:Parameters<typeof format>[1]='length')=>format(v,q,u,3);
 const longest=Math.max(...layout.pieces.map(v=>v.length));
 const add=(id:string,title:string,demand:number,capacity:number,quantity:CheckResult['quantity'],equation:string,note:string,referenceIds=['girder-splice','aisc-connections']):void=>{out.push({id,group:'Girder splice',title,demand,capacity,quantity,utilization:capacity>0?demand/capacity:1e12,status:capacity>0&&withinLimit(demand,capacity)?'pass':'fail',equation,substitution:`\\frac{${latexNumber(demand)}}{${latexNumber(capacity)}}=${(capacity>0?demand/capacity:1e12).toFixed(4)}`,note,referenceIds});};
 add('splice-piece-length','Girder piece length · maximum mill / shipping length',longest,sp.maxPiece,'length','L_{piece}\\le L_{max}',`${layout.pieces.length} girder pieces per runway${layout.stations.length?`; splices ${layout.stations.map((x,i)=>`${spliceMark(i)} at ${f(x)}`).join(', ')} from grid 1`:''}. ${sp.placement==='auto'?'Automatic placement: the fewest joints, 0.20 to 0.25 of the span from an interior support of a continuous girder (the inflection region), otherwise as near a girder end as the maximum length allows':'Entered splice stations'}.`,['girder-splice']);
 if(!layout.stations.length)return out;
 if(!r)return [...out,{id:'splice-analysis',group:'Girder splice',title:'Splice design forces',status:'incomplete',equation:'',note:'The detailed runway analysis did not return the splice actions.',referenceIds:['girder-splice']}];
 const g=spliceGeometry(p,sp),basis=spliceBasis(p,props,sp,g),hole=g.hole,dh=g.deduct,db=sp.diameter;
 const gov=(k:string)=>r.strength[k]??{value:0,id:'-',combination:'-',station:layout.stations[0]};
 const at=(v:SpliceGoverning)=>`${v.combination} at ${spliceMark(Math.max(0,layout.stations.findIndex(x=>Math.abs(x-v.station)<1)))} (${f(v.station)} from grid 1)`;
 const basisNote=sp.basis==='full'?`Design basis: the splice develops the full available strength of the spliced flange, ${f(basis.top.strength,'force')} (DG7 recommendation for runway girders), and the web its full shear strength`:`Design basis: the larger of the factored design forces at the joint (AISC 360-16 J6) and 50% of the available flange strength, ${f(basis.minimum.top,'force')} top and ${f(basis.minimum.bottom,'force')} bottom, with 50% of the web shear strength, ${f(basis.minimum.web,'force')}`;
 const plateFy=m.Fy,plateFu=m.Fu;
 for(const name of ['top','bottom'] as const){
  const fl=g[name],title=name==='top'?'Top flange splice':'Bottom flange splice',n=fl.boltsPerSide,pts=flangeBoltGroup(fl),min=basis.minimum[name];
  const design=gov(`${name}Bolt`),minBolt=min/n,boltForce=Math.max(design.value,minBolt),pattern=fl.rows.at(-1)!-fl.rows[0];
  const arrangement=fl.input.plates==='inner-outer'?'outer plate and two inner plates (two shear planes)':fl.input.plates==='outer'?'outer plate (one shear plane)':'two inner plates (one shear plane)';
  const one=boltCapacity({grade:sp.grade,diameter:db,planes:1,surface:sp.surface,shear:0,tension:0,method,patternLength:pattern}),all=boltCapacity({grade:sp.grade,diameter:db,planes:fl.planes,surface:sp.surface,shear:0,tension:0,method,patternLength:pattern});
  const planeShare=fl.planes===2?Math.max(fl.Ao,fl.Ai)/(fl.Ao+fl.Ai):1;
  const note=`${n} - ${f(db)} ${sp.grade} bolts each side of the joint (${fl.input.lines} line${fl.input.lines>1?'s':''} each side of the web, ${fl.input.rows} rows), ${arrangement}, Class ${sp.surface} faying surfaces, standard holes, threads included. Elastic bolt group: the flange force with the concurrent lateral flange moment (lateral bending plus warping), the flange lateral shear and the Saint-Venant torque as a flange shear couple, the shear at the joint acting at ${f(mean(fl.rows))} from the group centroid. Governing ${at(design)}.`;
  add(`splice-${name}-slip`,`${title} · slip resistance (slip-critical)`,design.value,all.slip,'force','R_n=\\mu D_uh_fT_bn_s;\\ \\phi=1.00\\ (\\Omega=1.50)',`${note} AISC 360-16 J3.8 slip-critical, pretension ${f(g.bolt.pretension,'force')} (J3.1, Table J3.1), μ = ${sp.surface==='B'?'0.50':'0.30'}, Du = 1.13, hf = 1, ns = ${fl.planes}. Slip is prevented at the required strength of the factored AIST combinations, which bound the unfactored fatigue loading: the joint does not slip under crane cycles (TR-13 cyclic slip-critical connections; Category B base metal per Appendix 3). The design-basis minimum is a strength requirement checked by the bearing-type limit states below.`,['girder-splice','aisc-connections','tr13-detail']);
  add(`splice-${name}-bolt-shear`,`${title} · bolt shear`,boltForce*planeShare,one.shear,'force','r_v=\\max(r_{design},F_{min}/n)\\,\\frac{\\max(A_o,A_i)}{A_o+A_i}\\le\\phi F_{nv}A_b',`${note} Each shear plane carries the force share of its plate${fl.planes===2?` (${(planeShare*100).toFixed(0)}% on the larger of the outer and inner plates)`:''}. ${basisNote}; minimum ${f(minBolt,'force')} per bolt. AISC 360-16 J3.6, Table J3.2 (N)${pattern>950?', long-joint reduction':''}.`);
  const girderEnd=fl.input.endDistance,pitch=(v:number)=>fl.input.rows>1?fl.input.pitch:2*v;
  const onGirder=plateBearing(db,hole,b.tf,b.Fu,girderEnd,pitch(girderEnd),method);
  // Each plate bears its share of the bolt force (by area); the girder flange, between them, the whole force.
  const plies=[...(fl.outer?[{t:fl.input.outerThickness,share:fl.Ao/(fl.Ao+fl.Ai)}]:[]),...(fl.inner?[{t:fl.input.innerThickness,share:fl.Ai/(fl.Ao+fl.Ai)}]:[])];
  const onPlates=Math.min(...plies.map(v=>plateBearing(db,hole,v.t,plateFu,sp.edge,pitch(sp.edge),method).capacity/v.share)),plateClear=plateBearing(db,hole,plies[0].t,plateFu,sp.edge,pitch(sp.edge),method).clear;
  add(`splice-${name}-bearing`,`${title} · bolt bearing and tearout`,boltForce,Math.min(onGirder.capacity,onPlates),'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)',`AISC 360-16 J3.10(a), deformation at bolt holes a design consideration. Girder flange ${f(b.tf)} with ${f(onGirder.clear)} clear to the girder end or the next hole; each splice plate (${plies.map(v=>f(v.t)).join(', ')}) for its area share of the bolt force with ${f(plateClear)} clear to the plate end or the next hole. Bolt force the larger of the design force and the basis minimum.`);
  const h=plateHalf(p,fl),tension=Math.max(gov(`${name}Tension`).value,min/2),compression=Math.max(gov(`${name}Compression`).value,min/2);
  const nHalf=fl.input.lines,An=(fl.outer?(fl.input.outerWidth/2-nHalf*dh)*fl.input.outerThickness:0)+(fl.inner?(fl.input.innerWidth-nHalf*dh)*fl.input.innerThickness:0),Ae=Math.min(An,.85*h.A);
  const halfNote=`One side of the web: ${fl.outer?`half the outer plate ${f(fl.input.outerWidth)} x ${f(fl.input.outerThickness)}`:''}${fl.outer&&fl.inner?' and ':''}${fl.inner?`one inner plate ${f(fl.input.innerWidth)} x ${f(fl.input.innerThickness)}`:''}, Ag = ${f(h.A,'area')}; force F/2 + M_lat/(2ȳ) with ȳ = ${f(h.y)} from the web C/L. ${basisNote}.`;
  add(`splice-${name}-plate-yield`,`${title} · plates tension yielding`,tension,available(plateFy*h.A,method,.9,1.67),'force','R_n=F_yA_g',`AISC 360-16 J4.1(a). ${halfNote} Governing ${at(gov(`${name}Tension`))}.`);
  add(`splice-${name}-plate-rupture`,`${title} · plates tension rupture`,tension,available(plateFu*Ae,method,.75,2),'force','R_n=F_uA_e;\\ A_e=A_n\\le0.85A_g',`AISC 360-16 J4.1(b): splice plates A_e = A_n = ${f(An,'area')} but not more than 0.85A_g. Holes ${f(hole)} plus 1/16 in (B4.3b). ${halfNote}`);
  const L=sp.gap+2*fl.input.endDistance,comp=[...(fl.outer?[{A:fl.input.outerWidth/2*fl.input.outerThickness,t:fl.input.outerThickness}]:[]),...(fl.inner?[{A:fl.input.innerWidth*fl.input.innerThickness,t:fl.input.innerThickness}]:[])];
  const slender=Math.max(...comp.map(v=>.65*L/(v.t/Math.sqrt(12)))),compCap=comp.reduce((a,v)=>{const KLr=.65*L/(v.t/Math.sqrt(12));return a+(KLr<=25?available(plateFy*v.A,method,.9,1.67):compressionResistance(v.A,v.t/Math.sqrt(12),.65*L,b.E,plateFy,method).capacity);},0);
  add(`splice-${name}-plate-compression`,`${title} · plates compression`,compression,compCap,'force',slender<=25?'KL/r\\le25:\\ P_n=F_yA_g':'P_n=F_{cr}A_g\\ (Chapter\\ E)',`AISC 360-16 J4.4: each plate between the first bolt rows across the joint, L = ${f(L)}, K = 0.65 (clamped by the pretensioned bolts), largest KL/r = ${slender.toFixed(1)}. Girder ends are not assumed to bear across the ${f(sp.gap)} gap. ${halfNote}`);
  // Block shear: the flange-tip strip of each plate and of the girder flange, and the centre strip of the outer plate.
  const lv=(first:number)=>first+(fl.input.rows-1)*fl.input.pitch,nv=fl.input.rows-.5,yo=fl.lines.at(-1)!,yi=fl.lines[0];
  const block=(t:number,shear:number,tensionNet:number,Fy:number,Fu:number,planes=1)=>blockShear(planes*shear*t,planes*(shear-nv*dh)*t,Math.max(tensionNet,1e-6)*t,Fy,Fu,method);
  const blocks:{what:string;demand:number;capacity:number}[]=[];
  const girderHalf=Math.max(gov(`${name}Girder`).value,min/2);
  blocks.push({what:'girder flange tip',demand:girderHalf,capacity:Math.min(block(b.tf,lv(fl.input.endDistance),b.bf/2-yo-dh/2,b.Fy,b.Fu),fl.lines.length>1?block(b.tf,lv(fl.input.endDistance),b.bf/2-yi-1.5*dh,b.Fy,b.Fu):Infinity)});
  if(fl.outer){const share=tension*h.Ao/h.A;
   blocks.push({what:'outer plate edge',demand:share,capacity:Math.min(block(fl.input.outerThickness,lv(sp.edge),fl.input.outerWidth/2-yo-dh/2,plateFy,plateFu),fl.lines.length>1?block(fl.input.outerThickness,lv(sp.edge),fl.input.outerWidth/2-yi-1.5*dh,plateFy,plateFu):Infinity)});
   blocks.push({what:'outer plate centre',demand:2*share,capacity:block(fl.input.outerThickness,lv(sp.edge),2*yi-dh,plateFy,plateFu,2)});}
  if(fl.inner){const share=tension*h.Ai/h.A;
   blocks.push({what:'inner plate',demand:share,capacity:Math.min(block(fl.input.innerThickness,lv(sp.edge),fl.innerTo-yo-dh/2,plateFy,plateFu),block(fl.input.innerThickness,lv(sp.edge),yi-fl.innerFrom-dh/2,plateFy,plateFu))});}
  const worst=blocks.reduce((a,v)=>v.demand/v.capacity>a.demand/a.capacity?v:a);
  add(`splice-${name}-block-shear`,`${title} · block shear`,worst.demand,worst.capacity,'force','R_n=\\min(0.6F_uA_{nv},0.6F_yA_{gv})+U_{bs}F_uA_{nt};\\ U_{bs}=0.5',`AISC 360-16 J4.3, conservative Ubs = 0.5. Governing path: ${worst.what}. Paths: the flange-tip strip of the girder flange and of each plate (shear along the bolt line from the girder or plate end, tension to the edge), and the outer plate between the inner bolt lines. Each plate takes the half force in proportion to its area.`);
  const AnHalf=(b.bf/2-fl.lines.length*dh)*b.tf;
  add(`splice-${name}-girder-net`,`${title} · girder flange net section at the first bolt row`,girderHalf,available(b.Fu*AnHalf,method,.75,2),'force','R_n=F_uA_{n,half}',`AISC 360-16 D2(b) and J4.1(b) on the drilled girder flange, one side of the web, at the bolt row farthest from the joint (the full flange force there): A_n = (b_f/2 - ${fl.lines.length}d_h)t_f = ${f(AnHalf,'area')}. Force F/2 + 2M_lat/b_f from the factored envelope, or half the basis minimum. Governing ${at(gov(`${name}Girder`))}.`,['girder-splice','aisc-f13','aisc-connections']);
 }
 // F13.1: flexural strength of the girder at the drilled flanges.
 {const Afg=b.bf*b.tf,Afn=Math.min(basis.top.Afn,basis.bottom.Afn),Yt=b.Fy/b.Fu<=.8?1:1.1,limited=b.Fu*Afn<Yt*b.Fy*Afg,Mn=limited?b.Fu*Afn/Afg*props.Sx:b.Fy*props.Zx,M=gov('moment');
  add('splice-girder-flexure','Girder flexure at the splice holes',M.value,available(Mn,method,.9,1.67),'moment',limited?'M_n=\\frac{F_uA_{fn}}{A_{fg}}S_x':'F_uA_{fn}\\ge Y_tF_yA_{fg}:\\ no\\ limit',`AISC 360-16 F13.1: A_fn = ${f(Afn,'area')}, A_fg = ${f(Afg,'area')}, Yt = ${Yt.toFixed(1)}; ${limited?'tensile rupture of the drilled flange limits the flexural strength at the splice.':'the holes do not limit the flexural strength; the plastic moment is the bound here, lateral-torsional buckling is checked for the girder.'} Largest factored moment at a joint: ${at(M)}.`,['girder-splice','aisc-f13']);}
 // Web splice.
 {const w=sp.web,gw=g.web,n=gw.boltsPerSide,pts=webBoltGroup(g),design=gov('webBolt'),minV=basis.minimum.web,ew=mean(gw.columns);
  const minBolt=Math.max(...elasticBoltGroup(pts,{x:0,y:minV,moment:minV*ew}).map(v=>v.resultant)),boltForce=Math.max(design.value,minBolt);
  const all=boltCapacity({grade:sp.grade,diameter:db,planes:2,surface:sp.surface,shear:0,tension:0,method,patternLength:(w.rows-1)*w.pitch});
  const note=`${n} - ${f(db)} ${sp.grade} bolts each side of the joint (${w.columns} column${w.columns>1?'s':''} of ${w.rows}), two web plates ${f(w.thickness)} x ${f(w.height)}, two shear planes, Class ${sp.surface}. The web takes the shear, its share of the major moment (M(1 - 2A_f y_f²/I_x)) and of the axial force; the shear acts at ${f(ew)} from the group centroid. Governing ${at(design)}.`;
  add('splice-web-slip','Web splice · slip resistance (slip-critical)',design.value,all.slip,'force','R_n=\\mu D_uh_fT_bn_s',`${note} AISC 360-16 J3.8 at the factored design forces, as for the flanges.`,['girder-splice','aisc-connections','tr13-detail']);
  add('splice-web-bolt-shear','Web splice · bolt shear',boltForce,all.shear,'force','r_v=\\max(r_{design},r_{min})\\le2\\phi F_{nv}A_b',`${note} Minimum: ${sp.basis==='full'?'the full':'50% of the'} web shear strength ${f(minV,'force')} with its eccentricity, ${f(minBolt,'force')} per bolt. AISC 360-16 J3.6.`);
  const onWeb=plateBearing(db,hole,b.tw,b.Fu,w.endDistance,Math.min(w.pitch,w.columns>1?w.spacing:w.pitch),method),onPlates=plateBearing(db,hole,2*w.thickness,plateFu,Math.min(sp.edge,gw.verticalEdge),Math.min(w.pitch,w.columns>1?w.spacing:w.pitch),method);
  add('splice-web-bearing','Web splice · bolt bearing and tearout',boltForce,Math.min(onWeb.capacity,onPlates.capacity),'force','R_n=\\min(1.2l_ctF_u,2.4dtF_u)',`AISC 360-16 J3.10(a): girder web ${f(b.tw)} (${f(onWeb.clear)} least clear distance) and the two plates ${f(2*w.thickness)} (${f(onPlates.clear)}), least clear distance in any direction.`);
  const Mpl=Math.max(gov('webMoment').value,minV*(sp.gap/2+w.endDistance)),t=w.thickness,hgt=w.height,S=2*t*hgt**2/6,Z=2*t*hgt**2/4,Lb=sp.gap+2*w.endDistance,ratio=Lb*hgt/t**2;
  const Fy=plateFy,limitA=.08*b.E/Fy,limitB=1.9*b.E/Fy,MnY=Math.min(Fy*Z,1.6*Fy*S),MnL=ratio<=limitA?MnY:ratio<=limitB?Math.min(MnY,(1.52-.274*ratio*Fy/b.E)*Fy*S):Math.min(MnY,1.9*b.E/ratio*S);
  add('splice-web-plate-flexure','Web splice plates · flexure',Mpl,available(MnL,method,.9,1.67),'moment','M_n=\\min(F_yZ,1.6F_yS,\\ F11\\ LTB)',`AISC 360-16 F11 for the two rectangular plates (Cb = 1), unbraced between the first bolt columns across the joint, L_b = ${f(Lb)}, L_bd/t² = ${ratio.toFixed(0)}. Moment at the first bolt column: the web moment plus the shear times ${f(sp.gap/2+w.endDistance)}. Governing ${at(gov('webMoment'))}.`);
  const holes=gw.rows.map(y=>Math.abs(y)),Znet=2*t*(hgt**2/4-holes.reduce((a,y)=>a+dh*y,0));
  add('splice-web-plate-rupture','Web splice plates · flexural rupture at the bolt holes',Mpl,available(plateFu*Znet,method,.75,2),'moment','M_n=F_uZ_{net}',`Net plastic section modulus of the two plates through a bolt column, ${f(Znet,'modulus')} (AISC Manual Part 9, flexural rupture of connecting elements; J4).`);
  const V=Math.max(gov('webShear').value,minV),Agv=2*t*hgt,Anv=2*t*(hgt-w.rows*dh);
  add('splice-web-plate-shear-yield','Web splice plates · shear yielding',V,available(.6*plateFy*Agv,method,1,1.5),'force','R_n=0.6F_yA_{gv}','AISC 360-16 J4.2(a), both plates.');
  add('splice-web-plate-shear-rupture','Web splice plates · shear rupture',V,available(.6*plateFu*Anv,method,.75,2),'force','R_n=0.6F_uA_{nv}','AISC 360-16 J4.2(b), both plates through a bolt column.');
  const Mc=available(MnL,method,.9,1.67),Vc=available(.6*plateFy*Agv,method,1,1.5);
  add('splice-web-plate-interaction','Web splice plates · flexure and shear',(Mpl/Mc)**2+(V/Vc)**2,1,'ratio','(M_r/M_c)^2+(V_r/V_c)^2\\le1','Plate flexure and shear interaction at the first bolt column (AISC Manual Part 10, Eq. 10-5).');
  const shearPath=gw.verticalEdge+(w.rows-1)*w.pitch,tensionPath=sp.edge+(w.columns-1)*w.spacing;
  add('splice-web-block-shear','Web splice plates · block shear',V,2*blockShear(shearPath*t,(shearPath-(w.rows-.5)*dh)*t,(tensionPath-(w.columns-.5)*dh)*t,plateFy,plateFu,method),'force','R_n=\\min(0.6F_uA_{nv},0.6F_yA_{gv})+0.5F_uA_{nt}',`AISC 360-16 J4.3, both plates: shear along the bolt columns to the plate edge, tension to the plate end, Ubs = 0.5.`);}
 // Fatigue: Category B base metal of slip-critical bolted joints.
 {const worst=(prefix:string)=>r.fatigue.filter(v=>v.key.startsWith(prefix)).reduce<typeof r.fatigue[number]|undefined>((a,v)=>!a||v.damage>a.damage?v:a,undefined);
  const total=p.details.spectrum.reduce((a,v)=>a+v.cycles,0),allowable=6900*(12/total)**(1/3);
  for(const [prefix,id,title,where] of [['girder-','splice-fatigue-girder','Girder flanges at the splice · Category B fatigue','girder flange tips (top and bottom, both edges) at the outermost bolt rows each side of the joint, gross section, with lateral bending and warping'],['plate-top','splice-fatigue-top-plates','Top flange splice plates · Category B fatigue','top flange plates at the joint, the flange force over the plate area and the lateral flange moment over the plates\' lateral section'],['plate-bottom','splice-fatigue-bottom-plates','Bottom flange splice plates · Category B fatigue','bottom flange plates at the joint'],['plate-web','splice-fatigue-web-plates','Web splice plates · Category B fatigue','web plates at the first bolt column, web moment and shear eccentricity']] as const){
   const v=worst(prefix);if(!v)continue;
   add(id,title,v.damage,1,'ratio','D=\\sum_i n_i/N_i;\\ N_i=C_f(\\Delta f_i)^{-3};\\ C_f=120\\times10^8',`AISC 360-16 Appendix 3, Table A-3.1 item 2.1: base metal at the gross section of a slip-critical bolted joint, Category B. ${where}. Each duty bin of the existing spectrum, Cds + lift fraction × Cvs + 0.5 Css without impact; Miner summation with no endurance-limit credit. Governing ${v.mark}, largest range ${f(v.range,'stress')}.`,['girder-splice','aisc-fatigue','tr13-load']);
   add(`${id}-all-cycle`,`${title.replace(' · Category B fatigue','')} · all-cycle bound`,v.range,allowable,'stress','\\Delta f_{max}\\le6900(C_f/n_{total})^{1/3}','Largest duty-bin range applied to every cycle, without endurance-threshold credit.',['girder-splice','aisc-fatigue']);
  }}
 // Detailing.
 {const e=g.minEdge,pitches=[g.top.input.rows>1?g.top.input.pitch:Infinity,g.bottom.input.rows>1?g.bottom.input.pitch:Infinity,g.top.lines.length>1?g.top.input.lineSpacing:Infinity,g.bottom.lines.length>1?g.bottom.input.lineSpacing:Infinity,sp.web.pitch,sp.web.columns>1?sp.web.spacing:Infinity,2*g.top.lines[0],2*g.bottom.lines[0]].filter(Number.isFinite);
  add('splice-spacing','Splice bolts · minimum spacing',8/3*db,Math.min(...pitches),'length','s\\ge2\\tfrac{2}{3}d',`AISC 360-16 J3.3 (3d preferred): least pitch, gauge or line spacing of the flange and web groups.`);
  const thin=Math.min(b.tf,b.tw,sp.web.thickness,...[g.top,g.bottom].flatMap(fl=>[...(fl.outer?[fl.input.outerThickness]:[]),...(fl.inner?[fl.input.innerThickness]:[])]));
  const maxPitch=Math.max(...pitches),maxEdge=Math.max(sp.edge,g.web.verticalEdge,b.bf/2-Math.max(...g.top.lines,...g.bottom.lines));
  add('splice-spacing-max','Splice bolts · maximum spacing',maxPitch,Math.min(24*thin,12*inch),'length','s\\le\\min(24t,12\\,in)',`AISC 360-16 J3.5(a), painted or unpainted members not subject to corrosion; thinnest part ${f(thin)}.`);
  const edges=[sp.edge,g.web.verticalEdge,g.top.input.endDistance,g.bottom.input.endDistance,sp.web.endDistance,b.bf/2-g.top.lines.at(-1)!,b.bf/2-g.bottom.lines.at(-1)!,...[g.top,g.bottom].flatMap(fl=>[...(fl.inner?[fl.lines[0]-fl.innerFrom]:[]),...(fl.outer?[fl.input.outerWidth/2-fl.lines.at(-1)!]:[])])];
  add('splice-edge','Splice bolts · minimum edge distance',e,Math.min(...edges),'length','e\\ge e_{min,Table\\ J3.4}',`AISC 360-16 J3.4, Table J3.4 for ${f(db)} bolts: plate ends, girder ends at the joint, plate and flange edges.`);
  add('splice-edge-max','Splice bolts · maximum edge distance',maxEdge,Math.min(12*thin,6*inch),'length','e\\le\\min(12t,6\\,in)','AISC 360-16 J3.5: largest edge distance of the splice plates and flanges.');
  const d=p.details,pad=railPad(p),railHalf=Math.max(d.rail.baseWidth,pad?.width??0)/2+d.criteria.alignmentTolerance;
  add('splice-rail-clearance','Top flange bolt heads · clear of the rail base',railHalf+inch/16,g.top.lines[0]-g.hex.corners/2,'length','g/2-c_{head}\\ge b_{rail}/2+t_{set}+1/16\\,in',`Heads on the top flange beside the rail base${pad?' and pad':''}, with the ${f(d.criteria.alignmentTolerance)} rail setting allowance; the top flange is spliced with inner plates only, so the rail, pad and clips bear on the girder flange across the joint.`,['girder-splice']);
  add('splice-wrench','Flange splice nuts · socket clearance to the web fillet',g.wrench,Math.min(g.top.lines[0],g.bottom.lines[0])-g.k1,'length','g/2-k_1\\ge C_1','Nuts inside the section are turned beside the web fillet (AISC Manual Table 7-15 socket clearance).',['girder-splice']);
  add('splice-web-wrench','Web splice bolts · socket clearance to the flanges',g.wrench,Math.min(...g.web.rows.map(y=>b.d/2-b.tf-Math.abs(y)-Math.max(g.top.inner?g.top.input.innerThickness:0,g.bottom.inner?g.bottom.input.innerThickness:0))),'length','d/2-t_f-t_i-|y|\\ge C_1','Top and bottom web bolts clear the flanges and inner flange plates for the socket.',['girder-splice']);
  if(p.aist){const zones=clipZones(p,layout.stations,g,sp),gap=clipGaps(p,layout.stations,zones,railClipStations(p));
   add('splice-clips','Rail clips at the splices · clip spacing',gap,p.aist.clipSpacing,'length','s_{clip}\\le s_{clips}',`Clips stop ${f(spliceRules.clipClear)} clear of the girder ends at each joint and of the top flange bolt heads; a clip stands between each girder end and the first top bolt row where the end distance ${f(g.top.input.endDistance)} leaves room. Largest clip gap at a splice.`,['girder-splice','tr13-detail']);}
  const rl=railLayout(p),joints=rl.rails.flatMap(v=>v.joints),near=Math.min(Infinity,...layout.stations.flatMap(s=>joints.map(j=>Math.abs(j-s))));
  if(Number.isFinite(near))add('splice-rail-joints','Rail joints · clear of the girder splices',railLayoutCriteria.clear,near,'length','|x_{rail\\ joint}-x_{splice}|\\ge2\\,ft',`The rail layout keeps every rail joint ${f(railLayoutCriteria.clear)} from the girder joints, splices included${rl.conflicts.length?`; ${rl.conflicts.length} joint(s) could not be kept clear`:''}.`,['girder-splice']);
  const zones=spliceZones(p,g),closest=layout.stations.flatMap(x=>zones.map(z=>({z,margin:Math.max(z.from-x,x-z.to)}))).reduce((a,v)=>v.margin<a.margin?v:a);
  add('splice-clearances','Splices · clear of bearings, braces and end stops',closest.z.clear,closest.z.clear+closest.margin,'length','c_{provided}\\ge c_{required}',`Splice plates (half-length ${f(g.half)} from the joint) end at least the girder depth ${f(b.d)} clear of the bearings and their stiffeners and ${f(spliceRules.attachmentClear)} clear of brace stiffeners and end stops; every piece at least ${f(spliceRules.minPiece)} long. Least clearance at ${closest.z.what}.`,['girder-splice']);}
 return out;
}

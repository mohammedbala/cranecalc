import {craneDesignMinimum} from './aistLoads';
import {asceCombinations,type AsceCombination} from './asceCombinations';
import {seatOffset} from './bracketForces';
import {independentBearings} from './simpleSupports';
import {stopEnds} from './endStopInputs';
import {sectionProperties} from './section';
import type {CraneCombination} from './aistLoads';
import type {ProjectInput,Section} from './types';

/**
 * Supporting-column actions that the girder analysis does not hand to the column (structural review items B7–B11,
 * D33): the seat moment of the girder reactions about the haunch web, the longitudinal force at each locating seat,
 * the torsion from the girder offset, the TR-13 supporting-structure combinations, and the runway seismic masses.
 * Canonical units mm, N, MPa.
 */

const inch=25.4;

/** One girder end bearing at a grid: its reaction offset along the runway from the grid and its unfactored reactions. */
export interface SeatEnd {bay:number;end:'left'|'right';offset:number;D:number;L:number;Cd:number;Cv:number;Ci:number;}
/**
 * Girder end bearings at each grid with their unfactored reactions. Simple spans: each girder end carries its own
 * span's dead and live load, and the largest single-crane end reaction of its span (one wheel at the bearing, the
 * crane on that span alone) split into empty crane, lifted load and impact. A continuous girder bears off center
 * only at its runway ends. The reaction acts at 0.8 of the bearing length from the girder end (seatOffset).
 */
export function seatEnds(p:ProjectInput):SeatEnd[][]{
 const stations=[0];for(const l of p.spans)stations.push(stations.at(-1)!+l);
 const q=p.deadLoad+p.railWeight+sectionProperties(p.section).weight,live=p.aist?.liveLoad??0,Lbr=p.details?.bearing.length??254;
 // Largest end reaction of a span of length Lb from one crane on it alone.
 const crane=(Lb:number)=>{
  let best={Cd:0,Cv:0,Ci:0};
  for(const c of p.cranes){
   const impact=Math.max(c.impact,craneDesignMinimum(c).impact),wheels=c.wheels.map(w=>({offset:w.offset,dead:w.unloaded,static:w.loaded/(c.includesImpact?1+c.impact:1)}));
   for(const lead of wheels){
    const r={Cd:0,Cv:0,Ci:0};
    for(const w of wheels){const a=w.offset-lead.offset;if(a<0||a>Lb)continue;const f=(Lb-a)/Lb;r.Cd+=f*w.dead;r.Cv+=f*(w.static-w.dead);r.Ci+=f*impact*w.static;}
    if(r.Cd+r.Cv+r.Ci>best.Cd+best.Cv+best.Ci)best=r;
   }
  }
  return best;
 };
 const at=stations.map(()=>[] as SeatEnd[]);
 if(p.system==='simple'){
  for(const b of independentBearings(p)){
   const Lb=p.spans[b.bay-1],j=stations.findIndex(x=>Math.abs(x-b.station)<1e-6);if(j<0)continue;
   at[j].push({bay:b.bay,end:b.end,offset:seatOffset({end:b.end,offset:b.center-b.station},Lbr),D:q*Lb/2,L:live*Lb/2,...crane(Lb)});
  }
 }else{
  // A continuous girder: interior bearings are centered; the runway ends carry the end span's end reaction (bounded by the simple-span value).
  const n=p.spans.length;
  at[0].push({bay:1,end:'left',offset:seatOffset({end:'left',offset:Lbr/2},Lbr),D:q*p.spans[0]/2,L:live*p.spans[0]/2,...crane(p.spans[0])});
  at[n].push({bay:n,end:'right',offset:seatOffset({end:'right',offset:-Lbr/2},Lbr),D:q*p.spans[n-1]/2,L:live*p.spans[n-1]/2,...crane(p.spans[n-1])});
 }
 return at;
}
/** Load factors on the seat reactions: runway dead D, runway live L, empty crane Cd, lifted load and impact Cv. */
export interface SeatFactors {D:number;L:number;Cd:number;Cv:number;}
/**
 * Largest seat moment ΣV·x at a grid about the haunch web plane: dead and live load on every girder end, the crane on
 * one girder end at a time (unbalanced reactions at a shared grid), or no crane.
 */
export function seatMoment(ends:SeatEnd[],f:SeatFactors){
 const base=ends.reduce((a,v)=>a+(f.D*v.D+f.L*v.L)*v.offset,0);
 return Math.max(Math.abs(base),...ends.map(v=>Math.abs(base+(f.Cd*v.Cd+f.Cv*(v.Cv+v.Ci))*v.offset)));
}
/** Grids that locate a girder longitudinally: the left end of each simple span; every grid of a continuous girder (conservative). */
export function locatingGrids(p:ProjectInput){return p.spans.map((_,i)=>i).concat(p.system==='continuous'?[p.spans.length]:[]);}
/** Crane stop force reaching each grid through the girder: girder-mounted stops on the end spans, delivered at their locating seats. */
export function bumperAtGrids(p:ProjectInput){
 const n=p.spans.length,Cbs=Math.max(0,...p.cranes.map(c=>c.design&&!c.design.bumperBypassesGirder?c.design.bumperForce:0)),ends=stopEnds(p);
 const grids=new Set<number>();if(Cbs>0)for(const e of ends)grids.add(p.system==='continuous'?(e==='left'?0:n):(e==='left'?0:n-1));
 return {Cbs,grids};
}

/**
 * Torsion of a W column under a concentrated torque T at height z0, twist prevented at the base and the top and
 * warping free there (AISC Design Guide 9, torsionally pinned ends): the exact solution of GJφ′ − ECwφ‴ = T(z) on
 * the two segments, φ = c0 + c1z + c2e^{−(z−z_s)/a} + c3e^{(z−z_e)/a} on a segment from z_s to z_e (bounded terms, well conditioned). Returns the largest warping normal stress at the
 * flange tips, EWnoφ″, and the largest flange shear, Saint-Venant Gtfφ′ plus warping ESwφ‴/tf, at the ends and on
 * each side of the load.
 */
export function pinnedTorsion(column:Section,T:number,z0:number,L:number){
 const s=sectionProperties(column),E=column.E,G=E/2.6,a=Math.sqrt(E*s.Cw/(G*s.J)),Wno=s.h0*column.bf/4,Sw=s.h0*column.bf**2/16,t=Math.abs(T);
 // Rows: phi and its first three derivatives at z, for the coefficients c0 to c3.
 const basis=(z:number,zs:number,ze:number)=>{const e1=Math.exp(-(z-zs)/a),e2=Math.exp((z-ze)/a);return [0,1,2,3].map(k=>[k?0:1,k===0?z:k===1?1:0,(-1/a)**k*e1,(1/a)**k*e2]);};
 const A:number[][]=[],row=(l:number[],r:number[],v:number)=>A.push([...l,...r,v]),z4=[0,0,0,0];
 const b0=basis(0,0,z0),bL=basis(L,z0,L),b1=basis(z0,0,z0),b2=basis(z0,z0,L);
 row(b0[0],z4,0);row(b0[2],z4,0);row(z4,bL[0],0);row(z4,bL[2],0);
 for(const d of [0,1,2])row(b1[d],b2[d].map(v=>-v),0);
 // Internal torque GJφ′ − ECwφ‴ = GJc1 on each segment drops by T across the load.
 row([0,G*s.J,0,0],[0,-G*s.J,0,0],t);
 const n=8;
 for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;[A[c],A[p]]=[A[p],A[c]];for(let r=0;r<n;r++){if(r===c)continue;const f=A[r][c]/A[c][c];for(let k=c;k<=n;k++)A[r][k]-=f*A[c][k];}}
 const x=A.map((r,i)=>r[n]/r[i]),c1=x.slice(0,4),c2=x.slice(4);
 const at=(c:number[],z:number,zs:number,ze:number)=>basis(z,zs,ze).map(d=>d.reduce((sum,v,i)=>sum+v*c[i],0));
 const points=[at(c1,0,0,z0),at(c1,z0,0,z0),at(c2,z0,z0,L),at(c2,L,z0,L)];
 const stress=Math.max(...points.map(v=>E*Wno*Math.abs(v[2]))),shear=Math.max(...points.map(v=>G*column.tf*Math.abs(v[1])+E*Sw*Math.abs(v[3])/column.tf));
 return {stress,shear,a,twist:Math.abs(at(c1,z0,0,z0)[0])};
}

/**
 * AIST TR-13 §3.10 combinations for structures supporting cranes, as applied to the column (review D33): the ASCE 7
 * combinations with the crane dead load taken with the dead-load factor (1.4Cdm with 1.4D, 1.2Cdm with 1.2D, Cdm with
 * 0.9D as in TR-13 7a) instead of the live-load factor, and the moving crane loads with the live-load factor.
 * UNVERIFIED: TR-13 (2020) is paywalled; built from the review's statement of 3a (1.2Cdm with 1.6S) and the runway
 * combinations already in aistLoads.ts (1a, 2a/2b, 3a, 7a).
 */
export interface SupportCombination extends AsceCombination {cd:number;}
export function tr13SupportCombinations(method:ProjectInput['method']):SupportCombination[]{
 return asceCombinations(method).filter(k=>k.factors.D>0).map(k=>{
  const D=k.factors.D,cd=D<1?1:D;
  const equation=k.equation.replace(/^([0-9.]*)D/,m=>`${m} + ${cd===1?'':cd}Cdm`).replace(/(^| )([0-9.]*)L(?=$|[ ,])/,'$1$2(Cvm + Css + Cls + L)');
  return {id:`TR-13 ${k.id}`,equation,factors:{...k.factors},cd};
 });
}

/** Tensile stress area of a UNC threaded rod, At = 0.7854(d − 0.9743/n)²; 0.75Ab where the thread is not tabulated. */
export function rodStressArea(diameter:number){
 const threads:Record<string,number>={'0.5':13,'0.625':11,'0.75':10,'0.875':9,'1':8,'1.125':7,'1.25':7,'1.375':6,'1.5':6};
 const d=diameter/inch,key=Object.keys(threads).find(v=>Math.abs(Number(v)-d)<1e-3);
 return key?.7854*(d-.9743/threads[key])**2*inch**2:.75*Math.PI*diameter**2/4;
}

/**
 * Runway seismic data for a runway added to an existing building (review B11). Masses: both runways' girders and
 * rails (taken identical), one crane per aisle (bridge and trolley), and the lifted load only when it is rigidly
 * secured. Cs = SDS·Ie/R (not less than 0.044SDS·Ie or 0.01) of the existing lateral system. Across the runway the
 * crane's seismic force on this runway is Cs times its wheel loads here; along it, Cs times the same capped by
 * wheel friction μ. UNVERIFIED: TR-13 §3.10 5a/7a forms as quoted in the review.
 */
export function runwaySiteSeismic(p:ProjectInput){
 const s=p.existingColumn?.enabled&&!p.existingColumn.isNew?p.existingColumn.siteSeismic:undefined;if(!s?.enabled)return undefined;
 const Cs=Math.max(s.SDS*s.Ie/s.R,.044*s.SDS*s.Ie,.01);
 return {Cs,input:s,mass:runwayMass(p,s.liftedLoadSecured),
  /** Factor on each wheel's empty (and, when secured, lifted) load for the seismic force across and along the runway. */
  across:Cs,along:Math.min(Cs,s.friction)};
}
/**
 * Weight the runway adds to the building as seismic mass: both runways' girders, rails and runway dead load (the
 * other runway taken identical to this one), one crane per aisle (bridge and trolley, or twice this runway's empty
 * wheel loads without a crane design), and the rated load only when it is rigidly secured.
 */
export function runwayMass(p:ProjectInput,secured=false){
 const length=p.spans.reduce((a,b)=>a+b,0),line=sectionProperties(p.section).weight+p.railWeight+p.deadLoad;
 const d=p.cranes[0].design,crane=d&&d.bridgeWeight+d.trolleyWeight>0?d.bridgeWeight+d.trolleyWeight:2*Math.max(...p.cranes.map(c=>c.wheels.reduce((a,w)=>a+w.unloaded,0)));
 const lifted=secured&&d?d.ratedLoad:0;
 return {runways:2*length*line,line,crane,lifted,total:2*length*line+crane+lifted};
}
export interface SeismicCraneCombination extends CraneCombination {seismic:number;}
/** TR-13 5a and 7a with the runway seismic force, added to the runway combinations when site seismic data is given. */
export function seismicCraneCombinations(p:ProjectInput):SeismicCraneCombination[]{
 if(!runwaySiteSeismic(p))return [];
 return p.method==='LRFD'?[
  {id:'5a-E',equation:'1.2D+1.2C_{dm}+1.0E+C_{vs}+L',d:1.2,cd:1.2,cv:1,h:0,l:0,i:0,live:1,bumper:0,single:true,seismic:1},
  {id:'7a-E',equation:'0.9D+C_{dm}+1.0E',d:.9,cd:1,cv:0,h:0,l:0,i:0,live:0,bumper:0,single:true,seismic:1}
 ]:[
  {id:'5a-E',equation:'D+C_{dm}+0.7E+C_{vs}+L',d:1,cd:1,cv:1,h:0,l:0,i:0,live:1,bumper:0,single:true,seismic:.7},
  {id:'7a-E',equation:'0.6D+C_{dm}+0.7E',d:.6,cd:1,cv:0,h:0,l:0,i:0,live:0,bumper:0,single:true,seismic:.7}
 ];
}

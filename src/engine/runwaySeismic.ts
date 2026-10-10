import type {ProjectInput} from './types';

/**
 * Seismic design of new freestanding runway columns as an ASCE 7-16 cantilever column system
 * (Table 12.2-1 G.1 special / G.2 ordinary steel cantilever column systems), equivalent lateral force
 * across the runway. The seismic weight at each support is the runway dead reaction plus the empty crane
 * reaction, with the column's own weight, lumped at the girder's mid-depth. The period-dependent
 * reduction of Cs is not taken (Cs = SDS Ie / R, the short-period plateau), which is conservative.
 * Along the runway the crane-level bracing resists seismic forces; it is checked separately.
 */
export const cantileverSystems={
 ordinary:{label:'Steel ordinary cantilever column system (G.2)',R:1.25,Omega0:1.25,Cd:1.25,allowed:['A','B','C']},
 special:{label:'Steel special cantilever column system (G.1)',R:2.5,Omega0:1.25,Cd:2.5,allowed:['A','B','C','D','E','F']}
} as const;
/** §12.2.5.2 and Table 12.2-1: cantilever column systems are limited to 35 ft above the base. */
export const cantileverHeightLimit=35*304.8;

export interface SeismicBasis {SDS:number;sdc:string;R:number;Omega0:number;Cd:number;Ie:number;rho:number;Cs:number;system:keyof typeof cantileverSystems;
 /** SDC A: only the §1.4.2 structural integrity force, 0.01W, without overstrength. */
 integrityOnly:boolean;}
export function seismicBasis(p:ProjectInput):SeismicBasis|undefined{
 const c=p.existingColumn,s=c?.seismic;if(!c?.enabled||!c.isNew||!s?.enabled)return undefined;
 const sys=cantileverSystems[s.system];
 // §12.8.1.1: Cs = SDS/(R/Ie), not less than 0.044 SDS Ie or 0.01. SDC A (§11.7): the §1.4.2 force 0.01W only.
 const integrityOnly=s.sdc==='A',Cs=integrityOnly?.01:Math.max(s.SDS*s.Ie/sys.R,.044*s.SDS*s.Ie,.01);
 return {SDS:s.SDS,sdc:s.sdc,R:sys.R,Omega0:integrityOnly?1:sys.Omega0,Cd:sys.Cd,Ie:s.Ie,rho:integrityOnly?1:s.rho,Cs,system:s.system,integrityOnly};
}

/**
 * ASCE 7-16 §2.3.6 / §2.4.5 with §12.4.2.3, and with overstrength (§12.4.3.2) for the base, anchors and
 * footing of a cantilever column system (§12.2.5.2). D includes the vertical seismic effect 0.2SDS D.
 * L is the static crane vertical (empty crane plus lifted load) without impact or side thrust.
 * fs is the overturning and sliding safety factor required with that combination: 1.0, since the
 * combinations already reduce the dead load and amplify the seismic effect.
 */
export interface SeismicCombination {id:string;equation:string;D:number;L:number;E:number;overstrength:boolean;fs:number;}
export function seismicCombinations(method:ProjectInput['method'],b:SeismicBasis):SeismicCombination[]{
 const S=b.integrityOnly?0:b.SDS,r=b.rho,o=b.Omega0,fix=(v:number)=>Number(v.toFixed(3));
 const basic:SeismicCombination[]=method==='LRFD'?[
  {id:'6-E',equation:`(1.2 + 0.2SDS)D + ρQE + L`,D:1.2+.2*S,L:1,E:r,overstrength:false,fs:1},
  {id:'7-E',equation:`(0.9 − 0.2SDS)D + ρQE`,D:.9-.2*S,L:0,E:r,overstrength:false,fs:1}
 ]:[
  {id:'8-E',equation:`(1.0 + 0.14SDS)D + 0.7ρQE`,D:1+.14*S,L:0,E:.7*r,overstrength:false,fs:1},
  {id:'9-E',equation:`(1.0 + 0.105SDS)D + 0.525ρQE + 0.75L`,D:1+.105*S,L:.75,E:.525*r,overstrength:false,fs:1},
  {id:'10-E',equation:`(0.6 − 0.14SDS)D + 0.7ρQE`,D:.6-.14*S,L:0,E:.7*r,overstrength:false,fs:1}
 ];
 // SDC A has no overstrength requirement: the base takes the same §1.4.2 combinations.
 const amplified=basic.map(k=>b.integrityOnly?{...k,id:`${k.id} (§1.4.2)`,overstrength:true}:{...k,id:`${k.id} Ωo`,equation:k.equation.replace('ρQE','ΩoQE'),E:k.E/r*o,overstrength:true});
 return [...basic,...amplified].map(k=>({...k,D:fix(k.D),E:fix(k.E)}));
}
/** Seismic design category from SDS alone (Table 11.6-1, Risk Category I-III); the entered SDC governs. */
export const sdcFromSDS=(SDS:number)=>SDS<.167?'A':SDS<.33?'B':SDS<.5?'C':'D';

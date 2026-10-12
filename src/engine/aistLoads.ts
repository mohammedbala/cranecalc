import type { Crane, ProjectInput } from './types';
export type AistInputs=NonNullable<ProjectInput['aist']>;
export type CraneDesign=NonNullable<Crane['design']>;
// Zeros are missing project data, never a verified engineering assumption.
export const emptyAistInputs: AistInputs={buildingClass:'C',classConfirmed:false,buildingCycles:0,environment:'interior',railDepth:0,bearingLength:0,netFlangeArea:0,bottomBraceSpacing:0,axialLength:0,torsionalLength:0,liveLoad:0,runwayOnly:false,supportType:'bracket',clipSpacing:762,railPad:false,fastener:'clips',camber:0,fatiguePoint:'top-left',fatigueReference:'',cycleSource:''};
export const emptyCraneDesign: CraneDesign={control:'cab',type:'mill',ratedLoad:0,trolleyWeight:0,bridgeWeight:0,rigidArmWeight:0,drivenWheelLoad:0,sideShare:.5,distributionSource:'',splitConfirmed:false,bumperForce:0,bumperBypassesGirder:false,guideRollers:false};
export function aistCraneMinimum(c:Crane){
 const d=c.design??emptyCraneDesign;
 const percentages={mill:[.25,.4],magnet:[.25,1],maintenance:[.2,.3],stacker:[.25,2]} as const;
 const [impact,side]=percentages[d.type];
 const Q=d.ratedLoad,T=d.trolleyWeight,B=d.bridgeWeight,A=d.type==='stacker'?d.rigidArmWeight:0;
 const totalSide=d.control==='pendant'?.1*(Q+T+B+A):Math.max(side*Q,(d.type==='stacker'?.4:.2)*(Q+T+A),(d.type==='stacker'?.15:.1)*(Q+T+B+A));
 return {impact:d.control==='pendant'?.1:impact,totalSide,runwaySide:totalSide*d.sideShare,traction:.2*d.drivenWheelLoad};
}
// ASCE/SEI 7-16 §§4.9.3-4.9.5 (unchanged in 7-22) powered bridge cranes:
// impact 25% cab/remote, 10% pendant; lateral 20% of rated load plus
// trolley/hoist; longitudinal 10% of this runway's maximum static wheel loads.
export function asceCraneMinimum(c:Crane){
 const d=c.design??emptyCraneDesign;
 const wheels=c.wheels.reduce((sum,w)=>sum+w.loaded/(c.includesImpact?1+c.impact:1),0);
 return {impact:d.control==='pendant'?.1:.25,totalSide:.2*(d.ratedLoad+d.trolleyWeight),longitudinal:.1*wheels};
}
// Without a stiffness analysis of both runways, neither runway is credited
// with less than half of the whole-crane side thrust.
export const minimumSideShare=.5;
/** Governing design minimum: the greater of AIST TR-13 and ASCE 7 §4.9. */
export function craneDesignMinimum(c:Crane){
 const d=c.design??emptyCraneDesign,aist=aistCraneMinimum(c),asce=asceCraneMinimum(c);
 const share=Math.max(d.sideShare,minimumSideShare),totalSide=Math.max(aist.totalSide,asce.totalSide);
 return {aist,asce,share,impact:Math.max(aist.impact,asce.impact),totalSide,runwaySide:totalSide*share,traction:Math.max(aist.traction,asce.longitudinal)};
}
export interface CraneCombination {id:string;equation:string;d:number;cd:number;cv:number;h:number;l:number;i:number;live:number;bumper:number;single?:boolean;minimumLift?:boolean;}
/** The printed name of a crane combination id: 6/7 → 6 and 7, 10-T → 10 (traction), 10-B → 10 (bumper). */
export function combinationLabel(id:string){
 return id.replace(/^(\d+)-T$/,'$1 (traction)').replace(/^(\d+)-B$/,'$1 (bumper)').replace(/^6\/7$/,'6 and 7');
}
/**
 * Traceability of each crane combination: the AIST TR-13 §3.10 case it is (AISC DG7 3rd ed. gives the same LRFD cases,
 * 2b on p. 55 and 2c on p. 56 as corrected by the DG7 errata of February 16, 2023) and the ASCE 7-16 combination it
 * is built on. Case numbers as transcribed from the TR-13 2020 committee draft (UNVERIFIED against the printed edition).
 * TR-13 numbers the cases after the ASCE 7 combinations they extend (1a, 2a-2c, 3a, 4a, 7a) and adds the crane cases.
 */
export function combinationBasis(method:ProjectInput['method'],id:string):{tr13:string;asce:string}{
 const lrfd:Record<string,string>={'1':'§2.3.1 (1)','1a':'§2.3.1 (1)','2':'§2.3.1 (2)','2a':'§2.3.1 (2)','2b':'§2.3.1 (2)','2c':'§2.3.1 (2)','3a':'§2.3.1 (3)','4a':'§2.3.1 (4)',
  '6/7':'§2.3.1 (5), §2.3.6 (7)','7a':'§2.3.1 (5), §2.3.6 (7)','8':'crane stop, 1.2D','9':'crane case, 0.9D','10-T':'crane case, 0.9D','10-B':'crane stop, 0.9D','C1':'§2.3.1 (2)','5a':'§2.3.6 (6)'};
 const asd:Record<string,string>={'1':'§2.4.1 (1)','1a':'§2.4.1 (1)','2':'§2.4.1 (2)','2a':'§2.4.1 (2)','2b':'§2.4.1 (2)','4a':'§2.4.1 (4)','4b':'§2.4.1 (4)','5a':'§2.4.1 (1)','6a1':'§2.4.1 (6)',
  '7':'§2.4.1 (7)','8':'§2.4.1 (7)','9':'crane stop, 1.0D','10':'crane case, 0.6D','11-T':'crane case, 0.6D','11-B':'crane stop, 0.6D','C1':'§2.4.1 (2)'};
 return {tr13:id==='C1'?'—':combinationLabel(id),asce:(method==='LRFD'?lrfd:asd)[id]??'—'};
}
/**
 * Combinations evaluated but not listed in the report: in the runway-only projection (no roof live, snow, rain, wind or
 * seismic load on the girder) they equal another case with no crane on the runway, or are bounded by one. Every crane
 * state, including no crane, is evaluated in each combination, so dropping them from the print loses nothing.
 */
export function combinationOmissions(method:ProjectInput['method']):{id:string;reason:string}[]{
 return method==='LRFD'?[{id:'1',reason:'1a with no crane on the runway'},{id:'2',reason:'2a with no crane on the runway'},{id:'6/7',reason:'7a with no crane on the runway'},
  {id:'3a',reason:'bounded by 2a (1.0L ≤ 1.6L; no roof live, snow or rain load on the girder)'},{id:'4a',reason:'bounded by 2a (no wind on the girder; 2a adds the side thrust and traction)'}]
  :[{id:'1',reason:'1a with no crane on the runway'},{id:'2',reason:'2a with no crane on the runway'},{id:'5a',reason:'equal to 1a'},{id:'7',reason:'8 with no crane on the runway'},
  {id:'6a1',reason:'bounded by 4a (4a adds the side thrust and traction)'}];
}
// TR13 February 24, 2020 ballot draft §§3.10.2.1/2.2. These are the
// runway-only projections: roof, wind, seismic, fluid, soil and thermal loads
// require a separate building/load-path design. L is the entered runway UDL.
/**
 * AIST TR-13 crane combinations. With `concurrent`, the plain ASCE 7 reading is added: every crane load is
 * live load, so impact acts with side thrust and with every crane present (no single-crane restriction).
 */
export function craneCombinations(method:ProjectInput['method'],concurrent=false):CraneCombination[]{
 const all=tr13Combinations(method);
 if(!concurrent)return all;
 return [...all,...(method==='LRFD'?[
  // ASCE 7 2.3.1 combination 2, with all crane loads as L.
  {id:'C1',equation:'1.2(D+C_d)+1.6(C_v+C_i+C_{ss}+C_{ls}+L)',d:1.2,cd:1.2,cv:1.6,h:1.6,l:1.6,i:1.6,live:1.6,bumper:0}
 ]:[
  // ASCE 7 2.4.1 combination 2, with all crane loads as L.
  {id:'C1',equation:'D+C_d+C_v+C_i+C_{ss}+C_{ls}+L',d:1,cd:1,cv:1,h:1,l:1,i:1,live:1,bumper:0}
 ])];
}
function tr13Combinations(method:ProjectInput['method']):CraneCombination[]{
 if(method==='LRFD')return [
  {id:'1',equation:'1.4D',d:1.4,cd:0,cv:0,h:0,l:0,i:0,live:0,bumper:0},
  {id:'1a',equation:'1.4D+1.4C_{dm}',d:1.4,cd:1.4,cv:0,h:0,l:0,i:0,live:0,bumper:0},
  {id:'2',equation:'1.2D+1.6L',d:1.2,cd:0,cv:0,h:0,l:0,i:0,live:1.6,bumper:0},
  {id:'2a',equation:'1.2(D+C_{dm})+1.6L+C_{vm}+C_{ss}+C_{ls}',d:1.2,cd:1.2,cv:1,h:1,l:1,i:0,live:1.6,bumper:0},
  {id:'2b',equation:'1.2(D+C_{dm})+1.6(C_{vm}+C_{ss}+C_{ls})+L',d:1.2,cd:1.2,cv:1.6,h:1.6,l:1.6,i:0,live:1,bumper:0},
  {id:'2c',equation:'1.2(D+C_{ds})+1.6(C_{vs}+C_i+C_{ls})+L',d:1.2,cd:1.2,cv:1.6,h:0,l:1.6,i:1.6,live:1,bumper:0,single:true},
  {id:'3a',equation:'1.2(D+C_{dm})+C_{vm}+C_{ss}+C_{ls}+L',d:1.2,cd:1.2,cv:1,h:1,l:1,i:0,live:1,bumper:0},
  {id:'4a',equation:'1.2(D+C_{dm})+C_{vm}+L',d:1.2,cd:1.2,cv:1,h:0,l:0,i:0,live:1,bumper:0},
  {id:'6/7',equation:'0.9D',d:.9,cd:0,cv:0,h:0,l:0,i:0,live:0,bumper:0},
  {id:'7a',equation:'0.9D+C_{dm}',d:.9,cd:1,cv:0,h:0,l:0,i:0,live:0,bumper:0},
  {id:'8',equation:'1.2(D+C_{ds})+C_{vs}+C_{bs}',d:1.2,cd:1.2,cv:1,h:0,l:0,i:0,live:0,bumper:1,single:true},
  {id:'9',equation:'0.9(D+C_{ds})+1.6C_{vs,min}+1.6C_{ss}',d:.9,cd:.9,cv:1.6,h:1.6,l:0,i:0,live:0,bumper:0,single:true,minimumLift:true},
  {id:'10-T',equation:'0.9(D+C_{ds})+1.6C_{ls}',d:.9,cd:.9,cv:0,h:0,l:1.6,i:0,live:0,bumper:0,single:true},
  {id:'10-B',equation:'0.9(D+C_{ds})+C_{bs}',d:.9,cd:.9,cv:0,h:0,l:0,i:0,live:0,bumper:1,single:true}
 ];
 return [
  {id:'1',equation:'D',d:1,cd:0,cv:0,h:0,l:0,i:0,live:0,bumper:0},
  {id:'1a',equation:'D+C_{dm}',d:1,cd:1,cv:0,h:0,l:0,i:0,live:0,bumper:0},
  {id:'2',equation:'D+L',d:1,cd:0,cv:0,h:0,l:0,i:0,live:1,bumper:0},
  {id:'2a',equation:'D+C_{dm}+C_{vm}+C_{ss}+C_{ls}+L',d:1,cd:1,cv:1,h:1,l:1,i:0,live:1,bumper:0},
  {id:'2b',equation:'D+C_{ds}+C_{vs}+C_i+C_{ls}+L',d:1,cd:1,cv:1,h:0,l:1,i:1,live:1,bumper:0,single:true},
  {id:'4a',equation:'D+C_{dm}+0.75(C_{vm}+C_{ss}+C_{ls}+L)',d:1,cd:1,cv:.75,h:.75,l:.75,i:0,live:.75,bumper:0},
  {id:'4b',equation:'D+C_{ds}+0.75(C_{vs}+C_i+C_{ls}+L)',d:1,cd:1,cv:.75,h:0,l:.75,i:.75,live:.75,bumper:0,single:true},
  {id:'5a',equation:'D+C_{dm}',d:1,cd:1,cv:0,h:0,l:0,i:0,live:0,bumper:0},
  {id:'6a1',equation:'D+C_{dm}+0.75(C_{vm}+L)',d:1,cd:1,cv:.75,h:0,l:0,i:0,live:.75,bumper:0},
  {id:'7',equation:'0.6D',d:.6,cd:0,cv:0,h:0,l:0,i:0,live:0,bumper:0},
  {id:'8',equation:'0.6D+C_{dm}',d:.6,cd:1,cv:0,h:0,l:0,i:0,live:0,bumper:0},
  {id:'9',equation:'D+C_{ds}+C_{vs}+0.67C_{bs}',d:1,cd:1,cv:1,h:0,l:0,i:0,live:0,bumper:.67,single:true},
  {id:'10',equation:'0.6(D+C_{ds})+C_{vs,min}+C_{ss}',d:.6,cd:.6,cv:1,h:1,l:0,i:0,live:0,bumper:0,single:true,minimumLift:true},
  {id:'11-T',equation:'0.6(D+C_{ds})+C_{vs,min}+C_{ls}',d:.6,cd:.6,cv:1,h:0,l:1,i:0,live:0,bumper:0,single:true,minimumLift:true},
  {id:'11-B',equation:'0.6(D+C_{ds})+C_{vs,min}+0.67C_{bs}',d:.6,cd:.6,cv:1,h:0,l:0,i:0,live:0,bumper:.67,single:true,minimumLift:true}
 ];
}

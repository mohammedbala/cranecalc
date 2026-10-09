import { exampleProject } from '../../src/engine/defaults';
import { emptyAistInputs,emptyCraneDesign } from '../../src/engine/aistLoads';
export function designProject(){
 const p=structuredClone(exampleProject);
 p.aist={...emptyAistInputs,buildingClass:'A',buildingCycles:600000,classConfirmed:true,railDepth:150,bearingLength:200,bottomBraceSpacing:7620,axialLength:7620,torsionalLength:7620,runwayOnly:true,fatigueReference:'A-3.1 item 5.8; actual transverse stiffener detail S12',cycleSource:'Owner: 2,000,000 equivalent full-range stress fluctuations including loaded/empty return and each wheel'};
 p.fatigue.detail='Continuous transverse stiffener weld toe at selected flange edge; cyclic AWS detail on S12';
 p.cranes[0].loadSource='Manufacturer project wheel schedule, revision 3';
 p.cranes[0].design={...emptyCraneDesign,ratedLoad:136000,trolleyWeight:18000,bridgeWeight:70000,drivenWheelLoad:110000,distributionSource:'Supplier: 50% of whole-crane side thrust on this runway',splitConfirmed:true,bumperBypassesGirder:true};
 return p;
}

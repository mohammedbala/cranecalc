import type {ProjectInput} from './types';
import type {ExistingLoadKey} from './existingColumnInputs';

export type AsceFactors=Record<ExistingLoadKey,number>;
export interface AsceCombination {id:string;equation:string;factors:AsceFactors;}
const f=(factors:Partial<AsceFactors>):AsceFactors=>({D:0,L:0,Lr:0,S:0,R:0,W:0,E:0,...factors});
// ASCE/SEI 7-16 §2.3.1/§2.3.6 (LRFD) and §2.4.1/§2.4.5 (ASD); the basic forms are unchanged in 7-22.
// Crane loads are live load L (§4.9). The 0.5L reduction is not used: cranes are not uniform occupancy loads.
// E is the entered seismic load effect, including any vertical component.
const lrfd:AsceCombination[]=[
 {id:'1',equation:'1.4D',factors:f({D:1.4})},
 {id:'2-Lr',equation:'1.2D + 1.6L + 0.5Lr',factors:f({D:1.2,L:1.6,Lr:.5})},
 {id:'2-S',equation:'1.2D + 1.6L + 0.5S',factors:f({D:1.2,L:1.6,S:.5})},
 {id:'2-R',equation:'1.2D + 1.6L + 0.5R',factors:f({D:1.2,L:1.6,R:.5})},
 {id:'3-Lr-L',equation:'1.2D + 1.6Lr + L',factors:f({D:1.2,Lr:1.6,L:1})},
 {id:'3-Lr-W',equation:'1.2D + 1.6Lr + 0.5W',factors:f({D:1.2,Lr:1.6,W:.5})},
 {id:'3-S-L',equation:'1.2D + 1.6S + L',factors:f({D:1.2,S:1.6,L:1})},
 {id:'3-S-W',equation:'1.2D + 1.6S + 0.5W',factors:f({D:1.2,S:1.6,W:.5})},
 {id:'3-R-L',equation:'1.2D + 1.6R + L',factors:f({D:1.2,R:1.6,L:1})},
 {id:'3-R-W',equation:'1.2D + 1.6R + 0.5W',factors:f({D:1.2,R:1.6,W:.5})},
 {id:'4-Lr',equation:'1.2D + 1.0W + L + 0.5Lr',factors:f({D:1.2,W:1,L:1,Lr:.5})},
 {id:'4-S',equation:'1.2D + 1.0W + L + 0.5S',factors:f({D:1.2,W:1,L:1,S:.5})},
 {id:'4-R',equation:'1.2D + 1.0W + L + 0.5R',factors:f({D:1.2,W:1,L:1,R:.5})},
 {id:'5',equation:'1.2D + 1.0E + L + 0.2S',factors:f({D:1.2,E:1,L:1,S:.2})},
 {id:'6',equation:'0.9D + 1.0W',factors:f({D:.9,W:1})},
 {id:'7',equation:'0.9D + 1.0E',factors:f({D:.9,E:1})}
];
const asd:AsceCombination[]=[
 {id:'1',equation:'D',factors:f({D:1})},
 {id:'2',equation:'D + L',factors:f({D:1,L:1})},
 {id:'3-Lr',equation:'D + Lr',factors:f({D:1,Lr:1})},
 {id:'3-S',equation:'D + S',factors:f({D:1,S:1})},
 {id:'3-R',equation:'D + R',factors:f({D:1,R:1})},
 {id:'4-Lr',equation:'D + 0.75L + 0.75Lr',factors:f({D:1,L:.75,Lr:.75})},
 {id:'4-S',equation:'D + 0.75L + 0.75S',factors:f({D:1,L:.75,S:.75})},
 {id:'4-R',equation:'D + 0.75L + 0.75R',factors:f({D:1,L:.75,R:.75})},
 {id:'5-W',equation:'D + 0.6W',factors:f({D:1,W:.6})},
 {id:'5-E',equation:'D + 0.7E',factors:f({D:1,E:.7})},
 {id:'6a-Lr',equation:'D + 0.75L + 0.75(0.6W) + 0.75Lr',factors:f({D:1,L:.75,W:.45,Lr:.75})},
 {id:'6a-S',equation:'D + 0.75L + 0.75(0.6W) + 0.75S',factors:f({D:1,L:.75,W:.45,S:.75})},
 {id:'6a-R',equation:'D + 0.75L + 0.75(0.6W) + 0.75R',factors:f({D:1,L:.75,W:.45,R:.75})},
 {id:'6b',equation:'D + 0.75L + 0.75(0.7E) + 0.75S',factors:f({D:1,L:.75,E:.525,S:.75})},
 {id:'7',equation:'0.6D + 0.6W',factors:f({D:.6,W:.6})},
 {id:'8',equation:'0.6D + 0.7E',factors:f({D:.6,E:.7})}
];
/** Combinations with wind or seismic are evaluated in both directions. */
export function asceCombinations(method:ProjectInput['method']):AsceCombination[]{
 return (method==='LRFD'?lrfd:asd).flatMap(c=>c.factors.W||c.factors.E?[1,-1].map(sign=>({id:`${c.id}${sign>0?'+':'−'}`,equation:sign>0?c.equation:`${c.equation}, ${c.factors.W?'W':'E'} reversed`,factors:{...c.factors,W:c.factors.W*sign,E:c.factors.E*sign}})):[c]);
}

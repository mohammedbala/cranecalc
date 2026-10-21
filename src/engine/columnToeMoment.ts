/**
 * The part of a bracket's moment V·e_c that bends the receiving column where the bracket is welded to its flange.
 * Canonical units mm, N.
 */
import {columnResponse,type ColumnBoundary} from './columnAnalysis';
import {bracketForceLevels} from './columnStiffeners';
import {format} from './units';
import type {ProjectInput} from './types';

export interface ColumnToeShare {
 /** Largest column moment over the bracket depth per unit bracket moment: the factor on V·e_c/S_c at the weld toes. */
 factor:number;
 /** Column moment per unit bracket moment just below the bracket (its bottom toe) and just above it (the seat toe). */
 below:number;above:number;
 /** The basis, for the check notes. */
 text:string;
}
const cache=new WeakMap<object,{key:string;value:ColumnToeShare}>();
/**
 * The bracket delivers V·e_c to the receiving column as a horizontal couple at its two force levels (the seat or top
 * flange, and the rib bottom or bottom flange: bracketForceLevels). The column carries it by the strong-axis model of
 * the existing-column checks (columnResponse, its entered base and top conditions): part flows down to the base and
 * part up to the top support, so the column flange is bent by less than V·e_c at the bracket's weld toes. The factor
 * is the largest moment between the bottom of the lower force level and the top of the upper one, over the couple at
 * the outer and the inner edges of the two levels, so it holds at every weld toe in the bracket depth (rib or flange
 * ends, column stiffener fillets). Where the frame data that establish the end conditions are not entered, the
 * entered conditions and a fixed base are both evaluated and the larger moment is taken. Without the column model
 * (no height, seat elevation or end conditions) the whole V·e_c is taken, the bound of a column fixed at its base
 * and free above the bracket.
 */
export function columnToeShare(p:ProjectInput):ColumnToeShare{
 const b=p.details?.bracket,c=p.existingColumn;
 const key=JSON.stringify([c?.enabled,c?.isNew,c?.height,c?.seatElevation,c?.strong,c?.frame?.source?.trim()?1:0,b?.arrangement,b?.seatThickness,b?.ribDepth,b?.tipDepth,p.units]);
 const hit=b&&cache.get(b);if(hit&&hit.key===key)return hit.value;
 const value=compute(p);if(b)cache.set(b,{key,value});return value;
}
function compute(p:ProjectInput):ColumnToeShare{
 const b=p.details?.bracket,c=p.existingColumn,f=(v:number)=>format(v,'length',p.units,3);
 const whole=(why:string):ColumnToeShare=>({factor:1,below:1,above:1,text:`${why}: the whole bracket moment V·e_c is taken on the column section at the weld toes (the bound of a column fixed at its base and free above the bracket).`});
 if(!b||!c?.enabled||!(c.height>0)||!(c.seatElevation>0))return whole('The receiving column height, seat elevation and end conditions are not entered');
 const lv=b&&bracketForceLevels(b,0);if(!lv)return whole('The bracket force levels at the column are not defined');
 const [up,low]=lv.levels,hs=c.seatElevation,top=hs+up.band[1],bottom=hs+low.band[0];
 if(bottom<=0||top>=c.height)return whole('The bracket does not lie between the column base and top support');
 const established=!!c.isNew||!!c.frame?.source?.trim();
 const ends:ColumnBoundary[]=[c.strong,...(!established&&c.strong.base!=='fixed'?[{base:'fixed' as const,top:c.strong.top}]:[])];
 const placements=([[up.band[1],low.band[0]],[up.band[0],low.band[1]]] as const).map(([u,l])=>[hs+u,hs+l]).filter(([u,l])=>u-l>1);
 let factor=0,below=0,above=0;
 try{
  for(const end of ends)for(const [u,l] of placements){
   const r=columnResponse(c.height,1,end,[{x:u,force:1/(u-l)},{x:l,force:-1/(u-l)}],[bottom,top]);
   for(const v of r.samples){const m=Math.abs(v.moment);
    if(v.x>=bottom-1e-6&&v.x<=top+1e-6)factor=Math.max(factor,m);
    if(Math.abs(v.x-bottom)<1e-6)below=Math.max(below,m);
    if(Math.abs(v.x-top)<1e-6)above=Math.max(above,m);}
  }
 }catch{return whole('The column model of the existing-column checks is not stable for the entered end conditions');}
 if(!(factor>0))return whole('The column model gives no moment at the bracket');
 const k=(v:number)=>v.toFixed(2),endText=ends.map(e=>`${e.base} base, ${e.top} top`).join('; and ');
 return {factor,below,above,text:`Column moment at the bracket from the strong-axis column model of the existing-column checks (${endText}${established?'':', the larger: the frame data that establish the column end conditions are not entered'}; H = ${f(c.height)}, seat ${f(hs)} above the base): V·e_c enters the column as a horizontal couple at the bracket's force levels, the ${up.name} and the ${low.name}, between ${f(bottom)} and ${f(top)} above the base, at the outer and at the inner edges of the two levels. The column carries ${k(below)} V·e_c just below the bracket and ${k(above)} V·e_c just above it, the rest flowing to the other side; the largest over the bracket depth, ${k(factor)} V·e_c, is taken at every weld toe on the flange.`};
}

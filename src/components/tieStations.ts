import type {ProjectInput} from '../engine/types';
import {independentBearings} from '../engine/simpleSupports';
export function alternativeTieStations(p:ProjectInput,endSetback?:number){
 const L=p.spans.reduce((a,b)=>a+b,0),setback=endSetback??p.details?.brace.flangeAttachment?.longitudinalSetback??50.8;
 if(p.system==='simple')return independentBearings(p).map(e=>({id:`bay-${e.bay}-${e.end}`,station:e.station/1000-L/2000,x:(e.center+(e.end==='left'?-1:1)*setback)/1000-L/2000}));
 let x=0;return [0,...p.spans.map(v=>(x+=v))].map((at,i)=>({id:`S${i+1}`,station:at/1000-L/2000,x:at/1000-L/2000}));
}

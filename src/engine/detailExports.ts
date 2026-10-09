import {toDisplay} from './units';
import type {CalculationSnapshot} from './types';
export function interfaceCsv(s:CalculationSnapshot){
 if(!s.eligible||!s.detailResults)throw Error('A validated detailed snapshot is required.');
 const quote=(v:unknown)=>`"${String(v??'').replaceAll('"','""')}"`;
 const us=s.input.units==='US',length=(v:number)=>us?toDisplay(v,'length','US'):v,force=(v:number)=>us?toDisplay(v,'force','US'):v,moment=(v:number)=>us?toDisplay(v,'moment','US'):v;
 const rows:unknown[][]=[['revision','case','combination','station_mm','vertical_down_N','top_lateral_N','bottom_lateral_N','longitudinal_N',s.input.section.kind==='cap'?'torque_about_shear_center_Nmm':'torque_Nmm','side_sign','crane_origins_mm_loaded','controls','individual_girder_ends_N_mm_json','seat_offset_moment_sum_V_times_dx_Nmm']];
 for(const r of s.detailResults.interfaces)rows.push([s.revision,r.id,r.combination,length(r.x),force(r.vertical),force(r.top),force(r.bottom),force(r.longitudinal),moment(r.torque),r.lateralSign,r.cranes.map(c=>`${c.index+1}@${length(c.origin)}:${c.loaded?'loaded':'empty'}`).join(';'),r.controls.join(';'),r.ends?JSON.stringify(r.ends.map(v=>({...v,vertical:force(v.vertical),top:force(v.top),bottom:force(v.bottom),longitudinal:force(v.longitudinal),offset:length(v.offset)}))):'',r.seatMoment===undefined?'':moment(r.seatMoment)]);
 for(const [i,c] of s.input.cranes.entries())for(const sign of [-1,1])rows.push([s.revision,`BUMPER-${i+1}`,'Separate full-speed building-mounted stop','end stop - coordinate location',0,0,0,force(sign*(c.design?.bumperForce??0)),'not evaluated',0,'girder bypass','stop, building and foundation capacity excluded','','']);
 if(us)rows[0]=rows[0].map(v=>String(v).replaceAll('Nmm','kip_ft').replaceAll('N_mm','kip_in').replaceAll('_mm','_in').replaceAll('_N','_kip'));
 return rows.map(r=>r.map(quote).join(',')).join('\r\n');
}

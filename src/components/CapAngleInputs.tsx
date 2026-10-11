import type {ReactNode} from 'react';
import type {RunwayDetails} from '../engine/runwayDetails';
import {capAngleInput,type CapAngleInput} from '../engine/capAngle';
import {initialColumnStiffeners} from '../engine/columnStiffenerInputs';
import {aiscAngles} from '../data/aiscAngles';
import {formatSectionMass,type Quantity} from '../engine/units';

const inch=25.4,diameters=[.5,.625,.75,.875,1].map(v=>v*inch);
/** Inputs of the cap tieback angle (arrangement 'cap-angle'), as for the other tie options. */
export default function CapAngleInputs({value,onChange,numeric,units}:{value:RunwayDetails;onChange:(d:RunwayDetails)=>void;units:'US'|'SI';numeric:(label:string,v:number,change:(v:number)=>void,q?:Quantity)=>ReactNode}){
 const c=capAngleInput(value),edit=(patch:Partial<CapAngleInput>)=>onChange({...value,brace:{...value.brace,capAngle:{...c,...patch}}});
 const num=(label:string,v:number,set:(v:number)=>void)=>numeric(label,v,set);
 const bolt=(label:string,group:'capBolts'|'lapBolts'|'columnBolts')=><label className="field"><span>{label}</span><select aria-label={label} value={c[group].diameter} onChange={e=>edit({[group]:{...c[group],diameter:Number(e.target.value)}} as Partial<CapAngleInput>)}>{diameters.map(d=><option key={d} value={d}>{units==='US'?`${d/inch} in`:`${d.toFixed(1)} mm (${d/inch} in)`} A325</option>)}</select></label>;
 const r=value.bracket?.receiver,stiffener=c.stiffener;
 return <details className="form-details" open><summary>Cap tieback angle · bolted to the channel cap</summary>
  <label className="field"><span>AISC cap angle (long leg toward the column)</span><select aria-label="AISC cap angle" value={c.shape} onChange={e=>edit({shape:e.target.value})}>{aiscAngles.filter(s=>s.d>=3&&s.t>=.375).map(s=><option key={s.name} value={s.name}>{s.name} · {formatSectionMass(s.weight,units)}</option>)}</select></label>
  <label className="field"><span>Cap bolts in the angle slots</span><select aria-label="Cap bolt mode" value={c.mode} onChange={e=>edit({mode:e.target.value as CapAngleInput['mode']})}><option value="sleeved">Pretensioned against steel sleeves</option><option value="snug-tight">Snug-tight (not permitted: open item)</option></select></label>
  <div className="field-grid">
   {num('Angle length along runway',c.length,v=>edit({length:v}))}
   {num('Girder end to tie centerline',c.setback,v=>edit({setback:v}))}
   {bolt('Cap bolt diameter','capBolts')}
   {num('Cap bolts below top of cap',c.capBolts.gauge,v=>edit({capBolts:{...c.capBolts,gauge:v}}))}
   {num('Cap bolt pitch',c.capBolts.pitch,v=>edit({capBolts:{...c.capBolts,pitch:v}}))}
   {num('Slot travel each way',c.travel,v=>edit({travel:v}))}
   {c.mode==='sleeved'&&num('Sleeve wall',c.sleeveWall,v=>edit({sleeveWall:v}))}
   {num('Plate washer thickness',c.washerThickness,v=>edit({washerThickness:v}))}
   {num('Tie plate thickness',c.plateThickness,v=>edit({plateThickness:v}))}
   {num('Tie plate width',c.plateWidth,v=>edit({plateWidth:v}))}
   {bolt('Lap bolt diameter','lapBolts')}
   {num('Lap bolts from back of angle',c.lapBolts.gauge,v=>edit({lapBolts:{...c.lapBolts,gauge:v}}))}
   {num('Lap bolt pitch',c.lapBolts.pitch,v=>edit({lapBolts:{...c.lapBolts,pitch:v}}))}
   {num('Lap bolts to tie plate end',c.lapBolts.edge,v=>edit({lapBolts:{...c.lapBolts,edge:v}}))}
   {num('End plate thickness',c.endPlate.thickness,v=>edit({endPlate:{...c.endPlate,thickness:v}}))}
   {num('End plate height',c.endPlate.height,v=>edit({endPlate:{...c.endPlate,height:v}}))}
   {num('End plate width',c.endPlate.width,v=>edit({endPlate:{...c.endPlate,width:v}}))}
   {bolt('Column bolt diameter','columnBolts')}
   {num('Column bolts from tie plate centerline',c.columnBolts.gauge,v=>edit({columnBolts:{...c.columnBolts,gauge:v}}))}
   {num('Shim pack, maximum',c.shimMax,v=>edit({shimMax:v}))}
   {num('End plate fillet size',c.weldSize,v=>edit({weldSize:v}))}
   {!value.bracket?.enabled&&num('Web centerline to column face',c.columnFace??value.brace.flangeAttachment?.columnFace??508,v=>edit({columnFace:v}))}
  </div>
  <label className="checkbox"><input type="checkbox" aria-label="Column stiffener at the tie level" checked={!!stiffener?.enabled} onChange={e=>edit({stiffener:e.target.checked?{...(stiffener??(r?initialColumnStiffeners(r,undefined,c.endPlate.thickness):initialColumnStiffeners({depth:355.6,width:368.3,flangeThickness:18,webThickness:11.2},undefined,c.endPlate.thickness))),enabled:true}:stiffener?{...stiffener,enabled:false}:undefined})}/> Column stiffener at the tie level (when the column flange check needs it)</label>
  {stiffener?.enabled&&<div className="field-grid">
   {num('Stiffener thickness',stiffener.thickness,v=>edit({stiffener:{...stiffener,thickness:v}}))}
   {num('Stiffener width',stiffener.width,v=>edit({stiffener:{...stiffener,width:v}}))}
   {num('Stiffener corner clip',stiffener.clip,v=>edit({stiffener:{...stiffener,clip:v}}))}
   {num('Stiffener flange fillet',stiffener.flangeWeld,v=>edit({stiffener:{...stiffener,flangeWeld:v}}))}
   {num('Stiffener web fillet',stiffener.webWeld,v=>edit({stiffener:{...stiffener,webWeld:v}}))}
  </div>}
  <p className="input-purpose"><b>Checks:</b> cap bolts and column bolts in tension with prying (AISC Manual Part 9), angle leg, channel flange, end plate and column flange bending, tie plate tension, compression and block shear, slip-critical lap bolts, shop fillets, shims, slot travel, sleeves, stiffness and fatigue. Requires a capped girder and the bolted end bearings.</p>
 </details>;
}

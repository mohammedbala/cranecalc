import type {ReactNode} from 'react';
import type {RunwayDetails} from '../engine/runwayDetails';
import {initialColumnStiffeners,type ColumnStiffenerInput} from '../engine/columnStiffenerInputs';
import {isRolledBracket,rolledStub} from '../engine/rolledBracketInputs';
import type {Quantity} from '../engine/units';

/**
 * Column stiffeners (continuity plates) in the receiving column at the bracket's force levels: a pair at the seat
 * (or the stub's top flange) and a pair at the rib bottom (or the stub's bottom flange), welded to the flange and web.
 */
export default function ColumnStiffenerInputs({value,onChange,numeric}:{value:RunwayDetails;onChange:(v:RunwayDetails)=>void;numeric:(label:string,value:number,onChange:(n:number)=>void,q?:Quantity)=>ReactNode}){
 const b=value.bracket!,s=b.columnStiffeners,st=isRolledBracket(b)?rolledStub(b):undefined;
 const set=(next:ColumnStiffenerInput)=>onChange({...value,bracket:{...b,columnStiffeners:next}});
 const edit=(patch:Partial<ColumnStiffenerInput>)=>set({...s!,...patch});
 const check=(label:string,checked:boolean,change:(v:boolean)=>void)=><label className="checkbox-field"><input type="checkbox" checked={checked} onChange={e=>change(e.target.checked)}/>{label}</label>;
 // Starting sizes from the receiving column and the plate that delivers the force (the seat, or the stub flange).
 const enable=(on:boolean)=>s?edit({enabled:on}):set({...initialColumnStiffeners(b.receiver,undefined,st?st.tf:b.seatThickness),enabled:on});
 return <div className="column-stiffener-inputs">
  {check('Column stiffeners (continuity plates) at the bracket',!!s?.enabled,enable)}
  {s?.enabled&&<>
   <p className="form-note">A pair of plates each side of the column web at the {st?'stub top and bottom flanges':'seat and the rib bottom'}, designed to AISC 360 J10.8 for the concentrated forces the unstiffened column cannot carry. Existing columns: field welded; the survey confirms the clearances.</p>
   <div className="field-grid">
    {numeric('Stiffener thickness',s.thickness,thickness=>edit({thickness}))}
    {numeric('Stiffener width from web face',s.width,width=>edit({width}))}
    <label className="field"><span>Stiffener length</span><select aria-label="Stiffener length" value={s.length} onChange={e=>edit({length:e.target.value as ColumnStiffenerInput['length']})}><option value="half">Half depth (to the column centerline)</option><option value="full">Full depth (both flanges)</option></select></label>
    {numeric('Corner clip',s.clip,clip=>edit({clip}))}
    {numeric('Stiffener-to-flange fillet',s.flangeWeld,flangeWeld=>edit({flangeWeld}))}
    {numeric('Stiffener-to-web fillet',s.webWeld,webWeld=>edit({webWeld}))}
    {numeric('Upper pair offset (up +)',s.upperOffset??0,upperOffset=>edit({upperOffset}))}
    {numeric('Lower pair offset (up +)',s.lowerOffset??0,lowerOffset=>edit({lowerOffset}))}
    {s.columnK!==undefined&&numeric('Column k (k_des) from survey',s.columnK,columnK=>edit({columnK}))}
   </div>
   {check('Enter the column k from the survey (no AISC shape identifies the column)',s.columnK!==undefined,on=>edit({columnK:on?b.receiver.flangeThickness+12.7:undefined}))}
  </>}
 </div>;
}

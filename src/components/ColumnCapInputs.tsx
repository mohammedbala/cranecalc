import type {ReactNode} from 'react';
import {defaultColumnCap,type ColumnCapInput} from '../engine/columnCapInputs';
import type {ProjectInput} from '../engine/types';
import type {Quantity} from '../engine/units';

type NumericField=(label:string,value:number,onChange:(n:number)=>void,q?:Quantity,help?:string,min?:number)=>ReactNode;

/**
 * How the girder bears on a new freestanding runway column: on a welded bracket at the column face, or directly
 * on a column cap, centered over the column (AIST TR-13 §5.9.2 recommends direct bearing over 50 kip).
 */
export function ColumnCapInputs({project,update,numeric}:{project:ProjectInput;update:(fn:(p:ProjectInput)=>void)=>void;numeric:NumericField}){
 const cap=project.columnCap,on=!!cap?.enabled;
 const choose=(kind:'bracket'|'cap')=>update(p=>{
  const c=p.columnCap??structuredClone(defaultColumnCap),d=p.details;
  p.columnCap={...c,enabled:kind==='cap'};
  if(d?.bracket)d.bracket.enabled=kind==='bracket';
  if(p.aist)p.aist.supportType=kind==='cap'?'column':'bracket';
  if(kind==='cap'){
   // The column stops at the cap and carries no top-flange tie: the girder end is a fork on the cap.
   if(d?.brace.flangeAttachment)d.brace.flangeAttachment.enabled=false;
   if(d&&d.endBearing)d.endBearing.enabled=true;
   // The column stops at the seat: its effective and unbraced lengths shrink with it.
   const c0=p.existingColumn;
   if(c0){const k=c0.height>c0.seatElevation&&c0.height>0?c0.seatElevation/c0.height:1;p.existingColumn={...c0,height:c0.seatElevation,Lcx:c0.Lcx*k,Lcy:c0.Lcy*k,Lcz:c0.Lcz*k,Lb:c0.Lb*k,strong:{base:c0.strong.base,top:'free'},weak:{base:c0.weak.base,top:'braced'}};}
  }
 });
 const set=(patch:Partial<ColumnCapInput>)=>update(p=>{p.columnCap={...(p.columnCap??structuredClone(defaultColumnCap)),...patch};});
 const c=cap??defaultColumnCap;
 return <>
  <div className="field-grid"><label className="field"><span>Girder support on the new column</span><select aria-label="Girder support on the new column" value={on?'cap':'bracket'} onChange={e=>choose(e.target.value as 'bracket'|'cap')}><option value="bracket">Welded bracket at the column face</option><option value="cap">Column cap: girder centered on the column</option></select></label></div>
  {on&&<>
   <p className="form-note">Direct column bearing (AIST TR-13 §5.9.2): the girder bears on a cap plate welded all around the milled column top, its end bearing bolts through the cap. A cap stiffener between the column flanges carries each girder bearing stiffener line that is not over the column web. The bearing stiffeners and bolted bottom flange restrain the girder end; there is no top-flange tie. The column stops at the cap, and the crane-level strut runs below it.</p>
   <div className="field-grid">{numeric('Cap plate length along runway',c.plate.length,v=>set({plate:{...c.plate,length:v}}))}{numeric('Cap plate width across runway',c.plate.width,v=>set({plate:{...c.plate,width:v}}))}{numeric('Cap plate thickness',c.plate.thickness,v=>set({plate:{...c.plate,thickness:v}}))}{numeric('Cap-to-column fillet, all around',c.weld,v=>set({weld:v}))}</div>
   <div className="field-grid">{numeric('Cap stiffener thickness',c.stiffener.thickness,v=>set({stiffener:{...c.stiffener,thickness:v}}))}{numeric('Cap stiffener depth below cap',c.stiffener.height,v=>set({stiffener:{...c.stiffener,height:v}}))}{numeric('Cap stiffener fillets',c.stiffener.weld,v=>set({stiffener:{...c.stiffener,weld:v}}))}</div>
  </>}
 </>;
}

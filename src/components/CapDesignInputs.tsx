import type {ReactNode} from 'react';
import {emptyCapDesign,type CapDesignInput} from '../engine/capDesignInputs';
import type {Quantity} from '../engine/units';
export default function CapDesignInputs({value,onChange,numeric}:{value?:CapDesignInput;onChange:(v:CapDesignInput)=>void;numeric:(label:string,value:number,onChange:(v:number)=>void,q?:Quantity)=>ReactNode}){
 const d=value??emptyCapDesign,edit=<K extends keyof CapDesignInput>(key:K,v:CapDesignInput[K])=>onChange({...d,[key]:v});
 return <details className="form-details"><summary>Cap material & attachment</summary>
  <div className="field-grid">{numeric('Channel yield strength',d.Fy,v=>edit('Fy',v),'stress')}{numeric('Channel tensile strength',d.Fu,v=>edit('Fu',v),'stress')}{numeric('Cap weld electrode',d.Fexx,v=>edit('Fexx',v),'stress')}{numeric('Cap continuous fillet leg',d.weldSize,v=>edit('weldSize',v))}</div>
  {numeric('Cap end development length',d.developmentLength,v=>edit('developmentLength',v))}
  <label className="field"><span>CMAA crane service class</span><select aria-label="Cap crane service class" value={d.cmaaClass} onChange={e=>edit('cmaaClass',e.target.value as CapDesignInput['cmaaClass'])}>{['unconfirmed','A','B','C','D','E','F'].map(c=><option key={c} value={c}>{c==='unconfirmed'?'Select supplier duty class':`Class ${c}${['E','F'].includes(c)?' · cap not supported':''}`}</option>)}</select></label>
  {(['materialSource','dutySource','fitupNote'] as const).map((key,i)=><label className="field" key={key}><span>{['Channel material source','Supplier duty basis','Bearing contact / fit-up requirements'][i]}</span><textarea aria-label={['Channel material source','Supplier duty basis','Cap fit-up requirements'][i]} rows={2} value={d[key]} onChange={e=>edit(key,e.target.value)}/></label>)}
  {([
   ['fullLength','Cap runs the full member length'],['continuousWelds','Continuous weld at each W flange edge'],['contactConfirmed','Full bearing contact specified and verified'],['unperforated','Channel and W top flange have no holes'],['topStiffenerCjp','Bearing stiffener CJP weld to top flange']
  ] as const).map(([key,label])=><label className="checkbox-field" key={key}><input type="checkbox" checked={d[key]} onChange={e=>edit(key,e.target.checked)}/>{label}</label>)}
  <p className="form-note">Live checks include both bending signs, rail-head torsion, cap weld development and fatigue. The cap web alone carries local keeper bending. Reference: AISC Design Guide 7; AIST Technical Report 13.</p>
 </details>;
}

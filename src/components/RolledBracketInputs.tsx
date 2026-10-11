import type {ReactNode} from 'react';
import type {RunwayDetails} from '../engine/runwayDetails';
import {aiscWShapes,aiscShapeByName} from '../data/aiscSections';
import {defaultRolledShape,rolledInput,rolledStub,type RolledBracketInput} from '../engine/rolledBracketInputs';
import {format,formatSectionMass,type Quantity} from '../engine/units';

/** New rolled wide-flange bracket: the W-section stub, its welds to the column, bearing stiffeners and spreader seat. */
export default function RolledBracketInputs({value,onChange,numeric,units='US'}:{value:RunwayDetails;onChange:(v:RunwayDetails)=>void;units?:'US'|'SI';numeric:(label:string,value:number,onChange:(n:number)=>void,q?:Quantity)=>ReactNode}){
 const b=value.bracket!,r=rolledInput(b),shape=aiscShapeByName(b.corbelShape??defaultRolledShape),st=rolledStub(b);
 const edit=(patch:Partial<RolledBracketInput>)=>onChange({...value,bracket:{...b,rolled:{...r,...patch}}});
 const check=(label:string,checked:boolean,set:(v:boolean)=>void)=><label className="checkbox-field"><input type="checkbox" checked={checked} onChange={v=>set(v.target.checked)}/>{label}</label>;
 const f=(v:number)=>format(v,'length',units,3);
 return <div className="rolled-bracket-inputs">
  <p className="input-purpose"><b>Wide-flange bracket:</b> a rolled W-section stub welded to the column flange. The bearings land on its top flange, or on a welded spreader seat across it where two independent girder bearings need more length than the flange width.</p>
  <label className="field"><span>AISC bracket section</span><select aria-label="AISC bracket section" value={shape?.name??''} onChange={e=>onChange({...value,bracket:{...b,corbelShape:e.target.value}})}>{!shape&&<option value="" disabled>Select a valid W-section</option>}{aiscWShapes.map(s=><option value={s.name} key={s.name}>{s.name} · {formatSectionMass(s.weight,units)}</option>)}</select></label>
  {st&&<p className="form-note">d {f(st.d)} · bf {f(st.bf)} · tf {f(st.tf)} · tw {f(st.tw)} · k {f(st.k)}. Stub length is the seat / rib projection; the girder web line is the reach.{st.stiffener?` Stiffener outstand ${f(st.stiffener.width)} with ${f(st.stiffener.clip)} clips.`:''}</p>}
  <div className="field-grid">
   {numeric('Bracket steel Fy',r.Fy,Fy=>edit({Fy}),'stress')}{numeric('Bracket steel Fu',r.Fu,Fu=>edit({Fu}),'stress')}
   <label className="field"><span>Flanges to column</span><select aria-label="Flanges to column" value={r.flangeJoint} onChange={e=>edit({flangeJoint:e.target.value as RolledBracketInput['flangeJoint']})}><option value="fillet">Fillet welds, both faces</option><option value="cjp">CJP groove welds</option></select></label>
   {r.flangeJoint==='fillet'&&numeric('Flange-to-column fillet',r.flangeWeld,flangeWeld=>edit({flangeWeld}))}
   {numeric('Web-to-column fillet (both sides)',r.webWeld,webWeld=>edit({webWeld}))}
   {r.stiffeners&&numeric('Bearing stiffener thickness',r.stiffenerThickness,stiffenerThickness=>edit({stiffenerThickness}))}
   {r.stiffeners&&numeric('Bearing stiffener fillet',r.stiffenerWeld,stiffenerWeld=>edit({stiffenerWeld}))}
  </div>
  {check('Full-depth bearing stiffeners under the girder web line',r.stiffeners,stiffeners=>edit({stiffeners}))}
  {check('Bearings on a welded spreader seat plate (seat inputs below)',r.seatPlate,seatPlate=>edit({seatPlate}))}
 </div>;
}

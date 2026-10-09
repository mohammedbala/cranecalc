import type {ReactNode} from 'react';
import type {RunwayDetails} from '../engine/runwayDetails';
import {defaultExistingBracket,type ExistingBracketInput} from '../engine/existingBracketInputs';
import {defaultWideFlangeBracket,existingBracketProfile,selectExistingWideFlange} from '../engine/bracketProfiles';
import {aiscWShapes,aiscShapeByName} from '../data/aiscSections';
import {format,formatSectionMass,type Quantity} from '../engine/units';
export default function ExistingBracketInputs({value,onChange,numeric,units='US'}:{value:RunwayDetails;onChange:(v:RunwayDetails)=>void;units?:'US'|'SI';numeric:(label:string,value:number,onChange:(n:number)=>void,q?:Quantity)=>ReactNode}){
 const b=value.bracket!,wide=b.arrangement==='existing-w-corbel',raw=wide?(b.wideFlange??defaultWideFlangeBracket()):(b.existing??defaultExistingBracket),e=existingBracketProfile(b),shape=wide?aiscShapeByName(b.wideFlange?.shape??defaultWideFlangeBracket().shape):undefined;
 const edit=(patch:Partial<ExistingBracketInput>)=>onChange({...value,bracket:{...b,...(wide?{wideFlange:{...(b.wideFlange??defaultWideFlangeBracket()),...patch}}:{existing:{...raw,...patch}})}});
 const selectShape=(shape:string)=>onChange({...value,bracket:selectExistingWideFlange(b,shape)});
 const check=(label:string,checked:boolean,set:(v:boolean)=>void)=><label className="checkbox-field"><input type="checkbox" checked={checked} onChange={v=>set(v.target.checked)}/>{label}</label>;
 const text=(label:string,v:string,set:(v:string)=>void)=><label className="field"><span>{label}</span><textarea aria-label={label} rows={2} value={v} onChange={x=>set(x.target.value)}/></label>;
 return <div className="existing-bracket-inputs">
  <p className="input-purpose"><b>Existing support:</b> survey geometry and assessed capacity required. {wide?'Select the surveyed W-section; the initial size is a placeholder.':'Enter surveyed plate dimensions.'}</p>
  {wide&&<><label className="field"><span>AISC bracket section</span><select aria-label="AISC bracket section" value={shape?.name??''} onChange={v=>selectShape(v.target.value)}>{!shape&&<option value="" disabled>Select a valid W-section</option>}{aiscWShapes.map(s=><option value={s.name} key={s.name}>{s.name} · {formatSectionMass(s.weight,units)}</option>)}</select></label><dl className="bracket-section-properties">{([['Depth',e.depth],['Flange width',e.width],['Flange thickness',e.flangeThickness],['Web thickness',e.webThickness]] as const).map(([label,v])=><div key={label}><dt>{label}</dt><dd>{format(v,'length',units,4)}</dd></div>)}</dl><p className="form-note">Catalogue dimensions update the model and seat checks. Changing section clears the survey confirmations and existing support assessment. The runway girder selection is separate.</p></>}
  <details className="form-details"><summary>Existing bracket survey <small>Geometry / condition</small></summary><div className="field-grid">
   {([['Overall bracket depth','depth'],['Existing bracket projection','projection'],['Existing flange width along runway','width'],['Existing bracket flange thickness','flangeThickness'],['Existing bracket web thickness','webThickness'],['Existing continuity plate thickness','continuityThickness'],['Upper continuity plate above bracket','continuityAbove'],['Existing end stiffener thickness','tipStiffenerThickness']] as const).filter(([,key])=>!wide||!['depth','width','flangeThickness','webThickness'].includes(key)).map(([label,key])=><div key={key}>{numeric(label,e[key],n=>edit({[key]:n}))}</div>)}
   {numeric('Existing bracket Fy',e.Fy,Fy=>edit({Fy}),'stress')}{numeric('Existing bracket Fu',e.Fu,Fu=>edit({Fu}),'stress')}
  </div>{text('Survey / as-built drawing reference',e.geometrySource,geometrySource=>edit({geometrySource}))}
  {check('Bracket, continuity plates, welds and hole locations surveyed',e.surveyConfirmed,surveyConfirmed=>edit({surveyConfirmed}))}
  {check('Condition, corrosion and original welds assessed',e.conditionConfirmed,conditionConfirmed=>edit({conditionConfirmed}))}</details>
  <details className="form-details"><summary>New bolted spreader attachment</summary><p className="form-note">Four retaining bolts through the new plate and existing top flange, clear of the runway bearing. Vertical load transfers by bearing; these bolts do not lock the sliding girder end. Attachment resistance and original hole effects require the recorded connection assessment.</p><div className="field-grid">
   {([['Seat bolt diameter','diameter'],['Seat bolt spacing along runway','pitch'],['Seat bolt gauge across runway','gauge'],['Seat bolt minimum edge distance','edge']] as const).map(([label,key])=><div key={key}>{numeric(label,e.bolts[key],n=>edit({bolts:{...e.bolts,[key]:n}}))}</div>)}
   <label className="field"><span>Seat bolt grade</span><select aria-label="Seat bolt grade" value={e.bolts.grade} onChange={v=>edit({bolts:{...e.bolts,grade:v.target.value as 'A325'|'A490'}})}><option>A325</option><option>A490</option></select></label>
  </div></details>
  <details className="form-details"><summary>Existing support assessment & available capacities</summary><p className="form-note">Enter available resistances from the building engineer’s assessment, using the same LRFD/ASD basis as the calculation. This app calculates the delivered actions and new seat; it does not derive existing bracket capacity from the photo.</p>
   {text('Existing support assessment reference',e.rating.source,source=>edit({rating:{...e.rating,source}}))}
   <label className="field"><span>Assessment design method</span><select aria-label="Assessment design method" value={e.rating.method} onChange={v=>edit({rating:{...e.rating,method:v.target.value as 'LRFD'|'ASD'}})}><option>LRFD</option><option>ASD</option></select></label>
   <div className="field-grid">{([['Available vertical resistance','vertical','force'],['Available cantilever root moment','rootMoment','moment'],['Available longitudinal eccentric moment','seatMoment','moment'],['Assessed vertical fatigue range','fatigueRange','force'],['Assessed root moment fatigue range','fatigueRootMoment','moment'],['Assessed eccentric moment fatigue range','fatigueSeatMoment','moment'],['Assessed total fatigue cycles','cycles','ratio']] as const).map(([label,key,q])=><div key={key}>{numeric(label,e.rating[key],n=>edit({rating:{...e.rating,[key]:n}}),q)}</div>)}</div>
   {check('Assessment covers bracket, root welds, continuity plates, column and stated interaction',e.rating.confirmed,confirmed=>edit({rating:{...e.rating,confirmed}}))}
   {check('New contact footprint and local flange/web effects verified',e.rating.contactConfirmed,contactConfirmed=>edit({rating:{...e.rating,contactConfirmed}}))}
   {check('Existing deformation, rotation and movement compatibility verified',e.rating.serviceConfirmed,serviceConfirmed=>edit({rating:{...e.rating,serviceConfirmed}}))}
   {check('Bolted seat, locating/sliding attachments and separate horizontal paths verified',e.rating.attachmentConfirmed,attachmentConfirmed=>edit({rating:{...e.rating,attachmentConfirmed}}))}
  </details>
 </div>;
}

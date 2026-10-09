import {isExistingBracketType} from '../engine/bracketProfiles';
import type {ReactNode} from 'react';
import {ArrowUpRight,TriangleAlert} from 'lucide-react';
import {aiscWShapes} from '../data/aiscSections';
import {defaultBracket} from '../engine/bracketInputs';
import {bracketOptions,tieOptions,bracketArrangement,tieArrangement,referenceTie,selectBracketArrangement,selectTieArrangement,type BracketArrangement,type TieArrangement} from '../engine/connectionOptions';
import {isAngleTie,angleTie} from '../engine/angleTie';
import AngleTieInputs from './AngleTieInputs';
import type {RunwayDetails} from '../engine/runwayDetails';
import type {Quantity} from '../engine/units';
import ExistingBracketInputs from './ExistingBracketInputs';

/** Original schematic, deliberately not a copy of a proprietary fabrication detail. */
export function ConnectionOptionSketch({kind,topFlange=false}:{kind:BracketArrangement|TieArrangement;topFlange?:boolean}){
 const bracket=bracketOptions.some(o=>o.id===kind);
 return <svg className="connection-option-sketch" viewBox="0 0 340 164" role="img" aria-label={`${[...bracketOptions,...tieOptions].find(o=>o.id===kind)?.name} arrangement sketch`}>
  <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
   <path d="M270 13V137M281 13V137" strokeDasharray="5 4"/>
   {bracket?<>
    <path d="M69 52H270V61H69ZM121 52V26M161 52V26M107 26H175M107 49H175"/>
    {kind==='twin-rib'&&<path d="M84 61H270V123H84ZM89 65V119"/>}
    {kind==='haunched-seat'&&<path d="M84 61H270V123L84 79ZM89 65V76"/>}
    {kind==='rolled-corbel'&&<><path d="M84 61H270V69H84ZM84 116H270V124H84ZM84 93H270"/><path d="M111 69V116M245 69V116" strokeDasharray="4 3"/></>}
    {isExistingBracketType(kind)&&<><path d="M84 61H270V69H84ZM84 116H270V124H84ZM84 93H270M281 34H321M281 65H321M281 120H321M321 15V139" strokeDasharray="5 3"/><path d="M102 47V73M102 47H112M97 73H107M245 47V73M240 47H250M240 73H250"/></>}
    <path d="M63 140H270M63 135V145M270 135V145" strokeWidth=".7"/>
   </>:<>
    <path d="M43 39H109V49H43ZM43 117H109V127H43ZM71 49V117M81 49V117"/>
    {kind==='paired-bars'&&<><path d="M92 59H252V80H92ZM92 84H252V105H92ZM77 55H120V110H77ZM231 55H270V110H231"/>{[104,116,240,252].map(x=><g key={x}><circle cx={x} cy="69" r="3"/><circle cx={x} cy="94" r="3"/></g>)}</>}
    {kind==='flexible-plate'&&<><path d="M95 55H256V109H95ZM95 58H108V106H95M242 58H256V106H242"/><path d="M139 120C172 127 201 127 224 120" strokeDasharray="4 3"/></>}
    {isAngleTie(kind)&&(topFlange?<><path d="M93 33H249V39H93ZM218 39H257V80H249V47H218ZM260 39H268V80H260ZM239 58H286M239 70H286M224 29V56M237 29V56"/>{kind==='double-angle'&&<path d="M218 33H249V10H257V33H268M239 20H286"/>}<path d="M145 83H216M145 83L155 79M145 83L155 87M216 83L206 79M216 83L206 87"/></>:<><path d="M95 62H254V78H95ZM95 78L108 90H266V74L254 62M108 90V74H266M92 58H121M232 58H270"/>{kind==='double-angle'&&<path d="M95 96H254V108H95ZM95 108L108 120H266V108L254 96M108 120V108H266"/>}<path d="M93 54V130M270 49V130" strokeDasharray="4 3"/></>)}
    {(kind==='bearing-link'||kind==='paired-links')&&<>{(kind==='paired-links'?[60,102]:[81]).map(y=><g key={y}><path d={`M88 ${y-18}H119V${y+18}H88ZM235 ${y-18}H270V${y+18}H235ZM130 ${y-5}H223V${y+5}H130Z`}/><circle cx="121" cy={y} r="12"/><circle cx="232" cy={y} r="12"/><circle cx="121" cy={y} r="5"/><circle cx="232" cy={y} r="5"/></g>)}</>}
   </>}
  </g><text x="170" y="159" textAnchor="middle" fill="currentColor" fontSize="8" fontFamily="Arial">ARRANGEMENT CONCEPT · NOT TO SCALE</text>
 </svg>;
}
export default function ConnectionOptions({value,onChange,numeric,system,units='US'}:{units?:'US'|'SI';value:RunwayDetails;onChange:(v:RunwayDetails)=>void;system:'simple'|'continuous';numeric:(label:string,value:number,onChange:(v:number)=>void,q?:Quantity)=>ReactNode}){
 const b=value.bracket??defaultBracket,bk=bracketArrangement(b),tk=tieArrangement(value),bracket=bracketOptions.find(o=>o.id===bk)!,tie=tieOptions.find(o=>o.id===tk)!,r=referenceTie(value);
 const setBracket=(kind:BracketArrangement)=>onChange(selectBracketArrangement(value,kind));
 const setTie=(kind:TieArrangement)=>onChange(selectTieArrangement(value,kind));
 const field=(label:string,key:keyof typeof r)=>numeric(label,r[key],v=>onChange({...value,brace:{...value.brace,referenceDetail:{...r,[key]:v}}}));
 const missingBracket=!!b.enabled&&bk!=='twin-rib'&&!isExistingBracketType(bk),missingTie=tk!=='paired-bars',paused=missingBracket||missingTie;
 const topFlange=isAngleTie(tk)&&angleTie(value).connectionStyle==='top-flange-angle';
 return <div className="connection-library">
  <div className="form-section-title">Connection arrangements <small>Independent selections · inputs retained</small></div>
  <div className="connection-selectors">
  <label className="field"><span>Bracket type</span><select aria-label="Bracket type" value={bk} onChange={e=>setBracket(e.target.value as BracketArrangement)}>{bracketOptions.map(o=><option key={o.id} value={o.id}>{o.name}{o.id!=='twin-rib'&&!isExistingBracketType(o.id)?' · reference':''}</option>)}</select></label>
  <label className="field"><span>Tieback arrangement</span><select aria-label="Tieback arrangement" value={tk} onChange={e=>setTie(e.target.value as TieArrangement)}>{tieOptions.map(o=><option key={o.id} value={o.id} disabled={o.id==='paired-links'&&system==='continuous'}>{o.name}{o.id!=='paired-bars'?' · reference':''}</option>)}</select></label>
  </div>
  <div className="connection-check-scope" aria-label="Connection check scope">
   <div className="scope-table-head"><span>CHECK</span><span>WHY / LOAD PATH</span><span>MODEL STATUS</span></div>
   <div><strong>Bracket & seat</strong><span>{isExistingBracketType(bk)?'New seat bending + assessed support resistance; carries gravity reaction and eccentricity.':'Seat, ribs, welds and local column; carries gravity reaction and eccentricity.'}</span><b className={!b.enabled||paused?'pending':''}>{!b.enabled?'Reference only':paused?'Not run':isExistingBracketType(bk)?'Assessment-based':'Available'}</b></div>
   <div><strong>Flange tieback</strong><span>{topFlange?'Top-flange-only force transfer through slotted angles. Strength, slip, movement and fatigue required; lower-flange restraint separate.':'Lateral force transfer and restraint; strength, stiffness and fatigue. Movement needs separate verification.'}</span><b className={paused?'pending':''}>{missingTie?'Model required':paused?'Not run':'Available'}</b></div>
   <div><strong>Geometry fit</strong><span>Member, plate and attachment clearances. Does not verify strength or moving clearance.</span><b>Input validation</b></div>
  </div>
  {paused&&<div className="inline-note connection-option-warning"><TriangleAlert size={14}/><span><b>Detailed design paused:</b> {missingBracket&&missingTie?'bracket and tieback models are':missingTie?'the tieback model is':'the bracket model is'} required. Fit checks remain active; final report blocked.</span></div>}
  <details className="connection-source-notes"><summary>Arrangement sketches, assumptions & references</summary><div className="connection-option-previews">{[bracket,tie].map(o=><article key={o.id}><ConnectionOptionSketch kind={o.id} topFlange={topFlange}/><strong>{o.name}</strong><span className={o.id==='twin-rib'||o.id==='paired-bars'||isExistingBracketType(o.id)?'available':'reference'}>{o.status}</span></article>)}</div>{[bracket,tie].map(o=><div key={o.id}><strong>{o.name}</strong><p>{o.description}</p><p><b>Required checks:</b> {o.required}</p>{o.url?<a href={o.url} target="_blank" rel="noreferrer">{o.basis}<ArrowUpRight size={12}/></a>:<small>{o.basis}</small>}</div>)}<p>Detail families do not establish a standard installation or project capacity.</p></details>
  {isAngleTie(tk)&&<AngleTieInputs value={value} onChange={onChange} numeric={numeric} units={units}/>}
  {isExistingBracketType(bk)&&b.enabled&&<ExistingBracketInputs value={{...value,bracket:b}} onChange={onChange} numeric={numeric} units={units}/>}
  {bk==='haunched-seat'&&numeric('Haunch tip depth',b.tipDepth??b.ribDepth/4,v=>onChange({...value,bracket:{...b,tipDepth:v}}))}
  {bk==='rolled-corbel'&&<label className="field"><span>AISC corbel section</span><select aria-label="AISC corbel section" value={b.corbelShape??'W12X40'} onChange={e=>onChange({...value,bracket:{...b,corbelShape:e.target.value}})}>{aiscWShapes.map(s=><option key={s.name}>{s.name}</option>)}</select></label>}
  {tk!=='paired-bars'&&!isAngleTie(tk)&&<details className="form-details" open><summary>Reference tie geometry · no assigned capacity</summary><div className="field-grid">{tk==='flexible-plate'?<>{field('Flexible plate depth','plateWidth')}{field('Flexible plate thickness','plateThickness')}</>:<>{field('Pin diameter','pinDiameter')}{field('Bearing eye diameter','eyeDiameter')}{field('Bearing eye thickness','eyeThickness')}{field('Link body diameter','linkDiameter')}{field('Clevis plate thickness','forkThickness')}{tk==='paired-links'&&field('Shared clevis spacing','linkSpacing')}</>}{field('End pin / attachment setback','pinSetback')}</div><p className="form-note">Clear length follows the flange-to-column gap. These dimensions are illustrative and do not represent a selected supplier product.</p></details>}
 </div>;
}

import type {ReactNode} from 'react';
import {aiscWShapes,aiscShapeByName} from '../data/aiscSections';
import {defaultExistingColumn,existingLoadKeys,type ExistingColumnInput} from '../engine/existingColumnInputs';
import type {CalculationSnapshot,ProjectInput} from '../engine/types';
import {format,type Quantity} from '../engine/units';

type NumericField=(label:string,value:number,onChange:(n:number)=>void,q?:Quantity,help?:string,min?:number)=>ReactNode;
const loadNames:Record<typeof existingLoadKeys[number],string>={D:'Dead D',L:'Live L (excl. crane)',Lr:'Roof live Lr',S:'Snow S',R:'Rain R',W:'Wind W',E:'Seismic E'};

export function ExistingBuildingInputs({project,update,numeric}:{project:ProjectInput;update:(fn:(p:ProjectInput)=>void)=>void;numeric:NumericField}){
 const c=project.existingColumn,bracket=project.details?.bracket?.enabled;
 const set=(patch:Partial<ExistingColumnInput>)=>update(p=>{p.existingColumn={...(p.existingColumn??structuredClone(defaultExistingColumn)),...patch};});
 const support=(axis:'strong'|'weak',label:string)=>c&&<div className="field-grid">
  <label className="field"><span>{label} · base</span><select value={c[axis].base} onChange={e=>set({[axis]:{...c[axis],base:e.target.value as 'pinned'|'fixed'}})}><option value="pinned">Pinned</option><option value="fixed">Fixed</option></select></label>
  <label className="field"><span>{label} · top</span><select value={c[axis].top} onChange={e=>set({[axis]:{...c[axis],top:e.target.value as 'braced'|'free'}})}><option value="braced">Braced</option><option value="free">Sways</option></select></label></div>;
 return <div className="aist-inputs">
  <div className="form-section-title"><span>01</span>Existing column</div>
  <label className="checkbox-field"><input type="checkbox" checked={!!c?.enabled} onChange={e=>set({enabled:e.target.checked})}/>Check the existing column that receives the runway</label>
  <p className="form-note">The column under the most heavily loaded support is checked for the crane reactions plus the loads it already carries, under ASCE 7 combinations. Frame action, connections to the column, bracing, anchors and foundations remain separate.</p>
  {c?.enabled&&<>
   {bracket?<div className="inline-note">Column section, material, eccentricity and flange unbraced length come from the bracket's receiving column under Connections.</div>:<div className="field-grid">
    <label className="field"><span>Column section</span><select value={aiscShapeByName(c.shape)?c.shape:''} onChange={e=>set({shape:e.target.value})}><option value="">Custom plates (no fillet credit)</option>{aiscWShapes.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}</select></label>
    {!aiscShapeByName(c.shape)&&<>{numeric('Depth d',c.d,v=>set({d:v}))}{numeric('Flange width bf',c.bf,v=>set({bf:v}))}{numeric('Flange thickness tf',c.tf,v=>set({tf:v}))}{numeric('Web thickness tw',c.tw,v=>set({tw:v}))}</>}
    {numeric('Yield strength Fy',c.Fy,v=>set({Fy:v}),'stress')}{numeric('Tensile strength Fu',c.Fu,v=>set({Fu:v}),'stress')}</div>}
   <div className="field-grid">{numeric('Base to top lateral support',c.height,v=>set({height:v}))}{numeric('Base to bracket seat',c.seatElevation,v=>set({seatElevation:v}))}{!bracket&&numeric('Column centerline to girder bearing',c.eccentricity,v=>set({eccentricity:v}))}</div>
   {support('strong','Strong axis (across runway)')}{support('weak','Weak axis (along runway)')}
   <div className="field-grid">{numeric('Strong-axis effective length Lcx',c.Lcx,v=>set({Lcx:v}),'length','Use K for the actual end conditions; at least 1.0H pinned-braced, 0.8H fixed-braced, 2.1H fixed-free.')}{numeric('Weak-axis effective length Lcy',c.Lcy,v=>set({Lcy:v}))}{numeric('Torsional effective length Lcz',c.Lcz,v=>set({Lcz:v}))}{!bracket&&numeric('Flange unbraced length Lb',c.Lb,v=>set({Lb:v}))}</div>
   <div className="field-grid"><label className="field"><span>Crane longitudinal force</span><select value={c.longitudinal} onChange={e=>set({longitudinal:e.target.value as ExistingColumnInput['longitudinal']})}><option value="bracing">Bracing</option><option value="column">This column</option></select></label>{numeric('Runway drift limit h / n',c.driftLimit,v=>set({driftLimit:v}),'ratio')}</div>
   <div className="form-section-title"><span>02</span>Existing load effects at the governing section</div>
   <p className="form-note">Unfactored effects from the building's own analysis, per load type. Compression positive. Moments are added to the crane peaks without sign credit; W and E are applied in both directions.</p>
   {existingLoadKeys.map(k=><div className="field-grid" key={k}>{(['P','Mx','My','V'] as const).map(key=>numeric(`${loadNames[k]} · ${{P:'axial P',Mx:'strong Mx',My:'weak My',V:'shear V'}[key]}`,c.existing[k][key],v=>set({existing:{...c.existing,[k]:{...c.existing[k],[key]:v}}}),key==='Mx'||key==='My'?'moment':'force',undefined,-1e15))}</div>)}
   <label className="field"><span>Source of survey and existing loads</span><input value={c.source} placeholder="Original calculations, drawings or new analysis reference" onChange={e=>set({source:e.target.value})}/></label>
   <label className="checkbox-field"><input type="checkbox" checked={c.confirmed} onChange={e=>set({confirmed:e.target.checked})}/>Column dimensions, material and existing load effects are confirmed from the stated source</label>
  </>}
 </div>;
}

export function SupportReactionTable({snapshot}:{snapshot:CalculationSnapshot}){
 const r=snapshot.supportReactions;if(!r)return null;const u=snapshot.input.units,f=(v:number)=>format(v,'force',u,3);
 return <details className="design-combinations" open><summary>Support reactions by load type · unfactored</summary>
  <p>Downward positive, per support, for checking the building. Cd, Cv and Ci come from the crane arrangement that maximizes them; Css is the largest single-crane side thrust at the support, taken with it. Runway longitudinal force Cls = {f(r.Cls)} goes to the support or bracing that locates the girder.</p>
  <div className="combination-scroll"><table><thead><tr><th>Station</th><th>D</th><th>L</th><th>Crane empty Cd</th><th>Lifted Cv</th><th>Impact Ci</th><th>Side thrust Css</th><th>Least crane</th></tr></thead>
  <tbody>{r.supports.map(s=><tr key={s.x}><td>{format(s.x,'length',u,3)}</td><td>{f(s.D)}</td><td>{f(s.L)}</td><td>{f(s.Cd)}</td><td>{f(s.Cv)}</td><td>{f(s.Ci)}</td><td>{f(s.Css)}</td><td>{f(s.craneMinimum)}</td></tr>)}</tbody></table></div></details>;
}

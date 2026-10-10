import type {ReactNode} from 'react';
import {aiscWShapes,aiscShapeByName} from '../data/aiscSections';
import {defaultExistingColumn,existingLoadKeys,type ExistingColumnInput} from '../engine/existingColumnInputs';
import {defaultLongitudinalBracing,type LongitudinalBracingInput} from '../engine/longitudinalBracingInputs';
import {aiscAngles} from '../data/aiscAngles';
import {defaultEndStop,needsGirderStops,type EndStopInput} from '../engine/endStopInputs';
import {defaultEndBearing,slidingBolts,type EndBearingInput} from '../engine/endBearingInputs';
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
  <p>Downward positive, per support, for checking the building. Cd, Cv and Ci come from the crane arrangement that maximizes them; Css is the largest single-crane side thrust at the support, taken with it. Runway longitudinal force Cls = {f(r.Cls)} goes to the support or bracing that locates the girder; acting at the rail head, it also adds ± Cls·e/L at the bearings of the bay that carries it.</p>
  <div className="combination-scroll"><table><thead><tr><th>Station</th><th>D</th><th>L</th><th>Crane empty Cd</th><th>Lifted Cv</th><th>Impact Ci</th><th>Side thrust Css</th><th>Cls couple ±</th><th>Least crane</th></tr></thead>
  <tbody>{r.supports.map(s=><tr key={s.x}><td>{format(s.x,'length',u,3)}</td><td>{f(s.D)}</td><td>{f(s.L)}</td><td>{f(s.Cd)}</td><td>{f(s.Cv)}</td><td>{f(s.Ci)}</td><td>{f(s.Css)}</td><td>{f(s.Clv)}</td><td>{f(s.craneMinimum)}</td></tr>)}</tbody></table></div></details>;
}

export function LongitudinalBracingInputs({project,update,numeric}:{project:ProjectInput;update:(fn:(p:ProjectInput)=>void)=>void;numeric:NumericField}){
 const b=project.longitudinalBracing,count=(v:number,max:number)=>Math.min(max,Math.max(1,Math.round(v)));
 const set=(patch:Partial<LongitudinalBracingInput>)=>update(p=>{p.longitudinalBracing={...(p.longitudinalBracing??structuredClone(defaultLongitudinalBracing)),...patch};});
 return <div className="aist-inputs">
  <div className="form-section-title"><span>03</span>Crane-level longitudinal bracing</div>
  <label className="checkbox-field"><input type="checkbox" checked={!!b?.enabled} onChange={e=>set({enabled:e.target.checked})}/>Check the bracing that carries crane traction and stop forces</label>
  <p className="form-note">Braced bays of one runway column line share the larger of crane traction and the crane stop force, combined with the building's own wind and seismic forces on that line under ASCE 7. Collectors, brace connections, braced-bay columns and foundations remain separate.</p>
  {b?.enabled&&<>
   <div className="field-grid"><label className="field"><span>Bracing system</span><select value={b.system} onChange={e=>set({system:e.target.value as LongitudinalBracingInput['system']})}><option value="rod-x">Rod X</option><option value="angle-x">Angle X</option><option value="angle-single">Single angle</option></select></label>
    {numeric('Braced bays on the line',b.bays,v=>set({bays:count(v,6)}),'ratio','Rod X bracing is tension only: one rod of each X acts.')}{numeric('Tiers per bay',b.tiers,v=>set({tiers:count(v,4)}),'ratio')}</div>
   <div className="field-grid">{numeric('Braced bay width',b.bayWidth,v=>set({bayWidth:v}))}{numeric('Base to brace work point',b.height,v=>set({height:v}))}</div>
   {b.system==='rod-x'?<div className="field-grid">{numeric('Rod diameter',b.rod.diameter,v=>set({rod:{...b.rod,diameter:v}}))}{numeric('Rod Fy',b.rod.Fy,v=>set({rod:{...b.rod,Fy:v}}),'stress')}{numeric('Rod Fu',b.rod.Fu,v=>set({rod:{...b.rod,Fu:v}}),'stress')}</div>
   :<div className="field-grid"><label className="field"><span>Angle</span><select value={b.angle.shape} onChange={e=>set({angle:{...b.angle,shape:e.target.value}})}>{aiscAngles.map(a=><option key={a.name} value={a.name}>{a.name}</option>)}</select></label>
    {numeric('Angle Fy',b.angle.Fy,v=>set({angle:{...b.angle,Fy:v}}),'stress')}{numeric('Angle Fu',b.angle.Fu,v=>set({angle:{...b.angle,Fu:v}}),'stress')}{numeric('Bolts in line (3 or more)',b.angle.bolts,v=>set({angle:{...b.angle,bolts:Math.min(12,Math.max(3,Math.round(v)))}}),'ratio')}{numeric('Bolt diameter',b.angle.boltDiameter,v=>set({angle:{...b.angle,boltDiameter:v}}))}</div>}
   <div className="field-grid">{numeric('Existing wind W on this line',b.existing.W,v=>set({existing:{...b.existing,W:v}}),'force')}{numeric('Existing seismic E on this line',b.existing.E,v=>set({existing:{...b.existing,E:v}}),'force')}{numeric('Crane-level drift limit h / n',b.driftLimit,v=>set({driftLimit:v}),'ratio')}</div>
   <label className="checkbox-field"><input type="checkbox" checked={b.bumperToBracing} onChange={e=>set({bumperToBracing:e.target.checked})}/>The crane stop force on this line reaches this bracing (building-mounted stops, or girder stops through the locating supports)</label>
   <label className="field"><span>Source of bracing survey and existing forces</span><input value={b.source} placeholder="Drawings, survey or wind/seismic analysis reference" onChange={e=>set({source:e.target.value})}/></label>
   <label className="checkbox-field"><input type="checkbox" checked={b.confirmed} onChange={e=>set({confirmed:e.target.checked})}/>Bracing members, geometry and existing forces are confirmed from the stated source</label>
  </>}
 </div>;
}

export function EndStopInputs({project,update,numeric}:{project:ProjectInput;update:(fn:(p:ProjectInput)=>void)=>void;numeric:NumericField}){
 const e=project.details?.endStop,needed=needsGirderStops(project);
 const set=(patch:Partial<EndStopInput>)=>update(p=>{if(p.details)p.details.endStop={...(p.details.endStop??structuredClone(defaultEndStop)),...patch};});
 const part=<K extends 'base'|'face'|'stiffener'|'bolts'>(key:K,patch:Partial<EndStopInput[K]>)=>e&&set({[key]:{...e[key],...patch}} as Partial<EndStopInput>);
 if(!project.details)return null;
 return <div className="aist-inputs">
  <div className="form-section-title"><span>04</span>Runway end stops</div>
  {!needed?<p className="form-note">Every crane stop force is taken by building-mounted stops (Crane step), so girder-mounted stops are not required. Those stops and their support are listed on S-00 as by others.</p>:<>
  <label className="checkbox-field"><input type="checkbox" checked={!!e?.enabled} onChange={ev=>set({enabled:ev.target.checked})}/>Design bolted end stops at both ends of each runway</label>
  <p className="form-note">A base plate near the girder end, inboard of the top tie saddle, a face plate struck by the crane bumper and two back stiffeners, with four bolts through the top flange (nuts clear of the saddle and bearing stiffener; the holes are Category B fatigue points). Checked for the factored bumper force at the bumper height, including the couple on the girder end span. Drawn on S-07.</p>
  {e?.enabled&&<>
   <div className="field-grid">{numeric('Bumper centerline above top of rail',e.bumperHeight,v=>set({bumperHeight:v}))}{numeric('Bumper contact diameter',e.bumperDiameter,v=>set({bumperDiameter:v}))}{numeric('Girder end to back of base plate',e.setback,v=>set({setback:v}))}{numeric('Rail end to stop face',e.railGap,v=>set({railGap:v}))}</div>
   <div className="field-grid">{numeric('Base plate length along runway',e.base.length,v=>part('base',{length:v}))}{numeric('Base plate width',e.base.width,v=>part('base',{width:v}))}{numeric('Base plate thickness',e.base.thickness,v=>part('base',{thickness:v}))}</div>
   <div className="field-grid">{numeric('Face plate thickness',e.face.thickness,v=>part('face',{thickness:v}))}{numeric('Face plate height above base',e.face.height,v=>part('face',{height:v}))}{numeric('Stiffener thickness',e.stiffener.thickness,v=>part('stiffener',{thickness:v}))}{numeric('Stiffener length along base',e.stiffener.length,v=>part('stiffener',{length:v}))}{numeric('Stiffener spacing, center to center',e.stiffener.spacing,v=>part('stiffener',{spacing:v}))}</div>
   <div className="field-grid">{numeric('Bolt diameter',e.bolts.diameter,v=>part('bolts',{diameter:v}))}<label className="field"><span>Bolt grade</span><select value={e.bolts.grade} onChange={ev=>part('bolts',{grade:ev.target.value as 'A325'|'A490'})}><option>A325</option><option>A490</option></select></label>{numeric('Bolt gauge across runway',e.bolts.gauge,v=>part('bolts',{gauge:v}))}{numeric('Front bolts behind face plate',e.bolts.frontClear,v=>part('bolts',{frontClear:v}))}{numeric('Back bolts from base plate edge',e.bolts.edge,v=>part('bolts',{edge:v}))}{numeric('Fillet weld size',e.weldSize,v=>set({weldSize:v}))}</div>
   <label className="field"><span>Source of bumper force, height and contact diameter</span><input value={e.source} placeholder="Crane supplier data reference" onChange={ev=>set({source:ev.target.value})}/></label>
  </>}</>}
 </div>;
}

export function EndBearingInputs({project,update,numeric}:{project:ProjectInput;update:(fn:(p:ProjectInput)=>void)=>void;numeric:NumericField}){
 const e=project.details?.endBearing;
 const set=(patch:Partial<EndBearingInput>)=>update(p=>{if(p.details)p.details.endBearing={...(p.details.endBearing??structuredClone(defaultEndBearing)),...patch};});
 const bolts=(patch:Partial<EndBearingInput['bolts']>)=>e&&set({bolts:{...e.bolts,...patch}});
 if(!project.details||project.system!=='simple')return null;
 return <div className="aist-inputs">
  <div className="form-section-title"><span>05</span>Bolted end bearings</div>
  <label className="checkbox-field"><input type="checkbox" checked={!!e?.enabled} onChange={ev=>set({enabled:ev.target.checked})}/>Bolt each girder end to its bracket seat</label>
  <p className="form-note">Four bolts through the bottom flange, bearing plate and seat at each girder end. The left end of each bay locates with standard holes and pretensioned slip-critical bolts; the right end slides in slots sized for the sliding allowance, under plate washers, with bolts pretensioned against steel sleeves so the flange is not clamped (AISC J1.10(c)); snug-tight bolts with jam nuts are allowed only for cranes of 5 tons or less. Replaces the girder-end cover plates. Drawn on S-02.</p>
  {e?.enabled&&<div className="field-grid">{numeric('Bolt diameter',e.bolts.diameter,v=>bolts({diameter:v}))}<label className="field"><span>Bolt grade</span><select value={e.bolts.grade} onChange={ev=>bolts({grade:ev.target.value as 'A325'|'A490'})}><option>A325</option><option>A490</option></select></label>{numeric('Bolt gauge across runway',e.bolts.gauge,v=>bolts({gauge:v}))}{numeric('Bolt rows from bearing plate ends',e.bolts.edge,v=>bolts({edge:v}))}{numeric('Plate washer thickness',e.washerThickness,v=>set({washerThickness:v}))}<label className="field"><span>Sliding-end bolts</span><select aria-label="Sliding-end bolts" value={slidingBolts(e).mode} onChange={ev=>set({sliding:ev.target.value as 'sleeved'|'snug-tight'})}><option value="sleeved">Pretensioned against steel sleeves</option><option value="snug-tight">Snug-tight with jam nuts (5 tons or less)</option></select></label>{slidingBolts(e).mode==='sleeved'&&<>{numeric('Sleeve wall thickness',slidingBolts(e).wall,v=>set({sleeveWall:v}))}{numeric('Sleeve length beyond flange',slidingBolts(e).clearance,v=>set({sleeveClearance:v}))}</>}</div>}
 </div>;
}

import type {ReactNode} from 'react';
import type {ProjectInput} from '../engine/types';
import type {Quantity} from '../engine/units';
import {defaultSplices,spliceLayout,spliceMark,type SpliceInput,type FlangeSpliceInput} from '../engine/spliceInputs';

type NumericField=(label:string,value:number,onChange:(n:number)=>void,q?:Quantity,help?:string,min?:number)=>ReactNode;

/**
 * Girder field splices: the maximum mill or shipping piece, automatic or entered splice stations, the design basis,
 * the bolts and the flange and web plates with their bolt patterns.
 */
export function SpliceInputs({project,update,numeric}:{project:ProjectInput;update:(fn:(p:ProjectInput)=>void)=>void;numeric:NumericField}){
 const d=project.details;if(!d)return null;
 const sp=d.splices;
 const set=(patch:Partial<SpliceInput>)=>update(p=>{if(p.details)p.details.splices={...(p.details.splices??defaultSplices(p,p.details.rail)),...patch};});
 const flange=(key:'top'|'bottom',patch:Partial<FlangeSpliceInput>)=>sp&&set({[key]:{...sp[key],...patch}});
 const web=(patch:Partial<SpliceInput['web']>)=>sp&&set({web:{...sp.web,...patch}});
 const layout=sp?.enabled?spliceLayout(project):undefined;
 const flangeFields=(key:'top'|'bottom',title:string)=>{const f=sp![key];return <details className="form-details" key={key}><summary>{title}</summary>
  <div className="field-grid"><label className="field"><span>{`${title} plates`}</span><select aria-label={`${title} plates`} value={f.plates} onChange={e=>flange(key,{plates:e.target.value as FlangeSpliceInput['plates']})}>{key==='top'?<><option value="inner">Inner plates only (rail on the flange)</option><option value="inner-outer">Outer and inner plates</option></>:<><option value="inner-outer">Outer and inner plates</option><option value="outer">Outer plate only</option><option value="inner">Inner plates only</option></>}</select></label>
   {numeric('Outer plate width',f.outerWidth,v=>flange(key,{outerWidth:v}))}{numeric('Outer plate thickness',f.outerThickness,v=>flange(key,{outerThickness:v}))}{numeric('Each inner plate width',f.innerWidth,v=>flange(key,{innerWidth:v}))}{numeric('Inner plate thickness',f.innerThickness,v=>flange(key,{innerThickness:v}))}
   {numeric('Bolt lines each side of the web',f.lines,v=>flange(key,{lines:Math.max(1,Math.min(2,Math.round(v)))}),'ratio')}{numeric('Gauge across the web (inner lines)',f.gauge,v=>flange(key,{gauge:v}))}{numeric('Second line spacing',f.lineSpacing,v=>flange(key,{lineSpacing:v}))}
   {numeric('Bolt rows each side of the joint',f.rows,v=>flange(key,{rows:Math.max(1,Math.min(12,Math.round(v)))}),'ratio')}{numeric('Row pitch',f.pitch,v=>flange(key,{pitch:v}))}{numeric('Girder end to first row',f.endDistance,v=>flange(key,{endDistance:v}))}</div>
 </details>;};
 return <div className="aist-inputs">
  <div className="form-section-title"><span>06</span>Girder field splices</div>
  <label className="checkbox-field"><input type="checkbox" aria-label="Design girder field splices" checked={!!sp?.enabled} onChange={e=>set({enabled:e.target.checked})}/>Splice girders longer than the maximum piece length with bolted slip-critical field splices</label>
  <p className="form-note">Flange plates and two web plates, slip-critical bolts. Automatic stations sit near the inflection points of a continuous girder (0.20 to 0.25 of the span from an interior support) or as near a girder end as the maximum piece allows, clear of bearings, braces and end stops; rail joints and keepers keep clear of them. Each splice develops the larger of the factored forces at the joint and 50% of the flange strength, or the full flange strength. The top flange takes inner plates only, so the rail and keepers bear on the girder flange. Capped girders cannot be spliced here.</p>
  {sp?.enabled&&<>
   <div className="field-grid">{numeric('Maximum girder piece (mill / shipping)',sp.maxPiece,v=>set({maxPiece:v}))}
    <label className="field"><span>Splice stations</span><select aria-label="Splice stations" value={sp.placement} onChange={e=>set({placement:e.target.value as SpliceInput['placement'],stations:e.target.value==='entered'&&!sp.stations.length?(layout?.stations??[]):sp.stations})}><option value="auto">Automatic</option><option value="entered">Entered from grid 1</option></select></label>
    <label className="field"><span>Design basis</span><select aria-label="Splice design basis" value={sp.basis} onChange={e=>set({basis:e.target.value as SpliceInput['basis']})}><option value="minimum">Larger of the forces and 50% of the flange strength</option><option value="full">Full flange strength</option></select></label></div>
   {sp.placement==='entered'&&<div className="field-grid">{sp.stations.map((x,i)=><div key={i}>{numeric(`${spliceMark(i)} station from grid 1`,x,v=>set({stations:sp.stations.map((s,j)=>j===i?v:s)}))}</div>)}
    <button className="text-button" disabled={sp.stations.length>=12} onClick={()=>set({stations:[...sp.stations,(sp.stations.at(-1)??0)+sp.maxPiece]})}>Add splice</button>
    <button className="text-button" disabled={!sp.stations.length} onClick={()=>set({stations:sp.stations.slice(0,-1)})}>Remove last splice</button></div>}
   {layout&&<p className="form-note">{layout.errors.length?layout.errors.join(' '):layout.stations.length?`Splices: ${layout.stations.map((x,i)=>`${spliceMark(i)} at ${(x/304.8).toFixed(2)} ft (${Math.round(x)} mm)`).join(', ')}; ${layout.pieces.length} pieces per runway.`:'No girder exceeds the maximum piece: no splices.'}</p>}
   <div className="field-grid"><label className="field"><span>Splice bolt grade</span><select aria-label="Splice bolt grade" value={sp.grade} onChange={e=>set({grade:e.target.value as SpliceInput['grade']})}><option>A325</option><option>A490</option></select></label>
    {numeric('Splice bolt diameter',sp.diameter,v=>set({diameter:v}))}
    <label className="field"><span>Faying surface class</span><select aria-label="Splice faying surface class" value={sp.surface} onChange={e=>set({surface:e.target.value as SpliceInput['surface']})}><option value="A">A · clean mill scale (0.30)</option><option value="B">B · blast-cleaned (0.50)</option></select></label>
    {numeric('Gap between girder ends',sp.gap,v=>set({gap:v}))}{numeric('Last bolt to plate end',sp.edge,v=>set({edge:v}))}</div>
   {flangeFields('top','Top flange')}{flangeFields('bottom','Bottom flange')}
   <details className="form-details"><summary>Web</summary><div className="field-grid">{numeric('Web plate thickness (each)',sp.web.thickness,v=>web({thickness:v}))}{numeric('Web plate height',sp.web.height,v=>web({height:v}))}{numeric('Bolts in each column',sp.web.rows,v=>web({rows:Math.max(2,Math.min(16,Math.round(v)))}),'ratio')}{numeric('Vertical pitch',sp.web.pitch,v=>web({pitch:v}))}{numeric('Columns each side of the joint',sp.web.columns,v=>web({columns:Math.max(1,Math.min(4,Math.round(v)))}),'ratio')}{numeric('Column spacing',sp.web.spacing,v=>web({spacing:v}))}{numeric('Girder end to first column',sp.web.endDistance,v=>web({endDistance:v}))}</div></details>
  </>}
 </div>;
}

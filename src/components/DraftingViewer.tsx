import {connectionOptionChecks} from '../engine/connectionOptions';
import {connectionConceptSheetSvg} from './connectionConceptSheet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import type { CalculationSnapshot } from '../engine/types';
import { drawingSvg, engineeringSketches } from './drafting';
import { drawingSheetSet, sheetIndex } from './planSheet';
import { defaultFraming, type FramingSettings } from './framingSettings';

const sheetLabel=(title:string)=>title.split(/[,/&]/)[0].trim().toLowerCase().replace(/^./,c=>c.toUpperCase());

export default function DraftingViewer({ snapshot, framing=defaultFraming }: { snapshot: CalculationSnapshot; framing?:FramingSettings }) {
  const referenceOnly=connectionOptionChecks(snapshot.input).length>0;
  const drawings = useMemo(() => engineeringSketches(snapshot), [snapshot]);
  const [name, setName] = useState('runway-elevation'), [mode, setMode] = useState<'CAD'|'Paper'>('CAD');
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number }|null>(null);
  // Sheets come from the assembled set so detail numbers, references and "N OF M" match the issued package.
  const sheets=useMemo(()=>referenceOnly?[]:sheetIndex(snapshot,framing),[snapshot,framing,referenceOnly]);
  const sheet=sheets.some(v=>v.number===name);
  const sheetSvg=useMemo(()=>sheet&&drawings.length?drawingSheetSet(snapshot,framing).find(v=>v.number===name)?.svg??'':'',[snapshot,framing,sheet,name,drawings.length]);
  const referenceSvg=useMemo(()=>referenceOnly?connectionConceptSheetSvg(snapshot):'',[snapshot,referenceOnly]);
  const drawing = drawings.find(d => d.name === name) ?? drawings[0];
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  useEffect(reset, [name, snapshot.revision]);
  if(referenceOnly)return <section className="drafting-viewer" aria-label="2D engineering sketch viewer"><div className="connection-option-warning"><strong>Selected connection arrangements · reference only</strong><p>The views below use the current 3D geometry. Fabrication sheets and report generation are unavailable until the selected arrangements have a project-specific design.</p></div><div className="drafting-linework paper-space" dangerouslySetInnerHTML={{__html:referenceSvg}}/></section>;
  return <section className="drafting-viewer" aria-label="2D engineering sketch viewer">
    <div className="drafting-toolbar">
      <div className="drafting-views">{drawings.map(d=>[d.name,d.number]).map(([key,label]) =>
        <button key={key} aria-pressed={name === key} className={name === key ? 'selected' : ''} onClick={() => setName(key)}>{label}</button>)}{sheets.map(v=><button key={v.number} aria-pressed={name===v.number} className={name===v.number?'selected':''} title={v.title} onClick={()=>{setName(v.number);setMode('Paper');}}>{v.number} · {sheetLabel(v.title)}</button>)}</div>
      <div className="drafting-modes">{(['CAD','Paper'] as const).map(value => <button key={value} aria-label={`${value} drawing view`} aria-pressed={mode === value} className={mode === value ? 'selected' : ''} onClick={() => setMode(value)}>{value}</button>)}</div>
      <div className="drafting-actions"><button aria-label="Zoom out sketch" disabled={zoom <= 1} onClick={() => { if (zoom <= 1.25) reset(); else setZoom(zoom / 1.25); }}><Minus size={14}/></button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in sketch" disabled={zoom >= 4} onClick={() => setZoom(Math.min(4, zoom * 1.25))}><Plus size={14}/></button><button aria-label="Fit sketch" onClick={reset}><Maximize size={14}/></button></div>
    </div>
    <div className={`drafting-canvas ${mode === 'CAD' ? 'model-space' : 'paper-space'}`} data-drawing={sheet?name:drawing?.name} data-zoom={zoom}
      onPointerDown={e => { if (zoom <= 1 || e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; }}
      onPointerMove={e => { if (!drag.current) return; const maxX = e.currentTarget.clientWidth * (zoom - 1) / 2, maxY = e.currentTarget.clientHeight * (zoom - 1) / 2; setPan({ x: Math.max(-maxX, Math.min(maxX, drag.current.px + e.clientX - drag.current.x)), y: Math.max(-maxY, Math.min(maxY, drag.current.py + e.clientY - drag.current.y)) }); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      {drawing ? <div className="drafting-linework" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} dangerouslySetInnerHTML={{ __html: sheet?sheetSvg:drawingSvg(drawing) }}/> : <p>Correct inputs to preview the engineering sketch.</p>}
      <span className="drafting-ucs" aria-hidden="true"><i/>Y<br/>X</span>
    </div>
    <div className="drafting-legend">{sheet?<><span>Solid: runways</span><span className="center">Dashed: reference building</span><small>ARCH D · {snapshot.input.units==='SI'?'914.4 × 609.6 mm':'36 × 24 in'} · Dimensions govern</small></>:<><span className="outline">Outline</span><span className="center">Centerline</span><span className="dimension">Dimension</span><span className="load">Load</span><small>Zoom to inspect · Drag to pan · Dimensions govern</small></>}</div>
  </section>;
}

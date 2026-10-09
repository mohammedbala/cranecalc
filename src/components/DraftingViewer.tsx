import {flangeTieSheetSvg} from './flangeTieSheet';
import {connectionOptionChecks} from '../engine/connectionOptions';
import {connectionConceptSheetSvg} from './connectionConceptSheet';
import {bracketSheetSvg} from './bracketSheet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import type { CalculationSnapshot } from '../engine/types';
import { drawingSvg, engineeringSketches } from './drafting';
import { planSheetSvg, connectionSheetSvg } from './planSheet';
import {simpleSupportSheetSvg} from './simpleSupportSheet';
import { capSheetSvg } from './capSheet';
import { defaultFraming, type FramingSettings } from './framingSettings';

export default function DraftingViewer({ snapshot, framing=defaultFraming }: { snapshot: CalculationSnapshot; framing?:FramingSettings }) {
  const referenceOnly=connectionOptionChecks(snapshot.input).length>0;
  const drawings = useMemo(() => engineeringSketches(snapshot), [snapshot]);
  const [name, setName] = useState('runway-elevation'), [mode, setMode] = useState<'CAD'|'Paper'>('CAD');
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number }|null>(null);
  const hasCap=!!(snapshot.input.section.kind==='cap'&&snapshot.input.capDesign&&snapshot.input.details);
  const hasSimple=snapshot.input.system==='simple'&&!!snapshot.input.details;
  const hasFlangeTies=!!snapshot.input.details?.brace.flangeAttachment?.enabled;
  const sheet=(name==='flange-ties-sheet'&&hasFlangeTies)||(name==='bracket-sheet'&&!!snapshot.input.details?.bracket?.enabled)||(name==='supports-sheet'&&hasSimple)||name==='arrangement-sheet'||name==='connections-sheet'||(name==='cap-sheet'&&hasCap);
  const sheetSvg=useMemo(()=>!referenceOnly&&drawings.length&&sheet?(name==='flange-ties-sheet'?flangeTieSheetSvg(snapshot):name==='bracket-sheet'?bracketSheetSvg(snapshot):name==='supports-sheet'?simpleSupportSheetSvg(snapshot,framing):name==='cap-sheet'?capSheetSvg(snapshot):name==='connections-sheet'?connectionSheetSvg(snapshot,framing):planSheetSvg(snapshot,framing)):'', [snapshot,framing,sheet,name,drawings.length,referenceOnly]);
  const referenceSvg=useMemo(()=>referenceOnly?connectionConceptSheetSvg(snapshot):'',[snapshot,referenceOnly]);
  const drawing = drawings.find(d => d.name === name) ?? drawings[0];
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  useEffect(reset, [name, snapshot.revision]);
  if(referenceOnly)return <section className="drafting-viewer" aria-label="2D engineering sketch viewer"><div className="connection-option-warning"><strong>Selected connection arrangements · reference only</strong><p>The views below use the current 3D geometry. Fabrication sheets and report generation are unavailable until the selected arrangements have a project-specific design.</p></div><div className="drafting-linework paper-space" dangerouslySetInnerHTML={{__html:referenceSvg}}/></section>;
  return <section className="drafting-viewer" aria-label="2D engineering sketch viewer">
    <div className="drafting-toolbar">
      <div className="drafting-views">{drawings.map(d=>[d.name,d.number]).map(([key,label]) =>
        <button key={key} aria-pressed={name === key} className={name === key ? 'selected' : ''} onClick={() => setName(key)}>{label}</button>)}<button aria-pressed={name==='arrangement-sheet'} className={name==='arrangement-sheet'?'selected':''} onClick={()=>{setName('arrangement-sheet');setMode('Paper');}}>S-01 · ARCH D</button><button aria-pressed={name==='connections-sheet'} className={name==='connections-sheet'?'selected':''} onClick={()=>{setName('connections-sheet');setMode('Paper');}}>S-02 · Connections</button>{hasCap&&<button aria-pressed={name==='cap-sheet'} className={name==='cap-sheet'?'selected':''} onClick={()=>{setName('cap-sheet');setMode('Paper');}}>S-03 · Cap attachment</button>}{hasSimple&&<button aria-pressed={name==='supports-sheet'} className={name==='supports-sheet'?'selected':''} onClick={()=>{setName('supports-sheet');setMode('Paper');}}>S-04 · Independent supports</button>}{snapshot.input.details?.bracket?.enabled&&<button aria-pressed={name==='bracket-sheet'} onClick={()=>{setName('bracket-sheet');setMode('Paper');}}>S-05 · Bracket supports</button>}{hasFlangeTies&&<button aria-pressed={name==='flange-ties-sheet'} onClick={()=>{setName('flange-ties-sheet');setMode('Paper');}}>S-06 · Flange ties</button>}</div>
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

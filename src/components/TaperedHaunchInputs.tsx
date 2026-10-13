import type {ReactNode} from 'react';
import type {RunwayDetails} from '../engine/runwayDetails';
import {haunchInput,haunchGeometry,type TaperedHaunchInput} from '../engine/taperedHaunchInputs';
import {format,type Quantity} from '../engine/units';

/**
 * Built-up tapered I haunch: its plates, bearing stiffeners and welds. The reach, the projection (seat projection)
 * and the web-to-column fillet (root weld) are the bracket's own dimensions below.
 */
export default function TaperedHaunchInputs({value,onChange,numeric,units='US'}:{value:RunwayDetails;onChange:(v:RunwayDetails)=>void;units?:'US'|'SI';numeric:(label:string,value:number,onChange:(n:number)=>void,q?:Quantity)=>ReactNode}){
 const b=value.bracket!,h=haunchInput(b),g=haunchGeometry(b,value.bearing.width);
 const edit=(patch:Partial<TaperedHaunchInput>)=>onChange({...value,bracket:{...b,haunch:{...h,...patch}}});
 const stiffener=(patch:Partial<TaperedHaunchInput['stiffener']>)=>edit({stiffener:{...h.stiffener,...patch}});
 const check=(label:string,checked:boolean,set:(v:boolean)=>void)=><label className="checkbox-field"><input type="checkbox" checked={checked} onChange={v=>set(v.target.checked)}/>{label}</label>;
 const f=(v:number)=>format(v,'length',units,3);
 return <div className="tapered-haunch-inputs">
  <p className="input-purpose"><b>Tapered I haunch:</b> a built-up web, a level top flange carrying both girder bearings and a sloping bottom flange, welded to the column flange. Where the bearings need more length along the runway than the column flange gives, the top flange flares at 45° beyond its welded root width to the seat width.</p>
  <p className="form-note">Bottom flange slope {g.degrees.toFixed(1)}° · girder web line {f(g.a)} from the column face · stiffener corner clip {f(g.stiffener.clip)}{g.flare?` · flare from ${f(g.flare.y0)} to ${f(g.flare.y1)}`:''}.</p>
  <div className="field-grid">
   {numeric('Haunch depth at column (root)',h.rootDepth,rootDepth=>edit({rootDepth}))}
   {numeric('Haunch depth at tip',h.tipDepth,tipDepth=>edit({tipDepth}))}
   {numeric('Web plate thickness',h.webThickness,webThickness=>edit({webThickness}))}
   {numeric('Top flange (seat) width along runway',h.topWidth,topWidth=>edit({topWidth}))}
   {numeric('Top flange width at column (welded)',h.rootWidth??h.topWidth,rootWidth=>edit({rootWidth}))}
   {numeric('Top flange thickness',h.topThickness,topThickness=>edit({topThickness}))}
   {numeric('Bottom flange width',h.bottomWidth,bottomWidth=>edit({bottomWidth}))}
   {numeric('Bottom flange thickness',h.bottomThickness,bottomThickness=>edit({bottomThickness}))}
   <label className="field"><span>Flanges to column</span><select aria-label="Haunch flanges to column" value={h.flangeJoint} onChange={e=>edit({flangeJoint:e.target.value as TaperedHaunchInput['flangeJoint']})}><option value="cjp">CJP groove welds</option><option value="fillet">Fillet welds, both faces</option></select></label>
   {h.flangeJoint==='fillet'&&numeric('Flange-to-column fillet',h.flangeWeld,flangeWeld=>edit({flangeWeld}))}
   {numeric('Flange-to-web fillet (both sides)',h.flangeWebWeld,flangeWebWeld=>edit({flangeWebWeld}))}
   {numeric('Bearing stiffener thickness',h.stiffener.thickness,thickness=>stiffener({thickness}))}
   {numeric('Bearing stiffener outstand on bottom flange',h.stiffener.width,width=>stiffener({width}))}
   {numeric('Stiffener wing outstand under seat (0: no wing)',h.stiffener.topWidth??0,topWidth=>stiffener({topWidth:topWidth>h.stiffener.width?topWidth:undefined}))}
   {numeric('Bearing stiffener fillet',h.stiffener.weld,weld=>stiffener({weld}))}
  </div>
  {check('Tip end plate closing the haunch',!!h.endPlate,endPlate=>edit({endPlate}))}
 </div>;
}

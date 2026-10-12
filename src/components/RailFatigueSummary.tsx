import katex from 'katex';
import type {CalculationSnapshot} from '../engine/types';
import {format} from '../engine/units';
export default function RailFatigueSummary({snapshot}:{snapshot:CalculationSnapshot}){
 const bins=snapshot.detailResults?.railFatigueBins;if(!bins?.length)return null;
 const u=snapshot.input.units;
 return <details className="design-combinations"><summary>Rail clip weld fatigue · loads by duty level</summary>
  <p>Reference AIST Technical Report 13 §3.10.2.3. Empty-crane weight remains in every bin; only the lifted portion changes. Impact and strength factors are excluded.</p>
  <p dangerouslySetInnerHTML={{__html:katex.renderToString('P_i=C_{ds}+\\eta_i C_{vs},\\quad H_i=0.5C_{ss},\\quad\\Delta f_{w,i}=f_w(H_i)',{throwOnError:false})}}/>
  <div className="combination-scroll"><table><thead><tr><th>Duty level</th><th>Cycles</th><th>Vertical group</th><th>Lateral group</th><th>Clip base weld range</th></tr></thead><tbody>{bins.map((b,i)=><tr key={i}><th>{b.name}</th><td>{b.cycles.toLocaleString()}</td><td>{format(b.vertical,'force',u)}</td><td>{format(b.lateral,'force',u)}</td><td>{format(b.weldStress,'stress',u)}</td></tr>)}</tbody></table></div>
  <p>Wheel groups receive no load-sharing credit. The clip force is one-way (the rail pushes a clip out or lifts its nose, never the reverse), so the clip base weld range runs from zero to the bin value; the largest is checked against all cycles. The girder top plate at each clip is a register point (AISC Table A-3.1 item 7.1).</p>
 </details>;
}

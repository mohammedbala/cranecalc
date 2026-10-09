import katex from 'katex';
import type {CalculationSnapshot} from '../engine/types';
import {format} from '../engine/units';
export default function RailFatigueSummary({snapshot}:{snapshot:CalculationSnapshot}){
 const bins=snapshot.detailResults?.railFatigueBins;if(!bins?.length)return null;
 const u=snapshot.input.units;
 return <details className="design-combinations"><summary>Rail keeper fatigue · loads by duty level</summary>
  <p>Reference AIST Technical Report 13 §3.10.2.3. Empty-crane weight remains in every bin; only the lifted portion changes. Impact and strength factors are excluded.</p>
  <p dangerouslySetInnerHTML={{__html:katex.renderToString('P_i=C_{ds}+\\eta_i C_{vs},\\quad H_i=0.5C_{ss},\\quad\\Delta f_{local,i}\\le 2f_{local}(P_i,H_i)',{throwOnError:false})}}/>
  <div className="combination-scroll"><table><thead><tr><th>Duty level</th><th>Cycles</th><th>Vertical group</th><th>Lateral group</th><th>Local flange range</th><th>Weld throat range</th></tr></thead><tbody>{bins.map((b,i)=><tr key={i}><th>{b.name}</th><td>{b.cycles.toLocaleString()}</td><td>{format(b.vertical,'force',u)}</td><td>{format(b.lateral,'force',u)}</td><td>{format(2*b.flangeStress,'stress',u)}</td><td>{format(2*b.weldStress,'stress',u)}</td></tr>)}</tbody></table></div>
  <p>Wheel groups receive no load-sharing credit. Full local reversal is added conservatively to each bin’s global bending/warping range. The largest resulting range is also checked against all cycles.</p>
 </details>;
}

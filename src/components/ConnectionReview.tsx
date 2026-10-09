import type {ProjectInput} from '../engine/types';
import {connectionCoordination} from '../engine/connectionCoordination';
import {connectionOptionChecks,bracketArrangement,tieArrangement,bracketOptions,tieOptions} from '../engine/connectionOptions';
export default function ConnectionReview({input}:{input:ProjectInput}){
 const issues=connectionCoordination(input);
 const alternatives=connectionOptionChecks(input);
 if(alternatives.length)return <details className="viewer-review" open><summary>Connection practice review <span>Reference arrangement / design required</span></summary><p>{bracketOptions.find(o=>o.id===bracketArrangement(input.details?.bracket))?.name} · {tieOptions.find(o=>o.id===tieArrangement(input.details))?.name}</p>{alternatives.map(c=><p className="model-coordination-warning" key={c.id}>{c.note}</p>)}<p>The selected families follow the cited support / tieback principles. Their preview dimensions are not supplier-rated or prequalified. Review sources in Connections on the calculation worksheet.</p></details>;
 return <details className="viewer-review" open={issues.length>0}><summary>Connection practice review <span>{issues.length?'Tie layout needs redesign':'Typical principles / custom details'}</span></summary>
 {issues.map(v=><p className="model-coordination-warning" key={v}>{v}</p>)}
 <dl><dt>Column bracket</dt><dd>Recognized support arrangement: Reference AIST Technical Report 13 §5.9.2. The two rectangular ribs, plate thicknesses and weld sizes are a custom design, not a standardized connection.</dd>
 <dt>Bearings and tiebacks</dt><dd>{input.details?.brace.flangeAttachment?.enabled?'Flange saddles and local column roots have strength, stiffness and fatigue checks. End rotation, thermal movement, column shortening and global frame interaction remain separate.':'Independent bearings and movement-compatible tiebacks follow established principles. The shown double-cover ties still need verified end-rotation, vertical movement, sliding and column-side attachments.'} Strength checks alone do not validate that installation.</dd>
 <dt>Bearing stiffeners</dt><dd>Full depth, continuous web welds and fitted bottom ends are established details. DG7 §11.2 favors CJP at the top flange; the capped model shows that requirement. The rolled model's flange fillets need detail-specific fatigue review.</dd>
 <dt>Rail keepers and cap</dt><dd>Continuous cap welds and weldable rail attachments are established practices within their duty limits. The app's generic keeper is not a tested proprietary clip. Confirm rail movement, fit-up and supplier requirements.</dd></dl>
 <p>Sources: <a href="https://ej.aisc.org/index.php/engj/article/download/777/776" target="_blank" rel="noreferrer">AISC runway fatigue and connection details</a>; supplied AISC Design Guide 7 §§11.2, 14.5 and Reference AIST Technical Report 13 §§5.8–5.9; <a href="https://www.gantrail.com/products/crane-rail-fixing-clips/welded-rail-fixing-clips/" target="_blank" rel="noreferrer">manufacturer rail-clip details</a>. These support the concepts, not approval of this exact assembly.</p>
 </details>;
}

import {ArrowDownToLine, ArrowUpRight, FileText} from 'lucide-react';
import {sampleCalcs} from '../data/sampleCalcs';

const url=(path:string)=>`${import.meta.env.BASE_URL}${path}`;
const megabytes=(bytes:number)=>`${(bytes/1048576).toFixed(1)} MB`;

/** Sample calculation packages produced with CraneCalc, each a PDF to open or download. */
export default function SampleCalcs(){
 return <>
  <div className="result-head"><div><div className="eyebrow">SAMPLE CALCULATIONS</div><h2>Sample calcs</h2></div><span className="model-tag">PDF</span></div>
  <div className="source-intro"><FileText size={21}/><p>Calculation packages produced with CraneCalc from one set of inputs: the calculation and its drawing sheets. The projects are fictitious demonstrations; the packages are not sealed and are not designs for construction.</p></div>
  {sampleCalcs.map(s=><article className="sample-card" key={s.id}>
   <a className="sample-cover" href={url(s.file)} target="_blank" rel="noreferrer" aria-label={`Open ${s.title} (PDF)`}><img src={url(s.cover)} alt={`Cover of the ${s.title} sample calculation`} width={180} height={233} loading="lazy"/></a>
   <div className="sample-body">
    <h3>{s.title}</h3>
    <p className="sample-project">{s.project}</p>
    <p>{s.summary}</p>
    <ul>{s.contents.map(c=><li key={c}>{c}</li>)}</ul>
    <p className="sample-meta">{s.pages} pages · {megabytes(s.bytes)} · issued {s.issued} · fictitious demonstration, not sealed</p>
    <div className="sample-actions">
     <a className="outline-button" href={url(s.file)} target="_blank" rel="noreferrer"><ArrowUpRight size={13}/>Open PDF</a>
     <a className="outline-button" href={url(s.file)} download><ArrowDownToLine size={13}/>Download</a>
    </div>
   </div>
  </article>)}
 </>;
}

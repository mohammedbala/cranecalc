import rawCss from 'katex/dist/katex.min.css?raw';
import type {CalculationSnapshot,ProjectInput} from '../engine/types';
import type {FramingSettings} from '../components/framingSettings';
import {printableReport} from './printReport';
import {docToSvg} from '../cad/convert';
import type {CadDoc} from '../cad/model';

// Inline WOFF2 fonts so a saved report works offline, without CDN or server requests.
const fonts=import.meta.glob<string>('../../node_modules/katex/dist/fonts/*.woff2',{query:'?inline',import:'default',eager:true});
const fontCss=rawCss.replace(/src:[^;]+;/g,source=>{
 const name=source.match(/url\(fonts\/([^)]*\.woff2)\)/)?.[1];
 if(!name)return source;
 const data=fonts[`../../node_modules/katex/dist/fonts/${name}`];
 if(!data)throw Error(`Report font is missing: ${name}`);
 return `src:url(${data}) format("woff2");`;
});

/** `cadSheets`: drawing sheets edited in the CAD editor for this design, by sheet number. */
export async function createBrowserReport(input:ProjectInput,revision:string,framing:FramingSettings,cadSheets:Record<string,CadDoc>={}){
 const snapshot=await new Promise<CalculationSnapshot>((resolve,reject)=>{
  const worker=new Worker(new URL('../engine/worker.ts',import.meta.url),{type:'module'});
  const finish=()=>{clearTimeout(timeout);worker.terminate();};
  const timeout=setTimeout(()=>{finish();reject(Error('Report calculation timed out. Reduce the model size and try again.'));},120000);
  worker.onmessage=event=>{finish();event.data.error?reject(Error(event.data.error)):resolve(event.data.snapshot);};
  worker.onerror=event=>{finish();reject(Error(event.message||'Report calculation failed.'));};
  worker.postMessage({input,requestId:'report'});
 });
 const html=printableReport(snapshot,framing,revision,fontCss,Object.fromEntries(Object.entries(cadSheets).map(([k,doc])=>[k,docToSvg(doc)])));
 return {snapshot,blob:new Blob([html],{type:'text/html;charset=utf-8'}),framing,format:'html' as const};
}

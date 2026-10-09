import {readFileSync} from 'node:fs';
import path from 'node:path';
import {reportHtml as renderReport} from '../src/report/reportHtml';
import type {CalculationSnapshot} from '../src/engine/types';
import {defaultFraming,type FramingSettings} from '../src/components/framingSettings';
let katexCss='';
function css(){if(!katexCss){const dir=path.resolve('node_modules/katex/dist');katexCss=readFileSync(path.join(dir,'katex.min.css'),'utf8').replace(/url\(([^)]+)\)/g,(_,url:string)=>{const file=url.replace(/['"]/g,'');const mime=file.endsWith('woff2')?'font/woff2':file.endsWith('woff')?'font/woff':'font/ttf';return `url(data:${mime};base64,${readFileSync(path.join(dir,file)).toString('base64')})`;});}return katexCss;}
export function reportHtml(s:CalculationSnapshot,framing:FramingSettings=defaultFraming){
 return renderReport(s,framing,css());
}

import {fingerprint,validateProject} from '../engine/calculate';
import type {CalculationSnapshot} from '../engine/types';
import {framingSchema,type FramingSettings} from '../components/framingSettings';
import {reportHtml} from './reportHtml';

/** A fresh worker calculation must pass the same export gate as the local PDF service. */
export function printableReport(s:CalculationSnapshot,framing:FramingSettings,revision:string,fontCss:string){
 if(validateProject(s.input).length||s.revision!==revision||fingerprint(s.input)!==revision)
  throw Error('Input revision does not match. Recalculate before exporting.');
 if(!s.eligible||s.errors.length||s.checks.some(c=>!['pass','fail','not-applicable','excluded'].includes(c.status)))
  throw Error('This calculation has invalid, unverified or unsupported results and cannot be exported.');
 const html=reportHtml(s,framingSchema.parse(framing),fontCss);
 const tools=`<aside class="print-tools"><strong>CraneCalc · report and drawing sheets</strong><button type="button" onclick="document.fonts.ready.then(()=>window.print())">Print / Save PDF</button><p>Choose Save as PDF. Use 100% scale, enable background graphics and turn off browser headers and footers: every calculation page prints its own project, calculation revision, issue status, responsibility line and page number. Calculation pages are Letter; drawings are ARCH D (36 × 24 in). Check paper sizes in your PDF viewer after saving. Chrome or Edge is recommended.</p></aside>`;
 const style=`<style>.print-tools{font:14px/1.5 Arial,sans-serif;background:#eef2f6;border:1px solid #bcc8d4;padding:16px;margin:0 0 24px;color:#263648}.print-tools strong{display:block}.print-tools button{font:inherit;padding:8px 16px;margin:10px 0;cursor:pointer;background:#273e60;color:white;border:0;border-radius:4px}.print-tools p{margin:0}@media screen{body{max-width:1000px;margin:24px auto;padding:0 24px}.runway-plan-sheet-page{width:100%;height:auto;margin:28px 0;border:1px solid #c6cbd1}.runway-plan-sheet-page svg{width:100%;height:auto}}@media print{.print-tools{display:none!important}}</style>`;
 const policy=`<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">`;
 return html.replace('<head>',`<head>${policy}`).replace('</head>',`${style}</head>`).replace('<body>',`<body>${tools}`);
}

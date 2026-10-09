import express from 'express';
import { chromium } from 'playwright';
import path from 'node:path';
import { calculate, fingerprint, validateProject } from '../src/engine/calculate';
import { reportHtml } from './report';
import { defaultFraming, framingSchema } from '../src/components/framingSettings';
import type { ProjectInput } from '../src/engine/types';
import { chromiumChannel } from './browserRuntime';
const app=express();
app.disable('x-powered-by');
const allowedOrigins=new Set(['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:4174','http://localhost:4174']);
app.use((req,res,next)=>{const origin=req.get('origin');if(origin&&!allowedOrigins.has(origin)){res.status(403).json({error:'Only the local CraneCalc application may access this service.'});return;}res.setHeader('X-Content-Type-Options','nosniff');next();});
app.use(express.json({limit:'100kb'}));
app.get('/api/health',(_req,res)=>res.json({status:'ok',version:'0.1.0'}));
let reporting=false;
app.post('/api/report',async(req,res)=>{
 if(reporting){res.status(429).json({error:'A report is already being generated. Please wait.'});return;}
 const input=req.body?.input;const errors=validateProject(input);if(errors.length){res.status(422).json({error:'Inputs are invalid.',errors});return;}
 if(req.body.revision!==fingerprint(input)){res.status(409).json({error:'Input revision does not match. Recalculate before exporting.'});return;}
 const framing=framingSchema.safeParse(req.body.framing??defaultFraming);
 if(!framing.success){res.status(422).json({error:'Reference framing settings are invalid.'});return;}
 reporting=true;let browser;
 try{
  const snapshot=calculate(input as ProjectInput);
  if(!snapshot.eligible){res.status(422).json({error:'This calculation has invalid, unverified or unsupported results and cannot be exported.',errors:snapshot.errors,blockingChecks:snapshot.checks.filter(c=>!['pass','fail','not-applicable'].includes(c.status)).map(c=>c.title)});return;}
  browser=await chromium.launch({headless:true,channel:chromiumChannel});const page=await browser.newPage();
  // Reports contain only server-rendered, escaped input. No external assets or requests are allowed.
  await page.route('**/*',route=>route.abort());
  await page.setContent(reportHtml(snapshot,framing.data),{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
  const pdf=await page.pdf({format:'Letter',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:true,headerTemplate:'<div></div>',footerTemplate:`<div style="font-size:8px;color:#8c9b7e;width:100%;padding:0 55px;display:flex;justify-content:space-between"><span>CraneCalc · ${snapshot.input.reportPurpose==='demonstration'?'FICTITIOUS DEMONSTRATION':snapshot.input.scope==='analysis'?'ANALYSIS ONLY':'AIST DESIGN WORKSHEET'} · ${snapshot.revision}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,margin:{top:'19mm',bottom:'20mm',left:'15mm',right:'15mm'}});
  res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="cranecalc-${snapshot.revision}.pdf"`);res.setHeader('X-Calculation-Revision',snapshot.revision);res.send(pdf);
 }catch(error){console.error(error);res.status(500).json({error:'Report generation failed. Verify the local Chromium runtime with: npx playwright install chromium.'});}finally{
  // The response is complete; release the render lock before browser teardown.
  reporting=false;await browser?.close();
 }
});
if(process.argv.includes('--production')){app.use(express.static(path.resolve('dist')));app.get('/{*path}',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));}
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(400).json({error:'Invalid request body.'}));
app.listen(4174,'127.0.0.1',()=>console.log('CraneCalc local service: http://127.0.0.1:4174'));

import express from 'express';
import { chromium } from 'playwright';
import path from 'node:path';
import { calculate, fingerprint, validateProject } from '../src/engine/calculate';
import { reportHtml } from './report';
import { reviewDraftExportable } from '../src/engine/checkTaxonomy';
import { revisionIdentity } from '../src/engine/drawingData';
import { defaultFraming, framingSchema } from '../src/components/framingSettings';
import type { ProjectInput } from '../src/engine/types';
import { chromiumChannel } from './browserRuntime';
import { parseCadDoc } from '../src/cad/validate';
import { docToSvg } from '../src/cad/convert';
const app=express();
app.disable('x-powered-by');
const allowedOrigins=new Set(['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:4174','http://localhost:4174']);
app.use((req,res,next)=>{const origin=req.get('origin');if(origin&&!allowedOrigins.has(origin)){res.status(403).json({error:'Only the local CraneCalc application may access this service.'});return;}res.setHeader('X-Content-Type-Options','nosniff');next();});
// The report request may carry drawing sheets edited in the CAD editor; every other request stays small.
const smallJson=express.json({limit:'100kb'}),reportJson=express.json({limit:'25mb'});
app.use((req,res,next)=>(req.path==='/api/report'?reportJson:smallJson)(req,res,next));
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
  // A review draft (req.body.reviewDraft) may export with missing-data open items; it prints REVIEW DRAFT and lists them.
  const draft=req.body.reviewDraft===true&&reviewDraftExportable(snapshot);
  if(!snapshot.eligible&&!draft){res.status(422).json({error:'This calculation has invalid, unverified or unsupported results and cannot be exported.',errors:snapshot.errors,blockingChecks:snapshot.checks.filter(c=>!['pass','fail','not-applicable'].includes(c.status)).map(c=>c.title)});return;}
  browser=await chromium.launch({headless:true,channel:chromiumChannel});const page=await browser.newPage();
  // Reports contain only server-rendered, escaped input. No external assets or requests are allowed.
  await page.route('**/*',route=>route.abort());
  // Edited sheets arrive as drawing data, are validated and are drawn here like the generated ones (no client SVG).
  const sheetSvgs:Record<string,string>={};
  for(const [sheet,raw] of Object.entries((req.body.cadSheets??{}) as Record<string,unknown>).slice(0,40)){const doc=parseCadDoc(raw);if(!doc||doc.key!==sheet){res.status(422).json({error:`The edited drawing ${sheet.slice(0,20)} is not valid.`});return;}sheetSvgs[sheet]=docToSvg(doc);}
  await page.setContent(reportHtml(snapshot,framing.data,{reviewDraft:draft,sheetSvgs}),{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
  // The report's CSS @page margin boxes print the running header and the footer (page numbers, calc ID): no browser footer.
  const pdf=await page.pdf({format:'Letter',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
  res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${(snapshot.input.number||'cranecalc').replace(/[^\w.-]+/g,'-')}-${revisionIdentity(snapshot).label.replace(/\s+/g,'-')}.pdf"`);res.setHeader('X-Calculation-Revision',snapshot.revision);res.send(pdf);
 }catch(error){console.error(error);res.status(500).json({error:'Report generation failed. Verify the local Chromium runtime with: npx playwright install chromium.'});}finally{
  // The response is complete; release the render lock before browser teardown.
  reporting=false;await browser?.close();
 }
});
if(process.argv.includes('--production')){app.use(express.static(path.resolve('dist')));app.get('/{*path}',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));}
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(400).json({error:'Invalid request body.'}));
app.listen(4174,'127.0.0.1',()=>console.log('CraneCalc local service: http://127.0.0.1:4174'));

import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {cappedDemonstrationProject,newColumnDemonstrationProject} from '../src/engine/demonstration';
import {selectBracketArrangement,selectTieArrangement} from '../src/engine/connectionOptions';
import {defaultColumnCap} from '../src/engine/columnCapInputs';
import {checkFigure,checkGroupPurpose} from '../src/components/checkFigures';
import {loadPathFigure} from '../src/report/designSummary';
import {loadPathSteps} from '../src/report/hairline/figures';
/** Marker numbers of the summary figure: every caption step but the end stops, which are outside its view. */
const stepNumbers=(p:ProjectInput)=>Object.entries(loadPathSteps(p)).filter(([k])=>k!=='stops').map(([,n])=>n!).sort((a,b)=>a-b);
import {Scene} from '../src/report/hairline/scene';
import type {ProjectInput} from '../src/engine/types';

const coloured=(text:string)=>[...text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map(m=>m[1].length===3?m[1].split('').map(c=>c+c).join(''):m[1]).filter(h=>!(h.slice(0,2)===h.slice(2,4)&&h.slice(2,4)===h.slice(4,6)));
const markers=(svg:string)=>[...svg.matchAll(/font-weight="700" fill="#000">(\d+)<\/text>/g)].map(m=>Number(m[1])).sort((a,b)=>a-b);
const variant=(f:(p:ProjectInput)=>void)=>{const p=cappedDemonstrationProject();f(p);return p;};

describe('Hairline isometric report figures',()=>{
 it('draws every physical topic of the capped demonstration as an isometric view of its parts, numbered as captioned',()=>{
  const p=cappedDemonstrationProject(),abstract=['Criteria','Fatigue','Detailing','Project','Column cap','Girder splice'];
  for(const topic of [...Object.keys(checkGroupPurpose),'Geometry','Interfaces']){
   const f=checkFigure(topic,p);
   expect(f.view,topic).toBe(abstract.includes(topic)?'schematic':'isometric');
   expect(markers(f.svg),topic).toEqual(f.path.map((_,i)=>i+1));
   expect(f.svg).not.toMatch(/NaN|undefined|Infinity/);expect(coloured(f.svg)).toEqual([]);
   if(f.view==='isometric')expect(f.svg).toContain('vector-effect="non-scaling-stroke"');
  }
 });
 it('follows the selected bracket, tie and support',()=>{
  const cases:[string,ProjectInput,string,string?][]=[
   ['haunched seat',variant(p=>{p.details=selectBracketArrangement(p.details!,'haunched-seat');}),'Column bracket'],
   ['W stub',variant(p=>{p.details=selectBracketArrangement(p.details!,'rolled-corbel');}),'Column bracket'],
   ['existing bracket',variant(p=>{p.details=selectBracketArrangement(p.details!,'existing-w-corbel');}),'Column bracket','EXISTING'],
   ['seat by others',variant(p=>{p.details!.bracket!.enabled=false;}),'Column bracket','SEAT BY OTHERS'],
   ['flexible plate',variant(p=>{p.details=selectTieArrangement(p.details!,'flexible-plate');}),'Connections','FLEXIBLE PLATE'],
  ];
  for(const [name,p,topic,text] of cases){
   const f=checkFigure(topic,p);
   expect(f.view,name).toBe('isometric');expect(markers(f.svg),name).toEqual(f.path.map((_,i)=>i+1));
   if(text)expect(f.svg,name).toContain(text);
  }
  const cap=newColumnDemonstrationProject();cap.columnCap={...structuredClone(defaultColumnCap),enabled:true};
  const f=checkFigure('Column cap',cap);expect(f.view).toBe('isometric');expect(markers(f.svg)).toEqual([1,2,3,4]);
  expect(loadPathFigure(cap)).toContain('COLUMN CAP');
  // Top-flange angle ties keep their schematic (no isometric model of the angle yet).
  const angle=variant(p=>{p.details=selectTieArrangement(p.details!,'single-angle');});
  expect(checkFigure('Connections',angle).view).toBe('schematic');
 });
 it('numbers the summary assembly without gaps, the base only on a new column, and names the support and tie',()=>{
  // Steps as the caption lists them (loadPathSteps): rail, girder, bearing, support, column, [base], tie, bracing, [stops].
  const capped=loadPathFigure(cappedDemonstrationProject());
  expect(markers(capped)).toEqual(stepNumbers(cappedDemonstrationProject()));expect(markers(capped)).toEqual([1,2,3,4,5,6,7]);
  expect(capped).toContain('TWIN-RIB BRACKET');expect(capped).toContain('TOP TIE');expect(capped).toContain('EXISTING W14X90');
  expect(capped).toContain('class="load-path-figure"');expect(coloured(capped)).toEqual([]);
  const nc=newColumnDemonstrationProject();
  expect(markers(loadPathFigure(nc))).toEqual(stepNumbers(nc));
  expect(loadPathSteps(nc).base!==undefined).toBe(!!(nc.existingColumn?.isNew&&nc.columnBase?.enabled));
 });
 it('paints back to front for the view direction and keeps markers inside the figure',()=>{
  // Two plates one behind the other across the runway: the viewer is on the +y side, so the far one paints first.
  const S=new Scene().box(0,500,0,100,600,100,'focus').box(0,0,0,100,100,100,'context');
  S.marker(1,[0,0,0],-900,-900);
  const svg=S.body({az:38,width:240,height:120}),focusAt=Math.min(...['#dedede','#ececec'].map(c=>svg.indexOf(c)).filter(i=>i>=0)),contextAt=svg.indexOf('fill="#ffffff"');
  expect(contextAt).toBeLessThan(focusAt);
  const [cx,cy]=[...svg.matchAll(/<circle cx="([^"]+)" cy="([^"]+)" r="7"/g)].map(m=>[+m[1],+m[2]])[0];
  expect(cx).toBeGreaterThanOrEqual(8);expect(cy).toBeGreaterThanOrEqual(8);
 });
 it('credits the vendored Hairline kernel under its MIT license',()=>{
  const head=readFileSync('src/report/hairline/iso.ts','utf8').slice(0,600),license=readFileSync('src/report/hairline/LICENSE','utf8');
  expect(head).toContain('github.com/lucasmarkes/hairline');expect(head).toContain('MIT');
  expect(license).toContain('MIT License');expect(license).toContain('Lucas Marques');
 });
});

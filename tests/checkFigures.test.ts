import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {checkFigure,checkFigureHtml,checkGroupPurpose,worksheetFigureTopics} from '../src/components/checkFigures';
import {CheckGroup} from '../src/components/CheckWorksheet';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {selectBracketArrangement,selectTieArrangement} from '../src/engine/connectionOptions';
import {exampleProject} from '../src/engine/defaults';
import {calculate} from '../src/engine/calculate';
import {reportHtml} from '../server/report';
import type {CalculationSnapshot,CheckResult} from '../src/engine/types';

describe('calculation section figures',()=>{
 it('supplies independent, accessible vector figures for every check group and input section',()=>{
  const p=cappedDemonstrationProject();
  for(const topic of new Set([...Object.keys(checkGroupPurpose),...Object.values(worksheetFigureTopics)])){
   const f=checkFigure(topic,p);
   expect(f.svg).toContain('role="img"');expect(f.svg).toContain('<desc>');
   expect(f.svg).not.toMatch(/NaN|undefined|<script|href=|id=/);
   expect(f.note.length).toBeGreaterThan(30);
   if(topic!=='Project')expect(f.title).not.toBe('Inputs, checks and report record');
  }
 });
 it('keeps the top-flange-only angle distinct from legacy both-flange ties without assigning capacity',()=>{
  const p=cappedDemonstrationProject();p.details=selectTieArrangement(p.details!,'single-angle');
  const top=checkFigure('Connections',p);
  expect(top.note).toContain('No lower-flange tie');expect(top.note).toContain('requires its design model');
  expect(top.svg).toContain('SLOTS / SHIMS');expect(top.svg).not.toContain('TOP + BOTTOM TIES');
  delete p.details.brace.singleAngle!.connectionStyle;
  const legacy=checkFigure('Connections',p);
  expect(legacy.title).toBe('Gusseted angle ties');expect(legacy.svg).not.toContain('SLOTS / SHIMS');
 });
 it('distinguishes assessed existing brackets, new welded brackets and disabled component checks',()=>{
  const p=cappedDemonstrationProject();
  p.details=selectBracketArrangement(p.details!,'existing-w-corbel');
  expect(checkFigure('Column bracket',p).note).toContain('documented assessment');
  expect(checkFigure('Column bracket',p).svg).toContain('EXISTING');
  p.details=selectBracketArrangement(p.details,'twin-rib');
  expect(checkFigure('Column bracket',p).note).toContain('root moment');
  p.details.bracket!.enabled=false;
  expect(checkFigure('Column bracket',p).note).toContain('not enabled');
 });
 it('reflects bay count and span continuity and preserves the source inputs',()=>{
  const p=cappedDemonstrationProject();p.spans=[4000,6000];p.system='continuous';
  const before=JSON.stringify(p),f=checkFigure('Geometry',p);
  expect(f.note).toContain('2 continuous');expect(f.svg).toContain('CONTINUOUS GIRDER');
  expect(f.svg).toContain('L2');expect(f.svg).not.toContain('L3');
  for(const topic of Object.keys(checkGroupPurpose))checkFigureHtml(topic,p);
  expect(JSON.stringify(p)).toBe(before);
 });
 it('includes section and grouped check figures in the supplied-load report path',()=>{
  const p=structuredClone(exampleProject);p.scope='analysis';
  const s=calculate(p);expect(s.eligible).toBe(true);
  const html=reportHtml(s);
  expect(html).toContain('data-check-figure="Section"');
  expect(html).toContain('data-check-figure="Loading"');
  expect(html).toContain('data-check-figure="Serviceability"');
  expect(html).toContain('SUPPLIED-LOAD ANALYSIS REPORT ONLY');
 });
 it('escapes metadata and never upgrades the actual check or report eligibility',()=>{
  expect(checkFigureHtml('\"/><script>alert(1)</script>')).not.toContain('<script>');
  const p=cappedDemonstrationProject();p.details=selectTieArrangement(p.details!,'single-angle');
  const c:CheckResult={id:'option-tie-model',group:'Connections',title:'Angle model',status:'unsupported',equation:'',referenceIds:[],note:'Model required.'};
  const html=renderToStaticMarkup(createElement(CheckGroup,{name:'Connections',checks:[c],project:p,units:'US',issuesOnly:true}));
  expect(html).toContain('data-check-figure="Connections"');expect(html).toContain('MODEL REQUIRED');expect(html).not.toContain('>PASS<');
  expect(()=>reportHtml({input:p,eligible:false} as CalculationSnapshot)).toThrow('not eligible');
 });
});

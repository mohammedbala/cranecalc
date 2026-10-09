import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CheckCard,CheckGroup,checkPurpose} from '../src/components/CheckWorksheet';
import ConnectionOptions from '../src/components/ConnectionOptions';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {selectTieArrangement} from '../src/engine/connectionOptions';
import type {CheckResult} from '../src/engine/types';

const check=(patch:Partial<CheckResult>={}):CheckResult=>({id:'test',group:'Strength',title:'Member resistance',status:'pass',equation:'',referenceIds:[],note:'Method and assumptions remain available.',...patch});
const card=(c:CheckResult)=>renderToStaticMarkup(createElement(CheckCard,{check:c,units:'US'}));

describe('compact calculation worksheet',()=>{
 it('shows the check purpose, dimensional demand, capacity and failure status together',()=>{
  const html=card(check({title:'Major-axis bending',status:'fail',demand:8896.44323,capacity:4448.221615,quantity:'force',utilization:2}));
  expect(html).toContain('Resist the governing bending action');
  expect(html).toContain('2 kip');expect(html).toContain('1 kip');
  expect(html).toContain('2.000');expect(html).toContain('FAIL');
  expect(html).toContain('aria-expanded="false"');
 });
 it('does not turn a qualitative pass or a missing capacity into zero utilization',()=>{
  const qualitative=card(check());expect(qualitative).toContain('PASS');expect(qualitative).not.toContain('0.000');
  const pending=card(check({status:'unverified',demand:8896.44323,quantity:'force',utilization:.5}));
  expect(pending).toContain('2 kip');expect(pending).toContain('VERIFY BASIS');
  expect(pending).not.toContain('0.500');expect(pending).not.toContain('PASS');
  expect(pending).toContain('Capacity, limit or provided value: —">—');
 });
 it('presents engine confirmation flags as status, without implying a physical D/C',()=>{
  const c=check({id:'building-class',group:'Criteria',demand:0,capacity:.5,utilization:0});
  const html=card(c);expect(html).toContain('building load repetitions');expect(html).toContain('PASS');expect(html).not.toContain('0.000');
  expect(html).toContain('Demand or requirement: —">—');
  const group=renderToStaticMarkup(createElement(CheckGroup,{name:'Criteria',checks:[c],units:'US',issuesOnly:false}));
  expect(group).not.toContain('0.000');
 });
 it('distinguishes pass, fail, pending and not-applicable counts, including review filtering',()=>{
  const rows=[check(),check({id:'failed',status:'fail',utilization:1.2}),check({id:'missing',status:'incomplete'}),check({id:'na',status:'not-applicable'})];
  const html=renderToStaticMarkup(createElement(CheckGroup,{name:'Strength',checks:rows,units:'US',issuesOnly:true}));
  expect(html).toContain('1 pass · 1 fail · 1 pending · 1 N/A');
  expect(html).toContain('1.200');expect(html).toContain('INPUT REQUIRED');
  expect(html.match(/<article/g)).toHaveLength(2);
 });
 it('explains numerical refinement as convergence, not physical travel clearance',()=>{
  expect(checkPurpose(check({id:'design-travel',group:'Analysis',title:'Design combination refinement'}))).toContain('governing design combination');
  expect(checkPurpose(check({id:'detail-travel',group:'Analysis',title:'Detailed load-position refinement'}))).toContain('numerical convergence');
 });
 it('keeps unavailable connection design models explicit when sketches are collapsed',()=>{
  const p=cappedDemonstrationProject(),value=selectTieArrangement(p.details!,'double-angle');
  const html=renderToStaticMarkup(createElement(ConnectionOptions,{value,onChange:()=>{},numeric:()=>null,system:p.system,units:'US'}));
  expect(html).toContain('Connection check scope');expect(html).toContain('WHY / LOAD PATH');
  expect(html).toContain('Model required');expect(html).toContain('Detailed design paused:');expect(html).toContain('final report blocked');
  expect(html).toContain('<details class="connection-source-notes"><summary>Arrangement sketches, assumptions &amp; references');
 });
});

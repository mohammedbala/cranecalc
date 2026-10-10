import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {withSiUnits,formatSectionMass} from '../src/engine/units';
import {designProject} from './fixtures/aistProject';
import {calculate} from '../src/engine/calculate';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import type {CalculationSnapshot} from '../src/engine/types';
import {structuralGeneralNotes} from '../src/components/structuralNotes';
import {capSheetSvg} from '../src/components/capSheet';
import {AistInputs} from '../src/components/AistInputs';

describe('SI project presentation',()=>{
 it('changes only the unit setting on existing projects and imports',()=>{
  const p=designProject(),before=structuredClone(p),si=withSiUnits(p);
  expect(si.units).toBe('SI');expect({...si,units:before.units}).toEqual(before);expect(p).toEqual(before);expect(withSiUnits(si)).toBe(si);
 });
 it('converts catalogue mass per length without rounding or changing source properties',()=>{
  expect(formatSectionMass(94,'SI')).toBe('139.89 kg/m');expect(formatSectionMass(33.9,'SI')).toBe('50.45 kg/m');expect(formatSectionMass(94,'US')).toBe('94 lb/ft');
 });
 it('keeps capacities, demands and pass/fail decisions identical while displaying SI equations',()=>{
  const us=calculate(designProject()),si=calculate(withSiUnits(designProject()));
  const values=(s:CalculationSnapshot)=>s.checks.map(({id,status,demand,capacity,utilization})=>({id,status,demand,capacity,utilization}));
  expect(si.analysis).toEqual(us.analysis);expect(values(si)).toEqual(values(us));
  expect(si.checks.find(c=>c.id==='minimum-thickness')!.equation).toContain('7.9375');
  expect(si.checks.find(c=>c.id==='rail-clips')!.equation).toContain('609.6');
  expect(si.checks.find(c=>c.id==='column-brackets')!.equation).toContain('kN');
 },30000);
 it('uses SI in fixed input guidance and ARCH D weld notes and title blocks',()=>{
  const input=withSiUnits(cappedDemonstrationProject()),s:CalculationSnapshot={input,revision:'SI-review',createdAt:'2026-10-09',checks:[],properties:null,analysis:null,errors:[],warnings:[],referenceVersion:'',eligible:false};
  const notes=structuralGeneralNotes(s).join(' '),svg=capSheetSvg(s),html=renderToStaticMarkup(createElement(AistInputs,{units:'SI',input:input.aist,onChange:()=>{},numeric:()=>null}));
  expect(notes).toContain('MPA WELD METAL');expect(notes).not.toContain('KSI');
  expect(svg).toContain('914 X 610 MM');expect(svg).toContain('width="914.4mm" height="609.6mm"');expect(svg).toContain('SCALE: 1:');expect(svg).not.toContain('KSI');
  expect(html).toContain('6.35 mm');expect(html).toContain('7.9375 mm');expect(html).toContain('222.41 kN');expect(html).toContain('609.6 mm');expect(html).not.toMatch(/\bkip\b|\bin minimum\b/);
 });
});

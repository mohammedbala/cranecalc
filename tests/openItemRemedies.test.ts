import {describe,expect,it} from 'vitest';
import {sim002Snapshot} from './fixtures/sim002';
import {buildTaxonomy,openKind} from '../src/engine/checkTaxonomy';
import {openGroups} from '../src/report/openItems';
import {summaryElements,selectionFinal,selectionView,selectionRows,printForces} from '../src/report/designSummary';
import {valueCells} from '../src/report/taxonomyReport';
import {radText,tidyNumbers} from '../src/report/reportParts';
import type {CalculationSnapshot,CheckResult} from '../src/engine/types';

/**
 * Open-item remedies and the selection log (final validation, round 9): the tie movement remedy keeps the axial term
 * of H1 and does not offer a longer tie where none can pass; the column cap configurator item is a redesign item; a
 * configurator item the calculation closed reads as closed; rotations keep three significant figures. SIM-002 (stored
 * snapshot, a flexible-plate tie).
 */
const base=sim002Snapshot();
const clone=():CalculationSnapshot=>structuredClone(base);
const check=(s:CalculationSnapshot,id:string)=>s.checks.find(c=>c.id===id)!;
const remedy=(s:CalculationSnapshot,id:string)=>{const tax=buildTaxonomy(s,summaryElements(s.input));return openGroups(tax,s).groups.find(g=>g.members.some(c=>c.id===id))!.remedy;};

describe('tie movement strength remedy',()=>{
 const failing=(note:string)=>{const s=clone(),c=check(s,'tie-move-strength');c.status='fail';c.utilization=2.5;c.demand=2.5;c.capacity=1;c.note=c.note.replace(/ H1 governing state:.*$/,'')+note;return s;};
 it('states the bending reduction with the axial term: (1 - a)/(u - a)',()=>{
  const r=remedy(failing(' H1 governing state: P_r/P_c = 0.5500.'),'tie-move-strength');
  // (1 - 0.55)/(2.5 - 0.55) = 0.231: 77%, not the 60% of 1 - 1/u.
  expect(r).toContain('by at least 77%');expect(r).toContain('P_r/P_c = 0.55');expect(r).toContain('lengthen the clear tie length');
 });
 it('does not offer a longer tie where P_c is elastic and the least H1 at any length exceeds 1',()=>{
  const r=remedy(failing(' H1 governing state: P_r/P_c = 0.5500. At a longer clear length the least H1 is about 2.07 (P_r/P_c = 0.550 grows as L² with P_c elastic, the movement moment falls as 1/L²).'),'tie-move-strength');
  expect(r).toContain('With these bars, a longer clear tie length cannot pass');expect(r).toContain('2.07');expect(r).not.toContain('lengthen the clear tie length');
 });
});

describe('configurator items',()=>{
 const item=(status:CheckResult['status']):CheckResult=>({id:'configurator-column-cap',group:'Detailing',title:'Column cap not resolved by the configurator (bearing bolts of the end fork)',status,equation:'',referenceIds:['criteria'],note:'Column cap not resolved: test; the four bolts. Recommended: the fork couple on a wider bolt spread or more bolts, designed by hand. The closest cap is built and checked.'});
 it('classes the column cap item as redesign, like the girder, tie and column items',()=>{
  expect(openKind({check:item('incomplete'),type:'detailing'})).toBe('redesign');
 });
 it('a log row whose configurator item the calculation closed reads as closed',()=>{
  const s=clone();s.checks.push(item('pass'));
  const row={item:'Open item',entered:'Column cap',designed:'W14X398, closest; cap bearing bolts to be designed by hand',reason:'Column cap not resolved: sized to the limits of its steps it still exceeds bolt-slip 1.80. Recommended: designed by hand.'};
  const v=selectionView(s,row);
  expect(v.item).toBe('Closed item');expect(v.designed).toBe('Column cap on the W14X398 as built, confirmed by the calculation');expect(v.reason).toMatch(/^Column cap, screening estimate: /);
  const open=clone();open.checks.push(item('incomplete'));expect(selectionView(open,row)).toEqual(row);
  // The final calculation annotation, when the snapshot quotes results.
  const f=selectionFinal(s,'Open item','Column cap');if(f)expect(f).toContain('closed by the calculation');
 });
});

describe('rotations',()=>{
 it('keep three significant figures, never 0 for a small rotation',()=>{
  expect(radText(1.918e-5)).toBe('0.0000192');expect(radText(0)).toBe('0');expect(radText(.0012)).toBe('0.0012');
  expect(tidyNumbers("the footing's rotation 1.918e-5 rad on the soil")).toBe("the footing's rotation 0.0000192 rad on the soil");
  expect(tidyNumbers('rotation 1.851e-3 rad, 12.3456 kip')).toBe('rotation 0.00185 rad, 12.3 kip');
 });
});

describe('tie movement bending remedies (round 9 E)',()=>{
 const failing=(id:string,u:number,note:string)=>{const s=clone(),c=check(s,id);if(!c)return undefined;c.status='fail';c.utilization=u;c.demand=u;c.capacity=1;c.note=note;return s;};
 it('keeps the force-controlled part of a fatigue range in the bending cut: (1 - 1/u)/(1 - s)',()=>{
  const s=failing('tie-move-fatigue',1.38,'Category B. Force-controlled share of the range (axial): 0.110.');if(!s)return;
  // (1 - 1/1.38)/(1 - 0.11) = 0.309: 31%, not the 28% of 1 - 1/u.
  expect(remedy(s,'tie-move-fatigue')).toContain('by at least 31%');
 });
 it('on the sleeve-friction bound offers thicker or wider bars, never a longer or thinner tie',()=>{
  const s=failing('tie-move-fatigue',1.85,'Category B. Bending on the sleeve-friction bound: independent of the bar thickness, growing with the clear length. Force-controlled share of the range (axial): 0.045.');if(!s)return;
  const r=remedy(s,'tie-move-fatigue');expect(r).toContain('thicker or wider bars');expect(r).not.toContain('lengthen the clear tie length');expect(r).not.toContain('thinner, more flexible');
 });
 it('a slip-governed H1 asks for bar strength, not a longer tie',()=>{
  const s=failing('tie-move-strength',1.08,'H1. Slip state on the sleeve-friction bound: M_ry = μ_uP_rL + P_r(θd + Δ_T), independent of the bar thickness, growing with the clear length. H1 governing state: P_r/P_c = 0.1127.');if(!s)return;
  const r=remedy(s,'tie-move-strength');expect(r).toContain('thicker or wider bars');expect(r).not.toContain('lengthen the clear tie length');
 });
});

describe('selection log as printed (round 9 E)',()=>{
 it('rounds configurator forces to three significant figures, the nearest unit from 100',()=>{
  expect(printForces('the 154.448 kip support reaction, 976.789 kN, force 63.336 kip, 0.438 in')).toBe('the 154 kip support reaction, 977 kN, force 63.3 kip, 0.438 in');
 });
 it('keeps one row per column cap item',()=>{
  const rows=[{item:'Column cap, at its limits',entered:'configurator default'},{item:'Open item',entered:'Column cap'},{item:'Girder',entered:'x'}];
  expect(selectionRows(rows).map(v=>v.item)).toEqual(['Open item','Girder']);
  expect(selectionRows(rows.slice(0,1)).length).toBe(1);
 });
 it('a detailing rule that prints alike but differs carries the digits that tell the values apart',()=>{
  const c:CheckResult={id:'bracket-rib-edge-thickness',group:'Detailing',title:'Haunched ribs · minimum thickness for the free-edge slenderness',status:'fail',demand:1.12991*25.4,capacity:1.125*25.4,utilization:1.0044,quantity:'length',equation:'',note:'',referenceIds:[]};
  expect(valueCells(c,'detailing','US')).toEqual(['1 1/8 in','≥ 1.130 in']);
 });
});

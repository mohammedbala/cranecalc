import {describe,expect,it} from 'vitest';
import {sim002Snapshot} from './fixtures/sim002';
import {buildTaxonomy,openKind} from '../src/engine/checkTaxonomy';
import {openGroups} from '../src/report/openItems';
import {summaryElements,selectionFinal,selectionView} from '../src/report/designSummary';
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
  expect(r).toContain('A longer clear tie length cannot pass');expect(r).toContain('2.07');expect(r).not.toContain('lengthen the clear tie length');
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
  expect(radText(1.918e-5)).toBe('1.92 × 10⁻⁵');expect(radText(0)).toBe('0');expect(radText(.0012)).toBe('0.0012');
  expect(tidyNumbers("the footing's rotation 1.918e-5 rad on the soil")).toBe("the footing's rotation 1.92 × 10⁻⁵ rad on the soil");
  expect(tidyNumbers('rotation 1.851e-3 rad, 12.3456 kip')).toBe('rotation 0.00185 rad, 12.3 kip');
 });
});

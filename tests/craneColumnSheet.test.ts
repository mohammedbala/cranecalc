import {describe,it,expect} from 'vitest';
import {sheetFixture} from './fixtures/sheets/sheetFixtures';
import {drawingSheetSet,detailTopics} from '../src/components/planSheet';
import {craneColumnTitles} from '../src/components/craneColumnSheet';
import {deliveredRows,deliveredHeadersOf,deliveredNote} from '../src/report/deliveredTable';
import {deliveredForces} from '../src/engine/forcesDelivered';
import {detailTitles} from '../src/components/sheetGraphics';

/**
 * The drawings of a crane column tied to the existing building column (craneColumnSheet.ts), from the stored configured
 * fixtures (scripts/refreshSheetFixtures.ts configFixtures c-crane-15t, c-crane-25t). Readability is sheetReadability's.
 */
describe('crane column drawings',()=>{
 for(const name of ['c-crane-15t','c-crane-25t'])it(`${name}: the crane column topic, the ties to the building column and the H-only forces`,()=>{
  const s=sheetFixture(name),topics=detailTopics(s),keys=topics.map(t=>t.key);
  // The crane column is a new column: its cap, column, base and footing, and bracing, with the crane column details.
  for(const k of ['column-cap','new-column','crane-column','bracing'])expect(keys).toContain(k);
  expect(topics.find(t=>t.key==='crane-column')!.views.map(v=>v.title)).toEqual(Object.values(craneColumnTitles));
  // The girder tie to the building column is detailed (the stiffener tie views also on a capped crane column).
  const views=topics.flatMap(t=>t.views.map(v=>v.title));
  expect(views).toContain(detailTitles.tie);
  const tie=topics.find(t=>t.key==='connection')!.views.find(v=>v.title===detailTitles.tie)!.render().svg;
  expect(tie).toContain('BUILDING COLUMN (REF.)');expect(tie).toContain('FIELD WELD');
  // The footing plan shows the building column's existing footing and the coordination note.
  const footing=topics.find(t=>t.key==='new-column')!.views.find(v=>v.title==='FOOTING / PLAN')!.render().svg;
  expect(footing).toContain('data-existing-footing="building"');expect(footing).toMatch(/OPEN ITEM: THE FOOTINGS OVERLAP/);
  // The column tie section: slots, sleeves, the tab by others and the shop fillets (AWS weld symbol).
  const section=topics.find(t=>t.key==='crane-column')!.views.find(v=>v.title===craneColumnTitles.tie)!.render().svg;
  for(const t of ['VERT. SLOTS','SLEEVE','TAB BY OTHERS','PRETENSIONED AGAINST THE SLEEVES'])expect(section).toContain(t);
  expect(section).toContain('data-multileader="weld"');
  // S-01: the ties on the typical section, no clearance plan to keep beside the building column; S-00: H only.
  const sheets=drawingSheetSet(s),ga=sheets.find(v=>v.number==='S-01')!.svg,cover=sheets.find(v=>v.number==='S-00')!.svg;
  expect(ga).toContain('data-crane-column-ties="section"');expect(ga).not.toContain('data-view="existing-clearance-plan"');
  expect(cover).toContain('FORCES DELIVERED TO THE BUILDING COLUMNS (H ONLY');expect(cover).toContain('CRANE COLUMN REACTIONS TO ITS FOOTING');
  // The delivered table: girder tie and column tie design forces only, the column tie force with the crane column's parts.
  const d=deliveredForces(s)!;
  expect(deliveredHeadersOf(s.input)).toEqual(['Grid','Set','Combination','H girder tie','H column tie']);
  const rows=deliveredRows(s,d);expect(rows.length).toBeGreaterThan(0);expect(rows.every(r=>r.length===5)).toBe(true);
  expect(d.craneColumn!.columnTie).toBeCloseTo(s.craneColumn!.ties.columnTie,6);
  expect(deliveredNote(s,d)).toContain('H column tie');
 },120000);
});

import {describe,it,expect} from 'vitest';
import {sheetFixture} from './fixtures/sheets/sheetFixtures';
import {drawingSheetSet,detailTopics} from '../src/components/planSheet';
import {annotationClashes} from '../src/components/detailSheet';
import {sheetEntities} from '../src/components/svgEntities';
import {holdsFor,unplacedHolds} from '../src/components/detailHolds';
import type {CalculationSnapshot} from '../src/engine/types';

/**
 * HOLD tags (detailHolds.ts): a detail that draws a part the calculation fails carries a boxed HOLD with the failing
 * check, its sheet lists the holds at the top of its notes and the title block counts them; an open item no detail
 * draws is listed on S-00. A set without failures has none, and the tags add no annotation clashes.
 */
const text=(svg:string)=>sheetEntities(svg,'US').filter(e=>e.type==='text').map(e=>e.type==='text'?e.value:'').join(' ');
const failing=(s:CalculationSnapshot,id:string,u?:number)=>{const c=s.checks.find(v=>v.id===id)!;Object.assign(c,{status:'fail',utilization:u??c.utilization});return c;};
describe('HOLD tags at failing details',()=>{
 it('has no HOLD on a set without failures',()=>{
  const s=sheetFixture('t07');expect(s.checks.some(c=>c.status==='fail')).toBe(false);
  expect(holdsFor(s)).toEqual([]);
  for(const v of drawingSheetSet(s))expect(v.svg).not.toContain('data-hold');
 },300000);
 it('tags the views that draw a failing part, lists the holds, counts them, and lists what no view draws on S-00',()=>{
  const s=structuredClone(sheetFixture('t07'));
  failing(s,'end-stop-fit',1.22);failing(s,'torsion-normal',1.31);
  const sheets=drawingSheetSet(s),stop=sheets.find(v=>v.svg.includes('data-detail-title="END STOP / ELEVATION"'))!;
  expect(stop.svg).toMatch(/data-hold="end-stop-fit"/);
  const t=text(stop.svg);
  expect(t).toContain('HOLD - NG END-STOP-FIT D/C 1.22');expect(t).toContain('HOLDS - NOT FOR FABRICATION');
  expect(t).toMatch(/\d+ HOLDS? - NOT FOR FABRICATION/);
  // The girder flange stress is drawn at no detail: it is an S-00 open item.
  const titles=detailTopics(s).flatMap(t=>t.views.map(v=>v.title)),unplaced=unplacedHolds(s,titles).map(h=>h.check.id);
  expect(unplaced).toContain('torsion-normal');expect(unplaced).not.toContain('end-stop-fit');
  const cover=sheets.filter(v=>v.number.startsWith('S-00')).map(v=>text(v.svg)).join(' ');
  expect(cover).toContain('OPEN ITEMS - NOT FOR FABRICATION');expect(cover).toContain('NG TORSION-NORMAL D/C 1.31');
  // The tags add no annotation clashes.
  for(const v of sheets)expect(annotationClashes(v.svg),v.number).toBe(0);
 },300000);
});

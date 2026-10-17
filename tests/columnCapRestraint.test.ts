import {describe,expect,it} from 'vitest';
import {sheetFixture} from './fixtures/sheets/sheetFixtures';
import {drawingSheetSet} from '../src/components/planSheet';
import {sheetEntities} from '../src/components/svgEntities';
import {engineeringSketches} from '../src/components/drafting';
import {checkFigure} from '../src/components/checkFigures';
import {activeColumnCap} from '../src/engine/columnCapInputs';
import {tieLine} from '../src/engine/tieGeometry';
import {constructionRequirements,cjpWelds,enteredFabricationNote} from '../src/engine/constructionNotes';
import {deliveredHeadersOf,deliveredNote} from '../src/report/deliveredTable';

/**
 * A girder on a column cap is restrained at its ends by a fork (the bearing stiffener pair and the bolted bottom flange):
 * the analysis takes the top-flange restraint at the flange itself (tieLine) and checks no tie. Every restraint drawn or
 * described must be that one: no sheet, note, inspection item, erection step, sketch or force table may describe a tie
 * that does not exist, other than to say there is none.
 */
const tieWord=/\b(tie|ties|tied)\b/i,saysNone=/\bno\b[^.;:]{0,30}\b(tie|ties)\b|\(no tie\)/i;
const ghosts=(texts:string[])=>texts.flatMap(t=>t.replace(/\s+/g,' ').split(/(?<=[.;])\s+/)).filter(v=>tieWord.test(v)&&!saysNone.test(v));

describe('column cap: the restraint analysed is the restraint drawn and described',()=>{
 const s=sheetFixture('t07'),p=s.input;
 it('analyses the end fork, with no tie checks',()=>{
  expect(activeColumnCap(p)).toBeTruthy();
  expect(tieLine(p)).toBeCloseTo(p.section.d-p.section.tf/2,6);
  expect(s.checks.filter(c=>/^(tie-|flange-tie|cap-angle)/.test(c.id)).map(c=>c.id)).toEqual([]);
 });
 it('describes no tie on the sheets, in the notes, sketches, figures or force tables',()=>{
  const sheets=drawingSheetSet(s).map(v=>sheetEntities(v.svg,'US').flatMap(e=>e.type==='text'?[e.value]:[]).join(' '));
  const notes=constructionRequirements(p).flatMap(v=>v.items);
  const entered=(['steel','bolting','welding','inspection','erection','railAlignment'] as const).filter(k=>k in p.details!.fabrication).map(k=>enteredFabricationNote(p,k));
  const sketches=engineeringSketches(s).flatMap(d=>d.entities.flatMap(e=>e.type==='text'?[e.text]:[]));
  const figure=checkFigure('Connections',p);
  expect(cjpWelds(p).join(' ')).not.toMatch(tieWord);
  expect(sketches.some(v=>/SK-06/.test(v))).toBe(false);
  expect(figure.title).not.toMatch(tieWord);
  expect(deliveredHeadersOf(p)).toContain('H top');expect(deliveredHeadersOf(p)).not.toContain('H tie');
  expect(ghosts([...sheets,...notes,...entered,...sketches,deliveredNote(s)])).toEqual([]);
 });
});

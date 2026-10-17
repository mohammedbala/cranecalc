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
import {boltGrades} from '../src/engine/constructionNotes';
import {buildTaxonomy} from '../src/engine/checkTaxonomy';
import {summaryElements} from '../src/report/designSummary';
import {openItemGroups} from '../src/report/openItems';
import {endBearingView} from '../src/components/endBearingDetail';
import {annotationClashes} from '../src/components/detailSheet';

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
 it('names every bolt grade, and keys open-item remedies to the new column cap',()=>{
  const q=structuredClone(s);q.input.details!.endBearing!.bolts.grade='A490';
  expect(boltGrades(q.input)).toContainEqual({grade:'A490',where:['girder bearings on the column caps']});
  const materials=sheetEntities(drawingSheetSet(q).find(v=>v.number==='S-00A')?.svg??drawingSheetSet(q)[0].svg,'US').flatMap(e=>e.type==='text'?[e.value]:[]).join(' ');
  expect(materials).toMatch(/GR\. A490 \(GROUP B\) AT THE GIRDER BEARINGS ON THE COLUMN CAPS/);
  expect(constructionRequirements(q.input).find(v=>v.key==='bolting')!.items.join(' ')).toMatch(/Bolt grades: .*A490.*A325/);
  // An entered note giving one grade for every bolt gives way to the grade list.
  expect(enteredFabricationNote(q.input,'bolting')).not.toMatch(/\bA325\b/);
  // A failing cap bolt check: the remedy is for the new cap's bolt group, never an existing column.
  const slip=q.checks.find(c=>c.id==='column-cap-bolt-slip')!;Object.assign(slip,{status:'fail',demand:2.1,capacity:1,utilization:2.1});
  const tax=buildTaxonomy(q,summaryElements(q.input)),g=openItemGroups(tax,q).groups.find(v=>v.governing.id==='column-cap-bolt-slip')!;
  expect(g.remedy).toMatch(/^Raise the locating bolts' slip resistance by at least 110%/);expect(g.remedy).not.toMatch(/existing/i);
 });
 it('draws the bearings of a single-span runway at their own grids, not two girder ends at one grid',()=>{
  const text=(svg:string)=>sheetEntities(`<g data-sheet-content="detail">${svg}</g>`,'US').flatMap(e=>e.type==='text'?[e.value]:[]);
  // Three bays: the shared support, sliding and locating ends at grid 2 with the girder gap between them.
  const shared=endBearingView(s).svg;expect(text(shared)).toContainEqual(expect.stringMatching(/ GAP$/));
  const q=structuredClone(s);q.input.spans=[q.input.spans[0]];
  const v=endBearingView(q).svg,t=text(v);
  expect(t.filter(x=>x==='1'||x==='2').sort()).toEqual(['1','2']);
  expect(t).toContain('SLIDING END');expect(t).toContain('LOCATING END');
  expect(t.some(x=>/ GAP$/.test(x))).toBe(false);
  expect(annotationClashes(v)).toBe(0);
  // Erection adjustment of the shop-drilled cap: at the column base, stated with its basis.
  expect(constructionRequirements(p).find(x=>x.key==='erection')!.items.join(' ')).toMatch(/erection adjustment: set each column to line, elevation and plumb at its base.*J3\.8/);
 });
});

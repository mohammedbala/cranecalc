import {describe,it,expect} from 'vitest';
import {templateProject} from '../src/engine/templates';
import {calculate} from '../src/engine/calculate';
import {reportHtml} from '../server/report';
import {drawingSheetSet,detailTopics} from '../src/components/planSheet';
import {craneColumnLayout} from '../src/engine/craneColumn';
import {girderEndFork,tiedToBuilding} from '../src/engine/craneColumnInputs';
import {tieLine} from '../src/engine/tieGeometry';

/**
 * A crane column tied to the building column (templates t13, t14) has one girder top-flange restraint: the girder tie
 * to the existing building column, in series with that column, the end fork not relied on. The report, its sketches
 * and the drawings say so everywhere; the tie lands on the existing column (field welded, never shop welded to the new
 * crane column); the column tie's tab is designed, not by others; the girder tie's slots take the differential
 * shortening; and the girder tie elevation is its line of action.
 */
const plain=(html:string)=>html.replace(/<style[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ');
describe('crane column: one top-flange restraint model in the report and the drawings',()=>{
 for(const name of ['t13','t14'])it(`${name}: the tie to the building column everywhere, no end-fork or by-others wording`,()=>{
  const p=templateProject(name);expect(tiedToBuilding(p)).toBe(true);expect(girderEndFork(p)).toBe(false);
  const s=calculate(p),text=plain(reportHtml(s,undefined,{reviewDraft:!s.eligible}));
  // The tie is designed and checked: its member, stiffness, connections and movement.
  for(const id of ['brace-member','brace-stiffness','tie-move-strength'])expect(s.checks.find(c=>c.id===id)?.status,id).toBe('pass');
  // No sentence, row, caption or sketch note describes an end fork with no tie, and no unresolved author note prints.
  for(const bad of [/no top tie/i,/no top-flange tie/i,/\(no tie\)/i,/End forks \(top-flange restraint/i,/Girder end fork on the column cap/i,/used as its top-flange restraint/i,/end fork restrains the top flange/i,/to be verified|to be confirmed|as the reference entry states/i,/coefficient 10/i])expect(text,String(bad)).not.toMatch(bad);
  expect(text).toMatch(/The girder top-flange restraint is the girder tie to the building column/);
  expect(text).toMatch(/Column tie to the building column/);expect(text).toMatch(/Existing building column \(tie forces\)/);
  // Drawings: the tie lands on the existing building column, field welded; the column tie tab is detailed.
  const shape=p.craneColumn!.building.shape,svg=[...drawingSheetSet(s).map(v=>v.svg),...detailTopics(s).flatMap(t=>t.views.map(v=>v.render().svg))].join('\n');
  expect(svg).not.toMatch(/TAB BY OTHERS/);expect(svg).not.toMatch(/SHOP WELD COLUMN GUSSET TO (THE )?NEW/);
  expect(svg).toContain(`(E) ${shape} BUILDING COLUMN`);expect(svg).toMatch(/TAB PL [^<]*FIELD WELDED/);
  // The column tie tab checks, and the girder tie's slots sized for the column tie's slot rule and more.
  for(const id of ['crane-column-tab-bearing','crane-column-tab-tension','crane-column-tab-weld','crane-column-tab-web-yielding','crane-column-tab-edge','crane-column-tab-weld-fatigue'])expect(s.checks.find(c=>c.id===id)?.status,id).toBe('pass');
  const slot=s.checks.find(c=>c.id==='tie-release-travel'||c.id==='cap-angle-endplate-travel')!;
  expect(slot.status).toBe('pass');expect(slot.demand!).toBeGreaterThan(s.craneColumn!.slot.demand);
  // Appendix 6 column nodal brace: (1/φ)(8P_r/L_br).
  expect(s.craneColumn!.brace.stiffness.required).toBeCloseTo((p.method==='LRFD'?1/.75:2)*8*s.craneColumn!.brace.Pr/s.craneColumn!.brace.L,6);
  // The girder tie elevation is the tie's line of action above the girder bottom.
  const g=craneColumnLayout(p)!;expect(g.girderTie.elevation).toBeCloseTo(p.existingColumn!.seatElevation+p.details!.bearing.thickness+tieLine(p),6);
 },900000);
});

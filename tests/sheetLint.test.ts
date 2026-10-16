import {describe,it,expect} from 'vitest';
import {sheetFixture,sheetFixtureNames} from './fixtures/sheets/sheetFixtures';
import {drawingSheetSet} from '../src/components/planSheet';
import {sheetEntities} from '../src/components/svgEntities';
import {tieSides,stiffenerTieGeometry} from '../src/engine/tieGeometry';
import {cjpWelds} from '../src/engine/constructionNotes';
import {activeColumnCap} from '../src/engine/columnCapInputs';
import {isCapAngleTie} from '../src/engine/capAngle';

/**
 * Wording that fits the configuration (sheet text of every stored template and generated project): no cap channel words on an uncapped girder, no
 * both-flange tie on a top-only tie, no CJP where no CJP weld is drawn, no shared support on a single bay.
 */
const text=(svg:string)=>sheetEntities(svg,'US').filter(e=>e.type==='text').map(e=>e.type==='text'?e.value:'').join(' ');
describe('sheet wording follows the configuration',()=>{
 for(const name of sheetFixtureNames())it(name,()=>{
  const s=sheetFixture(name),p=s.input,sheets=drawingSheetSet(s),all=sheets.map(v=>`${v.number}: ${text(v.svg)}`).join('\n'),problems:string[]=[];
  const find=(re:RegExp,why:string)=>{for(const m of all.matchAll(re))problems.push(`${why}: …${all.slice(Math.max(0,m.index!-60),m.index!+60)}…`);};
  if(p.section.kind!=='cap')find(/\bCAP (END|ENDS|CHANNEL|LEGS)\b/g,'uncapped girder');
  // A top-only tie: the bolted end bearings restrain the bottom flange (tieSides), or a cap tieback or column cap fork.
  const topOnly=!!p.details&&(activeColumnCap(p)||isCapAngleTie(p)||tieSides(p).length<2);
  if(topOnly)find(/BOTH-FLANGE|BOTH FLANGE TIES?\b|TIES? AT BOTH FLANGES/g,'top-only tie');
  // A CJP weld in the set: drawn with its groove symbol, listed for the inspection (cjpWelds), the stiffener tie gusset,
  // or a bracket or haunch joint specified as CJP groove welds; the project's own inspection text is its own.
  const cjp=sheets.some(v=>v.svg.includes('data-weld="cjp"'))||cjpWelds(p).length>0||!!stiffenerTieGeometry(p)||/CJP GROOVE WELDS AT /.test(all);
  if(!cjp)find(/\bCJP\b(?! WELDS; BOLT| COMPLETE JOINT PENETRATION)/g,'no CJP weld');
  if(p.spans.length<2)find(/SHARED SUPPORT/g,'single bay');
  expect(problems).toEqual([]);
 },300000);
});

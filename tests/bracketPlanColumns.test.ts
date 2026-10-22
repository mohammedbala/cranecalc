import {describe,it,expect} from 'vitest';
import {sheetFixture} from './fixtures/sheets/sheetFixtures';
import {bracketTopic} from '../src/components/bracketSheet';
import {annotationClashes,clearView} from '../src/components/detailSheet';
import {aiscShapeByName} from '../src/data/aiscSections';

/**
 * The welded bracket plan reads clear on every W14 a new column is sized to, the jumbo W14X426 to W14X730 included:
 * their flanges, up to 4.91 in thick, reach well beyond the seat, where the section key's reference and the seat
 * length dimension once stood fixed (sample cases 073, 077 and 081 on the W14X730: the reference on the flange edge
 * or the grid line, the seat length value on the grid line). Each fixture's bracket is drawn on the column as built
 * (c073, c077) and on the receiving columns below, in US and SI units, as the sheet draws it (clearView).
 */
const plan=(name:string,units:'US'|'SI',shape?:string)=>{
 const s=sheetFixture(name);s.input.units=units;
 const b=s.input.details!.bracket!,w=shape?aiscShapeByName(shape)!:undefined;
 if(w){Object.assign(b.receiver,{depth:w.d*25.4,width:w.bf*25.4,flangeThickness:w.tf*25.4,webThickness:w.tw*25.4});if(s.input.existingColumn?.shape)s.input.existingColumn.shape=w.name;}
 return bracketTopic(s)!.views.find(v=>v.title==='WELDED BRACKET / PLAN')!;
};
describe('welded bracket plan on jumbo columns',()=>{
 it('draws the sample cases on the W14X730 without annotation clashes',()=>{
  for(const name of ['c073','c077'])for(const units of ['US','SI'] as const){
   const s=sheetFixture(name);expect(s.input.details!.bracket!.receiver.source).toContain('W14X730');
   const v=plan(name,units),c=clearView(v).render();
   expect(c.clashes,`${name} ${units} ${c.scale}`).toBe(0);
   // In feet and inches the plan reads clear at its own scale (3/4" = 1'-0"), where the reference stood on the flange edge.
   if(units==='US')expect(annotationClashes(v.render().svg),`${name} at its own scale`).toBe(0);
  }
 });
 it('draws the bracket plans of the templates and generated projects on W14X398 to W14X730 columns without annotation clashes',()=>{
  const problems:string[]=[];
  for(const name of ['t01','t08','s015','s031','c015'])for(const units of ['US','SI'] as const)for(const shape of ['W14X398','W14X426','W14X550','W14X605','W14X665','W14X730']){
   const c=clearView(plan(name,units,shape)).render();
   if(c.clashes)problems.push(`${name} ${units} ${shape}: ${c.clashes} clashes at ${c.scale}`);
  }
  expect(problems).toEqual([]);
 },120000);
});

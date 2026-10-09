import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildReferenceFraming } from '../src/components/referenceFraming';
import { referenceColumns, referenceCrossheads } from '../src/data/aiscReferenceShapes';

function frame(supports = [-3.81,3.81]) {
  const material = new THREE.MeshBasicMaterial(), edge = new THREE.LineBasicMaterial();
  return buildReferenceFraming({ supports, girderDepth:.6096, girderWidth:.254, columnHeight:3.048, roofBottom:2.8307, column:referenceColumns[0], crosshead:referenceCrossheads[0], materials:{column:material,beam:material,plate:material,foundation:material,edge} });
}
const bounds = (group:THREE.Group,name:string) => new THREE.Box3().setFromObject(group.getObjectByName(name)!);
describe('Column-supported runway geometry', () => {
  it('carries the runway on a bracket attached to a continuous AISC column', () => {
    const {group,floor,columnOffset,columnTop,columnBottom} = frame();
    const col=bounds(group,'column-S1'),bracket=bounds(group,'bracket-S1'),seat=bounds(group,'bearing-seat-S1'),end=bounds(group,'bracket-end-plate-S1');
    const c=col.getSize(new THREE.Vector3()),b=bracket.getSize(new THREE.Vector3());
    expect(c.x).toBeCloseTo(.3683,6);expect(c.z).toBeCloseTo(.3556,6);expect(c.y).toBeCloseTo(columnTop-columnBottom,6);
    expect(col.getCenter(new THREE.Vector3()).z).toBeCloseTo(columnOffset,6);
    expect(col.min.y).toBeLessThan(seat.min.y);expect(col.max.y).toBeGreaterThan(.6096/2);
    expect(b.x).toBeCloseTo(.203454,6);expect(b.y).toBeCloseTo(.30226,6);
    expect(seat.max.y).toBeCloseTo(-.3048,6);expect(bracket.max.y).toBeCloseTo(seat.min.y,6);
    expect(bracket.max.z).toBeCloseTo(end.min.z,6);expect(end.max.z).toBeCloseTo(col.min.z,6);
    expect(bracket.min.z).toBeLessThan(seat.min.z);expect(bracket.max.z).toBeGreaterThan(seat.max.z);
    const base=bounds(group,'base-plate-S1'),pad=bounds(group,'foundation-pad-S1');
    expect(base.max.y).toBeCloseTo(col.min.y,6);expect(pad.max.y).toBeCloseTo(base.min.y,6);expect(pad.min.y).toBeCloseTo(floor,6);
    expect(base.getCenter(new THREE.Vector3()).z).toBeCloseTo(columnOffset,6);
    expect(pad.min.z).toBeGreaterThan(seat.max.z); // No independent footing under the rail.
    expect(group.getObjectByName('crosshead-S1')).toBeUndefined();expect(group.getObjectByName('column-cap-S1')).toBeUndefined();
    expect(group.getObjectByName('bracket-knee-S1-1')).toBeDefined();
  });
  it('places exactly one building column and one bracket at each support station', () => {
    const supports=[-9,-3,3,9],{group}=frame(supports);
    supports.forEach((x,i)=>{
      expect(bounds(group,`column-S${i+1}`).getCenter(new THREE.Vector3()).x).toBeCloseTo(x,6);
      expect(bounds(group,`bracket-S${i+1}`).getCenter(new THREE.Vector3()).x).toBeCloseTo(x,6);
    });
    expect(group.children.filter(c=>/^column-S\d+$/.test(c.name))).toHaveLength(4);
    expect(group.getObjectByName('column-S1')!.userData.aiscShape).toBe('W14X90');
    expect(group.getObjectByName('bracket-S1')!.userData.aiscShape).toBe('W12X40');
    expect(group.getObjectByName('column-S1')!.children.filter(c=>c.type==='Mesh')).toHaveLength(3);
  });
});

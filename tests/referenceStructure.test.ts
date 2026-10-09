import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildReferenceStructure, cloneOppositeRunway } from '../src/components/referenceStructure';
import { buildReferenceFraming } from '../src/components/referenceFraming';
import { createHardwareBuilder } from '../src/components/connectionDetails';
import { referenceColumns, referenceCrossheads } from '../src/data/aiscReferenceShapes';

function structure(supports = [-3.81, 3.81], railZ=0) {
  const material = new THREE.MeshBasicMaterial(), edge = new THREE.LineBasicMaterial(), hardware = createHardwareBuilder(material);
  const runway = buildReferenceFraming({ supports, girderDepth: .6096, girderWidth: .254, columnHeight: 3.048, roofBottom: 2.8307, column: referenceColumns[0], crosshead: referenceCrossheads[0], materials: { column: material, beam: material, plate: material, foundation: material, edge } });
  const result = buildReferenceStructure({ supports, bayWidth: 9.144, columnBottom: runway.columnBottom, floor: runway.floor, railTop: .3923, roofClearance: 2.4384, columnOffset: runway.columnOffset, column: referenceColumns[0], hardware, materials: { column: material, beam: material, plate: material, foundation: material, brace: material, crane: material, edge }, cranes: [{ id: 'crane-1', wheels: [-1.8, 1.8] }], wheelRadius: .0975, railZ });
  const far=cloneOppositeRunway(runway.group,9.144,supports,0);result.group.add(runway.group,far);result.group.updateMatrixWorld(true);return { ...result, hardware, runway };
}
const bounds = (group: THREE.Group, name: string) => new THREE.Box3().setFromObject(group.getObjectByName(name)!);
describe('Whole reference structure', () => {
  it('places complete building frames on both sides, with contacting bases and roof caps', () => {
    const { group, rows, buildingColumns, roofBottom, hardware } = structure();expect(buildingColumns).toBe(4);expect(hardware.count).toBe(48);
    for (const side of [1, 2]) for (const station of [1, 2]) {
      const name = `B${side}-S${station}`, column = bounds(group, `${side===2?'F-':''}column-S${station}`), base = bounds(group, `${side===2?'F-':''}base-plate-S${station}`), cap = bounds(group, `${name}-cap`);
      expect(column.getCenter(new THREE.Vector3()).z).toBeCloseTo(rows[side - 1], 6);
      expect(base.max.y).toBeCloseTo(column.min.y, 6);expect(cap.min.y).toBeCloseTo(column.max.y, 6);expect(cap.max.y).toBeCloseTo(roofBottom, 6);
      expect(bounds(group, `roof-beam-${station}`).min.y).toBeCloseTo(cap.max.y, 6);
    }
    let columnCount=0;group.traverse(o=>{if(/^(F-)?column-S\d+$/.test(o.name))columnCount++;});expect(columnCount).toBe(4);
    expect(group.getObjectByName('roof-beam-1')!.userData.aiscShape).toBe('W16X50');expect(group.getObjectByName('purlin-1-1')!.userData.aiscShape).toBe('W10X33');
    const bolt = group.getObjectByName('B1-S1-RB-1')!, flange = group.getObjectByName('roof-beam-1-bottom-flange')!;
    expect(new THREE.Raycaster(new THREE.Vector3(bolt.position.x, 5, bolt.position.z), new THREE.Vector3(0, -1, 0)).intersectObject(flange, false)).toHaveLength(0);
  });
  it('extends with runway support stations and includes side/roof bracing and a crane bridge', () => {
    const { group, buildingColumns, rows } = structure([-8, 0, 8]);expect(buildingColumns).toBe(6);
    expect(group.getObjectByName('roof-beam-3')).toBeDefined();expect(group.getObjectByName('purlin-2-5')).toBeDefined();
    expect(group.getObjectByName('wall-brace-1-1-A')).toBeDefined();expect(group.getObjectByName('wall-brace-2-2-B')).toBeDefined();expect(group.getObjectByName('roof-brace-2-A')).toBeDefined();
    expect(rows[0]).toBeGreaterThan(0);expect(rows[1]).toBeLessThan(-9.144);
    const bridge = bounds(group, 'crane-bridge-1-0.35');expect(bridge.min.z).toBeCloseTo(-9.144, 6);expect(bridge.max.z).toBeCloseTo(0, 6);
  });
  it('keeps the schematic bridge aligned with eccentric mirrored rail centerlines',()=>{
    const {group}=structure([-3.81,3.81],.08),bridge=bounds(group,'crane-bridge-1-0.35');
    expect(bridge.min.z).toBeCloseTo(-9.224,6);expect(bridge.max.z).toBeCloseTo(.08,6);
    const near=bounds(group,'end-truck-1-0.08'),far=bounds(group,'end-truck-1--9.224');
    expect(near.getCenter(new THREE.Vector3()).z).toBeCloseTo(.08,6);expect(far.getCenter(new THREE.Vector3()).z).toBeCloseTo(-9.224,6);
  });
  it('duplicates runway geometry without changing the source and assigns unique selectable part IDs', () => {
    const { runway } = structure(), sourcePosition = runway.group.position.clone();
    const far = cloneOppositeRunway(runway.group, 9.144, [-3.81, 3.81], 0);far.updateMatrixWorld(true);
    expect(runway.group.position.equals(sourcePosition)).toBe(true);expect(far.position.z).toBe(-9.144);
    const original = runway.group.getObjectByName('base-plate-S1') as THREE.Mesh, opposite = far.getObjectByName('F-base-plate-S1') as THREE.Mesh;
    expect(opposite.geometry).toBe(original.geometry);expect(opposite.userData.part.id).toBe('F-base-plate-S1');expect(original.userData.part.id).toBe('base-plate-S1');
    expect(opposite.userData.part.support).toEqual({ x: -3.81, z: -9.144-runway.columnOffset });
    expect(bounds(far, 'F-base-plate-S1').getCenter(new THREE.Vector3()).z).toBeCloseTo(-9.144-runway.columnOffset, 6);
    expect(far.scale.z).toBe(-1);
    expect(bounds(far, 'F-bracket-end-plate-S1').min.z).toBeCloseTo(bounds(far,'F-column-S1').max.z,6);
  });
});

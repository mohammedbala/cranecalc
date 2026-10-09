import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildRunwayDetails, createHardwareBuilder, horizontalPlateGeometry } from '../src/components/connectionDetails';
import { buildReferenceFraming } from '../src/components/referenceFraming';
import { referenceColumns, referenceCrossheads } from '../src/data/aiscReferenceShapes';

const material = new THREE.MeshBasicMaterial(), edge = new THREE.LineBasicMaterial();
function detailedFrame(supports = [-3.81, 3.81]) {
  const hardware = createHardwareBuilder(material);
  const frame = buildReferenceFraming({ supports, girderDepth: .6096, girderWidth: .254, girderFlangeT: .01905, columnHeight: 3.048, column: referenceColumns[0], crosshead: referenceCrossheads[0], materials: { column: material, beam: material, plate: material, foundation: material, edge }, hardware });
  frame.group.updateMatrixWorld(true);return { ...frame, hardware };
}
function verticalHits(mesh: THREE.Object3D, x: number, z: number) {
  return new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0)).intersectObject(mesh, false);
}
describe('Bolt-level visualization geometry', () => {
  it('drills through plates while retaining solid material around the hole', () => {
    const mesh = new THREE.Mesh(horizontalPlateGeometry(.4, .3, .0254, [{ x: .08, z: -.07, diameter: .022 }]), material); mesh.updateMatrixWorld(true);
    expect(verticalHits(mesh, .08, -.07)).toHaveLength(0);
    expect(verticalHits(mesh, 0, 0).length).toBeGreaterThan(0);
  });
  it('aligns seat, column-bracket and base holes with bolt axes and retains inboard girder bolts', () => {
    const { group, girderBoltHoles, hardware } = detailedFrame();expect(hardware.count).toBe(32);expect(girderBoltHoles).toHaveLength(8);
    for (const h of girderBoltHoles) expect(h.x).toBeGreaterThan(-3.81);for (const h of girderBoltHoles) expect(h.x).toBeLessThan(3.81);
    for (const [boltName, plateName] of [['S1-GS-1','bearing-seat-S1'],['S1-SC-1','bearing-seat-S1'],['S1-AR-1','base-plate-S1']]) {
      const bolt = group.getObjectByName(boltName)!, plate = group.getObjectByName(plateName)!;
      const p = bolt.getWorldPosition(new THREE.Vector3());expect(verticalHits(plate, p.x, p.z)).toHaveLength(0);
      expect(bolt.userData.part.components).toContain('washer');
    }
    const endBolt=group.getObjectByName('S1-EB-1')!, endPlate=group.getObjectByName('bracket-end-plate-S1')!, column=group.getObjectByName('column-S1')!;
    const position=endBolt.getWorldPosition(new THREE.Vector3());
    const ray=new THREE.Raycaster(new THREE.Vector3(position.x,position.y,-1),new THREE.Vector3(0,0,1));
    expect(ray.intersectObject(endPlate,false)).toHaveLength(0);
    expect(ray.intersectObject(column.getObjectByName('bottom-flange')!,false)).toHaveLength(0);
    expect(ray.intersectObject(column.getObjectByName('top-flange')!,false).length).toBeGreaterThan(0);
    const seatBolt=group.getObjectByName('S1-SC-1')!,bracket=group.getObjectByName('bracket-S1')!;
    expect(verticalHits(bracket.getObjectByName('top-flange')!,seatBolt.position.x,seatBolt.position.z)).toHaveLength(0);
  });
  it('places heads and washers above the grip, nuts and threaded tails below it, sharing geometry', () => {
    const hardware = createHardwareBuilder(material), group = new THREE.Group();
    const a = hardware.bolt(group, { id: 'B1', family: 'Test bolt', description: '', diameter: .01905, grip: .04 }, new THREE.Vector3());
    const b = hardware.bolt(group, { id: 'B2', family: 'Test bolt', description: '', diameter: .01905, grip: .04 }, new THREE.Vector3(1, 0, 0));
    const box = new THREE.Box3().setFromObject(a);expect(box.max.y).toBeGreaterThan(.05);expect(box.min.y).toBeLessThan(-.025);expect(a.geometry).toBe(b.geometry);
    expect(a.userData.part.components).toContain('hex head');expect(a.userData.part.components).toContain('hex nut');
    const horizontal = hardware.bolt(group, { id: 'B3', family: 'Hub bolt', description: '', diameter: .0127, grip: .067 }, new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
    const bounds = new THREE.Box3().setFromObject(horizontal);expect(bounds.max.z).toBeGreaterThan(.067);expect(bounds.min.z).toBeLessThan(0);
  });
  it('creates rail clamps with corresponding flange holes and skips clips without flange clearance', () => {
    const hardware = createHardwareBuilder(material), options = { supports: [-3.81, 3.81], length: 7.62, depth: .6096, width: .254, flangeT: .01905, webT: .0127, railBase: .3048, railZ: 0, railBearingWidth: .254, railBearingT: .01905, hardware, plate: material, weld: material, edge };
    const details = buildRunwayDetails(options);expect(details.clipLocations).toHaveLength(13);expect(details.railHoles).toHaveLength(26);expect(hardware.count).toBe(26);
    details.group.updateMatrixWorld(true);const clip = details.group.getObjectByName('rail-clip-7-1')!;
    const bolt = details.group.getObjectByName('RC-7-R')!;expect(verticalHits(clip, bolt.position.x, bolt.position.z)).toHaveLength(0);
    const offCenter = buildRunwayDetails({ ...options, railZ: .06 });expect(offCenter.clipLocations).toHaveLength(0);
  });
});

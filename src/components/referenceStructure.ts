import * as THREE from 'three';
import { shapeMeters, referenceCrossheads, type ReferenceShape } from '../data/aiscReferenceShapes';
import { horizontalPlateGeometry, type HardwareBuilder, type Hole, type PartInfo } from './connectionDetails';
import { buildPrefabFrame } from './prefabFrame';
import type { FrameStyle } from './metalBuildingGeometry';

interface StructureMaterials { column: THREE.Material; beam: THREE.Material; plate: THREE.Material; foundation: THREE.Material; brace: THREE.Material; crane: THREE.Material; edge: THREE.LineBasicMaterial }
interface StructureOptions {
  supports: number[]; bayWidth: number; columnBottom: number; floor: number; railTop: number;
  roofClearance: number; columnOffset: number; column: ReferenceShape; hardware?: HardwareBuilder; materials: StructureMaterials;
  cranes: { id: string; wheels: number[] }[]; wheelRadius: number; railZ?: number;
  frameStyle?:FrameStyle; roofSlope?:number; bracketTop?:number;
}

// A complete illustrative industrial bay around the calculated runway. Members use
// the existing AISC geometry extract; the arrangement is not a building analysis.
export function buildReferenceStructure(o: StructureOptions) {
  const group = new THREE.Group(); group.name = 'reference-building';
  const c = shapeMeters(o.column), roofShape = referenceCrossheads[2], purlinShape = referenceCrossheads[1], tieShape = referenceCrossheads[0];
  const r = shapeMeters(roofShape), p = shapeMeters(purlinShape), plateT = .0254;
  const offset = o.columnOffset, rows = [offset, -o.bayWidth - offset];
  const roofBottom = o.railTop + o.roofClearance, columnTop = roofBottom - plateT, roofTop = roofBottom + r.d;
  const first = o.supports[0], last = o.supports[o.supports.length - 1];
  const prefab=o.frameStyle==='tapered'?buildPrefabFrame({...o,bracketTop:o.bracketTop??-.33,roofSlope:o.roofSlope??2}):null;
  if(prefab)group.add(prefab.group);
  const box = (name: string, l: number, h: number, w: number, position: THREE.Vector3, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(l, h, w), material); mesh.name = name; mesh.position.copy(position); group.add(mesh);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), o.materials.edge)); return mesh;
  };
  const plate = (name: string, l: number, t: number, w: number, position: THREE.Vector3, holes: Hole[], family: string, support: { x: number; z: number }) => {
    const mesh = new THREE.Mesh(horizontalPlateGeometry(l, w, t, holes), o.materials.plate); mesh.name = name; mesh.position.copy(position); group.add(mesh);
    mesh.userData.part = { id: name, family, description: 'Illustrative building connection', support } satisfies PartInfo;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), o.materials.edge)); return mesh;
  };
  const member = (name: string, shape: ReferenceShape, start: THREE.Vector3, end: THREE.Vector3, material: THREE.Material, family: string, holes: Hole[] = []) => {
    const member = new THREE.Group(), dim = shapeMeters(shape), delta = end.clone().sub(start), length = delta.length(), axis = delta.normalize();
    member.name = name; member.userData.aiscShape = shape.name;
    const up = Math.abs(axis.y) > .99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const depth = up.addScaledVector(axis, -up.dot(axis)).normalize(), width = new THREE.Vector3().crossVectors(axis, depth).normalize();
    member.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(axis, depth, width)); member.position.copy(start).add(end).multiplyScalar(.5);
    for (const [suffix, y, flangeHoles] of [['top-flange', (dim.d - dim.tf) / 2, []], ['bottom-flange', -(dim.d - dim.tf) / 2, holes]] as const) {
      const mesh = new THREE.Mesh(horizontalPlateGeometry(length, dim.bf, dim.tf, [...flangeHoles]), material); mesh.position.y = y; mesh.name = `${name}-${suffix}`; member.add(mesh);
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), o.materials.edge));
    }
    const web = new THREE.Mesh(new THREE.BoxGeometry(length, dim.d - 2 * dim.tf, dim.tw), material); web.name = `${name}-web`; member.add(web);
    for (const mesh of member.children) mesh.userData.part = { id: mesh.name, family, description: `${shape.name} · representative building member; rolled fillets omitted.` } satisfies PartInfo;
    group.add(member); return member;
  };
  const rod = (name: string, start: THREE.Vector3, end: THREE.Vector3) => {
    const delta = end.clone().sub(start), mesh = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, delta.length(), 8), o.materials.brace);
    mesh.name = name; mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); mesh.position.copy(start).add(end).multiplyScalar(.5); group.add(mesh);
    mesh.userData.part = { id: name, family: 'Reference bracing', description: 'Schematic tension rod; bracing forces and adequacy not evaluated.' } satisfies PartInfo;
  };
  // Continuous building columns and their foundations are supplied by the runway
  // bracket assembly. Only roof caps and framing are added here.
  if(!prefab){
  o.supports.forEach((x, i) => {
    const roofHoles: Hole[] = [], roofMid = (rows[0] + rows[1]) / 2;
    rows.forEach((z, side) => {
      const id = `B${side + 1}-S${i + 1}`, support = { x, z }, capHoles: Hole[] = [];
      if (o.hardware) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const n = (sx < 0 ? 1 : 3) + (sz < 0 ? 0 : 1);
        const bx = sx * (r.bf / 2 - .035), bz = sz * (c.d / 2 + .05);
        capHoles.push({ x: bx, z: bz, diameter: .02205 }); roofHoles.push({ x: z + bz - roofMid, z: -bx, diameter: .02205 });
        o.hardware.bolt(group, { id: `${id}-RB-${n}`, family: 'Roof bearing bolt', description: 'Roof beam to building-column cap', diameter: .01905, grip: plateT + r.tf, support }, new THREE.Vector3(x + bx, columnTop, z + bz));
      }
      plate(`${id}-cap`, c.bf + .18, plateT, c.d + .2, new THREE.Vector3(x, roofBottom - plateT / 2, z), capHoles, 'Roof column cap', support);
    });
    member(`roof-beam-${i + 1}`, roofShape, new THREE.Vector3(x, roofBottom + r.d / 2, rows[1] - .35), new THREE.Vector3(x, roofBottom + r.d / 2, rows[0] + .35), o.materials.beam, 'Roof beam', roofHoles);
  });
  for (let i = 0; i < o.supports.length - 1; i++) {
    const start = o.supports[i], end = o.supports[i + 1];
    if (end - start > r.bf) for (const [side, z] of rows.entries()) {
      member(`eave-tie-${side + 1}-${i + 1}`, tieShape, new THREE.Vector3(start + r.bf / 2, roofBottom + r.d / 2, z), new THREE.Vector3(end - r.bf / 2, roofBottom + r.d / 2, z), o.materials.beam, 'Longitudinal eave beam');
    }
    for (let j = 1; j <= 5; j++) {
      const z = rows[1] + (rows[0] - rows[1]) * j / 6;
      member(`purlin-${i + 1}-${j}`, purlinShape, new THREE.Vector3(start, roofTop + p.d / 2, z), new THREE.Vector3(end, roofTop + p.d / 2, z), o.materials.beam, 'Roof purlin');
    }
  }
  // Braced end bays on each long side, including gussets and exposed fasteners.
  const bracedBays = [...new Set([0, o.supports.length - 2])];
  for (const bay of bracedBays) for (const [side, z] of rows.entries()) {
    const outward = side === 0 ? 1 : -1, braceZ = z + outward * (c.d / 2 + .04), lower = o.columnBottom + .65, upper = columnTop - .45;
    const start = o.supports[bay], end = o.supports[bay + 1];
    rod(`wall-brace-${side + 1}-${bay + 1}-A`, new THREE.Vector3(start, lower, braceZ), new THREE.Vector3(end, upper, braceZ));
    rod(`wall-brace-${side + 1}-${bay + 1}-B`, new THREE.Vector3(start, upper, braceZ + outward * .035), new THREE.Vector3(end, lower, braceZ + outward * .035));
  }
  for (const side of [0, 1]) {
    const z = rows[side], outward = side === 0 ? 1 : -1;
    const stations = [...new Set(bracedBays.flatMap(b => [b, b + 1]))];
    for (const station of stations) for (const [level, y] of [o.columnBottom + .65, columnTop - .45].entries()) {
      const x = o.supports[station], id = `B${side + 1}-S${station + 1}-G${level + 1}`, support = { x, z };
      const holes = o.hardware ? [-1, 1].flatMap(sx => [-1, 1].map(sy => ({ x: sx * .045, z: -sy * .055, diameter: .02205 }))) : [];
      const gusset = plate(id, .18, .012, .22, new THREE.Vector3(x, y, z + outward * (c.d / 2 + .006)), holes, 'Bracing gusset', support);gusset.rotation.x = Math.PI / 2;
      if (o.hardware) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const n = (sx < 0 ? 1 : 3) + (sy < 0 ? 0 : 1);
        o.hardware.bolt(group, { id: `${id}-bolt-${n}`, family: 'Bracing gusset bolt', description: 'Representative rod-bracing attachment', diameter: .01905, grip: c.tf + .012, support }, new THREE.Vector3(x + sx * .045, y + sy * .055, z + outward * (c.d / 2 - c.tf)), new THREE.Vector3(0, 0, outward));
      }
    }
  }
  for (const bay of bracedBays) {
    const a = o.supports[bay], b = o.supports[bay + 1], y = roofTop + p.d + .04;
    rod(`roof-brace-${bay + 1}-A`, new THREE.Vector3(a, y, rows[0]), new THREE.Vector3(b, y, rows[1]));
    rod(`roof-brace-${bay + 1}-B`, new THREE.Vector3(a, y + .035, rows[1]), new THREE.Vector3(b, y + .035, rows[0]));
  }
  }
  // A schematic double-girder bridge links the actual mirrored rail centerlines.
  const railRows=[o.railZ??0,-o.bayWidth-(o.railZ??0)];
  for (const [i, crane] of o.cranes.entries()) {
    if (!crane.wheels.length) continue;
    const min = Math.min(...crane.wheels), max = Math.max(...crane.wheels), x = (min + max) / 2;
    const truckTop = o.railTop + o.wheelRadius * 2 + .0125 + .22, girderBottom = truckTop;
    for (const z of railRows) box(`end-truck-${i + 1}-${z}`, Math.max(.65, max - min + .3), .22, .18, new THREE.Vector3(x, truckTop - .11, z), o.materials.crane);
    for (const dx of [-.35, .35]) member(`crane-bridge-${i + 1}-${dx}`, tieShape, new THREE.Vector3(x + dx, girderBottom + shapeMeters(tieShape).d / 2, railRows[1]), new THREE.Vector3(x + dx, girderBottom + shapeMeters(tieShape).d / 2, railRows[0]), o.materials.crane, 'Schematic crane bridge');
    const trolleyY = girderBottom + shapeMeters(tieShape).d + .12;
    box(`crane-trolley-${i + 1}`, 1.05, .24, .8, new THREE.Vector3(x, trolleyY, -o.bayWidth / 2), o.materials.crane);
    const cableBottom = Math.max(o.floor + .6, o.railTop - 1.2);
    rod(`hoist-cable-${i + 1}`, new THREE.Vector3(x, trolleyY - .12, -o.bayWidth / 2), new THREE.Vector3(x, cableBottom, -o.bayWidth / 2));
    const hook = new THREE.Mesh(new THREE.TorusGeometry(.1, .025, 8, 20, Math.PI * 1.5), o.materials.crane);hook.position.set(x, cableBottom - .07, -o.bayWidth / 2);hook.rotation.z = -Math.PI / 2;group.add(hook);
  }
  return { group, rows, roofBottom, roofTop: prefab?.roofTop??roofTop+p.d+.075, buildingColumns: o.supports.length * 2, bayWidth: o.bayWidth, roofShape: prefab?.roofShape??roofShape.name, purlinShape: prefab?.purlinShape??purlinShape.name, first, last };
}

export function cloneOppositeRunway(source: THREE.Group, bayWidth: number, supports: number[], railZ: number) {
  const clone = source.clone(true);clone.name = 'opposite-runway-reference';clone.position.z = -bayWidth;clone.scale.z = -1;
  const arrows: THREE.Object3D[] = [];
  clone.traverse(object => {
    if (object instanceof THREE.ArrowHelper) arrows.push(object);
    const part = object.userData.part as PartInfo | undefined;
    if (part) {
      const station = /(?:^|-)S(\d+)(?:-|$)/.exec(part.id);
      object.userData.part = { ...part, id: `F-${part.id}`, description: `Opposite runway reference · ${part.description}`, support: { x: station ? supports[Number(station[1]) - 1] : object.position.x - .1, z: -bayWidth - (part.support?.z ?? (station ? 0 : railZ)) } } satisfies PartInfo;
      object.name = `F-${part.id}`;
    } else if (object.name) object.name = `F-${object.name}`;
  });
  arrows.forEach(a => a.removeFromParent());return clone;
}

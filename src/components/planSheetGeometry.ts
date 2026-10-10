import * as THREE from 'three';
import {bracketModelDepth} from '../engine/connectionOptions';
import {girderSegments} from '../engine/simpleSupports';
import {independentBearingSettings,buildIndependentSupports} from './independentSupportGeometry';
import type { ProjectInput } from '../engine/types';
import { validateProject } from '../engine/calculate';
import { referenceColumns, referenceCrossheads, shapeMeters } from '../data/aiscReferenceShapes';
import { buildReferenceFraming,newColumnFraming } from './referenceFraming';
import { buildReferenceStructure, cloneOppositeRunway } from './referenceStructure';
import { defaultFraming, framingSchema, type FramingSettings } from './framingSettings';
import {flangeTieGeometry} from '../engine/tieGeometry';
const tieFaceMeters=(p:Parameters<typeof flangeTieGeometry>[0])=>{const f=flangeTieGeometry(p)?.face;return f===undefined?undefined:f/1000;};

export type Point = [number, number, number];
export type Segment = [Point, Point];

// No WebGL or raster screenshot: extract nominal member edges from the SAME
// building builders used by the interactive viewer, then project vector lines.
function edges(group: THREE.Group): Segment[] {
  group.updateMatrixWorld(true);
  const result: Segment[] = [], seen = new Set<string>();
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = new THREE.EdgesGeometry(object.geometry, 20), positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i += 2) {
      const a = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).toArray() as Point;
      const b = new THREE.Vector3().fromBufferAttribute(positions, i + 1).applyMatrix4(object.matrixWorld).toArray() as Point;
      const key = [a, b].map(p => p.map(v => v.toFixed(5)).join(',')).sort().join('|');
      if (!seen.has(key)) { seen.add(key); result.push([a, b]); }
    }
    geometry.dispose();
  });
  return result;
}

// Outline of every mesh cut by the plane x = at: the intersection of the plane with each triangle.
function cutLines(group: THREE.Object3D, at: number, keep: (mesh: THREE.Mesh) => boolean): Segment[] {
  group.updateMatrixWorld(true);
  const result: Segment[] = [], v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !keep(object)) return;
    const positions = object.geometry.getAttribute('position'), index = object.geometry.getIndex(), count = index ? index.count : positions.count;
    for (let i = 0; i + 2 < count; i += 3) {
      for (let j = 0; j < 3; j++) v[j].fromBufferAttribute(positions, index ? index.getX(i + j) : i + j).applyMatrix4(object.matrixWorld);
      const cut: Point[] = [];
      for (let j = 0; j < 3; j++) {
        const a = v[j], b = v[(j + 1) % 3], da = a.x - at, db = b.x - at;
        if ((da < 0) !== (db < 0)) { const t = da / (da - db); cut.push([at, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t]); }
      }
      if (cut.length === 2) result.push([cut[0], cut[1]]);
    }
  });
  return result;
}

export function planSheetGeometry(input: ProjectInput, settings: FramingSettings = defaultFraming) {
  if (validateProject(input).length) throw Error('Correct project inputs before drawing the plan sheet.');
  const f = framingSchema.parse(settings), s = input.section;
  const length = input.spans.reduce((a, b) => a + b, 0) / 1000;
  const d = s.d / 1000, bf = s.bf / 1000, tf = s.tf / 1000, tw = s.tw / 1000;
  const supports = [-length / 2];
  for (const span of input.spans) supports.push(supports.at(-1)! + span / 1000);
  const column = referenceColumns.find(c => c.name === f.column)!, crosshead = referenceCrossheads.find(c => c.name === f.crosshead)!;
  const material = new THREE.MeshBasicMaterial(), edge = new THREE.LineBasicMaterial();
  const materials = { column: material, beam: material, plate: material, foundation: material, brace: material, crane: material, edge };
  const railBase = d / 2 + (s.kind === 'cap' ? s.capTw / 1000 : 0), railH = Math.max(.025, input.railHeight / 1000);
  // Runway centres follow the project rail gauge when detailed inputs exist; otherwise the reference building width.
  // The rail is set on the girder web C/L; the rail eccentricity is a design allowance for setting and
  // wear, not a setting offset, so girders are at the crane span.
  const railZ = 0, width = input.details ? input.details.criteria.railGauge / 1000 : f.width / 1000;
  const newColumn = newColumnFraming(input);
  const reference = buildReferenceFraming({newColumn,columnFace:input.details?.bracket?.enabled?undefined:tieFaceMeters(input), bracket:input.details?.bracket,continuousBearing:input.system==='continuous'&&input.details?.bracket?.enabled?{width:input.details.bearing.width/1000,length:input.details.bearing.length/1000,thickness:input.details.bearing.thickness/1000}:undefined,independentBearing:independentBearingSettings(input), supports, girderDepth: d, girderWidth: bf, girderFlangeT: tf, columnHeight: f.height / 1000,
    roofBottom: railBase + railH + .0125 + f.roofClearance / 1000, column, crosshead, materials, frameStyle: f.frameStyle });
  const frame = buildReferenceStructure({ supports, bayWidth: width, columnBottom: reference.columnBottom, floor: reference.floor,
    railTop: railBase + railH + .0125, roofClearance: f.roofClearance / 1000, columnOffset: reference.columnOffset, column,
    materials, cranes: [], wheelRadius: .1, railZ, frameStyle: f.frameStyle, roofSlope: f.roofSlope, bracketTop: reference.beamTop });
  const building = new THREE.Group();
  // New freestanding runway columns stand clear of the building frames, which are not drawn with them.
  building.add(reference.group, cloneOppositeRunway(reference.group, width, supports, railZ), ...(newColumn?[]:[frame.group]));
  const runway = new THREE.Group();
  const box = (name: string, l: number, h: number, w: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(l, h, w), material); mesh.name = name; mesh.position.set(x, y, z); runway.add(mesh);
  };
  const members=girderSegments(input);
  for (const [side, z] of [0, -width].entries()) {
    for (const [i, member] of members.entries()) {
      const span=(member.end-member.start)/1000,x=(member.start+member.end)/2000-length/2, id = `runway-${side}-${i}`;
      box(`${id}-upper-flange`, span, tf, bf, x, (d - tf) / 2, z);
      box(`${id}-web`, span, d - 2 * tf, tw, x, 0, z);
      box(`${id}-lower-flange`, span, tf, bf, x, -(d - tf) / 2, z);
      if (s.kind === 'cap') {
        box(`${id}-cap`, span, s.capTw / 1000, s.capWidth / 1000, x, d / 2 + s.capTw / 2000, z);
        for (const sign of [-1, 1]) box(`${id}-cap-leg`, span, (s.capDepth - s.capTw) / 1000, s.capTf / 1000, x,
          d / 2 - (s.capDepth - s.capTw) / 2000, z + sign * (s.capWidth - s.capTf) / 2000);
      }

    }
    const r = input.details?.rail, rz = z + (side === 0 ? railZ : -railZ);
    const depth = r ? (input.aist?.railDepth ?? input.railHeight) / 1000 : railH + .0125;
    const baseT = r ? r.baseThickness / 1000 : .012, headT = r ? r.headThickness / 1000 : .025;
    box(`rail-${side}-base`, length, baseT, r ? r.baseWidth / 1000 : .09, 0, railBase + baseT / 2, rz);
    box(`rail-${side}-web`, length, Math.max(.001, depth - baseT - headT), r ? r.webThickness / 1000 : .025, 0, railBase + (depth + baseT - headT) / 2, rz);
    box(`rail-${side}-head`, length, headT, r ? r.headWidth / 1000 : .065, 0, railBase + depth - headT / 2, rz);
  }
  if(input.system==='simple'){const supportsGroup=buildIndependentSupports(input,reference.columnFace,material,edge,undefined,false);runway.add(supportsGroup,cloneOppositeRunway(supportsGroup,width,supports,railZ));}
  const designed:THREE.Object3D[]=[];building.traverse(o=>{if(o.userData.designedBracket)designed.push(o);});
  building.updateMatrixWorld(true);
  for(const o of designed)runway.attach(o);
  const referenceLines = edges(building), runwayLines = edges(runway);
  // Typical transverse section: cut at mid-bay looking back (toward -x) at the frame on the grid, so
  // only that frame and what is attached to it is seen beyond the cut girders and rails.
  const sectionBay = supports.length > 2 ? 1 : 0, sectionGrid = supports[sectionBay], sectionAt = (supports[sectionBay] + supports[sectionBay + 1]) / 2 + 1e-4;
  const atGrid = (segment: Segment) => segment.every(([x]) => Math.abs(x - sectionGrid) <= .9);
  const isRail = (mesh: THREE.Mesh) => mesh.name.startsWith('rail-');
  const section = { grid: sectionGrid, at: sectionAt,
    cut: { building: cutLines(building, sectionAt, () => true), runway: cutLines(runway, sectionAt, mesh => !isRail(mesh)), rail: cutLines(runway, sectionAt, isRail) },
    beyond: { building: referenceLines.filter(atGrid), runway: runwayLines.filter(atGrid) } };
  const geometries = new Set<THREE.BufferGeometry>();
  for (const group of [building, runway]) group.traverse(o => { const geometry = (o as THREE.Mesh).geometry; if (geometry) geometries.add(geometry); });
  geometries.forEach(g => g.dispose()); material.dispose(); edge.dispose();
  return { referenceLines, runwayLines, length, supports, width, d, bf, tf, railZ, railBase, columnOffset: reference.columnOffset,
    column: input.details?.bracket?.enabled?{d:input.details.bracket.receiver.depth/1000,bf:input.details.bracket.receiver.width/1000,tf:input.details.bracket.receiver.flangeThickness/1000,tw:input.details.bracket.receiver.webThickness/1000}:shapeMeters(column), columnDepthAt: (y:number) => reference.columnOuter(y)-reference.columnFace, bracketDepth: input.details?.bracket?.enabled?bracketModelDepth(input.details.bracket)/1000:shapeMeters(crosshead).d, floor: reference.floor, membersPerRunway: members.length, members, section };
}

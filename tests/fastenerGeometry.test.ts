import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildFastenerPieces, helicalThreadGeometry } from '../src/components/fastenerGeometry';

describe('Visible fastener components', () => {
 it('models a continuous rising V-profile thread with consistent pitch', () => {
  const diameter=.02,pitch=.0025,geometry=helicalThreadGeometry(diameter,0,pitch*8.84,pitch),positions=geometry.getAttribute('position');
  // Eight revolutions at 24 samples each: corresponding crests rise one pitch.
  expect(geometry.userData.turns).toBeCloseTo(8);
  expect(positions.getY(24*4+1)-positions.getY(1)).toBeCloseTo(pitch);
  expect(positions.getX(24*4+1)).toBeCloseTo(positions.getX(1));
  expect(positions.getZ(24*4+1)).toBeCloseTo(positions.getZ(1));
  for(let i=4;i<positions.count;i+=4)expect(positions.getY(i)).toBeGreaterThan(positions.getY(i-4));
  expect(positions.getX(0)).toBeCloseTo(diameter*.45);
  expect(positions.getX(1)).toBeCloseTo(diameter*.51);
  expect(geometry.getAttribute('normal').array.every(Number.isFinite)).toBe(true);
  geometry.dispose();
 });
 it('keeps hollow washers and nut distinct from the solid head and threaded shank', () => {
  const pieces=buildFastenerPieces(.01905,.04),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  expect(new Set(pieces.map(p=>p.kind))).toEqual(new Set(['shaft','thread','head','head-washer','nut-washer','nut']));
  for(const kind of ['head','head-washer','nut-washer','nut']){
   const geometry=pieces.find(p=>p.kind===kind)!.geometry,mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld(true);
   const center=new THREE.Raycaster(new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0)).intersectObject(mesh);
   expect(center.length>0).toBe(kind==='head');
   // Material remains on the flats/ring around each real center hole.
   expect(new THREE.Raycaster(new THREE.Vector3(.013,1,0),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length).toBeGreaterThan(0);
  }
  const colors=new Set(pieces.map(p=>Array.from(p.geometry.getAttribute('color').array.slice(0,3)).join(',')));
  expect(colors.size).toBe(5);
  for(const {geometry} of pieces){expect(Object.keys(geometry.attributes).sort()).toEqual(['color','normal','position','uv']);geometry.dispose();}
  material.dispose();
 });
 it('uses a top nut and washer on an anchor rod, without inventing an exposed bolt head', () => {
  const pieces=buildFastenerPieces(.0254,.0254,true);
  expect(new Set(pieces.map(p=>p.kind))).toEqual(new Set(['shaft','thread','head-washer','nut']));
  const nut=pieces.find(p=>p.kind==='nut')!.geometry;nut.computeBoundingBox();expect(nut.boundingBox!.min.y).toBeGreaterThan(.0254);
  const thread=pieces.find(p=>p.kind==='thread')!.geometry;thread.computeBoundingBox();expect(thread.boundingBox!.max.y).toBeGreaterThan(nut.boundingBox!.max.y);
  pieces.forEach(p=>p.geometry.dispose());
 });
});

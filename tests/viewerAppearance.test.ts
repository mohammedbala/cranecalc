import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {frameModelCamera} from '../src/components/viewerAppearance';

describe('CAD model camera framing',()=>{
 it('keeps whole-building and bolt-detail bounds visible in both projections and narrow panes',()=>{
  for(const orthographic of [true,false])for(const aspect of [.6,1.7,3])for(const size of [.04,30])for(const direction of [new THREE.Vector3(1,.65,1),new THREE.Vector3(0,1,.0001),new THREE.Vector3(-1,0,0)]){
   const center=new THREE.Vector3(5,-3,4),bounds=new THREE.Box3().setFromCenterAndSize(center,new THREE.Vector3(size,size*.6,size*.4));
   const camera=orthographic?new THREE.OrthographicCamera(-1,1,1,-1,.001,1000):new THREE.PerspectiveCamera(35,1,.001,1000);
   frameModelCamera(camera,bounds,direction,aspect);
   for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const projected=new THREE.Vector3(x,y,z).project(camera);
    expect(Math.abs(projected.x)).toBeLessThan(1);expect(Math.abs(projected.y)).toBeLessThan(1);
    expect(projected.z).toBeGreaterThan(-1);expect(projected.z).toBeLessThan(1);
   }
  }
 });
 it('resets orthographic zoom when fitting a new inspection target',()=>{
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.001,1000);camera.zoom=12;
  const bounds=new THREE.Box3(new THREE.Vector3(0,0,0),new THREE.Vector3(1,2,3));
  frameModelCamera(camera,bounds,new THREE.Vector3(1,1,1),1.5);
  expect(camera.zoom).toBe(1);expect((camera.right-camera.left)/(camera.top-camera.bottom)).toBeCloseTo(1.5);
 });
});

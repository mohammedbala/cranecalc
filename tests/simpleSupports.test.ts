import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {girderSegments,independentBearings,railKeeperStations,simpleSupportChecks} from '../src/engine/simpleSupports';
import {validateProject,fingerprint} from '../src/engine/calculate';
import {createDetailCollector} from '../src/engine/detailAnalysis';
import {sectionProperties} from '../src/engine/section';
import {buildIndependentSupports} from '../src/components/independentSupportGeometry';
import {createHardwareBuilder} from '../src/components/connectionDetails';
import {simpleSupportSheetSvg} from '../src/components/simpleSupportSheet';
import type {CalculationSnapshot} from '../src/engine/types';

describe('independent girder ends',()=>{
 it('keeps two bearings on their own members and terminates keepers before every gap',()=>{
  const p=cappedDemonstrationProject();p.spans=[6000,7620,9000];
  const segments=girderSegments(p),bearings=independentBearings(p),gap=p.details!.simpleSupport!.endGap;
  expect(segments[1].start-segments[0].end).toBeCloseTo(gap,8);
  expect(segments[2].start-segments[1].end).toBeCloseTo(gap,8);
  expect(bearings).toHaveLength(6);
  for(const b of bearings){const member=segments[b.bay-1];expect(b.start).toBeGreaterThanOrEqual(member.start);expect(b.finish).toBeLessThanOrEqual(member.end);}
  const stations=railKeeperStations(p),half=p.details!.rail.clipWidth/2;
  expect(stations.every(x=>segments.some(m=>x-half>=m.start-1e-6&&x+half<=m.end+1e-6))).toBe(true);
  expect(Math.max(...stations.slice(1).map((x,i)=>x-stations[i]))).toBeLessThanOrEqual(p.aist!.clipSpacing+1e-6);
  p.system='continuous';expect(girderSegments(p)).toHaveLength(1);expect(independentBearings(p)).toEqual([]);expect(simpleSupportChecks(p,.01)).toEqual([]);
 });
 it('checks both adjoining rotations, erection tolerance and hot/cold travel without treating a pass as connection verification',()=>{
  const p=cappedDemonstrationProject(),c=p.details!.simpleSupport!,rotation=.002;
  const checks=simpleSupportChecks(p,rotation);
  expect(checks.find(v=>v.id==='simple-joint-gap')!.demand).toBeCloseTo(12e-6*7620*30+2*p.section.d*rotation+2*c.settingTolerance,10);
  expect(checks.every(v=>v.status==='pass')).toBe(true);
  const revision=fingerprint(p);c.endGap=1;c.guideTravel=1;
  expect(simpleSupportChecks(p,rotation).every(v=>v.status==='fail')).toBe(true);expect(fingerprint(p)).not.toBe(revision);
  c.endGap=8000;expect(validateProject(p).join()).toContain('independent bearing plates');
  delete p.details!.simpleSupport;expect(simpleSupportChecks(p,rotation).every(v=>v.status==='pass')).toBe(true);
 });
 it('retains simultaneous end reactions and bounds traction at each occupied bay without double counting',()=>{
  const p=cappedDemonstrationProject();p.spans=[4000,6000];p.cranes[0].wheels[1].offset=4000;
  const collector=createDetailCollector(p,sectionProperties(p.section),20);
  collector.observe({kind:'strength',id:'statics',combination:'independent statics',cranes:[{index:0,origin:2000,loaded:true}],horizontalCrane:0,lateralSign:1,wheels:[{x:2000,p:10000,h:100},{x:6000,p:20000,h:200}],q:2,railTorquePerLength:0,axial:1000,verticalReactions:[{x:0,r:9000},{x:4000,r:9000+6000+20000*2/3},{x:10000,r:6000+20000/3}]});
  const r=collector.finish(),shared=r.interfaces.filter(v=>v.x===4000);
  expect(shared.length).toBeGreaterThan(0);
  for(const row of shared){expect(row.ends).toHaveLength(2);expect(row.ends![0].vertical).toBeCloseTo(9000,7);expect(row.ends![1].vertical).toBeCloseTo(6000+20000*2/3,7);expect(row.ends!.reduce((s,v)=>s+v.vertical,0)).toBeCloseTo(row.vertical,7);expect(row.seatMoment).toBeCloseTo((6000+20000*2/3-9000)*(304.8+25.4)/2,5);}
  expect(shared.some(v=>v.id==='statics-T2'&&v.longitudinal===1000)).toBe(true);
  expect(shared.some(v=>v.id==='statics-T2'&&v.longitudinal===-1000)).toBe(true);
  expect(r.interfaces.filter(v=>v.x===10000).every(v=>v.longitudinal===0)).toBe(true);
  expect(r.interfaces.filter(v=>v.x===0).some(v=>v.id==='statics-T1'&&v.longitudinal===1000)).toBe(true);
  for(const row of r.interfaces)expect(Math.abs(row.longitudinal)).toBeLessThanOrEqual(1000);
 });
 it('models separate bearings, paired ties and inspectable threaded fasteners at every girder end',()=>{
  const p=cappedDemonstrationProject(),mat=new THREE.MeshBasicMaterial(),edge=new THREE.LineBasicMaterial(),hardware=createHardwareBuilder(mat);
  const group=buildIndependentSupports(p,.65,mat,edge,hardware);
  expect(group.children.filter(o=>o.name.endsWith('-bearing'))).toHaveLength(6);
  // Top-flange ties only: the bolted end bearings restrain the bottom flange.
  expect(group.children.filter(o=>o.userData.part?.family==='Independent flange tie')).toHaveLength(12);
  expect(hardware.count).toBe(48);
  expect(group.children.filter(o=>o.userData.part?.diameter).every(o=>o.userData.part.components.includes('helical threads'))).toBe(true);
  group.updateMatrixWorld(true);
  const bolt=group.children.find(o=>o.userData.part?.family==='Independent tie bolt')!;
  const ray=new THREE.Raycaster(new THREE.Vector3(bolt.position.x-1,bolt.position.y,bolt.position.z),new THREE.Vector3(1,0,0));
  const plies=group.children.filter(o=>['Independent flange tie','Tie receiving gusset (interface)'].includes(o.userData.part?.family));
  expect(ray.intersectObjects(plies,false)).toHaveLength(0);
  const bearing=group.getObjectByName('bay-1-right-bearing')!,next=group.getObjectByName('bay-2-left-bearing')!;
  expect(new THREE.Box3().setFromObject(next).min.x-new THREE.Box3().setFromObject(bearing).max.x).toBeCloseTo(p.details!.simpleSupport!.endGap/1000,6);
  const h=(p.section.d-2*p.section.tf)/1000,bs=p.details!.bearing,cope=bs.cope/1000;
  for(const side of [-1,1]){
   const plate=group.getObjectByName(`bay-1-right-stiffener-${side}`)!;
   const bounds=new THREE.Box3().setFromObject(plate);
   expect(bounds.min.y).toBeCloseTo(-h/2,7);expect(bounds.max.y).toBeCloseTo(h/2,7);
   // Bearing contact remains at the outer portion of BOTH flange faces.
   // Only the inner corners at the rolled fillets are removed.
   for(const sign of [-1,1]){
    const y=sign*(h/2-cope/2),cast=(z:number)=>new THREE.Raycaster(new THREE.Vector3(plate.position.x-.1,y,z),new THREE.Vector3(1,0,0)).intersectObject(plate,false);
    expect(cast(side*(p.section.tw/2000+bs.stiffenerWidth/1000-.001)).length).toBeGreaterThan(0);
    expect(cast(side*(p.section.tw/2000+cope/4))).toHaveLength(0);
   }
  }
  group.traverse(o=>{(o as THREE.Mesh).geometry?.dispose();});mat.dispose();edge.dispose();
 });
 it('keeps the scaled sheet readable for six unequal bays and escapes project text',()=>{
  const input=cappedDemonstrationProject();input.spans=[7620,8000,8500,9000,9500,10000];input.aist!.axialLength=10000;input.title='<script>bad</script>';
  const s:CalculationSnapshot={input,revision:'review',createdAt:'',checks:[],errors:[],warnings:[],properties:null,analysis:null,eligible:false,referenceVersion:''};
  for(const units of ['US','SI'] as const){input.units=units;const svg=simpleSupportSheetSvg(s);expect(svg).not.toMatch(/NaN|Infinity|<script>/);expect(svg).toContain('SHEET S-04');expect(svg.match(/data-view-title="below"/g)).toHaveLength(3);expect(svg).toContain('PENDING');}
 });
});

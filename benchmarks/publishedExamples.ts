/** Additional published input sets; none repeats the permit or DG7 cases.
 * Expected results are transcribed from AISC v15.1, not computed by the app.
 * A/B solutions of the same input set are one case, and LRFD/ASD are rows.
 */
import {exampleProject} from '../src/engine/defaults';
import {loadAiscSection} from '../src/data/aiscSections';
import {sectionProperties} from '../src/engine/section';
import {girderStrength} from '../src/engine/aiscStrength';
import {compressionResistance,boltCapacity,parallelWeldGroup} from '../src/engine/connectionStrength';
import {beamSystem} from '../src/engine/beam';
import type {ProjectInput} from '../src/engine/types';

const inch=25.4,ft=304.8,kip=4448.2216152605,ksi=6.894757293168;
const methods=['LRFD','ASD'] as const;
export const publishedSource={title:'AISC v15.1 Companion, Volume 1: Design Examples',
 url:'https://www.aisc.org/media/q5fcgxxu/v151_vol-1_design-examples.pdf',
 landing:'https://www.aisc.org/aisc/publications/steel-construction-manual/15th-ed-steel-construction-manual/',
 sha256:'2f50ed10e0c74adbc0ee77f79aa97785652f11cfb664a94c44580c339dd3ef65',retrieved:'2026-10-07',basis:'AISC 360-16'};
export interface PublishedRow {label:string;unit:string;reference:number;app:number;percentDifference:number;tolerance:number;status:'MATCH'|'DIFFERENCE';basis:string;}
export interface PublishedCase {id:string;example:string;title:string;pages:string;pdfPages:string;inputs:string[];coverage:string;notes:string[];rows:PublishedRow[];}
function row(label:string,unit:string,reference:number,app:number,precision:number,basis:string):PublishedRow{
 if(!Number.isFinite(app)||!Number.isFinite(reference))throw Error(`Nonfinite benchmark ${label}`);
 // Set before running: 0.1% relative or half the last printed increment.
 // Exact count results use zero tolerance. Differences are never suppressed.
 const tolerance=unit==='bolts'?0:Math.max(Math.abs(reference)*.001,precision/2);
 return {label,unit,reference,app,percentDifference:100*(app-reference)/reference,tolerance,status:Math.abs(app-reference)<=tolerance?'MATCH':'DIFFERENCE',basis};
}
function project(shape:string,method:ProjectInput['method'],Lb:number):ProjectInput{
 const p=structuredClone(exampleProject);p.method=method;p.scope='analysis';
 p.section=loadAiscSection(p.section,shape);p.section.E=29000*ksi;p.section.Fy=50*ksi;p.section.Fu=65*ksi;
 p.unbracedLength=Lb*ft;p.aist=undefined;
 return p;
}
function strength(shape:string,method:ProjectInput['method'],Lb:number){const p=project(shape,method,Lb);return girderStrength(p,sectionProperties(p.section));}
const moment=(v:number)=>v/(kip*ft),force=(v:number)=>v/kip;
function beam(p:ProjectInput,L:number,q:number,minor=false){const s=sectionProperties(p.section);return beamSystem([L*ft],p.section.E*(minor?s.Iy:s.Ix),'simple',undefined,40).evaluate([],q*kip/ft);}
export function runPublishedExamples():PublishedCase[]{
 const cases:PublishedCase[]=[];
 const add=(example:string,title:string,pages:string,pdfPages:string,inputs:string[],coverage:string,notes:string[]=[])=>{
  const c:PublishedCase={id:`AISC-${String(cases.length+1).padStart(2,'0')}`,example,title,pages,pdfPages,inputs,coverage,notes,rows:[]};cases.push(c);return c;
 };
 {
  const c=add('E.1A','Pinned W14 column','E-4 to E-5','63-64',['W14X132; ASTM A992; Fy = 50 ksi; E = 29,000 ksi','Lx = Ly = Lz = 30 ft; K = 1; PD = 140 kip; PL = 420 kip'],
   'Shared girder E3/E4 compression resistance; does not validate the reference building frame.',
   ['Only the A992 selection is counted. E.1C is the same geometry and is not another case. Catalogue properties are loaded through the normal AISC section selector.']);
  for(const [i,m] of methods.entries()){
   const p=project('W14X132',m,30);p.spans=[30*ft];
   c.rows.push(row(`${m} compression resistance`,'kip',[893,594][i],force(girderStrength(p,sectionProperties(p.section)).compression),1,'AISC table result, E-5'));
  }
 }
 {
  const c=add('E.1D','W14 column with intermediate bracing','E-10 to E-12','69-71',['W14X90; A = 26.5 in2; rx = 6.14 in; ry = 3.70 in','Lx = 30 ft; Ly = 15 ft; K = 1; Fy = 50 ksi; E = 29,000 ksi'],
   'Connection compression primitive, evaluated about both axes; no frame stability analysis.',
   ['The source direct-equation solution is used. E.1B is the same input set and is not counted again. Torsional/local buckling applicability is established in the source for this stocky rolled section.']);
  for(const [i,m] of methods.entries()){
   const x=compressionResistance(26.5*inch**2,6.14*inch,30*ft,29000*ksi,50*ksi,m),y=compressionResistance(26.5*inch**2,3.70*inch,15*ft,29000*ksi,50*ksi,m);
   c.rows.push(row(`${m} compression resistance`,'kip',[927,617][i],force(Math.min(x.capacity,y.capacity)),1,'E3-1 / E3-2, E-12'));
  }
 }
 {
  const c=add('F.1-1A/B','Continuously braced W18 beam','F-6 to F-8','153-155',['W18X50; Fy = 50 ksi; E = 29,000 ksi; span = 35 ft','Uniform D = 0.45 kip/ft; L = 0.75 kip/ft; live deflection limit L/360','Lb = 1 ft in replay, inside the fully braced F2-1 branch'],
   'Major flexure and shared beam solver for uniform loading.',
   ['Given dead load is the total applied UDL; no extra self weight is added. A/B are counted together.']);
  for(const [i,m] of methods.entries()){
   const p=project('W18X50',m,1),v=strength('W18X50',m,1),q=i?1.2:1.74;
   c.rows.push(row(`${m} major resistance`,'kip-ft',[379,252][i],moment(v.major),1,'F2-1, F-8'),row(`${m} peak moment`,'kip-ft',[266,184][i],moment(Math.max(...beam(p,35,q).moment)),1,'Uniform-load result, F-6'));
  }
  const p=project('W18X50','LRFD',1),r=beam(p,35,.75),I=sectionProperties(p.section).Ix/inch**4;
  c.rows.push(row('Required Ix for L/360','in4',746,I*(Math.max(...r.displacement)/inch)/(35*12/360),1,'Deflection sizing, F-7'));
 }
 for(const [example,title,Lb,reference,pages,pdfPages,cb] of [
  ['F.1-2A/B','W18 beam braced at third points',11.7,[305,203],'F-9 to F-11','156-158',1.01],
  ['F.1-3A/B','W18 beam braced at midspan',17.5,[288,192],'F-12 to F-15','159-162',1.30],
 ] as const){
  const c=add(example,title,pages,pdfPages,[`W18X50; Fy = 50 ksi; E = 29,000 ksi; span = 35 ft; Lb = ${Lb} ft`,`Published Cb = ${cb}; app Cb = 1.0; D = 0.45 and L = 0.75 kip/ft`],
   'F2 inelastic or elastic lateral-torsional buckling branch.',
   [`The published direct-equation resistance includes Cb = ${cb}. The app intentionally retains Cb = 1.0. This is a basis difference, not numerical equivalence. A/B count as one case.`,...(cb>1.1?['The source member passes bending, but the app Cb=1 resistance is below the published demands (266 LRFD / 184 ASD kip-ft).']:[])]);
  for(const [i,m] of methods.entries())c.rows.push(row(`${m} major resistance`,'kip-ft',reference[i],moment(strength('W18X50',m,Lb).major),1,'Published direct-equation result, part B'));
 }
 {
  const c=add('F.5','W12 beam in minor-axis bending','F-28 to F-29','175-176',['W12X58; Fy = 50 ksi; E = 29,000 ksi; span = 15 ft','Uniform D = 0.667 kip/ft; L = 2.0 kip/ft; live deflection limit L/240'],
   'Whole-section F6 primitive and weak-axis beam stiffness.',
   ['Runway lateral bending checks use the individual flange; this whole-section example does not validate that load path. Source intermediate rounding of plastic modulus/moment is retained.']);
  for(const [i,m] of methods.entries()){
   const p=project('W12X58',m,15),q=i?2.667:1.2*.667+1.6*2;
   c.rows.push(row(`${m} minor resistance`,'kip-ft',[122,81.4][i],moment(strength('W12X58',m,15).minor),i?.1:1,'F6-1, F-29'),row(`${m} peak minor moment`,'kip-ft',[113,75.1][i],moment(Math.max(...beam(p,15,q,true).moment)),i?.1:1,'Uniform-load result, F-28'));
  }
  const p=project('W12X58','LRFD',15),r=beam(p,15,2,true),I=sectionProperties(p.section).Iy/inch**4;
  c.rows.push(row('Required Iy for L/240','in4',105,I*(Math.max(...r.displacement)/inch)/.75,1,'Deflection sizing, F-29'));
 }
 {
  const c=add('G.1A/B','W24 beam in strong-axis shear','G-3 to G-4','233-234',['W24X62; d = 23.7 in; tw = 0.430 in; Fy = 50 ksi','End shears: D = 48 kip; L = 145 kip'],
   'G2 rolled-stocky web branch, with phi = 1 and Omega = 1.5.');
  for(const [i,m] of methods.entries())c.rows.push(row(`${m} shear resistance`,'kip',[306,204][i],force(strength('W24X62',m,1).shear),1,'G2-1 / G2-2, G-4'));
 }
 {
  const c=add('J.1','Longitudinal fillet-weld pair','J-2 to J-3','427-428',['Two parallel 3/16-in fillets, each 27 in long, 18 in apart','E70XX; concentric longitudinal D = 33 kip; L = 100 kip'],
   'Elastic parallel-weld primitive and J2.2 end-loaded length reduction.',
   ['Plates and base-metal limit states are not validated by this weld-only comparison.']);
  for(const [i,m] of methods.entries()){
   const r=parallelWeldGroup({length:27*inch,gauge:18*inch,size:3/16*inch,Fexx:70*ksi,method:m,vx:0,vy:(i?133:199.6)*kip,normal:0,mx:0,my:0,mz:0});
   c.rows.push(row(`${m} weld resistance`,'kip',[206,137][i],force(r.A*r.capacity),1,'J2-4, J-3'));
   if(!i)c.rows.push(row('Long-weld reduction beta','ratio',.912,r.beta,.001,'J2-1, J-3'));
  }
 }
 {
  const c=add('J.2','Fillet-weld pair loaded at 60 degrees','J-4 to J-5','429-430',['Two 5/16-in fillets, each 16 in long, at a 3/4-in gusset','E70XX; concentric load at 60 degrees to weld; D = 50 kip; L = 150 kip'],
   'Parallel-weld resistance without directional enhancement.',
   ['The source uses 1 + 0.5 sin(theta)^1.5. The app intentionally omits this increase; lower capacity is expected.',
    'At the source selected 16-in length, app weld utilization exceeds 1.0 under both methods. Numerical comparison is not a passing design.']);
  for(const [i,m] of methods.entries()){
   const P=(i?200:300)*kip,r=parallelWeldGroup({length:16*inch,gauge:.75*inch,size:5/16*inch,Fexx:70*ksi,method:m,vx:P*Math.sin(Math.PI/3),vy:P*Math.cos(Math.PI/3),normal:0,mx:0,my:0,mz:0});
   c.rows.push(row(`${m} resistance per pair length`,'kip/in',[19.5,13][i],force(r.A*r.capacity)/16,.1,'J2-4 with directional factor, J-5'));
  }
 }
 {
  const c=add('J.3','Bolt under combined tension and shear','J-6 to J-7','431-432',['One 3/4-in A325 (Group A) bolt; threads in one shear plane','D/L tension = 3.5/12 kip; D/L shear = 1.33/4 kip'],
   'J3.7 shear-dependent tensile resistance of a bearing-type bolt.');
  for(const [i,m] of methods.entries()){
   const r=boltCapacity({grade:'A325',diameter:.75*inch,planes:1,surface:'A',method:m,shear:(i?5.33:7.996)*kip,tension:(i?15.5:23.4)*kip});
   c.rows.push(row(`${m} tensile resistance`,'kip',[25.5,17][i],force(r.tension),.1,'J3-2 / J3-3, J-7'),row(`${m} reduced Fnt`,'ksi',[76.8,76.7][i],r.FntPrime/ksi,.1,'J3-3, J-7'));
  }
 }
 {
  const c=add('J.4A','Slip resistance with two slip planes','J-8 to J-9','433-434',['3/4-in A325 bolts; Class A; two slip planes; no fillers','Short slots transverse to load; D = 17 kip; L = 51 kip'],
   'J3.8 slip primitive and resulting required bolt count.',
   ['Standard holes and transverse short slots share the factors used here. This checks the resistance formula only; the app connection template does not reproduce the source slotted-hole geometry.']);
  for(const [i,m] of methods.entries()){
   const r=boltCapacity({grade:'A325',diameter:.75*inch,planes:2,surface:'A',method:m,shear:0,tension:0});
   c.rows.push(row(`${m} slip resistance per bolt`,'kip',[19,12.7][i],force(r.slip),.1,'J3-4, J-8/J-9'),row(`${m} required bolts`,'bolts',6,Math.ceil((i?68:102)/force(r.slip)),0,'J-9 selection'));
  }
 }
 {
  const c=add('J.5','Slip-critical group with applied tension','J-12 to J-14','437-439',['Eight 3/4-in A325 bolts; Class A; one slip plane; standard holes','LRFD group T/V = 72/54 kip; ASD T/V = 48/36 kip','Tb = 28 kip/bolt; Du = 1.13; no filler reduction'],
   'J3.9 reduction of slip resistance under bolt tension.',
   ['This is a slip check only. Prying, plate bending and the remaining bearing-type limit states require separate checks.']);
  for(const [i,m] of methods.entries()){
   const r=boltCapacity({grade:'A325',diameter:.75*inch,planes:1,surface:'A',method:m,shear:(i?36:54)*kip/8,tension:(i?48:72)*kip/8});
   c.rows.push(row(`${m} slip reduction`,'ratio',.716,r.slipReduction,.001,'J3-5, J-14'),row(`${m} group slip resistance`,'kip',[54.4,36.3][i],force(r.slip)*8,.1,'J3-4 / J3-5, J-14'));
  }
 }
 return cases;
}

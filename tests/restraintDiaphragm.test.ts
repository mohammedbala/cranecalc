import {describe,expect,it} from 'vitest';
import {diaphragmArrangement,diaphragmDemand,diaphragmWeldEquivalent,stiffenerPairSection,stiffenerWeldGroup} from '../src/engine/detailChecks';
import {demonstrationProject,newColumnDemonstrationProject} from '../src/engine/demonstration';
import {defaultColumnCap} from '../src/engine/columnCapInputs';
import {stiffenerTieGeometry} from '../src/engine/tieGeometry';
import {neutralDetails} from '../src/engine/detailTemplate';
import {aiscShapeByName} from '../src/data/aiscSections';
import type {ProjectInput} from '../src/engine/types';

/**
 * The bearing stiffener pair as the restraint diaphragm (stiffener-lateral-flexure and its welds), by the load path each
 * support has, on the section of the pair; the stiffener-to-web welds with the J4.2 base metal.
 */
const inch=25.4,ksi=6.894757293,kip=4448.222;
describe('restraint diaphragm by arrangement',()=>{
 it('both flanges restrained directly: zero St Venant torque gives no demand; one flange restrained reproduces H·h',()=>{
  const both=diaphragmDemand({kind:'both-flanges',yg:0},{H:50*kip,torque:0,couple:0,h:600,h0:650});
  expect(both.M).toBeCloseTo(0,9);expect(both.V).toBeCloseTo(0,9);
  // The St Venant torque crosses the depth as the couple X = T/h_o.
  const T=1e7,x=diaphragmDemand({kind:'both-flanges',yg:0},{H:50*kip,torque:-T,couple:2e6,h:600,h0:650});
  expect(x.M).toBeCloseTo(T+2e6,6);expect(x.V).toBeCloseTo((T+2e6)/650,6);
  const one=diaphragmDemand({kind:'one-flange',yg:0},{H:50*kip,torque:T,couple:2e6,h:600,h0:650});
  expect(one.M).toBeCloseTo(50*kip*600,6);expect(one.V).toBeCloseTo(50*kip,6);
  // A gusset CJP welded to the stiffener: the local transfer H·y_g plus the torque the plate takes across the depth.
  const g=diaphragmDemand({kind:'gusset',yg:80},{H:50*kip,torque:T,couple:2e6,h:600,h0:650});
  expect(g.M).toBeCloseTo(50*kip*80+T+2e6,6);expect(g.V).toBeCloseTo(50*kip,6);
 });
 it('2 PL 5/8 x 6 3/4 welded to both faces of the W30X191 web (template:10) act as one plate: S = 21.0 in³',()=>{
  const tw=aiscShapeByName('W30X191')!.tw*inch,b={stiffenerWidth:6.75*inch,stiffenerThickness:.625*inch,cope:.875*inch};
  const pair=stiffenerPairSection(b,tw);
  expect(Math.abs(pair.S/inch**3/21.0-1)).toBeLessThan(.02);
  // The separate plates of the cantilever model: 9.49 in³.
  expect(stiffenerPairSection(b,tw,false).S/inch**3).toBeCloseTo(9.49,2);
  // Shear flow of the welds: VQ/I with Q of one plate about the web centerline.
  expect(pair.Q).toBeCloseTo(b.stiffenerThickness*b.stiffenerWidth*(tw+b.stiffenerWidth)/2,6);
  const R=100*kip,d={M:1e8,V:20*kip},Lw=600;
  expect(diaphragmWeldEquivalent(R,d,pair,Lw)).toBeCloseTo(R+2*d.V*pair.Q*Lw/pair.I,6);
  expect(diaphragmWeldEquivalent(R,{M:20*kip*Lw,V:20*kip},stiffenerPairSection(b,tw,false),Lw)).toBeCloseTo(R+8*20*kip,6);
 });
 it('detects the arrangement from the restraint geometry',()=>{
  // Direct flange saddle at the top, bolted end bearings at the bottom.
  expect(diaphragmArrangement(demonstrationProject()).kind).toBe('both-flanges');
  // Bars on a gusset welded to the stiffener: y_g from the gusset centroid to the tied flange's inner face.
  const q=demonstrationProject();q.details!.brace.flangeAttachment={...q.details!.brace.flangeAttachment!,enabled:false};
  const a=diaphragmArrangement(q),st=stiffenerTieGeometry(q)!;
  expect(a.kind).toBe('gusset');expect(a.yg).toBeCloseTo(st.clear+st.height/2,6);
  // A column cap fork: the stiffeners carry the top flange force to the bolted bottom flange.
  const c=newColumnDemonstrationProject();c.details!.bracket!.enabled=false;c.details!.brace.flangeAttachment!.enabled=false;c.aist!.supportType='column';c.columnCap={...structuredClone(defaultColumnCap),enabled:true};
  expect(diaphragmArrangement(c).kind).toBe('one-flange');
 });
});

describe('bearing stiffener welds with the base metal (AISC J2.4, J4.2)',()=>{
 it('5/16 in fillets on both faces of a 0.305 in web: the web base metal governs at about 0.64 of the weld metal',()=>{
  const p={method:'LRFD',section:{tw:.305*inch,Fu:65*ksi},details:{material:{Fy:50*ksi,Fu:65*ksi,Fexx:70*ksi},bearing:{weldSize:.3125*inch,stiffenerThickness:.5*inch,cope:inch,stiffenerWidth:4*inch}}} as unknown as ProjectInput;
  const g=stiffenerWeldGroup(p,600);
  expect(g.governs).toBe('web base metal');
  expect(g.web/g.weld).toBeCloseTo(.641,2);
  expect(g.capacity).toBeCloseTo(.75*.6*65*ksi*.305*inch*2*(600-2*inch),6);
  // 6.19D/F_u: the web develops the fillets on both faces up to D = 3.2 sixteenths.
  expect(.305*65/6.19).toBeCloseTo(3.2,1);
 });
 it('the template sizes the bearing stiffener fillets from the web and the stiffener pair as one plate',()=>{
  const p=demonstrationProject();
  // W14X61: the smallest fillet that develops the 0.375 in web with fillets on both faces (t_w = 6.19D/F_u: D = 3.9),
  // 1/4 in; W24X229: 5/16 in at most; W12X26: the edge limit t_w - 1/16 in, 1/8 in.
  for(const [shape,size] of [['W14X61',4],['W24X229',5],['W12X26',2]] as const){
   const w=aiscShapeByName(shape)!,q:ProjectInput={...p,section:{...p.section,catalogueId:shape,d:w.d*inch,bf:w.bf*inch,tf:w.tf*inch,tw:w.tw*inch}};
   const D=neutralDetails(q).bearing.weldSize/inch*16;
   expect(Math.round(D),shape).toBe(size);
  }
 });
});

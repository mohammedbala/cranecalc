import {describe,it,expect} from 'vitest';
import {withImperialUnits,withSiUnits,toDisplay,fromDisplay,format} from '../src/engine/units';
import {cappedDemonstrationProject} from '../src/engine/demonstration';
import {presentCheck} from '../src/engine/checkPresentation';
import {bracketSheetSvg} from '../src/components/bracketSheet';
import {structuralGeneralNotes} from '../src/components/structuralNotes';
import {defaultExistingBracket} from '../src/engine/existingBracketInputs';
import {interfaceCsv} from '../src/engine/detailExports';
import type {CalculationSnapshot,CheckResult} from '../src/engine/types';

describe('imperial presentation',()=>{
 it('converts saved SI project presentation without changing physical inputs',()=>{
  const si=withSiUnits(cappedDemonstrationProject()),before=structuredClone(si),us=withImperialUnits(si);
  expect(us.units).toBe('US');expect({...us,units:'SI'}).toEqual(before);expect(si).toEqual(before);expect(withImperialUnits(us)).toBe(us);
  expect(toDisplay(us.spans[0],'length','US')).toBe(300);
 });
 it('distinguishes absolute Fahrenheit temperatures from temperature changes and converts density',()=>{
  expect(toDisplay(30,'temperatureChange','US')).toBe(54);
  expect(toDisplay(30,'temperature','US')).toBe(86);
  expect(fromDisplay(54,'temperatureChange','US')).toBe(30);
  expect(fromDisplay(86,'temperature','US')).toBe(30);
  expect(format(7850,'density','US')).toBe('490.06 lb/ft³');
  expect(format(4448.221615,'force','US')).toBe('1 kip');
 });
 it('converts equation substitutions and dimensional fatigue constants without changing results',()=>{
  const c:CheckResult={id:'root-fatigue',group:'Fatigue',title:'Root',status:'pass',demand:6.894757293,capacity:13.789514586,utilization:.5,quantity:'stress',substitution:'canonical placeholder',equation:'R_{FIL}=\\min[1,(0.103+1.24w/t_p)/t_p^{0.167}];F=6900R_{FIL}(4.4/n)^{0.333}',note:'',referenceIds:[]};
  const us=presentCheck(c,'US');expect(us.substitution).toBe('\\frac{1.0000\\,\\mathrm{ksi}}{2.0000\\,\\mathrm{ksi}}=0.5000');
  expect(us.equation).not.toContain('6900');expect(us.equation).not.toContain('0.103+1.24');
  const k=25.4**.167,t=1,w=.25;
  expect((.103/k+1.24/k*w/t)/t**.167).toBeCloseTo((.103+1.24*(w*25.4)/(t*25.4))/(t*25.4)**.167,12);
  expect(us.demand).toBe(c.demand);expect(us.capacity).toBe(c.capacity);expect(us.status).toBe(c.status);expect(presentCheck(c,'SI').equation).toBe(c.equation);
 });
 it('uses feet/inches, imperial scale and 36 by 24 ARCH D in existing-support drawings',()=>{
  const input=withImperialUnits(cappedDemonstrationProject()),b=input.details!.bracket!;b.arrangement='existing-corbel';b.existing=structuredClone(defaultExistingBracket);
  const s:CalculationSnapshot={input,checks:[],analysis:null,properties:null,errors:[],warnings:[],eligible:false,revision:'unit-test',createdAt:'2026-10-09',referenceVersion:'test'};
  const svg=bracketSheetSvg(s);expect(svg).toContain('width="36in" height="24in"');expect(svg).toContain('36 X 24 IN');expect(svg).toContain('FEET &amp; INCHES');expect(svg).not.toContain(' MM');expect(svg).not.toContain('SCALE: 1:');
  expect(structuralGeneralNotes(s).join(' ')).toContain('KSI WELD METAL');
 });
 it('exports imperial interface forces and converts nested end actions as well as headers',()=>{
  const input=withImperialUnits(cappedDemonstrationProject());input.cranes[0].design!.bumperForce=4448.221615;
  const s={eligible:true,input,revision:'test',detailResults:{interfaces:[{id:'one',combination:'test',x:25.4,vertical:4448.221615,top:4448.221615,bottom:0,longitudinal:0,torque:1355817.948,lateralSign:1,cranes:[{index:0,origin:25.4,loaded:true}],controls:[],ends:[{bay:1,end:'right',vertical:4448.221615,top:0,bottom:0,longitudinal:0,offset:25.4}],seatMoment:1355817.948}]}} as unknown as CalculationSnapshot;
  const csv=interfaceCsv(s),rows=csv.split('\r\n');expect(rows[0]).toContain('station_in');expect(rows[0]).toContain('vertical_down_kip');expect(rows[0]).toContain('kip_ft');expect(rows[1]).toContain('"1@1:loaded"');expect(rows[1]).toContain('""offset"":1');expect(rows[1]).toContain('""vertical"":1');expect(csv).not.toContain('4448.221615');
 });
});

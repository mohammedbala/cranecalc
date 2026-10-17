import type { ProjectInput } from '../engine/types';

/** Drawing dimensions round to the nearest 1/16 inch, with carry at 12 inches. */
export function feetInches(mm: number): string {
  const ticks = Math.round(Math.abs(mm) / 25.4 * 16), feet = Math.floor(ticks / 192);
  const remainder = ticks % 192, inches = Math.floor(remainder / 16);
  let numerator = remainder % 16, denominator = 16;
  while (numerator && numerator % 2 === 0) { numerator /= 2; denominator /= 2; }
  const fraction = numerator ? ` ${numerator}/${denominator}` : '';
  return `${mm < 0 && ticks ? '-' : ''}${feet}'-${inches}${fraction}"`;
}
/** SI lengths of a meter or more read to the millimeter, shorter ones to 0.1 mm. */
export function drawingLength(mm: number, units: ProjectInput['units']) {
  // Snap floating-point noise first, so equal lengths reached by different sums (a + b vs L - c) print alike.
  mm = Math.round(mm * 1e6) / 1e6;
  return units === 'US' ? feetInches(mm) : `${Number(mm.toFixed(Math.abs(mm) >= 1000 ? 0 : 1)).toLocaleString('en-US')} mm`;
}
export {quarterInch,snapQuarter} from '../engine/quarterInch';
import {snapQuarter} from '../engine/quarterInch';
let dimensionAudit:{mm:number;text:string;site:string}[]|undefined;
/**
 * Run `draw` and return the dimensions it printed whose length was not already on the 1/4 in grid (US), so tests can
 * prove the geometry, not the formatter, puts every dimension on the grid.
 */
export function auditDimensions<T>(draw:()=>T):{result:T;offGrid:{mm:number;text:string;site:string}[]}{
 const was=dimensionAudit,found:{mm:number;text:string;site:string}[]=[];dimensionAudit=found;
 try{return {result:draw(),offGrid:found};}finally{dimensionAudit=was;}
}
/**
 * Dimension strings: US lengths in feet and inches to the nearest 1/4 in (no dimension finer than 1/4 in); SI as
 * drawingLength. Material sizes (plate thickness, weld size, bolt and hole diameters) use plateInches/holeInches.
 * The layout geometry is snapped to the grid where it is derived, so the rounding here is only a safety net.
 */
export function dimensionLength(mm:number,units:ProjectInput['units']){
 if(units!=='US')return drawingLength(mm,units);
 const snapped=snapQuarter(mm),text=feetInches(snapped);
 if(dimensionAudit&&Math.abs(snapped-mm)>25.4/64)dimensionAudit.push({mm,text,site:(new Error().stack??'').split('\n').slice(2,5).map(v=>v.trim()).join(' < ')});
 return text;
}
/**
 * Whether a length prints exactly as a dimension string (US: already on the 1/4 in grid). The half of a dimensioned
 * length (a stiffener at the middle of a plate, the holes of a pattern centered on a grid) need not be: it is then
 * given as centered (EQ), never re-rounded to a value that contradicts the length it halves.
 */
export function onDimensionGrid(mm:number,units:ProjectInput['units']){return units!=='US'||Math.abs(snapQuarter(mm)-mm)<=25.4/64;}
/** A reference size that follows from dimensioned geometry (the depth of a taper at a section cut): US to the nearest 1/4 in. */
export function referenceLength(mm:number,units:ProjectInput['units']){return units==='US'?feetInches(snapQuarter(mm)):drawingLength(mm,units);}
/** Elevations: feet and inches, or meters to three decimals in SI. */
/** ASTM grades read one way on the sheets, as the abbreviation list gives them: "ASTM A572 GR. 50", "ASTM F3125 GR. A325". */
export const specGrade=(v:string)=>v.replace(/\b(ASTM [A-Z]+\d+) GRADE\b/gi,'$1 GR.');
/** An elevation as it prints (US to the 1/16 in, SI to the millimeter), in mm: reference dimensions between elevations use it. */
export function printedElevation(mm: number, units: ProjectInput['units']) {
  return units === 'US' ? Math.round(mm / 25.4 * 16) / 16 * 25.4 : Math.round(mm);
}
export function drawingElevation(mm: number, units: ProjectInput['units']) {
  return units === 'US' ? feetInches(mm) : `${(mm / 1000).toFixed(3)} m`;
}
export function plateInches(mm: number, units: ProjectInput['units']) {
  if (units === 'SI') return drawingLength(mm, units);
  const value = feetInches(mm);
  return value.startsWith('0\'-') ? value.slice(3).replace(/^0 (?=\d+\/)/, '') : value;
}

// Standard printed scales, largest first: inches to the foot (US) and ratio denominators (SI).
const usScales:[number,string][]=[[12,'12'],[6,'6'],[3,'3'],[1.5,'1 1/2'],[1,'1'],[.75,'3/4'],[.5,'1/2'],[.375,'3/8'],[.25,'1/4'],[.1875,'3/16'],[.125,'1/8'],[.09375,'3/32'],[.0625,'1/16'],[.03125,'1/32'],[.015625,'1/64']];
const siScales=[1,2,5,10,20,25,50,100,200,250,500,1000,2000];
/** Largest conventional printed scale that fits; SVG units are PDF points. */
export function drawingScale(maxPointsPerMm:number,units:ProjectInput['units']){
 if(units==='US'){
  const [inches,label]=usScales.find(([v])=>v*72/304.8<=maxPointsPerMm+1e-10)??usScales.at(-1)!;
  return {pointsPerMm:inches*72/304.8,label:`SCALE: ${label}" = 1'-0"`};
 }
 const denominator=siScales.find(v=>72/(25.4*v)<=maxPointsPerMm+1e-10)??2000;
 return {pointsPerMm:72/(25.4*denominator),label:`SCALE: 1:${denominator}`};
}
/**
 * Ratio of the next larger standard scale to the scale a label of drawingScale names ("SCALE: 1 1/2" = 1'-0"" to 3" is
 * 2), or undefined for the largest scale or a label that names none.
 */
export function nextScaleRatio(label:string){
 const us=/^SCALE: ([\d /]+)" = 1'-0"/.exec(label),si=/^SCALE: 1:(\d+)\b/.exec(label);
 if(us){const i=usScales.findIndex(([,v])=>v===us[1]);return i>0?usScales[i-1][0]/usScales[i][0]:undefined;}
 if(si){const i=siScales.indexOf(Number(si[1]));return i>0?siScales[i]/siScales[i-1]:undefined;}
 return undefined;
}
/**
 * Weld filler by its AWS classification from the entered electrode strength: E70XX in US units, and in SI
 * also the metric classification of the same filler (AWS A5.1M / A5.5M), e.g. E70XX (E49XX).
 */
export function electrodeClass(Fexx:number,units:ProjectInput['units']){
 const ksi=Math.round(Fexx/6.894757293/10)*10,metric:Record<number,string>={60:'E43XX',70:'E49XX',80:'E55XX',90:'E62XX',100:'E69XX',110:'E76XX'};
 return units==='SI'&&metric[ksi]?`E${ksi}XX (${metric[ksi]})`:`E${ksi}XX`;
}
/** Hole diameters to the nearest 1/32 inch (a pin hole is the pin plus 1/32 in, AISC D5.2); SI as other lengths. */
export function holeInches(mm:number,units:ProjectInput['units']){
 if(units==='SI')return drawingLength(mm,units);
 const ticks=Math.round(Math.abs(mm)/25.4*32),inches=Math.floor(ticks/32);
 let numerator=ticks%32,denominator=32;
 while(numerator&&numerator%2===0){numerator/=2;denominator/=2;}
 return `${inches?inches:''}${numerator?`${inches?' ':''}${numerator}/${denominator}`:''}"`;
}
/**
 * A limit or requirement handed to others (a deflection, a drift, a slot travel, a separation): never rounded toward the
 * unsafe side. A maximum floors and a minimum ceils: in US units to 1/64 in, with the decimal inch (floored or ceiled to
 * 0.001 in) where the fraction would misstate it ("0.053 IN (3/64)"); in SI to 0.1 mm. The caller adds MAX. or MIN.
 */
export function limitLength(mm:number,units:ProjectInput['units'],sense:'max'|'min'){
 const round=(v:number)=>sense==='max'?Math.floor(v+1e-9):Math.ceil(v-1e-9);
 if(units!=='US')return `${(round(mm*10)/10).toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1})} mm`;
 const inches=mm/25.4,ticks=round(inches*64),exact=Math.abs(ticks/64-inches)<5e-4,feet=Math.floor(ticks/768),rest=ticks-feet*768;
 let a=rest%64,d=64;while(a&&a%2===0){a/=2;d/=2;}
 const whole=Math.floor(rest/64),inch=`${whole||!a?whole:''}${a?`${whole?' ':''}${a}/${d}`:''}`,fraction=feet?`${feet}'-${inch.replace(/^(?=\d+\/)/,'0 ')}"`:`${inch}"`;
 // Above two feet a 1/64 in step is below any field measurement: the floored or ceiled fraction alone.
 if(exact||inches>=24)return fraction;
 return `${(round(inches*1000)/1000).toFixed(3)} IN (${fraction.replace(/"$/,'')})`;
}
/**
 * A part size (plate, bar, gusset length) as printed, or undefined for a size that cannot exist (≤ 0, not finite): such a
 * part is never printed; its view reads GEOMETRY CONFLICT - NOT DETAILED (geometryConflict in sheetRatios).
 */
export function partSize(mm:number,units:ProjectInput['units']):string|undefined{
 return Number.isFinite(mm)&&mm>0?plateInches(mm,units):undefined;
}

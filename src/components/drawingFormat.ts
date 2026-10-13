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
/** A reference size that follows from dimensioned geometry (the depth of a taper at a section cut): US to the nearest 1/4 in. */
export function referenceLength(mm:number,units:ProjectInput['units']){return units==='US'?feetInches(snapQuarter(mm)):drawingLength(mm,units);}
/** Elevations: feet and inches, or meters to three decimals in SI. */
export function drawingElevation(mm: number, units: ProjectInput['units']) {
  return units === 'US' ? feetInches(mm) : `${(mm / 1000).toFixed(3)} m`;
}
export function plateInches(mm: number, units: ProjectInput['units']) {
  if (units === 'SI') return drawingLength(mm, units);
  const value = feetInches(mm);
  return value.startsWith('0\'-') ? value.slice(3).replace(/^0 (?=\d+\/)/, '') : value;
}

/** Largest conventional printed scale that fits; SVG units are PDF points. */
export function drawingScale(maxPointsPerMm:number,units:ProjectInput['units']){
 const us:[number,string][]=[[12,'12'],[6,'6'],[3,'3'],[1.5,'1 1/2'],[1,'1'],[.75,'3/4'],[.5,'1/2'],[.375,'3/8'],[.25,'1/4'],[.1875,'3/16'],[.125,'1/8'],[.09375,'3/32'],[.0625,'1/16'],[.03125,'1/32'],[.015625,'1/64']];
 if(units==='US'){
  const [inches,label]=us.find(([v])=>v*72/304.8<=maxPointsPerMm+1e-10)??us.at(-1)!;
  return {pointsPerMm:inches*72/304.8,label:`SCALE: ${label}" = 1'-0"`};
 }
 const denominator=[1,2,5,10,20,25,50,100,200,250,500,1000,2000].find(v=>72/(25.4*v)<=maxPointsPerMm+1e-10)??2000;
 return {pointsPerMm:72/(25.4*denominator),label:`SCALE: 1:${denominator}`};
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

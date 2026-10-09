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
export function drawingLength(mm: number, units: ProjectInput['units']) {
  return units === 'US' ? feetInches(mm) : `${Number(mm.toFixed(1)).toLocaleString('en-US')} mm`;
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

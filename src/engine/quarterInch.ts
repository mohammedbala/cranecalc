/**
 * US drawings dimension to whole 1/4 in. Layout lengths the engine derives from other values (bolt line positions,
 * setbacks, edge distances, clear distances, cut lengths) are snapped to this grid in US projects, so the checks and
 * the drawings use the same geometry and every dimension string adds up. The grid does not depend on the display units,
 * so a project lays out the same whether it is shown in US or SI units.
 */
export const quarterInch=25.4/4;
export type SnapMode='nearest'|'up'|'down';
/** Snap a length (mm) to the 1/4 in grid: 'up' for a minimum (edge distance, length, clearance), 'down' for a maximum. */
export function snapQuarter(mm:number,mode:SnapMode='nearest'){
 const q=mm/quarterInch,f=mode==='up'?Math.ceil(q-1e-6):mode==='down'?Math.floor(q+1e-6):Math.round(q);
 return f*quarterInch;
}

/** A sleeve length to fabricate: the least length (ply plus clearance) rounded up to 1/16 in. */
export const sleeveLength=(least:number)=>Math.ceil(least/1.5875-1e-6)*1.5875;

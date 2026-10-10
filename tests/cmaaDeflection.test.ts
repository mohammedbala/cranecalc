import {describe,expect,it} from 'vitest';
import {calculate} from '../src/engine/calculate';
import {demonstrationProject} from '../src/engine/demonstration';

// DG7: L/600 for CMAA A to C, L/800 for D, L/1000 for E and F; the owner and AIST limits still apply.
const limit=(k:'C'|'D'|'F')=>{const p=demonstrationProject();p.cranes[0].design!.cmaaClass=k;const c=calculate(p).checks.find(v=>v.id==='vertical')!;return {n:p.spans[0]/c.capacity!,note:c.note};};
describe('Crane service class and the vertical deflection limit',()=>{
 it('keeps L/600 for CMAA C',()=>{const c=limit('C');expect(c.n).toBeCloseTo(600,6);expect(c.note).toContain('CMAA C: L/600');});
 it('tightens to L/800 for CMAA D',()=>{const d=limit('D');expect(d.n).toBeCloseTo(800,6);expect(d.note).toContain('CMAA D: L/800');});
 it('tightens to L/1000 for CMAA F',()=>{const f=limit('F');expect(f.n).toBeCloseTo(1000,6);expect(f.note).toContain('governing adopted limit L/1000');});
});

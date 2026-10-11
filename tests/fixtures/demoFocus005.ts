import {readFileSync} from 'node:fs';
import {projectSchema,type ProjectInput} from '../../src/engine/types';

/**
 * DEMO-FOCUS-005 "Cedar Works · New 5-ton runway in the existing 5-bay building" (calc rev 7a7a8557b7ced95f), the
 * project of the structural engineering review: W24X104 + C15X50 capped girders on five 25 ft simple spans, new
 * welded tapered I haunches on existing W14X90 columns, cap tieback angles, a 5-ton pendant crane, LRFD.
 * demoFocus005.before.json holds every check's status, demand, capacity and D/C before the review fixes.
 */
export function demoFocus005():ProjectInput{
 return projectSchema.parse(JSON.parse(readFileSync(new URL('./demoFocus005.json',import.meta.url),'utf8'))) as ProjectInput;
}
export type BaselineCheck={id:string;group:string;title:string;status:string;demand?:number;capacity?:number;utilization?:number;quantity?:string;refs:string[]};
export const demoFocus005Before=():{revision:string;checks:BaselineCheck[]}=>JSON.parse(readFileSync(new URL('./demoFocus005.before.json',import.meta.url),'utf8'));

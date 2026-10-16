import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import type {CalculationSnapshot} from '../../src/engine/types';

/**
 * SIM-002 "Existing building · by-others · flexible-plate · W27X146 · 5×25 ft simple · 20 t cab CMAA C/Class C · ASD",
 * a generated configuration of the calculation-package review (fictitious data): an uncapped rolled girder on seats by
 * others, a single flexible-plate tie at the top flange on a direct flange saddle, bolted end bearings, ASD. Its
 * calculation is eligible with 52 failing checks (40 of them saddle-toe fatigue register points), so it exercises the
 * open-items grouping, the failing worked lines and the forces delivered to columns by others. Stored so report tests
 * need no 4-minute calculate().
 */
export function sim002Snapshot():CalculationSnapshot{
 return JSON.parse(gunzipSync(readFileSync(new URL('./sim002.snapshot.json.gz',import.meta.url))).toString('utf8'));
}

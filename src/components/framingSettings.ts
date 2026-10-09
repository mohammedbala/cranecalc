import { z } from 'zod';
import { referenceColumns, referenceCrossheads } from '../data/aiscReferenceShapes';

// Viewer-only reference dimensions. They travel with the generated drawing but
// never enter the girder calculation or claim a supporting-building design.
export const framingKey = 'cranecalc.viewer.reference.v1';
export const framingSchema = z.object({
  shown: z.boolean(), labels: z.boolean(), full: z.boolean(),
  column: z.string().refine(v => referenceColumns.some(s => s.name === v)),
  crosshead: z.string().refine(v => referenceCrossheads.some(s => s.name === v)),
  height: z.number().refine(v => [3048, 4572, 6096].includes(v)),
  width: z.number().refine(v => [6096, 9144, 12192].includes(v)),
  roofClearance: z.number().refine(v => [1828.8, 2438.4, 3048].includes(v)),
  frameStyle: z.enum(['tapered', 'rolled']),
  roofSlope: z.number().refine(v => [2, 3, 4].includes(v)),
});
export type FramingSettings = z.infer<typeof framingSchema>;
export const defaultFraming: FramingSettings = {
  shown: true, labels: true, column: 'W14X90', crosshead: 'W12X40', height: 3048,
  full: true, width: 9144, roofClearance: 2438.4, frameStyle: 'tapered', roofSlope: 2,
};
export const demonstrationFraming:FramingSettings={...defaultFraming,width:12192};
export function initialFraming(): FramingSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(framingKey) ?? 'null');
    const result = framingSchema.safeParse({ ...defaultFraming, ...saved });
    if (result.success) return result.data;
  } catch { /* A missing local store uses the same defaults as the PDF service. */ }
  return { ...defaultFraming };
}

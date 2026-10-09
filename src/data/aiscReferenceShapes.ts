// Limited geometry-only extract from AISC Shapes Database v16.0, Database v16.0 sheet.
// Values are the tabulated US nominal dimensions, not detailing dimensions or inferred sizes.
// Provenance and cell addresses: references/REFERENCE_FRAMING.md.
export interface ReferenceShape { name: string; d: number; bf: number; tw: number; tf: number; row: number }
export const aiscShapeSource = 'https://www.aisc.org/aisc/publications/steel-construction-manual/aisc-shapes-database-v160/';
export const referenceColumns: readonly ReferenceShape[] = [
  { name: 'W14X90', d: 14, bf: 14.5, tw: .44, tf: .71, row: 208 },
  { name: 'W12X65', d: 12.1, bf: 12, tw: .39, tf: .605, row: 237 },
  { name: 'W10X49', d: 10, bf: 10, tw: .34, tf: .56, row: 257 },
];
export const referenceCrossheads: readonly ReferenceShape[] = [
  { name: 'W12X40', d: 11.9, bf: 8.01, tw: .295, tf: .515, row: 242 },
  { name: 'W10X33', d: 9.73, bf: 7.96, tw: .29, tf: .435, row: 260 },
  { name: 'W16X50', d: 16.3, bf: 7.07, tw: .38, tf: .63, row: 177 },
];
export const shapeMeters = (shape: ReferenceShape) => ({ d: shape.d * .0254, bf: shape.bf * .0254, tw: shape.tw * .0254, tf: shape.tf * .0254 });

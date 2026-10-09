import raw from './aiscWShapes.json' with { type: 'json' };
import type { Section } from '../engine/types';
import { aiscShapeSource } from './aiscReferenceShapes';

// Original US customary values from Database v16.0. Never use the rounded
// metric columns: their inertia/modulus/warping columns have different scales.
export const aiscWShapes = raw;
export type AiscWShape = typeof raw[number];
export const defaultAiscShape = 'W24X84';
export const sectionPropertyKeys = ['A','Ix','Iy','Sx','Sy','Zx','Zy','J','Cw'] as const;
const powers = { d:1, bf:1, tw:1, tf:1, A:2, Ix:4, Iy:4, Sx:3, Sy:3, Zx:3, Zy:3, J:4, Cw:6 } as const;
export const aiscShapeByName = (name: string) => aiscWShapes.find(shape => shape.name === name);
export function loadAiscSection(section: Section, name: string): Section {
  const shape = aiscShapeByName(name);
  if (!shape) throw new Error(`Unknown AISC W-shape: ${name}`);
  const dimensions = Object.fromEntries(Object.entries(powers).map(([key,power]) => [key,shape[key as keyof typeof powers] * 25.4 ** power]));
  const {capCatalogueId:_cap,...base}=section;
  return { ...base, ...dimensions, kind:'rolled', name:shape.name, catalogueId:shape.name,
    propertySource:`AISC Shapes Database v16.0 · Database v16.0 row ${shape.row} · US nominal values · ${aiscShapeSource}` };
}
// Verify catalogue provenance against the pinned data after import and again
// on the report server. A supplied section can still use its own documented source.
export function matchesAiscSection(section: Section): boolean {
  if (!section.catalogueId || !aiscShapeByName(section.catalogueId)) return false;
  const expected = loadAiscSection(section, section.catalogueId);
  return section.kind === 'rolled' && section.name === expected.name && section.propertySource === expected.propertySource
    && Object.keys(powers).every(key => {
      const k = key as keyof typeof powers;
      return Math.abs(section[k] - expected[k]) <= Math.abs(expected[k]) * 1e-10;
    });
}

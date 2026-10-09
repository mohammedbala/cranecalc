import { maxRunwayBays, type ProjectInput } from './types';

export function spansForBayCount(spans: number[], count: number): number[] {
  if (!Number.isInteger(count) || count < 1 || count > maxRunwayBays || !spans.length) {
    throw new RangeError(`Select between 1 and ${maxRunwayBays} bays.`);
  }
  // Retain edited lengths; extend the runway using the last existing bay length.
  return Array.from({ length: count }, (_, i) => spans[i] ?? spans.at(-1)!);
}

export function withRunwaySpans(project: ProjectInput, spans: number[]): ProjectInput {
  const next = structuredClone(project);
  const oldLength = project.spans.reduce((a, b) => a + b, 0);
  const length = spans.reduce((a, b) => a + b, 0);
  next.spans = [...spans];
  // Let normal validation handle an empty or invalid numeric field while editing.
  if (!spans.length || spans.some(span => !Number.isFinite(span) || span <= 0)) return next;
  for (const crane of next.cranes) {
    const fullLength = Math.abs(crane.travelEnd - oldLength) < 1e-6;
    crane.travelEnd = fullLength ? length : Math.min(crane.travelEnd, length);
    // A custom operating range entirely within removed bays returns to the runway.
    // Negative starts are allowed for a wheel train entering the runway.
    if (crane.travelStart >= crane.travelEnd) crane.travelStart = 0;
  }
  // Restraint and fatigue inputs stay explicit; validation flags any off-runway values.
  return next;
}

import { type CompactBoundary, type Event } from './schema.js';

export function isCompactBoundary(event: Event): event is CompactBoundary {
  return event.type === 'system' && event.subtype === 'compact_boundary';
}

export function isCompactSummaryUser(event: Event): boolean {
  return event.type === 'user' && event.isCompactSummary === true;
}

/**
 * Index of the most recent compact boundary in a chronological event list,
 * or `-1` if no boundary is present.
 *
 * Implemented as a manual reverse scan rather than `Array.findLastIndex`
 * because the project targets ES2022 and `findLastIndex` is ES2023.
 */
export function findLatestCompactBoundaryIndex(events: readonly Event[]): number {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event !== undefined && isCompactBoundary(event)) return i;
  }
  return -1;
}

/**
 * Drop every event before the latest compact boundary, keeping the boundary
 * and everything after it. Useful for transferring a session to claude.ai
 * without duplicating history that the summary already condenses.
 */
export function skipBeforeLatestCompact(events: readonly Event[]): Event[] {
  const index = findLatestCompactBoundaryIndex(events);
  if (index < 0) return [...events];
  return events.slice(index);
}

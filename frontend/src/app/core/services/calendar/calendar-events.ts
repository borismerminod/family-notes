/**
 * @file calendar-events.ts
 * @description **Pure helpers for ordering and grouping calendar events** (CALENDAR, see
 * .agent/CALENDAR/CALENDAR_FEATURE/APPROCHE_CALENDRIER.md §0.4). No Angular / no SQLite dependency:
 * they only sort and bucket `CalendarEvent`s so a component can render one aligned grid of days.
 *
 * Two responsibilities:
 *   - `sortEvents` orders events deterministically (see §4.2, T018–T022),
 *   - `groupEventsByDate` buckets them into the 42-day grid, matching each event to its real civil date
 *     (§4.3, T023–T026). Matching is a **plain string equality** on `'YYYY-MM-DD'`, exactly like
 *     `getEventsFromRangedDate()` compares lexically — so an event dated in an adjacent month still lands
 *     on its own cell regardless of the displayed month.
 */

import { CalendarEvent } from '../../models/calendar-event.model';
import { CalendarDay } from '../../models/calendar-day.model';

/**
 * Deterministically order events for rendering.
 *   - Primary: events carrying a `start_time` come before those without one (§4.2, T019),
 *   - Secondary (same group): ascending `start_time`. Times are zero-padded `'HH:mm'`, so a lexical
 *     compare equals a chronological compare (§4.2, T018).
 *   - Tie-breaker: ascending `id` — keeps the order stable and deterministic whether events share a time
 *     or none (§4.2, T020/T021).
 * Returns a **new** array; the input is never mutated. An empty or single-element collection is returned as-is
 * (no error) (§4.2, T022).
 * @param events The events to order.
 * @returns A new sorted `CalendarEvent[]`.
 */
export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    const aHasHour = Boolean(a.start_time);
    const bHasHour = Boolean(b.start_time);

    // Events with an explicit hour sink to the front; events without one go after.
    if (aHasHour !== bHasHour) return aHasHour ? -1 : 1;

    // Only reached within the "both have an hour" group: compare the times lexically (chronological).
    if (a.start_time && b.start_time && a.start_time !== b.start_time) {
      return a.start_time < b.start_time ? -1 : 1;
    }

    // Both share the same time — or neither has one — fall back to a stable id ordering.
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;

    return 0;
  });
}

/**
 * Bucket events into one `CalendarDay` per grid cell, in the same order as `gridKeys`.
 * Every displayed date appears exactly once — including dates with no event (empty collection), and dates
 * that fall outside the displayed month (§4.3, T025/T026). An event is attached to its own real civil-date
 * cell via plain string equality (§4.3, T023/T024); several events on the same day are grouped together,
 * preserving their original (post-sort) order within that day.
 * @param gridKeys The 42 civil `'YYYY-MM-DD'` keys of the grid, in display order.
 * @param events The sorted events to distribute across the cells.
 * @returns A `CalendarDay[]` aligned one-to-one with `gridKeys`.
 */
export function groupEventsByDate(gridKeys: string[], events: CalendarEvent[]): Array<CalendarDay> {
  const byKey = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    let bucket = byKey.get(event.date);
    if (!bucket) {
      bucket = [];
      byKey.set(event.date, bucket);
    }
    bucket.push(event);
  }

  return gridKeys.map((key) => ({ date: key, events: byKey.get(key) ?? [] }));
}

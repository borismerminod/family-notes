/**
 * @file calendar-event-composition.model.ts
 * @description Models of the pending state of the event popup, and of what saving it writes.
 *
 * The popup composes the events of one date without writing anything, then saves the whole
 * composition at once (see .agent/CALENDAR/EVENT/APPROCHE_CALENDAR_EVENT.md, D-EV13 and D-EV17).
 * These shapes are shared by the pure composition module (`calendar-event-composition.ts`), the
 * popup, and `CalendarService.saveEventChanges`.
 */

import { CalendarEvent } from './calendar-event.model';

/**
 * The values of an event as the user typed them in its entry form, before any cleaning: trimming
 * the text belongs to the composition, in one place. Times are `HH:mm` or `''` when left empty.
 */
export interface EventEntry {
    /** The typed text, untrimmed. */
    readonly title: string;
    /** The typed civil date, expected as `YYYY-MM-DD`. */
    readonly date: string;
    /** The typed start time, `HH:mm` or `''`. */
    readonly startTime: string;
    /** The typed end time, `HH:mm` or `''`. */
    readonly endTime: string;
}

/**
 * One problem that makes an entry invalid (US7). Several may be raised together, in this order:
 * - `TEXT_REQUIRED` — the text is empty once stripped of its leading and trailing spaces;
 * - `DATE_INVALID` — the date is missing, not shaped `YYYY-MM-DD`, or not a real civil date;
 * - `TIME_FORMAT_INVALID` — a non-empty time is not `HH:mm` within `00:00`–`23:59`;
 * - `END_WITHOUT_START` — an end time is set without a start time;
 * - `END_NOT_AFTER_START` — both times are set and the end is not strictly after the start.
 */
export type EventIssue =
    | 'TEXT_REQUIRED'
    | 'DATE_INVALID'
    | 'TIME_FORMAT_INVALID'
    | 'END_WITHOUT_START'
    | 'END_NOT_AFTER_START';

/**
 * The pending state of the popup for one date. Every gesture produces a new composition; nothing
 * is written before « Enregistrer ».
 */
export interface EventComposition {
    /** The civil date the popup was opened for, as `YYYY-MM-DD`. */
    readonly date: string;
    /**
     * The events as they were read when the popup opened, sorted. It is the reference against
     * which pending changes are detected and deletions are derived (D-EV15).
     */
    readonly initialEvents: readonly CalendarEvent[];
    /**
     * The events as the user composed them. An event moved to another date stays here until the
     * save (D-EV3).
     */
    readonly events: readonly CalendarEvent[];
}

/**
 * What a save writes, derived from a composition: the events to create or update, and the
 * identifiers to delete, named one by one. The service deletes those identifiers and them alone,
 * never « everything of the date » (D-EV15).
 */
export interface EventChangeSet {
    /** The new events, and the read events whose values changed (moved, retyped, linked, unlinked). */
    readonly upsertedEvents: readonly CalendarEvent[];
    /** The identifiers of the read events the user removed. */
    readonly removedEventIds: readonly string[];
}

import { CalendarEvent } from '../models/calendar-event.model';
import {
  EventChangeSet,
  EventComposition,
  EventEntry,
  EventIssue,
} from '../models/calendar-event-composition.model';
import { Note } from '../models/note.model';
import { sortEvents } from './calendar-events';

/**
 * @file calendar-event-composition.ts
 * @description **Pure** algebra of the events of one date the event popup composes — batch D of
 * the calendar events feature (see .agent/CALENDAR/EVENT/APPROCHE_CALENDAR_EVENT.md, D-EV17). No
 * Angular, no DOM, no database, following the precedent of `kanban-composition.ts` (D-C18).
 *
 * The popup holds an `EventComposition` — the events read at opening, and the events as the user
 * composes them — and every gesture (append, entry, note, removal) returns a **new** composition.
 * Nothing is written before « Enregistrer »: the module also tells whether changes are pending
 * (`hasPendingChanges`) and derives what a save writes (`toChangeSet`). It holds the validation of
 * an entry too (`validateEntry`), in one place for the popup and the service (D-EV18).
 *
 * Named functions, not a class: the module holds no state. A gesture that does not apply — an
 * unknown identifier — returns the **received** composition itself, which is what lets a case
 * check « nothing moved » by identity. The received composition is never mutated.
 *
 * Implemented in TDD, case by case, against `PLAN_TESTS_CALENDAR_EVENT.md` §7 (groups 3 → 7,
 * cases `T3.1` → `T7.13`), whose API contract freezes the twelve functions exported here.
 *
 * Every local variable and callback signature is annotated, even where TypeScript would infer it
 * (AGENT.md § 4): in a module where a composition, a list of events and a signature all look
 * alike, the type written down tells the reader which one a name holds.
 */

/**
 * Opens a composition on the events read for a date. They are sorted the way the calendar cell
 * sorts them (`sortEvents`: ascending start time, events with no time at the bottom, then by
 * identifier), and the same sorted list is kept twice: `initialEvents` is the snapshot of what was
 * read, the reference of pending changes and derived deletions (D-EV15); `events` is what the
 * gestures then change.
 * @param date The civil date the popup is opened for, as `YYYY-MM-DD`.
 * @param events The events read for that date, in any order.
 * @returns A composition with no pending change.
 */
export function startComposition(date: string, events: readonly CalendarEvent[]): EventComposition {
  const readEvents: CalendarEvent[] = [...events];
  const sortedEvents: CalendarEvent[] = sortEvents(readEvents);
  return {
    date,
    initialEvents: sortedEvents,
    events: sortedEvents,
  };
}

/**
 * Builds the blank event « Ajouter un événement » appends (D-EV20): the received identifier and
 * date, an empty text, no time and no note. It is acceptable as a draft under entry, never as a
 * validated entry, since its empty text raises `TEXT_REQUIRED`.
 * @param id The identifier the popup generated for the new event.
 * @param date The civil date of the popup, as `YYYY-MM-DD`.
 * @returns The blank event.
 */
export function createBlankEvent(id: string, date: string): CalendarEvent {
  return {
    id,
    title: '',
    date,
    start_time: '',
    end_time: '',
    note: null,
  };
}

/**
 * Adds an event at the **bottom** of the composition, without sorting it: an event under entry
 * takes its sorted place only once its entry is validated (D-EV4, D-EV20).
 * @param composition The composition the event is added to.
 * @param event The event added, usually a blank one.
 * @returns A new composition ending with the event.
 */
export function appendEvent(composition: EventComposition, event: CalendarEvent): EventComposition {
  const extendedEvents: CalendarEvent[] = [...composition.events, event];
  return { ...composition, events: extendedEvents };
}

/**
 * Finds the rank of an event in the composed events.
 * @param composition The composition searched.
 * @param eventId Identifier of the event looked for.
 * @returns Its zero-based rank, or `-1` when no composed event carries this identifier.
 */
function indexOfEvent(composition: EventComposition, eventId: string): number {
  return composition.events.findIndex((event: CalendarEvent): boolean => event.id === eventId);
}

/**
 * Builds the composed events with one of them replaced, the others kept in place.
 * @param composition The composition whose events are copied.
 * @param eventIndex Rank of the event replaced.
 * @param replacement The event put at that rank.
 * @returns A new array of events.
 */
function eventsWithReplacement(
  composition: EventComposition,
  eventIndex: number,
  replacement: CalendarEvent,
): CalendarEvent[] {
  const replacedEvents: CalendarEvent[] = [...composition.events];
  replacedEvents[eventIndex] = replacement;
  return replacedEvents;
}

/**
 * Applies a validated entry to one event: its text — stripped of its leading and trailing spaces,
 * its inner spaces kept —, its date and its times are replaced, its note is left untouched. The
 * events are sorted again, so the edited event takes its sorted place (US4). An event whose date
 * changed stays in the composition until the save (D-EV3).
 *
 * The entry is expected valid (`validateEntry`): the popup applies only an entry with no problem.
 * @param composition The composition edited.
 * @param eventId Identifier of the event the entry belongs to.
 * @param entry The entry as typed.
 * @returns A new composition, or the received one itself when no event carries this identifier.
 */
export function applyEntry(
  composition: EventComposition,
  eventId: string,
  entry: EventEntry,
): EventComposition {
  const eventIndex: number = indexOfEvent(composition, eventId);
  if (eventIndex === -1) {
    return composition;
  }
  const trimmedTitle: string = entry.title.trim();
  const editedEvent: CalendarEvent = {
    ...composition.events[eventIndex],
    title: trimmedTitle,
    date: entry.date,
    start_time: entry.startTime,
    end_time: entry.endTime,
  };
  const editedEvents: CalendarEvent[] = eventsWithReplacement(composition, eventIndex, editedEvent);
  const sortedEvents: CalendarEvent[] = sortEvents(editedEvents);
  return { ...composition, events: sortedEvents };
}

/**
 * Links a note to one event, or removes its link with `null`. Nothing else moves: the other
 * fields of the event, the other events and their order are kept. The function accepts any
 * replacement; offering no direct « change of note » is a rule of the event item (D-EV24).
 * @param composition The composition edited.
 * @param eventId Identifier of the event linked or unlinked.
 * @param note The note linked, or `null` to remove the link.
 * @returns A new composition, or the received one itself when no event carries this identifier.
 */
export function setEventNote(
  composition: EventComposition,
  eventId: string,
  note: Note | null,
): EventComposition {
  const eventIndex: number = indexOfEvent(composition, eventId);
  if (eventIndex === -1) {
    return composition;
  }
  const linkedEvent: CalendarEvent = { ...composition.events[eventIndex], note };
  const linkedEvents: CalendarEvent[] = eventsWithReplacement(composition, eventIndex, linkedEvent);
  return { ...composition, events: linkedEvents };
}

/**
 * Removes one event from the composition, the others staying in the same order. An event read at
 * opening thereby becomes a derived deletion (`toChangeSet`, D-EV15); an event added since the
 * opening simply vanishes, and nothing will be written of it.
 * @param composition The composition edited.
 * @param eventId Identifier of the event removed.
 * @returns A new composition, or the received one itself when no event carries this identifier.
 */
export function removeEvent(composition: EventComposition, eventId: string): EventComposition {
  const eventIndex: number = indexOfEvent(composition, eventId);
  if (eventIndex === -1) {
    return composition;
  }
  const remainingEvents: CalendarEvent[] = composition.events.filter(
    (event: CalendarEvent): boolean => event.id !== eventId,
  );
  return { ...composition, events: remainingEvents };
}

/**
 * Finds one composed event, for instance to name it in the removal confirmation.
 * @param composition The composition searched.
 * @param eventId Identifier of the event looked for.
 * @returns The event as the composition holds it, or `null` when none carries this identifier.
 */
export function findEvent(composition: EventComposition, eventId: string): CalendarEvent | null {
  const foundEvent: CalendarEvent | undefined = composition.events.find(
    (event: CalendarEvent): boolean => event.id === eventId,
  );
  return foundEvent ?? null;
}

/**
 * Tells whether an event was added since the opening, that is whether it is absent from the
 * events read at opening — the popup's way to tell a never-validated draft from a read event.
 * @param composition The composition checked.
 * @param eventId Identifier of the event checked.
 * @returns `true` when the event was not read at opening.
 */
export function isNewEvent(composition: EventComposition, eventId: string): boolean {
  const wasRead: boolean = composition.initialEvents.some(
    (event: CalendarEvent): boolean => event.id === eventId,
  );
  return !wasRead;
}

/**
 * Tells whether the typed text is empty once stripped of its leading and trailing spaces.
 * @param title The text as typed.
 * @returns `true` when nothing but spaces was typed.
 */
function isBlankText(title: string): boolean {
  const trimmedTitle: string = title.trim();
  return trimmedTitle.length === 0;
}

/** The shape of a civil date, `YYYY-MM-DD`, its three parts captured. */
const CIVIL_DATE_PATTERN: RegExp = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Number of days of each month of a common year, January first. */
const DAYS_IN_COMMON_YEAR_MONTHS: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Tells whether a year is a leap year of the Gregorian calendar: divisible by 4, except the
 * centuries not divisible by 400.
 * @param year The year checked.
 * @returns `true` when February has 29 days that year.
 */
function isLeapYear(year: number): boolean {
  const isDivisibleBy4: boolean = year % 4 === 0;
  const isCentury: boolean = year % 100 === 0;
  const isDivisibleBy400: boolean = year % 400 === 0;
  return isDivisibleBy4 && (!isCentury || isDivisibleBy400);
}

/**
 * Number of days of a month, February depending on the year.
 * @param year The year of the month.
 * @param month The month, from 1 (January) to 12.
 * @returns How many days the month has.
 */
function daysInMonth(year: number, month: number): number {
  const isLeapFebruary: boolean = month === 2 && isLeapYear(year);
  if (isLeapFebruary) {
    return 29;
  }
  return DAYS_IN_COMMON_YEAR_MONTHS[month - 1];
}

/**
 * Tells whether a typed date is a real civil date shaped `YYYY-MM-DD`. The check is civil, made on
 * the year, month and day parts, with no `Date` and no time zone involved (§4.8 of the previous
 * calendar batch): `2026-02-30` and `2027-02-29` are refused, `2028-02-29` is accepted.
 * @param date The date as typed.
 * @returns `true` when the date exists in the calendar.
 */
function isCivilDate(date: string): boolean {
  const dateParts: RegExpExecArray | null = CIVIL_DATE_PATTERN.exec(date);
  if (dateParts === null) {
    return false;
  }
  const year: number = Number(dateParts[1]);
  const month: number = Number(dateParts[2]);
  const day: number = Number(dateParts[3]);
  const isRealMonth: boolean = month >= 1 && month <= 12;
  if (!isRealMonth) {
    return false;
  }
  const lastDayOfMonth: number = daysInMonth(year, month);
  return day >= 1 && day <= lastDayOfMonth;
}

/** A time of day `HH:mm`, from `00:00` to `23:59`, both parts zero-padded. */
const TIME_OF_DAY_PATTERN: RegExp = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Tells whether a time was left empty, which an event allows for both its times.
 * @param time The time as typed.
 * @returns `true` when no time was typed.
 */
function isEmptyTime(time: string): boolean {
  return time === '';
}

/**
 * Tells whether a typed time is well formed: `HH:mm` within `00:00`–`23:59`. `9:00`, `25:00` and
 * `12:60` are refused.
 * @param time The non-empty time as typed.
 * @returns `true` when the time is a valid time of day.
 */
function isTimeOfDay(time: string): boolean {
  return TIME_OF_DAY_PATTERN.test(time);
}

/**
 * Tells whether a typed time is acceptable on its own: left empty, or a valid time of day.
 * @param time The time as typed.
 * @returns `true` when the time raises no format problem.
 */
function isAcceptableTime(time: string): boolean {
  return isEmptyTime(time) || isTimeOfDay(time);
}

/**
 * Tells whether an end time is set while the start time is not, which the `events` table refuses
 * (`chk_end_requires_start`).
 * @param entry The entry as typed.
 * @returns `true` when the end comes with no start.
 */
function hasEndWithoutStart(entry: EventEntry): boolean {
  return !isEmptyTime(entry.endTime) && isEmptyTime(entry.startTime);
}

/**
 * Tells whether both times are valid times of day and the end does not come strictly after the
 * start (`chk_start_before_end`). Zero-padded `HH:mm` compare lexically as they compare in time.
 * A malformed time is left to `TIME_FORMAT_INVALID` alone, so it never raises this problem too.
 * @param entry The entry as typed.
 * @returns `true` when the end is equal to the start, or before it.
 */
function hasEndNotAfterStart(entry: EventEntry): boolean {
  const areBothTimesOfDay: boolean = isTimeOfDay(entry.startTime) && isTimeOfDay(entry.endTime);
  return areBothTimesOfDay && entry.endTime <= entry.startTime;
}

/**
 * Lists the problems that make an entry invalid, empty when it is valid (US7). Problems are
 * checked one after the other and returned together, in the order `EventIssue` documents.
 *
 * This is the one place validation lives (D-EV18): the popup calls it when an entry is
 * validated, and `CalendarService` calls it again as a safety net before writing.
 * @param entry The entry as typed, untrimmed.
 * @returns The problems found, in their fixed order.
 */
export function validateEntry(entry: EventEntry): readonly EventIssue[] {
  const issues: EventIssue[] = [];
  if (isBlankText(entry.title)) {
    issues.push('TEXT_REQUIRED');
  }
  if (!isCivilDate(entry.date)) {
    issues.push('DATE_INVALID');
  }
  const areTimesWellFormed: boolean =
    isAcceptableTime(entry.startTime) && isAcceptableTime(entry.endTime);
  if (!areTimesWellFormed) {
    issues.push('TIME_FORMAT_INVALID');
  }
  if (hasEndWithoutStart(entry)) {
    issues.push('END_WITHOUT_START');
  }
  if (hasEndNotAfterStart(entry)) {
    issues.push('END_NOT_AFTER_START');
  }
  return issues;
}

/**
 * The entry matching an event, empty times included: it prefills an entry form, and lets
 * `CalendarService` run `validateEntry` again on the events it is asked to write (D-EV18).
 * @param event The event read back as an entry.
 * @returns The entry holding the event's text, date and times.
 */
export function entryOf(event: CalendarEvent): EventEntry {
  return {
    title: event.title,
    date: event.date,
    startTime: event.start_time,
    endTime: event.end_time,
  };
}

/**
 * The signature of one event: what a save would write of it — its identifier, text, date, times,
 * and the **identifier** of its note, never the note's content (same choice as D-C39). Two events
 * with the same signature write the same row.
 * @param event The event signed.
 * @returns A string equal for two events that write the same row.
 */
function signatureOf(event: CalendarEvent): string {
  const noteId: string | null = event.note?.id ?? null;
  const signedFields: (string | null)[] = [
    event.id,
    event.title,
    event.date,
    event.start_time,
    event.end_time,
    noteId,
  ];
  return JSON.stringify(signedFields);
}

/**
 * Orders events by identifier, the order-free reference under which two lists of events are
 * compared. Returns a new array; the received one is never sorted in place.
 * @param events The events to order.
 * @returns A new array of the same events, by ascending identifier.
 */
function sortedById(events: readonly CalendarEvent[]): CalendarEvent[] {
  const copiedEvents: CalendarEvent[] = [...events];
  return copiedEvents.sort((left: CalendarEvent, right: CalendarEvent): number => {
    if (left.id === right.id) {
      return 0;
    }
    return left.id < right.id ? -1 : 1;
  });
}

/**
 * The signature of a whole list of events, independent of the order it holds them in: the
 * events are signed one by one after being ordered by identifier, so a mere reordering — the sort
 * that follows an entry, for instance — does not read as a change.
 * @param events The events signed.
 * @returns A string equal for two lists that write the same rows.
 */
function signatureOfAll(events: readonly CalendarEvent[]): string {
  const orderedEvents: CalendarEvent[] = sortedById(events);
  const eventSignatures: string[] = orderedEvents.map(signatureOf);
  return JSON.stringify(eventSignatures);
}

/**
 * Tells whether saving the composition would write anything: its events and the events read at
 * opening do not share the same signature. Adding, retyping, moving, linking, unlinking or
 * removing an event is a change; coming back to the initial values is not, nor is a mere
 * reordering, nor a note whose content changed under the same identifier.
 * @param composition The composition checked.
 * @returns `true` when the composition differs from what was read.
 */
export function hasPendingChanges(composition: EventComposition): boolean {
  const composedSignature: string = signatureOfAll(composition.events);
  const initialSignature: string = signatureOfAll(composition.initialEvents);
  return composedSignature !== initialSignature;
}

/**
 * Indexes the signatures of the events read at opening by identifier, the reference a composed
 * event is compared with.
 * @param composition The composition whose initial events are indexed.
 * @returns The signature of each read event, by identifier.
 */
function initialSignaturesById(composition: EventComposition): Map<string, string> {
  const signaturesById: Map<string, string> = new Map<string, string>();
  for (const initialEvent of composition.initialEvents) {
    const initialSignature: string = signatureOf(initialEvent);
    signaturesById.set(initialEvent.id, initialSignature);
  }
  return signaturesById;
}

/**
 * Tells whether a composed event has to be written: it was not read at opening, or its signature
 * differs from the signature of its read version.
 * @param event The composed event checked.
 * @param signaturesById The signatures of the read events, by identifier.
 * @returns `true` when saving has to write the event.
 */
function needsWriting(event: CalendarEvent, signaturesById: Map<string, string>): boolean {
  const initialSignature: string | undefined = signaturesById.get(event.id);
  const composedSignature: string = signatureOf(event);
  return initialSignature !== composedSignature;
}

/**
 * Collects the identifiers of the composed events.
 * @param composition The composition read.
 * @returns The set of identifiers its events carry.
 */
function composedIdsOf(composition: EventComposition): Set<string> {
  const composedIds: string[] = composition.events.map((event: CalendarEvent): string => event.id);
  return new Set<string>(composedIds);
}

/**
 * Derives what a save writes (D-EV15, D-EV16):
 * - `upsertedEvents` — the composed events that were not read at opening (new), or whose
 *   signature differs from their read version (retyped, moved, linked, unlinked). Unchanged
 *   events are left out, so their `updated_at` is not touched;
 * - `removedEventIds` — the identifiers read at opening and missing from the composition. A draft
 *   added then removed was never read, so it appears in neither list.
 * @param composition The composition saved.
 * @returns The change set to hand to `CalendarService.saveEventChanges`, empty when nothing changed.
 */
export function toChangeSet(composition: EventComposition): EventChangeSet {
  const signaturesById: Map<string, string> = initialSignaturesById(composition);
  const upsertedEvents: CalendarEvent[] = composition.events.filter(
    (event: CalendarEvent): boolean => needsWriting(event, signaturesById),
  );
  const composedIds: Set<string> = composedIdsOf(composition);
  const removedEvents: CalendarEvent[] = composition.initialEvents.filter(
    (initialEvent: CalendarEvent): boolean => !composedIds.has(initialEvent.id),
  );
  const removedEventIds: string[] = removedEvents.map(
    (removedEvent: CalendarEvent): string => removedEvent.id,
  );
  return { upsertedEvents, removedEventIds };
}

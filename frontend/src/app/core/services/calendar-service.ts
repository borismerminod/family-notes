import { Injectable, inject } from '@angular/core';
import type { capSQLiteSet, DBSQLiteValues } from '@capacitor-community/sqlite';
import { SqliteService } from './sqlite-service';
import { NotesService } from './notes-service';
import { CalendarEvent } from '../models/calendar-event.model';
import { Note } from '../models/note.model';
import { EventChangeSet, EventEntry, EventIssue } from '../models/calendar-event-composition.model';
import { entryOf, validateEntry } from './calendar-event-composition';

/** The columns every read of the `events` table names, `note_id` included (no `SELECT *`). */
const EVENT_COLUMNS: string = 'id, title, date, start_time, end_time, note_id';

/**
 * Creates an event, or updates it in place when its identifier is known (D-EV16). The `date` in the
 * `SET` is what carries a move to another date without losing the identifier (US4).
 */
const UPSERT_EVENT_STATEMENT: string = `INSERT INTO events (${EVENT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    date = excluded.date,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    note_id = excluded.note_id,
    updated_at = CURRENT_TIMESTAMP`;

/**
 * SQLite-backed data source for calendar events. Reads events from the `events` table and maps
 * each raw row (snake_case columns) to the application {@link CalendarEvent} model, the linked
 * note hydrated whole from {@link NotesService}, each distinct note read once (D-EV12). The table itself is created
 * or migrated by `SchemaMigrationService` from `assets/migrations/`, so no SQL schema lives here.
 */
@Injectable({
  providedIn: 'root',
})
export class CalendarService extends SqliteService {
  /**
   * Owner of the notes an event may reference, which the reads hydrate their `note_id` from.
   * Decoding a note — its content and its former HTML and JSON shapes — belongs there.
   */
  private readonly notesService = inject(NotesService);

  constructor() {
    super();
  }

  /**
   * Maps a raw SQLite row to a {@link CalendarEvent}. Absent times (`NULL`) become empty strings
   * (D-EV11), and the reference becomes the whole note when it resolved, `null` otherwise — no
   * reference, deleted note or unreadable note alike (D-EV10).
   * @param row The raw row returned by the SQLite driver.
   * @param notesById The notes the rows reference, resolved once each.
   * @returns The corresponding calendar event.
   */
  private mapRowToEvent(row: any, notesById: Map<string, Note>): CalendarEvent {
    const linkedNote: Note | null = notesById.get(row.note_id) ?? null;
    return {
      id: row.id,
      title: row.title,
      date: row.date,
      start_time: row.start_time ?? '',
      end_time: row.end_time ?? '',
      note: linkedNote,
    };
  }

  /**
   * Runs a read of the `events` table and turns its rows into events, their notes hydrated. The
   * rows come back in storage order: sorting is the caller's job (`sortEvents`).
   * @param statement The `SELECT` to run, naming {@link EVENT_COLUMNS}.
   * @param values The values bound to the statement.
   * @returns A promise resolving to the events the rows describe.
   */
  private async readEvents(statement: string, values: string[]): Promise<CalendarEvent[]> {
    const res: DBSQLiteValues = await this.db.query(statement, values);
    const rows: any[] = res.values ?? [];
    const referencedNoteIds: (string | null)[] = rows.map((row: any): string | null => row.note_id ?? null);
    const notesById: Map<string, Note> = await this.resolveNotes(referencedNoteIds);
    return rows.map((row: any): CalendarEvent => this.mapRowToEvent(row, notesById));
  }

  /**
   * Resolves each distinct referenced note once. A reference that resolves to nothing — the note
   * was deleted — or whose read fails — logged — is simply absent from the result: an unresolved
   * reference never brings the read of the events down (D-C15).
   * @param noteIds The references the rows carry, `null` standing for « no reference ». Repeated
   * references are read only once.
   * @returns A promise resolving to the readable notes, keyed by their identifier.
   */
  private async resolveNotes(noteIds: readonly (string | null)[]): Promise<Map<string, Note>> {
    const referencedNoteIds: string[] = this.distinctReferencesOf(noteIds);
    const notesById: Map<string, Note> = new Map<string, Note>();
    for (const referencedNoteId of referencedNoteIds) {
      const foundNote: Note | null = await this.readNoteOrNothing(referencedNoteId);
      const isReadable: boolean = foundNote !== null;
      if (isReadable) {
        notesById.set(referencedNoteId, foundNote!);
      }
    }
    return notesById;
  }

  /**
   * Keeps each reference once and drops the absent ones, which is what turns « one read per event »
   * into « one read per distinct note ».
   * @param noteIds The references the rows carry, possibly repeated or `null`.
   * @returns The distinct references, in the order they first appear.
   */
  private distinctReferencesOf(noteIds: readonly (string | null)[]): string[] {
    const presentNoteIds: string[] = noteIds.filter(
      (noteId: string | null): noteId is string => noteId !== null,
    );
    const distinctNoteIds: Set<string> = new Set<string>(presentNoteIds);
    return [...distinctNoteIds];
  }

  /**
   * Reads one referenced note, turning a failed read into « no note » after logging it, so that
   * one unreadable note does not hide every other event.
   * @param noteId The identifier of the referenced note.
   * @returns A promise resolving to the note, or `null` when it is missing or unreadable.
   */
  private async readNoteOrNothing(noteId: string): Promise<Note | null> {
    try {
      return await this.notesService.getNoteById(noteId);
    } catch (err) {
      console.error("Erreur lors de la lecture de la note référencée par un événement", err);
      return null;
    }
  }

  /**
   * Retrieves every event whose civil date falls within the given inclusive range.
   *
   * The calendar grid always spans 42 real dates, some of which belong to the previous or next
   * month. Events must therefore be fetched over the whole visible interval `[start, end]` rather
   * than a single month, so that events on adjacent-month days are retrieved as well.
   *
   * Dates are compared as civil `YYYY-MM-DD` strings: ISO lexical ordering matches chronological
   * order and no UTC conversion is applied, so an event never shifts to the previous or next day.
   * @param range The inclusive interval `{ start, end }`, each a `YYYY-MM-DD` string.
   * @returns A promise resolving to every event whose date lies within that interval, each with its
   * linked note.
   */
  public async getEventsFromRangedDate(range: { start: string; end: string }): Promise<CalendarEvent[]> {
    return this.runQuery('Erreur lors de la récupération des événements', async () => {
      const request: string = `SELECT ${EVENT_COLUMNS} FROM events WHERE date >= ? AND date <= ?`;
      return this.readEvents(request, [range.start, range.end]);
    });
  }

  /**
   * Retrieves every event scheduled on a specific day.
   * @param date The target day as a `YYYY-MM-DD` string.
   * @returns A promise resolving to the events on that day, each with its linked note, or to an
   * empty array when the day has none.
   */
  public async getEventsFromDate(date: string): Promise<CalendarEvent[]> {
    return this.runQuery('Erreur lors de la récupération des événements', async () => {
      const request: string = `SELECT ${EVENT_COLUMNS} FROM events WHERE date = ?`;
      return this.readEvents(request, [date]);
    });
  }

  /**
   * Writes the whole composition of the event popup in **one transaction**: the new and modified
   * events are upserted, then the removed ones are deleted by identifier, so that what was composed passes or fails as a whole (US9, D-EV13,
   * D-EV14). An empty change set writes nothing and persists nothing. Every event to write is first checked with the popup's own validation, as a safety
   * net: an invalid one rejects the save before anything is written (D-EV18). The store is flushed
   * once, after the transaction succeeded; a failure is logged and
   * rethrown, and leaves the previous state of the table entire.
   * @param changeSet The events to write and the identifiers to delete.
   * @returns A promise that resolves once the change set is written and persisted.
   */
  public async saveEventChanges(changeSet: EventChangeSet): Promise<void> {
    return this.runQuery("Erreur lors de l'enregistrement des événements", async () => {
      if (this.isEmptyChangeSet(changeSet)) {
        return;
      }
      this.assertEventsAreSavable(changeSet.upsertedEvents);
      const statements: capSQLiteSet[] = this.statementsOf(changeSet);
      await this.db.executeSet(statements, true);
      await this.persist();
    });
  }

  /**
   * Tells whether a change set has nothing to write: no event to upsert and no identifier to
   * delete. Saving it opens no transaction and does not flush the store.
   * @param changeSet The change set to inspect.
   * @returns `true` when both lists are empty.
   */
  private isEmptyChangeSet(changeSet: EventChangeSet): boolean {
    const hasNoUpsert: boolean = changeSet.upsertedEvents.length === 0;
    const hasNoRemoval: boolean = changeSet.removedEventIds.length === 0;
    return hasNoUpsert && hasNoRemoval;
  }

  /**
   * Replays `validateEntry` on every event about to be written. The popup only composes valid
   * events, so a problem here is a defect upstream: it is thrown before the transaction opens, and
   * the table checks stay the last line of defence (D-EV18).
   * @param events The events the change set writes.
   * @throws Error naming the first invalid event and its problems.
   */
  private assertEventsAreSavable(events: readonly CalendarEvent[]): void {
    for (const event of events) {
      const entry: EventEntry = entryOf(event);
      const issues: readonly EventIssue[] = validateEntry(entry);
      const isValid: boolean = issues.length === 0;
      if (!isValid) {
        throw new Error(`Événement invalide « ${event.id} » : ${issues.join(', ')}`);
      }
    }
  }

  /**
   * Builds the ordered statements of a change set: one upsert per event to write, then a single
   * deletion when identifiers are named.
   * @param changeSet The events to write and the identifiers to delete.
   * @returns The statements to run in one transaction.
   */
  private statementsOf(changeSet: EventChangeSet): capSQLiteSet[] {
    const upsertStatements: capSQLiteSet[] = changeSet.upsertedEvents.map(
      (event: CalendarEvent): capSQLiteSet => this.upsertStatementOf(event),
    );
    const hasRemovals: boolean = changeSet.removedEventIds.length > 0;
    if (!hasRemovals) {
      return upsertStatements;
    }
    const deleteStatement: capSQLiteSet = this.deleteStatementOf(changeSet.removedEventIds);
    return [...upsertStatements, deleteStatement];
  }

  /**
   * Builds the upsert of one event. An empty time is written `NULL`, which the table expects
   * (D-EV11), and the note is written by its identifier alone: the write never touches the note
   * itself.
   * @param event The event to create or update.
   * @returns The statement and its bound values.
   */
  private upsertStatementOf(event: CalendarEvent): capSQLiteSet {
    const startTime: string | null = this.storedTimeOf(event.start_time);
    const endTime: string | null = this.storedTimeOf(event.end_time);
    const noteId: string | null = event.note?.id ?? null;
    return {
      statement: UPSERT_EVENT_STATEMENT,
      values: [event.id, event.title, event.date, startTime, endTime, noteId],
    };
  }

  /**
   * Builds the deletion of the named events, and of them alone (D-EV15): never « every event of the
   * date », which would destroy an event moved away or wipe a day after a failed read. Deleting an
   * event never touches the note it references.
   * @param eventIds The identifiers of the events to delete, at least one.
   * @returns The statement and its bound identifiers.
   */
  private deleteStatementOf(eventIds: readonly string[]): capSQLiteSet {
    const placeholders: string = eventIds.map((): string => '?').join(', ');
    return {
      statement: `DELETE FROM events WHERE id IN (${placeholders})`,
      values: [...eventIds],
    };
  }

  /**
   * Translates a model time into its stored form: `''` means « no time » and is stored `NULL`,
   * since an empty string would violate the table check (D-EV11).
   * @param time The time as the model holds it, `HH:mm` or `''`.
   * @returns The time to store, or `null` when there is none.
   */
  private storedTimeOf(time: string): string | null {
    const hasTime: boolean = time !== '';
    return hasTime ? time : null;
  }
}

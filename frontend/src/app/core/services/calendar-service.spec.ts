import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { CalendarService } from './calendar-service';
import { DatabaseService } from './database.service';
import { NotesService } from './notes-service';
import { Note } from '../models';

/**
 * TARGET shape of a calendar event (TDD), as `.agent/CALENDAR/EVENT/APPROCHE_CALENDAR_EVENT.md`
 * fixes it (D-EV10): `noteIds` is gone, replaced by the **whole** linked note, or `null`. The spec
 * states it here so that the cases compile before the model is changed; once `CalendarEvent`
 * carries `note`, both shapes are the same.
 */
interface TargetCalendarEvent {
  readonly id: string;
  readonly title: string;
  readonly date: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly note: Note | null;
}

/**
 * TARGET shape of the change set the popup hands over (APPROCHE, class diagram,
 * `EventChangeSet`): the events to write, new or modified, and the identifiers to delete, named
 * one by one (D-EV15).
 */
interface TargetEventChangeSet {
  readonly upsertedEvents: readonly TargetCalendarEvent[];
  readonly removedEventIds: readonly string[];
}

/**
 * TARGET contract of the service under test (TDD). The spec drives `CalendarService` through
 * this interface only, so that a case states the public API it needs before the service offers
 * it: the two hydrated reads (lot B) and the single grouped write (lot C, D-EV13).
 */
interface CalendarServiceContract {
  getEventsFromDate(date: string): Promise<TargetCalendarEvent[]>;
  getEventsFromRangedDate(range: { start: string; end: string }): Promise<TargetCalendarEvent[]>;
  saveEventChanges(changeSet: TargetEventChangeSet): Promise<void>;
}

/**
 * A row of the `events` table, in its stored shape: an absent time is `NULL`, never `''`, and the
 * link to a note is the bare `note_id` (D-EV8, D-EV11).
 */
interface StoredEventRow {
  id: string;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  note_id: string | null;
}

/** One entry of the set handed to `executeSet`, as the plugin's `capSQLiteSet` describes it. */
interface StatementOfSet {
  statement?: string;
  values?: unknown[];
}

const mocks = vi.hoisted(() => {
  const dbConnection = {
    open: vi.fn(),
    close: vi.fn(),
    execute: vi.fn(),
    executeSet: vi.fn(),
    run: vi.fn(),
    query: vi.fn(),
  };
  const database = {
    connect: vi.fn(),
    persist: vi.fn(),
  };
  const notesService = {
    getNoteById: vi.fn(),
  };
  return { dbConnection, database, notesService };
});

/** The reference day of the popup (D5). */
const POPUP_DATE = '2026-11-19';

/** The interval of the November 2026 grid used by the ranged reads. */
const NOVEMBER_RANGE = { start: '2026-11-01', end: '2026-11-30' };

const NOTE_QUESTIONS: Note = {
  id: 'note-questions',
  title: 'Questions à poser',
  category: null,
  blocks: [],
  updatedAt: '2026-11-15T08:00:00.000Z',
};
const NOTE_COURSES: Note = {
  id: 'note-courses',
  title: 'Courses',
  category: null,
  blocks: [],
  updatedAt: '2026-11-16T09:30:00.000Z',
};

/**
 * Builds an `events` row as the database holds it (stored shape, not the model). The default is
 * `evt-matin` of D5, unlinked.
 */
function dbRow(overrides: Partial<StoredEventRow> = {}): StoredEventRow {
  const base: StoredEventRow = {
    id: 'evt-matin',
    title: 'Réunion parents-profs',
    date: POPUP_DATE,
    start_time: '09:00',
    end_time: '10:30',
    note_id: null,
  };
  return { ...base, ...overrides };
}

const ROW_MATIN: StoredEventRow = dbRow();
const ROW_MIDI: StoredEventRow = dbRow({
  id: 'evt-midi',
  title: 'Déjeuner',
  start_time: '12:30',
  end_time: null,
});
const ROW_JOURNEE: StoredEventRow = dbRow({
  id: 'evt-journee',
  title: 'Congé',
  start_time: null,
  end_time: null,
});
const ROW_AUTRE_JOUR: StoredEventRow = dbRow({
  id: 'evt-autre-jour',
  title: 'Rendez-vous chez le dentiste',
  date: '2026-11-20',
  start_time: '16:00',
  end_time: null,
});

const EVENT_MATIN: TargetCalendarEvent = {
  id: 'evt-matin',
  title: 'Réunion parents-profs',
  date: POPUP_DATE,
  start_time: '09:00',
  end_time: '10:30',
  note: null,
};
const EVENT_MIDI: TargetCalendarEvent = {
  id: 'evt-midi',
  title: 'Déjeuner',
  date: POPUP_DATE,
  start_time: '12:30',
  end_time: '',
  note: null,
};
const EVENT_JOURNEE: TargetCalendarEvent = {
  id: 'evt-journee',
  title: 'Congé',
  date: POPUP_DATE,
  start_time: '',
  end_time: '',
  note: null,
};
const EVENT_AUTRE_JOUR: TargetCalendarEvent = {
  id: 'evt-autre-jour',
  title: 'Rendez-vous chez le dentiste',
  date: '2026-11-20',
  start_time: '16:00',
  end_time: '',
  note: null,
};
const EVENT_NOUVEAU: TargetCalendarEvent = {
  id: 'evt-nouveau',
  title: 'Piscine',
  date: POPUP_DATE,
  start_time: '18:00',
  end_time: '',
  note: null,
};

/** The change set that writes nothing (E20). */
const EMPTY_CHANGE_SET: TargetEventChangeSet = { upsertedEvents: [], removedEventIds: [] };

/**
 * The rows the fake `events` table currently holds, every date together. Reset before each case
 * and seeded by {@link givenStoredEvents}.
 */
let storedEventRows: StoredEventRow[] = [];

/**
 * The notes the application holds, behind the {@link NotesService} double: the source the reads
 * hydrate their references from (D-EV12), and the targets the `note_id` foreign key accepts.
 */
let storedNotes: Note[] = [];

/**
 * Seeds the fake table with the rows standing in the database before the case acts. Rows are
 * seeded as is, without the table checks: a `note_id` pointing to a note the application no longer
 * holds is exactly what `ON DELETE SET NULL` failing to run would leave (C9).
 * @param rows The rows the table holds at the start of the case.
 */
function givenStoredEvents(rows: StoredEventRow[]): void {
  storedEventRows = rows.map((row: StoredEventRow): StoredEventRow => ({ ...row }));
}

/**
 * Seeds the notes the references resolve against.
 * @param notes The notes the application holds at the start of the case.
 */
function givenStoredNotes(notes: Note[]): void {
  storedNotes = notes.map((note: Note): Note => ({ ...note }));
}

/**
 * Refuses any statement aimed at a table this service does not own. `CalendarService` owns
 * `events` alone: the notes it hydrates come from {@link NotesService}. A write reaching `notes`
 * is therefore a defect, and refusing it here is what lets T2.7 and T2.8 observe « the note
 * itself is neither modified nor deleted » on the notes themselves. No case asserts the SQL.
 * @param statement The statement the service asks the connection to run.
 */
function refuseStatementsAimedAtAnotherTable(statement: string): void {
  const touchesTheEventsTable: boolean = /\bevents\b/i.test(statement);
  const touchesTheNotesTable: boolean = /\bnotes\b/i.test(statement);
  if (!touchesTheEventsTable || touchesTheNotesTable) {
    throw new Error(`Table étrangère au service du calendrier : ${statement}`);
  }
}

/**
 * Applies the rules of the real `events` table to a row about to be written (APPROCHE §0.1): a
 * non-empty identifier, a text that is not blank, a `YYYY-MM-DD` shaped date, times either `NULL`
 * or `HH:mm` below 24:00 — an empty string violates the check, which is what makes E16 observable
 * —, an end requiring a start, a start strictly before the end, and a `note_id` that is `NULL` or
 * a note the application holds (`PRAGMA foreign_keys = ON`, D-EV8).
 * @param row The row the statement would store.
 */
function assertRowSatisfiesTableChecks(row: StoredEventRow): void {
  const timePattern: RegExp = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  const hasIdentifier: boolean = typeof row.id === 'string' && row.id.length > 0;
  const hasText: boolean = typeof row.title === 'string' && row.title.trim().length > 0;
  const hasShapedDate: boolean = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(row.date);
  const hasValidStart: boolean = row.start_time === null || timePattern.test(row.start_time);
  const hasValidEnd: boolean = row.end_time === null || timePattern.test(row.end_time);
  const endWithoutStart: boolean = row.end_time !== null && row.start_time === null;
  const bothTimesSet: boolean = row.start_time !== null && row.end_time !== null;
  const startBeforeEnd: boolean = !bothTimesSet || row.start_time! < row.end_time!;
  const knownNoteIds: string[] = storedNotes.map((note: Note): string => note.id);
  const hasValidNoteReference: boolean = row.note_id === null || knownNoteIds.includes(row.note_id);
  const satisfiesChecks: boolean =
    hasIdentifier &&
    hasText &&
    hasShapedDate &&
    hasValidStart &&
    hasValidEnd &&
    !endWithoutStart &&
    startBeforeEnd;
  if (!satisfiesChecks) {
    throw new Error(`CHECK constraint failed: events ${JSON.stringify(row)}`);
  }
  if (!hasValidNoteReference) {
    throw new Error(`FOREIGN KEY constraint failed: events ${JSON.stringify(row)}`);
  }
}

/**
 * Builds the rows an `INSERT INTO events (…) VALUES (…)` statement carries, by pairing the column
 * list of the statement with the bound values, so that the double depends on no column order. A
 * column the statement leaves out is stored `NULL`, as the table defaults do. The values are
 * either one flat row or an array of rows.
 * @param statement The insert statement.
 * @param values The bound values.
 * @returns The rows the statement would store.
 */
function rowsCarriedByInsert(statement: string, values: unknown[]): StoredEventRow[] {
  const columnListMatch: RegExpMatchArray | null = statement.match(
    /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+events\s*\(([^)]*)\)/i,
  );
  if (columnListMatch === null) {
    throw new Error(`Ordre d'insertion non simulé : ${statement}`);
  }
  const columns: string[] = columnListMatch[1]
    .split(',')
    .map((column: string): string => column.trim());
  const isMultiRow: boolean = Array.isArray(values[0]);
  const boundRows: unknown[][] = isMultiRow ? (values as unknown[][]) : [values];
  return boundRows.map((boundRow: unknown[]): StoredEventRow => {
    const row: StoredEventRow = {
      id: '',
      title: '',
      date: '',
      start_time: null,
      end_time: null,
      note_id: null,
    };
    const writableRow: Record<string, unknown> = row as unknown as Record<string, unknown>;
    columns.forEach((column: string, index: number): void => {
      writableRow[column] = boundRow[index] ?? null;
    });
    return row;
  });
}

/**
 * Applies one insert to the given rows, the way `INSERT … ON CONFLICT(id) DO UPDATE` does
 * (D-EV16): a known identifier has its row updated in place — its `date` included, which is what
 * carries a move without losing the identifier (E13) —, an unknown one is appended. A plain insert
 * on a known identifier violates the primary key.
 * @param rows The rows of the table being built by the set.
 * @param statement The insert statement.
 * @param values The bound values.
 * @returns The rows after the insert.
 */
function applyInsertToRows(
  rows: StoredEventRow[],
  statement: string,
  values: unknown[],
): StoredEventRow[] {
  const isUpsert: boolean = /ON\s+CONFLICT\s*\(\s*id\s*\)\s*DO\s+UPDATE/i.test(statement);
  const carriedRows: StoredEventRow[] = rowsCarriedByInsert(statement, values);
  let resultingRows: StoredEventRow[] = rows;
  carriedRows.forEach((carriedRow: StoredEventRow): void => {
    assertRowSatisfiesTableChecks(carriedRow);
    const existingIndex: number = resultingRows.findIndex(
      (row: StoredEventRow): boolean => row.id === carriedRow.id,
    );
    const isKnownEvent: boolean = existingIndex >= 0;
    if (isKnownEvent && !isUpsert) {
      throw new Error(`UNIQUE constraint failed: events.id ${carriedRow.id}`);
    }
    if (isKnownEvent) {
      resultingRows = resultingRows.map(
        (row: StoredEventRow, index: number): StoredEventRow =>
          index === existingIndex ? carriedRow : row,
      );
      return;
    }
    resultingRows = [...resultingRows, carriedRow];
  });
  return resultingRows;
}

/**
 * Applies one `DELETE FROM events WHERE id IN (…)` to the given rows: the named identifiers go,
 * and they alone (D-EV15). Any other shape of deletion — by date, by exclusion — is refused rather
 * than guessed, so that it shows as a red case instead of a false green on E15.
 * @param rows The rows of the table being built by the set.
 * @param statement The delete statement.
 * @param values The bound identifiers.
 * @returns The rows after the deletion.
 */
function applyDeleteToRows(
  rows: StoredEventRow[],
  statement: string,
  values: unknown[],
): StoredEventRow[] {
  const deletesByIdentifiers: boolean = /WHERE\s+id\s+IN\s*\(/i.test(statement);
  if (!deletesByIdentifiers) {
    throw new Error(`Ordre de suppression non simulé : ${statement}`);
  }
  return rows.filter((row: StoredEventRow): boolean => !values.includes(row.id));
}

/**
 * Applies one entry of a set to the given rows, dispatching on its leading verb.
 * @param rows The rows of the table being built by the set.
 * @param entry The statement and its bound values.
 * @returns The rows after the statement.
 */
function applyStatementToRows(rows: StoredEventRow[], entry: StatementOfSet): StoredEventRow[] {
  const statement: string = entry.statement ?? '';
  const values: unknown[] = entry.values ?? [];
  refuseStatementsAimedAtAnotherTable(statement);
  const verb: string = statement.trim().split(/\s+/)[0].toUpperCase();
  if (verb === 'INSERT') {
    return applyInsertToRows(rows, statement, values);
  }
  if (verb === 'DELETE') {
    return applyDeleteToRows(rows, statement, values);
  }
  throw new Error(`Ordre non simulé : ${statement}`);
}

/**
 * Wires the database double onto the fake table, so that what a write stores is what a later read
 * hands back (D2).
 *
 * A read binds one date (`getEventsFromDate`) or the two inclusive bounds of an interval
 * (`getEventsFromRangedDate`), and returns the matching rows **in storage order**, unsorted:
 * ordering is the caller's job (`sortEvents`). A write goes through `executeSet`, applied
 * **all or nothing**: the whole set is played on a copy of the table, and the copy replaces the
 * table only if every statement passed (D-EV14). No case asserts the SQL text.
 */
function wireDatabaseDoubleOnFakeTable(): void {
  mocks.dbConnection.query.mockImplementation(
    async (statement: string, values: unknown[] = []): Promise<{ values: StoredEventRow[] }> => {
      refuseStatementsAimedAtAnotherTable(statement);
      const isRangedRead: boolean = values.length === 2;
      const [firstDate, lastDate] = values as string[];
      const matchingRows: StoredEventRow[] = storedEventRows.filter(
        (row: StoredEventRow): boolean =>
          isRangedRead ? row.date >= firstDate && row.date <= lastDate : row.date === firstDate,
      );
      const copiedRows: StoredEventRow[] = matchingRows.map(
        (row: StoredEventRow): StoredEventRow => ({ ...row }),
      );
      return { values: copiedRows };
    },
  );

  mocks.dbConnection.executeSet.mockImplementation(
    async (set: StatementOfSet[]): Promise<{ changes: { changes: number } }> => {
      let rowsAfterSet: StoredEventRow[] = storedEventRows.map(
        (row: StoredEventRow): StoredEventRow => ({ ...row }),
      );
      set.forEach((entry: StatementOfSet): void => {
        rowsAfterSet = applyStatementToRows(rowsAfterSet, entry);
      });
      storedEventRows = rowsAfterSet;
      return { changes: { changes: set.length } };
    },
  );
}

/**
 * Wires the notes double onto the seeded notes: a reference resolves to the whole note, and a
 * `note_id` the application no longer holds resolves to nothing, as `getNoteById` does (C9).
 */
function wireNotesDoubleOnStoredNotes(): void {
  mocks.notesService.getNoteById.mockImplementation(async (noteId: string): Promise<Note | null> => {
    const foundNote: Note | undefined = storedNotes.find((note: Note): boolean => note.id === noteId);
    const isKnownNote: boolean = foundNote !== undefined;
    return isKnownNote ? { ...foundNote! } : null;
  });
}

/**
 * Makes every write of the database fail, the way a plugin giving up would (C24).
 * @param failure The error the write rejects with.
 */
function givenFailingWrites(failure: Error): void {
  mocks.dbConnection.executeSet.mockRejectedValue(failure);
}

/**
 * Makes every read of the database fail (C11).
 * @param failure The error the read rejects with.
 */
function givenFailingReads(failure: Error): void {
  mocks.dbConnection.query.mockRejectedValue(failure);
}

describe('CalendarService (accès SQLite)', () => {
  let service: CalendarServiceContract;

  beforeEach(() => {
    storedEventRows = [];
    storedNotes = [];

    mocks.dbConnection.open.mockReset().mockResolvedValue(undefined);
    mocks.dbConnection.close.mockReset().mockResolvedValue(undefined);
    mocks.dbConnection.execute.mockReset().mockResolvedValue({ changes: { changes: 1 } });
    mocks.dbConnection.executeSet.mockReset();
    mocks.dbConnection.run.mockReset();
    mocks.dbConnection.query.mockReset();

    mocks.database.connect.mockReset().mockResolvedValue(mocks.dbConnection);
    mocks.database.persist.mockReset().mockResolvedValue(undefined);

    mocks.notesService.getNoteById.mockReset();

    wireDatabaseDoubleOnFakeTable();
    wireNotesDoubleOnStoredNotes();

    TestBed.configureTestingModule({
      providers: [
        { provide: DatabaseService, useValue: mocks.database },
        { provide: NotesService, useValue: mocks.notesService },
      ],
    });
    service = TestBed.inject(CalendarService) as unknown as CalendarServiceContract;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Groupe 1 — Lecture (`PLAN_TESTS_CALENDAR_EVENT.md`, §7). Covers E1 → E10: the events of a date
   * or of an interval come back with their fields, absent times as `''`, and their linked note
   * whole — read once per distinct note, and never bringing the read down when it is gone or
   * unreadable. Serves US1, US2, US5 and US10.
   */
  describe('Groupe 1 — lecture', () => {
    it('T1.1 rend les événements d\'une date avec leur texte, leur date et leurs heures', async () => {
      givenStoredEvents([ROW_MATIN, ROW_MIDI]);

      const events: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);

      expect(events).toEqual([EVENT_MATIN, EVENT_MIDI]);
    });

    it('T1.2 ne rend pas l\'événement d\'une autre date', async () => {
      givenStoredEvents([ROW_MATIN, ROW_AUTRE_JOUR, ROW_MIDI]);

      const events: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);
      const ids: string[] = events.map((event: TargetCalendarEvent): string => event.id);

      expect(ids).toEqual(['evt-matin', 'evt-midi']);
    });

    it('T1.3 ne rend sur un intervalle que les événements compris dans ses bornes', async () => {
      const rowBeforeRange: StoredEventRow = dbRow({ id: 'evt-octobre', date: '2026-10-31' });
      const rowInRange: StoredEventRow = dbRow({ id: 'evt-novembre', date: '2026-11-19' });
      const rowAfterRange: StoredEventRow = dbRow({ id: 'evt-decembre', date: '2026-12-31' });
      givenStoredEvents([rowBeforeRange, rowInRange, rowAfterRange]);

      const events: TargetCalendarEvent[] = await service.getEventsFromRangedDate(NOVEMBER_RANGE);
      const ids: string[] = events.map((event: TargetCalendarEvent): string => event.id);

      expect(ids).toEqual(['evt-novembre']);
    });

    it('T1.4 rend une liste vide, sans erreur, pour une date sans événement', async () => {
      givenStoredEvents([ROW_AUTRE_JOUR]);

      const read: Promise<TargetCalendarEvent[]> = service.getEventsFromDate(POPUP_DATE);

      await expect(read).resolves.toEqual([]);
    });

    it('T1.5 rend vides (\'\') les heures absentes en base', async () => {
      givenStoredEvents([ROW_JOURNEE, ROW_MIDI]);

      const events: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);
      const [journee, midi] = events;

      expect(journee.start_time).toBe('');
      expect(journee.end_time).toBe('');
      expect(midi.start_time).toBe('12:30');
      expect(midi.end_time).toBe('');
    });

    it('T1.6 rend l\'événement lié avec sa note entière, titre compris', async () => {
      givenStoredNotes([NOTE_QUESTIONS]);
      const linkedRow: StoredEventRow = dbRow({ note_id: 'note-questions' });
      givenStoredEvents([linkedRow]);

      const events: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);
      const carriedNote: Note | null = events[0].note;

      expect(carriedNote).toEqual(NOTE_QUESTIONS);
      expect(carriedNote?.title).toBe('Questions à poser');
    });

    it('T1.7 rend l\'événement sans lien avec note: null, sans demander aucune note', async () => {
      givenStoredNotes([NOTE_QUESTIONS]);
      givenStoredEvents([ROW_MATIN, ROW_MIDI]);

      const events: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);
      const midi: TargetCalendarEvent = events[1];

      expect(midi.id).toBe('evt-midi');
      expect(midi.note).toBeNull();
      expect(mocks.notesService.getNoteById).not.toHaveBeenCalled();
    });

    it('T1.8 ne lit qu\'une fois une note visée par deux événements', async () => {
      givenStoredNotes([NOTE_QUESTIONS]);
      const linkedMatin: StoredEventRow = dbRow({ note_id: 'note-questions' });
      const linkedMidi: StoredEventRow = { ...ROW_MIDI, note_id: 'note-questions' };
      givenStoredEvents([linkedMatin, linkedMidi]);

      const events: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);
      const carriedNotes: (Note | null)[] = events.map(
        (event: TargetCalendarEvent): Note | null => event.note,
      );

      expect(carriedNotes).toEqual([NOTE_QUESTIONS, NOTE_QUESTIONS]);
      expect(mocks.notesService.getNoteById).toHaveBeenCalledTimes(1);
    });

    it('T1.9 rend sans note, et la lecture aboutit, l\'événement dont la note est introuvable', async () => {
      givenStoredNotes([]);
      const danglingRow: StoredEventRow = dbRow({ note_id: 'note-questions' });
      givenStoredEvents([danglingRow]);

      const read: Promise<TargetCalendarEvent[]> = service.getEventsFromDate(POPUP_DATE);
      await expect(read).resolves.toHaveLength(1);
      const events: TargetCalendarEvent[] = await read;
      const survivingEvent: TargetCalendarEvent = events[0];

      expect(survivingEvent.note).toBeNull();
      expect(survivingEvent.title).toBe('Réunion parents-profs');
    });

    it('T1.10 rend sans note, et la lecture aboutit, l\'événement dont la note est illisible', async () => {
      const noteFailure: Error = new Error('lecture de la note impossible');
      mocks.notesService.getNoteById.mockRejectedValue(noteFailure);
      const linkedRow: StoredEventRow = dbRow({ note_id: 'note-questions' });
      givenStoredEvents([linkedRow]);

      const read: Promise<TargetCalendarEvent[]> = service.getEventsFromDate(POPUP_DATE);
      await expect(read).resolves.toHaveLength(1);
      const events: TargetCalendarEvent[] = await read;
      const survivingEvent: TargetCalendarEvent = events[0];

      expect(survivingEvent.note).toBeNull();
      expect(survivingEvent.title).toBe('Réunion parents-profs');
    });

    it('T1.11 rend aussi la note entière sur la lecture d\'un intervalle', async () => {
      givenStoredNotes([NOTE_QUESTIONS]);
      const linkedRow: StoredEventRow = dbRow({ note_id: 'note-questions' });
      givenStoredEvents([linkedRow]);

      const events: TargetCalendarEvent[] = await service.getEventsFromRangedDate(NOVEMBER_RANGE);
      const carriedNote: Note | null = events[0].note;

      expect(carriedNote).toEqual(NOTE_QUESTIONS);
    });

    it('T1.12 relance l\'erreur de la base sur la lecture d\'une date', async () => {
      const readFailure: Error = new Error('lecture impossible');
      givenFailingReads(readFailure);

      const read: Promise<TargetCalendarEvent[]> = service.getEventsFromDate(POPUP_DATE);

      await expect(read).rejects.toBe(readFailure);
    });

    it('T1.13 relance l\'erreur de la base sur la lecture d\'un intervalle', async () => {
      const readFailure: Error = new Error('lecture impossible');
      givenFailingReads(readFailure);

      const read: Promise<TargetCalendarEvent[]> = service.getEventsFromRangedDate(NOVEMBER_RANGE);

      await expect(read).rejects.toBe(readFailure);
    });
  });

  /**
   * Groupe 2 — Écriture (`PLAN_TESTS_CALENDAR_EVENT.md`, §7). Covers E11 → E24 (E21 withdrawn):
   * `saveEventChanges` creates, modifies, moves and deletes exactly what the change set names, as
   * one transaction, writes an empty time as `NULL` and a note by its identifier, refuses an
   * invalid event before any write (D4), persists once on success and never on failure, and
   * replays idempotently. Every effect is read back from the fake table (D2). Serves US3, US4, US5,
   * US7, US8 and US9.
   */
  describe('Groupe 2 — écriture', () => {
    it('T2.1 relit l\'événement créé tel qu\'il a été demandé, à côté de l\'existant', async () => {
      givenStoredEvents([ROW_MATIN]);
      const changeSet: TargetEventChangeSet = { upsertedEvents: [EVENT_NOUVEAU], removedEventIds: [] };

      await service.saveEventChanges(changeSet);
      const reReadEvents: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);

      expect(reReadEvents).toEqual([EVENT_MATIN, EVENT_NOUVEAU]);
    });

    it('T2.2 relit l\'événement modifié avec ses nouvelles valeurs, sous le même identifiant', async () => {
      givenStoredEvents([ROW_MATIN]);
      const retypedMatin: TargetCalendarEvent = {
        ...EVENT_MATIN,
        title: 'Réunion décalée',
        start_time: '14:00',
        end_time: '15:00',
      };
      const changeSet: TargetEventChangeSet = { upsertedEvents: [retypedMatin], removedEventIds: [] };

      await service.saveEventChanges(changeSet);
      const reReadEvents: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);

      expect(reReadEvents).toEqual([retypedMatin]);
    });

    it('T2.3 relit l\'événement déplacé à sa nouvelle date, sous le même identifiant, et plus à l\'ancienne', async () => {
      givenStoredEvents([ROW_MATIN]);
      const movedMatin: TargetCalendarEvent = { ...EVENT_MATIN, date: '2026-11-21' };
      const changeSet: TargetEventChangeSet = { upsertedEvents: [movedMatin], removedEventIds: [] };

      await service.saveEventChanges(changeSet);
      const eventsOfNewDate: TargetCalendarEvent[] = await service.getEventsFromDate('2026-11-21');
      const eventsOfFormerDate: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);

      expect(eventsOfNewDate).toEqual([movedMatin]);
      expect(eventsOfFormerDate).toEqual([]);
    });

    it('T2.4 ne relit plus l\'événement désigné pour la suppression', async () => {
      givenStoredEvents([ROW_MATIN, ROW_MIDI]);
      const changeSet: TargetEventChangeSet = { upsertedEvents: [], removedEventIds: ['evt-midi'] };

      await service.saveEventChanges(changeSet);
      const reReadEvents: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);
      const reReadIds: string[] = reReadEvents.map((event: TargetCalendarEvent): string => event.id);

      expect(reReadIds).toEqual(['evt-matin']);
    });

    it('T2.5 laisse inchangés les événements non désignés, de la même date comme d\'une autre', async () => {
      givenStoredEvents([ROW_MATIN, ROW_MIDI, ROW_JOURNEE, ROW_AUTRE_JOUR]);
      const changeSet: TargetEventChangeSet = { upsertedEvents: [], removedEventIds: ['evt-midi'] };

      await service.saveEventChanges(changeSet);
      const eventsOfSameDate: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);
      const eventsOfOtherDate: TargetCalendarEvent[] = await service.getEventsFromDate('2026-11-20');

      expect(eventsOfSameDate).toEqual([EVENT_MATIN, EVENT_JOURNEE]);
      expect(eventsOfOtherDate).toEqual([EVENT_AUTRE_JOUR]);
    });

    it('T2.6 enregistre un événement sans aucune heure et le relit avec des heures vides', async () => {
      givenStoredEvents([]);
      const untimedEvent: TargetCalendarEvent = {
        id: 'evt-sans-heure',
        title: 'Vide-grenier',
        date: POPUP_DATE,
        start_time: '',
        end_time: '',
        note: null,
      };
      const changeSet: TargetEventChangeSet = { upsertedEvents: [untimedEvent], removedEventIds: [] };

      const save: Promise<void> = service.saveEventChanges(changeSet);
      await expect(save).resolves.toBeUndefined();
      const reReadEvents: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);

      expect(reReadEvents).toEqual([untimedEvent]);
    });

    it('T2.7 relit l\'événement lié avec sa note, sans modifier aucune des notes', async () => {
      givenStoredNotes([NOTE_QUESTIONS, NOTE_COURSES]);
      givenStoredEvents([ROW_MATIN]);
      const linkedMatin: TargetCalendarEvent = { ...EVENT_MATIN, note: NOTE_QUESTIONS };
      const changeSet: TargetEventChangeSet = { upsertedEvents: [linkedMatin], removedEventIds: [] };

      await service.saveEventChanges(changeSet);
      const reReadEvents: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);
      const carriedNote: Note | null = reReadEvents[0].note;

      expect(carriedNote).toEqual(NOTE_QUESTIONS);
      expect(storedNotes).toEqual([NOTE_QUESTIONS, NOTE_COURSES]);
    });

    it('T2.8 relit sans note l\'événement dont on a retiré la note, et la note existe toujours', async () => {
      givenStoredNotes([NOTE_QUESTIONS]);
      const linkedRow: StoredEventRow = dbRow({ note_id: 'note-questions' });
      givenStoredEvents([linkedRow]);
      const unlinkedMatin: TargetCalendarEvent = { ...EVENT_MATIN, note: null };
      const changeSet: TargetEventChangeSet = { upsertedEvents: [unlinkedMatin], removedEventIds: [] };

      await service.saveEventChanges(changeSet);
      const reReadEvents: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);
      const carriedNote: Note | null = reReadEvents[0].note;

      expect(carriedNote).toBeNull();
      expect(storedNotes).toEqual([NOTE_QUESTIONS]);
    });

    it('T2.9 refuse avant toute écriture un changeSet portant un événement invalide : rien n\'est écrit ni persisté', async () => {
      givenStoredEvents([ROW_MATIN, ROW_MIDI]);
      const blankEvent: TargetCalendarEvent = { ...EVENT_NOUVEAU, id: 'evt-vide', title: '' };
      const changeSet: TargetEventChangeSet = {
        upsertedEvents: [EVENT_NOUVEAU, blankEvent],
        removedEventIds: ['evt-midi'],
      };

      const save: Promise<void> = service.saveEventChanges(changeSet);
      await expect(save).rejects.toThrow();
      const reReadEvents: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);

      expect(reReadEvents).toEqual([EVENT_MATIN, EVENT_MIDI]);
      expect(mocks.dbConnection.executeSet).not.toHaveBeenCalled();
      expect(mocks.database.persist).not.toHaveBeenCalled();
    });

    it('T2.10 accepte un changeSet vide sans rien écrire ni persister', async () => {
      givenStoredEvents([ROW_MATIN]);

      const save: Promise<void> = service.saveEventChanges(EMPTY_CHANGE_SET);
      await expect(save).resolves.toBeUndefined();
      const reReadEvents: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);

      expect(reReadEvents).toEqual([EVENT_MATIN]);
      expect(mocks.database.persist).not.toHaveBeenCalled();
    });

    it('T2.11 relance l\'erreur de la base sur l\'écriture', async () => {
      const writeFailure: Error = new Error('écriture impossible');
      givenFailingWrites(writeFailure);
      const changeSet: TargetEventChangeSet = { upsertedEvents: [EVENT_NOUVEAU], removedEventIds: [] };

      const save: Promise<void> = service.saveEventChanges(changeSet);

      await expect(save).rejects.toBe(writeFailure);
    });

    it('T2.12 persiste la base exactement une fois après un enregistrement réussi', async () => {
      givenStoredEvents([ROW_MATIN]);
      const untimedEvent: TargetCalendarEvent = { ...EVENT_JOURNEE, id: 'evt-sans-heure' };
      const changeSet: TargetEventChangeSet = {
        upsertedEvents: [EVENT_NOUVEAU, untimedEvent],
        removedEventIds: ['evt-matin'],
      };

      await service.saveEventChanges(changeSet);

      expect(mocks.database.persist).toHaveBeenCalledTimes(1);
    });

    it('T2.13 ne persiste pas la base quand l\'écriture échoue', async () => {
      const writeFailure: Error = new Error('écriture impossible');
      givenFailingWrites(writeFailure);
      const changeSet: TargetEventChangeSet = { upsertedEvents: [EVENT_NOUVEAU], removedEventIds: [] };

      const save: Promise<void> = service.saveEventChanges(changeSet);
      await expect(save).rejects.toBe(writeFailure);

      expect(mocks.database.persist).not.toHaveBeenCalled();
    });

    it('T2.14 relit le même état après avoir rejoué le même changeSet', async () => {
      givenStoredEvents([ROW_MATIN, ROW_MIDI, ROW_JOURNEE]);
      const retypedMidi: TargetCalendarEvent = {
        ...EVENT_MIDI,
        title: 'Déjeuner client',
        end_time: '13:30',
      };
      const changeSet: TargetEventChangeSet = {
        upsertedEvents: [EVENT_NOUVEAU, retypedMidi],
        removedEventIds: ['evt-journee'],
      };

      await service.saveEventChanges(changeSet);
      const eventsAfterFirstSave: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);
      await service.saveEventChanges(changeSet);
      const eventsAfterReplay: TargetCalendarEvent[] = await service.getEventsFromDate(POPUP_DATE);

      expect(eventsAfterFirstSave).toEqual([EVENT_MATIN, retypedMidi, EVENT_NOUVEAU]);
      expect(eventsAfterReplay).toEqual(eventsAfterFirstSave);
    });
  });

  /**
   * Cases of the previous lot (`.agent/CALENDAR/CALENDAR_FEATURE`), kept on the fake table as
   * `PLAN_TESTS_CALENDAR_EVENT.md` §1 asks. T001 asserted the SQL and is rewritten as T1.3; both
   * T005 cases asserted `noteIds` and are replaced by T1.1, T1.5 and T1.7.
   */
  describe('getEventsFromRangedDate — cas du lot précédent', () => {
    const gridRange: { start: string; end: string } = { start: '2026-11-01', end: '2026-12-31' };

    it('T002 - inclut les événements des mois adjacents présents dans la plage', async () => {
      const rowOfPreviousMonth: StoredEventRow = dbRow({ id: 'prev', title: 'Octobre', date: '2026-10-30' });
      const rowOfMonth: StoredEventRow = dbRow({ id: 'main', title: 'Novembre', date: '2026-11-15' });
      const rowOfNextMonth: StoredEventRow = dbRow({ id: 'next', title: 'Décembre', date: '2026-12-31' });
      givenStoredEvents([rowOfPreviousMonth, rowOfMonth, rowOfNextMonth]);
      const gridRangeOverlappingOctober: { start: string; end: string } = {
        start: '2026-10-26',
        end: '2026-12-31',
      };

      const events: TargetCalendarEvent[] = await service.getEventsFromRangedDate(
        gridRangeOverlappingOctober,
      );
      const ids: string[] = events.map((event: TargetCalendarEvent): string => event.id);

      expect(ids).toEqual(['prev', 'main', 'next']);
    });

    it('T003 - récupère tous les événements associés à une même date, sans perte ni duplication', async () => {
      const firstRow: StoredEventRow = dbRow({ id: 'a', title: 'Premier', date: '2026-11-15' });
      const secondRow: StoredEventRow = dbRow({ id: 'b', title: 'Deuxième', date: '2026-11-15' });
      const thirdRow: StoredEventRow = dbRow({ id: 'c', title: 'Troisième', date: '2026-11-15' });
      givenStoredEvents([firstRow, secondRow, thirdRow]);

      const events: TargetCalendarEvent[] = await service.getEventsFromRangedDate(gridRange);
      const ids: string[] = events.map((event: TargetCalendarEvent): string => event.id);

      expect(ids).toEqual(['a', 'b', 'c']);
    });

    it('T004 - retourne une collection vide (et non une erreur) quand la plage est sans événement', async () => {
      givenStoredEvents([]);

      const read: Promise<TargetCalendarEvent[]> = service.getEventsFromRangedDate(gridRange);

      await expect(read).resolves.toEqual([]);
    });

    it('T006 - conserve la date au format civil YYYY-MM-DD, sans décalage de fuseau horaire', async () => {
      const fixedDayRow: StoredEventRow = dbRow({ id: 'e1', title: 'Journée fixe', date: '2026-11-15' });
      givenStoredEvents([fixedDayRow]);

      const events: TargetCalendarEvent[] = await service.getEventsFromRangedDate(gridRange);

      expect(events[0].date).toBe('2026-11-15');
    });

    it('T007 - remonte l\'erreur de la requête SQLite à la couche appelante', async () => {
      const dbError: Error = new Error('SQLite failed');
      givenFailingReads(dbError);

      const read: Promise<TargetCalendarEvent[]> = service.getEventsFromRangedDate(gridRange);

      await expect(read).rejects.toBe(dbError);
    });

    it('T008 - récupère les événements situés exactement aux bornes de la plage', async () => {
      const rowOnFirstBound: StoredEventRow = dbRow({ id: 'start', title: 'Début', date: '2026-11-01' });
      const rowOnLastBound: StoredEventRow = dbRow({ id: 'end', title: 'Fin', date: '2026-12-31' });
      givenStoredEvents([rowOnFirstBound, rowOnLastBound]);

      const events: TargetCalendarEvent[] = await service.getEventsFromRangedDate(gridRange);
      const ids: string[] = events.map((event: TargetCalendarEvent): string => event.id);

      expect(ids).toEqual(['start', 'end']);
    });
  });
});

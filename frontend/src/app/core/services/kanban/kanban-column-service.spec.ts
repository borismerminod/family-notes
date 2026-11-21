import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { KanbanColumnService } from './kanban-column-service';
import { KanbanCardService } from './kanban-card-service';
import { DatabaseService } from '../database.service';
import { NotesService } from '../notes/notes-service';
import { KanbanCard, KanbanColumn } from '../../models';

/**
 * TARGET contract of the service under test (TDD).
 *
 * The spec drives the service through this interface only, so that a case states the public API it
 * needs before the service offers it. Sources: `.agent/KANBAN/EDITION_LISTES/APPROCHE_KANBAN_EDITION_LISTES.md`
 * (class diagram, `KanbanColumnService`) with `PLAN_TESTS_KANBAN_EDITION_LISTES.md` (groupes 1 et 2),
 * then `.agent/KANBAN/EDITION_CARTES/APPROCHE_KANBAN_EDITION_CARTES.md` (lot D — hydratation et
 * pilotage) with `PLAN_TESTS_KANBAN_CARTES.md` (groupes 6 et 7).
 *
 * The signatures are unchanged by the cards: a column carries them on the model (D-C4), so the
 * extension of the service shows in what the two methods hand over and write, not in their shape.
 */
interface KanbanColumnServiceContract {
  getColumnsByKanbanId(kanbanId: string): Promise<KanbanColumn[]>;
  saveColumnsForKanban(kanbanId: string, columns: KanbanColumn[]): Promise<KanbanColumn[]>;
}

/**
 * Read side of the cards, borrowed by the cases that have to observe what became of the cards of a
 * column the composition removed (E83, E84). It is **not** a target of this spec: `KanbanCardService`
 * is delivered (lot C), and a removed column no longer comes back in a composition — so the only
 * way to look at its cards is to ask for them.
 */
interface CardReaderContract {
  getCardsByColumnId(columnId: string): Promise<KanbanCard[]>;
}

/** A row of the `kanban_columns` table, in its stored shape (D-L6 — no dates). */
interface StoredColumnRow {
  id: string;
  kanban_id: string;
  name: string;
  position: number;
}

/** A row of the `kanban_cards` table, in its stored shape (D-C1 — no dates). */
interface StoredCardRow {
  id: string;
  column_id: string;
  text: string;
  note_id: string | null;
  position: number;
}

/** The table a statement is aimed at, the save now writing two of them (D-C6, D-C8). */
type TargetedTable = 'columns' | 'cards';

const mocks = vi.hoisted(() => {
  const dbConnection = {
    open: vi.fn(),
    close: vi.fn(),
    execute: vi.fn(),
    run: vi.fn(),
    query: vi.fn(),
  };
  const database = {
    connect: vi.fn(),
    persist: vi.fn(),
  };
  const notesService = {
    getAllNotes: vi.fn(),
    getNoteById: vi.fn(),
  };
  return { dbConnection, database, notesService };
});

/**
 * Builds a `kanban_columns` row as the database holds it: the stored shape, not the model
 * (D-L6 — id, kanban_id, name, position).
 */
function columnRow(overrides: Partial<StoredColumnRow> = {}): StoredColumnRow {
  const base: StoredColumnRow = {
    id: 'col-todo',
    kanban_id: 'k-courses',
    name: 'À faire',
    position: 0,
  };
  return { ...base, ...overrides };
}

/**
 * Builds a `kanban_cards` row as the database holds it: the owning column and the bare `note_id`
 * included, both of which the model drops (D-C1, D-C2).
 */
function cardRow(overrides: Partial<StoredCardRow> = {}): StoredCardRow {
  const base: StoredCardRow = {
    id: 'card-pain',
    column_id: 'col-todo',
    text: 'Acheter du pain',
    note_id: null,
    position: 0,
  };
  return { ...base, ...overrides };
}

const ROW_TODO = columnRow({ id: 'col-todo', name: 'À faire', position: 0 });
const ROW_DOING = columnRow({ id: 'col-doing', name: 'En cours', position: 1 });
const ROW_VALISES = columnRow({ id: 'col-valises', kanban_id: 'k-vacances', name: 'Valises', position: 0 });

const ROW_CARD_PAIN = cardRow({ id: 'card-pain', text: 'Acheter du pain', position: 0 });
const ROW_CARD_LAIT = cardRow({ id: 'card-lait', text: 'Acheter du lait', position: 1 });
const ROW_CARD_BEURRE = cardRow({
  id: 'card-beurre',
  column_id: 'col-doing',
  text: 'Acheter du beurre',
  position: 0,
});

/**
 * The columns of a composition the screen hands over. They carry `cards: []` — « loaded, and it
 * has none » — because that is what the editor must always set on a column it shows, `undefined`
 * being « cards not loaded » and skipping the closing phase of a save (D-C4, D-C9). A case that
 * needs a column carrying cards derives it with {@link withCards}.
 */
const COLUMN_TODO: KanbanColumn = { id: 'col-todo', name: 'À faire', position: 0, cards: [] };
const COLUMN_DOING: KanbanColumn = { id: 'col-doing', name: 'En cours', position: 1, cards: [] };
const COLUMN_DONE: KanbanColumn = { id: 'col-done', name: 'Terminé', position: 2, cards: [] };

const CARD_PAIN: KanbanCard = { id: 'card-pain', text: 'Acheter du pain', note: null, position: 0 };
const CARD_LAIT: KanbanCard = { id: 'card-lait', text: 'Acheter du lait', note: null, position: 1 };
const CARD_BEURRE: KanbanCard = {
  id: 'card-beurre',
  text: 'Acheter du beurre',
  note: null,
  position: 0,
};

/**
 * The rows the fake `kanban_columns` table currently holds, every board together. Reset before
 * each case and seeded by {@link givenStoredColumns}.
 */
let storedColumnRows: StoredColumnRow[] = [];

/**
 * The rows the fake `kanban_cards` table currently holds, every column together. Reset before each
 * case and seeded by {@link givenStoredCards}.
 */
let storedCardRows: StoredCardRow[] = [];

/**
 * Seeds the fake table with the rows standing in the database before the case acts, boards mixed
 * together on purpose: what belongs to another board has to stay out of every result (E16, E59).
 * @param rows The rows the table holds at the start of the case.
 */
function givenStoredColumns(rows: StoredColumnRow[]): void {
  storedColumnRows = rows.map((row) => ({ ...row }));
}

/**
 * Seeds the cards standing in the database before the case acts, columns mixed together on
 * purpose: the cards of one column must neither surface in another (E80, T6.3) nor disappear with
 * it (E83, T7.2).
 * @param rows The rows the table holds at the start of the case.
 */
function givenStoredCards(rows: StoredCardRow[]): void {
  storedCardRows = rows.map((row) => ({ ...row }));
}

/**
 * Derives a column of the composition carrying the cards the case hands over, the base fixtures
 * showing none.
 * @param column The column of the composition to derive from.
 * @param cards The cards that column shows, in the order it shows them.
 * @returns A new column carrying those cards.
 */
function withCards(column: KanbanColumn, cards: KanbanCard[]): KanbanColumn {
  return { ...column, cards };
}

/**
 * Reads the identifiers of the cards one read column carries. The model holds them as optional
 * (D-C4), and the absence is handed back as it is rather than smoothed into an empty list: a case
 * asserting an order would otherwise pass on a column whose cards were never loaded, which is
 * exactly the defect E80 and E81 guard against.
 * @param column One column of a read composition.
 * @returns The identifiers of its cards in the order it carries them, or `undefined` when its
 * cards are not loaded.
 */
function cardIdsOf(column: KanbanColumn): string[] | undefined {
  const loadedCards = column.cards;
  const areCardsLoaded = loadedCards !== undefined;
  if (!areCardsLoaded) {
    return undefined;
  }
  return loadedCards.map((card) => card.id);
}

/**
 * Names the table a statement is aimed at, so that one connection double serves the two tables a
 * save now writes: `kanban_columns`, owned by the service under test, and `kanban_cards`, owned by
 * the {@link KanbanCardService} it drives (D-C6, one service per table). A statement aimed at a
 * third table is a defect — the chain stops at these two, the notes coming from
 * {@link NotesService} and never from a join. The double looks at the statement; no case asserts
 * it.
 * @param statement The statement the service asks the connection to run.
 * @returns The table the statement is aimed at.
 * @throws When the statement is aimed at neither of the two tables of the chain.
 */
function tableTargetedBy(statement: string): TargetedTable {
  const touchesTheCardsTable = /kanban_cards/i.test(statement);
  if (touchesTheCardsTable) {
    return 'cards';
  }
  const touchesTheColumnsTable = /kanban_columns/i.test(statement);
  if (touchesTheColumnsTable) {
    return 'columns';
  }
  throw new Error(`Table étrangère à la chaîne colonnes → cartes : ${statement}`);
}

/**
 * Tells a removal from a write, the statements of a save being dispatched on their leading verb
 * rather than on their text (règle projet — no case asserts the SQL).
 * @param statement The statement the service asks the connection to run.
 * @returns Whether the statement removes rows.
 */
function isRemovalStatement(statement: string): boolean {
  const leadingVerb = statement.trim().toUpperCase();
  return leadingVerb.startsWith('DELETE');
}

/**
 * Applies an upsert to the fake columns table, the way `INSERT … ON CONFLICT(id) DO UPDATE` does
 * (D-L10): a known identifier has its name and position updated in place, an unknown one is
 * appended. The row is never destroyed and recreated, so the cards hanging off it survive — which
 * is what T7.1 to T7.4 lean on.
 * @param upsertedRow The row the write carries.
 */
function applyColumnUpsertToFakeTable(upsertedRow: StoredColumnRow): void {
  const existingRowIndex = storedColumnRows.findIndex((row) => row.id === upsertedRow.id);
  const isKnownColumn = existingRowIndex >= 0;
  if (isKnownColumn) {
    storedColumnRows[existingRowIndex] = upsertedRow;
    return;
  }
  storedColumnRows.push(upsertedRow);
}

/**
 * Applies an upsert to the fake cards table, the way `INSERT … ON CONFLICT(id) DO UPDATE` does
 * (D-C10): a known identifier has its column, text, reference and position updated in place, an
 * unknown one is appended. The `column_id` sits in the update, which is what carries a move from
 * one column to another without losing the identifier (E71, E84).
 * @param upsertedRow The row the write carries.
 */
function applyCardUpsertToFakeTable(upsertedRow: StoredCardRow): void {
  requireOwningColumnOf(upsertedRow);
  const existingRowIndex = storedCardRows.findIndex((row) => row.id === upsertedRow.id);
  const isKnownCard = existingRowIndex >= 0;
  if (isKnownCard) {
    storedCardRows[existingRowIndex] = upsertedRow;
    return;
  }
  storedCardRows.push(upsertedRow);
}

/**
 * Refuses a card whose column is not in the table, the way `column_id REFERENCES kanban_columns(id)`
 * does (D-C1). It is what gives E85 something to observe: a save writing its cards before
 * upserting its columns would present a card whose brand new column does not exist yet, and the
 * database would turn it down.
 * @param cardRowToWrite The row the write carries.
 * @throws When no column of the fake table carries the identifier the card hangs off.
 */
function requireOwningColumnOf(cardRowToWrite: StoredCardRow): void {
  const owningColumn = storedColumnRows.find((row) => row.id === cardRowToWrite.column_id);
  const isColumnStored = owningColumn !== undefined;
  if (!isColumnStored) {
    throw new Error('FOREIGN KEY constraint failed');
  }
}

/**
 * Tells whether one stored column is swept by a removal of the columns a board no longer shows
 * (D-L10).
 *
 * The fence on the board is **not** assumed: a removal that does not restrict itself to one board
 * sweeps the whole table here, exactly as the database would. Without that, a statement having
 * lost its `WHERE kanban_id = ?` would still look harmless, and E16 could not be observed.
 * @param row The stored row the removal is tested against.
 * @param kanbanId The board the removal restricts itself to, when it does.
 * @param keptColumnIds The identifiers still present in the saved composition.
 * @param isFencedToKanban Whether the statement restricts the removal to that one board.
 * @returns Whether that row goes.
 */
function isSweptByColumnRemoval(
  row: StoredColumnRow,
  kanbanId: string,
  keptColumnIds: unknown[],
  isFencedToKanban: boolean,
): boolean {
  const belongsToKanban = row.kanban_id === kanbanId;
  const isCandidate = isFencedToKanban ? belongsToKanban : true;
  const isKept = keptColumnIds.includes(row.id);
  return isCandidate && !isKept;
}

/**
 * Applies to the fake table the removal of the columns a board no longer shows, the last phase of
 * a save (D-C8), and lets it cascade to their cards.
 * @param kanbanId The board the removal restricts itself to, when it does.
 * @param keptColumnIds The identifiers still present in the saved composition.
 * @param isFencedToKanban Whether the statement restricts the removal to that one board.
 */
function applyColumnRemovalToFakeTable(
  kanbanId: string,
  keptColumnIds: unknown[],
  isFencedToKanban: boolean,
): void {
  const sweptRows = storedColumnRows.filter((row) =>
    isSweptByColumnRemoval(row, kanbanId, keptColumnIds, isFencedToKanban),
  );
  const survivingRows = storedColumnRows.filter(
    (row) => !isSweptByColumnRemoval(row, kanbanId, keptColumnIds, isFencedToKanban),
  );
  storedColumnRows = survivingRows;
  const sweptColumnIds = sweptRows.map((row) => row.id);
  cascadeToCardsOf(sweptColumnIds);
}

/**
 * Removes the cards of the columns a removal just took away, the way `ON DELETE CASCADE` does
 * (D-C1), effective in the application thanks to the `PRAGMA foreign_keys = ON` already posed out
 * of transaction (D-L14). Reproducing it here is what lets E83 be observed as data: nothing in the
 * service removes those cards — the database does, and a save removing a column before writing its
 * cards would lose a card it was asked to keep (E84).
 * @param removedColumnIds The identifiers of the columns that just went.
 */
function cascadeToCardsOf(removedColumnIds: string[]): void {
  const survivingCardRows = storedCardRows.filter(
    (row) => !removedColumnIds.includes(row.column_id),
  );
  storedCardRows = survivingCardRows;
}

/**
 * Applies to the fake table the removal of the cards one column no longer shows, the third phase of
 * a save (D-C8): the rows of that column whose identifier is absent from the kept ones go.
 *
 * The fence on the column is **not** assumed, for the same reason as the columns above: a statement
 * having lost its `WHERE column_id = ?` would sweep the whole table here, as the database would.
 * @param columnId The column the removal restricts itself to, when it does.
 * @param keptCardIds The identifiers the saved composition still carries for that column.
 * @param isFencedToColumn Whether the statement restricts the removal to that one column.
 */
function applyCardRemovalToFakeTable(
  columnId: string,
  keptCardIds: unknown[],
  isFencedToColumn: boolean,
): void {
  const survivingRows = storedCardRows.filter((row) => {
    const belongsToColumn = row.column_id === columnId;
    const isCandidate = isFencedToColumn ? belongsToColumn : true;
    const isKept = keptCardIds.includes(row.id);
    return !isCandidate || isKept;
  });
  storedCardRows = survivingRows;
}

/**
 * Applies one write aimed at the columns table. A removal binds `(kanbanId, …keptColumnIds)`, an
 * upsert binds `(id, kanban_id, name, position)`.
 * @param statement The statement the service asks the connection to run.
 * @param values The values the statement binds.
 */
function applyColumnWriteToFakeTable(statement: string, values: unknown[]): void {
  const isRemoval = isRemovalStatement(statement);
  if (isRemoval) {
    const [kanbanId, ...keptColumnIds] = values;
    const isFencedToKanban = /kanban_id\s*=\s*\?/i.test(statement);
    applyColumnRemovalToFakeTable(kanbanId as string, keptColumnIds, isFencedToKanban);
    return;
  }
  const [id, kanbanId, name, position] = values;
  const upsertedRow: StoredColumnRow = {
    id: id as string,
    kanban_id: kanbanId as string,
    name: name as string,
    position: position as number,
  };
  applyColumnUpsertToFakeTable(upsertedRow);
}

/**
 * Applies one write aimed at the cards table. A removal binds `(columnId, …keptCardIds)`, an upsert
 * binds `(id, column_id, text, note_id, position)` (D-C10).
 * @param statement The statement the service asks the connection to run.
 * @param values The values the statement binds.
 */
function applyCardWriteToFakeTable(statement: string, values: unknown[]): void {
  const isRemoval = isRemovalStatement(statement);
  if (isRemoval) {
    const [columnId, ...keptCardIds] = values;
    const isFencedToColumn = /column_id\s*=\s*\?/i.test(statement);
    applyCardRemovalToFakeTable(columnId as string, keptCardIds, isFencedToColumn);
    return;
  }
  const [id, columnId, text, noteId, position] = values;
  const upsertedRow: StoredCardRow = {
    id: id as string,
    column_id: columnId as string,
    text: text as string,
    note_id: (noteId as string | null) ?? null,
    position: position as number,
  };
  applyCardUpsertToFakeTable(upsertedRow);
}

/**
 * Wires the database double onto the two fake tables, so that what a write stores is what a later
 * read hands back — the only way a removal, a cascade, a foreign key, an idempotent replay or a
 * convergence can be observed as data rather than as a count of calls (plan, §7, option retenue).
 *
 * The double dispatches on the table the statement names, on its leading verb and on the bound
 * values; no case ever asserts the SQL text, which stays the implementation's business (règle
 * projet). A read returns the rows of the bound board, or of the bound column, **in storage
 * order**, unsorted: ordering a composition is the service's job (E11, E80).
 */
function wireDatabaseDoubleOnFakeTables(): void {
  mocks.dbConnection.query.mockImplementation(
    async (statement: string, values: unknown[] = []) => {
      const targetedTable = tableTargetedBy(statement);
      const askedId = values[0];
      if (targetedTable === 'cards') {
        const rowsOfAskedColumn = storedCardRows.filter((row) => row.column_id === askedId);
        return { values: rowsOfAskedColumn.map((row) => ({ ...row })) };
      }
      const rowsOfAskedKanban = storedColumnRows.filter((row) => row.kanban_id === askedId);
      return { values: rowsOfAskedKanban.map((row) => ({ ...row })) };
    },
  );

  mocks.dbConnection.run.mockImplementation(async (statement: string, values: unknown[] = []) => {
    const targetedTable = tableTargetedBy(statement);
    if (targetedTable === 'cards') {
      applyCardWriteToFakeTable(statement, values);
      return { changes: { changes: 1 } };
    }
    applyColumnWriteToFakeTable(statement, values);
    return { changes: { changes: 1 } };
  });
}

/**
 * Wires the notes double on an application holding no note. No case of this spec puts a reference
 * on a card: hydrating a reference is the business of `kanban-card-service.spec.ts` (E63 → E67).
 * The double is here because the delivered {@link KanbanCardService} injects {@link NotesService}
 * (D-C14), and a case must never let it reach a real one — which would open a second connection and
 * leave an unhandled rejection behind (mémoire `run-frontend-tests`).
 */
function wireNotesDoubleOnAnApplicationWithoutNote(): void {
  mocks.notesService.getNoteById.mockResolvedValue(null);
  mocks.notesService.getAllNotes.mockResolvedValue([]);
}

/**
 * Makes the fake tables refuse the writes of one phase of a save, the way a database giving up
 * half-way would: either the upserts (E18, T2.9) or the removal of the columns the composition no
 * longer carries (E18 with C56, T2.10). The writes of the other phase keep landing, which is
 * exactly what leaves the tables in the intermediate state a replay then has to converge from.
 * @param failingPhase The write phase that rejects.
 */
function givenFailingWritePhase(failingPhase: 'upsert' | 'removal'): void {
  const applyWriteToFakeTable = mocks.dbConnection.run.getMockImplementation()!;
  mocks.dbConnection.run.mockImplementation(async (statement: string, values: unknown[] = []) => {
    const isRemoval = isRemovalStatement(statement);
    const isFailingWrite = failingPhase === 'removal' ? isRemoval : !isRemoval;
    if (isFailingWrite) {
      throw new Error('écriture impossible');
    }
    return applyWriteToFakeTable(statement, values);
  });
}

/**
 * Puts the database double back on its feet after {@link givenFailingWritePhase}, the fake tables
 * keeping whatever the failed save left in them — the intermediate state a replay has to converge
 * from (D-L13: no transaction, but a replayable save).
 */
function givenWritesWorkingAgain(): void {
  wireDatabaseDoubleOnFakeTables();
}

describe('KanbanColumnService (accès SQLite)', () => {
  let service: KanbanColumnServiceContract;
  let cardReader: CardReaderContract;

  beforeEach(() => {
    storedColumnRows = [];
    storedCardRows = [];

    mocks.dbConnection.open.mockReset().mockResolvedValue(undefined);
    mocks.dbConnection.close.mockReset().mockResolvedValue(undefined);
    mocks.dbConnection.execute.mockReset().mockResolvedValue({ changes: { changes: 1 } });
    mocks.dbConnection.run.mockReset();
    mocks.dbConnection.query.mockReset();

    mocks.database.connect.mockReset().mockResolvedValue(mocks.dbConnection);
    mocks.database.persist.mockReset().mockResolvedValue(undefined);

    mocks.notesService.getAllNotes.mockReset();
    mocks.notesService.getNoteById.mockReset();

    wireDatabaseDoubleOnFakeTables();
    wireNotesDoubleOnAnApplicationWithoutNote();

    TestBed.configureTestingModule({
      providers: [
        { provide: DatabaseService, useValue: mocks.database },
        { provide: NotesService, useValue: mocks.notesService },
      ],
    });
    service = TestBed.inject(KanbanColumnService) as unknown as KanbanColumnServiceContract;
    cardReader = TestBed.inject(KanbanCardService) as unknown as CardReaderContract;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Groupe 1 — Lire les colonnes d'un tableau (`PLAN_TESTS_KANBAN_EDITION_LISTES.md`, §6,
   * `KanbanColumnService`). Covers E11 (order of the positions), E12 (empty composition),
   * E59 (only the columns of the requested board) and E13 (read error rethrown), serving US1.
   */
  describe('getColumnsByKanbanId', () => {
    it('T1.1 renvoie les colonnes dans l\'ordre de leurs positions, alors que la base les sort dans un autre ordre', async () => {
      const scrambledRows = [ROW_DOING, columnRow({ id: 'col-done', name: 'Terminé', position: 2 }), ROW_TODO];
      givenStoredColumns(scrambledRows);

      const columns = await service.getColumnsByKanbanId('k-courses');
      const ids = columns.map((column) => column.id);
      const positions = columns.map((column) => column.position);

      expect(ids).toEqual(['col-todo', 'col-doing', 'col-done']);
      expect(positions).toEqual([0, 1, 2]);
    });

    it('T1.2 renvoie une composition vide quand le tableau n\'a aucune colonne, et non une erreur', async () => {
      givenStoredColumns([]);

      const read = service.getColumnsByKanbanId('k-sans-colonne');

      await expect(read).resolves.toEqual([]);
    });

    it('T1.3 ne renvoie que les colonnes du tableau demandé, alors que d\'autres tableaux en portent', async () => {
      givenStoredColumns([ROW_TODO, ROW_VALISES, ROW_DOING]);

      const columns = await service.getColumnsByKanbanId('k-courses');
      const ids = columns.map((column) => column.id);

      expect(ids).toEqual(['col-todo', 'col-doing']);
    });

    it('T1.4 relance l\'erreur de lecture au lieu de la convertir en composition vide', async () => {
      const readFailure = new Error('lecture impossible');
      mocks.dbConnection.query.mockRejectedValue(readFailure);

      const read = service.getColumnsByKanbanId('k-courses');

      await expect(read).rejects.toThrow('lecture impossible');
    });
  });

  /**
   * Groupe 2 — Enregistrer la composition d'un tableau (`PLAN_TESTS_KANBAN_EDITION_LISTES.md`,
   * §6, `KanbanColumnService`). Covers E14 (composition returned as asked), E15 (removals), E16
   * (other boards untouched), E17 (empty name refused), E18 (write error rethrown), E19 (single
   * flush) and E20 (idempotence), serving US2, US3, US4, US6 and US7.
   */
  describe('saveColumnsForKanban', () => {
    it('T2.1 renvoie la composition enregistrée, colonne ajoutée comprise', async () => {
      givenStoredColumns([ROW_TODO, ROW_DOING]);
      const askedComposition = [COLUMN_TODO, COLUMN_DOING, COLUMN_DONE];

      const savedColumns = await service.saveColumnsForKanban('k-courses', askedComposition);
      const reReadColumns = await service.getColumnsByKanbanId('k-courses');

      expect(savedColumns).toEqual(askedComposition);
      expect(reReadColumns).toEqual(askedComposition);
    });

    it('T2.2 renvoie la colonne renommée sous son nouveau nom, avec le même identifiant', async () => {
      givenStoredColumns([ROW_TODO, ROW_DOING]);
      const renamedColumn: KanbanColumn = { id: 'col-doing', name: 'En cours de route', position: 1, cards: [] };
      const askedComposition = [COLUMN_TODO, renamedColumn];

      const savedColumns = await service.saveColumnsForKanban('k-courses', askedComposition);
      const reReadColumns = await service.getColumnsByKanbanId('k-courses');

      expect(savedColumns).toEqual(askedComposition);
      expect(reReadColumns).toEqual(askedComposition);
    });

    it('T2.3 renvoie la colonne déplacée à son nouveau rang', async () => {
      const storedDoneRow = columnRow({ id: 'col-done', name: 'Terminé', position: 2 });
      givenStoredColumns([ROW_TODO, ROW_DOING, storedDoneRow]);
      const movedDoneColumn: KanbanColumn = { id: 'col-done', name: 'Terminé', position: 1, cards: [] };
      const pushedBackDoingColumn: KanbanColumn = { id: 'col-doing', name: 'En cours', position: 2, cards: [] };
      const askedComposition = [COLUMN_TODO, movedDoneColumn, pushedBackDoingColumn];

      const savedColumns = await service.saveColumnsForKanban('k-courses', askedComposition);
      const reReadColumns = await service.getColumnsByKanbanId('k-courses');

      expect(savedColumns).toEqual(askedComposition);
      expect(reReadColumns).toEqual(askedComposition);
    });

    it('T2.4 supprime la colonne que la composition enregistrée ne porte plus', async () => {
      const storedDoneRow = columnRow({ id: 'col-done', name: 'Terminé', position: 2 });
      givenStoredColumns([ROW_TODO, ROW_DOING, storedDoneRow]);
      const keptDoneColumn: KanbanColumn = { id: 'col-done', name: 'Terminé', position: 1, cards: [] };
      const askedComposition = [COLUMN_TODO, keptDoneColumn];

      await service.saveColumnsForKanban('k-courses', askedComposition);
      const reReadColumns = await service.getColumnsByKanbanId('k-courses');
      const reReadIds = reReadColumns.map((column) => column.id);

      expect(reReadIds).toEqual(['col-todo', 'col-done']);
    });

    it('T2.5 supprime toutes les colonnes du tableau quand la composition enregistrée est vide', async () => {
      givenStoredColumns([ROW_TODO, ROW_DOING]);
      const emptyComposition: KanbanColumn[] = [];

      await service.saveColumnsForKanban('k-courses', emptyComposition);
      const reReadColumns = await service.getColumnsByKanbanId('k-courses');

      expect(reReadColumns).toEqual([]);
    });

    it('T2.6 laisse intactes les colonnes des autres tableaux en retirant une colonne', async () => {
      const storedBilletsRow = columnRow({ id: 'col-billets', kanban_id: 'k-vacances', name: 'Billets', position: 1 });
      givenStoredColumns([ROW_TODO, ROW_DOING, ROW_VALISES, storedBilletsRow]);
      const askedComposition = [COLUMN_TODO];

      await service.saveColumnsForKanban('k-courses', askedComposition);
      const otherKanbanColumns = await service.getColumnsByKanbanId('k-vacances');
      const otherKanbanIds = otherKanbanColumns.map((column) => column.id);

      expect(otherKanbanIds).toEqual(['col-valises', 'col-billets']);
    });

    it('T2.7 refuse l\'enregistrement quand un nom est vide, sans la moindre écriture', async () => {
      givenStoredColumns([ROW_TODO, ROW_DOING]);
      const namelessColumn: KanbanColumn = { id: 'col-vide', name: '   ', position: 0, cards: [] };
      const shiftedTodoColumn: KanbanColumn = { id: 'col-todo', name: 'À faire', position: 1, cards: [] };
      const askedComposition = [namelessColumn, shiftedTodoColumn];

      const save = service.saveColumnsForKanban('k-courses', askedComposition);

      await expect(save).rejects.toThrow();
      expect(mocks.dbConnection.run).not.toHaveBeenCalled();
      expect(mocks.database.persist).not.toHaveBeenCalled();
    });

    it('T2.8 refuse aussi quand le nom vide n\'est pas le premier : la validation précède toute écriture', async () => {
      givenStoredColumns([ROW_TODO, ROW_DOING]);
      const namelessLastColumn: KanbanColumn = { id: 'col-vide', name: '   ', position: 2, cards: [] };
      const askedComposition = [COLUMN_TODO, COLUMN_DOING, namelessLastColumn];

      const save = service.saveColumnsForKanban('k-courses', askedComposition);

      await expect(save).rejects.toThrow();
      expect(mocks.dbConnection.run).not.toHaveBeenCalled();
      expect(mocks.database.persist).not.toHaveBeenCalled();
    });

    it('T2.9 relance l\'erreur survenue pendant les upserts', async () => {
      givenStoredColumns([ROW_TODO]);
      givenFailingWritePhase('upsert');
      const askedComposition = [COLUMN_TODO, COLUMN_DOING];

      const save = service.saveColumnsForKanban('k-courses', askedComposition);

      await expect(save).rejects.toThrow('écriture impossible');
    });

    it('T2.10 relance l\'erreur survenue pendant la suppression des absentes', async () => {
      givenStoredColumns([ROW_TODO, ROW_DOING]);
      givenFailingWritePhase('removal');
      const askedComposition = [COLUMN_TODO];

      const save = service.saveColumnsForKanban('k-courses', askedComposition);

      await expect(save).rejects.toThrow('écriture impossible');
    });

    it('T2.11 ne flushe la base qu\'une seule fois, après la dernière écriture, même à plusieurs colonnes', async () => {
      givenStoredColumns([ROW_TODO, ROW_DOING]);
      const askedComposition = [COLUMN_TODO, COLUMN_DOING, COLUMN_DONE];

      await service.saveColumnsForKanban('k-courses', askedComposition);
      const writeOrders = mocks.dbConnection.run.mock.invocationCallOrder;
      const lastWriteOrder = writeOrders[writeOrders.length - 1];
      const persistOrder = mocks.database.persist.mock.invocationCallOrder[0];

      expect(writeOrders.length).toBeGreaterThan(1);
      expect(mocks.database.persist).toHaveBeenCalledTimes(1);
      expect(persistOrder).toBeGreaterThan(lastWriteOrder);
    });

    it('T2.12 donne le même résultat en ré-enregistrant une composition identique, sans doublon', async () => {
      givenStoredColumns([ROW_TODO, ROW_DOING]);
      const askedComposition = [COLUMN_TODO, COLUMN_DOING];

      const firstSavedColumns = await service.saveColumnsForKanban('k-courses', askedComposition);
      const replayedSavedColumns = await service.saveColumnsForKanban('k-courses', askedComposition);
      const reReadColumns = await service.getColumnsByKanbanId('k-courses');

      expect(replayedSavedColumns).toEqual(firstSavedColumns);
      expect(reReadColumns).toEqual(askedComposition);
    });

    it('T2.13 converge vers la composition attendue en rejouant depuis l\'état intermédiaire laissé par un échec', async () => {
      const storedDoneRow = columnRow({ id: 'col-done', name: 'Terminé', position: 2 });
      givenStoredColumns([ROW_TODO, ROW_DOING, storedDoneRow]);
      const askedComposition = [COLUMN_TODO, COLUMN_DOING];
      givenFailingWritePhase('removal');

      const failedSave = service.saveColumnsForKanban('k-courses', askedComposition);
      await expect(failedSave).rejects.toThrow('écriture impossible');
      const columnsLeftByTheFailure = await service.getColumnsByKanbanId('k-courses');
      const idsLeftByTheFailure = columnsLeftByTheFailure.map((column) => column.id);

      givenWritesWorkingAgain();
      const replayedSavedColumns = await service.saveColumnsForKanban('k-courses', askedComposition);
      const reReadColumns = await service.getColumnsByKanbanId('k-courses');

      expect(idsLeftByTheFailure).toEqual(['col-todo', 'col-doing', 'col-done']);
      expect(replayedSavedColumns).toEqual(askedComposition);
      expect(reReadColumns).toEqual(askedComposition);
    });
  });

  /**
   * Groupe 6 — Hydratation des colonnes (`PLAN_TESTS_KANBAN_CARTES.md`, §6.3). Covers E80 (every
   * column back with its cards, ordered by position) and E81 (a column without card back with an
   * empty list, and not « cards not loaded »), serving US1.
   */
  describe('getColumnsByKanbanId (les cartes des colonnes)', () => {
    it('T6.1 renvoie chaque colonne avec ses cartes, triées par position, alors que la base les sort dans un autre ordre', async () => {
      givenStoredColumns([ROW_TODO]);
      const scrambledCardRows = [ROW_CARD_LAIT, ROW_CARD_PAIN];
      givenStoredCards(scrambledCardRows);

      const columns = await service.getColumnsByKanbanId('k-courses');
      const todoColumn = columns[0];

      expect(todoColumn.cards).toEqual([CARD_PAIN, CARD_LAIT]);
    });

    it('T6.2 renvoie la colonne sans carte avec une liste vide, et non un champ absent', async () => {
      givenStoredColumns([ROW_TODO]);
      givenStoredCards([]);

      const columns = await service.getColumnsByKanbanId('k-courses');
      const todoColumn = columns[0];
      const carriesLoadedCards = 'cards' in todoColumn;

      expect(carriesLoadedCards).toBe(true);
      expect(todoColumn.cards).toEqual([]);
    });

    it('T6.3 ne fait pas remonter les cartes d\'une colonne dans une autre', async () => {
      givenStoredColumns([ROW_TODO, ROW_DOING]);
      givenStoredCards([ROW_CARD_PAIN, ROW_CARD_LAIT, ROW_CARD_BEURRE]);

      const columns = await service.getColumnsByKanbanId('k-courses');
      const todoCardIds = cardIdsOf(columns[0]);
      const doingCardIds = cardIdsOf(columns[1]);

      expect(todoCardIds).toEqual(['card-pain', 'card-lait']);
      expect(doingCardIds).toEqual(['card-beurre']);
    });
  });

  /**
   * Groupe 7 — Les quatre phases de l'enregistrement (`PLAN_TESTS_KANBAN_CARTES.md`, §6.3). Covers
   * E82 (the four phases in order), E83 (a removed column takes its cards along), E84 (a card
   * moved out of a removed column survives) and E85 (a card dropped into a column added by the
   * same save is written), serving US2, US6, US8 and US9.
   */
  describe('saveColumnsForKanban (les cartes des colonnes)', () => {
    it('T7.1 relit exactement la composition qui ajoute une carte, en retire une et retire une colonne', async () => {
      const storedDoneRow = columnRow({ id: 'col-done', name: 'Terminé', position: 2 });
      givenStoredColumns([ROW_TODO, ROW_DOING, storedDoneRow]);
      givenStoredCards([ROW_CARD_PAIN, ROW_CARD_LAIT, ROW_CARD_BEURRE]);
      const addedCard: KanbanCard = { id: 'card-fromage', text: 'Acheter du fromage', note: null, position: 1 };
      const todoColumn = withCards(COLUMN_TODO, [CARD_PAIN, addedCard]);
      const doingColumn = withCards(COLUMN_DOING, [CARD_BEURRE]);
      const askedComposition = [todoColumn, doingColumn];

      const savedColumns = await service.saveColumnsForKanban('k-courses', askedComposition);
      const reReadColumns = await service.getColumnsByKanbanId('k-courses');

      expect(savedColumns).toEqual(askedComposition);
      expect(reReadColumns).toEqual(askedComposition);
    });

    it('T7.2 fait disparaître les cartes de la colonne retirée, et garde celles des colonnes conservées', async () => {
      givenStoredColumns([ROW_TODO, ROW_DOING]);
      givenStoredCards([ROW_CARD_PAIN, ROW_CARD_LAIT, ROW_CARD_BEURRE]);
      const keptTodoColumn = withCards(COLUMN_TODO, [CARD_PAIN, CARD_LAIT]);
      const askedComposition = [keptTodoColumn];

      await service.saveColumnsForKanban('k-courses', askedComposition);
      const reReadColumns = await service.getColumnsByKanbanId('k-courses');
      const cardsLeftInRemovedColumn = await cardReader.getCardsByColumnId('col-doing');

      expect(reReadColumns).toEqual(askedComposition);
      expect(cardsLeftInRemovedColumn).toEqual([]);
    });

    it('T7.3 conserve, dans sa nouvelle colonne, la carte déplacée depuis une colonne retirée', async () => {
      givenStoredColumns([ROW_TODO, ROW_DOING]);
      givenStoredCards([ROW_CARD_PAIN, ROW_CARD_BEURRE]);
      const movedBeurreCard: KanbanCard = { id: 'card-beurre', text: 'Acheter du beurre', note: null, position: 1 };
      const todoColumn = withCards(COLUMN_TODO, [CARD_PAIN, movedBeurreCard]);
      const askedComposition = [todoColumn];

      await service.saveColumnsForKanban('k-courses', askedComposition);
      const reReadColumns = await service.getColumnsByKanbanId('k-courses');
      const reReadTodoCardIds = cardIdsOf(reReadColumns[0]);
      const cardsLeftInRemovedColumn = await cardReader.getCardsByColumnId('col-doing');

      expect(reReadTodoCardIds).toEqual(['card-pain', 'card-beurre']);
      expect(cardsLeftInRemovedColumn).toEqual([]);
    });

    it('T7.4 écrit la carte posée dans une colonne ajoutée au même enregistrement', async () => {
      givenStoredColumns([ROW_TODO]);
      givenStoredCards([ROW_CARD_PAIN]);
      const cardOfAddedColumn: KanbanCard = { id: 'card-tri', text: 'Trier les papiers', note: null, position: 0 };
      const keptTodoColumn = withCards(COLUMN_TODO, [CARD_PAIN]);
      const addedColumn: KanbanColumn = { id: 'col-done', name: 'Terminé', position: 1, cards: [cardOfAddedColumn] };
      const askedComposition = [keptTodoColumn, addedColumn];

      const savedColumns = await service.saveColumnsForKanban('k-courses', askedComposition);
      const reReadColumns = await service.getColumnsByKanbanId('k-courses');

      expect(savedColumns).toEqual(askedComposition);
      expect(reReadColumns).toEqual(askedComposition);
    });
  });
});

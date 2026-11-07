import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { KanbanColumnService } from './kanban-column-service';
import { DatabaseService } from './database.service';
import { KanbanColumn } from '../models';

/**
 * TARGET contract of the service under test (TDD).
 *
 * The spec drives the service through this interface only, so that a case states the public API it
 * needs before the service offers it. Source: `.agent/KANBAN/EDITION_LISTES/APPROCHE_KANBAN_EDITION_LISTES.md`
 * (class diagram, `KanbanColumnService`) and `PLAN_TESTS_KANBAN_EDITION_LISTES.md` (groupes 1 et 2).
 */
interface KanbanColumnServiceContract {
  getColumnsByKanbanId(kanbanId: string): Promise<KanbanColumn[]>;
  saveColumnsForKanban(kanbanId: string, columns: KanbanColumn[]): Promise<KanbanColumn[]>;
}

/** A row of the `kanban_columns` table, in its stored shape (D-L6 — no dates). */
interface StoredColumnRow {
  id: string;
  kanban_id: string;
  name: string;
  position: number;
}

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
  return { dbConnection, database };
});

/**
 * Builds a `kanban_columns` row as the database holds it: the stored shape, not the model
 * (D-L6 — id, kanban_id, name, position).
 */
function dbRow(overrides: Partial<StoredColumnRow> = {}): StoredColumnRow {
  const base: StoredColumnRow = {
    id: 'col-todo',
    kanban_id: 'k-courses',
    name: 'À faire',
    position: 0,
  };
  return { ...base, ...overrides };
}

const ROW_TODO = dbRow({ id: 'col-todo', name: 'À faire', position: 0 });
const ROW_DOING = dbRow({ id: 'col-doing', name: 'En cours', position: 1 });
const ROW_VALISES = dbRow({ id: 'col-valises', kanban_id: 'k-vacances', name: 'Valises', position: 0 });

const COLUMN_TODO: KanbanColumn = { id: 'col-todo', name: 'À faire', position: 0 };
const COLUMN_DOING: KanbanColumn = { id: 'col-doing', name: 'En cours', position: 1 };
const COLUMN_DONE: KanbanColumn = { id: 'col-done', name: 'Terminé', position: 2 };

/**
 * The rows the fake `kanban_columns` table currently holds, every board together. Reset before
 * each case and seeded by {@link givenStoredColumns}.
 */
let storedRows: StoredColumnRow[] = [];

/**
 * Seeds the fake table with the rows standing in the database before the case acts, boards mixed
 * together on purpose: what belongs to another board has to stay out of every result (E16, E59).
 * @param rows The rows the table holds at the start of the case.
 */
function givenStoredColumns(rows: StoredColumnRow[]): void {
  storedRows = rows.map((row) => ({ ...row }));
}

/**
 * Applies an upsert to the fake table, the way `INSERT … ON CONFLICT(id) DO UPDATE` does
 * (D-L10): a known identifier has its name and position updated in place, an unknown one is
 * appended. The row is never destroyed and recreated, so what will later hang off it survives.
 * @param upsertedRow The row the write carries.
 */
function applyUpsertToFakeTable(upsertedRow: StoredColumnRow): void {
  const existingRowIndex = storedRows.findIndex((row) => row.id === upsertedRow.id);
  const isKnownColumn = existingRowIndex >= 0;
  if (isKnownColumn) {
    storedRows[existingRowIndex] = upsertedRow;
    return;
  }
  storedRows.push(upsertedRow);
}

/**
 * Applies to the fake table the removal of the columns a board no longer shows (D-L10): the rows
 * whose identifier is absent from the kept ones go.
 *
 * The fence on the board is **not** assumed: a removal that does not restrict itself to one board
 * sweeps the whole table here, exactly as the database would. Without that, a statement having
 * lost its `WHERE kanban_id = ?` would still look harmless, and E16 could not be observed.
 * @param kanbanId The board the removal restricts itself to, when it does.
 * @param keptColumnIds The identifiers still present in the saved composition.
 * @param isFencedToKanban Whether the statement restricts the removal to that one board.
 */
function applyRemovalToFakeTable(kanbanId: string, keptColumnIds: unknown[], isFencedToKanban: boolean): void {
  const survivingRows = storedRows.filter((row) => {
    const belongsToKanban = row.kanban_id === kanbanId;
    const isCandidate = isFencedToKanban ? belongsToKanban : true;
    const isKept = keptColumnIds.includes(row.id);
    return !isCandidate || isKept;
  });
  storedRows = survivingRows;
}

/**
 * Refuses the one statement a fake table would happily accept while a real engine would not:
 * an empty `IN ()` list is a syntax error in SQLite, and a composition emptied of its last
 * column produces exactly that if the removal is written without its limit case (approche, lot
 * C, « cas limites »). Reproducing the refusal here keeps a case from passing against SQL no
 * database would run. The double looks at the statement; no case asserts it.
 * @param statement The statement the service asks the connection to run.
 */
function refuseWhatSqliteWouldRefuse(statement: string): void {
  const hasEmptyInList = /IN\s*\(\s*\)/i.test(statement);
  if (hasEmptyInList) {
    throw new Error('near ")": syntax error');
  }
}

/**
 * Wires the database double onto the fake table, so that what a write stores is what a later read
 * hands back — the only way a removal, an idempotent replay or a convergence can be observed as
 * data rather than as a count of calls (plan, §7, option retenue).
 *
 * The double dispatches on the leading verb of the statement and on the bound values; no case
 * ever asserts the SQL text, which stays the implementation's business (règle projet). A read
 * returns the rows of the bound board **in storage order**, unsorted: ordering the composition is
 * the service's job (E11). A write binds `(id, kanban_id, name, position)` for an upsert, and
 * `(kanbanId, …keptColumnIds)` for a removal.
 */
function wireDatabaseDoubleOnFakeTable(): void {
  mocks.dbConnection.query.mockImplementation(async (_statement: string, values: unknown[] = []) => {
    const askedKanbanId = values[0];
    const rowsOfAskedKanban = storedRows.filter((row) => row.kanban_id === askedKanbanId);
    return { values: rowsOfAskedKanban.map((row) => ({ ...row })) };
  });

  mocks.dbConnection.run.mockImplementation(async (statement: string, values: unknown[] = []) => {
    refuseWhatSqliteWouldRefuse(statement);
    const isRemoval = statement.trim().toUpperCase().startsWith('DELETE');
    if (isRemoval) {
      const [kanbanId, ...keptColumnIds] = values;
      const isFencedToKanban = /kanban_id\s*=\s*\?/i.test(statement);
      applyRemovalToFakeTable(kanbanId as string, keptColumnIds, isFencedToKanban);
      return { changes: { changes: 1 } };
    }
    const [id, kanbanId, name, position] = values;
    const upsertedRow: StoredColumnRow = {
      id: id as string,
      kanban_id: kanbanId as string,
      name: name as string,
      position: position as number,
    };
    applyUpsertToFakeTable(upsertedRow);
    return { changes: { changes: 1 } };
  });
}

/**
 * Makes the fake table refuse the writes of one phase of a save, the way a database giving up
 * half-way would: either the upserts (E18, T2.9) or the removal of the columns the composition
 * no longer carries (E18 with C56, T2.10). The writes of the other phase keep landing, which is
 * exactly what leaves the table in the intermediate state a replay then has to converge from.
 * @param failingPhase The write phase that rejects.
 */
function givenFailingWritePhase(failingPhase: 'upsert' | 'removal'): void {
  const applyWriteToFakeTable = mocks.dbConnection.run.getMockImplementation()!;
  mocks.dbConnection.run.mockImplementation(async (statement: string, values: unknown[] = []) => {
    const isRemoval = statement.trim().toUpperCase().startsWith('DELETE');
    const isFailingWrite = failingPhase === 'removal' ? isRemoval : !isRemoval;
    if (isFailingWrite) {
      throw new Error('écriture impossible');
    }
    return applyWriteToFakeTable(statement, values);
  });
}

/**
 * Puts the database double back on its feet after {@link givenFailingWritePhase}, the fake table
 * keeping whatever the failed save left in it — the intermediate state a replay has to converge
 * from (D-L13: no transaction, but a replayable save).
 */
function givenWritesWorkingAgain(): void {
  wireDatabaseDoubleOnFakeTable();
}

describe('KanbanColumnService (accès SQLite)', () => {
  let service: KanbanColumnServiceContract;

  beforeEach(() => {
    storedRows = [];

    mocks.dbConnection.open.mockReset().mockResolvedValue(undefined);
    mocks.dbConnection.close.mockReset().mockResolvedValue(undefined);
    mocks.dbConnection.execute.mockReset().mockResolvedValue({ changes: { changes: 1 } });
    mocks.dbConnection.run.mockReset();
    mocks.dbConnection.query.mockReset();

    mocks.database.connect.mockReset().mockResolvedValue(mocks.dbConnection);
    mocks.database.persist.mockReset().mockResolvedValue(undefined);

    wireDatabaseDoubleOnFakeTable();

    TestBed.configureTestingModule({
      providers: [{ provide: DatabaseService, useValue: mocks.database }],
    });
    service = TestBed.inject(KanbanColumnService) as unknown as KanbanColumnServiceContract;
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
      const scrambledRows = [ROW_DOING, dbRow({ id: 'col-done', name: 'Terminé', position: 2 }), ROW_TODO];
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
      const renamedColumn: KanbanColumn = { id: 'col-doing', name: 'En cours de route', position: 1 };
      const askedComposition = [COLUMN_TODO, renamedColumn];

      const savedColumns = await service.saveColumnsForKanban('k-courses', askedComposition);
      const reReadColumns = await service.getColumnsByKanbanId('k-courses');

      expect(savedColumns).toEqual(askedComposition);
      expect(reReadColumns).toEqual(askedComposition);
    });

    it('T2.3 renvoie la colonne déplacée à son nouveau rang', async () => {
      const storedDoneRow = dbRow({ id: 'col-done', name: 'Terminé', position: 2 });
      givenStoredColumns([ROW_TODO, ROW_DOING, storedDoneRow]);
      const movedDoneColumn: KanbanColumn = { id: 'col-done', name: 'Terminé', position: 1 };
      const pushedBackDoingColumn: KanbanColumn = { id: 'col-doing', name: 'En cours', position: 2 };
      const askedComposition = [COLUMN_TODO, movedDoneColumn, pushedBackDoingColumn];

      const savedColumns = await service.saveColumnsForKanban('k-courses', askedComposition);
      const reReadColumns = await service.getColumnsByKanbanId('k-courses');

      expect(savedColumns).toEqual(askedComposition);
      expect(reReadColumns).toEqual(askedComposition);
    });

    it('T2.4 supprime la colonne que la composition enregistrée ne porte plus', async () => {
      const storedDoneRow = dbRow({ id: 'col-done', name: 'Terminé', position: 2 });
      givenStoredColumns([ROW_TODO, ROW_DOING, storedDoneRow]);
      const keptDoneColumn: KanbanColumn = { id: 'col-done', name: 'Terminé', position: 1 };
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
      const storedBilletsRow = dbRow({ id: 'col-billets', kanban_id: 'k-vacances', name: 'Billets', position: 1 });
      givenStoredColumns([ROW_TODO, ROW_DOING, ROW_VALISES, storedBilletsRow]);
      const askedComposition = [COLUMN_TODO];

      await service.saveColumnsForKanban('k-courses', askedComposition);
      const otherKanbanColumns = await service.getColumnsByKanbanId('k-vacances');
      const otherKanbanIds = otherKanbanColumns.map((column) => column.id);

      expect(otherKanbanIds).toEqual(['col-valises', 'col-billets']);
    });

    it('T2.7 refuse l\'enregistrement quand un nom est vide, sans la moindre écriture', async () => {
      givenStoredColumns([ROW_TODO, ROW_DOING]);
      const namelessColumn: KanbanColumn = { id: 'col-vide', name: '   ', position: 0 };
      const shiftedTodoColumn: KanbanColumn = { id: 'col-todo', name: 'À faire', position: 1 };
      const askedComposition = [namelessColumn, shiftedTodoColumn];

      const save = service.saveColumnsForKanban('k-courses', askedComposition);

      await expect(save).rejects.toThrow();
      expect(mocks.dbConnection.run).not.toHaveBeenCalled();
      expect(mocks.database.persist).not.toHaveBeenCalled();
    });

    it('T2.8 refuse aussi quand le nom vide n\'est pas le premier : la validation précède toute écriture', async () => {
      givenStoredColumns([ROW_TODO, ROW_DOING]);
      const namelessLastColumn: KanbanColumn = { id: 'col-vide', name: '   ', position: 2 };
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
      const storedDoneRow = dbRow({ id: 'col-done', name: 'Terminé', position: 2 });
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
});

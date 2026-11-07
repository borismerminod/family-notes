import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { KanbanService } from './kanban-service';
import { KanbanColumnService } from './kanban-column-service';
import { DatabaseService } from './database.service';
import { Kanban, KanbanColumn } from '../models';

/**
 * Expected shape of what a grouped save hands back (`D-L24`). Declared here rather than imported
 * from `../models`, because the spec states the contract it needs before the code offers it: an
 * import of a model yet to be written would keep the whole bundle compile-red, every suite with it.
 */
interface KanbanSaveResult {
  kanban: Kanban;
  columnsSaved: boolean;
}

/**
 * Contrat CIBLE du service (TDD) — `.agent/KANBAN/CRUD/PLAN_TESTS_KANBAN_CRUD.md`, partie A, et
 * `.agent/KANBAN/EDITION_LISTES/PLAN_TESTS_KANBAN_EDITION_LISTES.md` (groupe 4) pour la dernière.
 */
interface KanbanServiceContract {
  getAllKanbans(): Promise<Kanban[]>;
  getKanbanById(id: string): Promise<Kanban | null>;
  createKanban(name: string): Promise<Kanban>;
  renameKanban(id: string, name: string): Promise<Kanban>;
  deleteKanban(id: string): Promise<void>;
  saveKanbanWithColumns(
    id: string | null,
    name: string,
    columns: KanbanColumn[],
  ): Promise<KanbanSaveResult>;
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
  const columnService = {
    getColumnsByKanbanId: vi.fn(),
    saveColumnsForKanban: vi.fn(),
  };
  return { dbConnection, database, columnService };
});

function dbRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = {
    id: 'kanban-courses',
    name: 'Courses',
    created_at: '2026-09-01 08:00:00',
    updated_at: '2026-09-28 18:30:00',
  };
  return { ...base, ...overrides };
}

const ROW_RECENT = dbRow({ id: 'k-recent', name: 'Courses', created_at: '2026-09-01 08:00:00', updated_at: '2026-09-28 18:30:00' });
const ROW_MIDDLE = dbRow({ id: 'k-middle', name: 'Travaux maison', created_at: '2026-08-15 09:00:00', updated_at: '2026-09-25 11:00:00' });
const ROW_OLDEST = dbRow({ id: 'k-oldest', name: 'Vacances', created_at: '2026-07-02 20:15:00', updated_at: '2026-08-30 10:05:00' });

const COLUMN_TODO: KanbanColumn = { id: 'col-todo', name: 'À faire', position: 0 };
const COLUMN_DOING: KanbanColumn = { id: 'col-doing', name: 'En cours', position: 1 };
const COLUMN_DONE: KanbanColumn = { id: 'col-done', name: 'Terminé', position: 2 };
const COLUMN_VALISES: KanbanColumn = { id: 'col-valises', name: 'Valises', position: 0 };

/**
 * The composition each board holds, as the column service would hand it back — one entry per
 * board. Reset before each case and seeded by {@link givenStoredColumns}.
 */
let storedColumnsByKanban: Record<string, KanbanColumn[]> = {};

/**
 * Seeds the compositions the column service answers with, several boards on purpose: a board's
 * own columns are only provably its own when another board carries others (E21, groupe 3).
 * @param columnsByKanban The composition of each board, keyed by board identifier.
 */
function givenStoredColumns(columnsByKanban: Record<string, KanbanColumn[]>): void {
  storedColumnsByKanban = { ...columnsByKanban };
}

describe('KanbanService (accès SQLite)', () => {
  let service: KanbanServiceContract;

  beforeEach(() => {
    mocks.dbConnection.open.mockReset().mockResolvedValue(undefined);
    mocks.dbConnection.close.mockReset().mockResolvedValue(undefined);
    mocks.dbConnection.execute.mockReset().mockResolvedValue({ changes: { changes: 1 } });
    mocks.dbConnection.run.mockReset().mockResolvedValue({ changes: { changes: 1, lastId: 1 } });
    mocks.dbConnection.query.mockReset().mockResolvedValue({ values: [] });

    mocks.database.connect.mockReset().mockResolvedValue(mocks.dbConnection);
    mocks.database.persist.mockReset().mockResolvedValue(undefined);

    storedColumnsByKanban = {};
    mocks.columnService.getColumnsByKanbanId
      .mockReset()
      .mockImplementation(async (kanbanId: string) => storedColumnsByKanban[kanbanId] ?? []);
    mocks.columnService.saveColumnsForKanban
      .mockReset()
      .mockImplementation(async (_kanbanId: string, columns: KanbanColumn[]) => columns);

    TestBed.configureTestingModule({
      providers: [
        { provide: DatabaseService, useValue: mocks.database },
        { provide: KanbanColumnService, useValue: mocks.columnService },
      ],
    });
    service = TestBed.inject(KanbanService) as unknown as KanbanServiceContract;
  });

  describe('getAllKanbans', () => {
    it('T2.1 renvoie tous les tableaux, dans l\'ordre donné par la base', async () => {
      mocks.dbConnection.query.mockResolvedValue({ values: [ROW_RECENT, ROW_MIDDLE, ROW_OLDEST] });

      const kanbans = await service.getAllKanbans();
      const ids = kanbans.map((kanban) => kanban.id);

      expect(ids).toEqual(['k-recent', 'k-middle', 'k-oldest']);
    });

    it('T2.2 convertit la ligne en Kanban et n\'expose pas la date de création', async () => {
      const row = dbRow({ id: 'k-1', name: 'Liste de courses', created_at: '2026-09-01 08:00:00', updated_at: '2026-09-28 18:30:00' });
      mocks.dbConnection.query.mockResolvedValue({ values: [row] });

      const kanbans = await service.getAllKanbans();
      const kanban = kanbans[0];
      const expected: Kanban = { id: 'k-1', name: 'Liste de courses', updatedAt: '2026-09-28 18:30:00' };
      const exposesCreationDate = 'created_at' in kanban || 'createdAt' in kanban;

      expect(kanban).toEqual(expected);
      expect(exposesCreationDate).toBe(false);
    });

    it('T2.3 renvoie une liste vide quand la base ne contient aucun tableau', async () => {
      mocks.dbConnection.query.mockResolvedValue({ values: [] });

      const kanbans = await service.getAllKanbans();

      expect(kanbans).toEqual([]);
    });

    /**
     * Groupe 4 of the EDITION_LISTES plan (E28, `D-L8`), sitting here because it bears on this
     * method: the board list displays no column, so this read stays a single query on `kanbans`
     * and its boards come back with **no** `columns` field — « not loaded », where `getKanbanById`
     * hands back « loaded, possibly empty » (T3.3). The boards are given columns on purpose, so
     * that « none was read » cannot pass for « there was none to read ».
     */
    it('T4.9 renvoie les tableaux sans colonnes et ne lit pas la table des colonnes', async () => {
      mocks.dbConnection.query.mockResolvedValue({ values: [ROW_RECENT, ROW_MIDDLE] });
      givenStoredColumns({ 'k-recent': [COLUMN_TODO], 'k-middle': [COLUMN_DOING] });

      const kanbans = await service.getAllKanbans();
      const someBoardCarriesComposition = kanbans.some((kanban) => 'columns' in kanban);

      expect(someBoardCarriesComposition).toBe(false);
      expect(mocks.columnService.getColumnsByKanbanId).not.toHaveBeenCalled();
    });
  });

  /**
   * Single board read, part A of `.agent/KANBAN/EDITION/PLAN_TESTS_KANBAN_EDITION.md` (groupe 1).
   *
   * Beware the numbering: its `T1.x` are NOT the `T1.x` of the CRUD plan, whose groupe 1 covers the
   * table preparation and whose `T1.3` lives in the 'base non préparée' block below. The describe
   * path is what tells the two apart in the test output.
   */
  describe('getKanbanById (plan EDITION, partie A)', () => {
    it('T1.1 renvoie le tableau portant l\'identifiant demandé, converti au modèle', async () => {
      const row = dbRow({
        id: 'k-asked',
        name: 'Travaux maison',
        created_at: '2026-08-15 09:00:00',
        updated_at: '2026-09-25 11:00:00',
      });
      mocks.dbConnection.query.mockResolvedValue({ values: [row] });

      const kanban = await service.getKanbanById('k-asked');
      const expected: Kanban = {
        id: 'k-asked',
        name: 'Travaux maison',
        updatedAt: '2026-09-25 11:00:00',
        columns: [],
      };
      const exposesCreationDate =
        kanban !== null && ('created_at' in kanban || 'createdAt' in kanban);

      expect(kanban).toEqual(expected);
      expect(exposesCreationDate).toBe(false);
    });

    it('T1.2 renvoie null quand aucun tableau ne porte cet identifiant, sans lever d\'erreur', async () => {
      mocks.dbConnection.query.mockResolvedValue({ values: [] });

      const read = service.getKanbanById('k-absent');

      await expect(read).resolves.toBeNull();
    });

    it('T1.3 relance vers l\'appelant l\'erreur de la base comme celle d\'une préparation impossible', async () => {
      mocks.dbConnection.query.mockRejectedValue(new Error('Base indisponible'));
      const readOnFailingDatabase = service.getKanbanById('k-asked');

      mocks.database.connect.mockRejectedValue(new Error('préparation impossible'));
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: DatabaseService, useValue: mocks.database },
          { provide: KanbanColumnService, useValue: mocks.columnService },
        ],
      });
      const unpreparedService = TestBed.inject(KanbanService) as unknown as KanbanServiceContract;
      const readOnUnpreparedDatabase = unpreparedService.getKanbanById('k-asked');

      await expect(readOnFailingDatabase).rejects.toThrow();
      await expect(readOnUnpreparedDatabase).rejects.toThrow();
    });
  });

  /**
   * Groupe 3 — Lire un tableau et ses colonnes (`.agent/KANBAN/EDITION_LISTES/PLAN_TESTS_KANBAN_EDITION_LISTES.md`,
   * §6, `KanbanService`). Covers E21 (the board comes back with its columns, in order), E22 (empty
   * composition), E23 (unknown identifier, no column read) and E57 (read error rethrown), serving US1.
   *
   * Beware the numbering, as in the block above: these `T3.x` belong to the EDITION_LISTES plan and
   * are NOT the `T3.x` of the CRUD plan, which live in the 'createKanban' block below. The describe
   * path is what tells them apart in the test output.
   */
  describe('getKanbanById enrichi (plan EDITION_LISTES, groupe 3)', () => {
    it('T3.1 renvoie le tableau avec ses colonnes, dans l\'ordre de leurs positions', async () => {
      const row = dbRow({ id: 'k-courses', name: 'Courses', updated_at: '2026-11-07 09:00:00' });
      mocks.dbConnection.query.mockResolvedValue({ values: [row] });
      givenStoredColumns({ 'k-courses': [COLUMN_TODO, COLUMN_DOING, COLUMN_DONE] });

      const kanban = await service.getKanbanById('k-courses');
      const loadedColumns = kanban?.columns ?? [];
      const columnNames = loadedColumns.map((column) => column.name);
      const positions = loadedColumns.map((column) => column.position);

      expect(columnNames).toEqual(['À faire', 'En cours', 'Terminé']);
      expect(positions).toEqual([0, 1, 2]);
    });

    it('T3.2 ne renvoie que les colonnes du tableau demandé, alors qu\'un autre tableau en porte d\'autres', async () => {
      const row = dbRow({ id: 'k-courses', name: 'Courses', updated_at: '2026-11-07 09:00:00' });
      mocks.dbConnection.query.mockResolvedValue({ values: [row] });
      givenStoredColumns({
        'k-courses': [COLUMN_TODO, COLUMN_DOING],
        'k-vacances': [COLUMN_VALISES],
      });

      const kanban = await service.getKanbanById('k-courses');
      const loadedColumns = kanban?.columns ?? [];
      const columnIds = loadedColumns.map((column) => column.id);

      expect(columnIds).toEqual(['col-todo', 'col-doing']);
    });

    it('T3.3 renvoie une composition vide pour un tableau sans colonne, et non un champ absent', async () => {
      const row = dbRow({ id: 'k-neuf', name: 'Tableau neuf', updated_at: '2026-11-07 09:00:00' });
      mocks.dbConnection.query.mockResolvedValue({ values: [row] });
      givenStoredColumns({});

      const kanban = await service.getKanbanById('k-neuf');
      const carriesLoadedComposition = kanban !== null && 'columns' in kanban;

      expect(carriesLoadedComposition).toBe(true);
      expect(kanban?.columns).toEqual([]);
    });

    it('T3.4 ne renvoie rien pour un identifiant inexistant, sans demander la moindre colonne', async () => {
      mocks.dbConnection.query.mockResolvedValue({ values: [] });
      givenStoredColumns({ 'k-courses': [COLUMN_TODO, COLUMN_DOING] });

      const read = service.getKanbanById('k-absent');

      await expect(read).resolves.toBeNull();
      expect(mocks.columnService.getColumnsByKanbanId).not.toHaveBeenCalled();
    });

    it('T3.5 relance l\'erreur de lecture du tableau au lieu de la convertir en tableau absent', async () => {
      const boardReadFailure = new Error('lecture du tableau impossible');
      mocks.dbConnection.query.mockRejectedValue(boardReadFailure);

      const read = service.getKanbanById('k-courses');

      await expect(read).rejects.toThrow('lecture du tableau impossible');
    });

    it('T3.6 relance l\'erreur de lecture des colonnes au lieu de la replier sur une composition vide', async () => {
      const row = dbRow({ id: 'k-courses', name: 'Courses', updated_at: '2026-11-07 09:00:00' });
      mocks.dbConnection.query.mockResolvedValue({ values: [row] });
      const columnsReadFailure = new Error('lecture des colonnes impossible');
      mocks.columnService.getColumnsByKanbanId.mockRejectedValue(columnsReadFailure);

      const read = service.getKanbanById('k-courses');

      await expect(read).rejects.toThrow('lecture des colonnes impossible');
    });
  });

  /**
   * Groupe 4 — Enregistrer un tableau et sa composition (`.agent/KANBAN/EDITION_LISTES/PLAN_TESTS_KANBAN_EDITION_LISTES.md`,
   * §6, `KanbanService`). Covers E24 (new board created then its columns), E25 (existing board
   * renamed, redated, then its columns), E26 (a failing board write throws and writes no column),
   * E27 (a failing column write does not throw, `D-L24`) and E28 (`getAllKanbans` carries no
   * column), serving US6 and US7.
   *
   * Beware the numbering once more: these `T4.x` belong to the EDITION_LISTES plan, not to the
   * `T4.x` of the CRUD plan living in the 'renameKanban' block below.
   */
  describe('saveKanbanWithColumns (plan EDITION_LISTES, groupe 4)', () => {
    it('T4.1 crée le tableau neuf, puis enregistre ses colonnes sous l\'identifiant créé', async () => {
      const askedComposition = [COLUMN_TODO, COLUMN_DOING];

      const result = await service.saveKanbanWithColumns(null, 'Courses', askedComposition);
      const savedBoardId = result.kanban.id;
      const columnSaveCall = mocks.columnService.saveColumnsForKanban.mock.calls[0];
      const columnsOwnerId = columnSaveCall[0];
      const savedComposition = columnSaveCall[1];

      expect(savedBoardId).toBeTruthy();
      expect(result.kanban.name).toBe('Courses');
      expect(columnsOwnerId).toBe(savedBoardId);
      expect(savedComposition).toEqual(askedComposition);
      expect(result.columnsSaved).toBe(true);
    });

    it('T4.2 crée le tableau neuf sans colonne en transmettant la composition vide, sans autre écriture', async () => {
      const emptyComposition: KanbanColumn[] = [];

      const result = await service.saveKanbanWithColumns(null, 'Tableau neuf', emptyComposition);
      const columnSaveCall = mocks.columnService.saveColumnsForKanban.mock.calls[0];
      const columnsOwnerId = columnSaveCall[0];
      const savedComposition = columnSaveCall[1];
      const boardWriteCount = mocks.dbConnection.run.mock.calls.length;

      expect(columnsOwnerId).toBe(result.kanban.id);
      expect(savedComposition).toEqual([]);
      expect(result.columnsSaved).toBe(true);
      expect(boardWriteCount).toBe(1);
    });

    it('T4.3 renomme et redate le tableau existant, puis enregistre ses colonnes sous son identifiant', async () => {
      const askedComposition = [COLUMN_TODO, COLUMN_DOING];
      const instantBeforeSave = new Date().toISOString();

      const result = await service.saveKanbanWithColumns('k-courses', 'Courses du samedi', askedComposition);
      const columnSaveCall = mocks.columnService.saveColumnsForKanban.mock.calls[0];
      const columnsOwnerId = columnSaveCall[0];
      const isRefreshed = result.kanban.updatedAt >= instantBeforeSave;

      expect(result.kanban.id).toBe('k-courses');
      expect(result.kanban.name).toBe('Courses du samedi');
      expect(isRefreshed).toBe(true);
      expect(columnsOwnerId).toBe('k-courses');
    });

    it('T4.4 laisse la composition inchangée telle quelle, en redatant quand même le tableau', async () => {
      const storedComposition = [COLUMN_TODO, COLUMN_DOING];
      givenStoredColumns({ 'k-courses': storedComposition });
      const unchangedComposition = [COLUMN_TODO, COLUMN_DOING];
      const instantBeforeSave = new Date().toISOString();

      const result = await service.saveKanbanWithColumns('k-courses', 'Courses', unchangedComposition);
      const columnSaveCall = mocks.columnService.saveColumnsForKanban.mock.calls[0];
      const savedComposition = columnSaveCall[1];
      const isRefreshed = result.kanban.updatedAt >= instantBeforeSave;

      expect(savedComposition).toEqual(storedComposition);
      expect(result.kanban.columns).toEqual(storedComposition);
      expect(isRefreshed).toBe(true);
    });

    it('T4.5 jette quand la création du tableau échoue, sans tenter la moindre écriture de colonnes', async () => {
      const creationFailure = new Error('création impossible');
      mocks.dbConnection.run.mockRejectedValue(creationFailure);
      const askedComposition = [COLUMN_TODO, COLUMN_DOING];

      const save = service.saveKanbanWithColumns(null, 'Courses', askedComposition);

      await expect(save).rejects.toThrow('création impossible');
      expect(mocks.columnService.saveColumnsForKanban).not.toHaveBeenCalled();
    });

    it('T4.6 jette quand le renommage du tableau échoue, sans tenter la moindre écriture de colonnes', async () => {
      const renameFailure = new Error('renommage impossible');
      mocks.dbConnection.run.mockRejectedValue(renameFailure);
      const askedComposition = [COLUMN_TODO, COLUMN_DOING];

      const save = service.saveKanbanWithColumns('k-courses', 'Courses du samedi', askedComposition);

      await expect(save).rejects.toThrow('renommage impossible');
      expect(mocks.columnService.saveColumnsForKanban).not.toHaveBeenCalled();
    });

    it('T4.7 ne jette pas quand les colonnes échouent après un renommage, et renvoie le tableau avec « colonnes non enregistrées »', async () => {
      const columnsWriteFailure = new Error('écriture des colonnes impossible');
      mocks.columnService.saveColumnsForKanban.mockRejectedValue(columnsWriteFailure);
      const askedComposition = [COLUMN_TODO, COLUMN_DOING];

      const result = await service.saveKanbanWithColumns('k-courses', 'Courses du samedi', askedComposition);

      expect(result.kanban.id).toBe('k-courses');
      expect(result.kanban.name).toBe('Courses du samedi');
      expect(result.columnsSaved).toBe(false);
    });

    it('T4.8 renvoie le tableau créé avec son identifiant quand les colonnes échouent, pour qu\'un ré-essai ne duplique pas', async () => {
      const columnsWriteFailure = new Error('écriture des colonnes impossible');
      mocks.columnService.saveColumnsForKanban.mockRejectedValue(columnsWriteFailure);
      const askedComposition = [COLUMN_TODO, COLUMN_DOING];

      const result = await service.saveKanbanWithColumns(null, 'Courses', askedComposition);
      const columnSaveCall = mocks.columnService.saveColumnsForKanban.mock.calls[0];
      const attemptedOwnerId = columnSaveCall[0];

      expect(result.kanban.id).toBeTruthy();
      expect(attemptedOwnerId).toBe(result.kanban.id);
      expect(result.columnsSaved).toBe(false);
    });
  });

  describe('createKanban', () => {
    it('T3.2 renvoie le tableau créé avec le nom nettoyé, un identifiant et une date de modification', async () => {
      const created = await service.createKanban('  Vacances d\'été  ');

      expect(created.name).toBe('Vacances d\'été');
      expect(created.id).toBeTruthy();
      expect(created.updatedAt).toBeTruthy();
    });

    it('T3.3 sauvegarde la base après avoir enregistré le tableau', async () => {
      await service.createKanban('Courses');

      const writeOrder = mocks.dbConnection.run.mock.invocationCallOrder[0];
      const persistOrder = mocks.database.persist.mock.invocationCallOrder[0];

      expect(mocks.database.persist).toHaveBeenCalledTimes(1);
      expect(persistOrder).toBeGreaterThan(writeOrder);
    });

    it('T3.4 refuse un nom vide ou composé uniquement d\'espaces, sans rien écrire en base', async () => {
      const emptyName = service.createKanban('');
      const blankName = service.createKanban('   ');

      await expect(emptyName).rejects.toThrow();
      await expect(blankName).rejects.toThrow();
      expect(mocks.dbConnection.run).not.toHaveBeenCalled();
      expect(mocks.database.persist).not.toHaveBeenCalled();
    });

    it('T3.5 accepte deux tableaux portant le même nom', async () => {
      const first = await service.createKanban('Courses');
      const second = await service.createKanban('Courses');

      expect(first.name).toBe('Courses');
      expect(second.name).toBe('Courses');
      expect(second.id).not.toBe(first.id);
      expect(mocks.dbConnection.run).toHaveBeenCalledTimes(2);
    });
  });

  describe('renameKanban', () => {
    it('T4.1 renvoie le tableau visé à jour, avec le nom nettoyé et une date de modification', async () => {
      const renamed = await service.renameKanban('k-middle', '  Travaux du  garage  ');

      expect(renamed.id).toBe('k-middle');
      expect(renamed.name).toBe('Travaux du  garage');
      expect(renamed.updatedAt).toBeTruthy();
    });

    it('T4.2 refuse un nom vide ou composé uniquement d\'espaces, sans rien écrire en base', async () => {
      const emptyName = service.renameKanban('k-middle', '');
      const blankName = service.renameKanban('k-middle', '   ');

      await expect(emptyName).rejects.toThrow();
      await expect(blankName).rejects.toThrow();
      expect(mocks.dbConnection.run).not.toHaveBeenCalled();
      expect(mocks.database.persist).not.toHaveBeenCalled();
    });

    it('T4.3 rejette le renommage avec « Kanban introuvable » quand aucune ligne n\'est modifiée', async () => {
      mocks.dbConnection.run.mockResolvedValue({ changes: { changes: 0 } });

      const rename = service.renameKanban('k-disparu', 'Nouveau nom');

      await expect(rename).rejects.toThrow('Kanban introuvable');
    });

    it('T4.4 sauvegarde la base après avoir renommé le tableau', async () => {
      await service.renameKanban('k-middle', 'Travaux du garage');

      const writeOrder = mocks.dbConnection.run.mock.invocationCallOrder[0];
      const persistOrder = mocks.database.persist.mock.invocationCallOrder[0];

      expect(mocks.database.persist).toHaveBeenCalledTimes(1);
      expect(persistOrder).toBeGreaterThan(writeOrder);
    });
  });

  describe('deleteKanban', () => {
    it('T5.1 supprime le tableau puis sauvegarde la base', async () => {
      const deletion = service.deleteKanban('k-middle');

      await expect(deletion).resolves.toBeUndefined();

      const writeOrder = mocks.dbConnection.run.mock.invocationCallOrder[0];
      const persistOrder = mocks.database.persist.mock.invocationCallOrder[0];

      expect(mocks.dbConnection.run).toHaveBeenCalledTimes(1);
      expect(persistOrder).toBeGreaterThan(writeOrder);
    });

    it('T5.2 ne signale pas d\'erreur quand l\'identifiant n\'existe pas', async () => {
      mocks.dbConnection.run.mockResolvedValue({ changes: { changes: 0 } });

      const deletion = service.deleteKanban('k-inexistant');

      await expect(deletion).resolves.toBeUndefined();
    });
  });

  describe('base non préparée', () => {
    it('T1.3 rejette la lecture comme les écritures quand la base n\'a pas pu être préparée', async () => {
      mocks.database.connect.mockRejectedValue(new Error('préparation impossible'));
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: DatabaseService, useValue: mocks.database },
          { provide: KanbanColumnService, useValue: mocks.columnService },
        ],
      });
      const failingService = TestBed.inject(KanbanService) as unknown as KanbanServiceContract;

      const read = failingService.getAllKanbans();
      const creation = failingService.createKanban('Courses');
      const rename = failingService.renameKanban('k-middle', 'Courses');
      const deletion = failingService.deleteKanban('k-middle');

      await expect(read).rejects.toThrow();
      await expect(creation).rejects.toThrow();
      await expect(rename).rejects.toThrow();
      await expect(deletion).rejects.toThrow();
    });
  });
});

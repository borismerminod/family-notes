import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { KanbanService } from './kanban-service';
import { DatabaseService } from './database.service';
import { Kanban } from '../models';

/** Contrat CIBLE du service (TDD) — `.agent/KANBAN/CRUD/PLAN_TESTS_KANBAN_CRUD.md`, partie A. */
interface KanbanServiceContract {
  getAllKanbans(): Promise<Kanban[]>;
  createKanban(name: string): Promise<Kanban>;
  renameKanban(id: string, name: string): Promise<Kanban>;
  deleteKanban(id: string): Promise<void>;
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

    TestBed.configureTestingModule({
      providers: [{ provide: DatabaseService, useValue: mocks.database }],
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
        providers: [{ provide: DatabaseService, useValue: mocks.database }],
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

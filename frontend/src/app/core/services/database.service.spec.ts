import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { DatabaseService } from './database.service';
import { SchemaMigrationService } from './schema-migration.service';

describe('DatabaseService', () => {
  let service: DatabaseService;
  let migrations: { migrate: ReturnType<typeof vi.fn> };
  let db: { open: ReturnType<typeof vi.fn> };
  let sqlite: {
    isDatabase: ReturnType<typeof vi.fn>;
    copyFromAssets: ReturnType<typeof vi.fn>;
    createConnection: ReturnType<typeof vi.fn>;
    initWebStore: ReturnType<typeof vi.fn>;
    saveToStore: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Le composant web `jeep-sqlite` n'existe pas dans l'environnement de test.
    vi.spyOn(customElements, 'whenDefined').mockResolvedValue(undefined as never);

    migrations = { migrate: vi.fn().mockResolvedValue(false) };
    db = { open: vi.fn().mockResolvedValue(undefined) };
    sqlite = {
      isDatabase: vi.fn().mockResolvedValue({ result: true }),
      copyFromAssets: vi.fn().mockResolvedValue(undefined),
      createConnection: vi.fn().mockResolvedValue(db),
      initWebStore: vi.fn().mockResolvedValue(undefined),
      saveToStore: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SchemaMigrationService, useValue: migrations }],
    });
    service = TestBed.inject(DatabaseService);
    // La fabrique de connexions du plugin est privée : on la remplace par sa doublure.
    Object.assign(service as unknown as Record<string, unknown>, { sqlite });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('est instanciable', () => {
    expect(service).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // C1 — ouverture de la base
  // -------------------------------------------------------------------------
  describe('connect', () => {
    it('copie le seed des assets quand la base n’existe pas encore', async () => {
      sqlite.isDatabase.mockResolvedValue({ result: false });

      await service.connect();

      expect(sqlite.copyFromAssets).toHaveBeenCalled();
      expect(db.open).toHaveBeenCalled();
    });

    it('ne recopie pas le seed sur une base déjà installée', async () => {
      await service.connect();

      expect(sqlite.copyFromAssets).not.toHaveBeenCalled();
    });

    it('met le schéma à jour à l’ouverture', async () => {
      await service.connect();

      expect(migrations.migrate).toHaveBeenCalledWith(db);
    });

    it('flushe le web store quand la migration a modifié le schéma', async () => {
      migrations.migrate.mockResolvedValue(true);

      await service.connect();

      expect(sqlite.saveToStore).toHaveBeenCalledWith('family_notes');
    });

    it('ne flushe rien quand la base était déjà à jour', async () => {
      await service.connect();

      expect(sqlite.saveToStore).not.toHaveBeenCalled();
    });

    it('n’ouvre la base qu’une fois, quel que soit le nombre d’appelants', async () => {
      const [first, second] = await Promise.all([service.connect(), service.connect()]);
      const third = await service.connect();

      expect(sqlite.createConnection).toHaveBeenCalledTimes(1);
      expect(migrations.migrate).toHaveBeenCalledTimes(1);
      expect(first).toBe(second);
      expect(third).toBe(first);
    });
  });

  // -------------------------------------------------------------------------
  // C2 — persistance
  // -------------------------------------------------------------------------
  describe('persist', () => {
    it('enregistre la base dans le web store', async () => {
      await service.persist();

      expect(sqlite.saveToStore).toHaveBeenCalledWith('family_notes');
    });
  });
});

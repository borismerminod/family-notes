import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { SqliteService } from './sqlite-service';
import { DatabaseService } from './database.service';

describe('SqliteService', () => {
  /** Sous-classe de test : expose les briques protégées offertes aux sources de données. */
  class TestSqliteService extends SqliteService {
    connection(): unknown {
      return this.db;
    }

    query<T>(message: string, operation: () => Promise<T>): Promise<T> {
      return this.runQuery(message, operation);
    }

    flush(): Promise<void> {
      return this.persist();
    }
  }

  let database: { connect: ReturnType<typeof vi.fn>; persist: ReturnType<typeof vi.fn> };
  let db: object;

  function createService(): TestSqliteService {
    TestBed.configureTestingModule({
      providers: [{ provide: DatabaseService, useValue: database }],
    });
    return TestBed.runInInjectionContext(() => new TestSqliteService());
  }

  beforeEach(() => {
    db = { query: vi.fn() };
    database = {
      connect: vi.fn().mockResolvedValue(db),
      persist: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('should be created', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: DatabaseService, useValue: database }],
    });
    expect(TestBed.inject(SqliteService)).toBeTruthy();
  });

  it('reprend la connexion partagée ouverte par DatabaseService', async () => {
    const service = createService();

    await service.query('peu importe', async () => undefined);

    expect(database.connect).toHaveBeenCalled();
    expect(service.connection()).toBe(db);
  });

  it('n’exécute une requête qu’une fois la connexion prête', async () => {
    let openDatabase!: (db: object) => void;
    database.connect.mockReturnValue(new Promise((resolve) => (openDatabase = resolve)));
    const service = createService();
    const operation = vi.fn().mockResolvedValue('ok');

    const result = service.query('peu importe', operation);
    expect(operation).not.toHaveBeenCalled();

    openDatabase(db);
    await expect(result).resolves.toBe('ok');
  });

  it('journalise et remonte l’échec d’une requête', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = createService();

    await expect(
      service.query('Erreur de test', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(logged).toHaveBeenCalledWith('Erreur de test', expect.any(Error));

    logged.mockRestore();
  });

  it('délègue le flush du store à DatabaseService', async () => {
    const service = createService();

    await service.flush();

    expect(database.persist).toHaveBeenCalled();
  });
});

import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';

import { SchemaMigrationService } from './schema-migration.service';

/** Colonnes renvoyées par `PRAGMA table_info('notes')` pour un schéma donné. */
function columns(...names: string[]): { values: { name: string }[] } {
  return { values: names.map((name) => ({ name })) };
}

/** Ancien schéma : la catégorie est un simple texte sur la note. */
const LEGACY_NOTES_COLUMNS = columns('id', 'title', 'content', 'category', 'updated_at');
/** Schéma courant : la note référence `categories(id)`. */
const MIGRATED_NOTES_COLUMNS = columns('id', 'title', 'content', 'category_id', 'updated_at');

describe('SchemaMigrationService', () => {
  let service: SchemaMigrationService;
  let db: { isTable: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn>; execute: ReturnType<typeof vi.fn> };
  let fetchMock: ReturnType<typeof vi.fn>;

  /** Connexion doublée, passée à `migrate`. */
  function connection(): SQLiteDBConnection {
    return db as unknown as SQLiteDBConnection;
  }

  /** Noms des scripts chargés depuis les assets, dans l'ordre. */
  function loadedScripts(): string[] {
    return fetchMock.mock.calls.map((call) => String(call[0]).split('/').pop() as string);
  }

  beforeEach(() => {
    db = {
      isTable: vi.fn().mockResolvedValue({ result: false }),
      query: vi.fn().mockResolvedValue({ values: [] }),
      execute: vi.fn().mockResolvedValue({ changes: { changes: 1 } }),
    };

    // Les scripts SQL vivent dans les assets (frontend/public/assets/migrations) : on double
    // leur chargement, le contenu exact étant celui des fichiers livrés.
    fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '-- sql' });
    vi.stubGlobal('fetch', fetchMock);

    TestBed.configureTestingModule({});
    service = TestBed.inject(SchemaMigrationService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('est instanciable', () => {
    expect(service).toBeTruthy();
  });

  it('ne touche à rien quand la table `categories` existe déjà', async () => {
    db.isTable.mockResolvedValue({ result: true });

    await expect(service.migrate(connection())).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('joue la migration relationnelle sur une base restée à l’ancien format', async () => {
    db.query.mockResolvedValue(LEGACY_NOTES_COLUMNS);

    await expect(service.migrate(connection())).resolves.toBe(true);

    expect(loadedScripts()).toEqual(['migration_relational_categories.sql']);
    expect(db.execute).toHaveBeenCalledWith('-- sql');
  });

  it('crée le schéma courant quand la base est vide', async () => {
    db.query.mockResolvedValue({ values: [] });

    await expect(service.migrate(connection())).resolves.toBe(true);

    expect(loadedScripts()).toEqual(['schema_notes.sql']);
  });

  it('crée les catégories seules quand les notes sont déjà relationnelles', async () => {
    db.query.mockResolvedValue(MIGRATED_NOTES_COLUMNS);

    await expect(service.migrate(connection())).resolves.toBe(true);

    expect(loadedScripts()).toEqual(['schema_categories.sql']);
    // La colonne existe déjà : pas d'ALTER TABLE.
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('ajoute `category_id` aux notes qui n’ont ni l’ancienne ni la nouvelle colonne', async () => {
    db.query.mockResolvedValue(columns('id', 'title', 'content', 'updated_at'));

    await expect(service.migrate(connection())).resolves.toBe(true);

    expect(loadedScripts()).toEqual(['schema_categories.sql']);
    const statements = db.execute.mock.calls.map((call) => String(call[0]));
    expect(statements.some((sql) => sql.includes('ADD COLUMN category_id'))).toBe(true);
  });

  it('remonte une erreur explicite quand un script est introuvable', async () => {
    db.query.mockResolvedValue(LEGACY_NOTES_COLUMNS);
    fetchMock.mockResolvedValue({ ok: false, text: async () => '' });

    await expect(service.migrate(connection())).rejects.toThrow(
      'Script de migration introuvable : assets/migrations/migration_relational_categories.sql',
    );
  });
});

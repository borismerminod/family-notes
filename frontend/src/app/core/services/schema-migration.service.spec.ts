import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';

import { SchemaMigrationService } from './schema-migration.service';

/** Columns returned by `PRAGMA table_info('notes')` for a given schema. */
function columns(...names: string[]): { values: { name: string }[] } {
  return { values: names.map((name) => ({ name })) };
}

/** Legacy schema: the category is plain text carried by the note. */
const LEGACY_NOTES_COLUMNS = columns('id', 'title', 'content', 'category', 'updated_at');
/** Current schema: the note references `categories(id)`. */
const MIGRATED_NOTES_COLUMNS = columns('id', 'title', 'content', 'category_id', 'updated_at');

/** Tables a fully up-to-date database holds (one per migration step). */
const EVERY_TABLE = ['categories', 'kanbans', 'kanban_columns'];
/** What a fresh install gets from the binary seed, which carries no `kanban_columns` (D-L15). */
const SEEDED_TABLES = ['categories', 'kanbans'];

describe('SchemaMigrationService', () => {
  let service: SchemaMigrationService;
  let db: { isTable: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn>; execute: ReturnType<typeof vi.fn> };
  let fetchMock: ReturnType<typeof vi.fn>;

  /** Doubled connection, passed to `migrate`. */
  function connection(): SQLiteDBConnection {
    return db as unknown as SQLiteDBConnection;
  }

  /** Declares which tables the database already holds; every other one is reported missing. */
  function tablesInPlace(...names: string[]): void {
    db.isTable.mockImplementation(async (table: string) => ({ result: names.includes(table) }));
  }

  /** Names of the scripts loaded from the assets, in order. */
  function loadedScripts(): string[] {
    return fetchMock.mock.calls.map((call) => String(call[0]).split('/').pop() as string);
  }

  beforeEach(() => {
    db = {
      isTable: vi.fn().mockResolvedValue({ result: false }),
      query: vi.fn().mockResolvedValue({ values: [] }),
      execute: vi.fn().mockResolvedValue({ changes: { changes: 1 } }),
    };

    // The SQL scripts live in the assets (frontend/public/assets/migrations): their loading is
    // doubled here, the exact content being the one of the shipped files.
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

  it('ne touche à rien quand les trois étapes sont déjà en place', async () => {
    tablesInPlace(...EVERY_TABLE);

    await expect(service.migrate(connection())).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('joue la migration relationnelle puis les tables kanban sur une base restée à l’ancien format', async () => {
    db.query.mockResolvedValue(LEGACY_NOTES_COLUMNS);

    await expect(service.migrate(connection())).resolves.toBe(true);

    expect(loadedScripts()).toEqual([
      'migration_relational_categories.sql',
      'schema_kanban.sql',
      'schema_kanban_columns.sql',
    ]);
  });

  it('crée le schéma courant et les tables kanban quand la base est vide', async () => {
    db.query.mockResolvedValue({ values: [] });

    await expect(service.migrate(connection())).resolves.toBe(true);

    expect(loadedScripts()).toEqual([
      'schema_notes.sql',
      'schema_kanban.sql',
      'schema_kanban_columns.sql',
    ]);
  });

  it('crée les catégories seules quand les notes sont déjà relationnelles', async () => {
    db.query.mockResolvedValue(MIGRATED_NOTES_COLUMNS);

    await expect(service.migrate(connection())).resolves.toBe(true);

    expect(loadedScripts()).toEqual([
      'schema_categories.sql',
      'schema_kanban.sql',
      'schema_kanban_columns.sql',
    ]);
  });

  it('ajoute `category_id` aux notes qui n’ont ni l’ancienne ni la nouvelle colonne', async () => {
    db.query.mockResolvedValue(columns('id', 'title', 'content', 'updated_at'));

    await expect(service.migrate(connection())).resolves.toBe(true);

    const statements = db.execute.mock.calls.map((call) => String(call[0]));
    const addsTheColumn = statements.some((sql) => sql.includes('ADD COLUMN category_id'));
    expect(addsTheColumn).toBe(true);
  });

  it('crée la table des tableaux sur une base installée avant le lot kanban', async () => {
    tablesInPlace('categories');

    await expect(service.migrate(connection())).resolves.toBe(true);

    expect(loadedScripts()).toEqual(['schema_kanban.sql', 'schema_kanban_columns.sql']);
  });

  it('crée la seule table des colonnes sur une installation neuve issue du seed', async () => {
    tablesInPlace(...SEEDED_TABLES);

    await expect(service.migrate(connection())).resolves.toBe(true);

    expect(loadedScripts()).toEqual(['schema_kanban_columns.sql']);
  });

  it('ne rejoue pas une étape dont la table existe déjà', async () => {
    tablesInPlace('kanbans', 'kanban_columns');
    db.query.mockResolvedValue(LEGACY_NOTES_COLUMNS);

    await expect(service.migrate(connection())).resolves.toBe(true);

    expect(loadedScripts()).toEqual(['migration_relational_categories.sql']);
  });

  it('remonte une erreur explicite quand un script est introuvable', async () => {
    db.query.mockResolvedValue(LEGACY_NOTES_COLUMNS);
    fetchMock.mockResolvedValue({ ok: false, text: async () => '' });

    await expect(service.migrate(connection())).rejects.toThrow(
      'Script de migration introuvable : assets/migrations/migration_relational_categories.sql',
    );
  });
});

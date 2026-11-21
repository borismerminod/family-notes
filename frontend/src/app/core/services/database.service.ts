import { Injectable, inject } from '@angular/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { SchemaMigrationService } from './schema-migration.service';

/**
 * Owner of the `family_notes` database: it bootstraps the web store on the web platform, copies
 * the seed database from the assets on first run, opens the one connection the whole application
 * shares, brings its schema up to date (see {@link SchemaMigrationService}) and flushes the web
 * store after a write.
 *
 * Being a single `providedIn: 'root'` service matters: the data sources (NotesService,
 * CategoriesService, CalendarService) are independent singletons, and each bootstrapping the
 * database on its own would copy the seed concurrently — the second copy fails with
 * `cannot overwrite` — and replay the schema migration. Holding that work here, behind
 * {@link connect}, gives one bootstrap per injector: one for the application, and a clean one per
 * `TestBed` (a spec stubs this service instead of the Capacitor plugin).
 */
@Injectable({
  providedIn: 'root',
})
export class DatabaseService {
  /** Schema upgrade of an already installed database, applied once the connection is open. */
  private readonly migrations = inject(SchemaMigrationService);
  /** Capacitor SQLite connection factory used to create the database connection. */
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  /** Name of the SQLite database shared by every data source. */
  private readonly DB_NAME = 'family_notes';
  /** True on the web platform, where the store must be bootstrapped and flushed by hand. */
  private readonly isWeb = Capacitor.getPlatform() === 'web';
  /**
   * Seed database fetched on the web platform. The URL is relative so that it resolves against the
   * `<base href>`: on GitHub Pages the application lives under `/family-notes/`, where the
   * `/assets/databases/` path hard-coded by `copyFromAssets` does not exist.
   */
  private readonly WEB_SEED_URL = 'assets/databases/family_notesSQLite.db';
  /**
   * Folder of `sql-wasm.wasm`, relative to the `<base href>` for the same reason: `jeep-sqlite`
   * defaults it to the absolute `/assets`.
   */
  private readonly WEB_WASM_PATH = 'assets';

  /** Opening of the shared connection, started by the first caller of {@link connect}. */
  private opening: Promise<SQLiteDBConnection> | null = null;

  /**
   * Returns the connection shared by every data source, opening the database on the first call.
   * @returns A promise resolving to the open, migrated connection.
   */
  connect(): Promise<SQLiteDBConnection> {
    if (!this.opening) {
      this.opening = this.open();
    }
    return this.opening;
  }

  /**
   * Flushes the in-memory database to the web store after a write. No-op on native platforms,
   * where writes are already durable.
   * @returns A promise that resolves once the store has been saved (or immediately on native).
   */
  async persist(): Promise<void> {
    if (this.isWeb) {
      await this.sqlite.saveToStore(this.DB_NAME);
    }
  }

  /**
   * Opens the database once for the whole application: on the web the store is bootstrapped first,
   * the seed database is copied from the assets on first run, then the connection is created and
   * opened, referential integrity is turned on (see {@link enableForeignKeys}) and the schema is
   * brought up to date.
   * @returns A promise resolving to the open connection.
   */
  private async open(): Promise<SQLiteDBConnection> {
    if (this.isWeb) {
      await this.initializeWebStore();
    }

    const alreadyExists = (await this.sqlite.isDatabase(this.DB_NAME)).result;
    if (!alreadyExists) {
      await this.copySeedDatabase();
    }

    const db = await this.sqlite.createConnection(this.DB_NAME, false, 'no-encryption', 1, false);
    await db.open();
    await this.enableForeignKeys(db);

    if (await this.migrations.migrate(db)) {
      await this.persist();
      console.log('Schéma de la base mis à jour');
    }

    console.log('Base de données initialisée avec succès');
    return db;
  }

  /**
   * Installs the seed database on first run. Android reads it from the native assets with
   * `copyFromAssets`. The web platform fetches it with `getFromHTTPRequest` and the relative
   * {@link WEB_SEED_URL}, because `copyFromAssets` reads an absolute `/assets/databases/` path that
   * breaks as soon as the application is served from a sub-folder; both store it under the same
   * `family_notesSQLite.db` name.
   * @returns A promise that resolves once the seed database has been copied.
   */
  private async copySeedDatabase(): Promise<void> {
    if (this.isWeb) {
      await this.sqlite.getFromHTTPRequest(this.WEB_SEED_URL, false);
    } else {
      await this.sqlite.copyFromAssets(false);
    }
  }

  /**
   * Turns referential integrity on for the shared connection. SQLite defaults `foreign_keys` to
   * off, and while it is off the engine silently ignores every declared action: the
   * `ON DELETE CASCADE` of `kanban_columns.kanban_id` would leave a deleted board's columns
   * behind, and the `ON DELETE SET NULL` of `notes.category_id` would leave notes pointing at a
   * category that no longer exists (see
   * .agent/KANBAN/EDITION_LISTES/APPROCHE_KANBAN_EDITION_LISTES.md, D-L14).
   *
   * Two constraints dictate where this call sits. The pragma is scoped to the connection, so it
   * belongs to {@link open} rather than to any data source; and SQLite ignores it inside a
   * transaction, so it is posed before the migration — whose scripts run in one — and executed
   * with `transaction: false`, the plugin wrapping `execute` in a transaction by default.
   * @param db The freshly opened connection to configure.
   * @returns A promise that resolves once the pragma has been posed.
   */
  private async enableForeignKeys(db: SQLiteDBConnection): Promise<void> {
    await db.execute('PRAGMA foreign_keys = ON', false);
  }

  /**
   * Bootstraps the `jeep-sqlite` web component and the SQLite web store (web platform only): it
   * ensures the custom element is defined, points it at the relative {@link WEB_WASM_PATH} and
   * attaches it to the DOM, waits for it to be ready, then initialises the persistent web store.
   * @returns A promise that resolves once the web store is ready to use.
   */
  private async initializeWebStore(): Promise<void> {
    await customElements.whenDefined('jeep-sqlite');
    const jeepEl: any =
      document.querySelector('jeep-sqlite') ?? document.createElement('jeep-sqlite');
    jeepEl.setAttribute('wasmpath', this.WEB_WASM_PATH);
    if (!jeepEl.isConnected) {
      document.body.appendChild(jeepEl);
    }

    if (typeof jeepEl.componentOnReady === 'function') {
      await jeepEl.componentOnReady();
    }
    await this.sqlite.initWebStore();
  }
}

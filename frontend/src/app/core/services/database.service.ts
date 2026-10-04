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
   * opened and the schema is brought up to date.
   * @returns A promise resolving to the open connection.
   */
  private async open(): Promise<SQLiteDBConnection> {
    if (this.isWeb) {
      await this.initializeWebStore();
    }

    const alreadyExists = (await this.sqlite.isDatabase(this.DB_NAME)).result;
    if (!alreadyExists) {
      await this.sqlite.copyFromAssets(false);
    }

    const db = await this.sqlite.createConnection(this.DB_NAME, false, 'no-encryption', 1, false);
    await db.open();

    if (await this.migrations.migrate(db)) {
      await this.persist();
      console.log('Schéma mis à jour : table `categories` et `notes.category_id`');
    }

    console.log('Base de données initialisée avec succès');
    return db;
  }

  /**
   * Bootstraps the `jeep-sqlite` web component and the SQLite web store (web platform only): it
   * ensures the custom element is defined and attached to the DOM, waits for it to be ready, then
   * initialises the persistent web store.
   * @returns A promise that resolves once the web store is ready to use.
   */
  private async initializeWebStore(): Promise<void> {
    await customElements.whenDefined('jeep-sqlite');
    const jeepEl: any =
      document.querySelector('jeep-sqlite') ?? document.createElement('jeep-sqlite');
    if (!jeepEl.isConnected) {
      document.body.appendChild(jeepEl);
    }

    if (typeof jeepEl.componentOnReady === 'function') {
      await jeepEl.componentOnReady();
    }
    await this.sqlite.initWebStore();
  }
}

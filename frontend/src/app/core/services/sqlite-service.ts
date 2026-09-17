import { Injectable } from '@angular/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

/**
 * Base class for every SQLite-backed data source in the app. It owns the shared connection
 * lifecycle — opening the `family_notes` database, bootstrapping the web store on the web platform
 * and copying the seed database from the assets on first run — and exposes the reusable building
 * blocks its subclasses rely on: the {@link ready} guard, the {@link runQuery} wrapper and the
 * {@link persist} flush. Subclasses (NotesService, CalendarService) layer the table-specific
 * queries on top.
 */
@Injectable({
  providedIn: 'root',
})
export class SqliteService {
  /** Capacitor SQLite connection factory used to create the database connection. */
  protected sqlite: SQLiteConnection;
  /** Open connection to the `family_notes` database; assigned once initialisation completes. */
  protected db!: SQLiteDBConnection;
  /** Name of the SQLite database shared by every subclass. */
  protected readonly DB_NAME = 'family_notes';
  /** True on the web platform, where the store must be bootstrapped and flushed by hand. */
  protected readonly isWeb = Capacitor.getPlatform() === 'web';

  /**
   * Resolves once the database is open. Every query awaits it (see {@link runQuery}) so callers
   * never touch {@link db} before initialisation has finished.
   */
  protected ready: Promise<void>;

  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
    this.ready = this.initializeDatabase();
  }

  /**
   * Opens the database and its connection: on the web the store is bootstrapped first, the seed
   * database is copied from the assets on first run, then the connection is created and opened.
   * @returns A promise that resolves once the connection is open, or rejects on failure.
   */
  protected async initializeDatabase(): Promise<void> {
    try {
      if (this.isWeb) {
        await this.initializeWebStore();
      }

      const alreadyExists = (await this.sqlite.isDatabase(this.DB_NAME)).result;
      if (!alreadyExists) {
        await this.sqlite.copyFromAssets(false);
      }

      this.db = await this.sqlite.createConnection(this.DB_NAME, false, 'no-encryption', 1, false);
      await this.db.open();

      console.log('Base de données initialisée avec succès');
    } catch (err) {
      console.error('Erreur lors de l\'initialisation de la base de données', err);
      throw err;
    }
  }

  /**
   * Bootstraps the `jeep-sqlite` web component and the SQLite web store (web platform only): it
   * ensures the custom element is defined and attached to the DOM, waits for it to be ready, then
   * initialises the persistent web store.
   * @returns A promise that resolves once the web store is ready to use.
   */
  protected async initializeWebStore(): Promise<void> {
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

  /**
   * Runs a database operation once the connection is ready, centralising the shared guard and
   * error handling: it awaits {@link ready}, logs any failure with the given message and rethrows
   * so callers can react to it.
   * @param errorMessage The message logged when the operation throws.
   * @param operation The database work to execute against the ready connection.
   * @returns A promise resolving to the operation result.
   */
  protected async runQuery<T>(errorMessage: string, operation: () => Promise<T>): Promise<T> {
    try {
      await this.ready;
      return await operation();
    } catch (err) {
      console.error(errorMessage, err);
      throw err;
    }
  }

  /**
   * Flushes the in-memory database to the web store after a write. No-op on native platforms,
   * where writes are already durable.
   * @returns A promise that resolves once the store has been saved (or immediately on native).
   */
  protected async persist(): Promise<void> {
    if (this.isWeb) {
      await this.sqlite.saveToStore(this.DB_NAME);
    }
  }
}

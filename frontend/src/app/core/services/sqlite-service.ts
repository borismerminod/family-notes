import { Injectable, inject } from '@angular/core';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { DatabaseService } from './database.service';

/**
 * Base class for every SQLite-backed data source in the app. The database itself — connection,
 * seed copy and schema migration — belongs to {@link DatabaseService}; this class turns it into
 * the building blocks its subclasses rely on: the {@link ready} guard, the {@link runQuery}
 * wrapper and the {@link persist} flush. Subclasses (NotesService, CategoriesService,
 * CalendarService) layer the table-specific queries on top.
 */
@Injectable({
  providedIn: 'root',
})
export class SqliteService {
  /** Owner of the connection shared by every data source. */
  private readonly database = inject(DatabaseService);

  /** Open connection to the `family_notes` database; assigned once initialisation completes. */
  protected db!: SQLiteDBConnection;

  /**
   * Resolves once the database is open and migrated. Every query awaits it (see {@link runQuery})
   * so callers never touch {@link db} before initialisation has finished.
   */
  protected ready: Promise<void>;

  constructor() {
    this.ready = this.initializeDatabase();
  }

  /**
   * Picks up the shared connection, opened on the first call whichever data source gets there
   * first.
   * @returns A promise that resolves once the connection is open and the schema is up to date, or
   * rejects on failure.
   */
  protected async initializeDatabase(): Promise<void> {
    try {
      this.db = await this.database.connect();
    } catch (err) {
      console.error('Erreur lors de l\'initialisation de la base de données', err);
      throw err;
    }
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
    await this.database.persist();
  }
}

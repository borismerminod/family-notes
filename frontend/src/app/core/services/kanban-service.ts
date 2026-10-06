import { Injectable } from '@angular/core';
import { Kanban } from '../models/kanban.model';
import { SqliteService } from './sqlite-service';

/**
 * Data source for the kanban boards: it reads and writes the `kanbans` table of the shared
 * `family_notes` database. The table itself is created by {@link SchemaMigrationService} from
 * `assets/migrations/schema_kanban.sql`, so no SQL schema lives here.
 */
@Injectable({
  providedIn: 'root',
})
export class KanbanService extends SqliteService {
  constructor() {
    super();
  }

  /**
   * Retrieves every kanban board, most recently modified first (US1).
   * @returns A promise resolving to the boards, or an empty array when there is none.
   */
  async getAllKanbans(): Promise<Kanban[]> {
    return this.runQuery('Erreur lors de la récupération des kanbans', async () => {
      const res = await this.db.query(
        'SELECT id, name, updated_at FROM kanbans ORDER BY updated_at DESC',
      );
      return (res.values ?? []).map((row: any) => this.mapRowToKanban(row));
    });
  }

  /**
   * Creates a board with the given name (US2). The name is stored without its leading and trailing
   * spaces, inner spaces being part of the name; two boards may share the same name (D-K4).
   * @param name The name entered by the user.
   * @returns A promise resolving to the board just created.
   * @throws When the name is empty once trimmed.
   */
  async createKanban(name: string): Promise<Kanban> {
    const normalizedName = this.requireName(name);
    return this.runQuery('Erreur lors de la création du kanban', async () => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await this.db.run(
        'INSERT INTO kanbans (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
        [id, normalizedName, now, now],
      );
      await this.persist();
      return { id, name: normalizedName, updatedAt: now };
    });
  }

  /**
   * Renames a board and stamps it as modified (US4). Returning the updated board lets the caller
   * refresh its list without reloading it. A board that no longer exists — deleted since the list
   * was displayed — leaves no row updated, and nothing is saved.
   * @param id The identifier of the board to rename.
   * @param name The new name entered by the user.
   * @returns A promise resolving to the renamed board.
   * @throws When the name is empty once trimmed, or when the board no longer exists.
   */
  async renameKanban(id: string, name: string): Promise<Kanban> {
    const normalizedName = this.requireName(name);
    return this.runQuery('Erreur lors du renommage du kanban', async () => {
      const updatedAt = new Date().toISOString();
      const res = await this.db.run('UPDATE kanbans SET name = ?, updated_at = ? WHERE id = ?', [
        normalizedName,
        updatedAt,
        id,
      ]);
      if ((res.changes?.changes ?? 0) === 0) {
        throw new Error('Kanban introuvable');
      }
      await this.persist();
      return { id, name: normalizedName, updatedAt };
    });
  }

  /**
   * Deletes a board (US5). Deleting a board that is already gone is not an error: the end state is
   * the one the caller asked for.
   * @param id The identifier of the board to delete.
   * @returns A promise that resolves once the board has been deleted and the database saved.
   */
  async deleteKanban(id: string): Promise<void> {
    return this.runQuery('Erreur lors de la suppression du kanban', async () => {
      await this.db.run('DELETE FROM kanbans WHERE id = ?', [id]);
      await this.persist();
    });
  }

  /**
   * Checks the name the same way the form does, as a safety net for callers that did not (US2, US4):
   * the check happens before the database is touched, so a refused name writes nothing. Inner
   * spaces are kept, only the leading and trailing ones are dropped.
   * @param name The name entered by the user.
   * @returns The trimmed name.
   * @throws When the name is empty once trimmed.
   */
  private requireName(name: string): string {
    const normalizedName = name.trim();
    if (normalizedName.length === 0) {
      throw new Error('Le nom du kanban est obligatoire');
    }
    return normalizedName;
  }

  /**
   * Converts a `kanbans` row into the application model. The creation date stays in the database:
   * only the last-modified date is exposed (see APPROCHE_KANBAN_CRUD.md, D-K1).
   * @param row The database row to convert.
   * @returns The matching {@link Kanban}.
   */
  private mapRowToKanban(row: any): Kanban {
    return {
      id: row.id,
      name: row.name,
      updatedAt: row.updated_at,
    };
  }
}

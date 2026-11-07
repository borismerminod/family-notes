import { Injectable, inject } from '@angular/core';
import { Kanban } from '../models/kanban.model';
import { KanbanColumn } from '../models/kanban-column.model';
import { KanbanSaveResult } from '../models/kanban-save-result.model';
import { KanbanColumnService } from './kanban-column-service';
import { SqliteService } from './sqlite-service';

/**
 * Data source for the kanban boards: it reads and writes the `kanbans` table of the shared
 * `family_notes` database. The table itself is created by {@link SchemaMigrationService} from
 * `assets/migrations/schema_kanban.sql`, so no SQL schema lives here.
 *
 * The columns of a board belong to {@link KanbanColumnService}, their sole owner: this service
 * delegates to it rather than querying `kanban_columns` itself
 * (see .agent/KANBAN/EDITION_LISTES/APPROCHE_KANBAN_EDITION_LISTES.md, D-L9). What it keeps is the
 * assembly the edit screen needs, so that screen injects one service and orchestrates no sequence
 * of its own.
 */
@Injectable({
  providedIn: 'root',
})
export class KanbanService extends SqliteService {
  /** Owner of the `kanban_columns` table, which the reads and writes below delegate to (D-L9). */
  private readonly columnService = inject(KanbanColumnService);

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
   * Retrieves a single board **with its columns**, which is what the edit screen opens on (US1,
   * US3; see APPROCHE_KANBAN_EDITION.md, D-E7). A board that does not exist is not an error but an
   * answer: `null` is returned, on the model of `getNoteById`.
   *
   * This is the one read that carries the columns, because it is the one that serves the editor
   * (D-L8): its `columns` field comes back filled — possibly with an empty array, which says
   * « loaded, and the board has none » where an absent field says « not loaded » (D-L7).
   * @param id The identifier of the board to read.
   * @returns A promise resolving to the board and its columns ordered by position, or to `null`
   * when no board carries that identifier.
   */
  async getKanbanById(id: string): Promise<Kanban | null> {
    return this.runQuery('Erreur lors de la récupération du kanban', async () => {
      const res = await this.db.query('SELECT id, name, updated_at FROM kanbans WHERE id = ?', [
        id,
      ]);
      const rows = res.values ?? [];
      if (rows.length === 0) {
        return null;
      }
      const kanban = this.mapRowToKanban(rows[0]);
      const columns = await this.columnService.getColumnsByKanbanId(id);
      return { ...kanban, columns };
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
   * Saves a board and the composition it shows in a single call, which is what the save button of
   * the edit screen presses (US6, lot D). The board is written first and its columns second, under
   * its identifier — the one of the board just created when there was none.
   * @param id The identifier of the board to save, or `null` for a board that does not exist yet.
   * @param name The board name entered by the user.
   * @param columns The composition the screen shows, already carrying its positions (D-L12).
   * @returns A promise resolving to the board as the database now holds it, and to whether its
   * columns followed (D-L24).
   * @throws When the name is empty once trimmed, or when writing the board itself fails — the only
   * failure that throws, because it is the only one where nothing at all has been written.
   */
  async saveKanbanWithColumns(
    id: string | null,
    name: string,
    columns: KanbanColumn[],
  ): Promise<KanbanSaveResult> {
    const savedKanban = await this.createOrRenameKanban(id, name);
    return this.saveColumnsOf(savedKanban, columns);
  }

  /**
   * Writes the board itself, the first of the two phases of a grouped save: a board that does not
   * exist yet is created, an existing one is renamed — which stamps it as modified, hence its
   * climb back to the top of the board list (US6). Either way the caller gets an identifier to
   * write the columns under.
   * @param id The identifier of the board to write, or `null` for a board that does not exist yet.
   * @param name The board name entered by the user.
   * @returns A promise resolving to the board as the database now holds it.
   * @throws When the name is empty once trimmed, or when the write fails.
   */
  private async createOrRenameKanban(id: string | null, name: string): Promise<Kanban> {
    const isNewKanban = id === null;
    if (isNewKanban) {
      return this.createKanban(name);
    }
    return this.renameKanban(id, name);
  }

  /**
   * Writes the composition, the second and last phase of a grouped save, and turns the outcome
   * into the result the caller gets. A failure here is reported rather than thrown (D-L24): the
   * board is already stored, and an exception would carry away its identifier — the one of a board
   * that may have just been created — leaving the screen unable to switch to edit mode and a
   * retry free to create a second board (D-L13). The underlying error is not lost, `runQuery`
   * having logged it before it got here. The board then comes back without any `columns` field,
   * which says « not loaded » (D-L7): what the database holds is precisely what is unknown.
   * @param kanban The board as it is now stored, whose identifier the columns are written under.
   * @param columns The composition the screen shows.
   * @returns A promise resolving to the stored board and to whether its columns followed.
   */
  private async saveColumnsOf(kanban: Kanban, columns: KanbanColumn[]): Promise<KanbanSaveResult> {
    try {
      const savedColumns = await this.columnService.saveColumnsForKanban(kanban.id, columns);
      return { kanban: { ...kanban, columns: savedColumns }, columnsSaved: true };
    } catch {
      return { kanban, columnsSaved: false };
    }
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

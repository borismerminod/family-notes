import { Injectable } from '@angular/core';
import { KanbanColumn } from '../models/kanban-column.model';
import { SqliteService } from './sqlite-service';

/**
 * Data source for the columns of a kanban board — what the user interface calls « listes »
 * (see .agent/KANBAN/EDITION_LISTES/APPROCHE_KANBAN_EDITION_LISTES.md, D-L5). It is the sole
 * owner of the `kanban_columns` table: no other service queries it, `KanbanService` delegates
 * here instead (D-L9). The table itself is created by {@link SchemaMigrationService} from
 * `assets/migrations/schema_kanban_columns.sql`, so no SQL schema lives here.
 */
@Injectable({
  providedIn: 'root',
})
export class KanbanColumnService extends SqliteService {
  constructor() {
    super();
  }

  /**
   * Retrieves the columns of one board, ordered by their position — the left-to-right order the
   * user composed, which carries the meaning of the workflow (US1, D-L12). The read is fenced to
   * the given board, so the columns of the other boards never come back. A board without any
   * column is not an anomaly but an answer: an empty array is returned.
   * @param kanbanId The identifier of the board whose columns are read.
   * @returns A promise resolving to the columns of the board, ordered by ascending position, or
   * to an empty array when the board carries none.
   */
  async getColumnsByKanbanId(kanbanId: string): Promise<KanbanColumn[]> {
    return this.runQuery('Erreur lors de la récupération des colonnes du kanban', async () => {
      const res = await this.db.query(
        'SELECT id, name, position FROM kanban_columns WHERE kanban_id = ? ORDER BY position ASC',
        [kanbanId],
      );
      const rows = res.values ?? [];
      const columns = rows.map((row: any) => this.mapRowToColumn(row));
      return this.sortedByPosition(columns);
    });
  }

  /**
   * Saves the composition of one board: every column it shows is written, so that reading the
   * board back hands the same composition in the same order (US6, D-L10). The columns are written
   * in the order received, then the store is flushed once, after the last write.
   * @param kanbanId The identifier of the board whose composition is saved.
   * @param columns The columns the board shows, already carrying their position (D-L12).
   * @returns A promise resolving to the saved composition, which is from then on the stored one.
   */
  async saveColumnsForKanban(kanbanId: string, columns: KanbanColumn[]): Promise<KanbanColumn[]> {
    for (const column of columns) {
      this.requireName(column.name);
    }
    return this.runQuery('Erreur lors de l\'enregistrement des colonnes du kanban', async () => {
      for (const column of columns) {
        await this.upsertColumn(kanbanId, column);
      }
      const keptColumnIds = columns.map((column) => column.id);
      await this.deleteColumnsAbsentFrom(kanbanId, keptColumnIds);
      await this.persist();
      return columns;
    });
  }

  /**
   * Writes one column of the composition: the row is inserted, and an identifier already stored
   * has its name and position updated in place instead (D-L10). The update is a real `UPDATE`, so
   * the row is never destroyed and recreated — the identifier survives, and so will the cards
   * that hang off it in the next batch.
   * @param kanbanId The identifier of the board the column belongs to.
   * @param column The column to write.
   * @returns A promise that resolves once the row has been written.
   */
  private async upsertColumn(kanbanId: string, column: KanbanColumn): Promise<void> {
    const sql =
      'INSERT INTO kanban_columns (id, kanban_id, name, position) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET name = excluded.name, position = excluded.position';
    await this.db.run(sql, [column.id, kanbanId, column.name, column.position]);
  }

  /**
   * Removes the columns the board no longer shows, which is the second and last phase of a save
   * (D-L10). It runs **after** the upserts, so nothing is destroyed before the new state is in
   * place; the price is a possible temporary collision of positions, which no uniqueness
   * constraint objects to (D-L6). The removal is fenced to the given board: the columns of the
   * other boards are never candidates.
   * @param kanbanId The identifier of the board the removal is fenced to.
   * @param keptColumnIds The identifiers the saved composition still carries.
   * @returns A promise that resolves once the absent columns have been removed.
   */
  private async deleteColumnsAbsentFrom(kanbanId: string, keptColumnIds: string[]): Promise<void> {
    const keepsNothing = keptColumnIds.length === 0;
    if (keepsNothing) {
      await this.deleteAllColumnsOf(kanbanId);
      return;
    }
    const keptPlaceholders = keptColumnIds.map(() => '?').join(', ');
    const sql = `DELETE FROM kanban_columns WHERE kanban_id = ? AND id NOT IN (${keptPlaceholders})`;
    await this.db.run(sql, [kanbanId, ...keptColumnIds]);
  }

  /**
   * Removes every column of one board, the limit case of a composition emptied of its last column
   * (approche, lot C, « cas limites »). It is a statement of its own rather than a removal with an
   * empty list of kept identifiers: the general form would read `NOT IN ()`, which several engines
   * reject outright and which says nothing of the intent.
   * @param kanbanId The identifier of the board whose columns are all removed.
   * @returns A promise that resolves once the board holds no column any more.
   */
  private async deleteAllColumnsOf(kanbanId: string): Promise<void> {
    await this.db.run('DELETE FROM kanban_columns WHERE kanban_id = ?', [kanbanId]);
  }

  /**
   * Checks one name the way the form does, as a safety net for a caller that did not fall back to
   * « Sans titre » itself (D-L17, D-E10). The whole composition is checked before the first write,
   * so a name refused at the third column leaves the first two unwritten: a refused save writes
   * nothing at all. Unlike its counterpart on the boards it returns nothing, because the cleaned
   * name is not what gets stored — the composition is stored as the editor composed it, the
   * cleaning having already happened there.
   * @param name The name carried by one column of the composition.
   * @throws When the name is empty once trimmed.
   */
  private requireName(name: string): void {
    const normalizedName = name.trim();
    if (normalizedName.length === 0) {
      throw new Error('Le nom de la colonne est obligatoire');
    }
  }

  /**
   * Orders the columns by ascending position. The query above already asks the database for that
   * order, and the index on `(kanban_id, position)` serves it; ordering the model as well puts
   * the guarantee where the caller can rely on it, whatever order the driver hands the rows back
   * in (D-L12).
   * @param columns The columns to order, as they came out of the database.
   * @returns A new array holding the same columns, ordered by ascending position.
   */
  private sortedByPosition(columns: KanbanColumn[]): KanbanColumn[] {
    const orderedColumns = [...columns];
    return orderedColumns.sort((first, second) => first.position - second.position);
  }

  /**
   * Converts a `kanban_columns` row into the application model. The owning board is deliberately
   * dropped: a column is always read and written within the context of its board, and carrying
   * the reference twice would invite contradiction (D-L7).
   * @param row The database row to convert.
   * @returns The matching {@link KanbanColumn}.
   */
  private mapRowToColumn(row: any): KanbanColumn {
    return {
      id: row.id,
      name: row.name,
      position: row.position,
    };
  }
}

/**
 * @file kanban-save-result.model.ts
 * @description What a grouped save of a board and its columns hands back
 * (see .agent/KANBAN/EDITION_LISTES/APPROCHE_KANBAN_EDITION_LISTES.md, D-L24).
 *
 * The save is deliberately not atomic — there is no transaction anywhere in this repository
 * (D-L13) — so the board is written first and its columns second, and a failure on the columns
 * leaves the database in an intermediate state. That half-success is a **result**, not an
 * exception: an exception would carry away the identifier of a board that was just created, and
 * the edit screen would have no way of knowing it, so a second press on « Enregistrer » would
 * create a second board. Only a failure on the board itself throws, and then nothing at all has
 * been written.
 */

import { Kanban } from './kanban.model';

export interface KanbanSaveResult {
  /**
   * The board as the database now holds it, identifier included — the identifier of a board that
   * has just been created among them, which is what lets the screen switch to edit mode and makes
   * a retry rename the board instead of creating another one (D-L13).
   */
  kanban: Kanban;
  /**
   * Whether the columns followed the board. False says the board is stored but its composition is
   * not, or only in part: what the user sees is intact and the save is replayable, which is the
   * guarantee actually upheld in place of atomicity (D-L19).
   */
  columnsSaved: boolean;
}

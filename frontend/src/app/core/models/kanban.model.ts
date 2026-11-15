/**
 * @file kanban.model.ts
 * @description Application model for a kanban board.
 *
 * Boards are stored in their own 'kanbans' table ('id', 'name', 'created_at', 'updated_at'; see
 * frontend/public/assets/migrations/schema_kanban.sql). The creation date is kept in the database
 * but never exposed here: the board list only shows the last-modified date
 * (see .agent/KANBAN/CRUD/APPROCHE_KANBAN_CRUD.md, D-K1).
 *
 * A board aggregates the ordered columns the user calls « listes »
 * (see .agent/KANBAN/EDITION_LISTES/APPROCHE_KANBAN_EDITION_LISTES.md, D-L7): an aggregation and
 * not a composition, since a board read by `getAllKanbans` exists perfectly well without them.
 */

import { KanbanColumn } from './kanban-column.model';

export interface Kanban {
  /** Unique identifier for the board (UUID). */
  id: string;
  /**
   * Board name, entered by the user. Required and stored without leading/trailing spaces;
   * two boards may share the same name (no uniqueness check, see D-K4).
   */
  name: string;
  /** Date of last modification, in ISO 8601 format. */
  updatedAt: string;
  /**
   * Columns of the board, ordered by their position. Optional, and the distinction carries
   * meaning (D-L7): `undefined` means « columns not loaded » — what `getAllKanbans` returns, since
   * the board list displays none (D-L8) — while an empty array means « loaded, and the board has
   * none », the empty state of the edit screen.
   */
  columns?: KanbanColumn[];
}

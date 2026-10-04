/**
 * @file category.model.ts
 * @description Note category model.
 *
 * Categories are stored in their own 'categories' table ('id', unique name, 'color'), and notes reference them via 'notes.category_id' (see scripts/schema_notes.sql).
 * The migration from the old format—category as free text on the note—is run at startup by 'SqliteService.migrateSchema()'.
 */
export interface Category {
  /** Unique identifier for the category (UUID). */
  id: (string|null);
  /** Label displayed and entered by the user. */
  name: string;
  /** Optional accent color (e.g., for the tag on the note card). */
  color?: string;
}
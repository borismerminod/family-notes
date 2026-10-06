/**
 * @file note.model.ts
 * @description Application model for a note (block-based architecture).
 */

import { Category } from './category.model';
import { NoteBlock } from './document.model';

export interface Note {
  id: string;
  title: string;
  /** The assigned category. */
  category: (Category|null);

  /**
   * Note content: a **JSON document** (canonical model, see
   * `.agent/PLAN_MODELE_DOCUMENT_JSON.md`).
   * Stored in the database as `JSON.stringify(blocks)` in the
   * `content` column; the NotesService handles decoding/encoding at boundaries (with migration from old
   * HTML / old JSON format).
   */
  blocks: NoteBlock[];
  /** Date of last modification, in ISO 8601 format. */
  updatedAt: string;
}
import { Injectable, inject } from '@angular/core';
import { Note } from '../models/note.model';
import { isTextBlock, Mark, NoteBlock, TextBlock, TextBlockKind } from '../models/document.model';
import { SqliteService } from './sqlite-service';
import { DocumentParseService } from './document-parse';
import { DocumentModelService } from './document-model';
import { Category } from '../models';
import { CategoriesService } from './categories.service';

/**
 * SQLite-backed data source for notes. Owns the note CRUD and the translation between the
 * `notes` table (snake_case columns, `content` stored as text) and the application `Note`
 * model (camelCase, `blocks` as a JSON document). Legacy HTML and legacy JSON content is
 * migrated to the block model on read.
 */
@Injectable({
  providedIn: 'root',
})
export class NotesService extends SqliteService {
  /** Parser used to migrate legacy HTML content and to re-parse the inline HTML of old blocks. */
  private readonly parser = inject(DocumentParseService);
  /** Model service used to normalise migrated blocks into their canonical form. */
  private readonly docModel = inject(DocumentModelService);

  private categoriesService = inject(CategoriesService)

  constructor() {
    super();
  }

  /**
   * Retrieves every note from the database, newest first.
   * @returns A promise resolving to all stored notes, ordered by descending update date.
   */
  async getAllNotes(): Promise<Note[]> {
    return this.runQuery('Erreur lors de la récupération des notes', async () => {
      const res = await this.db.query(`
        SELECT 
          notes.*, 
          categories.name AS category_name, 
          categories.color AS category_color 
        FROM notes 
        LEFT JOIN categories ON notes.category_id = categories.id 
        ORDER BY notes.updated_at DESC
      `);
      const rows = res.values ?? [];
      return rows.map((row) => this.mapRowToNote(row));
    });
  }

  /**
   * Retrieves a single note by its identifier.
   * @param id The identifier of the note to fetch.
   * @returns A promise resolving to the matching note, or undefined when none exists.
   */
  async getNoteById(id: string): Promise<Note | null> {
      return this.runQuery('Erreur lors de la récupération des notes', async () => {
        const res = await this.db.query(`
          SELECT 
            notes.*, 
            categories.name AS category_name, 
            categories.color AS category_color 
          FROM notes 
          LEFT JOIN categories ON notes.category_id = categories.id 
          WHERE notes.id = ?
        `, [id]);
        const rows = res.values ?? [];
        return rows.length ===0  ? null : this.mapRowToNote(rows[0]) 
    });
  }

 /**
   * Creates a new note, ensuring the category exists first.
   * @param draft The note fields to store.
   * @param categoryName The name of the category to associate with the note.
   * @returns A promise resolving to the created note.
   */
  async createNote(draft: Omit<Note, 'id' | 'updatedAt'>, categoryName: (string|null)): Promise<Note> {
    return this.runQuery('Erreur lors de la création de la note', async () => {
      try {

        let category = null 
        if(categoryName !== null)
        {
          category = await this.categoriesService.get(categoryName);
          if (!category) {
            category = await this.categoriesService.create(categoryName);
          }

        }
        const id = crypto.randomUUID();
        const updatedAt = new Date().toISOString();
        const content = this.encodeContent(draft.blocks);
        
        const sql = 'INSERT INTO notes (id, title, content, category_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)';
        await this.db.run(sql, [id, draft.title, content, (category === null ? null : category.id), new Date(), updatedAt]);
        
        await this.persist();
        
        return { 
          id, 
          title: draft.title, 
          category: (category === null ? null : { id: category.id, name: category.name, color: category.color }), 
          blocks: draft.blocks ?? [], 
          updatedAt 
        };
      } catch (e) {
        throw new Error(`Echec lors de la création de la note : ${e}`);
      }
    });
  }

  /**
   * Updates an existing note in place, refreshing its update date.
   * @param note The note to persist, identified by its id (the update date is reassigned here).
   * @param newCategoryName The new category name to associate with the note.
   * @returns A promise that resolves once the update has been persisted.
   */
  async updateNote(note: Omit<Note, 'updatedAt'>, newCategoryName: (string|null)): Promise<void> {
    return this.runQuery('Erreur lors de la mise à jour de la note', async () => {
      try {
        let category = null 
        if(newCategoryName !== null)
        {
          category = await this.categoriesService.get(newCategoryName);
          if (!category) {
            category = await this.categoriesService.create(newCategoryName);
          }
        }

        const updatedAt = new Date().toISOString();
        const content = this.encodeContent(note.blocks);
        
        const sql = 'UPDATE notes SET title = ?, content = ?, category_id = ?, updated_at = ? WHERE id = ?';
        await this.db.run(sql, [note.title, content, (category === null ? null : category.id), updatedAt, note.id]);
        
        await this.persist();
        
      } catch (e) {
        throw new Error(`Echec lors de la mise à jour de la note : ${e}`);
      }
    });
  }

  /**
   * Deletes a note by its identifier.
   * @param id The identifier of the note to remove.
   * @returns A promise that resolves once the deletion has been persisted.
   */
  async deleteNote(id: string): Promise<void> {
    return this.runQuery('Erreur lors de la suppression de la note', async () => {
      await this.db.run('DELETE FROM notes WHERE id = ?', [id]);
      await this.persist();
    });
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Maps a raw SQLite row (snake_case) to the application `Note` model (camelCase). The `content`
   * text column is decoded into the `blocks` JSON document (with migration of legacy formats).
   * @param row The raw row returned by the SQLite driver.
   * @returns The corresponding application note.
   */
  private mapRowToNote(row: any): Note {
    const category: Category = row.category_id
      ? { id: row.category_id, name: row.category_name, color: row.category_color }
      : { id: '', name: row.category || '', color: '#808080' };

    return {
      id: row.id,
      title: row.title,
      category: category,
      blocks: this.decodeContent(row.content),
      updatedAt: row.updated_at,
    };
  }

  /**
   * Decodes the stored `content` column into a block document, covering four cases without ever
   * throwing (see .agent/PLAN_TESTS_NOTES_SERVICE_BLOCKS.md):
   *   1. empty/null → [];
   *   2. JSON array/object → current format (`kind`) kept as is, or legacy format (`type`) migrated;
   *   3. HTML (starts with `<`) → parsed via `DocumentParseService.parse`;
   *   4. otherwise → a single text block wrapping the raw string.
   * @param raw The raw value of the `content` column.
   * @returns The decoded blocks (an empty array when there is no content).
   */
  private decodeContent(raw: string | null | undefined): NoteBlock[] {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const data = JSON.parse(trimmed);
        const arr = Array.isArray(data) ? data : [data];
        return arr.map((b) => this.decodeJsonBlock(b));
      } catch {
        // Invalid JSON → fall through to the bare-text fallback below.
      }
    }

    if (trimmed.startsWith('<')) {
      return this.parser.parse(raw as string);
    }

    return [{ id: crypto.randomUUID(), kind: 'text', text: raw as string, marks: [] }];
  }

  /**
   * Decodes a single JSON block: current format (`kind`) is kept as is, legacy format (`type`)
   * is migrated, and anything unrecognised falls back to an empty text block.
   * @param b The parsed JSON block candidate.
   * @returns A block conforming to the current model.
   */
  private decodeJsonBlock(b: any): NoteBlock {
    if (b && typeof b === 'object' && 'kind' in b) return b as NoteBlock;
    if (b && typeof b === 'object' && 'type' in b) return this.migrateLegacyBlock(b);
    return { id: crypto.randomUUID(), kind: 'text', text: '', marks: [] };
  }

  /**
   * Migrates a legacy block (`{id,type,content,style,src,url}`) to the current model. Media blocks
   * map directly; text and heading blocks may carry inline HTML in `content`, which is re-parsed
   * into `text` + `marks`, and their legacy `size` style is folded into either the `kind` (headings)
   * or a `size` mark spanning the whole text.
   * @param old The legacy block to migrate.
   * @returns The migrated block in canonical form.
   */
  private migrateLegacyBlock(old: any): NoteBlock {
    const id: string = old.id ?? crypto.randomUUID();
    if (old.type === 'image') {
      return { id, kind: 'image', src: old.src ?? '' };
    }
    if (old.type === 'video') {
      return { id, kind: 'video', ...(old.url ? { url: old.url } : {}), ...(old.src ? { src: old.src } : {}) };
    }
    // 'heading' | 'text': the `content` may carry inline HTML → re-parse for text + marks.
    const parsed = this.parser.parse(String(old.content ?? ''));
    const first = parsed.find((p): p is TextBlock => isTextBlock(p));
    const text = first?.text ?? '';
    let marks: Mark[] = first ? first.marks : [];
    const size = old.style?.size;

    let kind: TextBlockKind = 'text';
    if (old.type === 'heading') {
      kind = size === 'h1' ? 'h1' : 'h2';
    } else if (size === 'small' || size === 'large') {
      marks = [...marks, { type: 'size', start: 0, end: text.length, value: size }];
    }
    return this.docModel.normalize({ id, kind, text, marks });
  }

  /**
   * Encodes a note's blocks into the string stored in the `content` column.
   * @param blocks The blocks to serialise (an empty array is used when undefined).
   * @returns The JSON string to store in `content`.
   */
  private encodeContent(blocks: NoteBlock[] | undefined): string {
    return JSON.stringify(blocks ?? []);
  }
}

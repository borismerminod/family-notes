import { Injectable, inject } from '@angular/core';
import { KanbanCard } from '../../models/kanban-card.model';
import { KanbanColumn } from '../../models/kanban-column.model';
import { Note } from '../../models/note.model';
import { NotesService } from '../notes/notes-service';
import { SqliteService } from '../sqlite-service';

/**
 * Data source for the cards of a kanban column — the unit of work the user moves from one list to
 * the next (see .agent/KANBAN/EDITION_CARTES/APPROCHE_KANBAN_EDITION_CARTES.md, D-C1). It is the
 * sole owner of the `kanban_cards` table: no other service queries it, `KanbanColumnService`
 * delegates here instead (D-C6). The table itself is created by {@link SchemaMigrationService}
 * from `assets/migrations/schema_kanban_cards.sql`, so no SQL schema lives here.
 *
 * Its surface holds no `addCard` / `updateCard` / `deleteCard` (D-C7): those are the shapes of an
 * immediate persistence, which this feature rules out — nothing is written before the user presses
 * « Enregistrer », and the save needs a whole-composition upsert for the identifiers to survive
 * (D-L10).
 */
@Injectable({
  providedIn: 'root',
})
export class KanbanCardService extends SqliteService {
  /**
   * Owner of the notes a card may reference, which the read hydrates its references from (D-C14).
   * Decoding the content of a note — with its migration from the former HTML and JSON shapes —
   * belongs there; redoing it here would duplicate what the project forbids duplicating.
   */
  private readonly notesService = inject(NotesService);

  constructor() {
    super();
  }

  /**
   * Retrieves the cards of one column, ordered by their position — the top-to-bottom order the
   * user composed, which carries the priority he gave them (US1, D-C19). The read is fenced to the
   * given column, so the cards of the other columns never come back. A column without any card is
   * not an anomaly but an answer: an empty array is returned, which is the empty state of the
   * column on the edit screen.
   * @param columnId The identifier of the column whose cards are read.
   * @returns A promise resolving to the cards of the column, ordered by ascending position, or to
   * an empty array when the column carries none.
   */
  async getCardsByColumnId(columnId: string): Promise<KanbanCard[]> {
    return this.runQuery('Erreur lors de la récupération des cartes de la colonne', async () => {
      const res = await this.db.query(
        'SELECT id, text, note_id, position FROM kanban_cards WHERE column_id = ? ORDER BY position ASC',
        [columnId],
      );
      const rows = res.values ?? [];
      const notesById = await this.resolveNotesOf(rows);
      const cards = rows.map((row: any) => this.mapRowToCard(row, notesById));
      return this.sortedByPosition(cards);
    });
  }

  /**
   * Writes the cards the board shows, every column together, so that reading the board back hands
   * the same composition in the same columns and the same order (US9, D-C8). Every card of every
   * column is written, whichever column now carries it.
   *
   * It is deliberately whole-composition rather than card by card (D-C7): nothing is written
   * before the user presses « Enregistrer », and an upsert of the whole thing is what lets the
   * identifiers survive a save (D-L10).
   *
   * The store is **not** flushed here: the single `persist()` of a save belongs to the columns,
   * after the last write (D-C11).
   * @param columns The columns the board shows, each carrying the cards it shows (D-C9).
   * @returns A promise that resolves once every card has been written.
   */
  async saveCardsForColumns(columns: KanbanColumn[]): Promise<void> {
    return this.runQuery("Erreur lors de l'enregistrement des cartes du kanban", async () => {
      for (const column of columns) {
        await this.upsertCardsOf(column);
      }
      for (const column of columns) {
        await this.closeCardsOf(column);
      }
    });
  }

  /**
   * Checks the cards of a whole composition the way the form does, as a safety net for a caller
   * that did not fall back to « Sans titre » itself (D-C30, D-E2): a text left empty once trimmed
   * is refused.
   *
   * It queries nothing, and it is public for one reason (D-C7, D-C12): the caller has to be able
   * to refuse a composition **before the first write**, its own columns included, so that a text
   * refused at the third card leaves neither column nor card written. Checking it from inside
   * {@link saveCardsForColumns} would come too late — the columns would already be upserted.
   * @param columns The columns of the composition about to be saved.
   * @throws When one of the cards carries a text that is empty once trimmed.
   */
  assertCardsAreSavable(columns: KanbanColumn[]): void {
    for (const column of columns) {
      this.requireTextOfEveryCard(column);
    }
  }

  /**
   * Checks every card one column shows. A column whose cards are not loaded carries nothing to
   * check: « I know nothing of its cards » is not a refusal (D-C9).
   * @param column The column whose cards are checked.
   * @throws When one of the cards of the column carries a text that is empty once trimmed.
   */
  private requireTextOfEveryCard(column: KanbanColumn): void {
    const shownCards = column.cards ?? [];
    for (const card of shownCards) {
      this.requireText(card.text);
    }
  }

  /**
   * Checks one text. Unlike its counterpart on the boards it returns nothing, because the cleaned
   * text is not what gets stored: the composition is stored as the editor composed it, the
   * cleaning having already happened there (D-C30).
   * @param text The text carried by one card of the composition.
   * @throws When the text is empty once trimmed.
   */
  private requireText(text: string): void {
    const normalizedText = text.trim();
    if (normalizedText.length === 0) {
      throw new Error('Le texte de la carte est obligatoire');
    }
  }

  /**
   * Writes every card one column shows, under the identifier of that column: a card is always
   * written within the context of the column that carries it, which is where its `column_id`
   * comes from (D-C2).
   * @param column The column whose cards are written.
   * @returns A promise that resolves once the cards of the column have been written.
   */
  private async upsertCardsOf(column: KanbanColumn): Promise<void> {
    const shownCards = column.cards ?? [];
    for (const card of shownCards) {
      await this.upsertCard(column.id, card);
    }
  }

  /**
   * Closes one column of the composition: the cards it no longer shows are removed. It is the
   * third phase of a save, and it runs once **every** card of **every** column has been written
   * (D-C8). That order is what lets a card move from one column to another: its row already
   * carries its new `column_id`, so closing the column it left no longer counts it among its
   * cards and does not remove it — whereas upserting and closing one column at a time would have
   * destroyed it and recreated it.
   *
   * A column whose cards are **not loaded** is skipped (D-C9): « I know nothing of its cards »
   * must never be written as « it keeps none ».
   * @param column The column whose absent cards are removed.
   * @returns A promise that resolves once the column holds only the cards it shows.
   */
  private async closeCardsOf(column: KanbanColumn): Promise<void> {
    const shownCards = column.cards;
    const areCardsLoaded = shownCards !== undefined;
    if (!areCardsLoaded) {
      return;
    }
    const keptCardIds = shownCards.map((card) => card.id);
    await this.deleteCardsAbsentFrom(column.id, keptCardIds);
  }

  /**
   * Removes the cards one column no longer shows. The removal is fenced to that column: the cards
   * of the other columns are never candidates, which is what keeps a save from reaching beyond the
   * column it is closing.
   * @param columnId The identifier of the column the removal is fenced to.
   * @param keptCardIds The identifiers the saved composition still carries for that column.
   * @returns A promise that resolves once the absent cards have been removed.
   */
  private async deleteCardsAbsentFrom(columnId: string, keptCardIds: string[]): Promise<void> {
    const keptPlaceholders = keptCardIds.map(() => '?').join(', ');
    const sql = `DELETE FROM kanban_cards WHERE column_id = ? AND id NOT IN (${keptPlaceholders})`;
    await this.db.run(sql, [columnId, ...keptCardIds]);
  }

  /**
   * Writes one card of the composition: the row is inserted, and an identifier already stored has
   * its column, text, reference and position updated in place instead (D-C10). The `column_id`
   * sitting in the update is what carries a horizontal move: the card changes column through a
   * real `UPDATE`, so the row is never destroyed and recreated and the identifier survives.
   *
   * The reference is written by the identifier of the note alone: the note itself is never
   * touched, the write knowing nothing of the notes table.
   * @param columnId The identifier of the column the card belongs to.
   * @param card The card to write.
   * @returns A promise that resolves once the row has been written.
   */
  private async upsertCard(columnId: string, card: KanbanCard): Promise<void> {
    const sql =
      'INSERT INTO kanban_cards (id, column_id, text, note_id, position) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET column_id = excluded.column_id, text = excluded.text, ' +
      'note_id = excluded.note_id, position = excluded.position';
    const referencedNoteId = card.note?.id ?? null;
    await this.db.run(sql, [card.id, columnId, card.text, referencedNoteId, card.position]);
  }

  /**
   * Resolves the notes the rows reference, so the cards can carry the whole note rather than an
   * identifier (D-C3). Each **distinct** note is read once, even when three cards aim at it, which
   * is what makes the cost of carrying whole notes acceptable (D-C14); a row without reference
   * asks for nothing, and no note is read on its behalf.
   * @param rows The database rows whose references are resolved.
   * @returns A promise resolving to the found notes, keyed by their identifier; a reference that
   * resolved to nothing is simply absent from it.
   */
  private async resolveNotesOf(rows: any[]): Promise<Map<string, Note>> {
    const referencedNoteIds = this.distinctReferencesOf(rows);
    const notesById = new Map<string, Note>();
    for (const referencedNoteId of referencedNoteIds) {
      const foundNote = await this.readNoteOrNothing(referencedNoteId);
      const isReadable = foundNote !== null;
      if (isReadable) {
        notesById.set(referencedNoteId, foundNote);
      }
    }
    return notesById;
  }

  /**
   * Collects the references the rows carry, each one once: it is what turns « one read per card »
   * into « one read per distinct note » (D-C14). Rows without reference drop out here rather than
   * at read time, so the caller holds exactly the notes it has to ask for.
   * @param rows The database rows whose references are collected.
   * @returns The distinct referenced note identifiers, in the order they first appear.
   */
  private distinctReferencesOf(rows: any[]): string[] {
    const referencedNoteIds = new Set<string>();
    for (const row of rows) {
      const referencedNoteId = this.referenceOf(row);
      const carriesReference = referencedNoteId !== null;
      if (carriesReference) {
        referencedNoteIds.add(referencedNoteId);
      }
    }
    return [...referencedNoteIds];
  }

  /**
   * Reads one referenced note, turning a failing read into an absent note instead of letting it
   * bring the whole board down (D-C15): the text is the load-bearing data of a card, so a
   * reference that cannot be read is journalised and dropped. A note the application no longer
   * holds comes back as nothing from {@link NotesService} and takes the same path.
   * @param noteId The identifier the card row references.
   * @returns A promise resolving to the note, or to `null` when it could not be read.
   */
  private async readNoteOrNothing(noteId: string): Promise<Note | null> {
    try {
      return await this.notesService.getNoteById(noteId);
    } catch (err) {
      console.error('Erreur lors de la lecture de la note référencée par une carte', err);
      return null;
    }
  }

  /**
   * Reads the reference a row carries, `note_id` being nullable in the table (D-C1).
   * @param row The database row to read the reference of.
   * @returns The referenced note identifier, or `null` when the card carries no reference.
   */
  private referenceOf(row: any): string | null {
    return row.note_id ?? null;
  }

  /**
   * Orders the cards by ascending position. The query above already asks the database for that
   * order, and the index on `(column_id, position)` serves it; ordering the model as well puts the
   * guarantee where the caller can rely on it, whatever order the driver hands the rows back in
   * (D-C19).
   * @param cards The cards to order, as they came out of the database.
   * @returns A new array holding the same cards, ordered by ascending position.
   */
  private sortedByPosition(cards: KanbanCard[]): KanbanCard[] {
    const orderedCards = [...cards];
    return orderedCards.sort((first, second) => first.position - second.position);
  }

  /**
   * Converts a `kanban_cards` row into the application model. The owning column is deliberately
   * dropped: a card is always read and written within the context of its column, and carrying the
   * reference twice would invite contradiction — D-L7 taken one level down (D-C2).
   *
   * The stored `note_id` is replaced by the note it designates, taken from the references the read
   * has already resolved (D-C3). The card comes out with no reference at all in the three cases
   * the screen does not have to tell apart: it never had one, the note was deleted, or the
   * identifier could not be resolved (D-C15).
   * @param row The database row to convert.
   * @param notesById The notes the read resolved, keyed by their identifier.
   * @returns The matching {@link KanbanCard}.
   */
  private mapRowToCard(row: any, notesById: Map<string, Note>): KanbanCard {
    const referencedNoteId = this.referenceOf(row);
    const carriesReference = referencedNoteId !== null;
    const resolvedNote = carriesReference ? notesById.get(referencedNoteId) : undefined;
    return {
      id: row.id,
      text: row.text,
      note: resolvedNote ?? null,
      position: row.position,
    };
  }
}

import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { KanbanCardService } from './kanban-card-service';
import { DatabaseService } from '../database.service';
import { NotesService } from '../notes/notes-service';
import { KanbanCard, KanbanColumn, Note } from '../../models';

/**
 * TARGET contract of the service under test (TDD).
 *
 * The spec drives the service through this interface only, so that a case states the public API it
 * needs before the service offers it. Source: `.agent/KANBAN/EDITION_CARTES/APPROCHE_KANBAN_EDITION_CARTES.md`
 * (class diagram, `KanbanCardService`, D-C7 — two queries and one control, no `addCard` /
 * `updateCard` / `deleteCard`) and `PLAN_TESTS_KANBAN_CARTES.md` (groupes 1 à 5).
 */
interface KanbanCardServiceContract {
  getCardsByColumnId(columnId: string): Promise<KanbanCard[]>;
  saveCardsForColumns(columns: KanbanColumn[]): Promise<void>;
  assertCardsAreSavable(columns: KanbanColumn[]): void;
}

/** A row of the `kanban_cards` table, in its stored shape (D-C1 — no dates). */
interface StoredCardRow {
  id: string;
  column_id: string;
  text: string;
  note_id: string | null;
  position: number;
}

const mocks = vi.hoisted(() => {
  const dbConnection = {
    open: vi.fn(),
    close: vi.fn(),
    execute: vi.fn(),
    run: vi.fn(),
    query: vi.fn(),
  };
  const database = {
    connect: vi.fn(),
    persist: vi.fn(),
  };
  const notesService = {
    getAllNotes: vi.fn(),
    getNoteById: vi.fn(),
  };
  return { dbConnection, database, notesService };
});

/**
 * Builds a `kanban_cards` row as the database holds it: the stored shape, not the model — the
 * owning column and the bare `note_id` included, both of which the model drops (D-C1, D-C2).
 */
function dbRow(overrides: Partial<StoredCardRow> = {}): StoredCardRow {
  const base: StoredCardRow = {
    id: 'card-pain',
    column_id: 'col-todo',
    text: 'Acheter du pain',
    note_id: null,
    position: 0,
  };
  return { ...base, ...overrides };
}

/**
 * Builds a column of the composition the screen hands over, cards included. The default carries
 * `cards: []` — « loaded, and it has none » — because that is what the editor must always set on a
 * column it shows (D-C9); the « cards not loaded » column is written out in full by the only cases
 * that need it (T4.3, T4.5).
 */
function composedColumn(overrides: Partial<KanbanColumn> = {}): KanbanColumn {
  const base: KanbanColumn = {
    id: 'col-todo',
    name: 'À faire',
    position: 0,
    cards: [],
  };
  return { ...base, ...overrides };
}

const ROW_PAIN = dbRow({ id: 'card-pain', text: 'Acheter du pain', position: 0 });
const ROW_LAIT = dbRow({ id: 'card-lait', text: 'Acheter du lait', position: 1 });
const ROW_BEURRE_DOING = dbRow({
  id: 'card-beurre',
  column_id: 'col-doing',
  text: 'Acheter du beurre',
  position: 0,
});

const CARD_PAIN: KanbanCard = { id: 'card-pain', text: 'Acheter du pain', note: null, position: 0 };
const CARD_LAIT: KanbanCard = { id: 'card-lait', text: 'Acheter du lait', note: null, position: 1 };
const CARD_BEURRE: KanbanCard = {
  id: 'card-beurre',
  text: 'Acheter du beurre',
  note: null,
  position: 0,
};

const NOTE_COURSES: Note = {
  id: 'note-courses',
  title: 'Liste de courses',
  category: null,
  blocks: [],
  updatedAt: '2026-11-10T08:00:00.000Z',
};
const NOTE_RECETTE: Note = {
  id: 'note-recette',
  title: 'Recette du gâteau',
  category: null,
  blocks: [],
  updatedAt: '2026-11-11T09:30:00.000Z',
};

/**
 * The rows the fake `kanban_cards` table currently holds, every column together. Reset before each
 * case and seeded by {@link givenStoredCards}.
 */
let storedCardRows: StoredCardRow[] = [];

/**
 * The notes the application holds, behind the {@link NotesService} double. They are the source the
 * read hydrates its references from (D-C14), and a write must leave them untouched (E76, T3.7).
 */
let storedNotes: Note[] = [];

/**
 * Seeds the fake table with the rows standing in the database before the case acts, columns mixed
 * together on purpose: what belongs to another column has to stay out of every result (E62) and
 * out of every removal (E72).
 * @param rows The rows the table holds at the start of the case.
 */
function givenStoredCards(rows: StoredCardRow[]): void {
  storedCardRows = rows.map((row) => ({ ...row }));
}

/**
 * Seeds the notes the references resolve against. A `note_id` pointing outside this set is a note
 * the application no longer has, which is the whole of C74 (E66).
 * @param notes The notes the application holds at the start of the case.
 */
function givenStoredNotes(notes: Note[]): void {
  storedNotes = notes.map((note) => ({ ...note }));
}

/**
 * Applies an upsert to the fake table, the way `INSERT … ON CONFLICT(id) DO UPDATE` does (D-C10):
 * a known identifier has its column, text, reference and position updated in place, an unknown one
 * is appended. The `column_id` sits in the update, which is what carries a move from one column to
 * another without destroying and recreating the row — so the identifier survives (E71).
 * @param upsertedRow The row the write carries.
 */
function applyUpsertToFakeTable(upsertedRow: StoredCardRow): void {
  const existingRowIndex = storedCardRows.findIndex((row) => row.id === upsertedRow.id);
  const isKnownCard = existingRowIndex >= 0;
  if (isKnownCard) {
    storedCardRows[existingRowIndex] = upsertedRow;
    return;
  }
  storedCardRows.push(upsertedRow);
}

/**
 * Applies to the fake table the removal of the cards a column no longer shows, the third phase of
 * a save (D-C8): the rows of that column whose identifier is absent from the kept ones go.
 *
 * The fence on the column is **not** assumed: a removal that does not restrict itself to one
 * column sweeps the whole table here, exactly as the database would. Without that, a statement
 * having lost its `WHERE column_id = ?` would still look harmless, and E72 could not be observed.
 * @param columnId The column the removal restricts itself to, when it does.
 * @param keptCardIds The identifiers the saved composition still carries for that column.
 * @param isFencedToColumn Whether the statement restricts the removal to that one column.
 */
function applyRemovalToFakeTable(
  columnId: string,
  keptCardIds: unknown[],
  isFencedToColumn: boolean,
): void {
  const survivingRows = storedCardRows.filter((row) => {
    const belongsToColumn = row.column_id === columnId;
    const isCandidate = isFencedToColumn ? belongsToColumn : true;
    const isKept = keptCardIds.includes(row.id);
    return !isCandidate || isKept;
  });
  storedCardRows = survivingRows;
}

/**
 * Refuses any statement aimed at a table this service does not own. `KanbanCardService` owns
 * `kanban_cards` alone (D-C6, one service per table): the notes it hydrates come from
 * {@link NotesService}, and the columns belong to `KanbanColumnService`. A write reaching another
 * table is therefore a defect, and refusing it here is what lets T3.7 observe « writing the cards
 * modifies no note » on the notes themselves instead of on a count of statements. The double looks
 * at the statement; no case asserts it.
 * @param statement The statement the service asks the connection to run.
 */
function refuseStatementsAimedAtAnotherTable(statement: string): void {
  const touchesTheCardsTable = /kanban_cards/i.test(statement);
  if (!touchesTheCardsTable) {
    throw new Error(`Table étrangère au service des cartes : ${statement}`);
  }
}

/**
 * Wires the database double onto the fake table, so that what a write stores is what a later read
 * hands back — the only way a removal, the `undefined` guard, an idempotent replay or a
 * convergence can be observed as data rather than as a count of calls.
 *
 * The double dispatches on the leading verb of the statement and on the bound values; no case ever
 * asserts the SQL text, which stays the implementation's business (règle projet). A read returns
 * the rows of the bound column **in storage order**, unsorted: ordering the cards is the service's
 * job (E60). A write binds `(id, column_id, text, note_id, position)` for an upsert (D-C10), and
 * `(columnId, …keptCardIds)` for a removal.
 */
function wireDatabaseDoubleOnFakeTable(): void {
  mocks.dbConnection.query.mockImplementation(
    async (statement: string, values: unknown[] = []) => {
      refuseStatementsAimedAtAnotherTable(statement);
      const askedColumnId = values[0];
      const rowsOfAskedColumn = storedCardRows.filter((row) => row.column_id === askedColumnId);
      return { values: rowsOfAskedColumn.map((row) => ({ ...row })) };
    },
  );

  mocks.dbConnection.run.mockImplementation(async (statement: string, values: unknown[] = []) => {
    refuseStatementsAimedAtAnotherTable(statement);
    const isRemoval = statement.trim().toUpperCase().startsWith('DELETE');
    if (isRemoval) {
      const [columnId, ...keptCardIds] = values;
      const isFencedToColumn = /column_id\s*=\s*\?/i.test(statement);
      applyRemovalToFakeTable(columnId as string, keptCardIds, isFencedToColumn);
      return { changes: { changes: 1 } };
    }
    const [id, columnId, text, noteId, position] = values;
    const upsertedRow: StoredCardRow = {
      id: id as string,
      column_id: columnId as string,
      text: text as string,
      note_id: (noteId as string | null) ?? null,
      position: position as number,
    };
    applyUpsertToFakeTable(upsertedRow);
    return { changes: { changes: 1 } };
  });
}

/**
 * Wires the notes double onto the seeded notes: a reference resolves to the whole note (D-C3), and
 * a `note_id` the application no longer holds resolves to nothing, as `getNoteById` does for a row
 * that disappeared (D-C15).
 */
function wireNotesDoubleOnStoredNotes(): void {
  mocks.notesService.getNoteById.mockImplementation(async (noteId: string) => {
    const foundNote = storedNotes.find((note) => note.id === noteId);
    const isKnownNote = foundNote !== undefined;
    return isKnownNote ? { ...foundNote } : null;
  });
  mocks.notesService.getAllNotes.mockImplementation(async () => {
    return storedNotes.map((note) => ({ ...note }));
  });
}

/**
 * Makes the fake table refuse the writes of one phase of a save, the way a database giving up
 * half-way would: either the upserts (E78, T5.3) or the removal of the cards the composition no
 * longer carries (E78 with C90, T5.4). The writes of the other phase keep landing, which is
 * exactly what leaves the table in the intermediate state a replay then has to converge from.
 * @param failingPhase The write phase that rejects.
 */
function givenFailingWritePhase(failingPhase: 'upsert' | 'removal'): void {
  const applyWriteToFakeTable = mocks.dbConnection.run.getMockImplementation()!;
  mocks.dbConnection.run.mockImplementation(async (statement: string, values: unknown[] = []) => {
    const isRemoval = statement.trim().toUpperCase().startsWith('DELETE');
    const isFailingWrite = failingPhase === 'removal' ? isRemoval : !isRemoval;
    if (isFailingWrite) {
      throw new Error('écriture impossible');
    }
    return applyWriteToFakeTable(statement, values);
  });
}

/**
 * Puts the database double back on its feet after {@link givenFailingWritePhase}, the fake table
 * keeping whatever the failed save left in it — the intermediate state a replay has to converge
 * from (D-L13 descended one level: no transaction, but a replayable save).
 */
function givenWritesWorkingAgain(): void {
  wireDatabaseDoubleOnFakeTable();
}

describe('KanbanCardService (accès SQLite)', () => {
  let service: KanbanCardServiceContract;

  beforeEach(() => {
    storedCardRows = [];
    storedNotes = [];

    mocks.dbConnection.open.mockReset().mockResolvedValue(undefined);
    mocks.dbConnection.close.mockReset().mockResolvedValue(undefined);
    mocks.dbConnection.execute.mockReset().mockResolvedValue({ changes: { changes: 1 } });
    mocks.dbConnection.run.mockReset();
    mocks.dbConnection.query.mockReset();

    mocks.database.connect.mockReset().mockResolvedValue(mocks.dbConnection);
    mocks.database.persist.mockReset().mockResolvedValue(undefined);

    mocks.notesService.getAllNotes.mockReset();
    mocks.notesService.getNoteById.mockReset();

    wireDatabaseDoubleOnFakeTable();
    wireNotesDoubleOnStoredNotes();

    TestBed.configureTestingModule({
      providers: [
        { provide: DatabaseService, useValue: mocks.database },
        { provide: NotesService, useValue: mocks.notesService },
      ],
    });
    service = TestBed.inject(KanbanCardService) as unknown as KanbanCardServiceContract;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Groupe 1 — Lire les cartes d'une colonne (`PLAN_TESTS_KANBAN_CARTES.md`, §6.1). Covers E60
   * (order of the positions), E61 (empty column), E62 (only the requested column), E63 (the whole
   * referenced note), E64 (no reference) and E65 (one read per distinct note), serving US1.
   */
  describe('getCardsByColumnId — les cartes d\'une colonne', () => {
    it('T1.1 renvoie les cartes dans l\'ordre de leurs positions, alors que la base les sort dans un autre ordre', async () => {
      const scrambledRows = [
        dbRow({ id: 'card-beurre', text: 'Acheter du beurre', position: 2 }),
        ROW_PAIN,
        ROW_LAIT,
      ];
      givenStoredCards(scrambledRows);

      const cards = await service.getCardsByColumnId('col-todo');
      const ids = cards.map((card) => card.id);
      const positions = cards.map((card) => card.position);

      expect(ids).toEqual(['card-pain', 'card-lait', 'card-beurre']);
      expect(positions).toEqual([0, 1, 2]);
    });

    it('T1.2 renvoie une liste vide quand la colonne n\'a aucune carte, et non une erreur', async () => {
      givenStoredCards([]);

      const read = service.getCardsByColumnId('col-sans-carte');

      await expect(read).resolves.toEqual([]);
    });

    it('T1.3 ne renvoie que les cartes de la colonne demandée, alors qu\'une autre colonne en porte', async () => {
      givenStoredCards([ROW_PAIN, ROW_BEURRE_DOING, ROW_LAIT]);

      const cards = await service.getCardsByColumnId('col-todo');
      const ids = cards.map((card) => card.id);

      expect(ids).toEqual(['card-pain', 'card-lait']);
    });

    it('T1.4 renvoie la carte liée avec la note entière, titre compris', async () => {
      givenStoredNotes([NOTE_COURSES]);
      const linkedRow = dbRow({ id: 'card-pain', note_id: 'note-courses', position: 0 });
      givenStoredCards([linkedRow]);

      const cards = await service.getCardsByColumnId('col-todo');
      const carriedNote = cards[0].note;

      expect(carriedNote).toEqual(NOTE_COURSES);
    });

    it('T1.5 renvoie la carte sans référence avec une note absente, sans tenter de lire une note', async () => {
      givenStoredNotes([NOTE_COURSES]);
      givenStoredCards([ROW_PAIN]);

      const cards = await service.getCardsByColumnId('col-todo');
      const carriedNote = cards[0].note;

      expect(carriedNote).toBeNull();
      expect(mocks.notesService.getNoteById).not.toHaveBeenCalled();
    });

    it('T1.6 ne déclenche qu\'une lecture de note quand deux cartes visent la même note', async () => {
      givenStoredNotes([NOTE_COURSES]);
      const firstLinkedRow = dbRow({ id: 'card-pain', note_id: 'note-courses', position: 0 });
      const secondLinkedRow = dbRow({
        id: 'card-lait',
        text: 'Acheter du lait',
        note_id: 'note-courses',
        position: 1,
      });
      givenStoredCards([firstLinkedRow, secondLinkedRow]);

      const cards = await service.getCardsByColumnId('col-todo');
      const carriedNotes = cards.map((card) => card.note);

      expect(mocks.notesService.getNoteById).toHaveBeenCalledTimes(1);
      expect(carriedNotes).toEqual([NOTE_COURSES, NOTE_COURSES]);
    });
  });

  /**
   * Groupe 2 — Références manquantes ou illisibles (`PLAN_TESTS_KANBAN_CARTES.md`, §6.1). Covers
   * E66 (note gone), E67 (notes source failing) and E68 (read error rethrown), serving US1 and
   * US5. The first two say the same thing from two causes: the text is the load-bearing data, so a
   * lost reference must not bring the board down (D-C15).
   */
  describe('getCardsByColumnId — références manquantes ou illisibles', () => {
    it('T2.1 rend une carte sans référence quand la note est introuvable, et la lecture aboutit', async () => {
      givenStoredNotes([]);
      const danglingRow = dbRow({ id: 'card-pain', note_id: 'note-disparue', position: 0 });
      givenStoredCards([danglingRow]);

      const read = service.getCardsByColumnId('col-todo');
      await expect(read).resolves.toHaveLength(1);
      const cards = await read;
      const survivingCard = cards[0];

      expect(survivingCard.note).toBeNull();
      expect(survivingCard.text).toBe('Acheter du pain');
    });

    it('T2.2 rend une carte sans référence quand la lecture de la note échoue, et la lecture aboutit', async () => {
      const noteFailure = new Error('lecture de la note impossible');
      mocks.notesService.getNoteById.mockRejectedValue(noteFailure);
      const linkedRow = dbRow({ id: 'card-pain', note_id: 'note-courses', position: 0 });
      givenStoredCards([linkedRow]);

      const read = service.getCardsByColumnId('col-todo');
      await expect(read).resolves.toHaveLength(1);
      const cards = await read;
      const survivingCard = cards[0];

      expect(survivingCard.note).toBeNull();
      expect(survivingCard.text).toBe('Acheter du pain');
    });

    it('T2.3 relance l\'erreur de lecture des cartes au lieu de la convertir en liste vide', async () => {
      const readFailure = new Error('lecture impossible');
      mocks.dbConnection.query.mockRejectedValue(readFailure);

      const read = service.getCardsByColumnId('col-todo');

      await expect(read).rejects.toThrow('lecture impossible');
    });
  });

  /**
   * Groupe 3 — Écrire les cartes affichées (`PLAN_TESTS_KANBAN_CARTES.md`, §6.2). Covers E69 (the
   * composition is written as asked), E71 (a card changes column without losing its identifier)
   * and E76 (the reference is written by the note identifier, the note itself never touched),
   * serving US4, US8 and US9.
   */
  describe('saveCardsForColumns — écrire les cartes affichées', () => {
    it('T3.1 relit la carte ajoutée dans sa colonne', async () => {
      givenStoredCards([ROW_PAIN]);
      const addedCard: KanbanCard = {
        id: 'card-lait',
        text: 'Acheter du lait',
        note: null,
        position: 1,
      };
      const askedColumns = [composedColumn({ cards: [CARD_PAIN, addedCard] })];

      await service.saveCardsForColumns(askedColumns);
      const reReadCards = await service.getCardsByColumnId('col-todo');

      expect(reReadCards).toEqual([CARD_PAIN, addedCard]);
    });

    it('T3.2 relit la carte au texte modifié sous son nouveau texte, avec le même identifiant', async () => {
      givenStoredCards([ROW_PAIN]);
      const retypedCard: KanbanCard = {
        id: 'card-pain',
        text: 'Acheter du pain complet',
        note: null,
        position: 0,
      };
      const askedColumns = [composedColumn({ cards: [retypedCard] })];

      await service.saveCardsForColumns(askedColumns);
      const reReadCards = await service.getCardsByColumnId('col-todo');

      expect(reReadCards).toEqual([retypedCard]);
    });

    it('T3.3 relit la carte déplacée dans sa colonne à son nouveau rang', async () => {
      givenStoredCards([ROW_PAIN, ROW_LAIT]);
      const promotedLaitCard: KanbanCard = {
        id: 'card-lait',
        text: 'Acheter du lait',
        note: null,
        position: 0,
      };
      const demotedPainCard: KanbanCard = {
        id: 'card-pain',
        text: 'Acheter du pain',
        note: null,
        position: 1,
      };
      const askedColumns = [composedColumn({ cards: [promotedLaitCard, demotedPainCard] })];

      await service.saveCardsForColumns(askedColumns);
      const reReadCards = await service.getCardsByColumnId('col-todo');

      expect(reReadCards).toEqual([promotedLaitCard, demotedPainCard]);
    });

    it('T3.4 relit la carte déplacée sous sa nouvelle colonne, avec le même identifiant', async () => {
      givenStoredCards([ROW_PAIN]);
      const movedCard: KanbanCard = {
        id: 'card-pain',
        text: 'Acheter du pain',
        note: null,
        position: 0,
      };
      const emptiedTodoColumn = composedColumn({ cards: [] });
      const receivingDoingColumn = composedColumn({
        id: 'col-doing',
        name: 'En cours',
        position: 1,
        cards: [movedCard],
      });
      const askedColumns = [emptiedTodoColumn, receivingDoingColumn];

      await service.saveCardsForColumns(askedColumns);
      const todoCards = await service.getCardsByColumnId('col-todo');
      const doingCards = await service.getCardsByColumnId('col-doing');

      expect(todoCards).toEqual([]);
      expect(doingCards).toEqual([movedCard]);
    });

    it('T3.5 conserve la référence de la carte à travers ce changement de colonne', async () => {
      givenStoredNotes([NOTE_COURSES]);
      const linkedRow = dbRow({ id: 'card-pain', note_id: 'note-courses', position: 0 });
      givenStoredCards([linkedRow]);
      const movedLinkedCard: KanbanCard = {
        id: 'card-pain',
        text: 'Acheter du pain',
        note: NOTE_COURSES,
        position: 0,
      };
      const emptiedTodoColumn = composedColumn({ cards: [] });
      const receivingDoingColumn = composedColumn({
        id: 'col-doing',
        name: 'En cours',
        position: 1,
        cards: [movedLinkedCard],
      });
      const askedColumns = [emptiedTodoColumn, receivingDoingColumn];

      await service.saveCardsForColumns(askedColumns);
      const doingCards = await service.getCardsByColumnId('col-doing');
      const carriedNote = doingCards[0].note;

      expect(carriedNote).toEqual(NOTE_COURSES);
    });

    it('T3.6 relit correctement une référence posée, retirée, puis reposée', async () => {
      givenStoredNotes([NOTE_COURSES, NOTE_RECETTE]);
      givenStoredCards([ROW_PAIN]);
      const linkedCard: KanbanCard = { ...CARD_PAIN, note: NOTE_COURSES };
      const unlinkedCard: KanbanCard = { ...CARD_PAIN, note: null };
      const relinkedCard: KanbanCard = { ...CARD_PAIN, note: NOTE_RECETTE };

      await service.saveCardsForColumns([composedColumn({ cards: [linkedCard] })]);
      const cardsAfterLinking = await service.getCardsByColumnId('col-todo');
      await service.saveCardsForColumns([composedColumn({ cards: [unlinkedCard] })]);
      const cardsAfterUnlinking = await service.getCardsByColumnId('col-todo');
      await service.saveCardsForColumns([composedColumn({ cards: [relinkedCard] })]);
      const cardsAfterRelinking = await service.getCardsByColumnId('col-todo');

      expect(cardsAfterLinking[0].note).toEqual(NOTE_COURSES);
      expect(cardsAfterUnlinking[0].note).toBeNull();
      expect(cardsAfterRelinking[0].note).toEqual(NOTE_RECETTE);
    });

    it('T3.7 ne modifie aucune note en écrivant les cartes', async () => {
      givenStoredNotes([NOTE_COURSES, NOTE_RECETTE]);
      const linkedRow = dbRow({ id: 'card-pain', note_id: 'note-courses', position: 0 });
      givenStoredCards([linkedRow]);
      const relinkedCard: KanbanCard = {
        id: 'card-pain',
        text: 'Acheter du pain',
        note: NOTE_RECETTE,
        position: 0,
      };
      const askedColumns = [composedColumn({ cards: [relinkedCard] })];

      await service.saveCardsForColumns(askedColumns);
      const reReadCards = await service.getCardsByColumnId('col-todo');
      const carriedNote = reReadCards[0].note;

      expect(storedNotes).toEqual([NOTE_COURSES, NOTE_RECETTE]);
      expect(carriedNote).toEqual(NOTE_RECETTE);
    });
  });

  /**
   * Groupe 4 — Clôture des absentes, et sa garde (`PLAN_TESTS_KANBAN_CARTES.md`, §6.2). Covers E70
   * (the removed cards go), E72 (the other columns are untouched), E73 (a column whose cards are
   * « not loaded » keeps them) and E74 (an empty list does empty the column), serving US6 and US9.
   * E73 and E74 are the two faces of the `undefined` / `[]` distinction (D-C4, D-C9).
   */
  describe('saveCardsForColumns — clôture des absentes', () => {
    it('T4.1 supprime de la base la carte absente de la composition', async () => {
      givenStoredCards([ROW_PAIN, ROW_LAIT]);
      const askedColumns = [composedColumn({ cards: [CARD_PAIN] })];

      await service.saveCardsForColumns(askedColumns);
      const reReadCards = await service.getCardsByColumnId('col-todo');
      const reReadIds = reReadCards.map((card) => card.id);

      expect(reReadIds).toEqual(['card-pain']);
    });

    it('T4.2 ne touche pas aux cartes des autres colonnes en retirant une carte', async () => {
      givenStoredCards([ROW_PAIN, ROW_LAIT, ROW_BEURRE_DOING]);
      const askedColumns = [composedColumn({ cards: [CARD_PAIN] })];

      await service.saveCardsForColumns(askedColumns);
      const otherColumnCards = await service.getCardsByColumnId('col-doing');
      const otherColumnIds = otherColumnCards.map((card) => card.id);

      expect(otherColumnIds).toEqual(['card-beurre']);
    });

    it('T4.3 laisse ses cartes en base à une colonne dont les cartes ne sont pas chargées', async () => {
      givenStoredCards([ROW_PAIN, ROW_LAIT]);
      const unloadedTodoColumn: KanbanColumn = { id: 'col-todo', name: 'À faire', position: 0 };
      const askedColumns = [unloadedTodoColumn];

      await service.saveCardsForColumns(askedColumns);
      const reReadCards = await service.getCardsByColumnId('col-todo');
      const reReadIds = reReadCards.map((card) => card.id);

      expect(reReadIds).toEqual(['card-pain', 'card-lait']);
    });

    it('T4.4 supprime toutes les cartes d\'une colonne à liste vide', async () => {
      givenStoredCards([ROW_PAIN, ROW_LAIT]);
      const emptiedTodoColumn = composedColumn({ cards: [] });
      const askedColumns = [emptiedTodoColumn];

      await service.saveCardsForColumns(askedColumns);
      const reReadCards = await service.getCardsByColumnId('col-todo');

      expect(reReadCards).toEqual([]);
    });

    it('T4.5 garde les cartes de la colonne non chargée et vide celles de la colonne à liste vide, dans le même enregistrement', async () => {
      givenStoredCards([ROW_PAIN, ROW_LAIT, ROW_BEURRE_DOING]);
      const unloadedTodoColumn: KanbanColumn = { id: 'col-todo', name: 'À faire', position: 0 };
      const emptiedDoingColumn = composedColumn({
        id: 'col-doing',
        name: 'En cours',
        position: 1,
        cards: [],
      });
      const askedColumns = [unloadedTodoColumn, emptiedDoingColumn];

      await service.saveCardsForColumns(askedColumns);
      const unloadedColumnCards = await service.getCardsByColumnId('col-todo');
      const unloadedColumnIds = unloadedColumnCards.map((card) => card.id);
      const emptiedColumnCards = await service.getCardsByColumnId('col-doing');

      expect(unloadedColumnIds).toEqual(['card-pain', 'card-lait']);
      expect(emptiedColumnCards).toEqual([]);
    });
  });

  /**
   * Groupe 5 — Refus, échecs et rejouabilité (`PLAN_TESTS_KANBAN_CARTES.md`, §6.2). Covers E75 (an
   * empty text is refused before the first write), E78 (both write phases rethrow), E79 (the cards
   * trigger no flush of their own) and E77 (a save is replayable), serving US2, US3, US9 and US10.
   *
   * E75 is observed on `assertCardsAreSavable`, the control the plan names as its target: it is
   * public precisely so the caller can refuse a composition before writing a single column
   * (D-C7, D-C12), and it queries nothing. That no column is written either is observable one
   * level up, in `KanbanColumnService`.
   */
  describe('saveCardsForColumns — refus, échecs et rejouabilité', () => {
    it('T5.1 refuse l\'enregistrement quand un texte est vide, sans la moindre écriture', () => {
      givenStoredCards([ROW_PAIN]);
      const blankCard: KanbanCard = { id: 'card-vide', text: '   ', note: null, position: 1 };
      const askedColumns = [composedColumn({ cards: [CARD_PAIN, blankCard] })];

      const control = () => service.assertCardsAreSavable(askedColumns);

      expect(control).toThrow();
      expect(mocks.dbConnection.run).not.toHaveBeenCalled();
      expect(mocks.database.persist).not.toHaveBeenCalled();
    });

    it('T5.2 refuse aussi quand le texte vide n\'est pas la première carte de la première colonne', () => {
      givenStoredCards([ROW_PAIN, ROW_BEURRE_DOING]);
      const blankCard: KanbanCard = { id: 'card-vide', text: '   ', note: null, position: 1 };
      const todoColumn = composedColumn({ cards: [CARD_PAIN] });
      const doingColumn = composedColumn({
        id: 'col-doing',
        name: 'En cours',
        position: 1,
        cards: [CARD_BEURRE, blankCard],
      });
      const askedColumns = [todoColumn, doingColumn];

      const control = () => service.assertCardsAreSavable(askedColumns);

      expect(control).toThrow();
      expect(mocks.dbConnection.run).not.toHaveBeenCalled();
      expect(mocks.database.persist).not.toHaveBeenCalled();
    });

    it('T5.3 relance l\'erreur survenue pendant les upserts', async () => {
      givenStoredCards([ROW_PAIN]);
      givenFailingWritePhase('upsert');
      const addedCard: KanbanCard = {
        id: 'card-lait',
        text: 'Acheter du lait',
        note: null,
        position: 1,
      };
      const askedColumns = [composedColumn({ cards: [CARD_PAIN, addedCard] })];

      const save = service.saveCardsForColumns(askedColumns);

      await expect(save).rejects.toThrow('écriture impossible');
    });

    it('T5.4 relance l\'erreur survenue pendant la clôture des absentes', async () => {
      givenStoredCards([ROW_PAIN, ROW_LAIT]);
      givenFailingWritePhase('removal');
      const askedColumns = [composedColumn({ cards: [CARD_PAIN] })];

      const save = service.saveCardsForColumns(askedColumns);

      await expect(save).rejects.toThrow('écriture impossible');
    });

    it('T5.5 ne demande aucun flush, même à plusieurs colonnes et plusieurs cartes', async () => {
      givenStoredCards([ROW_PAIN, ROW_BEURRE_DOING]);
      const addedCard: KanbanCard = {
        id: 'card-lait',
        text: 'Acheter du lait',
        note: null,
        position: 1,
      };
      const todoColumn = composedColumn({ cards: [CARD_PAIN, addedCard] });
      const doingColumn = composedColumn({
        id: 'col-doing',
        name: 'En cours',
        position: 1,
        cards: [CARD_BEURRE],
      });
      const askedColumns = [todoColumn, doingColumn];

      await service.saveCardsForColumns(askedColumns);
      const writeOrders = mocks.dbConnection.run.mock.invocationCallOrder;

      expect(writeOrders.length).toBeGreaterThan(1);
      expect(mocks.database.persist).not.toHaveBeenCalled();
    });

    it('T5.6 donne le même résultat en ré-enregistrant une composition identique, sans doublon', async () => {
      givenStoredCards([ROW_PAIN]);
      const addedCard: KanbanCard = {
        id: 'card-lait',
        text: 'Acheter du lait',
        note: null,
        position: 1,
      };
      const askedColumns = [composedColumn({ cards: [CARD_PAIN, addedCard] })];

      await service.saveCardsForColumns(askedColumns);
      const cardsAfterFirstSave = await service.getCardsByColumnId('col-todo');
      await service.saveCardsForColumns(askedColumns);
      const cardsAfterReplay = await service.getCardsByColumnId('col-todo');

      expect(cardsAfterFirstSave).toEqual([CARD_PAIN, addedCard]);
      expect(cardsAfterReplay).toEqual([CARD_PAIN, addedCard]);
    });

    it('T5.7 converge vers la composition attendue en rejouant depuis l\'état intermédiaire laissé par un échec', async () => {
      const storedBeurreRow = dbRow({ id: 'card-beurre', text: 'Acheter du beurre', position: 2 });
      givenStoredCards([ROW_PAIN, ROW_LAIT, storedBeurreRow]);
      const askedColumns = [composedColumn({ cards: [CARD_PAIN, CARD_LAIT] })];
      givenFailingWritePhase('removal');

      const failedSave = service.saveCardsForColumns(askedColumns);
      await expect(failedSave).rejects.toThrow('écriture impossible');
      const cardsLeftByTheFailure = await service.getCardsByColumnId('col-todo');
      const idsLeftByTheFailure = cardsLeftByTheFailure.map((card) => card.id);

      givenWritesWorkingAgain();
      await service.saveCardsForColumns(askedColumns);
      const reReadCards = await service.getCardsByColumnId('col-todo');

      expect(idsLeftByTheFailure).toEqual(['card-pain', 'card-lait', 'card-beurre']);
      expect(reReadCards).toEqual([CARD_PAIN, CARD_LAIT]);
    });
  });
});

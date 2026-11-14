import { KanbanCard, KanbanColumn, Note } from '../models';

import * as kanbanCompositionModule from './kanban-composition';
import type { CardLocation, MoveDirection } from './kanban-composition';

/**
 * Tests of `kanban-composition` — the PURE algebra the kanban editor applies to the composition it
 * shows: no Angular, no DOM, no database, no double. TDD / black box.
 *
 * Source: `.agent/KANBAN/EDITION_CARTES/PLAN_TESTS_KANBAN_CARTES.md` §6.6 (groups 10 → 19, cases
 * `T10.1` → `T19.7`, effects `E94` → `E114`, causes `C108` → `C132`), which folded in the earlier
 * `PLAN_TESTS_KANBAN_COMPOSITION.md`. Development approach: the same folder's
 * `APPROCHE_KANBAN_EDITION_CARTES.md`, batch E (`D-C18`, `D-C19`, `D-C20`). Precedent of form: `edit-history.spec.ts` and `document-model.spec.ts`, the other pure
 * modules of the repository, instantiated straight away with no test bed.
 *
 * Doubles: NONE. The module has no dependency, so a case is a composition in, a composition out.
 *
 * Frozen decisions (`DM1` → `DM10`, plan §7, and the four arbitrations of 2026-11-13):
 *   DM1  — a column whose cards are « not loaded » reads as empty; a column the gesture touches
 *         comes back with an explicit list, a column it does not touch comes back as it was.
 *   DM2  — a gesture returns a NEW composition; neither the received composition, nor its columns,
 *         nor its cards are modified.
 *   DM3  — a gesture that does not apply returns the RECEIVED composition itself, not a copy of it
 *         (arbitrated 2026-11-13): hence `toBe(columns)` in T10.4, T11.5, T12.5, T13.4, T14.3, T14.4,
 *         T14.5, T15.6, T15.7, T15.8 and T17.8.
 *   DM4  — renumbering covers EVERY card of the touched column, from 0, not only those that moved.
 *   DM5  — the horizontal landing rank is the smallest of the origin rank and the target length.
 *   DM6  — `canMoveCard` and the move functions share one rule: « unavailable » ⟺ « composition
 *         returned unchanged ». T17.8 checks that equivalence.
 *   DM7  — the signature carries only: per column, identifier, name and position; per card,
 *         identifier, text, note IDENTIFIER and position. Never the content of the note, which is
 *         what T19.7 observes.
 *   DM8  — every function goes through one common lookup, which finds nothing for an unknown
 *         identifier — hence `E110` for each of them.
 *   DM9  — purity (`E111`) is checked by ONE case sweeping the nine gestures (T18.1), not
 *         re-asserted in every case (arbitrated 2026-11-13).
 *   DM10 — the module exports named functions, not a class: it holds no state.
 *   `MoveDirection` is `'up' | 'down' | 'left' | 'right'`, extending the `'left' | 'right'` the
 *   columns already use (arbitrated 2026-11-13).
 *   `locateCard` stays public — the screen needs it to name the card in the removal popup (E143) —
 *   but no case drives it directly: it is exercised THROUGH the other functions, and its limit
 *   case is `E110` (arbitrated 2026-11-13).
 */

/**
 * The whole call surface the cases drive: the API contract of the module, the equivalent of the
 * DOM contract of a component plan. §9 of the unified plan leaves it to be folded in from
 * `PLAN_TESTS_KANBAN_COMPOSITION.md` §8, which is where these eleven functions are written down.
 * Binding the module to it is what freezes the API: a case may only call what this contract names,
 * and the implementation must honor all of it, `locateCard` included even though no case calls it.
 */
interface KanbanCompositionContract {
  locateCard(columns: KanbanColumn[], cardId: string): CardLocation | null;
  addCardTo(columns: KanbanColumn[], columnId: string, card: KanbanCard): KanbanColumn[];
  replaceCardText(columns: KanbanColumn[], cardId: string, text: string): KanbanColumn[];
  setCardNote(columns: KanbanColumn[], cardId: string, note: Note | null): KanbanColumn[];
  removeCard(columns: KanbanColumn[], cardId: string): KanbanColumn[];
  moveCardUp(columns: KanbanColumn[], cardId: string): KanbanColumn[];
  moveCardDown(columns: KanbanColumn[], cardId: string): KanbanColumn[];
  moveCardToPreviousColumn(columns: KanbanColumn[], cardId: string): KanbanColumn[];
  moveCardToNextColumn(columns: KanbanColumn[], cardId: string): KanbanColumn[];
  canMoveCard(columns: KanbanColumn[], cardId: string, direction: MoveDirection): boolean;
  compositionSignature(columns: KanbanColumn[]): string;
}

/** The module under test, seen through the contract above. */
const kanbanComposition: KanbanCompositionContract = kanbanCompositionModule;

/**
 * The note the standard composition references, held as a shared constant on purpose: a case
 * checking that a reference survives a gesture asserts on the very object it put in (`toBe`).
 */
const NOTE_FOURNITURES: Note = {
  id: 'note-fournitures',
  title: 'Liste des fournitures',
  category: null,
  blocks: [],
  updatedAt: '2026-11-10T08:00:00.000Z',
};

/** The note a case hands over when it poses a reference, told apart by its identifier. */
const NOTE_RECETTE: Note = {
  id: 'note-recette',
  title: 'Recette du gâteau',
  category: null,
  blocks: [],
  updatedAt: '2026-11-11T09:30:00.000Z',
};

// --- Builders (no test bed, no double) ---------------------------------------

/**
 * Builds a card as the editor hands it over: a text, a rank, and a reference only when one is
 * given — the three cases the model does not tell apart all read as « no note » (D-C2).
 * @param id Identifier forged by the screen, which designates the card in every gesture (D-C20).
 * @param text What there is to do, stored as it is handed over: no trimming here (D-C30).
 * @param position Zero-based rank of the card inside its column.
 * @param linkedNote The referenced note, or `null` for a card carrying no reference.
 */
function buildCard(
  id: string,
  text: string,
  position: number,
  linkedNote: Note | null = null,
): KanbanCard {
  return { id, text, note: linkedNote, position };
}

/**
 * Builds a column of the composition the editor shows. Its cards are always an explicit list, even
 * empty: a shown column never carries `undefined`, which would mean « cards not loaded » (D-C9).
 * @param id Identifier of the column.
 * @param name Name the user reads.
 * @param position Zero-based rank of the column in the board.
 * @param cards Cards of the column, top to bottom.
 */
function buildColumn(id: string, name: string, position: number, cards: KanbanCard[]): KanbanColumn {
  return { id, name, position, cards };
}

/**
 * The composition the cases start from unless they say otherwise: three columns, the first
 * carrying three cards — what `C129` asks for, and the smallest column that tells « one notch »
 * from « sent to the edge » apart — the second two, the third one. The second column's first card
 * carries a reference, which is what lets `C130` be set up without rebuilding anything.
 *
 * Every call rebuilds the whole graph, columns and cards included, so a case may assert on object
 * identity (DM1, DM3) without another case's objects interfering.
 */
function standardComposition(): KanbanColumn[] {
  const painCard = buildCard('card-pain', 'Acheter du pain', 0);
  const laitCard = buildCard('card-lait', 'Acheter du lait', 1);
  const oeufsCard = buildCard('card-oeufs', 'Acheter des œufs', 2);
  const planCard = buildCard('card-plan', 'Préparer la rentrée', 0, NOTE_FOURNITURES);
  const devisCard = buildCard('card-devis', 'Comparer les devis', 1);
  const cadeauCard = buildCard('card-cadeau', 'Acheter le cadeau', 0);
  const todoColumn = buildColumn('col-todo', 'À faire', 0, [painCard, laitCard, oeufsCard]);
  const doingColumn = buildColumn('col-doing', 'En cours', 1, [planCard, devisCard]);
  const doneColumn = buildColumn('col-done', 'Fait', 2, [cadeauCard]);
  return [todoColumn, doingColumn, doneColumn];
}

/**
 * The standard composition with its last column emptied — « loaded, and it has none » (DM1), the
 * empty state of a column on the edit screen. Serves the target-is-empty paths of `E94` and `E99`.
 */
function compositionWithEmptyLastColumn(): KanbanColumn[] {
  const painCard = buildCard('card-pain', 'Acheter du pain', 0);
  const laitCard = buildCard('card-lait', 'Acheter du lait', 1);
  const oeufsCard = buildCard('card-oeufs', 'Acheter des œufs', 2);
  const planCard = buildCard('card-plan', 'Préparer la rentrée', 0, NOTE_FOURNITURES);
  const devisCard = buildCard('card-devis', 'Comparer les devis', 1);
  const todoColumn = buildColumn('col-todo', 'À faire', 0, [painCard, laitCard, oeufsCard]);
  const doingColumn = buildColumn('col-doing', 'En cours', 1, [planCard, devisCard]);
  const doneColumn = buildColumn('col-done', 'Fait', 2, []);
  return [todoColumn, doingColumn, doneColumn];
}

/**
 * A composition whose FIRST column is shorter than the rank of a card of the second: one card on
 * the left, three on the right. The only shape that exercises the landing rule leftwards (`C125`
 * towards the previous column, T15.4).
 */
function compositionWithShortFirstColumn(): KanbanColumn[] {
  const painCard = buildCard('card-pain', 'Acheter du pain', 0);
  const planCard = buildCard('card-plan', 'Préparer la rentrée', 0, NOTE_FOURNITURES);
  const devisCard = buildCard('card-devis', 'Comparer les devis', 1);
  const auditCard = buildCard('card-audit', 'Relire le devis', 2);
  const todoColumn = buildColumn('col-todo', 'À faire', 0, [painCard]);
  const doingColumn = buildColumn('col-doing', 'En cours', 1, [planCard, devisCard, auditCard]);
  return [todoColumn, doingColumn];
}

/**
 * A board of a SINGLE column, which offers no horizontal move in either direction (`C124`): its
 * only column is at once the first and the last.
 */
function singleColumnComposition(): KanbanColumn[] {
  const painCard = buildCard('card-pain', 'Acheter du pain', 0);
  const laitCard = buildCard('card-lait', 'Acheter du lait', 1);
  const oeufsCard = buildCard('card-oeufs', 'Acheter des œufs', 2);
  const todoColumn = buildColumn('col-todo', 'À faire', 0, [painCard, laitCard, oeufsCard]);
  return [todoColumn];
}

/**
 * A composition where two cards of two different columns carry the SAME text (`C131`). It is what
 * tells « designated by its identifier » from « found by its text » apart (T11.2).
 */
function compositionWithTwinTexts(): KanbanColumn[] {
  const painCard = buildCard('card-pain', 'Acheter du pain', 0);
  const laitCard = buildCard('card-lait', 'Acheter du lait', 1);
  const painTwinCard = buildCard('card-pain-bis', 'Acheter du pain', 0);
  const todoColumn = buildColumn('col-todo', 'À faire', 0, [painCard, laitCard]);
  const doingColumn = buildColumn('col-doing', 'En cours', 1, [painTwinCard]);
  return [todoColumn, doingColumn];
}

// --- Readers (what a case observes of a composition) -------------------------

/**
 * The column carrying this identifier. A case asking for a column it never put in the composition
 * is a defect of the case, so the absence throws instead of reading as `undefined`.
 * @param columns The composition observed.
 * @param columnId Identifier of the column looked for.
 */
function columnById(columns: KanbanColumn[], columnId: string): KanbanColumn {
  const foundColumn = columns.find((column) => column.id === columnId);
  if (!foundColumn) {
    throw new Error(`Colonne absente de la composition : ${columnId}`);
  }
  return foundColumn;
}

/**
 * Cards of a column, top to bottom, as the screen would render them. A column whose cards are not
 * loaded reads as an empty list, which is what DM1 states.
 * @param columns The composition observed.
 * @param columnId Identifier of the column observed.
 */
function cardsOf(columns: KanbanColumn[], columnId: string): KanbanCard[] {
  const observedColumn = columnById(columns, columnId);
  return observedColumn.cards ?? [];
}

/**
 * Identifiers of a column's cards, in the order the column holds them — the order the screen
 * renders, which a position says nothing about on its own.
 * @param columns The composition observed.
 * @param columnId Identifier of the column observed.
 */
function cardIdsOf(columns: KanbanColumn[], columnId: string): string[] {
  const observedCards = cardsOf(columns, columnId);
  return observedCards.map((card) => card.id);
}

/**
 * Positions of a column's cards, in the order the column holds them. Read on its own, it is what
 * says whether the renumbering left a hole (`E104`, `E105`).
 * @param columns The composition observed.
 * @param columnId Identifier of the column observed.
 */
function cardPositionsOf(columns: KanbanColumn[], columnId: string): number[] {
  const observedCards = cardsOf(columns, columnId);
  return observedCards.map((card) => card.position);
}

/**
 * A column's cards as « identifier at position » readings, in the order the column holds them. It
 * is the one reading that catches an order and a numbering gone out of step — the card sitting at
 * the right place while carrying a stale position.
 * @param columns The composition observed.
 * @param columnId Identifier of the column observed.
 */
function cardRanksOf(columns: KanbanColumn[], columnId: string): string[] {
  const observedCards = cardsOf(columns, columnId);
  return observedCards.map((card) => `${card.id}@${card.position}`);
}

/**
 * The card carrying this identifier, wherever it sits in the composition, or `null` when the
 * composition no longer holds it.
 * @param columns The composition observed.
 * @param cardId Identifier of the card looked for.
 */
function findCard(columns: KanbanColumn[], cardId: string): KanbanCard | null {
  const everyCard = columns.flatMap((column) => column.cards ?? []);
  const foundCard = everyCard.find((card) => card.id === cardId);
  return foundCard ?? null;
}

/**
 * The identifier of the column holding this card, or `null` when no column does. It is what tells
 * « the card changed column » from « the card stayed where it was ».
 * @param columns The composition observed.
 * @param cardId Identifier of the card looked for.
 */
function columnIdHolding(columns: KanbanColumn[], cardId: string): string | null {
  const holdingColumn = columns.find((column) => {
    const columnCards = column.cards ?? [];
    return columnCards.some((card) => card.id === cardId);
  });
  return holdingColumn?.id ?? null;
}

/** Number of cards the whole board carries, every column together. */
function totalCardCount(columns: KanbanColumn[]): number {
  const everyCard = columns.flatMap((column) => column.cards ?? []);
  return everyCard.length;
}

describe('kanban-composition (algèbre de la composition, module pur)', () => {
  // ==========================================================================
  // Groupe 18 — Pureté (E111) · posé en premier : le filet tient pendant que le reste s'écrit
  // ==========================================================================
  describe('pureté de la composition reçue', () => {
    it('T18.1 les neuf gestes, appliqués à une même composition, la laissent identique à ce qu\'elle était', () => {
      const columns = standardComposition();
      const compositionBefore = structuredClone(columns);
      const addedCard = buildCard('card-neuve', 'Préparer le repas', 0);

      kanbanComposition.addCardTo(columns, 'col-todo', addedCard);
      kanbanComposition.replaceCardText(columns, 'card-pain', 'Acheter du pain complet');
      kanbanComposition.setCardNote(columns, 'card-pain', NOTE_RECETTE);
      kanbanComposition.setCardNote(columns, 'card-plan', null);
      kanbanComposition.removeCard(columns, 'card-oeufs');
      kanbanComposition.moveCardUp(columns, 'card-oeufs');
      kanbanComposition.moveCardDown(columns, 'card-pain');
      kanbanComposition.moveCardToPreviousColumn(columns, 'card-devis');
      kanbanComposition.moveCardToNextColumn(columns, 'card-lait');

      expect(columns).toEqual(compositionBefore);
    });

    it('T18.2 les colonnes non touchées par un geste reviennent telles quelles', () => {
      const columns = standardComposition();
      const untouchedDoingColumn = columnById(columns, 'col-doing');
      const untouchedDoneColumn = columnById(columns, 'col-done');

      const result = kanbanComposition.moveCardUp(columns, 'card-oeufs');

      expect(columnById(result, 'col-doing')).toBe(untouchedDoingColumn);
      expect(columnById(result, 'col-done')).toBe(untouchedDoneColumn);
    });
  });

  // ==========================================================================
  // Groupe 10 — Ajouter une carte (E94, E110 · US2)
  // ==========================================================================
  describe('addCardTo — ajouter une carte à une colonne', () => {
    it('T10.1 la carte ajoutée se retrouve en queue d\'une colonne qui en portait déjà trois', () => {
      const columns = standardComposition();
      const addedCard = buildCard('card-neuve', 'Préparer la rentrée', 0);

      const result = kanbanComposition.addCardTo(columns, 'col-todo', addedCard);
      const todoIds = cardIdsOf(result, 'col-todo');

      expect(todoIds).toEqual(['card-pain', 'card-lait', 'card-oeufs', 'card-neuve']);
    });

    it('T10.2 la carte ajoutée à une colonne vide en devient l\'unique carte', () => {
      const columns = compositionWithEmptyLastColumn();
      const addedCard = buildCard('card-neuve', 'Préparer la rentrée', 0);

      const result = kanbanComposition.addCardTo(columns, 'col-done', addedCard);
      const doneRanks = cardRanksOf(result, 'col-done');

      expect(doneRanks).toEqual(['card-neuve@0']);
    });

    it('T10.3 les cartes déjà présentes ne bougent pas de rang, et les autres colonnes sont intactes', () => {
      const columns = standardComposition();
      const addedCard = buildCard('card-neuve', 'Préparer la rentrée', 0);

      const result = kanbanComposition.addCardTo(columns, 'col-todo', addedCard);
      const todoRanks = cardRanksOf(result, 'col-todo');
      const alreadyPresentRanks = todoRanks.slice(0, 3);
      const doingRanks = cardRanksOf(result, 'col-doing');
      const doneRanks = cardRanksOf(result, 'col-done');

      expect(alreadyPresentRanks).toEqual(['card-pain@0', 'card-lait@1', 'card-oeufs@2']);
      expect(doingRanks).toEqual(['card-plan@0', 'card-devis@1']);
      expect(doneRanks).toEqual(['card-cadeau@0']);
    });

    it('T10.4 ajouter à une colonne inexistante rend la composition telle quelle', () => {
      const columns = standardComposition();
      const addedCard = buildCard('card-neuve', 'Préparer la rentrée', 0);

      const result = kanbanComposition.addCardTo(columns, 'col-inconnue', addedCard);

      expect(result).toBe(columns);
    });
  });

  // ==========================================================================
  // Groupe 11 — Modifier le texte d'une carte (E101, E110 · US3)
  // ==========================================================================
  describe('replaceCardText — remplacer le texte d\'une carte', () => {
    it('T11.1 seule la carte désignée porte le nouveau texte', () => {
      const columns = standardComposition();

      const result = kanbanComposition.replaceCardText(columns, 'card-lait', 'Acheter du lait entier');
      const retypedCard = findCard(result, 'card-lait');
      const previousCard = findCard(result, 'card-pain');
      const nextCard = findCard(result, 'card-oeufs');

      expect(retypedCard?.text).toBe('Acheter du lait entier');
      expect(previousCard?.text).toBe('Acheter du pain');
      expect(nextCard?.text).toBe('Acheter des œufs');
    });

    it('T11.2 une autre carte au même texte n\'est pas touchée : la cible est l\'identifiant, pas le texte', () => {
      const columns = compositionWithTwinTexts();

      const result = kanbanComposition.replaceCardText(columns, 'card-pain', 'Acheter du pain complet');
      const retypedCard = findCard(result, 'card-pain');
      const twinCard = findCard(result, 'card-pain-bis');

      expect(retypedCard?.text).toBe('Acheter du pain complet');
      expect(twinCard?.text).toBe('Acheter du pain');
    });

    it('T11.3 le texte est stocké tel quel, espaces compris : ni nettoyage, ni repli', () => {
      const columns = standardComposition();
      const paddedText = '   Acheter du pain de seigle   ';

      const withPaddedText = kanbanComposition.replaceCardText(columns, 'card-pain', paddedText);
      const withEmptyText = kanbanComposition.replaceCardText(columns, 'card-pain', '');
      const paddedCard = findCard(withPaddedText, 'card-pain');
      const emptyCard = findCard(withEmptyText, 'card-pain');

      expect(paddedCard?.text).toBe(paddedText);
      expect(emptyCard?.text).toBe('');
    });

    it('T11.4 la position, la colonne et la référence de la carte sont inchangées', () => {
      const columns = standardComposition();

      const result = kanbanComposition.replaceCardText(columns, 'card-plan', 'Préparer la rentrée des deux');
      const retypedCard = findCard(result, 'card-plan');
      const holdingColumnId = columnIdHolding(result, 'card-plan');

      expect(retypedCard?.position).toBe(0);
      expect(holdingColumnId).toBe('col-doing');
      expect(retypedCard?.note).toBe(NOTE_FOURNITURES);
    });

    it('T11.5 un identifiant inconnu rend la composition telle quelle', () => {
      const columns = standardComposition();

      const result = kanbanComposition.replaceCardText(columns, 'card-inconnue', 'Acheter du pain complet');

      expect(result).toBe(columns);
    });
  });

  // ==========================================================================
  // Groupe 12 — Poser et retirer une référence (E102, E103, E110 · US4)
  // ==========================================================================
  describe('setCardNote — poser et retirer la référence d\'une carte', () => {
    it('T12.1 seule la carte désignée porte la note entière reçue', () => {
      const columns = standardComposition();

      const result = kanbanComposition.setCardNote(columns, 'card-lait', NOTE_RECETTE);
      const linkedCard = findCard(result, 'card-lait');
      const previousCard = findCard(result, 'card-pain');
      const nextCard = findCard(result, 'card-oeufs');

      expect(linkedCard?.note).toBe(NOTE_RECETTE);
      expect(previousCard?.note).toBeNull();
      expect(nextCard?.note).toBeNull();
    });

    it('T12.2 le texte et la position de la carte sont inchangés', () => {
      const columns = standardComposition();

      const result = kanbanComposition.setCardNote(columns, 'card-lait', NOTE_RECETTE);
      const linkedCard = findCard(result, 'card-lait');

      expect(linkedCard?.text).toBe('Acheter du lait');
      expect(linkedCard?.position).toBe(1);
    });

    it('T12.3 une carte qui portait une référence se retrouve sans note', () => {
      const columns = standardComposition();

      const result = kanbanComposition.setCardNote(columns, 'card-plan', null);
      const unlinkedCard = findCard(result, 'card-plan');

      expect(unlinkedCard?.note).toBeNull();
      expect(unlinkedCard?.text).toBe('Préparer la rentrée');
    });

    it('T12.4 retirer la référence d\'une carte qui n\'en a pas la laisse telle quelle', () => {
      const columns = standardComposition();

      const result = kanbanComposition.setCardNote(columns, 'card-lait', null);
      const untouchedCard = findCard(result, 'card-lait');

      expect(untouchedCard?.note).toBeNull();
      expect(result).toEqual(columns);
    });

    it('T12.5 un identifiant inconnu rend la composition telle quelle', () => {
      const columns = standardComposition();

      const result = kanbanComposition.setCardNote(columns, 'card-inconnue', NOTE_RECETTE);

      expect(result).toBe(columns);
    });
  });

  // ==========================================================================
  // Groupe 13 — Retirer une carte (E100, E110 · US6)
  // ==========================================================================
  describe('removeCard — retirer une carte de sa colonne', () => {
    it('T13.1 la carte retirée au milieu disparaît, ses deux voisines restent', () => {
      const columns = standardComposition();

      const result = kanbanComposition.removeCard(columns, 'card-lait');
      const todoIds = cardIdsOf(result, 'col-todo');

      expect(todoIds).toEqual(['card-pain', 'card-oeufs']);
    });

    it('T13.2 les cartes des autres colonnes sont intactes', () => {
      const columns = standardComposition();

      const result = kanbanComposition.removeCard(columns, 'card-lait');
      const doingRanks = cardRanksOf(result, 'col-doing');
      const doneRanks = cardRanksOf(result, 'col-done');

      expect(doingRanks).toEqual(['card-plan@0', 'card-devis@1']);
      expect(doneRanks).toEqual(['card-cadeau@0']);
    });

    it('T13.3 retirer la dernière carte laisse une colonne vide, et non « non chargée »', () => {
      const columns = standardComposition();

      const result = kanbanComposition.removeCard(columns, 'card-cadeau');
      const emptiedColumn = columnById(result, 'col-done');

      expect(emptiedColumn.cards).toEqual([]);
      expect(emptiedColumn.cards).not.toBeUndefined();
    });

    it('T13.4 un identifiant inconnu rend la composition telle quelle', () => {
      const columns = standardComposition();

      const result = kanbanComposition.removeCard(columns, 'card-inconnue');

      expect(result).toBe(columns);
    });
  });

  // ==========================================================================
  // Groupe 16 — Renumérotation (E104, E105 · US2, US6, US8)
  // ==========================================================================
  describe('renumérotation des positions', () => {
    it('T16.1 après un ajout, les positions de la colonne vont de 0 à n sans trou', () => {
      const columns = standardComposition();
      const addedCard = buildCard('card-neuve', 'Préparer la rentrée', 0);

      const result = kanbanComposition.addCardTo(columns, 'col-todo', addedCard);
      const todoPositions = cardPositionsOf(result, 'col-todo');

      expect(todoPositions).toEqual([0, 1, 2, 3]);
    });

    it('T16.2 après un retrait au milieu, les positions se referment : pas de trou', () => {
      const columns = standardComposition();

      const result = kanbanComposition.removeCard(columns, 'card-lait');
      const todoPositions = cardPositionsOf(result, 'col-todo');

      expect(todoPositions).toEqual([0, 1]);
    });

    it('T16.3 après un déplacement vertical, les positions suivent le nouvel ordre affiché', () => {
      const columns = standardComposition();

      const result = kanbanComposition.moveCardUp(columns, 'card-oeufs');
      const todoRanks = cardRanksOf(result, 'col-todo');

      expect(todoRanks).toEqual(['card-pain@0', 'card-oeufs@1', 'card-lait@2']);
    });

    it('T16.4 après un déplacement horizontal, la colonne quittée repart de 0 sans trou', () => {
      const columns = standardComposition();

      const result = kanbanComposition.moveCardToNextColumn(columns, 'card-lait');
      const sourceRanks = cardRanksOf(result, 'col-todo');

      expect(sourceRanks).toEqual(['card-pain@0', 'card-oeufs@1']);
    });

    it('T16.5 après ce même déplacement, la colonne d\'arrivée repart de 0 sans doublon', () => {
      const columns = standardComposition();

      const result = kanbanComposition.moveCardToNextColumn(columns, 'card-lait');
      const targetRanks = cardRanksOf(result, 'col-doing');

      expect(targetRanks).toEqual(['card-plan@0', 'card-lait@1', 'card-devis@2']);
    });
  });

  // ==========================================================================
  // Groupe 14 — Déplacer une carte dans sa colonne (E95, E96, E106, E107, E112 · US8)
  // ==========================================================================
  describe('moveCardUp / moveCardDown — déplacer une carte dans sa colonne', () => {
    it('T14.1 la carte du milieu monte d\'un cran, et d\'un seul', () => {
      const columns = standardComposition();

      const result = kanbanComposition.moveCardUp(columns, 'card-oeufs');
      const todoIds = cardIdsOf(result, 'col-todo');

      expect(todoIds).toEqual(['card-pain', 'card-oeufs', 'card-lait']);
    });

    it('T14.2 la carte du milieu descend d\'un cran, et d\'un seul', () => {
      const columns = standardComposition();

      const result = kanbanComposition.moveCardDown(columns, 'card-pain');
      const todoIds = cardIdsOf(result, 'col-todo');

      expect(todoIds).toEqual(['card-lait', 'card-pain', 'card-oeufs']);
    });

    it('T14.3 monter la carte en tête rend la composition telle quelle', () => {
      const columns = standardComposition();

      const result = kanbanComposition.moveCardUp(columns, 'card-pain');

      expect(result).toBe(columns);
    });

    it('T14.4 descendre la carte en queue rend la composition telle quelle', () => {
      const columns = standardComposition();

      const result = kanbanComposition.moveCardDown(columns, 'card-oeufs');

      expect(result).toBe(columns);
    });

    it('T14.5 une carte seule dans sa colonne ne bouge ni vers le haut ni vers le bas', () => {
      const columns = standardComposition();

      const movedUp = kanbanComposition.moveCardUp(columns, 'card-cadeau');
      const movedDown = kanbanComposition.moveCardDown(columns, 'card-cadeau');

      expect(movedUp).toBe(columns);
      expect(movedDown).toBe(columns);
    });

    it('T14.6 le texte et la référence de la carte déplacée sont inchangés', () => {
      const columns = standardComposition();

      const result = kanbanComposition.moveCardDown(columns, 'card-plan');
      const movedCard = findCard(result, 'card-plan');

      expect(movedCard?.text).toBe('Préparer la rentrée');
      expect(movedCard?.note).toBe(NOTE_FOURNITURES);
    });
  });

  // ==========================================================================
  // Groupe 15 — Déplacer une carte d'une colonne à l'autre
  // (E97, E98, E99, E108, E109, E112 · US8)
  // ==========================================================================
  describe('moveCardToPreviousColumn / moveCardToNextColumn — déplacer une carte d\'une colonne à l\'autre', () => {
    it('T15.1 la carte passe à droite et garde son rang vertical', () => {
      const columns = standardComposition();

      const result = kanbanComposition.moveCardToNextColumn(columns, 'card-lait');
      const targetIds = cardIdsOf(result, 'col-doing');
      const movedCard = findCard(result, 'card-lait');
      const holdingColumnId = columnIdHolding(result, 'card-lait');

      expect(targetIds).toEqual(['card-plan', 'card-lait', 'card-devis']);
      expect(movedCard?.position).toBe(1);
      expect(holdingColumnId).toBe('col-doing');
    });

    it('T15.2 la carte passe à gauche et garde son rang vertical', () => {
      const columns = standardComposition();

      const result = kanbanComposition.moveCardToPreviousColumn(columns, 'card-devis');
      const targetIds = cardIdsOf(result, 'col-todo');
      const movedCard = findCard(result, 'card-devis');
      const holdingColumnId = columnIdHolding(result, 'card-devis');

      expect(targetIds).toEqual(['card-pain', 'card-devis', 'card-lait', 'card-oeufs']);
      expect(movedCard?.position).toBe(1);
      expect(holdingColumnId).toBe('col-todo');
    });

    it('T15.3 vers une cible plus courte, la carte se pose en dernier', () => {
      const columns = standardComposition();

      const result = kanbanComposition.moveCardToNextColumn(columns, 'card-oeufs');
      const targetRanks = cardRanksOf(result, 'col-doing');

      expect(targetRanks).toEqual(['card-plan@0', 'card-devis@1', 'card-oeufs@2']);
    });

    it('T15.4 la règle de l\'atterrissage vaut aussi vers la gauche', () => {
      const columns = compositionWithShortFirstColumn();

      const result = kanbanComposition.moveCardToPreviousColumn(columns, 'card-audit');
      const targetRanks = cardRanksOf(result, 'col-todo');

      expect(targetRanks).toEqual(['card-pain@0', 'card-audit@1']);
    });

    it('T15.5 vers une cible vide, la carte en devient l\'unique carte', () => {
      const columns = compositionWithEmptyLastColumn();

      const result = kanbanComposition.moveCardToNextColumn(columns, 'card-devis');
      const targetRanks = cardRanksOf(result, 'col-done');

      expect(targetRanks).toEqual(['card-devis@0']);
    });

    it('T15.6 aller à gauche depuis la première colonne rend la composition telle quelle', () => {
      const columns = standardComposition();

      const result = kanbanComposition.moveCardToPreviousColumn(columns, 'card-pain');

      expect(result).toBe(columns);
    });

    it('T15.7 aller à droite depuis la dernière colonne rend la composition telle quelle', () => {
      const columns = standardComposition();

      const result = kanbanComposition.moveCardToNextColumn(columns, 'card-cadeau');

      expect(result).toBe(columns);
    });

    it('T15.8 dans un tableau d\'une seule colonne, aucun des deux sens ne déplace', () => {
      const columns = singleColumnComposition();

      const movedLeft = kanbanComposition.moveCardToPreviousColumn(columns, 'card-lait');
      const movedRight = kanbanComposition.moveCardToNextColumn(columns, 'card-lait');

      expect(movedLeft).toBe(columns);
      expect(movedRight).toBe(columns);
    });

    it('T15.9 la carte garde son identifiant, son texte et sa référence en changeant de colonne', () => {
      const columns = standardComposition();

      const result = kanbanComposition.moveCardToNextColumn(columns, 'card-plan');
      const movedCard = findCard(result, 'card-plan');
      const holdingColumnId = columnIdHolding(result, 'card-plan');

      expect(movedCard?.id).toBe('card-plan');
      expect(movedCard?.text).toBe('Préparer la rentrée');
      expect(movedCard?.note).toBe(NOTE_FOURNITURES);
      expect(holdingColumnId).toBe('col-done');
    });

    it('T15.10 le nombre total de cartes du tableau est inchangé', () => {
      const columns = standardComposition();
      const countBefore = totalCardCount(columns);

      const result = kanbanComposition.moveCardToNextColumn(columns, 'card-lait');
      const countAfter = totalCardCount(result);

      expect(countBefore).toBe(6);
      expect(countAfter).toBe(6);
    });

    it('T15.11 les colonnes ni source ni cible sont intactes', () => {
      const columns = standardComposition();

      const result = kanbanComposition.moveCardToNextColumn(columns, 'card-lait');
      const untouchedRanks = cardRanksOf(result, 'col-done');

      expect(untouchedRanks).toEqual(['card-cadeau@0']);
    });
  });

  // ==========================================================================
  // Groupe 17 — Disponibilité d'un déplacement (E113 · US8)
  // ==========================================================================
  describe('canMoveCard — disponibilité d\'un déplacement', () => {
    it('T17.1 « vers le haut » est indisponible pour la carte en tête, disponible pour les autres', () => {
      const columns = standardComposition();

      const headCanMoveUp = kanbanComposition.canMoveCard(columns, 'card-pain', 'up');
      const middleCanMoveUp = kanbanComposition.canMoveCard(columns, 'card-lait', 'up');
      const tailCanMoveUp = kanbanComposition.canMoveCard(columns, 'card-oeufs', 'up');

      expect(headCanMoveUp).toBe(false);
      expect(middleCanMoveUp).toBe(true);
      expect(tailCanMoveUp).toBe(true);
    });

    it('T17.2 « vers le bas » est indisponible pour la carte en queue', () => {
      const columns = standardComposition();

      const tailCanMoveDown = kanbanComposition.canMoveCard(columns, 'card-oeufs', 'down');
      const headCanMoveDown = kanbanComposition.canMoveCard(columns, 'card-pain', 'down');

      expect(tailCanMoveDown).toBe(false);
      expect(headCanMoveDown).toBe(true);
    });

    it('T17.3 « vers la gauche » est indisponible dans la première colonne', () => {
      const columns = standardComposition();

      const firstColumnCanMoveLeft = kanbanComposition.canMoveCard(columns, 'card-pain', 'left');
      const middleColumnCanMoveLeft = kanbanComposition.canMoveCard(columns, 'card-plan', 'left');

      expect(firstColumnCanMoveLeft).toBe(false);
      expect(middleColumnCanMoveLeft).toBe(true);
    });

    it('T17.4 « vers la droite » est indisponible dans la dernière colonne', () => {
      const columns = standardComposition();

      const lastColumnCanMoveRight = kanbanComposition.canMoveCard(columns, 'card-cadeau', 'right');
      const firstColumnCanMoveRight = kanbanComposition.canMoveCard(columns, 'card-lait', 'right');

      expect(lastColumnCanMoveRight).toBe(false);
      expect(firstColumnCanMoveRight).toBe(true);
    });

    it('T17.5 une carte seule dans sa colonne n\'offre aucun déplacement vertical', () => {
      const columns = standardComposition();

      const loneCanMoveUp = kanbanComposition.canMoveCard(columns, 'card-cadeau', 'up');
      const loneCanMoveDown = kanbanComposition.canMoveCard(columns, 'card-cadeau', 'down');

      expect(loneCanMoveUp).toBe(false);
      expect(loneCanMoveDown).toBe(false);
    });

    it('T17.6 un tableau d\'une seule colonne n\'offre aucun déplacement horizontal', () => {
      const columns = singleColumnComposition();

      const canMoveLeft = kanbanComposition.canMoveCard(columns, 'card-lait', 'left');
      const canMoveRight = kanbanComposition.canMoveCard(columns, 'card-lait', 'right');

      expect(canMoveLeft).toBe(false);
      expect(canMoveRight).toBe(false);
    });

    it('T17.7 un identifiant inconnu rend « indisponible » dans les quatre directions', () => {
      const columns = standardComposition();

      const canMoveUp = kanbanComposition.canMoveCard(columns, 'card-inconnue', 'up');
      const canMoveDown = kanbanComposition.canMoveCard(columns, 'card-inconnue', 'down');
      const canMoveLeft = kanbanComposition.canMoveCard(columns, 'card-inconnue', 'left');
      const canMoveRight = kanbanComposition.canMoveCard(columns, 'card-inconnue', 'right');

      expect(canMoveUp).toBe(false);
      expect(canMoveDown).toBe(false);
      expect(canMoveLeft).toBe(false);
      expect(canMoveRight).toBe(false);
    });

    it('T17.8 pour chaque direction, « indisponible » et « composition inchangée » coïncident', () => {
      const columns = standardComposition();

      const headCanMoveUp = kanbanComposition.canMoveCard(columns, 'card-pain', 'up');
      const headMovedUp = kanbanComposition.moveCardUp(columns, 'card-pain');
      const tailCanMoveDown = kanbanComposition.canMoveCard(columns, 'card-oeufs', 'down');
      const tailMovedDown = kanbanComposition.moveCardDown(columns, 'card-oeufs');
      const firstColumnCanMoveLeft = kanbanComposition.canMoveCard(columns, 'card-pain', 'left');
      const firstColumnMovedLeft = kanbanComposition.moveCardToPreviousColumn(columns, 'card-pain');
      const lastColumnCanMoveRight = kanbanComposition.canMoveCard(columns, 'card-cadeau', 'right');
      const lastColumnMovedRight = kanbanComposition.moveCardToNextColumn(columns, 'card-cadeau');
      const middleCanMoveUp = kanbanComposition.canMoveCard(columns, 'card-lait', 'up');
      const middleMovedUp = kanbanComposition.moveCardUp(columns, 'card-lait');
      const middleCanMoveRight = kanbanComposition.canMoveCard(columns, 'card-lait', 'right');
      const middleMovedRight = kanbanComposition.moveCardToNextColumn(columns, 'card-lait');

      expect(headCanMoveUp).toBe(false);
      expect(headMovedUp).toBe(columns);
      expect(tailCanMoveDown).toBe(false);
      expect(tailMovedDown).toBe(columns);
      expect(firstColumnCanMoveLeft).toBe(false);
      expect(firstColumnMovedLeft).toBe(columns);
      expect(lastColumnCanMoveRight).toBe(false);
      expect(lastColumnMovedRight).toBe(columns);
      expect(middleCanMoveUp).toBe(true);
      expect(middleMovedUp).not.toBe(columns);
      expect(middleCanMoveRight).toBe(true);
      expect(middleMovedRight).not.toBe(columns);
    });
  });

  // ==========================================================================
  // Groupe 19 — Signature de la composition (E114 · US10)
  // ==========================================================================
  describe('compositionSignature — la signature de la composition', () => {
    it('T19.1 la signature change après un ajout', () => {
      const columns = standardComposition();
      const signatureBefore = kanbanComposition.compositionSignature(columns);
      const addedCard = buildCard('card-neuve', 'Préparer la rentrée', 0);

      const result = kanbanComposition.addCardTo(columns, 'col-todo', addedCard);
      const signatureAfter = kanbanComposition.compositionSignature(result);

      expect(signatureAfter).not.toBe(signatureBefore);
    });

    it('T19.2 la signature change après un remplacement de texte', () => {
      const columns = standardComposition();
      const signatureBefore = kanbanComposition.compositionSignature(columns);

      const result = kanbanComposition.replaceCardText(columns, 'card-pain', 'Acheter du pain complet');
      const signatureAfter = kanbanComposition.compositionSignature(result);

      expect(signatureAfter).not.toBe(signatureBefore);
    });

    it('T19.3 la signature change après un retrait', () => {
      const columns = standardComposition();
      const signatureBefore = kanbanComposition.compositionSignature(columns);

      const result = kanbanComposition.removeCard(columns, 'card-lait');
      const signatureAfter = kanbanComposition.compositionSignature(result);

      expect(signatureAfter).not.toBe(signatureBefore);
    });

    it('T19.4 la signature change après un déplacement, vertical comme horizontal', () => {
      const columns = standardComposition();
      const signatureBefore = kanbanComposition.compositionSignature(columns);

      const movedUp = kanbanComposition.moveCardUp(columns, 'card-oeufs');
      const movedRight = kanbanComposition.moveCardToNextColumn(columns, 'card-lait');
      const signatureAfterVerticalMove = kanbanComposition.compositionSignature(movedUp);
      const signatureAfterHorizontalMove = kanbanComposition.compositionSignature(movedRight);

      expect(signatureAfterVerticalMove).not.toBe(signatureBefore);
      expect(signatureAfterHorizontalMove).not.toBe(signatureBefore);
    });

    it('T19.5 la signature change quand une référence est posée ou retirée', () => {
      const columns = standardComposition();
      const signatureBefore = kanbanComposition.compositionSignature(columns);

      const withNotePosed = kanbanComposition.setCardNote(columns, 'card-lait', NOTE_RECETTE);
      const withNoteRemoved = kanbanComposition.setCardNote(columns, 'card-plan', null);
      const signatureAfterPosing = kanbanComposition.compositionSignature(withNotePosed);
      const signatureAfterRemoving = kanbanComposition.compositionSignature(withNoteRemoved);

      expect(signatureAfterPosing).not.toBe(signatureBefore);
      expect(signatureAfterRemoving).not.toBe(signatureBefore);
    });

    it('T19.6 deux compositions de même contenu donnent la même signature', () => {
      const columns = standardComposition();
      const twinColumns = standardComposition();

      const signature = kanbanComposition.compositionSignature(columns);
      const twinSignature = kanbanComposition.compositionSignature(twinColumns);

      expect(twinSignature).toBe(signature);
    });

    it('T19.7 la signature ne retient que les champs de DM7 : un champ hors signature ne la fait pas bouger', () => {
      const columns = standardComposition();
      const signatureBefore = kanbanComposition.compositionSignature(columns);
      const renamedNote: Note = {
        id: 'note-fournitures',
        title: 'Fournitures scolaires 2026',
        category: null,
        blocks: [],
        updatedAt: '2026-11-13T18:00:00.000Z',
      };

      const result = kanbanComposition.setCardNote(columns, 'card-plan', renamedNote);
      const signatureAfter = kanbanComposition.compositionSignature(result);

      expect(signatureAfter).toBe(signatureBefore);
    });
  });
});

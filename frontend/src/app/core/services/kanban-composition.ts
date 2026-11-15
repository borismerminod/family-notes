import { KanbanCard } from '../models/kanban-card.model';
import { KanbanColumn } from '../models/kanban-column.model';
import { Note } from '../models/note.model';

/**
 * @file kanban-composition.ts
 * @description **Pure** algebra of the board composition the kanban editor shows — batch E of the
 * cards feature (see .agent/KANBAN/EDITION_CARTES/APPROCHE_KANBAN_EDITION_CARTES.md, D-C18). No
 * Angular, no DOM, no database, following the precedent of `document-model.ts`,
 * `document-selection.ts` and `edit-history.ts`.
 *
 * Every gesture takes the shown columns and returns a **new** array of columns, so the editor
 * stays the single source of truth while the delicate rules — rank kept when a card changes
 * column, landing at the bottom of a shorter column, renumbering without a hole — are testable on
 * their own, with no component to mount (D-C18, D-C19).
 *
 * Named functions, not a class: the module holds no state (DM10). A gesture that does not apply
 * returns the **received** composition itself, which is what lets a case check « nothing moved »
 * by identity (DM3).
 *
 * Implemented in TDD, case by case, against `PLAN_TESTS_KANBAN_CARTES.md` §6.6 (groups 10 → 19,
 * cases `T10.1` → `T19.7`), whose API contract freezes the eleven functions exported here.
 *
 * Every local variable, loop counter and callback signature is annotated, even where TypeScript
 * would infer it (AGENT.md § 4): in a module whose values are all shaped alike — a composition, a
 * list of cards, a rank — the type written down is what tells the reader which of the three a name
 * holds.
 */

/** Direction a move may take, shared with the arrows `KanbanColumnPanel` renders (US8). */
export type MoveDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Where a card sits in the composition: the column holding it and that column's rank in the
 * board, the card itself and its rank inside the column. Every gesture goes through the one
 * lookup that produces it, which finds nothing for an unknown identifier (DM8).
 */
export interface CardLocation {
  /** The column holding the card, as the composition holds it. */
  column: KanbanColumn;
  /** Zero-based rank of that column in the board, left to right. */
  columnIndex: number;
  /** The card looked for, as the column holds it. */
  card: KanbanCard;
  /** Zero-based rank of the card inside its column, top to bottom. */
  cardIndex: number;
}

/**
 * Locates a card anywhere in the composition. It is the one lookup every card gesture goes
 * through (DM8), and it stays public because the editor needs it too — naming the card in the
 * removal popup (D-C18). A column whose cards are not loaded reads as empty (DM1).
 * @param columns The composition shown by the editor.
 * @param cardId Identifier of the card looked for.
 * @returns Where the card sits, or `null` when no column holds it.
 */
export function locateCard(columns: KanbanColumn[], cardId: string): CardLocation | null {
  for (let columnIndex: number = 0; columnIndex < columns.length; columnIndex += 1) {
    const visitedColumn: KanbanColumn = columns[columnIndex];
    const visitedCards: KanbanCard[] = visitedColumn.cards ?? [];
    const cardIndex: number = visitedCards.findIndex(
      (visitedCard: KanbanCard): boolean => visitedCard.id === cardId,
    );
    if (cardIndex !== -1) {
      const foundCard: KanbanCard = visitedCards[cardIndex];
      return {
        column: visitedColumn,
        columnIndex,
        card: foundCard,
        cardIndex,
      };
    }
  }
  return null;
}

/**
 * Renumbers a list of cards from its index, so the model never carries a stale position (D-C19).
 * It covers **every** card of the list, not only those that moved, and restarts from 0 (DM4).
 * @param cards The cards of one column, top to bottom.
 * @returns A new list of new cards, each carrying its own rank in the list.
 */
function reindexCards(cards: KanbanCard[]): KanbanCard[] {
  return cards.map((card: KanbanCard, rank: number): KanbanCard => ({ ...card, position: rank }));
}

/**
 * Rebuilds the composition with one column carrying a new list of cards, **renumbered** (D-C19).
 * Only that column becomes a new object: the columns the gesture does not touch come back as they
 * were (DM1, DM2).
 *
 * Every gesture that changes the cards of a column goes through here, which is what makes the
 * contiguous numbering an invariant of the module rather than a step each gesture has to
 * remember on its own.
 * @param columns The composition shown by the editor.
 * @param columnIndex Rank of the touched column in the board.
 * @param cards The list of cards that column now carries, always explicit — never `undefined`.
 * @returns A new composition.
 */
function withColumnCards(
  columns: KanbanColumn[],
  columnIndex: number,
  cards: KanbanCard[],
): KanbanColumn[] {
  const columnBefore: KanbanColumn = columns[columnIndex];
  const renumberedCards: KanbanCard[] = reindexCards(cards);
  const touchedColumn: KanbanColumn = { ...columnBefore, cards: renumberedCards };
  const touchedComposition: KanbanColumn[] = [...columns];
  touchedComposition[columnIndex] = touchedColumn;
  return touchedComposition;
}

/**
 * Rebuilds the composition with one card swapped for another at the very same rank.
 * @param columns The composition shown by the editor.
 * @param location Where the replaced card sits, as {@link locateCard} found it.
 * @param replacementCard The card that takes its place.
 * @returns A new composition.
 */
function withCardReplaced(
  columns: KanbanColumn[],
  location: CardLocation,
  replacementCard: KanbanCard,
): KanbanColumn[] {
  const cardsBefore: KanbanCard[] = location.column.cards ?? [];
  const touchedCards: KanbanCard[] = [...cardsBefore];
  touchedCards[location.cardIndex] = replacementCard;
  return withColumnCards(columns, location.columnIndex, touchedCards);
}

/**
 * Rebuilds the composition with a card and one of its neighbours of the same column swapped —
 * what « one notch » means for a vertical move (US8).
 * @param columns The composition shown by the editor.
 * @param location Where the moved card sits, as {@link locateCard} found it.
 * @param neighbourIndex Rank, inside the same column, of the card it trades places with.
 * @returns A new composition.
 */
function withNeighbourSwapped(
  columns: KanbanColumn[],
  location: CardLocation,
  neighbourIndex: number,
): KanbanColumn[] {
  const cardsBefore: KanbanCard[] = location.column.cards ?? [];
  const neighbourCard: KanbanCard = cardsBefore[neighbourIndex];
  const swappedCards: KanbanCard[] = [...cardsBefore];
  swappedCards[location.cardIndex] = neighbourCard;
  swappedCards[neighbourIndex] = location.card;
  return withColumnCards(columns, location.columnIndex, swappedCards);
}

/**
 * Rebuilds the composition with a card moved to another column, keeping its **vertical rank** — or
 * landing it **last** when the target column is shorter, which is the smallest of the origin rank
 * and the target length (H-C4, DM5).
 *
 * The card leaves its column before it joins the other, so **both** columns go through
 * {@link withColumnCards} and come back renumbered without a hole (D-C19). The card object itself
 * travels untouched: it is the same card, moved, not a card destroyed and rebuilt (US8).
 * @param columns The composition shown by the editor.
 * @param location Where the moved card sits, as {@link locateCard} found it.
 * @param targetColumnIndex Rank, in the board, of the column the card joins.
 * @returns A new composition where both columns are replaced.
 */
function withCardMovedToColumn(
  columns: KanbanColumn[],
  location: CardLocation,
  targetColumnIndex: number,
): KanbanColumn[] {
  const sourceCards: KanbanCard[] = location.column.cards ?? [];
  const remainingCards: KanbanCard[] = sourceCards.filter(
    (sourceCard: KanbanCard): boolean => sourceCard.id !== location.card.id,
  );
  const compositionWithoutCard: KanbanColumn[] = withColumnCards(
    columns,
    location.columnIndex,
    remainingCards,
  );
  const targetColumn: KanbanColumn = compositionWithoutCard[targetColumnIndex];
  const targetCards: KanbanCard[] = targetColumn.cards ?? [];
  const landingRank: number = Math.min(location.cardIndex, targetCards.length);
  const landedCards: KanbanCard[] = [...targetCards];
  landedCards.splice(landingRank, 0, location.card);
  return withColumnCards(compositionWithoutCard, targetColumnIndex, landedCards);
}

/**
 * Adds a card at the **last position** of the column it targets, leaving the cards already there
 * at their rank (US2).
 * @param columns The composition shown by the editor.
 * @param columnId Identifier of the column the card joins.
 * @param card The card to add, already carrying the identifier the screen forged for it (D-C20).
 * @returns A new composition, or the received one when no column carries that identifier.
 */
export function addCardTo(
  columns: KanbanColumn[],
  columnId: string,
  card: KanbanCard,
): KanbanColumn[] {
  const targetIndex: number = columns.findIndex(
    (visitedColumn: KanbanColumn): boolean => visitedColumn.id === columnId,
  );
  if (targetIndex === -1) {
    return columns;
  }
  const targetColumn: KanbanColumn = columns[targetIndex];
  const cardsBefore: KanbanCard[] = targetColumn.cards ?? [];
  const grownCards: KanbanCard[] = [...cardsBefore, card];
  return withColumnCards(columns, targetIndex, grownCards);
}

/**
 * Replaces the text of one card, touching neither its position, nor its column, nor its reference
 * (US3). The text is stored as it is handed over: trimming and the « Sans titre » fallback belong
 * to the editor (D-C30).
 * @param columns The composition shown by the editor.
 * @param cardId Identifier of the card to retype.
 * @param text The new text.
 * @returns A new composition, or the received one when no card carries that identifier.
 */
export function replaceCardText(
  columns: KanbanColumn[],
  cardId: string,
  text: string,
): KanbanColumn[] {
  const location: CardLocation | null = locateCard(columns, cardId);
  if (!location) {
    return columns;
  }
  const retypedCard: KanbanCard = { ...location.card, text };
  return withCardReplaced(columns, location, retypedCard);
}

/**
 * Poses the referenced note on one card, or clears it (US4).
 * @param columns The composition shown by the editor.
 * @param cardId Identifier of the card to link or unlink.
 * @param note The note to reference, or `null` to unlink the card.
 * @returns A new composition, or the received one when no card carries that identifier.
 */
export function setCardNote(
  columns: KanbanColumn[],
  cardId: string,
  note: Note | null,
): KanbanColumn[] {
  const location: CardLocation | null = locateCard(columns, cardId);
  if (!location) {
    return columns;
  }
  const relinkedCard: KanbanCard = { ...location.card, note };
  return withCardReplaced(columns, location, relinkedCard);
}

/**
 * Removes one card and renumbers its column, leaving no hole in the positions (US6).
 * @param columns The composition shown by the editor.
 * @param cardId Identifier of the card to remove.
 * @returns A new composition, or the received one when no card carries that identifier.
 */
export function removeCard(columns: KanbanColumn[], cardId: string): KanbanColumn[] {
  const location: CardLocation | null = locateCard(columns, cardId);
  if (!location) {
    return columns;
  }
  const cardsBefore: KanbanCard[] = location.column.cards ?? [];
  const remainingCards: KanbanCard[] = cardsBefore.filter(
    (remainingCard: KanbanCard): boolean => remainingCard.id !== cardId,
  );
  return withColumnCards(columns, location.columnIndex, remainingCards);
}

/**
 * Swaps a card with its immediate neighbour above, inside its own column (US8).
 * @param columns The composition shown by the editor.
 * @param cardId Identifier of the card to push up.
 * @returns A new composition, or the received one when the card is already at the top.
 */
export function moveCardUp(columns: KanbanColumn[], cardId: string): KanbanColumn[] {
  const location: CardLocation | null = locateCard(columns, cardId);
  if (!location) {
    return columns;
  }
  const neighbourIndex: number = location.cardIndex - 1;
  if (neighbourIndex < 0) {
    return columns;
  }
  return withNeighbourSwapped(columns, location, neighbourIndex);
}

/**
 * Swaps a card with its immediate neighbour below, inside its own column (US8).
 * @param columns The composition shown by the editor.
 * @param cardId Identifier of the card to push down.
 * @returns A new composition, or the received one when the card is already at the bottom.
 */
export function moveCardDown(columns: KanbanColumn[], cardId: string): KanbanColumn[] {
  const location: CardLocation | null = locateCard(columns, cardId);
  if (!location) {
    return columns;
  }
  const cardsBefore: KanbanCard[] = location.column.cards ?? [];
  const neighbourIndex: number = location.cardIndex + 1;
  if (neighbourIndex >= cardsBefore.length) {
    return columns;
  }
  return withNeighbourSwapped(columns, location, neighbourIndex);
}

/**
 * Moves a card to the column immediately on its left, keeping its vertical rank — or landing it
 * last when that column is shorter (H-C4, DM5).
 * @param columns The composition shown by the editor.
 * @param cardId Identifier of the card to push left.
 * @returns A new composition, or the received one when the card is in the first column.
 */
export function moveCardToPreviousColumn(
  columns: KanbanColumn[],
  cardId: string,
): KanbanColumn[] {
  const location: CardLocation | null = locateCard(columns, cardId);
  if (!location) {
    return columns;
  }
  const targetColumnIndex: number = location.columnIndex - 1;
  if (targetColumnIndex < 0) {
    return columns;
  }
  return withCardMovedToColumn(columns, location, targetColumnIndex);
}

/**
 * Moves a card to the column immediately on its right, keeping its vertical rank — or landing it
 * last when that column is shorter (H-C4, DM5).
 * @param columns The composition shown by the editor.
 * @param cardId Identifier of the card to push right.
 * @returns A new composition, or the received one when the card is in the last column.
 */
export function moveCardToNextColumn(columns: KanbanColumn[], cardId: string): KanbanColumn[] {
  const location: CardLocation | null = locateCard(columns, cardId);
  if (!location) {
    return columns;
  }
  const targetColumnIndex: number = location.columnIndex + 1;
  if (targetColumnIndex >= columns.length) {
    return columns;
  }
  return withCardMovedToColumn(columns, location, targetColumnIndex);
}

/** One move gesture, as {@link MOVE_GESTURE_BY_DIRECTION} holds it. */
type MoveGesture = (columns: KanbanColumn[], cardId: string) => KanbanColumn[];

/**
 * The gesture each of the four directions stands for. {@link canMoveCard} going through this very
 * table is what makes DM6 hold **by construction**: availability is not a second set of edge rules
 * to keep in step with the gestures, it is the gesture itself reporting whether it had anything to
 * do.
 */
const MOVE_GESTURE_BY_DIRECTION: Record<MoveDirection, MoveGesture> = {
  up: moveCardUp,
  down: moveCardDown,
  left: moveCardToPreviousColumn,
  right: moveCardToNextColumn,
};

/**
 * Says whether a direction would move the card, which is what disables an arrow rather than
 * hiding it (D-L23). It shares one rule with the move functions: « unavailable » means « the
 * composition would come back unchanged » (DM6).
 *
 * It answers by **running** the gesture and looking at what comes back, which costs one discarded
 * composition — negligible at the scale of a board (a few columns, a few dozen cards) against the
 * guarantee that the two rules can never drift apart.
 * @param columns The composition shown by the editor.
 * @param cardId Identifier of the selected card.
 * @param direction The direction asked about.
 * @returns `true` when the move would change the composition.
 */
export function canMoveCard(
  columns: KanbanColumn[],
  cardId: string,
  direction: MoveDirection,
): boolean {
  const moveGesture: MoveGesture = MOVE_GESTURE_BY_DIRECTION[direction];
  const movedComposition: KanbanColumn[] = moveGesture(columns, cardId);
  return movedComposition !== columns;
}

/**
 * The nested readings a signature is built from: strings, numbers, absent references and the
 * lists that hold them.
 */
type SignatureFields = (string | number | null | SignatureFields)[];

/**
 * The fields of one card the signature retains (DM7): its identifier, its text, the **identifier**
 * of the note it references — never the note's content, so renaming a note does not read as a
 * change to the board — and its position.
 * @param card The card to read.
 * @returns Its signature fields, in a fixed order.
 */
function signatureFieldsOfCard(card: KanbanCard): SignatureFields {
  const referencedNoteId: string | null = card.note?.id ?? null;
  return [card.id, card.text, referencedNoteId, card.position];
}

/**
 * The fields of one column the signature retains (DM7): its identifier, its name, its position,
 * and the fields of each of its cards, in the order the column holds them. A column whose cards
 * are not loaded reads as empty (DM1).
 * @param column The column to read.
 * @returns Its signature fields, in a fixed order.
 */
function signatureFieldsOfColumn(column: KanbanColumn): SignatureFields {
  const columnCards: KanbanCard[] = column.cards ?? [];
  const cardFields: SignatureFields[] = columnCards.map(
    (columnCard: KanbanCard): SignatureFields => signatureFieldsOfCard(columnCard),
  );
  return [column.id, column.name, column.position, cardFields];
}

/**
 * Builds the string `hasPendingChanges` compares to tell a composed board from the one that was
 * loaded. It carries only the identifier, name and position of each column, and the identifier,
 * text, **note identifier** and position of each card — never the content of a note, which would
 * make the comparison costly and brittle (D-C39, DM7).
 * @param columns The composition shown by the editor.
 * @returns A signature equal for two compositions of equal content.
 */
export function compositionSignature(columns: KanbanColumn[]): string {
  const columnFields: SignatureFields[] = columns.map(
    (visitedColumn: KanbanColumn): SignatureFields => signatureFieldsOfColumn(visitedColumn),
  );
  return JSON.stringify(columnFields);
}

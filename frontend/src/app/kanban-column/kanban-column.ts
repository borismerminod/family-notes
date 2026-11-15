import { Component, computed, input, output, signal, Signal } from '@angular/core';
import { KanbanCardPanel } from '../kanban-card/kanban-card';
import { CardTextChange, KanbanCard, KanbanColumn } from '../core/models';
import { MoveDirection } from '../core/services/kanban-composition';

/** What `selectedCardIndex` answers when the selected card is none of this column's (D-C26). */
const NOT_IN_THIS_COLUMN = -1;

/**
 * One column (the user reads « liste ») of a kanban board, inside the content area of
 * `KanbanEditor`. It shows the column name in a header, carries the trash that asks for its
 * removal, and renders one `KanbanCardPanel` per card of the column in its `.column-cards` area
 * (D-C22) — the anchor point D-L21 had held present and empty for this batch.
 *
 * The class is named `KanbanColumnPanel` because `KanbanColumn` is the model it receives as input,
 * and the collision would be real (D-L22).
 *
 * **Purely presentational** (D-L23): no service, no router, no decision. The rename is edited in
 * place in the header (D-L18) and emitted **as it was typed** — cleaning the spaces and falling
 * back on « Sans titre » (D-L17) belong to the editor, which already applies those rules to the
 * board name, and duplicating them here would see them diverge one day. The trash emits a
 * *request*: the confirmation popup (D-L4) and the composition itself stay in the editor.
 *
 * The selection and the move mode are states of the **whole board**, so they come in through
 * inputs and the panel only ever emits requests (D-C23).
 *
 * The column received is never modified nor copied: a new name comes back through the input once
 * the editor has replaced the column.
 *
 * Built against `PLAN_TESTS_KANBAN_EDITION_LISTES.md`, group 5 (cases T5.1 to T5.11), and
 * `PLAN_TESTS_KANBAN_CARTES.md`, groups 23 to 26 (cases T23.1 to T26.5).
 */
@Component({
  selector: 'app-kanban-column',
  standalone: true,
  imports: [KanbanCardPanel],
  templateUrl: './kanban-column.html',
  styleUrl: './kanban-column.css',
})
export class KanbanColumnPanel {
  /**
   * Column to display. Read on every access rather than copied on construction, so the panel
   * follows its input: the editor replaces the column whenever it renames or renumbers its
   * composition (D-L12).
   */
  column = input.required<KanbanColumn>();

  /**
   * Identifier of the card the editor holds as selected, or `null` when none is. It may well
   * designate a card of **another** column: the single selection spans the whole board, and the
   * panel owns none of it (D-C23).
   *
   * The four inputs of the move mode default to the board **at rest** — nothing selected, mode
   * off, no side move announced — so that a host which says nothing of the mode gets a column
   * that renders no arrow, rather than no column at all.
   */
  selectedCardId = input<string | null>(null);

  /** Whether the board is in move mode, which is a state of the board and not of a column (D-C23). */
  moveMode = input<boolean>(false);

  /**
   * Whether the editor announces the move of the selected card to the column on the left as
   * possible. It comes in rather than being decided here: the column ignores its own rank in the
   * board (D-C25).
   */
  canMoveCardLeft = input<boolean>(false);

  /** Whether the editor announces the move to the column on the right as possible (D-C25). */
  canMoveCardRight = input<boolean>(false);

  /**
   * Emitted when the in-place rename is validated, carrying the text **as it was typed** —
   * neither trimmed nor replaced by the fallback name (D-L23).
   */
  renamed = output<string>();

  /** Emitted when the trash is touched: a request, nothing else — the editor decides (D-L4). */
  removeRequested = output<void>();

  /** Emitted with the identifier of the card touched in move mode, the editor holding the single selection (D-C23). */
  cardSelected = output<string>();

  /**
   * Emitted when a card validated its text entry, carrying the card **and** the text as it was
   * typed: the card speaks for itself, the column says which one spoke (D-C22).
   */
  cardTextChanged = output<CardTextChange>();

  /** Emitted with the identifier of the card whose reference control was touched: the editor owns the note picker (D-C36). */
  cardNoteRequested = output<string>();

  /**
   * Emitted with the identifier of the **note** whose title was touched — and not that of the
   * card: the editor navigates by the note, once it has made sure nothing is pending (D-C37).
   */
  cardNoteOpenRequested = output<string>();

  /** Emitted with the identifier of the card whose trash was touched: a request, nothing else (D-C28). */
  cardRemoveRequested = output<string>();

  /** Emitted with the direction of the touched arrow, the editor moving the selected card (D-C26). */
  cardMoveRequested = output<MoveDirection>();

  /** Emitted when the add button is touched: the editor opens the entry of the new card (D-C29). */
  addCardRequested = output<void>();

  /** Emitted when the « déplacer » button is touched: a toggle, the mode belonging to the board (D-C23). */
  moveModeToggled = output<void>();

  /** Whether the in-place rename field takes the place of the displayed name in the header. */
  isRenaming = signal<boolean>(false);

  /**
   * Text held by the rename field, prefilled with the current name when the field opens and
   * dropped when the rename is given up. Kept apart from the column, which this panel never
   * modifies.
   */
  typedName = signal<string>('');

  /**
   * Cards of the column, in the order the input gives them. A column whose cards are **not
   * loaded** — `cards` absent (D-C4) — reads as a column with none, so the panel renders nothing
   * for it rather than failing.
   */
  cards: Signal<KanbanCard[]> = computed((): KanbanCard[] => {
    const loadedCards: KanbanCard[] | undefined = this.column().cards;
    return loadedCards ?? [];
  });

  /**
   * Zero-based rank of the selected card in this column's pile, or {@link NOT_IN_THIS_COLUMN}
   * when the card the editor holds as selected is none of this column's — or when none is.
   */
  private selectedCardIndex: Signal<number> = computed((): number => {
    const selectedId: string | null = this.selectedCardId();
    if (selectedId === null) {
      return NOT_IN_THIS_COLUMN;
    }
    const ownCards: KanbanCard[] = this.cards();
    return ownCards.findIndex((card: KanbanCard): boolean => card.id === selectedId);
  });

  /**
   * Whether this column renders the four card arrows: **only** in move mode, and **only** when
   * the selected card is one of its own (D-C26). Any other column keeps them out of the
   * document, so that the four controls name one card and one only.
   */
  showsCardArrows: Signal<boolean> = computed((): boolean => {
    if (!this.moveMode()) {
      return false;
    }
    return this.selectedCardIndex() !== NOT_IN_THIS_COLUMN;
  });

  /**
   * Whether the selected card may go up in this pile. The column decides it alone: it holds its
   * cards and receives the selected one, so it knows whether that card is at the head (D-C25).
   */
  canMoveCardUp: Signal<boolean> = computed((): boolean => {
    const rank: number = this.selectedCardIndex();
    return rank > 0;
  });

  /** Whether the selected card may go down in this pile, which the column decides alone too (D-C25). */
  canMoveCardDown: Signal<boolean> = computed((): boolean => {
    const rank: number = this.selectedCardIndex();
    if (rank === NOT_IN_THIS_COLUMN) {
      return false;
    }
    const lastRank: number = this.cards().length - 1;
    return rank < lastRank;
  });

  /**
   * Touching the name opens the rename field, prefilled with the name of the column **currently**
   * received — not one memorized on construction (D-L18).
   */
  onStartRename(): void {
    this.typedName.set(this.column().name);
    this.isRenaming.set(true);
  }

  /** Validating the rename emits the typed text as is, then closes the field. */
  onValidateRename(): void {
    const typedName = this.typedName();
    this.isRenaming.set(false);
    this.renamed.emit(typedName);
  }

  /**
   * Giving the rename up closes the field and emits nothing: the header shows the name of the
   * received column again, and not the abandoned draft.
   */
  onCancelRename(): void {
    this.typedName.set('');
    this.isRenaming.set(false);
  }

  /** Touching the trash asks the editor for the removal of this column, and nothing more. */
  onRemoveRequested(): void {
    this.removeRequested.emit();
  }

  /**
   * Touching the add button asks the editor for a new card in this list: the draft of that card
   * lives in the editor and enters the composition only on validation (D-C29).
   */
  onAddCardRequested(): void {
    this.addCardRequested.emit();
  }

  /**
   * Touching the « déplacer » button asks the editor to flip the move mode. The column changes
   * nothing by itself: the mode is worth the whole board, and holding a copy of it here would see
   * two lists disagree (D-C23).
   */
  onMoveModeToggled(): void {
    this.moveModeToggled.emit();
  }

  /**
   * Relays the direction of the touched arrow: the column names the gesture, the editor moves the
   * selected card and reposes the result in its composition (D-C26).
   * @param direction Where the selected card is asked to go.
   */
  onCardMoveRequested(direction: MoveDirection): void {
    this.cardMoveRequested.emit(direction);
  }

  /**
   * Relays the selection a card asked for, labelled with that card: the single selection spans
   * the whole board, so the editor is the one that grants it (D-C23).
   * @param cardId Identifier of the card that was touched in move mode.
   */
  onCardSelected(cardId: string): void {
    this.cardSelected.emit(cardId);
  }

  /**
   * Relays the text a card validated, labelled with that card. The text goes up **as it was
   * typed**: trimming it and falling back on « Sans titre » belong to the editor (D-C30).
   * @param cardId Identifier of the card whose entry was validated.
   * @param text The text as the user typed it.
   */
  onCardTextChanged(cardId: string, text: string): void {
    const change: CardTextChange = { cardId, text };
    this.cardTextChanged.emit(change);
  }

  /**
   * Relays the choice of a note a card asked for, labelled with that card: the editor is the one
   * that owns the picker (D-C36).
   * @param cardId Identifier of the card whose reference control was touched.
   */
  onCardNoteRequested(cardId: string): void {
    this.cardNoteRequested.emit(cardId);
  }

  /**
   * Relays the opening of a note a card asked for, carrying the identifier of the **note** and
   * not that of the card: the editor navigates by the note, once it has made sure nothing is
   * pending (D-C37).
   * @param noteId Identifier of the referenced note whose title was touched.
   */
  onCardNoteOpenRequested(noteId: string): void {
    this.cardNoteOpenRequested.emit(noteId);
  }

  /**
   * Relays the removal a card asked for, labelled with that card: the confirmation popup and the
   * composition stay in the editor (D-C28).
   * @param cardId Identifier of the card whose trash was touched.
   */
  onCardRemoveRequested(cardId: string): void {
    this.cardRemoveRequested.emit(cardId);
  }
}

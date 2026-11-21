import { Component, input, output, signal } from '@angular/core';
import { KanbanCard, Note } from '../../core/models';

/**
 * One card of a kanban column, rendered by `KanbanColumnPanel` in its `.column-cards` area
 * (D-C22). It shows the text of the card and, when the card references a note, the title of that
 * note as a link-looking control.
 *
 * The class is named `KanbanCardPanel` because `KanbanCard` is the model it receives as input,
 * and the collision would be real — the very reasoning of D-L22 for `KanbanColumnPanel` (D-C21).
 *
 * **Purely presentational** (D-C21): no service, no router, no decision. The selection and the
 * move mode are states of the whole board, so they come in through inputs and the card only ever
 * emits requests (D-C23). Cleaning the typed text and falling back on « Sans titre » belong to
 * the editor, in a single place (D-C30); so do the confirmation popup of a removal (D-C28), the
 * note picker (D-C36) and the navigation to a note (D-C37).
 *
 * The card received is never modified nor copied: a new text comes back through the input once
 * the editor has replaced the card.
 *
 * Built against `PLAN_TESTS_KANBAN_CARTES.md`, groups 20 to 22 (cases T20.1 to T22.7).
 */
@Component({
  selector: 'app-kanban-card',
  standalone: true,
  templateUrl: './kanban-card.html',
  styleUrl: './kanban-card.css',
})
export class KanbanCardPanel {
  /**
   * Card to display. Read on every access rather than copied on construction, so the panel
   * follows its input: the editor replaces the card whenever it retypes or renumbers its
   * composition (E115).
   */
  card = input.required<KanbanCard>();

  /**
   * Whether this card is the one the editor holds as selected. The panel does not own that
   * state, it receives it (D-C23).
   */
  selected = input.required<boolean>();

  /** Whether the board is in move mode, which is a state of the board and not of the card (D-C23). */
  moveMode = input.required<boolean>();

  /**
   * Emitted when the text entry is validated, carrying the text **as it was typed** — neither
   * trimmed nor replaced by the fallback text (D-C30).
   */
  textChanged = output<string>();

  /** Emitted when the reference control is touched: the editor owns the note picker (D-C36). */
  noteRequested = output<void>();

  /**
   * Emitted with the identifier of the referenced note when its title is touched: a request, not
   * a navigation — only the editor knows whether changes are pending (D-C37).
   */
  noteOpenRequested = output<string>();

  /** Emitted when the trash is touched: a request, nothing else — the editor decides (D-C28). */
  removeRequested = output<void>();

  /** Emitted when the card is touched in move mode, the editor holding the single selection (D-C23). */
  selectionRequested = output<void>();

  /**
   * Whether the in-place text entry takes the place of the body of the card (D-PC1). Local to the
   * panel, because the entry concerns none but this card — the very parti `KanbanColumnPanel`
   * takes for its rename (D-C24).
   */
  isEditing = signal<boolean>(false);

  /**
   * Text held by the entry field, prefilled with the current text when the field opens. Kept
   * apart from the card, which this panel never modifies.
   */
  typedText = signal<string>('');

  /**
   * Touching the body of the card means two different things, and only one at a time: in move
   * mode it asks the editor for the selection of this card — the mode replaces the gesture, it
   * does not add to it, so the text entry stays closed (D-C23, E120) — and out of move mode it
   * opens the entry (E119).
   */
  onBodyTouched(): void {
    if (this.moveMode()) {
      this.selectionRequested.emit();
      return;
    }
    this.openTextEntry();
  }

  /**
   * Touching the reference control asks the editor for the choice of a note — posing one as well
   * as removing it, the picker carrying the explicit « Aucune note » choice (D-C35). The card
   * opens no popup of its own: the editor owns it (D-C36, E126).
   */
  onNoteRequested(): void {
    this.noteRequested.emit();
  }

  /**
   * Touching the title of the referenced note asks the editor to open that note, carrying its
   * identifier: a request, not a navigation — only the editor knows whether changes are pending,
   * owns the popup that guards them and injects the router (D-C37, E125). A card without a
   * reference has no title to touch, so nothing is emitted.
   */
  onNoteOpenRequested(): void {
    const referencedNote: Note | null = this.card().note;
    if (referencedNote === null) {
      return;
    }
    this.noteOpenRequested.emit(referencedNote.id);
  }

  /** Touching the trash asks the editor for the removal of this card, and nothing more (E123). */
  onRemoveRequested(): void {
    this.removeRequested.emit();
  }

  /**
   * Validating the entry emits the typed text **as it was typed** — neither trimmed nor replaced
   * by the fallback text, those rules living in the editor in a single place (D-C30, E121) — then
   * closes the field.
   */
  onValidateText(): void {
    const typedText: string = this.typedText();
    this.isEditing.set(false);
    this.textChanged.emit(typedText);
  }

  /**
   * Giving the entry up closes the field and emits nothing: the card shows the text of the
   * received card again, and not the abandoned draft (E122).
   */
  onCancelText(): void {
    this.typedText.set('');
    this.isEditing.set(false);
  }

  /**
   * Opens the text entry, prefilled with the text of the card **currently** received — not one
   * memorized on construction (E119).
   */
  private openTextEntry(): void {
    const currentText: string = this.card().text;
    this.typedText.set(currentText);
    this.isEditing.set(true);
  }
}

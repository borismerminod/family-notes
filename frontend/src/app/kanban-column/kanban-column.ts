import { Component, input, output, signal } from '@angular/core';
import { KanbanColumn } from '../core/models';

/**
 * One column (the user reads « liste ») of a kanban board, inside the content area of
 * `KanbanEditor`. It shows the column name in a header, carries the trash that asks for its
 * removal, and reserves below it the area the cards of the next batch will land in — the anchor
 * point D-E11 held for this batch, moved down one level (D-L21).
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
 * The column received is never modified nor copied: a new name comes back through the input once
 * the editor has replaced the column.
 *
 * Built against `PLAN_TESTS_KANBAN_EDITION_LISTES.md`, group 5 (cases T5.1 to T5.11).
 */
@Component({
  selector: 'app-kanban-column',
  standalone: true,
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
   * Emitted when the in-place rename is validated, carrying the text **as it was typed** —
   * neither trimmed nor replaced by the fallback name (D-L23).
   */
  renamed = output<string>();

  /** Emitted when the trash is touched: a request, nothing else — the editor decides (D-L4). */
  removeRequested = output<void>();

  /** Whether the in-place rename field takes the place of the displayed name in the header. */
  isRenaming = signal<boolean>(false);

  /**
   * Text held by the rename field, prefilled with the current name when the field opens and
   * dropped when the rename is given up. Kept apart from the column, which this panel never
   * modifies.
   */
  typedName = signal<string>('');

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
}

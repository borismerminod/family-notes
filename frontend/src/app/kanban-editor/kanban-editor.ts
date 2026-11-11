import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { KanbanColumn } from '../core/models/kanban-column.model';
import { KanbanSaveResult } from '../core/models/kanban-save-result.model';
import { KanbanService } from '../core/services/kanban-service';
import { ConfirmDialog } from '../core/components/confirm-dialog/confirm-dialog';
import { KanbanColumnPanel } from '../kanban-column/kanban-column';

/** Name a board falls back on when the name field is left empty (D-E2). */
const DEFAULT_NAME = 'Sans titre';

/**
 * Banner shown when the save wrote **nothing at all** — the board itself was refused (D-E9). The
 * user must see it: a message left in the console alone never reaches them.
 */
const SAVE_FAILED_MESSAGE = "Impossible d'enregistrer le tableau.";

/**
 * Banner shown when the board **was** stored but its lists did not follow (D-L24). It is a
 * different message from {@link SAVE_FAILED_MESSAGE} on purpose: telling the user the board could
 * not be saved would be the opposite of what happened, and the title of the navigation bar — which
 * switches to « Modifier le tableau » the moment the board exists (D-L13) — would contradict it.
 * What the banner has to say is the true state and what to do about it: the composition is intact
 * on screen, and saving again replays it whole, that replay being idempotent (D-L10).
 */
const COLUMNS_SAVE_FAILED_MESSAGE =
  'Le tableau est enregistré, mais pas ses listes. Réessayez pour les enregistrer.';

/**
 * Board edit screen, served by the `/kanban/new` and `/kanban/edit/:id` routes (see
 * .agent/KANBAN/EDITION/APPROCHE_KANBAN_EDITION.md). One single component serves both: the
 * presence of an identifier in the route tells edit mode from create mode (D-E8), exactly as
 * `NoteEditor` does for the notes (D1). That identifier is read once, from the route snapshot
 * (D8): the screen is never reused for another board without being created again.
 *
 * The board is only written when the user saves it, so opening this screen and leaving it writes
 * nothing (D-K11). A successful save goes back to the list, where the new card or the corrected
 * name is immediately visible (D-E1); a failed one keeps the user here, name untouched, with a
 * visible banner rather than a message left in the console (D-E9).
 *
 * The board content area carries the columns the user calls « listes »: one `KanbanColumnPanel`
 * per column of the displayed composition, horizontally and in order (D-L21). It replaces the
 * ghost column the previous batch showed there, D-E11 being withdrawn.
 *
 * Built against `PLAN_TESTS_KANBAN_EDITION.md`, part B (groups 2 to 10), and
 * `PLAN_TESTS_KANBAN_EDITION_LISTES.md`, groups 6 to 12.
 */
@Component({
  selector: 'app-kanban-editor',
  standalone: true,
  imports: [ConfirmDialog, KanbanColumnPanel],
  templateUrl: './kanban-editor.html',
  styleUrl: './kanban-editor.css',
})
export class KanbanEditor implements OnInit {
  /** Current route, read once to tell edit mode (id present) from create mode (absent) — D8. */
  private readonly route = inject(ActivatedRoute);
  /** Data source used to read the board being edited, and to create or rename it on save. */
  private readonly kanbanService = inject(KanbanService);
  /** Router used to go back to the board list, which is the only way out of this screen. */
  private readonly router = inject(Router);

  /**
   * Name the board falls back on, exposed so the template can use it as the hint of the name field:
   * D-E2 ties the two usages together — what is merely suggested while typing is what gets stored
   * on save — so the string lives in one place only.
   */
  readonly defaultName = DEFAULT_NAME;

  /**
   * Board name as the user typed it, two-way bound to the name field. It starts empty on a brand
   * new board, 'Sans titre' being a mere placeholder: the fallback on that name happens on save,
   * not while typing (D-E2).
   */
  name = signal<string>('');

  /**
   * Columns of the board as they are currently displayed, in their display order. This is the
   * composition the four gestures work on, and it is not the database: only a save reconciles the
   * two (D-L1). Empty on a brand new board, which therefore starts without any column.
   */
  columns = signal<KanbanColumn[]>([]);

  /**
   * Whether the in-place field of a new list takes the place of the add gesture, at the right of
   * the existing lists (D-L18).
   */
  addingColumn = signal<boolean>(false);

  /** Name typed in the field of the new list, as it is typed: nothing is cleaned up here (D-L17). */
  newColumnName = signal<string>('');

  /**
   * Name the screen started from — empty on a brand new board, the stored name in edit mode. It is
   * what the typed name is compared to in order to tell whether a change is pending (D-E3), and it
   * is refreshed by a successful save.
   */
  initialName = signal<string>('');

  /**
   * Composition the screen started from — empty on a brand new board, so its very first add
   * counts as a pending change. It is what the displayed composition is compared to (D-E3
   * extended to the lists), and it is refreshed by a successful save.
   */
  initialColumns = signal<KanbanColumn[]>([]);

  /**
   * Whether the route carried an identifier, which is what tells edit mode from create mode (D-E8)
   * and drives the title of the navigation bar (D-E5). **Derived** from {@link kanbanId} rather
   * than stored beside it, so the two can never disagree.
   */
  editing = computed(() => this.kanbanId() !== null);

  /** True while the board is being read from the data source (edit mode only). */
  isLoading = signal<boolean>(false);

  /** True when the board could not be read, which puts the screen in its error state (US1). */
  loadError = signal<boolean>(false);

  /**
   * True when the route carries an identifier no board answers to (D-E4, revised on 2026-10-11).
   * The screen then says so and offers a way back, rather than taking the user to the list on its
   * own, which left a touch of a stale card looking like a bug.
   */
  notFound = signal<boolean>(false);

  /** Message of the banner shown after a failed save, empty when there is none (US5, D-E9). */
  saveError = signal<string>('');

  /**
   * List whose removal the user asked for, `null` when no removal is being confirmed. Kept apart
   * from the composition: the list is only dropped once the popup has been confirmed (D-L4).
   */
  columnToRemove = signal<KanbanColumn | null>(null);

  /** Whether the popup confirming the removal of a list is open (US4 of the lists batch). */
  removeConfirmOpen = signal<boolean>(false);

  /** Whether the popup warning that the typed name is about to be lost is open (US4). */
  confirmOpen = signal<boolean>(false);

  /**
   * Whether what the screen holds differs from what it started from — the board name, or its
   * composition of lists — which is what this screen can lose (US4, US7). Derived state rather
   * than a flag, so there is nothing to reset (D-E3): the comparison is made on trimmed values, so
   * retyping the very same name — or adding only leading or trailing spaces — is not a change.
   */
  hasPendingChanges = computed(() => {
    const nameChanged = this.name().trim() !== this.initialName().trim();
    return nameChanged || this.hasColumnChanges();
  });

  /**
   * Identifier of the board being edited, or `null` in create mode (D-E8). Read once from the route
   * snapshot (D8), and the single source of truth for the mode the screen is in — {@link editing}
   * and {@link writeKanban} both read it rather than keeping their own copy.
   */
  private readonly kanbanId = signal<string | null>(null);

  /**
   * Angular lifecycle hook; resolves edit vs create mode from the route, then reads the board to
   * edit. In create mode the name field stays empty and nothing is asked of the data source: a
   * brand new board has nothing to load (T2.2, T2.3).
   * @returns A promise that resolves once the initial read has completed, if there was one.
   */
  async ngOnInit(): Promise<void> {
    const idFromRoute = this.route.snapshot.paramMap.get('id');
    this.kanbanId.set(idFromRoute);

    if (idFromRoute !== null) {
      await this.loadKanban(idFromRoute);
    }
  }

  /**
   * Saves the typed name: a creation in create mode, a rename in edit mode — which also stamps the
   * board as modified, hence its rise to the top of the list (US2, US3).
   *
   * Each attempt starts by clearing the banner of the previous one: a message about a past attempt
   * would be read as being about this one (T7.4). On success the saved name becomes the name the
   * screen started from **before** the router is asked to leave, which is what makes "no pending
   * change any more" observable (D5). On failure the user stays here with their name, and the
   * change stays pending (D-E9).
   *
   * **The identifier of the saved board is retained whatever follows**, which is what switches a
   * brand new board to edit mode the moment it exists in the database (D-L13): without it, a
   * second press on « Enregistrer » would start another creation and leave a **second** board
   * behind. Observable consequence, not a bug: after such a half success the title of the
   * navigation bar reads « Modifier le tableau », because the board does exist now.
   *
   * A save whose **lists did not follow** the board is not an exception but a result (D-L24): the
   * user stays here with their composition and a visible banner — its own banner, which says the
   * board is stored and the lists are not, and not the one of a save that wrote nothing — the
   * starting points are left untouched so the change stays pending, and a retry replays the whole
   * composition, which is idempotent, hence converges (D-L10).
   *
   * The **displayed** name is set to the stored one as well, and that is not redundant: a user who
   * saved an empty field stored 'Sans titre' (D-E2), so leaving the field empty would leave it
   * differing from the name the screen started from — a phantom pending change, and the back button
   * would ask to confirm a loss that cannot happen. No test covers that path today (see C11 of
   * REVUE_KANBAN_EDITION.md), so this line must not be dropped as a mere normalisation.
   * @returns A promise that resolves once the save attempt has completed (success or failure).
   */
  async onSave(): Promise<void> {
    this.saveError.set('');
    const nameToSave = this.nameToSave();

    try {
      const saveResult = await this.writeKanban(nameToSave);
      const savedKanban = saveResult.kanban;
      this.kanbanId.set(savedKanban.id);

      if (!saveResult.columnsSaved) {
        this.saveError.set(COLUMNS_SAVE_FAILED_MESSAGE);
        return;
      }

      const savedColumns = savedKanban.columns ?? this.columns();
      this.name.set(savedKanban.name);
      this.initialName.set(savedKanban.name);
      this.columns.set(savedColumns);
      this.initialColumns.set(savedColumns);
      this.goToList();
    } catch (err) {
      console.error("Erreur lors de l'enregistrement du kanban", err);
      this.saveError.set(SAVE_FAILED_MESSAGE);
    }
  }

  /**
   * Opens the in-place field of a new list, empty, in place of the add gesture (D-L18).
   */
  onStartAddColumn(): void {
    this.newColumnName.set('');
    this.addingColumn.set(true);
  }

  /**
   * Adds the list being typed at the **last** position of the displayed composition, under a
   * brand new identifier the screen generates itself — it has to designate that list before it
   * exists in the database (D-L11).
   *
   * The name is the typed one cleaned up by {@link nameToStore}: that rule is applied at the
   * **validation** of the field, never while typing (D-L17).
   *
   * The positions are renumbered like after a removal or a move (D-L12), rather than the new list
   * being given the number of lists as its rank: a composition read from a database left with a
   * hole in its positions by an interrupted save (D-L13) would otherwise get two lists at the
   * same rank, and nothing in the schema objects to it (D-L6).
   *
   * Nothing is written: the composition is from now on waiting to be saved (D-L1). The field is
   * emptied and left open, so several lists can be added in a row (US2).
   */
  onAddColumn(): void {
    const nameToStore = this.nameToStore(this.newColumnName());
    const columnsShown = this.columns();
    const columnToAdd: KanbanColumn = {
      id: crypto.randomUUID(),
      name: nameToStore,
      position: columnsShown.length,
    };
    const renumberedColumns = this.reindexColumns([...columnsShown, columnToAdd]);

    this.columns.set(renumberedColumns);
    this.newColumnName.set('');
  }

  /**
   * Renames one list of the displayed composition, and that one only: the panel emits the text
   * **as it was typed** (D-L23), the cleaning up and the fallback on 'Sans titre' being applied
   * here (D-L17). The list keeps its identifier and its place, and the other lists are untouched.
   *
   * The list is designated by its identifier rather than by its name: two lists of a same board
   * may be homonyms, and only their identifiers tell them apart (D-L6).
   *
   * Nothing is written: the composition is waiting to be saved (D-L1).
   * @param id Identifier of the list to rename.
   * @param typedName Name as the user typed it in the header of that list.
   */
  onRenameColumn(id: string, typedName: string): void {
    const nameToStore = this.nameToStore(typedName);
    const columnsShown = this.columns();
    const renamedColumns = columnsShown.map((column) => {
      const isListToRename = column.id === id;
      return isListToRename ? { ...column, name: nameToStore } : column;
    });

    this.columns.set(renamedColumns);
  }

  /** Gives the add up: the field closes and the composition is left untouched (US2). */
  onCancelAddColumn(): void {
    this.newColumnName.set('');
    this.addingColumn.set(false);
  }

  /**
   * Moves a list one step towards the left, swapping it with its immediate neighbour (US5).
   * @param index Rank of the list to move, counted from the left.
   */
  onMoveColumnLeft(index: number): void {
    const neighbourIndex = index - 1;
    this.swapColumns(index, neighbourIndex);
  }

  /**
   * Moves a list one step towards the right, swapping it with its immediate neighbour (US5).
   * @param index Rank of the list to move, counted from the left.
   */
  onMoveColumnRight(index: number): void {
    const neighbourIndex = index + 1;
    this.swapColumns(index, neighbourIndex);
  }

  /**
   * Handles the removal a list asked for through its own trash: the list is remembered and the
   * confirmation popup opens, naming it. The panel only emits a request — the confirmation and
   * the composition belong here (D-L4, D-L23) — so nothing is removed yet, and nothing written.
   * @param column The list whose removal is being asked for.
   */
  onRemoveColumn(column: KanbanColumn): void {
    this.columnToRemove.set(column);
    this.removeConfirmOpen.set(true);
  }

  /**
   * Handles the answer of the removal popup: confirming drops that list — and that one only, the
   * list being designated by its identifier so two homonyms never get mixed up (D-L6) — then
   * renumbers the positions so they stay contiguous and start back from 0 (D-L12). Declining,
   * which the popup also reports for a click outside of it and for the Escape key, keeps the list
   * where it is.
   *
   * Nothing is written either way: quitting the screen without saving leaves the list in the
   * database (D-L1).
   * @param confirmed True when the user confirmed the removal, false when they declined.
   */
  onRemoveConfirmed(confirmed: boolean): void {
    const columnAimedAt = this.columnToRemove();
    this.columnToRemove.set(null);

    if (!confirmed || columnAimedAt === null) {
      return;
    }

    const columnsShown = this.columns();
    const keptColumns = columnsShown.filter((column) => column.id !== columnAimedAt.id);
    const renumberedColumns = this.reindexColumns(keptColumns);
    this.columns.set(renumberedColumns);
  }

  /**
   * Handles the back button of the navigation bar: it goes straight back to the list when there is
   * nothing to lose, and asks for a confirmation when the typed name is not saved (US4).
   */
  onBack(): void {
    if (this.hasPendingChanges()) {
      this.confirmOpen.set(true);
      return;
    }
    this.goToList();
  }

  /**
   * Handles the answer of the confirmation popup: leaving is only honoured once the user has said
   * yes, and nothing is ever saved on the way out (US4). Declining — which the popup also reports
   * for a click outside of it and for the Escape key — leaves the user here, name untouched.
   * @param confirmed True when the user confirmed leaving, false when they declined.
   */
  onLeaveConfirmed(confirmed: boolean): void {
    if (confirmed) {
      this.goToList();
    }
  }

  /**
   * Reads the board again after a failed read, from the very same path as the initial one (D4). It
   * is the only action offered by the error state besides going back to the list.
   */
  onRetry(): void {
    const idToReload = this.kanbanId();
    if (idToReload !== null) {
      void this.loadKanban(idToReload);
    }
  }

  /** Goes back to the board list, the single exit of this screen (D-E1, D-E4, US4). */
  goToList(): void {
    this.router.navigate(['/kanban']);
  }

  /**
   * Reads the board to edit into the name field and remembers its name as the one the screen
   * started from (D-E3), raising the loading state for as long as the data source has not
   * answered.
   *
   * An identifier matching no board is not a read failure but an answer: the screen says the board
   * cannot be found and offers a way back to the list (D-E4, revised on 2026-10-11), on the model
   * of the note editor (D5). A read failure raises the error state instead, which offers a way to
   * try again as well, so the screen never stays stuck on its spinner.
   *
   * The positions that come back are renumbered from the display order (D-L12), which closes at
   * the source the one case where the database may hand over a hole in them: a save interrupted
   * halfway (D-L13). The order itself is the one the data source read, by ascending position; only
   * the numbers are made contiguous again, and the comparison that tells a pending change apart
   * ignores them (see {@link hasColumnChanges}), so nothing is reported as modified.
   * @param id The identifier of the board to read.
   * @returns A promise that resolves once the read attempt has completed (success or failure).
   */
  private async loadKanban(id: string): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(false);
    this.notFound.set(false);

    try {
      const kanban = await this.kanbanService.getKanbanById(id);
      if (kanban === null) {
        this.notFound.set(true);
        return;
      }
      this.name.set(kanban.name);
      this.initialName.set(kanban.name);
      const columnsRead = this.reindexColumns(kanban.columns ?? []);
      this.columns.set(columnsRead);
      this.initialColumns.set(columnsRead);
    } catch (err) {
      console.error('Erreur lors du chargement du kanban', err);
      this.loadError.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Asks the data source to store the board name **and** the displayed composition in one single
   * grouped write (D-L9): the identifier the call carries tells the two modes apart — `null`
   * creates the board, an identifier renames it, which also stamps it as modified (D-E8, D-L24).
   * The screen never sequences writes of its own, and never calls the single-board writes.
   * @param nameToSave The name to store, already cleaned up.
   * @returns A promise resolving to the board as the data source stored it, and to whether its
   * columns followed.
   */
  private writeKanban(nameToSave: string): Promise<KanbanSaveResult> {
    const idToSave = this.kanbanId();
    const columnsToSave = this.columns();
    return this.kanbanService.saveKanbanWithColumns(idToSave, nameToSave, columnsToSave);
  }

  /**
   * Tells whether the displayed composition differs from the one the screen started from, which
   * is what each of the four gestures makes true (US7). A different number of lists says it, and
   * so does, at a same rank, a different **identifier** — an add, a removal or a move — or a
   * different cleaned up **name** — a rename. The position is left out of the comparison: it is
   * redundant with the rank (D-L12), and revalidating the very same name must not look like a
   * change.
   * @returns True when the composition is waiting to be saved.
   */
  private hasColumnChanges(): boolean {
    const columnsShown = this.columns();
    const columnsStartedFrom = this.initialColumns();

    if (columnsShown.length !== columnsStartedFrom.length) {
      return true;
    }

    return columnsShown.some((column, index) => {
      const columnStartedFrom = columnsStartedFrom[index];
      const identifierChanged = column.id !== columnStartedFrom.id;
      const nameChanged = column.name.trim() !== columnStartedFrom.name.trim();
      return identifierChanged || nameChanged;
    });
  }

  /**
   * Swaps two lists of the displayed composition, then renumbers the positions (D-L12). A
   * neighbour outside of the board leaves the composition untouched: no move out of the board,
   * and no error to handle — the buttons of the ends are disabled anyway, this is their belt.
   *
   * Neither the names nor the number of lists change, and nothing is written (D-L1).
   * @param index Rank of the list being moved.
   * @param neighbourIndex Rank it is swapped with.
   */
  private swapColumns(index: number, neighbourIndex: number): void {
    const columnsShown = this.columns();
    const isNeighbourInBoard = neighbourIndex >= 0 && neighbourIndex < columnsShown.length;
    if (!isNeighbourInBoard) {
      return;
    }

    const swappedColumns = [...columnsShown];
    swappedColumns[index] = columnsShown[neighbourIndex];
    swappedColumns[neighbourIndex] = columnsShown[index];
    const renumberedColumns = this.reindexColumns(swappedColumns);
    this.columns.set(renumberedColumns);
  }

  /**
   * Renumbers the positions of a composition from the rank of each list, base 0, so the model
   * never carries a stale position and the service has no order to derive again (D-L12).
   * @param columns The composition to renumber, in its display order.
   * @returns The same lists, in the same order, their positions matching their rank.
   */
  private reindexColumns(columns: KanbanColumn[]): KanbanColumn[] {
    return columns.map((column, index) => ({ ...column, position: index }));
  }

  /**
   * Cleans a typed name up for storage: leading and trailing spaces are dropped, inner spaces
   * being part of the name, and a name empty once cleaned falls back to 'Sans titre'. One single
   * rule for the board name (D-E2) and for a list name (D-L17), which is what keeps the two from
   * drifting apart. An empty name therefore never reaches the data source, whose own refusal
   * stays a safety net (D-E10).
   * @param typedName The name as the user typed it.
   * @returns The name to store.
   */
  private nameToStore(typedName: string): string {
    const trimmedName = typedName.trim();
    return trimmedName.length === 0 ? DEFAULT_NAME : trimmedName;
  }

  /**
   * Gives the board name to store, cleaned up by {@link nameToStore}.
   * @returns The board name to store.
   */
  private nameToSave(): string {
    return this.nameToStore(this.name());
  }
}

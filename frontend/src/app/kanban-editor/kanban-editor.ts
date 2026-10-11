import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Kanban } from '../core/models/kanban.model';
import { KanbanService } from '../core/services/kanban-service';
import { ConfirmDialog } from '../core/components/confirm-dialog/confirm-dialog';

/** Name a board falls back on when the name field is left empty (D-E2). */
const DEFAULT_NAME = 'Sans titre';

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
 * The board content area stays empty in this batch: it is the anchor point the lists and the cards
 * will be plugged into (D-E11).
 *
 * Built against `PLAN_TESTS_KANBAN_EDITION.md`, part B (groups 2 to 10).
 */
@Component({
  selector: 'app-kanban-editor',
  standalone: true,
  imports: [ConfirmDialog],
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
   * Board name as the user typed it, two-way bound to the name field. It starts empty on a brand
   * new board, 'Sans titre' being a mere placeholder: the fallback on that name happens on save,
   * not while typing (D-E2).
   */
  name = signal<string>('');

  /**
   * Name the screen started from — empty on a brand new board, the stored name in edit mode. It is
   * what the typed name is compared to in order to tell whether a change is pending (D-E3), and it
   * is refreshed by a successful save.
   */
  initialName = signal<string>('');

  /** True in edit mode, false in create mode — drives the title of the navigation bar (D-E5). */
  editing = signal<boolean>(false);

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

  /** Whether the popup warning that the typed name is about to be lost is open (US4). */
  confirmOpen = signal<boolean>(false);

  /**
   * Whether the typed name differs from the one the screen started from, which is the only thing
   * this screen can lose (US4). Derived state rather than a flag, so there is nothing to reset
   * (D-E3): the comparison is made on trimmed values, so retyping the very same name — or adding
   * only leading or trailing spaces — is not a change.
   */
  hasPendingChanges = computed(() => this.name().trim() !== this.initialName().trim());

  /** Identifier of the board being edited, or null in create mode (D-E8). */
  private kanbanId: string | null = null;

  /**
   * Angular lifecycle hook; resolves edit vs create mode from the route, then reads the board to
   * edit. In create mode the name field stays empty and nothing is asked of the data source: a
   * brand new board has nothing to load (T2.2, T2.3).
   * @returns A promise that resolves once the initial read has completed, if there was one.
   */
  async ngOnInit(): Promise<void> {
    this.kanbanId = this.route.snapshot.paramMap.get('id');
    this.editing.set(this.kanbanId !== null);

    if (this.kanbanId !== null) {
      await this.loadKanban(this.kanbanId);
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
   * @returns A promise that resolves once the save attempt has completed (success or failure).
   */
  async onSave(): Promise<void> {
    this.saveError.set('');
    const nameToSave = this.nameToSave();

    try {
      const saved = await this.writeKanban(nameToSave);
      this.name.set(saved.name);
      this.initialName.set(saved.name);
      this.goToList();
    } catch (err) {
      console.error("Erreur lors de l'enregistrement du kanban", err);
      this.saveError.set("Impossible d'enregistrer le tableau.");
    }
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
    if (this.kanbanId !== null) {
      void this.loadKanban(this.kanbanId);
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
    } catch (err) {
      console.error('Erreur lors du chargement du kanban', err);
      this.loadError.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Asks the data source for the write the current mode calls for: a creation when the route
   * carries no identifier, a rename of the board of the route otherwise (D-E8).
   * @param nameToSave The name to store, already cleaned up.
   * @returns A promise resolving to the board as the data source stored it.
   */
  private writeKanban(nameToSave: string): Promise<Kanban> {
    if (this.kanbanId === null) {
      return this.kanbanService.createKanban(nameToSave);
    }
    return this.kanbanService.renameKanban(this.kanbanId, nameToSave);
  }

  /**
   * Cleans the typed name up for storage: leading and trailing spaces are dropped, inner spaces
   * being part of the name, and a name empty once cleaned falls back to 'Sans titre' (D-E2). An
   * empty name therefore never reaches the data source, whose own refusal stays a safety net
   * (D-E10).
   * @returns The name to store.
   */
  private nameToSave(): string {
    const trimmedName = this.name().trim();
    return trimmedName.length === 0 ? DEFAULT_NAME : trimmedName;
  }
}

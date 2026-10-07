import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Kanban } from '../core/models/kanban.model';
import { KanbanService } from '../core/services/kanban-service';

/**
 * Board list page, served by the `/kanban` route (lot 2 of
 * .agent/KANBAN/CRUD/APPROCHE_KANBAN_CRUD.md): it lists the boards and carries the three write
 * actions of the feature — create (US2), rename (US4) and delete (US5).
 *
 * The name is entered in a popup held by this page's own template, shared by creation and renaming
 * (D-K2); deletion reuses the confirmation popup of the notes page (US5). The list is only
 * refreshed once the database has accepted the change (D-K7): a failed action leaves the screen
 * untouched and shows a message in the error banner.
 *
 * Boards carry no detail screen yet (D-K9), so a card is not clickable.
 *
 * Built test group by test group against `PLAN_TESTS_KANBAN_CRUD.md`, part B. Done so far:
 * groupe 6 (chargement et affichage) — T6.1 to T6.4. Still to come: the rest of groupe 6, then
 * groupes 7 to 11 (empty and error states, creation, renaming, deletion, error banner).
 */
@Component({
  selector: 'app-kanban-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kanban-list.html',
  styleUrl: './kanban-list.css',
})
export class KanbanList implements OnInit {
  /** Data source providing the boards and the create, rename and delete operations. */
  private kanbanService = inject(KanbanService);

  /** All boards loaded from the data source, most recently modified first. */
  kanbans = signal<Kanban[]>([]);
  /** True while the boards are being loaded from the data source. */
  isLoading = signal<boolean>(false);
  /** True when the last load attempt failed, which puts the page in its error state (US1). */
  loadError = signal<boolean>(false);

  /**
   * Counts the boards for the subtitle of the top bar, the wording following the count: French
   * needs no plural mark below two, and no count at all reads better than "0 tableau".
   * @returns The subtitle shown under the page title.
   */
  countLabel = computed(() => {
    const total = this.kanbans().length;
    if (total === 0) {
      return 'Aucun tableau';
    }
    return total === 1 ? '1 tableau' : `${total} tableaux`;
  });

  /**
   * Angular lifecycle hook; triggers the initial boards load when the component is created, which
   * is the only moment the page asks the data source on its own (T6.1).
   */
  ngOnInit(): void {
    this.loadKanbans();
  }

  /**
   * Loads all boards from the data source into the list, raising the loading state for as long as
   * the source has not answered. A failure puts the page in its error state, which offers the user
   * a way to try again; each attempt starts by clearing the error of the previous one.
   * @returns A promise that resolves once the load attempt has completed (success or failure).
   */
  async loadKanbans(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(false);
    try {
      const kanbans = await this.kanbanService.getAllKanbans();
      this.kanbans.set(kanbans);
    } catch (err) {
      console.error('Erreur lors du chargement des kanbans', err);
      this.loadError.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }
}

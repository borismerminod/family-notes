import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NotesService } from '../core/services/notes-service';
import { CategoriesService } from '../core/services/categories.service';
import { NoteBlock } from '../core/models/document.model';
import { Category } from '../core/models';
import { RichTextEditor } from '../rich-text-editor/rich-text-editor';
import { CategorySelector } from '../category-selector/category-selector';

/**
 * Note editor / creator screen (see .agent/PLAN_MODELE_DOCUMENT_JSON.md).
 *
 * The note content is a JSON block document (`Note.blocks`), rendered and edited by the
 * `RichTextEditor` component, which bundles the formatting toolbar and the `contenteditable`
 * area. This component passes the initial blocks down via `[blocks]` and receives the current
 * blocks via `(blocksChange)`; all formatting and media insertion live inside `RichTextEditor`.
 *
 * The category is picked through the `CategorySelector` child, which receives the known
 * categories and the current draft and reports back the free text typed by the user
 * (`draftChange`) or the category taken from its list (`selected`). The note keeps storing a
 * category *name*: resolving it to a row — creating it when new — is done by `NotesService` on
 * save.
 *
 * Decisions: D1 (single route: id present → edit, absent → create),
 * D3 (success → navigate back to /notes; failure → stay on the editor, pessimistic),
 * D5 (unknown id → "note not found").
 */
@Component({
  selector: 'app-note-editor',
  standalone: true,
  imports: [RichTextEditor, CategorySelector],
  templateUrl: './note-editor.html',
  styleUrl: './note-editor.css',
})
export class NoteEditor implements OnInit {
  /** Current route, read once to tell edit mode (id present) from create mode (absent). */
  private readonly route = inject(ActivatedRoute);
  /** Data source used to load, create and update the note. */
  private readonly notesService = inject(NotesService);
  /** Data source for the categories offered by the selector. */
  private readonly categoriesService = inject(CategoriesService);
  /** Router used to navigate back to the list on save or cancel. */
  private readonly router = inject(Router);

  /** Note title, two-way bound to the title input. */
  title = signal<string>('');
  /** Note category name, bound to the category selector (free text or picked from the list). */
  category = signal<(string)>('');
  /** Every known category, offered by the selector's dropdown. */
  categories = signal<Category[]>([]);
  /** Accent colour of the current category, used for the selector's outline. */
  categoryColor = signal<string | undefined>(undefined);

  /** Working content as blocks (updated by the editor, sent on save). */
  blocks = signal<NoteBlock[]>([]);

  /** True while the note is being loaded (edit mode) — shows the spinner. */
  isLoading = signal<boolean>(false);
  /** True when the requested note does not exist (id with no match — D5). */
  notFound = signal<boolean>(false);
  /** True in edit mode, false in create mode — drives the header label. */
  editing = signal<boolean>(false);

  /** Identifier of the note being edited, or null in create mode (D1). */
  private noteId: string | null = null;

  /**
   * Angular lifecycle hook; resolves edit vs create mode from the route, loads the categories
   * offered by the selector and, in edit mode, triggers the initial note load. In create mode the
   * document starts empty.
   * @returns A promise that resolves once the initial loads have completed.
   */
  async ngOnInit(): Promise<void> {
    this.noteId = this.route.snapshot.paramMap.get('id');
    this.editing.set(this.noteId !== null);

    // Les deux chargements sont lancés en parallèle : la liste des catégories ne doit pas
    // retarder l'affichage de la note (ni son indicateur de chargement).
    const categories = this.loadCategories();

    if (this.noteId) {
      await this.loadNote(this.noteId);
    } else {
      this.blocks.set([]);
    }

    await categories;
  }

  /**
   * Loads the categories offered by the selector. A failure is logged and leaves the list empty:
   * the category stays free text, so the editor remains usable without it.
   * @returns A promise that resolves once the load attempt has completed (success or failure).
   */
  private async loadCategories(): Promise<void> {
    try {
      this.categories.set(await this.categoriesService.getAllCategories());
    } catch (err) {
      console.error('Erreur lors du chargement des catégories', err);
    }
  }

  /**
   * Loads the requested note into the editor, toggling the loading state. When the id matches no
   * note the "not found" state is raised (D5); on failure the error is logged and loading ends so
   * the screen does not stay stuck on the spinner (D4).
   * @param id The identifier of the note to load.
   * @returns A promise that resolves once the load attempt has completed (success or failure).
   */
  private async loadNote(id: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const note = await this.notesService.getNoteById(id);
      if (note) {
        this.title.set(note.title);
        this.category.set(note.category !== null ? note.category.name : "");
        this.categoryColor.set(note.category?.color);
        this.blocks.set(note.blocks);
      } else {
        this.notFound.set(true);
      }
    } catch (err) {
      console.error('Erreur lors du chargement de la note', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Records the free text typed in the category field. Emptying the field also clears the colour,
   * so the tint of the previous category is not applied to the next one typed.
   * @param name The category name currently typed.
   */
  onCategoryDraftChange(name: string): void {
    this.category.set(name);
    if (!name.trim()) {
      this.categoryColor.set(undefined);
    }
  }

  /**
   * Records the category picked from the selector's list: its name is what gets saved, its colour
   * tints the field. Free text typed by the user goes through `(draftChange)` instead.
   * @param category The category picked in the dropdown.
   */
  onCategorySelected(category: Category): void {
    this.category.set(category.name);
    this.categoryColor.set(category.color);
  }

  /**
   * Saves the note: updates the existing note in edit mode, creates a new one otherwise. On
   * success navigates back to the list (D3); on failure the editor stays open (D4).
   * @returns A promise that resolves once the save attempt has completed.
   */
  async onSave(): Promise<void> {
    const payload = {
      title: this.title(),
      category: null,
      blocks: this.blocks(),
    };
    try {
      await this.saveCategoryColor();

      if (this.noteId) {
        await this.notesService.updateNote({ id: this.noteId, ...payload }, this.category());
      } else {
        await this.notesService.createNote(payload, this.category());
      }
      await this.router.navigate(['/notes']);
    } catch (err) {
      console.error('Erreur lors de l\'enregistrement de la note', err);
    }
  }

  /**
   * Persists the colour picked for the category being saved (US4), delegating the whole decision
   * to `CategoriesService.getOrCreate`: the category is created with that colour when the name is
   * new, updated when the colour changed, and left alone otherwise. The colour belongs to the
   * category, so it applies to every note carrying it.
   *
   * Runs before the note itself is saved, so `NotesService` finds the category already carrying
   * its colour when it resolves the name. A failure here is logged but never aborts the save.
   * @returns A promise that resolves once the colour has been persisted (or immediately when there
   * is nothing to write).
   */
  private async saveCategoryColor(): Promise<void> {
    const name = this.category().trim();
    if (!name) {
      return;
    }

    try {
      await this.categoriesService.getOrCreate(name, this.categoryColor());
    } catch (err) {
      // La note est l'intention principale : une couleur non enregistrée ne doit pas la bloquer.
      console.error('Erreur lors de l\'enregistrement de la couleur de la catégorie', err);
    }
  }

  /**
   * Cancels the edition and navigates back to the list without saving anything.
   */
  onCancel(): void {
    this.router.navigate(['/notes']);
  }
}

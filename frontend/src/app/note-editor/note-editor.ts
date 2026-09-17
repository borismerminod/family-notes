import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NotesService } from '../core/services/notes-service';
import { NoteBlock } from '../core/models/document.model';
import { RichTextEditor } from '../rich-text-editor/rich-text-editor';

/**
 * Note editor / creator screen (see .agent/PLAN_MODELE_DOCUMENT_JSON.md).
 *
 * The note content is a JSON block document (`Note.blocks`), rendered and edited by the
 * `RichTextEditor` component, which bundles the formatting toolbar and the `contenteditable`
 * area. This component passes the initial blocks down via `[blocks]` and receives the current
 * blocks via `(blocksChange)`; all formatting and media insertion live inside `RichTextEditor`.
 *
 * Decisions: D1 (single route: id present → edit, absent → create),
 * D3 (success → navigate back to /notes; failure → stay on the editor, pessimistic),
 * D5 (unknown id → "note not found").
 */
@Component({
  selector: 'app-note-editor',
  standalone: true,
  imports: [RichTextEditor],
  templateUrl: './note-editor.html',
  styleUrl: './note-editor.css',
})
export class NoteEditor implements OnInit {
  /** Current route, read once to tell edit mode (id present) from create mode (absent). */
  private readonly route = inject(ActivatedRoute);
  /** Data source used to load, create and update the note. */
  private readonly notesService = inject(NotesService);
  /** Router used to navigate back to the list on save or cancel. */
  private readonly router = inject(Router);

  /** Note title, two-way bound to the title input. */
  title = signal<string>('');
  /** Note category, two-way bound to the category input. */
  category = signal<string>('');

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
   * Angular lifecycle hook; resolves edit vs create mode from the route and, in edit mode,
   * triggers the initial note load. In create mode the document starts empty.
   * @returns A promise that resolves once the initial load (if any) has completed.
   */
  async ngOnInit(): Promise<void> {
    this.noteId = this.route.snapshot.paramMap.get('id');
    this.editing.set(this.noteId !== null);

    if (this.noteId) {
      await this.loadNote(this.noteId);
    } else {
      this.blocks.set([]);
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
        this.category.set(note.category);
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
   * Saves the note: updates the existing note in edit mode, creates a new one otherwise. On
   * success navigates back to the list (D3); on failure the editor stays open (D4).
   * @returns A promise that resolves once the save attempt has completed.
   */
  async onSave(): Promise<void> {
    const payload = {
      title: this.title(),
      category: this.category(),
      blocks: this.blocks(),
    };
    try {
      if (this.noteId) {
        await this.notesService.updateNote({ id: this.noteId, ...payload });
      } else {
        await this.notesService.createNote(payload);
      }
      await this.router.navigate(['/notes']);
    } catch (err) {
      console.error('Erreur lors de l\'enregistrement de la note', err);
    }
  }

  /**
   * Cancels the edition and navigates back to the list without saving anything.
   */
  onCancel(): void {
    this.router.navigate(['/notes']);
  }
}

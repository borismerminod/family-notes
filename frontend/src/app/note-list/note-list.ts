import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Note } from '../core/models/note.model';
import { NOTE_COLOR_PALETTE } from '../core/models/block-style.model';
import { NotesService } from '../core/services/notes-service';
import { ConfirmDialog } from '../core/components/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-note-list',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, ConfirmDialog],
  templateUrl: './note-list.html',
  styleUrl: './note-list.css',
})
export class NoteList implements OnInit {
  /** Data source providing the notes and the delete operation. */
  private noteService = inject(NotesService);
  /** Router used to navigate to the create and edit screens. */
  private router = inject(Router);

  /**
   * Decorative accent-bar palette: the notes palette without black
   * (single source of truth = NOTE_COLOR_PALETTE, see block-style.model.ts).
   */
  private readonly accentPalette = NOTE_COLOR_PALETTE.filter((c) => c !== '#000000');

  /** All notes loaded from the data source. */
  notes = signal<Note[]>([]);
  /** True while the notes are being loaded from the data source. */
  isLoading = signal<boolean>(false);
  /** True when the last load failed (shows an error panel with a "Retry" button). */
  loadError = signal<boolean>(false);
  /** Current search term used to filter the list. */
  searchQuery = signal<string>('');

  /** Note awaiting delete confirmation (null when none). */
  noteToDelete = signal<Note | null>(null);
  /** Visibility of the confirmation popup (two-way bound). */
  confirmOpen = signal<boolean>(false);

  /**
   * Builds the message shown in the delete confirmation popup.
   * @returns The prompt naming the note pending deletion, or an empty string when none is set.
   */
  confirmMessage = computed(() => {
    const note = this.noteToDelete();
    return note ? `Êtes-vous sûr de vouloir supprimer la note "${note.title}" ?` : '';
  });

  /**
   * Filters the loaded notes against the current search query, matching on title or category.
   * @returns The notes matching the query; all notes when the query is empty.
   */
  filteredNotes = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const allNotes = this.notes();

    if (!query) {
      return allNotes;
    }

    return allNotes.filter(note => {
      const titleMatches = note.title.toLowerCase().includes(query);
      const categoryMatches = note.category.toLowerCase().includes(query);
      return titleMatches || categoryMatches;
    });
  });

  /**
   * Angular lifecycle hook; triggers the initial notes load when the component is created.
   */
  ngOnInit(): void {
    this.loadNotes();
  }

  /**
   * Loads all notes from the data source into the list, toggling the loading and error states.
   * On failure the error is logged and the error state is raised so the view can offer a retry.
   * @returns A promise that resolves once the load attempt has completed (success or failure).
   */
  async loadNotes(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(false);
    try {
      const notes = await this.noteService.getAllNotes();
      this.notes.set(notes);
    } catch (err) {
      console.error('Erreur lors du chargement des notes', err);
      this.loadError.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Computes a deterministic accent colour for a note derived from its category, so notes in the
   * same category always share the same colour regardless of list order.
   * @param note The note whose category drives the colour selection.
   * @returns A hex colour taken from the accent palette.
   */
  accentColor(note: Note): string {
    const key = note.category ?? '';
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash + key.charCodeAt(i)) % this.accentPalette.length;
    }
    return this.accentPalette[hash];
  }

  /**
   * Navigates to the note creation screen.
   */
  onAddNote(): void {
    this.router.navigate(['/notes/new']);
  }

  /**
   * Opens the confirmation popup targeting the given note; nothing is deleted at this point.
   * @param note The note the user asked to delete.
   */
  onDeleteNote(note: Note): void {
    this.noteToDelete.set(note);
    this.confirmOpen.set(true);
  }

  /**
   * Handles the confirmation popup answer: when confirmed, deletes the pending note and removes it
   * locally on success; on failure the note stays displayed (pessimistic behaviour).
   * @param confirmed True when the user confirmed the deletion, false when they cancelled.
   * @returns A promise that resolves once the deletion attempt has completed.
   */
  async onDeleteConfirmed(confirmed: boolean): Promise<void> {
    const note = this.noteToDelete();
    this.noteToDelete.set(null);

    if (!confirmed || !note) {
      return;
    }

    try {
      await this.noteService.deleteNote(note.id);
      this.notes.update(current => current.filter(n => n.id !== note.id));
    } catch (err) {
      console.error('Erreur lors de la suppression de la note', err);
    }
  }
}

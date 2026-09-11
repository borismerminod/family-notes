import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Note } from '../core/models/note.model';
import { NotesService } from '../core/services/notes-service';
import { ConfirmDialog } from '../core/components/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-note-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, ConfirmDialog],
  templateUrl: './note-list.html',
  styleUrl: './note-list.css',
})
export class NoteList implements OnInit {
  private noteService = inject(NotesService);
  private router = inject(Router);

  notes = signal<Note[]>([]);
  isLoading = signal<boolean>(false);
  searchQuery = signal<string>('');

  /** Note en attente de confirmation de suppression (null si aucune). */
  noteToDelete = signal<Note | null>(null);
  /** Visibilité de la popup de confirmation (liaison bidirectionnelle). */
  confirmOpen = signal<boolean>(false);

  /** Message affiché dans la popup de confirmation de suppression. */
  confirmMessage = computed(() => {
    const note = this.noteToDelete();
    return note ? `Êtes-vous sûr de vouloir supprimer la note "${note.title}" ?` : '';
  });

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

  ngOnInit(): void {
    this.loadNotes();
  }

  async loadNotes(): Promise<void> {
    this.isLoading.set(true);
    try {
      const notes = await this.noteService.getAllNotes();
      console.log('Notes chargées :', notes);
      this.notes.set(notes);
    } catch (err) {
      console.error('Erreur lors du chargement des notes', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  onAddNote(): void {
    this.router.navigate(['/notes/new']);
  }

  onEditNote(note: Note): void {
    this.router.navigate(['/notes/edit', note.id]);
  }

  /** Clic sur la corbeille : ouvre la popup de confirmation pour cette note. */
  onDeleteNote(note: Note): void {
    this.noteToDelete.set(note);
    this.confirmOpen.set(true);
  }

  /** Réponse de la popup : supprime la note si l'utilisateur a confirmé. */
  async onDeleteConfirmed(confirmed: boolean): Promise<void> {
    const note = this.noteToDelete();
    this.noteToDelete.set(null);

    if (!confirmed || !note) {
      return;
    }

    try {
      await this.noteService.deleteNote(note.id);
      // Suppression réussie : on retire la note localement (pas de rechargement complet).
      this.notes.update(current => current.filter(n => n.id !== note.id));
    } catch (err) {
      // Comportement pessimiste : en cas d'échec, la note reste affichée.
      console.error('Erreur lors de la suppression de la note', err);
    }
  }
}

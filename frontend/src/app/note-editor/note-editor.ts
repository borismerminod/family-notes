import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NotesService } from '../core/services/notes-service';
import { RichTextEditor } from '../rich-text-editor/rich-text-editor';

/**
 * Éditeur / créateur de note — pivot « document riche unique »
 * (cf. .agent/PLAN_PIVOT_DOCUMENT_RICHE.md, .agent/PLAN_TESTS_NOTE_EDITOR.md).
 *
 * Le contenu est un document HTML unique (`Note.content`), rendu et édité dans le composant
 * `RichTextEditor`, qui regroupe la barre d'outils et la zone `contenteditable`
 * (cf. .agent/PLAN_REFONTE_EDITION_TEXTE.md). L'éditeur de note lui passe le HTML initial
 * via `[content]` et récupère le HTML courant via `(contentChange)` ; toute la mise en forme
 * et l'insertion média sont désormais internes au `RichTextEditor`.
 *
 * Décisions : D1 (route unique : id présent → édition, absent → création),
 * D3 (succès → retour /notes ; échec → on reste, pessimiste),
 * D5 (id inconnu → « note introuvable »).
 */
@Component({
  selector: 'app-note-editor',
  standalone: true,
  imports: [RichTextEditor],
  templateUrl: './note-editor.html',
  styleUrl: './note-editor.css',
})
export class NoteEditor implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly notesService = inject(NotesService);
  private readonly router = inject(Router);

  title = signal<string>('');
  category = signal<string>('');

  /** Contenu HTML travaillé (mis à jour à la frappe, envoyé à l'enregistrement). */
  content = signal<string>('');

  /** Chargement en cours (mode édition) — affiche l'indicateur. */
  isLoading = signal<boolean>(false);
  /** Note demandée introuvable (id sans correspondance — D5). */
  notFound = signal<boolean>(false);
  /** Mode édition (vrai) ou création (faux) — pour le libellé de l'en-tête. */
  editing = signal<boolean>(false);

  /** Identifiant de la note (mode édition) ou null (mode création — D1). */
  private noteId: string | null = null;

  async ngOnInit(): Promise<void> {
    this.noteId = this.route.snapshot.paramMap.get('id');
    this.editing.set(this.noteId !== null);

    // Mode édition : charger la note demandée.
    if (this.noteId) {
      this.isLoading.set(true);
      try {
        const note = await this.notesService.getNoteById(this.noteId);
        if (note) {
          this.title.set(note.title);
          this.category.set(note.category);
          this.content.set(note.content);
        } else {
          this.notFound.set(true);
        }
      } catch (err) {
        console.error('Erreur lors du chargement de la note', err);
      } finally {
        this.isLoading.set(false);
      }
      return;
    }

    // Mode création : document vierge.
    this.content.set('');
  }

  /**
   * Enregistre la note. Mode édition → mise à jour ; création → création.
   * Succès → retour à la liste (D3) ; échec → on reste sur l'éditeur (D4).
   */
  async onSave(): Promise<void> {
    const payload = {
      title: this.title(),
      category: this.category(),
      content: this.content(),
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

  /** Annule l'édition : retour à la liste sans rien enregistrer. */
  onCancel(): void {
    this.router.navigate(['/notes']);
  }
}

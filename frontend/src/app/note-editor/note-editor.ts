import { Component, ElementRef, OnInit, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NotesService } from '../core/services/notes-service';
import { FormatToolbar } from '../format-toolbar/format-toolbar';

/**
 * Éditeur / créateur de note — pivot « document riche unique »
 * (cf. .agent/PLAN_PIVOT_DOCUMENT_RICHE.md, .agent/PLAN_TESTS_NOTE_EDITOR.md).
 *
 * Le contenu est un document HTML unique (`Note.content`), rendu et édité sur place dans
 * une zone `contenteditable` (`.editor-content`). La mise en forme et l'insertion média
 * relèvent d'un composant séparé (`FormatToolbar`) branché ici.
 *
 * Branchement toolbar : l'éditeur suit la sélection courante dans le contenteditable
 * (le **HTML** de la portion + son `Range`), fournit ce HTML à la toolbar via `[selectedText]`,
 * et remplace la sélection par le HTML rendu qu'elle renvoie (`(formatApplied)`). Passer le
 * HTML (et non le texte nu) permet le cumul par imbrication : les mises en forme s'empilent
 * au lieu de s'écraser. La toolbar reste une fonction pure ; l'éditeur possède le DOM.
 *
 * Décisions : D1 (route unique : id présent → édition, absent → création),
 * D3 (succès → retour /notes ; échec → on reste, pessimiste),
 * D5 (id inconnu → « note introuvable »).
 */
@Component({
  selector: 'app-note-editor',
  standalone: true,
  imports: [FormatToolbar],
  templateUrl: './note-editor.html',
  styleUrl: './note-editor.css',
})
export class NoteEditor implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly notesService = inject(NotesService);
  private readonly router = inject(Router);

  /** Référence à la zone d'édition, pour lire son HTML et restaurer la sélection. */
  private readonly editorRef = viewChild<ElementRef<HTMLElement>>('editor');

  title = signal<string>('');
  category = signal<string>('');

  /** HTML de la portion sélectionnée dans l'éditeur, fourni à la toolbar (permet le cumul). */
  selectedText = signal<string>('');
  /** Dernière sélection non vide captée dans l'éditeur (perdue au clic sur un bouton). */
  private savedRange: Range | null = null;

  /** Contenu HTML travaillé (mis à jour à la frappe, envoyé à l'enregistrement). */
  content = signal<string>('');
  /**
   * HTML injecté dans la zone d'édition. Posé une seule fois au chargement : ne suit pas
   * la frappe, ce qui évite les sauts de curseur d'un `[innerHTML]` re-lié en continu.
   */
  renderHtml = signal<string>('');

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
          this.renderHtml.set(note.content);
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
    this.renderHtml.set('');
  }

  /** Capte l'édition sur place du contenu riche (contenteditable → content). */
  onContentInput(event: Event): void {
    this.content.set((event.target as HTMLElement).innerHTML);
  }

  /**
   * Mémorise la sélection courante si elle est dans l'éditeur et non vide.
   * Appelé au relâchement souris/clavier : le clic sur un bouton de la toolbar déplace
   * ensuite le focus, donc on garde le `Range` pour pouvoir le restaurer.
   */
  onSelectionChange(): void {
    const editor = this.editorRef()?.nativeElement;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    // Sélection hors de l'éditeur ou repliée (simple curseur) → rien à formater.
    if (range.collapsed || !editor.contains(range.commonAncestorContainer)) {
      this.selectedText.set('');
      return;
    }
    this.savedRange = range.cloneRange();

    // On transmet le **HTML** de la sélection (pas le texte nu) : la toolbar l'enveloppe tel
    // quel, donc les mises en forme s'empilent par imbrication (cumul, D13) au lieu d'écraser
    // l'existant. `cloneContents()` conserve le balisage interne (<em>, <strong>, <span>…).
    const holder = document.createElement('div');
    holder.appendChild(range.cloneContents());
    this.selectedText.set(holder.innerHTML);
  }

  /**
   * Reçoit le HTML rendu par la toolbar et remplace la sélection mémorisée par ce HTML,
   * puis resynchronise `content` depuis le DOM. Sans sélection valide, on ne fait rien.
   */
  onFormatApplied(html: string): void {
    const editor = this.editorRef()?.nativeElement;
    const range = this.savedRange;
    if (!editor || !range || !html) {
      return;
    }

    range.deleteContents();
    const fragment = range.createContextualFragment(html);
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);

    // Replace le curseur juste après le HTML inséré.
    if (lastNode) {
      const after = document.createRange();
      after.setStartAfter(lastNode);
      after.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(after);
    }

    this.content.set(editor.innerHTML);
    this.savedRange = null;
    this.selectedText.set('');
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

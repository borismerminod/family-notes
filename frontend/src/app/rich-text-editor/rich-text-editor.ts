import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BlockSize, NOTE_COLOR_PALETTE } from '../core/models';
import { FormatAction, FormattingService } from '../core/services/formatting-service';

/**
 * Éditeur de texte riche — regroupe la **barre d'outils** et la zone `contenteditable`
 * dans un même composant (cf. .agent/PLAN_REFONTE_EDITION_TEXTE.md §5, décision D2).
 *
 * Modèle de formatage (révision 2026-09-13, cf. PLAN_TESTS_FORMATTING_SERVICE.md) :
 * le `FormattingService` est **pur** (`applyFormat(html, action): string`) et ne touche jamais
 * au `document` ni à la sélection. C'est **ce composant** qui possède la sélection du
 * `contenteditable` : il en extrait le HTML, le confie au service, puis **réinsère** le résultat
 * (machinerie Selection/Range reprise de l'ancien `note-editor`). L'état actif des boutons est
 * recalculé auprès du service à chaque commande et sur `selectionchange` (D3/D4).
 */
@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './rich-text-editor.html',
  styleUrl: './rich-text-editor.css',
})
export class RichTextEditor {
  /** Service **pur** de mise en forme (transforme le HTML d'une sélection, D3). */
  private readonly formatting = inject(FormattingService);

  /** HTML initial affiché dans la zone d'édition (posé au chargement, D5). */
  readonly content = input<string>('');
  /** Notifie le HTML courant à chaque frappe (et, à terme, après chaque commande) (D7). */
  readonly contentChange = output<string>();

  /** Zone d'édition (contenteditable), pour lire son HTML et y injecter le contenu entrant. */
  private readonly editorRef = viewChild<ElementRef<HTMLElement>>('editor');

  /** Palette de couleurs proposée par les pastilles. */
  readonly palette = NOTE_COLOR_PALETTE;

  /** Boutons de taille proposés, avec leur libellé. */
  readonly sizes: ReadonlyArray<{ size: BlockSize; label: string; title: string }> = [
    { size: 'small', label: 'A−', title: 'Petite' },
    { size: 'normal', label: 'A', title: 'Normale' },
    { size: 'large', label: 'A+', title: 'Grande' },
    { size: 'h2', label: 'H2', title: 'Titre 2' },
    { size: 'h1', label: 'H1', title: 'Titre 1' },
  ];

  /**
   * État actif des boutons (surbrillance). Recalculé à partir de la sélection courante — logique
   * à implémenter (inspection du DOM de la sélection). Défaut neutre pour l'instant.
   */
  readonly active = signal<{
    bold: boolean;
    italic: boolean;
    underline: boolean;
    bullet: boolean;
    numbered: boolean;
    color: string;
    size: BlockSize;
  }>({
    bold: false,
    italic: false,
    underline: false,
    bullet: false,
    numbered: false,
    color: '',
    size: 'normal',
  });

  // --- Popups média ----------------------------------------------------------
  readonly imagePopupOpen = signal(false);
  readonly imageUrl = signal('');
  readonly videoPopupOpen = signal(false);
  readonly videoUrl = signal('');

  constructor() {
    // D5 — Injection du contenu entrant seulement hors focus (garde anti-saut de curseur).
    effect(() => {
      const html = this.content();
      const editor = this.editorRef()?.nativeElement;
      if (!editor) {
        return;
      }
      if (html !== editor.innerHTML && document.activeElement !== editor) {
        editor.innerHTML = html;
      }
    });

    // D3/D4 — Re-sélectionner du texte doit rafraîchir la surbrillance des boutons. On écoute
    // `selectionchange` au niveau document (la sélection du contenteditable y est reflétée) et
    // on relit l'état actif auprès du service. Nettoyé à la destruction du composant.
    const onSelectionChange = () => this.refreshActive();
    document.addEventListener('selectionchange', onSelectionChange);
    inject(DestroyRef).onDestroy(() =>
      document.removeEventListener('selectionchange', onSelectionChange),
    );
  }

  /** Frappe dans la zone d'édition → notifie le contenu courant (D7). */
  onInput(): void {
    this.emitContent();
  }

  // --- Actions de formatage (délégation au service pur) ----------------------
  // Chaque handler construit une `FormatAction` et la confie à `applyToSelection`, qui possède
  // la sélection du contenteditable : extraction du HTML → `applyFormat` → réinsertion.

  applyMark(mark: 'bold' | 'italic' | 'underline'): void {
    this.applyToSelection({ type: mark });
  }

  applyList(style: 'bullet' | 'numbered'): void {
    this.applyToSelection({ type: 'list', style });
  }

  applyColor(color: string): void {
    this.applyToSelection({ type: 'color', color });
  }

  applySize(size: BlockSize): void {
    this.applyToSelection({ type: 'size', size });
  }

  /**
   * Applique `action` à la sélection courante du contenteditable. Le service étant **pur**
   * (`string → string`), c'est ici qu'on capte la sélection, qu'on lui passe son HTML et qu'on
   * réinsère le résultat. Sélection absente / hors éditeur / repliée → rien (le service ne
   * transforme qu'une sélection non vide, D8). Recalcule l'état actif et réémet le contenu (D7).
   */
  private applyToSelection(action: FormatAction): void {
    const editor = this.editorRef()?.nativeElement;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (range.collapsed || !editor.contains(range.commonAncestorContainer)) {
      return;
    }

    // HTML de la sélection (balisage interne préservé → cumul par imbrication côté service, D7).
    const holder = document.createElement('div');
    holder.appendChild(range.cloneContents());
    const formatted = this.formatting.applyFormat(holder.innerHTML, action);

    this.replaceRange(range, formatted);
    this.refreshActive();
    this.emitContent();
  }

  /**
   * Remplace le contenu d'un `Range` par `html` et replace le curseur juste après l'insertion.
   * Machinerie DOM commune au formatage et à l'insertion média (reprise de l'ancien note-editor).
   */
  private replaceRange(range: Range, html: string): void {
    range.deleteContents();
    const fragment = range.createContextualFragment(html);
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);
    if (lastNode) {
      const after = document.createRange();
      after.setStartAfter(lastNode);
      after.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(after);
    }
  }

  /**
   * Relit l'état actif de la sélection courante auprès du service (pur) et met à jour le signal
   * `active` (surbrillance des boutons, D3). Hors sélection utile → défauts neutres.
   */
  private refreshActive(): void {
    const editor = this.editorRef()?.nativeElement;
    const selection = window.getSelection();
    const range =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (!editor || !range || range.collapsed || !editor.contains(range.commonAncestorContainer)) {
      this.active.set({
        bold: false,
        italic: false,
        underline: false,
        bullet: false,
        numbered: false,
        color: '',
        size: 'normal',
      });
      return;
    }

    const holder = document.createElement('div');
    holder.appendChild(range.cloneContents());
    const html = holder.innerHTML;
    const f = this.formatting;
    const color = this.palette.find((c) => f.isActive(html, { type: 'color', color: c })) ?? '';
    const size =
      this.sizes.map((s) => s.size).find((sz) => f.isActive(html, { type: 'size', size: sz })) ??
      'normal';
    this.active.set({
      bold: f.isActive(html, { type: 'bold' }),
      italic: f.isActive(html, { type: 'italic' }),
      underline: f.isActive(html, { type: 'underline' }),
      bullet: f.isActive(html, { type: 'list', style: 'bullet' }),
      numbered: f.isActive(html, { type: 'list', style: 'numbered' }),
      color,
      size,
    });
  }

  // --- Insertion média (insertion au caret : à implémenter) ------------------
  openImagePopup(): void {
    this.imagePopupOpen.set(true);
  }
  closeImagePopup(): void {
    this.imagePopupOpen.set(false);
    this.imageUrl.set('');
  }

  /** Primitive d'insertion d'image au caret (lien ou data URL). */
  insertImage(src: string): void {
    this.insertHtmlAtCaret(`<img src="${src}" alt="" />`);
  }

  insertImageFromUrl(): void {
    const url = this.imageUrl().trim();
    if (!url) {
      return;
    }
    this.insertImage(url);
    this.closeImagePopup();
  }

  onImageFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.insertImage(String(reader.result));
      this.closeImagePopup();
    };
    reader.readAsDataURL(file);
  }

  openVideoPopup(): void {
    this.videoPopupOpen.set(true);
  }
  closeVideoPopup(): void {
    this.videoPopupOpen.set(false);
    this.videoUrl.set('');
  }

  insertVideoFromUrl(): void {
    const url = this.videoUrl().trim();
    if (!url) {
      return;
    }
    const src = this.toEmbedUrl(url);
    this.insertHtmlAtCaret(`<iframe src="${src}" frameborder="0" allowfullscreen></iframe>`);
    this.closeVideoPopup();
  }

  /** Convertit un lien de partage en URL d'embed (YouTube / Vimeo), sinon le renvoie tel quel. */
  private toEmbedUrl(url: string): string {
    const youtube = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
    if (youtube) {
      return `https://www.youtube.com/embed/${youtube[1]}`;
    }
    const vimeo = url.match(/vimeo\.com\/(\d+)/);
    if (vimeo) {
      return `https://player.vimeo.com/video/${vimeo[1]}`;
    }
    return url;
  }

  /**
   * Insère `html` à l'emplacement du curseur dans l'éditeur, puis réémet le contenu. Sans
   * sélection utile dans l'éditeur, on insère en fin de zone (repli sûr pour un média).
   */
  private insertHtmlAtCaret(html: string): void {
    const editor = this.editorRef()?.nativeElement;
    if (!editor) {
      return;
    }
    const selection = window.getSelection();
    const current =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    let range: Range;
    if (current && editor.contains(current.commonAncestorContainer)) {
      range = current;
    } else {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }

    this.replaceRange(range, html);
    this.emitContent();
  }

  /** Émet l'`innerHTML` courant de la zone d'édition. */
  private emitContent(): void {
    const editor = this.editorRef()?.nativeElement;
    if (editor) {
      this.contentChange.emit(editor.innerHTML);
    }
  }
}

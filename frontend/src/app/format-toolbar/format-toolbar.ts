import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BlockSize, NOTE_COLOR_PALETTE } from '../core/models';

/**
 * Action de mise en forme demandée à la barre d'outils.
 * Union discriminée (cf. .agent/PLAN_TESTS_FORMAT_TOOLBAR.md §3).
 */
export type FormatAction =
  | { type: 'bold' | 'italic' | 'underline' }
  | { type: 'color'; color: string }
  | { type: 'size'; size: BlockSize }
  | { type: 'list'; style: 'bullet' | 'numbered' };

/**
 * Barre d'outils de formatage — « agit comme une fonction » : reçoit une portion de texte
 * (ou une URL / un data URL média) et renvoie le HTML rendu, émis vers le parent.
 *
 * TDD par groupes (skill `dev_par_groupes`, cf. .agent/PLAN_TESTS_FORMAT_TOOLBAR.md).
 * Réalisé : G1 marques (+ cumul D13), G2 couleur, G3 taille, G4 listes, G5 cas limites,
 *   G6 câblage, G7 image (popup lien/fichier), G8 vidéo (popup lien seul). Lot complet.
 */
@Component({
  selector: 'app-format-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './format-toolbar.html',
  styleUrl: './format-toolbar.css',
})
export class FormatToolbar {
  /**
   * Sélection courante fournie par le parent. ⚠️ Doit contenir le **HTML** de la sélection
   * (pas le texte nu) : on l'enveloppe **tel quel**, donc les mises en forme s'empilent par
   * **imbrication** (cumul, D13) — p.ex. `<strong>x</strong>` + souligné →
   * `<u><strong>x</strong></u>` (gras ET souligné). L'intégration (note-editor) doit donc
   * passer le HTML de la sélection ; passer le texte nu ferait « sauter » la mise en forme existante.
   */
  @Input() selectedText = '';

  /** Émet le HTML rendu (la « sortie ») à destination du parent. */
  @Output() formatApplied = new EventEmitter<string>();

  /** Ouverture de la popup d'insertion d'image (G7, rendu conditionnel — D12). */
  readonly imagePopupOpen = signal(false);
  /** Valeur courante du champ URL de l'image. */
  readonly imageUrl = signal('');

  /** Ouverture de la popup d'insertion de vidéo (G8, rendu conditionnel — D12). */
  readonly videoPopupOpen = signal(false);
  /** Valeur courante du champ URL de la vidéo. */
  readonly videoUrl = signal('');

  /** Palette de couleurs proposée par les pastilles (G2). */
  readonly palette = NOTE_COLOR_PALETTE;

  /**
   * Correspondance taille → `font-size` (D4). `normal` = chaîne vide → texte inchangé.
   * Table facile à ajuster/étendre (intérêt du style inline).
   */
  static readonly FONT_SIZES: Record<BlockSize, string> = {
    small: 'small',
    normal: '',
    large: 'large',
    h2: 'x-large',
    h1: 'xx-large',
  };

  /** Boutons de taille proposés par la toolbar (G3), avec leur libellé. */
  readonly sizes: ReadonlyArray<{ size: BlockSize; label: string; title: string }> = [
    { size: 'small', label: 'A−', title: 'Petite' },
    { size: 'normal', label: 'A', title: 'Normale' },
    { size: 'large', label: 'A+', title: 'Grande' },
    { size: 'h2', label: 'H2', title: 'Titre 2' },
    { size: 'h1', label: 'H1', title: 'Titre 1' },
  ];

  /**
   * Cœur du composant : transforme `text` selon `action` et renvoie le HTML.
   * Fonction pure (aucun effet de bord). Portion vide → sortie vide (D6).
   */
  applyFormat(text: string, action: FormatAction): string {
    if (!text) {
      return '';
    }
    switch (action.type) {
      // Groupe 1 — marques sémantiques (D2).
      case 'bold':
        return `<strong>${text}</strong>`;
      case 'italic':
        return `<em>${text}</em>`;
      case 'underline':
        return `<u>${text}</u>`;
      // Groupe 2 — couleur en style inline, toute couleur non vide (D3).
      case 'color':
        return `<span style="color:${action.color}">${text}</span>`;
      // Groupe 3 — taille en style inline (D4). `normal` → texte inchangé.
      case 'size': {
        const fontSize = FormatToolbar.FONT_SIZES[action.size];
        return fontSize ? `<span style="font-size:${fontSize}">${text}</span>` : text;
      }
      // Groupe 4 — listes (D5). Multi-lignes → un <li> par ligne.
      case 'list': {
        const items = text
          .split('\n')
          .map((line) => `<li>${line}</li>`)
          .join('');
        return action.style === 'numbered' ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
      }
      default:
        return '';
    }
  }

  /** Bouton de marque (G1) : émet la portion enrobée. */
  applyMark(type: 'bold' | 'italic' | 'underline'): void {
    this.emit({ type });
  }

  /** Pastille de couleur (G2) : émet la portion colorée. */
  applyColor(color: string): void {
    this.emit({ type: 'color', color });
  }

  /** Bouton de taille (G3) : émet la portion dimensionnée. */
  applySize(size: BlockSize): void {
    this.emit({ type: 'size', size });
  }

  /** Bouton de liste (G4) : émet la portion en liste (à puces ou numérotée). */
  applyList(style: 'bullet' | 'numbered'): void {
    this.emit({ type: 'list', style });
  }

  /**
   * Applique l'action à la portion courante et émet la sortie (D8).
   * Garde : sans sélection, on n'émet rien (D9).
   */
  private emit(action: FormatAction): void {
    if (!this.selectedText) {
      return;
    }
    this.formatApplied.emit(this.applyFormat(this.selectedText, action));
  }

  /** Ouvre / ferme la popup d'insertion d'image (G7). */
  openImagePopup(): void {
    this.imagePopupOpen.set(true);
  }
  closeImagePopup(): void {
    this.imagePopupOpen.set(false);
    this.imageUrl.set('');
  }

  /**
   * Primitive d'insertion d'image (G7) : enveloppe `src` dans une `<img>` et émet la sortie.
   * `src` peut être un lien (`https://…`) ou un data URL (`data:image/…`). Renvoie aussi le HTML.
   */
  insertImage(src: string): string {
    if (!src) {
      return '';
    }
    const html = `<img src="${src}">`;
    this.formatApplied.emit(html);
    return html;
  }

  /** Insertion d'image par lien (bouton `.btn-image-link`). */
  insertImageFromUrl(): void {
    const url = this.imageUrl().trim();
    if (!url) {
      return;
    }
    this.insertImage(url);
    this.closeImagePopup();
  }

  /**
   * Insertion d'image depuis le PC (`input[type=file]`) : lecture en data URL via FileReader,
   * puis insertion. Le câblage FileReader est de l'intégration (hors unitaire) ; la primitive
   * `insertImage` reste testée avec un data URL.
   */
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

  /** Ouvre / ferme la popup d'insertion de vidéo (G8). */
  openVideoPopup(): void {
    this.videoPopupOpen.set(true);
  }
  closeVideoPopup(): void {
    this.videoPopupOpen.set(false);
    this.videoUrl.set('');
  }

  /**
   * Primitive d'insertion de vidéo incrustée (G8) : construit un embed `<iframe>` à partir d'un
   * lien (YouTube / Vimeo reconnus, sinon lien tel quel) et émet la sortie. Lien **seul** : pas
   * d'insertion de fichier vidéo (D11).
   */
  insertVideo(url: string): string {
    if (!url) {
      return '';
    }
    const src = this.toEmbedUrl(url);
    const html = `<iframe src="${src}" frameborder="0" allowfullscreen></iframe>`;
    this.formatApplied.emit(html);
    return html;
  }

  /** Insertion de vidéo par lien (bouton `.btn-video-link`). */
  insertVideoFromUrl(): void {
    const url = this.videoUrl().trim();
    if (!url) {
      return;
    }
    this.insertVideo(url);
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
}

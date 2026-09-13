import { Injectable } from '@angular/core';
import { BlockSize } from '../models';

/**
 * Action de mise en forme demandée au service (union discriminée).
 * Cf. .agent/PLAN_TESTS_FORMATTING_SERVICE.md §5.
 */
export type FormatAction =
  | { type: 'bold' | 'italic' | 'underline' }
  | { type: 'color'; color: string }
  | { type: 'size'; size: BlockSize }
  | { type: 'list'; style: 'bullet' | 'numbered' };

/**
 * `FormattingService` — service **pur** de mise en forme.
 *
 * `applyFormat(html, action)` reçoit le HTML d'une sélection et renvoie le HTML transformé ;
 * c'est le composant `RichTextEditor` qui possède la sélection du contenteditable et réinsère
 * le résultat. Aucun accès au `document` global d'édition ni à la sélection (pas d'`execCommand`).
 * L'analyse DOM utilisée pour le toggle est **locale** (élément détaché) et déterministe → pur.
 *
 * ⚠️ Construit en TDD groupe par groupe (skill `dev_par_groupes`,
 * cf. .agent/PLAN_TESTS_FORMATTING_SERVICE.md). Réalisé : **G1 marques (envelopper)**,
 * **G2 marques (toggle/désenrober)**, **G4 couleur**, **G5 taille**, **G6 listes**, **G8 `isActive`**. Lot complet.
 */
@Injectable({ providedIn: 'root' })
export class FormattingService {
  /** Balise sémantique par marque (D3). */
  private static readonly MARK_TAG: Record<'bold' | 'italic' | 'underline', string> = {
    bold: 'STRONG',
    italic: 'EM',
    underline: 'U',
  };

  /**
   * Transforme `html` (la sélection) selon `action` et renvoie le HTML. Pur.
   * Sélection vide → sortie vide (D8).
   */
  applyFormat(html: string, action: FormatAction): string {
    if (!html) {
      return '';
    }
    switch (action.type) {
      // G1/G2 — marques sémantiques : toggle (envelopper si absente, désenrober si présente).
      case 'bold':
      case 'italic':
      case 'underline':
        return this.toggleMark(html, action.type);
      // G4 — couleur (D4) : span coloré, avec remplacement si déjà coloré.
      case 'color':
        return this.applyColor(html, action.color);
      // G5 — taille (D5) : normal inchangé, h1/h2 en balises, small/large en font-size.
      case 'size':
        return this.applySize(html, action.size);
      // G6 — listes (D6) : un <li> par ligne, enveloppé dans <ul>/<ol>.
      case 'list':
        return this.applyList(html, action.style);
      default:
        return html;
    }
  }

  /**
   * La sélection porte-t-elle déjà cette mise en forme ? (G8). Couvre les **marques**
   * (unique élément racine de la balise correspondante) ; couleur/taille/liste → `false`
   * (hors périmètre de ce lot).
   */
  isActive(html: string, action: FormatAction): boolean {
    if (!html) {
      return false;
    }
    switch (action.type) {
      case 'bold':
      case 'italic':
      case 'underline':
        return this.isSingleRootTag(html, FormattingService.MARK_TAG[action.type]);
      default:
        return false;
    }
  }

  // --- Marques ---------------------------------------------------------------

  /**
   * Bascule une marque : si `html` est **déjà entièrement** enveloppé par la balise de la marque
   * (D2), on **désenrobe** (renvoie le contenu interne) ; sinon on **enveloppe** (cumul par
   * imbrication si une autre mise en forme est présente, D7).
   */
  private toggleMark(html: string, mark: 'bold' | 'italic' | 'underline'): string {
    const tag = FormattingService.MARK_TAG[mark];
    if (this.isSingleRootTag(html, tag)) {
      return this.innerHtmlOf(html);
    }
    const name = tag.toLowerCase();
    return `<${name}>${html}</${name}>`;
  }

  // --- Couleur ---------------------------------------------------------------

  /**
   * Applique une couleur. Si `html` est **déjà** un unique `<span>` coloré, on **remplace** la
   * couleur (pas d'empilement, D4) ; sinon on enveloppe la sélection dans un span coloré.
   */
  private applyColor(html: string, color: string): string {
    const inner = this.isSingleRootWithStyle(html, 'SPAN', 'color') ? this.innerHtmlOf(html) : html;
    return `<span style="color:${color}">${inner}</span>`;
  }

  // --- Taille ----------------------------------------------------------------

  /**
   * Applique une taille (D5) : `normal` → texte inchangé (aucun style) ; `h1`/`h2` → balise de
   * titre ; `small`/`large` → `font-size` inline, en **remplaçant** un span de taille existant.
   */
  private applySize(html: string, size: BlockSize): string {
    if (size === 'normal') {
      return html;
    }
    if (size === 'h1' || size === 'h2') {
      return `<${size}>${html}</${size}>`;
    }
    const inner = this.isSingleRootWithStyle(html, 'SPAN', 'font-size')
      ? this.innerHtmlOf(html)
      : html;
    return `<span style="font-size:${size}">${inner}</span>`;
  }

  // --- Listes ----------------------------------------------------------------

  /** Enveloppe chaque ligne (séparée par `\n`) dans un `<li>`, le tout dans `<ul>`/`<ol>` (D6). */
  private applyList(html: string, style: 'bullet' | 'numbered'): string {
    const items = html
      .split('\n')
      .map((line) => `<li>${line}</li>`)
      .join('');
    const tag = style === 'numbered' ? 'ol' : 'ul';
    return `<${tag}>${items}</${tag}>`;
  }

  // --- Analyse DOM locale (pure) ---------------------------------------------

  /** Analyse `html` dans un élément détaché (aucun effet de bord). */
  private parse(html: string): HTMLElement {
    const holder = document.createElement('div');
    holder.innerHTML = html;
    return holder;
  }

  /** `html` est-il constitué d'un **unique** élément racine dont la balise est `tag` ? */
  private isSingleRootTag(html: string, tag: string): boolean {
    const holder = this.parse(html);
    return (
      holder.childNodes.length === 1 &&
      holder.children.length === 1 &&
      holder.firstElementChild!.tagName === tag
    );
  }

  /** `html` est-il un unique élément racine `tag` portant la propriété de style `prop` ? */
  private isSingleRootWithStyle(html: string, tag: string, prop: string): boolean {
    const holder = this.parse(html);
    if (holder.childNodes.length !== 1 || holder.children.length !== 1) {
      return false;
    }
    const el = holder.firstElementChild as HTMLElement;
    return el.tagName === tag && el.style.getPropertyValue(prop) !== '';
  }

  /** HTML interne de l'unique élément racine de `html`. */
  private innerHtmlOf(html: string): string {
    return this.parse(html).firstElementChild!.innerHTML;
  }
}

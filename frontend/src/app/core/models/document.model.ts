/**
 * @file document.model.ts
 * @description Modèle de document JSON canonique — source de vérité du contenu d'une note.
 *
 * Décidé le 2026-09-15 (cf. .agent/PLAN_MODELE_DOCUMENT_JSON.md, option C). **Remplace**
 * l'approche « HTML source de vérité » : le contenu d'une note n'est plus du HTML, mais un
 * tableau plat de blocs sérialisable, stocké tel quel (`JSON.stringify`) dans `notes.content`.
 * Le `contenteditable` devient un simple écran (rendu du modèle + capture de saisie) ; on ne
 * relit jamais son DOM comme vérité.
 *
 * Ce fichier ne contient QUE des types et des gardes (aucune logique) :
 *  - la normalisation canonique et les commandes vivent dans `document-model.ts` (pur) ;
 *  - le rendu modèle → HTML dans `document-render.ts` ;
 *  - le parsing HTML → modèle dans `document-parse.ts`.
 *
 * Réconcilie et étend `note-block.model.ts` : on conserve `id` / blocs média, mais on
 * **remplace le HTML inline** (`content: string`) par un couple `text` (texte nu) + `marks`
 * (marques de formatage par intervalles). Cf. §3 et §4 du plan.
 */

/**
 * Marque de formatage inline, exprimée comme un **intervalle demi-ouvert** `[start, end)`
 * sur le texte nu du bloc.
 *
 * - Offsets en **unités UTF-16** (D5) : alignés sur l'API `Selection`/`Range` et sur
 *   l'indexation des `string` JS, donc composables sans conversion.
 * - Les marques sont des **intervalles plats, jamais imbriqués** (D4) : une même mise en
 *   forme = un ensemble d'intervalles ; le nesting des balises est *calculé au rendu*
 *   (ordre canonique D7), jamais stocké. C'est ce qui rend ajout et retrait symétriques
 *   (union / soustraction d'intervalles).
 */
export interface Mark {
  type: MarkType;
  /** Borne de début incluse, en offset UTF-16. */
  start: number;
  /** Borne de fin exclue, en offset UTF-16. */
  end: number;
  /**
   * Valeur portée par la marque :
   *  - `'color'` : couleur hex `#rrggbb` ;
   *  - `'size'`  : `'small'` | `'large'` ;
   *  - absente pour `'bold'` / `'italic'` / `'underline'`.
   */
  value?: string;
}

/** Types de marques inline supportés. */
export type MarkType = 'bold' | 'italic' | 'underline' | 'color' | 'size';

/** Valeurs admissibles pour une marque `size` (le « normal » = absence de marque). */
export type MarkSize = 'small' | 'large';

/** Champ commun à tous les blocs : un identifiant unique (UUID), prérequis CRDT. */
export interface BaseBlock {
  /** Identifiant unique du bloc (UUID) — posé dès maintenant pour la synchro CRDT. */
  id: string;
}

/**
 * `kind` d'un bloc textuel. La « taille » titre est fusionnée dans le `kind` (D8) :
 *  - `h1` / `h2` sont des blocs (niveau structurel), pas des marques inline ;
 *  - `small` / `large` restent des marques inline (`size`) ; `normal` = leur absence.
 * Un item de liste (`bullet` / `numbered`) est un bloc plat (D9) ; le `<ul>`/`<ol>` est
 * reconstitué au rendu à partir des blocs consécutifs de même type.
 */
export type TextBlockKind = 'text' | 'h1' | 'h2' | 'bullet' | 'numbered';

/**
 * Bloc textuel : paragraphe, titre ou item de liste. Porte le **texte nu** (aucune balise,
 * aucun `\n` — un saut de ligne dur = deux blocs, D3/§4.1) et ses **marques** sous forme
 * canonique une fois `normalize` appliqué (D6).
 */
export interface TextBlock extends BaseBlock {
  kind: TextBlockKind;
  /** Texte nu du bloc — aucune balise, aucun saut de ligne. */
  text: string;
  /** Marques de formatage inline. Canonique après `normalize` (triées, fusionnées, bornées). */
  marks: Mark[];
}

/** Bloc image atomique (void, D10) : pas de texte, pas de marque. `src` = chemin local. */
export interface ImageBlock extends BaseBlock {
  kind: 'image';
  src: string;
}

/**
 * Bloc vidéo atomique (void, D10) : soit un lien externe (`url`), soit un fichier local
 * (`src`, chemin Capacitor Filesystem).
 */
export interface VideoBlock extends BaseBlock {
  kind: 'video';
  url?: string;
  src?: string;
}

/** Union discriminée (sur `kind`) de tous les blocs d'une note. */
export type NoteBlock = TextBlock | ImageBlock | VideoBlock;

/** Le document complet : un tableau plat de blocs (D2). */
export type DocModel = NoteBlock[];

// --- Type guards ----------------------------------------------------------------
// Utiles pour le rendu dynamique et le mapping de sélection (Phase 3).

/** Les `kind` correspondant à un bloc textuel (porteur de `text` + `marks`). */
const TEXT_BLOCK_KINDS: readonly TextBlockKind[] = ['text', 'h1', 'h2', 'bullet', 'numbered'];

/** Vrai si le bloc est textuel (paragraphe, titre ou item de liste). */
export function isTextBlock(block: NoteBlock): block is TextBlock {
  return (TEXT_BLOCK_KINDS as readonly string[]).includes(block.kind);
}

/** Vrai si le bloc est une image. */
export function isImageBlock(block: NoteBlock): block is ImageBlock {
  return block.kind === 'image';
}

/** Vrai si le bloc est une vidéo. */
export function isVideoBlock(block: NoteBlock): block is VideoBlock {
  return block.kind === 'video';
}

/** Vrai si le bloc est atomique (média void) : la sélection le traite comme un tout (D10). */
export function isVoidBlock(block: NoteBlock): block is ImageBlock | VideoBlock {
  return isImageBlock(block) || isVideoBlock(block);
}

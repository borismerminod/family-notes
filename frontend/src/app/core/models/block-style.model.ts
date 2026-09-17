/**
 * @file block-style.model.ts
 * @description Styles de bloc et options de formatage inline (barre d'outils flottante).
 *
 * Le formatage inline (gras / italique / souligné / couleur) est appliqué directement
 * dans le HTML du champ `content` d'un bloc texte (cf. seed_notes.sql :
 * "Texte avec <span style='color:#FF0000'>couleur</span>"). Les types ci-dessous
 * décrivent les *options* proposées par l'éditeur, pas une structure persistée à part.
 */

/**
 * Taille appliquée à un bloc texte / titre.
 * Couvre les valeurs réelles du seed (`h1`, `h2`, `normal`) et les tailles de la
 * spec (Petite / Normale / Grande / Titre → small / normal / large / h1|h2).
 */
export type BlockSize = 'small' | 'normal' | 'large' | 'h2' | 'h1';

/** Style structurel d'un bloc texte / titre. */
export interface TextBlockStyle {
  size: BlockSize;
}

/** Marques de formatage inline proposées par la barre d'outils flottante. */
export type TextFormat = 'bold' | 'italic' | 'underline';

/**
 * Palette de 8 couleurs de base proposée pour le formatage du texte.
 * `as const` pour dériver un type littéral (`NoteColor`) et éviter les fautes de frappe.
 */
export const NOTE_COLOR_PALETTE = [
  '#000000', // Noir
  '#FF3B30', // Rouge
  '#FF9500', // Orange
  '#FFCC00', // Jaune
  '#34C759', // Vert
  '#007AFF', // Bleu
  '#AF52DE', // Violet
  '#8E8E93', // Gris
] as const;

/** Couleur valide pour le formatage de texte (issue de la palette prédéfinie). */
export type NoteColor = (typeof NOTE_COLOR_PALETTE)[number];

/**
 * @file note.model.ts
 * @description Modèle applicatif d'une note (architecture par blocs).
 */

export interface Note {
  id: string;
  title: string;
  /** Catégorie (colonne TEXT). Migrera vers Category.id lorsque la table existera. */
  category: string;
  /**
   * Contenu de la note : un document HTML unique (pivot « document riche »,
   * cf. .agent/PLAN_PIVOT_DOCUMENT_RICHE.md). Stocké tel quel dans la colonne `content`.
   */
  content: string;
  /** Date de dernière modification, au format ISO 8601. */
  updatedAt: string;
}

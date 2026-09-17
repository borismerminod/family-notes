/**
 * @file note.model.ts
 * @description Modèle applicatif d'une note (architecture par blocs).
 */

import { NoteBlock } from './document.model';

export interface Note {
  id: string;
  title: string;
  /** Catégorie (colonne TEXT). Migrera vers Category.id lorsque la table existera. */
  category: string;
  /**
   * Contenu de la note : un **document JSON** (modèle canonique, cf.
   * .agent/PLAN_MODELE_DOCUMENT_JSON.md). Stocké en base comme `JSON.stringify(blocks)` dans la
   * colonne `content` ; le `NotesService` décode/encode aux frontières (avec migration de l'ancien
   * HTML / de l'ancien format JSON).
   */
  blocks: NoteBlock[];
  /** Date de dernière modification, au format ISO 8601. */
  updatedAt: string;
}

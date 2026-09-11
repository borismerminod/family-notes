/**
 * @file category.model.ts
 * @description Modèle de catégorie de note.
 *
 * ⚠️ Anticipation : le schéma SQL actuel (scripts/schema_notes.sql) stocke la catégorie
 * comme une simple colonne `TEXT` sur la table `notes` — il n'existe pas encore de table
 * `categories`. Ce modèle prépare l'auto-création de catégories décrite dans
 * PLAN_NOTES.md §B.1 (champ Autocomplete). La table `categories` et sa migration
 * sont hors périmètre de ce lot et restent à créer.
 */
export interface Category {
  /** Identifiant unique de la catégorie (UUID). */
  id: string;
  /** Libellé affiché et saisi par l'utilisateur. */
  name: string;
  /** Couleur d'accent optionnelle (ex. pour le tag sur la carte de note). */
  color?: string;
}

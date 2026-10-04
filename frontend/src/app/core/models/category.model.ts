/**
 * @file category.model.ts
 * @description Modèle de catégorie de note.
 *
 * Les catégories sont stockées dans leur propre table `categories` (`id`, `name` unique,
 * `color`) et les notes les référencent par `notes.category_id` (cf. scripts/schema_notes.sql).
 * La migration depuis l'ancien format — catégorie en texte libre sur la note — est jouée au
 * démarrage par `SqliteService.migrateSchema()`.
 */
export interface Category {
  /** Identifiant unique de la catégorie (UUID). */
  id: (string|null);
  /** Libellé affiché et saisi par l'utilisateur. */
  name: string;
  /** Couleur d'accent optionnelle (ex. pour le tag sur la carte de note). */
  color?: string;
}

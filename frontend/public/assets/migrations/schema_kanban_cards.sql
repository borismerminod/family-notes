-- Table des cartes d'un tableau kanban — l'unité de travail que l'utilisateur fait avancer d'une
-- liste à l'autre (EDITION_CARTES, D-C1). Contrairement aux colonnes, aucune divergence de
-- vocabulaire : l'utilisateur lit « carte », le code dit `card`, la base dit `kanban_cards`.
--
-- Exécuté par `SchemaMigrationService`
-- (frontend/src/app/core/services/schema-migration.service.ts) au démarrage, sur une base déjà
-- en place **comme sur une installation neuve** : le seed binaire livré dans les assets n'est pas
-- regénéré pour ce lot (APPROCHE_KANBAN_EDITION_CARTES.md, D-C17), c'est donc ce script qui crée
-- la table partout.
-- Également exécutable à la main : sqlite3 <base> < schema_kanban_cards.sql
-- (vérification : scripts/kanban_cards_check.sql).
--
-- C'est la **quatrième et dernière étape** de la migration, et elle vient après les trois autres
-- parce qu'elle référence `kanban_columns` **et** `notes` : les deux tables doivent exister.
--
-- Une carte porte un identifiant, la colonne qui la tient, un texte, une référence facultative
-- vers une note et sa position dans la colonne (D-C1). **Pas de dates** : rien ne les affiche, et
-- `kanbans.updated_at` bouge déjà quand les cartes changent (D-K1, D-L6).
--
-- **Aucune contrainte d'unicité**, et c'est voulu :
--   * ni sur `text` — deux cartes homonymes sont permises, dans une même colonne comme dans deux
--     colonnes différentes, l'`id` les distingue (US2, comme D-L6 pour les colonnes).
--   * ni sur `(column_id, position)` — l'enregistrement met à jour les cartes affichées **avant**
--     de supprimer les absentes (D-C8), ce qui laisse passer une collision temporaire de
--     positions. L'ordre des quatre phases est précisément ce qui permet à une carte déplacée
--     d'une colonne à l'autre de garder son identifiant au lieu d'être détruite puis recréée.
--   * ni sur `note_id` — deux cartes peuvent viser la **même** note (US2).
--
-- Les deux actions référentielles portent chacune une décision de la SPEC :
--   * `column_id` en `ON DELETE CASCADE` — retirer une liste emporte ses cartes, et comme
--     `kanban_columns.kanban_id` est lui-même en cascade, supprimer un tableau nettoie les deux
--     étages d'un coup.
--   * `note_id` en `ON DELETE SET NULL` — supprimer une note ne doit **jamais** faire disparaître
--     du travail dans un tableau (H-C6, D-C16) : la carte garde son texte, seule la référence
--     s'efface. Le texte est la donnée porteuse, le lien n'est qu'un complément.
--
-- Ces deux actions ne sont effectives que si la connexion porte `PRAGMA foreign_keys = ON`
-- (D-L14, posé par `DatabaseService` hors transaction) : sans ce pragma SQLite les ignore purement
-- et simplement, la suppression d'une liste laisserait ses cartes orphelines et celle d'une note
-- laisserait des cartes pointant vers une note disparue. Jouer ce script à la main dans `sqlite3`
-- demande donc le même pragma pour que la cascade et le `SET NULL` fonctionnent ensuite.

CREATE TABLE IF NOT EXISTS kanban_cards (
    id              TEXT    PRIMARY KEY
                            CHECK (length(id) > 0),

    column_id       TEXT    NOT NULL
                            REFERENCES kanban_columns(id) ON DELETE CASCADE,

    text            TEXT    NOT NULL
                            CHECK (length(trim(text)) > 0),

    note_id         TEXT    REFERENCES notes(id) ON DELETE SET NULL,

    position        INTEGER NOT NULL
                            CHECK (position >= 0)
);

-- Les cartes d'une colonne sont toujours lues ensemble et triées par position croissante
-- (US1, D-C19).
CREATE INDEX IF NOT EXISTS idx_kanban_cards_column_position
    ON kanban_cards(column_id, position);

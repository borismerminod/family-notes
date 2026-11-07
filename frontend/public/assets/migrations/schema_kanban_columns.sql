-- Table des colonnes d'un tableau kanban — les « listes » de l'interface (EDITION_LISTES, D-L5 :
-- l'utilisateur voit « liste », le code et la base disent « column », `kanban-list` désignant
-- déjà l'écran de la liste des tableaux).
--
-- Exécuté par `SchemaMigrationService`
-- (frontend/src/app/core/services/schema-migration.service.ts) au démarrage, sur une base déjà
-- en place **comme sur une installation neuve** : le seed binaire livré dans les assets n'est pas
-- regénéré pour ce lot (APPROCHE_KANBAN_EDITION_LISTES.md, D-L15), c'est donc ce script qui crée
-- la table partout.
-- Également exécutable à la main : sqlite3 <base> < schema_kanban_columns.sql
-- (vérification : scripts/kanban_columns_check.sql).
--
-- Une colonne se limite à un identifiant, le tableau qui la porte, un nom et sa position
-- (D-L6). **Pas de dates** : rien ne les affiche, et `kanbans.updated_at` bouge déjà quand les
-- colonnes changent (D-K1).
--
-- **Aucune contrainte d'unicité**, et c'est voulu :
--   * ni sur `name`, ni sur `(kanban_id, name)` — deux colonnes homonymes sont permises dans un
--     même tableau, l'`id` les distingue, comme D-K4 pour les tableaux ;
--   * ni sur `(kanban_id, position)` — l'enregistrement met à jour les colonnes affichées
--     **avant** de supprimer les absentes (D-L10), ce qui laisse passer une collision temporaire
--     de positions.
--
-- `ON DELETE CASCADE` n'est effectif que si la connexion porte `PRAGMA foreign_keys = ON`
-- (D-L14, posé par `DatabaseService` hors transaction) : sans ce pragma SQLite ignore purement et
-- simplement la cascade, et la suppression d'un tableau laisserait ses colonnes orphelines.
-- Jouer ce script à la main dans `sqlite3` demande donc le même pragma pour que la cascade
-- fonctionne ensuite.

CREATE TABLE IF NOT EXISTS kanban_columns (
    id              TEXT    PRIMARY KEY
                            CHECK (length(id) > 0),

    kanban_id       TEXT    NOT NULL
                            REFERENCES kanbans(id) ON DELETE CASCADE,

    name            TEXT    NOT NULL
                            CHECK (length(trim(name)) > 0),

    position        INTEGER NOT NULL
                            CHECK (position >= 0)
);

-- Les colonnes d'un tableau sont toujours lues ensemble et triées par position croissante
-- (US1, D-L12).
CREATE INDEX IF NOT EXISTS idx_kanban_columns_kanban_position
    ON kanban_columns(kanban_id, position);

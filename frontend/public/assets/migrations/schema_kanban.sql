-- Table des tableaux kanban.
-- Destiné à être exécuté par `SchemaMigrationService`
-- (frontend/src/app/core/services/schema-migration.service.ts) sur une base déjà en place :
-- le seed livré dans les assets n'est copié qu'à la première installation, une base existante
-- n'aurait donc jamais la table (cf. APPROCHE_KANBAN_CRUD.md, D-K6).
-- Également exécutable à la main : sqlite3 <base> < schema_kanban.sql
--
-- Un tableau se limite à un identifiant, un nom et ses dates (APPROCHE_KANBAN_CRUD.md, D-K1) :
-- `created_at` n'est pas exposée par le modèle `Kanban`, seule `updated_at` est affichée.
-- Aucune contrainte d'unicité sur `name` : deux tableaux peuvent porter le même nom (D-K4).

CREATE TABLE IF NOT EXISTS kanbans (
    id              TEXT    PRIMARY KEY
                            CHECK (length(id) > 0),

    name            TEXT    NOT NULL
                            CHECK (length(trim(name)) > 0),

    created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- La liste est triée du plus récemment modifié au plus ancien (US1).
CREATE INDEX IF NOT EXISTS idx_kanbans_updated_at ON kanbans(updated_at);

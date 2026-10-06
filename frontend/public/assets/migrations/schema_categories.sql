-- Table des catégories.
-- Exécuté par `SchemaMigrationService` (frontend/src/app/core/services/schema-migration.service.ts)
-- sur une base dont la table `notes` est déjà au format relationnel mais sans catégories.
-- Également exécutable à la main : sqlite3 <base> < schema_categories.sql

CREATE TABLE IF NOT EXISTS categories (
    id          TEXT    PRIMARY KEY
                        CHECK (length(id) > 0),

    name        TEXT    NOT NULL UNIQUE
                        CHECK (length(trim(name)) > 0),

    color       TEXT
);

CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

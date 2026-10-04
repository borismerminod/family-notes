-- Schéma courant des notes (catégorie = clé étrangère vers `categories`).
-- Exécuté par `SchemaMigrationService` (frontend/src/app/core/services/schema-migration.service.ts)
-- sur une base vide. Également exécutable à la main : sqlite3 <base> < schema_notes.sql

CREATE TABLE IF NOT EXISTS categories (
    id          TEXT    PRIMARY KEY
                        CHECK (length(id) > 0),

    name        TEXT    NOT NULL UNIQUE
                        CHECK (length(trim(name)) > 0),

    color       TEXT
);

CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

CREATE TABLE IF NOT EXISTS notes (
    id              TEXT    PRIMARY KEY,
    title           TEXT    NOT NULL,
    content         TEXT,
    category_id     TEXT,
    created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_category_id ON notes(category_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);

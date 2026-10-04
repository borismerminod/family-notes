-- Migration de l'ancien modèle (catégorie = texte libre dans `notes.category`) vers le modèle
-- relationnel (`categories` + `notes.category_id`).
--
-- Exécuté par `SchemaMigrationService` (frontend/src/app/core/services/schema-migration.service.ts)
-- au démarrage de l'application, sur une base restée à l'ancien format : web store du navigateur
-- ou base d'un téléphone déjà installé, que le seed livré dans les assets ne remplace pas.
-- Également exécutable à la main : sqlite3 <base> < migration_relational_categories.sql
-- (vérification : scripts/migration_check.sql).
--
-- ⚠️ Ne pas rejouer sur une base déjà migrée : la présence de la table `categories` sert de
-- marqueur et c'est le service qui décide de l'exécution.

PRAGMA foreign_keys = OFF;

-- 1. Table des catégories (cf. schema_categories.sql)
CREATE TABLE IF NOT EXISTS categories (
    id          TEXT    PRIMARY KEY
                        CHECK (length(id) > 0),

    name        TEXT    NOT NULL UNIQUE
                        CHECK (length(trim(name)) > 0),

    color       TEXT
);

CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

-- 2. Les noms de catégories distincts des notes deviennent des catégories.
--    La comparaison insensible à la casse fusionne « Travail », « travail » et «  travail  ».
INSERT OR IGNORE INTO categories (id, name, color)
    SELECT 'cat-' || lower(replace(trim(category), ' ', '_')), trim(category), '#8E8E93'
    FROM notes
    WHERE category IS NOT NULL AND trim(category) <> ''
    GROUP BY lower(trim(category));

-- 3. Nouvelle table `notes` (cf. schema_notes.sql)
CREATE TABLE notes_migrated (
    id              TEXT    PRIMARY KEY,
    title           TEXT    NOT NULL,
    content         TEXT,
    category_id     TEXT,
    created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- 4. Reprise des données : le nom de catégorie devient une clé étrangère
INSERT INTO notes_migrated (id, title, content, category_id, created_at, updated_at)
    SELECT notes.id,
           notes.title,
           notes.content,
           categories.id,
           COALESCE(notes.updated_at, CURRENT_TIMESTAMP),
           COALESCE(notes.updated_at, CURRENT_TIMESTAMP)
    FROM notes
    LEFT JOIN categories ON lower(trim(categories.name)) = lower(trim(notes.category));

-- 5. Bascule
DROP TABLE notes;
ALTER TABLE notes_migrated RENAME TO notes;

CREATE INDEX IF NOT EXISTS idx_notes_category_id ON notes(category_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);

PRAGMA foreign_keys = ON;

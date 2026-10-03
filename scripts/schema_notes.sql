PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
    id          TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE,
    color       TEXT
);

CREATE TABLE IF NOT EXISTS notes (
    id              TEXT    PRIMARY KEY,
    title           TEXT    NOT NULL,
    content         TEXT    NOT NULL,
    category_id     TEXT,
    updated_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_category_id ON notes(category_id);
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
    id          TEXT    PRIMARY KEY
                        CHECK (length(id) > 0),

    name        TEXT    NOT NULL UNIQUE
                        CHECK (length(trim(name)) > 0),

    color       TEXT
);

CREATE INDEX IF NOT EXISTS idx_categories_name
    ON categories(name);

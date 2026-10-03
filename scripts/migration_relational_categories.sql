-- 1. Enable foreign keys
PRAGMA foreign_keys = OFF;

-- 2. Create categories table if it doesn't exist
CREATE TABLE IF NOT EXISTS categories (
    id          TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE,
    color       TEXT
);

-- 3. Create missing categories from notes
INSERT INTO categories (id, name, color)
SELECT 
    'cat-' || LOWER(REPLACE(name, ' ', '_')), 
    name, 
    '#CCCCCC'
FROM (
    SELECT DISTINCT category AS name 
    FROM notes 
    WHERE category IS NOT NULL AND category != ''
)
WHERE name NOT IN (SELECT name FROM categories);

-- 4. Create a new notes table with the new schema
CREATE TABLE notes_new (
    id              TEXT    PRIMARY KEY,
    title           TEXT    NOT NULL,
    content         TEXT    NOT NULL,
    category_id     TEXT,
    updated_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- 5. Migrate data
INSERT INTO notes_new (id, title, content, category_id, updated_at)
SELECT 
    n.id, 
    n.title, 
    n.content, 
    c.id, 
    n.updated_at
FROM notes n
LEFT JOIN categories c ON n.category = c.name;

-- 6. Drop old table and rename new one
DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;

-- 7. Enable foreign keys
PRAGMA foreign_keys = ON;

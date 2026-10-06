-- Vérification de la migration vers les catégories relationnelles.

-- 1. Le schéma attendu est en place (table `categories`, colonne `notes.category_id`,
--    plus d'ancienne colonne `notes.category`).
SELECT 'schema' AS verification,
       (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'categories') AS table_categories,
       (SELECT COUNT(*) FROM pragma_table_info('notes') WHERE name = 'category_id') AS colonne_category_id,
       (SELECT COUNT(*) FROM pragma_table_info('notes') WHERE name = 'category') AS ancienne_colonne;

-- 2. Les catégories créées, avec le nombre de notes rattachées.
SELECT categories.id, categories.name, categories.color, COUNT(notes.id) AS notes
FROM categories
LEFT JOIN notes ON notes.category_id = categories.id
GROUP BY categories.id
ORDER BY categories.name;

-- 3. Aucune note ne doit pointer vers une catégorie inexistante.
SELECT 'orphelines' AS verification, COUNT(*) AS total
FROM notes
WHERE category_id IS NOT NULL
  AND category_id NOT IN (SELECT id FROM categories);

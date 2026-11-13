-- Vérification de la migration des cartes de tableau kanban (`kanban_cards`).
-- À jouer après frontend/public/assets/migrations/schema_kanban_cards.sql :
--   sqlite3 <base> < scripts/kanban_cards_check.sql
--
-- La migration réelle est jouée par l'application au démarrage (SchemaMigrationService) ; ce
-- script sert à contrôler une base de dev ou le seed à la main.

-- Les clés étrangères doivent être actives pour que la cascade et le `SET NULL` fonctionnent
-- (D-L14). SQLite les désactive par défaut : dans l'application, `DatabaseService` pose le pragma
-- sur la connexion ; dans `sqlite3`, c'est à faire ici.
PRAGMA foreign_keys = ON;

-- 1. Le schéma attendu est en place : table `kanban_cards`, ses cinq colonnes, son index.
SELECT 'schema' AS verification,
       (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'kanban_cards') AS table_cartes,
       (SELECT COUNT(*) FROM pragma_table_info('kanban_cards')) AS nb_colonnes,
       (SELECT COUNT(*) FROM sqlite_master
         WHERE type = 'index' AND name = 'idx_kanban_cards_column_position') AS index_position,
       (SELECT foreign_keys FROM pragma_foreign_keys) AS cles_etrangeres_actives;

-- 2. Les deux clés étrangères portent chacune leur action (attendu : kanban_columns / id / CASCADE
--    pour `column_id`, et notes / id / SET NULL pour `note_id`, cf. H-C6 et D-C16).
SELECT 'cle_etrangere' AS verification, "from" AS depuis_colonne, "table" AS vers_table,
       "to" AS vers_colonne, on_delete
FROM pragma_foreign_key_list('kanban_cards');

-- 3. Les cartes de chaque liste de chaque tableau, dans leur ordre persisté, avec le titre de la
--    note référencée quand il y en a une.
SELECT kanbans.name AS tableau, kanban_columns.name AS liste, kanban_cards.position,
       kanban_cards.text AS carte, notes.title AS note
FROM kanban_cards
JOIN kanban_columns ON kanban_columns.id = kanban_cards.column_id
JOIN kanbans ON kanbans.id = kanban_columns.kanban_id
LEFT JOIN notes ON notes.id = kanban_cards.note_id
ORDER BY kanbans.name, kanban_columns.position, kanban_cards.position;

-- 4. Aucune carte ne doit pointer vers une liste inexistante (la cascade s'en charge quand le
--    pragma est actif ; un reliquat signale une suppression faite pragma éteint).
SELECT 'orphelines_liste' AS verification, COUNT(*) AS total
FROM kanban_cards
WHERE column_id NOT IN (SELECT id FROM kanban_columns);

-- 5. Aucune carte ne doit pointer vers une note inexistante : le `SET NULL` vide la référence
--    quand la note disparaît, une carte listée ici signale une suppression faite pragma éteint.
SELECT 'references_note_cassees' AS verification, COUNT(*) AS total
FROM kanban_cards
WHERE note_id IS NOT NULL
  AND note_id NOT IN (SELECT id FROM notes);

-- 6. Les positions d'une même liste doivent être contiguës et repartir de 0 (D-C19) : toute liste
--    listée ici porte un trou ou un doublon de position. Un doublon est normal **pendant** un
--    enregistrement (D-C8), pas une fois celui-ci terminé.
SELECT 'positions' AS verification, kanbans.name AS tableau, kanban_columns.name AS liste,
       COUNT(*) AS cartes,
       MIN(kanban_cards.position) AS position_min,
       MAX(kanban_cards.position) AS position_max,
       COUNT(DISTINCT kanban_cards.position) AS positions_distinctes
FROM kanban_cards
JOIN kanban_columns ON kanban_columns.id = kanban_cards.column_id
JOIN kanbans ON kanbans.id = kanban_columns.kanban_id
GROUP BY kanban_cards.column_id
HAVING position_min <> 0
    OR position_max <> COUNT(*) - 1
    OR positions_distinctes <> COUNT(*);

-- 7. Contrôle global de l'intégrité référentielle de la base.
PRAGMA foreign_key_check;

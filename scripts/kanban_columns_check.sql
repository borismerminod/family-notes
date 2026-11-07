-- Vérification de la migration des colonnes de tableau kanban (`kanban_columns`).
-- À jouer après frontend/public/assets/migrations/schema_kanban_columns.sql :
--   sqlite3 <base> < scripts/kanban_columns_check.sql
--
-- La migration réelle est jouée par l'application au démarrage (SchemaMigrationService) ; ce
-- script sert à contrôler une base de dev ou le seed à la main.

-- Les clés étrangères doivent être actives pour que la cascade fonctionne (D-L14). SQLite les
-- désactive par défaut : dans l'application, `DatabaseService` pose le pragma sur la connexion ;
-- dans `sqlite3`, c'est à faire ici.
PRAGMA foreign_keys = ON;

-- 1. Le schéma attendu est en place : table `kanban_columns`, ses quatre colonnes, son index.
SELECT 'schema' AS verification,
       (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'kanban_columns') AS table_colonnes,
       (SELECT COUNT(*) FROM pragma_table_info('kanban_columns')) AS nb_colonnes,
       (SELECT COUNT(*) FROM sqlite_master
         WHERE type = 'index' AND name = 'idx_kanban_columns_kanban_position') AS index_position,
       (SELECT foreign_keys FROM pragma_foreign_keys) AS cles_etrangeres_actives;

-- 2. La clé étrangère vers `kanbans` est déclarée en cascade (attendu : kanbans / id / CASCADE).
SELECT 'cle_etrangere' AS verification, "table" AS vers_table, "to" AS vers_colonne, on_delete
FROM pragma_foreign_key_list('kanban_columns');

-- 3. Les colonnes de chaque tableau, dans leur ordre persisté.
SELECT kanbans.name AS tableau, kanban_columns.position, kanban_columns.name AS colonne
FROM kanban_columns
JOIN kanbans ON kanbans.id = kanban_columns.kanban_id
ORDER BY kanbans.name, kanban_columns.position;

-- 4. Aucune colonne ne doit pointer vers un tableau inexistant (la cascade s'en charge quand le
--    pragma est actif ; un reliquat signale une suppression faite pragma éteint).
SELECT 'orphelines' AS verification, COUNT(*) AS total
FROM kanban_columns
WHERE kanban_id NOT IN (SELECT id FROM kanbans);

-- 5. Les positions d'un même tableau doivent être contiguës et repartir de 0 (D-L12) : tout
--    tableau listé ici porte un trou ou un doublon de position.
SELECT 'positions' AS verification, kanbans.name AS tableau,
       COUNT(*) AS colonnes,
       MIN(kanban_columns.position) AS position_min,
       MAX(kanban_columns.position) AS position_max,
       COUNT(DISTINCT kanban_columns.position) AS positions_distinctes
FROM kanban_columns
JOIN kanbans ON kanbans.id = kanban_columns.kanban_id
GROUP BY kanban_columns.kanban_id
HAVING position_min <> 0
    OR position_max <> COUNT(*) - 1
    OR positions_distinctes <> COUNT(*);

-- 6. Contrôle global de l'intégrité référentielle de la base.
PRAGMA foreign_key_check;

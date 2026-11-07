-- Colonnes de démonstration des tableaux du seed (table créée par
-- frontend/public/assets/migrations/schema_kanban_columns.sql, tableaux par
-- scripts/seed_kanbans.sql, qui doit donc être joué avant).
-- `INSERT OR IGNORE` : le script est rejouable sans doublon ni erreur.
--
-- Les positions repartent de 0 pour chaque tableau et sont contiguës (D-L12).
-- « Anniversaire de Léa » reste volontairement **sans aucune colonne** : c'est le jeu de données
-- qui montre l'état vide de la zone de contenu (US1).
INSERT OR IGNORE INTO kanban_columns (id, kanban_id, name, position) VALUES
('col-courses-afaire',      'kanban-courses',      'À faire',          0),
('col-courses-panier',      'kanban-courses',      'Dans le panier',   1),
('col-courses-achete',      'kanban-courses',      'Acheté',           2),
('col-travaux-devis',       'kanban-travaux',      'Devis à demander', 0),
('col-travaux-encours',     'kanban-travaux',      'En cours',         1),
('col-travaux-fait',        'kanban-travaux',      'Fait',             2),
('col-vacances-idees',      'kanban-vacances',     'Idées',            0),
('col-vacances-reserve',    'kanban-vacances',     'Réservé',          1),
('col-rentree-fournitures', 'kanban-rentree',      'Fournitures',      0),
('col-rentree-inscriptions','kanban-rentree',      'Inscriptions',     1),
('col-rentree-fait',        'kanban-rentree',      'Fait',             2);

-- Jeu de tableaux kanban du seed (table créée par
-- frontend/public/assets/migrations/schema_kanban.sql).
-- `INSERT OR IGNORE` : le script est rejouable sans doublon ni erreur.
-- Les dates `updated_at` sont volontairement étalées pour vérifier le tri de la liste
-- (du plus récemment modifié au plus ancien, US1).
INSERT OR IGNORE INTO kanbans (id, name, created_at, updated_at) VALUES
('kanban-courses', 'Courses', '2026-09-01 08:00:00', '2026-09-28 18:30:00'),
('kanban-travaux', 'Travaux maison', '2026-08-15 09:00:00', '2026-09-25 11:00:00'),
('kanban-vacances', 'Vacances d''été', '2026-07-02 20:15:00', '2026-09-12 21:45:00'),
('kanban-rentree', 'Organisation de la rentrée', '2026-08-20 07:30:00', '2026-09-05 16:20:00'),
('kanban-anniversaire', 'Anniversaire de Léa', '2026-06-10 14:00:00', '2026-08-30 10:05:00');

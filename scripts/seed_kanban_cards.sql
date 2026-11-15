-- Cartes de démonstration des listes du seed (table créée par
-- frontend/public/assets/migrations/schema_kanban_cards.sql, listes par
-- scripts/seed_kanban_columns.sql et notes par scripts/seed_notes.sql, qui doivent donc être
-- joués avant).
-- `INSERT OR IGNORE` : le script est rejouable sans doublon ni erreur.
--
-- Les positions repartent de 0 pour chaque liste et sont contiguës (D-C19).
-- Le jeu de données couvre volontairement les cas que l'écran doit savoir montrer :
--   * des cartes **avec** et **sans** note référencée (US1) ;
--   * deux cartes qui référencent la **même** note — « Liste de lecture » (US2) ;
--   * des listes restées **sans aucune carte** — « Acheté », « En cours », « Réservé » — pour
--     l'état vide de la zone de contenu (US1) ;
--   * « Anniversaire de Léa », qui n'a déjà aucune liste, reste donc aussi sans aucune carte.
INSERT OR IGNORE INTO kanban_cards (id, column_id, text, note_id, position) VALUES
('card-courses-fruits',    'col-courses-afaire',      'Fruits et légumes du marché', NULL,                                   0),
('card-courses-liste',     'col-courses-afaire',      'Suivre la liste de courses',   '550e8400-e29b-41d4-a716-446655440001', 1),
('card-courses-pain',      'col-courses-panier',      'Pain de campagne',             NULL,                                   0),

('card-travaux-jardin',    'col-travaux-devis',       'Faire chiffrer le jardin',     '550e8400-e29b-41d4-a716-446655440010', 0),
('card-travaux-peinture',  'col-travaux-devis',       'Devis peinture du salon',      NULL,                                   1),
('card-travaux-garage',    'col-travaux-fait',        'Vider le garage',              NULL,                                   0),

('card-vacances-japon',    'col-vacances-idees',      'Chiffrer le voyage au Japon',  '550e8400-e29b-41d4-a716-446655440006', 0),
('card-vacances-montagne', 'col-vacances-idees',      'Une semaine à la montagne',    NULL,                                   1),

('card-rentree-cahiers',   'col-rentree-fournitures', 'Acheter les cahiers',          '550e8400-e29b-41d4-a716-446655440004', 0),
('card-rentree-livres',    'col-rentree-fournitures', 'Commander les livres',         '550e8400-e29b-41d4-a716-446655440004', 1),
('card-rentree-sport',     'col-rentree-inscriptions','Inscrire Léa au sport',        NULL,                                   0);

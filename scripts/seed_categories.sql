-- Jeu de catégories du seed (ids identiques à ceux produits par
-- migration_relational_categories.sql ; couleurs issues de NOTE_COLOR_PALETTE).
INSERT OR IGNORE INTO categories (id, name, color) VALUES ('cat-famille', 'Famille', '#34C759');
INSERT OR IGNORE INTO categories (id, name, color) VALUES ('cat-loisirs', 'Loisirs', '#FF3B30');
INSERT OR IGNORE INTO categories (id, name, color) VALUES ('cat-personnel', 'Personnel', '#007AFF');
INSERT OR IGNORE INTO categories (id, name, color) VALUES ('cat-travail', 'Travail', '#FF9500');
INSERT OR IGNORE INTO categories (id, name, color) VALUES ('cat-Études', 'Études', '#AF52DE');

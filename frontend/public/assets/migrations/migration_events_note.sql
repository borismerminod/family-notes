-- Ajoute aux événements du calendrier leur référence facultative vers une note
-- (CALENDAR/EVENT, D-EV8 et D-EV9).
--
-- Exécuté par `SchemaMigrationService`
-- (frontend/src/app/core/services/schema-migration.service.ts) au démarrage, **seulement quand la
-- table `events` existe sans la colonne `note_id`**. C'est le cas de la table livrée par le seed
-- binaire, donc d'une installation neuve comme d'un appareil installé avant ce lot. Une base sans
-- table `events` reçoit plutôt `schema_events.sql`, qui crée la table complète.
-- Ce script n'est pas rejouable tel quel : `ADD COLUMN` échoue sur une colonne déjà présente. C'est
-- la garde du service, qui lit les colonnes de la table, qui empêche de le rejouer.
-- Également exécutable à la main, une seule fois : sqlite3 <base> < migration_events_note.sql
--
-- `note_id` est en `ON DELETE SET NULL` : supprimer une note ne doit **jamais** faire disparaître
-- un événement (US10). L'événement garde sa date, ses heures et son texte, seule la référence
-- s'efface. SQLite n'accepte un `REFERENCES` dans `ADD COLUMN` que si la valeur par défaut de la
-- colonne est `NULL`, ce qui est le cas ici : les événements déjà en place n'ont aucune note.
-- L'action n'est effective qu'avec `PRAGMA foreign_keys = ON`, posé par `DatabaseService` hors
-- transaction (D-L14).

ALTER TABLE events ADD COLUMN note_id TEXT REFERENCES notes(id) ON DELETE SET NULL;

-- La suppression d'une note cherche les événements qui la référencent, pour vider leur `note_id`.
CREATE INDEX IF NOT EXISTS idx_events_note_id
    ON events(note_id);

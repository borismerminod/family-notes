-- Table des événements du calendrier — ce qui a lieu à une date civile, avec des heures
-- facultatives et une référence facultative vers une note (CALENDAR/EVENT, D-EV8 et D-EV9).
--
-- Exécuté par `SchemaMigrationService`
-- (frontend/src/app/core/services/schema-migration.service.ts) au démarrage, **seulement quand la
-- table `events` manque**. Jusqu'ici elle n'existait que par le seed binaire livré dans les assets,
-- et son schéma n'était écrit nulle part dans le dépôt (APPROCHE_CALENDAR_EVENT.md §0.1). Ce script
-- le reprend tel que le seed le porte, avec en plus la colonne `note_id`.
-- Une table `events` déjà en place sans `note_id` reçoit plutôt `migration_events_note.sql`.
-- Également exécutable à la main : sqlite3 <base> < schema_events.sql
--
-- C'est la **cinquième étape** de la migration. Elle vient après les tables kanban parce qu'elle
-- référence `notes`, que la première étape garantit.
--
-- Un événement porte un identifiant, un texte, une date civile, une heure de début et une heure de
-- fin facultatives, et une référence facultative vers une note.
--   * `id` vient de l'écran (`crypto.randomUUID()`), pas de la base : la popup doit désigner un
--     événement avant qu'il soit enregistré.
--   * `date` est une date civile `YYYY-MM-DD`. Le `CHECK` ne contrôle que sa **forme**
--     (`2026-13-45` passe) : sa validité réelle est vérifiée par l'application.
--   * une heure absente est stockée `NULL`, jamais `''`, qui violerait le `CHECK`.
--   * une heure de fin demande une heure de début, et la fin est strictement après le début.
--
-- **Aucune contrainte d'unicité** sur `title` ni sur `note_id` : deux événements d'une même date
-- peuvent porter le même texte et viser la même note (US3).
--
-- `note_id` est en `ON DELETE SET NULL` : supprimer une note ne doit **jamais** faire disparaître
-- un événement (US10). L'événement garde sa date, ses heures et son texte, seule la référence
-- s'efface. Cette action n'est effective qu'avec `PRAGMA foreign_keys = ON`, posé par
-- `DatabaseService` hors transaction (D-L14). Jouer ce script à la main dans `sqlite3` demande donc
-- le même pragma.

CREATE TABLE IF NOT EXISTS events (
    id          TEXT    PRIMARY KEY
                        CHECK (length(id) > 0),

    title       TEXT    NOT NULL
                        CHECK (length(trim(title)) > 0),

    date        TEXT    NOT NULL
                        CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),

    start_time  TEXT    CHECK (start_time IS NULL
                               OR (start_time GLOB '[0-2][0-9]:[0-5][0-9]'
                                   AND CAST(substr(start_time, 1, 2) AS INTEGER) < 24)),

    end_time    TEXT    CHECK (end_time IS NULL
                               OR (end_time GLOB '[0-2][0-9]:[0-5][0-9]'
                                   AND CAST(substr(end_time, 1, 2) AS INTEGER) < 24)),

    created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    note_id     TEXT    REFERENCES notes(id) ON DELETE SET NULL,

    CONSTRAINT chk_end_requires_start
        CHECK (NOT (end_time IS NOT NULL AND start_time IS NULL)),

    CONSTRAINT chk_start_before_end
        CHECK (start_time IS NULL
               OR end_time IS NULL
               OR start_time < end_time)
);

-- Le calendrier lit les événements d'une date, ou d'un intervalle de dates (la grille de 42 jours).
CREATE INDEX IF NOT EXISTS idx_events_date
    ON events(date);

-- Même lecture, dans l'ordre d'affichage : heure de début, puis texte.
CREATE INDEX IF NOT EXISTS idx_events_date_start
    ON events(date, start_time, title);

-- La suppression d'une note cherche les événements qui la référencent, pour vider leur `note_id`.
CREATE INDEX IF NOT EXISTS idx_events_note_id
    ON events(note_id);

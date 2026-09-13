PRAGMA foreign_keys = ON;

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

    CONSTRAINT chk_end_requires_start
        CHECK (NOT (end_time IS NOT NULL AND start_time IS NULL)),

    CONSTRAINT chk_start_before_end
        CHECK (start_time IS NULL
               OR end_time IS NULL
               OR start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_events_date
    ON events(date);

CREATE INDEX IF NOT EXISTS idx_events_date_start
    ON events(date, start_time, title);


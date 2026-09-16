BEGIN;

-- Existing accounts stay active; foreign keys and historical records are unchanged.
ALTER TABLE librarian
    ADD COLUMN IF NOT EXISTS status varchar(8) NOT NULL DEFAULT 'active'
    CONSTRAINT librarian_status_check CHECK (status IN ('active', 'inactive'));

COMMIT;

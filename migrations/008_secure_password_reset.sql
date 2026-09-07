-- Run with the old app stopped, before starting the updated app.
-- Inspected schema: reset_id integer PK, email/token varchar NOT NULL,
-- expires_at/created_at timestamp without time zone (database timezone UTC), used boolean.
BEGIN;
LOCK TABLE password_reset IN ACCESS EXCLUSIVE MODE;
ALTER TABLE password_reset ADD COLUMN IF NOT EXISTS token_hash varchar(64);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'password_reset' AND column_name = 'token') THEN
        EXECUTE 'UPDATE password_reset SET token_hash = encode(sha256(convert_to(token, ''UTF8'')), ''hex'') WHERE token_hash IS NULL';
        EXECUTE 'ALTER TABLE password_reset DROP COLUMN token';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'password_reset' AND column_name = 'expires_at' AND data_type = 'timestamp without time zone') THEN
        ALTER TABLE password_reset ALTER COLUMN expires_at TYPE timestamptz USING expires_at AT TIME ZONE 'UTC';
        ALTER TABLE password_reset ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
    END IF;
END $$;
UPDATE password_reset SET email = LOWER(TRIM(email)), used = COALESCE(used, FALSE);
ALTER TABLE password_reset ALTER COLUMN token_hash SET NOT NULL;
ALTER TABLE password_reset ALTER COLUMN used SET NOT NULL;
-- Preserve history, but retain at most the newest unused token per address.
WITH ranked AS (
    SELECT reset_id, ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at DESC NULLS LAST, reset_id DESC) AS n
    FROM password_reset WHERE used = FALSE
)
UPDATE password_reset SET used = TRUE FROM ranked WHERE password_reset.reset_id = ranked.reset_id AND ranked.n > 1;
CREATE INDEX IF NOT EXISTS password_reset_token_hash_idx ON password_reset(token_hash);
CREATE INDEX IF NOT EXISTS password_reset_email_unused_idx ON password_reset(LOWER(email)) WHERE used = FALSE;
-- Shared by all app replicas; stores hashed IP/email keys, never raw addresses.
CREATE TABLE IF NOT EXISTS password_reset_rate_limit (
    bucket_hash varchar(64) PRIMARY KEY,
    attempts integer NOT NULL,
    expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS password_reset_rate_limit_expiry_idx ON password_reset_rate_limit(expires_at);
COMMIT;

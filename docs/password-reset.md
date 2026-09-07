# Password-reset repair and deployment notes

## Confirmed causes (inspection on 2026-09-07)


- The active application deployment metadata reports the Trial plan. Railway only allows outbound SMTP on Pro and above. Gmail/Nodemailer cannot deliver from a Trial deployment- The Railway application service is missing `EMAIL_USER` and `APP_BASE_URL`. It has `EMAIL_PASS`; its secret value was never printed or replaced. `CLIENT_URL` and `NODE_ENV` are also absent.. This is independent of the missing username. See https://docs.railway.com/networking/outbound-networking . No SMTP failure was found in the bounded recent logs; an actual production send was not attempted.
- Local Gmail SMTP connectivity/authentication passed Nodemailer `verify()` with the existing private credentials. This does not prove production connectivity or inbox delivery.
- The original controller used case-sensitive email matching, raw tokens, no previous-token invalidation, no rate limiting, and a host/protocol-derived URL fallback. It printed entire error objects. The password update did not check affected rows; acquiring the connection outside its try/catch could escape the intended error handler.
- The page advertised six characters while the backend required eight. There was no resend recovery or cooldown.
- Production GET checks: `/reset_password.html` and `/forgot-password` returned 200 with the correct forms; `/forgot_password.html` returned 404. The existing filename is `views/forget_password.html`; the new route adds the requested spelling without breaking old URLs.

## Database inspected and migration

The actual public `password_reset` table has `reset_id integer` (primary key), `email varchar NOT NULL`, `token varchar NOT NULL`, `expires_at timestamp without time zone NOT NULL`, nullable `used boolean DEFAULT false`, and nullable `created_at timestamp DEFAULT now()`. Only the primary-key index existed. Database timezone is UTC. Inspection found five historical records and no active tokens; no emails, raw tokens, or password hashes were printed.

`migrations/008_secure_password_reset.sql` runs in one transaction, locks only the reset table while converting it, hashes existing token values using built-in PostgreSQL SHA-256, drops the raw token column, normalizes email/used fields, interprets legacy timestamps as UTC, retains only the newest unused token per email, and adds token-hash and unused-email indexes. It adds the reset-specific `password_reset_rate_limit` table and expiry index for limits shared across replicas and restarts. No unrelated table is migrated. The script is repeatable and requires no extension.

The migration has been tested on an isolated local PostgreSQL 18 cluster, including a second execution. **It has not been applied to Railway.** Old application code requires the removed `token` column, so stop the old application before applying it and deploy the new version before resuming requests. A code-only rollback to the old reset controller is incompatible with this migration; do not restore plaintext tokens.

After selecting the intended database privately through `DATABASE_URL`, run:

```sh
npm run migrate:password-reset
```

The command uses the existing database connection configuration and prints only success/failure. Alternatively, execute `migrations/008_secure_password_reset.sql` in the target database. Do not paste connection strings into source control or logs.

## Configuration and Railway steps

Required variable names: `EMAIL_USER`, `EMAIL_PASS`, `APP_BASE_URL`, `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`. The first three are validated by the new configuration module; the existing DB/login variables must remain intact. Use `NODE_ENV=production` on Railway. Railway's injected `RAILWAY_ENVIRONMENT_ID` also activates production validation and one-hop proxy trust.

Set `APP_BASE_URL` to the public HTTPS origin for this service: https://librarymanagementsystem-production-26df.up.railway.app . The code strips trailing slashes and never takes the reset origin from a request Host header. Use the exact mail variable names above, keep the real Gmail app password, and privately supply the missing username. The ignored local `.env` now has an explicit localhost `APP_BASE_URL`; existing credentials were preserved. `.env.example` contains empty credential slots, not substitute credentials.

1. Resolve SMTP availability: upgrade to a Railway plan with SMTP and redeploy, or separately configure an HTTPS email provider if remaining on Trial/Hobby. This repair retains Gmail/Nodemailer and does not change billing or silently switch providers.
2. Set the missing variables and production mode in the application service. Avoid an automatic old-code restart during the migration window.
3. Stop the old application, apply migration 008, deploy the updated code, and confirm a successful deployment before reopening traffic.
4. GET both reset and forgot pages over HTTPS. Confirm `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
5. Use a controlled approved member account to request mail, inspect inbox/spam delivery and the HTTPS link, reset once, verify new-password login and old-password rejection, then verify reuse/expiry/resend/rate limits. Avoid resetting an unrelated member as a test.
6. Review only sanitized delivery-failure messages in app logs. Do not log URLs containing reset tokens. Railway's own edge access-log handling/retention is outside app code; restrict access to those logs because the initial email URL necessarily includes a token.

No Railway environment variables, billing settings, production passwords, or database records were changed, and no deployment was made during this repair.

## Behavior and operational limits

- 32 random bytes; SHA-256 only in the database; expiry after 30 minutes.
- Case-insensitive member lookup. Member-first row locking serializes resend/reset requests; reset uses a single transaction and checks both updates. All other unused tokens are revoked on success.
- Forgot responses are acknowledged before member lookup or mail delivery, preventing account-dependent response timing and SMTP errors from revealing registration status. Delivery then runs in the same Node process with bounded SMTP timeouts. This is not a durable mail queue: a process restart during delivery can lose that mail; the user can resend after cooldown.
- Forgot limits: one normalized-email request per 60 seconds, five per email per hour, and twenty per IP per hour. Reset attempts: sixty per IP per hour. Blocked attempts count toward their existing windows but do not extend window expiry. `429` includes `Retry-After`; forgot messages remain generic for existing and unknown accounts.
- Client cooldown persists across reloads/tabs, checks the deadline before submitting, and respects server retry timing. Clearing storage cannot bypass server limits.
- Passwords need at least eight characters, upper/lowercase and a number, and at most 72 UTF-8 bytes to avoid bcrypt truncation. JWT/login verification logic is unchanged. `/?login=1` opens the existing login modal after reset.
- APIs are relative and same-origin; no CORS change is needed. Reset page removes the token query from browser history once read, so refreshing that page requires reopening the email link.

## Validation results

- `RESET_TEST_DATABASE_URL` pointed only at an isolated localhost PostgreSQL cluster. `node --test --test-isolation=none tests/password_reset.test.js`: 14 tests passed, none skipped. With ordinary Node subprocess permissions, use `npm run test:password-reset` instead.
- Tests cover actual SQL migration/rerun, hash-only storage, local SMTP receipt and correct HTTPS URL, mixed-case existing/unknown emails, generic failures, invalid/expired/used/missing tokens, weak/UTF-8 oversized passwords, concurrent single use, rollback when either update fails, connection failure, IP/email limits, resend invalidation, unchanged real login controller with new/old passwords, and body validation.
- Headless Edge at 1440, 768, 375, and 320px: responsive forgot/reset forms, missing-token recovery, password mismatch/strength, repeated submits, cooldown persistence and expiry, invalid/expired state, server retry, success and login-modal redirect passed. No JavaScript console errors in the final run; API responses and external font/icon resources were mocked for browser tests.
- Actual Express startup in production-compatible mode passed locally. Both clean and `.html` page routes, no-store/no-referrer headers, and safe malformed-JSON handling passed.
- Local Gmail `verify()` passed without sending mail. A local SMTP sink received the actual Nodemailer reset message during integration tests. Gmail inbox delivery and the changed production reset/login flow remain untested until the Railway steps above are complete.

## File inventory

- `controllers/auth/password_reset_controller.js`: secure token lifecycle, generic response, transaction locking and safe errors.
- `config/password_reset.js`: trimmed/validated mail and base URL configuration.
- `utils/password_reset_validation.js`: email, token and password validation.
- `utils/mailer.js`: bounded SMTP transport, text/HTML message and safe failure handling.
- `middleware/password_reset_rate_limit.js`: shared PostgreSQL limits by IP and normalized email.
- `routes/authRoutes.js`: attach limiters to both existing reset endpoints.
- `server.js`: proxy trust, reset-page privacy headers, forgot-page alias.
- `migrations/008_secure_password_reset.sql`: hash migration and supporting indexes/rate table.
- `scripts/migrate-password-reset.js`: transactional migration runner.
- `public/js/forget_password.js`: normalization, generic status, resend and persistent cooldown.
- `public/js/reset_password.js`: strength/match checks, token recovery, duplicate-submit guard and login redirect.
- `public/js/homepage.js`: open existing login modal when arriving from reset.
- `views/forget_password.html`: accessible status/cooldown and email attributes.
- `views/reset_password.html`: matching strength guidance, referrer privacy and resend link.
- `tests/password_reset.test.js`: isolated PostgreSQL/SMTP integration tests and configuration checks.
- `package.json`: migration and integration-test commands.
- `.env.example`: safe variable template.
- `docs/password-reset.md`: findings, migration, deployment and test record.
- `.env` (ignored, not committed): added explicit localhost base URL only; credentials preserved.

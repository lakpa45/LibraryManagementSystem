# Password reset: configuration and verification

Updated 2026-09-08. The implementation uses Resend over HTTPS. Gmail SMTP/Nodemailer instructions from the earlier implementation no longer apply.

## Current status

Local database, API, official Resend SDK with a mock HTTP provider, and browser tests pass. Actual inbox delivery has not been tested: `RESEND_API_KEY` is missing both locally and in Railway. The production application is still running an older commit. These local changes have not been deployed.

The chosen test recipient is apnalibrary2026@gmail.com. Resend's onboarding sender can send only to the Resend account owner's inbox. No member with this address existed at the read-only database check. Create a controlled member through the normal registration flow before testing an actual account reset. Use a verified sending domain before enabling delivery to other members.

## Required environment variables

`DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL`, `NODE_ENV`; `PORT` is supplied by Railway. Keep credentials private and never commit `.env`.

Local `FRONTEND_URL` can be http://localhost:3000. Production must be the public HTTPS origin without paths, query parameters or credentials. The test sender is `Library Management System <onboarding@resend.dev>`. Production startup intentionally rejects missing reset configuration.

Railway already has DATABASE_URL, JWT_SECRET, NODE_ENV, EMAIL_FROM and FRONTEND_URL configured. RESEND_API_KEY is still required. Nonsecret configuration was staged with skip-deploys earlier in this session; no release was started.

## Database migration and release order

`migrations/008_secure_password_reset.sql` replaces raw tokens with SHA-256 hashes, normalizes timestamps to UTC-aware values, invalidates superseded tokens, and adds indexes and persistent reset rate-limit buckets. It is transactional and repeatable; both properties were tested on isolated PostgreSQL 18. No production migration was run.

The old controller requires the raw token column. Coordinate a maintenance window: preserve a private database backup, stop the old service, configure the new environment, run `npm run migrate:password-reset` against the intended database, then deploy the new code and test. A code-only rollback to the old reset controller is incompatible with the migrated schema. Do not restore plaintext tokens.

## Verification

- Set RESET_TEST_DATABASE_URL to an isolated loopback PostgreSQL cluster, then run `npm run test:password-reset`: 14 passing test results, including the parent test.
- `npm run test:password-reset:browser`: validates 1440/768/375/320 px, resend cooldown, invalid tokens, password validation, retry, successful reset and login modal. Email API responses and external fonts/icons are mocked in this browser-specific test.
- The system audit separately exercises real application endpoints and database operations, mocking only the external email provider.
- Real send still required: request a reset for the controlled test member, verify the email arrives with the public HTTPS link, reset once, confirm reuse fails, and log in with the new password. Provider acceptance alone does not prove inbox delivery.

Reset tokens expire after 30 minutes, are used once, and are invalidated on resend and relevant account changes. Passwords are bcrypt hashed; minimum 8 characters and maximum 72 UTF-8 bytes. Existing JWTs retain their existing one-hour lifetime; this repair does not introduce session revocation.

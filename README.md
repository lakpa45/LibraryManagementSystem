# APNA Library ? Library Management System

A university library web application for browsing books, managing members, and handling book loans. APNA Library provides separate member, librarian, and administrator workflows, with a PostgreSQL database and an Express backend.

## Features

- **Public catalogue:** browse and search books, explore categories, and discover digital books.
- **Member accounts:** register, sign in after approval, update account details, and change passwords.
- **Borrowing:** borrow available physical books, view current loans and activity, and request renewals.
- **Wishlist:** save books to a member account.
- **Librarian tools:** manage books and categories, upload covers and PDFs, register and approve members, issue books, and record returns.
- **Administrator tools:** access dashboard statistics and manage librarian accounts.
- **Role-based access:** protected API routes and dashboard pages, JWT authentication, and bcrypt password hashing.

## Technology

| Layer | Technologies |
| --- | --- |
| Frontend | HTML, CSS, JavaScript, Tailwind CSS |
| UI resources | Swiper, Font Awesome, Google Fonts |
| Backend | Node.js, Express 5, ES modules |
| Database | PostgreSQL through `pg` |
| Authentication | JSON Web Tokens, bcrypt, cookies |
| Uploads | Multer with file type, signature, and size validation |
| Tests | Node.js test runner; optional browser and PostgreSQL integration checks |

## Getting started

### 1. Prerequisites

Install Node.js and npm, Git, and PostgreSQL client tools (`psql`). A Node.js version supporting the built-in test runner is required; browser audit scripts also use the global `WebSocket` API. The package does not currently declare a Node.js engine version.

You will need a PostgreSQL database and credentials. The application connection in [`db/connection.js`](db/connection.js) currently enables TLS with `rejectUnauthorized: false`; a plain local PostgreSQL server without TLS will require a deliberate local connection configuration change.

### 2. Install dependencies

```sh
git clone https://github.com/lakpa45/Library_Management_System-UNI-.git
cd Library_Management_System-UNI-
npm ci
```

### 3. Configure the environment

Copy `.env.example` to `.env` in the project root. In PowerShell:

```powershell
Copy-Item .env.example .env
```

Set the values privately; do not commit credentials.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Required PostgreSQL connection string |
| `JWT_SECRET` | Required secret used to sign authentication tokens |
| `PORT` | HTTP port; defaults to `3000` |
| `NODE_ENV` | Set to `development` locally; `production` enables secure authentication cookies |
| `RESEND_API_KEY` | Email provider key for the currently disabled password recovery feature |
| `EMAIL_FROM` | Sender address for password recovery emails |
| `FRONTEND_URL` | Base URL for password recovery links; example: `http://localhost:3000` |

### 4. Prepare the database

The app does not create its base tables automatically. The SQL files in `migrations/` are incremental changes, not a complete empty-database installer.

For a **new, empty development database**, the repository includes a schema-only snapshot at [`tests/fixtures/production-schema.sql`](tests/fixtures/production-schema.sql). It contains no member records or login credentials. The snapshot contains PostgreSQL-version-specific settings, so use a compatible PostgreSQL version (the project audit used PostgreSQL 18).

Run the following against your new development database, replacing the placeholder connection string:

```sh
psql "YOUR_DEVELOPMENT_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/fixtures/production-schema.sql
psql "YOUR_DEVELOPMENT_DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/008_secure_password_reset.sql
psql "YOUR_DEVELOPMENT_DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/009_member_first_login_password.sql
```

The snapshot already includes the earlier schema changes. Do not import this snapshot into an existing populated database. For an existing installation, compare its schema with the numbered migrations and apply the missing changes in order.

Two migration helpers use `DATABASE_URL` from your environment:

```sh
npm run migrate:password-reset
node scripts/migrate-member-first-login.js
```

Migration `009` is required for the librarian-created member password workflow. Its new flag defaults to `false`, leaving existing members' passwords unchanged. Migration `008` is also used by password-change operations even though public password recovery is disabled.

There is no bundled administrator seed command or default administrator login. The first administrator must be provisioned in the `admins` table with a bcrypt password hash. Administrators can then create librarian accounts through the application.

### 5. Build and run

```sh
npm run build
npm run dev
```

Open **http://localhost:3000**. For a regular server process, use `npm start`.

To rebuild Tailwind automatically while editing styles, run `npm run css` in a separate terminal.

## Member registration and first login

Members who register themselves choose their own password. New accounts start as **Pending** and must be approved before they can sign in.

When a **librarian** uses Add Member, the server generates the initial password from:

1. The first four characters of the trimmed first name, preserving capitalization. A shorter first name is used in full.
2. The four-digit birth year from a validated date of birth.

| First name | Date of birth | Initial password |
| --- | --- | --- |
| `Lakpa` | `2002-05-18` | `Lakp2002` |
| `Li` | `2000-02-29` | `Li2000` |

The server hashes this password using bcrypt. The librarian creation response does not return the plaintext password, and the form explains the password pattern.

After approval, the member signs in using their email, initial password, and the **Member** role. They are directed to `/change_password.html`, and their initial session cannot access protected member APIs. They must choose a different password of at least eight characters and at most 72 UTF-8 bytes, then sign in again.

This rule applies only to new accounts created through the authenticated librarian endpoint. It does not reset existing passwords or alter public self-registration.

## Main pages

| Page | Route |
| --- | --- |
| Homepage and login | `/` and `/?login=1` |
| Book catalogue | `/books` |
| Categories | `/categories` |
| Digital library | `/e-books` |
| Registration | `/register` |
| My books | `/my-books` |
| Member dashboard | `/user_dashboard.html` |
| Librarian dashboard | `/librarian/dashboard` |
| Librarian member registration | `/librarian/register-member` |
| Administrator dashboard | `/admin/dashboard` |
| Librarian administration | `/admin/librarians` |

## Project structure

```text
controllers/       Request handlers for authentication and library operations
routes/            Express API route definitions
middleware/        Authentication, page guards, validation, and uploads
db/                PostgreSQL connection
migrations/        Incremental SQL schema changes
views/             HTML pages, including librarian and administrator views
public/            Browser JavaScript, styles, images, and uploaded PDFs
src/input.css      Tailwind source stylesheet
utils/             Password, date, and email helpers
config/            Password recovery configuration
scripts/           Database migration helpers
tests/             Automated checks and schema fixture
docs/              Audit reports and implementation notes
server.js          Application entry point
```

## Commands and verification

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the server with nodemon |
| `npm start` | Start the server with Node.js |
| `npm run build` | Generate the minified Tailwind stylesheet |
| `npm run css` | Watch and rebuild Tailwind styles |
| `node --test tests/member_default_password.test.js` | Check default passwords and the first-login flow using a simulated database |
| `npm run test:audit` | Run the system integration audit; requires `AUDIT_DATABASE_URL` |
| `npm run test:password-reset` | Run password recovery tests, including optional database checks |
| `npm run test:password-reset:browser` | Run the standalone password recovery browser checks |

If the environment prevents the test runner from spawning a child process, use:

```sh
node --test --test-isolation=none tests/member_default_password.test.js
```

The system audit requires `AUDIT_DATABASE_URL` pointing to an **isolated localhost PostgreSQL instance**, with permission to create and drop its temporary test database. Without it, the integration suite is skipped. Set `AUDIT_BROWSER=1` to include browser checks and `BROWSER_EXECUTABLE` when the default Microsoft Edge path does not match your installation.

Password recovery database tests use `RESET_TEST_DATABASE_URL`. These tests cover preserved recovery code; passing them does not enable the currently disabled routes. See [`docs/password-reset.md`](docs/password-reset.md) and the historical [`system audit`](docs/system-audit.md) for further context.

## Current limitations

- Public forgot-password and reset-password routes are disabled. Signed-in password changes and the mandatory first-login password change are available.
- Book covers and PDFs are stored under `public/images/books/` and `public/pdfs/books/`. A hosted installation needs persistent storage to retain uploads across redeployments. Files are limited to 35 MB each.
- The legacy fine/payment page does not provide a persistent payment backend.
- Some UI resources use external CDNs, and the free-book catalogue depends on an external service.
- Database migrations and initial administrator provisioning are manual setup steps.

## License

The package metadata declares the **ISC** license.

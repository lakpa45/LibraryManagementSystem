# System audit ? 2026-09-08

## Errors Found

Confirmed by failing checks or direct source/schema inspection:

1. Malformed login input produced HTTP 500; several registration/profile inputs exceeded database limits or accepted invalid calendar dates.
2. Generated member passwords were predictable name/birth-year combinations; some password paths counted characters instead of bcrypt's 72-byte limit.
3. Invalid route IDs reached PostgreSQL instead of returning a client error.
4. Self-service borrowing bypassed the physical-book and duplicate-loan protections used by staff.
5. Renewal used a separate check/update, allowing a concurrent return to race it.
6. Some transaction connection failures escaped their local error handlers; book deletion had repeated catch branches and member deletion exposed FK failures as 500.
7. Approval card numbering used record count and lacked the registration flow's locking.
8. Email changes, account deletion and normal password changes did not invalidate related reset links.
9. Member table and legacy category templates interpolated unescaped content.
10. Legacy category Borrow buttons still led to the old cart workflow.
11. Shared homepage JavaScript called a missing homepage-only function on nine other pages.
12. The old category script attached listeners to inputs that no longer existed.
13. Broken navigation destinations, nonexistent image placeholders and a missing favicon produced broken links/resource requests.
14. Two Tailwind URLs served different builds; package scripts lacked explicit production start/build commands; JWT configuration was not validated on startup.
15. An off-screen member navigation drawer and long member names caused mobile overflow. The older homepage linked a missing stylesheet.
16. Member account forms displayed a success toast before the save request completed.
17. Upload names relied solely on millisecond timestamps for uniqueness.
18. The installed transitive qs version had two npm security advisories.
19. A private access key and database backups were tracked in Git. Index removal is complete; rotation/history remediation remains required.
20. Production lacks RESEND_API_KEY and has no application upload volume. The legacy fine page stores payment state only in localStorage; there is no payment backend/schema.

## Fixes Made

Targeted changes preserve existing route names and role design. The file inventory below lists every current modified/new file. Private key and backup files were removed only from Git tracking; local copies were preserved. No production rows or tables were changed.

## Tests Performed

- `npm run build`: PASS; generated Tailwind successfully. A nonblocking Browserslist age warning remains.
- `node --check` across 83 application/test JavaScript files: PASS.
- Static reference scan of all 40 HTML files: no remaining missing literal local targets in the scan. Two archived librarian templates are intentionally not publicly served; they were inspected, not browser-tested.
- With AUDIT_DATABASE_URL set to a loopback test cluster and AUDIT_BROWSER=1, `node --test tests/system_audit.test.js`: 16 passing Node results, including the parent test. Real Express, PostgreSQL, bcrypt/JWT, API routes, role isolation, CRUD, wishlist, concurrent borrowing, return/fine calculation, member approval/rejection, reset/login and upload limits. 38 served pages ? 4 widths = 152 browser visits; no captured console exceptions/errors, failed local HTTP resources, unexpected redirects or horizontal overflow. Mobile member menu, exact-card green indicator, stored-XSS fixture and remaining sidebar Dashboard links passed. External HTTPS fonts/icons/images were stubbed, as were Resend and Gutendex; local APIs/assets were real.
- Additional actual PNG cover upload/GET/delete regression added afterwards; API-only rerun: 15 pass, 1 intentional browser skip, 0 failures. No application changes followed the passing full browser run.
- With RESET_TEST_DATABASE_URL set to loopback, `node --test --test-isolation=none tests/password_reset.test.js`: 14 pass, 0 fail. Official Resend SDK against a local HTTP fixture; token expiry/reuse/races, migration repeatability, rollback, rate limits and sanitized failure logs tested.
- `node tests/password_reset_browser.mjs`: PASS at 1440, 768, 375 and 320 px; forgot/resend cooldown, invalid input/tokens, retry, successful reset and login-modal navigation. This separate test mocks API responses.
- `npm audit --json`: initially found qs advisories; `npm update qs` updated within existing ranges and reported 0 vulnerabilities.
- `git diff --check`: PASS.
- Railway read-only configuration/deployment inspection: older deployment remains SUCCESS; no new release triggered. Tests used an isolated database cloned from schema only, never copied production rows, and dropped only their randomly named local databases.

## Remaining Problems

- **Actual email delivery ? MANUAL TEST REQUIRED:** Resend key absent locally and in Railway. The selected inbox must also have a controlled member account. Test actual delivery and the public HTTPS link after configuration and coordinated migration/deployment. Resend acceptance is not inbox delivery. A verified sending domain is needed for arbitrary recipients.
- **Deployment and persistent uploads ? MANUAL TEST REQUIRED:** current Railway deployment is older than these changes. No app volume is attached. Preserve existing uploaded files before selecting a volume/object-storage layout and migrating them; a fresh mount can hide existing files. Do not redeploy expecting new uploads to persist automatically.
- **Security remediation ? MANUAL TEST REQUIRED:** rotate/revoke the tracked private access key and review repository exposure/history for the database backups. Ignoring files does not erase history. Database TLS currently disables certificate verification; choose the provider-supported CA/private-network policy before changing it. Existing JWTs retain their one-hour expiry after password changes. This is a targeted audit, not a penetration test or proof that every possible security issue is absent.
- **Fine payment persistence ? FAIL:** return API fine calculation passed, but the legacy fine/payment page uses localStorage and has no PostgreSQL payment model/API. Implementing accounting/payment persistence needs agreed business rules and a separate safe schema change; no financial records were invented.
- Real external fonts/icons, Gutendex availability, physical touch devices, every possible modal/keyboard interaction, production secure-cookie behavior and performance/load were not exercised. Local browser layout coverage is not a claim of complete visual or accessibility certification.

## Environment Variables

Required: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL`. Railway supplies `PORT`.

Tests only: `AUDIT_DATABASE_URL`, `AUDIT_BROWSER`, optional `AUDIT_PAGE`, `RESET_TEST_DATABASE_URL`, optional `BROWSER_EXECUTABLE`. Never commit real credentials.

## Database Changes

Existing pending migration `migrations/008_secure_password_reset.sql` stores hashed single-use reset tokens and persistent rate-limit buckets. It was tested repeatedly on isolated PostgreSQL 18 and remains unapplied in production. No unrelated migration was added by this audit. Actual schema uses `issue`, `admins`, `librarian`; nonexistent loan/loan_item/admin/librarian_staff aliases were not invented. The schema-only fixture contains no production member rows or secrets.

## Deployment

Set RESEND_API_KEY privately. Coordinate migration 008 with stopping the old controller and deploying the new controller; the removed raw-token column makes an old-code rollback incompatible. Use `npm run build`, `npm run migrate:password-reset` against the intended database in the coordinated release, and `npm start`. See password-reset.md for release order. Resolve upload persistence and exposed-key remediation before relying on this deployment for production use. No release was performed during this audit.

## Final Status

Feature-level totals (not individual assertions): **14 passed, including 9 FIXED + PASS; 1 FAIL; 3 MANUAL TEST REQUIRED.** Automated test failures remaining: 0 in completed final checks.

| Feature | Status |
|---|---|
| Server startup/build | FIXED + PASS |
| Registration | FIXED + PASS |
| Login roles | FIXED + PASS |
| Role authorization | PASS |
| Books/copies/cover/PDF | FIXED + PASS |
| Categories | PASS |
| Wishlist | PASS |
| Borrow | FIXED + PASS |
| Return/fine calculation | PASS |
| Member management | FIXED + PASS |
| Password reset, mocked delivery | FIXED + PASS |
| Real Resend delivery | MANUAL TEST REQUIRED |
| Database query integration | PASS |
| Navigation/local assets | FIXED + PASS |
| Tested responsive layouts | FIXED + PASS |
| Railway release/upload persistence | MANUAL TEST REQUIRED |
| Exposed secrets/production security follow-up | MANUAL TEST REQUIRED |
| Fine payment persistence | FAIL |

## Modified Files

- `.gitignore` ? Exclude local access keys and database backups.
- `controllers/auth/change_password_controller.js` ? Transactional password updates and reset invalidation; safe missing body and byte limits.
- `controllers/auth/librarian_signin.js` ? Reject malformed login credentials before bcrypt/database operations.
- `controllers/auth/librarian_staff_signin.js` ? Reject malformed login credentials before bcrypt/database operations.
- `controllers/auth/sign_in.js` ? Reject malformed login credentials before bcrypt/database operations.
- `controllers/auth/sign_up.js` ? Random temporary passwords, schema-bound input/date/UTF-8 validation, sanitized failure logging.
- `controllers/books/book_controller.js` ? Safe transaction cleanup, deletion conflicts and numeric input handling.
- `controllers/librarians/librarian_controller.js` ? Validate optional bodies, database lengths and bcrypt byte limit.
- `controllers/loans/loan_controller.js` ? Share protected issue logic with member borrowing; validate dates; atomic renewal and safe cleanup.
- `controllers/members/member_controller.js` ? Safe deletion conflicts, reset invalidation, locked card numbering and profile validation.
- `docs/audit-inventory.json` ? Record inspected HTML files, static targets and syntax-check results.
- `docs/browser-audit-results.json` ? Record tested routes/widths and final browser failures list.
- `docs/password-reset.md` ? Replace obsolete SMTP notes with current Resend configuration and pending release steps.
- `docs/system-audit.md` ? Record findings, test evidence, limitations and complete file inventory.
- `middleware/upload.js` ? Use cryptographically unique upload names.
- `middleware/validate_id.js` ? Reject malformed/out-of-range numeric route IDs.
- `package-lock.json` ? Update vulnerable transitive qs dependency.
- `package.json` ? Add explicit start/build and audit/browser test scripts.
- `public/css/user_dashboard.css` ? Fix mobile drawer overflow and wrap long member names.
- `public/js/cart_page.js` ? Correct fallback image path in retained legacy script.
- `public/js/category_page.js` ? Escape book content and route borrowing to current book detail flow.
- `public/js/homepage.js` ? Initialize homepage-only products only where its module is loaded.
- `public/js/members.js` ? Escape member fields in table HTML.
- `public/js/product_renderer.js` ? Use existing SVG cover placeholder.
- `public/js/user_dashboard.js` ? Remove premature profile-save success message.
- `public/output.css` ? Regenerate Tailwind for current templates and scripts.
- `railway connect` ? Remove from Git index only; preserve local copy. Rotation/history remediation remains pending.
- `railway connect.pub` ? Remove from Git index only; preserve local copy. Rotation/history remediation remains pending.
- `railway_backup.dump` ? Remove from Git index only; preserve local copy. Rotation/history remediation remains pending.
- `railway_backup.dump~` ? Remove from Git index only; preserve local copy. Rotation/history remediation remains pending.
- `routes/bookRoutes.js` ? Attach shared numeric route-parameter validation without renaming endpoints.
- `routes/categoryRoutes.js` ? Attach shared numeric route-parameter validation without renaming endpoints.
- `routes/loanRoutes.js` ? Attach shared numeric route-parameter validation without renaming endpoints.
- `routes/memberRoutes.js` ? Attach shared numeric route-parameter validation without renaming endpoints.
- `routes/wishlistRoutes.js` ? Attach shared numeric route-parameter validation without renaming endpoints.
- `server.js` ? Validate JWT configuration; serve one Tailwind build through both URLs and provide favicon.
- `tests/audit-server.mjs` ? Add isolated API, database, SDK or browser regression coverage.
- `tests/fixtures/production-schema.sql` ? Schema-only PostgreSQL fixture, without production rows or credentials.
- `tests/password_reset_browser.mjs` ? Add isolated API, database, SDK or browser regression coverage.
- `tests/system_audit.test.js` ? Add isolated API, database, SDK or browser regression coverage.
- `tests/system_browser.mjs` ? Add isolated API, database, SDK or browser regression coverage.
- `utils/date_validation.js` ? Validate actual calendar dates, not just date-shaped strings.
- `views/POM_bookdetail.html` ? Repair stale navigation/assets or obsolete script references; preserve page structure.
- `views/book_category.html` ? Repair stale navigation/assets or obsolete script references; preserve page structure.
- `views/book_detail.html` ? Repair stale navigation/assets or obsolete script references; preserve page structure.
- `views/commerce.html` ? Repair stale navigation/assets or obsolete script references; preserve page structure.
- `views/librarian/librarian_books_entry.html` ? Repair stale navigation/assets or obsolete script references; preserve page structure.
- `views/librarian/librarian_dashboard.html` ? Repair stale navigation/assets or obsolete script references; preserve page structure.
- `views/old_index.html` ? Repair stale navigation/assets or obsolete script references; preserve page structure.
- `views/overdue&fine.html` ? Repair stale navigation/assets or obsolete script references; preserve page structure.
- `views/socialscience.html` ? Repair stale navigation/assets or obsolete script references; preserve page structure.
- `views/studentlibrary.html` ? Repair stale navigation/assets or obsolete script references; preserve page structure.

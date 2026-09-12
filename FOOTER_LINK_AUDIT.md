# Footer link audit

The existing footer layouts, colors, typography and content are retained. Footer-only CSS adds focus outlines and mobile tap targets. Login is an existing modal on Home (and catalog pages), not a separate HTML page. Register has no footer. No footer was added to pages without one. No Express, navbar, authentication, API or database code changed.

## Final destinations

| Link | Destination |
| --- | --- |
| Home | `/` |
| Books | `/books` |
| Categories | `/categories` |
| Popular Books | `/#products` |
| New Arrivals | `/books?sort=newest` |
| Digital Library | `/e-books` |
| Borrowing Policy | `/frequently_asked_question.html#borrowing` |
| FAQ | `/frequently_asked_question.html` |
| Contact Librarian | `mailto:library@apna.edu` |
| Contact | `mailto:library@apna.edu` |
| library@apna.edu | `mailto:library@apna.edu` |
| +91-123-1234 | `tel:+911231234` |
| Library Rules | Link removed; label retained as plain text to preserve layout (no rules page exists). |
| Members (legacy footers) | Removed; there is no public member-directory page. |

The published email address and phone number were preserved; protocol syntax is tested, not mailbox delivery or phone service. No external web links remain in the existing footers.

## Changed files

- `views/all_books.html`
- `views/book.html`
- `views/book_category.html`
- `views/book_detail.html`
- `views/categories.html`
- `views/commerce.html`
- `views/computer_science.html`
- `views/engineering_mathematics.html`
- `views/e_books.html`
- `views/frequently_asked_question.html`
- `views/fundamental_of_physics.html`
- `views/index.html`
- `views/law.html`
- `views/literature.html`
- `views/management.html`
- `views/mathematics.html`
- `views/my_books.html`
- `views/novels.html`
- `views/old_index.html`
- `views/POM_bookdetail.html`
- `views/science.html`
- `views/socialscience.html`
- `views/user_dashboard.html`
- `public/css/footer_links.css`
- `tests/footer_links.mjs`
- `FOOTER_LINK_AUDIT.md`

## Verification

Run `node tests/footer_links.mjs` (requires Edge, or set `BROWSER_EXECUTABLE`). The test starts the real Express server on localhost:3187 with an unused local database URL, checks all 27 enabled public HTML files and 177 footer links, verifies internal destination HTML and fragment IDs, and measures footer links in headless Edge at 320, 375, 768 and 1440px. Browser API calls and external assets are stubbed; this does not verify live database behavior or external fonts.

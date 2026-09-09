document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('booksGrid');
  const stateBox = document.getElementById('booksState');
  const message = document.getElementById('bookMessage');
  const search = document.getElementById('bookSearch');
  const category = document.getElementById('categoryFilter');
  const availability = document.getElementById('availabilityFilter');
  const sort = document.getElementById('sortFilter');
  const previous = document.getElementById('previousPage');
  const next = document.getElementById('nextPage');
  const dialog = document.getElementById('detailsDialog');
  const detailsContent = document.getElementById('detailsContent');
  let page = 1;
  let pages = 1;
  let books = [];
  let requestController;
  let debounceTimer;

  const initialQuery = new URLSearchParams(window.location.search).get('q');
  if (initialQuery) search.value = initialQuery;

  const token = () => localStorage.getItem('token');
  const authHeaders = () => token() ? { Authorization: `Bearer ${token()}` } : {};
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const safeImage = value => {
    if (!value) return null;
    try {
      const url = new URL(value, window.location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  };

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.style.color = isError ? '#a33a30' : '#16794b';
  }

  function showSignInMessage() {
    message.replaceChildren(document.createTextNode('Please sign in to add books to your wishlist. '));
    message.style.color = '#a33a30';
    const link = element('a', '', 'Sign in');
    link.href = '#';
    link.addEventListener('click', event => {
      event.preventDefault();
      document.getElementById('loginBtn')?.click();
    });
    message.append(link);
  }

  function makeCover(book) {
    const frame = element('div', 'book-cover-frame');
    const source = safeImage(book.cover_image);
    if (!source) { frame.append(placeholder(book.title)); return frame; }
    const image = element('img', 'book-cover');
    image.src = source;
    image.alt = `Cover of ${book.title}`;
    image.loading = 'lazy';
    image.addEventListener('error', () => image.replaceWith(placeholder(book.title)), { once: true });
    frame.append(image);
    return frame;
  }

  function placeholder(title) {
    const box = element('div', 'book-placeholder');
    const icon = element('i', 'fa-solid fa-book-open');
    const label = element('span', '', title || 'APNA Library');
    box.append(icon, label);
    return box;
  }

  function availabilityText(book) {
    return Number(book.available_copies) > 0
      ? `Available — ${book.available_copies} ${Number(book.available_copies) === 1 ? 'copy' : 'copies'}`
      : 'Currently unavailable';
  }

  let previousOverflow = '';
  let previousRootOverflow = '';
  let detailMessage;
  let detailsBookId;
  function openDetails(book) {
    detailsBookId = book.book_id;
    detailsContent.replaceChildren();
    const info = element('div', 'details-info');
    info.append(element('span', 'book-category', book.category_name || 'Uncategorized'));
    const title = element('h2', '', book.title);
    title.id = 'detailsTitle';
    info.append(title);
    const meta = element('dl', 'details-meta');
    const fields = [['Category', book.category_name || 'Uncategorized'], ['ISBN', book.isbn || 'Not recorded'], ['Book type', book.book_type || 'Not recorded']];
    if (book.author) fields.unshift(['Author', book.author]);
    fields.forEach(([label, value]) => {
      const row = element('div'); row.append(element('dt', '', label), element('dd', '', value)); meta.append(row);
    });
    info.append(meta);
    const stock = element('p', Number(book.available_copies) > 0 ? 'availability availability--yes' : 'availability availability--no', availabilityText(book));
    info.append(stock, element('p', 'details-description', book.description || 'No description is available.'));
    const actions = element('div', 'details-actions');
    const wishlist = element('button', 'detail-action', book.wishlisted ? 'Remove from Wishlist' : 'Add to Wishlist');
    wishlist.type = 'button';
    wishlist.setAttribute('aria-pressed', String(Boolean(book.wishlisted)));
    wishlist.addEventListener('click', () => toggleWishlist(book, wishlist));
    const borrow = element('button', 'detail-action detail-action--primary', 'Borrow Book');
    borrow.type = 'button';
    const close = element('button', 'detail-action', 'Back to Books');
    close.type = 'button'; close.addEventListener('click', () => dialog.close());
    detailMessage = element('p', 'details-message'); detailMessage.setAttribute('aria-live', 'polite');
    window.initialiseBookBorrow(book, borrow, detailMessage, () => {
      book.available_copies = Math.max(0, Number(book.available_copies) - 1);
      stock.textContent = availabilityText(book);
      stock.className = Number(book.available_copies) > 0 ? 'availability availability--yes' : 'availability availability--no';
      renderBooks();
    });
    actions.append(wishlist, borrow);
    if (String(book.book_type).toLowerCase() === 'digital' && safeImage(book.pdf_file)) {
      const read = element('a', 'detail-action detail-action--primary', 'Read PDF');
      read.href = safeImage(book.pdf_file); read.target = '_blank'; read.rel = 'noopener noreferrer'; actions.append(read);
    }
    actions.append(close); info.append(actions, detailMessage);
    detailsContent.append(makeCover(book), info);
    previousOverflow = document.body.style.overflow;
    previousRootOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    dialog.showModal();
  }

  async function toggleWishlist(book, button) {
    if (!token()) {
      if (dialog.open) dialog.close();
      showSignInMessage();
      document.getElementById('loginBtn')?.click();
      return;
    }
    button.disabled = true;
    try {
      const response = await fetch(`/api/wishlist/${book.book_id}`, {
        method: book.wishlisted ? 'DELETE' : 'POST', headers: authHeaders()
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Wishlist update failed');
      book.wishlisted = result.wishlisted;
      button.textContent = button.dataset.compact ? (book.wishlisted ? '\u2665' : '\u2661') : (book.wishlisted ? 'Remove from Wishlist' : 'Add to Wishlist');
      button.setAttribute('aria-pressed', String(book.wishlisted));
      button.setAttribute('aria-label', `${book.wishlisted ? 'Remove' : 'Add'} ${book.title} ${book.wishlisted ? 'from' : 'to'} wishlist`);
      showMessage(result.message);
      if (dialog.open && detailMessage) detailMessage.textContent = result.message;
      renderBooks();
    } catch (error) {
      showMessage(error.message, true);
      if (dialog.open && detailMessage) detailMessage.textContent = error.message;
    } finally { button.disabled = false; }
  }

  function renderBooks() {
    grid.replaceChildren();
    books.forEach(book => {
      const card = element('article', 'book-card');
      card.append(makeCover(book));
      const body = element('div', 'book-card__body');
      body.append(element('span', 'book-category', book.category_name || 'Uncategorized'));
      body.append(element('h2', '', book.title));
      body.append(element('p', 'book-description', book.description || 'No description is available.'));
      body.append(element('p', Number(book.available_copies) > 0 ? 'availability availability--yes' : 'availability availability--no', availabilityText(book)));
      const actions = element('div', 'book-actions');
      const details = element('button', 'details-button', 'View Details');
      details.type = 'button';
      details.dataset.bookId = book.book_id;
      details.addEventListener('click', () => openDetails(book));
      const wishlist = element('button', 'wishlist-button', book.wishlisted ? '\u2665' : '\u2661');
      wishlist.dataset.compact = 'true';
      wishlist.type = 'button';
      wishlist.setAttribute('aria-pressed', String(Boolean(book.wishlisted)));
      wishlist.setAttribute('aria-label', `${book.wishlisted ? 'Remove' : 'Add'} ${book.title} ${book.wishlisted ? 'from' : 'to'} wishlist`);
      wishlist.addEventListener('click', () => toggleWishlist(book, wishlist));
      actions.append(details, wishlist);
      body.append(actions);
      card.append(body);
      grid.append(card);
    });
  }

  async function loadBooks() {
    requestController?.abort();
    requestController = new AbortController();
    grid.setAttribute('aria-busy', 'true');
    stateBox.hidden = false;
    stateBox.replaceChildren(element('i', 'fa-solid fa-spinner fa-spin'), element('p', '', 'Loading books…'));
    const params = new URLSearchParams({ public: '1', page: String(page), limit: '12', sort: sort.value, availability: availability.value });
    if (search.value.trim()) params.set('q', search.value.trim());
    if (category.value) params.set('category', category.value);
    try {
      const response = await fetch(`/api/books?${params}`, { headers: authHeaders(), signal: requestController.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to load books');
      books = result.books;
      pages = result.pages;
      document.getElementById('resultCount').textContent = `${result.total} ${result.total === 1 ? 'book' : 'books'}`;
      document.getElementById('pageStatus').textContent = `Page ${result.page} of ${pages}`;
      document.getElementById('paginationLabel').textContent = `Page ${result.page} of ${pages}`;
      previous.disabled = page <= 1;
      next.disabled = page >= pages;
      renderBooks();
      stateBox.hidden = books.length > 0;
      if (!books.length) stateBox.replaceChildren(element('i', 'fa-regular fa-folder-open'), element('p', '', search.value || category.value || availability.value !== 'all' ? 'No books match these filters.' : 'No books have been added yet.'));
    } catch (error) {
      if (error.name === 'AbortError') return;
      books = [];
      grid.replaceChildren();
      stateBox.hidden = false;
      stateBox.replaceChildren(element('i', 'fa-solid fa-triangle-exclamation'), element('p', '', error.message));
    } finally { grid.setAttribute('aria-busy', 'false'); }
  }

  async function loadCategories() {
    try {
      const response = await fetch('/api/categories');
      if (!response.ok) return;
      const categories = await response.json();
      categories.forEach(item => {
        const option = element('option', '', item.category_name);
        option.value = item.category_id;
        category.append(option);
      });
    } catch { /* The books page can still work without the filter. */ }
  }

  search.addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => { page = 1; loadBooks(); }, 300); });
  [category, availability, sort].forEach(control => control.addEventListener('change', () => { page = 1; loadBooks(); }));
  previous.addEventListener('click', () => { if (page > 1) { page -= 1; loadBooks(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  next.addEventListener('click', () => { if (page < pages) { page += 1; loadBooks(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  document.getElementById('detailsClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.documentElement.style.overflow = previousRootOverflow;
    if (document.getElementById('authOverlay')?.classList.contains('is-open')) return;
    document.body.style.overflow = previousOverflow;
    grid.querySelector(`[data-book-id="${detailsBookId}"]`)?.focus({ preventScroll: true });
  });
  document.addEventListener('libauthchange', loadBooks);
  loadCategories();
  loadBooks();
});

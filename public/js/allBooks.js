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
  let page = 1;
  let pages = 1;
  let books = [];
  let requestController;
  let debounceTimer;

  const initialQuery = new URLSearchParams(window.location.search).get('q');
  if (initialQuery) search.value = initialQuery;

  const initialSort = new URLSearchParams(location.search).get('sort');
  if ([...sort.options].some(option => option.value === initialSort)) sort.value = initialSort;
  document.getElementById('bookFilters').addEventListener('submit', event => { event.preventDefault(); clearTimeout(debounceTimer); page = 1; loadBooks(); });
  const token = () => localStorage.getItem('token');
  const authHeaders = () => token() ? { Authorization: `Bearer ${token()}` } : {};
  const {element} = window.BookUI;
  const detailsModal = window.BookUI.createDetails({grid, onWishlist: toggleWishlist, onBorrow: renderBooks});

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.style.color = isError ? '#a33a30' : '#16794b';
  }

  function showSignInMessage() {
    message.replaceChildren(document.createTextNode('Please sign in to add books to your wishlist. '));
    message.style.color = '#a33a30';
    const link = element('a', '', 'Sign in');
    link.href = '/?login=1';
    link.addEventListener('click', event => {
      event.preventDefault();
      document.getElementById('loginBtn')?.click();
    });
    message.append(link);
  }


  async function toggleWishlist(book, button) {
    if (!token()) {
      if (detailsModal.isOpen) detailsModal.close();
      showSignInMessage();
      document.getElementById('loginBtn')?.click();
      return;
    }
    button.disabled = true;
    try {
      const response = await fetch(`/api/wishlist/${book.book_id}`, {
        method: book.wishlisted ? 'DELETE' : 'POST', headers: authHeaders()
      });
      const result = await LibraryAPI.read(response);
      if (!response.ok) throw new Error(result.message || 'Wishlist update failed');
      book.wishlisted = result.wishlisted;
      button.textContent = button.dataset.compact ? (book.wishlisted ? '\u2665' : '\u2661') : (book.wishlisted ? 'Remove from Wishlist' : 'Add to Wishlist');
      button.setAttribute('aria-pressed', String(book.wishlisted));
      button.setAttribute('aria-label', `${book.wishlisted ? 'Remove' : 'Add'} ${book.title} ${book.wishlisted ? 'from' : 'to'} wishlist`);
      showMessage(result.message);
      if (detailsModal.isOpen) detailsModal.setMessage(result.message);
      renderBooks();
    } catch (error) {
      showMessage(error.message, true);
      if (detailsModal.isOpen) detailsModal.setMessage(error.message);
    } finally { button.disabled = false; }
  }

  function renderBooks() {
    grid.replaceChildren();
    books.forEach(book => {
      const {card, actions} = window.BookUI.createCard(book);
      const details = element('button', 'details-button', 'View Details');
      details.type = 'button';
      details.dataset.bookId = book.book_id;
      details.addEventListener('click', () => detailsModal.open(book));
      const wishlist = element('button', 'wishlist-button', book.wishlisted ? '\u2665' : '\u2661');
      wishlist.dataset.compact = 'true';
      wishlist.type = 'button';
      wishlist.setAttribute('aria-pressed', String(Boolean(book.wishlisted)));
      wishlist.setAttribute('aria-label', `${book.wishlisted ? 'Remove' : 'Add'} ${book.title} ${book.wishlisted ? 'from' : 'to'} wishlist`);
      wishlist.addEventListener('click', () => toggleWishlist(book, wishlist));
      actions.append(details, wishlist);
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
      const result = await LibraryAPI.read(response);
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
      const categories = await LibraryAPI.read(response);
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
  document.addEventListener('libauthchange', loadBooks);
  loadCategories();
  loadBooks();
});

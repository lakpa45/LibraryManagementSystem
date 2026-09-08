function createProductCard(book) {
  const article = document.createElement('article'); article.className = 'product'; article.dataset.bookId = book.book_id;
  const media = document.createElement('div'); media.className = 'product__media';
  const image = document.createElement('img'); image.src = book.cover_image || '/images/placeholder-book.svg'; image.alt = `Cover of ${book.title}`; image.loading = 'lazy';
  const wishlist = document.createElement('button'); wishlist.className = 'product__add wishlist-toggle'; wishlist.dataset.id = book.book_id;
  wishlist.setAttribute('aria-pressed', String(Boolean(book.wishlisted))); wishlist.setAttribute('aria-label', `${book.wishlisted ? 'Remove' : 'Add'} ${book.title} ${book.wishlisted ? 'from' : 'to'} wishlist`); wishlist.textContent = book.wishlisted ? '♥ In Wishlist' : '♡ Add to Wishlist';
  media.append(image, wishlist);
  const info = document.createElement('div'); info.className = 'product__info';
  const category = document.createElement('span'); category.className = 'product__category'; category.textContent = book.category_name || '';
  const title = document.createElement('h3'); title.textContent = book.title;
  const available = document.createElement('p'); available.className = 'product__price'; available.textContent = Number(book.available_copies) > 0 ? `${book.available_copies} available` : 'Currently unavailable';
  info.append(category, title, available); article.append(media, info); return article;
}

function wireWishlistButtons(scope = document) {
  scope.querySelectorAll('.wishlist-toggle').forEach(button => button.addEventListener('click', async () => {
    const token = localStorage.getItem('token');
    if (!token) { window.alert('Please log in to add books to your wishlist.'); document.getElementById('loginBtn')?.click(); return; }
    button.disabled = true;
    const active = button.getAttribute('aria-pressed') === 'true';
    try {
      const response = await fetch(`/api/wishlist/${button.dataset.id}`, { method: active ? 'DELETE' : 'POST', headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || 'Wishlist update failed');
      button.setAttribute('aria-pressed', String(result.wishlisted)); button.textContent = result.wishlisted ? '♥ In Wishlist' : '♡ Add to Wishlist';
    } catch (error) { window.alert(error.message); } finally { button.disabled = false; }
  }));
}

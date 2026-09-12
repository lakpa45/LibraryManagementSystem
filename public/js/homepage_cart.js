async function loadHomepageProducts() {
  const grid = document.getElementById('productsGrid'); const picksWrapper = document.getElementById('picksWrapper');
  if (!grid && !picksWrapper) return;
  const token = localStorage.getItem('token');
  try {
    const response = await fetch('/api/books?public=1&availability=available&limit=8&sort=newest', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const result = await LibraryAPI.read(response); if (!response.ok) throw new Error(result.message || 'Unable to load books');
    const books = result.books;
    if (grid) { grid.replaceChildren(...books.slice(0, 4).map(createProductCard)); wireWishlistButtons(grid); }
    if (picksWrapper) { picksWrapper.replaceChildren(...books.slice(4, 8).map(book => { const slide = document.createElement('div'); slide.className = 'swiper-slide'; slide.append(createProductCard(book)); return slide; })); wireWishlistButtons(picksWrapper); }
  } catch (error) { console.error('Failed to load books:', error.message); }
}

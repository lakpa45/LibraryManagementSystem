// Historical book descriptions have no database IDs. Resolve the actual title before navigating.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.borrow-btn, .reserve-btn').forEach(button => {
    if (button.classList.contains('reserve-btn')) { button.hidden = true; button.style.display = 'none'; return; }
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      const title = document.querySelector('h1')?.textContent.trim();
      if (!title) return;
      button.disabled = true;
      try {
        const response = await fetch('/api/books/search?q=' + encodeURIComponent(title));
        if (!response.ok) throw new Error('Unable to find this book. Please try again.');
        const books = await LibraryAPI.read(response);
        const book = books.find(b => b.title.trim().toLowerCase() === title.toLowerCase());
        location.href = book ? '/book.html?id=' + book.book_id : '/books?q=' + encodeURIComponent(title);
      } catch (error) { alert(error.message); button.disabled = false; }
    });
  });
});

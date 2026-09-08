function categoryEscape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function loadCategoryBooks(categoryId) {
   const grid = document.querySelector('.books-grid');
   if (!grid) return;

   try {
       const response = await fetch('/api/books');
       const books = await response.json();

       const filtered = books.filter(b => String(b.category_id) === String(categoryId));

       if (filtered.length === 0) {
           grid.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: #888;">No books in this category yet.</p>`;
           return;
       }

       grid.innerHTML = filtered.map(book => `
           <article class="book-card">
               <div class="book-cover">
                   ${book.cover_image
                       ? `<img src="${categoryEscape(book.cover_image)}" alt="${categoryEscape(book.title)}" style="width:100%;height:100%;object-fit:cover;">`
                       : `<i class="fa-solid fa-book"></i>`
                   }
               </div>
               <div class="book-info">
                   <h3>${categoryEscape(book.title)}</h3>
                   <p>${categoryEscape(book.description || 'No description available.')}</p>
                   <button type="button" class="book-btn" data-book-id="${categoryEscape(book.book_id)}">
                       Borrow Book
                       <i class="fa-solid fa-arrow-right"></i>
                   </button>
               </div>
           </article>
       `).join('');

       wireCategoryCartButtons(grid, filtered);
   } catch (err) {
       console.error(err);
   }
}

function wireCategoryCartButtons(grid, books) {
   const booksById = new Map(books.map(book => [String(book.book_id), book]));

   grid.querySelectorAll('.book-btn').forEach(button => {
       button.addEventListener('click', () => {
           const book = booksById.get(button.dataset.bookId);
           if (!book) return;

           window.location.href = `/book.html?id=${encodeURIComponent(book.book_id)}`;
       });
   });
}

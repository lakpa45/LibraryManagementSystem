// ==== Site-wide book search (live dropdown) ====
function libEscapeHtmlSearch(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function attachBookSearch(inputId, dropdownId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown || input.dataset.bookSearchAttached === 'true') return;
    input.dataset.bookSearchAttached = 'true';

    let debounceTimer = null;
    let activeController = null;

    const closeDropdown = () => {
        dropdown.innerHTML = '';
        dropdown.classList.remove('is-open');
    };

    const renderResults = (books) => {
        if (!books.length) {
            dropdown.innerHTML = '<p class="search-dropdown__empty">No books found.</p>';
            dropdown.classList.add('is-open');
            return;
        }
        dropdown.innerHTML = books.map((book) => {
            const title = libEscapeHtmlSearch(book.title || 'Untitled');
            const category = libEscapeHtmlSearch(book.category_name || '');
            const cover = book.cover_image || '/images/1stbook.jpg';
            return `
                <a href="/book.html?id=${book.book_id}" class="search-dropdown__item">
                    <img src="${cover}" alt="${title}">
                    <span>
                        <strong>${title}</strong>
                        ${category ? `<small>${category}</small>` : ''}
                    </span>
                </a>
            `;
        }).join('');
        dropdown.classList.add('is-open');
    };

    const runSearch = async (term) => {
        try {
            if (activeController) activeController.abort();
            activeController = new AbortController();
            const response = await fetch('/api/books/search?q=' + encodeURIComponent(term), {
                signal: activeController.signal
            });
            if (!response.ok) throw new Error('Search failed');
            const books = await LibraryAPI.read(response);
            renderResults(books);
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Book search failed:', err);
                closeDropdown();
            }
        }
    };

    input.addEventListener('input', () => {
        const term = input.value.trim();
        clearTimeout(debounceTimer);
        if (!term) {
            closeDropdown();
            return;
        }
        debounceTimer = setTimeout(() => runSearch(term), 250);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDropdown();
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== input) {
            closeDropdown();
        }
    });

    const form = input.closest('form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const first = dropdown.querySelector('.search-dropdown__item');
            if (first) {
                window.location.href = first.getAttribute('href');
                return;
            }
            const term = input.value.trim();
            window.location.href = term ? `/books?q=${encodeURIComponent(term)}` : '/books';
        });
    }
}

function attachFallbackBookSearch(input) {
    if (!input || input.dataset.bookSearchAttached === 'true') return;
    const form = input.closest('form');
    if (!form) return;
    input.dataset.bookSearchAttached = 'true';
    form.setAttribute('role', 'search');
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const term = input.value.trim();
        window.location.href = term ? `/books?q=${encodeURIComponent(term)}` : '/books';
    });
}

document.addEventListener('DOMContentLoaded', () => {
    attachBookSearch('navbarSearchInput', 'navbarSearchDropdown');
    document.querySelectorAll('form.search input[type="search"]').forEach(attachFallbackBookSearch);
});

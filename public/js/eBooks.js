const BOOKS_PER_PAGE = 9;

let currentBooks = [];
let localPage = 0;
let nextApiUrl = null;
let previousApiUrl = null;
let apiResponseHistory = [];
let currentSearch = '';
let visiblePageNumber = 1;
let currentApiPage = 1;
let isLoading = false;
let totalResults = 0;

const searchForm = document.getElementById('ebookSearchForm');
const searchInput = document.getElementById('ebookSearchInput');
const searchButton = document.getElementById('ebookSearchButton');
const grid = document.getElementById('ebookGrid');
const statusMessage = document.getElementById('ebookStatus');
const resultCount = document.getElementById('ebookResultCount');
const previousButton = document.getElementById('ebookPrevious');
const nextButton = document.getElementById('ebookNext');
const pageIndicator = document.getElementById('ebookPageIndicator');

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function safeHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
        return null;
    }
}

function getApiPage(apiUrl) {
    if (!apiUrl) return null;
    try {
        const page = Number(new URL(apiUrl).searchParams.get('page'));
        return Number.isInteger(page) && page > 0 ? page : null;
    } catch {
        return null;
    }
}

function setLoading(loading) {
    isLoading = loading;
    searchButton.disabled = loading;
    previousButton.disabled = loading || !canGoPrevious();
    nextButton.disabled = loading || !canGoNext();
    searchButton.textContent = loading ? 'Searching...' : 'Search';
    searchForm.setAttribute('aria-busy', String(loading));
}

function renderSkeletons() {
    grid.innerHTML = Array.from({ length: BOOKS_PER_PAGE }, () => `
        <article class="ebook-card ebook-card--skeleton" aria-hidden="true">
            <div class="skeleton skeleton-cover"></div>
            <div class="ebook-card__body">
                <div class="skeleton skeleton-line skeleton-line--wide"></div>
                <div class="skeleton skeleton-line"></div>
                <div class="skeleton skeleton-line skeleton-line--short"></div>
            </div>
        </article>
    `).join('');
}

function canGoPrevious() {
    return localPage > 0 || apiResponseHistory.length > 0;
}

function canGoNext() {
    const hasLocalBooks = (localPage + 1) * BOOKS_PER_PAGE < currentBooks.length;
    return hasLocalBooks || Boolean(nextApiUrl);
}

function updatePagination() {
    pageIndicator.textContent = `Page ${visiblePageNumber}`;
    previousButton.disabled = isLoading || !canGoPrevious();
    nextButton.disabled = isLoading || !canGoNext();
}

function renderBooks() {
    const start = localPage * BOOKS_PER_PAGE;
    const visibleBooks = currentBooks.slice(start, start + BOOKS_PER_PAGE);

    resultCount.textContent = totalResults
        ? `${totalResults.toLocaleString()} result${totalResults === 1 ? '' : 's'}`
        : '';

    if (!visibleBooks.length) {
        grid.innerHTML = '<div class="ebook-empty"><i class="fa-regular fa-folder-open"></i><h3>No results found</h3><p>Try another title or author.</p></div>';
        statusMessage.textContent = 'No free e-books were found.';
        updatePagination();
        return;
    }

    grid.innerHTML = visibleBooks.map((book) => {
        const title = book.title || 'Untitled book';
        const authors = Array.isArray(book.authors) && book.authors.length
            ? book.authors.join(', ')
            : 'Unknown author';
        const language = Array.isArray(book.languages) && book.languages.length
            ? book.languages.map((item) => item.toUpperCase()).join(', ')
            : 'Language unavailable';
        const cover = safeHttpUrl(book.cover);
        const readUrl = safeHttpUrl(book.readUrl);
        const epubUrl = safeHttpUrl(book.epubUrl);
        const downloads = Number(book.downloadCount || 0).toLocaleString();

        return `
            <article class="ebook-card">
                <div class="ebook-card__cover">
                    ${cover
                        ? `<img src="${escapeHtml(cover)}" alt="Cover of ${escapeHtml(title)}" loading="lazy" data-cover-image>`
                        : `<div class="ebook-cover-placeholder" role="img" aria-label="No cover available for ${escapeHtml(title)}"><i class="fa-solid fa-book-open"></i><span>APNA Library</span></div>`}
                </div>
                <div class="ebook-card__body">
                    <p class="ebook-card__language"><i class="fa-solid fa-language"></i> ${escapeHtml(language)}</p>
                    <h3>${escapeHtml(title)}</h3>
                    <p class="ebook-card__author">${escapeHtml(authors)}</p>
                    <p class="ebook-card__downloads"><i class="fa-solid fa-download"></i> ${downloads} downloads</p>
                    <div class="ebook-card__actions">
                        ${readUrl
                            ? `<a href="${escapeHtml(readUrl)}" target="_blank" rel="noopener noreferrer" class="ebook-btn ebook-btn--primary">Read Book</a>`
                            : '<span class="ebook-btn ebook-btn--disabled" aria-disabled="true" title="Read format unavailable">Read unavailable</span>'}
                        ${epubUrl
                            ? `<a href="${escapeHtml(epubUrl)}" target="_blank" rel="noopener noreferrer" class="ebook-btn ebook-btn--secondary">Download EPUB</a>`
                            : '<span class="ebook-btn ebook-btn--disabled" aria-disabled="true">EPUB unavailable</span>'}
                    </div>
                </div>
            </article>
        `;
    }).join('');

    grid.querySelectorAll('[data-cover-image]').forEach((image) => {
        image.addEventListener('error', () => {
            const placeholder = document.createElement('div');
            placeholder.className = 'ebook-cover-placeholder';
            placeholder.setAttribute('role', 'img');
            placeholder.setAttribute('aria-label', 'Book cover unavailable');
            placeholder.innerHTML = '<i class="fa-solid fa-book-open"></i><span>APNA Library</span>';
            image.replaceWith(placeholder);
        }, { once: true });
    });

    statusMessage.textContent = `Showing page ${visiblePageNumber} of free e-books.`;
    updatePagination();
}

async function fetchBooks(apiPage, { addHistory = false } = {}) {
    if (isLoading) return;

    let cachedPreviousState = null;
    if (addHistory) {
        cachedPreviousState = {
            books: currentBooks,
            next: nextApiUrl,
            previous: previousApiUrl,
            apiPage: currentApiPage,
            localPage,
            totalResults
        };
        apiResponseHistory.push(cachedPreviousState);
    }

    setLoading(true);
    renderSkeletons();
    statusMessage.textContent = currentSearch ? `Searching for ${currentSearch}...` : 'Loading popular free e-books...';

    const params = new URLSearchParams({ page: String(apiPage) });
    if (currentSearch) params.set('q', currentSearch);

    try {
        const response = await fetch(`/api/books/free?${params.toString()}`);
        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await LibraryAPI.read(response) : {};

        if (!response.ok) {
            throw new Error(data.message || 'Unable to load free e-books.');
        }

        currentBooks = Array.isArray(data.books) ? data.books : [];
        nextApiUrl = data.next || null;
        previousApiUrl = data.previous || null;
        currentApiPage = apiPage;
        localPage = 0;
        totalResults = Number(data.count || 0);
        renderBooks();
    } catch (error) {
        if (addHistory && cachedPreviousState) {
            apiResponseHistory.pop();
            currentBooks = cachedPreviousState.books;
            nextApiUrl = cachedPreviousState.next;
            previousApiUrl = cachedPreviousState.previous;
            currentApiPage = cachedPreviousState.apiPage;
            localPage = cachedPreviousState.localPage;
            totalResults = cachedPreviousState.totalResults;
            visiblePageNumber = Math.max(1, visiblePageNumber - 1);
            renderBooks();
            statusMessage.textContent = error.message || 'Unable to load the next page.';
            return;
        }
        currentBooks = [];
        grid.innerHTML = `<div class="ebook-empty ebook-empty--error"><i class="fa-solid fa-triangle-exclamation"></i><h3>Books unavailable</h3><p>${escapeHtml(error.message || 'Please try again later.')}</p></div>`;
        resultCount.textContent = '';
        statusMessage.textContent = error.message || 'Unable to load free e-books.';
    } finally {
        setLoading(false);
        updatePagination();
    }
}

searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (isLoading) return;

    const query = searchInput.value.trim();
    if (searchInput.value && !query) {
        statusMessage.textContent = 'Enter a title or author, or clear the field for popular books.';
        searchInput.focus();
        return;
    }

    currentSearch = query;
    currentBooks = [];
    localPage = 0;
    nextApiUrl = null;
    previousApiUrl = null;
    apiResponseHistory = [];
    visiblePageNumber = 1;
    currentApiPage = 1;
    totalResults = 0;
    fetchBooks(1);
});

nextButton.addEventListener('click', async () => {
    if (isLoading || !canGoNext()) return;

    if ((localPage + 1) * BOOKS_PER_PAGE < currentBooks.length) {
        localPage += 1;
        visiblePageNumber += 1;
        renderBooks();
        document.getElementById('availableBooks').scrollIntoView({ behavior: 'smooth' });
        return;
    }

    const nextPage = getApiPage(nextApiUrl);
    if (nextPage) {
        visiblePageNumber += 1;
        await fetchBooks(nextPage, { addHistory: true });
    }
});

previousButton.addEventListener('click', () => {
    if (isLoading || !canGoPrevious()) return;

    if (localPage > 0) {
        localPage -= 1;
        visiblePageNumber -= 1;
        renderBooks();
        return;
    }

    const cached = apiResponseHistory.pop();
    if (!cached) return;
    currentBooks = cached.books;
    nextApiUrl = cached.next;
    previousApiUrl = cached.previous;
    currentApiPage = cached.apiPage;
    totalResults = cached.totalResults;
    localPage = Math.max(0, Math.ceil(currentBooks.length / BOOKS_PER_PAGE) - 1);
    visiblePageNumber = Math.max(1, visiblePageNumber - 1);
    renderBooks();
});

fetchBooks(1);

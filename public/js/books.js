let books = [];
let deleteTargetId = null;
let selectedFile = null;
let selectedPdf = null;
let categories = [];
let activeBookType = "physical";
const MAX_UPLOAD_SIZE = 35 * 1024 * 1024;
const FILE_SIZE_MESSAGE = "File size must not exceed 35 MB.";

const grid = document.getElementById("bookGrid");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const bookModal = document.getElementById("bookModal");
const bookForm = document.getElementById("bookForm");
const modalTitle = document.getElementById("modalTitle");
const deleteModal = document.getElementById("deleteModal");
const coverInput = document.getElementById("bookCover");
const coverPreview = document.getElementById("coverPreview");
const pdfInput = document.getElementById("bookPdf");
const pdfFileName = document.getElementById("pdfFileName");
const categoryInput = document.getElementById("bookCategory");
const bookTypeInput = document.getElementById("bookType");
const bookTypeToggle = document.getElementById("bookTypeToggle");
const emptyStateTitle = document.getElementById("emptyStateTitle");
const emptyStateMessage = document.getElementById("emptyStateMessage");

const urlParams = new URLSearchParams(window.location.search);
const preselectedCategoryId = urlParams.get('category_id') || urlParams.get('category');

async function loadBooks() {
    try {
        const response = await LibraryAPI.staffFetch('/api/books');
        if (!response.ok) throw new Error((await LibraryAPI.read(response)).message || 'Unable to load records.');
        books = await LibraryAPI.read(response);
        render();
    } catch (err) {
        emptyState.classList.remove('hidden');
        emptyStateTitle.textContent = 'Books unavailable';
        emptyStateMessage.textContent = err.message;
    }
}

async function loadCategories() {
    const response = await LibraryAPI.staffFetch('/api/categories');
        if (!response.ok) throw new Error((await LibraryAPI.read(response)).message || 'Unable to load records.');
    const result = await LibraryAPI.read(response).catch(() => []);
    if (!response.ok) throw new Error(result.message || 'Unable to load categories.');
    categories = result;
    categoryInput.replaceChildren(new Option('Select a category', ''));
    categories.forEach(category => categoryInput.add(new Option(category.category_name, category.category_id)));
}

function render() {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = books.filter(book => {
        const title = (book.title || "").toLowerCase();
        const description = (book.description || "").toLowerCase();
        const matchesSearch = title.includes(query) || description.includes(query);
        return (book.book_type || "physical").toLowerCase() === activeBookType
            && matchesSearch;
    });

    grid.innerHTML = "";
    if (filtered.length === 0) {
        emptyState.classList.remove("hidden");
        const label = activeBookType === "physical" ? "physical books" : "digital books";
        emptyStateTitle.textContent = `No ${label} available`;
        emptyStateMessage.textContent = query
            ? `No ${label} match “${searchInput.value.trim()}”.`
            : `There are currently no ${label} in the catalog.`;
    } else {
        emptyState.classList.add("hidden");
        filtered.forEach(book => grid.appendChild(buildCard(book)));
    }

    document.getElementById("statBookCount").textContent = books.length;
}

function selectBookType(type) {
    if (!['physical', 'digital'].includes(type) || type === activeBookType) return;
    const previousType = activeBookType;
    activeBookType = type;
    bookTypeToggle.dataset.active = type;
    bookTypeToggle.querySelectorAll('[data-book-type]').forEach(button => {
        const selected = button.dataset.bookType === type;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
    });
    grid.setAttribute('aria-labelledby', type === 'physical' ? 'physicalBooksTab' : 'digitalBooksTab');
    render();
    grid.classList.remove('book-grid-enter', 'book-grid-enter--left');
    void grid.offsetWidth;
    grid.classList.add(type === 'digital' && previousType === 'physical' ? 'book-grid-enter' : 'book-grid-enter--left');
}

bookTypeToggle.addEventListener('click', event => {
    const button = event.target.closest('[data-book-type]');
    if (button) selectBookType(button.dataset.bookType);
});

bookTypeToggle.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (bookForm.querySelector('[type=submit]').disabled) return;
    const type = event.key === 'ArrowLeft' || event.key === 'Home' ? 'physical' : 'digital';
    selectBookType(type);
    bookTypeToggle.querySelector(`[data-book-type="${type}"]`).focus();
});

function buildCard(book) {
    const card = document.createElement("div");
    card.className = "card-hover bg-white border border-[#E4D9C4] rounded-xl overflow-hidden flex flex-col";

    const coverSrc = book.cover_image || "";

    card.innerHTML = `
        ${coverSrc
            ? `<img src="${coverSrc}" class="book-cover" alt="${escapeHTML(book.title)}">`
            : `<div class="book-cover flex items-center justify-center text-[#8A7B5C] text-xs">No cover</div>`
        }
        <div class="p-5 flex flex-col justify-between flex-1">
            <div>
                <div class="flex items-start justify-between mb-2">
                    <h3 class="font-display text-lg font-semibold text-[#1B2A22]">
                        ${escapeHTML(book.title)}
                    </h3>
                    <div class="flex gap-1 shrink-0">
                        <button type="button" data-action="edit" data-id="${book.book_id}"
                            class="p-1.5 rounded hover:bg-[#F5EFE6] text-[#4A5A50]" title="Edit book">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                        <button type="button" data-action="delete" data-id="${book.book_id}"
                            class="p-1.5 rounded hover:bg-[#F5EFE6] text-[#9E4A4A]" title="Delete book">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.863a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>
                <p class="text-sm text-[#4A5A50] leading-snug">
                    ${escapeHTML(book.description || "No description yet.")}
                </p>
                ${book.pdf_file ? `<a href="${escapeHTML(book.pdf_file)}" target="_blank" rel="noopener noreferrer" class="mt-3 inline-flex items-center text-sm font-semibold text-[#8A6500] hover:underline">Open PDF</a>` : ''}
            </div>
        </div>
    `;
    return card;
}

function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
}

grid.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;

    if (button.dataset.action === "edit") {
        const book = books.find(b => String(b.book_id) === String(id));
        if (book) openModal(book);
    }
    if (button.dataset.action === "delete") {
        openDeleteModal(id);
    }
});

searchInput.addEventListener("input", render);

function openModal(book = null) {
    bookForm.reset();
    coverPreview.classList.add("hidden");
    selectedFile = null;
    selectedPdf = null;
    pdfFileName.textContent = "";
    pdfFileName.classList.add("hidden");

    document.getElementById("bookCopies").disabled = Boolean(book);
    document.getElementById("bookCopies").value = book ? Number(book.total_copies || 0) : 1;
    document.getElementById("bookCopies").title = book ? "Copy counts are set when adding a book." : "";
    document.getElementById("bookID").value = book ? book.book_id : "";
    document.getElementById("bookTitle").value = book ? book.title : "";
    document.getElementById("bookDesc").value = book ? book.description || "" : "";
    document.getElementById("bookIsbn").value = book ? book.isbn || "" : "";
    categoryInput.value = book ? String(book.category_id || '') : String(preselectedCategoryId || '');
    bookTypeInput.value = book ? String(book.book_type || 'physical').toLowerCase() : activeBookType;

    if (book && book.cover_image) {
        coverPreview.src = book.cover_image;
        coverPreview.classList.remove("hidden");
    }
    if (book && book.pdf_file) {
        pdfFileName.textContent = "Current PDF: " + book.pdf_file.split('/').pop();
        pdfFileName.classList.remove("hidden");
    }

    modalTitle.textContent = book ? "Edit Book" : "New Book";
    bookModal.classList.remove("hidden");
    document.getElementById("bookTitle").focus();
}

function closeModal() {
    bookModal.classList.add("hidden");
}

document.getElementById("openAddBtn").addEventListener("click", () => openModal());
document.getElementById("topAddBookBtn").addEventListener("click", () => openModal());
document.getElementById("openAddBtnMobile").addEventListener("click", () => openModal());
document.getElementById("emptyAddBtn").addEventListener("click", () => openModal());
document.getElementById("closeModalBtn").addEventListener("click", closeModal);
document.getElementById("cancelModalBtn").addEventListener("click", closeModal);
bookModal.addEventListener("click", event => {
    if (event.target === bookModal) closeModal();
});

coverInput.addEventListener("change", () => {
    const file = coverInput.files[0];
    if (file && file.size > MAX_UPLOAD_SIZE) {
        coverInput.value = "";
        selectedFile = null;
        coverPreview.removeAttribute("src");
        coverPreview.classList.add("hidden");
        alert(FILE_SIZE_MESSAGE);
        return;
    }
    if (file) {
        selectedFile = file;
        coverPreview.src = URL.createObjectURL(file);
        coverPreview.classList.remove("hidden");
    }
});

pdfInput.addEventListener("change", () => {
    const file = pdfInput.files[0];
    if (file && file.size > MAX_UPLOAD_SIZE) {
        pdfInput.value = "";
        selectedPdf = null;
        pdfFileName.textContent = "";
        pdfFileName.classList.add("hidden");
        alert(FILE_SIZE_MESSAGE);
        return;
    }
    selectedPdf = file || null;
    pdfFileName.textContent = file ? `Selected PDF: ${file.name}` : "";
    pdfFileName.classList.toggle("hidden", !file);
    if (file) bookTypeInput.value = 'digital';
});

bookForm.addEventListener("submit", async event => {
    event.preventDefault();

    if ((selectedFile && selectedFile.size > MAX_UPLOAD_SIZE) ||
        (selectedPdf && selectedPdf.size > MAX_UPLOAD_SIZE)) {
        alert(FILE_SIZE_MESSAGE);
        return;
    }

    const id = document.getElementById("bookID").value;
    const title = document.getElementById("bookTitle").value.trim();
    const description = document.getElementById("bookDesc").value.trim();
    const isbn = document.getElementById("bookIsbn").value.trim();
    const categoryId = categoryInput.value;
    const bookType = bookTypeInput.value;

    if (!title || !categoryId) return;

    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("isbn", isbn);
    formData.append("copies", document.getElementById("bookCopies").value || "1");
    formData.append("category_id", categoryId);
    formData.append("book_type", bookType);
    if (selectedFile) {
        formData.append("cover_image", selectedFile);
    }
    if (selectedPdf) {
        formData.append("book_pdf", selectedPdf);
    }

    const submitButton = bookForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
        const url = id ? `/api/books/${id}` : "/api/books";
        const method = id ? "PUT" : "POST";

        const response = await LibraryAPI.staffFetch(url, {
            method,
            body: formData
        });

        if (response.ok) {
            closeModal();
            await loadBooks();
        } else {
            const result = await LibraryAPI.read(response).catch(() => ({}));
            alert(result.message || "Something went wrong.");
        }
    } catch (err) {
        console.error(err);
        alert("Something went wrong. Please try again.");
    } finally {
        submitButton.disabled = false;
    }
});

function openDeleteModal(id) {
    deleteTargetId = id;
    deleteModal.classList.remove("hidden");
}

function closeDeleteModal() {
    deleteTargetId = null;
    deleteModal.classList.add("hidden");
}

document.getElementById("cancelDeleteBtn").addEventListener("click", closeDeleteModal);
deleteModal.addEventListener("click", event => {
    if (event.target === deleteModal) closeDeleteModal();
});

document.getElementById("confirmDeleteBtn").addEventListener("click", async () => {
    if (!deleteTargetId) return;

    const confirmButton = document.getElementById("confirmDeleteBtn");
    confirmButton.disabled = true;

    try {
        const response = await LibraryAPI.staffFetch(`/api/books/${deleteTargetId}`, {
            method: "DELETE"
        });

        if (response.ok) {
            closeDeleteModal();
            await loadBooks();
            return;
        }

        const contentType = response.headers.get("content-type") || "";
        const result = contentType.includes("application/json")
            ? await LibraryAPI.read(response)
            : {};
        alert(result.message || "Unable to remove the book.");
    } catch (err) {
        console.error(err);
        alert("Unable to remove the book. Please try again.");
    } finally {
        confirmButton.disabled = false;
    }
});

document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!bookModal.classList.contains("hidden")) closeModal();
    if (!deleteModal.classList.contains("hidden")) closeDeleteModal();
});

Promise.all([loadBooks(), loadCategories()]).then(() => {
    if (preselectedCategoryId) openModal();
}).catch(error => alert(error.message));

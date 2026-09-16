let categories = [];
let deleteTargetId = null;
const notify = (message, type = 'error') => window.LibrarianUI?.notify(message, type) || window.alert(message);

const grid = document.getElementById("categoryGrid");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const categoryModal = document.getElementById("categoryModal");
const categoryForm = document.getElementById("categoryForm");
const modalTitle = document.getElementById("modalTitle");
const deleteModal = document.getElementById("deleteModal");

async function loadCategories() {
    try {
        const response = await LibraryAPI.staffFetch('/api/categories');
        if (!response.ok) throw new Error((await LibraryAPI.read(response)).message || 'Unable to load records.');
        categories = await LibraryAPI.read(response);
        render();
    } catch (err) {
        emptyState.classList.remove('hidden');
        emptyState.querySelector('p').textContent = err.message;
    }
}

function render() {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = categories.filter(category => {
        const name = category.category_name.toLowerCase();
        const description = (category.description || "").toLowerCase();
        return name.includes(query) || description.includes(query);
    });

    grid.innerHTML = "";
    if (filtered.length === 0) {
        emptyState.classList.remove("hidden");
    } else {
        emptyState.classList.add("hidden");
        filtered.forEach(category => grid.appendChild(buildCard(category)));
    }

    document.getElementById("statCatCount").textContent = categories.length;
    const totalBooks = categories.reduce((total, c) => total + Number(c.book_count || 0), 0);
    document.getElementById("statBookCount").textContent = totalBooks;
}

function buildCard(category) {
    const card = document.createElement("div");
    card.className = "card-hover bg-white border border-[#E4D9C4] rounded-xl p-5 flex flex-col justify-between";
    card.innerHTML = `
        <div>
            <div class="flex items-start justify-between mb-3">
                <span class="inline-block w-10 h-10 rounded-lg" style="background: ${category.color}"></span>
                <div class="flex gap-1">
                    <button type="button" data-action="edit" data-id="${category.category_id}"
                        class="p-1.5 rounded hover:bg-[#F5EFE6] text-[#4A5A50]" title="Edit category">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                    <button type="button" data-action="delete" data-id="${category.category_id}"
                        class="p-1.5 rounded hover:bg-[#F5EFE6] text-[#9E4A4A]" title="Delete category">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.863a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>
            <h3 class="font-display text-lg font-semibold text-[#1B2A22] mb-1">
                ${escapeHTML(category.category_name)}
            </h3>
            <p class="text-sm text-[#4A5A50] leading-snug">
                ${escapeHTML(category.description || "No description yet.")}
            </p>
        </div>
        <div class="mt-4 pt-4 border-t border-[#F0E9DA] flex items-center justify-between">
            <span class="text-xs uppercase tracking-wide text-[#8A7B5C]">On shelf</span>
            <span class="number-font text-[#1B4332]">${Number(category.book_count || 0)}</span>
        </div>
        <a href="/librarian/books?category_id=${category.category_id}"
           class="mt-3 block text-center bg-[#1B4332] hover:bg-[#163A29] text-white text-sm font-semibold py-2 rounded-md transition">
            + Add Book
        </a>
    `;
    return card;
}

function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
}

grid.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;

    if (button.dataset.action === "edit") {
        const category = categories.find(c => String(c.category_id) === String(id));
        if (category) openModal(category);
    }
    if (button.dataset.action === "delete") {
        openDeleteModal(id);
    }
});

searchInput.addEventListener("input", render);

function openModal(category = null) {
    categoryForm.reset();
    document.getElementById("categoryID").value = category ? category.category_id : "";
    document.getElementById("categoryName").value = category ? category.category_name : "";
    document.getElementById("categoryDesc").value = category ? category.description : "";
    document.getElementById("categoryColor").value = category ? category.color : "#1B4332";
    modalTitle.textContent = category ? "Edit Category" : "New Category";
    categoryModal.classList.remove("hidden");
    document.getElementById("categoryName").focus();
}

function closeModal() {
    categoryModal.classList.add("hidden");
}

document.getElementById("openAddBtn").addEventListener("click", () => openModal());
document.getElementById("topAddCategoryBtn").addEventListener("click", () => openModal());
document.getElementById("openAddBtnMobile").addEventListener("click", () => openModal());
document.getElementById("emptyAddBtn").addEventListener("click", () => openModal());
document.getElementById("closeModalBtn").addEventListener("click", closeModal);
document.getElementById("cancelModalBtn").addEventListener("click", closeModal);
categoryModal.addEventListener("click", event => {
    if (event.target === categoryModal) closeModal();
});

categoryForm.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = categoryForm.querySelector('[type=submit]');
    if (submit.disabled) return;
    const id = document.getElementById("categoryID").value;
    const category_name = document.getElementById("categoryName").value.trim();
    const description = document.getElementById("categoryDesc").value.trim();
    const color = document.getElementById("categoryColor").value;

    if (!category_name) return;
    submit.disabled = true;

    try {
        const url = id ? `/api/categories/${id}` : "/api/categories";
        const method = id ? "PUT" : "POST";

        const response = await LibraryAPI.staffFetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category_name, description, color })
        });

        if (response.ok) {
            closeModal();
            await loadCategories();
            notify(id ? 'Category updated successfully.' : 'Category added successfully.', 'success');
        } else {
            const result = await LibraryAPI.read(response);
            notify(result.message || "Something went wrong.");
        }
    } catch (err) {
        console.error(err);
        notify("Something went wrong. Please try again.");
    } finally { submit.disabled = false; }
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
    const button = document.getElementById('confirmDeleteBtn');
    if (!deleteTargetId || button.disabled) return;
    button.disabled = true;

    try {
        const response = await LibraryAPI.staffFetch(`/api/categories/${deleteTargetId}`, {
            method: "DELETE"
        });

        if (response.ok) {
            closeDeleteModal();
            await loadCategories();
            notify('Category removed successfully.', 'success');
        } else { notify((await LibraryAPI.read(response)).message || "Unable to remove this category."); }
    } catch (err) {
        notify("Unable to remove this category. Please try again.");
    } finally { button.disabled = false; }
});

document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!categoryModal.classList.contains("hidden")) closeModal();
    if (!deleteModal.classList.contains("hidden")) closeDeleteModal();
});

window.addEventListener('pageshow', () => {
    searchInput.value = '';
    loadCategories();
});

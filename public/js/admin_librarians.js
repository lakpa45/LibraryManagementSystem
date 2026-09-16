const librarianTableBody = document.getElementById('librarianTableBody');
const librarianEmptyState = document.getElementById('librarianEmptyState');
const librarianFilter = document.getElementById('librarianFilter');
const librarianModal = document.getElementById('librarianModal');
const librarianForm = document.getElementById('librarianForm');
const librarianMessage = document.getElementById('librarianMessage');
const saveLibrarianButton = document.getElementById('saveLibrarianButton');
const librarianNotice = document.getElementById('librarianNotice');
const removingLibrarians = new Set();

let librarians = [];

const adminHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('adminToken') || ''}`
});

const escapeLibrarianHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

function renderLibrarians() {
    const query = librarianFilter.value.trim().toLowerCase();
    const filtered = librarians.filter((item) =>
        item.name.toLowerCase().includes(query) || item.email.toLowerCase().includes(query)
    );

    librarianEmptyState.classList.toggle('hidden', filtered.length > 0);
    librarianTableBody.innerHTML = filtered.map((item) => `
        <tr>
            <td>${escapeLibrarianHtml(item.name)}</td>
            <td>${escapeLibrarianHtml(item.email)}</td>
            <td>${escapeLibrarianHtml(item.phone || 'Not provided')}</td>
            <td><button type="button" class="librarian-remove" data-remove-librarian="${item.librarian_id}" aria-label="Remove ${escapeLibrarianHtml(item.name)}" ${removingLibrarians.has(item.librarian_id) ? 'disabled' : ''}>${removingLibrarians.has(item.librarian_id) ? 'Removing...' : 'Remove'}</button></td>
        </tr>
    `).join('');
}

function showLibrarianNotice(message, error = false) {
    librarianNotice.textContent = message;
    librarianNotice.className = `form-message librarian-notice form-message--${error ? 'error' : 'success'}`;
}

librarianTableBody.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-remove-librarian]');
    if (!button) return;
    const id = Number(button.dataset.removeLibrarian);
    if (removingLibrarians.has(id)) return;
    if (!window.confirm('Are you sure you want to remove this librarian?')) return;
    removingLibrarians.add(id);
    renderLibrarians();
    try {
        const response = await LibraryAPI.staffFetch(`/api/admin/librarians/${id}`, {
            method: 'DELETE', headers: adminHeaders()
        });
        const data = await LibraryAPI.read(response);
        if (!response.ok) throw new Error(data.message || 'Unable to remove librarian.');
        librarians = librarians.filter((item) => item.librarian_id !== id);
        showLibrarianNotice(data.message);
    } catch (error) {
        showLibrarianNotice(error.message, true);
    } finally {
        removingLibrarians.delete(id);
        renderLibrarians();
        // Restore keyboard focus after replacing the affected row.
        (librarianTableBody.querySelector(`[data-remove-librarian="${id}"]`) ||
            librarianTableBody.querySelector('[data-remove-librarian]') ||
            document.getElementById('openLibrarianModal')).focus();
    }
});

async function loadLibrarians() {
    librarianTableBody.innerHTML = '<tr><td colspan="4" class="loading-cell">Loading librarians...</td></tr>';
    try {
        const response = await LibraryAPI.staffFetch('/api/librarians', { headers: adminHeaders() });
        const data = await LibraryAPI.read(response);
        if (!response.ok) throw new Error(data.message || 'Unable to load librarians.');
        librarians = Array.isArray(data) ? data : [];
        renderLibrarians();
    } catch (error) {
        librarianTableBody.innerHTML = `<tr><td colspan="4" class="loading-cell loading-cell--error">${escapeLibrarianHtml(error.message)}</td></tr>`;
    }
}

function openLibrarianModal() {
    librarianForm.reset();
    librarianMessage.textContent = '';
    librarianModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.getElementById('librarianName').focus();
}

function closeLibrarianModal() {
    librarianModal.classList.add('hidden');
    document.body.style.overflow = '';
}

document.getElementById('openLibrarianModal').addEventListener('click', openLibrarianModal);
document.getElementById('closeLibrarianModal').addEventListener('click', closeLibrarianModal);
document.getElementById('cancelLibrarianModal').addEventListener('click', closeLibrarianModal);
librarianModal.addEventListener('click', (event) => {
    if (event.target === librarianModal) closeLibrarianModal();
});
librarianFilter.addEventListener('input', renderLibrarians);

librarianForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saveLibrarianButton.disabled) return;
    librarianMessage.textContent = '';

    const formData = new FormData(librarianForm);
    const password = String(formData.get('password') || '');
    const confirmPassword = String(formData.get('confirmPassword') || '');
    if (password !== confirmPassword) {
        librarianMessage.textContent = 'Passwords do not match.';
        librarianMessage.className = 'form-message form-message--error';
        return;
    }

    saveLibrarianButton.disabled = true;
    saveLibrarianButton.textContent = 'Adding...';
    try {
        const response = await LibraryAPI.staffFetch('/api/librarians', {
            method: 'POST',
            headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: String(formData.get('name') || '').trim(),
                email: String(formData.get('email') || '').trim(),
                phone: String(formData.get('phone') || '').trim(),
                password
            })
        });
        const data = await LibraryAPI.read(response);
        if (!response.ok) throw new Error(data.message || 'Unable to add librarian.');

        librarians.push(data.librarian);
        librarians.sort((a, b) => a.name.localeCompare(b.name));
        renderLibrarians();
        librarianMessage.textContent = data.message;
        librarianMessage.className = 'form-message form-message--success';
        setTimeout(closeLibrarianModal, 700);
    } catch (error) {
        librarianMessage.textContent = error.message;
        librarianMessage.className = 'form-message form-message--error';
    } finally {
        saveLibrarianButton.disabled = false;
        saveLibrarianButton.textContent = 'Add Librarian';
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !librarianModal.classList.contains('hidden')) {
        closeLibrarianModal();
    }
});

document.querySelector('[data-admin-logout]').addEventListener('click', async (event) => {
    event.preventDefault();
    try { await LibraryAPI.staffFetch('/api/auth/logout', { method: 'POST' }); } catch (error) { console.error('Server sign-out failed:', error); }
    localStorage.removeItem('adminToken');
    localStorage.removeItem('librarianToken');
    window.location.href = '/';
});

loadLibrarians();
